// ══════════════════════════════════════════════════════════
// Sondhan Health — রোগের বিস্তারিত পেজ (dynamic, একটাই ফাইল সব ২৬টা রোগের জন্য)
//
// URL থেকে slug পড়া হয় (/diseases/{slug} — vercel.json rewrite দিয়ে এই ফাইলটাই
// সার্ভ হয়, ব্রাউজারের ঠিকানা বদলায় না)। diseases-library.js থেকে হালকা ইনডেক্স
// synchronously import হয় (slug/নাম/ক্যাটাগরি/সার-সংক্ষেপ যাচাইয়ের জন্য), আর
// পূর্ণ আর্টিকেল কনটেন্ট (diseases-content.js) শুধু তখনই dynamic import হয় যখন
// slug সত্যিই খুঁজে পাওয়া যায় — অজানা/ভুল slug-এ "পাওয়া যায়নি" স্টেট দেখানো হয়,
// ফাঁকা পেজ বা JS ক্র্যাশ না করে।
//
// সীমাবদ্ধতা (সৎভাবে উল্লেখ): এই পেজ সম্পূর্ণ client-rendered — তাই <title>/
// meta description/canonical প্রতিটা রোগের জন্য আলাদা করে সার্ভার-সাইডে বসানো
// সম্ভব না; সেগুলো এখানে JS দিয়ে ডেটা লোড হওয়ার পরই বসানো হয় (test-prices.html/
// diseases.html লাইব্রেরি পেজেও একই ধরনের client-rendered সীমাবদ্ধতা আছে)।
// ══════════════════════════════════════════════════════════
import { esc } from './app.js';
import { DISEASES, DZ_CATEGORIES } from './diseases-library.js';

const $ = sel => document.querySelector(sel);

function slugFromPath() {
  const parts = location.pathname.split('/').filter(Boolean);
  return decodeURIComponent(parts[parts.length - 1] || '');
}

function show(id, on) { const el = document.getElementById(id); if (el) el.hidden = !on; }

function ul(items) { return `<ul>${items.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`; }
function ol(items) { return `<ol style="padding-left:19px;display:flex;flex-direction:column;gap:6px">${items.map(x => `<li style="font-size:13.5px;color:#444;line-height:1.75">${esc(x)}</li>`).join('')}</ol>`; }

function setMeta(name, content) {
  let el = document.querySelector(`meta[name="${name}"]`);
  if (!el) { el = document.createElement('meta'); el.setAttribute('name', name); document.head.appendChild(el); }
  el.setAttribute('content', content);
}
function setCanonical(href) {
  let el = document.querySelector('link[rel="canonical"]');
  if (!el) { el = document.createElement('link'); el.setAttribute('rel', 'canonical'); document.head.appendChild(el); }
  el.setAttribute('href', href);
}

function notFound() {
  show('loading', false);
  show('notfound', true);
  document.title = 'রোগ পাওয়া যায়নি — Sondhan Health';
  setMeta('robots', 'noindex, follow');
}

async function main() {
  const slug = slugFromPath();
  const d = DISEASES.find(x => x.slug === slug);
  if (!d) { notFound(); return; }

  const cat = DZ_CATEGORIES.find(c => c.id === d.category);
  const backHref = '/diseases' + location.search;
  $('#header-back').setAttribute('href', backHref);
  $('#back-lib-link').setAttribute('href', backHref);

  // SEO: ক্লায়েন্ট-সাইডে বসানো — সার্ভার-সাইড রেন্ডার না থাকায় এটা পূর্ণ SSR নয়,
  // কিন্তু লাইব্রেরি ইনডেক্স দিয়ে সঙ্গে সঙ্গেই বসানো যায় (পূর্ণ কনটেন্ট লোডের অপেক্ষা ছাড়াই)।
  document.title = `${d.nameBn} (${d.nameEn}) — Sondhan Health`;
  setMeta('description', `${d.nameBn} (${d.nameEn})-এর কারণ, লক্ষণ, প্রতিরোধ, পরীক্ষা ও জরুরি করণীয় — সহজ বাংলায়। ${d.summary}`.slice(0, 300));
  setMeta('robots', 'noindex, follow'); // sitemap-এ আলাদাভাবে তালিকাভুক্ত নয়, তাই noindex — ডিজিজ লাইব্রেরি পাবলিকভাবে ইনডেক্সড
  setCanonical(`https://www.sondhan.org/diseases/${d.slug}`);
  $('#header-title').textContent = d.nameBn;

  let content;
  try {
    const mod = await import('./diseases-content.js');
    content = mod.DISEASE_CONTENT[d.slug];
    if (!content) throw new Error('no-content');
    window.__diseaseGeneric = mod.GENERIC; // ডিবাগ/টেস্টের সুবিধার জন্য, রেন্ডারে ব্যবহার হয় না
    renderPage(d, cat, content, mod.GENERIC);
  } catch (e) {
    console.warn('[disease.js] কনটেন্ট লোড করা যায়নি:', e);
    notFound();
    return;
  }

  show('loading', false);
  show('content', true);
}

function renderPage(d, cat, c, G) {
  $('#top-cat').textContent = cat ? cat.label : '';
  $('#top-name-bn').textContent = d.nameBn;
  $('#top-name-en').textContent = d.nameEn;
  $('#top-summary').textContent = d.summary;
  $('#emg-top-text').textContent = c.emergencySigns;

  const sections = [
    { id: 'what', title: '১. রোগটি কী?', body: `<p>${esc(c.causes)}</p>` },
    { id: 'risk', title: '২. রোগ হওয়ার কারণ ও ঝুঁকি', body: ul(c.riskFactors) },
    { id: 'symptoms', title: '৩. লক্ষণ ও সতর্কসংকেত', body: ul(c.symptoms) },
    { id: 'when-doctor', title: '৪. কখন চিকিৎসকের কাছে যাবেন?', body: ul(G.whenToSeeDoctor) },
    { id: 'tests', title: '৫. কোন পরীক্ষা প্রয়োজন হতে পারে?', body: ul(G.tests) +
      (c.relatedTest ? `<a class="related-link" href="/test-prices?q=${encodeURIComponent(c.relatedTest.query)}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
        ${esc(c.relatedTest.label)}</a>` : '') },
    { id: 'food', title: '৬. খাবার ও পুষ্টি', body: `<p>${esc(c.foodAllowed)}</p><h3>কী সীমিত/এড়িয়ে চলবেন</h3>${ul(G.limitFoods)}` },
    { id: 'daily', title: '৭. দৈনন্দিন যত্ন ও অভ্যাস', body: ul(G.dailyPlan) },
    { id: 'prevention', title: '৮. প্রতিরোধ', body: ul(c.habitsPrevention) },
    { id: 'emergency', title: '৯. জরুরি অবস্থায় করণীয়', body:
      `<p>${esc(c.emergencySigns)}</p>
       <h3>সাহায্য আসা পর্যন্ত যা করবেন</h3>${ol(G.bystanderCare)}
       <div class="caution"><b>যা করবেন না</b>${G.whatNotToDo.map(x => `<div>${esc(x)}</div>`).join('')}</div>` },
    { id: 'doctor', title: '১০. চিকিৎসক ও স্বাস্থ্যসেবা', body: ul(G.questionsForDoctor) +
      `<a class="related-link" href="/prescription">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
        রিপোর্ট/প্রেসক্রিপশন সংরক্ষণ করতে আমার মেডিকেল ফাইলে যান</a>` },
    { id: 'sources', title: '১১. তথ্যসূত্র', body:
      `<ul class="src-list">${[...G.sources, ...(c.extraSources || [])].map(s =>
        `<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.name)}</a></li>`).join('')}</ul>
       <p class="footer-note" style="margin-top:10px">${esc(G.footerNote)}</p>` },
  ];

  $('#toc-list').innerHTML = sections.map(s => `<li><a href="#${s.id}">${esc(s.title)}</a></li>`).join('');
  $('#article').innerHTML = sections.map(s => `<section class="sec" id="${s.id}"><h2>${esc(s.title)}</h2>${s.body}</section>`).join('');
}

main();
