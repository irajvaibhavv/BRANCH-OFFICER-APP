import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { FiX } from 'react-icons/fi';
import { IoCall, IoCamera, IoMic, IoMicOff, IoRefresh, IoSend, IoVolumeHigh, IoVolumeMute } from 'react-icons/io5';
import VideoFeed, { LiveBadge } from '../../components/sarthi/VideoFeed';
import CallSetup from '../../components/sarthi/CallSetup';
import AiAvatar from '../../components/sarthi/AiAvatar';
import { getCase, briefForCitation, buildNewCase, CUSTOM_CASES_KEY, tradeOf } from '../../services/sarthi/knowledge';
import { checkChallenge } from '../../services/sarthi/challenges';
import { parseClaims, peekSpeech, peekDisplay, writeReport, CHAT_URL, VISION_URL, COMPLETE_TAG } from '../../services/sarthi/agent';
import { extractFacts, askTurn } from '../../services/sarthi/model';
import { buildScript, buildIntakeScript, tradeFromWords, claimFromAnswer, buildFallbackReport } from '../../services/sarthi/script';
import { verifyClaims, computeEligibility, toNumber } from '../../services/sarthi/verifier';
import { createEmptyMemory, knownFacts, updateMemory, addFlags, recordTurn, completeness, typedFieldsFor, recordTradeAnswer, recordProfessionAnswer, recordCrossAnswer, recordHotAnswer, acceptedFacts, MAX_ASKS, isSalaried, isAssisted } from '../../services/sarthi/memory';
import { assistedFlags } from '../../services/sarthi/assisted';
import { readIntent, replyPrefix } from '../../services/sarthi/intent';
import { queueRechecks, recordRecheckAnswer, driftRechecks } from '../../services/sarthi/recheck';
import { loadHot, ruleHotQuestions } from '../../services/sarthi/prep';
import { readNumbers } from '../../services/sarthi/hindiNumbers';
import pdSchema from '../../data/sarthi/pdSchema.json';
import { getNextAction, directiveText, checkContradictions, checkInternalConsistency, getInterviewConfig, assessIncome } from '../../services/sarthi/controller';
import { validateReport, extractRecommendation } from '../../services/sarthi/validator';
import { validateAadhaar, validatePan, detectForeignId, detectForeignResidence, pickIdentity, identitySummary, nameVerdict, confirmReply, nameFromWords, relationOf, applicantComing, presenceLines, speakerIsSomeoneElse } from '../../services/sarthi/idChecks';
import PhotoCapture from '../../components/sarthi/PhotoCapture';
import { startFrameCapture, stopCamera, pauseCamera, resumeCamera, getObservations, resetObservations, grabFrame } from '../../services/sarthi/video';
import { loadFace, compareFace, faceFlags, faceSummary, faceLines, FACE_EVERY_MS, FACE_MAX, callFrameKey, LIVENESS, checkLiveness, livenessFlag } from '../../services/sarthi/face';
import { downscale, analysePhoto, stockCheck, PHOTO_ASKS } from '../../services/sarthi/photo';
import { checkUpload, liveProvenance } from '../../services/sarthi/photoCheck';
import { getFix, checkPlace, inDistance, callPlace } from '../../services/sarthi/geo';
import { MODES, priorFacts, seedResume, flagQuestions, crossSteps, DRAFT_PREFIX } from '../../services/sarthi/repeat';
import { checkAgainstEarlierPds, crossPdFlags, fileNameCheck, nameFlags, nameRecheck } from '../../services/sarthi/crossPd';
import { livingFacts, factLines, analyseLiving } from '../../services/sarthi/living';
import { stopSpeaking, listen, canListen, canSpeak, setSilent, ANSWER_PAUSE_MS } from '../../services/voice';
import { speakStreamed } from '../../services/sarthi/stream';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { sarthiVoice, prerendered, gendered, aboutSarthi } from '../../services/sarthi/voice';
import voiceManifest from '../../data/sarthi/voiceManifest.json';
import { useSarthiReports, usePendingPds } from '../../hooks/useSarthiReports';
import { OFFICER } from '../../context/AuthContext';
import { checkTradeMath, understanding } from '../../services/sarthi/probes';
import { formatINR } from '../../utils/formatters';
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
// What a "finish last PD" needs to skip what this one already asked (repeat.js seedResume).
const pdState = (m) => ({
  hotAsked: m.hotAsked ?? [],
  crossAsked: m.crossAsked ?? [],
  tradeAnswers: m.tradeAnswers ?? [],
  professionAnswers: m.professionAnswers ?? [],
  challengePlanned: !!m.challengePlanned,
});
const photoMeta = (list) => list.map(({ dataUrl, panDataUrl, ...rest }) => rest);
// The borrower ending the call themselves.
const LEAVING = /\b(bye|alvida|band karo|band kar do|rehne do|nahi karna|cut karo|cut kar raha|mujhe jaana hai)\b|अलविदा|बाय|बंद करो/i;

// One topic = one schema field (or fixed section / verification task), so re-asks don't advance the count.
const topicKey = (a) => `${a?.section ?? 'x'}:${a?.liveness ? 'liveness' : a?.crossOf ? `cross_${a.crossOf}` : a?.recheckOf ? `recheck_${a.recheckOf}` : a?.hot ? `hot_${a.hot.id}` : a?.photo ? `photo_${a.photo}` : a?.professionCheck ? `profession_${a.professionCheck}` : a?.challenge ? `challenge_${a.challenge.id}_${a.challenge.step}` : a?.missingFields?.[0] ?? a?.verificationTask ?? a?.tradeProbe ?? ''}`;

export default function SarthiInterview() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isIntake = id === 'new';
  const [reports] = useSarthiReports();
  const [, setPending] = usePendingPds();
  const [params] = useSearchParams();
  // Every earlier PD of this person, newest first; a repeat PD runs in the mode picked on the brief (repeat.js).
  const past = useMemo(() => reports.filter((r) => r.caseId === id), [reports, id]);
  const mode = MODES[params.get('mode')] ? params.get('mode') : 'full';
  const basePd = past.find((r) => r.id === params.get('from')) ?? past[0] ?? null;
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

  const [ready, setReady] = useState(false); // camera, mic and voice set on CallSetup
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
  const [operatorTurn, setOperatorTurn] = useState(false); // assisted PD: the phone is with the one who runs the business
  const [photoBusy, setPhotoBusy] = useState(false);
  const [capture, setCapture] = useState(null); // { kind, volunteered } while the camera screen is open
  const startedAt = useRef(0);
  const boPresent = useRef(false); // declared on CallSetup: the officer is sitting with the applicant
  const assistedStart = useRef(false); // declared on CallSetup: the one who runs the business is here too
  const lastChallengePhoto = useRef(null); // the photo kind a challenge's follow-up asks about
  const endReason = useRef(null); // why a call ended before the schema did — shown in the PD audit trail
  // The call's face against the customer photo on file, all through the call. checks: [{ verdict, reason, people, frame, at }];
  // act: the latest check still to be acted on at the next turn; again: check on the next answer, not after the interval.
  const faceWatch = useRef({ checks: [], inFlight: false, lastAt: 0, lastSection: null, act: null, again: false, reframes: 0, prev: null, retried: false });
  // Every PD has its id from the start: the draft saved after each answer and the final report share it.
  const [pdId] = useState(() => `sarthi_report_${Date.now()}`);
  const draftKey = `${DRAFT_PREFIX}${pdId}`;
  const callLog = useRef([]); // timestamped events beside the transcript: GPS, photos, liveness — the report's call log
  const logEvent = (text, tone = 'info') => callLog.current.push({ at: Date.now(), text, tone });
  const callGeo = useRef({ start: null, end: null }); // where the call itself was taken, at its start and its end
  const live = useRef(null); // { task, at, result, frames } — the one liveness check of this PD
  const nameAsked = useRef(false); // a photo with someone else's name is asked about once
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
  const replyTo = useRef(null); // their last reply was not an answer — the next turn responds to it first
  const replies = useRef({}); // questions / push-backs answered, per field (at most 2)
  const refusals = useRef({}); // refusals, per field
  const takeReplyPrefix = () => { const r = replyTo.current; replyTo.current = null; return r ? replyPrefix(r) : ''; };
  // The counter counts topics, not questions: a re-ask of the same field is not a new sawaal.
  const topics = useRef(new Set());
  const countTopic = (key) => {
    if (topics.current.has(key)) return;
    topics.current.add(key);
    setAsked(topics.current.size);
  };
  const doneRef = useRef(false);
  const presence = useRef(null); // null · relation · call · handover · confirm · done — someone other than the applicant answered
  const confirm = useRef(null); // { stated, verdict, handover, retried } while asking "aap X ji hi hain?"
  const stopListen = useRef(null);
  const cameraRef = useRef(false);
  const liveRef = useRef(false); // proxy reachable → vision frames are worth sending

  useEffect(() => { mutedRef.current = muted; }, [muted]);
  // The mute lives in the shared voice module — never let it leak into the rest of the app.
  useEffect(() => () => setSilent(false), []);
  useEffect(() => { if (ready) startedAt.current = Date.now(); }, [ready]);

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
    // Laptop Chrome ends a recognition session on its own — a few seconds of silence, a network blip — often with no
    // error, so the screen said "boliye" while the mic was off and answers were lost. A session that ends with nothing
    // heard is restarted; only a real failure (no permission, no mic, repeated errors) falls back to typing.
    let failures = 0;
    const session = () => {
      let cancelled = false;
      let answered = false;
      const stop = listen({
        onInterim: (t) => setCaption({ who: 'borrower', text: t }),
        // A session stopped on purpose (Sarthi speaking, mic muted, answer typed) must not submit a half-heard line.
        onFinal: (t) => { if (t.trim() && !cancelled) { answered = true; handleAnswer(t.trim()); } },
        onError: (err) => {
          if (err === 'no-speech' || err === 'aborted') return; // onEnd restarts it
          failures += 1;
          if (err === 'not-allowed' || err === 'service-not-allowed' || err === 'audio-capture' || failures >= 3) {
            cancelled = true; setAvatar('idle'); setTypeMode(true);
          }
        },
        onEnd: () => {
          if (cancelled || answered || doneRef.current || mutedRef.current) { if (!answered) stopListen.current = null; return; }
          setTimeout(() => { if (!cancelled && !doneRef.current) session(); }, 250);
        },
        endAfterMs: ANSWER_PAUSE_MS,
      });
      stopListen.current = () => { cancelled = true; stop(); };
    };
    session();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeMode]);

  const say = useCallback((raw, { then, speech: rawSpeech, again, topic } = {}) => {
    // Every line is written male; the chosen voice's gender is applied here, to the caption and the speech alike.
    const text = gendered(raw);
    const speech = gendered(rawSpeech);
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
    const src = prerendered() ? voiceManifest[rawSpeech || raw] : undefined;
    // The question appears with the voice, not seconds before it while TTS renders.
    let shown = false;
    const show = () => { if (!shown) { shown = true; setCaption({ who: 'ai', text }); } };
    // If the phone blocks audio the voice never starts; the question must still appear.
    setTimeout(show, CAPTION_FALLBACK_MS);
    // Scripted lines play pre-rendered audio; live text is streamed sentence by sentence.
    speakStreamed(line, {
      voice: sarthiVoice(),
      src,
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
    transcript.current.push({ role: 'assistant', content: line, at: Date.now() });
    memory.current = recordTurn(memory.current, 'assistant', line);
    say(line, { speech, then: finish });
    return true;
  };

  // Living in or belonging to a country India cannot lend into ends the PD, whatever the model says next.
  const stopForForeignResidence = (text, turn) => {
    const foreign = detectForeignResidence(text);
    if (!foreign) return false;
    memory.current = addFlags(memory.current, [{
      type: 'identity_document', field: 'foreign_residence', severity: 'high', turn,
      detail: `Said they live in or are from ${foreign.country} ("${text}"). The interview was stopped here.`,
    }]);
    const line = 'Dhanyawaad. Yeh loan sirf Bharat mein rehne wale Indian naagrikon ke liye hai. Branch officer aapse khud baat karenge.';
    const speech = 'धन्यवाद। यह लोन सिर्फ़ भारत में रहने वाले, इंडियन नागरिकों के लिए है। ब्रांच ऑफ़िसर आपसे ख़ुद बात करेंगे।';
    transcript.current.push({ role: 'assistant', content: line, at: Date.now() });
    memory.current = recordTurn(memory.current, 'assistant', line);
    say(line, { speech, then: finish });
    return true;
  };

  // A fixed line, outside the model: recorded everywhere a model line would be, so a live turn after it has the context.
  const sayFixed = (line, opts = {}) => {
    transcript.current.push({ role: 'assistant', content: line.text, at: Date.now() });
    history.current.push({ role: 'assistant', content: line.text });
    memory.current = recordTurn(memory.current, 'assistant', line.text);
    say(line.text, { speech: line.speech, ...opts });
  };

  // The customer photo the BO took, against a still from this call: at the start, then every FACE_EVERY_MS or at a new
  // section (30s apart at least). In the background — the result is acted on at the next turn (faceTurn), never mid-line.
  const watchFace = () => {
    const w = faceWatch.current;
    if (isIntake || doneRef.current || !cameraRef.current || w.inFlight || w.checks.length >= FACE_MAX) return;
    const file = loadFace(caseData.id);
    if (!file?.dataUrl) return;
    const since = Date.now() - w.lastAt;
    const section = memory.current.currentSection;
    if (w.checks.length && !w.again && since < FACE_EVERY_MS && (section === w.lastSection || since < 30000)) return;
    const frame = grabFrame();
    if (!frame) return; // camera paused for a photo: the next answer tries again
    Object.assign(w, { inFlight: true, again: false, lastAt: Date.now(), lastSection: section });
    compareFace(file.dataUrl, frame).then((r) => {
      w.inFlight = false;
      if (!r || doneRef.current) return;
      const check = { ...r, frame, at: new Date().toISOString() };
      w.checks.push(check);
      w.act = r.verdict === 'same' ? null : check;
      logEvent(`Face check: ${r.verdict.toUpperCase()}${r.people > 1 ? ` · ${r.people} people in frame` : ''}`, r.verdict === 'same' ? 'ok' : 'warn');
    });
  };

  // A check that did not match takes this turn. One DIFFERENT frame is checked again first; two in a row, Sarthi asks who
  // they are. The model's verdict only starts the question — only their answer can end the call.
  const faceTurn = (turn) => {
    const w = faceWatch.current;
    const c = w.act;
    if (!c || (presence.current && presence.current !== 'done')) return false;
    w.act = null;
    if (c.verdict === 'different') {
      if (w.checks.at(-2)?.verdict !== 'different') { w.again = true; watchFace(); return false; }
      w.prev = presence.current;
      w.retried = false;
      presence.current = 'face';
      logEvent('Face check: did not match twice — asked who is on the call', 'warn');
      sayFixed(faceLines(caseData)[w.checks.some((x) => x.verdict === 'same') ? 'changed' : 'who'], { topic: `face:${turn}` });
      return true;
    }
    if (w.reframes >= 2) return false; // still unclear after two asks: carry on, the report says so
    w.reframes += 1;
    lastAction.current = { action: 'ask_question', face: true }; // no section: an "ok" to this is never read as the name answer
    sayFixed(faceLines(caseData).reframe, {
      topic: `reframe:${w.reframes}`,
      then: () => { setTimeout(() => { w.again = true; watchFace(); }, 2500); beginListening(); },
    });
    return true;
  };

  /** Their reply to "kya aap khud X ji hain?". true = the turn is handled; false = they are the applicant, carry on. */
  const handleFaceReply = (text, turn) => {
    const w = faceWatch.current;
    const lines = presenceLines(caseData);
    const reply = confirmReply(text, caseData.name);
    if (reply === null && !w.retried) { w.retried = true; sayFixed(lines.confirmAgain); return true; }
    if (reply === 'yes') {
      presence.current = w.prev;
      memory.current = addFlags(memory.current, [{
        type: 'face_check', field: 'face_claimed', severity: 'high', turn,
        detail: `The face on the call did not match the customer photo on file, but the person said they are ${caseData.name} ("${text}") — the officer must see the applicant in person before this file moves`,
      }]);
      return false;
    }
    memory.current = addFlags(memory.current, [{
      type: 'identity_mismatch', field: 'stated_name', severity: 'high', known: caseData.name, turn,
      detail: `The face on the call did not match the customer photo on file, and the person said they are not ${caseData.name}: "${text}"`,
    }]);
    // Who they are, then ask for the applicant — the name flow's own steps from here.
    memory.current = updateMemory(memory.current, { speaker_relation: relationOf(text) });
    if (speakerIsSomeoneElse(text, caseData.name)?.away) {
      presence.current = 'done';
      sayFixed(lines.later, { then: leaveForLater });
    } else {
      presence.current = 'call';
      sayFixed(lines.call);
    }
    return true;
  };

  // The applicant is not on the call: no PD, no report — back to the case list until they can talk. Mid-call (the
  // applicant had answered, then someone else took the phone), the draft is kept so "Finish last PD" picks it up.
  const leaveForLater = () => {
    doneRef.current = true;
    if (faceWatch.current.prev !== 'done') try { window.localStorage.removeItem(draftKey); } catch { /* nothing saved */ }
    teardown();
    navigate('/sarthi', { replace: true });
  };

  // Someone else gave their name. The code asks who they are and asks for the applicant; the model never improvises it.
  const startPresence = (stated, turn) => {
    const lines = presenceLines(caseData);
    if (presence.current === 'handover') { presence.current = 'done'; sayFixed(lines.later, { then: leaveForLater }); return; }
    memory.current = addFlags(memory.current, [{
      type: 'identity_mismatch', field: 'stated_name', severity: 'high', declared: stated, known: caseData.name, turn,
      detail: `Application is in the name of ${caseData.name}, but the person on the call gave their name as "${stated}"`,
    }]);
    presence.current = 'relation';
    sayFixed(lines.relation);
  };

  // They say they are the applicant's relative or helper ("Rekha ka beta", "mummy bahar hai"). Read from the words, at
  // any turn until the applicant has confirmed their own name: "Raj, Rekha Devi ka beta" shares a word with the file and
  // passed the name check, and the call carried on with the son.
  const stopForRelative = (text, turn) => {
    if (isIntake || caseData.isNew || presence.current === 'done') return false;
    const other = speakerIsSomeoneElse(text, caseData.name);
    if (!other) return false;
    const lines = presenceLines(caseData);
    if (!memory.current.flags.some((f) => f.type === 'identity_mismatch')) {
      memory.current = addFlags(memory.current, [{
        type: 'identity_mismatch', field: 'stated_name', severity: 'high', known: caseData.name, turn,
        detail: `Application is in the name of ${caseData.name}, but the person on the call is not the applicant: "${text}"`,
      }]);
    }
    memory.current = updateMemory(memory.current, { speaker_relation: other.relation });
    if (other.away || presence.current === 'handover') {
      presence.current = 'done';
      sayFixed(lines.later, { then: leaveForLater });
    } else {
      presence.current = 'call';
      sayFixed(lines.call);
    }
    return true;
  };

  const handlePresence = (text) => {
    const lines = presenceLines(caseData);
    if (presence.current === 'relation') {
      memory.current = updateMemory(memory.current, { speaker_relation: relationOf(text) });
      presence.current = 'call';
      sayFixed(lines.call);
      return;
    }
    if (applicantComing(text)) {
      // The applicant takes the phone and is asked their own name; that answer runs through the normal loop.
      presence.current = 'handover';
      faceWatch.current.again = true; // the face of whoever takes the phone is checked on their first answer
      memory.current = { ...memory.current, collected: { ...memory.current.collected, stated_name: null, applicant_name: null } };
      sayFixed(lines.handover);
      return;
    }
    presence.current = 'done';
    sayFixed(lines.later, { then: leaveForLater });
  };

  // The name said is only part of the file's ("Mahesh"), or clashes with it ("Mahesh Sharma"): ask straight out whether
  // they are the applicant. The code asks, never the model; "no" ends the PD without a report.
  const askIfApplicant = (stated, verdict) => {
    confirm.current = { stated, verdict, handover: presence.current === 'handover', retried: false };
    presence.current = 'confirm';
    sayFixed(presenceLines(caseData).confirm(stated, verdict));
  };

  // The applicant is on the line: from here "mere pati" is them talking about family, not someone else on the phone.
  const applicantConfirmed = (stated, turn) => {
    const wasHandover = presence.current === 'handover' || confirm.current?.handover;
    presence.current = 'done';
    memory.current = updateMemory(memory.current, { stated_name: caseData.name, applicant_name: caseData.name });
    if (wasHandover) {
      memory.current = {
        ...memory.current,
        flags: memory.current.flags.map((f) => (f.type === 'identity_mismatch'
          ? { ...f, severity: 'low', followedUp: true, detail: `${f.detail}. The applicant then came to the phone and gave their own name as "${stated}" (Turn ${turn}).` }
          : f)),
      };
    }
  };

  /** Their reply to "aap X ji hi hain?". true = the turn is handled (asked again, or the PD ended). */
  const handleConfirm = (text, turn) => {
    const lines = presenceLines(caseData);
    const reply = confirmReply(text, caseData.name);
    if (reply === 'yes') { applicantConfirmed(caseData.name, turn); return false; }
    if (reply === null && !confirm.current.retried) { confirm.current.retried = true; sayFixed(lines.confirmAgain); return true; }
    memory.current = addFlags(memory.current, [{
      type: 'identity_mismatch', field: 'stated_name', severity: 'high', declared: confirm.current.stated, known: caseData.name, turn,
      detail: `Application is in the name of ${caseData.name}; the person on the call said "${confirm.current.stated}" and did not confirm being the applicant ("${text}")`,
    }]);
    presence.current = 'done';
    sayFixed(lines.notApplicant, { then: leaveForLater });
    return true;
  };

  // Once per PD, at a turn picked from its seed (4-7), once the applicant is confirmed and the camera is on: one small random
  // action, a frame before and ~2s after, compared in the background (face.js). A recorded or replayed video cannot follow it.
  const livenessDue = () => !live.current && !isIntake && cameraRef.current && !demoRef.current
    && (presence.current === 'done' || caseData.isNew)
    && memory.current.turnCount >= 4 + Math.floor((memory.current.seed ?? 0) * 4);

  const askLiveness = () => {
    const task = LIVENESS[Math.floor(Math.random() * LIVENESS.length)];
    const before = grabFrame();
    live.current = { task, at: new Date().toISOString(), result: null, frames: null };
    lastAction.current = { action: 'ask_question', section: memory.current.currentSection, liveness: true };
    sayFixed({ text: task.text, speech: task.speech }, {
      topic: 'liveness',
      then: () => {
        setTimeout(() => {
          const after = grabFrame();
          if (!before || !after) { logEvent('Liveness: no camera frame to compare', 'warn'); return; }
          live.current.frames = [before, after];
          checkLiveness(before, after, task).then((r) => {
            live.current.result = r;
            logEvent(`Liveness: ${r ? r.verdict.toUpperCase() : 'not compared, vision unreachable'}`, r?.verdict === 'yes' ? 'ok' : 'warn');
          });
        }, 2000);
        beginListening();
      },
    });
    logEvent('Liveness: random action asked on camera'); // never which one — the log is read on the report
  };

  /* ---------------------------------------------------------------- one borrower answer */
  const handleAnswer = useCallback(async (text) => {
    if (doneRef.current) return;
    stopListen.current?.();
    transcript.current.push({ role: 'user', content: text, at: Date.now() });
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
      let confirmed = false;
      if (presence.current === 'confirm') { if (handleConfirm(text, borrowerTurn)) return; confirmed = true; }
      if (presence.current === 'relation' || presence.current === 'call') { handlePresence(text); return; }
      if (stopForRelative(text, borrowerTurn)) return;
      // Scripted mode asks the name too, so a wrong person is stopped with or without the model.
      if (step?.collect === 'stated_name' && !isIntake && presence.current !== 'done') {
        const stated = nameFromWords(text) ?? text;
        memory.current = updateMemory(memory.current, { stated_name: stated });
        const verdict = nameVerdict(stated, caseData.name);
        if (verdict === 'different') { startPresence(stated, borrowerTurn); return; }
        if (verdict === 'partial' || verdict === 'conflict') { askIfApplicant(stated, verdict); return; }
        if (verdict === 'full') applicantConfirmed(stated, borrowerTurn);
      }
      // A "haan" to "aap Mahesh Agarwal ji hi hain?" answers the name step with the file's name, not with "haan".
      if (step?.collect) memory.current = updateMemory(memory.current, { [step.collect]: confirmed && step.collect === 'stated_name' ? caseData.name : text, _verbatim: text });
      setCovered(completeness(memory.current));

      // Intake: this answer IS the file. Store it, and check a document the moment it arrives.
      if (isIntake && step?.collect) {
        intake.current[step.collect] = text;
        if (step.collect === 'aadhaar') intake.current.aadhaarCheck = validateAadhaar(text);
        if (step.collect === 'pan') intake.current.panCheck = validatePan(text, intake.current.name ?? '');
        setCollected({ ...intake.current });
      }
      if (['aadhaar', 'pan'].includes(step?.collect) && stopForForeignId(text, borrowerTurn)) return;
      if (stopForForeignResidence(text, borrowerTurn)) return;

      stepRef.current += 1;
      const next = scriptRef.current[stepRef.current];
      if (!next) { finish(); return; }
      const line = next.text.replace(COMPLETE_TAG, '').trim();
      transcript.current.push({ role: 'assistant', content: line, at: Date.now() });
      memory.current = recordTurn(memory.current, 'assistant', line);
      if (next.typed) setTypeMode(true);
      const after = next.photo
        ? { then: () => setPhotoAsk(next.photo) }
        : next.end ? { then: finish } : {};
      setTimeout(() => say(line, { speech: next.speech, ...after }), 500);
      return;
    }

    memory.current = recordTurn(memory.current, 'user', text);
    watchFace();
    // What the reply MEANS is read by the model (any wording); the code decides what to do. Fact extraction starts at the
    // same moment: awaited one after the other they added up to ~5s before the question call even began. On a turn that
    // turns out to be a stop or a handover the extraction is simply not used.
    // Where a turn's wait goes, logged when the voice starts: ms after their answer was submitted.
    const t0 = performance.now();
    const lap = {};
    const mark = (k) => { lap[k] ??= Math.round(performance.now() - t0); };
    const reading = readIntent({ question: lastLine.current.text, answer: text, name: caseData.name }).finally(() => mark('intent'));
    const extracting = extractFacts(text, {
      section: memory.current.currentSection,
      recent: transcript.current.filter((t) => t.role === 'assistant').slice(-1).map((t) => t.content),
    }).then((f) => ({ f }), (e) => ({ e })).finally(() => mark('extract'));
    if (stopForForeignResidence(text, borrowerTurn)) return;
    const { intent, gist } = await reading;
    if (doneRef.current) return;
    const exitLine = presenceLines(caseData).unwilling;
    // They do not want the call. Before we know it is the applicant: leave, no report. After: close kindly and report.
    if (intent === 'stop') {
      endReason.current = 'They asked to stop the call';
      if (presence.current === 'done' || isIntake || caseData.isNew) sayFixed(exitLine, { then: finish });
      else { presence.current = 'done'; sayFixed(exitLine, { then: leaveForLater }); }
      return;
    }
    // Someone else on the phone, however they put it: the code's presence flow takes over.
    if (intent === 'someone_else' && !isIntake && !caseData.isNew && !['done', 'relation', 'call', 'face'].includes(presence.current)) {
      if (!stopForRelative(text, borrowerTurn)) startPresence(nameFromWords(text) ?? text, borrowerTurn);
      return;
    }
    // A question, a push-back or a refusal: the next turn first responds to it (see replyPrefix). A refusal is asked
    // softer once; the second time the field is left for the officer and noted.
    const field = lastAction.current?.missingFields?.[0] ?? lastAction.current?.section ?? 'turn';
    // Only on turns the model speaks: the fixed identity lines ("aap X ji hi hain?") are answered by the presence flow.
    const fixedStep = ['confirm', 'relation', 'call', 'handover', 'face'].includes(presence.current);
    if (!fixedStep && (intent === 'question' || intent === 'upset')) {
      const k = `${intent}:${field}`;
      replies.current[k] = (replies.current[k] ?? 0) + 1;
      if (replies.current[k] <= 2) replyTo.current = { intent, text, gist };
    }
    if (intent === 'refused' && !fixedStep) {
      const n = (refusals.current[field] ?? 0) + 1;
      refusals.current[field] = n;
      replyTo.current = { intent, text, gist, n };
      if (n > 1 && lastAction.current?.missingFields?.[0]) {
        memory.current = {
          ...memory.current,
          askCount: { ...memory.current.askCount, [field]: MAX_ASKS },
          flags: [...memory.current.flags, { type: 'declined', field, severity: 'low', turn: borrowerTurn, followedUp: true, detail: `Declined to answer (${field.replace(/_/g, ' ')}): "${text.slice(0, 60)}"` }],
        };
      }
    }
    // A yes carries on as the answer to the name question (stated_name is now the file's name, so the controller moves on).
    if (presence.current === 'confirm' && handleConfirm(text, borrowerTurn)) return;
    if (presence.current === 'relation' || presence.current === 'call') { handlePresence(text); return; }
    if (presence.current === 'face' && handleFaceReply(text, borrowerTurn)) return;
    if (stopForRelative(text, borrowerTurn)) return;

    try {
      // Extract first, then pick the next topic, so the controller decides on THIS turn's facts.
      // Snapshot before merging: checkContradictions and coaching detection compare against prior state.
      const before = memory.current;
      // The question this answer replies to — lastAction moves on to the next one before the fence is read.
      const answered = lastAction.current;
      // Contradiction, hisaab and (walk-in) consistency checks on the facts so far; adds and returns only new flags.
      // Run before the next question is picked, and again after the facts fence, so a clash is asked on the next turn.
      const runChecks = (prior, got, subject, ans) => {
        const math = checkTradeMath(memory.current);
        memory.current = { ...memory.current, tradeMath: math.results };
        const found = [
          ...math.flags,
          ...checkContradictions(prior, got, subject, { recheck: ans?.recheckOf }),
          // A walk-in has nothing to check against, so their own numbers have to do the work.
          ...(getInterviewConfig(subject).isNewApplicant ? checkInternalConsistency(memory.current, subject) : []),
        ];
        // Only flags we have not already raised — the same contradiction resurfaces every turn.
        const fresh = found.filter((f) => !memory.current.flags.some((p) => p.detail === f.detail));
        memory.current = addFlags(memory.current, fresh);
        return fresh;
      };
      // An insider trade question is answered verbatim — the words ARE the evidence.
      if (lastAction.current?.tradeProbeDef) {
        memory.current = recordTradeAnswer(memory.current, lastAction.current.tradeProbeDef, text, borrowerTurn);
      }
      // A live challenge is kept verbatim; a photo they could not send drops that challenge's follow-up question.
      const ch = lastAction.current?.challenge;
      if (ch && intent !== 'question' && intent !== 'upset') {
        const asked = transcript.current.filter((t) => t.role === 'assistant').at(-1)?.content ?? '';
        const noPhoto = ch.photo && !/bheji\]$/.test(text);
        // The follow-up is checked against what the challenge's own photo showed.
        const shown = photos.current.findLast((p) => p.kind === lastChallengePhoto.current);
        const subject = caseRef.current ?? caseData;
        const found = noPhoto ? [] : checkChallenge(ch, text, {
          photoNames: shown?.names ?? [], collected: memory.current.collected, trade: tradeOf(memory.current.collected, subject), turn: borrowerTurn,
        });
        if (ch.photo) lastChallengePhoto.current = ch.photo;
        memory.current = {
          ...addFlags(memory.current, found),
          challengeAnswers: [...(memory.current.challengeAnswers ?? []), { id: ch.id, why: ch.why, photo: ch.photo ?? null, asked, answer: text, sent: ch.photo ? !noPhoto : null, turn: borrowerTurn }],
          challengeQueue: noPhoto ? (memory.current.challengeQueue ?? []).filter((s) => s.id !== ch.id) : memory.current.challengeQueue,
        };
      }
      // "Matlab?" is not an answer: the same check is asked again after the reply.
      if (lastAction.current?.professionCheck && intent !== 'question' && intent !== 'upset') {
        const asked = transcript.current.filter((t) => t.role === 'assistant').at(-1)?.content ?? '';
        memory.current = recordProfessionAnswer(memory.current, asked, text, borrowerTurn);
      }
      if (lastAction.current?.crossOf) {
        const asked = transcript.current.filter((t) => t.role === 'assistant').at(-1)?.content ?? '';
        memory.current = recordCrossAnswer(memory.current, lastAction.current.crossOf, asked, text, borrowerTurn);
      }
      if (lastAction.current?.hot) memory.current = recordHotAnswer(memory.current, lastAction.current.hot, text, borrowerTurn);
      // A quick-PD question with no schema field is kept verbatim; "sau pe das" becomes the margin the recheck uses.
      const quick = lastAction.current?.quickStep;
      if (quick) {
        memory.current = recordHotAnswer(memory.current, { id: quick.key, q: quick.ask, why: quick.why ?? quick.label }, text, borrowerTurn);
        if (quick.key === 'margin_per_100') {
          const pct = readNumbers(text).map((n) => n.value).find((v) => v > 0 && v < 100);
          if (pct) memory.current = { ...memory.current, statedMarginPct: pct };
        }
      }

      // Already in flight since the answer came in (see `extracting`).
      const extracted = await extracting;
      // Not fatal: the question call's facts fence is the backstop. Never abandon the turn.
      if (extracted.e) console.warn(`[sarthi] fact extraction failed (${extracted.e?.message}) — relying on the facts fence`);
      let facts = extracted.f ?? {};
      // A filled figure said differently in this answer is dropped by acceptedFacts — but asked about first.
      const drift = driftRechecks(memory.current, facts, text);
      facts = acceptedFacts(memory.current, facts, answered);
      if (Object.keys(facts).length) memory.current = updateMemory(memory.current, { ...facts, _verbatim: text });

      // Checked on their own words, not the extraction — the model filed a CNIC under pan_number.
      const docDue = memory.current.currentSection === 'documents' || facts.aadhaar_number || facts.pan_number;
      if (docDue && stopForForeignId(text, borrowerTurn)) return;

      // The name answer is checked here, before any model call, so a wrong person never gets a business question.
      if (!isIntake && presence.current !== 'done'
        && (answered?.section === 'greeting' || answered?.missingFields?.[0] === 'stated_name' || presence.current === 'handover')) {
        let stated = memory.current.collected.stated_name;
        if (!stated) {
          // A bare "Mahesh" has no "mera naam" to find it by; a short answer to the name question IS the name.
          stated = nameFromWords(text) ?? (text.trim().split(/\s+/).length <= 3 ? text.trim() : null);
          if (stated) memory.current = updateMemory(memory.current, { stated_name: stated });
        }
        // Speech can come back in Devanagari ("राज"), which nameVerdict cannot read — compare with the Hindi name on file.
        const hindi = stated && /[ऀ-ॿ]/.test(stated) && caseData.hi?.firstName;
        const verdict = nameVerdict(stated, caseData.name)
          ?? (hindi ? (caseData.hi.name && String(stated).includes(caseData.hi.name) ? 'full' : String(stated).includes(caseData.hi.firstName) ? 'partial' : 'different') : null);
        if (stated && verdict === 'different') { startPresence(stated, borrowerTurn); return; }
        // "Mahesh" or "Mahesh Sharma" for Mahesh Agarwal: ask whether they are the applicant before any PD question.
        if (stated && (verdict === 'partial' || verdict === 'conflict')) { askIfApplicant(stated, verdict); return; }
        if (stated && (verdict === 'full' || presence.current === 'handover')) applicantConfirmed(stated, borrowerTurn);
      }

      if (isIntake) rebuildWalkIn();
      const subject = caseRef.current ?? caseData;
      // The hisaab is done now, on this answer, so a figure that does not add up is asked about in the very next turn.
      memory.current = queueRechecks(memory.current, subject, facts, { drift, flags: runChecks(before, facts, subject, answered) });
      // A face that did not match, then the liveness action, take this turn; whatever is queued is asked on the next.
      if (faceTurn(borrowerTurn)) { setCovered(completeness(memory.current)); return; }
      if (livenessDue()) { setCovered(completeness(memory.current)); askLiveness(); return; }

      const action = getNextAction(memory.current, subject);
      if (action.memory) memory.current = action.memory;
      lastAction.current = action;
      if (action.handover) { setOperatorTurn(true); logEvent('Assisted PD: phone handed to the person who runs the business'); }

      if (action.action === 'end_interview') { finish(); return; }

      // Document numbers are typed — speech recognition mangles them.
      setTypeMode(typedFieldsFor(memory.current, SECTION_BY_ID[action.section]).length > 0 || !canListen);

      // Speak as soon as the speech fence closes. The follow-up (photo / end / listen) runs once,
      // after whichever of audio or stream finishes last.
      let spokenYet = false;
      let voiceOn = false;
      let pending = '';
      const showCaption = (text) => { pending = gendered(text); if (voiceOn && pending) setCaption({ who: 'ai', text: pending }); };
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
        directive: takeReplyPrefix() + directiveText(action),
        messages: history.current,
        turn: borrowerTurn,
        onChunk: (full) => {
          mark('firstToken');
          const caption = peekDisplay(full);
          if (caption) showCaption(caption);
          if (spokenYet) return;
          const early = peekSpeech(full);
          if (!early) return;
          spokenYet = true;
          mark('speechText');
          setTimeout(() => { if (!voiceOn) { voiceOn = true; showCaption(pending); } }, CAPTION_FALLBACK_MS);
          lastLine.current = { text: caption, speech: early };
          countTopic(topicKey(action));
          speakStreamed(gendered(early), {
            voice: sarthiVoice(),
            src: prerendered() ? voiceManifest[early] : undefined,
            onStart: () => {
              voiceOn = true; setAvatar('speaking'); showCaption(pending);
              mark('voice');
              console.info(`[sarthi] turn ${borrowerTurn} latency (ms after answer, +${ANSWER_PAUSE_MS} silence wait):`, lap);
            },
            onEnd: () => { voiceOn = true; showCaption(pending); audioDone = true; advance(); },
          });
        },
      });
      const { display, speech, claims: found, facts: fenced, complete } = parseClaims(raw, borrowerTurn);
      if (answered?.section !== 'operator') claims.current.push(...found); // the operator's figures are compared in assisted.js, not as the applicant's claims

      // Gap-fill from the question call's facts fence, then run the code-only checks.
      const gapFill = acceptedFacts(memory.current, Object.fromEntries(Object.entries(fenced).filter(([k]) => !(k in facts))), answered);
      memory.current = updateMemory(memory.current, { ...gapFill, _verbatim: text });
      facts = { ...gapFill, ...facts };
      // Recorded after the gap-fill, so a corrected figure that only reached the facts fence still counts.
      if (answered?.recheck) {
        const asked = transcript.current.filter((t) => t.role === 'assistant').at(-1)?.content ?? '';
        memory.current = recordRecheckAnswer(memory.current, answered.recheck, asked, text, borrowerTurn);
      }
      // Anything the facts fence alone revealed is asked on the next turn.
      memory.current = queueRechecks(memory.current, subject, gapFill, { flags: runChecks(before, { ...gapFill, ...facts }, subject, answered) });
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

      if (action.hyperLocal) memory.current = { ...memory.current, askedHyperLocal: true };
      if (action.riskAlert) memory.current = { ...memory.current, askedRisk: true };

      memory.current = recordTurn(memory.current, 'assistant', display);
      setCovered(completeness(memory.current));

      history.current.push({ role: 'assistant', content: raw });
      transcript.current.push({ role: 'assistant', content: display, at: Date.now() });

      // Only the controller ends a PD. In live runs the model said goodbye with 20 fields still open and the documents unasked.
      // Or the borrower is leaving ("ok bye", "band karo") and the model has closed — holding them there helps nobody.
      const reallyDone = complete && (getNextAction(memory.current, subject).action === 'end_interview' || LEAVING.test(text));
      if (complete && !reallyDone) console.warn('[sarthi] model tried to end the interview early — ignored');
      // Both photos are the controller's call (from current_place); a photo fence the model adds on its own is ignored.
      const wantPhoto = action.photo ?? null;
      after = wantPhoto ? () => setPhotoAsk(wantPhoto) : reallyDone ? finish : null;

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
      transcript.current.push({ role: 'assistant', content: line, at: Date.now() });
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

  const submitPhoto = useCallback(async ({ dataUrl: shot, file, facing, quality, attempts, pan }, { kind, volunteered }) => {
    closeCapture();
    setPhotoBusy(true);
    try {
      const provenance = file ? await checkUpload(file, { startedAt: startedAt.current }) : liveProvenance(facing, { quality, attempts, pan });
      if (!volunteered && lastAction.current?.challenge?.pan && !pan) {
        provenance.flags.push({ severity: 'low', detail: 'Could not do the live turn to the shop door — the camera did not open, so this was sent as a file' });
      }
      const dataUrl = shot ?? await downscale(file);
      setShownPhoto(dataUrl);
      setPhotoAsk(null);
      const subject = caseRef.current ?? caseData;
      const [record, fix] = await Promise.all([analysePhoto({ dataUrl, kind, caseData: subject, provenance }), getFix()]);
      record.location = fix; // every photo: crossPd.js compares it with earlier applicants' photos
      if (pan) { const { dataUrl: panDataUrl, ...turn } = pan; Object.assign(record, { pan: turn, panDataUrl }); }
      if (kind === 'shop' || kind === 'home') {
        record.placeCheck = checkPlace(fix, subject?.locations?.[kind]);
        // Asked on the call straight away, like a figure that does not add up; they may be at a second branch.
        if (record.placeCheck.status === 'far') {
          const place = kind === 'shop' ? 'dukaan' : 'ghar';
          memory.current = { ...memory.current, recheckQueue: [...memory.current.recheckQueue, {
            field: `photo_location_${kind}`,
            detail: `Photo of ${record.label} was taken ${inDistance(record.placeCheck.distance)} from the ${kind} location on file`,
            say: `Yeh photo jis jagah se aayi hai, woh file mein likhe ${place} ke pate se lagbhag ${inDistance(record.placeCheck.distance).replace('km', 'kilometre').replace(' m', ' meter')} door dikh rahi hai. Kya yeh aapki hi ${place} hai, ya aap abhi kahin aur hain?`,
            turn: memory.current.turnCount,
          }] };
        }
      }
      // Someone else's name on the board, QR, bill book or a shop paper: asked once, straight away (crossPd.js).
      const [named] = fileNameCheck([record], subject);
      if (named && (named.verdict === 'none' || named.gstin === 'mismatch') && !nameAsked.current) {
        nameAsked.current = true;
        memory.current = { ...memory.current, recheckQueue: [...memory.current.recheckQueue, {
          field: `name_${kind}`, detail: `${record.label} shows "${named.read[0] ?? named.gstins[0]}", not the name on file`, say: nameRecheck(named), turn: memory.current.turnCount,
        }] };
      }
      // Far more stock stated than the shop photo shows: asked kindly, the rest may be in a godown.
      const stated = toNumber(memory.current.collected.stock_value);
      const stock = kind === 'shop' ? stockCheck(record.stock, stated) : null;
      if (stock?.status === 'more') {
        memory.current = { ...memory.current, recheckQueue: [...memory.current.recheckQueue, {
          field: 'stock_photo', detail: `Stated stock ${formatINR(stated)} vs roughly ${formatINR(stock.high)} in the shop photo`,
          say: `Aapne lagbhag ${formatINR(stated)} ka maal bataya tha, par photo mein dukaan mein utna maal nahi dikh raha. Kya baaki maal kahin aur — godown ya ghar pe — rakha hai?`,
          turn: memory.current.turnCount,
        }] };
      }
      photos.current.push(record);
      save(`bo_sarthi_photos_${pdId}`, photos.current); // now, not at finish: a dropped call keeps its photos
      logEvent(`Photo: ${record.label}${fix.error ? ' (location not shared)' : ` at ${fix.lat}, ${fix.lng}`}${record.placeCheck?.status === 'far' ? ' — far from the pin on file' : ''}`, record.placeCheck?.status === 'far' ? 'warn' : 'info');
      setPhotoBusy(false);
      setTimeout(() => setShownPhoto(null), 2600); // long enough to see it landed
      // Only an answer to a question moves the interview on. A volunteered photo is filed and
      // Sarthi carries on waiting for the answer it actually asked for.
      if (volunteered) { transcript.current.push({ role: 'user', content: `[${PHOTO_ASKS[kind].hint} bheji]`, at: Date.now() }); beginListening(); }
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

    // The report's transcript reads as she/he said it: fixed lines are stored as written (male).
    const turns = transcript.current.map((t) => (t.role === 'assistant' ? { ...t, content: gendered(t.content) } : t));
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
    setProgress('Comparing photos with earlier PDs…');
    const links = await checkAgainstEarlierPds(photos.current, subject.id);
    links.forEach((l) => {
      const p = photos.current.find((x) => x.kind === l.kind && !x.skipped);
      if (p) p.links = [...(p.links ?? []), l];
    });
    const linkFlags = crossPdFlags(links);
    const hasFace = !!loadFace(subject.id)?.dataUrl;
    const faceResult = faceSummary(faceWatch.current.checks);
    const faceChecks = hasFace ? faceFlags(faceWatch.current.checks, cameraRef.current) : [];
    // Living conditions: the facts from the home photos, and the model's few sentences on them (no scores).
    const homeFacts = livingFacts(photos.current, subject, memory.current.collected);
    if (homeFacts) setProgress('Reading the home photos…');
    const living = homeFacts ? { facts: factLines(homeFacts), vehicles: homeFacts.vehicles, items: homeFacts.items, house: homeFacts.house, analysis: demoRef.current ? null : await analyseLiving(homeFacts) } : null;
    // Names on their photos against their own file; the stock they stated against the shop photo.
    const nameChecks = fileNameCheck(photos.current, subject);
    const shopShot = photos.current.find((p) => p.kind === 'shop' && p.stock);
    const stated = toNumber(memory.current.collected.stock_value);
    const stock = shopShot ? stockCheck(shopShot.stock, stated) : null;
    if (shopShot) shopShot.stockCheck = stock;
    const stockFlags = !stock || stock.status === 'fits' ? [] : [{
      type: 'stock_check', field: 'stock_value', severity: stock.status === 'more' ? 'medium' : 'low',
      detail: `They said about ${formatINR(stock.declared)} of stock; the shop photo shows roughly ${formatINR(stock.low ?? 0)}–${formatINR(stock.high)} in view`
        + ` (${stock.fullness ?? 'unclear'} shelves) — an AI estimate from one photo; ${stock.status === 'more' ? 'see the stock (and any godown) on the visit' : 'they may have understated it'}`,
    }];
    // Where the call was taken, start and end, against the pins on file and where they said they were.
    callGeo.current.end = await getFix(4000);
    const place = callPlace(callGeo.current.start, subject.locations, memory.current.collected.current_place);
    const callFlags = place.away ? [{
      type: 'call_location', field: 'call_location', severity: 'medium',
      detail: `Said they were at their ${place.claimed}, but the call was taken ${inDistance(place.away.distance)} from the ${place.claimed} location on file`,
    }] : [];
    const liveFlags = [livenessFlag(live.current, cameraRef.current)].filter(Boolean);
    const placeFlags = photos.current.flatMap((p) => {
      const s = p.placeCheck?.status;
      if (s === 'far') return [{ type: 'photo_location', field: `photo_location_${p.kind}`, severity: 'high', detail: `Photo of ${p.label} was taken ${inDistance(p.placeCheck.distance)} from the ${p.kind} location on file — may not be their place` }];
      if (s === 'not_on_file') return [{ type: 'photo_location', field: `photo_location_${p.kind}`, severity: 'low', detail: `No ${p.kind} location on file — check the pin where the photo of ${p.label} was taken (${p.location.lat}, ${p.location.lng})` }];
      if (s === 'no_fix') return [{ type: 'photo_location', field: `photo_location_${p.kind}`, severity: 'medium', detail: `Location was not shared when ${p.label} was photographed (${p.location?.error ?? 'unavailable'}) — place not verified` }];
      return [];
    });

    // Where verifier and controller flag the same field, keep the verifier's (it has a turn).
    const settled = new Set(claimFlags.map((f) => f.claimType).filter(Boolean));
    const math = checkTradeMath(memory.current);
    const depth = understanding(memory.current);
    const flags = [...claimFlags, ...memory.current.flags, ...consistency, ...math.flags, ...photoFlags, ...placeFlags, ...linkFlags, ...faceChecks, ...nameFlags(nameChecks, subject), ...stockFlags, ...callFlags, ...liveFlags, ...assistedFlags(memory.current.collected, depth, subject.name)]
      .filter((f) => !(f.type === 'contradiction' && settled.has(CLAIM_FIELD[f.field])))
      .filter((f, i, all) => all.findIndex((o) => o.detail === f.detail) === i);

    const assessed = assessIncome(memory.current, subject);
    const eligibility = computeEligibility(subject, assessed);
    const observations = getObservations();
    const collectedFacts = memory.current.collected;

    // Every PD is kept: its own id, and its own keys — a repeat PD never overwrites an earlier one.
    const endedAt = new Date().toISOString();
    logEvent(`Call ended${callGeo.current.end?.lat != null ? ` at ${callGeo.current.end.lat}, ${callGeo.current.end.lng}` : ''}`);
    const pdNo = past.length + 1;
    const complete = demoRef.current ? stepRef.current >= scriptRef.current.length - 1 : getNextAction(memory.current, subject).action === 'end_interview';
    save(`bo_sarthi_transcript_${pdId}`, turns);
    save(`bo_sarthi_claims_${pdId}`, captured);
    save(`bo_sarthi_evidence_${pdId}`, { evidence, flags, eligibility, observations, collected: collectedFacts, understanding: depth, tradeMath: math.results, rechecks: memory.current.rechecks, hotAnswers: memory.current.hotAnswers });
    // Images are kept in their own key: base64 is heavy and must not risk the report's own write.
    save(`bo_sarthi_photos_${pdId}`, photos.current);
    if (faceResult?.frame) save(callFrameKey(pdId), faceResult.frame);
    if (live.current?.frames) save(`bo_sarthi_live_${pdId}`, live.current.frames);

    let report;
    let validation = null;
    let usedDemo = demoRef.current;

    if (!demoRef.current) {
      try {
        setProgress('Writing the PD report…');
        const raw = await writeReport({ caseData: subject, transcript: turns, claims: captured, evidence, flags, collected: collectedFacts, verification: memory.current.verification, understanding: depth, tradeMath: math.results, crossAnswers: memory.current.crossAnswers, rechecks: memory.current.rechecks, hotAnswers: memory.current.hotAnswers, professionAnswers: memory.current.professionAnswers, challengeAnswers: memory.current.challengeAnswers, challengeWhy: memory.current.challengeWhy, living, face: hasFace ? faceResult ?? { verdict: null } : null, eligibility, observations, photos: photos.current, identity: subject.identity, mode: `Handover${memory.current.boPresent ? ' (officer sat with the applicant)' : ''}${isAssisted(memory.current) ? ' · ASSISTED PD — the applicant answered first, then handed the phone to the person who runs the business; the operator_* and op_* facts are that person’s answers' : ''} · PD ${pdNo}${past.length ? ` (${MODES[mode].label}, after ${past.length} earlier)` : ''}${complete ? '' : ' · ENDED EARLY — not every topic was covered'}` });
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
      report = buildFallbackReport({ caseData: subject, collected: collectedFacts, transcript: turns, evidence, flags, eligibility, observations, photos: photos.current, identity: subject.identity, cameraOn: cameraRef.current, understanding: depth, tradeMath: math.results, rechecks: memory.current.rechecks, hotAnswers: memory.current.hotAnswers, professionAnswers: memory.current.professionAnswers, challengeAnswers: memory.current.challengeAnswers, challengeWhy: memory.current.challengeWhy, living });
      validation = validateReport(report, turns, captured, briefForCitation(subject), eligibility, { flags, collected: collectedFacts });
    }

    const entry = {
      id: pdId,
      pdNo,
      mode,
      from: past.length ? basePd?.id ?? null : null, // the PD this one follows up, for the history trail
      by: { id: OFFICER.id, name: OFFICER.name, role: OFFICER.designation },
      startedAt: new Date(startedAt.current || Date.now()).toISOString(),
      endedAt,
      endedBecause: complete ? null : endReason.current ?? 'Ended before every topic was covered',
      complete,
      coverage: completeness(memory.current).pct,
      collected: knownFacts(memory.current),
      state: pdState(memory.current),
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
      // metadata only — the images themselves live in bo_sarthi_photos_<pd id>
      photos: photoMeta(photos.current),
      identity: subject.identity ?? null,
      living,
      callGeo: { ...callGeo.current, place },
      liveness: live.current ? { check: live.current.task.check, at: live.current.at, verdict: live.current.result?.verdict ?? null, reason: live.current.result?.reason ?? null } : null,
      nameChecks,
      callLog: callLog.current,
      face: hasFace ? { checked: !!faceResult, verdict: faceResult?.verdict ?? null, reason: faceResult?.reason ?? null, at: faceResult?.at ?? null } : null,
      understanding: depth.total ? depth : null,
      tradeMath: math.results.length ? math.results : null,
      validation,
      turns: turns.length,
    };
    setPending((prev) => [entry, ...prev]); // saved as a PD only once a BO / CO confirms it on the report screen
    try { window.localStorage.removeItem(draftKey); } catch { /* nothing saved */ }
    navigate(`/sarthi/report/${subject.id}?pd=${pdId}`, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseData, navigate, setPending, teardown]);

  /* ---------------------------------------------------------------- start */
  useEffect(() => {
    if (!startCase || !ready) return undefined;
    resetObservations();
    scriptRef.current = isIntake ? buildIntakeScript() : buildScript(startCase);
    // The file's questions, prepared on the brief screen; if the officer started before they came back, the file's own.
    const fileHot = isIntake || startCase.quickPd || mode === 'cross' ? [] : (loadHot(startCase.id)?.questions ?? ruleHotQuestions(startCase));
    const prior = priorFacts(past);
    memory.current = createEmptyMemory(startCase, { hot: fileHot, prior });
    if (basePd && mode === 'resume') memory.current = seedResume(memory.current, basePd);
    if (assistedStart.current) memory.current = { ...memory.current, assisted: true };
    if (boPresent.current) {
      memory.current = addFlags({ ...memory.current, boPresent: true }, [{ type: 'officer_present', field: 'officer_present', severity: 'low', turn: 0,
        detail: 'The officer sat with the applicant during the call (declared at the start) — answers may have been prompted; more surprise checks were set' }]);
    }
    if (basePd && mode === 'strict') {
      memory.current = { ...memory.current, strict: true, hot: [...flagQuestions(basePd.flags, basePd.pdNo), ...fileHot] };
    }
    if (mode === 'cross') {
      const steps = crossSteps(prior, startCase, (basePd?.flags ?? []).map((f) => f.field));
      if (steps.length) memory.current = { ...memory.current, quickPd: steps };
    }
    caseRef.current = startCase;

    // The greeting is a fixed line, so it is said at once instead of waiting ~3s on a model call for the same words.
    // Turn two is the first live call and degrades per turn like any other (a permanent status sets demoRef there).
    // Deferred one tick so StrictMode's throwaway mount is cancelled before it speaks.
    const t = setTimeout(() => {
      setPhase('live');
      history.current = [{ role: 'user', content: '[System: the borrower has joined the call. Greet them and begin the interview.]' }];
      const opening = getNextAction(memory.current, startCase);
      if (opening.memory) memory.current = opening.memory;
      // The name answer is checked only when the last question was the greeting — unset, "Ramesh" for Mahesh Agarwal
      // skipped nameVerdict entirely and the model improvised its own "aapka naam sirf Ramesh hai?".
      lastAction.current = opening;
      const first = scriptRef.current[0];
      demoRef.current = false;
      liveRef.current = true;
      stepRef.current = 1; // scripted fallback continues past the greeting
      // Wakes a cold serverless function while the greeting plays, so the first live turn does not pay its start-up.
      fetch(CHAT_URL, { method: 'OPTIONS' }).catch(() => {});
      if (cameraRef.current) startFrameCapture(VISION_URL, () => {});
      getFix().then((f) => {
        callGeo.current.start = f;
        logEvent(f.error ? `Call started, location not shared (${f.error})` : `Call started at ${f.lat}, ${f.lng} (±${f.accuracy} m)`, f.error ? 'warn' : 'info');
      });
      memory.current = recordTurn(memory.current, 'assistant', first.text);
      history.current.push({ role: 'assistant', content: `\`\`\`speech\n${first.speech}\n\`\`\`\n${first.text}` });
      transcript.current.push({ role: 'assistant', content: first.text, at: Date.now() });
      say(first.text, { speech: first.speech, topic: topicKey(opening) });
      setTimeout(watchFace, 1500); // the first face check runs while the greeting plays; its result is acted on after their reply
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startCase, ready]);

  // Saved after every answer, so a call that drops (app closed, phone or network gone) can be finished later.
  useEffect(() => {
    if (phase !== 'live' || isIntake || doneRef.current || !transcript.current.length) return;
    save(`bo_sarthi_transcript_${pdId}`, transcript.current);
    save(draftKey, {
      id: pdId,
      pdNo: past.length + 1,
      mode,
      from: past.length ? basePd?.id ?? null : null,
      by: { id: OFFICER.id, name: OFFICER.name, role: OFFICER.designation },
      startedAt: new Date(startedAt.current || Date.now()).toISOString(),
      savedAt: new Date().toISOString(),
      caseId: caseData.id,
      name: caseData.name,
      coverage: completeness(memory.current).pct,
      collected: knownFacts(memory.current),
      state: pdState(memory.current),
      flags: memory.current.flags,
      photos: photoMeta(photos.current),
      cameraOn: cameraRef.current,
      callLog: callLog.current,
      turns: transcript.current.length,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [covered, asked, phase]);

  if (!caseData) {
    return (
      <div className={styles.generating}>
        <h2 className={styles.genTitle}>Case not found</h2>
        <button className={styles.sheetGhost} onClick={() => navigate('/sarthi', { replace: true })}>Back to cases</button>
      </div>
    );
  }

  if (!ready) return <CallSetup title={`PD interview · ${caseData.name}`} greeting={(isIntake ? buildIntakeScript() : buildScript(startCase))[0]?.speech} askPresence={!isIntake} askAssisted={!isIntake && !isSalaried(caseData)} onStart={(o) => { boPresent.current = !!o?.boPresent; assistedStart.current = !!o?.assisted; setReady(true); }} onBack={() => navigate(-1)} />;

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
          <span className={styles.step}>{operatorTurn ? 'Dukaan chalane wale se · ' : ''}{asked > 0 ? `Sawaal ${asked}` : 'Shuru ho raha hai'}</span>
          <span className={styles.progress} aria-hidden="true">
            <span className={styles.progressFill} style={{ width: `${Math.min(96, caseData.quickPd ? (asked / (caseData.quickPd.length + 1)) * 100 : covered?.filled ? covered.pct : (asked / total) * 100)}%` }} />
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
                <span>{photoBusy ? aboutSarthi('Sarthi dekh rahe hain…') : 'Mil gayi, dhanyawaad'}</span>
              </motion.div>
            )}
          </AnimatePresence>

          <div className={`${styles.turn} ${avatar === 'listening' ? styles.turnMine : ''}`}>
            {avatar === 'listening' && <><span className={styles.wave}><i /><i /><i /><i /></span> Aapki baari — boliye</>}
            {avatar === 'speaking' && aboutSarthi('Sarthi bol rahe hain')}
            {avatar === 'thinking' && aboutSarthi('Sarthi soch rahe hain…')}
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
          tips={PHOTO_ASKS[capture.kind].tips}
          kind={capture.kind}
          pan={capture.volunteered ? null : lastAction.current?.challenge?.pan}
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
                <button className={styles.sheetDanger} onClick={() => { setConfirmEnd(false); endReason.current = 'Ended with the Khatam button'; finish(); }}>Khatam karein</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
