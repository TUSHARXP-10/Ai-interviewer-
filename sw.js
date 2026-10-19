/*
 * sw.js — the service worker that makes Tushar AI an installable app that opens offline.
 *
 * - The app itself (index.html, css, js, icons): network first, so a new version always
 *   arrives while online; the saved copy is used when offline.
 * - Google Fonts and the versioned AI libraries and models (MediaPipe, transformers.js on
 *   jsDelivr, MediaPipe's model files): saved on first use, so proctoring also starts
 *   offline next time. The Whisper model is cached by transformers.js itself.
 * - Everything else (the browser's speech service, a local Ollama) is left alone.
 *
 * Offline, the built-in speech recognition of Chrome and Edge needs the internet; the app
 * switches to the offline Whisper engine by itself once its model has been downloaded.
 */
'use strict';
const VERSION = 'aii-2026-10-19';
const SHELL_CACHE = VERSION + '-shell';
const LIB_CACHE = 'aii-libs-v1'; // versioned URLs: kept across app updates

const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/styles.css',
  'js/analyzer.js',
  'js/app.js',
  'js/audio.js',
  'js/backup.js',
  'js/callContent.js',
  'js/callsim.js',
  'js/coach.js',
  'js/demo.js',
  'js/engine.js',
  'js/explain.js',
  'js/jobFit.js',
  'js/lexicons.js',
  'js/llm.js',
  'js/proctor.js',
  'js/progress.js',
  'js/questionBank.js',
  'js/recorder.js',
  'js/report.js',
  'js/scoring.js',
  'js/speech.js',
  'js/techBank.js',
  'js/textUtils.js',
  'js/visuals.js',
  'js/voice.js',
  'js/whisper.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png',
  'icons/apple-touch-icon.png',
];

// Hosts whose files never change at a given URL (versions are in the path).
const LIB_HOSTS = ['cdn.jsdelivr.net', 'storage.googleapis.com', 'fonts.gstatic.com'];
const FONT_CSS = 'fonts.googleapis.com';

if (typeof module === 'object' && module.exports) {
  module.exports = { SHELL, LIB_HOSTS, VERSION };
} else {
  self.addEventListener('install', (event) => {
    event.waitUntil(
      caches.open(SHELL_CACHE)
        .then((cache) => Promise.all(SHELL.map((url) => cache.add(new Request(url, { cache: 'reload' })).catch(() => {}))))
        .then(() => self.skipWaiting())
    );
  });

  self.addEventListener('activate', (event) => {
    event.waitUntil(
      caches.keys()
        .then((keys) => Promise.all(keys.filter((k) => k.endsWith('-shell') && k !== SHELL_CACHE).map((k) => caches.delete(k))))
        .then(() => self.clients.claim())
    );
  });

  const put = (cacheName, req, res) => {
    if (res && res.ok && res.type !== 'opaque') {
      const copy = res.clone();
      caches.open(cacheName).then((c) => c.put(req, copy)).catch(() => {});
    }
    return res;
  };

  async function networkFirst(req) {
    try {
      return put(SHELL_CACHE, req, await fetch(req));
    } catch (err) {
      const hit = await caches.match(req, { ignoreSearch: req.mode === 'navigate' });
      if (hit) return hit;
      if (req.mode === 'navigate') {
        const home = (await caches.match('index.html')) || (await caches.match('./'));
        if (home) return home;
      }
      throw err;
    }
  }

  async function cacheFirst(req) {
    const hit = await caches.match(req);
    if (hit) return hit;
    return put(LIB_CACHE, req, await fetch(req));
  }

  async function staleWhileRevalidate(req) {
    const hit = await caches.match(req);
    const fresh = fetch(req).then((res) => put(LIB_CACHE, req, res)).catch(() => hit);
    return hit || fresh;
  }

  self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET' || req.headers.has('range')) return; // recordings and streams pass straight through
    const url = new URL(req.url);
    if (url.origin === self.location.origin) {
      if (url.pathname.endsWith('/sw.js')) return;
      event.respondWith(networkFirst(req));
    } else if (LIB_HOSTS.includes(url.hostname)) {
      event.respondWith(cacheFirst(req));
    } else if (url.hostname === FONT_CSS) {
      event.respondWith(staleWhileRevalidate(req));
    }
  });
}
