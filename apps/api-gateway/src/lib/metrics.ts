/**
 * Prometheus metrics registry.
 *
 * One `Registry` per process. Default Node runtime metrics
 * (event loop lag, GC pauses, heap, RSS, FDs) are auto-collected.
 *
 * Custom metric naming follows Prometheus conventions:
 *   slothbox_api_<noun>_<unit_or_total>{labels}
 *
 * Counters get the `_total` suffix; histograms expose `_seconds` /
 * `_bytes` units. Cardinality stays low — no IPs, no share IDs in
 * labels (those would explode the time-series count).
 */

import { Counter, Histogram, Registry, collectDefaultMetrics } from "prom-client";

/** The single, process-wide Prometheus registry. */
export const registry = new Registry();

// Pull in default Node/process metrics — no extra setup needed.
collectDefaultMetrics({ register: registry, prefix: "slothbox_api_" });

/**
 * Total HTTP requests served, broken down by route, method, status class.
 * Status is bucketed (`2xx`, `3xx`, `4xx`, `5xx`) instead of exact code
 * to keep cardinality bounded.
 */
export const httpRequestsTotal = new Counter({
  name: "slothbox_api_http_requests_total",
  help: "Total HTTP requests handled by the API gateway",
  labelNames: ["method", "route", "status_class"] as const,
  registers: [registry],
});

/** Request latency histogram (seconds) for p50/p95/p99 dashboards. */
export const httpRequestDurationSeconds = new Histogram({
  name: "slothbox_api_http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status_class"] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

/** Counts share-create attempts so we can alert on suspicious spikes. */
export const sharesCreatedTotal = new Counter({
  name: "slothbox_api_shares_created_total",
  help: "Successful share creates",
  labelNames: ["burn_after_read"] as const,
  registers: [registry],
});

/** Counts share lookups so we can spot scraping. */
export const sharesFetchedTotal = new Counter({
  name: "slothbox_api_shares_fetched_total",
  help: "Share metadata fetches",
  labelNames: ["outcome"] as const, // hit | miss | expired | destroyed
  registers: [registry],
});

/** Counts manual destroy + burn-after-read fires. */
export const sharesDestroyedTotal = new Counter({
  name: "slothbox_api_shares_destroyed_total",
  help: "Shares moved into the destroyed state",
  labelNames: ["reason"] as const, // burn | manual | expiry
  registers: [registry],
});

/** Counts rate-limit rejections — sharp drops/spikes are ops-relevant. */
export const rateLimitedTotal = new Counter({
  name: "slothbox_api_rate_limited_total",
  help: "Requests rejected by the rate limiter",
  labelNames: ["bucket"] as const, // create_minute | create_day | read_minute
  registers: [registry],
});

/**
 * Map an exact HTTP status code to a coarse status class label.
 * Keeps Prometheus cardinality manageable.
 */
export function statusClass(status: number): "2xx" | "3xx" | "4xx" | "5xx" | "1xx" {
  if (status >= 500) return "5xx";
  if (status >= 400) return "4xx";
  if (status >= 300) return "3xx";
  if (status >= 200) return "2xx";
  return "1xx";
}
