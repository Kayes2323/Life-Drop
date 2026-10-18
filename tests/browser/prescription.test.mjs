// Browser smoke test for prescription.html/prescription.js — real sw.js-free static pages, fake Firebase modules
// (Firestore + Storage, both in-memory) served in place of www.gstatic.com. Exercises the actual
// DOM/JS, not just health-core.js's pure functions (those have their own node:test in tests/health/).
import http from 'http'; import https from 'https'; import fs from 'fs'; import os from 'os'; import path from 'path';
import { stubs } from './fakefb.mjs';
import { ROOT, chromium, exe, tls } from './lib.mjs';
const vj = JSON.parse(fs.readFileSync(ROOT + '/vercel.json'));
const csp = vj.headers[0].headers.find(h => h.key === 'Content-Security-Policy').value.replace('; upgrade-insecure-requests', '');

https.createServer(tls, (q, s) => { const n = q.url.split('/').pop().split('?')[0];
  s.writeHead(200, { 'content-type': 'text/javascript', 'access-control-allow-origin': '*' }); s.end(stubs[n] || ''); }).listen(8444);
http.createServer((q, s) => { const p = q.url.split('?')[0];
  const f = path.join(ROOT, p); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
  const t = p.endsWith('.js') ? 'text/javascript' : p.endsWith('.css') ? 'text/css' : p.endsWith('.png') ? 'image/png' : 'text/html';
  s.writeHead(200, { 'content-type': t, 'content-security-policy': csp }); s.end(fs.readFileSync(f)); }).listen(8096);

const b = await chromium.launch({ executablePath: exe, args: ['--host-resolver-rules=MAP www.gstatic.com 127.0.0.1:8444', '--ignore-certificate-errors', '--no-proxy-server'] });
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('  PASS', m); } else { fail++; console.log('  FAIL', m); } };

const open = async () => {
  const ctx = await b.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push('PAGEERR ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_|net::/.test(m.text())) errs.push(m.text()); });
  page.on('dialog', d => d.accept());
  await page.goto('http://localhost:8096/prescription.html'); await page.waitForTimeout(600);
  return { ctx, page, errs };
};
const vis = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); return !!e && !e.hidden && getComputedStyle(e).display !== 'none'; }, sel);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sondhan-health-'));
const jpg = path.join(tmp, 'photo.jpg'); fs.writeFileSync(jpg, Buffer.alloc(2000, 1));
const jpg2 = path.join(tmp, 'photo2.jpg'); fs.writeFileSync(jpg2, Buffer.alloc(2000, 2));
const big = path.join(tmp, 'huge.jpg'); fs.writeFileSync(big, Buffer.alloc(16 * 1024 * 1024, 3));
const exeFile = path.join(tmp, 'virus.exe'); fs.writeFileSync(exeFile, Buffer.alloc(100, 4));

console.log('1. logged out — no crash, auth-guard takes over');
{ const { page, errs } = await open();
  await page.waitForTimeout(400);
  ok(errs.length === 0, 'no console errors ' + JSON.stringify(errs));
}

console.log('2. logged in, empty state');
{ const { page, errs } = await open();
  await page.evaluate(() => { window.__fake.docs.clear(); window.__setUser({ uid: 'u1', displayName: 'Rahim' }); });
  await page.waitForTimeout(700);
  ok(await vis(page, '#state-empty'), 'empty state shown when no records');
  ok(!(await vis(page, '#state-loading')), 'loading spinner gone');
  ok(errs.length === 0, 'no console errors ' + JSON.stringify(errs));
}

console.log('3. client-side validation rejects bad file / oversized file');
{ const { page } = await open();
  await page.evaluate(() => window.__setUser({ uid: 'u1', displayName: 'Rahim' })); await page.waitForTimeout(500);
  await page.click('#add-btn'); await page.waitForTimeout(200);
  ok(await vis(page, '#add-modal'), 'add modal opens');
  await page.setInputFiles('#file-gallery', [exeFile]);
  await page.waitForTimeout(200);
  ok((await page.textContent('#toast')).includes('সমর্থিত'), 'unsupported type rejected with a human message');
  const n1 = await page.$$eval('.pp-item', n => n.length);
  ok(n1 === 0, 'rejected file not added to preview');
  await page.setInputFiles('#file-gallery', [big]);
  await page.waitForTimeout(200);
  ok((await page.textContent('#toast')).includes('MB'), 'oversized file rejected with size message');
}

console.log('4. create a multi-page record end-to-end (fake Storage + Firestore)');
{ const { page, errs } = await open();
  await page.evaluate(() => { window.__fake.docs.clear(); window.__fakeStorage.blobs.clear(); window.__fakeStorage.log.length = 0; window.__setUser({ uid: 'u1', displayName: 'Rahim' }); });
  await page.waitForTimeout(500);
  await page.click('#add-btn'); await page.waitForTimeout(150);
  await page.selectOption('#doc-category', 'lab');
  await page.fill('#doc-title', 'CBC রিপোর্ট');
  await page.fill('#doc-facility', 'ঢাকা মেডিকেল');
  await page.setInputFiles('#file-gallery', [jpg, jpg2]);
  await page.waitForTimeout(200);
  ok((await page.$$eval('.pp-item', n => n.length)) === 2, 'two pages staged for upload');
  await page.click('#save-record-btn'); await page.waitForTimeout(900);
  ok(!(await vis(page, '#add-modal')), 'modal closes after successful save');
  ok((await page.textContent('#toast')).includes('যোগ হয়েছে'), 'success toast shown');
  const stored = await page.evaluate(() => { const [id, d] = [...window.__fake.docs.entries()].find(([k]) => k.startsWith('healthRecords/')); return { id, d }; });
  ok(stored.d.ownerUid === 'u1', 'record owned by current user');
  ok(stored.d.category === 'lab' && stored.d.pageCount === 2 && stored.d.pages.length === 2, 'category + 2 pages stored correctly ' + JSON.stringify(stored.d));
  ok(await page.evaluate(() => window.__fakeStorage.blobs.size === 2), '2 files actually uploaded to (fake) Storage');
  ok(errs.length === 0, 'no console errors ' + JSON.stringify(errs));

  console.log('5. appears in the list, filter + search work');
  await page.waitForTimeout(400);
  ok((await page.$$eval('.rec-card', n => n.length)) === 1, 'record appears in the list');
  ok((await page.textContent('.rec-card')).includes('CBC রিপোর্ট'), 'title shown');
  await page.click('[data-filter="prescription"]'); await page.waitForTimeout(150);
  ok(await vis(page, '#state-no-match'), 'category filter hides non-matching record');
  await page.click('[data-filter="all"]'); await page.fill('#search-inp', 'ঢাকা মেডিকেল'); await page.waitForTimeout(150);
  ok((await page.$$eval('.rec-card', n => n.length)) === 1, 'search by facility name finds the record');
  await page.fill('#search-inp', ''); await page.waitForTimeout(150);

  console.log('6. viewer opens, shows first page, navigation works');
  await page.click('.rec-card'); await page.waitForTimeout(400);
  ok(await vis(page, '#viewer'), 'viewer opens');
  ok((await page.textContent('#v-title')).includes('CBC'), 'viewer title matches record');
  ok((await page.getAttribute('#v-prev', 'disabled')) !== null, 'prev disabled on first page');
  ok((await page.getAttribute('#v-next', 'disabled')) === null, 'next enabled (2 pages)');
  await page.click('#v-next'); await page.waitForTimeout(400);
  ok((await page.getAttribute('#v-next', 'disabled')) !== null, 'next disabled on last page');
  await page.click('#v-quick'); await page.waitForTimeout(300);
  ok((await page.$$eval('.v-quick-page', n => n.length)) === 2, 'quick-view shows all pages without animation');
  await page.click('#viewer-close'); await page.waitForTimeout(200);
  ok(!(await vis(page, '#viewer')), 'viewer closes');

  console.log('7. delete removes both Storage files and the Firestore doc');
  await page.click('[data-del]'); await page.waitForTimeout(500);
  ok((await page.$$eval('.rec-card', n => n.length)) === 0, 'record removed from list');
  ok(await page.evaluate(() => window.__fakeStorage.blobs.size === 0), 'both files deleted from (fake) Storage');
  ok(await page.evaluate(() => [...window.__fake.docs.keys()].filter(k => k.startsWith('healthRecords/')).length === 0), 'Firestore doc deleted');
  ok(await vis(page, '#state-empty'), 'back to empty state');
}

console.log(`\n${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
