// Symmetric authenticated encryption.
//
// Algorithm: XChaCha20-Poly1305 IETF (libsodium primitive)
// Key size:   32 bytes
// Nonce size: 24 bytes (random per chunk)
// MAC size:   16 bytes (appended automatically by libsodium)
//
// All operations are direct calls into libsodium. No custom logic, no key
// stretching here, no hand-rolled MAC. If you find such code in this file,
// it's a bug — please file an issue.

import sodium from "libsodium-wrappers-sumo";
import { concatBytes, sha256, stringToBytes, uint32ToBytesBE } from "./utils.js";

let ready: Promise<void> | null = null;
async function ensureReady(): Promise<void> {
  if (!ready) {
    ready = sodium.ready;
  }
  await ready;
}

export const KEY_BYTES = 32;
export const NONCE_BYTES = 24;
export const TAG_BYTES = 16;

export type SymmetricKey = Uint8Array;
export type Nonce = Uint8Array;
export type Ciphertext = Uint8Array;

export async function generateKey(): Promise<SymmetricKey> {
  await ensureReady();
  return sodium.randombytes_buf(KEY_BYTES);
}

export async function generateNonce(): Promise<Nonce> {
  await ensureReady();
  return sodium.randombytes_buf(NONCE_BYTES);
}

/**
 * Build the AAD for a single chunk. Binds the chunk to a specific share + index
 * so chunks cannot be silently reordered or moved between shares.
 *
 * INJECTIVITY: we prefix the shareId bytes with their u16-BE length so two
 * inputs (shareId, chunkIndex) cannot collide via boundary ambiguity. Without
 * the length prefix, ("abc12", chunkIndex 0x73310030) and ("abc12s10", 0)
 * would produce the same byte string. With the length prefix they differ in
 * the first two bytes. The cost is two bytes per AAD; the gain is a sharp
 * domain-separation guarantee independent of any future shortId-length change.
 */
export function buildChunkAad(shareId: string, chunkIndex: number): Uint8Array {
  const shareIdBytes = stringToBytes(shareId);
  if (shareIdBytes.length > 0xffff) {
    throw new Error("shareId too long for AAD length prefix");
  }
  const lenPrefix = new Uint8Array(2);
  lenPrefix[0] = (shareIdBytes.length >>> 8) & 0xff;
  lenPrefix[1] = shareIdBytes.length & 0xff;
  return concatBytes(lenPrefix, shareIdBytes, uint32ToBytesBE(chunkIndex));
}

/**
 * Encrypt a single chunk with XChaCha20-Poly1305-IETF.
 * Returns ciphertext with the 16-byte authentication tag appended.
 */
export async function encryptChunk(params: {
  plaintext: Uint8Array;
  key: SymmetricKey;
  nonce: Nonce;
  aad: Uint8Array;
}): Promise<Ciphertext> {
  await ensureReady();

  if (params.key.length !== KEY_BYTES) {
    throw new Error(`key must be ${KEY_BYTES} bytes`);
  }
  if (params.nonce.length !== NONCE_BYTES) {
    throw new Error(`nonce must be ${NONCE_BYTES} bytes`);
  }

  return sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    params.plaintext,
    params.aad,
    null,
    params.nonce,
    params.key
  );
}

/**
 * Decrypt a single chunk. Throws if the AEAD tag does not verify (tampered
 * ciphertext, wrong key, wrong nonce, wrong AAD).
 */
export async function decryptChunk(params: {
  ciphertext: Ciphertext;
  key: SymmetricKey;
  nonce: Nonce;
  aad: Uint8Array;
}): Promise<Uint8Array> {
  await ensureReady();

  if (params.key.length !== KEY_BYTES) {
    throw new Error(`key must be ${KEY_BYTES} bytes`);
  }
  if (params.nonce.length !== NONCE_BYTES) {
    throw new Error(`nonce must be ${NONCE_BYTES} bytes`);
  }
  if (params.ciphertext.length < TAG_BYTES) {
    throw new Error("ciphertext too short — missing AEAD tag");
  }

  return sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
    null,
    params.ciphertext,
    params.aad,
    params.nonce,
    params.key
  );
}

/**
 * Hash bytes with BLAKE2b-256 (libsodium's `crypto_generichash` at 32 bytes).
 * Used for content addressing — never for authentication (use AEAD for that).
 */
export async function hashBytes(input: Uint8Array): Promise<Uint8Array> {
  await ensureReady();
  return sodium.crypto_generichash(32, input);
}

/**
 * Domain-separation label baked into `deriveChunkToken`'s input. Same
 * convention as `AEAD_KDF_LABEL` in derivation.ts — encodes the
 * protocol family + a version tag so a future construction change
 * can't produce the same token from the same `(fragmentKey, shortId,
 * chunkIndex)` triple. The `v1` here ticks independently of the
 * SemVer release.
 */
export const CHUNK_TOKEN_LABEL = stringToBytes("slothbox-chunk-token-v1");

/** Zero byte separator between the label and the key material. */
const CHUNK_TOKEN_SEPARATOR = new Uint8Array([0x00]);

/**
 * Derive the 32-byte single-use download token for one chunk.
 *
 * Construction:
 *
 *     token = SHA-256(
 *         CHUNK_TOKEN_LABEL ||
 *         0x00 ||
 *         fragmentKey ||
 *         length_prefixed_shortId ||
 *         u32_be(chunkIndex)
 *     )
 *
 * Both sides of the wire compute the same token without exchanging it —
 * the sender derives it at upload time and ships the SHA-256 commitment
 * to the server; the recipient derives the same token at download
 * time and presents it as a bearer credential. The server's
 * verification step hashes the incoming token and constant-time
 * compares against the stored commitment.
 *
 * SECURITY NOTES:
 *   - This is a one-shot capability per chunk, not a session token —
 *     replay protection lives in the server's `served_at` column.
 *     Once a chunk has been served, a second request returns 410
 *     even with the same valid token.
 *   - The "one-way" property of SHA-256 means a leaked commitment
 *     (DB dump) is uninvertible — an attacker who steals
 *     `download_token_hash` cannot derive the corresponding
 *     `fragmentKey` or token. The defender's URL stays a secret.
 *   - The construction is NOT length-extension-vulnerable in
 *     practice because the server never accepts an attacker-controlled
 *     suffix — it only validates an exact-equal hash compare against
 *     a fixed-length 32-byte commitment.
 *
 * @param params.fragmentKey  the 32-byte key carried in the URL fragment
 * @param params.shortId      the public 12-char short identifier
 * @param params.chunkIndex   the chunk's 0-based index
 *
 * @returns a fresh 32-byte token (NOT the hash — that's the caller's job
 *          via `sha256(token)` when shipping the commitment to the server)
 */
export async function deriveChunkToken(params: {
  fragmentKey: Uint8Array;
  shortId: string;
  chunkIndex: number;
}): Promise<Uint8Array> {
  if (params.fragmentKey.length !== KEY_BYTES) {
    throw new Error(`fragmentKey must be ${KEY_BYTES} bytes`);
  }
  // We reuse `buildChunkAad`'s length-prefixed-shortId + u32-BE shape
  // so the input layout is identical to the AEAD AAD construction
  // — same injectivity proof carries over.
  const aadShape = buildChunkAad(params.shortId, params.chunkIndex);
  const message = concatBytes(
    CHUNK_TOKEN_LABEL,
    CHUNK_TOKEN_SEPARATOR,
    params.fragmentKey,
    aadShape
  );
  return sha256(message);
}
