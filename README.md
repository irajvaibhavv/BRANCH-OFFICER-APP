# BO Connect — Branch Officer Mobile App (Prototype)

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

1. **Login** — any 10-digit number starting 6–9 → OTP `1234` → set a 4-digit PIN → onboarding.
2. Next reload opens the **PIN screen** (fingerprint icon = instant login; "Login with OTP instead" resets).
3. **Home** — target ring, quick stats, today's schedule, incentive nudge, FAB → Log Visit / Add DSA / Record Meeting / Report.
4. **DSAs** — search, filter chips, tap stars to rate, long-press to select 2–3 and **Compare**, `+` to add a DSA (4-step form + confetti).
5. **Route** — tick stops, *Plan route* → map preview, ordered stops, *Reorder*, *Start navigation*.
6. **Log visit** — capture location, photo, voice note (simulated), rating, outcome → animated success.
7. **More** — Incentives (slab ring, celebration preview), Loan Files (funnel + timeline), Documents (reminders), Leaderboard (podium), Calendar, Reports (share/copy), Meetings (swipe to move/cancel), Help (SOS), Profile (dark mode, **Simulate offline**, reset demo data).

## Project structure

```
src/
  main.jsx                 Entry point — mounts <App/> and loads global CSS
  app/
    App.jsx                Root: global providers → PhoneFrame → routed screens
    router.jsx             Route table + auth guards (RequireAuth, GuestOnly) + persistent tab bar
  screens/                 One folder per feature. Each has its screen(s) + a *.module.css
    auth/                  Login (OTP), PIN set/unlock
    onboarding/            First-run tutorial
    home/                  Dashboard (Plan your day, Up next, stats, alerts)
    planning/              Plan my day: DSA route (PlanDay), customers (CustomerPlan), branch (BranchPlan), RoutePlanner/RouteResult
    dsa/                   DSA directory, profile, compare, add
    visits/                Visit history, log a visit
    recorder/              AI meeting recorder + summaries
    ai/                    SMFG AI — handover voice interviews + reports
    scheduler/ calendar/   Meetings and calendar
    documents/             Loan file tracker, document checklist
    incentive/ leaderboard/ reports/ notifications/ help/ profile/ more/
  components/
    ui/                    Reusable primitives: Button, Card, Badge, Avatar, Input, BottomSheet, Toast, EmptyState, …
    layout/                App chrome: PhoneFrame, TopBar, BottomTabBar, Page (transitions), OfflineBanner
    charts/                ProgressRing, BarChart, MiniMetric
  context/                 Global state via React context
    AppStateContext.jsx    The in-memory "database": DSAs, visits, loan files, day plan, notifications (+ demo seeding)
    AuthContext.jsx        Session, PIN, logout (wipes all bo_* localStorage keys)
    OfflineContext.jsx     Offline simulation + sync queue
    ThemeContext.jsx       Light/dark
  hooks/                   useLocalStorage, useToast, useGeolocation, useOfflineDetect
  utils/                   Pure logic, no React: formatters, loanCalc (EMI/eligibility), smfgAI (interview flows), voice (TTS/STT), meetingAI, meetingPrep, commission
  data/mock/               Seed JSON (dsas, customers, visits, loanFiles, …). Dates are shifted to "today" on load
  styles/                  variables.css (design tokens), global.css, animations.css
```

Conventions
- Persistence: everything goes through `useLocalStorage(key, initial)`; keys are prefixed `bo_` so logout can reset the demo.
- Screens never import each other's CSS; shared styles live in `styles/` or as `ui/` components.
- New screen = add a folder under `screens/`, register the path in `app/router.jsx`, and (if it belongs to a tab) map it in `components/layout/BottomTabBar.jsx`.

Offline mode: toggle *Simulate offline* in Profile. Actions taken while offline are queued (`bo_sync_queue`) and "synced" when back online. See `context/OfflineContext.jsx` for where a service worker + IndexedDB would replace this in production.
