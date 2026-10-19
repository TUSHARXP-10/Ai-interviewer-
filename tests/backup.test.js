'use strict';
// Backup, restore and CSV export of saved interviews.
const test = require('node:test');
const assert = require('node:assert/strict');
const Backup = require('../js/backup.js');
const Demo = require('../js/demo.js');

function sheetAt(daysAgo, name, profile) {
  const { sheet } = Demo.runScripted(profile || 'average', { role: 'voice', length: 'quick', name, seed: 3 + daysAgo });
  const s = JSON.parse(JSON.stringify(sheet));
  s.id = 'iv_' + name.toLowerCase().replace(/\W+/g, '') + daysAgo;
  s.createdAt = new Date(Date.UTC(2026, 9, 18 - daysAgo, 10)).toISOString();
  return s;
}
const store = (sheets) => ({
  history: sheets.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(Backup.entryOf),
  sheets: Object.fromEntries(sheets.map((s) => [s.id, s])),
});

test('a backup round-trips through JSON', () => {
  const a = sheetAt(2, 'Ravi');
  const b = sheetAt(1, 'Priya', 'strong');
  const data = store([a, b]);
  data.drills = { [a.id]: { q1: [{ at: '2026-10-17T10:00:00.000Z', quality: 70 }] }, gone: { q1: [] } };
  const file = JSON.stringify(Backup.build(data, Date.UTC(2026, 9, 18)));
  const back = Backup.parse(file);
  assert.equal(back.kind, 'backup');
  assert.equal(back.history.length, 2);
  assert.deepEqual(Object.keys(back.sheets).sort(), [a.id, b.id].sort());
  assert.equal(back.sheets[b.id].overall, b.overall);
  assert.deepEqual(Object.keys(back.drills), [a.id], 'drills of deleted scoresheets are left out');
});

test('entries whose scoresheet is gone are left out of a backup', () => {
  const a = sheetAt(1, 'Ravi');
  const data = store([a]);
  data.history.push({ id: 'iv_missing', name: 'X', overall: 50, createdAt: a.createdAt });
  assert.equal(Backup.build(data).count, 1);
});

test('a single downloaded scoresheet can be imported too', () => {
  const a = sheetAt(1, 'Ravi');
  const got = Backup.parse(JSON.stringify(a, null, 2));
  assert.equal(got.kind, 'sheet');
  assert.equal(got.history[0].id, a.id);
  assert.equal(got.history[0].name, 'Ravi');
  assert.equal(got.history[0].overall, a.overall);
});

test('bad files get a clear message', () => {
  assert.throws(() => Backup.parse('not json'), /not valid JSON/);
  assert.throws(() => Backup.parse('{"hello":1}'), /not a Tushar AI backup/);
  assert.throws(() => Backup.parse(JSON.stringify({ app: Backup.APP, kind: 'backup', version: 99, sheets: {} })), /newer version/);
  assert.throws(() => Backup.parse(JSON.stringify({ app: Backup.APP, kind: 'backup', version: 1, sheets: { x: { id: 'y' } } })), /no interviews/);
});

test('history entries are rebuilt from the scoresheets, not trusted from the file', () => {
  const a = sheetAt(1, 'Ravi');
  const file = Backup.build(store([a]));
  file.history[0].overall = 100;
  file.history[0].name = '<img onerror=alert(1)>';
  const back = Backup.parse(JSON.stringify(file));
  assert.equal(back.history[0].overall, a.overall);
  assert.equal(back.history[0].name, 'Ravi');
});

test('merging adds new interviews, skips ones already here, and keeps the newest twelve', () => {
  const mine = [sheetAt(3, 'Ravi'), sheetAt(5, 'Old')];
  const cur = { history: store(mine).history, drills: { [mine[0].id]: { q1: [{ at: '2026-10-15T10:00:00.000Z' }] } } };
  const inc = Backup.parse(JSON.stringify(Backup.build(store([mine[0], sheetAt(1, 'Priya')]))));
  const m = Backup.merge(cur, inc);
  assert.equal(m.added, 1);
  assert.equal(m.skipped, 1);
  assert.equal(m.dropped, 0);
  assert.deepEqual(m.history.map((h) => h.name), ['Priya', 'Ravi', 'Old'], 'newest first');
  assert.deepEqual(Object.keys(m.write), [inc.history.find((h) => h.name === 'Priya').id]);
  assert.equal(m.drills[mine[0].id].q1.length, 1, 'existing drills are kept');

  const small = Backup.merge(cur, inc, 2);
  assert.equal(small.dropped, 1);
  assert.deepEqual(small.remove, [mine[1].id], "this browser's oldest interview makes room");
});

test('drill attempts merge without duplicates and keep the last five', () => {
  const a = sheetAt(1, 'Ravi');
  const at = (d) => '2026-10-1' + d + 'T10:00:00.000Z';
  const cur = { history: [Backup.entryOf(a)], drills: { [a.id]: { q1: [{ at: at(1) }, { at: at(2) }] } } };
  const inc = { history: [Backup.entryOf(a)], sheets: { [a.id]: a }, drills: { [a.id]: { q1: [2, 3, 4, 5, 6].map((d) => ({ at: at(d) })), q2: [{ at: at(3) }] } } };
  const m = Backup.merge(cur, inc);
  assert.deepEqual(m.drills[a.id].q1.map((x) => x.at), [2, 3, 4, 5, 6].map(at));
  assert.equal(m.drills[a.id].q2.length, 1);
});

test('CSV: one row per interview, every skill a column, safe for spreadsheets', () => {
  const a = sheetAt(2, 'Ravi');
  const b = sheetAt(1, '=HYPERLINK("http://x"), "Kumar"');
  const { history, sheets } = store([a, b]);
  const csv = Backup.toCsv(history, sheets);
  assert.ok(csv.startsWith('﻿'), 'Excel reads UTF-8 names');
  const lines = csv.slice(1).trim().split('\r\n');
  assert.equal(lines.length, 3);
  const head = lines[0].split(',');
  assert.equal(head[0], 'Date');
  for (const d of a.dimensions) assert.ok(head.includes(d.short), 'has a column for ' + d.short);
  assert.ok(lines[1].includes('"\'=HYPERLINK(""http://x""), ""Kumar"""'), 'formulas stay text and quotes are escaped');
  assert.ok(lines[2].startsWith('2026-10-16 10:00,Ravi,Customer service,'), lines[2]);
  assert.ok(lines[2].includes(',' + a.overall + ','));
});

test('CSV works from history entries alone', () => {
  const csv = Backup.toCsv([{ id: 'x', name: 'Asha', role: 'Voice', overall: 61, verdict: 'Recommended', track: 'bpo', dims: { communication: 60 }, createdAt: '2026-10-01T09:00:00.000Z' }], {});
  assert.match(csv, /communication/);
  assert.match(csv, /2026-10-01 09:00,Asha,Customer service,Voice,,,,61,Recommended,/);
});

test('file name slugs', () => {
  assert.equal(Backup.slug('Ravi Kumar (sample)'), 'ravi-kumar-sample');
  assert.equal(Backup.slug('***'), 'candidate');
});
