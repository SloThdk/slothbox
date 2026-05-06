/**
 * SlothBox API gateway entry point.
 *
 * Boot order (synchronous chunks first, then datastore warmups):
 *   1. Validate environment via lib/config.ts (process.exit on failure).
 *   2. Build the Hono app + middleware/routes.
 *   3. Open the Node HTTP server on API_PORT.
 *   4. Inject WebSocket support against the upgrade event.
 *   5. Best-effort connect to NATS (non-fatal if unreachable).
 *   6. Wire SIGTERM/SIGINT handlers so Docker stops are graceful.
 *
 * Long-running connections (Postgres, Valkey, NATS) are opened lazily
 * by the libs that own them — that way the HTTP server can answer
 * /healthz before every datastore is ready, which keeps Caddy from
 * gating the whole compose stack on a slow DB warmup.
 */

import { serve } from "@hono/node-server";
import { buildApp } from "./app.js";
import { config } from "./lib/config.js";
import { logger } from "./lib/logger.js";
import { closeRedis, getRedis } from "./lib/redis.js";
import { closeNats, getNats } from "./lib/nats.js";
import { closeDb } from "@slothbox/db";

/** Top-level boot sequence. Throws on fatal startup failures. */
async function main(): Promise<void> {
  const { app, injectWebSocket } = buildApp();

  // serve() returns a Node `Server`. We pass a callback so we can
  // log the bound address with the structured logger instead of the
  // adapter's default console line.
  const server = serve(
    {
      fetch: app.fetch,
      port: config.API_PORT,
      hostname: config.API_HOST,
    },
    (info) => {
      logger.info(
        {
          address: info.address,
          port: info.port,
          family: info.family,
        },
        "api-gateway listening"
      );
    }
  );

  // Wire WebSocket upgrades into the same server.
  injectWebSocket(server);

  // Eagerly open Valkey so the first request doesn't pay the
  // connection round-trip. This call is synchronous in ioredis.
  getRedis();

  // NATS is best-effort — log on failure, do not crash the boot.
  void getNats().then((nc) => {
    if (!nc) {
      logger.warn({ component: "nats" }, "nats unavailable at boot — proceeding without it");
    }
  });

  // ── Graceful shutdown ────────────────────────────────────────
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    logger.info({ signal }, "shutdown signal received");

    // Stop accepting new connections.
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    }).catch((err: unknown) => {
      logger.warn(
        { err: { message: (err as Error).message } },
        "server.close failed (continuing shutdown)"
      );
    });

    // Drain datastores in parallel.
    await Promise.allSettled([closeRedis(), closeNats(), closeDb()]);
    logger.info("shutdown complete");
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  // Last-resort safety nets — log unhandled rejections and uncaught
  // exceptions before Node's own default tears the process down.
  process.on("unhandledRejection", (reason) => {
    logger.fatal({ reason: String(reason) }, "unhandled rejection — exiting");
    process.exit(1);
  });
  process.on("uncaughtException", (err) => {
    logger.fatal(
      {
        err: { message: err.message, stack: err.stack, name: err.name },
      },
      "uncaught exception — exiting"
    );
    process.exit(1);
  });
}

main().catch((err: unknown) => {
  // pino may not be initialised if the failure is in config parsing,
  // but config.ts already exits in that case before we get here.
  logger.fatal(
    {
      err: {
        message: (err as Error).message,
        stack: (err as Error).stack,
      },
    },
    "fatal startup error"
  );
  process.exit(1);
});
