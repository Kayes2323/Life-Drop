// ══════════════════════════════════════════════════════════
// Sondhan — পুশ নোটিফিকেশন (ক্লায়েন্ট সাইড)
//
// কীভাবে কাজ করে:
//   ১) দাতা "নোটিফিকেশন চালু করুন" চাপলে (ব্যবহারকারীর ট্যাপেই, কখনো নিজে থেকে নয়)
//      ব্রাউজারের অনুমতি চাওয়া হয় → FCM ডিভাইস টোকেন নেওয়া হয় → fcmTokens/{uid}-এ রাখা হয়।
//   ২) কেউ অনুরোধ পাঠালে/সাড়া দিলে client এই ফাইলের notifyServer() দিয়ে
//      /api/notify কল করে; সার্ভার যাচাই করে প্রাপকের ডিভাইসে পুশ পাঠায়।
//   ৩) sw.js পুশ দেখায়; ট্যাপ করলে /inbox.html খোলে।
//
// গুরুত্বপূর্ণ নিয়ম:
//   • পুশ বন্ধ/অসমর্থিত/ব্যর্থ হলেও অ্যাপের ভেতরের ইনবক্স (inbox.html) সবসময় কাজ করে।
//   • প্রতিটি ধাপে timeout আছে — কোনো ধাপ চিরকাল ঝুলে থাকবে না।
//   • পুশে কখনো ফোন নম্বর/ব্যক্তিগত তথ্য যায় না।
// ══════════════════════════════════════════════════════════
import { app, auth, db } from './firebase-config.js';
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { detectInAppBrowser } from './app.js';

// Firebase Console → Project settings → Cloud Messaging → "Web Push certificates"
// → "Generate key pair" থেকে পাওয়া PUBLIC key এখানে বসান (এটা গোপন নয়)।
// খালি থাকলে পুশ বন্ধ থাকে (ইনবক্স চলে)।
export const VAPID_KEY = 'BPOztdNi30p78hk4ZwKYV__E6fTjAM5qvW0AqT3tunv6R96DXEDNLGQPxw-aUmXyWy3SWDaRPfVj7CBW03EE1ZM';

const LS_KEY = 'sondhan-push-on';
const withTimeout = (p, ms, label) => Promise.race([
  p, new Promise((_, rej) => setTimeout(() => rej(new Error(label + '-timeout')), ms))
]);

/** পুশ সমর্থিত কি না, আর না হলে কেন। reason: ok | in-app | ios-install | unsupported | not-configured | denied */
export function pushSupport() {
  try {
    const info = detectInAppBrowser();
    if (info.isInApp) return { ok: false, reason: 'in-app' };
    const standalone = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
    if (info.platform === 'ios' && !standalone) return { ok: false, reason: 'ios-install' };
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return { ok: false, reason: 'unsupported' };
    if (!VAPID_KEY) return { ok: false, reason: 'not-configured' };
    if (Notification.permission === 'denied') return { ok: false, reason: 'denied' };
    return { ok: true, reason: 'ok' };
  } catch (_) { return { ok: false, reason: 'unsupported' }; }
}

/** এই ডিভাইসে পুশ চালু আছে কি */
export function pushEnabledHere() {
  try { return Notification.permission === 'granted' && localStorage.getItem(LS_KEY) === '1'; } catch (_) { return false; }
}

async function getFcmToken() {
  const { getMessaging, getToken } = await withTimeout(
    import('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging.js'), 15000, 'sdk');
  const reg = await withTimeout(navigator.serviceWorker.ready, 10000, 'sw');
  return withTimeout(getToken(getMessaging(app), { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg }), 15000, 'token');
}

async function saveToken(token) {
  const u = auth.currentUser; if (!u) throw new Error('not-signed-in');
  const ref = doc(db, 'fcmTokens', u.uid);
  const snap = await withTimeout(getDoc(ref), 10000, 'read');
  const old = (snap.exists() && Array.isArray(snap.data().tokens)) ? snap.data().tokens : [];
  const tokens = [...old.filter(t => t !== token), token].slice(-5);   // সর্বোচ্চ ৫ ডিভাইস
  await withTimeout(setDoc(ref, { tokens, updatedAt: serverTimestamp() }), 10000, 'write');
}

/** ব্যবহারকারীর ট্যাপ থেকে ডাকুন। ফল: { ok, reason } */
export async function enablePush() {
  const sup = pushSupport();
  if (!sup.ok) return sup;
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return { ok: false, reason: perm === 'denied' ? 'denied' : 'dismissed' };
    const token = await getFcmToken();
    if (!token) return { ok: false, reason: 'no-token' };
    await saveToken(token);
    try { localStorage.setItem(LS_KEY, '1'); } catch (_) {}
    return { ok: true, reason: 'ok' };
  } catch (e) {
    console.warn('[push] enable failed:', e);
    return { ok: false, reason: String(e.message || 'error') };
  }
}

/** এই ডিভাইসে পুশ বন্ধ করুন */
export async function disablePush() {
  try {
    const { getMessaging, deleteToken } = await withTimeout(
      import('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging.js'), 15000, 'sdk');
    const reg = await navigator.serviceWorker.ready;
    let token = ''; try { token = await getFcmToken(); } catch (_) {}
    await deleteToken(getMessaging(app));
    const u = auth.currentUser;
    if (u && token) {
      const ref = doc(db, 'fcmTokens', u.uid); const snap = await getDoc(ref);
      const tokens = snap.exists() ? (snap.data().tokens || []).filter(t => t !== token) : [];
      await setDoc(ref, { tokens, updatedAt: serverTimestamp() });
    }
    void reg;
  } catch (e) { console.warn('[push] disable:', e); }
  try { localStorage.removeItem(LS_KEY); } catch (_) {}
}

/** পুশ আগে চালু করা থাকলে টোকেন চুপচাপ নতুন রাখে (টোকেন বদলায়)। ব্যর্থ হলেও কোনো সমস্যা নেই। */
export async function refreshPushToken() {
  try {
    if (!pushEnabledHere() || !pushSupport().ok || !auth.currentUser) return;
    const token = await getFcmToken();
    if (token) await saveToken(token);
  } catch (e) { console.warn('[push] refresh:', e.message); }
}

/** অনুরোধ তৈরি/সাড়ার পর সার্ভারকে জানান, যাতে সে প্রাপকের ডিভাইসে পুশ পাঠায়।
 *  kind: 'new' | 'response'। সবসময় best-effort — ব্যর্থ হলে কিছু ভাঙে না। */
export async function notifyServer(requestId, kind) {
  try {
    const u = auth.currentUser; if (!u) return { ok: false, reason: 'not-signed-in' };
    const idToken = await withTimeout(u.getIdToken(), 8000, 'idtoken');
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 10000);
    const res = await fetch('/api/notify', {
      method: 'POST', signal: ctl.signal,
      headers: { 'content-type': 'application/json', 'authorization': 'Bearer ' + idToken },
      body: JSON.stringify({ requestId, kind })
    }).finally(() => clearTimeout(t));
    return await res.json().catch(() => ({ ok: false, reason: 'bad-response' }));
  } catch (e) { return { ok: false, reason: String(e.message || 'network') }; }
}
