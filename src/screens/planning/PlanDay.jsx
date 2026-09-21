import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, Reorder, motion } from 'framer-motion';
import { FiMapPin, FiStar, FiTrendingUp, FiFolder, FiClock, FiLifeBuoy, FiCheck, FiChevronRight, FiMove, FiZap, FiPlus, FiNavigation, FiX, FiSearch, FiUser, FiLink } from 'react-icons/fi';
import Page, { listContainer, listItem } from '../../components/layout/Page';
import TopBar from '../../components/layout/TopBar';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Avatar from '../../components/ui/Avatar';
import Badge, { QualityBadge } from '../../components/ui/Badge';
import { useAppState } from '../../context/AppStateContext';
import { useToast } from '../../hooks/useToast';
import { formatINR, toISODate } from '../../utils/formatters';
import { km, optimise } from './RouteResult';
import RouteMap from '../../components/charts/RouteMap';
import { useLivePosition } from '../../hooks/useGeolocation';
import styles from './plan.module.css';

/*
  PLAN MY DAY · DSAs — Zomato-style: filter chips in the top bar narrow the list. DSAs that fit
  the filters are shown big ("Best matches"), the rest shrink to compact rows so the officer can
  still pick any DSA directly. Customers sit below (or alone, with the "Customers" chip) so a
  borrower in a picked DSA's circle can be slotted into the same trip. Then: fastest route, or
  drag to set their own priority → "Start my day".
  ?edit=1 reopens today's plan pre-filled so stops can be removed or added; ?picks=a,b pre-selects stops.
*/
export const CRITERIA = [
  { id: 'near', label: 'Nearest', sub: 'Least travel', icon: FiMapPin, tone: '#4c1d95' },
  { id: 'rated', label: 'Top rated', sub: 'Best reviews', icon: FiStar, tone: '#f59e0b' },
  { id: 'value', label: 'High potential', sub: 'Biggest pipeline', icon: FiTrendingUp, tone: '#16a34a' },
  { id: 'files', label: 'Pending files', sub: 'Docs / approvals stuck', icon: FiFolder, tone: '#7c3aed' },
  { id: 'stale', label: 'Not visited', sub: '14+ days', icon: FiClock, tone: '#ea580c' },
  { id: 'coach', label: 'Needs coaching', sub: 'Low performers', icon: FiLifeBuoy, tone: '#dc2626' },
];
const MAX_CRITERIA = 2;
const MAX_STOPS = 6;
const CUST_KIND = { new: 'New customer', lead: 'Lead', existing: 'Existing customer' };
const MATCHES = 5;
const MEETING_MINS = 40;
const DAY_START = 9 * 60 + 30;

const daysSince = (iso) => (iso ? Math.floor((Date.now() - new Date(iso)) / 86400000) : 999);
const norm = (v, min, max) => (max === min ? 0.5 : (v - min) / (max - min));
const clock12 = (t) => `${Math.floor(t / 60) % 12 || 12}:${String(t % 60).padStart(2, '0')} ${t >= 720 ? 'PM' : 'AM'}`;

/** Score every DSA on the chosen criteria (0..1 each, averaged) and explain the pick. */
function rank(dsas, loanFiles, criteria) {
  const pendingBy = {};
  loanFiles.forEach((f) => {
    const n = f.docs.filter(([, s]) => s !== 'done').length + (f.status === 'under review' || f.status === 'submitted' ? 1 : 0);
    pendingBy[f.dsaId] = (pendingBy[f.dsaId] ?? 0) + n;
  });
  const dist = dsas.map((d) => d.distanceKm), dis = dsas.map((d) => d.disbursed), stale = dsas.map((d) => daysSince(d.lastVisit));
  const pend = dsas.map((d) => pendingBy[d.id] ?? 0);
  const mm = (arr) => [Math.min(...arr), Math.max(...arr)];
  const [dMin, dMax] = mm(dist), [vMin, vMax] = mm(dis), [sMin, sMax] = mm(stale), [pMin, pMax] = mm(pend);

  return dsas
    .map((d) => {
      const reasons = [];
      let score = 0;
      criteria.forEach((c) => {
        switch (c) {
          case 'near': score += 1 - norm(d.distanceKm, dMin, dMax); reasons.push({ c, text: `${d.distanceKm} km away` }); break;
          case 'rated': score += norm(d.rating, 1, 5); reasons.push({ c, text: `${d.rating}★ rated` }); break;
          case 'value': score += norm(d.disbursed, vMin, vMax); reasons.push({ c, text: `${formatINR(d.disbursed)} disbursed` }); break;
          case 'files': score += norm(pendingBy[d.id] ?? 0, pMin, pMax); reasons.push({ c, text: `${pendingBy[d.id] ?? 0} pending item${(pendingBy[d.id] ?? 0) === 1 ? '' : 's'}` }); break;
          case 'stale': score += norm(daysSince(d.lastVisit), sMin, sMax); reasons.push({ c, text: `${daysSince(d.lastVisit)} days since visit` }); break;
          case 'coach': score += d.quality === 'low' ? 1 : d.quality === 'average' ? 0.5 : 0; reasons.push({ c, text: d.quality === 'low' ? 'Low quality — needs support' : d.quality === 'average' ? 'Average — can improve' : 'Already strong' }); break;
          default: break;
        }
      });
      return { d, score: criteria.length ? score / criteria.length : 0, reasons };
    })
    .sort((a, b) => b.score - a.score);
}

export default function PlanDay() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { dsas, customers, getDsa, loanFiles, todayVisits, dayPlan, planDay } = useAppState();
  const { toast } = useToast();
  // Edit mode: today's plan exists and the officer wants to add / remove stops. Pre-fill with what's still upcoming.
  const editing = params.get('edit') === '1' && dayPlan?.date === toISODate();
  const [step, setStep] = useState(0); // 0 choose DSAs · 1 route
  const [criteria, setCriteria] = useState(() => (editing ? dayPlan.criteria ?? [] : []));
  const [custOnly, setCustOnly] = useState(false); // "Customers" chip — show only customers
  const [query, setQuery] = useState('');
  const [picks, setPicks] = useState(() => {
    if (editing) return todayVisits.filter((v) => v.status === 'upcoming').map((v) => v.dsaId);
    return (params.get('picks') ?? '').split(',').filter((id) => id && getDsa(id)).slice(0, MAX_STOPS); // from home "Suggested for today"
  }); // dsa / customer ids, in the order added
  const [order, setOrder] = useState([]);
  const [custom, setCustom] = useState(false);
  const here = useLivePosition();
  const pickedStops = picks.map(getDsa).filter(Boolean);

  const doneToday = todayVisits.filter((v) => v.status === 'completed').map((v) => v.dsaId);
  const pool = useMemo(() => dsas.filter((d) => !doneToday.includes(d.id) && (!query || `${d.name} ${d.firm} ${d.location}`.toLowerCase().includes(query.toLowerCase()))), [dsas, doneToday, query]);
  const ranked = useMemo(() => rank(pool, loanFiles, criteria), [pool, loanFiles, criteria]);
  const matches = criteria.length ? ranked.slice(0, MATCHES) : [];
  const others = criteria.length ? ranked.slice(MATCHES) : [...ranked].sort((a, b) => a.d.name.localeCompare(b.d.name));
  // Customers: those in a picked DSA's circle float to the top, then nearest first
  const custPool = useMemo(
    () => customers
      .filter((c) => !doneToday.includes(c.id) && (!query || `${c.name} ${c.business ?? ''} ${c.location}`.toLowerCase().includes(query.toLowerCase())))
      .map((c) => ({ c, via: c.sourceDsa && picks.includes(c.sourceDsa) ? getDsa(c.sourceDsa) : null }))
      .sort((a, b) => (b.via ? 1 : 0) - (a.via ? 1 : 0) || a.c.distanceKm - b.c.distanceKm),
    [customers, doneToday, query, picks, getDsa],
  );

  const toggleCriterion = (id) =>
    setCriteria((c) => (c.includes(id) ? c.filter((x) => x !== id) : c.length >= MAX_CRITERIA ? (toast(`Pick up to ${MAX_CRITERIA} filters`, 'warning', 1400), c) : [...c, id]));
  const togglePick = (id) => setPicks((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= MAX_STOPS ? (toast(`Max ${MAX_STOPS} stops in a day`, 'warning', 1400), p) : [...p, id]));
  const addMatches = () => setPicks((p) => [...p, ...matches.map((m) => m.d.id).filter((id) => !p.includes(id))].slice(0, MAX_STOPS));

  const goRoute = () => { setOrder(optimise(picks.map(getDsa), here)); setCustom(false); setStep(1); };

  // ETA chain for the current order
  let prev = here, t = DAY_START, total = 0;
  const legs = order.map((d) => {
    const dist = km(prev, d); const mins = Math.round((dist / 22) * 60);
    t += mins; total += dist;
    const leg = { d, dist, time: `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`, eta: clock12(t) };
    t += MEETING_MINS; prev = d;
    return leg;
  });
  const endsAt = clock12(t);

  const start = () => {
    planDay(legs.map((l) => ({ dsaId: l.d.id, time: l.time, location: l.d.location })), criteria, 'dsa');
    toast(`${editing ? 'Plan updated' : 'Day planned'} · ${legs.length} visit${legs.length === 1 ? '' : 's'}`, 'success');
    navigate('/', { replace: true });
  };

  return (
    <Page mode="slide" style={{ paddingBottom: 'calc(var(--tabbar-safe) + 104px)' }}>
      <TopBar
        back
        onBack={step > 0 ? () => setStep(0) : undefined}
        title={step === 0 ? (editing ? "Edit today's plan" : 'Visit DSAs') : custom ? 'Your priority order' : 'Fastest route'}
        subtitle={step === 0 ? `${picks.length} of ${MAX_STOPS} picked` : `${order.length} stops · ${total.toFixed(0)} km`}
        hideBell
      />

      <AnimatePresence mode="wait">
        {/* ---------- STEP 1: filter chips + pick DSAs ---------- */}
        {step === 0 && (
          <motion.div key="s0" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.2 }}>
            {/* Zomato-style filter bar (sticks under the top bar) */}
            <div className={styles.filterBar}>
              <div className={styles.search}>
                <FiSearch size={16} />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search DSA, firm or area" />
                {query && <button onClick={() => setQuery('')} aria-label="Clear"><FiX size={14} /></button>}
              </div>
              <div className={styles.chips}>
                <button className={`${styles.chip} ${custOnly ? styles.chipOn : ''}`} style={{ '--tile': '#0f766e' }} onClick={() => setCustOnly((v) => !v)}>
                  <FiUser size={13} /> Customers {custOnly && <FiX size={12} />}
                </button>
                {CRITERIA.map((c) => {
                  const on = criteria.includes(c.id);
                  return (
                    <button key={c.id} className={`${styles.chip} ${on ? styles.chipOn : ''}`} style={{ '--tile': c.tone }} onClick={() => toggleCriterion(c.id)}>
                      <c.icon size={13} /> {c.label} {on && <FiX size={12} />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Live map of what's picked so far, from where the officer is now */}
            <RouteMap stops={pickedStops} origin={here} height={150} className={styles.mapGap} label="Live · Pune" empty="Add DSAs or customers to see them on the map" />

            {!custOnly && matches.length > 0 && (
              <>
                <div className={styles.secHead}>
                  <div><div className={styles.secTitle}>Best matches</div><div className="hint">{criteria.map((id) => CRITERIA.find((c) => c.id === id).label).join(' + ')}</div></div>
                  <button className="link" style={{ color: 'var(--primary)', fontWeight: 600, fontSize: 13 }} onClick={addMatches}>Add all {matches.length}</button>
                </div>
                <motion.div className="stack" variants={listContainer} initial="initial" animate="animate">
                  {matches.map((r, i) => <SuggestionCard key={r.d.id} r={r} index={i} picked={picks.includes(r.d.id)} onToggle={() => togglePick(r.d.id)} />)}
                </motion.div>
              </>
            )}

            {!custOnly && others.length > 0 && (
              <>
                <div className={styles.secHead} style={{ marginTop: matches.length ? 18 : 4 }}>
                  <div><div className={styles.secTitle}>{criteria.length ? 'Other DSAs' : 'All DSAs'}</div><div className="hint">{criteria.length ? 'Lower fit for these filters — add anyone you still want to see' : 'Pick a filter above, or add DSAs directly'}</div></div>
                </div>
                <Card padding={0} noChevron>
                  {others.map((r) => {
                    const on = picks.includes(r.d.id);
                    return (
                      <button key={r.d.id} className={`${styles.miniRow} ${on ? styles.miniOn : ''}`} onClick={() => togglePick(r.d.id)}>
                        <Avatar name={r.d.name} size={32} />
                        <div className="grow" style={{ minWidth: 0 }}>
                          <div className={styles.miniName}>{r.d.name}</div>
                          <div className="hint truncate">{r.d.location} · {r.d.distanceKm} km · {r.d.rating}★</div>
                        </div>
                        <span className={`${styles.addBtn} ${on ? styles.addOn : ''}`}>{on ? <><FiCheck size={13} /> Added</> : <><FiPlus size={13} /> Add</>}</span>
                      </button>
                    );
                  })}
                </Card>
              </>
            )}
            {/* Customers — in a picked DSA's circle first, so they can be met on the same trip */}
            {custPool.length > 0 && (
              <>
                <div className={styles.secHead} style={{ marginTop: custOnly ? 4 : 18 }}>
                  <div><div className={styles.secTitle}>Customers</div><div className="hint">{custPool.some((x) => x.via) ? 'Referred by a DSA on your plan are listed first' : 'New walk-ins, leads and existing borrowers'}</div></div>
                </div>
                <Card padding={0} noChevron>
                  {custPool.map(({ c, via }) => {
                    const on = picks.includes(c.id);
                    return (
                      <button key={c.id} className={`${styles.miniRow} ${on ? styles.miniOn : ''}`} onClick={() => togglePick(c.id)}>
                        <Avatar name={c.name} size={32} />
                        <div className="grow" style={{ minWidth: 0 }}>
                          <div className={styles.miniName}>{c.name}</div>
                          <div className="hint truncate">{CUST_KIND[c.kind] ?? c.kind} · {c.location} · {c.distanceKm} km</div>
                          {via && <div className={styles.via}><FiLink size={11} /> In {via.name.split(' ')[0]}&rsquo;s circle</div>}
                        </div>
                        <span className={`${styles.addBtn} ${on ? styles.addOn : ''}`}>{on ? <><FiCheck size={13} /> Added</> : <><FiPlus size={13} /> Add</>}</span>
                      </button>
                    );
                  })}
                </Card>
              </>
            )}
            {(custOnly ? custPool.length === 0 : pool.length === 0 && custPool.length === 0) && <p className="hint" style={{ marginTop: 16, textAlign: 'center' }}>No {custOnly ? 'customer' : 'DSA or customer'} matches "{query}".</p>}
            {doneToday.length > 0 && <p className="hint" style={{ marginTop: 12 }}>Already visited today ({doneToday.length}) are left out.</p>}
          </motion.div>
        )}

        {/* ---------- STEP 2: route / priority ---------- */}
        {step === 1 && (
          <motion.div key="s1" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.2 }}>
            <div className={styles.seg}>
              <button className={`${styles.segBtn} ${!custom ? styles.segOn : ''}`} onClick={() => { setOrder(optimise(order, here)); setCustom(false); }}><FiZap size={14} /> Fastest route</button>
              <button className={`${styles.segBtn} ${custom ? styles.segOn : ''}`} onClick={() => setCustom(true)}><FiMove size={14} /> My priority</button>
            </div>
            <RouteMap stops={order} origin={here} height={170} className={styles.mapGap} label="Live · Pune" />
            <Card padding={14} className={styles.summary} style={{ margin: '12px 0' }}>
              <div><div className="big-number">{order.length}</div><div className="hint">stops</div></div>
              <div><div className="big-number">{total.toFixed(0)} km</div><div className="hint">travel</div></div>
              <div><div className="big-number">{endsAt}</div><div className="hint">done by</div></div>
            </Card>
            <p className="hint" style={{ marginBottom: 10 }}>{custom ? 'Drag the handle to set the order you want to visit in — the map follows.' : 'Ordered for least travel from where you are. Switch to "My priority" to reorder.'}</p>
            <Reorder.Group axis="y" values={order} onReorder={(o) => { setOrder(o); setCustom(true); }} className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {legs.map((leg, i) => (
                <Reorder.Item key={leg.d.id} value={leg.d} drag={custom ? 'y' : false} style={{ listStyle: 'none' }}>
                  <Card padding={14} noChevron className={custom ? styles.dragCard : ''}>
                    <div className="row" style={{ gap: 12 }}>
                      <div className={styles.num}>{i + 1}</div>
                      <Avatar name={leg.d.name} size={40} />
                      <div className="grow" style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600 }} className="truncate">{leg.d.name}</div>
                        <div className="hint truncate">{leg.d.location} · {leg.dist.toFixed(1)} km from {i === 0 ? 'you' : 'previous'}</div>
                        <div className="hint" style={{ color: 'var(--primary)', fontWeight: 600, marginTop: 2 }}>ETA {leg.eta}</div>
                      </div>
                      {custom ? <FiMove size={20} color="var(--text-3)" /> : <FiChevronRight size={18} color="var(--text-3)" style={{ visibility: 'hidden' }} />}
                    </div>
                  </Card>
                </Reorder.Item>
              ))}
            </Reorder.Group>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer CTA */}
      <div className={styles.planBar}>
        {step === 0 && <Button full disabled={picks.length === 0} icon={<FiNavigation size={18} />} onClick={goRoute}>{picks.length === 0 ? 'Add stops to plan' : `Build route · ${picks.length} stop${picks.length === 1 ? '' : 's'}`}</Button>}
        {step === 1 && <Button full icon={<FiCheck size={18} />} onClick={start}>{editing ? 'Update my day' : 'Start my day'} · {order.length} visit{order.length === 1 ? '' : 's'}</Button>}
      </div>
    </Page>
  );
}

function SuggestionCard({ r, index, picked, onToggle }) {
  const { d, score, reasons } = r;
  return (
    <motion.div variants={listItem}>
      <Card padding={16} noChevron className={picked ? styles.pickedCard : ''}>
        <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
          {index != null && <div className={styles.rank}>{index + 1}</div>}
          <Avatar name={d.name} size={44} />
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="row-between">
              <div style={{ fontWeight: 600 }} className="truncate">{d.name}</div>
              <QualityBadge quality={d.quality} soft />
            </div>
            <div className="hint truncate">{d.firm} · {d.location}</div>
            <div className={styles.reasons}>
              {reasons.map((x) => { const c = CRITERIA.find((k) => k.id === x.c); return <span key={x.c} className={styles.reason} style={{ '--tile': c.tone }}><c.icon size={11} /> {x.text}</span>; })}
            </div>
            <div className={styles.matchRow}>
              <div className={styles.match}><motion.div className={styles.matchFill} initial={{ width: 0 }} animate={{ width: `${Math.round(score * 100)}%` }} transition={{ duration: 0.6, ease: 'easeOut' }} /></div>
              <span className="hint" style={{ fontWeight: 600 }}>{Math.round(score * 100)}% match</span>
              <button className={`${styles.addBtn} ${picked ? styles.addOn : ''}`} onClick={onToggle}>{picked ? <><FiCheck size={13} /> Added</> : <><FiPlus size={13} /> Add</>}</button>
            </div>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

export function CriteriaBadge({ id }) {
  const c = CRITERIA.find((x) => x.id === id);
  return c ? <Badge tone="primary" soft>{c.label}</Badge> : null;
}
