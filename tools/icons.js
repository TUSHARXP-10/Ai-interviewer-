#!/usr/bin/env node
/*
 * icons.js — draw the app icons (the four-bar "voice" mark) as PNG files, with no
 * dependencies: a tiny rasteriser and PNG encoder on Node's zlib. Run it after changing
 * the design: node tools/icons.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const BG = [0x05, 0x06, 0x0a];
const EMBER = [0xff, 0x6a, 0x2b];
const CYAN = [0x3e, 0xe6, 0xd0];
// The favicon's design on a 64-unit grid: [x, y, w, h, colour].
const BARS = [[14, 26, 6, 12, EMBER], [24, 16, 6, 32, EMBER], [34, 22, 6, 20, CYAN], [44, 28, 6, 8, CYAN]];

/** Is (x, y) inside a rounded rectangle? */
function inRound(x, y, rx, ry, w, h, r) {
  if (x < rx || y < ry || x > rx + w || y > ry + h) return false;
  const cx = Math.max(rx + r, Math.min(x, rx + w - r));
  const cy = Math.max(ry + r, Math.min(y, ry + h - r));
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

/** RGBA pixels. maskable: a full-bleed background and a smaller mark inside the safe zone. */
function draw(size, maskable) {
  const px = Buffer.alloc(size * size * 4);
  const scale = (maskable ? 0.8 : 1) * size / 64;
  const off = (size - 64 * scale) / 2;
  const S = 4; // 4×4 samples per pixel for smooth edges
  for (let py = 0; py < size; py++) {
    for (let pxl = 0; pxl < size; pxl++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const X = pxl + (sx + 0.5) / S;
          const Y = py + (sy + 0.5) / S;
          const u = (X - off) / scale;
          const v = (Y - off) / scale;
          const inBg = maskable ? true : inRound(X, Y, 0, 0, size, size, size / 4);
          if (!inBg) continue;
          let c = BG;
          for (const [bx, by, bw, bh, col] of BARS) if (inRound(u, v, bx, by, bw, bh, 3)) c = col;
          r += c[0]; g += c[1]; b += c[2]; a += 255;
        }
      }
      const n = S * S;
      const i = (py * size + pxl) * 4;
      const cov = a / n;
      // Colour stored unpremultiplied: average over covered samples only.
      const k = a ? 255 / a : 0;
      px[i] = Math.round(r * k); px[i + 1] = Math.round(g * k); px[i + 2] = Math.round(b * k); px[i + 3] = Math.round(cov);
    }
  }
  return px;
}

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const OUT = path.join(__dirname, '..', 'icons');
const FILES = [['icon-192.png', 192, false], ['icon-512.png', 512, false], ['maskable-512.png', 512, true], ['apple-touch-icon.png', 180, true]];
if (require.main === module) {
  fs.mkdirSync(OUT, { recursive: true });
  for (const [name, size, maskable] of FILES) {
    fs.writeFileSync(path.join(OUT, name), png(size, draw(size, maskable)));
    console.log('icons/' + name);
  }
}
module.exports = { draw, png, crc32, FILES };
