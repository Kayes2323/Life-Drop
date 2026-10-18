// ══════════════════════════════════════════════════════════
// Sondhan Health — রোগসমূহ: UI (পাবলিক, লগইন লাগে না, সম্পূর্ণ স্ট্যাটিক)
// ══════════════════════════════════════════════════════════
import { esc } from './app.js';
import { DZ_CATEGORIES, DISEASES } from './diseases-data.js';

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
let activeCat = 'all', activeSearch = '';

function matches(d, q) {
  if (!q) return true;
  return [d.name, d.summary].join(' ').toLowerCase().includes(q);
}

function cardHtml(d) {
  return `<button class="dz-card" data-id="${esc(d.id)}">
    <div class="dz-name">${esc(d.name)}</div>
    <div class="dz-summary">${esc(d.summary)}</div>
  </button>`;
}

function render() {
  const q = activeSearch.trim().toLowerCase();
  const list = DISEASES.filter(d => (activeCat === 'all' || d.category === activeCat) && matches(d, q));
  $('#count').textContent = `${list.length}টা রোগ দেখানো হচ্ছে`;
  $('#dz-list').innerHTML = list.map(cardHtml).join('');
  $('#empty-state').hidden = list.length !== 0;
  $$('#dz-list [data-id]').forEach(b => b.addEventListener('click', () => openDetail(b.dataset.id)));
}

function buildFilters() {
  const used = new Set(DISEASES.map(d => d.category));
  const cats = DZ_CATEGORIES.filter(c => used.has(c.id));
  $('#cat-filters').innerHTML = `<button class="fchip active" data-cat="all">সবগুলো</button>` +
    cats.map(c => `<button class="fchip" data-cat="${esc(c.id)}">${esc(c.label)}</button>`).join('');
  $('#cat-filters').addEventListener('click', e => {
    const b = e.target.closest('[data-cat]'); if (!b) return;
    activeCat = b.dataset.cat;
    $$('#cat-filters [data-cat]').forEach(x => x.classList.toggle('active', x === b));
    render();
  });
}

function listHtml(items) { return `<ul class="dz-ul">${items.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`; }

function openDetail(id) {
  const d = DISEASES.find(x => x.id === id); if (!d) return;
  $('#detail-title').textContent = d.name;
  $('#detail-body').innerHTML = `
    <p class="dz-detail-summary">${esc(d.summary)}</p>
    <h3>সাধারণ লক্ষণ</h3>${listHtml(d.symptoms)}
    <h3>যত্ন ও নিয়ন্ত্রণ</h3><p>${esc(d.care)}</p>
    <h3>কখন ডাক্তার দেখাবেন</h3><p class="dz-when">${esc(d.whenDoctor)}</p>
    <p class="dz-disclaimer">⚠️ এটা সাধারণ তথ্য, রোগ নির্ণয় (diagnosis) নয়। লক্ষণ থাকলে চিকিৎসকের পরামর্শ নিন।</p>`;
  show('detail', true); show('detail-backdrop', true);
}
function closeDetail() { show('detail', false); show('detail-backdrop', false); }
function show(id, on) { const el = document.getElementById(id); if (el) el.hidden = !on; }

$('#search-inp').addEventListener('input', e => { activeSearch = e.target.value; $('#clear-search').hidden = !e.target.value; render(); });
$('#clear-search').addEventListener('click', () => { $('#search-inp').value = ''; activeSearch = ''; $('#clear-search').hidden = true; render(); });
$('#empty-clear').addEventListener('click', () => { $('#search-inp').value = ''; activeSearch = ''; $('#clear-search').hidden = true; activeCat = 'all';
  $$('#cat-filters [data-cat]').forEach(x => x.classList.toggle('active', x.dataset.cat === 'all')); render(); });
$('#detail-close').addEventListener('click', closeDetail);
$('#detail-backdrop').addEventListener('click', closeDetail);

buildFilters();
render();
