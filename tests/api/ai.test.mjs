// Run: node --test tests/api/ai.test.mjs   (no network, no Gemini key needed)
import test from 'node:test'; import assert from 'node:assert/strict'; import { createRequire } from 'node:module';
const mod = createRequire(import.meta.url)('../../api/ai.js');
const { makeHandler, _internals } = mod;

const mkRes = () => { const r = { code: 0, body: null, headers: {} }; r.status = (c) => { r.code = c; return r; }; r.setHeader = (k, v) => { r.headers[k] = v; return r; }; r.json = (b) => { r.body = b; return r; }; return r; };

let uidSeq = 0;
const freshUid = () => 'u' + (++uidSeq) + '-' + Math.random().toString(36).slice(2, 8);

// replies: array of { ok, status, data } returned in order by callGemini
function setup(replies) {
  const sent = [];
  const deps = {
    verifyIdToken: async (tok) => { if (!tok.startsWith('u:')) throw new Error('bad'); return { uid: tok.slice(2) }; },
    now: () => Date.now(),
    callGemini: async (payload) => { sent.push(payload); return replies[Math.min(sent.length - 1, replies.length - 1)]; },
  };
  const call = async (token, body, method = 'POST') => {
    const res = mkRes();
    await makeHandler(deps)({ method, headers: token ? { authorization: 'Bearer ' + token } : {}, body }, res);
    return res;
  };
  return { call, sent };
}

const textReply = (t) => ({ ok: true, status: 200, data: { candidates: [{ content: { parts: [{ text: t }] } }] } });
const callReply = (name, args) => ({ ok: true, status: 200, data: { candidates: [{ content: { parts: [{ functionCall: { name, args } }] } }] } });
const msg = (text) => ({ messages: [{ role: 'user', text }] });

test('501 when server is not configured (no env vars)', async () => {
  const res = mkRes(); await makeHandler(null)({ method: 'POST', headers: {}, body: {} }, res);
  assert.equal(res.code, 501); assert.equal(res.body.reason, 'not-configured');
});

test('rejects GET, missing and invalid tokens', async () => {
  const { call } = setup([textReply('hi')]);
  assert.equal((await call('u:' + freshUid(), msg('হাই'), 'GET')).code, 405);
  assert.equal((await call(null, msg('হাই'))).code, 401);
  assert.equal((await call('bogus', msg('হাই'))).body.reason, 'bad-token');
});

test('validates message shape', async () => {
  const { call } = setup([textReply('hi')]);
  const u = () => 'u:' + freshUid();
  assert.equal((await call(u(), { messages: [] })).body.reason, 'bad-messages');
  assert.equal((await call(u(), { messages: 'nope' })).body.reason, 'bad-messages');
  assert.equal((await call(u(), { messages: [{ role: 'system', text: 'x' }] })).body.reason, 'bad-role');
  assert.equal((await call(u(), { messages: [{ role: 'user', text: '   ' }] })).body.reason, 'bad-text');
  assert.equal((await call(u(), { messages: [{ role: 'user', text: 'x'.repeat(4001) }] })).body.reason, 'message-too-long');
  assert.equal((await call(u(), { messages: [{ role: 'user', text: 'hi' }, { role: 'model', text: 'yo' }] })).body.reason, 'last-must-be-user');
});

test('happy path returns the model text and no tools used', async () => {
  const { call, sent } = setup([textReply('TSH হলো থাইরয়েড পরীক্ষা।')]);
  const res = await call('u:' + freshUid(), msg('TSH কী?'));
  assert.equal(res.code, 200);
  assert.equal(res.body.ok, true);
  assert.match(res.body.text, /থাইরয়েড/);
  assert.deepEqual(res.body.toolsUsed, []);
  assert.equal(res.headers['Cache-Control'], 'no-store');
  // Bengali-first system instruction is actually sent
  assert.match(sent[0].system_instruction.parts[0].text, /ডিফল্ট ভাষা বাংলা/);
});

test('runs the medical-test tool when Gemini asks, then returns the final text', async () => {
  const { call, sent } = setup([
    callReply('searchMedicalTests', { query: 'CBC' }),
    textReply('CBC-র সরকারি মূল্য ১৫০ টাকা (ঢাকা মেডিকেল)।'),
  ]);
  const res = await call('u:' + freshUid(), msg('CBC এর দাম কত?'));
  assert.equal(res.code, 200);
  assert.deepEqual(res.body.toolsUsed, ['searchMedicalTests']);
  assert.match(res.body.text, /১৫০/);
  // the tool's result was fed back to Gemini as a functionResponse
  const fed = sent[1].contents.find(c => c.parts?.[0]?.functionResponse);
  assert.ok(fed, 'functionResponse should be sent back');
  assert.equal(fed.parts[0].functionResponse.name, 'searchMedicalTests');
  assert.ok(fed.parts[0].functionResponse.response.found > 0);
});

test('unknown tool name does not crash the request', async () => {
  const { call } = setup([callReply('deleteEverything', {}), textReply('ঠিক আছে।')]);
  const res = await call('u:' + freshUid(), msg('হাই'));
  assert.equal(res.code, 200);
  assert.deepEqual(res.body.toolsUsed, ['deleteEverything']);
});

test('tool loop cannot run forever', async () => {
  const { call } = setup([callReply('searchMedicalTests', { query: 'CBC' })]); // always asks for a tool
  const res = await call('u:' + freshUid(), msg('CBC?'));
  assert.equal(res.code, 502);
  assert.equal(res.body.reason, 'tool-loop-exhausted');
});

test('maps upstream failures to safe reasons', async () => {
  const mk = (status) => setup([{ ok: false, status, data: {} }]);
  assert.equal((await mk(429).call('u:' + freshUid(), msg('হাই'))).body.reason, 'upstream-rate-limited');
  assert.equal((await mk(403).call('u:' + freshUid(), msg('হাই'))).body.reason, 'upstream-auth');
  assert.equal((await mk(500).call('u:' + freshUid(), msg('হাই'))).body.reason, 'upstream-error');
});

test('a blocked (SAFETY) answer still returns a usable Bengali message', async () => {
  const { call } = setup([{ ok: true, status: 200, data: { candidates: [{ finishReason: 'SAFETY', content: { parts: [] } }] } }]);
  const res = await call('u:' + freshUid(), msg('...'));
  assert.equal(res.code, 200);
  assert.ok(res.body.text.length > 0);
});

test('rate limits a single user after 20 requests', async () => {
  const { call } = setup([textReply('ok')]);
  const tok = 'u:' + freshUid();
  for (let i = 0; i < 20; i++) assert.equal((await call(tok, msg('হাই'))).code, 200);
  const res = await call(tok, msg('হাই'));
  assert.equal(res.code, 429);
  assert.equal(res.body.reason, 'rate-limited');
});

// ── the tool itself, against the real verified data file ──
test('searchMedicalTests returns real data with its source, never invented', async () => {
  const r = await _internals.searchMedicalTests({ query: 'CBC' });
  assert.ok(r.found > 0);
  const p = r.results[0].prices[0];
  assert.equal(typeof p.amount_bdt, 'number');
  assert.ok(p.source_url.startsWith('http'), 'every price must carry a source URL');
  assert.ok(p.published_date, 'every price must carry a publication date');
  assert.equal(p.verification_status, 'needs_reverify');
});

test('searchMedicalTests tells the model not to guess when nothing matches', async () => {
  const r = await _internals.searchMedicalTests({ query: 'এরকম কোনো পরীক্ষা নেই xyz' });
  assert.equal(r.found, 0);
  assert.deepEqual(r.results, []);
  assert.match(r.disclaimer, /অনুমান করে বলবেন না/);
});

test('searchMedicalTests matches Bengali queries too', async () => {
  const r = await _internals.searchMedicalTests({ query: 'থাইরয়েড' });
  assert.ok(r.found > 0, 'Bengali query should match');
});
