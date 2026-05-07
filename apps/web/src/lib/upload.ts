// Sender-side upload pipeline.
//
// Order of operations (NEVER deviate without crypto review):
//
//   1. `initCrypto()` — load libsodium into the browser.
//   2. Generate the 32-byte symmetric key + per-chunk 24-byte nonces +
//      one extra 24-byte nonce for the metadata blob.
//   3. Hash the plaintext file (BLAKE2b-256) so the server has a content
//      address it can sanity-check on the receive side.
//   4. Encrypt the metadata blob (filename + mime) with the same key, into
//      `encryptedMeta` + `nonceMeta`.
//   5. POST `/api/shares` to obtain a `shortId`, `shareId`, and per-chunk
//      `uploadUrls`.
//   6. For each chunk i: read the slice, build AAD (binds shortId + i),
//      encrypt, PUT the ciphertext to `uploadUrls[i]`. The nonce travels
//      in `X-Slothbox-Nonce`.
//   7. Return the share URL with the key in the URL fragment. The fragment
//      never reaches the server — that's how the trust boundary works.
//
// Progress events are surfaced via an optional callback (rather than wiring a
// React state setter into this module). The caller drives any UI; this module
// is pure typescript with no JSX dependency.

import {
  buildChunkAad,
  bytesToBase64Url,
  encryptChunk,
  generateKey,
  generateNonce,
  hashBytes,
  initCrypto,
  stringToBytes,
} from "@slothbox/crypto-core";
import { createShare, type CreateShareRequest, type CreateShareResponse } from "./api";
import { CHUNK_SIZE_BYTES, MAX_FILE_SIZE_BYTES, PUBLIC_URL } from "./config";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface UploadOptions {
  /** Hours from now until the share expires. Server may clamp to its max. */
  expiryHours?: number;
  /** If true, the share self-destructs after first successful download. */
  burnAfterRead?: boolean;
  /** Optional cap on number of downloads (null = unlimited within expiry). */
  maxDownloads?: number | null;
  /** Optional progress callback fired after every chunk completes. */
  onProgress?: (event: UploadProgressEvent) => void;
  /** Optional cancellation signal. */
  signal?: AbortSignal;
}

export interface UploadProgressEvent {
  /** 0…1, the fraction of bytes ciphered + uploaded so far. */
  fraction: number;
  /** Number of chunks fully uploaded. */
  chunksUploaded: number;
  /** Total chunks for the file. */
  chunksTotal: number;
  /** Bytes uploaded so far (ciphertext bytes including AEAD tag). */
  bytesUploaded: number;
  /** Total ciphertext byte count (plaintext + 16-byte tag per chunk). */
  bytesTotal: number;
}

export interface UploadResult {
  /** The full share URL — share this with the recipient. Includes `#key=…`. */
  shareUrl: string;
  /** The opaque short id stored on the server. */
  shortId: string;
  /** When the server says the share will expire. */
  expiresAt: string;
}

export class UploadError extends Error {
  constructor(
    message: string,
    public override readonly cause?: unknown
  ) {
    super(message);
    this.name = "UploadError";
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Encrypt and upload a single file. Returns the shareable URL containing the
 * decryption key in the URL fragment.
 *
 * SECURITY NOTE: this function NEVER sends the symmetric key to any server.
 * The key is generated client-side, the BLAKE2b-256 hash of the *plaintext*
 * (not the key) is sent for content addressing / integrity checks, and the
 * raw key is encoded into the URL fragment which browsers never include in
 * HTTP requests.
 */
export async function uploadFile(file: File, options: UploadOptions = {}): Promise<UploadResult> {
  if (file.size <= 0) {
    throw new UploadError("file is empty");
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new UploadError(
      `file is too large (${file.size} bytes > ${MAX_FILE_SIZE_BYTES} bytes max)`
    );
  }

  // Ensure libsodium is ready before we start generating keys / nonces.
  await initCrypto();

  // Generate the symmetric key client-side. This is the value that goes into
  // the URL fragment — never logged, never sent.
  const key = await generateKey();

  const chunkSize = CHUNK_SIZE_BYTES;
  const chunkCount = Math.ceil(file.size / chunkSize);

  // Hash the plaintext as a single pass — used as the file content address
  // in the audit trail. Server stores it; client recomputes on download to
  // detect tampering.
  const wholeFile = new Uint8Array(await file.arrayBuffer());
  const fileHashBytes = await hashBytes(wholeFile);

  // Build + encrypt the metadata blob. We use a placeholder shareId of "meta"
  // for the AAD because we don't have a real shareId yet (the server hasn't
  // assigned one) — the server-side decrypt path will rebuild AAD with the
  // same constant. Documented in CRYPTO.md.
  const metaJson = JSON.stringify({
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
  });
  const metaBytes = stringToBytes(metaJson);
  const nonceMeta = await generateNonce();
  const metaAad = buildChunkAad("meta", 0);
  const encryptedMeta = await encryptChunk({
    plaintext: metaBytes,
    key,
    nonce: nonceMeta,
    aad: metaAad,
  });

  const expiryHours = clampExpiry(options.expiryHours ?? 168);
  const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000).toISOString();

  const createReq: CreateShareRequest = {
    fileSize: file.size,
    fileHash: bytesToBase64Url(fileHashBytes),
    encryptedMeta: bytesToBase64Url(encryptedMeta),
    nonceMeta: bytesToBase64Url(nonceMeta),
    chunkCount,
    chunkSize,
    expiresAt,
    burnAfterRead: options.burnAfterRead ?? false,
    maxDownloads: options.maxDownloads ?? null,
  };

  let descriptor: CreateShareResponse;
  try {
    descriptor = await createShare(createReq);
  } catch (err) {
    throw new UploadError(err instanceof Error ? err.message : "could not create share", err);
  }

  const { shortId, uploadUrls } = descriptor;
  if (uploadUrls.length !== chunkCount) {
    throw new UploadError(
      `gateway returned ${uploadUrls.length} upload URLs but we have ${chunkCount} chunks`
    );
  }

  // Pre-compute the totals so the progress callback has stable denominators.
  // Each chunk grows by 16 bytes (AEAD tag).
  const bytesTotal = file.size + chunkCount * 16;
  let bytesUploaded = 0;
  let chunksUploaded = 0;

  // Sequential upload — keeps the implementation simple for v0.1 and avoids
  // overrunning the gateway's per-IP rate limit. v0.5 introduces a
  // configurable concurrency window (INGEST_MAX_PARALLEL_CHUNKS).
  for (let i = 0; i < chunkCount; i += 1) {
    if (options.signal?.aborted) {
      throw new UploadError("upload cancelled");
    }

    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, file.size);
    const blob = file.slice(start, end);
    const plaintext = new Uint8Array(await blob.arrayBuffer());

    const nonce = await generateNonce();
    const aad = buildChunkAad(shortId, i);
    const ciphertext = await encryptChunk({ plaintext, key, nonce, aad });

    const uploadUrl = uploadUrls[i];
    if (!uploadUrl) {
      throw new UploadError(`missing upload URL for chunk ${i}`);
    }

    await putChunk({
      url: uploadUrl,
      ciphertext,
      nonce,
      signal: options.signal,
    });

    chunksUploaded += 1;
    bytesUploaded += ciphertext.length;
    options.onProgress?.({
      fraction: bytesUploaded / bytesTotal,
      chunksUploaded,
      chunksTotal: chunkCount,
      bytesUploaded,
      bytesTotal,
    });
  }

  const keyB64 = bytesToBase64Url(key);
  // URL fragment stays client-only by browser design.
  const shareUrl = `${PUBLIC_URL}/s/${encodeURIComponent(shortId)}#key=${keyB64}`;

  return { shareUrl, shortId, expiresAt };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

interface PutChunkArgs {
  url: string;
  ciphertext: Uint8Array;
  nonce: Uint8Array;
  signal?: AbortSignal;
}

async function putChunk(args: PutChunkArgs): Promise<void> {
  let response: Response;
  try {
    // Copy into a fresh ArrayBuffer so the runtime never receives a
    // SharedArrayBuffer-backed body (fetch refuses those in some browsers)
    // and so the cast to BodyInit is unambiguous regardless of how the
    // libsodium output Uint8Array was allocated.
    const body = new ArrayBuffer(args.ciphertext.byteLength);
    new Uint8Array(body).set(args.ciphertext);

    response = await fetch(args.url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/octet-stream",
        "X-Slothbox-Nonce": bytesToBase64Url(args.nonce),
      },
      body,
      ...(args.signal ? { signal: args.signal } : {}),
    });
  } catch (err) {
    if (args.signal?.aborted) {
      throw new UploadError("upload cancelled");
    }
    throw new UploadError("could not reach the ingest service", err);
  }

  if (!response.ok) {
    throw new UploadError(`ingest returned HTTP ${response.status}`);
  }
}

function clampExpiry(hours: number): number {
  // Server has its own clamp (MAX_SHARE_TTL_DAYS). The client-side bound
  // is just sanity — never a security boundary.
  if (!Number.isFinite(hours) || hours <= 0) return 168;
  if (hours > 24 * 30) return 24 * 30;
  return Math.floor(hours);
}
