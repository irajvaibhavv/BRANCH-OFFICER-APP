import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import Page, { listContainer, listItem } from '../../components/layout/Page';
import TopBar from '../../components/layout/TopBar';
import Card from '../../components/ui/Card';
import Avatar from '../../components/ui/Avatar';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import { useAppState } from '../../context/AppStateContext';
import { partnerPayouts, customerDisbursals, PAYOUT_CYCLE_DAYS } from '../../utils/payouts';
import { isConnector } from '../../utils/channel';
import { formatINR, formatDate } from '../../utils/formatters';
import styles from './payouts.module.css';

const STATUS = { due: ['Due', 'warning'], hold: ['On hold', 'danger'], paid: ['Paid', 'success'] };
const sum = (rows, k) => rows.reduce((s, r) => s + r[k], 0);

/** Payout tracking: commission owed to DSAs/connectors, and loan amounts owed to customers — due vs paid. */
export default function PayoutTracker() {
  const navigate = useNavigate();
  const { loanFiles, payoutHistory, getDsa } = useAppState();
  const [params, setParams] = useSearchParams();
  const view = params.get('tab') === 'customer' ? 'customer' : 'partner';
  const [filter, setFilter] = useState('all');

  const partner = useMemo(() => partnerPayouts({ loanFiles, payoutHistory, getDsa }), [loanFiles, payoutHistory, getDsa]);
  const customer = useMemo(() => customerDisbursals(loanFiles), [loanFiles]);
  const rows = view === 'partner' ? partner : customer;
  const key = view === 'partner' ? 'payout' : 'amount';
  const of = (s) => rows.filter((r) => r.status === s);
  const shown = filter === 'all' ? rows : of(filter);

  const switchView = (v) => { setParams(v === 'customer' ? { tab: 'customer' } : {}, { replace: true }); setFilter('all'); };

  return (
    <Page mode="slide" style={{ paddingBottom: 'calc(var(--tabbar-safe) + 24px)' }}>
      <TopBar back title="Payouts" subtitle={view === 'partner' ? `Commission paid ${PAYOUT_CYCLE_DAYS} days after disbursal` : 'Loan amount released to customers'} hideBell />

      <div className={styles.seg}>
        <button className={view === 'partner' ? styles.on : ''} onClick={() => switchView('partner')}>DSA & Connector</button>
        <button className={view === 'customer' ? styles.on : ''} onClick={() => switchView('customer')}>Customer</button>
      </div>

      {/* Totals double as filters — tap again to show all */}
      <div className={styles.sum}>
        {['due', 'hold', 'paid'].map((s) => (
          <button key={s} className={`${styles.tile} ${filter === s ? styles.tileOn : ''}`} onClick={() => setFilter(filter === s ? 'all' : s)}>
            <b style={{ color: `var(--${STATUS[s][1]})` }}>{formatINR(sum(of(s), key))}</b>
            <span>{STATUS[s][0]} · {of(s).length}</span>
          </button>
        ))}
      </div>


      {shown.length === 0 ? <EmptyState compact emoji="💸" title="Nothing here" subtitle="Try another filter." /> : (
        <motion.div className="stack" variants={listContainer} initial="initial" animate="animate" key={`${view}-${filter}`}>
          {shown.map((r) => {
            const dsa = getDsa(r.dsaId);
            const [label, tone] = STATUS[r.status];
            return (
              <motion.div key={r.id} variants={listItem}>
                <Card padding={14} status={r.status === 'hold' ? 'danger' : undefined}
                  onClick={() => navigate(view === 'partner' ? `/dsas/${r.dsaId}?tab=Business` : `/files?open=${r.id}`)}>
                  <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
                    <Avatar name={view === 'partner' ? dsa?.name : r.borrower} size={40} />
                    <div className="grow" style={{ minWidth: 0 }}>
                      {view === 'partner' ? (
                        <>
                          <div style={{ fontWeight: 600 }} className="truncate">{dsa?.name}{isConnector(dsa) ? ' · Connector' : ''}</div>
                          <div className="hint truncate">{r.borrower} · {r.fileId}</div>
                          <div className="hint truncate">{r.rate}% of {formatINR(r.loan)} {r.product}</div>
                        </>
                      ) : (
                        <>
                          <div style={{ fontWeight: 600 }} className="truncate">{r.borrower}</div>
                          <div className="hint truncate">{r.id} · {r.product}</div>
                          <div className="hint truncate">via {dsa?.name}</div>
                        </>
                      )}
                    </div>
                    <div className={styles.amt}>
                      <b>{formatINR(r[key])}</b>
                      <Badge tone={tone} soft>{label}</Badge>
                    </div>
                  </div>
                  <div className="hint" style={{ marginTop: 8 }}>
                    {r.status === 'paid'
                      ? `Paid ${formatDate(r.paidOn)} · UTR ${r.utr}`
                      : view === 'partner' ? `Disbursed ${formatDate(r.disbursedOn)} · payout due ${formatDate(r.dueOn)}` : `With operations · expected ${formatDate(r.expectedOn)}`}
                  </div>
                  {r.holdReason && <div className={styles.reason}>On hold: {r.holdReason}</div>}
                </Card>
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </Page>
  );
}
