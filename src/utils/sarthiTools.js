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
  const areaKey = Object.keys(locationKnowledge).find((k) => form.area.toLowerCase().includes(k.toLowerCase())) ?? null;
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

/** Area facts (rents, landmarks, markets) — null when we have no data for that area. */
export function lookupLocation(areaKey) {
  if (!areaKey) return null;
  if (locationKnowledge[areaKey]) return locationKnowledge[areaKey];
  // tolerate "Dwarka Sector 7, Delhi" style strings
  const hit = Object.keys(locationKnowledge).find((k) => areaKey.toLowerCase().includes(k.toLowerCase()));
  return hit ? locationKnowledge[hit] : null;
}

/** Trade-knowledge questions a real owner of this business should be able to answer. */
export function lookupBusiness(businessKey) {
  return businessKnowledge[businessKey] ?? null;
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
