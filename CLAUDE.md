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
- **File lifecycle** is data: `src/data/fileStages.json` (ordered stages with `label`, `short`, `owner`), read through
  `src/utils/fileStages.js`. A file's `status` is a stage id (or `rejected`); never compare against stage names in a
  screen — use `isOpen` / `withCredit` / `stageOf`, so reordering or renaming stages touches only the JSON.
- **OTC/PDD** (DSA profile tab): the document list per product is `src/data/opsChecklist.json`, standing in for the
  operations team's admin-portal feed; a file only stores what ops received (`opsReceived`, doc → date). Due dates count
  from the file's `otc_pdd` timeline date (`src/utils/opsDocs.js`). The BO view is read-only by design — ops marks receipt.
- **Connectors** are DSA-shaped records in `dsas.json` with `channel: 'connector'` (`src/utils/channel.js`), so profile,
  visits, files and routes need no branching; screens split them only where the lead asked (Clients, Plan your day).
- **Incentive = the month's total disbursement only** (lead, 2026-10-14). Grid: `src/data/incentivePlan.json`
  (minimum, retrospective slabs, payout rules); maths in `src/utils/incentive.js`, game state in `utils/rewards.js` +
  `hooks/useRewards.js`. The level IS the slab reached; points are store currency only, never rupees. No ranked
  leaderboard and no volume contests (RBI 2026 sales-practice directions). Run `npm run check:incentive` after editing
  the grid. **Full design notes: `docs/incentive.md` — read it before changing `/rewards`.**
- **New / Existing / Lead** on Clients is derived in `src/utils/channel.js`, never stored as a label: a DSA or connector the
  BO adds gets `stage: 'lead'` (`addDsa`); otherwise `empanelled` within 180 days is new, older is existing. A customer
  added by the BO (`isNew` walk-in) is a lead, a disbursed one existing, the rest new.
- `getDsa(id)` also resolves customer ids (prefix `cust`) into a DSA-shaped object (`isCustomer: true`), so schedule/route/visit screens handle DSA and customer stops without branching.
- Mutations call `track(type, payload)`, which pushes to the offline sync queue when offline.

**Persistence rules**: all persisted state goes through `src/hooks/useLocalStorage.js` with keys prefixed `bo_`. Logout (`AuthContext`) deletes every `bo_*` key, which is how the demo resets — a key without the prefix will survive logout.

**Offline** (`src/context/OfflineContext.jsx`): `isOnline = navigator online && !bo_sim_offline` (toggle in Profile). Offline actions queue in `bo_sync_queue`; going online fakes a "Syncing… → synced" cycle. Comments there describe the intended production replacement (service worker + IndexedDB).

**Code layout**: `src/services/` holds side-effecting or simulated-AI logic (no React); `src/utils/` holds
pure helpers; `api/` is the Vercel functions; `scripts/` holds the Node dev tools (proxy, voice prerender).
Code comments are kept to one-liners on non-obvious *why* — the long-form reasoning lives in `docs/`.

**Simulated AI** (`src/services/`, pure JS, no React):
- `assistant/flows.js` — scripted SAARTHI AI handover interview flows (nodes with `say/options/input/next/key`, keyword-based branching), producing a report for the officer.
- `meeting/transcript.js` — deterministic per-DSA transcript + summary generation for the meeting recorder; `meeting/questions.js` — rule-based meeting questions.
- `voice.js` — shared TTS via ElevenLabs (`VITE_ELEVENLABS_API_KEY`) or Murf AI (`VITE_MURF_API_KEY`) when set (`.env.local`, see `.env.example`; on Vercel add it as an env var), else browser Web Speech API; STT is always browser. Lines queue and play in order; `prefetch(lines)` warms Murf before a multi-bubble turn. Everything must still work as typed text when unsupported.
- `src/utils/loanCalc.js` (EMI/eligibility/FOIR), `src/utils/commission.js` — business logic shared across screens.

**Sarthi AI** (`src/screens/sarthi/`, `src/services/sarthi/*.js`, `src/data/sarthi/*.json`) — the AI PD interview, the
one feature that calls a real model; kept separate from the scripted SAARTHI AI (`screens/assistant/`). **Read
`docs/sarthi.md` before changing anything Sarthi** — it holds every design decision and the bugs each rule fixed. The
rules that must never be broken:
- **The controller decides what to ask; the model only phrases it.** `controller.js` walks `pdSchema.json`; new
  questions = new schema fields (each with a plain-Hinglish `ask`), never prompt text. Key lists in prompts are generated
  from the schema — never hand-type keys. Each field is roughly one more turn and one more model request.
- **Grounding:** facts live only in the JSON knowledge files, verdicts in `claimVerifier.js`, every number in code
  (`loanCalc.js`, `hindiNumbers.js` — never trust a model's number), and `reportValidator.js` strips uncited findings.
- **Models:** `'llm'` = Claude (`ANTHROPIC_API_KEY`), else Gemini; fact extraction goes to Groq (`'slm'`) when
  `GROQ_API_KEY` is set (`TASK_ROUTES` in `modelRouting.js`). Keys are server-side only (`api/*.js`, `scripts/sarthi-proxy.mjs`);
  `vercel.json`'s rewrite must exclude `/api/`. Unreachable model → per-turn fallback; no proxy → scripted `scriptedMode.js`.
- **Findings, not questions:** a report (PD or DSA) never shows a question, task wording or quote — only red flags,
  what Sarthi checked and what the BO / CO must check, so BOs cannot learn the interview and coach applicants.
- **Voice:** the TTS is fed Devanagari, captions are Hinglish. Re-run `npm run sarthi:voice` after editing any scripted line.
- **State:** `bo_sarthi_*` keys, per PD id; bump `SARTHI_RESET` in `knowledge.js` when seeded applicants change.
- **Checks:** `npm run check:geo`, `check:crosspd`, `check:challenges`, `check:assisted`, `check:retention`, `check:pastphotos`, `check:face`, `check:numbers`, `check:age`; `VITE_SARTHI_MOCKS=true` (dev) runs with no API calls.

## Conventions

- One folder per feature under `src/screens/`, each with its own `*.module.css`. Screens never import another screen's CSS — shared styles go in `src/styles/` (`variables.css` holds design tokens incl. dark theme) or become a `src/components/ui/` primitive.
- Several related screens can live in one file and be exported as named exports (e.g. `MeetingRecorder.jsx` exports `RecordingDetail`, `RecordingsList`, `EngagementDetail`).
- New screen: add folder under `screens/` → register route in `app/router.jsx` → map its path in `BottomTabBar.jsx` `activeTab()`.
- Screens never import from other screens. A hook several screens share goes in `src/hooks/` (e.g. `useSarthiReports`); a shared component goes in `src/components/<area>/`.
- Files inside a feature folder drop the feature prefix (`services/sarthi/modelRouting.js`, not `sarthiModel.js`).
- Page transitions use framer-motion via `components/layout/Page.jsx` with `AnimatePresence` in the router.
