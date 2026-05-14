self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open('installer-s-v1').then(cache => 
      cache.addAll(['/code/installer-s/', '/code/installer-s/index.html'])
    )
  );
});
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});