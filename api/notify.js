'use strict';
// ══════════════════════════════════════════════════════════
// POST /api/notify — রক্তের অনুরোধের পুশ নোটিফিকেশন পাঠায় (Vercel Function)।
//
// Authorization: Bearer <Firebase ID token>
// body: { requestId: "<seekerUid>_<donorUid>", kind: "new" | "response" }
//
//  • kind=new      — শুধু সিকার, শুধু pending অনুরোধ → দাতাকে পুশ
//  • kind=response — শুধু দাতা, শুধু accepted/declined → সিকারকে পুশ
//  • প্রতিটি অনুরোধে প্রতি ধরনে একবারই (pushedAt / responsePushedAt ক্লেইম)
//  • প্রেরকপ্রতি ঘণ্টায় সর্বোচ্চ ১৫টি
//  • payload-এ ফোন নম্বর/ইমেইল কখনো নেই
//  • FIREBASE_SERVICE_ACCOUNT (Vercel env) সেট না থাকলে 501 — সাইটের বাকি কিছুই ভাঙে না
// ══════════════════════════════════════════════════════════
const MAX_PER_HOUR = 15;
const ID_RE = /^[A-Za-z0-9_-]{6,128}_[A-Za-z0-9_-]{6,128}$/;
const DEAD = new Set(['messaging/registration-token-not-registered', 'messaging/invalid-registration-token', 'messaging/invalid-argument']);
const clip = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

function makeHandler(deps) {
  return async function handler(req, res) {
    const send = (code, body) => { res.status(code).setHeader('Cache-Control', 'no-store'); res.json(body); };
    try {
      if (req.method !== 'POST') return send(405, { ok: false, reason: 'method' });
      if (!deps) return send(501, { ok: false, reason: 'not-configured' });
      const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
      if (!m) return send(401, { ok: false, reason: 'no-token' });
      let uid;
      try { uid = (await deps.auth.verifyIdToken(m[1])).uid; } catch (_) { return send(401, { ok: false, reason: 'bad-token' }); }

      const body = (req.body && typeof req.body === 'object') ? req.body : {};
      const { requestId, kind } = body;
      if (typeof requestId !== 'string' || !ID_RE.test(requestId) || !['new', 'response'].includes(kind))
        return send(400, { ok: false, reason: 'bad-request' });

      const db = deps.db, reqRef = db.collection('donorRequests').doc(requestId);
      const flag = kind === 'new' ? 'pushedAt' : 'responsePushedAt';

      // ── যাচাই + একবারের ক্লেইম (transaction) ─────────────────
      const claim = await db.runTransaction(async tx => {
        const snap = await tx.get(reqRef);
        if (!snap.exists) return { code: 404, reason: 'not-found' };
        const r = snap.data();
        if (kind === 'new') {
          if (r.seekerUid !== uid) return { code: 403, reason: 'forbidden' };
          if (r.status !== 'pending') return { code: 409, reason: 'not-pending' };
        } else {
          if (r.donorId !== uid) return { code: 403, reason: 'forbidden' };
          if (!['accepted', 'declined'].includes(r.status)) return { code: 409, reason: 'not-answered' };
        }
        if (r[flag]) return { code: 200, reason: 'already-sent', sent: 0 };
        // প্রেরকের ঘণ্টার সীমা
        const limRef = db.collection('pushLimits').doc(uid), lim = await tx.get(limRef), now = deps.now();
        let w = lim.exists ? lim.data() : { windowStart: now, count: 0 };
        if (now - w.windowStart > 3600 * 1000) w = { windowStart: now, count: 0 };
        if (w.count >= MAX_PER_HOUR) return { code: 429, reason: 'rate-limited' };
        tx.set(limRef, { windowStart: w.windowStart, count: w.count + 1 });
        tx.update(reqRef, { [flag]: deps.now() });
        return { code: 200, r };
      });
      if (claim.code !== 200 || !claim.r) return send(claim.code, { ok: claim.code === 200, reason: claim.reason, sent: claim.sent || 0 });

      // ── প্রাপক ও বার্তা ──────────────────────────────────────
      const r = claim.r;
      let recipient, title, text, tag;
      if (kind === 'new') {
        recipient = r.donorId; tag = 'req-' + requestId;
        title = 'নতুন রক্তের অনুরোধ';
        text = clip(r.seekerName, 40) + ' আপনার কাছে রক্ত চাইছেন: ' + clip(r.msg, 60);
      } else {
        recipient = r.seekerUid; tag = 'res-' + requestId;
        const d = await db.collection('donors').doc(r.donorId).get();
        const dn = clip(d.exists ? d.data().name : 'দাতা', 40);
        if (r.status === 'accepted') { title = 'অনুরোধ গ্রহণ করা হয়েছে'; text = dn + ' রক্ত দিতে রাজি। এখনই যোগাযোগ করুন।'; }
        else { title = 'দাতা এখন পারছেন না'; text = dn + ' এখন রক্ত দিতে পারছেন না — অন্য দাতাকে চেষ্টা করুন।'; }
      }

      const tRef = db.collection('fcmTokens').doc(recipient), tSnap = await tRef.get();
      const tokens = (tSnap.exists && Array.isArray(tSnap.data().tokens)) ? tSnap.data().tokens.filter(t => typeof t === 'string' && t).slice(0, 5) : [];
      if (!tokens.length) return send(200, { ok: true, sent: 0, reason: 'no-device' });

      const resp = await deps.messaging.sendEachForMulticast({
        tokens,
        data: { title, body: text, url: '/inbox.html', tag },
        webpush: { headers: { Urgency: 'high', TTL: '86400' } }
      });
      let sent = 0; const dead = [];
      resp.responses.forEach((x, i) => { if (x.success) sent++; else if (x.error && DEAD.has(x.error.code)) dead.push(tokens[i]); });
      if (dead.length) await tRef.set({ tokens: tokens.filter(t => !dead.includes(t)), updatedAt: deps.now() }, { merge: true });
      return send(200, { ok: true, sent, reason: sent ? 'sent' : 'delivery-failed' });
    } catch (e) {
      console.error('[notify] error:', e && e.message);
      return send(500, { ok: false, reason: 'server-error' });
    }
  };
}

// ── বাস্তব Firebase Admin (lazy) — env না থাকলে null → 501 ──────────
let _real;
function realDeps() {
  if (_real !== undefined) return _real;
  _real = null;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return _real;
  try {
    const json = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
    const admin = require('firebase-admin');
    if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(JSON.parse(json)) });
    _real = { auth: admin.auth(), db: admin.firestore(), messaging: admin.messaging(), now: () => Date.now() };
  } catch (e) { console.error('[notify] init failed:', e.message); _real = null; }
  return _real;
}

module.exports = (req, res) => makeHandler(realDeps())(req, res);
module.exports.makeHandler = makeHandler;
