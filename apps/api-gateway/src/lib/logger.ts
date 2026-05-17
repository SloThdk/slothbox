/**
 * Pino logger singleton.
 *
 * One process-wide pino instance. Pretty printing in development for
 * human-readable output, JSON in production for log aggregation
 * (Loki/Promtail picks structured fields for free).
 *
 * SECURITY: never log raw request bodies, share short IDs alongside
 * client PII (IP, user-agent), or anything from the Authorization
 * header. The route handlers redact deliberately; do not expand the log
 * surface without thinking through what an attacker reading logs would
 * learn.
 */

import { pino, type Logger } from "pino";
import { config, isProduction } from "./config.js";

/**
 * Build the root logger. The transport is wired only in development —
 * in production we emit raw JSON to stdout so Promtail can ship lines
 * to Loki without re-parsing.
 */
function createLogger(): Logger {
  const baseOptions = {
    level: config.LOG_LEVEL,
    base: {
      service: "api-gateway",
      version: "0.2.4",
      env: config.NODE_ENV,
    },
    // ISO-8601 timestamps so they sort lexicographically.
    timestamp: pino.stdTimeFunctions.isoTime,
    // Pino redacts these paths in any log record before serialisation.
    // Belt-and-braces: the route code already avoids logging sensitive
    // fields, but this catches accidental future surfacing. Every
    // capability that a Loki reader should NEVER see goes here. When
    // adding a new field that carries a token / hash / credential,
    // extend this list in the same PR.
    redact: {
      paths: [
        // ── Headers carrying auth state or session secrets ───────
        'req.headers["authorization"]',
        'req.headers["cookie"]',
        'req.headers["set-cookie"]',
        'req.headers["x-api-key"]',
        'req.headers["x-auth-token"]',
        'req.headers["proxy-authorization"]',
        // ── Body fields with E2E crypto / lifecycle capabilities ─
        "req.body.encryptedMeta",
        "req.body.fileHash",
        "req.body.passwordSalt",
        "req.body.revokeTokenHash",
        "req.body.downloadTokenHash",
        "req.body.chunkTokens",
        // ── Wildcard catches across nested objects (responses,
        //    errors, structured fields, etc.) ───────────────────
        "*.password",
        "*.passwordKey",
        "*.token",
        "*.revokeToken",
        "*.chunkToken",
        "*.downloadToken",
        "*.secret",
        "*.privateKey",
        "*.apiKey",
        "*.fragmentKey",
        "*.aeadKey",
      ],
      remove: true,
    },
  };

  if (isProduction) {
    return pino(baseOptions);
  }

  // pino-pretty is wired through the transport API so we don't pay the
  // pretty-printing cost in production builds.
  return pino({
    ...baseOptions,
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "HH:MM:ss.l",
        ignore: "pid,hostname,service,version,env",
        singleLine: false,
      },
    },
  });
}

/**
 * Process-wide logger. Importers should use child loggers for per-route
 * or per-component context, e.g. `logger.child({ route: "shares" })`.
 */
export const logger: Logger = createLogger();
