import { useNavigate } from 'react-router-dom';
import { FiUsers, FiUser, FiHome, FiChevronRight } from 'react-icons/fi';
import BottomSheet from '../ui/BottomSheet';
import styles from './PlanChooser.module.css';

const PLAN_MODES = [
  { id: 'dsa', to: '/plan', title: 'Visit DSAs', short: 'Filters + route', sub: 'Filter by distance, rating, pending files… then get the fastest route', icon: FiUsers, tone: '#4c1d95' },
  { id: 'customer', to: '/plan/customers', title: 'Meet customers', short: 'New · leads · existing', sub: 'New walk-ins, leads or existing borrowers — with loan calculator', icon: FiUser, tone: '#0f766e' },
  { id: 'branch', to: '/plan/branch', title: 'Work from branch', short: 'Desk tasks', sub: 'Follow-ups, calls and file work — no travel today', icon: FiHome, tone: '#d97706' },
];

export default function PlanChooser({ open, onClose }) {
  const navigate = useNavigate();
  return (
    <BottomSheet open={open} onClose={onClose} title="Plan your day">
      <p className="hint" style={{ marginBottom: 14 }}>Where are you heading today?</p>
      <div className={styles.modes}>
        {PLAN_MODES.map((m) => (
          <button key={m.id} className={styles.mode} onClick={() => { onClose(); navigate(m.to); }}>
            <span className="icon-tile" style={{ '--tile': m.tone, width: 46, height: 46, borderRadius: 14, flexShrink: 0 }}><m.icon size={22} /></span>
            <span className="grow" style={{ minWidth: 0 }}>
              <span className={styles.modeTitle} style={{ display: 'block' }}>{m.title}</span>
              <span className="hint clamp2" style={{ display: 'block' }}>{m.sub}</span>
            </span>
            <FiChevronRight size={18} color="var(--text-3)" />
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}
