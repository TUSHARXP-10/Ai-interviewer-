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
const PRIVATE = { PUBLIC_RESULTS: '0' }; // the board is public unless the owner makes it private
const ENV = { ADMIN_KEY: 'letmein', PUBLIC_RESULTS: '0' };
const call = (store, method, opts, env) => R.handle(Object.assign({ method, query: {}, headers: {}, ip: '1.2.3.4' }, opts), store, env || ENV);

test('the status check says whether the board is set up and public', async () => {
  assert.deepEqual((await call(null, 'GET', { query: { status: '1' } }, { BUILT_IN_KEY: null, PUBLIC_RESULTS: '0' })).body, { enabled: false, public: false, passcodeSet: false });
  assert.deepEqual((await call(null, 'GET', { query: { status: '1' } }, {})).body, { enabled: false, public: true, passcodeSet: true }, 'public by default; the built-in passcode counts');
  assert.equal(R.isPublic({}), true);
  assert.equal(R.isPublic({ PUBLIC_RESULTS: '0' }), false);
  assert.equal(R.isPublic({ PUBLIC_RESULTS: 'false' }), false);
  assert.equal(R.isPublic({ PUBLIC_RESULTS: 'true' }), true);
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
  assert.equal((await call(store, 'GET', {}, { BUILT_IN_KEY: null, PUBLIC_RESULTS: '0' })).status, 403, 'private, and no passcode at all');
  assert.equal((await call(store, 'GET', {}, PRIVATE)).status, 401, 'private: the built-in passcode is asked for');
  assert.equal((await call(store, 'GET', {}, {})).status, 200, 'public by default');
  assert.equal((await call(store, 'GET', {}, { BUILT_IN_KEY: null })).status, 200, 'public even with no passcode');
  assert.equal((await call(store, 'DELETE', { query: { id: a.body.id } }, { BUILT_IN_KEY: null })).status, 403, 'but nobody can delete without one');

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
  const list = await call(store, 'GET', {}, {});
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
      case 'SET': if (a.includes('NX') && kv.has(a[0])) return null; kv.set(a[0], a[1]); return 'OK';
      case 'GET': return kv.has(a[0]) ? kv.get(a[0]) : null;
      case 'DEL': return kv.delete(a[0]) ? 1 : 0;
      case 'HSET': { const h = hashes.get(a[0]) || new Map(); h.set(a[1], a[2]); hashes.set(a[0], h); return 1; }
      case 'HMGET': { const h = hashes.get(a[0]) || new Map(); return a.slice(1).map((k) => (h.has(k) ? h.get(k) : null)); }
      case 'HDEL': { const h = hashes.get(a[0]); return h && h.delete(a[1]) ? 1 : 0; }
      case 'ZADD': { const z = zsets.get(a[0]) || new Map(); z.set(a[2], Number(a[1])); zsets.set(a[0], z); return 1; }
      case 'ZREVRANGE': { const z = zsets.get(a[0]) || new Map(); return Array.from(z.entries()).sort((x, y) => y[1] - x[1]).map((e) => e[0]).slice(Number(a[1]), Number(a[2]) + 1); }
      case 'ZREM': { const z = zsets.get(a[0]); return z && z.delete(a[1]) ? 1 : 0; }
      case 'INCR': { const n = (Number(kv.get(a[0])) || 0) + 1; kv.set(a[0], String(n)); return n; }
      case 'DECR': { const n = (Number(kv.get(a[0])) || 0) - 1; kv.set(a[0], String(n)); return n; }
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
  assert.equal(kv.get('aii:rl:1.2.3.4'), '2', 'two sends counted in one window');
  assert.ok(seen.includes('DECR'), 'a right passcode is not counted as a wrong try');
  assert.equal(kv.get('aii:pw:1.2.3.4'), '0');
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

// A stand-in for the built-in passcode (the real one is never written in this public repo).
const crypto = require('crypto');
const SPEC = (() => {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync('open-sesame', Buffer.from(salt, 'hex'), 32, { N: 1024, r: 8, p: 1 }).toString('hex');
  return { salt, hash, N: 1024, r: 8, p: 1 };
})();

test('the built-in passcode opens the board; ADMIN_KEY replaces it', async () => {
  const store = R.memoryStore();
  await call(store, 'POST', { body: sheetOf('strong', 'Built In') });
  const env = { BUILT_IN_KEY: SPEC, PUBLIC_RESULTS: '0' };
  assert.equal((await call(store, 'GET', { headers: { 'x-admin-key': 'open-sesame' } }, env)).status, 200);
  assert.equal((await call(store, 'GET', { headers: { 'x-admin-key': 'open-sesame' } }, env)).status, 200, 'cached the second time');
  assert.equal((await call(store, 'GET', { headers: { 'x-admin-key': 'Open-sesame' } }, env)).status, 401);
  assert.equal((await call(store, 'GET', { headers: { 'x-admin-key': 'open-sesame' } }, Object.assign({ ADMIN_KEY: 'mine' }, env))).status, 401, 'ADMIN_KEY wins');
  assert.equal((await call(store, 'GET', { headers: { 'x-admin-key': 'mine' } }, Object.assign({ ADMIN_KEY: 'mine' }, env))).status, 200);
  const one = await call(store, 'GET', { headers: { 'x-admin-key': 'open-sesame' } }, env);
  const del = await call(store, 'DELETE', { query: { id: one.body.results[0].id }, headers: { 'x-admin-key': 'open-sesame' } }, { BUILT_IN_KEY: SPEC });
  assert.equal(del.status, 200, 'the built-in passcode can delete');
  assert.ok(R.builtInMatches, 'exported for a manual check');
});

test('guessing the passcode is stopped after a few wrong tries', async () => {
  const store = R.memoryStore();
  const env = { BUILT_IN_KEY: SPEC, PUBLIC_RESULTS: '0' };
  const get = (key, ip) => call(store, 'GET', { headers: key ? { 'x-admin-key': key } : {}, ip }, env);
  for (let i = 0; i < R.WRONG_TRIES; i++) assert.equal((await get('guess' + i, '5.5.5.5')).status, 401);
  const locked = await get('open-sesame', '5.5.5.5');
  assert.equal(locked.status, 429, 'even the right passcode waits once locked');
  assert.match(locked.body.message, /15 minutes/);
  assert.equal((await get('open-sesame', '6.6.6.6')).status, 200, 'other addresses are not affected');
  assert.equal((await get('', '7.7.7.7')).status, 401);
  for (let i = 0; i < R.WRONG_TRIES + 3; i++) await get('', '7.7.7.7');
  assert.equal((await get('open-sesame', '7.7.7.7')).status, 200, 'opening the page without a passcode is not a wrong try');
  for (let i = 0; i < R.WRONG_TRIES + 5; i++) assert.equal((await get('open-sesame', '7.7.7.7')).status, 200, 'the owner using the board is never locked out');
  // Guesses sent all at once are counted too.
  const burst = await Promise.all(Array.from({ length: 40 }, (_, i) => get(i === 39 ? 'open-sesame' : 'g' + i, '8.8.4.4')));
  assert.ok(burst.filter((r) => r.status === 401).length <= R.WRONG_TRIES, 'at most ' + R.WRONG_TRIES + ' guesses checked');
  assert.equal(burst[39].status, 429);
});

test('on the public board the passcode signs the owner in (to delete), and is limited too', async () => {
  const store = R.memoryStore();
  const a = await call(store, 'POST', { body: sheetOf('average', 'Public One') });
  const env = { BUILT_IN_KEY: SPEC };
  const list = (key, ip) => call(store, 'GET', { headers: key ? { 'x-admin-key': key } : {}, ip }, env);
  const anon = await list('', '1.1.1.1');
  assert.equal(anon.status, 200);
  assert.deepEqual([anon.body.public, anon.body.owner, anon.body.ownerError], [true, false, undefined]);
  const owner = await list('open-sesame', '1.1.1.1');
  assert.deepEqual([owner.status, owner.body.owner], [200, true]);
  const wrong = await list('nope', '1.1.1.1');
  assert.deepEqual([wrong.status, wrong.body.owner, wrong.body.ownerError], [200, false, 'Wrong passcode.'], 'still readable, but not the owner');
  for (let i = 0; i < R.WRONG_TRIES; i++) await list('nope' + i, '2.2.2.2');
  const locked = await list('open-sesame', '2.2.2.2');
  assert.equal(locked.status, 200, 'everyone can still read');
  assert.equal(locked.body.owner, false);
  assert.match(locked.body.ownerError, /15 minutes/);
  assert.equal((await call(store, 'DELETE', { query: { id: a.body.id }, headers: { 'x-admin-key': 'open-sesame' }, ip: '2.2.2.2' }, env)).status, 429, 'and deleting is locked too');
  assert.equal((await call(store, 'DELETE', { query: { id: a.body.id }, ip: '3.3.3.3' }, env)).status, 401);
  assert.equal((await call(store, 'DELETE', { query: { id: a.body.id }, headers: { 'x-admin-key': 'nope' }, ip: '3.3.3.3' }, env)).status, 401);
  assert.equal((await call(store, 'DELETE', { query: { id: a.body.id }, headers: { 'x-admin-key': 'open-sesame' }, ip: '3.3.3.3' }, env)).status, 200);
});
