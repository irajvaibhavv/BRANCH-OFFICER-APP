import { useEffect, useRef, useState } from 'react';
import { FiCheck, FiX, FiVolume2, FiArrowLeft } from 'react-icons/fi';
import { speak, stopSpeaking, prefetch } from '../../services/voice';
import { getSarthiGender, setSarthiGender, sarthiVoice, gendered, prerendered } from '../../services/sarthi/voice';
import { prefetchLine } from '../../services/sarthi/stream';
import styles from './CallSetup.module.css';

const VOICES = [
  { id: 'male', emoji: '👨', name: 'Purush awaaz', note: 'Professional' },
  { id: 'female', emoji: '👩', name: 'Mahila awaaz', note: 'Friendly' },
];
const SAMPLE = { male: 'नमस्ते! मैं सारथी हूँ, आज आपसे कुछ आसान सवाल पूछूँगा।', female: 'नमस्ते! मैं सारथी हूँ, आज आपसे कुछ आसान सवाल पूछूँगी।' };

// Before the call: camera and mic are checked and the voice is chosen here, so nothing on the call screen asks for a
// choice mid-interview. The tap on Start also unlocks audio on Safari, so the greeting is heard at once.
export default function CallSetup({ title, greeting, onStart, onBack }) {
  const video = useRef(null);
  const [cam, setCam] = useState('wait'); // wait | ok | off
  const [mic, setMic] = useState('wait'); // wait | ok | heard | off
  const [level, setLevel] = useState(0);
  const [gender, setGender] = useState(getSarthiGender);
  const [playing, setPlaying] = useState(null);

  // Both samples are rendered as the screen opens, so Suniye plays at once instead of waiting 3-4s on the TTS render.
  useEffect(() => { prefetch([SAMPLE.male], sarthiVoice('male')); prefetch([SAMPLE.female], sarthiVoice('female')); }, []);
  // The greeting too, in the chosen voice (again when it changes), so it plays the moment Start is tapped.
  useEffect(() => { if (greeting && !prerendered()) prefetchLine(gendered(greeting), sarthiVoice()); }, [greeting, gender]);

  useEffect(() => {
    let stream = null; let ctx = null; let raf = 0; let dead = false;
    const open = (c) => navigator.mediaDevices?.getUserMedia(c).catch(() => null) ?? Promise.resolve(null);
    (async () => {
      // Asked separately: a denied camera must not hide a working mic.
      const [v, a] = await Promise.all([open({ video: { facingMode: 'user' } }), open({ audio: true })]);
      if (dead) { [v, a].forEach((s) => s?.getTracks().forEach((t) => t.stop())); return; }
      stream = [v, a];
      setCam(v ? 'ok' : 'off');
      setMic(a ? 'ok' : 'off');
      if (v && video.current) video.current.srcObject = v;
      if (!a) return;
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      const an = ctx.createAnalyser(); an.fftSize = 512;
      ctx.createMediaStreamSource(a).connect(an);
      const buf = new Uint8Array(an.fftSize);
      const tick = () => {
        an.getByteTimeDomainData(buf);
        const peak = buf.reduce((m, x) => Math.max(m, Math.abs(x - 128)), 0) / 128;
        setLevel(peak);
        if (peak > 0.12) setMic('heard');
        raf = requestAnimationFrame(tick);
      };
      tick();
    })();
    // The call opens its own camera; many phones cannot hold two.
    return () => { dead = true; cancelAnimationFrame(raf); ctx?.close(); stream?.forEach((s) => s?.getTracks().forEach((t) => t.stop())); stopSpeaking(); };
  }, []);

  const pick = (id, listen) => {
    setSarthiGender(id);
    setGender(id);
    if (!listen) return;
    stopSpeaking();
    setPlaying(id);
    speak(SAMPLE[id], { voice: sarthiVoice(id), onEnd: () => setPlaying((p) => (p === id ? null : p)) });
  };

  const start = () => { stopSpeaking(); onStart(); };

  return (
    <div className={styles.setup}>
      <header className={styles.head}>
        {onBack && <button className={styles.back} onClick={onBack} aria-label="Wapas"><FiArrowLeft size={20} /></button>}
        <h1 className={styles.title}>{title}</h1>
      </header>

      <div className={styles.preview}>
        <video ref={video} className={cam === 'ok' ? styles.video : styles.hidden} autoPlay playsInline muted />
        {cam !== 'ok' && <span className={styles.noCam}>{cam === 'wait' ? 'Camera khul raha hai…' : 'Camera nahi khula — interview phir bhi chalega'}</span>}
      </div>

      <div className={styles.checks}>
        <Check state={cam === 'ok' ? 'ok' : cam} label={cam === 'off' ? 'Camera band' : 'Camera chal raha hai'} />
        <Check
          state={mic === 'heard' ? 'ok' : mic === 'off' ? 'off' : 'wait'}
          label={mic === 'off' ? 'Mic band — likh kar jawab dijiye' : mic === 'heard' ? 'Mic chal raha hai' : 'Kuch boliye, mic check…'}
        >
          {mic !== 'off' && <span className={styles.meter}><i style={{ width: `${Math.min(100, level * 250)}%` }} /></span>}
        </Check>
      </div>

      <section className={styles.voices}>
        <h2 className={styles.label}>Interviewer ki awaaz chuniye</h2>
        <div role="radiogroup" aria-label="Interviewer ki awaaz">
          {VOICES.map((v) => (
            <div key={v.id} className={`${styles.voice} ${gender === v.id ? styles.on : ''}`}>
              <button type="button" role="radio" aria-checked={gender === v.id} className={styles.pick} onClick={() => pick(v.id)}>
                <span className={styles.radio} aria-hidden="true" />
                <span className={styles.emoji} aria-hidden="true">{v.emoji}</span>
                <span className={styles.vName}>{v.name}<small>{v.note}</small></span>
              </button>
              <button type="button" className={`${styles.listen} ${playing === v.id ? styles.playing : ''}`} onClick={() => pick(v.id, true)}>
                <FiVolume2 size={15} /> Suniye
              </button>
            </div>
          ))}
        </div>
      </section>

      <button className={styles.start} onClick={start}>Interview shuru kijiye</button>
    </div>
  );
}

function Check({ state, label, children }) {
  return (
    <div className={`${styles.check} ${styles[state]}`}>
      <span className={styles.icon}>{state === 'ok' ? <FiCheck size={14} /> : state === 'off' ? <FiX size={14} /> : <i className={styles.spin} />}</span>
      <span className={styles.checkText}>{label}{children}</span>
    </div>
  );
}
