/*
 * selfsigned.js — make a self-signed HTTPS certificate with Node's built-in crypto
 * (no openssl, no packages), so a phone on the same Wi-Fi can open the app over
 * https:// — browsers only allow the microphone on https or localhost.
 *
 *   const { generate } = require('./tools/selfsigned');
 *   const { key, cert } = generate({ ips: ['192.168.1.20'], days: 365 });
 *
 * ECDSA P-256, SHA-256, with the extensions phones insist on even after you tap
 * "Proceed": subjectAltName (every IP/host), extendedKeyUsage serverAuth, and a
 * validity under 825 days.
 */
'use strict';
const crypto = require('crypto');

// ------------------------------------------------------------ minimal DER encoder
function len(n) {
  if (n < 0x80) return Buffer.from([n]);
  const bytes = [];
  while (n > 0) {
    bytes.unshift(n & 0xff);
    n >>= 8;
  }
  return Buffer.from([0x80 | bytes.length].concat(bytes));
}
const tlv = (tag, body) => Buffer.concat([Buffer.from([tag]), len(body.length), body]);
const seq = (...items) => tlv(0x30, Buffer.concat(items));
const set = (...items) => tlv(0x31, Buffer.concat(items));
const ctx = (n, body) => tlv(0xa0 + n, body);              // [n] EXPLICIT
const octets = (b) => tlv(0x04, b);
const bitString = (b) => tlv(0x03, Buffer.concat([Buffer.from([0]), b]));
const bool = (v) => tlv(0x01, Buffer.from([v ? 0xff : 0]));
const utf8 = (s) => tlv(0x0c, Buffer.from(s, 'utf8'));

function integer(buf) {
  let b = buf;
  while (b.length > 1 && b[0] === 0 && !(b[1] & 0x80)) b = b.subarray(1);
  if (b[0] & 0x80) b = Buffer.concat([Buffer.from([0]), b]);
  return tlv(0x02, b);
}

function oid(dotted) {
  const p = dotted.split('.').map(Number);
  const out = [40 * p[0] + p[1]];
  for (const v of p.slice(2)) {
    const chunk = [v & 0x7f];
    let x = v >>> 7;
    while (x > 0) {
      chunk.unshift((x & 0x7f) | 0x80);
      x >>>= 7;
    }
    out.push(...chunk);
  }
  return tlv(0x06, Buffer.from(out));
}

function time(d) {
  const pad = (n) => String(n).padStart(2, '0');
  const y = d.getUTCFullYear();
  const s = pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + 'Z';
  // UTCTime until 2049, GeneralizedTime after (RFC 5280).
  return y < 2050 ? tlv(0x17, Buffer.from(String(y).slice(2) + s)) : tlv(0x18, Buffer.from(String(y) + s));
}

function ipBytes(ip) {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return Buffer.from(ip.split('.').map(Number));
  return null; // IPv6 is not needed for a home Wi-Fi URL
}

const OID = {
  ecdsaSha256: '1.2.840.10045.4.3.2',
  commonName: '2.5.4.3',
  organization: '2.5.4.10',
  subjectAltName: '2.5.29.17',
  basicConstraints: '2.5.29.19',
  keyUsage: '2.5.29.15',
  extKeyUsage: '2.5.29.37',
  serverAuth: '1.3.6.1.5.5.7.3.1',
};

function name(cn) {
  return seq(
    set(seq(oid(OID.organization), utf8('AI Interviewer (local)'))),
    set(seq(oid(OID.commonName), utf8(cn))),
  );
}

function extension(id, critical, value) {
  return critical ? seq(oid(id), bool(true), octets(value)) : seq(oid(id), octets(value));
}

/**
 * opts: { ips: string[] (IPv4), hosts: string[] (DNS names), days: number }
 * Returns { key, cert } as PEM strings.
 */
function generate(opts) {
  const o = opts || {};
  const ips = Array.from(new Set(['127.0.0.1'].concat(o.ips || []))).filter(ipBytes);
  const hosts = Array.from(new Set(['localhost'].concat(o.hosts || [])));
  const days = Math.min(o.days || 365, 800);

  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const spki = publicKey.export({ type: 'spki', format: 'der' });

  const san = seq(
    ...hosts.map((h) => tlv(0x82, Buffer.from(h, 'ascii'))),   // dNSName
    ...ips.map((ip) => tlv(0x87, ipBytes(ip))),               // iPAddress
  );
  const notBefore = new Date(Date.now() - 24 * 3600 * 1000);   // tolerate a phone clock that is a bit behind
  const notAfter = new Date(notBefore.getTime() + days * 24 * 3600 * 1000);
  const serial = crypto.randomBytes(16);
  serial[0] &= 0x7f;
  const algorithm = seq(oid(OID.ecdsaSha256));
  const subject = name(ips.find((ip) => ip !== '127.0.0.1') || 'localhost');

  const tbs = seq(
    ctx(0, integer(Buffer.from([2]))),                        // version 3
    integer(serial),
    algorithm,
    subject,                                                  // issuer = subject (self-signed)
    seq(time(notBefore), time(notAfter)),
    subject,
    spki,
    ctx(3, seq(
      extension(OID.basicConstraints, true, seq()),           // not a CA
      extension(OID.keyUsage, true, bitString(Buffer.from([0x80]))), // digitalSignature
      extension(OID.extKeyUsage, false, seq(oid(OID.serverAuth))),
      extension(OID.subjectAltName, false, san),
    )),
  );
  const signature = crypto.sign('sha256', tbs, privateKey);  // DER-encoded ECDSA signature
  const der = seq(tbs, algorithm, bitString(signature));

  const pem = (label, buf) => '-----BEGIN ' + label + '-----\n' + buf.toString('base64').match(/.{1,64}/g).join('\n') + '\n-----END ' + label + '-----\n';
  return {
    key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    cert: pem('CERTIFICATE', der),
    ips,
    hosts,
    notAfter: notAfter.toISOString(),
  };
}

module.exports = { generate };
