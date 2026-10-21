import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBdPhone, isValidBdPhone, safeRedirect } from '../app.js';

// ── normalizeBdPhone: brief Phase 2 item 1 — all 4 formats → +8801XXXXXXXXX ──
test('normalizeBdPhone: all 4 brief formats normalize to the same E.164 number', () => {
  assert.equal(normalizeBdPhone('01712345678'), '+8801712345678');
  assert.equal(normalizeBdPhone('8801712345678'), '+8801712345678');
  assert.equal(normalizeBdPhone('+8801712345678'), '+8801712345678');
  assert.equal(normalizeBdPhone('1712345678'), '+8801712345678');
});

test('normalizeBdPhone: tolerates spaces, dashes and parentheses', () => {
  assert.equal(normalizeBdPhone('01712-345678'), '+8801712345678');
  assert.equal(normalizeBdPhone(' +880 1712 345678 '), '+8801712345678');
  assert.equal(normalizeBdPhone('(01712)345678'), '+8801712345678');
});

test('normalizeBdPhone: accepts every real Bangladeshi mobile operator prefix (013/014/.../019)', () => {
  for (const prefix of ['013', '014', '015', '016', '017', '018', '019']) {
    const raw = prefix + '00000000'; // 11 digits total (e.g. 01300000000)
    assert.equal(normalizeBdPhone(raw), '+880' + raw.slice(1), `prefix ${prefix} should normalize`);
  }
});

test('normalizeBdPhone: rejects malformed input instead of silently mangling it', () => {
  assert.equal(normalizeBdPhone(''), '');
  assert.equal(normalizeBdPhone(null), '');
  assert.equal(normalizeBdPhone(undefined), '');
  assert.equal(normalizeBdPhone('12345'), '');              // too short
  assert.equal(normalizeBdPhone('017123456789999'), '');    // too long
  assert.equal(normalizeBdPhone('02123456789'), '');        // landline-shaped (not 01...)
  assert.equal(normalizeBdPhone('+8801712345'), '');        // too few digits after 880
  assert.equal(normalizeBdPhone('abcdefghijk'), '');        // not numeric at all
  assert.equal(normalizeBdPhone('+91171234567'), '');       // non-BD country code
});

test('normalizeBdPhone: never returns a bare "+880" for malformed input (old bug class)', () => {
  // Regression guard for the exact bug class the login.html comment (line ~241) describes:
  // a prior buggy normalizer returned just '+880' (losing the subscriber number) whenever
  // the remaining digits did not start with '1'. The correct behaviour is to reject ('').
  for (const bad of ['0299999999', '880299999999', '+880299999999', '299999999']) {
    const out = normalizeBdPhone(bad);
    assert.notEqual(out, '+880', `must not collapse to bare +880 for "${bad}"`);
    assert.equal(out, '', `must reject "${bad}" instead of mangling it`);
  }
});

test('isValidBdPhone: mirrors normalizeBdPhone exactly', () => {
  assert.equal(isValidBdPhone('01712345678'), true);
  assert.equal(isValidBdPhone('+8801712345678'), true);
  assert.equal(isValidBdPhone('0171234'), false);
  assert.equal(isValidBdPhone(''), false);
});

// ── safeRedirect: open-redirect protection used by login.html / signup.html / auth-guard.js ──
test('safeRedirect: allows a bare same-site .html path', () => {
  assert.equal(safeRedirect('profile.html'), 'profile.html');
  assert.equal(safeRedirect('index.html?tab=donor'), 'index.html?tab=donor');
});

test('safeRedirect: rejects absolute/external/protocol-relative targets (falls back)', () => {
  assert.equal(safeRedirect('https://evil.example/phish.html'), 'index.html');
  assert.equal(safeRedirect('//evil.example/phish.html'), 'index.html');
  assert.equal(safeRedirect('javascript:alert(1)'), 'index.html');
  assert.equal(safeRedirect('/profile.html'), 'index.html'); // leading slash not allowed
  assert.equal(safeRedirect('../secret.html'), 'index.html');
});

test('safeRedirect: rejects empty/missing input and respects a custom fallback', () => {
  assert.equal(safeRedirect(''), 'index.html');
  assert.equal(safeRedirect(null), 'index.html');
  assert.equal(safeRedirect(undefined, 'login.html'), 'login.html');
});
