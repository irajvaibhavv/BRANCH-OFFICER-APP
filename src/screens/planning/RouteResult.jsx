import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Reorder } from 'framer-motion';
import { FiNavigation, FiMove, FiMapPin, FiClock } from 'react-icons/fi';
import Page from '../../components/layout/Page';
import TopBar from '../../components/layout/TopBar';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Avatar from '../../components/ui/Avatar';
import RouteMap from '../../components/charts/RouteMap';
import { START, km, optimise } from '../../utils/route';
import { useAppState } from '../../context/AppStateContext';
import { useToast } from '../../hooks/useToast';
import styles from './route.module.css';

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

  return (
    <Page mode="slide" style={{ paddingBottom: 'calc(var(--tabbar-safe) + 104px)' }}>
      <TopBar back title="Your route" subtitle="Optimised for shortest distance" hideBell />

      <RouteMap stops={order} height={220} className={styles.mapGap} />

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
