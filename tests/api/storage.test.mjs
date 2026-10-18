// Run: node --test tests/api/storage.test.mjs   (no network, no Supabase needed)
import test from 'node:test'; import assert from 'node:assert/strict'; import { createRequire } from 'node:module';
const { makeHandler } = createRequire(import.meta.url)('../../api/storage.js');

const mkRes = () => { const r = { code: 0, body: null, headers: {} }; r.status = (c) => { r.code = c; return r; }; r.setHeader = (k, v) => { r.headers[k] = v; return r; }; r.json = (b) => { r.body = b; return r; }; return r; };

function setup({ fail } = {}) {
  const calls = [];
  const fakeFetch = async (url, opts) => {
    calls.push({ url, opts, body: opts?.body ? JSON.parse(opts.body) : null });
    if (fail) return { ok: false, status: 500, json: async () => ({ message: 'boom' }) };
    if (url.includes('/object/upload/sign/')) return { ok: true, json: async () => ({ url: '/object/upload/sign/prescriptions/x?token=abc' }) };
    if (url.includes('/object/sign/')) return { ok: true, json: async () => ({ signedURL: '/object/sign/prescriptions/x?token=abc' }) };
    return { ok: true, status: 200, json: async () => ({}) }; // delete
  };
  const deps = {
    verifyIdToken: async (tok) => { if (!tok.startsWith('u:')) throw new Error('bad'); return { uid: tok.slice(2) }; },
    fetch: fakeFetch,
    url: p => 'https://proj.supabase.co' + p,
    headers: () => ({ authorization: 'Bearer SERVICE_KEY', apikey: 'SERVICE_KEY' }),
  };
  const call = async (token, body, method = 'POST') => { const res = mkRes(); await makeHandler(deps)({ method, headers: token ? { authorization: 'Bearer ' + token } : {}, body }, res); return res; };
  return { call, calls };
}

test('501 when server is not configured (no env vars)', async () => {
  const res = mkRes(); await makeHandler(null)({ method: 'POST', headers: {}, body: {} }, res);
  assert.equal(res.code, 501); assert.equal(res.body.reason, 'not-configured');
});
test('rejects GET, missing and invalid tokens', async () => {
  const s = setup();
  assert.equal((await s.call('u:x', {}, 'GET')).code, 405);
  assert.equal((await s.call(null, {})).code, 401);
  assert.equal((await s.call('garbage', {})).code, 401);
});
test('rejects a bad action', async () => {
  const s = setup();
  assert.equal((await s.call('u:u1', { action: 'hack', path: 'u1/r1/page-00.jpg' })).code, 400);
});
test("rejects a path that doesn't belong to the caller — the real security boundary", async () => {
  const s = setup();
  assert.equal((await s.call('u:u1', { action: 'sign-upload', path: 'OTHERUSER/r1/page-00.jpg', contentType: 'image/jpeg' })).code, 403);
  assert.equal((await s.call('u:u1', { action: 'sign-download', path: 'OTHERUSER/r1/page-00.jpg' })).code, 403);
  assert.equal((await s.call('u:u1', { action: 'delete', path: 'OTHERUSER/r1/page-00.jpg' })).code, 403);
});
test('rejects path traversal attempts', async () => {
  const s = setup();
  assert.equal((await s.call('u:u1', { action: 'sign-upload', path: '../u1/r1/page-00.jpg', contentType: 'image/jpeg' })).code, 403);
  assert.equal((await s.call('u:u1', { action: 'sign-upload', path: 'u1/../../OTHER/x.jpg', contentType: 'image/jpeg' })).code, 403);
});
test('sign-upload: rejects unsupported content types', async () => {
  const s = setup();
  const r = await s.call('u:u1', { action: 'sign-upload', path: 'u1/r1/page-00.exe', contentType: 'application/x-msdownload' });
  assert.equal(r.code, 400); assert.equal(r.body.reason, 'bad-content-type');
});
test('sign-upload: happy path returns an absolute, usable upload URL', async () => {
  const s = setup();
  const r = await s.call('u:u1', { action: 'sign-upload', path: 'u1/r1/page-00.jpg', contentType: 'image/jpeg' });
  assert.equal(r.code, 200); assert.ok(r.body.ok);
  assert.equal(r.body.uploadUrl, 'https://proj.supabase.co/storage/v1/object/upload/sign/prescriptions/x?token=abc');
  // সার্ভিস-রোল key কখনো ক্লায়েন্টের কাছে ফেরত যায় না
  assert.doesNotMatch(JSON.stringify(r.body), /SERVICE_KEY/);
});
test('sign-download: happy path returns an absolute signed URL', async () => {
  const s = setup();
  const r = await s.call('u:u1', { action: 'sign-download', path: 'u1/r1/page-00.jpg' });
  assert.equal(r.code, 200); assert.equal(r.body.url, 'https://proj.supabase.co/storage/v1/object/sign/prescriptions/x?token=abc');
});
test('delete: happy path calls Supabase DELETE and returns ok', async () => {
  const s = setup();
  const r = await s.call('u:u1', { action: 'delete', path: 'u1/r1/page-00.jpg' });
  assert.equal(r.code, 200); assert.ok(r.body.ok);
  assert.ok(s.calls.some(c => c.url.includes('/object/prescriptions/u1/r1/page-00.jpg')));
});
test('Supabase outage surfaces as 502, not a crash', async () => {
  const s = setup({ fail: true });
  const r = await s.call('u:u1', { action: 'sign-upload', path: 'u1/r1/page-00.jpg', contentType: 'image/jpeg' });
  assert.equal(r.code, 502); assert.equal(r.body.reason, 'supabase-error');
});
