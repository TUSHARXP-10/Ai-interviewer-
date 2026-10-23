/*
 * backup.js — move saved interviews between browsers and devices, and export them for a
 * spreadsheet. Pure functions: app.js reads and writes the storage.
 *
 * - build():   history + scoresheets + practice drills -> one backup object (JSON file)
 * - parse():   a backup file, or a single scoresheet downloaded with "Download JSON"
 * - merge():   add a backup to what this browser already has, keeping the newest MAX
 * - toCsv():   one row per interview: scores, verdict, integrity (opens in Excel/Sheets)
 *
 * Recordings and proctoring photos stay on the device they were made on: they are large,
 * and they are the most personal part. A backup holds the scoresheets and drills only.
 */
(function (root) {
  'use strict';
  const isNode = typeof module === 'object' && module.exports;

  const APP = 'tushar-ai-interviewer';
  const VERSION = 1;
  const MAX = 12; // the same limit as the history in app.js

  /** The short history entry the home page lists, built from a full scoresheet. */
  function entryOf(sheet) {
    // Only plain skill names and real numbers: a restored file (or a received link) is untrusted.
    const dims = {};
    for (const d of Array.isArray(sheet.dimensions) ? sheet.dimensions : []) {
      if (!d || typeof d.key !== 'string' || !/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(d.key) || d.key in Object.prototype) continue;
      dims[d.key] = typeof d.score === 'number' && Number.isFinite(d.score) ? d.score : null;
    }
    return {
      id: sheet.id,
      name: (sheet.candidate && sheet.candidate.name) || 'Candidate',
      role: (sheet.role && sheet.role.label) || '',
      overall: sheet.overall,
      verdict: (sheet.verdict && sheet.verdict.label) || '',
      track: sheet.track || 'bpo',
      dims,
      company: sheet.company ? sheet.company.display || sheet.company.name || null : null,
      integrity: sheet.proctoring && sheet.proctoring.rating ? sheet.proctoring.rating.label : null,
      createdAt: sheet.createdAt,
    };
  }

  function isSheet(x) {
    return !!(x && typeof x === 'object' && typeof x.id === 'string' && x.id &&
      typeof x.overall === 'number' && typeof x.createdAt === 'string' && !isNaN(Date.parse(x.createdAt)) &&
      x.candidate && typeof x.candidate === 'object' && x.verdict && typeof x.verdict === 'object');
  }

  /** data: { history: [entry], sheets: { id: sheet }, drills: { sheetId: { qid: [attempt] } } } */
  function build(data, now) {
    const sheets = {};
    const history = [];
    for (const h of (data && data.history) || []) {
      const s = data.sheets && data.sheets[h.id];
      if (!isSheet(s)) continue; // an entry whose scoresheet is gone can't be restored
      sheets[h.id] = s;
      history.push(h);
    }
    const drills = {};
    const all = (data && data.drills) || {};
    for (const id of Object.keys(all)) if (sheets[id]) drills[id] = all[id];
    return {
      app: APP,
      kind: 'backup',
      version: VERSION,
      exportedAt: new Date(now || Date.now()).toISOString(),
      count: history.length,
      history,
      sheets,
      drills,
    };
  }

  /**
   * text: the file's contents -> { kind: 'backup' | 'sheet', history, sheets, drills }.
   * Throws an Error with a message fit to show the user.
   */
  function parse(text) {
    let data;
    try {
      data = JSON.parse(String(text == null ? '' : text).replace(/^﻿/, ''));
    } catch (e) {
      throw new Error('This file is not a backup: it is not valid JSON.');
    }
    if (isSheet(data)) {
      return { kind: 'sheet', history: [entryOf(data)], sheets: { [data.id]: data }, drills: {} };
    }
    if (!data || typeof data !== 'object' || data.app !== APP || data.kind !== 'backup') {
      throw new Error('This file is not a Tushar AI backup or scoresheet.');
    }
    if (typeof data.version !== 'number' || data.version > VERSION) {
      throw new Error('This backup was made by a newer version of the app. Refresh the page and try again.');
    }
    const sheets = {};
    for (const id of Object.keys(data.sheets || {})) {
      const s = data.sheets[id];
      if (isSheet(s) && s.id === id) sheets[id] = s;
    }
    // Rebuild each entry from its scoresheet, so a hand-edited list can't disagree with it.
    const history = Object.keys(sheets).map((id) => entryOf(sheets[id]));
    if (!history.length) throw new Error('This backup has no interviews in it.');
    const drills = {};
    const d = data.drills && typeof data.drills === 'object' ? data.drills : {};
    for (const id of Object.keys(d)) {
      if (!sheets[id] || !d[id] || typeof d[id] !== 'object') continue;
      const per = {};
      for (const qid of Object.keys(d[id])) if (Array.isArray(d[id][qid])) per[qid] = d[id][qid].filter((a) => a && typeof a === 'object');
      drills[id] = per;
    }
    return { kind: 'backup', history, sheets, drills };
  }

  const newestFirst = (a, b) => new Date(b.createdAt) - new Date(a.createdAt);

  /**
   * current: { history: [entry], drills } (what this browser has)
   * incoming: the result of parse()
   * -> { history, drills, write: { id: sheet }, remove: [id], added, skipped, dropped }
   *    history: the new list to store (newest first, at most max)
   *    write: the scoresheets to store; remove: scoresheets of this browser that no longer fit
   */
  function merge(current, incoming, max) {
    const limit = max || MAX;
    const have = new Map(((current && current.history) || []).map((h) => [h.id, h]));
    let skipped = 0;
    const fresh = [];
    for (const h of incoming.history) {
      if (have.has(h.id)) skipped++;
      else fresh.push(h);
    }
    const all = Array.from(have.values()).concat(fresh).sort(newestFirst);
    const kept = all.slice(0, limit);
    const keptIds = new Set(kept.map((h) => h.id));
    const write = {};
    let added = 0;
    for (const h of fresh) {
      if (!keptIds.has(h.id)) continue;
      write[h.id] = incoming.sheets[h.id];
      added++;
    }
    const remove = Array.from(have.keys()).filter((id) => !keptIds.has(id));
    const dropped = all.length - kept.length;

    // Practice drills: add attempts this browser doesn't have yet (matched by time).
    const drills = JSON.parse(JSON.stringify((current && current.drills) || {}));
    for (const id of Object.keys(incoming.drills || {})) {
      if (!keptIds.has(id)) continue;
      const mine = drills[id] || (drills[id] = {});
      for (const qid of Object.keys(incoming.drills[id])) {
        const list = mine[qid] || (mine[qid] = []);
        const seen = new Set(list.map((a) => a.at));
        for (const a of incoming.drills[id][qid]) if (!seen.has(a.at)) list.push(a);
        list.sort((a, b) => new Date(a.at || 0) - new Date(b.at || 0));
        mine[qid] = list.slice(-5); // app.js keeps the last five attempts per question
      }
    }
    for (const id of remove) delete drills[id];
    return { history: kept, drills, write, remove, added, skipped, dropped };
  }

  // ------------------------------------------------------------ CSV
  function cell(v) {
    if (v == null) return '';
    let s = String(v);
    // A name like "=HYPERLINK(...)" must stay text in a spreadsheet, never become a formula.
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  const TRACKS = { bpo: 'Customer service', tech: 'Engineering' };

  /**
   * entries: history entries; sheets: { id: sheet } (missing ones use the entry alone).
   * -> CSV text, one row per interview, newest first, with a byte-order mark so Excel
   *    reads the names correctly.
   */
  function toCsv(entries, sheets) {
    const rows = (entries || []).slice().sort(newestFirst).map((h) => ({ h, s: (sheets && sheets[h.id]) || null }));
    // Skill columns: every skill that appears, in the order the scoresheets list them.
    const dimCols = [];
    const seen = new Set();
    for (const { h, s } of rows) {
      const list = s && s.dimensions ? s.dimensions.map((d) => ({ key: d.key, label: d.short || d.label || d.key }))
        : Object.keys(h.dims || {}).map((k) => ({ key: k, label: k }));
      for (const d of list) {
        if (seen.has(d.key)) continue;
        seen.add(d.key);
        dimCols.push(d);
      }
    }
    const head = ['Date', 'Candidate', 'Track', 'Role', 'Company style', 'Experience', 'Interview', 'Overall', 'Verdict',
      'Integrity', 'English level', 'Minutes', 'Answered', 'Skipped', 'Red flags'].concat(dimCols.map((d) => d.label));
    const lines = [head.map(cell).join(',')];
    for (const { h, s } of rows) {
      const dims = Object.create(null); // a skill named "constructor" must not read Object's own
      if (s && s.dimensions) for (const d of s.dimensions) dims[d.key] = d.score;
      else Object.assign(dims, h.dims || {});
      const integ = (s && s.integrity) || {};
      const when = new Date(h.createdAt);
      const date = isNaN(when) ? '' : when.toISOString().slice(0, 16).replace('T', ' ');
      const row = [
        date,
        h.name,
        TRACKS[h.track || 'bpo'] || h.track,
        h.role,
        h.company || '',
        s && s.candidate ? s.candidate.experience || '' : '',
        s && s.plan ? s.plan.label || '' : '',
        h.overall,
        h.verdict,
        h.integrity || (s && s.proctoring ? '' : 'Not proctored'),
        s && s.englishLevel ? s.englishLevel.code || '' : '',
        s && s.durationSec ? Math.round(s.durationSec / 6) / 10 : '',
        integ.answered != null ? integ.answered : '',
        integ.skipped != null ? integ.skipped : '',
        s && Array.isArray(s.redFlags) ? s.redFlags.length : '',
      ].concat(dimCols.map((d) => (dims[d.key] != null ? dims[d.key] : '')));
      lines.push(row.map(cell).join(','));
    }
    return '﻿' + lines.join('\r\n') + '\r\n';
  }

  /** A safe file name part: "Ravi Kumar" -> "ravi-kumar". */
  function slug(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'candidate';
  }

  const api = { APP, VERSION, MAX, entryOf, isSheet, build, parse, merge, toCsv, slug };
  if (isNode) module.exports = api;
  else (root.AII = root.AII || {}).Backup = api;
})(typeof window !== 'undefined' ? window : globalThis);
