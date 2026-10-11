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

test('the transcript shows every question with its answer, or why there is none', () => {
  const { sheet } = runScripted('average', { length: 'standard' });
  const plain = sheet.questions.map((q, i) => i).filter((i) => !sheet.questions[i].turns && sheet.questions[i].type !== 'listening');
  const [skippedAt, slipAt] = plain;
  Object.assign(sheet.questions[skippedAt], { answer: '', skipped: true, events: { skipped: true } });
  sheet.questions[slipAt].answer = 'Myself Ravi and I am having two years experience in sales.';
  const clips = new Map([[sheet.questions[skippedAt].id, [{ label: 'Answer', url: 'blob:answer', file: 'q01-answer.webm' }]]]);

  const html = Report.render(sheet, { clips });
  const items = html.split('<li class="tr-item"').slice(1);
  assert.equal(items.length, sheet.questions.length, 'one transcript entry per question');
  items.forEach((it, i) => assert.match(it, /<span class="tr-who">You<\/span>/, 'Q' + (i + 1) + ' shows what was said'));

  // An answer the engine could not read still offers the recording.
  assert.match(items[skippedAt], /No words were recognised/);
  assert.match(items[skippedAt], /src="blob:answer"/);
  // Grammar slips are marked in the caption and corrected below it.
  assert.match(items[slipAt], /class="hl hl-grammar"/);
  assert.match(items[slipAt], /Grammar<\/span> “I am having two years” → <strong>I have … experience<\/strong>/);
  // The breakdown points to the transcript instead of repeating the words.
  assert.match(html, /<a href="#tr-q1">/);
});
