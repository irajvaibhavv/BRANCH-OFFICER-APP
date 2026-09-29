import { useEffect, useRef, useState } from 'react';
import { IoCameraReverse, IoCheckmarkCircle, IoClose, IoImages, IoRefresh, IoWarning } from 'react-icons/io5';
import { MAX_EDGE, QUALITY, GUIDE, checkQuality, framingCheck } from '../../services/sarthi/photo';
import { speak, stopSpeaking } from '../../services/voice';
import { sarthiVoice, gendered } from '../../services/sarthi/voice';
import styles from './PhotoCapture.module.css';

// A shot that failed the check twice may still be sent — bad light must not strand the PD; the report says so.
const SEND_ANYWAY_AFTER = 2;
const LIVE_CHECK_MS = 700;
// Sarthi speaks a live hint only once it has held for two checks, and not more often than this — else it nags.
const SPEAK_GAP_MS = 4500;

// Full-screen live camera, guided the way an officer guides a PD photo, by voice as well as on screen: tips first, a
// framing guide and a live light/blur check while aiming, then a review — light and blur checked in code, framing
// (too far, too close, counter missing) by the vision model — with Retake. The gallery is offered only when the
// camera cannot open.
export default function PhotoCapture({ kind = 'extra', title, hint, tips = [], onCapture, onUpload, onCancel }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [facing, setFacing] = useState('environment');
  const [status, setStatus] = useState('starting'); // starting | live | failed
  const [stage, setStage] = useState(tips.length ? 'tips' : 'aim'); // tips | aim | review
  const [live, setLive] = useState(null);   // last live quality check
  const [shot, setShot] = useState(null);   // { dataUrl, quality, checking }
  const [attempts, setAttempts] = useState(0);
  const voice = useRef({ last: null, at: 0, pending: null });
  const latest = useRef(null); // the shot whose framing read is out

  const say = (line) => {
    if (!line?.speech) return;
    voice.current.at = Date.now();
    stopSpeaking();
    speak(gendered(line.speech), { voice: sarthiVoice() });
  };

  useEffect(() => () => stopSpeaking(), []);
  useEffect(() => { if (stage === 'tips') say(GUIDE.tips); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (stage === 'aim' && status === 'live') { voice.current = { last: null, at: 0, pending: null }; say(GUIDE.aim); }
  }, [stage, status]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 960 } },
          audio: false,
        });
        if (cancelled) { s.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = s;
        videoRef.current.srcObject = s;
        setStatus('live');
      } catch {
        if (!cancelled) setStatus('failed');
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [facing]);

  // Live hint while aiming, so they fix the light before pressing, not after — shown at once, spoken once it holds.
  useEffect(() => {
    if (status !== 'live' || stage !== 'aim') return undefined;
    const t = setInterval(() => {
      const v = videoRef.current;
      if (!v || v.readyState < 2 || !v.videoWidth) return;
      const q = checkQuality(v);
      setLive(q);
      const key = q.ok ? 'live_ok' : q.issues[0].key;
      const vc = voice.current;
      const held = vc.pending === key;
      vc.pending = key;
      if (!held || key === vc.last || Date.now() - vc.at < SPEAK_GAP_MS) return;
      if (key === 'live_ok' && !vc.last) return; // nothing was wrong; no need to say it is fine
      vc.last = key;
      say(q.ok ? GUIDE.live_ok : q.issues[0]);
    }, LIVE_CHECK_MS);
    return () => clearInterval(t);
  }, [status, stage]); // eslint-disable-line react-hooks/exhaustive-deps

  const shoot = async () => {
    const v = videoRef.current;
    if (!v || v.readyState < 2 || !v.videoWidth) return;
    const scale = Math.min(1, MAX_EDGE / Math.max(v.videoWidth, v.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(v.videoWidth * scale);
    canvas.height = Math.round(v.videoHeight * scale);
    canvas.getContext('2d').drawImage(v, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', QUALITY);
    const quality = checkQuality(canvas);
    setAttempts((n) => n + 1);
    setStage('review');
    // Light and blur first, in code; only a shot that passes is sent for the framing read.
    if (!quality.ok || kind === 'extra') {
      setShot({ dataUrl, quality });
      say(quality.ok ? GUIDE.good : quality.issues[0]);
      return;
    }
    setShot({ dataUrl, quality, checking: true });
    latest.current = dataUrl;
    const framing = await framingCheck(dataUrl, kind);
    if (latest.current !== dataUrl) return; // retaken while the read was out
    const final = framing ?? quality;
    setShot({ dataUrl, quality: final });
    say(final.ok ? GUIDE.good : final.issues[0]);
  };

  const retake = () => { latest.current = null; setShot(null); setLive(null); setStage('aim'); };
  const send = () => onCapture({ dataUrl: shot.dataUrl, facing, quality: shot.quality, attempts });

  const flip = () => {
    setStatus('starting');
    setFacing((f) => (f === 'environment' ? 'user' : 'environment'));
  };

  const liveText = status === 'starting' ? 'Camera khul raha hai…'
    : live && !live.ok ? live.issues[0].text
      : live?.ok ? GUIDE.live_ok.text : hint;

  return (
    <div className={styles.overlay} role="dialog" aria-label={title}>
      <video ref={videoRef} className={`${styles.video} ${facing === 'user' ? styles.mirror : ''}`} autoPlay playsInline muted />
      {stage === 'review' && shot && <img className={styles.video} src={shot.dataUrl} alt="Li gayi photo" />}

      <div className={styles.top}>
        <button className={styles.round} onClick={onCancel} aria-label="Wapas"><IoClose size={22} /></button>
        <span className={styles.title}>{title}</span>
        <span className={styles.spacer} />
      </div>

      {status === 'failed' ? (
        <div className={styles.failed}>
          <p className={styles.failTitle}>Camera nahi khul paaya</p>
          <p className={styles.failSub}>Gallery se photo bhej sakte hain. Officer ko bataya jaayega ki yeh photo camera se nahi li gayi.</p>
          <label className={styles.upload}>
            <IoImages size={18} /> Gallery se chunein
            <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); }} />
          </label>
        </div>
      ) : stage === 'tips' ? (
        <div className={styles.failed}>
          <p className={styles.failTitle}>Achhi photo ke liye</p>
          <ol className={styles.tips}>
            {tips.map((t, i) => <li key={t}><span>{i + 1}</span>{t}</li>)}
          </ol>
          <button className={styles.upload} onClick={() => setStage('aim')}>Samajh gaya, camera kholiye</button>
        </div>
      ) : stage === 'review' && shot ? (
        <div className={styles.bottom}>
          {shot.checking ? (
            <div className={`${styles.verdict} ${styles.wait}`}>{gendered(GUIDE.checking.text)}</div>
          ) : (
            <div className={`${styles.verdict} ${shot.quality.ok ? styles.good : styles.bad}`}>
              {shot.quality.ok
                ? <><IoCheckmarkCircle size={20} /> {GUIDE.good.text}</>
                : <><IoWarning size={20} /> {shot.quality.issues.map((x) => x.text).join(' · ')}</>}
            </div>
          )}
          <div className={styles.reviewBtns}>
            <button className={styles.ghostBtn} onClick={retake}><IoRefresh size={18} /> {GUIDE.retake.text}</button>
            {!shot.checking && (shot.quality.ok || attempts >= SEND_ANYWAY_AFTER) && (
              <button className={styles.upload} onClick={send}>{shot.quality.ok ? 'Photo bhejiye' : 'Phir bhi bhejiye'}</button>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Framing guide: keep the subject inside the corners, the horizon on the middle line. */}
          <div className={styles.guide} aria-hidden="true"><i /><i /><i /><i /><b /></div>
          <div className={styles.bottom}>
            <p className={`${styles.hint} ${live && !live.ok ? styles.hintBad : ''}`}>{liveText}</p>
            <div className={styles.controls}>
              <span className={styles.spacer} />
              <button className={styles.shutter} onClick={shoot} disabled={status !== 'live'} aria-label="Photo lein"><span /></button>
              <button className={styles.round} onClick={flip} aria-label="Camera badlein"><IoCameraReverse size={22} /></button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
