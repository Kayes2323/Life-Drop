const CACHE = 'sondhan-v5';
const SAME_ORIGIN_FILES = [
  '/index.html',
  '/style.css',
  '/fonts.css',
  '/sondhan-logo.png',
  '/manifest.json'
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SAME_ORIGIN_FILES))
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // ── Cross-origin requests (Firebase, Google CDN, fonts) → always fetch fresh
  if(url.origin !== self.location.origin) {
    e.respondWith(fetch(e.request));
    return;
  }

  // ── Same-origin → cache first, fallback to network
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});