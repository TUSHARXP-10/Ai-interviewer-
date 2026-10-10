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

  function workerEngine(onProgress) {
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
    return new Promise((resolve, reject) => {
      const fail = (msg) => {
        reject(new Error(msg));
        pending.forEach((p) => p.reject(new Error(msg)));
        pending.clear();
        w.terminate();
        URL.revokeObjectURL(url);
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
          resolve({
            run(audio, args) {
              return new Promise((res, rej) => {
                const id = ++seq;
                pending.set(id, { resolve: res, reject: rej });
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
    engine = (async () => {
      if (CFG.useWorker && typeof Worker === 'function') {
        try {
          return await workerEngine(onProgress);
        } catch (e) {
          // Module workers missing (older Firefox/Safari) or blocked: use the main thread.
          if (root.console) root.console.warn('[whisper] worker unavailable, using the main thread:', e.message);
        }
      }
      return mainThreadEngine(onProgress);
    })();
    engine.then(() => {
      try { root.localStorage.setItem(READY_KEY, '1'); } catch (e) { /* ignore */ }
    }, () => { engine = null; });
    return engine;
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
  const JUNK = /^\s*(\[(blank_audio|music|silence|inaudible)\]|\((music|silence|inaudible|background noise)\)|thank you\.?|thanks for watching!?|you\.?)\s*$/i;

  /**
   * Transcribe one finished answer. Resolves '' for silence; rejects if the model fails.
   * opts.silenceDb: level treated as silence when trimming (default -45 dBFS).
   */
  async function transcribe(pcm, sampleRate, opts) {
    const eng = await load();
    const audio = trim(await to16k(pcm, sampleRate), opts && opts.silenceDb);
    if (audio.length < SR * 0.4) return '';
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

  /**
   * opts: { meter (AII.Audio meter, required), onUpdate(final, interim), onError(code, message, fatal), onStatus(text) }
   */
  function createRecognizer(opts) {
    const o = opts || {};
    let chunks = [];
    let rate = 0;
    let untap = null;
    let paused = false;
    let finalText = '';
    let lastResultAt = null;

    function stopTap() {
      if (untap) untap();
      untap = null;
    }
    function collect() {
      let n = 0;
      for (const c of chunks) n += c.length;
      const pcm = new Float32Array(n);
      let at = 0;
      for (const c of chunks) {
        pcm.set(c, at);
        at += c.length;
      }
      chunks = [];
      return pcm;
    }

    return {
      live: false,
      start() {
        chunks = [];
        finalText = '';
        paused = false;
        if (!o.meter || !o.meter.running) {
          if (o.onError) o.onError('audio-capture', 'The microphone is not available.', true);
          return;
        }
        untap = o.meter.tap((data, sr) => {
          if (!paused) {
            chunks.push(data);
            rate = sr;
          }
        });
      },
      pause() { paused = true; },
      resume() { paused = false; },
      async stop() {
        stopTap();
        const pcm = collect();
        if (!pcm.length || !rate) return '';
        if (o.onStatus) o.onStatus('Transcribing your answer…');
        try {
          // Treat anything near the room's noise level as silence when trimming.
          const floor = o.meter && Number.isFinite(o.meter.noiseFloor) ? o.meter.noiseFloor : -55;
          finalText = await transcribe(pcm, rate, { silenceDb: Math.min(-30, Math.max(-60, floor + 10)) });
        } catch (e) {
          if (o.onError) o.onError('whisper-failed', 'The offline speech model failed: ' + ((e && e.message) || e), false);
          finalText = '';
        }
        lastResultAt = performance.now();
        if (o.onUpdate) o.onUpdate(finalText, '');
        return finalText;
      },
      abort() {
        stopTap();
        chunks = [];
      },
      text: () => finalText,
      interim: () => '',
      get firstResultAt() { return null; },
      get lastResultAt() { return lastResultAt; },
      get active() { return !!untap; },
    };
  }

  const api = { supported, isCached, preload, transcribe, createRecognizer, to16k, trim, splitAtPauses, collapseRepeats, MODEL_MB, TJS_VERSION, config: CFG };
  if (typeof module === 'object' && module.exports) module.exports = api;
  (root.AII = root.AII || {}).Whisper = api;
})(typeof window !== 'undefined' ? window : globalThis);
