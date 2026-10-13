# AI Interviewer

A free **voice** interviewer for **BPO and customer-service jobs**. It works like a real phone interview: Tushar AI, the AI interviewer, asks every question out loud, listens to your spoken answers, asks follow-up questions, and plays an upset customer in a **mock call**. At the end you hear how you did, and you get a recruiter-style **scoresheet** with recordings of your answers.

- **100% audio, hands-free.** No typing and no chat. Tushar AI knows when you've finished speaking, and you can say *"repeat"*, *"skip"* or *"that's all"* instead of pressing buttons.
- **No API keys, no payment, no sign-up.** It runs entirely in your browser.
- **Works in any modern browser.** Chrome and Edge use their built-in speech recognition; other browsers (Firefox, Brave…) use a free **offline Whisper model** that runs on your device.
- **Hear yourself back.** Every answer is recorded (on your device only) so you can replay it next to its feedback.
- **Transparent scoring model.** Every score traces back to concrete signals in your answers.
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

### Or GitHub Pages

1. On GitHub, open **Settings → Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**, then pick your branch and the `/ (root)` folder.
3. After a minute your interviewer is live at `https://<your-username>.github.io/Ai-interviewer-/`. HTTPS is included, so the microphone works.

### Try it without a microphone

- Click **See a sample scoresheet** on the home page.
- Or run a scripted interview in the terminal: `npm run demo` (try `node tools/simulate.js weak --full` or `node tools/simulate.js average --role sales`).

---

## How the voice interview works

1. **Mic check.** Tushar AI greets you and asks you to say *"I'm ready"*. The **You** panel under the orb shows your mic level and the words it understands as you speak, then *"✓ Got it! Your microphone works"*. If your voice comes through without words, Tushar AI adjusts how it listens, then switches to the offline engine; if nothing comes through, you're told what to check.
2. **Questions.** Tushar AI speaks each question. The orb turns green while it's your turn to talk, the ring around it shows the time left, and the **You** panel shows your words live (*"Tushar AI hears…"*), then what will be scored (*"You said…"*).
3. **Turn-taking.** When you stop talking, Tushar AI waits a moment, then replies, waiting longer if you've only just started, so thinking pauses are safe. Short replies such as *"No."* count as answers too. You can set how long the wait is (2, 3 or 5 seconds), or have Tushar AI wait until you say *"that's all"* (with the offline Whisper engine, which only reads your words after you finish, a long pause of about 8 seconds ends the answer instead).
4. **Voice commands.** Say *"Can you repeat the question?"* or *"pardon?"* to hear it again (even after a false start), *"skip this one"* or *"next"* to move on, or end your answer with *"that's all"* or *"I'm done"*. Tushar AI confirms out loud, so you never need to look at the screen. If you say *"I don't know"*, you get time to think (or say *"skip"*); if you're silent for a while, you get a gentle nudge. In the mock call, the customer asks *"Hello? Are you still there?"*
5. **Spoken feedback.** After the last question, Tushar AI reads out your score, your strongest area, and your top tip. The full scoresheet opens with ▶ playback (and download) of each of your answers.

**If something goes wrong, Tushar AI handles it:**

- **Can't hear your words:** if the mic hears you but no words come through, Tushar AI asks you to repeat, stops sharing the mic with the browser's recogniser (letting it open the mic itself), then switches to the offline Whisper engine.
- **Internet drops for a moment:** the built-in recogniser retries quietly, so a short Wi-Fi blip doesn't lose your answer; only a longer outage switches to Whisper.
- **You switch tabs:** the call pauses. When you return, Tushar AI says *"Welcome back"* and picks up where you left off. (In the listening test, hearing the details again counts as a repeat.)
- **Your microphone disconnects** (a headset is unplugged or Bluetooth drops): Tushar AI tells you, and **Try again** reconnects it, or uses whichever microphone is now plugged in. Try again in the mic check does the same, so you can switch to a different microphone.
- **Browser blocks the voice:** some phones (iPhone Safari) block it until you tap; a *"Tap to hear Tushar AI"* button appears. If speech still won't play, captions take over.
- **Background noise:** if a TV or fan keeps the mic busy after you've stopped, Tushar AI goes by your words instead.

**Live captions** are on by default: you see the interviewer's words, and the **You** panel shows your own words live as you answer. (With the offline Whisper engine your words appear phrase by phrase, each time you pause.) The **CC** button hides them.

On-screen buttons (Captions, Repeat, Skip, I'm done, End) are there if you want them. Keyboard: <kbd>Enter</kbd> finishes an answer, <kbd>R</kbd> repeats, <kbd>C</kbd> toggles captions.

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
| English & listening | Remember a customer's name, order number and city; correct a sentence | Listening accuracy, grammar |
| Flexibility | Night and rotational shifts, weekends | Willingness, clarity |
| Self-awareness | Strengths and weaknesses, five-year plan | Honesty, growth mindset |
| Closing | "Any questions for me?" | Curiosity, engagement |

Three lengths are available: **Quick** (7 questions, about 10 min), **Standard** (14, about 20 min) and **Full** (21, about 30 min). Questions adapt to the role (voice support, tech support, sales, chat/email, general) and to fresher or experienced candidates. The question set is randomised, so practising again gives different questions.

### The interviewer reacts to your answers

- **Follow-ups:** if an answer is too short, misses an example, skips something important (e.g. empathy with an angry customer), or contains a red flag, the interviewer asks a probing follow-up, just as a real recruiter would.
- **Live reactions:** strong answers get "That's a strong answer"; weak ones get a neutral "Okay, let's move on".
- **Branching mock call:** the customer's next line depends on what you said. Apologise and empathise and they calm down and share their order number; skip the empathy and they get angrier.

---

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

Scoresheets (and answer recordings) are saved in your browser's history. They can be printed or saved as PDF, or downloaded as JSON. Press **🔊 Hear my feedback** to have Tushar AI read your result aloud again.

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

In the app, open **Voice, camera & local AI settings**, tick **Use a free local AI model**, press **Test**, and pick the model. After the interview, the model rates each answer and writes the summary. Its scores are **blended** with the rule-based ones (the rules stay the majority), and it adds a one-line tip per answer. Everything stays on your computer.

> If the app is hosted somewhere other than `localhost` (e.g. Vercel or GitHub Pages), allow that site in Ollama: `OLLAMA_ORIGINS="https://<your-app>.vercel.app" ollama serve`. Some browsers block an online page from talking to `localhost`; if **Test** can't connect, run the app locally with `npm start`.

---

## Speech recognition: two free engines

| Engine | Used by default in | How it works | Needs |
|---|---|---|---|
| **Browser built-in** | Chrome, Edge, Safari | The browser's own speech service; live words while you speak | Internet |
| **Offline Whisper** | Firefox, Brave, and any browser whose built-in service fails | OpenAI's Whisper *tiny.en* model running on your device with WebAssembly ([transformers.js](https://github.com/huggingface/transformers.js) 4.3.0) | A one-time download of about 48 MB, cached by the browser |

The interview picks automatically, and switches to Whisper mid-interview if the built-in service fails (e.g. offline or blocked). You can force either engine under **Voice, camera & local AI settings → Speech recognition**. With Whisper, the app uses the microphone level to tell when you've finished, then transcribes your answer in a background worker (usually 1 to 3 seconds).

> Self-hosting the model (e.g. for an intranet with no internet): set `window.AII_CONFIG = { whisper: { libUrl, modelHost, wasmPaths } }` before the scripts load. See the comments at the top of `js/whisper.js`.

## Privacy

- All analysis and scoring runs locally in your browser. Nothing is sent to any server of this project; there is no server.
- **Speech recognition:** with the built-in engine, Chrome and Edge transcribe speech through their own cloud speech service (that's what makes it free and keyless). With the offline Whisper engine, audio never leaves your device.
- **Recordings** of your answers are stored only in this browser (IndexedDB) so you can replay them. Turn recording off in the settings, or delete them with the history.
- The camera preview is optional, for realism only, and is never recorded.
- History is stored in your browser's `localStorage`. Use **Clear all** on the home page to delete it, recordings included.

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
js/analyzer.js        Per-answer signals and 0–100 scores
js/scoring.js         Interview-level scoresheet, recruiter scale, gates, verdict
js/explain.js         Evidence behind every score: reasons, strengths, tips, summary
js/engine.js          Interview flow: follow-ups, reactions, branching mock call
js/voice.js           Hands-free rules: voice commands, end-of-answer detection, nudges
js/speech.js          Browser text-to-speech and speech recognition
js/whisper.js         Offline Whisper speech recognition (transformers.js, loaded on demand)
js/audio.js           Microphone analysis: pauses, loudness, pitch
js/recorder.js        Answer recordings (MediaRecorder + IndexedDB)
js/llm.js             Optional Ollama integration
js/report.js          Scoresheet rendering
js/demo.js            Scripted candidates (sample report, demo, tests)
js/app.js             UI controller
server.js             Zero-dependency local server (npm start; npm run lan for phones on Wi-Fi)
tools/selfsigned.js   Self-signed HTTPS certificate with Node's crypto (for npm run lan)
vercel.json           Vercel hosting: build command, output folder, headers
tools/build.js        Copies the site into dist/ for static hosting (npm run build)
tools/simulate.js     Run a scripted interview in the terminal
tests/                node:test suite (npm test), incl. 30 recruiter-rated interviews
```

## Limitations

- Speech-to-text can mishear words, especially with strong accents or background noise, and both engines often drop "um"/"uh". Pause analysis from the microphone partly compensates.
- The conversation is half-duplex, like a polite phone call: Tushar AI doesn't listen while speaking, so you can't interrupt mid-sentence.
- The built-in model judges *signals* (structure, coverage, delivery), not deep meaning. A well-structured answer with the right ideas scores well even if a human would phrase it differently. The optional local AI adds a semantic check.
- Treat the scoresheet as practice feedback and one input to a hiring decision, never the only one.
