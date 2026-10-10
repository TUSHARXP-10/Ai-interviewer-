#!/usr/bin/env node
/*
 * Run a complete interview with a scripted candidate and print the scoresheet.
 *
 *   node tools/simulate.js                 # strong candidate, standard interview
 *   node tools/simulate.js weak --full     # weak candidate, full interview
 *   node tools/simulate.js average --role sales --text
 *
 * Handy for tuning the question bank and lexicons without a browser.
 */
'use strict';
const path = require('path');
const Engine = require('../js/engine.js');
const Scoring = require('../js/scoring.js');
const Questions = require('../js/questionBank.js');
const candidates = require(path.join(__dirname, '..', 'tests', 'fixtures', 'candidates.js'));

function wordsIn(text) {
  return (String(text).match(/[A-Za-z0-9']+/g) || []).length;
}

function runInterview(profileName, opts) {
  const o = Object.assign({ length: 'standard', role: 'voice', experience: 'fresher', mode: 'voice', seed: 42, name: 'Test Candidate' }, opts);
  const profile = candidates[profileName];
  if (!profile) throw new Error('Unknown profile: ' + profileName);
  const session = Engine.createSession(Object.assign({}, o));
  const checklist = (Questions.ROLES[o.role] || Questions.ROLES.general).checklist;
  const transcript = [];
  let clock = 0;
  const startedAt = 1_700_000_000_000;

  const answerFor = (step) => {
    if (step.kind === 'roleplay') return (profile.roleplay[checklist] || [])[step.turn] || '';
    if (step.kind === 'followup') return profile.followUps[step.questionId] || profile.followUps.default || 'That is all I can add.';
    return profile.answers[step.questionId] || '';
  };

  let step = session.current();
  while (step) {
    const text = answerFor(step);
    const words = wordsIn(text);
    const speakingMs = o.mode === 'voice' ? (words / profile.voice.wpm) * 60000 : 0;
    const answer = {
      text,
      mode: o.mode,
      timing: o.mode === 'voice'
        ? { latencyMs: profile.voice.latencyMs, speakingMs, totalMs: speakingMs + profile.voice.latencyMs }
        : { latencyMs: null, speakingMs: 0, totalMs: 20000 },
      audio: o.mode === 'voice' ? Object.assign({}, profile.voice.audio) : null,
      events: { skipped: !text },
    };
    clock += (answer.timing.totalMs || 20000) + 8000;
    transcript.push({ q: step.prompt, a: text, kind: step.kind });
    const res = session.submit(answer);
    step = res.done ? null : res.step;
  }

  const sheet = Scoring.buildScoresheet({
    candidate: { name: o.name, role: o.role, experience: o.experience },
    config: { length: o.length, mode: o.mode },
    items: session.results(),
    startedAt,
    endedAt: startedAt + clock,
    integrity: { tabSwitches: 0, pastes: 0, repeats: 0 },
  });
  return { sheet, transcript, session };
}

function printSheet(sheet, transcript) {
  const bar = (v) => (v == null ? '  n/a' : String(v).padStart(5) + ' ' + '█'.repeat(Math.round(v / 5)));
  console.log('\n' + '='.repeat(72));
  console.log(sheet.candidate.name + ' — ' + sheet.role.label + ' — ' + sheet.plan.label);
  console.log('Overall: ' + sheet.overall + '/100  →  ' + sheet.verdict.label + (sheet.englishLevel ? '   English ≈ ' + sheet.englishLevel.code : ''));
  console.log('-'.repeat(72));
  for (const d of sheet.dimensions) console.log(d.label.padEnd(32) + bar(d.score) + '  ' + d.band);
  console.log('-'.repeat(72));
  console.log('Role fit: ' + sheet.roleFit.map((r) => r.label.split(' (')[0] + ' ' + r.fit).join(' | '));
  console.log('\nStrengths:');
  sheet.strengths.forEach((s) => console.log('  + ' + s));
  console.log('Improvements:');
  sheet.improvements.forEach((s) => console.log('  - ' + s));
  if (sheet.redFlags.length) {
    console.log('Red flags:');
    sheet.redFlags.forEach((f) => console.log('  ! [' + f.severity + '] ' + f.label + ' — "' + f.evidence + '"'));
  }
  if (sheet.grammar.length) {
    console.log('Grammar:');
    sheet.grammar.forEach((g) => console.log('  ~ "' + g.evidence + '" → ' + g.fix));
  }
  console.log('\nSummary: ' + sheet.summary);
  if (transcript && process.argv.includes('--transcript')) {
    console.log('\nTranscript:');
    transcript.forEach((t) => console.log('  [' + t.kind + '] Q: ' + t.q + '\n      A: ' + t.a));
  }
  console.log('\nPer question:');
  for (const q of sheet.questions) {
    const s = q.scores;
    console.log('  ' + q.id.padEnd(22) + ' q=' + String(q.quality).padStart(3) + '  ' + Object.entries(s).map(([k, v]) => k.slice(0, 4) + ':' + v).join(' ') + (q.followUps.length ? '  (+' + q.followUps.length + ' follow-up)' : ''));
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const profile = args.find((a) => !a.startsWith('--') && candidates[a]) || 'strong';
  const opt = (name) => {
    const i = args.indexOf('--' + name);
    return i !== -1 ? args[i + 1] : undefined;
  };
  const length = args.includes('--quick') ? 'quick' : args.includes('--full') ? 'full' : 'standard';
  const { sheet, transcript } = runInterview(profile, {
    length,
    role: opt('role') || 'voice',
    experience: args.includes('--experienced') ? 'experienced' : 'fresher',
    mode: args.includes('--text') ? 'text' : 'voice',
    seed: Number(opt('seed') || 42),
    name: profile[0].toUpperCase() + profile.slice(1) + ' Candidate',
  });
  printSheet(sheet, transcript);
}

module.exports = { runInterview, printSheet };
