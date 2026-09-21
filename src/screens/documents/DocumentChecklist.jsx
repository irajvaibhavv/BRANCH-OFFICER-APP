import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { FiSearch, FiCheckCircle, FiXCircle, FiClock, FiSend, FiX } from 'react-icons/fi';
import Page, { listContainer, listItem } from '../../components/layout/Page';
import TopBar from '../../components/layout/TopBar';
import Card from '../../components/ui/Card';
import Avatar from '../../components/ui/Avatar';
import Badge from '../../components/ui/Badge';
import BottomSheet from '../../components/ui/BottomSheet';
import EmptyState from '../../components/ui/EmptyState';
import { ProgressBar } from '../../components/charts/MiniMetric';
import { useAppState } from '../../context/AppStateContext';
import { useToast } from '../../hooks/useToast';
import { formatINR } from '../../utils/formatters';
import styles from './documents.module.css';

const FILTERS = ['All', 'Complete', 'Incomplete', 'Under Review'];

const docStatus = (f) => {
  const done = f.docs.filter(([, s]) => s === 'done').length;
  if (done === f.docs.length) return 'Complete';
  if (f.status === 'under review') return 'Under Review';
  return 'Incomplete';
};

export default function DocumentChecklist() {
  const { loanFiles, getDsa, setLoanFiles } = useAppState();
  const { toast } = useToast();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('All');
  const [openId, setOpenId] = useState(null);

  const list = useMemo(() => loanFiles
    .filter((f) => !q || `${f.borrower} ${getDsa(f.dsaId)?.name}`.toLowerCase().includes(q.toLowerCase()))
    .filter((f) => filter === 'All' || docStatus(f) === filter), [loanFiles, q, filter, getDsa]);

  const open = loanFiles.find((f) => f.id === openId);
  const remind = (doc, f) => toast(`Reminder sent to DSA ${getDsa(f.dsaId)?.name.split(' ')[0]} for ${doc}`, 'success');
  const markDone = (f, doc) => {
    setLoanFiles((all) => all.map((x) => (x.id === f.id ? { ...x, docs: x.docs.map(([n, s]) => (n === doc ? [n, 'done'] : [n, s])) } : x)));
    toast(`${doc} marked received`, 'success', 1500);
  };

  return (
    <Page mode="slide">
      <TopBar back title="Documents" subtitle={`${loanFiles.filter((f) => docStatus(f) !== 'Complete').length} files need documents`} />

      <div className={styles.search}>
        <FiSearch size={20} color="var(--text-3)" />
        <input placeholder="Search by borrower or DSA…" value={q} onChange={(e) => setQ(e.target.value)} />
        {q && <button onClick={() => setQ('')}><FiX size={18} /></button>}
      </div>
      <div className="hscroll" style={{ padding: '12px 20px 12px' }}>
        {FILTERS.map((f) => (
          <button key={f} className={`${styles.chip} ${filter === f ? styles.chipOn : ''}`} onClick={() => setFilter(f)}>{f}</button>
        ))}
      </div>

      {list.length === 0 ? <EmptyState emoji="📄" title="Nothing here" subtitle="Try another filter." /> : (
        <motion.div className="stack" variants={listContainer} initial="initial" animate="animate" key={filter}>
          {list.map((f) => {
            const done = f.docs.filter(([, s]) => s === 'done').length;
            const st = docStatus(f);
            const tone = st === 'Complete' ? 'success' : st === 'Under Review' ? 'warning' : 'danger';
            return (
              <motion.div key={f.id} variants={listItem}>
                <Card padding={16} onClick={() => setOpenId(f.id)}>
                  <div className="row-between">
                    <div className="grow">
                      <div style={{ fontWeight: 600 }}>{f.borrower}</div>
                      <div className="hint">{formatINR(f.amount)} · {getDsa(f.dsaId)?.name}</div>
                    </div>
                    <Badge tone={tone} soft>{st}</Badge>
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <ProgressBar value={(done / f.docs.length) * 100} height={6} color={`var(--${tone})`} />
                    <div className="hint" style={{ marginTop: 6 }}>{done} of {f.docs.length} documents done</div>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      <BottomSheet open={!!open} onClose={() => setOpenId(null)} title={open?.borrower}>
        {open && (
          <>
            <div className="row" style={{ gap: 10, marginBottom: 16 }}>
              <Avatar name={getDsa(open.dsaId)?.name} size={32} />
              <span className="label">{getDsa(open.dsaId)?.name} · {open.product} · {formatINR(open.amount)}</span>
            </div>
            <div className={styles.docList}>
              {open.docs.map(([name, s]) => (
                <div key={name} className={`${styles.docRow} ${s !== 'done' ? styles.docPending : ''}`}>
                  {s === 'done' ? <FiCheckCircle size={22} color="var(--success)" /> : s === 'rejected' ? <FiXCircle size={22} color="var(--danger)" /> : <FiClock size={22} color="var(--warning)" />}
                  <div className="grow">
                    <div style={{ fontWeight: 500 }}>{name}</div>
                    <div className="hint">{s === 'done' ? 'Received' : s === 'rejected' ? 'Rejected · re-upload needed' : 'Pending from DSA'}</div>
                  </div>
                  {s !== 'done' && (
                    <div className="row" style={{ gap: 4 }}>
                      <button className={styles.remind} onClick={() => remind(name, open)}><FiSend size={14} /> Remind</button>
                      <button className={styles.tick} onClick={() => markDone(open, name)} aria-label="Mark received"><FiCheckCircle size={18} /></button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </BottomSheet>
    </Page>
  );
}
