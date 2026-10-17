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
    'whatever', 'okay so',
    // "like" as a crutch ("i was like part of", "for like 30 minutes"), not the verb or "such as".
    're:(?<=(?:^| )(?:and|so|but|or|is|was|are|were|am|be|been|being|just|then|maybe|basically|actually|yeah|okay|sir|of|in|with|for|at|about|around|done|did|doing|had|having|handling|helping|think|feel|more|also so) )like(?! to(?: |$)| this| that| me| him| her| them| us| you| it(?: |$))',
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
    're:i (?:get|feel|become|am getting) (?:a bit |a little |little |very |so |too )?nervous', 'my english is not that', 'my english is not very', 'my english is not so',
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
      // how people actually introduce an example when speaking
      're:(?:at|in) (?:the|my|our|a) (?:store|shop|office|job|internship|company|college|hostel|call cent(?:re|er)|showroom|restaurant|bank|hospital|counter)',
      'like when', 'last year', 'one day', 'the other day', 'recently', 'there was a', 'there was an', 'in my experience', 'my neighbour', 'my neighbor', 'a customer came', 'one customer',
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
      're:\\d+ ?(percent|%)', 're:\\d+ star', 'rating', 'came back', 'called me back', 'asked for me', 'thanked', 'it worked', 'blessing*',
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
      terms: ['only for money', 'only for the money', 'just for money', 'just for the money', 'only because of money', 'only because of the salary', 'only for salary', 'just for salary', 'only for the salary', 'money is the only',
        'it is the pay', 'it is the money', 'it is the salary', 'it is for the money', 'mainly for money', 'mainly for the money', 'mainly for the salary', 'mainly the salary', 'mainly the money',
        're:(?:the )?main thing (?:is|for me is) (?:the )?(?:money|salary|pay|package|incentives?)', 'that is the main thing', 'for the incentives', 'only the salary', 'only salary matters', 'salary is the main'] },
    { id: 'no_option', label: 'Sees the job as a last resort', severity: 'medium', negatable: false,
      terms: ['no other option', 'no other choice', 'did not get any other job', 'nothing else to do', 'no other job', 'did not get anything else', 'because i have to', 'forced to', 'my parents forced', 'last option'] },
    { id: 'temporary', label: 'Signals a short stay', severity: 'medium', negatable: true,
      terms: ['time pass', 'timepass', 'temporary job', 'for some time only', 'until i get a better', 'till i get a better', 'until i find a better', 'till i find a better', 'just for a few months', 'only for a few months', 'until i get a government job', 'till i get a government job',
        'wherever i get a better', 'where i get a better', 'i will move', 'i will switch', 'switch to a better', 'move to a better', 'better package', 'leave this job', 'not long term', 'in the meantime', 'notice period', 'needs to leave', 'need to leave', 'might leave', 'government exam', 'government exams', 'government job', 'bank exam', 'bank exams', 'my result should come', 'more of a stepping stone', 'do not plan to stay', 'not planning to stay', 'stay on the phones for long', 'on the phones for long',
        're:leave (?:in|after|within) (?:\\d+|a few|one|two|three|six) (?:months?|years?)', 're:(?:start|run|running|open|starting) my own (?:business|brand|company|startup)'] },
    { id: 'bad_mouthing', label: 'Speaks negatively about past employer', severity: 'medium', negatable: true,
      terms: ['my boss was bad', 'my manager was bad', 'my boss was rude', 'my manager was rude', 'my boss was toxic', 'my manager was toxic', 'worst company', 'the company was bad', 'the company was worst', 'toxic environment', 'toxic company', 'hated my job', 'hated my boss', 'hated my manager', 'my team lead was bad', 'they were exploiting',
        're:(?:manager|managers|boss|management|company|team lead|supervisor|seniors?)(?: there)? (?:was|were|is|are) (?:so |very |really |just |totally )?(?:horrible|terrible|bad|worst|useless|toxic|pathetic|rude|unfair|stupid|clueless)',
        'no idea how to treat', 'it was terrible', 'targets were impossible', 'the targets were unrealistic', 'they did not care about employees'] },
    { id: 'dismissive', label: 'Dismissive of customers or blames others', severity: 'medium', negatable: true,
      terms: ['re:customers? (?:are|were|is) (?:just |mostly |always |so |very )?(?:unreasonable|stupid|idiots?|annoying|irritating|dumb|mad|crazy|useless)',
        'customers mostly just want', 'people talk about empathy', 'i do not sugarcoat', 'do not tolerate nonsense', 'i do not tolerate', 'not my fault', 'not my problem', 'not my job', 'that is their job', 'their job not mine',
        'you cannot make everyone happy', 'waste time on calls', 'too long on small talk', 'he should have checked', 'she should have checked', 'they should have checked', 'you should have checked', 'it is their fault', 'his own fault', 'their own fault'] },
    { id: 'customer_hostility', label: 'Hostile approach to customers', severity: 'high', negatable: true,
      terms: ['hang up', 'cut the call', 'disconnect the call', 'shout back', 'shout at', 'yell at', 'argue with', 'fight with', 'i will get angry', 'i get angry', 'i also get angry', 'scold', 'insult', 'abuse them back', 'ignore the customer', 'ignore them', 'ignore him', 'ignore her', 'put them on hold forever',
        'shouting will not help', 'shouting does not help', 'shouting does not change', 'shouting is not going to', 'shouting won', 'will not speed things up', 'calling multiple times will not', 'calling again and again will not',
        're:(?:i )?cannot help (?:him|her|you|them) unless', 'unless he speaks properly', 'unless you speak properly', 'speak properly', 'no point tolerating', 'warn them once', 'then disconnect', 'and then disconnect',
        're:(?:please |sir |madam |just |you need to )calm down', 'i cannot make it faster', 'let me stop you', 'stop you right there', 'you do not really need to call', 'you do not need to call again', 'nothing i can do', 'nothing more i can do', 'not much more to be done', 'that is not my department'] },
    { id: 'unprofessional', label: 'Casual or unprofessional language', severity: 'low', negatable: false,
      terms: ['bro', 'dude', 'chill', 'work hard party harder', 'party harder', 'whatever man', 'yaar', 'no big deal', 'okay bye', 'ok bye', 'yeah okay bye'] },
    { id: 'shift_refusal', label: 'Not open to shifts / weekends', severity: 'medium', negatable: false,
      terms: ['cannot do night', 'cannot work night', 'cannot work in night', 'cannot work at night', 'will not do night', 'will not work night', 'not comfortable with night', 'not comfortable in night', 'not comfortable working night', 'not comfortable working in night', 'no night shift', 'not ready for night', 'only day shift', 'only morning shift', 'cannot work on weekends', 'will not work on weekends', 'not comfortable with rotational', 'not comfortable with weekend'] },
    { id: 'dishonesty', label: 'Suggests misleading customers', severity: 'high', negatable: true,
      terms: ['lie to the customer', 'lie to them', 'tell a lie', 'make something up', 'give any answer', 'give a fake', 'pretend to know', 'just say something'] },
    { id: 'disinterest', label: 'Shows little interest in the work', severity: 'medium', negatable: true,
      terms: ['i do not like talking', 'i do not like people', 'i do not like customers', 'not interested in this', 'not interested in bpo', 'i do not like this job', 'boring job', 'no interest',
        'more interested in the data side', 'not interested in calls', 'do not want to stay on the floor', 'do not want to take calls'] },
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
    { re: '(?<!(?:did|does|do|will|would|can|could|should|shall|may|might|must|let|to|make|made|help|helped|saw|see|watch|hear|heard|why|where|when|how|what|whether|if|that) )(?:he|she) (?:also|always|never|usually|often|really|just|only) (?:go|come|work|like|want|need|have|know|say|think|talk|tell|give|take|make|get|call|live|speak|feel|help|ask|try)(?= |$)', wrong: 'he/she + base verb', fix: 'he/she goes/works/likes…', why: 'Third-person singular verbs take -s.' },
    { re: '(?<!(?:did|does|do|will|would|can|could|should|shall|may|might|must|let|to|make|made|help|helped|have|had|saw|see|watch|hear|heard|every) )(?:he|she) (?:talk|tell|give|take|make|get|call|live|speak|feel|become|study|help|check|ask|try|keep|look|start|stay|teach|pay|play|solve|explain|understand|listen|send|bring|buy|use)(?= |$)', wrong: 'he/she + base verb', fix: 'he/she talks/tells/gives…', why: 'Third-person singular verbs take -s.' },
    { re: '(?<!(?:did|does|do|will|would|can|could|should|shall|may|might|must|let|to|make|made|makes|help|helped|helps|have|had|has|saw|see|watch|hear|heard|every|whenever|each|what|how|why|where|whatever|a|the|let the|make the|help the|see the|have the|what the|how the|until the|unless the|before the|if the) )(?:my (?:friend|father|mother|brother|sister|uncle|aunt|cousin|neighbour|neighbor|manager|teacher|boss)|the customer|customer|the company|company) (?:also |always |never |only )?(?:say|go|come|work|want|have|know|think|talk|tell|give|take|get|live|speak|feel|become|ask|try|pay|expect|do not)(?= |$)', wrong: 'singular subject + base verb', fix: 'my friend says / the customer wants…', why: 'A singular subject takes a verb ending in -s.' },
    { re: 'i am (?:complete|completed|do|go|work|search|study|come|live|want|need|know|try|speak|talk|learn|make|take|give|belong|belonging|join|finish|finished|stay|think|agree)(?= |$)', wrong: 'I am + verb', fix: 'I have completed / I do / I know… (drop "am")', why: '"Am" is not used with the plain or past form of a verb.' },
    { re: '(?:i|we|they|you) (?:want|wanted|wants|need|needed|wish|plan|planned|decided|hope|would like|love|am going|going) (?:buy|go|do|become|make|get|learn|join|be|take|see|start|improve|grow|earn|build|give|speak|talk|work in|work as|work for|serve|settle|open|crack|clear)(?= |$)', wrong: 'want + verb (no "to")', fix: 'want to buy / need to learn…', why: 'Verbs like want, need, plan and hope are followed by "to" + verb.' },
    { re: 'listen (?:his|her|their|him|them|me|my|your|the customer|customer|problem|the problem|patiently his|patiently their|carefully his)(?= |$)', wrong: 'listen + person/thing', fix: 'listen to …', why: '"Listen" needs "to" before what you listen to.' },
    // ("friend's" is normalised to "friends", so only the bare singular is a slip.)
    { re: 'my (?:friend|neighbour|neighbor|father|mother|brother|sister|uncle|aunt|cousin|teacher) (?:bike|car|house|home|phone|mobile|laptop|shop|name|problem|business|wedding|marriage|birthday|office|company|account|computer|scooter|order|son|daughter)(?= |$)', wrong: 'my friend bike', fix: "my friend's bike", why: "Show possession with 's." },
    { re: '(?:it|he|she|bike|phone|problem|issue|that|this|order|payment|refund) (?:is|was) (?:start|come|go|solve|happen|become|stop|reach|finish|cancel|deliver|refund|replace)(?= |$)', wrong: 'is/was + plain verb', fix: 'it started / it was solved / it has come…', why: 'Use the past tense ("it started") or a full passive ("it was solved").' },
    { re: '(?:please )?do not (?:angry|upset|sad|tension|tense|worried|nervous|hyper)(?= |$)', wrong: 'do not angry', fix: 'please do not be angry / please do not worry', why: 'An adjective needs "be": "do not be angry".' },
    { re: '(?<!(?:a|an|the|my|our|his|her|this|that|each|every) )(?:many|several|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty|[2-9]|[1-9]\\d+|these|those|both|various|multiple|so many|lot of|lots of) (?:customer|agent|time|year|month|day|problem|call|person|friend|student|member|hour|minute|week|thing|query|issue|subject|employee|language|skill|shift|order|product)(?= |$)(?! (?:service|support|care|satisfaction|experience|centre|center|executive|handling|management|relationship|queries|course|program|programme|diploma|degree|internship|old|gap|contract|plan|warranty|period|break|training|job|base|rate|zone|pressure))', wrong: 'two year / many customer', fix: 'two years / many customers', why: 'After a number or "many", the noun is plural.' },
    { re: '(?:search|searching|searched|find|finding) (?:job|jobs|work)(?= |$)', wrong: 'searching job', fix: 'searching for a job / looking for a job', why: '"Search" needs "for" before what you are looking for.' },
    { re: 'i am (?:fresher|graduate|student|engineer|good listener|quick learner|hard worker|team player|people person|good communicator|commerce graduate|science graduate|arts graduate)(?= |$)', wrong: 'I am fresher', fix: 'I am a fresher', why: 'A singular job or role word needs "a/an".' },
    { re: '(?:did|do|doing|completed|complete|pursuing|pursued|finished) (?:diploma|internship|course|certification|certificate course|job)(?= |$)', wrong: 'did diploma', fix: 'did a diploma / completed an internship', why: 'A singular countable noun needs "a/an" or "my".' },
    { re: '(?:i am|i was|he is|she is|they are|we are) (?:very |so |really )?(?:interest|bore|excite|satisfy|disappoint|confuse|frustrate|worry) (?:in|with|about|by|for)(?= |$)', wrong: 'I am interest in', fix: 'I am interested in', why: 'Feelings take the -ed form: interested, excited, bored.' },
    { re: '(?:can|could|will|would|should|must|may|might|shall) (?:went|came|did|took|gave|made|knew|spoke|solved|helped|handled|checked|talked|worked|completed|resolved|explained)(?= |$)', wrong: 'will + past form', fix: 'will solve / can help…', why: 'After can/will/should, use the plain verb.' },
    { re: '(?:yesterday|last year|last month|last week|one time|once|that day|that time|ago) i (?:go|do|take|check|clean|say|tell|help|give|make|see|come|call|fix|solve|get|find|think|feel|explain|try|ask|talk|decide|start)(?= |$)', wrong: 'past event, present verb', fix: 'yesterday I went / one time I helped…', why: 'Use the past tense for something that already happened.' },
    { re: '(?:i|we|they|you|he|she) (?:have|has|had) (?:did|went|came|saw|took|gave|spoke|wrote|ate|knew|began)(?= |$)', wrong: 'have did / have went', fix: 'have done / have gone…', why: 'After have/has, use the past participle (done, gone, seen).' },
    { re: '(?:\\d+|one|two|three|four|five|six|seven|ten) (?:working|business) day(?= |$)', wrong: '5 working day', fix: '5 working days', why: 'After a number, the noun is plural.' },
    { re: '(?:different different|slowly slowly|daily daily|small small|nearby only|near only)(?= |$)', wrong: 'different different', fix: 'many different / slowly', why: 'Doubling a word is a regional habit; international customers find it unclear.' },
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

  // Vocabulary coach: informal or vague words, flagged every time they are used.
  const VOCAB = [
    { terms: ['gonna'], better: 'going to', why: 'Informal' },
    { terms: ['wanna'], better: 'want to', why: 'Informal' },
    { terms: ['gotta'], better: 'have to', why: 'Informal' },
    { terms: ['kinda'], better: 'rather / somewhat', why: 'Informal' },
    { terms: ['yeah', 'yep', 'yup'], better: 'yes', why: 'Informal' },
    { terms: ['yaar', 'bro', 'dude'], better: 'leave it out', why: 'Slang' },
    { terms: ['cool'], better: 'great / fine', why: 'Informal' },
    { terms: ['guys'], better: 'everyone / the team', why: 'Informal with customers' },
    { terms: ['stuff'], better: 'name it: tasks, products, issues…', why: 'Vague' },
  ];

  // Fine once, weak when repeated: flagged when used 3+ times in one answer.
  const OVERUSED = {
    good: 'great, strong, excellent, effective',
    very: 'really, extremely, or a stronger word (very good → excellent)',
    nice: 'pleasant, helpful, friendly',
    really: 'truly, genuinely',
    got: 'received, gained, earned',
    get: 'receive, gain, reach',
    lot: 'many, much, a great deal',
    bad: 'poor, difficult, disappointing',
    big: 'large, major, significant',
    happy: 'glad, pleased, delighted',
    thing: 'name it: the issue, the task, the step…',
    things: 'name them: the issues, the tasks, the steps…',
  };

  // Rehearsed, generic phrases: fine once, but answers built from them say little about the person.
  const CLICHES = [
    'hard working and dedicated', 'hardworking and dedicated', 'dedicated person', 'hard working person', 'hardworking person', 'quick learner', 'team player',
    'positive attitude', 'people person', 'people\'s person', 'peoples person', 'go getter', 'out of the box', 'outside the box', 'growth mindset', 'perfectionist',
    'attitude determines', 'natural leader', 'customer obsession', 'customer obsessed', 'add value', 'create value', 'leverage', 'win win', 'synergy', 'hustle',
    'passionate person', 'very passionate', 'self motivated', 'self-motivated', 'result oriented', 'goal oriented', 'reputed company', 'reputed position', 'company like yours',
    'growth of the organization', 'growth of the organisation', 'customer satisfaction is my first priority', 'customer is god', 'customer is king', 'i have all these qualities',
    'coming to my', 'that is all about me', 'short term goal', 'long term goal', 'stepping stone', 'bring to the table', 'energy is contagious', 'i am very good at reading people',
    // BPO jargon recited instead of explained
    'customer satisfaction', 'first call resolution', 'aht', 'csat', 'fcr', 'kpi', 'kpis', 'customer centric', 'customer focused', 'customer focus', 'result oriented', 'quality score',
    'empathy statements', 'active listening', 'professionalism', 'i hail from', 'i have all the qualities', 'best customer experience', 'valued customer',
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
      { id: 'resolution', label: 'Offers a concrete solution', tip: 'Say exactly what you will do: "I have raised a refund for the extra charge."',
        terms: ['refund', 'replace*', 're:fix(ed)? (?:it|this|the)', 'credit*', 'compensat*', 'reverse', 'reversal', 'reversed', 'initiat*', 'raise', 'raised', 'reschedul*', 'arrange', 'dispatch', 'escalat*', 'technician', 'engineer', 'reset', 'restart', 'call you back', 'callback', 'ticket', 'complaint number', 'reference number', 'transfer you to'] },
      { id: 'timeline', label: 'Gives a timeline or reference', tip: 'Tell the customer when and how they will know: "It will reach your account in 5–7 working days; your reference number is 4417."',
        terms: ['re:(?:\\d+|one|two|three|four|five|six|seven|ten|twenty four|forty eight|seventy two)(?: (?:to|or|-) (?:\\d+|two|three|five|seven|ten))? (?:working |business )?(?:days?|hours?|minutes?)', 'within', 'by tomorrow', 'by today', 'by end of day', 'by tonight', 'reference number', 'ticket number', 'complaint number', 'request number', 'sms', 'confirmation email', 'confirmation message', 'call you back'] },
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

  // Depth in a technical answer: trade-offs, complexity, edge cases, scale, real evidence.
  const TECH_DEPTH = [
    'trade off', 'tradeoff', 'trade offs', 'complexity', 'big o', 'o of n', 'o of 1', 'o of log n', 'o n', 'o 1',
    'constant time', 'linear time', 'logarithmic', 'n log n', 'edge case*', 'corner case*', 'scal*', 'latency',
    'throughput', 'bottleneck', 'consisten*', 'availab*', 'depends on', 'it depends', 'downside', 'disadvantage*',
    'whereas', 'compared to', 'versus', 'in production', 'in my project', 'benchmark*', 'profil*', 'measure*',
    // Trade-offs as engineers actually say them.
    'however', 'on the other hand', 'flip side', 'instead of', 'rather than', 'unless', 'overhead', 'expensive',
    'cheaper', 'slows down', 'slow down', 'can hurt', 'the cost', 'costs', 'drawback*', 'limitation*', 'pros and cons',
    'pitfall*', 'go wrong', 'goes wrong', 'fail open', 'race condition*', 'idempotent', 'stale', 'in practice',
    'at scale', 'n squared', 'quadratic', 'linear', 'worst case', 'best case', 'amortized',
  ];
  // Explaining why in technical answers ("so lookup is constant", "otherwise we lose data").
  const TECH_WHY = [
    'otherwise', 'in other words', 'which avoids', 'to avoid', 'to prevent', 'the idea is', 'the point is',
    're:so (?:the|a|an|that|lookup|lookups|threads|you|there|nobody|everyone|users|duplicates|going|our|my)',
  ];

  const api = {
    TECH_DEPTH, TECH_WHY,
    FILLERS, HEDGES, CONFIDENT, NEGATIVE_SELF, DONT_KNOW, STRUCTURE, STAR, EMPATHY, POLITE,
    POSITIVE, NEGATIVE, RED_FLAGS, GRAMMAR, VOCAB, OVERUSED, SPECIFICITY, CALL_CHECKLIST, COMMON_WORDS, CLICHES,
  };
  if (isNode) module.exports = api;
  else (root.AII = root.AII || {}).Lexicons = api;
})(typeof window !== 'undefined' ? window : globalThis);
