// Where the interview must dig instead of moving on: trade insider questions and loan-purpose signals.
import { lookupBusiness } from './knowledge';
import { toNumber } from './verifier';

// "kholna/shuru/start" or "naya kaam" — a new venture, not more stock for the shop they already run.
const NEW_VENTURE = /(kholn|kholu|khol ke|shuru kar|start kar|open kar|naya (kaam|business|dhanda)|nayi dukaan)/i;
const PERSONAL = /(shaadi|shadi|wedding|ghar bana|makaan bana|gaadi|car lena|bike|ilaaj|medical|hospital|padhai|fees|purana loan|loan chuka|karz chuka)/i;

// Two years of total income: past that, the amount needs a worked-out basis, not a round number.
const STRETCH_MONTHS = 24;

export function tradeFor(memory) {
  const c = memory.caseData ?? {};
  return lookupBusiness(memory.collected.business_type || c.businessKey || c.business);
}

export function tradeProbes(memory) {
  return tradeFor(memory)?.depth ?? [];
}

export function nextTradeProbe(memory) {
  const asked = new Set((memory.tradeAnswers ?? []).map((a) => a.key));
  return tradeProbes(memory).find((p) => !asked.has(p.key)) ?? null;
}

export function purposeSignals(collected, caseData) {
  const purpose = String(collected.loan_purpose ?? '');
  const current = lookupBusiness(collected.business_type || caseData?.businessKey || caseData?.business);
  const target = purpose ? lookupBusiness(purpose) : null;
  const otherTrade = !!target && target.id !== current?.id;
  const newVenture = !!purpose && (otherTrade || NEW_VENTURE.test(purpose));
  const personal = !!purpose && PERSONAL.test(purpose);

  const amount = toNumber(collected.loan_amount);
  const income = toNumber(collected.monthly_income) ?? (caseData?.declaredIncome || null);
  const months = amount && income ? amount / income : null;

  return {
    purpose,
    current: current?.label ?? null,
    target: otherTrade ? target.label : null,
    newVenture,
    personal,
    amount,
    income,
    months: months != null ? Math.round(months) : null,
    stretch: months != null && months > STRETCH_MONTHS,
  };
}
