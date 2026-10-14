// Incentive journey — the gamified incentive. Pure helpers; state lives in hooks/useRewards.js.

// Quick picks on the target screen; the BO can type any amount.
export const QUICK_TARGETS = [25000, 50000, 100000, 200000];
export const LEVELS = ['Rookie', 'Achiever', 'Pro', 'Champion', 'Legend']; // level n = milestones crossed + 1
export const MILESTONE_STEPS = [0.25, 0.5, 0.75, 1];
export const BASE_POINTS = 2450; // opening balance for the demo; missions add their points

// Last five months' incentive under the disbursement grid, oldest first; this month is live. Demo figures.
export const PAST_EARNINGS = [18000, 24000, 15000, 28000, 26000];

/** A quarter more than the best of the last 3 months, to the next Rs 5,000 — ambitious, not out of reach. */
export const recommendedTarget = (past = PAST_EARNINGS) => Math.ceil((Math.max(...past.slice(-3)) * 1.25) / 5000) * 5000;

export const milestones = (target) => MILESTONE_STEPS.map((s) => Math.round(target * s));
export const crossedCount = (earned, target) => milestones(target).filter((m) => earned >= m).length;
export const levelOf = (earned, target) => {
  const n = Math.min(crossedCount(earned, target), LEVELS.length - 1);
  return { n: n + 1, name: LEVELS[n] };
};

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
export function disbursalMissions(r, files, today) {
  const rate = (r.rate ?? r.slab?.rate ?? 0.3) / 100;
  const week = new Set(thisWeek(today).map(iso));
  const stepsToday = files.filter((f) => f.timeline?.some(([d]) => d === today)).length;
  const loggedThisWeek = files.filter((f) => f.timeline?.some(([d, s]) => s === 'submitted' && week.has(d))).length;
  const perWeek = Math.max(2, Math.ceil(r.logins / r.weeks) || 0);
  const out = [
    ...r.near.slice(0, 3).map((f) => ({ id: `disb_${f.id}`, kind: 'disburse', title: `Get ${f.borrower} disbursed`, sub: f.stage, done: 0, goal: 1, cash: Math.round(f.amount * rate), pts: 500, to: '/files' })),
    ...r.doneFiles.slice(0, 3).map((f) => ({ id: `disb_${f.id}`, kind: 'disburse', title: `${f.borrower} disbursed`, sub: 'This month', done: 1, goal: 1, cash: Math.round(f.amount * rate), pts: 500, to: '/files' })),
  ];
  if (r.nextSlab) out.push({ id: `slab_${r.nextSlab.from}`, kind: 'boss', title: `Boss: cross ₹${r.nextSlab.from / 1e7 >= 1 ? `${r.nextSlab.from / 1e7} Cr` : `${r.nextSlab.from / 1e5} L`} — unlock ${r.nextSlab.rate}%`, sub: 'Lifts every rupee this month to the next slab', done: r.done, goal: r.nextSlab.from, cash: r.nextSlab.pays, pts: 1000, to: '/files' });
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
