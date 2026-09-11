// ══════════════════════════════════════════════════════════
// Sondhan — Firebase Auth-only config (শুধু donor.html pilot-এর জন্য)
//
// firebase-config.js (মূল, সব পেজে ব্যবহৃত ফাইল) অপরিবর্তিত আছে এবং
// app+auth+firestore একসাথে initialize করে — এটাই এখনো site-wide
// single source of truth।
//
// এই ফাইলটা শুধু app + auth সেটআপ করে, Firestore import/initialize
// করে না। donor.html প্রথমে এই হালকা ফাইল দিয়ে auth অবস্থা যাচাই করে
// (কোন screen দেখাবে তা ঠিক করতে) — Firestore SDK (সবচেয়ে ভারী মডিউল)
// তখনই লোড হয় যখন সত্যিই দরকার হয় (existing-donor check, ফর্ম submit),
// donor.html-এর নিজস্ব dynamic import()-এর মাধ্যমে।
//
// ⚠️ নিরাপত্তা/সঙ্গতি: firebaseConfig এখানে firebase-config.js-এর
// সাথে হুবহু মিলতে হবে, আর দুটোই getApps() দিয়ে singleton চেক করে —
// তাই কোন ফাইল আগে ইম্পোর্ট হলো তার ওপর নির্ভর করে app দুইবার
// initialize হয় না, একই instance ফেরত আসে।
// ══════════════════════════════════════════════════════════
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
  apiKey           : "AIzaSyBpw6cXNgXNxnWNOn2IQ0IhfXzQv2Qoqxk",
  authDomain       : "life-drop-d4784.firebaseapp.com",
  projectId        : "life-drop-d4784",
  storageBucket    : "life-drop-d4784.firebasestorage.app",
  messagingSenderId: "671053363784",
  appId            : "1:671053363784:web:825fa9afa4f58a3ec2f67d"
};

export const app  = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const auth = getAuth(app);
