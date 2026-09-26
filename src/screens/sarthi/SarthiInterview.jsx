import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { FiX } from 'react-icons/fi';
import { IoCall, IoCamera, IoMic, IoMicOff, IoRefresh, IoSend, IoVolumeHigh, IoVolumeMute } from 'react-icons/io5';
import VideoFeed, { LiveBadge } from '../../components/sarthi/VideoFeed';
import AiAvatar from '../../components/sarthi/AiAvatar';
import { getCase, briefForCitation, buildNewCase, CUSTOM_CASES_KEY } from '../../services/sarthi/knowledge';
import { parseClaims, peekSpeech, peekDisplay, writeReport, VISION_URL, COMPLETE_TAG } from '../../services/sarthi/agent';
import { extractFacts, askTurn } from '../../services/sarthi/model';
import { buildScript, buildIntakeScript, tradeFromWords, claimFromAnswer, buildFallbackReport } from '../../services/sarthi/script';
import { verifyClaims, computeEligibility, toNumber } from '../../services/sarthi/verifier';
import { createEmptyMemory, updateMemory, addFlags, recordTurn, completeness, typedFieldsFor, recordTradeAnswer, recordCrossAnswer } from '../../services/sarthi/memory';
import pdSchema from '../../data/sarthi/pdSchema.json';
import { getNextAction, directiveText, checkContradictions, checkInternalConsistency, getInterviewConfig, assessIncome } from '../../services/sarthi/controller';
import { validateReport, extractRecommendation } from '../../services/sarthi/validator';
import { validateAadhaar, validatePan, detectForeignId, pickIdentity, identitySummary } from '../../services/sarthi/idChecks';
import PhotoCapture from '../../components/sarthi/PhotoCapture';
import { startFrameCapture, stopCamera, pauseCamera, resumeCamera, getObservations, resetObservations } from '../../services/sarthi/video';
import { downscale, analysePhoto, PHOTO_ASKS } from '../../services/sarthi/photo';
import { checkUpload, liveProvenance } from '../../services/sarthi/photoCheck';
import { stopSpeaking, listen, canListen, canSpeak, setSilent } from '../../services/voice';
import { speakStreamed } from '../../services/sarthi/stream';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { SARTHI_VOICE, PRERENDERED } from '../../services/sarthi/voice';
import voiceManifest from '../../data/sarthi/voiceManifest.json';
import { useSarthiReports } from '../../hooks/useSarthiReports';
import { checkTradeMath, understanding } from '../../services/sarthi/probes';
import styles from './SarthiInterview.module.css';

// One-way video interview. Live (Gemini via proxy) or scripted when no proxy is reachable;
// everything after the interview is identical either way. Tab bar is hidden: the borrower holds the phone.

// Controller field → verifier claim type, so one finding from both sides is recognised as one.
const CLAIM_FIELD = { monthly_income: 'income', existing_emi: 'existingEmi', monthly_rent: 'rent' };

const TRANSIENT = new Set([429, 500, 502, 503, 504]);
const SECTION_BY_ID = Object.fromEntries(pdSchema.sections.map((sec) => [sec.id, sec]));

const save = (key, value) => {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota — prototype */ }
};

const CAPTION_FALLBACK_MS = 3000;

// One topic = one schema field (or fixed section / verification task), so re-asks don't advance the count.
const topicKey = (a) => `${a?.section ?? 'x'}:${a?.crossOf ? `cross_${a.crossOf}` : a?.missingFields?.[0] ?? a?.verificationTask ?? a?.tradeProbe ?? ''}`;

export default function SarthiInterview() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isIntake = id === 'new';
  const [, setReports] = useSarthiReports();
  const [, setCases] = useLocalStorage(CUSTOM_CASES_KEY, []);
  // Stable identities: the startup effect keys off caseData, and getCase() re-parses localStorage.
  const existing = useMemo(() => (isIntake ? null : getCase(id)), [id, isIntake]);
  const intake = useRef({});
  const built = useRef(null);
  const placeholder = useMemo(() => ({
    id: 'sarthi_new_pending',
    name: 'New applicant',
    business: '', businessName: '', area: '', areaKey: null, businessKey: null,
    declaredIncome: 0, loanAmountRequested: 0, loanPurpose: '', employment: 'Self-employed',
    isNew: true, hi: {}, riskPatternMatch: null,
    brief: { avgMonthlyCredit: null, bureauScore: null, existingEMIs: null, runningLoans: [], gstRegistered: false, gstVintage: null, itrFiled: false, itrIncome: null, bankStatementMonths: 0, largeDeposits: [], missingDocs: [], areaDefaultRate: null, digInto: [] },
  }), []);
  // The interview starts once, on a stable object; a walk-in rebuilt mid-call must not restart it.
  const startCase = existing ?? placeholder;
  const caseData = existing ?? built.current ?? placeholder;

  const [phase, setPhase] = useState('connecting'); // connecting · live · generating · failed
  const [avatar, setAvatar] = useState('idle');     // idle · speaking · listening · thinking
  // The question stays on screen while they answer; only the next question replaces it.
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const setCaption = useCallback(({ who, text }) => {
    if (who === 'ai') { setQuestion(text); setAnswer(''); } else setAnswer(text);
  }, []);
  const [muted, setMuted] = useState(false);
  const [silenced, setSilenced] = useState(false);
  const [typeMode, setTypeMode] = useState(!canListen);
  const [draft, setDraft] = useState('');
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [progress, setProgress] = useState('');
  const [asked, setAsked] = useState(0);
  const [photoAsk, setPhotoAsk] = useState(null); // 'shop' | 'home' while Sarthi waits for a picture
  const [photoBusy, setPhotoBusy] = useState(false);
  const [capture, setCapture] = useState(null); // { kind, volunteered } while the camera screen is open
  const startedAt = useRef(0);
  const [shownPhoto, setShownPhoto] = useState(null);
  const [collected, setCollected] = useState({});
  // Schema coverage, not question count — the controller ends on coverage.
  const [covered, setCovered] = useState(null);
  const lastLine = useRef({ text: '', speech: '' });
  const photos = useRef([]);

  // Mutable interview state — read inside async callbacks, so refs rather than state.
  const transcript = useRef([]);   // [{ role, content }] — what the report cites
  const history = useRef([]);      // what Gemini sees (includes the hidden kickoff turn)
  const claims = useRef([]);
  const scriptRef = useRef([]);
  const stepRef = useRef(0);
  const memory = useRef(createEmptyMemory(null));
  // A walk-in's case is rebuilt mid-interview; a ref, because a new caseData identity would restart it.
  const caseRef = useRef(null);
  const demoRef = useRef(false);
  const mutedRef = useRef(false);
  const lastAction = useRef(null); // what the borrower is answering right now
  // The counter counts topics, not questions: a re-ask of the same field is not a new sawaal.
  const topics = useRef(new Set());
  const countTopic = (key) => {
    if (topics.current.has(key)) return;
    topics.current.add(key);
    setAsked(topics.current.size);
  };
  const doneRef = useRef(false);
  const stopListen = useRef(null);
  const cameraRef = useRef(false);
  const liveRef = useRef(false); // proxy reachable → vision frames are worth sending

  useEffect(() => { mutedRef.current = muted; }, [muted]);
  // The mute lives in the shared voice module — never let it leak into the rest of the app.
  useEffect(() => () => setSilent(false), []);
  useEffect(() => { startedAt.current = Date.now(); }, []);

  /* ---------------------------------------------------------------- teardown */
  const teardown = useCallback(() => {
    stopSpeaking();
    stopListen.current?.();
    stopListen.current = null;
    stopCamera();
  }, []);

  useEffect(() => () => teardown(), [teardown]);

  /* ---------------------------------------------------------------- speak → listen loop */
  const beginListening = useCallback(() => {
    if (doneRef.current) return;
    if (mutedRef.current || !canListen || typeMode) { setAvatar('idle'); return; }
    setAvatar('listening');
    setCaption({ who: 'borrower', text: '' });
    stopListen.current = listen({
      onInterim: (t) => setCaption({ who: 'borrower', text: t }),
      onFinal: (t) => { if (t.trim()) handleAnswer(t.trim()); },
      onError: () => { setAvatar('idle'); setTypeMode(true); },
      onEnd: () => { stopListen.current = null; },
      endAfterMs: 1200,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeMode]);

  const say = useCallback((text, { then, speech, again, topic } = {}) => {
    lastLine.current = { text, speech };
    if (!again) countTopic(topic ?? `line:${text}`);
    setAvatar('speaking');
    if (!canSpeak) {
      setCaption({ who: 'ai', text });
      // No TTS at all — leave the caption up long enough to read, then carry on.
      const t = setTimeout(() => { setAvatar('idle'); (then ?? beginListening)(); }, Math.min(9000, 1800 + text.length * 45));
      return () => clearTimeout(t);
    }
    const line = speech || text;
    // The question appears with the voice, not seconds before it while TTS renders.
    let shown = false;
    const show = () => { if (!shown) { shown = true; setCaption({ who: 'ai', text }); } };
    // If the phone blocks audio the voice never starts; the question must still appear.
    setTimeout(show, CAPTION_FALLBACK_MS);
    // Scripted lines play pre-rendered audio; live text is streamed sentence by sentence.
    speakStreamed(line, {
      voice: SARTHI_VOICE,
      src: PRERENDERED ? voiceManifest[line] : undefined,
      onStart: show,
      onEnd: () => { show(); setAvatar('idle'); (then ?? beginListening)(); },
    });
    return undefined;
  }, [beginListening]);

  /** Say the last question again — the single most-asked thing in a real field interview. */
  const repeat = useCallback(() => {
    if (!lastLine.current.text) return;
    stopSpeaking();
    stopListen.current?.();
    say(lastLine.current.text, { speech: lastLine.current.speech, again: true });
  }, [say]);

  // Rebuilds a walk-in's case from answers so far, so later prompts get real area and trade knowledge.
  const rebuildWalkIn = useCallback(() => {
    const c = memory.current.collected;
    if (!c.business_type) return null; // nothing to ground on yet

    const a = intake.current;
    const identity = pickIdentity(a);
    const area = c.business_location ?? c.aadhaar_address ?? '';
    const subject = buildNewCase({
      name: c.applicant_name ?? 'New applicant',
      phone: '',
      age: c.age ?? '',
      area,
      business: c.business_type,
      businessKey: tradeFromWords(c.business_type) ?? '',
      businessName: c.products_services ?? '',
      businessVintage: c.business_age != null ? `${c.business_age} years` : '',
      loanPurpose: c.loan_purpose ?? '',
      loanAmountRequested: toNumber(c.loan_amount) ?? 0,
      declaredIncome: toNumber(c.monthly_income) ?? 0,
      identity,
    });
    // Keep the id stable across rebuilds so the report, photos and case list all agree.
    if (built.current) subject.id = built.current.id;
    subject.household = c.family_size != null ? `${c.family_size} members` : null;
    subject.housing = c.residence_type ?? null;

    built.current = subject;
    caseRef.current = subject;
    // The controller reads brief data off memory to decide walk-in-only sections and conditions.
    memory.current = { ...memory.current, caseData: subject, brief: subject.brief };
    return subject;
  }, []);

  // A foreign national ID ends the PD: without Indian KYC there is nothing to lend against.
  const stopForForeignId = (text, turn) => {
    const foreign = detectForeignId(text);
    if (!foreign) return false;
    intake.current = { ...intake.current, foreignId: foreign };
    memory.current = addFlags(memory.current, [{
      type: 'identity_document', field: 'identity_document', severity: 'high', turn,
      detail: `Gave a ${foreign.label} (${foreign.masked}) instead of an Indian Aadhaar or PAN. The interview was stopped here.`,
    }]);
    const line = 'Dhanyawaad. Yeh loan sirf Indian Aadhaar ya PAN ke saath hi aage badh sakta hai. Branch officer aapse khud baat karenge.';
    const speech = 'धन्यवाद। यह लोन सिर्फ़ इंडियन आधार या पैन के साथ ही आगे बढ़ सकता है। ब्रांच ऑफ़िसर आपसे ख़ुद बात करेंगे।';
    transcript.current.push({ role: 'assistant', content: line });
    memory.current = recordTurn(memory.current, 'assistant', line);
    say(line, { speech, then: finish });
    return true;
  };

  /* ---------------------------------------------------------------- one borrower answer */
  const handleAnswer = useCallback(async (text) => {
    if (doneRef.current) return;
    stopListen.current?.();
    transcript.current.push({ role: 'user', content: text });
    history.current.push({ role: 'user', content: text });
    setCaption({ who: 'borrower', text });
    setAvatar('thinking');

    const borrowerTurn = transcript.current.length;

    if (demoRef.current) {
      const step = scriptRef.current[stepRef.current];
      const claim = claimFromAnswer(step ?? {}, text, borrowerTurn);
      if (claim) claims.current.push(claim);

      // Scripted mode fills the same structured memory as the live agent, so the report, the
      // consistency checks and the coverage bar behave identically with or without a proxy.
      memory.current = recordTurn(memory.current, 'user', text);
      if (step?.collect) memory.current = updateMemory(memory.current, { [step.collect]: text, _verbatim: text });
      setCovered(completeness(memory.current));

      // Intake: this answer IS the file. Store it, and check a document the moment it arrives.
      if (isIntake && step?.collect) {
        intake.current[step.collect] = text;
        if (step.collect === 'aadhaar') intake.current.aadhaarCheck = validateAadhaar(text);
        if (step.collect === 'pan') intake.current.panCheck = validatePan(text, intake.current.name ?? '');
        setCollected({ ...intake.current });
      }
      if (['aadhaar', 'pan'].includes(step?.collect) && stopForForeignId(text, borrowerTurn)) return;

      stepRef.current += 1;
      const next = scriptRef.current[stepRef.current];
      if (!next) { finish(); return; }
      const line = next.text.replace(COMPLETE_TAG, '').trim();
      transcript.current.push({ role: 'assistant', content: line });
      memory.current = recordTurn(memory.current, 'assistant', line);
      if (next.typed) setTypeMode(true);
      const after = next.photo
        ? { then: () => setPhotoAsk(next.photo) }
        : next.end ? { then: finish } : {};
      setTimeout(() => say(line, { speech: next.speech, ...after }), 500);
      return;
    }

    memory.current = recordTurn(memory.current, 'user', text);

    try {
      // Extract first, then pick the next topic, so the controller decides on THIS turn's facts.
      // Snapshot before merging: checkContradictions and coaching detection compare against prior state.
      const before = memory.current;
      // An insider trade question is answered verbatim — the words ARE the evidence.
      if (lastAction.current?.tradeProbeDef) {
        memory.current = recordTradeAnswer(memory.current, lastAction.current.tradeProbeDef, text, borrowerTurn);
      }
      if (lastAction.current?.crossOf) {
        const asked = transcript.current.filter((t) => t.role === 'assistant').at(-1)?.content ?? '';
        memory.current = recordCrossAnswer(memory.current, lastAction.current.crossOf, asked, text, borrowerTurn);
      }

      let facts = {};
      try {
        facts = await extractFacts(text, {
          section: memory.current.currentSection,
          recent: transcript.current.filter((t) => t.role === 'assistant').slice(-1).map((t) => t.content),
        });
      } catch (e) {
        // Not fatal: the question call's facts fence is the backstop. Never abandon the turn.
        console.warn(`[sarthi] fact extraction failed (${e?.message}) — relying on the facts fence`);
      }
      if (Object.keys(facts).length) memory.current = updateMemory(memory.current, { ...facts, _verbatim: text });

      // Checked on their own words, not the extraction — the model filed a CNIC under pan_number.
      const docDue = memory.current.currentSection === 'documents' || facts.aadhaar_number || facts.pan_number;
      if (docDue && stopForForeignId(text, borrowerTurn)) return;

      if (isIntake) rebuildWalkIn();
      const subject = caseRef.current ?? caseData;

      const action = getNextAction(memory.current, subject);
      if (action.memory) memory.current = action.memory;
      lastAction.current = action;

      if (action.action === 'end_interview') { finish(); return; }

      // Document numbers are typed — speech recognition mangles them.
      setTypeMode(typedFieldsFor(memory.current, SECTION_BY_ID[action.section]).length > 0 || !canListen);

      // Speak as soon as the speech fence closes. The follow-up (photo / end / listen) runs once,
      // after whichever of audio or stream finishes last.
      let spokenYet = false;
      let voiceOn = false;
      let pending = '';
      const showCaption = (text) => { pending = text; if (voiceOn && text) setCaption({ who: 'ai', text }); };
      let audioDone = false;
      let streamDone = false;
      let after = null;
      const advance = () => {
        if (!audioDone || !streamDone || doneRef.current) return;
        setAvatar('idle');
        (after ?? beginListening)();
      };

      const raw = await askTurn({
        caseData: subject,
        action,
        directive: directiveText(action),
        messages: history.current,
        turn: borrowerTurn,
        onChunk: (full) => {
          const caption = peekDisplay(full);
          if (caption) showCaption(caption);
          if (spokenYet) return;
          const early = peekSpeech(full);
          if (!early) return;
          spokenYet = true;
          setTimeout(() => { if (!voiceOn) { voiceOn = true; showCaption(pending); } }, CAPTION_FALLBACK_MS);
          lastLine.current = { text: caption, speech: early };
          countTopic(topicKey(action));
          speakStreamed(early, {
            voice: SARTHI_VOICE,
            src: PRERENDERED ? voiceManifest[early] : undefined,
            onStart: () => { voiceOn = true; setAvatar('speaking'); showCaption(pending); },
            onEnd: () => { voiceOn = true; showCaption(pending); audioDone = true; advance(); },
          });
        },
      });
      const { display, speech, claims: found, facts: fenced, complete, photo } = parseClaims(raw, borrowerTurn);
      claims.current.push(...found);

      // Gap-fill from the question call's facts fence, then run the code-only checks.
      const gapFill = Object.fromEntries(Object.entries(fenced).filter(([k]) => !(k in facts)));
      memory.current = updateMemory(memory.current, { ...gapFill, _verbatim: text });
      facts = { ...gapFill, ...facts };
      // Check a document the moment it is given, exactly as the scripted intake does.
      if (facts.aadhaar_number) intake.current.aadhaarCheck = validateAadhaar(String(facts.aadhaar_number));
      if (facts.pan_number) {
        intake.current.panCheck = validatePan(
          String(facts.pan_number),
          memory.current.collected.applicant_name ?? '',
        );
      }
      const failedDocs = [facts.aadhaar_number && intake.current.aadhaarCheck, facts.pan_number && intake.current.panCheck]
        .filter((c) => c && !c.ok)
        .map((c) => ({ type: 'identity_document', field: 'identity_document', severity: 'high', turn: borrowerTurn, detail: identitySummary(c) }));
      if (failedDocs.length) memory.current = addFlags(memory.current, failedDocs);
      if (isIntake && (facts.aadhaar_number || facts.pan_number)) {
        intake.current = { ...intake.current };
        setCollected({ ...memory.current.collected, ...intake.current });
      }

      const config = getInterviewConfig(subject);
      // The trade's arithmetic, rerun every turn so a figure that does not add up is followed up while they are here.
      const math = checkTradeMath(memory.current);
      memory.current = { ...memory.current, tradeMath: math.results };
      const found_flags = [
        ...math.flags,
        ...checkContradictions(before, facts, subject),
        // A walk-in has nothing to check against, so their own numbers have to do the work.
        ...(config.isNewApplicant ? checkInternalConsistency(memory.current, subject) : []),
      ];
      // Only flags we have not already raised — the same contradiction resurfaces every turn.
      const fresh = found_flags.filter((f) => !memory.current.flags.some((p) => p.detail === f.detail));
      memory.current = addFlags(memory.current, fresh);
      if (action.hyperLocal) memory.current = { ...memory.current, askedHyperLocal: true };
      if (action.riskAlert) memory.current = { ...memory.current, askedRisk: true };

      memory.current = recordTurn(memory.current, 'assistant', display);
      setCovered(completeness(memory.current));

      history.current.push({ role: 'assistant', content: raw });
      transcript.current.push({ role: 'assistant', content: display });

      after = photo ? () => setPhotoAsk(photo) : complete ? finish : null;

      if (spokenYet) {
        showCaption(display);
        lastLine.current = { text: display, speech };
        streamDone = true;
        advance();
      } else {
        // No speech fence arrived mid-stream — speak the finished turn.
        streamDone = true;
        audioDone = true;
        say(display, { speech, topic: topicKey(action), ...(after ? { then: after } : {}) });
      }
    } catch (e) {
      // Borrow one scripted question and retry live next turn; only a permanent error locks to the script.
      lastAction.current = null; // the scripted question is not the trade probe the controller picked
      const permanent = e?.status != null && !TRANSIENT.has(e.status);
      console.warn(`[sarthi] live turn failed (${e?.message}) — ${permanent ? 'switching to scripted mode' : 'using a scripted question, will retry live next turn'}`);
      if (permanent) {
        demoRef.current = true;
        setDemoMode(true);
      }
      const next = scriptRef.current[stepRef.current] ?? scriptRef.current[scriptRef.current.length - 1];
      const line = next.text.replace(COMPLETE_TAG, '').trim();
      // Advance the script cursor so a second stumble does not repeat the same question.
      stepRef.current = Math.min(stepRef.current + 1, scriptRef.current.length - 1);
      transcript.current.push({ role: 'assistant', content: line });
      memory.current = recordTurn(memory.current, 'assistant', line);
      say(line, { speech: next.speech });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseData, say]);

  // Photos come from the live camera; a file is accepted only when the camera cannot open, and is checked.
  const openCapture = useCallback((attached = false) => {
    // The attach button answers a pending ask; otherwise the photo is filed under what Sarthi lacks.
    const volunteered = attached && !photoAsk;
    const sent = photos.current.map((p) => p.kind);
    const kind = volunteered
      ? (!sent.includes('shop') ? 'shop' : !sent.includes('home') ? 'home' : 'extra')
      : photoAsk;
    if (!kind) return;
    // Otherwise speech during the capture would answer the question behind the camera.
    stopListen.current?.();
    stopListen.current = null;
    setAvatar('idle');
    pauseCamera();
    setCapture({ kind, volunteered });
  }, [photoAsk]);

  const closeCapture = useCallback(() => {
    setCapture(null);
    if (cameraRef.current) resumeCamera();
  }, []);

  const cancelCapture = useCallback(() => {
    const wasVolunteered = capture?.volunteered;
    closeCapture();
    if (wasVolunteered) beginListening();
  }, [capture, closeCapture, beginListening]);

  const submitPhoto = useCallback(async ({ dataUrl: shot, file, facing }, { kind, volunteered }) => {
    closeCapture();
    setPhotoBusy(true);
    try {
      const provenance = file ? await checkUpload(file, { startedAt: startedAt.current }) : liveProvenance(facing);
      const dataUrl = shot ?? await downscale(file);
      setShownPhoto(dataUrl);
      setPhotoAsk(null);
      const record = await analysePhoto({ dataUrl, kind, caseData: caseRef.current ?? caseData, provenance });
      photos.current.push(record);
      setPhotoBusy(false);
      setTimeout(() => setShownPhoto(null), 2600); // long enough to see it landed
      // Only an answer to a question moves the interview on. A volunteered photo is filed and
      // Sarthi carries on waiting for the answer it actually asked for.
      if (volunteered) { transcript.current.push({ role: 'user', content: `[${PHOTO_ASKS[kind].hint} bheji]` }); beginListening(); }
      else handleAnswer(`[${PHOTO_ASKS[kind].hint} bheji]`);
    } catch {
      setPhotoBusy(false);
      setPhotoAsk(null);
      if (!volunteered) handleAnswer('[photo nahi bhej paaye]');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseData, beginListening, closeCapture]);

  const skipPhoto = useCallback(() => {
    const kind = photoAsk;
    setPhotoAsk(null);
    photos.current.push({ kind, label: PHOTO_ASKS[kind]?.label ?? kind, skipped: true, at: new Date().toISOString() });
    handleAnswer('[photo dene se mana kiya]');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoAsk]);

  /* ---------------------------------------------------------------- report */
  const finish = useCallback(async () => {
    if (doneRef.current) return;
    doneRef.current = true;
    teardown();
    setPhase('generating');

    const turns = transcript.current;
    const captured = claims.current;

    // A live walk-in has been rebuilt all along; the scripted fallback assembles one from intake.
    let subject = caseRef.current ?? caseData;
    // The rebuilt case can predate the last document answer; the intake record is always current.
    if (isIntake && built.current) subject = { ...subject, identity: pickIdentity(intake.current) ?? subject.identity };
    if (isIntake && !built.current) {
      setProgress('Opening the file…');
      const a = intake.current;
      const identity = pickIdentity(a);
      subject = buildNewCase({
        name: a.name ?? 'Unnamed applicant',
        phone: '', age: a.age ?? '',
        area: a.area ?? '',
        business: a.occupation ?? 'Not stated',
        businessKey: tradeFromWords(a.occupation ?? '') ?? '',
        businessName: a.businessName ?? '',
        businessVintage: a.businessVintage ?? '',
        loanPurpose: a.loanPurpose ?? '',
        loanAmountRequested: toNumber(a.loanAmountRequested) ?? 0,
        declaredIncome: toNumber(a.declaredIncome) ?? 0,
        identity,
      });
      subject.household = a.family ?? null;
      subject.housing = a.housing ?? null;
      subject.brief.digInto = [
        ...subject.brief.digInto,
        a.family ? `Household: ${a.family}` : null,
        a.housing ? `Home is ${a.housing}` : null,
        a.earners ? `Other earners at home: ${a.earners}` : null,
        a.informalLoans ? `Informal borrowing, in their words: ${a.informalLoans}` : null,
      ].filter(Boolean);
      built.current = subject;
    }
    // Live walk-ins are rebuilt in memory only, so save every walk-in here or it never reaches the case list.
    if (isIntake) setCases((prev) => [subject, ...prev.filter((c) => c.id !== subject.id)]);

    setProgress('Verifying claims against bureau and bank data…');
    const { evidence, flags: claimFlags } = verifyClaims(captured, subject);

    // Rerun at the end, when every answer is in.
    const consistency = checkInternalConsistency(memory.current, subject);

    const photoFlags = photos.current.flatMap((p) => (p.provenance?.flags ?? []).map((f) => ({
      type: 'photo_provenance', field: `photo_${p.kind}`, severity: f.severity, detail: `Photo sent as ${p.label}: ${f.detail}`,
    })));

    // Where verifier and controller flag the same field, keep the verifier's (it has a turn).
    const settled = new Set(claimFlags.map((f) => f.claimType).filter(Boolean));
    const math = checkTradeMath(memory.current);
    const depth = understanding(memory.current);
    const flags = [...claimFlags, ...memory.current.flags, ...consistency, ...math.flags, ...photoFlags]
      .filter((f) => !(f.type === 'contradiction' && settled.has(CLAIM_FIELD[f.field])))
      .filter((f, i, all) => all.findIndex((o) => o.detail === f.detail) === i);

    const assessed = assessIncome(memory.current, subject);
    const eligibility = computeEligibility(subject, assessed);
    const observations = getObservations();
    const collectedFacts = memory.current.collected;

    save(`bo_sarthi_transcript_${subject.id}`, turns);
    save(`bo_sarthi_claims_${subject.id}`, captured);
    save(`bo_sarthi_evidence_${subject.id}`, { evidence, flags, eligibility, observations, collected: collectedFacts, understanding: depth, tradeMath: math.results });
    // Images are kept in their own key: base64 is heavy and must not risk the report's own write.
    save(`bo_sarthi_photos_${subject.id}`, photos.current);

    let report;
    let validation = null;
    let usedDemo = demoRef.current;

    if (!demoRef.current) {
      try {
        setProgress('Writing the PD report…');
        const raw = await writeReport({ caseData: subject, transcript: turns, claims: captured, evidence, flags, collected: collectedFacts, verification: memory.current.verification, understanding: depth, tradeMath: math.results, crossAnswers: memory.current.crossAnswers, eligibility, observations, photos: photos.current, identity: subject.identity });
        setProgress('Checking every citation…');
        validation = validateReport(raw, turns, captured, briefForCitation(subject), eligibility, { flags, collected: collectedFacts });
        report = validation.cleanedReport;
      } catch (e) {
        console.warn('[sarthi] report agent failed, using the built-in writer', e);
        usedDemo = true;
      }
    }

    if (!report) {
      setProgress('Writing the PD report…');
      report = buildFallbackReport({ caseData: subject, transcript: turns, evidence, flags, eligibility, observations, photos: photos.current, identity: subject.identity, cameraOn: cameraRef.current, understanding: depth, tradeMath: math.results });
      validation = validateReport(report, turns, captured, briefForCitation(subject), eligibility, { flags, collected: collectedFacts });
    }

    const entry = {
      id: `sarthi_report_${Date.now()}`,
      caseId: subject.id,
      name: subject.name,
      createdAt: new Date().toISOString(),
      demoMode: usedDemo,
      cameraOn: cameraRef.current,
      report,
      recommendation: extractRecommendation(report),
      evidence,
      flags,
      eligibility,
      observations,
      // metadata only — the images themselves live in bo_sarthi_photos_<case>
      photos: photos.current.map(({ dataUrl, ...rest }) => rest),
      identity: subject.identity ?? null,
      understanding: depth.total ? depth : null,
      tradeMath: math.results.length ? math.results : null,
      validation,
      turns: turns.length,
    };
    setReports((prev) => [entry, ...prev.filter((r) => r.caseId !== subject.id)]);
    navigate(`/sarthi/report/${subject.id}`, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseData, navigate, setReports, teardown]);

  /* ---------------------------------------------------------------- start */
  useEffect(() => {
    if (!startCase) return;
    let cancelled = false;
    resetObservations();
    scriptRef.current = isIntake ? buildIntakeScript() : buildScript(startCase);
    memory.current = createEmptyMemory(startCase);
    caseRef.current = startCase;

    (async () => {
      // The opening question is the reachability probe — no separate probe request.
      setPhase('live');
      history.current = [{ role: 'user', content: '[System: the borrower has joined the call. Greet them and begin the interview.]' }];

      try {
        const opening = getNextAction(memory.current, startCase);
        if (opening.memory) memory.current = opening.memory;
        const raw = await askTurn({ caseData: startCase, action: opening, directive: directiveText(opening), messages: history.current, turn: 0 });
        if (cancelled) return;
        const { display, speech } = parseClaims(raw, 0);
        demoRef.current = false;
        liveRef.current = true;
        if (cameraRef.current) startFrameCapture(VISION_URL, () => {});
        memory.current = recordTurn(memory.current, 'assistant', display);
        history.current.push({ role: 'assistant', content: raw });
        transcript.current.push({ role: 'assistant', content: display });
        say(display, { speech, topic: topicKey(opening) });
        return;
      } catch (e) {
        if (cancelled) return;
        const permanent = e?.status != null && !TRANSIENT.has(e.status);
        demoRef.current = permanent;
        liveRef.current = !permanent;
        setDemoMode(permanent);
        console.warn(`[sarthi] opening turn failed (${e?.message}) — ${permanent ? 'scripted for the rest of the interview' : 'scripted opening, retrying live on the next turn'}`);
        if (!permanent && cameraRef.current) startFrameCapture(VISION_URL, () => {});
      }

      const first = scriptRef.current[0];
      memory.current = recordTurn(memory.current, 'assistant', first.text);
      transcript.current.push({ role: 'assistant', content: first.text });
      // Keep the scripted cursor past the line we just used, or turn two repeats it.
      stepRef.current = demoRef.current ? 0 : 1;
      say(first.text, { speech: first.speech });
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startCase]);

  if (!caseData) {
    return (
      <div className={styles.generating}>
        <h2 className={styles.genTitle}>Case not found</h2>
        <button className={styles.sheetGhost} onClick={() => navigate('/sarthi', { replace: true })}>Back to cases</button>
      </div>
    );
  }

  const total = scriptRef.current.length || 18;

  const submitDraft = () => {
    const t = draft.trim();
    if (!t) return;
    setDraft('');
    handleAnswer(t);
  };

  const onCameraReady = () => {
    cameraRef.current = true;
    setCameraOn(true);
    if (liveRef.current) startFrameCapture(VISION_URL, () => {});
  };

  /* ---------------------------------------------------------------- generating screen */
  if (phase === 'generating') {
    return (
      <div className={styles.generating}>
        <AiAvatar state="thinking" size={120} label={false} />
        <h2 className={styles.genTitle}>Generating report…</h2>
        <p className={styles.genSub}>{progress || 'Reviewing the interview…'}</p>
        <div className={styles.genSteps}>
          <span>Transcript captured</span>
          <span>Claims verified against bureau &amp; bank data</span>
          <span>Eligibility calculated by the system</span>
          <span>Citations checked</span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.call}>
      {/* Everything the applicant reads is on the sheet below, for legibility in sunlight. */}
      <header className={styles.band}>
        <VideoFeed onCameraReady={onCameraReady} onDenied={() => setCameraOn(false)} />
        <div className={styles.bandTop}>
          <LiveBadge on={cameraOn} />
          <span className={styles.who}>{collected.name ?? caseData.name}</span>
        </div>
        {cameraOn
          ? <div className={styles.pip}><AiAvatar state={avatar} size={58} label={false} /></div>
          : <div className={styles.stage}><AiAvatar state={avatar} size={104} /></div>}
      </header>

      <section className={styles.sheet}>
        <div className={styles.sheetHead}>
          <span className={styles.step}>{asked > 0 ? `Sawaal ${asked}` : 'Shuru ho raha hai'}</span>
          <span className={styles.progress} aria-hidden="true">
            <span className={styles.progressFill} style={{ width: `${Math.min(96, covered?.filled ? covered.pct : (asked / total) * 100)}%` }} />
          </span>
        </div>

        <div className={styles.body}>
          <AnimatePresence mode="wait">
            {question && (
              <motion.div
                // Keyed per turn, not per text: a streamed caption changes many times a second, and
                // remounting on each change stalls AnimatePresence "wait" on a stale question.
                key={`q:${asked}`}
                className={styles.question}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
              >
                <span className={question.length > 110 || answer ? styles.qLong : question.length > 64 ? styles.qMed : styles.qBig}>
                  {question}
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {answer && (
              <motion.div
                key="answer"
                className={`${styles.echo} ${styles.echoBelow}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <span className={styles.echoLabel}>Aapne kaha</span>
                <span className={styles.qLong}>{answer}</span>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {shownPhoto && (
              <motion.div className={styles.shot} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                <img src={shownPhoto} alt="" />
                <span>{photoBusy ? 'Sarthi dekh rahe hain…' : 'Mil gayi, dhanyawaad'}</span>
              </motion.div>
            )}
          </AnimatePresence>

          <div className={`${styles.turn} ${avatar === 'listening' ? styles.turnMine : ''}`}>
            {avatar === 'listening' && <><span className={styles.wave}><i /><i /><i /><i /></span> Aapki baari — boliye</>}
            {avatar === 'speaking' && 'Sarthi bol rahe hain'}
            {avatar === 'thinking' && 'Sarthi soch rahe hain…'}
            {avatar === 'idle' && (photoAsk ? 'Neeche se photo bhejiye' : muted ? 'Mic band hai' : 'Likhkar ya bolkar jawaab dijiye')}
          </div>
        </div>

        {photoAsk && !photoBusy && (
          <div className={styles.photoAsk}>
            <button className={styles.shoot} onClick={() => openCapture(false)}>
              <IoCamera size={20} /> {PHOTO_ASKS[photoAsk].hint} lijiye
            </button>
            <button className={styles.skip} onClick={skipPhoto}>Abhi nahi</button>
          </div>
        )}

        {/* Always available: they can type or send a picture at any point, not only when asked. */}
        <div className={styles.typeRow}>
          <button className={styles.attach} title="Photo lein" aria-label="Photo lein" onClick={() => openCapture(true)}>
            <IoCamera size={13} />
          </button>
          <input
            className={styles.input}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitDraft()}
            placeholder="Jawaab likhein…"
          />
          <button className={styles.send} onClick={submitDraft} aria-label="Bhejein"><IoSend size={12} /></button>
        </div>

        <div className={styles.controls}>
          <button className={styles.ctrl} onClick={repeat} disabled={!lastLine.current.text}>
            <span className={styles.disc}><IoRefresh size={12} /></span>
            Phir se
          </button>

          <button
            className={styles.ctrl}
            onClick={() => { const next = !silenced; setSilenced(next); setSilent(next); }}
            disabled={!canSpeak}
            aria-pressed={silenced}
          >
            <span className={`${styles.disc} ${silenced ? styles.discOff : ''}`}>
              {silenced ? <IoVolumeMute size={12} /> : <IoVolumeHigh size={12} />}
            </span>
            {silenced ? 'Awaaz band' : 'Awaaz'}
          </button>

          <button
            className={styles.ctrl}
            onClick={() => {
              const next = !muted;
              setMuted(next);
              if (next) { stopListen.current?.(); setAvatar('idle'); }
              else { setTypeMode(false); if (avatar === 'idle') beginListening(); }
            }}
            disabled={!canListen}
          >
            <span className={`${styles.disc} ${muted || !canListen ? styles.discOff : styles.discOn}`}>
              {muted || !canListen ? <IoMicOff size={12} /> : <IoMic size={12} />}
            </span>
            {!canListen ? 'Mic nahi' : muted ? 'Mic band' : 'Mic chalu'}
          </button>

          <button className={styles.ctrl} onClick={() => setConfirmEnd(true)}>
            <span className={`${styles.disc} ${styles.discEnd}`}><IoCall size={12} /></span>
            <span className={styles.endLabel}>Khatam</span>
          </button>
        </div>
      </section>

      {/* connecting overlay */}
      <AnimatePresence>
        {phase === 'connecting' && (
          <motion.div className={styles.connecting} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <AiAvatar state="thinking" size={104} label={false} />
            <div className={styles.connectTitle}>Sarthi se jud rahe hain…</div>
            <div className={styles.connectSub}>
              {isIntake ? 'Phone naye grahak ko de dijiye' : `Phone ${caseData.name.split(' ')[0]} ji ko de dijiye`}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {capture && (
        <PhotoCapture
          title={PHOTO_ASKS[capture.kind].hint}
          hint={PHOTO_ASKS[capture.kind].frame}
          onCapture={(shot) => submitPhoto(shot, capture)}
          onUpload={(file) => submitPhoto({ file }, capture)}
          onCancel={cancelCapture}
        />
      )}

      {/* end confirmation */}
      <AnimatePresence>
        {confirmEnd && (
          <motion.div className={styles.sheetWrap} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className={styles.confirm} initial={{ y: 40 }} animate={{ y: 0 }} exit={{ y: 40 }}>
              <button className={styles.close} onClick={() => setConfirmEnd(false)} aria-label="Band karein"><FiX size={18} /></button>
              <h3>Interview yahin khatam karein?</h3>
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
