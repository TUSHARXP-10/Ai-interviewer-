/*
 * explain.js — why each score is what it is, in the candidate's own words.
 *
 * Every line is built from something measured in this interview (a count, a quote, a
 * checklist item), so the scoresheet never praises or criticises something that did not
 * happen. Each line has a tone (good | bad | info); strengths and improvements are drawn
 * from the good and bad lines of the strongest and weakest skills.
 *
 * Works in the browser (window.AII.Explain) and in Node (module.exports) for tests.
 */
(function (root) {
  'use strict';
  const isNode = typeof module === 'object' && module.exports;

  const OPEN_TYPES = ['open', 'motivation', 'knowledge', 'situational', 'behavioral', 'self', 'extempore', 'salary'];

  function list(arr) {
    if (arr.length <= 1) return arr.join('');
    return arr.slice(0, -1).join(', ') + ' and ' + arr[arr.length - 1];
  }

  /** The first n words of what the candidate said, as a quote. */
  function quote(text, n) {
    const w = String(text || '').trim().split(/\s+/).filter(Boolean);
    if (!w.length) return '';
    const more = w.length > (n || 14);
    return '“' + w.slice(0, n || 14).join(' ').replace(/[.,;:!?]+$/, '') + (more ? '…' : '') + '”';
  }

  // "Answer quality" -> "answer quality", but keep "English" capitalised.
  const lower = (label) => (/^English/.test(label) ? label : label.charAt(0).toLowerCase() + label.slice(1));

  /** A short name for a question: its first few words. */
  function shortQ(q) {
    const first = String(q.display || q.text || '').split(/(?<=[.?!])\s/)[0].replace(/^(here is a quick [a-z ]+\.|let's begin\.|to start,|that's all the questions from my side\.)\s*/i, '');
    const w = first.split(/\s+/);
    return '“' + w.slice(0, 7).join(' ').replace(/[?.,]$/, '') + (w.length > 7 ? '…' : '') + '”';
  }

  const times = (arr) => arr.map((t) => '“' + t.term + '” ×' + t.count).join(', ');
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many || one + 's');

  function line(tone, text) {
    return { tone, text };
  }

  // ------------------------------------------------------------ per skill

  function communication(ctx) {
    const out = [];
    const s = ctx.speech;
    const e = ctx.english;
    if (s.avgWpm) {
      const w = s.avgWpm;
      if (w < 100) out.push(line('bad', 'Slow pace: about ' + w + ' words per minute (120–165 is comfortable for customers).'));
      else if (w < 115) out.push(line('info', 'A little slow: about ' + w + ' words per minute.'));
      else if (w <= 170) out.push(line('good', 'Comfortable pace: about ' + w + ' words per minute.'));
      else if (w <= 185) out.push(line('info', 'Brisk pace: about ' + w + ' words per minute.'));
      else out.push(line('bad', 'Too fast: about ' + w + ' words per minute; customers on a phone line will struggle to follow.'));
    }
    if (e && e.words >= 120) {
      if (!ctx.grammar.length) { if (e.words >= 250) out.push(line('good', 'No common grammar slips in ' + e.words + ' words.')); }
      else {
        const n = ctx.grammar.reduce((sum, g) => sum + g.count, 0);
        const ex = ctx.grammar.slice(0, 2).map((g) => '“' + g.evidence + '” → ' + g.fix).join('; ');
        out.push(line(e.errorRate >= 1 ? 'bad' : 'info', plural(n, 'grammar slip') + ' in ' + e.words + ' words (' + e.errorRate + ' per 100), e.g. ' + ex + '.'));
      }
      if (e.articleRate < 3.5) out.push(line('bad', 'Often left out small words like “a” and “the” (' + e.articleRate + ' per 100 words; fluent speech uses about 5–7), so sentences sound broken.'));
    }
    if (s.words >= 60) {
      if (s.fillerPer100 >= 2) out.push(line('bad', 'Filler words: ' + times(s.topFillers.slice(0, 3)) + ' (' + s.fillerPer100 + ' per 100 words).'));
      else if (s.fillerPer100 < 1 && s.words >= 150) out.push(line('good', 'Very few filler words or restarts.'));
    }
    const pausesPerMin = s.speakingSec >= 30 ? s.longPauses / (s.speakingSec / 60) : 0;
    if (pausesPerMin > 2) out.push(line('bad', Math.round(s.longPauses) + ' long pauses (over 2 seconds) in the middle of answers.'));
    const open = ctx.items.filter((it) => !it.analysis.skipped && OPEN_TYPES.indexOf(it.question.type) !== -1);
    if (open.length >= 3) {
      const avg = Math.round(open.reduce((sum, it) => sum + it.analysis.metrics.wordCount, 0) / open.length);
      if (avg < 25) out.push(line('bad', 'Very short answers: ' + avg + ' words on average (aim for 40–90 with an example).'));
      else if (avg < 40) out.push(line('info', 'Fairly brief answers: ' + avg + ' words on average.'));
      else if (avg > 160) out.push(line('info', 'Long answers: ' + avg + ' words on average; get to the point sooner.'));
    }
    return out;
  }

  function confidence(ctx) {
    const out = [];
    const s = ctx.speech;
    if (s.avgLatencySec != null) {
      const l = s.avgLatencySec;
      if (l < 1) out.push(line('good', 'Started answering promptly (within a second of each question).'));
      else if (l <= 2) out.push(line('good', 'Started answering promptly (about ' + l + ' s after each question).'));
      else if (l <= 4) out.push(line('info', 'Usually started answering within ' + l + ' s.'));
      else out.push(line('bad', 'Long silences before answering: ' + l + ' s on average.'));
    }
    if (s.words >= 60) {
      if (s.hedgePer100 >= 1.5) out.push(line('bad', 'Hedging: ' + times(s.topHedges.slice(0, 3)) + '.'));
      else if (s.hedgePer100 < 0.6 && s.words >= 150) out.push(line('good', 'Spoke directly, with few hedges like “I think” or “maybe”.'));
    }
    const neg = [];
    for (const it of ctx.items) for (const n of it.analysis.metrics.negativeSelfTalk || []) neg.push(n);
    if (neg.length) out.push(line('bad', 'Put themselves down: “' + neg[0] + '”.'));
    const dk = ctx.items.filter((it) => it.analysis.metrics.dontKnow).length;
    if (dk) out.push(line('bad', 'Said “I don’t know” (or similar) on ' + plural(dk, 'question') + '.'));
    const audio = ctx.items.map((it) => it.analysis.metrics.audio).filter(Boolean);
    if (audio.length >= 3) {
      const fade = audio.filter((a) => a.trailOffDb > 6).length;
      if (fade >= audio.length / 2) out.push(line('bad', 'Voice often faded towards the end of answers.'));
    }
    if (s.pitchVariation != null) {
      if (s.pitchVariation < 1.2) out.push(line('bad', 'Flat, monotone delivery (little change in pitch).'));
      else if (s.pitchVariation >= 2) out.push(line('good', 'Lively, expressive voice.'));
    }
    const skipped = ctx.items.filter((it) => it.analysis.skipped).length;
    if (skipped) out.push(line('bad', 'Skipped ' + plural(skipped, 'question') + '.'));
    return out;
  }

  function thought(ctx) {
    const out = [];
    const open = ctx.items.filter((it) => !it.analysis.skipped && OPEN_TYPES.indexOf(it.question.type) !== -1);
    if (!open.length) return out;
    const withExample = open.filter((it) => {
      const m = it.analysis.metrics;
      return m.structure.example > 0 || m.starCount >= 3 || m.specificity >= 2;
    });
    const story = ctx.items.find((it) => it.question.type === 'behavioral' && !it.analysis.skipped && !it.analysis.noStory && it.analysis.metrics.starCount >= 3);
    if (withExample.length >= Math.max(2, open.length / 2)) {
      out.push(line('good', 'Backed up ' + withExample.length + ' of ' + open.length + ' answers with a real example or concrete detail' + (story ? ', e.g. ' + quote(story.response.text, 16) : '') + '.'));
    } else {
      out.push(line('bad', (withExample.length ? 'Only ' + withExample.length + ' of ' + open.length + ' answers' : 'None of the ' + open.length + ' answers') + ' included a real example or concrete detail.'));
    }
    const reasoned = open.filter((it) => it.analysis.metrics.structure.reasoning > 0).length;
    if (reasoned >= open.length * 0.6) out.push(line('good', 'Explained the why (“because”, “so that”) in ' + reasoned + ' of ' + open.length + ' answers.'));
    const rehearsed = open.filter((it) => it.analysis.rehearsed);
    if (rehearsed.length) {
      const terms = new Map();
      for (const it of rehearsed) for (const c of it.analysis.metrics.cliches || []) terms.set(c.term, (terms.get(c.term) || 0) + c.count);
      const top = [...terms.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => '“' + t + '”');
      out.push(line('bad', plural(rehearsed.length, 'answer') + ' leaned on stock phrases (' + list(top) + ') instead of saying something specific.'));
    }
    for (const it of ctx.items.filter((x) => x.analysis.noStory).slice(0, 1)) {
      out.push(line('bad', shortQ(it.question) + ' was answered in general terms, without a real example from their own experience.'));
    }
    return out;
  }

  function relevance(ctx) {
    const out = [];
    const open = ctx.items.filter((it) => !it.analysis.skipped && OPEN_TYPES.indexOf(it.question.type) !== -1 && it.analysis.scores.relevance != null);
    if (!open.length) return out;
    const onPoint = open.filter((it) => it.analysis.scores.relevance >= 70);
    out.push(line(onPoint.length >= open.length * 0.7 ? 'good' : onPoint.length >= open.length * 0.4 ? 'info' : 'bad',
      onPoint.length ? 'Answered the question fully in ' + onPoint.length + ' of ' + open.length + ' answers.' : 'None of the ' + open.length + ' answers fully answered the question.'));
    const missed = open.filter((it) => {
      const cov = it.analysis.metrics.coverage;
      return cov && cov.ratio != null && cov.ratio < 0.25 && it.analysis.metrics.wordCount >= 12;
    });
    for (const it of missed.slice(0, 2)) out.push(line('bad', shortQ(it.question) + ': the answer did not address what was asked (' + quote(it.response.text, 10) + ').'));
    const thin = open.filter((it) => missed.indexOf(it) === -1 && it.analysis.scores.relevance < 55 && it.analysis.metrics.coverage && it.analysis.metrics.coverage.missingLabels.length);
    for (const it of thin.slice(0, 2 - Math.min(2, missed.length))) {
      out.push(line('bad', shortQ(it.question) + ': missed ' + list(it.analysis.metrics.coverage.missingLabels.slice(0, 2).map((x) => x.toLowerCase())) + '.'));
    }
    return out;
  }

  function customer(ctx) {
    const out = [];
    const callItem = ctx.items.find((it) => it.analysis.call);
    if (callItem) {
      const call = callItem.analysis.call;
      const hit = call.items.filter((i) => i.hit);
      const miss = call.items.filter((i) => !i.hit);
      const ev = (id) => { const i = call.items.find((x) => x.id === id && x.hit); return i && i.evidence ? ' (“' + i.evidence + '”)' : ''; };
      if (hit.length) {
        const did = hit.map((i) => i.label.toLowerCase() + (i.id === 'timeline' || i.id === 'resolution' ? ev(i.id) : ''));
        out.push(line(miss.length <= 1 ? 'good' : 'info', 'Mock call: ' + list(did) + '.'));
      }
      if (miss.length) out.push(line('bad', 'Mock call missed: ' + list(miss.map((i) => i.label.toLowerCase())) + '.'));
      const m = callItem.analysis.metrics;
      if (m.empathy.count <= 1 && !callItem.analysis.skipped) out.push(line('bad', 'Little warmth on the call: at most one brief apology, no real reassurance.'));
      const callSlips = m.grammar.slice(0, 1);
      if (callSlips.length && m.grammar.length >= 2) out.push(line('bad', 'Broken English on the call (“' + callSlips[0].evidence + '”) would be hard for a customer to follow.'));
    }
    for (const f of ctx.flags.filter((x) => x.id === 'customer_hostility' || x.id === 'dismissive' || x.id === 'dishonesty')) {
      out.push(line('bad', f.label + ': “' + f.evidence + '”.'));
    }
    const situational = ctx.items.filter((it) => it.question.dims && it.question.dims.customer && !it.analysis.call && !it.analysis.skipped);
    for (const it of situational.slice(0, 1)) {
      const cov = it.analysis.metrics.coverage;
      if (cov && cov.matchedLabels.length >= 3) out.push(line('good', shortQ(it.question) + ': ' + list(cov.matchedLabels.slice(0, 4).map((x) => x.toLowerCase())) + '.'));
      else if (cov && cov.missingLabels.length) out.push(line('bad', shortQ(it.question) + ': did not mention how to ' + list(cov.missingLabels.slice(0, 2).map((x) => x.toLowerCase())) + '.'));
    }
    return out;
  }

  function attitude(ctx) {
    const out = [];
    for (const f of ctx.flags.filter((x) => ['customer_hostility', 'dismissive', 'dishonesty'].indexOf(x.id) === -1)) {
      out.push(line(f.severity === 'low' ? 'info' : 'bad', f.label + ': “' + f.evidence + '”.'));
    }
    const shift = ctx.items.find((it) => it.analysis.stance);
    if (shift) {
      const st = shift.analysis.stance.stance;
      if (st === 'positive') out.push(line('good', 'Open to night shifts, rotational shifts and weekends.'));
      else if (st === 'conditional') out.push(line('info', 'Open to shifts with conditions: ' + quote(shift.response.text, 14) + '.'));
      else if (st === 'unclear') out.push(line('info', 'Did not clearly say whether shifts are okay.'));
    }
    const closing = ctx.items.find((it) => it.analysis.askedQuestion);
    if (closing) {
      if (closing.analysis.askedQuestion.asks) out.push(line('good', 'Asked the interviewer about the role: ' + quote(closing.response.text, 14) + '.'));
      else out.push(line('info', 'Had no questions for the interviewer.'));
    }
    const motive = ctx.items.filter((it) => it.question.type === 'motivation' && !it.analysis.skipped);
    const strong = motive.filter((it) => it.analysis.scores.attitude != null && it.analysis.scores.attitude >= 75);
    if (motive.length && strong.length === motive.length && !ctx.flags.some((f) => f.severity !== 'low')) out.push(line('good', 'Gave genuine reasons for wanting the job (' + quote(strong[0].response.text, 12) + ').'));
    return out;
  }

  function language(ctx) {
    const out = [];
    for (const it of ctx.items.filter((x) => x.analysis.listening)) {
      const items = it.analysis.listening.items;
      const hits = items.filter((i) => i.hit).length;
      const miss = items.filter((i) => !i.hit).map((i) => i.label.toLowerCase());
      out.push(line(miss.length ? 'bad' : 'good', 'Listening test: recalled ' + hits + ' of ' + items.length + ' details' + (miss.length ? ' (missed ' + list(miss) + ')' : '') + '.'));
    }
    for (const it of ctx.items.filter((x) => x.analysis.correction)) {
      const c = it.analysis.correction;
      if (c.verdict === 'correct') out.push(line('good', 'Corrected the sentence: ' + quote(it.response.text, 12) + '.'));
      else out.push(line('bad', 'Sentence correction ' + c.verdict + ': said ' + quote(it.response.text, 12) + ', expected “' + String(c.correct || '').replace(/[.!?]+$/, '') + '”.'));
    }
    const e = ctx.english;
    if (e && e.words >= 120) {
      if (e.errorRate >= 1) out.push(line('bad', 'Grammar while speaking: ' + e.errorRate + ' slips per 100 words.'));
      else if (e.errorRate === 0) out.push(line('good', 'Grammatically accurate speech.'));
    }
    return out;
  }

  const BUILDERS = { communication, confidence, thought, relevance, customer, attitude, language };

  // What to practise, per skill, when it is the weak spot.
  const TIPS = {
    communication: 'Practise 60-second answers out loud on everyday topics; record yourself and listen for missing words and fillers.',
    confidence: 'Start with a bridge sentence (“That’s a good question. In my experience…”) and finish every answer with a clear statement.',
    thought: 'Use STAR for experience questions: the situation, what you did, and how it ended, with one real detail.',
    relevance: 'Answer exactly what was asked in your first sentence, then add one example.',
    customer: 'Follow the call flow: apologise, verify the details, give a concrete fix with a timeline, then close politely.',
    attitude: 'Show why you want this job and that you will stay: talk about learning, growth and helping customers.',
    language: 'Repeat details back while listening (name, number, date), and practise the common sentence patterns.',
  };

  /**
   * sheet: the scoresheet so far (dimensions, speech, grammar, redFlags, english, gates…)
   * items: [{ question, response, analysis }]
   * Returns { why: { <skill>: [{ tone, text }] }, strengths, improvements, summary }.
   */
  function explain(sheet, items) {
    const ctx = { items, speech: sheet.speech, english: sheet.english, grammar: sheet.grammar, flags: sheet.redFlags };
    const why = {};
    for (const d of sheet.dimensions) why[d.key] = d.score == null ? [] : BUILDERS[d.key](ctx);

    const scored = sheet.dimensions.filter((d) => d.score != null);
    const byHigh = scored.slice().sort((a, b) => b.score - a.score);
    const byLow = scored.slice().sort((a, b) => a.score - b.score);

    // Strengths: the good evidence behind the strongest skills (70+ on the recruiter scale).
    const strengths = [];
    for (const d of byHigh.filter((x) => x.score >= 70)) {
      const good = why[d.key].filter((l) => l.tone === 'good').map((l) => l.text);
      if (good.length) strengths.push(d.short + ' (' + d.score + '): ' + good.slice(0, 2).join(' '));
      if (strengths.length >= 4) break;
    }
    if (!strengths.length && byHigh.length) {
      const d = byHigh[0];
      const good = why[d.key].filter((l) => l.tone === 'good').map((l) => l.text);
      if (d.score >= 55) strengths.push('Best area: ' + lower(d.short) + ' (' + d.score + ')' + (good.length ? '. ' + good[0] : '.'));
      else strengths.push('No area reached a hiring level yet; the closest was ' + lower(d.short) + ' (' + d.score + ').');
    }

    // Improvements: red flags first, then the weakest skills with their evidence and one tip.
    const improvements = [];
    for (const f of sheet.redFlags.filter((x) => x.severity === 'high').slice(0, 1)) improvements.push('Never say this in an interview: “' + f.evidence + '” (' + f.label.toLowerCase() + ').');
    for (const d of byLow.filter((x) => x.score < 70)) {
      const bad = why[d.key].filter((l) => l.tone === 'bad').map((l) => l.text);
      if (!bad.length) continue;
      improvements.push(d.short + ' (' + d.score + '): ' + bad.slice(0, 2).join(' ') + ' ' + TIPS[d.key]);
      if (improvements.length >= 4) break;
    }
    if (!improvements.length && byLow.length) {
      const d = byLow[0];
      const bad = why[d.key].filter((l) => l.tone === 'bad').map((l) => l.text);
      improvements.push('To go from good to excellent, work on ' + lower(d.short) + ' (' + d.score + '): ' + (bad[0] ? bad[0] + ' ' : '') + TIPS[d.key]);
    }

    // The one thing to work on first (for the spoken debrief).
    let focus = null;
    for (const d of byLow) {
      const bad = why[d.key].find((l) => l.tone === 'bad');
      if (bad && d.score < 80) { focus = { key: d.key, label: d.short, score: d.score, evidence: bad.text, tip: TIPS[d.key] }; break; }
    }
    return { why, strengths, improvements, focus, summary: summary(sheet, why, byHigh, byLow) };
  }

  const GATE_LABEL = { communication: 'spoken communication', customer: 'customer handling', attitude: 'attitude', confidence: 'confidence', thought: 'problem solving', language: 'written English' };

  function summary(sheet, why, byHigh, byLow) {
    const name = String((sheet.candidate && sheet.candidate.name) || '').trim() || 'The candidate';
    const parts = [];
    parts.push(name + ' scored ' + sheet.overall + '/100 (' + sheet.verdict.label.toLowerCase() + ') in the ' + sheet.plan.label.toLowerCase() + ' for ' + sheet.role.label + '.');
    const gates = sheet.gates || [];
    if (gates.length) {
      parts.push('For this role, ' + list(gates.map((g) => GATE_LABEL[g.key] + ' (' + g.score + ')')) + (gates.length > 1 ? ' are' : ' is') + ' below the hiring bar of ' + list(gates.map((g) => String(g.bar))) + ', which holds the overall score down.');
    }
    const top = byHigh[0];
    if (top && top.score >= 60) {
      const ev = why[top.key].find((l) => l.tone === 'good');
      parts.push('Strongest area: ' + lower(top.short) + ' (' + top.score + ')' + (ev ? '. ' + ev.text : '.'));
    }
    const low = byLow[0];
    if (low && low !== top && low.score < 70) {
      const ev = why[low.key].find((l) => l.tone === 'bad');
      parts.push('Weakest area: ' + lower(low.short) + ' (' + low.score + ')' + (ev ? '. ' + ev.text : '.'));
    }
    const serious = sheet.redFlags.filter((f) => f.severity !== 'low');
    if (serious.length) parts.push('Red flags: ' + list(serious.slice(0, 3).map((f) => f.label.toLowerCase())) + '.');
    const close = {
      strong: 'Recommended for the next round.',
      hire: 'Recommended, with coaching on ' + (low ? lower(low.short) : 'the weaker areas') + '.',
      borderline: 'Borderline: could be considered with training in ' + (low ? lower(low.short) : 'the weaker areas') + '; a re-interview after practice is suggested.',
      no: 'Not ready for a customer-facing role yet; focused practice on ' + (low ? lower(low.short) : 'the basics') + ' and a re-attempt in a few weeks is recommended.',
    }[sheet.verdict.key];
    if (close) parts.push(close);
    return parts.join(' ');
  }

  const api = { explain, quote, shortQ };
  if (isNode) module.exports = api;
  else (root.AII = root.AII || {}).Explain = api;
})(typeof window !== 'undefined' ? window : globalThis);
