'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const https = require('https');
const { generate } = require('../tools/selfsigned.js');

test('the Wi-Fi certificate is a valid self-signed server certificate for every address', () => {
  const r = generate({ ips: ['192.168.1.23', '10.0.0.7'], days: 365 });
  const x = new crypto.X509Certificate(r.cert);
  assert.equal(x.verify(x.publicKey), true, 'self-signature verifies');
  assert.equal(x.ca, false);
  assert.equal(x.checkIP('192.168.1.23'), '192.168.1.23');
  assert.equal(x.checkIP('10.0.0.7'), '10.0.0.7');
  assert.equal(x.checkHost('localhost'), 'localhost');
  assert.deepEqual(x.keyUsage, ['1.3.6.1.5.5.7.3.1'], 'serverAuth, which iOS requires');
  const days = (new Date(x.validTo) - new Date(x.validFrom)) / 86400000;
  assert.ok(days <= 825, 'phones reject longer validity: ' + days);
  assert.ok(new Date(x.validFrom) < new Date(), 'already valid');
});

test('an HTTPS server starts with it and answers', async () => {
  const r = generate({ ips: [] });
  const server = https.createServer({ key: r.key, cert: r.cert }, (req, res) => res.end('ok'));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const body = await new Promise((resolve, reject) => {
      https.get({ host: '127.0.0.1', port: server.address().port, path: '/', ca: r.cert, servername: 'localhost' }, (res) => {
        let d = '';
        res.on('data', (c) => { d += c; });
        res.on('end', () => resolve(d));
      }).on('error', reject);
    });
    assert.equal(body, 'ok', 'the certificate is trusted when pinned, so the chain and names are well-formed');
  } finally {
    server.close();
  }
});
