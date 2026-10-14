import { FiCheckCircle, FiClock, FiLock, FiMinusCircle } from 'react-icons/fi';
import Card from '../ui/Card';
import Badge from '../ui/Badge';
import { useAppState } from '../../context/AppStateContext';
import { payoutRate, PAYOUT_CYCLE_DAYS } from '../../utils/payouts';
import { stageIndex, stageLabel } from '../../utils/fileStages';
import { formatINR, formatDate } from '../../utils/formatters';

const ROW = {
  paid: [FiCheckCircle, 'var(--success)', 'Paid', 'success'],
  due: [FiClock, 'var(--warning)', 'Due', 'warning'],
  later: [FiLock, 'var(--text-3)', 'Not yet', 'neutral'],
  none: [FiMinusCircle, 'var(--text-3)', '—', 'neutral'],
};

function Row({ kind, title, amount, note }) {
  const [Icon, color, label, tone] = ROW[kind];
  return (
    <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
      <Icon size={18} color={color} style={{ flexShrink: 0, marginTop: 2 }} />
      <div className="grow" style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{title}</div>
        <div className="hint">{note}</div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        {amount != null && <div style={{ fontWeight: 700, fontSize: 14 }}>{formatINR(amount)}</div>}
        <Badge tone={tone} soft>{label}</Badge>
      </div>
    </div>
  );
}

/** One customer's payouts: the loan released to them, and the commission owed to the DSA who sourced them. */
export default function CustomerPayout({ amount, product = 'Business Loan', stage, dsaId, paidOn, feePaidOn, feeUtr, style }) {
  const { getDsa } = useAppState();
  const dsa = dsaId ? getDsa(dsaId) : null;
  const at = stage ? stageIndex(stage) : -1;
  const disbursed = stage === 'disbursed';
  const withOps = at >= stageIndex('ops_disbursal') && !disbursed;
  const rate = dsa ? payoutRate(dsa, product) : 0;

  const loan = stage === 'rejected' ? ['none', 'File rejected — nothing to release']
    : disbursed ? ['paid', paidOn ? `Funds transferred ${formatDate(paidOn)}` : 'Funds transferred']
    : withOps ? ['due', `With operations · ${stageLabel(stage)}`]
    : ['later', stage ? `Released after Fund Transfer · now at ${stageLabel(stage)}` : 'No application yet'];
  const fee = !dsa ? ['none', 'Direct customer — no DSA payout']
    : disbursed && feePaidOn ? ['paid', `${rate}% to ${dsa.name} · paid ${formatDate(feePaidOn)}${feeUtr ? ` · UTR ${feeUtr}` : ''}`]
    : disbursed ? ['due', `${rate}% to ${dsa.name} · paid ${PAYOUT_CYCLE_DAYS} days after disbursal`]
    : ['later', `${rate}% to ${dsa.name} · earned on disbursal`];

  return (
    <Card padding={16} noChevron style={{ marginTop: 12, ...style }}>
      <div className="label" style={{ marginBottom: 12 }}>Payouts</div>
      <div className="stack" style={{ gap: 12 }}>
        <Row kind={loan[0]} title="Loan to customer" amount={stage === 'rejected' || !amount ? null : amount} note={loan[1]} />
        <Row kind={fee[0]} title="DSA commission" amount={dsa && amount ? Math.round((amount * rate) / 100) : null} note={fee[1]} />
      </div>
    </Card>
  );
}
