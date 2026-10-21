// Browser smoke test for the dynamic Disease Detail page (disease.html + disease.js) and its
// vercel.json routing (/diseases/:slug -> disease.html). This is fully static/public — no Firebase —
// but we still map www.gstatic.com for harness consistency with the other browser tests.
//
// The local static server below reproduces the one rewrite rule this feature depends on
// (GET /diseases/<slug> -> serves disease.html, same as vercel.json's "/diseases/:slug" rewrite)
// so we can test direct-navigation + refresh exactly as a real deploy would behave.
import http from 'http'; import https from 'https'; import fs from 'fs'; import path from 'path';
import { stubs } from './fakefb.mjs';
import { ROOT, chromium, exe, tls } from './lib.mjs';
const vj = JSON.parse(fs.readFileSync(ROOT + '/vercel.json'));
const csp = vj.headers[0].headers.find(h => h.key === 'Content-Security-Policy').value.replace('; upgrade-insecure-requests', '');
// sanity: the rewrite this test relies on must actually be declared in vercel.json
const hasRewrite = vj.rewrites.some(r => r.source === '/diseases/:slug' && r.destination === '/disease.html');

https.createServer(tls, (q, s) => { const n = q.url.split('/').pop().split('?')[0];
  s.writeHead(200, { 'content-type': 'text/javascript', 'access-control-allow-origin': '*' }); s.end(stubs[n] || ''); }).listen(8447);

http.createServer((q, s) => {
  const p = q.url.split('?')[0];
  let f;
  if (p === '/diseases') f = path.join(ROOT, 'diseases.html');
  else if (/^\/diseases\/[^/]+$/.test(p)) f = path.join(ROOT, 'disease.html'); // mirrors vercel.json "/diseases/:slug" rewrite
  else f = path.join(ROOT, p);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
  const t = f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'text/html';
  s.writeHead(200, { 'content-type': t, 'content-security-policy': csp }); s.end(fs.readFileSync(f));
}).listen(8099);

const b = await chromium.launch({ executablePath: exe, args: ['--host-resolver-rules=MAP www.gstatic.com 127.0.0.1:8447', '--ignore-certificate-errors', '--no-proxy-server'] });
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('  PASS', m); } else { fail++; console.log('  FAIL', m); } };
const open = async (url, viewport = { width: 390, height: 844 }) => {
  const ctx = await b.newContext({ ignoreHTTPSErrors: true, viewport });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push('PAGEERR ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_|net::/.test(m.text())) errs.push(m.text()); });
  await page.goto('http://localhost:8099' + url); await page.waitForTimeout(400);
  return { ctx, page, errs };
};
const vis = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); return !!e && !e.hidden && getComputedStyle(e).display !== 'none'; }, sel);
const text = (page, sel) => page.textContent(sel).catch(() => null);

ok(hasRewrite, 'vercel.json declares the "/diseases/:slug" -> "/disease.html" rewrite this whole test depends on');

console.log('1. direct navigation to /diseases/dengue works (no referrer, exactly like a fresh link/bookmark)');
{ const { page, errs } = await open('/diseases/dengue');
  ok(await vis(page, '#content'), 'content is shown (not stuck on loading or not-found)');
  ok(!(await vis(page, '#notfound')), 'not-found state is hidden for a real slug');
  ok((await text(page, '#top-name-bn')) === 'ডেঙ্গু জ্বর', 'Bengali name rendered correctly');
  ok((await text(page, '#top-name-en')) === 'Dengue', 'English name rendered correctly');
  ok((await page.title()).includes('ডেঙ্গু জ্বর') && (await page.title()).includes('Dengue'), `per-disease <title> set dynamically (got "${await page.title()}")`);
  const desc = await page.getAttribute('meta[name="description"]', 'content');
  ok(desc && desc.length > 50 && desc.includes('ডেঙ্গু'), 'per-disease meta description set dynamically');
  const canonical = await page.getAttribute('link[rel="canonical"]', 'href');
  ok(canonical === 'https://www.sondhan.org/diseases/dengue', `canonical set to the clean per-slug URL (got ${canonical})`);
  ok(errs.length === 0, 'no console errors ' + JSON.stringify(errs));
}

console.log('2. refresh on the direct URL still works (this is the whole point of the vercel.json rewrite)');
{ const { page, errs } = await open('/diseases/dengue');
  await page.reload(); await page.waitForTimeout(400);
  ok(await vis(page, '#content'), 'content still renders after a hard refresh');
  ok((await text(page, '#top-name-bn')) === 'ডেঙ্গু জ্বর', 'correct disease still shown after refresh');
  ok(errs.length === 0, 'no console errors after refresh ' + JSON.stringify(errs));
}

console.log('3. table of contents, article sections, and the emergency banner are all populated');
{ const { page } = await open('/diseases/dengue');
  const tocLinks = await page.$$eval('#toc-list a', n => n.map(e => e.getAttribute('href')));
  ok(tocLinks.length === 11, `table of contents lists all 11 sections (got ${tocLinks.length})`);
  ok(tocLinks[0] === '#what' && tocLinks.includes('#sources'), 'TOC links point to real section anchors');
  const emgText = await text(page, '#emg-top-text');
  ok(emgText && emgText.includes('হাসপাতালে যান'), 'emergency banner shows the real emergency guidance up top');
  const symptomCount = await page.$$eval('#symptoms li', n => n.length);
  ok(symptomCount >= 3, `symptoms section renders a real bulleted list (got ${symptomCount} items)`);
  // চিকিৎসক-পর্যালোচনা বাকি — কখনো "পর্যালোচিত/অনুমোদিত" দাবি করা হয়নি
  ok((await text(page, '.review-badge')).includes('চিকিৎসক-পর্যালোচনা বাকি'), 'unreviewed-content badge is shown honestly, never claims clinician approval');
  const sourcesText = await text(page, '#sources');
  ok(sourcesText.includes('WHO') && sourcesText.includes('DGHS'), 'sources section lists the real cited references');
}

console.log('4. TOC is a native collapsible <details> ("এই পৃষ্ঠায় যা আছে")');
{ const { page } = await open('/diseases/dengue');
  const openBefore = await page.evaluate(() => document.querySelector('details.toc').open);
  await page.click('details.toc summary'); await page.waitForTimeout(100);
  const openAfter = await page.evaluate(() => document.querySelector('details.toc').open);
  ok(openBefore !== openAfter, 'clicking the summary toggles the collapsible TOC');
}

console.log('5. related test-prices deep link is present for a disease with a genuinely matching test');
{ const { page } = await open('/diseases/dengue');
  const href = await page.getAttribute('#tests .related-link', 'href');
  ok(href === '/test-prices?q=Dengue', `dengue links to its real matching test in the price directory (got ${href})`);
}

console.log('6. unknown/mistyped slug shows a clear not-found state, not a blank page or crash');
{ const { page, errs } = await open('/diseases/not-a-real-disease-xyz');
  ok(await vis(page, '#notfound'), 'not-found state is shown');
  ok(!(await vis(page, '#content')), 'content area stays hidden');
  ok(!(await vis(page, '#loading')), 'loading state is cleared, not stuck');
  ok((await page.title()).includes('পাওয়া যায়নি'), 'title reflects the not-found state');
  const backHref = await page.getAttribute('#notfound a.btn', 'href');
  ok(backHref === '/diseases', 'a clear link back to the library is offered');
  ok(errs.length === 0, 'no console errors on an unknown slug ' + JSON.stringify(errs));
}

console.log('7. back-to-library link preserves the search/filter context passed in the URL');
{ const { page } = await open('/diseases/dengue?q=%E0%A6%A1%E0%A7%87%E0%A6%99%E0%A7%8D%E0%A6%97%E0%A7%81&cat=infectious');
  const backHref = await page.getAttribute('#back-lib-link', 'href');
  ok(backHref === '/diseases?q=%E0%A6%A1%E0%A7%87%E0%A6%99%E0%A7%8D%E0%A6%97%E0%A7%81&cat=infectious', `back-to-library link carries the original query string (got ${backHref})`);
  const headerBackHref = await page.getAttribute('#header-back', 'href');
  ok(headerBackHref === backHref, 'header back arrow uses the same preserved link');
}

console.log('8. end-to-end: filtering the library, opening a card, and the back link round-trips correctly');
{ const { page } = await open('/diseases');
  await page.click('[data-cat="mental"]'); await page.waitForTimeout(150);
  const href = await page.getAttribute('.dz-card', 'href');
  ok(href === '/diseases/depression?cat=mental', `card link carries the active category filter (got ${href})`);
  await page.goto('http://localhost:8099' + href); await page.waitForTimeout(400);
  ok((await text(page, '#top-name-bn')) === 'বিষণ্নতা', 'navigating the card link opens the correct disease');
  const backHref = await page.getAttribute('#back-lib-link', 'href');
  ok(backHref === '/diseases?cat=mental', 'back-to-library link restores the exact filter the user came from');
}

console.log('9. mobile viewport: no horizontal scrolling');
{ const { page } = await open('/diseases/obesity', { width: 360, height: 740 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(overflow <= 1, `no horizontal overflow on a narrow 360px phone (got ${overflow}px)`);
}

console.log(`\n${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
