/*
 * recorder.js — records each spoken answer (MediaRecorder) so the candidate can
 * replay their own voice in the scoresheet, and keeps the clips in IndexedDB.
 *
 * Classic script, no dependencies, attaches window.AII.Recorder.
 * Everything stays in this browser. If IndexedDB is missing or refuses to
 * store (private mode, quota), clips are kept in memory for this tab only.
 *
 *   const rec = AII.Recorder.createRecorder(meter.stream);   // null if unsupported
 *   rec.start(); ... rec.pause(); rec.resume(); ... const clip = await rec.stop();
 *   // clip = { blob, mimeType, durationMs, size } or null
 *   await AII.Recorder.saveClips(sheetId, [{ qid, kind, index, blob, mimeType, durationMs }]);
 *   const clips = await AII.Recorder.loadClips(sheetId);
 */
(function (root) {
  'use strict';

  // ------------------------------------------------------------ format choice
  // Order matters: Chrome/Edge/Firefox record WebM/Opus; Safari < 18.4 only MP4/AAC.
  const MIME_CANDIDATES = [
    'audio/webm;codecs=opus',
    'audio/mp4;codecs=mp4a.40.2',
    'audio/mp4',
    'audio/ogg;codecs=opus',
    'audio/webm',
  ];

  function canPlay(mime) {
    try {
      const a = root.document && root.document.createElement('audio');
      return !a || !a.canPlayType || a.canPlayType(mime) !== '';
    } catch (e) {
      return true;
    }
  }

  /** First type this browser can both record and play back ('' = let the browser choose). */
  function pickMime() {
    const MR = root.MediaRecorder;
    if (!MR || typeof MR.isTypeSupported !== 'function') return '';
    let firstRecordable = '';
    for (const m of MIME_CANDIDATES) {
      let ok = false;
      try { ok = MR.isTypeSupported(m); } catch (e) { /* ignore */ }
      if (!ok) continue;
      if (!firstRecordable) firstRecordable = m;
      if (canPlay(m)) return m;
    }
    return firstRecordable;
  }

  function extFor(mime) {
    if (/mp4|aac|m4a/i.test(mime)) return 'm4a';
    if (/ogg/i.test(mime)) return 'ogg';
    return 'webm';
  }

  // ------------------------------------------------------------ WebM duration patch
  // Some MediaRecorder WebM files have no Duration in Segment/Info, so <audio>
  // shows "Infinity" and cannot seek. We know the duration, so we insert it.
  const ID_SEGMENT = 0x18538067;
  const ID_INFO = 0x1549a966;
  const ID_SEEKHEAD = 0x114d9b74;
  const ID_CLUSTER = 0x1f43b675;
  const ID_TIMECODESCALE = 0x2ad7b1;
  const ID_DURATION = 0x4489;

  function vintLen(first) {
    for (let i = 0; i < 8; i++) if (first & (0x80 >> i)) return i + 1;
    return 0;
  }
  function readId(u8, p) {
    const len = vintLen(u8[p]);
    if (!len || len > 4 || p + len > u8.length) return null;
    let v = 0;
    for (let i = 0; i < len; i++) v = v * 256 + u8[p + i];
    return { id: v, len };
  }
  function readSize(u8, p) {
    const len = vintLen(u8[p]);
    if (!len || p + len > u8.length) return null;
    let v = u8[p] & (0xff >> len);
    let allOnes = v === (0xff >> len);
    for (let i = 1; i < len; i++) {
      v = v * 256 + u8[p + i];
      if (u8[p + i] !== 0xff) allOnes = false;
    }
    return { size: allOnes ? -1 : v, len };
  }
  function writeSize(value, len) {
    if (value >= Math.pow(2, 7 * len) - 1) return null; // does not fit (all-ones = unknown)
    const out = new Uint8Array(len);
    let v = value;
    for (let i = len - 1; i >= 0; i--) {
      out[i] = v % 256;
      v = Math.floor(v / 256);
    }
    out[0] |= 0x80 >> (len - 1);
    return out;
  }

  /** Returns patched bytes, or null if nothing needed / not safely patchable. */
  function patchWebmDuration(u8, durationMs) {
    let p = 0;
    const ebml = readId(u8, p);
    if (!ebml || ebml.id !== 0x1a45dfa3) return null;
    const ebmlSize = readSize(u8, p + ebml.len);
    if (!ebmlSize || ebmlSize.size < 0) return null;
    p += ebml.len + ebmlSize.len + ebmlSize.size;
    const seg = readId(u8, p);
    if (!seg || seg.id !== ID_SEGMENT) return null;
    const segSizePos = p + seg.len;
    const segSize = readSize(u8, segSizePos);
    if (!segSize) return null;
    p = segSizePos + segSize.len;
    while (p < u8.length) {
      const el = readId(u8, p);
      if (!el) return null;
      const sz = readSize(u8, p + el.len);
      if (!sz || sz.size < 0) return null;
      if (el.id === ID_SEEKHEAD) return null; // positions would shift: leave such files alone
      if (el.id === ID_CLUSTER) return null;  // no Info before the media
      if (el.id === ID_INFO) {
        const infoSizePos = p + el.len;
        const start = infoSizePos + sz.len;
        const end = start + sz.size;
        let scale = 1000000;
        let q = start;
        while (q < end) {
          const c = readId(u8, q);
          if (!c) return null;
          const cs = readSize(u8, q + c.len);
          if (!cs || cs.size < 0) return null;
          const data = q + c.len + cs.len;
          if (c.id === ID_TIMECODESCALE) {
            scale = 0;
            for (let i = 0; i < cs.size; i++) scale = scale * 256 + u8[data + i];
          } else if (c.id === ID_DURATION) {
            const dv = new DataView(u8.buffer, u8.byteOffset + data, cs.size);
            const cur = cs.size === 4 ? dv.getFloat32(0) : cs.size === 8 ? dv.getFloat64(0) : 0;
            if (cur > 0) return null; // already has a real duration
            const out = u8.slice();
            const w = new DataView(out.buffer, data, cs.size);
            const val = (durationMs * 1e6) / (scale || 1e6);
            if (cs.size === 4) w.setFloat32(0, val); else if (cs.size === 8) w.setFloat64(0, val); else return null;
            return out;
          }
          q = data + cs.size;
        }
        // Insert Duration (ID 0x4489, size 8, float64) at the end of Info.
        const dur = new Uint8Array(11);
        dur[0] = 0x44; dur[1] = 0x89; dur[2] = 0x88;
        new DataView(dur.buffer).setFloat64(3, (durationMs * 1e6) / (scale || 1e6));
        const newInfoSize = writeSize(sz.size + 11, sz.len) || writeSize(sz.size + 11, 8);
        let newSegSize = null;
        if (segSize.size >= 0) {
          newSegSize = writeSize(segSize.size + 11 + (newInfoSize.length - sz.len), segSize.len);
          if (!newSegSize) return null;
        }
        const parts = [
          u8.subarray(0, segSizePos),
          newSegSize || u8.subarray(segSizePos, segSizePos + segSize.len),
          u8.subarray(segSizePos + segSize.len, infoSizePos),
          newInfoSize,
          u8.subarray(start, end),
          dur,
          u8.subarray(end),
        ];
        const total = parts.reduce((s, x) => s + x.length, 0);
        const out = new Uint8Array(total);
        let o = 0;
        for (const x of parts) { out.set(x, o); o += x.length; }
        return out;
      }
      p += el.len + sz.len + sz.size;
    }
    return null;
  }

  function blobToArrayBuffer(blob) {
    if (blob.arrayBuffer) return blob.arrayBuffer();
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => reject(fr.error);
      fr.readAsArrayBuffer(blob);
    });
  }

  /** Resolves to a WebM blob that carries its duration (or the original blob). */
  function fixWebmDuration(blob, durationMs) {
    if (!blob || !/webm/i.test(blob.type) || !(durationMs > 0)) return Promise.resolve(blob);
    return blobToArrayBuffer(blob).then((buf) => {
      const out = patchWebmDuration(new Uint8Array(buf), durationMs);
      return out ? new Blob([out], { type: blob.type }) : blob;
    }).catch(() => blob);
  }

  /** Last resort for players that still report Infinity: seek far, then back. */
  function ensureDuration(audio) {
    function check() {
      if (audio.duration !== Infinity) return;
      const back = () => {
        if (audio.duration === Infinity) return;
        audio.removeEventListener('durationchange', back);
        audio.currentTime = 0;
      };
      audio.addEventListener('durationchange', back);
      try { audio.currentTime = 1e101; } catch (e) { /* ignore */ }
    }
    if (audio.readyState >= 1) check(); else audio.addEventListener('loadedmetadata', check, { once: true });
  }

  // ------------------------------------------------------------ recorder (one clip per answer)
  function createRecorder(stream, opts) {
    const o = opts || {};
    const MR = root.MediaRecorder;
    if (!MR || !stream) return null;
    const mimeType = o.mimeType != null ? o.mimeType : pickMime();
    const bps = o.audioBitsPerSecond || 32000; // 32 kb/s Opus ≈ 240 KB per minute
    let cur = null;

    function make() {
      const tries = [{ mimeType, audioBitsPerSecond: bps }, { audioBitsPerSecond: bps }, {}];
      for (const t of tries) {
        if (!t.mimeType) delete t.mimeType;
        try { return new MR(stream, t); } catch (e) { /* try the next */ }
      }
      return null;
    }

    function discard() {
      const c = cur;
      cur = null;
      if (c && c.r.state !== 'inactive') {
        c.r.ondataavailable = null;
        try { c.r.stop(); } catch (e) { /* ignore */ }
      }
    }

    return {
      mimeType,
      get state() { return cur ? cur.r.state : 'inactive'; },
      start() {
        discard();
        const r = make();
        if (!r) return false;
        const c = { r, parts: [], t0: performance.now(), pausedAt: 0, pausedMs: 0 };
        c.stopped = new Promise((res) => { r.onstop = res; r.onerror = res; });
        r.ondataavailable = (e) => { if (e.data && e.data.size) c.parts.push(e.data); };
        r.onstart = () => { c.t0 = performance.now(); };
        try {
          if (o.timeslice) r.start(o.timeslice); else r.start();
        } catch (e) {
          return false;
        }
        cur = c;
        return true;
      },
      /** Interviewer talks mid-answer (a nudge): keep that out of the clip. */
      pause() {
        const c = cur;
        if (c && c.r.state === 'recording' && typeof c.r.pause === 'function') {
          try { c.r.pause(); c.pausedAt = performance.now(); } catch (e) { /* keep recording */ }
        }
      },
      resume() {
        const c = cur;
        if (c && c.r.state === 'paused') {
          try {
            c.r.resume();
            c.pausedMs += performance.now() - c.pausedAt;
            c.pausedAt = 0;
          } catch (e) { /* ignore */ }
        }
      },
      /** Finish the clip: resolves { blob, mimeType, durationMs, size } or null. */
      async stop() {
        const c = cur;
        cur = null;
        if (!c) return null;
        const end = c.pausedAt || performance.now();
        if (c.r.state !== 'inactive') {
          try { c.r.stop(); } catch (e) { /* ignore */ }
        }
        await Promise.race([c.stopped, new Promise((r) => setTimeout(r, 3000))]);
        if (!c.parts.length) return null;
        const type = c.r.mimeType || mimeType || c.parts[0].type || 'audio/webm';
        const durationMs = Math.max(0, Math.round(end - c.t0 - c.pausedMs));
        let blob = new Blob(c.parts, { type });
        if (o.fixDuration !== false) blob = await fixWebmDuration(blob, durationMs);
        return blob.size ? { blob, mimeType: type, durationMs, size: blob.size } : null;
      },
      discard,
    };
  }

  // ------------------------------------------------------------ IndexedDB clip store
  // One record per clip, key "<sheetId>|<nnn>", value { sheetId, idx, qid, kind, index,
  // type, durationMs, data: ArrayBuffer }. ArrayBuffer (not Blob) because WebKit
  // has refused Blob values in private windows ("Error preparing Blob/File data").
  const DB_NAME = 'aii-audio';
  const DB_VERSION = 2;
  const STORE = 'answers';
  const memory = new Map(); // sheetId -> clips, used when IndexedDB is unavailable or full
  let dbPromise = null;
  let mode = 'unknown';     // 'idb' | 'memory'

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const idb = (() => { try { return root.indexedDB; } catch (e) { return null; } })();
      if (!idb) return reject(new Error('IndexedDB unavailable'));
      let req;
      try { req = idb.open(DB_NAME, DB_VERSION); } catch (e) { return reject(e); }
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; reject(new Error('IndexedDB open timed out')); }, 4000);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (db.objectStoreNames.contains('clips')) db.deleteObjectStore('clips'); // v1 layout
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => {
        clearTimeout(timer);
        const db = req.result;
        // Let a newer version of this page (another tab) upgrade instead of blocking it.
        db.onversionchange = () => { db.close(); dbPromise = null; };
        if (timedOut) { dbPromise = Promise.resolve(db); mode = 'idb'; return; } // late: use it next time
        resolve(db);
      };
      req.onerror = () => { clearTimeout(timer); reject(req.error || new Error('IndexedDB open failed')); };
      req.onblocked = () => { /* another tab holds an old version; wait for it (timer covers us) */ };
    });
    dbPromise.then(() => { mode = 'idb'; }, () => { mode = 'memory'; dbPromise = null; });
    return dbPromise;
  }

  function tx(storeMode, fn) {
    return openDb().then((db) => new Promise((resolve, reject) => {
      let t;
      try { t = db.transaction(STORE, storeMode); } catch (e) { return reject(e); }
      const out = { value: undefined };
      t.oncomplete = () => resolve(out.value);
      t.onabort = () => reject(t.error || out.error || new Error('transaction aborted'));
      try {
        fn(t.objectStore(STORE), out);
      } catch (e) {               // e.g. DataCloneError thrown by put()
        out.error = e;
        try { t.abort(); } catch (x) { reject(e); }
      }
    }));
  }

  const keyOf = (sheetId, idx) => sheetId + '|' + String(idx).padStart(3, '0');
  const rangeOf = (sheetId) => root.IDBKeyRange.bound(sheetId + '|', sheetId + '|￿');
  const isQuota = (e) => !!e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22);

  /**
   * Save all clips of one scoresheet (replaces any earlier copy).
   * opts.evict: async () => sheetId|null — called on a quota error to free space
   * (e.g. return the oldest history entry's id). Entries with nothing stored are
   * passed over, so only evictions that actually free space use up a retry.
   * Resolves { ok, where: 'idb' | 'memory', error? } and never rejects.
   */
  async function saveClips(sheetId, clips, opts) {
    const list = (clips || []).filter((c) => c && c.blob && c.blob.size);
    if (!list.length) return { ok: false, where: 'none' };
    let records;
    try {
      // Read the bytes BEFORE opening the transaction: awaiting inside it would auto-commit it.
      records = await Promise.all(list.map((c, i) => blobToArrayBuffer(c.blob).then((data) => ({
        sheetId, idx: i, qid: c.qid, kind: c.kind || 'main', index: c.index || 0,
        type: c.mimeType || c.blob.type, durationMs: c.durationMs || 0, data,
      }))));
    } catch (e) {
      memory.set(sheetId, list);
      return { ok: false, where: 'memory', error: e };
    }
    const evict = opts && opts.evict;
    for (let freed = 0; ; ) {
      try {
        await tx('readwrite', (s) => {
          s.delete(rangeOf(sheetId));
          records.forEach((r) => s.put(r, keyOf(sheetId, r.idx)));
        });
        memory.delete(sheetId);
        return { ok: true, where: 'idb' };
      } catch (e) {
        if (isQuota(e) && evict && freed < 6) {
          // Skip victims that hold no recordings: deleting them frees nothing.
          let removed = 0;
          for (;;) {
            const victim = await Promise.resolve(evict()).catch(() => null);
            if (!victim || victim === sheetId) break;
            removed = await evictStored(victim);
            if (removed > 0) break;
          }
          if (removed > 0) {
            freed++;
            continue;
          }
        }
        memory.set(sheetId, list);
        return { ok: false, where: 'memory', error: e, quota: isQuota(e) };
      }
    }
  }

  /** Delete one scoresheet's stored recordings; resolves how many were removed (0 on error). */
  function evictStored(sheetId) {
    return tx('readwrite', (s, out) => {
      const c = s.count(rangeOf(sheetId));
      c.onsuccess = () => { out.value = c.result; };
      s.delete(rangeOf(sheetId));
    }).then((n) => n || 0, () => 0);
  }

  /** Clips of one scoresheet in answer order (Blob rebuilt), [] if none. */
  function loadClips(sheetId) {
    if (memory.has(sheetId)) return Promise.resolve(memory.get(sheetId).slice());
    return tx('readonly', (s, out) => {
      out.value = [];
      const req = s.openCursor(rangeOf(sheetId));
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur) return;
        const v = cur.value;
        const blob = v.data instanceof Blob ? v.data : new Blob([v.data], { type: v.type });
        out.value.push({ qid: v.qid, kind: v.kind, index: v.index, blob, mimeType: v.type, durationMs: v.durationMs });
        cur.continue();
      };
    }).catch(() => []);
  }

  function deleteClips(sheetId) {
    memory.delete(sheetId);
    return tx('readwrite', (s) => { s.delete(rangeOf(sheetId)); }).then(() => true, () => false);
  }

  function clearClips() {
    memory.clear();
    return tx('readwrite', (s) => { s.clear(); }).then(() => true, () => false);
  }

  /** Delete recordings whose scoresheet is no longer in history (orphans). */
  function pruneExcept(keepIds) {
    const keep = new Set(keepIds || []);
    for (const id of Array.from(memory.keys())) if (!keep.has(id)) memory.delete(id);
    return tx('readwrite', (s, out) => {
      out.value = 0;
      const req = s.openKeyCursor ? s.openKeyCursor() : s.openCursor();
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur) return;
        const id = String(cur.key).split('|')[0];
        if (!keep.has(id)) { s.delete(cur.key); out.value++; }
        cur.continue();
      };
    }).catch(() => 0);
  }

  /** { usage, quota } in bytes when the browser tells us, else null. */
  function estimate() {
    const st = root.navigator && root.navigator.storage;
    if (!st || !st.estimate) return Promise.resolve(null);
    return st.estimate().catch(() => null);
  }

  (root.AII = root.AII || {}).Recorder = {
    createRecorder, pickMime, extFor, fixWebmDuration, patchWebmDuration, ensureDuration,
    saveClips, loadClips, deleteClips, clearClips, pruneExcept, estimate,
    get storage() { return mode; },
    MIME_CANDIDATES,
  };
})(typeof window !== 'undefined' ? window : globalThis);
