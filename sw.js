const CACHE = 'sondhan-v4';
const FILES = ['/index.html', '/style.css', '/fonts.css', '/sondhan-logo.png'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // ✅ Fixed: navigation requests (HTML/CSS) → network-first so updates reach users
  // Static assets (images, fonts) → cache-first for speed
  const isNavigation = e.request.mode === 'navigate';
  if (isNavigation) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
  } else {
    e.respondWith(
      caches.match(e.request).then(r => r || fetch(e.request))
    );
  }
});