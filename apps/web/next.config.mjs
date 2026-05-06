// Next.js configuration for @slothbox/web
//
// We deploy this app inside a Docker container on a plain Hetzner box, NOT to
// Vercel or Cloudflare Pages. `output: "standalone"` is the build target — it
// produces a self-contained `.next/standalone/` directory we can copy into a
// minimal Node 20 Alpine runtime image (see Dockerfile).
//
// Security headers are applied at the Next layer as defence-in-depth on top of
// the Caddy reverse proxy. They are intentionally strict; any future addition
// (third-party script, embed, etc.) MUST be reviewed here first.

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// libsodium-wrappers v0.7.16 ships a broken ESM build (the .mjs entry imports
// a sibling libsodium.mjs that is not present in the published `files` array —
// see https://github.com/jedisct1/libsodium.js/issues/308). We force the CJS
// entry via a webpack alias. Same workaround appears in
// packages/crypto-core/vitest.config.ts.
//
// With node-linker=hoisted (see .npmrc), libsodium-wrappers lives at the
// workspace root node_modules. Build the absolute path so the alias is
// stable regardless of which workspace package triggers the import.
const libsodiumCjsEntry = resolve(
  __dirname,
  "..",
  "..",
  "node_modules",
  "libsodium-wrappers",
  "dist",
  "modules",
  "libsodium-wrappers.js"
);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",

  // Pin file-tracing root to the monorepo root. Without this Next walks up
  // looking for a lockfile and may pick a stray one in $HOME — that produces
  // a noisy warning and (worse) wrong tracing for the standalone output.
  outputFileTracingRoot: resolve(__dirname, "..", ".."),

  // Workspace dependency that ships TypeScript source rather than compiled JS.
  // Next 15 needs the explicit transpile so the libsodium ESM imports work in
  // both the server bundle and the client bundle.
  transpilePackages: ["@slothbox/crypto-core"],

  // Disable the X-Powered-By header for parity with Caddy fingerprint stripping.
  poweredByHeader: false,

  // Default-deny security headers. Tightened CSP is intentionally inline-script
  // friendly only for the Next runtime ('unsafe-inline' on style-src is a
  // deliberate trade-off Tailwind v4 + the Next dev runtime require; it does
  // NOT apply to script-src).
  async headers() {
    const isDev = process.env.NODE_ENV !== "production";
    const csp = [
      "default-src 'self'",
      // 'wasm-unsafe-eval' is what modern libsodium-wrappers actually needs
      // for its WebAssembly bootstrap — full 'unsafe-eval' would let any
      // injected script run arbitrary JS via Function().
      // Dev also gets 'unsafe-eval' + 'unsafe-inline' for Next's hot-reload
      // runtime, which is acceptable because dev never faces real users.
      `script-src 'self' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval' 'unsafe-inline'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      // Browser ↔ gateway (REST) + browser ↔ ingest (chunk PUTs) + WebSocket.
      // The wildcards expand at build time from NEXT_PUBLIC_* env vars below.
      `connect-src 'self' ${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3022"} ${process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:3022"} ${process.env.NEXT_PUBLIC_INGEST_URL ?? "http://localhost:3023"}`,
      "worker-src 'self' blob:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; ");

    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },

  // The libsodium WASM module needs `node:` polyfills disabled in the browser
  // bundle; Next 15 + Webpack 5 handles this by default but we make it explicit
  // so a future tooling upgrade doesn't silently regress.
  //
  // We also wire two aliases:
  //  1. extensionAlias — TypeScript ESM source uses `./foo.js` to import
  //     `./foo.ts` (per the TS handbook recommendation). Webpack doesn't follow
  //     that convention by default, so we add the explicit mapping.
  //  2. libsodium-wrappers → CJS entry — works around the broken ESM packaging
  //     in v0.7.16. Same workaround as in packages/crypto-core/vitest.config.ts.
  webpack(config, { isServer }) {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        crypto: false,
        fs: false,
        path: false,
      };
    }

    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js", ".jsx"],
      ".mjs": [".mts", ".mjs"],
    };

    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "libsodium-wrappers$": libsodiumCjsEntry,
    };

    return config;
  },
};

export default nextConfig;
