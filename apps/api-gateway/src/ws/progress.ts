/**
 * WebSocket /ws/progress?shareId=...
 *
 * v0.1 contract (deliberately minimal):
 *   - Client opens WS, server upgrades.
 *   - Client sends `{ chunkIndex, status }` per chunk; server validates
 *     and echoes back `{ ok: true, chunkIndex, status }`.
 *   - Server emits `{ type: "ack", at }` heartbeats every 30s.
 *
 * v0.5 expansion: subscribe to a NATS subject keyed by shareId and
 * fan progress updates out across all gateway instances so dashboards
 * can mirror upload state. The subject naming is reserved here:
 *   slothbox.share.<shareId>.progress
 *
 * SECURITY (2026-05-08 abuse-hardening pass):
 *   - shareId regex matches the REAL nanoid alphabet from
 *     routes/shares.ts (was a permissive `[A-Za-z0-9_-]{1,64}`
 *     before this pass — accepted any garbage shape).
 *   - Share must EXIST in the DB before the upgrade is fully
 *     accepted — async lookup at onOpen, close 1008 if not found.
 *     Closes the "open thousands of WS sockets with random valid-
 *     looking shortIds" abuse path.
 *   - Per-IP connection cap (config.WS_MAX_CONNECTIONS_PER_IP).
 *     In-process Map; honest for v0.1's single-gateway-instance
 *     deployment. v0.5 horizontal-scale will need to move this to
 *     Valkey alongside the rate-limit counters.
 */

import { z } from "zod";
import type { WSContext } from "hono/ws";
import { createNodeWebSocket } from "@hono/node-ws";
import type { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getDb, shares } from "@slothbox/db";
import { config } from "../lib/config.js";
import { logger } from "../lib/logger.js";
import type { RequestIdVars } from "../middleware/requestId.js";

/** Hono env shared with the rest of the app. */
type AppEnv = { Variables: RequestIdVars };

/**
 * Per-IP open-WebSocket counter. Incremented when a connection is
 * accepted post share-existence check, decremented on close. Single-
 * process scope; that's the honest v0.1 shape. Migrate to Valkey when
 * more than one gateway instance fronts the same Caddy.
 *
 * Map entries with a count of 0 are deleted to bound memory growth —
 * a single attacker IP can't accumulate map entries beyond the cap,
 * and entries are pruned the moment all their connections close.
 */
const wsConnectionsByIp = new Map<string, number>();

/**
 * Extract the requester's IP from the upgrade request headers. Mirrors
 * the rateLimit middleware's resolution chain so per-IP limits and the
 * WS connection cap target the same identity. Caddy is the only
 * ingress and rewrites x-forwarded-for, so trusting it is correct.
 */
function clientIpFromHeaders(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "0.0.0.0";
}

/**
 * Build a {@link createNodeWebSocket}-compatible upgrade handler and
 * attach it to the supplied Hono app under `/ws/progress`.
 *
 * The function returns the `injectWebSocket` callback the entry
 * point must invoke against the Node `Server` after `serve()`.
 */
export function attachProgressWs(app: Hono<AppEnv>): {
  injectWebSocket: ReturnType<typeof createNodeWebSocket>["injectWebSocket"];
} {
  const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

  // Body of every text frame we accept from the client.
  const ProgressFrameSchema = z.object({
    chunkIndex: z.number().int().nonnegative().max(100_000),
    status: z.enum(["uploading", "complete"]),
  });

  // 256-byte cap on inbound frame size — defends against memory abuse
  // through a never-ending text stream. JSON for valid payloads is
  // always under 50 bytes.
  const MAX_FRAME_BYTES = 256;

  // shareId regex matches the canonical alphabet + length from
  // routes/shares.ts (SHORT_ID_ALPHABET + SHORT_ID_LENGTH=12). Earlier
  // permissive `[A-Za-z0-9_-]{1,64}` accepted any 1-64-char garbage
  // string — closed by the 2026-05-08 hardening pass.
  const SHARE_ID = /^[abcdefghjkmnpqrstuvwxyz23456789]{12}$/;

  app.get(
    "/ws/progress",
    upgradeWebSocket((c) => {
      const shareId = c.req.query("shareId");
      const requestId = c.get("requestId") ?? "ws";
      const ip = clientIpFromHeaders(c.req.raw.headers);

      if (!shareId || !SHARE_ID.test(shareId)) {
        // Reject early: the WS adapter will still complete the
        // upgrade handshake with the events we hand back, so we
        // close inside onOpen.
        return {
          onOpen(_evt: unknown, ws: WSContext) {
            ws.close(1008, "missing or invalid shareId");
          },
          onClose() {
            // Empty by design — onOpen already closed the socket.
          },
        };
      }

      // Per-IP connection cap. Reject BEFORE the upgrade is committed
      // so we never increment the counter for a connection we're not
      // going to honour. The map stores the running count; absent
      // entry implies 0 prior connections.
      const currentForIp = wsConnectionsByIp.get(ip) ?? 0;
      if (currentForIp >= config.WS_MAX_CONNECTIONS_PER_IP) {
        logger.warn(
          {
            requestId,
            ip,
            shareId,
            current: currentForIp,
            cap: config.WS_MAX_CONNECTIONS_PER_IP,
            event: "ws_per_ip_cap_exceeded",
          },
          "ws connection rejected — per-IP cap exceeded"
        );
        return {
          onOpen(_evt: unknown, ws: WSContext) {
            // 1013 = "try again later" — semantically correct for a
            // capacity-exhausted reject. Browsers surface this to
            // event.code in onclose.
            ws.close(1013, "per-IP connection cap reached");
          },
          onClose() {},
        };
      }

      // 30s heartbeat so idle proxies don't kill the connection.
      let heartbeat: NodeJS.Timeout | null = null;
      // Tracks whether THIS handler incremented the counter — used by
      // onClose to know whether to decrement (so the early-reject
      // paths above don't false-decrement on close of a never-counted
      // connection).
      let counted = false;

      return {
        async onOpen(_evt: Event, ws: WSContext) {
          // Verify the share actually exists before we accept the
          // upload-progress channel. Closes the "open thousands of WS
          // sockets with random valid-looking shortIds" abuse path
          // and is cheap (PK lookup, ~1 ms locally).
          //
          // We accept the share row in any state — including
          // 'destroyed' — because legitimate clients may still be
          // streaming progress messages while the destroy webhook is
          // mid-flight. The semantics here are "is this a real
          // shareId" not "is the share active right now".
          try {
            const db = getDb();
            const found = await db
              .select({ id: shares.id })
              .from(shares)
              .where(eq(shares.shortId, shareId))
              .limit(1);
            if (found.length === 0) {
              ws.close(1008, "shareId not found");
              return;
            }
          } catch (err) {
            // Soft-fail: if the DB is unreachable, close with a
            // try-again hint rather than letting a bug paper over the
            // existence check. We deliberately do NOT default-allow
            // here — accepting unverified shareIds during a Postgres
            // outage would re-open the abuse vector at the worst
            // possible time.
            logger.error(
              {
                requestId,
                shareId,
                err: { message: (err as Error).message },
                event: "ws_share_lookup_failed",
              },
              "ws share-exists lookup failed"
            );
            ws.close(1011, "share verification failed");
            return;
          }

          // Share is real — count the connection toward the per-IP
          // cap, start the heartbeat, send the hello.
          wsConnectionsByIp.set(ip, currentForIp + 1);
          counted = true;
          logger.debug({ requestId, ip, shareId, event: "ws_open" }, "ws opened");
          heartbeat = setInterval(() => {
            try {
              ws.send(JSON.stringify({ type: "ack", at: Date.now() }));
            } catch (err) {
              logger.warn(
                { requestId, err: { message: (err as Error).message } },
                "ws heartbeat send failed"
              );
            }
          }, 30_000);
          ws.send(JSON.stringify({ type: "hello", shareId }));
        },
        onMessage(evt: MessageEvent, ws: WSContext) {
          const raw = typeof evt.data === "string" ? evt.data : null;
          if (raw === null) {
            ws.close(1003, "binary frames not supported");
            return;
          }
          if (raw.length > MAX_FRAME_BYTES) {
            ws.close(1009, "frame too large");
            return;
          }

          let parsed: unknown;
          try {
            parsed = JSON.parse(raw);
          } catch {
            ws.send(JSON.stringify({ ok: false, error: "invalid JSON" }));
            return;
          }

          const result = ProgressFrameSchema.safeParse(parsed);
          if (!result.success) {
            ws.send(
              JSON.stringify({
                ok: false,
                error: "invalid frame",
                details: result.error.issues.map((i) => i.message),
              })
            );
            return;
          }

          // v0.1: echo back. v0.5: publish to NATS subject
          // `slothbox.share.<shareId>.progress` for cross-instance
          // fan-out.
          ws.send(
            JSON.stringify({
              ok: true,
              chunkIndex: result.data.chunkIndex,
              status: result.data.status,
            })
          );
        },
        onClose(_evt, _ws: WSContext) {
          if (heartbeat) {
            clearInterval(heartbeat);
            heartbeat = null;
          }
          // Decrement the per-IP counter only when this handler
          // actually incremented it (post share-existence check).
          // The early-reject paths set counted = false so they don't
          // accidentally drive the counter below zero.
          if (counted) {
            const next = (wsConnectionsByIp.get(ip) ?? 1) - 1;
            if (next <= 0) {
              wsConnectionsByIp.delete(ip);
            } else {
              wsConnectionsByIp.set(ip, next);
            }
          }
          logger.debug({ requestId, ip, shareId, event: "ws_close" }, "ws closed");
        },
        onError(_evt: Event, _ws: WSContext) {
          logger.warn({ requestId, shareId, event: "ws_error" }, "ws error event");
        },
      };
    })
  );

  return { injectWebSocket };
}
