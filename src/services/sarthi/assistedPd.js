// Assisted PD: the applicant owns the business, someone else runs it, and both talk on one phone. The applicant's
// answers and the operator's (op_* keys) are compared here, in code — the model only reports what this decides.
import { toNumber, toYears } from './claimVerifier';
import { formatINR } from '../../utils/formatters';

export const SALES_GAP = 0.3; // owner and operator a third apart on monthly sales
export const RENT_GAP = 0.2;

const inr = (n) => formatINR(n, { compact: false });
const apart = (a, b) => Math.abs(a - b) / Math.max(a, b);

/**
 * Flags for an assisted PD, or for a business the applicant said someone else runs.
 * c: collected facts. depth: understanding() result for the applicant (their insider-knowledge score), or null.
 */
export function assistedFlags(c, depth = null, applicant = 'the applicant') {
  const flags = [];
  const runBy = c.who_runs && c.who_runs !== 'self' ? c.who_runs : null;
  if (runBy && c.operator_present === 'no') {
    flags.push({ type: 'assisted', field: 'who_runs', severity: 'medium', detail: `Run day to day by ${runBy === 'family' ? 'a family member' : `a ${runBy}`}, who was not on the call — meet them and confirm who runs the business` });
  }
  if (c.operator_name == null && c.op_monthly_sales == null) return flags; // no operator part

  const who = c.operator_name ? `${c.operator_name}${c.operator_relation ? ` (${c.operator_relation})` : ''}` : 'the operator';
  const sales = [toNumber(c.monthly_sales), toNumber(c.op_monthly_sales)];
  if (sales.every((n) => n > 0) && apart(...sales) > SALES_GAP) {
    flags.push({ type: 'assisted', field: 'op_monthly_sales', severity: 'high', detail: `Monthly sales: ${applicant} said ${inr(sales[0])}, ${who} said ${inr(sales[1])}` });
  }
  if (c.shop_ownership && c.op_shop_ownership && c.shop_ownership !== c.op_shop_ownership) {
    flags.push({ type: 'assisted', field: 'op_shop_ownership', severity: 'medium', detail: `Premises: ${applicant} said ${c.shop_ownership}, ${who} said ${c.op_shop_ownership}` });
  }
  const rent = [toNumber(c.shop_rent), toNumber(c.op_shop_rent)];
  if (rent.every((n) => n > 0) && apart(...rent) > RENT_GAP) {
    flags.push({ type: 'assisted', field: 'op_shop_rent', severity: 'medium', detail: `Shop rent: ${applicant} said ${inr(rent[0])}, ${who} said ${inr(rent[1])}` });
  }
  const years = [toYears(c.business_age), toYears(c.op_years)];
  if (years.every((n) => n != null) && years[1] > years[0] + 1) {
    flags.push({ type: 'assisted', field: 'op_years', severity: 'medium', detail: `${who} says they have run it ${years[1]} years — longer than the ${years[0]} years ${applicant} gave for the business` });
  }

  // A name-lender: the applicant is rarely there, the money goes to the operator, and the
  // applicant does not know the trade.
  const weak = depth?.total ? depth.vague + depth.redFlag >= 2 : false;
  const away = c.op_owner_role === 'never' || (c.op_owner_role === 'sometimes' && weak);
  if (away && c.op_cash_holder === 'me') {
    flags.push({ type: 'assisted', field: 'op_cash_holder', severity: 'high', detail: `${applicant} is ${c.op_owner_role === 'never' ? 'never' : 'only sometimes'} at the business and the day's cash and UPI go to ${who}${weak ? `; ${applicant} could not answer the trade's insider questions` : ''} — the loan may be in a name-lender's name; the real borrower may be ${who}` });
  }
  return flags;
}

/** The operator, when their part ran and nothing above was raised: a genuine family or staff-run business. */
export function genuineOperator(c, flags) {
  if (c.operator_name == null || flags.some((f) => f.type === 'assisted' && f.severity !== 'low')) return null;
  return `${c.operator_name}${c.operator_relation ? ` (${c.operator_relation})` : ''}`;
}
