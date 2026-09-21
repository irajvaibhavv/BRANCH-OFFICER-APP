import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { FiShare2, FiDownload } from 'react-icons/fi';
import Page from '../../components/layout/Page';
import TopBar from '../../components/layout/TopBar';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Avatar from '../../components/ui/Avatar';
import { Input } from '../../components/ui/Input';
import { ProgressBar } from '../../components/charts/MiniMetric';
import { useAppState } from '../../context/AppStateContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../hooks/useToast';
import { toISODate, formatDate, formatINR } from '../../utils/formatters';
import styles from './reports.module.css';

export default function ReportGenerator() {
  const { visits, loanFiles, getDsa, dsas } = useAppState();
  const { officer } = useAuth();
  const { toast } = useToast();
  const [mode, setMode] = useState('daily');
  const [date, setDate] = useState(toISODate());

  const r = useMemo(() => {
    const end = new Date(date);
    const start = new Date(date);
    if (mode === 'weekly') start.setDate(end.getDate() - 6);
    const s = toISODate(start), e = toISODate(end);
    const inRange = (d) => d >= s && d <= e;
    const vs = visits.filter((v) => inRange(v.date));
    const done = vs.filter((v) => v.status === 'completed');
    const files = loanFiles.filter((f) => f.timeline.some(([d, st]) => inRange(d) && st === 'submitted'));
    const byDsa = {};
    done.forEach((v) => { byDsa[v.dsaId] = (byDsa[v.dsaId] ?? 0) + 1; });
    const metIds = Object.keys(byDsa);
    const top = dsas.filter((d) => files.some((f) => f.dsaId === d.id)).sort((a, b) => files.filter((f) => f.dsaId === b.id).length - files.filter((f) => f.dsaId === a.id).length)[0] ?? dsas[0];
    const statusBreak = files.reduce((a, f) => ({ ...a, [f.status]: (a[f.status] ?? 0) + 1 }), {});
    return {
      period: mode === 'daily' ? formatDate(date, { weekday: 'long', day: 'numeric', month: 'long' }) : `${formatDate(s)} – ${formatDate(e, { day: 'numeric', month: 'short', year: 'numeric' })}`,
      planned: vs.length, done: done.length, metIds, files, statusBreak,
      incentive: done.length * 250 + files.length * 900,
      top,
    };
  }, [mode, date, visits, loanFiles, dsas]);

  const asText = () =>
    [`📋 ${mode === 'daily' ? 'Daily' : 'Weekly'} Report — ${officer.name}`, r.period, '',
      `Visits: ${r.done}/${r.planned} completed`,
      `DSAs met: ${r.metIds.map((id) => getDsa(id)?.name).join(', ') || '—'}`,
      `Files submitted: ${r.files.length}`,
      `Incentive earned: ₹${r.incentive.toLocaleString('en-IN')}`,
      `Top DSA: ${r.top?.name}`].join('\n');

  const share = async () => {
    const text = asText();
    try {
      if (navigator.share) { await navigator.share({ title: 'BO report', text }); return; }
      await navigator.clipboard.writeText(text);
      toast('Report copied to clipboard', 'success');
    } catch { toast('Report copied to clipboard', 'success'); }
  };

  return (
    <Page mode="slide">
      <TopBar back title="Reports" subtitle="Generate & share in seconds" />

      <div className={styles.seg}>
        {['daily', 'weekly'].map((m) => (
          <button key={m} className={`${styles.segBtn} ${mode === m ? styles.segOn : ''}`} onClick={() => setMode(m)}>
            {mode === m && <motion.span layoutId="rep-seg" className={styles.segPill} />}
            <span style={{ position: 'relative' }}>{m[0].toUpperCase() + m.slice(1)}</span>
          </button>
        ))}
      </div>
      <div style={{ margin: '16px 0' }}>
        <Input label={mode === 'daily' ? 'Date' : 'Week ending'} type="date" value={date} max={toISODate()} onChange={(e) => setDate(e.target.value)} />
      </div>

      <motion.div key={mode + date} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <Card padding={0} className={styles.report}>
          <div className={styles.reportHead}>
            <div className="hint" style={{ color: 'rgba(255,255,255,0.8)' }}>{mode === 'daily' ? 'Daily' : 'Weekly'} report</div>
            <h2 style={{ color: '#fff' }}>{r.period}</h2>
            <div className="hint" style={{ color: 'rgba(255,255,255,0.8)', marginTop: 4 }}>{officer.name} · {officer.branch}</div>
          </div>
          <div className={styles.body}>
            <div className={styles.kpis}>
              <div><b>{r.done}<span className={styles.of}>/{r.planned}</span></b><span>visits</span></div>
              <div><b>{r.files.length}</b><span>files</span></div>
              <div><b>{formatINR(r.incentive, { compact: false })}</b><span>incentive</span></div>
            </div>

            <Section title="DSAs met">
              {r.metIds.length === 0 ? <span className="hint">No visits completed in this period</span> : (
                <div className={styles.avatars}>
                  {r.metIds.map((id) => <div key={id} className={styles.avChip}><Avatar name={getDsa(id)?.name} size={24} /> {getDsa(id)?.name.split(' ')[0]}</div>)}
                </div>
              )}
            </Section>
            <Section title="Files submitted">
              {r.files.length === 0 ? <span className="hint">None in this period</span> : (
                <div className={styles.breakdown}>
                  {Object.entries(r.statusBreak).map(([s, n]) => <span key={s}><b>{n}</b> {s}</span>)}
                </div>
              )}
            </Section>
            <Section title="Slab progress">
              <ProgressBar value={78} height={6} />
              <div className="hint" style={{ marginTop: 6 }}>Bronze → Silver · 78% · ₹45,000 to go</div>
            </Section>
            <Section title="Top performing DSA" last>
              <div className="row" style={{ gap: 10 }}>
                <Avatar name={r.top?.name} size={36} />
                <div><div style={{ fontWeight: 600 }}>{r.top?.name}</div><div className="hint">{r.top?.approvalRate}% approval · {formatINR(r.top?.disbursed)} disbursed</div></div>
              </div>
            </Section>
          </div>
        </Card>
      </motion.div>

      <div className={styles.actions}>
        <Button full icon={<FiShare2 />} onClick={share}>Share</Button>
        <Button full variant="secondary" icon={<FiDownload />} onClick={() => toast('PDF export will be available in the production build', 'info')}>Download as PDF</Button>
      </div>
    </Page>
  );
}

function Section({ title, children, last }) {
  return (
    <div className={styles.section} style={last ? { borderBottom: 'none' } : undefined}>
      <div className="label" style={{ marginBottom: 6 }}>{title}</div>
      {children}
    </div>
  );
}
