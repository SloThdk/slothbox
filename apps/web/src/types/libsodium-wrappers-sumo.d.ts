// Type shim for `libsodium-wrappers-sumo` in the web app's tsconfig scope.
//
// Mirrors `packages/crypto-core/src/types/libsodium-wrappers-sumo.d.ts`
// — duplicated rather than re-exported because tsconfig `include`
// arrays are package-local and ambient `declare module` only takes
// effect when the file is actually parsed by the consumer's compiler.
// Both shims point at the same upstream type package
// (@types/libsodium-wrappers), so they stay in lock-step automatically
// — no version-drift risk.

declare module "libsodium-wrappers-sumo" {
  import sodium from "libsodium-wrappers";
  export default sodium;
  export * from "libsodium-wrappers";
}
