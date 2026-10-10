/*
 * app.js — wires the screens together: setup → device check → interview → scoresheet.
 */
(function () {
  'use strict';
  const { Text, Lexicons, Questions, Engine, Scoring, Speech, Audio, LLM, Report, Demo } = window.AII;

  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));

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
    name: '', role: 'voice', experience: 'fresher', length: 'standard',
    mode: Speech.sttSupported ? 'voice' : 'text', accent: guessAccent(), silenceSec: 4,
    interviewerVoice: '', customerVoice: '', rate: 1, speakAloud: true, camera: false,
    llmEnabled: false, llmUrl: LLM.DEFAULT_URL, llmModel: '',
  };
  let settings = Object.assign({}, DEFAULTS, store.get(SETTINGS_KEY, {}));
  if (!Speech.sttSupported) settings.mode = 'text';

  const state = {
    session: null,
    meter: null,
    camStream: null,
    voices: { interviewer: null, customer: null },
    running: false,
    endRequested: false,
    integrity: { tabSwitches: 0, pastes: 0, repeats: 0 },
    startedAt: 0,
    sheet: null,
    ctl: null,
    checkRec: null,
    elapsedTimer: null,
    skipLlm: false,
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
  const SCREENS = ['home', 'check', 'interview', 'processing', 'report'];
  function show(name) {
    for (const s of SCREENS) $('#screen-' + s).hidden = s !== name;
    window.scrollTo({ top: 0 });
  }
  $('#brand-home').addEventListener('click', (e) => {
    e.preventDefault();
    if (state.running && !confirm('Leave the interview? Your answers so far will be lost.')) return;
    abortInterview();
    goHome();
  });

  function goHome() {
    show('home');
    renderHistory();
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
    $('#f-speak').checked = settings.speakAloud && Speech.ttsSupported;
    $('#f-speak').disabled = !Speech.ttsSupported;
    $('#f-camera').checked = settings.camera;
    $('#f-llm').checked = settings.llmEnabled;
    $('#f-llm-url').value = settings.llmUrl;
    for (const name of ['experience', 'mode', 'length']) {
      const el = form.querySelector('input[name="' + name + '"][value="' + settings[name] + '"]');
      if (el) el.checked = true;
    }
    const voiceRadio = form.querySelector('input[name="mode"][value="voice"]');
    if (!Speech.sttSupported) {
      voiceRadio.disabled = true;
      $('#mode-hint').textContent = 'Spoken answers need Chrome, Edge or Safari. You can still type your answers here.';
    } else if (!window.isSecureContext) {
      $('#mode-hint').textContent = 'The microphone needs https or localhost. Run "npm start" and open http://localhost:8080.';
    } else {
      $('#mode-hint').textContent = 'Speaking is recommended: it lets the interviewer judge pace, pauses and tone.';
    }
    if (settings.llmModel) {
      const sel = $('#f-llm-model');
      sel.innerHTML = '';
      sel.add(new Option(settings.llmModel, settings.llmModel));
    }
    toggleLlmFields();
  }

  function readSetup() {
    const fd = new FormData(form);
    settings = Object.assign({}, settings, {
      name: String(fd.get('name') || '').trim().slice(0, 60),
      role: fd.get('role') || 'voice',
      experience: fd.get('experience') || 'fresher',
      mode: fd.get('mode') || 'text',
      length: fd.get('length') || 'standard',
      accent: fd.get('accent') || 'en-US',
      silenceSec: Number(fd.get('silenceSec') || 0),
      interviewerVoice: fd.get('interviewerVoice') || '',
      customerVoice: fd.get('customerVoice') || '',
      rate: Number(fd.get('rate') || 1),
      speakAloud: $('#f-speak').checked,
      camera: $('#f-camera').checked,
      llmEnabled: $('#f-llm').checked,
      llmUrl: String(fd.get('llmUrl') || LLM.DEFAULT_URL).trim(),
      llmModel: fd.get('llmModel') || '',
    });
    store.set(SETTINGS_KEY, settings);
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
    if (!Speech.ttsSupported || !voices.length) {
      $('#setup-note').textContent = Speech.ttsSupported ? '' : 'This browser cannot speak aloud; questions will be shown as text.';
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

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    readSetup();
    if (!settings.name) {
      $('#f-name').focus();
      $('#setup-note').textContent = 'Please enter your name; it goes on your scoresheet.';
      return;
    }
    if (settings.llmEnabled && !settings.llmModel) {
      $('#setup-note').textContent = 'Local AI is on: press "Test" to pick a model, or turn it off.';
      $('details.advanced').open = true;
      return;
    }
    $('#setup-note').textContent = '';
    if (settings.mode === 'voice') openCheck();
    else startInterview();
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
      li.querySelector('[data-act="view"]').addEventListener('click', () => {
        const sheet = store.get(SHEET_PREFIX + h.id, null);
        if (sheet) showReport(sheet, false);
        else alert('This scoresheet is no longer stored.');
      });
      li.querySelector('[data-act="del"]').addEventListener('click', () => {
        store.del(SHEET_PREFIX + h.id);
        store.set(HISTORY_KEY, store.get(HISTORY_KEY, []).filter((x) => x.id !== h.id));
        renderHistory();
      });
      ul.appendChild(li);
    }
  }
  $('#history-clear').addEventListener('click', () => {
    if (!confirm('Delete all saved scoresheets from this browser?')) return;
    for (const h of store.get(HISTORY_KEY, [])) store.del(SHEET_PREFIX + h.id);
    store.del(HISTORY_KEY);
    renderHistory();
  });

  function saveSheet(sheet) {
    const list = store.get(HISTORY_KEY, []).filter((x) => x.id !== sheet.id);
    list.unshift({ id: sheet.id, name: sheet.candidate.name, role: sheet.role.label, overall: sheet.overall, verdict: sheet.verdict.label, createdAt: sheet.createdAt });
    while (list.length > 12) store.del(SHEET_PREFIX + list.pop().id);
    if (store.set(SHEET_PREFIX + sheet.id, sheet)) store.set(HISTORY_KEY, list);
  }

  // ------------------------------------------------------------ device check
  async function openCheck() {
    show('check');
    $('#check-voice-status').textContent = '';
    $('#check-mic-status').textContent = '';
    $('#check-transcript').innerHTML = '<span class="muted">Waiting for your voice…</span>';
    $('#check-retry').hidden = true;
    await ensureMeter($('#check-mic-status'));
    startCheckRecognition();
  }

  async function ensureMeter(statusEl) {
    if (state.meter && state.meter.running) return true;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (statusEl) {
        statusEl.className = 'status-line err';
        statusEl.textContent = 'This browser cannot access the microphone here. Use Chrome/Edge on https or localhost, or switch to typing.';
      }
      return false;
    }
    try {
      state.meter = Audio.createMeter();
      await state.meter.start();
      state.meter.onLevel((level) => {
        const bar = $('#check-level');
        if (bar) bar.style.width = Math.round(level * 100) + '%';
        pushViz(level);
      });
      return true;
    } catch (err) {
      state.meter = null;
      if (statusEl) {
        statusEl.className = 'status-line err';
        statusEl.textContent = 'Microphone blocked or not found (' + (err.name || err.message) + '). Allow microphone access in the address bar, or use typing.';
      }
      return false;
    }
  }

  function startCheckRecognition() {
    const st = $('#check-mic-status');
    if (state.checkRec) state.checkRec.abort();
    const rec = Speech.createRecognizer({
      lang: settings.accent,
      onUpdate: (fin, interim) => {
        const box = $('#check-transcript');
        box.textContent = (fin + ' ' + interim).trim() || '…';
        const words = (fin + ' ' + interim).trim().split(/\s+/).filter(Boolean).length;
        if (words >= 3) {
          st.className = 'status-line ok';
          st.textContent = 'Great, the interviewer can hear you clearly.';
          $('#check-retry').hidden = false;
          rec.stop();
        }
      },
      onError: (code, msg, fatal) => {
        if (!fatal) return;
        st.className = 'status-line err';
        st.textContent = msg + ' You can still take the interview by typing.';
        $('#check-retry').hidden = false;
      },
    });
    state.checkRec = rec;
    if (rec) rec.start();
    else {
      st.className = 'status-line err';
      st.textContent = 'Speech recognition is not available in this browser. Please use typing mode.';
    }
  }

  $('#check-retry').addEventListener('click', () => {
    $('#check-transcript').innerHTML = '<span class="muted">Waiting for your voice…</span>';
    $('#check-mic-status').textContent = '';
    startCheckRecognition();
  });
  $('#check-voice').addEventListener('click', async () => {
    const st = $('#check-voice-status');
    if (!Speech.ttsSupported) {
      st.className = 'status-line err';
      st.textContent = 'This browser cannot speak aloud. Questions will be shown as text.';
      return;
    }
    await pickVoices();
    st.className = 'status-line';
    st.textContent = 'Playing…';
    await Speech.speak("Hi, I'm Aria, your interviewer today. Can you hear me clearly?", { voice: state.voices.interviewer, rate: settings.rate });
    st.className = 'status-line ok';
    st.textContent = 'If you heard that, your speakers are working.';
  });
  $('#check-back').addEventListener('click', () => {
    if (state.checkRec) state.checkRec.abort();
    stopMedia();
    goHome();
  });
  $('#check-typing').addEventListener('click', () => {
    if (state.checkRec) state.checkRec.abort();
    settings.mode = 'text';
    store.set(SETTINGS_KEY, settings);
    stopMedia();
    startInterview();
  });
  $('#check-start').addEventListener('click', () => {
    if (state.checkRec) state.checkRec.abort();
    startInterview();
  });

  async function pickVoices() {
    await Speech.loadVoices();
    state.voices = Speech.pickVoices({ accent: settings.accent, interviewerVoice: settings.interviewerVoice, customerVoice: settings.customerVoice });
  }

  // ------------------------------------------------------------ interview room UI
  const VIZ_BARS = 28;
  const vizLevels = new Array(VIZ_BARS).fill(0);
  (function buildViz() {
    const viz = $('#viz');
    for (let i = 0; i < VIZ_BARS; i++) viz.appendChild(document.createElement('i'));
  })();
  function pushViz(level) {
    vizLevels.push(level);
    vizLevels.shift();
    const bars = $('#viz').children;
    for (let i = 0; i < bars.length; i++) bars[i].style.height = Math.max(4, Math.round(vizLevels[i] * 64)) + 'px';
  }

  function setPill(stateName, text) {
    const pill = $('#state-pill');
    pill.dataset.state = stateName;
    pill.textContent = text;
    const av = $('#avatar');
    av.classList.toggle('speaking', stateName === 'speaking');
    av.classList.toggle('listening', stateName === 'listening');
  }

  function setPersona(who) {
    const av = $('#avatar');
    av.classList.toggle('customer', who === 'customer');
    $('#who-label').textContent = who === 'customer' ? 'Customer · mock call' : 'Aria · AI Interviewer';
  }

  function notice(msg) {
    const n = $('#notice');
    n.textContent = msg;
    n.hidden = !msg;
  }

  // Mouth animation driven by speech boundary events (with a fallback wobble).
  let mouthLevel = 0;
  let mouthRaf = 0;
  let speakingSince = 0;
  let lastBoundary = 0;
  function animateMouth() {
    const now = performance.now();
    if (speakingSince && now - lastBoundary > 450) mouthLevel = Math.max(mouthLevel, 0.35 + 0.35 * Math.abs(Math.sin(now / 90)));
    mouthLevel *= 0.86;
    $('#av-mouth').style.transform = 'scaleY(' + (1 + mouthLevel * 2.6).toFixed(2) + ')';
    if (speakingSince || mouthLevel > 0.02) mouthRaf = requestAnimationFrame(animateMouth);
    else mouthRaf = 0;
  }

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
  function highlightWordAt(charIndex) {
    let current = null;
    for (const span of $('#caption').children) {
      if (Number(span.dataset.at) <= charIndex) current = span;
      span.classList.remove('w-now');
    }
    if (current) current.classList.add('w-now');
  }

  /** Speak a list of { text, voice } segments, with captions. */
  async function say(segments, opts) {
    const o = opts || {};
    const canSpeak = settings.speakAloud && Speech.ttsSupported;
    state.skipVoice = false;
    // Listening-test details are only ever spoken, so they cannot be skipped.
    $('#btn-skip-voice').hidden = !canSpeak || !!o.hideText;
    for (const seg of segments) {
      if (state.endRequested && !o.force) break;
      setPersona(seg.voice);
      const hidden = o.hideText && seg.text === o.hiddenText;
      const muted = !canSpeak || state.skipVoice;
      if (hidden && muted) {
        // No audio available: show the details briefly instead (a memory test).
        captionWords(seg.text);
      } else if (hidden) {
        const cap = $('#caption');
        cap.innerHTML = '';
        const s = document.createElement('span');
        s.textContent = o.display || 'Listen carefully…';
        const note = document.createElement('span');
        note.className = 'listen-note';
        note.textContent = '🎧 The details are spoken only. Listen carefully.';
        cap.append(s, note);
      } else captionWords(seg.text);
      setPill('speaking', seg.voice === 'customer' ? 'Customer speaking…' : 'Speaking…');
      speakingSince = performance.now();
      lastBoundary = 0;
      if (!mouthRaf) mouthRaf = requestAnimationFrame(animateMouth);
      const voice = seg.voice === 'customer' ? state.voices.customer : state.voices.interviewer;
      await Speech.speak(seg.text, {
        voice,
        rate: seg.voice === 'customer' ? Math.min(1.3, settings.rate * 1.05) : settings.rate,
        pitch: seg.voice === 'customer' ? 0.95 : 1.02,
        muted,
        mutedDelayMs: hidden ? Math.max(4000, seg.text.split(/\s+/).length * 300) : 350,
        onBoundary: (i) => {
          lastBoundary = performance.now();
          mouthLevel = 1;
          if (!hidden) highlightWordAt(i);
        },
      });
      speakingSince = 0;
      highlightWordAt(-1);
      if (segments.length > 1) await new Promise((r) => setTimeout(r, 180));
    }
    $('#btn-skip-voice').hidden = true;
  }
  $('#btn-skip-voice').addEventListener('click', () => {
    state.skipVoice = true;
    Speech.cancel();
  });

  function renderStep(step) {
    $('#room-q').textContent = 'Question ' + (step.index + 1) + ' of ' + step.total + ' · ' + step.stageLabel + (step.kind === 'followup' ? ' · follow-up' : '');
    $('#room-bar').style.width = Math.round((step.index / step.total) * 100) + '%';
    $('#roleplay-banner').hidden = step.kind !== 'roleplay';
  }

  function startElapsed() {
    clearInterval(state.elapsedTimer);
    state.elapsedTimer = setInterval(() => {
      const s = Math.floor((Date.now() - state.startedAt) / 1000);
      $('#room-elapsed').textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    }, 1000);
  }

  function setControls(active, mode) {
    $('#btn-done').disabled = !active;
    $('#btn-skip').disabled = !active;
    $('#btn-repeat').disabled = !active;
    $('#btn-type').disabled = !active || mode !== 'voice';
    $('#btn-type').hidden = mode !== 'voice';
    $('#btn-done').textContent = mode === 'text' ? 'Submit answer' : 'Done answering';
    $('#kbd-hint').innerHTML = mode === 'text' ? '<kbd>Ctrl</kbd> + <kbd>Enter</kbd> submit' : '<kbd>Enter</kbd> done · <kbd>R</kbd> repeat question';
  }

  function setRing(fraction, label) {
    const f = Math.max(0, Math.min(1, fraction));
    $('#ring-fill').style.strokeDashoffset = String(188.5 * (1 - f));
    $('#ring-text').textContent = label;
    $('#ring').classList.toggle('low', f < 0.2);
  }

  function liveStats(text, speakingMs) {
    const words = (text.match(/[A-Za-z0-9']+/g) || []).length;
    $('#st-words').textContent = words;
    $('#st-pace').textContent = speakingMs > 4000 && words > 5 ? Math.round(words / (speakingMs / 60000)) + ' wpm' : '–';
    $('#st-fillers').textContent = Text.findTerms(Text.makeDoc(text), Lexicons.FILLERS).length;
    return words;
  }

  function renderLive(fin, interim) {
    const live = $('#live');
    live.innerHTML = '';
    if (!fin && !interim) {
      const p = document.createElement('span');
      p.className = 'placeholder';
      p.textContent = 'Listening… start speaking whenever you are ready.';
      live.appendChild(p);
      return;
    }
    live.appendChild(document.createTextNode(fin + ' '));
    if (interim) {
      const s = document.createElement('span');
      s.className = 'interim';
      s.textContent = interim;
      live.appendChild(s);
    }
    live.scrollTop = live.scrollHeight;
  }

  /** Collect one answer (voice or typed). Resolves with an answer object for the engine. */
  function collectAnswer(step) {
    return new Promise((resolve) => {
      let mode = settings.mode === 'voice' && Speech.sttSupported ? 'voice' : 'text';
      const ctl = { done: false, repeats: 0, pasted: false };
      state.ctl = ctl;
      const silenceMs = settings.silenceSec * 1000;
      let maxMs = step.maxSeconds * 1000 * (mode === 'text' ? 2.5 : 1);
      let t0 = performance.now();
      let rec = null;
      let typedPrefill = '';

      $('#auto-hint').textContent = '';
      $('#st-pace-wrap').hidden = mode !== 'voice';
      setControls(true, mode);
      setPill('listening', mode === 'voice' ? 'Listening…' : 'Waiting for your answer');

      function startVoice() {
        $('#viz').hidden = false;
        $('#voice-area').hidden = false;
        $('#text-area').hidden = true;
        renderLive('', '');
        rec = Speech.createRecognizer({
          lang: settings.accent,
          onUpdate: (fin, interim) => {
            renderLive(fin, interim);
            $('#btn-repeat').disabled = !!(fin || interim);
          },
          onError: (code, msg, fatal) => {
            if (!fatal || ctl.done) return;
            notice(msg + ' Switched to typing for the rest of the interview.');
            settings.mode = 'text';
            switchToText();
          },
        });
        if (state.meter) state.meter.beginSegment();
        rec.start();
      }

      function startText(prefill) {
        $('#viz').hidden = true;
        $('#voice-area').hidden = true;
        $('#text-area').hidden = false;
        const ta = $('#answer-text');
        ta.value = prefill || '';
        ta.focus();
      }

      function switchToText() {
        if (mode !== 'voice') return;
        const sofar = rec ? (rec.text() + ' ' + rec.interim()).trim() : '';
        if (rec) rec.abort();
        if (state.meter) state.meter.endSegment();
        rec = null;
        mode = 'text';
        typedPrefill = sofar;
        maxMs = Math.max(maxMs, step.maxSeconds * 1000 * 2.5);
        setControls(true, 'text');
        $('#st-pace-wrap').hidden = true;
        setPill('listening', 'Waiting for your answer');
        startText(sofar ? sofar + ' ' : '');
      }
      ctl.switchToText = switchToText;

      if (mode === 'voice') startVoice();
      else startText('');

      const timer = setInterval(() => {
        if (ctl.done) return;
        const elapsed = performance.now() - t0;
        const left = Math.max(0, maxMs - elapsed);
        setRing(left / maxMs, Math.ceil(left / 1000) + 's');
        let text;
        if (mode === 'voice' && rec) {
          text = (rec.text() + ' ' + rec.interim()).trim();
          const speakMs = rec.firstResultAt ? performance.now() - rec.firstResultAt + 600 : 0;
          const words = liveStats(text, speakMs);
          if (silenceMs && words >= 3) {
            const sinceVoice = state.meter ? state.meter.msSinceVoice() : Infinity;
            const sinceResult = rec.lastResultAt ? performance.now() - rec.lastResultAt : Infinity;
            const quiet = Math.min(sinceVoice, sinceResult);
            if (quiet > silenceMs) return finish({ auto: true });
            $('#auto-hint').textContent = quiet > silenceMs - 1600 ? 'Finishing your answer in ' + Math.ceil((silenceMs - quiet) / 1000) + 's… keep talking to continue.' : '';
          }
        } else {
          text = $('#answer-text').value;
          liveStats(text, 0);
        }
        if (elapsed >= maxMs) finish({ timedOut: true });
      }, 200);

      async function finish(extra) {
        const x = extra || {};
        if (ctl.done) return;
        ctl.done = true;
        clearInterval(timer);
        setControls(false, mode);
        $('#auto-hint').textContent = '';
        setPill('thinking', 'Thinking…');
        let text = '';
        let audio = null;
        let timing;
        const totalMs = performance.now() - t0;
        if (mode === 'voice' && rec) {
          text = (await rec.stop()) || rec.interim();
          audio = state.meter ? state.meter.endSegment() : null;
          const first = rec.firstResultAt;
          const onset = audio && audio.onsetMs != null ? audio.onsetMs : first ? first - t0 - 500 : null;
          // The recogniser's first-to-last result span is a floor for speaking time,
          // in case the mic analysis missed quiet speech.
          const recSpan = first && rec.lastResultAt ? rec.lastResultAt - first + 800 : 0;
          const speakingMs = Math.max(audio && audio.speakingMs ? audio.speakingMs : 0, recSpan);
          timing = { latencyMs: onset != null ? Math.max(0, onset) : null, speakingMs, totalMs };
        } else {
          text = $('#answer-text').value.trim();
          timing = { latencyMs: null, speakingMs: 0, totalMs };
        }
        if (typedPrefill && mode === 'text' && !text) text = typedPrefill;
        resolve({
          text: x.skipped ? '' : text,
          mode,
          timing,
          audio,
          events: { repeats: ctl.repeats, skipped: !!x.skipped || !text.trim(), pasted: ctl.pasted, timedOut: !!x.timedOut },
        });
      }
      ctl.finish = finish;

      ctl.repeat = async () => {
        if (ctl.done || ctl.repeating) return;
        ctl.repeating = true;
        ctl.repeats++;
        state.integrity.repeats++;
        if (rec) rec.pause();
        if (state.meter && mode === 'voice') state.meter.endSegment();
        setControls(false, mode);
        await say(state.session.repeatSpeak(), { hideText: step.hideText, hiddenText: state.session.repeatSpeak()[0].text, display: step.prompt });
        setControls(true, mode);
        setPill('listening', mode === 'voice' ? 'Listening…' : 'Waiting for your answer');
        t0 = performance.now();
        if (rec && mode === 'voice') {
          if (state.meter) state.meter.beginSegment();
          rec.resume();
        }
        ctl.repeating = false;
      };
    });
  }

  $('#btn-done').addEventListener('click', () => state.ctl && state.ctl.finish && state.ctl.finish({}));
  $('#btn-skip').addEventListener('click', () => state.ctl && state.ctl.finish && state.ctl.finish({ skipped: true }));
  $('#btn-repeat').addEventListener('click', () => state.ctl && state.ctl.repeat && state.ctl.repeat());
  $('#btn-type').addEventListener('click', () => state.ctl && state.ctl.switchToText && state.ctl.switchToText());
  $('#answer-text').addEventListener('paste', () => {
    if (state.ctl && !state.ctl.done) {
      state.ctl.pasted = true;
      state.integrity.pastes++;
    }
  });
  $('#answer-text').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (state.ctl) state.ctl.finish({});
    }
  });
  document.addEventListener('keydown', (e) => {
    if ($('#screen-interview').hidden || !state.ctl || state.ctl.done) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'textarea' || tag === 'input' || tag === 'select') return;
    if (e.key === 'Enter' && tag !== 'button') {
      e.preventDefault();
      if (!$('#btn-done').disabled) state.ctl.finish({});
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
    if (state.ctl && !state.ctl.done) state.ctl.finish({});
  });

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
    if (state.meter) state.meter.stop();
    state.meter = null;
  }

  function abortInterview() {
    state.endRequested = true;
    state.running = false;
    state.discard = true;
    Speech.cancel();
    if (state.ctl && !state.ctl.done) state.ctl.finish({ skipped: true });
    clearInterval(state.elapsedTimer);
    stopMedia();
  }

  // ------------------------------------------------------------ the interview loop
  async function startInterview() {
    readSetup();
    state.session = Engine.createSession({
      length: settings.length,
      role: settings.role,
      experience: settings.experience,
      mode: settings.mode,
      name: settings.name,
      interviewerName: 'Aria',
      seed: (Math.random() * 2147483647) | 0,
    });
    state.integrity = { tabSwitches: 0, pastes: 0, repeats: 0 };
    state.endRequested = false;
    state.discard = false;
    state.running = true;
    state.startedAt = Date.now();
    notice('');
    show('interview');
    setControls(false, settings.mode);
    $('#live').innerHTML = '<span class="placeholder">The transcript appears here as you speak.</span>';
    $('#answer-text').value = '';
    $('#voice-area').hidden = settings.mode !== 'voice';
    $('#text-area').hidden = settings.mode === 'voice';
    setRing(1, '–');
    startElapsed();
    await pickVoices();
    if (settings.mode === 'voice') {
      const ok = await ensureMeter(null);
      if (!ok) notice('Microphone analysis is unavailable, so pace, pauses and tone will not be scored. Speech recognition may still work.');
    }
    if (settings.camera) startCamera();

    const session = state.session;
    $('#room-q').textContent = 'Introduction';
    await say([{ text: session.opening(), voice: 'interviewer' }]);
    let step = session.current();
    while (step && !state.endRequested) {
      renderStep(step);
      const q = Questions.byId[step.questionId];
      await say(step.speak, { hideText: step.hideText, hiddenText: q && q.text, display: step.prompt });
      if (state.endRequested) break;
      showPrompt(step);
      const answer = await collectAnswer(step);
      if (state.discard) return;
      const res = session.submit(answer);
      if (res.done) {
        await say(res.speak, { force: true });
        break;
      }
      step = res.step;
    }
    if (state.discard) return;
    if (state.endRequested && !session.finished) {
      session.endEarly();
      await say([{ text: 'Alright, we will stop here. Thank you for your time. Preparing your scoresheet now.', voice: 'interviewer' }], { force: true });
    }
    state.running = false;
    clearInterval(state.elapsedTimer);
    await finishInterview();
  }

  function showPrompt(step) {
    // Keep the question on screen while answering (never the hidden listening details).
    const cap = $('#caption');
    cap.innerHTML = '';
    const s = document.createElement('span');
    s.textContent = step.prompt;
    cap.appendChild(s);
    if (step.hideText) {
      const note = document.createElement('span');
      note.className = 'listen-note';
      note.textContent = '🎧 You may press Repeat once, but it lowers the listening score.';
      cap.appendChild(note);
    }
    setPersona(step.kind === 'roleplay' ? 'customer' : 'interviewer');
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
    const useLlm = settings.llmEnabled && settings.llmModel;
    const steps = ['Collecting your answers', 'Analysing communication & confidence', 'Scoring thought process & content'].concat(useLlm ? ['Local AI review', 'Writing the summary'] : []).concat(['Building your scoresheet']);
    procSteps(steps, 0);
    await new Promise((r) => setTimeout(r, 250));
    const items = state.session.results();
    if (!items.length) {
      alert('No answers were recorded, so there is nothing to score.');
      goHome();
      return;
    }
    procSteps(steps, 1);
    await new Promise((r) => setTimeout(r, 300));
    procSteps(steps, 2);
    await new Promise((r) => setTimeout(r, 300));

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
          question: it.question.type === 'roleplay' ? it.question.text : it.question.text,
          answer: it.mainText != null ? it.mainText : it.response.text,
          followUps: it.followUps,
          turns: it.question.type === 'roleplay' ? it.response.turns : null,
        });
      }
    }

    const sheet = Scoring.buildScoresheet({
      candidate: { name: settings.name, role: settings.role, experience: settings.experience },
      config: { length: settings.length, mode: settings.mode, accent: settings.accent },
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
    $('#proc-title').textContent = 'Preparing your scoresheet…';
    saveSheet(sheet);
    showReport(sheet, false);
  }
  $('#proc-skip').addEventListener('click', () => {
    state.skipLlm = true;
    $('#proc-title').textContent = 'Skipping the AI review…';
  });

  function showReport(sheet, isSample) {
    state.sheet = sheet;
    Report.mount($('#report-root'), sheet);
    const banner = $('#sample-banner');
    banner.hidden = !isSample;
    if (isSample) banner.textContent = 'This is a sample scoresheet from a simulated "' + isSample + '" candidate. Start your own interview to get yours.';
    show('report');
    document.title = 'Scoresheet · ' + (sheet.candidate.name || 'Candidate') + ' · AI Interviewer';
  }

  $('#rep-home').addEventListener('click', () => {
    document.title = 'AI Interviewer';
    goHome();
  });
  $('#rep-again').addEventListener('click', () => {
    document.title = 'AI Interviewer';
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
    showReport(sheet, profile);
  }));

  // ------------------------------------------------------------ boot
  fillSetup();
  populateVoices();
  renderHistory();
  if (Speech.ttsSupported && window.speechSynthesis) {
    window.speechSynthesis.addEventListener('voiceschanged', () => populateVoices());
  }
})();
