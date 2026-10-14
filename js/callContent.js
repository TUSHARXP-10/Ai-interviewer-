/*
 * callContent.js — what the live customer can say: problems (scenarios), moods (personas),
 * caller names, and the words for the topic-talk round. Data only; edit freely.
 *
 * Persona lines are templates: {issue}, {issueShort}, {stakes}, {detail}, {fixAsk} and
 * {curveball} come from the scenario. Everything here is spoken by text-to-speech, so
 * reference numbers are written digit by digit ("4, 5, 7, 2").
 */
(function (root) {
  'use strict';
  const isNode = typeof module === 'object' && module.exports;

  const SCENARIOS = [
    {
      "id": "double_charge",
      "title": "Charged twice for one order",
      "company": "ShopKart",
      "domain": "E-commerce",
      "issue": "I was charged twice for my last order",
      "issueShort": "the double charge",
      "stakes": "and that money was meant for my rent",
      "detail": "My order number is 4, 5, 7, 2. It was one thousand four hundred and ninety nine rupees, and it was taken from my account two times.",
      "refDigits": "4572",
      "issueTerms": [
        "charged twice",
        "double charge",
        "two times",
        "duplicate",
        "extra amount",
        "twice",
        "debited twice",
        "deducted twice",
        "second payment"
      ],
      "fixTerms": [
        "refund",
        "reverse",
        "reversal",
        "credit back",
        "raise a request",
        "return the extra",
        "money back",
        "refund request",
        "initiate"
      ],
      "fixAsk": "When will I get my money back?",
      "curveballs": [
        "Last time someone promised me a refund and nothing happened.",
        "Why can't you just cancel the whole order instead?"
      ],
      "goodPractice": "Apologise for the duplicate charge, verify the order number and amount, raise a refund for the extra payment, give a clear timeline such as five to seven working days with a reference number, and confirm nothing else is pending."
    },
    {
      "id": "internet_outage",
      "title": "Internet down for three days",
      "company": "QuickNet Broadband",
      "domain": "Broadband",
      "issue": "My home internet has not been working for three days",
      "issueShort": "my internet being down",
      "stakes": "and I work from home, so I am losing money every single day",
      "detail": "My account number is 8, 1, 0, 3, 6. The router light is blinking red, and I have already restarted it many times.",
      "refDigits": "81036",
      "issueTerms": [
        "internet",
        "not working",
        "no connection",
        "down",
        "outage",
        "router",
        "red light",
        "connectivity",
        "three days",
        "disconnected"
      ],
      "fixTerms": [
        "technician",
        "engineer",
        "visit",
        "restore",
        "reset",
        "troubleshoot",
        "raise a ticket",
        "complaint",
        "fix the line",
        "priority"
      ],
      "fixAsk": "When exactly will my internet start working again?",
      "curveballs": [
        "The last engineer said he would come and he never showed up.",
        "Am I still paying for these three days when nothing worked?"
      ],
      "goodPractice": "Acknowledge the work-from-home impact, verify the account, run quick line checks, book a priority technician visit with a time slot and complaint number, and offer a bill credit for the days without service."
    },
    {
      "id": "unauthorised_card_payment",
      "title": "Unknown payment on credit card",
      "company": "MetroBank",
      "domain": "Banking",
      "issue": "There is a payment on my credit card that I never made",
      "issueShort": "the payment I never made",
      "stakes": "and I am scared they will take even more money",
      "detail": "My card ends with 7, 7, 2, 9. The payment was eight thousand two hundred rupees, at some online store, last night at around eleven.",
      "refDigits": "7729",
      "issueTerms": [
        "unauthorised",
        "unauthorized",
        "fraud",
        "did not make",
        "never made",
        "unknown transaction",
        "suspicious",
        "someone else",
        "misuse"
      ],
      "fixTerms": [
        "block the card",
        "block",
        "dispute",
        "chargeback",
        "new card",
        "replacement card",
        "investigation",
        "raise a dispute",
        "temporary credit",
        "secure"
      ],
      "fixAsk": "Will I get that money back, and how long will it take?",
      "curveballs": [
        "What if they use my card again while we are talking?",
        "Why should I pay this bill when it was not even me?"
      ],
      "goodPractice": "Stay calm and reassuring, verify identity, block the card immediately, raise a dispute for the transaction, explain the investigation timeline and replacement card, and share the dispute reference number."
    },
    {
      "id": "flight_cancelled",
      "title": "Flight cancelled without notice",
      "company": "SkyAir",
      "domain": "Airline",
      "issue": "My flight was cancelled and I only found out at the airport",
      "issueShort": "my cancelled flight",
      "stakes": "and I have to reach my sister's wedding tomorrow morning",
      "detail": "My booking number is 5, 2, 9, 8, 4. It was the six forty evening flight from Delhi to Bengaluru, for two passengers.",
      "refDigits": "52984",
      "issueTerms": [
        "cancelled",
        "canceled",
        "cancellation",
        "flight",
        "no notice",
        "no message",
        "not informed",
        "airport"
      ],
      "fixTerms": [
        "rebook",
        "next flight",
        "alternate flight",
        "another flight",
        "full refund",
        "refund",
        "seat",
        "confirm",
        "hotel",
        "meal voucher"
      ],
      "fixAsk": "Can you put me on another flight tonight or not?",
      "curveballs": [
        "The next flight you are offering costs more. I am not paying anything extra.",
        "Nobody sent me a single message. How is that not your fault?"
      ],
      "goodPractice": "Apologise for the missed notification, verify the booking, offer the earliest alternate flight at no extra cost or a full refund, confirm the new booking and reference, and mention any hotel or meal support."
    },
    {
      "id": "food_order_missing",
      "title": "Food arrived cold and incomplete",
      "company": "FreshBite",
      "domain": "Food delivery",
      "issue": "My food order arrived cold and half the items are missing",
      "issueShort": "my missing food items",
      "stakes": "and I have guests sitting at home waiting to eat",
      "detail": "My order number is 3, 3, 0, 8, 1. I ordered two biryanis and one paneer tikka, and the paneer tikka never came.",
      "refDigits": "33081",
      "issueTerms": [
        "missing",
        "cold",
        "incomplete",
        "not delivered",
        "paneer tikka",
        "items",
        "half",
        "wrong order"
      ],
      "fixTerms": [
        "refund",
        "replacement",
        "re-deliver",
        "resend",
        "send again",
        "credit",
        "wallet",
        "partial refund",
        "compensation"
      ],
      "fixAsk": "So what are you going to do about it right now?",
      "curveballs": [
        "The delivery partner did not even pick up my call.",
        "I do not want coupons. I want my actual money back."
      ],
      "goodPractice": "Apologise for the experience, confirm the missing items against the order, offer an immediate refund or a fast re-delivery, give the refund timeline, and log feedback about the delivery partner."
    },
    {
      "id": "insurance_claim_rejected",
      "title": "Health claim rejected",
      "company": "SureShield Insurance",
      "domain": "Insurance",
      "issue": "My health insurance claim was rejected without any proper reason",
      "issueShort": "my rejected claim",
      "stakes": "and the hospital is asking me to pay the full bill",
      "detail": "My policy number is 6, 4, 1, 7, 0. The claim was for my father's surgery, around one lakh twenty thousand rupees.",
      "refDigits": "64170",
      "issueTerms": [
        "rejected",
        "claim",
        "denied",
        "declined",
        "no reason",
        "reason",
        "surgery",
        "not approved"
      ],
      "fixTerms": [
        "review",
        "re-evaluate",
        "reconsider",
        "escalate",
        "appeal",
        "documents",
        "reprocess",
        "claims team",
        "resubmit",
        "cashless"
      ],
      "fixAsk": "How long will this review take? The hospital will not wait.",
      "curveballs": [
        "I have paid my premium on time for eight years.",
        "They are saying it is a pre-existing illness, but nobody told me that when I bought the policy."
      ],
      "goodPractice": "Show empathy for the medical situation, verify the policy, explain the exact rejection reason, escalate for review or guide on documents to resubmit, give a review timeline and reference, and offer to coordinate with the hospital desk."
    },
    {
      "id": "high_electricity_bill",
      "title": "Electricity bill four times higher",
      "company": "BrightPower Electricity",
      "domain": "Utilities",
      "issue": "My electricity bill this month is four times higher than usual",
      "issueShort": "my wrong electricity bill",
      "stakes": "and I am a pensioner who cannot pay this much",
      "detail": "My consumer number is 9, 0, 4, 5, 2. I usually pay around eight hundred rupees, and this time the bill is three thousand four hundred rupees.",
      "refDigits": "90452",
      "issueTerms": [
        "high bill",
        "higher",
        "four times",
        "excess",
        "wrong bill",
        "meter",
        "reading",
        "units",
        "usual",
        "overcharged"
      ],
      "fixTerms": [
        "meter reading",
        "re-check",
        "recheck",
        "revise",
        "revised bill",
        "correction",
        "technician",
        "inspection",
        "adjust",
        "hold the payment"
      ],
      "fixAsk": "Do I have to pay this amount before the due date or not?",
      "curveballs": [
        "Nobody even came to read my meter this month.",
        "If I do not pay, will you cut my electricity?"
      ],
      "goodPractice": "Be patient and respectful, verify the consumer number, compare past usage, raise a meter re-check or bill correction, confirm there is no disconnection while the complaint is open, and share the complaint number and timeline."
    },
    {
      "id": "recharge_not_active",
      "title": "Recharge done, plan not active",
      "company": "SwiftCell",
      "domain": "Telecom",
      "issue": "I recharged my mobile number but the plan is still not active",
      "issueShort": "my recharge problem",
      "stakes": "and I need my phone for my job interviews today",
      "detail": "My mobile number ends with 4, 4, 6, 1. I paid five hundred and ninety nine rupees this morning, and the money was cut from my bank.",
      "refDigits": "4461",
      "issueTerms": [
        "recharge",
        "plan",
        "not active",
        "not activated",
        "no data",
        "balance",
        "payment",
        "debited",
        "pending"
      ],
      "fixTerms": [
        "activate",
        "activation",
        "credit the plan",
        "refresh",
        "refund",
        "retry",
        "escalate",
        "manually",
        "restart your phone"
      ],
      "fixAsk": "How long will it take for my plan to start?",
      "curveballs": [
        "My friend said I should just recharge again. Should I?",
        "If I miss an important call because of this, who is responsible?"
      ],
      "goodPractice": "Apologise, verify the number and transaction, check the payment status, activate the plan manually or raise a priority request, give a clear activation time with a refund fallback, and confirm the customer can make calls."
    },
    {
      "id": "wrong_item_delivered",
      "title": "Wrong product delivered",
      "company": "TrendBazaar",
      "domain": "E-commerce",
      "issue": "I ordered running shoes and you sent me a completely different product",
      "issueShort": "the wrong product",
      "stakes": "and I need them for a marathon this Sunday",
      "detail": "My order number is 2, 7, 1, 5, 9. I ordered blue running shoes in size nine, and I got a ladies handbag instead.",
      "refDigits": "27159",
      "issueTerms": [
        "wrong item",
        "wrong product",
        "different product",
        "handbag",
        "shoes",
        "incorrect",
        "mix up",
        "not what you ordered"
      ],
      "fixTerms": [
        "replacement",
        "exchange",
        "pickup",
        "return",
        "send the correct",
        "correct pair",
        "refund",
        "express delivery",
        "priority"
      ],
      "fixAsk": "Can you get the right shoes to me before Sunday?",
      "curveballs": [
        "I do not want to wait at home all day for your pickup person.",
        "If they do not reach by Sunday, I want a full refund and something extra."
      ],
      "goodPractice": "Apologise for the mix up, verify the order, arrange a replacement with express delivery and a scheduled pickup, set an honest delivery date, and offer a refund option if the deadline cannot be met."
    },
    {
      "id": "hotel_booking_missing",
      "title": "Hotel says no booking found",
      "company": "TripNest",
      "domain": "Travel",
      "issue": "I am standing at the hotel and they say my booking does not exist",
      "issueShort": "my missing hotel booking",
      "stakes": "and I have my wife and two small kids with me",
      "detail": "My booking number is 1, 8, 6, 0, 3. It is for two nights at Hotel Sea Breeze in Goa, and I paid six thousand five hundred rupees.",
      "refDigits": "18603",
      "issueTerms": [
        "booking",
        "not found",
        "no record",
        "reservation",
        "hotel",
        "does not exist",
        "missing",
        "check in"
      ],
      "fixTerms": [
        "call the hotel",
        "confirm",
        "re-confirm",
        "alternate hotel",
        "another hotel",
        "upgrade",
        "refund",
        "rebook",
        "room",
        "voucher"
      ],
      "fixAsk": "How long do I have to stand here with my kids?",
      "curveballs": [
        "The hotel manager says your company has not paid them.",
        "If you move me to another hotel, it better be the same standard or better."
      ],
      "goodPractice": "Show urgency and empathy, verify the booking, call the hotel directly to confirm the reservation or arrange an equal or better alternate hotel at no extra cost, give a callback time, and share a reference number."
    }
  ];

  const PERSONAS = [
    {
      "id": "aggressive",
      "label": "Angry",
      "description": "An angry, shouting customer who has already called before and demands immediate action.",
      "startMood": 85,
      "goodGain": 0.8,
      "badGain": 1.3,
      "lines": {
        "open": [
          "Hello! Finally someone picked up! {issue}, and I have called twice already. Nobody is helping me!",
          "Listen, I am very angry right now. {issue}. {stakes}. Fix this today!",
          "Are you people even working? {issue}! I have wasted my whole morning on hold."
        ],
        "noEmpathy": [
          "Don't just read your script to me! I am talking about {issueShort}. Do you even understand how serious this is?",
          "Are you listening to me at all? I said {issueShort}! Stop wasting my time.",
          "You sound like a robot. This is about {issueShort}, and you are not even acknowledging it!"
        ],
        "giveDetails": [
          "Fine, write it down. {detail}. Now don't make me repeat it again!",
          "I already gave this to the last person, but okay. {detail}. Happy now?",
          "{detail}. It is all in your system. Why do I have to keep telling you people?"
        ],
        "pushForAction": [
          "So what are you actually going to do about it? I don't want sorry, I want action!",
          "Hello? I am still waiting. Are you going to fix this or not?",
          "Stop talking in circles. Tell me one thing you will do for me right now!"
        ],
        "askFix": [
          "Okay. Now tell me straight. {fixAsk}? And don't say soon.",
          "Good. {fixAsk}? I want an exact answer this time.",
          "Alright, alright. {fixAsk}? Because I am not calling again."
        ],
        "vague": [
          "Soon? Shortly? I have heard all that before! {fixAsk}? Give me a proper time.",
          "That is not an answer! {fixAsk}? Tell me a date, or I am escalating this.",
          "We will look into it? Everybody says that! {fixAsk}? Be specific."
        ],
        "rude": [
          "Excuse me? Don't you dare talk to me like that! Put your supervisor on the line right now!",
          "So now it is my fault? Unbelievable! I want your manager, and I am filing a complaint.",
          "Is this how you treat customers? I am writing to your head office. Give me your supervisor!"
        ],
        "curveball": [
          "And wait, there is more. {curveball}. What are you going to do about that?",
          "One more thing, since you are here. {curveball}! This is getting worse and worse.",
          "Oh, and I forgot to tell you. {curveball}. Fix that also!"
        ],
        "acceptCurveball": [
          "Hmm. Okay, fine. At least you have an answer for that.",
          "Alright. That makes sense. Just make sure it actually happens.",
          "Okay. I will take your word on that one. Don't let me down."
        ],
        "satisfied": [
          "Okay. Honestly, I was ready to shout at everyone today, but you actually helped. Thank you, {agent}.",
          "Fine. That is what I wanted to hear. Thank you for sorting it out properly.",
          "Alright, I am calmer now. You handled this well. Thanks."
        ],
        "grudging": [
          "Fine. I will wait. But if this is not done, I am calling back, and I will not be this polite.",
          "Okay, whatever. I am not happy, but I will accept it for now.",
          "Hmm. It is not great, but fine. Just make sure it happens."
        ],
        "unhappy": [
          "This is useless. I have wasted my time, and nothing is solved. I am done with this company.",
          "Forget it. I will post about this everywhere. Very poor service.",
          "No, this is not acceptable. I am going to the consumer forum. Goodbye."
        ],
        "hangup": [
          "That's it! I am not talking to you anymore. I am disconnecting this call!",
          "Enough! You people are hopeless. I am hanging up and filing a complaint.",
          "I don't have to listen to this! Goodbye!"
        ],
        "noMore": [
          "No, that is all. Just make sure this does not happen again.",
          "Nothing else. Just do what you promised.",
          "No. One problem is more than enough for one day."
        ],
        "timeUp": [
          "Look, I have been on this call forever. I have to go. Just send me the update by message.",
          "I can't hold anymore, I have work to do. Sort it out and call me back.",
          "This is taking too long! I am leaving. Somebody better call me back today."
        ],
        "stillThere": [
          "Hello? Hello! Are you even there?",
          "Did you just go silent on me? Say something!",
          "Hello? Don't put me on mute! Are you there?"
        ],
        "confused": [
          "What? I didn't understand a word of that. Speak slowly and tell me in simple words.",
          "Stop using these big words. Just tell me simply what is happening.",
          "You are talking too fast. Say it again, clearly, in one line."
        ]
      }
    },
    {
      "id": "impatient",
      "label": "Impatient",
      "description": "A busy working professional squeezing the call between meetings who wants a quick, exact answer.",
      "startMood": 65,
      "goodGain": 0.9,
      "badGain": 1.2,
      "lines": {
        "open": [
          "Hi, I am between two meetings, so let's be quick. {issue}. {stakes}. What can you do?",
          "Hello, I have exactly five minutes. {issue}. I need this sorted on this call itself.",
          "Yes, hi. Quickly, please. {issue}. I don't have time for long hold music."
        ],
        "noEmpathy": [
          "I don't need the long greeting. Can we focus on {issueShort}, please?",
          "You are not getting to the point. The problem is {issueShort}.",
          "Please skip the script. Just deal with {issueShort}."
        ],
        "giveDetails": [
          "Quickly then. {detail}. Anything else you need?",
          "{detail}. Got it? Please move fast.",
          "Here you go. {detail}. Let's keep going."
        ],
        "pushForAction": [
          "Okay, so what is the next step? I really need to go.",
          "Can you just tell me the solution? I am short on time.",
          "I am waiting. What exactly are you going to do?"
        ],
        "askFix": [
          "Fine. {fixAsk}? One line answer, please.",
          "Good. Now quickly, {fixAsk}?",
          "Okay. {fixAsk}? I need to plan my day around it."
        ],
        "vague": [
          "Soon is not a time. {fixAsk}? Give me a date.",
          "I can't plan with maybe. {fixAsk}? Be exact.",
          "That is too vague for me. {fixAsk}? Hours or days?"
        ],
        "rude": [
          "Wow, that was unnecessary. Transfer me to your supervisor right now.",
          "I don't have time for attitude. Give me your employee number, I am escalating this.",
          "Seriously? I am paying for this service. Get me your manager."
        ],
        "curveball": [
          "Wait, one more thing before I go. {curveball}. Can you handle that also?",
          "Also, quickly. {curveball}. Can you fix that on this call?",
          "Oh, and one more thing. {curveball}. Same call, please. I don't want to call again."
        ],
        "acceptCurveball": [
          "Okay, good. That works.",
          "Fine, as long as it is done. Thanks.",
          "Alright, noted. Moving on."
        ],
        "satisfied": [
          "Perfect, that was quick and clear. Thanks, {agent}. I appreciate it.",
          "Great, that is exactly what I needed. Thank you for not wasting my time.",
          "Good. Sorted. Thanks a lot."
        ],
        "grudging": [
          "Okay. Not ideal, but I will take it.",
          "Fine. Just make sure I get a message when it is done.",
          "Alright. I wanted it faster, but okay."
        ],
        "unhappy": [
          "This has taken far too long, and nothing is solved. Very disappointing.",
          "I am not happy with this at all. I will think about switching to another company.",
          "Forget it. I will just write an email to your escalation team."
        ],
        "hangup": [
          "I am done. I don't have time for this. Goodbye.",
          "No, I am not continuing this call. Bye.",
          "That's enough. I am hanging up."
        ],
        "noMore": [
          "No, that's it. Bye.",
          "Nothing else, thanks. I have to run.",
          "No, all good. Bye bye."
        ],
        "timeUp": [
          "Sorry, my meeting is starting. I have to drop. Message me the update.",
          "I can't stay on any longer. Please call me back after six.",
          "That's it, I am out of time. Send everything by email."
        ],
        "stillThere": [
          "Hello? Are you there? I am in a hurry.",
          "Hello? I can't hear you. Are you still on the line?",
          "Hello? Please don't go silent, I really need to go."
        ],
        "confused": [
          "Sorry, that was too long. What is the short answer?",
          "I lost you there. Just tell me simply what happens next.",
          "Too much information. Please give me the one line version."
        ]
      }
    },
    {
      "id": "elderly",
      "label": "Elderly",
      "description": "A confused but polite senior citizen who needs simple language, patience and clear steps.",
      "startMood": 45,
      "goodGain": 1.2,
      "badGain": 1,
      "lines": {
        "open": [
          "Hello? Hello, beta, can you hear me? Sorry, I am not very good with these things. {issue}.",
          "Namaste, beta. My son usually handles all this, but he is out. {issue}. {stakes}.",
          "Hello, is this customer care? Good. Beta, {issue}. I don't understand what happened."
        ],
        "noEmpathy": [
          "Beta, I don't think you understood me. It is about {issueShort}. Please listen.",
          "Sorry, but you are not helping me with {issueShort}. I am old, beta, please be patient.",
          "Hello? You are talking about something else. My problem is {issueShort}."
        ],
        "giveDetails": [
          "Wait, wait, let me find my glasses. Yes, here it is. {detail}.",
          "One minute, beta, I wrote it down somewhere. Yes. {detail}. Is that correct?",
          "Okay, I will read it slowly. {detail}. Did you get it?"
        ],
        "pushForAction": [
          "So beta, what should I do now? Please tell me.",
          "I am confused. Will you fix it for me, or should I go somewhere else?",
          "Beta, please tell me what will happen now. I am worried."
        ],
        "askFix": [
          "Okay, beta. {fixAsk}? Please tell me slowly so I can write it down.",
          "Thank you, beta. Now tell me, {fixAsk}?",
          "Okay, okay. {fixAsk}? My son will ask me, so I must tell him correctly."
        ],
        "vague": [
          "Beta, what does that mean? {fixAsk}? Please give me a day I can remember.",
          "I did not understand. {fixAsk}? Tell me the exact day, please.",
          "Soon means when, beta? {fixAsk}? Old people need clear answers."
        ],
        "rude": [
          "Beta, why are you talking to me like this? I am only asking for help. Can I talk to your senior?",
          "There is no need to be rude. Please give me your supervisor. My son will also complain about this.",
          "I am old, but I deserve respect. Please connect me to someone senior."
        ],
        "curveball": [
          "Oh, and beta, I forgot to tell you. {curveball}. Is that also a problem?",
          "One more thing, beta. {curveball}. What should I do about that?",
          "Wait, beta, there is one more thing. {curveball}. Please help me with that also."
        ],
        "acceptCurveball": [
          "Okay, beta, that is good to know. Thank you for explaining.",
          "Oh, I see. Okay, okay. That makes sense now.",
          "Alright, beta. You have made it very easy for me."
        ],
        "satisfied": [
          "God bless you, beta. You were very patient with me. Thank you so much.",
          "Thank you, {agent}. You explained everything so nicely. Now I am not worried.",
          "Very good, beta. Very good. I will tell my son you helped me a lot."
        ],
        "grudging": [
          "Okay, beta, if you say so. I will wait. I hope it gets done.",
          "Alright. I am still a little confused, but I will trust you.",
          "Okay, okay. I will ask my son to check later."
        ],
        "unhappy": [
          "Beta, I am still confused, and my problem is not solved. I will ask my son to call.",
          "I don't think this is solved. I am very upset. Thank you anyway.",
          "No, beta, this is not helping. I will go to your office myself."
        ],
        "hangup": [
          "No, I cannot talk to someone like this. I am putting the phone down.",
          "This is very rude. I am ending this call now.",
          "Enough. My son will call your company. Goodbye."
        ],
        "noMore": [
          "No, beta, that's all. Thank you. Take care of yourself.",
          "Nothing else, beta. You have helped enough. God bless.",
          "No, no, that is all. Have you eaten lunch, beta? Okay, bye."
        ],
        "timeUp": [
          "Beta, I have to take my medicine now. Can you call me back later?",
          "Sorry, beta, someone is at the door. I have to go. Please call me again.",
          "I am getting tired, beta. Please call my son in the evening."
        ],
        "stillThere": [
          "Hello? Beta? Is the line cut?",
          "Hello? I can't hear anything. Are you there, beta?",
          "Hello? Hello? Did I press something wrong?"
        ],
        "confused": [
          "Beta, slowly, slowly. I didn't understand. Please explain in simple words.",
          "What is that? I don't know these computer words. Please tell me simply.",
          "Sorry, beta, you are speaking very fast. Can you say it again slowly?"
        ]
      }
    },
    {
      "id": "anxious",
      "label": "Anxious",
      "description": "A worried customer for whom the problem has a real financial or emotional cost, and who needs reassurance.",
      "startMood": 60,
      "goodGain": 1.3,
      "badGain": 1.1,
      "lines": {
        "open": [
          "Hello, sorry, I am really worried. {issue}. {stakes}. Please tell me it can be fixed.",
          "Hi, um, I don't know what to do. {issue}. I haven't slept properly because of this.",
          "Hello? Please help me. {issue}. {stakes}. I am really panicking."
        ],
        "noEmpathy": [
          "Sorry, but do you understand how stressful this is? It is about {issueShort}.",
          "You are not really answering me. I am very worried about {issueShort}.",
          "Please, I need you to take {issueShort} seriously. This really matters to me."
        ],
        "giveDetails": [
          "Yes, yes, I have it. {detail}. Is that enough? Please check.",
          "Okay, um, {detail}. Did I give you the right thing?",
          "Here. {detail}. Please tell me you can see it in your system."
        ],
        "pushForAction": [
          "So, is there anything you can do? Please tell me something.",
          "I am really scared this won't get fixed. What happens now?",
          "Please, just tell me there is a way to solve this."
        ],
        "askFix": [
          "Okay, thank you. That helps. {fixAsk}? I just need to know.",
          "Oh, thank God. {fixAsk}? Sorry, I just need to be sure.",
          "Okay, okay. {fixAsk}? I want to tell my family."
        ],
        "vague": [
          "But you didn't say when. {fixAsk}? Not knowing is making me more anxious.",
          "Sorry, I need something clearer. {fixAsk}? Please give me a date.",
          "That doesn't really calm me down. {fixAsk}? Can you promise a time?"
        ],
        "rude": [
          "Why are you being like this? I am already so stressed. Can I please speak to someone else?",
          "That is really hurtful. I am going to complain. Please connect me to your supervisor.",
          "I am not lying to you. I want to speak to a senior person, please."
        ],
        "curveball": [
          "Oh no, wait. There is something else. {curveball}. Is that going to be a problem too?",
          "Sorry, one more worry. {curveball}. What do I do about that?",
          "Wait, I just remembered. {curveball}. Please tell me that can also be sorted."
        ],
        "acceptCurveball": [
          "Oh, okay. That is a relief. Thank you for explaining.",
          "Alright. I feel a little better about that now.",
          "Okay, if you say so. Thank you, that calms me down."
        ],
        "satisfied": [
          "Thank you so much, {agent}. I can finally breathe. You really helped me today.",
          "Oh, what a relief. Thank you for being so patient and clear with me.",
          "Thank you. I was so stressed when I called, but now I feel much better."
        ],
        "grudging": [
          "Okay. I am still a bit nervous, but I will wait.",
          "Alright. I hope it really happens. I will keep checking.",
          "Fine. I am not fully relaxed, but thank you for trying."
        ],
        "unhappy": [
          "I am more worried now than when I called. This is not solved at all.",
          "I don't feel any better. I don't know what I am going to do now.",
          "No, this doesn't help. I will have to find some other way."
        ],
        "hangup": [
          "I can't take this anymore. I am ending the call.",
          "You are only making it worse. Goodbye.",
          "Please, just forget it. I am hanging up."
        ],
        "noMore": [
          "No, that's all. Thank you, really.",
          "No, nothing else. Sorry for being so worried.",
          "That's everything. Thank you for listening to me."
        ],
        "timeUp": [
          "Sorry, I have to go now. Can you please message me the details?",
          "I am getting another call, I have to drop. Please don't forget my case.",
          "I can't stay on the line any longer. Please call me back, I am really worried."
        ],
        "stillThere": [
          "Hello? Are you still there? Please don't disconnect.",
          "Hello? Did the call drop? Oh no.",
          "Hello? Are you checking something? Please say something."
        ],
        "confused": [
          "Sorry, I didn't follow that. Can you explain more simply? I am already confused.",
          "Too many things at once. Please tell me slowly what this means for me.",
          "I didn't understand. Does that mean it is fixed or not?"
        ]
      }
    },
    {
      "id": "polite",
      "label": "Polite",
      "description": "A calm, courteous customer calling for the second time who politely but firmly wants a real resolution.",
      "startMood": 40,
      "goodGain": 1.1,
      "badGain": 0.9,
      "lines": {
        "open": [
          "Good afternoon. I called about this a few days ago. {issue}. Nothing has happened since then.",
          "Hello, thank you for taking my call. This is my second time calling. {issue}. {stakes}.",
          "Hi, I hope you can help. {issue}. I was told it would be sorted, but it is still pending."
        ],
        "noEmpathy": [
          "I understand you have a process, but I would like you to look at {issueShort}, please.",
          "Sorry, I think we are going off track. My concern is {issueShort}.",
          "With respect, the last agent also said that. The issue is still {issueShort}."
        ],
        "giveDetails": [
          "Of course. {detail}. I gave the same details last time as well.",
          "Sure. {detail}. Please note it down so I don't have to repeat it.",
          "Yes, here you go. {detail}."
        ],
        "pushForAction": [
          "I appreciate that, but what will actually be done this time?",
          "Could you tell me the next step, please? I don't want to call a third time.",
          "Is there anything you can do from your side right now?"
        ],
        "askFix": [
          "Thank you. {fixAsk}? Could you also give me a reference number?",
          "That sounds good. {fixAsk}? I would like to note it down.",
          "Alright. {fixAsk}? Last time I was not given a clear answer."
        ],
        "vague": [
          "That is what I was told last time too. {fixAsk}? I need a firm commitment.",
          "Sorry, but could you be more specific? {fixAsk}?",
          "I would really appreciate a clear timeline. {fixAsk}?"
        ],
        "rude": [
          "I have been nothing but polite with you. I would like to speak to your supervisor, please.",
          "That is not a professional way to speak. I will be raising a complaint about this call.",
          "I don't think that tone is necessary. Please transfer me to a senior."
        ],
        "curveball": [
          "Before we finish, there is one more thing. {curveball}. Can you check that too?",
          "Also, I noticed something else. {curveball}. Could you please look into it?",
          "One more question, if you don't mind. {curveball}. What can be done?"
        ],
        "acceptCurveball": [
          "Okay, thank you. That answers my question.",
          "Alright, that is fair. Thank you for checking.",
          "Great, thank you for clarifying that."
        ],
        "satisfied": [
          "Thank you, {agent}. This is the first time someone has explained it properly.",
          "That is very helpful. Thank you for taking ownership of this.",
          "Wonderful. I am glad this is finally being handled. Thank you."
        ],
        "grudging": [
          "Alright. I will give it one more chance, but I hope it is not like last time.",
          "Okay. I am a little disappointed, but I will wait.",
          "Fine. I will wait, but if nothing happens, I will escalate."
        ],
        "unhappy": [
          "I am sorry, but this is the same answer as last time. I am not satisfied.",
          "I don't feel this is resolved. I will have to escalate it in writing.",
          "This is disappointing. I expected better on my second call."
        ],
        "hangup": [
          "I am sorry, I can't continue this conversation. Goodbye.",
          "I think I will end the call here. I will write to your grievance team.",
          "No, this is not acceptable. Good day."
        ],
        "noMore": [
          "No, that's all. Thank you for your help.",
          "Nothing else, thank you. Have a good day.",
          "No, I think we have covered everything. Thank you."
        ],
        "timeUp": [
          "I am sorry, I have to leave now. Could you please send me the update by message?",
          "I need to go now. Please call me back with an update.",
          "I have an appointment, so I have to end the call. Please follow up with me."
        ],
        "stillThere": [
          "Hello? Are you still with me?",
          "Hello? I think the line went quiet. Are you there?",
          "Excuse me, are you still on the call?"
        ],
        "confused": [
          "Sorry, I didn't quite follow. Could you explain that more simply?",
          "I am not sure what that means. Could you put it in plain words?",
          "Could you slow down a little? I missed some of that."
        ]
      }
    },
    {
      "id": "sarcastic",
      "label": "Sarcastic",
      "description": "A cynical customer who has heard empty promises before and mocks scripted answers.",
      "startMood": 70,
      "goodGain": 0.8,
      "badGain": 1.2,
      "lines": {
        "open": [
          "Oh good, a real human. Let me guess, you are going to help me? {issue}. Again.",
          "Hello. My favourite way to spend an afternoon. {issue}. {stakes}. Surprise me.",
          "Hi. So, {issue}. And yes, I have heard all your promises before."
        ],
        "noEmpathy": [
          "Wow, that was a lovely script. Now, about {issueShort}?",
          "Thank you for that speech. It did nothing for {issueShort}.",
          "Great, very helpful. Meanwhile, {issueShort} is still not fixed."
        ],
        "giveDetails": [
          "Sure, let me give it to you for the hundredth time. {detail}.",
          "Of course. {detail}. Shall I spell it for you as well?",
          "{detail}. I am sure it will vanish from your system again."
        ],
        "pushForAction": [
          "So, is this the part where you actually do something?",
          "Let me guess. You will raise a ticket, and nothing will happen?",
          "I am waiting for the magic solution. Any time now."
        ],
        "askFix": [
          "Okay, that sounds almost useful. {fixAsk}? And please be honest.",
          "Interesting. {fixAsk}? A real answer, not a customer care answer.",
          "Well, look at that. A plan. {fixAsk}?"
        ],
        "vague": [
          "Ah, the famous within some time. {fixAsk}? A date, please.",
          "Shortly. My favourite word. {fixAsk}?",
          "Very convincing. Now, {fixAsk}? Hours, days, or years?"
        ],
        "rude": [
          "Oh, lovely attitude. Put your supervisor on, I am sure they will love hearing about this.",
          "Wow. So it is my fault now? I am definitely complaining about this call.",
          "Brilliant customer service. Get me your manager, please."
        ],
        "curveball": [
          "Oh, and here is the best part. {curveball}. Want to fix that too?",
          "Wait, it gets better. {curveball}. Any ideas?",
          "Oh, did I mention? {curveball}. Wonderful, right?"
        ],
        "acceptCurveball": [
          "Huh. Okay, that actually makes sense.",
          "Fine. That is a better answer than I expected.",
          "Okay, I will believe it when I see it, but fine."
        ],
        "satisfied": [
          "Well, I am genuinely surprised. You actually helped. Thank you, {agent}.",
          "Okay, I take back half of what I said. That was good service.",
          "Fine, you win. That was clear and helpful. Thanks."
        ],
        "grudging": [
          "Sure. I will wait. Like always.",
          "Okay. I will believe it when it happens.",
          "Fine. Let's see if this promise is different from the others."
        ],
        "unhappy": [
          "Great, another call with no solution. Just what I expected.",
          "Well, that was a waste of my time. Thanks for nothing.",
          "Nothing has changed. I will just tell everyone how amazing your service is."
        ],
        "hangup": [
          "Okay, I am done. Enjoy your script. Bye.",
          "Wonderful talking to a wall. Goodbye.",
          "I have better things to do than this. Goodbye."
        ],
        "noMore": [
          "No, I think one disaster is enough for today.",
          "Nothing else. Let's not push our luck.",
          "No, that's all. For now."
        ],
        "timeUp": [
          "I have spent enough of my life on this call. I am leaving. Message me.",
          "Look, I have to go. Call me when something actually happens.",
          "Time is up for me. I am sure you will call back. Or not."
        ],
        "stillThere": [
          "Hello? Did you go to make tea?",
          "Hello? Is this the famous hold, or did you leave?",
          "Hello? Anyone? Great."
        ],
        "confused": [
          "Could you say that in normal English, not company language?",
          "I understood nothing. Try again, in simple words.",
          "That sounded very official. What does it actually mean?"
        ]
      }
    }
  ];

  const NAMES = {
    "female": [
      "Priya Sharma",
      "Neha Gupta",
      "Anjali Mehta",
      "Kavita Rao",
      "Sunita Joshi",
      "Pooja Nair",
      "Meera Iyer",
      "Ritu Singh"
    ],
    "male": [
      "Rajesh Kumar",
      "Amit Verma",
      "Sanjay Patel",
      "Vikram Reddy",
      "Arjun Nair",
      "Manoj Das",
      "Rahul Mehta",
      "Suresh Pillai"
    ]
  };

  // Round 3: one random word, up to three minutes of talk.
  const TOPICS = [
    {
      "word": "Patience",
      "terms": [
        "patien*",
        "wait*",
        "calm",
        "temper",
        "rush*",
        "slow*",
        "hurry",
        "tolerat*",
        "irritat*",
        "frustrat*"
      ],
      "angles": [
        "a time you had to be patient",
        "why patience matters with customers",
        "how you stay calm when things are slow"
      ]
    },
    {
      "word": "Honesty",
      "terms": [
        "honest*",
        "truth*",
        "lie",
        "lies",
        "lying",
        "trust*",
        "fair*",
        "cheat*",
        "sincere"
      ],
      "angles": [
        "a time telling the truth was hard",
        "why customers value honesty",
        "honesty at work"
      ]
    },
    {
      "word": "Kindness",
      "terms": [
        "kind*",
        "help*",
        "care*",
        "caring",
        "generous*",
        "smile*",
        "gentle",
        "respect*",
        "thoughtful"
      ],
      "angles": [
        "a small act of kindness you remember",
        "kindness to strangers",
        "why kindness matters at work"
      ]
    },
    {
      "word": "Discipline",
      "terms": [
        "time table",
        "disciplin*",
        "routine*",
        "habit*",
        "schedule*",
        "punctual*",
        "regular*",
        "consistent*",
        "focus*"
      ],
      "angles": [
        "your daily routine",
        "someone disciplined you admire",
        "discipline and success"
      ]
    },
    {
      "word": "Failure",
      "terms": [
        "fail*",
        "mistake*",
        "lesson*",
        "learn*",
        "try",
        "again",
        "tried",
        "setback*",
        "lose",
        "lost",
        "disappoint*"
      ],
      "angles": [
        "a failure that taught you something",
        "how you bounce back",
        "why failure is not the end"
      ]
    },
    {
      "word": "Success",
      "terms": [
        "hard work",
        "succe*",
        "achiev*",
        "goal*",
        "dream*",
        "win*",
        "proud",
        "reward*",
        "effort*"
      ],
      "angles": [
        "what success means to you",
        "someone successful you admire",
        "a small success of your own"
      ]
    },
    {
      "word": "Change",
      "terms": [
        "comfort zone",
        "chang*",
        "new",
        "adjust*",
        "adapt*",
        "different",
        "move*",
        "shift*",
        "grow*"
      ],
      "angles": [
        "a big change in your life",
        "how you handle change",
        "changes in your city"
      ]
    },
    {
      "word": "Time",
      "terms": [
        "time",
        "minute*",
        "hour*",
        "late*",
        "early*",
        "manage*",
        "schedule*",
        "waste*",
        "deadline*",
        "punctual*"
      ],
      "angles": [
        "how you manage your time",
        "time wasted on phones",
        "why time is precious"
      ]
    },
    {
      "word": "Friendship",
      "terms": [
        "friend*",
        "trust*",
        "support*",
        "together",
        "school",
        "college",
        "share*",
        "loyal*",
        "help*"
      ],
      "angles": [
        "your best friend",
        "what makes a good friend",
        "friends at work"
      ]
    },
    {
      "word": "Family",
      "terms": [
        "family",
        "parent*",
        "mother",
        "father",
        "brother",
        "sister",
        "home",
        "together",
        "support*",
        "care*",
        "respect*"
      ],
      "angles": [
        "your family",
        "a family tradition",
        "what family taught you"
      ]
    },
    {
      "word": "Mother",
      "terms": [
        "mother",
        "mom",
        "mummy",
        "maa",
        "care*",
        "love*",
        "sacrific*",
        "cook*",
        "teach*",
        "strong",
        "support*"
      ],
      "angles": [
        "what your mother taught you",
        "a memory with your mother",
        "why mothers are special"
      ]
    },
    {
      "word": "Money",
      "terms": [
        "money",
        "sav*",
        "spend*",
        "earn*",
        "salary",
        "budget*",
        "expens*",
        "rich",
        "poor",
        "bank*",
        "invest*"
      ],
      "angles": [
        "how you save money",
        "money and happiness",
        "a lesson about money"
      ]
    },
    {
      "word": "Rain",
      "terms": [
        "rain*",
        "monsoon",
        "wet",
        "umbrella",
        "flood*",
        "water",
        "cloud*",
        "season",
        "farm*",
        "traffic"
      ],
      "angles": [
        "your favourite rainy day memory",
        "monsoon in your city",
        "how rain affects daily life"
      ]
    },
    {
      "word": "Traffic",
      "terms": [
        "traffic",
        "jam*",
        "road*",
        "car*",
        "bike*",
        "signal*",
        "honk*",
        "late*",
        "pollution",
        "commut*",
        "bus*"
      ],
      "angles": [
        "your daily commute",
        "how to reduce traffic",
        "traffic rules"
      ]
    },
    {
      "word": "Festivals",
      "terms": [
        "festival*",
        "diwali",
        "holi",
        "eid",
        "christmas",
        "pongal",
        "onam",
        "celebrat*",
        "family",
        "sweets",
        "light*",
        "together"
      ],
      "angles": [
        "your favourite festival",
        "how festivals bring people together",
        "festival food"
      ]
    },
    {
      "word": "Cricket",
      "terms": [
        "world cup",
        "cricket",
        "match*",
        "team*",
        "player*",
        "bat*",
        "bowl*",
        "score*",
        "india",
        "ipl",
        "stadium"
      ],
      "angles": [
        "your favourite cricket memory",
        "lessons from team sports",
        "why India loves cricket"
      ]
    },
    {
      "word": "Cooking",
      "terms": [
        "cook*",
        "food",
        "recipe*",
        "kitchen",
        "dish*",
        "spic*",
        "taste*",
        "mother",
        "meal*",
        "learn*"
      ],
      "angles": [
        "a dish you can cook",
        "cooking with family",
        "why everyone should learn to cook"
      ]
    },
    {
      "word": "Mobile phones",
      "terms": [
        "social media",
        "phone*",
        "mobile*",
        "app*",
        "call*",
        "internet",
        "screen*",
        "addict*",
        "camera",
        "battery"
      ],
      "angles": [
        "how phones changed life",
        "phone addiction",
        "the best and worst of smartphones"
      ]
    },
    {
      "word": "Social media",
      "terms": [
        "social media",
        "fake news",
        "screen time",
        "instagram",
        "whatsapp",
        "facebook",
        "youtube",
        "post*",
        "follower*",
        "share*"
      ],
      "angles": [
        "how you use social media",
        "good and bad of social media",
        "social media and young people"
      ]
    },
    {
      "word": "Online shopping",
      "terms": [
        "cash on delivery",
        "online",
        "shop*",
        "order*",
        "deliver*",
        "discount*",
        "app*",
        "return*",
        "review*",
        "product*",
        "sale*"
      ],
      "angles": [
        "your last online order",
        "online vs shop shopping",
        "a bad delivery experience"
      ]
    },
    {
      "word": "Artificial intelligence",
      "terms": [
        "artificial intelligence",
        "ai",
        "robot*",
        "machine*",
        "computer*",
        "job*",
        "future",
        "technolog*",
        "chatgpt",
        "automat*"
      ],
      "angles": [
        "AI in daily life",
        "will AI take jobs",
        "AI in customer service"
      ]
    },
    {
      "word": "Electric cars",
      "terms": [
        "electric",
        "car*",
        "vehicle*",
        "battery",
        "charg*",
        "petrol",
        "pollution",
        "environment*",
        "cost*",
        "future",
        "scooter*"
      ],
      "angles": [
        "would you buy an electric vehicle",
        "electric vehicles and pollution",
        "charging problems"
      ]
    },
    {
      "word": "Teamwork",
      "terms": [
        "team*",
        "together",
        "help*",
        "support*",
        "group*",
        "project*",
        "share*",
        "cooperat*",
        "role*",
        "goal*"
      ],
      "angles": [
        "a time you worked in a team",
        "what makes a good team",
        "teamwork in a call centre"
      ]
    },
    {
      "word": "Customer",
      "terms": [
        "customer*",
        "service",
        "help*",
        "problem*",
        "satisf*",
        "happy",
        "complain*",
        "listen*",
        "solve*",
        "king"
      ],
      "angles": [
        "what a customer expects",
        "your experience as a customer",
        "why customers come back"
      ]
    },
    {
      "word": "Smile",
      "terms": [
        "smil*",
        "happy",
        "happiness",
        "laugh*",
        "friendly",
        "positive",
        "mood",
        "face*",
        "warm*"
      ],
      "angles": [
        "how a smile changes a conversation",
        "someone who always smiles",
        "can people hear a smile on the phone"
      ]
    },
    {
      "word": "Night shift",
      "terms": [
        "night shift*",
        "late night",
        "sleep*",
        "awake",
        "routine*",
        "health*",
        "body*",
        "coffee",
        "adjust*",
        "schedule*"
      ],
      "angles": [
        "how you would manage night shifts",
        "staying healthy on night shifts",
        "pros and cons of night work"
      ]
    },
    {
      "word": "Feedback",
      "terms": [
        "feedback",
        "criticis*",
        "improve*",
        "learn*",
        "advice",
        "suggest*",
        "review*",
        "listen*",
        "better",
        "comment*"
      ],
      "angles": [
        "feedback that helped you",
        "how you take criticism",
        "giving feedback to others"
      ]
    },
    {
      "word": "Pressure",
      "terms": [
        "pressure",
        "stress*",
        "deadline*",
        "calm*",
        "exam*",
        "target*",
        "handle*",
        "manage*",
        "tension",
        "relax*"
      ],
      "angles": [
        "a time you worked under pressure",
        "how you handle stress",
        "pressure in exams"
      ]
    },
    {
      "word": "Listening",
      "terms": [
        "listen*",
        "hear*",
        "understand*",
        "attention",
        "focus*",
        "interrupt*",
        "communicat*",
        "patien*",
        "care*"
      ],
      "angles": [
        "why listening matters",
        "someone who listens well",
        "listening to customers"
      ]
    },
    {
      "word": "Mistakes",
      "terms": [
        "mistake*",
        "error*",
        "wrong",
        "learn*",
        "lesson*",
        "sorry",
        "correct*",
        "fix*",
        "fail*",
        "careful*"
      ],
      "angles": [
        "a mistake you learned from",
        "how you handle mistakes",
        "mistakes at work"
      ]
    },
    {
      "word": "Books",
      "terms": [
        "book*",
        "read*",
        "story",
        "stories",
        "author*",
        "library",
        "novel*",
        "learn*",
        "knowledge",
        "page*"
      ],
      "angles": [
        "a book you liked",
        "why reading matters",
        "reading vs watching videos"
      ]
    },
    {
      "word": "Movies",
      "terms": [
        "movie*",
        "film*",
        "cinema",
        "actor*",
        "actress*",
        "story",
        "stories",
        "watch*",
        "hero*",
        "director*"
      ],
      "angles": [
        "your favourite movie",
        "what movies teach us",
        "movies in your language"
      ]
    },
    {
      "word": "Music",
      "terms": [
        "music",
        "song*",
        "sing*",
        "listen*",
        "tune*",
        "relax*",
        "instrument*",
        "dance*",
        "mood",
        "artist*"
      ],
      "angles": [
        "the music you like",
        "how music changes your mood",
        "music while working"
      ]
    },
    {
      "word": "Health",
      "terms": [
        "health*",
        "exercise*",
        "gym",
        "walk*",
        "food",
        "diet",
        "sleep*",
        "fit*",
        "doctor*",
        "yoga"
      ],
      "angles": [
        "how you stay healthy",
        "healthy habits",
        "health and work"
      ]
    },
    {
      "word": "Sleep",
      "terms": [
        "sleep*",
        "rest*",
        "tired*",
        "night",
        "bed*",
        "dream*",
        "alarm*",
        "morning",
        "energy",
        "late*"
      ],
      "angles": [
        "your sleep routine",
        "why sleep matters",
        "sleep and mobile phones"
      ]
    },
    {
      "word": "Exercise",
      "terms": [
        "exercis*",
        "gym",
        "walk*",
        "run*",
        "yoga",
        "fit*",
        "health*",
        "sport*",
        "body",
        "morning"
      ],
      "angles": [
        "your favourite exercise",
        "exercise and mood",
        "making time to exercise"
      ]
    },
    {
      "word": "Travel",
      "terms": [
        "travel*",
        "trip*",
        "journey",
        "place*",
        "visit*",
        "train*",
        "bus*",
        "holiday*",
        "explore*",
        "new"
      ],
      "angles": [
        "a trip you remember",
        "a place you want to visit",
        "what travel teaches you"
      ]
    },
    {
      "word": "Hometown",
      "terms": [
        "grew up",
        "hometown",
        "home",
        "town",
        "city",
        "village",
        "place*",
        "people",
        "food",
        "famous"
      ],
      "angles": [
        "what is special about your hometown",
        "how your hometown has changed",
        "food from your hometown"
      ]
    },
    {
      "word": "School",
      "terms": [
        "school",
        "teacher*",
        "class*",
        "friend*",
        "exam*",
        "subject*",
        "study",
        "studied",
        "learn*",
        "uniform"
      ],
      "angles": [
        "a teacher you remember",
        "your best school memory",
        "what school taught you"
      ]
    },
    {
      "word": "Teachers",
      "terms": [
        "teacher*",
        "teach*",
        "school",
        "college",
        "class*",
        "learn*",
        "guide*",
        "respect*",
        "student*",
        "lesson*"
      ],
      "angles": [
        "a teacher who inspired you",
        "qualities of a good teacher",
        "learning from mistakes"
      ]
    },
    {
      "word": "Hard work",
      "terms": [
        "hard",
        "work*",
        "effort*",
        "work*",
        "practice*",
        "dedicat*",
        "success*",
        "tired*",
        "goal*",
        "sacrific*"
      ],
      "angles": [
        "a time your hard work paid off",
        "hard work vs smart work",
        "someone hard-working you know"
      ]
    },
    {
      "word": "Confidence",
      "terms": [
        "confiden*",
        "believe*",
        "self*",
        "fear*",
        "nervous*",
        "speak*",
        "stage*",
        "courage*",
        "practice*"
      ],
      "angles": [
        "how you built confidence",
        "confidence vs overconfidence",
        "speaking with confidence"
      ]
    },
    {
      "word": "Communication",
      "terms": [
        "communicat*",
        "speak*",
        "talk*",
        "listen*",
        "clear*",
        "language*",
        "english",
        "understand*",
        "explain*"
      ],
      "angles": [
        "why communication matters",
        "a misunderstanding you faced",
        "improving your English"
      ]
    },
    {
      "word": "Learning",
      "terms": [
        "learn*",
        "study*",
        "skill*",
        "course*",
        "new",
        "knowledge",
        "practice*",
        "improve*",
        "online",
        "teach*"
      ],
      "angles": [
        "something new you learned recently",
        "learning from YouTube",
        "learning never stops"
      ]
    },
    {
      "word": "Goals",
      "terms": [
        "goal*",
        "plan*",
        "dream*",
        "future",
        "target*",
        "achiev*",
        "step*",
        "focus*",
        "career*"
      ],
      "angles": [
        "your goal for this year",
        "how you plan your goals",
        "a goal you achieved"
      ]
    },
    {
      "word": "Weekend",
      "terms": [
        "weekend",
        "sunday",
        "saturday",
        "relax*",
        "family",
        "friend*",
        "movie*",
        "rest*",
        "outing*",
        "plan*"
      ],
      "angles": [
        "your ideal weekend",
        "weekends and work",
        "how you spend Sundays"
      ]
    },
    {
      "word": "Water",
      "terms": [
        "water",
        "drink*",
        "save*",
        "rain*",
        "river*",
        "shortage",
        "clean*",
        "pollut*",
        "tap*",
        "bottle*"
      ],
      "angles": [
        "saving water",
        "water problems in your area",
        "why clean water matters"
      ]
    },
    {
      "word": "Trees",
      "terms": [
        "tree*",
        "plant*",
        "green*",
        "forest*",
        "environment*",
        "air*",
        "oxygen",
        "shade",
        "nature",
        "pollution"
      ],
      "angles": [
        "why we need trees",
        "planting trees",
        "a tree you remember"
      ]
    },
    {
      "word": "Cleanliness",
      "terms": [
        "clean*",
        "dirty",
        "dirt*",
        "garbage",
        "waste*",
        "swachh",
        "environment*",
        "habit*",
        "public",
        "hygien*"
      ],
      "angles": [
        "cleanliness in public places",
        "habits for a clean home",
        "why cleanliness matters"
      ]
    },
    {
      "word": "Internet",
      "terms": [
        "internet",
        "online",
        "wifi",
        "data",
        "network*",
        "connect*",
        "search*",
        "google",
        "information*",
        "speed"
      ],
      "angles": [
        "how the internet helps you",
        "internet safety",
        "life without the internet"
      ]
    },
    {
      "word": "Shopping malls",
      "terms": [
        "food court",
        "mall*",
        "shop*",
        "store*",
        "buy*",
        "sale*",
        "crowd*",
        "movie*",
        "brand*",
        "weekend"
      ],
      "angles": [
        "your experience at a mall",
        "malls vs local markets",
        "why people like malls"
      ]
    },
    {
      "word": "Street food",
      "terms": [
        "street food",
        "pani puri",
        "vada pav",
        "chaat",
        "momos",
        "stall*",
        "taste*",
        "spic*",
        "hygien*",
        "cheap"
      ],
      "angles": [
        "your favourite street food",
        "street food and health",
        "street food in your city"
      ]
    },
    {
      "word": "Public transport",
      "terms": [
        "public transport",
        "bus*",
        "train*",
        "metro",
        "auto*",
        "ticket*",
        "crowd*",
        "commut*",
        "station*",
        "cheap"
      ],
      "angles": [
        "your daily travel",
        "improving public transport",
        "metro vs bus"
      ]
    },
    {
      "word": "Helping others",
      "terms": [
        "help*",
        "support*",
        "volunteer*",
        "care*",
        "kind*",
        "poor",
        "need*",
        "donat*",
        "serve*",
        "community"
      ],
      "angles": [
        "a time you helped someone",
        "helping strangers",
        "why helping others feels good"
      ]
    },
    {
      "word": "Respect",
      "terms": [
        "respect*",
        "elder*",
        "polite*",
        "manner*",
        "listen*",
        "value*",
        "treat*",
        "dignity",
        "behav*",
        "equal*"
      ],
      "angles": [
        "respecting elders",
        "respect at work",
        "earning respect"
      ]
    },
    {
      "word": "Courage",
      "terms": [
        "stand up",
        "courag*",
        "brave*",
        "fear*",
        "afraid*",
        "risk*",
        "confiden*",
        "strong",
        "challeng*"
      ],
      "angles": [
        "a brave thing you did",
        "courage in daily life",
        "someone courageous you know"
      ]
    },
    {
      "word": "Happiness",
      "terms": [
        "small things",
        "happ*",
        "joy*",
        "smile*",
        "enjoy*",
        "satisf*",
        "peace*",
        "family",
        "friend*"
      ],
      "angles": [
        "what makes you happy",
        "happiness and money",
        "small things that bring joy"
      ]
    },
    {
      "word": "Technology",
      "terms": [
        "technolog*",
        "computer*",
        "phone*",
        "app*",
        "internet",
        "digital*",
        "machine*",
        "future",
        "change*",
        "online"
      ],
      "angles": [
        "technology in your daily life",
        "technology at work",
        "technology and older people"
      ]
    },
    {
      "word": "Weather",
      "terms": [
        "weather*",
        "hot*",
        "cold*",
        "summer",
        "winter",
        "rain*",
        "season*",
        "sun*",
        "temperature",
        "climate"
      ],
      "angles": [
        "your favourite season",
        "weather in your city",
        "how weather changes your mood"
      ]
    },
    {
      "word": "Pets",
      "terms": [
        "pet*",
        "dog*",
        "cat*",
        "animal*",
        "care*",
        "love*",
        "feed*",
        "walk*",
        "loyal*",
        "home"
      ],
      "angles": [
        "a pet you know",
        "taking care of animals",
        "why people love pets"
      ]
    }
  ];

  const api = { SCENARIOS, PERSONAS, NAMES, TOPICS };
  if (isNode) module.exports = api;
  else (root.AII = root.AII || {}).CallContent = api;
})(typeof window !== 'undefined' ? window : globalThis);
