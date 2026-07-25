// ══════════════════════════════════════════════════════════
// Sondhan — Firebase (একমাত্র উৎস / single source of truth)
// অন্য কোনো ফাইলে firebase config কপি করবেন না।
// ══════════════════════════════════════════════════════════
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey           : "AIzaSyBpw6cXNgXNxnWNOn2IQ0IhfXzQv2Qoqxk",
  authDomain       : "life-drop-d4784.firebaseapp.com",
  projectId        : "life-drop-d4784",
  storageBucket    : "life-drop-d4784.firebasestorage.app",
  messagingSenderId: "671053363784",
  appId            : "1:671053363784:web:825fa9afa4f58a3ec2f67d"
};

// getApps() চেক — একই পেজে দুইবার initialize হওয়া ঠেকায়
export const app  = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const auth = getAuth(app);

// অফলাইন সাপোর্ট: আগে দেখা ডেটা ক্যাশ থেকে দেখায়, আর অফলাইনে করা
// লেখা (ফর্ম submit) স্বয়ংক্রিয়ভাবে জমা থাকে, নেট ফিরলে নিজে থেকেই sync হয়ে যায়।
// BUGFIX: আগে persistentMultipleTabManager ব্যবহার হতো — এটা একাধিক ট্যাব
// সামলাতে পারে ঠিকই, কিন্তু IndexedDB lock নিয়ে বেশি জটিলতা তৈরি করে এবং
// silently fail করে সাধারণ (non-persistent, memory-only) mode-এ চলে যাওয়ার
// ঝুঁকি বেশি — তখন offline-এ আগে-দেখা ডেটাও আর পাওয়া যায় না, অথচ কোনো
// স্পষ্ট error দেখায় না। সরল single-tab persistent cache ব্যবহার করছি,
// যেটা অনেক বেশি নির্ভরযোগ্য।
let dbInstance;
try {
  dbInstance = initializeFirestore(app, {
    localCache: persistentLocalCache(/* single-tab, default */)
  });
  console.log('[Firestore] অফলাইন persistence চালু হয়েছে ✓');
} catch (e) {
  // এই পেজে আগেই db initialize হয়ে থাকলে (হট রিলোড ইত্যাদি), সাধারণ getFirestore-এ ফিরে যাই।
  // এটা তখন আসলে সমস্যা না — app-level singleton হওয়ায় আগে থেকে চালু হওয়া
  // persistent instance-টাই ফেরত পাওয়া যায়। কিন্তু চোখে দেখার জন্য warning রাখছি।
  console.warn('[Firestore] persistence init দ্বিতীয়বার চেষ্টা হলো, fallback ব্যবহার হচ্ছে:', e.message);
  dbInstance = getFirestore(app);
}
export const db = dbInstance;