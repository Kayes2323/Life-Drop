// auth-guard.js
// এই file টা search.html আর request.html এ import করো
// Login না করলে login page এ নিয়ে যাবে

import { auth } from './firebase-config.js';
import { safeRedirect } from './app.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

export function requireLogin() {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, arg) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(arg);
    };

    // BUGFIX: auth কখনো resolve না হলে Promise চিরকাল pending থাকতো —
    // caller UI "dead" দেখাতো। Timeout-এ reject করে UI আনলক করতে দেয়।
    const timer = setTimeout(() => {
      finish(reject, new Error('auth-timeout'));
    }, 8000);

    onAuthStateChanged(auth, user => {
      if (!user) {
        const current = safeRedirect(window.location.pathname.split('/').pop());
        window.location.href = `login.html?redirect=${encodeURIComponent(current)}`;
        finish(reject, new Error('not-authenticated'));
      } else {
        finish(resolve, user);
      }
    });
  });
}