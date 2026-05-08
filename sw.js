const CACHE_NAME = 'seraviel-labs-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/apps/manifest.json',
  '/sitemap.xml'
];

// === 1. Установка ===
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
  self.skipWaiting();
});

// === 2. Активация (чистим старый кэш) ===
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) =>
      Promise.all(keyList.map((key) => {
        if (key !== CACHE_NAME) return caches.delete(key);
      }))
    )
  );
  return self.clients.claim();
});

// === 3. Перехват запросов (ГЛАВНОЕ ИСПРАВЛЕНИЕ) ===
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // ❌ ФИЛЬТР: Игнорируем не-http запросы (расширения, devtools, и т.д.)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return;
  }
  
  // ❌ ФИЛЬТР: Игнорируем chrome-extension://, moz-extension://, etc.
  if (url.hostname.endsWith('.chromium.org') || url.hostname === '') {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Кэшируем только успешные ответы (status 200)
        if (response.status === 200) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            // Дополнительная защита: try/catch на случай некешируемых типов
            try {
              cache.put(event.request, responseToCache);
            } catch (e) {
              // Игнорируем ошибки кэширования (например, opaque responses)
            }
          });
        }
        return response;
      })
      .catch(() => {
        // Офлайн: пробуем вернуть из кэша
        return caches.match(event.request);
      })
  );
});