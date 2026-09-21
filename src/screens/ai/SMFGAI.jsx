import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { FiMic, FiMicOff, FiVolume2, FiVolumeX, FiSend, FiUser, FiUsers, FiChevronRight, FiCheck, FiAlertTriangle, FiInfo, FiAlertCircle, FiFileText, FiSearch, FiRefreshCw, FiShield, FiMapPin, FiType, FiList } from 'react-icons/fi';
import { IoSparkles } from 'react-icons/io5';
import Page, { listContainer, listItem } from '../../components/navigation/Page';
import TopBar from '../../components/navigation/TopBar';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Avatar from '../../components/common/Avatar';
import Badge from '../../components/common/Badge';
import EmptyState from '../../components/common/EmptyState';
import BottomSheet from '../../components/common/BottomSheet';
import ProgressRing from '../../components/charts/ProgressRing';
import { useAppState } from '../../context/AppStateContext';
import { useAuth } from '../../context/AuthContext';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { useToast } from '../../hooks/useToast';
import { formatINR, timeAgo } from '../../utils/formatters';
import { FLOWS, reflect, buildReport } from '../../utils/smfgAI';
import { speak as tts, stopSpeaking, listen, canSpeak, canListen } from '../../utils/voice';
import styles from './ai.module.css';

/*
  SMFG AI — handover interviews. The officer picks who is in front of them, hands the phone over,
  the AI runs the conversation, and a report comes back to the officer. Three screens:
  AIHome (/ai) · AISession (/ai/session?kind=&id=) · AIReport (/ai/reports/:id)
*/

const useReports = () => useLocalStorage('bo_ai_reports', []);

/* ============================================================ HOME: who is talking? */
export default function AIHome() {
  const navigate = useNavigate();
  const { dsas, customers } = useAppState();
  const [reports] = useReports();
  const [kind, setKind] = useState('customer');
  const [q, setQ] = useState('');
  const list = (kind === 'customer' ? customers : dsas).filter((p) => !q || `${p.name} ${p.firm ?? p.business ?? ''} ${p.location}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <Page mode="slide">
      <TopBar back title={<span className={styles.brand}><IoSparkles size={18} /> SMFG AI</span>} subtitle="Hand the phone over — AI interviews, you get the report" hideBell />

      <Card className={styles.heroCard} noChevron padding={16}>
        <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
          <span className={styles.orb}><IoSparkles size={20} /></span>
          <div className="grow">
            <div style={{ fontWeight: 700, fontSize: 16 }}>Not sure what to ask?</div>
            <div className="hint" style={{ marginTop: 2 }}>SMFG AI asks the right questions for a loan or a DSA review, follows up on what it hears, and writes you a report with flags and next steps.</div>
          </div>
        </div>
      </Card>

      <div className={styles.seg} style={{ margin: '14px 0 10px' }}>
        <button className={`${styles.segBtn} ${kind === 'customer' ? styles.segOn : ''}`} onClick={() => setKind('customer')}><FiUser size={14} /> Customer</button>
        <button className={`${styles.segBtn} ${kind === 'dsa' ? styles.segOn : ''}`} onClick={() => setKind('dsa')}><FiUsers size={14} /> DSA</button>
      </div>
      <div className={styles.search}><FiSearch size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${kind === 'customer' ? 'customer' : 'DSA'}…`} /></div>

      <Card padding={0} noChevron style={{ marginTop: 10 }}>
        <button className={styles.row} onClick={() => navigate(`/ai/session?kind=${kind}`)}>
          <span className="icon-tile" style={{ '--tile': 'var(--primary)', width: 36, height: 36, borderRadius: 10 }}><FiUser size={16} /></span>
          <span className="grow" style={{ minWidth: 0, textAlign: 'left' }}><div style={{ fontWeight: 600, fontSize: 14 }}>{kind === 'customer' ? 'Walk-in / unknown customer' : 'DSA not in my list'}</div><div className="hint">Start without a profile</div></span>
          <FiChevronRight size={16} color="var(--text-3)" />
        </button>
        {list.map((p) => (
          <button key={p.id} className={styles.row} onClick={() => navigate(`/ai/session?kind=${kind}&id=${p.id}`)}>
            <Avatar name={p.name} size={36} />
            <span className="grow" style={{ minWidth: 0, textAlign: 'left' }}><div style={{ fontWeight: 600, fontSize: 14 }} className="truncate">{p.name}</div><div className="hint truncate">{p.firm ?? p.business} · {p.location}</div></span>
            <FiChevronRight size={16} color="var(--text-3)" />
          </button>
        ))}
      </Card>

      {reports.length > 0 && (
        <>
          <div className="section-head" style={{ marginTop: 20, marginBottom: 10 }}><h2 className="section-title" style={{ fontSize: 17 }}>Recent reports</h2><span className="hint">{reports.length}</span></div>
          <motion.div className="stack" variants={listContainer} initial="initial" animate="animate">
            {reports.slice(0, 8).map((r) => <motion.div key={r.id} variants={listItem}><ReportCard r={r} onClick={() => navigate(`/ai/reports/${r.id}`)} /></motion.div>)}
          </motion.div>
        </>
      )}
    </Page>
  );
}

export function ReportCard({ r, onClick }) {
  const tone = r.sentiment === 'strong' || r.sentiment === 'positive' ? 'success' : r.sentiment === 'moderate' || r.sentiment === 'neutral' ? 'warning' : 'danger';
  return (
    <Card padding={14} onClick={onClick}>
      <div className="row" style={{ gap: 12 }}>
        <span className={styles.orbSm}><IoSparkles size={14} /></span>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="row-between"><div style={{ fontWeight: 600, fontSize: 14 }} className="truncate">{r.partyName}</div><Badge tone={tone} soft>{r.sentiment}</Badge></div>
          <div className="hint clamp2">{r.headline}</div>
          <div className="hint" style={{ marginTop: 2 }}>{r.kind === 'customer' ? 'Customer' : 'DSA'} interview · {timeAgo(r.createdAt)}</div>
        </div>
      </div>
    </Card>
  );
}

/* ============================================================ SESSION: handover → chat → report */
export function AISession() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const kind = params.get('kind') === 'dsa' ? 'dsa' : 'customer';
  const id = params.get('id');
  const { getDsa, getCustomer } = useAppState();
  const { officer } = useAuth();
  const { toast } = useToast();
  const party = id ? (kind === 'dsa' ? getDsa(id) : getCustomer(id)) : null;
  const flow = FLOWS[kind];
  const [, setReports] = useReports();

  const [phase, setPhase] = useState('handover'); // handover · chat · done · generating
  const [msgs, setMsgs] = useState([]);
  const [node, setNode] = useState(null);
  const [typing, setTyping] = useState(false);
  const [answers, setAnswers] = useState({});
  const [text, setText] = useState('');
  // Voice: AI speaks each bubble; the person replies by tapping the mic (or typing). Text always shows.
  const [voiceOn, setVoiceOn] = useLocalStorage('bo_ai_voice', true);
  const [listening, setListening] = useState(false);
  const [autoMic, setAutoMic] = useState(false); // once they've used the mic, re-open it after each question
  const [speaking, setSpeaking] = useState(false);
  const [typeMode, setTypeMode] = useState(!canListen);
  const [transcript, setTranscript] = useState(false);
  const stopListen = useRef(null);
  const nodeRef = useRef(null);
  const answerRef = useRef(null);
  const endRef = useRef(null);
  const timers = useRef([]);
  const ctx = useMemo(() => ({ party, a: answers, officer }), [party, answers, officer]);

  useEffect(() => () => { timers.current.forEach(clearTimeout); stopSpeaking(); stopListen.current?.(); }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [msgs, typing, node]);

  const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.current.push(t); };

  /** Speak a node's bubbles one by one with a typing pause, then expose its options. */
  const speak = (nodeId, ctxNow, lead = []) => {
    const n = flow[nodeId];
    const lines = [...lead, ...n.say(ctxNow)];
    setNode(null);
    let delay = 0;
    lines.forEach((line, i) => {
      later(() => setTyping(true), delay);
      delay += 500 + Math.min(1200, line.length * 12);
      later(() => {
        setTyping(false); setMsgs((m) => [...m, { from: 'ai', text: line }]);
        const last = i === lines.length - 1;
        const ended = n.next(null, ctxNow) === null && !n.options && !n.input;
        if (last) { if (ended) setPhase('done'); else { setNode(nodeId); nodeRef.current = nodeId; } }
        if (voiceOn && canSpeak) { setSpeaking(true); tts(line, { onEnd: () => { if (last) setSpeaking(false); if (last && !ended && autoMic && canListen) startListening(); } }); }
      }, delay);
      delay += 250;
    });
  };

  const begin = () => { setPhase('chat'); speak('start', ctx); };

  const startListening = () => {
    if (!canListen || !nodeRef.current) return;
    stopSpeaking(); setSpeaking(false);
    setListening(true);
    stopListen.current = listen({
      onInterim: (t) => setText(t),
      onFinal: (t) => { setText(''); answerRef.current(t); },
      onError: () => setListening(false),
      onEnd: () => setListening(false),
    });
  };
  const toggleMic = () => { if (listening) { stopListen.current?.(); setListening(false); } else { setAutoMic(true); startListening(); } };

  const answer = (value) => {
    const cur = nodeRef.current;
    if (!cur || !value?.trim()) return;
    const n = flow[cur];
    stopSpeaking(); setSpeaking(false); stopListen.current?.(); setListening(false);
    const a = n.key ? { ...answers, [n.key]: value } : answers;
    setAnswers(a);
    setMsgs((m) => [...m, { from: 'user', text: value }]);
    setText('');
    nodeRef.current = null; setNode(null);
    const nextId = n.next(value, { ...ctx, a });
    const lead = reflect(kind, cur, value, a);
    if (nextId) speak(nextId, { ...ctx, a }, lead ? [lead] : []);
    else setPhase('done');
  };
  answerRef.current = answer;

  const finish = () => {
    setPhase('generating');
    later(() => {
      const rep = { id: `air${Date.now()}`, partyId: party?.id ?? null, ...buildReport(kind, party, answers), transcript: msgs };
      setReports((r) => [rep, ...r]);
      toast('Report ready', 'success');
      navigate(`/ai/reports/${rep.id}`, { replace: true });
    }, 2200);
  };

  const current = node ? flow[node] : null;

  /* ---------- handover screen (officer → customer/DSA) ---------- */
  if (phase === 'handover') {
    return (
      <Page mode="slide">
        <TopBar back title={<span className={styles.brand}><IoSparkles size={18} /> SMFG AI</span>} subtitle={kind === 'customer' ? 'Customer interview' : 'DSA review'} hideBell />
        <div className={styles.handover}>
          <span className={styles.orbLg}><IoSparkles size={34} /></span>
          <h2 style={{ marginTop: 16 }}>Hand the phone to {party ? party.name.split(' ')[0] : kind === 'customer' ? 'the customer' : 'the DSA'}</h2>
          <p className="text-2" style={{ marginTop: 6 }}>{kind === 'customer' ? 'A short voice interview about their loan need.' : 'A short voice chat about how things are going.'}</p>
          {party && (
            <Card padding={12} noChevron style={{ marginTop: 18, width: '100%' }}>
              <div className="row" style={{ gap: 10 }}>
                <Avatar name={party.name} size={36} />
                <div className="grow" style={{ minWidth: 0, textAlign: 'left' }}><div style={{ fontWeight: 600, fontSize: 14 }}>{party.name}</div><div className="hint truncate">{party.firm ?? party.business} · {party.location}</div></div>
              </div>
            </Card>
          )}
          <div className={styles.facts}>
            <span><FiMic size={13} /> Voice to voice</span>
            <span><FiRefreshCw size={13} /> ~3 min</span>
            <span><FiShield size={13} /> App locked</span>
          </div>
          <Button full size="lg" icon={<IoSparkles size={18} />} onClick={begin} style={{ marginTop: 20 }}>Start SMFG AI</Button>
        </div>
      </Page>
    );
  }

  /* ---------- generating ---------- */
  if (phase === 'generating') {
    return (
      <Page mode="fade">
        <div className={styles.handover} style={{ minHeight: '70vh', justifyContent: 'center' }}>
          <span className={`${styles.orbLg} ${styles.pulse}`}><IoSparkles size={34} /></span>
          <h2 style={{ marginTop: 18 }}>Writing your report…</h2>
          <p className="text-2" style={{ marginTop: 6 }}>Summarising {msgs.filter((m) => m.from === 'user').length} answers · checking eligibility · flagging risks</p>
        </div>
      </Page>
    );
  }

  /* ---------- interview (immersive, voice-first) ---------- */
  const lastUser = msgs.map((m) => m.from).lastIndexOf('user');
  const nowLines = msgs.slice(lastUser + 1).filter((m) => m.from === 'ai').map((m) => m.text);
  const answered = msgs.filter((m) => m.from === 'user').length;
  const total = Object.keys(flow).length - 2;
  const pct = phase === 'done' ? 100 : Math.min(92, Math.round((answered / total) * 100));
  const who = party ? party.name.split(' ')[0] : kind === 'customer' ? 'customer' : 'DSA';
  const state = phase === 'done' ? 'Interview complete' : typing ? 'Thinking…' : listening ? 'Listening…' : speaking ? 'Speaking…' : current ? 'Your turn' : '';
  const orbMode = listening ? styles.orbListen : speaking || typing ? styles.orbSpeak : '';

  return (
    <Page mode="fade" className={styles.ivPage} noTab>
      <div className={styles.ivHead}>
        <span className={styles.orbSm}><IoSparkles size={14} /></span>
        <div className="grow" style={{ minWidth: 0 }}><div className={styles.ivTitle}>SMFG AI</div><div className={styles.ivSub}>{kind === 'customer' ? 'Loan interview' : 'DSA review'} · {who}</div></div>
        {canSpeak && <button className={`${styles.ivIcon} ${voiceOn ? styles.ivIconOn : ''}`} onClick={() => { setVoiceOn((v) => !v); stopSpeaking(); setSpeaking(false); }} aria-label={voiceOn ? 'Mute voice' : 'Unmute voice'}>{voiceOn ? <FiVolume2 size={16} /> : <FiVolumeX size={16} />}</button>}
        <button className={styles.ivIcon} onClick={() => setTranscript(true)} aria-label="Transcript"><FiList size={16} /></button>
        <span className={styles.ivLock}><FiShield size={11} /> Handover</span>
      </div>
      <div className={styles.ivProgress}><motion.div className={styles.ivBar} animate={{ width: `${pct}%` }} transition={{ duration: 0.5 }} /></div>

      <div className={styles.ivStage}>
        <div className={`${styles.ivOrb} ${orbMode}`}>
          <span className={styles.ivWave} /><span className={styles.ivWave} /><span className={styles.ivWave} />
          <span className={styles.ivCore}>{listening ? <FiMic size={30} /> : <IoSparkles size={30} />}</span>
        </div>
        <div className={styles.ivState}>{state}</div>

        <AnimatePresence mode="wait">
          <motion.div key={lastUser + ':' + nowLines.length} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22 }} className={styles.ivQ}>
            {nowLines.map((l, i) => <p key={i} className={i === nowLines.length - 1 ? styles.ivQMain : styles.ivQLead}>{l}</p>)}
          </motion.div>
        </AnimatePresence>

        {listening && text && <div className={styles.ivLive}>“{text}”</div>}

        {current?.options && !typing && (
          <div className={styles.ivChips}>{current.options.map((o) => <button key={o} className={styles.ivChip} onClick={() => answer(o)}>{o}</button>)}</div>
        )}

        {phase === 'done' && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={styles.ivDone}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>Thank you, {who}.</div>
            <div className={styles.ivDoneSub}>Please hand the phone back to {officer.name.split(' ')[0]}.</div>
            <Button full style={{ marginTop: 14 }} icon={<FiCheck size={18} />} onClick={finish}>I'm the officer — show report</Button>
          </motion.div>
        )}
      </div>

      {phase === 'chat' && (
        <div className={styles.ivBottom}>
          {typeMode ? (
            <form className={styles.ivForm} onSubmit={(e) => { e.preventDefault(); answer(text); }}>
              <input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={current?.input === 'money' ? 'Amount, e.g. 12 lakh' : current?.input === 'number' ? 'A number' : 'Type your answer…'} inputMode={current?.input === 'money' || current?.input === 'number' ? 'numeric' : 'text'} disabled={!current} />
              <button type="submit" className={styles.ivSend} disabled={!current || !text.trim()} aria-label="Send"><FiSend size={18} /></button>
            </form>
          ) : (
            <button className={`${styles.ivMic} ${listening ? styles.ivMicOn : ''}`} disabled={!current} onClick={toggleMic} aria-label={listening ? 'Stop listening' : 'Speak your answer'}>
              {listening ? <FiMicOff size={28} /> : <FiMic size={28} />}
            </button>
          )}
          <div className={styles.ivHint}>
            {typeMode ? (canListen ? <button onClick={() => { setTypeMode(false); setText(''); }}><FiMic size={13} /> Speak instead</button> : <span>Type your answer and send</span>)
              : <button onClick={() => { stopListen.current?.(); setListening(false); setTypeMode(true); setText(''); }}><FiType size={13} /> Type instead</button>}
          </div>
        </div>
      )}

      <BottomSheet open={transcript} onClose={() => setTranscript(false)} title="Transcript">
        <div className={styles.chat}>
          {msgs.length === 0 && <div className="hint" style={{ textAlign: 'center' }}>Nothing yet.</div>}
          {msgs.map((m, i) => <div key={i} className={`${styles.bubble} ${m.from === 'ai' ? styles.ai : styles.user}`}>{m.text}</div>)}
        </div>
      </BottomSheet>
    </Page>
  );
}

/* ============================================================ REPORT (for the officer) */
export function AIReport() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [reports] = useReports();
  const [showT, setShowT] = useState(false);
  const r = reports.find((x) => x.id === id);
  if (!r) return <Page><TopBar back title="Report" /><EmptyState emoji="🔍" title="Report not found" /></Page>;
  const tone = r.sentiment === 'strong' || r.sentiment === 'positive' ? 'success' : r.sentiment === 'moderate' || r.sentiment === 'neutral' ? 'warning' : 'danger';
  const flagIcon = { danger: FiAlertCircle, warning: FiAlertTriangle, info: FiInfo };
  const rec = r.recommendation;

  return (
    <Page mode="slide">
      <TopBar back title={<span className={styles.brand}><IoSparkles size={18} /> SMFG AI report</span>} subtitle={`${r.partyName} · ${timeAgo(r.createdAt)}`} hideBell />

      <Card padding={16} noChevron className={styles.heroCard}>
        <div className="row" style={{ gap: 14 }}>
          <ProgressRing value={r.score} size={64} stroke={6}><span style={{ fontWeight: 700, fontSize: 15 }}>{r.score}</span></ProgressRing>
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="row" style={{ gap: 6, marginBottom: 4 }}><Badge tone={tone} soft>{r.sentiment}</Badge>{r.escalate && <Badge tone="danger">Escalate</Badge>}</div>
            <div style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.3 }}>{r.headline}</div>
            <div className="hint">{r.scoreLabel} {r.score}/100</div>
          </div>
        </div>
      </Card>

      {rec && (
        <Card padding={16} noChevron style={{ marginTop: 12 }} status={rec.fits ? 'success' : rec.eligible ? 'warning' : 'primary'}>
          <div className="hint" style={{ fontWeight: 700, color: 'var(--primary)', marginBottom: 8 }}>Recommended offer</div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{rec.product} · {rec.rate}% p.a.</div>
          <div className={styles.recGrid}>
            <div><div className={styles.recV}>{formatINR(rec.amount)}</div><div className="hint">asked</div></div>
            <div><div className={styles.recV} style={{ color: rec.eligible ? (rec.fits ? 'var(--success)' : 'var(--danger)') : undefined }}>{rec.eligible ? formatINR(rec.eligible) : '—'}</div><div className="hint">eligible</div></div>
            <div><div className={styles.recV}>{formatINR(rec.emi)}</div><div className="hint">EMI · {rec.tenure} mo</div></div>
          </div>
        </Card>
      )}

      {r.flags.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div className="section-head" style={{ marginBottom: 8 }}><h2 className="section-title" style={{ fontSize: 16 }}>Flags</h2></div>
          <div className="stack">
            {r.flags.map((f, i) => { const I = flagIcon[f.tone] ?? FiInfo; return <Card key={i} padding={12} noChevron status={f.tone === 'info' ? 'primary' : f.tone}><div className="row" style={{ gap: 10, alignItems: 'flex-start' }}><I size={16} color={f.tone === 'danger' ? 'var(--danger)' : f.tone === 'warning' ? 'var(--warning)' : 'var(--primary)'} style={{ flexShrink: 0, marginTop: 2 }} /><div style={{ fontSize: 14, lineHeight: 1.4 }}>{f.text}</div></div></Card>; })}
          </div>
        </div>
      )}

      {r.sections.map((s) => (
        <Card key={s.title} padding={16} noChevron style={{ marginTop: 12 }}>
          <div className="hint" style={{ fontWeight: 700, color: 'var(--primary)', marginBottom: 8 }}>{s.title}</div>
          <ul className={styles.list}>{s.items.map((it, i) => <li key={i}>{it}</li>)}</ul>
        </Card>
      ))}

      <Card padding={16} noChevron style={{ marginTop: 12 }}>
        <div className="hint" style={{ fontWeight: 700, color: 'var(--primary)', marginBottom: 8 }}>Next steps</div>
        <ul className={styles.list}>{r.todos.map((t, i) => <li key={i}><b>{t.owner}:</b> {t.text}</li>)}</ul>
      </Card>

      <button className="link" style={{ marginTop: 14, color: 'var(--primary)', fontWeight: 600, fontSize: 14, minHeight: 36 }} onClick={() => setShowT((v) => !v)}>{showT ? 'Hide' : 'Show'} full conversation ({r.transcript?.length ?? 0} messages)</button>
      {showT && <div className={styles.chat} style={{ marginTop: 4 }}>{r.transcript.map((m, i) => <div key={i} className={`${styles.bubble} ${m.from === 'ai' ? styles.ai : styles.user}`}>{m.text}</div>)}</div>}

      <div className="row" style={{ gap: 8, marginTop: 18 }}>
        {r.partyId && <Button style={{ flex: 1 }} icon={<FiMapPin size={16} />} onClick={() => navigate(`/visits/new?dsa=${r.partyId}`)}>Log visit</Button>}
        <Button style={{ flex: 1 }} variant="secondary" onClick={() => navigate(r.partyId ? (r.kind === 'dsa' ? `/dsas/${r.partyId}` : `/customers/${r.partyId}`) : '/ai')}>{r.partyId ? 'Open profile' : 'Done'}</Button>
      </div>
    </Page>
  );
}
