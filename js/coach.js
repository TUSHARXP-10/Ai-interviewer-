/*
 * coach.js — live coaching while the candidate answers: time spoken against the answer's
 * target length, speaking pace and filler words, from the words heard so far. It stays
 * quiet until there is enough speech to judge, and gives at most one short tip at a time.
 */
(function (root) {
  'use strict';
  const isNode = typeof module === 'object' && module.exports;
  const Text = isNode ? require('./textUtils.js') : root.AII.Text;
  const L = isNode ? require('./lexicons.js') : root.AII.Lexicons;

  const WPM = 140; // a comfortable pace, to turn a target length in words into seconds
  const FAST = 185;
  const SLOW = 95;

  function clock(sec) {
    const s = Math.max(0, Math.round(sec));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  /** The target answer length in seconds, from the question's ideal length in words. */
  function target(question) {
    const ideal = question && question.ideal;
    if (!ideal || !ideal[1]) return null;
    // Rounded to 5 s, so the target reads like a person would say it.
    const r5 = (s) => Math.max(5, Math.round(s / 5) * 5);
    return { minSec: r5((ideal[0] / WPM) * 60), maxSec: r5((ideal[1] / WPM) * 60) };
  }

  /**
   * opts: { text, speakingMs (since the first word), question }
   * -> { words, time: { sec, tone, label }, pace: { wpm, tone, label } | null,
   *      fillers: { count, tone, label }, tip: string | null }
   * Tones: 'neutral' | 'good' | 'warn'.
   */
  function live(opts) {
    const text = String((opts && opts.text) || '');
    const words = (text.match(/[A-Za-z0-9']+/g) || []).length;
    const ms = Math.max(0, (opts && opts.speakingMs) || 0);
    const sec = ms / 1000;
    const t = target(opts && opts.question);

    let timeTone = 'neutral';
    let over = false;
    if (t) {
      if (sec >= t.minSec && sec <= t.maxSec) timeTone = 'good';
      else if (sec > t.maxSec) {
        timeTone = 'warn';
        over = true;
      }
    }
    const time = { sec: Math.round(sec), tone: timeTone, label: clock(sec) + (t ? ' · aim ' + clock(t.minSec) + '–' + clock(t.maxSec) : '') };

    // Pace needs a few sentences: early numbers swing wildly.
    let pace = null;
    if (words >= 15 && ms >= 8000) {
      const wpm = Math.round(words / (ms / 60000));
      const fast = wpm > FAST;
      const slow = wpm < SLOW;
      pace = { wpm, tone: fast || slow ? 'warn' : 'good', label: fast ? 'A bit fast' : slow ? 'A bit slow' : 'Good pace' };
    }

    const hits = words ? Text.findTerms(Text.makeDoc(text), L.FILLERS) : [];
    const many = hits.length >= 3 && (hits.length / Math.max(words, 1)) * 100 > 4;
    const fillers = { count: hits.length, tone: many ? 'warn' : words >= 10 ? 'good' : 'neutral', label: hits.length ? hits.length + ' filler' + (hits.length > 1 ? 's' : '') : 'No fillers' };

    const tip = over ? 'Time to wrap up: one sentence to conclude.'
      : pace && pace.wpm > FAST ? 'Slow down a little: let each point land.'
        : many ? 'Try a short pause instead of a filler word.'
          : pace && pace.wpm < SLOW ? 'Keep going: speak in full sentences.'
            : null;
    return { words, time, pace, fillers, tip };
  }

  const api = { live, target, clock };
  if (isNode) module.exports = api;
  else (root.AII = root.AII || {}).Coach = api;
})(typeof window !== 'undefined' ? window : globalThis);
