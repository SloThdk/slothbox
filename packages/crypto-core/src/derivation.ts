// Password-based key derivation — Argon2id.
//
// Used in v0.5+ for password-protected shares. Wrapper around libsodium's
// crypto_pwhash (which is Argon2id under the hood).

import sodium from "libsodium-wrappers-sumo";

let ready: Promise<void> | null = null;
async function ensureReady(): Promise<void> {
  if (!ready) {
    ready = sodium.ready;
  }
  await ready;
}

export const SALT_BYTES = 16;
export const DERIVED_KEY_BYTES = 32;

// Production-grade defaults. Increase only after benchmarking on the target
// hardware. Do NOT decrease without security review.
export const DEFAULT_OPS_LIMIT = 3;
export const DEFAULT_MEM_LIMIT = 64 * 1024 * 1024; // 64 MiB

export async function generateSalt(): Promise<Uint8Array> {
  await ensureReady();
  return sodium.randombytes_buf(SALT_BYTES);
}

export async function deriveKeyFromPassword(params: {
  password: string;
  salt: Uint8Array;
  opsLimit?: number;
  memLimit?: number;
}): Promise<Uint8Array> {
  await ensureReady();

  if (params.salt.length !== SALT_BYTES) {
    throw new Error(`salt must be ${SALT_BYTES} bytes`);
  }
  if (params.password.length === 0) {
    throw new Error("password must not be empty");
  }

  return sodium.crypto_pwhash(
    DERIVED_KEY_BYTES,
    params.password,
    params.salt,
    params.opsLimit ?? DEFAULT_OPS_LIMIT,
    params.memLimit ?? DEFAULT_MEM_LIMIT,
    sodium.crypto_pwhash_ALG_ARGON2ID13
  );
}
