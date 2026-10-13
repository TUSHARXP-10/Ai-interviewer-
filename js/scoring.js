/*
 * scoring.js — rolls per-answer analyses up into the final scoresheet.
 *
 *   dimension score = weighted mean of answer scores, where the weight is how
 *                     much that question type informs the dimension (TYPE_DIMS)
 *                     × how reliable the answer is (very short answers count less)
 *   overall         = role-specific weighted mean of the 7 dimensions, minus
 *                     red-flag penalties
 *   verdict         = band on the overall score, capped by serious red flags
 */
(function (root) {
  'use strict';
  const isNode = typeof module === 'object' && module.exports;
  const Text = isNode ? require('./textUtils.js') : root.AII.Text;
  const Questions = isNode ? require('./questionBank.js') : root.AII.Questions;
  const Explain = isNode ? require('./explain.js') : root.AII.Explain;

  const { curve, weightedMean, clamp } = Text;

  const DIMENSIONS = [
    { key: 'communication', label: 'Communication & Fluency', short: 'Communication',
      about: 'Clarity, fluency, filler words, pace, vocabulary, pauses and voice modulation.' },
    { key: 'confidence', label: 'Confidence & Composure', short: 'Confidence',
      about: 'Direct vs. hedging language, readiness to answer, voice strength and composure.' },
    { key: 'thought', label: 'Thought Process & Structure', short: 'Thought process',
      about: 'Logical structure, reasoning, examples, STAR storytelling and specific detail.' },
    { key: 'relevance', label: 'Answer Quality & Relevance', short: 'Answer quality',
      about: 'How well answers address the question and cover what a strong answer includes.' },
    { key: 'customer', label: 'Customer Handling & Empathy', short: 'Customer handling',
      about: 'Empathy, ownership, probing, resolution and call etiquette (incl. the mock call).' },
    { key: 'attitude', label: 'Attitude & Motivation', short: 'Attitude',
      about: 'Positivity, genuine motivation, flexibility, curiosity — and red flags.' },
    { key: 'language', label: 'English & Listening Accuracy', short: 'English & listening',
      about: 'Grammar, sentence correction and recall of details from spoken information.' },
  ];

  const ROLE_WEIGHTS = {
    voice: { communication: 0.22, confidence: 0.15, thought: 0.12, relevance: 0.13, customer: 0.18, attitude: 0.1, language: 0.1 },
    tech: { communication: 0.17, confidence: 0.12, thought: 0.2, relevance: 0.15, customer: 0.16, attitude: 0.1, language: 0.1 },
    sales: { communication: 0.2, confidence: 0.22, thought: 0.1, relevance: 0.12, customer: 0.14, attitude: 0.12, language: 0.1 },
    nonvoice: { communication: 0.16, confidence: 0.08, thought: 0.17, relevance: 0.17, customer: 0.15, attitude: 0.1, language: 0.17 },
    general: { communication: 0.2, confidence: 0.15, thought: 0.14, relevance: 0.14, customer: 0.14, attitude: 0.12, language: 0.11 },
  };

  const VERDICTS = [
    { key: 'strong', min: 80, label: 'Strongly recommended', tone: 'good' },
    { key: 'hire', min: 66, label: 'Recommended', tone: 'good' },
    { key: 'borderline', min: 52, label: 'Borderline — consider with training', tone: 'warning' },
    { key: 'no', min: 0, label: 'Not recommended yet', tone: 'critical' },
  ];

  const CEFR = [
    { min: 90, code: 'C2', label: 'Proficient' },
    { min: 78, code: 'C1', label: 'Advanced' },
    { min: 62, code: 'B2', label: 'Upper-intermediate' },
    { min: 45, code: 'B1', label: 'Intermediate' },
    { min: 0, code: 'A2', label: 'Elementary' },
  ];

  function band(score) {
    if (score == null) return 'Not assessed';
    if (score >= 85) return 'Excellent';
    if (score >= 70) return 'Good';
    if (score >= 55) return 'Average';
    if (score >= 40) return 'Needs work';
    return 'Weak';
  }

  /** Blend optional local-LLM scores into the rule-based ones (LLM as a second opinion). */
  function blendedScores(item) {
    const s = Object.assign({}, item.analysis.scores);
    const llm = item.llm;
    if (!llm || item.analysis.skipped) return s;
    const share = { relevance: 0.3, thought: 0.3, customer: 0.3, communication: 0.15, confidence: 0.15, attitude: 0.25 };
    for (const k of Object.keys(share)) {
      if (s[k] != null && typeof llm[k] === 'number') s[k] = Math.round((1 - share[k]) * s[k] + share[k] * clamp(llm[k], 0, 100));
    }
    return s;
  }

  function reliability(dim, item) {
    const a = item.analysis;
    if (a.skipped) return 1;
    if (dim === 'communication' || dim === 'confidence') return clamp(0.3 + a.metrics.wordCount / 40, 0.3, 1);
    return 1;
  }

  function list(arr) {
    if (arr.length <= 1) return arr.join('');
    return arr.slice(0, -1).join(', ') + ' and ' + arr[arr.length - 1];
  }

  function minutesText(sec) {
    const m = Math.max(1, Math.round(sec / 60));
    return m + (m === 1 ? ' minute' : ' minutes');
  }

  // ------------------------------------------------------------ aggregation

  function speechStats(items) {
    let words = 0;
    let fillers = 0;
    let hedges = 0;
    let wpmW = 0;
    let wpmSum = 0;
    const lat = [];
    let pauses = 0;
    let pitchW = 0;
    let pitchSum = 0;
    let speakingMs = 0;
    const fillerCounts = new Map();
    const hedgeCounts = new Map();
    let voiceAnswers = 0;
    for (const it of items) {
      const a = it.analysis;
      if (a.skipped) continue;
      const m = a.metrics;
      words += m.wordCount;
      fillers += m.fillers.count + m.fillers.repetitions;
      hedges += m.hedges.count;
      for (const f of m.fillers.top) fillerCounts.set(f.term, (fillerCounts.get(f.term) || 0) + f.count);
      for (const f of m.hedges.top) hedgeCounts.set(f.term, (hedgeCounts.get(f.term) || 0) + f.count);
      if (a.mode === 'voice') {
        voiceAnswers++;
        speakingMs += (it.response.timing && it.response.timing.speakingMs) || 0;
        if (m.wpm != null) {
          wpmSum += m.wpm * m.wordCount;
          wpmW += m.wordCount;
        }
        if (m.latencySec != null && ['listening', 'correction', 'closing'].indexOf(a.type) === -1) lat.push(m.latencySec);
        if (m.audio) {
          pauses += m.audio.longPauses || 0;
          if (m.audio.pitchSdSemitones != null) {
            pitchSum += m.audio.pitchSdSemitones * m.wordCount;
            pitchW += m.wordCount;
          }
        }
      }
    }
    const top = (map) => [...map.entries()].sort((x, y) => y[1] - x[1]).slice(0, 5).map(([term, count]) => ({ term, count }));
    return {
      words,
      voiceAnswers,
      speakingSec: Math.round(speakingMs / 1000),
      avgWpm: wpmW ? Math.round(wpmSum / wpmW) : null,
      avgLatencySec: lat.length ? Math.round((lat.reduce((s, x) => s + x, 0) / lat.length) * 10) / 10 : null,
      fillerPer100: words ? Math.round((fillers / words) * 1000) / 10 : 0,
      hedgePer100: words ? Math.round((hedges / words) * 1000) / 10 : 0,
      topFillers: top(fillerCounts),
      topHedges: top(hedgeCounts),
      longPauses: pauses,
      pitchVariation: pitchW ? Math.round((pitchSum / pitchW) * 10) / 10 : null,
    };
  }

  function grammarAll(items) {
    const seen = new Map();
    for (const it of items) {
      // A correction answer that repeats the error is scored as the task, not counted twice.
      if (it.analysis.type === 'correction' || it.analysis.type === 'listening') continue;
      for (const g of it.analysis.metrics.grammar) {
        const key = g.wrong;
        if (!seen.has(key)) seen.set(key, Object.assign({ count: 0 }, g));
        seen.get(key).count++;
      }
    }
    return [...seen.values()];
  }

  function redFlagsAll(items) {
    const seen = new Map();
    for (const it of items) {
      for (const f of it.analysis.metrics.redFlags) {
        if (!seen.has(f.id)) seen.set(f.id, Object.assign({ question: it.question.text }, f));
      }
    }
    const order = { high: 0, medium: 1, low: 2 };
    return [...seen.values()].sort((a, b) => order[a.severity] - order[b.severity]);
  }

  function aggregateDimension(dim, items, effScores) {
    const pairs = [];
    items.forEach((it, i) => {
      const v = effScores[i][dim];
      const w = (it.question.dims && it.question.dims[dim]) || 0;
      if (v == null || !w) return;
      pairs.push({ value: v, weight: w * reliability(dim, it) });
    });
    const v = weightedMean(pairs);
    return v == null ? null : Math.round(v);
  }

  /**
   * How well-formed the candidate's English is across the whole interview (needs 60+ words):
   * grammar slips per 100 words, and whether sentences carry their small words. Speakers who
   * struggle with English drop "a/the" (“I did diploma”, “I am fresher”): fluent speakers use
   * about 5–7 per 100 words, and that rate barely depends on the topic.
   */
  function englishIndex(items) {
    let words = 0;
    let articles = 0;
    let errors = 0;
    for (const it of items) {
      const a = it.analysis;
      if (a.skipped || !a.metrics.english || a.type === 'correction' || a.type === 'listening') continue;
      words += a.metrics.english.words;
      articles += a.metrics.english.articles;
      errors += a.metrics.english.errors;
    }
    const errorRate = words ? (errors / words) * 100 : 0;
    const articleRate = words ? (articles / words) * 100 : 0;
    const grammar = words >= 120 ? curve(errorRate, [[0, 100], [0.3, 92], [0.7, 80], [1, 72], [2, 55], [3, 42], [4.5, 30], [7, 15]]) : null;
    const structure = words >= 120 ? curve(articleRate, [[0, 15], [1, 28], [2, 45], [3, 62], [4, 78], [5, 92], [6, 100]]) : null;
    const score = weightedMean([{ value: grammar, weight: 0.55 }, { value: structure, weight: 0.45 }]);
    return { score: score == null ? null : Math.round(score), grammar, structure, words, errors, articles,
      errorRate: Math.round(errorRate * 10) / 10, articleRate: Math.round(articleRate * 10) / 10 };
  }

  function languageScore(items, effScores, grammar, mode, english) {
    const tasks = [];
    items.forEach((it, i) => {
      if (effScores[i].language != null) tasks.push(effScores[i].language);
    });
    const taskScore = tasks.length ? tasks.reduce((s, x) => s + x, 0) / tasks.length : null;
    const errors = grammar.reduce((s, g) => s + g.count, 0);
    const grammarScore = english && english.grammar != null ? english.grammar : null;
    const structureScore = english && english.structure != null ? english.structure : null;
    let mechScore = null;
    if (mode === 'text') {
      const mech = items.map((it) => it.analysis.components.communication.find((c) => c.key === 'mechanics')).filter(Boolean);
      if (mech.length) mechScore = mech.reduce((s, c) => s + c.value, 0) / mech.length;
    }
    const v = weightedMean([
      { value: taskScore, weight: 0.45 },
      { value: grammarScore, weight: 0.3 },
      { value: structureScore, weight: 0.25 },
      { value: mechScore, weight: 0.15 },
    ]);
    return { score: v == null ? null : Math.round(v), taskScore, grammarScore, structureScore, mechScore, errors };
  }

  function avgComponent(items, dim, key) {
    const vals = [];
    for (const it of items) {
      const c = (it.analysis.components[dim] || []).find((x) => x.key === key);
      if (c) vals.push(c.value);
    }
    return vals.length ? vals.reduce((s, x) => s + x, 0) / vals.length : null;
  }

  /*
   * What a role cannot do without, however good the rest is: a recruiter for a voice process
   * will not hire someone customers cannot understand, or who is rude to them. Every point a
   * gated skill falls below its bar costs GATE_COST points overall.
   */
  const GATES = {
    voice: { communication: 55, customer: 50, attitude: 50 },
    tech: { communication: 50, customer: 45, attitude: 50, thought: 45 },
    sales: { communication: 55, confidence: 50, attitude: 50 },
    nonvoice: { language: 55, attitude: 50 },
    general: { communication: 50, attitude: 50 },
  };
  /*
   * The recruiter's scale. Rule checks saturate: a competent answer ticks every box and
   * scores in the 90s, while recruiters keep 90+ for excellent candidates, put an adequate
   * one in the 60s and a weak one below 40. Every skill score (and the per-question scores
   * on the report) is mapped onto that scale, fitted to blind recruiter ratings of full
   * interviews. Monotonic, so the order of candidates never changes.
   */
  const SCALE = [[0, 0], [30, 15], [45, 24], [55, 32], [65, 43], [75, 56], [85, 72], [92, 84], [97, 93], [100, 98]];
  const SCALES = {
    thought: [[0, 0], [30, 16], [45, 27], [55, 38], [65, 52], [75, 67], [85, 82], [92, 91], [97, 96], [100, 98]],
  };
  const toScale = (v, key) => (v == null ? v : Math.round(curve(v, SCALES[key] || SCALE)));

  const GATE_COST = 0.35;
  const GATE_MAX = 25;
  const FLAG_COST = { high: [7, 14], medium: [5, 14], low: [2, 4] }; // [each, at most]

  function gateShortfalls(roleKey, dims) {
    const out = [];
    const g = GATES[roleKey] || GATES.general;
    for (const k of Object.keys(g)) if (dims[k] != null && dims[k] < g[k]) out.push({ key: k, bar: g[k], score: dims[k], cost: GATE_COST * (g[k] - dims[k]) });
    return out;
  }

  function flagCost(flags) {
    let cost = 0;
    for (const sev of Object.keys(FLAG_COST)) {
      const n = flags.filter((f) => f.severity === sev).length;
      cost += Math.min(FLAG_COST[sev][1], n * FLAG_COST[sev][0]);
    }
    return cost;
  }

  function overallFor(roleKey, dims, flags) {
    const w = ROLE_WEIGHTS[roleKey] || ROLE_WEIGHTS.general;
    const pairs = Object.keys(w).map((k) => ({ value: dims[k], weight: w[k] }));
    let v = weightedMean(pairs) || 0;
    // Penalties scale with the score (full size at 70): a weak interview has already lost
    // those points in the skills, and a strong one should feel a red flag.
    const cost = Math.min(GATE_MAX, gateShortfalls(roleKey, dims).reduce((sum, g) => sum + g.cost, 0)) + flagCost(flags);
    v -= cost * Math.min(1.3, v / 70);
    return Math.round(clamp(v, 0, 100));
  }

  // "Answer quality" -> "answer quality", but keep "English" capitalised.
  function lower(label) {
    return /^English/.test(label) ? label : label.charAt(0).toLowerCase() + label.slice(1);
  }

  function scaled(scores) {
    const out = {};
    for (const k of Object.keys(scores)) out[k] = toScale(scores[k], k);
    return out;
  }

  // ------------------------------------------------------------ main entry

  /**
   * input: {
   *   candidate: { name, role, experience }, config: { length, mode, accent },
   *   items: [{ question, response, analysis, followUps: [{ text, answer }], llm? }],
   *   startedAt, endedAt, integrity: { tabSwitches, pastes, repeats }
   * }
   */
  function buildScoresheet(input) {
    const items = input.items || [];
    const role = input.candidate.role || 'general';
    const effScores = items.map(blendedScores);
    const grammar = grammarAll(items);
    const flags = redFlagsAll(items);
    const speech = speechStats(items);
    const mode = (input.config && input.config.mode) || 'text';

    const dims = {};
    for (const d of DIMENSIONS) {
      if (d.key === 'language') continue;
      dims[d.key] = aggregateDimension(d.key, items, effScores);
    }
    const english = englishIndex(items);
    const lang = languageScore(items, effScores, grammar, mode, english);
    dims.language = lang.score;
    // Spoken: how clearly they come across depends on sentence-level English as much as delivery.
    // (It only ever lowers the score: a short interview with no slips proves little.)
    if (english.score != null && dims.communication != null && mode === 'voice' && english.score < dims.communication) {
      dims.communication = Math.round(dims.communication - 0.8 * (dims.communication - english.score));
    }
    // Customers have to understand the agent: weak spoken English limits customer handling too.
    const voiceRole = role === 'voice' || role === 'sales' || role === 'tech';
    if (voiceRole && mode === 'voice' && dims.customer != null && dims.communication != null && dims.communication < 60) {
      dims.customer = Math.round(dims.customer - 0.5 * (60 - dims.communication));
    }

    for (const k of Object.keys(dims)) dims[k] = toScale(dims[k], k);
    const overall = overallFor(role, dims, flags);
    let verdict = VERDICTS.find((v) => overall >= v.min);
    if (flags.some((f) => f.severity === 'high') && (verdict.key === 'strong' || verdict.key === 'hire')) verdict = VERDICTS[2];
    const answered = items.filter((it) => !it.analysis.skipped).length;
    const incomplete = items.length > 0 && answered / items.length < 0.6;

    const vocab = avgComponent(items, 'communication', 'vocabulary');
    const engBase = weightedMean([
      { value: dims.communication, weight: 0.4 },
      { value: dims.language, weight: 0.4 },
      { value: vocab, weight: 0.2 },
    ]);
    const englishLevel = engBase == null ? null : Object.assign({ score: Math.round(engBase) }, CEFR.find((c) => engBase >= c.min));

    const roleFit = Object.keys(Questions.ROLES).filter((k) => k !== 'general').map((k) => {
      let fit = overallFor(k, dims, flags);
      const notes = [];
      if ((k === 'voice' || k === 'tech' || k === 'sales') && dims.communication != null && dims.communication < 55) {
        fit -= 8;
        notes.push('needs stronger spoken fluency');
      }
      if (k === 'sales' && dims.confidence != null && dims.confidence < 60) {
        fit -= 6;
        notes.push('needs more assertiveness');
      }
      if (k === 'nonvoice' && dims.language != null && dims.language < 55) {
        fit -= 8;
        notes.push('needs more accurate written English');
      }
      if (flags.some((f) => f.id === 'shift_refusal')) notes.push('day-shift / domestic processes only');
      return { key: k, label: Questions.ROLES[k].label, fit: clamp(Math.round(fit), 0, 100), notes };
    }).sort((a, b) => b.fit - a.fit);

    const roleplayItem = items.find((it) => it.analysis.call);
    const call = roleplayItem ? roleplayItem.analysis.call : null;

    const questions = items.map((it, i) => {
      const a = it.analysis;
      return {
        id: it.question.id,
        stage: it.question.stageLabel,
        type: it.question.type,
        text: it.question.text,
        display: it.question.display || null,
        answer: it.question.type === 'roleplay' ? null : (it.mainText != null ? it.mainText : it.response.text) || '',
        turns: it.question.type === 'roleplay' ? it.response.turns || [] : null,
        followUps: it.followUps || [],
        skipped: a.skipped,
        mode: a.mode,
        scores: scaled(effScores[i]),
        ruleScores: a.scores,
        quality: toScale(a.quality),
        feedback: a.feedback,
        tip: it.question.tip,
        wordCount: a.metrics.wordCount,
        wpm: a.metrics.wpm != null ? Math.round(a.metrics.wpm) : null,
        latencySec: a.metrics.latencySec != null ? Math.round(a.metrics.latencySec * 10) / 10 : null,
        listening: a.listening,
        correction: a.correction,
        call: a.call ? a.call.items : null,
        stance: a.stance ? a.stance.stance : null,
        llm: it.llm || null,
        ignoreFlags: it.question.ignoreFlags || null,
        events: a.events,
      };
    });

    const sheet = {
      version: 1,
      id: 'iv_' + (input.endedAt || Date.now()).toString(36),
      createdAt: new Date(input.endedAt || Date.now()).toISOString(),
      candidate: input.candidate,
      role: { key: role, label: (Questions.ROLES[role] || Questions.ROLES.general).label },
      plan: { key: (input.config && input.config.length) || 'standard', label: (Questions.PLANS[(input.config && input.config.length) || 'standard'] || Questions.PLANS.standard).label },
      config: input.config || {},
      durationSec: Math.round(((input.endedAt || 0) - (input.startedAt || 0)) / 1000) || 0,
      overall,
      verdict: { key: verdict.key, label: verdict.label, tone: verdict.tone },
      incomplete,
      englishLevel,
      dimensions: DIMENSIONS.map((d) => ({ key: d.key, label: d.label, short: d.short, about: d.about, score: dims[d.key], band: band(dims[d.key]) })),
      roleFit,
      strengths: [],
      improvements: [],
      redFlags: flags,
      grammar,
      english: { words: english.words, errorRate: english.errorRate, articleRate: english.articleRate, score: english.score },
      gates: gateShortfalls(role, dims).map((g) => ({ key: g.key, bar: g.bar, score: g.score })),
      language: { taskScore: lang.taskScore != null ? Math.round(lang.taskScore) : null, grammarScore: lang.grammarScore != null ? Math.round(lang.grammarScore) : null, errors: lang.errors },
      callHandling: call ? call.items : null,
      speech,
      questions,
      integrity: Object.assign({ tabSwitches: 0, pastes: 0, repeats: 0 }, input.integrity || {}, {
        skipped: items.filter((it) => it.analysis.skipped).length,
        answered,
      }),
      llmUsed: items.some((it) => it.llm),
      summarySource: 'rules',
    };
    // Why each score is what it is, from this interview's evidence (see explain.js).
    const ex = Explain.explain(sheet, items);
    sheet.dimensions.forEach((d) => { d.why = ex.why[d.key] || []; });
    sheet.strengths = ex.strengths;
    sheet.improvements = ex.improvements;
    sheet.summary = ex.summary;
    sheet.focus = ex.focus;
    return sheet;
  }

  /** Make written feedback pleasant to hear through text-to-speech. */
  function speakable(text) {
    return String(text || '')
      .replace(/\s*→\s*/g, ', then ')
      .replace(/(\d)\s*[–-]\s*(\d)/g, '$1 to $2')
      .replace(/\s+\/\s+/g, ' or ')
      .replace(/[“”"]/g, '')
      .replace(/ ×(\d+)/g, ' $1 times')
      .replace(/(\d+)\/100/g, '$1 out of 100')
      .replace(/\bwpm\b/g, 'words per minute')
      .replace(/\be\.g\.\s*/g, 'for example, ')
      .replace(/\s*\([^)]*\)/g, '')
      .replace(/\s+([.,;:])/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** A short spoken debrief the interviewer reads aloud at the end of the call. */
  function spokenFeedback(sheet, opts) {
    const o = Object.assign({ recordings: true }, opts);
    const first = String((sheet.candidate && sheet.candidate.name) || '').trim().split(/\s+/)[0];
    const dims = sheet.dimensions.filter((d) => d.score != null).slice().sort((a, b) => b.score - a.score);
    const best = dims[0];
    const worst = dims[dims.length - 1];
    const parts = [];
    parts.push((first ? 'Thank you, ' + first + '. ' : 'Thank you. ') + "Here's your feedback.");
    parts.push('You scored ' + sheet.overall + ' out of 100, which is ' + sheet.verdict.label.toLowerCase().replace(' — ', ', ') + '.');
    if (best) parts.push('Your strongest area was ' + lower(best.short) + ', at ' + best.score + '.');
    if (worst && worst !== best && worst.score < 85) parts.push('The main area to work on is ' + lower(worst.short) + '.');
    if (sheet.focus) parts.push('What held you back: ' + speakable(sheet.focus.evidence) + ' My tip: ' + speakable(sheet.focus.tip));
    else if (sheet.improvements && sheet.improvements.length) parts.push('My top tip: ' + speakable(sheet.improvements[0]));
    if (sheet.redFlags && sheet.redFlags.some((f) => f.severity !== 'low')) parts.push('Also, be careful with answers like ' + speakable(sheet.redFlags[0].label.toLowerCase()) + '.');
    parts.push(o.recordings
      ? 'You can replay each of your answers and read detailed feedback on your scoresheet. Good luck!'
      : 'You can read detailed feedback for every answer on your scoresheet. Good luck!');
    return parts.join(' ').replace(/\.\./g, '.');
  }

  const api = { DIMENSIONS, ROLE_WEIGHTS, VERDICTS, CEFR, band, GATES, buildScoresheet, spokenFeedback, speakable };
  if (isNode) module.exports = api;
  else (root.AII = root.AII || {}).Scoring = api;
})(typeof window !== 'undefined' ? window : globalThis);
