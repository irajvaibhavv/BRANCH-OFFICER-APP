import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiClock, FiChevronRight } from 'react-icons/fi';
import { IoPartlySunny } from 'react-icons/io5';
import Card, { MetricCard } from '../../components/common/Card';
import Avatar from '../../components/common/Avatar';
import { StatusBadge } from '../../components/common/Badge';
import ProgressRing from '../../components/charts/ProgressRing';
import { listContainer, listItem } from '../../components/navigation/Page';
import { useAppState } from '../../context/AppStateContext';
import { formatINR, pct } from '../../utils/formatters';
import news from '../../data/dummyNews.json';
import { fmtTime } from './Dashboard';
import styles from './DashboardDetailed.module.css';

/**
 * HOME — "Detailed" variant (the original layout). Kept alongside the focused version so
 * both can be shown side by side in reviews. Switch via the layout icon on Home or Profile.
 */
export default function DashboardDetailed() {
  const navigate = useNavigate();
  const { stats, todayVisits, getDsa, loanFiles } = useAppState();
  const targetPct = pct(stats.todayDone, stats.dailyTarget);
  const pendingDocs = loanFiles.reduce((n, f) => n + f.docs.filter(([, s]) => s !== 'done').length, 0);

  return (
    <motion.div className="stack" variants={listContainer} initial="initial" animate="animate">
      {/* Weather */}
      <motion.div variants={listItem}>
        <Card padding={16} className="grad-sky">
          <div className="row-between">
            <div className="row" style={{ gap: 12 }}>
              <IoPartlySunny size={36} color="#f59e0b" />
              <div>
                <div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1 }}>31°C</div>
                <div className="hint" style={{ color: 'var(--text-2)' }}>Partly cloudy · Pune</div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="hint" style={{ color: 'var(--text-2)' }}>Good day for field visits</div>
              <div className="hint" style={{ color: 'var(--text-2)' }}>Rain chance 10%</div>
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Daily target ring — hero */}
      <motion.div variants={listItem}>
        <Card className={styles.hero}>
          <div className={styles.heroInner}>
            <ProgressRing value={targetPct} size={124} stroke={8}>
              <div className={styles.heroNum}>{stats.todayDone}<span className={styles.of}>/{stats.dailyTarget}</span></div>
              <div className="hint" style={{ marginTop: 2 }}>visits today</div>
            </ProgressRing>
            <div className={styles.heroText}>
              <h3>{targetPct >= 100 ? 'Target done! 🎉' : `${stats.dailyTarget - stats.todayDone} more to go`}</h3>
              <p className="label">
                {targetPct >= 100 ? 'Every extra visit counts on the leaderboard.' : `You're at ${targetPct}% of today's target. Keep the streak alive.`}
              </p>
              <button className={styles.heroLink} onClick={() => navigate('/route')}>
                See today's route <FiChevronRight size={16} />
              </button>
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Quick stats */}
      <motion.div variants={listItem} className={styles.statsRow}>
        <MetricCard value={stats.filesSubmitted} label="Files submitted" onClick={() => navigate('/files')} />
        <MetricCard value={formatINR(stats.disbursed)} label="Disbursed" tone="success" onClick={() => navigate('/files')} />
        <MetricCard value={formatINR(stats.incentiveEarned)} label="Incentive" tone="primary" onClick={() => navigate('/incentive')} />
      </motion.div>

      {/* Today's schedule */}
      <motion.div variants={listItem}>
        <div className="section-head" style={{ marginTop: 12 }}>
          <h2 className="section-title">Today's schedule</h2>
          <button className="link" onClick={() => navigate('/route')}>View all</button>
        </div>
        <div className="stack">
          {todayVisits.length === 0 && (
            <Card padding={16} onClick={() => navigate('/scheduler')}>
              <div style={{ fontWeight: 600 }}>No visits planned today</div>
              <div className="hint">Tap to schedule a DSA meeting</div>
            </Card>
          )}
          {todayVisits.slice(0, 3).map((v) => {
            const dsa = getDsa(v.dsaId);
            const tone = v.status === 'completed' ? 'success' : v.status === 'missed' ? 'danger' : 'primary';
            return (
              <Card key={v.id} status={tone} padding={16} onClick={() => navigate(v.status === 'upcoming' ? `/visits/new?dsa=${v.dsaId}` : `/dsas/${v.dsaId}?tab=Meetings`)}>
                <div className="row" style={{ gap: 12 }}>
                  <Avatar name={dsa?.name} size={44} />
                  <div className="grow">
                    <div className="row-between">
                      <span style={{ fontWeight: 600 }} className="truncate">{dsa?.name}</span>
                      <StatusBadge status={v.status} soft />
                    </div>
                    <div className="hint row" style={{ gap: 6, marginTop: 2 }}>
                      <FiClock size={13} /> {fmtTime(v.time)} · {v.location}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </motion.div>

      {/* Pending tasks */}
      <motion.div variants={listItem}>
        <Card padding={16} onClick={() => navigate('/documents')}>
          <div className="row" style={{ gap: 12 }}>
            <div className={styles.taskIcon}>📌</div>
            <div className="grow">
              <div style={{ fontWeight: 600 }}>Pending tasks</div>
              <div className="hint">
                <b style={{ color: 'var(--warning)' }}>{pendingDocs} documents</b> pending · <b style={{ color: 'var(--danger)' }}>1 report</b> due today
              </div>
            </div>
          </div>
        </Card>
      </motion.div>

      {/* News ticker */}
      <motion.div variants={listItem}>
        <div className="section-head"><h2 className="section-title">What's new</h2></div>
        <div className="hscroll">
          {news.map((n) => (
            <div key={n.id} className={styles.newsChip}>
              <span>{n.emoji}</span>
              <span>{n.text}</span>
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}
