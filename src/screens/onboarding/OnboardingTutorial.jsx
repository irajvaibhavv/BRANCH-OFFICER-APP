import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import Button from '../../components/common/Button';
import { useAuth } from '../../context/AuthContext';
import styles from './onboarding.module.css';

const SLIDES = [
  { emoji: '🤝', bg: 'linear-gradient(135deg,#ede9fb,#e9e0fb)', title: 'Track your DSAs easily', text: 'Every DSA, their files, approval rate and your notes — one tap away. Know who to call before they call you.' },
  { emoji: '🗺️', bg: 'linear-gradient(135deg,#dcfce7,#d1fae5)', title: 'Plan your routes smartly', text: 'Pick today’s visits and get the shortest order. Less riding around, more time with DSAs.' },
  { emoji: '💰', bg: 'linear-gradient(135deg,#fef3c7,#fde68a)', title: 'Watch your incentives grow', text: 'See exactly how far you are from the next slab and which DSA can get you there fastest.' },
  { emoji: '🚀', bg: 'linear-gradient(135deg,#ede9fe,#fae8ff)', title: 'Let’s get started', text: 'Log a visit, record a meeting, generate your daily report — all from your phone, even offline.' },
];

export default function OnboardingTutorial() {
  const navigate = useNavigate();
  const { setOnboarded } = useAuth();
  const [i, setI] = useState(0);
  const [dir, setDir] = useState(1);
  const last = i === SLIDES.length - 1;

  const finish = () => {
    setOnboarded(true);
    navigate('/', { replace: true });
  };
  const go = (n) => {
    setDir(n > i ? 1 : -1);
    setI(Math.max(0, Math.min(SLIDES.length - 1, n)));
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.top}>
        <span className="hint" style={{ fontWeight: 600 }}>{i + 1} / {SLIDES.length}</span>
        {!last && <button className={styles.skip} onClick={finish}>Skip</button>}
      </div>

      <div className={styles.stage}>
        <AnimatePresence mode="wait" custom={dir} initial={false}>
          <motion.div
            key={i}
            className={styles.slide}
            custom={dir}
            initial={{ x: dir * 80, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: dir * -80, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.3}
            onDragEnd={(_, info) => {
              if (info.offset.x < -60) go(i + 1);
              else if (info.offset.x > 60) go(i - 1);
            }}
          >
            <div className={styles.illus} style={{ background: SLIDES[i].bg }}>
              <motion.span initial={{ scale: 0.6, rotate: -10 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 200, damping: 14, delay: 0.1 }}>
                {SLIDES[i].emoji}
              </motion.span>
            </div>
            <h1>{SLIDES[i].title}</h1>
            <p>{SLIDES[i].text}</p>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className={styles.bottom}>
        <div className={styles.dots}>
          {SLIDES.map((_, n) => (
            <motion.button key={n} className={styles.dot} animate={{ width: n === i ? 24 : 8, opacity: n === i ? 1 : 0.35 }} onClick={() => go(n)} aria-label={`Slide ${n + 1}`} />
          ))}
        </div>
        {last ? (
          <Button full onClick={finish}>Get started</Button>
        ) : (
          <Button full onClick={() => go(i + 1)}>Next</Button>
        )}
      </div>
    </div>
  );
}
