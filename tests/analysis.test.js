'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Text = require('../js/textUtils.js');
const Analyzer = require('../js/analyzer.js');
const Q = require('../js/questionBank.js');

const analyze = (id, text, extra) => Analyzer.analyzeAnswer(Q.byId[id], Object.assign({ text, mode: 'text' }, extra));

test('normalises contractions and keeps a map back to the original tokens', () => {
  const doc = Text.makeDoc("I'm sure we can't, but she doesn't — it's fine. Can not!");
  assert.equal(doc.str, 'i am sure we cannot but she does not it is fine cannot');
  const hit = Text.findTerm(doc, 'does not')[0];
  assert.equal(doc.text.slice(doc.tokens[doc.wordToken[hit.w0]].start, doc.tokens[doc.wordToken[hit.w1]].end), "doesn't");
});

test('longest terms win and words are not double counted', () => {
  const doc = Text.makeDoc("I'm not sure, maybe.");
  const hits = Text.findTerms(doc, ['not sure', 'i am not sure', 'maybe']);
  assert.deepEqual(hits.map((h) => h.term), ['i am not sure', 'maybe']);
});

test('extracts spoken numbers in many forms', () => {
  const nums = (s) => Text.extractNumbers(Text.makeDoc(s));
  assert.ok(nums('order four five seven two please')[0].includes('4572'));
  assert.ok(nums('it is forty five seventy two')[0].includes('4572'));
  assert.ok(nums('4 5 7 2')[0].includes('4572'));
  assert.ok(nums('double five six')[0].includes('556'));
  assert.ok(nums('three hundred and fifty dollars')[0].includes('350'));
  assert.ok(nums('reference K749').includes('749'));
});

test('detects fillers, hedges and confident language', () => {
  const a = analyze('why_hire', 'Um, basically I think I can do this job, you know. I am confident and I have successfully handled fifty customers a day.');
  assert.ok(a.metrics.fillers.count >= 3);
  assert.ok(a.metrics.hedges.count >= 1);
  assert.ok(a.metrics.confident.count >= 2);
});

test('red flags respect negation', () => {
  const bad = analyze('handle_angry', 'If he keeps shouting I will just hang up the call.');
  assert.ok(bad.metrics.redFlags.some((f) => f.id === 'customer_hostility'));
  const fine = analyze('handle_angry', 'I would never hang up on a customer; I would stay calm and listen.');
  assert.ok(!fine.metrics.redFlags.some((f) => f.id === 'customer_hostility'));
  const ignored = analyze('abusive_customer', 'After two polite warnings I would disconnect the call as per policy.');
  assert.equal(ignored.metrics.redFlags.length, 0, 'abusive-customer question allows policy disconnects');
});

test('grammar coach catches common slips without obvious false positives', () => {
  const a = analyze('intro_tell_me', 'Hello sir, myself Rahul. I am having two years of experience since two years. Please revert back.');
  const wrongs = a.metrics.grammar.map((g) => g.wrong);
  assert.ok(wrongs.includes('Myself <name>'));
  assert.ok(wrongs.some((w) => /having/.test(w)));
  assert.ok(wrongs.includes('since <duration>'));
  assert.ok(wrongs.includes('revert back'));
  const clean = analyze('intro_tell_me', 'I did the whole project myself because nobody else was free. I have lived here since 2019, and I started three years ago.');
  assert.equal(clean.metrics.grammar.length, 0, JSON.stringify(clean.metrics.grammar));
});

test('listening test checks names, numbers and places', () => {
  const ok = analyze('listen_order', 'Priya Sharma, order number four five seven two, and the city is Pune.');
  assert.equal(ok.listening.recall, 1);
  assert.equal(ok.scores.language, 100);
  const partial = analyze('listen_order', 'Priya, order 4752, Pune.');
  assert.ok(Math.abs(partial.listening.recall - 2 / 3) < 1e-9);
  const repeated = analyze('listen_order', 'Priya Sharma, 4572, Pune.', { events: { repeats: 1 } });
  assert.equal(repeated.scores.language, 85);
});

test('sentence correction verdicts', () => {
  assert.equal(analyze('correct_dont', "She doesn't like to work on weekends.").correction.verdict, 'correct');
  assert.equal(analyze('correct_dont', "She don't like to work on weekends.").correction.verdict, 'repeated the error');
  assert.equal(analyze('correct_having', 'I have three years of experience in sales.').correction.verdict, 'correct');
  assert.equal(analyze('correct_yesterday', 'Yesterday I have completed all my tasks.').correction.score, 0);
});

test('shift question reads the candidate\'s stance', () => {
  assert.equal(analyze('shifts', 'Yes, absolutely, it will not be a problem for me.').stance.stance, 'positive');
  assert.equal(analyze('shifts', 'Yes, but initially I would like day shifts.').stance.stance, 'conditional');
  const no = analyze('shifts', 'No, I cannot do night shifts.');
  assert.equal(no.stance.stance, 'negative');
  assert.ok(no.metrics.redFlags.some((f) => f.id === 'shift_refusal'));
});

test('mock call checklist looks at opening first and closing last', () => {
  const call = Analyzer.callChecklist([
    'Thank you for calling, my name is Sam. I am so sorry about this. May I have your order number?',
    'I have raised a refund, it will reach you within 5 business days.',
    'Is there anything else I can help you with? Have a great day!',
  ], 'support');
  assert.equal(call.pct, 100);
  const late = Analyzer.callChecklist(['What is the issue?', 'ok', 'Hello, thank you for calling'], 'support');
  assert.equal(late.map.opening, false);
});

test('a concept said in the negative does not count', () => {
  const a = analyze('strength_weakness', 'My strength is hard work. I do not have any weakness.');
  assert.ok(a.metrics.coverage.missing.includes('weakness'));
  assert.ok(a.metrics.redFlags.some((f) => f.id === 'no_weakness'));
});

test('strong answers beat weak answers on every scored dimension', () => {
  const strong = analyze('handle_angry', 'First, I would let the customer speak without interrupting, because they need to feel heard. I would stay calm and apologise, and say I completely understand how frustrating this is. Then I would ask for the order number to understand the issue, offer a refund or replacement with a clear timeline, and if needed escalate to my supervisor and follow up.');
  const weak = analyze('handle_angry', 'I will tell him to calm down.');
  for (const k of Object.keys(weak.scores)) assert.ok(strong.scores[k] >= weak.scores[k], k);
  assert.ok(strong.quality - weak.quality >= 35);
});

test('voice metrics feed communication and confidence', () => {
  const text = 'I would listen carefully, apologise for the trouble, check the order details and arrange a refund with a clear timeline for the customer.';
  const base = { mode: 'voice', timing: { latencyMs: 1200, speakingMs: 9500 } };
  const goodAudio = { voicedFrames: 200, longPauses: 0, longestPauseMs: 600, snrDb: 22, trailOffDb: 0, voicedRatio: 0.8, pitchFrames: 120, pitchSdSemitones: 3 };
  const poorAudio = { voicedFrames: 200, longPauses: 4, longestPauseMs: 3500, snrDb: 6, trailOffDb: 10, voicedRatio: 0.4, pitchFrames: 120, pitchSdSemitones: 0.6 };
  const good = analyze('handle_angry', text, Object.assign({}, base, { audio: goodAudio }));
  const poor = analyze('handle_angry', text, Object.assign({}, base, { audio: poorAudio, timing: { latencyMs: 11000, speakingMs: 9500 } }));
  assert.ok(good.metrics.wpm > 100 && good.metrics.wpm < 200);
  assert.ok(good.scores.communication > poor.scores.communication);
  assert.ok(good.scores.confidence - poor.scores.confidence >= 15);
});

test('typed answers get writing-mechanics feedback', () => {
  const a = analyze('why_bpo', 'i want this job coz i like talking to ppl and u get to learn alot. i think its good for career growth');
  assert.ok(a.metrics.mechanics.errors >= 3);
  assert.ok(a.components.communication.some((c) => c.key === 'mechanics'));
});

test('highlight segments rebuild the original text exactly', () => {
  const text = "Basically, I think I'd um listen — because otherwise I will cut the call. Myself Rahul!";
  const segs = Analyzer.segments(text, {});
  assert.equal(segs.map((s) => s.text).join(''), text);
  const kinds = new Set(segs.map((s) => s.kind));
  for (const k of ['filler', 'hedge', 'strong', 'grammar', 'flag']) assert.ok(kinds.has(k), k);
});

test('skipped answers score low but do not crash', () => {
  const a = analyze('why_bpo', '', { events: { skipped: true } });
  assert.equal(a.skipped, true);
  assert.equal(a.scores.relevance, 0);
  assert.ok(a.feedback.improve.length >= 1);
});
