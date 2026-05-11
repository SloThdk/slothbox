// Type shim for `libsodium-wrappers-sumo`.
//
// The `libsodium-wrappers-sumo` npm package does not ship its own
// TypeScript declarations, but the API surface is a strict superset of
// `libsodium-wrappers` (which DOES ship types via
// @types/libsodium-wrappers — covering every primitive the sumo build
// adds, including `crypto_pwhash` for Argon2id). Re-exporting the slim
// build's types under the sumo module name lets the crypto-core source
// stay strict-typed without us shipping a hand-rolled declaration of
// libsodium's full surface.

declare module "libsodium-wrappers-sumo" {
  import sodium from "libsodium-wrappers";
  export default sodium;
  export * from "libsodium-wrappers";
}
