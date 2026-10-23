import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiAlertTriangle, FiArrowLeft, FiArrowRight, FiBell, FiAward, FiCalendar, FiCheck, FiChevronDown, FiChevronRight, FiEyeOff, FiFilePlus, FiFileText, FiFolder, FiLock, FiShield, FiUnlock, FiZap } from 'react-icons/fi';
import Page from '../../components/layout/Page';
import BottomSheet from '../../components/ui/BottomSheet';
import Button from '../../components/ui/Button';
import { fireConfetti } from '../../components/ui/SuccessCheck';
import { useRewards } from '../../hooks/useRewards';
import { useToast } from '../../hooks/useToast';
import { QUICK_TARGETS, TIERS, PAST_EARNINGS, recommendedTarget, thisWeek } from '../../utils/rewards';
import { incentiveRoadmap, PLAN } from '../../utils/incentive';
import { useAppState } from '../../context/AppStateContext';
import { formatINR, formatDate, toISODate } from '../../utils/formatters';
import styles from './rewards.module.css';

const art = (name) => `${import.meta.env.BASE_URL}rewards/${name}.webp`;
const inr = (n) => formatINR(n, { compact: false });
// Where each slab label and the "you are here" bubble sit on path.webp (% of the image) — they cover the mock's own labels.
const MILE_POS = [
  { left: 69.5, top: 61, width: 21, height: 6.2 },
  { left: 60.5, top: 46.6, width: 25, height: 7 },
  { left: 61.5, top: 26.6, width: 26, height: 7 },
  { left: 61.5, top: 7.4, width: 34.5, height: 7 },
];
const HERE_POS = { left: 48.3, top: 74.4, width: 42, height: 11.6 };
// Mission kind → icon and tile colour.
const MISSION_LOOK = { disburse: [FiFolder, '#10b981'], boss: [FiAward, '#f59e0b'], weekly: [FiFilePlus, '#8b5cf6'], daily: [FiZap, '#3b82f6'], unlock: [FiUnlock, '#ef4444'] };
// Non-cash perks per tier — recognition, never more rupees than the grid pays.
const PERKS = [null, ['🎁', '₹500 Gift voucher'], ['⭐', 'Priority lead access'], ['⚡', 'Double points weekend'], ['🏆', 'Branch Head shout-out']];
const pct = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, `${v}%`]));
// Crores to two places: "₹3.33 Cr" — one place ("₹3.3Cr") hid Rs 3 lakh of work.
const amt = (n) => (n >= 1e7 ? `₹${+(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${+(n / 1e5).toFixed(1)} L` : inr(n));

function Logo() {
  return <span className={styles.logo}><i className={styles.logoMark} /> INCENTIVE</span>;
}

// A disbursal or a finished mission since the last visit pays its points now, with a cheer; a new slab opens the
// level-up screen. Shared by the arena and What to do, so whichever opens first celebrates.
function useCelebrate() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { claimFinished, newTier } = useRewards();
  useEffect(() => {
    const fresh = claimFinished();
    if (fresh.some((m) => m.cash)) fireConfetti();
    fresh.forEach((m, i) => setTimeout(() => toast(`+${m.pts} pts · ${m.title}`, 'success', 1800), i * 600));
  }, [claimFinished, toast]);
  useEffect(() => { if (newTier) navigate('/rewards/level-up'); }, [newTier, navigate]);
}

/**
 * /rewards — the arena (research, 2026-10-23: SalesScreen + Kennect + the evidence). The level IS the slab; the money is
 * shown as earned / held / under clawback watch; comparison is private (you vs you, the branch middle) — no ranked
 * leaderboard and no volume contests, which backfire on the bottom half and are what RBI's 2026 sales-practice
 * directions name. Quality badges sit next to the money so "how" is as visible as "how much".
 */
export default function RewardsHome() {
  const navigate = useNavigate();
  const { target, goal, roadmap: r, tier, purse: w, badges, pace: p, slabs } = useRewards();
  useCelebrate();
  const next = r.nextSlab;
  const from = r.slab?.from ?? 0;
  const span = next ? next.from - from : 1;
  const solid = next ? Math.min(100, ((r.done - from) / span) * 100) : 100;
  const ghost = next ? Math.min(100 - solid, (r.nearSum / span) * 100) : 0;
  const max = Math.max(r.done, p.own, p.branch, 1);
  const diff = r.done - p.own;

  return (
    <Page mode="slide" className={styles.page}>
      <div className={styles.map}>
        <div className={styles.mapTop}>
          <div className={styles.head} style={{ width: '100%' }}>
            <button className={styles.icon} onClick={() => navigate('/')} aria-label="Back"><FiArrowLeft size={22} /></button>
            <Logo />
            <button className={styles.icon} onClick={() => navigate('/rewards/statement')} aria-label="Statement"><FiFileText size={20} /></button>
          </div>
          <button className={styles.targetPill} onClick={() => navigate('/rewards/target')}>{target ? `${inr(goal)} goal` : 'Set a personal goal'} <FiChevronDown size={15} /></button>
        </div>
        <img src={art('path')} alt="" />
        {slabs.slice(0, MILE_POS.length).map((s, i) => (
          <span key={s.from} className={`${styles.mile} ${r.done >= s.from ? styles.mileDone : ''}`} style={pct(MILE_POS[i])}>
            <b>{amt(s.from)}</b><small>{TIERS[i + 1]} · {s.rate}%</small>
          </span>
        ))}
        <span className={styles.here} style={pct(HERE_POS)}>You are here<br /><b>{amt(r.done)}</b> disbursed · <b>{inr(r.earned)}</b></span>
      </div>

      <div className={styles.levelCard}>
        <div className={styles.tierBadge}>{tier.n}</div>
        <div className="grow" style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800 }}>{tier.name}{r.slab ? ` · ${r.slab.rate}% slab` : ' · below the minimum'}</div>
          <div style={{ fontSize: 12, color: '#64748b' }}>
            {next ? <>{amt(next.more)} more → <b>whole month at {next.rate}%</b> · +{inr(next.pays)}</> : 'Top slab — every rupee pays the most'}
          </div>
          <div className={styles.bar} aria-label="Progress to the next slab"><i style={{ width: `${solid}%` }} /><i className={styles.barGhost} style={{ width: `${ghost}%` }} /></div>
          {next && r.nearSum > 0 && <div className={styles.ghostNote}>Light green: {r.near.length} file{r.near.length > 1 ? 's' : ''} near disbursal · {amt(r.nearSum)}</div>}
        </div>
        <button className={styles.gift} onClick={() => navigate('/rewards/store')} aria-label="Rewards store">🎁</button>
      </div>

      <button className={styles.wallet} onClick={() => navigate('/rewards/statement')}>
        <span className={styles.walletRow}>
          <span><small>Earned</small><b>{inr(w.earned)}</b></span>
          <span className={w.held ? styles.walletBad : ''}><small>Held</small><b>{inr(w.held)}</b></span>
          <span className={w.bounced.length ? styles.walletBad : ''}><small>Clawback watch</small><b>{w.watch.length} file{w.watch.length === 1 ? '' : 's'}</b></span>
        </span>
        {w.overdue.length > 0 && (
          <span className={styles.loss}><FiAlertTriangle size={15} /> Your whole {inr(w.earned)} is on hold — {w.overdue[0].doc} for {w.overdue[0].borrower} is {w.overdue[0].days} day{w.overdue[0].days === 1 ? '' : 's'} late{w.overdue.length > 1 ? ` (+${w.overdue.length - 1} more)` : ''}. Clear it to release.</span>
        )}
        {w.below && <span className={styles.loss}><FiLock size={15} /> {amt(w.minGap)} more to reach the monthly minimum — nothing pays below it.</span>}
        <span className={styles.walletLink}>How this was calculated <FiChevronRight size={14} /></span>
      </button>

      <div className={styles.panel}>
        <div className={styles.panelHead}><span>You vs you</span><span className={styles.private}><FiEyeOff size={12} /> Only you see this</span></div>
        {[['This month', r.done, '#14b8a6'], ['Your usual by today', p.own, '#94a3b8'], ['Branch middle by today', p.branch, '#cbd5e1']].map(([label, v, c]) => (
          <div key={label} className={styles.paceRow}>
            <span>{label}</span>
            <span className={styles.paceBar}><i style={{ width: `${(v / max) * 100}%`, background: c }} /></span>
            <b>{amt(v)}</b>
          </div>
        ))}
        <div className={styles.paceNote}>
          {diff >= 0 ? `${amt(diff)} ahead of your usual pace — on track for about ${amt(p.projected)} this month.`
            : `${amt(-diff)} behind your usual pace${r.nearSum ? ` — your ${r.near.length} near-disbursal file${r.near.length > 1 ? 's' : ''} would ${r.nearSum >= -diff ? 'cover it' : 'close part of it'}` : ''}.`}
        </div>
      </div>

      <div className={styles.panel}>
        <div className={styles.panelHead}><span><FiShield size={14} /> Quality shield</span><span className={styles.private}>How you earn, not how much</span></div>
        <div className={styles.badges}>
          {badges.map((b) => (
            <div key={b.id} className={`${styles.badge} ${b.on ? styles.badgeOn : ''}`}>
              <span className={styles.badgeIcon}>{b.icon}</span><b>{b.name}</b><small>{b.how}</small>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.pathActions}>
        <button className={styles.ghost} onClick={() => navigate('/rewards/store')}>Rewards</button>
        <button className={styles.go} style={{ flex: 2, height: 46, fontSize: 15 }} onClick={() => navigate('/rewards/missions')}>What to do <FiArrowRight size={16} /></button>
      </div>
    </Page>
  );
}

/** 1 · An optional personal goal; without one the BO aims at the next slab. */
export function RewardsTarget() {
  const navigate = useNavigate();
  const { target, setTarget } = useRewards();
  const { loanFiles } = useAppState();
  const reco = recommendedTarget();
  const [pick, setPick] = useState(target ?? reco);
  const today = toISODate();
  const road = useMemo(() => incentiveRoadmap(pick, loanFiles, today), [pick, loanFiles, today]);

  return (
    <Page mode="slide" className={`${styles.page} ${styles.stars}`}>
      <div className={styles.head}>
        <button className={styles.icon} onClick={() => navigate(-1)} aria-label="Back"><FiArrowLeft size={22} /></button>
        <Logo />
        <button className={styles.icon} onClick={() => navigate('/notifications')} aria-label="Notifications"><FiBell size={20} /></button>
      </div>
      <h1 className={styles.title}>Set a personal goal</h1>
      <p className={styles.sub}>Optional — type an amount to see what it takes.</p>

      <label className={styles.amountBox}>
        <span>₹</span>
        <input
          inputMode="numeric"
          value={pick ? pick.toLocaleString('en-IN') : ''}
          placeholder="e.g. 50,000"
          aria-label="Incentive you want this month"
          onChange={(e) => setPick(Math.min(10000000, Number(e.target.value.replace(/\D/g, '')) || 0))}
        />
      </label>
      <div className={styles.quickPicks}>
        {QUICK_TARGETS.map((a) => (
          <button key={a} className={pick === a ? styles.quickOn : ''} onClick={() => setPick(a)}>{formatINR(a)}</button>
        ))}
      </div>
      <button className={styles.reco} onClick={() => setPick(reco)}>
        <span className={styles.recoIcon}><FiLock size={15} /></span>
        <span>Best of last 3 months {inr(Math.max(...PAST_EARNINGS.slice(-3)))} · Recommended <b>{inr(reco)}</b></span>
      </button>

      {pick > 0 && <Roadmap r={road} />}

      <div className={styles.goBar}>
        <button className={styles.go} disabled={!pick} onClick={() => { setTarget(pick); navigate('/rewards', { replace: true }); }}>Set goal <FiArrowRight size={18} /></button>
        {target && <button className={styles.ghost} style={{ width: '100%', marginTop: 10, height: 46 }} onClick={() => { setTarget(null); navigate('/rewards', { replace: true }); }}>No goal — aim at the next slab</button>}
      </div>
    </Page>
  );
}

/** What the wanted incentive takes, as steps from the BO's own files (utils/incentive.js). */
function Roadmap({ r }) {
  const navigate = useNavigate();
  if (r.need == null) return null;
  const files = (l) => l.slice(0, 3).map((f) => `${f.borrower} · ${f.stage} · ${amt(f.amount)}`);
  const perWeek = Math.ceil(r.logins / r.weeks);
  const steps = [];
  if (r.gap === 0) steps.push({ title: 'Already covered', detail: `Your ${amt(r.done)} disbursed this month already pays ${inr(r.target)}. Keep the files clean so it is paid.` });
  if (r.gap > 0 && r.near.length) steps.push({ title: `Get ${r.near.length} file${r.near.length > 1 ? 's' : ''} disbursed · ${amt(r.nearSum)}`, detail: files(r.near), to: '/files' });
  if (r.gap > r.nearSum && r.early.length) steps.push({ title: `Push ${r.early.length} file${r.early.length > 1 ? 's' : ''} through credit · ${amt(r.earlySum)}`, detail: files(r.early), to: '/files' });
  if (r.fresh > 0) {
    steps.push({
      title: `Log in ${r.logins} new file${r.logins > 1 ? 's' : ''}`,
      detail: [`${amt(r.fresh)} more is not in your pipeline yet`, `≈ ${r.newFiles} disbursed file${r.newFiles > 1 ? 's' : ''} at your ${amt(Math.round(r.avgTicket))} average`, `${Math.round(r.approval * 100)}% of your files get disbursed → ${r.logins} logins`],
      to: '/plan',
    });
    steps.push({ title: `${perWeek} login${perWeek > 1 ? 's' : ''} a week`, detail: `${r.days} working day${r.days > 1 ? 's' : ''} left this month` });
  }
  if (r.gap > 0 && r.nextSlab && r.nextSlab.more < r.gap) {
    steps.push({ title: `Cross ${amt(r.nextSlab.from)} first`, detail: `${amt(r.nextSlab.more)} more moves all your disbursal to the ${r.nextSlab.rate}% slab — that alone adds ${inr(r.nextSlab.pays)}` });
  }
  if (r.held.length) steps.push({ warn: true, title: `Clear OTC/PDD on ${r.held.length} file${r.held.length > 1 ? 's' : ''}`, detail: `Payout is held while a document is overdue: ${r.held.join(', ')}`, to: '/files' });

  return (
    <div className={styles.road}>
      <div className={styles.needCard}>
        <span className={styles.needLabel}>Disburse this month</span>
        <b>{amt(r.need)}</b>
        <span className={styles.needMeta}>{r.rate}% slab · {amt(r.done)} done · {r.gap ? `${amt(r.gap)} to go` : 'covered'}</span>
        <div className={styles.bar}><i style={{ width: `${Math.min(100, (r.done / r.need) * 100)}%` }} /></div>
        <span className={styles.needMeta}>Earned so far {inr(r.earned)}</span>
      </div>
      <ol className={styles.steps}>
        {steps.map((st, i) => (
          <li key={st.title} className={st.warn ? styles.stepWarn : ''}>
            <button type="button" disabled={!st.to} onClick={() => st.to && navigate(st.to)}>
              <span className={styles.stepN}>{st.warn ? '!' : i + 1}</span>
              <span className="grow" style={{ minWidth: 0 }}>
                <b>{st.title}</b>
                {[].concat(st.detail).map((d) => <span key={d} className={styles.stepDetail}>{d}</span>)}
              </span>
              {st.to && <FiChevronRight size={16} />}
            </button>
          </li>
        ))}
      </ol>
      <ul className={styles.rules}>{PLAN.rules.map((t) => <li key={t}>{t}</li>)}</ul>
    </div>
  );
}

/** The roadmap for the goal (personal, or the next slab), opened from the arena. */
export function RewardsPlan() {
  const navigate = useNavigate();
  const { target, goal, roadmap } = useRewards();
  return (
    <Page mode="slide" className={`${styles.page} ${styles.stars}`}>
      <div className={styles.head}>
        <button className={styles.icon} onClick={() => navigate(-1)} aria-label="Back"><FiArrowLeft size={22} /></button>
        <Logo />
        <span style={{ width: 40 }} />
      </div>
      <h1 className={styles.title}>{target ? `Your plan to ${inr(goal)}` : `Your plan to the next slab · ${inr(goal)}`}</h1>
      <Roadmap r={roadmap} />
      <div className={styles.goBar}>
        <button className={styles.ghost} style={{ width: '100%', height: 46 }} onClick={() => navigate('/rewards/target')}>{target ? 'Change goal' : 'Set a personal goal'}</button>
      </div>
    </Page>
  );
}

/** 3 · What to do: the goal counted in disbursements, missions that are steps to disbursal, and the visit streak. */
export function RewardsMissions() {
  const navigate = useNavigate();
  const { goal: target, roadmap: r, missions, points, streak, visitDays } = useRewards();
  const today = toISODate();
  useCelebrate();
  const left = Math.max(0, target - r.earned);

  return (
    <Page mode="slide" className={`${styles.page} ${styles.sky}`}>
      <div className={styles.head}>
        <button className={styles.icon} onClick={() => navigate(-1)} aria-label="Back"><FiArrowLeft size={22} /></button>
        <span style={{ fontWeight: 800, fontSize: 19 }}>What to do</span>
        <button className={styles.icon} onClick={() => navigate('/calendar')} aria-label="Calendar"><FiCalendar size={19} /></button>
      </div>
      <span className={styles.dateChip}>{formatDate(today, { weekday: 'short', day: 'numeric', month: 'short' })}</span>

      <div className={styles.coach}>
        <img src={art('avatar')} alt="" />
        <div className={styles.bubble}>
          {r.filesLeft
            ? <>{inr(left)} more to {inr(target)} — that is <b>{r.filesLeft} more disbursement{r.filesLeft > 1 ? 's' : ''}</b>. 💪</>
            : <>Your disbursals already pay {inr(target)} — superb! 🎉</>}
        </div>
      </div>

      <div className={styles.countCard}>
        <div className={styles.countRow}>
          <span><b>{inr(r.perFile)}</b>per disbursement now</span>
          <span><b>{r.filesTotal}</b>disbursements for {inr(target)}</span>
        </div>
        <div className={styles.dots} aria-label={`${r.doneCount} of ${r.filesTotal} done`}>
          {Array.from({ length: Math.min(r.filesTotal, 30) }, (_, i) => <i key={i} className={i < r.doneCount ? styles.dotOn : ''} />)}
        </div>
        <div className={styles.countMeta}>
          {r.doneCount} done ({inr(r.earned)} earned){r.filesLeft ? ` · ${r.filesLeft} to go` : ''}
          {r.perFileAtNeed > r.perFile && <> · each pays {inr(r.perFileAtNeed)} once you reach the {r.rate}% slab</>}
        </div>
      </div>

      <div className={styles.missionHead}>
        <span>Missions</span>
        <span className={styles.ptsChip}>⭐ {points.toLocaleString('en-IN')} pts</span>
      </div>
      <p className={styles.ptsNote}>Points are for the rewards store. Your rupees come only from disbursement.</p>
      <div className={styles.missions}>
        {missions.map((m) => {
          const [Icon, tone] = MISSION_LOOK[m.kind];
          const boss = m.kind === 'boss';
          return (
            <motion.button key={m.id} whileTap={{ scale: 0.98 }} className={`${styles.mission} ${boss ? styles.missionBoss : ''} ${m.complete ? styles.missionDone : ''}`} style={{ '--tile': tone }} onClick={() => navigate(m.to)}>
              <span className={styles.mIcon}><span>{m.complete ? <FiCheck size={20} /> : <Icon size={20} />}</span>{boss ? `${Math.min(100, Math.round((m.done / m.goal) * 100))}%` : `${m.done}/${m.goal}`}</span>
              <span className="grow" style={{ minWidth: 0 }}>
                <span className={styles.mTitle} style={{ display: 'block' }}>{m.title}</span>
                <span className={styles.mSub} style={{ display: 'block' }}>{m.sub}</span>
                <span className={styles.mBar} style={{ display: 'block' }}><i style={{ width: `${Math.min(100, (m.done / m.goal) * 100)}%` }} /></span>
              </span>
              <span className={styles.rewardCol}>
                {m.cash ? <span className={`${styles.bonus} ${m.complete ? styles.bonusDone : ''}`}>{m.complete ? '✓ ' : '+'}{inr(m.cash)}</span> : null}
                <span className={styles.ptsSmall}>{m.complete ? '✓' : '+'}{m.pts} pts</span>
              </span>
            </motion.button>
          );
        })}
      </div>
      <button className={styles.planLink} onClick={() => navigate('/rewards/plan')}>
        <span className="grow">See the full plan<span>Every file, the logins you need and what holds your payout</span></span>
        <FiChevronRight size={18} />
      </button>

      <div className={styles.streak}>
        <div className={styles.streakHead}>🔥 {streak} Day Streak</div>
        <div className={styles.week}>
          {thisWeek(today).map((d) => {
            const iso = toISODate(d);
            const on = visitDays.has(iso);
            return (
              <div key={iso}>
                <span className={`${styles.day} ${iso === today ? styles.dayToday : on ? styles.dayOn : ''}`}>{on ? '✓' : iso === today ? d.toLocaleDateString('en-IN', { weekday: 'short' }).slice(0, 2) : ''}</span>
                {d.toLocaleDateString('en-IN', { weekday: 'short' })}
              </div>
            );
          })}
        </div>
      </div>
    </Page>
  );
}

/** 4 · A new slab reached: the celebration, the tier, and what it means in rupees. */
export function RewardsLevelUp() {
  const navigate = useNavigate();
  const { roadmap: r, tier, markTierSeen } = useRewards();
  useEffect(() => { fireConfetti(); const t = setTimeout(() => fireConfetti({ particleCount: 60 }), 900); return () => clearTimeout(t); }, []);
  const perk = PERKS[Math.min(tier.n, PERKS.length - 1)];
  const next = r.nextSlab;

  return (
    <Page mode="fade" className={`${styles.page} ${styles.stars}`}>
      <div className={styles.levelUp}>
        <motion.img className={styles.cheer} src={art('cheer')} alt="" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 180, damping: 14 }} />
        <motion.div className={styles.lvTitle} initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.15 }}>{tier.name}!</motion.div>
        <div className={styles.earnedLine}>{r.slab ? `Every rupee this month now pays ${r.slab.rate}%` : 'Keep going to the first slab'}<b>{inr(r.earned)} earned</b></div>
        <motion.div initial={{ rotate: -12, scale: 0.6 }} animate={{ rotate: 0, scale: 1 }} transition={{ delay: 0.3, type: 'spring', stiffness: 200, damping: 12 }}>
          <div className={styles.hex}><b>{tier.n}</b></div>
          <div className={styles.ribbon}>{tier.name.toUpperCase()}<small>{r.slab ? `${r.slab.rate}% SLAB` : 'NO SLAB YET'}</small></div>
        </motion.div>
        {next && <div style={{ fontSize: 14, opacity: 0.85, marginTop: 22 }}>Next: {TIERS[tier.n + 1]} at {amt(next.from)} · {amt(next.more)} to go</div>}

        <div className={styles.unlocked}>
          <div style={{ fontWeight: 700 }}>Unlocked</div>
          <div className={styles.unlocks}>
            <div className={styles.unlock}><div>{PERKS[1][0]}</div>{PERKS[1][1]}</div>
            <div className={styles.unlock}><div>{(perk ?? PERKS[2])[0]}</div>{(perk ?? PERKS[2])[1]}</div>
          </div>
          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 10 }}>Paid while the files stay clean — no OTC/PDD overdue, no bounce in the first 3 EMIs.</div>
        </div>
        <button className={styles.go} style={{ marginTop: 18 }} onClick={() => { markTierSeen(); navigate('/rewards', { replace: true }); }}>Keep Going <FiArrowRight size={18} /></button>
      </div>
    </Page>
  );
}

/** 4b · The statement (Kennect's idea): every file, the slab, the holds and the watch — and a way to question it. */
export function RewardsStatement() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { roadmap: r, purse: w, queries, raiseQuery } = useRewards();
  const [asking, setAsking] = useState(false);
  const [text, setText] = useState('');
  const [fileId, setFileId] = useState('');
  const today = toISODate();
  const now = new Date(today);
  const payOn = toISODate(new Date(now.getFullYear(), now.getMonth() + 1, 7));
  const month = now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const upTo = r.slab ? PLAN.slabs[PLAN.slabs.indexOf(r.slab) + 1] : null;

  return (
    <Page mode="slide" className={`${styles.page} ${styles.light}`}>
      <div className={styles.hubHead}>
        <button className={styles.icon} onClick={() => navigate(-1)} aria-label="Back"><FiArrowLeft size={22} /></button>
        <span className={styles.hubTitle}>Statement · {month}</span>
      </div>

      <div className={styles.stmtSum}>
        <span><small>Disbursed</small><b>{amt(r.done)}</b></span>
        <i>→</i>
        <span><small>Slab</small><b>{r.slab ? `${r.slab.rate}%` : '—'}</b></span>
        <i>→</i>
        <span><small>Incentive</small><b>{inr(r.earned)}</b></span>
      </div>
      <p className={styles.stmtNote}>
        {r.slab ? `${amt(r.slab.from)}${upTo ? ` – ${amt(upTo.from)}` : ' and above'} pays ${r.slab.rate}% on the whole month, not just the part above it.` : `Below the ${amt(PLAN.minDisbursement)} minimum nothing pays yet.`}
        {' '}Paid on {formatDate(payOn)}{w.held ? ', once the hold below is cleared' : ''}.
      </p>

      <div className={styles.stmtHead}>Files disbursed this month</div>
      {w.rows.length ? w.rows.map((f) => (
        <div key={f.id} className={styles.row}>
          <div className="grow" style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700 }}>{f.borrower}</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>{f.id} · {amt(f.amount)} × {w.rate ?? 0}%</div>
          </div>
          <b>{inr(f.pays)}</b>
        </div>
      )) : <p className={styles.stmtEmpty}>No disbursal yet this month.</p>}

      <div className={styles.stmtHead}>Holds</div>
      {w.overdue.length ? w.overdue.map((d) => (
        <button key={d.fileId + d.doc} className={`${styles.row} ${styles.rowBad}`} style={{ width: 'calc(100% - 32px)', textAlign: 'left' }} onClick={() => navigate('/files')}>
          <FiAlertTriangle size={18} color="#dc2626" />
          <div className="grow" style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700 }}>{d.doc}</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>{d.borrower} · {d.days} day{d.days === 1 ? '' : 's'} overdue — holds the whole payout</div>
          </div>
          <FiChevronRight size={16} />
        </button>
      )) : <p className={styles.stmtEmpty}>Nothing held — every OTC/PDD document is in on time.</p>}

      <div className={styles.stmtHead}>Clawback watch · first 3 EMIs</div>
      {w.watch.length ? w.watch.map((f) => (
        <div key={f.id} className={`${styles.row} ${f.bounced ? styles.rowBad : ''}`}>
          <div className="grow" style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700 }}>{f.borrower}</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>{f.emisDue} of 3 EMIs due so far</div>
          </div>
          <b style={{ color: f.bounced ? '#dc2626' : '#047857', fontSize: 13 }}>{f.bounced ? 'Bounced — clawed back' : 'Clean'}</b>
        </div>
      )) : <p className={styles.stmtEmpty}>No file inside its first 3 EMIs.</p>}

      <ul className={styles.stmtRules}>{PLAN.rules.map((t) => <li key={t}>{t}</li>)}</ul>

      <div className={styles.stmtHead}>Your questions</div>
      {queries.filter((q) => q.month === today.slice(0, 7)).map((q) => (
        <div key={q.id} className={styles.row}>
          <div className="grow" style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600 }}>{q.text}</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>{q.fileId ? `${q.fileId} · ` : ''}Sent {formatDate(q.at)} · with your Branch Head</div>
          </div>
        </div>
      ))}
      <div style={{ padding: '4px 16px 0' }}><Button full variant="secondary" onClick={() => setAsking(true)}>Something looks wrong? Raise a query</Button></div>

      <BottomSheet open={asking} onClose={() => setAsking(false)} title="Raise a query">
        <div className="stack" style={{ gap: 12 }}>
          <select className="input" value={fileId} onChange={(e) => setFileId(e.target.value)} aria-label="Which file">
            <option value="">The whole month</option>
            {w.rows.map((f) => <option key={f.id} value={f.id}>{f.borrower} · {f.id}</option>)}
          </select>
          <textarea className="input" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Shah Traders was disbursed on the 28th but is not in this list" aria-label="Your question" />
          <Button full disabled={text.trim().length < 10} onClick={() => { raiseQuery(text.trim(), fileId || null); setAsking(false); setText(''); setFileId(''); toast('Sent to your Branch Head', 'success'); }}>Send</Button>
        </div>
      </BottomSheet>
    </Page>
  );
}

/** 5 · Spend points; see what you redeemed and your own incentive payouts. */
export function RewardsHub() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { points, catalogue, redeemed, redeem, earned } = useRewards();
  const [tab, setTab] = useState('rewards');
  const [cat, setCat] = useState('All');
  const [confirm, setConfirm] = useState(null);
  const items = catalogue.filter((i) => cat === 'All' || i.cat === cat);
  // Officer's own incentive: paid on the 7th of the following month.
  const months = [...PAST_EARNINGS, earned].map((amount, i, all) => {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - (all.length - 1 - i));
    const pay = new Date(d.getFullYear(), d.getMonth() + 1, 7);
    return { label: d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }), amount, payOn: toISODate(pay), paid: i < all.length - 1 };
  }).reverse();

  return (
    <Page mode="slide" className={`${styles.page} ${styles.light}`}>
      <div className={styles.hubHead}>
        <button className={styles.icon} onClick={() => navigate(-1)} aria-label="Back"><FiArrowLeft size={22} /></button>
        <span className={styles.hubTitle}>Rewards Hub</span>
        <span className={styles.pts}><i className={styles.coin}>★</i>{points.toLocaleString('en-IN')} pts</span>
      </div>
      <div className={styles.tabs}>
        {[['rewards', 'Rewards'], ['mine', 'My Rewards'], ['payouts', 'Payouts']].map(([id, label]) => (
          <button key={id} className={tab === id ? styles.tabOn : ''} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {tab === 'rewards' && (
        <>
          <div className={styles.cats}>
            {['All', 'Vouchers', 'Gadgets', 'Experiences'].map((c) => <button key={c} className={`${styles.cat} ${cat === c ? styles.catOn : ''}`} onClick={() => setCat(c)}>{c}</button>)}
          </div>
          <div className={styles.grid}>
            {items.map((i) => (
              <motion.button key={i.id} whileTap={{ scale: 0.97 }} className={styles.item} onClick={() => setConfirm(i)}>
                <img src={art(i.img)} alt="" />
                <b>{i.value.startsWith('₹') ? i.value : ''}</b>
                <small>{i.name}</small>
                <div className={styles.itemPts}>{i.pts.toLocaleString('en-IN')} pts</div>
              </motion.button>
            ))}
          </div>
        </>
      )}

      {tab === 'mine' && (redeemed.length ? redeemed.map((r) => (
        <div key={r.code} className={styles.row}>
          <img src={art(r.img)} alt="" />
          <div className="grow" style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700 }}>{r.name}</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>Redeemed {formatDate(r.at)} · {r.pts.toLocaleString('en-IN')} pts</div>
            <div className={styles.code}>{r.code}</div>
          </div>
        </div>
      )) : <p style={{ textAlign: 'center', color: '#64748b', padding: 30 }}>Nothing redeemed yet — pick something on the Rewards tab.</p>)}

      {tab === 'payouts' && months.map((m) => (
        <button key={m.label} className={styles.row} style={{ width: 'calc(100% - 32px)', textAlign: 'left' }} disabled={m.paid} onClick={() => navigate('/rewards/statement')}>
          <div className="grow">
            <div style={{ fontWeight: 700 }}>{m.label}</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>{m.paid ? `Paid ${formatDate(m.payOn)}` : `Due ${formatDate(m.payOn)} · still counting · see statement`}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 800 }}>{inr(m.amount)}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: m.paid ? '#047857' : '#b45309' }}>{m.paid ? 'Paid' : 'Due'}</div>
          </div>
        </button>
      ))}

      <BottomSheet open={!!confirm} onClose={() => setConfirm(null)} title={confirm?.name}>
        {confirm && (
          <div className="stack" style={{ gap: 14, textAlign: 'center' }}>
            <img src={art(confirm.img)} alt="" style={{ width: 140, margin: '0 auto', borderRadius: 16 }} />
            <div><b style={{ fontSize: 22 }}>{confirm.pts.toLocaleString('en-IN')} pts</b><div className="hint">You have {points.toLocaleString('en-IN')} pts</div></div>
            <Button full disabled={points < confirm.pts} onClick={() => { const r = redeem(confirm); setConfirm(null); setTab('mine'); fireConfetti({ particleCount: 70 }); toast(`Redeemed · code ${r.code}`, 'success'); }}>
              {points < confirm.pts ? `Need ${(confirm.pts - points).toLocaleString('en-IN')} more pts` : 'Redeem now'}
            </Button>
          </div>
        )}
      </BottomSheet>
    </Page>
  );
}
