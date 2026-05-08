/**
 * Centralised, zod-validated environment configuration.
 *
 * Every environment variable the API gateway needs is declared here. The
 * schema is parsed once at module-load time; if any required value is
 * missing or invalid, the process exits before the HTTP server ever binds
 * a port. This is deliberate — silently failing on bad config in
 * production is one of the easiest ways to ship a broken service.
 *
 * Anywhere else in the codebase, import { config } from "./lib/config.js"
 * instead of reaching into process.env directly. That keeps env access
 * typed, audited, and grep-able.
 */

import { z } from "zod";

/**
 * Zod schema describing every environment variable the gateway reads.
 *
 * Keep this in sync with:
 *   - docker-compose.yml (api-gateway environment block)
 *   - .env.example at the repo root
 *   - the deployment playbook in docs/
 */
const ConfigSchema = z.object({
  // ─── Runtime ───────────────────────────────────────────────────
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  // ─── HTTP server ───────────────────────────────────────────────
  /** Port the public-facing gateway binds. Caddy reverse-proxies to this. */
  API_PORT: z.coerce.number().int().positive().default(3022),
  /** Host interface to bind. 0.0.0.0 inside Docker, 127.0.0.1 on bare metal. */
  API_HOST: z.string().default("0.0.0.0"),
  /**
   * Allowed CORS origin for the web frontend. Single origin only — no
   * wildcards, never `*` with credentials. Multiple origins should be a
   * comma-separated list (parsed below).
   */
  API_CORS_ORIGIN: z
    .string()
    .default("http://localhost:3021")
    .transform((raw) =>
      raw
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    ),

  // ─── Datastores ────────────────────────────────────────────────
  /** Postgres connection string. Drizzle uses postgres-js under the hood. */
  DATABASE_URL: z.string().url(),
  /** Valkey/Redis connection string. ioredis handles re-connect logic. */
  REDIS_URL: z.string().url(),
  /** NATS pub/sub URL (used heavily from v0.5+; v0.1 just connects + pings). */
  NATS_URL: z.string().url(),

  // ─── Auth ──────────────────────────────────────────────────────
  /**
   * Shared secret used to sign anonymous-share access cookies and HMAC
   * presigned upload URLs. v0.1 doesn't use it for routing — it's
   * required at startup so that v0.5 auth can land without a config
   * migration. Must be at least 32 chars.
   */
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),

  // ─── Logging ───────────────────────────────────────────────────
  /** Pino log level. trace|debug|info|warn|error|fatal. */
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),

  // ─── Rate limiting (sliding-window via Valkey) ─────────────────
  /** Anonymous: max share creates per IP per minute. */
  RATE_LIMIT_CREATE_PER_MINUTE: z.coerce.number().int().positive().default(10),
  /** Anonymous: max share creates per IP per day. */
  RATE_LIMIT_CREATE_PER_DAY: z.coerce.number().int().positive().default(100),
  /** Generic per-IP read ceiling (applied to /api/shares/:id reads). */
  RATE_LIMIT_READ_PER_MINUTE: z.coerce.number().int().positive().default(120),

  // ─── Service URLs (for upload-URL generation) ─────────────────
  /**
   * Base URL the frontend uses to PUT chunks to the .NET ingest service.
   * Caddy strips /api when proxying — the gateway emits absolute URLs the
   * browser can fetch directly. Defaults are the local dev compose layout.
   */
  INGEST_PUBLIC_URL: z.string().url().default("http://localhost:3023"),

  // ─── Limits ────────────────────────────────────────────────────
  /**
   * Maximum share lifetime (days) — enforced at create time.
   *
   * Default lowered from 30 → 7 in 2026-05-08 abuse-hardening. The
   * higher 30-day ceiling is still available via env override for
   * legitimate need, but the default-at-rest exposure is now bounded
   * to one week. Lowering the default cuts the worst-case attacker
   * storage-squat ceiling by ~4× without any UX impact for the typical
   * "send a file, recipient downloads within a couple of days" flow.
   */
  MAX_SHARE_TTL_DAYS: z.coerce.number().int().positive().default(7),
  /** Maximum chunk size (bytes) — defends against accidental huge requests. */
  MAX_CHUNK_SIZE_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(10 * 1024 * 1024),
  /**
   * Maximum total ciphertext storage per share (bytes). Mirrors the
   * client-side 4 GB cap so the server is never the more-permissive
   * side of the contract.
   *
   * Why this matters: without this, the previous Zod schema permitted
   * `chunkCount.max(100_000) * chunkSize.max(10MB)` = 1 TB declared
   * per share. Combined with the 100 shares/day/IP create cap, a
   * single attacker IP could squat ~3 TB/day for the share's TTL —
   * filling the host disk and OOM-killing Postgres.
   *
   * The cap applies to BOTH the plaintext `fileSize` AND the ciphertext
   * `chunkCount * chunkSize` product. AEAD overhead per chunk is
   * 40 bytes (24-byte XChaCha20 nonce + 16-byte Poly1305 tag), which
   * is well under 0.1% of a 4 GB upload at any sane chunk size — so
   * a single ceiling for both is honest.
   */
  MAX_FILE_SIZE_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(4 * 1024 * 1024 * 1024), // 4 GB
  /**
   * Per-IP WebSocket connection cap. Anonymous WS connections to the
   * progress stream are otherwise free to open in unbounded numbers,
   * letting an attacker squat file descriptors / NATS subscriptions.
   * 20 is generous for a real user (one progress stream per active
   * upload, capped at a handful of parallel uploads from one machine);
   * 1000 simultaneous from one IP is a script.
   */
  WS_MAX_CONNECTIONS_PER_IP: z.coerce.number().int().positive().default(20),
});

export type Config = z.infer<typeof ConfigSchema>;

/**
 * Parse `process.env` once at module load. If validation fails, log a
 * structured error and exit non-zero. This MUST happen synchronously so
 * that nothing else in the process imports a half-initialised config.
 */
function loadConfig(): Config {
  const result = ConfigSchema.safeParse(process.env);
  if (!result.success) {
    // Stderr only — pino isn't wired yet at this point in the boot
    // sequence, and we want the exit message to land on stderr regardless
    // of whatever logger config the operator chose.
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    process.stderr.write(
      `\n[api-gateway] FATAL: invalid environment configuration:\n${issues}\n\n`
    );
    process.exit(1);
  }
  return result.data;
}

/**
 * Validated, frozen application config. Import this anywhere instead of
 * touching `process.env` directly.
 */
export const config: Readonly<Config> = Object.freeze(loadConfig());

/**
 * Convenience flag — many places want a boolean, not a string check.
 */
export const isProduction = config.NODE_ENV === "production";
