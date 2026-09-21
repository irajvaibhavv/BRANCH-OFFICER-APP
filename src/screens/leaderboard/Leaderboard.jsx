import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FiArrowUp, FiArrowDown, FiMinus } from 'react-icons/fi';
import Page, { listContainer, listItem } from '../../components/layout/Page';
import TopBar from '../../components/layout/TopBar';
import Avatar from '../../components/ui/Avatar';
import data from '../../data/mock/leaderboard.json';
import { formatINR } from '../../utils/formatters';
import styles from './leaderboard.module.css';

const PERIODS = [['week', 'This week'], ['month', 'This month'], ['quarter', 'This quarter']];
const METRICS = [['visits', 'Visits', (v) => v], ['files', 'Files', (v) => v], ['disbursed', 'Disbursed', (v) => formatINR(v)]];
const MEDALS = ['🥇', '🥈', '🥉'];

export default function Leaderboard() {
  const [period, setPeriod] = useState('week');
  const [metric, setMetric] = useState('visits');
  const fmt = METRICS.find((m) => m[0] === metric)[2];

  const ranked = useMemo(() => [...data[period]].sort((a, b) => b[metric] - a[metric]), [period, metric]);
  const top3 = ranked.slice(0, 3);
  const podiumOrder = [top3[1], top3[0], top3[2]]; // 2nd, 1st, 3rd
  const me = ranked.findIndex((r) => r.isMe) + 1;

  return (
    <Page mode="slide">
      <TopBar back title="Leaderboard" subtitle={`You're #${me} of ${ranked.length} in Pune region`} />

      <div className={styles.seg}>
        {PERIODS.map(([k, l]) => (
          <button key={k} className={`${styles.segBtn} ${period === k ? styles.segOn : ''}`} onClick={() => setPeriod(k)}>
            {period === k && <motion.span layoutId="lb-period" className={styles.segPill} />}
            <span style={{ position: 'relative' }}>{l}</span>
          </button>
        ))}
      </div>

      <div className={styles.podiumWrap}>
        <AnimatePresence mode="wait">
          <motion.div key={period + metric} className={styles.podium} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {podiumOrder.map((p, i) => {
              const rank = i === 1 ? 1 : i === 0 ? 2 : 3;
              const h = rank === 1 ? 104 : rank === 2 ? 80 : 64;
              return (
                <div key={p.id} className={styles.podiumCol}>
                  <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.15 + i * 0.1, type: 'spring' }} className={styles.podiumPerson}>
                    <span className={styles.medal}>{MEDALS[rank - 1]}</span>
                    <Avatar name={p.name} size={rank === 1 ? 64 : 52} style={p.isMe ? { boxShadow: '0 0 0 3px var(--primary)' } : undefined} />
                    <div className={styles.podiumName}>{p.name.split(' ')[0]}{p.isMe ? ' (You)' : ''}</div>
                    <div className={styles.podiumVal}>{fmt(p[metric])}</div>
                  </motion.div>
                  <motion.div className={`${styles.block} ${styles[`block${rank}`]}`} initial={{ height: 0 }} animate={{ height: h }} transition={{ delay: 0.1 + i * 0.1, type: 'spring', stiffness: 200, damping: 22 }}>
                    <span>{rank}</span>
                  </motion.div>
                </div>
              );
            })}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className={styles.metricRow}>
        {METRICS.map(([k, l]) => (
          <button key={k} className={`${styles.chip} ${metric === k ? styles.chipOn : ''}`} onClick={() => setMetric(k)}>{l}</button>
        ))}
      </div>

      <motion.div className="stack" style={{ gap: 8 }} variants={listContainer} initial="initial" animate="animate" key={period + metric + 'list'}>
        {ranked.map((r, i) => (
          <motion.div key={r.id} variants={listItem} className={`${styles.row} ${r.isMe ? styles.rowMe : ''}`}>
            <span className={styles.rank}>{i + 1}</span>
            <Avatar name={r.name} size={40} />
            <div className="grow">
              <div style={{ fontWeight: 600 }} className="row">
                {r.name} {r.isMe && <span className={styles.youTag}>You</span>}
              </div>
              <div className="hint" style={{ color: r.isMe ? 'rgba(255,255,255,0.8)' : undefined }}>{r.branch}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 700 }}>{fmt(r[metric])}</div>
              <div className={r.change > 0 ? styles.up : r.change < 0 ? styles.down : styles.flat} style={r.isMe ? { color: '#fff' } : undefined}>
                {r.change > 0 ? <FiArrowUp size={12} /> : r.change < 0 ? <FiArrowDown size={12} /> : <FiMinus size={12} />} {Math.abs(r.change) || '–'}
              </div>
            </div>
          </motion.div>
        ))}
      </motion.div>
    </Page>
  );
}
