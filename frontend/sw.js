/* Couponaut service worker — offline support + installable PWA.
   Strategy: network-first for same-origin GET (so code/content stays fresh),
   falling back to cache when offline. API calls and non-GET are never handled
   by the SW (auth/data must always hit the network). */
const CACHE = 'couponaut-v1';
const PRECACHE = [
  '/',
  '/assets/css/app.css',
  '/assets/js/api.js',
  '/assets/js/ui.js',
  '/manifest.json',
  '/icon.svg',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((c) => Promise.allSettled(PRECACHE.map((u) => c.add(u))))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle same-origin GET requests. Never touch the API or auth.
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        // Cache a fresh copy of successful responses for offline use.
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        // For page navigations, fall back to the cached home shell.
        if (req.mode === 'navigate') {
          const home = await caches.match('/');
          if (home) return home;
        }
        return new Response('You are offline.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
      })
  );
});
