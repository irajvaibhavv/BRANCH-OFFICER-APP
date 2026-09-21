import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Reorder, motion } from 'framer-motion';
import { FiNavigation, FiMove, FiMapPin, FiClock } from 'react-icons/fi';
import Page from '../../components/layout/Page';
import TopBar from '../../components/layout/TopBar';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Avatar from '../../components/ui/Avatar';
import { useAppState } from '../../context/AppStateContext';
import { useToast } from '../../hooks/useToast';
import styles from './route.module.css';

// Branch (start point)
export const START = { lat: 18.5308, lng: 73.8475 };
export const km = (a, b) => {
  const R = 6371, dLat = ((b.lat - a.lat) * Math.PI) / 180, dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x)) * 1.3; // ×1.3 road factor
};

// Greedy nearest-neighbour — good enough for a demo; production would call a Directions API.
export function optimise(stops) {
  const out = [];
  let cur = START;
  const pool = [...stops];
  while (pool.length) {
    pool.sort((a, b) => km(cur, a) - km(cur, b));
    const n = pool.shift();
    out.push(n);
    cur = n;
  }
  return out;
}

export default function RouteResult() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { getDsa } = useAppState();
  const { toast } = useToast();
  const ids = (params.get('ids') ?? '').split(',').filter(Boolean);
  const initial = useMemo(() => optimise(ids.map(getDsa).filter(Boolean)), [ids, getDsa]);
  const [order, setOrder] = useState(initial);
  const [reorder, setReorder] = useState(false);

  // Legs
  let prev = START, t = 9 * 60 + 30, total = 0;
  const legs = order.map((d) => {
    const dist = km(prev, d);
    const mins = Math.round((dist / 22) * 60);
    t += mins;
    total += dist;
    const leg = { d, dist, mins, eta: `${Math.floor(t / 60) % 12 || 12}:${String(t % 60).padStart(2, '0')} ${t >= 720 ? 'PM' : 'AM'}` };
    t += 40; // 40 min per meeting
    prev = d;
    return leg;
  });
  const totalMins = Math.round((total / 22) * 60) + order.length * 40;

  // Map placeholder: project lat/lng to a 100x100 box
  const all = [START, ...order];
  const lats = all.map((p) => p.lat), lngs = all.map((p) => p.lng);
  const proj = (p) => ({
    x: 10 + ((p.lng - Math.min(...lngs)) / (Math.max(...lngs) - Math.min(...lngs) || 1)) * 80,
    y: 90 - ((p.lat - Math.min(...lats)) / (Math.max(...lats) - Math.min(...lats) || 1)) * 80,
  });
  const pts = all.map(proj);

  return (
    <Page mode="slide" style={{ paddingBottom: 'calc(var(--tabbar-safe) + 104px)' }}>
      <TopBar back title="Your route" subtitle="Optimised for shortest distance" hideBell />

      <div className={styles.map}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className={styles.mapSvg}>
          <defs>
            <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
              <path d="M 10 0 L 0 0 0 10" fill="none" stroke="currentColor" strokeWidth="0.3" opacity="0.25" />
            </pattern>
          </defs>
          <rect width="100" height="100" fill="url(#grid)" />
          <motion.polyline
            points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="none" stroke="var(--primary)" strokeWidth="1.2" strokeLinejoin="round" strokeLinecap="round" strokeDasharray="2 1.5"
            initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.2, ease: 'easeOut' }}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {pts.map((p, i) => (
          <div key={i} className={styles.pinWrap} style={{ left: `${p.x}%`, top: `${p.y}%` }}>
            <motion.div className={`${styles.pin} ${i === 0 ? styles.pinStart : ''}`} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.2 + i * 0.15, type: 'spring' }}>
              {i === 0 ? '🏢' : i}
            </motion.div>
          </div>
        ))}
        <div className={styles.mapLabel}>Map preview · Pune</div>
      </div>

      <Card padding={16} className={styles.summary}>
        <div><div className="big-number">{order.length}</div><div className="hint">stops</div></div>
        <div><div className="big-number">{total.toFixed(0)} km</div><div className="hint">total</div></div>
        <div><div className="big-number">~{(totalMins / 60).toFixed(1)}h</div><div className="hint">incl. meetings</div></div>
      </Card>

      <div className="section-head">
        <h2 className="section-title">Stops</h2>
        <button className="link" onClick={() => setReorder((r) => !r)}>{reorder ? 'Done' : 'Reorder'}</button>
      </div>

      <Reorder.Group axis="y" values={order} onReorder={setOrder} className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {legs.map((leg, i) => (
          <Reorder.Item key={leg.d.id} value={leg.d} drag={reorder ? 'y' : false} style={{ listStyle: 'none' }}>
            <Card padding={16} noChevron onClick={reorder ? undefined : () => navigate(`/visits/new?dsa=${leg.d.id}`)}>
              <div className="row" style={{ gap: 12 }}>
                <div className={styles.num}>{i + 1}</div>
                <Avatar name={leg.d.name} size={40} />
                <div className="grow">
                  <div style={{ fontWeight: 600 }} className="truncate">{leg.d.name}</div>
                  <div className="hint row" style={{ gap: 4 }}><FiMapPin size={12} /> {leg.d.location}</div>
                  <div className="hint row" style={{ gap: 4, marginTop: 2 }}>
                    <FiClock size={12} /> ETA {leg.eta} · {leg.dist.toFixed(1)} km from {i === 0 ? 'branch' : 'previous'}
                  </div>
                </div>
                {reorder ? <FiMove size={20} color="var(--text-3)" /> : <span className="hint" style={{ color: 'var(--primary)', fontWeight: 600, whiteSpace: 'nowrap' }}>Log visit</span>}
              </div>
            </Card>
          </Reorder.Item>
        ))}
      </Reorder.Group>

      <div className={styles.planBar}>
        <Button full icon={<FiNavigation />} onClick={() => toast('Opening Google Maps…', 'info')}>Start navigation</Button>
      </div>
    </Page>
  );
}
