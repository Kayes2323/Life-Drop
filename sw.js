const CACHE = 'sondhan-v3';
const FILES = ['/', '/index.html', '/style.css', '/fonts.css', '/sondhan-logo.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)));
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});