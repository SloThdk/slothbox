/**
 * Singleton Valkey/Redis client (ioredis).
 *
 * Used for:
 *   - Sliding-window rate limiting buckets
 *   - Short-lived cache entries (share metadata reads)
 *   - Pub/sub notifications between gateway instances
 *
 * The connection is lazy — first call to {@link getRedis} establishes
 * it, subsequent calls reuse it. Reconnect/back-off is delegated to
 * ioredis defaults, which are sensible for our load profile.
 */

import { Redis } from "ioredis";
import { config } from "./config.js";
import { logger } from "./logger.js";

let _client: Redis | null = null;

/**
 * Get the process-wide Valkey client, opening it on first use.
 *
 * @returns connected ioredis client
 */
export function getRedis(): Redis {
  if (_client) return _client;

  _client = new Redis(config.REDIS_URL, {
    // Keep retries bounded so a flapping Valkey doesn't make every
    // request hang. The rate-limit middleware fails-open if Redis is
    // unreachable — we'd rather serve traffic than 500 every request
    // when the only failure is rate-limit accounting.
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
    connectTimeout: 5_000,
    // Mark the client name in CLIENT LIST output for ops grepability.
    connectionName: "api-gateway",
  });

  _client.on("connect", () => {
    logger.info({ component: "redis" }, "valkey connected");
  });
  _client.on("ready", () => {
    logger.debug({ component: "redis" }, "valkey ready");
  });
  _client.on("error", (err) => {
    // Don't log full stack on every retry — that floods logs when the
    // service is briefly down. Pino handles serialisation cleanly.
    logger.error(
      { component: "redis", err: { message: err.message, code: (err as { code?: string }).code } },
      "valkey error"
    );
  });
  _client.on("close", () => {
    logger.warn({ component: "redis" }, "valkey connection closed");
  });

  return _client;
}

/**
 * Cleanly drain the Redis connection. Called from the shutdown handler.
 */
export async function closeRedis(): Promise<void> {
  if (!_client) return;
  try {
    await _client.quit();
  } catch (err) {
    logger.warn(
      { component: "redis", err: { message: (err as Error).message } },
      "valkey quit failed"
    );
  } finally {
    _client = null;
  }
}
