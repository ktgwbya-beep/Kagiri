const CACHE_NAME = 'kagiri-cache-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/src/style.css',
  '/src/main.js',
  '/manifest.json',
  '/app_icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // リアルタイム性が最優先のSNSであるため、常にネットワーク優先とし、オフライン時のみキャッシュを返す
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});
