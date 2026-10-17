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

  /*
   * How interviewers want an engineering problem talked through, step by step. Each step is
   * "heard" when the answer says it in one of these ways; the checklist shows live during
   * the answer and on the scoresheet.
   */
  const APPROACH = {
    problem: {
      title: 'Think out loud',
      steps: [
        { id: 'clarify', short: 'Clarify', label: 'Clarified the problem or its constraints', terms: ['clarif*', 'assum*', 'constraint*', 'can i assume', 'is the input', 'is the array', 'input size', 'how large', 'how big', 'sorted', 'what if the', 'do we need', 'should i return', 'requirement*'] },
        { id: 'simple', short: 'Simple approach', label: 'Started with a simple approach', terms: ['brute force', 'naive', 'simple approach', 'simplest', 'straightforward', 'first approach', 'two loops', 'nested loop*', 'every pair', 'check every', 'one way'] },
        { id: 'improve', short: 'Improve', label: 'Improved on it', terms: ['better approach', 'better way', 'optimi*', 'more efficient', 'improve', 'instead', 'faster', 'reduce', 'hash map', 'hashmap', 'heap', 'two pointer*', 'sort*', 'binary search', 'dictionary', 'set'] },
        { id: 'complexity', short: 'Complexity', label: 'Stated time and space complexity', terms: ['complexity', 'big o', 'o of n', 'o of 1', 'o of log n', 'o n', 'o 1', 'n log n', 'n squared', 'linear time', 'constant time', 'constant space', 'extra space', 'logarithmic', 'quadratic'] },
        { id: 'edges', short: 'Edge cases', label: 'Covered edge cases', terms: ['edge case*', 'corner case*', 'empty', 'null', 'negative', 'duplicate*', 'overflow', 'single element', 'only one', 'no valid', 'invalid input', 'zero'] },
        { id: 'test', short: 'Test it', label: 'Tested it on an example', terms: ['test*', 'dry run', 'walk through', 'example input', 'for example if', 'verify', 'check it with', 'trace through', 'let me try', 'unit test*'] },
      ],
    },
    design: {
      title: 'Talk it through',
      steps: [
        { id: 'reqs', short: 'Requirements', label: 'Started with requirements and scale', terms: ['requirement*', 'functional', 'non functional', 'clarif*', 'assum*', 'how many users', 'scale', 'read heavy', 'write heavy', 'traffic', 'per second', 'qps', 'users'] },
        { id: 'api', short: 'API & data', label: 'Defined the API or the data model', terms: ['api', 'endpoint*', 'schema', 'data model', 'table*', 'request*', 'response*', 'post', 'get'] },
        { id: 'components', short: 'Components', label: 'Laid out the main components', terms: ['service*', 'server*', 'database', 'queue', 'load balancer', 'gateway', 'worker*', 'component*', 'client', 'storage', 'pipeline'] },
        { id: 'scale', short: 'Scaling', label: 'Explained how it scales', terms: ['shard*', 'partition*', 'replica*', 'replicat*', 'horizontal*', 'cache*', 'redis', 'cdn', 'scale out', 'autoscal*', 'stateless'] },
        { id: 'tradeoffs', short: 'Trade-offs', label: 'Discussed trade-offs and bottlenecks', terms: ['trade off*', 'tradeoff*', 'bottleneck*', 'consisten*', 'availab*', 'latency', 'downside', 'instead of', 'rather than', 'however', 'the cost'] },
        { id: 'failure', short: 'Failures', label: 'Covered failures and monitoring', terms: ['fail*', 'retry*', 'retries', 'monitor*', 'alert*', 'metric*', 'logging', 'logs', 'fallback', 'backup*', 'rollback', 'roll back', 'health check*'] },
      ],
    },
  };

  /** Which approach checklist fits a question: 'problem', 'design' or null. */
  function approachKind(q) {
    if (!q) return null;
    if (q.slot === 'tdesign') return 'design';
    if (q.type === 'problem' && /^dsa_/.test(q.id || '')) return 'problem';
    return null;
  }

  /** The approach steps heard in an answer: [{ id, short, label, hit }] or null. */
  function approach(q, text) {
    const kind = approachKind(q);
    if (!kind) return null;
    const doc = Text.makeDoc(String(text || ''));
    return APPROACH[kind].steps.map((s) => ({ id: s.id, short: s.short, label: s.label, hit: !!doc.str && Text.hasAny(doc, s.terms) }));
  }

  const api = { live, target, clock, APPROACH, approachKind, approach };
  if (isNode) module.exports = api;
  else (root.AII = root.AII || {}).Coach = api;
})(typeof window !== 'undefined' ? window : globalThis);
