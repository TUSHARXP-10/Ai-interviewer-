/*
 * speech.js — free, built-in browser speech.
 *
 *   TTS: window.speechSynthesis (the interviewer's and customer's voices)
 *   STT: SpeechRecognition / webkitSpeechRecognition (Chrome, Edge, Safari)
 *
 * No API keys. Note: Chrome and Edge transcribe through their vendor's cloud
 * speech service, so voice mode needs an internet connection; typing mode
 * works fully offline.
 */
(function (root) {
  'use strict';

  const synth = root.speechSynthesis || null;
  const Recognition = root.SpeechRecognition || root.webkitSpeechRecognition || null;

  // Name fragments used to guess a voice's style (the API has no gender field).
  const FEMALE = /female|zira|aria|jenny|sonia|neerja|libby|natasha|clara|samantha|karen|moira|tessa|veena|serena|victoria|fiona|susan|hazel|heera|emma|ava|allison|joanna|salli|kimberly|google uk english female|google us english/i;
  const MALE = /male|david|guy|ryan|prabhat|william|liam|daniel|alex|fred|rishi|oliver|george|james|thomas|brian|matthew|christopher|eric|google uk english male/i;

  let voicesCache = [];

  function loadVoices(timeoutMs) {
    if (!synth) return Promise.resolve([]);
    const now = synth.getVoices();
    if (now.length) {
      voicesCache = now;
      return Promise.resolve(now);
    }
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        voicesCache = synth.getVoices();
        resolve(voicesCache);
      };
      synth.addEventListener('voiceschanged', finish, { once: true });
      setTimeout(finish, timeoutMs || 1500);
    });
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
    const score = (v, wantFemale) => {
      let s = 0;
      const lang = v.lang.toLowerCase().replace('_', '-');
      if (lang === accent) s += 4;
      else if (lang.slice(0, 2) === 'en') s += 1;
      if (/natural|neural|online|premium|enhanced/i.test(v.name)) s += 3;
      if (/google/i.test(v.name)) s += 1;
      if (wantFemale && FEMALE.test(v.name) && !/\bmale\b/i.test(v.name.replace(/female/i, ''))) s += 2;
      if (!wantFemale && MALE.test(v.name) && !/female/i.test(v.name)) s += 2;
      return s;
    };
    const best = (wantFemale, exclude) =>
      all.filter((v) => v !== exclude).sort((a, b) => score(b, wantFemale) - score(a, wantFemale))[0] || null;
    const interviewer = byName(p.interviewerVoice) || best(true, null);
    const customer = byName(p.customerVoice) || best(false, interviewer) || interviewer;
    return { interviewer, customer };
  }

  // Split long text into sentences: Chrome cuts off utterances longer than ~15s.
  function chunks(text) {
    const parts = String(text).match(/[^.!?]+[.!?]*["')\]]*\s*/g) || [String(text)];
    const out = [];
    for (const p of parts) {
      if (out.length && (out[out.length - 1].length + p.length) < 140) out[out.length - 1] += p;
      else out.push(p);
    }
    return out.map((s) => s.trim()).filter(Boolean);
  }

  let speakToken = 0;

  /**
   * Speak text and resolve when finished (or cancelled / failed / timed out).
   * opts: { voice, rate, pitch, volume, onBoundary(charIndexInText), onStart, onEnd }
   */
  function speak(text, opts) {
    const o = opts || {};
    const token = ++speakToken;
    if (!synth || o.muted) {
      if (o.onStart) o.onStart();
      return new Promise((r) => setTimeout(() => { if (o.onEnd) o.onEnd(); r(); }, o.mutedDelayMs || 400));
    }
    synth.cancel();
    const pieces = chunks(text);
    let offset = 0;
    let started = false;
    const sayOne = (piece, base) => new Promise((resolve) => {
      if (token !== speakToken) return resolve();
      const u = new SpeechSynthesisUtterance(piece);
      if (o.voice) {
        u.voice = o.voice;
        u.lang = o.voice.lang;
      }
      u.rate = o.rate || 1;
      u.pitch = o.pitch || 1;
      u.volume = o.volume == null ? 1 : o.volume;
      // Safety net: some engines never fire "end".
      const words = piece.split(/\s+/).length;
      const guard = setTimeout(resolve, ((words / 2.3) * 1000) / u.rate + 4000);
      const finish = () => {
        clearTimeout(guard);
        resolve();
      };
      u.onstart = () => {
        if (!started && o.onStart) o.onStart();
        started = true;
      };
      u.onboundary = (e) => {
        if (o.onBoundary && e.name !== 'sentence') o.onBoundary(base + (e.charIndex || 0));
      };
      u.onend = finish;
      u.onerror = finish;
      synth.speak(u);
    });
    return (async () => {
      for (const piece of pieces) {
        const at = text.indexOf(piece, offset);
        const base = at === -1 ? offset : at;
        await sayOne(piece, base);
        offset = base + piece.length;
        if (token !== speakToken) break;
      }
      if (o.onEnd) o.onEnd();
    })();
  }

  function cancel() {
    speakToken++;
    if (synth) synth.cancel();
  }

  // ------------------------------------------------------------ recognition

  const FATAL = { 'not-allowed': 'Microphone permission was denied.', 'service-not-allowed': 'Speech recognition is blocked in this browser.', 'audio-capture': 'No microphone was found.', 'language-not-supported': 'This accent/language is not supported by the speech engine.' };

  /**
   * A recogniser that keeps listening until stop() — it silently restarts when
   * the browser ends a session early, and merges results across restarts.
   * opts: { lang, onUpdate(finalText, interimText), onError(code, message, fatal) }
   */
  function createRecognizer(opts) {
    const o = opts || {};
    if (!Recognition) return null;
    let rec = null;
    let active = false;
    let committed = '';
    let finals = [];
    let interim = '';
    let firstResultAt = null;
    let lastResultAt = null;
    let networkErrors = 0;
    let restarts = [];
    let endWaiters = [];

    const sessionText = () => {
      // De-duplicate engines (Android) that repeat earlier finals inside later ones.
      const out = [];
      for (const f of finals) {
        if (!f) continue;
        const prev = out[out.length - 1];
        if (prev && f.toLowerCase().startsWith(prev.toLowerCase())) out[out.length - 1] = f;
        else if (!(prev && prev.toLowerCase().startsWith(f.toLowerCase()))) out.push(f);
      }
      return out.join(' ');
    };
    const finalText = () => (committed + ' ' + sessionText()).replace(/\s+/g, ' ').trim();
    const emit = () => o.onUpdate && o.onUpdate(finalText(), interim.trim());

    function build() {
      const r = new Recognition();
      r.lang = o.lang || 'en-US';
      r.continuous = true;
      r.interimResults = true;
      r.maxAlternatives = 1;
      r.onresult = (e) => {
        const now = performance.now();
        if (firstResultAt == null) firstResultAt = now;
        lastResultAt = now;
        interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i];
          const t = res[0] ? res[0].transcript.trim() : '';
          if (res.isFinal) finals[i] = t;
          else interim += ' ' + t;
        }
        emit();
      };
      r.onerror = (e) => {
        const code = e.error || 'unknown';
        if (code === 'no-speech' || code === 'aborted') return;
        if (code === 'network') {
          networkErrors++;
          if (networkErrors >= 2) fail(code, 'Speech recognition needs an internet connection in this browser.');
          return;
        }
        if (FATAL[code]) fail(code, FATAL[code]);
        else if (o.onError) o.onError(code, 'Speech recognition error: ' + code, false);
      };
      r.onend = () => {
        // Bank this session's text, then restart if we are still listening.
        committed = finalText();
        finals = [];
        if (interim.trim()) committed = (committed + ' ' + interim.trim()).trim();
        interim = '';
        if (active) {
          const now = Date.now();
          restarts = restarts.filter((t) => now - t < 10000);
          restarts.push(now);
          if (restarts.length > 8) return fail('unstable', 'Speech recognition keeps stopping.');
          setTimeout(() => {
            if (!active) return flushEnd();
            try {
              rec = build();
              rec.start();
            } catch (err) {
              fail('start-failed', String(err && err.message));
            }
          }, 120);
        } else flushEnd();
      };
      return r;
    }

    function flushEnd() {
      const waiters = endWaiters;
      endWaiters = [];
      waiters.forEach((w) => w(finalText()));
    }

    function fail(code, message) {
      active = false;
      try { if (rec) rec.abort(); } catch (e) { /* ignore */ }
      if (o.onError) o.onError(code, message, true);
      flushEnd();
    }

    return {
      start() {
        committed = '';
        finals = [];
        interim = '';
        firstResultAt = null;
        lastResultAt = null;
        networkErrors = 0;
        restarts = [];
        active = true;
        rec = build();
        try {
          rec.start();
        } catch (err) {
          fail('start-failed', String(err && err.message));
        }
      },
      /** Pause without losing text (e.g. while the question is repeated). */
      pause() {
        active = false;
        try { if (rec) rec.stop(); } catch (e) { /* ignore */ }
      },
      resume() {
        active = true;
        rec = build();
        try { rec.start(); } catch (err) { fail('start-failed', String(err && err.message)); }
      },
      /** Stop and resolve with the final transcript once the engine flushes. */
      stop() {
        active = false;
        return new Promise((resolve) => {
          const t = setTimeout(() => resolve(finalText()), 1500);
          endWaiters.push((text) => {
            clearTimeout(t);
            resolve(text);
          });
          try { if (rec) rec.stop(); } catch (e) { resolve(finalText()); }
        });
      },
      abort() {
        active = false;
        try { if (rec) rec.abort(); } catch (e) { /* ignore */ }
      },
      text: finalText,
      interim: () => interim.trim(),
      get firstResultAt() { return firstResultAt; },
      get lastResultAt() { return lastResultAt; },
      get active() { return active; },
    };
  }

  (root.AII = root.AII || {}).Speech = {
    ttsSupported: !!synth,
    sttSupported: !!Recognition,
    loadVoices,
    englishVoices,
    pickVoices,
    speak,
    cancel,
    chunks,
    createRecognizer,
  };
})(typeof window !== 'undefined' ? window : globalThis);
