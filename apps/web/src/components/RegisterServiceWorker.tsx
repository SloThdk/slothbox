// Service-worker registration on mount.
//
// Loaded from app/layout.tsx as a client component so the SW lifecycle
// runs only in the browser, after the first paint. We register
// asynchronously and intentionally swallow registration errors — a
// failing SW must never break the main app (it's a progressive
// enhancement, not a hard dependency).
//
// We also DO NOT register in development. The Next.js dev server's
// HMR layer doesn't play well with a SW that intercepts fetches, and
// debugging "why is my hot reload caching the old bundle" is worse
// than not having the SW locally.

"use client";

import * as React from "react";

export function RegisterServiceWorker() {
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    // Use the standard `/sw.js` path — Next.js serves `public/sw.js`
    // verbatim at the document root, no rewrite needed.
    void navigator.serviceWorker.register("/sw.js").catch(() => {
      // Registration failures land here on private-tab / iframe contexts
      // and on origins that haven't yet propagated HTTPS. Don't surface
      // — the rest of the app works fine without the SW.
    });
  }, []);
  return null;
}
