// ══════════════════════════════════════════════════════════
// Sondhan — Service Worker
// কাজ: app shell (HTML/CSS/JS/icon) ক্যাশ করে অফলাইনেও পেজ খোলা রাখে।
// Firebase/Firestore ডেটা এখানে ছোঁয়া হয় না — সেটা Firestore-এর
// নিজস্ব offline persistence (firebase-config.js-এ enable করা) সামলায়।
// ══════════════════════════════════════════════════════════

// নতুন deploy-এ কোনো ফাইল বদলালে এই ভার্সন নাম্বার বাড়িয়ে দিন,
// নাহলে ইউজাররা পুরনো ক্যাশ করা ফাইল দেখতে থাকবে।
const CACHE_VERSION = 'sondhan-v1';
const APP_SHELL = [
  './',
  './index.html',
  './search.html',
  './request.html',
  './profile.html',
  './register.html',
  './login.html',
  './signup.html',
  './about.html',
  './admin.html',
  './ambulance.html',
  './offline.html',
  './style.css',
  './app.js',
  './firebase-config.js',
  './auth-guard.js',
  './manifest.json',
  './sondhan-logo.png',
  './logo.jpeg',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
      .catch(err => console.warn('SW install cache error:', err))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names =>
      Promise.all(
        names.filter(n => n !== CACHE_VERSION).map(n => caches.delete(n))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;

  // শুধু GET, এবং শুধু নিজেদের origin — Firebase/Google Fonts/gstatic
  // request-এ হাত দেওয়া হয় না, ওগুলো সরাসরি নেটওয়ার্কে যাক
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) {
    return;
  }

  // পেজ navigation (কেউ URL খুলছে/লিংকে ক্লিক করছে)
  // → নেটওয়ার্ক আগে চেষ্টা, না পেলে ক্যাশ, তাও না পেলে offline.html
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then(c => c.put(req, copy));
          return res;
        })
        .catch(() =>
          caches.match(req).then(cached => cached || caches.match('./offline.html'))
        )
    );
    return;
  }

  // static asset (css/js/image) → cache-first, ব্যাকগ্রাউন্ডে আপডেট করে রাখে
  event.respondWith(
    caches.match(req).then(cached => {
      const network = fetch(req)
        .then(res => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then(c => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached); // অফলাইনে network fail করলে cache-ই ফেরত
      return cached || network;
    })
  );
});