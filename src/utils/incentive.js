// The BO's incentive: paid on the month's total disbursement only (data/incentivePlan.json), and the reverse —
// how much disbursement a wanted incentive takes, broken into steps from the BO's own files.
import PLAN from '../data/incentivePlan.json';
import { isOpen, stageLabel } from './fileStages';
import { hasOpsDocs, opsChecklist } from './opsDocs';

export { PLAN };

/** The slab a month's disbursement reaches, or null below the minimum. */
export const slabFor = (disbursed, plan = PLAN) => (disbursed < plan.minDisbursement ? null : plan.slabs.findLast((s) => disbursed >= s.from));

/** Incentive for a month's disbursement: the whole amount at the slab it reaches. */
export const incentiveFor = (disbursed, plan = PLAN) => {
  const s = slabFor(disbursed, plan);
  return s ? Math.round((disbursed * s.rate) / 100) : 0;
};

/** The least disbursement that pays at least `target`, rounded up to Rs 10,000. */
export function disbursementFor(target, plan = PLAN) {
  if (!(target > 0)) return 0;
  const { slabs } = plan;
  for (let i = 0; i < slabs.length; i += 1) {
    const need = Math.max(slabs[i].from, Math.ceil((target * 100) / slabs[i].rate / 10000) * 10000);
    if (need < (slabs[i + 1]?.from ?? Infinity)) return need;
  }
  return null;
}

const disbursedOn = (f) => f.timeline?.find(([, s]) => s === 'disbursed')?.[0] ?? f.updatedAt;

// Mon–Sat from today to month end, today included.
function workDaysLeft(today) {
  const d = new Date(today);
  const month = d.getMonth();
  let n = 0;
  for (; d.getMonth() === month; d.setDate(d.getDate() + 1)) if (d.getDay() !== 0) n += 1;
  return n;
}

/** What the wanted incentive takes this month, from the BO's own files: done, in the pipeline, still to log in. */
export function incentiveRoadmap(target, files, today, plan = PLAN) {
  const month = today.slice(0, 7);
  const disbursed = files.filter((f) => f.status === 'disbursed');
  const done = disbursed.filter((f) => String(disbursedOn(f)).startsWith(month)).reduce((s, f) => s + f.amount, 0);
  const need = disbursementFor(target, plan);
  const open = files.filter((f) => isOpen(f.status)).map((f) => ({ id: f.id, borrower: f.borrower, amount: f.amount, stage: stageLabel(f.status), status: f.status }));
  const near = open.filter((f) => plan.closeToDisbursal.includes(f.status)).sort((a, b) => b.amount - a.amount);
  const early = open.filter((f) => !plan.closeToDisbursal.includes(f.status)).sort((a, b) => b.amount - a.amount);
  const sum = (l) => l.reduce((s, f) => s + f.amount, 0);
  const gap = Math.max(0, (need ?? 0) - done);
  const fresh = Math.max(0, gap - sum(near) - sum(early));
  const decided = files.filter((f) => f.status === 'disbursed' || f.status === 'rejected');
  const approval = decided.length ? disbursed.length / decided.length : 0.6;
  const avgTicket = disbursed.length ? sum(disbursed) / disbursed.length : 2000000;
  const newFiles = Math.ceil(fresh / avgTicket);
  const logins = Math.ceil(newFiles / Math.max(0.1, approval));
  const days = workDaysLeft(today);
  const held = disbursed.filter((f) => hasOpsDocs(f) && opsChecklist(f, today).some((d) => d.status === 'overdue')).map((f) => f.borrower);
  const slab = slabFor(done, plan);
  const nextSlab = plan.slabs.find((s) => s.from > done);
  // Counted in disbursements, the way a BO thinks: "one file pays me about Rs 8,000, I want 50,000 — how many?"
  const rateNow = (slab ?? plan.slabs[0]).rate;
  const rateAtNeed = slabFor(need ?? 0, plan)?.rate ?? rateNow;
  const doneFiles = disbursed.filter((f) => String(disbursedOn(f)).startsWith(month)).map((f) => ({ id: f.id, borrower: f.borrower, amount: f.amount }));
  const doneCount = doneFiles.length;
  const filesLeft = Math.ceil(gap / avgTicket);
  return {
    perFile: Math.round((avgTicket * rateNow) / 100), perFileAtNeed: Math.round((avgTicket * rateAtNeed) / 100),
    doneFiles, doneCount, filesLeft, filesTotal: doneCount + filesLeft,
    target, need, done, gap, earned: incentiveFor(done, plan), slab, rate: slabFor(need ?? 0, plan)?.rate ?? null,
    nextSlab: nextSlab && { ...nextSlab, more: nextSlab.from - done, pays: incentiveFor(nextSlab.from, plan) - incentiveFor(done, plan) },
    near, early, nearSum: sum(near), earlySum: sum(early), fresh, newFiles, logins, approval, avgTicket,
    days, weeks: Math.max(1, Math.ceil(days / 6)), held,
  };
}
