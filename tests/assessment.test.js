'use strict';
/* The 4-round assessment: intro, why BPO, a random-word talk and a live customer call. */
const test = require('node:test');
const assert = require('node:assert/strict');
const CallSim = require('../js/callsim.js');
const Content = require('../js/callContent.js');
const Engine = require('../js/engine.js');
const Scoring = require('../js/scoring.js');

const GOOD = (sc) => [
  'Thank you for calling ' + sc.company + ', my name is Riya. I am really sorry about this, I completely understand. May I have your reference number please?',
  'Thank you, I have checked it. I have raised a request to fix this right now and it will be done within 24 hours. Your reference number is 4417.',
  'I completely understand your concern. I will personally make sure it is done and you will get an SMS update.',
  'Is there anything else I can help you with? Thank you for your patience, have a great day.',
];

function talk(call, lines) {
  call.opening();
  for (const l of lines) if (call.reply(l).done) break;
  return call.summary();
}

test('every customer line reads cleanly for every problem and mood', () => {
  for (const sc of Content.SCENARIOS) {
    for (const p of Content.PERSONAS) {
      for (const [key, lines] of Object.entries(p.lines)) {
        for (const l of lines) {
          const out = CallSim.fill(l, { issue: sc.issue, issueShort: sc.issueShort, stakes: sc.stakes, detail: sc.detail, fixAsk: sc.fixAsk, curveball: sc.curveballs[0] });
          assert.ok(!/\{|\}|[.!?,]{2}|\s[,.]/.test(out), p.id + '.' + key + ': ' + out);
        }
      }
    }
  }
});

test('a good agent calms every kind of customer down and resolves the call', () => {
  for (const sc of Content.SCENARIOS) {
    for (const p of Content.PERSONAS) {
      const s = talk(CallSim.createCall({ scenarioId: sc.id, personaId: p.id, random: () => 0.4 }), GOOD(sc));
      assert.equal(s.endedBy, 'resolved', sc.id + '/' + p.id);
      assert.ok(s.moodEnd < s.moodStart && s.moodEnd <= 30, sc.id + '/' + p.id + ' mood ' + s.moodEnd);
    }
  }
});

test('rudeness, vague promises and hanging up make the customer angrier', () => {
  const rude = talk(CallSim.createCall({ scenarioId: 'double_charge', personaId: 'aggressive', random: () => 0.4 }), ['hello', 'you should have checked first, it is not my problem', 'calm down sir']);
  assert.equal(rude.endedBy, 'hangup');
  const vague = talk(CallSim.createCall({ scenarioId: 'double_charge', personaId: 'polite', random: () => 0.4 }), ['hello sir sorry', 'okay i will check', 'it will be resolved soon please wait', 'please wait sir']);
  assert.ok(vague.moodEnd > 40 && !vague.resolved, 'vague ' + vague.moodEnd);
  const bye = talk(CallSim.createCall({ scenarioId: 'double_charge', personaId: 'polite', random: () => 0.4 }), ['hello sir', 'okay bye']);
  assert.equal(bye.endedBy, 'unresolved');
});

test('the call ends at about three minutes', () => {
  const call = CallSim.createCall({ scenarioId: 'double_charge', personaId: 'anxious', random: () => 0.4 });
  call.opening();
  const r1 = call.reply('hello', { elapsedMs: 20000 });
  assert.equal(r1.done, false);
  const r2 = call.reply('one moment please let me see', { elapsedMs: 185000 });
  assert.equal(r2.done, true);
  assert.equal(call.summary().endedBy, 'time');
});

test('the assessment has four rounds, and every session gets its own word and caller', () => {
  const plans = [3, 4, 5, 6, 7, 8].map((seed) => Engine.createSession({ length: 'assessment', role: 'voice', mode: 'voice', seed }));
  for (const s of plans) {
    assert.equal(s.total, 4);
    const ids = s.plan.map((q) => q.id);
    assert.match(ids[0], /^intro/);
    assert.deepEqual(ids.slice(1), ['why_bpo', 'topic_talk', 'live_call']);
    const step = s.current();
    assert.deepEqual([step.round.n, step.round.of, step.round.title], [1, 4, 'Introduction']);
  }
  const words = new Set();
  const callers = new Set();
  for (let seed = 1; seed <= 30; seed++) {
    const s = Engine.createSession({ length: 'assessment', role: 'voice', mode: 'voice', seed });
    for (let i = 0; i < 3; i++) s.submit({ text: 'I would like to answer this properly with an example.', mode: 'voice', timing: {}, events: {} });
    const call = s.current();
    assert.ok(call.call && call.call.customerName && call.call.persona, 'caller card data');
    callers.add(call.call.scenario + '/' + call.call.persona);
    words.add(s.plan.find((q) => q.slot === 'topic') ? 'x' : '');
  }
  assert.ok(callers.size >= 15, 'calls differ: ' + callers.size);
  const topicWords = new Set();
  for (let seed = 1; seed <= 20; seed++) {
    const s = Engine.createSession({ length: 'assessment', role: 'voice', mode: 'voice', seed });
    s.submit({ text: 'Hello, I am Riya.', mode: 'voice', timing: {}, events: {} });
    s.submit({ text: 'I enjoy helping people.', mode: 'voice', timing: {}, events: {} });
    topicWords.add(s.current().topic.word);
  }
  assert.ok(topicWords.size >= 10, 'words differ: ' + topicWords.size);
});

function runAssessment(lines) {
  const s = Engine.createSession({ length: 'assessment', role: 'voice', mode: 'voice', seed: 5, name: 'Riya Kapoor', topicWord: 'Patience' });
  let step = s.current();
  let i = 0;
  while (step && i < 20) {
    const t = lines[Math.min(i++, lines.length - 1)];
    const r = s.submit({ text: t, mode: 'voice', timing: { latencyMs: 1200, speakingMs: Math.max(3000, (t.split(' ').length / 2.3) * 1000) }, audio: null, events: {} });
    step = r.done ? null : r.step;
  }
  return Scoring.buildScoresheet({ candidate: { name: 'Riya Kapoor', role: 'voice' }, config: { length: 'assessment', mode: 'voice' }, items: s.results(), startedAt: 0, endedAt: 700000 });
}

test('the assessment separates a great, an average and a weak candidate, round by round', () => {
  const great = runAssessment([
    'Good morning. I am Riya Kapoor from Pune. I completed my bachelor of commerce in 2024 and then worked for eight months at a mobile store, where I handled around thirty customers a day, mostly billing questions and returns. As a person I am calm and patient, and on weekends I teach maths to two kids in my building.',
    'Honestly, I want to work in a BPO because I enjoy solving problems for people. At the store, one customer came in upset because his phone data was not transferring, and I sat with him for thirty minutes until it worked. He came back a month later and asked for me. That is why I want this job, and I also want to grow into a training role.',
    'Patience, for me, means staying calm and kind when things do not go my way. First, patience is a skill, not a gift. For example, last year my grandmother was in hospital and we waited for hours for reports; I learned to keep my family calm by explaining each step. Second, patience matters at work, because a customer who is shouting is usually just worried, and if I stay patient I can actually solve the problem. Another thing is that patience helps with learning; when I learned Excel I failed many times, but I kept practising every evening for a month. Apart from that, patience makes relationships better, because people feel heard. So overall, patience turns a difficult moment into a solved problem, and that is why I value it.',
    ...GOOD({ company: 'the company' }),
  ]);
  const weak = runAssessment(['my name is ramesh i am from bhopal', 'i need job sir', 'it is good', 'hello tell me', 'sir wait i will check', 'sir it will be done soon', 'okay bye']);
  assert.ok(great.overall >= 80, 'great ' + great.overall);
  assert.ok(weak.overall < 30, 'weak ' + weak.overall);
  assert.equal(great.rounds.length, 4);
  assert.deepEqual(great.rounds.map((r) => r.title), ['Introduction', 'Why BPO', 'Topic talk', 'Live call']);
  assert.ok(great.rounds.every((r, i) => r.score > weak.rounds[i].score), 'every round better');
  assert.ok(great.rounds[3].notes.join(' ').includes('resolved'));
  const callWhy = great.dimensions.find((d) => d.key === 'customer').why.map((l) => l.text).join(' ');
  assert.match(callWhy, /Live call with an? \w+ customer/);
});
