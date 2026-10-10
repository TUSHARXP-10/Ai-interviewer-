/*
 * recorder.js — records each spoken answer (MediaRecorder) so candidates can
 * replay their own voice in the scoresheet, and keeps the clips in IndexedDB.
 *
 * Everything stays in this browser. If recording or IndexedDB is unavailable
 * (old browser, private mode), the interview simply runs without replays.
 */
(function (root) {
  'use strict';

  const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/ogg;codecs=opus'];

  function pickMime() {
    const MR = root.MediaRecorder;
    if (!MR || typeof MR.isTypeSupported !== 'function') return '';
    for (const m of MIME_CANDIDATES) {
      try {
        if (MR.isTypeSupported(m)) return m;
      } catch (e) { /* ignore */ }
    }
    return '';
  }

  /**
   * One recorder per interview, reused for every answer.
   * start() begins a new clip, stop() resolves { blob, mimeType, durationMs } or null.
   */
  function createRecorder(stream) {
    if (!root.MediaRecorder || !stream) return null;
    const mimeType = pickMime();
    let rec = null;
    let chunks = [];
    let startedAt = 0;
    let pausedAt = 0;
    let pausedMs = 0;

    function make() {
      const opts = { audioBitsPerSecond: 32000 };
      if (mimeType) opts.mimeType = mimeType;
      try {
        return new root.MediaRecorder(stream, opts);
      } catch (e) {
        return new root.MediaRecorder(stream);
      }
    }

    return {
      mimeType,
      start() {
        this.discard();
        chunks = [];
        pausedMs = 0;
        pausedAt = 0;
        try {
          rec = make();
          rec.ondataavailable = (e) => {
            if (e.data && e.data.size) chunks.push(e.data);
          };
          rec.start();
          startedAt = performance.now();
        } catch (e) {
          rec = null;
        }
      },
      pause() {
        if (rec && rec.state === 'recording') {
          try {
            rec.pause();
            pausedAt = performance.now();
          } catch (e) { /* ignore */ }
        }
      },
      resume() {
        if (rec && rec.state === 'paused') {
          try {
            rec.resume();
            if (pausedAt) pausedMs += performance.now() - pausedAt;
            pausedAt = 0;
          } catch (e) { /* ignore */ }
        }
      },
      stop() {
        return new Promise((resolve) => {
          const r = rec;
          rec = null;
          if (!r || r.state === 'inactive') return resolve(null);
          const guard = setTimeout(() => resolve(null), 3000);
          r.onstop = () => {
            clearTimeout(guard);
            const type = r.mimeType || mimeType || 'audio/webm';
            const blob = chunks.length ? new Blob(chunks, { type }) : null;
            chunks = [];
            if (!blob || !blob.size) return resolve(null);
            const end = pausedAt || performance.now();
            resolve({ blob, mimeType: type, durationMs: Math.max(0, end - startedAt - pausedMs) });
          };
          try {
            r.stop();
          } catch (e) {
            clearTimeout(guard);
            resolve(null);
          }
        });
      },
      discard() {
        const r = rec;
        rec = null;
        chunks = [];
        if (r && r.state !== 'inactive') {
          r.ondataavailable = null;
          r.onstop = null;
          try { r.stop(); } catch (e) { /* ignore */ }
        }
      },
    };
  }

  // ------------------------------------------------------------ IndexedDB clip store

  const DB_NAME = 'aii-audio';
  const STORE = 'clips';
  let dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      let req;
      try {
        if (!root.indexedDB) throw new Error('IndexedDB unavailable');
        req = root.indexedDB.open(DB_NAME, 1);
      } catch (e) {
        reject(e);
        return;
      }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
      req.onblocked = () => reject(new Error('IndexedDB blocked'));
    });
    dbPromise.catch(() => { dbPromise = null; });
    return dbPromise;
  }

  function run(mode, fn) {
    return openDb().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      let result;
      const req = fn(store);
      if (req) req.onsuccess = () => { result = req.result; };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('aborted'));
    }));
  }

  /** clips: [{ qid, kind: 'main'|'followup'|'turn', index, blob, mimeType, durationMs }] */
  function saveClips(sheetId, clips) {
    if (!clips || !clips.length) return Promise.resolve(false);
    const plain = clips.map((c) => ({ qid: c.qid, kind: c.kind, index: c.index || 0, blob: c.blob, mimeType: c.mimeType, durationMs: c.durationMs }));
    return run('readwrite', (s) => s.put(plain, sheetId)).then(() => true).catch(() => false);
  }

  function loadClips(sheetId) {
    return run('readonly', (s) => s.get(sheetId)).then((v) => v || []).catch(() => []);
  }

  function deleteClips(sheetId) {
    return run('readwrite', (s) => s.delete(sheetId)).then(() => true).catch(() => false);
  }

  function clearClips() {
    return run('readwrite', (s) => s.clear()).then(() => true).catch(() => false);
  }

  (root.AII = root.AII || {}).Recorder = { createRecorder, pickMime, saveClips, loadClips, deleteClips, clearClips };
})(typeof window !== 'undefined' ? window : globalThis);
