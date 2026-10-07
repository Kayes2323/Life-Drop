#!/usr/bin/env node
// Sondhan — live production health check. Run AFTER deploy (and any time):
//     node scripts/health-check.mjs [https://sondhan.org]
// Detects catastrophic breakage: missing/mis-typed assets, bad SW headers,
// unreachable Firebase SDK / Auth / Firestore. No secrets, no donor data read.
const BASE = (process.argv[2] || 'https://sondhan.org').replace(/\/$/, '');
const PROJECT = 'life-drop-d4784', KEY = 'AIzaSyBpw6cXNgXNxnWNOn2IQ0IhfXzQv2Qoqxk'; // public web config (same as firebase-config.js)
let failed = 0; const t = async (name, fn) => { try { const r = await fn(); console.log('PASS', name, r ? '— ' + r : ''); } catch (e) { failed++; console.log('FAIL', name, '—', e.message); } };
const get = async (u, o) => { const r = await fetch(u, { signal: AbortSignal.timeout(15000), ...o }); return r; };
for (const p of ['/', '/search.html', '/bloodbank.html', '/donor', '/profile.html', '/login.html'])
  await t('page ' + p, async () => { const r = await get(BASE + p); if (!r.ok) throw new Error('HTTP ' + r.status); if (!/html/.test(r.headers.get('content-type'))) throw new Error('not html'); });
for (const p of ['/app.js', '/firebase-config.js', '/firebase-config-auth.js', '/auth-guard.js'])
  await t('module ' + p, async () => { const r = await get(BASE + p); if (!r.ok) throw new Error('HTTP ' + r.status); if (!/javascript/.test(r.headers.get('content-type'))) throw new Error('wrong MIME ' + r.headers.get('content-type')); });
await t('style.css', async () => { const r = await get(BASE + '/style.css'); if (!r.ok || !/css/.test(r.headers.get('content-type'))) throw new Error('HTTP ' + r.status); });
await t('sw.js revalidates + JS MIME', async () => { const r = await get(BASE + '/sw.js'); const cc = r.headers.get('cache-control') || ''; if (!r.ok || !/javascript/.test(r.headers.get('content-type')) || !/max-age=0|no-cache/.test(cc)) throw new Error(`HTTP ${r.status} cc=${cc}`); const s = await r.text(); if (/gstatic\.com\/firebasejs/.test(s.replace(/\/\/.*$/gm, ''))) throw new Error('sw.js intercepts the Firebase SDK again'); return (s.match(/CACHE_VERSION = '([^']+)'/) || [])[1]; });
for (const m of ['firebase-app', 'firebase-auth', 'firebase-firestore'])
  await t('gstatic ' + m, async () => { const r = await get(`https://www.gstatic.com/firebasejs/10.12.0/${m}.js`); if (!r.ok) throw new Error('HTTP ' + r.status); });
await t('Firebase Auth reachable', async () => { const r = await get(`https://identitytoolkit.googleapis.com/v1/projects?key=${KEY}`); if (r.status >= 500) throw new Error('HTTP ' + r.status); return 'HTTP ' + r.status; });
await t('Firestore reachable (public bloodBanks read)', async () => { const r = await get(`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/bloodBanks?pageSize=1`); if (r.status !== 200) throw new Error('HTTP ' + r.status + ' ' + (await r.text()).slice(0, 120)); const j = await r.json(); if (!j.documents?.length) throw new Error('0 documents'); return j.documents.length + ' doc'; });
console.log(failed ? `\n${failed} FAILED — production is unhealthy` : '\nHEALTHY'); process.exit(failed ? 1 : 0);
