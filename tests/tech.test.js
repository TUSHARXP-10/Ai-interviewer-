'use strict';
// The engineering track: company-style plans, two rounds, technical scoring.
const test = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../js/engine.js');
const Analyzer = require('../js/analyzer.js');
const Q = require('../js/questionBank.js');
const { runScripted, PROFILES } = require('../js/demo.js');

const TECH_ROLES = Object.keys(Q.ROLES).filter((r) => Q.trackOf(r) === 'tech');
const BPO_ROLES = Object.keys(Q.ROLES).filter((r) => Q.trackOf(r) === 'bpo');
const COMPANIES = Object.keys(Q.COMPANIES);
const LENGTHS = Object.keys(Q.TECH_PLANS);

function seeded(seed) {
  let x = seed;
  return () => {
    x = (x * 16807) % 2147483647;
    return (x - 1) / 2147483646;
  };
}

test('the engineering track has its roles, companies and plans', () => {
  assert.ok(TECH_ROLES.length >= 7, 'full-stack, frontend, Java, Python, AI/ML, data, DevOps');
  for (const r of ['fullstack', 'backend', 'python', 'aiml']) assert.equal(Q.trackOf(r), 'tech', r);
  for (const r of BPO_ROLES) assert.equal(Q.trackOf(r), 'bpo', r);
  for (const k of ['google', 'microsoft', 'amazon', 'uber', 'techmahindra', 'tcs', 'startup_early', 'generic']) {
    const c = Q.COMPANIES[k];
    assert.ok(c && c.name && c.from && c.style && Q.KINDS[c.kind], k);
  }
  assert.deepEqual(LENGTHS.sort(), ['full', 'quick', 'standard']);
});

test('every engineering plan has two rounds of eligible, distinct questions', () => {
  for (const company of COMPANIES) {
    const kind = Q.COMPANIES[company].kind;
    for (const role of TECH_ROLES) {
      for (const experience of ['fresher', 'experienced']) {
        for (const length of LENGTHS) {
          for (const seed of [1, 7]) {
            const tag = [company, role, experience, length, seed].join('/');
            const plan = Q.buildPlan({ length, role, experience, company, random: seeded(seed) });
            assert.ok(plan.length >= 6, tag + ': at least 6 questions');
            assert.equal(new Set(plan.map((q) => q.id)).size, plan.length, tag + ': no duplicates');
            // Round 1 first, then round 2, ending with the candidate's questions.
            const rounds = plan.map((q) => q.round);
            assert.equal(rounds[0], 1, tag);
            assert.deepEqual(rounds.slice().sort(), rounds, tag + ': rounds in order');
            assert.ok(rounds.includes(2), tag + ': has a technical round');
            assert.equal(plan[plan.length - 1].id, 'questions_for_us', tag);
            for (const q of plan) {
              assert.ok(Q.eligible(q, role, experience, company), tag + ': ' + q.id + ' eligible');
              assert.ok(!/\{(company|role)\}/.test(q.text), tag + ': ' + q.id + ' placeholders filled');
              if (q.round === 2 && q.slot !== 'closing') assert.equal(q.track, 'tech', tag + ': ' + q.id);
            }
            const slots = plan.map((q) => q.slot);
            if (kind === 'services' && length !== 'quick') assert.ok(slots.includes('tflex'), tag + ': services ask about relocation');
            if (kind === 'services') assert.ok(slots.includes('tcs'), tag + ': services ask CS fundamentals');
            if (kind === 'bigtech' && length !== 'quick' && role !== 'data') {
              assert.ok(plan.some((q) => q.slot === 'tproblem'), tag + ': big tech asks problem solving');
            }
            if (experience === 'fresher') assert.ok(!slots.includes('tdesign'), tag + ': no system design for freshers');
          }
        }
      }
    }
  }
});

test('company-specific questions only go to that company', () => {
  const amazon = Q.buildPlan({ length: 'quick', role: 'backend', experience: 'experienced', company: 'amazon', random: seeded(3) });
  const values = amazon.find((q) => q.slot === 'tvalues');
  assert.ok(values && (!values.companies || values.companies.includes('amazon')), 'Amazon gets an Amazon-style values question');
  const lp = Q.QUESTIONS.find((q) => q.id === 'tech_lp_ownership');
  assert.ok(!Q.eligible(lp, 'backend', 'experienced', 'google'));
  assert.ok(Q.eligible(lp, 'backend', 'experienced', 'amazon'));
  const why = Q.buildPlan({ length: 'full', role: 'python', experience: 'fresher', company: 'uber', random: seeded(2) }).find((q) => q.slot === 'twhy');
  assert.ok(why && /Uber/.test(why.text) && /Python/.test(why.text), 'the why question names the company and the role');
});

test('BPO plans and engineering plans never mix', () => {
  for (const role of BPO_ROLES) {
    const plan = Q.buildPlan({ length: 'standard', role, experience: 'fresher', random: seeded(5) });
    assert.ok(plan.every((q) => q.track !== 'tech'), role);
  }
  for (const role of TECH_ROLES) {
    const plan = Q.buildPlan({ length: 'standard', role, experience: 'fresher', company: 'generic', random: seeded(5) });
    assert.ok(plan.every((q) => q.track === 'tech' || q.slot === 'closing'), role);
  }
});

test('every engineering question has a rubric and a tip', () => {
  const tech = Q.QUESTIONS.filter((q) => q.track === 'tech');
  assert.ok(tech.length >= 100, tech.length + ' questions');
  for (const q of tech) {
    assert.ok(q.text && q.slot && q.type && q.tip, q.id);
    assert.ok((q.concepts && q.concepts.length >= 3) || q.stance, q.id + ': concepts or a stance');
    assert.ok(Q.TYPE_DIMS[q.type], q.id + ': scored dimensions for ' + q.type);
    for (const c of q.concepts || []) assert.ok(c.terms.length >= 2, q.id + '/' + c.id);
  }
});

test('the interviewer calls from the company and announces each round once', () => {
  const s = Engine.createSession({ role: 'aiml', experience: 'experienced', company: 'amazon', length: 'standard', mode: 'voice', name: 'Ravi', seed: 3 });
  assert.equal(s.company.name, 'Amazon');
  assert.equal(s.rounds.length, 2);
  const brief = s.briefing({ pauseEnds: true });
  assert.match(brief, /AI and ML Engineer role at Amazon|role at Amazon/);
  assert.match(brief, /two rounds/);
  const announced = [];
  let step = s.current();
  while (step) {
    for (const sp of step.speak || []) if (/^Round /.test(sp.text)) announced.push(sp.text);
    const res = s.submit({ text: 'I would use a hash map because lookups are constant time, and test the edge cases.', mode: 'voice', events: {} });
    step = res.done ? null : res.step;
  }
  assert.deepEqual(announced, ['Round one: communication and thought process.', 'Round two: technical interview.']);
});

test('technical answers are scored on correctness and depth, not confidence', () => {
  const q = Q.byId.dsa_two_sum;
  const score = (text) => Analyzer.analyzeAnswer(q, { text, mode: 'text', events: {} }).scores.technical;
  const strong = score(PROFILES.engineer.answers.dsa_two_sum);
  const brute = score('I will use two loops and check every pair and return the pair.');
  const dontKnow = score("I'm not sure, I don't know this one.");
  assert.ok(strong >= 85, 'strong ' + strong);
  assert.ok(brute < 50, 'brute force only ' + brute);
  assert.ok(dontKnow <= 20, "don't know " + dontKnow);
  // Saying the right words in one line is not enough.
  const stuffed = score('Hash map, O of n.');
  assert.ok(stuffed < strong - 25, 'keyword list ' + stuffed);
});

test('an engineering scoresheet scores technical skill and no customer handling', () => {
  const { sheet } = runScripted('engineer', { role: 'fullstack', experience: 'experienced', company: 'google', length: 'standard', seed: 11 });
  const keys = sheet.dimensions.map((d) => d.key);
  assert.ok(keys.includes('technical'));
  assert.ok(!keys.includes('customer'));
  assert.equal(sheet.track, 'tech');
  assert.equal(sheet.company.name, 'Google');
  assert.equal(sheet.rounds.length, 2);
  assert.ok(sheet.rounds.every((r) => r.score != null && r.qids && r.qids.length), 'round cards have scores');
  assert.ok(sheet.overall >= 75, 'a well-prepared engineer is recommended: ' + sheet.overall);
  assert.ok(sheet.roleFit.every((r) => Q.trackOf(r.key || r.role) === 'tech'), 'role fit stays in engineering');

  const bpo = runScripted('strong', { role: 'voice', length: 'standard', seed: 7 }).sheet;
  assert.ok(!bpo.dimensions.some((d) => d.key === 'technical'));
  assert.ok(bpo.roleFit.every((r) => Q.trackOf(r.key || r.role) === 'bpo'), 'role fit stays in BPO');
});

test('a scripted engineer can sit every role at every kind of company', () => {
  for (const role of TECH_ROLES) {
    for (const company of ['google', 'tcs', 'startup_growth', 'flipkart']) {
      const { sheet, transcript } = runScripted('engineer', { role, experience: 'experienced', company, length: 'quick', seed: 4 });
      assert.ok(transcript.every((t) => t.a), role + '@' + company + ': every question answered');
      assert.ok(sheet.overall > 0 && sheet.dimensions.some((d) => d.key === 'technical'), role + '@' + company);
    }
  }
});
