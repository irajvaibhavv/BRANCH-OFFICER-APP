// Repeat PDs. Every PD is kept (bo_sarthi_reports, one entry each); a new one starts in a mode the BO /
// CO picks, and every answer is compared with what the same person said in earlier PDs — a changed answer
// is shown to them on the call.
import { FIELD_DEFS, isSalaried } from './interviewState';
import { toNumber, toYears } from './claimVerifier';

export const MODES = {
  full: { label: 'Full PD', note: 'Every topic again; any answer that changed from an earlier PD is caught' },
  resume: { label: 'Finish last PD', note: 'Only the topics the last PD did not reach' },
  strict: { label: 'Re-check flags', note: 'Flagged points asked again in new words, more cross-questions and surprise checks' },
  cross: { label: 'Cross-question only', note: 'Key answers asked again in a new order; nothing else' },
};

/** Why another PD after `pd`, most useful first — only the reasons that apply to it. */
export function pdOptions(pd) {
  if (!pd) return [];
  const n = pd.pdNo ?? 1;
  const flagged = (pd.flags ?? []).filter((f) => f.severity !== 'low');
  return [
    pd.complete === false && { mode: 'resume', why: `PD ${n} ended at ${pd.coverage ?? 0}% — only the topics it did not reach are asked` },
    flagged.length > 0 && { mode: 'strict', why: `${flagged.length} point${flagged.length > 1 ? 's' : ''} flagged in PD ${n} — asked again in new words, with more cross-questions and surprise checks` },
    { mode: 'full', why: 'Every topic again — each answer is compared with every earlier PD' },
    { mode: 'cross', why: 'Key answers from earlier PDs asked again in a new order — any change is shown to them on the call' },
  ].filter(Boolean);
}

// Every PD ends marked as one of three outcomes. A PD that did not cover everything cannot be Satisfactory.
export const OUTCOMES = {
  satisfactory: { label: 'Satisfactory', tone: 'ok', badge: 'success', line: 'Nothing in the interview contradicts the file. Move it forward.' },
  human: { label: 'Human intervention', tone: 'warn', badge: 'warning', line: 'Parts of the story did not settle. An officer should verify the items below before it proceeds.' },
  red: { label: 'Red flags', tone: 'bad', badge: 'danger', line: 'The interview contradicted the file. Visit before this goes further.' },
};

// Maker-checker: Sarthi and the officer who ran the PD (the maker) only propose an outcome; a second
// person (the checker) agrees, changes it, or sends it back for another PD. The checker's outcome is
// final; both are kept in the trail.
export const REVIEW_DECISIONS = {
  agree: 'Agreed with Sarthi',
  change: 'Changed the outcome',
  send_back: 'Sent back for another PD',
};

/** Sarthi's own outcome — ignoring any checker. */
export function aiOutcome(pd) {
  const key = pd?.recommendation === 'red' ? 'red' : pd?.recommendation === 'green' && pd.complete !== false ? 'satisfactory' : 'human';
  return { key, ...OUTCOMES[key] };
}

/** The outcome that stands: the checker's when the PD has been checked, else Sarthi's. A PD sent back needs a human. */
export function pdOutcome(pd) {
  const r = pd?.review;
  const key = !r ? aiOutcome(pd).key : r.decision === 'send_back' ? 'human' : r.outcome ?? aiOutcome(pd).key;
  return { key, ...OUTCOMES[key], checked: !!r };
}

/** A checker's decision, or the reason it is refused: maker and checker must be two different people. */
export function makeReview(pd, { name, role, decision, outcome, note }) {
  const who = String(name ?? '').trim();
  if (!who) return { error: "Enter the checker's name" };
  if (who.toLowerCase() === String(pd.by?.name ?? '').trim().toLowerCase()) {
    return { error: `${pd.by.name} ran this PD — the maker cannot check it. A second person must review it.` };
  }
  if (!REVIEW_DECISIONS[decision]) return { error: 'Pick a decision' };
  if (decision === 'change' && (!OUTCOMES[outcome] || outcome === aiOutcome(pd).key)) return { error: 'Pick the outcome you are changing it to' };
  if (String(note ?? '').trim().length < 10) return { error: 'Write a short reason (it goes in the audit trail)' };
  return { review: { by: who, role, decision, outcome: decision === 'change' ? outcome : null, note: note.trim(), at: new Date().toISOString(), ai: aiOutcome(pd).key } };
}

/**
 * The audit trail of one PD as timestamped events: who started it and why, how the call ended, what the report found.
 * `all` is every PD of the customer, to name the PD this one followed up.
 */
export function pdEvents(pd, all = []) {
  const n = pd.pdNo ?? 1;
  const after = all.find((x) => x.id === pd.from);
  const by = pd.by ? `${pd.by.name} (${pd.by.role})` : 'the branch officer';
  const flagged = (pd.flags ?? []).filter((f) => f.severity !== 'low');
  const changed = (pd.flags ?? []).filter((f) => f.type === 'repeat_pd').length;
  const start = pd.startedAt ?? pd.createdAt;
  const end = pd.endedAt ?? pd.createdAt;
  const mins = Math.max(1, Math.round((new Date(end) - new Date(start)) / 60000));
  return [
    { at: start, tone: 'info', title: `PD ${n} started`, text: `By ${by} · ${MODES[pd.mode]?.label ?? 'Full PD'}${after ? ` after PD ${after.pdNo ?? 1}` : ''}` },
    pd.complete === false
      ? { at: end, tone: 'warn', title: 'Call ended early', text: `${pd.coverage ?? 0}% of topics covered · ${pd.turns ?? 0} exchanges · ${mins} min${pd.endedBecause ? ` — ${pd.endedBecause}` : ''}` }
      : { at: end, tone: 'ok', title: 'Call completed', text: `All topics covered · ${pd.turns ?? 0} exchanges · ${mins} min` },
    {
      at: pd.createdAt,
      tone: aiOutcome(pd).tone,
      title: `Sarthi marked: ${aiOutcome(pd).label}`,
      text: [flagged.length ? `${flagged.length} flagged` : 'No flags', changed ? `${changed} answer${changed > 1 ? 's' : ''} changed since an earlier PD` : null].filter(Boolean).join(' · '),
      flags: flagged.map((f) => f.detail),
    },
    pd.confirmedBy && { at: pd.confirmedBy.at, tone: 'ok', title: `Reviewed and saved by ${pd.confirmedBy.name} (${pd.confirmedBy.role})`, text: 'Confirmed the report before it went on file' },
    pd.review
      ? {
        at: pd.review.at,
        tone: pdOutcome(pd).tone,
        title: `Checked by ${pd.review.by}${pd.review.role ? ` (${pd.review.role})` : ''}`,
        text: `${REVIEW_DECISIONS[pd.review.decision]}${pd.review.outcome ? ` — ${OUTCOMES[pd.review.ai]?.label} → ${OUTCOMES[pd.review.outcome].label}` : ''}: "${pd.review.note}"`,
      }
      : { at: null, tone: 'warn', title: 'Awaiting checker', text: 'A second person must review this PD before the file moves on' },
  ].filter(Boolean);
}

// Where they are and who is speaking change between calls, so they are never carried over or compared.
const SESSION_KEYS = new Set(['stated_name', 'applicant_name', 'speaker_relation', 'current_place', 'other_place_possible']);

/** Latest earlier answer per field, newest PD first: { field: { value, pdNo, at } }. */
export function priorFacts(past = []) {
  const out = {};
  for (const r of past) {
    for (const [k, v] of Object.entries(r.collected ?? {})) {
      if (v == null || v === '' || SESSION_KEYS.has(k) || out[k]) continue;
      out[k] = { value: v, pdNo: r.pdNo ?? 1, at: r.createdAt };
    }
  }
  return out;
}

/**
 * Has the answer changed since an earlier PD? Numbers by more than 20%, years by more than 1.5, a choice at all.
 * Free text is never compared — two wordings of one answer are not a contradiction.
 */
export function priorClash(key, before, now) {
  const type = FIELD_DEFS[key]?.type;
  if (type === 'number') {
    const a = toNumber(before);
    const b = toNumber(now);
    return a != null && b != null && Math.max(a, b) > 0 && Math.abs(a - b) / Math.max(a, b) > 0.2;
  }
  if (type === 'years') {
    const a = toYears(before);
    const b = toYears(now);
    return a != null && b != null && Math.abs(a - b) > 1.5;
  }
  if (type === 'enum') return String(before).toLowerCase() !== String(now).toLowerCase();
  return false;
}

/** Resume: the incomplete PD's answers and what it already asked, so only the rest is asked. */
export function seedResume(memory, base) {
  const collected = { ...memory.collected };
  for (const [k, v] of Object.entries(base.collected ?? {})) if (!SESSION_KEYS.has(k) && k in collected) collected[k] = v;
  const s = base.state ?? {};
  return {
    ...memory,
    collected,
    photosAsked: (base.photos ?? []).filter((p) => !p.skipped).map((p) => p.kind),
    hot: (memory.hot ?? []).filter((h) => !(s.hotAsked ?? []).includes(h.id)),
    crossAsked: s.crossAsked ?? [],
    tradeAnswers: s.tradeAnswers ?? [],
    professionAnswers: s.professionAnswers ?? [],
    challengePlanned: !!s.challengePlanned,
  };
}

/** Re-check: each flag (not low) of the earlier PD becomes a question asked in new words, before the file's own. */
export function flagQuestions(flags = [], pdNo = 1) {
  return flags.filter((f) => f.severity !== 'low').slice(0, 6).map((f, i) => ({
    id: `pd${pdNo}_flag_${i}`,
    q: `This point did not settle in their last PD — ask about it again, in different words from last time, as an open question. Never quote this note, a figure from it or any normal range: ${f.detail}`,
    why: `Flagged in PD ${pdNo}: ${f.detail}`,
    section: FIELD_DEFS[f.field]?.section ?? 'loan_purpose',
    covers: FIELD_DEFS[f.field] ? [f.field] : [],
  }));
}

// The answers a coached applicant would have rehearsed: figures, years and yes/no facts.
const CROSS_KEYS = ['monthly_income', 'monthly_sales', 'monthly_expenses', 'monthly_purchase', 'customers_per_day', 'avg_bill_value',
  'worst_month_sales', 'business_age', 'shop_ownership', 'shop_rent', 'employees', 'family_size', 'earning_members', 'residence_type',
  'residence_duration', 'monthly_rent', 'existing_emi', 'loan_amount', 'loan_purpose', 'annual_ctc', 'job_years', 'total_experience',
  'employer_name', 'designation', 'billing_method'];

/** Cross-question only: the key answers from earlier PDs, flagged ones first, the rest shuffled — never last time's order. */
export function crossSteps(prior, caseData, flagged = [], rand = Math.random) {
  const salaried = isSalaried(caseData);
  const keys = CROSS_KEYS.filter((k) => prior[k] && FIELD_DEFS[k]);
  const first = keys.filter((k) => flagged.includes(k));
  const rest = keys.filter((k) => !flagged.includes(k)).sort(() => rand() - 0.5);
  return [...first, ...rest].slice(0, 12).map((k) => ({
    field: k,
    label: FIELD_DEFS[k].label,
    ask: (salaried && FIELD_DEFS[k].askSalaried) || FIELD_DEFS[k].ask,
  }));
}

// A call that never reached finish (app closed, phone died, network gone) leaves the draft the interview
// saves after every answer. It shows as an incomplete PD awaiting confirmation; once a BO / CO saves it,
// "Finish last PD" can carry on.
export const DRAFT_PREFIX = 'bo_sarthi_draft_';

export function readDrafts() {
  const out = [];
  try {
    Object.keys(window.localStorage).filter((k) => k.startsWith(DRAFT_PREFIX)).forEach((k) => {
      const d = JSON.parse(window.localStorage.getItem(k));
      if (d?.id) out.push(droppedPd(d));
    });
  } catch { /* storage blocked — nothing to recover */ }
  return out;
}

export const removeDraft = (id) => { try { window.localStorage.removeItem(`${DRAFT_PREFIX}${id}`); } catch { /* blocked */ } };

const droppedPd = (d) => ({
  ...d,
  complete: false,
  dropped: true,
  endedAt: d.savedAt,
  createdAt: d.savedAt,
  endedBecause: 'Call dropped — the app closed, or the phone or network went, before the PD ended. Saved at the last answer.',
  recommendation: null,
  evidence: [],
  eligibility: null,
  observations: [],
  validation: null,
  report: `## PD ${d.pdNo ?? 1} — call dropped\n\nThe call ended before Sarthi could write a report. Everything up to the last answer was`
    + ` saved: ${d.coverage ?? 0}% of the topics, ${d.turns ?? 0} exchanges.\n\nStart **Finish last PD** from the customer page —`
    + ' the answers so far are carried over and only what is left is asked.',
});
