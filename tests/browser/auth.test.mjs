// Exercises the real login.html / signup.html against the fake Firebase Auth + Firestore
// modules in fakefb.mjs (served in place of www.gstatic.com), under the real production CSP.
// No real Firebase project is touched; no real email/SMS is ever sent.
//
// Auth is intentionally simple on this site: Google sign-in, or email+password with no email
// verification step and no phone/OTP login (removed per product decision — see signup.html /
// login.html for the current, minimal flow).
import http from 'http'; import https from 'https'; import fs from 'fs'; import path from 'path';
import { stubs } from './fakefb.mjs';
import { ROOT, chromium, exe, tls } from './lib.mjs';
const vj = JSON.parse(fs.readFileSync(ROOT + '/vercel.json'));
const csp = vj.headers[0].headers.find(h => h.key === 'Content-Security-Policy').value.replace('; upgrade-insecure-requests', '');

https.createServer(tls, (q, s) => { const n = q.url.split('/').pop().split('?')[0];
  s.writeHead(200, { 'content-type': 'text/javascript', 'access-control-allow-origin': '*' }); s.end(stubs[n] || ''); }).listen(8444);

let events = [];
http.createServer((q, s) => {
  const p = q.url.split('?')[0];
  if (p === '/__test-event' && q.method === 'POST') {
    let body = ''; q.on('data', c => body += c); q.on('end', () => { try { events.push(JSON.parse(body)); } catch (_) {} s.writeHead(200); s.end('ok'); });
    return;
  }
  const f = path.join(ROOT, p); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
  const t = p.endsWith('.js') ? 'text/javascript' : p.endsWith('.css') ? 'text/css' : p.endsWith('.png') ? 'image/png' : p.endsWith('.json') ? 'application/json' : 'text/html';
  s.writeHead(200, { 'content-type': t, 'content-security-policy': csp }); s.end(fs.readFileSync(f));
}).listen(8095);

const b = await chromium.launch({ executablePath: exe, args: ['--host-resolver-rules=MAP www.gstatic.com 127.0.0.1:8444', '--ignore-certificate-errors', '--no-proxy-server'] });
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('  PASS', m); } else { fail++; console.log('  FAIL', m); } };

const open = async (url) => {
  const ctx = await b.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push('PAGEERR ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_|net::/.test(m.text())) errs.push(m.text()); });
  await page.goto('http://localhost:8095' + url); await page.waitForTimeout(500);
  return { ctx, page, errs };
};

console.log('1. signup.html — email registration creates the profile once and goes straight to index.html (no verification step)');
{
  events = [];
  const { page, errs } = await open('/signup.html');
  await page.fill('#name', 'Rahim Test');
  await page.fill('#email', 'rahim@example.com');
  await page.fill('#phone', '01712345678');
  await page.fill('#pass', 'secret123');
  await page.click('#e-btn');
  await page.waitForTimeout(700);
  ok(events.filter(e => e.type === 'sendEmailVerification').length === 0, 'sendEmailVerification is never called (email verification removed)');
  ok(events.filter(e => e.type === 'setDoc' && e.data.path.startsWith('users/')).length === 1, 'Firestore user profile was created exactly once (setDoc)');
  ok(page.url().endsWith('/index.html') || page.url().endsWith('/'), `redirected straight to index.html — got ${page.url()}`);
  ok(errs.length === 0, 'no console errors ' + JSON.stringify(errs));
}

console.log('2. signup.html — duplicate email shows a friendly Bangla error, does not redirect');
{
  const { page, errs } = await open('/signup.html');
  // Mutate the module's OWN default FA object in place (set on an existing Map) — replacing
  // globalThis.__fakeAuth wholesale would create a new object the already-imported module
  // functions never see, since they closed over the original object at import time.
  await page.evaluate(() => { globalThis.__fakeAuth.byEmail.set('karim@example.com', { uid: 'u-existing', email: 'karim@example.com', password: 'whatever', emailVerified: false, providerData: [{ providerId: 'password' }] }); });
  await page.fill('#name', 'Karim');
  await page.fill('#email', 'karim@example.com');
  await page.fill('#phone', '01712345679');
  await page.fill('#pass', 'secret123');
  await page.click('#e-btn');
  await page.waitForTimeout(400);
  ok(await page.isVisible('#err'), 'error box shown on failure');
  ok((await page.textContent('#err')).includes('আগেই একাউন্ট আছে'), 'specific "account already exists" Bangla message shown');
  ok(!page.url().endsWith('/index.html'), 'stayed on signup.html, no redirect on failure');
  ok(errs.length === 0, 'no console errors ' + JSON.stringify(errs));
}

console.log('3. login.html — only Google and email tabs exist (no phone tab)');
{
  const { page, errs } = await open('/login.html');
  ok(await page.isVisible('#t-google'), 'Google tab present');
  ok(await page.isVisible('#t-email'), 'email tab present');
  ok((await page.$('#t-phone')) === null, 'phone tab removed entirely');
  ok((await page.$('#recaptcha-container')) === null, 'no reCAPTCHA container left in the DOM');
  ok(errs.length === 0, 'no console errors ' + JSON.stringify(errs));
}

console.log('4. login.html — wrong password shows specific Bangla message, not a raw code');
{
  const { page, errs } = await open('/login.html');
  await page.evaluate(() => { globalThis.__fakeAuth.byEmail.set('exists@example.com', { uid: 'u1', email: 'exists@example.com', password: 'rightpass', emailVerified: true, providerData: [] }); });
  await page.click('#t-email');
  await page.fill('#email', 'exists@example.com');
  await page.fill('#pass', 'wrongpass');
  await page.click('#e-btn');
  await page.waitForTimeout(400);
  ok((await page.textContent('#err')).includes('ভুল'), 'wrong-password mapped to a Bangla "ভুল" message, not auth/invalid-credential verbatim');
  ok(errs.length === 0, 'no console errors ' + JSON.stringify(errs));
}

console.log('5. login.html — forgot-password shows the identical message whether or not the account exists (no account-existence leak)');
{
  const { page, errs } = await open('/login.html');
  await page.evaluate(() => { globalThis.__fakeAuth.byEmail.set('hasaccount@example.com', { uid: 'u2', email: 'hasaccount@example.com', password: 'x', emailVerified: true, providerData: [] }); });
  await page.click('#t-email');
  await page.fill('#email', 'hasaccount@example.com');
  await page.click('#forgot-link');
  await page.waitForTimeout(400);
  const msgExisting = await page.textContent('#fp-ok');
  ok(await page.isVisible('#fp-ok'), 'reset confirmation shown for an existing account');

  await page.fill('#email', 'doesnotexist@example.com');
  await page.click('#forgot-link');
  await page.waitForTimeout(400);
  const msgMissing = await page.textContent('#fp-ok');
  ok(msgMissing === msgExisting, 'identical message for a non-existent account (prevents email enumeration)');
  ok(errs.length === 0, 'no console errors ' + JSON.stringify(errs));
}

console.log('6. login.html — Google sign-in still works and redirects normally');
{
  const { page, errs } = await open('/login.html');
  await page.click('#g-btn');
  await page.waitForTimeout(500);
  const url = page.url();
  ok(url.endsWith('/index.html') || url.endsWith('/'), `Google sign-in redirected to index.html — got ${url}`);
  ok(errs.length === 0, 'no console errors ' + JSON.stringify(errs));
}

console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
