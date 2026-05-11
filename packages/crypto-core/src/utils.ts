// Small encoding helpers. Wrappers around browser primitives — no custom logic.

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlToBytes(s: string): Uint8Array {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice(0, (4 - (s.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

export function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

export function uint32ToBytesBE(n: number): Uint8Array {
  const out = new Uint8Array(4);
  out[0] = (n >>> 24) & 0xff;
  out[1] = (n >>> 16) & 0xff;
  out[2] = (n >>> 8) & 0xff;
  out[3] = n & 0xff;
  return out;
}

export function stringToBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

export function bytesToString(b: Uint8Array): string {
  return new TextDecoder().decode(b);
}

/**
 * SHA-256 digest via WebCrypto / Node's `crypto.subtle`.
 *
 * Used for the sender-revoke-token commitment (migration 0006):
 * the sender's browser generates a 32-byte random token, hashes it,
 * and ships only the hash to the gateway. The gateway hashes the
 * incoming token at revoke time and compares via `timingSafeEqual`.
 *
 * Why SHA-256 and not BLAKE2b (which the rest of crypto-core uses):
 *   The boundary for this primitive is HTTP, not the AEAD pipeline.
 *   Node's `crypto.createHash('sha256')` is in the stdlib; WebCrypto's
 *   `subtle.digest('SHA-256', …)` is in every modern browser. Using
 *   SHA-256 means the gateway never has to import libsodium just to
 *   verify a token. Collision-resistance for a 32-byte uniform-random
 *   preimage is identical between the two functions for this use case.
 *
 * @returns Promise of a 32-byte digest
 */
export async function sha256(input: Uint8Array): Promise<Uint8Array> {
  // `crypto.subtle` is available in:
  //   - modern browsers (window.crypto.subtle)
  //   - Node 20+ (globalThis.crypto.subtle)
  // SlothBox targets both, so the unqualified reference is fine.
  //
  // TS 5.7 narrowed `BufferSource` to require an `ArrayBuffer`-backed
  // view (not `SharedArrayBuffer`), so we pass `input.buffer` after
  // casting through `ArrayBuffer` — at runtime libsodium's outputs are
  // always plain ArrayBuffer-backed. The cast is type-only; no
  // allocation, no copy.
  const digest = await crypto.subtle.digest("SHA-256", input as Uint8Array<ArrayBuffer>);
  return new Uint8Array(digest);
}

/**
 * Generate a 32-byte random token suitable for sender-revoke (migration
 * 0006) or any other "one-time bearer credential" use case.
 *
 * This is a thin wrapper around `symmetric.ts → generateKey` semantically
 * — same primitive (`randombytes_buf(32)`), different name to make intent
 * clear at the call site. Callers that need a 32-byte uniform random
 * value for AEAD key purposes should keep using `generateKey`; callers
 * minting a revoke / bearer / one-shot capability should use this.
 */
export async function generateRevokeToken(): Promise<Uint8Array> {
  // Lazy-import to avoid a circular dep with index.ts (which re-exports
  // utils). The libsodium init lives in symmetric.ts and is idempotent.
  const { default: sodium } = await import("libsodium-wrappers-sumo");
  await sodium.ready;
  return sodium.randombytes_buf(32);
}
