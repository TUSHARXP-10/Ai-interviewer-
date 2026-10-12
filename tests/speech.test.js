'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Voice = require('../js/voice.js');

// A stand-in for the browser's recogniser: each say() delivers one new final phrase.
class FakeRecognition {
  constructor() {
    FakeRecognition.last = this;
    this.results = [];
  }
  start() { if (this.onstart) this.onstart(); }
  stop() { if (this.onend) this.onend(); }
  abort() { if (this.onend) this.onend(); }
  say(text) {
    this.results.push(Object.assign([{ transcript: text }], { isFinal: true }));
    this.onresult({ resultIndex: this.results.length - 1, results: this.results });
  }
}

globalThis.SpeechRecognition = FakeRecognition;
globalThis.AII = { Voice };
require('../js/speech.js'); // browser module: registers globalThis.AII.Speech
const { Speech } = globalThis.AII;

function hear(phrases) {
  const rec = Speech.createRecognizer({ lang: 'en-IN' });
  rec.start();
  for (const p of phrases) FakeRecognition.last.say(p);
  return rec.text();
}

test('one false start does not make later phrases that start alike disappear', () => {
  assert.equal(
    hear(['I have', 'I have two years of experience in sales.', 'I can speak English.', 'I can speak Hindi.', 'My strength is patience.', 'My strength is listening.']),
    'I have two years of experience in sales. I can speak English. I can speak Hindi. My strength is patience. My strength is listening.',
  );
});

test('an engine that keeps resending the growing phrase is still merged', () => {
  assert.equal(hear(['I', 'I am', 'I am rabbi', 'I am Ravi and', 'I am Ravi and I studied']), 'I am Ravi and I studied');
});
