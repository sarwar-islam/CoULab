// ============================================================================
// DLAS service worker (T10 — low-bandwidth PWA).
// Cache policy is deliberately conservative (guardrail):
//   - ONLY the app shell (static assets) is cached.
//   - API responses (case data) are NEVER cached — no sensitive data on disk.
//   - Network-first for navigation with cache fallback so the shell opens
//     offline; API calls simply fail visibly when offline (T9 queue handles
//     submissions).
//   - Static assets use STALE-WHILE-REVALIDATE: clients immediately self-heal
//     after a redesign instead of serving a stale CSS/JS bundle.
//     (v2: bumped after the premium-UI rebuild to purge all v1 shells.)
//     (v3: bumped after the responsive-shell fix — sidebar now from md.)
// ============================================================================

const CACHE = "dlas-shell-v3";
const SHELL = ["/", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Never cache API traffic (case data stays off shared-device storage)
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(event.request));
    return;
  }

  // App shell: network-first, fall back to cache when offline
  if (event.request.mode === "navigate" || SHELL.includes(url.pathname)) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          }
          return res;
        })
        .catch(() => caches.match(event.request).then((r) => r ?? caches.match("/")))
    );
    return;
  }

  // Other static assets: stale-while-revalidate — instant cache hit, refresh
  // in the background. Prevents stale-bundle "UI bugs" after deployments.
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(event.request);
      const network = fetch(event.request)
        .then((res) => {
          if (res && res.ok) cache.put(event.request, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached ?? network;
    })
  );
});
