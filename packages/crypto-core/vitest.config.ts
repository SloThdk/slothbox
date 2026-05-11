import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// libsodium-wrappers (both slim and -sumo) v0.7.16 ships a broken ESM
// build — the .mjs entry imports a sibling libsodium*.mjs that is not
// present in the published `files` array (see
// https://github.com/jedisct1/libsodium.js/issues/308). We force the
// CJS entry via a resolve alias.
//
// Constructing the path from disk because each package's `exports`
// field blocks subpath resolution via require.resolve. With
// node-linker=hoisted the packages live at the workspace root, two
// levels up from this config file (packages/crypto-core/).
const here = dirname(fileURLToPath(import.meta.url));
const cjsEntry = (pkg: string, file: string): string =>
  resolve(here, "..", "..", "node_modules", pkg, "dist", "modules", file);
const sumoEntry = (pkg: string): string =>
  resolve(here, "..", "..", "node_modules", pkg, "dist", "modules-sumo", "libsodium-wrappers.js");

export default defineConfig({
  resolve: {
    alias: {
      // Slim build — kept for legacy code paths that still import it.
      "libsodium-wrappers": cjsEntry("libsodium-wrappers", "libsodium-wrappers.js"),
      // Sumo build — required for Argon2id (`crypto_pwhash`) used by
      // `deriveKeyFromPassword`. The published ESM file references a
      // sibling `libsodium-sumo.mjs` that pnpm hoisting puts in the
      // sibling `libsodium-sumo` package's dist, not inside
      // `libsodium-wrappers-sumo/dist/modules-sumo-esm/` where the
      // import expects it. The CJS build bundles both halves so the
      // alias-to-CJS workaround sidesteps the broken relative import.
      "libsodium-wrappers-sumo": sumoEntry("libsodium-wrappers-sumo"),
    },
  },
  test: {
    environment: "node",
    pool: "forks",
    // Argon2id at the SLOWEST cost parameters this test file uses
    // (`opsLimit=1`, `memLimit=8 MiB`) is ~150 ms per derivation on a
    // 2022 laptop. The derivation suite calls it ~25× across cases,
    // so giving the suite a 30 s ceiling keeps CI from killing it
    // under slow runners while still failing fast on any real hang.
    testTimeout: 30_000,
  },
});
