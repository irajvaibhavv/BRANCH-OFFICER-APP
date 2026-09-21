import { useNavigate } from 'react-router-dom';
import { FiChevronLeft } from 'react-icons/fi';
import { motion } from 'framer-motion';

export default function BackButton({ onClick, style }) {
  const navigate = useNavigate();
  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      // Fall back to Home when there's no in-app history (e.g. deep link / refresh)
      onClick={onClick ?? (() => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/', { replace: true })))}
      aria-label="Back"
      style={{
        width: 38, height: 38,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 11, color: 'var(--primary)', background: 'var(--primary-soft)', flexShrink: 0, ...style,
      }}
    >
      <FiChevronLeft size={22} />
    </motion.button>
  );
}
