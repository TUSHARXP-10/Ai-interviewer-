'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Voice = require('../js/voice.js');

test('recognises requests to repeat the question', () => {
  for (const s of [
    'Can you repeat the question?',
    'sorry, could you please repeat that',
    'Repeat please',
    'Pardon?',
    'Sorry I did not get that',
    "I didn't catch the question",
    'Could you say that again?',
    'Come again',
    'What was the question?',
  ]) {
    assert.equal(Voice.parseCommand(s).command, 'repeat', s);
  }
});

test('does not mistake real answers for repeat requests', () => {
  for (const s of [
    'I would repeat the customer details back to confirm them',
    'Customers often call again when the issue is not fixed, so I would make sure it is resolved',
    'Pardon me for being late, my name is Ravi and I studied commerce',
    'I did not get any other job offer but I really want this one',
  ]) {
    assert.equal(Voice.parseCommand(s).command, null, s);
  }
});

test('recognises skip requests only as whole utterances', () => {
  assert.equal(Voice.parseCommand('Can we skip this one?').command, 'skip');
  assert.equal(Voice.parseCommand('next question please').command, 'skip');
  assert.equal(Voice.parseCommand('pass').command, 'skip');
  assert.equal(Voice.parseCommand('I passed my exams in 2022 with first class').command, null);
  assert.equal(Voice.parseCommand('I would never skip a step in the process').command, null);
});

test('closing phrases are graded: strong ones are removed from the transcript', () => {
  const r = Voice.parseCommand('I would listen carefully and offer a refund, and that\'s all.');
  assert.equal(r.command, 'done');
  assert.equal(r.strength, 'strong');
  assert.equal(r.text, 'I would listen carefully and offer a refund.');
  const weak = Voice.parseCommand('My strengths are patience and communication. That is it, thank you');
  assert.equal(weak.strength, 'weak');
  assert.equal(weak.text, 'My strengths are patience and communication. That is it, thank you', 'weak closers stay in the answer');
  assert.equal(Voice.parseCommand("that's all thank you ma'am").strength, 'strong');
  assert.equal(Voice.parseCommand('My graduation is done').command, null);
  assert.equal(Voice.parseCommand('I am done with my degree and now I want to work').command, null);
  assert.equal(Voice.parseCommand("I'm done").text, '');
});

test('more ways to ask for a repeat, including after a false start', () => {
  for (const s of ['again please', 'say that one more time', "sorry I didn't hear you properly", 'can you please repeat', 'repeat']) {
    assert.equal(Voice.parseCommand(s).command, 'repeat', s);
  }
  assert.equal(Voice.parseCommand('I think um so the customer sorry can you repeat the question please', 'sorry can you repeat the question please').command, 'repeat');
  const long = 'I would first listen to the customer and then apologise for the delay and check the order history and then I would say could you repeat that';
  assert.equal(Voice.parseCommand(long, 'and then I would say could you repeat that').command, null, 'a long answer is never a command');
});

test('"next" skips and "I don\'t know" is recognised as unsure', () => {
  assert.equal(Voice.parseCommand('next').command, 'skip');
  assert.equal(Voice.parseCommand('next one please').command, 'skip');
  const u = Voice.parseCommand("I don't know");
  assert.equal(u.command, 'unsure');
  assert.equal(u.text, "I don't know", 'kept for scoring');
});

test('a strong closer still needs a brief silence on every signal', () => {
  assert.equal(Voice.endOfTurn({ words: 4, sinceVoiceMs: 900, sinceResultMs: 900, patienceMs: 3000, cue: 'strong' }).end, false);
  assert.equal(Voice.endOfTurn({ words: 4, sinceVoiceMs: 1300, sinceResultMs: 1300, patienceMs: 3000, cue: 'strong' }).end, true);
});

test('a trailing "and" or "so" means more is coming', () => {
  assert.equal(Voice.trailingFiller('I would apologise and'), true);
  assert.equal(Voice.trailingFiller('I would apologise.'), false);
  assert.equal(Voice.endOfTurn({ words: 30, sinceVoiceMs: 3200, sinceResultMs: 3200, patienceMs: 3000, trailingFiller: true }).end, false);
  assert.equal(Voice.endOfTurn({ words: 30, sinceVoiceMs: 3200, sinceResultMs: 3200, patienceMs: 3000 }).end, true);
});

test('Android-style growing results are merged without duplicates', () => {
  const cum = { cumulative: true };
  assert.equal(Voice.mergeCumulative(['I', 'I am', 'I am rabbi', 'I am Ravi and', 'I am Ravi and I studied', 'I am Ravi and I studied commerce'], cum), 'I am Ravi and I studied commerce');
  assert.equal(Voice.mergeCumulative(['my name', 'my name is Priya', 'My name is Priya.', 'my name is Priya I have', 'my name is Priya I have two years'], cum), 'my name is Priya I have two years');
  assert.equal(Voice.mergeCumulative(['I studied commerce', 'then I worked at a call centre'], cum), 'I studied commerce then I worked at a call centre');
  assert.equal(Voice.mergeCumulative(['I would apologise', 'and then I would apologise again'], cum), 'I would apologise and then I would apologise again');
  assert.equal(Voice.mergeCumulative(['I am Ravi and I studied', 'I am Ravi'], cum), 'I am Ravi and I studied');
  assert.equal(Voice.looksCumulative('I am', 'I am Ravi'), true);
  assert.equal(Voice.looksCumulative('okay', 'okay so I would'), false, 'one word is not proof');
  assert.equal(Voice.looksCumulative('I can speak English', 'I can speak Hindi and Tamil'), false);
});

test('desktop phrases that start alike are all kept', () => {
  assert.equal(Voice.mergeCumulative(['I can speak English.', 'I can speak Hindi and Tamil.']), 'I can speak English. I can speak Hindi and Tamil.');
  assert.equal(Voice.mergeCumulative(['my name is Ravi', 'I am from Pune', 'I am a commerce graduate', 'I am good at Excel']), 'my name is Ravi I am from Pune I am a commerce graduate I am good at Excel');
  assert.equal(Voice.mergeCumulative(['I am a team player', 'I am a quick learner']), 'I am a team player I am a quick learner');
  // Exact growth and exact stale copies are still merged.
  assert.equal(Voice.mergeCumulative(['I am Ravi', 'I am Ravi and I studied commerce']), 'I am Ravi and I studied commerce');
  assert.equal(Voice.mergeCumulative(['I am Ravi and I studied', 'I am Ravi']), 'I am Ravi and I studied');
});

test('echo of the interviewer\'s last words is removed', () => {
  const prompt = 'Tell me about a time you handled an angry customer. Take your time.';
  assert.equal(Voice.stripEcho('take your time so last year a customer', prompt), 'so last year a customer');
  assert.equal(Voice.stripEcho('so last year a customer', prompt), 'so last year a customer');
  // An answer that is nothing but the prompt's words is an answer, not an echo.
  const fix = 'Please correct this sentence: I completed all my tasks yesterday.';
  assert.equal(Voice.stripEcho('I completed all my tasks yesterday.', fix), 'I completed all my tasks yesterday.');
});

test('"thank you" at the start of an answer does not cut it short', () => {
  const opening = Voice.endOfTurn({ words: 5, sinceVoiceMs: 2600, sinceResultMs: 2600, patienceMs: 3000, cue: 'weak' });
  assert.equal(opening.end, false, 'a 5-word "Good morning ma\'am, thank you" is a thinking pause');
  assert.equal(opening.waitMs, 5000);
  const closing = Voice.endOfTurn({ words: 40, sinceVoiceMs: 2100, sinceResultMs: 2100, patienceMs: 3000, cue: 'weak' });
  assert.equal(closing.end, true, 'a full answer ending in thank you ends sooner');
});

test('the app can declare a one-word reply as a started answer', () => {
  assert.equal(Voice.endOfTurn({ words: 1, sinceVoiceMs: 6000, sinceResultMs: 6000, patienceMs: 3000 }).end, false);
  const r = Voice.endOfTurn({ words: 1, started: true, sinceVoiceMs: 5200, sinceResultMs: 5200, patienceMs: 3000 });
  assert.equal(r.end, true);
  assert.equal(r.waitMs, 5000);
});

test('"skip" after "I don\'t know" still skips', () => {
  assert.equal(Voice.parseCommand("I don't know skip", 'skip').command, 'skip');
  assert.equal(Voice.parseCommand("I don't know. Next question please", 'next question please').command, 'skip');
  assert.equal(Voice.parseCommand('I would first apologise and then move on', 'and then move on').command, null);
});

test('long sentences are split for speech synthesis without losing words', () => {
  const long = 'Imagine a customer calls, very upset, because their refund has been delayed for the third time, they have already spoken to two of your colleagues, and they are now threatening to cancel their account and post a complaint on social media, so walk me through exactly what you would say first.';
  const c = Voice.splitForSpeech(long);
  assert.ok(c.length > 1 && c.every((x) => x.length <= 170), JSON.stringify(c.map((x) => x.length)));
  assert.equal(c.join(' ').replace(/\s+/g, ' '), long);
  assert.deepEqual(Voice.splitForSpeech('Hi there. How are you?'), ['Hi there. How are you?']);
});

test('the mock-call customer nudges in character', () => {
  assert.equal(Voice.idleAction({ elapsedMs: 8000, maxMs: 90000, nudgesGiven: 0, roleplay: true }).say, 'Hello? Are you still there?');
});

test('end-of-turn waits longer during an early thinking pause', () => {
  const early = Voice.endOfTurn({ words: 4, sinceVoiceMs: 3500, sinceResultMs: 3500, patienceMs: 3000 });
  assert.equal(early.end, false, 'only 4 words: 3.5 s is a thinking pause');
  const later = Voice.endOfTurn({ words: 40, sinceVoiceMs: 3500, sinceResultMs: 3500, patienceMs: 3000, idealWords: 60 });
  assert.equal(later.end, true);
  const full = Voice.endOfTurn({ words: 80, sinceVoiceMs: 2600, sinceResultMs: 2600, patienceMs: 3000, idealWords: 60 });
  assert.equal(full.end, true, 'a complete answer ends sooner');
});

test('end-of-turn needs silence on every available signal', () => {
  // The recogniser is quiet but the mic still hears the candidate: keep listening.
  assert.equal(Voice.endOfTurn({ words: 30, sinceVoiceMs: 400, sinceResultMs: 5000, patienceMs: 3000 }).end, false);
  // No live words (offline engine) — rely on the mic alone.
  assert.equal(Voice.endOfTurn({ words: null, spokeMs: 9000, sinceVoiceMs: 3300, sinceResultMs: null, patienceMs: 3000 }).end, true);
  // Nothing said yet: never end on silence.
  assert.equal(Voice.endOfTurn({ words: 0, spokeMs: 0, sinceVoiceMs: 20000, sinceResultMs: null, patienceMs: 3000 }).end, false);
});

test('idle nudges escalate, then move on', () => {
  const max = 120000;
  assert.equal(Voice.idleAction({ elapsedMs: 5000, maxMs: max, nudgesGiven: 0 }).action, 'none');
  assert.equal(Voice.idleAction({ elapsedMs: 15000, maxMs: max, nudgesGiven: 0 }).action, 'nudge');
  assert.equal(Voice.idleAction({ elapsedMs: 15000, maxMs: max, nudgesGiven: 1 }).action, 'none');
  assert.equal(Voice.idleAction({ elapsedMs: 33000, maxMs: max, nudgesGiven: 1 }).action, 'offer-repeat');
  assert.equal(Voice.idleAction({ elapsedMs: 51000, maxMs: max, nudgesGiven: 2 }).action, 'give-up');
  // Short questions (listening test, 45 s) nudge proportionally sooner.
  assert.equal(Voice.idleAction({ elapsedMs: 12000, maxMs: 45000, nudgesGiven: 0 }).action, 'nudge');
});

test('engines without live words count a short reply as started', () => {
  const short = { words: null, spokeMs: 800, sinceVoiceMs: 3500, sinceResultMs: null, patienceMs: 3000 };
  assert.equal(Voice.endOfTurn(short).end, false, 'default threshold: 0.8 s of voice is not an answer yet');
  assert.equal(Voice.endOfTurn(Object.assign({ startMs: 600 }, short, { sinceVoiceMs: 5200 })).end, true);
});

test('spoken-only listening tests never invite a repeat', () => {
  const r = Voice.idleAction({ elapsedMs: 26000, maxMs: 45000, nudgesGiven: 1, noRepeatOffer: true });
  assert.equal(r.action, 'nudge');
  assert.ok(!/repeat/i.test(r.say));
});
