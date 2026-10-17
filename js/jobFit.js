/*
 * jobFit.js — tailor an interview to a pasted job description. It finds what the job asks
 * for (engineering skills, or the kind of BPO process), steers each question slot towards
 * questions about those things, and adds one question built from the job's top asks.
 * Everything runs on this device; the text is never sent anywhere.
 */
(function (root) {
  'use strict';
  const isNode = typeof module === 'object' && module.exports;
  const Text = isNode ? require('./textUtils.js') : root.AII.Text;

  // Engineering skills, with the ways job descriptions name them.
  const SKILLS = [
    { id: 'react', label: 'React', terms: ['react', 'reactjs', 'react js', 'next js', 'nextjs', 'redux'] },
    { id: 'frontend', label: 'JavaScript & TypeScript', terms: ['javascript', 'typescript', 'html', 'css', 'angular', 'vue', 'frontend', 'front end'] },
    { id: 'node', label: 'Node.js', terms: ['node', 'nodejs', 'node js', 'express', 'nestjs'] },
    { id: 'java', label: 'Java & Spring', terms: ['java', 'spring', 'spring boot', 'hibernate', 'jvm', 'j2ee'] },
    { id: 'python', label: 'Python', terms: ['python', 'django', 'flask', 'fastapi', 'pandas', 'numpy'] },
    { id: 'sql', label: 'SQL databases', terms: ['sql', 'mysql', 'postgres', 'postgresql', 'oracle', 'rdbms', 'relational', 'database*'] },
    { id: 'nosql', label: 'NoSQL & caching', terms: ['nosql', 'mongodb', 'mongo', 'dynamodb', 'cassandra', 'redis', 'elasticsearch'] },
    { id: 'api', label: 'REST APIs', terms: ['rest', 'restful', 'api', 'apis', 'graphql', 'grpc'] },
    { id: 'microservices', label: 'Microservices & messaging', terms: ['microservice*', 'distributed', 'kafka', 'rabbitmq', 'event driven', 'message queue*'] },
    { id: 'cloud', label: 'Cloud (AWS, Azure, GCP)', terms: ['aws', 'azure', 'gcp', 'google cloud', 'cloud', 'ec2', 's3', 'lambda'] },
    { id: 'containers', label: 'Docker & Kubernetes', terms: ['docker', 'kubernetes', 'k8s', 'container*', 'helm'] },
    { id: 'cicd', label: 'CI/CD & DevOps', terms: ['ci cd', 'cicd', 'jenkins', 'github actions', 'gitlab', 'devops', 'terraform', 'ansible', 'deployment pipeline*', 'build pipeline*', 'argo*'] },
    { id: 'testing', label: 'Testing', terms: ['unit test*', 'testing', 'jest', 'pytest', 'junit', 'tdd', 'selenium', 'cypress'] },
    { id: 'ml', label: 'Machine learning', terms: ['machine learning', 'ml', 'scikit', 'sklearn', 'xgboost', 'tensorflow', 'pytorch', 'deep learning', 'model training'] },
    { id: 'genai', label: 'LLMs & GenAI', terms: ['llm', 'llms', 'genai', 'gen ai', 'generative ai', 'rag', 'langchain', 'prompt engineering', 'openai', 'transformer*', 'nlp', 'vector database*'] },
    { id: 'data', label: 'Data analysis & BI', terms: ['excel', 'power bi', 'tableau', 'dashboard*', 'analytics', 'a b test*', 'statistic*', 'looker'] },
    { id: 'system', label: 'System design & scale', terms: ['system design', 'scalab*', 'high availability', 'low latency', 'high traffic', 'performance'] },
    { id: 'security', label: 'Security & auth', terms: ['security', 'oauth', 'authentication', 'authorization', 'jwt', 'owasp'] },
    { id: 'dsa', label: 'Data structures & algorithms', terms: ['data structure*', 'algorithm*', 'dsa', 'problem solving', 'competitive programming'] },
  ];

  // BPO and customer-service roles: the kind of process and what it demands.
  const SIGNALS = [
    { id: 'intl', label: 'International process', terms: ['international', 'us process', 'uk process', 'australian process', 'global customers', 'overseas'] },
    { id: 'shifts', label: 'Night & rotational shifts', terms: ['night shift*', 'rotational', 'rotating shift*', '24 7', '24x7', 'us shift*', 'uk shift*', 'weekend*'] },
    { id: 'voice', label: 'Voice process & calls', terms: ['voice process', 'inbound', 'outbound', 'calls', 'call center', 'call centre', 'telecaller', 'phone'] },
    { id: 'chat', label: 'Chat & email support', terms: ['chat', 'email support', 'non voice', 'ticket*', 'written communication', 'typing speed'] },
    { id: 'sales', label: 'Sales & targets', terms: ['sales', 'sales target*', 'revenue target*', 'telesales', 'selling', 'upsell*', 'cross sell*', 'collections', 'lead generation', 'incentive*', 'conversion*'] },
    { id: 'tech', label: 'Technical support', terms: ['technical support', 'tech support', 'troubleshoot*', 'it support', 'helpdesk', 'help desk'] },
    { id: 'english', label: 'Excellent English', terms: ['fluent english', 'excellent communication', 'communication skills', 'versant', 'good english', 'english speaking'] },
    { id: 'crm', label: 'CRM tools', terms: ['crm', 'salesforce', 'zendesk', 'freshdesk', 'ms office', 'computer skills'] },
    { id: 'kpi', label: 'Quality & KPIs', terms: ['aht', 'csat', 'nps', 'quality score*', 'kpi*', 'sla*', 'first call resolution', 'fcr'] },
    { id: 'empathy', label: 'Customer empathy', terms: ['customer satisfaction', 'customer experience', 'empath*', 'patience', 'customer first', 'customer centric'] },
  ];

  // How each ask is said out loud (labels are for the chips on screen).
  const SAY = {
    react: 'React',
    frontend: 'JavaScript and TypeScript',
    node: 'Node.js',
    java: 'Java and Spring',
    python: 'Python',
    sql: 'SQL databases',
    nosql: 'NoSQL databases and caching',
    api: 'REST APIs',
    microservices: 'microservices and messaging',
    cloud: 'the cloud, like AWS, Azure or GCP',
    containers: 'Docker and Kubernetes',
    cicd: 'CI/CD pipelines',
    testing: 'automated testing',
    ml: 'machine learning',
    genai: 'LLMs and generative AI',
    data: 'data analysis and dashboards',
    system: 'system design at scale',
    security: 'security and authentication',
    dsa: 'data structures and algorithms',
    intl: 'an international process',
    shifts: 'night or rotational shifts',
    voice: 'handling customer calls',
    chat: 'chat and email support',
    sales: 'meeting sales targets',
    tech: 'technical troubleshooting',
    english: 'excellent spoken English',
    crm: 'working with CRM tools',
    kpi: 'meeting quality targets like AHT and CSAT',
    empathy: 'real empathy for customers'
  };
  // Areas of practice rather than tools: never the subject of "your hands-on experience with…".
  const PRACTICE = new Set(['system', 'dsa', 'security', 'testing']);

  const byId = {};
  for (const s of SKILLS.concat(SIGNALS)) byId[s.id] = s;

  /**
   * What a job description asks for: { track, skills: [{ id, label }] } in the order the job
   * first mentions them (job ads lead with the core asks), at most 8; null for an empty text.
   */
  function read(text, track) {
    const doc = Text.makeDoc(String(text || ''));
    if (!doc.str) return null;
    const pool = track === 'tech' ? SKILLS : SIGNALS;
    const found = pool.map((s, i) => {
      const hits = Text.findTerms(doc, s.terms);
      return { s, i, n: hits.length, at: hits.length ? hits[0].w0 : Infinity };
    })
      .filter((x) => x.n > 0)
      .sort((a, b) => a.at - b.at || b.n - a.n || a.i - b.i)
      .slice(0, 8)
      .map((x) => ({ id: x.s.id, label: x.s.label }));
    return { track: track === 'tech' ? 'tech' : 'bpo', skills: found };
  }

  /** Every way the job's asks can be said, for matching questions. */
  function termsOf(job) {
    const out = [];
    for (const s of (job && job.skills) || []) if (byId[s.id]) out.push.apply(out, byId[s.id].terms);
    return out;
  }

  // A question's own words, plus the words its rubric listens for (cached per question).
  const docCache = new Map();
  function questionDoc(q) {
    if (!docCache.has(q.id)) {
      const words = [q.text].concat((q.concepts || []).map((c) => (c.terms || []).filter((t) => !/^re:/.test(t)).map((t) => t.replace(/\*/g, '')).join(' '))).join(' . ');
      docCache.set(q.id, Text.makeDoc(words));
    }
    return docCache.get(q.id);
  }

  /** How many of the job's skills a question is about. */
  function relevance(q, job) {
    let n = 0;
    for (const s of (job && job.skills) || []) {
      const def = byId[s.id];
      if (def && Text.hasAny(questionDoc(q), def.terms)) n++;
    }
    return n;
  }

  /** The question built from the job's top asks (id 'jd_fit'), or null. */
  function question(job) {
    const skills = ((job && job.skills) || []).filter((s) => byId[s.id]);
    if (!skills.length) return null;
    const say = (s) => SAY[s.id] || s.label;
    if (job.track === 'tech') {
      const top = skills.find((s) => !PRACTICE.has(s.id)) || skills[0];
      const asks = [top].concat(skills.filter((s) => s !== top)).slice(0, 2).map(say);
      return {
        id: 'jd_fit', slot: 'tproject', type: 'project', track: 'tech', job: true,
        text: 'The job description asks for ' + asks.join(', plus ') + '. Tell me about your hands-on experience with ' + say(top) + ': what you built with it, the hardest part, and the result.',
        minWords: 40, ideal: [70, 200], maxSeconds: 160, coverageTarget: 0.6,
        concepts: [
          { id: 'skill', label: 'Used ' + say(top), weight: 1.3, terms: byId[top.id].terms },
          { id: 'mine', label: 'Your own part', weight: 1.1, terms: ['i built', 'i wrote', 'i designed', 'i implemented', 'i developed', 'i created', 'i used', 'i set up', 'i worked on', 'i migrated'] },
          { id: 'challenge', label: 'The hardest part', weight: 1, terms: ['challeng*', 'difficult*', 'hard*', 'problem', 'issue*', 'bug*', 'stuck', 'tricky'] },
          { id: 'outcome', label: 'The result', weight: 1, terms: ['result*', 'finally', 'in the end', 'improved', 'reduced', 'increased', 'deployed', 'shipped', 'launched', 'users', 're:\\d+ ?(?:percent|%|users|ms|seconds|x)'] },
        ],
        followUps: [{ when: 'missing:outcome', text: 'What was the result, ideally with a number?' }, { when: 'short', text: 'Tell me more about the part you built yourself.' }],
        tip: 'Mirror the job description: name the exact skill, say what you built with it yourself, one hard problem you solved, and a measurable result.',
      };
    }
    return {
      id: 'jd_fit', slot: 'motivation', type: 'motivation', job: true,
      text: 'This role asks for ' + skills.slice(0, 2).map(say).join(', plus ') + '. How do you match that? Give me one real example.',
      minWords: 35, ideal: [60, 170], maxSeconds: 130, coverageTarget: 0.6,
      concepts: [
        { id: 'match', label: 'Connects to what the role asks', weight: 1.3, terms: termsOf({ skills: skills.slice(0, 3) }) },
        { id: 'example', label: 'A real example', weight: 1.2, terms: ['for example', 'for instance', 'once', 'when i', 'in my last', 'last year', 'during', 'at my'] },
        { id: 'strength', label: 'Your strengths for it', weight: 1, terms: ['i am good at', 'my strength*', 'i can', 'i have', 'comfortable', 'experience', 'skill*'] },
        { id: 'commit', label: 'Commitment', weight: 0.8, terms: ['ready', 'willing', 'committed', 'happy to', 'comfortable with', 'i will', 'flexible'] },
      ],
      followUps: [{ when: 'missing:example', text: 'Can you give me one specific example of that?' }],
      tip: 'Take the two biggest asks in the job description, say plainly that you meet them, and prove it with one short, real example.',
    };
  }

  // Which role a job is for, from the asks each role is about.
  const ROLE_ASKS = {
    tech: {
      fullstack: ['react', 'frontend', 'node', 'api', 'sql', 'nosql'],
      frontend: ['react', 'frontend'],
      backend: ['java', 'microservices', 'sql', 'api', 'nosql'],
      python: ['python', 'api', 'testing'],
      aiml: ['ml', 'genai'],
      data: ['data', 'sql'],
      devops: ['containers', 'cicd', 'cloud'],
    },
    bpo: { nonvoice: ['chat'], sales: ['sales'], tech: ['tech'], voice: ['voice', 'intl', 'english', 'kpi'] },
  };

  /** The role a job description reads like (a key of the role list), or null when unclear. */
  function suggestRole(job) {
    const skills = (job && job.skills) || [];
    if (!skills.length) return null;
    // BPO: a specialised process (sales, chat, technical support) wins over a general voice one.
    if (job.track !== 'tech') {
      const special = skills.find((s) => s.id === 'sales' || s.id === 'chat' || s.id === 'tech');
      if (special) return { sales: 'sales', chat: 'nonvoice', tech: 'tech' }[special.id];
    }
    const roles = ROLE_ASKS[job.track === 'tech' ? 'tech' : 'bpo'];
    // Earlier asks weigh more: job ads lead with what matters most.
    const weight = (i) => 1 / (1 + 0.3 * i);
    let best = null;
    for (const [role, asks] of Object.entries(roles)) {
      let score = 0;
      skills.forEach((s, i) => { if (asks.indexOf(s.id) !== -1) score += weight(i); });
      // Full-stack needs both sides; frontend alone is the frontend role.
      if (role === 'fullstack') {
        const front = skills.some((s) => s.id === 'react' || s.id === 'frontend');
        const back = skills.some((s) => ['node', 'api', 'sql', 'nosql', 'java', 'python'].indexOf(s.id) !== -1);
        if (!front || !back) score = 0;
      }
      if (!best || score > best.score) best = { role, score };
    }
    return best && best.score >= 0.9 ? best.role : null;
  }

  const api = { SKILLS, SIGNALS, read, termsOf, relevance, question, suggestRole };
  if (isNode) module.exports = api;
  else (root.AII = root.AII || {}).JobFit = api;
})(typeof window !== 'undefined' ? window : globalThis);
