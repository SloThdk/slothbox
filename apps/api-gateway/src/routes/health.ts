/**
 * /healthz — public liveness endpoint.
 *
 * Returns a tiny JSON document. No DB / Valkey / NATS calls — the goal
 * is "the process is alive and HTTP-able". Deeper readiness checks live
 * elsewhere (e.g. /readyz could ping each datastore; not implemented in
 * v0.1 because Caddy + compose only need liveness).
 */

import { Hono } from "hono";

/** Build the health router. */
export function healthRouter(): Hono {
  const r = new Hono();

  r.get("/healthz", (c) => {
    return c.json(
      {
        status: "ok",
        service: "api-gateway",
        version: "0.1.0-alpha.1",
        timestamp: new Date().toISOString(),
      },
      200
    );
  });

  return r;
}
