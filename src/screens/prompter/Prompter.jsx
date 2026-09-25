import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { FiX, FiChevronLeft, FiChevronRight, FiCheck, FiPhone, FiMic, FiHelpCircle, FiSquare } from 'react-icons/fi';
import Avatar from '../../components/ui/Avatar';
import { useAppState } from '../../context/AppStateContext';
import { useMeetingQuestions } from '../../components/meeting/MeetingPrep';
import { TOPICS } from '../../services/meeting/prep';
import styles from './prompter.module.css';

// /prompter?dsa=…&mode=call|record — one question at a time. Record mode hands off to the recorder.
const fmtClock = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

export default function Prompter() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { getDsa } = useAppState();
  const dsaId = params.get('dsa') ?? '';
  const mode = params.get('mode') === 'record' ? 'record' : 'call';
  const dsa = getDsa(dsaId);
  const questions = useMeetingQuestions(dsa);

  const [i, setI] = useState(0);
  const [dir, setDir] = useState(1);
  const [covered, setCovered] = useState([]);
  const [secs, setSecs] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  if (!dsa) return null;
  const q = questions[i];
  const t = q ? TOPICS[q.topic] : null;
  const first = dsa.name.split(' ')[0];
  const go = (n) => { if (n < 0 || n >= questions.length) return; setDir(n > i ? 1 : -1); setI(n); };
  const tick = () => { setCovered((c) => (c.includes(q.id) ? c.filter((x) => x !== q.id) : [...c, q.id])); if (!covered.includes(q.id) && i < questions.length - 1) go(i + 1); };
  const finish = () => {
    if (mode === 'record') navigate(`/record?dsa=${dsaId}&secs=${secs}&stop=1`, { replace: true, state: { covered } });
    else navigate(-1);
  };

  return (
    <div className={`${styles.screen} ${mode === 'record' ? styles.rec : styles.call}`}>
      {/* Status strip: who + live clock */}
      <div className={styles.top}>
        <button className={styles.iconBtn} onClick={() => navigate(-1)} aria-label="Close"><FiX size={22} /></button>
        <div className={styles.who}>
          <Avatar name={dsa.name} size={34} />
          <div style={{ minWidth: 0 }}>
            <div className={styles.name}>{dsa.name}</div>
            <div className={styles.status}>
              <span className={styles.dot} />
              {mode === 'record' ? <><FiMic size={11} /> Recording</> : <><FiPhone size={11} /> On call</>} · {fmtClock(secs)}
            </div>
          </div>
        </div>
        <span className={styles.count}>{i + 1}/{questions.length}</span>
      </div>

      {/* Progress dots */}
      <div className={styles.dots}>
        {questions.map((x, n) => <button key={x.id} className={`${styles.dotBtn} ${n === i ? styles.dotOn : ''} ${covered.includes(x.id) ? styles.dotDone : ''}`} onClick={() => go(n)} aria-label={`Question ${n + 1}`} />)}
      </div>

      {/* The question */}
      <div className={styles.stage}>
        <AnimatePresence mode="wait" custom={dir}>
          {q && (
            <motion.div
              key={q.id}
              className={styles.card}
              custom={dir}
              initial={{ opacity: 0, x: dir * 60 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -dir * 60 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.4}
              onDragEnd={(_, info) => { if (info.offset.x < -70) go(i + 1); else if (info.offset.x > 70) go(i - 1); }}
            >
              <div className={styles.meta}>
                <span className={styles.topic} style={{ '--tile': t.color }}>{t.label}</span>
                {q.priority === 'high' && <span className={styles.prio}>Must ask</span>}
                {covered.includes(q.id) && <span className={styles.done}><FiCheck size={11} /> Covered</span>}
              </div>
              <h1 className={styles.headline}>{q.nudge ?? q.q}</h1>
              <p className={styles.full}>{q.q}</p>
              <div className={styles.why}><FiHelpCircle size={13} /> <span><b>Why:</b> {q.why}{q.followUp && <> <b>Then:</b> {q.followUp}</>}</span></div>
            </motion.div>
          )}
        </AnimatePresence>
        {!q && <p className="hint" style={{ textAlign: 'center' }}>No prepared questions for {first}.</p>}
      </div>

      {/* Controls */}
      <div className={styles.controls}>
        <button className={styles.navBtn} disabled={i === 0} onClick={() => go(i - 1)} aria-label="Previous"><FiChevronLeft size={24} /></button>
        <button className={`${styles.tickBtn} ${covered.includes(q?.id) ? styles.tickOn : ''}`} onClick={tick}><FiCheck size={20} /> {covered.includes(q?.id) ? 'Covered' : 'Asked it'}</button>
        <button className={styles.navBtn} disabled={i >= questions.length - 1} onClick={() => go(i + 1)} aria-label="Next"><FiChevronRight size={24} /></button>
      </div>
      <button className={styles.endBtn} onClick={finish}>
        {mode === 'record' ? <><FiSquare size={16} /> Stop &amp; summarise</> : <><FiPhone size={16} /> End call</>}
        <span className={styles.endHint}>{covered.length}/{questions.length} covered</span>
      </button>
    </div>
  );
}
