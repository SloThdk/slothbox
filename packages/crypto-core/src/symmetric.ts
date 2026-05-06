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
import { concatBytes, uint32ToBytesBE, stringToBytes } from "./utils.js";

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
 */
export function buildChunkAad(shareId: string, chunkIndex: number): Uint8Array {
  return concatBytes(stringToBytes(shareId), uint32ToBytesBE(chunkIndex));
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
