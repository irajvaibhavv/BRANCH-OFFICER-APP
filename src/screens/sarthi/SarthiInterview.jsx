import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { FiX } from 'react-icons/fi';
import { IoCall, IoCamera, IoMic, IoMicOff, IoSend, IoVolumeHigh } from 'react-icons/io5';
import VideoFeed, { LiveBadge } from '../../components/sarthi/VideoFeed';
import AiAvatar from '../../components/sarthi/AiAvatar';
import { getCase, briefForCitation, buildNewCase, CUSTOM_CASES_KEY } from '../../services/sarthi/knowledge';
import { parseClaims, peekSpeech, peekDisplay, writeReport, VISION_URL, COMPLETE_TAG } from '../../services/sarthi/agent';
import { extractFacts, askTurn } from '../../services/sarthi/model';
import { buildScript, buildIntakeScript, tradeFromWords, claimFromAnswer, buildFallbackReport } from '../../services/sarthi/script';
import { verifyClaims, computeEligibility, toNumber } from '../../services/sarthi/verifier';
import { createEmptyMemory, updateMemory, addFlags, recordTurn, completeness, typedFieldsFor } from '../../services/sarthi/memory';
import pdSchema from '../../data/sarthi/pdSchema.json';
import { getNextAction, directiveText, checkContradictions, checkInternalConsistency, getInterviewConfig, assessIncome } from '../../services/sarthi/controller';
import { validateReport, extractRecommendation } from '../../services/sarthi/validator';
import { validateAadhaar, validatePan } from '../../services/sarthi/idChecks';
import { startFrameCapture, stopCamera, getObservations, resetObservations } from '../../services/sarthi/video';
import { downscale, analysePhoto, PHOTO_ASKS } from '../../services/sarthi/photo';
import { stopSpeaking, listen, canListen, canSpeak } from '../../services/voice';
import { speakStreamed } from '../../services/sarthi/stream';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { SARTHI_VOICE } from '../../services/sarthi/voice';
import voiceManifest from '../../data/sarthi/voiceManifest.json';
import { useSarthiReports } from '../../hooks/useSarthiReports';
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
  const caseData = existing ?? built.current ?? placeholder;

  const [phase, setPhase] = useState('connecting'); // connecting · live · generating · failed
  const [avatar, setAvatar] = useState('idle');     // idle · speaking · listening · thinking
  const [caption, setCaption] = useState({ who: 'ai', text: '' });
  const [muted, setMuted] = useState(false);
  const [typeMode, setTypeMode] = useState(!canListen);
  const [draft, setDraft] = useState('');
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [progress, setProgress] = useState('');
  const [asked, setAsked] = useState(0);
  const [photoAsk, setPhotoAsk] = useState(null); // 'shop' | 'home' while Sarthi waits for a picture
  const [photoBusy, setPhotoBusy] = useState(false);
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
  const doneRef = useRef(false);
  const stopListen = useRef(null);
  const cameraRef = useRef(false);
  const liveRef = useRef(false); // proxy reachable → vision frames are worth sending

  useEffect(() => { mutedRef.current = muted; }, [muted]);

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
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeMode]);

  const say = useCallback((text, { then, speech, again } = {}) => {
    lastLine.current = { text, speech };
    if (!again) setAsked((n) => n + 1);
    setCaption({ who: 'ai', text });
    setAvatar('speaking');
    if (!canSpeak) {
      // No TTS at all — leave the caption up long enough to read, then carry on.
      const t = setTimeout(() => { setAvatar('idle'); (then ?? beginListening)(); }, Math.min(9000, 1800 + text.length * 45));
      return () => clearTimeout(t);
    }
    const line = speech || text;
    // Scripted lines play pre-rendered audio; live text is streamed sentence by sentence.
    speakStreamed(line, {
      voice: SARTHI_VOICE,
      src: voiceManifest[line],
      onEnd: () => { setAvatar('idle'); (then ?? beginListening)(); },
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
    const identity = a.panCheck?.ok ? a.panCheck : a.aadhaarCheck?.ok ? a.aadhaarCheck : a.panCheck ?? a.aadhaarCheck ?? null;
    const area = c.business_location ?? c.residence_duration ?? '';
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

      if (isIntake) rebuildWalkIn();
      const subject = caseRef.current ?? caseData;

      const action = getNextAction(memory.current, subject);
      if (action.memory) memory.current = action.memory;

      if (action.action === 'end_interview') { finish(); return; }

      // Document numbers are typed — speech recognition mangles them.
      setTypeMode(typedFieldsFor(memory.current, SECTION_BY_ID[action.section]).length > 0 || !canListen);

      // Speak as soon as the speech fence closes. The follow-up (photo / end / listen) runs once,
      // after whichever of audio or stream finishes last.
      let spokenYet = false;
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
          if (caption) {
            setAvatar('speaking');
            setCaption({ who: 'ai', text: caption });
          }
          if (spokenYet) return;
          const early = peekSpeech(full);
          if (!early) return;
          spokenYet = true;
          lastLine.current = { text: caption, speech: early };
          setAsked((n) => n + 1);
          speakStreamed(early, {
            voice: SARTHI_VOICE,
            src: voiceManifest[early],
            onEnd: () => { audioDone = true; advance(); },
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
      if (isIntake && (facts.aadhaar_number || facts.pan_number)) {
        intake.current = { ...intake.current };
        setCollected({ ...memory.current.collected, ...intake.current });
      }

      const config = getInterviewConfig(subject);
      const found_flags = [
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
        setCaption({ who: 'ai', text: display });
        lastLine.current = { text: display, speech };
        streamDone = true;
        advance();
      } else {
        // No speech fence arrived mid-stream — speak the finished turn.
        streamDone = true;
        audioDone = true;
        say(display, { speech, ...(after ? { then: after } : {}) });
      }
    } catch (e) {
      // Borrow one scripted question and retry live next turn; only a permanent error locks to the script.
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

  /** The applicant photographs the shop or home; it is shown back to them, then described. */
  const submitPhoto = useCallback(async (file, volunteered = false) => {
    if (!file) return;
    // A photo sent from the message box is filed under whatever Sarthi has not been given yet.
    const sent = photos.current.map((p) => p.kind);
    const kind = volunteered
      ? (!sent.includes('shop') ? 'shop' : !sent.includes('home') ? 'home' : 'extra')
      : photoAsk;
    setPhotoBusy(true);
    try {
      const dataUrl = await downscale(file);
      setShownPhoto(dataUrl);
      setPhotoAsk(null);
      const record = await analysePhoto({ dataUrl, kind, caseData });
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
  }, [photoAsk, caseData, beginListening]);

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
    if (isIntake && !built.current) {
      setProgress('Opening the file…');
      const a = intake.current;
      const identity = a.panCheck?.ok ? a.panCheck : a.aadhaarCheck?.ok ? a.aadhaarCheck : a.panCheck ?? a.aadhaarCheck ?? null;
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
      ].filter(Boolean);
      built.current = subject;
      setCases((prev) => [subject, ...prev]);
    }

    setProgress('Verifying claims against bureau and bank data…');
    const { evidence, flags: claimFlags } = verifyClaims(captured, subject);

    // Rerun at the end, when every answer is in.
    const consistency = checkInternalConsistency(memory.current, subject);

    // Where verifier and controller flag the same field, keep the verifier's (it has a turn).
    const settled = new Set(claimFlags.map((f) => f.claimType).filter(Boolean));
    const flags = [...claimFlags, ...memory.current.flags, ...consistency]
      .filter((f) => !(f.type === 'contradiction' && settled.has(CLAIM_FIELD[f.field])))
      .filter((f, i, all) => all.findIndex((o) => o.detail === f.detail) === i);

    const assessed = assessIncome(memory.current, subject);
    const eligibility = computeEligibility(subject, assessed);
    const observations = getObservations();
    const collectedFacts = memory.current.collected;

    save(`bo_sarthi_transcript_${subject.id}`, turns);
    save(`bo_sarthi_claims_${subject.id}`, captured);
    save(`bo_sarthi_evidence_${subject.id}`, { evidence, flags, eligibility, observations, collected: collectedFacts });
    // Images are kept in their own key: base64 is heavy and must not risk the report's own write.
    save(`bo_sarthi_photos_${subject.id}`, photos.current);

    let report;
    let validation = null;
    let usedDemo = demoRef.current;

    if (!demoRef.current) {
      try {
        setProgress('Writing the PD report…');
        const raw = await writeReport({ caseData: subject, transcript: turns, claims: captured, evidence, flags, collected: collectedFacts, verification: memory.current.verification, eligibility, observations, photos: photos.current, identity: caseData.identity });
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
      report = buildFallbackReport({ caseData: subject, transcript: turns, evidence, flags, eligibility, observations, photos: photos.current, identity: subject.identity, cameraOn: cameraRef.current });
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
      validation,
      turns: turns.length,
    };
    setReports((prev) => [entry, ...prev.filter((r) => r.caseId !== caseData.id)]);
    navigate(`/sarthi/report/${subject.id}`, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseData, navigate, setReports, teardown]);

  /* ---------------------------------------------------------------- start */
  useEffect(() => {
    if (!caseData) return;
    let cancelled = false;
    resetObservations();
    scriptRef.current = isIntake ? buildIntakeScript() : buildScript(caseData);
    memory.current = createEmptyMemory(caseData);
    caseRef.current = caseData;

    (async () => {
      // The opening question is the reachability probe — no separate probe request.
      setPhase('live');
      history.current = [{ role: 'user', content: '[System: the borrower has joined the call. Greet them and begin the interview.]' }];

      try {
        const opening = getNextAction(memory.current, caseData);
        if (opening.memory) memory.current = opening.memory;
        const raw = await askTurn({ caseData, action: opening, directive: directiveText(opening), messages: history.current, turn: 0 });
        if (cancelled) return;
        const { display, speech } = parseClaims(raw, 0);
        demoRef.current = false;
        liveRef.current = true;
        if (cameraRef.current) startFrameCapture(VISION_URL, () => {});
        memory.current = recordTurn(memory.current, 'assistant', display);
        history.current.push({ role: 'assistant', content: raw });
        transcript.current.push({ role: 'assistant', content: display });
        say(display, { speech });
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
  }, [caseData]);

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
          <span className={styles.step}>{asked > 0 ? `Sawaal ${Math.min(asked, total)} / ${total}` : 'Shuru ho raha hai'}</span>
          <span className={styles.progress} aria-hidden="true">
            <span className={styles.progressFill} style={{ width: `${Math.min(96, covered?.filled ? covered.pct : (asked / total) * 100)}%` }} />
          </span>
        </div>

        <div className={styles.body}>
          <AnimatePresence mode="wait">
            {caption.text && (
              <motion.div
                key={caption.text + caption.who}
                className={caption.who === 'borrower' ? styles.echo : styles.question}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
              >
                {caption.who === 'borrower' && <span className={styles.echoLabel}>Aapne kaha</span>}
                <span className={caption.text.length > 110 ? styles.qLong : caption.text.length > 64 ? styles.qMed : styles.qBig}>
                  {caption.text}
                </span>
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
            <label className={styles.shoot}>
              <IoCamera size={20} /> {PHOTO_ASKS[photoAsk].hint} bhejiye
              <input type="file" accept="image/*" capture="environment" onChange={(e) => submitPhoto(e.target.files?.[0])} hidden />
            </label>
            <button className={styles.skip} onClick={skipPhoto}>Abhi nahi</button>
          </div>
        )}

        {/* Always available: they can type or send a picture at any point, not only when asked. */}
        <div className={styles.typeRow}>
          <label className={styles.attach} title="Photo bhejein">
            <IoCamera size={13} />
            <input type="file" accept="image/*" capture="environment" onChange={(e) => submitPhoto(e.target.files?.[0], true)} hidden />
          </label>
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
            <span className={styles.disc}><IoVolumeHigh size={12} /></span>
            Phir se
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
