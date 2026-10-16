// Run: node --test tests/sw-click.test.mjs — exercises sw.js push/notificationclick handlers in a mocked worker scope.
import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs'; import vm from 'node:vm';
function boot(clientsList = []) {
  const handlers = {}, calls = { open: [], focus: [], nav: [], shown: [] };
  const self = { location: { origin: 'https://www.sondhan.org' }, addEventListener: (t, f) => { handlers[t] = f; },
    skipWaiting() {}, clients: { claim() {}, matchAll: async () => clientsList.map(u => ({ url: u, focus: async () => calls.focus.push(u), navigate: async (t) => calls.nav.push(t) })), openWindow: async (u) => calls.open.push(u) },
    registration: { showNotification: async (t, o) => calls.shown.push([t, o]) } };
  vm.runInNewContext(fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8'), { self, location: self.location, caches: {}, fetch() {}, URL, Response, console, setTimeout, clearTimeout, Promise });
  const wait = async (ev) => { let p; ev.waitUntil = (x) => { p = x; }; return { run: async () => { await p; } }; };
  return { handlers, calls, fire: async (type, ev) => { let p; ev.waitUntil = (x) => { p = x; }; handlers[type](ev); await p; } };
}
test('click with no open window → opens /inbox.html on our origin', async () => {
  const s = boot([]); let closed = false; await s.fire('notificationclick', { notification: { close: () => { closed = true; }, data: { url: '/inbox.html' } } });
  assert.ok(closed); assert.deepEqual(s.calls.open, ['https://www.sondhan.org/inbox.html']); });
test('click with an open Sondhan tab → focuses and navigates it (no second window)', async () => {
  const s = boot(['https://www.sondhan.org/search.html']); await s.fire('notificationclick', { notification: { close() {}, data: { url: '/inbox.html' } } });
  assert.deepEqual(s.calls.focus, ['https://www.sondhan.org/search.html']); assert.deepEqual(s.calls.nav, ['https://www.sondhan.org/inbox.html']); assert.equal(s.calls.open.length, 0); });
test('click without data falls back to /inbox.html', async () => {
  const s = boot([]); await s.fire('notificationclick', { notification: { close() {}, data: null } }); assert.deepEqual(s.calls.open, ['https://www.sondhan.org/inbox.html']); });
test('push: FCM envelope → notification; hostile url rejected; long text clipped', async () => {
  const s = boot(); const mk = (o) => ({ data: { json: () => o } });
  await s.fire('push', mk({ data: { title: 'T'.repeat(200), body: 'B'.repeat(500), url: '//evil.com/x', tag: 't1' } }));
  const [title, opts] = s.calls.shown[0]; assert.equal(title.length, 80); assert.equal(opts.body.length, 180); assert.equal(opts.data.url, '/inbox.html'); assert.equal(opts.tag, 't1'); });
test('push with no/invalid payload still shows a safe default', async () => {
  const s = boot(); await s.fire('push', { data: null }); await s.fire('push', { data: { json: () => { throw new Error('bad'); } } });
  assert.equal(s.calls.shown.length, 2); assert.equal(s.calls.shown[1][0], 'Sondhan'); });
test('fetch handler untouched: cross-origin / non-GET are ignored', async () => {
  const s = boot(); let responded = false;
  s.handlers.fetch({ request: { method: 'POST', url: 'https://www.sondhan.org/api/notify', mode: 'cors' }, respondWith: () => { responded = true; } }); assert.equal(responded, false);
  s.handlers.fetch({ request: { method: 'GET', url: 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js', mode: 'cors' }, respondWith: () => { responded = true; } }); assert.equal(responded, false); });
