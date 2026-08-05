// ══════════════════════════════════════════════════════════
// Sondhan — Service Worker
// কাজ: app shell (HTML/CSS/JS/icon) ক্যাশ করে অফলাইনেও পেজ খোলা রাখে।
// Firebase/Firestore ডেটা এখানে ছোঁয়া হয় না — সেটা Firestore-এর
// নিজস্ব offline persistence (firebase-config.js-এ enable করা) সামলায়।
// ══════════════════════════════════════════════════════════

// নতুন deploy-এ কোনো ফাইল বদলালে এই ভার্সন নাম্বার বাড়িয়ে দিন,
// নাহলে ইউজাররা পুরনো ক্যাশ করা ফাইল দেখতে থাকবে।
const CACHE_VERSION = 'sondhan-v23';
const APP_SHELL = [
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
  './bloodbank.html',
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

// BUGFIX (৫ সেকেন্ডের লগইন-ফ্ল্যাশ): Firebase SDK (auth/firestore/app)
// gstatic.com থেকে আমদানি হয়, আর নিচের fetch handler cross-origin
// রিকোয়েস্ট এড়িয়ে যায় (ভালো কারণেই — fonts/অন্য cross-origin
// রিসোর্সে আগে সমস্যা হয়েছিল)। ফলে প্রতিবার পেজ লোডে Firebase SDK
// নতুন করে নেটওয়ার্ক থেকে নামতো — ধীর নেটওয়ার্কে onAuthStateChanged
// চালুই হতে কয়েক সেকেন্ড লেগে যেতো, তাই লগইন অবস্থা "উধাও" হয়ে
// কিছুক্ষণ পর ফিরে আসতো বলে মনে হতো। এই ৩টা URL সুনির্দিষ্টভাবে,
// শুধু এগুলোই cache করছি (fonts/অন্য কিছু ছোঁয়া হচ্ছে না) —
// এগুলো Firebase নিজেই CORS-enabled রাখে (ESM import সমর্থনের জন্য),
// তাই আগের cross-origin ক্যাশিং বাগের ঝুঁকি এখানে নেই।
const FIREBASE_SDK_URLS = [
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache =>
      // BUGFIX: cache.addAll() ছিল all-or-nothing — একটা ফাইল fetch
      // fail করলেই পুরো cache খালি থেকে যেতো, অথচ .catch() দিয়ে error
      // ঢাকা থাকায় install "সফল" দেখাতো। এখন প্রতিটা ফাইল আলাদাভাবে
      // cache হয় — একটা fail করলে বাকিগুলো ঠিকই cache থেকে যায়,
      // আর কোনটা fail করলো তা console-এ স্পষ্ট দেখা যায়।
      Promise.allSettled(
        [...APP_SHELL, ...FIREBASE_SDK_URLS].map(url =>
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

self.addEventListener('fetch', event => {
  const req = event.request;

  // Firebase SDK (auth/firestore/app) — সুনির্দিষ্ট এই ৩টা URL-ই
  // cache-first, ব্যাকগ্রাউন্ডে আপডেট করে রাখে। এর ফলে onAuthStateChanged
  // চালু হতে নেটওয়ার্কের অপেক্ষা করতে হয় না, লগইন অবস্থা সাথে সাথে বোঝা যায়।
  if (req.method === 'GET' && FIREBASE_SDK_URLS.includes(req.url)) {
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
          .catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

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
