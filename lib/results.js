/*
 * results.js — the shared results board: every finished interview is sent here, and the
 * recruiter (or everyone, if made public) can see all of them on the website.
 *
 *   POST   /api/results              a candidate's scoresheet (no passcode needed)
 *   GET    /api/results?status=1     is the board set up? is it public?
 *   GET    /api/results              all results, newest first (summaries)
 *   GET    /api/results?id=…         one full scoresheet
 *   DELETE /api/results?id=…         remove one (always needs the passcode)
 *
 * This is optional: without storage the site still works, and candidates send their result
 * as a link instead (js/share.js). With storage, the board is public unless a passcode is set
 * in ADMIN_KEY (then reading needs it too, unless PUBLIC_RESULTS=1). Deleting always needs
 * ADMIN_KEY (sent as the x-admin-key header). Wrong passcodes are limited per address. Storage is Upstash Redis on Vercel
 * (free; KV_REST_API_URL / KV_REST_API_TOKEN, added when you connect the database), or a
 * folder of JSON files for the local server.
 *
 * The handler is transport-free: { method, query, headers, body, ip } in, { status, body } out.
 */
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Backup = require('../js/backup.js');
const Share = require('../js/share.js');

const MAX_BYTES = 800 * 1024;   // a full scoresheet is ~30–150 KB; recordings are never sent
const MAX_LIST = 2000;
const POSTS_PER_HOUR = 30;      // per address: stops a script flooding the board
const WRONG_TRIES = 10;         // wrong passcodes per address…
const WRONG_WINDOW_SEC = 15 * 60; // …per 15 minutes, then that address must wait

/**
 * The same interview always gets the same id, so sending it twice (a retry) stores it once.
 * (A scoresheet's own id is its finishing time; the name keeps two candidates apart.)
 */
function idFor(sheet) {
  const name = sheet.candidate && sheet.candidate.name;
  return 'r_' + crypto.createHash('sha256').update([sheet.id, sheet.createdAt, name].map(String).join('|')).digest('hex').slice(0, 24);
}

const ID_RE = /^r_[a-z0-9]{6,40}$/;

function safeEqual(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

/** The row shown in the results list: checked values only (the scoresheet is untrusted). */
function summaryOf(sheet, id, at) {
  return Share.summaryOf(sheet, id, at);
}

/** Public unless a passcode is set (or PUBLIC_RESULTS says otherwise). */
function isPublic(env) {
  const v = String(env.PUBLIC_RESULTS == null ? '' : env.PUBLIC_RESULTS).trim().toLowerCase();
  if (!v) return !env.ADMIN_KEY;
  return v === '1' || v === 'true' || v === 'yes';
}

// The passcode lives only in the deployment's settings (ADMIN_KEY), never in this public code.
const hasPasscode = (env) => !!env.ADMIN_KEY;
const passcodeOk = (env, key) => safeEqual(key, env.ADMIN_KEY);

const LOCKED = 'Too many wrong passcodes. Wait 15 minutes, then try again.';

/** Check a passcode: 'none' (none sent), 'ok', 'wrong', or 'locked' (too many wrong tries). */
async function checkKey(env, key, store, ip) {
  if (!key) return 'none'; // just opening the page: not a guess
  const wrong = 'pw:' + String(ip || 'unknown').slice(0, 64);
  // Every try is counted first (atomically, so guesses sent all at once are counted too),
  // and given back when it was right: only wrong ones add up.
  if (store && (await store.hit(wrong, WRONG_WINDOW_SEC)) > WRONG_TRIES) return 'locked';
  if (!passcodeOk(env, key)) return 'wrong';
  if (store) await store.unhit(wrong, WRONG_WINDOW_SEC);
  return 'ok';
}

/** May this request read (or, with forOwner, delete)? -> { ok, public, owner } or an error. */
async function access(env, headers, store, ip, forOwner) {
  const key = headers['x-admin-key'];
  const pub = !forOwner && isPublic(env);
  if (!hasPasscode(env)) {
    if (pub) return { ok: true, public: true, owner: false };
    return { ok: false, status: 403, error: 'no-passcode', message: 'Set a passcode first: add ADMIN_KEY in your Vercel project → Settings → Environment Variables, then redeploy.' };
  }
  const r = await checkKey(env, key, store, ip);
  // A public board is read by everyone; a passcode sent with it signs the owner in.
  if (pub) return { ok: true, public: true, owner: r === 'ok', ownerError: r === 'wrong' || r === 'locked' ? r : undefined };
  if (r === 'locked') return { ok: false, status: 429, error: 'too-many-tries', message: LOCKED };
  if (r !== 'ok') return { ok: false, status: 401, error: 'passcode', message: 'Wrong passcode.' };
  return { ok: true, public: false, owner: true };
}

/**
 * req: { method, query, headers (lower-case names), body (object or JSON text), ip }
 * store: one of the stores below, or null when no storage is connected.
 */
async function handle(req, store, env) {
  const method = String(req.method || 'GET').toUpperCase();
  const q = req.query || {};
  const headers = req.headers || {};
  const E = env || {};
  if (method === 'GET' && q.status) {
    return { status: 200, body: { enabled: !!store, public: isPublic(E), passcodeSet: hasPasscode(E) } };
  }
  if (!store) {
    return { status: 503, body: { error: 'no-storage', message: 'The results board has no storage yet. In Vercel: Storage → Create Database → Upstash (Redis) → connect it to this project, then redeploy.' } };
  }

  if (method === 'POST') {
    let sheet = req.body;
    if (typeof sheet === 'string') {
      if (sheet.length > MAX_BYTES) return { status: 413, body: { error: 'too-large' } };
      try { sheet = JSON.parse(sheet); } catch (e) { return { status: 400, body: { error: 'bad-json' } }; }
    }
    if (!Backup.isSheet(sheet)) return { status: 400, body: { error: 'not-a-scoresheet' } };
    const json = JSON.stringify(sheet);
    if (json.length > MAX_BYTES) return { status: 413, body: { error: 'too-large' } };
    if (!(sheet.overall >= 0 && sheet.overall <= 100)) return { status: 400, body: { error: 'bad-score' } };
    const hits = await store.hit('rl:' + String(req.ip || 'unknown').slice(0, 64), 3600);
    if (hits > POSTS_PER_HOUR) return { status: 429, body: { error: 'too-many' } };
    const id = idFor(sheet);
    // Already on the board: never overwritten (a copy of someone's scoresheet can't replace it).
    if (await store.get(id)) return { status: 200, body: { ok: true, id, duplicate: true } };
    const at = Date.now();
    await store.save(id, json, summaryOf(sheet, id, at), at);
    return { status: 201, body: { ok: true, id } };
  }

  if (method === 'GET' || method === 'DELETE') {
    const a = await access(E, headers, store, req.ip, method === 'DELETE');
    if (!a.ok) return { status: a.status, body: { error: a.error, message: a.message } };
    if (q.id != null && !ID_RE.test(String(q.id))) return { status: 400, body: { error: 'bad-id' } };
    if (method === 'DELETE') {
      if (!q.id) return { status: 400, body: { error: 'bad-id' } };
      await store.remove(String(q.id));
      return { status: 200, body: { ok: true } };
    }
    if (q.id) {
      const json = await store.get(String(q.id));
      if (!json) return { status: 404, body: { error: 'not-found' } };
      return { status: 200, body: { sheet: typeof json === 'string' ? JSON.parse(json) : json } };
    }
    const results = await store.list(MAX_LIST);
    const body = { results, public: a.public, owner: !!a.owner };
    if (a.ownerError) {
      body.ownerError = a.ownerError === 'locked' ? LOCKED : 'Wrong passcode.';
      body.ownerErrorCode = a.ownerError; // 'wrong' | 'locked'
    }
    return { status: 200, body };
  }
  return { status: 405, body: { error: 'method' } };
}

// ------------------------------------------------------------ stores
// Each store: save(id, json, summary, at), list(limit) -> [summary], get(id) -> json|null,
// remove(id), hit(key, ttlSec) -> count within the window, unhit(key) takes one back.

function memoryStore() {
  const sheets = new Map();
  const sums = new Map();
  const hits = new Map();
  return {
    async save(id, json, summary, at) { sheets.set(id, json); sums.set(id, Object.assign({ _at: at }, summary)); },
    async list(limit) {
      return Array.from(sums.values()).sort((a, b) => b._at - a._at).slice(0, limit).map((s) => { const o = Object.assign({}, s); delete o._at; return o; });
    },
    async get(id) { return sheets.get(id) || null; },
    async remove(id) { sheets.delete(id); sums.delete(id); },
    async hit(key, ttl) {
      const now = Date.now();
      const h = hits.get(key);
      if (!h || h.until < now) { hits.set(key, { n: 1, until: now + ttl * 1000 }); return 1; }
      h.n++;
      return h.n;
    },
    async unhit(key) {
      const h = hits.get(key);
      if (h && h.n > 0) h.n--;
    },
  };
}

/** A folder of JSON files: for the local server (npm start / npm run lan). */
function fileStore(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const indexFile = path.join(dir, 'index.json');
  const mem = memoryStore(); // rate limits only
  const readIndex = () => { try { return JSON.parse(fs.readFileSync(indexFile, 'utf8')); } catch (e) { return []; } };
  const writeIndex = (list) => {
    fs.writeFileSync(indexFile + '.tmp', JSON.stringify(list));
    fs.renameSync(indexFile + '.tmp', indexFile); // never a half-written index
  };
  return {
    async save(id, json, summary, at) {
      fs.writeFileSync(path.join(dir, id + '.json'), json);
      const list = readIndex().filter((s) => s.id !== id);
      list.unshift(Object.assign({ _at: at }, summary));
      writeIndex(list.slice(0, MAX_LIST));
    },
    async list(limit) {
      return readIndex().slice(0, limit).map((s) => { const o = Object.assign({}, s); delete o._at; return o; });
    },
    async get(id) {
      try { return fs.readFileSync(path.join(dir, id + '.json'), 'utf8'); } catch (e) { return null; }
    },
    async remove(id) {
      try { fs.unlinkSync(path.join(dir, id + '.json')); } catch (e) { /* already gone */ }
      writeIndex(readIndex().filter((s) => s.id !== id));
    },
    hit: mem.hit,
    unhit: mem.unhit,
  };
}

/** Upstash Redis over its REST API (no packages): what Vercel's free "Upstash for Redis" gives. */
function redisStore(url, token, fetchImpl) {
  const f = fetchImpl || fetch;
  const base = String(url).replace(/\/+$/, '');
  async function pipeline(cmds) {
    const res = await f(base + '/pipeline', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(cmds),
    });
    if (!res.ok) throw new Error('Redis ' + res.status);
    const out = await res.json();
    return out.map((r) => {
      if (r && r.error) throw new Error('Redis: ' + r.error);
      return r ? r.result : null;
    });
  }
  return {
    async save(id, json, summary, at) {
      await pipeline([
        ['SET', 'aii:sheet:' + id, json],
        ['HSET', 'aii:sum', id, JSON.stringify(summary)],
        ['ZADD', 'aii:idx', String(at), id],
      ]);
    },
    async list(limit) {
      const [ids] = await pipeline([['ZREVRANGE', 'aii:idx', '0', String(limit - 1)]]);
      if (!ids || !ids.length) return [];
      const [rows] = await pipeline([['HMGET', 'aii:sum'].concat(ids)]);
      return (rows || []).filter(Boolean).map((r) => JSON.parse(r));
    },
    async get(id) {
      const [json] = await pipeline([['GET', 'aii:sheet:' + id]]);
      return json || null;
    },
    async remove(id) {
      await pipeline([['DEL', 'aii:sheet:' + id], ['HDEL', 'aii:sum', id], ['ZREM', 'aii:idx', id]]);
    },
    async hit(key, ttl) {
      // Start the window (with its expiry) only if it isn't running, then count. INCR keeps
      // the expiry. Works on every Redis version (EXPIRE … NX needs Redis 7). A counter that
      // lost its expiry (it can't, but if it ever did) gets one back, so no lockout is forever.
      const k = 'aii:' + key;
      const [, n, t] = await pipeline([['SET', k, '0', 'EX', String(ttl), 'NX'], ['INCR', k], ['TTL', k]]);
      if (Number(t) < 0) await pipeline([['EXPIRE', k, String(ttl)]]);
      return Number(n) || 0;
    },
    async unhit(key, ttl) {
      // Never creates a counter without an expiry, even if the window ended a moment ago.
      const k = 'aii:' + key;
      await pipeline([['SET', k, '0', 'EX', String(ttl || 900), 'NX'], ['DECR', k]]);
    },
  };
}

/** The store this deployment has, from its environment variables (null: not set up). */
function storeFromEnv(env) {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? redisStore(url, token) : null;
}

module.exports = { handle, memoryStore, fileStore, redisStore, storeFromEnv, summaryOf, isPublic, MAX_BYTES, POSTS_PER_HOUR, WRONG_TRIES };
