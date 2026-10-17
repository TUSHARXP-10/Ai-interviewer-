/*
 * progress.js — progress across saved interviews: the overall score over time, how each
 * skill moved since the first interview, the weakest skill now, and the practice streak.
 * Only interviews of the same track (BPO or engineering) are compared with each other.
 */
(function (root) {
  'use strict';
  const isNode = typeof module === 'object' && module.exports;

  const DAY = 86400000;
  const localDay = (iso) => {
    const d = new Date(iso);
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  };
  const dayIndex = (iso) => {
    const d = new Date(iso);
    return Math.round(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / DAY);
  };

  /** Consecutive days with any practice, ending today (or yesterday: today may not have started). */
  function streak(dates, now) {
    const days = new Set(dates.filter(Boolean).map(dayIndex));
    if (!days.size) return 0;
    let d = dayIndex(new Date(now || Date.now()).toISOString());
    if (!days.has(d)) d -= 1;
    let n = 0;
    while (days.has(d)) {
      n++;
      d--;
    }
    return n;
  }

  /**
   * entries: [{ createdAt, overall, track, dims: { key: score } }] (any order)
   * opts: { labels: { key: label }, drillDates: [iso], now }
   * -> null when there is nothing to show, else
   *    { track, count, trend: [{ at, overall }], first, latest, change, best,
   *      skills: [{ key, label, first, latest, change }], weakest, streak, days, drills }
   */
  function summarize(entries, opts) {
    const o = opts || {};
    const all = (entries || []).filter((e) => e && e.createdAt && e.overall != null)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    if (!all.length) return null;
    const track = all[all.length - 1].track || 'bpo';
    const list = all.filter((e) => (e.track || 'bpo') === track);
    const first = list[0];
    const latest = list[list.length - 1];
    const labels = o.labels || {};
    const keys = Object.keys(latest.dims || {}).filter((k) => latest.dims[k] != null);
    const skills = keys.map((k) => {
      const firstWith = list.find((e) => e.dims && e.dims[k] != null);
      const from = firstWith ? firstWith.dims[k] : latest.dims[k];
      return { key: k, label: labels[k] || k, first: from, latest: latest.dims[k], change: list.length > 1 ? latest.dims[k] - from : 0 };
    });
    const weakest = skills.slice().sort((a, b) => a.latest - b.latest)[0] || null;
    const drillDates = o.drillDates || [];
    const dates = all.map((e) => e.createdAt).concat(drillDates);
    return {
      track,
      count: list.length,
      trend: list.map((e) => ({ at: e.createdAt, overall: e.overall })),
      first: first.overall,
      latest: latest.overall,
      change: latest.overall - first.overall,
      best: Math.max.apply(null, list.map((e) => e.overall)),
      skills,
      weakest,
      streak: streak(dates, o.now),
      days: new Set(dates.map(localDay)).size,
      drills: drillDates.length,
    };
  }

  /** An SVG sparkline of the overall scores (0–100), as a string. */
  function sparkline(trend, w, h) {
    const W = w || 220;
    const H = h || 56;
    if (!trend || !trend.length) return '';
    const pad = 5;
    const n = trend.length;
    const x = (i) => (n === 1 ? W / 2 : pad + (i * (W - 2 * pad)) / (n - 1));
    const y = (v) => pad + (1 - Math.max(0, Math.min(100, v)) / 100) * (H - 2 * pad);
    const pts = trend.map((t, i) => x(i).toFixed(1) + ',' + y(t.overall).toFixed(1)).join(' ');
    const last = trend[n - 1];
    const area = n > 1 ? '<polygon class="spark-area" points="' + x(0).toFixed(1) + ',' + (H - pad) + ' ' + pts + ' ' + x(n - 1).toFixed(1) + ',' + (H - pad) + '"/>' : '';
    return '<svg class="spark" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="Overall score over ' + n + ' interviews">' +
      '<line class="spark-bar" x1="0" x2="' + W + '" y1="' + y(66).toFixed(1) + '" y2="' + y(66).toFixed(1) + '"/>' +
      area + (n > 1 ? '<polyline class="spark-line" points="' + pts + '"/>' : '') +
      '<circle class="spark-dot" cx="' + x(n - 1).toFixed(1) + '" cy="' + y(last.overall).toFixed(1) + '" r="4"/></svg>';
  }

  const api = { summarize, sparkline, streak };
  if (isNode) module.exports = api;
  else (root.AII = root.AII || {}).Progress = api;
})(typeof window !== 'undefined' ? window : globalThis);
