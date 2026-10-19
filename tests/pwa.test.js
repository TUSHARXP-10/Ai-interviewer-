'use strict';
// The installable app: manifest, icons, and the service worker's offline list.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const { SHELL } = require('../sw.js');
const Icons = require('../tools/icons.js');

function pngSize(file) {
  const b = fs.readFileSync(path.join(ROOT, file));
  assert.equal(b.toString('hex', 0, 8), '89504e470d0a1a0a', file + ' is a PNG');
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

test('the manifest is valid and its icons exist at their stated sizes', () => {
  const m = JSON.parse(read('manifest.webmanifest'));
  assert.equal(m.display, 'standalone');
  assert.ok(m.name && m.short_name && m.start_url);
  const sizes = m.icons.map((i) => i.sizes);
  assert.ok(sizes.includes('192x192') && sizes.includes('512x512'), 'Android needs 192 and 512');
  assert.ok(m.icons.some((i) => i.purpose === 'maskable'));
  for (const i of m.icons) assert.deepEqual(pngSize(i.src), i.sizes.split('x').map(Number), i.src);
  assert.deepEqual(pngSize('icons/apple-touch-icon.png'), [180, 180]);
});

test('index.html links the manifest and every script it loads works offline', () => {
  const html = read('index.html');
  assert.match(html, /<link rel="manifest" href="manifest.webmanifest">/);
  assert.match(html, /<link rel="apple-touch-icon" href="icons\/apple-touch-icon.png">/);
  const local = [...html.matchAll(/<(?:script src|link rel="stylesheet" href)="([^"]+)"/g)].map((m) => m[1]).filter((u) => !/^https?:/.test(u));
  assert.ok(local.length > 20);
  for (const u of local) assert.ok(SHELL.includes(u), u + ' is in the offline list (sw.js SHELL)');
});

test('every file in js/ and icons/ is in the offline list, and every listed file exists', () => {
  for (const dir of ['js', 'icons']) {
    for (const f of fs.readdirSync(path.join(ROOT, dir))) assert.ok(SHELL.includes(dir + '/' + f), dir + '/' + f + ' missing from sw.js SHELL');
  }
  for (const f of SHELL) if (f !== './') assert.ok(fs.existsSync(path.join(ROOT, f)), f + ' exists');
});

test('the local server and the build ship the app files', () => {
  const server = read('server.js');
  const build = read('tools/build.js');
  for (const f of ['icons', 'manifest.webmanifest', 'sw.js']) {
    assert.ok(server.includes("'" + f + "'"), 'server.js serves ' + f);
    assert.ok(build.includes("'" + f + "'"), 'build.js copies ' + f);
  }
});

test('the icon generator draws what is committed', () => {
  for (const [name, size, maskable] of Icons.FILES) {
    const got = fs.readFileSync(path.join(ROOT, 'icons', name));
    assert.ok(got.equals(Icons.png(size, Icons.draw(size, maskable))), name + ' is up to date (run node tools/icons.js)');
  }
});

test('PNG encoder: CRC and pixels round-trip', () => {
  assert.equal(Icons.crc32(Buffer.from('IEND')), 0xae426082);
  const px = Icons.draw(16, true);
  const file = Icons.png(16, px);
  const idat = file.indexOf('IDAT');
  const len = file.readUInt32BE(idat - 4);
  const raw = zlib.inflateSync(file.subarray(idat + 4, idat + 4 + len));
  assert.equal(raw.length, 16 * (16 * 4 + 1));
  assert.equal(raw[1 + 3], 255, 'maskable icons are fully opaque');
});
