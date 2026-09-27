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

export function createEmptyMemory(caseData, { hot = [] } = {}) {
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
    crossQueue: [], // fields just answered that earn one cross-question (schema "cross")
    crossAsked: [],
    crossAnswers: [],
    askCount: {}, // times the controller has asked each field — see MAX_ASKS
    recheckQueue: [], // figures that disagree, to be shown to them and asked again — see recheck.js
    recheckAsked: [],
    rechecks: [],
    hot, // questions prepared from the file before the call — see prep.js
    hotAsked: [],
    hotAnswers: [],
    shopPhotoAsked: false,
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
// Whether the value just given earns its field's cross-question.
function crossDue(def, value) {
  const when = def?.cross?.when;
  if (!def?.cross) return false;
  if (!when) return true;
  if (when.is !== undefined) return value === when.is;
  if (when.isNot !== undefined) return String(value).toLowerCase() !== String(when.isNot);
  if (when.above !== undefined) return Number(value) > when.above;
  return true;
}

export function updateMemory(memory, facts = {}) {
  const collected = { ...memory.collected };
  let incomeMentions = memory.income_mentions;
  const queue = [...(memory.crossQueue ?? [])];

  Object.entries(facts).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') return;
    if (!(key in collected)) return;
    // First time a field is answered, it may earn one cross-question — never on a correction.
    if (collected[key] == null && crossDue(FIELD_DEFS[key], value)
      && !queue.includes(key) && !(memory.crossAsked ?? []).includes(key)) queue.push(key);
    collected[key] = value;
  });

  // One answer, two keys: a seeded file asks stated_name and a walk-in applicant_name, but the extractor files the
  // greeting's name under either. Unmirrored, a walk-in's applicant_name stayed empty and the controller asked for it
  // every turn while the model ignored it.
  for (const [from, to] of [['stated_name', 'applicant_name'], ['applicant_name', 'stated_name']]) {
    if (collected[to] == null && collected[from] != null) collected[to] = collected[from];
  }

  if (facts.monthly_income != null && facts.monthly_income !== '') {
    incomeMentions = [
      ...memory.income_mentions,
      { turn: memory.turnCount, value: facts.monthly_income, verbatim: facts._verbatim ?? '' },
    ];
  }

  return { ...memory, collected, income_mentions: incomeMentions, crossQueue: queue };
}

/**
 * Facts an answer may write. A field already filled is only overwritten by an answer to ITS question: in live runs a
 * trade question's "30-40 litre doodh" replaced a monthly purchase of 1.5 lakh with 180, "is mahine abhi tak 70 hazaar"
 * (a cross-question) replaced monthly sales, and a hoped-for future income became a coaching flag. Income is also
 * taken on the income recheck, which exists to hear it a second time.
 */
export function acceptedFacts(memory, facts = {}, action = null) {
  const asked = new Set(action?.missingFields ?? []);
  if (action?.section === 'income_recheck') asked.add('monthly_income');
  return Object.fromEntries(Object.entries(facts).filter(([k]) => k.startsWith('_') || asked.has(k)
    || (memory.collected[k] == null && !ASKED_ONLY.has(k))));
}

// Income and sales drive eligibility and most flags, so they are taken only from their own question: a son's salary,
// given when asked about other earners, once became the applicant's income and the real figure was then refused.
const ASKED_ONLY = new Set(['monthly_income', 'monthly_sales']);

export function recordHotAnswer(memory, hot, text, turn) {
  return { ...memory, hotAnswers: [...(memory.hotAnswers ?? []), { id: hot.id, q: hot.q, why: hot.why, answer: text, turn }] };
}

export function recordCrossAnswer(memory, key, question, text, turn) {
  return { ...memory, crossAnswers: [...(memory.crossAnswers ?? []), { field: key, value: memory.collected[key], asked: question, answer: text, turn }] };
}

export function addFlag(memory, flag) {
  return { ...memory, flags: [...memory.flags, flag] };
}

// A hisaab check is recomputed every turn; its latest result replaces the last one rather than stacking beside it.
export function addFlags(memory, flags = []) {
  if (!flags.length) return memory;
  const recomputed = new Set(flags.filter((f) => f.type === 'trade_math').map((f) => f.field));
  const kept = memory.flags.filter((f) => !(f.type === 'trade_math' && recomputed.has(f.field)));
  return { ...memory, flags: [...kept, ...flags] };
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

// Asked this many times and still empty, a field is left for the officer. Without a cap one unextractable answer
// ("2-2.5 lakh") pinned the controller to that field for 20 turns while the model improvised around it.
export const MAX_ASKS = 2;
export const gaveUp = (memory, key) => (memory.askCount?.[key] ?? 0) >= MAX_ASKS;

// Standard fields a question prepared from the file asks instead (prep.js `covers`). Skipped only while that question
// is still to come: if its answer did not give the fact after all (income, say), the standard question is asked.
export const coveredByHot = (memory) => {
  const asked = new Set(memory.hotAsked ?? []);
  return new Set((memory.hot ?? []).filter((h) => !asked.has(h.id)).flatMap((h) => h.covers ?? []));
};

export function getMissingFields(memory, section) {
  if (!section?.fields) return [];
  const covered = coveredByHot(memory);
  return section.fields.filter((f) => memory.collected[f.key] == null && !covered.has(f.key) && !gaveUp(memory, f.key) && conditionMet(f, memory));
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
