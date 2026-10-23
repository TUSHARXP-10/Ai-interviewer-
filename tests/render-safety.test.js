'use strict';
/*
 * A scoresheet can arrive from outside: a candidate's share link, or a restored backup file.
 * Every value in it may then be hostile, so rendering one must never turn data into live markup.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Text = require('../js/textUtils.js');
const Analyzer = require('../js/analyzer.js');
const Scoring = require('../js/scoring.js');
const Demo = require('../js/demo.js');

globalThis.AII = { Text, Analyzer, Scoring, Demo }; // Demo: the report also shows model answers
require('../js/report.js'); // browser module: registers globalThis.AII.Report
const { Report } = globalThis.AII;

const PAYLOAD = '"><img src=x onerror=alert(1)><svg onload=alert(2)>' + "'" + '<script>alert(3)</script>';
const clone = (x) => JSON.parse(JSON.stringify(x));

// ------------------------------------------------------------ genuine sheets

const inc = (id, kind, severity, extra) => Object.assign({ id, kind, severity, label: kind, at: id * 30000, q: id }, extra);
const PROCTORING = {
  incidents: [
    inc(1, 'away', 'minor', { label: 'Looking away from the screen', direction: 'down', durationMs: 4200 }),
    inc(2, 'phone', 'serious', { label: 'Phone visible', strike: 1, durationMs: 3000 }),
    inc(3, 'extra', 'serious', { label: 'Another person in view', strike: 2, direction: 'side' }),
  ],
  strikes: 2,
  terminated: false,
  secondScreen: true,
  stats: { faceVisiblePct: 97, eyesOnPct: 71, awaySec: 48 },
};

/** Genuine scoresheets that, between them, use every part of the report. */
function genuineSheets() {
  const run = (profile, opts) => Demo.runScripted(profile, opts).sheet;
  const out = {};
  for (const length of ['quick', 'standard', 'full', 'assessment', 'english']) {
    for (const profile of ['strong', 'average', 'weak']) out[profile + '-' + length] = run(profile, { length });
  }
  out['typed-average'] = run('average', { length: 'standard', mode: 'text' });
  out['sales-experienced'] = run('strong', { length: 'standard', role: 'sales', experience: 'experienced' });
  out.engineer = run('engineer', { role: 'fullstack', experience: 'experienced', company: 'google', length: 'standard', seed: 11 });
  out.proctored = run('strong', { length: 'standard', proctoring: clone(PROCTORING) });
  out.terminated = run('weak', {
    length: 'quick',
    proctoring: { incidents: [inc(1, 'away', 'serious', { strike: 1 }), inc(2, 'noFace', 'serious', { strike: 2 }), inc(3, 'tab', 'serious', { strike: 3 })], strikes: 3, terminated: true, stats: { faceVisiblePct: 60, eyesOnPct: 40, awaySec: 200 } },
  });
  // Everything at once: the local AI reviewer, a tailored job, typed answers, every event, rounds and talk-it-through steps.
  const all = run('weak', { length: 'full', mode: 'text', proctoring: clone(PROCTORING) });
  all.questions[0].llm = { model: 'local-model', feedback: 'Clear, but add a number.', better: 'I handled fifty calls a day.' };
  all.questions[1].events = Object.assign({}, all.questions[1].events, { timedOut: true, repeats: 2, pasted: true });
  all.questions[2].approach = out.engineer.questions.find((q) => q.approach).approach;
  all.config.job = { skills: [{ label: 'Billing' }, { label: 'CRM tools' }] };
  all.company = { name: 'Acme', display: 'Acme Support' };
  all.rounds = out['average-assessment'].rounds;
  all.summarySource = 'llm';
  all.llmUsed = true;
  all.incomplete = true;
  all.integrity = Object.assign({}, all.integrity, { tabSwitches: 2, pastes: 1, repeats: 3 });
  all.speech = Object.assign({}, all.speech, { avgWpm: 131, avgLatencySec: 4.5, pitchVariation: 1.6 });
  out.everything = all;
  return out;
}
let cached = null;
const sheets = () => cached || (cached = genuineSheets());

/** What the app passes alongside a sheet: recordings, proctoring photos and practice attempts. */
function fullOpts(sheet) {
  const clips = new Map();
  sheet.questions.forEach((q, i) => {
    const list = [{ label: 'Answer', url: 'blob:clip-' + i, file: 'q' + i + '-answer.webm' }, { label: 'Follow-up', url: 'blob:followup-' + i }];
    (q.turns || []).forEach((t, k) => list.push({ label: 'Reply ' + (k + 1), url: 'blob:reply-' + i + '-' + k, file: 'q' + i + '-reply.webm' }));
    clips.set(q.id, list);
  });
  const photos = new Map(((sheet.proctoring && sheet.proctoring.incidents) || []).map((x, i) => [x.id, 'blob:photo-' + i]));
  const drills = {};
  sheet.questions.slice(0, 2).forEach((q, i) => { drills[q.id] = [{ quality: 40 + i }, { quality: 85 }]; });
  return { clips, photos, canDrill: true, drills };
}
const OPTS = [['no extras', () => ({})], ['recordings, photos and drills', fullOpts]];

// ------------------------------------------------------------ the markup check

const TAGS = new Set('a article audio br button details div em h1 h2 h3 header img li mark nav ol p section small span strong summary table tbody td th thead tr ul'.split(' '));
const PLAIN_ATTRS = new Set(['class', 'id', 'href', 'src', 'title', 'style', 'role', 'tabindex', 'hidden', 'open', 'controls', 'preload', 'download', 'target', 'rel', 'alt', 'type']);
const NO_VALUE = new Set(['hidden', 'open', 'controls']);
const FIXED = { role: /^[a-z]+$/, target: /^_blank$/, rel: /^noopener$/, type: /^button$/, preload: /^metadata$/, tabindex: /^0$/, 'aria-valuemin': /^0$/, 'aria-valuemax': /^100$/ };
const TAG = /<(\/?)([a-z][a-z0-9]*)((?:\s+[a-z][a-z0-9-]*(?:="[^"<>]*")?)*)\s*>/y;
const ATTR = /\s+([a-z][a-z0-9-]*)(?:="([^"<>]*)")?/g;
// An "&" must start an entity (or stand alone before a space, as in the report's own "Speech & grammar").
const BARE_AMP = /&(?!(?:[a-z]+|#\d+|#x[0-9a-f]+);|\s)/i;
const IN_RANGE = (v) => Number(v) >= 0 && Number(v) <= 100;

/**
 * Every way data could have become markup: a "<" that is not one of the report's own tags,
 * a tag or attribute the report never writes (event handlers included), a quote or ">" loose
 * in the text, an attribute that was broken out of, or a class, id, style, number or link that
 * is not plain. `words` must never reach a class, id or style (hostile values the test planted).
 */
function problems(html, urls, words) {
  const found = [];
  const bad = (what, at) => found.push(what + ' near ' + JSON.stringify(html.slice(Math.max(0, at - 50), at + 70)));
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    const end = lt === -1 ? html.length : lt;
    const text = html.slice(i, end);
    if (/[>"']/.test(text)) bad('a raw quote or ">" in text', i);
    if (BARE_AMP.test(text)) bad('a bare "&" in text', i);
    if (lt === -1) break;
    TAG.lastIndex = lt;
    const m = TAG.exec(html);
    if (!m) {
      bad('a "<" that is not a well-formed tag', lt);
      i = lt + 1;
      continue;
    }
    const [, close, name, attrs] = m;
    if (!TAGS.has(name)) bad('an unexpected <' + name + '>', lt);
    if (close && attrs.trim()) bad('attributes on a closing tag', lt);
    for (const [, attr, value] of attrs.matchAll(ATTR)) {
      if (/^on/.test(attr)) bad('an event handler ' + attr, lt);
      else if (!PLAIN_ATTRS.has(attr) && !/^(aria|data)-[a-z-]+$/.test(attr)) bad('an unexpected attribute ' + attr, lt);
      if (value === undefined) {
        if (!NO_VALUE.has(attr)) bad(attr + ' without a value', lt);
        continue;
      }
      if (BARE_AMP.test(value)) bad('a bare "&" in ' + attr, lt);
      if (FIXED[attr] && !FIXED[attr].test(value)) bad(attr + '="' + value + '"', lt);
      if (attr === 'class' && !value.split(' ').every((c) => /^[a-z][a-z0-9-]*$/.test(c))) bad('class="' + value + '"', lt);
      if (attr === 'id' && !/^[a-z][a-z0-9-]*$/.test(value)) bad('id="' + value + '"', lt);
      if (attr === 'style') {
        const s = /^width:(\d+(?:\.\d+)?)%$|^--score:(\d+(?:\.\d+)?)$/.exec(value);
        if (!s || !IN_RANGE(s[1] || s[2])) bad('style="' + value + '"', lt);
      }
      if (attr === 'aria-valuenow' && !(/^\d+(\.\d+)?$/.test(value) && IN_RANGE(value))) bad('aria-valuenow="' + value + '"', lt);
      if (attr === 'data-value' && !/^(Skipped|-?\d+(\.\d+)?\/100)$/.test(value)) bad('data-value="' + value + '"', lt);
      if (attr === 'href' && !/^#[a-z][a-z0-9-]*$/.test(value) && !urls.has(value)) bad('href="' + value + '"', lt);
      if (attr === 'src' && !urls.has(value)) bad('src="' + value + '"', lt);
      if (['class', 'id', 'style', 'role', 'href'].includes(attr) && words.some((w) => value.toLowerCase().includes(w.toLowerCase()))) {
        bad('a planted value in ' + attr + '="' + value + '"', lt);
      }
    }
    i = TAG.lastIndex;
  }
  return found;
}

/** The blob: links the app itself passes in (recordings and photos): the only URLs allowed. */
function urlsOf(opts) {
  const urls = new Set();
  for (const list of (opts.clips || new Map()).values()) for (const c of list) urls.add(c.url);
  for (const u of (opts.photos || new Map()).values()) urls.add(u);
  return urls;
}

function assertInert(html, label, opts, words) {
  assert.equal(typeof html, 'string', label);
  assert.deepEqual(problems(html, urlsOf(opts), words || []).slice(0, 5), [], label);
  // The plainest form of the same check: the payload never appears with a raw "<".
  for (const raw of ['<img src=x', '<svg', '<script', '<img src="x', '<iframe']) assert.ok(!html.includes(raw), label + ': ' + raw);
  if (!opts.photos || !opts.photos.size) assert.ok(!html.includes('<img'), label + ': an image without a photo');
}

// ------------------------------------------------------------ poisoning

const isPrim = (v) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';

/** Rebuild a JSON value with every primitive leaf passed through fn. */
function mapLeaves(value, fn) {
  if (Array.isArray(value)) return value.map((v) => mapLeaves(v, fn));
  if (value && typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value)) out[k] = mapLeaves(value[k], fn);
    return out;
  }
  return fn(value);
}

const PROTO_WORDS = ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf', '__defineGetter__'];
let protoTurn = 0;

/** How each leaf is replaced, and whether the escaped payload must show up in the page. */
const VARIANTS = {
  'every value is a script payload': { leaf: (v) => (isPrim(v) ? PAYLOAD : v), shows: true },
  'every number is a script payload': { leaf: (v) => (typeof v === 'number' ? PAYLOAD : v) },
  'every boolean is a script payload': { leaf: (v) => (typeof v === 'boolean' ? PAYLOAD : v) },
  'every string is a script payload': { leaf: (v) => (typeof v === 'string' ? PAYLOAD : v), shows: true },
  'every value is a payload inside an array': { leaf: (v) => (isPrim(v) ? [PAYLOAD] : v), shows: true },
  'every number is CSS': { leaf: (v) => (typeof v === 'number' ? '50%;background:url(https://evil.example/x);x:' : v) },
  'every number is out of range': { leaf: (v) => (typeof v === 'number' ? (v >= 50 ? 1e9 : -1e9) : v) },
  'every value is a number': { leaf: (v) => (isPrim(v) ? 7 : v) },
  'every value is true': { leaf: (v) => (isPrim(v) ? true : v) },
  'every value is false': { leaf: (v) => (isPrim(v) ? false : v) },
  'every value is null': { leaf: (v) => (isPrim(v) ? null : v) },
  'every string names an object prototype property': { leaf: (v) => (typeof v === 'string' ? PROTO_WORDS[protoTurn++ % PROTO_WORDS.length] : v), words: PROTO_WORDS },
};
const BASES = ['everything', 'weak-assessment', 'engineer', 'strong-english', 'proctored', 'terminated', 'typed-average'];

// ------------------------------------------------------------ tests

test('the markup check accepts every genuine scoresheet, and a sheet read back from JSON renders the same', () => {
  for (const [name, sheet] of Object.entries(sheets())) {
    for (const [optName, make] of OPTS) {
      const html = Report.render(sheet, make(sheet));
      assertInert(html, name + ' · ' + optName, make(sheet));
      assert.equal(Report.render(clone(sheet), make(clone(sheet))), html, name + ' · ' + optName + ': same after JSON');
    }
  }
});

test('the markup check catches data that became markup', () => {
  const urls = new Set();
  assert.ok(problems('<p>' + PAYLOAD + '</p>', urls, []).length, 'raw payload in text');
  assert.ok(problems('<div class="x" title="' + PAYLOAD + '"></div>', urls, []).length, 'a broken-out attribute');
  assert.ok(problems('<div aria-valuenow="5" onclick="x"></div>', urls, []).length, 'an event handler');
  assert.ok(problems('<div style="width:50%;background:red"></div>', urls, []).length, 'CSS in a style');
  assert.ok(problems('<span class="why-x hidden"></span>', urls, ['hidden']).length, 'a planted class');
  assert.deepEqual(problems('<p>' + Text.escapeHtml(PAYLOAD) + '</p><a href="#tr-q1" title="' + Text.escapeHtml(PAYLOAD) + '">x</a>', urls, []), []);
});

for (const [variant, how] of Object.entries(VARIANTS)) {
  test('a hostile sheet renders as inert text: ' + variant, () => {
    for (const base of BASES) {
      const sheet = mapLeaves(clone(sheets()[base]), how.leaf);
      for (const [optName, make] of OPTS) {
        const label = base + ' · ' + optName;
        const opts = make(sheet);
        let html;
        assert.doesNotThrow(() => { html = Report.render(sheet, opts); }, label);
        assertInert(html, label, opts, how.words);
        if (how.shows) assert.ok(html.includes(Text.escapeHtml(PAYLOAD)), label + ': the payload is shown, escaped');
        if (how.words) assert.ok(!/native code|\[object /.test(html), label + ': a planted key reached Object.prototype');
      }
    }
  });
}

test('unknown tones fall back to a neutral style instead of becoming class names', () => {
  const sheet = clone(sheets().proctored);
  sheet.verdict.tone = 'good hidden';
  sheet.proctoring.rating.tone = 'x"><b>';
  sheet.dimensions[0].why = [{ tone: 'constructor', text: 'A note.' }];
  const html = Report.render(sheet, {});
  assert.match(html, /<span class="status status-warning">/);
  assert.match(html, /class="card proctor-card tone-warning"/);
  assert.match(html, /<li class="why-info"><span class="sr-only">Note: <\/span>A note\.<\/li>/);
  assert.ok(!html.includes('hidden"') && !html.includes('native code'));
});

test('extra keys planted in a sheet are ignored', () => {
  const plant = (value) => {
    if (Array.isArray(value)) return value.map(plant);
    if (!value || typeof value !== 'object') return value;
    const out = {};
    for (const k of Object.keys(value)) out[k] = plant(value[k]);
    out[PAYLOAD] = PAYLOAD;
    // What JSON.parse makes of a "__proto__" key: an ordinary own property.
    Object.defineProperty(out, '__proto__', { value: { polluted: PAYLOAD }, enumerable: true, writable: true, configurable: true });
    return out;
  };
  for (const base of BASES) {
    const sheet = sheets()[base];
    for (const [optName, make] of OPTS) {
      assert.equal(Report.render(plant(clone(sheet)), make(sheet)), Report.render(sheet, make(sheet)), base + ' · ' + optName);
    }
  }
});

test('the numbers of a genuine sheet still show as they are', () => {
  const sheet = sheets().everything;
  const html = Report.render(sheet, fullOpts(sheet));
  assert.ok(html.includes('<span class="hero-val">' + sheet.overall + '</span>'));
  for (const d of sheet.dimensions.filter((x) => x.score != null)) {
    assert.ok(html.includes('aria-valuenow="' + d.score + '" aria-label="' + Text.escapeHtml(d.label) + '"><div class="meter-fill" style="width:' + d.score + '%">'), d.key);
  }
  assert.match(html, /Left the interview tab<\/span><strong>2×<\/strong>/);
  assert.match(html, /Pasted answers<\/span><strong>1<\/strong>/);
  assert.match(html, /Asked to repeat a question<\/span><strong>3×<\/strong>/);
  assert.ok(html.includes('97<span class="tile-unit">%</span>') && html.includes('71<span class="tile-unit">%</span>'));
  assert.ok(html.includes('2<span class="tile-unit">/3</span>'));
  assert.ok(html.includes('<small>Q2</small>'));
  assert.ok(html.includes('131<span class="tile-unit">wpm</span>') && html.includes('4.5<span class="tile-unit">s</span>') && html.includes('1.6<span class="tile-unit">st</span>'));
  sheet.rounds.forEach((r) => assert.ok(html.includes('Round ' + r.n + '</span><span class="round-score">' + (r.score == null ? '—' : r.score) + '<small>'), 'round ' + r.n));
  sheet.questions.filter((q) => !q.skipped).forEach((q) => {
    assert.ok(html.includes('data-value="' + q.quality + '/100"'), q.id);
    assert.ok(html.includes('<span class="qa-score" aria-label="Score">' + q.quality + '</span>'), q.id);
  });
  assert.match(html, /Practised 2× · best 85/);
  assert.ok(html.includes('class="status status-' + sheet.verdict.tone + '"'));
});

// Opt-in: RENDER_SAFETY_SNAPSHOTS=<dir> saves each genuine report on the first run and compares on later runs,
// so a change to report.js can be checked byte for byte against the reports from before it.
const SNAPSHOTS = process.env.RENDER_SAFETY_SNAPSHOTS;
test('genuine scoresheets render byte for byte as saved', { skip: !SNAPSHOTS && 'set RENDER_SAFETY_SNAPSHOTS=<dir> to save, then compare' }, () => {
  fs.mkdirSync(SNAPSHOTS, { recursive: true });
  const changed = [];
  for (const [name, sheet] of Object.entries(sheets())) {
    for (const [suffix, make] of [['', OPTS[0][1]], ['.opts', OPTS[1][1]]]) {
      const file = path.join(SNAPSHOTS, name + suffix + '.html');
      const html = Report.render(sheet, make(sheet));
      if (!fs.existsSync(file)) fs.writeFileSync(file, html);
      else if (fs.readFileSync(file, 'utf8') !== html) changed.push(name + suffix);
    }
  }
  assert.deepEqual(changed, []);
});
