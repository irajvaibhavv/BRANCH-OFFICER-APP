// Repeat PDs. Every PD is kept (bo_sarthi_reports, one entry each); a new one starts in a mode the BO / CO picks, and
// every answer is compared with what the same person said in earlier PDs — a changed answer is shown to them on the call.
import { FIELD_DEFS, isSalaried } from './memory';
import { toNumber, toYears } from './verifier';

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

export function pdOutcome(pd) {
  const key = pd?.recommendation === 'red' ? 'red' : pd?.recommendation === 'green' && pd.complete !== false ? 'satisfactory' : 'human';
  return { key, ...OUTCOMES[key] };
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
      tone: pdOutcome(pd).tone,
      title: `Marked: ${pdOutcome(pd).label}`,
      text: [flagged.length ? `${flagged.length} flagged` : 'No flags', changed ? `${changed} answer${changed > 1 ? 's' : ''} changed since an earlier PD` : null].filter(Boolean).join(' · '),
      flags: flagged.map((f) => f.detail),
    },
  ];
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
