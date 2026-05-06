import { defineConfig } from "tsup";

// SlothBox API gateway — tsup bundle config.
//
// Workspace packages (@slothbox/db, @slothbox/crypto-core) are inlined
// (`noExternal`) so the runtime container doesn't need pnpm's symlinked
// .pnpm tree to resolve them. Without this, Node ESM hits ERR_MODULE_NOT_FOUND
// at startup because the workspace symlinks aren't present in the runtime
// node_modules layout.
//
// Everything else (hono, drizzle, postgres, ioredis, nats, pino, etc.) stays
// external — those are the npm-published deps the runtime image installs as
// flat node_modules.
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  minify: false,
  splitting: false,
  // Bundle workspace packages into the output so the runtime doesn't need
  // pnpm's symlinked .pnpm/ tree to resolve them.
  noExternal: ["@slothbox/db", "@slothbox/crypto-core"],
});
