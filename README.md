# AI Interviewer

A free **voice** interviewer for **BPO and customer-service jobs**, and now for **engineers** too. It works like a real phone interview: Tushar AI, the AI interviewer, asks every question out loud, listens to your spoken answers, asks follow-up questions, and plays an upset customer in a **mock call**. At the end you hear how you did, and you get a recruiter-style **scoresheet** with recordings of your answers.

- **100% audio, hands-free.** No typing and no chat. Tushar AI knows when you've finished speaking, and you can say *"repeat"*, *"skip"* or *"that's all"* instead of pressing buttons.
- **No API keys, no payment, no sign-up.** It runs entirely in your browser.
- **Works in any modern browser.** Chrome and Edge use their built-in speech recognition; other browsers (Firefox, Brave…) use a free **offline Whisper model** that runs on your device.
- **Hear yourself back.** Every answer is recorded (on your device only) so you can replay it next to its feedback.
- **AI-proctored, camera on.** Like a video call, your camera stays on and an AI on your device checks that you stay in view, alone and looking at the screen, with no phone, and on this window. Three warnings end the interview, and the scoresheet gets an integrity rating with photos of the flagged moments.
- **Engineering interviews in a company's style.** Full-stack, frontend, Java, Python, AI/ML, data and DevOps roles, in the style of Google, Microsoft, Amazon, Uber, Flipkart, Swiggy, TCS, Infosys, Wipro, Tech Mahindra, Accenture, Cognizant or a startup: a communication round, then a technical round.
- **Practise until it sounds right.** Answer any question again from your scoresheet and see the score before and after, hear a model answer, and follow your progress across interviews.
- **Tailored to a real job.** Paste a job description and the interview leans towards what it asks for.
- **Transparent scoring model.** Every score traces back to concrete signals in your answers.
- **Install it like an app.** Add it to your phone's home screen or your computer's app list; it opens offline too.
- **Take your history with you.** Back up every scoresheet to a file and restore it on another device, or export all interviews as a spreadsheet (CSV).
- **Optional free local AI.** If you have [Ollama](https://ollama.com) installed, a local model can review each answer as a second opinion.

---

## Quick start

You only need **Node.js 18+** (no `npm install` step; the project has zero dependencies).

```bash
git clone https://github.com/TUSHARXP-10/Ai-interviewer-.git
cd Ai-interviewer-
npm start
```

Open **http://localhost:8080**, enter your name, press **📞 Start voice interview**, and allow the microphone. Headphones help.

> Browsers only allow the microphone on `https://` or `localhost`, which is why a tiny local server is included. If you prefer Python: `python3 -m http.server 8080`.

### Use it on your phone over Wi-Fi

Opening `http://<your-computer's-IP>:8080` on a phone does **not** work for the interview: the page loads, but phones only allow the microphone on `https://`. So there is an HTTPS mode for your local network:

```bash
npm run lan
```

1. Keep the computer and the phone on the **same Wi-Fi**. The terminal prints an address like **`https://192.168.1.23:8443`**; open it on the phone (Chrome on Android, Safari on iPhone).
2. The phone warns that the connection is *not private*. That's expected: the server made its own certificate (no installs, no openssl; it's kept in `.cert/` and reused next time). Tap **Advanced → Proceed** (Chrome) or **Show Details → visit this website** (Safari).
3. Allow the microphone and start the interview. On iPhone, Dictation must be on (Settings → General → Keyboard) for Safari's speech recognition.

On a phone, the app asks for the microphone (and camera) **once**, at the start, keeps the screen on during the interview, and then hands the microphone to the browser's speech recognition: on Android that is the phone's own speech service, which hears only silence if the page keeps a second microphone stream open. Answer recordings are therefore only saved on computers.

If the phone keeps asking for the microphone or doesn't hear you:
- **Android (Chrome):** when asked, choose **Allow while visiting the site**, not *Only this time*. If you chose wrong: tap the icon left of the address → *Permissions* → *Microphone* → *Allow*. Keep the Google app installed and up to date (Chrome uses it for speech recognition), and turn off Battery Saver (it can stop the screen staying on).
- **iPhone (Safari):** Settings → Apps → Safari → Microphone → **Allow**, and turn on Dictation (Settings → General → Keyboard).
- Use **Chrome or Safari itself**, not a link opened inside WhatsApp, Instagram or another app's built-in browser.

If the phone can't connect:
- **Windows:** when the firewall asks about Node.js, allow it on **Private networks**. If you missed the prompt, allow `node.exe` in *Windows Defender Firewall → Allow an app*. Make sure the Wi-Fi is set to a *Private* network.
- **Guest, office or college Wi-Fi** often stops devices from seeing each other. Turn on your **phone's hotspot**, connect the computer to it, run `npm run lan` again and open the new address.
- Use the address on the 👉 line: other addresses (Docker, VPN, virtual machines) are not reachable from the phone.
- Another port: `PORT=9443 npm run lan` (Windows: `set PORT=9443 && npm run lan`).

### Deploy to Vercel (free)

The repo is ready for Vercel: `vercel.json` runs `npm run build`, which copies `index.html`, `css/` and `js/` into `dist/` (no dependencies, no bundler), and serves that folder over HTTPS with microphone permission allowed.

**From the dashboard:** go to [vercel.com/new](https://vercel.com/new), import this GitHub repository and press **Deploy**. If Vercel says it needs the GitHub integration, install the [Vercel GitHub app](https://github.com/apps/vercel) for this repository first. Set **Application Preset** to **Other** and leave everything else at its default; `vercel.json` sets the build. Every push to the branch redeploys.

**From the terminal:**

```bash
npm i -g vercel     # once
vercel --prod       # build and deploy to production
```

**Share the right link.** Open and share the short address, `https://<project>.vercel.app`: it's on the CLI's **Aliased** line, and in the dashboard under **Domains** (or press **Visit**). Open it in Chrome or Edge, allow the microphone, and you're in. The longer `<project>-<hash>-<team>.vercel.app` links (the *Production:*/*Preview:* lines, and every preview deployment) sit behind Vercel's default Deployment Protection, so anyone not logged in to your Vercel account sees a "Log in to Vercel" page. To make those public too, turn off **Vercel Authentication** in Project → Settings → Deployment Protection.

To check the build locally: `npm run build`, then serve `dist/`, e.g. `python3 -m http.server 8080 -d dist`.

### See every candidate's result: the Results board

Every finished interview can be sent to a **Results board** on your website: press **📊 Results** at the top of the page to see every candidate, their score, verdict, skills and integrity, search and sort them, open anyone's full scoresheet (transcript included), print it, delete it, or export them all to a spreadsheet (CSV). Recordings and proctoring photos never leave the candidate's device; only the scoresheet is sent.

It's free on Vercel, and takes three steps (once):

1. **Add storage.** Vercel → your project → **Storage** → **Create Database** → **Upstash for Redis** (the free plan) → **Connect** it to this project. This adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` to the project by itself.
2. **Choose who can see the board.** Project → **Settings** → **Environment Variables** → add:
   - `ADMIN_KEY` = a passcode only you know (the board asks for it; the browser remembers it), **or**
   - `PUBLIC_RESULTS` = `1` to let **everyone** who opens the site see every result. Deleting a result always needs `ADMIN_KEY`.
3. **Redeploy:** **Deployments** → ⋯ on the latest one → **Redeploy**.

From then on the setup page tells candidates that their scoresheet goes to the recruiter (or the public board), and the scoresheet shows "✓ Sent". If sending fails (no internet), the candidate can press **Try again**; an interview from before the board was set up can be sent from its scoresheet with **Send it**. Each interview is stored once, however often it's sent, and a stored result can't be overwritten.

Running it yourself with `npm start` (or `npm run lan`): the board works straight away. Results are saved in `.data/results/`, and the passcode is printed in the terminal (set your own with `ADMIN_KEY=… npm start`). On GitHub Pages or another static host there's no server, so there's no board: results stay in each candidate's browser.

### Install it as an app

On the hosted site (HTTPS) or `localhost`, the app can be installed:

- **Chrome / Edge (Android, Windows, Mac, Linux):** press **⤓ Install app** at the top of the page (or the install icon in the address bar).
- **iPhone / iPad (Safari):** tap **Share → Add to Home Screen**.

The installed app opens in its own window, without the browser's address bar. A small service worker (`sw.js`) keeps a copy of the app, so it **opens offline** too. It always loads the newest version while you're online. Offline, the built-in speech recognition of Chrome and Edge doesn't work (it needs the internet), so use the offline Whisper engine: run one interview online first, so its model is downloaded. The proctoring models are kept after their first download as well.

> `npm run lan` uses a self-signed certificate, which browsers don't accept for installing apps. Install from the hosted site (Vercel or GitHub Pages) or from `localhost` instead.

### Or GitHub Pages

1. On GitHub, open **Settings → Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**, then pick your branch and the `/ (root)` folder.
3. After a minute your interviewer is live at `https://<your-username>.github.io/Ai-interviewer-/`. HTTPS is included, so the microphone works.

### Try it without a microphone

- Click **See a sample scoresheet** on the home page.
- Or run a scripted interview in the terminal: `npm run demo` (try `node tools/simulate.js weak --full` or `node tools/simulate.js average --role sales`).

---

## How the voice interview works

1. **Camera check.** The camera is required. Tushar AI asks you to look at the screen for a moment and calibrates the AI proctor on your normal position (it needs to see you alone, in good light).
2. **Mic check.** Tushar AI greets you and asks you to say *"I'm ready"*. The **You** panel under the orb shows your mic level and the words it understands as you speak, then *"✓ Got it! Your microphone works"*. If your voice comes through without words, Tushar AI adjusts how it listens, then switches to the offline engine; if nothing comes through, you're told what to check.
3. **Questions.** Tushar AI speaks each question. The orb turns green while it's your turn to talk, the ring around it shows the time left, and the **You** panel shows your words live (*"Tushar AI hears…"*), then what will be scored (*"You said…"*).
4. **Turn-taking.** When you stop talking, Tushar AI waits a moment, then replies, waiting longer if you've only just started, so thinking pauses are safe. Short replies such as *"No."* count as answers too. You can set how long the wait is (2, 3 or 5 seconds), or have Tushar AI wait until you say *"that's all"* (with the offline Whisper engine, which only reads your words after you finish, a long pause of about 8 seconds ends the answer instead).
5. **Voice commands.** Say *"Can you repeat the question?"* or *"pardon?"* to hear it again (even after a false start), *"skip this one"* or *"next"* to move on, or end your answer with *"that's all"* or *"I'm done"*. Tushar AI confirms out loud, so you never need to look at the screen. If you say *"I don't know"*, you get time to think (or say *"skip"*); if you're silent for a while, you get a gentle nudge. In the mock call, the customer asks *"Hello? Are you still there?"*
6. **Spoken feedback.** After the last question, Tushar AI reads out your score, your strongest area, and your top tip. The full scoresheet opens with ▶ playback (and download) of each of your answers.

**If something goes wrong, Tushar AI handles it:**

- **Can't hear your words:** if the mic hears you but no words come through, Tushar AI asks you to repeat, stops sharing the mic with the browser's recogniser (letting it open the mic itself), then switches to the offline Whisper engine.
- **Internet drops for a moment:** the built-in recogniser retries quietly, so a short Wi-Fi blip doesn't lose your answer; only a longer outage switches to Whisper.
- **You switch tabs:** the call pauses. When you return, Tushar AI says *"Welcome back"* and picks up where you left off. (In the listening test, hearing the details again counts as a repeat.)
- **Your microphone disconnects** (a headset is unplugged or Bluetooth drops): Tushar AI tells you, and **Try again** reconnects it, or uses whichever microphone is now plugged in. Try again in the mic check does the same, so you can switch to a different microphone.
- **Browser blocks the voice:** some phones (iPhone Safari) block it until you tap; a *"Tap to hear Tushar AI"* button appears. If speech still won't play, captions take over.
- **Background noise:** if a TV or fan keeps the mic busy after you've stopped, Tushar AI goes by your words instead.

**Live captions** are on by default: you see the interviewer's words, and the **You** panel shows your own words live as you answer. (With the offline Whisper engine your words appear phrase by phrase, each time you pause.) The **CC** button hides them.

On-screen buttons (Captions, Repeat, Skip, I'm done, End) are there if you want them. Keyboard: <kbd>Enter</kbd> finishes an answer, <kbd>R</kbd> repeats, <kbd>C</kbd> toggles captions.

## The 4-round assessment (new)

A focused 10–12 minute test, picked on the setup page (or from the home page):

1. **Introduction** — flow, confidence, pauses and how quickly you start.
2. **Why BPO** — whether your reason is genuine: personal and specific, not a recital or money alone.
3. **Topic talk** — you get one **random word** (60 of them: *Patience, Traffic, Social media, Night shift…*) and talk for up to **three minutes**. It scores your thought process: staying on the word, several points, a real example, why it matters, a conclusion, and how long you keep going. If you dry up, the interviewer suggests another angle.
4. **Live customer call** — about **three minutes** with a customer who is **different every time**: one of 10 problems (double charge, internet down, unknown card payment, cancelled flight, missing food, rejected claim, wrong bill, recharge not active, wrong product, missing hotel booking) and one of 6 moods (angry, impatient, confused elderly, anxious, polite, sarcastic). The customer reacts to what you actually say: empathy, asking for details, a concrete fix and a timeline calm them down; vague promises, stalling or rudeness make them angrier, and they may hang up. A late complication tests you once things are going well. On screen you see the caller's name, problem, a live mood meter and the call clock.

The scoresheet adds a **round-by-round** card (score and key evidence per round, e.g. *"Mood 85 → 17 · resolved"*). Content lives in `js/callContent.js`, the customer's behaviour in `js/callsim.js`.

## Engineering interviews (new)

Pick **Engineering** at the top of the setup page. Choose your role, a company style, fresher or experienced, and a length (Quick screen, Standard loop or Full loop). Tushar AI calls "from" that company ("Hi Ravi! I'm Tushar AI, calling from Amazon's hiring team about the Backend Developer role…") and runs two rounds:

1. **Communication & thought process**: about you and your work, a project walkthrough or your toughest bug, how you think (unclear requirements, prioritising, explaining an API to a non-engineer), and a values question in the company's style (Amazon's Leadership Principles, Google's ambiguity and helping others, Microsoft's growth mindset, deadlines at product companies, learning and teamwork at IT services, ownership at startups). IT services also ask about relocation and shifts.
2. **Technical interview**: role fundamentals (React state, the event loop, HashMap internals, Python's GIL, overfitting, RAG, SQL window functions, Kubernetes…), problem solving said out loud (two-sum, top-k words, LRU cache, merging intervals), object-oriented design (parking lot, library), system design for experienced candidates (URL shortener, rate limiter, recommendations, CI/CD), and practical scenarios (a slow page, a broken deploy at night, a one-week MVP). The mix follows the company: big tech leans on problem solving, IT services on CS fundamentals (OOP, DBMS, OS, networks), startups on practical engineering.

There's no code editor: you think out loud, the way a phone screen works. A new **Technical knowledge** skill scores the correct concepts, the depth (trade-offs, complexity, edge cases, measurable evidence) and the reasons you give; a confident answer that misses the concepts scores low. The scoresheet shows each round and the company style, and gives an engineering-specific verdict. A sample engineering scoresheet is one click away on the setup page.

The company styles follow each company's publicly described interview format. This is a practice simulation; it isn't affiliated with or endorsed by any of these companies. The questions live in `js/techBank.js`.

## What the interview covers

| Stage | Example question | What it checks |
|---|---|---|
| Introduction | "Tell me about yourself." | Structure, completeness, confidence |
| Background | Education, or your last job (experienced candidates) | Relevance, achievements, specifics |
| Motivation & fit | "Why do you want to work in a BPO?" / "Why should we hire you?" | Genuine motivation, red flags (e.g. "only for money") |
| Role knowledge | "What is BPO?" / "Inbound vs outbound?" / AHT & CSAT | Industry understanding |
| Situational | "How would you handle an angry customer?" | Empathy, steps, ownership, escalation |
| Past experience | "A time you worked under pressure…" | STAR storytelling (Situation, Task, Action, Result) |
| **Mock call** | An upset customer charged twice, an internet outage (tech support), or an outbound sales pitch | Greeting, empathy, ownership, probing, resolution, closing |
| English & listening | Remember a customer's name, order number and city; repeat a sentence after the interviewer; correct a sentence | Listening accuracy, grammar, word-for-word repetition |
| Flexibility | Night and rotational shifts, weekends | Willingness, clarity |
| Self-awareness | Strengths and weaknesses, five-year plan | Honesty, growth mindset |
| Closing | "Any questions for me?" | Curiosity, engagement |

Lengths: **Quick** (7 questions, about 10 min), **Standard** (14, about 20 min), **Full** (22, about 30 min), the **4-round assessment**, and **English & Versant practice** (below). Questions adapt to the role (voice support, tech support, sales, chat/email, general) and to fresher or experienced candidates. The question set is randomised, so practising again gives different questions.

### English & Versant practice

Many BPOs screen voice candidates with an automated spoken-English test (Versant and similar), where fluency and sentence repetition carry a lot of the score. **English & Versant practice** (6–8 minutes) drills exactly that: **repeat after me** (the interviewer says a customer-service sentence once and you say it back; it is scored word for word, with spoken numbers and digits treated alike, and the scoresheet shows the words you missed), a listening test, two sentence corrections and a short talk on a topic. The Full assessment includes one repeat-after-me sentence too.

### Tailor it to a real job

Open **Tailor it to a real job** on the setup page and paste the job description. Tushar AI recognises what it asks for (engineering skills such as Java and Spring, Kafka, AWS, Kubernetes, React, LLMs; or for BPO jobs an international process, night shifts, sales targets, CRM tools, AHT and CSAT) and shows it as chips. Each question slot then prefers the questions about those things, and one extra question right after the introduction is built from the job's top asks (*"The job description asks for Java and Spring, plus microservices and messaging. Tell me about your hands-on experience with Java and Spring…"*). If the job reads like a different role from the one selected, it offers to switch. The text never leaves your device.

### The interviewer reacts to your answers

- **Follow-ups:** if an answer is too short, misses an example, skips something important (e.g. empathy with an angry customer), or contains a red flag, the interviewer asks a probing follow-up, just as a real recruiter would.
- **Live reactions:** strong answers get "That's a strong answer"; weak ones get a neutral "Okay, let's move on".
- **Branching mock call:** the customer's next line depends on what you said. Apologise and empathise and they calm down and share their order number; skip the empathy and they get angrier.

---

## Practise, then practise again

Most of the learning happens on the second try, so the scoresheet leads straight into it:

- **Your practice plan:** the three weakest answers, each one tap away from a **practice drill**. Every question on the scoresheet also has *Practise this question again*.
- **Practice drills:** the same voice call with just that question (microphone only: it's practice, not a proctored interview). A coach card says what to aim for this time: the gaps from last time and your weakest skill on that answer. Afterwards you see the score **before and after**, each skill's change, your new answer and recording, and what was still missing, with buttons to try again or move to the next weakest question.
- **Model answers:** *"A strong answer could sound like this"*, with a **Listen** button, for the BPO questions and every engineering question, across all seven engineering roles.
- **Live coaching while you answer:** under your live words, the time spoken against the question's target length, your pace once there's enough speech to judge, filler words, and at most one short tip (*"Time to wrap up"*). It can be turned off in Studio settings.
- **Think out loud (engineering):** problem-solving questions show the steps interviewers listen for (clarify, a simple approach, improve it, complexity, edge cases, test it), and system design shows requirements, API and data, components, scaling, trade-offs and failures. Each step lights up as you say it, and the scoresheet keeps the checklist.
- **Your progress:** on the home page, your score over time with the hire line, each skill's change since your first interview, your practice streak, and your weakest skill with a button to its practice plan.

## The scoresheet

- **Overall score /100** and a verdict: *Strongly recommended*, *Recommended*, *Borderline* or *Not recommended yet*.
- **Seven skill scores**, each with the evidence behind it from your own interview (*"14 grammar slips in 600 words, e.g. “listen the customer” → listen to the customer"*, *"Mock call: asked for the order number, raised a refund, gave a timeline (“within 5 to 7 working days”)"*). Strengths, tips and the summary are built from the same evidence, so nothing is praised or criticised that did not happen.

| Skill | Built from |
|---|---|
| Communication & fluency | Grammar while speaking (*"he say"*, *"I am complete my graduation"*, *"listen the customer"*), dropped small words (*"I did diploma"*), filler words (*basically, you know*, crutch *like*), restarts, completeness, speaking pace (wpm), long pauses and silences, voice modulation |
| Confidence & composure | Hedging (*I think, maybe, I guess*), assertive language (*I handled, I achieved*), negative self-talk, how quickly you start, voice strength above room noise, whether your voice fades at the end |
| Thought process & structure | Reasoning and sequencing words (*because, first… then, as a result*), real examples and your own stories, STAR completeness, specific details; stock phrases (*"hard working and dedicated"*, *"quick learner"*) and off-topic answers count against it |
| Answer quality & relevance | How much of what a strong answer includes you covered (a per-question rubric with synonyms), whether you answered the question that was asked, and real substance |
| Customer handling & empathy | Empathy phrases, approach to customer situations, and the mock call: apology, verifying details, a concrete fix *with a timeline*, warmth, clear English, closing — and anything rude (*"shouting won't help"*) |
| Attitude & motivation | Genuine motivation, flexibility, curiosity, minus red flags (money only, planning to leave soon, badmouthing a past employer, refusing shifts, blaming customers) |
| English & listening | Listening-test recall, sentence corrections, a grammar coach for common slips (*"Myself Rahul"*, *"I am having 2 years experience"*, *"revert back"*…) |

The scoresheet also includes an **estimated English level (CEFR)**, **role fit** for each BPO role, **red flags to probe**, **speech analytics**, the **mock-call checklist**, an **integrity panel** (tab switches, pasted answers), and a **question-by-question breakdown** with scores, feedback and what a strong answer would include.

**Your answers, word for word.** Every question is listed with exactly what you said, caption style (or why there is no answer: skipped, or time ran out). Grammar slips get a wavy underline, weak or informal words (*gonna*, *stuff*, *good* used four times…) a dotted one, and fillers are highlighted. Under each answer, a language check lists the better way to say each one, and your recording plays right beside it.

Scoresheets (and answer recordings) are saved in your browser's history (the newest 12).

**Back up, restore and export** (on the home page, under *Your progress*):

- **💾 Back up** saves every scoresheet and your practice drills to one `.json` file. **📂 Restore** adds them on another browser or device; interviews already there are skipped, and the newest 12 are kept. Recordings and proctoring photos stay on the device they were made on. Restore also accepts a single scoresheet from **Download JSON**, so a candidate can send you theirs.
- **⬇ Export CSV** writes one row per interview (date, candidate, role, company style, overall score, verdict, integrity, English level, every skill score) for Excel or Google Sheets: handy for comparing candidates or tracking a batch.

Scoresheets They can be printed or saved as PDF, or downloaded as JSON. Press **🔊 Hear my feedback** to have Tushar AI read your result aloud again.

### How the scoring model works

1. **Per answer**, the analyser (`js/analyzer.js`) extracts signals from the transcript, the timing, and the microphone (Web Audio: loudness, pauses, pitch).
2. Each signal maps to a 0–100 component through a calibrated curve. Components blend into dimension scores. Signals that cannot be measured (e.g. pitch when the microphone analysis is unavailable) are left out instead of counting as zero. A "weakest link" rule stops one serious problem, such as constant fillers, from being averaged away.
3. **Across the interview** (`js/scoring.js`), each question contributes to the dimensions it informs. A situational question counts heavily towards customer handling; a listening test counts towards English. The seven dimensions are then weighted by role: confidence matters more for sales, written accuracy more for chat support.
4. **The recruiter's scale.** Rule checks saturate (a competent answer ticks every box), so each skill is mapped onto the scale recruiters actually use: 90+ exceptional, 80+ strong hire, 66+ hire, 52+ borderline. The curve was fitted to blind ratings of 30 full mock interviews by two senior BPO recruiters, from excellent to very poor; across them the overall score is within about 9 points of the recruiters on average, and in the same order (`tests/calibration.test.js` keeps it that way).
5. **Hiring gates.** For a voice job, customers must be able to understand you and you must treat them well: communication, customer handling and attitude each have a bar, and falling below it pulls the overall score down however good the rest is.
6. Red flags lower attitude and the overall score, and a serious one (e.g. "I'd shout back at the customer") caps the verdict.

**Your name, spelled right.** Speech recognition often mangles names (*"I am tishar chadne"*). The app knows the name you typed, so where you introduce yourself it puts it back (*"I am Tushar Chandane"*), only right after "my name is", "I am", "myself"… or when your full name appears, so ordinary words are never turned into a name.

The word lists live in `js/lexicons.js` and the rubrics in `js/questionBank.js`, so you can tune the model without touching the code.

---

## Optional: a free local AI reviewer (Ollama)

The built-in model needs no AI service. For a deeper qualitative review, you can add a local language model:

```bash
# install from https://ollama.com, then:
ollama pull llama3.2      # or qwen2.5:3b, gemma2:2b, phi3:mini
ollama serve              # usually already running after install
```

In the app, open **Studio settings**, tick **Use a free local AI model**, press **Test**, and pick the model. After the interview, the model rates each answer and writes the summary. Its scores are **blended** with the rule-based ones (the rules stay the majority), and it adds a one-line tip per answer. Everything stays on your computer.

> If the app is hosted somewhere other than `localhost` (e.g. Vercel or GitHub Pages), allow that site in Ollama: `OLLAMA_ORIGINS="https://<your-app>.vercel.app" ollama serve`. Some browsers block an online page from talking to `localhost`; if **Test** can't connect, run the app locally with `npm start`.

---

## Speech recognition: two free engines

| Engine | Used by default in | How it works | Needs |
|---|---|---|---|
| **Browser built-in** | Chrome, Edge, Safari | The browser's own speech service; live words while you speak | Internet |
| **Offline Whisper** | Firefox, Brave, and any browser whose built-in service fails | OpenAI's Whisper *tiny.en* model running on your device with WebAssembly ([transformers.js](https://github.com/huggingface/transformers.js) 4.3.0) | A one-time download of about 48 MB, cached by the browser |

The interview picks automatically, and switches to Whisper mid-interview if the built-in service fails (e.g. offline or blocked). You can force either engine under **Voice, camera & local AI settings → Speech recognition**. With Whisper, the app uses the microphone level to tell when you've finished, then transcribes your answer in a background worker (usually 1 to 3 seconds).

> Self-hosting the model (e.g. for an intranet with no internet): set `window.AII_CONFIG = { whisper: { libUrl, modelHost, wasmPaths } }` before the scripts load. See the comments at the top of `js/whisper.js`.

## AI proctoring

The camera tile on the right of the call is read about eight times a second by Google's free [MediaPipe](https://ai.google.dev/edge/mediapipe) models, running in your browser: a face landmarker (478 points, eye and head direction) and an object detector (phones). The models download once (about 21 MB) when the interview starts.

| What it checks | Noted after | Warning after |
|---|---|---|
| Your face is in view | 2 s missing | 5 s missing |
| Camera not covered or dark | 1.5 s | 4 s |
| Nobody else in view (a much smaller face, like a photo on the wall, doesn't count) | 0.7 s | 2 s |
| No phone in view (seen twice in a row) | at once | 1 s |
| Eyes and head towards the screen (down or to the side; looking up to think doesn't count) | 3 s | 8 s |
| Repeated short glances away (4 within 45 s, like reading notes) | yes | no |
| You stay on this tab and this window | | at once (2.5 s for the window) |
| A second screen is connected (Chrome) | yes | no |

- **Calibrated to you.** Before the questions, Tushar AI calibrates on how you normally sit and look at the screen, so a camera above or beside the screen does not count against you. Blinks, a glance and a single bad frame never count.
- **Warnings.** Each serious incident is a spoken warning (*"Please keep your eyes on the screen while we talk. This is warning one of three."*), at most one every few seconds and not the same one twice within 20 s. If it carries on, it is warned again. **The third warning ends the interview.**
- **Integrity rating** at the top of the scoresheet: **Clean**, **Needs review** (a warning, three or more notes, eyes often off the screen, or a second screen) or **High risk** (ended after three warnings, or a phone or another person was confirmed). High risk caps the verdict at *Not recommended yet*. The **AI proctoring** card lists every incident with its time, question and a photo.
- **Not a lie detector.** No camera check can make cheating impossible: an earpiece, someone out of frame or a device below the camera can't be seen, and phone screens reflected in glasses can't be read reliably (your own monitor always reflects in them). Lighting and camera angle can mislead the checks. Treat flags as evidence for a person to review, using the photos.

## Privacy

- All analysis and scoring runs locally in your browser.
- **Results board:** if the site owner has set one up (see *See every candidate's result* above), the finished scoresheet (scores, transcript, verdict, integrity) is sent to the site's own storage when the interview ends, and the setup page says so before the interview starts. Without it, nothing is sent to any server of this project.
- **Speech recognition:** with the built-in engine, Chrome and Edge transcribe speech through their own cloud speech service (that's what makes it free and keyless). With the offline Whisper engine, audio never leaves your device.
- **Recordings** of your answers are stored only in this browser (IndexedDB) so you can replay them. Turn recording off in the settings, or delete them with the history.
- **Camera:** required, for the AI proctoring. The face and phone checks run on your device; the video is never recorded or uploaded. When something is flagged, a small photo of that moment is saved with the scoresheet in this browser only (and deleted with the history). The proctoring models come from Google's and jsDelivr's CDNs.
- History is stored in your browser's `localStorage`. Use **Clear all** on the home page to delete it, recordings included. A backup file holds your scoresheets, transcripts included, so keep it somewhere private.

## Browser support

| Browser | Voice interview | Speech engine |
|---|---|---|
| Chrome / Edge (desktop and Android) | ✅ Best | Built-in (Whisper fallback) |
| Safari (macOS / iOS 16.4+) | ✅ | Built-in (Whisper fallback) |
| Firefox (desktop and Android) | ✅ | Offline Whisper |
| Brave | ✅ | Offline Whisper |

Tips: use headphones (so the mic never hears Tushar AI), find a quiet room, and pick your accent in the setup (e.g. *English — India*) for better recognition.

---

## Customising

- **Add or edit questions:** copy an entry in `js/questionBank.js`. Each question has its own rubric (`concepts` with synonyms, ideal length, follow-ups, and a "what a strong answer includes" tip). Add its slot to a plan in `PLANS` if it is a new slot.
- **Tune detection:** fillers, hedges, red flags, grammar rules and the mock-call checklist are plain word lists in `js/lexicons.js`.
- **Change role weights or verdict thresholds:** `ROLE_WEIGHTS` and `VERDICTS` in `js/scoring.js`.

After any change, run `npm test`. It includes calibration tests that check strong, average and weak candidates still rank correctly.

## Project structure

```
index.html            App shell (home, voice call, scoresheet)
css/styles.css        Styles (light and dark themes, print layout)
js/textUtils.js       Tokenising, contraction handling, pattern matching, numbers
js/lexicons.js        Word lists: fillers, hedges, STAR, empathy, red flags, grammar
js/questionBank.js    Questions, rubrics, follow-ups, interview plans
js/jobFit.js          Tailoring to a pasted job description: skills, question choice, the job question
js/coach.js           Live coaching (time, pace, fillers) and the engineering approach checklist
js/progress.js        Progress across saved interviews: trend, skills, streak
js/backup.js          Back up and restore saved interviews, and export them as CSV
js/techBank.js        Engineering roles, company styles, two-round plans and 100+ technical questions
js/analyzer.js        Per-answer signals and 0–100 scores
js/scoring.js         Interview-level scoresheet, recruiter scale, gates, verdict
js/explain.js         Evidence behind every score: reasons, strengths, tips, summary
js/engine.js          Interview flow: follow-ups, reactions, branching mock call, rounds
js/callsim.js         The live customer for the 4-round assessment (mood, reactions, outcome)
js/callContent.js     Call problems, customer moods, caller names, topic words
js/voice.js           Hands-free rules: voice commands, end-of-answer detection, nudges
js/speech.js          Browser text-to-speech and speech recognition
js/whisper.js         Offline Whisper speech recognition (transformers.js, loaded on demand)
js/proctor.js         AI proctoring from the camera: face, eyes, extra people, phones (MediaPipe, loaded on demand)
js/audio.js           Microphone analysis: pauses, loudness, pitch
js/recorder.js        Answer recordings (MediaRecorder + IndexedDB)
js/llm.js             Optional Ollama integration
js/report.js          Scoresheet rendering
js/demo.js            Scripted candidates (sample report, demo, tests)
js/app.js             UI controller
js/board.js           The Results page: every interview on the site, search, sort, CSV, full scoresheets
api/results.js        Vercel function for the Results board (send, list, open, delete)
lib/results.js        Results board logic and storage (Upstash Redis on Vercel, files for npm start)
sw.js                 Service worker: install as an app, open offline
manifest.webmanifest  App name, icons and colours for installing
icons/                App icons (drawn by tools/icons.js)
server.js             Zero-dependency local server (npm start; npm run lan for phones on Wi-Fi)
tools/selfsigned.js   Self-signed HTTPS certificate with Node's crypto (for npm run lan)
vercel.json           Vercel hosting: build command, output folder, headers
tools/build.js        Copies the site into dist/ for static hosting (npm run build)
tools/simulate.js     Run a scripted interview in the terminal
tools/icons.js        Draws the app icons as PNG files (no dependencies)
tests/                node:test suite (npm test), incl. 30 recruiter-rated interviews
```

## Limitations

- Speech-to-text can mishear words, especially with strong accents or background noise, and both engines often drop "um"/"uh". Pause analysis from the microphone partly compensates.
- The conversation is half-duplex, like a polite phone call: Tushar AI doesn't listen while speaking, so you can't interrupt mid-sentence.
- Engineering answers are judged on the concepts and reasoning you say out loud; there is no code to run, so it cannot check that code you describe would actually work.
- The built-in model judges *signals* (structure, coverage, delivery), not deep meaning. A well-structured answer with the right ideas scores well even if a human would phrase it differently. The optional local AI adds a semantic check.
- The AI proctoring flags what a webcam can see; it can be misled by lighting or angle and cannot see what is out of frame (see **AI proctoring**).
- Treat the scoresheet as practice feedback and one input to a hiring decision, never the only one.
