import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { FiX } from 'react-icons/fi';
import { IoCall, IoMic, IoMicOff, IoRefresh, IoSend, IoVolumeHigh, IoVolumeMute } from 'react-icons/io5';
import VideoFeed, { LiveBadge } from '../../components/sarthi/VideoFeed';
import CallSetup from '../../components/sarthi/CallSetup';
import AiAvatar from '../../components/sarthi/AiAvatar';
import { askAgent, parseClaims } from '../../services/sarthi/agent';
import { DSA_TOPICS, dsaFile, needsProbe, figureFrom, openingLine, closingLine, turnMessages, rechecksFor, interviewerPrompt, directiveFor, writeDsaReport, fallbackDsaReport } from '../../services/sarthi/dsa';
import { stopSpeaking, listen, canListen, canSpeak, setSilent } from '../../services/voice';
import { speakStreamed } from '../../services/sarthi/stream';
import { stopCamera } from '../../services/sarthi/video';
import { sarthiVoice, gendered, aboutSarthi } from '../../services/sarthi/voice';
import { useAppState } from '../../context/AppStateContext';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import styles from './SarthiInterview.module.css';

// Sarthi's DSA review on the same video call as the PD. Claude only; if it is unreachable a turn falls back to the
// topic's plain question, so the call never dies. The report lands in SAARTHI AI's report list (/ai/reports/:id).
// Only a goodbye to the call itself — "questions band karo" is a complaint, not a hang-up.
const LEAVING = /\b(bye|alvida)\b|(call|phone)\s+(band|cut|kaat|rakh)|mujhe jaana hai|अलविदा/i;
const CAPTION_FALLBACK_MS = 3000;

export default function SarthiDsaInterview() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getDsa, loanFiles, engagements } = useAppState();
  const [, setReports] = useLocalStorage('bo_ai_reports', []);
  const dsa = getDsa(id);
  const file = useMemo(() => (dsa ? dsaFile(dsa, { loanFiles, engagements }) : null), [dsa?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const [ready, setReady] = useState(false); // camera, mic and voice set on CallSetup
  const [phase, setPhase] = useState('live'); // live · generating
  const [avatar, setAvatar] = useState('idle');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [muted, setMuted] = useState(false);
  const [silenced, setSilenced] = useState(false);
  const [typeMode, setTypeMode] = useState(!canListen);
  const [draft, setDraft] = useState('');
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [step, setStep] = useState(0);

  const history = useRef([]);    // what Claude sees
  const transcript = useRef([]); // [{ from: 'ai' | 'user', text }]
  const qa = useRef([]);         // [{ section, q, a }] for the report
  const rechecks = useRef([]);   // [{ detail, answer }]
  const nums = useRef({});
  const idx = useRef(0);
  const queue = useRef([]);
  const probed = useRef(new Set());
  const current = useRef(null);
  const lastLine = useRef({ text: '', speech: '' });
  const doneRef = useRef(false);
  const mutedRef = useRef(false);
  const stopListen = useRef(null);

  useEffect(() => { mutedRef.current = muted; }, [muted]);
  useEffect(() => () => { setSilent(false); stopSpeaking(); stopListen.current?.(); stopCamera(); }, []);

  const beginListening = useCallback(() => {
    if (doneRef.current) return;
    if (mutedRef.current || !canListen || typeMode) { setAvatar('idle'); return; }
    setAvatar('listening');
    setAnswer('');
    let failures = 0;
    const session = () => {
      let cancelled = false;
      let answered = false;
      const stop = listen({
        onInterim: (t) => setAnswer(t),
        onFinal: (t) => { if (t.trim() && !cancelled) { answered = true; handleAnswerRef.current(t.trim()); } },
        onError: (err) => {
          if (err === 'no-speech' || err === 'aborted') return;
          failures += 1;
          if (err === 'not-allowed' || err === 'service-not-allowed' || err === 'audio-capture' || failures >= 3) { cancelled = true; setAvatar('idle'); setTypeMode(true); }
        },
        onEnd: () => {
          if (cancelled || answered || doneRef.current || mutedRef.current) return;
          setTimeout(() => { if (!cancelled && !doneRef.current) session(); }, 250);
        },
        endAfterMs: 1200,
      });
      stopListen.current = () => { cancelled = true; stop(); };
    };
    session();
  }, [typeMode]);

  const say = useCallback((raw, rawSpeech, then) => {
    // Lines are written male; the chosen voice's gender is applied to caption and speech alike.
    const text = gendered(raw);
    const speech = gendered(rawSpeech);
    lastLine.current = { text, speech };
    setAvatar('speaking');
    const next = then ?? beginListening;
    if (!canSpeak) {
      setQuestion(text); setAnswer('');
      setTimeout(() => { setAvatar('idle'); next(); }, Math.min(9000, 1800 + text.length * 45));
      return;
    }
    let shown = false;
    const show = () => { if (!shown) { shown = true; setQuestion(text); setAnswer(''); } };
    setTimeout(show, CAPTION_FALLBACK_MS);
    speakStreamed(speech || text, { voice: sarthiVoice(), onStart: show, onEnd: () => { show(); setAvatar('idle'); next(); } });
  }, [beginListening]);

  const finish = useCallback(async () => {
    if (doneRef.current) return;
    doneRef.current = true;
    stopSpeaking(); stopListen.current?.(); stopCamera();
    setPhase('generating');
    const input = { file, qa: qa.current, rechecks: rechecks.current };
    let report;
    try { report = await writeDsaReport(input); } catch (e) {
      console.warn(`[sarthi] DSA report failed (${e?.message}) — built from the answers`);
      report = fallbackDsaReport(input);
    }
    const rid = `sdsa_${Date.now()}`;
    setReports((prev) => [{
      ...report, id: rid, kind: 'dsa', sarthi: true, partyId: dsa.id, partyName: dsa.name,
      scoreLabel: 'Partner score', recommendation: null, createdAt: new Date().toISOString(), transcript: transcript.current.map((t) => (t.from === 'ai' ? { ...t, text: gendered(t.text) } : t)),
    }, ...prev]);
    navigate(`/ai/reports/${rid}`, { replace: true });
  }, [dsa, file, navigate, setReports]);

  // Asks the action's question: Claude phrases it; if Claude is unreachable, the topic's plain question is said as is.
  const ask = useCallback(async (action) => {
    current.current = action;
    setAvatar('thinking');
    let text; let speech;
    if (action.kind === 'closing') {
      ({ text, speech } = closingLine(file));
      transcript.current.push({ from: 'ai', text });
      say(text, speech, finish);
      return;
    }
    try {
      const directive = directiveFor(action, file);
      const raw = await askAgent({ systemPrompt: interviewerPrompt(file, directive), messages: turnMessages(history.current, directive), maxTokens: 400 });
      ({ display: text, speech } = parseClaims(raw, 0));
      history.current.push({ role: 'assistant', content: raw });
    } catch (e) {
      console.warn(`[sarthi] DSA turn failed (${e?.message}) — plain question`);
      text = action.kind === 'topic' ? action.topic.ask : 'Thoda aur bataiye?';
      speech = undefined;
      history.current.push({ role: 'assistant', content: text });
    }
    if (doneRef.current) return;
    transcript.current.push({ from: 'ai', text });
    say(text, speech);
  }, [file, say, finish]);

  const nextAction = () => {
    if (queue.current.length) return queue.current.shift();
    idx.current += 1;
    setStep(idx.current);
    const topic = DSA_TOPICS[idx.current];
    return topic ? { kind: 'topic', topic } : { kind: 'closing' };
  };

  const handleAnswer = useCallback(async (text) => {
    if (doneRef.current || !current.current) return;
    stopListen.current?.();
    setAnswer(text);
    transcript.current.push({ from: 'user', text });
    history.current.push({ role: 'user', content: text });
    if (LEAVING.test(text)) { finish(); return; }

    const cur = current.current;
    const topic = cur.topic;
    if (cur.kind === 'recheck') {
      rechecks.current.push({ detail: cur.detail, answer: text });
    } else if (topic) {
      const prev = qa.current.find((x) => x.id === topic.id);
      if (prev) prev.a += ` / ${text}`; else qa.current.push({ id: topic.id, section: topic.section, q: topic.ask, a: text });
      let n = null;
      if (topic.num) { setAvatar('thinking'); n = await figureFrom(topic, text); if (n != null) nums.current[topic.id] = n; }
      if (doneRef.current) return;
      if (cur.kind === 'topic' && needsProbe(topic, text, n) && !probed.current.has(topic.id)) {
        probed.current.add(topic.id);
        ask({ kind: 'probe', topic, text });
        return;
      }
      rechecksFor(topic, text, file, nums.current).forEach((detail) => queue.current.push({ kind: 'recheck', topic, detail }));
    }
    ask(nextAction());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ask, finish, file]);
  const handleAnswerRef = useRef(handleAnswer);
  useEffect(() => { handleAnswerRef.current = handleAnswer; }, [handleAnswer]);

  // Greet and ask the first topic at once — a fixed line, no model call. Deferred a tick so StrictMode's throwaway
  // mount (whose cleanup stops speech) is cancelled before it speaks.
  const started = useRef(false);
  useEffect(() => {
    if (!file || !ready || started.current) return undefined;
    const t = setTimeout(() => {
      started.current = true;
      const { text, speech } = openingLine();
      current.current = { kind: 'topic', topic: DSA_TOPICS[0] };
      history.current = [
        { role: 'user', content: '[System: the DSA has joined the call. Greet them and begin.]' },
        { role: 'assistant', content: `\`\`\`speech\n${speech}\n\`\`\`\n${text}` },
      ];
      transcript.current.push({ from: 'ai', text });
      say(text, speech);
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, ready]);

  if (!dsa) {
    return (
      <div className={styles.generating}>
        <h2 className={styles.genTitle}>DSA not found</h2>
        <button className={styles.sheetGhost} onClick={() => navigate('/dsas', { replace: true })}>Back to DSAs</button>
      </div>
    );
  }

  if (!ready) return <CallSetup title={`DSA review · ${dsa.name}`} onStart={() => setReady(true)} onBack={() => navigate(-1)} />;

  if (phase === 'generating') {
    return (
      <div className={styles.generating}>
        <AiAvatar state="thinking" size={120} label={false} />
        <h2 className={styles.genTitle}>Generating report…</h2>
        <p className={styles.genSub}>Checking {dsa.name.split(' ')[0]}&apos;s answers against the branch record</p>
        <div className={styles.genSteps}>
          <span>Transcript captured</span>
          <span>{rechecks.current.length} figure{rechecks.current.length === 1 ? '' : 's'} rechecked on the call</span>
          <span>Red flags and pipeline assessed</span>
        </div>
      </div>
    );
  }

  const submitDraft = () => { const t = draft.trim(); if (!t) return; setDraft(''); handleAnswer(t); };
  const repeat = () => { if (!lastLine.current.text) return; stopSpeaking(); stopListen.current?.(); say(lastLine.current.text, lastLine.current.speech); };

  return (
    <div className={styles.call}>
      <header className={styles.band}>
        <VideoFeed onCameraReady={() => setCameraOn(true)} onDenied={() => setCameraOn(false)} />
        <div className={styles.bandTop}>
          <LiveBadge on={cameraOn} />
          <span className={styles.who}>{dsa.name} · DSA review</span>
        </div>
        {cameraOn
          ? <div className={styles.pip}><AiAvatar state={avatar} size={58} label={false} /></div>
          : <div className={styles.stage}><AiAvatar state={avatar} size={104} /></div>}
      </header>

      <section className={styles.sheet}>
        <div className={styles.sheetHead}>
          <span className={styles.step}>{DSA_TOPICS[step]?.section ?? 'Closing'} · {Math.min(step + 1, DSA_TOPICS.length)}/{DSA_TOPICS.length}</span>
          <span className={styles.progress} aria-hidden="true">
            <span className={styles.progressFill} style={{ width: `${Math.min(96, (step / DSA_TOPICS.length) * 100)}%` }} />
          </span>
        </div>

        <div className={styles.body}>
          <AnimatePresence mode="wait">
            {question && (
              <motion.div key={`q:${question}`} className={styles.question} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
                <span className={question.length > 110 || answer ? styles.qLong : question.length > 64 ? styles.qMed : styles.qBig}>{question}</span>
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {answer && (
              <motion.div key="answer" className={`${styles.echo} ${styles.echoBelow}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                <span className={styles.echoLabel}>Aapne kaha</span>
                <span className={styles.qLong}>{answer}</span>
              </motion.div>
            )}
          </AnimatePresence>
          <div className={`${styles.turn} ${avatar === 'listening' ? styles.turnMine : ''}`}>
            {avatar === 'listening' && <><span className={styles.wave}><i /><i /><i /><i /></span> Aapki baari — boliye</>}
            {avatar === 'speaking' && aboutSarthi('Sarthi bol rahe hain')}
            {avatar === 'thinking' && aboutSarthi('Sarthi soch rahe hain…')}
            {avatar === 'idle' && (muted ? 'Mic band hai' : 'Likhkar ya bolkar jawaab dijiye')}
          </div>
        </div>

        <div className={styles.typeRow}>
          <input className={styles.input} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submitDraft()} placeholder="Jawaab likhein…" />
          <button className={styles.send} onClick={submitDraft} aria-label="Bhejein"><IoSend size={12} /></button>
        </div>

        <div className={styles.controls}>
          <button className={styles.ctrl} onClick={repeat} disabled={!lastLine.current.text}>
            <span className={styles.disc}><IoRefresh size={12} /></span>Phir se
          </button>
          <button className={styles.ctrl} onClick={() => { const next = !silenced; setSilenced(next); setSilent(next); }} disabled={!canSpeak} aria-pressed={silenced}>
            <span className={`${styles.disc} ${silenced ? styles.discOff : ''}`}>{silenced ? <IoVolumeMute size={12} /> : <IoVolumeHigh size={12} />}</span>
            {silenced ? 'Awaaz band' : 'Awaaz'}
          </button>
          <button
            className={styles.ctrl}
            onClick={() => {
              const next = !muted;
              setMuted(next);
              if (next) { stopListen.current?.(); setAvatar('idle'); } else { setTypeMode(false); if (avatar === 'idle') beginListening(); }
            }}
            disabled={!canListen}
          >
            <span className={`${styles.disc} ${muted || !canListen ? styles.discOff : styles.discOn}`}>{muted || !canListen ? <IoMicOff size={12} /> : <IoMic size={12} />}</span>
            {!canListen ? 'Mic nahi' : muted ? 'Mic band' : 'Mic chalu'}
          </button>
          <button className={styles.ctrl} onClick={() => setConfirmEnd(true)}>
            <span className={`${styles.disc} ${styles.discEnd}`}><IoCall size={12} /></span>
            <span className={styles.endLabel}>Khatam</span>
          </button>
        </div>
      </section>

      <AnimatePresence>
        {confirmEnd && (
          <motion.div className={styles.sheetWrap} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className={styles.confirm} initial={{ y: 40 }} animate={{ y: 0 }} exit={{ y: 40 }}>
              <button className={styles.close} onClick={() => setConfirmEnd(false)} aria-label="Band karein"><FiX size={18} /></button>
              <h3>Review yahin khatam karein?</h3>
              <p className={styles.confirmNote}>Sarthi abhi tak ke jawaabon se officer ke liye report bana dega.</p>
              <div className={styles.confirmRow}>
                <button className={styles.sheetGhost} onClick={() => setConfirmEnd(false)}>Jaari rakhein</button>
                <button className={styles.sheetDanger} onClick={() => { setConfirmEnd(false); finish(); }}>Khatam karein</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
