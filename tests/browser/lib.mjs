// Shared bits for the browser tests: locate Playwright + Chromium, repo root, and a throw-away TLS cert
// (the tests map www.gstatic.com to a local HTTPS server that serves fake Firebase SDK modules).
import fs from 'fs'; import os from 'os'; import path from 'path'; import { execFileSync } from 'child_process'; import { createRequire } from 'module'; import { fileURLToPath } from 'url';
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pw; for (const base of [() => path.join(execFileSync('npm', ['root', '-g']).toString().trim(), '/'), () => ROOT + '/']) { try { pw = createRequire(base())('playwright'); break; } catch {} }
if (!pw) { console.error('playwright not found — npm i -g playwright'); process.exit(2); }
export const chromium = pw.chromium;
export const exe = ['/opt/pw-browsers/chromium'].find(p => fs.existsSync(p));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sondhan-tls-'));
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', tmp + '/k.pem', '-out', tmp + '/c.pem', '-days', '1', '-subj', '/CN=www.gstatic.com', '-addext', 'subjectAltName=DNS:www.gstatic.com'], { stdio: 'ignore' });
export const tls = { key: fs.readFileSync(tmp + '/k.pem'), cert: fs.readFileSync(tmp + '/c.pem') };
