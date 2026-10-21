#!/usr/bin/env node
/*
 * Tiny zero-dependency static server. Browsers only allow the microphone on
 * https:// or on localhost, so:
 *
 *   npm start            → http://localhost:8080 (this computer)
 *   PORT=3000 npm start  → http://localhost:3000
 *   npm run lan          → https://<this-computer's-Wi-Fi-IP>:8443 for a phone on the
 *                          same Wi-Fi, with a self-signed certificate made on the spot
 *                          (kept in .cert/; the phone shows a one-time warning)
 */
'use strict';
const http = require('http');
const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = __dirname;
const Results = require('./lib/results.js');
// The results board: saved in .data/results. Its passcode is ADMIN_KEY, or one made up now
// (printed below) so the board is never open to everyone on the Wi-Fi by accident.
const RESULTS_STORE = (() => {
  try {
    return Results.fileStore(path.join(ROOT, '.data', 'results'));
  } catch (e) {
    return Results.memoryStore(); // a read-only folder: results last until the server stops
  }
})();
const RESULTS_ENV = {
  ADMIN_KEY: process.env.ADMIN_KEY || String(require('crypto').randomInt(100000, 1000000)),
  PUBLIC_RESULTS: process.env.PUBLIC_RESULTS || '',
};

function apiResults(req, res, query) {
  const chunks = [];
  let size = 0;
  req.on('data', (c) => {
    size += c.length;
    if (size > Results.MAX_BYTES + 1024) req.destroy();
    else chunks.push(c);
  });
  req.on('end', async () => {
    try {
      const body = chunks.length ? Buffer.concat(chunks).toString('utf8') : undefined;
      const headers = {};
      for (const [k, v] of Object.entries(req.headers)) headers[k.toLowerCase()] = v;
      const out = await Results.handle({ method: req.method, query, headers, body, ip: req.socket.remoteAddress }, RESULTS_STORE, RESULTS_ENV);
      res.writeHead(out.status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }).end(JSON.stringify(out.body));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'server', message: String(err && err.message) }));
    }
  });
}
const LAN = process.argv.includes('--lan') || process.env.LAN === '1';
const PORT = Number(process.env.PORT) || (LAN ? 8443 : 8080);
const HOST = process.env.HOST || (LAN ? '0.0.0.0' : '127.0.0.1');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};
const PUBLIC = new Set(['index.html', 'css', 'js', 'icons', 'manifest.webmanifest', 'sw.js']);

function handler(req, res) {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch (e) {
    res.writeHead(400).end('Bad request');
    return;
  }
  if (urlPath === '/api/results') {
    apiResults(req, res, Object.fromEntries(new URL(req.url, 'http://localhost').searchParams));
    return;
  }
  if (urlPath === '/') urlPath = '/index.html';
  const file = path.normalize(path.join(ROOT, urlPath));
  const top = path.relative(ROOT, file).split(path.sep)[0];
  if (!file.startsWith(ROOT + path.sep) || !PUBLIC.has(top)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(data);
  });
}

/** This computer's IPv4 addresses on the local network (Wi-Fi, Ethernet, phone hotspot). */
function lanAddresses() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list || []) {
      const v4 = a.family === 'IPv4' || a.family === 4;
      if (!v4 || a.internal || a.address.startsWith('169.254.')) continue; // skip loopback and "no network" addresses
      // Virtual adapters (Docker, VirtualBox, WSL, VPNs) are listed last: a phone can't reach them.
      const virtual = /docker|veth|br-|vbox|virtualbox|vmnet|vmware|wsl|hyper-v|vethernet|utun|tun|tap|zt|tailscale/i.test(name);
      out.push({ address: a.address, name, virtual });
    }
  }
  return out.sort((x, y) => x.virtual - y.virtual);
}

/** Reuse the saved certificate while it still covers every current address; otherwise make a new one. */
function certificate(ips) {
  const dir = path.join(ROOT, '.cert');
  const files = { key: path.join(dir, 'key.pem'), cert: path.join(dir, 'cert.pem'), meta: path.join(dir, 'meta.json') };
  try {
    const meta = JSON.parse(fs.readFileSync(files.meta, 'utf8'));
    const fresh = new Date(meta.notAfter).getTime() - Date.now() > 30 * 24 * 3600 * 1000;
    if (fresh && ips.every((ip) => meta.ips.includes(ip))) {
      return { key: fs.readFileSync(files.key, 'utf8'), cert: fs.readFileSync(files.cert, 'utf8'), reused: true };
    }
  } catch (e) { /* none yet, or unreadable: make one */ }
  const made = require('./tools/selfsigned').generate({ ips, days: 365 });
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(files.key, made.key, { mode: 0o600 });
    fs.writeFileSync(files.cert, made.cert);
    fs.writeFileSync(files.meta, JSON.stringify({ ips: made.ips, notAfter: made.notAfter }, null, 2));
  } catch (e) { /* read-only folder: use it for this run only */ }
  return { key: made.key, cert: made.cert, reused: false };
}

if (LAN) {
  const addrs = lanAddresses();
  const { key, cert, reused } = certificate(addrs.map((a) => a.address));
  const server = https.createServer({ key, cert }, handler);
  server.on('error', fail);
  server.listen(PORT, HOST, () => {
    const real = addrs.filter((a) => !a.virtual);
    const shown = real.length ? real : addrs;
    console.log('\n  AI Interviewer is running on your Wi-Fi.\n');
    if (!shown.length) {
      console.log('  No network connection found. Connect this computer to Wi-Fi (or to your phone\'s hotspot) and run it again.\n');
    } else {
      console.log('  On your phone (same Wi-Fi), open:\n');
      shown.forEach((a, i) => console.log('    ' + (i === 0 ? '👉 ' : '   ') + 'https://' + a.address + ':' + PORT + (shown.length > 1 ? '   (' + a.name + ')' : '')));
      console.log('\n  The phone will warn that the connection is "not private": this is your own');
      console.log('  certificate' + (reused ? '' : ', just created') + '. Tap Advanced → Proceed (Chrome) or Show Details →');
      console.log('  visit this website (Safari). Then allow the microphone and camera.\n');
      console.log('  Can\'t connect? Allow Node.js through the firewall (Windows asks once: tick');
      console.log('  "Private networks"), and check both are on the same Wi-Fi. Guest and office');
      console.log('  Wi-Fi often block devices from seeing each other: use your phone\'s hotspot.\n');
    }
    console.log('  Results of every interview: open the site → Results, passcode ' + RESULTS_ENV.ADMIN_KEY + (process.env.ADMIN_KEY ? ' (your ADMIN_KEY)' : '') + '.\n');
    console.log('  On this computer: https://localhost:' + PORT + '   ·   Press Ctrl+C to stop.\n');
  });
} else {
  const server = http.createServer(handler);
  server.on('error', fail);
  server.listen(PORT, HOST, () => {
    console.log('\n  AI Interviewer is running →  http://localhost:' + PORT + '\n');
    console.log('  Open it in Chrome or Edge, allow the microphone and camera, and good luck!');
    console.log('  To use it on your phone over Wi-Fi, run: npm run lan');
    console.log('  Results of every interview: open the site → Results, passcode ' + RESULTS_ENV.ADMIN_KEY + (process.env.ADMIN_KEY ? ' (your ADMIN_KEY)' : '') + '.');
    console.log('  Press Ctrl+C to stop.\n');
  });
}

function fail(err) {
  if (err && err.code === 'EADDRINUSE') {
    console.error('\n  Port ' + PORT + ' is already in use. Stop the other server, or pick another port, e.g.:');
    console.error('    ' + (process.platform === 'win32' ? 'set PORT=' + (PORT + 1) + ' && ' : 'PORT=' + (PORT + 1) + ' ') + 'npm run ' + (LAN ? 'lan' : 'start') + '\n');
  } else {
    console.error('\n  Could not start the server: ' + ((err && err.message) || err) + '\n');
  }
  process.exit(1);
}
