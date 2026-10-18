// ══════════════════════════════════════════════════════════
// Sondhan — Health File: framework/Firebase-মুক্ত বিশুদ্ধ (pure) ফাংশন।
// এগুলো DOM বা Firebase ছাড়াই node:test দিয়ে সরাসরি টেস্ট করা যায়;
// health.js এগুলো import করে ব্যবহার করে। কোনো medical data এখানে
// বানানো/অনুমান করা হয় না — শুধু ইউজারের দেওয়া ইনপুট যাচাই করে।
// ══════════════════════════════════════════════════════════

export const CATEGORIES = [
  { id: 'prescription', label: 'প্রেসক্রিপশন' },
  { id: 'lab',           label: 'ল্যাব রিপোর্ট' },
  { id: 'diagnostic',    label: 'ডায়াগনস্টিক রিপোর্ট' },
  { id: 'discharge',     label: 'ডিসচার্জ সামারি' },
  { id: 'other',         label: 'অন্যান্য কাগজ' },
];
export const CATEGORY_IDS = CATEGORIES.map(c => c.id);

export const MAX_FILE_BYTES = 15 * 1024 * 1024;   // storage.rules-এর সাথে মিলিয়ে
export const MAX_PAGES = 20;
export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'];

/** একটা ফাইল আপলোডের উপযুক্ত কি না — type/size যাচাই (storage.rules-এর আয়না)। */
export function validateFile(file) {
  if (!file || typeof file.size !== 'number') return { ok: false, reason: 'invalid-file' };
  const type = String(file.type || '').toLowerCase();
  const isPdf = type === 'application/pdf';
  const isImg = type.startsWith('image/');
  if (!isPdf && !isImg) return { ok: false, reason: 'unsupported-type' };
  if (isImg && !ACCEPTED_TYPES.includes(type)) return { ok: false, reason: 'unsupported-image-type' };
  if (file.size <= 0) return { ok: false, reason: 'empty-file' };
  if (file.size > MAX_FILE_BYTES) return { ok: false, reason: 'too-large' };
  return { ok: true, reason: 'ok', isPdf, isImg };
}

/** একগুচ্ছ ফাইল (এক রেকর্ডে একাধিক পেজ) — মোট পেজ সীমা + প্রতিটা ফাইল যাচাই। */
export function validateFileList(files) {
  const list = Array.from(files || []);
  if (list.length === 0) return { ok: false, reason: 'no-files' };
  if (list.length > MAX_PAGES) return { ok: false, reason: 'too-many-pages' };
  const results = list.map(validateFile);
  const bad = results.find(r => !r.ok);
  if (bad) return { ok: false, reason: bad.reason };
  return { ok: true, reason: 'ok', count: list.length };
}

/** YYYY-MM-DD ফরম্যাট, বাস্তব তারিখ, আর future-এ অনেক বেশি দূরে না — নাহলে null। */
export function sanitizeDocDate(input) {
  const s = String(input || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(s + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return null;
  if (d.getTime() > Date.now() + 24 * 3600 * 1000) return null; // সামান্য future-tolerance (timezone)
  if (d.getFullYear() < 1900) return null;
  return s;
}

/** ঐচ্ছিক টেক্সট ফিল্ড (title/facility) — ট্রিম করে, খালি হলে বাদ, সীমা ছাড়ালে কাটে না — বরং invalid করে। */
export function sanitizeOptionalText(input, maxLen = 100) {
  const s = String(input || '').trim();
  if (!s) return { ok: true, value: undefined };
  if (s.length > maxLen) return { ok: false, reason: 'too-long' };
  return { ok: true, value: s };
}

/**
 * firestore.rules-এর সাথে হুবহু মেলা একটা healthRecords পেলোড বানায় (createdAt বাদে —
 * সেটা caller serverTimestamp() দিয়ে বসায়)। ইনপুট ভুল হলে {ok:false, reason} ফেরত দেয়,
 * কখনো নিজে থেকে ডেটা বানায়/আন্দাজ করে না।
 */
export function buildRecordPayload({ category, title, facility, docDate, pages }) {
  if (!CATEGORY_IDS.includes(category)) return { ok: false, reason: 'bad-category' };
  const date = sanitizeDocDate(docDate);
  if (!date) return { ok: false, reason: 'bad-date' };
  const t = sanitizeOptionalText(title, 100);
  if (!t.ok) return { ok: false, reason: 'title-too-long' };
  const f = sanitizeOptionalText(facility, 100);
  if (!f.ok) return { ok: false, reason: 'facility-too-long' };
  const list = Array.isArray(pages) ? pages : [];
  if (list.length < 1 || list.length > MAX_PAGES) return { ok: false, reason: 'bad-page-count' };
  for (const p of list) {
    if (!p || typeof p.path !== 'string' || !p.path) return { ok: false, reason: 'bad-page' };
  }
  const data = { category, docDate: date, pageCount: list.length, pages: list };
  if (t.value) data.title = t.value;
  if (f.value) data.facility = f.value;
  return { ok: true, data };
}

/** ছোট হাতের অক্ষর-নিরাপদ স্টোরেজ ফাইলনেম — মূল নাম রাখা হয় না (path traversal/বিশেষ অক্ষর ঠেকাতে)। */
export function storageFileName(index, originalName, isPdf) {
  const ext = isPdf ? 'pdf' : (String(originalName || '').split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  return `page-${String(index).padStart(2, '0')}.${ext}`;
}

export function bnDigits(n) { return String(n).replace(/\d/g, d => '০১২৩৪৫৬৭৮৯'[d]); }

/** নতুন রেকর্ডের id — Firestore-এর নিজস্ব auto-id ট্রিকের উপর নির্ভর না করে
 *  সরাসরি একটা র‍্যান্ডম id বানায় (Storage path আর Firestore doc id একই রাখতে হয়,
 *  তাই আগে থেকেই id লাগে, ডকুমেন্ট তৈরির আগে)। */
export function newRecordId() {
  try { if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID(); } catch (_) {}
  return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 11);
}
