/*
 * audio.js — microphone analysis with the Web Audio API (runs locally, nothing is recorded).
 *
 * Every 50 ms it measures loudness and estimates pitch. For each answer it then
 * reports: when the candidate started speaking, long pauses, how loud the voice
 * was above the room's noise, whether the voice faded at the end, and how much
 * the pitch varied (monotone vs. expressive).
 */
(function (root) {
  'use strict';

  const FRAME_MS = 50;
  const LONG_PAUSE_MS = 2000;

  function rmsDb(buf) {
    let s = 0;
    for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
    const rms = Math.sqrt(s / buf.length);
    return 20 * Math.log10(rms + 1e-9);
  }

  /** Normalised autocorrelation pitch estimate on a 2× down-sampled frame. */
  function detectPitch(buf, sampleRate) {
    const n = Math.floor(buf.length / 2);
    const x = new Float32Array(n);
    for (let i = 0; i < n; i++) x[i] = (buf[2 * i] + buf[2 * i + 1]) / 2;
    const sr = sampleRate / 2;
    const minLag = Math.floor(sr / 400);
    const maxLag = Math.min(n - 1, Math.floor(sr / 70));
    const win = n - maxLag;
    if (win < 64) return null;
    let e0 = 0;
    for (let i = 0; i < win; i++) e0 += x[i] * x[i];
    if (e0 <= 0) return null;
    const r = new Float32Array(maxLag + 1);
    let best = -1;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let s = 0;
      let e1 = 0;
      for (let i = 0; i < win; i++) {
        s += x[i] * x[i + lag];
        e1 += x[i + lag] * x[i + lag];
      }
      r[lag] = s / Math.sqrt(e0 * e1 + 1e-12);
      if (r[lag] > best) best = r[lag];
    }
    if (best < 0.75) return null;
    // Prefer the first strong peak to avoid octave (sub-harmonic) errors.
    for (let lag = minLag + 1; lag < maxLag; lag++) {
      if (r[lag] >= 0.9 * best && r[lag] >= r[lag - 1] && r[lag] >= r[lag + 1]) {
        return { hz: sr / lag, clarity: r[lag] };
      }
    }
    return null;
  }

  function mean(a) {
    return a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
  }

  function median(a) {
    if (!a.length) return 0;
    const s = a.slice().sort((x, y) => x - y);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  /** Summarise one answer's frames: [{ t, db, voiced, hz }] with t in ms from segment start. */
  function summarize(frames, noiseFloor) {
    const voicedIdx = [];
    frames.forEach((f, i) => { if (f.voiced) voicedIdx.push(i); });
    // Too little voice to measure anything (a click or a breath): report nothing rather than partial stats.
    if (voicedIdx.length < 3) return null;

    // Onset: first run of ≥3 voiced frames (150 ms) — ignores clicks and coughs.
    let onset = null;
    for (let i = 0; i + 2 < frames.length; i++) {
      if (frames[i].voiced && frames[i + 1].voiced && frames[i + 2].voiced) {
        onset = i;
        break;
      }
    }
    if (onset == null) onset = voicedIdx[0];
    const last = voicedIdx[voicedIdx.length - 1];

    let longPauses = 0;
    let longest = 0;
    let run = 0;
    let voicedInSpan = 0;
    for (let i = onset; i <= last; i++) {
      if (frames[i].voiced) {
        voicedInSpan++;
        if (run * FRAME_MS >= LONG_PAUSE_MS) longPauses++;
        longest = Math.max(longest, run * FRAME_MS);
        run = 0;
      } else run++;
    }

    const voicedDb = voicedIdx.map((i) => frames[i].db);
    const meanDb = mean(voicedDb);
    const k1 = Math.max(1, Math.floor(voicedDb.length * 0.4));
    const k2 = Math.max(1, Math.floor(voicedDb.length * 0.3));
    const trailOffDb = mean(voicedDb.slice(0, k1)) - mean(voicedDb.slice(-k2));

    const hz = frames.filter((f) => f.voiced && f.hz).map((f) => f.hz);
    let pitchSd = null;
    let pitchMedian = null;
    if (hz.length >= 10) {
      pitchMedian = median(hz);
      const st = hz.map((h) => 12 * Math.log2(h / pitchMedian)).filter((s) => Math.abs(s) < 12);
      const m = mean(st);
      pitchSd = Math.sqrt(mean(st.map((s) => (s - m) * (s - m))));
    }

    return {
      voicedFrames: voicedIdx.length,
      onsetMs: frames[onset].t,
      lastVoicedMs: frames[last].t + FRAME_MS,
      speakingMs: frames[last].t + FRAME_MS - frames[onset].t,
      voicedRatio: voicedInSpan / (last - onset + 1),
      longPauses,
      longestPauseMs: longest,
      meanVoicedDb: meanDb,
      noiseFloorDb: noiseFloor,
      snrDb: meanDb - noiseFloor,
      trailOffDb,
      pitchFrames: hz.length,
      pitchMedianHz: pitchMedian,
      pitchSdSemitones: pitchSd,
    };
  }

  // One shared AudioContext, created (or resumed) inside a click handler so that
  // browsers with strict autoplay rules (Safari/iOS) let it run.
  let sharedCtx = null;
  function prime() {
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    if (!sharedCtx || sharedCtx.state === 'closed') sharedCtx = new AC();
    if (sharedCtx.state === 'suspended') sharedCtx.resume().catch(() => {});
    return sharedCtx;
  }

  function createMeter() {
    let ctx = null;
    let stream = null;
    let analyser = null;
    let buf = null;
    let timer = null;
    let noiseFloor = -60;
    let level = 0;
    let voiced = false;
    let lastVoiceAt = 0;
    let segment = null;
    let source = null;
    const recent = [];
    const listeners = new Set();
    const taps = new Set();
    let tapNode = null;

    function tick() {
      analyser.getFloatTimeDomainData(buf);
      const db = rmsDb(buf);
      // Noise floor by "minimum statistics": even continuous speech has quiet
      // gaps between words, so a low percentile of the last 3 s tracks the room.
      recent.push(db);
      if (recent.length > 60) recent.shift();
      const p10 = recent.slice().sort((x, y) => x - y)[Math.floor(recent.length * 0.1)];
      noiseFloor = recent.length < 12 ? p10 : 0.9 * noiseFloor + 0.1 * p10;
      noiseFloor = Math.max(-100, Math.min(noiseFloor, -25));
      const threshold = Math.min(-30, Math.max(-58, noiseFloor + 12));
      voiced = db > threshold;
      const now = performance.now();
      if (voiced) lastVoiceAt = now;
      level = Math.max(0, Math.min(1, (db - noiseFloor) / 40));
      if (segment && !segment.paused) {
        if (voiced) segment.voicedMs += FRAME_MS;
        const frame = { t: now - segment.start, db, voiced, hz: null };
        if (voiced) {
          const p = detectPitch(buf, ctx.sampleRate);
          if (p) frame.hz = p.hz;
        }
        segment.frames.push(frame);
      }
      listeners.forEach((fn) => fn(level, voiced));
    }

    return {
      async start(existingStream) {
        stream = existingStream || await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false },
        });
        ctx = prime();
        if (!ctx) throw new Error('Web Audio is not supported');
        if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
        source = ctx.createMediaStreamSource(stream);
        analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        source.connect(analyser);
        buf = new Float32Array(analyser.fftSize);
        timer = setInterval(tick, FRAME_MS);
        return stream;
      },
      stop() {
        clearInterval(timer);
        timer = null;
        taps.clear();
        if (tapNode) {
          try { tapNode.disconnect(); } catch (e) { /* ignore */ }
          tapNode = null;
        }
        if (source) {
          try { source.disconnect(); } catch (e) { /* ignore */ }
          source = null;
        }
        if (stream) stream.getTracks().forEach((t) => t.stop());
        stream = null;
        ctx = null; // the shared context stays open for the next interview
      },
      beginSegment() {
        segment = { start: performance.now(), frames: [], voicedMs: 0, paused: false };
      },
      /** Ignore the mic while the interviewer speaks mid-answer (e.g. a nudge). */
      pauseSegment() {
        if (segment && !segment.paused) {
          segment.paused = true;
          segment.pausedAt = performance.now();
        }
      },
      resumeSegment() {
        if (segment && segment.paused) {
          // Shift the segment clock so time spent paused never counts as speaking or as a pause.
          segment.start += performance.now() - segment.pausedAt;
          segment.paused = false;
        }
      },
      /** How long voice has been heard in the current answer. */
      segmentVoicedMs() {
        return segment ? segment.voicedMs : 0;
      },
      /**
       * Receive raw microphone samples (Float32Array at sampleRate) — used by the
       * offline speech engine. Returns an unsubscribe function.
       */
      tap(fn) {
        if (!ctx || !source) return () => {};
        taps.add(fn);
        if (!tapNode) {
          tapNode = ctx.createScriptProcessor(4096, 1, 1);
          tapNode.onaudioprocess = (e) => {
            const data = e.inputBuffer.getChannelData(0);
            taps.forEach((f) => f(new Float32Array(data), ctx.sampleRate));
          };
          const mute = ctx.createGain();
          mute.gain.value = 0;
          source.connect(tapNode);
          tapNode.connect(mute);
          mute.connect(ctx.destination);
        }
        return () => taps.delete(fn);
      },
      endSegment() {
        if (!segment) return null;
        const s = summarize(segment.frames, noiseFloor);
        segment = null;
        return s;
      },
      /** Milliseconds since the voice was last above the noise threshold. */
      msSinceVoice() {
        return lastVoiceAt ? performance.now() - lastVoiceAt : Infinity;
      },
      onLevel(fn) {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
      get level() { return level; },
      get voiced() { return voiced; },
      get running() { return !!timer; },
      get noiseFloor() { return noiseFloor; },
      get stream() { return stream; },
      get sampleRate() { return ctx ? ctx.sampleRate : 0; },
    };
  }

  (root.AII = root.AII || {}).Audio = { createMeter, detectPitch, summarize, prime, FRAME_MS };
})(typeof window !== 'undefined' ? window : globalThis);
