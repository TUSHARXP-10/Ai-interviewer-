/*
 * report.js — renders the scoresheet (screen + print/PDF).
 */
(function (root) {
  'use strict';
  const AII = root.AII;
  const esc = AII.Text.escapeHtml;

  const STATUS_ICON = { good: '✓', warning: '!', serious: '!', critical: '✕' };
  const KIND_LABEL = { filler: 'Filler word', hedge: 'Hedging', strong: 'Strong phrase', grammar: 'Grammar slip', vocab: 'Word choice', flag: 'Red flag' };
  // The transcript marks only language: what to fix in how something was said.
  const LANGUAGE_KINDS = ['grammar', 'vocab', 'filler'];

  function fmtDate(iso) {
    try {
      return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    } catch (e) {
      return iso;
    }
  }

  function fmtDuration(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m ? m + ' min ' + (s ? s + ' s' : '') : s + ' s';
  }

  function highlighted(text, ignoreFlags, kinds) {
    if (!text || !text.trim()) return '<em class="muted">No answer.</em>';
    return AII.Analyzer.segments(text, { ignoreFlags, kinds })
      .map((s) => (s.kind ? '<mark class="hl hl-' + s.kind + '" title="' + esc(KIND_LABEL[s.kind] + (s.note ? ' — ' + s.note : '')) + '">' + esc(s.text) + '</mark>' : esc(s.text)))
      .join('');
  }

  // ------------------------------------------------------------ transcript
  /** One recording player (or nothing). */
  function clipPlayer(clip) {
    if (!clip) return '';
    return '<div class="clip tr-clip"><span class="clip-label">🎧 ' + esc(clip.label) + '</span><audio controls preload="metadata" src="' + esc(clip.url) + '"></audio>' +
      (clip.file ? '<a class="clip-dl" href="' + esc(clip.url) + '" download="' + esc(clip.file) + '">Download</a>' : '') + '</div>';
  }

  /** "Interviewer" or "Customer" line. */
  function trAsk(who, text) {
    return '<div class="tr-line tr-ask"><span class="tr-who">' + esc(who) + '</span><p>' + esc(text) + '</p></div>';
  }

  /** The candidate's words, as a caption, with grammar and word-choice marks. */
  function trSaid(text, empty, q, clip) {
    const said = text && text.trim()
      ? '<p class="tr-caption">' + highlighted(text, q.ignoreFlags, LANGUAGE_KINDS) + '</p>'
      : '<p class="tr-caption tr-none">' + esc(clip ? 'No words were recognised. Play the recording to hear what you said.' : empty) + '</p>';
    return '<div class="tr-line tr-said"><span class="tr-who">You</span><div>' + said + clipPlayer(clip) + '</div></div>';
  }

  /** Grammar, word choice and fillers for everything said in one question. */
  function languageCheck(texts, q) {
    if (q.type === 'listening') return ''; // names and numbers: nothing to coach
    const all = texts.filter((t) => t && t.trim());
    if (!all.length) return '';
    const n = AII.Analyzer.languageNotes(all.join(' . '));
    const items = [];
    for (const g of n.grammar) {
      items.push('<li class="lc-grammar"><span class="lc-k">Grammar</span> “' + esc(g.evidence) + '” → <strong>' + esc(g.fix) + '</strong> <span class="muted">· ' + esc(g.why) + '</span></li>');
    }
    for (const v of n.vocab) {
      items.push('<li class="lc-vocab"><span class="lc-k">Word choice</span> “' + esc(v.word) + '”' + (v.count > 1 ? ' ×' + v.count : '') +
        ' → <strong>' + esc(v.better) + '</strong> <span class="muted">· ' + esc(v.why) + '</span></li>');
    }
    if (n.fillers.length) {
      items.push('<li class="lc-filler"><span class="lc-k">Fillers</span> ' + n.fillers.map((f) => '“' + esc(f.term) + '”' + (f.count > 1 ? ' ×' + f.count : '')).join(', ') + '</li>');
    }
    if (!items.length) return '<div class="lang-check lc-clean">✓ No grammar slips or weak words found.</div>';
    return '<div class="lang-check"><ul>' + items.join('') + '</ul></div>';
  }

  /** Every question in order, with every answer word for word (or why there is none). */
  function transcript(sheet, clipsFor) {
    const rows = sheet.questions.map((q, i) => {
      const clips = clipsFor(q.id) || [];
      const clip = (label) => clips.find((c) => c.label === label) || null;
      const parts = [];
      const said = [];
      if (q.turns) {
        parts.push(trAsk('Interviewer', q.text));
        q.turns.forEach((t, k) => {
          parts.push(trAsk('Customer', t.customer));
          parts.push(trSaid(t.agent, 'No reply.', q, clip('Reply ' + (k + 1))));
          said.push(t.agent);
        });
      } else {
        parts.push(trAsk('Interviewer', q.text));
        parts.push(trSaid(q.answer, q.events && q.events.timedOut ? 'No answer: time ran out.' : 'No answer: skipped.', q, clip('Answer')));
        said.push(q.answer);
        for (const f of q.followUps || []) {
          parts.push(trAsk('Interviewer', f.text));
          parts.push(trSaid(f.answer, 'No answer.', q, clip('Follow-up')));
          said.push(f.answer);
        }
      }
      return '<li class="tr-item" id="tr-q' + (i + 1) + '"><div class="tr-head"><span class="qa-num">Q' + (i + 1) + '</span><span class="qa-stage">' + esc(q.stage) + '</span>' +
        '<span class="tr-score">' + (q.skipped ? 'Skipped' : q.quality + '/100') + '</span></div>' + parts.join('') + languageCheck(said, q) + '</li>';
    }).join('');
    const legend = '<div class="legend" aria-label="Highlight legend">' +
      LANGUAGE_KINDS.map((k) => '<span><mark class="hl hl-' + k + '">' + KIND_LABEL[k].toLowerCase() + '</mark></span>').join('') + '</div>';
    return '<section class="card" id="transcript"><h2>Your answers, word for word</h2>' +
      '<p class="muted small">Exactly what the speech engine heard, question by question. Marked words have a better way to say them, listed under each answer.</p>' +
      legend + '<ol class="transcript">' + rows + '</ol></section>';
  }

  /** The 4-round assessment: one card per round with its score and key evidence. */
  function roundsCard(sheet) {
    if (!sheet.rounds || !sheet.rounds.length) return '';
    const tone = (v) => (v == null ? 'none' : v >= 80 ? 'good' : v >= 66 ? 'ok' : v >= 52 ? 'warn' : 'bad');
    return '<section class="card rounds-card"><h2>Round by round</h2><div class="round-grid">' + sheet.rounds.map((r) =>
      '<article class="round round-' + tone(r.score) + '"><div class="round-head"><span class="round-n">Round ' + r.n + '</span>' +
      '<span class="round-score">' + (r.score == null ? '—' : r.score) + '<small>/100</small></span></div>' +
      '<h3>' + esc(r.title) + '</h3><p class="round-focus">' + esc(r.focus || '') + '</p>' +
      '<ul>' + r.notes.map((n) => '<li>' + esc(n) + '</li>').join('') + '</ul></article>').join('') + '</div></section>';
  }

  /** "Confidence (33): Long silences…" with the skill and score in bold. */
  function labelled(text) {
    const m = String(text).match(/^([A-Z][^:()]{2,40} \(\d+\)):\s*/);
    return m ? '<strong>' + esc(m[1]) + '</strong> ' + esc(text.slice(m[0].length)) : esc(text);
  }

  const WHY_TONE = { good: 'Strength', bad: 'Held back by', info: 'Note' };

  function meter(score, label, sub, extra, why) {
    const v = score == null ? 0 : score;
    const reasons = why && why.length
      ? '<ul class="why">' + why.map((l) => '<li class="why-' + esc(l.tone) + '"><span class="sr-only">' + (WHY_TONE[l.tone] || '') + ': </span>' + esc(l.text) + '</li>').join('') + '</ul>'
      : '';
    return '<div class="meter-row">' +
      '<div class="meter-head"><span class="meter-label">' + esc(label) + '</span>' +
      '<span class="meter-value">' + (score == null ? '—' : score) + '<span class="meter-band">' + esc(extra || '') + '</span></span></div>' +
      '<div class="meter" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + v + '" aria-label="' + esc(label) + '"><div class="meter-fill" style="width:' + v + '%"></div></div>' +
      (sub ? '<div class="meter-sub">' + esc(sub) + '</div>' : '') + reasons +
      '</div>';
  }

  function tile(label, value, note) {
    return '<div class="tile"><div class="tile-label">' + esc(label) + '</div><div class="tile-value">' + value + '</div>' + (note ? '<div class="tile-note">' + esc(note) + '</div>' : '') + '</div>';
  }

  function statusBadge(tone, label) {
    return '<span class="status status-' + tone + '"><span class="status-icon" aria-hidden="true">' + STATUS_ICON[tone] + '</span>' + esc(label) + '</span>';
  }

  function questionChart(sheet) {
    const rows = sheet.questions.map((q, i) => {
      const v = q.skipped ? 0 : q.quality;
      const label = 'Q' + (i + 1) + ' · ' + q.stage;
      return '<div class="qbar" tabindex="0" data-tip="' + esc('Q' + (i + 1) + ' — ' + (q.display || q.text)) + '" data-value="' + (q.skipped ? 'Skipped' : v + '/100') + '">' +
        '<span class="qbar-label">' + esc(label) + '</span>' +
        '<span class="qbar-track"><span class="qbar-fill" style="width:' + Math.max(v, 0.5) + '%"></span></span>' +
        '<span class="qbar-value">' + (q.skipped ? 'skipped' : v) + '</span></div>';
    }).join('');
    return '<div class="qchart" role="list" aria-label="Score per question">' + rows +
      '<div class="qchart-axis" aria-hidden="true"><span>0</span><span>50</span><span>100</span></div>' +
      '<div class="chart-tip" role="status" hidden></div></div>';
  }

  function dimChips(scores) {
    const D = AII.Scoring.DIMENSIONS;
    return '<div class="chips">' + D.filter((d) => scores[d.key] != null).map((d) =>
      '<span class="chip"><span class="chip-k">' + esc(d.short) + '</span> ' + scores[d.key] + '</span>').join('') + '</div>';
  }

  /** A strong example answer, with a button to hear it (the app speaks it). */
  function modelBlock(q) {
    const text = AII.Demo && AII.Demo.modelAnswer ? AII.Demo.modelAnswer(q.id) : null;
    if (!text || q.type === 'roleplay') return '';
    return '<div class="model"><div class="model-head"><span class="eyebrow">A strong answer could sound like this</span>' +
      '<button class="btn btn-small btn-glass no-print" type="button" data-say-model="' + esc(q.id) + '" aria-pressed="false">▶ Listen</button></div>' +
      '<p>' + esc(text) + '</p></div>';
  }

  function bestOf(attempts) {
    return attempts && attempts.length ? Math.max.apply(null, attempts.map((a) => a.quality || 0)) : null;
  }

  function drillButton(q, label) {
    return '<button class="btn btn-small btn-drill no-print" type="button" data-drill="' + esc(q.id) + '">🎯 ' + esc(label || 'Practise again') + '</button>';
  }

  function questionDetail(q, i, o) {
    const parts = [];
    const attempts = (o && o.drills && o.drills[q.id]) || null;
    // The words themselves (and the recordings) are in the transcript.
    parts.push('<p class="small"><a href="#tr-q' + (i + 1) + '">' + (q.skipped ? 'See this question in the transcript' : 'Read your answer in the transcript') + '</a></p>');
    if (q.listening) {
      parts.push('<ul class="checklist">' + q.listening.items.map((it) =>
        '<li class="' + (it.hit ? 'ok' : 'miss') + '"><span aria-hidden="true">' + (it.hit ? '✓' : '✕') + '</span> ' + esc(it.label) + (it.hit ? '' : ' <span class="muted">(missed)</span>') + '</li>').join('') + '</ul>');
    }
    if (q.correction) {
      parts.push('<p class="correction"><span class="eyebrow">Expected</span>“' + esc(q.correction.correct) + '” — <strong>' + esc(q.correction.verdict) + '</strong></p>');
    }
    if (q.approach) {
      parts.push('<div class="approach-check"><span class="eyebrow">How you talked it through</span><ol class="approach-steps">' + q.approach.map((s) =>
        '<li class="' + (s.hit ? 'ok' : 'miss') + '" title="' + esc(s.label) + '"><span aria-hidden="true">' + (s.hit ? '✓' : '·') + '</span> ' + esc(s.short) + '<span class="sr-only">: ' + (s.hit ? 'heard' : 'not heard') + '</span></li>').join('') + '</ol></div>');
    }
    if (q.call) {
      parts.push('<ul class="checklist">' + q.call.map((it) =>
        '<li class="' + (it.hit ? 'ok' : 'miss') + '"><span aria-hidden="true">' + (it.hit ? '✓' : '✕') + '</span> ' + esc(it.label) + (it.hit && it.evidence ? ' <span class="muted">— “' + esc(it.evidence) + '”</span>' : '') + '</li>').join('') + '</ul>');
    }
    const facts = [];
    if (!q.skipped) facts.push(q.wordCount + ' words');
    if (q.wpm) facts.push(q.wpm + ' wpm');
    if (q.latencySec != null) facts.push('started after ' + q.latencySec + 's');
    if (q.mode === 'text') facts.push('typed');
    if (q.events && q.events.repeats) facts.push('asked to repeat ×' + q.events.repeats);
    if (q.events && q.events.timedOut) facts.push('ran out of time');
    if (q.events && q.events.pasted) facts.push('pasted text');
    parts.push('<div class="q-facts">' + dimChips(q.scores) + (facts.length ? '<span class="muted small">' + esc(facts.join(' · ')) + '</span>' : '') + '</div>');
    const fb = q.feedback || { good: [], improve: [] };
    if (fb.good.length || fb.improve.length) {
      parts.push('<div class="fb">' +
        (fb.good.length ? '<ul class="fb-good">' + fb.good.map((g) => '<li>' + esc(g) + '</li>').join('') + '</ul>' : '') +
        (fb.improve.length ? '<ul class="fb-improve">' + fb.improve.map((g) => '<li>' + esc(g) + '</li>').join('') + '</ul>' : '') +
        '</div>');
    }
    if (q.llm && (q.llm.feedback || q.llm.better)) {
      parts.push('<div class="ai-note"><span class="eyebrow">Local AI reviewer · ' + esc(q.llm.model || '') + '</span><p>' + esc(q.llm.feedback || '') + (q.llm.better ? ' <strong>Try:</strong> ' + esc(q.llm.better) : '') + '</p></div>');
    }
    if (q.tip) parts.push('<div class="tip"><span class="eyebrow">What a strong answer includes</span><p>' + esc(q.tip) + '</p></div>');
    parts.push(modelBlock(q));
    const best = bestOf(attempts);
    if (o && o.canDrill) {
      parts.push('<div class="drill-row">' + drillButton(q, q.skipped ? 'Answer it now' : 'Practise this question again') +
        (best != null ? '<span class="muted small">Practised ' + attempts.length + '× · best ' + best + '</span>' : '<span class="muted small">Answer it again out loud and see your score change.</span>') + '</div>');
    }

    const score = q.skipped ? 'Skipped' : q.quality;
    const practised = best != null ? '<span class="qa-best" title="Best practice score">↗ ' + best + '</span>' : '';
    return '<details class="qa"' + (i === 0 ? ' open' : '') + '><summary>' +
      '<span class="qa-num">Q' + (i + 1) + '</span>' +
      '<span class="qa-title"><span class="qa-stage">' + esc(q.stage) + '</span><span class="qa-q">' + esc(q.display || q.text) + '</span></span>' +
      practised + '<span class="qa-score" aria-label="Score">' + score + '</span></summary>' +
      '<div class="qa-body">' + parts.join('') + '</div></details>';
  }

  /** The three weakest answers, each one tap away from a practice drill. */
  function practiceCard(sheet, o) {
    if (!o.canDrill || !sheet.questions.length) return '';
    const drills = o.drills || {};
    const ranked = sheet.questions.map((q, i) => ({ q, i, v: q.skipped ? -1 : q.quality }))
      .sort((a, b) => a.v - b.v).slice(0, 3);
    const allGood = ranked.every((r) => r.v >= 80);
    return '<section class="card practice no-print" id="rep-practice"><div class="practice-head"><h2>Your practice plan</h2><p class="muted small">' +
      (allGood ? 'Every answer scored 80 or more. Polish the lowest ones, or practise any question further down.'
        : 'Answer your weakest questions again, out loud. Each drill takes about two minutes and shows your score before and after.') +
      '</p></div><ol class="practice-list">' + ranked.map((r) => {
        const best = bestOf(drills[r.q.id]);
        const now = r.q.skipped ? 'Skipped' : r.q.quality;
        const tone = r.q.skipped || r.q.quality < 52 ? ' low' : r.q.quality < 66 ? ' mid' : '';
        return '<li><span class="pl-score' + tone + '">' + now + '</span>' +
          '<span class="pl-q"><span class="qa-stage">Q' + (r.i + 1) + ' · ' + esc(r.q.stage) + '</span><span class="pl-text">' + esc(r.q.display || r.q.text) + '</span>' +
          (best != null ? '<span class="pl-best">Best practice score: ' + best + (best > (r.q.skipped ? 0 : r.q.quality) ? ' ↗' : '') + '</span>' : '') + '</span>' +
          drillButton(r.q, best != null ? 'Again' : 'Practise') + '</li>';
      }).join('') + '</ol></section>';
  }

  // ------------------------------------------------------------ AI proctoring
  const at = (ms) => {
    const s = Math.max(0, Math.round((ms || 0) / 1000));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  };

  /** Integrity rating, figures, and a timeline of what the camera checks flagged (with photos). */
  function proctoringCard(sheet, photos) {
    const p = sheet.proctoring;
    if (!p || !p.rating) return '';
    const r = p.rating;
    const st = p.stats || {};
    // The ending is already the banner at the top of the card.
    const reasons = (r.reasons || []).filter((x) => !(p.terminated && /ended after three/i.test(x)));
    const pct = (v) => (v != null ? v + '<span class="tile-unit">%</span>' : '—');
    const tiles = [
      tile('Integrity', esc(r.label), r.key === 'clean' ? 'nothing to review' : r.key === 'high' ? 'verdict capped' : 'check the flagged moments'),
      tile('Face in view', pct(st.faceVisiblePct), 'of the interview'),
      tile('Eyes on screen', pct(st.eyesOnPct), st.awaySec ? st.awaySec + ' s looking away' : 'of the interview'),
      tile('Warnings', (p.strikes || 0) + '<span class="tile-unit">/3</span>', p.terminated ? 'interview ended' : p.strikes ? 'given during the call' : 'none needed'),
    ].join('');
    const items = (p.incidents || []).map((i) => {
      const photo = photos && photos.get(i.id);
      const where = i.direction === 'down' ? ' (down)' : i.direction === 'side' ? ' (to the side)' : '';
      const what = i.severity === 'serious' ? (i.strike ? 'Warning ' + i.strike + ' of 3' : 'Serious') : 'Noted';
      return '<li class="pi pi-' + (i.severity === 'serious' ? 'serious' : 'minor') + '">' +
        '<span class="pi-time">' + at(i.at) + (i.q ? '<small>Q' + i.q + '</small>' : '') + '</span>' +
        '<span class="pi-body"><strong>' + esc(i.label + where) + '</strong><span class="muted small">' + esc(what) +
        (i.durationMs ? ' · ' + Math.max(1, Math.round(i.durationMs / 1000)) + ' s' : '') + '</span></span>' +
        (photo ? '<a class="pi-photo" href="' + esc(photo) + '" target="_blank" rel="noopener" title="Open the photo"><img src="' + esc(photo) + '" alt="' + esc('Camera at ' + at(i.at) + ': ' + i.label) + '"></a>' : '') +
        '</li>';
    }).join('');
    return '<section class="card proctor-card tone-' + esc(r.tone) + '" id="proctoring"><h2>AI proctoring</h2>' +
      (p.terminated ? '<p class="proctor-ended">The interview was ended after three integrity warnings.</p>' : '') +
      '<div class="tiles small-tiles">' + tiles + '</div>' +
      (reasons.length ? '<ul class="proctor-reasons">' + reasons.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '') +
      (items ? '<h3>Incident timeline</h3><ol class="proctor-timeline">' + items + '</ol>'
        : '<p class="muted">No incidents: the candidate stayed in view, alone, and looking at the interview.</p>') +
      '<p class="muted small">The camera checks run on the candidate’s device. Photos are taken only at flagged moments; the video itself is never recorded. Lighting and camera angle can mislead the checks, so treat flags as evidence for a person to review.</p></section>';
  }

  function render(sheet, opts) {
    const o = opts || {};
    const clipsFor = (qid) => (o.clips && o.clips.get(qid)) || null;
    const s = sheet.speech;
    const dims = sheet.dimensions;
    const tone = sheet.verdict.tone;
    const kpis = [
      tile('English level (est.)', sheet.englishLevel ? esc(sheet.englishLevel.code) : '—', sheet.englishLevel ? sheet.englishLevel.label : ''),
      tile('Answered', sheet.integrity.answered + '<span class="tile-unit">/' + sheet.questions.length + '</span>', sheet.integrity.skipped ? sheet.integrity.skipped + ' skipped' : 'questions'),
      tile('Speaking pace', s.avgWpm ? s.avgWpm + '<span class="tile-unit">wpm</span>' : '—', s.avgWpm ? 'ideal 120–165' : 'voice mode only'),
      tile('Time to answer', s.avgLatencySec != null ? s.avgLatencySec + '<span class="tile-unit">s</span>' : '—', s.avgLatencySec != null ? 'average start delay' : 'voice mode only'),
      tile('Filler words', s.fillerPer100 + '<span class="tile-unit">/100 words</span>', s.fillerPer100 <= 2 ? 'fluent' : s.fillerPer100 <= 4 ? 'noticeable' : 'frequent'),
    ].join('');

    const flags = sheet.redFlags.length
      ? '<section class="card card-flags"><h2>Red flags to probe</h2><ul class="flags">' + sheet.redFlags.map((f) =>
        '<li>' + statusBadge(f.severity === 'high' ? 'critical' : f.severity === 'medium' ? 'serious' : 'warning', f.severity) +
        ' <strong>' + esc(f.label) + '</strong><span class="muted"> — “' + esc(f.evidence) + '”</span></li>').join('') + '</ul></section>'
      : '';

    const call = sheet.callHandling
      ? '<section class="card"><h2>Mock call checklist</h2><ul class="checklist big">' + sheet.callHandling.map((it) =>
        '<li class="' + (it.hit ? 'ok' : 'miss') + '"><span aria-hidden="true">' + (it.hit ? '✓' : '✕') + '</span><div><strong>' + esc(it.label) + '</strong>' +
        (it.hit ? '' : '<div class="muted small">' + esc(it.tip) + '</div>') + '</div></li>').join('') + '</ul></section>'
      : '';

    const roleFit = '<section class="card"><h2>Role fit</h2>' + sheet.roleFit.map((r) =>
      meter(r.fit, r.label, r.notes.length ? r.notes.join('; ') : '', '')).join('') + '</section>';

    const grammar = sheet.grammar.length
      ? '<div class="table-wrap"><table class="grammar"><thead><tr><th>You said</th><th>Better</th><th>Why</th></tr></thead><tbody>' +
        sheet.grammar.map((g) => '<tr><td>“' + esc(g.evidence) + '”</td><td>' + esc(g.fix) + '</td><td class="muted">' + esc(g.why) + '</td></tr>').join('') + '</tbody></table></div>'
      : '<p class="muted">No common grammar slips detected.</p>';

    const chipsOf = (arr) => (arr.length ? arr.map((t) => '<span class="chip">“' + esc(t.term) + '” ×' + t.count + '</span>').join('') : '<span class="muted">none</span>');
    const speech = '<section class="card" id="rep-speech"><h2>Speech & language analytics</h2>' +
      '<div class="tiles small-tiles">' +
      tile('Words spoken', String(s.words), s.speakingSec ? fmtDuration(s.speakingSec) + ' of speech' : '') +
      tile('Hedging', s.hedgePer100 + '<span class="tile-unit">/100 words</span>', s.hedgePer100 <= 1.5 ? 'direct' : 'often unsure') +
      tile('Long pauses', s.voiceAnswers ? String(s.longPauses) : '—', s.voiceAnswers ? 'pauses over 2 s' : 'voice mode only') +
      tile('Voice modulation', s.pitchVariation != null ? s.pitchVariation + '<span class="tile-unit">st</span>' : '—', s.pitchVariation != null ? (s.pitchVariation < 1.2 ? 'flat' : s.pitchVariation < 2 ? 'moderate' : 'expressive') : 'voice mode only') +
      '</div>' +
      '<div class="chip-row"><span class="chip-title">Top fillers</span>' + chipsOf(s.topFillers) + '</div>' +
      '<div class="chip-row"><span class="chip-title">Top hedges</span>' + chipsOf(s.topHedges) + '</div>' +
      '<h3>Grammar coach</h3>' + grammar + '</section>';

    const integrity = sheet.integrity;
    const integ = '<section class="card"><h2>Integrity & engagement</h2><ul class="facts">' +
      '<li><span>Left the interview tab</span><strong>' + integrity.tabSwitches + '×</strong></li>' +
      (sheet.config.mode === 'voice' ? '' : '<li><span>Pasted answers</span><strong>' + integrity.pastes + '</strong></li>') +
      '<li><span>Asked to repeat a question</span><strong>' + integrity.repeats + '×</strong></li>' +
      '<li><span>Skipped questions</span><strong>' + integrity.skipped + '</strong></li></ul></section>';

    return '<article class="report" id="report">' +
      '<header class="report-head card">' +
      '<div class="report-id"><div class="eyebrow">Interview scoresheet</div><h1>' + esc(sheet.candidate.name || 'Candidate') + '</h1>' +
      '<p class="muted">' + esc(sheet.role.label) + (sheet.company ? ' · ' + esc(sheet.company.display || sheet.company.name) + ' style' : '') + ' · ' + esc(sheet.plan.label) + ' · ' + (sheet.candidate.experience === 'experienced' ? 'Experienced' : 'Fresher') +
      (sheet.config && sheet.config.job && sheet.config.job.skills && sheet.config.job.skills.length ? '<br>Tailored to the job: ' + esc(sheet.config.job.skills.slice(0, 5).map((s) => s.label).join(' · ')) : '') +
      '<br>' + esc(fmtDate(sheet.createdAt)) + ' · ' + esc(fmtDuration(sheet.durationSec)) + ' · ' + (sheet.config.mode === 'voice' ? 'Voice interview' : 'Typed interview') + '</p></div>' +
      '<div class="hero"><div class="hero-num" style="--score:' + Math.max(0, Math.min(100, Number(sheet.overall) || 0)) + '"><span class="hero-val">' + sheet.overall + '</span><span class="hero-den">/100</span></div>' + statusBadge(tone, sheet.verdict.label) +
      (sheet.proctoring && sheet.proctoring.rating ? statusBadge(sheet.proctoring.rating.tone, 'Integrity: ' + sheet.proctoring.rating.label) : '') +
      (sheet.terminated ? '<div class="muted small">Ended after three integrity warnings.</div>'
        : sheet.incomplete ? '<div class="muted small">Interview incomplete; treat with caution.</div>' : '') + '</div></header>' +
      '<div class="tiles">' + kpis + '</div>' +
      '<nav class="rep-nav no-print" aria-label="Scoresheet sections">' +
      [['rep-summary', 'Summary'], o.canDrill ? ['rep-practice', 'Practice plan'] : null, ['rep-skills', 'Skills'], ['transcript', 'Transcript'], ['rep-questions', 'Every question'], ['rep-speech', 'Speech & grammar']]
        .filter(Boolean).map((l) => '<a href="#' + l[0] + '">' + l[1] + '</a>').join('') + '</nav>' +
      proctoringCard(sheet, o.photos) +
      '<section class="card" id="rep-summary"><h2>Interviewer’s summary ' + (sheet.summarySource === 'llm' ? '<span class="tag">written by local AI</span>' : '') + '</h2><p class="summary">' + esc(sheet.summary) + '</p></section>' +
      roundsCard(sheet) +
      practiceCard(sheet, o) +
      '<section class="card" id="rep-skills"><h2>Skill breakdown</h2><p class="muted small">Each score is on a recruiter’s scale (80+ strong, 66+ hire, 52+ borderline), with the evidence from this interview behind it.</p><div class="meters">' + dims.map((d) => meter(d.score, d.label, d.about, d.band, d.why)).join('') + '</div></section>' +
      '<div class="grid-2">' +
      '<section class="card"><h2>Strengths</h2><ul class="list-good">' + sheet.strengths.map((x) => '<li>' + labelled(x) + '</li>').join('') + '</ul></section>' +
      '<section class="card"><h2>How to improve</h2><ul class="list-improve">' + sheet.improvements.map((x) => '<li>' + labelled(x) + '</li>').join('') + '</ul></section>' +
      '</div>' + transcript(sheet, clipsFor) + flags +
      '<div class="grid-2">' + roleFit + (call || integ) + '</div>' +
      speech +
      '<section class="card"><h2>Score per question</h2>' + questionChart(sheet) + '</section>' +
      '<section class="card" id="rep-questions"><h2>Question-by-question breakdown</h2>' + sheet.questions.map((q, i) => questionDetail(q, i, o)).join('') + '</section>' +
      (call ? integ : '') +
      '<p class="disclaimer muted small">Automated assessment by a transparent, rule-based model' + (sheet.llmUsed ? ' with a local AI second opinion' : '') +
      '. Speech-to-text can mishear words, especially with strong accents or background noise. Use this scoresheet as one input alongside human judgement, not as the sole basis for a hiring decision.</p>' +
      '</article>';
  }

  function wireChart(container) {
    const chart = container.querySelector('.qchart');
    if (!chart) return;
    const tip = chart.querySelector('.chart-tip');
    const show = (bar) => {
      tip.textContent = '';
      const v = document.createElement('strong');
      v.textContent = bar.getAttribute('data-value');
      const t = document.createElement('span');
      t.textContent = bar.getAttribute('data-tip');
      tip.append(v, t);
      tip.hidden = false;
      const cr = chart.getBoundingClientRect();
      const br = bar.getBoundingClientRect();
      tip.style.top = (br.bottom - cr.top + 4) + 'px';
      tip.style.left = Math.min(Math.max(0, br.left - cr.left + 120), Math.max(0, cr.width - 300)) + 'px';
    };
    const hide = () => { tip.hidden = true; };
    chart.querySelectorAll('.qbar').forEach((bar) => {
      bar.addEventListener('pointerenter', () => show(bar));
      bar.addEventListener('pointerleave', hide);
      bar.addEventListener('focus', () => show(bar));
      bar.addEventListener('blur', hide);
    });
  }

  function mount(container, sheet, opts) {
    container.innerHTML = render(sheet, opts);
    wireChart(container);
  }

  AII.Report = { render, mount, highlighted, modelBlock };
})(typeof window !== 'undefined' ? window : globalThis);
