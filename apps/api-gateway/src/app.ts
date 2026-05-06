/**
 * Hono app builder.
 *
 * The app is built in a function so tests can spawn fresh instances
 * without process-wide state leaks. Middleware is registered in the
 * order documented in the route spec:
 *
 *   1. Request ID
 *   2. CORS
 *   3. Security headers (skip CSP — only frontend sets it)
 *   4. Pino request logger
 *   5. (Per-route) rate limiter
 *   6. Routes
 *   7. Error handler (registered via app.onError)
 *
 * The /metrics endpoint is mounted on a separate sub-router that
 * skips the request logger / CORS — Prometheus scrapes are noisy and
 * don't need cross-origin handling.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import type { ServerType } from "@hono/node-server";
import { config, isProduction } from "./lib/config.js";
import { logger } from "./lib/logger.js";
import { httpRequestDurationSeconds, httpRequestsTotal, statusClass } from "./lib/metrics.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { requestIdMiddleware, type RequestIdVars } from "./middleware/requestId.js";
import { healthRouter } from "./routes/health.js";
import { metricsRouter } from "./routes/metrics.js";
import { sharesRouter } from "./routes/shares.js";
import { attachProgressWs } from "./ws/progress.js";

/** Hono app with the request-id var attached to every context. */
export type AppEnv = { Variables: RequestIdVars };

/**
 * Build a fully-wired Hono app. Returns the app plus the WS injector
 * which the entry point must hand to `serve(...).on("upgrade", ...)`.
 */
export function buildApp(): {
  app: Hono<AppEnv>;
  injectWebSocket: (server: ServerType) => void;
} {
  const app = new Hono<AppEnv>();

  // ── 1. Request ID (must run first) ────────────────────────────
  app.use("*", requestIdMiddleware);

  // ── 2. CORS ───────────────────────────────────────────────────
  app.use(
    "*",
    cors({
      origin: (origin) => {
        if (!origin) return null;
        return config.API_CORS_ORIGIN.includes(origin) ? origin : null;
      },
      credentials: true,
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["content-type", "x-request-id", "authorization"],
      exposeHeaders: ["x-request-id", "retry-after"],
      maxAge: 600,
    })
  );

  // ── 3. Security headers ───────────────────────────────────────
  // The API itself doesn't render HTML so no CSP is needed; lock
  // every other header to a strict default. The frontend (apps/web)
  // is responsible for its own CSP.
  app.use(
    "*",
    secureHeaders({
      contentSecurityPolicy: false, // frontend owns CSP
      crossOriginEmbedderPolicy: "require-corp",
      crossOriginOpenerPolicy: "same-origin",
      crossOriginResourcePolicy: "same-site",
      originAgentCluster: "?1",
      referrerPolicy: "no-referrer",
      strictTransportSecurity: isProduction
        ? "max-age=63072000; includeSubDomains; preload"
        : undefined,
      xContentTypeOptions: "nosniff",
      xFrameOptions: "DENY",
      xPermittedCrossDomainPolicies: "none",
      xXssProtection: "0",
    })
  );

  // ── 4. Request logger (and metrics) ───────────────────────────
  app.use("*", async (c, next) => {
    // Skip noisy paths from logs — keep them in metrics, drop them
    // from line-shipped logs to Loki.
    const skipLog = c.req.path === "/healthz" || c.req.path === "/metrics";
    const start = process.hrtime.bigint();
    const requestId = c.get("requestId");
    await next();
    const status = c.res.status;
    const durationSec =
      Number(process.hrtime.bigint() - start) / 1_000_000_000;
    const route = c.req.routePath ?? c.req.path;
    const method = c.req.method;
    const cls = statusClass(status);

    httpRequestsTotal.inc({ method, route, status_class: cls });
    httpRequestDurationSeconds.observe({ method, route, status_class: cls }, durationSec);

    if (!skipLog) {
      logger.info(
        {
          requestId,
          method,
          path: c.req.path,
          route,
          status,
          durationMs: Math.round(durationSec * 1000),
        },
        "request"
      );
    }
  });

  // ── 5. Routes ─────────────────────────────────────────────────
  // Public liveness + Prometheus.
  app.route("/", healthRouter());
  app.route("/", metricsRouter());

  // Versioned API surface — the frontend talks to /api/* so Caddy
  // can route by prefix. Hono nests routers cleanly here.
  app.route("/api", sharesRouter());

  // WebSocket upgrade endpoint.
  const { injectWebSocket } = attachProgressWs(app);

  // 404 fallback — every other path is unknown.
  app.notFound((c) => {
    return c.json(
      {
        error: {
          code: "not_found",
          message: "route not found",
          requestId: c.get("requestId"),
        },
      },
      404
    );
  });

  // ── 6. Error handler ──────────────────────────────────────────
  app.onError(errorHandler);

  return { app, injectWebSocket };
}
