import { useMemo, useState } from 'react';
import { FiCheck, FiChevronDown, FiHelpCircle } from 'react-icons/fi';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { useAppState } from '../../context/AppStateContext';
import { buildQuestions, TOPICS } from '../../services/meeting/prep';
import styles from './MeetingPrep.module.css';

/** Builds the question set for a DSA from live app state. */
export function useMeetingQuestions(dsa) {
  const { loanFiles, visits, recordings, engagements } = useAppState();
  const [doneTodos] = useLocalStorage('bo_todo_done', {});
  return useMemo(() => (dsa ? buildQuestions(dsa, { loanFiles, visits, recordings, engagements, doneTodos }) : []), [dsa, loanFiles, visits, recordings, engagements, doneTodos]);
}

/**
 * Question list. checkable → each row has a tick box (covered / not covered).
 * limit → show only the first N.
 */
export default function QuestionList({ questions, checkable = false, covered = [], onToggle, limit, compact = false }) {
  const [open, setOpen] = useState(null);
  const list = limit ? questions.slice(0, limit) : questions;
  return (
    <div className={styles.list}>
      {list.map((x) => {
        const t = TOPICS[x.topic];
        const isCovered = covered.includes(x.id);
        const expanded = open === x.id;
        return (
          <div key={x.id} className={`${styles.item} ${isCovered ? styles.covered : ''}`}>
            {checkable && (
              <button className={`${styles.tick} ${isCovered ? styles.tickOn : ''}`} onClick={() => onToggle?.(x.id)} aria-label={isCovered ? 'Mark not covered' : 'Mark covered'}>
                {isCovered && <FiCheck size={12} />}
              </button>
            )}
            <div className="grow" style={{ minWidth: 0 }}>
              <div className={styles.meta}>
                <span className={styles.topic} style={{ '--tile': t.color }}>{t.label}</span>
                {x.priority === 'high' && <span className={styles.prio}>Must ask</span>}
              </div>
              {/* Crisp line by default (the officer frames the question); the full wording is one tap away. */}
              <button className={styles.q} onClick={() => setOpen(expanded ? null : x.id)}>
                <span>{x.nudge ?? x.q}</span>
                {!compact && <FiChevronDown size={16} className={`${styles.chev} ${expanded ? styles.chevOn : ''}`} />}
              </button>
              {expanded && !compact && (
                <div className={styles.why}>
                  {x.nudge && <div className={styles.fullQ}>“{x.q}”</div>}
                  <div><FiHelpCircle size={12} /> <b>Why ask:</b> {x.why}</div>
                  {x.followUp && <div style={{ marginTop: 4 }}><b>Then:</b> {x.followUp}</div>}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
