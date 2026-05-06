// Sender-side upload pipeline.
//
// Order of operations (NEVER deviate without crypto review):
//
//   1. `initCrypto()` — load libsodium into the browser.
//   2. Generate the 32-byte symmetric key and the per-chunk 24-byte nonces.
//   3. Hash the key (BLAKE2b-256) so the server can sanity-check the receiver
//      landed on the right share without ever seeing the key itself.
//   4. POST `/shares` to obtain a `shortId` + `uploadToken`.
//   5. For each chunk: read the slice, build AAD (binds shareId + chunkIndex),
//      encrypt, and PUT to ingest at `/chunk/:shareId/:chunkIndex`.
//      The nonce travels in `X-Slothbox-Nonce`, the AEAD-tagged ciphertext is
//      the request body.
//   6. Return the share URL with the key in the URL fragment. The fragment
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
} from "@slothbox/crypto-core";
import {
  createShare,
  type CreateShareRequest,
  type CreateShareResponse,
} from "./api";
import {
  CHUNK_SIZE_BYTES,
  INGEST_URL,
  MAX_FILE_SIZE_BYTES,
  PUBLIC_URL,
} from "./config";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface UploadOptions {
  /** Hours from now until the share expires. Server may clamp to its max. */
  expiryHours?: number;
  /** If true, the share self-destructs after first successful download. */
  burnAfterRead?: boolean;
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
    public readonly cause?: unknown,
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
 * The key is generated client-side, the BLAKE2b-256 hash is sent for receiver
 * sanity-checking, and the raw key is encoded into the URL fragment which
 * browsers never include in HTTP requests.
 */
export async function uploadFile(
  file: File,
  options: UploadOptions = {},
): Promise<UploadResult> {
  if (file.size <= 0) {
    throw new UploadError("file is empty");
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new UploadError(
      `file is too large (${file.size} bytes > ${MAX_FILE_SIZE_BYTES} bytes max)`,
    );
  }

  // Ensure libsodium is ready before we start generating keys / nonces.
  await initCrypto();

  // Generate the symmetric key client-side. This is the value that goes into
  // the URL fragment — never logged, never sent.
  const key = await generateKey();
  const keyHash = await hashBytes(key);
  const keyHashB64 = bytesToBase64Url(keyHash);

  const chunkSize = CHUNK_SIZE_BYTES;
  const chunkCount = Math.ceil(file.size / chunkSize);

  const expiryHours = clampExpiry(options.expiryHours ?? 168);

  const createReq: CreateShareRequest = {
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type || "application/octet-stream",
    chunkCount,
    chunkSize,
    expiryHours,
    burnAfterRead: options.burnAfterRead ?? false,
    keyHash: keyHashB64,
  };

  let descriptor: CreateShareResponse;
  try {
    descriptor = await createShare(createReq);
  } catch (err) {
    throw new UploadError(
      err instanceof Error ? err.message : "could not create share",
      err,
    );
  }

  const { shortId, uploadToken, expiresAt } = descriptor;

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

    await putChunk({
      shortId,
      chunkIndex: i,
      uploadToken,
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
  shortId: string;
  chunkIndex: number;
  uploadToken: string;
  ciphertext: Uint8Array;
  nonce: Uint8Array;
  signal?: AbortSignal;
}

async function putChunk(args: PutChunkArgs): Promise<void> {
  const url = `${INGEST_URL}/chunk/${encodeURIComponent(args.shortId)}/${args.chunkIndex}`;

  let response: Response;
  try {
    // Use a fresh ArrayBuffer copy so the runtime can't refuse a
    // SharedArrayBuffer-backed body. fetch() won't take Uint8Array directly in
    // every browser; the underlying ArrayBuffer is the safe choice.
    const buffer = args.ciphertext.buffer.slice(
      args.ciphertext.byteOffset,
      args.ciphertext.byteOffset + args.ciphertext.byteLength,
    );

    response = await fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/octet-stream",
        "X-Slothbox-Nonce": bytesToBase64Url(args.nonce),
        "X-Slothbox-Upload-Token": args.uploadToken,
      },
      body: buffer,
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
  // Server has its own clamp (SHARE_MAX_EXPIRY_HOURS). The client-side bound
  // is just sanity — never a security boundary.
  if (!Number.isFinite(hours) || hours <= 0) return 168;
  if (hours > 24 * 30) return 24 * 30;
  return Math.floor(hours);
}
