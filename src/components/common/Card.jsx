import { motion } from 'framer-motion';
import { FiChevronRight } from 'react-icons/fi';
import styles from './Card.module.css';

/**
 * The building block of the whole app.
 * - onClick   → makes it an Action Card (press scale + chevron unless noChevron)
 * - status    → Status Card with 4px left border: success | warning | danger | primary
 * - padding   → override (e.g. 0 for lists, 16 for compact)
 */
export default function Card({ children, onClick, status, padding, className = '', noChevron = false, style, ...rest }) {
  const tappable = !!onClick;
  const cls = [styles.card, status ? styles[`status_${status}`] : '', tappable ? styles.tappable : '', className].join(' ');
  const inner = (
    <>
      <div className={styles.body}>{children}</div>
      {tappable && !noChevron && <FiChevronRight className={styles.chevron} size={20} />}
    </>
  );
  const s = { ...(padding != null ? { padding } : {}), ...style };

  if (tappable) {
    return (
      <motion.div
        whileTap={{ scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 400, damping: 22 }}
        className={cls}
        style={s}
        onClick={onClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && onClick(e)}
        {...rest}
      >
        {inner}
      </motion.div>
    );
  }
  return (
    <div className={cls} style={s} {...rest}>
      {inner}
    </div>
  );
}

/** Metric Card — one prominent number with a label below. */
export function MetricCard({ value, label, delta, tone, icon, onClick }) {
  return (
    <Card padding={16} onClick={onClick} noChevron className={styles.metric}>
      {icon && <div className={styles.metricIcon} data-tone={tone}>{icon}</div>}
      <div className="big-number" style={tone ? { color: `var(--${tone})` } : undefined}>{value}</div>
      <div className="label">{label}</div>
      {delta != null && (
        <span className={delta >= 0 ? 'delta-up' : 'delta-down'}>
          {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}%
        </span>
      )}
    </Card>
  );
}
