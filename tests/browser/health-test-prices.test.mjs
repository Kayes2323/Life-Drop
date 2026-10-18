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

console.log('1. health.html hub — no login required, links to both features');
{ const { page, errs } = await open('/health.html');
  ok(await vis(page, '.feat[href="prescription.html"]'), 'Prescription card present, links to prescription.html');
  ok(await vis(page, '.feat[href="test-prices.html"]'), 'Test-prices card present, links to test-prices.html');
  ok(errs.length === 0, 'no console errors ' + JSON.stringify(errs));
}

console.log('2. test-prices.html — loads fully static, no Firebase/network needed');
{ const { page, errs } = await open('/test-prices.html');
  const cards = await page.$$eval('.test-card', n => n.length);
  ok(cards > 15, `renders all seeded tests as cards (got ${cards})`);
  ok((await page.textContent('#count')).includes('টা পরীক্ষা'), 'result count shown');
  ok(await vis(page, '.gov-badge'), 'government-price badge visible');
  ok(await vis(page, '.disclaimer'), 'disclaimer about re-verification visible');
  ok((await page.$$eval('.status-badge', n => n.map(e => e.textContent))).every(t => t.includes('যাচাই')), 'every price row carries a needs-reverification badge (no price claimed as currently verified)');
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
