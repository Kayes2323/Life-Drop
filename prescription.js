// ══════════════════════════════════════════════════════════
// Sondhan — Health File (আমার মেডিকেল ফাইল): dashboard + আপলোড + viewer।
//
// ডেটা মডেল:
//   healthRecords/{recordId}  { ownerUid, category, title?, facility?, docDate,
//                               createdAt, pageCount, pages:[{path,name,type,size}] }
//   আসল ফাইল এখন Supabase Storage-এ (Firebase Storage নয় — Google Cloud
//   billing-এর ঝামেলা এড়াতে): path = {uid}/{recordId}/page-NN.ext
//   নিরাপত্তা: firestore.rules (ownerUid==auth.uid) + api/storage.js (path-এর
//   প্রথম অংশ uid-এর সাথে মিলতে হয়, Firebase ID token যাচাই করে) — সার্ভার
//   ফাংশনই আসল সীমানা, কারণ Supabase-এর গোপন চাবি শুধু সার্ভারেই থাকে।
//
// এই ফাইল কখনো মেডিকেল তথ্য নিজে বানায়/অনুমান করে না (কোনো OCR/AI নেই) —
// ব্যবহারকারী যা লেখেন আর যে ফাইল দেন, ঠিক তাই সংরক্ষণ করা হয়।
// ══════════════════════════════════════════════════════════
import { auth, db } from './firebase-config.js';
import { toast, esc, formatBnDate } from './app.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {
  collection, query, where, limit, onSnapshot, setDoc, deleteDoc, doc, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import {
  CATEGORIES, validateFileList, buildRecordPayload, storageFileName, bnDigits, newRecordId,
} from './health-core.js';

let CUR_UID = null;
let RECORDS = [];           // সর্বশেষ onSnapshot ফলাফল (ক্যাশ — সার্চ/ফিল্টার এখান থেকেই)
let unsubList = null;
let activeFilter = 'all';
let activeSearch = '';
let pendingFiles = [];      // মডালে বাছা ফাইল (এখনো আপলোড হয়নি)
let uploadTasks = [];       // চলমান uploadBytesResumable task — cancel-এর জন্য

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
const todayStr = () => new Date().toISOString().slice(0, 10);

function show(id, on = true) { const el = document.getElementById(id); if (el) el.hidden = !on; }

// ── /api/storage-এর সাথে যোগাযোগ (Supabase Storage-এর গেটকিপার) ────────
async function apiStorage(action, path, extra = {}) {
  const u = auth.currentUser; if (!u) throw new Error('not-signed-in');
  const idToken = await u.getIdToken();
  const res = await fetch('/api/storage', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + idToken },
    body: JSON.stringify({ action, path, ...extra }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.ok) throw Object.assign(new Error('storage-' + action + '-failed'), { reason: j.reason || res.status });
  return j;
}

// ── বুটস্ট্র্যাপ (inbox.html-এর সাথে মিলিয়ে: হার্ড-রিডাইরেক্ট নয়, বরং
//    লগইন-প্রম্পট দেখানো হয় — একই পেজ থেকে লগইন করে ফিরে আসা যায়) ──────
let uiWired = false;
onAuthStateChanged(auth, user => {
  if (!user) { CUR_UID = null; show('state-loading', false); show('state-login', true); show('record-list', false); return; }
  CUR_UID = user.uid;
  show('state-login', false); show('record-list', true); show('state-loading', true);
  if (!uiWired) { wireUi(); uiWired = true; }
  startListening();
});

function startListening() {
  if (unsubList) unsubList();
  // নোট: orderBy('docDate') এখানে ইচ্ছাকৃতভাবে নেই — where+orderBy ভিন্ন
  // ফিল্ডে একসাথে থাকলে Firestore composite index লাগে, যেটা কখনো বানানো
  // হয়নি; তাই onSnapshot fail করে "ইন্টারনেট নেই" দেখাচ্ছিল। sort এখন
  // ক্লায়েন্ট-সাইডে, নিচে।
  const q = query(collection(db, 'healthRecords'), where('ownerUid', '==', CUR_UID), limit(100));
  const timer = setTimeout(() => { show('state-loading', false); show('state-error', true); }, 12000);
  unsubList = onSnapshot(q, snap => {
    clearTimeout(timer);
    RECORDS = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    RECORDS.sort((a, b) => (b.docDate || '').localeCompare(a.docDate || ''));
    show('state-loading', false); show('state-error', false);
    render();
  }, err => {
    clearTimeout(timer);
    console.warn('[health] listen failed:', err && err.code);
    show('state-loading', false); show('state-error', true);
  });
}

// ── ইন্ডেক্স/টাইমলাইন রেন্ডার (সার্চ + ফিল্টার ক্লায়েন্ট-সাইডে) ──────
function render() {
  const list = RECORDS.filter(r => {
    if (activeFilter !== 'all' && r.category !== activeFilter) return false;
    if (!activeSearch) return true;
    const hay = [r.title, r.facility, catLabel(r.category)].filter(Boolean).join(' ').toLowerCase();
    return hay.includes(activeSearch);
  });
  show('state-empty', RECORDS.length === 0);
  show('state-no-match', RECORDS.length > 0 && list.length === 0);
  const wrap = $('#record-list');
  wrap.innerHTML = list.map(cardHtml).join('');
  $$('#record-list [data-open]').forEach(el => el.addEventListener('click', () => openViewer(el.dataset.open)));
  $$('#record-list [data-del]').forEach(el => el.addEventListener('click', e => { e.stopPropagation(); confirmDelete(el.dataset.del); }));
}

function catLabel(id) { return (CATEGORIES.find(c => c.id === id) || {}).label || id; }

function cardHtml(r) {
  const n = r.pageCount || (r.pages || []).length || 1;
  return `<div class="rec-card" data-open="${esc(r.id)}" tabindex="0" role="button" aria-label="${esc(r.title || catLabel(r.category))} খুলুন">
    <div class="rec-ic" aria-hidden="true">${pageIcon}</div>
    <div class="rec-body">
      <b>${esc(r.title || catLabel(r.category))}</b>
      <span class="rec-meta">${esc(catLabel(r.category))} · ${esc(formatBnDate(r.docDate) || r.docDate)}${r.facility ? ' · ' + esc(r.facility) : ''}</span>
      <span class="rec-pages">${bnDigits(n)} পাতা</span>
    </div>
    <button class="rec-del" data-del="${esc(r.id)}" aria-label="মুছে ফেলুন" title="মুছে ফেলুন">${trashIcon}</button>
  </div>`;
}
const pageIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>`;
const trashIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/></svg>`;

// ── UI তার (ফিল্টার/সার্চ/মডাল) ────────────────────────────────
function wireUi() {
  $('#search-inp').addEventListener('input', e => { activeSearch = e.target.value.trim().toLowerCase(); render(); });
  $('#cat-filters').addEventListener('click', e => {
    const b = e.target.closest('[data-filter]'); if (!b) return;
    activeFilter = b.dataset.filter;
    $$('#cat-filters [data-filter]').forEach(x => x.classList.toggle('active', x === b));
    render();
  });
  $('#add-btn').addEventListener('click', openAddModal);
  $('#add-empty-btn')?.addEventListener('click', openAddModal);
  $('#modal-close').addEventListener('click', closeAddModal);
  $('#modal-backdrop').addEventListener('click', closeAddModal);
  $('#file-camera').addEventListener('change', e => addPendingFiles(e.target.files));
  $('#file-gallery').addEventListener('change', e => addPendingFiles(e.target.files));
  $('#file-doc').addEventListener('change', e => addPendingFiles(e.target.files));
  $('#save-record-btn').addEventListener('click', saveRecord);
  $('#doc-date').value = todayStr();
  $('#viewer-close').addEventListener('click', closeViewer);
  $('#viewer-backdrop').addEventListener('click', closeViewer);
  $('#v-prev').addEventListener('click', () => turnPage(-1));
  $('#v-next').addEventListener('click', () => turnPage(1));
  $('#v-quick').addEventListener('click', toggleQuickView);
  $('#v-zoom-in').addEventListener('click', () => zoom(0.2));
  $('#v-zoom-out').addEventListener('click', () => zoom(-0.2));
  $('#v-fit').addEventListener('click', () => setZoom(1));
  document.addEventListener('keydown', e => {
    if ($('#viewer').hidden) return;
    if (e.key === 'ArrowRight') turnPage(1);
    if (e.key === 'ArrowLeft') turnPage(-1);
    if (e.key === 'Escape') closeViewer();
  });
  let tStartX = 0, tStartY = 0;
  const surf = $('#v-surface');
  surf.addEventListener('touchstart', e => { tStartX = e.touches[0].clientX; tStartY = e.touches[0].clientY; }, { passive: true });
  surf.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - tStartX, dy = e.changedTouches[0].clientY - tStartY;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) turnPage(dx < 0 ? 1 : -1);
  }, { passive: true });
}

// ── Add Document মডাল ──────────────────────────────────────────
function openAddModal() {
  pendingFiles = []; uploadTasks = [];
  $('#doc-title').value = ''; $('#doc-facility').value = ''; $('#doc-date').value = todayStr();
  $('#doc-category').value = 'prescription';
  renderPendingPreview();
  show('add-modal', true); show('modal-backdrop', true);
  $('#save-record-btn').disabled = false; $('#save-record-btn').textContent = 'সংরক্ষণ করুন';
}
function closeAddModal() {
  uploadTasks.forEach(xhr => { try { xhr.abort(); } catch (_) {} });
  uploadTasks = []; pendingFiles = [];
  show('add-modal', false); show('modal-backdrop', false);
}

function addPendingFiles(fileList) {
  const incoming = Array.from(fileList || []);
  if (!incoming.length) return;
  // একই নাম+সাইজ দুবার বাছলে ডুপ্লিকেট বাদ (এক সেশনে সহজ সাবধানতা — আগের রেকর্ডের সাথে তুলনা করে না)
  const seen = new Set(pendingFiles.map(f => f.name + ':' + f.size));
  for (const f of incoming) { const k = f.name + ':' + f.size; if (!seen.has(k)) { pendingFiles.push(f); seen.add(k); } }
  const v = validateFileList(pendingFiles);
  if (!v.ok) {
    toast(v.reason === 'too-large' ? 'একটি ফাইল ১৫MB-এর বেশি — ছোট ফাইল দিন'
      : v.reason === 'too-many-pages' ? 'একবারে সর্বোচ্চ ২০ পাতা' : v.reason === 'unsupported-type' || v.reason === 'unsupported-image-type' ? 'শুধু ছবি (JPG/PNG/WEBP) বা PDF সমর্থিত' : 'ফাইল সমস্যাযুক্ত');
    pendingFiles.pop();
  }
  renderPendingPreview();
}

function renderPendingPreview() {
  const wrap = $('#pending-preview');
  wrap.innerHTML = pendingFiles.map((f, i) => {
    const url = f.type === 'application/pdf' ? '' : URL.createObjectURL(f);
    return `<div class="pp-item">
      ${url ? `<img src="${url}" alt=""/>` : `<div class="pp-pdf">PDF</div>`}
      <span class="pp-name">${esc(f.name)}</span>
      <button data-rm="${i}" aria-label="বাদ দিন">✕</button>
      <div class="pp-bar" data-bar="${i}"><div></div></div>
    </div>`;
  }).join('') || '<p class="pp-empty">ছবি তুলুন, গ্যালারি থেকে বাছুন, বা PDF আপলোড করুন</p>';
  $$('#pending-preview [data-rm]').forEach(b => b.addEventListener('click', () => { pendingFiles.splice(+b.dataset.rm, 1); renderPendingPreview(); }));
}

async function saveRecord() {
  const category = $('#doc-category').value;
  const title = $('#doc-title').value;
  const facility = $('#doc-facility').value;
  const docDate = $('#doc-date').value;
  const v = validateFileList(pendingFiles);
  if (!v.ok) { toast('অন্তত একটি সঠিক ফাইল যোগ করুন'); return; }

  const btn = $('#save-record-btn'); btn.disabled = true; btn.textContent = 'আপলোড হচ্ছে...';
  const recordId = newRecordId(); // Storage path আর Firestore doc id একই রাখা হয়
  const uploaded = []; uploadTasks = [];
  try {
    for (let i = 0; i < pendingFiles.length; i++) {
      const file = pendingFiles[i];
      const isPdf = file.type === 'application/pdf';
      const path = `${CUR_UID}/${recordId}/${storageFileName(i, file.name, isPdf)}`;
      await uploadOne(file, path, i);
      uploaded.push({ path, name: file.name.slice(0, 120), type: file.type, size: file.size });
    }
    const payload = buildRecordPayload({ category, title, facility, docDate, pages: uploaded });
    if (!payload.ok) { toast('তথ্য সঠিক নয় — আবার দেখুন (তারিখ/ক্যাটাগরি)'); throw new Error('bad-payload:' + payload.reason); }
    await setDoc(doc(db, 'healthRecords', recordId), { ownerUid: CUR_UID, ...payload.data, createdAt: serverTimestamp() });
    toast('কাগজ যোগ হয়েছে ✓');
    closeAddModal();
  } catch (e) {
    console.warn('[health] save failed:', e);
    // যতটা আপলোড হয়েছিল, পরিষ্কার করার চেষ্টা (best-effort) — আধখেঁচড়া রেকর্ড Firestore-এ থাকে না যেহেতু setDoc সবশেষে হয়
    for (const u of uploaded) { try { await apiStorage('delete', u.path); } catch (_) {} }
    toast('সংরক্ষণ করা যায়নি — ইন্টারনেট দেখে আবার চেষ্টা করুন');
    btn.disabled = false; btn.textContent = 'আবার চেষ্টা করুন';
  }
}

// Supabase-এর signed upload URL-এ সরাসরি ব্রাউজার থেকে PUT করা হয় (ফাইলের বাইট
// আমাদের Vercel ফাংশন দিয়ে যায় না — সেখানে সাইজ-সীমা থাকতো, signed URL এড়িয়ে যায়)।
async function uploadOne(file, path, idx) {
  const { uploadUrl } = await apiStorage('sign-upload', path, { contentType: file.type });
  const bar = document.querySelector(`[data-bar="${idx}"] div`);
  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    uploadTasks.push(xhr);
    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.upload.onprogress = e => { if (bar && e.lengthComputable) bar.style.width = Math.round(100 * e.loaded / e.total) + '%'; };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300) ? resolve() : reject(new Error('upload-http-' + xhr.status));
    xhr.onerror = () => reject(new Error('upload-network'));
    xhr.onabort = () => reject(new Error('upload-cancelled'));
    xhr.send(file);
  });
}

// ── ডিলিট ──────────────────────────────────────────────────────
async function confirmDelete(id) {
  const r = RECORDS.find(x => x.id === id); if (!r) return;
  if (!window.confirm(`"${r.title || catLabel(r.category)}" মুছে ফেলবেন? এই কাজ ফেরানো যাবে না।`)) return;
  try {
    for (const p of (r.pages || [])) { try { await apiStorage('delete', p.path); } catch (e) { console.warn('[health] file delete failed (continuing):', p.path, e && e.reason); } }
    await deleteDoc(doc(db, 'healthRecords', id));
    toast('মুছে ফেলা হয়েছে');
  } catch (e) { console.warn('[health] delete failed:', e); toast('মুছতে সমস্যা হয়েছে — আবার চেষ্টা করুন'); }
}

// ── Viewer (পাতা উল্টানো + quick view + zoom) ──────────────────
let vRecord = null, vFlat = [], vIdx = 0, vQuick = false, vZoom = 1;
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

async function openViewer(id) {
  vRecord = RECORDS.find(r => r.id === id); if (!vRecord) return;
  vFlat = (vRecord.pages || []).map((p, i) => ({ fileIndex: i, file: p }));
  vIdx = 0; vQuick = false; vZoom = 1;
  $('#v-title').textContent = vRecord.title || catLabel(vRecord.category);
  show('viewer', true); show('viewer-backdrop', true);
  $('#viewer').classList.toggle('quick', false);
  await renderViewer();
}
function closeViewer() { show('viewer', false); show('viewer-backdrop', false); vRecord = null; }

function toggleQuickView() { vQuick = !vQuick; $('#viewer').classList.toggle('quick', vQuick); renderViewer(); }
function zoom(d) { setZoom(Math.min(3, Math.max(1, vZoom + d))); }
function setZoom(z) { vZoom = z; $('#v-surface').style.setProperty('--z', String(z)); }

async function urlFor(path) {
  try { return (await apiStorage('sign-download', path)).url; } catch (e) { console.warn('[health] download url failed:', path, e && e.reason); return ''; }
}

async function pageMediaHtml(entry) {
  const f = entry.file;
  if (f.type === 'application/pdf') {
    // সরল, নিরাপদ পদ্ধতি: PDF নতুন ট্যাবে/ব্রাউজারের নিজের ভিউয়ারে খোলে —
    // আসল পাতা-সংখ্যা ব্রাউজারের PDF viewer-ই দেখায়; এখানে কোনো pdf.js নির্ভরতা
    // যোগ করা হয়নি (নতুন CDN/CSP সারফেস এড়ানো, সীমাবদ্ধতা হিসেবে নিচে নোট করা আছে)।
    const url = await urlFor(f.path);
    return `<div class="v-pdf"><p>PDF ডকুমেন্ট — পাতা নিজের ভিউয়ারে দেখুন।</p>${url ? `<a class="v-pdf-open" href="${esc(url)}" target="_blank" rel="noopener noreferrer">PDF খুলুন</a>` : '<p class="v-err">লোড করা যায়নি</p>'}</div>`;
  }
  const url = await urlFor(f.path);
  return url ? `<img src="${esc(url)}" alt=""/>` : '<p class="v-err">ছবি লোড করা যায়নি</p>';
}

async function renderViewer() {
  if (vQuick) {
    const items = await Promise.all(vFlat.map(pageMediaHtml));
    $('#v-surface').innerHTML = items.map((h, i) => `<div class="v-quick-page">${h}<span class="v-quick-n">${bnDigits(i + 1)}</span></div>`).join('');
    $('#v-nav').hidden = true; $('#v-thumbs').hidden = true;
    return;
  }
  $('#v-nav').hidden = false; $('#v-thumbs').hidden = false;
  const entry = vFlat[vIdx];
  $('#v-surface').innerHTML = entry ? `<div class="v-leaf">${await pageMediaHtml(entry)}</div>` : '';
  $('#v-page-n').textContent = `${bnDigits(vIdx + 1)} / ${bnDigits(vFlat.length)}`;
  $('#v-prev').disabled = vIdx === 0; $('#v-next').disabled = vIdx === vFlat.length - 1;
  renderThumbs();
  setZoom(1);
}

function renderThumbs() {
  $('#v-thumbs').innerHTML = vFlat.map((_, i) =>
    `<button class="v-thumb${i === vIdx ? ' active' : ''}" data-i="${i}" aria-label="পাতা ${bnDigits(i + 1)}">${bnDigits(i + 1)}</button>`).join('');
  $$('#v-thumbs .v-thumb').forEach(b => b.addEventListener('click', () => { vIdx = +b.dataset.i; renderViewer(); }));
}

function turnPage(dir) {
  const next = vIdx + dir; if (next < 0 || next >= vFlat.length) return;
  const surf = $('#v-surface');
  if (!reducedMotion()) {
    surf.classList.add('turning');
    setTimeout(() => surf.classList.remove('turning'), 260);
  }
  vIdx = next; renderViewer();
}
