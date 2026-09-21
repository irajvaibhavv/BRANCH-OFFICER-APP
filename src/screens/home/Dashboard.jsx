import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { IoPartlySunny, IoSparkles } from 'react-icons/io5';
import { FiMic, FiMapPin, FiUserPlus, FiFileText, FiNavigation, FiChevronRight, FiAlertCircle, FiClock, FiLayout, FiZap, FiUsers, FiUser, FiHome } from 'react-icons/fi';
import Page, { listContainer, listItem } from '../../components/layout/Page';
import TopBar from '../../components/layout/TopBar';
import Card, { MetricCard } from '../../components/ui/Card';
import Avatar from '../../components/ui/Avatar';
import Button from '../../components/ui/Button';
import FAB from '../../components/ui/FAB';
import BottomSheet from '../../components/ui/BottomSheet';
import ProgressRing from '../../components/charts/ProgressRing';
import { ProgressBar } from '../../components/charts/MiniMetric';
import { Skeleton } from '../../components/ui/Skeleton';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { useToast } from '../../hooks/useToast';
import DashboardDetailed from './DashboardDetailed';
import PlanChooser from '../planning/PlanChooser';
import { useAuth } from '../../context/AuthContext';
import { useAppState } from '../../context/AppStateContext';
import { getGreeting } from '../../utils/greetings';
import { formatINR, formatDate, pct, toISODate } from '../../utils/formatters';
import news from '../../data/mock/news.json';
import styles from './Dashboard.module.css';

let loadedOnce = false;

const QUICK_ACTIONS = [
  { label: 'Plan My Day', desc: 'DSAs · customers · branch', icon: FiZap, to: 'plan', tone: '#f59e0b' },
  { label: 'SMFG AI', desc: 'Hand over · AI interviews', icon: IoSparkles, to: '/ai', tone: '#7c3aed' },
  { label: 'Record Meeting', desc: 'Transcript + AI summary', icon: FiMic, to: '/record', tone: '#dc2626' },
  { label: 'Log Visit', desc: 'Geo-tag, photo & notes', icon: FiMapPin, to: '/visits/new', tone: '#4c1d95' },
  { label: 'Add DSA', desc: 'Onboard a new partner', icon: FiUserPlus, to: '/dsas/new', tone: '#7c3aed' },
  { label: 'Generate Report', desc: 'Daily / weekly summary', icon: FiFileText, to: '/reports', tone: '#16a34a' },
];

/**
 * HOME — deliberately minimal. Answers three questions, in order:
 *   1. What do I do next?       → "Up next" visit card with one-tap actions
 *   2. How am I doing today?    → target ring + incentive progress, one row each
 *   3. What needs my attention? → at most 2 alerts
 * Everything else (stats, full schedule, news) lives on Activity / Route / Notifications.
 */
export default function Dashboard() {
  const navigate = useNavigate();
  const { officer } = useAuth();
  const { stats, todayVisits, getDsa, loanFiles, dsas, dayPlan } = useAppState();
  const today = toISODate();
  const planned = dayPlan?.date === today ? dayPlan : null; // today's plan, if the officer has made one
  const [chooser, setChooser] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [loading, setLoading] = useState(!loadedOnce);
  // 'focused' (default) | 'detailed' — both layouts kept for review; toggle from the top bar or Profile
  const [layout, setLayout] = useLocalStorage('bo_home_layout', 'focused');
  const { toast } = useToast();

  useEffect(() => {
    if (loadedOnce) return;
    const t = setTimeout(() => { loadedOnce = true; setLoading(false); }, 600);
    return () => clearTimeout(t);
  }, []);

  const g = getGreeting();
  const targetPct = pct(stats.todayDone, stats.dailyTarget);
  const nextVisit = todayVisits.find((v) => v.status === 'upcoming');
  const nextDsa = nextVisit ? getDsa(nextVisit.dsaId) : null;
  const remaining = todayVisits.filter((v) => v.status === 'upcoming').length;
  const left = stats.dailyTarget - stats.todayDone;

  // Alerts: only what needs action, capped at 2
  const pendingDocs = loanFiles.reduce((n, f) => n + f.docs.filter(([, s]) => s !== 'done').length, 0);
  const filesNeedingDocs = loanFiles.filter((f) => f.docs.some(([, s]) => s !== 'done')).length;
  const quietDsa = dsas.find((d) => d.quality === 'low' && d.lastVisit && (Date.now() - new Date(d.lastVisit)) / 86400000 > 14);
  const alerts = [
    pendingDocs > 0 && { key: 'docs', text: `${pendingDocs} documents pending across ${filesNeedingDocs} files`, to: '/documents' },
    quietDsa && { key: 'quiet', text: `${quietDsa.name} hasn't submitted in ${Math.floor((Date.now() - new Date(quietDsa.lastVisit)) / 86400000)} days`, to: `/dsas/${quietDsa.id}` },
  ].filter(Boolean).slice(0, 2);

  return (
    <Page className="screen--fab">
      <TopBar
        title={<span className={styles.greet}>{g.text}, {officer.name.split(' ')[0]}</span>}
        subtitle={
          <span className={styles.meta}>
            {formatDate(new Date(), { weekday: 'long', day: 'numeric', month: 'short' })} · Pune Branch
          </span>
        }
        right={
          <button
            className={styles.layoutBtn}
            aria-label="Switch home layout"
            onClick={() => {
              const next = layout === 'focused' ? 'detailed' : 'focused';
              setLayout(next);
              toast(next === 'focused' ? 'Focused home' : 'Detailed home', 'info', 1200);
            }}
          >
            <FiLayout size={18} />
          </button>
        }
      />

      {loading ? (
        <div className="stack">
          <Skeleton h={220} r={16} />
          <Skeleton h={96} r={16} />
          <Skeleton h={96} r={16} />
        </div>
      ) : layout === 'detailed' ? (
        <DashboardDetailed />
      ) : (
        <motion.div className={`stack ${styles.homeStack}`} variants={listContainer} initial="initial" animate="animate">
          {/* 0. Weather — one line: now + how the day will go */}
          <motion.div variants={listItem}>
            <div className={styles.weather}>
              <IoPartlySunny size={18} color="#f59e0b" />
              <span className={styles.weatherNow}><b>31°</b> Partly cloudy</span>
              <span className={styles.weatherSep} />
              <span className={styles.weatherNext}>Sunny till 4 PM · light rain by evening</span>
            </div>
          </motion.div>

          {/* 1. Plan your day — DSAs / customers / branch. Slim strip once planned. */}
          <motion.div variants={listItem}>
            {planned ? (
              <button className={styles.planStrip} onClick={() => setChooser(true)}>
                <span className="icon-tile" style={{ '--tile': planned.mode === 'customer' ? '#0f766e' : planned.mode === 'branch' ? '#d97706' : '#4c1d95', width: 30, height: 30, borderRadius: 9 }}>
                  {planned.mode === 'customer' ? <FiUser size={14} /> : planned.mode === 'branch' ? <FiHome size={14} /> : <FiUsers size={14} />}
                </span>
                <span className="grow truncate" style={{ textAlign: 'left' }}>
                  <b>Today:</b> {planned.mode === 'customer' ? `${planned.stops.length} customer meeting${planned.stops.length === 1 ? '' : 's'}` : planned.mode === 'branch' ? 'Working from branch' : `${planned.stops.length} DSA visit${planned.stops.length === 1 ? '' : 's'}`}
                </span>
                <span className={styles.planChange}>Change</span>
              </button>
            ) : (
              <Card className={styles.planCard} noChevron onClick={() => setChooser(true)}>
                <div className="row" style={{ gap: 12 }}>
                  <span className="icon-tile" style={{ '--tile': '#f59e0b', width: 44, height: 44, borderRadius: 14, flexShrink: 0 }}><FiZap size={20} /></span>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className={styles.nextName}>Plan your day</div>
                    <div className="hint">Visit DSAs · Meet customers · Work from branch</div>
                  </div>
                  <FiChevronRight size={20} color="var(--primary)" />
                </div>
              </Card>
            )}
          </motion.div>

          {/* 2. Up next — only once the day is planned; before that the Plan card is the hero */}
          {planned && (
          <motion.div variants={listItem}>
            {planned.mode === 'branch' && !nextVisit ? (
              <Card className={styles.next} noChevron onClick={() => navigate('/plan/branch')}>
                <div className={styles.nextLabel}><FiHome size={13} /> Branch day</div>
                <div className={styles.nextName} style={{ marginTop: 6 }}>Your desk tasks for today</div>
                <div className="label">Documents to chase, files to follow up, calls to make.</div>
              </Card>
            ) : nextVisit ? (
              <Card className={styles.next} noChevron>
                <div className={styles.nextLabel}><FiClock size={13} /> Up next · {fmtTime(nextVisit.time)}</div>
                <div className="row" style={{ gap: 12, marginTop: 8 }}>
                  <Avatar name={nextDsa?.name} size={44} />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className={styles.nextName}>{nextDsa?.name}</div>
                    <div className="hint clamp2">{nextDsa?.firm} · {nextDsa?.location} · {nextDsa?.distanceKm} km</div>
                  </div>
                </div>
                <div className={styles.nextActions}>
                  <Button size="sm" style={{ flex: 1, minWidth: 0, padding: '0 10px' }} icon={<FiMapPin size={16} />} onClick={() => navigate(`/visits/new?dsa=${nextVisit.dsaId}`)}>Log visit</Button>
                  <Button size="sm" style={{ flex: 1, minWidth: 0, padding: '0 10px' }} variant="secondary" icon={<FiNavigation size={16} />} onClick={() => navigate('/route')}>Navigate</Button>
                  {nextDsa?.isCustomer
                    ? <Button size="sm" variant="secondary" style={{ width: 40, padding: 0, flexShrink: 0, gap: 0 }} icon={<FiUser size={18} />} aria-label="Customer prep" title="Questions & loan calculator" onClick={() => navigate(`/customers/${nextVisit.dsaId}`)} />
                    : <Button size="sm" variant="secondary" style={{ width: 40, padding: 0, flexShrink: 0, color: 'var(--danger)', gap: 0 }} icon={<FiMic size={18} />} aria-label="Record meeting" title="Record meeting" onClick={() => navigate(`/record?dsa=${nextVisit.dsaId}`)} />}
                </div>
                {remaining > 1 && (
                  <button className={styles.moreLink} onClick={() => navigate('/route')}>
                    {remaining - 1} more visit{remaining > 2 ? 's' : ''} after this <FiChevronRight size={14} />
                  </button>
                )}
              </Card>
            ) : (
              <Card className={styles.next} noChevron>
                <div className={styles.nextLabel}>Today</div>
                <div className={styles.nextName} style={{ marginTop: 6 }}>{left <= 0 ? 'Target done — nice work' : 'No visits left on your plan'}</div>
                <div className="label">{left <= 0 ? 'Every extra visit still counts on the leaderboard.' : 'Add a walk-in visit or schedule one for later.'}</div>
                <div className={styles.nextActions}>
                  <Button style={{ flex: 1 }} icon={<FiMapPin size={18} />} onClick={() => navigate('/visits/new')}>Log a visit</Button>
                  <Button style={{ flex: 1 }} variant="secondary" onClick={() => navigate('/scheduler')}>Schedule</Button>
                </div>
              </Card>
            )}
          </motion.div>
          )}

          {/* 3. How am I doing — stats + two compact rows */}
          <motion.div variants={listItem} className={styles.statsRow}>
            <MetricCard value={stats.filesSubmitted} label="Files submitted" onClick={() => navigate('/files')} />
            <MetricCard value={formatINR(stats.disbursed)} label="Disbursed" tone="success" onClick={() => navigate('/files')} />
            <MetricCard value={formatINR(stats.incentiveEarned)} label="Incentive" tone="primary" onClick={() => navigate('/incentive')} />
          </motion.div>

          {planned && planned.mode !== 'branch' && (
            <motion.div variants={listItem}>
            <Card padding={16} onClick={() => navigate('/route')}>
              <div className="row" style={{ gap: 16 }}>
                <ProgressRing value={targetPct} size={64} stroke={6}>
                  <span style={{ fontWeight: 700, fontSize: 15 }}>{stats.todayDone}/{stats.dailyTarget}</span>
                </ProgressRing>
                <div className="grow">
                  <div style={{ fontWeight: 600 }}>{left <= 0 ? 'Daily target met' : `${left} more visit${left === 1 ? '' : 's'} to today's target`}</div>
                  <div className="hint">{stats.todayDone} done · {remaining} still planned · tap for today's plan</div>
                </div>
              </div>
            </Card>
          </motion.div>
          )}

          <motion.div variants={listItem}>
            <Card padding={16} onClick={() => navigate('/incentive')}>
              <div className="row-between" style={{ marginBottom: 8 }}>
                <div style={{ fontWeight: 600 }}>{formatINR(45000, { compact: false })} more to Silver slab</div>
                <span className="hint" style={{ fontWeight: 600, color: 'var(--primary)' }}>78%</span>
              </div>
              <ProgressBar value={78} height={6} />
              <div className="hint" style={{ marginTop: 6 }}>≈ 3 more loan files · {formatINR(stats.incentiveEarned, { compact: false })} earned this month</div>
            </Card>
          </motion.div>

          {/* 4. Needs attention */}
          {alerts.length > 0 && (
            <motion.div variants={listItem}>
              <div className="section-head" style={{ marginTop: 16, marginBottom: 12 }}>
                <h2 className="section-title" style={{ fontSize: 17 }}>Needs attention</h2>
                <button className="link" onClick={() => navigate('/notifications')}>All</button>
              </div>
              <div className="stack" style={{ gap: 8 }}>
                {alerts.map((a) => (
                  <Card key={a.key} padding={14} status="warning" onClick={() => navigate(a.to)}>
                    <div className="row" style={{ gap: 10 }}>
                      <FiAlertCircle size={18} color="var(--warning)" />
                      <span style={{ fontSize: 15 }}>{a.text}</span>
                    </div>
                  </Card>
                ))}
              </div>
            </motion.div>
          )}

          {/* 5. What's new — marquee ticker */}
          <motion.div variants={listItem}>
            <div className="section-head" style={{ marginTop: 16, marginBottom: 12 }}><h2 className="section-title" style={{ fontSize: 17 }}>What's new</h2></div>
            <div className={styles.marquee} onClick={() => navigate('/notifications')}>
              <div className={styles.marqueeTrack}>
                {[...news, ...news].map((n, i) => (
                  <span key={`${n.id}-${i}`} className={styles.marqueeItem}><span>{n.emoji}</span> {n.text}</span>
                ))}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}

      <FAB onClick={() => setSheet(true)} />
      <PlanChooser open={chooser} onClose={() => setChooser(false)} />
      <BottomSheet open={sheet} onClose={() => setSheet(false)} title="Quick actions">
        <div className="stack">
          {QUICK_ACTIONS.map((a) => (
            <Card key={a.label} padding={16} onClick={() => { setSheet(false); if (a.to === 'plan') setChooser(true); else navigate(a.to); }}>
              <div className="row" style={{ gap: 14 }}>
                <div className={`icon-tile ${styles.qaIcon}`} style={{ '--tile': a.tone }}><a.icon size={22} /></div>
                <div>
                  <div style={{ fontWeight: 600 }}>{a.label}</div>
                  <div className="hint">{a.desc}</div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </BottomSheet>
    </Page>
  );
}

export function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
}
