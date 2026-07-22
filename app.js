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