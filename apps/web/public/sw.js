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
//
// Versioning: bumping CACHE_NAME on every prod deploy is the cleanest
// way to evict stale chunks. The Next.js build emits hashed asset
// URLs so individual JS / CSS files rotate naturally; the suffix here
// only matters for the cached HTML responses.

// IMPORTANT: bump on every prod release. The `activate` listener deletes
// every cache whose name doesn't match this constant, so stale shell
// assets from a prior deploy (favicon, app-icon, manifest, JS chunks
// that survived the hashed-URL miss) evict on the next visitor's SW
// activation. Brand-asset changes between v0.2.2 and v0.2.5 were
// invisible to every existing tab because this string did not move.
const CACHE_NAME = "slothbox-shell-v0.2.6";

// Shell URLs we precache during install. Keep this list short — the
// rest of the bundle gets cached on first navigation via the
// "cache-on-network-success" pattern below.
const SHELL_URLS = ["/", "/s/", "/about", "/security"];

// Routes we MUST NOT cache. Each match short-circuits the fetch
// handler to a plain `fetch(event.request)` pass-through.
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
