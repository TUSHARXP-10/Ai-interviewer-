/*
 * callsim.js — a live customer for the mock call.
 *
 * Every call is different: a random problem (scenario, e.g. "charged twice") meets a random
 * temperament (persona, e.g. angry, confused elderly, impatient). The customer listens to
 * what the agent actually says and reacts: empathy, asking for details, a concrete fix and
 * a timeline calm them down; ignoring the problem, vague promises or rudeness wind them up.
 * Their mood (0 calm … 100 furious) is tracked turn by turn, a late complication
 * ("last time nobody called back") tests the agent, and the call ends when the problem is
 * resolved, the customer gives up or hangs up, or about three minutes have passed.
 *
 * Pure logic, so it runs in the browser (window.AII.CallSim) and in Node tests.
 */
(function (root) {
  'use strict';
  const isNode = typeof module === 'object' && module.exports;
  const Text = isNode ? require('./textUtils.js') : root.AII.Text;
  const L = isNode ? require('./lexicons.js') : root.AII.Lexicons;
  const Content = isNode ? require('./callContent.js') : root.AII.CallContent;

  const { makeDoc, findTerms, negatedAt } = Text;

  const CALL_LIMIT_MS = 180000; // about three minutes
  const MAX_TURNS = 9;

  const CHECK = {};
  for (const item of L.CALL_CHECKLIST.support) CHECK[item.id] = item.terms;
  const HOSTILE = L.RED_FLAGS.filter((f) => f.id === 'customer_hostility' || f.id === 'dismissive').reduce((all, f) => all.concat(f.terms), [])
    .concat(['your fault', 'you should have', 'not my fault', 'what do you want me to do', 'i cannot do anything', 'nothing i can do', 'stop shouting', 'listen to me', 'be quiet', 'stupid']);
  const ESCALATE = ['supervisor', 'senior', 'manager', 'escalat*', 'team lead', 'higher team', 'specialist'];
  // Stalling: promises without a fix or a time ("it will be done soon, please wait").
  const VAGUE = ['soon', 'please wait', 'wait sir', 'wait madam', 'as soon as possible', 'asap', 'it will be done', 'will be resolved', 'i will check', 'let me check', 'checking', 'one minute', 'one moment', 'hold on'];
  const REASSURE = ['do not worry', 'rest assured', 'i assure', 'i promise', 'i will make sure', 'personally', 'i understand your concern', 'you are in safe hands'];

  function pick(arr, rand) {
    return arr[Math.floor(rand() * arr.length) % arr.length];
  }

  /** Fill a line template and tidy what substitution leaves behind. */
  function fill(tpl, vars) {
    let s = String(tpl).replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : ''));
    s = s.replace(/\s+([,.!?])/g, '$1').replace(/[.!?]([.!?])/g, '$1').replace(/([,.!?])\1+/g, '$1').replace(/,\s*([.!?])/g, '$1')
      .replace(/([.!?])\s*\./g, '$1').replace(/\s{2,}/g, ' ').trim();
    // Capitalise after sentence ends (substituted text may start lower case).
    return s.replace(/(^|[.!?]\s+)([a-z])/g, (m, a, b) => a + b.toUpperCase());
  }

  const has = (doc, terms) => findTerms(doc, terms).some((h) => !negatedAt(doc, h.w0, 2));

  /** What one agent turn did, in the customer's eyes. */
  function readTurn(text, scenario) {
    const doc = makeDoc(text || '');
    const words = doc.words.length;
    const numbers = Text.extractNumbers ? Text.extractNumbers(doc) : [];
    return {
      words,
      greeting: has(doc, CHECK.opening),
      empathy: has(doc, CHECK.empathy),
      issue: has(doc, scenario.issueTerms || []),
      probe: has(doc, CHECK.probing) || /\b(can|could|may) (i|you)\b.*\b(number|details?|account|booking|id|name|registered)\b/.test(doc.str),
      confirm: !!scenario.refDigits && numbers.some((n) => n.indexOf(scenario.refDigits) !== -1),
      fix: has(doc, scenario.fixTerms || []) || has(doc, CHECK.resolution),
      timeline: has(doc, CHECK.timeline),
      ownership: has(doc, CHECK.ownership),
      reassure: has(doc, REASSURE),
      escalate: has(doc, ESCALATE),
      closingOffer: has(doc, ['anything else', 'is there anything', 'anything more']),
      goodbye: has(doc, ['bye', 'goodbye', 'good bye', 'have a nice day', 'have a good day', 'have a great day', 'thank you for calling', 'take care']),
      rude: findTerms(doc, HOSTILE).some((h) => !negatedAt(doc, h.w0, 2)),
      stalling: findTerms(doc, VAGUE).length > 0,
    };
  }

  /**
   * opts: { random, scenarioId, personaId, gender ('male'|'female'), content }
   * Returns a call: { scenario, persona, customer, opening(), reply(text, info), summary(), snapshot() }
   */
  function createCall(opts) {
    const o = opts || {};
    const rand = o.random || Math.random;
    const C = o.content || Content;
    const scenario = (o.scenarioId && C.SCENARIOS.find((s) => s.id === o.scenarioId)) || pick(C.SCENARIOS, rand);
    const persona = (o.personaId && C.PERSONAS.find((p) => p.id === o.personaId)) || pick(C.PERSONAS, rand);
    const names = C.NAMES[o.gender] || C.NAMES.female.concat(C.NAMES.male);
    const customer = { name: pick(names, rand) };
    const curveball = pick(scenario.curveballs, rand);
    const vars = { issue: scenario.issue, issueShort: scenario.issueShort, stakes: scenario.stakes, detail: scenario.detail, fixAsk: scenario.fixAsk, curveball };
    const used = new Map();

    // Variants rotate so a line never repeats word for word.
    function say(key) {
      const arr = (persona.lines && persona.lines[key]) || [];
      if (!arr.length) return '';
      const n = used.get(key) || 0;
      used.set(key, n + 1);
      const start = Math.floor(rand() * arr.length);
      return fill(arr[(start + n) % arr.length], vars);
    }

    const s = {
      mood: persona.startMood,
      history: [persona.startMood],
      turns: 0,
      elapsedMs: 0,
      details: false,
      pushes: 0,
      asks: 0,
      vagueAsked: false,
      confused: false,
      rude: 0,
      curve: 'none', // none | asked | handled | missed
      closing: false,
      done: false,
      endedBy: null,
      got: { greeting: false, empathy: false, issue: false, probe: false, confirm: false, fix: false, timeline: false, ownership: false, closingOffer: false },
      lines: [],
    };

    let openLine = null;
    function opening() {
      if (!openLine) {
        openLine = say('open');
        s.lines.push(openLine);
      }
      return openLine;
    }

    function setMood(t, first) {
      let good = 0;
      let bad = 0;
      if (t.empathy) good += first.empathy ? 18 : 5;
      if (t.issue && first.issue) good += 8;
      if (t.reassure) good += 4;
      if (t.probe && !s.details) good += 6;
      if (t.confirm && first.confirm) good += 6;
      if (t.fix) good += first.fix ? 16 : 3;
      if (t.timeline) good += first.timeline ? 12 : 2;
      if (t.ownership && first.ownership) good += 5;
      if (t.rude) bad += 30;
      if (t.words < 3) bad += 12;
      const useful = t.empathy || t.issue || t.probe || t.fix || t.timeline || t.ownership || t.escalate || t.confirm;
      if (!useful && t.words >= 3) bad += persona.id === 'impatient' ? 15 : 10;
      if (t.words > 90 && (persona.id === 'impatient' || persona.id === 'elderly')) bad += 8;
      // Asking them to wait, again, with nothing concrete: patience runs out.
      if (t.stalling && !t.fix && !t.timeline && s.turns > 1) bad += persona.id === 'impatient' || persona.id === 'aggressive' ? 12 : 8;
      const before = s.mood;
      s.mood = Math.max(0, Math.min(100, Math.round(s.mood + bad * (persona.badGain || 1) - good * (persona.goodGain || 1))));
      return s.mood - before;
    }

    function end(by, line) {
      s.done = true;
      s.endedBy = by;
      return line;
    }

    /** The customer's next line after the agent's turn. */
    function nextLine(t) {
      // Rudeness first: once is a warning, twice (or at boiling point) ends the call.
      if (t.rude) {
        s.rude++;
        if (s.rude >= 2 || s.mood >= 97) return end('hangup', say('hangup'));
        return say('rude');
      }
      if (s.closing) {
        // The customer has said goodbye: the agent's last words close the call.
        if (t.closingOffer) return end(s.endedBy || 'resolved', say('noMore'));
        return end(s.endedBy || 'resolved', '');
      }
      // The agent says goodbye before the problem is sorted: the customer is left hanging.
      if (t.goodbye && !(s.got.fix && s.got.timeline)) return end('unresolved', say('unhappy'));
      if (t.words < 3) return say('stillThere');
      if (s.elapsedMs >= CALL_LIMIT_MS || s.turns >= MAX_TURNS) return end(s.got.fix && s.got.timeline ? 'resolved' : 'time', say('timeUp'));
      if (persona.id === 'elderly' && t.words > 70 && !s.confused) {
        s.confused = true;
        return say('confused');
      }
      if (!s.details) {
        if (t.probe) { s.details = true; return say('giveDetails'); }
        if (s.turns === 1 && !t.empathy && !t.issue) return say('noEmpathy');
        if (!t.fix && s.pushes < 1) { s.pushes++; return say('pushForAction'); }
        s.details = true; // they give the details anyway, to get things moving
        return say('giveDetails');
      }
      if (s.curve === 'asked') {
        const handled = !t.rude && (t.empathy || t.ownership || t.reassure || t.fix || t.escalate || t.timeline) && t.words >= 6;
        s.curve = handled ? 'handled' : 'missed';
        if (!handled) { s.closing = true; s.endedBy = 'unresolved'; return say('unhappy'); }
        s.closing = true;
        s.endedBy = 'resolved';
        return s.mood < 45 ? say('satisfied') : say('acceptCurveball');
      }
      if (!s.got.fix) {
        s.asks++;
        if (s.asks >= 3) { s.closing = true; s.endedBy = 'unresolved'; return say('unhappy'); }
        return say('askFix');
      }
      if (!s.got.timeline) {
        if (!s.vagueAsked) { s.vagueAsked = true; return say('vague'); }
        s.closing = true;
        s.endedBy = 'resolved';
        return say('grudging');
      }
      // Fixed with a timeline: one late complication, if there is time for it.
      if (s.curve === 'none' && s.elapsedMs < CALL_LIMIT_MS - 40000) {
        s.curve = 'asked';
        return say('curveball');
      }
      s.closing = true;
      s.endedBy = 'resolved';
      return s.mood < 45 ? say('satisfied') : s.mood < 75 ? say('grudging') : say('unhappy');
    }

    /**
     * The agent's turn. info: { elapsedMs } wall-clock time since the call started, if known
     * (otherwise estimated from the words spoken on both sides).
     * Returns { line, done, mood, delta }.
     */
    function reply(text, info) {
      if (s.done) return { line: '', done: true, mood: s.mood, delta: 0 };
      s.turns++;
      const t = readTurn(text, scenario);
      const first = {};
      for (const k of Object.keys(s.got)) {
        first[k] = !!t[k] && !s.got[k];
        if (t[k]) s.got[k] = true;
      }
      if (info && info.elapsedMs != null) s.elapsedMs = info.elapsedMs;
      else s.elapsedMs += (t.words / 2.3) * 1000 + 1500 + (s.lines.length ? s.lines[s.lines.length - 1].split(/\s+/).length * 400 : 0);
      const delta = setMood(t, first);
      const line = nextLine(t);
      if (line) s.lines.push(line);
      s.history.push(s.mood);
      return { line, done: s.done, mood: s.mood, delta };
    }

    function snapshot() {
      return { customerName: customer.name, persona: persona.label, personaId: persona.id, scenario: scenario.title, company: scenario.company, mood: s.mood, moodStart: persona.startMood, turns: s.turns, done: s.done };
    }

    function summary() {
      return {
        scenarioId: scenario.id,
        scenario: scenario.title,
        company: scenario.company,
        personaId: persona.id,
        persona: persona.label,
        customerName: customer.name,
        moodStart: persona.startMood,
        moodEnd: s.mood,
        moodHistory: s.history.slice(),
        endedBy: s.endedBy || (s.done ? 'time' : 'open'),
        resolved: s.got.fix && s.got.timeline,
        curveball: s.curve === 'none' ? null : { line: curveball, handled: s.curve === 'handled' },
        rude: s.rude,
        turns: s.turns,
        got: Object.assign({}, s.got),
        goodPractice: scenario.goodPractice,
      };
    }

    return { scenario, persona, customer, opening, reply, summary, snapshot, get done() { return s.done; } };
  }

  const api = { createCall, readTurn, fill, CALL_LIMIT_MS, MAX_TURNS };
  if (isNode) module.exports = api;
  else (root.AII = root.AII || {}).CallSim = api;
})(typeof window !== 'undefined' ? window : globalThis);
