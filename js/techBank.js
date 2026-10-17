/*
 * techBank.js — the engineering track: roles, companies, and their interview questions.
 *
 * Two rounds, the way tech companies interview:
 *   Round 1  Communication & thought process: you, your projects, how you think, the
 *            company's values (Amazon's Leadership Principles, Google's "Googleyness",
 *            Microsoft's growth mindset, a services company's relocation and learning
 *            questions, a startup's ownership).
 *   Round 2  Technical interview, shaped by the kind of company:
 *            big tech      fundamentals + problem solving (+ system design if experienced)
 *            product       fundamentals + problem solving + object-oriented / system design
 *            IT services   CS fundamentals (OOP, DBMS, OS, networks, SDLC) + the role + a problem
 *            startup       the role + practical engineering (debug, ship, trade-offs)
 *
 * Questions are spoken, so round 2 asks for approaches and reasoning ("how would you…,
 * what is the complexity…"), not typed code. Each question has a rubric: the concepts a
 * strong answer covers (with the ways people say them), an ideal length, follow-ups, and a
 * tip. Placeholders {company} and {role} are filled in for the chosen interview.
 *
 * Interview formats follow what these companies describe publicly and what candidates
 * report; the app is a practice simulation and is not affiliated with any of them.
 */
(function (root) {
  'use strict';
  const isNode = typeof module === 'object' && module.exports;

  // ------------------------------------------------------------------ roles

  const ROLES = {
    fullstack: { label: 'Full-Stack Developer', short: 'Full-Stack Developer', track: 'tech', icon: '🧩', blurb: 'React + APIs + databases' },
    frontend: { label: 'Frontend Developer', short: 'Frontend Developer', track: 'tech', icon: '🎨', blurb: 'JavaScript, React, performance' },
    backend: { label: 'Backend Developer (Java)', short: 'Backend Developer', track: 'tech', icon: '☕', blurb: 'Java, Spring, data, scale' },
    python: { label: 'Python Developer', short: 'Python Developer', track: 'tech', icon: '🐍', blurb: 'Python, APIs, testing' },
    aiml: { label: 'AI / ML Engineer', short: 'AI and ML Engineer', track: 'tech', icon: '🧠', blurb: 'Models, metrics, LLMs, MLOps' },
    data: { label: 'Data Analyst', short: 'Data Analyst', track: 'tech', icon: '📊', blurb: 'SQL, metrics, experiments' },
    devops: { label: 'DevOps / Cloud Engineer', short: 'DevOps Engineer', track: 'tech', icon: '☁️', blurb: 'CI/CD, containers, reliability' },
  };
  const DEV = ['fullstack', 'frontend', 'backend', 'python', 'aiml', 'devops'];
  const SERVER = ['fullstack', 'backend', 'python'];

  // ------------------------------------------------------------------ companies

  /*
   * kind shapes round 2; from is how the interviewer introduces themselves; style is shown
   * in the setup so candidates know what to expect.
   */
  const COMPANIES = {
    google: { name: 'Google', kind: 'bigtech', from: "Google's engineering hiring team", style: 'Coding and problem solving, Googleyness and leadership; system design for experienced roles.' },
    microsoft: { name: 'Microsoft', kind: 'bigtech', from: "Microsoft's engineering hiring team", style: 'Problem solving and design, collaboration, and above all a growth mindset.' },
    amazon: { name: 'Amazon', kind: 'bigtech', from: "Amazon's hiring team", style: 'Leadership Principles in every round, coding, and system design for SDE II and up.' },
    uber: { name: 'Uber', kind: 'product', from: "Uber's engineering team", style: 'Coding, design for real-time scale, and ownership.' },
    flipkart: { name: 'Flipkart', kind: 'product', from: "Flipkart's engineering team", style: 'DSA, machine coding (object-oriented design), system design and a hiring-manager round.' },
    swiggy: { name: 'Swiggy', kind: 'product', from: "Swiggy's tech team", style: 'Problem solving, low-level design and practical engineering at scale.' },
    tcs: { name: 'TCS', kind: 'services', from: "TCS's campus hiring team", style: 'Technical interview on a language, OOP, DBMS, OS and your project, then managerial and HR (relocation, shifts).' },
    infosys: { name: 'Infosys', kind: 'services', from: "Infosys's hiring team", style: 'Fundamentals, your project and a coding approach, then HR.' },
    wipro: { name: 'Wipro', kind: 'services', from: "Wipro's talent acquisition team", style: 'Fundamentals and your project, then HR.' },
    techmahindra: { name: 'Tech Mahindra', kind: 'services', from: "Tech Mahindra's hiring team", style: 'OOP, SQL, OS, networks and SDLC, then HR on relocation and shifts.' },
    accenture: { name: 'Accenture', kind: 'services', from: "Accenture's hiring team", style: 'Communication, technical fundamentals and a combined technical and HR interview.' },
    cognizant: { name: 'Cognizant', kind: 'services', from: "Cognizant's hiring team", style: 'Fundamentals, your project and HR.' },
    startup_early: { name: 'an early-stage startup', display: 'Early-stage startup', kind: 'startup', from: 'the founding team of an early-stage startup', style: 'Founder conversation, hands-on practical engineering, ownership and speed.' },
    startup_growth: { name: 'a fast-growing startup', display: 'Fast-growing startup', kind: 'startup', from: 'the engineering team of a fast-growing startup', style: 'Practical engineering, trade-offs and shipping, plus culture fit.' },
    generic: { name: 'a tech company', display: 'Any tech company', kind: 'product', from: "a tech company's hiring team", style: 'A balanced interview: fundamentals, problem solving and practical engineering.' },
  };
  const KINDS = {
    bigtech: { label: 'Big tech', order: 1 },
    product: { label: 'Product companies', order: 2 },
    services: { label: 'IT services', order: 3 },
    startup: { label: 'Startups', order: 4 },
  };

  // ------------------------------------------------------------------ plans

  const ROUNDS = [
    { title: 'Communication & thought process', focus: 'You, your projects, how you think' },
    { title: 'Technical interview', focus: 'Fundamentals and problem solving' },
  ];
  const MINUTES = { quick: '12–15', standard: '25–30', full: '40–45' };

  /**
   * The slots of a tech interview: [{ slot, round }]. "a|b" means: a question for slot a,
   * or slot b if the role has none.
   */
  function slotsFor(kind, exp, length) {
    const len = MINUTES[length] ? length : 'standard';
    const senior = exp === 'experienced';
    const r1 = {
      quick: ['tintro', 'tvalues'],
      standard: ['tintro', 'tproject', 'tthink', 'tvalues'],
      full: ['tintro', 'tproject', 'tthink', 'tvalues', 'twhy'],
    }[len].slice();
    // IT services ask the HR questions (relocation, shifts) up front.
    if (kind === 'services' && len !== 'quick') r1.push('tflex');
    const design = senior ? 'tdesign|tlld|tcore' : 'tlld|tcore';
    const r2 = {
      bigtech: {
        quick: ['tcore', 'tproblem', 'tcore'],
        standard: ['tcore', 'tcore', 'tproblem', 'tproblem', senior ? 'tdesign|tcore' : 'tcore'],
        full: ['tcore', 'tcore', 'tcore', 'tproblem', 'tproblem', design, 'tpractical'],
      },
      product: {
        quick: ['tcore', 'tproblem', 'tcore'],
        standard: ['tcore', 'tcore', 'tproblem', design, 'tpractical'],
        full: ['tcore', 'tcore', 'tcore', 'tproblem', 'tproblem', 'tlld|tcore', senior ? 'tdesign|tpractical' : 'tpractical'],
      },
      services: {
        quick: ['tcs', 'tcore', 'tcs'],
        standard: ['tcs', 'tcs', 'tcore', 'tcore', 'tproblem'],
        full: ['tcs', 'tcs', 'tcs', 'tcore', 'tcore', 'tproblem', senior ? 'tdesign|tpractical' : 'tpractical'],
      },
      startup: {
        quick: ['tcore', 'tpractical', 'tcore'],
        standard: ['tcore', 'tcore', 'tpractical', 'tpractical', senior ? 'tdesign|tproblem' : 'tproblem'],
        full: ['tcore', 'tcore', 'tcore', 'tpractical', 'tpractical', 'tproblem', senior ? 'tdesign|tlld' : 'tlld|tcore'],
      },
    }[KINDS[kind] ? kind : 'product'][len];
    return r1.map((slot) => ({ slot, round: 1 })).concat(r2.map((slot) => ({ slot, round: 2 })), [{ slot: 'closing', round: 2 }]);
  }

  const PLAN_LABELS = {
    quick: { label: 'Quick screen', minutes: MINUTES.quick, note: '2 rounds · 6 questions' },
    standard: { label: 'Standard loop', minutes: MINUTES.standard, note: '2 rounds · about 10 questions' },
    full: { label: 'Full loop', minutes: MINUTES.full, note: '2 rounds · about 13 questions' },
  };

  // ------------------------------------------------------------------ vocabulary

  const V = {
    degree: ['b tech', 'btech', 'b e', 'be in', 'computer science', 'cse', 'information technology', 'it branch', 'engineering', 'degree', 'graduat*', 'college', 'universit*', 'bca', 'mca', 'm tech', 'mtech', 'b sc', 'bsc', 'msc', 'diploma', 'final year', 'semester', 'studied', 'studying', 'course*', 'bootcamp', 'self taught'],
    stack: ['java', 'python', 'javascript', 'typescript', 'react', 'angular', 'vue', 'node*', 'express', 'spring*', 'django', 'flask', 'fastapi', 'sql', 'mysql', 'postgres*', 'mongo*', 'redis', 'html', 'css', 'c plus plus', 'c sharp', 'dot net', 'go', 'golang', 'kotlin', 'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'git', 'linux', 'tensorflow', 'pytorch', 'scikit*', 'pandas', 'numpy', 'excel', 'power bi', 'tableau', 'data structures', 'algorithms', 'machine learning', 'deep learning', 'api*', 'rest', 'microservices', 'cloud', 'devops', 'terraform', 'jenkins', 'framework*', 'language*', 'technolog*', 'tech stack', 'stack'],
    project: ['project*', 'built', 'build', 'developed', 'created', 'made an', 'made a', 'app', 'application', 'website', 'web app', 'system', 'tool', 'platform', 'model', 'dashboard', 'pipeline', 'internship', 'hackathon', 'github'],
    goal: ['goal', 'want to become', 'want to be', 'aim', 'career', 'looking for', 'want to grow', 'would like to', 'aspir*', 'future', 'learn more', 'plan to', 'next step', 'become a'],
    impact: ['re:\\d+', 'percent', 'reduced', 'improved', 'increased', 'faster', 'latency', 'users', 'customers', 'revenue', 'saved', 'cut', 'scal*', 'million*', 'thousand*', 'performance', 'uptime', 'adoption'],
    role: ['currently', 'working as', 'work as', 'i work', 'my role', 'my team', 'responsible for', 'i own', 'i lead', 'i led', 'i handle', 'years of experience', 'year of experience', 'years experience', 'company', 'team'],
    problemCtx: ['problem', 'solve*', 'purpose', 'goal', 'users', 'needed', 'idea', 'because', 'so that', 'allow*', 'help*', 'to make'],
    myPart: ['i built', 'i wrote', 'i designed', 'i implemented', 'i developed', 'i created', 'i handled', 'my part', 'my role', 'i was responsible', 'i worked on', 'i took care', 'i led', 'i owned', 'i did'],
    techReason: ['because', 'chose', 'choose', 'chosen', 'picked', 'decided', 'reason', 'so that', 'since', 'better for', 'suited', 'easier', 'faster', 'instead of', 'compared'],
    challenge: ['challenge*', 'difficult*', 'hard*', 'problem', 'issue*', 'bug*', 'stuck', 'struggl*', 'tricky', 'complex', 'error*', 'fail*', 'performance', 'slow'],
    outcome: ['result*', 'finally', 'in the end', 'deployed', 'launched', 'shipped', 'users', 'learn*', 'learnt', 'learned', 'complet*', 'working', 'won', 'selected', 'improved', 'reduced', 'achiev*', 'outcome'],
    investigate: ['log*', 'debug*', 'debugger', 'breakpoint*', 'reproduc*', 'isolat*', 'trace*', 'stack trace', 'print*', 'console', 'step by step', 'narrow*', 'checked', 'investigat*', 'monitor*', 'profil*', 'binary search', 'git bisect', 'tested'],
    rootCause: ['root cause', 'the cause', 'caused by', 'turned out', 'found that', 'realised', 'realized', 'the reason', 'because of', 'the issue was', 'the problem was', 'the bug was', 'race condition', 'null', 'memory leak', 'off by one', 'timezone', 'cache*', 'config*'],
    fix: ['fixed', 'fix', 'solved', 'resolved', 'patched', 'changed', 'rewrote', 'refactor*', 'added', 'removed', 'updated', 'corrected'],
    prevent: ['test*', 'unit test*', 'monitor*', 'alert*', 'review*', 'documented', 'never again', 'prevent*', 'since then', 'now i', 'lesson', 'learn*', 'check*', 'validation'],
    clarify: ['clarif*', 'ask*', 'question*', 'understand', 'talk to', 'speak to', 'discuss*', 'meet*', 'stakeholder*', 'product manager', 'manager', 'user*', 'client*', 'customer*'],
    scope: ['scope', 'requirement*', 'mvp', 'minimum', 'acceptance criteria', 'use case*', 'user stor*', 'priorit*', 'must have', 'define', 'goal*', 'success'],
    breakdown: ['break*', 'plan*', 'smaller', 'tasks', 'steps', 'milestone*', 'estimate*', 'design', 'outline', 'first', 'then'],
    iterate: ['prototype', 'iterat*', 'feedback', 'demo', 'mock*', 'wireframe*', 'early version', 'version one', 'review*', 'improve*', 'test with'],
    communicate: ['communicat*', 'update*', 'document*', 'share', 'inform*', 'keep them', 'confirm*', 'write down', 'transparen*'],
    analogy: ['like a', 'imagine', 'similar to', 'think of', 'just like', 'waiter', 'restaurant', 'menu', 'messenger', 'bridge', 'translator', 'post office', 'plug', 'remote control'],
    requestResponse: ['request*', 'response', 'ask*', 'send*', 'get back', 'returns', 'reply', 'gives back', 'answer*'],
    contract: ['rules', 'contract', 'agreed', 'format', 'interface', 'standard', 'way to talk', 'communicat*', 'connect*', 'without knowing', 'behind the scenes'],
    apiExample: ['for example', 'weather', 'payment*', 'login', 'google', 'maps', 'uber', 'zomato', 'swiggy', 'booking', 'app', 'website'],
    impactFirst: ['impact', 'users', 'customer*', 'production', 'critical', 'urgent*', 'business', 'revenue', 'severity', 'affected', 'down', 'outage'],
    timebox: ['delegat*', 'ask for help', 'colleague*', 'teammate*', 'reschedul*', 'postpone*', 'move the', 'time box*', 'timebox*', 'quick', 'after that', 'then', 'later'],
    star: ['situation', 'task', 'action', 'result', 'when i was', 'at my', 'in my', 'once', 'there was a time', 'last year', 'in college'],
    owned: ['i took', 'i owned', 'ownership', 'i decided', 'i stepped', 'volunteer*', 'myself', 'on my own', 'nobody', 'no one', 'not my job', 'took responsibility', 'took charge', 'took the initiative', 'i made sure'],
    customerImpact: ['customer*', 'users', 'user', 'client*', 'experience', 'impact', 'complaint*', 'feedback', 'satisf*'],
    result: ['result*', 'outcome', 'finally', 'in the end', 'reduced', 'improved', 'saved', 're:\\d+', 'percent', 'success*', 'shipped', 'delivered', 'launched', 'fixed', 'resolved', 'appreciat*', 'learn*'],
    disagree: ['disagree*', 'different opinion', 'did not agree', 'conflict', 'pushed back', 'push back', 'concern*', 'different view', 'argument', 'debate'],
    evidenceData: ['data', 'numbers', 'metrics', 'benchmark*', 'evidence', 'prototype', 'proof', 'tested', 'facts', 'measured', 'experiment*'],
    respect: ['respect*', 'listen*', 'understood their', 'their point', 'calm*', 'discuss*', 'one on one', 'privately', 'open mind*', 'professional*', 'together'],
    commit: ['commit*', 'agreed', 'went with', 'moved forward', 'decision', 'supported', 'aligned', 'compromise', 'disagree and commit'],
    ambiguity: ['unclear', 'ambigu*', 'no guidance', 'no direction', 'little information', 'without', 'unknown', 'new to', 'figure out', 'figured out', 'on my own'],
    helpOthers: ['helped', 'help*', 'mentor*', 'taught', 'pair*', 'support*', 'guid*', 'explain*', 'unblock*', 'shared', 'review*', 'onboard*'],
    team: ['team*', 'teammate*', 'colleague*', 'together', 'we', 'everyone', 'group'],
    failure: ['fail*', 'mistake', 'wrong', 'went wrong', 'did not work', 'missed', 'broke', 'bug', 'error', 'my fault', 'messed up', 'underestimat*'],
    learnt: ['learn*', 'learnt', 'learned', 'lesson', 'taught me', 'realised', 'realized', 'understood', 'insight'],
    changed: ['now i', 'since then', 'today i', 'differently', 'changed', 'i always', 'started', 'process', 'habit', 'from then', 'improv*'],
    selfLearn: ['course*', 'tutorial*', 'documentation', 'docs', 'youtube', 'udemy', 'coursera', 'book*', 'built a', 'side project', 'practic*', 'hands on', 'read', 'blog*', 'certif*'],
    deadline: ['deadline', 'tight', 'time', 'urgent*', 'pressure', 'last minute', 'days', 'week*', 'release', 'launch', 'sprint'],
    tradeoffMade: ['trade off', 'tradeoff', 'priorit*', 'cut', 'scope', 'mvp', 'later', 'deferred', 'postpone*', 'skipped', 'technical debt', 'tech debt', 'must have', 'nice to have', 'simpl*'],
    startupWhy: ['ownership', 'own', 'impact', 'learn*', 'fast', 'speed', 'build*', 'wear many hats', 'many hats', 'responsib*', 'grow*', 'from scratch', 'zero to one', 'founder*', 'small team', 'challenge*'],
    firstMonth: ['first month', 'first week*', 'first few', 'understand the', 'codebase', 'users', 'customers', 'ship*', 'small', 'quick win*', 'learn the', 'talk to', 'product'],
    endToEnd: ['end to end', 'from scratch', 'alone', 'on my own', 'by myself', 'myself', 'deployed', 'deploy*', 'hosted', 'launched', 'live', 'users', 'shipped', 'frontend', 'backend', 'database'],
    companyKnow: ['product*', 'scale', 'users', 'customers', 'mission', 'culture', 'engineering', 'technology', 'innovation', 'search', 'cloud', 'ai', 'open source', 'brand', 'clients', 'global', 'projects', 'domain*', 'known for', 'impact'],
    fit: ['my skills', 'my experience', 'i have worked', 'i have built', 'match*', 'fit', 'align*', 'background', 'suits', 'i am good at', 'i enjoy', 'passion*'],
    growth: ['learn*', 'grow*', 'career', 'mentor*', 'challeng*', 'opportunit*', 'exposure', 'develop*', 'best engineers', 'talented'],
    contribute: ['contribut*', 'add value', 'impact', 'help the team', 'deliver*', 'build', 'solve', 'bring'],
    yes: ['yes', 'yeah', 'sure', 'comfortable', 'absolutely', 'definitely', 'no problem', 'not a problem', 'ready', 'okay with', 'ok with', 'fine with', 'flexib*', 'adapt*', 'open to', 'willing', 'of course', 'happy to', 'i am okay', 'i am fine', 'anywhere', 'any location', 'any city'],
    no: ['not comfortable', 'cannot', 'difficult for me', 'only in', 'not possible', 'will not', 'i do not want', 'problem for me', 'not okay', 'not ready', 'not able', 'prefer not', 'not interested'],
    conditional: ['but', 'depends', 'only if', 'initially', 'for some time', 'occasionally', 'if it is', 'prefer'],
    newTech: ['new technolog*', 'new language', 'new framework', 'never used', 'had not used', 'first time', 'from zero', 'unfamiliar', 'quickly', 'in a week', 'in two weeks', 'few days'],
    howLearnt: ['documentation', 'docs', 'tutorial*', 'course*', 'small project', 'practic*', 'example*', 'asked', 'senior*', 'mentor*', 'read', 'experiment*', 'hands on', 'built'],
    applied: ['used it', 'applied', 'delivered', 'completed', 'built', 'shipped', 'in the project', 'on the project', 'deadline', 'working', 'result'],
  };

  // Round 2 shared vocabulary: depth signals in technical answers.
  const DEPTH = ['trade off', 'tradeoff', 'trade offs', 'complexity', 'big o', 'o of n', 'o of 1', 'o of log n', 'o n', 'o 1', 'constant time', 'linear time', 'logarithmic', 'n log n', 'edge case*', 'corner case*', 'scal*', 'latency', 'throughput', 'bottleneck', 'consisten*', 'availab*', 'for example', 'for instance', 'depends', 'downside', 'disadvantage*', 'whereas', 'compared to', 'versus', 'in production', 'in my project', 'benchmark*', 'profil*', 'measure*'];
  const COMPLEXITY = ['complexity', 'big o', 'o of n', 'o n', 'o of 1', 'o 1', 'o of log n', 'o log n', 'log n', 'n log n', 'n square*', 'n squared', 'quadratic', 'linear', 'constant time', 'logarithmic', 'time and space', 'space complexity', 'time complexity'];
  const EDGES = ['edge case*', 'corner case*', 'empty', 'null', 'zero', 'negative', 'duplicate*', 'one element', 'single element', 'overflow', 'invalid', 'boundary', 'large input'];

  // ------------------------------------------------------------------ helpers

  const c = (id, label, weight, terms) => ({ id, label, weight, terms });
  const DONT_KNOW_FU = { when: 'dontKnow', text: "That's okay. How would you start to reason about it?" };
  /** Defaults for a technical question. */
  function tq(def) {
    return Object.assign({ track: 'tech', minWords: 25, ideal: [45, 170], maxSeconds: 150, coverageTarget: 0.6 }, def, {
      followUps: (def.followUps || []).concat(def.noDontKnow ? [] : [DONT_KNOW_FU]),
    });
  }

  // ------------------------------------------------------------------ questions

  const QUESTIONS = [
    // ================================================================ Round 1
    // ---------------- Introduction
    tq({
      id: 'tech_intro_fresher', slot: 'tintro', type: 'open', exp: 'fresher',
      text: "Let's start with you. Tell me about yourself: what you studied, the technologies you've worked with, a project you're proud of, and what kind of engineer you want to become.",
      minWords: 40, ideal: [70, 200], coverageTarget: 0.6,
      concepts: [c('education', 'Education', 1, V.degree), c('stack', 'Technologies', 1.3, V.stack), c('project', 'A project', 1.2, V.project), c('goal', 'Where you are heading', 0.9, V.goal)],
      followUps: [{ when: 'short', text: 'Thanks. Could you tell me a bit more, maybe about a project you built and the technologies you used?' }, { when: 'missing:project', text: 'Which project are you most proud of, and what did you build in it?' }],
      tip: 'Present → past → future in about a minute: who you are and what you studied, the stack you know with one project that proves it, then the kind of engineering you want to do next.',
      noDontKnow: true,
    }),
    tq({
      id: 'tech_intro_experienced', slot: 'tintro', type: 'open', exp: 'experienced',
      text: "Let's start with you. Tell me about your current role: what you work on, your tech stack, and one piece of work you're proud of and the impact it had.",
      minWords: 40, ideal: [70, 210], coverageTarget: 0.6,
      concepts: [c('role', 'Current role and team', 1, V.role), c('stack', 'Tech stack', 1.2, V.stack), c('impact', 'Measurable impact', 1.3, V.impact), c('goal', 'Why you are looking', 0.7, V.goal)],
      followUps: [{ when: 'missing:impact', text: 'What was the measurable impact of that work, in numbers if you can?' }, { when: 'short', text: 'Could you go a little deeper on what you own day to day and the systems you work on?' }],
      tip: 'Lead with scope (team, product, scale), then your stack, then one achievement with a number ("cut p95 latency from 800 to 200 milliseconds"). Close with what you want next.',
      noDontKnow: true,
    }),

    // ---------------- Projects
    tq({
      id: 'tech_project_walk', slot: 'tproject', type: 'project',
      text: 'Walk me through a project you are proud of. What problem did it solve, what was your part, which technologies did you choose and why, and what was the hardest problem you hit?',
      minWords: 50, ideal: [90, 230], maxSeconds: 180, coverageTarget: 0.6,
      concepts: [c('problem', 'The problem it solved', 1, V.problemCtx), c('mine', 'Your own part', 1.2, V.myPart), c('why', 'Why those technologies', 1, V.techReason), c('challenge', 'The hardest problem', 1.1, V.challenge), c('outcome', 'Result or learning', 0.9, V.outcome)],
      followUps: [{ when: 'missing:why', text: 'Why did you choose that technology over the alternatives?' }, { when: 'missing:challenge', text: 'What was the hardest technical problem in that project, and how did you solve it?' }, { when: 'short', text: 'Tell me more about the part you built yourself.' }],
      tip: 'Interviewers probe your own part: say "I built…", name the stack and why you chose it, describe one hard problem in detail, and end with the result or what you learned.',
      noDontKnow: true,
    }),
    tq({
      id: 'tech_project_bug', slot: 'tproject', type: 'project',
      text: 'Tell me about the toughest bug or technical problem you have solved. How did you find the cause, and how did you fix it?',
      minWords: 45, ideal: [80, 210], maxSeconds: 170, coverageTarget: 0.6,
      concepts: [c('symptom', 'What went wrong', 0.8, V.challenge), c('investigate', 'How you investigated', 1.3, V.investigate), c('cause', 'The root cause', 1.2, V.rootCause), c('fix', 'The fix', 1, V.fix), c('prevent', 'How you prevented it again', 0.8, V.prevent)],
      followUps: [{ when: 'missing:investigate', text: 'How did you narrow it down? What did you check first?' }, { when: 'missing:prevent', text: 'What did you change so it would not happen again?' }],
      tip: 'Tell it like a detective story: the symptom, how you reproduced and narrowed it down (logs, debugger, bisecting), the real root cause, the fix, and the test or alert you added so it never comes back.',
      noDontKnow: true,
    }),

    // ---------------- Thought process
    tq({
      id: 'tech_think_unclear', slot: 'tthink', type: 'thinking',
      text: 'Suppose your manager asks you to build a new feature, but the requirements are unclear. How would you approach it?',
      minWords: 35, ideal: [60, 180], coverageTarget: 0.6,
      concepts: [c('clarify', 'Ask and clarify', 1.3, V.clarify), c('scope', 'Define scope and success', 1, V.scope), c('plan', 'Break it down', 0.9, V.breakdown), c('iterate', 'Prototype and get feedback', 1, V.iterate), c('communicate', 'Keep people updated', 0.7, V.communicate)],
      followUps: [{ when: 'missing:clarify', text: 'Who would you talk to first, and what would you ask them?' }],
      tip: 'Show a process: clarify the goal and users, write down scope and acceptance criteria, break it into small steps, build a quick prototype for feedback, and keep stakeholders updated.',
    }),
    tq({
      id: 'tech_think_explain_api', slot: 'tthink', type: 'thinking',
      text: "How would you explain what an API is to someone who isn't technical?",
      minWords: 30, ideal: [50, 150], coverageTarget: 0.6,
      concepts: [c('analogy', 'A simple analogy', 1.2, V.analogy), c('reqres', 'Request and response', 1, V.requestResponse), c('contract', 'An agreed way to talk', 0.9, V.contract), c('example', 'A real example', 1, V.apiExample)],
      tip: 'A great answer uses an everyday analogy (a waiter taking your order to the kitchen), explains request and response, and ends with a real example like a weather app or "Log in with Google".',
    }),
    tq({
      id: 'tech_think_prioritise', slot: 'tthink', type: 'thinking',
      text: 'You have three urgent things today: a bug in production, a feature demo, and a code review for a teammate. How do you decide what to do first?',
      minWords: 30, ideal: [50, 160], coverageTarget: 0.6,
      concepts: [c('impact', 'Impact on users first', 1.3, V.impactFirst), c('communicate', 'Tell people', 1, V.communicate), c('plan', 'Order the rest', 0.9, V.timebox), c('reason', 'Explains why', 0.8, ['because', 'since', 'so that', 'the reason', 'that is why', 'more important'])],
      tip: 'Prioritise by impact: production issues hurting users come first, then tell the demo owner and your teammate what changes; time-box or delegate the rest. Say why at each step.',
    }),

    // ---------------- Company values (behavioral)
    tq({
      id: 'tech_lp_ownership', slot: 'tvalues', type: 'behavioral', companies: ['amazon'],
      text: "At Amazon we care a lot about ownership. Tell me about a time you took ownership of something that wasn't strictly your job.",
      minWords: 50, ideal: [90, 220], maxSeconds: 170, coverageTarget: 0.6,
      concepts: [c('situation', 'The situation', 0.8, V.star), c('owned', 'You stepped up', 1.4, V.owned), c('customer', 'Why it mattered to users', 0.8, V.customerImpact), c('result', 'The result', 1.2, V.result)],
      followUps: [{ when: 'noExample', text: 'Can you give me one specific example, with what you did and what happened?' }, { when: 'missing:result', text: 'And what was the result? Do you have a number?' }],
      tip: 'Amazon expects STAR stories for each Leadership Principle: a specific situation, the action you personally took beyond your role, and a measurable result. Use "I", not "we".',
      noDontKnow: true,
    }),
    tq({
      id: 'tech_lp_disagree', slot: 'tvalues', type: 'behavioral', companies: ['amazon', 'microsoft', 'uber', 'flipkart', 'swiggy', 'generic'],
      text: 'Tell me about a time you disagreed with a teammate or your manager about a technical decision. What did you do?',
      minWords: 50, ideal: [90, 220], maxSeconds: 170, coverageTarget: 0.6,
      concepts: [c('disagree', 'The disagreement', 1, V.disagree), c('evidence', 'Used data or evidence', 1.2, V.evidenceData), c('respect', 'Handled it respectfully', 1, V.respect), c('commit', 'Reached a decision and committed', 1.1, V.commit)],
      followUps: [{ when: 'missing:evidence', text: 'How did you make your case? Did you use any data or a prototype?' }, { when: 'missing:commit', text: 'How did it end, and did you commit to the final decision?' }],
      tip: 'Show "have backbone, disagree and commit": you raised the concern with evidence (data, a prototype, a benchmark), listened, reached a decision, and then fully supported it even if it was not yours.',
      noDontKnow: true,
    }),
    tq({
      id: 'tech_lp_customer', slot: 'tvalues', type: 'behavioral', companies: ['amazon'],
      text: 'Customer obsession is our first Leadership Principle. Tell me about a time you went out of your way for a user or a customer.',
      minWords: 50, ideal: [90, 220], maxSeconds: 170, coverageTarget: 0.6,
      concepts: [c('situation', 'The situation', 0.8, V.star), c('customer', 'The customer’s need', 1.3, V.customerImpact), c('action', 'What you did', 1.1, V.owned.concat(V.myPart)), c('result', 'The result', 1.2, V.result)],
      followUps: [{ when: 'noExample', text: 'Could you walk me through one specific example?' }],
      tip: 'Start from the customer’s problem, show what you did beyond the obvious, and finish with evidence it helped: feedback, a metric, fewer complaints.',
      noDontKnow: true,
    }),
    tq({
      id: 'tech_google_ambiguity', slot: 'tvalues', type: 'behavioral', companies: ['google'],
      text: 'Tell me about a time you had to make progress on something with very little guidance or a lot of ambiguity.',
      minWords: 50, ideal: [90, 220], maxSeconds: 170, coverageTarget: 0.6,
      concepts: [c('ambiguity', 'The ambiguity', 1, V.ambiguity), c('approach', 'How you created clarity', 1.3, V.clarify.concat(V.breakdown)), c('team', 'Brought others along', 0.8, V.team), c('result', 'The result', 1.1, V.result)],
      followUps: [{ when: 'missing:result', text: 'What came out of it in the end?' }],
      tip: 'Googleyness rewards comfort with ambiguity: explain how you turned an unclear problem into a plan (questions, assumptions, small experiments), who you brought along, and what you shipped.',
      noDontKnow: true,
    }),
    tq({
      id: 'tech_google_help', slot: 'tvalues', type: 'behavioral', companies: ['google'],
      text: 'Tell me about a time you helped a teammate succeed, even though it was not your task.',
      minWords: 45, ideal: [80, 210], maxSeconds: 160, coverageTarget: 0.6,
      concepts: [c('situation', 'The situation', 0.8, V.star), c('help', 'How you helped', 1.3, V.helpOthers), c('team', 'The team context', 0.7, V.team), c('result', 'What changed for them', 1.1, V.result)],
      tip: 'Googleyness is about being a great colleague: describe how you unblocked or taught someone, how you did it kindly, and what they achieved because of it.',
      noDontKnow: true,
    }),
    tq({
      id: 'tech_ms_growth', slot: 'tvalues', type: 'behavioral', companies: ['microsoft', 'google', 'generic', 'uber', 'flipkart', 'swiggy'],
      text: 'Tell me about a time you failed or got something wrong at work or in a project. What did you learn, and what do you do differently now?',
      minWords: 45, ideal: [80, 210], maxSeconds: 160, coverageTarget: 0.6,
      concepts: [c('failure', 'The failure, owned', 1.1, V.failure), c('learnt', 'What you learned', 1.3, V.learnt), c('changed', 'What you do differently now', 1.2, V.changed)],
      followUps: [{ when: 'missing:changed', text: 'What do you do differently now because of it?' }],
      tip: 'Microsoft scores a growth mindset: own the mistake plainly, say what you learned, and show the habit or process you changed. Ending with "what I do differently now" is the key.',
      noDontKnow: true,
    }),
    tq({
      id: 'tech_ms_learn', slot: 'tvalues', type: 'behavioral', companies: ['microsoft'],
      text: 'Tell me about something technical you taught yourself recently. Why did you learn it, and how did you go about it?',
      minWords: 40, ideal: [70, 190], maxSeconds: 150, coverageTarget: 0.6,
      concepts: [c('what', 'What you learned', 1, V.stack), c('why', 'Why you learned it', 0.9, V.techReason), c('how', 'How you learned it', 1.2, V.selfLearn), c('applied', 'Put it to use', 1.1, V.applied)],
      tip: 'A learn-it-all answer: a concrete technology, the reason, your learning method (docs, a small project, a course), and how you applied it.',
      noDontKnow: true,
    }),
    tq({
      id: 'tech_product_deadline', slot: 'tvalues', type: 'behavioral', kinds: ['product', 'bigtech'],
      text: 'Tell me about a time you had to deliver something under a tight deadline. What did you trade off to make it?',
      minWords: 45, ideal: [80, 210], maxSeconds: 160, coverageTarget: 0.6,
      concepts: [c('deadline', 'The deadline', 0.8, V.deadline), c('tradeoff', 'What you traded off', 1.4, V.tradeoffMade), c('communicate', 'Kept people informed', 0.8, V.communicate), c('result', 'The result', 1.1, V.result)],
      followUps: [{ when: 'missing:tradeoff', text: 'What did you decide not to do, and how did you decide?' }],
      tip: 'Show judgement: what you cut or simplified and why, how you protected quality where it mattered, and how you followed up on the technical debt afterwards.',
      noDontKnow: true,
    }),
    tq({
      id: 'tech_services_learn', slot: 'tvalues', type: 'behavioral', kinds: ['services'],
      text: 'Our projects use many different technologies. Tell me about a time you had to learn a new technology quickly. How did you do it?',
      minWords: 40, ideal: [70, 190], maxSeconds: 150, coverageTarget: 0.6,
      concepts: [c('new', 'The new technology', 1, V.newTech.concat(V.stack)), c('how', 'How you learned it', 1.3, V.howLearnt), c('applied', 'Delivered with it', 1.1, V.applied)],
      tip: 'Services companies move you between projects: show a fast, structured way to learn (docs, a small practice project, asking seniors) and that you delivered with it.',
      noDontKnow: true,
    }),
    tq({
      id: 'tech_services_team', slot: 'tvalues', type: 'behavioral', kinds: ['services'],
      text: 'Tell me about a time you worked in a team to deliver a project. What was your role, and how did you handle any problems in the team?',
      minWords: 45, ideal: [80, 200], maxSeconds: 160, coverageTarget: 0.6,
      concepts: [c('team', 'The team and project', 0.9, V.team), c('role', 'Your role', 1.2, V.myPart), c('problem', 'A problem in the team', 1, V.challenge.concat(V.disagree)), c('result', 'The result', 1, V.result)],
      tip: 'Name your exact role, one real problem (a deadline, a disagreement, a member who was stuck), what you did about it, and how the project ended.',
      noDontKnow: true,
    }),
    tq({
      id: 'tech_startup_why', slot: 'tvalues', type: 'motivation', kinds: ['startup'],
      text: 'Why do you want to work at a startup like ours, and what would you focus on in your first month?',
      minWords: 40, ideal: [70, 190], maxSeconds: 150, coverageTarget: 0.6,
      concepts: [c('why', 'Why a startup', 1.2, V.startupWhy), c('firstMonth', 'A first-month plan', 1.2, V.firstMonth), c('fit', 'What you bring', 0.9, V.fit)],
      tip: 'Founders look for ownership and speed: a real reason for wanting startup life (impact, building from zero, learning fast) and a concrete first-month plan (learn the codebase, talk to users, ship something small).',
      noDontKnow: true,
    }),
    tq({
      id: 'tech_startup_shipped', slot: 'tvalues', type: 'behavioral', kinds: ['startup'],
      text: 'Tell me about something you built and shipped end to end, mostly on your own.',
      minWords: 45, ideal: [80, 210], maxSeconds: 160, coverageTarget: 0.6,
      concepts: [c('built', 'What you built', 1, V.project), c('e2e', 'End to end, by you', 1.3, V.endToEnd), c('decisions', 'Your decisions', 0.9, V.techReason), c('users', 'Real users or results', 1.1, V.result)],
      tip: 'Startups hire builders: show the whole loop, from idea and design to code, deployment and real users, plus one decision you made along the way.',
      noDontKnow: true,
    }),

    // ---------------- Why this company
    tq({
      id: 'tech_why_company', slot: 'twhy', type: 'motivation',
      text: 'Why do you want to join {company} as a {role}?',
      minWords: 35, ideal: [60, 170], maxSeconds: 130, coverageTarget: 0.6,
      concepts: [c('company', 'Knows the company', 1.1, V.companyKnow), c('fit', 'Fit with the role', 1.1, V.fit), c('growth', 'What you want to learn', 0.8, V.growth), c('contribute', 'What you will contribute', 1, V.contribute)],
      tip: 'Be specific about the company (its product, scale or engineering culture), connect it to your skills, and say what you will contribute, not just what you will get.',
      noDontKnow: true,
    }),

    // ---------------- HR for IT services: relocation and shifts
    tq({
      id: 'tech_flex_relocate', slot: 'tflex', type: 'flexibility',
      text: 'Projects can be in any city and some teams support clients in other time zones. Are you comfortable relocating and working in shifts if your project needs it?',
      stance: { yes: V.yes, no: V.no, conditional: V.conditional },
      minWords: 3, ideal: [10, 70], maxSeconds: 60,
      followUps: [{ when: 'redFlag', text: 'I understand. If the first project needed you in another city for six months, would that work?' }],
      tip: 'Services companies ask this in HR: a clear "yes, I am flexible" plus how you would manage it is ideal. If you have a real constraint, state it honestly.',
      noDontKnow: true,
    }),

    // ================================================================ Round 2
    // ---------------- CS fundamentals (asked most by IT services, open to every role)
    tq({
      id: 'cs_oop', slot: 'tcs', type: 'tech',
      text: 'What are the four pillars of object-oriented programming? Give a short example of one of them.',
      concepts: [c('enc', 'Encapsulation', 1, ['encapsulat*', 'data hiding', 'private', 'getters', 'setters', 'bundl*']), c('inh', 'Inheritance', 1, ['inherit*', 'parent class', 'child class', 'base class', 'derived class', 'extends', 'super class', 'subclass']), c('poly', 'Polymorphism', 1, ['polymorphism', 'overload*', 'overrid*', 'many forms', 'same method', 'same function']), c('abs', 'Abstraction', 1, ['abstract*', 'hide the details', 'hiding details', 'interface*', 'only essential', 'implementation details']), c('example', 'An example', 0.8, ['for example', 'for instance', 'like a', 'such as', 'animal', 'dog', 'car', 'vehicle', 'shape', 'bank account', 'employee', 'circle'])],
      followUps: [{ when: 'missing:example', text: 'Could you give me a quick example of polymorphism?' }],
      tip: 'Name all four (encapsulation, inheritance, polymorphism, abstraction) with a one-line meaning each, then one concrete example: a Shape class whose area() is overridden by Circle and Square.',
    }),
    tq({
      id: 'cs_normalization', slot: 'tcs', type: 'tech',
      text: 'What is normalization in databases, and why do we do it?',
      concepts: [c('redundancy', 'Removes duplicate data', 1.3, ['redundan*', 'duplicat*', 'repeat*', 'same data']), c('anomaly', 'Avoids update problems', 1, ['anomal*', 'inconsisten*', 'integrity', 'update', 'insert', 'delete']), c('split', 'Splits into related tables', 1, ['split*', 'divide*', 'separate table*', 'smaller tables', 'foreign key*', 'primary key*', 'relation*']), c('forms', 'Normal forms', 0.9, ['normal form*', '1nf', '2nf', '3nf', 'first normal', 'second normal', 'third normal', 'bcnf']), c('tradeoff', 'Trade-off (joins, denormalising)', 0.7, ['join*', 'denormali*', 'performance', 'read*', 'trade off'])],
      tip: 'Normalization organises tables to remove redundancy and avoid insert, update and delete anomalies, through normal forms (1NF, 2NF, 3NF). Mention the trade-off: more joins, which is why read-heavy systems sometimes denormalise.',
    }),
    tq({
      id: 'cs_joins', slot: 'tcs', type: 'tech', roles: DEV.concat(['data']),
      text: 'Explain the difference between an inner join and a left join, with an example.',
      concepts: [c('inner', 'Inner join: only matches', 1.3, ['inner join', 'only matching', 'matching rows', 'common', 'both tables', 'in both']), c('left', 'Left join: all of the left table', 1.3, ['left join', 'all rows from the left', 'all the rows from the left', 'all records from the left', 'everything from the left', 'left table']), c('null', 'Missing matches become null', 1, ['null*', 'empty', 'no match', 'not matching', 'missing']), c('example', 'An example', 0.8, ['for example', 'customers', 'orders', 'students', 'employees', 'departments', 'courses'])],
      tip: 'Inner join returns only rows that match in both tables; a left join returns every row of the left table, with nulls where the right table has no match. Example: all customers with their orders, including customers with none.',
    }),
    tq({
      id: 'cs_process_thread', slot: 'tcs', type: 'tech',
      text: 'What is the difference between a process and a thread?',
      concepts: [c('process', 'A process has its own memory', 1.3, ['own memory', 'separate memory', 'own address space', 'separate address space', 'independent', 'isolated', 'running program', 'program in execution']), c('thread', 'Threads share the process memory', 1.3, ['share*', 'same memory', 'same address space', 'inside a process', 'within a process', 'part of a process', 'lightweight']), c('cost', 'Cost of creating and switching', 0.9, ['context switch*', 'overhead', 'faster to create', 'cheaper', 'heavy', 'lighter', 'expensive']), c('risk', 'Shared memory needs care', 0.8, ['synchroni*', 'race condition*', 'lock*', 'crash*', 'communicat*', 'ipc'])],
      tip: 'A process is a running program with its own memory; threads run inside a process and share its memory, so they are lighter to create and switch but need synchronisation to avoid race conditions.',
    }),
    tq({
      id: 'cs_tcp_udp', slot: 'tcs', type: 'tech',
      text: 'What is the difference between TCP and UDP, and when would you use each?',
      concepts: [c('tcp', 'TCP is reliable and ordered', 1.3, ['reliable', 'connection oriented', 'handshake', 'acknowledg*', 'guarantee*', 'in order', 'ordered', 'retransmi*']), c('udp', 'UDP is fast, no guarantees', 1.3, ['connectionless', 'no guarantee', 'not reliable', 'unreliable', 'faster', 'fast', 'lightweight', 'no handshake', 'packets can be lost', 'may be lost']), c('tcpUse', 'TCP examples', 0.8, ['web', 'http', 'email', 'file transfer', 'ftp', 'banking', 'login']), c('udpUse', 'UDP examples', 0.8, ['video call*', 'streaming', 'gaming', 'game*', 'dns', 'voice', 'live'])],
      tip: 'TCP is connection-oriented and reliable (handshake, acknowledgements, ordering) for web pages, email and payments; UDP is connectionless and faster with no delivery guarantee, for video calls, games and DNS.',
    }),
    tq({
      id: 'cs_sdlc', slot: 'tcs', type: 'tech',
      text: 'What is the software development life cycle, and how is Agile different from Waterfall?',
      concepts: [c('phases', 'The phases', 1.2, ['requirement*', 'design', 'develop*', 'coding', 'implement*', 'testing', 'deploy*', 'maintenance']), c('waterfall', 'Waterfall is sequential', 1, ['sequential', 'one after another', 'step by step', 'linear', 'fixed', 'cannot go back', 'all at once']), c('agile', 'Agile is iterative', 1.2, ['iterat*', 'sprint*', 'small parts', 'increment*', 'feedback', 'flexib*', 'change*']), c('scrum', 'Scrum or ceremonies', 0.6, ['scrum', 'stand up', 'standup', 'retrospective', 'backlog', 'product owner', 'kanban'])],
      tip: 'SDLC: requirements, design, development, testing, deployment, maintenance. Waterfall runs them once in sequence; Agile repeats them in short sprints with feedback, so changes are cheap (Scrum: backlog, stand-ups, retrospectives).',
    }),
    tq({
      id: 'cs_deadlock', slot: 'tcs', type: 'tech', roles: DEV,
      text: 'What is a deadlock, and how can you prevent one?',
      concepts: [c('def', 'Each waits for the other', 1.4, ['wait* for each other', 'waiting for each other', 'circular wait', 'holding', 'each other', 'stuck forever', 'forever', 'blocked']), c('conditions', 'The conditions', 0.8, ['mutual exclusion', 'hold and wait', 'no preemption', 'circular wait', 'four conditions']), c('prevent', 'Prevention', 1.3, ['lock order*', 'same order', 'ordering', 'timeout*', 'try lock', 'avoid', 'release', 'one lock', 'detect*', 'banker']), c('example', 'An example', 0.7, ['for example', 'thread a', 'thread one', 'two threads', 'two processes', 'resource', 'printer', 'database'])],
      tip: 'A deadlock is when two or more threads each hold a resource and wait for one the other holds, forever. It needs mutual exclusion, hold-and-wait, no preemption and circular wait; prevent it by always taking locks in the same order, using timeouts, or not holding one lock while waiting for another.',
    }),
    tq({
      id: 'cs_url', slot: 'tcs', type: 'tech', roles: ['fullstack', 'frontend', 'backend', 'python', 'devops'],
      text: 'What happens, step by step, when you type a web address into a browser and press Enter?',
      ideal: [60, 190], maxSeconds: 170,
      concepts: [c('dns', 'DNS lookup', 1.2, ['dns', 'domain name', 'ip address', 'resolve*', 'name server']), c('connect', 'Connection (TCP, TLS)', 1, ['tcp', 'handshake', 'tls', 'ssl', 'https', 'connection', 'port']), c('request', 'HTTP request and response', 1.2, ['http', 'request', 'get request', 'response', 'server', 'status code']), c('render', 'Rendering', 1, ['render*', 'html', 'css', 'javascript', 'dom', 'parse*', 'paint*', 'browser displays']), c('cache', 'Caches and CDNs', 0.6, ['cache*', 'cdn', 'load balancer', 'proxy'])],
      tip: 'DNS resolves the name to an IP (with caches along the way), the browser opens a TCP connection and a TLS handshake, sends an HTTP request, the server (often behind a CDN or load balancer) responds, and the browser parses HTML, CSS and JavaScript to build the DOM and paint the page.',
    }),

    // ---------------- Problem solving (spoken: approach + complexity)
    tq({
      id: 'dsa_two_sum', slot: 'tproblem', type: 'problem', roles: DEV,
      text: 'Given an array of numbers and a target, how would you find two numbers that add up to the target? Talk me through your approach and its time complexity.',
      ideal: [50, 180], maxSeconds: 170,
      concepts: [c('brute', 'Brute force first', 0.7, ['brute force', 'nested loop*', 'two loops', 'every pair', 'all pairs', 'n square*', 'n squared', 'quadratic']), c('hash', 'Hash map of seen numbers', 1.5, ['hash map', 'hashmap', 'hash set', 'hashset', 'dictionary', 'map', 'set', 'seen', 'complement', 'target minus']), c('complexity', 'Complexity', 1.2, COMPLEXITY), c('edges', 'Edge cases or two pointers', 0.7, EDGES.concat(['two pointer*', 'sort*']))],
      followUps: [{ when: 'missing:hash', text: 'Can you do better than checking every pair? What data structure could help?' }, { when: 'missing:complexity', text: 'What is the time and space complexity of that approach?' }],
      tip: 'State the brute force (every pair, O(n²)), then improve: one pass storing each number in a hash map and checking whether target minus the current number was seen, O(n) time and O(n) space. Mention duplicates and "no answer", and the sorted two-pointer alternative.',
    }),
    tq({
      id: 'dsa_duplicates', slot: 'tproblem', type: 'problem', roles: DEV,
      text: 'How would you find the duplicate entries in a list of ten million email addresses?',
      ideal: [50, 180], maxSeconds: 170,
      concepts: [c('set', 'A hash set', 1.4, ['hash set', 'hashset', 'set', 'hash map', 'hashmap', 'dictionary', 'seen']), c('sort', 'Or sort and compare neighbours', 0.8, ['sort*', 'adjacent', 'next to each other', 'neighbo*']), c('complexity', 'Complexity', 1, COMPLEXITY), c('scale', 'Memory and scale', 1, ['memory', 'does not fit', 'chunk*', 'batch*', 'external sort', 'disk', 'stream*', 'bloom filter', 'distribut*', 'map reduce', 'partition*', 'database']), c('normalise', 'Normalise the emails', 0.7, ['lowercase', 'lower case', 'case', 'trim*', 'spaces', 'normali*'])],
      tip: 'One pass with a hash set (O(n) time, O(n) memory), or sort and compare neighbours (O(n log n), little extra memory). Normalise first (lowercase, trim). If it does not fit in memory, split by hash into chunks or use an external sort.',
    }),
    tq({
      id: 'dsa_reverse_list', slot: 'tproblem', type: 'problem', roles: DEV, exp: 'fresher',
      text: 'How would you reverse a singly linked list?',
      concepts: [c('pointers', 'Previous, current and next pointers', 1.5, ['previous', 'prev', 'current', 'next', 'pointer*', 'reference*']), c('relink', 'Point each node back', 1.2, ['reverse the link*', 'point* to the previous', 'point it back', 'change the next', 'swap', 'reverse the pointer*', 'backwards']), c('complexity', 'Complexity', 1, COMPLEXITY), c('edges', 'Edge cases or recursion', 0.6, EDGES.concat(['recurs*']))],
      tip: 'Walk the list with three pointers (previous, current, next): save next, point current back to previous, move both one step. O(n) time, O(1) space. Mention the empty list, a single node, and the recursive version.',
    }),
    tq({
      id: 'dsa_brackets', slot: 'tproblem', type: 'problem', roles: DEV, exp: 'fresher',
      text: 'How would you check whether a string of brackets, like round, square and curly brackets, is balanced?',
      concepts: [c('stack', 'Use a stack', 1.6, ['stack', 'push', 'pop']), c('match', 'Match each closing bracket', 1.1, ['match*', 'closing', 'opening', 'top of the stack', 'same type', 'corresponding', 'pair*']), c('end', 'Stack must be empty at the end', 0.8, ['empty at the end', 'stack is empty', 'empty', 'left over', 'remaining']), c('complexity', 'Complexity', 0.8, COMPLEXITY)],
      tip: 'Push every opening bracket on a stack; on a closing bracket, the top must be its matching opener (pop it), otherwise it is unbalanced. Balanced only if the stack is empty at the end. O(n) time, O(n) space.',
    }),
    tq({
      id: 'dsa_binary_search', slot: 'tproblem', type: 'problem', roles: DEV, exp: 'fresher',
      text: 'Explain binary search. When can you use it, and how fast is it?',
      concepts: [c('sorted', 'Needs sorted data', 1.3, ['sorted', 'in order', 'ordered']), c('halve', 'Halves the range each step', 1.3, ['half', 'halve*', 'middle', 'mid', 'divide*', 'left or right', 'left half', 'right half']), c('complexity', 'O(log n)', 1.2, ['log n', 'logarithmic', 'o of log n', 'o log n']), c('edges', 'Edge cases', 0.6, EDGES.concat(['overflow', 'low', 'high']))],
      tip: 'On sorted data, compare the target with the middle element and keep only the half that can contain it, so each step halves the range: O(log n). Watch the loop bounds and (low + high) overflow.',
    }),
    tq({
      id: 'dsa_lru', slot: 'tproblem', type: 'problem', roles: DEV, exp: 'experienced',
      text: 'How would you design an LRU cache where both get and put run in constant time?',
      ideal: [55, 190], maxSeconds: 170,
      concepts: [c('map', 'A hash map for lookup', 1.3, ['hash map', 'hashmap', 'dictionary', 'map', 'key to node']), c('list', 'A doubly linked list for order', 1.4, ['doubly linked list', 'linked list', 'double linked', 'deque', 'ordered dict', 'linkedhashmap']), c('move', 'Move to front on access, evict the tail', 1.1, ['move to the front', 'move it to the front', 'move to head', 'most recent*', 'least recent*', 'evict*', 'remove the last', 'tail', 'capacity']), c('complexity', 'O(1)', 0.8, ['o of 1', 'o 1', 'constant time', 'constant'])],
      tip: 'A hash map from key to node plus a doubly linked list in recency order: get moves the node to the front; put inserts at the front and, over capacity, evicts the tail. Both O(1). (Java’s LinkedHashMap and Python’s OrderedDict do this.)',
    }),
    tq({
      id: 'dsa_intervals', slot: 'tproblem', type: 'problem', roles: DEV, exp: 'experienced',
      text: 'Given a list of meeting time intervals, how would you merge the ones that overlap?',
      concepts: [c('sort', 'Sort by start time', 1.5, ['sort*', 'start time', 'by start', 'order by']), c('merge', 'Merge with the last interval', 1.3, ['overlap*', 'merge*', 'compare with the last', 'previous', 'end time', 'extend*', 'max of']), c('complexity', 'O(n log n)', 1, ['n log n', 'sorting', 'complexity', 'big o']), c('edges', 'Edge cases', 0.6, EDGES.concat(['touching', 'same start', 'contained']))],
      tip: 'Sort by start time, then walk the list keeping a merged result: if the next interval starts before the last one ends, extend the end to the max of both; otherwise start a new one. O(n log n) for the sort.',
    }),
    tq({
      id: 'dsa_top_k', slot: 'tproblem', type: 'problem', roles: DEV,
      text: 'How would you find the ten most frequent words in a very large text file?',
      ideal: [50, 180], maxSeconds: 170,
      concepts: [c('count', 'Count with a hash map', 1.4, ['hash map', 'hashmap', 'dictionary', 'counter', 'count*', 'frequenc*']), c('heap', 'A heap of size k (or sort)', 1.3, ['heap', 'priority queue', 'min heap', 'top k', 'sort*', 'bucket*']), c('complexity', 'Complexity', 0.9, COMPLEXITY.concat(['n log k'])), c('scale', 'File larger than memory', 0.9, ['stream*', 'line by line', 'chunk*', 'memory', 'map reduce', 'partition*', 'distribut*', 'normali*', 'lowercase'])],
      tip: 'Stream the file line by line, count words in a hash map, then keep a min-heap of size 10 (O(n log k)) or sort the counts. If it does not fit in memory, partition words by hash into files and count each, map-reduce style.',
    }),
    // Data analysts: problem solving is SQL and metrics.
    tq({
      id: 'data_sql_second', slot: 'tproblem', type: 'problem', roles: ['data'],
      text: 'How would you find the second-highest salary from an employees table in SQL?',
      concepts: [c('order', 'Order by salary descending', 1.1, ['order by', 'descending', 'desc', 'sort*']), c('approach', 'Limit/offset, subquery or ranking', 1.4, ['limit', 'offset', 'subquery', 'sub query', 'max', 'less than', 'dense rank', 'dense_rank', 'rank', 'row number', 'window function', 'top']), c('ties', 'Ties and nulls', 0.9, ['dupli*', 'tie*', 'same salary', 'distinct', 'null*'])],
      tip: 'Several ways: SELECT MAX(salary) WHERE salary < (SELECT MAX(salary)); ORDER BY salary DESC with DISTINCT and LIMIT 1 OFFSET 1; or DENSE_RANK() OVER (ORDER BY salary DESC) = 2, which handles ties best.',
    }),
    tq({
      id: 'data_sql_window', slot: 'tproblem', type: 'problem', roles: ['data'],
      text: 'What are window functions in SQL? Give an example of when you would use one.',
      concepts: [c('def', 'Compute across related rows without collapsing them', 1.4, ['without collapsing', 'without grouping', 'each row', 'related rows', 'window', 'unlike group by', 'keeps all rows', 'every row']), c('syntax', 'OVER, PARTITION BY, ORDER BY', 1.1, ['over', 'partition by', 'order by']), c('examples', 'Examples', 1.2, ['running total', 'cumulative', 'rank', 'row number', 'row_number', 'dense rank', 'moving average', 'lag', 'lead', 'previous month', 'percent'])],
      tip: 'Window functions compute across a set of related rows while keeping each row (unlike GROUP BY): SUM(sales) OVER (PARTITION BY region ORDER BY month) for a running total, ROW_NUMBER for de-duplication, LAG for month-over-month change.',
    }),
    tq({
      id: 'data_metric_drop', slot: 'tproblem', type: 'problem', roles: ['data'],
      text: 'Daily orders dropped twenty percent yesterday. How would you investigate why?',
      ideal: [60, 190], maxSeconds: 170,
      concepts: [c('verify', 'Check the data first', 1.2, ['tracking', 'pipeline', 'data issue', 'bug', 'logging', 'verify', 'is it real', 'data quality', 'missing data']), c('segment', 'Segment it', 1.3, ['segment*', 'by region', 'by platform', 'android', 'ios', 'by product', 'by channel', 'by city', 'breakdown', 'break it down', 'cohort*']), c('time', 'Compare over time', 1, ['last week', 'same day', 'week over week', 'seasonal*', 'holiday*', 'trend', 'historical', 'compare*']), c('external', 'Outside causes', 0.9, ['outage', 'release', 'competitor*', 'campaign', 'marketing', 'payment*', 'weather', 'external', 'app update', 'price*']), c('communicate', 'Report the finding', 0.6, ['stakeholder*', 'report', 'communicat*', 'recommend*', 'dashboard'])],
      tip: 'First confirm it is real (tracking or pipeline issues), then segment by platform, region, channel and product, compare with the same day last week and seasonality, check releases, outages, campaigns and payments, and share the root cause with a recommendation.',
    }),

    // ---------------- Object-oriented (low-level) design
    tq({
      id: 'lld_parking', slot: 'tlld', type: 'design', roles: ['fullstack', 'backend', 'python', 'frontend'],
      text: 'How would you design the classes for a parking lot system?',
      ideal: [60, 200], maxSeconds: 180,
      concepts: [c('entities', 'The main classes', 1.3, ['parking lot', 'level*', 'floor*', 'spot*', 'slot*', 'vehicle*', 'ticket*', 'gate*', 'payment*']), c('types', 'Vehicle and spot types', 1, ['car', 'bike', 'truck', 'small', 'large', 'compact', 'enum', 'type*', 'size*', 'inherit*', 'subclass*']), c('ops', 'Operations', 1.1, ['park', 'unpark', 'find*', 'available', 'allocate*', 'assign*', 'fee', 'charge*', 'exit', 'entry']), c('principles', 'Design principles', 0.9, ['single responsibility', 'solid', 'interface*', 'abstract*', 'strategy', 'factory', 'pattern*', 'extensib*', 'encapsulat*']), c('concurrency', 'Concurrency', 0.6, ['concurren*', 'two cars', 'same spot', 'lock*', 'thread*', 'synchroni*'])],
      tip: 'Name the entities (ParkingLot, Level, Spot, Vehicle with Car/Bike/Truck, Ticket, Payment), the operations (park, unpark, find a free spot, compute the fee), and design choices: a pricing strategy interface, spot sizes as an enum, and locking so two cars never get the same spot.',
    }),
    tq({
      id: 'lld_library', slot: 'tlld', type: 'design', roles: ['fullstack', 'backend', 'python'],
      text: 'How would you design the classes for a library management system?',
      ideal: [60, 200], maxSeconds: 180,
      concepts: [c('entities', 'The main classes', 1.3, ['book*', 'member*', 'user*', 'librarian', 'catalog*', 'copy', 'copies', 'loan*', 'reservation*', 'fine*']), c('ops', 'Operations', 1.1, ['issue', 'borrow*', 'return*', 'reserve', 'search*', 'renew*', 'fine', 'due date']), c('relations', 'Relationships', 0.9, ['has many', 'one to many', 'many to many', 'relationship*', 'contains', 'belongs to', 'composition', 'aggregation']), c('principles', 'Design principles', 0.9, ['single responsibility', 'solid', 'interface*', 'abstract*', 'pattern*', 'observer', 'notif*', 'extensib*'])],
      tip: 'Separate Book (title) from BookCopy (a physical item), Member, Loan and Reservation; operations to search, issue, return, renew and compute fines; notify members when a reserved book returns (observer pattern).',
    }),

    // ---------------- System design (experienced)
    tq({
      id: 'design_url_shortener', slot: 'tdesign', type: 'design', roles: SERVER, exp: 'experienced',
      text: 'Design a URL shortener like Bitly. Walk me through the main components and how it scales.',
      ideal: [80, 240], maxSeconds: 210,
      concepts: [c('api', 'API: create and redirect', 1, ['api', 'endpoint*', 'post', 'get', 'redirect*', '301', '302']), c('id', 'Generating short codes', 1.3, ['base 62', 'base62', 'hash*', 'counter', 'unique id', 'random', 'collision*', 'snowflake', 'id generat*']), c('storage', 'Storage', 1, ['database', 'key value', 'nosql', 'sql', 'table', 'store the mapping', 'mapping']), c('cache', 'Caching the hot links', 1, ['cache*', 'redis', 'cdn', 'read heavy']), c('scale', 'Scaling', 1.1, ['shard*', 'partition*', 'replica*', 'replicat*', 'load balancer', 'horizontal*', 'scale*']), c('extras', 'Analytics, expiry, abuse', 0.6, ['analytics', 'click*', 'expir*', 'ttl', 'rate limit*', 'spam', 'custom alias'])],
      tip: 'APIs to create and redirect (301/302); short codes from a counter in base62 or a hash with collision checks; a key-value store for the mapping; a cache in front because reads dominate; sharding and replicas to scale; plus expiry, analytics and rate limiting.',
    }),
    tq({
      id: 'design_rate_limiter', slot: 'tdesign', type: 'design', roles: SERVER.concat(['devops']), exp: 'experienced',
      text: 'How would you design a rate limiter for a public API?',
      ideal: [70, 220], maxSeconds: 200,
      concepts: [c('algo', 'An algorithm', 1.4, ['token bucket', 'leaky bucket', 'sliding window', 'fixed window', 'window', 'bucket']), c('key', 'What to limit by', 0.9, ['per user', 'per ip', 'api key', 'user id', 'client', 'per endpoint']), c('store', 'Where the counters live', 1, ['redis', 'cache', 'in memory', 'counter*', 'atomic', 'distributed', 'central*']), c('response', 'What the client gets', 0.8, ['429', 'too many requests', 'retry after', 'headers', 'reject*', 'throttl*']), c('scale', 'Distributed concerns', 0.8, ['multiple servers', 'distributed', 'race*', 'consisten*', 'gateway', 'load balancer', 'latency'])],
      tip: 'Pick an algorithm (token bucket for bursts, sliding window for accuracy), key it by API key or user, keep counters in Redis with atomic operations so all servers agree, and return 429 with Retry-After. Put it in the API gateway.',
    }),
    tq({
      id: 'design_feed_frontend', slot: 'tdesign', type: 'design', roles: ['frontend', 'fullstack'], exp: 'experienced',
      text: 'How would you build the frontend of an infinite news feed so it loads fast and scrolls smoothly?',
      ideal: [70, 220], maxSeconds: 200,
      concepts: [c('paging', 'Paginated loading', 1.2, ['pagination', 'paginat*', 'cursor', 'infinite scroll', 'load more', 'intersection observer', 'next page', 'page']), c('virtual', 'Virtualised list', 1.3, ['virtuali*', 'windowing', 'react window', 'react virtualized', 'only render', 'visible items', 'recycle*']), c('state', 'Caching and state', 1, ['cache*', 'state', 'react query', 'redux', 'store', 'optimistic', 'stale']), c('assets', 'Images and code', 1, ['lazy load*', 'lazy', 'image*', 'placeholder*', 'skeleton*', 'code split*', 'bundle', 'prefetch*']), c('ux', 'Loading and errors', 0.6, ['loading state', 'spinner', 'error state', 'retry', 'skeleton', 'accessib*'])],
      tip: 'Cursor-based pagination triggered by an IntersectionObserver, a virtualised list so only visible items are in the DOM, cached data (React Query or similar), lazy-loaded images with placeholders and skeletons, code splitting, and clear loading and error states.',
    }),
    tq({
      id: 'design_recsys', slot: 'tdesign', type: 'design', roles: ['aiml'], exp: 'experienced',
      text: 'Design a product recommendation system for an e-commerce site. Walk me through the data, the models and how you would evaluate it.',
      ideal: [80, 240], maxSeconds: 220,
      concepts: [c('data', 'Signals and data', 1, ['click*', 'purchase*', 'views', 'implicit', 'explicit', 'rating*', 'history', 'session*', 'interaction*', 'feature*']), c('candidates', 'Candidate generation', 1.2, ['candidate*', 'collaborative filtering', 'matrix factori*', 'embedding*', 'two tower', 'nearest neighbo*', 'similar items', 'retrieval']), c('ranking', 'Ranking model', 1.1, ['rank*', 'gradient boost*', 'xgboost', 'neural', 'learning to rank', 'score*', 'predict*']), c('eval', 'Offline and online evaluation', 1.2, ['precision at', 'recall at', 'ndcg', 'map', 'auc', 'offline', 'a b test', 'ab test', 'online', 'click through', 'ctr', 'conversion']), c('prod', 'Cold start and serving', 0.9, ['cold start', 'new user*', 'new item*', 'popular*', 'latency', 'serving', 'real time', 'retrain*', 'drift', 'monitor*'])],
      tip: 'Two stages: candidate generation (collaborative filtering or embedding retrieval) then a ranking model on rich features. Evaluate offline (precision@k, NDCG) and online with A/B tests on CTR and conversion; handle cold start with popularity and content features; watch latency, retraining and drift.',
    }),
    tq({
      id: 'design_ml_pipeline', slot: 'tdesign', type: 'design', roles: ['aiml', 'python'], exp: 'experienced',
      text: 'How would you take a trained model to production and keep it healthy?',
      ideal: [70, 220], maxSeconds: 200,
      concepts: [c('serve', 'Serving', 1.1, ['api', 'endpoint', 'batch', 'real time', 'fastapi', 'docker', 'container*', 'serving', 'kubernetes', 'sagemaker', 'vertex']), c('version', 'Versioning and reproducibility', 0.9, ['version*', 'registry', 'mlflow', 'reproduc*', 'pipeline', 'ci cd', 'feature store']), c('rollout', 'Safe rollout', 1, ['shadow', 'canary', 'a b test', 'ab test', 'gradual*', 'rollback']), c('monitor', 'Monitoring and drift', 1.3, ['monitor*', 'drift', 'data drift', 'distribution', 'skew', 'latency', 'accuracy', 'alert*', 'dashboard*']), c('retrain', 'Retraining', 0.9, ['retrain*', 'feedback', 'new data', 'schedule*', 'trigger*'])],
      tip: 'Package and serve it (an API or batch job in a container), version models and data (a registry), roll out safely (shadow, canary, A/B), monitor latency, prediction quality and data drift with alerts, and retrain on fresh data when it degrades.',
    }),
    tq({
      id: 'design_metrics_dashboard', slot: 'tdesign', type: 'design', roles: ['data'], exp: 'experienced',
      text: 'How would you design the data pipeline and dashboard to track daily active users for a product?',
      ideal: [70, 220], maxSeconds: 200,
      concepts: [c('define', 'Define the metric', 1.2, ['define', 'definition', 'what counts', 'active', 'event*', 'unique user*', 'distinct']), c('pipeline', 'Pipeline', 1.2, ['etl', 'elt', 'pipeline', 'warehouse', 'bigquery', 'snowflake', 'redshift', 'airflow', 'dbt', 'schedule*', 'batch']), c('quality', 'Data quality', 0.9, ['quality', 'duplicat*', 'late data', 'test*', 'validation', 'check*', 'timezone']), c('dashboard', 'Dashboard', 1, ['dashboard', 'tableau', 'power bi', 'looker', 'chart*', 'trend', 'segment*', 'filter*']), c('alerts', 'Alerts and ownership', 0.6, ['alert*', 'anomal*', 'monitor*', 'owner*', 'documentation'])],
      tip: 'Agree the definition (which events count, unique users, time zone), build an ELT pipeline into a warehouse (scheduled with Airflow or dbt), add data-quality tests, then a dashboard with trends and segments plus anomaly alerts.',
    }),
    tq({
      id: 'design_cicd', slot: 'tdesign', type: 'design', roles: ['devops', 'backend', 'fullstack'], exp: 'experienced',
      text: 'How would you set up CI/CD for a web service so you can deploy with zero downtime?',
      ideal: [70, 220], maxSeconds: 200,
      concepts: [c('ci', 'Build and test on every change', 1.1, ['build', 'unit test*', 'lint*', 'pipeline', 'pull request', 'every commit', 'continuous integration']), c('artifact', 'An immutable artifact', 0.8, ['docker image', 'image', 'artifact', 'container*', 'registry', 'version*', 'tag*']), c('strategy', 'Deployment strategy', 1.4, ['blue green', 'canary', 'rolling', 'gradual*', 'traffic shift*']), c('health', 'Health checks and rollback', 1.1, ['health check*', 'readiness', 'liveness', 'rollback', 'roll back', 'smoke test*', 'monitor*', 'alert*']), c('iac', 'Infrastructure and migrations', 0.6, ['terraform', 'infrastructure as code', 'migration*', 'backward compatible', 'feature flag*'])],
      tip: 'CI builds, lints and tests every change and produces a versioned container image; CD deploys with rolling, blue-green or canary releases behind health checks, watches error rates, and rolls back automatically. Keep database migrations backward compatible and use feature flags.',
    }),

    // ---------------- Practical engineering
    tq({
      id: 'prac_slow', slot: 'tpractical', type: 'tech', roles: ['fullstack', 'frontend', 'backend', 'python', 'devops'],
      text: 'Users say a page in your app has become slow. How would you find and fix the problem?',
      ideal: [60, 200], maxSeconds: 180,
      concepts: [c('measure', 'Measure and reproduce first', 1.3, ['measure*', 'reproduc*', 'profil*', 'devtools', 'network tab', 'lighthouse', 'apm', 'metrics', 'logs', 'trace*', 'monitor*']), c('locate', 'Find the bottleneck', 1.2, ['bottleneck', 'database', 'query', 'queries', 'n plus 1', 'api call*', 'payload', 'render*', 'bundle', 'network', 'memory']), c('fix', 'Targeted fixes', 1.1, ['index*', 'cache*', 'paginat*', 'optimi*', 'lazy load*', 'cdn', 'compress*', 'batch*', 'async']), c('verify', 'Verify and prevent', 0.8, ['verify', 'compare', 'before and after', 'benchmark*', 'alert*', 'monitor*', 'regression'])],
      tip: 'Measure before guessing: reproduce it and use DevTools, logs, traces or APM to find where time goes (a slow query, N+1 calls, a huge payload, rendering). Fix that bottleneck (index, cache, paginate, lazy-load), confirm with before-and-after numbers, and add monitoring.',
    }),
    tq({
      id: 'prac_incident', slot: 'tpractical', type: 'tech', roles: DEV,
      text: 'A deployment you made has broken something in production late at night. What do you do?',
      concepts: [c('mitigate', 'Stop the damage first', 1.4, ['rollback', 'roll back', 'revert*', 'previous version', 'disable', 'feature flag', 'mitigat*', 'hotfix']), c('communicate', 'Tell people', 1, V.communicate.concat(['on call', 'status page', 'manager', 'team'])), c('investigate', 'Find the cause', 1, V.investigate), c('postmortem', 'Learn from it', 1, ['post mortem', 'postmortem', 'root cause', 'blameless', 'test*', 'prevent*', 'process', 'checklist', 'monitor*'])],
      tip: 'Mitigate first (roll back or switch off the feature flag), communicate on the incident channel, then find the root cause from logs once users are safe, and write a blameless post-mortem with the test or alert that would have caught it.',
    }),
    tq({
      id: 'prac_mvp', slot: 'tpractical', type: 'tech', kinds: ['startup'],
      text: 'You have one week to build the first version of a new feature for real users. How would you plan it?',
      concepts: [c('scope', 'Cut to the core', 1.4, ['mvp', 'minimum', 'core', 'must have', 'scope', 'cut', 'simplest', 'priorit*']), c('stack', 'Simple, known tools', 0.9, ['existing', 'simple', 'library', 'libraries', 'framework', 'no code', 'managed service', 'firebase', 'off the shelf', 'reuse']), c('ship', 'Ship early', 1.1, ['deploy*', 'ship*', 'release*', 'early', 'daily', 'iterat*', 'feature flag']), c('feedback', 'Measure and get feedback', 1.1, ['feedback', 'users', 'metric*', 'analytics', 'measure*', 'talk to']), c('debt', 'Aware of the shortcuts', 0.6, ['tech debt', 'technical debt', 'test*', 'refactor*', 'later'])],
      tip: 'Cut to the one job users need, build with tools you already know (managed services, libraries), deploy early behind a flag, measure usage and talk to users, and keep a list of the shortcuts to clean up next.',
    }),
    tq({
      id: 'prac_review', slot: 'tpractical', type: 'tech', roles: DEV,
      text: 'What do you look for when you review someone else’s code?',
      concepts: [c('correct', 'Correctness and edge cases', 1.3, ['bug*', 'correct*', 'logic', 'edge case*', 'error handling', 'null*', 'requirement*']), c('readable', 'Readability', 1, ['readab*', 'naming', 'names', 'clean', 'simple', 'comments', 'consisten*', 'style']), c('tests', 'Tests', 1, ['test*', 'coverage']), c('perfsec', 'Performance and security', 0.9, ['performance', 'security', 'sql injection', 'secret*', 'complexity', 'memory', 'scal*']), c('kind', 'Constructive tone', 0.8, ['kind*', 'constructive', 'suggest*', 'explain why', 'respect*', 'learn*', 'praise', 'positive'])],
      tip: 'Correctness first (logic, edge cases, error handling), then readability (naming, simplicity), tests, performance and security, and design. Be constructive: explain why, suggest, and praise what is good.',
    }),
    tq({
      id: 'prac_data_wrong', slot: 'tpractical', type: 'tech', roles: ['data'],
      text: 'A manager says the numbers on your dashboard look wrong. How do you handle it?',
      concepts: [c('listen', 'Understand the concern', 0.9, ['understand', 'ask*', 'which number*', 'what they expect', 'compare*', 'source of truth']), c('trace', 'Trace the data', 1.4, ['source', 'query', 'queries', 'pipeline', 'join*', 'filter*', 'duplicat*', 'null*', 'timezone', 'refresh*', 'definition']), c('fix', 'Fix and communicate', 1.1, ['fix*', 'correct*', 'communicat*', 'update*', 'inform*', 'note', 'annotate']), c('prevent', 'Prevent it', 0.9, ['test*', 'validation', 'check*', 'monitor*', 'alert*', 'document*', 'reconcil*'])],
      tip: 'Take it seriously and ask which number and what they expected; trace it back (query, joins, filters, duplicates, time zones, refresh time), fix and tell everyone who uses it, then add data tests or reconciliation checks.',
    }),
  ];

  // ---------------- Role fundamentals (tcore)
  const CORE = {
    fullstack: [
      tq({ id: 'fs_rest', text: 'What makes an API RESTful, and how do you choose between GET, POST, PUT and DELETE?',
        concepts: [c('resources', 'Resources and URLs', 1, ['resource*', 'url*', 'endpoint*', 'noun*', 'path*']), c('methods', 'What each method means', 1.4, ['get to read', 'get is for reading', 'fetch', 'post to create', 'create', 'put to update', 'update', 'replace', 'delete to remove', 'remove', 'patch']), c('stateless', 'Stateless', 1, ['stateless', 'no state', 'each request', 'independent']), c('codes', 'Status codes and JSON', 0.9, ['status code*', '200', '201', '400', '404', '500', 'json'])],
        tip: 'REST models resources as URLs and uses HTTP methods by meaning: GET reads (safe, idempotent), POST creates, PUT replaces (idempotent), PATCH updates part, DELETE removes. Requests are stateless and responses use proper status codes (201 Created, 404, 500).' }),
      tq({ id: 'fs_auth', text: 'How does login and authentication work in a web app? Compare server sessions with JWT tokens.',
        concepts: [c('verify', 'Verify credentials safely', 0.9, ['hash*', 'bcrypt', 'password', 'credential*', 'salt']), c('session', 'Sessions: server-side state', 1.2, ['session*', 'session id', 'cookie*', 'server side', 'stored on the server', 'store']), c('jwt', 'JWT: signed, stateless token', 1.2, ['jwt', 'json web token', 'token*', 'signed', 'signature', 'stateless', 'payload']), c('security', 'Storage and expiry', 1, ['http only', 'httponly', 'expir*', 'refresh token*', 'secure', 'csrf', 'xss', 'revoke*', 'logout'])],
        tip: 'Check the password against a salted hash (bcrypt), then either store a session server-side keyed by an HttpOnly cookie (easy to revoke) or issue a signed JWT the server can verify without state (scales easily, harder to revoke, so short expiry plus refresh tokens).' }),
      tq({ id: 'fs_sql_nosql', text: 'When would you choose a SQL database and when a NoSQL database?',
        concepts: [c('sql', 'SQL: relations, schema, transactions', 1.3, ['relational', 'tables', 'schema', 'join*', 'acid', 'transaction*', 'consisten*', 'structured']), c('nosql', 'NoSQL: flexible, horizontal scale', 1.3, ['flexible', 'schema less', 'schemaless', 'document*', 'key value', 'mongo*', 'horizontal*', 'scale out', 'unstructured', 'json']), c('when', 'When to use which', 1.1, ['when', 'use case*', 'banking', 'payments', 'orders', 'catalog*', 'logs', 'chat', 'real time', 'depends'])],
        tip: 'SQL (PostgreSQL, MySQL) for structured data with relations and transactions, like orders and payments. NoSQL (MongoDB, DynamoDB) for flexible or very large, simple-access data that must scale horizontally, like catalogues, sessions or logs. Many systems use both.' }),
      tq({ id: 'fs_cors', text: 'What is CORS, and why do browsers enforce it?',
        concepts: [c('origin', 'Same-origin policy', 1.3, ['same origin', 'origin*', 'different domain', 'another domain', 'cross origin', 'domain', 'port', 'protocol']), c('headers', 'The server allows origins with headers', 1.2, ['header*', 'access control allow origin', 'allow origin', 'whitelist*', 'allow list', 'allowed origins']), c('preflight', 'Preflight requests', 0.9, ['preflight', 'options request', 'options']), c('why', 'Protects users', 1, ['security', 'protect*', 'cookies', 'malicious', 'steal*', 'user data'])],
        tip: 'Browsers block scripts from reading responses from another origin (the same-origin policy) to protect users’ data. CORS lets a server opt in with Access-Control-Allow-Origin headers; non-simple requests first send an OPTIONS preflight. It is enforced by the browser, not the server.' }),
      tq({ id: 'fs_caching', text: 'Where would you add caching in a web application, and what can go wrong with it?',
        concepts: [c('browser', 'Browser and CDN', 1, ['browser cache', 'cache control', 'http cache', 'cdn', 'etag', 'headers']), c('server', 'Server-side cache', 1.2, ['redis', 'memcached', 'in memory', 'application cache', 'server side']), c('db', 'Database and query results', 0.7, ['query', 'database', 'materiali*', 'result*']), c('risk', 'Stale data and invalidation', 1.3, ['stale', 'invalidat*', 'ttl', 'expir*', 'consisten*', 'out of date', 'cache miss*', 'stampede'])],
        tip: 'Cache at several layers: HTTP cache headers and a CDN for static assets, Redis for expensive reads or sessions, and stored query results. The hard part is invalidation: stale data, TTL choices, cache stampedes. "There are only two hard things…"' }),
      tq({ id: 'fs_react_state', text: 'How do you manage state in a React application, and when would you reach for a global store?',
        concepts: [c('local', 'Local state', 1, ['usestate', 'use state', 'local state', 'component state']), c('lift', 'Lifting state and props', 1, ['lift*', 'props', 'parent', 'prop drilling']), c('global', 'Context or a store', 1.2, ['context', 'redux', 'zustand', 'global', 'store', 'mobx', 'recoil']), c('server', 'Server state', 0.9, ['react query', 'tanstack', 'swr', 'server state', 'cache', 'fetch*'])],
        tip: 'Keep state as local as possible (useState), lift it to the nearest common parent when siblings need it, use Context or a store (Redux, Zustand) for truly global state like the user or theme, and a server-state library (React Query) for fetched data.' }),
    ],
    frontend: [
      tq({ id: 'fe_rerender', text: 'How does React decide what to re-render, and how would you avoid unnecessary re-renders?',
        concepts: [c('trigger', 'State and props trigger renders', 1.2, ['state change*', 'props change*', 'setstate', 'state', 'props', 'parent re render*', 'parent renders']), c('diff', 'Virtual DOM diffing', 1.1, ['virtual dom', 'diff*', 'reconcil*', 'compare*']), c('keys', 'Keys in lists', 0.7, ['key*', 'unique key']), c('memo', 'Memoisation', 1.2, ['memo', 'react memo', 'usememo', 'use memo', 'usecallback', 'use callback', 'pure component', 'shouldcomponentupdate']), c('structure', 'State placement', 0.7, ['split', 'move state', 'colocat*', 'smaller component*', 'lift*'])],
        tip: 'A component re-renders when its state or props change or its parent re-renders; React diffs the virtual DOM and updates only what changed (stable keys help). Avoid waste with React.memo, useMemo and useCallback for expensive work, and by keeping state close to where it is used.' }),
      tq({ id: 'fe_useeffect', text: 'What is useEffect for, and what does its dependency array do?',
        concepts: [c('side', 'Side effects', 1.2, ['side effect*', 'fetch*', 'api call*', 'subscription*', 'timer*', 'event listener*', 'dom']), c('after', 'Runs after render', 0.8, ['after render*', 'after the component', 'after mount*', 'mount*']), c('deps', 'Dependencies control when it runs', 1.3, ['dependenc*', 'empty array', 'only once', 'when it changes', 'every render', 're run*']), c('cleanup', 'Cleanup', 1, ['cleanup', 'clean up', 'return a function', 'unsubscribe', 'remove the listener', 'clear*']), c('pitfalls', 'Pitfalls', 0.6, ['infinite loop', 'stale closure', 'stale', 'missing dependenc*'])],
        tip: 'useEffect runs side effects (fetching, subscriptions, timers) after render. The dependency array decides when it re-runs: no array = every render, [] = once on mount, [x] = when x changes. Return a cleanup function to unsubscribe, and watch for infinite loops and stale closures.' }),
      tq({ id: 'fe_event_loop', text: 'Explain the JavaScript event loop.',
        concepts: [c('single', 'Single-threaded call stack', 1.1, ['single thread*', 'one thread', 'call stack', 'stack']), c('async', 'Async work handed off', 1, ['web api*', 'browser api*', 'settimeout', 'set timeout', 'fetch', 'async*', 'callback*', 'non blocking']), c('queues', 'Task and microtask queues', 1.3, ['queue*', 'callback queue', 'task queue', 'microtask*', 'macrotask*', 'promise*', 'job queue']), c('order', 'Microtasks first', 1, ['microtask* first', 'before', 'promises run before', 'priority', 'empty stack', 'when the stack is empty'])],
        tip: 'JavaScript runs one call stack. Async work (timers, fetch) is handed to the browser; their callbacks wait in queues. When the stack is empty, the event loop runs all microtasks (promise callbacks) first, then the next task (setTimeout). That is why Promise.then runs before setTimeout(…, 0).' }),
      tq({ id: 'fe_perf', text: 'How would you make a slow website load faster?',
        concepts: [c('measure', 'Measure first', 1, ['lighthouse', 'core web vitals', 'lcp', 'cls', 'inp', 'devtools', 'measure*', 'webpagetest', 'profil*']), c('js', 'Less JavaScript', 1.1, ['bundle*', 'code split*', 'tree shak*', 'minif*', 'lazy load*', 'defer', 'async']), c('images', 'Images', 1, ['image*', 'compress*', 'webp', 'avif', 'lazy', 'responsive images', 'srcset']), c('network', 'Caching and CDN', 1, ['cache*', 'cdn', 'http 2', 'preload', 'prefetch', 'gzip', 'brotli']), c('render', 'Rendering', 0.8, ['critical css', 'ssr', 'server side render*', 'static', 'render blocking', 'fonts'])],
        tip: 'Measure with Lighthouse and Core Web Vitals (LCP, INP, CLS), then: ship less JavaScript (code splitting, tree shaking, defer), compress and lazy-load images (WebP/AVIF, srcset), cache with a CDN, inline critical CSS, and consider server-side rendering.' }),
      tq({ id: 'fe_flex_grid', text: 'When would you use Flexbox, and when CSS Grid?',
        concepts: [c('flex', 'Flexbox: one dimension', 1.3, ['one dimension*', 'single direction', 'row or column', 'one direction', '1d', 'one axis']), c('grid', 'Grid: two dimensions', 1.3, ['two dimension*', 'rows and columns', '2d', 'both directions', 'layout']), c('examples', 'Examples', 1, ['navbar', 'nav bar', 'buttons', 'align*', 'centre', 'center', 'page layout', 'gallery', 'dashboard', 'cards']), c('responsive', 'Responsive', 0.6, ['responsive', 'media quer*', 'auto fit', 'minmax', 'wrap'])],
        tip: 'Flexbox lays things out in one dimension (a row or a column): navbars, aligning buttons, centring. Grid handles two dimensions: whole-page layouts, galleries, dashboards (repeat(auto-fit, minmax(…))). They combine well.' }),
      tq({ id: 'fe_a11y', text: 'How do you make a web page accessible?',
        concepts: [c('semantic', 'Semantic HTML', 1.2, ['semantic', 'button element', 'heading*', 'label*', 'landmark*', 'nav', 'main']), c('alt', 'Text alternatives', 0.9, ['alt text', 'alt attribute', 'alt', 'caption*', 'transcript*']), c('keyboard', 'Keyboard and focus', 1.2, ['keyboard', 'tab*', 'focus*', 'focus visible', 'skip link']), c('aria', 'ARIA where needed', 0.8, ['aria*', 'screen reader*', 'role*']), c('contrast', 'Contrast and testing', 0.8, ['contrast', 'colour', 'color', 'font size', 'zoom', 'axe', 'lighthouse', 'test*'])],
        tip: 'Use semantic HTML (real buttons, headings, labels), alt text for images, full keyboard navigation with visible focus, ARIA only where HTML falls short, enough colour contrast, and test with a screen reader and tools like axe.' }),
      tq({ id: 'fe_closure', text: 'What is a closure in JavaScript? Give an example of where it is useful.',
        concepts: [c('def', 'A function remembers its outer scope', 1.4, ['remember*', 'outer scope', 'outer function', 'lexical scope', 'enclosing', 'access to the variables', 'even after']), c('example', 'An example', 1.1, ['counter', 'private', 'factory', 'event handler*', 'callback*', 'settimeout', 'currying', 'memoi*', 'module pattern']), c('pitfall', 'A pitfall', 0.6, ['loop', 'var', 'stale', 'memory']) ],
        tip: 'A closure is a function that keeps access to the variables of the scope it was created in, even after that function returned. Classic uses: a counter or private state (makeCounter), event handlers, memoisation. Pitfall: var in loops captures one shared variable.' }),
    ],
    backend: [
      tq({ id: 'be_interface_abstract', text: 'In Java, what is the difference between an interface and an abstract class, and when would you use each?',
        concepts: [c('abstract', 'Abstract class: state and shared code', 1.2, ['constructor*', 'fields', 'state', 'instance variable*', 'implemented method*', 'concrete method*', 'common code', 'partial*']), c('interface', 'Interface: a contract', 1.2, ['contract', 'what to do', 'capabilit*', 'abstract methods', 'default method*', 'static method*']), c('multiple', 'Multiple interfaces, one superclass', 1.1, ['multiple', 'implement many', 'more than one', 'single inheritance', 'only one class', 'extends one']), c('when', 'When to use which', 0.9, ['is a', 'can do', 'related classes', 'unrelated', 'when'])],
        tip: 'An abstract class can hold state, constructors and shared implementation for closely related classes ("is-a"); a class can extend only one. An interface is a contract of capabilities ("can-do"), and a class can implement many; since Java 8 interfaces can have default methods.' }),
      tq({ id: 'be_hashmap', text: 'How does a HashMap work internally in Java?',
        concepts: [c('hash', 'hashCode picks a bucket', 1.3, ['hashcode', 'hash code', 'hash function', 'bucket*', 'index']), c('collision', 'Collisions', 1.2, ['collision*', 'linked list', 'chain*', 'tree*', 'red black', 'treeif*']), c('equals', 'equals() finds the key', 0.9, ['equals', 'equal keys', 'compares the key*', 'compare the key*', 'same key', 'key matches', 'matching key']), c('resize', 'Load factor and resizing', 1, ['load factor', 'resiz*', 'rehash*', 'capacity', '0.75', 'double*']), c('complexity', 'O(1) average', 0.8, ['o of 1', 'o 1', 'constant', 'average', 'worst case'])],
        tip: 'The key’s hashCode() picks a bucket in an array; colliding entries form a linked list that turns into a red-black tree past 8 entries; equals() finds the exact key. When size exceeds capacity × load factor (0.75) the table doubles and rehashes. O(1) on average.' }),
      tq({ id: 'be_gc', text: 'How does garbage collection work in Java?',
        concepts: [c('reach', 'Unreachable objects are freed', 1.3, ['no reference*', 'unreachable', 'not referenced', 'reachab*', 'roots', 'unused objects']), c('heap', 'Heap and generations', 1.1, ['heap', 'young generation', 'old generation', 'eden', 'survivor', 'generation*']), c('algos', 'Collectors', 0.9, ['mark and sweep', 'mark', 'sweep', 'g1', 'zgc', 'parallel', 'cms', 'compact*']), c('pauses', 'Pauses and leaks', 0.9, ['stop the world', 'pause*', 'memory leak*', 'static', 'tuning', 'out of memory'])],
        tip: 'The JVM frees objects no longer reachable from GC roots. The heap is generational: most objects die young in Eden and are collected cheaply; survivors move to the old generation. Collectors (G1, ZGC) mark, sweep and compact with short stop-the-world pauses. Leaks still happen through lingering references, like static collections.' }),
      tq({ id: 'be_race', text: 'What is a race condition, and how do you prevent one in Java?',
        concepts: [c('def', 'Concurrent access to shared data', 1.4, ['shared', 'same variable', 'same data', 'two threads', 'multiple threads', 'at the same time', 'concurrent*', 'order of execution']), c('sync', 'Locks and synchronized', 1.2, ['synchronized', 'lock*', 'mutex', 'reentrantlock', 'monitor']), c('atomic', 'Atomics and concurrent collections', 1, ['atomic*', 'atomicinteger', 'concurrenthashmap', 'concurrent collection*', 'volatile', 'compare and swap']), c('design', 'Avoid sharing', 0.8, ['immutab*', 'thread local', 'thread confinement', 'stateless', 'avoid shar*'])],
        tip: 'Two threads read and write shared data and the result depends on timing (count++ is read-modify-write). Prevent it with synchronized blocks or locks, atomic classes (AtomicInteger), concurrent collections (ConcurrentHashMap), or by avoiding shared mutable state (immutability).' }),
      tq({ id: 'be_spring', text: 'What does Spring Boot give you, and what is dependency injection?',
        concepts: [c('boot', 'Auto-configuration and starters', 1.1, ['auto config*', 'starter*', 'embedded', 'tomcat', 'convention', 'less configuration', 'quick*']), c('di', 'Dependency injection', 1.4, ['dependency injection', 'inversion of control', 'ioc', 'inject*', 'bean*', 'autowired', 'container', 'constructor injection']), c('why', 'Loose coupling and testing', 1, ['loose* coupl*', 'test*', 'mock*', 'swap', 'decoupl*']), c('annotations', 'Common annotations', 0.6, ['restcontroller', 'rest controller', 'service', 'repository', 'component', 'annotation*', 'actuator'])],
        tip: 'Spring Boot gives auto-configuration, starter dependencies, an embedded server and production features (Actuator). Dependency injection means the container creates beans and passes collaborators in (ideally via the constructor) instead of classes creating them, which keeps code loosely coupled and easy to test with mocks.' }),
      tq({ id: 'be_index', text: 'What is a database index, and when can an index hurt?',
        concepts: [c('def', 'Speeds up lookups', 1.3, ['faster', 'speed* up', 'lookup*', 'search*', 'like a book', 'index of a book', 'without scanning', 'full table scan']), c('structure', 'How it is stored', 0.9, ['b tree', 'btree', 'b plus', 'sorted', 'hash index']), c('cost', 'Costs: writes and storage', 1.3, ['slow* down writes', 'insert*', 'update*', 'write*', 'storage', 'space', 'maintain*']), c('choose', 'Choosing columns', 1, ['where clause', 'where', 'join*', 'order by', 'composite', 'selectiv*', 'cardinality', 'explain'])],
        tip: 'An index (usually a B-tree) lets the database find rows without scanning the whole table, like a book’s index. It costs storage and slows inserts and updates, so index the columns used in WHERE, JOIN and ORDER BY with good selectivity, mind composite-index column order, and check with EXPLAIN.' }),
      tq({ id: 'be_microservices', exp: 'experienced', text: 'When would you split a monolith into microservices, and what new problems does that bring?',
        concepts: [c('why', 'Reasons to split', 1.2, ['independent* deploy*', 'scale independently', 'teams', 'ownership', 'different scaling', 'fault isolation', 'technology']), c('boundaries', 'Service boundaries', 0.9, ['domain', 'bounded context', 'business capabilit*', 'boundar*']), c('comms', 'How services talk', 0.9, ['rest', 'grpc', 'messag*', 'kafka', 'queue*', 'event*', 'async*']), c('problems', 'New problems', 1.4, ['network', 'latency', 'distributed transaction*', 'consisten*', 'saga', 'monitor*', 'tracing', 'debugging', 'complexity', 'devops', 'failure*', 'timeout*', 'retry*']), c('notyet', 'When not to', 0.6, ['not always', 'small team', 'start with a monolith', 'modular monolith', 'premature'])],
        tip: 'Split when teams and parts of the system need to deploy and scale independently, along business boundaries (bounded contexts). The cost: network calls that fail, distributed data consistency (sagas), observability (tracing, central logs) and operational load. Small teams usually do better with a modular monolith first.' }),
    ],
    python: [
      tq({ id: 'py_collections', text: 'What is the difference between a list, a tuple, a set and a dictionary in Python?',
        concepts: [c('list', 'List: ordered, mutable', 1, ['list*', 'mutable', 'ordered', 'append']), c('tuple', 'Tuple: immutable', 1.1, ['tuple*', 'immutable', 'cannot change', 'can not change', 'fixed', 'hashable']), c('set', 'Set: unique, no order', 1, ['set*', 'unique', 'no duplicate*', 'unordered', 'membership']), c('dict', 'Dict: key to value', 1, ['dict*', 'key value', 'key and value', 'keys', 'lookup', 'mapping']), c('when', 'When to use which', 0.7, ['when', 'use case*', 'for example', 'fast lookup', 'o of 1', 'constant time'])],
        tip: 'List: ordered and mutable. Tuple: ordered and immutable (hashable, usable as a dict key). Set: unique items, no order, O(1) membership. Dict: key-to-value mapping with O(1) lookup, insertion-ordered since 3.7.' }),
      tq({ id: 'py_gil', text: 'What is the GIL in Python, and how does it affect multithreading?',
        concepts: [c('def', 'One thread runs Python bytecode at a time', 1.4, ['global interpreter lock', 'one thread at a time', 'only one thread', 'single thread', 'lock']), c('cpu', 'No speed-up for CPU-bound threads', 1.1, ['cpu bound', 'cpu', 'computation', 'parallel', 'no speed up', 'not truly parallel']), c('io', 'Threads still help for I/O', 1, ['io bound', 'i o bound', 'network', 'waiting', 'file', 'requests', 'released']), c('alternatives', 'Alternatives', 1, ['multiprocessing', 'process pool', 'asyncio', 'c extension*', 'numpy', 'free threaded', 'no gil', '3.13'])],
        tip: 'CPython’s Global Interpreter Lock lets only one thread execute Python bytecode at a time, so CPU-bound threads do not run in parallel; I/O-bound threads still help because the GIL is released while waiting. For CPU work use multiprocessing or C-backed libraries (NumPy); Python 3.13 adds an optional free-threaded build.' }),
      tq({ id: 'py_decorator', text: 'What is a decorator in Python? Where would you use one?',
        concepts: [c('def', 'Wraps another function', 1.4, ['wrap*', 'function that takes a function', 'takes a function', 'returns a function', 'higher order', 'modif*', 'without changing']), c('syntax', 'The @ syntax', 0.8, ['at the rate', 'at symbol', 'at sign', '@', 'above the function']), c('uses', 'Real uses', 1.2, ['logging', 'timing', 'auth*', 'cache', 'caching', 'lru cache', 'retry', 'route', 'login required', 'validation', 'property', 'staticmethod']), c('wraps', 'functools.wraps', 0.5, ['functools', 'wraps'])],
        tip: 'A decorator is a function that takes a function and returns a wrapped one, adding behaviour without changing it, applied with @. Uses: logging and timing, auth checks (@login_required), caching (@lru_cache), retries, routes (@app.get). Use functools.wraps to keep the name and docstring.' }),
      tq({ id: 'py_generator', text: 'What is a generator in Python, and why would you use one?',
        concepts: [c('yield', 'yield produces values lazily', 1.4, ['yield', 'lazy', 'lazily', 'one at a time', 'on demand', 'pause*', 'resume*']), c('memory', 'Saves memory', 1.2, ['memory', 'large file*', 'big data', 'stream*', 'does not store', 'not all at once', 'huge']), c('iterator', 'An iterator', 0.8, ['iterator', 'next', 'for loop', 'iterate', 'stopiteration']), c('expr', 'Generator expressions', 0.6, ['generator expression', 'parenthes*', 'brackets'])],
        tip: 'A generator function uses yield to produce values one at a time, pausing between them, so it does not build the whole result in memory: ideal for large files or streams (reading a 10 GB log line by line). It is an iterator; (x for x in …) is a generator expression.' }),
      tq({ id: 'py_copy', text: 'What is the difference between a shallow copy and a deep copy in Python?',
        concepts: [c('shallow', 'Shallow: new outer object, shared inner objects', 1.4, ['shallow', 'outer', 'top level', 'references', 'same inner', 'nested objects are shared', 'shared']), c('deep', 'Deep: copies everything', 1.3, ['deep copy', 'deepcopy', 'recursive*', 'everything', 'nested', 'independent']), c('example', 'An example', 1, ['list of lists', 'nested list', 'for example', 'dictionary', 'copy module', 'copy.copy', 'slicing'])],
        tip: 'A shallow copy (copy.copy, list[:]) makes a new outer object but shares the nested objects, so changing an inner list shows in both. A deep copy (copy.deepcopy) recursively copies everything, giving a fully independent object.' }),
      tq({ id: 'py_api', text: 'How would you build a REST API in Python? Which framework would you choose, and why?',
        concepts: [c('framework', 'A framework and why', 1.2, ['fastapi', 'flask', 'django', 'drf', 'django rest']), c('routes', 'Routes and validation', 1, ['route*', 'endpoint*', 'path*', 'validation', 'pydantic', 'serializer*', 'schema*']), c('db', 'Database layer', 0.9, ['orm', 'sqlalchemy', 'django orm', 'database', 'postgres*', 'migration*']), c('quality', 'Tests and docs', 0.8, ['test*', 'pytest', 'swagger', 'openapi', 'docs', 'documentation']), c('deploy', 'Running it', 0.7, ['uvicorn', 'gunicorn', 'docker', 'deploy*', 'async'])],
        tip: 'Pick by need: FastAPI (async, Pydantic validation, automatic OpenAPI docs), Flask (minimal), Django + DRF (batteries included, admin, ORM). Define routes and request models, use an ORM (SQLAlchemy) with migrations, test with pytest, and run with Uvicorn or Gunicorn in Docker.' }),
      tq({ id: 'py_testing', text: 'How do you test Python code?',
        concepts: [c('tools', 'pytest or unittest', 1.1, ['pytest', 'unittest', 'unit test*']), c('kinds', 'Unit and integration tests', 1, ['unit', 'integration', 'end to end', 'e2e', 'functional']), c('mocks', 'Fixtures and mocks', 1, ['mock*', 'patch*', 'fixture*', 'fake*', 'stub*']), c('edges', 'Edge cases', 0.8, EDGES), c('ci', 'Run automatically', 0.8, ['ci', 'pipeline', 'github actions', 'coverage', 'every commit', 'pre commit'])],
        tip: 'pytest with small unit tests for logic, integration tests for the database and APIs, fixtures for setup, mocks for external services, and explicit edge cases; run them in CI on every change and watch coverage.' }),
      tq({ id: 'py_concurrency', exp: 'experienced', text: 'When would you use asyncio, threads, or multiprocessing in Python?',
        concepts: [c('asyncio', 'asyncio for many I/O tasks', 1.3, ['asyncio', 'async', 'await', 'event loop', 'many connections', 'thousands', 'single thread']), c('threads', 'Threads for blocking I/O', 1, ['thread*', 'blocking io', 'blocking i o', 'io bound', 'i o bound', 'requests library']), c('mp', 'Processes for CPU work', 1.3, ['multiprocessing', 'process*', 'cpu bound', 'cpu', 'gil', 'parallel']), c('tradeoff', 'Trade-offs', 0.8, ['overhead', 'memory', 'shared state', 'serial*', 'pickl*', 'complex*', 'libraries'])],
        tip: 'asyncio for many concurrent I/O tasks on one thread (thousands of network calls); threads for blocking I/O libraries; multiprocessing for CPU-bound work, since the GIL stops threads running Python in parallel. Each adds overhead: process start-up and data pickling, or async-compatible libraries.' }),
    ],
    aiml: [
      tq({ id: 'ml_overfit', text: 'What is overfitting, and how do you prevent it?',
        concepts: [c('def', 'Learns noise, generalises badly', 1.4, ['memori*', 'noise', 'training data too well', 'too well', 'generali*', 'new data', 'unseen data']), c('detect', 'Spot it with validation', 1, ['validation', 'train* accuracy', 'test accuracy', 'gap', 'cross validation', 'learning curve*']), c('regularise', 'Regularisation', 1.1, ['regulari*', 'l1', 'l2', 'dropout', 'weight decay', 'penalt*']), c('more', 'Data and simpler models', 1, ['more data', 'augment*', 'simpler model', 'fewer features', 'early stopping', 'prun*', 'ensembl*'])],
        tip: 'Overfitting is when a model learns the training noise and fails on new data, visible as a gap between training and validation scores. Fix it with more or augmented data, regularisation (L1, L2, dropout), a simpler model or fewer features, early stopping, and cross-validation.' }),
      tq({ id: 'ml_metrics', text: 'When is accuracy a bad metric, and what would you use instead?',
        concepts: [c('imbalance', 'Imbalanced classes', 1.4, ['imbalanc*', 'rare', 'one percent', 'majority class', 'skewed', 'most of the data']), c('pr', 'Precision and recall', 1.3, ['precision', 'recall', 'f1', 'f one', 'confusion matrix', 'false positive*', 'false negative*']), c('auc', 'Curves', 0.8, ['auc', 'roc', 'pr curve', 'precision recall curve', 'threshold*']), c('business', 'Depends on the cost of errors', 1, ['cost', 'fraud', 'disease', 'cancer', 'spam', 'business', 'depends', 'missing a'])],
        tip: 'With imbalanced classes (1% fraud) predicting "never fraud" scores 99% accuracy. Use precision, recall and F1 from the confusion matrix, PR-AUC or ROC-AUC, and choose by the cost of errors: recall when missing a case is expensive (disease), precision when false alarms are (spam).' }),
      tq({ id: 'ml_leakage', text: 'Why do we split data into training, validation and test sets? And what is data leakage?',
        concepts: [c('roles', 'What each split is for', 1.3, ['train*', 'fit', 'validation', 'tune', 'hyperparameter*', 'model selection', 'test', 'final', 'unbiased']), c('leak', 'Leakage: information the model should not see', 1.4, ['leak*', 'information from the test', 'future data', 'target leak*', 'test data', 'should not have', 'not available at prediction']), c('example', 'An example', 1, ['scaling before', 'normali* before', 'before splitting', 'time series', 'duplicate*', 'same user', 'id column']), c('cv', 'Cross-validation', 0.6, ['cross validation', 'k fold', 'kfold'])],
        tip: 'Train fits the model, validation tunes hyperparameters and picks models, test gives one final unbiased estimate. Leakage is information in training that will not exist at prediction time: scaling on the full dataset before splitting, future data in time series, or the same user in both sets. It makes offline scores look too good.' }),
      tq({ id: 'ml_gd', text: 'Explain gradient descent and the role of the learning rate.',
        concepts: [c('loss', 'Minimise the loss', 1.1, ['loss', 'cost function', 'error', 'minimi*']), c('gradient', 'Step against the gradient', 1.4, ['gradient', 'derivative', 'slope', 'direction', 'downhill', 'steepest']), c('lr', 'Learning rate', 1.2, ['learning rate', 'step size', 'too large', 'too high', 'too small', 'diverge*', 'overshoot*', 'slow*', 'converge*']), c('variants', 'Variants', 0.8, ['stochastic', 'sgd', 'mini batch', 'batch', 'adam', 'momentum', 'rmsprop', 'schedule*'])],
        tip: 'Gradient descent minimises the loss by repeatedly moving the weights a small step against the gradient. The learning rate is the step size: too large overshoots or diverges, too small is slow. In practice: mini-batch SGD or Adam, often with a learning-rate schedule.' }),
      tq({ id: 'ml_attention', text: 'At a high level, how does attention work in a transformer?',
        concepts: [c('qkv', 'Queries, keys and values', 1.3, ['query', 'queries', 'key*', 'value*', 'q k v']), c('weights', 'Weights from similarity', 1.2, ['similarit*', 'dot product', 'softmax', 'weight*', 'score*', 'how relevant', 'relevan*']), c('context', 'Each token looks at the others', 1.1, ['other tokens', 'every token', 'all tokens', 'context', 'focus*', 'long range', 'depend*']), c('extras', 'Heads, positions, parallelism', 0.8, ['multi head', 'multiple heads', 'positional', 'position*', 'parallel', 'rnn', 'embedding*'])],
        tip: 'Each token makes a query, key and value; it scores every token by query-key similarity (scaled dot product), turns the scores into weights with softmax, and takes a weighted sum of values, so each token gathers context from the relevant ones. Multiple heads learn different relations, positional encodings add order, and it all runs in parallel, unlike RNNs.' }),
      tq({ id: 'ml_rag', text: "How would you build a chatbot that answers questions from a company's own documents using an LLM?",
        ideal: [60, 200], maxSeconds: 180,
        concepts: [c('rag', 'Retrieval-augmented generation', 1.2, ['rag', 'retriev*', 'retrieval augmented']), c('index', 'Chunk and embed the documents', 1.2, ['chunk*', 'embed*', 'vector*', 'vector database', 'pinecone', 'faiss', 'chroma', 'pgvector', 'index*']), c('prompt', 'Ground the prompt', 1, ['context', 'prompt', 'top k', 'relevant chunks', 'similarity search', 'semantic search']), c('quality', 'Evaluate and prevent hallucination', 1.1, ['hallucinat*', 'evaluat*', 'citation*', 'source*', 'guardrail*', 'test set', 'accuracy', 'feedback', 'i do not know']), c('ops', 'Keep it fresh and safe', 0.6, ['update*', 're index', 'permission*', 'access control', 'pii', 'cost', 'latency'])],
        tip: 'Retrieval-augmented generation: split documents into chunks, embed them into a vector store, retrieve the most relevant chunks for each question and put them in the prompt with instructions to answer only from them and cite sources. Evaluate with a test set, guard against hallucination, respect permissions, and re-index as documents change.' }),
      tq({ id: 'ml_imbalance', text: 'How would you handle a dataset where only one percent of the examples are positive?',
        concepts: [c('resample', 'Resampling', 1.1, ['oversampl*', 'undersampl*', 'smote', 'resampl*', 'downsampl*', 'upsampl*']), c('weights', 'Class weights', 1.1, ['class weight*', 'weighted loss', 'cost sensitive', 'penali*', 'focal loss']), c('metrics', 'The right metrics', 1.3, ['precision', 'recall', 'f1', 'pr auc', 'auc', 'not accuracy']), c('threshold', 'Tune the threshold', 0.9, ['threshold', 'decision boundary', 'probabilit*', 'calibrat*']), c('data', 'More data or another framing', 0.6, ['more data', 'collect*', 'anomaly detection', 'stratif*'])],
        tip: 'Measure with precision, recall and PR-AUC rather than accuracy; rebalance with class weights or resampling (SMOTE, undersampling) applied only to the training split; tune the decision threshold for the business cost; stratify splits; and consider anomaly detection or collecting more positives.' }),
      tq({ id: 'ml_tabular', text: 'Walk me through how you would approach a new tabular prediction problem, from raw data to a model.',
        ideal: [60, 200], maxSeconds: 180,
        concepts: [c('frame', 'Frame the problem and metric', 1, ['metric', 'objective', 'business', 'target', 'classification', 'regression']), c('eda', 'Explore and clean', 1.1, ['eda', 'explor*', 'missing values', 'outlier*', 'clean*', 'distribution*']), c('features', 'Feature engineering', 1.1, ['feature*', 'encod*', 'one hot', 'scal*', 'normali*', 'aggregat*']), c('baseline', 'Baseline then stronger models', 1.1, ['baseline', 'logistic regression', 'linear', 'random forest', 'xgboost', 'lightgbm', 'gradient boost*']), c('validate', 'Validate and iterate', 1, ['cross validation', 'validation', 'tune', 'hyperparameter*', 'error analysis', 'iterat*'])],
        tip: 'Define the target and metric with the business, explore and clean (missing values, outliers, leakage), engineer and encode features, start with a simple baseline (logistic regression), move to gradient boosting (XGBoost, LightGBM), validate with cross-validation, analyse errors and iterate.' }),
      tq({ id: 'ml_prod_drop', exp: 'experienced', text: 'Your model scored well offline but performs badly in production. What could be going on, and what would you check?',
        concepts: [c('drift', 'Data drift', 1.3, ['drift', 'distribution shift', 'data changed', 'different data', 'covariate', 'seasonal*']), c('skew', 'Training-serving skew', 1.3, ['skew', 'training serving', 'features differ*', 'different preprocessing', 'pipeline mismatch', 'feature computed differently']), c('leak', 'Leaky offline evaluation', 1, ['leak*', 'offline evaluation', 'test set', 'not representative', 'overfit*']), c('check', 'What you would check', 1.1, ['monitor*', 'log*', 'compare distribution*', 'feature values', 'dashboard*', 'slice*', 'segment*']), c('fix', 'Fixes', 0.8, ['retrain*', 'fresh data', 'a b test', 'shadow', 'feedback loop*'])],
        tip: 'Suspects: data drift (inputs changed), training-serving skew (features computed differently live), or offline leakage that inflated the scores. Compare live and training feature distributions, log predictions by segment, check the feature pipelines match, then retrain on recent data and validate with shadow or A/B tests.' }),
    ],
    data: [
      tq({ id: 'da_cleaning', text: 'What steps do you take to clean a messy dataset before analysis?',
        concepts: [c('missing', 'Missing values', 1.1, ['missing', 'null*', 'blank*', 'impute*', 'fill*', 'drop*']), c('dupes', 'Duplicates', 1, ['duplicat*', 'dedup*']), c('types', 'Types and formats', 1, ['data type*', 'format*', 'dates', 'standardi*', 'consisten*', 'trim*', 'case']), c('outliers', 'Outliers and validation', 1, ['outlier*', 'extreme', 'invalid', 'validat*', 'range*', 'sanity check*']), c('document', 'Document it', 0.6, ['document*', 'log the changes', 'reproduc*', 'script', 'notes'])],
        tip: 'Check missing values (impute or drop, deliberately), remove duplicates, fix types and formats (dates, categories, case, whitespace), investigate outliers rather than deleting them blindly, validate against known totals, and keep the steps in a script so they are reproducible.' }),
      tq({ id: 'da_ab', text: 'How would you run and analyse an A/B test?',
        concepts: [c('hypothesis', 'Hypothesis and metric', 1.1, ['hypothes*', 'metric', 'success metric', 'primary metric', 'conversion']), c('random', 'Random split, control and treatment', 1.2, ['random*', 'control', 'treatment', 'variant', 'group a', 'group b', 'split']), c('size', 'Sample size and duration', 1, ['sample size', 'power', 'duration', 'how long', 'enough users', 'minimum detectable']), c('stats', 'Statistical significance', 1.2, ['significan*', 'p value', 'confidence interval', 't test', 'chi square', 'statistical*']), c('pitfalls', 'Pitfalls and guardrails', 0.7, ['peek*', 'novelty', 'guardrail*', 'multiple testing', 'segment*', 'sample ratio'])],
        tip: 'State a hypothesis and one primary metric, randomise users into control and treatment, compute the sample size and run for full weeks, then test significance (p-value and confidence interval). Watch guardrail metrics, do not peek and stop early, and beware novelty effects.' }),
      tq({ id: 'da_charts', text: 'How do you choose the right chart for your data?',
        concepts: [c('compare', 'Comparison: bars', 1, ['bar chart*', 'bar*', 'compar*', 'categor*']), c('trend', 'Over time: lines', 1, ['line chart*', 'line', 'over time', 'trend*', 'time series']), c('dist', 'Distribution', 0.9, ['histogram*', 'box plot*', 'distribution']), c('rel', 'Relationship: scatter', 0.9, ['scatter*', 'correlation', 'relationship']), c('audience', 'Clarity for the audience', 1, ['audience', 'simple', 'label*', 'clear*', 'story', 'message', 'avoid pie', 'colour', 'color'])],
        tip: 'Start from the question: bars to compare categories, lines for trends over time, histograms or box plots for distributions, scatter plots for relationships; use pie charts sparingly. Label clearly and design for the audience and the one message you want them to take away.' }),
      tq({ id: 'da_tools', text: 'Which tools do you use for analysis and dashboards, and why?',
        concepts: [c('sql', 'SQL', 1.1, ['sql', 'query', 'queries']), c('excel', 'Excel or Sheets', 0.9, ['excel', 'sheets', 'pivot*', 'vlookup', 'xlookup', 'formula*']), c('bi', 'A BI tool', 1, ['power bi', 'tableau', 'looker', 'metabase', 'superset', 'dashboard*']), c('python', 'Python or R', 0.9, ['python', 'pandas', 'jupyter', 'notebook*', ' r ']), c('why', 'Why each', 0.9, ['because', 'when', 'for large', 'automat*', 'refresh*', 'share', 'stakeholder*'])],
        tip: 'SQL to pull and shape data, Excel for quick pivots, Python (pandas) for heavier analysis and automation, and a BI tool (Power BI, Tableau, Looker) for shared, refreshing dashboards. Say when you reach for each.' }),
      tq({ id: 'da_groupby', text: 'What is the difference between WHERE and HAVING in SQL?',
        concepts: [c('where', 'WHERE filters rows before grouping', 1.4, ['before group*', 'individual rows', 'rows', 'before aggregat*']), c('having', 'HAVING filters groups after aggregation', 1.4, ['after group*', 'groups', 'after aggregat*', 'aggregate*', 'count', 'sum']), c('example', 'An example', 1, ['for example', 'customers with more than', 'more than', 'count star', 'total*', 'department*'])],
        tip: 'WHERE filters individual rows before GROUP BY; HAVING filters groups after aggregation. Example: WHERE status = "paid" … GROUP BY customer HAVING COUNT(*) > 5 for customers with more than five paid orders.' }),
    ],
    devops: [
      tq({ id: 'do_docker_vm', text: 'What is the difference between a container and a virtual machine?',
        concepts: [c('kernel', 'Containers share the host kernel', 1.4, ['share* the kernel', 'host kernel', 'same kernel', 'shared kernel', 'os level', 'process isolation']), c('vm', 'VMs run a full OS on a hypervisor', 1.3, ['full os', 'own os', 'guest os', 'operating system', 'hypervisor', 'hardware']), c('weight', 'Lighter and faster', 1, ['lightweight', 'light', 'faster', 'start in seconds', 'smaller', 'less overhead']), c('isolation', 'Isolation trade-off and images', 0.8, ['isolation', 'security', 'image*', 'dockerfile', 'layer*', 'portab*'])],
        tip: 'Containers isolate processes but share the host kernel, so they are small and start in seconds; VMs virtualise hardware with a hypervisor and run a full guest OS, heavier but with stronger isolation. Containers are built from layered images defined in a Dockerfile.' }),
      tq({ id: 'do_k8s', text: 'What does Kubernetes do, and what are pods, deployments and services?',
        concepts: [c('orchestrate', 'Orchestration', 1.1, ['orchestrat*', 'schedul*', 'scal*', 'self heal*', 'restart*', 'cluster']), c('pod', 'Pod', 1.1, ['pod*', 'smallest unit', 'one or more containers']), c('deployment', 'Deployment', 1.1, ['deployment*', 'replica*', 'rolling update*', 'desired state']), c('service', 'Service', 1.1, ['service*', 'stable', 'ip', 'dns', 'load balanc*', 'expose*']), c('extras', 'Ingress and config', 0.6, ['ingress', 'config map*', 'configmap', 'secret*', 'namespace*', 'helm'])],
        tip: 'Kubernetes keeps containers in a desired state across a cluster: scheduling, scaling and self-healing. A Pod is the smallest unit (one or more containers); a Deployment manages replicas and rolling updates; a Service gives pods a stable address and load-balances them; Ingress, ConfigMaps and Secrets handle routing and configuration.' }),
      tq({ id: 'do_cicd', text: 'What is CI/CD, and what should a good pipeline include?',
        concepts: [c('ci', 'Continuous integration', 1.2, ['continuous integration', 'merge often', 'every commit', 'automat* build', 'automat* test*']), c('cd', 'Continuous delivery or deployment', 1, ['continuous deliver*', 'continuous deploy*', 'automat* deploy*', 'release']), c('stages', 'Stages', 1.2, ['lint*', 'unit test*', 'build', 'scan*', 'security', 'staging', 'artifact*', 'image']), c('safety', 'Approvals and rollback', 0.8, ['rollback', 'roll back', 'approval*', 'gate*', 'canary', 'blue green']), c('tools', 'Tools', 0.6, ['jenkins', 'github actions', 'gitlab', 'circleci', 'argo*', 'azure devops'])],
        tip: 'CI builds and tests every change automatically so problems surface early; CD takes the tested artifact to staging and production automatically. A good pipeline: lint, unit tests, build a versioned image, security scan, deploy to staging, smoke tests, then production with a safe strategy and easy rollback.' }),
      tq({ id: 'do_monitoring', text: 'How would you monitor a production service?',
        concepts: [c('metrics', 'Metrics', 1.2, ['metric*', 'latency', 'error rate', 'throughput', 'cpu', 'memory', 'requests per second', 'golden signals', 'saturation']), c('logs', 'Central logs', 1, ['log*', 'elk', 'elasticsearch', 'loki', 'splunk', 'centrali*']), c('traces', 'Tracing', 0.7, ['trac*', 'jaeger', 'opentelemetry', 'distributed']), c('alerts', 'Alerts and SLOs', 1.2, ['alert*', 'slo*', 'sla*', 'on call', 'pager*', 'threshold*']), c('tools', 'Dashboards and tools', 0.6, ['grafana', 'prometheus', 'datadog', 'cloudwatch', 'new relic', 'dashboard*'])],
        tip: 'Watch the golden signals (latency, traffic, errors, saturation) as metrics (Prometheus, Grafana), centralise logs, add distributed tracing (OpenTelemetry), and alert on user-facing SLOs rather than every CPU spike, with an on-call rotation and runbooks.' }),
      tq({ id: 'do_iac', text: 'What is infrastructure as code, and why use it?',
        concepts: [c('def', 'Infrastructure defined in code', 1.3, ['code', 'config* files', 'declarative', 'define*', 'terraform', 'cloudformation', 'pulumi', 'ansible', 'bicep']), c('version', 'Version control and review', 1, ['version control', 'git', 'review*', 'pull request', 'history']), c('repeat', 'Repeatable environments', 1.2, ['repeatab*', 'consisten*', 'same environment', 'reproduc*', 'staging', 'automat*', 'no manual']), c('state', 'State and drift', 0.7, ['state', 'drift', 'plan', 'apply'])],
        tip: 'Infrastructure as code describes servers, networks and services in versioned files (Terraform, CloudFormation, Pulumi) instead of clicking in a console: changes are reviewed in pull requests, environments are reproducible and consistent, and tools like terraform plan show changes before they happen and catch drift.' }),
      tq({ id: 'do_disk_full', text: "A server's disk is full and the application is failing. What do you do?",
        concepts: [c('find', 'Find what fills it', 1.3, ['df', 'du', 'disk usage', 'largest', 'biggest', 'ncdu', 'find']), c('clean', 'Free space safely', 1.2, ['log*', 'rotate', 'logrotate', 'old', 'temp*', 'tmp', 'cache', 'docker prune', 'prune', 'delete*', 'compress*', 'deleted but open', 'lsof']), c('restore', 'Restore service', 0.8, ['restart*', 'service', 'recover*']), c('prevent', 'Prevent it', 1.1, ['monitor*', 'alert*', 'log rotation', 'retention', 'expand*', 'resize', 'bigger volume'])],
        tip: 'Find what is using space (df -h, then du or ncdu), free it safely (rotate and compress logs, clear temp files and old images, check lsof for deleted files still held open), restore the service, then prevent it: log rotation and retention, disk alerts, and a bigger volume if needed.' }),
    ],
  };
  for (const role of Object.keys(CORE)) {
    for (const q of CORE[role]) {
      q.slot = 'tcore';
      q.type = 'tech';
      q.roles = q.roles || [role];
      QUESTIONS.push(q);
    }
  }
  // A full-stack developer is also asked frontend and backend fundamentals.
  for (const id of ['fe_rerender', 'fe_event_loop', 'fe_perf', 'be_index', 'py_api']) {
    const q = QUESTIONS.find((x) => x.id === id);
    if (q && q.roles.indexOf('fullstack') === -1) q.roles = q.roles.concat('fullstack');
  }
  for (const id of ['be_index', 'be_race']) {
    const q = QUESTIONS.find((x) => x.id === id);
    if (q && q.roles.indexOf('python') === -1) q.roles = q.roles.concat('python');
  }
  QUESTIONS.find((x) => x.id === 'py_testing').roles.push('aiml');

  const STAGES = {
    tintro: 'Introduction',
    tproject: 'Projects',
    tthink: 'Thought Process',
    tvalues: 'Values & Fit',
    twhy: 'Motivation & Fit',
    tflex: 'Flexibility',
    tcs: 'CS Fundamentals',
    tcore: 'Technical Fundamentals',
    tproblem: 'Problem Solving',
    tlld: 'Object-Oriented Design',
    tdesign: 'System Design',
    tpractical: 'Practical Engineering',
  };

  // How each technical question type informs the skill scores.
  const TYPE_DIMS = {
    tech: { technical: 2, thought: 0.8, relevance: 0.8, communication: 0.6, confidence: 0.6 },
    problem: { technical: 1.6, thought: 1.8, relevance: 0.6, communication: 0.6, confidence: 0.6 },
    design: { technical: 1.6, thought: 1.6, relevance: 0.8, communication: 0.7, confidence: 0.7 },
    project: { technical: 0.8, thought: 1.2, relevance: 1, communication: 1, confidence: 1, attitude: 0.5 },
    thinking: { thought: 1.8, communication: 1, confidence: 0.8, relevance: 1, attitude: 0.3 },
  };

  const api = { ROLES, COMPANIES, KINDS, ROUNDS, QUESTIONS, STAGES, TYPE_DIMS, PLAN_LABELS, MINUTES, DEPTH, slotsFor };
  if (isNode) module.exports = api;
  else (root.AII = root.AII || {}).TechBank = api;
})(typeof window !== 'undefined' ? window : globalThis);
