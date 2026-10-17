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
  const CallSim = isNode ? require('./callsim.js') : root.AII.CallSim;
  const CallContent = isNode ? require('./callContent.js') : root.AII.CallContent;

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
    // Engineering
    Projects: "Let's talk about your work.",
    'Thought Process': "Now I'd like to understand how you think.",
    'Values & Fit': '',
    'CS Fundamentals': "Let's cover some computer science fundamentals.",
    'Technical Fundamentals': '',
    'Problem Solving': "Now a problem-solving question. Think out loud, and tell me the complexity of your approach.",
    'Object-Oriented Design': "Let's do some object-oriented design.",
    'System Design': "Let's move on to system design. Start with the requirements, then the main components.",
    'Practical Engineering': "Now a practical, real-world scenario.",
  };

  const MAX_FOLLOWUPS = { quick: 2, standard: 4, full: 6 };

  // Follow-ups that already open with an acknowledgement get no extra "Thanks." in front.
  const ACK_START = /^(?:thank(?:s| you)\b|that'?s (?:a good|fine|okay|alright)|that is (?:completely )?fine|i understand|i see\b|good to hear|okay\b|alright\b|great\b|understood\b|salary matters)/i;

  const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five'];

  /** The topic-talk round for one random word: the word becomes part of the rubric. */
  function topicQuestion(q, topic) {
    const fillWord = (t) => String(t).replace(/\{word\}/g, topic.word);
    const terms = topic.terms.concat([topic.word.toLowerCase()]);
    return Object.assign({}, q, {
      text: fillWord(q.text),
      display: fillWord(q.display),
      topic: { word: topic.word, angles: topic.angles || [] },
      concepts: [{ id: 'topic', label: 'Staying on “' + topic.word + '”', weight: 1.5, terms }].concat(q.concepts || []),
    });
  }

  /** The live-call round for one random customer: their problem shapes the rubric. */
  function liveQuestion(q, sim) {
    const sc = sim.scenario;
    return Object.assign({}, q, {
      text: 'Live call: ' + sc.title.charAt(0).toLowerCase() + sc.title.slice(1) + ' (' + sim.persona.label.toLowerCase() + ' customer)',
      tip: sc.goodPractice || q.tip,
      scenarioId: sc.id,
      personaId: sim.persona.id,
      issueTerms: sc.issueTerms,
    });
  }

  function createSession(opts) {
    const o = Object.assign({ length: 'standard', role: 'general', experience: 'fresher', mode: 'voice', interviewerName: 'Tushar AI' }, opts);
    const rand = Text.rng(o.seed != null ? o.seed : Date.now());
    // o.only: a practice drill of just these questions (one follow-up at most, no rounds).
    const planDef = o.only ? { label: 'Practice drill', minutes: '2', maxFollowUps: 1 }
      : Questions.planInfo ? Questions.planInfo(o.length, o.role, o.company, o.experience) : Questions.PLANS[o.length] || Questions.PLANS.standard;
    const plan = Questions.buildPlan({ length: o.length, role: o.role, experience: o.experience, company: o.company, only: o.only, job: o.job, random: rand });
    const company = (Questions.COMPANIES && Questions.COMPANIES[o.company]) || null;
    const items = plan.map((q, i) => {
      const item = { question: q, parts: [], followUps: [], turns: [], pendingCustomer: null, sim: null, round: null };
      if (q.slot === 'topic') item.question = topicQuestion(q, pickTopic());
      if (q.live) {
        item.sim = CallSim.createCall({ random: rand, gender: o.customerGender, scenarioId: o.scenarioId, personaId: o.personaId });
        item.question = liveQuestion(q, item.sim);
      }
      if (q.round && planDef.rounds) {
        // Engineering: two rounds of several questions; the round is announced at its first question.
        item.round = Object.assign({ n: q.round, of: planDef.rounds.length, multi: true, titles: planDef.rounds.map((r) => r.title) }, planDef.rounds[q.round - 1]);
        item.roundStart = i === 0 || plan[i - 1].round !== q.round;
      } else if (planDef.rounds && planDef.rounds[i]) {
        item.round = Object.assign({ n: i + 1, of: plan.length }, planDef.rounds[i]);
        item.roundStart = true;
      }
      return item;
    });
    const maxFollowUps = o.maxFollowUps != null ? o.maxFollowUps : planDef.maxFollowUps != null ? planDef.maxFollowUps : MAX_FOLLOWUPS[o.length] || 4;

    function pickTopic() {
      const all = CallContent.TOPICS;
      const fixed = o.topicWord && all.find((t) => t.word.toLowerCase() === String(o.topicWord).toLowerCase());
      return fixed || all[Math.floor(rand() * all.length) % all.length];
    }
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
      const p = planDef;
      const how = o.mode === 'voice'
        ? 'Take a moment to think before you answer, speak naturally, and press Done when you finish each answer.'
        : 'Take a moment to think, type your answer, and press Submit when you are done.';
      const hello = firstName() ? 'Hello ' + firstName() + ', welcome!' : 'Hello, welcome!';
      return hello + " I'm " + o.interviewerName + ", and I'll be your interviewer today for the " + role.short +
        ' position. This interview has ' + items.length + ' questions and takes about ' + p.minutes +
        ' minutes. ' + how + " Let's get started.";
    }

    /** Spoken briefing for the hands-free voice interview. */
    function briefing(opts) {
      const b = Object.assign({ pauseEnds: true }, opts);
      const role = Questions.ROLES[o.role] || Questions.ROLES.general;
      const p = planDef;
      const ending = b.pauseEnds
        ? "When you finish an answer, simply pause, or say that's all."
        : "When you finish an answer, say that's all, or press I'm done.";
      if (p.tech) {
        const at = company ? ' at ' + company.name : '';
        return 'This interview is for the ' + role.short + ' role' + at + '. It has two rounds: first, a conversation about you, your projects and how you think; ' +
          'then a technical round' + (company && company.kind !== 'startup' && company.name.indexOf('a ') !== 0 ? ', the way ' + company.name + ' interviews run' : '') +
          '. It takes about ' + p.minutes.replace(/\s*[–-]\s*/, ' to ') + ' minutes. If you want to hear a question again, just say repeat. ' +
          ending + " There's no code to type: in the technical round, think out loud, because I'm listening for your reasoning as much as the answer. Let's begin.";
      }
      if (p.englishOnly) {
        return 'This is an English practice round, in the style of the automated spoken-English tests many BPOs use. ' +
          'First, repeat a few sentences exactly as you hear them: you hear each one once, so listen to the whole sentence. ' +
          'Then a short listening test, two sentence corrections, and a short talk on a topic. It takes about ' + p.minutes.replace(/s*[–-]s*/, ' to ') + ' minutes. ' +
          ending + " Let's begin.";
      }
      if (p.rounds) {
        return 'This assessment is for the ' + role.short + ' position. It has ' + (NUMBER_WORDS[items.length] || items.length) + ' rounds: ' +
          'you introduce yourself, tell me why you want to work in a BPO, talk for up to three minutes on a random word, ' +
          'and then handle a live customer call. It takes about ' + p.minutes.replace(/\s*[–-]\s*/, ' to ') + ' minutes. ' +
          ending + " Let's begin.";
      }
      return 'This interview is for the ' + role.short + ' position. It has ' + items.length + ' questions and takes about ' +
        p.minutes.replace(/\s*[–-]\s*/, ' to ') + ' minutes. If you want to hear a question again, just say repeat. ' +
        ending + " Let's get started.";
    }

    function questionStep(item, lead) {
      const q = item.question;
      const speak = [];
      if (lead) speak.push({ text: lead, voice: 'interviewer' });
      if (item.round && item.roundStart) speak.push({ text: 'Round ' + (NUMBER_WORDS[item.round.n] || item.round.n) + ': ' + item.round.title.toLowerCase().replace(/ & /g, ' and ') + '.', voice: 'interviewer' });
      else if (q.stageLabel !== lastStage && lastStage !== null && TRANSITIONS[q.stageLabel]) speak.push({ text: TRANSITIONS[q.stageLabel], voice: 'interviewer' });
      lastStage = q.stageLabel;
      if (q.live) {
        speak.push({ text: 'You are a customer support agent at ' + item.sim.scenario.company + ". I'll put a customer through now. They could be in any mood, so handle the call exactly as you would on the floor. The call lasts about three minutes.", voice: 'interviewer' });
        const line = item.sim.opening();
        item.pendingCustomer = line;
        speak.push({ text: line, voice: 'customer' });
        return makeStep('roleplay', item, speak, line, 0);
      }
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
        round: item.round,
        topic: q.topic || null,
        longTalk: !!q.longTalk,
        prepSeconds: q.prepSeconds || 0,
        call: item.sim ? item.sim.snapshot() : null,
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

    // "Let's move on" makes no sense right before "That brings us to the end".
    function skippedAck() {
      return idx >= items.length - 1 ? 'No problem.' : pick('skipped');
    }

    function ackFor(analysis, q) {
      if (analysis.events.skipped || analysis.skipped) return skippedAck();
      if (q.type === 'closing') {
        return analysis.askedQuestion && analysis.askedQuestion.asks
          ? "That's a great question. The HR team will share those details with you in the next round."
          : 'Alright.';
      }
      if (q.type === 'listening' || q.type === 'correction' || q.type === 'repeat') return pick('mid');
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
          speak: o.only ? [{ text: (lead ? lead + ' ' : '') + "That's it for this one. Let's see how it compares with last time.", voice: 'interviewer' }] : [{ text: (lead ? lead + ' ' : '') + 'That brings us to the end of the interview. Thank you' + (name ? ', ' + name + ',' : '') + " for your time. I'm now preparing your scoresheet.", voice: 'interviewer' }],
        };
      }
      step = questionStep(items[idx], lead);
      return { done: false, step };
    }

    /** What the interviewer says when the live call ends. */
    function callEnding(sum) {
      const how = {
        resolved: sum.moodEnd <= 45 ? 'You calmed the customer down and resolved the problem.' : 'The problem is resolved, though the customer is still not happy.',
        unresolved: 'The customer was left without a clear solution.',
        hangup: 'The customer hung up.',
        time: "We're out of time on that call.",
      }[sum.endedBy] || '';
      return "That's the end of the call. " + how;
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

      if (q.live) {
        const agent = (ans.text || '').trim();
        item.turns.push({ customer: item.pendingCustomer, agent, timing: ans.timing, audio: ans.audio, events: ans.events, mode: ans.mode });
        const skipped = !!(ans.events && ans.events.skipped) && !agent;
        const r = skipped ? { line: '', done: true } : item.sim.reply(agent, { elapsedMs: ans.events && ans.events.callElapsedMs });
        if (!r.done) {
          item.pendingCustomer = r.line;
          step = makeStep('roleplay', item, [{ text: r.line, voice: 'customer' }], r.line, item.turns.length);
          step.call.delta = r.delta;
          return { done: false, step };
        }
        const analysis = Analyzer.analyzeAnswer(q, combine(item));
        const res = advance(skipped ? skippedAck() : callEnding(item.sim.summary()));
        if (r.line) {
          const target = res.step ? res.step.speak : res.speak;
          target.unshift({ text: r.line, voice: 'customer' });
        }
        return Object.assign(res, { analysis, call: item.sim.summary() });
      }

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
        return Object.assign(advance(skippedAll ? skippedAck() : "Thank you, that's the end of the mock call. " + (analysis.quality >= 70 ? 'You handled that well.' : '')), { analysis });
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
        const lead = ACK_START.test(fu.text) ? '' : ACKS.followUpLead[(ackCursor.followUpLead++) % ACKS.followUpLead.length] + ' ';
        step = makeStep('followup', item, [{ text: lead + fu.text, voice: 'interviewer' }], fu.text);
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
        if (s.audio && s.audio.voicedFrames && s.audio.onsetMs != null) audio = mergeAudio(audio, s.audio);
      });
      // Latency of the main answer (or the average across mock-call turns).
      if (lat.length) timing.latencyMs = q.type === 'roleplay' ? lat.reduce((a, b) => a + b, 0) / lat.length : lat[0];
      if (events.skipped && texts.length) events.skipped = false;
      return {
        text: texts.join(' '),
        turns: q.type === 'roleplay' ? item.turns.map((t) => ({ customer: t.customer, agent: t.agent })) : undefined,
        call: item.sim ? item.sim.summary() : undefined,
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
            round: it.round,
          };
        });
    }

    return {
      options: o,
      plan,
      company,
      rounds: planDef.rounds || null,
      opening,
      briefing,
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
