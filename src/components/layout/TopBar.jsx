import { useNavigate } from 'react-router-dom';
import { FiBell } from 'react-icons/fi';
import { motion } from 'framer-motion';
import { useAppState } from '../../context/AppStateContext';
import BackButton from './BackButton';
import styles from './TopBar.module.css';

/**
 * Sticky top bar: title left, bell (with unread badge) right.
 * back=true shows the arrow instead of a large title.
 * right = custom slot replacing/adding to the bell.
 */
export default function TopBar({ title, subtitle, back = false, onBack, right, hideBell = false, transparent = false }) {
  const navigate = useNavigate();
  const { unreadCount } = useAppState();

  const bell = !hideBell && (
    <motion.button whileTap={{ scale: 0.9 }} className={styles.iconBtn} onClick={() => navigate('/notifications')} aria-label="Notifications">
      <FiBell size={20} />
      {unreadCount > 0 && <span className={styles.badge}>{unreadCount}</span>}
    </motion.button>
  );

  // Tab pages: brand row (wordmark + actions) with the title beneath — like the FinLeap header.
  // Deeper pages: back chevron + title in a single row.
  if (!back) {
    return (
      <header className={`${styles.bar} ${transparent ? styles.transparent : ''}`}>
        <div className={styles.brandRow}>
          <div className={styles.brand}>SMFG<span>·</span>BO</div>
          <div className={styles.right}>{right}{bell}</div>
        </div>
        <div className={styles.titles}>
          <h1 className={styles.title}>{title}</h1>
          {subtitle && <span className="hint">{subtitle}</span>}
        </div>
      </header>
    );
  }

  return (
    <header className={`${styles.bar} ${transparent ? styles.transparent : ''}`}>
      <div className={styles.left}>
        <BackButton onClick={onBack} />
        <div className={styles.titles}>
          <h1 className={styles.titleSm}>{title}</h1>
          {subtitle && <span className="hint">{subtitle}</span>}
        </div>
      </div>
      <div className={styles.right}>
        {right}
        {bell}
      </div>
    </header>
  );
}
