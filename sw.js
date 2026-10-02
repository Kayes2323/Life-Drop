// ══════════════════════════════════════════════════════════
// Sondhan — Service Worker
// কাজ: app shell (HTML/CSS/JS/icon) ক্যাশ করে অফলাইনেও পেজ খোলা রাখে।
// Firebase/Firestore ডেটা এখানে ছোঁয়া হয় না — সেটা Firestore-এর
// নিজস্ব offline persistence (firebase-config.js-এ enable করা) সামলায়।
// ══════════════════════════════════════════════════════════

// নতুন deploy-এ কোনো ফাইল বদলালে এই ভার্সন নাম্বার বাড়িয়ে দিন,
// নাহলে ইউজাররা পুরনো ক্যাশ করা ফাইল দেখতে থাকবে।
const CACHE_VERSION = 'sondhan-v39';
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

self.addEventListener('fetch', event => {
  const req = event.request;

  // Firebase SDK (auth/firestore/app) — সুনির্দিষ্ট এই ৩টা URL-ই
  // cache-first, ব্যাকগ্রাউন্ডে আপডেট করে রাখে। এর ফলে onAuthStateChanged
  // চালু হতে নেটওয়ার্কের অপেক্ষা করতে হয় না, লগইন অবস্থা সাথে সাথে বোঝা যায়।
  if (req.method === 'GET' && FIREBASE_SDK_URLS.includes(req.url)) {
    event.respondWith(
      caches.match(req).then(cached => {
        // cached থাকলে network আপডেট ব্যাকগ্রাউন্ডে চলে, response আটকায় না —
        // timeout এখানে শুধু matter করে প্রথমবার (cache খালি) যখন network-ই
        // একমাত্র ভরসা, আর সেটা ঝুলে গেলে যেন ব্যবহারকারী চিরকাল অপেক্ষা না করেন।
        const network = fetchWithTimeout(req, 8000)
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
  // → নেটওয়ার্ক আগে চেষ্টা, না পেলে ক্যাশ, তাও না পেলে offline.html।
  // timeout সহ — এটাই সবচেয়ে গুরুত্বপূর্ণ জায়গা, কারণ এটা ঝুলে গেলে
  // পুরো পেজই কখনো দেখা যায় না, পেজের ভেতরের কোনো সেফটি-নেট চালুই হয় না।
  if (req.mode === 'navigate') {
    event.respondWith(
      fetchWithTimeout(req, 6000)
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
