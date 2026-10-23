/*
 * board.js — the results board: every interview taken on this site, with scores, for the
 * recruiter (with the passcode) or for everyone (if the board is public).
 *
 *   status()            is there a board on this site? (GET /api/results?status=1)
 *   send(sheet)         a candidate's finished interview → the board
 *   filterSort / stats  pure list helpers (also used in Node tests)
 *   open(deps)          the Results screen: passcode, stats, search, list, full scoresheets
 */
(function (root) {
  'use strict';
  const isNode = typeof module === 'object' && module.exports;
  const API = 'api/results'; // relative: works at the site root and under a sub-path
  const KEY = 'aii.board.key';

  // ------------------------------------------------------------ pure helpers
  const VERDICT_ORDER = { strong: 0, hire: 1, borderline: 2, no: 3 };

  function verdictKey(row) {
    const v = String(row.verdict || '').toLowerCase();
    if (/strongly/.test(v)) return 'strong';
    if (/^recommended|^hire/.test(v)) return 'hire';
    if (/borderline/.test(v)) return 'borderline';
    if (/not recommended|reject/.test(v)) return 'no';
    return row.tone === 'good' ? 'hire' : row.tone === 'critical' ? 'no' : 'borderline';
  }

  /** q: text (name, role), verdict: '' | strong | hire | borderline | no, sort: new | old | high | low | name */
  function filterSort(rows, opts) {
    const o = opts || {};
    const q = String(o.q || '').trim().toLowerCase();
    let out = (rows || []).filter((r) => {
      if (o.verdict && verdictKey(r) !== o.verdict) return false;
      if (o.role && r.role !== o.role) return false;
      if (!q) return true;
      return [r.name, r.role, r.plan, r.company, r.verdict].some((x) => String(x || '').toLowerCase().includes(q));
    });
    const by = {
      new: (a, b) => Date.parse(b.submittedAt || b.createdAt) - Date.parse(a.submittedAt || a.createdAt),
      old: (a, b) => Date.parse(a.submittedAt || a.createdAt) - Date.parse(b.submittedAt || b.createdAt),
      high: (a, b) => (b.overall || 0) - (a.overall || 0),
      low: (a, b) => (a.overall || 0) - (b.overall || 0),
      name: (a, b) => String(a.name).localeCompare(String(b.name)),
    }[o.sort || 'new'];
    out = out.slice().sort(by);
    return out;
  }

  function stats(rows, now) {
    const list = rows || [];
    const today = new Date(now || Date.now()).toDateString();
    const scores = list.map((r) => Number(r.overall) || 0);
    const hire = list.filter((r) => ['strong', 'hire'].includes(verdictKey(r))).length;
    return {
      total: list.length,
      average: list.length ? Math.round(scores.reduce((s, x) => s + x, 0) / list.length) : null,
      best: list.length ? Math.max(...scores) : null,
      hirePct: list.length ? Math.round((hire / list.length) * 100) : null,
      today: list.filter((r) => new Date(r.submittedAt || r.createdAt).toDateString() === today).length,
    };
  }

  /** The board's rows as a spreadsheet (Backup.toCsv fills its columns from these stand-ins). */
  function csvOf(rows, Backup) {
    const sheets = {};
    for (const r of rows || []) {
      sheets[r.id] = {
        candidate: { experience: r.experience || '' },
        plan: { label: r.plan || '' },
        englishLevel: { code: r.english || '' },
        durationSec: r.durationSec || 0,
        integrity: { answered: r.answered, skipped: r.skipped },
        redFlags: new Array(Math.min(50, Number(r.redFlags) || 0)),
        // Skill columns, named in words ("callHandling" -> "Call handling").
        dimensions: Object.keys(r.dims || {}).map((k) => ({
          key: k,
          short: k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase()).replace(/ ([A-Z])/g, (m, c) => ' ' + c.toLowerCase()),
          score: r.dims[k],
        })),
        proctoring: r.integrity ? {} : null,
      };
    }
    return Backup.toCsv(rows || [], sheets);
  }

  // ------------------------------------------------------------ network
  async function status() {
    try {
      const r = await fetch(API + '?status=1', { cache: 'no-store' });
      if (!r.ok) return { enabled: false };
      const j = await r.json();
      return { enabled: !!j.enabled, public: !!j.public, passcodeSet: !!j.passcodeSet };
    } catch (e) {
      return { enabled: false }; // a static host without the results API
    }
  }

  /** Resolves { ok, id } or { ok: false, message }. */
  async function send(sheet) {
    try {
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sheet) });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.id) return { ok: true, id: j.id };
      const why = { 429: 'too many results were sent from this connection; try again in an hour', 413: 'the scoresheet is too large', 503: 'the results board is not set up' }[r.status];
      return { ok: false, message: why || j.message || 'the server said ' + r.status };
    } catch (e) {
      return { ok: false, message: 'no internet connection' };
    }
  }

  function savedKey() {
    try { return root.localStorage.getItem(KEY) || ''; } catch (e) { return ''; }
  }
  function saveKey(k) {
    try { if (k) root.localStorage.setItem(KEY, k); else root.localStorage.removeItem(KEY); } catch (e) { /* private mode */ }
  }

  async function api(method, query, key) {
    const r = await fetch(API + (query ? '?' + query : ''), { method, cache: 'no-store', headers: key ? { 'x-admin-key': key } : {} });
    const j = await r.json().catch(() => ({}));
    return { status: r.status, body: j };
  }

  // ------------------------------------------------------------ the Results screen
  /**
   * Two kinds of Results page:
   *  - 'local' (no database): the results candidates sent this device as links, kept here.
   *  - 'remote': this site's results board (only if the site owner connected a database).
   *
   * deps: { container, esc, Report, Backup, Share, onClose, setTitle, receive }
   *   receive: a packed result from a link (#result=…) to add and show first.
   */
  function open(deps) {
    const d = deps;
    const esc = d.esc;
    const el = d.container;
    const Share = d.Share;
    let key = savedKey();
    let savedKeyTried = false; // the passcode was just typed (so a 401 means it is wrong)
    let rows = [];
    let pub = false;
    let mode = null;           // 'local' | 'remote'
    let box = null;
    let addMsg = null;         // { text, ok } under "Add a result"
    let ownerNote = '';        // why the owner isn't signed in (remote, public board)
    const view = { q: '', verdict: '', role: '', sort: 'new' };
    const inbox = () => box || (box = Share.inbox());

    const tone = (r) => ({ strong: 'good', hire: 'good', borderline: 'warning', no: 'critical' })[verdictKey(r)];
    const num = (x) => (Number.isFinite(+x) ? +x : 0);
    const fmtDate = (iso) => {
      const t = new Date(iso);
      return isNaN(t) ? '' : t.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + ', ' + t.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    };
    const btn = (act, label, cls) => '<button class="btn btn-glass btn-small' + (cls ? ' ' + cls : '') + '" type="button" data-act="' + act + '">' + label + '</button>';

    function shell(inner) {
      let line;
      let actions = '';
      if (mode === 'local') {
        line = inbox().persistent
          ? 'Results that candidates sent you. They are kept on this device, in this browser.'
          : 'This browser blocks site storage, so results you open here are kept only until you close this page.';
      } else if (pub) {
        // A public board: everyone reads it; the owner signs in only to delete results.
        line = 'Public: everyone who opens this site can see every result.' + (key ? ' You are signed in as the owner.' : '');
        actions = key ? btn('lock', 'Sign out') : btn('owner', '🔑 Owner');
      } else {
        line = 'Only people with the passcode can see this page.';
        actions = key ? btn('lock', 'Lock') : '';
      }
      el.innerHTML = '<div class="board-head"><div><span class="eyebrow">Results</span><h1 class="display-2">Every interview, every score</h1>' +
        '<p class="muted">' + esc(line) + '</p>' + (ownerNote ? '<p class="board-error">' + esc(ownerNote) + '</p>' : '') + '</div>' +
        '<div class="board-head-actions">' + actions + btn('close', '← Home') + '</div></div>' + inner;
    }

    function passcodeForm(message) {
      shell('<form class="card board-login" data-form="login"><label for="board-key"><strong>' + (pub ? 'Owner sign-in' : 'Passcode') + '</strong></label>' +
        '<p class="muted small">' + (pub ? 'Everyone can already see the results. Sign in with your passcode to delete them; this browser remembers it until you sign out.'
          : 'Only the site owner can see every result. Enter your passcode; this browser remembers it until you press Lock.') + '</p>' +
        '<div class="board-login-row"><input id="board-key" type="password" autocomplete="current-password" required placeholder="Enter passcode">' +
        '<button class="btn btn-primary" type="submit">' + (pub ? 'Sign in' : 'Open results') + '</button>' +
        (pub ? '<button class="btn btn-glass" type="button" data-act="back">Cancel</button>' : '') + '</div>' +
        (message ? '<p class="board-error" role="alert">' + esc(message) + '</p>' : '') + '</form>');
      const input = el.querySelector('#board-key');
      if (input) input.focus();
    }

    function problem(message) {
      shell('<div class="card"><p>' + esc(message) + '</p>' + btn('refresh', '↻ Try again') + '</div>');
    }

    async function ensureMode() {
      if (mode) return mode;
      const st = await status();
      mode = st.enabled ? 'remote' : 'local';
      return mode;
    }

    async function load() {
      el.innerHTML = '<p class="muted board-loading">Loading results…</p>';
      await ensureMode();
      if (mode === 'local') {
        rows = inbox().list();
        return renderList();
      }
      if (!key) {
        // Ask for the passcode straight away, unless the board is public.
        const st = await status();
        if (st.enabled && !st.public && st.passcodeSet) return passcodeForm('');
      }
      let res;
      try {
        res = await api('GET', '', key);
      } catch (e) {
        return problem('The results could not be loaded. Check your internet connection.');
      }
      if (res.status === 503) {
        mode = 'local'; // the site has no database after all: show the results sent to this device
        return load();
      }
      if (res.status === 429) {
        // Locked for a while: keep the saved passcode (it may well be right) and say why.
        savedKeyTried = false;
        return passcodeForm((res.body && res.body.message) || 'Too many wrong passcodes. Wait 15 minutes, then try again.');
      }
      if (res.status === 401) {
        if (key) saveKey('');
        key = '';
        const typed = savedKeyTried;
        savedKeyTried = false;
        return passcodeForm(typed ? 'Wrong passcode. Try again.' : '');
      }
      if (res.status !== 200) return problem((res.body && res.body.message) || 'The results could not be loaded.');
      rows = Array.isArray(res.body.results) ? res.body.results : [];
      pub = !!res.body.public;
      ownerNote = '';
      if (pub && key && !res.body.owner) {
        const typed = savedKeyTried;
        savedKeyTried = false;
        if (res.body.ownerErrorCode === 'locked') {
          ownerNote = res.body.ownerError || 'Too many wrong passcodes. Wait 15 minutes, then try again.';
        } else {
          saveKey('');
          key = '';
          if (typed) return passcodeForm(res.body.ownerError || 'Wrong passcode. Try again.');
        }
      }
      savedKeyTried = false;
      renderList();
    }

    function addCard() {
      return '<form class="card board-add" data-form="add">' +
        '<label for="add-link"><strong>Add a result</strong></label>' +
        '<p class="muted small">After the interview, candidates tap <strong>Send my result</strong> and send you a link (for example on WhatsApp). Open it on this device, or paste the link (or the whole message) here.</p>' +
        '<div class="board-login-row"><input id="add-link" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Paste a result link">' +
        '<button class="btn btn-primary" type="submit">Add</button>' +
        '<label class="btn btn-glass board-file">Add a file<input type="file" accept=".json,application/json" data-file></label></div>' +
        (addMsg ? '<p class="' + (addMsg.ok ? 'board-ok' : 'board-error') + '" role="status">' + esc(addMsg.text) + '</p>' : '') + '</form>';
    }

    function renderList() {
      // A result whose link was edited, or that came as a file (which can't be checked), is
      // listed with a flag but never counted in the totals.
      const edited = rows.filter((r) => r.intact === false).length;
      const unchecked = rows.filter((r) => r.intact === null).length;
      const s = stats(rows.filter((r) => r.intact !== false && r.intact !== null));
      const notCounted = [edited ? edited + ' edited' : '', unchecked ? unchecked + ' from files' : ''].filter(Boolean).join(', ');
      const roles = Array.from(new Set(rows.map((r) => r.role).filter(Boolean))).sort();
      const shown = filterSort(rows, view);
      const tile = (label, value, note) => '<div class="tile"><div class="tile-label">' + esc(label) + '</div><div class="tile-value">' + value + '</div>' + (note ? '<div class="tile-note">' + esc(note) + '</div>' : '') + '</div>';
      const dims = (r) => {
        const keys = Object.keys(r.dims || {}).filter((k) => r.dims[k] != null).slice(0, 7);
        return '<span class="bd-dims" aria-hidden="true">' + keys.map((k) => '<i title="' + esc(k + ' ' + num(r.dims[k])) + '" style="--v:' + Math.max(0, Math.min(100, num(r.dims[k]))) + '"></i>').join('') + '</span>';
      };
      const items = shown.map((r) => '<li><button type="button" class="bd-row" data-id="' + esc(r.id) + '">' +
        '<span class="bd-score bd-' + (r.intact === false ? 'edited' : r.intact === null ? 'unchecked' : tone(r)) + '">' + esc(num(r.overall)) + '</span>' +
        '<span class="bd-main"><strong>' + esc(r.name) + '</strong><span class="bd-sub">' + esc([r.role, r.plan, r.company].filter(Boolean).join(' · ')) + '</span></span>' +
        (r.intact === false
          ? '<span class="bd-verdict status status-critical">⚠️ Edited: don\'t trust</span>'
          : '<span class="bd-verdict status status-' + tone(r) + '">' + esc(r.verdict) + '</span>') +
        dims(r) +
        '<span class="bd-meta">' + esc(fmtDate(r.submittedAt || r.createdAt)) + (r.integrity ? ' · ' + esc(r.integrity) : '') + (num(r.redFlags) ? ' · ⚑ ' + esc(num(r.redFlags)) : '') +
        (r.intact === null ? ' · 📄 from a file, unchecked' : '') + '</span>' +
        '</button></li>').join('');
      const empty = mode === 'local'
        ? '<div class="card board-empty"><h2>No results yet</h2><p class="muted">When a candidate sends you their result link, open it on this device and it appears here.</p></div>'
        : '<div class="card board-empty"><h2>No interviews yet</h2><p class="muted">When someone finishes an interview on this site, their scoresheet appears here.</p></div>';
      shell((mode === 'local' ? addCard() : '') +
        (rows.length ? '<div class="tiles board-tiles">' +
        tile('Interviews', String(s.total), [s.today ? s.today + ' today' : '', notCounted ? notCounted + ' not counted' : ''].filter(Boolean).join(' · ')) +
        tile('Average score', s.average == null ? '—' : s.average + '<span class="tile-unit">/100</span>', '') +
        tile('Recommended', s.hirePct == null ? '—' : s.hirePct + '<span class="tile-unit">%</span>', 'strong or hire') +
        tile('Best score', s.best == null ? '—' : String(s.best), '') + '</div>' +
        '<div class="card board-tools"><input type="search" data-in="q" placeholder="Search name or role" value="' + esc(view.q) + '" aria-label="Search">' +
        '<select data-in="verdict" aria-label="Verdict"><option value="">All verdicts</option><option value="strong">Strongly recommended</option><option value="hire">Recommended</option><option value="borderline">Borderline</option><option value="no">Not recommended</option></select>' +
        '<select data-in="role" aria-label="Role"><option value="">All roles</option>' + roles.map((r) => '<option>' + esc(r) + '</option>').join('') + '</select>' +
        '<select data-in="sort" aria-label="Sort"><option value="new">Newest first</option><option value="old">Oldest first</option><option value="high">Highest score</option><option value="low">Lowest score</option><option value="name">Name A–Z</option></select>' +
        btn('refresh', '↻ Refresh') + btn('csv', 'Export CSV') + '</div>' +
        '<p class="muted small board-count">' + shown.length + ' of ' + rows.length + ' shown · tap a name for the full scoresheet</p><ul class="board-list">' + (items || '<li class="muted">No interviews match.</li>') + '</ul>'
          : empty));
      for (const k of ['verdict', 'role', 'sort']) {
        const sel = el.querySelector('[data-in="' + k + '"]');
        if (sel) sel.value = view[k];
      }
    }

    /** Show one scoresheet below the actions bar. banner: optional { text, tone }. */
    function showSheet(sheet, id, removeAct, banner) {
      const canRemove = removeAct === 'remove' || !(pub && !key);
      el.innerHTML = '<div class="report-actions no-print board-actions"><button class="btn btn-glass" type="button" data-act="back">← All results</button><span class="spacer"></span>' +
        '<button class="btn btn-glass" type="button" data-act="print">Print / Save PDF</button>' +
        (canRemove ? '<button class="btn btn-glass btn-danger" type="button" data-act="' + removeAct + '" data-id="' + esc(id) + '">' + (removeAct === 'remove' ? 'Remove' : 'Delete') + '</button>' : '') + '</div>' +
        (banner ? '<div class="received-banner no-print received-' + (banner.tone === 'warn' ? 'warn' : 'ok') + '" role="status">' + esc(banner.text) + '</div>' : '') +
        '<div class="board-report"></div>';
      const box2 = el.querySelector('.board-report');
      try {
        d.Report.mount(box2, sheet, {});
      } catch (e) {
        box2.innerHTML = '<div class="card"><p>This scoresheet is damaged and can\'t be shown.</p></div>';
      }
      if (d.setTitle) d.setTitle('Results · ' + ((sheet.candidate && typeof sheet.candidate.name === 'string' && sheet.candidate.name.slice(0, 80)) || 'Candidate'));
      root.scrollTo({ top: 0 });
    }

    async function openLocal(id, flash) {
      el.innerHTML = '<p class="muted board-loading">Opening the scoresheet…</p>';
      const row = inbox().list().find((r) => r.id === id) || {};
      let u;
      try {
        u = await Share.unpack(inbox().get(id));
      } catch (e) {
        el.innerHTML = '<div class="card"><p>' + esc(e.message || 'That result could not be opened.') + '</p>' + btn('back', '← All results') + '</div>';
        return;
      }
      const when = row.submittedAt ? ' Received ' + fmtDate(row.submittedAt) + '.' : '';
      const pre = flash ? flash + ' ' : '';
      const banner = row.intact === null
        ? { tone: 'warn', text: pre + '📄 Added from a file. A file can\'t be checked for edits, so it isn\'t counted in the totals: compare the scores with the transcript.' + when }
        : u.intact
          ? { tone: 'ok', text: pre + '✓ Link check passed: no sign of editing.' + when }
          : { tone: 'warn', text: pre + '⚠️ This result was changed after the interview, so its scores can\'t be trusted.' + when };
      showSheet(u.sheet, id, 'remove', banner);
    }

    async function openRemote(id) {
      el.innerHTML = '<p class="muted board-loading">Opening the scoresheet…</p>';
      const res = await api('GET', 'id=' + encodeURIComponent(id), key).catch(() => null);
      if (!res || res.status !== 200 || !res.body.sheet) {
        el.innerHTML = '<div class="card"><p>Could not open that scoresheet' + (res && res.body && res.body.error === 'not-found' ? ': it was deleted.' : '.') + '</p>' + btn('back', '← All results') + '</div>';
        return;
      }
      showSheet(res.body.sheet, id, 'delete', null);
    }

    async function addPacked(packed, flashNew, fromFile) {
      const r = await Share.receive(packed, inbox(), undefined, { fromFile: !!fromFile });
      return {
        id: r.id,
        flash: r.isNew ? flashNew : r.conflict ? 'A different copy of this interview\'s result was sent before; the first one is kept and shown here.' : 'You already had this result.',
      };
    }

    async function addFromText(text) {
      const packed = Share.find(text);
      if (!packed) {
        addMsg = { text: 'That is not a result link. Copy the whole link (or the whole message) the candidate sent, and paste it here.' };
        return load();
      }
      try {
        const r = await addPacked(packed, 'Added to your results.');
        addMsg = null;
        return openLocal(r.id, r.flash);
      } catch (e) {
        addMsg = { text: e.message };
        return load();
      }
    }

    async function addFromFile(file) {
      let added = 0;
      let lastId = null;
      try {
        if (file.size > 5 * 1024 * 1024) throw new Error('That file is too large to be a result.');
        const parsed = d.Backup.parse(await file.text());
        for (const id of Object.keys(parsed.sheets).slice(0, 50)) {
          const r = await addPacked(await Share.pack(parsed.sheets[id]), '', true);
          added++;
          lastId = r.id;
        }
      } catch (e) {
        addMsg = { text: (added ? added + ' added, then: ' : '') + ((e && e.message) || 'That file could not be read.') };
        return load();
      }
      if (added === 1) return openLocal(lastId, 'Added to your results.');
      addMsg = { ok: true, text: added + ' results added.' };
      return load();
    }

    function exportCsv() {
      const mark = (r) => (r.intact === false ? 'EDITED, do not trust: ' : r.intact === null ? 'FROM A FILE, unchecked: ' : '');
      const csv = csvOf(rows.map((r) => (mark(r) ? Object.assign({}, r, { verdict: mark(r) + r.verdict }) : r)), d.Backup);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'interview-results-' + new Date().toISOString().slice(0, 10) + '.csv';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }

    el.onsubmit = (e) => {
      const form = e.target;
      if (form.matches('[data-form="add"]')) {
        e.preventDefault();
        return addFromText(el.querySelector('#add-link').value);
      }
      if (!form.matches('[data-form="login"]')) return;
      e.preventDefault();
      key = el.querySelector('#board-key').value.trim();
      savedKeyTried = true;
      saveKey(key);
      load();
    };
    el.onchange = (e) => {
      if (e.target.matches && e.target.matches('[data-file]') && e.target.files && e.target.files[0]) addFromFile(e.target.files[0]);
    };
    el.oninput = (e) => {
      const k = e.target.getAttribute && e.target.getAttribute('data-in');
      if (!k) return;
      view[k] = e.target.value;
      const pos = e.target.selectionStart;
      renderList();
      const again = el.querySelector('[data-in="' + k + '"]');
      if (again) {
        again.focus();
        if (k === 'q' && pos != null) again.setSelectionRange(pos, pos);
      }
    };
    el.onclick = async (e) => {
      const row = e.target.closest('.bd-row');
      if (row) return mode === 'local' ? openLocal(row.getAttribute('data-id')) : openRemote(row.getAttribute('data-id'));
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const act = b.getAttribute('data-act');
      if (act === 'close') return d.onClose();
      if (act === 'refresh' || act === 'back') {
        if (d.setTitle) d.setTitle('Results');
        return load();
      }
      if (act === 'csv') return exportCsv();
      if (act === 'print') return root.print();
      if (act === 'owner') return passcodeForm('');
      if (act === 'lock') {
        saveKey('');
        key = '';
        ownerNote = '';
        return pub ? load() : passcodeForm('');
      }
      if (act === 'remove') {
        if (!root.confirm('Remove this result from this device?')) return;
        inbox().remove(b.getAttribute('data-id'));
        if (d.setTitle) d.setTitle('Results');
        return load();
      }
      if (act === 'delete') {
        if (!root.confirm('Delete this interview from the results board? This cannot be undone.')) return;
        if (!key) return passcodeForm('Enter the passcode to delete results.');
        const res = await api('DELETE', 'id=' + encodeURIComponent(b.getAttribute('data-id')), key).catch(() => null);
        if (res && res.status === 429) return passcodeForm((res.body && res.body.message) || 'Too many wrong passcodes. Wait 15 minutes, then try again.');
        if (res && res.status === 401) {
          saveKey('');
          key = '';
          return passcodeForm('Wrong passcode. Sign in again to delete.');
        }
        if (!res || res.status !== 200) return root.alert('Could not delete it. Check your internet connection and try again.');
        return load();
      }
    };

    (async () => {
      if (!d.receive) return load();
      // Opened from a result link: keep it on this device, then show it.
      el.innerHTML = '<p class="muted board-loading">Opening the result…</p>';
      try {
        const r = await addPacked(d.receive, 'Saved to your Results on this device.');
        await ensureMode();
        return openLocal(r.id, r.flash);
      } catch (e) {
        mode = 'local';
        addMsg = { text: e.message || 'That result link could not be opened.' };
        return load();
      }
    })();
  }

  const api_ = { status, send, open, filterSort, stats, verdictKey, csvOf };
  if (isNode) module.exports = api_;
  else (root.AII = root.AII || {}).Board = api_;
})(typeof window !== 'undefined' ? window : globalThis);
