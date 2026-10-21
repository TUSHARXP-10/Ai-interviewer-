'use strict';
/* The shared results board (lib/results.js): every interview sent, visible with the passcode. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const R = require('../lib/results.js');
const Demo = require('../js/demo.js');

const sheetOf = (profile, name) => {
  const s = Demo.runScripted(profile, { name }).sheet;
  return JSON.parse(JSON.stringify(s));
};
const ENV = { ADMIN_KEY: 'letmein' };
const call = (store, method, opts, env) => R.handle(Object.assign({ method, query: {}, headers: {}, ip: '1.2.3.4' }, opts), store, env || ENV);

test('the status check says whether the board is set up and public', async () => {
  assert.deepEqual((await call(null, 'GET', { query: { status: '1' } }, {})).body, { enabled: false, public: false, passcodeSet: false });
  const st = await call(R.memoryStore(), 'GET', { query: { status: '1' } }, { ADMIN_KEY: 'x', PUBLIC_RESULTS: '1' });
  assert.deepEqual(st.body, { enabled: true, public: true, passcodeSet: true });
  const none = await call(null, 'POST', { body: sheetOf('strong', 'A') });
  assert.equal(none.status, 503);
  assert.match(none.body.message, /Upstash/);
});

test('anyone can send a result; only the passcode can read or delete', async () => {
  const store = R.memoryStore();
  const a = await call(store, 'POST', { body: sheetOf('strong', 'Riya Kapoor') });
  const b = await call(store, 'POST', { body: JSON.stringify(sheetOf('weak', 'Ramesh Pal')) });
  assert.equal(a.status, 201);
  assert.equal(b.status, 201);
  assert.match(a.body.id, /^r_/);

  assert.equal((await call(store, 'GET', {})).status, 401);
  assert.equal((await call(store, 'GET', { headers: { 'x-admin-key': 'nope' } })).status, 401);
  assert.equal((await call(store, 'GET', {}, {})).status, 403, 'no passcode set yet');

  const list = await call(store, 'GET', { headers: { 'x-admin-key': 'letmein' } });
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.results.map((r) => r.name), ['Ramesh Pal', 'Riya Kapoor'], 'newest first');
  const row = list.body.results[1];
  assert.ok(row.overall >= 80 && row.verdict && row.role && row.dims.communication != null && row.submittedAt);

  const one = await call(store, 'GET', { query: { id: a.body.id }, headers: { 'x-admin-key': 'letmein' } });
  assert.equal(one.body.sheet.candidate.name, 'Riya Kapoor');
  assert.ok(Array.isArray(one.body.sheet.questions));

  assert.equal((await call(store, 'DELETE', { query: { id: a.body.id } }, { ADMIN_KEY: 'letmein', PUBLIC_RESULTS: '1' })).status, 401, 'deleting always needs the passcode');
  assert.equal((await call(store, 'DELETE', { query: { id: a.body.id }, headers: { 'x-admin-key': 'letmein' } })).status, 200);
  assert.equal((await call(store, 'GET', { query: { id: a.body.id }, headers: { 'x-admin-key': 'letmein' } })).status, 404);
});

test('sending the same interview twice keeps one copy, and never overwrites it', async () => {
  const store = R.memoryStore();
  const s = sheetOf('strong', 'Twice');
  const a = await call(store, 'POST', { body: s });
  const forged = JSON.parse(JSON.stringify(s));
  forged.overall = 100;
  const b = await call(store, 'POST', { body: forged });
  assert.equal(a.status, 201);
  assert.equal(b.status, 200);
  assert.equal(b.body.id, a.body.id);
  const list = await call(store, 'GET', { headers: { 'x-admin-key': 'letmein' } });
  assert.equal(list.body.results.length, 1);
  assert.equal(list.body.results[0].name, 'Twice');
  assert.equal(list.body.results[0].overall, s.overall);
});

test('a public board can be read by everyone', async () => {
  const store = R.memoryStore();
  await call(store, 'POST', { body: sheetOf('average', 'Ankit') });
  const list = await call(store, 'GET', {}, { PUBLIC_RESULTS: '1' });
  assert.equal(list.status, 200);
  assert.equal(list.body.public, true);
  assert.equal(list.body.results.length, 1);
});

test('rejects things that are not scoresheets, oversized bodies and floods', async () => {
  const store = R.memoryStore();
  assert.equal((await call(store, 'POST', { body: 'not json' })).status, 400);
  assert.equal((await call(store, 'POST', { body: { hello: 1 } })).status, 400);
  const big = sheetOf('average', 'Big');
  big.padding = 'x'.repeat(R.MAX_BYTES);
  assert.equal((await call(store, 'POST', { body: big })).status, 413);
  const bad = sheetOf('average', 'Bad');
  bad.overall = 500;
  assert.equal((await call(store, 'POST', { body: bad })).status, 400);
  assert.equal((await call(store, 'GET', { query: { id: '../etc/passwd' }, headers: { 'x-admin-key': 'letmein' } })).status, 400);
  const s = sheetOf('average', 'Flood');
  let last;
  for (let i = 0; i <= R.POSTS_PER_HOUR; i++) last = await call(store, 'POST', { body: s, ip: '9.9.9.9' });
  assert.equal(last.status, 429);
  assert.equal((await call(store, 'POST', { body: sheetOf('average', 'Other'), ip: '8.8.8.8' })).status, 201, 'other addresses are not affected');
});

test('the local file store keeps results across restarts', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aii-results-'));
  const s1 = R.fileStore(dir);
  const a = await call(s1, 'POST', { body: sheetOf('strong', 'Saved One') });
  const s2 = R.fileStore(dir);
  const list = await call(s2, 'GET', { headers: { 'x-admin-key': 'letmein' } });
  assert.equal(list.body.results[0].id, a.body.id);
  assert.equal((await call(s2, 'GET', { query: { id: a.body.id }, headers: { 'x-admin-key': 'letmein' } })).body.sheet.candidate.name, 'Saved One');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('the Redis store speaks the Upstash REST pipeline', async () => {
  // A tiny fake Upstash: enough Redis to check the commands the store sends.
  const kv = new Map();
  const hashes = new Map();
  const zsets = new Map();
  const seen = [];
  const run = (c) => {
    const [cmd, ...a] = c;
    seen.push(cmd);
    switch (cmd) {
      case 'SET': kv.set(a[0], a[1]); return 'OK';
      case 'GET': return kv.has(a[0]) ? kv.get(a[0]) : null;
      case 'DEL': return kv.delete(a[0]) ? 1 : 0;
      case 'HSET': { const h = hashes.get(a[0]) || new Map(); h.set(a[1], a[2]); hashes.set(a[0], h); return 1; }
      case 'HMGET': { const h = hashes.get(a[0]) || new Map(); return a.slice(1).map((k) => (h.has(k) ? h.get(k) : null)); }
      case 'HDEL': { const h = hashes.get(a[0]); return h && h.delete(a[1]) ? 1 : 0; }
      case 'ZADD': { const z = zsets.get(a[0]) || new Map(); z.set(a[2], Number(a[1])); zsets.set(a[0], z); return 1; }
      case 'ZREVRANGE': { const z = zsets.get(a[0]) || new Map(); return Array.from(z.entries()).sort((x, y) => y[1] - x[1]).map((e) => e[0]).slice(Number(a[1]), Number(a[2]) + 1); }
      case 'ZREM': { const z = zsets.get(a[0]); return z && z.delete(a[1]) ? 1 : 0; }
      case 'INCR': { const n = (Number(kv.get(a[0])) || 0) + 1; kv.set(a[0], String(n)); return n; }
      case 'EXPIRE': return 1;
      default: throw new Error('unexpected ' + cmd);
    }
  };
  const fakeFetch = async (url, init) => {
    assert.match(url, /\/pipeline$/);
    assert.equal(init.headers.Authorization, 'Bearer tok');
    const cmds = JSON.parse(init.body);
    for (const c of cmds) for (const x of c) assert.equal(typeof x, 'string', 'Upstash expects string arguments');
    return { ok: true, json: async () => cmds.map((c) => ({ result: run(c) })) };
  };
  const store = R.redisStore('https://example.upstash.io/', 'tok', fakeFetch);
  const a = await call(store, 'POST', { body: sheetOf('strong', 'Redis A') });
  await new Promise((r) => setTimeout(r, 5));
  await call(store, 'POST', { body: sheetOf('weak', 'Redis B') });
  const list = await call(store, 'GET', { headers: { 'x-admin-key': 'letmein' } });
  assert.deepEqual(list.body.results.map((r) => r.name), ['Redis B', 'Redis A']);
  assert.equal((await call(store, 'GET', { query: { id: a.body.id }, headers: { 'x-admin-key': 'letmein' } })).body.sheet.candidate.name, 'Redis A');
  await call(store, 'DELETE', { query: { id: a.body.id }, headers: { 'x-admin-key': 'letmein' } });
  assert.equal((await call(store, 'GET', { headers: { 'x-admin-key': 'letmein' } })).body.results.length, 1);
  assert.ok(seen.includes('INCR'), 'rate limit counted');
  assert.equal(R.storeFromEnv({}), null);
  assert.ok(R.storeFromEnv({ KV_REST_API_URL: 'https://x', KV_REST_API_TOKEN: 't' }));
  assert.ok(R.storeFromEnv({ UPSTASH_REDIS_REST_URL: 'https://x', UPSTASH_REDIS_REST_TOKEN: 't' }));
});

test('the Results page filters, sorts, counts and exports the rows', async () => {
  const Board = require('../js/board.js');
  const Backup = require('../js/backup.js');
  const store = R.memoryStore();
  const names = [['strong', 'Riya Kapoor'], ['average', 'Ankit Shah'], ['weak', 'Ramesh Pal']];
  for (const [p, n] of names) await call(store, 'POST', { body: sheetOf(p, n) });
  const rows = (await call(store, 'GET', { headers: { 'x-admin-key': 'letmein' } })).body.results;

  assert.deepEqual(Board.filterSort(rows, { sort: 'high' }).map((r) => r.name)[0], 'Riya Kapoor');
  assert.deepEqual(Board.filterSort(rows, { sort: 'low' }).map((r) => r.name)[0], 'Ramesh Pal');
  assert.deepEqual(Board.filterSort(rows, { sort: 'name' }).map((r) => r.name), ['Ankit Shah', 'Ramesh Pal', 'Riya Kapoor']);
  assert.deepEqual(Board.filterSort(rows, { q: 'riya' }).map((r) => r.name), ['Riya Kapoor']);
  const strong = Board.filterSort(rows, { verdict: 'strong' });
  assert.ok(strong.every((r) => /Strongly/.test(r.verdict)) && strong.length >= 1);
  assert.equal(Board.verdictKey({ verdict: 'Not recommended yet' }), 'no');
  assert.equal(Board.verdictKey({ verdict: 'Recommended' }), 'hire');
  assert.equal(Board.verdictKey({ verdict: 'Borderline — consider with training' }), 'borderline');

  const st = Board.stats(rows, Date.now());
  assert.equal(st.total, 3);
  assert.equal(st.best, Math.max(...rows.map((r) => r.overall)));
  assert.ok(st.average > 0 && st.hirePct >= 33);
  assert.deepEqual(Board.stats([]), { total: 0, average: null, best: null, hirePct: null, today: 0 });

  const csv = Board.csvOf(rows, Backup);
  const lines = csv.trim().split(/\r\n/);
  assert.equal(lines.length, 4, 'a header and one row per interview');
  assert.match(lines[0], /Candidate.*Overall.*Verdict/);
  assert.ok(lines.some((l) => l.includes('Riya Kapoor')));
});
