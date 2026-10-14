import { commissionFor } from './commission';
import { opsChecklist } from './opsDocs';
import { isConnector } from './channel';
import { toISODate } from './formatters';

// Payouts: what the branch owes DSAs/connectors (commission) and what it owes customers (the loan itself).
export const PAYOUT_CYCLE_DAYS = 15; // commission is paid this many days after disbursal
const CONNECTOR_RATE = 0.5; // % — a connector refers, the DSA does the paperwork, so the fee is flat and lower
const RATE_KEY = { 'Loan Against Property': 'LAP', 'MSME Working Capital': 'MSME WC' };
const addDays = (iso, n) => { const d = new Date(iso); d.setDate(d.getDate() + n); return toISODate(d); };
const stageDate = (f, id) => f.timeline.find(([, s]) => s === id)?.[0];

export const payoutRate = (dsa, product) => (isConnector(dsa)
  ? CONNECTOR_RATE
  : commissionFor(dsa).rates.find((r) => r.product === (RATE_KEY[product] ?? product))?.rate ?? commissionFor(dsa).blended);

/** One row per disbursed file (status due / on hold / paid), plus the paid history. Newest first. */
export function partnerPayouts({ loanFiles, payoutHistory, getDsa }, today = toISODate()) {
  const live = loanFiles.filter((f) => f.status === 'disbursed').map((f) => {
    const dsa = getDsa(f.dsaId);
    const rate = payoutRate(dsa, f.product);
    const disbursedOn = stageDate(f, 'disbursed') ?? f.updatedAt;
    const late = opsChecklist(f, today).filter((d) => d.status === 'overdue');
    const status = f.payoutPaid ? 'paid' : late.length ? 'hold' : 'due';
    return {
      id: `PO-${f.id}`, dsaId: f.dsaId, fileId: f.id, borrower: f.borrower, product: f.product, loan: f.amount, rate,
      payout: Math.round((f.amount * rate) / 100), disbursedOn, status,
      dueOn: addDays(disbursedOn, PAYOUT_CYCLE_DAYS), paidOn: f.payoutPaid?.on, utr: f.payoutPaid?.utr,
      holdReason: late.length ? `${late.map((d) => d.doc).join(', ')} overdue` : null,
    };
  });
  const past = payoutHistory.map((p) => {
    const rate = payoutRate(getDsa(p.dsaId), p.product);
    return { ...p, loan: p.amount, rate, payout: Math.round((p.amount * rate) / 100), status: 'paid' };
  });
  return [...live, ...past].sort((a, b) => b.disbursedOn.localeCompare(a.disbursedOn));
}

/** Money owed to customers: due while the file is with operations, paid once funds are transferred. */
export function customerDisbursals(loanFiles, today = toISODate()) {
  return loanFiles.filter((f) => ['ops_disbursal', 'otc_pdd', 'disbursed'].includes(f.status)).map((f) => {
    const paidOn = f.status === 'disbursed' ? stageDate(f, 'disbursed') ?? f.updatedAt : null;
    const lateOtc = f.status === 'otc_pdd' && opsChecklist(f, today).some((d) => d.type === 'OTC' && d.status === 'overdue');
    return {
      id: f.id, dsaId: f.dsaId, borrower: f.borrower, product: f.product, amount: f.amount, stage: f.status,
      status: paidOn ? 'paid' : lateOtc ? 'hold' : 'due', paidOn,
      expectedOn: paidOn ? null : addDays(f.updatedAt, f.status === 'ops_disbursal' ? 5 : 3),
      utr: paidOn ? `SMFGD${paidOn.replaceAll('-', '').slice(2)}${f.id.slice(-3)}` : null,
      holdReason: lateOtc ? 'OTC documents overdue — funds released once received' : null,
    };
  }).sort((a, b) => (a.status === 'paid') - (b.status === 'paid') || (b.paidOn ?? b.expectedOn).localeCompare(a.paidOn ?? a.expectedOn));
}
