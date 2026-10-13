'use strict';
/*
 * The scorer against recruiter judgement: thirty full mock interviews, each rated blind by
 * two senior BPO recruiters (tests/fixtures/recruiter-calibration.json). A great interview
 * must score like one, and poor communication or a bad attitude must not pass as a hire.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../js/engine.js');
const Scoring = require('../js/scoring.js');
const Analyzer = require('../js/analyzer.js');
const Questions = require('../js/questionBank.js');
const FIXTURE = require('./fixtures/recruiter-calibration.json');

const words = (t) => (String(t).match(/[a-z0-9']+/gi) || []).length;

function interview(c, seed) {
  const session = Engine.createSession({ length: 'standard', role: 'voice', experience: 'fresher', mode: 'voice', seed, maxFollowUps: 0 });
  let step = session.current();
  while (step) {
    const text = step.kind === 'roleplay' ? c.roleplay[step.turn] || '' : c.answers[step.questionId] || '';
    const speakingMs = (words(text) / c.voice.wpm) * 60000;
    const res = session.submit({
      text,
      mode: 'voice',
      timing: { latencyMs: c.voice.latencyMs, speakingMs, totalMs: speakingMs + c.voice.latencyMs },
      audio: Object.assign({ onsetMs: c.voice.latencyMs }, c.voice.audio),
      events: { skipped: !text },
    });
    step = res.done ? null : res.step;
  }
  return Scoring.buildScoresheet({
    candidate: { name: 'Candidate ' + c.id, role: 'voice', experience: 'fresher' },
    config: { length: 'standard', mode: 'voice' },
    items: session.results(),
    startedAt: 0,
    endedAt: 1800000,
  });
}

const rows = [];
for (const set of FIXTURE.sets) for (const c of set.candidates) rows.push({ c, judge: c.judge, sheet: interview(c, set.seed) });

function ranks(values) {
  const order = values.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const r = new Array(values.length);
  order.forEach(([, i], k) => { r[i] = k; });
  return r;
}
function spearman(a, b) {
  const ra = ranks(a);
  const rb = ranks(b);
  const n = a.length;
  const d2 = ra.reduce((s, x, i) => s + (x - rb[i]) ** 2, 0);
  return 1 - (6 * d2) / (n * (n * n - 1));
}

test('overall scores track blind recruiter ratings', () => {
  const err = rows.map((r) => r.sheet.overall - r.judge.overall);
  const rmse = Math.sqrt(err.reduce((s, e) => s + e * e, 0) / err.length);
  const rho = spearman(rows.map((r) => r.sheet.overall), rows.map((r) => r.judge.overall));
  assert.ok(rmse <= 11, 'average error ' + rmse.toFixed(1));
  assert.ok(rho >= 0.85, 'rank agreement ' + rho.toFixed(2));
  for (const r of rows) assert.ok(Math.abs(r.sheet.overall - r.judge.overall) <= 25, r.c.id + ' ' + r.sheet.overall + ' vs ' + r.judge.overall);
});

test('skill scores track the recruiters too', () => {
  for (const key of ['communication', 'relevance', 'thought', 'language']) {
    const pairs = rows.map((r) => [r.sheet.dimensions.find((d) => d.key === key).score, r.judge[key]]).filter((p) => p[0] != null);
    const rmse = Math.sqrt(pairs.reduce((s, [a, b]) => s + (a - b) ** 2, 0) / pairs.length);
    assert.ok(rmse <= 16, key + ' error ' + rmse.toFixed(1));
  }
});

test('great interviews score like great interviews', () => {
  for (const r of rows.filter((x) => x.judge.overall >= 85)) {
    assert.ok(r.sheet.overall >= 82, r.c.id + ' ' + r.sheet.overall);
    assert.equal(r.sheet.verdict.key, 'strong', r.c.id);
  }
});

test('poor communication or a bad attitude never passes as a hire', () => {
  for (const r of rows.filter((x) => x.judge.overall < 40)) {
    assert.ok(r.sheet.overall < 50, r.c.id + ' ' + r.sheet.overall);
    assert.equal(r.sheet.verdict.key, 'no', r.c.id);
  }
  for (const r of rows.filter((x) => x.judge.communication < 35)) {
    assert.ok(r.sheet.overall < 50, r.c.id + ' communicates poorly but scored ' + r.sheet.overall);
    assert.ok(['no', 'borderline'].includes(r.sheet.verdict.key), r.c.id + ' ' + r.sheet.verdict.key);
  }
});

test('the full range of the scale is used', () => {
  const s = rows.map((r) => r.sheet.overall);
  assert.ok(Math.max(...s) >= 88, 'top ' + Math.max(...s));
  assert.ok(Math.min(...s) <= 20, 'bottom ' + Math.min(...s));
});

test('explanations only state what happened in the interview', () => {
  for (const r of rows) {
    const sh = r.sheet;
    for (const d of sh.dimensions) {
      assert.ok(Array.isArray(d.why), d.key);
      for (const l of d.why) assert.ok(['good', 'bad', 'info'].includes(l.tone) && l.text.length > 10, d.key + ': ' + l.text);
    }
    // A strength is only claimed for a skill at hiring level, and every one is backed by evidence.
    for (const s of sh.strengths) {
      const m = s.match(/\((\d+)\)/);
      if (/^No area reached/.test(s)) continue;
      assert.ok(m && (Number(m[1]) >= 70 || /^Best area/.test(s)), s);
    }
    assert.ok(sh.improvements.length >= 1, r.c.id);
    assert.ok(sh.summary.includes(sh.overall + '/100'), sh.summary);
    // Every quote in the summary or the reasons is something the candidate actually said
    // (or a measured phrase): quoted text must appear in the transcript or the checklist.
    const asked = sh.questions.map((x) => (x.display || x.text) + ' ' + (x.correction ? x.correction.correct : ''));
    const said = Object.values(r.c.answers).concat(r.c.roleplay, asked).join(' ').toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ');
    for (const d of sh.dimensions) for (const l of d.why) {
      for (const q of l.text.match(/“[^”]{12,}”/g) || []) {
        const body = q.slice(1, -1).replace(/…$/, '').replace(/[’‘]/g, "'").toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();
        const known = /^(that s a good question|i think|maybe|a|the)\b/.test(body) || /→/.test(l.text);
        if (!known && /said|e\.g\.|answer|call|stock|asked|reasons|down|shifts/i.test(l.text)) {
          assert.ok(said.includes(body.split(' ').slice(0, 5).join(' ')), r.c.id + ' quote not in transcript: ' + q);
        }
      }
    }
  }
});

test('grammar slips are caught without flagging fluent English', () => {
  const q = Questions.byId.intro_tell_me;
  const slips = (t) => Analyzer.analyzeAnswer(q, { text: t, mode: 'voice', timing: {}, events: {} }).metrics.grammar.length;
  for (const bad of [
    'he say the salary is good', 'i am complete my graduation', 'i want buy a house for my family', 'i listen his problem first',
    'my neighbour bike was not starting', 'then the bike is start', 'please do not angry sir', 'it was charged two time',
    'i am searching job', 'i am fresher', 'i did diploma in mechanical', 'i have did my ba', 'they was very happy',
  ]) assert.ok(slips(bad) >= 1, bad);
  for (const good of [
    'i fixed my friend\'s laptop last year', 'first i would let the customer speak without interrupting', 'a company like amazon wins on service',
    'my father works in a bank and my mother is a teacher', 'i completed a six month internship at a telecom company', 'each of the agents has a headset',
    'the customer wants a refund and i would make the customer feel heard', 'i want to grow into a team leader role', 'i have two years of experience',
  ]) assert.equal(slips(good), 0, good);
});
