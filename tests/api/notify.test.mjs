// Run: node --test tests/api/notify.test.mjs   (no network, no Firebase needed)
import test from 'node:test'; import assert from 'node:assert/strict'; import { createRequire } from 'node:module';
const { makeHandler } = createRequire(import.meta.url)('../../api/notify.js');

function fakeDb(seed = {}) {
  const store = new Map(Object.entries(seed));
  const snap = (p) => ({ exists: store.has(p), data: () => structuredClone(store.get(p)) });
  const doc = (col, id) => { const p = col + '/' + id; return { path: p, get: async () => snap(p),
    set: async (v, o) => store.set(p, o?.merge ? { ...(store.get(p) || {}), ...v } : v), update: async (v) => store.set(p, { ...store.get(p), ...v }) }; };
  return { store, collection: (c) => ({ doc: (id) => doc(c, id) }),
    runTransaction: async (fn) => fn({ get: async (r) => snap(r.path), set: (r, v) => store.set(r.path, v), update: (r, v) => store.set(r.path, { ...store.get(r.path), ...v }) }) };
}
const mkRes = () => { const r = { code: 0, body: null, headers: {} }; r.status = (c) => { r.code = c; return r; }; r.setHeader = (k, v) => { r.headers[k] = v; return r; }; r.json = (b) => { r.body = b; return r; }; return r; };
function setup({ requests = {}, tokens = {}, send } = {}) {
  const seed = { 'donors/donorAAAA1': { name: 'করিম' } };
  for (const [id, r] of Object.entries(requests)) seed['donorRequests/' + id] = r;
  for (const [u, t] of Object.entries(tokens)) seed['fcmTokens/' + u] = { tokens: t };
  const db = fakeDb(seed); const sent = [];
  const messaging = { sendEachForMulticast: send || (async (m) => { sent.push(m); return { responses: m.tokens.map(() => ({ success: true })) }; }) };
  let t = 1_000_000;
  const deps = { db, messaging, now: () => t, auth: { verifyIdToken: async (tok) => { if (!tok.startsWith('u:')) throw new Error('bad'); return { uid: tok.slice(2) }; } } };
  const call = async (token, body, method = 'POST') => { const res = mkRes(); await makeHandler(deps)({ method, headers: token ? { authorization: 'Bearer ' + token } : {}, body }, res); return res; };
  return { db, sent, call, advance: (ms) => { t += ms; } };
}
const ID = 'seekerBBBB1_donorAAAA1';
const REQ = (o = {}) => ({ donorId: 'donorAAAA1', seekerUid: 'seekerBBBB1', seekerName: 'রহিম', msg: 'DMCH-এ O+ লাগবে, আজ রাতেই', status: 'pending', ...o });

test('501 when server is not configured (no service account)', async () => {
  const res = mkRes(); await makeHandler(null)({ method: 'POST', headers: {}, body: {} }, res); assert.equal(res.code, 501); assert.equal(res.body.reason, 'not-configured'); });
test('rejects GET, missing and invalid tokens', async () => {
  const s = setup(); assert.equal((await s.call('u:x', {}, 'GET')).code, 405);
  assert.equal((await s.call(null, {})).code, 401); assert.equal((await s.call('garbage', {})).code, 401); });
test('rejects malformed input', async () => {
  const s = setup(); assert.equal((await s.call('u:seekerBBBB1', { requestId: '../../x', kind: 'new' })).code, 400);
  assert.equal((await s.call('u:seekerBBBB1', { requestId: ID, kind: 'hack' })).code, 400); assert.equal((await s.call('u:seekerBBBB1', null)).code, 400); });
test('404 for unknown request', async () => { const s = setup(); assert.equal((await s.call('u:seekerBBBB1', { requestId: ID, kind: 'new' })).code, 404); });
test('new: only the seeker may trigger; stranger and donor get 403', async () => {
  const s = setup({ requests: { [ID]: REQ() }, tokens: { donorAAAA1: ['tok1'] } });
  assert.equal((await s.call('u:stranger1', { requestId: ID, kind: 'new' })).code, 403);
  assert.equal((await s.call('u:donorAAAA1', { requestId: ID, kind: 'new' })).code, 403); assert.equal(s.sent.length, 0); });
test('new: happy path sends to the donor, payload has no phone, flag is claimed', async () => {
  const s = setup({ requests: { [ID]: REQ() }, tokens: { donorAAAA1: ['tokA', 'tokB'] } });
  const r = await s.call('u:seekerBBBB1', { requestId: ID, kind: 'new' });
  assert.equal(r.code, 200); assert.equal(r.body.sent, 2); assert.equal(s.sent.length, 1);
  const m = s.sent[0]; assert.deepEqual(m.tokens, ['tokA', 'tokB']); assert.match(m.data.title, /রক্তের অনুরোধ/); assert.match(m.data.body, /রহিম/);
  assert.equal(m.data.url, '/inbox.html'); assert.doesNotMatch(JSON.stringify(m), /01\d{9}|phone|email/i);
  assert.ok(s.db.store.get('donorRequests/' + ID).pushedAt); });
test('new: second call is a no-op (no duplicate push)', async () => {
  const s = setup({ requests: { [ID]: REQ() }, tokens: { donorAAAA1: ['t'] } });
  await s.call('u:seekerBBBB1', { requestId: ID, kind: 'new' }); const r2 = await s.call('u:seekerBBBB1', { requestId: ID, kind: 'new' });
  assert.equal(r2.body.reason, 'already-sent'); assert.equal(s.sent.length, 1); });
test('new: not allowed once the request is no longer pending', async () => {
  const s = setup({ requests: { [ID]: REQ({ status: 'cancelled' }) }, tokens: { donorAAAA1: ['t'] } });
  assert.equal((await s.call('u:seekerBBBB1', { requestId: ID, kind: 'new' })).code, 409); });
test('new: donor without a device gets no push but the call succeeds', async () => {
  const s = setup({ requests: { [ID]: REQ() } }); const r = await s.call('u:seekerBBBB1', { requestId: ID, kind: 'new' });
  assert.equal(r.code, 200); assert.equal(r.body.reason, 'no-device'); assert.equal(s.sent.length, 0); });
test('response accepted: only the donor, goes to the seeker, names the donor', async () => {
  const s = setup({ requests: { [ID]: REQ({ status: 'accepted' }) }, tokens: { seekerBBBB1: ['sk'] } });
  assert.equal((await s.call('u:seekerBBBB1', { requestId: ID, kind: 'response' })).code, 403);
  const r = await s.call('u:donorAAAA1', { requestId: ID, kind: 'response' });
  assert.equal(r.body.sent, 1); assert.deepEqual(s.sent[0].tokens, ['sk']); assert.match(s.sent[0].data.title, /গ্রহণ/); assert.match(s.sent[0].data.body, /করিম/); });
test('response declined has its own wording; pending cannot trigger a response push', async () => {
  const s = setup({ requests: { [ID]: REQ({ status: 'declined' }) }, tokens: { seekerBBBB1: ['sk'] } });
  await s.call('u:donorAAAA1', { requestId: ID, kind: 'response' }); assert.match(s.sent[0].data.title, /পারছেন না/);
  const p = setup({ requests: { [ID]: REQ() } }); assert.equal((await p.call('u:donorAAAA1', { requestId: ID, kind: 'response' })).code, 409); });
test('rate limit: 15 per hour per sender, resets after the window', async () => {
  const reqs = {}, tokens = { donorAAAA1: ['t'] }; for (let i = 0; i < 17; i++) reqs[`seekerBBBB1_donorAAAA${i + 10}`] = REQ({ donorId: `donorAAAA${i + 10}` });
  const s = setup({ requests: reqs, tokens }); const codes = [];
  for (let i = 0; i < 16; i++) codes.push((await s.call('u:seekerBBBB1', { requestId: `seekerBBBB1_donorAAAA${i + 10}`, kind: 'new' })).code);
  assert.equal(codes.filter(c => c === 200).length, 15); assert.equal(codes[15], 429);
  s.advance(3601 * 1000); assert.equal((await s.call('u:seekerBBBB1', { requestId: 'seekerBBBB1_donorAAAA26', kind: 'new' })).code, 200); });
test('dead device tokens are pruned, live ones kept', async () => {
  const s = setup({ requests: { [ID]: REQ() }, tokens: { donorAAAA1: ['live', 'dead'] },
    send: async (m) => ({ responses: m.tokens.map(t => t === 'dead' ? { success: false, error: { code: 'messaging/registration-token-not-registered' } } : { success: true }) }) });
  const r = await s.call('u:seekerBBBB1', { requestId: ID, kind: 'new' }); assert.equal(r.body.sent, 1);
  assert.deepEqual(s.db.store.get('fcmTokens/donorAAAA1').tokens, ['live']); });
test('FCM outage is handled (500, no crash) and nothing leaks', async () => {
  const s = setup({ requests: { [ID]: REQ() }, tokens: { donorAAAA1: ['t'] }, send: async () => { throw new Error('fcm down'); } });
  const r = await s.call('u:seekerBBBB1', { requestId: ID, kind: 'new' }); assert.equal(r.code, 500); assert.deepEqual(r.body, { ok: false, reason: 'server-error' }); });
