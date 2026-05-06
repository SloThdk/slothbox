// Typed REST client for the API gateway (apps/api-gateway).
//
// Contract is intentionally narrow for v0.1.0-alpha:
//   POST   /shares                  → create a share descriptor
//   GET    /shares/:shortId         → fetch share metadata (NOT chunks)
//   POST   /shares/:shortId/burn    → manually destroy the share
//
// Chunks are uploaded directly to the ingest service (see `upload.ts`) and
// fetched directly from the ingest service (see `download.ts`). The gateway is
// the metadata + lifecycle authority — it never touches ciphertext.
//
// All shapes are mirrored from `apps/api-gateway/src/routes/shares.ts` (to
// land in the gateway scaffold). When the gateway lands, fold the types back
// into a `@slothbox/contracts` package and import from there to avoid drift.

import { z } from "zod";
import { API_URL } from "./config";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Server-side representation of a share. Note: `keyHash` exists so the gateway
 * can sanity-check on download that the receiver landed on the correct share —
 * it is the BLAKE2b-256 of the symmetric key. Never the key itself.
 */
export interface ShareDescriptor {
  shortId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  chunkCount: number;
  chunkSize: number;
  expiresAt: string; // ISO 8601 UTC
  burnAfterRead: boolean;
  createdAt: string; // ISO 8601 UTC
  keyHash?: string; // base64url BLAKE2b-256 of the symmetric key (optional in v0.1)
}

export interface CreateShareRequest {
  fileName: string;
  fileSize: number;
  mimeType: string;
  chunkCount: number;
  chunkSize: number;
  expiryHours: number;
  burnAfterRead: boolean;
  keyHash: string; // base64url BLAKE2b-256 of the symmetric key
}

export interface CreateShareResponse {
  shortId: string;
  uploadToken: string;
  expiresAt: string;
}

// ---------------------------------------------------------------------------
// Zod schemas — runtime validation at every trust boundary.
// ---------------------------------------------------------------------------

const ShareDescriptorSchema: z.ZodType<ShareDescriptor> = z.object({
  shortId: z.string().min(1).max(64),
  fileName: z.string().min(1).max(512),
  fileSize: z.number().int().nonnegative(),
  mimeType: z.string().max(255),
  chunkCount: z.number().int().positive(),
  chunkSize: z.number().int().positive(),
  expiresAt: z.string().datetime(),
  burnAfterRead: z.boolean(),
  createdAt: z.string().datetime(),
  keyHash: z.string().optional(),
});

const CreateShareResponseSchema: z.ZodType<CreateShareResponse> = z.object({
  shortId: z.string().min(1).max(64),
  uploadToken: z.string().min(1),
  expiresAt: z.string().datetime(),
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
  public readonly cause: unknown;

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

async function request<T>(
  path: string,
  init: RequestInit,
  schema: z.ZodType<T>,
): Promise<T> {
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
        ? ((payload as { error: string }).error)
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
    throw new ApiError(
      "gateway response failed schema validation",
      response.status,
      parsed.error,
    );
  }
  return parsed.data;
}

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

/**
 * Create a share metadata record. The server returns a short id and an upload
 * token the caller must pass on every chunk PUT.
 */
export async function createShare(
  body: CreateShareRequest,
): Promise<CreateShareResponse> {
  return request(
    "/shares",
    {
      method: "POST",
      body: JSON.stringify(body),
    },
    CreateShareResponseSchema,
  );
}

/**
 * Fetch share metadata. Used by the receiver page to know how many chunks to
 * pull and what filename to suggest.
 */
export async function getShare(shortId: string): Promise<ShareDescriptor> {
  return request(
    `/shares/${encodeURIComponent(shortId)}`,
    { method: "GET" },
    ShareDescriptorSchema,
  );
}

/**
 * Manually trigger burn-after-read destruction. The reaper daemon also
 * destroys shares on a schedule — this endpoint is for the explicit case where
 * the receiver just finished downloading.
 */
export async function triggerBurn(shortId: string): Promise<{ ok: true }> {
  return request(
    `/shares/${encodeURIComponent(shortId)}/burn`,
    { method: "POST" },
    z.object({ ok: z.literal(true) }),
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
