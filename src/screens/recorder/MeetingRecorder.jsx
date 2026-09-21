import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { FiMic, FiSquare, FiPause, FiPlay, FiCheck, FiCpu, FiShield, FiWifiOff, FiFileText, FiShare2, FiCopy, FiCalendar, FiMapPin, FiChevronRight, FiClock, FiUser, FiBriefcase } from 'react-icons/fi';
import { IoLogoWhatsapp } from 'react-icons/io5';
import Page from '../../components/layout/Page';
import TopBar from '../../components/layout/TopBar';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Avatar from '../../components/ui/Avatar';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import { Select } from '../../components/ui/Input';
import QuestionList, { useMeetingQuestions } from '../../components/ui/MeetingPrep';
import { useAppState } from '../../context/AppStateContext';
import { useOffline } from '../../context/OfflineContext';
import { useToast } from '../../hooks/useToast';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { formatDate } from '../../utils/formatters';
import { buildTranscript, buildSummary, buildEngagementTranscript, summaryToText, fmtClock } from '../../utils/meetingAI';
import { fmtTime } from '../home/Dashboard';
import styles from './recorder.module.css';

const CAPTION_START = 2; // seconds before the first live caption appears
const CAPTION_EVERY = 5; // seconds between captions while recording
const PROC_STEPS = ['Saving audio securely', 'Transcribing speech', 'Identifying speakers', 'Summarising key points'];

const SENTIMENT_TONE = { positive: 'success', neutral: 'neutral', 'needs follow-up': 'warning' };

/* =====================================================================================
   /record?dsa=…  — record a DSA meeting → live captions → AI summary
   ===================================================================================== */
export default function MeetingRecorder() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { dsas, getDsa, addRecording } = useAppState();
  const { isOnline } = useOffline();
  const { toast } = useToast();

  const [dsaId, setDsaId] = useState(params.get('dsa') ?? '');
  const dsa = getDsa(dsaId);
  const { state: navState } = useLocation();
  // Arriving from the teleprompter (?stop=1&secs=N): the meeting already happened, go straight to processing.
  const handoff = params.get('stop') === '1';
  const [phase, setPhase] = useState(handoff ? 'processing' : 'ready'); // ready | recording | processing | result
  const [paused, setPaused] = useState(false);
  const [secs, setSecs] = useState(handoff ? Number(params.get('secs')) || 0 : 0);
  const [procStep, setProcStep] = useState(0);
  const [saved, setSaved] = useState(null);
  const savedRef = useRef(false);
  const questions = useMeetingQuestions(dsa);
  const [covered, setCovered] = useState(() => navState?.covered ?? []);
  const [showQ, setShowQ] = useState(true);
  const toggleCovered = (qid) => setCovered((c) => (c.includes(qid) ? c.filter((x) => x !== qid) : [...c, qid]));

  // Transcript is fixed once the DSA is known so live captions and the final result agree.
  const gen = useMemo(() => (dsa ? buildTranscript(dsa) : null), [dsa]);

  // Timer
  useEffect(() => {
    if (phase !== 'recording' || paused) return;
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase, paused]);

  // Processing steps → result
  useEffect(() => {
    if (phase !== 'processing') return;
    if (procStep < PROC_STEPS.length) {
      const t = setTimeout(() => setProcStep((s) => s + 1), 750);
      return () => clearTimeout(t);
    }
    if (savedRef.current) return;
    savedRef.current = true;
    const n = gen.lines.length;
    const duration = Math.max(secs, 1);
    const rec = addRecording({
      dsaId,
      durationSecs: duration,
      transcript: gen.lines.map((l, i) => ({ ...l, t: Math.floor((duration * i) / n) })),
      summary: buildSummary(dsa, gen.facts),
    });
    setSaved(rec);
    setPhase('result');
  }, [phase, procStep, gen, secs, dsaId, dsa, addRecording]);

  const revealed = phase === 'recording' ? Math.max(0, Math.min(gen.lines.length, Math.floor((secs - CAPTION_START) / CAPTION_EVERY) + 1)) : 0;

  const start = () => { setSecs(0); setPaused(false); setPhase('recording'); };
  const stop = () => { setProcStep(0); setPhase('processing'); };

  return (
    <Page mode="slide">
      <TopBar back title={phase === 'result' ? 'Meeting summary' : 'Record meeting'} subtitle={dsa ? `${dsa.name} · ${dsa.firm}` : undefined} hideBell />

      {/* DSA picker */}
      {phase === 'ready' && (
        dsa ? (
          <Card padding={16} onClick={() => setDsaId('')} noChevron>
            <div className="row" style={{ gap: 12 }}>
              <Avatar name={dsa.name} size={48} />
              <div className="grow">
                <div style={{ fontWeight: 600, fontSize: 17 }}>{dsa.name}</div>
                <div className="hint row" style={{ gap: 4 }}><FiMapPin size={12} /> {dsa.location}</div>
              </div>
              <span className="link" style={{ color: 'var(--primary)', fontWeight: 600, fontSize: 14 }}>Change</span>
            </div>
          </Card>
        ) : (
          <Select label="Who are you meeting?" placeholder="Select DSA" value={dsaId} onChange={(e) => setDsaId(e.target.value)} options={dsas.map((d) => ({ value: d.id, label: `${d.name} · ${d.location}` }))} />
        )
      )}

      <AnimatePresence mode="wait">
        {/* ---------- READY ---------- */}
        {phase === 'ready' && (
          <motion.div key="ready" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
            <div className={styles.stage}>
              <motion.button className={styles.recBtn} whileTap={{ scale: 0.94 }} onClick={() => (dsa ? start() : toast('Select the DSA first', 'warning'))} aria-label="Start recording">
                <FiMic size={44} />
              </motion.button>
              <h2 style={{ marginTop: 12 }}>Tap to start recording</h2>
              <p className="text-2" style={{ maxWidth: 280 }}>When the meeting ends, you’ll get a full transcript and a summary of the important points.</p>
            </div>
            {dsa && questions.length > 0 && (
              <Card style={{ marginTop: 16 }}>
                <div className="row-between" style={{ marginBottom: 10 }}>
                  <h3>Prepared for {dsa.name.split(' ')[0]}</h3>
                  <span className="hint">{questions.filter((x) => x.priority === 'high').length} must-ask</span>
                </div>
                <QuestionList questions={questions} limit={4} compact />
                {questions.length > 4 && <div className="hint" style={{ marginTop: 8 }}>+{questions.length - 4} more — full checklist appears while recording.</div>}
              </Card>
            )}
            <Card style={{ marginTop: 12 }}>
              <div className={styles.tips}>
                <div className={styles.tip}><span className={styles.tipIcon}><FiShield size={16} /></span><span>Let the DSA know the meeting is being recorded. Audio is stored encrypted on the branch server.</span></div>
                <div className={styles.tip}><span className={styles.tipIcon}><FiCpu size={16} /></span><span>Speaks Hindi, Marathi and English — mixed-language meetings are fine.</span></div>
                <div className={styles.tip}><span className={styles.tipIcon}><FiWifiOff size={16} /></span><span>Works offline. The transcript syncs when you’re back on network.</span></div>
              </div>
            </Card>
          </motion.div>
        )}

        {/* ---------- RECORDING ---------- */}
        {phase === 'recording' && (
          <motion.div key="rec" className="stack" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
            <div className={`${styles.live} ${paused ? styles.paused : ''}`}>
              <span className={styles.liveTag}><span className={styles.dot} /> {paused ? 'PAUSED' : 'RECORDING'}</span>
              <div className={styles.timer}>{fmtClock(secs)}</div>
              <div className={styles.wave}>{[...Array(21)].map((_, i) => <span key={i} style={{ animationDelay: `${(i % 7) * 0.12}s`, animationDuration: `${0.9 + (i % 5) * 0.12}s` }} />)}</div>
              <div className={styles.liveControls}>
                <button className={styles.roundBtn} onClick={() => setPaused((p) => !p)} aria-label={paused ? 'Resume' : 'Pause'}>{paused ? <FiPlay size={22} /> : <FiPause size={22} />}</button>
                <button className={styles.stopBtn} onClick={stop} aria-label="Stop and summarise"><FiSquare size={26} /></button>
                <div style={{ width: 56 }} />
              </div>
              <span className="hint" style={{ marginTop: 6 }}>Tap ■ when the meeting is over</span>
            </div>

            <Card>
              <button className="row-between" style={{ width: '100%', textAlign: 'left' }} onClick={() => setShowQ((v) => !v)}>
                <h3>Questions to cover</h3>
                <span className="hint" style={{ fontWeight: 600, color: covered.length === questions.length ? 'var(--success)' : 'var(--primary)' }}>{covered.length}/{questions.length} covered {showQ ? '▾' : '▸'}</span>
              </button>
              {showQ && <div style={{ marginTop: 10 }}><QuestionList questions={questions} checkable covered={covered} onToggle={toggleCovered} compact /></div>}
            </Card>

            <Card>
              <div className={styles.captions}>
                <div className={styles.captionHead}>
                  <h3>Live transcript</h3>
                  <span className="hint">{isOnline ? 'On-device' : 'Offline'} · {revealed}/{gen.lines.length}</span>
                </div>
                {revealed === 0 && <span className="hint">Listening… captions appear as people speak.</span>}
                {gen.lines.slice(0, revealed).map((l, i) => (
                  <TranscriptLine key={i} line={{ ...l, t: CAPTION_START + i * CAPTION_EVERY }} dsa={dsa} animate />
                ))}
                {revealed < gen.lines.length && revealed > 0 && !paused && (
                  <div className={styles.line}>
                    <span className={`${styles.who} ${revealed % 2 ? styles.whoDsa : styles.whoBo}`}>{revealed % 2 ? initials(dsa.name) : 'You'}</span>
                    <span className={styles.typing}><span /><span /><span /></span>
                  </div>
                )}
                <AutoScroll dep={revealed} />
              </div>
            </Card>
          </motion.div>
        )}

        {/* ---------- PROCESSING ---------- */}
        {phase === 'processing' && (
          <motion.div key="proc" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
            <div className={styles.proc}>
              <div className={styles.procIcon}><FiCpu size={40} className="spin" style={{ animationDuration: '3s' }} /></div>
              <h2>Working on your meeting</h2>
              <p className="text-2">{fmtClock(secs)} of audio · {dsa.name}</p>
              <div className={styles.steps}>
                {PROC_STEPS.map((s, i) => {
                  const done = i < procStep; const on = i === procStep;
                  return (
                    <div key={s} className={`${styles.step} ${done ? styles.stepDone : ''} ${on ? styles.stepOn : ''}`}>
                      <span className={`${styles.stepMark} ${done ? styles.done : on ? styles.on : ''}`}>{done ? <FiCheck size={14} /> : on ? <span className="spin" style={{ width: 12, height: 12, border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', display: 'block' }} /> : null}</span>
                      {s}
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}

        {/* ---------- RESULT ---------- */}
        {phase === 'result' && saved && (
          <motion.div key="res" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
            {questions.length > 0 && (
              <Card padding={16} style={{ marginBottom: 12 }} status={covered.length === questions.length ? 'success' : 'warning'}>
                <div style={{ fontWeight: 600 }}>Covered {covered.length} of {questions.length} prepared questions</div>
                {covered.length < questions.length ? (
                  <div className="hint" style={{ marginTop: 4 }}>Not covered — ask next time: {questions.filter((x) => !covered.includes(x.id)).slice(0, 2).map((x) => x.q.split(' — ')[0].split('?')[0]).join(' · ')}{questions.length - covered.length > 2 ? ` · +${questions.length - covered.length - 2} more` : ''}</div>
                ) : <div className="hint" style={{ marginTop: 4 }}>Everything on the list got discussed.</div>}
              </Card>
            )}
            <RecordingResult rec={saved} dsa={dsa} fresh />
          </motion.div>
        )}
      </AnimatePresence>
    </Page>
  );
}

/* =====================================================================================
   /recordings/:id — view a saved recording
   ===================================================================================== */
export function RecordingDetail() {
  const { id } = useParams();
  const { getRecording, getDsa } = useAppState();
  const rec = getRecording(id);
  const dsa = rec ? getDsa(rec.dsaId) : null;
  if (!rec || !dsa) return <Page mode="slide"><TopBar back title="Recording" hideBell /><EmptyState emoji="🎙️" title="Recording not found" /></Page>;
  return (
    <Page mode="slide">
      <TopBar back title="Meeting summary" subtitle={`${dsa.name} · ${formatDate(rec.date, { day: 'numeric', month: 'short' })}, ${fmtTime(rec.time)}`} hideBell />
      <RecordingResult rec={rec} dsa={dsa} />
    </Page>
  );
}

/* =====================================================================================
   /engagements/:id — a company meeting (Branch Head / Regional Head / CEO…) with the DSA
   ===================================================================================== */
export function EngagementDetail() {
  const { id } = useParams();
  const { engagements, getDsa } = useAppState();
  const m = engagements.find((e) => e.id === id);
  const dsa = m ? getDsa(m.dsaId) : null;
  const rec = useMemo(() => {
    if (!m || !dsa) return null;
    const { lines, summary } = buildEngagementTranscript(dsa, m);
    return { id: m.id, dsaId: m.dsaId, date: m.date, time: m.time, durationSecs: m.durationSecs, transcript: lines, summary };
  }, [m, dsa]);
  if (!m || !dsa) return <Page mode="slide"><TopBar back title="Meeting" hideBell /><EmptyState emoji="🗂️" title="Meeting not found" /></Page>;
  return (
    <Page mode="slide">
      <TopBar back title={m.agenda} subtitle={`${dsa.name} · ${formatDate(m.date, { day: 'numeric', month: 'short', year: 'numeric' })}`} hideBell />
      <Card padding={16} style={{ marginBottom: 12 }}>
        <div className="hint" style={{ fontWeight: 600, marginBottom: 8 }}>Attendees from our side</div>
        <div className="stack" style={{ gap: 8 }}>
          {m.attendees.map((a) => (
            <div key={a.name} className="row" style={{ gap: 10 }}>
              <Avatar name={a.name} size={32} />
              <div className="grow"><div style={{ fontWeight: 600, fontSize: 15 }}>{a.name}</div><div className="hint">{a.role}</div></div>
            </div>
          ))}
        </div>
        <div className="hint" style={{ marginTop: 10 }}>{m.type} · {fmtClock(m.durationSecs)} · Outcome: {m.outcome}</div>
      </Card>
      {m.hasTranscript ? <RecordingResult rec={rec} dsa={dsa} readOnly /> : (
        <EmptyState compact emoji="📝" title="No key points for this meeting" subtitle="This meeting was logged without a recording. Only the attendees and outcome are available." />
      )}
    </Page>
  );
}

/* =====================================================================================
   /recordings — all recordings
   ===================================================================================== */
export function RecordingsList() {
  const navigate = useNavigate();
  const { recordings, getDsa } = useAppState();
  return (
    <Page mode="slide">
      <TopBar back title="Meeting recordings" subtitle={`${recordings.length} recorded`} hideBell />
      {recordings.length === 0 ? (
        <EmptyState emoji="🎙️" title="No recordings yet" subtitle="Record a DSA meeting to get a transcript and summary." actionLabel="Record meeting" actionIcon={<FiMic />} onAction={() => navigate('/record')} />
      ) : (
        <div className="stack">
          {recordings.map((r) => <RecordingCard key={r.id} rec={r} dsa={getDsa(r.dsaId)} showDsa />)}
        </div>
      )}
      <div style={{ marginTop: 20 }}>
        <Button full icon={<FiMic size={18} />} onClick={() => navigate('/record')}>Record a meeting</Button>
      </div>
    </Page>
  );
}

/** Compact list card used on the DSA page and the recordings list. */
export function RecordingCard({ rec, dsa, showDsa = false }) {
  const navigate = useNavigate();
  return (
    <Card padding={16} onClick={() => navigate(`/recordings/${rec.id}`)}>
      <div className={styles.recRow}>
        <div className={styles.recIcon}><FiMic size={20} /></div>
        <div className="grow" style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600 }} className="truncate">{showDsa ? dsa?.name : rec.summary.headline}</div>
          <div className="hint row" style={{ gap: 6 }}>
            <FiClock size={12} /> {formatDate(rec.date, { day: 'numeric', month: 'short' })} · {fmtTime(rec.time)} · {fmtClock(rec.durationSecs)}
          </div>
        </div>
        <Badge tone={SENTIMENT_TONE[rec.summary.sentiment]} soft>{cap(rec.summary.sentiment)}</Badge>
      </div>
    </Card>
  );
}

/* ---------- Summary + transcript view (shared by fresh result and saved detail) ---------- */
function RecordingResult({ rec, dsa, fresh = false, readOnly = false }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { visits } = useAppState();
  const [view, setView] = useState('Summary');
  const s = rec.summary;
  const linkedVisit = rec.visitId ? visits.find((v) => v.id === rec.visitId) : null;

  const copy = async () => {
    try { await navigator.clipboard.writeText(summaryToText(s)); toast('Summary copied', 'success', 1500); }
    catch { toast('Copy not available here', 'warning'); }
  };

  return (
    <div className="stack">
      {fresh && (
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 22 }}>
          <Card padding={14} status="success">
            <div className="row" style={{ gap: 10 }}>
              <FiCheck size={20} color="var(--success)" />
              <div className="grow">
                <div style={{ fontWeight: 600 }}>Recording saved · {fmtClock(rec.durationSecs)}</div>
                <div className="hint">Transcript and summary are ready. Attach them to your visit log below.</div>
              </div>
            </div>
          </Card>
        </motion.div>
      )}

      <div className={styles.seg}>
        {['Summary', 'Transcript'].map((t) => (
          <button key={t} className={`${styles.segBtn} ${view === t ? styles.segOn : ''}`} onClick={() => setView(t)}>
            {view === t && <motion.span layoutId="rec-seg" className={styles.segPill} transition={{ type: 'spring', stiffness: 400, damping: 30 }} />}
            <span style={{ position: 'relative' }}>{t}</span>
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {view === 'Summary' ? (
          <motion.div key="sum" className="stack" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.16 }}>
            <Card className="tint-primary">
              <div className="row-between" style={{ marginBottom: 8 }}>
                <span className="hint" style={{ color: 'var(--primary)', fontWeight: 600 }}>AI summary</span>
                <Badge tone={SENTIMENT_TONE[s.sentiment]} soft>{cap(s.sentiment)}</Badge>
              </div>
              <div className={styles.headline}>{s.headline}</div>
              <div className={styles.hl} style={{ marginTop: 14 }}>
                {s.highlights.map((h) => (
                  <div key={h.label} className={styles.hlItem}>
                    <div className={styles.hlVal}>{h.value}</div>
                    <div className={styles.hlLab}>{h.label}</div>
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <h3 style={{ marginBottom: 12 }}>Key points</h3>
              <div className={styles.points}>
                {s.keyPoints.map((p, i) => <div key={i} className={styles.point}><span className={styles.pointDot} /><span>{p}</span></div>)}
              </div>
            </Card>

            {/* To-dos split by who owns them — extracted by the LLM from the transcript */}
            <TodoSection rec={rec} dsa={dsa} />

            <Card>
              <h3 style={{ marginBottom: 12 }}>Decisions</h3>
              <div className={styles.points}>
                {s.decisions.map((p, i) => <div key={i} className={styles.point}><FiCheck size={16} color="var(--success)" style={{ marginTop: 4, flexShrink: 0 }} /><span>{p}</span></div>)}
              </div>
            </Card>

            <Card padding={16} onClick={() => navigate(`/scheduler?dsa=${dsa.id}`)}>
              <div className="row" style={{ gap: 12 }}>
                <FiCalendar size={20} color="var(--primary)" />
                <div className="grow">
                  <div style={{ fontWeight: 600 }}>Next meeting · {formatDate(s.nextMeeting, { weekday: 'short', day: 'numeric', month: 'short' })}</div>
                  <div className="hint">Tap to add it to your schedule</div>
                </div>
              </div>
            </Card>
          </motion.div>
        ) : (
          <motion.div key="tr" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.16 }}>
            <Card>
              <div className="row-between" style={{ marginBottom: 14 }}>
                <h3>Full transcript</h3>
                <span className="hint">{rec.transcript.length} segments · {fmtClock(rec.durationSecs)}</span>
              </div>
              <div className={styles.captions}>
                {rec.transcript.map((l, i) => <TranscriptLine key={i} line={l} dsa={dsa} />)}
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <div className={styles.resultFooter}>
        {readOnly ? null : linkedVisit ? (
          <Card padding={14} onClick={() => navigate(`/dsas/${dsa.id}?tab=Meetings`)}>
            <div className="row" style={{ gap: 10 }}>
              <FiFileText size={18} color="var(--success)" />
              <span style={{ fontSize: 15 }}>Attached to visit on {formatDate(linkedVisit.date, { day: 'numeric', month: 'short' })}</span>
            </div>
          </Card>
        ) : (
          <Button full icon={<FiFileText size={18} />} iconRight={<FiChevronRight size={18} />} onClick={() => navigate(`/visits/new?dsa=${dsa.id}&rec=${rec.id}`)}>
            Log visit with this summary
          </Button>
        )}
        <div className={styles.share}>
          <Button variant="secondary" icon={<IoLogoWhatsapp size={18} color="#16a34a" />} onClick={() => toast(`Summary shared with ${dsa.name.split(' ')[0]} on WhatsApp`, 'success')}>Share</Button>
          <Button variant="secondary" icon={<FiCopy size={18} />} onClick={copy}>Copy</Button>
          {!readOnly && <Button variant="secondary" icon={<FiShare2 size={18} />} onClick={() => toast('Sent to branch manager', 'success')}>To manager</Button>}
        </div>
      </div>
    </div>
  );
}

/** Action items grouped into "Your to-dos" (BO / company side) and "DSA's to-dos", with tick-off. */
function TodoSection({ rec, dsa }) {
  const [doneMap, setDoneMap] = useLocalStorage('bo_todo_done', {});
  const done = doneMap[rec.id] ?? [];
  const toggle = (i) => setDoneMap((m) => ({ ...m, [rec.id]: done.includes(i) ? done.filter((x) => x !== i) : [...done, i] }));
  const dsaFirst = dsa.name.split(' ')[0];
  const items = rec.summary.actions.map((a, i) => ({ ...a, i, mine: a.owner !== dsaFirst }));
  const mine = items.filter((a) => a.mine);
  const theirs = items.filter((a) => !a.mine);
  const otherOwners = mine.some((a) => a.owner !== 'You');

  const List = ({ list }) => list.map((a) => {
    const isDone = done.includes(a.i);
    return (
      <button key={a.i} className={`${styles.todo} ${isDone ? styles.todoDone : ''}`} onClick={() => toggle(a.i)}>
        <span className={`${styles.tick} ${isDone ? styles.tickOn : ''}`}>{isDone && <FiCheck size={12} />}</span>
        <div className="grow" style={{ textAlign: 'left' }}>
          <div className={styles.actionText}>{a.text}</div>
          <div className={styles.due}>{otherOwners && a.mine && a.owner !== 'You' ? `${a.owner} · ` : ''}Due · {a.due}</div>
        </div>
      </button>
    );
  });

  return (
    <>
      <Card>
        <div className="row-between" style={{ marginBottom: 10 }}>
          <h3 className="row" style={{ gap: 8 }}><span className={`${styles.todoIcon} ${styles.todoIconYou}`}><FiUser size={14} /></span> {otherOwners ? 'Our to-dos' : 'Your to-dos'}</h3>
          <span className="hint">{mine.filter((a) => done.includes(a.i)).length}/{mine.length} done</span>
        </div>
        {mine.length ? <List list={mine} /> : <span className="hint">Nothing for you from this meeting.</span>}
      </Card>
      <Card>
        <div className="row-between" style={{ marginBottom: 10 }}>
          <h3 className="row" style={{ gap: 8 }}><span className={`${styles.todoIcon} ${styles.todoIconDsa}`}><FiBriefcase size={14} /></span> {dsaFirst}'s to-dos</h3>
          <span className="hint">{theirs.filter((a) => done.includes(a.i)).length}/{theirs.length} done</span>
        </div>
        {theirs.length ? <List list={theirs} /> : <span className="hint">No commitments from {dsaFirst} in this meeting.</span>}
        <div className="hint" style={{ marginTop: 10 }}>Tick these off when {dsaFirst} confirms — they'll show as follow-ups on the next visit.</div>
      </Card>
    </>
  );
}

function TranscriptLine({ line, dsa, animate = false }) {
  const isBo = line.speaker === 'bo';
  const inner = (
    <div className={styles.line}>
      <span className={`${styles.who} ${isBo ? styles.whoBo : styles.whoDsa}`}>{line.name ? initials(line.name) : isBo ? 'You' : initials(dsa?.name)}</span>
      <div className={styles.bubble}>
        <div className={styles.bubbleMeta}><span>{line.name ?? (isBo ? 'You' : dsa?.name.split(' ')[0])}</span><span>·</span><span>{fmtClock(line.t)}</span></div>
        <div className={styles.bubbleText}>{line.text}</div>
      </div>
    </div>
  );
  return animate ? <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>{inner}</motion.div> : inner;
}

/** Keeps the newest caption in view while recording. */
function AutoScroll({ dep }) {
  const ref = useRef();
  useEffect(() => { ref.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [dep]);
  return <div ref={ref} />;
}

const initials = (n = '') => n.split(' ').map((x) => x[0]).slice(0, 2).join('').toUpperCase();
const cap = (s = '') => s.charAt(0).toUpperCase() + s.slice(1);
