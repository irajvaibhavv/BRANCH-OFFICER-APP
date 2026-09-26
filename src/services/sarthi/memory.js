// Interview state (collected facts, flags, transcript). Kept out of the model's context window.
import pdSchema from '../../data/sarthi/pdSchema.json';
import { namesMatch } from './idChecks';
import { purposeSignals, judgeAnswer } from './probes';

export const FIELD_KEYS = pdSchema.sections.flatMap((s) => (s.fields ?? []).map((f) => f.key));

export const FIELD_DEFS = Object.fromEntries(
  pdSchema.sections.flatMap((s) => (s.fields ?? []).map((f) => [f.key, { ...f, section: s.id }])),
);

export const SCORE_KEYS = ['area_knowledge_score', 'business_domain_score'];

export const EXTRACTABLE_KEYS = [...FIELD_KEYS, ...SCORE_KEYS];

// "key (a|b)" for every key, so the prompts can never drift from the schema.
export const KEY_GUIDE = EXTRACTABLE_KEYS
  .map((k) => (FIELD_DEFS[k]?.options ? `${k} (${FIELD_DEFS[k].options.join('|')})` : k))
  .join(', ');

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
    tradeAnswers: [], // insider trade questions, answered verbatim — see probes.js
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

// Schema conditions are parsed from two literal shapes, never evaluated: "key === 'value'" and "key > n".
function conditionMet(field, memory) {
  if (!field.condition) return true;
  const eq = /^(\w+) === '(\w+)'$/.exec(field.condition);
  if (eq) return memory.collected[eq[1]] === eq[2];
  const gt = /^(\w+) > (\d+)$/.exec(field.condition);
  if (gt) return Number(memory.collected[gt[1]]) > Number(gt[2]);
  if (field.condition === 'no_borrower_brief') return !memory.caseData?.brief?.avgMonthlyCredit;
  if (field.condition === 'has_borrower_brief') return !!memory.caseData?.brief?.avgMonthlyCredit;
  if (field.condition.startsWith('purpose_') || field.condition === 'amount_stretch') {
    const p = purposeSignals(memory.collected, memory.caseData);
    if (field.condition === 'purpose_new_venture') return p.newVenture;
    if (field.condition === 'purpose_needs_probe') return p.newVenture || p.personal;
    if (field.condition === 'amount_stretch') return p.stretch;
  }
  if (field.condition === 'name_mismatch') return !memory.caseData?.isNew && namesMatch(memory.collected.stated_name, memory.caseData?.name) === false;
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

// The borrower's own words are the answer — nothing to extract, and nothing for a model to smooth over.
export function recordTradeAnswer(memory, probe, text, turn) {
  if (!probe || (memory.tradeAnswers ?? []).some((a) => a.key === probe.key)) return memory;
  const entry = {
    key: probe.key, parent: probe.parent ?? null, q: probe.ask, answer: text, turn,
    status: judgeAnswer(probe, text), expect: probe.expect, redFlag: probe.redFlag,
  };
  return { ...memory, tradeAnswers: [...(memory.tradeAnswers ?? []), entry] };
}

export function recordVerification(memory, kind, record) {
  const key = kind === 'area' ? 'area' : 'business';
  return { ...memory, verification: { ...memory.verification, [key]: [...memory.verification[key], record] } };
}
