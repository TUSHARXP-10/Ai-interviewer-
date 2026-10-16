'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Text = require('../js/textUtils.js');
const Analyzer = require('../js/analyzer.js');
const Scoring = require('../js/scoring.js');
const { runScripted } = require('../js/demo.js');

globalThis.AII = { Text, Analyzer, Scoring };
require('../js/report.js'); // browser module: registers globalThis.AII.Report
const { Report } = globalThis.AII;

const inc = (id, kind, severity, extra) => Object.assign({ id, kind, severity, label: kind, at: id * 30000, q: id }, extra);
const proctored = (p) => runScripted('strong', { length: 'standard', proctoring: Object.assign({ incidents: [], strikes: 0, terminated: false, stats: { faceVisiblePct: 99, eyesOnPct: 94, awaySec: 3 } }, p) }).sheet;

test('a clean proctored interview keeps its verdict', () => {
  const sheet = proctored({});
  assert.equal(sheet.proctoring.rating.key, 'clean');
  assert.equal(sheet.verdict.key, runScripted('strong', { length: 'standard' }).sheet.verdict.key);
});

test('a confirmed phone or another person is high risk, and is never recommended', () => {
  for (const kind of ['phone', 'extra']) {
    const sheet = proctored({ incidents: [inc(1, kind, 'serious', { strike: 1 })], strikes: 1 });
    assert.equal(sheet.proctoring.rating.key, 'high', kind);
    assert.equal(sheet.verdict.key, 'no', kind + ': capped');
    assert.ok(sheet.overall >= 66, 'the answers themselves still scored well');
    assert.match(sheet.summary, /High risk/);
  }
});

test('three warnings (the interview ended) are high risk too', () => {
  const sheet = proctored({ incidents: [inc(1, 'away', 'serious'), inc(2, 'noFace', 'serious'), inc(3, 'tab', 'serious')], strikes: 3, terminated: true });
  assert.equal(sheet.proctoring.rating.key, 'high');
  assert.equal(sheet.terminated, true);
});

test('a warning, several notes, eyes often away, or a second screen need a review', () => {
  assert.equal(proctored({ incidents: [inc(1, 'away', 'serious', { strike: 1 })], strikes: 1 }).proctoring.rating.key, 'review');
  assert.equal(proctored({ incidents: [inc(1, 'away', 'minor'), inc(2, 'glances', 'minor'), inc(3, 'noFace', 'minor')] }).proctoring.rating.key, 'review');
  assert.equal(proctored({ stats: { faceVisiblePct: 95, eyesOnPct: 61, awaySec: 140 } }).proctoring.rating.key, 'review');
  assert.equal(proctored({ secondScreen: true }).proctoring.rating.key, 'review');
  // ...but they do not cap the verdict.
  assert.notEqual(proctored({ secondScreen: true }).verdict.key, 'no');
  // One or two short notes are normal.
  assert.equal(proctored({ incidents: [inc(1, 'away', 'minor')] }).proctoring.rating.key, 'clean');
});

test('the scoresheet shows the rating, the incident timeline and the evidence photos', () => {
  const sheet = proctored({
    incidents: [inc(1, 'away', 'minor', { label: 'Looking away from the screen', direction: 'down', durationMs: 4200 }),
      inc(2, 'phone', 'serious', { label: 'Phone visible', strike: 1, durationMs: 3000 })],
    strikes: 1,
  });
  const html = Report.render(sheet, { photos: new Map([[2, 'blob:evidence-2']]) });
  assert.match(html, /Integrity: High risk/);
  assert.match(html, /id="proctoring"/);
  assert.equal((html.match(/<li class="pi /g) || []).length, 2);
  assert.match(html, /Looking away from the screen \(down\)/);
  assert.match(html, /Warning 1 of 3/);
  assert.match(html, /<img src="blob:evidence-2"/);
  // Interviews from before proctoring (and samples) have no proctoring card.
  assert.doesNotMatch(Report.render(runScripted('strong', { length: 'standard' }).sheet, {}), /id="proctoring"/);
});
