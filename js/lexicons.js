/*
 * lexicons.js — the word lists the analyser is built on.
 *
 * All terms are written in NORMALISED form: lower case, contractions expanded
 * ("i'm" -> "i am", "don't" -> "do not", "can't" -> "cannot"). A "*" matches any
 * word ending ("communicat*"). A term starting with "re:" is a raw regex body.
 *
 * Edit these lists to tune the interviewer — no code changes needed.
 */
(function (root) {
  'use strict';
  const isNode = typeof module === 'object' && module.exports;

  // Disfluencies. Note: browser speech engines often drop "um"/"uh", which is
  // why pause analysis from the microphone complements this list.
  const FILLERS = [
    'um', 'umm', 'ummm', 'uh', 'uhh', 'uhm', 'uhhh', 'er', 'erm', 'ah', 'ahh', 'hmm', 'hmmm', 'mm',
    'you know', 'i mean', 'basically', 'actually', 'literally', 'like you know', 'you see',
    'kind of like', 'so yeah', 'and yeah', 'and all', 'and all that', 'and stuff', 'or something',
    'whatever', 'okay so', 're:it is like', 're:was like',
  ];

  // Hedging / uncertainty language — lowers the confidence score.
  const HEDGES = [
    'i think', 'i guess', 'i suppose', 'maybe', 'perhaps', 'probably', 'possibly', 'kind of', 'sort of',
    'not sure', 'i am not sure', 'i do not know', 'i do not really know', 'i am not really sure',
    'hopefully', 'might be', 'may be', 'somewhat', 'a little bit', 'i will try', 'i would try', 'try my best',
    'i feel like', 'not really', 'i am not that', 'if possible', 'more or less', 'i hope so',
  ];

  // Assertive, ownership-taking language — raises confidence.
  const CONFIDENT = [
    'i am confident', 'i am sure', 'i am certain', 'definitely', 'certainly', 'absolutely', 'without doubt',
    'i can', 'i will', 'i am capable', 'i am good at', 'i am skilled', 'i excel', 'i have experience',
    'i have successfully', 'i successfully', 'i achieved', 'i led', 'i managed', 'i handled', 'i resolved',
    'i delivered', 'i improved', 'i increased', 'i reduced', 'i built', 'i created', 'i trained',
    'i am ready', 'i am eager', 'i am committed', 'i am passionate', 'my strength', 'i strongly believe',
    'i make sure', 'i always', 'i take responsibility', 'i take ownership', 'proven', 'i won', 'i was awarded',
    'i was promoted', 'i topped', 'i exceeded', 'i consistently',
  ];

  // Negative self-talk — a strong confidence penalty.
  const NEGATIVE_SELF = [
    'i am not good', 'i am bad at', 'i am weak', 'i am very weak', 'i cannot speak', 'i am nervous',
    'i am scared', 'i am afraid', 'i am not confident', 'my english is not good', 'my english is weak',
    'my english is bad', 'i am not perfect in english', 'i lack confidence', 'i am an introvert and',
    'i do not have any skill', 'i have no skill', 'i am not smart', 'i fail', 'i always fail',
  ];

  const DONT_KNOW = [
    'i do not know', 'no idea', 'i have no idea', 'i am not aware', 'i do not have any idea',
    'i cannot say', 'i cannot answer', 'i pass', 'pass on this', 'skip this', 'next question', 'i do not remember',
  ];

  // Discourse markers — evidence of organised thinking.
  const STRUCTURE = {
    sequencing: [
      'first', 'firstly', 'first of all', 'to begin with', 'to start with', 'second', 'secondly', 'third',
      'thirdly', 'then', 'next', 'after that', 'afterwards', 'finally', 'lastly', 'step one', 'the first step',
      'the next step', 'the last step', 'once that is done', 'meanwhile', 'at the same time', 'before that',
    ],
    reasoning: [
      'because', 'since', 'therefore', 'so that', 'which is why', 'that is why', 'as a result', 'due to',
      'hence', 'the reason is', 'the reason why', 'this means', 'which means', 'in order to', 'thus',
      'this helps', 'that helps', 'this way', 'that way', 'consequently', 'this shows', 'so i', 're:if .{1,40} then',
      'taught me', 'which taught me', 'that is because', 'which helps', 'so they', 'so the customer', 'so we', 'so it',
    ],
    example: [
      'for example', 'for instance', 'such as', 'like when', 'one time', 'once i', 'in my previous',
      'in my last', 'at my previous', 'at my last', 'a situation where', 'there was a time', 'i remember',
      'for one', 'to give an example', 'take for example', 'during my', 'in college', 'in my college',
      'in school', 'in my internship', 'when i was',
    ],
    contrast: [
      'however', 'although', 'on the other hand', 'whereas', 'even though', 'but', 'instead', 'despite',
      'in contrast', 'on the contrary', 'yet',
    ],
    summary: [
      'in short', 'overall', 'to summarize', 'to summarise', 'in conclusion', 'to conclude', 'all in all',
      'in summary', 'to sum up', 'that is how', 'so overall', 'in the end', 'at the end of the day',
    ],
  };

  // STAR method markers for behavioural answers.
  const STAR = {
    situation: [
      'when i was', 'once', 'one time', 'there was a', 'there was an', 'in my previous', 'at my last',
      'at my previous', 'during my', 'in college', 'in my college', 'last year', 'a few months ago',
      'situation', 'i was working', 'i was studying', 'it happened', 'we had a', 'in my last job',
      'in my internship', 'one day', 're:\\d+ (year|month)s? ago',
    ],
    task: [
      'i had to', 'my role was', 'my task was', 'i was responsible', 'my responsibility', 'i needed to',
      'the goal was', 'our goal', 'my goal', 'the target', 'we had to', 'i was asked to', 'i was given',
      'the challenge was', 'the problem was', 'the deadline', 'my job was',
    ],
    action: [
      'i decided', 'i started', 'i spoke', 'i talked', 'i explained', 'i listened', 'i called', 'i made',
      'i took', 'i created', 'i organized', 'i organised', 'i planned', 'i helped', 'i handled',
      'i calmed', 'i offered', 'i escalated', 'i worked', 'i divided', 'i prioritized', 'i prioritised',
      'i asked', 'i checked', 'i stayed', 'i focused', 'i learned how', 'i learnt how', 'i approached',
      'i suggested', 'i coordinated', 'i followed up', 'i apologized', 'i apologised', 'i made sure',
      'i set', 'i broke', 'i reached out', 'i put in', 'i practised', 'i practiced',
    ],
    result: [
      'as a result', 'finally', 'in the end', 'eventually', 'the result', 'which led to', 'resulted',
      'was happy', 'were happy', 'was satisfied', 'were satisfied', 'solved', 'resolved', 'improved',
      'increased', 'achieved', 'i learned', 'i learnt', 'we completed', 'i completed', 'we won', 'i won',
      'on time', 'got appreciated', 'appreciated', 'thanked me', 'positive feedback', 'got promoted',
      'successfully', 'reduced', 'saved', 'met the target', 'met the deadline', 'exceeded', 'the outcome',
      're:\\d+ ?(percent|%)',
    ],
  };

  // Empathy & customer-service language.
  const EMPATHY = [
    'sorry', 'i apologize', 'i apologise', 'apologize for', 'apologise for', 'i understand', 'i can understand',
    'i completely understand', 'i totally understand', 'understand your', 'frustrat*', 'inconvenience',
    'i can imagine', 'i hear you', 'i realize', 'i realise', 'that must be', 'must be difficult',
    'must be frustrating', 'patien*', 'stay calm', 'remain calm', 'keep calm', 'calmly', 'politely', 'polite',
    'listen carefully', 'listen to', 'listen patiently', 'actively listen', 'active listening',
    'empath*', 'their feelings', 'his feelings', 'her feelings', 'make them feel', 'feel heard', 'valued',
    'reassure', 'assure', 'rest assured', 'i am here to help', 'happy to help', 'glad to help',
  ];

  const POLITE = ['please', 'thank you', 'thanks', 'kindly', 'may i', 'could you', 'would you', 'appreciate'];

  // Small sentiment lexicons for attitude.
  const POSITIVE = [
    'good', 'great', 'excellent', 'happy', 'love', 'enjoy*', 'passion*', 'excit*', 'eager', 'motivat*',
    'confident', 'positive', 'opportunit*', 'grow', 'growth', 'growing', 'learn', 'learning', 'improv*',
    'achiev*', 'succe*', 'best', 'better', 'helpful', 'help', 'helping', 'support*', 'team*', 'proud',
    'interest*', 'wonderful', 'amazing', 'glad', 'pleased', 'appreciat*', 'thankful', 'grateful',
    'satisf*', 'strong', 'strength*', 'dedicat*', 'hardworking', 'hard working', 'committed', 'commitment',
    'enthusias*', 'flexib*', 'patient', 'calm', 'friendly', 'polite', 'respect*', 'fun', 'nice',
    'comfortable', 'ready', 'willing', 'keen', 'inspir*', 'reward*', 'curious', 'energetic', 'reliable',
    'honest', 'punctual', 'disciplin*', 'adapt*', 'creative', 'innovative', 'efficient', 'productive',
  ];
  const NEGATIVE = [
    'bad', 'worst', 'hate', 'hated', 'boring', 'bored', 'terrible', 'horrible', 'awful', 'toxic',
    'stressful', 'sad', 'upset', 'annoy*', 'lazy', 'unfair', 'useless', 'failed', 'failure', 'quit',
    'fired', 'nervous', 'scared', 'afraid', 'worried', 'tired', 'poor', 'pathetic', 'disgusting',
    'irritat*', 'hopeless', 'waste', 'regret', 'difficult boss', 'politics',
  ];

  /*
   * Red flags. `negatable` means "ignore if a negator appears just before it"
   * ("I would never hang up on a customer" is fine). Severity: high | medium | low.
   */
  const RED_FLAGS = [
    { id: 'money_only', label: 'Motivated only by money', severity: 'medium', negatable: true,
      terms: ['only for money', 'only for the money', 'just for money', 'just for the money', 'only because of money', 'only because of the salary', 'only for salary', 'just for salary', 'only for the salary', 'money is the only'] },
    { id: 'no_option', label: 'Sees the job as a last resort', severity: 'medium', negatable: false,
      terms: ['no other option', 'no other choice', 'did not get any other job', 'nothing else to do', 'no other job', 'did not get anything else', 'because i have to', 'forced to', 'my parents forced', 'last option'] },
    { id: 'temporary', label: 'Signals a short stay', severity: 'medium', negatable: true,
      terms: ['time pass', 'timepass', 'temporary job', 'for some time only', 'until i get a better', 'till i get a better', 'until i find a better', 'till i find a better', 'just for a few months', 'only for a few months', 'until i get a government job', 'till i get a government job'] },
    { id: 'bad_mouthing', label: 'Speaks negatively about past employer', severity: 'medium', negatable: true,
      terms: ['my boss was bad', 'my manager was bad', 'my boss was rude', 'my manager was rude', 'my boss was toxic', 'my manager was toxic', 'worst company', 'the company was bad', 'the company was worst', 'toxic environment', 'toxic company', 'hated my job', 'hated my boss', 'hated my manager', 'my team lead was bad', 'they were exploiting'] },
    { id: 'customer_hostility', label: 'Hostile approach to customers', severity: 'high', negatable: true,
      terms: ['hang up', 'cut the call', 'disconnect the call', 'shout back', 'shout at', 'yell at', 'argue with', 'fight with', 'i will get angry', 'i get angry', 'i also get angry', 'scold', 'insult', 'abuse them back', 'ignore the customer', 'ignore them', 'ignore him', 'ignore her', 'put them on hold forever'] },
    { id: 'shift_refusal', label: 'Not open to shifts / weekends', severity: 'medium', negatable: false,
      terms: ['cannot do night', 'cannot work night', 'cannot work in night', 'cannot work at night', 'will not do night', 'will not work night', 'not comfortable with night', 'not comfortable in night', 'not comfortable working night', 'not comfortable working in night', 'no night shift', 'not ready for night', 'only day shift', 'only morning shift', 'cannot work on weekends', 'will not work on weekends', 'not comfortable with rotational', 'not comfortable with weekend'] },
    { id: 'dishonesty', label: 'Suggests misleading customers', severity: 'high', negatable: true,
      terms: ['lie to the customer', 'lie to them', 'tell a lie', 'make something up', 'give any answer', 'give a fake', 'pretend to know', 'just say something'] },
    { id: 'disinterest', label: 'Shows little interest in the work', severity: 'medium', negatable: true,
      terms: ['i do not like talking', 'i do not like people', 'i do not like customers', 'not interested in this', 'not interested in bpo', 'i do not like this job', 'boring job', 'no interest'] },
    { id: 'no_weakness', label: 'Claims to have no weaknesses', severity: 'low', negatable: false,
      terms: ['i do not have any weakness', 'i have no weakness', 'i do not have weakness', 'i have no weaknesses', 'i do not have any weaknesses', 'no weakness'] },
  ];

  /*
   * Common grammar slips (especially common in Indian-English interviews) that
   * are reliably detectable in a transcript, with the correction to suggest.
   */
  const GRAMMAR = [
    { re: '(?<=^|(?:hello|hi|sir|madam|maam|morning|afternoon|evening|everyone|all|so|okay|yes|well|first) )myself (?:is )?(?!and |also |too |as |in |to |for )[a-z]+', wrong: 'Myself <name>', fix: 'I am <name> / My name is <name>', why: '"Myself" cannot be the subject of a sentence.' },
    { re: 'i am having (?:\\w+ )?(?:years?|experience|months?)', wrong: 'I am having … experience', fix: 'I have … experience', why: '"Have" meaning possession is not used in the continuous tense.' },
    { re: 'i am having (?:a |one )?(?:degree|knowledge|skills?)', wrong: 'I am having … knowledge/skills', fix: 'I have …', why: '"Have" meaning possession is not used in the continuous tense.' },
    { re: '(?:he|she|it) do not', wrong: 'he/she do not', fix: 'he/she does not', why: 'Third-person singular takes "does".' },
    { re: '(?<!(?:did|does|do|will|would|can|could|should|shall|may|might|must|let|to|make|made|help|helped|saw|see|watch|hear|heard|why|where|when|how|what|whether|if|that) )(?:he|she) (?:go|come|work|like|want|need|have|know|say|think) ', wrong: 'he/she + base verb', fix: 'he/she goes/works/likes…', why: 'Third-person singular verbs take -s.' },
    { re: '(?:we|they|you) was', wrong: 'we/they was', fix: 'we/they were', why: 'Plural subjects take "were".' },
    { re: 'i is', wrong: 'I is', fix: 'I am', why: '"I" takes "am".' },
    { re: 'more better', wrong: 'more better', fix: 'better', why: '"Better" is already comparative.' },
    { re: 'most best', wrong: 'most best', fix: 'best', why: '"Best" is already superlative.' },
    { re: 'discuss about', wrong: 'discuss about', fix: 'discuss', why: '"Discuss" does not take "about".' },
    { re: 'revert back', wrong: 'revert back', fix: 'revert / reply', why: '"Revert" already means to go back.' },
    { re: 'return back', wrong: 'return back', fix: 'return', why: '"Return" already means to go back.' },
    { re: 'repeat (?:it |that |this )?again', wrong: 'repeat again', fix: 'repeat', why: '"Repeat" already means again.' },
    { re: 'cope up with', wrong: 'cope up with', fix: 'cope with', why: 'The phrase is "cope with".' },
    { re: 'since (?:\\d+|one|two|three|four|five|six|seven|eight|nine|ten|last) (?:years?|months?|weeks?|days?)(?! ago)', wrong: 'since <duration>', fix: 'for <duration>', why: 'Use "for" with a length of time, "since" with a starting point.' },
    { re: '(?:did|does|do) not (?:went|came|saw|did|knew|took|gave|made|wrote|spoke)', wrong: 'did not + past form', fix: 'did not + base verb (did not go)', why: 'After "did not", use the base verb.' },
    { re: 'did (?:went|came|saw|knew|took|gave|made)', wrong: 'did + past form', fix: 'did + base verb', why: 'After "did", use the base verb.' },
    { re: 'i am knowing', wrong: 'I am knowing', fix: 'I know', why: '"Know" is not used in the continuous tense.' },
    { re: 'i am understanding', wrong: 'I am understanding', fix: 'I understand', why: '"Understand" is not used in the continuous tense.' },
    { re: 'one of the (?:best|biggest|good) (?:company|thing|person|place|opportunity|experience)(?: |$)', wrong: 'one of the best + singular', fix: 'one of the best + plural (companies)', why: '"One of the" takes a plural noun.' },
    { re: 'each of (?:the |my )?\\w+ have', wrong: 'each of … have', fix: 'each of … has', why: '"Each" is singular.' },
    { re: 'passed out (?:from|in)', wrong: 'passed out from college', fix: 'graduated from college', why: '"Passed out" means fainted in international English.' },
    { re: 'do the needful', wrong: 'do the needful', fix: 'do what is needed', why: 'Regional phrase — sounds unnatural to international customers.' },
    { re: '(?:your|my) good name', wrong: 'good name', fix: 'name', why: 'Regional phrase — just say "name".' },
    { re: 'prepone', wrong: 'prepone', fix: 'bring forward / reschedule earlier', why: 'Regional word — not understood internationally.' },
    { re: 'out of station', wrong: 'out of station', fix: 'out of town', why: 'Regional phrase — not understood internationally.' },
    { re: 'what is your doubt', wrong: 'what is your doubt', fix: 'what is your question', why: 'Internationally "doubt" means disbelief; say "question".' },
    { re: 'i have a doubt', wrong: 'I have a doubt', fix: 'I have a question', why: 'Internationally "doubt" means disbelief; say "question".' },
  ];

  // Specific, concrete detail — makes an answer believable.
  const SPECIFICITY = [
    're:\\d+', 'percent', 'per cent', 'first prize', 'award', 'certificate', 'certified',
    're:(january|february|march|april|may|june|july|august|september|october|november|december)',
    're:(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand) (customers|calls|people|members|months|years|days|weeks|hours|minutes|tickets|clients|students|visitors|volunteers|percent)',
    'target', 'deadline', 'project', 'internship', 'company', 'team of',
  ];

  // Mock-call checklist used by the role-play stage.
  const CALL_CHECKLIST = {
    support: [
      { id: 'opening', label: 'Professional opening', tip: 'Greet and introduce yourself: "Thank you for calling, my name is Alex. How may I help you?"',
        terms: ['hello', 'hi', 'good morning', 'good afternoon', 'good evening', 'thank you for calling', 'thanks for calling', 'welcome', 'my name is', 'this is', 'how may i help', 'how can i help', 'how may i assist', 'how can i assist'] },
      { id: 'empathy', label: 'Empathy & apology', tip: 'Acknowledge feelings: "I am really sorry about this, I completely understand how frustrating it is."',
        terms: ['sorry', 'apologize', 'apologise', 'apologies', 'i understand', 'understand your', 'understand how', 'frustrat*', 'inconvenience', 'i can imagine', 'that must be', 'i hear you', 'i realize', 'i realise'] },
      { id: 'ownership', label: 'Takes ownership', tip: 'Own the problem: "Let me personally look into this for you right now."',
        terms: ['i will', 'let me', 'i am going to', 'i will make sure', 'i will personally', 'i assure', 'rest assured', 'i will help', 'i can help', 'i am here to help', 'allow me', 'i will check', 'i will look into', 'i will take care'] },
      { id: 'probing', label: 'Asks the right questions', tip: 'Verify details: "May I have your order number and registered phone number, please?"',
        terms: ['may i know', 'may i have', 'could you please', 'can you please', 'could you tell', 'can you tell', 'can i have', 'can i get', 'could you share', 'can you share', 'please share', 'please tell', 'please provide', 'order number', 'order id', 'account number', 'registered', 'phone number', 'mobile number', 'email', 'verify', 'confirm your', 'details'] },
      { id: 'resolution', label: 'Offers a clear solution', tip: 'Give a concrete next step and timeline: "I have raised a refund; it will reach your account in 3–5 business days."',
        terms: ['refund', 'replace*', 'resolve', 're:fix(ed)?', 'process', 'within', 'hours', 'business days', 'working days', 'days', 'ticket', 'complaint number', 'reference number', 'escalat*', 'technician', 'engineer', 'credit', 'compensat*', 'reverse', 'reversal', 'initiat*', 'raise', 'raised', 'reschedul*', 'arrange', 'dispatch', 'deliver*', 'call you back', 'callback', 'update you', 'follow up', 'supervisor', 'senior'] },
      { id: 'closing', label: 'Closes the call properly', tip: 'Close warmly: "Is there anything else I can help you with? Thank you for your patience, have a great day!"',
        terms: ['anything else', 'is there anything', 'thank you for your patience', 'thanks for your patience', 'thank you for calling', 'have a nice day', 'have a great day', 'have a good day', 'have a wonderful day', 'take care', 'thank you for your time', 'appreciate your patience', 'thank you for being'] },
    ],
    sales: [
      { id: 'opening', label: 'Greets & introduces self and company', tip: 'Open crisply: "Good evening, this is Alex calling from BrightNet."',
        terms: ['hello', 'hi', 'good morning', 'good afternoon', 'good evening', 'my name is', 'this is', 'calling from', 'calling on behalf'] },
      { id: 'permission', label: 'Respects the customer\'s time', tip: 'Ask permission: "Is this a good time to talk for two minutes?"',
        terms: ['good time', 'right time', 'a minute', 'two minutes', 'few minutes', 'a moment', 'may i take', 'can i take', 'is it okay', 'do you have time', 'will not take long', 'quickly'] },
      { id: 'probing', label: 'Understands the customer\'s needs', tip: 'Ask before pitching: "Which plan are you using right now, and what do you pay?"',
        terms: ['currently', 'are you using', 'do you use', 'what do you', 'how much do you', 'may i know', 'can i know', 'could you tell', 're:do you (have|need|want)', 'your needs', 'requirement', 'which plan', 'what kind'] },
      { id: 'value', label: 'Explains clear benefits', tip: 'Sell benefits, not features: "You will save ₹300 a month and get double the speed."',
        terms: ['benefit*', 'save', 'saving', 'offer', 'discount', 'free', 'feature*', 'advantage', 'faster', 'better', 'cheaper', 'speed', 'value', 'cashback', 'reward*', 'percent', 'limited', 'exclusive', 'special'] },
      { id: 'objection', label: 'Handles the objection', tip: 'Acknowledge, then reframe: "I completely understand. Many customers felt the same until they saw the savings."',
        terms: ['i understand', 'i completely understand', 'i totally understand', 'that is a valid', 'fair point', 'i hear you', 'many customers', 'actually', 'however', 'that is why', 'no hidden', 'no extra', 'only takes', 'cancel anytime', 'no commitment'] },
      { id: 'closing', label: 'Asks for the sale / next step', tip: 'Close with a clear ask: "Shall I go ahead and activate it for you today?"',
        terms: ['shall i', 'should i', 'can i go ahead', 'may i go ahead', 'would you like', 'do you want me', 'sign up', 'book', 'schedule', 'activate', 'call you back', 'send you', 'register you', 'today itself', 'right now', 'confirm'] },
    ],
  };

  // ~300 most frequent English words — used to estimate vocabulary sophistication.
  const COMMON_WORDS = new Set((
    'a about above after again against all also am an and any are as at be because been before being ' +
    'below between both but by can cannot could did do does doing down during each few for from further ' +
    'had has have having he her here hers herself him himself his how i if in into is it its itself just ' +
    'me more most my myself no nor not now of off on once only or other our ours ourselves out over own ' +
    'same she should so some such than that the their theirs them themselves then there these they this ' +
    'those through to too under until up very was we were what when where which while who whom why will ' +
    'with would you your yours yourself yourselves yes okay ok yeah also get got go going gone went come ' +
    'came make made take took know knew think thought see saw want say said tell told give gave like good ' +
    'well new first last long great little own other old right big high different small large next early ' +
    'young important few public bad same able time year people way day man thing woman life child world ' +
    'school state family student group country problem hand part place case week company system program ' +
    'question work government number night point home water room mother area money story fact month lot ' +
    'study book eye job word business issue side kind head house service friend father power hour game line ' +
    'end member law car city community name team minute idea kid body information back parent face others ' +
    'level office door health person art war history party result change morning reason research girl guy ' +
    'moment air teacher force education one two three four five six seven eight nine ten many much really ' +
    'always never sometimes often things something anything everything nothing someone anyone everyone ' +
    'use used help need feel try tried ask asked work worked call called keep let put mean seem leave ' +
    'start show hear play run move live believe bring happen write provide sit stand lose pay meet include ' +
    'continue set learn lead understand watch follow stop create speak read spend grow open walk win offer ' +
    'remember love consider appear buy wait serve die send expect build stay fall cut reach kill remain ' +
    'there here now then today still even back just only very so too quite really already yet again ever ' +
    'thank thanks please sir madam hello hi'
  ).split(/\s+/));

  const api = {
    FILLERS, HEDGES, CONFIDENT, NEGATIVE_SELF, DONT_KNOW, STRUCTURE, STAR, EMPATHY, POLITE,
    POSITIVE, NEGATIVE, RED_FLAGS, GRAMMAR, SPECIFICITY, CALL_CHECKLIST, COMMON_WORDS,
  };
  if (isNode) module.exports = api;
  else (root.AII = root.AII || {}).Lexicons = api;
})(typeof window !== 'undefined' ? window : globalThis);
