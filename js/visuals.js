/*
 * visuals.js — the "voice core": a living particle sphere drawn on <canvas class="core">.
 *
 *   data-core="call"      inside the call's #orb: follows the call state the app already sets
 *                         (orb[data-state] = speaking | listening | thinking | customer | idle,
 *                         and the --lvl voice level), so the app needs no extra hooks
 *   data-core="demo"      the home page: plays a short interview loop (speak → listen → score)
 *                         and writes the matching line into [data-core-readout]
 *   data-core="thinking"  the scoring screen
 *
 * Colour carries meaning: ember = the interviewer is on air, cyan = your microphone,
 * violet = scoring, red-pink = the mock-call customer. Pure Canvas 2D, no libraries;
 * pauses off-screen and in background tabs, and holds still for reduced motion.
 */
(function (root) {
  'use strict';
  const doc = root.document;
  if (!doc || !root.HTMLCanvasElement) return;

  const PALETTES = {
    idle: [[255, 122, 60], [143, 128, 255], [62, 230, 208]],
    speaking: [[255, 176, 102], [255, 106, 43], [255, 70, 30]],
    customer: [[255, 150, 170], [255, 77, 94], [255, 120, 60]],
    listening: [[154, 246, 234], [62, 230, 208], [70, 160, 255]],
    thinking: [[190, 150, 255], [143, 128, 255], [80, 110, 255]],
  };
  const reduceMotion = root.matchMedia ? root.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  const GOLDEN = Math.PI * (3 - Math.sqrt(5));

  function spherePoints(n) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const y = 1 - (i / (n - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const a = GOLDEN * i;
      pts.push({ x: Math.cos(a) * r, y, z: Math.sin(a) * r, seed: (i * 9301 + 49297) % 233280 / 233280 });
    }
    return pts;
  }

  const lerp = (a, b, t) => a + (b - a) * t;
  function mixPalette(cur, target, t) {
    for (let i = 0; i < 3; i++) for (let c = 0; c < 3; c++) cur[i][c] = lerp(cur[i][c], target[i][c], t);
  }
  function colorAt(pal, t) {
    // t in [0, 1] across the three stops
    const k = t < 0.5 ? t * 2 : (t - 0.5) * 2;
    const a = t < 0.5 ? pal[0] : pal[1];
    const b = t < 0.5 ? pal[1] : pal[2];
    return [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
  }

  /** A synthetic voice envelope for the demo: syllables with pauses between phrases. */
  function voiceLevel(t) {
    const syll = Math.max(0, Math.sin(t * 9.3) * 0.5 + Math.sin(t * 5.1 + 1.3) * 0.35 + 0.25);
    const phrase = Math.max(0, Math.sin(t * 1.15)) > 0.18 ? 1 : 0.15;
    return Math.min(1, syll * phrase * 1.1);
  }

  const DEMO = [
    { state: 'speaking', who: 'Tushar AI · on air', line: 'Tell me about a time you calmed down an angry customer.', ms: 4200 },
    { state: 'listening', who: 'You · mic live', line: 'Last month a customer was charged twice. I apologised, listened, and…', ms: 4600 },
    { state: 'thinking', who: 'Scoring', line: 'STAR structure ✓  Empathy ✓  2 fillers  ·  138 wpm', ms: 2400 },
    { state: 'speaking', who: 'Tushar AI · on air', line: 'Good example. What exactly did you say to calm them down?', ms: 4000 },
    { state: 'listening', who: 'You · mic live', line: 'I said: I completely understand, let me fix this for you right now.', ms: 4400 },
    { state: 'thinking', who: 'Scoring', line: 'Customer handling 86  ·  Confidence 79  ·  Recommended', ms: 2600 },
  ];

  class Core {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.mode = canvas.getAttribute('data-core') || 'demo';
      this.orb = this.mode === 'call' ? canvas.closest('.orb') : null;
      this.readout = this.mode === 'demo' ? (canvas.parentElement && canvas.parentElement.querySelector('[data-core-readout]')) : null;
      this.state = this.mode === 'thinking' ? 'thinking' : 'idle';
      this.palette = PALETTES[this.state].map((c) => c.slice());
      this.level = 0;
      this.energy = 0.2;
      this.spin = 0;
      this.tilt = { x: 0, y: 0, tx: 0, ty: 0 };
      this.visible = true;
      this.raf = 0;
      this.t0 = performance.now();
      this.last = this.t0;
      this.demoIdx = -1;
      this.demoUntil = 0;
      this.resize();
      if (root.ResizeObserver) new ResizeObserver(() => this.resize()).observe(canvas);
      else root.addEventListener('resize', () => this.resize());
      if (root.IntersectionObserver) {
        new IntersectionObserver((entries) => {
          this.visible = entries.some((e) => e.isIntersecting);
          this.kick();
        }).observe(canvas);
      }
      if (this.mode === 'demo') {
        const host = canvas.parentElement || canvas;
        host.addEventListener('pointermove', (e) => {
          const r = host.getBoundingClientRect();
          this.tilt.tx = ((e.clientY - r.top) / r.height - 0.5) * 0.6;
          this.tilt.ty = ((e.clientX - r.left) / r.width - 0.5) * 0.9;
        });
        host.addEventListener('pointerleave', () => { this.tilt.tx = 0; this.tilt.ty = 0; });
      }
      this.kick();
    }

    resize() {
      const r = this.canvas.getBoundingClientRect();
      const dpr = Math.min(root.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(r.width * dpr));
      const h = Math.max(1, Math.round(r.height * dpr));
      if (w !== this.canvas.width || h !== this.canvas.height) {
        this.canvas.width = w;
        this.canvas.height = h;
      }
      this.dpr = dpr;
      this.cssWidth = r.width;
      const n = r.width < 300 ? 620 : r.width < 460 ? 900 : 1150;
      if (!this.points || this.points.length !== n) this.points = spherePoints(n);
      if (reduceMotion.matches) this.draw(performance.now());
    }

    running() {
      return this.visible && !doc.hidden && this.canvas.isConnected && this.canvas.offsetParent !== null;
    }

    kick() {
      if (this.raf) return;
      const loop = (now) => {
        this.raf = 0;
        if (!this.running()) return; // resumed by visibility or intersection changes
        this.step(now);
        this.draw(now);
        if (reduceMotion.matches) return; // one still frame per change
        this.raf = root.requestAnimationFrame(loop);
      };
      this.raf = root.requestAnimationFrame(loop);
    }

    /** Read (or script) the state and voice level for this frame. */
    step(now) {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      const t = (now - this.t0) / 1000;
      let target = this.state;
      let lvl = 0;
      if (this.mode === 'call' && this.orb) {
        const s = this.orb.getAttribute('data-state') || 'idle';
        target = PALETTES[s] ? s : 'idle';
        lvl = parseFloat(this.orb.style.getPropertyValue('--lvl')) || 0;
      } else if (this.mode === 'demo') {
        if (now >= this.demoUntil) this.nextDemo(now);
        target = DEMO[this.demoIdx].state;
        lvl = target === 'thinking' ? 0.25 : voiceLevel(t + (target === 'listening' ? 7 : 0)) * (target === 'listening' ? 0.75 : 0.9);
      } else {
        target = 'thinking';
        lvl = 0.3 + 0.15 * Math.sin(t * 2.2);
      }
      if (target !== this.state) this.state = target;
      const still = reduceMotion.matches; // one still frame per change: jump straight to the new look
      mixPalette(this.palette, PALETTES[this.state], still ? 1 : Math.min(1, dt * 3.2));
      // Fast attack, slow release, like a VU meter.
      const k = still ? 1 : lvl > this.level ? Math.min(1, dt * 18) : Math.min(1, dt * 4);
      this.level = lerp(this.level, lvl, k);
      const energyTarget = this.state === 'thinking' ? 0.55 : this.state === 'idle' ? 0.22 : 0.3 + this.level * 0.9;
      this.energy = lerp(this.energy, energyTarget, still ? 1 : Math.min(1, dt * 3));
      this.spin += dt * (this.state === 'thinking' ? 1.15 : 0.22 + this.level * 0.35);
      this.tilt.x = lerp(this.tilt.x, this.tilt.tx, Math.min(1, dt * 3));
      this.tilt.y = lerp(this.tilt.y, this.tilt.ty, Math.min(1, dt * 3));
    }

    nextDemo(now) {
      this.demoIdx = (this.demoIdx + 1) % DEMO.length;
      const d = DEMO[this.demoIdx];
      this.demoUntil = now + d.ms;
      if (!this.readout) return;
      this.readout.setAttribute('data-state', d.state);
      const who = this.readout.querySelector('[data-core-who]');
      const line = this.readout.querySelector('[data-core-line]');
      if (who) who.textContent = d.who;
      if (line) this.typeLine(line, d.line, d.state === 'thinking' ? 0 : 18);
    }

    typeLine(el, text, msPerChar) {
      clearInterval(this.typer);
      if (!msPerChar || reduceMotion.matches) {
        el.textContent = text;
        return;
      }
      let i = 0;
      el.textContent = '';
      this.typer = setInterval(() => {
        i += 2;
        el.textContent = text.slice(0, i);
        if (i >= text.length) clearInterval(this.typer);
      }, msPerChar * 2);
    }

    draw(now) {
      const ctx = this.ctx;
      const W = this.canvas.width;
      const H = this.canvas.height;
      if (!ctx || W < 2) return;
      const t = (now - this.t0) / 1000;
      const cx = W / 2;
      const cy = H / 2;
      const R = Math.min(W, H) * 0.34 * (1 + this.level * 0.06);
      const pal = this.palette;
      const [r0, g0, b0] = colorAt(pal, 0.5);

      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';

      // Halo behind the sphere.
      const halo = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 1.65);
      const ha = 0.16 + this.energy * 0.22;
      halo.addColorStop(0, 'rgba(' + (r0 | 0) + ',' + (g0 | 0) + ',' + (b0 | 0) + ',' + ha.toFixed(3) + ')');
      halo.addColorStop(0.55, 'rgba(' + (r0 | 0) + ',' + (g0 | 0) + ',' + (b0 | 0) + ',' + (ha * 0.25).toFixed(3) + ')');
      halo.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, W, H);

      ctx.globalCompositeOperation = 'lighter';

      // Orbit rings.
      this.ring(ctx, cx, cy, R * 1.28, 0.32, t * 0.25 + this.spin * 0.2, pal[0], 0.22 + this.energy * 0.15);
      this.ring(ctx, cx, cy, R * 1.16, -0.55, -t * 0.18 - this.spin * 0.15, pal[2], 0.16 + this.energy * 0.12);

      // The particle sphere.
      const yaw = this.spin + this.tilt.y;
      const pitch = 0.42 + this.tilt.x + Math.sin(t * 0.3) * 0.06;
      const cyw = Math.cos(yaw);
      const syw = Math.sin(yaw);
      const cp = Math.cos(pitch);
      const sp = Math.sin(pitch);
      const amp = 0.035 + this.energy * 0.16;
      const listening = this.state === 'listening';
      const thinking = this.state === 'thinking';
      const dotBase = this.dpr * ((this.cssWidth || 400) < 320 ? 1.25 : 1.55);
      const pts = this.points;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        // Displace along the normal: a slow organic swell plus the voice.
        let d = Math.sin(p.x * 3.1 + t * 1.3) * Math.sin(p.y * 2.7 + t * 0.9) * Math.sin(p.z * 3.3 - t * 1.1);
        if (listening) d += Math.sin(p.y * 11 - t * 7) * this.level * 0.6;
        if (thinking) d += Math.sin((p.x + p.z) * 6 + t * 4) * 0.35;
        const s = 1 + d * amp + (p.seed - 0.5) * 0.02;
        let x = p.x * s;
        let y = p.y * s;
        let z = p.z * s;
        // rotate (yaw around y, then pitch around x)
        const x1 = x * cyw - z * syw;
        const z1 = x * syw + z * cyw;
        const y1 = y * cp - z1 * sp;
        const z2 = y * sp + z1 * cp;
        x = x1; y = y1; z = z2;
        const persp = 2.8 / (2.8 - z);
        const px = cx + x * R * persp;
        const py = cy + y * R * persp;
        const depth = (z + 1.2) / 2.4; // 0 back … 1 front
        const c = colorAt(pal, (p.y + 1) / 2);
        const alpha = 0.16 + depth * 0.84;
        const size = dotBase * (0.55 + depth * 1.05) * (1 + this.level * 0.35);
        ctx.fillStyle = 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + alpha.toFixed(3) + ')';
        ctx.fillRect(px - size / 2, py - size / 2, size, size);
      }

      // A bright core that breathes with the voice.
      const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * (0.5 + this.level * 0.25));
      core.addColorStop(0, 'rgba(255,255,255,' + (0.05 + this.level * 0.14).toFixed(3) + ')');
      core.addColorStop(0.4, 'rgba(' + (r0 | 0) + ',' + (g0 | 0) + ',' + (b0 | 0) + ',' + (0.05 + this.energy * 0.08).toFixed(3) + ')');
      core.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }

    ring(ctx, cx, cy, r, tiltAngle, rot, rgb, alpha) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(tiltAngle);
      ctx.scale(1, 0.28);
      ctx.strokeStyle = 'rgba(' + (rgb[0] | 0) + ',' + (rgb[1] | 0) + ',' + (rgb[2] | 0) + ',' + alpha.toFixed(3) + ')';
      ctx.lineWidth = Math.max(1, this.dpr) / 0.28 * 0.5;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
      // a satellite running along the ring
      const sx = Math.cos(rot) * r;
      const sy = Math.sin(rot) * r;
      ctx.fillStyle = 'rgba(' + (rgb[0] | 0) + ',' + (rgb[1] | 0) + ',' + (rgb[2] | 0) + ',' + Math.min(1, alpha * 3).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(1.5, this.dpr * 2.2) / 0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  const cores = [];
  function init() {
    doc.querySelectorAll('canvas.core[data-core]').forEach((c) => {
      if (c.__core) return;
      c.__core = new Core(c);
      cores.push(c.__core);
    });
    // Screens are shown and hidden by toggling [hidden]: wake any core that became visible.
    const wake = () => cores.forEach((core) => core.kick());
    new MutationObserver(wake).observe(doc.body, { subtree: true, attributes: true, attributeFilter: ['hidden', 'data-state'] });
    doc.addEventListener('visibilitychange', wake);
    if (reduceMotion.addEventListener) reduceMotion.addEventListener('change', wake);
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
  else init();

  (root.AII = root.AII || {}).Visuals = { cores };
})(typeof window !== 'undefined' ? window : globalThis);
