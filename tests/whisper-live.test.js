'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

// A stand-in speech worker that "transcribes" each clip as "phrase N".
let runs = 0;
class FakeWorker {
  postMessage(m) {
    if (m.type === 'load') setTimeout(() => this.onmessage({ data: { type: 'ready' } }), 0);
    else {
      const n = ++runs;
      setTimeout(() => this.onmessage({ data: { type: 'result', id: m.id, text: 'phrase ' + n } }), 5);
    }
  }
  terminate() {}
}
globalThis.Worker = FakeWorker;
const W = require('../js/whisper.js');

// A stand-in microphone meter: feed() plays voice or silence through the tap in 85 ms blocks.
function fakeMeter() {
  const m = {
    running: true, voiced: false, noiseFloor: -70, quietMs: 0, fn: null,
    tap(fn) { this.fn = fn; return () => { this.fn = null; }; },
    msSinceVoice() { return this.voiced ? 0 : this.quietMs; },
  };
  m.feed = (seconds, voiced) => {
    for (let t = 0; t < seconds; t += 0.085) {
      m.voiced = voiced;
      m.quietMs = voiced ? 0 : m.quietMs + 85;
      const x = new Float32Array(1360);
      if (voiced) for (let j = 0; j < x.length; j++) x[j] = 0.3 * Math.sin(j / 5);
      if (m.fn) m.fn(x, 16000);
    }
  };
  return m;
}
const settle = () => new Promise((r) => setTimeout(r, 100));

test('offline captions appear phrase by phrase while the candidate is still talking', async () => {
  const meter = fakeMeter();
  const seen = [];
  const rec = W.createRecognizer({ meter, onUpdate: (fin, interim) => seen.push([fin, interim]) });
  rec.start();
  meter.feed(2, true);
  meter.feed(1, false); // a pause: the first phrase is transcribed straight away
  await settle();
  assert.equal(rec.text(), 'phrase 1', 'on screen before the answer ends');
  assert.ok(seen.some(([fin, interim]) => fin === '' && interim === '…'), 'a phrase being transcribed shows as …');
  meter.feed(2, true); // still talking
  assert.equal(await rec.stop(), 'phrase 1 phrase 2', 'the answer is the phrases in order');
});

test('an abandoned answer ignores phrases that finish later', async () => {
  const meter = fakeMeter();
  const rec = W.createRecognizer({ meter });
  rec.start();
  meter.feed(2, true);
  meter.feed(1, false);
  rec.abort();
  await settle();
  assert.equal(rec.text(), '');
});
