'use strict';
// ══════════════════════════════════════════════════════════
// POST /api/storage — প্রেসক্রিপশনের ফাইল (ছবি/PDF) Supabase Storage-এ
// রাখার জন্য গেটকিপার (Vercel Function)।
//
// Firebase Storage-এর বদলে Supabase Storage ব্যবহার করা হচ্ছে (Google Cloud
// billing-এর ঝামেলা এড়াতে) — কিন্তু বাকি সব (Auth, Firestore) আগের মতোই
// Firebase-এ থাকে। এই ফাইলটাই একমাত্র জায়গা যেখানে Supabase-এর গোপন
// service-role key ব্যবহার হয় — ব্রাউজারে কখনো যায় না।
//
// Authorization: Bearer <Firebase ID token>
// body: { action: 'sign-upload'|'sign-download'|'delete', path, contentType? }
//   path অবশ্যই "<uid>/..." দিয়ে শুরু হতে হবে — এটাই আসল নিরাপত্তা-সীমানা:
//   নিজের uid দিয়ে শুরু না হওয়া path-এ কখনো sign/delete হবে না, Firestore-এর
//   healthRecords ডক যা-ই বলুক না কেন।
//
// SUPABASE_URL আর SUPABASE_SERVICE_ROLE_KEY (Vercel env) সেট না থাকলে 501 —
// সাইটের বাকি কিছুই ভাঙে না।
// ══════════════════════════════════════════════════════════
const BUCKET = 'prescriptions';
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'];
const MAX_BYTES = 15 * 1024 * 1024;
const SIGN_UPLOAD_TTL = 120;    // সেকেন্ড — আপলোড শুরু করার জন্য যথেষ্ট সময়
const SIGN_DOWNLOAD_TTL = 300;  // সেকেন্ড — viewer-এ একটা পাতা দেখার জন্য যথেষ্ট

function isOwnPath(path, uid) {
  if (typeof path !== 'string' || !path) return false;
  if (path.includes('..') || path.startsWith('/')) return false;
  const first = path.split('/')[0];
  return first === uid;
}

function makeHandler(deps) {
  return async function handler(req, res) {
    const send = (code, body) => { res.status(code).setHeader('Cache-Control', 'no-store'); res.json(body); };
    try {
      if (req.method !== 'POST') return send(405, { ok: false, reason: 'method' });
      if (!deps) return send(501, { ok: false, reason: 'not-configured' });
      const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
      if (!m) return send(401, { ok: false, reason: 'no-token' });
      let uid;
      try { uid = (await deps.verifyIdToken(m[1])).uid; } catch (_) { return send(401, { ok: false, reason: 'bad-token' }); }

      const body = (req.body && typeof req.body === 'object') ? req.body : {};
      const { action, path, contentType } = body;
      if (!['sign-upload', 'sign-download', 'delete'].includes(action)) return send(400, { ok: false, reason: 'bad-action' });
      if (!isOwnPath(path, uid)) return send(403, { ok: false, reason: 'forbidden-path' });

      if (action === 'sign-upload') {
        if (typeof contentType !== 'string' || !ACCEPTED_TYPES.includes(contentType.toLowerCase()))
          return send(400, { ok: false, reason: 'bad-content-type' });
        const r = await deps.fetch(deps.url(`/storage/v1/object/upload/sign/${BUCKET}/${path}`), {
          method: 'POST', headers: deps.headers(), body: JSON.stringify({ upsert: false }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.url) { console.warn('[storage] sign-upload failed:', r.status, j); return send(502, { ok: false, reason: 'supabase-error' }); }
        return send(200, { ok: true, uploadUrl: deps.url(`/storage/v1${j.url}`), maxBytes: MAX_BYTES, ttl: SIGN_UPLOAD_TTL });
      }

      if (action === 'sign-download') {
        const r = await deps.fetch(deps.url(`/storage/v1/object/sign/${BUCKET}/${path}`), {
          method: 'POST', headers: deps.headers(), body: JSON.stringify({ expiresIn: SIGN_DOWNLOAD_TTL }),
        });
        const j = await r.json().catch(() => ({}));
        const signed = j.signedURL || j.signedUrl;
        if (!r.ok || !signed) { console.warn('[storage] sign-download failed:', r.status, j); return send(502, { ok: false, reason: 'supabase-error' }); }
        return send(200, { ok: true, url: deps.url(`/storage/v1${signed}`) });
      }

      // action === 'delete'
      const r = await deps.fetch(deps.url(`/storage/v1/object/${BUCKET}/${path}`), { method: 'DELETE', headers: deps.headers() });
      if (!r.ok && r.status !== 404) { console.warn('[storage] delete failed:', r.status); return send(502, { ok: false, reason: 'supabase-error' }); }
      return send(200, { ok: true });
    } catch (e) {
      console.error('[storage] error:', e && e.message);
      return send(500, { ok: false, reason: 'server-error' });
    }
  };
}

// ── বাস্তব dependencies (lazy) — env না থাকলে null → 501 ──────────
let _real;
function realDeps() {
  if (_real !== undefined) return _real;
  _real = null;
  const base = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const rawFb = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!base || !key || !rawFb) return _real;
  try {
    const json = rawFb.trim().startsWith('{') ? rawFb : Buffer.from(rawFb, 'base64').toString('utf8');
    const admin = require('firebase-admin');
    if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(JSON.parse(json)) });
    const cleanBase = base.replace(/\/+$/, '');
    _real = {
      verifyIdToken: t => admin.auth().verifyIdToken(t),
      fetch,
      url: p => cleanBase + p,
      headers: () => ({ 'content-type': 'application/json', 'authorization': 'Bearer ' + key, 'apikey': key }),
    };
  } catch (e) { console.error('[storage] init failed:', e.message); _real = null; }
  return _real;
}

module.exports = (req, res) => makeHandler(realDeps())(req, res);
module.exports.makeHandler = makeHandler;
