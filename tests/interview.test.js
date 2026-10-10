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

test('the spoken debrief is short, speakable and specific', () => {
  const { sheet } = runInterview('average', {});
  const text = Scoring.spokenFeedback(sheet);
  assert.match(text, /You scored \d+ out of 100/);
  assert.match(text, /strongest area/);
  assert.ok(!/[→“”×]|\/100/.test(text), text);
  assert.ok(text.split(/\s+/).length < 110, 'keep it under a minute of speech');
  assert.equal(Scoring.speakable('Cut fillers (“um” ×3) → pause, e.g. 120 wpm, 76/100'), 'Cut fillers, then pause, for example, 120 words per minute, 76 out of 100');
});

test('the spoken briefing explains the hands-free commands', () => {
  const s = Engine.createSession({ length: 'quick', role: 'voice', mode: 'voice', seed: 2 });
  const b = s.briefing();
  assert.match(b, /7 questions/);
  assert.match(b, /8 to 10 minutes/);
  assert.match(b, /say repeat/);
  assert.match(b, /that's all/);
});

test('the briefing matches how answers end', () => {
  const s = Engine.createSession({ length: 'quick', role: 'voice', mode: 'voice', seed: 2 });
  assert.match(s.briefing({ pauseEnds: true }), /simply pause/);
  const manual = s.briefing({ pauseEnds: false });
  assert.ok(!/simply pause/.test(manual));
  assert.match(manual, /that's all, or press I'm done/);
});

test('spoken feedback only promises recordings that exist', () => {
  const { sheet } = runInterview('strong', { length: 'quick' });
  assert.match(Scoring.spokenFeedback(sheet), /replay each of your answers/);
  assert.ok(!/replay/.test(Scoring.spokenFeedback(sheet, { recordings: false })));
});

test('a click picked up by the mic never turns audio stats into NaN', () => {
  const s = Engine.createSession({ length: 'quick', role: 'voice', mode: 'voice', seed: 1, maxFollowUps: 1 });
  s.current();
  const full = { voicedFrames: 200, onsetMs: 300, longPauses: 1, longestPauseMs: 2100, snrDb: 18, trailOffDb: 2, voicedRatio: 0.7, pitchFrames: 80, pitchSdSemitones: 2.4 };
  let res = s.submit({ text: 'I am Sam.', mode: 'voice', timing: { latencyMs: 900, speakingMs: 1500 }, audio: full, events: {} });
  assert.equal(res.step.kind, 'followup');
  s.submit({ text: '', mode: 'voice', timing: {}, audio: { voicedFrames: 2, onsetMs: null }, events: { skipped: true } });
  const audio = s.results()[0].response.audio;
  for (const k of ['longPauses', 'snrDb', 'voicedRatio', 'longestPauseMs']) assert.ok(Number.isFinite(audio[k]), k);
});

test('follow-ups that already thank the candidate get no second "Thanks."', () => {
  for (let seed = 1; seed < 40; seed++) {
    const s = Engine.createSession({ length: 'quick', role: 'voice', mode: 'text', seed });
    s.current();
    const res = s.submit(text('I am Sam.'));
    if (res.step.kind !== 'followup') continue;
    const spoken = res.step.speak[0].text;
    assert.doesNotMatch(spoken, /^(Thanks|Okay|I see|Alright)\. (Thank|Thanks|That's a good)/, spoken);
  }
});

test('skipping the last question does not say "let\'s move on" before the goodbye', () => {
  const s = Engine.createSession({ length: 'quick', role: 'voice', mode: 'text', seed: 4, maxFollowUps: 0 });
  let res = { step: s.current() };
  while (!res.done) {
    const last = s.index === s.total - 1;
    res = s.submit(last ? { text: '', mode: 'text', events: { skipped: true } } : text('I would stay calm, listen, apologise and help the customer with a refund.'));
  }
  assert.doesNotMatch(res.speak[0].text, /move on|next one/i, res.speak[0].text);
  assert.match(res.speak[0].text, /end of the interview/);
});
