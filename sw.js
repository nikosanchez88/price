const CACHE_NAME = 'price-tool-v6';
const CACHE_PREFIX = 'price-tool-';
const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './calculator.js',
  './script.js',
  './manifest.json',
  './icon.png',
  './icon-192.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names
          .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
          .map((name) => caches.delete(name)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Cache first: open instantly even on a weak signal, then refresh the cache
  // in the background so the next launch picks up any new version.
  const cachedResponse = caches.open(CACHE_NAME)
    .then((cache) => cache.match(request, { ignoreSearch: request.mode === 'navigate' }));
  const networkResponse = fetch(request).then(async (response) => {
    if (response.ok && !response.redirected) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  });
  event.waitUntil(networkResponse.catch(() => {}));

  event.respondWith(
    cachedResponse.then(async (cached) => {
      if (cached) return cached;
      try {
        return await networkResponse;
      } catch {
        if (request.mode === 'navigate') {
          const shell = await caches.match('./index.html');
          if (shell) return shell;
        }
        return Response.error();
      }
    }),
  );
});
