import { createContext, useCallback, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FiCheckCircle, FiAlertCircle, FiInfo, FiAlertTriangle } from 'react-icons/fi';
import styles from './Toast.module.css';

export const ToastContext = createContext({ toast: () => {} });

const ICONS = {
  success: <FiCheckCircle size={20} />,
  error: <FiAlertCircle size={20} />,
  warning: <FiAlertTriangle size={20} />,
  info: <FiInfo size={20} />,
};

/** Wrap the app once; call `toast('msg', 'success')` from anywhere via useToast(). */
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);

  const toast = useCallback((message, type = 'info', duration = 3000) => {
    const id = Date.now() + Math.random();
    setItems((t) => [...t, { id, message, type }]);
    setTimeout(() => setItems((t) => t.filter((x) => x.id !== id)), duration);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className={styles.host}>
        <AnimatePresence>
          {items.map((t) => (
            <motion.div
              key={t.id}
              className={`${styles.toast} ${styles[t.type]}`}
              initial={{ y: -60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            >
              {ICONS[t.type]}
              <span>{t.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
