import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateFile, validateFileList, sanitizeDocDate, sanitizeOptionalText,
  buildRecordPayload, MAX_FILE_BYTES, MAX_PAGES, storageFileName,
} from '../../health-core.js';

const img = (size = 1000, type = 'image/jpeg') => ({ size, type });
const pdf = (size = 1000) => ({ size, type: 'application/pdf' });

test('validateFile: accepts jpeg/png/webp/pdf within size', () => {
  assert.equal(validateFile(img()).ok, true);
  assert.equal(validateFile(img(1000, 'image/png')).ok, true);
  assert.equal(validateFile(img(1000, 'image/webp')).ok, true);
  assert.equal(validateFile(pdf()).ok, true);
});

test('validateFile: rejects unsupported type (e.g. executable, svg, video)', () => {
  assert.equal(validateFile({ size: 10, type: 'application/x-msdownload' }).ok, false);
  assert.equal(validateFile({ size: 10, type: 'image/svg+xml' }).ok, false);
  assert.equal(validateFile({ size: 10, type: 'video/mp4' }).ok, false);
});

test('validateFile: rejects empty and oversized files', () => {
  assert.equal(validateFile(img(0)).ok, false);
  assert.equal(validateFile(img(MAX_FILE_BYTES + 1)).ok, false);
  assert.equal(validateFile(img(MAX_FILE_BYTES)).ok, true);
});

test('validateFile: rejects missing/invalid input instead of guessing', () => {
  assert.equal(validateFile(null).ok, false);
  assert.equal(validateFile({}).ok, false);
});

test('validateFileList: enforces page-count cap and bubbles first bad file', () => {
  assert.equal(validateFileList([]).reason, 'no-files');
  assert.equal(validateFileList(Array.from({ length: MAX_PAGES + 1 }, () => img())).reason, 'too-many-pages');
  assert.equal(validateFileList([img(), img(MAX_FILE_BYTES + 1)]).ok, false);
  assert.equal(validateFileList([img(), pdf()]).ok, true);
});

test('sanitizeDocDate: only real YYYY-MM-DD dates, not far-future', () => {
  assert.equal(sanitizeDocDate('2026-01-15'), '2026-01-15');
  assert.equal(sanitizeDocDate('2026-13-01'), null);   // invalid month
  assert.equal(sanitizeDocDate('15-01-2026'), null);   // wrong format
  assert.equal(sanitizeDocDate(''), null);
  assert.equal(sanitizeDocDate('2099-01-01'), null);   // far future rejected
});

test('sanitizeOptionalText: trims, allows empty, rejects over max length', () => {
  assert.deepEqual(sanitizeOptionalText('  Dr. Rahim  ', 100), { ok: true, value: 'Dr. Rahim' });
  assert.deepEqual(sanitizeOptionalText('   ', 100), { ok: true, value: undefined });
  assert.equal(sanitizeOptionalText('x'.repeat(101), 100).ok, false);
});

test('buildRecordPayload: matches firestore.rules shape exactly, never invents fields', () => {
  const r = buildRecordPayload({
    category: 'lab', title: ' CBC ', facility: '', docDate: '2026-02-01',
    pages: [{ path: 'healthRecords/u1/r1/page-00.jpg' }],
  });
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.data).sort(), ['category', 'docDate', 'pageCount', 'pages', 'title'].sort());
  assert.equal(r.data.title, 'CBC');
  assert.equal('facility' in r.data, false); // empty optional field omitted, not invented as ''
});

test('buildRecordPayload: rejects bad category, bad date, too many/zero pages', () => {
  assert.equal(buildRecordPayload({ category: 'xray', docDate: '2026-01-01', pages: [{ path: 'a' }] }).ok, false);
  assert.equal(buildRecordPayload({ category: 'lab', docDate: 'bad', pages: [{ path: 'a' }] }).ok, false);
  assert.equal(buildRecordPayload({ category: 'lab', docDate: '2026-01-01', pages: [] }).ok, false);
  assert.equal(buildRecordPayload({ category: 'lab', docDate: '2026-01-01', pages: Array.from({ length: MAX_PAGES + 1 }, () => ({ path: 'a' })) }).ok, false);
});

test('storageFileName: predictable, extension-safe, no original filename leaked', () => {
  assert.equal(storageFileName(0, 'My Report!!.JPG', false), 'page-00.jpg');
  assert.equal(storageFileName(3, 'whatever', true), 'page-03.pdf');
  assert.equal(storageFileName(1, 'a.b.c;rm -rf', false), 'page-01.crmrf');
  assert.equal(storageFileName(1, '../../etc/passwd', false), 'page-01.etcpasswd');
});
