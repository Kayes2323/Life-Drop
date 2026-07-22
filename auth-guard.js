// auth-guard.js
// এই file টা search.html আর request.html এ import করো
// Login না করলে login page এ নিয়ে যাবে

import { auth } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

export function requireLogin() {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, user => {
      if (!user) {
        const current = window.location.pathname.split('/').pop();
        window.location.href = `login.html?redirect=${current}`;
      } else {
        resolve(user);
      }
    });
  });
}