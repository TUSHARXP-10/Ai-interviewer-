'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const W = require('../js/whisper.js');

const SR = 16000;

test('long answers are split at a pause, not mid-word', () => {
  const x = new Float32Array(SR * 70).map((_, i) => Math.sin(i / 7) * 0.3);
  for (let i = SR * 24; i < SR * 24.4; i++) x[i] = 0; // a breath at 24 s
  const parts = W.splitAtPauses(x);
  assert.ok(parts.length >= 3);
  assert.ok(Math.abs(parts[0].length / SR - 24.1) < 0.3, 'first cut lands in the pause');
  assert.equal(parts.reduce((n, p) => n + p.length, 0), x.length, 'no audio lost');
  assert.equal(W.splitAtPauses(new Float32Array(SR * 20)).length, 1, 'short answers stay whole');
});

test('decoder loops are collapsed but natural repeats survive', () => {
  assert.equal(W.collapseRepeats('ask what your country can do, ask what your country can do, ask what your country can do for you'), 'ask what your country can do for you');
  assert.equal(W.collapseRepeats('I said yes yes and it worked'), 'I said yes yes and it worked');
});

test('silence is trimmed so Whisper never hears an empty clip', () => {
  const t = new Float32Array(SR * 3);
  for (let i = SR; i < SR * 2; i++) t[i] = 0.2;
  const trimmed = W.trim(t);
  assert.ok(trimmed.length / SR > 1 && trimmed.length / SR < 1.3);
  assert.equal(W.trim(new Float32Array(SR * 2)).length, 0);
});

test('the offline engine pins an exact library version', () => {
  assert.match(W.config.libUrl, /@huggingface\/transformers@\d+\.\d+\.\d+\/dist\/transformers\.min\.js$/);
  assert.equal(W.config.model, 'onnx-community/whisper-tiny.en');
  assert.equal(W.config.multilingual, false, 'English-only models must not receive language/task');
});
