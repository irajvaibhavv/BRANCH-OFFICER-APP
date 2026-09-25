// Carried-over work for today: missed visits, flagged follow-ups, due meeting to-dos.
import { toISODate } from './formatters';

const DUE_NOW = ['today', 'tomorrow', 'yesterday', 'overdue'];
const isDueNow = (due = '') => DUE_NOW.some((w) => due.toLowerCase().includes(w));

export function pendingItems({ visits, recordings, dsas, today = toISODate(), doneTodos = {}, limit = 4 }) {
  const out = [];
  const y = new Date(today); y.setDate(y.getDate() - 1);
  const yesterday = toISODate(y);
  const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7);
  const since = toISODate(weekAgo);
  const dayLabel = (d) => (d === yesterday ? 'yesterday' : new Date(d).toLocaleDateString('en-IN', { weekday: 'short' }));

  // 1. Missed / never-completed planned visits from the last week — reschedule
  visits
    .filter((v) => v.date < today && v.date >= since && (v.status === 'missed' || v.status === 'upcoming'))
    .sort((a, b) => b.date.localeCompare(a.date))
    .forEach((v) => out.push({ key: `miss-${v.id}`, kind: 'missed', dsaId: v.dsaId, text: `Visit missed ${dayLabel(v.date)}`, sub: 'Not logged — reschedule or drop', to: `/plan?picks=${v.dsaId}` }));

  // 2. Follow-ups flagged on recent visits, unless a later visit to that DSA already happened
  visits
    .filter((v) => v.status === 'completed' && v.outcome === 'need follow-up' && v.date < today && v.date >= since)
    .filter((v) => !visits.some((w) => w.dsaId === v.dsaId && w.status === 'completed' && w.date > v.date))
    .sort((a, b) => b.date.localeCompare(a.date))
    .forEach((v) => out.push({ key: `fu-${v.id}`, kind: 'followup', dsaId: v.dsaId, text: `Follow-up flagged ${dayLabel(v.date)}`, sub: v.notes, to: `/dsas/${v.dsaId}` }));

  // 3. Your to-dos from recorded meetings that are due about now — tickable from home
  recordings.forEach((r) => {
    const dsa = dsas.find((d) => d.id === r.dsaId);
    const done = doneTodos[r.id] ?? [];
    (r.summary?.actions ?? []).forEach((a, i) => {
      if (a.owner === 'You' && !done.includes(i) && isDueNow(a.due)) {
        out.push({ key: `todo-${r.id}-${i}`, kind: 'todo', dsaId: r.dsaId, recId: r.id, index: i, text: a.text, sub: `${dsa?.name.split(' ')[0] ?? 'DSA'} · due ${a.due.toLowerCase()}`, to: `/recordings/${r.id}` });
      }
    });
  });

  return { items: out.slice(0, limit), total: out.length };
}
