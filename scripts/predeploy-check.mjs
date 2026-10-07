#!/usr/bin/env node
// Sondhan — pre-deploy smoke test. Run BEFORE every production deploy:
//     node scripts/predeploy-check.mjs
// Exits non-zero (=> do not deploy) if the shared runtime would break pages.
//
// 1. Static: every APP_SHELL file exists; every local import resolves; sw.js
//    never intercepts cross-origin requests and never lets respondWith get undefined.
// 2. Browser (needs `playwright` + chromium): serves the repo with the REAL
//    vercel.json headers (incl. CSP) and a stub for www.gstatic.com, then proves that
//    with the real sw.js controlling the page: gstatic module imports work,
//    same-origin JS is served as JS, and offline never returns HTML as JS.
//    This is the exact failure class of the Oct-2026 outage.
import fs from 'fs'; import http from 'http'; import https from 'https'; import path from 'path';
import { execFileSync } from 'child_process'; import { createRequire } from 'module'; import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
const ok = (m) => console.log('  PASS', m);
const bad = (m) => { failed++; console.log('  FAIL', m); };
const check = (c, m) => (c ? ok(m) : bad(m));

console.log('[1] static checks');
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const shell = [...sw.slice(sw.indexOf('APP_SHELL'), sw.indexOf('];', sw.indexOf('APP_SHELL'))).matchAll(/'\.\/([^']+)'/g)].map(m => m[1]);
const missing = shell.filter(f => !fs.existsSync(path.join(ROOT, f)));
check(missing.length === 0, `all ${shell.length} APP_SHELL files exist${missing.length ? ' — missing: ' + missing : ''}`);
check(!/gstatic\.com\/firebasejs/.test(sw.replace(/\/\/.*$/gm, '')), 'sw.js does not handle Firebase SDK (gstatic) requests');
check(/origin\s*!==\s*location\.origin/.test(sw), 'sw.js ignores cross-origin requests');
check(!/offline\.html/.test(sw.slice(sw.indexOf("addEventListener('fetch'"))) || /mode === 'navigate'[\s\S]{0,200}offline\.html/.test(sw), 'sw.js only serves offline.html for navigations');
const badImports = [];
for (const f of fs.readdirSync(ROOT).filter(f => /\.(html|js)$/.test(f) && f !== 'sw.js')) {
  const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
  for (const m of s.matchAll(/(?:from\s+|import\s*\(\s*)['"]\.\/([^'"]+)['"]/g)) if (!fs.existsSync(path.join(ROOT, m[1]))) badImports.push(`${f} -> ${m[1]}`);
}
check(badImports.length === 0, `all local imports resolve${badImports.length ? ': ' + badImports : ''}`);
const vj = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
const csp = vj.headers[0].headers.find(h => h.key === 'Content-Security-Policy').value;
check(/script-src[^;]*https:\/\/www\.gstatic\.com/.test(csp), 'CSP script-src allows www.gstatic.com');
check(/connect-src[^;]*firestore\.googleapis\.com/.test(csp) && /connect-src[^;]*identitytoolkit\.googleapis\.com/.test(csp), 'CSP connect-src allows Firestore + Auth');

console.log('[2] browser check (real sw.js + real CSP)');
let chromium;
try { chromium = createRequire(path.join(execFileSync('npm', ['root', '-g']).toString().trim(), '/'))('playwright').chromium; } catch { try { chromium = createRequire(ROOT + '/')('playwright').chromium; } catch {} }
const exe = ['/opt/pw-browsers/chromium', undefined].find(p => !p || fs.existsSync(p));
if (!chromium) { console.log('  SKIP playwright not installed (npm i -g playwright) — run this on a machine that has it before deploying'); }
else {
  const tmp = fs.mkdtempSync('/tmp/sondhan-smoke-');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', tmp + '/k.pem', '-out', tmp + '/c.pem', '-days', '1', '-subj', '/CN=www.gstatic.com', '-addext', 'subjectAltName=DNS:www.gstatic.com'], { stdio: 'ignore' });
  const cspNoUpgrade = csp.replace('; upgrade-insecure-requests', '');
  const g = https.createServer({ key: fs.readFileSync(tmp + '/k.pem'), cert: fs.readFileSync(tmp + '/c.pem') }, (q, s) => { s.writeHead(200, { 'content-type': 'text/javascript', 'access-control-allow-origin': '*' }); s.end('export const ping="ok";'); }).listen(18443);
  const app = http.createServer((q, s) => {
    let p = q.url.split('?')[0];
    if (p === '/') { s.writeHead(200, { 'content-type': 'text/html', 'content-security-policy': cspNoUpgrade }); return s.end('<!doctype html><script>navigator.serviceWorker.register("/sw.js")</script>'); }
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
    s.writeHead(200, { 'content-type': p.endsWith('.js') ? 'text/javascript' : p.endsWith('.html') ? 'text/html' : 'application/octet-stream', 'cache-control': 'no-cache', 'content-security-policy': cspNoUpgrade });
    s.end(fs.readFileSync(f));
  }).listen(18080);
  const b = await chromium.launch({ executablePath: exe, args: ['--host-resolver-rules=MAP www.gstatic.com 127.0.0.1:18443', '--ignore-certificate-errors', '--no-proxy-server'] });
  try {
    const ctx = await b.newContext({ ignoreHTTPSErrors: true }); const pg = await ctx.newPage();
    await pg.goto('http://localhost:18080/'); await pg.evaluate(() => navigator.serviceWorker.ready); await pg.waitForTimeout(1500);
    await pg.reload(); await pg.waitForTimeout(500);
    check(await pg.evaluate(() => !!navigator.serviceWorker.controller), 'service worker controls the page');
    const imp = (u) => pg.evaluate(async (u) => { try { await import(u); return 'ok'; } catch (e) { return e.message; } }, u);
    for (const u of ['https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js', '/app.js', '/firebase-config-auth.js'].filter(u => u.startsWith('http') || fs.existsSync(ROOT + u))) {
      if (u === '/firebase-config-auth.js') continue; // pulls real Firebase (needs real network); covered by the live health check
      check(await imp(u) === 'ok', `import ${u} works through the SW under CSP`);
    }
    const ct = await pg.evaluate(async () => (await fetch('/app.js')).headers.get('content-type'));
    check(/javascript/.test(ct), `app.js served as JavaScript (${ct})`);
    await ctx.setOffline(true);
    const off = await pg.evaluate(async () => { try { return (await fetch('/app.js')).headers.get('content-type') || ''; } catch { return 'network-error'; } });
    check(!/html/.test(off), `offline app.js is never HTML (${off})`);
  } finally { await b.close(); g.close(); app.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
}
console.log(failed ? `\nFAILED (${failed}) — DO NOT DEPLOY` : '\nALL CHECKS PASSED');
process.exit(failed ? 1 : 0);
