import { motion } from 'framer-motion';
import Button from './Button';

/** Centered empty/error state: emoji (64px) → heading → subtext → CTA. */
export default function EmptyState({ emoji = '📋', title, subtitle, actionLabel, onAction, actionIcon, compact = false }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        padding: compact ? '32px 20px' : '64px 20px',
        gap: 8,
      }}
    >
      <div style={{ fontSize: 64, lineHeight: 1, marginBottom: 8 }}>{emoji}</div>
      <h3>{title}</h3>
      {subtitle && <p className="text-2" style={{ maxWidth: 280 }}>{subtitle}</p>}
      {actionLabel && (
        <div style={{ marginTop: 16 }}>
          <Button onClick={onAction} icon={actionIcon}>{actionLabel}</Button>
        </div>
      )}
    </motion.div>
  );
}
