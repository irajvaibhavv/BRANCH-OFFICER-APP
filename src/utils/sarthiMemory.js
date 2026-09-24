/*
  SARTHI — structured PD memory.

  This is Sarthi's own brain, and deliberately NOT the model's context window. Every fact the
  borrower states is pulled out into a flat `collected` object that lives here for the whole
  interview. The model is only ever shown the last few turns plus whatever the controller decides
  is relevant, so the interview does not degrade as it gets longer and does not depend on how big
  a context the model happens to have.

  Nothing in this file calls a model. It is state management and nothing else.
*/
import pdSchema from '../data/sarthi/pdSchema.json';

/** Every field key the schema knows about, in section order. */
export const FIELD_KEYS = pdSchema.sections.flatMap((s) => (s.fields ?? []).map((f) => f.key));

/** Field definitions by key, so a caller can ask what type/label a key has. */
export const FIELD_DEFS = Object.fromEntries(
  pdSchema.sections.flatMap((s) => (s.fields ?? []).map((f) => [f.key, { ...f, section: s.id }])),
);

/** The verification/coaching scores the controller tracks alongside the schema fields. */
const SCORE_KEYS = ['area_knowledge_score', 'business_domain_score'];

export function createEmptyMemory(caseData) {
  const collected = {};
  FIELD_KEYS.forEach((k) => { collected[k] = null; });
  SCORE_KEYS.forEach((k) => { collected[k] = null; });

  return {
    brief: caseData?.brief ?? null,
    caseData: caseData ?? null,
    collected,
    flags: [],
    /* Every time an income figure is stated, so the same question asked twice in different
       words can be compared. Two different answers is the coaching tell. */
    income_mentions: [],
    verification: { area: [], business: [] },
    transcript: [],
    currentSection: 'greeting',
    sectionStartTurn: { greeting: 0 },
    turnCount: 0,
    askedHyperLocal: false,
    askedRisk: false,
    interviewComplete: false,
  };
}

/**
 * Merge extracted facts in. Only non-null values overwrite, so a later vague answer can never
 * erase a specific earlier one, and an unknown key is ignored rather than silently widening
 * the schema.
 */
export function updateMemory(memory, facts = {}) {
  const collected = { ...memory.collected };
  let incomeMentions = memory.income_mentions;

  Object.entries(facts).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') return;
    if (!(key in collected)) return;
    collected[key] = value;
  });

  // Income is the one field whose history matters as much as its current value.
  if (facts.monthly_income != null && facts.monthly_income !== '') {
    incomeMentions = [
      ...memory.income_mentions,
      { turn: memory.turnCount, value: facts.monthly_income, verbatim: facts._verbatim ?? '' },
    ];
  }

  return { ...memory, collected, income_mentions: incomeMentions };
}

export function addFlag(memory, flag) {
  return { ...memory, flags: [...memory.flags, flag] };
}

export function addFlags(memory, flags = []) {
  return flags.length ? { ...memory, flags: [...memory.flags, ...flags] } : memory;
}

/** Record one line of the conversation and advance the turn counter. */
export function recordTurn(memory, role, text) {
  const turnCount = role === 'user' ? memory.turnCount + 1 : memory.turnCount;
  return {
    ...memory,
    turnCount,
    transcript: [...memory.transcript, { turn: turnCount, role, text, at: Date.now() }],
  };
}

/** Move to a section and remember which turn it started on, for minTurns accounting. */
export function enterSection(memory, sectionId) {
  if (memory.currentSection === sectionId) return memory;
  return {
    ...memory,
    currentSection: sectionId,
    sectionStartTurn: { ...memory.sectionStartTurn, [sectionId]: memory.turnCount },
  };
}

/** Fields in this section that are still null. */
export function getMissingFields(memory, section) {
  if (!section?.fields) return [];
  return section.fields.filter((f) => {
    if (memory.collected[f.key] != null) return false;
    // A conditional field is only missing once its condition is actually met.
    if (f.condition === "residence_type === 'rented'") return memory.collected.residence_type === 'rented';
    return true;
  });
}

/** Just the facts that have a value — what the model is shown as "what we know". */
export function knownFacts(memory) {
  return Object.fromEntries(Object.entries(memory.collected).filter(([, v]) => v != null));
}

/**
 * How much of the schema is filled, for the progress bar.
 * Only counts fields this interview will actually ask: the deep-dive section exists for walk-ins
 * only, and counting it for everyone else would pin the bar below 80% however complete the
 * interview got. Conditional fields count only once their condition holds.
 */
export function completeness(memory) {
  const newApplicant = !memory.caseData?.brief?.avgMonthlyCredit;
  const keys = FIELD_KEYS.filter((k) => {
    const def = FIELD_DEFS[k];
    if (def.section === 'business_deep_dive' && !newApplicant) return false;
    if (def.condition === "residence_type === 'rented'") return memory.collected.residence_type === 'rented';
    return true;
  });
  const filled = keys.filter((k) => memory.collected[k] != null).length;
  return { filled, total: keys.length, pct: keys.length ? Math.round((filled / keys.length) * 100) : 0 };
}

export function recordVerification(memory, kind, record) {
  const key = kind === 'area' ? 'area' : 'business';
  return { ...memory, verification: { ...memory.verification, [key]: [...memory.verification[key], record] } };
}
