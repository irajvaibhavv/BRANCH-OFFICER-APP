// Interview state (collected facts, flags, transcript). Kept out of the model's context window.
import pdSchema from '../../data/sarthi/pdSchema.json';
import { namesMatch } from './idChecks';
import { purposeSignals, judgeAnswer } from './tradeProbes';

export const FIELD_KEYS = pdSchema.sections.flatMap((s) => (s.fields ?? []).map((f) => f.key));

export const FIELD_DEFS = Object.fromEntries(
  pdSchema.sections.flatMap((s) => (s.fields ?? []).map((f) => [f.key, { ...f, section: s.id, employment: s.employment }])),
);

// A salaried applicant gets the job sections instead of the business ones (schema `employment` on a section).
export const isSalaried = (caseData) => /salaried/i.test(caseData?.employment ?? '');

// Questions on the claimed job, written by the model from its own knowledge (see controller).
export const PROFESSION_CHECKS = 4;
// The same, for a trade with no insider pack in businessKnowledge.json (see controller).
export const TRADE_CHECKS = 3;

// Optional fields are asked only once an answer or flag links to them (schema `links`), at most this many per PD
// (controller.adaptivePick). A re-check PD may open more.
export const OPTIONAL_CAP = 6;
const STRICT_OPTIONAL_CAP = 10;

/** Opens the optional fields `keys` link to, within the cap. */
export function unlockLinks(memory, keys) {
  const unlocked = [...(memory.unlocked ?? [])];
  const cap = memory.strict ? STRICT_OPTIONAL_CAP : OPTIONAL_CAP;
  for (const k of keys) {
    for (const l of FIELD_DEFS[k]?.links ?? []) {
      if (FIELD_DEFS[l]?.optional && !unlocked.includes(l) && unlocked.length < cap) unlocked.push(l);
    }
  }
  return unlocked.length === (memory.unlocked ?? []).length ? memory : { ...memory, unlocked };
}

export const SCORE_KEYS = ['area_knowledge_score', 'business_domain_score'];

export const EXTRACTABLE_KEYS = [...FIELD_KEYS, ...SCORE_KEYS];

// "key (a|b)" for every key, so the prompts can never drift from the schema.
export const KEY_GUIDE = EXTRACTABLE_KEYS
  .map((k) => (FIELD_DEFS[k]?.options ? `${k} (${FIELD_DEFS[k].options.join('|')})` : k))
  .join(', ');

export function createEmptyMemory(caseData, { hot = [], prior = {} } = {}) {
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
    tradeAnswers: [], // insider trade questions, answered verbatim — see tradeProbes.js
    professionAnswers: [], // salaried: questions on the job they claim, answered verbatim
    crossQueue: [], // fields just answered that earn one cross-question (schema "cross")
    crossAsked: [],
    crossAnswers: [],
    askCount: {}, // times the controller has asked each field — see MAX_ASKS
    recheckQueue: [], // figures that disagree, to be shown to them and asked again — see figureRechecks.js
    recheckAsked: [],
    rechecks: [],
    hot, // questions prepared from the file before the call — see hotQuestions.js
    prior, // answers from this person's earlier PDs — a changed one is a repeat_pd recheck (repeatPd.js)
    hotAsked: [],
    hotAnswers: [],
    photosAsked: [], // 'shop' / 'home' — asked by the controller, from where they are (current_place)
    unlocked: [], // optional fields an answer or a flag has linked to — see unlockLinks
    lastField: null, // the field last asked, whose links the next pick favours
    seed: Math.random(), // this PD's own tie-break, so two PDs never walk the same order
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

  // One answer, two keys: the extractor files the greeting's name under stated_name or applicant_name, so mirror it or
  // the controller keeps asking.
  for (const [from, to] of [['stated_name', 'applicant_name'], ['applicant_name', 'stated_name']]) {
    if (collected[to] == null && collected[from] != null) collected[to] = collected[from];
  }

  if (facts.monthly_income != null && facts.monthly_income !== '') {
    incomeMentions = [
      ...memory.income_mentions,
      { turn: memory.turnCount, value: facts.monthly_income, verbatim: facts._verbatim ?? '' },
    ];
  }

  const answered = Object.keys(facts).filter((k) => facts[k] != null && facts[k] !== '' && memory.collected[k] == null && k in collected);
  return unlockLinks({ ...memory, collected, income_mentions: incomeMentions, crossQueue: queue }, answered);
}

// Facts an answer may write. A filled field is only overwritten by an answer to its own question, so a side remark in
// another answer cannot replace a figure. Income is also taken on the income recheck.
export function acceptedFacts(memory, facts = {}, action = null) {
  const asked = new Set(action?.missingFields ?? []);
  if (action?.section === 'income_recheck') asked.add('monthly_income');
  // Two people, one phone: the operator's answers fill only operator fields, the applicant's never do.
  const operator = action?.section === 'operator';
  return Object.fromEntries(Object.entries(facts).filter(([k]) => k.startsWith('_')
    || (OPERATOR_KEYS.has(k) === operator && (asked.has(k) || (memory.collected[k] == null && !ASKED_ONLY.has(k))))));
}

export const OPERATOR_KEYS = new Set(pdSchema.sections.find((s) => s.id === 'operator')?.fields.map((f) => f.key) ?? []);
export const isAssisted = (memory) => !!memory.assisted || memory.collected.operator_present === 'yes';

// Income and sales drive eligibility and most flags, so they are taken only from their own question (e.g. a son's
// salary is not the applicant's income).
const ASKED_ONLY = new Set(['monthly_income', 'monthly_sales']);

export function recordHotAnswer(memory, hot, text, turn) {
  return { ...memory, hotAnswers: [...(memory.hotAnswers ?? []), { id: hot.id, q: hot.q, why: hot.why, answer: text, turn }] };
}

export function recordProfessionAnswer(memory, question, text, turn) {
  return { ...memory, professionAnswers: [...(memory.professionAnswers ?? []), { q: question, answer: text, turn }] };
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
  // A doubt opens the optional questions around it: a sales figure that does not add up opens last week's sales.
  return unlockLinks({ ...memory, flags: [...kept, ...flags] }, flags.map((f) => f.field));
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
export function conditionMet(field, memory) {
  if (field.employment && (field.employment === 'salaried') !== isSalaried(memory.caseData)) return false;
  if (field.optional && !(memory.unlocked ?? []).includes(field.key)) return false;
  if (!field.condition) return true;
  if (field.condition === 'salaried') return isSalaried(memory.caseData);
  if (field.condition === 'self_employed') return !isSalaried(memory.caseData);
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
  // Asked by the controller with the photos (getNextAction), never in the personal walk — see "photoTime".
  if (field.condition === 'place_known') return false;
  // Assisted PD: declared on CallSetup, or the applicant said the one who runs it is with them (operator_present).
  if (field.condition === 'assisted') return isAssisted(memory);
  if (field.condition === 'run_by_other') return !memory.assisted && !!memory.collected.who_runs && memory.collected.who_runs !== 'self';
  if (field.condition === 'name_mismatch') return !memory.caseData?.isNew && namesMatch(memory.collected.stated_name, memory.caseData?.name) === false;
  return true;
}

// Asked this many times and still empty, a field is left for the officer, so one unextractable
// answer cannot pin the controller.
export const MAX_ASKS = 2;
export const gaveUp = (memory, key) => (memory.askCount?.[key] ?? 0) >= MAX_ASKS;

// Standard fields a file question asks instead (hotQuestions.js `covers`). Skipped only while that question is still to
// come; if its answer did not give the fact, the standard question is asked.
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
