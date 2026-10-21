/*
 * Vercel serverless function: the shared results board (see lib/results.js).
 * Needs a connected Upstash Redis database (Vercel → Storage) and an ADMIN_KEY passcode.
 */
'use strict';
const { handle, storeFromEnv } = require('../lib/results.js');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || (req.socket && req.socket.remoteAddress) || '';
    let body;
    try {
      body = req.body; // Vercel parses JSON on first read, and throws if it is not JSON
    } catch (e) {
      body = 'not json';
    }
    const out = await handle({ method: req.method, query: req.query || {}, headers: req.headers || {}, body, ip }, storeFromEnv(process.env), process.env);
    res.status(out.status).json(out.body);
  } catch (err) {
    res.status(500).json({ error: 'server', message: 'The results board could not be reached: ' + ((err && err.message) || 'error') });
  }
};
