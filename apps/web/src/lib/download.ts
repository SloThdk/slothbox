// Receiver-side download pipeline.
//
// Mirror image of `upload.ts`. Order of operations:
//
//   1. Read the URL fragment from `window.location.hash`. Refuse to proceed if
//      no key is present — that means the user pasted the link without the
//      `#key=…` portion (which DOES happen, especially over chat clients that
//      strip fragments).
//   2. `initCrypto()` to load libsodium.
//   3. Verify the key hash matches what the server stored (defence-in-depth
//      against the receiver landing on the wrong share-id by chance).
//   4. For each chunk: GET ciphertext + nonce from ingest, build AAD, decrypt.
//   5. Concatenate plaintext, wrap as a Blob, trigger a download click.
//
// Like `upload.ts`, this module is JSX-free and gets driven from the page
// component via a progress callback.

import {
  base64UrlToBytes,
  buildChunkAad,
  bytesToBase64Url,
  decryptChunk,
  hashBytes,
  initCrypto,
} from "@slothbox/crypto-core";
import { getShare, type ShareDescriptor } from "./api";
import { INGEST_URL } from "./config";
import { bytesEqual } from "./utils";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface DownloadOptions {
  onProgress?: (event: DownloadProgressEvent) => void;
  signal?: AbortSignal;
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
}

export class DownloadError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "DownloadError";
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the symmetric key from the URL fragment. Looks for `#key=…` first,
 * falls back to a bare `#…` payload for backward compatibility.
 *
 * Returns null when no key is present — the caller renders a "missing key"
 * error rather than throwing.
 */
export function extractKeyFromHash(hash: string): Uint8Array | null {
  if (!hash || hash.length <= 1) return null;
  const stripped = hash.startsWith("#") ? hash.slice(1) : hash;

  // Preferred form: `#key=<base64url>`. Allows future fragment params (#key=…&v=2).
  const params = new URLSearchParams(stripped);
  const fromParam = params.get("key");
  const candidate = fromParam ?? stripped;
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
 * filename + size BEFORE the user clicks "Download".
 */
export async function fetchShareMetadata(
  shortId: string,
): Promise<ShareDescriptor> {
  return getShare(shortId);
}

/**
 * Download all chunks, decrypt, assemble the file. Returns a Blob plus the
 * filename and mime type from the share metadata.
 *
 * The caller is responsible for actually triggering the browser download —
 * see `triggerBlobDownload` below.
 */
export async function downloadFile(
  shortId: string,
  key: Uint8Array,
  options: DownloadOptions = {},
): Promise<DownloadResult> {
  if (key.length !== 32) {
    throw new DownloadError("invalid decryption key");
  }

  await initCrypto();

  let descriptor: ShareDescriptor;
  try {
    descriptor = await fetchShareMetadata(shortId);
  } catch (err) {
    throw new DownloadError(
      err instanceof Error ? err.message : "could not fetch share metadata",
      err,
    );
  }

  // Defence in depth: if the gateway recorded the key hash, confirm we have
  // the right key BEFORE pulling chunks. Saves the user from a 4 GB download
  // that silently fails AEAD on the very first chunk.
  if (descriptor.keyHash && descriptor.keyHash.length > 0) {
    const ourHash = await hashBytes(key);
    const theirHash = base64UrlToBytes(descriptor.keyHash);
    if (!bytesEqual(ourHash, theirHash)) {
      throw new DownloadError(
        "decryption key does not match this share — check the URL is complete",
      );
    }
  }

  const totalChunks = descriptor.chunkCount;
  const bytesTotal = descriptor.fileSize;
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

    const { ciphertext, nonce } = await fetchChunk({
      shortId,
      chunkIndex: i,
      signal: options.signal,
    });

    const aad = buildChunkAad(shortId, i);
    let plaintext: Uint8Array;
    try {
      plaintext = await decryptChunk({ ciphertext, key, nonce, aad });
    } catch (err) {
      // libsodium throws on AEAD verification failure. Translate to a friendly
      // error before bubbling.
      throw new DownloadError(
        `chunk ${i} failed integrity check — file may be tampered with`,
        err,
      );
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

  const blob = new Blob(plaintextChunks, {
    type: descriptor.mimeType || "application/octet-stream",
  });

  return {
    blob,
    fileName: descriptor.fileName,
    mimeType: descriptor.mimeType,
  };
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

interface FetchChunkArgs {
  shortId: string;
  chunkIndex: number;
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
      ...(args.signal ? { signal: args.signal } : {}),
    });
  } catch (err) {
    if (args.signal?.aborted) {
      throw new DownloadError("download cancelled");
    }
    throw new DownloadError("could not reach the ingest service", err);
  }

  if (!response.ok) {
    throw new DownloadError(`ingest returned HTTP ${response.status}`);
  }

  const nonceHeader = response.headers.get("X-Slothbox-Nonce");
  if (!nonceHeader) {
    throw new DownloadError("ingest response missing nonce header");
  }
  let nonce: Uint8Array;
  try {
    nonce = base64UrlToBytes(nonceHeader);
  } catch (err) {
    throw new DownloadError("malformed nonce header", err);
  }
  if (nonce.length !== 24) {
    throw new DownloadError(
      `unexpected nonce length: ${nonce.length} (expected 24)`,
    );
  }

  const buffer = await response.arrayBuffer();
  const ciphertext = new Uint8Array(buffer);
  if (ciphertext.length < 16) {
    throw new DownloadError("ciphertext too short — missing AEAD tag");
  }

  // Re-export bytesToBase64Url out of utils for symmetry. Unused here but kept
  // to mirror the upload path; it's exported so callers can hash the URL hash.
  void bytesToBase64Url;

  return { ciphertext, nonce };
}
