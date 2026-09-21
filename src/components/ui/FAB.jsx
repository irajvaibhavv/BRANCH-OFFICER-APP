import { motion } from 'framer-motion';
import { FiPlus } from 'react-icons/fi';

/**
 * Floating action button — bottom right, above the tab bar.
 * Gentle pulse every 10s to draw attention; scales up on press.
 */
export default function FAB({ onClick, icon = <FiPlus size={26} />, label, style }) {
  return (
    <div className="fab-pulse" style={{ position: 'fixed', right: 20, bottom: 'calc(var(--tabbar-safe) + 16px)', zIndex: 50, ...style }}>
    <motion.button
      onClick={onClick}
      aria-label={label ?? 'Add'}
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      whileTap={{ scale: 0.92 }}
      style={{
        width: label ? 'auto' : 56,
        height: 56,
        padding: label ? '0 20px 0 16px' : 0,
        borderRadius: label ? 28 : '50%',
        background: 'var(--primary)',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        fontWeight: 600,
        fontSize: 16,
        boxShadow: '0 10px 26px rgba(76,29,149,0.32)',
      }}
    >
      {icon}
      {label && <span>{label}</span>}
    </motion.button>
    </div>
  );
}
