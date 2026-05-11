// Receiver-side download pipeline.
//
// Mirror image of `upload.ts`. Order of operations:
//
//   1. Read the URL fragment from `window.location.hash` (`#key=…`).
//      Refuse to proceed if no key — that means the user pasted the link
//      without the `#key=…` portion (which DOES happen, especially over
//      chat clients that strip fragments).
//   2. `initCrypto()` to load libsodium.
//   3. Fetch the share metadata (encryptedMeta + nonceMeta + chunkCount + ...).
//   4. Decrypt the metadata blob to recover fileName + mimeType.
//   5. For each chunk: GET ciphertext + nonce from ingest, build AAD, decrypt.
//   6. Concatenate plaintext, wrap as a Blob, trigger a download click.
//   7. Notify the gateway that the download completed (so burn-after-read
//      can fire).
//
// Like `upload.ts`, this module is JSX-free and gets driven from the page
// component via a progress callback.

import {
  base64UrlToBytes,
  buildChunkAad,
  bytesToBase64Url,
  bytesToString,
  decryptChunk,
  deriveAeadKey,
  deriveChunkToken,
  deriveKeyFromPassword,
  initCrypto,
} from "@slothbox/crypto-core";
import { getShare, markDownloaded, type ShareDescriptor } from "./api";
import { INGEST_URL } from "./config";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface DownloadOptions {
  onProgress?: (event: DownloadProgressEvent) => void;
  signal?: AbortSignal;
  /**
   * Sender-set password, when the share is password-protected (see
   * `descriptor.password.enabled` on the metadata response). The
   * recipient's browser runs `Argon2id(password, salt, ops, mem)`
   * locally and combines the result with the URL-fragment key to
   * reproduce the AEAD key — the password value never reaches the
   * server, and the failure mode on a wrong guess is an AEAD-tag
   * mismatch (no online guess oracle).
   *
   * If the share is password-protected but this option is missing
   * or empty, `downloadFile` throws a `DownloadError` with code
   * `password_required` so the caller can render a password-prompt
   * UI without round-tripping again.
   */
  password?: string;
}

export interface DownloadProgressEvent {
  fraction: number;
  chunksDownloaded: number;
  chunksTotal: number;
  bytesDownloaded: number;
  bytesTotal: number;
}

export interface DownloadResult {
  blob: Blob;
  fileName: string;
  mimeType: string;
  burnAfterRead: boolean;
}

interface ShareMeta {
  fileName: string;
  mimeType: string;
}

/**
 * Stable string codes the receiver UI keys off. Adding a new code here is
 * a small public-API change — keep it in sync with consumers under
 * `apps/web/src/components/Decrypt.tsx`.
 */
export type DownloadErrorCode =
  | "password_required"
  | "wrong_password"
  | "share_not_found"
  | "key_invalid"
  | "transport"
  | "metadata"
  | "decrypt"
  | "cancelled"
  | "unknown";

export class DownloadError extends Error {
  /** Stable machine-readable code for UI branching. */
  public readonly code: DownloadErrorCode;
  constructor(message: string, options: { code?: DownloadErrorCode; cause?: unknown } = {}) {
    // Pass `cause` through to the standard Error constructor so it lands on
    // `Error.cause` (ES2022) — preserves the original behaviour callers may
    // have relied on without us managing the field manually.
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "DownloadError";
    this.code = options.code ?? "unknown";
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the symmetric key from the URL fragment. Looks for `#key=…`
 * exclusively — no bare-fragment fallback (per CRYPTO.md §"key location",
 * the fragment format is versioned and not historically compatible).
 *
 * Returns null when no key is present — the caller renders a "missing key"
 * error rather than throwing.
 */
export function extractKeyFromHash(hash: string): Uint8Array | null {
  if (!hash || hash.length <= 1) return null;
  const stripped = hash.startsWith("#") ? hash.slice(1) : hash;

  const params = new URLSearchParams(stripped);
  const candidate = params.get("key");
  if (!candidate || candidate.length < 32) return null;

  try {
    const bytes = base64UrlToBytes(candidate);
    if (bytes.length !== 32) return null;
    return bytes;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch share metadata from the gateway. Useful for the receiver UI to render
 * a "this share exists, expires at X, N chunks" preview BEFORE the user
 * clicks "Download" (the encrypted metadata blob isn't decoded here — that
 * needs the key).
 */
export async function fetchShareMetadata(shortId: string): Promise<ShareDescriptor> {
  return getShare(shortId);
}

/**
 * Download all chunks, decrypt, assemble the file. Returns a Blob plus the
 * filename and mime type recovered from the encrypted metadata blob.
 *
 * The caller is responsible for actually triggering the browser download —
 * see `triggerBlobDownload` below — and for calling `markDownloaded` after
 * a successful save (so burn-after-read can fire).
 */
export async function downloadFile(
  shortId: string,
  fragmentKey: Uint8Array,
  options: DownloadOptions = {}
): Promise<DownloadResult> {
  if (fragmentKey.length !== 32) {
    throw new DownloadError("invalid decryption key", { code: "key_invalid" });
  }

  await initCrypto();

  let descriptor: ShareDescriptor;
  try {
    descriptor = await fetchShareMetadata(shortId);
  } catch (err) {
    throw new DownloadError(err instanceof Error ? err.message : "could not fetch share metadata", {
      code: "share_not_found",
      cause: err,
    });
  }

  // ─── Resolve the AEAD key ──────────────────────────────────────────────
  // For shares without a password, `aeadKey === fragmentKey`. For
  // password-protected shares, we run Argon2id on the user-supplied
  // password against the server-stored salt + KDF parameters, then
  // combine the result with `fragmentKey` via BLAKE2b-keyed. The
  // password never leaves this function.
  let aeadKey: Uint8Array;
  if (descriptor.password.enabled) {
    const password = options.password ?? "";
    if (password.length === 0) {
      throw new DownloadError("password required", { code: "password_required" });
    }
    let saltBytes: Uint8Array;
    try {
      saltBytes = base64UrlToBytes(descriptor.password.salt);
    } catch (err) {
      throw new DownloadError("share password salt malformed", { code: "metadata", cause: err });
    }
    const passwordKey = await deriveKeyFromPassword({
      password,
      salt: saltBytes,
      opsLimit: descriptor.password.opsLimit,
      // Server stores memLimit in KiB; libsodium wants bytes.
      memLimit: descriptor.password.memLimitKib * 1024,
    });
    aeadKey = await deriveAeadKey({ fragmentKey, passwordKey });
  } else {
    aeadKey = await deriveAeadKey({ fragmentKey });
  }

  // Decrypt the metadata blob first — failure here is the cleanest signal
  // that the user has the wrong key or wrong password.
  const meta = await decryptShareMeta(descriptor, aeadKey, {
    passwordProtected: descriptor.password.enabled,
  });

  const totalChunks = descriptor.chunkCount;
  const bytesTotal = Number(descriptor.fileSize);
  let chunksDownloaded = 0;
  let bytesDownloaded = 0;

  // Allocate a list of plaintext chunks to concat at the end. Holding all
  // chunks in memory is fine for v0.1's max file size (4 GiB clamp); v0.5
  // moves to a streaming Blob via TransformStream to lift that ceiling.
  const plaintextChunks: Uint8Array[] = new Array<Uint8Array>(totalChunks);

  for (let i = 0; i < totalChunks; i += 1) {
    if (options.signal?.aborted) {
      throw new DownloadError("download cancelled");
    }

    // Single-use chunk token (v0.2, migration 0007). Derived locally
    // from the URL-fragment key; presented as a bearer credential so
    // the ingest service can validate against the stored SHA-256
    // commitment. The server returns 410 Gone on the second fetch of
    // the same chunk, which is what closes the parallel-readers
    // race acknowledged in v0.1's WARNING block #2.
    const chunkToken = await deriveChunkToken({ fragmentKey, shortId, chunkIndex: i });
    const chunkTokenB64 = bytesToBase64Url(chunkToken);

    const { ciphertext, nonce } = await fetchChunk({
      shortId,
      chunkIndex: i,
      chunkToken: chunkTokenB64,
      signal: options.signal,
    });

    const aad = buildChunkAad(shortId, i);
    let plaintext: Uint8Array;
    try {
      plaintext = await decryptChunk({ ciphertext, key: aeadKey, nonce, aad });
    } catch (err) {
      // If the share is password-protected and chunk 0 fails, the most
      // likely cause is a wrong password (the metadata blob already
      // decrypted, which means the AEAD key was at least chunk-0-shaped
      // — but in rare cases metadata can decrypt and a chunk fail due
      // to tampering). We can't distinguish definitively without
      // probabilistic info, so for the first chunk on a password-
      // protected share, surface `wrong_password` as the more likely
      // cause; later chunks tag as `decrypt` (tamper).
      const code = descriptor.password.enabled && i === 0 ? "wrong_password" : "decrypt";
      throw new DownloadError(`chunk ${i} failed integrity check — file may be tampered with`, {
        code,
        cause: err,
      });
    }

    plaintextChunks[i] = plaintext;
    chunksDownloaded += 1;
    bytesDownloaded += plaintext.length;

    options.onProgress?.({
      fraction: Math.min(1, bytesDownloaded / Math.max(1, bytesTotal)),
      chunksDownloaded,
      chunksTotal: totalChunks,
      bytesDownloaded,
      bytesTotal,
    });
  }

  // TS 5.7 narrowed Uint8Array to a generic over the underlying buffer kind,
  // so Uint8Array<ArrayBufferLike> isn't directly a BlobPart. The cast is safe:
  // BlobPart accepts BufferSource, and these chunks always back ArrayBuffer.
  const blob = new Blob(plaintextChunks as BlobPart[], {
    type: meta.mimeType || "application/octet-stream",
  });

  return {
    blob,
    fileName: meta.fileName,
    mimeType: meta.mimeType,
    burnAfterRead: descriptor.burnAfterRead,
  };
}

/**
 * Notify the gateway the download completed. Best-effort — the share will
 * still expire on its TTL even if this call fails. When the share is
 * burn-after-read, this is what triggers the immediate destruction.
 */
export async function notifyDownloadComplete(shortId: string): Promise<void> {
  try {
    await markDownloaded(shortId);
  } catch {
    // Intentional swallow — this is a fire-and-forget signal. The reaper
    // will catch any orphans on its sweep.
  }
}

/**
 * Trigger a synthetic anchor click to save a Blob with the given filename.
 * Used by the receiver page after `downloadFile` returns.
 */
export function triggerBlobDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revocation so Safari has a chance to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

async function decryptShareMeta(
  descriptor: ShareDescriptor,
  aeadKey: Uint8Array,
  context: { passwordProtected: boolean }
): Promise<ShareMeta> {
  let metaBytes: Uint8Array;
  try {
    const ciphertext = base64UrlToBytes(descriptor.encryptedMeta);
    const nonce = base64UrlToBytes(descriptor.nonceMeta);
    if (nonce.length !== 24) {
      throw new DownloadError(`unexpected metadata nonce length: ${nonce.length} (expected 24)`, {
        code: "metadata",
      });
    }
    metaBytes = await decryptChunk({
      ciphertext,
      key: aeadKey,
      nonce,
      aad: buildChunkAad("meta", 0),
    });
  } catch (err) {
    // Metadata decrypt is the earliest possible AEAD-tag check after key
    // derivation. For password-protected shares this is the load-bearing
    // "wrong password" detector — the recipient's UI keys off the code
    // to know whether to re-prompt for the password (vs surfacing a
    // generic "URL incomplete" message). For non-password shares the
    // message stays as before.
    const code = context.passwordProtected ? "wrong_password" : "metadata";
    const message = context.passwordProtected
      ? "incorrect password"
      : "could not decrypt share metadata — check the URL is complete";
    throw new DownloadError(message, { code, cause: err });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(bytesToString(metaBytes));
  } catch (err) {
    throw new DownloadError("share metadata is malformed", { code: "metadata", cause: err });
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as { fileName?: unknown }).fileName !== "string" ||
    typeof (parsed as { mimeType?: unknown }).mimeType !== "string"
  ) {
    throw new DownloadError("share metadata missing fileName or mimeType", { code: "metadata" });
  }

  return {
    fileName: (parsed as { fileName: string }).fileName,
    mimeType: (parsed as { mimeType: string }).mimeType,
  };
}

interface FetchChunkArgs {
  shortId: string;
  chunkIndex: number;
  /**
   * Base64url single-use download token for this chunk (32 bytes
   * raw). Sent as `Authorization: Bearer <token>`. The ingest service
   * hashes the incoming token and constant-time compares against the
   * stored commitment from share_chunks.download_token_hash.
   */
  chunkToken: string;
  signal?: AbortSignal;
}

interface FetchChunkResult {
  ciphertext: Uint8Array;
  nonce: Uint8Array;
}

async function fetchChunk(args: FetchChunkArgs): Promise<FetchChunkResult> {
  const url = `${INGEST_URL}/chunk/${encodeURIComponent(args.shortId)}/${args.chunkIndex}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${args.chunkToken}` },
      ...(args.signal ? { signal: args.signal } : {}),
    });
  } catch (err) {
    if (args.signal?.aborted) {
      throw new DownloadError("download cancelled", { code: "cancelled" });
    }
    throw new DownloadError("could not reach the ingest service", {
      code: "transport",
      cause: err,
    });
  }

  if (!response.ok) {
    // 410 GONE is the load-bearing signal for the single-use chunk
    // token regime: someone (legitimate retry after a network blip,
    // or a parallel reader who started later) already redeemed this
    // chunk's token. Surface as a distinct code so the receiver UI
    // can render an actionable message ("link already used — ask
    // the sender to upload again") rather than a generic "transport"
    // error.
    if (response.status === 410) {
      throw new DownloadError(
        "this share has already been delivered to someone else — ask the sender to re-upload",
        { code: "decrypt" }
      );
    }
    throw new DownloadError(`ingest returned HTTP ${response.status}`, { code: "transport" });
  }

  const nonceHeader = response.headers.get("X-Slothbox-Nonce");
  if (!nonceHeader) {
    throw new DownloadError("ingest response missing nonce header", { code: "metadata" });
  }
  let nonce: Uint8Array;
  try {
    nonce = base64UrlToBytes(nonceHeader);
  } catch (err) {
    throw new DownloadError("malformed nonce header", { code: "metadata", cause: err });
  }
  if (nonce.length !== 24) {
    throw new DownloadError(`unexpected nonce length: ${nonce.length} (expected 24)`, {
      code: "metadata",
    });
  }

  const buffer = await response.arrayBuffer();
  const ciphertext = new Uint8Array(buffer);
  if (ciphertext.length < 16) {
    throw new DownloadError("ciphertext too short — missing AEAD tag", { code: "decrypt" });
  }

  return { ciphertext, nonce };
}
