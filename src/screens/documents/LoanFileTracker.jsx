import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiFilter } from 'react-icons/fi';
import Page, { listContainer, listItem } from '../../components/navigation/Page';
import TopBar from '../../components/navigation/TopBar';
import Card from '../../components/common/Card';
import Avatar from '../../components/common/Avatar';
import Button from '../../components/common/Button';
import { StatusBadge } from '../../components/common/Badge';
import BottomSheet from '../../components/common/BottomSheet';
import EmptyState from '../../components/common/EmptyState';
import { Select, Input } from '../../components/common/Input';
import { useAppState } from '../../context/AppStateContext';
import { formatINR, formatDate } from '../../utils/formatters';
import styles from './documents.module.css';

const STAGES = ['submitted', 'under review', 'approved', 'disbursed'];
const TABS = ['All', 'Submitted', 'Under Review', 'Approved', 'Rejected', 'Disbursed'];
const COLORS = { submitted: 'var(--primary)', 'under review': 'var(--warning)', approved: 'var(--success)', rejected: 'var(--danger)', disbursed: '#7c3aed' };

export default function LoanFileTracker() {
  const [params] = useSearchParams();
  const { loanFiles, getDsa, dsas } = useAppState();
  const [tab, setTab] = useState('All');
  const [openId, setOpenId] = useState(params.get('open'));
  const [filterOpen, setFilterOpen] = useState(false);
  const [fDsa, setFDsa] = useState('');
  const [fFrom, setFFrom] = useState('');
  const [fTo, setFTo] = useState('');

  useEffect(() => { if (params.get('open')) setOpenId(params.get('open')); }, [params]);

  const counts = useMemo(() => TABS.reduce((a, t) => ({ ...a, [t]: t === 'All' ? loanFiles.length : loanFiles.filter((f) => f.status === t.toLowerCase()).length }), {}), [loanFiles]);
  const list = useMemo(() => loanFiles
    .filter((f) => tab === 'All' || f.status === tab.toLowerCase())
    .filter((f) => !fDsa || f.dsaId === fDsa)
    .filter((f) => !fFrom || f.updatedAt >= fFrom)
    .filter((f) => !fTo || f.updatedAt <= fTo)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [loanFiles, tab, fDsa, fFrom, fTo]);

  const open = loanFiles.find((f) => f.id === openId);
  const active = fDsa || fFrom || fTo;
  const maxStage = Math.max(...STAGES.map((s) => loanFiles.filter((f) => f.status === s).length), 1);

  return (
    <Page mode="slide">
      <TopBar back title="Loan files" subtitle={`${loanFiles.length} files · ${formatINR(loanFiles.reduce((s, f) => s + f.amount, 0))} pipeline`}
        right={<button onClick={() => setFilterOpen(true)} style={{ width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 12, color: active ? 'var(--primary)' : 'var(--text-1)', position: 'relative' }} aria-label="Filter">
          <FiFilter size={22} />{active && <span style={{ position: 'absolute', top: 8, right: 8, width: 8, height: 8, borderRadius: 4, background: 'var(--primary)' }} />}
        </button>} />

      {/* Pipeline funnel */}
      <div className={styles.pipeline}>
        {STAGES.map((s) => {
          const n = loanFiles.filter((f) => f.status === s).length;
          return (
            <button key={s} className={styles.stage} onClick={() => setTab(s.replace(/\b\w/g, (c) => c.toUpperCase()))}>
              <b style={{ color: COLORS[s] }}>{n}</b>
              <span>{s === 'under review' ? 'Review' : s.replace(/\b\w/g, (c) => c.toUpperCase())}</span>
              <motion.div className={styles.stageBar} style={{ background: COLORS[s] }} initial={{ width: 0 }} animate={{ width: `${(n / maxStage) * 100}%` }} transition={{ duration: 0.8 }} />
            </button>
          );
        })}
      </div>

      <div className={styles.tabs} style={{ marginTop: 12 }}>
        {TABS.map((t) => (
          <button key={t} className={`${styles.tab} ${tab === t ? styles.tabOn : ''}`} onClick={() => setTab(t)}>
            {t} <span className={styles.count}>{counts[t]}</span>
          </button>
        ))}
      </div>

      {list.length === 0 ? <EmptyState emoji="📁" title="No files here" subtitle="Try another status or clear filters." actionLabel={active ? 'Clear filters' : undefined} onAction={() => { setFDsa(''); setFFrom(''); setFTo(''); }} /> : (
        <motion.div className="stack" variants={listContainer} initial="initial" animate="animate" key={tab}>
          {list.map((f) => (
            <motion.div key={f.id} variants={listItem}>
              <Card padding={16} onClick={() => setOpenId(f.id)}>
                <div className="row-between">
                  <div className="grow">
                    <div style={{ fontWeight: 600 }}>{f.borrower}</div>
                    <div className="hint">{getDsa(f.dsaId)?.name} · {f.product}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontWeight: 700 }}>{formatINR(f.amount)}</div>
                    <div className="hint">{formatDate(f.updatedAt)}</div>
                  </div>
                </div>
                <div style={{ marginTop: 10 }}><StatusBadge status={f.status} soft /></div>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Detail sheet */}
      <BottomSheet open={!!open} onClose={() => setOpenId(null)} title={open?.borrower}>
        {open && (
          <>
            <div className="row" style={{ gap: 10 }}>
              <Avatar name={getDsa(open.dsaId)?.name} size={36} />
              <div className="grow">
                <div style={{ fontWeight: 600 }}>{getDsa(open.dsaId)?.name}</div>
                <div className="hint">{open.id} · {open.product}</div>
              </div>
              <StatusBadge status={open.status} />
            </div>
            <div className="row-between" style={{ margin: '16px 0' }}>
              <div><div className="big-number">{formatINR(open.amount)}</div><div className="hint">loan amount</div></div>
              <div style={{ textAlign: 'right' }}><div className="big-number">{open.docs.filter(([, s]) => s === 'done').length}/{open.docs.length}</div><div className="hint">documents</div></div>
            </div>
            <div className="label" style={{ marginBottom: 8 }}>Timeline</div>
            <div className={styles.timeline}>
              {open.timeline.map(([d, s], i) => (
                <div key={i} className={styles.tlRow}>
                  {i < open.timeline.length - 1 && <div className={styles.tlLine} />}
                  <div className={styles.tlDot} style={{ background: COLORS[s] }} />
                  <div>
                    <div style={{ fontWeight: 600 }}>{s.replace(/\b\w/g, (c) => c.toUpperCase())}</div>
                    <div className="hint">{formatDate(d, { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                  </div>
                </div>
              ))}
              {open.status !== 'disbursed' && open.status !== 'rejected' && (
                <div className={styles.tlRow} style={{ opacity: 0.5 }}>
                  <div className={styles.tlDot} style={{ background: 'var(--border)' }} />
                  <div><div style={{ fontWeight: 600 }}>Next: {STAGES[STAGES.indexOf(open.status) + 1]?.replace(/\b\w/g, (c) => c.toUpperCase())}</div><div className="hint">Expected in 3–5 days</div></div>
                </div>
              )}
            </div>
          </>
        )}
      </BottomSheet>

      {/* Filter sheet */}
      <BottomSheet open={filterOpen} onClose={() => setFilterOpen(false)} title="Filter files">
        <div className="stack" style={{ gap: 16 }}>
          <Select label="DSA" placeholder="All DSAs" value={fDsa} onChange={(e) => setFDsa(e.target.value)} options={dsas.map((d) => ({ value: d.id, label: d.name }))} />
          <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
            <Input label="From" type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} />
            <Input label="To" type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} />
          </div>
          <div className="row" style={{ gap: 12 }}>
            <Button variant="secondary" style={{ flex: 1 }} onClick={() => { setFDsa(''); setFFrom(''); setFTo(''); }}>Clear</Button>
            <Button style={{ flex: 2 }} onClick={() => setFilterOpen(false)}>Apply</Button>
          </div>
        </div>
      </BottomSheet>
    </Page>
  );
}
