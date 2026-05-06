/**
 * /metrics — Prometheus scrape endpoint.
 *
 * IMPORTANT: in production this should only be reachable on the
 * internal Docker network — Caddy does NOT proxy /metrics through to
 * the public internet. Defence-in-depth: even if it leaks externally,
 * everything we expose is non-sensitive aggregate data (no IPs, no
 * share IDs, no user info — see lib/metrics.ts for the cardinality
 * discipline).
 */

import { Hono } from "hono";
import { registry } from "../lib/metrics.js";

/** Build the Prometheus metrics router. */
export function metricsRouter(): Hono {
  const r = new Hono();

  r.get("/metrics", async (c) => {
    const body = await registry.metrics();
    // Prometheus expects text/plain with the version header it knows.
    c.header("content-type", registry.contentType);
    return c.body(body, 200);
  });

  return r;
}
