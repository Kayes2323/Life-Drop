import http from 'http'; import https from 'https'; import fs from 'fs'; import path from 'path';
import { stubs } from './fakefb.mjs';
import { ROOT, chromium, exe, tls } from './lib.mjs';
const vj = JSON.parse(fs.readFileSync(ROOT + '/vercel.json'));
const csp = vj.headers[0].headers.find(h => h.key === 'Content-Security-Policy').value.replace('; upgrade-insecure-requests', '');
let VAPID = false;
https.createServer(tls, (q, s) => { const n = q.url.split('/').pop().split('?')[0];
  s.writeHead(200, { 'content-type': 'text/javascript', 'access-control-allow-origin': '*' }); s.end(stubs[n] || ''); }).listen(8443);
http.createServer((q, s) => { let p = q.url.split('?')[0]; if (p === '/__vapid') { VAPID = q.url.includes('on'); return s.end('ok'); }
  if (p === '/api/notify') { s.writeHead(200, { 'content-type': 'application/json' }); return s.end('{"ok":true,"sent":0}'); }
  const f = path.join(ROOT, p); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
  let body = fs.readFileSync(f); if (p === '/notify.js' && VAPID) body = Buffer.from(body.toString().replace("export const VAPID_KEY = '';", "export const VAPID_KEY = 'TESTVAPID';"));
  const t = p.endsWith('.js') ? 'text/javascript' : p.endsWith('.css') ? 'text/css' : p.endsWith('.png') ? 'image/png' : p.endsWith('.json') ? 'application/json' : 'text/html';
  s.writeHead(200, { 'content-type': t, 'content-security-policy': csp }); s.end(body); }).listen(8094);
const b = await chromium.launch({ executablePath: exe, args: ['--host-resolver-rules=MAP www.gstatic.com 127.0.0.1:8443', '--ignore-certificate-errors', '--no-proxy-server'] });
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('  PASS', m); } else { fail++; console.log('  FAIL', m); } };

const NOW = Date.now();
const open = async (url) => { const ctx = await b.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 } }); const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push('PAGEERR ' + e.message)); const calls = []; await page.route('**/api/notify', r => { calls.push(JSON.parse(r.request().postData() || '{}')); r.fulfill({ json: { ok: true } }); });
  await page.goto('http://localhost:8094' + url); await page.waitForTimeout(1200); return { page, errs, calls }; };
console.log('INDEX BELL');
{ const { page, errs } = await open('/index.html');
  await page.evaluate((NOW) => { const F = window.__fake; for (const [id, st] of [['a', 'pending'], ['b', 'pending'], ['c', 'accepted']]) F.docs.set('donorRequests/s' + id + '_donorD', { donorId: 'donorD', seekerUid: 's' + id, seekerName: 'X', msg: 'm', status: st, createdAt: { __ts: NOW } }); window.__setUser({ uid: 'donorD', displayName: 'করিম রহমান' }); }, NOW);
  await page.waitForTimeout(800);
  ok(await page.evaluate(() => getComputedStyle(document.getElementById('bell-n')).display !== 'none'), 'badge visible'); ok((await page.textContent('#bell-n')) === '২', 'badge counts only PENDING (২ of 3)');
  ok((await page.getAttribute('#bell-link', 'href')) === 'inbox.html', 'bell links to inbox'); ok((await page.getAttribute('#bell-link', 'aria-label')).includes('২টি নতুন'), 'accessible label announces count');
  ok((await page.textContent('#auth-btn')).includes('করিম'), 'profile avatar/name still rendered next to bell');
  await page.evaluate(() => { for (const k of [...window.__fake.docs.keys()]) window.__fake.docs.delete(k); [...window.__fake.listeners].forEach(L => L.fire()); }); await page.waitForTimeout(500);
  ok(await page.evaluate(() => getComputedStyle(document.getElementById('bell-n')).display === 'none'), 'badge hides at zero'); 
  ok(errs.length === 0, 'no page errors ' + JSON.stringify(errs)); }
{ const { page, errs } = await open('/index.html'); await page.evaluate(() => { window.__fake.failListen = 'permission-denied'; window.__setUser({ uid: 'donorD', displayName: 'করিম' }); }); await page.waitForTimeout(700);
  ok((await page.textContent('#auth-btn')).includes('করিম') && !!(await page.$('#bell-link')), 'listener failure → home page unaffected, bell still links to inbox'); ok(errs.length === 0, 'no page errors'); }
{ const { page } = await open('/index.html'); ok(!(await page.$('#bell-link')), 'logged-out home shows no bell (unchanged login button)'); ok((await page.textContent('#auth-btn')).includes('লগইন'), 'login button intact'); }

console.log('SEARCH → SEND REQUEST');
{ const { page, errs, calls } = await open('/search.html');
  await page.evaluate(() => { window.__fake.docs.set('donors/donorD', { name: 'করিম', blood: 'O+' }); window.__setUser({ uid: 'seekerA', displayName: 'রহিম' }); }); await page.waitForTimeout(500);
  const fill = (n, p, m) => page.evaluate(([n, p, m]) => { document.getElementById('req-name').value = n; document.getElementById('req-phone').value = p; document.getElementById('req-msg').value = m; }, [n, p, m]);
  await page.evaluate(() => window.openReq('donorD', 'করিম', 'O+')); await fill('রহিম', '017-1111-1111', 'DMCH-এ O+ লাগবে, আজ রাতে');
  ok((await page.textContent('#req-modal')).includes('রাজি হলে তবেই'), 'modal tells seeker the phone is shared only on acceptance');
  await page.evaluate(() => window.submitReq()); await page.waitForTimeout(900);
  const r = await page.evaluate(() => ({ req: window.__fake.docs.get('donorRequests/seekerA_donorD'), phone: window.__fake.docs.get('donorRequests/seekerA_donorD/contact/phone'), user: window.__fake.docs.get('users/seekerA') }));
  ok(!!r.req && JSON.stringify(Object.keys(r.req).sort()) === JSON.stringify(['createdAt', 'donorId', 'msg', 'seekerName', 'seekerUid', 'status']), 'request has EXACTLY the rule-allowed keys ' + JSON.stringify(Object.keys(r.req || {})));
  ok(r.req && r.req.status === 'pending' && r.req.seekerUid === 'seekerA' && r.req.donorId === 'donorD', 'status=pending, ids correct, doc id = seekerUid_donorUid');
  ok(r.phone && r.phone.phone === '+8801711111111' && Object.keys(r.phone).length === 1, 'seeker phone stored ONLY in private sub-doc, normalised');
  ok(!!(r.user && r.user.lastDonorRequestAt), 'rate-limit stamp written in same batch'); ok(!JSON.stringify(r.req).includes('01711111111'), 'phone is NOT in the request doc itself');
  ok(calls.some(c => c.kind === 'new' && c.requestId === 'seekerA_donorD'), 'server push requested (kind=new)'); ok((await page.textContent('#toast')).includes('দাতা সাড়া দিলে'), 'success toast');
  // validation + self
  await page.evaluate(() => { window.__fake.docs.clear(); }); await fill('রহিম', '123', 'x'); await page.evaluate(() => window.submitReq()); await page.waitForTimeout(300); ok((await page.textContent('#toast')).includes('সঠিক মোবাইল'), 'bad phone rejected client-side');
  await page.evaluate(() => window.openReq('seekerA', 'নিজে', 'O+')); await fill('রহিম', '01711111111', 'x'); await page.evaluate(() => window.submitReq()); await page.waitForTimeout(300); ok((await page.textContent('#toast')).includes('নিজেকে'), 'cannot request yourself');
  // rules denial → explains WHY
  await page.evaluate((NOW) => { window.openReq('donorD', 'করিম', 'O+'); const F = window.__fake; F.docs.set('donorRequests/seekerA_donorD', { donorId: 'donorD', seekerUid: 'seekerA', seekerName: 'রহিম', msg: 'm', status: 'pending', createdAt: { __ts: NOW } }); F.failCommit = 'permission-denied'; }, NOW);
  await fill('রহিম', '01711111111', 'আবার'); await page.evaluate(() => window.submitReq()); await page.waitForTimeout(600); ok((await page.textContent('#toast')).includes('আগেই এই দাতাকে অনুরোধ পাঠিয়েছেন'), 'duplicate pending → clear message');
  await page.evaluate(() => { const d = window.__fake.docs.get('donorRequests/seekerA_donorD'); d.status = 'declined'; d.createdAt = { __ts: Date.now() - 3600e3 }; }); await page.evaluate(() => window.submitReq()); await page.waitForTimeout(600); ok((await page.textContent('#toast')).includes('২৪ ঘণ্টা'), 'recently answered → "after 24h" message');
  await page.evaluate(() => { window.__fake.docs.delete('donorRequests/seekerA_donorD'); }); await page.evaluate(() => window.submitReq()); await page.waitForTimeout(600); ok((await page.textContent('#toast')).includes('১০ সেকেন্ড'), 'rate limit → "try in 10s" message');
  ok(await page.evaluate(() => !document.getElementById('req-btn').disabled), 'button re-enabled after errors (never stuck)'); ok(errs.length === 0, 'no page errors ' + JSON.stringify(errs)); }
console.log(`\n${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
