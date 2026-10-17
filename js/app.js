/*
 * app.js — the voice interview: setup → hands-free call → spoken feedback + scoresheet.
 *
 * The call is half-duplex, like a polite phone interview: the interviewer speaks, then the
 * microphone listens until the candidate has clearly finished (adaptive silence
 * detection or a spoken "that's all"), then the interviewer replies. Candidates can say
 * "repeat", "skip" or "that's all" at any time, so the screen never needs touching.
 */
(function () {
  'use strict';
  const AII = window.AII;
  const { Questions, Engine, Scoring, Speech, Audio, LLM, Report, Demo, Voice, Recorder } = AII;

  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // The interviewer's name, as spoken and shown on screen.
  const INTERVIEWER = 'Tushar AI';

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
      // en-US is most browsers' default even in India, so it says little: check the time zone first.
      if (/^en-(IN|GB|PH|AU|ZA|NG)$/i.test(l)) return 'en-' + l.slice(3).toUpperCase();
      if (/-IN$/i.test(l) || /^(hi|ta|te|mr|bn|kn|ml|gu|pa)\b/i.test(l)) return 'en-IN';
      if (/^(fil|tl)\b/i.test(l)) return 'en-PH';
    }
    // A browser set to "en-US" in India still hears Indian names far better with en-IN.
    let zone = '';
    try { zone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { /* unknown */ }
    if (/^Asia\/(Kolkata|Calcutta)$/.test(zone)) return 'en-IN';
    if (zone === 'Asia/Manila') return 'en-PH';
    if (zone === 'Africa/Lagos') return 'en-NG';
    if (zone === 'Africa/Johannesburg') return 'en-ZA';
    if (zone === 'Europe/London') return 'en-GB';
    if (/^Australia\//.test(zone)) return 'en-AU';
    for (const l of langs) {
      if (/^en-/i.test(l)) return /^en-(IN|US|GB|PH|AU|ZA|NG)$/i.test(l) ? 'en-' + l.slice(3).toUpperCase() : 'en-US';
    }
    return 'en-US';
  }

  const DEFAULTS = {
    name: '', role: 'voice', experience: 'fresher', length: 'standard', accent: guessAccent(),
    track: 'bpo', bpoRole: 'voice', techRole: 'fullstack', company: 'generic',
    silenceSec: 3, interviewerVoice: '', customerVoice: '', rate: 1, record: true,
    showCaptions: true, engine: 'auto', llmEnabled: false, llmUrl: LLM.DEFAULT_URL, llmModel: '',
    liveCoach: true,
  };
  let settings = Object.assign({}, DEFAULTS, store.get(SETTINGS_KEY, {}));
  // Older settings had one role (BPO): keep it as the BPO choice.
  if (!store.get(SETTINGS_KEY, {}).bpoRole && Questions.trackOf(settings.role) === 'bpo') settings.bpoRole = settings.role;
  if (!Questions.ROLES[settings.techRole] || Questions.trackOf(settings.techRole) !== 'tech') settings.techRole = 'fullstack';
  if (!Questions.COMPANIES[settings.company]) settings.company = 'generic';
  if (settings.track !== 'tech') settings.track = 'bpo';
  settings.role = settings.track === 'tech' ? settings.techRole : settings.bpoRole;
  // Older saves stored the browser's "en-US" without anyone choosing it: use the better guess.
  if (!settings.accentChosen && settings.accent === 'en-US') settings.accent = DEFAULTS.accent;
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
    hiddenCount: 0,         // times the tab was hidden (to re-speak cut-off sentences)
    ttsOk: true,            // false when the browser cannot speak: captions take over
    meterTrusted: true,     // false when the level meter cannot hear the voice the recogniser hears
    useTrack: true,         // give the browser recogniser our mic track (Chrome 135+ desktop)
    whisperFailed: false,   // the offline model could not be loaded in this call: don't offer it again
    lastSpoken: '',
    callGen: 0,             // increases with every call, so a call that was left can never resume
    cancelBrief: null,
    cancelTap: null,        // ends a pending "Tap to hear the interviewer" wait
    userAction: null,       // resolver while waiting on a notice button
  };

  // ------------------------------------------------------------ theme
  function applyTheme(t) {
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
  }
  // Only a saved choice is applied at start: with none, keep whatever theme the page opened with.
  if (store.get(THEME_KEY, 'auto') !== 'auto') applyTheme(store.get(THEME_KEY, 'auto'));
  $('#theme-toggle').addEventListener('click', () => {
    const order = ['auto', 'light', 'dark'];
    const cur = store.get(THEME_KEY, 'auto');
    const next = order[(order.indexOf(cur) + 1) % order.length];
    store.set(THEME_KEY, next);
    applyTheme(next);
    $('#theme-toggle').title = 'Theme: ' + next;
  });

  // ------------------------------------------------------------ screens
  const SCREENS = ['home', 'interview', 'processing', 'report', 'drill'];
  function show(name) {
    for (const s of SCREENS) $('#screen-' + s).hidden = s !== name;
    document.body.classList.toggle('in-call', name === 'interview');
    window.scrollTo({ top: 0 });
  }
  $('#brand-home').addEventListener('click', (e) => {
    e.preventDefault();
    if (state.running && !confirm('Leave the interview? Your answers so far will be lost.')) return;
    // Leaving while the scoresheet is being prepared: it is still saved to history, just sooner.
    if (!$('#screen-processing').hidden) state.skipLlm = true;
    abortInterview();
    stopFeedbackAudio();
    goHome();
  });

  function goHome() {
    document.title = 'Tushar AI Interviewer';
    // A recording left playing would otherwise carry on, hidden, into the next call's microphone.
    $$('#report-root audio').forEach((a) => a.pause());
    $('#report-root').innerHTML = '';
    clipMap([]); // release the recordings' object URLs
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
    if (/FBAN|FBAV|Instagram|LinkedInApp|Line\/|Snapchat|Twitter/i.test(navigator.userAgent || '')) return '⚠️ In-app browsers (Instagram, Facebook, LinkedIn…) block the microphone. Open this page in <strong>Chrome</strong> or <strong>Safari</strong>.';
    if (!window.isSecureContext) {
      return '⚠️ The microphone needs <strong>https</strong> or <strong>localhost</strong>. On this computer: run <kbd>npm start</kbd> and open http://localhost:8080. ' +
        'On a phone over Wi-Fi: run <kbd>npm run lan</kbd> on the computer and open the <strong>https://</strong> address it prints.';
    }
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
    // Share our (echo-cancelled) mic track with the recogniser where Chrome supports it;
    // the mic check turns this off if the recogniser then hears nothing.
    const track = state.useTrack && state.meter && state.meter.stream && state.meter.stream.getAudioTracks()[0];
    return Speech.createRecognizer(Object.assign({ lang: settings.accent, track, micGranted: !!(state.meter && state.meter.running) }, handlers));
  }

  // ------------------------------------------------------------ setup form
  const form = $('#setup-form');

  function fillSetup() {
    const roleSel = $('#f-role');
    roleSel.innerHTML = '';
    for (const [k, r] of Object.entries(Questions.ROLES)) if (r.track !== 'tech') roleSel.add(new Option(r.label, k));
    renderEngineering();
    renderLengths(settings.track);
    $('#f-name').value = settings.name;
    roleSel.value = settings.bpoRole;
    setupRest();
    applyTrack();
  }

  /** Interview lengths for a track (engineering has its own two-round loops). */
  function renderLengths(track) {
    const lc = $('#length-cards');
    lc.innerHTML = '';
    if (track === 'tech') {
      for (const [k, p] of Object.entries(Questions.TECH_PLANS)) {
        const label = document.createElement('label');
        label.className = 'lc-eng';
        label.innerHTML = '<input type="radio" name="length" value="' + k + '"><span class="lc"><strong></strong><span></span></span>';
        label.querySelector('strong').textContent = p.label;
        label.querySelector('.lc > span').textContent = p.note + ' · ' + aboutMin(p.minutes);
        lc.appendChild(label);
      }
      if (!Questions.TECH_PLANS[settings.length]) settings.length = 'standard';
    } else {
      renderBpoLengths(lc);
      if (!Questions.PLANS[settings.length]) settings.length = 'standard';
    }
    const el = form.querySelector('input[name="length"][value="' + settings.length + '"]');
    if (el) el.checked = true;
  }

  // "about 25–30 min" never breaks across lines.
  function aboutMin(m) {
    return 'about ' + String(m).replace(/[–-]/, '⁠–⁠') + ' min';
  }

  function renderBpoLengths(lc) {
    for (const [k, p] of Object.entries(Questions.PLANS)) {
      const label = document.createElement('label');
      label.innerHTML = '<input type="radio" name="length" value="' + k + '"><span class="lc"><strong></strong><span></span></span>';
      label.querySelector('strong').textContent = p.label;
      label.querySelector('.lc > span').textContent = p.rounds
        ? p.rounds.map((r) => r.title).join(' · ') + ' · ' + aboutMin(p.minutes)
        : p.slots.length + ' questions · ' + aboutMin(p.minutes);
      if (p.rounds) {
        label.classList.add('lc-rounds');
        const badge = document.createElement('em');
        badge.className = 'lc-badge';
        badge.textContent = 'New';
        label.querySelector('strong').appendChild(badge);
      }
      lc.appendChild(label);
    }
  }

  // ---- engineering track: role cards, company chips, what to expect
  const COMPANY_VALUES = { amazon: 'Leadership Principles', google: 'Googleyness', microsoft: 'growth mindset' };
  const ROUND2 = {
    bigtech: (senior) => 'Fundamentals and problem solving' + (senior ? ', plus system design' : '') + ', explained out loud',
    product: (senior) => 'Fundamentals, problem solving and ' + (senior ? 'system design' : 'object-oriented design'),
    services: () => 'CS fundamentals (OOP, DBMS, OS, networks, SDLC) and your role',
    startup: (senior) => 'Your role and practical engineering: debugging, shipping, trade-offs' + (senior ? ', plus design' : ''),
  };

  function renderEngineering() {
    const grid = $('#trole-grid');
    grid.innerHTML = '';
    for (const [k, r] of Object.entries(Questions.ROLES)) {
      if (r.track !== 'tech') continue;
      const label = document.createElement('label');
      label.className = 'trole';
      label.innerHTML = '<input type="radio" name="techRole"><span class="trole-body"><span class="trole-ico" aria-hidden="true"></span><strong></strong><small></small></span>';
      label.querySelector('input').value = k;
      label.querySelector('.trole-ico').textContent = r.icon;
      label.querySelector('strong').textContent = r.label;
      label.querySelector('small').textContent = r.blurb;
      grid.appendChild(label);
    }
    const picker = $('#company-picker');
    picker.innerHTML = '';
    const kinds = Object.entries(Questions.KINDS).sort((a, b) => a[1].order - b[1].order);
    for (const [kind, meta] of kinds) {
      const group = document.createElement('div');
      group.className = 'co-group';
      group.innerHTML = '<span class="co-kind"></span><div class="co-chips"></div>';
      group.querySelector('.co-kind').textContent = meta.label;
      for (const [id, c] of Object.entries(Questions.COMPANIES)) {
        if (c.kind !== kind) continue;
        const chip = document.createElement('label');
        chip.className = 'co-chip co-' + kind;
        chip.innerHTML = '<input type="radio" name="company"><span></span>';
        chip.querySelector('input').value = id;
        chip.querySelector('span').textContent = c.display || c.name;
        group.querySelector('.co-chips').appendChild(chip);
      }
      picker.appendChild(group);
    }
  }

  /** "Incoming call" preview: who calls, their style, and the two rounds. */
  function renderCompanyBrief() {
    const c = Questions.COMPANIES[settings.company] || Questions.COMPANIES.generic;
    const role = Questions.ROLES[settings.techRole] || Questions.ROLES.fullstack;
    const senior = settings.experience === 'experienced';
    const values = COMPANY_VALUES[settings.company] || (c.kind === 'services' ? 'learning, teamwork, relocation and shifts' : c.kind === 'startup' ? 'ownership and speed' : 'ownership and collaboration');
    const brief = $('#company-brief');
    brief.innerHTML = '<div class="cb-call"><span class="cb-ring" aria-hidden="true"></span><span class="cb-who"><small>Incoming call</small><strong></strong></span><span class="cb-role"></span></div>' +
      '<p class="cb-style"></p><ol class="cb-rounds"><li><b>1</b><span><strong>Communication &amp; thought process</strong><small class="cb-r1"></small></span></li>' +
      '<li><b>2</b><span><strong>Technical interview</strong><small class="cb-r2"></small></span></li></ol>';
    brief.querySelector('.cb-who strong').textContent = INTERVIEWER + ' · ' + c.from;
    brief.querySelector('.cb-role').textContent = role.icon + ' ' + role.label + (senior ? ' · Experienced' : ' · Fresher');
    brief.querySelector('.cb-style').textContent = c.style;
    brief.querySelector('.cb-r1').textContent = 'You, your projects, how you think, and ' + values;
    brief.querySelector('.cb-r2').textContent = (ROUND2[c.kind] || ROUND2.product)(senior);
    const cmd = $('#eng-cmd-text');
    if (cmd) cmd.textContent = 'tushar-ai interview --role ' + settings.techRole + ' --company ' + settings.company.replace(/_/g, '-') + ' --level ' + settings.experience + ' --loop ' + settings.length;
  }

  /** Show the chosen track: the engineering panel or the BPO role, and matching lengths. */
  function applyTrack() {
    const tech = settings.track === 'tech';
    $('#eng-panel').hidden = !tech;
    $('#bpo-role-field').hidden = tech;
    form.classList.toggle('is-tech', tech);
    const check = (name, value) => {
      const el = form.querySelector('input[name="' + name + '"][value="' + value + '"]');
      if (el) el.checked = true;
    };
    check('track', settings.track);
    check('techRole', settings.techRole);
    check('company', settings.company);
    renderLengths(settings.track);
    if (tech) renderCompanyBrief();
    const go = $('#btn-continue');
    const label = tech ? 'Go live: start the engineering interview' : 'Go live: start the interview';
    if (go.lastChild && go.lastChild.nodeType === 3) go.lastChild.textContent = label;
  }

  function setupRest() {
    $('#f-accent').value = settings.accent;
    $('#f-silence').value = String(settings.silenceSec);
    $('#f-rate').value = String(settings.rate);
    $('#rate-out').textContent = Number(settings.rate).toFixed(2).replace(/0$/, '') + '×';
    $('#f-record').checked = settings.record;
    $('#f-coach').checked = settings.liveCoach !== false;
    $('#f-record').disabled = !window.MediaRecorder;
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
    const track = fd.get('track') === 'tech' ? 'tech' : 'bpo';
    const bpoRole = fd.get('role') || settings.bpoRole || 'voice';
    const techRole = fd.get('techRole') || settings.techRole || 'fullstack';
    settings = Object.assign({}, settings, {
      name: String(fd.get('name') || '').trim().slice(0, 60),
      track,
      bpoRole,
      techRole,
      company: fd.get('company') || settings.company || 'generic',
      role: track === 'tech' ? techRole : bpoRole,
      experience: fd.get('experience') || 'fresher',
      length: fd.get('length') || 'standard',
      accent: fd.get('accent') || 'en-US',
      silenceSec: Number(fd.get('silenceSec') == null ? 3 : fd.get('silenceSec')),
      interviewerVoice: fd.get('interviewerVoice') || '',
      customerVoice: fd.get('customerVoice') || '',
      rate: Number(fd.get('rate') || 1),
      record: $('#f-record').checked,
      liveCoach: $('#f-coach').checked,
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
    if (e.target.id === 'f-accent') settings.accentChosen = true;
    readSetup();
    if (e.target.id === 'f-accent') populateVoices();
    if (e.target.name === 'track') applyTrack();
    else if (settings.track === 'tech' && ['techRole', 'company', 'experience', 'length'].indexOf(e.target.name) !== -1) renderCompanyBrief();
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
      note.textContent = 'Please enter your name. ' + INTERVIEWER + ' will use it, and it goes on your scoresheet.';
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
    keepAwake(true); // inside the tap: some browsers only grant it then
    startCall();
  });

  // ------------------------------------------------------------ history
  // ------------------------------------------------------------ progress
  /** Every practice drill's date, across saved scoresheets. */
  function drillDates() {
    const all = store.get(DRILL_KEY, {}) || {};
    const out = [];
    for (const sheetId of Object.keys(all)) for (const qid of Object.keys(all[sheetId])) for (const a of all[sheetId][qid]) if (a.at) out.push(a.at);
    return out;
  }

  function renderProgress(list) {
    const box = $('#progress');
    // Older entries have no skill scores: read them from the saved scoresheet once.
    let changed = false;
    for (const h of list) {
      if (h.dims) continue;
      const sheet = store.get(SHEET_PREFIX + h.id, null);
      h.dims = sheet ? dimsOf(sheet) : {};
      h.track = sheet ? sheet.track || 'bpo' : 'bpo';
      changed = true;
    }
    if (changed) store.set(HISTORY_KEY, list);
    const labels = {};
    for (const d of Scoring.DIMENSIONS) labels[d.key] = d.short;
    const p = AII.Progress ? AII.Progress.summarize(list, { labels, drillDates: drillDates() }) : null;
    box.hidden = !p;
    if (!p) return;
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const sign = (n) => (n > 0 ? '+' + n : String(n));
    const delta = p.count > 1
      ? '<span class="pg-delta ' + (p.change > 0 ? 'up' : p.change < 0 ? 'down' : '') + '">' + sign(p.change) + ' since your first interview</span>'
      : '<span class="pg-delta">Your first interview. Do another to see your progress.</span>';
    const meta = [p.streak ? '🔥 ' + p.streak + '-day streak' : null, p.count + (p.count === 1 ? ' interview' : ' interviews'), p.drills ? p.drills + (p.drills === 1 ? ' drill' : ' drills') : null, 'best ' + p.best].filter(Boolean).join(' · ');
    const skills = p.skills.map((s) => '<li><span class="pg-k">' + esc(s.label) + '</span><span class="pg-bar"><i style="width:' + Math.max(2, Math.min(100, s.latest)) + '%"></i></span><b>' + s.latest + '</b>' +
      (p.count > 1 && s.change ? '<em class="' + (s.change > 0 ? 'up' : 'down') + '">' + sign(s.change) + '</em>' : '<em></em>') + '</li>').join('');
    box.innerHTML = '<div class="pg-main"><span class="eyebrow">' + (p.track === 'tech' ? 'Engineering interviews' : 'Customer service interviews') + '</span>' +
      '<div class="pg-score"><strong>' + p.latest + '</strong>' + delta + '</div>' + AII.Progress.sparkline(p.trend, 240, 60) +
      '<div class="pg-meta">' + esc(meta) + '</div></div>' +
      '<ul class="pg-skills">' + skills + '</ul>' +
      (p.weakest ? '<div class="pg-cta"><span>Weakest right now: <strong>' + esc(p.weakest.label) + ' (' + p.weakest.latest + ')</strong></span>' +
        '<button class="btn btn-small btn-drill" type="button" id="pg-practise">🎯 Practise your weakest answers</button></div>' : '');
    const btn = $('#pg-practise');
    if (btn) {
      btn.addEventListener('click', async () => {
        const latest = list.filter((h) => (h.track || 'bpo') === p.track).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
        const sheet = latest && store.get(SHEET_PREFIX + latest.id, null);
        if (!sheet) return;
        const clips = await Recorder.loadClips(sheet.id).catch(() => []);
        showReport(sheet, { clips });
        const card = $('#rep-practice');
        if (card) setTimeout(() => card.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
      });
    }
  }

  function renderHistory() {
    const list = store.get(HISTORY_KEY, []);
    $('#history-card').hidden = !list.length;
    if (list.length) renderProgress(list);
    const ul = $('#history-list');
    ul.innerHTML = '';
    for (const h of list) {
      const li = document.createElement('li');
      li.innerHTML = '<span class="history-score"></span><span class="history-meta"><strong></strong><br><span class="muted small"></span></span>' +
        '<span class="history-actions"><button class="btn" type="button" data-act="view">View</button><button class="btn btn-ghost btn-danger" type="button" data-act="del" aria-label="Delete">✕</button></span>';
      li.querySelector('.history-score').textContent = h.overall;
      li.querySelector('strong').textContent = h.name + ' — ' + h.verdict;
      li.querySelector('.muted').textContent = h.role + (h.company ? ' · ' + h.company : '') + (h.integrity && h.integrity !== 'Clean' ? ' · Integrity: ' + h.integrity : '') + ' · ' + new Date(h.createdAt).toLocaleString();
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

  function dimsOf(sheet) {
    const out = {};
    for (const d of sheet.dimensions || []) out[d.key] = d.score;
    return out;
  }

  /** Save the scoresheet (localStorage) and its recordings (IndexedDB). Resolves the clip-save result. */
  async function saveSheet(sheet, clips) {
    const list = store.get(HISTORY_KEY, []).filter((x) => x.id !== sheet.id);
    list.unshift({ id: sheet.id, name: sheet.candidate.name, role: sheet.role.label, overall: sheet.overall, verdict: sheet.verdict.label, track: sheet.track || 'bpo', dims: dimsOf(sheet), company: sheet.company ? sheet.company.display || sheet.company.name : null, integrity: sheet.proctoring && sheet.proctoring.rating ? sheet.proctoring.rating.label : null, createdAt: sheet.createdAt });
    while (list.length > 12) {
      const old = list.pop();
      store.del(SHEET_PREFIX + old.id);
      Recorder.deleteClips(old.id);
    }
    if (!store.set(SHEET_PREFIX + sheet.id, sheet)) return { ok: false, where: 'none' };
    store.set(HISTORY_KEY, list);
    if (!clips || !clips.length) return { ok: true, where: 'none' };
    // If storage is full, make room by dropping the oldest interview's recordings.
    const tried = new Set([sheet.id]);
    const evict = () => {
      const ids = store.get(HISTORY_KEY, []).map((h) => h.id).reverse(); // oldest first
      const victim = ids.find((id) => !tried.has(id)) || null;
      if (victim) tried.add(victim);
      return victim;
    };
    return Recorder.saveClips(sheet.id, clips, { evict });
  }

  // ------------------------------------------------------------ media
  /**
   * Open the microphone, and the answer recorder on the same stream. opts.fresh reopens
   * it even while one is open: only a new stream picks up a newly plugged-in or newly
   * selected microphone. A microphone that was disconnected is always reopened.
   */
  async function ensureMic(opts) {
    const given = opts && opts.stream; // already open (asked for together with the camera)
    const fresh = !!(opts && opts.fresh) || !!given;
    if (!fresh && state.meter && state.meter.running) return { ok: true };
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return { ok: false, message: 'This browser cannot use the microphone on this page. Open it in Chrome or Edge on https or http://localhost.' };
    }
    const old = state.meter;
    const m = Audio.createMeter();
    state.meter = m;
    try {
      await m.start(given || undefined);
      // The call was left while the microphone was opening: release it straight away.
      if (state.meter !== m) {
        m.stop();
        if (old) old.stop();
        return { ok: false, aborted: true, message: 'The interview was closed.' };
      }
      if (old) old.stop();
      // A recorder is tied to its stream: record on the new one.
      if (state.recorder) state.recorder.discard();
      state.recorder = settings.record && Recorder && m.stream ? Recorder.createRecorder(m.stream) : null;
      return { ok: true };
    } catch (err) {
      // Keep the old microphone if it still works (a fresh reopen that failed).
      if (state.meter === m) state.meter = old && old.running ? old : null;
      if (old && state.meter !== old) old.stop();
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

  const CAMERA_CONSTRAINTS = { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' };

  /**
   * Ask for the microphone and the camera in one request: phones otherwise show two prompts.
   * Resolves the stream, or null (then each is asked for on its own, with a clear message).
   */
  async function openMedia(want) {
    const w = Object.assign({ audio: true, video: true }, want);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return null;
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: w.audio ? Audio.AUDIO_CONSTRAINTS : false, video: w.video ? CAMERA_CONSTRAINTS : false });
    } catch (e) {
      return null;
    }
  }

  // Keep the screen on during the call. Phones turn it off after about 30 s without a touch
  // (and this call is hands-free), which stops the camera and the microphone.
  let wakeLock = null;
  let wakeHeld = false; // granted for this call (browsers drop it while the page is hidden)
  async function keepAwake(on) {
    try {
      if (!on) {
        wakeHeld = false;
        const w = wakeLock;
        wakeLock = null;
        if (w) await w.release();
        return;
      }
      if (wakeLock || !navigator.wakeLock || document.visibilityState !== 'visible') return;
      const w = await navigator.wakeLock.request('screen');
      if (!state.running || wakeLock) {
        w.release(); // the call ended meanwhile, or another request was granted first
        return;
      }
      wakeLock = w;
      wakeHeld = true;
      w.addEventListener('release', () => { if (wakeLock === w) wakeLock = null; });
    } catch (e) {
      /* not supported, or refused (battery saver): the screen may still turn off */
    }
  }

  /**
   * Back from a locked screen or another app: phones may have stopped the microphone or the
   * camera. Reopen whichever stopped, in one request. Resolves true if anything was reopened.
   */
  let reviving = null;
  function reviveMedia() {
    if (reviving) return reviving;
    reviving = (async () => {
      const micDead = !!state.meter && !state.meter.running;
      const camDead = !!state.camStream && !cameraLive();
      if (!state.running || (!micDead && !camDead)) return false;
      const s = await openMedia({ audio: micDead, video: camDead });
      if (!s || !state.running) {
        if (s) s.getTracks().forEach((tr) => tr.stop());
        return false; // the lost microphone / camera prompts take over
      }
      if (micDead) await ensureMic({ stream: new MediaStream(s.getAudioTracks()) });
      if (camDead) await ensureCamera({ stream: new MediaStream(s.getVideoTracks()) });
      return true;
    })().finally(() => { reviving = null; });
    return reviving;
  }

  const cameraLive = () => !!(state.camStream && state.camStream.getVideoTracks().some((t) => t.readyState === 'live'));

  /** Open the camera. It is required: the interview is AI-proctored. */
  async function ensureCamera(opts) {
    const given = opts && opts.stream; // already open (asked for together with the microphone)
    if (!given && cameraLive()) return { ok: true };
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return { ok: false, message: 'This browser cannot use the camera on this page. Open it in Chrome or Edge on https or http://localhost.' };
    }
    const gen = state.callGen;
    try {
      const s = given || await navigator.mediaDevices.getUserMedia({ video: CAMERA_CONSTRAINTS });
      // The camera opened after the call ended (slow permission prompt): turn it straight off.
      if (gen !== state.callGen || !state.running) {
        s.getTracks().forEach((tr) => tr.stop());
        return { ok: false, aborted: true, message: 'The interview was closed.' };
      }
      if (state.camStream) state.camStream.getTracks().forEach((tr) => tr.stop());
      state.camStream = s;
      const v = $('#cam');
      v.srcObject = s;
      await v.play().catch(() => {});
      $('#proctor-tile').hidden = false;
      return { ok: true };
    } catch (err) {
      const denied = err && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
      return {
        ok: false,
        denied,
        message: denied
          ? 'Camera access is blocked. This interview is AI-proctored, so the camera is required. Click the 🔒 or camera icon in the address bar, allow the camera, then press Try again.'
          : 'No working camera was found (' + ((err && (err.name || err.message)) || 'unknown') + '). This interview is AI-proctored, so a camera is required. Connect one, then press Try again.',
      };
    }
  }

  function stopMedia() {
    keepAwake(false);
    if (state.proctor) state.proctor.stop();
    state.proctor = null;
    state.watching = false;
    if (state.camStream) state.camStream.getTracks().forEach((t) => t.stop());
    state.camStream = null;
    $('#cam').srcObject = null;
    $('#proctor-tile').hidden = true;
    if (state.recorder) state.recorder.discard();
    state.recorder = null;
    if (state.meter) state.meter.stop();
    state.meter = null;
  }

  // ------------------------------------------------------------ call UI
  const STATE_TEXT = { idle: 'Connecting…', speaking: INTERVIEWER + ' is speaking…', listening: 'Listening… go ahead', thinking: 'One moment…' };

  function setUi(mode, text) {
    state.ui = mode;
    const orb = $('#orb');
    orb.dataset.state = mode === 'speaking' && $('#avatar').classList.contains('customer') ? 'customer' : mode;
    const st = $('#state-pill');
    st.dataset.state = mode;
    const t = text || STATE_TEXT[mode] || '';
    if (st.textContent !== t) st.textContent = t;
  }

  /**
   * Announce to screen readers only states that have no sound of their own.
   * (The visible status is not a live region: a screen reader reading "Listening"
   * aloud into the open microphone would be transcribed as the answer.)
   */
  function announce(text) {
    const el = $('#sr-status');
    if (el.textContent !== text) el.textContent = text;
  }

  function setPersona(who) {
    const live = state.call && !$('#caller-card').hidden;
    $('#avatar').classList.toggle('customer', who === 'customer');
    $('#who-label').textContent = who === 'customer' ? (live ? state.call.customerName + ' · Live call' : 'Customer · mock call') : INTERVIEWER + ' · ' + (state.drill ? 'Practice drill' : state.company ? (state.company.id === 'generic' ? 'Tech interview' : (state.company.display || state.company.name) + ' interview') : 'Interviewer');
    $('#cap-who').textContent = who === 'customer' ? (live ? state.call.customerName : 'Customer') : INTERVIEWER;
  }

  const clock = (ms) => {
    const sec = Math.max(0, Math.round(ms / 1000));
    return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
  };
  const BANNER_HTML = $('#roleplay-banner').innerHTML;
  const MOOD_LABEL = (m) => (m >= 80 ? 'Furious' : m >= 60 ? 'Upset' : m >= 40 ? 'Uneasy' : m >= 20 ? 'Calm' : 'Happy');

  /** The 4-round assessment: the round stepper, the topic card and the live caller card. */
  function renderRound(step) {
    const bar = $('#rounds-bar');
    const r = step.round;
    bar.hidden = !r;
    $('#dots').hidden = !!r && !r.multi; // engineering rounds hold several questions: keep the dots
    if (r) {
      const rounds = r.multi ? r.of : state.session && state.session.plan ? state.session.plan.length : r.of;
      if (bar.children.length !== rounds) {
        bar.innerHTML = '';
        const titles = r.titles ? r.titles.map((title) => ({ title })) : (Questions.PLANS[settings.length] && Questions.PLANS[settings.length].rounds) || [];
        for (let i = 0; i < rounds; i++) {
          const li = document.createElement('li');
          li.innerHTML = '<span class="rb-n">' + (i + 1) + '</span><span class="rb-t"></span>';
          li.querySelector('.rb-t').textContent = titles[i] ? titles[i].title : 'Round ' + (i + 1);
          bar.appendChild(li);
        }
      }
      Array.from(bar.children).forEach((li, i) => { li.className = i < r.n - 1 ? 'done' : i === r.n - 1 ? 'now' : ''; });
      $('#room-q').textContent = 'Round ' + r.n + ' of ' + r.of + ' · ' + r.title + (r.multi ? ' · Question ' + (step.index + 1) + ' of ' + step.total : '');
    }
    // Topic talk: the word, big, with the time left.
    const tc = $('#topic-card');
    tc.hidden = !step.topic;
    if (step.topic) {
      $('#topic-word').textContent = step.topic.word;
      $('#topic-time').textContent = clock(Math.min(180000, (step.maxSeconds || 180) * 1000));
      $('#topic-angles').textContent = step.topic.angles && step.topic.angles.length ? 'Ideas: ' + step.topic.angles.join(' · ') : '';
    }
    // Live call: who is calling, what about, how angry they are, and the call clock.
    const cc = $('#caller-card');
    const call = step.call;
    if (!call) {
      if (!cc.hidden) $('#roleplay-banner').innerHTML = BANNER_HTML;
      cc.hidden = true;
      if (state.callTimer) clearInterval(state.callTimer);
      state.callTimer = null;
      state.callStart = 0;
      state.call = null;
      return;
    }
    state.call = call;
    if (cc.hidden) {
      cc.hidden = false;
      $('#caller-avatar').textContent = call.customerName.split(/\s+/).map((w) => w.charAt(0)).join('').slice(0, 2).toUpperCase();
      $('#caller-name').textContent = call.customerName;
      $('#caller-meta').textContent = call.persona + ' · ' + call.scenario;
      const banner = $('#roleplay-banner');
      banner.innerHTML = '<span class="tally" aria-hidden="true"></span><strong>Live call:</strong> ';
      banner.appendChild(document.createTextNode('you are the support agent at ' + call.company + '. Help the customer as you would on the floor.'));
    }
    const mood = Math.max(0, Math.min(100, call.mood));
    cc.style.setProperty('--mood', String(mood));
    cc.dataset.trend = call.delta == null ? '' : call.delta > 2 ? 'up' : call.delta < -2 ? 'down' : '';
    $('#caller-mood-label').textContent = MOOD_LABEL(mood);
    $('#mood-meter').setAttribute('aria-valuenow', String(mood));
    $('#mood-meter').setAttribute('aria-valuetext', MOOD_LABEL(mood) + ', anger ' + mood + ' of 100');
  }

  function startCallClock() {
    if (state.callStart) return;
    state.callStart = performance.now();
    const tick = () => { $('#caller-timer').textContent = clock(performance.now() - state.callStart) + ' / 3:00'; };
    tick();
    state.callTimer = setInterval(tick, 500);
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
    renderRound(step);
  }

  /** persist=false for automatic fallbacks, so only the candidate's own choice is remembered. */
  function setCaptions(on, persist) {
    if (persist !== false) {
      settings.showCaptions = on;
      store.set(SETTINGS_KEY, settings);
    }
    $('#captions').hidden = !on;
    $('#btn-cc').setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  // Toggle what is on screen (captions may have been switched on automatically).
  const toggleCaptions = () => setCaptions($('#captions').hidden);
  $('#btn-cc').addEventListener('click', toggleCaptions);

  function notice(msg, withActions) {
    const n = $('#notice');
    n.textContent = msg || '';
    n.hidden = !msg;
    $('#notice-actions').hidden = !withActions;
  }

  /** Wait for "Try again" (true) or "Continue anyway" (false). */
  /** opts.noSkip hides "Continue anyway" (for what the interview cannot go on without). */
  function waitForUser(message, opts) {
    notice(message, true);
    announce(message);
    $('#btn-continue-anyway').hidden = !!(opts && opts.noSkip);
    $('#btn-retry-mic').focus();
    return new Promise((resolve) => {
      state.userAction = (v) => {
        state.userAction = null;
        $('#btn-continue-anyway').hidden = false;
        notice('');
        // Keep keyboard focus inside the call rather than dropping it to the page.
        if (!$('#screen-interview').hidden) $('#btn-cc').focus();
        resolve(v);
      };
    });
  }
  $('#btn-retry-mic').addEventListener('click', () => state.userAction && state.userAction(true));
  $('#btn-continue-anyway').addEventListener('click', () => state.userAction && state.userAction(false));

  function startElapsed() {
    clearInterval(state.elapsedTimer);
    if (state.callTimer) clearInterval(state.callTimer);
    state.elapsedTimer = setInterval(() => {
      const s = Math.floor((Date.now() - state.startedAt) / 1000);
      $('#room-elapsed').textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    }, 1000);
  }

  // Captions: the interviewer's words (with the current word highlighted) and the candidate's live words.
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
  /**
   * Put the candidate's typed name back where speech recognition misheard it, only where a
   * name belongs ("I am tishar chadne" → "I am Tushar Chandane"; see Voice.correctNames).
   */
  function fixNames(text) {
    const name = String((settings && settings.name) || '').trim();
    if (!name || !text) return text;
    return Voice.correctNames(text, [name], { common: AII.Lexicons ? AII.Lexicons.COMMON_WORDS : null });
  }
  /** The same for live words: "I am" may already be final while the name is still interim. */
  function fixNamesLive(fin, interim) {
    const f = fixNames(fin);
    if (!interim) return [f, interim];
    const both = fixNames(String(fin || '').trim() + ' ' + interim);
    const head = String(f || '').trim();
    if (head && both.startsWith(head + ' ')) return [f, both.slice(head.length + 1)];
    return [f, head ? fixNames(interim) : both];
  }
  /** The candidate's words as the interviewer understood them (latest words kept in view). */
  /** Live coaching under the candidate's words (null hides it). */
  function renderCoach(c) {
    const box = $('#coach');
    if (!c || !c.words) {
      if (!box.hidden) box.hidden = true;
      return;
    }
    box.hidden = false;
    const set = (k, item) => {
      const el = box.querySelector('[data-k="' + k + '"]');
      el.hidden = !item;
      if (!item) return;
      const text = k === 'time' ? '⏱ ' + item.label : k === 'pace' ? item.label + ' · ' + item.wpm + ' wpm' : item.label;
      if (el.textContent !== text) el.textContent = text;
      if (el.dataset.tone !== item.tone) el.dataset.tone = item.tone;
    };
    set('time', c.time);
    set('pace', c.pace);
    set('fillers', c.fillers);
    const tip = $('#coach-tip');
    tip.hidden = !c.tip;
    if (c.tip && tip.textContent !== c.tip) tip.textContent = c.tip;
  }

  function renderYou(fin, interim) {
    const live = $('#live');
    const f = String(fin || '').trim();
    const i = String(interim || '').trim();
    live.textContent = f ? f + ' ' : '';
    if (i) {
      const s = document.createElement('span');
      s.className = 'interim';
      s.textContent = i;
      live.appendChild(s);
    }
    live.scrollTop = live.scrollHeight; // a long answer keeps its latest words in view
  }

  /**
   * The "You" panel: mode is idle | aria (dimmed while the interviewer talks) | waiting | hearing |
   * words | working | heard | problem. placeholder shows while no words are on screen.
   */
  function youPanel(mode, label, placeholder) {
    const p = $('#you-panel');
    if (p.dataset.state !== mode) p.dataset.state = mode;
    if (label != null && $('#you-label').textContent !== label) $('#you-label').textContent = label;
    if (placeholder != null && $('#live').dataset.placeholder !== placeholder) $('#live').dataset.placeholder = placeholder;
  }

  // The orb breathes with whoever is talking: the interviewer's speech or the candidate's mic level.
  let orbRaf = 0;
  let orbLvl = 0;
  let mouthLevel = 0;
  let speakingSince = 0;
  let lastBoundary = 0;
  const BAR_GAIN = [0.55, 0.85, 1.15, 0.8, 0.6];
  let barLvl = 0;
  function orbLoop() {
    const now = performance.now();
    // Mic bars: how loud the candidate is right now (only while we listen).
    const listeningNow = state.ui === 'listening' && state.meter;
    barLvl += ((listeningNow ? state.meter.level : 0) - barLvl) * 0.35;
    $$('#mic-bars i').forEach((b, i) => {
      const wobble = barLvl > 0.08 ? 0.75 + 0.25 * Math.sin(now / 90 + i * 1.7) : 1;
      b.style.transform = 'scaleY(' + (0.15 + 0.85 * Math.min(1, barLvl * 1.8 * BAR_GAIN[i] * wobble)).toFixed(3) + ')';
    });
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
  const UA = navigator.userAgent || '';
  const IS_ANDROID = /Android/i.test(UA);
  const IS_MOBILE = IS_ANDROID || /iPhone|iPad|iPod/i.test(UA);
  // A short gap after the interviewer stops: audio output lags behind the "end" event, and
  // recognisers use their first ~300 ms of audio to measure the room's noise.
  const GUARD_MS = IS_MOBILE ? 450 : 300;

  function ttsUsable() {
    return Speech.ttsSupported && state.ttsOk !== false;
  }

  function wordsIn(text) {
    return String(text || '').split(/\s+/).filter(Boolean).length;
  }

  /**
   * Some browsers (iOS) silently refuse to speak until the page is tapped.
   * Resolves true after a tap, false if the call was ended or left meanwhile.
   */
  function waitForTap() {
    if (state.cancelTap) state.cancelTap();
    notice('Tap the button so your browser lets ' + INTERVIEWER + ' speak.');
    const btn = $('#btn-tap-audio');
    btn.hidden = false;
    btn.focus();
    return new Promise((resolve) => {
      const close = (tapped) => {
        btn.onclick = null;
        btn.hidden = true;
        state.cancelTap = null;
        notice('');
        resolve(tapped);
      };
      state.cancelTap = () => close(false);
      btn.onclick = () => {
        Speech.unlock();
        Audio.prime();
        close(true);
      };
    });
  }

  /** A soft "your turn" tone, like a call system. Skipped on Android, whose recogniser may beep itself. */
  function earcon() {
    if (IS_ANDROID) return;
    try {
      const ctx = Audio.prime();
      if (!ctx || ctx.state !== 'running') return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      const t = ctx.currentTime;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.05, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.1);
    } catch (e) { /* purely cosmetic */ }
  }

  /**
   * Speak { text, voice } segments. opts.hideText marks the spoken-only listening test:
   * its details are never shown in captions (unless the browser cannot speak at all).
   */
  async function say(segments, opts) {
    const o = opts || {};
    // Keep what the candidate said on screen (dimmed) while the interviewer replies; a confirmation
    // ("✓ Got it") or a problem stays bright while she talks about it.
    if (!o.keepYou && /^(waiting|hearing|words|working)$/.test($('#you-panel').dataset.state)) youPanel('aria');
    for (const seg of segments) {
      if (state.endRequested && !o.force) break;
      await Speech.onceVisible(); // never talk into a hidden tab
      setPersona(seg.voice);
      const hidden = o.hideText && seg.text === o.hiddenText;
      // Up to two taps for blocked speech, then one captions-only pass if speech never works.
      for (let attempt = 0; attempt < 4; attempt++) {
        const muted = !ttsUsable();
        if (hidden && !muted) captionPlain(o.display || 'Listen carefully…', '(spoken only)');
        else captionWords(seg.text);
        setUi('speaking', seg.voice === 'customer' ? 'The customer is speaking…' : INTERVIEWER + ' is speaking…');
        speakingSince = performance.now();
        lastBoundary = 0;
        const hiddenBefore = state.hiddenCount;
        const voice = seg.voice === 'customer' ? state.voices.customer : state.voices.interviewer;
        const r = await Speech.speak(seg.text, {
          voice,
          rate: seg.voice === 'customer' ? Math.min(1.3, settings.rate * 1.05) : settings.rate,
          pitch: seg.voice === 'customer' ? 0.95 : 1.02,
          muted,
          mutedDelayMs: Math.max(hidden ? 4000 : 1500, wordsIn(seg.text) * (hidden ? 300 : 280)),
          onBoundary: (i) => {
            lastBoundary = performance.now();
            mouthLevel = 1;
            if (!hidden) highlightWordAt(i);
          },
        });
        speakingSince = 0;
        highlightWordAt(-1);
        if (r && r.blocked) {
          // After End, never hold the candidate on a tap prompt (not even for the goodbye).
          if (state.endRequested) break;
          if (attempt < 2) {
            const tapped = await waitForTap();
            if (!tapped || state.endRequested) break;
            continue;
          }
          // Still refused after two taps: never treat unheard speech as spoken.
          state.ttsOk = false;
          setCaptions(true, false);
          continue;
        }
        if (r && r.failed) {
          // The voice engine is broken (e.g. no voices installed): continue with captions.
          state.ttsOk = false;
          setCaptions(true, false);
          continue;
        }
        if (state.hiddenCount !== hiddenBefore && !state.endRequested && attempt < 2) {
          // The tab was hidden mid-sentence (speech was cut): say it again on return.
          await Speech.onceVisible();
          continue;
        }
        break;
      }
      state.lastSpoken = seg.text;
      if (segments.length > 1) await sleep(220);
    }
  }

  async function pickVoices() {
    await Speech.loadVoices();
    state.voices = Speech.pickVoices({ accent: settings.accent, interviewerVoice: settings.interviewerVoice, customerVoice: settings.customerVoice });
    // No voices at all (some Linux browsers): use captions with reading-time pacing.
    if (Speech.ttsSupported && !Speech.hasVoices()) {
      state.ttsOk = false;
      if (!$('#screen-interview').hidden) setCaptions(true, false);
    }
  }

  // ------------------------------------------------------------ listening (hands-free)
  function stepQuestion(step) {
    return step && Questions.byId[step.questionId];
  }

  function showPromptCaption(step) {
    if (step.hideText) captionPlain(step.prompt);
    else captionWords(step.prompt);
    renderThinkCard(step.kind === 'roleplay' ? null : stepQuestion(step));
  }

  // Engineering problems and designs: the steps interviewers listen for, ticked live as they are heard.
  let thinkQ = null;
  function renderThinkCard(q) {
    const box = $('#think-card');
    const kind = AII.Coach ? AII.Coach.approachKind(q) : null;
    // A follow-up on the same question keeps the steps already heard.
    if (kind && thinkQ && q && thinkQ.id === q.id && !box.hidden) return;
    thinkQ = kind ? q : null;
    box.hidden = !kind;
    if (!kind) return;
    const f = AII.Coach.APPROACH[kind];
    box.innerHTML = '<span class="tk-title"></span><ol class="tk-steps"></ol>';
    box.querySelector('.tk-title').textContent = f.title + ':';
    const ol = box.querySelector('ol');
    for (const s of f.steps) {
      const li = document.createElement('li');
      li.dataset.step = s.id;
      li.textContent = s.short;
      li.title = s.label;
      ol.appendChild(li);
    }
  }
  function tickThinkCard(text) {
    if (!thinkQ) return;
    const steps = AII.Coach.approach(thinkQ, text) || [];
    for (const s of steps) {
      const li = $('#think-card [data-step="' + s.id + '"]');
      if (li && s.hit) li.classList.add('hit'); // once heard, a step stays ticked
    }
  }

  // One-word starts that are lead-ins to a longer answer, not an answer on their own.
  const ONE_WORD_LEAD = /^(?:um+|uh+|hmm+|er+|ah+|oh|so|well|actually|okay|ok|alright|and|but|like|i|basically|see|right)$/;

  // The download outlives the call that started it: report progress only to a call that is waiting for it.
  const whisperProgress = (p) => {
    if (state.running && !state.endRequested && state.engine === 'whisper' && state.ui !== 'listening') {
      setUi('thinking', 'Downloading the offline speech model… ' + Math.round(p * 100) + '%');
    }
  };

  /**
   * Listen to one answer, hands-free. Resolves with the answer for the engine:
   * { text, mode, timing, audio, events, clip }.
   */
  function listenTurn(step) {
    return new Promise((resolve) => {
      const q = stepQuestion(step);
      const ctl = { done: false, busy: false, repeats: 0, nudges: 0, unsureSaid: false, unsureWords: 0, recoveries: 0, hiddenBusyAt: 0 };
      state.ctl = ctl;
      const gen = state.callGen; // a later call must never be driven by this turn
      const maxMs = (step.maxSeconds || 120) * 1000;
      const idealWords = q && q.ideal ? q.ideal[0] : null;
      const roleplay = step.kind === 'roleplay';
      // Where the candidate may say their own name (not the mock call, a listening test or a correction).
      const namesOk = !roleplay && !(q && (q.type === 'correction' || q.type === 'listening'));
      const listeningText = roleplay ? 'Your turn: talk to the customer' : 'Listening… go ahead';
      let t0 = performance.now();
      let rec = null;
      let timer = null;
      let lastText = '';
      let lastTextAt = performance.now();
      let settledText = '';
      let fatal = null;
      let hiddenAt = 0;
      let resumedAt = performance.now(); // silence is only counted from when listening (re)started
      // Live coaching: not for the listening test or a sentence correction (short, exact answers).
      const coachOn = settings.liveCoach !== false && !(q && (q.type === 'listening' || q.type === 'correction'));
      let firstWordAt = 0;
      let coachAt = 0;
      const pauses = [];                 // [from, to] while listening was paused, excluded from speaking time
      let pausedAt = 0;

      function begin() {
        if (state.endRequested) return finish({ command: 'end' });
        setPersona(roleplay ? 'customer' : 'interviewer');
        setCallHint(); // the engine may have changed (offline fallback)
        ctl.hiddenBusyAt = 0;
        ctl.unsureWords = 0;
        ctl.unsureSpokeMs = 0;
        lastText = '';
        settledText = '';
        lastTextAt = performance.now();
        resumedAt = performance.now();
        pauses.length = 0;
        pausedAt = 0;
        renderYou('', '');
        renderCoach(null);
        firstWordAt = 0;
        youPanel('waiting', 'Your turn', 'Start speaking… I’m listening.');
        const r = makeRecognizer({
          onUpdate: (fin, interim) => {
            // An aborted recogniser still reports once as it closes (after "skip", a repeat
            // or a recovery): never write its words back over the panel.
            if (ctl.done || rec !== r) return;
            if (namesOk) [fin, interim] = fixNamesLive(fin, interim);
            renderYou(fin, interim);
            const t = (fin + ' ' + interim).trim();
            if (t && !firstWordAt) firstWordAt = performance.now();
            if (t !== lastText) {
              lastText = t;
              lastTextAt = performance.now();
            }
            if (Voice.wordCount(t) >= 3) $('#btn-repeat').disabled = true;
          },
          onError: (code, message, isFatal) => {
            if (rec !== r) return;
            if (isFatal && !ctl.done) fatal = { code, message };
            else if (code === 'whisper-failed') notice('The offline speech model could not transcribe that answer. If this keeps happening, reload the page.');
          },
          onStatus: (text) => setUi(state.ui, text),
        });
        rec = r;
        if (state.meter) state.meter.beginSegment();
        if (state.recorder) state.recorder.start();
        rec.start();
        setUi('listening', listeningText);
        setButtons(true, true);
        timer = setInterval(tick, 150);
        // The tab was hidden just before listening began: pause straight away.
        if (document.hidden) ctl.onHidden();
      }

      function pauseListening() {
        clearInterval(timer);
        pausedAt = performance.now();
        if (rec) rec.pause();
        if (state.meter) state.meter.pauseSegment();
        if (state.recorder) state.recorder.pause();
      }
      function resumeListening() {
        if (pausedAt) pauses.push([pausedAt, performance.now()]);
        pausedAt = 0;
        resumedAt = performance.now();
        if (state.meter) state.meter.resumeSegment();
        if (state.recorder) state.recorder.resume();
        if (rec) rec.resume();
        setPersona(roleplay ? 'customer' : 'interviewer'); // an interjection may have switched to the interviewer
        setUi('listening', listeningText);
        timer = setInterval(tick, 150);
      }

      /** Listening stays paused because the tab is hidden; onVisible picks it up again. */
      function pauseForHidden() {
        hiddenAt = performance.now();
        setUi('idle', 'Paused. Come back to this tab to continue.');
        announce('Interview paused.');
      }

      /** The interviewer (or the customer) says something mid-answer, then listening continues. */
      async function interject(text, voice) {
        ctl.busy = true;
        pauseListening();
        await say([{ text, voice: voice || 'interviewer' }], { keepYou: true });
        if (ctl.done) return;
        await sleep(GUARD_MS);
        if (ctl.done) return;
        // Time spent in another tab while the interviewer was talking is not answering time.
        if (ctl.hiddenBusyAt) {
          t0 += performance.now() - ctl.hiddenBusyAt;
          ctl.hiddenBusyAt = 0;
        }
        ctl.busy = false;
        if (document.hidden) return pauseForHidden();
        showPromptCaption(step);
        resumeListening();
      }

      function tick() {
        if (ctl.done || ctl.busy || hiddenAt) return;
        // The microphone was unplugged or its Bluetooth link dropped: nothing more can be heard.
        // (This is the cause of any recogniser error it set off, so it is the one reported.)
        if (state.meter && !state.meter.running) fatal = { code: 'audio-capture', message: 'Your microphone was disconnected.', lost: true };
        // The camera is required: a disconnected one pauses the answer until it is back.
        if (!fatal && state.watching && !cameraLive()) fatal = { code: 'camera', message: 'Your camera was disconnected. This interview is AI-proctored, so it needs the camera.', lost: true, camera: true };
        if (fatal) return onFatal();
        if (state.terminated) return finish({ command: 'end' });
        // A proctoring warning is said straight away; listening carries on after it.
        if (state.warnQueue && state.warnQueue.length) return interject(state.warnQueue.shift());
        const now = performance.now();
        const elapsed = now - t0;
        setTimer(1 - elapsed / maxMs);
        if (step.topic) {
          const left = clock(Math.min(180000, maxMs - elapsed)); // three minutes to talk (plus a little time to think)
          if ($('#topic-time').textContent !== left) $('#topic-time').textContent = left;
        }
        const text = rec ? (rec.text() + ' ' + rec.interim()).trim() : '';
        const live = !!rec && rec.live !== false;
        const words = live ? Voice.wordCount(text) : null;
        if (coachOn && live && firstWordAt && now - coachAt > 900 && AII.Coach) {
          coachAt = now;
          renderCoach(AII.Coach.live({ text, speakingMs: now - firstWordAt, question: q }));
          // Follow-ups count too: the steps are about the whole answer.
          tickThinkCard(text);
        }
        const spokeMs = state.meter ? state.meter.segmentVoicedMs() : null;
        // Engines without live words need less voice before an answer counts as started,
        // so short replies ("No, thank you") still end normally.
        const startMs = live ? 1200 : 600;
        const sinceResume = now - resumedAt;
        // meterTrusted compares the meter with the browser's recogniser; the offline engine
        // transcribes the meter's own stream, so there the meter is always trusted.
        const sinceVoiceMs = state.meter && (state.meterTrusted !== false || !live) ? Math.min(state.meter.msSinceVoice(), sinceResume) : null;
        const sinceResultMs = live && rec.lastResultAt ? Math.min(now - rec.lastResultAt, sinceResume) : null;
        const current = text.startsWith(settledText) ? text.slice(settledText.length) : text;

        // Show the candidate that they are heard, and what is understood.
        const voiceNow = !!state.meter && state.meter.msSinceVoice() < 450;
        // (The offline engine adds its words phrase by phrase, at each pause.)
        if (text) youPanel('words', roleplay ? 'The customer hears' : INTERVIEWER + ' hears');
        else if (voiceNow) youPanel('hearing', live ? 'I can hear you…' : 'Recording your answer…');
        else if (live && spokeMs > 400) youPanel('hearing', 'Working out your words…');
        else youPanel('waiting', 'Your turn', !live && spokeMs >= 250 ? 'Keep going. I’ll write down your answer when you finish.' : 'Start speaking… I’m listening.');

        // Spoken commands, acted on once the words AND the microphone have been quiet for a moment.
        const settledFor = Math.min(now - lastTextAt, sinceVoiceMs == null ? Infinity : sinceVoiceMs);
        let cue = null;
        if (live && text) {
          const cmd = Voice.parseCommand(text, current);
          if (settledFor > 1200) {
            if (cmd.command === 'repeat' && ctl.repeats < 3) return repeat(true);
            if (cmd.command === 'skip') return finish({ skipped: true, command: 'skip' });
            if (cmd.command === 'unsure' && !ctl.unsureSaid) {
              ctl.unsureSaid = true;
              // "I don't know" is kept for scoring, but the answer only counts as started
              // with what comes after the interviewer's invitation to think.
              ctl.unsureWords = words;
              ctl.unsureSpokeMs = spokeMs || 0;
              ctl.nudges = Math.max(ctl.nudges, 1);
              settledText = text;
              interject("That's okay. Take a moment to think, or say skip to move on.");
              return;
            }
          }
          if (cmd.command === 'done') cue = cmd.strength;
        }
        // Words before a clear pause are settled; anything after is the current utterance.
        // Only once the command check above has seen them settle too (its clock can lag this
        // one by a fraction of a millisecond), or a "skip" could be settled before it is acted on.
        const quiet = Math.min(sinceVoiceMs == null ? Infinity : sinceVoiceMs, sinceResultMs == null ? Infinity : sinceResultMs);
        if (quiet >= 1200 && settledFor > 1200 && text) settledText = text;

        // The mic heard a voice, then a pause, but the recogniser returned nothing: ask again, then switch engine.
        if (live && words === 0 && spokeMs >= 2500 && elapsed > 6000 && state.meterTrusted !== false &&
            sinceVoiceMs != null && sinceVoiceMs >= 1200 && ctl.recoveries < 3) return recover();

        const fresh = words != null ? Math.max(0, words - ctl.unsureWords) : null;
        const freshSpoke = spokeMs != null ? Math.max(0, spokeMs - (ctl.unsureSpokeMs || 0)) : null;
        // A settled one-word reply ("No.", "Yes.") is a whole answer; a lone "um" or "okay" is not.
        const settledWord = live && words === 1 && !ctl.unsureWords && !rec.interim() && rec.text().trim() &&
          !ONE_WORD_LEAD.test(Voice.norm(rec.text())) && sinceResultMs != null && sinceResultMs >= 1500;
        // The offline engine writes a short reply down once the speaker stops: that is a whole answer too.
        const offlineText = !live && rec ? rec.text().trim() : '';
        const settledReply = !!offlineText && !ONE_WORD_LEAD.test(Voice.norm(offlineText)) && sinceVoiceMs != null && sinceVoiceMs >= 1500;
        const started = settledWord || settledReply || (fresh != null && fresh >= 2) || (freshSpoke != null && freshSpoke >= startMs);
        if (!started) {
          const idle = Voice.idleAction({ elapsedMs: elapsed, maxMs, nudgesGiven: ctl.nudges, roleplay, variant: step.index, noRepeatOffer: !!step.hideText });
          if (idle.action === 'none') {
            // keep waiting
          } else if ((sinceVoiceMs != null && sinceVoiceMs < 1500) || (rec && rec.interim())) {
            // Someone just started talking: never talk over them.
          } else if (idle.action === 'give-up') {
            ctl.nudges++;
            // Something was said (a very short reply, "I don't know"): keep it rather than discard it.
            if ((!live && spokeMs >= 150) || (live && words >= 1)) return finish({ timedOut: true });
            return finish({ skipped: true, timedOut: true });
          } else {
            ctl.nudges++;
            interject(idle.say, roleplay && idle.action === 'nudge' ? 'customer' : 'interviewer');
            return;
          }
        } else if (step.longTalk && cue !== 'strong' && sinceVoiceMs != null && sinceVoiceMs >= 5000 && !(rec && rec.interim()) &&
          (ctl.angles || 0) < 2 && elapsed < maxMs - 30000) {
          // A three-minute talk: a silence is a chance to suggest another angle, not the end.
          const angles = (step.topic && step.topic.angles) || [];
          const angle = angles[(ctl.angles || 0) % Math.max(1, angles.length)];
          ctl.angles = (ctl.angles || 0) + 1;
          interject(angle ? 'Keep going. You could also talk about ' + angle + '.' : 'Keep going, you still have time.');
          return;
        } else if (settings.silenceSec > 0 || cue === 'strong' || !live) {
          // "Until I say that's all" needs live words; the offline engine only hears it
          // after transcribing, so there a long pause ends the answer instead.
          const eot = Voice.endOfTurn({
            words: fresh,
            spokeMs: freshSpoke,
            started: true,
            sinceVoiceMs,
            sinceResultMs,
            patienceMs: step.longTalk ? 7000 : settings.silenceSec > 0 ? settings.silenceSec * 1000 : live ? 60000 : 8000,
            idealWords,
            roleplay,
            cue,
            trailingFiller: live && Voice.trailingFiller(text),
            startMs,
          });
          if (eot.end) return finish({ auto: true });
          // Background noise (TV, fan) can keep the mic "voiced" after the candidate stops: trust the words.
          if (live && words >= 8 && settings.silenceSec > 0 && sinceResultMs != null && sinceResultMs >= eot.waitMs + 3000) return finish({ auto: true });
        }
        if (elapsed >= maxMs) return finish({ timedOut: true });
      }

      async function recover() {
        ctl.busy = true;
        ctl.recoveries++;
        clearInterval(timer);
        if (rec) rec.abort();
        rec = null;
        if (state.meter) state.meter.endSegment();
        if (state.recorder) state.recorder.discard();
        setButtons(false);
        if (ctl.recoveries >= 2 && state.engine === 'browser' && hasWhisper() && !state.whisperFailed) {
          await say([{ text: "I'm having trouble catching your words, so I'll switch to my offline listening. One moment.", voice: 'interviewer' }]);
          if (ctl.done) return;
          state.engine = 'whisper';
          const ok = await AII.Whisper.preload(whisperProgress);
          if (ctl.done) return;
          if (ok) {
            await say([{ text: 'Thanks for waiting. Please answer again.', voice: 'interviewer' }]);
          } else {
            state.engine = 'browser';
            state.whisperFailed = true; // don't offer the switch again in this call
            await say([{ text: "Sorry, my offline listening isn't available right now. Please check your microphone and internet connection, then answer again.", voice: 'interviewer' }]);
          }
        } else {
          await say([{ text: "Sorry, I didn't catch that. Could you say it again?", voice: 'interviewer' }]);
        }
        if (ctl.done) return;
        await sleep(GUARD_MS);
        if (ctl.done) return;
        showPromptCaption(step);
        t0 = performance.now();
        ctl.busy = false;
        begin();
      }

      async function repeat(fromVoice) {
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
        const lead = roleplay ? [] : [{ text: step.hideText ? 'Okay, one more time.' : fromVoice ? 'Sure, here it is again.' : 'Sure.', voice: 'interviewer' }];
        await say(lead.concat(again), { hideText: step.hideText, hiddenText: q && q.text, display: step.prompt });
        if (ctl.done) return;
        await sleep(GUARD_MS);
        if (ctl.done) return;
        showPromptCaption(step);
        t0 = performance.now();
        ctl.nudges = 0;
        ctl.busy = false;
        begin();
      }
      ctl.repeat = () => repeat(false);

      // The candidate switched tabs: pause, and pick up where we left off when they return.
      ctl.onHidden = () => {
        if (ctl.done || hiddenAt) return;
        if (ctl.busy) {
          // The interviewer is talking (and repeats it on return) and listening is already paused:
          // just note when they left, so that time is not counted as answering time.
          if (!ctl.hiddenBusyAt) ctl.hiddenBusyAt = performance.now();
          return;
        }
        pauseListening();
        pauseForHidden();
      };
      ctl.onVisible = async () => {
        // busy: a welcome-back is already being spoken (a second quick tab switch).
        if (!hiddenAt || ctl.done || ctl.busy) return;
        ctl.busy = true;
        // A phone may have stopped the microphone or the camera meanwhile: reopen them, then
        // start the answer again (what was said so far was heard on the old microphone).
        const revived = await reviveMedia();
        if (ctl.done) return;
        if (revived && rec) {
          rec.abort();
          rec = null;
        }
        const spokeSoFar = !revived && !!rec && (rec.live === false
          ? !!(state.meter && state.meter.segmentVoicedMs() >= 1200)
          : Voice.wordCount(rec.text()) > 2);
        const lines = spokeSoFar
          ? [{ text: 'Welcome back. Please carry on with your answer.', voice: 'interviewer' }]
          : [{ text: "Welcome back. Here's the question again.", voice: 'interviewer' }].concat(state.session.repeatSpeak());
        // Hearing the spoken-only listening details again counts as a repeat, as if asked for.
        if (!spokeSoFar && step.hideText) {
          ctl.repeats++;
          state.integrity.repeats++;
        }
        await say(lines, { keepYou: true, hideText: step.hideText, hiddenText: q && q.text, display: step.prompt });
        if (ctl.done) return;
        await sleep(GUARD_MS);
        if (ctl.done) return;
        ctl.hiddenBusyAt = 0; // already covered: everything since hiddenAt is excluded below
        ctl.busy = false;
        if (document.hidden) return pauseForHidden(); // gone again: wait for the next return
        showPromptCaption(step);
        t0 += performance.now() - hiddenAt;
        hiddenAt = 0;
        if (revived) return begin();
        resumeListening();
      };

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
        const micOk = !!(state.meter && state.meter.running);
        if (!f.camera && state.engine === 'browser' && hasWhisper() && !state.whisperFailed && (micOk || (f.code !== 'not-allowed' && f.code !== 'audio-capture'))) {
          setButtons(false);
          state.engine = 'whisper';
          setUi('thinking', 'Switching to the offline speech engine…');
          await say([{ text: 'One moment, I am switching to my offline listening mode.', voice: 'interviewer' }]);
          if (ctl.done) return;
          const ok = await AII.Whisper.preload(whisperProgress);
          if (ctl.done) return;
          if (!ok) state.whisperFailed = true;
          if (ok) {
            await say([{ text: 'Thanks for waiting. Please give your answer again.', voice: 'interviewer' }]);
            await sleep(GUARD_MS);
            if (ctl.done) return;
            t0 = performance.now();
            ctl.busy = false;
            return begin();
          }
          state.engine = 'browser';
        }
        if (f.camera) appIncident('camera', 'minor');
        if (f.lost) {
          // Hands-free: say it, since the candidate may not be looking at the screen.
          setButtons(false);
          await say([{ text: f.camera ? "I've lost your camera, and this interview needs it. Please reconnect it, then press Try again." : "I've lost your microphone. Please reconnect it, then press Try again.", voice: 'interviewer' }]);
          if (ctl.done) return;
        }
        setUi('idle', f.camera ? 'Camera problem' : 'Microphone problem');
        let message = f.message + (f.camera ? ' Reconnect it, then press Try again.' : ' Press Try again when ready, or Continue anyway to skip this question.');
        for (;;) {
          const retry = await waitForUser(message, { noSkip: !!f.camera });
          if (ctl.done) return;
          if (!retry) {
            ctl.busy = false;
            return finish({ skipped: true });
          }
          if (f.camera) {
            const cam = await ensureCamera();
            if (ctl.done) return;
            if (cam.ok) break;
            message = cam.message;
            continue;
          }
          if (state.meter && state.meter.running) break;
          // Reopens the microphone (a reconnected or different one) and its recorder.
          const mic = await ensureMic();
          if (ctl.done) return;
          if (mic.ok) break;
          message = mic.message;
        }
        showPromptCaption(step); // the caption may still show "I've lost your microphone"
        t0 = performance.now();
        ctl.busy = false;
        return begin();
      }

      async function finish(x) {
        if (ctl.done) return;
        ctl.done = true;
        clearInterval(timer);
        renderCoach(null);
        if (state.userAction) state.userAction(false);
        setButtons(false);
        setUi('thinking', state.engine === 'whisper' && !x.skipped ? 'Transcribing your answer…' : 'One moment…');
        if (!x.skipped && state.engine === 'whisper') youPanel('working', 'Writing down your answer…', '');
        // Close the measurements first: the offline engine can take seconds to transcribe,
        // and nothing heard meanwhile belongs to the answer.
        const audio = state.meter ? state.meter.endSegment() : null;
        let clipPromise = null;
        if (state.recorder) {
          if (x.skipped) state.recorder.discard();
          else clipPromise = state.recorder.stop();
        }
        let text = '';
        if (rec) {
          if (x.skipped) rec.abort();
          else text = (await rec.stop()) || rec.interim() || '';
        }
        const clip = clipPromise ? await clipPromise : null;
        const first = rec && rec.firstResultAt;
        const lastRes = rec && rec.lastResultAt;
        const trusted = state.meterTrusted !== false || state.engine !== 'browser' ? audio : null;
        // When the voice started, after listening began (estimated from the first words without a meter).
        const onset = trusted && trusted.onsetMs != null ? trusted.onsetMs : first ? first - t0 - 500 : null;

        // If the mic picked up the interviewer's last words, drop them from the start of the answer
        // (only if a voice was there the moment listening began: see Voice.stripEcho).
        // Not where repeating the prompt IS the answer: grammar corrections, listening
        // details and the mock call (where the agent often echoes the customer).
        const echoes = !roleplay && !(q && (q.type === 'correction' || q.type === 'listening'));
        if (echoes) text = Voice.stripEcho(text, state.lastSpoken || step.prompt, { onsetMs: onset });
        if (namesOk) text = fixNames(text); // "I am tishar chadne" → "I am Tushar Chandane"
        // Commands that only show up in the final transcript (e.g. the offline engine).
        let skipped = !!x.skipped;
        const cmd = Voice.parseCommand(text);
        if (!x.command && !skipped && cmd.command === 'repeat') {
          // The call was ended or left while this answer was transcribed: never listen again,
          // and never score the request as an answer.
          const current = gen === state.callGen && !state.endRequested;
          if (current && ctl.repeats < 3) {
            ctl.done = false;
            rec = null;
            return repeat(true);
          }
          if (!current) skipped = true;
        }
        if (!x.command && cmd.command === 'skip') skipped = true;
        if (cmd.command === 'done' && cmd.strength === 'strong') text = cmd.text;

        // What will be scored, so the candidate sees it was understood (dimmed once the interviewer replies).
        if (skipped || !text.trim()) {
          renderYou('', '');
          youPanel('aria', 'You', x.command === 'skip' || x.command === 'button' ? 'Skipped.' : '');
        } else {
          renderYou(text, '');
          youPanel('words', 'You said');
        }

        const totalMs = performance.now() - t0;
        const pausedMs = first && lastRes ? pauses.reduce((sum, [a, b]) => sum + (a >= first && b <= lastRes ? b - a : 0), 0) : 0;
        const recSpan = first && lastRes ? lastRes - first + 800 - pausedMs : 0;
        const speakingMs = Math.max(trusted && trusted.speakingMs ? trusted.speakingMs : 0, recSpan);
        resolve({
          text: skipped ? '' : text,
          mode: 'voice',
          timing: { latencyMs: onset != null ? Math.max(0, onset) : null, speakingMs, totalMs },
          audio: trusted,
          clip: skipped ? null : clip,
          events: { repeats: ctl.repeats, skipped: skipped || !text.trim(), pasted: false, timedOut: !!x.timedOut, callElapsedMs: state.callStart ? performance.now() - state.callStart : undefined },
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
    if (e.ctrlKey || e.metaKey || e.altKey) return; // leave copy/paste and browser shortcuts alone
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
    const onLink = !!(e.target.closest && e.target.closest('a'));
    // Enter on a focused control should activate that control, not finish the answer.
    const onControl = !!(e.target.closest && e.target.closest('a,button,summary,[role=button]'));
    if (onLink) return;
    if (e.key === 'c' || e.key === 'C') return toggleCaptions();
    if (!state.ctl || state.ctl.done) return;
    if (e.key === 'Enter' && !onControl && !$('#btn-done').disabled) {
      e.preventDefault();
      state.ctl.finish({ command: 'button' });
    } else if ((e.key === 'r' || e.key === 'R') && !$('#btn-repeat').disabled) {
      state.ctl.repeat();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      state.hiddenCount++;
      if (!state.running) return;
      state.integrity.tabSwitches++;
      // A phone that cannot be kept awake turns its screen off by itself: noted, not a warning.
      appIncident('tab', IS_MOBILE && !wakeHeld ? 'minor' : 'serious');
      // Browsers cut speech and recognition in background tabs: pause the call cleanly.
      Speech.cancel();
      if (state.ctl && !state.ctl.done && state.ctl.onHidden) state.ctl.onHidden();
    } else if (state.running) {
      keepAwake(true);
      reviveMedia();
      if (state.ctl && !state.ctl.done && state.ctl.onVisible) state.ctl.onVisible();
    }
  });

  $('#btn-end').addEventListener('click', () => {
    if (!state.running) return;
    // (A dialog can take focus from the window: that is not leaving the interview.)
    state.dialogOpen = true;
    const sure = confirm('End the interview now? You will get a scoresheet for the questions answered so far.');
    state.dialogOpen = false;
    if (!sure) return;
    state.endRequested = true;
    Speech.cancel();
    if (state.cancelBrief) state.cancelBrief();
    if (state.cancelTap) state.cancelTap();
    if (state.userAction) state.userAction(false);
    if (state.ctl && !state.ctl.done && state.ctl.finish) state.ctl.finish({ command: 'end' });
  });

  function abortInterview() {
    state.drill = null;
    state.callGen++;
    state.watching = false;
    state.endRequested = true;
    state.running = false;
    state.discard = true;
    if (state.cancelBrief) state.cancelBrief();
    if (state.cancelTap) state.cancelTap();
    Speech.cancel();
    if (state.userAction) state.userAction(false);
    if (state.ctl && !state.ctl.done && state.ctl.finish) state.ctl.finish({ skipped: true });
    clearInterval(state.elapsedTimer);
    if (state.callTimer) clearInterval(state.callTimer);
    stopMedia();
  }

  // ------------------------------------------------------------ AI proctoring (camera)
  // Said for each serious incident: each is a warning, and the third ends the interview.
  const WARN = {
    noFace: "I can't see you. Please keep your face in front of the camera.",
    dark: 'Your camera seems to be covered. Please uncover it.',
    extra: "I can see someone else on camera. Please make sure you're alone for the interview.",
    phone: 'I can see a phone. Please put it away.',
    away: 'Please keep your eyes on the screen while we talk.',
    tab: 'Please stay on this tab during the interview.',
    focus: 'Please stay in the interview window.',
  };
  // Shown on the camera tile (not spoken) for shorter incidents.
  const NUDGE = {
    noFace: 'Stay in view of the camera', dark: 'Uncover your camera', extra: 'Only you should be on camera', phone: 'Put the phone away',
    away: 'Look at the screen', glances: 'Keep your eyes on the screen', tab: 'Stay on this tab', focus: 'Stay in this window',
    screens: 'Second screen connected', camera: 'Camera disconnected',
  };
  const APP_LABEL = { tab: 'Switched to another tab', focus: 'Left the interview window', screens: 'Second screen connected', camera: 'Camera disconnected' };
  const CALIB_PROMPT = {
    noFace: "I can't see your face yet. Please sit in front of the camera, in good light, and look at the screen.",
    extra: "I can see more than one person. Please make sure you're alone, then look at the screen.",
    dark: 'Your camera looks covered or too dark. Please uncover it or turn on a light, then look at the screen.',
    turned: 'Please face the screen directly for a moment.',
  };
  const PROCTOR_RULES = 'This interview is proctored: please stay alone and in view of the camera, keep your eyes on the screen and your phone away, and stay on this window. If something looks wrong I will warn you, and after three warnings the interview ends. ';
  const PHOTO_KINDS = new Set(['noFace', 'dark', 'extra', 'phone', 'away', 'glances']);
  const GAZE_TEXT = { on: 'Eyes on screen', down: 'Looking down', side: 'Looking away', closed: 'Eyes closed' };

  function resetProctoring() {
    state.proctoring = { incidents: [], strikes: 0, terminated: false, secondScreen: false, enabled: false };
    state.proctorIds = new Map(); // the proctor's episode id -> incident
    state.evidence = [];
    state.warnQueue = [];
    state.terminated = false;
    state.watching = false;
    state.incidentSeq = 0;
    state.lastStrikeAt = -Infinity;
    state.lastStrikeByKind = {};
    state.focusIncident = null;
    state.currentQ = null;
    renderStrikes();
    $('#pt-alert').hidden = true;
    $('#pt-name').textContent = settings.name || 'You';
    $('#pt-gaze').textContent = '';
    setProctorLabel('AI proctor');
    $('#proctor-tile').dataset.state = 'ok';
  }

  function setProctorLabel(text) {
    const el = $('#pt-label');
    if (el.textContent !== text) el.textContent = text;
  }

  function renderStrikes() {
    const n = state.proctoring ? state.proctoring.strikes : 0;
    $$('#pt-strikes i').forEach((el, i) => el.classList.toggle('on', i < n));
    $('#pt-strikes').setAttribute('aria-label', 'Warnings: ' + n + ' of 3');
  }

  let alertTimer = 0;
  function flashAlert(text, severity) {
    const el = $('#pt-alert');
    el.textContent = text;
    el.dataset.severity = severity;
    el.hidden = false;
    clearTimeout(alertTimer);
    alertTimer = setTimeout(() => { el.hidden = true; }, severity === 'serious' ? 6000 : 3500);
  }

  function renderProctorStatus(s) {
    const set = (sel, v) => {
      const el = $(sel);
      if (el && el.dataset.state !== v) el.dataset.state = v;
    };
    set('#pt-c-face', s.face);
    set('#pt-c-eyes', s.eyes);
    set('#pt-c-alone', s.alone);
    set('#pt-c-phone', s.phone);
    set('#pt-c-window', state.focusIncident ? 'bad' : 'ok');
    const all = [s.face, s.eyes, s.alone, s.phone];
    set('#proctor-tile', all.indexOf('bad') !== -1 ? 'bad' : all.indexOf('warn') !== -1 ? 'warn' : 'ok');
    const text = !s.faces ? (s.dark ? 'Camera dark' : 'No face') : s.faces > 1 ? s.faces + ' faces' : GAZE_TEXT[s.gaze] || 'Face found';
    const g = $('#pt-gaze');
    if (g.textContent !== text) g.textContent = text;
  }

  /** Record an incident; the camera ones get a photo as evidence. */
  function addIncident(kind, label, severity, extra) {
    const inc = Object.assign({ id: ++state.incidentSeq, kind, label, severity, at: Math.max(0, Date.now() - state.startedAt), q: state.currentQ || null }, extra || {});
    state.proctoring.incidents.push(inc);
    if (state.proctor && PHOTO_KINDS.has(kind) && state.evidence.length < 30) {
      state.evidence.push(state.proctor.snapshot(clock(inc.at) + ' · ' + label).then((blob) => (blob ? { id: inc.id, blob } : null)));
    }
    return inc;
  }

  /** A serious incident is a spoken warning (one at a time, not the same one twice in 20 s). The third ends the interview. */
  function strike(inc) {
    const now = performance.now();
    if (now - state.lastStrikeAt < 6000 || now - (state.lastStrikeByKind[inc.kind] || -Infinity) < 20000) return;
    state.lastStrikeAt = now;
    state.lastStrikeByKind[inc.kind] = now;
    const n = ++state.proctoring.strikes;
    inc.strike = n;
    renderStrikes();
    flashAlert((NUDGE[inc.kind] || inc.label) + ' · warning ' + n + ' of 3', 'serious');
    if (n >= 3) return terminate();
    state.warnQueue.push((WARN[inc.kind] || 'Please stay focused on the interview.') + ' This is warning ' + (n === 1 ? 'one' : 'two') + ' of three.');
  }

  /** Third warning: stop where we are (the call loop says goodbye and builds the scoresheet). */
  function terminate() {
    if (state.terminated) return;
    state.terminated = true;
    state.proctoring.terminated = true;
    state.endRequested = true;
    state.warnQueue.length = 0;
    Speech.cancel();
    if (state.cancelBrief) state.cancelBrief();
    if (state.cancelTap) state.cancelTap();
    if (state.userAction) state.userAction(false);
    if (state.ctl && !state.ctl.done && state.ctl.finish) state.ctl.finish({ command: 'end' });
  }

  function onProctorEvent(ev) {
    if (!state.watching) return;
    if (ev.type === 'resolved') {
      const inc = state.proctorIds.get(ev.id);
      if (inc) inc.durationMs = ev.durationMs;
      return;
    }
    const began = Math.max(0, Date.now() - (performance.now() - ev.at) - state.startedAt);
    let inc = state.proctorIds.get(ev.id);
    if (ev.repeat) {
      // Still going 20 s after a warning: a new entry, and another warning.
      return strike(addIncident(ev.kind, ev.label, 'serious', { direction: ev.direction, ongoing: true }));
    }
    if (!inc) {
      inc = addIncident(ev.kind, ev.label, ev.severity, ev.direction ? { direction: ev.direction, at: began } : { at: began });
      state.proctorIds.set(ev.id, inc);
    }
    if (ev.severity === 'serious') {
      inc.severity = 'serious';
      strike(inc);
    } else flashAlert(NUDGE[ev.kind] || ev.label, 'minor');
  }

  /** Incidents the page itself sees (tab, window, screens, camera); only while watching. */
  function appIncident(kind, severity) {
    if (!state.watching) return null;
    const inc = addIncident(kind, APP_LABEL[kind], severity);
    if (severity === 'serious') strike(inc);
    else flashAlert(NUDGE[kind] || APP_LABEL[kind], 'minor');
    return inc;
  }

  // Another app or window in front of the interview (a tab switch is counted separately).
  let blurTimer = 0;
  window.addEventListener('blur', () => {
    if (!state.watching || document.hidden || state.dialogOpen) return;
    clearTimeout(blurTimer);
    const since = Date.now();
    blurTimer = setTimeout(() => {
      if (!state.watching || document.hidden || document.hasFocus() || state.dialogOpen) return;
      state.focusIncident = appIncident('focus', 'serious');
      if (state.focusIncident) state.focusIncident.at = Math.max(0, since - state.startedAt);
    }, 2500);
  });
  window.addEventListener('focus', () => {
    clearTimeout(blurTimer);
    if (state.focusIncident) {
      state.focusIncident.durationMs = Math.max(0, Date.now() - state.startedAt - state.focusIncident.at);
      state.focusIncident = null;
    }
  });

  /** Load the AI proctor on the camera. Resolves true when it runs, false if the call ended or it cannot start. */
  async function startProctor(alive) {
    if (!AII.Proctor || !AII.Proctor.supported()) return false;
    const p = AII.Proctor.createProctor({
      video: $('#cam'),
      canvas: $('#proctor-overlay'),
      onStatus: (s) => { if (state.proctor === p) renderProctorStatus(s); },
      onEvent: (ev) => { if (state.proctor === p) onProctorEvent(ev); },
      onCalibrate: (c) => { if (state.proctor === p) setProctorLabel(c.done ? 'AI proctor' : c.problem ? 'Calibrating…' : 'Calibrating ' + Math.round(c.progress * 100) + '%'); },
    });
    state.proctor = p;
    setProctorLabel('Starting…');
    for (;;) {
      setUi('thinking', 'Starting the AI proctor…');
      const ok = await p.start((f) => { if (alive() && state.proctor === p) setUi('thinking', 'Starting the AI proctor… ' + Math.round(f * 100) + '%'); })
        .then(() => true, (e) => {
          if (window.console) console.warn('[proctor] could not start:', e && e.message);
          return false;
        });
      if (!alive() || state.proctor !== p) return false;
      if (ok) {
        setProctorLabel('AI proctor');
        return true;
      }
      setUi('idle', 'AI proctor needed');
      const retry = await waitForUser('The AI proctor could not start. Check your internet connection (it downloads about ' + AII.Proctor.MODEL_MB + ' MB once), then press Try again.', { noSkip: true });
      if (!alive() || !retry || state.endRequested) return false;
    }
  }

  /** Calibrate the proctor on the candidate: alone, in view, looking at the screen. */
  async function faceCheck(alive) {
    $('#room-q').textContent = 'Camera check';
    let attempt = 0;
    let prompt = 'This interview is AI-proctored, so your camera stays on. Please sit in front of the camera and look at the screen for a moment.';
    while (alive() && !state.endRequested && state.proctor) {
      await say([{ text: prompt, voice: 'interviewer' }]);
      if (!alive() || state.endRequested || !state.proctor) return false;
      setUi('listening', 'Look at the screen…');
      const r = await state.proctor.calibrate(9000);
      if (!alive() || state.endRequested) return false;
      if (r.ok) return true;
      attempt++;
      prompt = CALIB_PROMPT[r.problem] || CALIB_PROMPT.noFace;
      if (attempt >= 3) {
        setUi('idle', 'Camera check');
        const retry = await waitForUser(prompt + ' Press Try again when ready.', { noSkip: true });
        if (!alive() || state.endRequested || !retry) return false;
        attempt = 0;
        prompt = "Let's try again. Please look at the screen for a moment.";
      }
    }
    return false;
  }

  function startWatching() {
    if (!state.proctor) return;
    state.proctoring.enabled = true;
    state.watching = true;
    state.proctor.watch(true);
    if (state.proctoring.secondScreen) appIncident('screens', 'minor');
  }

  /** Say any warnings waiting (between questions). */
  async function deliverWarnings(alive) {
    while (state.warnQueue.length && alive() && !state.endRequested) {
      await say([{ text: state.warnQueue.shift(), voice: 'interviewer' }]);
    }
  }

  /** What the scoresheet keeps of the proctoring (null when it never started watching). */
  function proctoringSummary() {
    const p = state.proctoring;
    if (!p || !p.enabled) return null;
    return {
      incidents: p.incidents.map((i) => Object.assign({}, i)),
      strikes: p.strikes,
      terminated: !!p.terminated,
      secondScreen: !!p.secondScreen,
      stats: state.proctor ? state.proctor.stats() : null,
    };
  }

  // ------------------------------------------------------------ mic check
  /** Ask the candidate to say "I'm ready" and confirm we can hear (and understand) them. */
  async function micCheck(alive) {
    let attempt = 0;
    let deafCount = 0;
    let prompt = "Before we begin, let's check your microphone. Please say: I'm ready.";
    $('#room-q').textContent = 'Microphone check';
    while (alive() && !state.endRequested) {
      await say([{ text: prompt, voice: 'interviewer' }]);
      await sleep(GUARD_MS);
      if (!alive() || state.endRequested) return false;
      earcon();
      const heard = await listenBrief(9000);
      if (!alive() || state.endRequested) return false;
      if (heard.ok) {
        // Words arrived but the level meter heard nothing: its pause/tone figures would be wrong.
        if (heard.live && !heard.voicedMs) state.meterTrusted = false;
        renderYou(heard.text || '', '');
        youPanel('heard', heard.unconfirmed ? '✓ Your microphone works' : '✓ Got it! Your microphone works', '');
        announce('Microphone check passed.');
        return heard.unconfirmed ? 'unconfirmed' : 'heard';
      }
      // The mic hears a voice but the recogniser returns no words.
      const deaf = !heard.fatal && heard.live && (heard.deaf || heard.voicedMs >= 1500);
      if (deaf) deafCount++;
      // One more try with the browser's recogniser before the 48 MB offline engine (a first
      // result can be slow); on desktop, let it open the microphone itself instead of sharing ours.
      if (deaf && (state.useTrack || deafCount < 2)) {
        state.useTrack = false;
        youPanel('problem', 'I can hear your voice, but not the words yet', '');
        prompt = "I can hear your voice, but I didn't catch the words. Let me adjust my listening. Please say again: I'm ready.";
        continue;
      }
      // Whisper listens through the page's own mic stream, so it helps even when the browser's
      // recogniser is refused ("not-allowed") while the microphone itself works.
      const micOk = !!(state.meter && state.meter.running);
      if ((heard.fatal || deaf) && state.engine === 'browser' && hasWhisper() && !state.whisperFailed &&
          (micOk || (heard.code !== 'not-allowed' && heard.code !== 'audio-capture'))) {
        youPanel('problem', 'Switching to offline listening…', '');
        state.engine = 'whisper';
        const ok = await prepareWhisper(alive);
        if (!alive()) return false;
        if (ok === null) return false; // ended meanwhile
        if (ok) {
          attempt = 0;
          prompt = "Thanks for waiting. Please say: I'm ready.";
          continue;
        }
        state.engine = 'browser';
        state.whisperFailed = true;
        attempt++;
        youPanel('problem', 'Offline listening is not available', '');
        prompt = "My offline listening couldn't load, so let's try once more. Please say: I'm ready.";
        continue;
      }
      attempt++;
      youPanel('problem', heard.code === 'network' ? 'No internet connection for speech recognition'
        : heard.voicedMs >= 300 ? 'I heard a sound, but no words' : 'I didn’t hear anything', '');
      if (heard.fatal || attempt >= 2) {
        setUi('idle', 'Check your microphone');
        let message = heard.fatal
          ? heard.message + ' Press Try again when ready.'
          : INTERVIEWER + ' can’t hear you yet. Check that the right microphone is selected and not muted (headset switch, system settings), then press Try again.';
        for (;;) {
          const retry = await waitForUser(message);
          if (!alive() || state.endRequested) return false;
          if (!retry) return 'skipped';
          // Reopen it: only a new stream uses a newly plugged-in or newly selected microphone.
          const mic = await ensureMic({ fresh: true });
          if (!alive() || state.endRequested) return false;
          if (mic.ok) break;
          message = mic.message;
        }
        attempt = 0;
        prompt = "Let's try again. Please say: I'm ready.";
        continue;
      }
      prompt = heard.voicedMs >= 300
        ? "Sorry, I didn't catch that. Please speak a little louder and say: I'm ready."
        : "I couldn't hear you. Please check your microphone isn't muted, then say: I'm ready.";
    }
    return false;
  }

  /**
   * Listen briefly for "I'm ready", showing the mic level and the words as they arrive.
   * Resolves { ok, text, live, voicedMs }, { ok: false, deaf } (voice but no words),
   * or { fatal, code, message, live, voicedMs }.
   */
  function listenBrief(ms) {
    return new Promise((resolve) => {
      let done = false;
      let settle = null;
      let firstWordAt = 0;
      let failed = false;      // the offline engine reported an error
      let sawNetwork = false;  // the browser's speech service could not be reached
      setUi('listening', 'Say: “I’m ready”');
      renderYou('', '');
      youPanel('waiting', 'Your microphone', 'Say “I’m ready”…');
      if (state.meter) state.meter.beginSegment();
      const voiced = () => (state.meter ? state.meter.segmentVoicedMs() : 0);
      const sinceVoice = () => (state.meter ? state.meter.msSinceVoice() : Infinity);
      const finishWith = async (r) => {
        if (done) return;
        done = true;
        clearInterval(timer);
        clearTimeout(settle);
        r.live = !!rec && rec.live !== false;
        r.voicedMs = voiced();
        if (state.meter) state.meter.endSegment();
        let text = r.live && rec ? (rec.text() + ' ' + rec.interim()).trim() : '';
        if (rec && r.ok && !r.live && !state.endRequested) {
          // The offline engine has no live words: write down what was said, so the
          // candidate sees that it worked (End or a slow device never wait for it).
          youPanel('working', 'Checking what I heard…', '');
          let cancel;
          const cancelled = new Promise((res) => { cancel = () => res(null); });
          state.cancelBrief = cancel;
          const got = await Promise.race([rec.stop().catch(() => null), sleep(6000).then(() => null), cancelled]);
          rec.abort();
          text = got || '';
          // The meter only knows something was loud: a cough, a door or a chair is not a voice.
          // Whisper finished and found no words, so the check is not passed.
          if (typeof got === 'string' && !failed && !Voice.wordCount(got)) {
            r.ok = false;
            r.noWords = true;
          } else if (!Voice.wordCount(text)) {
            r.unconfirmed = true; // too slow, or the engine failed: a voice was heard, words not confirmed
          }
        } else if (rec) rec.abort();
        state.cancelBrief = null;
        r.text = String(text || '').trim();
        resolve(r);
      };
      const rec = makeRecognizer({
        onUpdate: (fin, interim) => {
          if (done) return;
          renderYou(fin, interim);
          const t = (fin + ' ' + interim).trim();
          if (!Voice.wordCount(t)) return;
          if (!firstWordAt) firstWordAt = performance.now();
          youPanel('words', INTERVIEWER + ' hears');
          // Let the phrase finish so the candidate sees all of it (and the meter measures it).
          clearTimeout(settle);
          settle = setTimeout(() => finishWith({ ok: true }), fin && /\bready\b/i.test(t) ? 400 : 900);
        },
        onError: (code, message, fatal) => {
          if (code === 'whisper-failed') failed = true;
          if (code === 'network') sawNetwork = true;
          if (fatal) finishWith({ fatal: true, code, message });
        },
      });
      const t0 = performance.now();
      const offline = () => finishWith({ fatal: true, code: 'network', message: 'Speech recognition needs an internet connection in this browser. Check your Wi-Fi or mobile data.' });
      state.cancelBrief = () => finishWith({ ok: false });
      const live = rec.live !== false;
      const timer = setInterval(() => {
        if (state.endRequested) return finishWith({ ok: false });
        const now = performance.now();
        const v = voiced();
        const sv = sinceVoice();
        if (firstWordAt) {
          if (now - firstWordAt > 3000) finishWith({ ok: true }); // still talking: words are proof enough
          return;
        }
        if (sv < 450) youPanel('hearing', 'I can hear you…');
        else if (live && v >= 300) youPanel('hearing', 'Working out your words…');
        else if (v < 300) youPanel('waiting', 'Your microphone', 'Say “I’m ready”…');
        // The offline engine: a short phrase followed by a pause is enough.
        if (!live && ((v >= 350 && sv >= 700) || v >= 2500)) return finishWith({ ok: true });
        // No internet: say so, rather than blaming the microphone.
        if (live && ((sawNetwork && now - t0 > 3000) || (navigator.onLine === false && now - t0 > 1500))) return offline();
        // A voice, then a long pause, but the recogniser gave no words at all: it can't hear us.
        // (A first result can lag on a slow connection, so give it a few seconds.)
        if (live && v >= 400 && sv >= 4000 && now - t0 > 4500) return finishWith({ ok: false, deaf: true });
        if (now - t0 > ms) finishWith({ ok: false });
      }, 100);
      rec.start();
    });
  }

  /**
   * Download/prepare the offline model. Resolves true when ready, false if it failed,
   * or null when the call was ended or left meanwhile (End never waits for a download).
   */
  async function prepareWhisper(alive) {
    const live = () => alive() && !state.endRequested;
    setUi('thinking', 'Preparing the offline speech engine…');
    announce('Preparing the offline speech engine. This can take a minute the first time.');
    if (!(AII.Whisper.isCached && AII.Whisper.isCached())) {
      await say([{ text: 'Give me a moment while I get my offline listening ready. This only happens the first time.', voice: 'interviewer' }]);
      if (!live()) return null;
    }
    let poll;
    const ended = new Promise((resolve) => {
      poll = setInterval(() => { if (!live()) resolve(null); }, 200);
    });
    const ok = await Promise.race([AII.Whisper.preload(whisperProgress), ended]);
    clearInterval(poll);
    if (ok === null || !live()) return null;
    announce(ok ? 'Offline speech engine ready.' : 'The offline speech model could not be downloaded.');
    if (!ok) notice('The offline speech model could not be downloaded. Check your internet connection, or open this page in Chrome or Edge.');
    return ok;
  }

  // ------------------------------------------------------------ the call
  async function startCall(drill) {
    const gen = ++state.callGen;
    const alive = () => gen === state.callGen && !state.discard;
    // A practice drill re-asks one question from a scoresheet, for the same role and company.
    state.drill = drill || null;
    const src = drill ? drill.sheet : null;
    const companyId = src ? src.company && src.company.id : settings.track === 'tech' ? settings.company : null;
    const co = companyId ? Questions.COMPANIES[companyId] || Questions.COMPANIES.generic : null;
    state.company = co ? Object.assign({ id: companyId }, co) : null;
    state.session = Engine.createSession({
      length: src ? src.config.length : settings.length,
      role: src ? src.candidate.role : settings.role,
      experience: src ? src.candidate.experience : settings.experience,
      company: co ? companyId : undefined,
      only: drill ? [drill.qid] : undefined,
      mode: 'voice',
      name: settings.name || (src && !drill.sample ? src.candidate.name : ''),
      interviewerName: INTERVIEWER,
      seed: (Math.random() * 2147483647) | 0,
    });
    state.integrity = { tabSwitches: 0, pastes: 0, repeats: 0 };
    resetProctoring();
    state.endRequested = false;
    state.discard = false;
    state.running = true;
    state.clips = [];
    state.engine = resolveEngine(settings.engine);
    state.ttsOk = true;
    state.meterTrusted = true;
    state.whisperFailed = false;
    // Chrome 135+ on desktop can listen to a given mic track; Android ignores it.
    state.useTrack = !IS_ANDROID;
    state.lastSpoken = '';
    state.startedAt = Date.now();
    if (state.cancelTap) state.cancelTap();
    $('#btn-tap-audio').hidden = true;
    $('#proc-skip').hidden = true;
    notice('');
    show('interview');
    // On by default, so candidates see their own words live (a new key: the old default was off).
    setCaptions(settings.showCaptions !== false || !Speech.ttsSupported, false);
    setButtons(false);
    setPersona('interviewer');
    setTimer(1);
    $('#room-q').textContent = 'Connecting…';
    $('#dots').innerHTML = '';
    $('#roleplay-banner').hidden = true;
    renderDrillCoach(drill);
    renderThinkCard(null);
    renderRound({});
    captionWords('');
    renderYou('', '');
    youPanel('idle', 'You', '');
    setUi('idle', 'Connecting…');
    setCallHint();
    startOrb();
    startElapsed();

    // Microphone first: without it there is no interview.
    // Ask once for both: phones otherwise show two prompts. Each is then checked on its own.
    const both = await openMedia(drill ? { video: false } : undefined);
    if (!alive()) {
      if (both) both.getTracks().forEach((tr) => tr.stop());
      return;
    }
    let mic = await ensureMic(both && both.getAudioTracks().length ? { stream: new MediaStream(both.getAudioTracks()) } : undefined);
    while (!mic.ok && alive() && !state.endRequested) {
      setUi('idle', 'Microphone needed');
      const retry = await waitForUser(mic.message);
      if (!alive()) return;
      if (state.endRequested) break;
      if (!retry) return endWithoutAnswers('The interview needs a working microphone. Please allow it and try again.');
      mic = await ensureMic();
    }
    if (!alive()) return;
    if (!mic.ok) return endWithoutAnswers('The interview ended before any answers were recorded.');
    if (drill) return runDrill(gen, alive);
    // The camera is required: the interview is AI-proctored.
    let cam = await ensureCamera(both && both.getVideoTracks().length ? { stream: new MediaStream(both.getVideoTracks()) } : undefined);
    while (!cam.ok && alive() && !state.endRequested) {
      setUi('idle', 'Camera needed');
      const retry = await waitForUser(cam.message, { noSkip: true });
      if (!alive()) return;
      if (state.endRequested || !retry) break;
      cam = await ensureCamera();
    }
    if (!alive()) return;
    if (!cam.ok) return endWithoutAnswers(state.endRequested ? 'The interview ended before any answers were recorded.' : 'This interview is AI-proctored and needs your camera. Allow the camera and try again.');
    keepAwake(true);
    const proctorOk = await startProctor(alive);
    if (!alive()) return;
    if (!proctorOk) return endWithoutAnswers(state.endRequested ? 'The interview ended before any answers were recorded.' : 'The AI proctor could not start, so the interview cannot go ahead. Check your internet connection and try again.');
    await pickVoices();
    if (!alive()) return;
    if (state.engine === 'whisper') {
      const ok = await prepareWhisper(alive);
      if (!alive()) return;
      if (ok === false) {
        if (!Speech.sttSupported) return endWithoutAnswers('The offline speech model could not be downloaded. Check your internet connection and try again, or use Chrome or Edge.');
        state.engine = 'browser';
      }
      setCallHint();
    }

    const session = state.session;
    const first = String(settings.name).trim().split(/\s+/)[0];
    const hello = state.company
      ? ", calling from " + state.company.from + ' about the ' + ((Questions.ROLES[settings.role] || {}).short || 'engineering') + ' role'
      : ", and I'll be interviewing you today";
    await say([{ text: 'Hi ' + first + "! I'm " + INTERVIEWER + hello + '. You can just talk to me normally, no buttons needed.', voice: 'interviewer' }]);
    if (!alive()) return;
    // AI proctoring: calibrate on the candidate, alone and looking at the screen.
    const seen = await faceCheck(alive);
    if (!alive()) return;
    if (!seen) return endWithoutAnswers(state.endRequested ? 'The interview ended before any answers were recorded.' : 'The camera check could not see you clearly, so the proctored interview cannot start. Sit in front of the camera, in good light, and try again.');
    state.proctoring.secondScreen = !!(window.screen && window.screen.isExtended);
    await say([{ text: 'Thank you, I can see you clearly.', voice: 'interviewer' }]);
    if (!alive()) return;
    const check = await micCheck(alive);
    if (!alive()) return;
    if (check === 'heard') state.micHeard = true;
    if (!state.endRequested) {
      const opener = check === 'heard'
        ? 'Perfect, I can hear you clearly. '
        : "Okay, let's carry on. If I can't hear you, I'll let you know. ";
      const screens = state.proctoring.secondScreen ? "I can also see a second screen connected. Please don't look at it during the interview. " : '';
      await say([{ text: opener + PROCTOR_RULES + screens + session.briefing({ pauseEnds: pauseEnds() }), voice: 'interviewer' }]);
      if (!alive()) return;
      youPanel('aria');
      startWatching();
    }

    let step = session.current();
    while (step && !state.endRequested) {
      renderDots(step);
      state.currentQ = step.index + 1;
      await deliverWarnings(alive);
      if (!alive()) return;
      if (state.endRequested) break;
      const q = stepQuestion(step);
      await say(step.speak, { hideText: step.hideText, hiddenText: q && q.text, display: step.prompt });
      if (!alive()) return;
      if (state.endRequested) break;
      // The "end" event comes slightly before the audio finishes: leave a short gap, then a "your turn" tone.
      earcon();
      await sleep(GUARD_MS);
      if (!alive()) return;
      if (state.endRequested) break;
      showPromptCaption(step);
      setPersona(step.kind === 'roleplay' ? 'customer' : 'interviewer');
      if (step.call) startCallClock();
      const answer = await listenTurn(step);
      if (!alive()) return;
      // Ended while the interviewer waited for this answer: an unanswered question is left out, like the rest.
      if (state.endRequested && answer.events.skipped) break;
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
    if (!alive()) return;
    if (state.endRequested && !session.finished) {
      session.endEarly();
      const bye = state.terminated
        ? "That's the third warning, so I have to end the interview here."
        : "Alright, we'll stop here. Thank you for your time.";
      if (!session.results().length) {
        await say([{ text: bye, voice: 'interviewer' }], { force: true });
        if (!alive()) return;
        return endWithoutAnswers(state.terminated ? 'The interview was ended after three integrity warnings, before any answers were recorded.' : 'The interview ended before any answers were recorded.');
      }
      await say([{ text: bye + (state.terminated ? ' Your scoresheet will show what the proctor detected.' : " I'm preparing your scoresheet now."), voice: 'interviewer' }], { force: true });
    }
    state.watching = false;
    if (!alive()) return;
    state.running = false;
    clearInterval(state.elapsedTimer);
    if (state.callTimer) clearInterval(state.callTimer);
    await finishInterview(gen);
  }

  // ------------------------------------------------------------ practice drills
  // Answer one question again: the same voice call without the camera (it is practice, not an
  // interview), then the score before and after. Attempts are kept per scoresheet, on this device.
  const DRILL_KEY = 'aii.drills.v1';
  function drillsFor(sheetId) {
    return (store.get(DRILL_KEY, {}) || {})[sheetId] || {};
  }
  function saveDrill(sheetId, qid, attempt) {
    const all = store.get(DRILL_KEY, {}) || {};
    const forSheet = all[sheetId] || (all[sheetId] = {});
    forSheet[qid] = (forSheet[qid] || []).concat([attempt]).slice(-5);
    // Only for scoresheets still in the history (and the one on screen).
    const keep = new Set(store.get(HISTORY_KEY, []).map((h) => h.id).concat([sheetId]));
    for (const id of Object.keys(all)) if (!keep.has(id)) delete all[id];
    store.set(DRILL_KEY, all);
  }

  function startDrill(qid) {
    const sheet = state.sheet;
    if (!sheet || state.running) return;
    const prev = sheet.questions.find((q) => q.id === qid);
    if (!prev) return;
    if (!resolveEngine(settings.engine)) return alert('This browser cannot recognise speech. Please open this page in Chrome or Edge.');
    stopFeedbackAudio();
    stopModelAudio();
    $$('#report-root audio, #drill-root audio').forEach((a) => a.pause());
    Speech.unlock();
    Audio.prime();
    keepAwake(true);
    startCall({ sheet, qid, prev, sample: !!(state.reportOpts && state.reportOpts.sample) });
  }

  // One concrete aim per skill, for the weakest skill of the last answer.
  const SKILL_AIM = {
    technical: 'Go one level deeper: name a trade-off, the complexity, or an edge case.',
    thought: 'Give it a shape: first, then, finally, and say why each step matters.',
    relevance: 'Answer the exact question in your first sentence, then add one concrete detail.',
    communication: 'Slow down a little and replace "um" with a short pause.',
    confidence: 'Start within a few seconds, and say "I would" or "I did" instead of "I think maybe".',
    customer: 'Show empathy first, then give a clear fix with a timeline.',
    attitude: 'Sound genuinely interested: say what you would bring and what excites you.',
    language: 'Use short, complete sentences and check your verb tenses.',
  };
  /** What to aim for this time: the gaps the scoresheet found, and the weakest skill. */
  function drillAims(prev) {
    if (prev.skipped) return ['Give it a go: even a short, honest answer beats a skip.'];
    const aims = ((prev.feedback && prev.feedback.improve) || []).slice(0, 2);
    const s = prev.scores || {};
    const weakest = Object.keys(s).filter((k) => SKILL_AIM[k] && s[k] != null).sort((a, b) => s[a] - s[b])[0];
    if (weakest && s[weakest] < 85) aims.push(SKILL_AIM[weakest]);
    return aims.length ? aims : ['Keep it up: add one real example, and say why it matters.'];
  }

  function renderDrillCoach(drill) {
    const box = $('#drill-coach');
    box.hidden = !drill;
    if (!drill) return;
    box.innerHTML = '';
    const head = document.createElement('div');
    head.className = 'dc-head';
    head.innerHTML = '<span class="dc-tag">🎯 Practice drill</span><span class="dc-last"></span>';
    head.querySelector('.dc-last').textContent = drill.prev.skipped ? 'Skipped last time' : 'Last time: ' + drill.prev.quality + '/100';
    const ul = document.createElement('ul');
    for (const aim of drillAims(drill.prev)) {
      const li = document.createElement('li');
      li.textContent = aim;
      ul.appendChild(li);
    }
    const lead = document.createElement('span');
    lead.className = 'dc-lead';
    lead.textContent = 'This time, aim to:';
    box.append(head, lead, ul);
  }

  async function runDrill(gen, alive) {
    const drill = state.drill;
    keepAwake(true);
    await pickVoices();
    if (!alive()) return;
    if (state.engine === 'whisper') {
      const ok = await prepareWhisper(alive);
      if (!alive()) return;
      if (ok === false) {
        if (!Speech.sttSupported) return endWithoutAnswers('The offline speech model could not be downloaded. Check your internet connection and try again.');
        state.engine = 'browser';
      }
      setCallHint();
    }
    const first = String(settings.name || '').trim().split(/\s+/)[0];
    const last = drill.prev.skipped ? 'Last time you skipped it.' : 'Last time it scored ' + drill.prev.quality + '.';
    await say([{ text: "Let's practise this one again" + (first ? ', ' + first : '') + '. ' + last + ' Take a breath, and take your time.', voice: 'interviewer' }]);
    if (!alive()) return;
    // One mic check per visit, so a muted microphone is caught before the answer.
    if (!state.micHeard && !state.endRequested) {
      const check = await micCheck(alive);
      if (!alive()) return;
      if (check === 'heard') state.micHeard = true;
    }
    youPanel('aria');
    const session = state.session;
    let step = session.current();
    $('#room-q').textContent = 'Practice drill · ' + (step ? step.stageLabel : '');
    while (step && !state.endRequested) {
      renderDots(step);
      const q = stepQuestion(step);
      await say(step.speak, { hideText: step.hideText, hiddenText: q && q.text, display: step.prompt });
      if (!alive()) return;
      if (state.endRequested) break;
      earcon();
      await sleep(GUARD_MS);
      if (!alive() || state.endRequested) break;
      showPromptCaption(step);
      setPersona(step.kind === 'roleplay' ? 'customer' : 'interviewer');
      if (step.call) startCallClock();
      const answer = await listenTurn(step);
      if (!alive()) return;
      if (state.endRequested && answer.events.skipped) break;
      if (answer.clip) {
        state.clips.push({ qid: step.questionId, kind: step.kind === 'followup' ? 'followup' : step.kind === 'roleplay' ? 'turn' : 'main', index: step.kind === 'roleplay' ? step.turn : 0, blob: answer.clip.blob, mimeType: answer.clip.mimeType, durationMs: answer.clip.durationMs });
      }
      const res = session.submit(answer);
      if (res.done) {
        await say(res.speak, { force: true });
        break;
      }
      step = res.step;
    }
    if (!alive()) return;
    if (state.endRequested && !session.finished) session.endEarly();
    state.running = false;
    clearInterval(state.elapsedTimer);
    if (state.callTimer) clearInterval(state.callTimer);
    if (!session.results().length || session.results().every((it) => it.analysis.skipped)) {
      return endDrill('No answer was recorded this time, so there is nothing to compare yet.');
    }
    finishDrill(gen);
  }

  function finishDrill(gen) {
    const drill = state.drill;
    const items = state.session.results();
    const clips = state.clips;
    stopMedia();
    const sheet = Scoring.buildScoresheet({
      candidate: Object.assign({}, drill.sheet.candidate),
      config: { length: drill.sheet.config.length, mode: 'voice', engine: state.engine },
      items,
      startedAt: state.startedAt,
      endedAt: Date.now(),
      integrity: state.integrity,
      proctoring: null,
      company: drill.sheet.company || null,
    });
    const now = sheet.questions.find((q) => q.id === drill.qid) || sheet.questions[0];
    saveDrill(drill.sheet.id, drill.qid, { at: new Date().toISOString(), quality: now.skipped ? 0 : now.quality, scores: now.scores, answer: now.answer || '' });
    if (gen !== state.callGen) return;
    renderDrillResult(drill, now, clips);
    show('drill');
    document.title = 'Practice drill · Tushar AI Interviewer';
  }

  function renderDrillResult(drill, now, clips) {
    const root = $('#drill-root');
    const before = drill.prev.skipped ? 0 : drill.prev.quality;
    const after = now.skipped ? 0 : now.quality;
    const delta = after - before;
    const attempts = drillsFor(drill.sheet.id)[drill.qid] || [];
    const best = Math.max.apply(null, attempts.map((a) => a.quality || 0));
    const verdict = delta >= 15 ? 'Big improvement. That is how it should sound.'
      : delta >= 5 ? 'Better than last time. Keep going.'
        : delta > -5 ? 'About the same. Look at the gaps below and try once more.'
          : 'Lower this time. Read the tips below, then try again.';
    const D = Scoring.DIMENSIONS.filter((d) => now.scores[d.key] != null && drill.prev.scores && drill.prev.scores[d.key] != null);
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const chip = (d) => {
      const a = drill.prev.scores[d.key];
      const b = now.scores[d.key];
      const cls = b - a >= 5 ? 'up' : b - a <= -5 ? 'down' : '';
      return '<span class="dr-chip ' + cls + '"><span class="chip-k">' + esc(d.short) + '</span> ' + a + ' → <strong>' + b + '</strong></span>';
    };
    const fb = now.feedback || { good: [], improve: [] };
    const clip = (clips || []).find((c) => c.qid === drill.qid && c.kind === 'main' && c.blob);
    let clipUrl = '';
    if (clip) {
      clipUrl = URL.createObjectURL(clip.blob);
      state.clipUrls.push(clipUrl);
    }
    root.innerHTML = '<article class="drill-card card">' +
      '<div class="eyebrow">Practice drill · ' + esc(now.stage) + '</div>' +
      '<h1 class="drill-q">' + esc(now.display || now.text) + '</h1>' +
      '<div class="drill-scores" role="img" aria-label="Score before ' + before + ', now ' + after + '">' +
      '<div class="ds ds-before"><span>Before</span><strong>' + (drill.prev.skipped ? '—' : before) + '</strong></div>' +
      '<div class="ds-arrow" aria-hidden="true">→</div>' +
      '<div class="ds ds-after"><span>Now</span><strong>' + after + '</strong></div>' +
      '<div class="ds-delta ' + (delta > 0 ? 'up' : delta < 0 ? 'down' : '') + '">' + (delta > 0 ? '+' : '') + delta + '</div></div>' +
      '<p class="drill-verdict">' + esc(verdict) + (attempts.length > 1 ? ' <span class="muted">Best so far: ' + best + ' in ' + attempts.length + ' tries.</span>' : '') + '</p>' +
      (D.length ? '<div class="dr-chips">' + D.map(chip).join('') + '</div>' : '') +
      '<div class="grid-2 drill-grid"><section><h2>Your answer this time</h2>' +
      (now.answer ? '<blockquote class="drill-answer"></blockquote>' : '<p class="muted">No answer was heard.</p>') +
      (clipUrl ? '<audio controls preload="metadata" src="' + clipUrl + '"></audio>' : '') +
      '</section><section><h2>What the interviewer noticed</h2>' +
      (fb.good.length ? '<ul class="fb-good">' + fb.good.map((g) => '<li>' + esc(g) + '</li>').join('') + '</ul>' : '') +
      (fb.improve.length ? '<ul class="fb-improve">' + fb.improve.map((g) => '<li>' + esc(g) + '</li>').join('') + '</ul>' : '<p class="muted small">Nothing important missing.</p>') +
      '</section></div>' +
      (now.tip ? '<div class="tip"><span class="eyebrow">What a strong answer includes</span><p>' + esc(now.tip) + '</p></div>' : '') +
      Report.modelBlock(now) +
      '<div class="drill-actions"><button class="btn btn-primary" type="button" data-drill-again>🎯 Try again</button>' +
      '<button class="btn btn-glass" type="button" data-drill-next>Next weakest question</button>' +
      '<button class="btn btn-glass" type="button" data-drill-back>← Back to scoresheet</button></div>' +
      '</article>';
    const bq = root.querySelector('.drill-answer');
    if (bq) bq.textContent = now.answer;
    const a = root.querySelector('audio');
    if (a) Recorder.ensureDuration(a);
    state.drillResult = drill;
  }

  /** The next question to practise: the weakest one not yet practised to 80. */
  function nextDrillQid(sheet, after) {
    const done = drillsFor(sheet.id);
    const bestOf = (id) => Math.max.apply(null, [0].concat((done[id] || []).map((a) => a.quality || 0)));
    const ranked = sheet.questions.map((q) => ({ id: q.id, v: Math.max(q.skipped ? 0 : q.quality, bestOf(q.id)) }))
      .filter((r) => r.id !== after && r.v < 80).sort((a, b) => a.v - b.v);
    return ranked.length ? ranked[0].id : null;
  }

  async function backToReport(message) {
    const drill = state.drill || state.drillResult;
    state.drill = null;
    state.drillResult = null;
    if (!drill) return goHome();
    const sheet = drill.sheet;
    const clips = drill.sample ? [] : await Recorder.loadClips(sheet.id).catch(() => []);
    showReport(sheet, { clips, sample: drill.sample ? state.reportOpts && state.reportOpts.sample : null });
    if (message) {
      const banner = $('#sample-banner');
      banner.hidden = false;
      banner.textContent = message;
    }
    const card = document.querySelector('[data-drill="' + drill.qid + '"]');
    const qa = card && card.closest('details');
    if (qa) {
      qa.open = true;
      qa.scrollIntoView({ block: 'center' });
    }
  }

  /** A drill that ended without an answer. */
  function endDrill(message) {
    if (state.cancelTap) state.cancelTap();
    state.running = false;
    clearInterval(state.elapsedTimer);
    if (state.callTimer) clearInterval(state.callTimer);
    stopMedia();
    Speech.cancel();
    backToReport(message);
  }

  $('#drill-root').addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t || !state.drillResult) return;
    const drill = state.drillResult;
    if (t.hasAttribute('data-say-model')) return sayModel(t);
    stopModelAudio();
    if (t.hasAttribute('data-drill-back')) return backToReport();
    state.sheet = drill.sheet;
    if (t.hasAttribute('data-drill-again')) return startDrill(drill.qid);
    if (t.hasAttribute('data-drill-next')) {
      const next = nextDrillQid(drill.sheet, drill.qid);
      if (next) return startDrill(next);
      backToReport('Every answer on this scoresheet is now at 80 or more. Well done!');
    }
  });

  // Model answers: read aloud on request (one at a time; recordings pause).
  let modelSeq = 0;
  function stopModelAudio() {
    if ($$('[data-say-model][aria-pressed="true"]').length) Speech.cancel();
    modelSeq++;
    $$('[data-say-model][aria-pressed="true"]').forEach((b) => {
      b.setAttribute('aria-pressed', 'false');
      b.textContent = '▶ Listen';
    });
  }
  async function sayModel(btn) {
    const text = Demo.modelAnswer(btn.getAttribute('data-say-model'));
    const playing = btn.getAttribute('aria-pressed') === 'true';
    stopFeedbackAudio();
    stopModelAudio();
    if (playing || !text || !Speech.ttsSupported) return;
    const my = modelSeq;
    btn.setAttribute('aria-pressed', 'true');
    btn.textContent = '■ Stop';
    $$('#report-root audio, #drill-root audio').forEach((a) => a.pause());
    await pickVoices();
    if (my !== modelSeq) return;
    await Speech.speak(text, { voice: state.voices.interviewer, rate: settings.rate });
    if (my === modelSeq) {
      btn.setAttribute('aria-pressed', 'false');
      btn.textContent = '▶ Listen';
    }
  }

  /** A pause ends answers unless the candidate chose "until I say that's all" with live words. */
  function pauseEnds() {
    return settings.silenceSec > 0 || state.engine === 'whisper';
  }

  function setCallHint() {
    const hint = $('#call-hint');
    const html = 'Say <strong>“repeat”</strong> to hear a question again · ' + (pauseEnds()
      ? 'pause or say <strong>“that’s all”</strong> when you finish'
      : 'say <strong>“that’s all”</strong> when you finish');
    if (hint && hint.innerHTML !== html) hint.innerHTML = html;
  }

  function endWithoutAnswers(message) {
    if (state.drill) return endDrill(message);
    if (state.cancelTap) state.cancelTap();
    state.running = false;
    clearInterval(state.elapsedTimer);
    if (state.callTimer) clearInterval(state.callTimer);
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

  /**
   * Score and save the interview. Everything it needs is captured up front, so a
   * finished interview is always saved, even if the candidate leaves this screen
   * or starts a new call meanwhile; only the on-screen steps depend on staying here.
   */
  async function finishInterview(gen) {
    const alive = () => gen == null || gen === state.callGen;
    const session = state.session;
    const clips = state.clips;
    const startedAt = state.startedAt;
    const integrity = state.integrity;
    const proctoring = proctoringSummary(); // before stopMedia() stops the proctor
    const evidence = state.evidence || [];
    const engine = state.engine;
    const cfg = Object.assign({}, settings);
    const ui = (fn) => { if (alive()) fn(); };
    // Stop waiting on the local AI once it is skipped or this screen is left: the
    // scoresheet must be saved promptly (the request finishes or times out on its own).
    const unlessStopped = (promise) => {
      let poll;
      const stopped = new Promise((resolve) => {
        poll = setInterval(() => { if (state.skipLlm || !alive()) resolve(null); }, 200);
      });
      return Promise.race([promise, stopped]).finally(() => clearInterval(poll));
    };
    stopMedia();
    $('#proc-skip').hidden = true;
    ui(() => {
      show('processing');
      $('#proc-title').textContent = 'Preparing your scoresheet…';
    });
    const useLlm = cfg.llmEnabled && cfg.llmModel;
    const steps = ['Collecting your answers', 'Analysing communication & confidence', 'Scoring thought process & content'].concat(useLlm ? ['Local AI review', 'Writing the summary'] : []).concat(['Building your scoresheet']);
    ui(() => procSteps(steps, 0));
    const items = session.results();
    if (!items.length) {
      ui(() => endWithoutAnswers('The interview ended before any answers were recorded.'));
      return;
    }
    await sleep(250);
    ui(() => procSteps(steps, 1));
    await sleep(300);
    ui(() => procSteps(steps, 2));
    await sleep(300);

    const llmCfg = { url: cfg.llmUrl, model: cfg.llmModel, timeoutMs: 120000 };
    if (useLlm && alive()) {
      state.skipLlm = false;
      $('#proc-skip').hidden = false;
      procSteps(steps, 3);
      const reviewable = items.filter((it) => !it.analysis.skipped && ['listening', 'correction'].indexOf(it.question.type) === -1);
      let i = 0;
      for (const it of reviewable) {
        if (state.skipLlm || !alive()) break;
        i++;
        $('#proc-title').textContent = 'Local AI is reviewing answer ' + i + ' of ' + reviewable.length + '…';
        it.llm = await unlessStopped(LLM.evaluate(llmCfg, {
          role: (Questions.ROLES[cfg.role] || Questions.ROLES.general).label,
          question: it.question.text,
          answer: it.mainText != null ? it.mainText : it.response.text,
          followUps: it.followUps,
          turns: it.question.type === 'roleplay' ? it.response.turns : null,
        }));
      }
    }

    const sheet = Scoring.buildScoresheet({
      candidate: { name: cfg.name, role: cfg.role, experience: cfg.experience },
      config: { length: cfg.length, mode: 'voice', accent: cfg.accent, engine },
      items,
      startedAt,
      endedAt: Date.now(),
      integrity,
      proctoring,
      company: cfg.track === 'tech' ? Object.assign({ id: cfg.company }, Questions.COMPANIES[cfg.company] || Questions.COMPANIES.generic) : null,
    });

    if (useLlm && alive() && !state.skipLlm && sheet.llmUsed) {
      procSteps(steps, 4);
      $('#proc-title').textContent = 'Local AI is writing the summary…';
      const summary = await unlessStopped(LLM.summarize(llmCfg, sheet));
      if (summary) {
        sheet.rulesSummary = sheet.summary;
        sheet.summary = summary;
        sheet.summarySource = 'llm';
      }
    }
    ui(() => {
      $('#proc-skip').hidden = true;
      procSteps(steps, steps.length - 1);
    });
    // Evidence photos are saved with the recordings (this browser only).
    const photos = (await Promise.all(evidence)).filter(Boolean)
      .map((e) => ({ qid: '__proctor', kind: 'photo', index: e.id, blob: e.blob, mimeType: 'image/jpeg', durationMs: 0 }));
    const allClips = clips.concat(photos);
    const saved = await saveSheet(sheet, allClips);
    if (!alive()) {
      if (!$('#screen-home').hidden) renderHistory();
      return;
    }
    showReport(sheet, { clips: allClips, speak: true, clipsNotSaved: !!(allClips.length && saved && saved.where === 'memory') });
  }
  $('#proc-skip').addEventListener('click', () => {
    state.skipLlm = true;
    $('#proc-title').textContent = 'Skipping the AI review…';
  });

  // ------------------------------------------------------------ report
  /** Object URLs and download names for the recordings, grouped by question. */
  function clipMap(clips, sheet) {
    state.clipUrls.forEach((u) => URL.revokeObjectURL(u));
    state.clipUrls = [];
    const map = new Map();
    const order = { main: 0, followup: 1, turn: 2 };
    const qs = (sheet && sheet.questions) || [];
    (clips || []).filter((c) => c.kind !== 'photo').sort((a, b) => order[a.kind] - order[b.kind] || a.index - b.index).forEach((c) => {
      if (!c.blob) return;
      const url = URL.createObjectURL(c.blob);
      state.clipUrls.push(url);
      const label = c.kind === 'turn' ? 'Reply ' + ((c.index || 0) + 1) : c.kind === 'followup' ? 'Follow-up' : 'Answer';
      // Named after the question's number on the scoresheet, so the files sort in interview order.
      const qn = qs.findIndex((q) => q.id === c.qid) + 1;
      const file = 'q' + String(qn || 0).padStart(2, '0') + '-' + label.toLowerCase().replace(/\s+/g, '-') + '-' +
        String(c.qid).replace(/[^a-z0-9_-]/gi, '') + '.' + Recorder.extFor(c.mimeType || c.blob.type);
      if (!map.has(c.qid)) map.set(c.qid, []);
      map.get(c.qid).push({ label, url, file });
    });
    return map;
  }

  /** Object URLs for the proctoring photos, by incident id (released with the recordings). */
  function photoMap(clips) {
    const map = new Map();
    for (const c of clips || []) {
      if (c.kind !== 'photo' || !c.blob) continue;
      const url = URL.createObjectURL(c.blob);
      state.clipUrls.push(url);
      map.set(c.index, url);
    }
    return map;
  }

  function showReport(sheet, opts) {
    const o = opts || {};
    state.sheet = sheet;
    state.reportOpts = { sample: o.sample || null };
    stopFeedbackAudio();
    stopModelAudio();
    Report.mount($('#report-root'), sheet, {
      clips: clipMap(o.clips, sheet),
      photos: photoMap(o.clips),
      canDrill: !!resolveEngine(settings.engine),
      drills: drillsFor(sheet.id),
    });
    $$('#report-root audio').forEach((a) => Recorder.ensureDuration(a));
    const banner = $('#sample-banner');
    banner.hidden = !o.sample && !o.clipsNotSaved;
    if (o.sample) banner.textContent = 'This is a sample scoresheet from a simulated "' + o.sample + '" candidate. Start your own voice interview to get yours.';
    else if (o.clipsNotSaved) banner.textContent = 'Your browser would not store the recordings, so they can be replayed only until you close this tab.';
    show('report');
    document.title = 'Scoresheet · ' + (sheet.candidate.name || 'Candidate') + ' · Tushar AI Interviewer';
    // Only if the candidate is still looking at this scoresheet.
    if (o.speak) setTimeout(() => { if (state.sheet === sheet && !$('#screen-report').hidden) playFeedback(); }, 500);
  }

  // The interviewer reads the result aloud — the interview ends the way it started: in audio.
  let feedbackPlaying = false;
  let feedbackSeq = 0;
  async function playFeedback() {
    if (!state.sheet || !Speech.ttsSupported) return;
    if (feedbackPlaying) return stopFeedbackAudio();
    const my = ++feedbackSeq;
    feedbackPlaying = true;
    const btn = $('#rep-listen');
    btn.textContent = '■ Stop';
    btn.setAttribute('aria-pressed', 'true');
    $$('#report-root audio').forEach((a) => a.pause());
    await pickVoices();
    if (my !== feedbackSeq) return; // stopped while the voices loaded
    const recordings = $$('#report-root .clip audio').length > 0;
    await Speech.speak(Scoring.spokenFeedback(state.sheet, { recordings }), { voice: state.voices.interviewer, rate: settings.rate });
    // Finished on its own: reset the button only. Never cancel speech here, because by now
    // it may belong to something else (a new call's greeting).
    if (my === feedbackSeq) resetFeedbackButton();
  }
  function stopFeedbackAudio() {
    if (feedbackPlaying) Speech.cancel();
    resetFeedbackButton();
  }
  function resetFeedbackButton() {
    feedbackSeq++;
    feedbackPlaying = false;
    const btn = $('#rep-listen');
    if (btn) {
      btn.textContent = '🔊 Hear my feedback';
      btn.setAttribute('aria-pressed', 'false');
    }
  }
  $('#rep-listen').addEventListener('click', () => {
    stopModelAudio();
    playFeedback();
  });
  $('#report-root').addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.hasAttribute('data-say-model')) sayModel(t);
    else if (t.hasAttribute('data-drill')) startDrill(t.getAttribute('data-drill'));
  });

  $('#rep-home').addEventListener('click', () => {
    stopFeedbackAudio();
    stopModelAudio();
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

  // "4-round assessment" on the home page: pick that mode, then go to the setup form.
  // "For my engineers": open the setup on the engineering track.
  $$('[data-pick-track]').forEach((a) => a.addEventListener('click', () => {
    settings.track = a.getAttribute('data-pick-track') === 'tech' ? 'tech' : 'bpo';
    applyTrack();
    readSetup();
  }));
  $$('[data-pick-length]').forEach((a) => a.addEventListener('click', () => {
    if (settings.track === 'tech') {
      settings.track = 'bpo'; // the 4-round assessment is a BPO interview
      applyTrack();
    }
    const el = form.querySelector('input[name="length"][value="' + a.getAttribute('data-pick-length') + '"]');
    if (el) { el.checked = true; readSetup(); }
  }));

  $$('[data-sample]').forEach((btn) => btn.addEventListener('click', () => {
    const profile = btn.getAttribute('data-sample');
    if (profile === 'engineer') {
      // An experienced full-stack engineer, interviewed in the style of the company picked above.
      const { sheet } = Demo.runScripted('engineer', {
        role: 'fullstack', experience: 'experienced', company: settings.company || 'generic', length: 'standard',
        name: 'Arjun Mehta (sample)', startedAt: Date.now() - 28 * 60000, seed: 11,
      });
      showReport(sheet, { sample: 'experienced full-stack engineer' });
      return;
    }
    const { sheet } = Demo.runScripted(profile, {
      role: settings.role === 'sales' || settings.role === 'tech' ? settings.role : 'voice',
      length: 'standard',
      name: profile === 'strong' ? 'Ananya Iyer (sample)' : 'Sample Candidate',
      startedAt: Date.now() - 15 * 60000,
      seed: 7,
    });
    showReport(sheet, { sample: profile });
  }));

  // One recording at a time, and recordings interrupt the spoken feedback.
  $('#report-root').addEventListener('play', (e) => {
    stopFeedbackAudio();
    $$('#report-root audio').forEach((a) => { if (a !== e.target) a.pause(); });
  }, true);

  // ------------------------------------------------------------ boot
  fillSetup();
  populateVoices();
  renderHistory();
  // Remove recordings whose scoresheet is gone (e.g. storage was full or a tab crashed).
  Recorder.pruneExcept(store.get(HISTORY_KEY, []).map((h) => h.id));
  // Tell the candidate up front if the microphone is already blocked for this site.
  if (navigator.permissions && navigator.permissions.query) {
    navigator.permissions.query({ name: 'microphone' }).then((st) => {
      state.micPermission = st.state;
      if (st.state === 'denied') {
        $('#engine-status').innerHTML += '<br>⚠️ The microphone is <strong>blocked</strong> for this site. Click the 🔒 icon in the address bar and allow it.';
      }
    }).catch(() => {});
  }
  if (Speech.ttsSupported && window.speechSynthesis) {
    window.speechSynthesis.addEventListener('voiceschanged', () => populateVoices());
  }
})();
