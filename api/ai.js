'use strict';
// ══════════════════════════════════════════════════════════
// POST /api/ai — Sondhan AI (Gemini) এর সার্ভার-সাইড গেটকিপার।
//
// কেন সার্ভারে: Gemini API key কখনোই ব্রাউজারে যাওয়া যাবে না। এই ফাইলই
// একমাত্র জায়গা যেখানে GEMINI_API_KEY ব্যবহার হয়।
//
// Authorization: Bearer <Firebase ID token>  — লগইন বাধ্যতামূলক। কারণ:
//   (১) key-এর অপব্যবহার ঠেকাতে, (২) rate limit কাকে দেওয়া হচ্ছে তা জানতে।
//
// body: { messages: [{ role: 'user'|'model', text: string }, ...] }
// ফেরত: { ok: true, text, toolsUsed: [...] }  বা  { ok:false, reason }
//
// গোপনীয়তা: ব্যবহারকারীর বার্তার বিষয়বস্তু কখনো log করা হয় না — শুধু
// error code/স্ট্যাটাস। মেডিকেল তথ্য log-এ যাবে না।
//
// GEMINI_API_KEY বা FIREBASE_SERVICE_ACCOUNT (Vercel env) না থাকলে 501 —
// সাইটের বাকি কিছুই ভাঙে না (api/storage.js-এর মতোই)।
// ══════════════════════════════════════════════════════════

const DEFAULT_MODEL = 'gemini-2.5-flash';
const MAX_MESSAGES = 30;
const MAX_CHARS_PER_MSG = 4000;
const MAX_CHARS_TOTAL = 20000;
const MAX_TOOL_ROUNDS = 3;          // অসীম tool-loop ঠেকাতে
const UPSTREAM_TIMEOUT_MS = 30000;

// ── Rate limit (best-effort) ──────────────────────────────
// সতর্কতা: Vercel-এ প্রতিটা instance-এর নিজস্ব মেমরি, তাই এটা কঠোর
// বৈশ্বিক সীমা নয় — অপব্যবহার কমায়, পুরোপুরি ঠেকায় না। কঠোর সীমা লাগলে
// পরে Firestore-ভিত্তিক counter যোগ করতে হবে।
const RATE_MAX = 20;                 // প্রতি উইন্ডোতে সর্বোচ্চ অনুরোধ
const RATE_WINDOW_MS = 10 * 60 * 1000;
const _hits = new Map();             // uid -> number[] (timestamps)

function rateLimited(uid, now) {
  const arr = (_hits.get(uid) || []).filter(t => now - t < RATE_WINDOW_MS);
  if (arr.length >= RATE_MAX) { _hits.set(uid, arr); return true; }
  arr.push(now);
  _hits.set(uid, arr);
  if (_hits.size > 5000) _hits.clear();   // মেমরি বাঁধ
  return false;
}

// ── Sondhan AI-এর আচরণ ────────────────────────────────────
const SYSTEM_INSTRUCTION = `আপনি "Sondhan AI" — Sondhan (sondhan.org) প্ল্যাটফর্মের স্বাস্থ্যসেবা সহকারী। Sondhan বাংলাদেশের একটি রক্তদাতা ও স্বাস্থ্যসেবা প্ল্যাটফর্ম।

## ভাষা
- ডিফল্ট ভাষা বাংলা। ব্যবহারকারী বাংলা, ইংরেজি বা Banglish (রোমান হরফে বাংলা) — যেকোনোভাবে লিখতে পারেন, আপনি বুঝবেন।
- ব্যবহারকারী ইংরেজিতে লিখলেও উত্তর বাংলায় দিন, যদি না তিনি স্পষ্টভাবে ইংরেজি চান।
- কঠিন মেডিকেল শব্দ সহজ বাংলায় বুঝিয়ে দিন। ইংরেজি পরিভাষা দরকার হলে বন্ধনীতে রাখুন।

## উত্তরের ধরন
- সংক্ষিপ্ত ও পরিষ্কার। অপ্রয়োজনীয় লম্বা উত্তর দেবেন না।
- দরকার হলে ছোট ছোট পয়েন্ট বা শিরোনাম ব্যবহার করুন।
- সহানুভূতিশীল ও সম্মানজনক থাকুন — অনেকে দুশ্চিন্তার মুহূর্তে লিখছেন।
- জরুরি তথ্য অনুপস্থিত থাকলে একটা স্পষ্ট প্রশ্ন করুন, অনুমান করবেন না।

## তথ্যের নির্ভরযোগ্যতা — সবচেয়ে গুরুত্বপূর্ণ নিয়ম
আপনাকে সবসময় আলাদা করে বোঝাতে হবে তথ্যটা কোথা থেকে এসেছে:
- Sondhan-এর যাচাইকৃত ডেটা (tool থেকে পাওয়া) — উৎস ও তারিখসহ বলুন।
- সাধারণ চিকিৎসা-জ্ঞান — এটা সাধারণ তথ্য, তা স্পষ্ট করুন।
- যা যাচাই করা যায়নি — "এটা আমি নিশ্চিতভাবে বলতে পারছি না" বলুন।

কখনোই অনিশ্চিত তথ্যকে নিশ্চিত সত্য হিসেবে উপস্থাপন করবেন না।
ওষুধের দাম, ডোজ, রেজিস্ট্রেশন তথ্য বা পরীক্ষার মূল্য — কখনো অনুমান করে বানিয়ে বলবেন না। tool থেকে না পেলে স্পষ্টভাবে বলুন তথ্যটা আপনার কাছে নেই।

## চিকিৎসা-নিরাপত্তা (কঠোরভাবে মানতে হবে)
- আপনি ডাক্তার নন। রোগ নির্ণয় (diagnosis) নিশ্চিতভাবে করবেন না।
- কোনো ওষুধ প্রেসক্রাইব করবেন না, ডোজ বদলাতে বলবেন না, চলমান চিকিৎসা বন্ধ করতে বলবেন না।
- ডাক্তারের দেওয়া প্রেসক্রিপশন কখনো পরিবর্তন করবেন না।
- জরুরি লক্ষণ (যেমন: তীব্র বুকে ব্যথা, শ্বাসকষ্ট, প্রচণ্ড রক্তক্ষরণ, অজ্ঞান হয়ে যাওয়া, খিঁচুনি, স্ট্রোকের লক্ষণ) বোঝা গেলে — দীর্ঘ আলোচনা না করে সঙ্গে সঙ্গে নিকটস্থ হাসপাতাল/জরুরি সেবায় যেতে বলুন (জাতীয় জরুরি সেবা: ৯৯৯)।
- রক্তের গ্রুপ মিল থাকলেই রক্ত দেওয়া যাবে — এমন বলবেন না। হাসপাতালের ব্লাড ব্যাংকে crossmatch পরীক্ষা বাধ্যতামূলক, এটা মনে করিয়ে দিন।

## Sondhan সম্পর্কে
Sondhan-এ আছে: রক্তদাতা খোঁজা, রক্তের অনুরোধ, ব্লাড ব্যাংক তালিকা, অ্যাম্বুলেন্স, মেডিকেল ফাইল সংরক্ষণ, সরকারি হাসপাতালের টেস্টের মূল্যতালিকা, এবং রোগ সম্পর্কিত তথ্য।
ব্যবহারকারীকে প্রয়োজনে সঠিক পেজে যেতে বলুন (যেমন রক্তদাতা খুঁজতে "খুঁজুন" পেজ)।

## Tool ব্যবহার
প্রশ্নটা Sondhan-এর যাচাইকৃত ডেটা দিয়ে উত্তর দেওয়া গেলে অবশ্যই tool ব্যবহার করুন, নিজের স্মৃতি থেকে উত্তর দেবেন না। tool থেকে ফলাফল না পেলে সেটা সরাসরি স্বীকার করুন।`;

// ── Tool declarations (Gemini-কে যা জানানো হয়) ────────────
const TOOL_DECLARATIONS = [
  {
    name: 'searchMedicalTests',
    description:
      'Sondhan-এর যাচাইকৃত মেডিকেল টেস্ট মূল্যতালিকায় খোঁজে (বাংলাদেশের সরকারি প্রতিষ্ঠানের প্রকাশিত মূল্য, উৎস ও তারিখসহ)। ' +
      'কোনো পরীক্ষার দাম, পরীক্ষাটা কী বা কেন করা হয় — এসব প্রশ্নে এটি ব্যবহার করুন। ' +
      'শুধুমাত্র সরকারি প্রতিষ্ঠানের মূল্য আছে, বেসরকারি নেই।',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'পরীক্ষার নাম বা সংক্ষিপ্ত রূপ — বাংলা বা ইংরেজি (যেমন: CBC, HbA1c, সুগার, থাইরয়েড, ডেঙ্গু)',
        },
      },
      required: ['query'],
    },
  },
];

// ── Tool বাস্তবায়ন ─────────────────────────────────────────
// test-prices-data.js একটা ES module, আর এই ফাইল CommonJS — Node 20-এ
// CJS থেকে dynamic import() কাজ করে, তাই ডেটা ডুপ্লিকেট করতে হচ্ছে না
// (একটাই উৎস, ফ্রন্টএন্ড ও AI দুজনেই সেটাই পড়ে)।
let _testsPromise;
function loadTests() {
  if (!_testsPromise) _testsPromise = import('../test-prices-data.js').then(m => m.TESTS || []);
  return _testsPromise;
}

function norm(s) { return String(s || '').toLowerCase().trim(); }

async function searchMedicalTests({ query }) {
  const q = norm(query);
  if (!q) return { found: 0, results: [] };
  const TESTS = await loadTests();
  const hits = TESTS.filter(t =>
    norm(t.en).includes(q) || norm(t.abbr).includes(q) ||
    norm(t.bn).includes(q) || norm(t.id).includes(q)
  ).slice(0, 5);

  return {
    found: hits.length,
    // Gemini-কে শুধু যা দরকার তাই পাঠাই — পুরো ডেটাবেস নয়
    results: hits.map(t => ({
      name_en: t.en, abbreviation: t.abbr, name_bn: t.bn,
      what_it_is: t.explain,
      prices: (t.prices || []).map(p => ({
        amount_bdt: p.amount,
        facility: p.facility,
        source_name: p.sourceName,
        source_url: p.sourceUrl,
        published_date: p.publishedDate,
        verification_status: p.status,   // 'needs_reverify' = মানুষ এখনো যাচাই করেনি
        notes: p.notes || null,
      })),
    })),
    disclaimer: hits.length
      ? 'এগুলো সরকারি প্রতিষ্ঠানে প্রকাশিত মূল্য। verification_status "needs_reverify" মানে কোনো মানুষ সরেজমিনে এখনো নিশ্চিত করেননি — ব্যবহারকারীকে কাউন্টারে যাচাই করে নিতে বলুন। বেসরকারি প্রতিষ্ঠানের দাম এখানে নেই।'
      : 'Sondhan-এর যাচাইকৃত তালিকায় এই পরীক্ষাটি পাওয়া যায়নি। দাম অনুমান করে বলবেন না।',
  };
}

const TOOL_IMPLS = { searchMedicalTests };

// ── Gemini-র জন্য ইনপুট যাচাই ও রূপান্তর ───────────────────
function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return 'bad-messages';
  if (messages.length > MAX_MESSAGES) return 'too-many-messages';
  let total = 0;
  for (const m of messages) {
    if (!m || typeof m !== 'object') return 'bad-messages';
    if (m.role !== 'user' && m.role !== 'model') return 'bad-role';
    if (typeof m.text !== 'string' || !m.text.trim()) return 'bad-text';
    if (m.text.length > MAX_CHARS_PER_MSG) return 'message-too-long';
    total += m.text.length;
  }
  if (total > MAX_CHARS_TOTAL) return 'conversation-too-long';
  if (messages[messages.length - 1].role !== 'user') return 'last-must-be-user';
  return null;
}

function toContents(messages) {
  return messages.map(m => ({ role: m.role, parts: [{ text: m.text }] }));
}

function firstFunctionCall(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  for (const p of parts) if (p.functionCall) return p.functionCall;
  return null;
}

function joinText(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts.map(p => p.text).filter(Boolean).join('').trim();
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

      if (rateLimited(uid, deps.now())) return send(429, { ok: false, reason: 'rate-limited' });

      const body = (req.body && typeof req.body === 'object') ? req.body : {};
      const bad = validateMessages(body.messages);
      if (bad) return send(400, { ok: false, reason: bad });

      const contents = toContents(body.messages);
      const toolsUsed = [];

      for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
        const payload = {
          system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
          contents,
          tools: [{ function_declarations: TOOL_DECLARATIONS }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 2048 },
        };

        let r;
        try {
          r = await deps.callGemini(payload);
        } catch (e) {
          console.warn('[ai] upstream call failed:', e && e.message);
          return send(502, { ok: false, reason: 'upstream-unreachable' });
        }

        if (!r.ok) {
          // বিষয়বস্তু নয় — শুধু স্ট্যাটাস log করি
          console.warn('[ai] gemini status:', r.status);
          if (r.status === 429) return send(429, { ok: false, reason: 'upstream-rate-limited' });
          if (r.status === 401 || r.status === 403) return send(502, { ok: false, reason: 'upstream-auth' });
          return send(502, { ok: false, reason: 'upstream-error' });
        }

        const data = r.data || {};
        const call = firstFunctionCall(data);

        if (!call) {
          const text = joinText(data);
          if (!text) {
            const fr = data?.candidates?.[0]?.finishReason;
            if (fr === 'SAFETY') return send(200, { ok: true, text: 'দুঃখিত, এই প্রশ্নের উত্তর আমি দিতে পারছি না। অন্যভাবে জিজ্ঞাসা করে দেখুন, অথবা জরুরি হলে সরাসরি চিকিৎসকের পরামর্শ নিন।', toolsUsed });
            return send(502, { ok: false, reason: 'empty-response' });
          }
          return send(200, { ok: true, text, toolsUsed });
        }

        // Gemini একটা tool চালাতে বলেছে
        const impl = TOOL_IMPLS[call.name];
        let result;
        if (!impl) {
          result = { error: 'unknown-tool' };
        } else {
          try { result = await impl(call.args || {}); }
          catch (e) { console.warn('[ai] tool failed:', call.name, e && e.message); result = { error: 'tool-failed' }; }
        }
        toolsUsed.push(call.name);

        contents.push({ role: 'model', parts: [{ functionCall: call }] });
        contents.push({ role: 'user', parts: [{ functionResponse: { name: call.name, response: result } }] });
      }

      // এতবার tool ডাকার পরেও উত্তর আসেনি
      return send(502, { ok: false, reason: 'tool-loop-exhausted' });
    } catch (e) {
      console.error('[ai] error:', e && e.message);
      return send(500, { ok: false, reason: 'server-error' });
    }
  };
}

// ── বাস্তব dependencies (lazy) — env না থাকলে null → 501 ──────────
let _real;
function realDeps() {
  if (_real !== undefined) return _real;
  _real = null;
  const key = process.env.GEMINI_API_KEY;
  const rawFb = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!key || !rawFb) return _real;
  try {
    const json = rawFb.trim().startsWith('{') ? rawFb : Buffer.from(rawFb, 'base64').toString('utf8');
    const admin = require('firebase-admin');
    if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(JSON.parse(json)) });
    const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    // TEMP ডায়াগনস্টিক (production-এ gemini status: 404 ধরা পড়েছে — model
    // নামটাই ভুল/অস্তিত্বহীন বলে মনে হচ্ছে, কিন্তু এই sandbox থেকে
    // generativelanguage.googleapis.com-এ পৌঁছানো যায় না, তাই অনুমান না করে
    // সরাসরি ListModels থেকে আসল তালিকা log-এ আনছি — root cause নিশ্চিত হলে
    // এই ব্লক সরিয়ে ফেলা হবে)।
    let _modelsLogged = false;
    const logAvailableModels = async () => {
      if (_modelsLogged) return; _modelsLogged = true;
      try {
        const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models', { headers: { 'x-goog-api-key': key } });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) { console.warn('[ai] ListModels failed:', r.status, JSON.stringify(j).slice(0, 300)); return; }
        const names = (j.models || [])
          .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
          .map(m => m.name);
        console.warn('[ai] ListModels (generateContent-capable):', JSON.stringify(names));
      } catch (e) { console.warn('[ai] ListModels error:', e && e.message); }
    };
    _real = {
      verifyIdToken: t => admin.auth().verifyIdToken(t),
      now: () => Date.now(),
      callGemini: async (payload) => {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), UPSTREAM_TIMEOUT_MS);
        try {
          const r = await fetch(endpoint, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
            body: JSON.stringify(payload),
            signal: ctrl.signal,
          });
          const data = await r.json().catch(() => ({}));
          if (!r.ok) {
            // TEMP ডায়াগনস্টিক: Google-এর নিজের error message-ই root cause বলে
            // দেয় (model missing/quota/billing/permission — প্রতিটার আলাদা
            // message) — এটা শুধু error-এর গঠন, কোনো medical/user content নয়,
            // তাই log করা নিরাপদ। root cause নিশ্চিত হলে এই ব্লক সরানো হবে।
            console.warn('[ai] gemini error body:', JSON.stringify(data).slice(0, 500));
            if (r.status === 404) await logAvailableModels();
          }
          return { ok: r.ok, status: r.status, data };
        } finally { clearTimeout(timer); }
      },
    };
  } catch (e) { console.error('[ai] init failed:', e.message); _real = null; }
  return _real;
}

module.exports = (req, res) => makeHandler(realDeps())(req, res);
module.exports.makeHandler = makeHandler;
module.exports._internals = { validateMessages, searchMedicalTests, rateLimited, SYSTEM_INSTRUCTION };
