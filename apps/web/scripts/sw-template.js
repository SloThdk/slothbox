// === TEMPLATE-ONLY-START ===
// This file is the SOURCE OF TRUTH for the service worker.
//
// scripts/build-sw.mjs (wired into the `dev` and `build` scripts in
// package.json) reads this file, strips this template-only block,
// substitutes __BUILD_CACHE_VERSION__ with the current build SHA, and
// writes the result to public/sw.js. That generated file is what the
// browser fetches at /sw.js.
//
// DO NOT bump the version manually anywhere. Substitution makes every
// prod deploy ship a unique CACHE_NAME automatically so brand-asset and
// shell changes evict on the next visitor's SW activation. The
// v0.2.5 → v0.2.6 brand refresh shipped invisibly to existing tabs
// because the old hardcoded version string didn't move; this template
// kills that failure mode.
//
// DO NOT edit /public/sw.js directly. It is generated and gitignored.
// === TEMPLATE-ONLY-END ===

// SlothBox service worker.
//
// Two responsibilities, deliberately minimal:
//
//   1. Cache the app shell so the install / decrypt flow keeps working
//      on a flaky connection. We only cache the route's HTML + the
//      Next.js asset chunks loaded by the first paint — not user data,
//      not share metadata, not chunk ciphertexts.
//
//   2. Pass-through everything else. The encrypted-share routes
//      (/api/*, /chunk/*) MUST always hit the network — caching a
//      stale share descriptor or chunk would break burn-after-read
//      and the single-use chunk-token semantics from v0.2.
//
// What this worker does NOT do:
//   - Background sync (we don't queue uploads — those depend on
//     fresh share-create state from the gateway)
//   - Push notifications (no notification surface yet)
//   - Cache user-supplied content (zero by design — the worker only
//     touches the Next.js build output)

// Substituted at build time from NEXT_PUBLIC_BUILD_SHA. Local builds
// without a SHA get "dev" so the SW is identifiable as a local artifact,
// never as a stale prod build masquerading as fresh.
const CACHE_NAME = "slothbox-shell-__BUILD_CACHE_VERSION__";

// Shell URLs we precache during install. Keep this list short — the
// rest of the bundle gets cached on first navigation via the
// "cache-on-network-success" pattern below.
const SHELL_URLS = ["/", "/s/", "/about", "/security"];

// Routes we MUST NOT cache. Each match short-circuits the fetch
// handler to a plain `fetch(event.request)` pass-through.
//
// Brand assets (/icon.svg, /apple-icon, /manifest.webmanifest) are
// intentionally NOT in this list — Next.js emits hashed URLs for them,
// so HTTP-cache invalidation works naturally on file change. The SW
// adds offline-first behaviour, and the CACHE_NAME rotation above
// evicts stale copies on every deploy.
const NEVER_CACHE_PREFIXES = ["/api/", "/chunk/", "/healthz", "/metrics"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // Precache failures are non-fatal — the SW activates even if
      // one shell URL 404s in dev. Use `addAll` with a tolerance loop
      // rather than the strict `addAll` so one bad URL doesn't kill
      // the whole install.
      await Promise.all(
        SHELL_URLS.map((url) =>
          cache.add(new Request(url, { cache: "reload" })).catch(() => {
            /* tolerant — see comment above */
          })
        )
      );
      // Skip the typical "old SW shutting down" wait — we want the
      // new shell to take over on the next navigation.
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Evict stale shells from previous deploys.
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Cross-origin requests (the ingest service, any third-party CDN)
  // are pass-through. We never sit in front of the encrypted-chunk
  // path — the recipient's tab MUST see the live 410 Gone signal on
  // a single-use chunk that was already redeemed, not a cached
  // 200 from an earlier successful fetch.
  if (new URL(request.url).origin !== self.location.origin) {
    return;
  }

  // Anything mutating goes straight to the network, no cache touch.
  if (request.method !== "GET") {
    return;
  }

  const path = new URL(request.url).pathname;
  for (const prefix of NEVER_CACHE_PREFIXES) {
    if (path.startsWith(prefix)) {
      return;
    }
  }

  // Stale-while-revalidate for everything else: respond from cache
  // immediately when we have it, fire a background fetch to refresh
  // the entry. New entries land in the cache for next time.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      const networkPromise = fetch(request)
        .then((response) => {
          // Only cache 2xx — caching a 404 would mask a real
          // server-side issue on the next visit.
          if (response.ok && response.status < 300) {
            // Clone before storing; the original response is the one
            // we return to the consumer.
            void cache.put(request, response.clone());
          }
          return response;
        })
        .catch(() => null);
      // Cache hit wins on latency; refresh runs in the background.
      // No cache + network failure → propagate the failure so the
      // browser shows its native offline page rather than a stale 200.
      if (cached) {
        return cached;
      }
      const network = await networkPromise;
      if (network) return network;
      return new Response("Offline and no cached copy", {
        status: 503,
        statusText: "Service Unavailable",
      });
    })()
  );
});
