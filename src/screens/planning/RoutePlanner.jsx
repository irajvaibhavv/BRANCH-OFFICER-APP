import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiCheck, FiClock, FiNavigation, FiZap, FiEdit2, FiPlus, FiMoreVertical, FiSkipForward, FiCalendar } from 'react-icons/fi';
import Page, { listContainer, listItem } from '../../components/layout/Page';
import TopBar from '../../components/layout/TopBar';
import Card from '../../components/ui/Card';
import Avatar from '../../components/ui/Avatar';
import Button from '../../components/ui/Button';
import Badge, { StatusBadge } from '../../components/ui/Badge';
import BottomSheet from '../../components/ui/BottomSheet';
import AddStopSheet from '../../components/planning/AddStopSheet';
import { useToast } from '../../hooks/useToast';
import { useAppState } from '../../context/AppStateContext';
import RouteMap from '../../components/charts/RouteMap';
import { useLivePosition } from '../../hooks/useGeolocation';
import PlanChooser from '../../components/planning/PlanChooser';
import { fmtTime } from '../../utils/formatters';
import styles from './route.module.css';

const SKIP_REASONS = ['Not available today', 'Rescheduled by them', 'Something urgent came up', 'No longer needed'];

export default function RoutePlanner() {
  const navigate = useNavigate();
  const { todayVisits, getDsa, dayPlan, skipStop, moveStopToTomorrow } = useAppState();
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const [menu, setMenu] = useState(null); // the stop whose skip / move sheet is open
  const planned = dayPlan && todayVisits.some((v) => v.date === dayPlan.date && v.planned);
  const [chooser, setChooser] = useState(false);

  // Pre-select today's not-yet-completed visits
  // Every stop still to do is ticked; the officer unticks to leave one off the route. Stops added later arrive ticked.
  const initial = useMemo(() => todayVisits.filter((v) => v.status === 'upcoming').map((v) => v.dsaId), [todayVisits]);
  const [off, setOff] = useState([]);
  const selected = useMemo(() => initial.filter((id) => !off.includes(id)), [initial, off]);
  const here = useLivePosition();

  const toggle = (id) => setOff((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]));

  // Stops come only from the day plan — adding DSAs one by one here duplicated "Plan my day".
  const cards = todayVisits.map((v) => ({ key: v.id, dsaId: v.dsaId, time: v.time, status: v.status, onTheGo: v.onTheGo, urgent: v.urgent, shiftedFrom: v.shiftedFrom, skipReason: v.skipReason }));
  // Map follows the tick boxes: only selected, not-yet-done stops, in list order
  const mapStops = cards.filter((c) => selected.includes(c.dsaId) && c.status === 'upcoming').map((c) => getDsa(c.dsaId)).filter(Boolean);

  const planCard = planned ? (
    <Card padding={14} onClick={() => navigate('/plan?edit=1')} style={{ marginBottom: 12 }}>
      <div className="row" style={{ gap: 12 }}>
        <span className="icon-tile" style={{ '--tile': '#4c1d95', width: 40, height: 40, borderRadius: 12 }}><FiEdit2 size={18} /></span>
        <div className="grow">
          <div style={{ fontWeight: 600 }}>Edit today&rsquo;s plan</div>
          <div className="hint">Rebuild with filters, or use + Add stop for a quick one</div>
        </div>
      </div>
    </Card>
  ) : (
    <Card padding={16} onClick={() => setChooser(true)} style={{ marginBottom: 12 }}>
      <div className="row" style={{ gap: 12 }}>
        <span className="icon-tile" style={{ '--tile': '#f59e0b', width: 40, height: 40, borderRadius: 12 }}><FiZap size={18} /></span>
        <div className="grow">
          <div style={{ fontWeight: 600 }}>Plan my day</div>
          <div className="hint">DSAs · customers · branch — with route</div>
        </div>
      </div>
    </Card>
  );

  if (cards.length === 0) {
    return (
      <Page className={styles.emptyPage}>
        <TopBar title="Route" subtitle="Nothing lined up yet" />
        <div className={styles.center}>
          {planCard}
          <Button full variant="secondary" icon={<FiPlus size={16} />} onClick={() => setAdding(true)} style={{ marginBottom: 12 }}>Just add a stop</Button>
          <p className="hint" style={{ textAlign: 'center' }}>Plan the whole day, or add stops one at a time as the day goes.</p>
        </div>
        <PlanChooser open={chooser} onClose={() => setChooser(false)} />
        <AddStopSheet open={adding} onClose={() => setAdding(false)} />
      </Page>
    );
  }

  return (
    <Page>
      <TopBar title="Route" subtitle={`${selected.length} stops selected`}
        right={<button onClick={() => setAdding(true)} aria-label="Add a stop" style={{ height: 40, padding: '0 12px', borderRadius: 12, display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--primary)', fontWeight: 700, fontSize: 14 }}><FiPlus size={18} /> Stop</button>} />

      {planCard}

      <RouteMap stops={mapStops} origin={here} height={180} className={styles.mapGap} label="Live · Pune" empty="Tick stops to draw the route" />

      <motion.div className="stack" variants={listContainer} initial="initial" animate="animate">
          {cards.map((c) => {
            const d = getDsa(c.dsaId);
            const on = selected.includes(c.dsaId);
            const done = c.status !== 'upcoming';
            return (
              <motion.div key={c.key} variants={listItem}>
                <Card padding={16} noChevron onClick={() => !done && toggle(c.dsaId)} className={on ? styles.on : ''} style={done ? { opacity: 0.6 } : undefined}>
                  <div className="row" style={{ gap: 12 }}>
                    <div className={`${styles.check} ${on ? styles.checkOn : ''}`}>{on && <FiCheck size={16} />}</div>
                    <Avatar name={d?.name} size={44} />
                    <div className="grow">
                      <div style={{ fontWeight: 600 }} className="truncate">{d?.name}</div>
                      <div className="hint row" style={{ gap: 6 }}>
                        {c.time ? <><FiClock size={12} /> {fmtTime(c.time)} · </> : null}{d?.location} · {d?.distanceKm} km
                      </div>
                      {(c.onTheGo || c.urgent || c.shiftedFrom || c.skipReason) && <div className="row" style={{ gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                        {c.urgent && <Badge tone="danger" soft>Urgent</Badge>}
                        {c.onTheGo && <Badge tone="primary" soft>On the go</Badge>}
                        {c.shiftedFrom && c.status === 'upcoming' && <Badge tone="warning" soft>Moved from {c.shiftedFrom}</Badge>}
                        {c.skipReason && <span className="hint">{c.skipReason}</span>}
                      </div>}
                    </div>
                    {c.status !== 'added' && <StatusBadge status={c.status} soft />}
                    {c.status === 'upcoming' && <button onClick={(e) => { e.stopPropagation(); setMenu(c); }} aria-label="Skip or move" style={{ padding: 6, color: 'var(--text-3)' }}><FiMoreVertical size={18} /></button>}
                  </div>
                </Card>
              </motion.div>
            );
          })}
      </motion.div>

      <div className={styles.planBar}>
        <Button full disabled={selected.length === 0} icon={<FiNavigation />} onClick={() => navigate(`/route/result?ids=${selected.join(',')}`)}>
          Plan route · {selected.length} stop{selected.length === 1 ? '' : 's'}
        </Button>
      </div>

      <PlanChooser open={chooser} onClose={() => setChooser(false)} />
      <AddStopSheet open={adding} onClose={() => setAdding(false)} />

      <BottomSheet open={!!menu} onClose={() => setMenu(null)} title={getDsa(menu?.dsaId)?.name ?? 'Stop'}>
        {menu && (
          <div className="stack" style={{ gap: 10 }}>
            <Button full variant="secondary" icon={<FiCalendar size={16} />} onClick={() => { moveStopToTomorrow(menu.key); toast('Moved to tomorrow', 'success'); setMenu(null); }}>Move to tomorrow</Button>
            <div className="label" style={{ marginTop: 6 }}>Skip today — why?</div>
            {SKIP_REASONS.map((r) => (
              <Button key={r} full variant="ghost" icon={<FiSkipForward size={16} />} style={{ justifyContent: 'flex-start' }}
                onClick={() => { skipStop(menu.key, r); toast('Skipped for today'); setMenu(null); }}>{r}</Button>
            ))}
          </div>
        )}
      </BottomSheet>
    </Page>
  );
}
