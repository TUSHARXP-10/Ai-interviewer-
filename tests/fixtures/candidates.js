/*
 * Scripted candidates used by the test suite and `npm run demo`.
 * Each profile answers by question id; follow-ups and mock-call turns get
 * their own entries. Timing/audio values imitate what the browser measures.
 */
'use strict';

const strong = {
  voice: { latencyMs: 1400, wpm: 145, audio: { voicedFrames: 600, longPauses: 0, longestPauseMs: 900, snrDb: 22, trailOffDb: 1, voicedRatio: 0.82, pitchFrames: 300, pitchSdSemitones: 3.1 } },
  answers: {
    intro_tell_me: "Good morning! My name is Ananya Iyer and I am from Bengaluru. I completed my Bachelor of Commerce from Christ University last year. During college I worked part-time at a retail store for eight months, where I handled around fifty customers a day and was awarded employee of the month twice. My strengths are clear communication, patience and being a quick learner. Outside work I enjoy reading and volunteering at an animal shelter. I am now looking to build a long-term career in customer service, because I genuinely enjoy solving problems for people, and I would like to grow into a team leader role.",
    intro_walk: "Sure. My name is Ananya Iyer, I am from Bengaluru, and I recently graduated in commerce from Christ University. I worked part-time at a retail store for eight months, handling around fifty customers a day, which taught me patience and clear communication. I enjoy reading and volunteering. My goal is to build a career in customer service and grow into a team leader role.",
    education: "I studied commerce at Christ University. Apart from accounting, I learned a lot from presentations and group projects, because they taught me to explain ideas clearly and work with different people. I was also the coordinator of our college fest, where I handled sponsors and visitors. These skills will help me with customers, since I can listen, stay calm and explain solutions simply.",
    last_job: "In my last job I was a customer support associate for an e-commerce client. My responsibilities were handling around sixty inbound calls a day about orders, refunds and delivery issues. I am most proud that I maintained a CSAT score of ninety-two percent for six months and was promoted to a subject matter expert, where I helped train five new joiners.",
    why_leave: "I had a great experience there and learned a lot about handling customers. However, after two years I am looking for new challenges and growth. This role offers international exposure and a clear career path, which is exactly the next step I want.",
    fresher_experience: "Yes, during college I coordinated our annual fest, where I managed around thirty volunteers and handled visitor queries at the help desk. One time a parent was upset because the schedule had changed, so I listened, apologized, and walked them to the right venue. I learned that staying calm and being clear makes people trust you.",
    why_bpo: "I want to work in a BPO because I genuinely enjoy helping people and solving their problems. I am a good communicator, and this role lets me use that skill every day. The industry is also growing fast, with international clients and a professional environment. Finally, there is a clear career path, for example from associate to team leader, quality analyst or trainer, so I can keep learning and growing.",
    why_cs_career: "What attracts me is the chance to help people every day and make their experience better. I enjoy conversations and I am naturally patient, which is important when customers are stressed. For example, at my retail job I handled difficult customers calmly and was appreciated for it. I also see good growth opportunities, such as becoming a trainer or team leader.",
    why_hire: "You should hire me because I bring three things. First, strong communication skills in English, which I proved by handling fifty customers a day at my retail job. Second, I am patient and calm under pressure; for example, I resolved complaints that others escalated. Third, I am a quick learner and I am fully committed to this role, so I will add value to the team and help meet your targets from the first month.",
    good_agent_qualities: "A great customer service executive needs patience, active listening, empathy, clear communication and problem solving. I have these qualities. For example, at my retail job a customer was upset about a wrong bill, and I listened patiently, apologized and fixed it within ten minutes. I am also a quick learner, which helps with product knowledge.",
    bpo_knowledge: "BPO stands for business process outsourcing. Companies outsource processes like customer support, technical support, sales or back office work to another company, which handles them on behalf of the client. There are voice processes, where agents handle calls, and non-voice processes like chat and email. Processes can be inbound or outbound, and international or domestic, and the work is measured with KPIs like AHT, CSAT and quality, usually in shifts.",
    inbound_outbound: "In an inbound process, customers call us with their queries or complaints, for example a bank customer calling about a blocked card. In an outbound process, the agent calls the customers, for example for sales, renewals, surveys or collections. So inbound is mostly support, while outbound is mostly sales and follow-ups.",
    aht_csat: "AHT means average handle time, which is the talk time plus hold time plus after-call work. CSAT means customer satisfaction score, usually from a survey after the call. To balance them, I focus on first call resolution and strong product knowledge, so I can resolve the issue quickly without rushing the customer.",
    great_service: "For me, excellent customer service means solving the customer's problem correctly the first time, quickly, while making them feel heard and valued. It means being polite and patient, keeping them updated, and going the extra mile, for example following up to make sure the issue is really resolved.",
    first_call_resolution: "First call resolution means resolving the customer's issue on the first contact, so they do not need to call back again. It is important because it improves customer satisfaction and reduces cost and repeat calls. It comes from good probing, product knowledge and taking ownership.",
    handle_angry: "First, I would let the customer speak without interrupting, because they need to feel heard. I would stay calm and not take it personally. Then I would apologize and say, I completely understand how frustrating this must be. Next, I would ask for the order number and verify the details to understand the exact issue. After that, I would offer a clear solution, such as a refund or replacement, with a timeline. If it needs approval, I would escalate to my supervisor and follow up with the customer.",
    abusive_customer: "I would stay calm and not take it personally. I would politely warn the customer and request them to keep the language respectful so that I can help resolve the issue. I would keep focusing on the problem and offer a solution. If the abuse continues, I would follow the company policy, which may mean escalating to my supervisor or disconnecting after the warnings.",
    dont_know_answer: "I would never guess or give wrong information. I would be honest and tell the customer I want to give them the correct information, then ask permission to place the call on hold for a minute. I would check the knowledge base, and if needed ask my team leader. If it takes longer, I would create a ticket and promise a call back within a specific time.",
    policy_refund: "First, I would empathize and thank the customer for being loyal. Then I would explain the policy clearly and politely, so they understand the reason. Next, I would offer alternatives, such as an exchange, store credit or a discount on the next purchase. Because the customer is valuable, I would also check with my supervisor whether an exception is possible, to protect the relationship.",
    target_pressure: "First, I would break the remaining target into a daily target so the gap feels manageable. Then I would prioritize the work with the highest conversion and put in extra effort. I would also review what the top performers are doing and learn from them, and support my teammates. Finally, I would keep my team leader updated every day on our progress.",
    pressure_time: "Last year, during my final exams, I also had a college project due in three days. My task was to finish the analysis and the presentation. I made a plan, divided the work into small tasks, and prioritized the most important parts first. I also asked my teammates to handle the formatting. As a result, we submitted on time, scored an A grade, and I learned how to stay calm and manage time under pressure.",
    helped_someone: "Once, a classmate was struggling with accounting before our exams and was very worried. I had to help her understand the basics in one week. I sat with her every evening, explained the concepts with simple examples and gave her practice questions. As a result, she passed with seventy percent and thanked me, and I learned that patience and simple explanations really help.",
    mistake: "In my internship, I once sent a report with the wrong figures to my manager. It was my mistake because I did not double check. I immediately informed my manager, apologized and corrected the report within an hour. Since then, I always double check my work before sending it, and I have not repeated that mistake.",
    teamwork: "In my final year, our team of five had to organize a college fest for two thousand visitors. My role was to manage the volunteers and the help desk. I coordinated schedules, held short daily meetings and helped teammates when someone was overloaded. As a result, the fest ran smoothly, we finished within budget and the principal appreciated our team.",
    listen_order: 'The customer name is Priya Sharma, the order number is 4572, and the city is Pune.',
    listen_ticket: 'The customer is David Miller, the refund amount is 350 dollars, and the ticket number is 8193.',
    listen_booking: 'The new date is the 15th of March, the destination is Delhi, and the booking reference is 749.',
    correct_dont: "She doesn't like to work on weekends.",
    correct_having: 'I have three years of experience in sales.',
    correct_yesterday: 'Yesterday I completed all my tasks.',
    correct_each: 'Each of the agents has a headset.',
    correct_go: 'He goes to the office every day by bus.',
    extempore_town: "My hometown is Mysuru, a beautiful city famous for its history and culture. First, you must visit the Mysore Palace, especially on Sunday evenings when it is lit with thousands of lights. Then, you should walk through the Devaraja market, which is full of flowers, fruits and spices. For food, you must try the famous Mysore pak, a delicious sweet, and a hot masala dosa. The people are friendly and welcoming, and during the Dasara festival the whole city celebrates. Overall, I would recommend visiting in October.",
    extempore_movie: "My favourite movie is 3 Idiots. It is about three engineering students and the pressure of the education system. I like it because it teaches that we should follow excellence and success will follow. Especially the scene where Rancho helps deliver a baby during a storm shows creativity under pressure. It inspired me to learn for understanding, not just marks.",
    shifts: 'Yes, I am completely comfortable with night shifts, rotational shifts and weekends. I understand it is part of the job, and I will manage my sleep routine and commute so it is not a problem.',
    strength_weakness: "My greatest strengths are patience and clear communication; for example, I handled difficult customers calmly at my retail job. One weakness is that I sometimes take on too much work myself. I am working on it by planning my day, prioritizing tasks and asking teammates for help early, and it is getting better.",
    five_years: 'In five years, I see myself as a team leader or quality analyst in this company. I want to learn the process deeply, be a top performer in the first year, and keep developing my leadership skills through training and certifications.',
    salary: 'Based on my research and the industry standard for this role, I expect around twenty-two thousand per month. However, I am open and flexible, because learning and growth opportunities are more important to me at this stage.',
    questions_for_us: 'Yes, I have two questions. What does the training look like in the first month, and how is performance measured for new joiners?',
  },
  followUps: {},
  roleplay: {
    support: [
      'Thank you for calling, my name is Ananya. I am really sorry to hear that, and I completely understand how frustrating this is. Could you please share your order number so I can look into it right away?',
      'Thank you. I have checked your account and I can see the double charge. I have raised a refund for the extra amount, and it will reach your account within 3 to 5 business days. Your reference number is 1 2 3 4.',
      'Is there anything else I can help you with today? Thank you for your patience, and have a great day!',
    ],
    sales: [
      'Good evening, this is Ananya calling from BrightNet. Is this a good time to talk for two minutes? We have a special offer for you: double your internet speed for just 10 dollars more per month, which means faster streaming and no buffering.',
      'I completely understand. Many customers felt the same, however with double the speed you can work and stream at the same time, and there is no extra installation charge. May I know how many people use the internet at home?',
      'Great! Shall I go ahead and activate it for you today? It only takes a minute, and you will get a confirmation message.',
    ],
  },
};

const weak = {
  voice: { latencyMs: 9500, wpm: 88, audio: { voicedFrames: 200, longPauses: 5, longestPauseMs: 4200, snrDb: 7, trailOffDb: 9, voicedRatio: 0.45, pitchFrames: 90, pitchSdSemitones: 0.9 } },
  answers: {
    intro_tell_me: 'Um myself Rahul. I am having uh B.A. degree. Basically I think I am, uh, hardworking. That is it.',
    intro_walk: 'Um myself Rahul. I am having uh B.A. degree. Basically I think I am, uh, hardworking. That is it.',
    education: 'I did B.A. from local college. Basically nothing much, I think.',
    last_job: 'I was working in a company. I did calls. My manager was bad so I left.',
    why_leave: 'My boss was rude and the company was worst, so I left.',
    fresher_experience: 'No, I do not have any experience.',
    why_bpo: 'Actually I want BPO job only for money, there is no other option for me right now.',
    why_cs_career: 'I think maybe it is easy job and salary is good.',
    why_hire: 'Because I need this job, I think I can do it maybe.',
    good_agent_qualities: 'Maybe good English. I do not know.',
    bpo_knowledge: 'I do not know much, it is call center I think.',
    inbound_outbound: 'I do not know.',
    aht_csat: 'I do not know these.',
    great_service: 'Customer should be happy I think.',
    first_call_resolution: 'I do not know.',
    handle_angry: 'I will tell him to calm down and if he keeps shouting I will cut the call.',
    abusive_customer: 'I will also shout at him, why should I listen.',
    dont_know_answer: 'I will just say something to the customer so he goes.',
    policy_refund: 'I will say no, it is the policy.',
    target_pressure: 'I do not know, maybe work more.',
    pressure_time: 'I think in exams there was pressure. I studied. It was okay.',
    helped_someone: 'I help my friends sometimes.',
    mistake: 'I do not make mistakes much.',
    teamwork: 'In college we did a project together. It was fine.',
    listen_order: 'Priya, order 4 7 5 2.',
    listen_ticket: 'David, ticket 8 9 1 3.',
    listen_booking: 'The 12th, Mumbai.',
    correct_dont: "She don't like to work on weekends.",
    correct_having: 'I am having three years experience in sales.',
    correct_yesterday: 'Yesterday I have completed all my tasks.',
    correct_each: 'Each of the agents have a headset.',
    correct_go: 'He go to office every day.',
    extempore_town: 'My town is small. It is good. There is a temple. Um that is all.',
    extempore_movie: 'I like action movies. They are good.',
    shifts: 'No, I cannot do night shifts.',
    strength_weakness: 'My strength is hardworking. I do not have any weakness.',
    five_years: 'I do not know, maybe government job.',
    salary: 'I want thirty thousand minimum.',
    questions_for_us: 'No.',
  },
  followUps: {
    default: 'I do not know, that is all.',
  },
  roleplay: {
    support: ['What is the problem?', 'Okay wait, I will check.', 'Ok bye.'],
    sales: ['Hello sir, you want new plan?', 'It is good plan, take it.', 'Okay, bye.'],
  },
};

/** An "average" candidate: the strong answers, but hesitant and wordy in delivery. */
const average = {
  voice: { latencyMs: 4200, wpm: 118, audio: { voicedFrames: 420, longPauses: 2, longestPauseMs: 2600, snrDb: 14, trailOffDb: 4, voicedRatio: 0.66, pitchFrames: 200, pitchSdSemitones: 1.8 } },
  answers: {},
  followUps: { default: 'Basically I think I would try my best, maybe, and ask my seniors for help.' },
  roleplay: {
    support: [
      'Hello, I am sorry for this. Can you tell me the order number please?',
      'Okay, I think the refund will come maybe in some days.',
      'Okay, thank you.',
    ],
    sales: [
      'Hello, I am calling from BrightNet, we have a new plan that is faster.',
      'I think it is not that expensive, maybe you can try it.',
      'Okay, should I send you the details?',
    ],
  },
};
for (const [id, text] of Object.entries(strong.answers)) {
  const sentences = text.split(/(?<=[.!?])\s+/);
  // Keep roughly 60% of the content, with hedges and fillers mixed in.
  const kept = sentences.slice(0, Math.max(1, Math.ceil(sentences.length * 0.6)));
  average.answers[id] = kept
    .map((s, i) => (i % 2 === 0 ? 'Basically I think ' + s.charAt(0).toLowerCase() + s.slice(1) : 'Um, ' + s))
    .join(' ');
}
// Listening and correction answers should not get fillers glued into the sentence.
Object.assign(average.answers, {
  listen_order: 'Priya Sharma, order number 4572, and the city was Pune I think.',
  listen_ticket: 'David Miller, 350 dollars, ticket 8139.',
  listen_booking: 'The 15th, Delhi, and the reference is 794.',
  correct_dont: "She doesn't like to work on weekends.",
  correct_having: 'I am having three years of experience in sales.',
  correct_yesterday: 'Yesterday I completed all my tasks.',
  correct_each: 'Each of the agents have a headset.',
  correct_go: 'He goes to the office every day by bus.',
  shifts: 'Yes, I think I can manage, but initially I would prefer day shifts.',
  questions_for_us: 'No, I think you explained everything. Thank you.',
});

module.exports = { strong, weak, average };
