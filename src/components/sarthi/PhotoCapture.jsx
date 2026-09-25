import { useEffect, useRef, useState } from 'react';
import { IoCameraReverse, IoClose, IoImages } from 'react-icons/io5';
import { MAX_EDGE, QUALITY } from '../../services/sarthi/photo';
import styles from './PhotoCapture.module.css';

// Full-screen live camera. The gallery is offered only when the camera cannot open, and the caller flags it.
export default function PhotoCapture({ title, hint, onCapture, onUpload, onCancel }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [facing, setFacing] = useState('environment');
  const [status, setStatus] = useState('starting'); // starting | live | failed

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

  const shoot = () => {
    const v = videoRef.current;
    if (!v || v.readyState < 2 || !v.videoWidth) return;
    const scale = Math.min(1, MAX_EDGE / Math.max(v.videoWidth, v.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(v.videoWidth * scale);
    canvas.height = Math.round(v.videoHeight * scale);
    canvas.getContext('2d').drawImage(v, 0, 0, canvas.width, canvas.height);
    onCapture({ dataUrl: canvas.toDataURL('image/jpeg', QUALITY), facing });
  };

  const flip = () => {
    setStatus('starting');
    setFacing((f) => (f === 'environment' ? 'user' : 'environment'));
  };

  return (
    <div className={styles.overlay} role="dialog" aria-label={title}>
      <video ref={videoRef} className={`${styles.video} ${facing === 'user' ? styles.mirror : ''}`} autoPlay playsInline muted />

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
      ) : (
        <div className={styles.bottom}>
          <p className={styles.hint}>{status === 'starting' ? 'Camera khul raha hai…' : hint}</p>
          <div className={styles.controls}>
            <span className={styles.spacer} />
            <button className={styles.shutter} onClick={shoot} disabled={status !== 'live'} aria-label="Photo lein"><span /></button>
            <button className={styles.round} onClick={flip} aria-label="Camera badlein"><IoCameraReverse size={22} /></button>
          </div>
        </div>
      )}
    </div>
  );
}
