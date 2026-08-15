const CACHE_NAME = 'cocoadesk-v2';

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE_NAME));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.pathname.startsWith('/api')) return;
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request).then((hit) => hit || caches.match('/')))
  );
});
