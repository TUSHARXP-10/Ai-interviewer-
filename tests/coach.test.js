'use strict';
// Live coaching while answering: time against the target, pace and fillers.
const test = require('node:test');
const assert = require('node:assert/strict');
const Coach = require('../js/coach.js');
const Q = require('../js/questionBank.js');

const q = Q.byId.dsa_two_sum;
const words = (n) => 'word '.repeat(n).trim();

test('the target length comes from the question, rounded like a person would say it', () => {
  const t = Coach.target(q);
  assert.ok(t.minSec > 0 && t.maxSec > t.minSec);
  assert.equal(t.minSec % 5, 0);
  assert.equal(Coach.target({}), null);
});

test('it stays quiet until there is enough speech to judge', () => {
  const c = Coach.live({ text: 'So I would use a hash map', speakingMs: 3000, question: q });
  assert.equal(c.pace, null, 'no pace from a few words');
  assert.equal(c.time.tone, 'neutral', 'not yet in the target range');
  assert.equal(c.tip, null);
});

test('pace, fillers and time each get one clear tip', () => {
  const fast = Coach.live({ text: words(60), speakingMs: 15000, question: q });
  assert.equal(fast.pace.tone, 'warn');
  assert.match(fast.tip, /Slow down/);

  const good = Coach.live({ text: words(40), speakingMs: 20000, question: q });
  assert.equal(good.pace.label, 'Good pace');
  assert.equal(good.time.tone, 'good');
  assert.equal(good.tip, null);

  const fillers = Coach.live({ text: 'basically we um do the thing, you know, and actually it works, I mean basically yes, like you know '.repeat(2), speakingMs: 20000, question: q });
  assert.ok(fillers.fillers.count >= 3);
  assert.equal(fillers.fillers.tone, 'warn');
  assert.match(fillers.tip, /pause instead of a filler/);

  const long = Coach.live({ text: words(260), speakingMs: 130000, question: q });
  assert.equal(long.time.tone, 'warn');
  assert.match(long.tip, /wrap up/);
});

test('engineering problems and designs get the approach checklist', () => {
  const Demo = require('../js/demo.js');
  assert.equal(Coach.approachKind(Q.byId.dsa_two_sum), 'problem');
  assert.equal(Coach.approachKind(Q.byId.design_url_shortener), 'design');
  assert.equal(Coach.approachKind(Q.byId.fs_rest), null);
  assert.equal(Coach.approachKind(Q.byId.data_sql_window), null, 'SQL problems are not algorithm problems');
  assert.equal(Coach.approach(Q.byId.fs_rest, 'anything'), null);

  const model = Coach.approach(Q.byId.dsa_two_sum, Demo.modelAnswer('dsa_two_sum'));
  assert.ok(model.every((s) => s.hit), 'the model answer walks through every step');
  const brute = Coach.approach(Q.byId.dsa_two_sum, 'I will use two loops and return the pair.');
  assert.deepEqual(brute.filter((s) => s.hit).map((s) => s.id), ['simple']);

  // On the scoresheet: per question, and a line on what was missing.
  const Scoring = require('../js/scoring.js');
  const { sheet } = Demo.runScripted('engineer', { role: 'backend', experience: 'experienced', company: 'google', length: 'standard', seed: 5 });
  const problems = sheet.questions.filter((x) => Coach.approachKind(Q.byId[x.id]) === 'problem');
  assert.ok(problems.length && problems.every((x) => Array.isArray(x.approach)), 'problem questions carry their checklist');
  assert.ok(Scoring.DIMENSIONS.some((d) => d.key === 'technical'));
});
