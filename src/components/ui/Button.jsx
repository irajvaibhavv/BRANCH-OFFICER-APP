import { motion } from 'framer-motion';
import styles from './Button.module.css';

/**
 * variant: primary | secondary | ghost | danger | danger-outline
 * size: md (52px) | sm (40px)
 */
export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  full = false,
  icon,
  iconRight,
  loading = false,
  disabled = false,
  className = '',
  ...rest
}) {
  return (
    <motion.button
      whileTap={disabled || loading ? {} : { scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 400, damping: 20 }}
      className={[styles.btn, styles[variant], styles[size], full ? styles.full : '', className].join(' ')}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <span className={`${styles.spinner} spin`} /> : icon}
      <span>{children}</span>
      {iconRight}
    </motion.button>
  );
}
