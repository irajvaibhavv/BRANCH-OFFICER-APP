import CHECKLIST from '../data/opsChecklist.json';
import { toISODate } from './formatters';

// The document list belongs to operations (opsChecklist.json); a file only records what ops has received (`opsReceived`).
const DAY = 86400000;
const addDays = (iso, n) => { const d = new Date(iso); d.setDate(d.getDate() + n); return toISODate(d); };
export const hasOpsDocs = (f) => f.status === 'otc_pdd' || f.status === 'disbursed';

/** One row per checklist document: received, pending (not yet due) or overdue, with its due date. */
export function opsChecklist(f, today = toISODate()) {
  const base = f.timeline.find(([, s]) => s === 'otc_pdd')?.[0] ?? f.updatedAt;
  return (CHECKLIST.products[f.product] ?? []).map(({ doc, type, dueDays }) => {
    const due = addDays(base, dueDays);
    const received = f.opsReceived?.[doc] ?? null;
    const late = Math.floor((new Date(today) - new Date(due)) / DAY);
    return { doc, type, due, received, status: received ? 'received' : late > 0 ? 'overdue' : 'pending', overdueDays: received ? 0 : Math.max(0, late) };
  });
}
