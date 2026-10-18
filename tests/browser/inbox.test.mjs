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
  // notify.js-এর আসল VAPID_KEY যা-ই থাকুক (production-এ এখন একটা real key বসানো আছে), টেস্ট
  // নিজের মতো কন্ট্রোল করে — তাই এই সুইট production-এর VAPID অবস্থার উপর নির্ভর করে না।
  let body = fs.readFileSync(f);
  if (p === '/notify.js') body = Buffer.from(body.toString().replace(/export const VAPID_KEY = '[^']*';/, `export const VAPID_KEY = '${VAPID ? 'TESTVAPID' : ''}';`));
  const t = p.endsWith('.js') ? 'text/javascript' : p.endsWith('.css') ? 'text/css' : p.endsWith('.png') ? 'image/png' : p.endsWith('.json') ? 'application/json' : 'text/html';
  s.writeHead(200, { 'content-type': t, 'content-security-policy': csp }); s.end(body); }).listen(8094);
const b = await chromium.launch({ executablePath: exe, args: ['--host-resolver-rules=MAP www.gstatic.com 127.0.0.1:8443', '--ignore-certificate-errors', '--no-proxy-server'] });
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('  PASS', m); } else { fail++; console.log('  FAIL', m); } };
const NOW = Date.now();
const seed = (page) => page.evaluate((NOW) => { const F = window.__fake; F.docs.clear();
  const R = (id, o) => F.docs.set('donorRequests/' + id, { donorId: 'donorD', seekerUid: id.split('_')[0], seekerName: 'X', msg: 'm', status: 'pending', createdAt: { __ts: NOW - 1e6 }, ...o });
  R('seekerA_donorD', { seekerName: 'রহিম', msg: 'DMCH-এ O+ লাগবে, আজ রাতে', createdAt: { __ts: NOW - 3600e3 } });
  R('seekerB_donorD', { seekerName: '<img src=x onerror=window.__xss=1>', msg: '<script>window.__xss=2</script>', createdAt: { __ts: NOW - 60e3 } });
  R('seekerC_donorD', { seekerName: 'সুমি', status: 'declined', createdAt: { __ts: NOW - 86400e3 * 3 } });
  F.docs.set('donorRequests/seekerA_donorD/contact/phone', { phone: '+8801711111111' });
  F.docs.set('donorRequests/seekerA_donorF', { donorId: 'donorF', seekerUid: 'seekerA', seekerName: 'রহিম', msg: 'অন্যজন', status: 'pending', createdAt: { __ts: NOW - 5e5 } });
  F.docs.set('donors/donorD', { name: 'করিম', photo: '' }); F.docs.set('donors/donorF', { name: 'ফারুক', photo: '' });
  F.docs.set('donorsPrivate/donorD', { phone: '01722222222', wa: '01722222222', facebook: 'https://facebook.com/karim' }); F.log.length = 0; }, NOW);
const open = async (ctxOpts = {}, url = '/inbox.html', init) => { const ctx = await b.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 }, ...ctxOpts });
  if (init) await ctx.addInitScript(init); const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push('PAGEERR ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_|net::/.test(m.text())) errs.push(m.text()); });
  const calls = []; await page.route('**/api/notify', r => { calls.push(JSON.parse(r.request().postData() || '{}')); r.fulfill({ json: { ok: true, sent: 1 } }); });
  await page.goto('http://localhost:8094' + url); await page.waitForTimeout(700); return { ctx, page, errs, calls }; };
const vis = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); return !!e && !e.hidden && getComputedStyle(e).display !== 'none'; }, sel);

console.log('1. logged out');
{ const { page, errs } = await open(); ok(await vis(page, '#state-login'), 'login prompt visible'); ok(!(await vis(page, '#state-loading')), 'no endless spinner'); ok(await vis(page, '#login-btn'), 'login button present'); ok(errs.length === 0, 'no console errors ' + JSON.stringify(errs)); }

console.log('2-6. donor inbox (received)');
{ const { page, errs, calls } = await open(); await seed(page); await page.evaluate(() => window.__setUser({ uid: 'donorD', displayName: 'করিম' })); await page.waitForTimeout(800);
  ok(await vis(page, '#list-recv'), 'received list visible'); const cards = await page.$$eval('#list-recv .card', n => n.map(c => c.querySelector('b').textContent));
  ok(cards.length === 3, '3 cards'); ok(cards[0].startsWith('<img'), 'newest first; hostile name shown as TEXT'); ok(!(await page.evaluate(() => window.__xss)), 'XSS did not execute');
  ok((await page.$$('#list-recv .card img[src="x"]')).length === 0, 'no injected <img>');
  ok((await page.textContent('#n-recv')) === '২', 'badge shows ২ pending'); ok((await page.title()).startsWith('(২)'), 'title carries count');
  await page.click('.card[data-id="seekerA_donorD"] [data-a=accept]'); await page.waitForTimeout(600);
  ok(await page.evaluate(() => window.__fake.log.some(l => l[0] === 'update' && l[1] === 'donorRequests/seekerA_donorD' && l[2] === 'status,respondedAt')), 'accept writes ONLY status+respondedAt (matches rules)');
  ok((await page.textContent('.card[data-id="seekerA_donorD"] .chip')).includes('আপনি রাজি'), 'chip shows accepted'); ok(calls.some(c => c.kind === 'response' && c.requestId === 'seekerA_donorD'), 'server push requested (kind=response)');
  await page.click('.card[data-id="seekerA_donorD"] [data-a=seeker-contact]'); await page.waitForTimeout(400);
  ok((await page.getAttribute('.card[data-id="seekerA_donorD"] a.call', 'href')) === 'tel:+8801711111111', 'seeker phone revealed after accept (tel:)'); ok(!!(await page.$('.card[data-id="seekerA_donorD"] a.wa')), 'WhatsApp button');
  await page.evaluate((NOW) => window.__fake.docs.set('donorRequests/seekerZ_donorD', { donorId: 'donorD', seekerUid: 'seekerZ', seekerName: 'নতুন সিকার', msg: 'জরুরি', status: 'pending', createdAt: { __ts: NOW } }) && [...window.__fake.listeners].forEach(L => L.fire()), NOW); await page.waitForTimeout(600);
  ok((await page.textContent('#toast')).includes('নতুন রক্তের অনুরোধ'), 'live toast when a new request arrives'); ok((await page.textContent('#n-recv')) === '২', 'badge updated live');
  await page.click('.card[data-id="seekerB_donorD"] [data-a=decline]'); await page.waitForTimeout(500);
  ok((await page.textContent('.card[data-id="seekerB_donorD"] .chip')).includes('অপারগ'), 'decline works'); ok(errs.length === 0, 'no console errors ' + JSON.stringify(errs));
  
  console.log('7. same page as seeker (sent tab)');
  await page.evaluate(() => window.__setUser({ uid: 'seekerA', displayName: 'রহিম' })); await page.waitForTimeout(700); await page.click('#tab-sent'); await page.waitForTimeout(400);
  const sent = await page.$$eval('#list-sent .card', n => n.map(c => [c.querySelector('b').textContent, c.querySelector('.chip').textContent]));
  ok(sent.some(s => s[0] === 'করিম' && s[1] === 'রাজি হয়েছেন') && sent.some(s => s[0] === 'ফারুক' && s[1] === 'অপেক্ষায়'), 'sent list shows donor names + statuses ' + JSON.stringify(sent));
  await page.click('#list-sent .card[data-donor=donorD] [data-a=donor-contact]'); await page.waitForTimeout(400);
  ok((await page.getAttribute('#list-sent .card[data-donor=donorD] a.call', 'href')) === 'tel:+8801722222222', "donor contact shown after acceptance");
  await page.click('#list-sent .card[data-donor=donorF] [data-a=cancel]'); await page.waitForTimeout(500);
  ok(await page.evaluate(() => window.__fake.log.some(l => l[0] === 'update' && l[1] === 'donorRequests/seekerA_donorF' && l[2] === 'status')), 'cancel writes ONLY status (matches rules)');
   }

console.log('8. permission-denied / outage');
{ const { page } = await open(); await page.evaluate(() => { window.__fake.failListen = 'permission-denied'; window.__setUser({ uid: 'donorD' }); }); await page.waitForTimeout(600);
  ok(await vis(page, '#state-error'), 'friendly error state (not blank)'); ok((await page.textContent('#error-msg')).includes('কিছুক্ষণ পরে'), 'message is human'); ok(!(await vis(page, '#state-loading')), 'spinner gone'); }
console.log('9. listener never answers → timeout');
{ const { page } = await open(); await page.evaluate(() => { window.__fake.hangListen = true; window.__setUser({ uid: 'donorD' }); });
  await page.waitForSelector('#state-error:not([hidden])', { timeout: 16000 }); ok(true, 'spinner becomes error after ≤12s (no infinite loading)'); }

console.log('10. push card per environment');
{ const { page } = await open(); await page.evaluate(() => window.__setUser({ uid: 'donorD' })); await page.waitForTimeout(500); ok(!(await vis(page, '#push-card')), 'VAPID not configured → card hidden, inbox still works'); }
{ const { page } = await open({ userAgent: 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/430.0]' }); await page.evaluate(() => window.__setUser({ uid: 'donorD' })); await page.waitForTimeout(500);
  await page.request.get('http://localhost:8094/__vapid?on'); }
await (await fetch('http://localhost:8094/__vapid?on')).text();
{ const { page } = await open({ userAgent: 'Mozilla/5.0 (Linux; Android 13) Chrome/120 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/430.0]' }); await page.evaluate(() => window.__setUser({ uid: 'donorD' })); await page.waitForTimeout(500);
  ok((await page.textContent('#push-card')).includes('Chrome/Safari'), 'Facebook in-app browser → clear guidance'); }
{ const { page } = await open({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1' }); await page.evaluate(() => window.__setUser({ uid: 'donorD' })); await page.waitForTimeout(500);
  ok((await page.textContent('#push-card')).includes('Add to Home Screen'), 'iPhone Safari → "Add to Home Screen" guidance'); }
const permInit = () => { let perm = localStorage.getItem('test-perm') || 'default'; Object.defineProperty(Notification, 'permission', { get: () => perm, configurable: true }); Notification.requestPermission = async () => { perm = 'granted'; localStorage.setItem('test-perm', 'granted'); return 'granted'; }; };
{ const { ctx, page, errs } = await open({}, '/inbox.html', permInit); await page.evaluate(() => window.__setUser({ uid: 'donorD' })); await page.waitForTimeout(600);
  ok(await vis(page, '#push-on'), 'supported browser → "নোটিফিকেশন চালু করুন" button'); 
  await page.click('#push-on'); await page.waitForTimeout(1500);
  ok(await page.evaluate(() => JSON.stringify(window.__fake.docs.get('fcmTokens/donorD')?.tokens) === '["fcm-token-123"]'), 'device token saved to fcmTokens/<uid> (≤5, own doc)');
  ok((await page.textContent('#push-card')).includes('চালু আছে'), 'card switches to "on"'); 
  await page.click('#push-off'); await page.waitForTimeout(800); ok(await vis(page, '#push-on'), 'can switch off again');
  ok(errs.length === 0, 'no console errors ' + JSON.stringify(errs)); }

console.log(`\n${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
