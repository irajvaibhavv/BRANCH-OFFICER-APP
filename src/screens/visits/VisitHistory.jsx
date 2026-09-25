import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiMapPin, FiPlus } from 'react-icons/fi';
import Page, { listContainer, listItem } from '../../components/layout/Page';
import TopBar from '../../components/layout/TopBar';
import Card, { MetricCard } from '../../components/ui/Card';
import Avatar from '../../components/ui/Avatar';
import { StatusBadge } from '../../components/ui/Badge';
import StarRating from '../../components/ui/StarRating';
import FAB from '../../components/ui/FAB';
import EmptyState from '../../components/ui/EmptyState';
import { useAppState } from '../../context/AppStateContext';
import { formatDate, toISODate, fmtTime } from '../../utils/formatters';
import styles from './visits.module.css';

const RANGES = ['This week', 'This month', 'All'];

/** Activity tab — every visit logged, grouped by day. */
export default function VisitHistory() {
  const navigate = useNavigate();
  const { visits, getDsa } = useAppState();
  const [range, setRange] = useState('This week');

  const filtered = useMemo(() => {
    const now = new Date(toISODate());
    const cutoff = new Date(now);
    if (range === 'This week') cutoff.setDate(now.getDate() - 7);
    if (range === 'This month') cutoff.setDate(1);
    return visits
      .filter((v) => v.status !== 'upcoming')
      .filter((v) => range === 'All' || new Date(v.date) >= cutoff)
      .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  }, [visits, range]);

  const groups = useMemo(() => {
    const g = {};
    filtered.forEach((v) => { (g[v.date] ??= []).push(v); });
    return Object.entries(g);
  }, [filtered]);

  const done = filtered.filter((v) => v.status === 'completed').length;
  const positive = filtered.filter((v) => v.outcome === 'positive').length;
  const missed = filtered.filter((v) => v.status === 'missed').length;

  return (
    <Page className="screen--fab">
      <TopBar title="Activity" subtitle="Your visit log" />
      <div className="hscroll" style={{ paddingBottom: 12 }}>
        {RANGES.map((r) => (
          <button key={r} onClick={() => setRange(r)} style={{
            flexShrink: 0, height: 38, padding: '0 16px', borderRadius: 999, fontWeight: 500, fontSize: 14,
            background: range === r ? 'var(--primary)' : 'var(--card)', color: range === r ? '#fff' : 'var(--text-2)',
            border: `1.5px solid ${range === r ? 'var(--primary)' : 'var(--border)'}`,
          }}>{r}</button>
        ))}
      </div>

      <div className={styles.summaryRow}>
        <MetricCard value={done} label="Visits done" tone="success" />
        <MetricCard value={positive} label="Positive" tone="primary" />
        <MetricCard value={missed} label="Missed" tone={missed ? 'danger' : undefined} />
      </div>

      {groups.length === 0 ? (
        <EmptyState emoji="📍" title="No visits in this period" subtitle="Log a visit and it shows up here." actionLabel="Log a visit" actionIcon={<FiPlus />} onAction={() => navigate('/visits/new')} />
      ) : (
        groups.map(([date, items]) => (
          <div key={date}>
            <div className={styles.dayHead}>{date === toISODate() ? 'Today' : formatDate(date, { weekday: 'short', day: 'numeric', month: 'short' })}</div>
            <motion.div className="stack" variants={listContainer} initial="initial" animate="animate">
              {items.map((v) => {
                const d = getDsa(v.dsaId);
                return (
                  <motion.div key={v.id} variants={listItem}>
                    <Card padding={16} status={v.status === 'completed' ? 'success' : 'danger'} onClick={() => navigate(`/dsas/${v.dsaId}?tab=Meetings`)}>
                      <div className="row" style={{ gap: 12 }}>
                        <Avatar name={d?.name} size={44} />
                        <div className="grow">
                          <div className="row-between">
                            <span style={{ fontWeight: 600 }} className="truncate">{d?.name}</span>
                            <StatusBadge status={v.outcome ?? v.status} soft />
                          </div>
                          <div className="hint row" style={{ gap: 4 }}><FiMapPin size={12} /> {fmtTime(v.time)} · {v.type}</div>
                          {v.notes && <p className="hint truncate" style={{ marginTop: 4, color: 'var(--text-2)' }}>{v.notes}</p>}
                          {v.rating && <div style={{ marginTop: 6 }}><StarRating value={v.rating} size={13} /></div>}
                        </div>
                      </div>
                    </Card>
                  </motion.div>
                );
              })}
            </motion.div>
          </div>
        ))
      )}
      <FAB onClick={() => navigate('/visits/new')} label="Log visit" icon={<FiMapPin size={20} />} />
    </Page>
  );
}
