/*
 * textUtils.js — tokenising, normalising and pattern-matching helpers.
 *
 * Every analysis in the app runs on a "Doc": the original transcript split into
 * tokens, plus a normalised word list (lower-case, contractions expanded) that
 * keeps a pointer back to the original token. Patterns are matched against the
 * normalised words, and matches are mapped back to original tokens so the
 * report can highlight exactly what the candidate said.
 *
 * Works in the browser (window.AII.Text) and in Node (module.exports).
 */
(function (root) {
  'use strict';
  const isNode = typeof module === 'object' && module.exports;

  // Specific contractions first, the generic n't rule after them.
  const CONTRACTIONS = [
    [/^can't$/, ['cannot']],
    [/^won't$/, ['will', 'not']],
    [/^shan't$/, ['shall', 'not']],
    [/^ain't$/, ['am', 'not']],
    [/^let's$/, ['let', 'us']],
    [/^i'm$/, ['i', 'am']],
    [/^(it|that|there|what|he|she|who|here|where|how|this)'s$/, null], // "<x> is"
    [/^(\w+)n't$/, null], // "<x> not"
    [/^(\w+)'re$/, null],
    [/^(\w+)'ve$/, null],
    [/^(\w+)'ll$/, null],
    [/^(\w+)'d$/, null],
  ];

  function expandToken(lower) {
    const t = lower.replace(/[‘’ʼ`]/g, "'");
    if (t.indexOf("'") === -1) return [t];
    for (const [re, fixed] of CONTRACTIONS) {
      const m = t.match(re);
      if (!m) continue;
      if (fixed) return fixed.slice();
      if (/'s$/.test(t)) return [m[1], 'is'];
      if (/n't$/.test(t)) return [m[1], 'not'];
      if (/'re$/.test(t)) return [m[1], 'are'];
      if (/'ve$/.test(t)) return [m[1], 'have'];
      if (/'ll$/.test(t)) return [m[1], 'will'];
      if (/'d$/.test(t)) return [m[1], 'would'];
    }
    // Possessives and stray apostrophes: "customer's" -> "customers".
    return [t.replace(/'/g, '')].filter(Boolean);
  }

  /**
   * Build a Doc from raw text.
   * tokens: [{ raw, start, end }]   — positions in the original string
   * words:  ['i', 'am', ...]         — normalised words
   * wordToken: [tokenIndex, ...]     — words[i] came from tokens[wordToken[i]]
   * str:    words joined by single spaces (what regexes run against)
   * offsets: character offset of each word inside str
   */
  function makeDoc(text) {
    const src = String(text || '');
    const tokens = [];
    const re = /[A-Za-z0-9‘’ʼ'`]+/g;
    let m;
    while ((m = re.exec(src))) {
      const raw = m[0].replace(/^['‘’`]+|['‘’`]+$/g, '');
      if (!raw) continue;
      const start = m.index + m[0].indexOf(raw);
      tokens.push({ raw, start, end: start + raw.length });
    }
    const words = [];
    const wordToken = [];
    tokens.forEach((tok, i) => {
      expandToken(tok.raw.toLowerCase()).forEach((w) => {
        words.push(w);
        wordToken.push(i);
      });
    });
    // "can not" -> "cannot" so negation patterns only need one spelling.
    for (let i = 0; i < words.length - 1; i++) {
      if (words[i] === 'can' && words[i + 1] === 'not') {
        words.splice(i, 2, 'cannot');
        wordToken.splice(i + 1, 1);
      }
    }
    const offsets = [];
    let pos = 0;
    for (const w of words) {
      offsets.push(pos);
      pos += w.length + 1;
    }
    return { text: src, tokens, words, wordToken, str: words.join(' '), offsets };
  }

  const regexCache = new Map();

  /**
   * Turn a lexicon term into a regex over normalised text.
   *  - words are separated by flexible whitespace
   *  - a trailing or inner "*" matches any word characters ("communicat*")
   *  - a term that starts with "re:" is used as a raw regex body
   */
  function termRegex(term) {
    if (regexCache.has(term)) return regexCache.get(term);
    let body;
    if (term.startsWith('re:')) {
      body = term.slice(3);
    } else {
      body = term
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[a-z0-9]*'))
        .join(' ');
    }
    const rx = new RegExp('(?:^|(?<= ))(?:' + body + ')(?= |$)', 'g');
    regexCache.set(term, rx);
    return rx;
  }

  function charToWord(doc, charIndex) {
    // Binary search over word offsets.
    let lo = 0;
    let hi = doc.offsets.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (doc.offsets[mid] <= charIndex) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  /** All matches of a term: [{ term, w0, w1 }] with inclusive word indexes. */
  function findTerm(doc, term) {
    if (!doc.str) return [];
    const rx = termRegex(term);
    rx.lastIndex = 0;
    const out = [];
    let m;
    while ((m = rx.exec(doc.str))) {
      if (m[0].length === 0) {
        rx.lastIndex++;
        continue;
      }
      const w0 = charToWord(doc, m.index);
      const w1 = charToWord(doc, m.index + m[0].length - 1);
      out.push({ term, w0, w1, text: m[0] });
    }
    return out;
  }

  /**
   * Match a list of terms, longest first, without letting two terms claim the
   * same words ("i am not sure" should not also count as "not sure").
   */
  function findTerms(doc, terms) {
    const sorted = terms.slice().sort((a, b) => b.length - a.length);
    const used = new Uint8Array(doc.words.length);
    const hits = [];
    for (const term of sorted) {
      for (const h of findTerm(doc, term)) {
        let free = true;
        for (let i = h.w0; i <= h.w1; i++) if (used[i]) free = false;
        if (!free) continue;
        for (let i = h.w0; i <= h.w1; i++) used[i] = 1;
        hits.push(h);
      }
    }
    return hits.sort((a, b) => a.w0 - b.w0);
  }

  function hasAny(doc, terms) {
    return terms.some((t) => findTerm(doc, t).length > 0);
  }

  /** True when one of the `window` words before word index w is a negator. */
  const NEGATORS = new Set(['not', 'never', 'no', 'cannot', 'nobody', 'nothing', 'without', 'neither', 'nor']);
  function negatedAt(doc, w, window) {
    const n = window || 3;
    for (let i = Math.max(0, w - n); i < w; i++) {
      if (NEGATORS.has(doc.words[i])) return true;
    }
    return false;
  }

  /** Map a word span to original token span, for highlighting. */
  function wordSpanToTokens(doc, w0, w1) {
    return { t0: doc.wordToken[w0], t1: doc.wordToken[w1] };
  }

  // ---------- lexical statistics ----------

  /** Moving-average type-token ratio — length-robust vocabulary variety. */
  function mattr(words, windowSize) {
    const win = windowSize || 30;
    if (words.length === 0) return 0;
    if (words.length <= win) return new Set(words).size / words.length;
    const counts = new Map();
    let unique = 0;
    for (let i = 0; i < win; i++) {
      const c = (counts.get(words[i]) || 0) + 1;
      counts.set(words[i], c);
      if (c === 1) unique++;
    }
    let sum = unique;
    let n = 1;
    for (let i = win; i < words.length; i++) {
      const out = words[i - win];
      const co = counts.get(out) - 1;
      counts.set(out, co);
      if (co === 0) unique--;
      const ci = (counts.get(words[i]) || 0) + 1;
      counts.set(words[i], ci);
      if (ci === 1) unique++;
      sum += unique;
      n++;
    }
    return sum / n / win;
  }

  /** Immediate word repetitions like "I I", "the the" — a disfluency signal. */
  function repetitions(doc) {
    const out = [];
    for (let i = 1; i < doc.words.length; i++) {
      if (doc.words[i] === doc.words[i - 1] && doc.wordToken[i] !== doc.wordToken[i - 1] && !/^\d+$/.test(doc.words[i])) {
        out.push({ term: doc.words[i], w0: i - 1, w1: i });
      }
    }
    return out;
  }

  // ---------- numbers ----------

  const UNITS = { zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
  const TEENS = { ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
  const TENS = { twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

  function isNumberWord(w) {
    return /^\d+$/.test(w) || w in UNITS || w in TEENS || w in TENS || w === 'double' || w === 'triple' || w === 'hundred';
  }

  /**
   * Pull digit strings out of speech: "four five seven two", "45 72",
   * "forty five seventy two" and "double five" all become runs of digits.
   */
  function extractNumbers(doc) {
    const words = doc.words;
    const runs = [];
    let i = 0;
    while (i < words.length) {
      if (!isNumberWord(words[i]) || (words[i] === 'oh' && !(isNumberWord(words[i + 1] || '') || isNumberWord(words[i - 1] || '')))) {
        // Mixed tokens such as "k749" or "15th" still carry digits.
        const groups = /\d/.test(words[i]) ? words[i].match(/\d+/g) : null;
        if (groups) runs.push(...groups);
        i++;
        continue;
      }
      let out = '';
      while (i < words.length && isNumberWord(words[i])) {
        const w = words[i];
        if (/^\d+$/.test(w)) {
          out += w;
          i++;
        } else if ((w === 'double' || w === 'triple') && i + 1 < words.length && (words[i + 1] in UNITS || /^\d$/.test(words[i + 1]))) {
          const d = String(words[i + 1] in UNITS ? UNITS[words[i + 1]] : words[i + 1]);
          out += d.repeat(w === 'double' ? 2 : 3);
          i += 2;
        } else if (w in UNITS && words[i + 1] === 'hundred') {
          let val = UNITS[w] * 100;
          i += 2;
          if (words[i] === 'and') i++;
          if (words[i] in TENS) {
            val += TENS[words[i]];
            i++;
            if (words[i] in UNITS && UNITS[words[i]] > 0) {
              val += UNITS[words[i]];
              i++;
            }
          } else if (words[i] in TEENS) {
            val += TEENS[words[i]];
            i++;
          } else if (words[i] in UNITS) {
            val += UNITS[words[i]];
            i++;
          }
          out += String(val);
        } else if (w in TENS) {
          let val = TENS[w];
          i++;
          if (words[i] in UNITS && UNITS[words[i]] > 0) {
            val += UNITS[words[i]];
            i++;
          }
          out += String(val);
        } else if (w in TEENS) {
          out += String(TEENS[w]);
          i++;
        } else if (w in UNITS) {
          out += String(UNITS[w]);
          i++;
        } else {
          i++; // stray "hundred"/"double"
        }
      }
      if (out) runs.push(out);
    }
    return runs;
  }

  // ---------- small maths helpers used by the scorer ----------

  function clamp(x, lo, hi) {
    return Math.max(lo, Math.min(hi, x));
  }

  /** Piecewise-linear interpolation through [[x, y], ...] (x ascending). */
  function curve(x, points) {
    if (x <= points[0][0]) return points[0][1];
    for (let i = 1; i < points.length; i++) {
      const [x1, y1] = points[i];
      if (x <= x1) {
        const [x0, y0] = points[i - 1];
        return y0 + ((x - x0) / (x1 - x0 || 1)) * (y1 - y0);
      }
    }
    return points[points.length - 1][1];
  }

  /** Weighted mean over {value, weight} pairs, skipping null values. */
  function weightedMean(pairs) {
    let s = 0;
    let w = 0;
    for (const p of pairs) {
      if (p.value == null || Number.isNaN(p.value) || !p.weight) continue;
      s += p.value * p.weight;
      w += p.weight;
    }
    return w ? s / w : null;
  }

  function round(x) {
    return x == null ? null : Math.round(x);
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** Small deterministic RNG so a seeded interview is reproducible in tests. */
  function rng(seed) {
    let a = (seed >>> 0) || 0x9e3779b9;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const api = {
    makeDoc,
    expandToken,
    termRegex,
    findTerm,
    findTerms,
    hasAny,
    negatedAt,
    wordSpanToTokens,
    mattr,
    repetitions,
    extractNumbers,
    clamp,
    curve,
    weightedMean,
    round,
    escapeHtml,
    rng,
  };
  if (isNode) module.exports = api;
  else (root.AII = root.AII || {}).Text = api;
})(typeof window !== 'undefined' ? window : globalThis);
