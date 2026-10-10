'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../js/engine.js');
const Scoring = require('../js/scoring.js');
const Q = require('../js/questionBank.js');
const { runScripted: runInterview, PROFILES } = require('../js/demo.js');

const text = (t) => ({ text: t, mode: 'text', events: {} });

test('plans pick role- and experience-appropriate questions', () => {
  for (const length of Object.keys(Q.PLANS)) {
    for (const role of Object.keys(Q.ROLES)) {
      for (const experience of ['fresher', 'experienced']) {
        const plan = Q.buildPlan({ length, role, experience, random: () => 0.5 });
        assert.ok(plan.length >= Q.PLANS[length].slots.length - 1, length + role + experience);
        assert.equal(new Set(plan.map((q) => q.id)).size, plan.length, 'no duplicates');
        for (const q of plan) assert.ok(Q.eligible(q, role, experience), q.id);
        const rp = plan.find((q) => q.type === 'roleplay');
        assert.ok(rp, 'every plan has a mock call');
        if (role === 'sales') assert.equal(rp.id, 'roleplay_sales');
        if (role === 'tech') assert.equal(rp.id, 'roleplay_internet');
      }
    }
  }
});

test('every question has a usable rubric', () => {
  for (const q of Q.QUESTIONS) {
    assert.ok(q.text && q.tip, q.id);
    assert.ok(q.dims && Object.keys(q.dims).length, q.id);
    const [lo, hi] = q.ideal;
    assert.ok(q.minWords < lo && lo < hi, q.id);
    if (['open', 'motivation', 'knowledge', 'situational', 'behavioral', 'self', 'extempore', 'salary'].includes(q.type)) {
      assert.ok(q.concepts && q.concepts.length >= 2, q.id + ' needs concepts');
    }
    for (const fu of q.followUps || []) {
      if (fu.when.startsWith('missing:')) assert.ok(q.concepts.some((c) => c.id === fu.when.slice(8)), q.id + ' ' + fu.when);
    }
  }
});

test('a short answer triggers a follow-up, and follow-ups are capped', () => {
  const s = Engine.createSession({ length: 'quick', role: 'voice', mode: 'text', seed: 1 });
  assert.match(s.opening(), /welcome/i);
  let step = s.current();
  assert.equal(step.kind, 'question');
  let res = s.submit(text('I am Sam.'));
  assert.equal(res.step.kind, 'followup');
  res = s.submit(text('I studied commerce and I like helping people.'));
  assert.equal(res.step.kind, 'question');
  assert.notEqual(res.step.questionId, step.questionId);

  // With the cap reached, short answers no longer trigger follow-ups.
  const capped = Engine.createSession({ length: 'quick', role: 'voice', mode: 'text', seed: 1, maxFollowUps: 0 });
  capped.current();
  assert.equal(capped.submit(text('I am Sam.')).step.kind, 'question');
});

test('the mock customer reacts to what the candidate says', () => {
  const run = (firstReply) => {
    const s = Engine.createSession({ length: 'quick', role: 'voice', mode: 'text', seed: 3, maxFollowUps: 0 });
    let step = s.current();
    while (step.kind !== 'roleplay') step = s.submit(text('I would stay calm, listen, apologise and help the customer with a refund.')).step;
    assert.equal(step.speak[step.speak.length - 1].voice, 'customer');
    return s.submit(text(firstReply)).step;
  };
  const calm = run('Thank you for calling. I am really sorry about this, I completely understand. May I have your order number?');
  const cold = run('What do you want?');
  assert.match(calm.prompt, /order number/i);
  assert.match(cold.prompt, /listening/i);
});

test('a full session runs to the end and produces a scoresheet', () => {
  const s = Engine.createSession({ length: 'standard', role: 'general', mode: 'text', seed: 9, name: 'Sam Lee' });
  let step = s.current();
  let guard = 0;
  let last;
  while (step && guard++ < 100) {
    last = s.submit(text('I would listen carefully, apologise, understand the problem and solve it, because customers deserve help. For example, at my last job I resolved twenty complaints a day.'));
    step = last.done ? null : last.step;
  }
  assert.ok(last.done);
  assert.match(last.speak[0].text, /end of the interview/);
  const sheet = Scoring.buildScoresheet({ candidate: { name: 'Sam Lee', role: 'general' }, config: { length: 'standard', mode: 'text' }, items: s.results(), startedAt: 0, endedAt: 600000 });
  assert.equal(sheet.questions.length, s.total);
  for (const d of sheet.dimensions) if (d.score != null) assert.ok(d.score >= 0 && d.score <= 100, d.key);
  assert.ok(sheet.summary.startsWith('Sam Lee completed'));
});

test('scripted candidates are ranked correctly with clear gaps', () => {
  for (const role of ['voice', 'sales', 'tech', 'nonvoice']) {
    const strong = runInterview('strong', { role }).sheet;
    const average = runInterview('average', { role }).sheet;
    const weak = runInterview('weak', { role }).sheet;
    assert.ok(strong.overall >= 85, role + ' strong ' + strong.overall);
    assert.ok(strong.overall - average.overall >= 8, role + ' strong vs average');
    assert.ok(average.overall - weak.overall >= 25, role + ' average vs weak');
    assert.ok(weak.overall < 50, role + ' weak ' + weak.overall);
    assert.equal(strong.verdict.key, 'strong');
    assert.equal(weak.verdict.key, 'no');
    assert.ok(weak.redFlags.length >= 1);
    assert.ok(strong.improvements.length >= 1, 'even strong candidates get a next step');
  }
});

test('typing mode scores without voice metrics', () => {
  const { sheet } = runInterview('strong', { mode: 'text', role: 'nonvoice' });
  assert.equal(sheet.speech.avgWpm, null);
  assert.ok(sheet.overall >= 85);
});

test('a hostile answer caps the verdict even when the rest is strong', () => {
  const s = Engine.createSession({ length: 'quick', role: 'voice', mode: 'text', seed: 5, maxFollowUps: 0 });
  const { sheet: base } = runInterview('strong', { length: 'quick', seed: 5 });
  const items = base.questions; // sanity: the strong run is a strong hire
  assert.equal(base.verdict.key, 'strong');
  assert.ok(items.length > 0);

  let step = s.current();
  while (step) {
    const isSituational = step.type === 'situational';
    const answer = isSituational
      ? 'Honestly if the customer shouts at me I will shout back and cut the call.'
      : PROFILES.strong.answers[step.questionId] || 'Thank you for calling, I am sorry, may I have your order number? I will refund it within 3 days. Anything else? Have a great day!';
    const res = s.submit(text(answer));
    step = res.done ? null : res.step;
  }
  const sheet = Scoring.buildScoresheet({ candidate: { name: 'X', role: 'voice' }, config: { length: 'quick', mode: 'text' }, items: s.results(), startedAt: 0, endedAt: 1 });
  assert.ok(sheet.redFlags.some((f) => f.severity === 'high'));
  assert.ok(['borderline', 'no'].includes(sheet.verdict.key), sheet.verdict.key);
});

test('local-LLM opinions are blended in, not substituted', () => {
  const run = runInterview('average', { length: 'quick' });
  const items = run.session.results();
  const withLlm = items.map((it) => Object.assign({}, it, { llm: { relevance: 0, thought: 0, communication: 0, confidence: 0, customer: 0, attitude: 0 } }));
  const a = Scoring.buildScoresheet({ candidate: { name: 'A', role: 'voice' }, config: { length: 'quick', mode: 'voice' }, items, startedAt: 0, endedAt: 1 });
  const b = Scoring.buildScoresheet({ candidate: { name: 'A', role: 'voice' }, config: { length: 'quick', mode: 'voice' }, items: withLlm, startedAt: 0, endedAt: 1 });
  assert.ok(b.overall < a.overall);
  assert.ok(b.overall > a.overall * 0.5, 'rule-based scores still dominate');
  assert.equal(b.llmUsed, true);
});
