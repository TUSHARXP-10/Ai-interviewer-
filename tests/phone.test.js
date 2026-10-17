'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

// Load the browser modules as a phone would see them.
Object.defineProperty(globalThis, 'navigator', {
  value: { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36' },
  configurable: true,
});
require('../js/audio.js');
const P = require('../js/proctor.js');

test('on a phone the microphone is opened for a soft voice: no call mode, no noise gate, gain on', () => {
  const c = globalThis.AII.Audio.AUDIO_CONSTRAINTS;
  assert.equal(globalThis.AII.Audio.MOBILE, true);
  assert.equal(c.echoCancellation, false, 'the interview never listens while the interviewer speaks');
  assert.equal(c.noiseSuppression, false, 'a soft voice is not taken for noise');
  assert.equal(c.autoGainControl, true);
});

test('on a phone the proctor checks a little less often', () => {
  assert.ok(P.config.faceEveryMs > 120 && P.config.faceEveryMs <= 200);
});
