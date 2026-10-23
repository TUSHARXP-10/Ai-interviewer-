/*
 * share.js — results without a database: a candidate's scoresheet travels inside a link.
 *
 *   pack(sheet)        -> 'r1.<check>.<data>': the scoresheet, compressed (deflate) and written
 *                         in URL-safe base64 ('r0' when the browser can't compress)
 *   unpack(packed)     -> { sheet, intact } (throws an Error with a message fit to show)
 *   linkFor(packed)    -> https://<this site>/#result=r1.… — the part after # never reaches
 *                         any server, so the result goes only to whoever gets the link
 *   find(text)         -> the packed result inside a pasted link or message, or null
 *   summaryOf(sheet)   -> the row the Results page lists (numbers forced to numbers, text trimmed)
 *   inbox()            -> results received on this device (localStorage)
 *
 * "intact" is a light check against hand-edited links (a changed score). It is not a
 * signature: the code that makes it is public, so a determined person could forge one.
 */
(function (root) {
  'use strict';
  const isNode = typeof module === 'object' && module.exports;
  const Backup = isNode ? require('./backup.js') : root.AII.Backup;

  const MAX_LINK = 200000;     // characters of packed data we accept (a real one is ~7–20k)
  const MAX_JSON = 1000000;    // bytes a link may unpack to (stops a "zip bomb" link)
  const BUDGET = 2000000;      // characters all received results may use on a device, so the
                               // app's own history always keeps room
  const MAX_DIMS = 12;
  const FRAG = 'result=';

  // ------------------------------------------------------------ hashing (no crypto needed)
  function cyrb53(str, seed) {
    let h1 = 0xdeadbeef ^ seed;
    let h2 = 0x41c6ce57 ^ seed;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
  }
  const check = (kind, data) => cyrb53('aii-result|' + kind + '|' + data, 11);

  /** The same interview always gets the same id, however often it is received. */
  function idFor(sheet) {
    const name = sheet && sheet.candidate && sheet.candidate.name;
    return 'r_' + cyrb53([sheet.id, sheet.createdAt, name].map(String).join('|'), 3) +
      cyrb53([name, sheet.createdAt, sheet.id].map(String).join('|'), 5).slice(0, 8);
  }

  // ------------------------------------------------------------ bytes <-> text
  function toB64url(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function fromB64url(str) {
    const b = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4));
    const out = new Uint8Array(b.length);
    for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
    return out;
  }

  async function readAll(stream, max) {
    const reader = stream.getReader();
    const chunks = [];
    let n = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      n += value.length;
      if (n > max) {
        reader.cancel().catch(() => {});
        throw new Error('too-big');
      }
      chunks.push(value);
    }
    const out = new Uint8Array(n);
    let at = 0;
    for (const c of chunks) {
      out.set(c, at);
      at += c.length;
    }
    return out;
  }
  const canCompress = () => typeof root.CompressionStream === 'function';
  const canDecompress = () => typeof root.DecompressionStream === 'function';
  const deflate = (bytes) => readAll(new Blob([bytes]).stream().pipeThrough(new root.CompressionStream('deflate-raw')), Infinity);
  const inflate = (bytes) => readAll(new Blob([bytes]).stream().pipeThrough(new root.DecompressionStream('deflate-raw')), MAX_JSON);

  // ------------------------------------------------------------ pack / unpack
  async function pack(sheet) {
    const raw = new TextEncoder().encode(JSON.stringify(sheet));
    let kind = 'r0';
    let bytes = raw;
    if (canCompress()) {
      try {
        bytes = await deflate(raw);
        kind = 'r1';
      } catch (e) {
        bytes = raw; // send it uncompressed: longer, but it works
      }
    }
    const data = toB64url(bytes);
    return kind + '.' + check(kind, data) + '.' + data;
  }

  const PACKED_RE = /^(r[01])\.([0-9a-f]{16})\.([A-Za-z0-9_-]+)$/;
  const BROKEN = 'This result link is incomplete: part of it was cut off. Ask the candidate to send it again, or to send the result file.';

  async function unpack(packed) {
    const m = PACKED_RE.exec(String(packed || '').trim());
    if (!m) throw new Error('This is not a result link.');
    const [, kind, sum, data] = m;
    if (data.length > MAX_LINK) throw new Error('This result link is too long to open.');
    let bytes;
    try {
      bytes = fromB64url(data);
    } catch (e) {
      throw new Error(BROKEN);
    }
    if (kind === 'r1') {
      if (!canDecompress()) throw new Error('This browser is too old to open result links. Update it, or open the link in Chrome.');
      try {
        bytes = await inflate(bytes);
      } catch (e) {
        throw new Error(e && e.message === 'too-big' ? 'This result link is too large to open.' : BROKEN);
      }
    } else if (bytes.length > MAX_JSON) {
      throw new Error('This result link is too large to open.');
    }
    let sheet;
    try {
      sheet = JSON.parse(new TextDecoder().decode(bytes));
    } catch (e) {
      throw new Error(BROKEN);
    }
    if (!wellFormed(sheet)) throw new Error('This link does not contain an interview result.');
    return { sheet, intact: sum === check(kind, data) };
  }

  /** A scoresheet with the shape the page needs (the values inside are checked when shown). */
  function wellFormed(sheet) {
    const obj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
    return Backup.isSheet(sheet) && Array.isArray(sheet.questions) && Array.isArray(sheet.dimensions) &&
      obj(sheet.verdict) && obj(sheet.candidate) && obj(sheet.role) &&
      (sheet.rounds == null || Array.isArray(sheet.rounds)) && (sheet.redFlags == null || Array.isArray(sheet.redFlags));
  }

  function siteBase() {
    const loc = root.location;
    return loc ? loc.origin + loc.pathname : '';
  }
  function linkFor(packed, base) {
    return (base == null ? siteBase() : base) + '#' + FRAG + packed;
  }

  /** The packed result in a link, a whole pasted message, or a bare packed string. */
  function find(text) {
    const s = String(text || '');
    const m = /[#?&]result=(r[01]\.[0-9a-f]{16}\.[A-Za-z0-9_-]+)/.exec(s) || /(?:^|[^A-Za-z0-9_.-])(r[01]\.[0-9a-f]{16}\.[A-Za-z0-9_-]{16,})/.exec(s);
    return m ? m[1] : null;
  }

  // ------------------------------------------------------------ the row on the Results page
  const txt = (x, n) => (x == null ? '' : typeof x === 'object' ? '' : String(x)).slice(0, n || 80);
  const num = (x, d) => (typeof x === 'number' && Number.isFinite(x) ? x : typeof x === 'string' && x.trim() && Number.isFinite(+x) ? +x : d);
  const pct = (x) => Math.max(0, Math.min(100, Math.round(num(x, 0))));
  const iso = (x) => {
    const t = Date.parse(typeof x === 'string' ? x : '');
    return isNaN(t) ? new Date(0).toISOString() : new Date(t).toISOString();
  };
  const TONES = ['good', 'warning', 'serious', 'critical'];

  /**
   * Built only from checked values: a scoresheet from a link or a POST is untrusted, so every
   * number is forced to a number and every text is trimmed (the page escapes it as well).
   */
  function summaryOf(sheet, id, at) {
    const s = sheet || {};
    const e = Backup.entryOf({ ...s, dimensions: Array.isArray(s.dimensions) ? s.dimensions.filter((d) => d && typeof d === 'object') : [] });
    const dims = {};
    for (const k of Object.keys(e.dims || {})) {
      // Plain skill names only: never one Object itself has ("constructor", "toString"…).
      if (!/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(k) || k in Object.prototype) continue;
      if (Object.keys(dims).length >= MAX_DIMS) break;
      const v = num(e.dims[k], null);
      dims[k] = v == null ? null : pct(v);
    }
    const integ = s.integrity && typeof s.integrity === 'object' ? s.integrity : {};
    const optNum = (x) => {
      const v = num(x, null);
      return v == null ? null : Math.max(0, Math.round(v));
    };
    return {
      id: String(id || idFor(s)),
      name: txt(e.name, 80) || 'Candidate',
      role: txt(e.role, 80),
      overall: pct(e.overall),
      verdict: txt(e.verdict, 80),
      track: e.track === 'tech' ? 'tech' : 'bpo',
      dims,
      company: e.company ? txt(e.company, 80) : null,
      integrity: e.integrity ? txt(e.integrity, 40) : null,
      createdAt: iso(e.createdAt),
      submittedAt: new Date(at == null ? Date.now() : at).toISOString(),
      plan: s.plan && typeof s.plan === 'object' ? txt(s.plan.label, 60) : '',
      experience: s.candidate && typeof s.candidate === 'object' ? txt(s.candidate.experience, 20) : '',
      durationSec: Math.max(0, Math.round(num(s.durationSec, 0))),
      english: s.englishLevel && typeof s.englishLevel === 'object' ? txt(s.englishLevel.code, 4) : '',
      tone: s.verdict && TONES.includes(s.verdict.tone) ? s.verdict.tone : '',
      redFlags: Array.isArray(s.redFlags) ? s.redFlags.length : 0,
      answered: optNum(integ.answered),
      skipped: optNum(integ.skipped),
      questions: Array.isArray(s.questions) ? s.questions.length : null,
    };
  }

  // ------------------------------------------------------------ results received on this device
  function memoryStorage() {
    const m = new Map();
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
  }

  /**
   * storage: localStorage (or a stand-in for tests). Rows newest first; data kept packed.
   * .persistent is false when this browser blocks storage: results then last for this visit.
   */
  function inbox(storage) {
    let S = storage;
    let persistent = true;
    if (!S) {
      try {
        S = root.localStorage;
        S.getItem('aii.inbox'); // throws where site storage is blocked
      } catch (e) {
        S = null;
      }
      if (!S) {
        S = memoryStorage();
        persistent = false;
      }
    }
    const IDX = 'aii.inbox';
    const DATA = 'aii.inbox.';
    const read = () => {
      try {
        const v = JSON.parse(S.getItem(IDX) || '[]');
        return Array.isArray(v) ? v.filter((r) => r && typeof r.id === 'string') : [];
      } catch (e) {
        return [];
      }
    };
    return {
      persistent,
      list: read,
      get: (id) => {
        try { return S.getItem(DATA + id); } catch (e) { return null; }
      },
      /** Adds (or refreshes) one; throws when this device's storage (or our share of it) is full. */
      add(row, packed) {
        const list = read().filter((r) => r.id !== row.id);
        const used = list.reduce((n, r) => n + (Number(r.size) || 0), 0);
        if (used + packed.length > BUDGET) {
          const e = new Error('budget');
          e.name = 'QuotaExceededError';
          throw e;
        }
        row.size = packed.length;
        list.unshift(row);
        list.sort((a, b) => Date.parse(b.submittedAt) - Date.parse(a.submittedAt));
        S.setItem(DATA + row.id, packed);
        try {
          S.setItem(IDX, JSON.stringify(list));
        } catch (e) {
          S.removeItem(DATA + row.id);
          throw e;
        }
      },
      remove(id) {
        try {
          S.removeItem(DATA + id);
          S.setItem(IDX, JSON.stringify(read().filter((r) => r.id !== id)));
        } catch (e) { /* storage went away: nothing to remove */ }
      },
    };
  }

  /**
   * A result from a link (or a file): unpack it and keep it on this device.
   * opts.fromFile: it came as a file, which carries no check, so it is marked unchecked
   * (intact: null) rather than passing a check made here.
   * -> { id, row, sheet, intact, isNew, conflict }; throws an Error fit to show.
   */
  async function receive(packed, box, now, opts) {
    const u = await unpack(packed);
    const sheet = u.sheet;
    const intact = opts && opts.fromFile ? null : u.intact;
    const id = idFor(sheet);
    const had = box.list().find((r) => r.id === id) || null;
    if (had && box.get(id)) {
      // The first copy received is kept: a later link for the same interview (perhaps an
      // edited one) never replaces it.
      return { id, row: had, sheet, intact: had.intact, isNew: false, conflict: box.get(id) !== packed };
    }
    const row = Object.assign(summaryOf(sheet, id, now == null ? Date.now() : now), { intact });
    try {
      box.add(row, packed);
    } catch (e) {
      throw new Error('This device has no room left for more results. Export them (CSV), then remove some old ones.');
    }
    return { id, row, sheet, intact, isNew: true, conflict: false };
  }

  const api = { pack, unpack, wellFormed, linkFor, find, summaryOf, idFor, inbox, receive, canCompress, canDecompress, cyrb53, BUDGET };
  if (isNode) module.exports = api;
  else (root.AII = root.AII || {}).Share = api;
})(typeof window !== 'undefined' ? window : globalThis);
