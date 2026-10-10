# AI Interviewer

A free **voice** interviewer for **BPO and customer-service jobs**. It works like a real phone interview: Aria, the AI interviewer, asks every question out loud, listens to your spoken answers, asks follow-up questions, and plays an upset customer in a **mock call**. At the end she tells you how you did, and you get a recruiter-style **scoresheet** with recordings of your answers.

- **100% audio, hands-free.** No typing and no chat. Aria knows when you've finished speaking, and you can say *"repeat"*, *"skip"* or *"that's all"* instead of pressing buttons.
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

### Put it online for free (GitHub Pages)

1. On GitHub, open **Settings → Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**, then pick your branch and the `/ (root)` folder.
3. After a minute your interviewer is live at `https://<your-username>.github.io/Ai-interviewer-/`. HTTPS is included, so the microphone works.

### Try it without a microphone

- Click **See a sample scoresheet** on the home page.
- Or run a scripted interview in the terminal: `npm run demo` (try `node tools/simulate.js weak --full` or `node tools/simulate.js average --role sales`).

---

## How the voice interview works

1. **Mic check.** Aria greets you and asks you to say *"I'm ready"*. If she can't hear you, she tells you what to check.
2. **Questions.** Aria speaks each question. The orb turns green while she listens, and the ring around it shows the time left.
3. **Turn-taking.** When you stop talking, Aria waits a moment, then replies. She waits longer if you've only just started, so thinking pauses are safe. You can set how patient she is (2, 3 or 5 seconds), or make her wait until you say *"that's all"*.
4. **Voice commands.** Say *"Can you repeat the question?"* or *"pardon?"* to hear it again, *"skip this one"* to move on, or end your answer with *"that's all"* or *"I'm done"*. If you're silent for a while, Aria gently nudges you.
5. **Spoken feedback.** After the last question, Aria reads out your score, your strongest area, and your top tip. The full scoresheet opens with ▶ playback of each of your answers.

On-screen buttons (Captions, Repeat, Skip, I'm done, End) are there if you want them; the **CC** button shows subtitles. Keyboard: <kbd>Enter</kbd> finishes an answer, <kbd>R</kbd> repeats, <kbd>C</kbd> toggles captions.

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
- **Seven skill scores** with explanations:

| Skill | Built from |
|---|---|
| Communication & fluency | Filler words (*um, basically, you know*), repetitions, vocabulary range, completeness, speaking pace (wpm), long pauses, voice modulation |
| Confidence & composure | Hedging (*I think, maybe, I guess*), assertive language (*I handled, I achieved*), negative self-talk, how quickly you start, voice strength above room noise, whether your voice fades at the end |
| Thought process & structure | Reasoning and sequencing words (*because, first… then, as a result*), examples, STAR completeness, specific details (numbers, names, timelines) |
| Answer quality & relevance | How much of what a strong answer includes you covered (a per-question rubric with synonyms), and depth |
| Customer handling & empathy | Empathy phrases, approach to customer situations, the mock-call checklist |
| Attitude & motivation | Positive tone, genuine motivation, flexibility, curiosity, minus red flags |
| English & listening | Listening-test recall, sentence corrections, a grammar coach for common slips (*"Myself Rahul"*, *"I am having 2 years experience"*, *"revert back"*…) |

The scoresheet also includes an **estimated English level (CEFR)**, **role fit** for each BPO role, **red flags to probe**, **speech analytics**, the **mock-call checklist**, an **integrity panel** (tab switches, pasted answers), and a **question-by-question breakdown**. The breakdown shows your transcript with fillers, hedges, strong phrases, grammar slips and red flags highlighted, plus what a strong answer would include.

Scoresheets (and answer recordings) are saved in your browser's history. They can be printed or saved as PDF, or downloaded as JSON. Press **🔊 Hear my feedback** to have Aria read your result aloud again.

### How the scoring model works

1. **Per answer**, the analyser (`js/analyzer.js`) extracts signals from the transcript, the timing, and the microphone (Web Audio: loudness, pauses, pitch).
2. Each signal maps to a 0–100 component through a calibrated curve. Components blend into dimension scores. Signals that cannot be measured (e.g. pitch when the microphone analysis is unavailable) are left out instead of counting as zero. A "weakest link" rule stops one serious problem, such as constant fillers, from being averaged away.
3. **Across the interview** (`js/scoring.js`), each question contributes to the dimensions it informs. A situational question counts heavily towards customer handling; a listening test counts towards English. The seven dimensions are then weighted by role: confidence matters more for sales, written accuracy more for chat support.
4. Red flags lower attitude and the overall score, and a serious one (e.g. "I'd shout back at the customer") caps the verdict.

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

> If the app is hosted somewhere other than `localhost` (e.g. GitHub Pages), allow that site in Ollama: `OLLAMA_ORIGINS="https://<your-username>.github.io" ollama serve`.

---

## Speech recognition: two free engines

| Engine | Used by default in | How it works | Needs |
|---|---|---|---|
| **Browser built-in** | Chrome, Edge, Safari | The browser's own speech service; live words while you speak | Internet |
| **Offline Whisper** | Firefox, Brave, and any browser whose built-in service fails | OpenAI's Whisper *tiny.en* model running on your device with WebAssembly ([transformers.js](https://github.com/huggingface/transformers.js) 4.3.0) | A one-time download of about 48 MB, cached by the browser |

The interview picks automatically, and switches to Whisper mid-interview if the built-in service fails (e.g. offline or blocked). You can force either engine under **Voice, camera & local AI settings → Speech recognition**. With Whisper, Aria uses the microphone level to tell when you've finished, then transcribes your answer in a background worker (usually 1 to 3 seconds).

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

Tips: use headphones (so the mic never hears Aria), find a quiet room, and pick your accent in the setup (e.g. *English — India*) for better recognition.

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
js/scoring.js         Interview-level scoresheet, verdict, narrative
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
server.js             Zero-dependency local server (npm start)
tools/simulate.js     Run a scripted interview in the terminal
tests/                node:test suite (npm test)
```

## Limitations

- Speech-to-text can mishear words, especially with strong accents or background noise, and both engines often drop "um"/"uh". Pause analysis from the microphone partly compensates.
- The conversation is half-duplex, like a polite phone call: Aria doesn't listen while she is speaking, so you can't interrupt her mid-sentence.
- The built-in model judges *signals* (structure, coverage, delivery), not deep meaning. A well-structured answer with the right ideas scores well even if a human would phrase it differently. The optional local AI adds a semantic check.
- Treat the scoresheet as practice feedback and one input to a hiring decision, never the only one.
