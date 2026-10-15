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

console.log('[1b] SEO checks');
const sm = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
check(locs.length > 0 && locs.every(u => u.startsWith('https://www.sondhan.org/')), `sitemap has ${locs.length} URLs, all on https://www.sondhan.org`);
const fileFor = (u) => { const p = new URL(u).pathname; return p === '/donor' ? 'donor.html' : p.endsWith('/') ? p.slice(1) + 'index.html' : p.slice(1); };
for (const u of locs) {
  const f = path.join(ROOT, fileFor(u));
  if (!fs.existsSync(f)) { bad(`sitemap URL has no file: ${u}`); continue; }
  const h = fs.readFileSync(f, 'utf8');
  const can = (h.match(/<link rel="canonical" href="([^"]+)"/) || [])[1];
  const title = (h.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
  const probs = [];
  if (can !== u) probs.push(`canonical=${can}`);
  if (!/<meta name="description" content="[^"]{50,}/.test(h)) probs.push('description missing/short');
  if (title.length < 10 || title.trim() === 'Sondhan') probs.push('weak title');
  if (/name="robots"[^>]*noindex/.test(h)) probs.push('noindex page in sitemap');
  for (const m of h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) { try { const j = JSON.parse(m[1]); const bad = JSON.stringify(j).match(/"(?:name|headline)":"([^"]{0,400})/g) || []; if (/<[a-z][^>]*>/i.test(JSON.stringify(j.itemListElement || []))) probs.push('HTML inside breadcrumb JSON-LD'); for (const n of (j.itemListElement || [])) if ((n.name || '').length > 80) probs.push('breadcrumb name too long'); } catch { probs.push('invalid JSON-LD'); } }
  if (fileFor(u).startsWith('guides/') && /<script(?![^>]*ld\+json)/.test(h)) probs.push('guide contains executable script');
  if (/&lt;(?:div|p|table|ul|h2|a)[\s>]/.test(h)) probs.push('escaped HTML shown as text');
  if (fileFor(u).startsWith('guides/') && /(?:\+?88)?01[3-9]\d{8}/.test(h.replace(/<[^>]+>/g, ' '))) probs.push('phone-like number in guide');
  check(probs.length === 0, `SEO ${new URL(u).pathname}${probs.length ? ' — ' + probs.join('; ') : ''}`);
}
for (const f of ['login', 'signup', 'register', 'profile', 'request', 'admin', 'offline']) check(/name="robots" content="noindex/.test(fs.readFileSync(path.join(ROOT, f + '.html'), 'utf8')), `${f}.html is noindex`);
const rb = fs.readFileSync(path.join(ROOT, 'robots.txt'), 'utf8');
try { execFileSync('node', [path.join(ROOT, 'scripts/build-sitemap.mjs'), '--check'], { stdio: 'pipe' }); ok('sitemap.xml lists exactly the public pages + guides (scripts/build-sitemap.mjs)'); }
catch { bad('sitemap.xml is out of date — run: node scripts/build-sitemap.mjs'); }
const inKey = fs.readdirSync(ROOT).filter(f => /^[0-9a-f]{32}\.txt$/.test(f));
check(inKey.length === 1 && fs.readFileSync(path.join(ROOT, inKey[0]), 'utf8').trim() === inKey[0].replace('.txt', ''), 'IndexNow key file present and its content matches its name');
check(/Sitemap: https:\/\/www\.sondhan\.org\/sitemap\.xml/.test(rb) && !/^Disallow:\s*\/\s*$/m.test(rb), 'robots.txt references sitemap and does not block the site');

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
