/*
 * demo.js — scripted candidates and a runner that plays a whole interview
 * without a microphone. Powers "See a sample scoresheet" in the app,
 * `npm run demo`, and the automated tests.
 */
(function (root) {
  'use strict';
  const isNode = typeof module === 'object' && module.exports;
  const Engine = isNode ? require('./engine.js') : root.AII.Engine;
  const Scoring = isNode ? require('./scoring.js') : root.AII.Scoring;
  const Questions = isNode ? require('./questionBank.js') : root.AII.Questions;
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

  /**
   * A well-prepared experienced full-stack engineer, for the engineering sample scoresheet.
   * Covers every question a full-stack, experienced plan can ask, at any company.
   */
  const engineer = {
    voice: { latencyMs: 2100, wpm: 142, audio: { voicedFrames: 560, longPauses: 1, longestPauseMs: 1600, snrDb: 20, trailOffDb: 2, voicedRatio: 0.78, pitchFrames: 280, pitchSdSemitones: 2.6 } },
    answers: {
      tech_intro_experienced: "Sure. I currently work as a full-stack developer at a fintech startup in Pune, where my team builds the merchant dashboard. My stack is React and TypeScript on the frontend, Node.js and Python on the backend, with PostgreSQL and Redis. One piece of work I'm proud of: our reports page took eight seconds to load, so I added pagination, a proper index and a Redis cache, and it dropped to under one second, which reduced support tickets by thirty percent. My goal now is to grow into a senior engineer who owns systems end to end.",
      tech_project_walk: "The project I'm proudest of is an invoice reconciliation tool. The problem was that our finance team matched thousands of payments to invoices by hand in spreadsheets, which took two days every month. I designed the matching service and built the React review screen. I chose Python for the matching logic because pandas made the data work easy, and PostgreSQL because we needed transactions. The hardest problem was fuzzy matching, since references were often typed wrong, so I added a scoring step with a confidence threshold and a manual review queue. In the end we shipped it in six weeks, and the monthly close went from two days to three hours.",
      tech_project_bug: "The toughest bug was a payment webhook that sometimes marked orders as paid twice. It only happened under load, so first I added logs with request IDs and managed to reproduce it with a load test. It turned out two webhook retries were arriving at the same time, and both passed the check before either one wrote to the database, so it was a race condition. I fixed it with an idempotency key and a unique constraint, so the second write simply fails safely. Then I added a test for concurrent webhooks and an alert on duplicate payments, and it never came back.",
      tech_think_unclear: "First I would clarify the goal: I'd talk to my manager and, if possible, the users, and ask what problem this feature solves and how we'll know it worked. Then I'd write down the requirements and acceptance criteria, confirm them, and agree on a minimum first version. Next I'd break the work into small tasks with an estimate, and build a quick prototype or wireframe to get feedback early, because it's cheaper to fix a misunderstanding in a mock than in code. Throughout, I'd keep my manager updated and document the decisions we make.",
      tech_think_explain_api: "I'd say an API is like a waiter in a restaurant. You don't go into the kitchen yourself: you tell the waiter what you want, the waiter takes your request to the kitchen and brings back your food, which is the response. The menu is the contract: it lists what you can ask for and in what format. For example, when a travel app shows you the weather, it's asking a weather company's API for the forecast and getting the answer back.",
      tech_think_prioritise: "I'd start with the production bug, because it's affecting real users right now and has the biggest business impact. First I'd check how critical it is; if it's serious I'd roll back or apply a quick fix. At the same time I'd inform the person running the demo and my teammate, so nobody is surprised. If the bug takes longer, I'd ask a colleague to help or reschedule the demo by an hour. The code review is important but usually the least urgent, so I'd do it later the same day and tell my teammate when to expect it.",
      tech_lp_ownership: "At my last company, our nightly data export kept failing, and it wasn't my team's job; it belonged to a team that had been reorganised. The situation was that customers were complaining every Monday that their reports were missing. I decided to take ownership: I read the job's code, found it was running out of memory on large accounts, and rewrote it to stream the data in batches. I also added an alert and wrote a short runbook. As a result, the failures stopped completely, complaints dropped to zero, and the job was officially handed to my team.",
      tech_lp_disagree: "In my last project, my tech lead wanted to move our reporting to a new NoSQL database, and I disagreed because our data was highly relational. Instead of arguing, I listened to his concerns, which were really about slow queries, and asked for two days to build a small prototype. I brought data: with the right indexes, Postgres answered the slow queries in under two hundred milliseconds. We discussed it calmly in a one on one, and he agreed to keep Postgres. Even if he hadn't, I would have committed fully to the decision once it was made.",
      tech_lp_customer: "When I was working on our merchant dashboard, one small merchant complained that our CSV export broke their accounting software. It wasn't a big customer, and the format issue was partly on their side, but their whole month-end depended on it. I took it myself: I got on a call, reproduced the issue with their file, and added an export option in their software's format. The result was that the merchant closed their books on time, and later forty other merchants started using the same export, which reduced related support tickets.",
      tech_google_ambiguity: "When I joined my current team, I was asked to improve our search, with no clear definition of better and no previous owner. It was very unclear, so first I talked to support and sales to understand what users actually complained about, and I looked at the search logs. We found that most failed searches were spelling mistakes. Together with a teammate, I proposed a small first step, fuzzy matching, and measured it. In the end, failed searches dropped by forty percent, and that gave us a clear plan for the next quarter.",
      tech_google_help: "At my last job, a new teammate was stuck on his first task for a week; it was a feature in a part of the codebase with no documentation. It wasn't my task, but I could see he was losing confidence. I offered to pair with him for an hour each day, explained how the data flowed through the system, and helped him write the first tests. Together we also wrote a short guide for that module. As a result, he shipped the feature the next week, and the guide is now used by every new joiner on our team.",
      tech_ms_growth: "Early in my career I shipped a database migration without testing it on a copy of production data. It worked on my machine but failed on a large table and locked it for ten minutes, so the app was down. That was my mistake. I learned that real data behaves differently from test data, and that I should always plan a rollback. Since then, I always test migrations on a production-size copy, run them in small batches, and write the rollback step before I start. I haven't had a migration incident since.",
      tech_ms_learn: "Recently I taught myself TypeScript properly, because our codebase was growing and we kept hitting bugs from wrong data shapes. I decided to go deeper than just adding types. I read the official documentation and the handbook, did a short Udemy course on generics, and then practised by converting one small module at a time. I applied it in the project by migrating our API client to typed responses, which caught twelve bugs at compile time, and now I help teammates with their typing questions.",
      tech_product_deadline: "We once had a tight deadline: a big client's launch was in five days and they needed a bulk upload feature. Instead of building everything, I prioritised the core flow, uploading a CSV and seeing errors per row, and cut the nice-to-have parts like drag and drop and email reports, which we scheduled for later. I communicated the trade-off to the product manager and the client on day one, so expectations were clear. In the end we shipped on time, the client onboarded ten thousand records, and we added the extra features the next sprint.",
      tech_services_learn: "In my second project, the client used Angular, a new framework for me; I had only worked with React. I had one week before joining the team. I went through the official documentation and the tutorial, then built a small project, a to-do app with routing and forms, to practise. I also read our project's code to learn its patterns, and asked a senior for a short walkthrough. Within two weeks I delivered my first feature in the project, and I was later able to help another new joiner.",
      tech_services_team: "In my last project, our team of six built a claims portal for an insurance client. My role was the backend: I designed the database and built the claim status APIs. Midway, we had a problem: the frontend and backend developers kept breaking each other's work because the API kept changing. I suggested we agree on the API contract first, using Swagger, and hold a fifteen-minute daily sync. We did it together, and the issues stopped. As a result, we delivered the portal on time and the client extended the project.",
      tech_startup_why: "I want to work at a startup because I like ownership and impact: the code I write reaches users in days, not months, and I can learn across the whole stack. My experience fits well: I have built and shipped full-stack features end to end, from the database to the React screens. In my first month, I would focus on understanding the codebase and the product, talking to a few customers, and shipping small fixes in the first weeks, so I learn the deployment process and earn the team's trust.",
      tech_startup_shipped: "I built an expense-splitting app for my friends' trips, end to end, on my own. I designed the database in PostgreSQL, built the API in FastAPI, and the frontend in React. I chose FastAPI because it gave me validation and API docs for free. I deployed it on a small cloud server with Docker and set up automatic backups. The result was that about two hundred people used it over a year, and the most requested feature, settling up with the fewest payments, taught me a nice graph problem.",
      tech_why_company: "Mainly because of the scale and the engineering culture: products used by millions of users, built by teams that care about quality. My experience fits this role: I have built full-stack features end to end and improved performance on real production systems. I want to learn from strong engineers and grow by working on harder problems at a bigger scale. And I'll contribute by shipping reliable features quickly, and by helping the team with performance and code quality.",
      tech_flex_relocate: "Yes, I'm comfortable relocating and working in shifts if the project needs it. I've already planned for it and can adjust my routine.",
      cs_oop: "The four pillars are encapsulation, abstraction, inheritance and polymorphism. Encapsulation means bundling data and methods together and keeping fields private, with getters and setters. Abstraction means hiding the implementation details behind an interface. Inheritance lets a child class reuse a parent class. Polymorphism means the same method behaves differently: for example, Dog and Cat both override a speak method from Animal, so calling speak on any animal does the right thing.",
      cs_normalization: "Normalization means organising a database to remove redundancy, so the same data isn't repeated in many places. We split data into smaller tables linked by primary keys and foreign keys, following normal forms: first normal form, second and third. The reason is integrity: without it you get update anomalies, where changing a customer's address in one row leaves the old address in another. The trade-off is more joins, so for read-heavy reporting we sometimes denormalize on purpose.",
      cs_joins: "An inner join returns only the matching rows, the ones that exist in both tables. A left join returns all rows from the left table, plus the matches from the right, and fills in null where there's no match. For example, with customers and orders: an inner join shows only customers who have placed orders, while a left join shows every customer, and the order columns are null for customers who never ordered. That's how you find customers with no orders.",
      cs_process_thread: "A process is an independent program in execution with its own memory, its own address space. A thread is a unit of execution inside a process, and threads share the same memory. So threads are lighter and faster to create, and a context switch between threads is cheaper. The flip side is that shared memory needs synchronization, otherwise you get race conditions, and one thread crashing can take down the whole process, while processes are isolated and talk through IPC.",
      cs_tcp_udp: "TCP is connection oriented and reliable: it does a handshake, acknowledges packets and guarantees they arrive in order, resending lost ones. UDP is connectionless, with no guarantee of delivery or order, but it's faster with less overhead. So I'd use TCP for web traffic over HTTP, email, file transfer or banking, where every byte matters. I'd use UDP for video calls, live streaming, gaming and DNS, where speed matters more and a lost packet is better skipped than resent.",
      cs_sdlc: "The software development life cycle is the set of phases to build software: requirements, design, development, testing, deployment and maintenance. Waterfall does these phases sequentially, one after another, with a fixed plan, so it's hard to go back once a phase is done. Agile is iterative: we build in small increments, in sprints of one or two weeks, and get feedback after each one, so it's flexible when requirements change. Scrum is a popular Agile framework, with a backlog, daily standups and retrospectives.",
      cs_deadlock: "A deadlock is when two or more threads are stuck forever, waiting for each other to release a resource. For example, thread A holds lock one and waits for lock two, while thread B holds lock two and waits for lock one. It needs four conditions: mutual exclusion, hold and wait, no preemption and circular wait. To prevent it you break one of them: the most practical is to always acquire locks in the same order, or use a timeout with try lock, so a thread backs off instead of waiting forever.",
      cs_url: "First the browser checks its cache, then uses DNS to resolve the domain name to an IP address. Then it opens a TCP connection with a handshake, and for HTTPS a TLS handshake to encrypt it. It sends an HTTP GET request, which may pass through a CDN or a load balancer to a server, and the server returns a response with a status code and the HTML. Finally the browser parses the HTML, builds the DOM, fetches the CSS and JavaScript, and renders the page.",
      fs_rest: "A RESTful API is organised around resources, each with its own URL, like slash orders slash forty-two, and it's stateless: each request carries everything the server needs. You use the HTTP method for the action: GET to read data, POST to create a new resource, PUT to update or replace one, and DELETE to remove it. GET, PUT and DELETE should be idempotent. And you return proper status codes, like 200 for success, 201 for created, 400 for a bad request and 404 for not found.",
      fs_auth: "When a user logs in, the server checks the password against a stored hash, using something like bcrypt with a salt; we never store plain passwords. Then there are two common approaches. With sessions, the server stores a session and sends a session id in a cookie; it's easy to revoke but needs storage on the server. With JWT, the server sends a signed token with the user's identity, so it's stateless and scales easily, but it's hard to revoke, so you keep it short-lived with a refresh token. Either way I'd use secure, httpOnly cookies and protect against CSRF.",
      fs_sql_nosql: "I'd choose SQL, a relational database like Postgres, when the data has clear relationships and I need joins and ACID transactions, for example payments, orders or banking, where consistency is critical. I'd choose NoSQL, like MongoDB as a document store or a key value store, when the schema is flexible or changes often, or when I need to scale writes horizontally, for example a product catalog with different attributes, or activity logs. In practice I start with SQL unless there's a clear reason not to.",
      fs_cors: "CORS stands for cross origin resource sharing. By default, browsers follow the same origin policy: a page from one domain can't read responses from another domain. CORS lets a server allow specific origins with headers like Access-Control-Allow-Origin. For requests that aren't simple, for example with custom headers or JSON, the browser first sends a preflight OPTIONS request to check. Browsers enforce it for security: without it, a malicious site could use your logged-in cookies to read your private data from another site.",
      fs_caching: "I'd think about caching at several layers. In the browser, with Cache-Control headers and ETags, and a CDN for static assets. On the server, an in-memory cache or Redis for expensive results, like a product page or user permissions. And at the database level, caching query results or using materialized views. What can go wrong is mainly stale data and invalidation, so users see outdated prices. So I'd set a sensible TTL, invalidate on writes, and be careful with stampedes when a popular key expires.",
      fs_react_state: "I start simple: local state with useState for things only one component cares about. When siblings need the same state, I lift it up to the parent and pass it down as props. If prop drilling gets deep, or the state is truly global, like the logged-in user or the theme, I use Context, or a store like Redux or Zustand for complex updates. And server state, data fetched from an API, I keep separate in React Query, which handles caching, refetching and loading states for me.",
      fe_rerender: "A component re-renders when its state changes, when its props change, or when its parent re-renders. React then builds a new virtual DOM and diffs it against the previous one, which is reconciliation, and only updates the real DOM where something changed. Keys help it match list items correctly. To avoid unnecessary re-renders, I'd wrap components in React memo, use useMemo and useCallback for expensive values and stable callbacks, and keep state close to where it's used, splitting big components so one change doesn't re-render everything.",
      fe_event_loop: "JavaScript is single threaded, with one call stack. When you call something async, like setTimeout or fetch, the browser's web APIs handle it in the background, and when it's done the callback goes into a queue. The event loop keeps checking: when the call stack is empty, it takes the next task. There are two queues: microtasks, like promise callbacks, and macrotasks, like setTimeout. Microtasks run first, all of them, before the next macrotask. So a resolved promise always runs before a setTimeout of zero.",
      fe_perf: "First I'd measure, with Lighthouse, the Core Web Vitals like LCP and CLS, and the DevTools network tab, to find what's actually slow. Then the usual fixes: reduce the JavaScript bundle with code splitting, tree shaking and lazy loading routes; compress images, serve WebP and lazy load images below the fold; use a CDN with good caching headers and HTTP 2; and remove render blocking resources with critical CSS and preloaded fonts, or server side rendering for the first paint. Then I'd measure again to confirm.",
      be_index: "An index is like the index of a book: it lets the database find rows quickly without scanning the whole table. Most indexes are a B-tree, a sorted structure, so lookups, ranges and sorting are fast. You add them on columns used in the WHERE clause, joins and ORDER BY, and a composite index for queries that filter on several columns. But an index can hurt: every insert and update also has to update the index, so it slows down writes and takes extra storage, and an index on a low-selectivity column like a boolean is often useless.",
      py_api: "I'd usually choose FastAPI, because it's fast, async, and uses Pydantic for validation, and it generates OpenAPI and Swagger docs automatically. For a larger app with an admin panel I might pick Django with Django REST Framework. I'd define routes for each endpoint, validate input with Pydantic models, and use SQLAlchemy as the ORM with Postgres, and Alembic for migrations. I'd write tests with pytest, and deploy it with Uvicorn behind Gunicorn in a Docker container.",
      dsa_two_sum: "The brute force way is two nested loops checking every pair, which is O of n squared. A better approach uses a hash map. I go through the array once, and for each number I compute the complement, the target minus the number. If the complement is already in the map, I've found the pair; otherwise I store the number with its index. That's O of n time and O of n extra space. For edge cases, I'd handle an empty array, no valid pair, negative numbers, and the same number used twice.",
      dsa_duplicates: "With ten million emails, I'd first normalise them: trim spaces and lowercase, so the same address in a different case counts as a duplicate. Then I'd go through the list once with a hash set: if the email is already in the set it's a duplicate, otherwise I add it. That's O of n time and O of n memory. Ten million emails is a few hundred megabytes, which usually fits in memory. If it doesn't fit, I'd use an external sort on disk, or split it into chunks by hash, so duplicates end up adjacent or in the same chunk.",
      dsa_lru: "I'd combine a hash map with a doubly linked list. The map goes from each key to its node in the list, so lookup is O of 1. The list keeps the order of use: the most recently used item at the head, the least recently used at the tail. On get, I find the node through the map and move it to the front. On put, I insert or update at the front, and if we're over capacity I evict the node at the tail and remove it from the map. All of these are constant time. In Java, LinkedHashMap does this almost for free.",
      dsa_intervals: "First I'd sort the intervals by start time. Then I go through them in order, keeping a list of merged intervals. For each interval, I compare it with the last merged one: if it starts before the previous one ends, they overlap, so I extend the end time to the larger of the two ends. Otherwise I add it as a new interval. Sorting dominates, so it's O of n log n time and O of n space. For edge cases: an empty list, a single interval, intervals that just touch, and one interval fully inside another.",
      dsa_top_k: "First I'd count the words: read the file line by line, as a stream, so I never load it all into memory, normalise each word and count it in a hash map. Then, to get the top ten, I'd use a min heap of size ten: push each word, and if the heap has more than ten, pop the smallest. That's O of n to count plus m log ten for m unique words, so basically linear. If even the counts don't fit in memory, I'd partition the words by hash into chunks, count each chunk and merge, like a map reduce job.",
      lld_parking: "I'd start with the main entities: a ParkingLot with several levels, each with parking spots, and a Vehicle with types like bike, car and truck. Spots have sizes: small, compact and large. The key operations are park, unpark and find an available spot, plus a Ticket that records the entry time for billing. I'd keep single responsibility: a SpotAllocator finds spots, and a PricingStrategy interface calculates the fee, so we can add new pricing without changing other classes. For concurrency, two cars must never get the same spot, so allocation needs a lock or an atomic update.",
      lld_library: "The main classes would be Book, for the title and author, and BookCopy, because the library has many copies of one book, plus Member, Librarian and a Catalog for search. A Loan connects a member to a copy, with issue and due dates. The operations are search, issue, return, renew and reserve. For relationships, one book has many copies, and a member has many loans. I'd follow single responsibility, with a separate FineCalculator, and use the observer pattern to notify members when a reserved book comes back.",
      design_url_shortener: "First the requirements: create a short link, redirect fast, and it's very read heavy. The API is a POST to create a link, and a GET on the short code that returns a 301 or 302 redirect. To generate the code, I'd use a counter or a unique ID generator and encode it in base 62, which avoids collisions. I'd store the mapping in a key value store, since it's a simple lookup. Reads go through a Redis cache and a CDN. To scale, I'd shard the database by code, add replicas, and run stateless servers behind a load balancer. Extras would be click analytics, link expiry and rate limiting to stop spam.",
      design_rate_limiter: "First I'd decide the key: limit per API key or per user, and per IP for anonymous traffic, maybe per endpoint. For the algorithm, I'd use a token bucket, which allows short bursts but enforces an average rate; a sliding window is another good option. Since we have multiple servers, the counters live in Redis, updated atomically, so there are no race conditions. When a client is over the limit, we reject the request with 429 Too Many Requests and a Retry-After header. I'd put it in the API gateway, and decide whether to fail open if Redis is down.",
      design_feed_frontend: "I'd load the feed with cursor-based pagination: fetch the first page, and use an Intersection Observer near the bottom to load more, which gives infinite scroll. To keep scrolling smooth with thousands of items, I'd virtualize the list with something like react window, so we only render the visible items. I'd cache pages with React Query so going back is instant. Images are lazy loaded with fixed-size placeholders to avoid layout shift, and I'd show skeleton cards while loading, an error state with retry, and keep it accessible for keyboard and screen readers.",
      design_cicd: "On every pull request, the CI pipeline would lint, run unit tests and build. After merge, it builds a Docker image, tags it with the version and pushes it to a registry, so the same artifact goes to every environment. For zero downtime, I'd use a rolling or blue green deployment, or a canary that shifts traffic gradually. Health checks, readiness and liveness probes, gate the traffic, with automatic rollback if errors spike. Database migrations must be backward compatible, and I'd manage the infrastructure with Terraform and hide unfinished work behind feature flags.",
      prac_slow: "First I'd measure and reproduce it: check the DevTools network tab and our monitoring, to see whether the time is in the frontend, an API call or the database. Very often it's the database: a slow query, a missing index, or an N plus 1 problem where we run one query per row. Then I'd fix the bottleneck: add an index, paginate, cache the expensive result, or optimise the frontend bundle. Finally I'd verify with a before and after comparison, and add an alert so we notice if it gets slow again.",
      prac_incident: "First, mitigate: I'd roll back to the previous version, or turn off the feature flag, because restoring service matters more than finding the cause at night. Then I'd communicate: post an update in the incident channel and inform the on-call lead, so everyone knows what's happening. Once it's stable, I'd investigate: check the logs and metrics and reproduce the issue in staging. The next day I'd write a blameless postmortem with the root cause, and add a test and an alert to prevent it from happening again.",
      prac_mvp: "On day one I'd talk to the product manager and a couple of users to define the core: the one or two must-have flows, and cut everything else. I'd build on our existing stack and use libraries rather than custom code, to keep it simple. I'd deploy early behind a feature flag, and ship small increments daily to a few real users, so we get feedback and measure usage with analytics. I'd write tests for the critical path, note the technical debt we're taking on, and plan to refactor it later.",
      prac_review: "First, correctness: does the logic do what the ticket says, are edge cases and null values handled, and is the error handling right. Then readability: clear naming, simple structure, and comments where the why isn't obvious. I check that there are tests for the new behaviour. I also look for performance and security problems, like N plus 1 queries, SQL injection or secrets in the code. And I keep the tone kind and constructive: I explain why, suggest instead of command, and point out what's good too.",
      questions_for_us: 'Yes, two questions. What does a typical first project look like for someone joining this team, and how do engineers here get feedback and grow?',
    },
    followUps: { default: "Sure. In numbers, it cut the load time by about forty percent. The trade-off was simplicity against performance, so I measured it with a quick benchmark first and covered the edge cases with tests." },
    roleplay: {},
  };

  /**
   * An answer built from a question's rubric, for scripted runs of roles nobody wrote answers for:
   * it names one way of saying each concept, so the run exercises the full scoring path.
   */
  function rubricAnswer(id) {
    const q = Questions.byId[id];
    if (!q) return '';
    if (q.stance) return 'Yes, I am comfortable with that, and I have planned for it.';
    const terms = (q.concepts || [])
      .map((c) => (c.terms || []).find((t) => !/[*]|^re:/.test(t)))
      .filter(Boolean);
    if (!terms.length) return 'Yes, two questions. What does the first month look like, and how do you measure success in this role?';
    return 'Let me think out loud. ' + terms.map((t) => 'An important part is ' + t + '.').join(' ') +
      ' For example, in my last project I used this, because the trade-off between simplicity and performance mattered, and I measured the result and tested the edge cases.';
  }

  function wordsIn(text) {
    return (String(text).match(/[A-Za-z0-9']+/g) || []).length;
  }

  /**
   * Play a full interview with a scripted candidate.
   * opts: { length, role, experience, mode, seed, name }
   */
  function runScripted(profileName, opts) {
    const o = Object.assign({ length: 'standard', role: 'voice', experience: 'fresher', mode: 'voice', seed: 42, name: 'Test Candidate' }, opts);
    const profile = PROFILES[profileName];
    if (!profile) throw new Error('Unknown profile: ' + profileName);
    const session = Engine.createSession(Object.assign({}, o));
    const checklist = (Questions.ROLES[o.role] || Questions.ROLES.general).checklist;
    const transcript = [];
    let clock = 0;
    const startedAt = o.startedAt || 1700000000000;

    const answerFor = (step) => {
      if (step.kind === 'roleplay') return (profile.roleplay[checklist] || [])[step.turn] || '';
      if (step.kind === 'followup') return profile.followUps[step.questionId] || profile.followUps.default || 'That is all I can add.';
      return profile.answers[step.questionId] || (profile === engineer ? rubricAnswer(step.questionId) : '');
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
      company: Questions.trackOf(o.role) === 'tech'
        ? Object.assign({ id: o.company || 'generic' }, Questions.COMPANIES[o.company] || Questions.COMPANIES.generic)
        : null,
      proctoring: o.proctoring || null, // camera proctoring results, when a test supplies them
    });
    return { sheet, transcript, session };
  }

  const PROFILES = { strong, weak, average, engineer };

  /** A strong example answer for a question, when one is written (not for calls or the topic talk). */
  function modelAnswer(qid) {
    return strong.answers[qid] || engineer.answers[qid] || null;
  }

  const api = { PROFILES, runScripted, modelAnswer };
  if (isNode) module.exports = api;
  else (root.AII = root.AII || {}).Demo = api;
})(typeof window !== 'undefined' ? window : globalThis);
