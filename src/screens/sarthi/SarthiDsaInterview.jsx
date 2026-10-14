import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { FiX } from 'react-icons/fi';
import { IoCall, IoMic, IoMicOff, IoRefresh, IoSend, IoVolumeHigh, IoVolumeMute } from 'react-icons/io5';
import VideoFeed, { LiveBadge } from '../../components/sarthi/VideoFeed';
import CallSetup from '../../components/sarthi/CallSetup';
import AiAvatar from '../../components/sarthi/AiAvatar';
import { askAgentStream, parseClaims, peekSpeech } from '../../services/sarthi/agent';
import { DSA_TOPICS, dsaFile, needsProbe, figureFrom, openingLine, closingLine, turnMessages, rechecksFor, interviewerPrompt, directiveFor, writeDsaReport, fallbackDsaReport, deepFor, deepRechecks, fallbackLine, toDevanagari, presenceLines, nameOnly, dsaAway, DEVANAGARI } from '../../services/sarthi/dsa';
import { nameVerdict, confirmReply, speakerIsSomeoneElse, applicantComing, relationOf } from '../../services/sarthi/idChecks';
import { readIntent } from '../../services/sarthi/intent';
import { stopSpeaking, listen, canListen, canSpeak, setSilent, ANSWER_PAUSE_MS } from '../../services/voice';
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
  const flags = useRef([]);      // admissions in their own words: [{ tone, text }]
  const deepDone = useRef(new Set());
  const refused = useRef(new Set()); // topics they declined once
  const replies = useRef({}); // times we answered their question / push-back, per question
  const [aiDown, setAiDown] = useState(null); // why the last turn fell back to a fixed line
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
        endAfterMs: ANSWER_PAUSE_MS,
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
    const input = { file, qa: qa.current, rechecks: rechecks.current, flags: flags.current };
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
    // Streamed: the voice starts the moment the Devanagari speech fence closes, not when the whole reply has arrived.
    // The caption appears once both the voice has started and the Hinglish line is in.
    let early = null; let voiceOn = false; let caption = ''; let audioDone = false; let streamDone = false;
    const showCaption = () => { if (voiceOn && caption) { setQuestion(caption); setAnswer(''); } };
    const advance = () => { if (audioDone && streamDone && !doneRef.current) { setAvatar('idle'); beginListening(); } };
    try {
      const directive = directiveFor(action, file);
      const raw = await askAgentStream({
        systemPrompt: interviewerPrompt(file, directive), messages: turnMessages(history.current, directive), maxTokens: 400,
        onChunk: (full) => {
          if (early || doneRef.current) return;
          const s = peekSpeech(full);
          if (!s || !DEVANAGARI.test(s)) return;
          early = gendered(s);
          setAvatar('speaking');
          setTimeout(() => { voiceOn = true; showCaption(); }, CAPTION_FALLBACK_MS);
          speakStreamed(early, {
            voice: sarthiVoice(),
            onStart: () => { voiceOn = true; showCaption(); },
            onEnd: () => { voiceOn = true; showCaption(); audioDone = true; advance(); },
          });
        },
      });
      ({ display: text, speech } = parseClaims(raw, 0));
      setAiDown(null);
      if (early) {
        if (doneRef.current) return;
        history.current.push({ role: 'assistant', content: raw });
        caption = gendered(text);
        lastLine.current = { text: caption, speech: early };
        transcript.current.push({ from: 'ai', text });
        showCaption();
        streamDone = true;
        advance();
        return;
      }
      // No Devanagari speech fence: the Hindi voice would read the Hinglish caption in an English accent.
      if (!DEVANAGARI.test(speech)) {
        speech = await toDevanagari(text);
        if (!speech && (action.kind === 'topic' || action.deep)) ({ ask: text, speech } = action.deep ?? action.topic);
      }
      history.current.push({ role: 'assistant', content: raw });
    } catch (e) {
      // Failed mid-stream after the voice started: what was said stands as the question.
      if (early) { caption = early; transcript.current.push({ from: 'ai', text: early }); history.current.push({ role: 'assistant', content: early }); showCaption(); streamDone = true; advance(); return; }
      console.warn(`[sarthi] DSA turn failed (${e?.message}) — plain question`);
      setAiDown(e?.message || 'no reply');
      ({ text, speech } = fallbackLine(action));
      history.current.push({ role: 'assistant', content: text });
    }
    if (doneRef.current) return;
    transcript.current.push({ from: 'ai', text });
    say(text, speech);
  }, [file, say, finish, beginListening]);

  // Who is on the call is decided in code, like the PD: a review with "Raj" is not a review of Priya's work.
  const lines = useMemo(() => (dsa ? presenceLines(dsa) : null), [dsa?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const idCheck = useRef({ verified: false, handedOver: false, unclear: 0 });
  // The code picks the step; Claude says it, reacting to their words. The fixed line is the fallback (fallbackLine).
  const sayFixed = (step, line, text = '') => ask({ kind: 'id', step, line, text });
  // No review with someone else: say goodbye and go back to the DSA's profile, with no report.
  const endNoReview = (line) => {
    doneRef.current = true;
    stopListen.current?.();
    transcript.current.push({ from: 'ai', text: line.text });
    say(line.text, line.speech, () => { stopCamera(); navigate(`/dsas/${dsa.id}`, { replace: true }); });
  };
  const askName = () => { current.current = { kind: 'topic', topic: DSA_TOPICS[0] }; };
  const verifiedNow = () => { idCheck.current.verified = true; ask(nextAction()); };
  /** The name answer against the file. true = handled here (a presence step was asked), false = carry on with the review. */
  const checkName = (text) => {
    const other = speakerIsSomeoneElse(text, dsa.name);
    if (other?.away || dsaAway(text, dsa.name)) { endNoReview(lines.later); return true; }
    const v = nameVerdict(nameOnly(text, dsa), dsa.name);
    if (other || v === 'different') {
      if (idCheck.current.handedOver) { endNoReview(lines.later); return true; }
      sayFixed('relation', lines.relation, text);
      return true;
    }
    if (v === 'partial' || v === 'conflict') { sayFixed('confirm', lines.confirm, text); return true; }
    idCheck.current.verified = true;
    return false;
  };
  const handleId = (step, text) => {
    if (step === 'confirm') {
      const reply = confirmReply(text, dsa.name);
      if (reply === 'yes') { verifiedNow(); return; }
      if (reply === 'no') { if (idCheck.current.handedOver) endNoReview(lines.later); else sayFixed('relation', lines.relation, text); return; }
      idCheck.current.unclear += 1;
      if (idCheck.current.unclear >= 2) endNoReview(lines.later); else sayFixed('confirm', lines.confirmAgain, text);
      return;
    }
    if (step === 'relation' || step === 'call') {
      if (step === 'relation') qa.current.push({ id: 'presence', section: 'Identity', q: `Someone other than ${dsa.name} answered first — who are they, and where is ${dsa.name.split(' ')[0]}?`, a: `${text} (${relationOf(text)})` });
      if (applicantComing(text)) {
        idCheck.current.handedOver = true;
        rechecks.current.push({ detail: `The call was answered by someone else first; ${dsa.name} was called to the phone.`, answer: text });
        sayFixed('handover', lines.handover, text);
        askName();
        return;
      }
      if (step === 'relation') sayFixed('call', lines.call, text); else endNoReview(lines.later);
    }
  };

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

    // An answer after our reply to their question belongs to the question asked before it.
    const cur = current.current.kind === 'reply' ? current.current.of : current.current;
    const topic = cur.topic;
    // What the answer means is read by the model (any wording); the code decides what to do with it. The figure is read
    // at the same time, so the reading costs no extra wait on number topics.
    setAvatar('thinking');
    const wantsFigure = topic?.num && ['topic', 'probe', 'refusal'].includes(cur.kind);
    const [{ intent, gist }, n] = await Promise.all([
      readIntent({ question: lastLine.current.text, answer: text, name: dsa.name }),
      wantsFigure ? figureFrom(topic, text) : Promise.resolve(null),
    ]);
    if (doneRef.current) return;
    // They do not want the call: before we know it is the DSA, end it with no report; after, close kindly and report.
    if (intent === 'stop') {
      if (idCheck.current.verified) ask({ kind: 'closing' }); else endNoReview(lines.unwilling);
      return;
    }
    // A question or a push-back is answered before the review goes on — twice at most per question, then it moves on.
    const key = `${cur.kind}:${topic?.id ?? cur.step ?? ''}`;
    if ((intent === 'question' || intent === 'upset') && (replies.current[key] ?? 0) < 2) {
      replies.current[key] = (replies.current[key] ?? 0) + 1;
      ask({ kind: 'reply', of: cur, text, gist, intent });
      return;
    }
    if (cur.kind === 'id') { handleId(cur.step, text); return; }
    if (topic?.id === 'name' && !idCheck.current.verified && checkName(text)) return;
    // A refusal gets a person's answer once ("koi baat nahi, bas andaaza?"); a second one is accepted and noted.
    if (topic && cur.kind !== 'recheck' && intent === 'refused') {
      const prev = qa.current.find((x) => x.id === topic.id);
      if (prev) prev.a += ` / ${text}`; else qa.current.push({ id: topic.id, section: topic.section, q: topic.ask, a: text });
      if (!refused.current.has(topic.id)) { refused.current.add(topic.id); ask({ kind: 'refusal', topic, text }); return; }
      flags.current.push({ tone: 'warning', text: `Declined to answer: ${topic.goal} — "${text.slice(0, 60)}"` });
      const next = nextAction();
      ask(next.kind === 'topic' ? { ...next, ack: true } : next);
      return;
    }
    if (cur.kind === 'recheck') {
      rechecks.current.push({ detail: cur.detail, answer: text });
    } else if (cur.kind === 'deep') {
      qa.current.push({ id: `${topic.id}_${cur.deep.id}`, section: topic.section, q: cur.deep.ask, a: text });
      // Its own rechecks are asked next, while the answer is fresh.
      deepRechecks(cur.deep, text, file).reverse().forEach((detail) => queue.current.unshift({ kind: 'recheck', topic, detail }));
    } else if (topic) {
      const prev = qa.current.find((x) => x.id === topic.id);
      if (prev) prev.a += ` / ${text}`; else qa.current.push({ id: topic.id, section: topic.section, q: topic.ask, a: text });
      if (topic.num && n != null) nums.current[topic.id] = n;
      if (cur.kind === 'topic' && !topic.noProbe && (needsProbe(topic, text, n) || intent === 'vague') && !probed.current.has(topic.id)) {
        probed.current.add(topic.id);
        ask({ kind: 'probe', topic, text });
        return;
      }
      // Judged on everything they said on this topic, follow-up included.
      const full = qa.current.find((x) => x.id === topic.id)?.a ?? text;
      rechecksFor(topic, full, file, nums.current).forEach((detail) => queue.current.push({ kind: 'recheck', topic, detail }));
      deepFor(topic, full).filter((d) => !deepDone.current.has(d.id)).forEach((d) => {
        deepDone.current.add(d.id);
        if (d.flag) flags.current.push(d.flag);
        queue.current.push({ kind: 'deep', topic, deep: d });
      });
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

  if (!ready) return <CallSetup title={`DSA review · ${dsa.name}`} greeting={openingLine().speech} onStart={() => setReady(true)} onBack={() => navigate(-1)} />;

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
          {aiDown && <span className={styles.aiDown} title={aiDown}>AI not reachable · fixed questions</span>}
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
