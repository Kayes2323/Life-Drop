// Exercises the real login.html / signup.html / verify-email.html against the fake Firebase
// Auth + Firestore modules in fakefb.mjs (served in place of www.gstatic.com), under the real
// production CSP. No real Firebase project is touched; no real email/SMS is ever sent.
//
// NOTE on navigation: window.location.replace(...) (used after a successful signup/login) fully
// unloads the page's JS globals, so in-page state (globalThis.__fakeAuth / globalThis.__fake)
// cannot be read afterwards with page.evaluate(). fakefb.mjs's stubs additionally report the
// events we need to assert on (sendEmailVerification, setDoc, applyActionCode) to this test
// server's own same-origin /__test-event endpoint, which DOES survive navigation (it lives in
// this Node process, not the page). Assertions that stay on one page still just use page.evaluate.
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

console.log('1. signup.html — email registration creates the profile once, sends exactly one verification email, and redirects to verify-email.html (not index.html)');
{
  events = [];
  const { page, errs } = await open('/signup.html');
  await page.fill('#name', 'Rahim Test');
  await page.fill('#email', 'rahim@example.com');
  await page.fill('#phone', '01712345678');
  await page.fill('#pass', 'secret123');
  await page.click('#e-btn');
  await page.waitForTimeout(700);
  ok(events.filter(e => e.type === 'sendEmailVerification').length === 1, 'sendEmailVerification was called exactly once');
  ok(events.filter(e => e.type === 'setDoc' && e.data.path.startsWith('users/')).length === 1, 'Firestore user profile was created exactly once (setDoc)');
  ok(page.url().endsWith('/verify-email.html'), `redirected to verify-email.html, not index.html (race-condition regression guard) — got ${page.url()}`);
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
  ok(!page.url().endsWith('/verify-email.html') && !page.url().endsWith('/index.html'), 'stayed on signup.html, no redirect on failure');
  ok(errs.length === 0, 'no console errors ' + JSON.stringify(errs));
}

console.log('3. login.html — wrong password shows specific Bangla message, not a raw code');
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

console.log('3b. login.html — forgot-password shows the identical message whether or not the account exists (no account-existence leak)');
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
  ok(msgMissing === msgExisting, 'identical message for a non-existent account (prevents email enumeration, brief Phase 5)');
  ok(errs.length === 0, 'no console errors ' + JSON.stringify(errs));
}

console.log('4. login.html — Google sign-in still works and redirects normally');
{
  const { page, errs } = await open('/login.html');
  await page.click('#g-btn');
  await page.waitForTimeout(500);
  const url = page.url();
  ok(url.endsWith('/index.html') || url.endsWith('/'), `Google sign-in redirected to index.html — got ${url}`);
  ok(errs.length === 0, 'no console errors ' + JSON.stringify(errs));
}

console.log('5. login.html — phone OTP: invalid code shows a specific message (not a raw error)');
{
  const { page, errs } = await open('/login.html');
  await page.click('#t-phone');
  await page.waitForTimeout(300);
  await page.fill('#phone-num', '01712345678');
  await page.click('#otp-send-btn');
  await page.waitForTimeout(500);
  ok(await page.isVisible('#phone-step2'), 'moved to OTP-entry step after send');
  await page.fill('#otp-code', '000000'); // fake's correct code is 123456
  await page.click('#otp-verify-btn');
  await page.waitForTimeout(400);
  ok((await page.textContent('#err')).includes('ভুল'), 'wrong OTP shows a specific "ভুল" message');

  console.log('5b. correct OTP verifies and creates a phone-user profile exactly once');
  events = [];
  await page.fill('#otp-code', '123456');
  await page.click('#otp-verify-btn');
  await page.waitForTimeout(500);
  ok(events.some(e => e.type === 'setDoc' && e.data.path.startsWith('users/phone-')), 'phone user profile created on first successful OTP verify');
  ok(errs.length === 0, 'no console errors ' + JSON.stringify(errs));
}

console.log('6. login.html — phone OTP resend cooldown blocks an immediate second send');
{
  const { page, errs } = await open('/login.html');
  await page.click('#t-phone');
  await page.waitForTimeout(300);
  await page.fill('#phone-num', '01799999999');
  await page.click('#otp-send-btn');
  await page.waitForTimeout(400);
  ok(await page.isVisible('#phone-step2'), 'first OTP send succeeds');
  // Simulate "retry" (back to step 1) and immediately try to resend — should be cooldown-blocked.
  await page.evaluate(() => window.switchTab('phone'));
  await page.waitForTimeout(100);
  await page.fill('#phone-num', '01799999999');
  await page.click('#otp-send-btn');
  await page.waitForTimeout(300);
  ok(!(await page.isVisible('#phone-step2')), 'cooldown prevented a second OTP request (still on step 1, no duplicate concurrent request)');
  ok((await page.textContent('#err')).includes('সেকেন্ড'), 'cooldown message shown with remaining seconds');
  ok(errs.length === 0, 'no console errors ' + JSON.stringify(errs));
}

console.log('7. login.html — previously existing user profile is never overwritten on repeat phone login (brief 2.9)');
{
  const { page, errs } = await open('/login.html');
  await page.evaluate(() => { globalThis.__fake.docs.set('users/phone-+8801712345678', { uid: 'phone-+8801712345678', name: 'Existing Donor', isDonor: true, donations: 7 }); });
  events = [];
  await page.click('#t-phone');
  await page.waitForTimeout(300);
  await page.fill('#phone-num', '01712345678');
  await page.click('#otp-send-btn');
  await page.waitForTimeout(500);
  await page.fill('#otp-code', '123456');
  await page.click('#otp-verify-btn');
  await page.waitForTimeout(500);
  const overwritten = events.some(e => e.type === 'setDoc' && e.data.path === 'users/phone-+8801712345678');
  ok(!overwritten, 'no setDoc issued for an existing profile (brief 2.9) — existing donor data left untouched');
  ok(errs.length === 0, 'no console errors ' + JSON.stringify(errs));
}

console.log('8. verify-email.html — waiting screen shows the signed-in user\'s email, with resend + cooldown + refresh');
{
  const { page, errs } = await open('/verify-email.html');
  await page.evaluate(() => { globalThis.__fakeAuth.byUid.set('u9', { uid: 'u9', email: 'waiting@example.com', emailVerified: false, providerData: [{ providerId: 'password' }] }); globalThis.__setUser({ uid: 'u9', email: 'waiting@example.com', emailVerified: false }); });
  await page.waitForTimeout(400);
  ok(await page.isVisible('#state-waiting'), 'waiting state shown for a signed-in, unverified user');
  ok((await page.textContent('#email-chip')) === 'waiting@example.com', 'shows the actual account email');
  await page.click('#resend-btn');
  await page.waitForTimeout(400);
  ok(await page.isVisible('#ok'), 'resend shows a success confirmation');
  const disabledAfterResend = await page.$eval('#resend-btn', el => el.disabled);
  ok(disabledAfterResend, 'resend button disabled immediately after sending (cooldown)');

  console.log('8b. refresh (check verification status) reflects actual emailVerified, not a client-only guess');
  await page.evaluate(() => { globalThis.__fakeAuth.byUid.get('u9').emailVerified = true; });
  await page.click('#refresh-btn');
  await page.waitForTimeout(400);
  ok(await page.isVisible('#state-already'), 'refresh picked up the real emailVerified flag via reload()');
  ok(errs.length === 0, 'no console errors ' + JSON.stringify(errs));
}

console.log('9. verify-email.html — clicking a valid verification link marks the account verified');
{
  // The ?mode=verifyEmail handler runs synchronously as soon as the module loads, so the oobCode
  // must already exist in the fake auth store BEFORE the page's own scripts run. addInitScript
  // runs ahead of any page script on every navigation in this context — it pre-populates
  // globalThis.__fakeAuth itself, so the firebase-auth.js stub picks up OUR object as its FA
  // (no wholesale-replace-after-import race, and no chicken-and-egg timing problem).
  const ctx = await b.newContext({ ignoreHTTPSErrors: true });
  await ctx.addInitScript(() => {
    globalThis.__fakeAuth = { byUid: new Map([['u10', { uid: 'u10', email: 'linkcheck@example.com', emailVerified: false, providerData: [{ providerId: 'password' }] }]]), byEmail: new Map(), oobToUid: new Map([['TESTOOB1', 'u10']]), usedOob: new Set(), lastOobByUid: new Map(), sentVerifications: [], nextUid: 1 };
  });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push('PAGEERR ' + e.message));
  await page.goto('http://localhost:8095/verify-email.html?mode=verifyEmail&oobCode=TESTOOB1');
  await page.waitForTimeout(500);
  ok(await page.isVisible('#state-verified'), 'valid oobCode -> verified success screen');
  const verifiedNow = await page.evaluate(() => globalThis.__fakeAuth.byUid.get('u10').emailVerified === true);
  ok(verifiedNow, 'applyActionCode actually flipped emailVerified server-side (not just UI state)');
  ok(errs.length === 0, 'no console errors ' + JSON.stringify(errs));
}

console.log('10. verify-email.html — an already-used/invalid link shows a clear error, not a crash');
{
  const { page, errs } = await open('/verify-email.html?mode=verifyEmail&oobCode=totally-bogus-code');
  await page.waitForTimeout(400);
  ok(await page.isVisible('#state-link-error'), 'invalid oobCode shows the link-error state');
  ok((await page.textContent('#link-error-sub')).length > 0, 'a human-readable explanation is shown');
  ok(errs.length === 0, 'no console errors, no raw stack trace shown ' + JSON.stringify(errs));
}

console.log('11. verify-email.html — signed-out visitor is not trapped, sees a sign-in prompt');
{
  const { page, errs } = await open('/verify-email.html');
  await page.waitForTimeout(400);
  ok(await page.isVisible('#state-signed-out'), 'signed-out visitor sees the sign-in prompt, not an infinite spinner');
  ok(errs.length === 0, 'no console errors ' + JSON.stringify(errs));
}

console.log('12. verify-email.html — "skip for now" never traps the user in a redirect loop');
{
  const { page, errs } = await open('/verify-email.html');
  await page.evaluate(() => { globalThis.__fakeAuth.byUid.set('u11', { uid: 'u11', email: 'skip@example.com', emailVerified: false, providerData: [{ providerId: 'password' }] }); globalThis.__setUser({ uid: 'u11', email: 'skip@example.com', emailVerified: false }); });
  await page.waitForTimeout(400);
  await page.click('#skip-btn');
  await page.waitForTimeout(400);
  ok(page.url().endsWith('/index.html') || page.url().endsWith('/'), `skip takes the user to the app (index.html), not stuck — got ${page.url()}`);
  ok(errs.length === 0, 'no console errors ' + JSON.stringify(errs));
}

console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
