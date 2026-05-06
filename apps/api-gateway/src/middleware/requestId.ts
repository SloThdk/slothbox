/**
 * Request-ID middleware.
 *
 * Attaches a stable, per-request identifier to every request so that
 * logs, error responses, and downstream service calls can be correlated.
 *
 * Behaviour:
 *   - If the client sent `x-request-id`, trust it (constrained: must be
 *     1–128 chars and match a safe regex). Trusting client values
 *     simplifies tracing through Caddy → gateway → ingest.
 *   - Otherwise generate a fresh `crypto.randomUUID()`.
 *   - Always echo the value back as `x-request-id` on the response so
 *     the client can reference it in support tickets.
 *   - Stash it on `c.var.requestId` for downstream middleware/handlers.
 */

import { createMiddleware } from "hono/factory";
import { randomUUID } from "node:crypto";

/** Hono context variables this middleware contributes. */
export type RequestIdVars = {
  requestId: string;
};

/** Conservative format check — refuse pathological client-supplied IDs. */
const SAFE_ID = /^[A-Za-z0-9_.-]{1,128}$/;

/**
 * Hono middleware that ensures every request has a `requestId`.
 */
export const requestIdMiddleware = createMiddleware<{ Variables: RequestIdVars }>(
  async (c, next) => {
    const incoming = c.req.header("x-request-id");
    const id =
      incoming && SAFE_ID.test(incoming) ? incoming : randomUUID();

    c.set("requestId", id);
    c.header("x-request-id", id);

    await next();
  }
);
