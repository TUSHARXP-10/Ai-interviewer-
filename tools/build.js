#!/usr/bin/env node
/*
 * build.js — copy the static site (index.html, css/, js/) into dist/ for hosting
 * (Vercel, Netlify, GitHub Pages…). No bundling or dependencies: the app runs as is.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'dist');
const FILES = ['index.html', 'css', 'js'];

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
let count = 0;
for (const name of FILES) {
  const from = path.join(root, name);
  if (!fs.existsSync(from)) throw new Error('Missing ' + name);
  fs.cpSync(from, path.join(out, name), { recursive: true });
}
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) walk(path.join(dir, e.name));
    else count++;
  }
})(out);
console.log('Built dist/ (' + count + ' files). Deploy that folder to any static host.');
