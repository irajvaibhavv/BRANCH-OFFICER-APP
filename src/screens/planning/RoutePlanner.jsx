import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiCheck, FiPlus, FiClock, FiNavigation, FiZap, FiEdit2 } from 'react-icons/fi';
import Page, { listContainer, listItem } from '../../components/layout/Page';
import TopBar from '../../components/layout/TopBar';
import Card from '../../components/ui/Card';
import Avatar from '../../components/ui/Avatar';
import Button from '../../components/ui/Button';
import BottomSheet from '../../components/ui/BottomSheet';
import EmptyState from '../../components/ui/EmptyState';
import { StatusBadge } from '../../components/ui/Badge';
import { useAppState } from '../../context/AppStateContext';
import { fmtTime } from '../home/Dashboard';
import RouteMap from '../../components/charts/RouteMap';
import { useLivePosition } from '../../hooks/useGeolocation';
import PlanChooser from './PlanChooser';
import styles from './route.module.css';

export default function RoutePlanner() {
  const navigate = useNavigate();
  const { dsas, todayVisits, getDsa, dayPlan } = useAppState();
  const planned = dayPlan && todayVisits.some((v) => v.date === dayPlan.date && v.planned);
  const [sheet, setSheet] = useState(false);
  const [chooser, setChooser] = useState(false);

  // Pre-select today's not-yet-completed visits
  const initial = useMemo(() => todayVisits.filter((v) => v.status !== 'completed').map((v) => v.dsaId), [todayVisits]);
  const [selected, setSelected] = useState(initial);
  const [extra, setExtra] = useState([]);
  const here = useLivePosition();

  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const addExtra = (id) => { setExtra((e) => [...e, id]); setSelected((s) => [...s, id]); setSheet(false); };

  const cards = [
    ...todayVisits.map((v) => ({ key: v.id, dsaId: v.dsaId, time: v.time, status: v.status })),
    ...extra.map((id) => ({ key: `x-${id}`, dsaId: id, time: null, status: 'added' })),
  ];
  const available = dsas.filter((d) => !cards.some((c) => c.dsaId === d.id));
  // Map follows the tick boxes: only selected, not-yet-done stops, in list order
  const mapStops = cards.filter((c) => selected.includes(c.dsaId) && c.status !== 'completed').map((c) => getDsa(c.dsaId)).filter(Boolean);

  return (
    <Page>
      <TopBar title="Route" subtitle={`${selected.length} stops selected`} />

      {planned ? (
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
        <Card padding={14} onClick={() => setChooser(true)} style={{ marginBottom: 12 }}>
          <div className="row" style={{ gap: 12 }}>
            <span className="icon-tile" style={{ '--tile': '#f59e0b', width: 40, height: 40, borderRadius: 12 }}><FiZap size={18} /></span>
            <div className="grow">
              <div style={{ fontWeight: 600 }}>Plan my day</div>
              <div className="hint">DSAs · customers · branch — with route</div>
            </div>
          </div>
        </Card>
      )}

      {cards.length > 0 && <RouteMap stops={mapStops} origin={here} height={180} className={styles.mapGap} label="Live · Pune" empty="Tick stops to draw the route" />}

      {cards.length === 0 ? (
        <EmptyState emoji="📋" title="No visits planned today" subtitle="Add DSAs to build today's route." actionLabel="Add DSAs" actionIcon={<FiPlus />} onAction={() => setSheet(true)} />
      ) : (
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
      )}

      <Button variant="ghost" full icon={<FiPlus />} onClick={() => setSheet(true)} style={{ marginTop: 16 }}>Add more DSAs</Button>

      <div className={styles.planBar}>
        <Button full disabled={selected.length === 0} icon={<FiNavigation />} onClick={() => navigate(`/route/result?ids=${selected.join(',')}`)}>
          Plan route · {selected.length} stop{selected.length === 1 ? '' : 's'}
        </Button>
      </div>

      <BottomSheet open={sheet} onClose={() => setSheet(false)} title="Add DSAs to route">
        {available.length === 0 ? <p className="text-2">All DSAs are already on the list.</p> : (
          <div className="stack">
            {available.map((d) => (
              <Card key={d.id} padding={14} onClick={() => addExtra(d.id)}>
                <div className="row" style={{ gap: 12 }}>
                  <Avatar name={d.name} size={40} />
                  <div className="grow">
                    <div style={{ fontWeight: 600 }}>{d.name}</div>
                    <div className="hint">{d.location} · {d.distanceKm} km</div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </BottomSheet>
    <PlanChooser open={chooser} onClose={() => setChooser(false)} />
    </Page>
  );
}
