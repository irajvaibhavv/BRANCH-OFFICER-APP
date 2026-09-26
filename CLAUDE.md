# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**BO Connect** — a React 19 + Vite prototype of a mobile field app for NBFC Branch Officers who manage DSA (Direct Selling Agent) relationships. There is **no backend**: all data is dummy JSON seeded into `localStorage`. "AI" features are deterministic local simulations, not API calls.

## Commands

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # production bundle in dist/
npm run lint      # oxlint (config: .oxlintrc.json — rules-of-hooks is an error)
npm run preview   # serve dist/
```

There is no test suite. Verify changes with `npm run build` + `npm run lint`; the user reviews the UI themselves on localhost (do not drive a browser).

Demo login: any 10-digit number starting 6–9 → OTP `1234` → set a 4-digit PIN → home.

## Architecture

**Provider stack** (`src/app/App.jsx`): `Theme → Auth → Offline → AppState → BrowserRouter → PhoneFrame → Toast`. Order matters — `AppStateProvider` consumes `useOffline()`, and toasts must render inside the phone frame. On desktop the app renders inside a phone mockup; below 560px width it goes full-screen.

**Routing** (`src/app/router.jsx`): single route table with guards. `RequireAuth` redirects to `/login` (no session), `/login/pin` (session + PIN, locked); `GuestOnly` keeps signed-in users out of login. `PersistentTabBar` is hidden on auth screens, on `/prompter` (teleprompter) and on `/ai/session` (SAARTHI AI handover mode — the phone is handed to a customer/DSA, so they must not be able to navigate the officer's app). Tab highlighting for deep routes is decided by `activeTab()` in `src/components/layout/BottomTabBar.jsx` — when adding a route, map its path prefix there.

**App state = the "database"** (`src/context/AppStateContext.jsx`):
- Each slice (`dsas`, `visits`, `loanFiles`, `notifications`, `meetings`, `recordings`, `dayPlan`) is a `useLocalStorage('bo_*', seed)` value; mutations are `useCallback` helpers exposed via `useAppState()`.
- **Date shifting**: seed JSON is written around `SEED_TODAY = 2026-09-17`; every seed date is shifted by `(today − SEED_TODAY)` at load so "today" always has data. When writing new seed data, date it relative to 2026-09-17.
- **Daily re-seed**: `bo_seed_day` stores `"<today>:<version>"`; if it differs, `resetDemo()` wipes all slices back to seed. **Bump the version suffix whenever the shape of seeded data changes**, otherwise returning users keep stale localStorage.
- `getDsa(id)` also resolves customer ids (prefix `cust`) into a DSA-shaped object (`isCustomer: true`), so schedule/route/visit screens handle DSA and customer stops without branching.
- Mutations call `track(type, payload)`, which pushes to the offline sync queue when offline.

**Persistence rules**: all persisted state goes through `src/hooks/useLocalStorage.js` with keys prefixed `bo_`. Logout (`AuthContext`) deletes every `bo_*` key, which is how the demo resets — a key without the prefix will survive logout.

**Offline** (`src/context/OfflineContext.jsx`): `isOnline = navigator online && !bo_sim_offline` (toggle in Profile). Offline actions queue in `bo_sync_queue`; going online fakes a "Syncing… → synced" cycle. Comments there describe the intended production replacement (service worker + IndexedDB).

**Code layout**: `src/services/` holds side-effecting or simulated-AI logic (no React); `src/utils/` holds
pure helpers; `api/` is the Vercel functions; `scripts/` holds the Node dev tools (proxy, voice prerender).
Code comments are kept to one-liners on non-obvious *why* — the long-form reasoning lives in this file.

**Simulated AI** (`src/services/`, pure JS, no React):
- `assistant/flows.js` — scripted SAARTHI AI handover interview flows (nodes with `say/options/input/next/key`, keyword-based branching), producing a report for the officer.
- `meeting/transcript.js` — deterministic per-DSA transcript + summary generation for the meeting recorder; `meeting/prep.js` — rule-based meeting questions.
- `voice.js` — shared TTS via ElevenLabs (`VITE_ELEVENLABS_API_KEY`) or Murf AI (`VITE_MURF_API_KEY`) when set (`.env.local`, see `.env.example`; on Vercel add it as an env var), else browser Web Speech API; STT is always browser. Lines queue and play in order; `prefetch(lines)` warms Murf before a multi-bubble turn. Everything must still work as typed text when unsupported.
- `src/utils/loanCalc.js` (EMI/eligibility/FOIR), `src/utils/commission.js` — business logic shared across screens.

**Sarthi AI** (`src/screens/sarthi/`, `src/services/sarthi/*.js`, `src/data/sarthi/*.json`) — the one feature that
calls a real model (Gemini), kept separate from SAARTHI AI (`screens/assistant/`, `services/assistant/flows.js`), which stays scripted.
File names below are in `src/services/sarthi/` unless a path is given (`knowledge.js` = cases + grounded lookups).
- Agent 1 interviews on a video-call screen and emits ```claim``` blocks; Agent 2 writes the officer's report.
- **The controller decides what to ask; the model only decides how to say it.** `controller.js`
  walks `pdSchema.json` in code and injects a "THIS TURN" directive into Agent 1's prompt each turn;
  `memory.js` holds the extracted facts (Agent 1 returns them in a ```facts``` fence). Coverage
  is therefore a property of the program, not something the model has to remember on a long call, and
  the interview ends when the schema is satisfied — not when the model decides it is done.
- **Applicants are mostly tier 2/3 small traders**, so every schema field carries an `ask` — a
  plain-Hinglish example question ("Mahine mein kul bikri kitni ho jaati hai?") that the directive
  passes to the model, and the interviewer prompt bans banking jargon (kisht, not EMI; bikri, not
  turnover). Add a field = add its `ask`. The allowed-key lists in both prompts are generated from the
  schema (`KEY_GUIDE`, `ENUM_GUIDE`), so never hand-type keys into a prompt. Conditions stay literal:
  `"key === 'value'"` or `"key > n"`, parsed in `memory.js`, never evaluated.
- **`monthly_rent` is house rent; `shop_rent` is the premises.** Only shop rent is checked against the
  area's `avgShopRent` — comparing a room's rent with shop ranges produced false contradictions.
  Every field is roughly one more turn, and turns are Gemini requests against a per-day quota, so
  weigh a new field against that.
- **A turn is two model calls, in a fixed order** (`model.js`). First `extractFacts` pulls
  named fields out of the answer; only then does the controller pick the next topic, so it decides
  on *this* turn's facts. The question call still emits a ```facts``` fence as a backstop — a
  dropped fact is uniquely expensive, because the controller would re-ask that question forever —
  and the loop merges it in for keys the extractor missed. Snapshot memory *before* extraction:
  `checkContradictions` compares new facts against the prior state, and coaching detection compares
  an income figure against `income_mentions`, which would already contain it otherwise.
- **Routing happens before the call and there is no fallback between providers.** `TASK_ROUTES` in
  `model.js` sends fact extraction to the SLM (Groq, default `qwen/qwen3.8-27b`, ~0.2–0.4s) and
  everything else — question phrasing, report, area and hyper-local questions — to the LLM (Gemini,
  ~2.7s). Trying the SLM and escalating on failure would cost SLM time *plus* LLM time, so bad
  extraction JSON retries the **same** provider with a stricter, colder prompt. `GROQ_API_KEY` is
  optional and server-side; unset, `slm` is served by Gemini and nothing changes. Override per task
  with `VITE_SARTHI_EXTRACT_PROVIDER` / `VITE_SARTHI_QUESTION_PROVIDER`.
  Measured 2026-09-25 on this account's Groq key: no Llama chat model is served (`llama-3.1-8b-instant`
  does not exist there); `gpt-oss-20b` returned empty and `gpt-oss-120b` truncated (reasoning tokens
  billed against `max_tokens`). Question phrasing stays on Gemini because Qwen dropped **every** fence
  (`speech`, `facts`, `claim`) on the real prompt, and Groq free tier's 7k input tokens/min fits only
  ~2 turns a minute. Extraction is on the SLM to save Gemini's per-day quota: Qwen drops some fields
  outright (5/8 captured in testing), which the question call's `facts` fence backfills, and its
  numeral misreads are corrected by `hindiNumbers.js`. Shorter extractor prompts scored *worse*.
- **Numbers are parsed in code, never trusted to the model** (`hindiNumbers.js`). Every figure in a
  PD is load-bearing — it feeds contradiction flags, the walk-in income rebuild and eligibility — so
  a misread number does not look like an error, it looks like a *finding*, cited, in a report an
  officer acts on. `extractFacts` therefore reconciles each numeric field against the borrower's own
  words and keeps the parsed value when they disagree and the sentence holds exactly one number
  (with none or several, the parser cannot know which field is meant, so it abstains). Measured
  saves: "pandrah hazaar" read as 12,000, "bais hazaar" as 20,000, "saath customer" as 6. `saath`
  is read as 60 only before a scale word or countable noun, so "mere saath partner hai" stays text.
- **`VITE_SARTHI_MOCKS=true`** (DEV only) serves canned replies from `mocks.js` with no
  network call, so work on the loop or the UI does not burn the free tiers the demo needs. The
  fixtures are raw fenced text run through the real parser, so they prove the plumbing — not that
  the model follows the prompt.
- **Area data resolves specific → tier → rural** (`lookupLocation`). Only `source: 'specific'` areas
  have landmarks, so trap questions are gated on that; tier ranges are indicative and the verifier
  softens a rent verdict to `unverified` rather than `contradicted` on them. Always resolve with
  `areaKey || area` — a walk-in has no `areaKey`.
- **Walk-ins are assessed on internal consistency**: `checkInternalConsistency` compares their own
  numbers against each other and against `typicalMarginPct` in `businessKnowledge.json`, and
  `assessIncome` rebuilds income from footfall × bill × margin, taking the LOWER of that and what
  they declared. `computeEligibility(caseData, assessed)` then reports it as rebuilt, never as verified.
- Findings with no single turn behind them cite `(Flag: field)` or `(Fact: key)`; `validator.js`
  checks those against the flags and collected facts the system actually produced.
- `vercel.json`'s SPA rewrite must exclude `/api/` (`/((?!api/).*)`), or the Sarthi endpoints return
  index.html instead of JSON and every interview silently drops to scripted mode. The file cannot
  carry that note itself: Vercel's schema rejects unknown keys such as `_comment`.
- No key reaches the bundle: calls go to `/api/sarthi-chat` and `/api/sarthi-vision` — `api/*.js` on
  Vercel (`GEMINI_API_KEY`, optional `GROQ_API_KEY`, never `VITE_`-prefixed), `scripts/sarthi-proxy.mjs` in dev
  (`npm run sarthi`, which loads `.env.local` itself; vite proxies :3001). Both providers sit behind the
  one chat endpoint, chosen by the request's `provider` field, so adding Groq did not add a Vercel
  function. Models are `gemini-3.6-flash` and `qwen/qwen3.8-27b`, overridable with `GEMINI_MODEL` /
  `GROQ_MODEL` (server-side vars — 2.5-flash is retired for new keys).
- **Thinking is off by default** (`thinkingConfig.thinkingBudget: 0`). Thought tokens are billed against
  `maxOutputTokens`, so a thinking model silently starves its own reply: a 1024-token interview turn
  spent ~730 thinking, and the 100-token vision call would return an empty string every time. Callers
  opt back in — only `writeReport` does (budget 4000, ceiling 12000). Always read the reply by joining
  **all** `content.parts`, never `parts[0]`.
- **Degrading is per-turn, not permanent — including at the opening.** Free-tier Gemini returns 503
  "model overloaded" and 429 quota errors often, so `askAgent` retries 429/500/502/503/504 and network
  errors twice (700ms, 1800ms, or the upstream's own `retryDelay` when it is ≤4s) while failing fast on
  400/401/404, which retries cannot fix. A **per-day** 429 is not retried at all: `proxyError` reads the
  upstream body so the reason is in the console rather than a bare status, and no amount of waiting
  clears a daily quota. A turn that still fails borrows one scripted question and tries live again next
  turn; only a permanent status sets `demoRef`. The opening turn behaves the same way — a 429 at hello
  used to lock the whole interview to the script, which is the worst trade available in a demo. **No reachable proxy at all → the whole
  interview runs `script.js` scripted mode** and still produces a full report, so a demo never dies
  on a missing key. Engines are never mixed mid-interview by design — the voice and phrasing would shift
  audibly halfway through.
- **The free tier's binding limit is requests per DAY, so count requests, not tokens.** A turn is one
  Gemini call (the question); extraction goes to the SLM, and the ```facts``` fence on the question call
  covers whatever it drops, which costs nothing extra. There is no separate reachability probe — the
  opening question IS the probe, because a probe spent a whole request to say hello. Vision bills
  wall-clock time whether or not anyone is speaking: one frame per 60s, hard cap 6 per interview
  (`VITE_SARTHI_VISION_MS` / `_MAX`, `0`/`off` disables). Observations are a bonus layer the report cites
  when present — never let them be the reason the interview itself runs out of quota.
- Anti-hallucination is the point of the file split: the model may only use the JSON knowledge files
  (`borrowers`, `businessKnowledge`, `locationKnowledge`, `riskPatterns`, `pdSchema`),
  `verifier.js` (plain rules) decides confirmed/contradicted/unverified, `loanCalc.js` computes every
  eligibility number, and `validator.js` strips any finding whose citation does not resolve.
  Keep new facts in the JSON files, new fields in `pdSchema.json`, new verdicts in the verifier — never
  in a prompt.
- **Voice**: Sarthi has its own voice (`services/sarthi/voice.js` — ElevenLabs Flash v2.5 with `language_code: 'hi'`, Murf
  `hi-IN-kabir` when only a Murf key exists), passed per `speak()` call so
  SAARTHI AI keeps the app-default voice from `.env`. Captions are Hinglish but the TTS is fed Devanagari
  (`speech` on each script step, a ```speech``` block from Agent 1): a Hindi voice reads romanized Hindi with
  English pronunciation. Scripted lines are pre-rendered to `public/sarthi-audio/` by `npm run sarthi:voice`
  and played from disk via `voiceManifest.json` (Murf only — `PRERENDERED` skips them on ElevenLabs so the voice never switches mid-call), so a demo makes no TTS call — **re-run it after editing any
  question or the voice config**, or that line silently falls back to a live API call. The manifest only
  covers scripted lines: **live mode writes novel text every turn, so it always pays the TTS round trip.**
  The question text appears when the voice starts (`onStart` from `speak()`), not while TTS renders —
  showing it seconds early made the audio feel laggy. Live replies put the ```speech``` fence first for the same reason.
- **Live speech is streamed sentence by sentence** (`stream.js`). Murf renders a whole line
  before a word is audible, so a 3-sentence question is ~1.5s of silence. `speakStreamed` splits the
  Devanagari at `.!?।`, `prefetch`es every chunk at once and plays the first as soon as ITS audio
  lands (~0.8s); later chunks always finish rendering before the one ahead stops playing. Same
  characters, so no extra quota by volume — but 2-3 Murf calls per turn against a per-minute limit.
  Three rules the tests pin down: a `.` between digits never splits ("2.5 lakh"), a pre-rendered
  `src` line is never split (one file is the whole point), and `onEnd` fires **exactly once** — the
  chunks are chained through each other's `onEnd` rather than bulk-queued, because `services/voice.js` clears
  its queue wholesale when an engine fails, which would drop the tail and strand the interview
  waiting on a callback that never comes. `services/voice.js` itself is untouched: it is shared with SAARTHI AI.
- **Sarthi asks for Murf, but a missing `VITE_MURF_API_KEY` silently degrades it to browser TTS**
  (`pickEngine` falls through). That is a config problem, never a code one — if Sarthi sounds like
  the browser, the key is absent from `.env.local` or from Vercel.
- **Walk-ins**: `/sarthi/new` builds a case for someone with no bureau or bank record (`buildNewCase`,
  stored in `bo_sarthi_cases`). Every field on the brief stays `null` — nothing is invented. Eligibility
  then depends on what the interview collected: with footfall and average bill, `assessIncome` rebuilds
  income and `computeEligibility` returns `assessable: true` flagged `assessedIncomeMethod:
  'calculated_from_answers'`, which both report writers must present as rebuilt and explicitly unverified.
  Without those answers it stays `assessable: false` and the report says "not assessable" rather than
  printing a figure. A declared income alone is never enough to produce a number.
  `idChecks.js` does the offline document checks (Aadhaar Verhoeff, PAN structure + surname initial);
  it is not eKYC and the copy says so everywhere.
- **Photographs**: Sarthi asks for the shop and home mid-interview (`photo` on a script step, or a
  ```photo shop``` fence from Agent 1). Images are downscaled in the browser and kept in
  `bo_sarthi_photos_<case>`, separate from the report record so their weight cannot break its write.
  Gemini Vision describes what is visible; with no proxy the photo is stored and flagged un-read.
  **Photos come from the live camera, not a file picker** (`components/sarthi/PhotoCapture.jsx`), so a
  gallery, downloaded or AI-generated image cannot simply be handed in. The interview's selfie stream is
  paused while it is open (`pauseCamera`/`resumeCamera` — many phones cannot run two cameras). A gallery
  upload is offered only when the camera cannot open, and `photoCheck.js` checks it in code: file date
  and EXIF capture time vs interview start, missing camera make/model, PNG/WebP, editor software in
  EXIF. Each doubt becomes a `photo_provenance` flag (`Flag: photo_<kind>`) in the report — never a
  rejection. A vision description that mentions a screen, print or generated image adds a soft flag too.
  None of this catches someone photographing a real house that is not theirs; that stays the officer's job.
- Sarthi state is `bo_sarthi_*` in localStorage (cleared on logout like every `bo_` key); it is not part of
  the AppState seed/date-shift system.

## Conventions

- One folder per feature under `src/screens/`, each with its own `*.module.css`. Screens never import another screen's CSS — shared styles go in `src/styles/` (`variables.css` holds design tokens incl. dark theme) or become a `src/components/ui/` primitive.
- Several related screens can live in one file and be exported as named exports (e.g. `MeetingRecorder.jsx` exports `RecordingDetail`, `RecordingsList`, `EngagementDetail`).
- New screen: add folder under `screens/` → register route in `app/router.jsx` → map its path in `BottomTabBar.jsx` `activeTab()`.
- Screens never import from other screens. A hook several screens share goes in `src/hooks/` (e.g. `useSarthiReports`); a shared component goes in `src/components/<area>/`.
- Files inside a feature folder drop the feature prefix (`services/sarthi/model.js`, not `sarthiModel.js`).
- Page transitions use framer-motion via `components/layout/Page.jsx` with `AnimatePresence` in the router.
