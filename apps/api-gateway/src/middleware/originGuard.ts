// Origin guard — CSRF defence-in-depth beyond CORS preflight.
//
// CORS preflight already requires the browser to send an OPTIONS probe
// for `application/json` POSTs, which our `cors()` middleware rejects
// for any origin outside API_CORS_ORIGIN. So for the JSON-body path
// CORS is the primary defence.
//
// BUT: simple-cors requests (GET/HEAD, and POST with text/plain or
// application/x-www-form-urlencoded) bypass preflight entirely. An
// attacker page can submit such a request and the browser sends it
// with the attacker's Origin attached -- without preflight, our CORS
// middleware never runs.
//
// This middleware adds a belt-and-braces check on every
// state-changing method: if the request carries an Origin header that
// is NOT in API_CORS_ORIGIN, reject 403 before the route handler
// runs. Missing Origin is allowed (server-to-server calls, curl, etc.
// don't set one and the route's own auth gates handle them).
//
// Scope: the gateway uses path-scoped registration; we mount this on
// /api/* so the /metrics and /healthz endpoints stay un-gated.
// /api/csp-report is also exempt because browsers post CSP reports
// without a sensible Origin (often the violating page's, which is
// orthogonal to our origin trust set).

import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { config } from "../lib/config.js";
import { logger } from "../lib/logger.js";

const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const EXEMPT_PATHS = new Set(["/api/csp-report"]);

export const originGuard = createMiddleware(async (c, next) => {
  const method = c.req.method.toUpperCase();
  if (!STATE_CHANGING_METHODS.has(method)) {
    return next();
  }
  if (EXEMPT_PATHS.has(c.req.path)) {
    return next();
  }

  const origin = c.req.header("origin");
  if (origin && !config.API_CORS_ORIGIN.includes(origin)) {
    logger.warn(
      {
        component: "originGuard",
        origin,
        method,
        path: c.req.path,
      },
      "origin guard: rejected mismatched origin"
    );
    throw new HTTPException(403, { message: "origin not allowed" });
  }

  await next();
});
