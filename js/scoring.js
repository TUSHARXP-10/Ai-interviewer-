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
    const share = { relevance: 0.4, thought: 0.4, customer: 0.4, communication: 0.2, confidence: 0.2, attitude: 0.3 };
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

  function languageScore(items, effScores, grammar, mode) {
    const tasks = [];
    items.forEach((it, i) => {
      if (effScores[i].language != null) tasks.push(effScores[i].language);
    });
    const taskScore = tasks.length ? tasks.reduce((s, x) => s + x, 0) / tasks.length : null;
    const words = items.reduce((s, it) => s + (it.analysis.skipped ? 0 : it.analysis.metrics.wordCount), 0);
    const errors = grammar.reduce((s, g) => s + g.count, 0);
    const grammarScore = words >= 40 ? curve((errors / words) * 100, [[0, 100], [0.5, 88], [1.5, 70], [3, 50], [5, 35]]) : null;
    let mechScore = null;
    if (mode === 'text') {
      const mech = items.map((it) => it.analysis.components.communication.find((c) => c.key === 'mechanics')).filter(Boolean);
      if (mech.length) mechScore = mech.reduce((s, c) => s + c.value, 0) / mech.length;
    }
    const v = weightedMean([
      { value: taskScore, weight: 0.6 },
      { value: grammarScore, weight: 0.3 },
      { value: mechScore, weight: 0.15 },
    ]);
    return { score: v == null ? null : Math.round(v), taskScore, grammarScore, mechScore, errors };
  }

  function avgComponent(items, dim, key) {
    const vals = [];
    for (const it of items) {
      const c = (it.analysis.components[dim] || []).find((x) => x.key === key);
      if (c) vals.push(c.value);
    }
    return vals.length ? vals.reduce((s, x) => s + x, 0) / vals.length : null;
  }

  function overallFor(roleKey, dims, flags) {
    const w = ROLE_WEIGHTS[roleKey] || ROLE_WEIGHTS.general;
    const pairs = Object.keys(w).map((k) => ({ value: dims[k], weight: w[k] }));
    let v = weightedMean(pairs) || 0;
    const high = flags.filter((f) => f.severity === 'high').length;
    const medium = flags.filter((f) => f.severity === 'medium').length;
    v -= Math.min(10, high * 5) + Math.min(6, medium * 2);
    return Math.round(clamp(v, 0, 100));
  }

  // ------------------------------------------------------------ narrative

  function strengthsAndImprovements(dims, speech, items, grammar, flags, call) {
    const strengths = [];
    const d = dims;
    const pausesPerMin = speech.speakingSec >= 30 ? speech.longPauses / (speech.speakingSec / 60) : 0;

    if (d.communication != null && d.communication >= 72 && speech.fillerPer100 < 3) {
      const bits = [];
      if (speech.fillerPer100 < 2 && speech.words > 60) bits.push('very few filler words');
      if (speech.avgWpm && speech.avgWpm >= 115 && speech.avgWpm <= 170) bits.push('a comfortable pace of about ' + speech.avgWpm + ' words per minute');
      strengths.push('Clear, fluent communicator' + (bits.length ? ', with ' + list(bits) : '') + '.');
    }
    if (d.confidence != null && d.confidence >= 72 && speech.hedgePer100 < 2.5) strengths.push('Comes across as confident: answers directly and owns achievements.');
    if (d.thought != null && d.thought >= 72) strengths.push('Structured thinker who explains reasons and backs points with examples.');
    if (d.relevance != null && d.relevance >= 75) strengths.push('Stays on point and covers what interviewers look for in each answer.');
    if (d.customer != null && d.customer >= 72) strengths.push('Strong customer-handling instincts: empathy, ownership and clear solutions.');
    if (d.attitude != null && d.attitude >= 75) strengths.push('Positive, motivated attitude towards the role.');
    if (d.language != null && d.language >= 75) strengths.push('Accurate English and sharp listening: caught the key details.');
    if (speech.avgLatencySec != null && speech.avgLatencySec <= 2.5 && speech.voiceAnswers >= 3) strengths.push('Responds promptly: usually started answering within ' + speech.avgLatencySec + ' seconds.');

    // Improvements are ranked by priority so the most important ones lead.
    const ranked = [];
    const add = (priority, text) => ranked.push({ priority, text });
    const fillerTip = speech.fillerPer100 >= 3;
    const hedgeTip = speech.hedgePer100 >= 2.5;
    const latencyTip = speech.avgLatencySec != null && speech.avgLatencySec > 5;
    if (fillerTip) add(60 + speech.fillerPer100 * 3, 'Cut filler words (' + speech.topFillers.slice(0, 3).map((t) => '“' + t.term + '” ×' + t.count).join(', ') + '). Pause silently instead and practise 60-second answers out loud.');
    if (hedgeTip) add(55 + speech.hedgePer100 * 3, 'Sound more certain: replace ' + (speech.topHedges.length ? speech.topHedges.slice(0, 3).map((t) => '“' + t.term + '”').join(', ') : '“I think / maybe”') + ' with direct statements (“I would…”, “I can…”).');
    if (latencyTip) add(50 + speech.avgLatencySec * 2, 'Start answers sooner (average wait ' + speech.avgLatencySec + 's). Use a bridge sentence such as “That\'s a good question. In my experience…” while you organise your thoughts.');
    if (speech.avgWpm && speech.avgWpm > 185) add(58, 'Slow down: you averaged ' + speech.avgWpm + ' wpm. 130–160 wpm is easier for customers to follow.');
    if (speech.avgWpm && speech.avgWpm < 95) add(56, 'Speak a little faster and more continuously (averaged ' + speech.avgWpm + ' wpm).');
    if (pausesPerMin > 2) add(48 + pausesPerMin * 2, 'Reduce long mid-answer pauses (' + speech.longPauses + ' in total). Plan your 2–3 main points before you start speaking.');
    if (speech.pitchVariation != null && speech.pitchVariation < 1.2) add(45, 'Add warmth and variety to your tone. A flat voice can sound disinterested on calls.');

    if (d.communication != null && d.communication < 65 && !fillerTip) add(100 - d.communication, 'Build fluency and range: give fuller answers in complete sentences, and practise speaking on everyday topics for 1–2 minutes daily.');
    if (d.confidence != null && d.confidence < 65 && !hedgeTip && !latencyTip) add(100 - d.confidence, 'Project confidence: give complete answers, speak up, and avoid trailing off at the end.');
    if (d.thought != null && d.thought < 62) add(100 - d.thought, 'Structure answers: use STAR (Situation, Task, Action, Result) for experience questions, and “first… then… finally” for situations.');
    if (d.relevance != null && d.relevance < 62) add(100 - d.relevance, 'Answer the exact question first, then cover the key points. Each question in the breakdown below lists what a strong answer includes.');
    const missing = call ? call.items.filter((i) => !i.hit).map((i) => i.label.toLowerCase()) : [];
    if (d.customer != null && (d.customer < 65 || missing.length >= 2)) {
      add(Math.max(40, 100 - d.customer), 'Practise the call flow Greet → Empathise → Probe → Resolve → Close' + (missing.length ? ' (missed on the mock call: ' + list(missing.slice(0, 3)) + ')' : '') + '.');
    }
    if (d.attitude != null && d.attitude < 62) add(100 - d.attitude, 'Show genuine motivation: talk about growth, learning and helping customers, and avoid phrases that sound like a last resort.');
    if (d.language != null && d.language < 65) add(100 - d.language, 'Polish English accuracy' + (grammar.length ? ' (e.g. “' + grammar[0].evidence + '” → ' + grammar[0].fix + ')' : '') + ' and practise noting down names and numbers while listening.');
    const skipped = items.filter((it) => it.analysis.skipped).length;
    if (skipped) add(85, 'Attempt every question: ' + skipped + ' skipped. A reasoned attempt always scores better than silence.');
    for (const f of flags.filter((x) => x.severity !== 'low').slice(0, 2)) add(f.severity === 'high' ? 95 : 80, 'Avoid red-flag answers: ' + f.label.toLowerCase() + ' (“' + f.evidence + '”).');
    const improvements = ranked.sort((a, b) => b.priority - a.priority).map((x) => x.text);

    if (!improvements.length) {
      const lowest = DIMENSIONS.filter((x) => d[x.key] != null).sort((a, b) => d[a.key] - d[b.key])[0];
      const polish = {
        communication: 'Polish delivery further: record yourself and trim any remaining fillers or long pauses.',
        confidence: 'Keep building presence: start answers promptly and finish sentences with energy.',
        thought: 'Make answers even sharper: lead with the main point, then give one example with a number.',
        relevance: 'Tie every answer back to the role: why it matters for customers and the team.',
        customer: 'Refine the call flow: always confirm the resolution and timeline before closing.',
        attitude: 'Show even more curiosity: prepare two thoughtful questions about the role and growth path.',
        language: 'Keep practising English accuracy, and read details back to customers to confirm them.',
      };
      if (lowest) improvements.push(polish[lowest.key] + ' (lowest area: ' + lower(lowest.short) + ', ' + d[lowest.key] + '/100)');
    }
    if (!strengths.length) {
      const best = DIMENSIONS.filter((x) => d[x.key] != null).sort((a, b) => d[b.key] - d[a.key])[0];
      if (best) strengths.push('Relative strength: ' + lower(best.short) + ' (' + d[best.key] + '/100). Build on this.');
    }
    return { strengths: strengths.slice(0, 5), improvements: improvements.slice(0, 6) };
  }

  // "Answer quality" -> "answer quality", but keep "English" capitalised.
  function lower(label) {
    return /^English/.test(label) ? label : label.charAt(0).toLowerCase() + label.slice(1);
  }

  function summaryText(sheet) {
    const name = sheet.candidate.name || 'The candidate';
    const d = sheet.dimensions.filter((x) => x.score != null);
    const sorted = d.slice().sort((a, b) => b.score - a.score);
    const top = sorted.slice(0, 2);
    const low = sorted.slice(-2).filter((x) => x.score < 70).reverse();
    const parts = [];
    parts.push(name + ' completed the ' + sheet.plan.label.toLowerCase() + ' for ' + sheet.role.label + ' in ' + minutesText(sheet.durationSec) + ' and scored ' + sheet.overall + '/100 (' + sheet.verdict.label.toLowerCase() + ').');
    if (top.length) parts.push('The strongest areas were ' + list(top.map((x) => lower(x.short) + ' (' + x.score + ')')) + '.');
    if (low.length) parts.push('The main areas to develop are ' + list(low.map((x) => lower(x.short) + ' (' + x.score + ')')) + '.');
    const s = sheet.speech;
    const obs = [];
    if (s.voiceAnswers) {
      if (s.avgWpm) obs.push('spoke at about ' + s.avgWpm + ' words per minute');
      if (s.avgLatencySec != null) obs.push('typically began answering within ' + s.avgLatencySec + ' seconds');
    }
    if (s.fillerPer100 >= 3) obs.push('used noticeable filler words (' + s.fillerPer100 + ' per 100 words)');
    else if (s.words > 80) obs.push('used very few filler words');
    if (obs.length) parts.push(name + ' ' + list(obs) + '.');
    if (sheet.englishLevel) parts.push('English proficiency is estimated at ' + sheet.englishLevel.code + ' (' + sheet.englishLevel.label.toLowerCase() + ').');
    if (sheet.redFlags.length) parts.push('Points to probe further: ' + list(sheet.redFlags.map((f) => f.label.toLowerCase())) + '.');
    const weakestDim = low[0] || sorted[sorted.length - 1];
    const weakest = weakestDim ? lower(weakestDim.short) : 'consistency';
    const close = {
      strong: 'Recommended to move forward to the next round.',
      hire: 'Recommended for the next round, with coaching on ' + weakest + '.',
      borderline: 'Could be considered with structured training in ' + weakest + '; a re-interview after some practice is suggested.',
      no: 'Not ready for a customer-facing role yet. Focused practice on ' + weakest + ' and a re-attempt in a few weeks is recommended.',
    }[sheet.verdict.key];
    parts.push(close);
    return parts.join(' ');
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
    const lang = languageScore(items, effScores, grammar, mode);
    dims.language = lang.score;

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
    const narrative = strengthsAndImprovements(dims, speech, items, grammar, flags, call);

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
        scores: effScores[i],
        ruleScores: a.scores,
        quality: a.quality,
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
      strengths: narrative.strengths,
      improvements: narrative.improvements,
      redFlags: flags,
      grammar,
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
    sheet.summary = summaryText(sheet);
    return sheet;
  }

  const api = { DIMENSIONS, ROLE_WEIGHTS, VERDICTS, CEFR, band, buildScoresheet, summaryText };
  if (isNode) module.exports = api;
  else (root.AII = root.AII || {}).Scoring = api;
})(typeof window !== 'undefined' ? window : globalThis);
