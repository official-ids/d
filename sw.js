const CACHE_NAME = 'seraviel-labs-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/apps/manifest.json',
  '/sitemap.xml'
  // Сюда можно добавить основные CSS/JS если они вынесены, 
  // но у нас все в index.html, так что этого хватит для старта
];

// 1. Установка (Кэшируем базу)
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// 2. Активация (Чистим старые кэши)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (key !== CACHE_NAME) {
          return caches.delete(key);
        }
      }));
    })
  );
  return self.clients.claim();
});

// 3. Перехват запросов (Сеть сначала, если нет — кэш)
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Если есть интернет, обновляем кэш
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return response;
      })
      .catch(() => {
        // Если нет интернета (офлайн), берем из кэша
        return caches.match(event.request);
      })
  );
});