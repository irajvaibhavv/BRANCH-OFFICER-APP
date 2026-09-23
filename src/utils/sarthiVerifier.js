/*
  SARTHI — the verifier. Plain JavaScript, no AI.

  The AI captures what the borrower said; this file decides whether it holds up. Every verdict
  (confirmed / contradicted / unverified) comes from a comparison against the Borrower Brief or
  the area data — never from a model. That is what makes a verdict impossible to hallucinate.
*/
import { emi, maxLoan, PRODUCT_RATES, FOIR } from './loanCalc';
import { lookupLocation } from './sarthiTools';
import { formatINR } from './formatters';

/* Tunable thresholds — every rule below reads from here. */
export const THRESHOLDS = {
  incomeMatchPct: 15,      // within this % of bank credits → confirmed
  incomeOverstatePct: 40,  // more than this above bank credits → contradicted
  emiTolerance: 0.9,       // declared EMI must be at least 90% of bureau EMI
  rentFloor: 0.5,          // below 50% of the area minimum → contradicted
  rentCeiling: 1.5,        // above 150% of the area maximum → contradicted
  vintageToleranceYears: 1,
  coachingDriftPct: 20,    // same question, answers differing by more → coaching flag
};

const fmt = (n) => formatINR(n, { compact: false });

/* Borrowers say numbers in words far more often than in digits — "teen lakh", "do saal". */
const WORD_NUM = {
  ek: 1, do: 2, teen: 3, tin: 3, char: 4, chaar: 4, paanch: 5, panch: 5, chhe: 6, che: 6,
  saat: 7, aath: 8, nau: 9, das: 10, gyarah: 11, barah: 12, pandrah: 15, bees: 20,
  pachees: 25, pachchees: 25, tees: 30, teess: 30,
  chalis: 40, chalees: 40, chaalis: 40, chaalees: 40,
  pachas: 50, pachaas: 50, pachchas: 50, pachhas: 50,
  saath: 60, saatth: 60, sattar: 70, assi: 80, assee: 80, nabbe: 90, nabbey: 90, sau: 100,
  solah: 16, satrah: 17, atharah: 18, unnees: 19,
  dedh: 1.5, dhai: 2.5, sava: 1.25, adha: 0.5, aadha: 0.5,
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, half: 0.5,
};

const MULTIPLIER = [
  [/^(cr|crore|crores|karod)$/, 1e7],
  [/^(l|lakh|lakhs|lac|lacs)$/, 1e5],
  [/^(k|thousand|hazar|hajar|hazaar)$/, 1e3],
];

const multiplierFor = (word) => MULTIPLIER.find(([re]) => re.test(word))?.[1] ?? null;

/**
 * "3 lakh" / "teen lakh" / "do lakh 50 hazar" / "₹1,50,000" → a number, or null if there is none.
 * Borrowers mix digits, Hindi words and units freely, so this walks the tokens and adds up each
 * "<number> <unit>" group rather than matching a single pattern.
 */
export function toNumber(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;

  const tokens = v.toLowerCase().replace(/₹/g, ' ').replace(/(\d),(?=\d)/g, '$1').split(/[^a-z0-9.]+/).filter(Boolean);
  let total = 0;
  let current = null;
  let seen = false;

  tokens.forEach((t) => {
    const mult = multiplierFor(t);
    if (mult) {
      if (current != null) { total += current * mult; current = null; seen = true; }
      return;
    }
    const n = /^\d+(\.\d+)?$/.test(t) ? parseFloat(t) : t in WORD_NUM ? WORD_NUM[t] : null;
    if (n == null) return;
    if (current != null) { total += current; } // two numbers in a row, e.g. "50 60"
    current = n;
    seen = true;
  });
  if (current != null) total += current;

  return seen ? total : null;
}

/** "1.5 years" / "8 saal" / "do saal" → 1.5 / 8 / 2 */
export function toYears(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).toLowerCase();
  const digit = s.match(/-?\d+(\.\d+)?/);
  const word = s.split(/[^a-z]+/).find((w) => w in WORD_NUM);
  const n = digit ? parseFloat(digit[0]) : word ? WORD_NUM[word] : NaN;
  if (!Number.isFinite(n)) return null;
  return /month|mahin|maheen/.test(s) ? n / 12 : n;
}

const RULES = {
  income: (claimed, { brief }) => {
    const value = toNumber(claimed);
    if (value == null) return { status: 'unverified', detail: 'No numeric income stated' };
    const base = brief.avgMonthlyCredit;
    if (!base) return { status: 'unverified', detail: 'Self-declared only — no bank statement on file to check it against', verified: 'nothing on file' };
    const diff = ((value - base) / base) * 100;
    if (Math.abs(diff) <= THRESHOLDS.incomeMatchPct) {
      return { status: 'confirmed', detail: `Within ${THRESHOLDS.incomeMatchPct}% of bank credits (${fmt(base)})`, verified: fmt(base), source: 'Brief: avgMonthlyCredit' };
    }
    if (diff > THRESHOLDS.incomeOverstatePct) {
      return { status: 'contradicted', detail: `${Math.round(diff)}% above bank credits (${fmt(base)})`, verified: fmt(base), source: 'Brief: avgMonthlyCredit' };
    }
    return { status: 'unverified', detail: `${Math.round(diff)}% difference from bank credits (${fmt(base)})`, verified: fmt(base), source: 'Brief: avgMonthlyCredit' };
  },

  turnover: (claimed, ctx) => RULES.income(claimed, ctx),

  existingEmi: (claimed, { brief }) => {
    const value = toNumber(claimed);
    if (value == null) return { status: 'unverified', detail: 'No numeric EMI stated' };
    const actual = brief.existingEMIs;
    if (actual == null) return { status: 'unverified', detail: 'No bureau record on file to check this against', verified: 'nothing on file' };
    if (actual === 0) {
      return value === 0
        ? { status: 'confirmed', detail: 'Bureau shows no running EMIs', verified: fmt(0), source: 'Brief: existingEMIs' }
        : { status: 'contradicted', detail: `Declared ${fmt(value)}, bureau shows no running EMIs`, verified: fmt(0), source: 'Brief: existingEMIs' };
    }
    if (value >= actual * THRESHOLDS.emiTolerance) {
      return { status: 'confirmed', detail: `Matches bureau EMI (${fmt(actual)})`, verified: fmt(actual), source: 'Brief: existingEMIs' };
    }
    return { status: 'contradicted', detail: `Declared ${fmt(value)}, bureau shows ${fmt(actual)}`, verified: fmt(actual), source: 'Brief: existingEMIs' };
  },

  vintage: (claimed, { brief }) => {
    const years = toYears(claimed);
    if (years == null) return { status: 'unverified', detail: 'No vintage figure stated' };
    if (!brief.gstVintage) return { status: 'unverified', detail: 'No GST data to verify' };
    const gst = toYears(brief.gstVintage);
    if (gst == null) return { status: 'unverified', detail: 'GST vintage not readable' };
    if (years <= gst + THRESHOLDS.vintageToleranceYears) {
      return { status: 'confirmed', detail: `GST registered for ${brief.gstVintage}`, verified: brief.gstVintage, source: 'Brief: gstVintage' };
    }
    return { status: 'unverified', detail: `Claims ${years} years but GST registered only ${brief.gstVintage}`, verified: brief.gstVintage, source: 'Brief: gstVintage' };
  },

  rent: (claimed, { areaData }) => {
    const value = toNumber(claimed);
    if (value == null) return { status: 'unverified', detail: 'No numeric rent stated' };
    if (!areaData?.avgShopRent) return { status: 'unverified', detail: 'No rent data for this area' };
    const { min, max } = areaData.avgShopRent;
    const range = `${fmt(min)}–${fmt(max)}`;
    if (value < min * THRESHOLDS.rentFloor) return { status: 'contradicted', detail: `Claimed ${fmt(value)}, area range is ${range}`, verified: range, source: 'Area data' };
    if (value > max * THRESHOLDS.rentCeiling) return { status: 'contradicted', detail: `Claimed ${fmt(value)}, area range is ${range}`, verified: range, source: 'Area data' };
    return { status: 'confirmed', detail: `Within expected range for area (${range})`, verified: range, source: 'Area data' };
  },
};

const LABEL = {
  income: 'Monthly income', turnover: 'Monthly turnover', existingEmi: 'Existing EMIs',
  vintage: 'Business vintage', rent: 'Shop rent', expense: 'Household expense',
  employees: 'Employees', other: 'Other',
};

/** Agent 1 uses snake/loose type names; map them onto the rule set. */
function ruleKey(claimType = '') {
  const t = claimType.toLowerCase();
  if (t.includes('income') || t.includes('salary')) return 'income';
  if (t.includes('turnover') || t.includes('sale') || t.includes('collection')) return 'turnover';
  if (t.includes('emi') || t.includes('loan')) return 'existingEmi';
  if (t.includes('vintage') || t.includes('year')) return 'vintage';
  if (t.includes('rent')) return 'rent';
  return null;
}

/**
 * Run every captured claim through the rules.
 * Returns the evidence trail plus the inconsistency / coaching flags found across claims.
 */
export function verifyClaims(claims = [], caseData) {
  const areaData = lookupLocation(caseData.areaKey);
  const ctx = { brief: caseData.brief, areaData, caseData };

  const evidence = claims.map((c, i) => {
    const key = ruleKey(c.claim_type);
    const rule = key && RULES[key];
    const out = rule
      ? rule(c.stated_value, ctx)
      : { status: 'unverified', detail: 'No verification rule for this claim type' };
    return {
      id: `claim_${i + 1}`,
      claim: LABEL[key ?? c.claim_type] ?? c.claim_type,
      claimType: key ?? c.claim_type,
      declared: String(c.stated_value ?? '—'),
      verbatim: c.verbatim ?? '',
      turn: c.turn ?? null,
      verified: out.verified ?? '—',
      status: out.status,
      noRule: !rule, // 'unverified' because we have no rule for it, not because the data disagreed
      detail: out.detail,
      source: out.source ?? `Turn ${c.turn ?? '?'}`,
    };
  });

  return { evidence, flags: findFlags(claims, evidence) };
}

/** Cross-claim checks: the same figure stated twice with different numbers is the coaching tell. */
function findFlags(claims, evidence) {
  const flags = [];

  const byType = {};
  claims.forEach((c) => {
    const key = ruleKey(c.claim_type);
    if (!key) return;
    (byType[key] ??= []).push(c);
  });

  Object.entries(byType).forEach(([key, list]) => {
    if (list.length < 2) return;
    const nums = list.map((c) => toNumber(c.stated_value)).filter((n) => n != null);
    if (nums.length < 2) return;
    const lo = Math.min(...nums);
    const hi = Math.max(...nums);
    if (lo > 0 && ((hi - lo) / lo) * 100 > THRESHOLDS.coachingDriftPct) {
      flags.push({
        type: 'inconsistency',
        label: `${LABEL[key]} stated differently across the interview`,
        detail: `${fmt(lo)} and ${fmt(hi)} given for the same question`,
        turns: list.map((c) => c.turn).filter(Boolean),
      });
    }
  });

  evidence.filter((e) => e.status === 'contradicted').forEach((e) => {
    flags.push({ type: 'contradiction', label: `${e.claim} contradicted`, detail: e.detail, turns: e.turn ? [e.turn] : [] });
  });

  return flags;
}

/** Product chosen from the stated purpose — plain string matching, not a model call. */
export function pickProduct(loanPurpose = '') {
  const p = loanPurpose.toLowerCase();
  if (p.includes('working capital') || p.includes('cash flow')) return 'MSME Working Capital';
  if (p.includes('property')) return 'Loan Against Property';
  if (p.includes('personal')) return 'Personal Loan';
  return 'Business Loan';
}

/**
 * Eligibility — the one set of numbers the AI is never allowed to compute.
 * Income is taken from bank credits, EMIs from the bureau: verified data, not declarations.
 */
export function computeEligibility(caseData) {
  const { brief } = caseData;
  const product = pickProduct(caseData.loanPurpose);
  const { rate, maxTenure, maxAmt } = PRODUCT_RATES[product];
  const assessedIncome = brief.avgMonthlyCredit;
  const existingEmi = brief.existingEMIs ?? 0;

  // No verified income means no eligibility. Saying "not assessable" is the honest answer;
  // computing a number off a self-declared figure would be the dangerous one.
  if (!assessedIncome) {
    return {
      assessable: false,
      assessedIncome: null,
      assessedIncomeSource: 'No bank statement on file',
      declaredIncome: caseData.declaredIncome,
      existingEmi: brief.existingEMIs,
      foirPct: FOIR * 100,
      availableEmiCapacity: null,
      product,
      rate,
      tenureMonths: maxTenure,
      maxEligible: null,
      emiOnEligible: null,
      requested: caseData.loanAmountRequested,
      emiOnRequested: Math.round(emi(caseData.loanAmountRequested, rate, maxTenure)),
      gap: null,
      formula: `Not assessable: eligibility needs verified income. Declared ${fmt(caseData.declaredIncome)}/month is unsupported by any statement on file.`,
    };
  }
  const capacity = Math.max(0, assessedIncome * FOIR - existingEmi);
  const eligible = Math.min(maxAmt, Math.round(maxLoan(assessedIncome, existingEmi, rate, maxTenure)));
  const requested = caseData.loanAmountRequested;
  const gap = Math.max(0, requested - eligible);

  return {
    assessable: true,
    assessedIncome,
    assessedIncomeSource: 'Brief: avgMonthlyCredit (bank credits, not declared income)',
    declaredIncome: caseData.declaredIncome,
    existingEmi,
    existingEmiSource: 'Brief: existingEMIs (bureau)',
    foirPct: FOIR * 100,
    availableEmiCapacity: Math.round(capacity),
    product,
    rate,
    tenureMonths: maxTenure,
    maxEligible: eligible,
    emiOnEligible: Math.round(emi(eligible, rate, maxTenure)),
    requested,
    emiOnRequested: Math.round(emi(requested, rate, maxTenure)),
    gap,
    formula: `EMI capacity = ${fmt(assessedIncome)} × ${FOIR * 100}% − ${fmt(existingEmi)} = ${fmt(Math.round(capacity))}/month at ${rate}% for ${maxTenure} months`,
  };
}
