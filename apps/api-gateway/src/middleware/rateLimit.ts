/**
 * Sliding-window rate limiting backed by Valkey.
 *
 * Algorithm: a Redis sorted set per (bucket, identity). Each request
 * adds an entry timestamped to the millisecond, then we ZREMRANGEBYSCORE
 * to drop entries outside the window and ZCARD to count remaining ones.
 * If the count exceeds the limit, we reject with 429.
 *
 * Trade-offs:
 *   - True sliding window (not just fixed window) — no edge bursts.
 *   - O(log n) per request — fine for our volumes.
 *   - Fail-open: if Valkey is unreachable, requests pass. Logged loudly.
 *
 * Identity is the requester's IP, derived from `x-forwarded-for` (Caddy
 * sets this) with a sane fallback. Behind Caddy in our prod compose,
 * the leftmost IP is the original client.
 *
 * SECURITY: rate-limit keys are namespaced per bucket so a flood on one
 * endpoint can't starve another. Limits live in `config.ts` so an ops
 * tweak doesn't require a code change.
 */

import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { getRedis } from "../lib/redis.js";
import { logger } from "../lib/logger.js";
import { config } from "../lib/config.js";
import { rateLimitedTotal } from "../lib/metrics.js";
import type { RequestIdVars } from "./requestId.js";

/** A single sliding-window rule applied per identity. */
export type RateLimitRule = {
  /** Logical bucket name (used in Valkey key + metric label). */
  bucket: string;
  /** Window length in milliseconds. */
  windowMs: number;
  /** Max requests permitted within the window. */
  max: number;
};

/**
 * Extract the requester's IP for rate-limit keying.
 *
 * Threat model: in the canonical production topology Caddy is the only
 * ingress, runs on a Docker bridge, and strips inbound `X-Forwarded-For`
 * before writing its own. So XFF's leftmost entry is the real client and
 * we can trust it.
 *
 * If the gateway is ever exposed directly to untrusted clients (a
 * misconfigured Docker port mapping, a debug tunnel, a second ingress
 * that doesn't rewrite XFF), an attacker can send `X-Forwarded-For:
 * 1.2.3.4` and have us key the rate limit on the spoofed value — they
 * rotate it per request and the per-IP buckets never fire.
 *
 * Defence: the `TRUST_FORWARDED_FOR` env var (audit Finding #5). When
 * `false`, this function ignores XFF entirely and uses only the socket
 * remote address — an attacker can't spoof the TCP source IP without
 * BGP-level routing access, so per-IP buckets fire correctly.
 */
function clientIp(headers: Headers, socketRemoteAddr: string, fallback: string): string {
  if (config.TRUST_FORWARDED_FOR) {
    const xff = headers.get("x-forwarded-for");
    if (xff) {
      // Leftmost is the original client. Trim whitespace.
      const first = xff.split(",")[0]?.trim();
      if (first) return first;
    }
    const realIp = headers.get("x-real-ip");
    if (realIp) return realIp.trim();
  }
  if (socketRemoteAddr) return socketRemoteAddr;
  return fallback;
}

/**
 * Run all provided rules in order, rejecting on the first one that
 * trips. We deliberately serialise this — the call counts are tiny
 * and parallelising hides which bucket actually fired in metrics.
 */
async function evaluate(
  identity: string,
  rules: readonly RateLimitRule[],
  requestId: string
): Promise<{ tripped: RateLimitRule | null }> {
  const redis = getRedis();
  const nowMs = Date.now();

  for (const rule of rules) {
    const key = `rl:${rule.bucket}:${identity}`;
    const member = `${nowMs}:${requestId}`;
    const cutoff = nowMs - rule.windowMs;

    try {
      // Pipeline: trim → add → count → expire.
      // - ZREMRANGEBYSCORE drops timestamps outside the window.
      // - ZADD records this attempt.
      // - ZCARD gives the count post-add (so a single request counts).
      // - PEXPIRE bounds memory if the bucket goes idle.
      const pipeline = redis.pipeline();
      pipeline.zremrangebyscore(key, 0, cutoff);
      pipeline.zadd(key, nowMs, member);
      pipeline.zcard(key);
      pipeline.pexpire(key, rule.windowMs);
      const results = await pipeline.exec();

      if (!results) continue; // pipeline returned no info — fail open

      // results layout: [[err, val], ...]; we want the ZCARD result (index 2).
      const zcardEntry = results[2];
      if (!zcardEntry) continue;
      const [err, count] = zcardEntry;
      if (err) continue;
      const numericCount = typeof count === "number" ? count : Number(count);
      if (Number.isFinite(numericCount) && numericCount > rule.max) {
        return { tripped: rule };
      }
    } catch (err) {
      // Fail-open: log and let the request through. Better to serve
      // traffic than to 500 every request when rate-limiting infra
      // is down.
      logger.warn(
        {
          requestId,
          bucket: rule.bucket,
          err: { message: (err as Error).message },
        },
        "rate limiter Valkey error — failing open"
      );
      return { tripped: null };
    }
  }

  return { tripped: null };
}

/**
 * Build a Hono middleware that applies one or more sliding-window
 * limits to every request. Identity is the client IP.
 *
 * @example
 *   app.post("/api/shares", rateLimit([
 *     { bucket: "create_minute", windowMs: 60_000,        max: 10  },
 *     { bucket: "create_day",    windowMs: 86_400_000,    max: 100 },
 *   ]), handler)
 */
export function rateLimit(rules: readonly RateLimitRule[]) {
  return createMiddleware<{ Variables: RequestIdVars }>(async (c, next) => {
    const requestId = c.get("requestId") ?? "unknown";
    // The @hono/node-server adapter exposes the raw IncomingMessage
    // on c.env.incoming. We pull the socket remote address from there
    // so clientIp() can fall back to it when TRUST_FORWARDED_FOR=false.
    // `c.env` is typed as unknown in Hono core; the cast is local and
    // intentional — see the audit Finding #5 note in clientIp().
    const incoming = (c.env as { incoming?: { socket?: { remoteAddress?: string } } })?.incoming;
    const socketRemoteAddr = incoming?.socket?.remoteAddress ?? "";
    const identity = clientIp(c.req.raw.headers, socketRemoteAddr, "0.0.0.0");

    // Observability for the fail-closed-on-shared-bucket case. If both
    // XFF is disabled AND the socket has no remoteAddress (theoretical
    // under @hono/node-server, but possible if the middleware is ever
    // remounted on a path where the underlying transport isn't an HTTP
    // socket), every request ends up keyed on `0.0.0.0` and one noisy
    // client can starve everyone else's bucket. Log loud so the
    // operator notices in Loki before the rate-limit goes silently
    // shared. Audit v0.2.4 F2.
    if (identity === "0.0.0.0") {
      logger.warn(
        {
          requestId,
          component: "rateLimit",
          trustForwardedFor: config.TRUST_FORWARDED_FOR,
          socketRemoteAddr,
          xffPresent: c.req.raw.headers.has("x-forwarded-for"),
        },
        "rate-limit identity fell back to 0.0.0.0 — shared bucket risk"
      );
    }

    const { tripped } = await evaluate(identity, rules, requestId);
    if (tripped) {
      rateLimitedTotal.inc({ bucket: tripped.bucket });
      // Surface a Retry-After hint — coarse, but sufficient for the UX.
      c.header("retry-after", String(Math.ceil(tripped.windowMs / 1000)));
      throw new HTTPException(429, {
        message: `Too many requests in window for ${tripped.bucket}`,
      });
    }

    await next();
  });
}
