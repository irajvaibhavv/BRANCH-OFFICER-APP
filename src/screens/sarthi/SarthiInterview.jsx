import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { FiX } from 'react-icons/fi';
import { IoCall, IoCamera, IoMic, IoMicOff, IoSend, IoVolumeHigh } from 'react-icons/io5';
import VideoFeed, { LiveBadge } from '../../components/sarthi/VideoFeed';
import AiAvatar from '../../components/sarthi/AiAvatar';
import { getCase, briefForCitation, buildNewCase, CUSTOM_CASES_KEY } from '../../utils/sarthiTools';
import { parseClaims, peekSpeech, peekDisplay, writeReport, VISION_URL, COMPLETE_TAG } from '../../utils/sarthiAgent';
import { extractFacts, askTurn } from '../../utils/sarthiModel';
import { buildScript, buildIntakeScript, tradeFromWords, claimFromAnswer, buildFallbackReport } from '../../utils/sarthiScript';
import { verifyClaims, computeEligibility, toNumber } from '../../utils/sarthiVerifier';
import { createEmptyMemory, updateMemory, addFlags, recordTurn, completeness, typedFieldsFor } from '../../utils/sarthiMemory';
import pdSchema from '../../data/sarthi/pdSchema.json';
import { getNextAction, directiveText, checkContradictions, checkInternalConsistency, getInterviewConfig, assessIncome } from '../../utils/sarthiController';
import { validateReport, extractRecommendation } from '../../utils/sarthiValidator';
import { validateAadhaar, validatePan } from '../../utils/sarthiId';
import { startFrameCapture, stopCamera, getObservations, resetObservations } from '../../utils/sarthiVideo';
import { downscale, analysePhoto, PHOTO_ASKS } from '../../utils/sarthiPhoto';
import { stopSpeaking, listen, canListen, canSpeak } from '../../utils/voice';
import { speakStreamed } from '../../utils/sarthiStream';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { SARTHI_VOICE } from '../../utils/sarthiVoice';
import voiceManifest from '../../data/sarthi/voiceManifest.json';
import { useSarthiReports } from './SarthiHome';
import styles from './SarthiInterview.module.css';

/*
  The interview. A one-way video call: the borrower's camera fills the screen, Sarthi is the
  avatar PIP, and the only text on screen is the live caption. The phone is in the borrower's
  hands here, so the tab bar is hidden (see PersistentTabBar in app/router.jsx) and there is no
  way out except "End".

  Two engines behind the same UI:
   - live      — Gemini through the proxy (Agent 1), claims captured from ```claim``` blocks
   - scripted  — sarthiScript.js, used when the proxy is unreachable so a demo always completes
  Everything after the interview (verification, eligibility, validation) is identical either way.
*/

/* Controller field names → the verifier's claim types, so the same finding from both can be
   recognised as one. Only fields both sides actually check appear here. */
const CLAIM_FIELD = { monthly_income: 'income', existing_emi: 'existingEmi', monthly_rent: 'rent' };

/* Upstream statuses that may clear on their own, so live mode is worth trying again next turn. */
const TRANSIENT = new Set([429, 500, 502, 503, 504]);
/** Schema sections by id, so a controller instruction can be matched back to its field list. */
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
  // Both of these must keep the same identity across renders: the startup effect below depends on
  // caseData, and a fresh object each render would restart the interview on every keystroke.
  // getCase() re-parses localStorage, so a walk-in would otherwise come back as a new object.
  const existing = useMemo(() => (isIntake ? null : getCase(id)), [id, isIntake]);
  // In intake the record is assembled answer by answer; until then it is a placeholder so the
  // screen has a name to show and the report writer has something to attach to.
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
  // How much of the PD schema is actually filled — a truer progress bar than counting questions,
  // because the controller ends on coverage, not on a question count.
  const [covered, setCovered] = useState(null);
  const lastLine = useRef({ text: '', speech: '' });
  const photos = useRef([]);

  // Mutable interview state — read inside async callbacks, so refs rather than state.
  const transcript = useRef([]);   // [{ role, content }] — what the report cites
  const history = useRef([]);      // what Gemini sees (includes the hidden kickoff turn)
  const claims = useRef([]);
  const scriptRef = useRef([]);
  const stepRef = useRef(0);
  // Structured PD memory — what the controller reads to decide the next question. Held in a ref
  // because every read happens inside an async turn callback.
  const memory = useRef(createEmptyMemory(null));
  /*
    The case as it stands right now. A walk-in starts as `placeholder` and is rebuilt mid-interview
    the moment the model learns their trade and area, which is what lets later prompts carry real
    area and business knowledge. It lives in a ref, not state, because the startup effect keys off
    `caseData` — giving that a new identity halfway through would restart the interview.
  */
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

  /**
   * `text` is the Hinglish caption on screen; `speech` is the Devanagari the voice reads, because
   * a Hindi voice pronounces romanized Hindi as English spelling. Falls back to the caption.
   */
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
    // Scripted lines are pre-rendered (npm run sarthi:voice), so a demo needs no TTS call at all:
    // no quota to run out, no venue wifi to fail, no lag before the question. Live model text is
    // generated on the fly and is not in the manifest, so it falls through to the API — and is
    // spoken sentence by sentence, so the first one starts playing while the rest still render.
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

  /*
    Build (or rebuild) a walk-in's case record from what the interview has learned so far.

    This is what makes a fully-live walk-in work. The interviewer prompt injects area and trade
    knowledge looked up from `areaKey`/`businessKey`, and a walk-in has neither until they say what
    they do and where. So the first questions run ungrounded against the placeholder, and the
    moment the trade is known the record is rebuilt and every later prompt carries the real margin
    ranges, trap questions and rent bands. Re-running it as more arrives is cheap and keeps the
    record honest; nothing here is invented, every field comes from an answer.
  */
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
      /*
        Two model calls, in this order, and the order is the point.

        First a small extractor pulls named fields out of the answer just given. Only then does
        the controller choose the next topic — so it decides on THIS turn's facts, not the
        previous turn's. That is what makes the directive correct rather than merely good enough,
        and it is why the split is worth a second round trip: the extractor is a pattern task
        routed to the SLM (~0.3s), so the pair still costs less than the single Gemini call it
        replaces.

        The question call also still emits a ```facts``` fence. That is deliberate redundancy,
        not a leftover: if extraction fails or comes back empty, the fence fills the gap, and a
        dropped fact is uniquely expensive here — the controller would keep re-asking the same
        question for the rest of the interview.
      */
      // Snapshot BEFORE any of this turn's facts land. checkContradictions compares the new
      // facts against the state that preceded them — most importantly income_mentions, where
      // comparing the list against a value already appended to it would never detect coaching.
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

      /*
        A walk-in's record is rebuilt as soon as the model knows their trade, so the controller and
        the next prompt both see real area and business knowledge instead of the placeholder.
      */
      if (isIntake) rebuildWalkIn();
      const subject = caseRef.current ?? caseData;

      const action = getNextAction(memory.current, subject);
      if (action.memory) memory.current = action.memory;

      if (action.action === 'end_interview') { finish(); return; }

      // A document number must be typed: speech recognition mangles 12 digits, and a checksum
      // that fails because of the microphone is worse than running no check at all.
      setTypeMode(typedFieldsFor(memory.current, SECTION_BY_ID[action.section]).length > 0 || !canListen);

      /*
        Stream the turn, and speak it before it has finished arriving.

        The caption types out from the first tokens, and the moment the ```speech``` fence closes
        the voice starts — the prompt deliberately puts that block ahead of the claim/facts
        bookkeeping, so the borrower hears the question while the rest is still on the wire.

        What happens AFTER the question (ask for a photo, end the interview, or just listen) is
        not known until the stream finishes, but the audio may well finish first. So both sides
        latch and whichever lands last runs the follow-up exactly once.
      */
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

      // Fold in anything the extractor missed, then let the code-only checks look at the result.
      // The model never decides that something is a contradiction; it only reports what was said.
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
        // Already speaking from the stream. Settle the caption to the fully parsed text (a fence
        // that closed late could have left a fragment) and let the latch run the follow-up.
        setCaption({ who: 'ai', text: display });
        lastLine.current = { text: display, speech };
        streamDone = true;
        advance();
      } else {
        // The speech block never arrived mid-stream — a non-streaming server, or a reply that put
        // the block last anyway. Fall back to speaking the finished turn.
        streamDone = true;
        audioDone = true;
        say(display, { speech, ...(after ? { then: after } : {}) });
      }
    } catch (e) {
      /*
        askAgent has already retried the transient cases. Falling back is therefore right, but
        making it permanent is not: a 503 means Google was busy for a moment, and locking the
        rest of the interview to the script over one blip is the worst outcome in a demo. So we
        borrow one scripted question to keep the conversation moving and let the NEXT turn try
        live again. Only a hard failure — bad key, retired model, no proxy at all — sticks,
        because that one will never recover on its own.
      */
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

    // Intake: assemble the file from what was said, then treat it like any other case.
    // A live walk-in has been rebuilding its record all along, so take that and skip ahead;
    // only the scripted fallback still has to assemble one from intake.current at the end.
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

    /*
      Two independent sources of doubt, both decided in code:
       - verifyClaims  — what they said against the bureau, the bank and the area data
       - the controller's flags — contradictions caught live, plus, for a walk-in with nothing on
         file, their own numbers checked against each other and against their trade's real margins
      The second is the only thing standing behind a walk-in's file, so it runs once more at the
      end, when every answer is in and the arithmetic finally has all its inputs.
    */
    const consistency = checkInternalConsistency(memory.current, subject);

    // The verifier and the controller both catch a bad income figure, by different routes. The
    // verifier's version is the one with a turn number and a verdict behind it, so where both
    // fired on the same field the controller's duplicate is dropped rather than printed twice.
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
      /*
        A walk-in gets the live interview too. There is no bureau or bank record behind them, so
        the ONLY evidence is whether their own numbers hang together — which takes follow-ups that
        cannot be scripted in advance. The scripted script below remains the fallback.

        The opening question IS the reachability probe. A separate probe used to cost a whole
        extra request before the borrower heard a word, which on a per-DAY quota is an interview's
        worth of budget spent on saying hello, plus a second of dead air.
      */
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
        /*
          Opening a scripted question is not the same as giving up on the interview. A 429 from a
          per-minute quota, or a 503, clears in seconds — locking every remaining turn to the
          script over one blip at hello is the worst possible trade in a demo. So only a failure
          that cannot recover on its own (bad key, retired model, no proxy at all) sets demoRef;
          anything transient borrows the scripted opening and lets turn two try live again, which
          is exactly how a mid-interview stumble already behaves.
        */
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
      {/* The band: whoever is on camera, with Sarthi alongside. Everything the applicant has to
          read lives on the sheet below, where dark text on paper survives direct sunlight. */}
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
            {/* Coverage of the PD schema once anything has been collected — that is what actually
                ends the interview. Falls back to the question count before the first answer. */}
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
