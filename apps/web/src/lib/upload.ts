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
  AEAD_KEY_BYTES,
  DEFAULT_MEM_LIMIT_BYTES,
  DEFAULT_MEM_LIMIT_KIB,
  DEFAULT_OPS_LIMIT,
  buildChunkAad,
  bytesToBase64Url,
  deriveAeadKey,
  deriveKeyFromPassword,
  encryptChunk,
  generateKey,
  generateNonce,
  generateRevokeToken,
  generateSalt,
  hashBytes,
  initCrypto,
  sha256,
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
  /**
   * Optional sender-set password. When present (non-empty string), the
   * sender's browser:
   *
   *   1. Generates a fresh 16-byte Argon2id salt.
   *   2. Derives `pwd_key = Argon2id(password, salt, opsLimit, memLimitBytes)`.
   *   3. Derives `aead_key = deriveAeadKey({ fragmentKey, passwordKey: pwd_key })`.
   *   4. Encrypts every chunk + the metadata blob under `aead_key` instead
   *      of the URL-fragment key directly.
   *   5. Sends salt + KDF params (NOT the password) to the gateway.
   *
   * The password value never leaves the browser; the gateway only learns
   * the salt + cost parameters so the recipient's browser can re-derive
   * the same AEAD key after the recipient enters the password into the
   * password-prompt UI. Empty string is treated as "no password".
   */
  password?: string;
  /**
   * Optional Argon2id `opsLimit` override (1-10). Defaults to
   * `DEFAULT_OPS_LIMIT` from crypto-core (3, libsodium MODERATE). Only
   * read when `password` is set.
   */
  passwordKdfOpsLimit?: number;
  /**
   * Optional Argon2id `memLimit` override in BYTES. Defaults to
   * `DEFAULT_MEM_LIMIT_BYTES` from crypto-core (64 MiB). Only read when
   * `password` is set. The gateway stores the value in KiB on the row;
   * we convert internally.
   */
  passwordKdfMemLimitBytes?: number;
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
  /**
   * 32-byte sender-revoke token, base64url-encoded. Generated locally
   * during upload; the server only ever saw its SHA-256 hash. The
   * caller MUST persist this somewhere the sender can find later
   * (`localStorage` under the SlothBox origin is the default — see
   * `apps/web/src/lib/myShares.ts`) so the destroy endpoint can be
   * called without re-authenticating. If lost, the share is no longer
   * sender-revocable and can only end via TTL / burn-after-read.
   */
  revokeToken: string;
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

  // Generate the URL-fragment key client-side. This is the value that goes
  // into `#key=…` — never logged, never sent. When no password is set, this
  // IS the AEAD key (v0.1 behavior). When a password is set, `deriveAeadKey`
  // combines this with the Argon2id output below to produce a different
  // AEAD key that requires both inputs to reproduce.
  const fragmentKey = await generateKey();

  // ─── Password-protection setup ──────────────────────────────────────────
  // The password (if any) never travels to the server. We derive the
  // password-derived key (`pwd_key`) right here and immediately combine it
  // with `fragmentKey` into `aead_key`. Salt + cost parameters DO travel
  // to the server so the recipient can re-derive the same `pwd_key` after
  // the user enters the password into the prompt UI.
  const hasPassword = typeof options.password === "string" && options.password.length > 0;
  const passwordOpsLimit = options.passwordKdfOpsLimit ?? DEFAULT_OPS_LIMIT;
  const passwordMemLimitBytes = options.passwordKdfMemLimitBytes ?? DEFAULT_MEM_LIMIT_BYTES;
  // Server stores the mem limit in KiB on the row; we convert here so the
  // gateway never has to do byte-arithmetic on attacker-supplied input.
  const passwordMemLimitKib = hasPassword
    ? Math.round(passwordMemLimitBytes / 1024)
    : DEFAULT_MEM_LIMIT_KIB;

  let passwordSalt: Uint8Array | null = null;
  let passwordKey: Uint8Array | null = null;
  if (hasPassword) {
    passwordSalt = await generateSalt();
    passwordKey = await deriveKeyFromPassword({
      password: options.password as string,
      salt: passwordSalt,
      opsLimit: passwordOpsLimit,
      memLimit: passwordMemLimitBytes,
    });
  }

  // Derive the actual AEAD key. When no password is set this returns
  // `fragmentKey` unchanged so the no-password share format stays
  // byte-identical to the pre-v0.2 layout.
  const aeadKey = await deriveAeadKey({ fragmentKey, passwordKey });

  // ─── Sender-revoke token (v0.2, migration 0006) ─────────────────────────
  // The token is 32 bytes uniform random, generated in the browser.
  // The SERVER only ever sees its SHA-256 hash. The raw token leaves
  // this function via the UploadResult and is persisted by the caller
  // (typically the ShareLink component, into localStorage).
  const revokeToken = await generateRevokeToken();
  const revokeTokenHash = await sha256(revokeToken);
  const revokeTokenB64 = bytesToBase64Url(revokeToken);
  if (aeadKey.length !== AEAD_KEY_BYTES) {
    // Belt-and-braces — `deriveAeadKey` is the only thing that can produce
    // an off-size key, and it throws on bad inputs. This guard catches a
    // future signature change that drifts away from 32 bytes without
    // updating this file.
    throw new UploadError(`derived AEAD key has wrong length: ${aeadKey.length}`);
  }

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
    key: aeadKey,
    nonce: nonceMeta,
    aad: metaAad,
  });

  const expiryHours = clampExpiry(options.expiryHours ?? 168);
  // Subtract a 60-second safety margin so a client clock that's even
  // slightly ahead of the server's doesn't push expiresAt past the
  // gateway's MAX_SHARE_TTL_DAYS check (`expiresAt - now <= ttl`),
  // which produces an intermittent 400 on exactly-at-the-cap requests.
  // Surfaced 2026-05-09 — repro: select 7d expiry, hit the deploy when
  // the host clock is ahead of the Hetzner VM, get bad_request from
  // /api/shares with no useful UI hint. The 60 s margin also covers
  // typical request-in-flight latency.
  const SAFETY_MARGIN_MS = 60_000;
  const expiresAt = new Date(
    Date.now() + expiryHours * 60 * 60 * 1000 - SAFETY_MARGIN_MS
  ).toISOString();

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
    passwordProtected: hasPassword,
    // The four password-protection fields are all-or-nothing, mirroring
    // the gateway's cross-field check. We spread conditionally so the
    // off-path stays clean rather than carrying undefined-but-present
    // JSON keys.
    ...(hasPassword && passwordSalt
      ? {
          passwordSalt: bytesToBase64Url(passwordSalt),
          passwordKdfOpsLimit: passwordOpsLimit,
          passwordKdfMemLimitKib: passwordMemLimitKib,
        }
      : {}),
    // The hash, NOT the raw token. The raw token never leaves the browser.
    revokeTokenHash: bytesToBase64Url(revokeTokenHash),
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
    const ciphertext = await encryptChunk({ plaintext, key: aeadKey, nonce, aad });

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

  // The URL fragment always carries the FRAGMENT key, never the derived
  // AEAD key. When the share is password-protected, the recipient combines
  // the fragment with the password to reproduce the AEAD key — the salt +
  // cost parameters travel via the gateway response, not the URL fragment.
  const keyB64 = bytesToBase64Url(fragmentKey);
  // URL fragment stays client-only by browser design.
  const shareUrl = `${PUBLIC_URL}/s/${encodeURIComponent(shortId)}#key=${keyB64}`;

  return { shareUrl, shortId, expiresAt, revokeToken: revokeTokenB64 };
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
