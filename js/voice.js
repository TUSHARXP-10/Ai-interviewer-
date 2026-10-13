/*
 * voice.js — the rules of a hands-free spoken conversation (pure logic, no browser APIs).
 *
 *  - parseCommand():   spoken commands inside an answer ("can you repeat that?",
 *                      "skip this one", "...and that's all") so nobody has to touch the screen
 *  - endOfTurn():      adaptive end-of-answer detection from silence, so the interviewer
 *                      replies when the candidate has finished, but not during a thinking pause
 *  - idleAction():     what to do when the candidate has not started speaking yet
 *  - mergeCumulative(): clean up engines that resend the same words as new results (Android)
 *  - stripEcho():      drop the interviewer's own last words if the mic picked them up
 *
 * Works in the browser (window.AII.Voice) and in Node (module.exports) for tests.
 */
(function (root) {
  'use strict';
  const isNode = typeof module === 'object' && module.exports;

  function normWords(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/[‘’`]/g, "'")
      .replace(/[^a-z0-9' ]+/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
  }

  function norm(text) {
    return normWords(text).join(' ');
  }

  function wordCount(text) {
    return (String(text || '').match(/[A-Za-z0-9']+/g) || []).length;
  }

  // Polite lead-ins people say before a request.
  const LEAD = "(?:(?:sorry|excuse me|um+|uh+|hmm+|er+|okay|ok|so|actually|i think|ma'?am|sir|madam|yes|yeah|no)\\s+)*";

  const REPEAT = new RegExp('^' + LEAD +
    '(?:(?:can|could|would|will) you (?:please |kindly )?|please |kindly )?' +
    '(?:repeat(?: (?:that|it|the question|the last question|the details|again|once again|one more time|please|for me))*' +
    '|say (?:that|it) (?:again|once more|one more time)|say again|again please|come again|pardon(?: me)?|once again|one more time' +
    "|i (?:did ?n[o']?t|didnt|did not|could ?n[o']?t|couldnt|could not) (?:get|catch|hear|understand)(?: (?:that|it|you|the question))?(?: (?:properly|clearly|correctly))?" +
    '|what (?:was|is) the question|what did you say)(?: please| again)*$');

  const SKIP = new RegExp('^' + LEAD +
    "(?:(?:can|could|may) (?:we|i) |i(?:'d| would) like to |let'?s |please )?" +
    '(?:skip(?: (?:this|that|it|this one|this question|the question))?|pass|next|next one|next question|move on(?: to the next (?:one|question))?|go to the next (?:one|question))(?: please)?$');

  const UNSURE = /^(?:(?:sorry|um+|uh+|honestly)\s+)*(?:i (?:don'?t|do not) know|no idea|i'?m not sure|i am not sure|i have no idea)(?: (?:sir|ma'?am|madam|sorry))*$/;

  // Strong closers end the answer after a short settle; weak ones only shorten the wait.
  const DONE_STRONG = /(?:^|\s)(?:and\s+)?(?:that'?s all|that is all|that'?s my answer|that is my answer|i'?m done|i am done|i'?m finished|i am finished|end of (?:my )?answer|that'?s all from my side|that is all from my side)(?:\s+(?:sir|ma'?am|madam|thank you|thanks))*$/;
  const DONE_WEAK = /(?:^|\s)(?:(?:and|so)\s+)?(?:that'?s it|that is it|over to you|thank you|thanks)(?:\s+(?:sir|ma'?am|madam|thank you|thanks))*$/;

  /**
   * Inspect what the candidate has said.
   *   full     the whole answer so far
   *   current  the latest utterance (words since the last clear pause); defaults to full
   * Returns { command: 'repeat' | 'skip' | 'unsure' | 'done' | null, strength?, text }.
   * For 'done' with a strong closer, text has the closing phrase removed so
   * "that's all" is not scored as part of the answer.
   */
  function parseCommand(full, current) {
    const raw = String(full || '').trim();
    const n = norm(raw);
    if (!n) return { command: null, text: raw };
    const c = current == null ? n : norm(current);
    const total = n.split(' ').length;
    // A request on its own, or right after a short false start ("I think... sorry, can you repeat that?").
    if ((total <= 10 && REPEAT.test(n)) || (total <= 18 && c && REPEAT.test(c))) return { command: 'repeat', text: '' };
    // "skip" said on its own after a pause also counts ("I don't know… skip").
    if ((total <= 8 && SKIP.test(n)) || (total <= 12 && c && c !== n && SKIP.test(c))) return { command: 'skip', text: '' };
    if (total <= 8 && UNSURE.test(n)) return { command: 'unsure', text: raw };
    const strong = n.match(DONE_STRONG);
    if (strong) {
      const drop = strong[0].trim().split(' ').length;
      const tokens = raw.split(/\s+/);
      const kept = tokens.slice(0, Math.max(0, tokens.length - drop)).join(' ').replace(/[\s,;:–-]+$/, '');
      return { command: 'done', strength: 'strong', text: kept ? (/[.!?]$/.test(kept) ? kept : kept + '.') : '' };
    }
    if (DONE_WEAK.test(n)) return { command: 'done', strength: 'weak', text: raw };
    return { command: null, text: raw };
  }

  // An answer that stops on one of these words is usually mid-thought.
  const TRAILING = /(?:^|\s)(?:and|so|but|because|or|um+|uh+|like|then|also|the|a|to|of|with|my|i)$/;
  function trailingFiller(text) {
    return TRAILING.test(norm(text));
  }

  /**
   * Adaptive end-of-turn detection. Silence must hold on every available signal.
   * input: {
   *   words,          words recognised so far (null if the engine gives no live text)
   *   spokeMs,        how long the mic has heard voice in this answer (null without a meter)
   *   sinceVoiceMs,   ms since the mic last heard voice (null/Infinity without a meter)
   *   sinceResultMs,  ms since the recogniser last produced text (null if none)
   *   patienceMs,     base silence the candidate chose (e.g. 3000)
   *   idealWords,     the question's ideal minimum length (e.g. 60)
   *   roleplay,       true during the mock call (snappier turn-taking)
   *   cue,            'strong' | 'weak' | 'punct' | null — a closing phrase or final punctuation
   *   trailingFiller  true when the words so far end on "and", "so", "um"…
   *   startMs         voice needed before the answer counts as started (default 1200; lower
   *                   for engines with no live words, so short replies like "No, thank you" count)
   *   started         overrides the "has the answer started" test (e.g. a settled one-word "No.")
   * }
   * returns { end, waitMs, quietMs }
   */
  function endOfTurn(input) {
    const i = input || {};
    const base = i.patienceMs || 3000;
    const words = i.words;
    const started = i.started != null
      ? !!i.started
      : (words != null && words >= 2) || (i.spokeMs != null && i.spokeMs >= (i.startMs || 1200));
    const quiet = [i.sinceVoiceMs, i.sinceResultMs].filter((x) => x != null && Number.isFinite(x));
    const quietMs = quiet.length ? Math.min.apply(null, quiet) : 0;
    if (!started) return { end: false, waitMs: Infinity, quietMs };

    let wait = base;
    const soFar = words != null ? words : Math.round(((i.spokeMs || 0) / 1000) * 2.2);
    if (i.cue === 'strong') wait = Math.min(wait, 1200);
    else if (soFar < 8) wait += 2000;                             // a short start is usually a thinking pause,
                                                                  // even after "Thank you, ma'am…"
    else if (i.cue === 'weak' || i.cue === 'punct') wait = Math.min(wait, Math.max(1500, base - 1000));
    else if (i.idealWords && soFar >= i.idealWords) wait -= 600;  // a full answer: reply a little sooner
    if (i.roleplay) wait -= 500;                                  // calls move faster
    if (i.trailingFiller && i.cue !== 'strong') wait += 1500;     // "...and" means more is coming
    wait = Math.max(1100, Math.min(8000, wait));
    return { end: quietMs >= wait, waitMs: wait, quietMs };
  }

  const NUDGES = [
    "Take your time. Whenever you're ready, go ahead.",
    "No rush. Start whenever you're ready.",
    'Take a moment to think, then go ahead.',
  ];

  /**
   * What to do while the candidate has not started answering.
   * input: { elapsedMs, maxMs, nudgesGiven, roleplay, variant, noRepeatOffer }
   * returns { action: 'none' | 'nudge' | 'offer-repeat' | 'give-up', say?: string }
   */
  function idleAction(input) {
    const i = input || {};
    const given = i.nudgesGiven || 0;
    const max = i.maxMs || 120000;
    const firstAt = i.roleplay ? Math.min(7000, max * 0.2) : Math.min(11000, max * 0.25);
    const secondAt = Math.min(25000, max * 0.5);
    const giveUpAt = Math.min(42000, max * 0.8);
    if (i.elapsedMs >= giveUpAt && given >= 2) {
      return { action: 'give-up', say: "That's okay, let's move on to the next question." };
    }
    if (i.elapsedMs >= secondAt && given === 1) {
      // Spoken-only tests (listening) cost points when repeated, so don't invite it.
      if (i.noRepeatOffer) return { action: 'nudge', say: "Whenever you're ready, tell me what you remember." };
      return { action: 'offer-repeat', say: "If you'd like me to repeat the question, just say repeat. Otherwise, go ahead whenever you're ready." };
    }
    if (i.elapsedMs >= firstAt && given === 0) {
      const say = i.roleplay ? 'Hello? Are you still there?' : NUDGES[(i.variant || 0) % NUDGES.length];
      return { action: 'nudge', say };
    }
    return { action: 'none' };
  }

  /** How many leading words two results share. */
  function sharedLead(a, b) {
    let k = 0;
    while (k < a.length && k < b.length && a[k] === b[k]) k++;
    return k;
  }

  /**
   * True when a later final result simply grows the previous one ("I am" → "I am Ravi"),
   * the signature of engines that resend the whole utterance as each new final.
   */
  function looksCumulative(prev, next) {
    const a = normWords(prev);
    const b = normWords(next);
    return a.length >= 2 && b.length > a.length && sharedLead(a, b) === a.length;
  }

  /**
   * Join a session's final results. Some engines (Chrome on Android, some Safari
   * versions) resend the growing text of one utterance as new "final" results, so
   * with opts.cumulative a later result replaces the previous one when it starts with
   * (almost) the same words. Desktop engines send each phrase once, and phrases often
   * start alike ("I can speak English." / "I can speak Hindi."), so without that
   * flag only exact growth or an exact stale copy is merged.
   */
  function mergeCumulative(finals, opts) {
    const cumulative = !!(opts && opts.cumulative);
    const out = [];
    for (const f of finals) {
      if (!f || !String(f).trim()) continue;
      const prev = out[out.length - 1];
      if (prev) {
        const a = normWords(prev);
        const b = normWords(f);
        const k = sharedLead(a, b);
        // b continues a (its last 1-2 words may have been revised), or b is a stale shorter copy.
        const grows = cumulative
          ? a.length - k <= 2 && k >= Math.max(1, Math.ceil(a.length * 0.5)) && b.length >= a.length - 1
          : k === a.length && b.length > a.length;
        if (grows) {
          out[out.length - 1] = f;
          continue;
        }
        if (k === b.length && b.length <= a.length && (cumulative || b.length >= 2)) continue;
      }
      out.push(f);
    }
    return out.join(' ').replace(/\s+/g, ' ').trim();
  }

  // An echo is already playing when listening starts; a candidate who restates the
  // question ("In five years, I see myself…") starts speaking after a pause.
  const ECHO_ONSET_MS = 700;

  /**
   * Drop words at the start of a transcript that are just the interviewer's own
   * last words picked up by the microphone (speakers instead of headphones).
   * opts.onsetMs: when the candidate's voice started (ms after listening began);
   * a later start means the words are the candidate's own, so nothing is dropped.
   */
  function stripEcho(heard, prompt, opts) {
    if (opts && opts.onsetMs != null && opts.onsetMs > ECHO_ONSET_MS) return heard;
    const h = normWords(heard);
    const p = normWords(prompt).slice(-12);
    if (!h.length || !p.length) return heard;
    let best = 0;
    for (let n = Math.min(h.length, p.length); n >= 2; n--) {
      const tail = p.slice(-n);
      let hits = 0;
      for (let j = 0; j < n; j++) if (tail[j] === h[j]) hits++;
      if (hits / n >= 0.75) {
        best = n;
        break;
      }
    }
    if (!best) return heard;
    const rest = String(heard).trim().split(/\s+/).slice(best).join(' ');
    // Listening only starts after the interviewer has finished, so an answer that is nothing but
    // her last words is far more likely a real answer (repeating a phrase) than an echo.
    return rest ? rest : heard;
  }

  /**
   * Split text into pieces for speech synthesis. Chrome cuts off utterances longer
   * than about 15 s, so long sentences are split at commas or semicolons as well.
   */
  function splitForSpeech(text, maxChars) {
    const limit = maxChars || 160;
    const sentences = String(text || '').match(/[^.!?]+[.!?]*["')\]]*\s*/g) || [String(text || '')];
    const pieces = [];
    for (const sentence of sentences) {
      if (sentence.length <= limit) {
        pieces.push(sentence);
        continue;
      }
      let cur = '';
      for (const part of sentence.split(/(?<=[,;:—–])\s+/)) {
        if (cur && cur.length + part.length + 1 > limit) {
          pieces.push(cur);
          cur = part;
        } else cur = cur ? cur + ' ' + part : part;
      }
      if (cur) pieces.push(cur);
    }
    const out = [];
    for (const p of pieces) {
      const t = p.trim();
      if (!t) continue;
      if (out.length && out[out.length - 1].length + t.length < 140) out[out.length - 1] += ' ' + t;
      else out.push(t);
    }
    return out;
  }

  // ------------------------------------------------------------ names
  /**
   * A rough sound-alike key for a name: the consonant skeleton, with spellings that
   * speech engines mix up folded together ("Tushar" / "tishar" -> "tsr").
   */
  function nameKey(word) {
    let s = String(word || '').toLowerCase().replace(/[^a-z]/g, '');
    if (!s) return '';
    s = s.replace(/ph/g, 'f').replace(/sh/g, 's').replace(/([tdbkgc])h/g, '$1').replace(/ck/g, 'k')
      .replace(/q/g, 'k').replace(/w/g, 'v').replace(/z/g, 'j').replace(/x/g, 'ks').replace(/y/g, 'i')
      .replace(/(.)h/g, '$1');                                          // soft h: "Rahul" = "raul", "Shah" = "sha"
    return (s[0] + s.slice(1).replace(/[aeiou]/g, '')).replace(/(.)\1+/g, '$1');
  }

  function editDistance(a, b) {
    const m = a.length;
    const n = b.length;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[n];
  }

  /**
   * How closely a heard word sounds like one part of a name: 0 (not at all) to 1 (same).
   * Short names must sound identical; longer ones may differ by one sound.
   */
  function soundsLike(heard, name) {
    const h = String(heard || '').toLowerCase().replace(/[^a-z]/g, '');
    const n = String(name || '').toLowerCase().replace(/[^a-z]/g, '');
    if (h.length < 2 || n.length < 2) return 0;
    if (h === n) return 1;
    const a = nameKey(h);
    const b = nameKey(n);
    if (!a || !b || a[0] !== b[0]) return 0;
    const d = editDistance(a, b);
    if (d > (b.length >= 4 ? 1 : 0)) return 0;
    const sim = 1 - editDistance(h, n) / Math.max(h.length, n.length);
    return sim >= 0.5 ? sim - d * 0.1 : 0;
  }

  // Words that often follow "I am" / "this is" and are never a misheard name.
  const NOT_A_NAME = new Set(('a an the sure happy good fine ready very really from working looking interested currently ' +
    'comfortable glad not also here doing studying pursuing fresher graduate eager passionate confident able okay ok so ' +
    'basically actually just going calling speaking new one someone person candidate hard quick learner student engineer ' +
    'done well great nervous excited thankful grateful applying in at with and fresh experienced married single twenty ' +
    'twenty-one twenty-two twenty-three twenty-four twenty-five interviewing available free busy back sorry thank thanks').split(' '));
  const NAME_CUES = [['my', 'name', 'is'], ['my', 'name', "'s"], ['name', 'is'], ['i', 'am'], ["i'm"], ['im'], ['myself'],
    ['this', 'is'], ['call', 'me'], ['it', 'is'], ["it's"], ['me'], ['am']];

  /**
   * Put the candidate's own name back where the speech engine misheard it
   * ("I am tishar chadne" -> "I am Tushar Chandane"). Only where a name belongs: right
   * after "my name is", "I am", "myself", "this is"…, or when the whole name (first and
   * last) appears together. names: the typed names, e.g. ["Tushar Chandane"];
   * opts.common: everyday words never to be read as a name after "I am".
   */
  function correctNames(text, names, opts) {
    const common = (opts && opts.common) || new Set();
    const src = String(text || '');
    const people = (names || []).map((n) => String(n || '').trim().split(/\s+/).filter((w) => /[a-z]{2,}/i.test(w)).map((w) => w.replace(/[^A-Za-z'-]/g, ''))).filter((p) => p.length);
    if (!src.trim() || !people.length) return src;
    const parts = src.split(/(\s+)/);
    const words = [];
    for (let i = 0; i < parts.length; i += 2) {
      if (!parts[i]) continue;
      const m = parts[i].match(/^([^A-Za-z0-9']*)([\s\S]*?)([^A-Za-z0-9']*)$/);
      words.push({ i, pre: m[1], core: m[2], post: m[3] });
    }
    const low = words.map((w) => w.core.toLowerCase());
    const cueBefore = (k) => NAME_CUES.some((cue) => cue.length <= k && cue.every((c, j) => low[k - cue.length + j] === c));
    // Match one name part at word k, as one heard word or two run together ("chand nay"),
    // whichever sounds closer. Returns how many words it covers (0: no match).
    const matchAt = (k, part, cued) => {
      if (k >= words.length || NOT_A_NAME.has(low[k])) return 0;
      if (cued && common.has(low[k]) && low[k] !== part.toLowerCase()) return 0;
      const one = soundsLike(words[k].core, part);
      const two = k + 1 < words.length && !words[k].post && !NOT_A_NAME.has(low[k + 1]) && !common.has(low[k + 1])
        ? soundsLike(words[k].core + words[k + 1].core, part) : 0;
      if (two > one) return 2;
      return one ? 1 : 0;
    };
    const edits = [];
    // Surname-first introductions too ("myself Chandane Tushar").
    const orders = [];
    people.forEach((p) => { orders.push(p); if (p.length >= 2) orders.push(p.slice().reverse()); });
    const free = (at, used) => !edits.some((e) => at < e.at + e.used && e.at < at + used);
    // Pass 1: the whole name, anywhere. Pass 2: any part of it right after "I am", "myself"…
    for (const pass of [1, 2]) {
      for (const person of orders) {
        for (let k = 0; k < words.length; k++) {
          if (!free(k, 1)) continue;
          const cued = cueBefore(k);
          if (pass === 2 && !cued) continue;
          const spans = [];
          let pos = k;
          for (const part of person) {
            const used = matchAt(pos, part, cued && pos === k);
            if (!used || !free(pos, used)) break;
            spans.push({ at: pos, used, part });
            pos += used;
          }
          let take = null;
          if (pass === 1) {
            if (person.length >= 2 && spans.length === person.length) take = spans;
          } else if (spans.length && (spans.length > 1 || spans[0].part.length > 3)) {
            take = spans;                                    // "I am tishar…" (a short name alone must be exact: "I am sad" is not "Sid")
          } else if (!spans.length) {
            for (const part of person.slice(1).filter((x) => x.length > 3)) {   // "myself chadne"
              const used = matchAt(k, part, true);
              if (used && free(k, used)) { take = [{ at: k, used, part }]; break; }
            }
          }
          if (!take) continue;
          edits.push(...take);
          k = take[take.length - 1].at + take[take.length - 1].used - 1;
        }
      }
    }
    if (!edits.length) return src;
    for (const e of edits) {
      const first = words[e.at];
      const last = words[e.at + e.used - 1];
      const fixed = e.part.charAt(0).toUpperCase() + e.part.slice(1);
      parts[first.i] = first.pre + fixed + last.post;
      for (let j = first.i + 1; j <= last.i; j++) parts[j] = '';
    }
    return parts.join('').replace(/ {2,}/g, ' ');
  }

  const api = { parseCommand, endOfTurn, idleAction, mergeCumulative, looksCumulative, stripEcho, trailingFiller, splitForSpeech, wordCount, norm, normWords, correctNames, nameKey, soundsLike };
  if (isNode) module.exports = api;
  else (root.AII = root.AII || {}).Voice = api;
})(typeof window !== 'undefined' ? window : globalThis);
