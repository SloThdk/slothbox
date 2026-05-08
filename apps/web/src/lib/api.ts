// Typed REST client for the API gateway (apps/api-gateway).
//
// Contract is the source-of-truth shape from `apps/api-gateway/src/routes/shares.ts`.
// All requests go to `${API_URL}/api/...` (the gateway mounts the shares router at /api).
//
// Endpoints used by v0.1.0-alpha:
//   POST   /api/shares                         create a share descriptor (server returns uploadUrls)
//   GET    /api/shares/:shortId                fetch share metadata (NOT chunks)
//   POST   /api/shares/:shortId/destroy        manually destroy the share
//   POST   /api/shares/:shortId/downloaded     called by receiver after successful decrypt
//                                              (gateway atomically increments download_count
//                                               and flips state=destroyed when burn-after-read)
//
// Chunks are uploaded to / fetched from the ingest service directly (see upload.ts /
// download.ts) — the gateway is the metadata + lifecycle authority and never touches
// ciphertext.

import { z } from "zod";
import { API_URL } from "./config";

// ---------------------------------------------------------------------------
// Public types — mirror the gateway's CreateShareSchema and GET response.
// ---------------------------------------------------------------------------

export interface CreateShareRequest {
  /** Plaintext file size in bytes (server stores as bigint). */
  fileSize: number;
  /** BLAKE2b-256 of the plaintext, base64url-encoded (32 bytes after decode). */
  fileHash: string;
  /** AEAD-encrypted metadata blob (filename + mime + extras), base64url. */
  encryptedMeta: string;
  /** XChaCha20-Poly1305 nonce for `encryptedMeta`, base64url (24 bytes). */
  nonceMeta: string;
  /** Number of ciphertext chunks (each up to chunkSize bytes). */
  chunkCount: number;
  /** Configured chunk size — must be ≤ gateway's MAX_CHUNK_SIZE_BYTES. */
  chunkSize: number;
  /** ISO-8601 expiry timestamp; must be in the future and within MAX_SHARE_TTL_DAYS. */
  expiresAt: string;
  /** When true, downloading once flips state=destroyed via increment_download. */
  burnAfterRead: boolean;
  /** Optional cap on number of downloads (null = unlimited within expiry). */
  maxDownloads: number | null;
}

export interface CreateShareResponse {
  /** Internal UUID — used by the gateway for joins / NATS pub/sub. */
  shareId: string;
  /** Public URL-safe identifier — what travels in `slothbox.philipsloth.com/s/<shortId>`. */
  shortId: string;
  /**
   * Per-chunk PUT URLs the client streams ciphertext to. Built by the gateway
   * against `INGEST_PUBLIC_URL` so the client doesn't need to know the host.
   */
  uploadUrls: string[];
}

/** Shape returned by GET /api/shares/:shortId. fileSize comes back as a string
 *  (gateway serialises bigint → string for JSON safety). */
export interface ShareDescriptor {
  shortId: string;
  expiresAt: string;
  burnAfterRead: boolean;
  fileSize: string;
  encryptedMeta: string;
  nonceMeta: string;
  chunkCount: number;
  chunkSize: number;
  state: "pending" | "uploading" | "ready" | "downloaded" | "expired" | "destroyed";
}

// ---------------------------------------------------------------------------
// Zod schemas — runtime validation at every trust boundary.
// ---------------------------------------------------------------------------

const CreateShareResponseSchema: z.ZodType<CreateShareResponse> = z.object({
  shareId: z.string().min(1),
  shortId: z.string().min(1).max(64),
  uploadUrls: z.array(z.string().url()),
});

const ShareDescriptorSchema: z.ZodType<ShareDescriptor> = z.object({
  shortId: z.string().min(1).max(64),
  expiresAt: z.string().datetime({ offset: true }),
  burnAfterRead: z.boolean(),
  fileSize: z.string().regex(/^\d+$/, "fileSize must be a stringified integer"),
  encryptedMeta: z.string().min(1),
  nonceMeta: z.string().min(1),
  chunkCount: z.number().int().positive(),
  chunkSize: z.number().int().positive(),
  state: z.enum(["pending", "uploading", "ready", "downloaded", "expired", "destroyed"]),
});

const StateOnlyResponseSchema = z.object({
  state: z.enum(["pending", "uploading", "ready", "downloaded", "expired", "destroyed"]),
});

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * Thrown by every helper in this module. Wraps a network or HTTP error with
 * enough context that the UI can render a generic "couldn't reach the server"
 * message without leaking the underlying cause.
 */
export class ApiError extends Error {
  public readonly status: number;
  public override readonly cause: unknown;

  constructor(message: string, status: number, cause?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.cause = cause;
  }
}

// ---------------------------------------------------------------------------
// Internal fetch wrapper
// ---------------------------------------------------------------------------

async function request<T>(path: string, init: RequestInit, schema: z.ZodType<T>): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(init.headers ?? {}),
      },
    });
  } catch (err) {
    // Network-layer failure (DNS, refused, offline). Surface a generic message;
    // the underlying cause is attached for logging without leaking to the user.
    throw new ApiError("could not reach the SlothBox gateway", 0, err);
  }

  if (!response.ok) {
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      // Body wasn't JSON — fine, we'll throw a generic error.
    }
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      typeof (payload as { error: unknown }).error === "string"
        ? (payload as { error: string }).error
        : `gateway returned HTTP ${response.status}`;
    throw new ApiError(message, response.status, payload);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (err) {
    throw new ApiError("gateway returned malformed JSON", response.status, err);
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError("gateway response failed schema validation", response.status, parsed.error);
  }
  return parsed.data;
}

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

/**
 * Create a share metadata record. The server returns the share ID, short ID,
 * and per-chunk upload URLs the client uses to stream ciphertext to ingest.
 */
export async function createShare(body: CreateShareRequest): Promise<CreateShareResponse> {
  return request(
    "/api/shares",
    {
      method: "POST",
      body: JSON.stringify(body),
    },
    CreateShareResponseSchema
  );
}

/**
 * Fetch share metadata. Used by the receiver page to know how many chunks to
 * pull and the encrypted metadata blob to decrypt for filename/mime info.
 */
export async function getShare(shortId: string): Promise<ShareDescriptor> {
  return request(
    `/api/shares/${encodeURIComponent(shortId)}`,
    { method: "GET" },
    ShareDescriptorSchema
  );
}

/**
 * Notify the gateway that the receiver successfully downloaded all chunks.
 * The gateway atomically increments download_count and (when the share is
 * burn-after-read) transitions state=destroyed. The reaper then purges the
 * encrypted blobs from MinIO on its next sweep.
 *
 * Idempotent on the client side — if the call fails we don't surface an
 * error to the user (the share will still expire on its TTL).
 */
export async function markDownloaded(
  shortId: string
): Promise<{ state: ShareDescriptor["state"] }> {
  return request(
    `/api/shares/${encodeURIComponent(shortId)}/downloaded`,
    { method: "POST" },
    StateOnlyResponseSchema
  );
}

/**
 * Manually destroy the share — used by the sender from a future dashboard
 * (v0.5+). For v0.1 it's exposed as the explicit "burn now" action.
 */
export async function destroyShare(shortId: string): Promise<{ state: ShareDescriptor["state"] }> {
  return request(
    `/api/shares/${encodeURIComponent(shortId)}/destroy`,
    { method: "POST" },
    StateOnlyResponseSchema
  );
}

/**
 * Health-check the gateway. Used only by the connectivity badge on the
 * receiver page; failures here are non-fatal.
 */
export async function pingGateway(): Promise<boolean> {
  try {
    const r = await fetch(`${API_URL}/healthz`, { method: "GET" });
    return r.ok;
  } catch {
    return false;
  }
}
