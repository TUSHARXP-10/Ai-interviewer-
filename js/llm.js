/*
 * llm.js — OPTIONAL second opinion from a free local AI model via Ollama.
 *
 * The interviewer works fully without this. If you install Ollama
 * (https://ollama.com) and pull a small model (e.g. `ollama pull llama3.2`),
 * each answer is also rated by the model and its scores are blended with the
 * rule-based ones (rules stay the majority), and the final summary is written
 * by the model. Everything stays on your computer — no API key, no cost.
 */
(function (root) {
  'use strict';
  const isNode = typeof module === 'object' && module.exports;

  const DEFAULT_URL = 'http://localhost:11434';

  function withTimeout(ms) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    return { signal: ctrl.signal, done: () => clearTimeout(t) };
  }

  async function status(baseUrl) {
    const url = (baseUrl || DEFAULT_URL).replace(/\/+$/, '');
    const to = withTimeout(2500);
    try {
      const res = await fetch(url + '/api/tags', { signal: to.signal });
      if (!res.ok) return { ok: false, error: 'HTTP ' + res.status, models: [] };
      const data = await res.json();
      return { ok: true, models: (data.models || []).map((m) => m.name) };
    } catch (e) {
      return { ok: false, error: e.name === 'AbortError' ? 'timeout' : String(e.message || e), models: [] };
    } finally {
      to.done();
    }
  }

  async function chat(cfg, messages, json, timeoutMs) {
    const url = (cfg.url || DEFAULT_URL).replace(/\/+$/, '');
    const to = withTimeout(timeoutMs || 90000);
    try {
      const res = await fetch(url + '/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: to.signal,
        body: JSON.stringify({
          model: cfg.model,
          messages,
          stream: false,
          format: json ? 'json' : undefined,
          options: { temperature: 0.2, num_predict: json ? 300 : 400 },
        }),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      return (data.message && data.message.content) || '';
    } finally {
      to.done();
    }
  }

  const RUBRIC = 'You are a senior recruiter hiring for BPO and customer-service roles. Rate the candidate\'s answer strictly but fairly. ' +
    'The answer may be a speech-to-text transcript without punctuation; do not penalise missing punctuation or capitalisation. ' +
    'Reply ONLY with JSON of this shape: {"relevance":0-10,"thought":0-10,"communication":0-10,"confidence":0-10,"customer":0-10 or null,"attitude":0-10,"feedback":"one short sentence","better":"one short sentence"}. ' +
    'relevance = answers the actual question with substance; thought = logical structure, reasons and examples; communication = clarity and correct English; ' +
    'confidence = decisive, ownership-taking language; customer = empathy and customer-handling skill (null if the question is not about customers); ' +
    'attitude = motivation and professionalism. 5 is average, 8+ is genuinely strong, 3 or less is poor.';

  function clamp10(v) {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(0, Math.min(10, n)) : null;
  }

  /** Rate one answer. Returns 0–100 scores plus feedback, or null on failure. */
  async function evaluate(cfg, input) {
    let answer;
    if (input.turns) {
      answer = input.turns.map((t) => 'Customer: ' + t.customer + '\nCandidate (agent): ' + (t.agent || '(no reply)')).join('\n');
    } else {
      answer = input.answer;
      for (const f of input.followUps || []) answer += '\n[Follow-up question: ' + f.text + ']\n' + f.answer;
    }
    const user = 'Role: ' + input.role + '\nQuestion: ' + input.question + '\n' + (input.turns ? 'Mock call transcript:\n' : 'Candidate\'s answer:\n') + '"""' + String(answer).slice(0, 3000) + '"""';
    try {
      const raw = await chat(cfg, [{ role: 'system', content: RUBRIC }, { role: 'user', content: user }], true, cfg.timeoutMs);
      const j = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
      const pct = (k) => (clamp10(j[k]) == null ? undefined : Math.round(clamp10(j[k]) * 10));
      return {
        relevance: pct('relevance'),
        thought: pct('thought'),
        communication: pct('communication'),
        confidence: pct('confidence'),
        customer: j.customer == null ? undefined : pct('customer'),
        attitude: pct('attitude'),
        feedback: typeof j.feedback === 'string' ? j.feedback.slice(0, 300) : '',
        better: typeof j.better === 'string' ? j.better.slice(0, 300) : '',
        model: cfg.model,
      };
    } catch (e) {
      return null;
    }
  }

  /** Write the interviewer's summary paragraph from the finished scoresheet. */
  async function summarize(cfg, sheet) {
    const compact = {
      candidate: sheet.candidate.name,
      role: sheet.role.label,
      overall: sheet.overall,
      verdict: sheet.verdict.label,
      english: sheet.englishLevel && sheet.englishLevel.code,
      dimensions: Object.fromEntries(sheet.dimensions.map((d) => [d.label, d.score])),
      strengths: sheet.strengths,
      improvements: sheet.improvements,
      redFlags: sheet.redFlags.map((f) => f.label),
      speech: { wpm: sheet.speech.avgWpm, responseSec: sheet.speech.avgLatencySec, fillersPer100: sheet.speech.fillerPer100 },
      answers: sheet.questions.slice(0, 16).map((q) => ({ q: q.text.slice(0, 120), a: (q.answer || (q.turns || []).map((t) => t.agent).join(' / ') || '').slice(0, 300), score: q.quality })),
    };
    const prompt = 'Write a 4-6 sentence interviewer summary of this candidate for the hiring manager. Be specific and balanced: mention concrete strengths, the most important gaps, and a clear recommendation consistent with the verdict. ' +
      'Refer to the candidate by name and do not use gendered pronouns. Plain text only, no lists or headings.\n\nData:\n' + JSON.stringify(compact);
    try {
      const text = await chat(cfg, [{ role: 'user', content: prompt }], false, cfg.timeoutMs);
      const clean = String(text).replace(/^\s*(summary:)?\s*/i, '').trim();
      return clean.length > 40 ? clean.slice(0, 1500) : null;
    } catch (e) {
      return null;
    }
  }

  const api = { DEFAULT_URL, status, evaluate, summarize };
  if (isNode) module.exports = api;
  else (root.AII = root.AII || {}).LLM = api;
})(typeof window !== 'undefined' ? window : globalThis);
