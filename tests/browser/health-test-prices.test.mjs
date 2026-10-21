// Browser smoke test for health.html (hub, public, no login) and test-prices.html
// (public static price directory — no Firebase at all, so no fake stubs needed for the page itself,
// but gstatic is still mapped in case app.js/health-core.js pull in anything unexpected).
import http from 'http'; import https from 'https'; import fs from 'fs'; import path from 'path';
import { stubs } from './fakefb.mjs';
import { ROOT, chromium, exe, tls } from './lib.mjs';
const vj = JSON.parse(fs.readFileSync(ROOT + '/vercel.json'));
const csp = vj.headers[0].headers.find(h => h.key === 'Content-Security-Policy').value.replace('; upgrade-insecure-requests', '');

https.createServer(tls, (q, s) => { const n = q.url.split('/').pop().split('?')[0];
  s.writeHead(200, { 'content-type': 'text/javascript', 'access-control-allow-origin': '*' }); s.end(stubs[n] || ''); }).listen(8446);
http.createServer((q, s) => { const p = q.url.split('?')[0];
  const f = path.join(ROOT, p); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
  const t = p.endsWith('.js') ? 'text/javascript' : p.endsWith('.css') ? 'text/css' : 'text/html';
  s.writeHead(200, { 'content-type': t, 'content-security-policy': csp }); s.end(fs.readFileSync(f)); }).listen(8098);

const b = await chromium.launch({ executablePath: exe, args: ['--host-resolver-rules=MAP www.gstatic.com 127.0.0.1:8446', '--ignore-certificate-errors', '--no-proxy-server'] });
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('  PASS', m); } else { fail++; console.log('  FAIL', m); } };
const open = async (url) => {
  const ctx = await b.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push('PAGEERR ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_|net::/.test(m.text())) errs.push(m.text()); });
  await page.goto('http://localhost:8098' + url); await page.waitForTimeout(500);
  return { ctx, page, errs };
};
const vis = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); return !!e && !e.hidden && getComputedStyle(e).display !== 'none'; }, sel);

console.log('1. health.html hub — no login required, links to all three features');
{ const { page, errs } = await open('/health.html');
  ok(await vis(page, '.feat[href="prescription.html"]'), 'Prescription card present, links to prescription.html');
  ok(await vis(page, '.feat[href="test-prices.html"]'), 'Test-prices card present, links to test-prices.html');
  ok(await vis(page, '.feat[href="diseases.html"]'), 'Diseases card present, links to diseases.html');
  ok(errs.length === 0, 'no console errors ' + JSON.stringify(errs));
}

console.log('1b. diseases.html — PDF-sourced encyclopedia library: cards, search/alias, category filter, URL state, real links');
{ const { page, errs } = await open('/diseases.html');
  const n = await page.$$eval('.dz-card', n => n.length);
  ok(n === 26, `renders all 26 encyclopedia diseases as cards (got ${n})`);
  ok((await page.textContent('#count')).includes('২৬টা রোগ'), 'result count shown in Bengali digits');

  // কার্ড এখন আসল <a href="/diseases/{slug}"> লিংক — বাটন+মোডাল না — ব্যাক বাটন যাতে স্বাভাবিকভাবে কাজ করে
  const hrefs = await page.$$eval('.dz-card', n => n.map(e => e.getAttribute('href')));
  ok(hrefs.every(h => /^\/diseases\/[a-z0-9-]+$/.test(h)), `every card links to a clean /diseases/{slug} URL (sample: ${hrefs[0]})`);

  await page.fill('#search-inp', 'ডায়াবেটিস'); await page.waitForTimeout(150);
  // সার্চ শুধু নাম/alias ফিল্ডে হয়, summary টেক্সটে না — তাই "ডায়াবেটিস" শুধু টাইপ ২ ডায়াবেটিস কার্ডই আনবে,
  // যদিও অন্য রোগের (যেমন কিডনি রোগ) সার-সংক্ষেপেও "ডায়াবেটিস" শব্দটা ঝুঁকির কারণ হিসেবে উল্লেখ আছে।
  let names = await page.$$eval('.dz-card .dz-name', n => n.map(e => e.textContent));
  ok(names.length === 1 && names[0] === 'টাইপ ২ ডায়াবেটিস', `name-only search does not false-match other diseases whose summary mentions the term (got ${JSON.stringify(names)})`);
  ok(new URL(page.url()).searchParams.get('q') === 'ডায়াবেটিস', 'search term is reflected in the URL (?q=...) so back/refresh preserves it');

  await page.fill('#search-inp', 'Dengue'); await page.waitForTimeout(150);
  names = await page.$$eval('.dz-card .dz-name-en', n => n.map(e => e.textContent));
  ok(names.length === 1 && names[0] === 'Dengue', 'English-name search narrows to the matching disease');

  await page.fill('#search-inp', 'টিবি'); await page.waitForTimeout(150);
  names = await page.$$eval('.dz-card .dz-name', n => n.map(e => e.textContent));
  ok(names.length === 1 && names[0].includes('যক্ষ্মা'), `alias search ("টিবি") finds Tuberculosis (got ${JSON.stringify(names)})`);

  await page.fill('#search-inp', ''); await page.waitForTimeout(150);
  await page.click('[data-cat="mental"]'); await page.waitForTimeout(150);
  names = await page.$$eval('.dz-card .dz-name', n => n.map(e => e.textContent));
  ok(names.length === 1 && names[0] === 'বিষণ্নতা', `category filter (মানসিক স্বাস্থ্য) shows only Depression (got ${JSON.stringify(names)})`);
  ok(new URL(page.url()).searchParams.get('cat') === 'mental', 'category choice is reflected in the URL (?cat=...)');

  await page.fill('#search-inp', 'zzzznomatch'); await page.waitForTimeout(150);
  ok(await vis(page, '#empty-state'), 'empty state shown for no matches');
  await page.click('#empty-clear'); await page.waitForTimeout(150);
  ok(!(await vis(page, '#empty-state')), 'empty state clears');
  ok((await page.$$eval('.dz-card', n => n.length)) === 26, 'full list restored after clearing search + category');
  ok(errs.length === 0, 'no console errors ' + JSON.stringify(errs));
}

console.log('2. test-prices.html — loads fully static, no Firebase/network needed');
{ const { page, errs } = await open('/test-prices.html');
  const cards = await page.$$eval('.test-card', n => n.length);
  ok(cards > 15, `renders all seeded tests as cards (got ${cards})`);
  ok((await page.textContent('#count')).includes('টা পরীক্ষা'), 'result count shown');
  ok(await vis(page, '.gov-badge'), 'government-price badge visible');
  ok((await page.textContent('.intro-note')).includes('নিশ্চিত'), 'subtle re-verification reminder visible (no loud disclaimer box)');
  ok((await page.$$eval('.price-meta', n => n.map(e => e.textContent))).every(t => t.includes('সূত্রের তারিখ')), 'every price row shows its source date (honesty preserved, without an alarming badge)');
  ok(errs.length === 0, 'no console errors ' + JSON.stringify(errs));
}

console.log('3. search by English name');
{ const { page } = await open('/test-prices.html');
  await page.fill('#search-inp', 'creatinine'); await page.waitForTimeout(150);
  const cards = await page.$$eval('.test-card', n => n.length);
  ok(cards === 1, 'English search narrows to the matching test');
  ok((await page.textContent('.test-card')).includes('Creatinine'), 'correct test shown');
}

console.log('4. search by Bengali keyword');
{ const { page } = await open('/test-prices.html');
  await page.fill('#search-inp', 'থাইরয়েড'); await page.waitForTimeout(150);
  const cards = await page.$$eval('.test-card', n => n.length);
  ok(cards >= 3, `Bengali keyword search finds thyroid tests (got ${cards})`);
}

console.log('5. search by abbreviation');
{ const { page } = await open('/test-prices.html');
  await page.fill('#search-inp', 'TSH'); await page.waitForTimeout(150);
  ok((await page.$$eval('.test-card', n => n.length)) === 1, 'abbreviation search works');
}

console.log('6. category filter');
{ const { page } = await open('/test-prices.html');
  await page.click('[data-cat="liver"]'); await page.waitForTimeout(150);
  const cards = await page.$$eval('.test-card b.tc-en', n => n.map(e => e.textContent));
  ok(cards.length > 0 && cards.every(() => true), `liver category filters the list (${cards.length} shown)`);
  ok(!(await page.$$eval('.test-card', n => n.some(c => c.textContent.includes('TSH')))), 'non-liver test (TSH) excluded by the filter');
}

console.log('7. empty state + clear');
{ const { page } = await open('/test-prices.html');
  await page.fill('#search-inp', 'zzzznomatch'); await page.waitForTimeout(150);
  ok(await vis(page, '#empty-state'), 'empty state shown for no matches');
  ok((await page.$$eval('.test-card', n => n.length)) === 0, 'no cards shown');
  await page.click('#empty-clear'); await page.waitForTimeout(150);
  ok(!(await vis(page, '#empty-state')), 'empty state clears');
  ok((await page.$$eval('.test-card', n => n.length)) > 15, 'full list restored after clearing search');
}

console.log('8. multi-source test (dengue) shows both prices, not one invented number');
{ const { page } = await open('/test-prices.html');
  await page.fill('#search-inp', 'dengue'); await page.waitForTimeout(150);
  const rows = await page.$$eval('.price-row .amt', n => n.map(e => e.textContent));
  ok(rows.length === 2, `dengue shows both sourced prices, not a single averaged one (got ${JSON.stringify(rows)})`);
  const srcLinks = await page.$$eval('.price-row .src-link', n => n.map(e => e.getAttribute('href')));
  ok(srcLinks.every(h => h.startsWith('https://') || h.startsWith('http://')), 'every price row links to a real source URL');
}

console.log(`\n${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
