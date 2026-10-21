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
   * deps: { container, esc, Report, Backup, onClose, setTitle }
   * Renders into container; returns nothing (state lives in the closure).
   */
  function open(deps) {
    const d = deps;
    const esc = d.esc;
    const el = d.container;
    let key = savedKey();
    let savedKeyTried = false; // the passcode was just typed (so a 401 means it is wrong)
    let rows = [];
    let pub = false;
    const view = { q: '', verdict: '', role: '', sort: 'new' };

    const tone = (r) => ({ strong: 'good', hire: 'good', borderline: 'warning', no: 'critical' })[verdictKey(r)];
    const fmtDate = (iso) => {
      const t = new Date(iso);
      return isNaN(t) ? '' : t.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + ', ' + t.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    };

    function shell(inner) {
      el.innerHTML = '<div class="board-head"><div><span class="eyebrow">Results board</span><h1 class="display-2">Every interview, every score</h1>' +
        '<p class="muted">' + (pub ? 'This board is public: anyone with the link can see it.' : 'Only people with the passcode can see this page.') + '</p></div>' +
        '<div class="board-head-actions">' + (key && !pub ? '<button class="btn btn-glass btn-small" type="button" data-act="lock">Lock</button>' : '') +
        '<button class="btn btn-glass btn-small" type="button" data-act="close">← Home</button></div></div>' + inner;
    }

    function passcodeForm(message) {
      shell('<form class="card board-login" data-form="login"><label for="board-key"><strong>Passcode</strong></label>' +
        '<p class="muted small">The passcode is the <code>ADMIN_KEY</code> set in Vercel (Settings → Environment Variables), or the code printed by <code>npm start</code> on your computer.</p>' +
        '<div class="board-login-row"><input id="board-key" type="password" autocomplete="current-password" required placeholder="Enter passcode">' +
        '<button class="btn btn-primary" type="submit">Open results</button></div>' +
        (message ? '<p class="board-error" role="alert">' + esc(message) + '</p>' : '') + '</form>');
      const input = el.querySelector('#board-key');
      if (input) input.focus();
    }

    function notReady(message) {
      shell('<div class="card board-setup"><h2>Set up the results board</h2><p>' + esc(message) + '</p>' +
        '<ol><li>Vercel → your project → <strong>Storage</strong> → <strong>Create Database</strong> → <strong>Upstash for Redis</strong> (free) → connect it to this project.</li>' +
        '<li><strong>Settings → Environment Variables</strong> → add <code>ADMIN_KEY</code> with a passcode only you know. (Or <code>PUBLIC_RESULTS</code> = <code>1</code> to let everyone see the board.)</li>' +
        '<li><strong>Deployments</strong> → ⋯ → <strong>Redeploy</strong>. New interviews then appear here.</li></ol></div>');
    }

    async function load() {
      el.innerHTML = '<p class="muted board-loading">Loading results…</p>';
      if (!key) {
        // Ask for the passcode straight away, unless the board is public (or not set up).
        const st = await status();
        if (st.enabled && !st.public && st.passcodeSet) return passcodeForm('');
      }
      let res;
      try {
        res = await api('GET', '', key);
      } catch (e) {
        return notReady('The results board could not be reached. Check your internet connection.');
      }
      if (res.status === 401) {
        if (key) saveKey('');
        key = '';
        const typed = savedKeyTried;
        savedKeyTried = false;
        return passcodeForm(typed ? 'Wrong passcode. Try again.' : '');
      }
      if (res.status === 403 || res.status === 503 || res.status === 404 || res.status >= 500) {
        return notReady((res.body && res.body.message) || 'This site has no results board yet.');
      }
      rows = res.body.results || [];
      pub = !!res.body.public;
      renderList();
    }

    function renderList() {
      const s = stats(rows);
      const roles = Array.from(new Set(rows.map((r) => r.role).filter(Boolean))).sort();
      const shown = filterSort(rows, view);
      const tile = (label, value, note) => '<div class="tile"><div class="tile-label">' + esc(label) + '</div><div class="tile-value">' + value + '</div>' + (note ? '<div class="tile-note">' + esc(note) + '</div>' : '') + '</div>';
      const dims = (r) => {
        const keys = Object.keys(r.dims || {}).filter((k) => r.dims[k] != null).slice(0, 7);
        return '<span class="bd-dims" aria-hidden="true">' + keys.map((k) => '<i title="' + esc(k) + ' ' + r.dims[k] + '" style="--v:' + Math.max(0, Math.min(100, Number(r.dims[k]) || 0)) + '"></i>').join('') + '</span>';
      };
      const items = shown.map((r) => '<li><button type="button" class="bd-row" data-id="' + esc(r.id) + '">' +
        '<span class="bd-score bd-' + tone(r) + '">' + esc(r.overall) + '</span>' +
        '<span class="bd-main"><strong>' + esc(r.name) + '</strong><span class="bd-sub">' + esc([r.role, r.plan, r.company].filter(Boolean).join(' · ')) + '</span></span>' +
        '<span class="bd-verdict status status-' + tone(r) + '">' + esc(r.verdict) + '</span>' +
        dims(r) +
        '<span class="bd-meta">' + esc(fmtDate(r.submittedAt || r.createdAt)) + (r.integrity ? ' · ' + esc(r.integrity) : '') + (r.redFlags ? ' · ⚑ ' + esc(r.redFlags) : '') + '</span>' +
        '</button></li>').join('');
      shell('<div class="tiles board-tiles">' +
        tile('Interviews', String(s.total), s.today ? s.today + ' today' : '') +
        tile('Average score', s.average == null ? '—' : s.average + '<span class="tile-unit">/100</span>', '') +
        tile('Recommended', s.hirePct == null ? '—' : s.hirePct + '<span class="tile-unit">%</span>', 'strong or hire') +
        tile('Best score', s.best == null ? '—' : String(s.best), '') + '</div>' +
        '<div class="card board-tools"><input type="search" data-in="q" placeholder="Search name or role" value="' + esc(view.q) + '" aria-label="Search">' +
        '<select data-in="verdict" aria-label="Verdict"><option value="">All verdicts</option><option value="strong">Strongly recommended</option><option value="hire">Recommended</option><option value="borderline">Borderline</option><option value="no">Not recommended</option></select>' +
        '<select data-in="role" aria-label="Role"><option value="">All roles</option>' + roles.map((r) => '<option>' + esc(r) + '</option>').join('') + '</select>' +
        '<select data-in="sort" aria-label="Sort"><option value="new">Newest first</option><option value="old">Oldest first</option><option value="high">Highest score</option><option value="low">Lowest score</option><option value="name">Name A–Z</option></select>' +
        '<button class="btn btn-glass btn-small" type="button" data-act="refresh">↻ Refresh</button>' +
        '<button class="btn btn-glass btn-small" type="button" data-act="csv"' + (rows.length ? '' : ' disabled') + '>Export CSV</button></div>' +
        (rows.length
          ? '<p class="muted small board-count">' + shown.length + ' of ' + rows.length + ' shown · click a name for the full scoresheet</p><ul class="board-list">' + (items || '<li class="muted">No interviews match.</li>') + '</ul>'
          : '<div class="card board-empty"><h2>No interviews yet</h2><p class="muted">When someone finishes an interview on this site, their scoresheet appears here.</p></div>'));
      for (const k of ['verdict', 'role', 'sort']) {
        const sel = el.querySelector('[data-in="' + k + '"]');
        if (sel) sel.value = view[k];
      }
    }

    async function openOne(id) {
      el.innerHTML = '<p class="muted board-loading">Opening the scoresheet…</p>';
      const res = await api('GET', 'id=' + encodeURIComponent(id), key).catch(() => null);
      if (!res || res.status !== 200) {
        el.innerHTML = '<div class="card"><p>Could not open that scoresheet' + (res && res.body && res.body.error === 'not-found' ? ': it was deleted.' : '.') + '</p><button class="btn btn-glass" type="button" data-act="back">← All results</button></div>';
        return;
      }
      const sheet = res.body.sheet;
      el.innerHTML = '<div class="report-actions no-print board-actions"><button class="btn btn-glass" type="button" data-act="back">← All results</button><span class="spacer"></span>' +
        '<button class="btn btn-glass" type="button" data-act="print">Print / Save PDF</button>' +
        (pub && !key ? '' : '<button class="btn btn-glass btn-danger" type="button" data-act="delete" data-id="' + esc(id) + '">Delete</button>') + '</div><div class="board-report"></div>';
      d.Report.mount(el.querySelector('.board-report'), sheet, {});
      if (d.setTitle) d.setTitle('Results · ' + ((sheet.candidate && sheet.candidate.name) || 'Candidate'));
      root.scrollTo({ top: 0 });
    }

    function exportCsv() {
      const csv = csvOf(rows, d.Backup);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'interview-results-' + new Date().toISOString().slice(0, 10) + '.csv';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }

    el.onsubmit = (e) => {
      if (!e.target.matches('[data-form="login"]')) return;
      e.preventDefault();
      key = el.querySelector('#board-key').value.trim();
      savedKeyTried = true;
      saveKey(key);
      load();
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
      if (row) return openOne(row.getAttribute('data-id'));
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const act = btn.getAttribute('data-act');
      if (act === 'close') return d.onClose();
      if (act === 'refresh' || act === 'back') { if (d.setTitle) d.setTitle('Results'); return load(); }
      if (act === 'csv') return exportCsv();
      if (act === 'print') return root.print();
      if (act === 'lock') { saveKey(''); key = ''; return passcodeForm(''); }
      if (act === 'delete') {
        if (!root.confirm('Delete this interview from the results board? This cannot be undone.')) return;
        if (!key) return passcodeForm('Enter the passcode to delete results.');
        const res = await api('DELETE', 'id=' + encodeURIComponent(btn.getAttribute('data-id')), key).catch(() => null);
        if (!res || res.status !== 200) return root.alert('Could not delete it' + (res && res.status === 401 ? ': wrong passcode.' : '.'));
        return load();
      }
    };
    load();
  }

  const api_ = { status, send, open, filterSort, stats, verdictKey, csvOf };
  if (isNode) module.exports = api_;
  else (root.AII = root.AII || {}).Board = api_;
})(typeof window !== 'undefined' ? window : globalThis);
