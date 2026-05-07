/**
 * Singleton NATS client.
 *
 * v0.1 contract: connect on boot, ping on /healthz (caller decides), and
 * expose the connection for v0.5 work which will use it heavily for:
 *   - Reaper signalling (burn-after-read fires → reaper deletes blob NOW)
 *   - WebSocket progress fan-out across multiple gateway instances
 *   - Receipt service pub/sub for delivery confirmation
 *
 * For v0.1 the client is established lazily and surfaces errors but
 * never throws synchronously — losing NATS doesn't take down the
 * critical share-create path.
 */

import { connect, type NatsConnection } from "nats";
import { config } from "./config.js";
import { logger } from "./logger.js";

let _connection: NatsConnection | null = null;
let _connecting: Promise<NatsConnection | null> | null = null;

/**
 * Open the NATS connection lazily. Returns null if NATS is unreachable —
 * callers must handle that case (most call sites just log and continue).
 */
export async function getNats(): Promise<NatsConnection | null> {
  if (_connection) return _connection;
  if (_connecting) return _connecting;

  _connecting = (async () => {
    try {
      const nc = await connect({
        servers: config.NATS_URL,
        name: "api-gateway",
        reconnect: true,
        maxReconnectAttempts: -1, // unlimited
        reconnectTimeWait: 2_000,
        timeout: 5_000,
      });
      _connection = nc;
      logger.info({ component: "nats", server: nc.getServer() }, "nats connected");

      // Detach a status watcher so we can log reconnects without forcing
      // every caller to await it.
      void (async () => {
        for await (const status of nc.status()) {
          logger.info({ component: "nats", type: status.type, data: status.data }, "nats status");
        }
      })();

      // When the connection closes for good (drain or fatal error) we
      // null out the singleton so the next getNats() call retries.
      void nc.closed().then((err) => {
        _connection = null;
        if (err) {
          logger.warn(
            { component: "nats", err: { message: err.message } },
            "nats connection closed with error"
          );
        } else {
          logger.info({ component: "nats" }, "nats connection closed");
        }
      });

      return nc;
    } catch (err) {
      logger.error(
        { component: "nats", err: { message: (err as Error).message } },
        "nats connect failed"
      );
      _connection = null;
      return null;
    } finally {
      _connecting = null;
    }
  })();

  return _connecting;
}

/**
 * Drain the NATS connection. Should be called from the shutdown handler.
 */
export async function closeNats(): Promise<void> {
  if (!_connection) return;
  try {
    await _connection.drain();
  } catch (err) {
    logger.warn(
      { component: "nats", err: { message: (err as Error).message } },
      "nats drain failed"
    );
  } finally {
    _connection = null;
  }
}
