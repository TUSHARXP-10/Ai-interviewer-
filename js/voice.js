/*
 * voice.js — the rules of a hands-free spoken conversation (pure logic, no browser APIs).
 *
 *  - parseCommand():  spoken commands inside an answer ("can you repeat that?",
 *                     "skip this one", "...and that's all") so nobody has to touch the screen
 *  - endOfTurn():     adaptive end-of-answer detection from silence, so the interviewer
 *                     replies when the candidate has finished — but not during a thinking pause
 *  - idleAction():    what to do when the candidate has not started speaking yet
 *
 * Works in the browser (window.AII.Voice) and in Node (module.exports) for tests.
 */
(function (root) {
  'use strict';
  const isNode = typeof module === 'object' && module.exports;

  function norm(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/[‘’`]/g, "'")
      .replace(/[^a-z0-9' ]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function wordCount(text) {
    return (String(text || '').match(/[A-Za-z0-9']+/g) || []).length;
  }

  // Whole-utterance requests to hear the question again.
  const REPEAT = new RegExp('^(?:(?:sorry|excuse me|um|uh|hmm|okay|ok|ma\'?am|sir|madam)\\s+)*' +
    '(?:(?:can|could|would|will) you (?:please )?|please |kindly )?' +
    '(?:repeat(?: (?:that|it|the question|the last question|the details|again|once again|one more time|please))*' +
    '|say (?:that|it) again|say again|come again|pardon(?: me)?|once again|one more time' +
    '|i (?:did ?n[o\']?t|didnt|did not|could ?n[o\']?t|couldnt|could not) (?:get|catch|hear|understand)(?: (?:that|it|you|the question))?' +
    '|what (?:was|is) the question|what did you say)' +
    '(?: please)?$');

  // Whole-utterance requests to move on.
  const SKIP = /^(?:(?:sorry|um|uh|okay|ok)\s+)*(?:(?:can|could) (?:we|i) |i(?:'d| would) like to |let'?s |please )?(?:skip(?: (?:this|that|it|this one|this question|the question))?|pass|next question|move on(?: to the next (?:one|question))?|go to the next (?:one|question))(?: please)?$/;

  // Closing phrases at the END of an answer that mean "I've finished".
  const DONE_TAIL = /(?:^|\s)(?:and\s+)?(?:that'?s all|that is all|that'?s it|that is it|that'?s my answer|that is my answer|i'?m done|i am done|i'?m finished|i am finished|end of (?:my )?answer|over to you|that'?s all from my side|that is all from my side)(?:\s+(?:sir|ma'?am|madam|thank you|thanks))*$/;

  /**
   * Inspect what the candidate said so far.
   * Returns { command: 'repeat' | 'skip' | 'done' | null, text } where text has the
   * spoken command removed (so "that's all" is not scored as part of the answer).
   */
  function parseCommand(text) {
    const raw = String(text || '').trim();
    const n = norm(raw);
    if (!n) return { command: null, text: raw };
    const words = n.split(' ').length;
    if (words <= 9 && REPEAT.test(n)) return { command: 'repeat', text: '' };
    if (words <= 8 && SKIP.test(n)) return { command: 'skip', text: '' };
    const m = n.match(DONE_TAIL);
    if (m) {
      // Strip the closing phrase from the original text (same number of words from the end).
      const dropWords = m[0].trim().split(' ').length;
      const tokens = raw.split(/\s+/);
      const kept = tokens.slice(0, Math.max(0, tokens.length - dropWords)).join(' ').replace(/[\s,;:–-]+$/, '');
      return { command: 'done', text: kept ? (/[.!?]$/.test(kept) ? kept : kept + '.') : '' };
    }
    return { command: null, text: raw };
  }

  /**
   * Adaptive end-of-turn detection.
   * input: {
   *   words,          words recognised so far (null if the engine gives no live text)
   *   spokeMs,        how long the mic has heard voice in this answer (null without a mic meter)
   *   sinceVoiceMs,   ms since the mic last heard voice (Infinity/null without a meter)
   *   sinceResultMs,  ms since the recogniser last produced text (Infinity/null if none)
   *   patienceMs,     base silence the candidate chose (e.g. 3000)
   *   idealWords,     the question's ideal minimum length (e.g. 60)
   *   roleplay        true during the mock call (snappier turn-taking)
   * }
   * returns { end: boolean, waitMs: threshold used, quietMs: current silence }
   */
  function endOfTurn(input) {
    const i = input || {};
    const base = i.patienceMs || 3000;
    const words = i.words;
    const started = (words != null && words >= 2) || (i.spokeMs != null && i.spokeMs >= 1200);
    const quietCandidates = [i.sinceVoiceMs, i.sinceResultMs].filter((x) => x != null && Number.isFinite(x));
    const quietMs = quietCandidates.length ? Math.min.apply(null, quietCandidates) : 0;
    if (!started) return { end: false, waitMs: Infinity, quietMs };

    let wait = base;
    const soFar = words != null ? words : Math.round(((i.spokeMs || 0) / 1000) * 2.2);
    if (soFar < 8) wait += 2000;                               // a short start is usually a thinking pause
    else if (i.idealWords && soFar >= i.idealWords) wait -= 600; // a full answer: reply a little sooner
    if (i.roleplay) wait -= 500;                                // calls move faster
    wait = Math.max(1600, wait);
    return { end: quietMs >= wait, waitMs: wait, quietMs };
  }

  /**
   * What to do while the candidate has not started answering.
   * input: { elapsedMs, maxMs, nudgesGiven }
   * returns { action: 'none' | 'nudge' | 'offer-repeat' | 'give-up', say?: string }
   */
  function idleAction(input) {
    const i = input || {};
    const given = i.nudgesGiven || 0;
    const firstAt = Math.min(14000, (i.maxMs || 120000) * 0.25);
    const secondAt = Math.min(32000, (i.maxMs || 120000) * 0.55);
    const giveUpAt = Math.min(50000, (i.maxMs || 120000) * 0.85);
    if (i.elapsedMs >= giveUpAt && given >= 2) {
      return { action: 'give-up', say: "That's okay, let's move on to the next question." };
    }
    if (i.elapsedMs >= secondAt && given === 1) {
      return { action: 'offer-repeat', say: "If you'd like me to repeat the question, just say repeat. Otherwise, go ahead whenever you're ready." };
    }
    if (i.elapsedMs >= firstAt && given === 0) {
      return { action: 'nudge', say: "Take your time. Whenever you're ready, go ahead." };
    }
    return { action: 'none' };
  }

  const api = { parseCommand, endOfTurn, idleAction, wordCount, norm };
  if (isNode) module.exports = api;
  else (root.AII = root.AII || {}).Voice = api;
})(typeof window !== 'undefined' ? window : globalThis);
