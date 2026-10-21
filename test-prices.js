// ══════════════════════════════════════════════════════════
// Sondhan Health — মেডিকেল টেস্টের মূল্যতালিকা: UI (পাবলিক, লগইন লাগে না)
// সম্পূর্ণ ক্লায়েন্ট-সাইড স্ট্যাটিক ডেটা (test-prices-data.js) — কোনো
// Firebase/নেটওয়ার্ক কল নেই, তাই লোডিং/এরর স্টেট এখানে প্রযোজ্য না।
// ══════════════════════════════════════════════════════════
import { esc } from './app.js';
import { bnDigits } from './health-core.js';
import { CATEGORIES, TESTS } from './test-prices-data.js';

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

let activeCat = 'all';
// অন্য পেজ (যেমন disease.html) থেকে ?q=... দিয়ে ডিপ-লিংক করলে সেই সার্চ-টার্ম
// দিয়েই পেজ খোলে — ব্যবহারকারীকে আবার টাইপ করতে হয় না।
let activeSearch = new URLSearchParams(location.search).get('q') || '';

const STATUS_LABEL = { needs_reverify: 'মূল্য পুনরায় যাচাই করা প্রয়োজন', verified: 'সাম্প্রতিক যাচাই করা হয়েছে' };

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return iso;
  const months = ['জানুয়ারি','ফেব্রুয়ারি','মার্চ','এপ্রিল','মে','জুন','জুলাই','আগস্ট','সেপ্টেম্বর','অক্টোবর','নভেম্বর','ডিসেম্বর'];
  return `${bnDigits(d.getDate())} ${months[d.getMonth()]}, ${bnDigits(d.getFullYear())}`;
}

// নাম/সংক্ষিপ্তরূপ/বাংলা নামেই সার্চ করা হয় — ব্যাখ্যার টেক্সটে না, যাতে কেউ "TSH" লিখলে
// শুধু TSH টেস্টই আসে, এমন কোনো অন্য টেস্ট না যার ব্যাখ্যায় কাকতালীয়ভাবে "TSH" শব্দটা আছে।
function matches(t, q) {
  if (!q) return true;
  const hay = [t.en, t.abbr, t.bn].filter(Boolean).join(' ').toLowerCase();
  return hay.includes(q);
}

function priceRow(p) {
  return `<div class="price-row">
    <div class="price-row-top">
      <span class="amt">৳${bnDigits(p.amount)}</span>
      <span class="status-badge">${esc(STATUS_LABEL[p.status] || STATUS_LABEL.needs_reverify)}</span>
    </div>
    <div class="price-facility">${esc(p.facility)}</div>
    ${p.publishedDate ? `<div class="price-meta">সূত্রের তারিখ: ${fmtDate(p.publishedDate)}</div>` : ''}
    ${p.notes ? `<div class="price-note">${esc(p.notes)}</div>` : ''}
    <a class="src-link" href="${esc(p.sourceUrl)}" target="_blank" rel="noopener noreferrer">
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14 21 3"/></svg>
      উৎস ও বিস্তারিত — ${esc(p.sourceName)}
    </a>
  </div>`;
}

function cardHtml(t) {
  return `<div class="test-card" data-id="${esc(t.id)}">
    <div class="tc-head">
      <div>
        <b class="tc-en">${esc(t.en)}</b>
        ${t.abbr && t.abbr !== t.en ? `<span class="tc-abbr">${esc(t.abbr)}</span>` : ''}
      </div>
    </div>
    <div class="tc-bn">বাংলা: ${esc(t.bn)}</div>
    <div class="tc-explain"><b>কেন করা হয়:</b> ${esc(t.explain)}</div>
    <div class="tc-prices">${t.prices.map(priceRow).join('')}</div>
  </div>`;
}

function render() {
  const q = activeSearch.trim().toLowerCase();
  const list = TESTS.filter(t => (activeCat === 'all' || t.category === activeCat) && matches(t, q));
  $('#count').textContent = `${bnDigits(list.length)}টা পরীক্ষা দেখানো হচ্ছে`;
  $('#test-list').innerHTML = list.map(cardHtml).join('');
  $('#empty-state').hidden = list.length !== 0;
}

function buildFilters() {
  const used = new Set(TESTS.map(t => t.category));
  const cats = CATEGORIES.filter(c => used.has(c.id));
  $('#cat-filters').innerHTML = `<button class="fchip active" data-cat="all">সবগুলো</button>` +
    cats.map(c => `<button class="fchip" data-cat="${esc(c.id)}">${esc(c.label)}</button>`).join('');
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
$('#empty-clear').addEventListener('click', () => { $('#search-inp').value = ''; activeSearch = ''; $('#clear-search').hidden = true; activeCat = 'all';
  $$('#cat-filters [data-cat]').forEach(x => x.classList.toggle('active', x.dataset.cat === 'all')); render(); });

buildFilters();
render();
