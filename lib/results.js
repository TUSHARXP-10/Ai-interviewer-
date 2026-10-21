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
 * Reading needs the passcode in ADMIN_KEY (sent as the x-admin-key header), unless
 * PUBLIC_RESULTS=1 makes the board visible to everyone. Storage is Upstash Redis on Vercel
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

const MAX_BYTES = 800 * 1024;   // a full scoresheet is ~30–150 KB; recordings are never sent
const MAX_LIST = 2000;
const POSTS_PER_HOUR = 30;      // per address: stops a script flooding the board

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

/** The row shown in the results list: what Backup keeps for history, plus a little more. */
function summaryOf(sheet, id, at) {
  const e = Backup.entryOf(sheet);
  return Object.assign(e, {
    id,
    submittedAt: new Date(at).toISOString(),
    plan: sheet.plan && sheet.plan.label ? String(sheet.plan.label).slice(0, 60) : '',
    experience: sheet.candidate && sheet.candidate.experience ? String(sheet.candidate.experience).slice(0, 20) : '',
    durationSec: Number(sheet.durationSec) || 0,
    english: sheet.englishLevel && sheet.englishLevel.code ? String(sheet.englishLevel.code).slice(0, 4) : '',
    tone: sheet.verdict && sheet.verdict.tone ? String(sheet.verdict.tone).slice(0, 12) : '',
    redFlags: Array.isArray(sheet.redFlags) ? sheet.redFlags.length : 0,
    answered: sheet.integrity && sheet.integrity.answered != null ? sheet.integrity.answered : null,
    skipped: sheet.integrity && sheet.integrity.skipped != null ? sheet.integrity.skipped : null,
    questions: Array.isArray(sheet.questions) ? sheet.questions.length : null,
    name: String(e.name || 'Candidate').slice(0, 80),
  });
}

function access(env, headers) {
  if (String(env.PUBLIC_RESULTS || '') === '1') return { ok: true, public: true };
  if (!env.ADMIN_KEY) return { ok: false, status: 403, error: 'no-passcode', message: 'Set a passcode first: add ADMIN_KEY in your Vercel project → Settings → Environment Variables, then redeploy.' };
  if (!safeEqual(headers['x-admin-key'], env.ADMIN_KEY)) return { ok: false, status: 401, error: 'passcode', message: 'Wrong passcode.' };
  return { ok: true, public: false };
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
    return { status: 200, body: { enabled: !!store, public: String(E.PUBLIC_RESULTS || '') === '1', passcodeSet: !!E.ADMIN_KEY } };
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
    const a = method === 'DELETE' ? access(Object.assign({}, E, { PUBLIC_RESULTS: '' }), headers) : access(E, headers);
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
    return { status: 200, body: { results, public: a.public } };
  }
  return { status: 405, body: { error: 'method' } };
}

// ------------------------------------------------------------ stores
// Each store: save(id, json, summary, at), list(limit) -> [summary], get(id) -> json|null,
// remove(id), hit(key, ttlSec) -> count within the window.

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
      const [n] = await pipeline([['INCR', 'aii:' + key], ['EXPIRE', 'aii:' + key, String(ttl), 'NX']]);
      return Number(n) || 0;
    },
  };
}

/** The store this deployment has, from its environment variables (null: not set up). */
function storeFromEnv(env) {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? redisStore(url, token) : null;
}

module.exports = { handle, memoryStore, fileStore, redisStore, storeFromEnv, summaryOf, MAX_BYTES, POSTS_PER_HOUR };
