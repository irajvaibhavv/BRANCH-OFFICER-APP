import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useMotionValue, useTransform } from 'framer-motion';
import { FiBell, FiAlertTriangle, FiTrendingUp, FiInfo, FiCheck, FiAlertCircle } from 'react-icons/fi';
import Page from '../../components/layout/Page';
import TopBar from '../../components/layout/TopBar';
import EmptyState from '../../components/ui/EmptyState';
import Card from '../../components/ui/Card';
import { useAppState } from '../../context/AppStateContext';
import { timeAgo, toISODate } from '../../utils/formatters';
import styles from './notifications.module.css';

const TYPES = {
  visit: { icon: FiBell, color: 'var(--primary)', bg: 'var(--primary-soft)' },
  inactivity: { icon: FiAlertTriangle, color: '#b45309', bg: 'var(--warning-soft)' },
  incentive: { icon: FiTrendingUp, color: 'var(--success)', bg: 'var(--success-soft)' },
  announcement: { icon: FiInfo, color: 'var(--text-2)', bg: 'var(--border)' },
};

export default function NotificationPanel() {
  const navigate = useNavigate();
  const { notifications, markRead, markAllRead, unreadCount, attention } = useAppState();

  const groups = useMemo(() => {
    const today = toISODate();
    const y = new Date(); y.setDate(y.getDate() - 1);
    const yest = toISODate(y);
    const g = { Today: [], Yesterday: [], Earlier: [] };
    [...notifications].sort((a, b) => b.at.localeCompare(a.at)).forEach((n) => {
      const d = n.at.slice(0, 10);
      (d === today ? g.Today : d === yest ? g.Yesterday : g.Earlier).push(n);
    });
    return Object.entries(g).filter(([, v]) => v.length);
  }, [notifications]);

  return (
    <Page mode="slide">
      <TopBar back title="Notifications" subtitle={[attention.length && `${attention.length} need attention`, unreadCount && `${unreadCount} unread`].filter(Boolean).join(' · ') || 'All caught up'} hideBell right={
        unreadCount > 0 && <button className="link" style={{ color: 'var(--primary)', fontWeight: 600, fontSize: 14, padding: '0 8px', minHeight: 48 }} onClick={markAllRead}>Mark all read</button>
      } />
      {/* Needs attention — live action items; they clear when the work is done, not by marking read */}
      {attention.length > 0 && (
        <div>
          <div className={styles.groupHead}>Needs attention</div>
          <div className="stack" style={{ gap: 8 }}>
            {attention.map((a) => (
              <Card key={a.key} padding={14} status="warning" onClick={() => navigate(a.to)}>
                <div className="row" style={{ gap: 10 }}>
                  <FiAlertCircle size={18} color="var(--warning)" style={{ flexShrink: 0 }} />
                  <span className="grow" style={{ fontSize: 15 }}>{a.text}</span>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
      {groups.length === 0 ? (attention.length === 0 && <EmptyState emoji="🔔" title="No notifications" subtitle="You're all caught up." />) : groups.map(([label, items]) => (
        <div key={label}>
          <div className={styles.groupHead}>{label}</div>
          <div className="stack" style={{ gap: 8 }}>
            <AnimatePresence initial={false}>
              {items.map((n) => (
                <NotifRow key={n.id} n={n} onRead={() => markRead(n.id)} onOpen={() => { markRead(n.id); navigate(n.link); }} />
              ))}
            </AnimatePresence>
          </div>
        </div>
      ))}
      <p className="hint" style={{ textAlign: 'center', marginTop: 16 }}>Swipe right to mark as read</p>
    </Page>
  );
}

function NotifRow({ n, onRead, onOpen }) {
  const t = TYPES[n.type];
  const Icon = t.icon;
  const x = useMotionValue(0);
  const bgOpacity = useTransform(x, [0, 80], [0, 1]);
  return (
    <motion.div layout className={styles.wrap}>
      <motion.div className={styles.readBg} style={{ opacity: bgOpacity }}><FiCheck size={20} /> Read</motion.div>
      <motion.div
        drag={n.read ? false : 'x'}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0, right: 0.5 }}
        style={{ x }}
        onDragEnd={(_, i) => { if (i.offset.x > 80) onRead(); }}
        onClick={onOpen}
        className={`${styles.row} ${n.read ? styles.read : ''}`}
        data-type={n.type}
      >
        <div className={styles.icon} style={{ background: t.bg, color: t.color }}><Icon size={20} /></div>
        <div className="grow">
          <div className="row-between">
            <span style={{ fontWeight: n.read ? 500 : 700, fontSize: 15 }}>{n.title}</span>
            <span className="hint">{timeAgo(n.at)}</span>
          </div>
          <div style={{ fontSize: 14, color: n.read ? 'var(--text-2)' : 'var(--text-1)', marginTop: 2, lineHeight: 1.45 }}>{n.message}</div>
        </div>
        {!n.read && <span className={styles.unreadDot} />}
      </motion.div>
    </motion.div>
  );
}
