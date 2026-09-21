# BO Connect — Branch Officer Mobile App (Prototype)

React + Vite prototype of a field productivity app for NBFC Branch Officers who manage DSA relationships.
All data is dummy JSON persisted in `localStorage`; there is no backend.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
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

## Structure

```
src/
  components/common      Button, Card, Badge, Avatar, Toast, BottomSheet, Skeleton, EmptyState, FAB, Input, StarRating, SuccessCheck
  components/navigation  PhoneFrame, BottomTabBar, TopBar, BackButton, OfflineBanner, Page (transitions)
  components/charts      ProgressRing, BarChart, MiniMetric/ProgressBar
  screens/*              one folder per feature (auth, home, dsa, route, visits, incentive, documents, ...)
  context/               Theme, Auth, Offline (sync queue), AppState (the in-memory "database")
  data/                  dummy JSON
  hooks/ utils/ styles/  helpers, design tokens (variables.css), global + animation CSS
```

Offline mode: toggle *Simulate offline* in Profile. Actions taken while offline are queued (`bo_sync_queue`) and "synced" when back online. See `context/OfflineContext.jsx` for where a service worker + IndexedDB would replace this in production.
