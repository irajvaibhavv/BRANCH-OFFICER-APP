import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import Page from '../../components/layout/Page';
import TopBar from '../../components/layout/TopBar';
import Avatar from '../../components/ui/Avatar';
import { QualityBadge } from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import { useAppState } from '../../context/AppStateContext';
import { formatINR } from '../../utils/formatters';
import styles from './dsa.module.css';

const ROWS = [
  { key: 'filesSubmitted', label: 'Files submitted', fmt: (v) => v },
  { key: 'approvalRate', label: 'Approval rate', fmt: (v) => `${v}%` },
  { key: 'disbursed', label: 'Disbursed', fmt: (v) => formatINR(v) },
  { key: 'rating', label: 'Your rating', fmt: (v) => `${v}★` },
  { key: 'distanceKm', label: 'Distance', fmt: (v) => `${v} km`, lowerBetter: true },
  { key: 'monthlyAvg', label: 'Avg / month', fmt: (v) => v.toFixed(1) },
];

export default function DSAComparison() {
  const [params] = useSearchParams();
  const { getDsa } = useAppState();
  const ids = (params.get('ids') ?? '').split(',').filter(Boolean);
  const dsas = ids.map(getDsa).filter(Boolean).map((d) => ({ ...d, monthlyAvg: d.monthly.reduce((a, b) => a + b, 0) / d.monthly.length }));

  if (dsas.length < 2) return <Page mode="slide"><TopBar back title="Compare" hideBell /><EmptyState emoji="⚖️" title="Pick at least 2 DSAs" /></Page>;

  const cols = `120px repeat(${dsas.length}, 1fr)`;
  const winner = (row) => {
    const vals = dsas.map((d) => d[row.key]);
    const best = row.lowerBetter ? Math.min(...vals) : Math.max(...vals);
    return vals.map((v) => v === best);
  };

  return (
    <Page mode="slide">
      <TopBar back title="Compare DSAs" hideBell />
      <div className={styles.cmpRow} style={{ gridTemplateColumns: cols, background: 'transparent', boxShadow: 'none', border: 'none' }}>
        <span />
        {dsas.map((d) => (
          <div key={d.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textAlign: 'center' }}>
            <Avatar name={d.name} size={48} />
            <span style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.2 }}>{d.name}</span>
            <QualityBadge quality={d.quality} />
          </div>
        ))}
      </div>

      <div className={styles.cmpTable} style={{ marginTop: 8 }}>
        {ROWS.map((row, i) => {
          const wins = winner(row);
          return (
            <motion.div key={row.key} className={styles.cmpRow} style={{ gridTemplateColumns: cols }} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}>
              <span className={styles.cmpLabel}>{row.label}</span>
              {dsas.map((d, j) => (
                <span key={d.id} className={`${styles.cmpVal} ${wins[j] ? styles.cmpWin : ''}`}>{row.fmt(d[row.key])}</span>
              ))}
            </motion.div>
          );
        })}
      </div>
      <p className="hint" style={{ textAlign: 'center', marginTop: 16 }}>Green = best in that row</p>
    </Page>
  );
}
