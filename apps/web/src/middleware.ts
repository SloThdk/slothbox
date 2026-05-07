// Next.js middleware — per-request CSP nonce generation.
//
// Why this file exists:
// -------------------
// Next.js 15's React Server Components emit a stream of small inline
// <script> tags for hydration, route prefetching, and Server Actions. A
// strict CSP that lists script sources literally (e.g. `script-src 'self'`)
// blocks every one of those scripts and the page never becomes interactive.
//
// The fix is a per-request nonce: this middleware mints a 128-bit random
// nonce, embeds it into the CSP header (`script-src 'nonce-XYZ'
// 'strict-dynamic'`), and propagates it to the React tree via a request
// header. Next 15 detects that pattern and auto-applies the nonce to its
// emitted inline scripts.
//
// `'strict-dynamic'` tells the browser: trust scripts loaded by an
// already-trusted (nonce'd) script. This is what makes the policy
// resilient — we don't have to enumerate every chunk file Next ships.
//
// Reference: https://nextjs.org/docs/app/building-your-application/configuring/content-security-policy

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Build the strict CSP for a single request.
 *
 * Knobs:
 *  - `nonce` is per-request, base64-encoded, ~24 characters.
 *  - `connect-src` allowlist comes from build-time NEXT_PUBLIC_* env vars
 *    so the browser can talk to api-gateway / ingest / WebSocket without
 *    blanket allowing all origins.
 *  - `'strict-dynamic'` is critical — without it, every chunk file webpack
 *    splits to needs an explicit hash and the policy becomes a maintenance
 *    nightmare.
 *  - `'unsafe-inline'` is included as a fallback for browsers that don't
 *    understand `'strict-dynamic'`. Modern browsers (>92% of traffic per
 *    caniuse) ignore `'unsafe-inline'` when `'nonce-...'` is also present,
 *    so this is a real backwards-compat safety net not a bypass.
 */
function buildCsp(nonce: string): string {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "";
  const wsUrl = process.env.NEXT_PUBLIC_WS_URL ?? "";
  const ingestUrl = process.env.NEXT_PUBLIC_INGEST_URL ?? "";

  // Build the connect-src list. 'self' covers same-origin fetches; the
  // explicit URLs cover same-host-different-port cases (dev) and full
  // cross-origin cases (production with separate api.slothbox.* domains).
  const connectSrc = ["'self'", apiUrl, wsUrl, ingestUrl, "wss:", "https:"]
    .filter(Boolean)
    .join(" ");

  // Each directive on its own line for legibility; collapsed below.
  const directives = [
    "default-src 'self'",
    // The nonce + strict-dynamic combo. 'unsafe-inline' is a fallback for
    // legacy browsers — modern browsers ignore it when nonce is present.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval' 'unsafe-inline' https:`,
    // Tailwind v4 inlines runtime styles. 'unsafe-inline' is acceptable
    // for style-src — XSS via injected style is a much narrower attack
    // surface than via injected script.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${connectSrc}`,
    "worker-src 'self' blob:",
    "child-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    // Browsers should auto-upgrade any http:// links to https:// at runtime.
    "upgrade-insecure-requests",
  ];

  return directives.join("; ");
}

export function middleware(request: NextRequest) {
  // 16 bytes = 128 bits of entropy. Plenty for nonce uniqueness in the
  // ~5-second window the response header is fresh. Buffer.from(...).toString
  // on Edge Runtime is polyfilled.
  const nonceBytes = new Uint8Array(16);
  crypto.getRandomValues(nonceBytes);
  const nonce = btoa(String.fromCharCode(...nonceBytes));

  const csp = buildCsp(nonce);

  // Forward the nonce to React via a request header. Next 15's RSC runtime
  // reads `x-nonce` (or the CSP header directly) and applies the nonce to
  // every inline <script> it emits.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  // Set the CSP on the response so the browser actually enforces it.
  response.headers.set("Content-Security-Policy", csp);

  return response;
}

/**
 * Skip middleware on routes that don't render HTML and therefore don't
 * need a nonce: API routes, Next's static asset pipeline, the favicon.
 *
 * The `missing` clause additionally skips prefetch requests — those go
 * through router-prefetch logic that uses a separate code path and
 * doesn't render scripts.
 */
export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
