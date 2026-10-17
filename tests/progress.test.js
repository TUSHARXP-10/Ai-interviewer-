'use strict';
// Progress across saved interviews.
const test = require('node:test');
const assert = require('node:assert/strict');
const Progress = require('../js/progress.js');

const at = (daysAgo, hour) => {
  const d = new Date(2026, 9, 18, hour || 10);
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString();
};
const NOW = new Date(2026, 9, 18, 21).getTime();

test('nothing saved, nothing to show', () => {
  assert.equal(Progress.summarize([]), null);
});

test('scores, skills and the weakest skill, within one track', () => {
  const p = Progress.summarize([
    { createdAt: at(4), overall: 48, track: 'bpo', dims: { communication: 60, thought: 40 } },
    { createdAt: at(3), overall: 80, track: 'tech', dims: { technical: 80 } },
    { createdAt: at(1), overall: 57, track: 'bpo', dims: { communication: 66, thought: 52 } },
    { createdAt: at(0), overall: 63, track: 'bpo', dims: { communication: 71, thought: 50 } },
  ], { labels: { thought: 'Thought process' }, now: NOW });
  assert.equal(p.track, 'bpo', 'the latest interview decides the track');
  assert.equal(p.count, 3, 'engineering interviews are not mixed in');
  assert.equal(p.first, 48);
  assert.equal(p.latest, 63);
  assert.equal(p.change, 15);
  assert.equal(p.best, 63);
  assert.deepEqual(p.trend.map((t) => t.overall), [48, 57, 63]);
  const thought = p.skills.find((s) => s.key === 'thought');
  assert.deepEqual([thought.first, thought.latest, thought.change, thought.label], [40, 50, 10, 'Thought process']);
  assert.equal(p.weakest.key, 'thought');
});

test('the streak counts consecutive practice days, drills included', () => {
  assert.equal(Progress.streak([at(0), at(1), at(2), at(4)], NOW), 3);
  assert.equal(Progress.streak([at(1), at(2)], NOW), 2, 'today has not started yet');
  assert.equal(Progress.streak([at(3)], NOW), 0);
  const p = Progress.summarize([{ createdAt: at(2), overall: 50, dims: {} }], { drillDates: [at(1), at(0, 8), at(0, 9)], now: NOW });
  assert.equal(p.streak, 3);
  assert.equal(p.drills, 3);
  assert.equal(p.days, 3);
});

test('the sparkline draws every interview and the hire line', () => {
  const svg = Progress.sparkline([{ overall: 40 }, { overall: 70 }, { overall: 85 }]);
  assert.match(svg, /<polyline class="spark-line" points="[\d.]+,[\d.]+ [\d.]+,[\d.]+ [\d.]+,[\d.]+"/);
  assert.match(svg, /class="spark-bar"/);
  assert.match(Progress.sparkline([{ overall: 50 }]), /<circle/);
});
