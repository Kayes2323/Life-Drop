// ══════════════════════════════════════════════════════════
// Sondhan Health — রোগসমূহ: ডিজিজ লাইব্রেরি (পাবলিক, লগইন লাগে না, সম্পূর্ণ স্ট্যাটিক)
//
// সার্চ শুধু নাম/alias ফিল্ডে হয় (nameBn/nameEn/aliases) — summary-র টেক্সটে না,
// যাতে কোনো শব্দ কাকতালীয়ভাবে অন্য রোগের সার-সংক্ষেপে থাকলেও ভুল ম্যাচ না হয়
// (test-prices.js-এ একই নিয়ম প্রযোজ্য, এই সেশনে একবার বাগ হিসেবে ধরা পড়েছিল)।
//
// প্রতিটা কার্ড একটা আসল <a href="/diseases/{slug}..."> লিংক — বাটন+মোডাল না —
// যাতে ব্রাউজার ব্যাক/ফরওয়ার্ড স্বাভাবিকভাবে কাজ করে এবং disease.html খোলা/রিফ্রেশ
// করলেও সরাসরি কাজ করে (vercel.json rewrite দেখুন)। সার্চ/ফিল্টার স্টেট URL
// query-তে (?q=&cat=) রাখা হয় যাতে ব্যাক বাটনে প্রসঙ্গ ফিরে আসে, আর কার্ড লিংকেও
// একই query যোগ করা হয় যাতে disease.html-এর "লাইব্রেরিতে ফিরুন" লিংক সেই একই
// অবস্থায় ফিরে যেতে পারে।
// ══════════════════════════════════════════════════════════
import { esc } from './app.js';
import { bnDigits } from './health-core.js';
import { DZ_CATEGORIES, DISEASES } from './diseases-library.js';

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

const params = new URLSearchParams(location.search);
let activeCat = params.get('cat') || 'all';
let activeSearch = params.get('q') || '';
if (!DZ_CATEGORIES.some(c => c.id === activeCat)) activeCat = 'all';

function currentQuery() {
  const p = new URLSearchParams();
  if (activeSearch.trim()) p.set('q', activeSearch.trim());
  if (activeCat !== 'all') p.set('cat', activeCat);
  const s = p.toString();
  return s ? '?' + s : '';
}

function syncURL() {
  const qs = currentQuery();
  const url = location.pathname + qs;
  history.replaceState(null, '', url);
}

// নাম ও alias-এই সার্চ — body টেক্সটে না (দেখুন উপরের মন্তব্য)
function matches(d, q) {
  if (!q) return true;
  const hay = [d.nameBn, d.nameEn, ...(d.aliases || [])].join(' ').toLowerCase();
  return hay.includes(q);
}

function cardHtml(d) {
  const cat = DZ_CATEGORIES.find(c => c.id === d.category);
  return `<a class="dz-card" href="/diseases/${esc(d.slug)}${currentQuery()}">
    <div class="dz-card-main">
      <div class="dz-name">${esc(d.nameBn)}</div>
      <div class="dz-name-en">${esc(d.nameEn)}</div>
      <div class="dz-summary">${esc(d.summary)}</div>
      ${cat ? `<span class="dz-cat-badge">${esc(cat.label)}</span>` : ''}
    </div>
    <div class="dz-arrow" aria-hidden="true">
      <span>বিস্তারিত পড়ুন</span>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M9 6l6 6-6 6"/></svg>
    </div>
  </a>`;
}

function render() {
  const q = activeSearch.trim().toLowerCase();
  const list = DISEASES.filter(d => (activeCat === 'all' || d.category === activeCat) && matches(d, q));
  $('#count').textContent = `${bnDigits(list.length)}টা রোগ দেখানো হচ্ছে`;
  $('#dz-list').innerHTML = list.map(cardHtml).join('');
  $('#empty-state').hidden = list.length !== 0;
  syncURL();
}

function buildFilters() {
  $('#cat-filters').innerHTML = `<button class="fchip" data-cat="all">সব রোগ</button>` +
    DZ_CATEGORIES.map(c => `<button class="fchip" data-cat="${esc(c.id)}">${esc(c.label)}</button>`).join('');
  $$('#cat-filters [data-cat]').forEach(x => x.classList.toggle('active', x.dataset.cat === activeCat));
  $('#cat-filters').addEventListener('click', e => {
    const b = e.target.closest('[data-cat]'); if (!b) return;
    activeCat = b.dataset.cat;
    $$('#cat-filters [data-cat]').forEach(x => x.classList.toggle('active', x === b));
    render();
  });
}

$('#search-inp').value = activeSearch;
$('#clear-search').hidden = !activeSearch;
$('#search-inp').addEventListener('input', e => { activeSearch = e.target.value; $('#clear-search').hidden = !e.target.value; render(); });
$('#clear-search').addEventListener('click', () => { $('#search-inp').value = ''; activeSearch = ''; $('#clear-search').hidden = true; render(); });
$('#empty-clear').addEventListener('click', () => {
  $('#search-inp').value = ''; activeSearch = ''; $('#clear-search').hidden = true; activeCat = 'all';
  $$('#cat-filters [data-cat]').forEach(x => x.classList.toggle('active', x.dataset.cat === 'all'));
  render();
});

buildFilters();
render();
