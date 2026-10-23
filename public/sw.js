/* Minimal offline-first service worker: cache app shell, network-first for navigations.
 *
 * __BUILD_ID__ is replaced at build time (vite.config.ts) so the cache name
 * rotates on every deploy; `activate` then purges every older cache.
 */
const VERSION = '__BUILD_ID__';
const CACHE = `easy-rss-${VERSION}`;
const SHELL = ['/', '/index.html', '/manifest.json', '/favicon.svg', '/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  // Only handle same-origin requests; RSS feeds always go to network.
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put('/index.html', copy));
        return res;
      }).catch(() => caches.match('/index.html')),
    );
    return;
  }
  event.respondWith(
    caches.match(request).then((hit) => {
      const miss = fetch(request).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return res;
      }).catch(() => hit);
      return hit || miss;
    }),
  );
});
