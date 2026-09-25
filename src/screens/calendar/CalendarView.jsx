import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import Page from '../../components/layout/Page';
import TopBar from '../../components/layout/TopBar';
import Card from '../../components/ui/Card';
import Avatar from '../../components/ui/Avatar';
import { StatusBadge } from '../../components/ui/Badge';
import { ProgressBar } from '../../components/charts/MiniMetric';
import { useAppState } from '../../context/AppStateContext';
import { toISODate, formatDate, fmtTime } from '../../utils/formatters';
import styles from './calendar.module.css';

const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export default function CalendarView() {
  const navigate = useNavigate();
  const { visits, loanFiles, getDsa, stats } = useAppState();
  const today = toISODate();
  const [cursor, setCursor] = useState(new Date(today.slice(0, 7) + '-01'));
  const [sel, setSel] = useState(today);
  const [view, setView] = useState('month');

  // Per-day rollup
  const days = useMemo(() => {
    const m = {};
    visits.forEach((v) => { (m[v.date] ??= { done: 0, sched: 0, missed: 0 }); if (v.status === 'completed') m[v.date].done++; else if (v.status === 'missed') m[v.date].missed++; else m[v.date].sched++; });
    return m;
  }, [visits]);

  const dotFor = (iso) => {
    const d = days[iso];
    if (!d) return null;
    if (iso > today) return d.sched ? 'sched' : null;
    if (d.done >= stats.dailyTarget) return 'met';
    if (iso === today) return d.sched ? 'sched' : d.done ? 'partial' : null;
    return d.done ? 'missed' : d.missed ? 'missed' : null;
  };

  // Grid
  const y = cursor.getFullYear(), mo = cursor.getMonth();
  const first = new Date(y, mo, 1);
  const startPad = (first.getDay() + 6) % 7; // Monday-first
  const dim = new Date(y, mo + 1, 0).getDate();
  const cells = [...Array(startPad).fill(null), ...Array.from({ length: dim }, (_, i) => toISODate(new Date(y, mo, i + 1)))];

  // Week view: 7 days around selected
  const selDate = new Date(sel);
  const weekStart = new Date(selDate); weekStart.setDate(selDate.getDate() - ((selDate.getDay() + 6) % 7));
  const week = Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart); d.setDate(weekStart.getDate() + i); return toISODate(d); });

  const dayVisits = visits.filter((v) => v.date === sel).sort((a, b) => a.time.localeCompare(b.time));
  const dayFiles = loanFiles.filter((f) => f.timeline.some(([d, s]) => d === sel && s === 'submitted'));
  const done = dayVisits.filter((v) => v.status === 'completed').length;

  const shift = (n) => setCursor(new Date(y, mo + n, 1));

  return (
    <Page mode="slide">
      <TopBar back title="Calendar" right={
        <div className={styles.seg}>
          {['month', 'week'].map((v) => <button key={v} className={`${styles.segBtn} ${view === v ? styles.segOn : ''}`} onClick={() => setView(v)}>{v[0].toUpperCase() + v.slice(1)}</button>)}
        </div>
      } />

      <Card padding={16}>
        {view === 'month' ? (
          <>
            <div className="row-between" style={{ marginBottom: 12 }}>
              <button className={styles.nav} onClick={() => shift(-1)} aria-label="Previous month"><FiChevronLeft size={22} /></button>
              <h3>{cursor.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</h3>
              <button className={styles.nav} onClick={() => shift(1)} aria-label="Next month"><FiChevronRight size={22} /></button>
            </div>
            <div className={styles.grid}>
              {DOW.map((d, i) => <span key={i} className={styles.dow}>{d}</span>)}
              {cells.map((iso, i) => iso ? (
                <button key={iso} className={`${styles.cell} ${sel === iso ? styles.cellSel : ''} ${iso === today ? styles.cellToday : ''}`} onClick={() => setSel(iso)}>
                  <span>{Number(iso.slice(-2))}</span>
                  <i className={`${styles.dot} ${styles[dotFor(iso) ?? 'none']}`} />
                </button>
              ) : <span key={`p${i}`} />)}
            </div>
          </>
        ) : (
          <div className={styles.weekRow}>
            {week.map((iso) => (
              <button key={iso} className={`${styles.weekCell} ${sel === iso ? styles.cellSel : ''} ${iso === today ? styles.cellToday : ''}`} onClick={() => setSel(iso)}>
                <span className="hint">{formatDate(iso, { weekday: 'short' })}</span>
                <b>{Number(iso.slice(-2))}</b>
                <i className={`${styles.dot} ${styles[dotFor(iso) ?? 'none']}`} />
              </button>
            ))}
          </div>
        )}
        <div className={styles.legend}>
          <span><i className={`${styles.dot} ${styles.met}`} /> target met</span>
          <span><i className={`${styles.dot} ${styles.missed}`} /> missed</span>
          <span><i className={`${styles.dot} ${styles.sched}`} /> scheduled</span>
          <span><i className={`${styles.dot} ${styles.partial}`} /> in progress</span>
        </div>
      </Card>

      <AnimatePresence mode="wait">
        <motion.div key={sel} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
          <div className="section-head">
            <h2 className="section-title">{sel === today ? 'Today' : formatDate(sel, { weekday: 'long', day: 'numeric', month: 'short' })}</h2>
          </div>
          <Card padding={16}>
            <div className="row-between" style={{ marginBottom: 8 }}>
              <span style={{ fontWeight: 600 }}>Daily target</span>
              <span className="label">{done} / {stats.dailyTarget} visits</span>
            </div>
            <ProgressBar value={(done / stats.dailyTarget) * 100} color={done >= stats.dailyTarget ? 'var(--success)' : 'var(--primary)'} />
            <div className={styles.miniStats}>
              <span><b>{dayVisits.length}</b> visits</span>
              <span><b>{dayFiles.length}</b> files</span>
            </div>
          </Card>

          {dayVisits.length === 0 ? (
            <p className="hint" style={{ textAlign: 'center', padding: 24 }}>No visits on this day</p>
          ) : (
            <div className="stack" style={{ marginTop: 12 }}>
              {dayVisits.map((v) => (
                <Card key={v.id} padding={14} status={v.status === 'completed' ? 'success' : v.status === 'missed' ? 'danger' : 'primary'} onClick={() => navigate(v.status === 'upcoming' ? `/visits/new?dsa=${v.dsaId}` : `/dsas/${v.dsaId}?tab=Meetings`)}>
                  <div className="row" style={{ gap: 12 }}>
                    <Avatar name={getDsa(v.dsaId)?.name} size={40} />
                    <div className="grow">
                      <div style={{ fontWeight: 600 }}>{getDsa(v.dsaId)?.name}</div>
                      <div className="hint">{fmtTime(v.time)} · {v.type}</div>
                    </div>
                    <StatusBadge status={v.status} soft />
                  </div>
                </Card>
              ))}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </Page>
  );
}
