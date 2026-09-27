import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FiCheck, FiCpu } from 'react-icons/fi';
import Page from '../../components/layout/Page';
import TopBar from '../../components/layout/TopBar';
import EmptyState from '../../components/ui/EmptyState';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { getCase } from '../../services/sarthi/knowledge';
import { loadHot, prepareHotQuestions } from '../../services/sarthi/prep';
import styles from './SarthiOfficer.module.css';

// The officer takes the PD themselves: the file's questions as a sheet, each ticked with a note of what was said.
export default function SarthiOfficer() {
  const { id } = useParams();
  const navigate = useNavigate();
  const c = getCase(id);
  const [hot, setHot] = useState(() => loadHot(id));
  const [notes, setNotes] = useLocalStorage(`bo_sarthi_officer_${id}`, {});

  useEffect(() => {
    if (hot?.questions?.length) return undefined;
    const subject = getCase(id);
    if (!subject) return undefined;
    let live = true;
    prepareHotQuestions(subject).then((r) => { if (live) setHot(r); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!c) {
    return (
      <Page mode="slide" className="sarthi">
        <TopBar back title="Case not found" hideBell />
        <EmptyState emoji="🔍" title="That case is not in the list" subtitle="Go back and pick a borrower." />
      </Page>
    );
  }

  const questions = hot?.questions ?? [];
  const done = questions.filter((h) => notes[h.id]?.done).length;
  const set = (qid, patch) => setNotes((prev) => ({ ...prev, [qid]: { ...prev[qid], ...patch, at: new Date().toISOString() } }));

  return (
    <Page mode="slide" className={`sarthi ${styles.page}`}>
      <TopBar back title={`PD with ${c.name.split(' ')[0]}`} subtitle={`${c.business}, ${c.area.split(',')[0]}`} hideBell />

      <p className={styles.lead}>
        Sarthi read the file and suggests these. Ask them in your own words, one at a time. Tick each one as you go and note what they said — the notes stay on this phone.
      </p>
      <div className={styles.count}>
        <span>{done} of {questions.length || '—'} asked</span>
        <span className={styles.bar}><span style={{ width: `${questions.length ? (done / questions.length) * 100 : 0}%` }} /></span>
      </div>

      {!questions.length
        ? <p className={styles.wait}>Preparing the questions from the file…</p>
        : (
          <ol className={styles.list}>
            {questions.map((h, i) => {
              const n = notes[h.id] ?? {};
              return (
                <li key={h.id} className={n.done ? styles.isDone : undefined}>
                  <div className={styles.top}>
                    <span className={styles.num}>{i + 1}</span>
                    <span className={styles.q}>{h.q}</span>
                    <button
                      className={styles.tick}
                      onClick={() => set(h.id, { done: !n.done })}
                      aria-pressed={!!n.done}
                      aria-label={n.done ? 'Mark as not asked' : 'Mark as asked'}
                    >
                      <FiCheck size={16} />
                    </button>
                  </div>
                  {h.why && <p className={styles.why}>{h.why}</p>}
                  <textarea
                    className={styles.note}
                    rows={2}
                    value={n.note ?? ''}
                    onChange={(e) => set(h.id, { note: e.target.value, done: n.done || !!e.target.value.trim() })}
                    placeholder="What they said…"
                  />
                </li>
              );
            })}
          </ol>
        )}

      <div className={styles.foot}>
        <button className={styles.done} onClick={() => navigate('/sarthi')}>Save and close</button>
        <button className={styles.switch} onClick={() => navigate(`/sarthi/interview/${c.id}`)}>
          <FiCpu size={15} /> Let Sarthi AI take it instead
        </button>
      </div>
    </Page>
  );
}
