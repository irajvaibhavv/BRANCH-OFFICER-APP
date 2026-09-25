// Interview state (collected facts, flags, transcript). Kept out of the model's context window.
import pdSchema from '../../data/sarthi/pdSchema.json';

export const FIELD_KEYS = pdSchema.sections.flatMap((s) => (s.fields ?? []).map((f) => f.key));

export const FIELD_DEFS = Object.fromEntries(
  pdSchema.sections.flatMap((s) => (s.fields ?? []).map((f) => [f.key, { ...f, section: s.id }])),
);

export const SCORE_KEYS = ['area_knowledge_score', 'business_domain_score'];

export const EXTRACTABLE_KEYS = [...FIELD_KEYS, ...SCORE_KEYS];

export function createEmptyMemory(caseData) {
  const collected = {};
  FIELD_KEYS.forEach((k) => { collected[k] = null; });
  SCORE_KEYS.forEach((k) => { collected[k] = null; });

  return {
    brief: caseData?.brief ?? null,
    caseData: caseData ?? null,
    collected,
    flags: [],
    income_mentions: [], // every stated income, for coaching detection
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

// Only non-null values overwrite, so a vague answer never erases an earlier specific one.
export function updateMemory(memory, facts = {}) {
  const collected = { ...memory.collected };
  let incomeMentions = memory.income_mentions;

  Object.entries(facts).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') return;
    if (!(key in collected)) return;
    collected[key] = value;
  });

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

export function recordTurn(memory, role, text) {
  const turnCount = role === 'user' ? memory.turnCount + 1 : memory.turnCount;
  return {
    ...memory,
    turnCount,
    transcript: [...memory.transcript, { turn: turnCount, role, text, at: Date.now() }],
  };
}

export function enterSection(memory, sectionId) {
  if (memory.currentSection === sectionId) return memory;
  return {
    ...memory,
    currentSection: sectionId,
    sectionStartTurn: { ...memory.sectionStartTurn, [sectionId]: memory.turnCount },
  };
}

// Schema conditions are matched literally, never evaluated.
function conditionMet(field, memory) {
  if (!field.condition) return true;
  if (field.condition === "residence_type === 'rented'") return memory.collected.residence_type === 'rented';
  if (field.condition === 'no_borrower_brief') return !memory.caseData?.brief?.avgMonthlyCredit;
  return true;
}

export function getMissingFields(memory, section) {
  if (!section?.fields) return [];
  return section.fields.filter((f) => memory.collected[f.key] == null && conditionMet(f, memory));
}

// Document numbers are typed, not spoken — speech recognition mangles them.
export function typedFieldsFor(memory, section) {
  return getMissingFields(memory, section).filter((f) => f.typed);
}

export function knownFacts(memory) {
  return Object.fromEntries(Object.entries(memory.collected).filter(([, v]) => v != null));
}

// Counts only fields this interview will actually ask.
export function completeness(memory) {
  const newApplicant = !memory.caseData?.brief?.avgMonthlyCredit;
  const keys = FIELD_KEYS.filter((k) => {
    const def = FIELD_DEFS[k];
    if (def.section === 'business_deep_dive' && !newApplicant) return false;
    return conditionMet(def, memory);
  });
  const filled = keys.filter((k) => memory.collected[k] != null).length;
  return { filled, total: keys.length, pct: keys.length ? Math.round((filled / keys.length) * 100) : 0 };
}

export function recordVerification(memory, kind, record) {
  const key = kind === 'area' ? 'area' : 'business';
  return { ...memory, verification: { ...memory.verification, [key]: [...memory.verification[key], record] } };
}
