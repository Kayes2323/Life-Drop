#!/usr/bin/env node
// Regenerates sitemap.xml so new guide pages are never forgotten.
//   node scripts/build-sitemap.mjs          # write sitemap.xml
//   node scripts/build-sitemap.mjs --check  # exit 1 if sitemap.xml is out of date (used by predeploy-check)
// Rules: core public pages + every guides/*.html that is not noindex. lastmod = date of the last
// git commit touching that file (real data, never invented). Private pages are never listed.
import fs from 'fs'; import path from 'path'; import { execFileSync } from 'child_process'; import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://www.sondhan.org';
const CORE = [['/', 'index.html'], ['/search.html', 'search.html'], ['/bloodbank.html', 'bloodbank.html'], ['/donor', 'donor.html'], ['/about.html', 'about.html'], ['/privacy.html', 'privacy.html'], ['/terms.html', 'terms.html'], ['/health.html', 'health.html'], ['/test-prices.html', 'test-prices.html'], ['/diseases.html', 'diseases.html']];
const urls = [...CORE];
for (const f of fs.readdirSync(path.join(ROOT, 'guides')).filter(f => f.endsWith('.html')).sort()) {
  if (/name="robots"[^>]*noindex/.test(fs.readFileSync(path.join(ROOT, 'guides', f), 'utf8'))) continue;
  urls.push([f === 'index.html' ? '/guides/' : `/guides/${f}`, `guides/${f}`]);
}
const lastmod = (f) => {
  let d = '';
  try { d = execFileSync('git', ['log', '-1', '--format=%cs', '--', f], { cwd: ROOT }).toString().trim(); } catch {}
  return d || new Date().toISOString().slice(0, 10);
};
const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  urls.map(([u, f]) => `  <url><loc>${BASE}${u}</loc><lastmod>${lastmod(f)}</lastmod></url>`).join('\n') + '\n</urlset>\n';
const target = path.join(ROOT, 'sitemap.xml');
if (process.argv.includes('--check')) {
  // compare URL sets only (lastmod legitimately changes with commits)
  const cur = [...fs.readFileSync(target, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]).sort().join('\n');
  const want = urls.map(([u]) => BASE + u).sort().join('\n');
  if (cur !== want) { console.error('sitemap.xml is out of date — run: node scripts/build-sitemap.mjs'); process.exit(1); }
  console.log('sitemap.xml URL set is up to date (' + urls.length + ' URLs)');
} else { fs.writeFileSync(target, xml); console.log('wrote sitemap.xml with ' + urls.length + ' URLs'); }
