// Typed REST client for the API gateway (apps/api-gateway).
//
// Contract is the source-of-truth shape from `apps/api-gateway/src/routes/shares.ts`.
// All requests go to `${API_URL}/api/...` (the gateway mounts the shares router at /api).
//
// Endpoints used by the v0.2 line:
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
  /**
   * Per-share password protection (v0.2). All four fields are
   * all-or-nothing: either every field is set with `passwordProtected = true`,
   * or every field is omitted with `passwordProtected = false`. The gateway
   * rejects half-populated requests at the Zod boundary.
   *
   * The password itself NEVER appears in this payload. The sender's
   * browser ran Argon2id locally and combined the output with the URL
   * fragment to derive the AEAD key — the server only stores the salt +
   * cost parameters so the recipient can re-derive after entering the
   * password into the password-prompt UI.
   */
  passwordProtected: boolean;
  /** 16-byte Argon2id salt, base64url. Present iff `passwordProtected`. */
  passwordSalt?: string;
  /** Argon2id `opsLimit` (1-10). Present iff `passwordProtected`. */
  passwordKdfOpsLimit?: number;
  /** Argon2id `memLimit` in KiB (8 MiB – 1 GiB). Present iff `passwordProtected`. */
  passwordKdfMemLimitKib?: number;
  /**
   * Sender-revoke token COMMITMENT (v0.2, migration 0006).
   *
   * Base64url-encoded SHA-256 (32 bytes after decode) of the
   * sender-generated 32-byte raw revoke token. The raw token is
   * NEVER part of any request — it stays in the sender's browser
   * `localStorage` under the SlothBox origin and re-appears only as
   * the bearer credential on the destroy endpoint.
   *
   * Optional in the schema so a future server-side abuse-tooling
   * path can create rows without a token, but every sender-initiated
   * POST through the web app MUST send this field — without it, the
   * share is non-revocable and can only be destroyed via TTL / burn.
   */
  revokeTokenHash?: string;
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

/**
 * Password-protection facet on the descriptor. Discriminated-union shape
 * so callers can't read `salt` without first having narrowed `enabled`
 * to `true`. Mirrors the gateway's JSON output of the same shape.
 */
export type SharePasswordFacet =
  | { enabled: false }
  | {
      enabled: true;
      /** Base64url Argon2id salt (16 bytes when decoded). */
      salt: string;
      /** Argon2id `opsLimit`. */
      opsLimit: number;
      /** Argon2id `memLimit` in KiB. */
      memLimitKib: number;
    };

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
  /** Password-protection facet — discriminated union (see `SharePasswordFacet`). */
  password: SharePasswordFacet;
}

// ---------------------------------------------------------------------------
// Zod schemas — runtime validation at every trust boundary.
// ---------------------------------------------------------------------------

const CreateShareResponseSchema: z.ZodType<CreateShareResponse> = z.object({
  shareId: z.string().min(1),
  shortId: z.string().min(1).max(64),
  uploadUrls: z.array(z.string().url()),
});

/**
 * Discriminated-union schema for the password facet. Using
 * `z.discriminatedUnion` (rather than two `z.object` schemas glued with
 * `z.union`) means TypeScript narrows correctly when the consumer
 * checks `descriptor.password.enabled` — the `salt` field becomes
 * accessible only inside the `true` branch.
 */
const SharePasswordFacetSchema = z.discriminatedUnion("enabled", [
  z.object({ enabled: z.literal(false) }),
  z.object({
    enabled: z.literal(true),
    salt: z.string().min(1).max(64),
    opsLimit: z.number().int().min(1).max(10),
    memLimitKib: z.number().int().min(8192).max(1_048_576),
  }),
]);

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
  password: SharePasswordFacetSchema,
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
    // The gateway emits two response shapes for non-2xx:
    //   1. {"error": "string message"}         — older Hono error path
    //   2. {"error": {"code": "...", "message": "...", "requestId": "..."}}
    //                                          — current Zod-validation path
    // Surface the most-specific message we can find so the user sees
    // something actionable ("file too large", "expiresAt cannot be more
    // than 7 days from now") instead of the previous generic "gateway
    // returned HTTP 400" that bricked debugging.
    let message = `gateway returned HTTP ${response.status}`;
    if (typeof payload === "object" && payload !== null && "error" in payload) {
      const err = (payload as { error: unknown }).error;
      if (typeof err === "string") {
        message = err;
      } else if (
        typeof err === "object" &&
        err !== null &&
        "message" in err &&
        typeof (err as { message: unknown }).message === "string"
      ) {
        message = (err as { message: string }).message;
      }
    }
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
 * Manually destroy the share. As of v0.2 / migration 0006, this requires
 * the sender-held 32-byte revoke token (base64url-encoded) that the
 * browser saved to `localStorage` at share-create time. The gateway
 * hashes the incoming token with SHA-256 and compares the hash against
 * the stored `revoke_token_hash` via constant-time equality.
 *
 * Distinct error shapes from the gateway:
 *   - 401  missing or malformed bearer token
 *   - 403  token did not match the stored hash
 *   - 410  share is legacy (predates this feature) — TTL / burn only
 *   - 404  share doesn't exist (or already expired)
 *   - 200  destroyed (idempotent on already-destroyed shares)
 */
export async function destroyShare(
  shortId: string,
  revokeTokenBase64Url: string
): Promise<{ state: ShareDescriptor["state"] }> {
  return request(
    `/api/shares/${encodeURIComponent(shortId)}/destroy`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${revokeTokenBase64Url}` },
    },
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
