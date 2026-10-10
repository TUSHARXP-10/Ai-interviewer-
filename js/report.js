/*
 * report.js — renders the scoresheet (screen + print/PDF).
 */
(function (root) {
  'use strict';
  const AII = root.AII;
  const esc = AII.Text.escapeHtml;

  const STATUS_ICON = { good: '✓', warning: '!', serious: '!', critical: '✕' };
  const KIND_LABEL = { filler: 'Filler word', hedge: 'Hedging', strong: 'Strong phrase', grammar: 'Grammar slip', flag: 'Red flag' };

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

  function highlighted(text, ignoreFlags) {
    if (!text || !text.trim()) return '<em class="muted">No answer.</em>';
    return AII.Analyzer.segments(text, { ignoreFlags })
      .map((s) => (s.kind ? '<mark class="hl hl-' + s.kind + '" title="' + KIND_LABEL[s.kind] + '">' + esc(s.text) + '</mark>' : esc(s.text)))
      .join('');
  }

  function meter(score, label, sub, extra) {
    const v = score == null ? 0 : score;
    return '<div class="meter-row">' +
      '<div class="meter-head"><span class="meter-label">' + esc(label) + '</span>' +
      '<span class="meter-value">' + (score == null ? '—' : score) + '<span class="meter-band">' + esc(extra || '') + '</span></span></div>' +
      '<div class="meter" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + v + '" aria-label="' + esc(label) + '"><div class="meter-fill" style="width:' + v + '%"></div></div>' +
      (sub ? '<div class="meter-sub">' + esc(sub) + '</div>' : '') +
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

  function clipPlayers(list) {
    if (!list || !list.length) return '';
    return '<div class="clips"><span class="eyebrow">🎧 Your recording</span>' + list.map((c) =>
      '<div class="clip"><span class="clip-label">' + esc(c.label) + '</span><audio controls preload="metadata" src="' + esc(c.url) + '"></audio>' +
      (c.file ? '<a class="clip-dl" href="' + esc(c.url) + '" download="' + esc(c.file) + '">Download</a>' : '') + '</div>').join('') + '</div>';
  }

  function questionDetail(q, i, clips) {
    const parts = [];
    // The summary line already shows the question; repeat it only when it differs (e.g. spoken-only listening details).
    if (q.display && q.display !== q.text) parts.push('<p class="q-text"><span class="eyebrow">What the interviewer said</span>' + esc(q.text) + '</p>');
    if (q.turns) {
      parts.push('<div class="call">' + q.turns.map((t) =>
        '<div class="call-line call-customer"><span class="who">Customer</span><p>' + esc(t.customer) + '</p></div>' +
        '<div class="call-line call-agent"><span class="who">You</span><p>' + highlighted(t.agent, q.ignoreFlags) + '</p></div>').join('') + '</div>');
    } else if (q.skipped) {
      parts.push('<p class="answer"><em class="muted">Skipped.</em></p>');
    } else {
      parts.push('<div class="answer"><span class="eyebrow">Answer</span><p>' + highlighted(q.answer, q.ignoreFlags) + '</p></div>');
    }
    for (const f of q.followUps || []) {
      parts.push('<div class="answer followup"><span class="eyebrow">Follow-up: ' + esc(f.text) + '</span><p>' + highlighted(f.answer, q.ignoreFlags) + '</p></div>');
    }
    if (q.listening) {
      parts.push('<ul class="checklist">' + q.listening.items.map((it) =>
        '<li class="' + (it.hit ? 'ok' : 'miss') + '"><span aria-hidden="true">' + (it.hit ? '✓' : '✕') + '</span> ' + esc(it.label) + (it.hit ? '' : ' <span class="muted">(missed)</span>') + '</li>').join('') + '</ul>');
    }
    if (q.correction) {
      parts.push('<p class="correction"><span class="eyebrow">Expected</span>“' + esc(q.correction.correct) + '” — <strong>' + esc(q.correction.verdict) + '</strong></p>');
    }
    if (q.call) {
      parts.push('<ul class="checklist">' + q.call.map((it) =>
        '<li class="' + (it.hit ? 'ok' : 'miss') + '"><span aria-hidden="true">' + (it.hit ? '✓' : '✕') + '</span> ' + esc(it.label) + (it.hit && it.evidence ? ' <span class="muted">— “' + esc(it.evidence) + '”</span>' : '') + '</li>').join('') + '</ul>');
    }
    parts.push(clipPlayers(clips));
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

    const score = q.skipped ? 'Skipped' : q.quality;
    return '<details class="qa"' + (i === 0 ? ' open' : '') + '><summary>' +
      '<span class="qa-num">Q' + (i + 1) + '</span>' +
      '<span class="qa-title"><span class="qa-stage">' + esc(q.stage) + '</span><span class="qa-q">' + esc(q.display || q.text) + '</span></span>' +
      '<span class="qa-score" aria-label="Score">' + score + '</span></summary>' +
      '<div class="qa-body">' + parts.join('') + '</div></details>';
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
    const speech = '<section class="card"><h2>Speech & language analytics</h2>' +
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

    const legend = '<div class="legend" aria-label="Highlight legend">' +
      Object.keys(KIND_LABEL).map((k) => '<span><mark class="hl hl-' + k + '">' + KIND_LABEL[k].toLowerCase() + '</mark></span>').join('') + '</div>';

    return '<article class="report" id="report">' +
      '<header class="report-head card">' +
      '<div class="report-id"><div class="eyebrow">Interview scoresheet</div><h1>' + esc(sheet.candidate.name || 'Candidate') + '</h1>' +
      '<p class="muted">' + esc(sheet.role.label) + ' · ' + esc(sheet.plan.label) + ' · ' + (sheet.candidate.experience === 'experienced' ? 'Experienced' : 'Fresher') +
      '<br>' + esc(fmtDate(sheet.createdAt)) + ' · ' + esc(fmtDuration(sheet.durationSec)) + ' · ' + (sheet.config.mode === 'voice' ? 'Voice interview' : 'Typed interview') + '</p></div>' +
      '<div class="hero"><div class="hero-num">' + sheet.overall + '<span class="hero-den">/100</span></div>' + statusBadge(tone, sheet.verdict.label) +
      (sheet.incomplete ? '<div class="muted small">Interview incomplete; treat with caution.</div>' : '') + '</div></header>' +
      '<div class="tiles">' + kpis + '</div>' +
      '<section class="card"><h2>Interviewer’s summary ' + (sheet.summarySource === 'llm' ? '<span class="tag">written by local AI</span>' : '') + '</h2><p class="summary">' + esc(sheet.summary) + '</p></section>' +
      '<section class="card"><h2>Skill breakdown</h2><div class="meters">' + dims.map((d) => meter(d.score, d.label, d.about, d.band)).join('') + '</div></section>' +
      '<div class="grid-2">' +
      '<section class="card"><h2>Strengths</h2><ul class="list-good">' + sheet.strengths.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul></section>' +
      '<section class="card"><h2>How to improve</h2><ul class="list-improve">' + sheet.improvements.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul></section>' +
      '</div>' + flags +
      '<div class="grid-2">' + roleFit + (call || integ) + '</div>' +
      speech +
      '<section class="card"><h2>Score per question</h2>' + questionChart(sheet) + '</section>' +
      '<section class="card"><h2>Question-by-question breakdown</h2>' + legend + sheet.questions.map((q, i) => questionDetail(q, i, clipsFor(q.id))).join('') + '</section>' +
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

  AII.Report = { render, mount, highlighted };
})(typeof window !== 'undefined' ? window : globalThis);
