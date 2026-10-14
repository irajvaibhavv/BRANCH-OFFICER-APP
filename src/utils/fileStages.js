import STAGES from '../data/fileStages.json';
import { STATUS_COLORS } from './colors';

// The lifecycle is data (fileStages.json) so a lender can reorder or rename stages without touching screens.
export { STAGES };
const BY_ID = Object.fromEntries(STAGES.map((s) => [s.id, s]));
const REJECTED = { id: 'rejected', label: 'Rejected', short: 'Rejected', owner: 'Credit' };

export const stageOf = (id) => BY_ID[id] ?? (id === 'rejected' ? REJECTED : null);
export const stageLabel = (id) => stageOf(id)?.label ?? id;
export const stageIndex = (id) => STAGES.findIndex((s) => s.id === id);
export const nextStage = (id) => STAGES[stageIndex(id) + 1] ?? null;
export const isOpen = (id) => id !== 'rejected' && id !== 'disbursed';
/** Files the BO should chase with credit: past submission, still on the credit side. */
export const withCredit = (id) => stageOf(id)?.owner === 'Credit' && id !== 'rejected';
/** Every stage up to `id`, undated — for records that know where they are but not when each step happened. */
export const reachedUpTo = (id) => STAGES.slice(0, stageIndex(id) + 1).map((s) => [null, s.id]);
/** A Sarthi PD case sits at "Bureau Passed" until its PD report exists; a walk-in has only just applied. A seeded `stage` (a file already further along) wins. */
export const pdCaseStage = (c, hasReport) => c?.stage ?? (hasReport ? 'pd' : c?.isNew ? 'submitted' : 'bureau');
const TONE = { primary: 'var(--primary)', success: 'var(--success)', warning: 'var(--warning)', danger: 'var(--danger)' };
export const stageColor = (id) => TONE[STATUS_COLORS[id]] ?? 'var(--primary)';
