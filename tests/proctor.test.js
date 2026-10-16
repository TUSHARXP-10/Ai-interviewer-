'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/proctor.js');

// A simple 3D face (cm; x across, y up, z towards the camera), turned and tilted, then projected
// to normalised image coordinates the way the face landmarker reports them.
const FACE = { 1: [0, 0, 10.5], 152: [0, -8, 7.5], 234: [-7, 0.5, 3], 454: [7, 0.5, 3], 33: [-4.5, 3.5, 7.5], 263: [4.5, 3.5, 7.5], 10: [0, 9, 7] };
function landmarks(yawDeg, pitchDeg, opts) {
  const o = Object.assign({ cx: 0.5, cy: 0.5, scale: 0.012 }, opts);
  const yaw = (yawDeg * Math.PI) / 180;
  const pitch = (pitchDeg * Math.PI) / 180; // positive: head tipped down
  const project = ([x, y, z]) => {
    const y1 = y * Math.cos(pitch) - z * Math.sin(pitch);
    const z1 = y * Math.sin(pitch) + z * Math.cos(pitch);
    const x2 = x * Math.cos(yaw) + z1 * Math.sin(yaw);
    return { x: o.cx + x2 * o.scale, y: o.cy - y1 * o.scale, z: 0 };
  };
  const nose = project(FACE[1]);
  const lm = Array.from({ length: 478 }, () => ({ x: nose.x, y: nose.y, z: 0 }));
  for (const k of Object.keys(FACE)) lm[k] = project(FACE[k]);
  return lm;
}

test('head turn and tilt grow with the angle, so small movements stay "on screen"', () => {
  const at = (yaw, pitch) => P.headPose(landmarks(yaw, pitch));
  const straight = at(0, 0);
  assert.ok(Math.abs(straight.yaw) < 0.01);
  assert.ok(Math.abs(at(12, 0).yaw) < P.AWAY.yaw, 'a 12° turn is not looking away');
  assert.ok(Math.abs(at(25, 0).yaw) > P.AWAY.yaw, 'a 25° turn is');
  assert.ok(at(10, 0).yaw * at(-10, 0).yaw < 0, 'left and right have opposite signs');
  assert.ok(at(0, 10).pitch - straight.pitch < P.AWAY.pitch, 'a 10° nod is not looking down');
  assert.ok(at(0, 22).pitch - straight.pitch > P.AWAY.pitch, 'a 22° tilt down is');
  assert.ok(at(0, -20).pitch < straight.pitch, 'looking up moves the other way');
});

test('a small face behind the candidate (a poster) is not a second person; a nearby one is', () => {
  const me = landmarks(0, 0);
  const poster = landmarks(0, 0, { cx: 0.85, cy: 0.2, scale: 0.004 });
  const friend = landmarks(0, 0, { cx: 0.8, cy: 0.55, scale: 0.01 });
  assert.equal(P.observe({ faceLandmarks: [poster, me] }).faces, 1);
  assert.equal(P.observe({ faceLandmarks: [poster, me] }).main, 1, 'the candidate is the largest face');
  assert.equal(P.observe({ faceLandmarks: [me, friend] }).faces, 2);
  assert.equal(P.observe({ faceLandmarks: [] }).faces, 0);
});

// ---- the rules over time (frames every 120 ms)
const look = (t, o) => Object.assign({ t, faces: 1, yaw: 0.02, pitch: 0.3, gazeDown: 0.05, gazeSide: 0.05, blink: 0.05, brightness: 0.45, phone: null }, o);
function calibrated() {
  const m = P.createMonitor();
  let r;
  for (let t = 0; t <= 2400; t += 120) r = m.calibrate(look(t));
  assert.equal(r.done, true);
  return m;
}
function play(m, from, to, fn) {
  const events = [];
  let status;
  for (let t = from; t <= to; t += 120) {
    const out = m.update(fn(t));
    status = out.status;
    events.push(...out.events);
  }
  return { events, status };
}
const kinds = (events, severity) => events.filter((e) => e.type === 'incident' && (!severity || e.severity === severity)).map((e) => e.kind);

test('calibration needs the candidate alone and facing the screen for 2 seconds', () => {
  const m = P.createMonitor();
  assert.equal(m.calibrate(look(0, { faces: 2 })).problem, 'extra');
  assert.equal(m.calibrate(look(120, { faces: 0 })).problem, 'noFace');
  assert.equal(m.calibrate(look(240, { brightness: 0.02 })).problem, 'dark');
  assert.equal(m.calibrate(look(360, { yaw: 0.4 })).problem, 'turned');
  let r;
  for (let t = 480; t < 1800; t += 120) r = m.calibrate(look(t));
  assert.equal(r.done, false, 'not after 1.3 s');
  for (let t = 1800; t <= 2700; t += 120) r = m.calibrate(look(t));
  assert.equal(r.done, true);
  assert.equal(m.calibrated, true);
});

test('glances, blinks and a single lost frame never count', () => {
  const m = calibrated();
  // A 1.5 s look down, a blink, then one frame where the face was not found.
  const { events } = play(m, 0, 12000, (t) => {
    if (t >= 1000 && t < 2500) return look(t, { gazeDown: 0.7 });
    if (t >= 5000 && t < 5250) return look(t, { blink: 0.95, gazeDown: 0.6 });
    if (t === 8040) return look(t, { faces: 0 });
    return look(t);
  });
  assert.deepEqual(kinds(events), []);
});

test('looking away is a note after 3 s and a warning after 8 s, even with blinks in between', () => {
  const m = calibrated();
  const short = play(m, 0, 4000, (t) => look(t, { gazeSide: 0.8 }));
  assert.deepEqual(kinds(short.events, 'minor'), ['away']);
  assert.deepEqual(kinds(short.events, 'serious'), []);
  const long = play(m, 4120, 9000, (t) => (t % 2000 < 150 ? look(t, { blink: 0.9 }) : look(t, { gazeSide: 0.8 })));
  assert.deepEqual(kinds(long.events, 'serious'), ['away']);
  assert.equal(long.status.eyes, 'bad');
  // Still away 20 s after the warning: warned again.
  const longer = play(m, 9120, 30000, (t) => look(t, { gazeSide: 0.8 }));
  assert.equal(longer.events.filter((e) => e.repeat).length, 1);
  // Back to normal: the episode ends with its length.
  const back = play(m, 30120, 31500, (t) => look(t));
  const end = back.events.find((e) => e.type === 'resolved');
  assert.ok(end && end.durationMs > 25000);
  assert.equal(back.status.eyes, 'ok');
});

test('turning the head away counts like looking away; tilting down is "down"', () => {
  const m = calibrated();
  const { events } = play(m, 0, 9000, (t) => look(t, { pitch: 0.42 }));
  const serious = events.find((e) => e.severity === 'serious');
  assert.equal(serious.kind, 'away');
  assert.equal(serious.direction, 'down');
});

test('no face for 5 s, a second person for 2 s, and a dark camera are warnings', () => {
  const m1 = calibrated();
  assert.deepEqual(kinds(play(m1, 0, 5500, (t) => look(t, { faces: 0 })).events, 'serious'), ['noFace']);
  const m2 = calibrated();
  assert.deepEqual(kinds(play(m2, 0, 2500, (t) => look(t, { faces: 2 })).events, 'serious'), ['extra']);
  const m3 = calibrated();
  const dark = play(m3, 0, 4500, (t) => look(t, { faces: 0, brightness: 0.02 }));
  assert.deepEqual(kinds(dark.events, 'serious'), ['dark'], 'a covered camera is reported as covered, not as "face missing"');
});

test('a phone needs two sightings out of three before it counts', () => {
  const m = calibrated();
  // The detector runs every 4th frame here; one stray sighting is ignored.
  const once = play(m, 0, 3000, (t) => look(t, { phone: t % 480 === 0 ? (t === 960 ? 0.8 : 0.1) : null }));
  assert.deepEqual(kinds(once.events), []);
  const held = play(m, 3120, 6000, (t) => look(t, { phone: t % 480 === 0 ? 0.8 : null }));
  assert.ok(kinds(held.events, 'serious').includes('phone'));
});

test('repeated short glances (reading notes) are noted once', () => {
  const m = calibrated();
  const { events } = play(m, 0, 30000, (t) => (t % 6000 < 1600 ? look(t, { gazeDown: 0.7 }) : look(t)));
  assert.deepEqual(kinds(events), ['glances']);
});

test('watch statistics: share of time with a face and with the eyes on the screen', () => {
  const m = calibrated();
  play(m, 0, 11880, (t) => (t < 9000 ? look(t) : look(t, { gazeSide: 0.8 })));
  const s = m.stats();
  assert.equal(s.faceVisiblePct, 100);
  assert.ok(s.eyesOnPct >= 70 && s.eyesOnPct <= 80, String(s.eyesOnPct));
  assert.ok(s.awaySec >= 2 && s.awaySec <= 4);
});

test('a pause in the frames (tab hidden) closes what was going on instead of counting the gap', () => {
  const m = calibrated();
  const before = play(m, 0, 2500, (t) => look(t, { gazeSide: 0.8 })); // 2.5 s away: nothing yet
  assert.deepEqual(kinds(before.events), []);
  const after = play(m, 30000, 32000, (t) => look(t, { gazeSide: 0.8 })); // back 27 s later, still away
  assert.deepEqual(kinds(after.events, 'serious'), [], 'the hidden time is not counted as looking away');
});
