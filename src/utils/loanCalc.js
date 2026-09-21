/*
  LOAN CALCULATOR — indicative numbers for a customer conversation. Rates are demo values per
  product; eligibility uses a simple FOIR rule (EMIs must stay within 50% of monthly income).
*/
export const PRODUCT_RATES = {
  'Business Loan': { rate: 14, maxTenure: 60, minAmt: 100000, maxAmt: 5000000 },
  'MSME Working Capital': { rate: 13, maxTenure: 36, minAmt: 100000, maxAmt: 3000000 },
  'Loan Against Property': { rate: 10, maxTenure: 180, minAmt: 500000, maxAmt: 20000000 },
  'Personal Loan': { rate: 12.5, maxTenure: 60, minAmt: 50000, maxAmt: 2500000 },
};
export const PRODUCTS = Object.keys(PRODUCT_RATES);
export const FOIR = 0.5;

/** Monthly EMI for principal p, annual rate r (%), tenure n months. */
export function emi(p, r, n) {
  if (!p || !n) return 0;
  const i = r / 12 / 100;
  if (i === 0) return p / n;
  const f = Math.pow(1 + i, n);
  return (p * i * f) / (f - 1);
}

/** Largest loan whose EMI fits in the customer's spare repayment capacity. */
export function maxLoan(income, existingEmi, r, n) {
  const room = Math.max(0, income * FOIR - (existingEmi || 0));
  if (!room || !n) return 0;
  const i = r / 12 / 100;
  const f = Math.pow(1 + i, n);
  return (room * (f - 1)) / (i * f);
}

/**
 * Basic questions a lender asks before quoting. Each maps to a field the calculator uses,
 * plus a plain hint on what a good answer looks like.
 */
export const BASIC_QUESTIONS = [
  { id: 'purpose', q: 'What is the loan for?', type: 'choice', options: ['Expand business', 'Working capital', 'Buy equipment', 'Property', 'Personal need'], hint: 'Purpose decides the product — expansion/equipment → Business Loan, cash-flow → Working Capital.' },
  { id: 'employment', q: 'How do you earn — business or salaried?', type: 'choice', options: ['Self-employed', 'Salaried', 'Professional'], hint: 'Self-employed needs ITR + bank statements; salaried needs salary slips.' },
  { id: 'income', q: 'What is your monthly income / business profit?', type: 'money', hint: 'Use net figure after expenses. EMIs must stay within 50% of this.' },
  { id: 'existingEmi', q: 'Any running loans? Total EMI per month?', type: 'money', hint: 'Every existing EMI reduces what we can lend.' },
  { id: 'age', q: 'Your age?', type: 'number', hint: 'Loan should close before 65 (self-employed) / 60 (salaried).' },
  { id: 'vintage', q: 'How long has the business been running?', type: 'choice', options: ['< 1 year', '1–3 years', '3+ years'], hint: 'Most products need 3+ years; MSME WC accepts 1+ with GST.' },
  { id: 'docs', q: 'Do you have PAN, Aadhaar, ITR (2 yrs) and GST returns?', type: 'choice', options: ['All ready', 'Some missing', 'Not sure'], hint: 'Missing ITR is the #1 reason files stall.' },
  { id: 'collateral', q: 'Any property you could offer as security?', type: 'choice', options: ['Yes', 'No'], hint: 'Property unlocks LAP — lower rate, longer tenure.' },
];
