import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { FiChevronDown, FiZap, FiAward } from 'react-icons/fi';
import Page from '../../components/layout/Page';
import TopBar from '../../components/layout/TopBar';
import Card from '../../components/ui/Card';
import Avatar from '../../components/ui/Avatar';
import Button from '../../components/ui/Button';
import ProgressRing from '../../components/charts/ProgressRing';
import BarChart from '../../components/charts/BarChart';
import { ProgressBar } from '../../components/charts/MiniMetric';
import { fireConfetti } from '../../components/ui/SuccessCheck';
import { useAppState } from '../../context/AppStateContext';
import { formatINR } from '../../utils/formatters';
import styles from './incentive.module.css';

const SLABS = [
  { name: 'Bronze', min: 0, color: '#b45309', bg: 'linear-gradient(135deg,#f59e0b,#b45309)', payout: '0.20%' },
  { name: 'Silver', min: 20000000, color: '#64748b', bg: 'linear-gradient(135deg,#cbd5e1,#64748b)', payout: '0.30%' },
  { name: 'Gold', min: 40000000, color: '#ca8a04', bg: 'linear-gradient(135deg,#fde047,#ca8a04)', payout: '0.40%' },
  { name: 'Platinum', min: 80000000, color: '#4f46e5', bg: 'linear-gradient(135deg,#a5b4fc,#4f46e5)', payout: '0.50%' },
];
const MONTHLY = [
  { label: 'Apr', value: 6200 }, { label: 'May', value: 7100 }, { label: 'Jun', value: 5800 },
  { label: 'Jul', value: 8900 }, { label: 'Aug', value: 9400 }, { label: 'Sep', value: 8500 },
];
const RATES = [
  { product: 'Business Loan', dsa: '1.0%', officer: '0.20 – 0.50%', tat: '7–10 days' },
  { product: 'MSME Working Capital', dsa: '1.5%', officer: '0.25 – 0.55%', tat: '10–12 days' },
  { product: 'Loan Against Property', dsa: '2.0 – 3.0%', officer: '0.30 – 0.60%', tat: '15–20 days' },
  { product: 'Machinery Finance (Q4)', dsa: '1.5%', officer: '0.25%', tat: '12 days' },
];

export default function IncentiveTracker() {
  const navigate = useNavigate();
  const { dsas } = useAppState();
  const [ratesOpen, setRatesOpen] = useState(false);
  const [celebrate, setCelebrate] = useState(false);

  const quarterDisbursed = 15500000; // ₹1.55Cr — demo value
  const earned = 23400;
  const cur = SLABS.findLast((s) => quarterDisbursed >= s.min);
  const next = SLABS[SLABS.indexOf(cur) + 1];
  const progress = next ? Math.round(((quarterDisbursed - cur.min) / (next.min - cur.min)) * 100) : 100;
  const gap = next ? next.min - quarterDisbursed : 0;
  const bestDsa = [...dsas].sort((a, b) => b.approvalRate - a.approvalRate)[0];

  const showCelebration = () => { setCelebrate(true); fireConfetti(); };

  return (
    <Page mode="slide">
      <TopBar back title="Incentives" subtitle="Q3 · Jul – Sep 2026" />

      <Card className={styles.hero}>
        <ProgressRing value={progress} size={200} stroke={12} color={cur.color}>
          <div className="hero-number" style={{ fontSize: 36 }}>{progress}%</div>
          <div className="label">to {next?.name ?? 'max'}</div>
        </ProgressRing>
        <div className={styles.slabBadge} style={{ background: cur.bg }}><FiAward /> {cur.name} slab</div>
        <div className={styles.earned}>{formatINR(earned, { compact: false })}</div>
        <div className="label">earned this quarter · {formatINR(quarterDisbursed)} disbursed</div>
      </Card>

      {next && (
        <Card className="tint-primary" noChevron style={{ marginTop: 12 }}>
          <div className="hint" style={{ color: 'var(--primary)', fontWeight: 600, marginBottom: 2 }}>Next slab</div>
          <div className={styles.nextTitle}>{formatINR(gap)} more to {next.name}</div>
          <div className={styles.nextSub}>About {Math.ceil(gap / 1500000)} more files · payout rises to {next.payout}</div>
          <div style={{ marginTop: 14 }}><ProgressBar value={progress} height={6} /></div>
        </Card>
      )}

      <Card padding={16} style={{ marginTop: 12 }} onClick={() => navigate(`/dsas/${bestDsa.id}`)}>
        <div className="row" style={{ gap: 12 }}>
          <div className={styles.zap}><FiZap size={20} /></div>
          <div className="grow">
            <div style={{ fontWeight: 600 }}>Fastest path to {next?.name ?? 'the top'}</div>
            <div className="hint">Focus on <b>{bestDsa.name}</b> — highest approval rate ({bestDsa.approvalRate}%) means faster disbursement.</div>
          </div>
          <Avatar name={bestDsa.name} size={36} />
        </div>
      </Card>

      <div className="section-head"><h2 className="section-title">Monthly earnings</h2><span className="hint">Last 6 months</span></div>
      <Card>
        <BarChart data={MONTHLY} height={130} formatValue={(v) => `${(v / 1000).toFixed(1)}k`} />
      </Card>

      <div className="section-head"><h2 className="section-title">Slab ladder</h2></div>
      <Card padding={0}>
        {SLABS.map((s, i) => {
          const reached = quarterDisbursed >= s.min;
          return (
            <div key={s.name} className={styles.slabRow} style={{ borderBottom: i < SLABS.length - 1 ? '1px solid var(--border)' : 'none', opacity: reached ? 1 : 0.7 }}>
              <div className={styles.slabDot} style={{ background: s.bg }} />
              <div className="grow">
                <div style={{ fontWeight: 600 }}>{s.name} {s.name === cur.name && <span className={styles.you}>You</span>}</div>
                <div className="hint">{s.min === 0 ? 'Up to' : 'From'} {formatINR(s.min || 20000000)} disbursed · {s.payout} payout</div>
              </div>
              {reached && <span style={{ color: 'var(--success)', fontWeight: 700 }}>✓</span>}
            </div>
          );
        })}
      </Card>

      <Card padding={0} style={{ marginTop: 12 }}>
        <button className={styles.accHead} onClick={() => setRatesOpen((o) => !o)}>
          <span style={{ fontWeight: 600 }}>Commission rate reference</span>
          <motion.span animate={{ rotate: ratesOpen ? 180 : 0 }}><FiChevronDown size={20} /></motion.span>
        </button>
        <AnimatePresence>
          {ratesOpen && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>
              {RATES.map((r) => (
                <div key={r.product} className={styles.rateRow}>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{r.product}</div>
                  <div className={styles.rateGrid}>
                    <span><span className="hint">DSA</span><br /><b>{r.dsa}</b></span>
                    <span><span className="hint">Officer</span><br /><b>{r.officer}</b></span>
                    <span><span className="hint">TAT</span><br /><b>{r.tat}</b></span>
                  </div>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </Card>

      <Button variant="secondary" full style={{ marginTop: 24 }} onClick={showCelebration}>Preview slab celebration</Button>

      <AnimatePresence>
        {celebrate && (
          <motion.div className={styles.celebrate} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setCelebrate(false)}>
            <motion.div initial={{ scale: 0.5, rotate: -15 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 200, damping: 14 }} className={styles.medal} style={{ background: SLABS[1].bg }}>
              🥈
            </motion.div>
            <motion.h1 initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 }}>Silver unlocked!</motion.h1>
            <motion.p initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.45 }} className="text-2" style={{ maxWidth: 280, textAlign: 'center' }}>
              Congratulations Rajesh — your payout rate is now 0.30%. Gold is {formatINR(20000000)} away.
            </motion.p>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }} style={{ marginTop: 24, width: '100%', maxWidth: 280 }}>
              <Button full onClick={() => setCelebrate(false)}>Keep going</Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Page>
  );
}
