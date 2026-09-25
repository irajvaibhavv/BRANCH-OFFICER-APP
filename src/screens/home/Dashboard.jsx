import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { IoSparkles } from 'react-icons/io5';
import { FiMic, FiMapPin, FiUserPlus, FiFileText, FiNavigation, FiChevronRight, FiClock, FiEdit2, FiXCircle, FiFlag, FiCheckSquare, FiCheck, FiLayout, FiZap, FiUser, FiHome } from 'react-icons/fi';
import Page, { listContainer, listItem } from '../../components/layout/Page';
import TopBar from '../../components/layout/TopBar';
import Card from '../../components/ui/Card';
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
import PlanChooser from '../../components/planning/PlanChooser';
import { useAuth } from '../../context/AuthContext';
import { useAppState } from '../../context/AppStateContext';
import { getGreeting } from '../../utils/greetings';
import { formatINR, formatDate, pct, toISODate, fmtTime } from '../../utils/formatters';
import { weatherAt } from '../../services/weather';
import { pendingItems } from '../../utils/pending';
import news from '../../data/mock/news.json';
import styles from './Dashboard.module.css';

let loadedOnce = false;

const QUICK_ACTIONS = [
  { label: 'Plan My Day', desc: 'DSAs · customers · branch', icon: FiZap, to: 'plan', tone: '#f59e0b' },
  { label: 'SAARTHI AI', desc: 'Hand over · AI interviews', icon: IoSparkles, to: '/ai', tone: '#7c3aed' },
  { label: 'Record Meeting', desc: 'Transcript + AI summary', icon: FiMic, to: '/record', tone: '#dc2626' },
  { label: 'Log Visit', desc: 'Geo-tag, photo & notes', icon: FiMapPin, to: '/visits/new', tone: '#4c1d95' },
  { label: 'Add DSA', desc: 'Onboard a new partner', icon: FiUserPlus, to: '/dsas/new', tone: '#7c3aed' },
  { label: 'Generate Report', desc: 'Daily / weekly summary', icon: FiFileText, to: '/reports', tone: '#16a34a' },
];

// Home answers two things: what next (up-next visit) and how am I doing (target + incentive).
export default function Dashboard() {
  const navigate = useNavigate();
  const { officer } = useAuth();
  const { stats, todayVisits, visits, getDsa, dayPlan, dsas, recordings } = useAppState();
  const [doneTodos, setDoneTodos] = useLocalStorage('bo_todo_done', {});
  const tickTodo = (recId, i) => { setDoneTodos((m) => ({ ...m, [recId]: [...(m[recId] ?? []), i] })); toast('Done', 'success', 1200); };
  const today = toISODate();
  const planned = dayPlan?.date === today ? dayPlan : null; // today's plan, if the officer has made one
  const [chooser, setChooser] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [slabOpen, setSlabOpen] = useState(false); // slab progress hidden until the incentive widget is tapped
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
  // Pending = carried-over items (missed visits, flagged follow-ups, your to-dos due now)
  const pending = useMemo(() => pendingItems({ visits, recordings, dsas, today, doneTodos }), [visits, recordings, dsas, today, doneTodos]);
  const targetPct = pct(stats.todayDone, stats.dailyTarget);
  const nextVisit = todayVisits.find((v) => v.status === 'upcoming');
  const nextDsa = nextVisit ? getDsa(nextVisit.dsaId) : null;
  const wx = nextDsa ? weatherAt(nextDsa.location, nextVisit.time) : null;
  const remaining = todayVisits.filter((v) => v.status === 'upcoming').length;
  const left = stats.dailyTarget - stats.todayDone;

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
          {/* 1. What's new — marquee ticker */}
          <motion.div variants={listItem}>
            <div className="section-head" style={{ marginTop: 0, marginBottom: 12 }}><h2 className="section-title" style={{ fontSize: 17 }}>What's new</h2></div>
            <div className={styles.marquee} onClick={() => navigate('/notifications')}>
              <div className={styles.marqueeTrack}>
                {[...news, ...news].map((n, i) => (
                  <span key={`${n.id}-${i}`} className={styles.marqueeItem}><span>{n.emoji}</span> {n.text}</span>
                ))}
              </div>
            </div>
          </motion.div>
          {/* 2. Plan your day — hero until the day is planned; after that, change it from the + button */}
          {!planned && (
          <motion.div variants={listItem}>
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
          </motion.div>
          )}

          {/* 3. Up next — only once the day is planned. Weather is for this stop's area at visit time, so it moves with the officer. */}
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
                <div className="row-between" style={{ gap: 8 }}>
                  <span className={styles.nextLabel}><FiClock size={13} /> Up next · {fmtTime(nextVisit.time)}</span>
                  {wx && (
                    <span className={styles.wx} title={`${wx.label} in ${wx.area} around ${fmtTime(nextVisit.time)}`}>
                      <wx.icon size={16} color={wx.color} /> <b>{wx.temp}°</b> {wx.label}
                    </span>
                  )}
                </div>
                {/* Progress ring wraps the avatar: the day's target and the next person in one glance. Tap → route. */}
                <div className="row" style={{ gap: 14, marginTop: 10 }}>
                  <button className={styles.ringBtn} onClick={() => navigate('/route')} aria-label="Today's plan">
                    <ProgressRing value={targetPct} size={96} stroke={4}>
                      <Avatar name={nextDsa?.name} size={84} />
                    </ProgressRing>
                    <span className={styles.ringCount}>{stats.todayDone}/{stats.dailyTarget}</span>
                  </button>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className={styles.nextName}>{nextDsa?.name}</div>
                    <div className="hint clamp2">{nextDsa?.firm} · {nextDsa?.location} · {nextDsa?.distanceKm} km</div>
                    <div className={styles.targetLine}>{left <= 0 ? 'Daily target met' : `${left} more to today's target`}</div>
                  </div>
                </div>
                {wx?.tip && <div className={styles.wxTip}><wx.icon size={13} color={wx.color} /> {wx.label} in {wx.area} around then · {wx.tip}</div>}
                <div className={styles.nextActions}>
                  <Button size="sm" style={{ flex: 1, minWidth: 0, padding: '0 10px' }} icon={<FiMapPin size={16} />} onClick={() => navigate(`/visits/new?dsa=${nextVisit.dsaId}`)}>Log visit</Button>
                  <Button size="sm" style={{ flex: 1, minWidth: 0, padding: '0 10px' }} variant="secondary" icon={<FiNavigation size={16} />} onClick={() => navigate('/route')}>Navigate</Button>
                  {nextDsa?.isCustomer
                    ? <Button size="sm" variant="secondary" style={{ width: 40, padding: 0, flexShrink: 0, gap: 0 }} icon={<FiUser size={18} />} aria-label="Customer prep" title="Questions & loan calculator" onClick={() => navigate(`/customers/${nextVisit.dsaId}`)} />
                    : <Button size="sm" variant="secondary" style={{ width: 40, padding: 0, flexShrink: 0, color: 'var(--danger)', gap: 0 }} icon={<FiMic size={18} />} aria-label="Record meeting" title="Record meeting" onClick={() => navigate(`/record?dsa=${nextVisit.dsaId}`)} />}
                </div>
                <div className="row-between" style={{ marginTop: 8 }}>
                  <button className={styles.moreLink} onClick={() => navigate('/route')}>
                    {remaining > 1 ? `${remaining - 1} more after this` : 'Last stop of the day'} <FiChevronRight size={14} />
                  </button>
                  <button className={styles.moreLink} style={{ color: 'var(--primary)', fontWeight: 600 }} onClick={() => navigate('/plan?edit=1')}><FiEdit2 size={13} /> Edit plan</button>
                </div>
              </Card>
            ) : (
              <Card className={styles.next} noChevron>
                <div className="row" style={{ gap: 14 }}>
                  <button className={styles.ringBtn} onClick={() => navigate('/route')} aria-label="Today's plan">
                    <ProgressRing value={targetPct} size={96} stroke={4}>
                      <span style={{ fontWeight: 800, fontSize: 22 }}>{stats.todayDone}/{stats.dailyTarget}</span>
                    </ProgressRing>
                  </button>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className={styles.nextName}>{left <= 0 ? 'Target done — nice work' : 'No visits left on your plan'}</div>
                  </div>
                </div>
                <div className="label">{left <= 0 ? 'Every extra visit still counts on the leaderboard.' : 'Add a walk-in visit or schedule one for later.'}</div>
                <div className={styles.nextActions}>
                  <Button style={{ flex: 1 }} icon={<FiMapPin size={18} />} onClick={() => navigate('/visits/new')}>Log a visit</Button>
                  <Button style={{ flex: 1 }} variant="secondary" icon={<FiEdit2 size={16} />} onClick={() => navigate('/plan?edit=1')}>Add stops</Button>
                </div>
              </Card>
            )}
          </motion.div>
          )}

          {/* 3b. Incentive widget — ring + this month's numbers. Tap to reveal the slab progress; "Open" goes to the tracker. */}
          <motion.div variants={listItem}>
            <Card padding={16} noChevron onClick={() => setSlabOpen((o) => !o)} aria-expanded={slabOpen}>
              <div className="row" style={{ gap: 16 }}>
                <ProgressRing value={78} size={84} stroke={7}>
                  <span style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.1 }}>{formatINR(stats.incentiveEarned)}</span>
                  <span className="hint" style={{ fontSize: 10 }}>78%</span>
                </ProgressRing>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>Incentive this month</div>
                  <div className="hint">{formatINR(stats.incentiveEarned, { compact: false })} earned · Bronze slab</div>
                  <div className={styles.miniStats}>
                    <span><b>{stats.filesSubmitted}</b> files</span>
                    <span><b style={{ color: 'var(--success)' }}>{formatINR(stats.disbursed)}</b> disbursed</span>
                  </div>
                </div>
                <FiChevronRight size={20} color="var(--text-3)" style={{ transform: slabOpen ? 'rotate(90deg)' : 'none', transition: 'transform .2s' }} />
              </div>
              {slabOpen && (
                <div className={styles.slab} onClick={(e) => e.stopPropagation()}>
                  <div className="row-between" style={{ marginBottom: 8 }}>
                    <div style={{ fontWeight: 600 }}>{formatINR(45000, { compact: false })} more to Silver slab</div>
                    <span className="hint" style={{ fontWeight: 600, color: 'var(--primary)' }}>78%</span>
                  </div>
                  <ProgressBar value={78} height={6} />
                  <div className="row-between" style={{ marginTop: 8 }}>
                    <span className="hint">≈ 3 more loan files</span>
                    <button className="link" onClick={() => navigate('/incentive')}>Open tracker</button>
                  </div>
                </div>
              )}
            </Card>
          </motion.div>

          {/* 6. Pending — carried over: missed visits, flagged follow-ups, your to-dos due now */}
          {pending.items.length > 0 && (
          <motion.div variants={listItem}>
            <div className="section-head" style={{ marginTop: 4, marginBottom: 10 }}>
              <h2 className="section-title" style={{ fontSize: 17 }}>Pending</h2>
              <span className="hint">{pending.total} item{pending.total === 1 ? '' : 's'}</span>
            </div>
            <Card padding={0} noChevron>
              {pending.items.map((it) => {
                const d = getDsa(it.dsaId);
                const Icon = it.kind === 'missed' ? FiXCircle : it.kind === 'followup' ? FiFlag : FiCheckSquare;
                return (
                  <div key={it.key} className={styles.schedRow}>
                    {it.kind === 'todo' ? (
                      <button className={styles.tick} onClick={() => tickTodo(it.recId, it.index)} aria-label="Mark done"><FiCheck size={13} /></button>
                    ) : (
                      <span className={`${styles.pendIcon} ${styles[`pend_${it.kind}`]}`}><Icon size={16} /></span>
                    )}
                    <div className="grow" style={{ minWidth: 0 }}>
                      <span className={styles.schedName}>{it.kind === 'todo' ? it.text : <>{d?.name} <span className="hint">· {it.text}</span></>}</span>
                      <span className="hint truncate" style={{ display: 'block' }}>{it.sub}</span>
                    </div>
                  </div>
                );
              })}
            </Card>
          </motion.div>
          )}

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
