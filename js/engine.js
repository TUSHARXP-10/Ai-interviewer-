/*
 * engine.js — the interviewer's brain: what to say next.
 *
 * A Session walks through the planned questions and decides, after every
 * answer, whether to probe with a follow-up, how to react ("Great answer" vs
 * "Okay, let's move on"), and — in the mock call — how the customer responds
 * based on what the candidate actually said.
 *
 * It is UI-agnostic: the app asks for the current step, plays `speak`, collects
 * an answer, and calls submit(). Pure logic, so it also runs in Node tests.
 */
(function (root) {
  'use strict';
  const isNode = typeof module === 'object' && module.exports;
  const Text = isNode ? require('./textUtils.js') : root.AII.Text;
  const Questions = isNode ? require('./questionBank.js') : root.AII.Questions;
  const Analyzer = isNode ? require('./analyzer.js') : root.AII.Analyzer;

  const ACKS = {
    high: ['Great answer, thank you.', "Excellent, that's very clear.", "That's a strong answer.", 'Very well put, thank you.', 'I like that, thank you.'],
    mid: ['Thank you.', 'Okay, got it.', 'Alright, thanks for sharing that.', "Thank you, that's helpful.", 'Understood, thanks.'],
    low: ['Okay.', 'Alright, noted.', 'Okay, thank you.', "Alright, let's keep going."],
    skipped: ["No problem, let's move on.", "That's okay, we'll go to the next one."],
    followUpLead: ['Thanks.', 'Okay.', 'I see.', 'Alright.'],
  };

  const TRANSITIONS = {
    Background: "Let's talk about your background.",
    'Motivation & Fit': "Now I'd like to understand your motivation.",
    'Role Knowledge': 'Let me check your understanding of the industry.',
    'Situational Judgement': 'Next, a situation-based question.',
    'Past Experience': "Now I'd like to hear about your past experience.",
    'English & Listening': "Let's do a quick English and listening check.",
    'Speaking Exercise': '',
    Flexibility: "Let's talk about work schedules.",
    'Self-awareness': 'A couple of questions about you.',
    Expectations: 'Just a couple more.',
    Closing: "We're almost done.",
  };

  const MAX_FOLLOWUPS = { quick: 2, standard: 4, full: 6 };

  function createSession(opts) {
    const o = Object.assign({ length: 'standard', role: 'general', experience: 'fresher', mode: 'voice', interviewerName: 'Aria' }, opts);
    const rand = Text.rng(o.seed != null ? o.seed : Date.now());
    const plan = Questions.buildPlan({ length: o.length, role: o.role, experience: o.experience, random: rand });
    const items = plan.map((q) => ({ question: q, parts: [], followUps: [], turns: [], pendingCustomer: null }));
    const maxFollowUps = o.maxFollowUps != null ? o.maxFollowUps : MAX_FOLLOWUPS[o.length] || 4;
    let followUpsUsed = 0;
    let idx = 0;
    let step = null;
    let lastStage = null;
    let finished = false;
    const ackCursor = { high: 0, mid: 0, low: 0, skipped: 0, followUpLead: 0 };

    function pick(kind) {
      const arr = ACKS[kind];
      // Rotate from a random start so reactions don't repeat back-to-back.
      if (ackCursor[kind] === 0) ackCursor[kind] = 1 + Math.floor(rand() * arr.length);
      return arr[ackCursor[kind]++ % arr.length];
    }

    function firstName() {
      return String(o.name || '').trim().split(/\s+/)[0] || '';
    }

    function opening() {
      const role = Questions.ROLES[o.role] || Questions.ROLES.general;
      const p = Questions.PLANS[o.length] || Questions.PLANS.standard;
      const how = o.mode === 'voice'
        ? 'Take a moment to think before you answer, speak naturally, and press Done when you finish each answer.'
        : 'Take a moment to think, type your answer, and press Submit when you are done.';
      const hello = firstName() ? 'Hello ' + firstName() + ', welcome!' : 'Hello, welcome!';
      return hello + " I'm " + o.interviewerName + ", and I'll be your interviewer today for the " + role.short +
        ' position. This interview has ' + items.length + ' questions and takes about ' + p.minutes +
        ' minutes. ' + how + " Let's get started.";
    }

    function questionStep(item, lead) {
      const q = item.question;
      const speak = [];
      if (lead) speak.push({ text: lead, voice: 'interviewer' });
      if (q.stageLabel !== lastStage && lastStage !== null && TRANSITIONS[q.stageLabel]) speak.push({ text: TRANSITIONS[q.stageLabel], voice: 'interviewer' });
      lastStage = q.stageLabel;
      if (q.type === 'roleplay') {
        speak.push({ text: q.intro, voice: 'interviewer' });
        const line = q.turns[0].customer;
        item.pendingCustomer = line;
        speak.push({ text: line, voice: 'customer' });
        return makeStep('roleplay', item, speak, line, 0);
      }
      speak.push({ text: q.text, voice: 'interviewer' });
      return makeStep('question', item, speak, q.display || q.text);
    }

    function makeStep(kind, item, speak, prompt, turn) {
      const q = item.question;
      return {
        kind,
        index: idx,
        total: items.length,
        questionId: q.id,
        type: q.type,
        stageLabel: q.stageLabel,
        prompt,
        hideText: !!q.hideText,
        speak,
        maxSeconds: q.maxSeconds || 120,
        turn: turn == null ? null : turn,
        turns: q.turns ? q.turns.length : null,
        followUpsUsed,
      };
    }

    function current() {
      if (finished) return null;
      if (!step) step = questionStep(items[idx], null);
      return step;
    }

    function chooseFollowUp(q, analysis) {
      if (followUpsUsed >= maxFollowUps || !q.followUps || analysis.events.skipped) return null;
      const m = analysis.metrics;
      for (const fu of q.followUps) {
        const w = fu.when;
        let hit = false;
        if (w === 'short') hit = m.wordCount > 0 && m.wordCount < (q.minWords || 20);
        else if (w === 'noExample') hit = m.wordCount > 0 && m.starCount < 2 && m.structure.example === 0;
        else if (w === 'dontKnow') hit = m.dontKnow;
        else if (w === 'redFlag') hit = m.redFlags.length > 0;
        else if (w.indexOf('missing:') === 0) {
          hit = m.wordCount >= 8 && m.coverage.missing.indexOf(w.slice(8)) !== -1 && m.coverage.ratio < 0.85;
        }
        if (hit) return fu;
      }
      return null;
    }

    function ackFor(analysis, q) {
      if (analysis.events.skipped || analysis.skipped) return pick('skipped');
      if (q.type === 'closing') {
        return analysis.askedQuestion && analysis.askedQuestion.asks
          ? "That's a great question. The HR team will share those details with you in the next round."
          : 'Alright.';
      }
      if (q.type === 'listening' || q.type === 'correction') return pick('mid');
      const quality = analysis.quality;
      return quality >= 75 ? pick('high') : quality >= 50 ? pick('mid') : pick('low');
    }

    function advance(lead) {
      idx++;
      step = null;
      if (idx >= items.length) {
        finished = true;
        const name = firstName();
        return {
          done: true,
          speak: [{ text: (lead ? lead + ' ' : '') + 'That brings us to the end of the interview. Thank you' + (name ? ', ' + name + ',' : '') + " for your time. I'm now preparing your scoresheet.", voice: 'interviewer' }],
        };
      }
      step = questionStep(items[idx], lead);
      return { done: false, step };
    }

    function nextCustomerLine(q, item) {
      const spec = q.turns[item.turns.length];
      if (!spec) return null;
      if (spec.customer) return spec.customer;
      const call = Analyzer.callChecklist(item.turns.map((t) => t.agent), q.checklist);
      for (const br of spec.branch) {
        if (!br.needs || br.needs.every((id) => call.map[id])) return br.customer;
      }
      return spec.branch[spec.branch.length - 1].customer;
    }

    /**
     * answer: { text, mode, timing, audio, events }
     * returns { done, step?, speak?, analysis }
     */
    function submit(answer) {
      if (finished) throw new Error('Interview already finished');
      const item = items[idx];
      const q = item.question;
      const ans = Object.assign({ mode: o.mode, events: {} }, answer);

      if (q.type === 'roleplay') {
        item.turns.push({ customer: item.pendingCustomer, agent: (ans.text || '').trim(), timing: ans.timing, audio: ans.audio, events: ans.events, mode: ans.mode });
        const skippedAll = ans.events && ans.events.skipped;
        const line = skippedAll ? null : nextCustomerLine(q, item);
        if (line) {
          item.pendingCustomer = line;
          step = makeStep('roleplay', item, [{ text: line, voice: 'customer' }], line, item.turns.length);
          return { done: false, step };
        }
        const analysis = Analyzer.analyzeAnswer(q, combine(item));
        return Object.assign(advance(skippedAll ? pick('skipped') : "Thank you, that's the end of the mock call. " + (analysis.quality >= 70 ? 'You handled that well.' : '')), { analysis });
      }

      item.parts.push({ kind: step && step.kind === 'followup' ? 'followup' : 'main', prompt: step ? step.prompt : q.text, answer: ans });
      if (step && step.kind === 'followup') {
        const analysis = Analyzer.analyzeAnswer(q, combine(item));
        return Object.assign(advance(ackFor(analysis, q)), { analysis });
      }

      const analysis = Analyzer.analyzeAnswer(q, ans);
      const fu = chooseFollowUp(q, analysis);
      if (fu) {
        followUpsUsed++;
        const lead = ACKS.followUpLead[(ackCursor.followUpLead++) % ACKS.followUpLead.length];
        step = makeStep('followup', item, [{ text: lead + ' ' + fu.text, voice: 'interviewer' }], fu.text);
        step.followUpOf = q.id;
        return { done: false, step, analysis };
      }
      return Object.assign(advance(ackFor(analysis, q)), { analysis });
    }

    /** Merge the main answer, follow-ups and mic stats of one question. */
    function combine(item) {
      const q = item.question;
      const sources = q.type === 'roleplay' ? item.turns : item.parts.map((p) => Object.assign({ prompt: p.prompt, kind: p.kind }, p.answer));
      const texts = sources.map((s) => (q.type === 'roleplay' ? s.agent : s.text) || '').filter((t) => t.trim());
      const timing = { latencyMs: null, speakingMs: 0, totalMs: 0 };
      const lat = [];
      const events = { repeats: 0, skipped: false, pasted: false, timedOut: false };
      let audio = null;
      let mode = o.mode;
      sources.forEach((s, i) => {
        const t = s.timing || {};
        if (t.latencyMs != null) lat.push(t.latencyMs);
        timing.speakingMs += t.speakingMs || 0;
        timing.totalMs += t.totalMs || 0;
        const e = s.events || {};
        events.repeats += e.repeats || 0;
        events.pasted = events.pasted || !!e.pasted;
        events.timedOut = events.timedOut || !!e.timedOut;
        if (i === 0) events.skipped = !!e.skipped;
        if (s.mode) mode = s.mode;
        if (s.audio && s.audio.voicedFrames) audio = mergeAudio(audio, s.audio);
      });
      // Latency of the main answer (or the average across mock-call turns).
      if (lat.length) timing.latencyMs = q.type === 'roleplay' ? lat.reduce((a, b) => a + b, 0) / lat.length : lat[0];
      if (events.skipped && texts.length) events.skipped = false;
      return {
        text: texts.join(' '),
        turns: q.type === 'roleplay' ? item.turns.map((t) => ({ customer: t.customer, agent: t.agent })) : undefined,
        mode,
        timing,
        audio,
        events,
      };
    }

    function mergeAudio(a, b) {
      if (!a) return Object.assign({}, b);
      const vf = a.voicedFrames + b.voicedFrames;
      const pf = (a.pitchFrames || 0) + (b.pitchFrames || 0);
      const w = (x, y, wx, wy) => (wx + wy ? (x * wx + y * wy) / (wx + wy) : 0);
      return {
        voicedFrames: vf,
        longPauses: a.longPauses + b.longPauses,
        longestPauseMs: Math.max(a.longestPauseMs, b.longestPauseMs),
        snrDb: w(a.snrDb, b.snrDb, a.voicedFrames, b.voicedFrames),
        trailOffDb: Math.max(a.trailOffDb || 0, b.trailOffDb || 0),
        voicedRatio: w(a.voicedRatio, b.voicedRatio, a.voicedFrames, b.voicedFrames),
        pitchFrames: pf,
        pitchSdSemitones: w(a.pitchSdSemitones || 0, b.pitchSdSemitones || 0, a.pitchFrames || 0, b.pitchFrames || 0),
      };
    }

    /** Re-speak the current prompt; the app records it as a repeat. */
    function repeatSpeak() {
      const s = current();
      if (!s) return [];
      if (s.kind === 'roleplay') return [{ text: s.prompt, voice: 'customer' }];
      if (s.kind === 'followup') return [{ text: s.prompt, voice: 'interviewer' }];
      return [{ text: items[idx].question.text, voice: 'interviewer' }];
    }

    /** End early: unanswered questions count as skipped. */
    function endEarly() {
      finished = true;
      step = null;
    }

    /** Everything the scorer needs: one record per asked question. */
    function results() {
      return items
        .filter((it) => it.parts.length || it.turns.length)
        .map((it) => {
          const response = combine(it);
          const main = it.parts.find((p) => p.kind === 'main');
          return {
            question: it.question,
            response,
            mainText: main ? main.answer.text || '' : null,
            followUps: it.parts.filter((p) => p.kind === 'followup').map((p) => ({ text: p.prompt, answer: p.answer.text || '' })),
            analysis: Analyzer.analyzeAnswer(it.question, response),
          };
        });
    }

    return {
      options: o,
      plan,
      opening,
      current,
      submit,
      repeatSpeak,
      endEarly,
      results,
      get index() { return idx; },
      get total() { return items.length; },
      get finished() { return finished; },
    };
  }

  const api = { createSession, ACKS, MAX_FOLLOWUPS };
  if (isNode) module.exports = api;
  else (root.AII = root.AII || {}).Engine = api;
})(typeof window !== 'undefined' ? window : globalThis);
