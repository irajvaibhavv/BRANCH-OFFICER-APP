import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { FiX, FiChevronLeft, FiChevronRight, FiCheck, FiHelpCircle, FiUser, FiCpu, FiFlag, FiAlertTriangle, FiArrowRight, FiEdit2, FiFileText } from 'react-icons/fi';
import Avatar from '../../components/ui/Avatar';
import Page from '../../components/layout/Page';
import TopBar from '../../components/layout/TopBar';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { getCase } from '../../services/sarthi/knowledge';
import { loadHot, prepareHotQuestions, officerQa, summariseOfficerPd } from '../../services/sarthi/prep';
import { dsaFile, dsaOfficerQuestions, writeDsaReport, fallbackDsaReport } from '../../services/sarthi/dsa';
import { useAppState } from '../../context/AppStateContext';
import ConfirmPd from '../../components/sarthi/ConfirmPd';
import { readRetention, expiry } from '../../services/retention';
import styles from './SarthiOfficer.module.css';

// The officer takes the PD themselves, one of Sarthi's file questions per slide (the DSA prompter's layout),
// each ticked with a note of what was said. Notes stay in bo_sarthi_officer_<case>.
const SECTION = {
  personal: ['Personal', '#2563eb'],
  business: ['Business', '#16a34a'],
  financial: ['Money', '#d97706'],
  documents: ['Documents', '#0e7490'],
  loan_purpose: ['Loan', '#dc2626'],
};
const fmtClock = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

export default function SarthiOfficer() {
  const { id } = useParams();
  const navigate = useNavigate();
  const c = getCase(id);
  const [hot, setHot] = useState(() => loadHot(id));
  const [notes, setNotes] = useLocalStorage(`bo_sarthi_officer_${id}`, {});
  const [params] = useSearchParams();
  const [, setSummary] = useLocalStorage(`bo_sarthi_officer_sum_${id}`, null);

  useEffect(() => {
    if (hot?.questions?.length) return undefined;
    const subject = getCase(id);
    if (!subject) return undefined;
    let live = true;
    prepareHotQuestions(subject).then((r) => { if (live) setHot(r); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!c) return null;
  const questions = hot?.questions ?? [];
  if (params.get('done') === '1') return <OfficerResult c={c} qa={officerQa(questions, notes)} />;
  return (
    <Deck
      name={c.name} kind="PD" questions={questions} notes={notes} setNotes={setNotes}
      sectionOf={(q) => SECTION[q?.section] ?? SECTION.loan_purpose}
      waitText={`Sarthi is reading ${c.name.split(' ')[0]}'s file…`}
      finishLabel="Finish PD"
      // Finishing shows what was said and a summary, like a recorded meeting; a fresh finish re-summarises the notes.
      onFinish={() => { setSummary(null); navigate(`/sarthi/officer/${id}?done=1`, { replace: true }); }}
      onSwitch={() => navigate(`/sarthi/interview/${c.id}`, { replace: true })}
    />
  );
}

// DSA review sections, in the order Sarthi walks them.
const DSA_SECTION = {
  Identity: '#2563eb', 'Where customers come from': '#0e7490', 'File quality': '#d97706', Numbers: '#16a34a',
  'Working with us': '#7c3aed', 'Plan ahead': '#db2777', Compliance: '#dc2626',
};

/**
 * /sarthi/officer/dsa/:id — the officer takes the DSA review themselves: Sarthi's topics as cards, each with what the
 * branch's record says, so a wrong answer can be challenged on the spot. Finishing writes the same DSA report.
 */
export function SarthiDsaOfficer() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getDsa, loanFiles, engagements } = useAppState();
  const dsa = getDsa(id);
  const file = useMemo(() => (dsa ? dsaFile(dsa, { loanFiles, engagements }) : null), [dsa?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const questions = useMemo(() => (file ? dsaOfficerQuestions(file) : []), [file]);
  const [notes, setNotes] = useLocalStorage(`bo_dsa_officer_${id}`, {});
  const [, setReports] = useLocalStorage('bo_ai_reports', []);
  const [writing, setWriting] = useState(false);
  if (!dsa) return null;

  const finish = async () => {
    setWriting(true);
    const qa = questions.filter((q) => notes[q.id]?.note?.trim()).map((q) => ({ id: q.id, section: q.section, q: q.q, a: notes[q.id].note.trim() }));
    const input = { file, qa, rechecks: [] };
    let report;
    try { report = await writeDsaReport(input); } catch (e) {
      console.warn(`[sarthi] DSA report failed (${e?.message}) — built from the notes`);
      report = fallbackDsaReport(input);
    }
    const rid = `odsa_${Date.now()}`;
    setReports((prev) => [{
      ...report, id: rid, kind: 'dsa', partyId: dsa.id, partyName: dsa.name, scoreLabel: 'Partner score', recommendation: null,
      createdAt: new Date().toISOString(), takenBy: 'officer', transcript: qa.flatMap((x) => [{ from: 'ai', text: x.q }, { from: 'user', text: x.a }]),
    }, ...prev]);
    navigate(`/ai/reports/${rid}`, { replace: true });
  };

  if (writing) return <div className={styles.screen}><p className={styles.wait}>Writing the review report from your notes…</p></div>;
  return (
    <Deck
      name={dsa.name} kind="Review" questions={questions} notes={notes} setNotes={setNotes}
      sectionOf={(q) => [q?.section ?? '', DSA_SECTION[q?.section] ?? '#4c1d95']}
      finishLabel="Save & finish review"
      onFinish={finish}
      onSwitch={() => navigate(`/sarthi/dsa/${dsa.id}`, { replace: true })}
    />
  );
}

/** One question per slide (the DSA prompter's layout), each ticked with a note of what was said. */
function Deck({ name, kind, questions, notes, setNotes, sectionOf, waitText, finishLabel, onFinish, onSwitch }) {
  const navigate = useNavigate();
  const [i, setI] = useState(0);
  const [dir, setDir] = useState(1);
  const [secs, setSecs] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const q = questions[i];
  const n = (q && notes[q.id]) ?? {};
  const [label, color] = sectionOf(q);
  const covered = questions.filter((h) => notes[h.id]?.done).length;
  const set = (qid, patch) => setNotes((prev) => ({ ...prev, [qid]: { ...prev[qid], ...patch, at: new Date().toISOString() } }));
  const go = (k) => { if (k < 0 || k >= questions.length) return; setDir(k > i ? 1 : -1); setI(k); };
  const tick = () => { set(q.id, { done: !n.done }); if (!n.done) go(i + 1); };

  return (
    <div className={`${styles.screen} ${styles.call}`}>
      <div className={styles.top}>
        <button className={styles.iconBtn} onClick={() => navigate(-1)} aria-label="Close"><FiX size={22} /></button>
        <div className={styles.who}>
          <Avatar name={name} size={34} />
          <div style={{ minWidth: 0 }}>
            <div className={styles.name}>{name}</div>
            <div className={styles.status}><span className={styles.dot} /><FiUser size={11} /> {kind} by you · {fmtClock(secs)}</div>
          </div>
        </div>
        <span className={styles.count}>{questions.length ? `${i + 1}/${questions.length}` : ''}</span>
      </div>

      <div className={styles.dots}>
        {questions.map((h, k) => <button key={h.id} className={`${styles.dotBtn} ${k === i ? styles.dotOn : ''} ${notes[h.id]?.done ? styles.dotDone : ''}`} onClick={() => go(k)} aria-label={`Question ${k + 1}`} />)}
      </div>

      <div className={styles.stage}>
        {!q && <p className={styles.wait}>{waitText}</p>}
        <AnimatePresence mode="wait" custom={dir}>
          {q && (
            <motion.div
              key={q.id}
              className={styles.card}
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
                <span className={styles.topic} style={{ '--tile': color }}>{label}</span>
                {q.covers?.length > 0 && <span className={styles.prio}><FiFlag size={10} /> Covers the basics</span>}
                {n.done && <span className={styles.done}><FiCheck size={11} /> Covered</span>}
              </div>
              <h1 className={styles.headline}>{q.q}</h1>
              {q.why && <div className={styles.why}><FiHelpCircle size={13} /> <span><b>Why:</b> {q.why}</span></div>}
              {q.record && <div className={styles.record}><FiFileText size={13} /> <span><b>Branch record:</b> {q.record} — if they say otherwise, ask them about it.</span></div>}
              <textarea
                className={styles.note}
                rows={3}
                value={n.note ?? ''}
                onChange={(e) => set(q.id, { note: e.target.value, done: n.done || !!e.target.value.trim() })}
                // Typing must not start a swipe.
                onPointerDownCapture={(e) => e.stopPropagation()}
                placeholder="What they said…"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className={styles.controls}>
        <button className={styles.navBtn} disabled={i === 0} onClick={() => go(i - 1)} aria-label="Previous"><FiChevronLeft size={24} /></button>
        <button className={`${styles.tickBtn} ${n.done ? styles.tickOn : ''}`} onClick={tick} disabled={!q}><FiCheck size={20} /> {n.done ? 'Covered' : 'Asked it'}</button>
        <button className={styles.navBtn} disabled={i >= questions.length - 1} onClick={() => go(i + 1)} aria-label="Next"><FiChevronRight size={24} /></button>
      </div>
      <button className={styles.endBtn} onClick={onFinish}>
        <FiCheck size={16} /> {finishLabel}
        <span className={styles.endHint}>{covered}/{questions.length} covered</span>
      </button>
      <button className={styles.switch} onClick={onSwitch}>
        <FiCpu size={14} /> Let Sarthi AI take it instead
      </button>
    </div>
  );
}

const SENTIMENT = { positive: 'success', neutral: 'warning', concern: 'danger' };

/** /sarthi/officer/:id?done=1 — the officer's PD as Summary | Transcript, like a recorded meeting. */
function OfficerResult({ c, qa }) {
  const navigate = useNavigate();
  const [summary, setSummary] = useLocalStorage(`bo_sarthi_officer_sum_${c.id}`, null);
  const [view, setView] = useState('Summary');
  const covered = qa.filter((x) => x.done).length;
  const saved = summary?.confirmedBy; // human in the loop: the officer's PD is on file only once confirmed
  const valid = saved ? expiry(saved.at, readRetention().pdValidityDays) : null;
  const on = (d) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  useEffect(() => {
    if (summary) return undefined;
    let live = true;
    summariseOfficerPd(c, qa).then((s) => { if (live) setSummary(s); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary, c.id]);

  return (
    <Page mode="slide">
      <TopBar back title="PD summary" subtitle={`${c.name} · by you`} hideBell />
      <div className="stack">
        {saved ? (
          <Card padding={14} status={valid.expired ? 'danger' : 'success'}>
            <div style={{ fontWeight: 600 }}>Reviewed and saved by {saved.name} ({saved.role})</div>
            <div className="hint" style={{ marginTop: 4 }}>
              {valid.expired ? `Expired on ${on(valid.until)} — take a new PD before any credit decision.` : `Valid till ${on(valid.until)} (${readRetention().pdValidityDays}-day policy)`}
            </div>
          </Card>
        ) : (
          <Card padding={14} status="warning"><div style={{ fontWeight: 600 }}>Not saved yet — review the summary, then confirm it below.</div></Card>
        )}
        <Card padding={14} status={covered === qa.length ? 'success' : 'warning'}>
          <div style={{ fontWeight: 600 }}>Covered {covered} of {qa.length} questions</div>
          {covered < qa.length && <div className="hint" style={{ marginTop: 4 }}>{qa.length - covered} not asked — they are listed under follow-ups.</div>}
        </Card>

        <div className={styles.seg}>
          {['Summary', 'Transcript'].map((t) => (
            <button key={t} className={`${styles.segBtn} ${view === t ? styles.segOn : ''}`} onClick={() => setView(t)}>
              {view === t && <motion.span layoutId="officer-seg" className={styles.segPill} transition={{ type: 'spring', stiffness: 400, damping: 30 }} />}
              <span style={{ position: 'relative' }}>{t}</span>
            </button>
          ))}
        </div>

        {view === 'Summary' ? (
          !summary ? (
            <Card><div className="hint">Sarthi is reading your notes…</div></Card>
          ) : (
            <>
              <Card className="tint-primary">
                <div className="row-between" style={{ marginBottom: 8 }}>
                  <span className="hint" style={{ color: 'var(--primary)', fontWeight: 600 }}>{summary.source === 'ai' ? 'AI summary' : 'Summary'}</span>
                  <Badge tone={SENTIMENT[summary.sentiment] ?? 'warning'} soft>{summary.sentiment}</Badge>
                </div>
                <div style={{ fontWeight: 700, fontSize: 17, lineHeight: 1.35 }}>{summary.headline}</div>
              </Card>
              <List title="Key points" items={summary.keyPoints} empty="No notes were written." />
              {summary.concerns.length > 0 && <List title="Concerns" items={summary.concerns} icon={<FiAlertTriangle size={15} color="var(--warning)" />} />}
              <List title="Follow up" items={summary.followUps} icon={<FiArrowRight size={15} color="var(--primary)" />} empty="Nothing left open." />
            </>
          )
        ) : (
          <Card>
            <div className="row-between" style={{ marginBottom: 12 }}>
              <h3>What was said</h3>
              <span className="hint">{qa.filter((x) => x.a).length} notes</span>
            </div>
            <div className={styles.qaList}>
              {qa.map((x, i) => (
                <div key={x.id} className={styles.qa}>
                  <div className={styles.qaQ}><span className={styles.qaNum}>{i + 1}</span>{x.q}</div>
                  <div className={x.a ? styles.qaA : styles.qaNone}>{x.a || (x.done ? 'Asked — no note written' : 'Not asked')}</div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {summary && !saved && <ConfirmPd what="your notes, the concerns and what is left to follow up" onConfirm={(confirmedBy) => setSummary({ ...summary, confirmedBy })} />}
        <Button full icon={<FiCheck size={18} />} disabled={!saved} onClick={() => navigate('/dsas?tab=customers', { replace: true })}>Done</Button>
        <div className="row" style={{ gap: 8 }}>
          <Button style={{ flex: 1 }} variant="secondary" icon={<FiEdit2 size={16} />} onClick={() => navigate(`/sarthi/officer/${c.id}`, { replace: true })}>Edit notes</Button>
          <Button style={{ flex: 1 }} variant="secondary" icon={<FiFileText size={16} />} onClick={() => navigate(`/sarthi/brief/${c.id}`)}>View file</Button>
        </div>
      </div>
    </Page>
  );
}

function List({ title, items = [], icon, empty }) {
  return (
    <Card>
      <h3 style={{ marginBottom: 10 }}>{title}</h3>
      {items.length === 0 ? <span className="hint">{empty}</span> : (
        <div className={styles.points}>
          {items.map((p, i) => <div key={i} className={styles.point}>{icon ?? <span className={styles.pointDot} />}<span>{p}</span></div>)}
        </div>
      )}
    </Card>
  );
}
