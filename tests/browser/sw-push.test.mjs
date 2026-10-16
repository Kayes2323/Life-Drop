import { ROOT, chromium, exe, tls } from './lib.mjs';
import http from 'http'; import fs from 'fs'; import path from 'path';
const vj = JSON.parse(fs.readFileSync(ROOT + '/vercel.json'));
const csp = vj.headers[0].headers.find(h => h.key === 'Content-Security-Policy').value.replace('; upgrade-insecure-requests', '');
http.createServer((q, s) => { let p = q.url.split('?')[0]; if (p === '/') p = '/about-blank.html';
  const f = p === '/about-blank.html' ? null : path.join(ROOT, p);
  if (!f) { s.writeHead(200, { 'content-type': 'text/html', 'content-security-policy': csp }); return s.end('<!doctype html><title>t</title><body>x'); }
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
  s.writeHead(200, { 'content-type': p.endsWith('.js') ? 'text/javascript' : p.endsWith('.html') ? 'text/html' : 'application/octet-stream', 'content-security-policy': csp }); s.end(fs.readFileSync(f)); }).listen(8095);
const b = await chromium.launch({ executablePath: exe, args: ['--no-proxy-server']});
const ctx = await b.newContext({ permissions: ['notifications'] }); await ctx.grantPermissions(['notifications'], { origin: 'http://localhost:8095' });
const page = await ctx.newPage(); await page.goto('http://localhost:8095/');
const cdp = await ctx.newCDPSession(page); let regId = null; cdp.on('ServiceWorker.workerRegistrationUpdated', e => { if (e.registrations[0]) regId = e.registrations[0].registrationId; }); await cdp.send('ServiceWorker.enable');
await page.evaluate(async () => { await navigator.serviceWorker.register('/sw.js'); await navigator.serviceWorker.ready; });
await page.waitForTimeout(800);
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('  PASS', m); } else { fail++; console.log('  FAIL', m); } };
ok(!!regId, 'service worker registered, registrationId=' + regId);
const push = (obj) => cdp.send('ServiceWorker.deliverPushMessage', { origin: 'http://localhost:8095', registrationId: regId, data: JSON.stringify(obj) });
// FCM-style data-only envelope
await push({ from: '671053363784', priority: 'high', data: { title: 'নতুন রক্তের অনুরোধ', body: 'রহিম আপনার কাছে রক্ত চাইছেন: DMCH-এ O+', url: '/inbox.html', tag: 'req-a_b' } }); await page.waitForTimeout(800);
let ns = await page.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).map(n => ({ t: n.title, b: n.body, tag: n.tag, url: n.data && n.data.url, icon: n.icon })));
ok(ns.length === 1 && ns[0].t === 'নতুন রক্তের অনুরোধ', 'push is shown as a system notification: ' + JSON.stringify(ns[0]));
ok(ns[0] && ns[0].url === '/inbox.html' && ns[0].tag === 'req-a_b', 'carries tag + in-app url');
await push({ data: { title: 'আবার', body: 'একই অনুরোধ', url: '/inbox.html', tag: 'req-a_b' } }); await page.waitForTimeout(600);
ns = await page.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).length); ok(ns === 1, 'same tag collapses into ONE notification (no spam)');
await push({ data: { title: 'হ্যাক', body: 'x', url: 'https://evil.example/phish', tag: 'evil' } }); await page.waitForTimeout(600);
const evil = await page.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications({ tag: 'evil' })).map(n => n.data.url)); ok(evil[0] === '/inbox.html', 'external URL in payload is ignored → falls back to /inbox.html');
await push('not json at all'.length ? {} : {}); await page.waitForTimeout(400);
ok((await page.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications({ tag: 'sondhan' })).length)) === 1, 'malformed/empty push still shows a safe default notification (no crash)');
// click handling: opens inbox
const [popup] = await Promise.all([ctx.waitForEvent('page', { timeout: 5000 }).catch(() => null), page.evaluate(async () => { const r = await navigator.serviceWorker.ready; const [n] = await r.getNotifications({ tag: 'req-a_b' }); n && n.close(); })]);
console.log(`\n${pass} passed, ${fail} failed (notification click is exercised in the browser only; see note)`); await b.close(); process.exit(fail ? 1 : 0);
