// Browser test for ai.html / ai.js — the real pages under the real CSP, with fake Firebase
// (www.gstatic.com mapped to a local HTTPS server) and a stubbed /api/ai so no Gemini key
// and no network are needed. The point is the DOM/JS we actually ship — above all that a
// model reply is rendered SAFELY (it is untrusted text, never raw HTML).
import http from 'http'; import https from 'https'; import fs from 'fs'; import path from 'path';
import { stubs } from './fakefb.mjs';
import { ROOT, chromium, exe, tls } from './lib.mjs';
const vj = JSON.parse(fs.readFileSync(ROOT + '/vercel.json'));
const csp = vj.headers[0].headers.find(h => h.key === 'Content-Security-Policy').value.replace('; upgrade-insecure-requests', '');

https.createServer(tls, (q, s) => { const n = q.url.split('/').pop().split('?')[0];
  s.writeHead(200, { 'content-type': 'text/javascript', 'access-control-allow-origin': '*' }); s.end(stubs[n] || ''); }).listen(8446);

// /api/ai-র স্টাব — পরের উত্তরটা টেস্ট নিজেই ঠিক করে দেয়
let NEXT = { status: 200, body: { ok: true, text: 'ঠিক আছে।', toolsUsed: [] } };
const SEEN = [];
const readBody = q => new Promise(res => { const cs = []; q.on('data', c => cs.push(c)); q.on('end', () => res(Buffer.concat(cs))); });

http.createServer(async (q, s) => {
  const p = q.url.split('?')[0];
  if (p === '/api/ai' && q.method === 'POST') {
    SEEN.push({ auth: q.headers.authorization || '', body: JSON.parse((await readBody(q)).toString() || '{}') });
    s.writeHead(NEXT.status, { 'content-type': 'application/json' });
    return s.end(JSON.stringify(NEXT.body));
  }
  const f = path.join(ROOT, p); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
  const t = p.endsWith('.js') ? 'text/javascript' : p.endsWith('.css') ? 'text/css' : p.endsWith('.png') ? 'image/png' : 'text/html';
  s.writeHead(200, { 'content-type': t, 'content-security-policy': csp }); s.end(fs.readFileSync(f));
}).listen(8098);

const b = await chromium.launch({ executablePath: exe, args: ['--host-resolver-rules=MAP www.gstatic.com 127.0.0.1:8446', '--ignore-certificate-errors', '--no-proxy-server'] });
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('  PASS', m); } else { fail++; console.log('  FAIL', m); } };

const open = async () => {
  const ctx = await b.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push('PAGEERR ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_|net::/.test(m.text())) errs.push(m.text()); });
  await page.goto('http://localhost:8098/ai.html'); await page.waitForTimeout(500);
  return { ctx, page, errs };
};
const login = (page, uid = 'u1') => page.evaluate(u => globalThis.__setUser({ uid: u, displayName: 'T', email: 't@t.com' }), uid);
const ask = async (page, text) => {
  await page.fill('#input', text);
  await page.click('#send');
  await page.waitForTimeout(350);
};

// ── ১. লগইন গেট ───────────────────────────────────────────────
{
  const { ctx, page, errs } = await open();
  ok(await page.isVisible('#gate'), 'logged out: login gate is shown');
  ok(!(await page.isVisible('#composer-wrap')), 'logged out: composer is hidden');
  await login(page); await page.waitForTimeout(300);
  ok(!(await page.isVisible('#gate')), 'after login: gate goes away');
  ok(await page.isVisible('#composer-wrap'), 'after login: composer appears');
  ok((await page.$$('.sugg-btn')).length === 4, 'four suggested prompts are offered');
  ok(errs.length === 0, 'no page errors / CSP violations: ' + errs.join(' | '));
  await ctx.close();
}

// ── ২. বার্তা পাঠানো ও উত্তর দেখানো ───────────────────────────
{
  const { ctx, page, errs } = await open(); await login(page); await page.waitForTimeout(250);
  SEEN.length = 0;
  NEXT = { status: 200, body: { ok: true, text: 'TSH হলো থাইরয়েড পরীক্ষা।', toolsUsed: [] } };
  await ask(page, 'TSH কী?');
  ok((await page.textContent('.msg.user .bubble')) === 'TSH কী?', 'the question appears as a user bubble');
  ok(/থাইরয়েড/.test(await page.textContent('.msg.ai .ai-body')), 'the model reply is shown');
  ok(SEEN.length === 1 && SEEN[0].auth === 'Bearer u:u1', 'the Firebase ID token is sent to /api/ai');
  ok(SEEN[0].body.messages.at(-1).text === 'TSH কী?', 'the question is sent in the messages array');
  ok(await page.isVisible('#btn-new'), '"new chat" button appears once a chat starts');
  ok(errs.length === 0, 'no page errors: ' + errs.join(' | '));
  await ctx.close();
}

// ── ৩. নিরাপত্তা: মডেলের উত্তর কখনো কাঁচা HTML হিসেবে বসে না ──
{
  const { ctx, page, errs } = await open(); await login(page); await page.waitForTimeout(250);
  await page.evaluate(() => { window.__xss = false; });
  NEXT = { status: 200, body: { ok: true, toolsUsed: [], text:
    '<img src=x onerror="window.__xss=true">\n<script>window.__xss=true<\/script>\n' +
    '<a href="javascript:window.__xss=true">tap</a>\n[tap2](javascript:window.__xss=true)' } };
  await ask(page, 'test');
  await page.waitForTimeout(400);
  const body = await page.$('.msg.ai .ai-body');
  ok((await body.$$('img')).length === 0, 'XSS: no <img> element is created from model text');
  ok((await body.$$('script')).length === 0, 'XSS: no <script> element is created from model text');
  ok((await body.$$('a')).length === 0, 'XSS: a javascript: link never becomes an anchor');
  ok((await page.evaluate(() => window.__xss)) === false, 'XSS: no injected script ever executed');
  ok(/onerror/.test(await body.textContent()), 'the dangerous markup is shown as plain text instead');
  ok(errs.length === 0, 'no page errors: ' + errs.join(' | '));
  await ctx.close();
}

// ── ৪. মার্কডাউন ও উৎস-ব্যাজ ──────────────────────────────────
{
  const { ctx, page, errs } = await open(); await login(page); await page.waitForTimeout(250);
  NEXT = { status: 200, body: { ok: true, toolsUsed: ['searchMedicalTests'], text:
    '### CBC\n**১৫০ টাকা** — ঢাকা মেডিকেল\n- রক্তের উপাদান দেখা হয়\n- সরকারি মূল্য\n\n[উৎস](https://example.gov.bd/x)' } };
  await ask(page, 'CBC দাম?');
  const body = await page.$('.msg.ai .ai-body');
  ok((await body.$$('h3')).length === 1, 'markdown heading renders');
  ok((await body.$$('strong')).length === 1, 'markdown bold renders');
  ok((await body.$$('li')).length === 2, 'markdown list renders');
  const a = await body.$('a');
  ok(a && (await a.getAttribute('href')) === 'https://example.gov.bd/x', 'an https source link renders as a real link');
  ok((await a.getAttribute('rel')) === 'noopener noreferrer', 'outbound links carry rel=noopener');
  ok(await page.isVisible('.src-badge'), 'the "verified Sondhan data" badge shows when the tool was used');
  ok(errs.length === 0, 'no page errors: ' + errs.join(' | '));
  await ctx.close();
}

// ── ৫. ত্রুটি ও আবার চেষ্টা ────────────────────────────────────
{
  const { ctx, page, errs } = await open(); await login(page); await page.waitForTimeout(250);
  NEXT = { status: 429, body: { ok: false, reason: 'rate-limited' } };
  await ask(page, 'হাই');
  ok(await page.isVisible('.err-box'), 'a failed request shows an error box, never a dead page');
  ok(/বেশি অনুরোধ/.test(await page.textContent('.err-box')), 'the rate-limit error is explained in Bengali');

  NEXT = { status: 200, body: { ok: true, text: 'এইতো উত্তর।', toolsUsed: [] } };
  await page.click('.err-box button'); await page.waitForTimeout(350);
  ok(!(await page.$('.err-box')), 'retry clears the error');
  ok(/এইতো উত্তর/.test(await page.textContent('.msg.ai .ai-body')), 'retry actually re-sends and shows the answer');
  ok((await page.$$('.msg.user')).length === 1, 'retry does not duplicate the question');
  ok(errs.length === 0, 'no page errors: ' + errs.join(' | '));
  await ctx.close();
}

// ── ৬. নতুন চ্যাট ──────────────────────────────────────────────
{
  const { ctx, page } = await open(); await login(page); await page.waitForTimeout(250);
  NEXT = { status: 200, body: { ok: true, text: 'ok', toolsUsed: [] } };
  await ask(page, 'প্রথম প্রশ্ন');
  await page.click('#btn-new'); await page.waitForTimeout(200);
  ok((await page.$$('.msg')).length === 0, 'new chat clears the conversation');
  ok(await page.isVisible('#welcome'), 'new chat brings the suggestions back');
  await ctx.close();
}

await b.close();
console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
