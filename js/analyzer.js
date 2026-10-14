/*
 * analyzer.js — turns one answer into measurable signals and 0–100 scores.
 *
 * Signals come from three places:
 *   1. the transcript (words, fillers, hedges, structure, coverage of the rubric…)
 *   2. timing (how long before the candidate started, speaking rate)
 *   3. the microphone (pauses, loudness, pitch variation) — voice mode only
 *
 * Each dimension score is a weighted blend of components; components that
 * could not be measured (e.g. pitch in typing mode) are simply left out, so
 * the remaining ones are re-weighted instead of counting as zero.
 */
(function (root) {
  'use strict';
  const isNode = typeof module === 'object' && module.exports;
  const Text = isNode ? require('./textUtils.js') : root.AII.Text;
  const L = isNode ? require('./lexicons.js') : root.AII.Lexicons;

  const { makeDoc, findTerms, findTerm, negatedAt, curve, weightedMean, clamp } = Text;

  const grammarRegexCache = new Map();
  function grammarRegex(body) {
    if (!grammarRegexCache.has(body)) grammarRegexCache.set(body, new RegExp('(?:^|(?<= ))(?:' + body + ')', 'g'));
    return grammarRegexCache.get(body);
  }

  function snippet(doc, w0, w1) {
    const t0 = doc.wordToken[w0];
    const t1 = doc.wordToken[w1];
    if (t0 == null || t1 == null) return '';
    return doc.text.slice(doc.tokens[t0].start, doc.tokens[t1].end);
  }

  function countBy(hits) {
    const m = new Map();
    for (const h of hits) {
      const term = h.text.replace(/\bi\b/g, 'I'); // display form: "i think" -> "I think"
      m.set(term, (m.get(term) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([term, count]) => ({ term, count }));
  }

  // ------------------------------------------------------------ detectors

  function detectRedFlags(doc, ignore) {
    const out = [];
    for (const flag of L.RED_FLAGS) {
      if (ignore && ignore.indexOf(flag.id) !== -1) continue;
      for (const h of findTerms(doc, flag.terms)) {
        if (flag.negatable && negatedAt(doc, h.w0, 3)) continue;
        out.push({ id: flag.id, label: flag.label, severity: flag.severity, evidence: snippet(doc, h.w0, h.w1), w0: h.w0, w1: h.w1 });
        break; // one hit per flag per answer is enough
      }
    }
    return out;
  }

  function detectGrammar(doc) {
    const out = [];
    for (const rule of L.GRAMMAR) {
      const rx = grammarRegex(rule.re);
      rx.lastIndex = 0;
      let m;
      let n = 0;
      while ((m = rx.exec(doc.str)) && n < 3) {
        if (!m[0]) { rx.lastIndex++; continue; }
        const w0 = wordAt(doc, m.index);
        const w1 = wordAt(doc, m.index + Math.max(0, m[0].trimEnd().length - 1));
        if (out.some((g) => g.w0 <= w1 && w0 <= g.w1)) continue; // one slip, one count
        out.push({ wrong: rule.wrong, fix: rule.fix, why: rule.why, evidence: snippet(doc, w0, w1), w0, w1 });
        n++;
      }
    }
    return out.sort((a, b) => a.w0 - b.w0);
  }

  /** Informal or vague words, and everyday words used 3+ times in a longer answer. */
  function detectVocab(doc) {
    const out = [];
    for (const v of L.VOCAB) {
      for (const h of findTerms(doc, v.terms)) out.push({ word: snippet(doc, h.w0, h.w1), better: v.better, why: v.why, w0: h.w0, w1: h.w1 });
    }
    if (doc.words.length >= 12) { // three times in a dozen words is noticeable
      const at = new Map();
      doc.words.forEach((w, i) => {
        if (!Object.prototype.hasOwnProperty.call(L.OVERUSED, w)) return;
        if (w === 'very' && doc.words[i + 1] === 'much') return; // "thank you very much"
        if (!at.has(w)) at.set(w, []);
        at.get(w).push(i);
      });
      for (const [w, idx] of at) {
        if (idx.length < 3) continue;
        for (const i of idx) out.push({ word: snippet(doc, i, i), better: L.OVERUSED[w], why: 'Used ' + idx.length + ' times', w0: i, w1: i });
      }
    }
    return out.sort((a, b) => a.w0 - b.w0);
  }

  function wordAt(doc, charIndex) {
    let w = 0;
    for (let i = 0; i < doc.offsets.length; i++) if (doc.offsets[i] <= charIndex) w = i;
    return w;
  }

  function confidentHits(doc, hedgeHits) {
    return findTerms(doc, L.CONFIDENT).filter((h) => {
      const next = doc.words[h.w1 + 1];
      if (next === 'not' || next === 'try') return false;
      if (negatedAt(doc, h.w0, 2)) return false;
      return !hedgeHits.some((g) => g.w0 <= h.w1 && h.w0 <= g.w1);
    });
  }

  function sentiment(doc) {
    let pos = 0;
    let neg = 0;
    for (const h of findTerms(doc, L.POSITIVE)) negatedAt(doc, h.w0, 2) ? neg++ : pos++;
    for (const h of findTerms(doc, L.NEGATIVE)) negatedAt(doc, h.w0, 2) ? pos++ : neg++;
    return { pos, neg, net: (pos - neg) / (pos + neg + 2) };
  }

  function coverage(doc, question) {
    const concepts = question.concepts || [];
    let total = 0;
    let got = 0;
    const matched = [];
    const missing = [];
    for (const c of concepts) {
      const w = c.weight || 1;
      total += w;
      const hits = findTerms(doc, c.terms).filter((h) => !(c.negatable && negatedAt(doc, h.w0, 4)));
      if (hits.length) {
        got += w;
        matched.push(c);
      } else missing.push(c);
    }
    const ratio = total ? got / total : null;
    const target = question.coverageTarget || 0.6;
    const score = ratio == null ? null : curve(ratio / target, [[0, 10], [0.34, 40], [0.67, 68], [1, 95], [1.2, 100]]);
    return { ratio, score, matched: matched.map((c) => c.id), missing: missing.map((c) => c.id), matchedLabels: matched.map((c) => c.label), missingLabels: missing.map((c) => c.label) };
  }

  /** Writing mechanics for typed answers (matters most for chat/email roles). */
  function mechanics(text) {
    const src = String(text || '').trim();
    if (!src) return { errors: 0, items: [] };
    const items = [];
    const lowerI = (src.match(/(^|[\s,(])i(?=[\s',.!?’]|$)/g) || []).length;
    if (lowerI) items.push({ issue: 'Lower-case "i" as a pronoun', count: lowerI });
    const sentences = src.split(/(?<=[.!?])\s+/).filter((s) => s.length > 2);
    const lowerStart = sentences.filter((s) => /^[a-z]/.test(s)).length;
    if (lowerStart) items.push({ issue: 'Sentences starting with a lower-case letter', count: lowerStart });
    if (src.length > 25 && !/[.!?]["')\]]?$/.test(src)) items.push({ issue: 'No closing punctuation', count: 1 });
    const sms = src.match(/\b(u|ur|pls|plz|plzz|thx|coz|bcoz|bcz|becoz|b4|gonna|wanna|dont|cant|wont|im|ive|didnt|doesnt|isnt|wasnt|abt|wat|tmrw|msg)\b/gi) || [];
    if (sms.length) items.push({ issue: 'Text-speak / missing apostrophes (' + [...new Set(sms.map((s) => s.toLowerCase()))].slice(0, 4).join(', ') + ')', count: sms.length });
    const runOn = sentences.filter((s) => s.split(/\s+/).length > 45).length;
    if (runOn) items.push({ issue: 'Very long run-on sentences', count: runOn });
    return { errors: items.reduce((s, x) => s + x.count, 0), items };
  }

  /** Mock-call checklist over the agent's turns. */
  function callChecklist(agentTurns, name) {
    const list = L.CALL_CHECKLIST[name] || L.CALL_CHECKLIST.support;
    const turns = (agentTurns || []).map((t) => makeDoc(t || ''));
    const all = makeDoc((agentTurns || []).join(' . '));
    const items = list.map((item) => {
      let doc = all;
      // An opening only counts at the start, a closing only at the end.
      if (item.id === 'opening' && turns.length) doc = turns[0];
      if (item.id === 'closing' && turns.length) doc = turns[turns.length - 1];
      const hits = findTerms(doc, item.terms).filter((h) => !(item.id !== 'probing' && negatedAt(doc, h.w0, 2)));
      // A few words either side, from the one turn where it was said ("refund within 5 to 7 working days").
      let ev = '';
      if (hits.length) {
        const src = doc === all ? turns.find((d) => findTerms(d, item.terms).length) || all : doc;
        const h = doc === all && src !== all ? findTerms(src, item.terms)[0] : hits[0];
        ev = snippet(src, Math.max(0, h.w0 - 2), Math.min(src.words.length - 1, h.w1 + 5));
      }
      return { id: item.id, label: item.label, tip: item.tip, hit: hits.length > 0, evidence: ev };
    });
    const map = {};
    for (const it of items) map[it.id] = it.hit;
    return { items, map, pct: items.length ? (items.filter((i) => i.hit).length / items.length) * 100 : 0 };
  }

  function listeningCheck(doc, question) {
    const numbers = Text.extractNumbers(doc);
    const items = (question.expected || []).map((exp) => {
      let hit = false;
      if (exp.digits) hit = numbers.some((n) => n.indexOf(exp.digits) !== -1);
      if (!hit && exp.terms) hit = exp.terms.some((t) => findTerm(doc, t).length > 0);
      return { id: exp.id, label: exp.label, hit };
    });
    const recall = items.length ? items.filter((i) => i.hit).length / items.length : 0;
    return { items, recall };
  }

  function correctionCheck(doc, question) {
    const accepted = (question.accept || []).some((t) => findTerm(doc, t).length > 0);
    const rejected = (question.reject || []).some((t) => findTerm(doc, t).length > 0);
    let score;
    let verdict;
    if (accepted && !rejected) { score = 100; verdict = 'correct'; }
    else if (accepted && rejected) { score = 60; verdict = 'partly correct'; }
    else if (rejected) { score = 0; verdict = 'repeated the error'; }
    else if (doc.words.length) { score = 30; verdict = 'not the expected correction'; }
    else { score = 0; verdict = 'no answer'; }
    return { accepted, rejected, score, verdict, correct: question.correct };
  }

  function stanceCheck(doc, question) {
    const s = question.stance;
    const all = s.yes.concat(s.no, s.conditional, ['will not be a problem', 'would not be a problem', 'will not be an issue', 'not an issue', 'no issue', 'no issues']);
    const yesSet = new Set(s.yes.concat(['will not be a problem', 'would not be a problem', 'will not be an issue', 'not an issue', 'no issue', 'no issues']));
    const noSet = new Set(s.no);
    let yes = 0;
    let no = 0;
    let cond = 0;
    for (const h of findTerms(doc, all)) {
      if (yesSet.has(h.term)) yes++;
      else if (noSet.has(h.term)) no++;
      else cond++;
    }
    let stance = 'unclear';
    if (no && !yes) stance = 'negative';
    else if (yes && no) stance = 'mixed';
    else if (yes && cond) stance = 'conditional';
    else if (yes) stance = 'positive';
    const score = { positive: 92, conditional: 72, mixed: 55, unclear: 50, negative: 25 }[stance];
    return { stance, score };
  }

  // How "thought process" is weighted for each kind of question.
  const THOUGHT_WEIGHTS = {
    behavioral: { structure: 0.3, star: 0.35, specificity: 0.15, coverage: 0.2 },
    situational: { structure: 0.45, specificity: 0.1, coverage: 0.45 },
    knowledge: { structure: 0.25, specificity: 0.15, coverage: 0.6 },
    open: { structure: 0.25, specificity: 0.3, coverage: 0.45 },
    extempore: { structure: 0.4, specificity: 0.3, coverage: 0.3 },
    default: { structure: 0.4, specificity: 0.2, coverage: 0.4 },
  };

  // ------------------------------------------------------------ main entry

  /**
   * question  — entry from questionBank
   * response  — { text, turns?, mode, timing: { latencyMs, speakingMs, totalMs },
   *               audio?, events: { repeats, skipped, pasted, timedOut } }
   */
  function analyzeAnswer(question, response) {
    const resp = response || {};
    const mode = resp.mode || 'text';
    const events = resp.events || {};
    const agentTurns = question.type === 'roleplay' ? (resp.turns || []).map((t) => t.agent || '') : null;
    const text = agentTurns ? agentTurns.join(' . ') : String(resp.text || '');
    const doc = makeDoc(text);
    const wc = doc.tokens.length;
    const skipped = !!events.skipped || wc === 0;

    const fillerHits = findTerms(doc, L.FILLERS);
    const repHits = Text.repetitions(doc);
    const hedgeHits = findTerms(doc, L.HEDGES);
    const confHits = confidentHits(doc, hedgeHits);
    const negSelfHits = findTerms(doc, L.NEGATIVE_SELF);
    const dontKnowHits = findTerms(doc, L.DONT_KNOW);
    const dontKnow = dontKnowHits.length > 0 && wc < 25;
    const structure = {};
    for (const k of Object.keys(L.STRUCTURE)) structure[k] = findTerms(doc, L.STRUCTURE[k]).length;
    // The candidate's own story: "I did…", "we called…" (past-tense first person).
    const story = findTerms(doc, ['re:(?:i|we) (?:\\w+ed|was|were|did|had|went|told|gave|made|took|got|said|saw|felt|kept|found|put|paid|thought|knew|left|spoke|brought|sat|stood|lost|won|ran|came|began|became|understood|taught|sent|bought|read|wrote|forgot|let|met)(?= |$)']).length;
    const star = {};
    for (const k of Object.keys(L.STAR)) star[k] = findTerms(doc, L.STAR[k]).length > 0;
    // Natural storytelling ("I sat with her, we called the bank…") is action even without textbook verbs.
    if (story >= 2) star.action = true;
    const starCount = Object.values(star).filter(Boolean).length;
    const specificity = findTerms(doc, L.SPECIFICITY).length;
    const empathyHits = findTerms(doc, L.EMPATHY);
    const politeHits = findTerms(doc, L.POLITE);
    const senti = sentiment(doc);
    const redFlags = detectRedFlags(doc, question.ignoreFlags);
    const grammar = wc >= 3 ? detectGrammar(doc) : [];
    const cov = coverage(doc, question);
    const mech = mode === 'text' && wc >= 8 ? mechanics(text) : null;

    const clicheHits = findTerms(doc, L.CLICHES);
    const articles = doc.words.filter((w) => w === 'a' || w === 'an' || w === 'the').length;

    const alpha = doc.words.filter((w) => /^[a-z]+$/.test(w));
    const mattr = Text.mattr(alpha, 30);
    const content = alpha.filter((w) => w.length >= 3 && !L.COMMON_WORDS.has(w));
    const sophistication = alpha.length ? content.length / alpha.length : 0;

    const timing = resp.timing || {};
    const speakingMs = timing.speakingMs || 0;
    let wpm = mode === 'voice' && speakingMs >= 4000 && wc >= 8 ? wc / (speakingMs / 60000) : null;
    if (wpm != null && (wpm < 40 || wpm > 260)) wpm = null; // implausible: timing was unreliable
    const latencySec = mode === 'voice' && timing.latencyMs != null ? timing.latencyMs / 1000 : null;
    const audio = mode === 'voice' && resp.audio && resp.audio.voicedFrames > 10 ? resp.audio : null;

    const per100 = (n) => (wc ? (n / wc) * 100 : 0);
    // Role-play answers are judged per turn, not on the combined length.
    const lenWords = agentTurns ? wc / Math.max(1, agentTurns.length) : wc;
    const fillerRate = per100(fillerHits.length + repHits.length);
    const hedgeRate = per100(hedgeHits.length);
    const minW = question.minWords || 20;
    const [lo, hi] = question.ideal || [minW * 1.5, minW * 4];
    const completeness = curve(lenWords, [[0, 0], [minW * 0.5, 35], [minW, 70], [Math.max(lo, minW + 1), 100], [Math.max(hi, lo + 2), 100], [hi * 1.8, 82], [hi * 3, 65]]);

    // A keyword-hitting but very short answer should not get full credit for content.
    const depth = 0.55 + 0.45 * Math.min(1, lenWords / minW);
    const covScore = cov.score == null ? null : cov.score * depth;

    const metrics = {
      wordCount: wc,
      fillers: { count: fillerHits.length, repetitions: repHits.length, per100: fillerRate, top: countBy(fillerHits).slice(0, 4) },
      hedges: { count: hedgeHits.length, per100: hedgeRate, top: countBy(hedgeHits).slice(0, 4) },
      confident: { count: confHits.length, top: countBy(confHits).slice(0, 4) },
      negativeSelfTalk: negSelfHits.map((h) => snippet(doc, h.w0, h.w1)),
      dontKnow,
      structure,
      star,
      starCount,
      specificity,
      empathy: { count: empathyHits.length, top: countBy(empathyHits).slice(0, 4) },
      polite: politeHits.length,
      sentiment: senti,
      redFlags: redFlags.map(({ id, label, severity, evidence }) => ({ id, label, severity, evidence })),
      grammar: grammar.map(({ wrong, fix, why, evidence }) => ({ wrong, fix, why, evidence })),
      english: { words: alpha.length, articles, errors: grammar.length },
      cliches: countBy(clicheHits),
      coverage: cov,
      mattr,
      sophistication,
      wpm,
      latencySec,
      mechanics: mech,
      audio: audio
        ? {
          longPauses: audio.longPauses,
          longestPauseSec: audio.longestPauseMs / 1000,
          snrDb: audio.snrDb,
          trailOffDb: audio.trailOffDb,
          pitchSdSemitones: audio.pitchFrames >= 25 ? audio.pitchSdSemitones : null,
          voicedRatio: audio.voicedRatio,
        }
        : null,
    };

    // ---------------- type-specific checks
    let listening = null;
    let correction = null;
    let stance = null;
    let call = null;
    let askedQuestion = null;
    if (question.type === 'listening') listening = listeningCheck(doc, question);
    if (question.type === 'correction') correction = correctionCheck(doc, question);
    if (question.type === 'flexibility' && question.stance) {
      stance = stanceCheck(doc, question);
      if (stance.stance === 'negative' && !redFlags.some((f) => f.id === 'shift_refusal')) {
        redFlags.push({ id: 'shift_refusal', label: 'Not open to shifts / weekends', severity: 'medium', evidence: text.slice(0, 80) });
        metrics.redFlags.push(redFlags[redFlags.length - 1]);
      }
    }
    if (question.type === 'roleplay') call = callChecklist(agentTurns, question.checklist);
    if (question.type === 'closing') {
      const asks = /\?/.test(text) || (wc >= 4 && findTerms(doc, ['what', 'how', 'when', 'which', 'could you', 'can you', 'will there', 'is there', 'are there', 'do you', 'would i', 'i want to know', 'i would like to know', 'i wanted to ask', 'i would like to ask', 'tell me about', 'tell me more']).length > 0);
      const topics = findTerms(doc, ['training', 'growth', 'career', 'team', 'process', 'shift*', 'timing*', 'next step*', 'expect*', 'performance', 'appraisal', 'culture', 'client*', 'location', 'joining', 'role', 'responsibilit*', 'success', 'typical day', 'improve', 'feedback']).length;
      askedQuestion = { asks, topics };
    }

    // ---------------- dimension scores
    const comps = { communication: [], confidence: [], thought: [], relevance: [], customer: [], attitude: [], language: [] };
    const add = (dim, key, label, value, weight) => {
      if (value == null || Number.isNaN(value)) return;
      comps[dim].push({ key, label, value: clamp(value, 0, 100), weight });
    };
    const dims = question.dims || {};
    const longAnswer = wc >= 15;

    // Flow from the microphone: how much of the answer was voice rather than silence, and how
    // often the candidate stopped for 2+ seconds. Browsers drop "um"/"uh" from transcripts,
    // so this is the most honest hesitation signal we have.
    let flow = null;
    if (audio && speakingMs >= 5000) {
      const perMin = audio.longPauses / (speakingMs / 60000);
      // Natural fluent speech measures about 0.55–0.7 here (gaps between phrases count as silence).
      const ratio = audio.voicedRatio != null ? curve(audio.voicedRatio, [[0.25, 25], [0.35, 45], [0.45, 70], [0.55, 90], [0.6, 100]]) : null;
      const gaps = curve(perMin, [[0, 100], [1, 90], [2, 75], [3.5, 58], [6, 40], [10, 25]]);
      flow = ratio == null ? gaps : 0.5 * ratio + 0.5 * gaps;
    }
    const grammarPer100 = per100(grammar.length);

    // Communication
    if (!skipped) {
      add('communication', 'fluency', 'Fluency (fillers, “like”, restarts)', curve(fillerRate, [[0, 100], [1, 90], [2, 72], [3, 58], [4.5, 45], [7, 32], [12, 20]]), wc >= 8 ? 0.25 : 0.08);
      if (wc >= 12) add('communication', 'grammar', 'Grammar while speaking', curve(grammarPer100, [[0, 100], [1, 85], [2.5, 65], [4, 48], [6, 35], [10, 20]]), 0.2);
      add('communication', 'completeness', 'Completeness', completeness, 0.22);
      if (longAnswer) add('communication', 'vocabulary', 'Vocabulary range', 0.6 * curve(mattr, [[0.4, 30], [0.55, 55], [0.68, 80], [0.78, 95], [0.85, 100]]) + 0.4 * curve(sophistication, [[0.05, 35], [0.12, 60], [0.2, 80], [0.3, 95], [0.4, 100]]), 0.12);
      if (wpm != null) add('communication', 'pace', 'Speaking pace', curve(wpm, [[60, 20], [80, 40], [95, 62], [110, 85], [120, 96], [125, 100], [165, 100], [180, 85], [200, 62], [230, 40]]), 0.15);
      if (flow != null) add('communication', 'pauses', 'Flow (long pauses & silences)', flow, 0.15);
      if (metrics.audio && metrics.audio.pitchSdSemitones != null) add('communication', 'modulation', 'Voice modulation', curve(metrics.audio.pitchSdSemitones, [[0.5, 40], [1.2, 62], [2, 85], [3, 100], [5.5, 100], [8, 80]]), 0.05);
      if (mech) add('communication', 'mechanics', 'Writing mechanics', curve(per100(mech.errors), [[0, 100], [2, 80], [5, 55], [10, 30]]), 0.2);
    }

    // Confidence
    if (!skipped) {
      add('confidence', 'hedging', 'Direct language (few hedges)', curve(hedgeRate, [[0, 100], [0.5, 90], [1, 78], [1.5, 66], [2.5, 52], [4, 40], [8, 22]]), wc >= 8 ? 0.25 : 0.1);
      // A couple of seconds to think is normal in an interview; long silences before starting are not.
      if (latencySec != null) add('confidence', 'latency', 'Response readiness', curve(latencySec, [[0, 100], [1.5, 100], [3, 85], [4.5, 66], [6, 50], [9, 32], [13, 22]]), 0.2);
      if (audio) {
        const drop = Math.max(0, audio.trailOffDb || 0);
        // Lenient: how loud a voice measures depends a lot on the microphone and the room.
        add('confidence', 'voice', 'Voice strength', curve(audio.snrDb, [[4, 30], [8, 55], [12, 80], [16, 95], [20, 100]]) - curve(drop, [[3, 0], [6, 10], [9, 20]]), 0.15);
      }
      if (flow != null) add('confidence', 'flow', 'Steady delivery (few long pauses)', flow, 0.1);
      add('confidence', 'directness', 'Answer commitment', dontKnow ? 15 : curve(lenWords / minW, [[0, 10], [0.5, 40], [1, 75], [1.5, 95], [2, 100]]), 0.2);
      add('confidence', 'fillers', 'Composure (fillers)', curve(fillerRate, [[0, 100], [1.5, 85], [3, 66], [5, 50], [10, 30]]), 0.1);
    } else {
      add('confidence', 'skipped', 'Question skipped', 20, 1);
    }

    // Rehearsed answers: stock phrases instead of a real example or concrete detail
    // (two with nothing concrete, or three or more in any case).
    const noExample = !structure.example && starCount < 2;
    // (Not on knowledge questions, where terms like AHT and CSAT are the topic.)
    const rehearsed = !skipped && question.type !== 'knowledge' && ((clicheHits.length >= 3 && noExample) || clicheHits.length >= 5 || (clicheHits.length >= 2 && specificity === 0 && noExample));
    // Experience questions need the candidate's own story ("I did…", "we had…"), not a general statement.
    const needsStory = question.type === 'behavioral' && !skipped && story === 0;

    // Thought process
    if (!skipped && ['listening', 'correction', 'closing', 'flexibility'].indexOf(question.type) === -1) {
      const s = structure;
      const structScore = curve(Math.min(s.sequencing, 1) + 1.2 * Math.min(s.reasoning, 1) + Math.min(s.example, 1) + 0.5 * Math.min(s.contrast, 1) + 0.6 * Math.min(s.summary, 1) + 0.3 * Math.max(0, s.reasoning - 1), [[0, 25], [1, 50], [2, 72], [3, 88], [4, 100]]);
      if (question.type === 'roleplay') {
        add('thought', 'structure', 'Logical flow', structScore, 0.4);
        add('thought', 'resolution', 'Reached a resolution', call && call.map.resolution ? (call.map.timeline ? 100 : 70) : 25, 0.6);
      } else {
        const w = THOUGHT_WEIGHTS[question.type] || THOUGHT_WEIGHTS.default;
        add('thought', 'structure', 'Structure & reasoning', structScore, w.structure);
        // A developed answer (several connected points) shows thinking even without textbook markers.
        add('thought', 'elaboration', 'Developed answer', curve(lenWords / Math.max(lo, minW + 1), [[0.25, 15], [0.5, 40], [0.8, 70], [1, 85], [1.3, 100]]), 0.25);
        if (w.star) add('thought', 'star', 'STAR storytelling', curve(starCount, [[0, 10], [1, 35], [2, 60], [3, 82], [4, 100]]), w.star);
        add('thought', 'specificity', 'Specific details', curve(specificity, [[0, 30], [1, 55], [2, 75], [4, 100]]), w.specificity);
        if (covScore != null) add('thought', 'coverage', 'Considered the key angles', covScore, w.coverage);
      }
    } else if (skipped && dims.thought) {
      add('thought', 'skipped', 'Question skipped', 0, 1);
    }

    // Relevance / answer quality
    if (skipped) add('relevance', 'skipped', 'Question skipped', 0, 1);
    else if (listening) add('relevance', 'recall', 'Details recalled', listening.recall * 100, 1);
    else if (correction) add('relevance', 'correction', 'Correct sentence', correction.score, 1);
    else if (call) {
      add('relevance', 'checklist', 'Call-handling checklist', curve(call.pct / 100 / (question.coverageTarget || 0.75), [[0, 15], [0.34, 48], [0.67, 75], [1, 100]]), 0.8);
      add('relevance', 'completeness', 'Completeness', completeness, 0.2);
    } else if (stance) {
      add('relevance', 'stance', 'Clear answer', stance.stance === 'unclear' ? 45 : 90, 1);
    } else if (askedQuestion) {
      add('relevance', 'asked', 'Engaged with the interviewer', askedQuestion.asks ? 90 : 60, 1);
    } else if (cov.score != null) {
      add('relevance', 'coverage', 'Covered the key points', dontKnow ? Math.min(covScore, 20) : covScore, 0.55);
      // Length and detail only count for an answer that is about the question.
      const onTopic = Math.min(1, (cov.ratio || 0) / ((question.coverageTarget || 0.6) * 0.75));
      add('relevance', 'completeness', 'Completeness', completeness * onTopic, 0.15);
      // Substance: a real example or concrete detail, not just the right words.
      const substance = Math.min(specificity, 2) + Math.min(structure.example, 1) + (starCount >= 3 ? 1 : 0);
      add('relevance', 'substance', 'Substance (examples & specifics)', dontKnow ? 10 : curve(substance, [[0, 35], [1, 65], [2, 85], [3, 100]]) * onTopic, 0.3);
    }

    // The live call: how the customer's mood moved, and how the call ended.
    const live = question.type === 'roleplay' && resp.call ? resp.call : null;
    // The topic talk: how long the candidate kept talking (target: most of three minutes).
    const talkSec = question.longTalk && !skipped ? Math.max(speakingMs / 1000, wc / 2.3) : null;
    if (talkSec != null) {
      const sustain = curve(talkSec, [[10, 10], [30, 30], [60, 55], [100, 78], [140, 92], [165, 100]]);
      add('communication', 'sustain', 'Kept talking (speaking time)', sustain, 0.25);
      add('confidence', 'sustain', 'Kept going without drying up', sustain, 0.25);
      add('thought', 'sustain', 'Enough to say on the topic', sustain, 0.2);
    }
    // Why BPO: a genuine reason is personal and specific, not a recital or money alone.
    let genuine = null;
    if (question.id === 'why_bpo' && !skipped) {
      const personal = (story > 0 ? 1 : 0) + (structure.example > 0 ? 1 : 0) + Math.min(1, specificity);
      const reasons = cov.matched ? cov.matched.length : 0;
      const money = redFlags.some((f) => f.id === 'money_only' || f.id === 'no_option' || f.id === 'temporary');
      genuine = { personal, reasons, money, score: Math.max(0, curve(personal * 1.2 + Math.min(reasons, 3) * 0.6, [[0, 15], [1, 40], [2, 62], [3, 82], [4, 100]]) - (rehearsed ? 20 : 0) - (money ? 30 : 0)) };
    }

    // Customer handling
    if (dims.customer) {
      if (skipped) add('customer', 'skipped', 'Question skipped', 0, 1);
      else if (call) {
        add('customer', 'checklist', 'Call-handling checklist', call.pct, 0.55);
        // How much warmth, not just whether one "sorry" was said.
        add('customer', 'warmth', 'Warmth (empathy & courtesy)', curve(empathyHits.length + Math.min(2, politeHits.length) * 0.5, [[0, 15], [1, 50], [2, 75], [3, 92], [4, 100]]), 0.15);
        if (wc >= 12) add('customer', 'clarity', 'Clear English on the call', curve(grammarPer100, [[0, 100], [1, 85], [2.5, 62], [4, 45], [6, 32], [10, 20]]), 0.15);
        // One-line replies tick boxes without reassuring anyone.
        add('customer', 'depth', 'Explains and reassures (not one-liners)', curve(lenWords, [[3, 15], [8, 35], [12, 52], [18, 72], [25, 90], [32, 100]]), 0.15);
        if (live) {
          // Calming an angry customer down is the job: where the mood ended, and how far it moved.
          const calm = 0.6 * curve(live.moodEnd, [[5, 100], [25, 92], [45, 72], [65, 48], [80, 28], [100, 5]]) +
            0.4 * curve(live.moodStart - live.moodEnd, [[-25, 0], [0, 30], [20, 62], [40, 85], [60, 100]]);
          const ended = { resolved: 100, time: 50, open: 45, unresolved: 30, hangup: 0 }[live.endedBy];
          add('customer', 'deescalation', 'Calmed the customer down', calm, 0.5);
          add('customer', 'outcome', 'How the call ended', ended != null ? ended : 45, 0.35);
        }
      } else {
        add('customer', 'empathy', 'Empathy language', curve(empathyHits.length, [[0, 15], [1, 55], [2, 80], [3, 100]]), 0.45);
        if (covScore != null) add('customer', 'approach', 'Customer-handling approach', covScore, 0.55);
      }
    }

    // Attitude & motivation
    if (dims.attitude) {
      const sentiScore = curve(senti.net, [[-1, 10], [-0.3, 35], [0, 52], [0.3, 72], [0.6, 88], [1, 100]]);
      if (skipped) add('attitude', 'skipped', 'Question skipped', 30, 1);
      else if (stance) add('attitude', 'stance', 'Flexibility', stance.score, 1);
      else if (askedQuestion) add('attitude', 'curiosity', 'Curiosity about the role', askedQuestion.asks ? (askedQuestion.topics ? 94 : 82) : 58 + Math.min(8, politeHits.length * 4), 1);
      else if (call) {
        add('attitude', 'politeness', 'Courtesy', curve(politeHits.length, [[0, 50], [1, 75], [2, 90], [3, 100]]), 0.6);
        add('attitude', 'tone', 'Positive tone', sentiScore, 0.4);
      } else {
        if (genuine) add('attitude', 'genuine', 'A genuine, personal reason', genuine.score, 0.6);
        // A story about a problem is full of "upset" and "angry": that is not the candidate's tone.
        if (question.type !== 'behavioral' && question.type !== 'situational') add('attitude', 'tone', 'Positive tone', sentiScore, 0.35);
        if (covScore != null) add('attitude', 'motivation', 'Motivation & fit', covScore, 0.65);
      }
    }

    // Language accuracy (listening and correction tasks; grammar is aggregated across the interview)
    if (dims.language) {
      if (listening) add('language', 'listening', 'Listening accuracy', Math.max(0, listening.recall * 100 - (events.repeats || 0) * 15), 1);
      else if (correction) add('language', 'correction', 'Sentence correction', correction.score, 1);
    }

    const scores = {};
    for (const dim of Object.keys(comps)) {
      if (!comps[dim].length) continue;
      let v = weightedMean(comps[dim]);
      // Weakest-link blend: one clearly weak delivery signal (e.g. constant fillers)
      // should not be averaged away by strong ones.
      if (dim === 'communication' || dim === 'confidence') {
        const major = comps[dim].filter((c) => c.weight >= 0.15);
        if (major.length >= 2) v = 0.7 * v + 0.3 * Math.min(...major.map((c) => c.value));
      }
      if (dim === 'confidence' && !skipped) {
        v += Math.min(9, confHits.length * 3) - Math.min(36, negSelfHits.length * 12) - Math.min(9, (events.repeats || 0) * 3);
      }
      if (dim === 'thought' && dontKnow) v = Math.min(v, 20);
      // A short answer cannot show much reasoning, however well chosen its words.
      if (dim === 'thought' && question.type !== 'roleplay' && !skipped) {
        v *= 0.7 + 0.3 * Math.min(1, lenWords / minW);
        // Well-organised reasoning about something else is not good thinking about this question.
        if (cov.ratio != null) v *= 0.5 + 0.5 * Math.min(1, cov.ratio / ((question.coverageTarget || 0.6) * 0.75));
      }
      if (rehearsed && (dim === 'thought' || dim === 'relevance')) v -= Math.min(20, clicheHits.length * 5);
      if (needsStory && (dim === 'thought' || dim === 'relevance')) v = Math.min(v, 35);
      if (dim === 'customer' && redFlags.some((f) => f.id === 'customer_hostility' || f.id === 'dishonesty')) v -= 40;
      if (dim === 'customer' && redFlags.some((f) => f.id === 'dismissive')) v -= 25;
      if (dim === 'attitude') {
        for (const f of redFlags) {
          if (stance && f.id === 'shift_refusal') continue; // already reflected in the stance score
          v -= f.severity === 'high' ? 35 : f.severity === 'medium' ? 25 : 10;
        }
      }
      scores[dim] = Math.round(clamp(v, 0, 100));
    }

    const analysis = {
      qid: question.id,
      type: question.type,
      mode,
      skipped,
      metrics,
      listening,
      correction,
      stance,
      call,
      askedQuestion,
      rehearsed,
      noStory: needsStory,
      liveCall: live,
      talkSec: talkSec != null ? Math.round(talkSec) : null,
      genuine,
      scores,
      components: comps,
      events: { repeats: events.repeats || 0, pasted: !!events.pasted, timedOut: !!events.timedOut, skipped: !!events.skipped },
    };
    analysis.feedback = buildFeedback(question, analysis);
    analysis.quality = answerQuality(analysis);
    return analysis;
  }

  /** One number for "how good was that answer" — used for the interviewer's reaction. */
  function answerQuality(a) {
    const s = a.scores;
    if ((a.type === 'flexibility' || a.type === 'closing') && s.attitude != null) return s.attitude;
    const keys = ['relevance', 'thought', 'communication', 'customer', 'language'].filter((k) => s[k] != null);
    if (!keys.length) return s.attitude != null ? s.attitude : 50;
    return Math.round(keys.reduce((t, k) => t + s[k], 0) / keys.length);
  }

  // ------------------------------------------------------------ feedback text

  function list(arr) {
    if (arr.length <= 1) return arr.join('');
    return arr.slice(0, -1).join(', ') + ' and ' + arr[arr.length - 1];
  }

  function buildFeedback(q, a) {
    const m = a.metrics;
    const good = [];
    const improve = [];
    if (a.skipped) {
      improve.push('Question was skipped. Even a short, honest attempt scores better than no answer.');
      return { good, improve };
    }
    const [lo, hi] = q.ideal || [30, 120];

    // Type-specific first.
    if (a.listening) {
      const hits = a.listening.items.filter((i) => i.hit).map((i) => i.label);
      const miss = a.listening.items.filter((i) => !i.hit).map((i) => i.label);
      if (hits.length) good.push('Captured: ' + list(hits) + '.');
      if (miss.length) improve.push('Missed: ' + list(miss) + '. ' + q.tip);
      if (a.events.repeats) improve.push('Asked for the details to be repeated — on live calls, note details down the first time.');
    }
    if (a.correction) {
      if (a.correction.verdict === 'correct') good.push('Correct: “' + q.correct + '”');
      else improve.push('Expected: “' + q.correct + '” (' + a.correction.verdict + '). ' + q.tip);
    }
    if (a.stance) {
      if (a.stance.stance === 'positive') good.push('Clear and willing about shifts and weekends.');
      else if (a.stance.stance === 'conditional') improve.push('Gave a conditional yes — be clear about what you can commit to.');
      else if (a.stance.stance === 'negative') improve.push('Not open to shifts — this limits the roles available. If it is a real constraint, state it politely with what you CAN do.');
      else improve.push('The answer did not clearly say yes or no — be direct.');
    }
    if (a.call) {
      const hits = a.call.items.filter((i) => i.hit).map((i) => i.label.toLowerCase());
      if (hits.length) good.push('On the call you showed: ' + list(hits) + '.');
      for (const it of a.call.items.filter((i) => !i.hit).slice(0, 3)) improve.push(it.label + ' missing. ' + it.tip);
    }
    if (a.askedQuestion) {
      if (a.askedQuestion.asks) good.push('Asked the interviewer a question, which shows genuine interest.');
      else improve.push('Prepare one or two questions for the interviewer, about training, growth or what success looks like in the role.');
    }

    // Rubric coverage.
    const cov = m.coverage;
    if (cov && cov.ratio != null && !a.call) {
      if (cov.matchedLabels.length) good.push('Covered: ' + list(cov.matchedLabels.slice(0, 4)) + '.');
      if (cov.missingLabels.length && cov.ratio < 0.99) improve.push('Could also mention: ' + list(cov.missingLabels.slice(0, 3)) + '.');
      if (cov.ratio < 0.25 && m.wordCount > 20) improve.push('The answer drifted away from the question. Answer what was asked in your first sentence, then add detail.');
    }
    if (a.noStory) improve.push('This question asks for a real experience. Describe one specific time: what happened, what you did, and how it ended.');
    if (a.rehearsed && m.cliches.length) improve.push('Sounds rehearsed: stock phrases (' + m.cliches.slice(0, 3).map((t) => '“' + t.term + '”').join(', ') + ') say little about you. Replace them with one real example.');

    if (m.dontKnow) improve.push('Avoid a flat "I don\'t know". Think out loud and give your best approach.');

    // Length.
    const simpleTypes = ['listening', 'correction', 'closing', 'flexibility'];
    if (simpleTypes.indexOf(q.type) === -1) {
      if (m.wordCount < (q.minWords || 20)) improve.push('Answer was brief (' + m.wordCount + ' words). Aim for roughly ' + lo + '–' + hi + ' words with an example.');
      else if (m.wordCount > hi * 1.8) improve.push('Answer ran long (' + m.wordCount + ' words). Get to the point faster and keep one strong example.');
    }

    // Thought process.
    if (q.type === 'behavioral') {
      const missing = ['situation', 'task', 'action', 'result'].filter((k) => !m.star[k]);
      if (missing.length === 0) good.push('Complete STAR story: situation, task, action and result.');
      else if (missing.length <= 2) improve.push('Strengthen the STAR structure: add the ' + list(missing) + '.');
      else improve.push('Tell it as a real story with the STAR method: Situation, Task, Action, Result.');
    }
    if (m.structure.reasoning + m.structure.example + m.structure.sequencing >= 3 && m.wordCount >= 30) good.push('Well-organised answer: reasons, examples and clear sequencing.');
    if (m.specificity >= 3 && simpleTypes.indexOf(q.type) === -1) good.push('Specific details (numbers, names, timelines) made it convincing.');

    // Communication & confidence.
    if (m.wordCount >= 25) {
      if (m.fillers.per100 <= 1.5) good.push('Fluent, with almost no filler words.');
      else if (m.fillers.per100 >= 4) improve.push('Filler words: ' + m.fillers.top.map((t) => '“' + t.term + '” ×' + t.count).join(', ') + '. Pause silently instead.');
      if (m.hedges.count >= 2) improve.push('Hedging (' + m.hedges.top.map((t) => '“' + t.term + '”').join(', ') + ') makes you sound unsure. State things directly.');
    }
    if (m.confident.count >= 2) good.push('Assertive, ownership-taking language ("' + m.confident.top[0].term + '").');
    if (m.negativeSelfTalk.length) improve.push('Avoid putting yourself down ("' + m.negativeSelfTalk[0] + '"). Frame weaknesses with what you are doing about them.');
    if (q.dims && q.dims.customer && !a.call) {
      if (m.empathy.count >= 2) good.push('Good empathy language (' + m.empathy.top.slice(0, 2).map((t) => '“' + t.term + '”').join(', ') + ').');
      else improve.push('Use explicit empathy statements, e.g. “I completely understand how frustrating this must be.”');
    }
    if (m.wpm != null) {
      if (m.wpm > 185) improve.push('Fast pace (' + Math.round(m.wpm) + ' wpm). Slow down to about 130–160 so customers can follow.');
      else if (m.wpm < 95) improve.push('Slow pace (' + Math.round(m.wpm) + ' wpm). Try to speak in fuller, continuous sentences.');
      else if (m.wpm >= 115 && m.wpm <= 170 && m.wordCount >= 25) good.push('Comfortable speaking pace (' + Math.round(m.wpm) + ' wpm).');
    }
    if (m.latencySec != null && m.latencySec > 7 && simpleTypes.indexOf(q.type) === -1) improve.push('Took ' + Math.round(m.latencySec) + 's to start. Use a bridge like “That\'s a good question. In my experience…” while you think.');
    if (m.audio) {
      if (m.audio.pitchSdSemitones != null && m.audio.pitchSdSemitones < 1.2) improve.push('Fairly flat tone. Vary your pitch to sound engaged and warm.');
      if (m.audio.trailOffDb > 6) improve.push('Your voice faded towards the end. Keep your energy up through the last sentence.');
      if (m.audio.longPauses >= 3) improve.push(m.audio.longPauses + ' long pauses mid-answer. Plan your 2–3 points before you start.');
    }
    if (m.mechanics && m.mechanics.items.length) improve.push('Writing: ' + m.mechanics.items.map((i) => i.issue.toLowerCase()).join('; ') + '.');

    for (const f of m.redFlags) improve.push('Red flag: ' + f.label.toLowerCase() + ' (“' + f.evidence + '”).');
    for (const g of m.grammar.slice(0, 2)) improve.push('Grammar: “' + g.evidence + '” → ' + g.fix + '.');

    return { good: good.slice(0, 4), improve: improve.slice(0, 5) };
  }

  // ------------------------------------------------------------ highlighting

  /**
   * Split text into [{ text, kind, note }] segments for display. Kinds:
   * flag | grammar | filler | vocab | hedge | strong | null
   * note: the better wording, for grammar and vocabulary marks.
   * opts: { ignoreFlags, kinds (only mark these kinds) }
   */
  function segments(text, opts) {
    const o = opts || {};
    const only = o.kinds ? new Set(o.kinds) : null;
    const doc = makeDoc(text);
    const kinds = new Array(doc.tokens.length).fill(null);
    const notes = new Array(doc.tokens.length).fill(null);
    const rank = { flag: 6, grammar: 5, filler: 4, vocab: 3, hedge: 2, strong: 1 };
    const mark = (w0, w1, kind, note) => {
      if (only && !only.has(kind)) return;
      const t0 = doc.wordToken[w0];
      const t1 = doc.wordToken[w1];
      for (let t = t0; t <= t1; t++) {
        if (!kinds[t] || rank[kind] > rank[kinds[t]]) {
          kinds[t] = kind;
          notes[t] = note || null;
        }
      }
    };
    const hedgeHits = findTerms(doc, L.HEDGES);
    for (const h of confidentHits(doc, hedgeHits)) mark(h.w0, h.w1, 'strong');
    for (const h of findTerms(doc, L.EMPATHY)) mark(h.w0, h.w1, 'strong');
    for (const h of findTerms(doc, L.STRUCTURE.reasoning.concat(L.STRUCTURE.example))) mark(h.w0, h.w1, 'strong');
    for (const h of hedgeHits) mark(h.w0, h.w1, 'hedge');
    for (const v of detectVocab(doc)) mark(v.w0, v.w1, 'vocab', 'Try: ' + v.better);
    for (const h of findTerms(doc, L.FILLERS).concat(Text.repetitions(doc))) mark(h.w0, h.w1, 'filler');
    if (doc.words.length >= 3) for (const g of detectGrammar(doc)) mark(g.w0, g.w1, 'grammar', 'Better: ' + g.fix);
    for (const f of detectRedFlags(doc, o.ignoreFlags)) mark(f.w0, f.w1, 'flag');

    const raw = [];
    let pos = 0;
    doc.tokens.forEach((tok, i) => {
      if (tok.start > pos) raw.push({ text: text.slice(pos, tok.start), kind: null, note: null });
      raw.push({ text: tok.raw, kind: kinds[i], note: notes[i] });
      pos = tok.end;
    });
    if (pos < text.length) raw.push({ text: text.slice(pos), kind: null, note: null });

    // Merge neighbours of the same mark, including the space between two marked words.
    const same = (a, b) => a.kind === b.kind && a.note === b.note;
    const out = [];
    for (let i = 0; i < raw.length; i++) {
      const seg = raw[i];
      const prev = out[out.length - 1];
      if (prev && prev.kind && !seg.kind && /^[\s,]*$/.test(seg.text) && raw[i + 1] && same(raw[i + 1], prev)) {
        prev.text += seg.text + raw[i + 1].text;
        i++;
        continue;
      }
      if (prev && same(prev, seg)) {
        prev.text += seg.text;
        continue;
      }
      out.push({ text: seg.text, kind: seg.kind, note: seg.note });
    }
    return out;
  }

  /**
   * Language coaching for one answer (the scoresheet transcript):
   * { grammar: [{ evidence, fix, why }], vocab: [{ word, count, better, why }], fillers: [{ term, count }] }
   */
  function languageNotes(text) {
    const doc = makeDoc(text);
    const grammar = doc.words.length >= 3 ? detectGrammar(doc).map(({ evidence, fix, why }) => ({ evidence, fix, why })) : [];
    const vocab = [];
    for (const v of detectVocab(doc)) {
      const seen = vocab.find((x) => x.word.toLowerCase() === v.word.toLowerCase());
      if (seen) seen.count++;
      else vocab.push({ word: v.word, count: 1, better: v.better, why: v.why });
    }
    const fillers = countBy(findTerms(doc, L.FILLERS).concat(Text.repetitions(doc).map((r) => ({ text: r.term + ' ' + r.term }))));
    return { grammar, vocab, fillers };
  }

  const api = { analyzeAnswer, callChecklist, segments, languageNotes, mechanics, answerQuality };
  if (isNode) module.exports = api;
  else (root.AII = root.AII || {}).Analyzer = api;
})(typeof window !== 'undefined' ? window : globalThis);
