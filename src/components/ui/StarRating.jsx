import { motion } from 'framer-motion';
import { IoStar, IoStarOutline } from 'react-icons/io5';

/** 5 stars. Pass onChange to make it tappable. */
export default function StarRating({ value = 0, onChange, size = 18, gap = 2 }) {
  return (
    <div style={{ display: 'inline-flex', gap }} role={onChange ? 'radiogroup' : undefined}>
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= value;
        const Icon = filled ? IoStar : IoStarOutline;
        return (
          <motion.button
            key={n}
            type="button"
            whileTap={onChange ? { scale: 1.3 } : {}}
            onClick={(e) => {
              e.stopPropagation();
              onChange?.(n);
            }}
            disabled={!onChange}
            aria-label={`${n} star`}
            style={{
              color: filled ? '#f59e0b' : 'var(--text-3)',
              display: 'flex',
              cursor: onChange ? 'pointer' : 'default',
              padding: onChange ? 4 : 0,
              minWidth: onChange ? 40 : 'auto',
              minHeight: onChange ? 40 : 'auto',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon size={size} />
          </motion.button>
        );
      })}
    </div>
  );
}
