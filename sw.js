// ══════════════════════════════════════════════════════════
// Sondhan — Service Worker
// কাজ: app shell (HTML/CSS/JS/icon) ক্যাশ করে অফলাইনেও পেজ খোলা রাখে।
// Firebase/Firestore ডেটা এখানে ছোঁয়া হয় না — সেটা Firestore-এর
// নিজস্ব offline persistence (firebase-config.js-এ enable করা) সামলায়।
// ══════════════════════════════════════════════════════════

// নতুন deploy-এ কোনো ফাইল বদলালে এই ভার্সন নাম্বার বাড়িয়ে দিন।
const CACHE_VERSION = 'sondhan-v46-no-cross-origin';
const APP_SHELL = [
  './index.html',
  './search.html',
  './request.html',
  './profile.html',
  './register.html',
  './donor.html',
  './login.html',
  './signup.html',
  './about.html',
  './privacy.html',
  './terms.html',
  './admin.html',
  './ambulance.html',
  './bloodbank.html',
  './offline.html',
  './style.css',
  './app.js',
  './firebase-config.js',
  './firebase-config-auth.js',
  './auth-guard.js',
  './manifest.json',
  './sondhan-logo.png',
  './sondhan-logo-white.png',
  './logo.jpeg',
  './icon-192.png',
  './icon-512.png'
];

// ROOT CAUSE (production incident, প্রমাণিত): আগে এই SW gstatic.com-এর Firebase
// SDK URL ধরে নিজে fetch() করত। কিন্তু vercel.json-এর CSP-তে connect-src-এ
// gstatic.com নেই, আর SW-এর নিজের fetch() সেই CSP মেনে চলে — ফলে fetch
// সঙ্গে সঙ্গে (~১০ms) block হতো, cache খালি থাকত, আর respondWith(undefined)
// হওয়ায় ব্রাউজার "Failed to fetch dynamically imported module" দিত। প্রায়
// প্রতিটা পেজ Firebase gstatic থেকে import করে, তাই সব ফিচার একসাথে ভেঙেছিল।
// (কাজ করছিল শুধু যতদিন পুরনো ভার্সনের cache টিকে ছিল; CACHE_VERSION বাড়ালেই
// সেটা মুছে গিয়ে আর ফেরেনি।)
// নিয়ম: এই SW কখনো cross-origin request ধরবে না (Firebase/Fonts/Google সব
// সরাসরি ব্রাউজারে যাবে — ব্রাউজারের নিজস্ব HTTP cache-ই যথেষ্ট), আর কখনো
// কোনো request-এর উত্তরে undefined দেবে না।

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache =>
      // প্রতিটা ফাইল আলাদাভাবে — একটা fail করলে বাকিগুলো cache হয়
      Promise.allSettled(
        APP_SHELL.map(url =>
          cache.add(url).catch(err => {
            console.warn('[SW] cache করা যায়নি:', url, err.message);
            return null;
          })
        )
      )
    ).then(() => self.skipWaiting())
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

// plain fetch()-এর নিজস্ব timeout নেই; ঝুলে থাকা request-এ fallback চালু
// করতে timeout লাগে।
function fetchWithTimeout(req, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('sw-fetch-timeout')), ms);
    fetch(req).then(res => { clearTimeout(t); resolve(res); }, err => { clearTimeout(t); reject(err); });
  });
}

function putInCache(req, res) {
  if (res && res.ok && res.type === 'basic') {
    const copy = res.clone();
    caches.open(CACHE_VERSION).then(c => c.put(req, copy)).catch(() => {});
  }
}

self.addEventListener('fetch', event => {
  const req = event.request;

  // শুধু GET, শুধু নিজেদের origin। বাকি সব ব্রাউজার নিজে সামলায়।
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) {
    return;
  }

  // HTML পেজ, JS, CSS, JSON → network-first (timeout সহ), না পেলে cache।
  // এতে HTML ও JS সবসময় একই deploy-এর হয় (পুরনো HTML + নতুন JS মিশ্রণ হয় না)।
  const path = new URL(req.url).pathname;
  const isCode = req.mode === 'navigate' || /\.(?:html|js|css|json)$/.test(path) || path === '/' ;
  if (isCode) {
    event.respondWith(
      fetchWithTimeout(req, req.mode === 'navigate' ? 6000 : 8000)
        .then(res => { putInCache(req, res); return res; })
        .catch(async () => {
          const cached = await caches.match(req);
          if (cached) return cached;
          // শুধু পেজ navigation-এ offline.html; JS/CSS-এ কখনো HTML ফেরত নয়
          if (req.mode === 'navigate') {
            const off = await caches.match('./offline.html');
            if (off) return off;
          }
          return Response.error();
        })
    );
    return;
  }

  // ছবি/ফন্ট ইত্যাদি → cache-first, না থাকলে network। কখনো undefined নয়।
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => { putInCache(req, res); return res; });
    })
  );
});
