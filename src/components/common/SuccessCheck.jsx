import { useEffect } from 'react';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';

export function fireConfetti(opts = {}) {
  confetti({ particleCount: 90, spread: 70, origin: { y: 0.6 }, zIndex: 2000, ...opts });
  setTimeout(() => confetti({ particleCount: 50, angle: 60, spread: 55, origin: { x: 0, y: 0.7 }, zIndex: 2000 }), 200);
  setTimeout(() => confetti({ particleCount: 50, angle: 120, spread: 55, origin: { x: 1, y: 0.7 }, zIndex: 2000 }), 200);
}

/** Checkmark that draws itself inside a green circle with a soft glow. */
export function SuccessCheck({ size = 120, withConfetti = false }) {
  useEffect(() => {
    if (withConfetti) {
      const t = setTimeout(() => fireConfetti(), 500);
      return () => clearTimeout(t);
    }
  }, [withConfetti]);

  return (
    <motion.div
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 18 }}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'var(--success)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        animation: 'glow-green 1.2s ease-out 0.3s',
      }}
    >
      <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 52 52" fill="none">
        <motion.path
          d="M12 27 L22 37 L41 16"
          stroke="#fff"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.5, delay: 0.25, ease: 'easeOut' }}
        />
      </svg>
    </motion.div>
  );
}

/** Full-screen success overlay used after visit submit, DSA add, etc. */
export function SuccessScreen({ title, subtitle, withConfetti = true, children }) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 950, background: 'var(--bg)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: 32, textAlign: 'center', gap: 12,
      }}
    >
      <SuccessCheck withConfetti={withConfetti} />
      <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }} style={{ marginTop: 16 }}>
        {title}
      </motion.h1>
      {subtitle && (
        <motion.p className="text-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}>
          {subtitle}
        </motion.p>
      )}
      {children && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }} style={{ marginTop: 24, width: '100%' }}>
          {children}
        </motion.div>
      )}
    </div>
  );
}
