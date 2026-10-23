# Incentive — design notes

Moved out of CLAUDE.md (2026-10-23). Research behind the arena: `reports/SalesScreen and Kennect incentive design.md`.

- **Incentive = the month's total disbursement only** (lead, 2026-10-14). The grid is `src/data/incentivePlan.json`
  (minimum, retrospective slabs, which stages count as close to disbursal, the payout rules); `src/utils/incentive.js`
  computes incentive from disbursement, the reverse (`disbursementFor`), and `incentiveRoadmap` — done this month,
  near / early pipeline, new files and logins at the BO's own approval rate and average ticket, working days left, files
  whose overdue OTC/PDD holds the payout. The BO types the amount on `/rewards/target`; `/rewards/plan` shows the steps.
  The "What to do" screen (`/rewards/missions`) counts it in disbursements (`perFile`, `filesLeft`); there are no
  missions any more, and points are the store balance only. `npm run check:incentive` asserts the maths — run it after editing the grid.
  **Arena redesign** (2026-10-23, from the SalesScreen / Kennect research in `reports/`): `/rewards` is the arena — the
  four path milestones are the four slabs and the level IS the slab reached (`tierOf`: Starter → Platinum), so the game
  can never disagree with the grid; the next-slab bar shows near-disbursal files as a lighter "head start". The wallet
  (`wallet` in utils/rewards.js) shows earned / held / clawback watch — the plan holds the WHOLE payout while any
  OTC/PDD doc is overdue, so it is framed as money to lose with the fix. "You vs you" (`pace`) compares with the BO's own
  last 3 months and the branch middle, privately. **No ranked leaderboard and no volume contests**: public rank cut
  output in bottom teams in the trials, and RBI's 2026 sales-practice directions (from 1 Jan 2027) name sales
  competitions as a mis-selling driver. Quality badges (`qualityBadges`) sit beside the money. `/rewards/statement`
  explains every rupee and takes a payout query (`bo_rewards.queries`). The personal target is optional — without one
  the goal is the next slab. A file's `emiBounced` marks a bounce in the 3-EMI window; seed files have none.
