import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// libsodium-wrappers v0.7.16 ships a broken ESM build (the .mjs entry
// imports a sibling libsodium.mjs that is not present in the published
// `files` array — see https://github.com/jedisct1/libsodium.js/issues/308).
// We force the CJS entry via a resolve alias.
//
// Constructing the path from disk because the package's `exports` field
// blocks subpath resolution via require.resolve.
// With node-linker=hoisted the package lives at the workspace root, two
// levels up from this config file (packages/crypto-core/).
const here = dirname(fileURLToPath(import.meta.url));
const cjsEntry = resolve(
  here,
  "..",
  "..",
  "node_modules",
  "libsodium-wrappers",
  "dist",
  "modules",
  "libsodium-wrappers.js"
);

export default defineConfig({
  resolve: {
    alias: {
      "libsodium-wrappers": cjsEntry,
    },
  },
  test: {
    environment: "node",
    pool: "forks",
  },
});
