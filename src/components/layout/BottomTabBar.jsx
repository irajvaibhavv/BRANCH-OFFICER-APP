import { NavLink, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiHome, FiUsers, FiMap, FiActivity, FiGrid } from 'react-icons/fi';
import { IoHome, IoPeople, IoMap, IoPulse, IoGrid } from 'react-icons/io5';
import styles from './BottomTabBar.module.css';

// Outline icon for inactive, filled for active.
const TABS = [
  { to: '/', label: 'Home', outline: FiHome, filled: IoHome, exact: true },
  { to: '/dsas', label: 'DSAs', outline: FiUsers, filled: IoPeople },
  { to: '/route', label: 'Route', outline: FiMap, filled: IoMap },
  { to: '/activity', label: 'Activity', outline: FiActivity, filled: IoPulse },
  { to: '/more', label: 'More', outline: FiGrid, filled: IoGrid },
];

// Deeper screens light up the tab they belong to
function activeTab(pathname) {
  if (pathname === '/') return '/';
  if (pathname.startsWith('/dsas') || pathname.startsWith('/record') || pathname.startsWith('/engagements')) return '/dsas';
  if (pathname.startsWith('/route') || pathname.startsWith('/plan') || pathname.startsWith('/customers')) return '/route';
  if (pathname.startsWith('/ai') || pathname.startsWith('/sarthi')) return '/more';
  if (pathname.startsWith('/activity') || pathname.startsWith('/visits')) return '/activity';
  return '/more';
}

export default function BottomTabBar() {
  const { pathname } = useLocation();
  const current = activeTab(pathname);
  return (
    <nav className={styles.bar}>
      {TABS.map((t) => {
        const active = current === t.to;
        const Icon = active ? t.filled : t.outline;
        return (
          <NavLink key={t.to} to={t.to} className={`${styles.tab} ${active ? styles.active : ''}`}>
            <span className={styles.iconWrap}>
              {active && <motion.span layoutId="tab-pill" className={styles.pill} transition={{ type: 'spring', stiffness: 420, damping: 32 }} />}
              <Icon size={23} />
            </span>
            <span className={styles.label}>{t.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}
