import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiCheck, FiClock, FiNavigation, FiZap, FiEdit2 } from 'react-icons/fi';
import Page, { listContainer, listItem } from '../../components/layout/Page';
import TopBar from '../../components/layout/TopBar';
import Card from '../../components/ui/Card';
import Avatar from '../../components/ui/Avatar';
import Button from '../../components/ui/Button';
import { StatusBadge } from '../../components/ui/Badge';
import { useAppState } from '../../context/AppStateContext';
import RouteMap from '../../components/charts/RouteMap';
import { useLivePosition } from '../../hooks/useGeolocation';
import PlanChooser from '../../components/planning/PlanChooser';
import { fmtTime } from '../../utils/formatters';
import styles from './route.module.css';

export default function RoutePlanner() {
  const navigate = useNavigate();
  const { todayVisits, getDsa, dayPlan } = useAppState();
  const planned = dayPlan && todayVisits.some((v) => v.date === dayPlan.date && v.planned);
  const [chooser, setChooser] = useState(false);

  // Pre-select today's not-yet-completed visits
  const initial = useMemo(() => todayVisits.filter((v) => v.status !== 'completed').map((v) => v.dsaId), [todayVisits]);
  const [selected, setSelected] = useState(initial);
  const here = useLivePosition();

  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  // Stops come only from the day plan — adding DSAs one by one here duplicated "Plan my day".
  const cards = todayVisits.map((v) => ({ key: v.id, dsaId: v.dsaId, time: v.time, status: v.status }));
  // Map follows the tick boxes: only selected, not-yet-done stops, in list order
  const mapStops = cards.filter((c) => selected.includes(c.dsaId) && c.status !== 'completed').map((c) => getDsa(c.dsaId)).filter(Boolean);

  const planCard = planned ? (
    <Card padding={14} onClick={() => navigate('/plan?edit=1')} style={{ marginBottom: 12 }}>
      <div className="row" style={{ gap: 12 }}>
        <span className="icon-tile" style={{ '--tile': '#4c1d95', width: 40, height: 40, borderRadius: 12 }}><FiEdit2 size={18} /></span>
        <div className="grow">
          <div style={{ fontWeight: 600 }}>Edit today&rsquo;s plan</div>
          <div className="hint">Remove stops or add DSAs / customers</div>
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
        <TopBar title="Route" subtitle="Nothing planned yet" />
        <div className={styles.center}>
          {planCard}
          <p className="hint" style={{ textAlign: 'center' }}>Pick DSAs, customers or a branch day — the route is drawn for you.</p>
        </div>
        <PlanChooser open={chooser} onClose={() => setChooser(false)} />
      </Page>
    );
  }

  return (
    <Page>
      <TopBar title="Route" subtitle={`${selected.length} stops selected`} />

      {planCard}

      <RouteMap stops={mapStops} origin={here} height={180} className={styles.mapGap} label="Live · Pune" empty="Tick stops to draw the route" />

      <motion.div className="stack" variants={listContainer} initial="initial" animate="animate">
          {cards.map((c) => {
            const d = getDsa(c.dsaId);
            const on = selected.includes(c.dsaId);
            const done = c.status === 'completed';
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
                    </div>
                    {c.status !== 'added' && <StatusBadge status={c.status} soft />}
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
    </Page>
  );
}
