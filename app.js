// ══════════════════════════════════════════════════════════
// Sondhan — শেয়ার্ড হেল্পার (সব পেজে এই একটাই ব্যবহার হবে)
// ══════════════════════════════════════════════════════════

/* ── নিরাপত্তা: HTML escape ────────────────────────────────
   Firestore থেকে আসা যেকোনো লেখা innerHTML-এ বসানোর আগে
   অবশ্যই esc() দিয়ে পাস করাতে হবে। নাহলে XSS হয়।           */
const _ESC = { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;', '`':'&#96;' };
export function esc(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/[&<>"'`]/g, c => _ESC[c]);
}

/* HTML attribute-এর ভেতরে বসানোর জন্য (যেমন data-id="...") */
export function escAttr(v) { return esc(v); }

/* ── ফোন নম্বর ───────────────────────────────────────────── */
/** যেকোনো ফরম্যাট → E.164 (+8801XXXXXXXXX)। না পারলে '' ফেরত দেয়। */
export function normalizeBdPhone(raw) {
  let d = String(raw || '').replace(/[\s\-()]/g, '');
  if (!d) return '';
  if (d.startsWith('+')) d = d.slice(1);
  if (d.startsWith('880')) d = d.slice(3);
  if (d.startsWith('0'))  d = d.slice(1);
  // এখানে d হওয়ার কথা 1XXXXXXXXX (১০ সংখ্যা)
  return /^1\d{9}$/.test(d) ? '+880' + d : '';
}

/** বাংলাদেশি নম্বর বৈধ কি না */
export function isValidBdPhone(raw) { return normalizeBdPhone(raw) !== ''; }

/** WhatsApp লিংক — wa.me দেশের কোড ছাড়া কাজ করে না */
export function waLink(raw) {
  const p = normalizeBdPhone(raw);
  if (p) return 'https://wa.me/' + p.slice(1);          // + বাদ দিতে হয়
  const digits = String(raw || '').replace(/\D/g, '');
  return digits ? 'https://wa.me/' + digits : '';
}

/** tel: লিংক */
export function telLink(raw) {
  const p = normalizeBdPhone(raw);
  return 'tel:' + (p || String(raw || '').replace(/[^\d+]/g, ''));
}

/* ── ছোট UI হেল্পার ──────────────────────────────────────── */
let _toastTimer = null;
export function toast(msg) {
  const t = document.getElementById('toast');
  if (!t) { console.log('[toast]', msg); return; }
  t.textContent = msg;                 // textContent — innerHTML নয়, তাই নিরাপদ
  t.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove('show'), 2700);
}

export function setLoading(on) {
  document.getElementById('loading')?.classList.toggle('show', !!on);
}

/** নামের আদ্যক্ষর (avatar-এর জন্য) */
export function initials(name) {
  return String(name || 'D').trim().split(/\s+/)
    .map(w => w[0] || '').join('').substring(0, 2).toUpperCase() || 'D';
}

/* ── সময় ─────────────────────────────────────────────────── */
export function timeAgo(ts) {
  if (!ts) return '';
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  if (isNaN(d)) return '';
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 0)     return 'এইমাত্র';
  if (s < 60)    return 'এইমাত্র';
  if (s < 3600)  return Math.floor(s / 60) + ' মিনিট আগে';
  if (s < 86400) return Math.floor(s / 3600) + ' ঘণ্টা আগে';
  return Math.floor(s / 86400) + ' দিন আগে';
}

export function formatDateTime(str) {
  if (!str) return '—';
  try {
    const d = new Date(str);
    if (isNaN(d)) return '—';
    return d.toLocaleString('bn-BD', { dateStyle: 'medium', timeStyle: 'short' });
  } catch (_) { return '—'; }
}

/** তারিখ (YYYY-MM-DD) → "৭ মে, ২০২৬" */
export function formatBnDate(str) {
  if (!str) return '—';
  const d = new Date(str);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString('bn-BD', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** ইংরেজি সংখ্যা → বাংলা সংখ্যা (২৩, ৬৪ ইত্যাদি) */
export function toBn(n) {
  return String(n ?? '').replace(/\d/g, d => '০১২৩৪৫৬৭৮৯'[d]);
}

/** দিনের সময় অনুযায়ী বাংলা নাম (সকাল/দুপুর/বিকাল/সন্ধ্যা/রাত) */
function banglaPeriod(h) {
  if (h < 6)  return 'ভোর';
  if (h < 12) return 'সকাল';
  if (h < 15) return 'দুপুর';
  if (h < 18) return 'বিকাল';
  if (h < 20) return 'সন্ধ্যা';
  return 'রাত';
}

/**
 * "কখন রক্ত লাগবে" — আপেক্ষিক ও পড়তে সহজ ফরম্যাটে।
 * আজ হলে "আজ সন্ধ্যা ৬:৩০", কাল হলে "আগামীকাল সকাল ৯:০০",
 * নাহলে "১৫ মে, সন্ধ্যা ৬:৩০"। পেরিয়ে গেলে "সময় পেরিয়ে গেছে"।
 */
export function formatWhen(str) {
  if (!str) return '—';
  const d = new Date(str);
  if (isNaN(d)) return '—';

  const now = new Date();
  const startOf = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dayDiff = Math.round((startOf(d) - startOf(now)) / 86400000);

  let h = d.getHours();
  const m = d.getMinutes();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const time = `${banglaPeriod(h)} ${toBn(h12)}:${toBn(String(m).padStart(2, '0'))}`;

  if (dayDiff === 0)  return 'আজ ' + time;
  if (dayDiff === 1)  return 'আগামীকাল ' + time;
  if (dayDiff === -1) return 'গতকাল ' + time;
  if (dayDiff < 0)    return d.toLocaleDateString('bn-BD', { day: 'numeric', month: 'long' }) + ', ' + time;
  return d.toLocaleDateString('bn-BD', { day: 'numeric', month: 'long' }) + ', ' + time;
}

/** অনুরোধের সময় পেরিয়ে গেছে কি না */
export function isPast(str) {
  if (!str) return false;
  const d = new Date(str);
  return !isNaN(d) && d.getTime() < Date.now();
}

/**
 * পরবর্তী রক্তদানের যোগ্যতা — শেষ দানের ১২০ দিন (৪ মাস) পর নিরাপদ।
 * ফেরত দেয়: { ready, daysLeft, percent, fromLabel, toLabel }
 * শেষ দানের তারিখ না থাকলে ready = true।
 */
export const DONATION_GAP_DAYS = 120;

export function eligibility(lastDonation) {
  if (!lastDonation) return { ready: true, daysLeft: 0, percent: 100, fromLabel: '', toLabel: '' };
  const from = new Date(lastDonation);
  if (isNaN(from)) return { ready: true, daysLeft: 0, percent: 100, fromLabel: '', toLabel: '' };

  const to = new Date(from.getTime() + DONATION_GAP_DAYS * 86400000);
  const elapsed = Date.now() - from.getTime();
  const total = to.getTime() - from.getTime();
  const daysLeft = Math.ceil((to.getTime() - Date.now()) / 86400000);
  const percent = Math.max(0, Math.min(100, Math.round((elapsed / total) * 100)));
  const fmt = d => d.toLocaleDateString('bn-BD', { day: 'numeric', month: 'long' });

  return {
    ready: daysLeft <= 0,
    daysLeft: Math.max(0, daysLeft),
    percent,
    fromLabel: fmt(from),
    toLabel: fmt(to)
  };
}

/* ── বিভাগ ও জেলা (আগে ২ ফাইলে কপি ছিল) ─────────────────── */
export const DIVISIONS = ['ঢাকা','চট্টগ্রাম','খুলনা','রাজশাহী','রংপুর','সিলেট','বরিশাল','ময়মনসিংহ'];

export const DISTRICTS = {
  'ঢাকা'      : ['ঢাকা','গাজীপুর','নারায়ণগঞ্জ','মানিকগঞ্জ','মুন্সীগঞ্জ','নরসিংদী','ফরিদপুর','গোপালগঞ্জ','মাদারীপুর','রাজবাড়ী','শরীয়তপুর','কিশোরগঞ্জ','টাঙ্গাইল'],
  'চট্টগ্রাম'  : ['চট্টগ্রাম','কক্সবাজার','কুমিল্লা','ফেনী','নোয়াখালী','লক্ষ্মীপুর','চাঁদপুর','ব্রাহ্মণবাড়িয়া','রাঙামাটি','খাগড়াছড়ি','বান্দরবান'],
  'খুলনা'     : ['খুলনা','বাগেরহাট','সাতক্ষীরা','যশোর','নড়াইল','মাগুরা','ঝিনাইদহ','কুষ্টিয়া','মেহেরপুর','চুয়াডাঙ্গা'],
  'রাজশাহী'   : ['রাজশাহী','নাটোর','নওগাঁ','চাঁপাইনবাবগঞ্জ','পাবনা','সিরাজগঞ্জ','বগুড়া','জয়পুরহাট'],
  'রংপুর'     : ['রংপুর','গাইবান্ধা','কুড়িগ্রাম','লালমনিরহাট','নীলফামারী','ঠাকুরগাঁও','পঞ্চগড়','দিনাজপুর'],
  'সিলেট'     : ['সিলেট','মৌলভীবাজার','হবিগঞ্জ','সুনামগঞ্জ'],
  'বরিশাল'    : ['বরিশাল','ভোলা','পটুয়াখালী','পিরোজপুর','ঝালকাঠি','বরগুনা'],
  'ময়মনসিংহ' : ['ময়মনসিংহ','জামালপুর','শেরপুর','নেত্রকোণা']
};

export const BLOOD_GROUPS = ['A+','A-','B+','B-','AB+','AB-','O+','O-'];

/** একটা <select>-এ জেলা ভরে দেয় */
export function fillDistrictSelect(selectEl, division, placeholder = 'জেলা') {
  if (!selectEl) return;
  selectEl.innerHTML = `<option value="">${placeholder}</option>`;
  (DISTRICTS[division] || []).forEach(d => {
    const o = document.createElement('option');
    o.textContent = d; o.value = d;
    selectEl.appendChild(o);
  });
}

/* ── অ্যাডমিন চেক (rules-এর সাথে হুবহু মিলতে হবে) ───────── */
export const SUPER_ADMIN_EMAIL = 'aakayes99@gmail.com';
export function isSuperAdmin(user) {
  return !!user && (user.email || '').toLowerCase() === SUPER_ADMIN_EMAIL;
}
