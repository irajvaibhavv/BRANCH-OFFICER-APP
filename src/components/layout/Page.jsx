import { motion } from 'framer-motion';

/**
 * Page transition wrapper. Deeper pages slide in from the right; tab pages crossfade.
 * mode: 'slide' | 'fade'
 */
const variants = {
  slide: {
    initial: { x: '100%', opacity: 0.8 },
    animate: { x: 0, opacity: 1, transition: { duration: 0.26, ease: [0.22, 1, 0.36, 1] } },
    exit: { x: '-20%', opacity: 0, transition: { duration: 0.14, ease: 'easeIn' } },
  },
  fade: {
    initial: { opacity: 0 },
    animate: { opacity: 1, transition: { duration: 0.16 } },
    exit: { opacity: 0, transition: { duration: 0.08 } },
  },
};

export default function Page({ children, mode = 'fade', className = '', noTab = false, style }) {
  return (
    <motion.div
      variants={variants[mode]}
      initial="initial"
      animate="animate"
      exit="exit"
      className={`screen ${noTab ? 'screen--no-tab' : ''} ${className}`}
      style={style}
    >
      {children}
    </motion.div>
  );
}

/** Stagger container + item for lists (each item 50ms after the previous). */
export const listContainer = { animate: { transition: { staggerChildren: 0.05 } } };
export const listItem = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } },
};
