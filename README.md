# Branch Officer App (Prototype)

React + Vite prototype of a field productivity app for NBFC Branch Officers who manage DSA relationships.
All data is dummy JSON persisted in `localStorage`; there is no backend.

## Run

```bash
npm install
npm run dev      # http://localhost:5173 (or --port 5174)
npm run build    # production bundle in dist/
```

On a desktop browser the app renders inside a phone frame. On a real phone (or DevTools device mode < 560px) it goes full-screen.

## Demo walkthrough

1. **Login** — any 10-digit number starting 6–9 → OTP `1234` → set a 4-digit PIN → home.
2. Next reload opens the **PIN screen** (fingerprint icon = instant login; "Login with OTP instead" resets).
3. **Home** — target ring, quick stats, today's schedule, incentive nudge, FAB → Log Visit / Add DSA / Record Meeting / Report.
4. **DSAs** — search, filter chips, tap stars to rate, long-press to select 2–3 and **Compare**, `+` to add a DSA (4-step form + confetti).
5. **Route** — tick stops, *Plan route* → map preview, ordered stops, *Reorder*, *Start navigation*.
6. **Log visit** — capture location, photo, voice note (simulated), rating, outcome → animated success.
7. **More** — Incentives (slab ring, celebration preview), Loan Files (funnel + timeline), Documents (reminders), Leaderboard (podium), Calendar, Reports (share/copy), Meetings (swipe to move/cancel), Help (SOS), Profile (dark mode, **Simulate offline**, reset demo data).

## Project structure

```
api/                       Vercel serverless functions (Sarthi chat + vision proxy; keys stay server-side)
scripts/
  sarthi-proxy.mjs         Local stand-in for api/ (npm run sarthi)
  prerender-voice.mjs      Pre-renders scripted Sarthi audio to public/sarthi-audio (npm run sarthi:voice)
src/
  main.jsx                 Entry point
  app/                     App.jsx (provider stack), router.jsx (routes + auth guards + tab bar)
  screens/                 One folder per feature, each with its own *.module.css
    auth/ home/ planning/ dsa/ visits/ recorder/ prompter/ scheduler/ calendar/
    documents/ incentive/ leaderboard/ reports/ notifications/ help/ profile/ more/
    assistant/             SAARTHI AI — scripted handover interviews (/ai)
    sarthi/                Sarthi AI — live PD interviews (/sarthi)
  components/
    ui/                    Primitives: Button, Card, Badge, Avatar, Input, BottomSheet, Toast, …
    layout/                PhoneFrame, TopBar, BottomTabBar, Page, OfflineBanner
    charts/                ProgressRing, BarChart, MiniMetric, RouteMap
    meeting/               MeetingPrep question list
    sarthi/                AiAvatar, VideoFeed
  context/                 AppState (the local "database"), Auth, Offline, Theme
  hooks/                   useLocalStorage, useToast, useGeolocation, useOfflineDetect, useSarthiReports
  services/                Side-effecting or simulated-AI logic, no React
    voice.js               TTS (ElevenLabs / Murf / browser) + browser STT
    weather.js
    assistant/flows.js     SAARTHI AI interview flows
    meeting/               transcript.js (meeting summaries), prep.js (meeting questions)
    sarthi/                agent, controller, memory, model, verifier, validator, script, stream, …
  utils/                   Pure helpers: formatters, loanCalc, commission, colors, greetings, pending, qualityTags
  data/
    mock/                  Seed JSON; dates shifted to "today" on load
    sarthi/                Sarthi knowledge files + PD schema + voice manifest
  styles/                  variables.css (tokens), global.css, animations.css, sarthi.css
```

Conventions
- Persistence: everything goes through `useLocalStorage(key, initial)`; keys are prefixed `bo_` so logout can reset the demo.
- Screens never import each other's CSS; shared styles live in `styles/` or as `ui/` components.
- New screen = add a folder under `screens/`, register the path in `app/router.jsx`, and (if it belongs to a tab) map it in `components/layout/BottomTabBar.jsx`.

Offline mode: toggle *Simulate offline* in Profile. Actions taken while offline are queued (`bo_sync_queue`) and "synced" when back online. See `context/OfflineContext.jsx` for where a service worker + IndexedDB would replace this in production.
