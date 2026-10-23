'use strict';
/* Results without a database (js/share.js): a scoresheet travels inside a link. */
const test = require('node:test');
const assert = require('node:assert/strict');
const Share = require('../js/share.js');
const Demo = require('../js/demo.js');

const sheetOf = (profile, name, length) => JSON.parse(JSON.stringify(Demo.runScripted(profile, { name, length }).sheet));

function memoryStorage(limit) {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => {
      const size = Array.from(m.entries()).reduce((n, [a, b]) => n + a.length + b.length, 0) + k.length + String(v).length - (m.has(k) ? k.length + m.get(k).length : 0);
      if (limit && size > limit) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; }
      m.set(k, String(v));
    },
    removeItem: (k) => m.delete(k),
    size: () => m.size,
  };
}

test('a scoresheet survives the trip through a link, unchanged', async () => {
  for (const [p, len] of [['strong'], ['average', 'assessment'], ['weak', 'quick']]) {
    const s = sheetOf(p, 'Riya ' + p, len);
    const packed = await Share.pack(s);
    assert.match(packed, /^r1\.[0-9a-f]{16}\.[A-Za-z0-9_-]+$/);
    assert.ok(packed.length < 20000, 'short enough for WhatsApp: ' + packed.length);
    const u = await Share.unpack(packed);
    assert.equal(u.intact, true);
    assert.deepEqual(u.sheet, s);
  }
});

test('links are found inside a pasted message, and the link never reaches a server', async () => {
  const packed = await Share.pack(sheetOf('average', 'Ankit'));
  const link = Share.linkFor(packed, 'https://example.vercel.app/');
  assert.equal(link, 'https://example.vercel.app/#result=' + packed, 'after #, so it is never sent to the server');
  assert.equal(Share.find('Interview result: Ankit – 55/100 (Borderline). Open it here: ' + link + ' thanks'), packed);
  assert.equal(Share.find(link), packed);
  assert.equal(Share.find('#result=' + packed), packed);
  assert.equal(Share.find(packed), packed);
  assert.equal(Share.find('hello https://example.vercel.app/#results'), null);
  assert.equal(Share.find(''), null);
});

test('edited, cut-off, foreign and oversized links are caught', async () => {
  const s = sheetOf('weak', 'Ramesh');
  const packed = await Share.pack(s);
  const [kind, , data] = packed.split('.');

  // A hand-edited score: re-packed without the right check.
  const edited = JSON.parse(JSON.stringify(s));
  edited.overall = 99;
  const forged = (await Share.pack(edited)).split('.');
  const u = await Share.unpack(forged[0] + '.' + '0123456789abcdef' + '.' + forged[2]);
  assert.equal(u.intact, false, 'flagged as edited');
  assert.equal(u.sheet.overall, 99);

  await assert.rejects(Share.unpack(kind + '.' + packed.split('.')[1] + '.' + data.slice(0, data.length - 60)), /incomplete/);
  await assert.rejects(Share.unpack('hello'), /not a result link/);
  // Valid packing of something that isn't a scoresheet.
  const notSheet = await Share.pack({ hello: 'world' });
  await assert.rejects(Share.unpack(notSheet), /does not contain an interview result/);
  // A "zip bomb": tiny link, huge content.
  const huge = Object.assign(JSON.parse(JSON.stringify(s)), { pad: 'a'.repeat(3000000) });
  const bomb = await Share.pack(huge);
  assert.ok(bomb.length < 20000, 'it compresses to a short link');
  await assert.rejects(Share.unpack(bomb), /too large/);
});

test('without compression (older browsers) it still works, just longer', async () => {
  const s = sheetOf('strong', 'Old Phone');
  const saved = globalThis.CompressionStream;
  globalThis.CompressionStream = undefined;
  let packed;
  try {
    packed = await Share.pack(s);
  } finally {
    globalThis.CompressionStream = saved;
  }
  assert.match(packed, /^r0\./);
  const u = await Share.unpack(packed);
  assert.equal(u.intact, true);
  assert.deepEqual(u.sheet, s);
});

test('the Results row is built only from checked values (a link is untrusted)', () => {
  const s = sheetOf('average', 'X');
  const evil = '"><img src=x onerror=alert(1)>';
  s.dimensions = [{ key: 'communication', score: evil }, { key: '__proto__', score: 5 }, { key: evil, score: 50 }, null, 'x'];
  s.overall = '1e9';
  s.integrity = { answered: evil, skipped: '3' };
  s.candidate.name = { toString: 1 };
  s.verdict.tone = evil;
  s.redFlags = 'lots';
  s.durationSec = evil;
  const row = Share.summaryOf(s, 'r_abc', 0);
  assert.deepEqual(row.dims, { communication: null }, 'odd keys dropped, a non-number score becomes empty');
  assert.equal(Object.getPrototypeOf(row.dims), Object.prototype);
  assert.equal(row.overall, 100, 'clamped to 0–100');
  assert.equal(row.answered, null);
  assert.equal(row.skipped, 3);
  assert.equal(row.name, 'Candidate');
  assert.equal(row.tone, '');
  assert.equal(row.redFlags, 0);
  assert.equal(row.durationSec, 0);
  for (const v of Object.values(row)) if (typeof v === 'number') assert.ok(Number.isFinite(v));
  // A genuine sheet gives the same row the history uses.
  const g = Share.summaryOf(sheetOf('strong', 'Riya'), 'r_x', 0);
  assert.ok(g.overall >= 80 && g.dims.communication >= 0 && g.verdict && g.role && g.answered > 0);
});

test('results received on this device: kept once, listed newest first, removable', async () => {
  const storage = memoryStorage();
  const box = Share.inbox(storage);
  const a = await Share.pack(sheetOf('strong', 'Riya'));
  const b = await Share.pack(sheetOf('weak', 'Ramesh'));
  const r1 = await Share.receive(a, box, 1000);
  const r2 = await Share.receive(b, box, 2000);
  assert.equal(r1.isNew, true);
  assert.deepEqual(box.list().map((r) => r.name), ['Ramesh', 'Riya'], 'newest first');
  const again = await Share.receive(a, box, 3000);
  assert.equal(again.isNew, false, 'opening the same link twice keeps one copy');
  assert.equal(again.id, r1.id);
  assert.equal(box.list().length, 2);
  assert.deepEqual(box.list().map((r) => r.name), ['Ramesh', 'Riya'], 'and keeps its first received time');
  assert.equal(box.get(r2.id), b);
  // A different (say, edited) link for the same interview never replaces the first one.
  const real = sheetOf('weak', 'Ramesh');
  const fake = JSON.parse(JSON.stringify(real));
  fake.overall = 99;
  const forged = await Share.receive(await Share.pack(fake), box, 4000);
  assert.deepEqual([forged.isNew, forged.conflict, forged.id], [false, true, r2.id]);
  assert.equal(box.get(r2.id), b, 'the first copy is kept');
  assert.equal(box.list().find((r) => r.id === r2.id).overall, real.overall);
  box.remove(r2.id);
  assert.deepEqual(box.list().map((r) => r.name), ['Riya']);
  assert.equal(box.get(r2.id), null);
  // A damaged index never breaks the page.
  storage.setItem('aii.inbox', '{oops');
  assert.deepEqual(Share.inbox(storage).list(), []);
});

test('a full phone says so, and keeps what it had', async () => {
  const storage = memoryStorage(30000);
  const box = Share.inbox(storage);
  await Share.receive(await Share.pack(sheetOf('strong', 'One')), box);
  let err;
  for (let i = 0; i < 10 && !err; i++) {
    try {
      await Share.receive(await Share.pack(sheetOf('average', 'Many ' + i)), box);
    } catch (e) {
      err = e;
    }
  }
  assert.ok(err, 'storage filled up');
  assert.match(err.message, /no room left/);
  for (const r of box.list()) assert.ok(box.get(r.id), 'every listed result still opens');
});

test('a result from a file is marked unchecked (a file carries no check)', async () => {
  const box = Share.inbox(memoryStorage());
  const s = sheetOf('weak', 'File Edit');
  s.overall = 98; // edited by hand in a text editor
  const r = await Share.receive(await Share.pack(s), box, 1000, { fromFile: true });
  assert.equal(r.intact, null);
  assert.equal(box.list()[0].intact, null, 'stored as unchecked, never as passing the check');
});

test('odd scoresheets are refused or cleaned, and received results have a size budget', async () => {
  const bad = sheetOf('average', 'Odd');
  bad.questions = 'nope';
  await assert.rejects(Share.unpack(await Share.pack(bad)), /does not contain an interview result/);
  const noRole = sheetOf('average', 'Odd');
  delete noRole.role;
  assert.equal(Share.wellFormed(noRole), false);

  const s = sheetOf('average', 'Keys');
  s.dimensions = [{ key: 'constructor', score: 50 }, { key: 'toString', score: 60 }, { key: 'hasOwnProperty', score: 1 }]
    .concat(Array.from({ length: 40 }, (_, i) => ({ key: 'k' + i, score: i })));
  const row = Share.summaryOf(s, 'r_x', 0);
  assert.equal(Object.keys(row.dims).length, 12, 'capped');
  assert.ok(!Object.keys(row.dims).includes('constructor') && !Object.keys(row.dims).includes('toString'));
  // The CSV never reads an inherited "constructor" for anyone's row.
  const Backup = require('../js/backup.js');
  const csv = Backup.toCsv([{ id: 'a', name: 'A', role: 'r', overall: 1, verdict: 'v', createdAt: new Date().toISOString(), dims: {} }],
    { a: { dimensions: [{ key: 'constructor', short: 'Constructor', score: 5 }] } });
  assert.doesNotMatch(csv, /native code/);

  // The budget: received results never take all of this site's storage.
  const box = Share.inbox(memoryStorage());
  const big = await Share.pack(sheetOf('strong', 'Big'));
  const fakeRow = (i) => ({ id: 'r_b' + i, name: 'B' + i, submittedAt: new Date(i).toISOString() });
  let added = 0;
  try {
    for (let i = 0; i < 1000; i++) {
      box.add(fakeRow(i), big);
      added++;
    }
  } catch (e) {
    assert.equal(e.name, 'QuotaExceededError');
  }
  assert.ok(added * big.length <= Share.BUDGET && (added + 1) * big.length > Share.BUDGET, 'stops at the budget: ' + added);
});

test('a browser that blocks storage still opens results (kept for this visit only)', async () => {
  const had = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('SecurityError'); } });
  try {
    const box = Share.inbox();
    assert.equal(box.persistent, false);
    const r = await Share.receive(await Share.pack(sheetOf('strong', 'Blocked')), box);
    assert.equal(r.isNew, true);
    assert.equal(box.list().length, 1);
  } finally {
    if (had) Object.defineProperty(globalThis, 'localStorage', had);
    else delete globalThis.localStorage;
  }
});
