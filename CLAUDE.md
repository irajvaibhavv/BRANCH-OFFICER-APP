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

**Simulated AI** (`src/utils/`, pure JS, no React):
- `smfgAI.js` — scripted handover interview flows (nodes with `say/options/input/next/key`, keyword-based branching), producing a report for the officer.
- `meetingAI.js` — deterministic per-DSA transcript + summary generation for the meeting recorder.
- `voice.js` — TTS via ElevenLabs (`VITE_ELEVENLABS_API_KEY`) or Murf AI (`VITE_MURF_API_KEY`) when set (`.env.local`, see `.env.example`; on Vercel add it as an env var), else browser Web Speech API; STT is always browser. Lines queue and play in order; `prefetch(lines)` warms Murf before a multi-bubble turn. Everything must still work as typed text when unsupported.
- `loanCalc.js` (EMI/eligibility/FOIR), `commission.js`, `meetingPrep.js` — business logic shared across screens.

## Conventions

- One folder per feature under `src/screens/`, each with its own `*.module.css`. Screens never import another screen's CSS — shared styles go in `src/styles/` (`variables.css` holds design tokens incl. dark theme) or become a `src/components/ui/` primitive.
- Several related screens can live in one file and be exported as named exports (e.g. `MeetingRecorder.jsx` exports `RecordingDetail`, `RecordingsList`, `EngagementDetail`).
- New screen: add folder under `screens/` → register route in `app/router.jsx` → map its path in `BottomTabBar.jsx` `activeTab()`.
- Page transitions use framer-motion via `components/layout/Page.jsx` with `AnimatePresence` in the router.
