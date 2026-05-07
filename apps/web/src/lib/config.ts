// Single source of truth for runtime URLs.
//
// CRITICAL: these reads MUST be literal `process.env.NEXT_PUBLIC_*` accesses,
// NOT dynamic indexing like `process.env[name]`. Next.js's webpack inliner
// only replaces static accesses at parse time — dynamic indexing falls
// through to a runtime read of process.env, which is empty in browser-side
// code, so the fallback always wins. We had a `publicEnv(name, fallback)`
// helper before that broke the inliner; do not re-introduce it.
//
// `NEXT_PUBLIC_*` vars are baked at BUILD TIME by Next.js. The Dockerfile
// passes them through as ARG + ENV so docker compose's build.args block can
// inject the correct values for each environment (localhost in dev, the
// real domain in prod).
//
// Fallbacks default to bare `http://localhost` (no port) — that's the
// production-shape URL via Caddy reverse proxy, which works in BOTH local
// dev (Caddy on :80) and production (Caddy on :443 with HSTS upgrade). The
// internal service ports (:3022 api-gateway, :3023 ingest) are NEVER bound
// to the host and must NOT appear in browser-side URLs — every browser
// request flows through Caddy at /api/*, /chunk/*, /ws/*.

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost";
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost";
export const INGEST_URL = process.env.NEXT_PUBLIC_INGEST_URL || "http://localhost";
export const PUBLIC_URL = process.env.NEXT_PUBLIC_PUBLIC_URL || "http://localhost";

export const MAX_FILE_SIZE_MB = Number.parseInt(
  process.env.NEXT_PUBLIC_MAX_FILE_SIZE_MB || "4096",
  10
);
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

/**
 * 5 MiB — matches `INGEST_CHUNK_SIZE_BYTES` in the monorepo `.env.example` and
 * the chunk-size assumed by `services/ingest`. If you change this you MUST
 * update the gateway and ingest configs to match — the value is part of the
 * AAD binding via `chunkIndex` arithmetic.
 */
export const CHUNK_SIZE_BYTES = 5 * 1024 * 1024;

/**
 * GitHub link, surfaced from a single constant so legal / footer / about pages
 * never drift.
 */
export const GITHUB_URL = "https://github.com/SloThdk/slothbox";

/**
 * App identity used in headings, copy, OG metadata.
 */
export const APP_NAME = "SlothBox";
export const APP_TAGLINE =
  "Send any file. The server cannot read it. The full source code is open and auditable.";
export const APP_VERSION = "0.1.0-alpha.1";
