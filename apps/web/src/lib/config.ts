// Single source of truth for runtime URLs.
//
// `NEXT_PUBLIC_*` vars are inlined at build time by Next.js. The fallbacks here
// match the docker-compose defaults so a dev who forgets to copy `.env.example`
// to `.env` still gets a working local stack.

import { publicEnv } from "./utils";

export const API_URL = publicEnv("NEXT_PUBLIC_API_URL", "http://localhost:3022");
export const WS_URL = publicEnv("NEXT_PUBLIC_WS_URL", "ws://localhost:3022");
export const INGEST_URL = publicEnv(
  "NEXT_PUBLIC_INGEST_URL",
  "http://localhost:3023",
);
export const PUBLIC_URL = publicEnv(
  "NEXT_PUBLIC_PUBLIC_URL",
  "http://localhost:3021",
);

export const MAX_FILE_SIZE_MB = Number.parseInt(
  publicEnv("NEXT_PUBLIC_MAX_FILE_SIZE_MB", "4096"),
  10,
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
  "Send any file. We can't read it. Verify the math yourself.";
export const APP_VERSION = "0.1.0-alpha.1";
