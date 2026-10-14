/*
 * questionBank.js — everything the interviewer can ask, and how answers are judged.
 *
 * Each question carries its own rubric:
 *   concepts      ideas a strong answer usually covers (with synonyms); relevance
 *                 = weighted coverage of these, scaled by coverageTarget
 *   minWords      below this the answer counts as "too short" (may trigger a follow-up)
 *   ideal         [lo, hi] word range for a complete answer
 *   followUps     adaptive probes, tried in order; at most one per question:
 *                 short | noExample | dontKnow | redFlag | missing:<conceptId>
 *   tip           what a strong answer looks like (shown in the scoresheet)
 *   roles / exp   who the question is for (omit = everyone)
 *
 * The interview "plan" is a list of slots; each slot draws one eligible question.
 * Add your own questions by copying an entry and giving it an unused id.
 */
(function (root) {
  'use strict';
  const isNode = typeof module === 'object' && module.exports;

  const ROLES = {
    voice: { label: 'Customer Support (Voice)', short: 'Customer Support', checklist: 'support' },
    tech: { label: 'Technical Support (Voice)', short: 'Technical Support', checklist: 'support' },
    sales: { label: 'Sales / Telecalling (Outbound)', short: 'Sales', checklist: 'sales' },
    nonvoice: { label: 'Chat & Email Support (Non-voice)', short: 'Chat Support', checklist: 'support' },
    general: { label: 'General BPO / Fresher Hiring', short: 'BPO Associate', checklist: 'support' },
  };

  const STAGES = {
    intro: 'Introduction',
    background: 'Background',
    background2: 'Background',
    motivation: 'Motivation & Fit',
    why_hire: 'Motivation & Fit',
    knowledge: 'Role Knowledge',
    knowledge2: 'Role Knowledge',
    situational: 'Situational Judgement',
    situational2: 'Situational Judgement',
    behavioral: 'Past Experience',
    roleplay: 'Mock Call',
    listening: 'English & Listening',
    correction: 'English & Listening',
    extempore: 'Speaking Exercise',
    topic: 'Topic Talk',
    livecall: 'Live Call',
    shifts: 'Flexibility',
    self: 'Self-awareness',
    future: 'Self-awareness',
    salary: 'Expectations',
    closing: 'Closing',
  };

  const PLANS = {
    quick: {
      label: 'Quick screen',
      minutes: '8–10',
      slots: ['intro', 'motivation', 'situational', 'roleplay', 'listening', 'shifts', 'closing'],
    },
    standard: {
      label: 'Standard interview',
      minutes: '18–22',
      slots: ['intro', 'background', 'motivation', 'why_hire', 'knowledge', 'situational', 'behavioral',
        'roleplay', 'listening', 'correction', 'shifts', 'self', 'future', 'closing'],
    },
    // Four rounds, each testing one thing in depth. A slot starting with "=" is one fixed question.
    assessment: {
      label: '4-round assessment',
      minutes: '10–12',
      slots: ['intro', '=why_bpo', 'topic', 'livecall'],
      rounds: [
        { title: 'Introduction', focus: 'Flow, confidence and pauses' },
        { title: 'Why BPO', focus: 'A genuine, specific reason' },
        { title: 'Topic talk', focus: 'Thought process on a random word' },
        { title: 'Live call', focus: 'Handling a real customer' },
      ],
      maxFollowUps: 0,
    },
    full: {
      label: 'Full assessment',
      minutes: '30–35',
      slots: ['intro', 'background', 'background2', 'motivation', 'why_hire', 'knowledge', 'knowledge2',
        'situational', 'situational2', 'behavioral', 'behavioral', 'roleplay', 'listening', 'correction',
        'correction', 'extempore', 'shifts', 'self', 'future', 'salary', 'closing'],
    },
  };

  // How much each question type informs each scoring dimension.
  const TYPE_DIMS = {
    open: { communication: 1.2, confidence: 1.2, thought: 0.8, relevance: 1, attitude: 0.5 },
    motivation: { communication: 0.8, confidence: 0.8, thought: 0.8, relevance: 1.2, attitude: 1.5 },
    knowledge: { communication: 0.6, confidence: 0.6, thought: 1, relevance: 1.5 },
    situational: { communication: 0.8, confidence: 0.8, thought: 1.3, relevance: 1.2, customer: 1.5 },
    behavioral: { communication: 0.8, confidence: 1, thought: 1.5, relevance: 1, attitude: 0.5 },
    roleplay: { communication: 1.2, confidence: 1, thought: 0.6, relevance: 1, customer: 3, attitude: 0.3 },
    listening: { language: 2, relevance: 0.5 },
    correction: { language: 2 },
    extempore: { communication: 2, confidence: 1.2, thought: 0.6, relevance: 0.5 },
    flexibility: { attitude: 2, confidence: 0.5, relevance: 0.3 },
    self: { communication: 0.8, confidence: 1, thought: 1, relevance: 1, attitude: 1 },
    salary: { communication: 0.5, confidence: 0.8, relevance: 0.6, attitude: 0.8 },
    closing: { communication: 0.4, confidence: 0.4, thought: 0.4, attitude: 1 },
  };

  // Reusable concept vocabularies.
  const T = {
    education: ['graduat*', 'degree', 'college', 'universit*', 'school', 'studied', 'studying', 'study', 'b com', 'bcom', 'b sc', 'bsc', 'ba', 'bba', 'bca', 'b tech', 'btech', 'mba', 'mca', 'diploma', '12th', 'twelfth', '10th', 'hsc', 'ssc', 'course', 'major*', 'stream', 'commerce', 'science', 'arts', 'engineering', 'pursuing', 'final year', 'semester'],
    experience: ['work*', 'job', 'experience', 'intern*', 'company', 'role', 'position', 'part time', 'freelanc*', 'project', 'fresher', 'employ*', 'organi*ation', 'process'],
    skills: ['skill*', 'good at', 'strength*', 'communicat*', 'confident', 'hardworking', 'hard working', 'team*', 'quick learner', 'fast learner', 'patien*', 'computer', 'typing', 'english', 'languages', 'leader*', 'punctual', 'dedicat*', 'disciplin*'],
    personal: ['hobb*', 'family', 'enjoy*', 'interest*', 'passion*', 'free time', 'spare time', 'like to', 'love to', 'reading', 'music', 'sport*', 'cricket', 'football', 'travel*', 'cooking', 'dance', 'dancing', 'singing', 'gym', 'movies', 'i live', 'i am from', 'i come from', 'i belong', 'born', 'brought up', 'hometown'],
    goals: ['goal', 'aim', 'career', 'looking for', 'want to', 'would like to', 'aspir*', 'dream', 'future', 'opportunit*', 'grow*', 'plan to', 'hope to'],
    helping: ['help*', 'people', 'customer*', 'solv*', 'assist*', 'support*', 'serve', 'service', 'problem*', 'satisf*'],
    communication: ['communicat*', 'talk*', 'speak*', 'english', 'interact*', 'convers*', 'language*', 'listen*', 'voice', 'chat*'],
    growth: ['grow*', 'career', 'learn*', 'skill*', 'promot*', 'opportunit*', 'team leader', 'develop*', 'exposure', 'training', 'progress*', 'experience'],
    industry: ['industry', 'international', 'global', 'corporate', 'professional*', 'environment', 'work culture', 'culture', 'mnc', 'client*', 'fast paced', 'dynamic', 'stable', 'stability', 'growing sector', 'booming'],
    selfFit: ['good at', 'i enjoy', 'i like', 'i love', 'passion*', 'suit*', 'patien*', 'interest*', 'fit for', 'my nature', 'my personality', 'extrovert', 'people person'],
    qualities: ['hardworking', 'hard working', 'dedicat*', 'punctual', 'patien*', 'calm', 'quick learner', 'fast learner', 'adapt*', 'flexib*', 'reliable', 'disciplin*', 'honest*', 'positive', 'team player', 'multitask*', 'empath*', 'listen*', 'commit*', 'sincere', 'responsib*', 'confident', 'polite'],
    evidence: ['because', 'for example', 'for instance', 'in my', 'i have', 'experience', 'proven', 'achiev*', 're:\\d+', 'award*', 'certif*', 'when i'],
    value: ['contribut*', 'add value', 'asset', 'company', 'team', 'customers', 'result*', 'target*', 'goal*', 'benefit', 'productiv*'],
    listen: ['listen*', 'let them speak', 'let the customer speak', 'let him speak', 'let her speak', 'interrupt*', 'hear them out', 'hear out', 'vent', 'patiently hear', 'hear the customer', 'hear what'],
    calm: ['calm*', 'patien*', 'composed', 'personally', 'professional*', 'polite*', 'cool', 'relax*', 'tone', 'not react', 'soft', 'gently', 'respectful*'],
    empathise: ['sorry', 'apologi*', 'empath*', 'i understand', 'i can understand', 'understand their', 'understand his', 'understand her', 'understand how', 'inconvenience', 'frustrat*', 'feelings', 'feel heard', 'acknowledg*'],
    probe: ['understand the problem', 'understand the issue', 'understand the concern', 'understand the situation', 'details', 'ask*', 'question*', 'order number', 'order id', 'probe', 'probing', 'verify', 'information', 'concern', 'check*', 'find out', 'figure out', 'root cause'],
    solve: ['solution*', 'solv*', 'resolv*', 'fix*', 'refund', 'replace*', 'option*', 'best possible', 'steps', 'sort it out', 'sort out', 'help them', 'help him', 'help her', 'resolution'],
    escalate: ['escalat*', 'supervisor', 'senior', 'manager', 'team leader', 'tl', 'follow up', 'call back', 'callback', 'update', 'ticket', 'complaint number', 'reference number', 'track*'],
    honesty: ['honest*', 'not guess', 'would not guess', 'never guess', 'wrong information', 'incorrect information', 'false information', 'accurate', 'correct information', 'transparent*', 'admit', 'right information', 'mislead'],
    hold: ['hold', 'permission', 'a moment', 'a minute', 'wait', 'few minutes', 'two minutes', 'please bear with'],
    resources: ['knowledge base', 'kb', 'check*', 'search*', 'system', 'portal', 'document*', 'sop', 'faq*', 'notes', 'tool*', 'database', 'manual', 'guide*', 'research'],
    askHelp: ['supervisor', 'team leader', 'tl', 'senior*', 'colleague*', 'team mate*', 'teammate*', 'expert*', 'escalat*', 'transfer*', 'manager', 'trainer', 'sme'],
    followUp: ['call back', 'callback', 'call them back', 'get back', 'follow up', 'update*', 'email', 'within', 'ticket', 'inform*', 'let them know'],
    pressure: ['pressure', 'deadline', 'stress*', 'tight', 'urgent*', 'short time', 'rush', 'exam*', 'target*', 'busy', 'peak', 'last minute', 'limited time', 'overload*', 'workload'],
    actions: ['plan*', 'prioriti*', 'organi*', 'focus*', 'schedule*', 'divid*', 'break*', 'list', 'calm*', 'extra hours', 'extra time', 'stayed late', 'help*', 'team*', 'time management', 'step by step'],
    outcome: ['complet*', 'finish*', 'on time', 'achiev*', 'succe*', 'result*', 'submitted', 'delivered', 'met the', 'passed', 'appreciat*', 'learn*', 'scored', 'won', 'selected', 'resolved', 'solved'],
    problem: ['problem*', 'issue*', 'difficult*', 'struggl*', 'stuck', 'confus*', 'trouble', 'challenge*', 'worried', 'upset', 'angry', 'tense', 'tensed', 'stressed', 'panic*',
      'not working', 'was not working', 'did not work', 'stopped working', 'broken', 'wrong', 'error', 'failed', 'lost', 'charged', 'complain*', 'could not', 'was not able', 'unable', 'not transferring', 'slow'],
    helpAction: ['help*', 'explain*', 'guid*', 'show*', 'showed', 'taught', 'teach*', 'support*', 'listen*', 'call*', 'fix*', 'sat with', 'spent time',
      'checked', 'raised', 'restored', 'set up', 'install*', 'transferr*', 'arranged', 'contacted', 'replaced', 'reset', 'found', 'walked him', 'walked her', 'step by step'],
    happyEnd: ['solv*', 'resolv*', 'happy', 'thank*', 'appreciat*', 'better', 'understood', 'learn*', 'passed', 'succe*', 'relieved', 'grateful',
      'it worked', 'worked', 'rating', 'feedback', 'came back', 'got back', 'fixed', 'sorted', 'blessing*', 'smil*', 'satisf*', 'on time', 'credited', 'refunded', 'reversed', 'asked for me', 'recommend*'],
    ownership: ['my mistake', 'i made a mistake', 'i was wrong', 'my fault', 'i accepted', 'took responsibility', 'take responsibility', 'i admitted', 'owned', 'accept*', 'my error', 'i realised', 'i realized'],
    fixIt: ['correct*', 'fix*', 'apologi*', 'inform*', 'told my', 'immediately', 'solved', 'rectif*', 'redo', 'redid', 'repair*', 'made it right', 'sorted'],
    lesson: ['learn*', 'lesson', 'since then', 'now i', 'never again', 'double check', 'careful*', 'improv*', 'from that day', 'taught me', 'today i'],
    teamCtx: ['team*', 'group', 'together', 'members', 'colleague*', 'classmates', 'friends', 'we'],
    myRole: ['my role', 'i was responsible', 'i handled', 'i took', 'i led', 'i coordinated', 'my part', 'i contributed', 'my responsibility', 'i was in charge', 'my task'],
    collaborate: ['communicat*', 'coordinat*', 'support*', 'help*', 'divided', 'shared', 'discuss*', 'meeting*', 'cooperat*', 'together', 'brainstorm*', 'assigned'],
    places: ['place*', 'temple*', 'market*', 'beach*', 'park*', 'fort*', 'museum*', 'mall*', 'river*', 'lake*', 'mountain*', 'hill*', 'famous', 'monument*', 'garden*', 'palace*', 'church*', 'mosque*', 'street*', 'city', 'town', 'village'],
    food: ['food', 'dish*', 'eat', 'cuisine', 'street food', 'restaurant*', 'taste', 'tasty', 'sweet*', 'delicious', 'spicy', 'snack*', 'cafe*', 'biryani', 'chai', 'tea'],
    culture: ['people', 'culture', 'festival*', 'language', 'friendly', 'tradition*', 'celebrat*', 'history', 'historical', 'heritage', 'welcoming', 'warm'],
    recommend: ['should visit', 'must visit', 'recommend*', 'you can', 'must try', 'do not miss', 'best time', 'visit', 'you will', 'you should', 'try the'],
    yes: ['yes', 'yeah', 'yep', 'sure', 'comfortable', 'absolutely', 'definitely', 'no problem', 'not a problem', 'ready', 'okay with', 'ok with', 'fine with', 'flexib*', 'adapt*', 'open to', 'willing', 'of course', 'i can manage', 'manageable', 'happy to', 'i am okay', 'i am ok', 'i am fine', 'i have done', 'i have worked'],
    no: ['not comfortable', 'cannot', 'difficult for me', 'prefer day', 'only day', 'not possible', 'will not', 'no i', 'i do not want', 'problem for me', 'not okay', 'not ok', 'not ready', 'not able', 'i would prefer not', 'not interested'],
    conditional: ['but', 'depends', 'only if', 'initially', 'for some time', 'not every', 'occasionally', 'if it is not'],
    strengths: ['strength*', 'good at', 'i am good', 'quick learner', 'fast learner', 'hardworking', 'hard working', 'patien*', 'punctual', 'communicat*', 'team player', 'adapt*', 'calm', 'dedicat*', 'disciplin*', 'positive', 'listen*', 'confident', 'honest*', 'multitask*'],
    weakness: ['weakness*', 'weak', 'struggle*', 'need to improve', 'area of improvement', 'areas of improvement', 'not good at', 'sometimes i', 'i tend to', 'overthink*', 'shy', 'public speaking', 'stage fear', 'perfectionis*', 'too much', 'hesitat*', 'nervous', 'impatien*', 'emotional', 'cannot say no', 'delegat*'],
    improving: ['working on', 'improv*', 'practic*', 'learning', 'overcome', 'better now', 'course', 'trying to', 'i have started', 'now i', 'taking steps', 'i make sure', 'i set', 'step by step', 'getting better'],
    growthRole: ['team leader', 'tl', 'manager', 'supervisor', 'trainer', 'quality analyst', 'qa', 'quality', 'senior', 'lead', 'promot*', 'higher position', 'management', 'leadership', 'sme', 'subject matter expert', 'operations', 'hr', 'mentor'],
    learning: ['learn*', 'skill*', 'grow*', 'develop*', 'experience', 'knowledge', 'expert*', 'certif*', 'better', 'improve*', 'master'],
    loyalty: ['this company', 'your company', 'same company', 'organisation', 'organization', 'with you', 'here', 'contribut*', 'long term', 'stay', 'with this'],
    salaryFlex: ['negotiable', 'flexible', 'open', 'company norms', 'company standards', 'company standard', 'industry standard', 'as per', 'fair', 'reasonable', 'discuss', 'whatever', 'deserve', 'according to'],
    salaryResearch: ['market', 'industry', 'research*', 'role', 'experience', 'skills', 'standard', 'average'],
    salaryNumber: ['re:\\d+', 'lakh*', 'thousand*', 'per month', 'per annum', 'ctc', 'lpa', 'k', 'rupees', 'dollars', 'pesos', 'salary of'],
    salaryValue: ['growth', 'learning', 'opportunit*', 'more important', 'experience', 'not only', 'not just', 'priority'],
    askBack: ['re:^(what|how|when|which|where|who|is|are|will|would|could|can|do|does)\\b', 'what', 'how', 'when', 'which', 'could you', 'can you', 'will there', 'is there', 'are there', 'do you', 'would i', 'i want to know', 'i would like to know', 'i wanted to ask', 'i would like to ask'],
    askTopics: ['training', 'growth', 'career', 'team', 'process', 'shift*', 'timing*', 'next step*', 'expect*', 'performance', 'appraisal', 'culture', 'client*', 'location', 'joining', 'role', 'responsibilit*', 'success', 'day look like', 'typical day', 'improve'],
    csDefinition: ['business process outsourcing', 'outsourc*', 'third party', 'another company', 'on behalf of', 'client*', 'other companies', 'external'],
    csChannels: ['voice', 'non voice', 'nonvoice', 'chat', 'email', 'back office', 'calls', 'call center', 'call centre', 'data entry', 'contact center', 'contact centre'],
    csTypes: ['inbound', 'outbound', 'customer support', 'customer service', 'technical support', 'tech support', 'sales', 'telemarketing', 'collection*', 'survey*', 'helpdesk', 'help desk', 'kpo'],
    csOps: ['shift*', 'target*', 'kpi*', 'aht', 'csat', 'quality', 'sla', 'process', 'international', 'domestic', 'us', 'uk', 'australia', 'metrics', 'night'],
    inbound: ['inbound', 'customers call', 'customer calls', 'receive*', 'incoming', 'they call us', 'call us', 'call in', 'calls in', 'queries', 'query', 'complaint*', 'support', 'helpline'],
    outbound: ['outbound', 'we call', 'make calls', 'make the call', 'calling customers', 'call customers', 'call the customer', 'outgoing', 'sales', 'telemarketing', 'telecall*', 'collection*', 'survey*', 'lead*', 'cold call*', 'pitch*', 'agent calls', 'agents call'],
    csExamples: ['for example', 'such as', 'like', 'bank*', 'telecom', 'amazon', 'airtel', 'jio', 'vodafone', 'insurance', 'credit card*', 'loan*', 'e commerce', 'ecommerce', 'airline*', 'travel'],
    aht: ['average handle time', 'average handling time', 'handle time', 'handling time', 'talk time', 'hold time', 'wrap up', 'after call work', 'acw', 'call duration', 'time spent', 'length of'],
    csat: ['customer satisfaction', 'satisfaction score', 'survey', 'rating*', 'feedback', 'happy', 'satisf*'],
    balance: ['balance', 'both', 'quality', 'first call resolution', 'fcr', 'without rushing', 'rush', 'efficien*', 'resolv*', 'resolution', 'empath*', 'knowledge', 'not compromise', 'trade off', 'tradeoff', 'focus on'],
    csResolve: ['resolv*', 'solv*', 'first call', 'fix*', 'solution*', 'issue', 'problem'],
    csExperience: ['satisf*', 'happy', 'delight*', 'experience', 'feel valued', 'valued', 'respect*', 'smile', 'comfortable', 'trust', 'loyal*'],
    csBehaviour: ['polite*', 'patien*', 'listen*', 'empath*', 'friendly', 'courteous', 'professional*', 'respectful*', 'kind', 'warm'],
    csSpeed: ['quick*', 'fast', 'on time', 'timely', 'prompt*', 'without delay', 'wait*', 'speed', 'efficien*', 'first time'],
    csBeyond: ['extra mile', 'beyond', 'exceed*', 'follow up', 'proactive*', 'anticipat*', 'personali*', 'remember'],
    policy: ['policy', 'policies', 'rules', 'guidelines', 'explain*', 'terms', 'conditions', 'process', 'procedure'],
    alternatives: ['alternative*', 'option*', 'instead', 'offer*', 'voucher', 'coupon', 'discount', 'exchange', 'replace*', 'credit', 'store credit', 'compensat*', 'other way', 'what i can do'],
    approval: ['supervisor', 'manager', 'escalat*', 'senior', 'exception', 'approval', 'approve', 'team leader', 'higher authority'],
    relationship: ['loyal*', 'relationship', 'valued', 'retain*', 'satisf*', 'keep the customer', 'trust', 'long term', 'important customer', 'happy'],
    plan: ['plan*', 'prioriti*', 'schedule', 'break down', 'daily target', 'per day', 'focus', 'strategy', 'divide', 'track*'],
    effort: ['extra', 'effort*', 'overtime', 'hard', 'push', 'more calls', 'increase', 'maximum', 'dedicat*', 'commit*'],
    teamwork: ['team*', 'together', 'help each other', 'motivat*', 'support*', 'colleague*', 'everyone', 'share'],
    improve: ['analy*', 'review*', 'improv*', 'feedback', 'quality', 'technique*', 'skill*', 'coach*', 'learn*', 'best practice*', 'top performer*', 'what is working', 'conversion'],
    inform: ['manager', 'supervisor', 'team leader', 'communicat*', 'update', 'inform*', 'transparent*', 'report*'],
    abuseWarn: ['warning', 'warn*', 'polite*', 'request', 'respectful*', 'language', 'abusive', 'professional*'],
    abusePolicy: ['policy', 'process', 'guideline*', 'script', 'supervisor', 'escalat*', 'transfer*', 'disconnect', 'record*', 'report*', 'team leader', 'procedure', 'protocol'],
    stillHelp: ['help', 'resolv*', 'issue', 'problem', 'focus', 'solution', 'assist*'],
  };

  // ------------------------------------------------------------------ questions

  const QUESTIONS = [
    // ---------------- Introduction
    {
      id: 'intro_tell_me', slot: 'intro', type: 'open',
      text: "Let's begin. Please introduce yourself. Tell me about your background, your education or work experience, and a little about who you are as a person.",
      minWords: 40, ideal: [70, 200], maxSeconds: 150, coverageTarget: 0.6,
      concepts: [
        { id: 'education', label: 'Education', weight: 1, terms: T.education },
        { id: 'experience', label: 'Experience', weight: 1, terms: T.experience },
        { id: 'skills', label: 'Skills & strengths', weight: 1.2, terms: T.skills },
        { id: 'personal', label: 'Personality & interests', weight: 0.7, terms: T.personal },
        { id: 'goals', label: 'Career goal', weight: 1, terms: T.goals },
      ],
      followUps: [
        { when: 'short', text: 'Thank you. Could you tell me a little more — maybe about your education, any work experience, or what you are good at?' },
        { when: 'missing:goals', text: 'Thanks for that. And what are you looking for in your career right now?' },
      ],
      tip: 'Use Present → Past → Future: who you are and what you studied, one relevant experience or strength with proof, then why this role is your next step. Aim for 60–90 seconds.',
    },
    {
      id: 'intro_walk', slot: 'intro', type: 'open',
      text: "To start, could you tell me about yourself? I'd like to hear about your education, any work experience you have, and what you enjoy doing.",
      minWords: 40, ideal: [70, 200], maxSeconds: 150, coverageTarget: 0.6,
      concepts: [
        { id: 'education', label: 'Education', weight: 1, terms: T.education },
        { id: 'experience', label: 'Experience', weight: 1, terms: T.experience },
        { id: 'skills', label: 'Skills & strengths', weight: 1.2, terms: T.skills },
        { id: 'personal', label: 'Personality & interests', weight: 0.7, terms: T.personal },
        { id: 'goals', label: 'Career goal', weight: 1, terms: T.goals },
      ],
      followUps: [
        { when: 'short', text: "That's a good start. Could you tell me a bit more about your education or any experience you have?" },
        { when: 'missing:goals', text: 'And what kind of career are you hoping to build?' },
      ],
      tip: 'Use Present → Past → Future: who you are and what you studied, one relevant experience or strength with proof, then why this role is your next step. Aim for 60–90 seconds.',
    },

    // ---------------- Background
    {
      id: 'education', slot: 'background', type: 'open', exp: 'fresher',
      text: 'Tell me about your education. What did you study, and what did you learn there that would help you in a customer-facing job?',
      minWords: 35, ideal: [50, 160], maxSeconds: 120, coverageTarget: 0.65,
      concepts: [
        { id: 'education', label: 'What you studied', weight: 1, terms: T.education },
        { id: 'learning', label: 'Skills you learned', weight: 1.2, terms: ['learn*', 'taught', 'skill*', 'communicat*', 'presentation*', 'team*', 'discipline', 'time management', 'patience', 'problem solving', 'confidence', 'leadership', 'project*'] },
        { id: 'application', label: 'Link to the job', weight: 1.2, terms: ['customer*', 'people', 'help*', 'job', 'role', 'call*', 'useful', 'apply', 'this field', 'this job', 'work'] },
      ],
      followUps: [{ when: 'missing:application', text: 'How do you think that will help you when you are talking to customers?' }],
      tip: 'Connect studies to the job: presentations, group projects, college events or part-time work that involved dealing with people.',
    },
    {
      id: 'last_job', slot: 'background', type: 'open', exp: 'experienced',
      text: 'Tell me about your most recent job. What were your responsibilities, and what are you most proud of achieving there?',
      minWords: 40, ideal: [60, 180], maxSeconds: 150, coverageTarget: 0.65,
      concepts: [
        { id: 'responsibilities', label: 'Responsibilities', weight: 1.2, terms: ['responsib*', 'role', 'handled', 'handle', 'managed', 'my job', 'duties', 'calls', 'process', 'team', 'customers', 'clients', 'tickets', 'accounts', 'queries'] },
        { id: 'achievement', label: 'An achievement', weight: 1.2, terms: ['achiev*', 'award*', 'target*', 'promot*', 'appreciat*', 'best', 'top', 'exceed*', 'improv*', 'increas*', 'recogni*', 'percent', 'csat', 'quality score', 'rated', 'proud'] },
        { id: 'metrics', label: 'Numbers / KPIs', weight: 0.8, terms: ['re:\\d+', 'percent', 'calls per day', 'csat', 'aht', 'quality', 'kpi*', 'hundred', 'fifty', 'twenty', 'thirty', 'forty'] },
      ],
      followUps: [{ when: 'missing:achievement', text: 'What would you say was your biggest achievement in that job?' }],
      tip: 'Mention the scale (calls per day, team size), your key KPIs, and one achievement backed by a number.',
    },
    {
      id: 'why_leave', slot: 'background2', type: 'motivation', exp: 'experienced',
      text: 'Why are you looking to leave your current job, or why did you leave your previous one?',
      minWords: 25, ideal: [40, 130], maxSeconds: 120, coverageTarget: 0.55,
      concepts: [
        { id: 'growth', label: 'Moving towards growth', weight: 1.5, terms: ['grow*', 'career', 'learn*', 'opportunit*', 'challeng*', 'better role', 'new skills', 'exposure', 'progress*', 'next step', 'responsibilit*'] },
        { id: 'positive', label: 'Positive about the past', weight: 1, terms: ['good experience', 'learned a lot', 'learnt a lot', 'grateful', 'thankful', 'appreciate', 'valuable', 'helped me', 'great experience', 'enjoyed'] },
        { id: 'fit', label: 'Why this role fits', weight: 1, terms: ['this role', 'your company', 'this company', 'this position', 'interest*', 'here', 'this opportunity'] },
      ],
      followUps: [{ when: 'redFlag', text: 'I understand. What are you hoping will be different in your next role?' }],
      tip: 'Stay positive: talk about what you are moving towards (growth, learning, new challenges). Never criticise a previous employer.',
    },
    {
      id: 'fresher_experience', slot: 'background2', type: 'behavioral', exp: 'fresher',
      text: 'Have you done any part-time work, internships, volunteering or college activities where you dealt with people? What did you learn from it?',
      minWords: 35, ideal: [50, 160], maxSeconds: 120, coverageTarget: 0.6,
      concepts: [
        { id: 'activity', label: 'A concrete activity', weight: 1.2, terms: ['intern*', 'part time', 'volunteer*', 'event*', 'fest', 'club', 'ngo', 'tuition*', 'teach*', 'shop', 'store', 'sales', 'organi*', 'coordinat*', 'project*', 'family business'] },
        { id: 'people', label: 'Dealing with people', weight: 1, terms: ['people', 'customer*', 'students', 'visitors', 'guests', 'members', 'team*', 'talk*', 'communicat*', 'handle*', 'help*'] },
        { id: 'learning', label: 'What you learned', weight: 1.2, terms: ['learn*', 'taught me', 'understood', 'realis*', 'realiz*', 'skill*', 'confidence', 'patience', 'improv*'] },
      ],
      followUps: [{ when: 'dontKnow', text: 'That is completely fine. Then tell me about a time in college or at home when you had to explain something to someone or help them.' }],
      tip: 'Freshers can use college fests, tuition, family business or volunteering. Describe what you did with people and the skill it built.',
    },

    // ---------------- Motivation
    {
      id: 'why_bpo', slot: 'motivation', type: 'motivation',
      text: 'Why do you want to work in a BPO or customer service role?',
      minWords: 35, ideal: [60, 160], maxSeconds: 120, coverageTarget: 0.5,
      concepts: [
        { id: 'helping', label: 'Enjoys helping people', weight: 1.2, terms: T.helping },
        { id: 'communication', label: 'Communication', weight: 1, terms: T.communication },
        { id: 'growth', label: 'Career growth', weight: 1.2, terms: T.growth },
        { id: 'industry', label: 'Understands the industry', weight: 0.8, terms: T.industry },
        { id: 'fit', label: 'Personal fit', weight: 0.8, terms: T.selfFit },
      ],
      followUps: [
        { when: 'redFlag', text: 'Salary matters to everyone. Apart from that, what genuinely attracts you to this kind of work?' },
        { when: 'short', text: 'Could you expand on that? What specifically about customer service appeals to you?' },
      ],
      tip: 'Show genuine interest: you enjoy helping people, want to build communication skills, and see a growth path (Team Leader, QA, Trainer). Money can be mentioned, but never as the only reason.',
    },
    {
      id: 'why_cs_career', slot: 'motivation', type: 'motivation',
      text: 'What attracts you to a career in customer support, and why do you think you would be good at it?',
      minWords: 35, ideal: [60, 160], maxSeconds: 120, coverageTarget: 0.5,
      concepts: [
        { id: 'helping', label: 'Enjoys helping people', weight: 1.2, terms: T.helping },
        { id: 'communication', label: 'Communication', weight: 1, terms: T.communication },
        { id: 'growth', label: 'Career growth', weight: 1, terms: T.growth },
        { id: 'fit', label: 'Personal fit, with proof', weight: 1.2, terms: T.selfFit.concat(T.qualities) },
      ],
      followUps: [
        { when: 'redFlag', text: 'Apart from the salary, what draws you to helping customers?' },
        { when: 'missing:fit', text: 'And what qualities do you have that would make you good at this job?' },
      ],
      tip: 'Two parts: why the work appeals to you (helping people, communication, growth) and why you fit (patience, listening, a quick example).',
    },
    {
      id: 'why_hire', slot: 'why_hire', type: 'motivation',
      text: 'Why should we hire you over the other candidates?',
      minWords: 35, ideal: [50, 150], maxSeconds: 120, coverageTarget: 0.55,
      concepts: [
        { id: 'skills', label: 'Relevant skills', weight: 1, terms: ['communicat*', 'skill*', 'english', 'typing', 'computer', 'language*', 'listen*', 'convinc*', 'problem solving', 'multitask*'] },
        { id: 'qualities', label: 'Strong qualities', weight: 1, terms: T.qualities },
        { id: 'evidence', label: 'Proof / example', weight: 1.2, terms: T.evidence },
        { id: 'value', label: 'Value to the company', weight: 1, terms: T.value },
      ],
      followUps: [{ when: 'missing:evidence', text: 'Can you give me one example that proves one of those strengths?' }],
      tip: 'Pick 2–3 strengths relevant to the role, back each with quick proof (an example or a number), and end with how you will add value to the team.',
    },
    {
      id: 'good_agent_qualities', slot: 'why_hire', type: 'motivation',
      text: 'What qualities make a great customer service executive, and which of those qualities do you have?',
      minWords: 35, ideal: [50, 150], maxSeconds: 120, coverageTarget: 0.55,
      concepts: [
        { id: 'qualities', label: 'Names key qualities', weight: 1.3, terms: T.qualities.concat(['communicat*', 'problem solving', 'product knowledge', 'positive attitude']) },
        { id: 'self', label: 'Applies them to self', weight: 1, terms: ['i have', 'i am', 'i can', 'my strength*', 'i always', 'i possess'] },
        { id: 'evidence', label: 'Proof / example', weight: 1, terms: T.evidence },
      ],
      followUps: [{ when: 'missing:evidence', text: 'Could you give me an example of when you showed one of those qualities?' }],
      tip: 'Name 3–4 qualities (patience, active listening, empathy, clear communication, problem solving), then show proof that you have two of them.',
    },

    // ---------------- Knowledge
    {
      id: 'bpo_knowledge', slot: 'knowledge', type: 'knowledge',
      text: 'What do you understand by BPO, and what kind of work happens in a BPO?',
      minWords: 30, ideal: [50, 150], maxSeconds: 120, coverageTarget: 0.6,
      concepts: [
        { id: 'definition', label: 'Definition (outsourcing)', weight: 1.4, terms: T.csDefinition },
        { id: 'channels', label: 'Voice / non-voice / back office', weight: 1, terms: T.csChannels },
        { id: 'types', label: 'Types of process', weight: 1, terms: T.csTypes },
        { id: 'ops', label: 'How the work runs (shifts, KPIs)', weight: 0.7, terms: T.csOps },
      ],
      followUps: [{ when: 'missing:definition', text: 'Do you know what the letters B P O stand for?' }],
      tip: 'BPO = Business Process Outsourcing: companies hand processes like customer support, tech support, sales or back-office work to a service provider. Mention voice vs non-voice, inbound vs outbound, and international vs domestic processes.',
    },
    {
      id: 'inbound_outbound', slot: 'knowledge', type: 'knowledge',
      text: 'What is the difference between an inbound process and an outbound process?',
      minWords: 25, ideal: [40, 130], maxSeconds: 100, coverageTarget: 0.7,
      concepts: [
        { id: 'inbound', label: 'Inbound explained', weight: 1.5, terms: T.inbound },
        { id: 'outbound', label: 'Outbound explained', weight: 1.5, terms: T.outbound },
        { id: 'examples', label: 'Examples', weight: 0.7, terms: T.csExamples },
      ],
      followUps: [{ when: 'short', text: 'Could you give me an example of each?' }],
      tip: 'Inbound: customers call in with questions or complaints (support, helplines). Outbound: agents call customers — sales, renewals, surveys, collections. One example of each makes it clear.',
    },
    {
      id: 'aht_csat', slot: 'knowledge', type: 'knowledge', exp: 'experienced',
      text: 'What do the metrics A H T and C SAT mean, and how do you balance them on a call?',
      minWords: 30, ideal: [50, 150], maxSeconds: 120, coverageTarget: 0.65,
      concepts: [
        { id: 'aht', label: 'AHT = Average Handle Time', weight: 1.3, terms: T.aht },
        { id: 'csat', label: 'CSAT = Customer Satisfaction', weight: 1.3, terms: T.csat },
        { id: 'balance', label: 'How to balance them', weight: 1.2, terms: T.balance },
      ],
      tip: 'AHT is average handle time (talk + hold + wrap-up); CSAT is the customer satisfaction score. Balance them with strong product knowledge, controlled probing, and first-call resolution — never rush a customer just to cut AHT.',
    },
    {
      id: 'great_service', slot: 'knowledge2', type: 'knowledge',
      text: 'What does excellent customer service mean to you?',
      minWords: 30, ideal: [50, 150], maxSeconds: 110, coverageTarget: 0.55,
      concepts: [
        { id: 'resolve', label: 'Solving the problem', weight: 1.2, terms: T.csResolve },
        { id: 'experience', label: 'Customer feels valued', weight: 1, terms: T.csExperience },
        { id: 'behaviour', label: 'Polite & empathetic', weight: 1, terms: T.csBehaviour },
        { id: 'speed', label: 'Quick & timely', weight: 0.8, terms: T.csSpeed },
        { id: 'beyond', label: 'Going the extra mile', weight: 0.7, terms: T.csBeyond },
      ],
      tip: 'Excellent service = solving the problem correctly the first time, quickly, while making the customer feel heard and valued — and following up when needed.',
    },
    {
      id: 'first_call_resolution', slot: 'knowledge2', type: 'knowledge', exp: 'experienced',
      text: 'What is first call resolution, and why is it important?',
      minWords: 25, ideal: [40, 130], maxSeconds: 100, coverageTarget: 0.6,
      concepts: [
        { id: 'meaning', label: 'Resolving on the first contact', weight: 1.5, terms: ['first call', 'first contact', 'first time', 'same call', 'single call', 'one call', 'without calling again', 'no need to call', 'call back again', 'repeat call*'] },
        { id: 'why', label: 'Why it matters', weight: 1.2, terms: ['satisf*', 'csat', 'cost', 'time', 'repeat', 'effort', 'happy', 'loyal*', 'efficien*', 'workload', 'trust'] },
        { id: 'how', label: 'How to achieve it', weight: 0.8, terms: ['knowledge', 'probing', 'probe', 'listen*', 'understand', 'training', 'ownership', 'tools', 'complete'] },
      ],
      tip: 'FCR = resolving the issue on the first contact, so the customer never has to call back. It raises satisfaction and lowers cost; it comes from good probing, product knowledge, and ownership.',
    },

    // ---------------- Situational
    {
      id: 'handle_angry', slot: 'situational', type: 'situational',
      text: 'Imagine a customer calls you very angry, shouting about a problem with their order. How would you handle this call?',
      minWords: 40, ideal: [60, 180], maxSeconds: 150, coverageTarget: 0.6,
      concepts: [
        { id: 'listen', label: 'Listen without interrupting', weight: 1, terms: T.listen },
        { id: 'calm', label: 'Stay calm & professional', weight: 1, terms: T.calm },
        { id: 'empathize', label: 'Apologise & empathise', weight: 1.3, terms: T.empathise },
        { id: 'probe', label: 'Understand the issue', weight: 1, terms: T.probe },
        { id: 'solve', label: 'Offer a solution', weight: 1.3, terms: T.solve },
        { id: 'escalate', label: 'Escalate / follow up', weight: 0.7, terms: T.escalate },
      ],
      followUps: [
        { when: 'missing:empathize', text: 'And what exactly would you say to the customer to calm them down?' },
        { when: 'short', text: 'Could you walk me through the steps you would take on that call?' },
      ],
      tip: 'Listen fully → stay calm → apologise and empathise ("I completely understand how frustrating this is") → verify details → give a clear solution and timeline → escalate if needed → close politely.',
    },
    {
      id: 'abusive_customer', slot: 'situational', type: 'situational', ignoreFlags: ['customer_hostility'],
      text: 'What would you do if a customer starts using abusive language on a call?',
      minWords: 35, ideal: [50, 160], maxSeconds: 130, coverageTarget: 0.6,
      concepts: [
        { id: 'calm', label: 'Stay calm', weight: 1.2, terms: T.calm },
        { id: 'warn', label: 'Politely set a boundary', weight: 1.2, terms: T.abuseWarn },
        { id: 'help', label: 'Keep focus on helping', weight: 1, terms: T.stillHelp },
        { id: 'policy', label: 'Follow policy / escalate', weight: 1.2, terms: T.abusePolicy },
      ],
      followUps: [{ when: 'short', text: 'What would you actually say to the customer in that moment?' }],
      tip: 'Stay calm, do not take it personally, politely ask the customer to keep the language respectful so you can help, keep working on the issue, and follow the call-handling policy (warnings, supervisor, or disconnecting after warnings).',
    },
    {
      id: 'dont_know_answer', slot: 'situational2', type: 'situational',
      text: "Suppose a customer asks you something you don't know the answer to. What would you do?",
      minWords: 30, ideal: [50, 150], maxSeconds: 120, coverageTarget: 0.6,
      concepts: [
        { id: 'honesty', label: 'Be honest, never guess', weight: 1.2, terms: T.honesty },
        { id: 'hold', label: 'Ask permission to hold', weight: 0.8, terms: T.hold },
        { id: 'resources', label: 'Check resources', weight: 1, terms: T.resources },
        { id: 'askHelp', label: 'Ask a senior / escalate', weight: 1, terms: T.askHelp },
        { id: 'followUp', label: 'Follow up with the customer', weight: 0.8, terms: T.followUp },
      ],
      followUps: [{ when: 'short', text: 'Where would you go to find the right answer?' }],
      tip: 'Never guess. Tell the customer you will check, ask permission to place them on hold, use the knowledge base or ask your team leader, and if it takes longer, promise a call-back with a time.',
    },
    {
      id: 'policy_refund', slot: 'situational2', type: 'situational',
      text: 'A loyal customer asks for a refund that is against company policy. What would you do?',
      minWords: 30, ideal: [50, 150], maxSeconds: 120, coverageTarget: 0.6,
      concepts: [
        { id: 'empathy', label: 'Empathise first', weight: 1, terms: T.empathise },
        { id: 'policy', label: 'Explain the policy clearly', weight: 1, terms: T.policy },
        { id: 'alternatives', label: 'Offer alternatives', weight: 1.3, terms: T.alternatives },
        { id: 'approval', label: 'Seek an exception if valid', weight: 0.8, terms: T.approval },
        { id: 'relationship', label: 'Protect the relationship', weight: 0.8, terms: T.relationship },
      ],
      tip: 'Empathise, explain the policy simply (not "it is the rule"), offer what you CAN do (exchange, credit, discount), and for a loyal customer ask your supervisor if an exception is possible.',
    },
    {
      id: 'target_pressure', slot: 'situational2', type: 'situational',
      text: 'Your team is far behind its monthly target with only one week left. What would you do?',
      minWords: 30, ideal: [50, 150], maxSeconds: 120, coverageTarget: 0.55,
      concepts: [
        { id: 'plan', label: 'Make a plan', weight: 1.2, terms: T.plan },
        { id: 'effort', label: 'Extra effort', weight: 0.8, terms: T.effort },
        { id: 'team', label: 'Work with the team', weight: 1, terms: T.teamwork },
        { id: 'improve', label: 'Improve the approach', weight: 1, terms: T.improve },
        { id: 'inform', label: 'Keep leaders informed', weight: 0.6, terms: T.inform },
      ],
      tip: 'Break the gap into a daily target, focus on the highest-converting work, learn from top performers, support teammates, and keep your team leader updated.',
    },

    // ---------------- Behavioural
    {
      id: 'pressure_time', slot: 'behavioral', type: 'behavioral',
      text: 'Tell me about a time you had to work under pressure or a tight deadline. What did you do, and what was the result?',
      minWords: 45, ideal: [70, 200], maxSeconds: 150, coverageTarget: 0.6,
      concepts: [
        { id: 'pressure', label: 'The pressure situation', weight: 1, terms: T.pressure },
        { id: 'actions', label: 'What you did', weight: 1.3, terms: T.actions },
        { id: 'outcome', label: 'The result', weight: 1.2, terms: T.outcome },
      ],
      followUps: [
        { when: 'noExample', text: 'Could you share one specific situation — where it happened and exactly what you did?' },
        { when: 'short', text: 'What steps did you take, and how did it turn out?' },
      ],
      tip: 'Use STAR: Situation (where/when), Task (what had to be done), Action (what YOU did, step by step), Result (the outcome, ideally with a number) — plus what you learned.',
    },
    {
      id: 'helped_someone', slot: 'behavioral', type: 'behavioral',
      text: 'Describe a situation where you helped someone solve a problem.',
      minWords: 45, ideal: [70, 200], maxSeconds: 150, coverageTarget: 0.6,
      concepts: [
        { id: 'problem', label: 'The problem', weight: 1, terms: T.problem },
        { id: 'action', label: 'How you helped', weight: 1.3, terms: T.helpAction },
        { id: 'result', label: 'The outcome', weight: 1.2, terms: T.happyEnd },
      ],
      followUps: [{ when: 'noExample', text: 'Can you tell me about one particular time — who it was and what exactly happened?' }],
      tip: 'Use STAR. Pick a real story, explain what YOU did step by step, and finish with the outcome and how the person felt.',
    },
    {
      id: 'mistake', slot: 'behavioral', type: 'behavioral',
      text: 'Tell me about a mistake you made, and how you handled it.',
      minWords: 40, ideal: [60, 180], maxSeconds: 150, coverageTarget: 0.6,
      concepts: [
        { id: 'ownership', label: 'Owns the mistake', weight: 1.3, terms: T.ownership },
        { id: 'fix', label: 'Fixes it', weight: 1.1, terms: T.fixIt },
        { id: 'lesson', label: 'Lesson learned', weight: 1.2, terms: T.lesson },
      ],
      followUps: [
        { when: 'missing:lesson', text: 'What did you learn from that experience?' },
        { when: 'noExample', text: 'Could you describe one specific mistake and what happened next?' },
      ],
      tip: 'Pick a real but recoverable mistake, own it without blaming others, explain how you fixed it, and end with what you do differently now.',
    },
    {
      id: 'teamwork', slot: 'behavioral', type: 'behavioral',
      text: 'Tell me about a time you worked as part of a team to achieve something.',
      minWords: 45, ideal: [70, 200], maxSeconds: 150, coverageTarget: 0.6,
      concepts: [
        { id: 'context', label: 'The team & the goal', weight: 0.8, terms: T.teamCtx },
        { id: 'role', label: 'Your specific role', weight: 1.3, terms: T.myRole },
        { id: 'collab', label: 'How you collaborated', weight: 1, terms: T.collaborate },
        { id: 'result', label: 'The result', weight: 1.1, terms: T.outcome },
      ],
      followUps: [{ when: 'missing:role', text: 'What was your own role in that team?' }],
      tip: 'Use STAR and make your own contribution clear — say "I" for what you did and "we" for the team result.',
    },

    // ---------------- Role-play (mock calls)
    {
      id: 'roleplay_billing', slot: 'roleplay', type: 'roleplay', roles: ['voice', 'general', 'nonvoice'], checklist: 'support',
      intro: "Now let's do a short mock call. I'll play the customer and you are the customer support executive. Respond exactly as you would on a real call. Here is your customer.",
      text: 'Mock call: a customer has been charged twice.',
      turns: [
        { customer: "Hello? Finally someone picked up! I've been charged twice for my last order and I've already called two times. Nobody is helping me! This is ridiculous!" },
        { branch: [
          { needs: ['empathy'], customer: "Okay... fine. My order number is 4, 5, 7, 2. I just want my money back. How long is this going to take?" },
          { customer: 'Are you even listening to me? I said I was charged TWICE! I want my money back right now!' },
        ] },
        { branch: [
          { needs: ['resolution'], customer: "Alright. As long as it's actually done this time. Thank you." },
          { customer: "That's not an answer. When exactly will I get my refund?" },
        ] },
      ],
      minWords: 15, ideal: [25, 90], maxSeconds: 90, coverageTarget: 0.75,
      tip: 'Open professionally, apologise and empathise, verify the order details, give a clear resolution with a timeline ("refund in 3–5 business days, reference number…"), and close with "Is there anything else I can help you with?"',
    },
    {
      id: 'roleplay_internet', slot: 'roleplay', type: 'roleplay', roles: ['tech'], checklist: 'support',
      intro: "Now let's do a short mock technical support call. I'll play the customer and you are the support executive. Respond exactly as you would on a real call. Here is your customer.",
      text: 'Mock call: a customer\'s internet has been down for three days.',
      turns: [
        { customer: "Hi, my internet hasn't worked for three days! I work from home and I'm losing money because of this. I've already restarted the router twice!" },
        { branch: [
          { needs: ['empathy', 'probing'], customer: 'Fine. My account number is 8, 8, 1, 9. The light on the router is blinking red.' },
          { customer: "Look, I don't need a script. I need my internet working. What exactly are you going to do?" },
        ] },
        { branch: [
          { needs: ['resolution'], customer: 'Okay, if a technician can come tomorrow, that works for me. Thanks.' },
          { customer: "So you can't even tell me when it will be fixed? This is unbelievable." },
        ] },
      ],
      minWords: 15, ideal: [25, 90], maxSeconds: 90, coverageTarget: 0.75,
      tip: 'Empathise first (they are losing money), verify the account, probe the symptoms, give a clear fix or a technician visit with a time, and close by confirming nothing else is needed.',
    },
    {
      id: 'roleplay_sales', slot: 'roleplay', type: 'roleplay', roles: ['sales'], checklist: 'sales',
      intro: "Now let's do a mock outbound sales call. You are calling an existing customer to offer an upgrade to a faster internet plan — double the speed for just 10 dollars more per month. I'll play the customer. Here they are.",
      text: 'Mock call: pitch a faster internet plan to an existing customer.',
      turns: [
        { customer: 'Hello? Who is this?' },
        { branch: [
          { needs: ['opening', 'value'], customer: "Hmm, I'm not really interested. My current plan works fine, and honestly it sounds expensive." },
          { customer: "Sorry, I didn't get that. Who are you and what exactly are you selling?" },
        ] },
        { branch: [
          { needs: ['objection'], customer: 'Okay, that actually sounds reasonable. What would I need to do?' },
          { customer: "No, I don't think so. I'm a bit busy right now." },
        ] },
      ],
      minWords: 15, ideal: [25, 90], maxSeconds: 90, coverageTarget: 0.75,
      tip: 'Introduce yourself and the company, ask if it is a good time, ask about their current usage, sell the benefit (not the feature), acknowledge the objection before answering it, and ask for the next step.',
    },

    // ---------------- Listening
    {
      id: 'listen_order', slot: 'listening', type: 'listening', hideText: true,
      text: "Here is a quick listening test. Listen carefully. A customer named Priya Sharma is calling about order number 4, 5, 7, 2, which was delivered to the wrong address in Pune. Now please tell me: the customer's name, the order number, and the city.",
      display: 'Listening test — the details are spoken only. Answer with the customer\'s name, the order number and the city.',
      expected: [
        { id: 'name', label: 'Customer name: Priya Sharma', terms: ['priya', 'sharma'] },
        { id: 'number', label: 'Order number: 4572', digits: '4572' },
        { id: 'city', label: 'City: Pune', terms: ['pune', 'poona', 'puna'] },
      ],
      minWords: 3, ideal: [6, 40], maxSeconds: 45,
      tip: 'On calls, note down names, numbers and places as you hear them, and read them back to confirm.',
    },
    {
      id: 'listen_ticket', slot: 'listening', type: 'listening', hideText: true,
      text: "Here is a quick listening test. Listen carefully. Mr. David Miller called on Tuesday about a refund of 350 dollars. His ticket number is 8, 1, 9, 3. Now please tell me: the customer's name, the refund amount, and the ticket number.",
      display: 'Listening test — the details are spoken only. Answer with the customer\'s name, the refund amount and the ticket number.',
      expected: [
        { id: 'name', label: 'Customer name: David Miller', terms: ['david', 'miller'] },
        { id: 'amount', label: 'Refund amount: 350 dollars', digits: '350' },
        { id: 'ticket', label: 'Ticket number: 8193', digits: '8193' },
      ],
      minWords: 3, ideal: [6, 40], maxSeconds: 45,
      tip: 'On calls, note down names, numbers and amounts as you hear them, and read them back to confirm.',
    },
    {
      id: 'listen_booking', slot: 'listening', type: 'listening', hideText: true,
      text: "Here is a quick listening test. Listen carefully. Customer Anita Rao wants to change her flight from Mumbai to Delhi, moving it from the 12th of March to the 15th of March. Her booking reference is 7, 4, 9. Now please tell me: the new travel date, the destination city, and the booking reference.",
      display: 'Listening test — the details are spoken only. Answer with the new travel date, the destination city and the booking reference.',
      expected: [
        { id: 'date', label: 'New date: 15th March', terms: ['15', '15th', 'fifteen', 'fifteenth'] },
        { id: 'city', label: 'Destination: Delhi', terms: ['delhi', 'dilli'] },
        { id: 'ref', label: 'Booking reference: 749', digits: '749' },
      ],
      minWords: 3, ideal: [6, 40], maxSeconds: 45,
      tip: 'Separate old details from new ones: the question asked for the NEW date. Read details back to confirm.',
    },

    // ---------------- Sentence correction
    {
      id: 'correct_dont', slot: 'correction', type: 'correction',
      text: "Here is a quick English check. Please say this sentence correctly: She don't like to work on weekends.",
      display: 'Correct this sentence: “She don\'t like to work on weekends.”',
      wrong: "She don't like to work on weekends.",
      correct: "She doesn't like to work on weekends.",
      accept: ['she does not like', 'she dislikes', 'she does not enjoy', 'she does not prefer'],
      reject: ['she do not'],
      minWords: 3, ideal: [5, 20], maxSeconds: 40,
      tip: 'Third-person singular (he/she/it) takes "does not", not "do not".',
    },
    {
      id: 'correct_having', slot: 'correction', type: 'correction',
      text: 'Here is a quick English check. Please say this sentence correctly: I am having three years of experience in sales.',
      display: 'Correct this sentence: “I am having three years of experience in sales.”',
      wrong: 'I am having three years of experience in sales.',
      correct: 'I have three years of experience in sales.',
      accept: ['re:i have (got )?(3|three) years', 're:i have (3|three) years', 're:i have experience of (3|three) years', 're:i have been working (in sales )?for (3|three) years'],
      reject: ['i am having'],
      minWords: 3, ideal: [5, 20], maxSeconds: 40,
      tip: '"Have" meaning possession is never used in the continuous form: say "I have three years of experience".',
    },
    {
      id: 'correct_yesterday', slot: 'correction', type: 'correction',
      text: 'Here is a quick English check. Please say this sentence correctly: Yesterday I have completed all my tasks.',
      display: 'Correct this sentence: “Yesterday I have completed all my tasks.”',
      wrong: 'Yesterday I have completed all my tasks.',
      correct: 'Yesterday I completed all my tasks.',
      accept: ['yesterday i completed', 'i completed all my tasks yesterday', 'yesterday i finished', 'yesterday i had completed', 'i finished all my tasks yesterday'],
      reject: ['yesterday i have completed', 'i have completed all my tasks yesterday'],
      minWords: 3, ideal: [5, 20], maxSeconds: 40,
      tip: 'With a finished time like "yesterday", use the simple past ("I completed"), not the present perfect ("I have completed").',
    },
    {
      id: 'correct_each', slot: 'correction', type: 'correction',
      text: 'Here is a quick English check. Please say this sentence correctly: Each of the agents have a headset.',
      display: 'Correct this sentence: “Each of the agents have a headset.”',
      wrong: 'Each of the agents have a headset.',
      correct: 'Each of the agents has a headset.',
      accept: ['each of the agents has', 'every agent has', 'each agent has', 'all the agents have', 'all agents have', 'all of the agents have'],
      reject: ['each of the agents have'],
      minWords: 3, ideal: [5, 20], maxSeconds: 40,
      tip: '"Each" is singular, so it takes "has".',
    },
    {
      id: 'correct_go', slot: 'correction', type: 'correction',
      text: 'Here is a quick English check. Please say this sentence correctly: He go to the office every day by bus.',
      display: 'Correct this sentence: “He go to the office every day by bus.”',
      wrong: 'He go to the office every day by bus.',
      correct: 'He goes to the office every day by bus.',
      accept: ['he goes to', 'he travels to', 'he commutes to'],
      reject: ['he go to'],
      minWords: 3, ideal: [5, 20], maxSeconds: 40,
      tip: 'In the simple present, he/she/it takes a verb ending in -s: "he goes".',
    },

    // ---------------- Speaking exercise
    {
      id: 'extempore_town', slot: 'extempore', type: 'extempore',
      text: "Here's a short speaking exercise. Describe your hometown to me as if I'm a tourist visiting for the first time. Speak for about one minute.",
      minWords: 60, ideal: [90, 200], maxSeconds: 90, coverageTarget: 0.6,
      concepts: [
        { id: 'places', label: 'Places to see', weight: 1, terms: T.places },
        { id: 'food', label: 'Food', weight: 0.8, terms: T.food },
        { id: 'culture', label: 'People & culture', weight: 0.8, terms: T.culture },
        { id: 'recommend', label: 'Recommendations', weight: 1, terms: T.recommend },
      ],
      tip: 'Organise a free-speaking answer: an opening line, 2–3 points (places, food, people), and a closing recommendation. Keep talking steadily without long pauses.',
    },
    {
      id: 'extempore_movie', slot: 'extempore', type: 'extempore',
      text: "Here's a short speaking exercise. Tell me about your favourite movie or book, and why you like it. Speak for about one minute.",
      minWords: 60, ideal: [90, 200], maxSeconds: 90, coverageTarget: 0.6,
      concepts: [
        { id: 'what', label: 'What it is about', weight: 1, terms: ['story', 'about', 'plot', 'character*', 'hero', 'main', 'directed', 'written', 'author', 'actor*', 'actress*'] },
        { id: 'why', label: 'Why you like it', weight: 1.3, terms: ['because', 'i like', 'i love', 'favourite', 'favorite', 'inspir*', 'message', 'lesson', 'teaches', 'taught', 'moved', 'touched'] },
        { id: 'detail', label: 'A specific moment', weight: 0.8, terms: ['scene', 'part', 'chapter', 'moment', 'ending', 'when he', 'when she', 'when they', 'especially'] },
      ],
      tip: 'Give a one-line summary, then two reasons you like it, with one specific scene or detail. End with what it taught you.',
    },

    // ---------------- 4-round assessment: topic talk and live call (filled in per session by the engine)
    {
      id: 'topic_talk', slot: 'topic', type: 'extempore', longTalk: true,
      text: 'Your word is: {word}. Talk about it for up to three minutes: what it means to you, an example from your life, and why it matters. Take a few seconds to think, then begin. Say that\'s all when you finish.',
      display: 'Your word: {word}. Talk about it for up to three minutes.',
      dims: { communication: 1.5, confidence: 1.2, thought: 2, relevance: 1 },
      minWords: 120, ideal: [250, 450], maxSeconds: 200, prepSeconds: 20, coverageTarget: 0.6,
      concepts: [
        { id: 'points', label: 'Several distinct points', weight: 1, terms: ['first', 'firstly', 'second', 'secondly', 'another', 'also', 'apart from that', 'on the other hand', 'moreover', 'besides', 'one more', 'next', 'then'] },
        { id: 'example', label: 'A real example', weight: 1.2, terms: ['for example', 'for instance', 'once', 'one time', 'i remember', 'when i was', 'in my life', 'my friend', 'my mother', 'my father', 'last year', 'one day', 'in my experience', 'personally'] },
        { id: 'why', label: 'Why it matters', weight: 1, terms: ['because', 'that is why', 'which is why', 'important', 'matters', 'helps', 'so that', 'the reason'] },
        { id: 'conclusion', label: 'A conclusion', weight: 0.8, terms: ['so overall', 'overall', 'in the end', 'to conclude', 'in conclusion', 'to sum up', 'finally', 'that is all', 'at the end of the day', 'in short'] },
      ],
      tip: 'Open with what the word means to you, make two or three points with one real example, and end with a one-line conclusion. Keep talking steadily; a short pause to think is fine.',
    },
    {
      id: 'live_call', slot: 'livecall', type: 'roleplay', live: true, checklist: 'support',
      text: 'Live customer call',
      dims: { communication: 1.2, confidence: 1, thought: 0.6, relevance: 1, customer: 3.5, attitude: 0.5 },
      minWords: 12, ideal: [20, 80], maxSeconds: 60, coverageTarget: 0.75,
      tip: 'Greet, apologise and acknowledge the exact problem, verify the details, give a concrete fix with a timeline or reference number, handle any extra worry calmly, and close politely.',
    },

    // ---------------- Flexibility
    {
      id: 'shifts', slot: 'shifts', type: 'flexibility',
      text: 'BPO jobs often involve night shifts, rotational shifts, and working on weekends or holidays. Are you comfortable with that?',
      stance: { yes: T.yes, no: T.no, conditional: T.conditional },
      minWords: 3, ideal: [10, 60], maxSeconds: 60,
      followUps: [
        { when: 'redFlag', text: 'I understand. If the role needed rotational shifts for the first few months, would that work for you?' },
        { when: 'short', text: 'Good to hear. How would you manage your routine and health with changing shifts?' },
      ],
      tip: 'A confident "Yes, I am comfortable" plus how you will manage it (sleep routine, commute, family support) is ideal. If you have a real constraint, state it honestly and politely.',
    },

    // ---------------- Self-awareness
    {
      id: 'strength_weakness', slot: 'self', type: 'self',
      text: 'What are your greatest strengths, and what is one weakness you are working on?',
      minWords: 40, ideal: [60, 170], maxSeconds: 130, coverageTarget: 0.7,
      concepts: [
        { id: 'strengths', label: 'Relevant strengths', weight: 1, terms: T.strengths },
        { id: 'weakness', label: 'An honest weakness', weight: 1, terms: T.weakness, negatable: true },
        { id: 'improving', label: 'How you are improving', weight: 1.2, terms: T.improving },
      ],
      followUps: [{ when: 'missing:improving', text: 'And what are you doing to improve on that weakness?' }],
      tip: 'Name two strengths relevant to the job with quick proof. Pick a genuine but non-critical weakness, and explain what you are doing about it.',
    },
    {
      id: 'five_years', slot: 'future', type: 'self',
      text: 'Where do you see yourself in five years?',
      minWords: 30, ideal: [45, 140], maxSeconds: 110, coverageTarget: 0.55,
      concepts: [
        { id: 'growthRole', label: 'A growth role', weight: 1.2, terms: T.growthRole },
        { id: 'learning', label: 'Skills & learning', weight: 1, terms: T.learning },
        { id: 'loyalty', label: 'Growing with the company', weight: 0.8, terms: T.loyalty },
      ],
      followUps: [{ when: 'short', text: 'What role would you like to grow into, and how will you get there?' }],
      tip: 'Show ambition that fits the company: e.g. top performer in year one, then Team Leader, Quality Analyst or Trainer, building skills along the way.',
    },
    {
      id: 'salary', slot: 'salary', type: 'salary',
      text: 'What are your salary expectations for this role?',
      minWords: 12, ideal: [20, 90], maxSeconds: 90, coverageTarget: 0.45,
      concepts: [
        { id: 'flex', label: 'Open / negotiable', weight: 1.2, terms: T.salaryFlex },
        { id: 'basis', label: 'Based on role & market', weight: 0.8, terms: T.salaryResearch },
        { id: 'number', label: 'A realistic range', weight: 0.6, terms: T.salaryNumber },
        { id: 'value', label: 'Values growth too', weight: 0.8, terms: T.salaryValue },
      ],
      tip: 'Give a realistic range based on the role and market, say you are open to discussion, and mention that growth and learning matter to you too.',
    },

    // ---------------- Closing
    {
      id: 'questions_for_us', slot: 'closing', type: 'closing',
      text: "That's all the questions from my side. Do you have any questions for me about the role or the company?",
      minWords: 1, ideal: [8, 60], maxSeconds: 60,
      tip: 'Always ask one or two thoughtful questions — about training, what success looks like in the first 90 days, the team, or growth paths. It shows real interest.',
    },
  ];

  const byId = {};
  for (const q of QUESTIONS) {
    q.dims = Object.assign({}, TYPE_DIMS[q.type], q.dims || {});
    q.stageLabel = STAGES[q.slot] || q.slot;
    byId[q.id] = q;
  }

  function eligible(q, role, exp) {
    if (q.roles && q.roles.indexOf(role) === -1) return false;
    if (q.exp && q.exp !== exp) return false;
    return true;
  }

  /**
   * Choose the concrete questions for an interview.
   * opts: { length: 'quick'|'standard'|'full', role, experience, random: () => [0,1) }
   */
  function buildPlan(opts) {
    const plan = PLANS[opts.length] || PLANS.standard;
    const rand = opts.random || Math.random;
    const used = new Set();
    const out = [];
    for (const slot of plan.slots) {
      const pool = slot.charAt(0) === '='
        ? QUESTIONS.filter((q) => q.id === slot.slice(1))
        : QUESTIONS.filter((q) => q.slot === slot && !used.has(q.id) && eligible(q, opts.role, opts.experience));
      if (!pool.length) continue;
      const q = pool[Math.floor(rand() * pool.length)];
      used.add(q.id);
      out.push(q);
    }
    return out;
  }

  const api = { ROLES, STAGES, PLANS, TYPE_DIMS, QUESTIONS, byId, buildPlan, eligible };
  if (isNode) module.exports = api;
  else (root.AII = root.AII || {}).Questions = api;
})(typeof window !== 'undefined' ? window : globalThis);
