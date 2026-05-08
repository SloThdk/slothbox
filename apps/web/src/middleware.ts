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
 *  - `connect-src` is the explicit allowlist of origins the browser can
 *    fetch / WebSocket to: 'self' plus the build-time NEXT_PUBLIC_* env
 *    vars for the api-gateway, ingest service, and WebSocket endpoint.
 *    No wildcard `https:` / `wss:` — those would defeat the purpose of
 *    listing the explicit URLs in the first place.
 *  - `'strict-dynamic'` is critical — without it, every chunk file webpack
 *    splits to would need an explicit hash and the policy would become a
 *    maintenance nightmare.
 *  - No `'unsafe-inline'` on `script-src`. The nonce + strict-dynamic
 *    combo covers every script Next.js emits at runtime; 'unsafe-inline'
 *    as a "legacy fallback" reads as escape-hatch in code review and the
 *    target browsers (anything older than Chrome 52 / Firefox 52 / Safari
 *    15.4) are not in the audience for an alpha encrypted-file-transfer
 *    build. Defense-in-depth for inline-script attacks lives in
 *    `frame-ancestors`, `base-uri`, `object-src`, `form-action` —
 *    documented in the directive list below.
 */
function buildCsp(nonce: string): string {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "";
  const wsUrl = process.env.NEXT_PUBLIC_WS_URL ?? "";
  const ingestUrl = process.env.NEXT_PUBLIC_INGEST_URL ?? "";

  // Explicit connect-src allowlist — no wildcards. 'self' covers
  // same-origin fetches; the three URLs cover the runtime-known
  // cross-origin targets (api-gateway / ingest / WebSocket).
  const connectSrc = ["'self'", apiUrl, wsUrl, ingestUrl].filter(Boolean).join(" ");

  // Each directive on its own line for legibility; collapsed below.
  const directives = [
    "default-src 'self'",
    // Strict CSP: nonce gates the framework's inline scripts;
    // strict-dynamic delegates trust to scripts those nonced scripts
    // load. wasm-unsafe-eval permits the libsodium WASM hydration.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'`,
    // Tailwind v4 inlines runtime styles. 'unsafe-inline' is acceptable
    // for style-src — XSS via injected style is a much narrower attack
    // surface than via injected script and Tailwind has no nonce path.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${connectSrc}`,
    "worker-src 'self' blob:",
    "child-src 'none'",
    // Defense-in-depth — these are the directives that ACTUALLY back up
    // the strict-CSP claim against script-injection abuse, regardless of
    // what script-src does:
    //   - frame-ancestors 'none' kills clickjacking via iframe embedding
    //   - base-uri 'self' prevents <base> tag injection redirecting
    //     relative script src to attacker-controlled origins
    //   - form-action 'self' prevents form-data exfil to a third party
    //   - object-src 'none' kills the legacy <object>/<embed>/<applet>
    //     plugin-loading vector entirely
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    // Browsers auto-upgrade any http:// reference to https:// at runtime.
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
