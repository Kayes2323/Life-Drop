// ══════════════════════════════════════════════════════════
// Sondhan — Service Worker
// কাজ: app shell (HTML/CSS/JS/icon) ক্যাশ করে অফলাইনেও পেজ খোলা রাখে।
// Firebase/Firestore ডেটা এখানে ছোঁয়া হয় না — সেটা Firestore-এর
// নিজস্ব offline persistence (firebase-config.js-এ enable করা) সামলায়।
// ══════════════════════════════════════════════════════════

// নতুন deploy-এ কোনো ফাইল বদলালে এই ভার্সন নাম্বার বাড়িয়ে দিন,
// নাহলে ইউজাররা পুরনো ক্যাশ করা ফাইল দেখতে থাকবে।
const CACHE_VERSION = 'sondhan-v41-sw-mime-fix';
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

// Critical runtime — stale copies of these break navigation/search/auth
// (mixed-version ES module failures look like "dead buttons").
// Serve network-first with cache fallback; do NOT leave them cache-first.
const CRITICAL_RUNTIME = [
  'app.js',
  'firebase-config.js',
  'firebase-config-auth.js',
  'auth-guard.js',
  'style.css'
];

function isCriticalRuntime(url) {
  try {
    const path = new URL(url).pathname;
    return CRITICAL_RUNTIME.some(f => path.endsWith('/' + f) || path === '/' + f);
  } catch (_) {
    return false;
  }
}

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
// IMPORTANT: Firebase SDK URLs are NOT cache-busted — module imports
// must keep exact version paths.
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

// BUGFIX (reload-এ অনির্দিষ্টকালের জন্য spinner আটকে থাকা — root cause-এর
// একটা অংশ): plain fetch()-এর নিজস্ব কোনো timeout নেই। কোনো network
// request যদি পরিষ্কারভাবে fail না করে বরং ঝুলে থাকে (কিছু ফিল্টার-করা
// নেটওয়ার্ক/in-app browser-এ connection নীরবে স্থির হয়ে যেতে পারে, কখনো
// resolve বা reject হয় না) — তাহলে নিচের .catch() ফ্যালব্যাকগুলো কখনোই চালু
// হয় না, কারণ promise-টাই কখনো settle হয় না। বিশেষত navigation fetch
// (পুরো পেজ লোড) আটকে গেলে HTML parse হওয়ার আগেই সবকিছু থেমে যায় — পেজের
// নিজস্ব কোনো JS/timeout তখন চালুই হয় না এটা ঠিক করতে। তাই এখানে একটা
// সুনির্দিষ্ট সময়সীমা বেঁধে দেওয়া হলো, যাতে "ঝুলে থাকা" network request-ও
// একটা নির্দিষ্ট সময় পর নিশ্চিতভাবে ব্যর্থ ধরে নিয়ে cache/offline fallback-এ
// যায় — "কখনো resolve না হওয়া" অবস্থা দূর করতে।
function fetchWithTimeout(req, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('sw-fetch-timeout')), ms);
    fetch(req).then(res => { clearTimeout(t); resolve(res); }, err => { clearTimeout(t); reject(err); });
  });
}

// BUGFIX (production incident — একসাথে Search/GPS/Blood Bank/Profile/
// Registration সব ভেঙে যাওয়া): আগের networkFirst() ধীর/অনির্ভরযোগ্য
// নেটওয়ার্কে (৮ সেকেন্ডের বেশি) timeout হলে, আর ওই নির্দিষ্ট ফাইলটা cache-এ
// না থাকলে (নতুন deploy-এর পরের race, বা install-এ fail), শেষে
// caches.match('./offline.html') ফেরত দিতো — offline.html একটা HTML পেজ,
// কিন্তু app.js/firebase-config.js/style.css-এর মতো critical runtime
// ফাইলের জন্য সেটা "text/html" রেসপন্স হিসেবে চলে যেতো যেখানে ব্রাউজার
// JS module/CSS আশা করছিল। ব্রাউজার তখন সরাসরি ছুঁড়ে দেয়: "Failed to load
// module script: Expected a JavaScript-or-Wasm module script but the
// server responded with a MIME type of text/html" — আর app.js প্রায়
// প্রতিটা পেজের মূল module script-এ import হয়, তাই একটামাত্র ধীর নেটওয়ার্ক
// মুহূর্তে Search, GPS, Blood Bank, Profile, Registration — সবগুলো একসাথে
// ভেঙে যায়, কারণ সবগুলোই একই ফাইলের উপর নির্ভরশীল। (Playwright দিয়ে
// পুনরুৎপাদন করে নিশ্চিত করা হয়েছে।)
// সমাধান: stale-while-revalidate — cache-এ থাকলে সেটাই সাথে সাথে দিই (০ms
// অপেক্ষা), ব্যাকগ্রাউন্ডে নেটওয়ার্ক থেকে আপডেট করে রাখি (তাই নতুন deploy-ও
// ধরা পড়ে)। cache-এ না থাকলে নেটওয়ার্ক-ই একমাত্র ভরসা — কিন্তু সেটা ব্যর্থ
// হলে offline.html নয়, একটা আসল নেটওয়ার্ক-এরর রেসপন্স ফেরত দিই, যাতে
// ব্রাউজার সঠিকভাবে বুঝতে পারে fetch ব্যর্থ হয়েছে (তখন প্রতিটা পেজের নিজস্ব
// reactive fallback — যা আগেই যাচাই করা আছে — ঠিকভাবে কাজ করে)।
function staleWhileRevalidate(req, timeoutMs) {
  return caches.match(req).then(cached => {
    const network = fetchWithTimeout(req, timeoutMs)
      .then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then(c => c.put(req, copy));
        }
        return res;
      })
      .catch(() => cached || Response.error());
    return cached || network;
  });
}

self.addEventListener('fetch', event => {
  const req = event.request;

  // Firebase SDK (auth/firestore/app) — সুনির্দিষ্ট এই ৩টা URL-ই
  // cache-first, ব্যাকগ্রাউন্ডে আপডেট করে রাখে। এর ফলে onAuthStateChanged
  // চালু হতে নেটওয়ার্কের অপেক্ষা করতে হয় না, লগইন অবস্থা সাথে সাথে বোঝা যায়।
  // BUGFIX (code-review ধরা পড়েছে): আগে cache miss + network ব্যর্থ হলে
  // .catch(() => cached) একটা undefined ফেরত দিতো (cached নিজেই undefined
  // থাকলে) — event.respondWith(undefined) ব্রাউজারে একটা অপ্রত্যাশিত/অস্পষ্ট
  // network error তৈরি করে, যা প্রথম ভিজিটে ধীর নেটওয়ার্কে (Firebase SDK
  // install-এ cache করতে না পারলে) auth/firestore import পুরোপুরি ভেঙে দিতে
  // পারতো। staleWhileRevalidate() এখন Response.error() দিয়ে স্পষ্ট,
  // catch-যোগ্য network error ফেরত দেয়।
  if (req.method === 'GET' && FIREBASE_SDK_URLS.includes(req.url)) {
    event.respondWith(staleWhileRevalidate(req, 8000));
    return;
  }

  // শুধু GET, এবং শুধু নিজেদের origin — Firebase/Google Fonts/gstatic
  // request-এ হাত দেওয়া হয় না, ওগুলো সরাসরি নেটওয়ার্কে যাক
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) {
    return;
  }

  // পেজ navigation (কেউ URL খুলছে/লিংকে ক্লিক করছে)
  // → নেটওয়ার্ক আগে চেষ্টা, না পেলে ক্যাশ, তাও না পেলে offline.html।
  // timeout সহ — এটাই সবচেয়ে গুরুত্বপূর্ণ জায়গা, কারণ এটা ঝুলে গেলে
  // পুরো পেজই কখনো দেখা যায় না, পেজের ভেতরের কোনো সেফটি-নেট চালুই হয় না।
  if (req.mode === 'navigate') {
    event.respondWith(
      fetchWithTimeout(req, 6000)
        .then(res => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then(c => c.put(req, copy));
          }
          return res;
        })
        .catch(() =>
          caches.match(req).then(cached => cached || caches.match('./offline.html'))
        )
    );
    return;
  }

  // Critical runtime (JS/CSS that powers navigation + page init)
  // → stale-while-revalidate: cache থাকলে তাৎক্ষণিক, ব্যাকগ্রাউন্ডে আপডেট —
  // কখনো offline.html-কে JS/CSS-এর জায়গায় ফেরত দেওয়া হয় না (দেখুন উপরের BUGFIX)।
  if (isCriticalRuntime(req.url)) {
    event.respondWith(staleWhileRevalidate(req, 8000));
    return;
  }

  // অন্য static asset (image/font/manifest) → cache-first, ব্যাকগ্রাউন্ডে আপডেট
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
