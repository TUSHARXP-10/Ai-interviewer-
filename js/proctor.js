/*
 * proctor.js — AI proctoring from the camera, on this device (Google MediaPipe, loaded on demand).
 *
 * About eight times a second a face landmarker (478 points and blendshapes) reads the camera
 * frame; twice a second an object detector looks for a phone, and the frame's brightness is
 * checked. The candidate's normal position, looking at the screen, is calibrated first, and a
 * rule only fires when a condition lasts: blinks, a glance or one bad frame never count.
 *
 *   Proctor.createProctor({ video, canvas, onStatus, onEvent })   browser only
 *   Proctor.observe(), Proctor.createMonitor(), Proctor.headPose() pure, for tests
 *
 * Works in the browser (window.AII.Proctor) and in Node (module.exports) for tests.
 * Override the defaults (e.g. to self-host) before this script loads:
 *   window.AII_CONFIG = { proctor: { libUrl, wasmBase, faceModel, objectModel } }
 */
(function (root) {
  'use strict';
  const isNode = typeof module === 'object' && module.exports;

  const VERSION = '1.0.1'; // pinned: a release that has been out for a few weeks
  const CFG = Object.assign({
    libUrl: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@' + VERSION + '/vision_bundle.mjs',
    wasmBase: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@' + VERSION + '/wasm',
    faceModel: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
    objectModel: 'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/1/efficientdet_lite0.tflite',
    faceEveryMs: 120,
    phoneEveryMs: 500,
  }, (root.AII_CONFIG && root.AII_CONFIG.proctor) || {});
  const MODEL_MB = 21; // speech-free vision runtime (~11.5 MB) + face (3.8 MB) + objects (4.6 MB)

  // ------------------------------------------------------------ what one frame shows

  /**
   * Head turn and tilt from face landmarks (normalised image coordinates), as ratios that
   * grow with the angle: yaw ≈ 0.54·tan(turn), pitch rises by ≈ 0.26·tan(tilt) when the
   * head tips down. Both are compared with the candidate's own calibrated values.
   */
  function headPose(lm) {
    const nose = lm[1];
    const chin = lm[152];
    const left = lm[234];
    const right = lm[454];
    const eyeY = (lm[33].y + lm[263].y) / 2;
    const width = Math.abs(right.x - left.x) || 1e-6;
    return {
      yaw: (nose.x - (left.x + right.x) / 2) / width,
      pitch: (nose.y - eyeY) / ((chin.y - eyeY) || 1e-6),
    };
  }

  function faceBox(lm) {
    let x0 = 1;
    let y0 = 1;
    let x1 = 0;
    let y1 = 0;
    for (const p of lm) {
      if (p.x < x0) x0 = p.x;
      if (p.x > x1) x1 = p.x;
      if (p.y < y0) y0 = p.y;
      if (p.y > y1) y1 = p.y;
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, area: Math.max(0, x1 - x0) * Math.max(0, y1 - y0) };
  }

  function shapes(classifications) {
    const m = {};
    if (classifications && classifications.categories) for (const c of classifications.categories) m[c.categoryName] = c.score;
    return m;
  }

  /**
   * One frame's observation from a FaceLandmarker result.
   * extra: { t, brightness (0–1 or null), phone (best phone score this frame, or null), phoneBox }
   * The candidate is the largest face; a much smaller one (a photo on the wall, someone far
   * behind) is not counted as a second person.
   */
  function observe(result, extra) {
    const e = extra || {};
    const faces = (result && result.faceLandmarks) || [];
    const base = { t: e.t || 0, brightness: e.brightness == null ? null : e.brightness, phone: e.phone == null ? null : e.phone, phoneBox: e.phoneBox || null };
    if (!faces.length) return Object.assign(base, { faces: 0 });
    const boxes = faces.map(faceBox);
    let main = 0;
    boxes.forEach((b, i) => { if (b.area > boxes[main].area) main = i; });
    const others = boxes.filter((b, i) => i !== main && b.area >= boxes[main].area * 0.25);
    const pose = headPose(faces[main]);
    const s = shapes(result.faceBlendshapes && result.faceBlendshapes[main]);
    const avg = (a, b) => ((s[a] || 0) + (s[b] || 0)) / 2;
    return Object.assign(base, {
      faces: 1 + others.length,
      main,
      box: boxes[main],
      others,
      yaw: pose.yaw,
      pitch: pose.pitch,
      gazeDown: avg('eyeLookDownLeft', 'eyeLookDownRight'),
      gazeUp: avg('eyeLookUpLeft', 'eyeLookUpRight'),
      // Looking to one side: one eye looks out while the other looks in.
      gazeSide: Math.max(avg('eyeLookOutLeft', 'eyeLookInRight'), avg('eyeLookInLeft', 'eyeLookOutRight')),
      blink: Math.min(s.eyeBlinkLeft || 0, s.eyeBlinkRight || 0),
    });
  }

  // ------------------------------------------------------------ rules

  const DARK = 0.07;           // mean frame brightness below this: covered or no light
  const CLOSED = 0.72;         // both eyelids this closed: a blink, not a look away
  const AWAY = { yaw: 0.2, pitch: 0.09, down: 0.35, side: 0.4 }; // ≈20° turn, ≈17° tilt
  const PHONE_SCORE = 0.55;
  const GRACE_MS = 500;        // a condition must be gone this long to end
  const REPEAT_MS = 20000;     // still going 20 s after a serious warning: serious again

  /** [minor after, serious after] in ms of a condition lasting without a break. */
  const RULES = {
    dark: { minor: 1500, serious: 4000, label: 'Camera covered or too dark' },
    noFace: { minor: 2000, serious: 5000, label: 'Face not visible' },
    extra: { minor: 700, serious: 2000, label: 'Another person in view' },
    phone: { minor: 0, serious: 1000, label: 'Phone visible' },
    away: { minor: 3000, serious: 8000, label: 'Looking away from the screen' },
  };
  const KINDS = Object.keys(RULES);

  const median = (a) => {
    const s = a.slice().sort((x, y) => x - y);
    return s.length ? s[s.length >> 1] : 0;
  };

  /**
   * The rules over time. calibrate(obs) learns the candidate's normal position; update(obs)
   * returns { status, events } where events are
   *   { type: 'incident', id, kind, severity: 'minor' | 'serious', label, at, direction?, repeat? }
   *   { type: 'resolved', id, kind, durationMs }
   */
  function createMonitor() {
    let baseline = null;
    let calib = [];
    let seq = 0;
    const eps = {};
    const phoneHits = [];
    const glances = [];
    let awayStart = 0;
    let lastGlanceIncident = -Infinity;
    const stats = { frames: 0, faceFrames: 0, onFrames: 0, awayMs: 0, lastT: 0 };
    KINDS.forEach((k) => { eps[k] = null; });

    function deltas(o) {
      const b = baseline || { yaw: 0, pitch: 0.3, gazeDown: 0, gazeSide: 0 };
      return { yaw: Math.abs(o.yaw - b.yaw), pitch: o.pitch - b.pitch, down: o.gazeDown - b.gazeDown, side: o.gazeSide - b.gazeSide };
    }

    /** Is the candidate looking at the screen? 'on' | 'down' | 'side' | 'closed' | null (no face). */
    function gaze(o) {
      if (!o.faces) return null;
      if (o.blink >= CLOSED) return 'closed';
      const d = deltas(o);
      if (d.pitch > AWAY.pitch || d.down > AWAY.down) return 'down';
      if (d.yaw > AWAY.yaw || d.side > AWAY.side) return 'side';
      return 'on';
    }

    /**
     * Collect the candidate's normal position: one face, eyes open, roughly facing the camera,
     * for at least 2 s. Returns { done, progress, problem: null | 'noFace' | 'extra' | 'dark' | 'turned' }.
     */
    function calibrate(o) {
      if (baseline) return { done: true, progress: 1, problem: null }; // recalibrate() starts over
      let problem = null;
      if (o.brightness != null && o.brightness < DARK) problem = 'dark';
      else if (!o.faces) problem = 'noFace';
      else if (o.faces > 1) problem = 'extra';
      else if (Math.abs(o.yaw) > 0.25 || o.gazeDown > 0.5 || o.gazeSide > 0.5) problem = 'turned';
      if (problem) {
        calib = [];
        return { done: false, progress: 0, problem };
      }
      if (o.blink < CLOSED) calib.push(o);
      const span = calib.length ? calib[calib.length - 1].t - calib[0].t : 0;
      const progress = Math.min(1, Math.min(calib.length / 15, span / 2000));
      if (progress < 1) return { done: false, progress, problem: null };
      baseline = {
        yaw: median(calib.map((x) => x.yaw)),
        pitch: median(calib.map((x) => x.pitch)),
        gazeDown: median(calib.map((x) => x.gazeDown)),
        gazeSide: median(calib.map((x) => x.gazeSide)),
      };
      calib = [];
      return { done: true, progress: 1, problem: null };
    }

    function update(o) {
      const t = o.t;
      const events = [];
      // Frames stopped for a while (tab hidden, call paused): nothing seen then counts, so
      // anything that was going on is closed rather than carried over.
      if (stats.lastT && t - stats.lastT > 2000) {
        for (const kind of KINDS) {
          const ep = eps[kind];
          if (ep && ep.minor) events.push({ type: 'resolved', id: ep.id, kind, durationMs: ep.last - ep.since });
          eps[kind] = null;
        }
        awayStart = 0;
        phoneHits.length = 0;
      }
      const dt = stats.lastT ? Math.min(500, t - stats.lastT) : 0;
      stats.lastT = t;
      stats.frames++;

      if (o.phone != null) {
        phoneHits.push(o.phone >= PHONE_SCORE);
        if (phoneHits.length > 3) phoneHits.shift();
      }
      const g = gaze(o);
      const dark = o.brightness != null && o.brightness < DARK;
      const cond = {
        dark,
        noFace: !dark && !o.faces,
        extra: o.faces > 1,
        phone: phoneHits.filter(Boolean).length >= 2,
        away: g === 'down' || g === 'side',
      };
      if (o.faces) stats.faceFrames++;
      if (g === 'on' || g === 'closed') stats.onFrames++;
      if (cond.away) stats.awayMs += dt;

      // The baseline follows slow posture changes, only while clearly looking at the screen.
      if (baseline && g === 'on') {
        const d = deltas(o);
        if (d.yaw < AWAY.yaw / 2 && Math.abs(d.pitch) < AWAY.pitch / 2) {
          baseline.yaw += 0.002 * (o.yaw - baseline.yaw);
          baseline.pitch += 0.002 * (o.pitch - baseline.pitch);
        }
      }

      for (const kind of KINDS) {
        const rule = RULES[kind];
        let ep = eps[kind];
        if (cond[kind]) {
          if (!ep) ep = eps[kind] = { id: ++seq, since: t, last: t, minor: false, serious: false, seriousAt: 0 };
          ep.last = t;
          const dur = t - ep.since;
          const base = { id: ep.id, kind, label: rule.label, at: ep.since, direction: kind === 'away' ? g : undefined };
          if (!ep.minor && dur >= rule.minor) {
            ep.minor = true;
            events.push(Object.assign({ type: 'incident', severity: 'minor' }, base));
          }
          if (!ep.serious && dur >= rule.serious) {
            ep.serious = true;
            ep.seriousAt = t;
            events.push(Object.assign({ type: 'incident', severity: 'serious' }, base));
          } else if (ep.serious && t - ep.seriousAt >= REPEAT_MS) {
            ep.seriousAt = t;
            events.push(Object.assign({ type: 'incident', severity: 'serious', repeat: true }, base));
          }
        } else if (ep && t - ep.last > GRACE_MS) {
          if (ep.minor) events.push({ type: 'resolved', id: ep.id, kind, durationMs: ep.last - ep.since });
          eps[kind] = null;
        }
      }

      // Repeated glances away (reading notes): 4 looks of 1.2 s+ within 45 s.
      if (cond.away && !awayStart) awayStart = t;
      if (!cond.away && awayStart) {
        if (t - awayStart >= 1200) glances.push(t);
        awayStart = 0;
      }
      while (glances.length && t - glances[0] > 45000) glances.shift();
      if (glances.length >= 4 && t - lastGlanceIncident > 60000) {
        lastGlanceIncident = t;
        glances.length = 0;
        events.push({ type: 'incident', id: ++seq, kind: 'glances', severity: 'minor', label: 'Repeated glances away', at: t });
      }

      const state = (k) => (cond[k] ? (eps[k] && eps[k].serious ? 'bad' : 'warn') : 'ok');
      const status = {
        face: dark ? state('dark') : state('noFace'),
        eyes: state('away'),
        alone: state('extra'),
        phone: state('phone'),
        gaze: g,
        dark,
        faces: o.faces,
      };
      return { status, events };
    }

    return {
      calibrate,
      recalibrate() {
        baseline = null;
        calib = [];
      },
      update,
      gaze,
      get calibrated() { return !!baseline; },
      get baseline() { return baseline; },
      /** Share of watched frames with a face, and with the eyes on the screen. */
      stats() {
        const pct = (n) => (stats.frames ? Math.round((n / stats.frames) * 100) : null);
        return { faceVisiblePct: pct(stats.faceFrames), eyesOnPct: pct(stats.onFrames), awaySec: Math.round(stats.awayMs / 1000) };
      },
    };
  }

  // ------------------------------------------------------------ browser: models and the live loop

  let models = null; // Promise<{ face, objects }>, shared by every interview on the page

  async function fetchBytes(url, onBytes) {
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
    const total = Number(res.headers.get('content-length')) || 0;
    if (!res.body || !res.body.getReader) return new Uint8Array(await res.arrayBuffer());
    const reader = res.body.getReader();
    const parts = [];
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
      got += value.length;
      if (onBytes) onBytes(got, total);
    }
    const out = new Uint8Array(got);
    let at = 0;
    for (const p of parts) {
      out.set(p, at);
      at += p.length;
    }
    return out;
  }

  /** Load the vision runtime and both models once (retryable after a failure). onProgress(0–1). */
  function load(onProgress) {
    if (models) return models;
    const current = (async () => {
      const got = { face: 0, objects: 0 };
      const report = () => { if (onProgress) onProgress(Math.min(0.99, (got.face + got.objects) / 8.4e6)); };
      const [vision, faceBytes, objectBytes] = await Promise.all([
        import(CFG.libUrl),
        fetchBytes(CFG.faceModel, (n) => { got.face = n; report(); }),
        fetchBytes(CFG.objectModel, (n) => { got.objects = n; report(); }),
      ]);
      const fileset = await vision.FilesetResolver.forVisionTasks(CFG.wasmBase);
      // The graphics card is much faster; fall back to the processor where it is unavailable.
      const make = async (Cls, options, bytes) => {
        for (const delegate of ['GPU', 'CPU']) {
          try {
            return await Cls.createFromOptions(fileset, Object.assign({}, options, { baseOptions: { modelAssetBuffer: bytes, delegate } }));
          } catch (e) {
            if (delegate === 'CPU') throw e;
          }
        }
        return null;
      };
      const face = await make(vision.FaceLandmarker, {
        runningMode: 'VIDEO', numFaces: 3, outputFaceBlendshapes: true,
        minFaceDetectionConfidence: 0.5, minFacePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
      }, faceBytes);
      const objects = await make(vision.ObjectDetector, {
        runningMode: 'VIDEO', scoreThreshold: 0.4, maxResults: 3, categoryAllowlist: ['cell phone'],
      }, objectBytes);
      if (onProgress) onProgress(1);
      return { face, objects };
    })();
    models = current;
    current.catch(() => { if (models === current) models = null; });
    return current;
  }

  function supported() {
    return typeof WebAssembly === 'object' && !!(root.navigator && root.navigator.mediaDevices && root.navigator.mediaDevices.getUserMedia);
  }

  // Face outline and eye landmarks drawn as the overlay's wireframe.
  const OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109, 10];
  const COLORS = { ok: '#3ee6d0', warn: '#fbbf24', bad: '#ff4d5e' };

  /**
   * The live proctor for one camera <video>. Draws on `canvas` (sized to the video's box).
   * opts: { video, canvas, onStatus(status, obs), onEvent(event), onCalibrate({ done, progress, problem }) }
   */
  function createProctor(opts) {
    const o = opts || {};
    const video = o.video;
    const canvas = o.canvas;
    const monitor = createMonitor();
    let m = null;
    let timer = null;
    let mode = 'idle'; // 'idle' (draw only) | 'calibrate' | 'watch'
    let lastPhoneT = 0;
    let lastLightT = 0;
    let lastTs = 0;
    let brightness = null;
    let phoneBox = null;
    let phoneSeenAt = 0;
    let lastObs = null;
    let lastLandmarks = null;
    let lastStatus = null;
    let calibWaiter = null;
    const light = root.document ? root.document.createElement('canvas') : null;
    if (light) {
      light.width = 32;
      light.height = 24;
    }

    function measureLight() {
      const ctx = light.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(video, 0, 0, 32, 24);
      const d = ctx.getImageData(0, 0, 32, 24).data;
      let s = 0;
      for (let i = 0; i < d.length; i += 4) s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      return s / (d.length / 4) / 255;
    }

    function frame() {
      if (!m || !video || video.readyState < 2 || (root.document && root.document.hidden)) return;
      // Timestamps must always increase for the video tasks.
      const t = Math.max(performance.now(), lastTs + 1);
      lastTs = t;
      if (light && t - lastLightT > 500) {
        lastLightT = t;
        try { brightness = measureLight(); } catch (e) { brightness = null; }
      }
      let phone = null;
      if (m.objects && t - lastPhoneT > CFG.phoneEveryMs) {
        lastPhoneT = t;
        try {
          const r = m.objects.detectForVideo(video, t);
          phone = 0;
          for (const d of r.detections || []) {
            const c = d.categories && d.categories[0];
            if (c && c.score > phone) {
              phone = c.score;
              if (d.boundingBox) phoneBox = d.boundingBox;
            }
          }
          if (phone >= PHONE_SCORE) phoneSeenAt = t;
        } catch (e) { phone = null; }
      }
      let result;
      try { result = m.face.detectForVideo(video, t); } catch (e) { return; }
      const obs = observe(result, { t, brightness, phone, phoneBox: t - phoneSeenAt < 1500 ? phoneBox : null });
      lastObs = obs;
      lastLandmarks = result.faceLandmarks || [];
      if (mode === 'calibrate') {
        const c = monitor.calibrate(obs);
        if (o.onCalibrate) o.onCalibrate(c);
        if (c.done && calibWaiter) {
          const w = calibWaiter;
          calibWaiter = null;
          mode = 'idle';
          w({ ok: true });
        }
      }
      let status;
      if (mode === 'watch') {
        const out = monitor.update(obs);
        status = out.status;
        for (const ev of out.events) if (o.onEvent) o.onEvent(ev);
      } else {
        // Not watching yet (or paused): show what is seen, without counting anything.
        const g = monitor.calibrated ? monitor.gaze(obs) : null;
        status = { face: obs.faces ? 'ok' : 'warn', eyes: g === 'down' || g === 'side' ? 'warn' : 'ok', alone: obs.faces > 1 ? 'warn' : 'ok', phone: 'ok', gaze: g, faces: obs.faces };
      }
      lastStatus = status;
      draw(obs, status);
      if (o.onStatus) o.onStatus(status, obs);
    }

    function draw(obs, status) {
      if (!canvas) return;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const dpr = root.devicePixelRatio || 1;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      // The video is shown with object-fit: cover, so map landmark coordinates the same way.
      const vw = video.videoWidth || 640;
      const vh = video.videoHeight || 480;
      const scale = Math.max(w / vw, h / vh);
      const ox = (w - vw * scale) / 2;
      const oy = (h - vh * scale) / 2;
      const px = (p) => ox + p.x * vw * scale;
      const py = (p) => oy + p.y * vh * scale;
      const worst = [status.face, status.eyes, status.alone, status.phone].indexOf('bad') !== -1 ? 'bad'
        : [status.face, status.eyes, status.alone, status.phone].indexOf('warn') !== -1 ? 'warn' : 'ok';
      const col = COLORS[worst];
      (lastLandmarks || []).forEach((lm, i) => {
        const c = i === obs.main ? col : COLORS.bad;
        // Mesh: every 3rd point as a faint dot; the outline and irises brighter.
        ctx.fillStyle = c;
        ctx.globalAlpha = 0.35;
        for (let k = 0; k < 468; k += 3) ctx.fillRect(px(lm[k]) - 0.8, py(lm[k]) - 0.8, 1.6, 1.6);
        ctx.globalAlpha = 0.8;
        ctx.strokeStyle = c;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        OVAL.forEach((k, j) => (j ? ctx.lineTo(px(lm[k]), py(lm[k])) : ctx.moveTo(px(lm[k]), py(lm[k]))));
        ctx.stroke();
        if (lm.length > 477) {
          for (const [c0, edge] of [[468, 469], [473, 474]]) {
            const r = Math.hypot(px(lm[edge]) - px(lm[c0]), py(lm[edge]) - py(lm[c0])) || 3;
            ctx.beginPath();
            ctx.arc(px(lm[c0]), py(lm[c0]), r, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
        // Corner brackets around the face, like a camera's focus frame.
        const b = faceBox(lm);
        const x0 = px({ x: b.x }) - 8;
        const y0 = py({ y: b.y }) - 8;
        const x1 = px({ x: b.x + b.w }) + 8;
        const y1 = py({ y: b.y + b.h }) + 8;
        const L = Math.min(22, (x1 - x0) / 4);
        ctx.globalAlpha = 1;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(x0, y0 + L); ctx.lineTo(x0, y0); ctx.lineTo(x0 + L, y0);
        ctx.moveTo(x1 - L, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1, y0 + L);
        ctx.moveTo(x1, y1 - L); ctx.lineTo(x1, y1); ctx.lineTo(x1 - L, y1);
        ctx.moveTo(x0 + L, y1); ctx.lineTo(x0, y1); ctx.lineTo(x0, y1 - L);
        ctx.stroke();
      });
      if (obs.phoneBox) {
        const pb = obs.phoneBox;
        ctx.globalAlpha = 1;
        ctx.strokeStyle = COLORS.bad;
        ctx.lineWidth = 2.5;
        ctx.strokeRect(ox + pb.originX * scale, oy + pb.originY * scale, pb.width * scale, pb.height * scale);
      }
      ctx.globalAlpha = 1;
    }

    return {
      /** Load the models and start reading frames (drawing only, until calibrate/watch). */
      async start(onProgress) {
        m = await load(onProgress);
        if (!timer) timer = setInterval(frame, CFG.faceEveryMs);
        return true;
      },
      /** Resolves { ok: true } once calibrated, or { ok: false, problem } after timeoutMs. */
      calibrate(timeoutMs) {
        mode = 'calibrate';
        let worst = null;
        const prev = o.onCalibrate;
        return new Promise((resolve) => {
          const t = setTimeout(() => {
            calibWaiter = null;
            mode = 'idle';
            o.onCalibrate = prev;
            resolve({ ok: false, problem: worst || 'noFace' });
          }, timeoutMs || 9000);
          o.onCalibrate = (c) => {
            if (c.problem) worst = c.problem;
            if (prev) prev(c);
          };
          calibWaiter = (r) => {
            clearTimeout(t);
            o.onCalibrate = prev;
            resolve(r);
          };
        });
      },
      /** Turn the rules on (true) or off (false); drawing continues either way. */
      watch(on) { mode = on ? 'watch' : 'idle'; },
      get watching() { return mode === 'watch'; },
      get calibrated() { return monitor.calibrated; },
      get status() { return lastStatus; },
      get observation() { return lastObs; },
      stats: () => monitor.stats(),
      /** A JPEG of the current frame with the detections marked and a caption: evidence for a reviewer. */
      snapshot(caption) {
        return new Promise((resolve) => {
          try {
            const vw = video.videoWidth || 640;
            const vh = video.videoHeight || 480;
            const w = Math.min(480, vw);
            const h = Math.round((w * vh) / vw);
            const c = root.document.createElement('canvas');
            c.width = w;
            c.height = h;
            const ctx = c.getContext('2d');
            ctx.drawImage(video, 0, 0, w, h);
            ctx.lineWidth = 3;
            ctx.strokeStyle = COLORS.bad;
            for (const lm of lastLandmarks || []) {
              const b = faceBox(lm);
              ctx.strokeRect(b.x * w, b.y * h, b.w * w, b.h * h);
            }
            if (lastObs && lastObs.phoneBox) {
              const pb = lastObs.phoneBox;
              ctx.strokeRect((pb.originX / vw) * w, (pb.originY / vh) * h, (pb.width / vw) * w, (pb.height / vh) * h);
            }
            if (caption) {
              ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
              ctx.fillRect(0, h - 26, w, 26);
              ctx.fillStyle = '#fff';
              ctx.font = '600 14px system-ui, sans-serif';
              ctx.fillText(caption, 10, h - 9);
            }
            c.toBlob((blob) => resolve(blob), 'image/jpeg', 0.72);
          } catch (e) {
            resolve(null);
          }
        });
      },
      stop() {
        clearInterval(timer);
        timer = null;
        mode = 'idle';
        if (calibWaiter) calibWaiter({ ok: false, problem: 'stopped' });
        calibWaiter = null;
        if (canvas) {
          const ctx = canvas.getContext('2d');
          if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      },
    };
  }

  const api = { createProctor, createMonitor, observe, headPose, faceBox, load, supported, RULES, AWAY, MODEL_MB, VERSION, config: CFG };
  if (isNode) module.exports = api;
  (root.AII = root.AII || {}).Proctor = api;
})(typeof window !== 'undefined' ? window : globalThis);
