'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

require('../js/audio.js'); // browser module: registers globalThis.AII.Audio
const { detectPitch, summarize, FRAME_MS } = globalThis.AII.Audio;
const LLM = require('../js/llm.js');

function sine(hz, sampleRate, n) {
  const buf = new Float32Array(n);
  for (let i = 0; i < n; i++) buf[i] = 0.4 * Math.sin((2 * Math.PI * hz * i) / sampleRate) + 0.15 * Math.sin((4 * Math.PI * hz * i) / sampleRate);
  return buf;
}

test('pitch detector finds the fundamental of a voiced frame', () => {
  for (const hz of [110, 180, 240]) {
    const p = detectPitch(sine(hz, 48000, 2048), 48000);
    assert.ok(p, 'pitch at ' + hz);
    assert.ok(Math.abs(p.hz - hz) / hz < 0.04, hz + ' vs ' + p.hz);
  }
  const noise = new Float32Array(2048).map(() => Math.random() * 0.2 - 0.1);
  assert.equal(detectPitch(noise, 48000), null);
});

test('answer summary measures onset, long pauses, fade and pitch variation', () => {
  const frames = [];
  let t = 0;
  const push = (n, voiced, db, hz) => {
    for (let i = 0; i < n; i++, t += FRAME_MS) frames.push({ t, db: voiced ? db : -70, voiced, hz: voiced ? hz(i) : null });
  };
  push(40, false); // 2 s thinking
  push(60, true, -25, (i) => 150 + 30 * Math.sin(i / 5)); // 3 s speech, lively pitch
  push(50, false); // 2.5 s pause
  push(60, true, -36, () => 150); // 3 s quieter speech
  const s = summarize(frames, -70);
  assert.equal(s.onsetMs, 2000);
  assert.equal(s.longPauses, 1);
  assert.ok(s.longestPauseMs >= 2400);
  assert.ok(s.trailOffDb > 6, 'voice faded: ' + s.trailOffDb);
  assert.ok(s.snrDb > 30);
  assert.ok(s.pitchSdSemitones > 1, 'pitch varies: ' + s.pitchSdSemitones);
});

test('local AI: scores are parsed and scaled, failures return null', async () => {
  const realFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({ message: { content: '{"relevance": 8, "thought": 6.5, "communication": 7, "confidence": 9, "customer": null, "attitude": 11, "feedback": "Clear.", "better": "Add an example."}' } }),
    });
    const r = await LLM.evaluate({ model: 'test' }, { role: 'Support', question: 'Q?', answer: 'A.' });
    assert.equal(r.relevance, 80);
    assert.equal(r.thought, 65);
    assert.equal(r.customer, undefined);
    assert.equal(r.attitude, 100, 'clamped to 10');
    assert.equal(r.better, 'Add an example.');

    globalThis.fetch = async () => { throw new Error('connection refused'); };
    assert.equal(await LLM.evaluate({ model: 'test' }, { role: 'Support', question: 'Q?', answer: 'A.' }), null);
    const st = await LLM.status('http://localhost:1');
    assert.equal(st.ok, false);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('the meter stops counting as running when the microphone is disconnected', async () => {
  const track = { readyState: 'live', stop() { this.readyState = 'ended'; } };
  const stream = { getAudioTracks: () => [track], getTracks: () => [track] };
  globalThis.AudioContext = class {
    constructor() { this.state = 'running'; this.sampleRate = 48000; }
    createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
    createAnalyser() { return { fftSize: 2048, connect() {}, getFloatTimeDomainData() {} }; }
  };
  const meter = globalThis.AII.Audio.createMeter();
  try {
    await meter.start(stream);
    assert.equal(meter.running, true);
    track.readyState = 'ended'; // headset unplugged, Bluetooth link dropped
    assert.equal(meter.running, false, 'a dead track is not a working microphone');
  } finally {
    meter.stop();
    delete globalThis.AudioContext;
  }
});

test('a segment with only a click or breath reports nothing', () => {
  const frames = [];
  for (let i = 0; i < 40; i++) frames.push({ t: i * FRAME_MS, db: i === 10 || i === 11 ? -20 : -70, voiced: i === 10 || i === 11, hz: null });
  assert.equal(summarize(frames, -70), null);
});
