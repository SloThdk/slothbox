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
  bytesToString,
  decryptChunk,
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

export class DownloadError extends Error {
  constructor(
    message: string,
    public override readonly cause?: unknown
  ) {
    super(message);
    this.name = "DownloadError";
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
  key: Uint8Array,
  options: DownloadOptions = {}
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
      err
    );
  }

  // Decrypt the metadata blob first — failure here is the cleanest signal
  // that the user has the wrong key.
  const meta = await decryptShareMeta(descriptor, key);

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
      throw new DownloadError(
        `chunk ${i} failed integrity check — file may be tampered with`,
        err
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
  key: Uint8Array
): Promise<ShareMeta> {
  let metaBytes: Uint8Array;
  try {
    const ciphertext = base64UrlToBytes(descriptor.encryptedMeta);
    const nonce = base64UrlToBytes(descriptor.nonceMeta);
    if (nonce.length !== 24) {
      throw new DownloadError(
        `unexpected metadata nonce length: ${nonce.length} (expected 24)`
      );
    }
    metaBytes = await decryptChunk({
      ciphertext,
      key,
      nonce,
      aad: buildChunkAad("meta", 0),
    });
  } catch (err) {
    throw new DownloadError(
      "could not decrypt share metadata — check the URL is complete",
      err
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(bytesToString(metaBytes));
  } catch (err) {
    throw new DownloadError("share metadata is malformed", err);
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as { fileName?: unknown }).fileName !== "string" ||
    typeof (parsed as { mimeType?: unknown }).mimeType !== "string"
  ) {
    throw new DownloadError("share metadata missing fileName or mimeType");
  }

  return {
    fileName: (parsed as { fileName: string }).fileName,
    mimeType: (parsed as { mimeType: string }).mimeType,
  };
}

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
      `unexpected nonce length: ${nonce.length} (expected 24)`
    );
  }

  const buffer = await response.arrayBuffer();
  const ciphertext = new Uint8Array(buffer);
  if (ciphertext.length < 16) {
    throw new DownloadError("ciphertext too short — missing AEAD tag");
  }

  return { ciphertext, nonce };
}
