// Incentive journey — the gamified incentive. Pure helpers; state lives in hooks/useRewards.js.

import { PLAN, incentiveFor, slabFor } from './incentive';
import { hasOpsDocs, opsChecklist } from './opsDocs';

// Quick picks on the target screen; the BO can type any amount.
export const QUICK_TARGETS = [25000, 50000, 100000, 200000];
export const BASE_POINTS = 2450; // opening balance for the demo; missions add their points

// The level IS the slab reached (research, 2026-10-23: progress toward a real, reachable step is the one mechanic with
// strong evidence) — so the game and the pay grid can never disagree. Tier 0 = below the minimum.
export const TIERS = ['Starter', 'Bronze', 'Silver', 'Gold', 'Platinum'];
export const tierOf = (disbursed, plan = PLAN) => {
  const n = slabFor(disbursed, plan) ? plan.slabs.indexOf(slabFor(disbursed, plan)) + 1 : 0;
  return { n, name: TIERS[n] };
};

// Last five months' disbursement, oldest first; this month is live. Demo figures. Incentive follows from the grid.
export const PAST_DISBURSED = [5200000, 6500000, 4800000, 7200000, 6800000];
export const PAST_EARNINGS = PAST_DISBURSED.map((d) => incentiveFor(d));
// Middle officer of the branch, a month. Shown as a private reference line only — never a ranked list (research:
// public rank cut output in bottom teams; RBI's 2026 sales-practice directions name sales competitions).
export const BRANCH_MEDIAN_DISBURSED = 6000000;

/** A quarter more than the best of the last 3 months, to the next Rs 5,000 — ambitious, not out of reach. */
export const recommendedTarget = (past = PAST_EARNINGS) => Math.ceil((Math.max(...past.slice(-3)) * 1.25) / 5000) * 5000;

/** Where this month stands against the BO's own past and the branch middle, at the same point of the month. */
export function pace(done, today) {
  const d = new Date(today);
  const share = d.getDate() / new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const recent = PAST_DISBURSED.slice(-3);
  const avg = recent.reduce((s, x) => s + x, 0) / recent.length;
  return { share, own: Math.round(avg * share), best: Math.max(...recent), branch: Math.round(BRANCH_MEDIAN_DISBURSED * share), projected: share ? Math.round(done / share) : done };
}

const DAY = 86400000;
const monthsSince = (iso, today) => (new Date(today) - new Date(iso)) / (30.4 * DAY);

/**
 * The money, honestly: what this month's files earn at the slab reached, what is held (the plan holds the WHOLE payout
 * while any OTC/PDD doc is overdue — so it is shown as money to lose, with the fix), and the files still inside the
 * clawback window (first 3 EMIs). `emiBounced` on a file marks a bounce; seed files have none.
 */
export function wallet(r, files, today, plan = PLAN) {
  const rate = (r.slab?.rate ?? 0) / 100;
  const rows = r.doneFiles.map((f) => ({ ...f, pays: Math.round(f.amount * rate) }));
  const overdue = files.filter((f) => hasOpsDocs(f) && f.status === 'disbursed').flatMap((f) => opsChecklist(f, today)
    .filter((d) => d.status === 'overdue').map((d) => ({ fileId: f.id, borrower: f.borrower, doc: d.doc, days: d.overdueDays })));
  const disbursedOn = (f) => f.timeline?.find(([, s]) => s === 'disbursed')?.[0] ?? f.updatedAt;
  const watch = files.filter((f) => f.status === 'disbursed' && monthsSince(disbursedOn(f), today) < 4)
    .map((f) => ({ id: f.id, borrower: f.borrower, amount: f.amount, bounced: !!f.emiBounced, emisDue: Math.max(0, Math.min(3, Math.floor(monthsSince(disbursedOn(f), today)))) }));
  const bounced = watch.filter((w) => w.bounced);
  return {
    rows, earned: r.earned, rate: r.slab?.rate ?? null, below: r.done < plan.minDisbursement, minGap: Math.max(0, plan.minDisbursement - r.done),
    held: overdue.length ? r.earned : 0, overdue, watch, bounced,
    atRisk: bounced.reduce((s, w) => s + Math.round(w.amount * rate), 0),
  };
}

/** Badges for HOW the money was made, not how much — the counterweight to a volume-only grid. */
export function qualityBadges(w, streak) {
  return [
    { id: 'clean', icon: '🛡️', name: 'Clean book', on: w.watch.length > 0 && !w.bounced.length, how: w.bounced.length ? `${w.bounced.length} EMI bounce in the first 3 months` : `${w.watch.length} files in the 3-EMI window, none bounced` },
    { id: 'docs', icon: '📄', name: 'Docs on time', on: !w.overdue.length, how: w.overdue.length ? `${w.overdue.length} OTC/PDD doc overdue` : 'No OTC/PDD document overdue' },
    { id: 'streak', icon: '🔥', name: 'Field regular', on: streak >= 5, how: `${streak}-day visit streak (5 to earn)` },
    { id: 'slab', icon: '🎯', name: 'On the grid', on: !w.below, how: w.below ? 'Below the monthly minimum' : 'Above the monthly minimum' },
  ];
}

// Artwork in public/rewards/ was cut from the design mock; swap in hi-res files with the same names.
export const CATALOGUE = [
  { id: 'amazon500', name: 'Amazon voucher', value: '₹500', pts: 1500, cat: 'Vouchers', img: 'r_amazon' },
  { id: 'fuel500', name: 'Fuel voucher', value: '₹500', pts: 1500, cat: 'Vouchers', img: 'r_fuel' },
  { id: 'swiggy500', name: 'Swiggy voucher', value: '₹500', pts: 1500, cat: 'Vouchers', img: 'r_swiggy' },
  { id: 'earbuds', name: 'boAt Bluetooth earphones', value: 'Gadget', pts: 6000, cat: 'Gadgets', img: 'r_earbuds' },
  { id: 'speaker', name: 'JBL speaker', value: 'Gadget', pts: 8000, cat: 'Gadgets', img: 'r_speaker' },
  { id: 'leave', name: '1 day leave pass', value: 'Experience', pts: 5000, cat: 'Experiences', img: 'r_leave' },
];

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Missions are the incentive plan turned into a game: each one is a step to disbursement, read from the loan files, so
 * finishing one is real money (the lead's rule — only disbursement pays). Points are a bonus on top, for the store.
 * `cash` = the rupees the mission is worth; `pts` = paid once when it completes.
 */
export function disbursalMissions(r, files, today, visits = []) {
  const rate = (r.rate ?? r.slab?.rate ?? 0.3) / 100;
  const week = new Set(thisWeek(today).map(iso));
  const stepsToday = files.filter((f) => f.timeline?.some(([d]) => d === today)).length;
  const loggedThisWeek = files.filter((f) => f.timeline?.some(([d, s]) => s === 'submitted' && week.has(d))).length;
  const perWeek = Math.max(2, Math.ceil(r.logins / r.weeks) || 0);
  const out = [
    ...r.near.slice(0, 3).map((f) => ({ id: `disb_${f.id}`, kind: 'disburse', title: `Get ${f.borrower} disbursed`, sub: f.stage, done: 0, goal: 1, cash: Math.round(f.amount * rate), pts: 500, to: '/files' })),
    ...r.doneFiles.slice(0, 3).map((f) => ({ id: `disb_${f.id}`, kind: 'disburse', title: `${f.borrower} disbursed`, sub: 'This month', done: 1, goal: 1, cash: Math.round(f.amount * rate), pts: 500, to: '/files' })),
  ];
  if (r.nextSlab) out.push({ id: `slab_${r.nextSlab.from}`, kind: 'boss', title: `Next slab: ₹${r.nextSlab.from / 1e7 >= 1 ? `${r.nextSlab.from / 1e7} Cr` : `${r.nextSlab.from / 1e5} L`} — ${r.nextSlab.rate}% on the whole month`, sub: 'Clean files only — a bounce in the first 3 EMIs is clawed back', done: r.done, goal: r.nextSlab.from, cash: r.nextSlab.pays, pts: 1000, to: '/rewards/plan' });
  // Inputs the BO controls — they help the officers at the bottom more than any rank would (research, 2026-10-23).
  const visitsThisWeek = visits.filter((v) => v.status === 'completed' && week.has(v.date)).length;
  out.push({ id: `visits_${iso(new Date(thisWeek(today)[0]))}`, kind: 'weekly', title: 'Meet 6 DSAs or connectors this week', sub: 'Weekly · visits logged in the app', done: Math.min(visitsThisWeek, 6), goal: 6, pts: 300, to: '/visits/new' });
  out.push({ id: `logins_${iso(new Date(thisWeek(today)[0]))}`, kind: 'weekly', title: `Log in ${perWeek} new files this week`, sub: 'Weekly', done: Math.min(loggedThisWeek, perWeek), goal: perWeek, pts: 300, to: '/plan' });
  out.push({ id: `moves_${today}`, kind: 'daily', title: 'Move 2 files a stage today', sub: 'Daily · chase docs, credit queries, ops', done: Math.min(stepsToday, 2), goal: 2, pts: 200, to: '/files' });
  r.held.forEach((b) => out.push({ id: `pdd_${b}`, kind: 'unlock', title: `Clear OTC/PDD on ${b}`, sub: 'Releases your held payout', done: 0, goal: 1, pts: 300, to: '/files' }));
  // Open ones first, finished at the bottom.
  return out.map((m) => ({ ...m, complete: m.done >= m.goal })).sort((a, b) => a.complete - b.complete);
}

/** Monday-first days of the current week, ISO dates. */
export function thisWeek(today) {
  const d = new Date(today);
  const monday = new Date(d); monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => { const x = new Date(monday); x.setDate(monday.getDate() + i); return x; });
}

/** Consecutive days up to today (today counts once it has a logged visit) with at least one visit. */
export function streakDays(visitDays, today) {
  let n = 0;
  const d = new Date(today);
  if (!visitDays.has(today)) d.setDate(d.getDate() - 1);
  for (;;) {
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!visitDays.has(iso)) return n;
    n += 1; d.setDate(d.getDate() - 1);
  }
}
