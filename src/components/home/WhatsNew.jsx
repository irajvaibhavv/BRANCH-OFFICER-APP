import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { FiArrowRight, FiAward, FiCalendar, FiFlag, FiTrendingUp, FiZap } from 'react-icons/fi';
import { useAppState } from '../../context/AppStateContext';
import { useRewards } from '../../hooks/useRewards';
import { formatDate, formatINR, toISODate } from '../../utils/formatters';
import news from '../../data/mock/news.json';
import styles from './WhatsNew.module.css';

// Light banners, one soft colour per type: `c` is the accent; the CSS mixes the tint from it (color-mix), so a new
// type is one entry here and dark mode needs no second palette.
const KIND = {
  mela: { tag: 'Loan mela', icon: FiFlag, cta: 'Open', c: '#0f766e' },
  incentive: { tag: 'Incentive', icon: FiTrendingUp, cta: 'See plan', c: '#c2410c' },
  product: { tag: 'Product update', icon: FiZap, cta: 'See more', c: '#6d28d9' },
  event: { tag: 'Event', icon: FiCalendar, cta: 'View', c: '#be185d' },
  win: { tag: 'Branch win', icon: FiAward, cta: 'See ranking', c: '#1d4ed8' },
};
const EVERY_MS = 5000;
const MAX_SLIDES = 6;

/** Live slides first (incentive standing, upcoming loan melas), then news.json. Shared by both styles. */
function useSlides() {
  const { marketing } = useAppState();
  const { target, roadmap } = useRewards();
  const today = toISODate();
  return useMemo(() => {
    const live = [];
    if (target && roadmap.nextSlab) {
      live.push({ id: 'inc', kind: 'incentive', meta: `+${formatINR(roadmap.nextSlab.pays, { compact: false })} this month`, text: `${formatINR(roadmap.nextSlab.more)} more disbursal unlocks the ${roadmap.nextSlab.rate}% slab`, to: '/rewards/plan' });
    } else if (!target) {
      live.push({ id: 'inc', kind: 'incentive', meta: 'This month', text: 'Set your incentive target', cta: 'Set target', to: '/rewards/target' });
    }
    marketing.filter((m) => m.type === 'loan_mela' && m.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 2)
      .forEach((m) => live.push({
        id: m.id, kind: 'mela', meta: `${formatDate(m.date, { weekday: 'short', day: 'numeric', month: 'short' })} · ${m.start}–${m.end}`,
        text: m.title, cta: m.assignedBy && !m.accepted ? 'Accept' : 'Open', to: `/marketing?open=${m.id}`,
      }));
    return [...live, ...news.map((x) => ({ ...x, meta: x.sub }))].slice(0, MAX_SLIDES);
  }, [marketing, target, roadmap, today]);
}

/** Home's "What's new": light promo banners, one soft colour per type. */
export default function WhatsNew() {
  const slides = useSlides();
  return slides.length ? <Banner slides={slides} /> : null;
}

/** Promo banner: one at a time — swipe, tap a dot, or let it turn every 5s (paused while touched, off for reduced motion). */
function Banner({ slides }) {
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);
  const [dir, setDir] = useState(1);
  const [held, setHeld] = useState(false);
  const dragged = useRef(false);
  const n = slides.length;
  const at = ((i % n) + n) % n;
  const go = (step) => { setDir(step); setI((x) => x + step); };

  useEffect(() => {
    if (reduce || held || n < 2) return undefined;
    const t = setInterval(() => { setDir(1); setI((x) => x + 1); }, EVERY_MS);
    return () => clearInterval(t);
  }, [reduce, held, n]);

  const s = slides[at];
  const k = KIND[s.kind] ?? KIND.product;

  return (
    <section className={styles.wrap} aria-roledescription="carousel" aria-label="What's new">
      <div className={styles.viewport} onPointerEnter={() => setHeld(true)} onPointerLeave={() => setHeld(false)}>
        <AnimatePresence initial={false} custom={dir} mode="popLayout">
          <motion.button
            key={s.id}
            type="button"
            className={styles.slide}
            style={{ '--c': k.c }}
            custom={dir}
            variants={{ enter: (d) => ({ x: d > 0 ? '100%' : '-100%', opacity: 0 }), show: { x: 0, opacity: 1 }, leave: (d) => ({ x: d > 0 ? '-100%' : '100%', opacity: 0 }) }}
            initial="enter" animate="show" exit="leave"
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={0.6}
            onDragStart={() => { dragged.current = true; setHeld(true); }}
            onDragEnd={(_, info) => {
              setHeld(false);
              if (Math.abs(info.offset.x) > 50 || Math.abs(info.velocity.x) > 400) go(info.offset.x < 0 ? 1 : -1);
              setTimeout(() => { dragged.current = false; }, 0);
            }}
            onClick={() => { if (!dragged.current) navigate(s.to); }}
            aria-label={`${at + 1} of ${n}: ${k.tag}. ${s.text}`}
          >
            <motion.span className={styles.art} aria-hidden="true" initial={{ scale: 0.7, rotate: -12, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ delay: 0.12, type: 'spring', stiffness: 200, damping: 16 }}>
              <k.icon size={64} strokeWidth={1.6} />
            </motion.span>
            <span className={styles.body}>
              <span className={styles.eyebrow}>{k.tag}{s.meta ? ` · ${s.meta}` : ''}</span>
              <span className={styles.title}>{s.text}</span>
              <span className={styles.cta}>{s.cta ?? k.cta} <FiArrowRight size={14} /></span>
            </span>
          </motion.button>
        </AnimatePresence>
      </div>
      {n > 1 && (
        <div className={styles.dots}>
          {slides.map((x, j) => (
            <button key={x.id} type="button" className={j === at ? styles.dotOn : ''} onClick={() => { setDir(j > at ? 1 : -1); setI(j); }} aria-label={`Show ${j + 1} of ${n}`} aria-current={j === at} />
          ))}
        </div>
      )}
    </section>
  );
}
