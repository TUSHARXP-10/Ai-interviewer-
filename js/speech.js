/*
 * speech.js — free, built-in browser speech.
 *
 *   TTS: window.speechSynthesis (the interviewer's and customer's voices)
 *   STT: SpeechRecognition / webkitSpeechRecognition (Chrome, Edge, Safari)
 *
 * No API keys. Chrome and Edge transcribe through their vendor's cloud speech
 * service, so this engine needs an internet connection; js/whisper.js is the
 * offline alternative.
 */
(function (root) {
  'use strict';

  const synth = root.speechSynthesis || null;
  const Recognition = root.SpeechRecognition || root.webkitSpeechRecognition || null;
  const Voice = root.AII && root.AII.Voice;
  const doc = root.document || null;
  const isAndroid = /Android/i.test((root.navigator && root.navigator.userAgent) || '');

  // Name fragments used to guess a voice's style (the API has no gender field).
  const FEMALE = /female|zira|aria|jenny|sonia|neerja|libby|natasha|clara|samantha|karen|moira|tessa|veena|serena|victoria|fiona|susan|hazel|heera|emma|ava|allison|joanna|salli|kimberly|google uk english female|google us english/i;
  const MALE = /male|david|mark|ravi|guy|ryan|prabhat|william|liam|daniel|alex|fred|rishi|oliver|george|james|thomas|brian|matthew|christopher|eric|google uk english male/i;

  let voicesCache = [];

  /** Voices load asynchronously (and Safari < 16 has no voiceschanged event): poll briefly. */
  function loadVoices(timeoutMs) {
    if (!synth) return Promise.resolve([]);
    const now = synth.getVoices();
    if (now.length) {
      voicesCache = now;
      return Promise.resolve(now);
    }
    return new Promise((resolve) => {
      let done = false;
      const t0 = Date.now();
      const finish = () => {
        if (done) return;
        done = true;
        clearInterval(poll);
        voicesCache = synth.getVoices();
        resolve(voicesCache);
      };
      const poll = setInterval(() => {
        if (synth.getVoices().length || Date.now() - t0 > (timeoutMs || 2000)) finish();
      }, 100);
      try { synth.addEventListener('voiceschanged', finish, { once: true }); } catch (e) { /* ignore */ }
    });
  }

  function hasVoices() {
    return voicesCache.length > 0;
  }

  function englishVoices() {
    return voicesCache.filter((v) => /^en([-_]|$)/i.test(v.lang));
  }

  /** Choose interviewer + customer voices, preferring the selected accent and natural voices. */
  function pickVoices(prefs) {
    const p = prefs || {};
    const all = englishVoices();
    const byName = (n) => all.find((v) => v.name === n) || null;
    const accent = (p.accent || 'en-US').toLowerCase().replace('_', '-');
    const offline = root.navigator && root.navigator.onLine === false;
    const score = (v, wantFemale) => {
      let s = 0;
      const lang = v.lang.toLowerCase().replace('_', '-');
      if (lang === accent) s += 4;
      else if (lang.slice(0, 2) === 'en') s += 1;
      if (/natural|neural|online|premium|enhanced/i.test(v.name)) s += 3;
      if (/google/i.test(v.name)) s += 1;
      if (offline && v.localService === false) s -= 10; // network voices fail offline
      if (wantFemale && FEMALE.test(v.name) && !/\bmale\b/i.test(v.name.replace(/female/i, ''))) s += 2;
      if (!wantFemale && MALE.test(v.name) && !/female/i.test(v.name)) s += 2;
      return s;
    };
    const best = (wantFemale, exclude) =>
      all.filter((v) => v !== exclude).sort((a, b) => score(b, wantFemale) - score(a, wantFemale))[0] || null;
    // The interviewer (Tushar AI) prefers a male-sounding voice and the mock-call customer
    // a female-sounding one, so the two always sound different.
    const interviewer = byName(p.interviewerVoice) || best(false, null);
    const customer = byName(p.customerVoice) || best(true, interviewer) || interviewer;
    return { interviewer, customer };
  }

  function chunks(text, maxChars) {
    if (Voice && Voice.splitForSpeech) return Voice.splitForSpeech(text, maxChars);
    return (String(text).match(/[^.!?]+[.!?]*\s*/g) || [String(text)]).map((s) => s.trim()).filter(Boolean);
  }

  let speakToken = 0;
  // Keep utterances referenced until they finish: some engines lost "end" events
  // when the utterance object was garbage-collected.
  const live = new Set();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /**
   * Speak text and resolve when finished, cancelled or failed.
   * opts: { voice, rate, pitch, volume, muted, mutedDelayMs, onBoundary(charIndexInText), onStart, onEnd }
   * Resolves { ok, blocked?, failed? }: blocked means the browser silently refused to
   * speak (iOS before a user gesture), so the app can ask for a tap.
   */
  function speak(text, opts) {
    const o = opts || {};
    const token = ++speakToken;
    if (!synth || o.muted) {
      // Captions-only: wait the reading time, but stop at once on cancel() (End).
      if (o.onStart) o.onStart();
      const until = Date.now() + (o.mutedDelayMs || 400);
      return new Promise((resolve) => {
        const t = setInterval(() => {
          if (token === speakToken && Date.now() < until) return;
          clearInterval(t);
          if (o.onEnd) o.onEnd();
          resolve({ ok: true, muted: true, cancelled: token !== speakToken });
        }, 100);
      });
    }
    const rate = o.rate || 1;
    const pieces = chunks(text, Math.round(160 * rate));

    const sayOne = (piece, base) => new Promise((resolve) => {
      if (token !== speakToken) return resolve('cancelled');
      const u = new SpeechSynthesisUtterance(piece);
      live.add(u);
      if (o.voice) {
        u.voice = o.voice;
        u.lang = o.voice.lang;
      }
      u.rate = rate;
      u.pitch = o.pitch || 1;
      u.volume = o.volume == null ? 1 : o.volume;
      let started = false;
      let settled = false;
      const t0 = Date.now();
      const words = piece.split(/\s+/).length;
      const lastResort = ((words / 2) * 1000) / rate + 6000;
      const finish = (why) => {
        if (settled) return;
        settled = true;
        clearInterval(poll);
        live.delete(u);
        resolve(why);
      };
      // Poll instead of trusting "end" alone: some engines drop it.
      const poll = setInterval(() => {
        if (token !== speakToken) return finish('cancelled');
        const busy = synth.speaking || synth.pending;
        if (started && !busy) return finish('end');
        if (!started && !busy && Date.now() - t0 > 2500) return finish('blocked');
        // Stuck engine: speech that never started was not heard, so report it as failed.
        if (Date.now() - t0 > lastResort) return finish(started ? 'end' : 'failed');
      }, 250);
      u.onstart = () => {
        started = true;
        if (o.onStart && base === 0) o.onStart();
      };
      u.onboundary = (e) => {
        started = true;
        if (o.onBoundary && e.name !== 'sentence') o.onBoundary(base + (e.charIndex || 0));
      };
      u.onend = () => finish('end');
      u.onerror = (e) => {
        const err = (e && e.error) || '';
        if (err === 'not-allowed') return finish('blocked');
        if (err === 'interrupted' || err === 'canceled') return finish('cancelled');
        finish(started ? 'end' : 'failed');
      };
      try {
        synth.speak(u);
      } catch (e) {
        finish('failed');
      }
    });

    return (async () => {
      // Cancel leftovers only when something is queued; WebKit has raced on stale cancels.
      if (synth.speaking || synth.pending) {
        synth.cancel();
        await sleep(60);
      }
      let offset = 0;
      let result = { ok: true };
      for (let i = 0; i < pieces.length; i++) {
        const piece = pieces[i];
        const at = text.indexOf(piece, offset);
        const base = at === -1 ? offset : at;
        const why = await sayOne(piece, i === 0 ? 0 : base);
        offset = base + piece.length;
        if (why === 'blocked' || why === 'failed') {
          result = { ok: false, blocked: why === 'blocked', failed: why === 'failed' };
          break;
        }
        if (token !== speakToken || why === 'cancelled') break;
      }
      if (o.onEnd) o.onEnd();
      return result;
    })();
  }

  function cancel() {
    speakToken++;
    if (synth) synth.cancel();
  }

  /**
   * Call synchronously inside a click handler: some browsers (iOS Safari, Chrome
   * on Android) only allow speech that was first started by a user gesture.
   */
  function unlock() {
    if (!synth) return;
    try {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      synth.speak(u);
      if (synth.paused) synth.resume();
    } catch (e) { /* ignore */ }
  }

  if (synth && doc) {
    // Chrome pauses speech in background tabs and occasionally gets stuck "paused".
    doc.addEventListener('visibilitychange', () => {
      if (!doc.hidden && synth.paused) synth.resume();
    });
    root.addEventListener('pagehide', () => synth.cancel());
  }

  // ------------------------------------------------------------ recognition

  const FATAL = {
    'not-allowed': 'Microphone permission was denied.',
    'service-not-allowed': 'Speech recognition is turned off in this browser. On iPhone, enable Dictation (Settings → General → Keyboard) and allow Speech Recognition for Safari.',
    'audio-capture': 'No microphone was found.',
    'language-not-supported': 'This accent/language is not supported by the speech engine.',
  };

  function onceVisible() {
    if (!doc || !doc.hidden) return Promise.resolve();
    return new Promise((resolve) => {
      const h = () => {
        if (!doc.hidden) {
          doc.removeEventListener('visibilitychange', h);
          resolve();
        }
      };
      doc.addEventListener('visibilitychange', h);
    });
  }

  /**
   * A recogniser that keeps listening until stop(): it silently restarts when the
   * browser ends a session early (Chrome does after ~8-15 s of silence) and merges
   * results across restarts.
   * opts: { lang, track (MediaStreamTrack to listen to, Chrome 135+), onUpdate(finalText, interimText),
   *         onError(code, message, fatal) }
   */
  function createRecognizer(opts) {
    const o = opts || {};
    if (!Recognition) return null;
    let active = false;
    let current = null;          // the live session
    const sessions = new Set();  // sessions that have not ended yet
    let committed = '';
    let firstResultAt = null;
    let lastResultAt = null;
    let networkErrors = [];
    let restarts = [];
    let transientFailures = 0;
    let endWaiters = [];

    // Engines that resend the growing utterance as each new final (Android, some Safari).
    let cumulative = isAndroid;
    // One growing pair is not proof: a desktop false start ("I have… I have two years")
    // looks the same. Engines that really resend do it on almost every phrase.
    let growths = 0;
    const merge = (list) => (Voice && Voice.mergeCumulative ? Voice.mergeCumulative(list, { cumulative }) : list.filter(Boolean).join(' '));
    const join = (a, b) => (a + ' ' + b).replace(/\s+/g, ' ').trim();
    const sessionText = (s) => (s ? merge(s.finals) : '');
    const finalText = () => join(committed, sessionText(current));
    const interimText = () => (current ? current.interim.trim() : '');
    const emit = () => o.onUpdate && o.onUpdate(finalText(), interimText());

    function startSession() {
      const r = new Recognition();
      const s = { r, finals: [], interim: '', started: false, grown: new Set() };
      r.lang = o.lang || 'en-US';
      r.continuous = true;
      r.interimResults = true;
      r.maxAlternatives = 1;
      r.onstart = () => {
        s.started = true;
        transientFailures = 0;
      };
      r.onresult = (e) => {
        const now = performance.now();
        if (firstResultAt == null) firstResultAt = now;
        lastResultAt = now;
        networkErrors = [];
        s.interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i];
          const t = res[0] ? res[0].transcript.trim() : '';
          if (res.isFinal) {
            const prev = s.finals[i - 1];
            if (!cumulative && prev && !s.grown.has(i) && Voice && Voice.looksCumulative && Voice.looksCumulative(prev, t)) {
              s.grown.add(i);
              if (++growths >= 2) cumulative = true;
            }
            s.finals[i] = t;
          } else s.interim += ' ' + t;
        }
        if (s === current) emit();
      };
      r.onerror = (e) => {
        const code = e.error || 'unknown';
        if (code === 'no-speech' || code === 'aborted') return;
        if (code === 'network') {
          // Offline sessions fail within milliseconds, so retry with backoff and give up
          // only after the connection has been gone for a while (a Wi-Fi blip keeps the answer).
          const now = Date.now();
          const last = networkErrors[networkErrors.length - 1];
          if (last && now - last > 20000) networkErrors = [];
          networkErrors.push(now);
          if (networkErrors.length >= 3 && now - networkErrors[0] >= 8000) {
            fail(code, 'Speech recognition needs an internet connection in this browser.');
          } else {
            s.transient = Math.min(3000, 400 * Math.pow(2, networkErrors.length - 1));
          }
          return;
        }
        // "not-allowed" is also reported for a hidden page (Safari) or a busy recogniser
        // (Android). Retry those a few times before treating it as a real denial.
        if (code === 'not-allowed' && (doc && doc.hidden || s.started || o.micGranted) && transientFailures < 3) {
          transientFailures++;
          s.transient = [300, 700, 1500][transientFailures - 1];
          return;
        }
        if (FATAL[code]) fail(code, FATAL[code]);
        else if (o.onError) o.onError(code, 'Speech recognition error: ' + code, false);
      };
      r.onend = () => {
        // Bank this session's words (including unfinished ones), then restart if still listening.
        sessions.delete(s);
        committed = join(committed, join(sessionText(s), s.interim.trim()));
        const wasCurrent = s === current;
        if (wasCurrent) current = null;
        if (active && wasCurrent) scheduleRestart(s.transient);
        else if (!active && !sessions.size) flushEnd();
        emit();
      };
      sessions.add(s);
      current = s;
      try {
        const track = o.track;
        if (track && track.readyState === 'live') {
          try {
            r.start(track); // Chrome 135+: listen to the same (echo-cancelled) mic track
          } catch (e) {
            r.start();
          }
        } else r.start();
      } catch (err) {
        sessions.delete(s);
        current = null;
        fail('start-failed', String((err && err.message) || err));
      }
    }

    function scheduleRestart(extraDelay) {
      const now = Date.now();
      restarts = restarts.filter((t) => now - t < 10000);
      restarts.push(now);
      if (restarts.length > 8 && !extraDelay) return fail('unstable', 'Speech recognition keeps stopping.');
      const delay = (extraDelay || 0) + (isAndroid ? 350 : 120);
      setTimeout(() => {
        if (!active || current) return;
        // Never restart while the page is hidden: browsers refuse, and the retries pile up.
        onceVisible().then(() => {
          if (active && !current) startSession();
        });
      }, delay);
    }

    function flushEnd() {
      const waiters = endWaiters;
      endWaiters = [];
      waiters.forEach((w) => w(finalText()));
    }

    function fail(code, message) {
      active = false;
      sessions.forEach((s) => {
        try { s.r.abort(); } catch (e) { /* ignore */ }
      });
      if (o.onError) o.onError(code, message, true);
      flushEnd();
    }

    function stopSessions(method) {
      sessions.forEach((s) => {
        try { s.r[method](); } catch (e) { /* ignore */ }
      });
    }

    return {
      start() {
        committed = '';
        firstResultAt = null;
        lastResultAt = null;
        networkErrors = [];
        restarts = [];
        transientFailures = 0;
        active = true;
        startSession();
      },
      /** Stop listening without losing words (e.g. while the interviewer speaks mid-answer). */
      pause() {
        active = false;
        stopSessions('stop');
      },
      resume() {
        active = true;
        if (!current) startSession();
      },
      /** Stop and resolve with the final transcript once the engine flushes. */
      stop() {
        active = false;
        return new Promise((resolve) => {
          if (!sessions.size) return resolve(finalText());
          // The engine never flushed: keep the words still on screen as well.
          const t = setTimeout(() => resolve(join(finalText(), interimText())), 1500);
          endWaiters.push((text) => {
            clearTimeout(t);
            resolve(text);
          });
          stopSessions('stop');
        });
      },
      abort() {
        active = false;
        stopSessions('abort');
      },
      text: finalText,
      interim: interimText,
      live: true, // gives words while the candidate is speaking
      get firstResultAt() { return firstResultAt; },
      get lastResultAt() { return lastResultAt; },
      get active() { return active; },
    };
  }

  (root.AII = root.AII || {}).Speech = {
    ttsSupported: !!synth,
    sttSupported: !!Recognition,
    loadVoices,
    hasVoices,
    englishVoices,
    pickVoices,
    speak,
    cancel,
    unlock,
    chunks,
    createRecognizer,
    onceVisible,
  };
})(typeof window !== 'undefined' ? window : globalThis);
