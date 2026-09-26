// Cases and grounded lookups. Every fact Sarthi may use comes from these JSON files.
import borrowers from '../../data/sarthi/borrowers.json';
import riskPatterns from '../../data/sarthi/riskPatterns.json';
import locationKnowledge from '../../data/sarthi/locationKnowledge.json';
import businessKnowledge from '../../data/sarthi/businessKnowledge.json';

export const CASES = borrowers;
export const CUSTOM_CASES_KEY = 'bo_sarthi_cases';

// Walk-ins added by the officer.
export function customCases() {
  try {
    return JSON.parse(window.localStorage.getItem(CUSTOM_CASES_KEY)) ?? [];
  } catch {
    return [];
  }
}

// One-time wipe of every walk-in and its report; bump the stamp to wipe again on every device.
const WALKIN_PURGE = '2026-09-26';
export function purgeWalkIns() {
  try {
    const ls = window.localStorage;
    if (ls.getItem('bo_sarthi_walkin_purge') === WALKIN_PURGE) return;
    ls.removeItem(CUSTOM_CASES_KEY);
    const reports = JSON.parse(ls.getItem('bo_sarthi_reports')) ?? [];
    ls.setItem('bo_sarthi_reports', JSON.stringify(reports.filter((r) => !String(r.caseId).startsWith('sarthi_new_'))));
    Object.keys(ls).filter((k) => k.startsWith('bo_sarthi_') && k.includes('sarthi_new_')).forEach((k) => ls.removeItem(k));
    ls.setItem('bo_sarthi_walkin_purge', WALKIN_PURGE);
  } catch { /* storage blocked — nothing to purge */ }
}

export function allCases() {
  return [...customCases(), ...borrowers];
}

export function getCase(id) {
  return allCases().find((b) => b.id === id) ?? null;
}

// Walk-in case: every financial field stays null — nothing is invented.
export function buildNewCase(form) {
  // null unless surveyed, which keeps the agent off landmark trap questions.
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

// Resolves specific → city tier → rural default. `source` says which answered; tier ranges are indicative only.
export function lookupLocation(areaKey) {
  if (!areaKey) return { ...AREA_TIERS.tier3_rural, source: 'default', tier: 'tier3_rural' };
  const lower = String(areaKey).toLowerCase();

  if (AREA_SPECIFIC[areaKey]) return { ...AREA_SPECIFIC[areaKey], source: 'specific', areaKey };
  const hit = Object.keys(AREA_SPECIFIC).find((k) => lower.includes(k.toLowerCase()));
  if (hit) return { ...AREA_SPECIFIC[hit], source: 'specific', areaKey: hit };

  const tier = Object.entries(AREA_TIERS).find(([, data]) =>
    data.cities?.some((c) => lower.includes(c.toLowerCase())));
  if (tier) return { ...tier[1], source: 'tier', tier: tier[0] };

  return { ...AREA_TIERS.tier3_rural, source: 'default', tier: 'tier3_rural' };
}

export function hasAreaDetail(areaKey) {
  return lookupLocation(areaKey).source === 'specific';
}

// Matches by key, label or alias ("sabzi ka thela").
// Short names must be whole words; longer ones may be followed by an ending ("kiranas", "wiring-contractor").
function wordMatch(text, name) {
  let i = text.indexOf(name);
  while (i !== -1) {
    const before = i === 0 || !/[a-z0-9]/.test(text[i - 1]);
    const after = text[i + name.length];
    if (before && (name.length >= 4 || !after || !/[a-z0-9]/.test(after))) return true;
    i = text.indexOf(name, i + 1);
  }
  return false;
}

export function lookupBusiness(businessKey) {
  if (!businessKey) return null;
  if (businessKnowledge[businessKey]) return businessKnowledge[businessKey];
  const lower = String(businessKey).toLowerCase();
  // Most specific wins, and a name must start a word: "ca" (CA) must not match inside "electrical",
  // and "contractor" must not beat "electrical contractor".
  let best = null;
  let bestLen = 0;
  for (const b of Object.values(businessKnowledge)) {
    for (const name of [b.label, ...(b.aliases ?? [])]) {
      const n = name.toLowerCase();
      if (n.length > bestLen && wordMatch(lower, n)) { best = b; bestLen = n.length; }
    }
  }
  return best;
}

export function lookupRiskPattern(patternId) {
  return riskPatterns.find((p) => p.patternId === patternId) ?? null;
}

// The agent sees this as the Brief and the validator checks (Brief: field) against it — one source for both.
export function briefForCitation(c) {
  return {
    name: c.name, age: c.age, area: c.area, business: c.business, businessName: c.businessName,
    businessVintage: c.businessVintage, loanPurpose: c.loanPurpose,
    loanAmountRequested: c.loanAmountRequested, declaredIncome: c.declaredIncome,
    employment: c.employment, ...c.brief,
  };
}
