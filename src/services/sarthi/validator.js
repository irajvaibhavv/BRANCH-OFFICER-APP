// Strips any report sentence whose citation does not resolve to a real turn, brief field, flag or fact.

/** Numbers the report is allowed to state in the eligibility section, as digit strings. */
function allowedNumbers(eligibility = {}) {
  const vals = [
    eligibility.assessedIncome, eligibility.declaredIncome, eligibility.existingEmi,
    eligibility.availableEmiCapacity, eligibility.maxEligible, eligibility.emiOnEligible,
    eligibility.requested, eligibility.emiOnRequested, eligibility.gap,
    eligibility.rate, eligibility.tenureMonths, eligibility.foirPct,
  ].filter((n) => typeof n === 'number');
  // Accept small rounding drift in the lakh/crore range (Agent 2 writes 1,50,000 style figures).
  return vals;
}

const digits = (s) => Number(String(s).replace(/[^\d]/g, ''));

export function validateReport(reportText, transcript = [], claims = [], brief = {}, eligibility = {}, { flags = [], collected = {} } = {}) {
  const issues = [];
  let cleanedReport = reportText || '';

  // 1. Every (Turn X) must point at a real turn in the transcript.
  const turnRefs = cleanedReport.match(/\(Turn \d+\)/g) || [];
  [...new Set(turnRefs)].forEach((ref) => {
    const turnNum = parseInt(ref.match(/\d+/)[0], 10);
    if (turnNum < 1 || turnNum > transcript.length) {
      issues.push({ type: 'invalid_citation', detail: `${ref} does not exist in transcript (${transcript.length} turns total)` });
      const sentenceRegex = new RegExp(`[^.\\n]*\\(Turn ${turnNum}\\)[^.\\n]*\\.?`, 'g');
      cleanedReport = cleanedReport.replace(sentenceRegex, '[REMOVED: invalid citation]');
    }
  });

  // 2. Every (Brief: field) must exist in the Borrower Brief (dot notation supported).
  const briefRefs = cleanedReport.match(/\(Brief: [\w.]+\)/g) || [];
  [...new Set(briefRefs)].forEach((ref) => {
    const field = ref.match(/Brief: ([\w.]+)/)[1];
    const value = field.split('.').reduce((obj, key) => obj?.[key], brief);
    if (value === undefined) {
      issues.push({ type: 'invalid_brief_ref', detail: `${ref} does not exist in Borrower Brief` });
      const sentenceRegex = new RegExp(`[^.\\n]*\\(Brief: ${field}\\)[^.\\n]*\\.?`, 'g');
      cleanedReport = cleanedReport.replace(sentenceRegex, '[REMOVED: invalid citation]');
    }
  });

  // 3. (Flag: field) and (Fact: key) — valid only if the system actually produced them.
  const flagFields = new Set(flags.map((f) => f.field).filter(Boolean));
  const flagRefs = cleanedReport.match(/\(Flag: [\w.]+\)/g) || [];
  [...new Set(flagRefs)].forEach((ref) => {
    const field = ref.match(/Flag: ([\w.]+)/)[1];
    if (!flagFields.has(field)) {
      issues.push({ type: 'invalid_flag_ref', detail: `${ref} — the system raised no flag on that field` });
      cleanedReport = cleanedReport.replace(new RegExp(`[^.\\n]*\\(Flag: ${field}\\)[^.\\n]*\\.?`, 'g'), '[REMOVED: invalid citation]');
    }
  });

  const factRefs = cleanedReport.match(/\(Fact: [\w.]+\)/g) || [];
  [...new Set(factRefs)].forEach((ref) => {
    const key = ref.match(/Fact: ([\w.]+)/)[1];
    if (collected?.[key] == null) {
      issues.push({ type: 'invalid_fact_ref', detail: `${ref} was never collected in the interview` });
      cleanedReport = cleanedReport.replace(new RegExp(`[^.\\n]*\\(Fact: ${key}\\)[^.\\n]*\\.?`, 'g'), '[REMOVED: invalid citation]');
    }
  });

  // 4. Eligibility figures must be the ones the system calculated, not the model's own arithmetic.
  const elig = cleanedReport.match(/###\s*6\.[\s\S]*?(?=###|$)/)?.[0];
  if (elig) {
    const allowed = allowedNumbers(eligibility);
    const stated = (elig.match(/[\d][\d,]{4,}/g) || []).map(digits);
    stated.forEach((n) => {
      const ok = allowed.some((a) => Math.abs(a - n) <= Math.max(1, a * 0.01));
      if (!ok) {
        issues.push({ type: 'eligibility_mismatch', detail: `Report states ${n.toLocaleString('en-IN')} in the eligibility section, which the system did not calculate` });
      }
    });
  }

  const removedCount = (cleanedReport.match(/\[REMOVED:/g) || []).length;

  return {
    cleanedReport,
    issues,
    removedCount,
    isClean: issues.length === 0,
    checked: {
      turns: transcript.length,
      claims: claims.length,
      citations: turnRefs.length + briefRefs.length + flagRefs.length + factRefs.length,
    },
  };
}

/** Pull the officer recommendation out of section 7 → 'green' | 'amber' | 'red' | null. */
export function extractRecommendation(reportText = '') {
  const m = reportText.match(/\b(GREEN|AMBER|RED)\b\s*:/);
  return m ? m[1].toLowerCase() : null;
}
