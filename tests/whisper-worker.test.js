'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

// Stand-in speech workers: the first loads and then never answers (like one that
// crashed); later ones answer normally.
const workers = [];
class FakeWorker {
  constructor() {
    this.answers = workers.length > 0;
    this.terminated = false;
    workers.push(this);
  }
  postMessage(m) {
    if (this.terminated) return;
    if (m.type === 'load') setTimeout(() => this.onmessage({ data: { type: 'ready' } }), 0);
    else if (this.answers) setTimeout(() => this.onmessage({ data: { type: 'result', id: m.id, text: 'hello there' } }), 0);
  }
  terminate() { this.terminated = true; }
}

globalThis.Worker = FakeWorker;
globalThis.AII_CONFIG = { whisper: { runTimeoutMs: 200 } };
const W = require('../js/whisper.js');

function voice(seconds) {
  const x = new Float32Array(16000 * seconds);
  for (let i = 0; i < x.length; i++) x[i] = 0.3 * Math.sin(i / 5);
  return x;
}

// The timeout makes a regression fail instead of hanging the test run.
test('a speech worker that stops answering fails the answer instead of freezing the call', { timeout: 5000 }, async () => {
  await assert.rejects(W.transcribe(voice(1), 16000), /stopped responding/);
  assert.equal(workers[0].terminated, true);
  // The next answer starts a fresh worker instead of waiting on the dead one.
  assert.equal(await W.transcribe(voice(1), 16000), 'hello there');
  assert.equal(workers.length, 2);
});
