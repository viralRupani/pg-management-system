/*
 * Minimal PWA service worker — gives an installable, offline-launchable shell.
 *
 * Strategy:
 *  - Navigations (HTML): network-first, fall back to the cached shell offline.
 *  - Immutable build assets (/_next/static/, content-hashed) + the PWA shell
 *    files (manifest, icons): stale-while-revalidate.
 *  - EVERYTHING else — API, cross-origin (S3 presigned, branding), and
 *    crucially Next's un-hashed RSC navigation payloads (*.txt) — is never
 *    touched: straight to network. Caching RSC payloads is what broke client
 *    navigations after a redeploy ("Cannot read properties of null (reading
 *    'enqueueModel')"): the flight client got a payload from one build with
 *    chunks from another.
 *
 * CACHE_VERSION is bumped on every deploy so an S3 redeploy can't pin users to
 * a stale JS bundle. skipWaiting + clients.claim make the new SW take over at
 * once and the activate handler deletes every old cache.
 */
const CACHE_VERSION = "pg-resident-v2";

/** Exact-path shell files worth caching besides /_next/static/. */
const SHELL_PATHS = new Set([
  "/manifest.webmanifest",
  "/icon.svg",
  "/icon-maskable.svg",
]);

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_VERSION));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Only handle our own origin; let API + S3 + everything cross-origin pass through.
  if (url.origin !== self.location.origin) return;

  // Navigations → network-first with a cached fallback (offline launch).
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(CACHE_VERSION);
          cache.put(req, fresh.clone());
          return fresh;
        } catch {
          const cache = await caches.open(CACHE_VERSION);
          return (
            (await cache.match(req)) ||
            (await cache.match("/")) ||
            Response.error()
          );
        }
      })(),
    );
    return;
  }

  // Cache ONLY immutable hashed build assets + the PWA shell files. Anything
  // else same-origin (RSC .txt payloads, dev-server chunks/HMR) goes straight
  // to the network — serving those stale breaks client-side navigation.
  const cacheable =
    url.pathname.startsWith("/_next/static/") || SHELL_PATHS.has(url.pathname);
  if (!cacheable) return;

  // Stale-while-revalidate.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      const cached = await cache.match(req);
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200) cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })(),
  );
});
