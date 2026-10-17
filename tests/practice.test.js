'use strict';
// Practice drills and model answers: answer one question again, then compare.
const test = require('node:test');
const assert = require('node:assert/strict');
const Text = require('../js/textUtils.js');
const Analyzer = require('../js/analyzer.js');
const Scoring = require('../js/scoring.js');
const Engine = require('../js/engine.js');
const Q = require('../js/questionBank.js');
const Demo = require('../js/demo.js');

globalThis.AII = { Text, Analyzer, Scoring, Demo };
require('../js/report.js'); // browser module: registers globalThis.AII.Report
const { Report } = globalThis.AII;

test('a drill session asks exactly the chosen question, then wraps up', () => {
  const s = Engine.createSession({ role: 'python', experience: 'fresher', company: 'uber', only: ['tech_why_company'], mode: 'voice', name: 'Ravi', seed: 2 });
  assert.equal(s.total, 1);
  const step = s.current();
  assert.equal(step.questionId, 'tech_why_company');
  assert.match(step.prompt, /Uber/);
  assert.match(step.prompt, /Python/);
  assert.equal(step.round, null, 'a drill has no rounds');
  // At most one follow-up, then the comparison.
  let res = s.submit({ text: 'Money.', mode: 'voice', events: {} });
  let followUps = 0;
  while (!res.done) {
    followUps++;
    res = s.submit({ text: 'I like the scale of the product and the engineering culture, and I want to grow there.', mode: 'voice', events: {} });
  }
  assert.ok(followUps <= 1, 'one follow-up at most');
  assert.match(res.speak[0].text, /compares with last time/);
});

test('a drill works for BPO questions too, and for unknown ids returns nothing to ask', () => {
  const s = Engine.createSession({ role: 'voice', experience: 'fresher', only: ['handle_angry'], mode: 'voice', seed: 1 });
  assert.equal(s.current().questionId, 'handle_angry');
  assert.deepEqual(Q.buildPlan({ role: 'voice', only: ['no_such_question'] }), []);
});

test('model answers exist for the scripted questions, and are strong', () => {
  assert.equal(Demo.modelAnswer('no_such_question'), null);
  const ids = ['handle_angry', 'why_bpo', 'dsa_two_sum', 'fs_react_state', 'tech_project_walk'];
  for (const id of ids) {
    const text = Demo.modelAnswer(id);
    assert.ok(text && text.split(/\s+/).length >= 30, id);
    const a = Analyzer.analyzeAnswer(Q.byId[id], { text, mode: 'text', events: {} });
    assert.ok(a.quality >= 70, id + ' model answer quality ' + a.quality);
  }
});

test('the scoresheet offers a practice plan, model answers and practise buttons', () => {
  const { sheet } = Demo.runScripted('average', { length: 'standard', seed: 3 });
  const plain = Report.render(sheet, {});
  assert.doesNotMatch(plain, /id="rep-practice"/, 'no practice plan without speech recognition');
  assert.doesNotMatch(plain, /data-drill=/);

  const weakest = sheet.questions.slice().sort((a, b) => (a.skipped ? -1 : a.quality) - (b.skipped ? -1 : b.quality))[0];
  const html = Report.render(sheet, { canDrill: true, drills: { [weakest.id]: [{ quality: 91 }, { quality: 77 }] } });
  const card = html.split('id="rep-practice"')[1].split('</section>')[0];
  assert.equal((card.match(/<li>/g) || []).length, 3, 'three questions to practise');
  assert.ok(card.indexOf('data-drill="' + weakest.id + '"') > -1, 'the weakest answer comes first');
  assert.match(card, /Best practice score: 91 ↗/);
  assert.match(html, /class="qa-best"[^>]*>↗ 91</, 'the question shows its best practice score');
  assert.match(html, /data-say-model="handle_angry"|data-say-model="why_bpo"|data-say-model=/, 'model answers can be heard');
  assert.match(html, /<nav class="rep-nav/);
});
