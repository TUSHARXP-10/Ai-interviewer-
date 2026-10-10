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

test('closing phrases end the answer and are removed from the transcript', () => {
  const r = Voice.parseCommand('I would listen carefully and offer a refund, and that\'s all.');
  assert.equal(r.command, 'done');
  assert.equal(r.text, 'I would listen carefully and offer a refund.');
  assert.equal(Voice.parseCommand('My strengths are patience and communication. That is it, thank you').command, 'done');
  assert.equal(Voice.parseCommand('My graduation is done').command, null);
  assert.equal(Voice.parseCommand('I am done with my degree and now I want to work').command, null);
  assert.equal(Voice.parseCommand("I'm done").text, '');
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
