#!/usr/bin/env node
// Tells IndexNow-participating search engines (Bing, Yandex, Naver, Seznam…) that URLs changed.
// Google does not use IndexNow — for Google use Search Console (sitemap + URL inspection).
// This only SPEEDS UP DISCOVERY. It does not guarantee indexing, ranking or AI citations.
//   node scripts/indexnow.mjs            # submit every URL in sitemap.xml
//   node scripts/indexnow.mjs <url> ...  # submit specific URLs
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOST = 'www.sondhan.org';
const keyFile = fs.readdirSync(ROOT).find(f => /^[0-9a-f]{32}\.txt$/.test(f));
if (!keyFile) { console.error('no IndexNow key file (<32-hex>.txt) in repo root'); process.exit(1); }
const key = keyFile.replace('.txt', '');
const urlList = process.argv.slice(2).length ? process.argv.slice(2)
  : [...fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: HOST, key, keyLocation: `https://${HOST}/${keyFile}`, urlList }), signal: AbortSignal.timeout(20000) });
console.log(`IndexNow: submitted ${urlList.length} URLs → HTTP ${res.status} (200/202 = accepted)`);
process.exit(res.status === 200 || res.status === 202 ? 0 : 1);
