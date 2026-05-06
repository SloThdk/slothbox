// SlothBox crypto-core
//
// All cryptographic operations live here. Audited primitives only — see
// CONTRIBUTING.md for the rules around touching this file.

export * from "./symmetric.js";
export * from "./derivation.js";
export * from "./utils.js";

import sodium from "libsodium-wrappers-sumo";

let _ready: Promise<void> | null = null;

/**
 * Initialise libsodium. Call once at app startup; subsequent calls are no-ops.
 * All other functions in this package call this internally.
 */
export async function initCrypto(): Promise<void> {
  if (!_ready) {
    _ready = sodium.ready;
  }
  await _ready;
}
