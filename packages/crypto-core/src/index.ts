// SlothBox crypto-core — the entire trust boundary lives in this package.
//
// Design rules (documented in CONTRIBUTING.md; enforced by CODEOWNERS
// routing every change under this package through maintainer review):
//
//   1. AUDITED PRIMITIVES ONLY. No homemade ciphers, KDFs, or AEAD modes.
//      Everything must reduce to libsodium / age primitives that have already
//      been independently audited (NaCl → libsodium → multiple academic and
//      commercial audits since 2013).
//
//   2. NO KEY MATERIAL ESCAPES THIS PACKAGE. The web UI never sees a raw key
//      outside of an `Uint8Array` returned by `generateKey()`, which it then
//      base64url-encodes into the URL fragment. The fragment is the ONLY
//      place a SlothBox key is allowed to live in plaintext, because
//      browsers (per RFC 3986 §3.5) never include URI fragments in HTTP
//      requests — the server is mathematically prevented from logging it.
//
//   3. CONSTANT-TIME COMPARISONS. Anywhere this package compares secret
//      bytes (MAC tags, key prefixes, hashes), it MUST go through
//      `sodium.memcmp` or `crypto.subtle.timingSafeEqual` — never `===`.
//
//   4. DETERMINISTIC TEST VECTORS. Every primitive ships with a Wycheproof
//      / RFC test vector under `__tests__/vectors.json`. CI runs them on
//      every PR; a failure on any vector blocks merge.
//
//   5. DUAL-RUNTIME. This package compiles to ESM and runs in both the
//      browser (WebCrypto + libsodium-wrappers WASM) and Node (the same
//      libsodium-wrappers via `Buffer`). The shared API surface guarantees
//      that a server-side test of the encryption path exercises the exact
//      bytes the browser will produce — no separate desktop/server fork.
//
// Public surface — re-exports below — is deliberately small. If you find
// yourself needing a new primitive, add it in a separate, individually
// audited PR. See `docs/CRYPTO.md` for the full algorithm spec and
// `docs/THREAT_MODEL.md` for what we explicitly do NOT defend against.

export * from "./symmetric.js";
export * from "./derivation.js";
export * from "./utils.js";

import sodium from "libsodium-wrappers";

// libsodium ships its sumo build as WebAssembly. The WASM module needs to
// instantiate before any primitive can run; `sodium.ready` is the canonical
// promise that resolves once instantiation finishes. We cache it in module
// scope so the cost is paid exactly once per process / worker, regardless of
// how many call sites await initCrypto().
let _ready: Promise<void> | null = null;

/**
 * Initialise libsodium-wrappers.
 *
 * MUST be awaited before any other function in this package is called.
 * Idempotent — every public primitive in symmetric.ts / derivation.ts /
 * utils.ts awaits this internally, so callers usually don't have to. The
 * web UI calls it once during the first `<Encrypt>` mount; the API gateway
 * and ingest service call it during HTTP startup.
 *
 * Why the indirection (rather than `await sodium.ready` at every call site):
 * libsodium's `sodium.ready` is a one-shot promise — once it has resolved,
 * subsequent reads are synchronous, but the promise itself is allocated at
 * import time. Wrapping it lets us add observability hooks (timing, error
 * handling) without spreading them across every call site, and lets the
 * tests substitute a deterministic mock without monkey-patching libsodium.
 */
export async function initCrypto(): Promise<void> {
  if (!_ready) {
    _ready = sodium.ready;
  }
  await _ready;
}
