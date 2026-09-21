import { AnimatePresence, motion } from 'framer-motion';
import { FiCloudOff, FiCheckCircle, FiRefreshCw } from 'react-icons/fi';
import { useOffline } from '../../context/OfflineContext';

/**
 * Amber "offline" banner → "Syncing…" → green "All data synced" (fades after 3s).
 * Rendered above the app content so every screen shows it.
 */
export default function OfflineBanner() {
  const { isOnline, syncState, queue } = useOffline();

  let state = null;
  if (!isOnline) state = 'offline';
  else if (syncState === 'syncing') state = 'syncing';
  else if (syncState === 'synced') state = 'synced';

  const cfg = {
    offline: {
      bg: 'var(--warning)', color: '#111827', icon: <FiCloudOff size={18} />,
      text: `You are offline. Data will sync when connection returns${queue.length ? ` (${queue.length} pending)` : ''}`,
    },
    syncing: { bg: 'var(--primary)', color: '#fff', icon: <FiRefreshCw size={18} className="spin" />, text: 'Syncing…' },
    synced: { bg: 'var(--success)', color: '#fff', icon: <FiCheckCircle size={18} />, text: 'All data synced' },
  }[state];

  return (
    <AnimatePresence>
      {state && (
        <motion.div
          key={state}
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.3 }}
          style={{ overflow: 'hidden' }}
        >
          <div style={{ background: cfg.bg, color: cfg.color, padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, fontWeight: 500 }}>
            {cfg.icon}
            <span>{cfg.text}</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
