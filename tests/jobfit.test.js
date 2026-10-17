'use strict';
// Tailoring an interview to a pasted job description.
const test = require('node:test');
const assert = require('node:assert/strict');
const JobFit = require('../js/jobFit.js');
const Q = require('../js/questionBank.js');
const Engine = require('../js/engine.js');

const JAVA_JD = 'We are hiring a Backend Engineer (Java, Spring Boot) to build microservices on AWS. You will work with Kafka, PostgreSQL and Redis, write unit tests with JUnit, and run services on Docker and Kubernetes. Experience with system design and high-traffic, low-latency services is a plus.';
const BPO_JD = 'Hiring for International Voice Process (US shift). Excellent communication skills in English, Versant score 58+. Night shifts, rotational offs. Handle inbound calls, meet AHT and CSAT targets. CRM: Salesforce.';

function seeded(seed) {
  let x = seed;
  return () => {
    x = (x * 16807) % 2147483647;
    return (x - 1) / 2147483646;
  };
}

test('it reads what a job asks for, in the order the ad mentions it', () => {
  assert.equal(JobFit.read('   ', 'tech'), null);
  const job = JobFit.read(JAVA_JD, 'tech');
  assert.equal(job.track, 'tech');
  assert.equal(job.skills[0].id, 'java', 'the core stack comes first');
  for (const id of ['microservices', 'cloud', 'sql', 'containers']) assert.ok(job.skills.some((s) => s.id === id), id);
  assert.ok(job.skills.length <= 8);
  const bpo = JobFit.read(BPO_JD, 'bpo');
  for (const id of ['intl', 'shifts', 'english', 'kpi', 'crm']) assert.ok(bpo.skills.some((s) => s.id === id), id);
  // "RAG pipelines" are not CI/CD.
  assert.ok(!JobFit.read('Build RAG pipelines with LLMs', 'tech').skills.some((s) => s.id === 'cicd'));
});

test('the job question is built from the top asks, in plain spoken words', () => {
  const q = JobFit.question(JobFit.read(JAVA_JD, 'tech'));
  assert.equal(q.id, 'jd_fit');
  assert.match(q.text, /hands-on experience with Java and Spring/);
  assert.doesNotMatch(q.text, /&/, 'no symbols for the voice to stumble on');
  const b = JobFit.question(JobFit.read(BPO_JD, 'bpo'));
  assert.match(b.text, /^This role asks for an international process/);
  assert.equal(JobFit.question({ track: 'tech', skills: [] }), null);
});

test('a tailored plan asks the job question after the intro and leans towards the job', () => {
  const job = JobFit.read(JAVA_JD, 'tech');
  for (const seed of [1, 2, 3, 4, 5]) {
    const base = Q.buildPlan({ length: 'standard', role: 'backend', experience: 'experienced', company: 'flipkart', random: seeded(seed) });
    const plan = Q.buildPlan({ length: 'standard', role: 'backend', experience: 'experienced', company: 'flipkart', job, random: seeded(seed) });
    assert.equal(plan.length, base.length + 1);
    assert.equal(plan[1].id, 'jd_fit');
    assert.equal(plan[1].round, 1);
    assert.equal(plan[1].stageLabel, 'Job Fit');
    const core = plan.filter((q) => q.slot === 'tcore');
    assert.ok(core.every((q) => JobFit.relevance(q, job) > 0), 'seed ' + seed + ': fundamentals about the job: ' + core.map((q) => q.id));
  }
  // BPO: after the intro too, but never inside the fixed 4-round assessment.
  const bjob = JobFit.read(BPO_JD, 'bpo');
  const bpo = Q.buildPlan({ length: 'standard', role: 'voice', experience: 'fresher', job: bjob, random: seeded(3) });
  assert.equal(bpo[1].id, 'jd_fit');
  assert.ok(bpo.some((q) => q.slot === 'shifts' || q.id === 'shifts'), 'a night-shift job asks about shifts');
  const assessment = Q.buildPlan({ length: 'assessment', role: 'voice', experience: 'fresher', job: bjob, random: seeded(3) });
  assert.ok(!assessment.some((q) => q.id === 'jd_fit'));
});

test('the job question can be practised again, and the engine passes the job through', () => {
  const job = JobFit.read(JAVA_JD, 'tech');
  assert.equal(Q.buildPlan({ role: 'backend', only: ['jd_fit'], job })[0].id, 'jd_fit');
  assert.deepEqual(Q.buildPlan({ role: 'backend', only: ['jd_fit'] }), [], 'no job, no job question');
  const s = Engine.createSession({ role: 'backend', experience: 'fresher', company: 'tcs', length: 'quick', job, mode: 'voice', seed: 2 });
  assert.ok(s.plan.some((q) => q.id === 'jd_fit'));
});

test('it suggests the role a job is for', () => {
  const role = (jd, track) => JobFit.suggestRole(JobFit.read(jd, track));
  assert.equal(role(JAVA_JD, 'tech'), 'backend');
  assert.equal(role('Frontend developer: React, TypeScript, CSS, accessibility', 'tech'), 'frontend');
  assert.equal(role('Full stack: React and Node.js, REST APIs, MongoDB', 'tech'), 'fullstack');
  assert.equal(role('ML Engineer: RAG with LLMs, PyTorch, Python', 'tech'), 'aiml');
  assert.equal(role('DevOps: Kubernetes, Terraform, Jenkins, AWS', 'tech'), 'devops');
  assert.equal(role('Data analyst: SQL, Excel, Power BI dashboards', 'tech'), 'data');
  assert.equal(role('Outbound sales, monthly targets, incentives', 'bpo'), 'sales');
  assert.equal(role('Chat support, email support, non voice', 'bpo'), 'nonvoice');
  assert.equal(role(BPO_JD, 'bpo'), 'voice');
  assert.equal(role('Night shifts', 'bpo'), null, 'unclear jobs get no suggestion');
});
