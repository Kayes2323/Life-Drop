// ══════════════════════════════════════════════════════════
// Sondhan — Firebase (একমাত্র উৎস / single source of truth)
// অন্য কোনো ফাইলে firebase config কপি করবেন না।
// ══════════════════════════════════════════════════════════
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

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
export const db   = getFirestore(app);