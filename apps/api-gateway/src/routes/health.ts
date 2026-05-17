/**
 * /healthz — public liveness endpoint.
 *
 * Returns a tiny JSON document. No DB / Valkey / NATS calls — the goal
 * is "the process is alive and HTTP-able". Deeper readiness checks live
 * elsewhere (e.g. /readyz could ping each datastore; not implemented in
 * v0.1 because Caddy + compose only need liveness).
 */

import { Hono } from "hono";
import type { RequestIdVars } from "../middleware/requestId.js";

type RouterEnv = { Variables: RequestIdVars };

/** Build the health router. */
export function healthRouter(): Hono<RouterEnv> {
  const r = new Hono<RouterEnv>();

  r.get("/healthz", (c) => {
    return c.json(
      {
        status: "ok",
        service: "api-gateway",
        version: "0.2.5",
        timestamp: new Date().toISOString(),
      },
      200
    );
  });

  return r;
}
