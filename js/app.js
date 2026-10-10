/*
 * app.js — the voice interview: setup → hands-free call → spoken feedback + scoresheet.
 *
 * The call is half-duplex, like a polite phone interview: Aria speaks, then the
 * microphone listens until the candidate has clearly finished (adaptive silence
 * detection or a spoken "that's all"), then Aria replies. Candidates can say
 * "repeat", "skip" or "that's all" at any time, so the screen never needs touching.
 */
(function () {
  'use strict';
  const AII = window.AII;
  const { Questions, Engine, Scoring, Speech, Audio, LLM, Report, Demo, Voice, Recorder } = AII;

  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ------------------------------------------------------------ storage (best effort)
  const store = {
    get(k, d) {
      try {
        const v = localStorage.getItem(k);
        return v == null ? d : JSON.parse(v);
      } catch (e) {
        return d;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(k, JSON.stringify(v));
        return true;
      } catch (e) {
        return false;
      }
    },
    del(k) {
      try { localStorage.removeItem(k); } catch (e) { /* ignore */ }
    },
  };
  const SETTINGS_KEY = 'aii.settings.v1';
  const HISTORY_KEY = 'aii.history.v1';
  const SHEET_PREFIX = 'aii.sheet.';
  const THEME_KEY = 'aii.theme';

  function guessAccent() {
    const langs = navigator.languages || [navigator.language || 'en-US'];
    for (const l of langs) {
      if (/^en-(IN|US|GB|PH|AU|ZA|NG)$/i.test(l)) return 'en-' + l.slice(3).toUpperCase();
      if (/-IN$/i.test(l) || /^(hi|ta|te|mr|bn|kn|ml|gu|pa)\b/i.test(l)) return 'en-IN';
      if (/^(fil|tl)\b/i.test(l)) return 'en-PH';
    }
    return 'en-US';
  }

  const DEFAULTS = {
    name: '', role: 'voice', experience: 'fresher', length: 'standard', accent: guessAccent(),
    silenceSec: 3, interviewerVoice: '', customerVoice: '', rate: 1, camera: false, record: true,
    captions: false, engine: 'auto', llmEnabled: false, llmUrl: LLM.DEFAULT_URL, llmModel: '',
  };
  let settings = Object.assign({}, DEFAULTS, store.get(SETTINGS_KEY, {}));
  if ([0, 2, 3, 5].indexOf(Number(settings.silenceSec)) === -1) settings.silenceSec = 3;

  const state = {
    session: null,
    meter: null,
    recorder: null,
    camStream: null,
    voices: { interviewer: null, customer: null },
    engine: 'browser',       // 'browser' | 'whisper' for the current call
    running: false,
    endRequested: false,
    discard: false,
    integrity: { tabSwitches: 0, pastes: 0, repeats: 0 },
    startedAt: 0,
    sheet: null,
    ctl: null,
    clips: [],
    clipUrls: [],
    elapsedTimer: null,
    skipLlm: false,
    ui: 'idle',             // 'speaking' | 'listening' | 'thinking' | 'idle'
    userAction: null,       // resolver while waiting on a notice button
  };

  // ------------------------------------------------------------ theme
  function applyTheme(t) {
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
  }
  applyTheme(store.get(THEME_KEY, 'auto'));
  $('#theme-toggle').addEventListener('click', () => {
    const order = ['auto', 'light', 'dark'];
    const cur = store.get(THEME_KEY, 'auto');
    const next = order[(order.indexOf(cur) + 1) % order.length];
    store.set(THEME_KEY, next);
    applyTheme(next);
    $('#theme-toggle').title = 'Theme: ' + next;
  });

  // ------------------------------------------------------------ screens
  const SCREENS = ['home', 'interview', 'processing', 'report'];
  function show(name) {
    for (const s of SCREENS) $('#screen-' + s).hidden = s !== name;
    document.body.classList.toggle('in-call', name === 'interview');
    window.scrollTo({ top: 0 });
  }
  $('#brand-home').addEventListener('click', (e) => {
    e.preventDefault();
    if (state.running && !confirm('Leave the interview? Your answers so far will be lost.')) return;
    abortInterview();
    stopFeedbackAudio();
    goHome();
  });

  function goHome() {
    document.title = 'AI Interviewer';
    show('home');
    renderHistory();
  }

  // ------------------------------------------------------------ speech engines
  const hasWhisper = () => !!(AII.Whisper && AII.Whisper.supported());

  /** Which recogniser to use for a setting, given what this browser can do. */
  function resolveEngine(pref) {
    if (pref === 'whisper' && hasWhisper()) return 'whisper';
    if (pref === 'browser' && Speech.sttSupported) return 'browser';
    if (Speech.sttSupported && !isBrave()) return 'browser';
    if (hasWhisper()) return 'whisper';
    return Speech.sttSupported ? 'browser' : null;
  }

  // Brave exposes webkitSpeechRecognition but blocks the service behind it.
  function isBrave() {
    return !!(navigator.brave && typeof navigator.brave.isBrave === 'function');
  }

  function engineStatusText() {
    if (!window.isSecureContext) return '⚠️ The microphone needs <strong>https</strong> or <strong>localhost</strong>. Run <kbd>npm start</kbd> and open http://localhost:8080.';
    if (!Speech.ttsSupported) return '⚠️ This browser cannot speak aloud. Please use Chrome, Edge or Safari.';
    const e = resolveEngine(settings.engine);
    if (e === 'browser') return '✅ <strong>Ready.</strong> Using your browser’s speech recognition (needs internet).';
    if (e === 'whisper') {
      const cached = AII.Whisper.isCached && AII.Whisper.isCached();
      return '✅ <strong>Ready.</strong> Using the free offline Whisper model' + (cached ? '.' : ', which downloads once (about ' + AII.Whisper.MODEL_MB + ' MB) when you start.');
    }
    return '⚠️ This browser has no speech recognition. Please use Chrome or Edge.';
  }

  function makeRecognizer(handlers) {
    if (state.engine === 'whisper') {
      return AII.Whisper.createRecognizer(Object.assign({ meter: state.meter, lang: settings.accent }, handlers));
    }
    return Speech.createRecognizer(Object.assign({ lang: settings.accent }, handlers));
  }

  // ------------------------------------------------------------ setup form
  const form = $('#setup-form');

  function fillSetup() {
    const roleSel = $('#f-role');
    roleSel.innerHTML = '';
    for (const [k, r] of Object.entries(Questions.ROLES)) roleSel.add(new Option(r.label, k));
    const lc = $('#length-cards');
    lc.innerHTML = '';
    for (const [k, p] of Object.entries(Questions.PLANS)) {
      const label = document.createElement('label');
      label.innerHTML = '<input type="radio" name="length" value="' + k + '"><span class="lc"><strong></strong><span></span></span>';
      label.querySelector('strong').textContent = p.label;
      label.querySelector('.lc > span').textContent = p.slots.length + ' questions · about ' + p.minutes + ' min';
      lc.appendChild(label);
    }
    $('#f-name').value = settings.name;
    roleSel.value = settings.role;
    $('#f-accent').value = settings.accent;
    $('#f-silence').value = String(settings.silenceSec);
    $('#f-rate').value = String(settings.rate);
    $('#rate-out').textContent = Number(settings.rate).toFixed(2).replace(/0$/, '') + '×';
    $('#f-record').checked = settings.record;
    $('#f-record').disabled = !window.MediaRecorder;
    $('#f-camera').checked = settings.camera;
    $('#f-engine').value = settings.engine;
    $$('#f-engine option').forEach((o) => {
      if (o.value === 'whisper') o.disabled = !hasWhisper();
      if (o.value === 'browser') o.disabled = !Speech.sttSupported;
    });
    $('#f-llm').checked = settings.llmEnabled;
    $('#f-llm-url').value = settings.llmUrl;
    for (const name of ['experience', 'length']) {
      const el = form.querySelector('input[name="' + name + '"][value="' + settings[name] + '"]');
      if (el) el.checked = true;
    }
    if (settings.llmModel) {
      const sel = $('#f-llm-model');
      sel.innerHTML = '';
      sel.add(new Option(settings.llmModel, settings.llmModel));
    }
    $('#engine-status').innerHTML = engineStatusText();
    toggleLlmFields();
  }

  function readSetup() {
    const fd = new FormData(form);
    settings = Object.assign({}, settings, {
      name: String(fd.get('name') || '').trim().slice(0, 60),
      role: fd.get('role') || 'voice',
      experience: fd.get('experience') || 'fresher',
      length: fd.get('length') || 'standard',
      accent: fd.get('accent') || 'en-US',
      silenceSec: Number(fd.get('silenceSec') == null ? 3 : fd.get('silenceSec')),
      interviewerVoice: fd.get('interviewerVoice') || '',
      customerVoice: fd.get('customerVoice') || '',
      rate: Number(fd.get('rate') || 1),
      record: $('#f-record').checked,
      camera: $('#f-camera').checked,
      engine: fd.get('engine') || 'auto',
      llmEnabled: $('#f-llm').checked,
      llmUrl: String(fd.get('llmUrl') || LLM.DEFAULT_URL).trim(),
      llmModel: fd.get('llmModel') || '',
    });
    store.set(SETTINGS_KEY, settings);
    $('#engine-status').innerHTML = engineStatusText();
  }

  function toggleLlmFields() {
    $$('[data-llm]').forEach((el) => { el.hidden = !$('#f-llm').checked; });
  }

  form.addEventListener('change', (e) => {
    if (e.target.id === 'f-llm') toggleLlmFields();
    if (e.target.id === 'f-accent') populateVoices();
    readSetup();
  });
  $('#f-rate').addEventListener('input', (e) => {
    $('#rate-out').textContent = Number(e.target.value).toFixed(2).replace(/0$/, '') + '×';
  });

  async function populateVoices() {
    await Speech.loadVoices();
    const voices = Speech.englishVoices();
    const picks = Speech.pickVoices({ accent: settings.accent });
    for (const [id, key, auto] of [['#f-ivoice', 'interviewerVoice', picks.interviewer], ['#f-cvoice', 'customerVoice', picks.customer]]) {
      const sel = $(id);
      sel.innerHTML = '';
      sel.add(new Option('Automatic' + (auto ? ' (' + auto.name + ')' : ''), ''));
      for (const v of voices) sel.add(new Option(v.name + ' — ' + v.lang, v.name));
      sel.value = voices.some((v) => v.name === settings[key]) ? settings[key] : '';
    }
  }

  $('#llm-test').addEventListener('click', async () => {
    const st = $('#llm-status');
    st.className = 'status-line';
    st.textContent = 'Connecting…';
    const res = await LLM.status($('#f-llm-url').value || LLM.DEFAULT_URL);
    const sel = $('#f-llm-model');
    if (!res.ok) {
      st.className = 'status-line err';
      st.textContent = 'Could not reach Ollama (' + res.error + '). Is it running? If this page is not on localhost, start Ollama with OLLAMA_ORIGINS set to this site.';
      return;
    }
    if (!res.models.length) {
      st.className = 'status-line err';
      st.textContent = 'Ollama is running but has no models. Run: ollama pull llama3.2';
      return;
    }
    sel.innerHTML = '';
    for (const m of res.models) sel.add(new Option(m, m));
    if (res.models.includes(settings.llmModel)) sel.value = settings.llmModel;
    st.className = 'status-line ok';
    st.textContent = 'Connected. ' + res.models.length + ' model(s) available.';
    readSetup();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    readSetup();
    const note = $('#setup-note');
    if (!settings.name) {
      $('#f-name').focus();
      note.textContent = 'Please enter your name. Aria will use it, and it goes on your scoresheet.';
      return;
    }
    if (settings.llmEnabled && !settings.llmModel) {
      note.textContent = 'Local AI is on: press "Test" to pick a model, or turn it off.';
      $('details.advanced').open = true;
      return;
    }
    if (!resolveEngine(settings.engine)) {
      note.textContent = 'This browser cannot recognise speech. Please open this page in Chrome or Edge.';
      return;
    }
    note.textContent = '';
    // Must run inside the click: unlocks speech output and audio processing on strict browsers.
    Speech.unlock();
    Audio.prime();
    startCall();
  });

  // ------------------------------------------------------------ history
  function renderHistory() {
    const list = store.get(HISTORY_KEY, []);
    $('#history-card').hidden = !list.length;
    const ul = $('#history-list');
    ul.innerHTML = '';
    for (const h of list) {
      const li = document.createElement('li');
      li.innerHTML = '<span class="history-score"></span><span class="history-meta"><strong></strong><br><span class="muted small"></span></span>' +
        '<span class="history-actions"><button class="btn" type="button" data-act="view">View</button><button class="btn btn-ghost btn-danger" type="button" data-act="del" aria-label="Delete">✕</button></span>';
      li.querySelector('.history-score').textContent = h.overall;
      li.querySelector('strong').textContent = h.name + ' — ' + h.verdict;
      li.querySelector('.muted').textContent = h.role + ' · ' + new Date(h.createdAt).toLocaleString();
      li.querySelector('[data-act="view"]').addEventListener('click', async () => {
        const sheet = store.get(SHEET_PREFIX + h.id, null);
        if (!sheet) return alert('This scoresheet is no longer stored.');
        const clips = await Recorder.loadClips(sheet.id);
        showReport(sheet, { clips });
      });
      li.querySelector('[data-act="del"]').addEventListener('click', () => {
        store.del(SHEET_PREFIX + h.id);
        Recorder.deleteClips(h.id);
        store.set(HISTORY_KEY, store.get(HISTORY_KEY, []).filter((x) => x.id !== h.id));
        renderHistory();
      });
      ul.appendChild(li);
    }
  }
  $('#history-clear').addEventListener('click', () => {
    if (!confirm('Delete all saved scoresheets and recordings from this browser?')) return;
    for (const h of store.get(HISTORY_KEY, [])) store.del(SHEET_PREFIX + h.id);
    store.del(HISTORY_KEY);
    Recorder.clearClips();
    renderHistory();
  });

  function saveSheet(sheet, clips) {
    const list = store.get(HISTORY_KEY, []).filter((x) => x.id !== sheet.id);
    list.unshift({ id: sheet.id, name: sheet.candidate.name, role: sheet.role.label, overall: sheet.overall, verdict: sheet.verdict.label, createdAt: sheet.createdAt });
    while (list.length > 12) {
      const old = list.pop();
      store.del(SHEET_PREFIX + old.id);
      Recorder.deleteClips(old.id);
    }
    if (store.set(SHEET_PREFIX + sheet.id, sheet)) store.set(HISTORY_KEY, list);
    if (clips && clips.length) Recorder.saveClips(sheet.id, clips);
  }

  // ------------------------------------------------------------ media
  async function ensureMic() {
    if (state.meter && state.meter.running) return { ok: true };
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return { ok: false, message: 'This browser cannot use the microphone on this page. Open it in Chrome or Edge on https or http://localhost.' };
    }
    try {
      state.meter = Audio.createMeter();
      await state.meter.start();
      return { ok: true };
    } catch (err) {
      state.meter = null;
      const denied = err && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
      return {
        ok: false,
        denied,
        message: denied
          ? 'Microphone access is blocked. Click the 🔒 or 🎤 icon in the address bar, allow the microphone, then press Try again.'
          : 'No working microphone was found (' + ((err && (err.name || err.message)) || 'unknown') + '). Plug one in or check your system settings, then press Try again.',
      };
    }
  }

  async function startCamera() {
    try {
      state.camStream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' } });
      const v = $('#cam');
      v.srcObject = state.camStream;
      v.hidden = false;
    } catch (e) {
      $('#cam').hidden = true;
    }
  }

  function stopMedia() {
    if (state.camStream) state.camStream.getTracks().forEach((t) => t.stop());
    state.camStream = null;
    $('#cam').hidden = true;
    if (state.recorder) state.recorder.discard();
    state.recorder = null;
    if (state.meter) state.meter.stop();
    state.meter = null;
  }

  // ------------------------------------------------------------ call UI
  const STATE_TEXT = { idle: 'Connecting…', speaking: 'Aria is speaking…', listening: 'Listening… go ahead', thinking: 'One moment…' };

  function setUi(mode, text) {
    state.ui = mode;
    const orb = $('#orb');
    orb.dataset.state = mode === 'speaking' && $('#avatar').classList.contains('customer') ? 'customer' : mode;
    const st = $('#state-pill');
    st.dataset.state = mode;
    st.textContent = text || STATE_TEXT[mode] || '';
  }

  function setPersona(who) {
    $('#avatar').classList.toggle('customer', who === 'customer');
    $('#who-label').textContent = who === 'customer' ? 'Customer · mock call' : 'Aria · AI Interviewer';
    $('#cap-who').textContent = who === 'customer' ? 'Customer' : 'Aria';
  }

  function setButtons(listening, canRepeat) {
    $('#btn-done').disabled = !listening;
    $('#btn-skip').disabled = !listening;
    $('#btn-repeat').disabled = !listening || canRepeat === false;
  }

  function setTimer(fraction) {
    const f = Math.max(0, Math.min(1, fraction));
    $('#ring-fill').style.strokeDashoffset = String(653.5 * (1 - f));
    $('#orb').classList.toggle('low', f < 0.2);
  }

  function renderDots(step) {
    const dots = $('#dots');
    if (dots.children.length !== step.total) {
      dots.innerHTML = '';
      for (let i = 0; i < step.total; i++) dots.appendChild(document.createElement('i'));
    }
    Array.from(dots.children).forEach((d, i) => {
      d.className = i < step.index ? 'done' : i === step.index ? 'now' : '';
    });
    $('#room-q').textContent = 'Question ' + (step.index + 1) + ' of ' + step.total + ' · ' + step.stageLabel;
    $('#roleplay-banner').hidden = step.kind !== 'roleplay';
  }

  function setCaptions(on) {
    settings.captions = on;
    store.set(SETTINGS_KEY, settings);
    $('#captions').hidden = !on;
    $('#btn-cc').setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  $('#btn-cc').addEventListener('click', () => setCaptions(!settings.captions));

  function notice(msg, withActions) {
    const n = $('#notice');
    n.textContent = msg || '';
    n.hidden = !msg;
    $('#notice-actions').hidden = !withActions;
  }

  /** Wait for "Try again" (true) or "Continue anyway" (false). */
  function waitForUser(message) {
    notice(message, true);
    return new Promise((resolve) => {
      state.userAction = (v) => {
        state.userAction = null;
        notice('');
        resolve(v);
      };
    });
  }
  $('#btn-retry-mic').addEventListener('click', () => state.userAction && state.userAction(true));
  $('#btn-continue-anyway').addEventListener('click', () => state.userAction && state.userAction(false));

  function startElapsed() {
    clearInterval(state.elapsedTimer);
    state.elapsedTimer = setInterval(() => {
      const s = Math.floor((Date.now() - state.startedAt) / 1000);
      $('#room-elapsed').textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    }, 1000);
  }

  // Captions: Aria's words (with the current word highlighted) and the candidate's live words.
  function captionWords(text) {
    const cap = $('#caption');
    cap.innerHTML = '';
    const re = /\S+\s*/g;
    let m;
    while ((m = re.exec(text))) {
      const span = document.createElement('span');
      span.textContent = m[0];
      span.dataset.at = String(m.index);
      cap.appendChild(span);
    }
  }
  function captionPlain(text, note) {
    const cap = $('#caption');
    cap.textContent = text;
    if (note) {
      const n = document.createElement('em');
      n.textContent = ' ' + note;
      cap.appendChild(n);
    }
  }
  function highlightWordAt(charIndex) {
    let current = null;
    for (const span of $('#caption').children) {
      if (span.dataset.at == null) continue;
      if (Number(span.dataset.at) <= charIndex) current = span;
      span.classList.remove('w-now');
    }
    if (current) current.classList.add('w-now');
  }
  function renderYou(fin, interim) {
    const live = $('#live');
    live.textContent = fin ? fin + ' ' : '';
    if (interim) {
      const s = document.createElement('span');
      s.className = 'interim';
      s.textContent = interim;
      live.appendChild(s);
    }
    if (!fin && !interim) live.textContent = '…';
  }

  // The orb breathes with whoever is talking: Aria's speech or the candidate's mic level.
  let orbRaf = 0;
  let orbLvl = 0;
  let mouthLevel = 0;
  let speakingSince = 0;
  let lastBoundary = 0;
  function orbLoop() {
    const now = performance.now();
    if (speakingSince && now - lastBoundary > 420) mouthLevel = Math.max(mouthLevel, 0.3 + 0.4 * Math.abs(Math.sin(now / 95)));
    mouthLevel *= 0.85;
    const target = state.ui === 'speaking' ? mouthLevel : state.ui === 'listening' && state.meter ? state.meter.level : 0;
    orbLvl += (target - orbLvl) * 0.3;
    $('#orb').style.setProperty('--lvl', orbLvl.toFixed(3));
    $('#av-mouth').style.transform = 'scaleY(' + (1 + (state.ui === 'speaking' ? mouthLevel : 0) * 2.6).toFixed(2) + ')';
    orbRaf = $('#screen-interview').hidden ? 0 : requestAnimationFrame(orbLoop);
  }
  function startOrb() {
    if (!orbRaf) orbRaf = requestAnimationFrame(orbLoop);
  }

  // ------------------------------------------------------------ speaking
  /**
   * Speak { text, voice } segments. opts.hideText marks the spoken-only listening test:
   * its details are never shown in captions.
   */
  async function say(segments, opts) {
    const o = opts || {};
    if (!o.keepYou) $('#live').textContent = '';
    for (const seg of segments) {
      if (state.endRequested && !o.force) break;
      setPersona(seg.voice);
      const hidden = o.hideText && seg.text === o.hiddenText;
      if (hidden && Speech.ttsSupported) captionPlain(o.display || 'Listen carefully…', '(spoken only)');
      else captionWords(seg.text);
      setUi('speaking', seg.voice === 'customer' ? 'The customer is speaking…' : 'Aria is speaking…');
      speakingSince = performance.now();
      lastBoundary = 0;
      const voice = seg.voice === 'customer' ? state.voices.customer : state.voices.interviewer;
      await Speech.speak(seg.text, {
        voice,
        rate: seg.voice === 'customer' ? Math.min(1.3, settings.rate * 1.05) : settings.rate,
        pitch: seg.voice === 'customer' ? 0.95 : 1.02,
        muted: !Speech.ttsSupported,
        mutedDelayMs: Math.max(1500, seg.text.split(/\s+/).length * 280),
        onBoundary: (i) => {
          lastBoundary = performance.now();
          mouthLevel = 1;
          if (!hidden) highlightWordAt(i);
        },
      });
      speakingSince = 0;
      highlightWordAt(-1);
      if (segments.length > 1) await sleep(220);
    }
  }

  async function pickVoices() {
    await Speech.loadVoices();
    state.voices = Speech.pickVoices({ accent: settings.accent, interviewerVoice: settings.interviewerVoice, customerVoice: settings.customerVoice });
  }

  // ------------------------------------------------------------ listening (hands-free)
  function stepQuestion(step) {
    return step && Questions.byId[step.questionId];
  }

  /**
   * Listen to one answer, hands-free. Resolves with the answer for the engine:
   * { text, mode, timing, audio, events, clip }.
   */
  function listenTurn(step) {
    return new Promise((resolve) => {
      const q = stepQuestion(step);
      const ctl = { done: false, busy: false, repeats: 0, nudges: 0 };
      state.ctl = ctl;
      const maxMs = (step.maxSeconds || 120) * 1000;
      const idealWords = q && q.ideal ? q.ideal[0] : null;
      let t0 = performance.now();
      let rec = null;
      let timer = null;
      let lastText = '';
      let lastTextAt = performance.now();
      let fatal = null;

      function begin() {
        lastText = '';
        lastTextAt = performance.now();
        renderYou('', '');
        rec = makeRecognizer({
          onUpdate: (fin, interim) => {
            renderYou(fin, interim);
            const t = (fin + ' ' + interim).trim();
            if (t !== lastText) {
              lastText = t;
              lastTextAt = performance.now();
            }
            if (Voice.wordCount(t) >= 3) $('#btn-repeat').disabled = true;
          },
          onError: (code, message, isFatal) => {
            if (isFatal && !ctl.done) fatal = { code, message };
          },
          onStatus: (text) => setUi(state.ui, text),
        });
        if (state.meter) state.meter.beginSegment();
        if (state.recorder) state.recorder.start();
        rec.start();
        setUi('listening', step.kind === 'roleplay' ? 'Your turn: talk to the customer' : 'Listening… go ahead');
        setButtons(true, true);
        timer = setInterval(tick, 150);
      }

      function pauseListening() {
        clearInterval(timer);
        if (rec) rec.pause();
        if (state.meter) state.meter.pauseSegment();
        if (state.recorder) state.recorder.pause();
      }
      function resumeListening() {
        if (state.meter) state.meter.resumeSegment();
        if (state.recorder) state.recorder.resume();
        if (rec) rec.resume();
        setUi('listening', step.kind === 'roleplay' ? 'Your turn: talk to the customer' : 'Listening… go ahead');
        timer = setInterval(tick, 150);
      }

      async function tick() {
        if (ctl.done || ctl.busy) return;
        if (fatal) return onFatal();
        const now = performance.now();
        const elapsed = now - t0;
        setTimer(1 - elapsed / maxMs);
        const text = rec ? (rec.text() + ' ' + rec.interim()).trim() : '';
        const live = rec && rec.live !== false;
        const words = live ? Voice.wordCount(text) : null;
        const spokeMs = state.meter ? state.meter.segmentVoicedMs() : null;

        // Spoken commands — act once the words have settled for a moment.
        if (live && text && now - lastTextAt > 700) {
          const cmd = Voice.parseCommand(text);
          if (cmd.command === 'repeat' && ctl.repeats < 3) return repeat();
          if (cmd.command === 'skip') return finish({ skipped: true, command: 'skip' });
          if (cmd.command === 'done' && now - lastTextAt > 900) return finish({ command: 'done' });
        }

        const started = (words != null && words >= 2) || (spokeMs != null && spokeMs >= 1200);
        if (!started) {
          const idle = Voice.idleAction({ elapsedMs: elapsed, maxMs, nudgesGiven: ctl.nudges });
          if (idle.action !== 'none') return idleNudge(idle);
        } else if (settings.silenceSec > 0) {
          const eot = Voice.endOfTurn({
            words,
            spokeMs,
            sinceVoiceMs: state.meter ? state.meter.msSinceVoice() : null,
            sinceResultMs: live && rec.lastResultAt ? now - rec.lastResultAt : null,
            patienceMs: settings.silenceSec * 1000,
            idealWords,
            roleplay: step.kind === 'roleplay',
          });
          if (eot.end) return finish({ auto: true });
        }
        if (elapsed >= maxMs) return finish({ timedOut: true });
      }

      async function idleNudge(idle) {
        ctl.busy = true;
        ctl.nudges++;
        pauseListening();
        await say([{ text: idle.say, voice: 'interviewer' }]);
        if (ctl.done) return;
        ctl.busy = false;
        if (idle.action === 'give-up') return finish({ skipped: true, timedOut: true });
        captionWords(step.prompt);
        resumeListening();
      }

      async function repeat() {
        if (ctl.done || ctl.busy) return;
        ctl.busy = true;
        ctl.repeats++;
        state.integrity.repeats++;
        clearInterval(timer);
        if (rec) rec.abort();
        rec = null;
        if (state.meter) state.meter.endSegment();
        if (state.recorder) state.recorder.discard();
        setButtons(false);
        const again = state.session.repeatSpeak();
        await say(again, { hideText: step.hideText, hiddenText: q && q.text, display: step.prompt });
        if (ctl.done) return;
        t0 = performance.now();
        ctl.nudges = 0;
        ctl.busy = false;
        begin();
      }
      ctl.repeat = repeat;

      async function onFatal() {
        const f = fatal;
        fatal = null;
        ctl.busy = true;
        clearInterval(timer);
        if (rec) rec.abort();
        rec = null;
        if (state.meter) state.meter.endSegment();
        if (state.recorder) state.recorder.discard();
        // The browser's recogniser is unavailable (blocked, offline, Brave…): switch to offline Whisper.
        if (state.engine === 'browser' && hasWhisper() && f.code !== 'not-allowed' && f.code !== 'audio-capture') {
          state.engine = 'whisper';
          setUi('thinking', 'Switching to the offline speech engine…');
          await say([{ text: 'One moment, I am switching to my offline listening mode.', voice: 'interviewer' }]);
          const ok = await AII.Whisper.preload((p) => setUi('thinking', 'Downloading the offline speech model… ' + Math.round(p * 100) + '%'));
          if (ok) {
            await say([{ text: 'Thanks for waiting. Please give your answer again.', voice: 'interviewer' }]);
            t0 = performance.now();
            ctl.busy = false;
            return begin();
          }
        }
        setUi('idle', 'Microphone problem');
        const retry = await waitForUser(f.message + ' Press Try again when ready, or Continue anyway to skip this question.');
        if (ctl.done) return;
        if (retry) {
          if (!state.meter || !state.meter.running) await ensureMic();
          if (state.meter && state.meter.stream && Recorder && settings.record && !state.recorder) state.recorder = Recorder.createRecorder(state.meter.stream);
          t0 = performance.now();
          ctl.busy = false;
          return begin();
        }
        ctl.busy = false;
        finish({ skipped: true });
      }

      async function finish(x) {
        if (ctl.done) return;
        ctl.done = true;
        clearInterval(timer);
        setButtons(false);
        setUi('thinking', state.engine === 'whisper' && !x.skipped ? 'Transcribing your answer…' : 'One moment…');
        let text = '';
        if (rec) {
          if (x.skipped) rec.abort();
          else text = (await rec.stop()) || rec.interim() || '';
        }
        const audio = state.meter ? state.meter.endSegment() : null;
        const clip = state.recorder && !x.skipped ? await state.recorder.stop() : (state.recorder && state.recorder.discard(), null);

        // Commands that only show up in the final transcript (e.g. the offline engine).
        let skipped = !!x.skipped;
        const cmd = Voice.parseCommand(text);
        if (!x.command && !skipped && cmd.command === 'repeat' && ctl.repeats < 3) {
          ctl.done = false;
          rec = null;
          return repeat();
        }
        if (!x.command && cmd.command === 'skip') skipped = true;
        if (cmd.command === 'done') text = cmd.text;

        const totalMs = performance.now() - t0;
        const first = rec && rec.firstResultAt;
        const lastRes = rec && rec.lastResultAt;
        const onset = audio && audio.onsetMs != null ? audio.onsetMs : first ? first - t0 - 500 : null;
        const recSpan = first && lastRes ? lastRes - first + 800 : 0;
        const speakingMs = Math.max(audio && audio.speakingMs ? audio.speakingMs : 0, recSpan);
        resolve({
          text: skipped ? '' : text,
          mode: 'voice',
          timing: { latencyMs: onset != null ? Math.max(0, onset) : null, speakingMs, totalMs },
          audio,
          clip,
          events: { repeats: ctl.repeats, skipped: skipped || !text.trim(), pasted: false, timedOut: !!x.timedOut },
        });
      }
      ctl.finish = finish;

      begin();
    });
  }

  $('#btn-done').addEventListener('click', () => state.ctl && state.ctl.finish && state.ctl.finish({ command: 'button' }));
  $('#btn-skip').addEventListener('click', () => state.ctl && state.ctl.finish && state.ctl.finish({ skipped: true, command: 'button' }));
  $('#btn-repeat').addEventListener('click', () => state.ctl && state.ctl.repeat && state.ctl.repeat());
  document.addEventListener('keydown', (e) => {
    if ($('#screen-interview').hidden) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
    if (e.key === 'c' || e.key === 'C') return setCaptions(!settings.captions);
    if (!state.ctl || state.ctl.done) return;
    if (e.key === 'Enter' && tag !== 'button' && !$('#btn-done').disabled) {
      e.preventDefault();
      state.ctl.finish({ command: 'button' });
    } else if ((e.key === 'r' || e.key === 'R') && !$('#btn-repeat').disabled) {
      state.ctl.repeat();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (state.running && document.hidden) state.integrity.tabSwitches++;
  });

  $('#btn-end').addEventListener('click', () => {
    if (!state.running) return;
    if (!confirm('End the interview now? You will get a scoresheet for the questions answered so far.')) return;
    state.endRequested = true;
    Speech.cancel();
    if (state.userAction) state.userAction(false);
    if (state.ctl && !state.ctl.done && state.ctl.finish) state.ctl.finish({ command: 'end' });
  });

  function abortInterview() {
    state.endRequested = true;
    state.running = false;
    state.discard = true;
    Speech.cancel();
    if (state.userAction) state.userAction(false);
    if (state.ctl && !state.ctl.done && state.ctl.finish) state.ctl.finish({ skipped: true });
    clearInterval(state.elapsedTimer);
    stopMedia();
  }

  // ------------------------------------------------------------ mic check
  /** Ask the candidate to say "I'm ready" and confirm we can hear (and understand) them. */
  async function micCheck() {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (state.endRequested) return false;
      const prompt = attempt === 0
        ? "Before we begin, let's check your microphone. Please say: I'm ready."
        : "I couldn't hear you. Please check your microphone isn't muted, then say: I'm ready.";
      await say([{ text: prompt, voice: 'interviewer' }]);
      await sleep(250);
      const heard = await listenBrief(9000);
      if (heard.ok) return true;
      if (heard.fatal) {
        if (state.engine === 'browser' && hasWhisper() && heard.code !== 'not-allowed' && heard.code !== 'audio-capture') {
          state.engine = 'whisper';
          const ok = await prepareWhisper();
          if (ok) continue;
        }
        const retry = await waitForUser(heard.message + ' Press Try again when ready.');
        if (!retry) return true;
        if (!state.meter || !state.meter.running) await ensureMic();
        attempt = -1; // start over
      } else if (attempt === 1) {
        const retry = await waitForUser('Aria can’t hear you yet. Check that the right microphone is selected and not muted (headset switch, system settings), then press Try again.');
        if (!retry) return true;
        attempt = -1;
      }
    }
    return true;
  }

  /** Listen briefly for any speech. Resolves { ok } or { fatal, code, message }. */
  function listenBrief(ms) {
    return new Promise((resolve) => {
      let done = false;
      setUi('listening', 'Say: “I’m ready”');
      renderYou('', '');
      if (state.meter) state.meter.beginSegment();
      const finishWith = (r) => {
        if (done) return;
        done = true;
        clearInterval(timer);
        if (rec) rec.abort();
        if (state.meter) state.meter.endSegment();
        resolve(r);
      };
      const rec = makeRecognizer({
        onUpdate: (fin, interim) => {
          renderYou(fin, interim);
          if (Voice.wordCount(fin + ' ' + interim) >= 1) finishWith({ ok: true });
        },
        onError: (code, message, fatal) => {
          if (fatal) finishWith({ fatal: true, code, message });
        },
      });
      const t0 = performance.now();
      const timer = setInterval(() => {
        // The offline engine has no live words: a second of voice is proof enough.
        if (rec && rec.live === false && state.meter && state.meter.segmentVoicedMs() >= 900) return finishWith({ ok: true });
        if (performance.now() - t0 > ms) finishWith({ ok: false });
      }, 150);
      rec.start();
    });
  }

  async function prepareWhisper() {
    setUi('thinking', 'Preparing the offline speech engine…');
    if (!(AII.Whisper.isCached && AII.Whisper.isCached())) {
      await say([{ text: 'Give me a moment while I get my offline listening ready. This only happens the first time.', voice: 'interviewer' }]);
    }
    const ok = await AII.Whisper.preload((p) => setUi('thinking', 'Downloading the offline speech model… ' + Math.round(p * 100) + '%'));
    if (!ok) {
      notice('The offline speech model could not be downloaded. Check your internet connection, or open this page in Chrome or Edge.');
    }
    return ok;
  }

  // ------------------------------------------------------------ the call
  async function startCall() {
    state.session = Engine.createSession({
      length: settings.length,
      role: settings.role,
      experience: settings.experience,
      mode: 'voice',
      name: settings.name,
      interviewerName: 'Aria',
      seed: (Math.random() * 2147483647) | 0,
    });
    state.integrity = { tabSwitches: 0, pastes: 0, repeats: 0 };
    state.endRequested = false;
    state.discard = false;
    state.running = true;
    state.clips = [];
    state.engine = resolveEngine(settings.engine);
    state.startedAt = Date.now();
    notice('');
    show('interview');
    setCaptions(settings.captions || !Speech.ttsSupported);
    setButtons(false);
    setPersona('interviewer');
    setTimer(1);
    $('#room-q').textContent = 'Connecting…';
    $('#dots').innerHTML = '';
    $('#roleplay-banner').hidden = true;
    captionWords('');
    renderYou('', '');
    setUi('idle', 'Connecting…');
    startOrb();
    startElapsed();

    // Microphone first: without it there is no interview.
    let mic = await ensureMic();
    while (!mic.ok && !state.discard) {
      setUi('idle', 'Microphone needed');
      const retry = await waitForUser(mic.message);
      if (!retry) return endWithoutAnswers('The interview needs a working microphone. Please allow it and try again.');
      mic = await ensureMic();
    }
    if (state.discard) return;
    if (settings.record && Recorder && state.meter && state.meter.stream) state.recorder = Recorder.createRecorder(state.meter.stream);
    if (settings.camera) startCamera();
    await pickVoices();
    if (state.engine === 'whisper' && !(await prepareWhisper())) {
      if (!Speech.sttSupported) return endWithoutAnswers('The offline speech model could not be downloaded. Check your internet connection and try again, or use Chrome or Edge.');
      state.engine = 'browser';
    }

    const session = state.session;
    const first = String(settings.name).trim().split(/\s+/)[0];
    await say([{ text: 'Hi ' + first + "! I'm Aria, and I'll be interviewing you today. You can just talk to me normally, no buttons needed.", voice: 'interviewer' }]);
    await micCheck();
    if (state.discard) return;
    if (!state.endRequested) {
      await say([{ text: 'Perfect, I can hear you clearly. ' + session.briefing(), voice: 'interviewer' }]);
    }

    let step = session.current();
    while (step && !state.endRequested) {
      renderDots(step);
      const q = stepQuestion(step);
      await say(step.speak, { hideText: step.hideText, hiddenText: q && q.text, display: step.prompt });
      if (state.endRequested) break;
      // Some engines report the end of speech a moment before the audio has fully played.
      await sleep(250);
      if (step.hideText) captionPlain(step.prompt);
      else captionWords(step.prompt);
      setPersona(step.kind === 'roleplay' ? 'customer' : 'interviewer');
      const answer = await listenTurn(step);
      if (state.discard) return;
      if (answer.clip) {
        state.clips.push({
          qid: step.questionId,
          kind: step.kind === 'followup' ? 'followup' : step.kind === 'roleplay' ? 'turn' : 'main',
          index: step.kind === 'roleplay' ? step.turn : 0,
          blob: answer.clip.blob,
          mimeType: answer.clip.mimeType,
          durationMs: answer.clip.durationMs,
        });
      }
      const res = session.submit(answer);
      if (res.done) {
        $('#dots').lastChild && ($('#dots').lastChild.className = 'done');
        await say(res.speak, { force: true });
        break;
      }
      step = res.step;
    }
    if (state.discard) return;
    if (state.endRequested && !session.finished) {
      session.endEarly();
      await say([{ text: "Alright, we'll stop here. Thank you for your time. I'm preparing your scoresheet now.", voice: 'interviewer' }], { force: true });
    }
    state.running = false;
    clearInterval(state.elapsedTimer);
    await finishInterview();
  }

  function endWithoutAnswers(message) {
    state.running = false;
    clearInterval(state.elapsedTimer);
    stopMedia();
    Speech.cancel();
    goHome();
    $('#setup-note').textContent = message;
    $('#setup').scrollIntoView({ behavior: 'smooth' });
  }

  // ------------------------------------------------------------ results
  function procSteps(names, activeIdx) {
    const ul = $('#proc-steps');
    ul.innerHTML = '';
    names.forEach((n, i) => {
      const li = document.createElement('li');
      li.textContent = n;
      if (i < activeIdx) li.className = 'done';
      else if (i === activeIdx) li.className = 'active';
      ul.appendChild(li);
    });
  }

  async function finishInterview() {
    stopMedia();
    show('processing');
    $('#proc-title').textContent = 'Preparing your scoresheet…';
    const useLlm = settings.llmEnabled && settings.llmModel;
    const steps = ['Collecting your answers', 'Analysing communication & confidence', 'Scoring thought process & content'].concat(useLlm ? ['Local AI review', 'Writing the summary'] : []).concat(['Building your scoresheet']);
    procSteps(steps, 0);
    await sleep(250);
    const items = state.session.results();
    if (!items.length) {
      alert('No answers were recorded, so there is nothing to score.');
      goHome();
      return;
    }
    procSteps(steps, 1);
    await sleep(300);
    procSteps(steps, 2);
    await sleep(300);

    const llmCfg = { url: settings.llmUrl, model: settings.llmModel, timeoutMs: 120000 };
    if (useLlm) {
      state.skipLlm = false;
      $('#proc-skip').hidden = false;
      procSteps(steps, 3);
      const reviewable = items.filter((it) => !it.analysis.skipped && ['listening', 'correction'].indexOf(it.question.type) === -1);
      let i = 0;
      for (const it of reviewable) {
        if (state.skipLlm) break;
        i++;
        $('#proc-title').textContent = 'Local AI is reviewing answer ' + i + ' of ' + reviewable.length + '…';
        it.llm = await LLM.evaluate(llmCfg, {
          role: (Questions.ROLES[settings.role] || Questions.ROLES.general).label,
          question: it.question.text,
          answer: it.mainText != null ? it.mainText : it.response.text,
          followUps: it.followUps,
          turns: it.question.type === 'roleplay' ? it.response.turns : null,
        });
      }
    }

    const sheet = Scoring.buildScoresheet({
      candidate: { name: settings.name, role: settings.role, experience: settings.experience },
      config: { length: settings.length, mode: 'voice', accent: settings.accent, engine: state.engine },
      items,
      startedAt: state.startedAt,
      endedAt: Date.now(),
      integrity: state.integrity,
    });

    if (useLlm && !state.skipLlm && sheet.llmUsed) {
      procSteps(steps, 4);
      $('#proc-title').textContent = 'Local AI is writing the summary…';
      const summary = await LLM.summarize(llmCfg, sheet);
      if (summary) {
        sheet.rulesSummary = sheet.summary;
        sheet.summary = summary;
        sheet.summarySource = 'llm';
      }
    }
    $('#proc-skip').hidden = true;
    procSteps(steps, steps.length - 1);
    saveSheet(sheet, state.clips);
    showReport(sheet, { clips: state.clips, speak: true });
  }
  $('#proc-skip').addEventListener('click', () => {
    state.skipLlm = true;
    $('#proc-title').textContent = 'Skipping the AI review…';
  });

  // ------------------------------------------------------------ report
  function clipMap(clips) {
    state.clipUrls.forEach((u) => URL.revokeObjectURL(u));
    state.clipUrls = [];
    const map = new Map();
    const order = { main: 0, followup: 1, turn: 2 };
    (clips || []).slice().sort((a, b) => order[a.kind] - order[b.kind] || a.index - b.index).forEach((c) => {
      if (!c.blob) return;
      const url = URL.createObjectURL(c.blob);
      state.clipUrls.push(url);
      const label = c.kind === 'turn' ? 'Reply ' + ((c.index || 0) + 1) : c.kind === 'followup' ? 'Follow-up' : 'Answer';
      if (!map.has(c.qid)) map.set(c.qid, []);
      map.get(c.qid).push({ label, url });
    });
    return map;
  }

  function showReport(sheet, opts) {
    const o = opts || {};
    state.sheet = sheet;
    stopFeedbackAudio();
    Report.mount($('#report-root'), sheet, { clips: clipMap(o.clips) });
    const banner = $('#sample-banner');
    banner.hidden = !o.sample;
    if (o.sample) banner.textContent = 'This is a sample scoresheet from a simulated "' + o.sample + '" candidate. Start your own voice interview to get yours.';
    show('report');
    document.title = 'Scoresheet · ' + (sheet.candidate.name || 'Candidate') + ' · AI Interviewer';
    if (o.speak) setTimeout(() => playFeedback(), 500);
  }

  // Aria reads the result aloud — the interview ends the way it started: in audio.
  let feedbackPlaying = false;
  async function playFeedback() {
    if (!state.sheet || !Speech.ttsSupported) return;
    if (feedbackPlaying) return stopFeedbackAudio();
    feedbackPlaying = true;
    const btn = $('#rep-listen');
    btn.textContent = '■ Stop';
    btn.setAttribute('aria-pressed', 'true');
    await pickVoices();
    await Speech.speak(Scoring.spokenFeedback(state.sheet), { voice: state.voices.interviewer, rate: settings.rate });
    if (feedbackPlaying) stopFeedbackAudio();
  }
  function stopFeedbackAudio() {
    if (feedbackPlaying) Speech.cancel();
    feedbackPlaying = false;
    const btn = $('#rep-listen');
    if (btn) {
      btn.textContent = '🔊 Hear my feedback';
      btn.setAttribute('aria-pressed', 'false');
    }
  }
  $('#rep-listen').addEventListener('click', () => playFeedback());

  $('#rep-home').addEventListener('click', () => {
    stopFeedbackAudio();
    goHome();
  });
  $('#rep-again').addEventListener('click', () => {
    stopFeedbackAudio();
    goHome();
    $('#setup').scrollIntoView({ behavior: 'smooth' });
  });
  $('#rep-print').addEventListener('click', () => window.print());
  $('#rep-json').addEventListener('click', () => {
    if (!state.sheet) return;
    const blob = new Blob([JSON.stringify(state.sheet, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const safe = (state.sheet.candidate.name || 'candidate').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    a.download = 'scoresheet-' + safe + '-' + state.sheet.createdAt.slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1000);
  });
  // Print every question's details, not only the open ones.
  let closedForPrint = [];
  window.addEventListener('beforeprint', () => {
    closedForPrint = $$('details.qa:not([open])');
    closedForPrint.forEach((d) => { d.open = true; });
  });
  window.addEventListener('afterprint', () => {
    closedForPrint.forEach((d) => { d.open = false; });
    closedForPrint = [];
  });

  $$('[data-sample]').forEach((btn) => btn.addEventListener('click', () => {
    const profile = btn.getAttribute('data-sample');
    const { sheet } = Demo.runScripted(profile, {
      role: settings.role === 'sales' || settings.role === 'tech' ? settings.role : 'voice',
      length: 'standard',
      name: profile === 'strong' ? 'Ananya Iyer (sample)' : 'Sample Candidate',
      startedAt: Date.now() - 15 * 60000,
      seed: 7,
    });
    showReport(sheet, { sample: profile });
  }));

  // ------------------------------------------------------------ boot
  fillSetup();
  populateVoices();
  renderHistory();
  if (Speech.ttsSupported && window.speechSynthesis) {
    window.speechSynthesis.addEventListener('voiceschanged', () => populateVoices());
  }
})();
