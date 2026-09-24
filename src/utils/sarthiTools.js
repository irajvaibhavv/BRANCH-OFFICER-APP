/*
  SARTHI — grounded lookups.

  Every fact Sarthi is allowed to use about an area, a business type or a past failure pattern
  comes from these four JSON files. Nothing here guesses: an unknown area returns null and the
  agent prompt then tells the AI to skip that verification rather than invent one. This is
  Layer 1 of the anti-hallucination design.
*/
import borrowers from '../data/sarthi/borrowers.json';
import riskPatterns from '../data/sarthi/riskPatterns.json';
import locationKnowledge from '../data/sarthi/locationKnowledge.json';
import businessKnowledge from '../data/sarthi/businessKnowledge.json';

export const CASES = borrowers;
export const CUSTOM_CASES_KEY = 'bo_sarthi_cases';

/* Walk-in applicants the officer adds themselves live in localStorage beside the seeded three. */
export function customCases() {
  try {
    return JSON.parse(window.localStorage.getItem(CUSTOM_CASES_KEY)) ?? [];
  } catch {
    return [];
  }
}

export function allCases() {
  return [...customCases(), ...borrowers];
}

export function getCase(id) {
  return allCases().find((b) => b.id === id) ?? null;
}

/**
 * Build a case for someone we hold no bureau or bank data on.
 * Nothing is invented: every financial field stays null, and the report says so rather than
 * showing a number the file cannot support.
 */
export function buildNewCase(form) {
  // areaKey stays null unless we hold real data for that area — tier ranges are still applied by
  // lookupLocation(form.area), but a null key keeps the agent off landmark trap questions.
  const areaKey = Object.keys(locationKnowledge.specific).find((k) => form.area.toLowerCase().includes(k.toLowerCase())) ?? null;
  const pattern = matchPattern(areaKey, form.businessKey);

  return {
    id: `sarthi_new_${Date.now()}`,
    isNew: true,
    createdAt: new Date().toISOString(),
    name: form.name.trim(),
    phone: form.phone,
    age: Number(form.age) || null,
    area: form.area.trim(),
    areaKey,
    business: form.business,
    businessKey: form.businessKey,
    businessName: form.businessName.trim(),
    businessVintage: form.businessVintage,
    loanPurpose: form.loanPurpose,
    loanAmountRequested: Number(form.loanAmountRequested) || 0,
    declaredIncome: Number(form.declaredIncome) || 0,
    employment: 'Self-employed',
    riskLevel: pattern ? 'high' : 'medium', // unknown-to-us is never "low"
    identity: form.identity ?? null,
    hi: form.hi ?? {},
    brief: {
      avgMonthlyCredit: null,
      bureauScore: null,
      existingEMIs: null,
      runningLoans: [],
      gstRegistered: false,
      gstVintage: null,
      itrFiled: false,
      itrIncome: null,
      bankStatementMonths: 0,
      largeDeposits: [],
      missingDocs: ['Bank statement', 'ITR', 'GST returns'],
      areaDefaultRate: null,
      digInto: [
        'New to us — nothing on file to check the answers against',
        'Income is self-declared only; no bank statement has been seen',
        `Confirm the business exists at ${form.area.trim()} from the photographs`,
        ...(pattern ? [`Area and trade match ${pattern.patternId}, which has failed before`] : []),
      ],
    },
    riskPatternMatch: pattern
      ? {
        patternId: pattern.patternId,
        matchReason: `${pattern.area} + ${pattern.businessType}`,
        failureRate: pattern.failureRate,
        pastCause: pattern.whatWentWrong,
      }
      : null,
  };
}

/** Institutional memory works for a walk-in too: match on area and trade. */
export function matchPattern(areaKey, businessKey = '') {
  if (!areaKey) return null;
  const trade = businessKey.toLowerCase();
  return riskPatterns.find((p) => {
    if (!areaKey.toLowerCase().includes(p.area.toLowerCase())) return false;
    const t = p.businessType.toLowerCase();
    if (t.includes('freelanc') || t.includes('it')) return trade.includes('freelanc') || trade.includes('it');
    if (t.includes('retail')) return trade.includes('kirana') || trade.includes('garment') || trade.includes('shop');
    if (t.includes('partnership')) return trade.includes('garment') || trade.includes('partner');
    return false;
  }) ?? null;
}

export const AREA_SPECIFIC = locationKnowledge.specific;
export const AREA_TIERS = locationKnowledge.tiers;

/**
 * Area facts, resolved in three steps: the area we hold real data for, else the tier its city
 * falls in, else small-town defaults.
 *
 * Tier ranges exist so a rent claim from Muzaffarpur or a village can still be checked against
 * something sane instead of going unverified. They are wide on purpose — `source` says which
 * step answered, and the verifier only calls a tier-based rent "contradicted" at the extremes,
 * because a wrong contradiction is far more damaging than an honest "unverified".
 */
export function lookupLocation(areaKey) {
  if (!areaKey) return { ...AREA_TIERS.tier3_rural, source: 'default', tier: 'tier3_rural' };
  const lower = String(areaKey).toLowerCase();

  if (AREA_SPECIFIC[areaKey]) return { ...AREA_SPECIFIC[areaKey], source: 'specific', areaKey };
  // tolerate "Dwarka Sector 7, Delhi" style strings
  const hit = Object.keys(AREA_SPECIFIC).find((k) => lower.includes(k.toLowerCase()));
  if (hit) return { ...AREA_SPECIFIC[hit], source: 'specific', areaKey: hit };

  const tier = Object.entries(AREA_TIERS).find(([, data]) =>
    data.cities?.some((c) => lower.includes(c.toLowerCase())));
  if (tier) return { ...tier[1], source: 'tier', tier: tier[0] };

  return { ...AREA_TIERS.tier3_rural, source: 'default', tier: 'tier3_rural' };
}

/** True only when we hold real landmark/market data — the trap questions need that, tiers cannot give it. */
export function hasAreaDetail(areaKey) {
  return lookupLocation(areaKey).source === 'specific';
}

/**
 * Trade knowledge, by key or by anything the borrower called their business.
 * Aliases matter because a walk-in says "sabzi ka thela", not "fruit_vegetable".
 */
export function lookupBusiness(businessKey) {
  if (!businessKey) return null;
  if (businessKnowledge[businessKey]) return businessKnowledge[businessKey];
  const lower = String(businessKey).toLowerCase();
  return Object.values(businessKnowledge).find((b) =>
    lower.includes(b.label.toLowerCase())
    || b.aliases?.some((a) => lower.includes(a.toLowerCase()))) ?? null;
}

/** The full pattern record behind a case's riskPatternMatch, or null. */
export function lookupRiskPattern(patternId) {
  return riskPatterns.find((p) => p.patternId === patternId) ?? null;
}

/**
 * The exact object the report agent is shown as the "Borrower Brief" — case-level facts merged
 * with the brief. (Brief: field) citations are validated against this, so what the agent may cite
 * and what the validator accepts can never drift apart.
 */
export function briefForCitation(c) {
  return {
    name: c.name, age: c.age, area: c.area, business: c.business, businessName: c.businessName,
    businessVintage: c.businessVintage, loanPurpose: c.loanPurpose,
    loanAmountRequested: c.loanAmountRequested, declaredIncome: c.declaredIncome,
    employment: c.employment, ...c.brief,
  };
}
