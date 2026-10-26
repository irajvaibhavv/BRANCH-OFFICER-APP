# Sarthi AI — design notes

Moved out of CLAUDE.md (2026-10-23) so it is not loaded into every session. Read this before changing anything under
`src/screens/sarthi/`, `src/services/sarthi/` or `src/data/sarthi/`. The rules that must never be broken are summarised in CLAUDE.md.

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
  Qwen3 thinks by default — the `<think>` text spent the 300-token budget, no JSON came back, and the extraction's
  backoff retries (plus its bad-JSON retry) held the question for 5-10s. Both proxies now send `reasoning_effort: 'none'`
  and strip `<think>`; `extractFacts` has no backoff retries and a 2.5s budget (`VITE_SARTHI_EXTRACT_MS`), after which
  the question call goes ahead and the facts fence backfills.
- **Age is checked in code** (2026-10-26, `ageOnFile` / `checkContradictions`): the stated age against the KYC date of
  birth, else the application's age; more than 2 years apart is a contradiction (over 5 high) and Sarthi asks about it
  next turn. English speech recognition writes "sau" as "so" — read as 100 before "saal"/"log"/"rupaye" or after a
  number. A plain count the model misses (age, family, employees, customers a day) is filled from the answer when it
  holds exactly one number; money never is ("pachees" rent is 25,000). `npm run check:age`, `check:numbers`.
- **Face check is face recognition, not a chat model** (2026-10-26): Haiku called the officer himself a different person
  (hand on the face, another angle, "cheekbones and jawline differ"). `compareFace` now runs face-api on the phone (tiny
  face detector, 68 landmarks, dlib ResNet 128-number descriptor; a lazy 330 kB chunk + ~7 MB weights from jsDelivr,
  cached) and the code decides on the descriptor distance (`matchVerdict`): under `SAME_BELOW` 0.55 same, over
  `DIFFERENT_ABOVE` 0.65 different, between unsure. Free, so every 30s, up to 20 per PD. The report flags high only when
  most checks, and at least two, were different; one among matches is a low "mixed, look yourself". Not certified
  liveness or Aadhaar face match — that needs a KYC vendor.
- **"Aap kahan chale gaye?"** (2026-10-26, `away.js`): on-device face detection (MediaPipe BlazeFace short-range, wasm
  and model fetched at call start, a 45 kB lazy chunk) checks the camera every 0.7s — no API cost, unlike the 90s
  vision face check. A face counts only at score ≥ 0.75 (`MIN_SCORE`): BlazeFace still found a face behind a hand at
  0.5, so a covered face never triggered the ask; the score is logged with each ask for tuning. With no face for 4s, Sarthi stops listening,
  asks where they went, waits, and repeats its question when a face is back. Only from `listening`, so a line, a photo
  ask or a model turn is never cut off — time away while Sarthi speaks counts, so it asks the moment the mic opens. No
  "words heard" guard: room noise kept resetting it (or was taken as an answer) and the ask never came; talking off
  camera is still away. Face visible / not visible changes go to the console with the score. Re-asked every 20s, three times; then the call carries on and the check stays
  quiet until a face is seen again — bad light looks the same as an empty room. Each leave and return is in the call
  log. Detector fails to load → no check, the call is unchanged.
- **Turn latency** (2026-10-26): each live turn logs `[sarthi] turn N latency` when the voice starts — ms after the answer
  was submitted for `intent`, `extract`, `firstToken`, `speechText` (speech fence closed) and `voice`, on top of the
  `ANSWER_PAUSE_MS` silence wait. `listen()` submits the moment the silence timer fires when every result is already
  final, instead of waiting 0.3-1.5s for Chrome's `onend`. The greeting sends an `OPTIONS` to `/api/sarthi-chat` so the
  first live turn does not pay a cold start. If `intent` is the slowest lap, `VITE_SARTHI_INTENT_PROVIDER=slm` moves the
  intent read to Groq (watch its per-minute token limit — extraction is already there).
- **Numbers are parsed in code, never trusted to the model** (`hindiNumbers.js`). Every figure in a
  PD is load-bearing — it feeds contradiction flags, the walk-in income rebuild and eligibility — so
  a misread number does not look like an error, it looks like a *finding*, cited, in a report an
  officer acts on. `extractFacts` therefore reconciles each numeric field against the borrower's own
  words and keeps the parsed value when they disagree and the sentence holds exactly one number
  (with none or several, the parser cannot know which field is meant, so it abstains). Measured
  saves: "pandrah hazaar" read as 12,000, "bais hazaar" as 20,000, "saath customer" as 6. `saath`
  is read as 60 only before a scale word or countable noun, so "mere saath partner hai" stays text.
  Checked against the 978-example extraction set (2026-09-26): spellings are folded ("baarah" = "barah"), sawa/
  saade/paune shift the next number (+¼, +½, −¼), "sau" is a scale, "no" is never 9, and a model value that is a
  conversion of the spoken one (implied thousands, daily/yearly → monthly) or a zero ("koi nahi") is kept. Summed
  counts (family_size, dependents, earning_members) are never reconciled. It now overrides 1 label of 592, and
  that label is wrong.
- **`VITE_SARTHI_MOCKS=true`** (DEV only) serves canned replies from `mocks.js` with no
  network call, so work on the loop or the UI does not burn the free tiers the demo needs. The
  fixtures are raw fenced text run through the real parser, so they prove the plumbing — not that
  the model follows the prompt.
- **Area data resolves specific → tier → rural** (`lookupLocation`). Only `source: 'specific'` areas
  have landmarks, so trap questions are gated on that; tier ranges are indicative and the verifier
  softens a rent verdict to `unverified` rather than `contradicted` on them. Always resolve with
  `areaKey || area` — a walk-in has no `areaKey`.
- **Bank credits are not income for a shop.** `bankIncome(c)` (knowledge.js) is the only way to read income off
  the bank: when `brief.creditsAre === 'turnover'` the credits are sales and are cut to the trade's typical
  margin; otherwise they pass through. Eligibility, the income verdict, the contradiction flag and both brief
  screens all use it — reading `avgMonthlyCredit` directly as income made a Rs 9.5 lakh phone showroom look
  eligible for Rs 50 lakh. Seeded applicants carry `brief.kyc` (Aadhaar last four only), `brief.bureau`,
  `brief.bank` (incl. Account Aggregator source) and `docsSubmitted`, shown under "Documents and KYC".
  `resetSarthiData()` wipes every `bo_sarthi_*` key once per stamp — bump it when the seeded applicants change.
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
  covers whatever it drops, which costs nothing extra. There is no reachability probe and no model call for the
  greeting: it is the fixed `script.js` line (DSA review: `openingLine`), said the moment the call opens — waiting
  ~3s of LLM + TTS for the same words was the "call starts with a lag". Turn two is the first live call. Vision bills
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
  **A line up to 220 characters is not split at all** (2026-09-29, `SPLIT_ABOVE`): each file carries its own lead-in and
  tail silence, so even a ready second chunk was heard as a pause after the full stop; most questions are one render now.
  The browser Hindi voice pauses long at every "।", so its mid-line full stops are read as commas (`softStops`). **Human cadence** (2026-09-30): Sarthi's ElevenLabs `settings` are stability 0.35 / style 0.3 (`VITE_SARTHI_STABILITY`) — the shared 0.6 read every clause on one pitch; both interviewer prompts get `SPOKEN_STYLE` (a short varied opener like "अच्छा जी…", few commas, one "…" thinking pause, linked sentences), which `softStops` keeps.
  Longer lines: at most **two** chunks (first sentence, then the rest): a third parallel render sometimes hit ElevenLabs' concurrency 429, was re-fetched when its turn came and was heard as a long pause after a full stop; a 429/5xx is retried once after 400ms before any fallback. **Browser voices are never split** — each utterance restarts Chrome's network Hindi voice, ~1s at every full stop. Three rules the tests pin down: a `.` between digits never splits ("2.5 lakh"), a pre-rendered
  `src` line is never split (one file is the whole point), and `onEnd` fires **exactly once** — the
  chunks are chained through each other's `onEnd` rather than bulk-queued, because `services/voice.js` clears
  its queue wholesale when an engine fails, which would drop the tail and strand the interview
  waiting on a callback that never comes. `services/voice.js` itself is untouched: it is shared with SAARTHI AI.
- **One voice for the whole call** (`services/voice.js`): only a 401/402/403 or quota reply writes a TTS engine off for the session; a blip or a blocked autoplay sends just that line to the other cloud engine, else the browser. A Hindi profile (`lang: 'hi'`, Sarthi) keeps one browser Hindi voice for every line, male when the device has one (`gender`) — picking by script and writing ElevenLabs off on any error made Sarthi switch to Google हिन्दी (female) mid-call. **Safari (iPhone, Mac) plays only a media element a tap once started**, and a line starts after its TTS fetch, long after the tap — so every line plays through ONE shared element, unlocked (with the browser voice) on the first tap anywhere in the app; a `new Audio()` per line was silent on every Safari. Mute is `muted`, not `volume` (iOS ignores volume). A browser utterance that never starts (Safari drops it without an event) is ended after 3s so the mic still opens.
- **Male or female Sarthi** (2026-09-29; moved 2026-09-30): chosen on `CallSetup` before either call starts — camera + mic check (level meter), 👨 / 👩 with a "Suniye" sample, then Start (that tap also unlocks Safari audio); nothing on the call screen offers a choice mid-interview. It sets `bo_sarthi_voice_gender`;
  `sarthiVoice()` is read per line, so a switch takes effect on the next one. Female: ElevenLabs
  `VITE_SARTHI_ELEVEN_VOICE_FEMALE`, Murf `VITE_SARTHI_VOICE_FEMALE` (`hi-IN-ayushi`), browser a female Hindi voice. The
  words follow the voice: every fixed line is written male and `gendered()` rewrites only first-person forms that can
  only be Sarthi (-unga, raha/sakta/chahta hoon, samajh gaya, and their Devanagari) at the caption/speech choke points
  (`say`, the live `showCaption`/`speakStreamed`, PhotoCapture, the report transcript) — never bare "samjha" ("samjha
  dijiye" = explain) and never "kar rahe hain" (that is the borrower). The model gets `genderRule()` in both interviewer
  prompts; `aboutSarthi` turns status labels ("Sarthi bol rahe hain") into "rahi hain". Pre-rendered audio is male Murf,
  so `prerendered()` is false for the female voice. The browser picks male/female Hindi voices by name — the old MALE
  regex matched "female" (`\bmale` now).
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
- **Depth, not a form** (`probes.js`). A trade with a `depth[]` pack in `businessKnowledge.json` (kirana,
  mobile, electrical shop / dealer / contractor, building contractor, garage, garment, chai) gets a `trade_depth` section of insider questions — margin by category, distributor
  cycle, licence class, retention — whose answers are stored verbatim in `memory.tradeAnswers` (no extraction) and
  judged in the report against each probe's `expect` / `redFlag`. Such a trade skips the single
  `business_domain` knowledge question. Loan purpose is checked in code: a different trade or "kholna/shuru" is a
  new venture, an amount above 24 months of income is a stretch; each unlocks follow-ups (`purpose_reason`,
  `purpose_experience`, `current_business_plan`, `amount_basis`) and raises a `loan_purpose` flag. Three layers, all decided in code:
  (1) insider questions; (2) `judgeAnswer` marks each answer clear / vague / redFlag from its own words
  (`redFlagMatch`, `unlessMatch`, a vague-word list) and `nextTradeProbe` asks that probe's `onRedFlag` /
  `onVague` follow-up once; (3) `checkTradeMath` tests the trade's arithmetic from `hisaab` limits (kirana:
  purchases 70-110% of sales, stock 3-60 days, udhaar ≤ 50% of sales, milk ≤ 60% of sales; electrical: material
  45-85%; `answerRanges` test a quoted rate — coil price, per-point labour — against the market) — the `hisaab.fields` are asked of every applicant, and each failure is a `trade_math` flag. The report
  shows `understanding()` as "X of Y insider answers clear" plus the hisaab list. Flags are followed up one per
  turn, most severe first, then marked `followedUp` — before this they were re-sent every turn. New trade =
  add a `depth[]` pack (with follow-ups) and `hisaab` limits, researched, not invented. `lookupBusiness` takes the longest word-start match — a bare
  substring once filed taxi, carpenter and welding under CA ("ca").
  The PD research notes (2026-09-27) added packs for building contractor, garage (`garage_mechanic`, which now owns
  the "mechanic" alias — in Hindi usage that is a vehicle), garment shop and chai stall (the last two only lightly
  researched), plus three hisaab checks: `netMarginMaxPct` (declared take-home ÷ sales against the trade's
  researched net margin: kirana 15, garage 25, contractor 20), `cupsPerLitre` (chai cups vs milk bought), and
  **worst month for every applicant** — `worst_month_sales` scales income down, and all EMIs (new at the product's
  rate and tenure + running) must stay within 60% of it (the profit/DSCR rule). `recent_loan_applications` denied while
  `brief.bureau.enquiries6m ≥ 2` is a loan-shopping contradiction. `computeEligibility` also caps an unsecured loan at
  15% of a year's bank turnover (`turnoverCap`; only when `creditsAre === 'turnover'`) — that cap is why Imran's
  eligibility dropped from 12.6 to 9.9 lakh.
- **SLM training data** (`npm run sarthi:training -- <source.jsonl>`, output in git-ignored `training/`):
  `scripts/build-training-data.mjs` bundles the app's own `EXTRACTOR_SYSTEM`, schema and number parser, so the
  data matches what inference sends. Extraction labels are checked against `hindiNumbers.js`; interviewer turns are
  speech-fence-first with Devanagari-only speech. Change the extractor prompt, the user message in `extractFacts`
  or the schema → rebuild. `REPORT.md` lists label fixes and thin fields.
- **Guards found by live runs (2026-09-27, `claude-haiku` borrower personas against the real loop):**
  (1) a field asked `MAX_ASKS` (2) times and still empty is left for the officer (`memory.askCount`) — one unextractable
  "2-2.5 lakh" once pinned the controller to `monthly_income` for 20 turns while the model improvised and skipped the
  documents; (2) `acceptedFacts` lets an answer overwrite an already-filled field only if that field was asked
  (`missingFields`, or income on the recheck) — trade-probe and cross-question answers had replaced monthly purchase and
  sales; (3) only the controller ends a PD — the model's `[INTERVIEW_COMPLETE]` is ignored unless `getNextAction` agrees
  (a "20-25 questions" line in the prompt made it say goodbye with the documents unasked); (4) `stated_name` and
  `applicant_name` mirror each other; (5) `trade_math` flags replace their previous result instead of stacking;
  (6) turnover claims are checked against bank turnover (`bank.credits`), not the margin-derived income, and drift is
  grouped by unit, with a four-digit vintage read as a start year. Number fields given as text are parsed in `clean()`
  (a range is its lower figure).
- **Friendly rechecks** (`recheck.js`, 2026-09-27): the arithmetic runs on every answer, and a figure that disagrees with
  the bank or with their own figures is shown to them straight away — both numbers, said kindly ("aapne 18 hazaar
  bataya, bank mein 3.8 lakh mahina aata hai… kuch chhoot toh nahi gaya?"). People under-state as often as they
  over-state, so income is rechecked both ways. Checks: income vs bank-supported income (±40%), sales vs bank credits,
  footfall × bill vs sales, footfall vs credits (implied bill vs the trade's `avgBillValue`), take-home vs
  `netMarginMaxPct`, EMI below bureau, loan applications denied with enquiries on record. **Instant cross-questioning**
  (2026-09-29): two more sources feed the same queue. (a) `driftRechecks` — a filled figure said differently in a later
  answer ("pehle 2 lakh, ab 3 lakh"), which `acceptedFacts` used to drop silently; only a number they actually said, within
  4× (beyond that it is a different quantity misfiled under the key). (b) `flagRechecks` — contradiction, coaching, trade_math
  and internal-consistency flags (not low), now computed BEFORE the next question is picked (`runChecks` in the interview)
  instead of after it, when they only surfaced two turns later as a "follow up naturally" nudge. Flag rechecks have no
  `say`, and the directive forbids stating the trade's normal range — their English detail names it. One per field, at most 7, asked
  before anything else (`recheckQueue`), with the field in `missingFields` so a corrected figure may replace the old one.
  A corrected income resets `income_mentions` and skips the coaching check — a correction is not a coached answer.
  This is the one place the interviewer may point out a mismatch; the prompt still bans it everywhere else.
- **Photos follow where they are** (2026-09-29): `current_place` (shop / home / other) is asked right after the name;
  the photos wait (2026-10-22, `photoTime`): not until 2-6 business / job answers are in — a per-PD number from `memory.seed` —
  so the call opens as a conversation, not an inspection, and the moment cannot be briefed. Then the controller asks that place's photo, then `other_place_possible` in the other place's words (`OTHER_PLACE_ASK`).
  Yes → that photo too ("pahunch kar kholiye, main intezaar karunga"); no → the next turn opens with "Koi baat nahi"
  (`placeNoAck`) and the PD carries on. Both photos are the controller's (`memory.photosAsked`); a photo fence the model adds
  on its own is ignored. Replaced `at_business_place` / `reached_business_place`, whose "pahunch kar bataiye" held
  the call hostage to a walk to the shop. Inside the camera Sarthi also **speaks** the guidance (`GUIDE` in photo.js, Devanagari
  for the voice): tips, "frame ke andar rakhiye", a live light/blur hint once it holds for two checks (≥4.5s apart), and the
  verdict. A shot that passes the code check gets `framingCheck` — the vision model picks ONE code (move_closer,
  move_back, tilted, obstructed, missing, wrong) and every word said is ours; no vision service → the code check stands.
- **Photo location** (`geo.js`, 2026-10-22): a shop / home photo also takes a real GPS fix (never `useGeolocation`'s Pune
  mock) and compares it with `caseData.locations[kind]` — seeded in `borrowers.json` (Mahesh shop, Imran both), or pasted
  as "lat, lng" / a Maps link on the walk-in form. Beyond `NEAR_M` (200 m, after subtracting the fix's own accuracy) it is
  a high `photo_location` flag and a FRIENDLY RECHECK on the call ("kya yeh aapki hi dukaan hai?"; live mode only — the
  script has no queue). No pin on file → the report shows where it was taken, with a map link, for the officer to check.
  `npm run check:geo` asserts the parser and distance maths.
- **Confirm before save** (2026-10-23, lead): a generated report goes to `bo_sarthi_pending` (`usePendingPds`), not
  `bo_sarthi_reports`. The report screen shows it with "Not saved yet" and, at the end, a BO / CO picker, a name and an "I
  have reviewed this PD" checkbox; "Save PD" (enabled only once ticked) moves it into the saved PDs with `confirmedBy`.
  A separate store, not a flag, so history, outcomes, repeat PDs and cross-PD links never see an unconfirmed PD without
  each checking. The brief shows "Report awaiting confirmation" until it is saved. Every PD is confirmed: a dropped call's
  draft stays in `bo_sarthi_draft_<pd>` and shows as a pending incomplete PD (`readDrafts`, removed on save, after which
  "Finish last PD" can carry on); the officer-led PD (`SarthiOfficer`) stores `confirmedBy` on its summary and "Done" waits
  for it. The box is `components/sarthi/ConfirmPd.jsx`. The checker review (maker-checker) is a second, later step.
- **Retention** (`services/retention.js`, More → Data retention, 2026-10-23, lead): the organisation sets how long a PD
  report stays valid (default 90 days from the interview) and how long call video is kept (default 30 days). The report
  shows "PD valid till" / "PD expired — start a new PD" and the video's deletion date; an expired PD is marked, never
  deleted. Video is not recorded yet: a recorder writes `bo_sarthi_video_<pd>` with `{ at }`, and `purgeExpiredVideos`
  (run whenever a PD screen opens) deletes it once past the policy. In production the policy comes from the admin portal
  and video lives in object storage with a lifecycle rule, not on the phone. `npm run check:retention`.
- **Assisted PD** (2026-10-23, lead: "the owner may be one person and the business run by someone else"): one call, one
  phone. It starts when the BO ticks "Dukaan chalane wale bhi saath hain" on CallSetup (`memory.assisted`), or when the
  applicant says someone else runs it (`who_runs`) and that person is with them (`operator_present`). After the
  applicant's whole PD, the schema's `operator` section (before closing) opens with its `handover` line — "hand the phone
  over and step away" — and the call screen shows "Dukaan chalane wale se". Its fields are separate keys (`operator_*`,
  `op_*`), so extraction and prompts need no per-person split; `acceptedFacts` is the one guard that keeps the two apart
  (the operator's answers fill only op_* keys, the applicant's never do), the operator's claims are not checked as the
  applicant's, and in that section the model sees only the operator's own facts and no open flags. `assisted.js`
  compares the two in code: sales a third apart (high), premises / rent / years that disagree (medium), and a likely
  name-lender — applicant never (or only sometimes, and weak on the trade's insider questions) at the shop with the
  day's cash going to the operator (high). Someone else runs it but was not on the call → a medium `who_runs` flag. No
  flag → "owner and operator agree", and the BO / CO is told to consider the operator as co-applicant or guarantor
  (`genuineOperator`). Live mode only (the scripted fallback interview has no operator part). `npm run check:assisted`
  (loads the modules through Vite, since they import without extensions).
- **Findings, not questions** (2026-10-23, lead): the report never shows a question Sarthi asked, a task's wording, the
  order of topics or the applicant's quoted words — a BO who reads 100-200 reports would learn the interview and coach the
  next applicant. Every report (`REPORTER_SYSTEM`, `buildFallbackReport`, `mockReport`, the seeds in `pdHistory.json`) has
  five sections: **1. Red flags · 2. What Sarthi checked · 3. What the BO / CO must check · 4. Loan eligibility ·
  5. Recommendation**. Topics and results only ("Insider trade knowledge: 2 of 5 vague", "Surprise checks: 3 of 4 held
  up"); figures are fine, quotes are not. Citations stay — `(Turn X)` is unreadable without the transcript, which the
  report screen no longer shows (call log = system events only; liveness logs "a random action", never which). The
  validator finds the eligibility section by its heading, not its number. The DSA review (`dsa.js`) follows the same rule
  and hides "Show full conversation" for `r.sarthi` reports; the scripted SAARTHI AI handover flows are fixed and keep it.
- **Past photos** (`pastPhotos.js` + `components/sarthi/PastPhotos.jsx`, 2026-10-23): the report shows each pin on file
  through the years — Esri Wayback satellite (no key; one release per year, dated by the metadata layer's `SRC_DATE2`
  because a release can carry years-old imagery, repeats of the same photo dropped), Mapillary street photos within ~60 m
  (`VITE_MAPILLARY_TOKEN`) and Google Street View (`VITE_GOOGLE_MAPS_KEY`). Google's API gives only the latest pano, so
  older dates are a deep link to Maps. The **officer** picks "first visible in" (saved in `bo_sarthi_pastphotos_<case>`);
  `vintageCheck` compares it with `businessVintage` with `SLACK_YEARS = 1` (sparse captures), and "already in the oldest
  photo" is amber, not green — nothing older to check. Never auto-judged: from above you see a building, not the board.
  Offline → a note, no fetches. Only cases with a pin show the card (Mahesh, Imran, or a walk-in with a location).
  `npm run check:pastphotos` asserts the vintage maths.
- **Salaried applicants** (2026-10-22): the walk-in form's Self-employed | Salaried toggle sets `employment`; `isSalaried`
  (memory.js) gates schema sections by their `employment` key — `employment` (employer, role, years, CTC, bonus,
  increment, slips) and `profession_depth` replace business / trade_depth / business_deep_dive; `askSalaried` rewords
  shared fields; only the home is photographed. `profession_depth` is the one place the model writes the question:
  `PROFESSION_CHECKS` (4) questions from its own knowledge of the claimed job (an SDE gets CS questions), answers kept
  verbatim in `memory.professionAnswers` and judged by the report writer as its judgement, not a verification. Rechecks:
  in-hand × 12 vs CTC outside 45-105%, years in job > total experience. Scripted mode asks fixed job questions instead.
- **Bill book + live challenges** (2026-10-22): `billing_method` (business section) and, at the shop, a `records` photo of
  today's page. Then `planChallenges` (challenges.js) picks `CHALLENGES_PER_PD` (2) random tasks for where they are —
  old bill page at a random date, an item from a random rack + its purchase rate and supplier, the last supplier bill +
  "when, how much", the payment QR, today's opening; at home a utility bill. The point is the lead's worry: after 200-300
  PDs a BO knows every fixed question and can brief the applicant, stock the shop for the day or write up a bill book —
  random tasks with random details cannot be briefed. Each challenge photo kind has a `vision` description in
  `PHOTO_ASKS`; answers land in `memory.challengeAnswers` → a "Surprise checks: X of Y held up" count in the report, failures by subject only. Live mode only.
  `npm run check:challenges`.
- **Surprise checks, hardened** (2026-10-23, for a BO who sits with the applicant): (1) **count by risk** —
  `challengeCount` adds one each for a re-check PD, the officer present (a CallSetup tick, also a low `officer_present`
  flag and the report's mode line), a repeat PD, and a high flag / two refusals so far; cap `MAX_CHALLENGES` (4), the
  reasons go to the report as `challengeWhy`. (2) A time limit was built and removed (lead, 2026-10-23). (3) **answers
  checked in code** (`checkChallenge`) — shelf item MRP vs purchase rate against the trade's margin, the last supplier bill against
  their earlier last-delivery and monthly-purchase figures; the QR's name is already `fileNameCheck`. (4) **live turn** —
  the shelf photo's `pan`: the camera stays open after the shot and they turn it to the shop door; `PhotoCapture` keeps the
  second frame (`panDataUrl`, never sent to a model) and compares 32x24 grey thumbnails (`PAN_MOVED`); a still view or a
  switched camera is a provenance flag. (5) **follow-ups on the object** — which bill on that page, whose name on the QR /
  paper / gas book, the neighbour's shop; `check: 'names'` compares the answer with the names the photo's vision read.
  (6) **keep adding** — each task has an `added` date; `check:challenges` warns after `STALE_DAYS` (90) with nothing new.
  Added now: `street_view` (shop), `gas_book`, `home_landmark` (home, which had one task, so it was always the same).
- **Same place, different applicant** (`crossPd.js`, 2026-10-22): live photos are never byte-identical, so a BO staging
  several PDs in one shop is found by place, not pixels. Every photo now stores its GPS fix, and the vision prompts end
  with a `NAMES:` line (board, QR name, GSTIN, UPI — `splitNames` in photo.js; prompted vision calls get 300 tokens).
  At finish, `checkAgainstEarlierPds` links this PD to earlier ones on the device (= this BO) by GPS within `SAME_PLACE_M`
  (40 m, both fixes ≤60 m accurate) or a shared non-generic name, then shows the vision model both photos side by side
  (one stitched image — the endpoint takes one) for at most 3 links: SAME / DIFFERENT / UNSURE. Shared name or SAME →
  high `cross_pd` flag; GPS alone + DIFFERENT → low (neighbouring shops). A perceptual hash was rejected: a new angle
  breaks it. On a laptop every PD shares one GPS point, so every PD links and the vision verdict decides.
  `npm run check:crosspd`.
- **Adaptive order** (`adaptivePick` in controller.js, 2026-10-22 — lead's anti-coaching note, Control 1: "randomise
  the sequence, not the underwriting standard"). Between personal and documents (`CORE` sections) the next question is
  not the next in the list: each open field scores its schema `weight` (default 2), +3 if the last field asked `links` to
  it, +4 if an open flag sits on it or links to it, +1 for staying in the section, plus a per-PD `jitter` from
  `memory.seed`. The `anchor` (business_type; employer + designation) always goes first. Required coverage is
  unchanged; `optional` fields are asked only once an answer or flag unlocks them (`unlockLinks`, cap 6, strict 10).
  A topic change gets a "bridge to it" note. Added (A/B/C of the note): sales yesterday / last week, days and hours,
  who runs the shop, top and slow sellers, purchase frequency and last purchase, supplier backup, late udhaar,
  household withdrawals, third-party money, guarantor, the 25%-drop plan; monthly_purchase, payment mix and seasonality
  moved from walk-in-only to everyone. Rechecks: the indicative residual (sales − purchases − costs vs income, shown
  as "not verified profit"), yesterday × 26 and last week × 4.3 against the month.
- **Customer photo + face check** (`face.js`, 2026-10-22): the BO takes the customer's photo with the live camera
  (`CustomerPhotoField`: consent tick first, then `PhotoCapture` with `quiet` so Sarthi's voice stays silent) on the walk-in
  form, the Marketing "Customer" lead, or the brief's KYC tab (any customer, seeded ones too). Stored under
  `bo_sarthi_face_<case>`, shown as the avatar. On the call, `watchFace` grabs a still (`grabFrame`) while the greeting
  plays, then every `FACE_EVERY_MS` (30s) or at a new section (≥30s apart), capped at `FACE_MAX` (20) per PD
  (`VITE_SARTHI_FACE_MS` / `_MAX`); `compareFace` is on-device face recognition (see "Face check is face recognition")
  — always in the background, never awaited in a turn (latency).
  **Spoken on the call since 2026-10-26** (`faceTurn`, acted on at the next turn boundary, never mid-line): UNSURE (light,
  framing, no face) → "chehra beech mein laaiye, roshni ki taraf" and an immediate recheck, at most twice, then carry on.
  DIFFERENT once → rechecked at once; twice in a row → "kya aap khud X ji hain, ya aap kaun hain?" (presence `'face'`).
  They say yes → the PD carries on with a high `face_claimed` flag (the BO must see them in person): **the model's
  verdict only starts the question, it never ends a call** — a wrong AI match must not turn away a real applicant. They
  say no → the name flow's own steps ("bula sakte hain?" → handover, whose first answer is face-checked again, or
  `later`). Mid-call (applicant had been confirmed) `leaveForLater` keeps the draft, so "Finish last PD" resumes it.
  Someone else in frame is never said aloud: a medium `face_others` flag (prompting). Every check is in the call log;
  the report shows the mismatch frame when most checks were one (`faceSummary`) and calls it "on-device face recognition,
  not certified biometric verification". It needs no proxy, so scripted mode is face-checked too.
- **Gaps from the PD review meeting** (2026-10-22), all decided in code, the model only reads pictures:
  (1) **Dropped calls**: the PD id is fixed at mount; after every answer the interview saves a draft
  (`bo_sarthi_draft_<pd>`, plus its transcript and photos under the PD id). `useSarthiReports` turns any leftover draft into
  an incomplete PD (`takeDrafts` in repeat.js, `dropped: true`) on the next PD screen, so "Finish last PD" resumes it.
  (2) **Names vs the applicant's own file** (`fileNameCheck` / `nameFlags` in crossPd.js): names and GSTINs read off the
  board, QR, bill book, shop papers and bills are matched to the file's name, business name and name on PAN; a GSTIN to
  `brief.gstin`, else to the PAN inside it (proprietor). Someone else's name is asked about once on the call (`nameRecheck`)
  — the friend's-shop question; a `shop_document` live challenge (rent agreement / licence / Udyam / shop bill) feeds it.
  A supplier's bill is never matched. (3) **Call GPS** at start and end (`callPlace` in geo.js): a medium `call_location`
  flag only when they said shop/home and that pin is far. (4) **Liveness** (`LIVENESS` in face.js): once per PD at turn
  4-7 (seed), camera on and applicant confirmed, one random action; frames before and ~2s after go to `visionCompare` with
  YES/NO/UNSURE; identical frames = frozen feed. (5) **Stock vs shop photo**: the shop vision prompt adds a `STOCK:` JSON
  (fullness + a wide retail range); `stockCheck` flags only beyond 3× either way and asks kindly about a godown.
  (6) **Call log**: every transcript entry carries `at`; system events (GPS, photos, liveness) go to `callLog`; the report
  shows only the events (see "Findings, not questions") — the transcript stays in storage for audit. (7) **Maker-checker**: `pdOutcome` is the checker's outcome once `review` exists (`aiOutcome`
  is Sarthi's); `makeReview` refuses the officer who ran the PD, needs a reason, and the History trail shows "Awaiting
  checker" until then. (8) **Trades with no insider pack** (35 of 44, e.g. machinery, cafe): the trade_depth section asks
  `TRADE_CHECKS` (3) model-written insider questions (`professionDirective`), stored with `professionAnswers` and judged in
  BUSINESS UNDERSTANDING as the writer's judgement, not a verification.
- **Children and elders** (2026-10-23): dependents > 0 unlocks `children_count` / `elderly_count` (summed counts, never
  reconciled or drift-checked); children → how many go to school, then (only if any) class + school name and monthly fees; elders → health, on treatment, and if yes
  where and the monthly medicine cost. `familyHisaab` (recheck.js) is the household month in code — the house kharcha is
  the larger of what they said and fees + medicine, never the sum — and rechecks fees + medicine above the house kharcha
  or above 30% of income. The report's FAMILY block carries it; the writer judges the school's standard from its own
  knowledge, labelled as judgement. Live mode only — the script has no family follow-ups.
- **Living conditions** (`living.js`, 2026-10-22): at home, after the outside photo, Sarthi asks (skippably) for
  `home_inside`. Home photos use `livingPrompt`, which ends with a `LIVING:` JSON line — house kachha / semi_pucca / pucca,
  floors, vehicles, items — parsed by `splitNames`. **No scores or bands** (lead, 2026-10-22: "just write facts and what
  you think"): `livingFacts` gathers what was seen next to the bank-supported and claimed income, the assets they
  mentioned and the bureau's loans; `factLines` writes them plainly; `analyseLiving` (one LLM call at finish, skipped in
  scripted mode) writes 3-4 officer-style sentences from those facts only — a gap is a question to ask, never a verdict,
  nothing on caste, religion, people or taste. Report: "Living conditions" = the facts, then the analysis. No flags.
- **Repeat PDs** (`repeat.js`, 2026-10-22): every PD is kept — `bo_sarthi_reports` gets one entry per PD (`pdNo`, `mode`,
  `complete`, `coverage`, `collected`, `state`), and transcript / claims / evidence / photos are keyed by the PD id, never
  the case (old reports fall back to the case key). Readers that `find` by `caseId` get the latest, since entries are
  prepended. The brief lists "PDs done" and, once one exists, "New PD" asks why: **resume** (`seedResume` carries the
  answers and asked-state, minus who/where — only what is left is asked), **strict** (each non-low flag becomes a file
  question asked in new words, 12 cross-questions, 3 surprise checks), **cross** (`crossSteps` → `memory.quickPd`, the
  earlier key answers in a shuffled order, flagged first), **full**. In every mode `memory.prior` (`priorFacts`) holds the
  latest earlier answer per field; `checkContradictions` raises `repeat_pd` when `priorClash` (number >20%, years >1.5,
  enum any change; free text never) and the recheck says both answers on the call. The report opens `?pd=<id>`.
  The brief's **History** tab is the audit trail: one card per PD, its events timestamped (`pdEvents`: started — by
  whom (`by`, from `OFFICER`), which mode, after which PD; call completed / ended early with `endedBecause`, exchanges and
  minutes from `startedAt`/`endedAt`; report verdict with flags and changed answers);
  Every PD is marked with one outcome (`pdOutcome`): **Satisfactory** (GREEN and complete), **Human intervention**
  (AMBER, or any PD that ended early), **Red flags** (RED) — shown on the report stamp, the History cards and the
  customer list. The RECOMMENDATION section of a report still starts GREEN/AMBER/RED (`extractRecommendation` reads it), followed by the
  outcome label. "New PD from here" on any PD, the Sarthi AI button and the report's button all open `NewPdSheet`, whose options come
  from `pdOptions(pd)`. Mahesh Agarwal is seeded with 3 PDs (`data/sarthi/pdHistory.json`, `daysAgo` → dates) as the
  default of `useSarthiReports`; the Sarthi reset stamp was bumped so returning users get them.
- **Questions for this file** (`prep.js`): the brief screen drafts 12-15 file-specific questions with the LLM (cached in
  `bo_sarthi_hotq_<case>`), each with a `why` for the officer and a `section`; with no model, `ruleHotQuestions` builds
  them from the file's own figures (cash share, running loans, enquiries, ITR, GST threshold, deposits, purpose).
  Two buttons on the brief, no chooser: **Sarthi AI** asks them at the end of their section (`nextHot`, `memory.hotAnswers`,
  reported as "Questions prepared from the file"); **Take PD yourself** opens `/sarthi/officer/:id`, a tick-and-note sheet
  (`bo_sarthi_officer_<case>`), one question per slide; finishing opens `?done=1` — Summary | Transcript like a recorded meeting, the summary written by the LLM from the notes only (`summariseOfficerPd`, cached in `bo_sarthi_officer_sum_<case>`, else built from the notes). Walk-ins have no file, so no questions and no Take-yourself button. The same deck (`Deck` in
  SarthiOfficer.jsx) runs a DSA review by the officer (`/sarthi/officer/dsa/:id`, "Review yourself" on the DSA profile):
  `dsaOfficerQuestions` puts the branch's record under each topic so a wrong answer is challenged on the spot, and finishing
  writes the same DSA report (`writeDsaReport`) into `bo_ai_reports`. **No duplicates**: every file
  question is asked, and one that also gets a standard fact lists it in `covers` — that standard question (and its
  cross-question) is skipped, and the file question is asked where it would have been. Skipped only while the file
  question is pending: if its answer did not give the fact, the standard one is asked after all. Mahesh: 75 → ~56 turns.
- **Cross-questions** (schema `cross` on a field): the first time a field is answered, `updateMemory` queues it and
  the controller asks ONE follow-up straight away — the code picks WHEN (`cross.when`), the model phrases it from
  `cross.hint` and the area data, and must ask it open (never "Blue Line wale side?" — that hands a faker the
  answer). At most 7 per interview, only one `priority: "low"`, so location, ownership, sales, income, loans and
  the loan's end use (supplier, item, amount — never just "business ke liye") always get theirs. Answers go to `memory.crossAnswers` and the report weighs them.
- **Quick PD** (`quickPd` on a file in `borrowers.json` — only Rakesh Kushwaha, for a demo with no time): `quickAction`
  runs greeting → the listed questions → closing, and skips the schema, trade depth, cross-questions, the shop photo and
  the suggested questions. Rechecks still run first, so the calculation happens on the call: `margin_per_100` ("sau pe
  das") is parsed into `statedMarginPct`, and income above sales × that margin is shown back to them. A step with a
  `field` is extracted like any field (re-asked once if empty); one with a `key` is kept verbatim in `hotAnswers`.
- **New shop = a site visit on the call** (every interview except the quick PD): a purpose that opens a shop or
  business (`NEW_VENTURE` in probes.js — kholna, open, nayi/doosri dukaan, outlet) unlocks `venture_location`,
  `venture_rent`, `venture_sales_estimate`, `venture_competition`, `venture_setup_cost`. `ventureArea` resolves the
  place (the place alone, then with the applicant's city). Rechecks do the officer's hisaab live: rent vs the area range
  (quoted only for surveyed areas — tier ranges give a direction, not numbers), rent vs expected sales × the trade's margin,
  setup cost vs the loan. Place cross-questions (`cross.knowledge: "location"`, also on `business_location`) let the model
  use its **own** knowledge of any city's markets and sectors — the one exception to the grounding rule — but only to ask
  and to voice a doubt as a question ("mere hisaab se Sector 21 mein market nahi hai…"), never a figure, and the report
  lists such doubts as unverified. Surveyed `knownMarkets` are partial lists, so a place missing from them proves nothing.
  **The shop's area is tested in one go** (2026-09-29): the `business_location` cross-question queues `areaCheck` straight
  after it — "dukaan ke aas-paas koi bada landmark?", judged on survey data or the model's own knowledge of the city, scored
  `area_knowledge_score` — and sets `areaChecked` (the late verification section drops its area task) and `askedHyperLocal`.
  Before, the area came back three times across the call. If the location cross is skipped (cap, file question), the late task stays.
- **Applicant must be present** (live mode, seeded files): when the name given does not match the file, the code — not
  the model — asks "aap unke kya lagte hain?", then asks them to call the applicant. "Bahar hai" / anything unclear →
  "Chaliye, koi baat nahi… hum tab baat karenge", no report, back to `/sarthi`. Yes → "phone unhe de dijiye", the name is
  asked again and, if it matches, the PD carries on with the mismatch flag downgraded and annotated. Regexes and lines are
  in `idChecks.js` (`applicantComing`, `relationOf`, `presenceLines`). Built for the Rekha Devi demo, applies to every file.
  The name alone is not enough: "Raj, Rekha Devi ka beta" shares a word with the file and passed, so `speakerIsSomeoneElse`
  also reads the words ("X ka beta", "meri mummy", "mummy bahar hai") on every turn — in live and scripted mode — until
  the applicant confirms their own name; "… bahar hai" closes the call at once.
- **Identity**: the greeting asks the name openly (never "Aap Ramesh ji hain na?" — anyone can say haan). `stated_name`
  is compared with the file name in code (`nameVerdict` in `idChecks.js`: full / partial / conflict / different — `namesMatch` alone passed "Mahesh Sharma" for Mahesh Agarwal because any shared part counted). Only AFTER that open answer, a partial ("Mahesh") or clashing ("Mahesh Sharma") name gets "Aap Mahesh Agarwal ji hi hain?" from the code (`presenceLines().confirm`); yes carries on, no — or unclear twice — ends the call with no report. A different name ("Raj") goes to the relative flow below; a mismatch raises a high `identity_mismatch`
  flag and unlocks `speaker_relation` (condition `name_mismatch`). Walk-ins skip both — there is no name on file.
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
  **Guided like a real PD photo** (2026-09-29): `PhotoCapture` shows the kind's `tips` first (framing, what must be
  visible, where to stand, light), a framing guide and a live hint while aiming, then a review. `checkQuality` (photo.js)
  measures a 160px greyscale copy in code — dark, blown out, backlit (centre much darker than a bright edge), flat (lens
  covered), blurred (mean |Laplacian|); bad light suppresses "flat". A failing shot offers only "Dobara lijiye"; from the
  2nd try "Phir bhi bhejiye" appears too, so bad light never strands a PD, and that photo carries a low `photo_provenance`
  flag with the tries. `QUALITY_LIMITS` are calibration knobs — tuned on synthetic frames only, retune on real phones.
- **Where it lives**: the Clients tab (`/dsas`) has a DSA | Customers toggle; Customers (`/dsas?tab=customers`, `screens/dsa/CustomerList.jsx`) is Sarthi's PD queue in the DSA card layout. `/sarthi` redirects there, so every "back to the queue" link still works.
- **DSA review** (`/sarthi/dsa/:id`, `services/sarthi/dsa.js`, the Sarthi AI button on a DSA): the same video call, Claude only (`provider: 'llm'`). `DSA_TOPICS` (20, identity → sourcing → file quality → numbers → working with us → plan → conduct) are walked in order; a vague answer gets one follow-up (`needsProbe`); `rechecksFor` compares stated files/month, share given to us, approval %, main product, pending commission, the 3-month forecast and named customers against `dsaFile()` (monthly, productMix, commissionFor, loan files) and queues a FRIENDLY RECHECK. Stuck files are named on the rejections topic. The report (Sonnet via thinkingBudget, ~35s, else `fallbackDsaReport`) is saved to `bo_ai_reports` and shown on `/ai/reports/:id`. If Claude is unreachable a turn says the topic's plain `ask`.
  Found in live runs (2026-09-28, a second Haiku playing honest / inflating / pushy DSAs): (1) the DSA file is **not** in the interviewer prompt — with it Haiku read figures out unprompted; a recheck directive carries the only two numbers it may say. (2) THIS TURN is repeated at the end of the DSA's last message (`turnMessages`) — from the system prompt alone a pushy DSA pulled it off topic (asking for their phone number, saying goodbye mid-review). (3) The goodbye is fixed text (`closingLine`); asked to close, the model kept adding a question. (4) Figures come from `figureFrom`: Haiku picks which number answers, and code accepts it only if the DSA said it (or it in thousands/lakhs) — the parser alone read "ek-do NBFC" as 1 file and "sau mein se assi" as 100, and each became a false recheck. (5) `LEAVING` matches a goodbye to the call only; "questions band karo" had hung up on a complaint.
  (6) Every topic carries a Devanagari `speech`; a reply with no Devanagari speech fence gets one `toDevanagari` call, else the
  topic's own line — Roman Hinglish fed to the Hindi voice was the "English accent after the first line". (7) The name is
  checked in code like the PD (`nameVerdict` on `nameOnly`, firm words stripped): partial → "aap X ji hi hain?", someone
  else → "aap unke kya lagte hain, X ji kahan hain?" → call them → handover, or a goodbye with no report. Firm and office
  are rechecked against the record (`rechecksFor` name / office).
  (9) **What a reply means is read by the model, not by patterns** (`services/sarthi/intent.js`, both interviews): each
  answer gets a tiny Claude call (`readIntent`, 60 tokens, 2.5s budget `VITE_SARTHI_INTENT_MS`, run alongside the figure
  read / residence check — and, in the PD, alongside `extractFacts`: awaited one after the other they cost ~5s a turn) → answered | vague | refused | stop | question | upset | someone_else. The CODE decides what to
  do: stop → leave kindly (no report before identity is confirmed, report after); question / upset → the next turn first
  answers it (DSA: a `reply` turn, then the same question again; PD: `replyPrefix` in front of THIS TURN), twice at most
  per question; refused → asked softer once, then accepted, noted as a flag and (PD) the field given up; vague → one
  follow-up; someone_else → the presence flow. The regexes in intent.js are only `guessIntent`, the fallback when the model
  is late or down — do not grow them per phrase; that is the design this replaced. A turn the model cannot phrase says
  `fallbackLine(action)` and the DSA call shows "AI not reachable" (`aiDown`, reason in its title).
  (8) **What the branch knows** beyond its files is `src/data/sarthi/dsaIntel.json` (years in trade, sub-agents seen on
  their code, other lenders, customer fee complaints, a code another lender closed, financials prepared on their side) —
  `file.intel`, kept out of `dsas.json` so the AppState seed is untouched. `intelRechecks` challenges every denial against
  it; `deepFor` asks the officer's second question in code (sub-agent names + which of our files, fee amount + receipt,
  who prepares statements/ITR, which lender closed the code, where online leads come from), `deepRechecks` checks that
  answer, and admissions become report `flags`. Every wrong answer is challenged: the DSA recheck queue has no cap, and
  the PD's `MAX_RECHECKS` is 20 (a runaway guard, one per field) — at 7 the eighth mismatch went unasked.
- Sarthi state is `bo_sarthi_*` in localStorage (cleared on logout like every `bo_` key); it is not part of
  the AppState seed/date-shift system.
