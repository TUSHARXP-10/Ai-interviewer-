/*
 * whisper.js — free, on-device speech recognition (OpenAI Whisper via transformers.js).
 *
 * Used when the browser's own recogniser is missing or blocked (Firefox, Brave,
 * some Android browsers) or when chosen in settings. No API key and no server:
 * the library and a small English model (~48 MB in total) are downloaded once, cached by
 * the browser, and run locally with WebAssembly. Audio never leaves the device.
 *
 * It exposes the same recogniser interface as speech.js, except that text only
 * arrives when the answer ends (live === false); the mic meter detects the end of
 * the answer instead of live words.
 *
 * Override the defaults (e.g. to self-host the model) before this script loads:
 *   window.AII_CONFIG = { whisper: { model, dtype, libUrl, modelHost, wasmPaths, multilingual } }
 */
(function (root) {
  'use strict';

  const TJS_VERSION = '4.3.0'; // pinned: a release that has been out for a few weeks
  const CFG = Object.assign({
    libUrl: 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@' + TJS_VERSION + '/dist/transformers.min.js',
    model: 'onnx-community/whisper-tiny.en', // English-only model: do not pass language/task
    multilingual: false,                     // set true for multilingual checkpoints (e.g. Xenova/whisper-tiny)
    dtype: 'q8',                             // ~41 MB of weights; fp32 is about 4x larger
    device: 'wasm',                          // runs everywhere
    revision: 'main',
    modelHost: null,                         // self-hosting: base URL containing '<model>/<files>'
    wasmPaths: null,                         // self-hosting the ONNX runtime: { mjs, wasm } URLs
    useWorker: true,                         // keep the page responsive while transcribing
    runTimeoutMs: null,                      // per clip; default 20 s + twice the clip's length
    livePhrases: true,                       // transcribe each phrase at a pause, for live captions
  }, (root.AII_CONFIG && root.AII_CONFIG.whisper) || {});
  const MODEL_MB = 48; // first use: ~41 MB of weights + tokenizer + speech runtime
  const SR = 16000;
  const READY_KEY = 'aii.whisper.ready.' + CFG.model;

  let engine = null; // Promise<{ run(audio, args) -> Promise<string> }>

  function supported() {
    return typeof WebAssembly === 'object' &&
      !!(root.AudioContext || root.webkitAudioContext) &&
      !!(root.navigator && root.navigator.mediaDevices && root.navigator.mediaDevices.getUserMedia);
  }

  function isCached() {
    try {
      return root.localStorage.getItem(READY_KEY) === '1';
    } catch (e) {
      return false;
    }
  }

  // The same function runs inside a module worker (preferred) or on the main thread.
  async function makePipeline(cfg, onProgress) {
    const mod = await import(cfg.libUrl);
    const env = mod.env;
    if (cfg.modelHost) {
      env.remoteHost = cfg.modelHost;
      env.remotePathTemplate = '{model}/';
    }
    if (cfg.wasmPaths) env.backends.onnx.wasm.wasmPaths = cfg.wasmPaths;
    const files = {};
    let haveTotal = false;
    return mod.pipeline('automatic-speech-recognition', cfg.model, {
      device: cfg.device,
      dtype: cfg.dtype,
      revision: cfg.revision,
      progress_callback(p) {
        if (p.status === 'progress_total') {
          haveTotal = true;
          onProgress(p.loaded / (p.total || 1));
        } else if (p.status === 'progress' && !haveTotal && p.file) {
          files[p.file] = [p.loaded || 0, p.total || 0];
          let l = 0;
          let t = 0;
          for (const k in files) {
            l += files[k][0];
            t += files[k][1];
          }
          onProgress(t ? l / t : 0);
        }
      },
    });
  }

  /** onDead: called if the worker fails after it was ready, so the caller can drop it. */
  function workerEngine(onProgress, onDead) {
    const src = 'const makePipeline = ' + makePipeline.toString() + ';\n' +
      'let asr;\n' +
      'self.onmessage = async (e) => {\n' +
      '  const m = e.data;\n' +
      '  try {\n' +
      '    if (m.type === "load") {\n' +
      '      asr = await makePipeline(m.cfg, (f) => self.postMessage({ type: "progress", f }));\n' +
      '      self.postMessage({ type: "ready" });\n' +
      '    } else {\n' +
      '      const out = await asr(m.audio, m.args);\n' +
      '      self.postMessage({ type: "result", id: m.id, text: out.text });\n' +
      '    }\n' +
      '  } catch (err) { self.postMessage({ type: "error", id: m.id, message: String((err && err.message) || err) }); }\n' +
      '};\n';
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    const w = new Worker(url, { type: 'module' });
    const pending = new Map();
    let seq = 0;
    let ready = false;
    let dead = null; // why the worker stopped: later runs fail at once instead of waiting forever
    return new Promise((resolve, reject) => {
      const fail = (msg) => {
        if (dead) return;
        dead = msg;
        reject(new Error(msg));
        pending.forEach((p) => p.reject(new Error(msg)));
        pending.clear();
        w.terminate();
        URL.revokeObjectURL(url);
        if (ready && onDead) onDead();
      };
      w.onerror = (e) => {
        e.preventDefault();
        fail('Speech worker failed: ' + (e.message || 'unknown error'));
      };
      w.onmessage = (e) => {
        const m = e.data;
        if (m.type === 'progress') {
          if (onProgress) onProgress(m.f);
        } else if (m.type === 'ready') {
          ready = true;
          resolve({
            run(audio, args) {
              if (dead) return Promise.reject(new Error(dead));
              return new Promise((res, rej) => {
                const id = ++seq;
                // A crashed or stalled worker never answers: give up so the interview can go on.
                const limit = CFG.runTimeoutMs || 20000 + (2 * audio.length * 1000) / SR;
                const timer = setTimeout(() => fail('The speech worker stopped responding.'), limit);
                pending.set(id, {
                  resolve: (text) => { clearTimeout(timer); res(text); },
                  reject: (err) => { clearTimeout(timer); rej(err); },
                });
                w.postMessage({ type: 'run', id, audio, args }, [audio.buffer]);
              });
            },
          });
        } else if (m.type === 'result' && pending.has(m.id)) {
          pending.get(m.id).resolve(m.text);
          pending.delete(m.id);
        } else if (m.type === 'error') {
          if (m.id && pending.has(m.id)) {
            pending.get(m.id).reject(new Error(m.message));
            pending.delete(m.id);
          } else fail(m.message);
        }
      };
      w.postMessage({ type: 'load', cfg: Object.assign({}, CFG) });
    });
  }

  async function mainThreadEngine(onProgress) {
    const asr = await makePipeline(CFG, onProgress || (() => {}));
    return { run: async (audio, args) => (await asr(audio, args)).text };
  }

  /** Load the library and model once (retryable after a failure). */
  function load(onProgress) {
    if (engine) return engine;
    const current = (async () => {
      if (CFG.useWorker && typeof Worker === 'function') {
        try {
          // A worker that fails later is dropped, so the next answer starts a fresh one
          // (the model files are in the browser cache by then).
          return await workerEngine(onProgress, () => { if (engine === current) engine = null; });
        } catch (e) {
          // Module workers missing (older Firefox/Safari) or blocked: use the main thread.
          if (root.console) root.console.warn('[whisper] worker unavailable, using the main thread:', e.message);
        }
      }
      return mainThreadEngine(onProgress);
    })();
    engine = current;
    current.then(() => {
      try { root.localStorage.setItem(READY_KEY, '1'); } catch (e) { /* ignore */ }
    }, () => { if (engine === current) engine = null; });
    return current;
  }

  /** Resolves true when the model is ready, false if it could not be loaded. */
  function preload(onProgress) {
    return load(onProgress).then(() => true, (e) => {
      if (root.console) root.console.warn('[whisper] could not load the speech model:', e && e.message);
      return false;
    });
  }

  // ------------------------------------------------------------ audio helpers

  /** Box-filter decimation; used if OfflineAudioContext is unavailable. */
  function jsResample(x, rate) {
    const ratio = rate / SR;
    const n = Math.floor(x.length / ratio);
    const y = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = Math.floor(i * ratio);
      const b = Math.min(x.length, Math.max(a + 1, Math.floor((i + 1) * ratio)));
      let s = 0;
      for (let j = a; j < b; j++) s += x[j];
      y[i] = s / (b - a);
    }
    return y;
  }

  /** Resample mono PCM to 16 kHz, the rate Whisper expects. */
  async function to16k(pcm, rate) {
    if (rate === SR) return pcm.slice();
    try {
      const OAC = root.OfflineAudioContext || root.webkitOfflineAudioContext;
      const off = new OAC(1, Math.ceil((pcm.length * SR) / rate), SR);
      const buf = off.createBuffer(1, pcm.length, rate);
      buf.getChannelData(0).set(pcm);
      const s = off.createBufferSource();
      s.buffer = buf;
      s.connect(off.destination);
      s.start(0);
      const out = await off.startRendering();
      return out.getChannelData(0).slice();
    } catch (e) {
      return jsResample(pcm, rate);
    }
  }

  /** Cut leading/trailing silence: Whisper tends to invent words on pure silence. */
  function trim(x, db) {
    const thr = Math.pow(10, (db == null ? -45 : db) / 20);
    const win = 320; // 20 ms at 16 kHz
    const loud = (i) => {
      let s = 0;
      const end = Math.min(x.length, i + win);
      for (let j = i; j < end; j++) s += x[j] * x[j];
      return Math.sqrt(s / win) > thr;
    };
    let a = 0;
    while (a < x.length && !loud(a)) a += win;
    if (a >= x.length) return new Float32Array(0);
    let b = x.length - win;
    while (b > a && !loud(b)) b -= win;
    return x.slice(Math.max(0, a - 4 * win), Math.min(x.length, b + 5 * win));
  }

  /**
   * Turn a quiet recording up (a soft voice, a phone held at arm's length): peak to 0.5,
   * at most 20 times louder. Whisper hears a quiet clip much like noise.
   */
  function loudenQuiet(x) {
    let peak = 0;
    for (let i = 0; i < x.length; i++) {
      const a = Math.abs(x[i]);
      if (a > peak) peak = a;
    }
    if (!(peak > 0) || peak >= 0.5) return x;
    const gain = Math.min(20, 0.5 / peak);
    for (let i = 0; i < x.length; i++) x[i] *= gain;
    return x;
  }

  /**
   * Whisper reads 30 s windows. Split longer answers at the quietest moment
   * between 18 and 28 s (the library's own chunking looped on long answers in tests).
   */
  function splitAtPauses(x) {
    const out = [];
    const hop = SR / 10; // 100 ms
    let start = 0;
    while (x.length - start > 28 * SR) {
      let best = start + 25 * SR;
      let bestE = Infinity;
      for (let i = start + 18 * SR; i + 2 * hop < start + 28 * SR; i += hop) {
        let e = 0;
        for (let j = i; j < i + 2 * hop; j++) e += x[j] * x[j];
        if (e < bestE) {
          bestE = e;
          best = i + hop;
        }
      }
      out.push(x.slice(start, best));
      start = best;
    }
    out.push(x.slice(start));
    return out;
  }

  /** Collapse decoder loops such as "ask what your country, ask what your country, ...". */
  function collapseRepeats(text) {
    let t = text;
    for (let n = 8; n >= 2; n--) {
      const re = new RegExp('\\b((?:\\S+\\s+){' + (n - 1) + '}\\S+?)([,.]?\\s+\\1){2,}', 'gi');
      t = t.replace(re, '$1');
    }
    return t;
  }

  // Typical Whisper hallucinations on near-silence.
  const JUNK = /^\s*(?:and\s+)?(\[(blank_audio|music|silence|inaudible)\]|\((music|silence|inaudible|background noise)\)|thank you\.?|thanks for watching!?|you\.?|i hope you (?:enjoyed|liked) (?:the|this) video\.?|please (?:like and )?subscribe\.?|(?:see you|i'?ll see you) in the next (?:video|one)\.?)\s*$/i;

  /**
   * Transcribe one finished answer. Resolves '' for silence; rejects if the model fails.
   * opts.silenceDb: level treated as silence when trimming (default -45 dBFS).
   */
  async function transcribe(pcm, sampleRate, opts) {
    const eng = await load();
    const audio = trim(await to16k(pcm, sampleRate), opts && opts.silenceDb);
    if (audio.length < SR * 0.4) return '';
    loudenQuiet(audio);
    const parts = [];
    for (const piece of splitAtPauses(audio)) {
      // About 6 tokens per second of speech; the cap stops runaway decoder loops.
      const args = { max_new_tokens: Math.min(400, Math.ceil((piece.length / SR) * 6) + 16) };
      if (CFG.multilingual) {
        args.language = 'english';
        args.task = 'transcribe';
      }
      const t = String((await eng.run(piece, args)) || '').replace(/\s+/g, ' ').trim();
      if (t && !JUNK.test(t)) parts.push(t);
    }
    return collapseRepeats(parts.join(' '));
  }

  // ------------------------------------------------------------ recogniser interface

  // Live captions: a pause this long after enough speech ends a phrase, which is
  // transcribed while the candidate carries on, so the words appear as they speak.
  const PHRASE_PAUSE_MS = 700;
  const PHRASE_MIN_S = 1.2;
  const PHRASE_MIN_VOICE_MS = 500;
  // A short reply on its own ("Yes.", "No.") is a phrase too, once the speaker has clearly stopped.
  const PHRASE_SHORT_VOICE_MS = 200;
  const PHRASE_SHORT_PAUSE_MS = 1200;

  /**
   * opts: { meter (AII.Audio meter, required), onUpdate(final, interim), onError(code, message, fatal), onStatus(text) }
   * onUpdate receives the phrases transcribed so far, with '…' as interim while one is pending.
   */
  function createRecognizer(opts) {
    const o = opts || {};
    let chunks = [];      // samples of the phrase being spoken
    let chunkSamples = 0;
    let voicedMs = 0;     // voice heard in that phrase
    let rate = 0;
    let untap = null;
    let paused = false;
    let phrases = [];     // transcriptions, in speaking order
    let texts = [];       // finished phrases, for the live caption
    let pending = 0;
    let gen = 0;          // start() and abort() leave late results unused
    let finalText = '';
    let lastResultAt = null;

    function stopTap() {
      if (untap) untap();
      untap = null;
    }
    function collect() {
      const pcm = new Float32Array(chunkSamples);
      let at = 0;
      for (const c of chunks) {
        pcm.set(c, at);
        at += c.length;
      }
      chunks = [];
      chunkSamples = 0;
      return pcm;
    }
    const shown = () => texts.filter(Boolean).join(' ');
    const update = () => { if (o.onUpdate) o.onUpdate(shown(), pending ? '…' : ''); };
    function silenceDb() {
      // Treat anything near the room's noise level as silence when trimming.
      const floor = o.meter && Number.isFinite(o.meter.noiseFloor) ? o.meter.noiseFloor : -55;
      // A soft voice can be only a few dB above a fan or air conditioner: keep it.
      return Math.min(-36, Math.max(-62, floor + 6));
    }

    /** Send the phrase heard so far to be transcribed (the worker keeps them in order). */
    function cut() {
      const pcm = collect();
      voicedMs = 0;
      if (!pcm.length || !rate) return;
      const my = gen;
      const i = phrases.length;
      pending++;
      phrases.push(transcribe(pcm, rate, { silenceDb: silenceDb() }).catch((e) => {
        if (my === gen && o.onError) o.onError('whisper-failed', 'The offline speech model failed: ' + ((e && e.message) || e), false);
        return '';
      }).then((t) => {
        if (my !== gen) return '';
        pending--;
        texts[i] = t;
        lastResultAt = performance.now();
        update();
        return t;
      }));
      update();
    }

    function reset() {
      gen++;
      chunks = [];
      chunkSamples = 0;
      voicedMs = 0;
      phrases = [];
      texts = [];
      pending = 0;
    }

    return {
      live: false,
      start() {
        reset();
        finalText = '';
        paused = false;
        if (!o.meter || !o.meter.running) {
          if (o.onError) o.onError('audio-capture', 'The microphone is not available.', true);
          return;
        }
        untap = o.meter.tap((data, sr) => {
          if (paused) return;
          chunks.push(data);
          chunkSamples += data.length;
          rate = sr;
          if (o.meter.voiced) voicedMs += (data.length / sr) * 1000;
          const quietMs = o.meter.msSinceVoice();
          const enough = voicedMs >= PHRASE_MIN_VOICE_MS || (voicedMs >= PHRASE_SHORT_VOICE_MS && quietMs >= PHRASE_SHORT_PAUSE_MS);
          if (CFG.livePhrases && enough && chunkSamples / sr >= PHRASE_MIN_S && quietMs >= PHRASE_PAUSE_MS) cut();
        });
      },
      pause() {
        paused = true;
        // The interviewer is about to speak: caption what was said so far.
        if (CFG.livePhrases && voicedMs >= PHRASE_MIN_VOICE_MS) cut();
      },
      resume() { paused = false; },
      async stop() {
        stopTap();
        // The last phrase (a tail of pure silence is dropped, unless it is all there is).
        if (voicedMs > 0 || !phrases.length) cut();
        else collect();
        if (!phrases.length) return '';
        const my = gen;
        if (pending && o.onStatus) o.onStatus('Transcribing your answer…');
        const all = await Promise.all(phrases);
        if (my !== gen) return '';
        finalText = collapseRepeats(all.filter(Boolean).join(' '));
        lastResultAt = performance.now();
        if (o.onUpdate) o.onUpdate(finalText, '');
        return finalText;
      },
      abort() {
        stopTap();
        reset();
      },
      text: () => finalText || shown(),
      interim: () => '',
      get firstResultAt() { return null; },
      get lastResultAt() { return lastResultAt; },
      get active() { return !!untap; },
    };
  }

  const api = { supported, isCached, preload, transcribe, createRecognizer, to16k, trim, loudenQuiet, splitAtPauses, collapseRepeats, JUNK, MODEL_MB, TJS_VERSION, config: CFG };
  if (typeof module === 'object' && module.exports) module.exports = api;
  (root.AII = root.AII || {}).Whisper = api;
})(typeof window !== 'undefined' ? window : globalThis);
