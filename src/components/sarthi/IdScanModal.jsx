import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FiCamera, FiX, FiCheck } from 'react-icons/fi';
import scannedIds from '../../data/sarthi/scannedIds.json';
import styles from './IdScanModal.module.css';

// ponytail: fake OCR — on capture, picks a seeded extraction. Real OCR (Textract, GCP Vision) swaps in here.
function fakeOcr(kind) {
  const list = scannedIds[kind] ?? [];
  return list[Math.floor(Math.random() * list.length)];
}

export default function IdScanModal({ open, kind, onClose, onScanned }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [phase, setPhase] = useState('live'); // live | reading
  const [cameraOk, setCameraOk] = useState(true);

  useEffect(() => {
    if (!open) return undefined;
    setPhase('live');
    let stopped = false;
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: 1280, height: 720 }, audio: false });
        if (stopped) { s.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = s;
        if (videoRef.current) videoRef.current.srcObject = s;
      } catch {
        setCameraOk(false);
      }
    })();
    return () => {
      stopped = true;
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [open]);

  const capture = () => {
    setPhase('reading');
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    setTimeout(() => {
      const scanned = fakeOcr(kind);
      onScanned?.(scanned);
      onClose?.();
    }, 1300);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div className={styles.backdrop} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className={styles.frame}>
            <div className={styles.header}>
              <div>
                <div className={styles.title}>Scan {kind === 'pan' ? 'PAN' : 'Aadhaar'}</div>
                <div className={styles.hint}>Fit the document inside the box</div>
              </div>
              <button className={styles.close} onClick={onClose} aria-label="Close"><FiX size={20} /></button>
            </div>

            <div className={styles.stage}>
              {cameraOk ? (
                <video ref={videoRef} className={styles.video} autoPlay playsInline muted />
              ) : (
                <div className={styles.noCam}>Camera not available. Tap capture to use a demo scan.</div>
              )}
              <div className={styles.cornerBox} />
              {phase === 'reading' && (
                <motion.div className={styles.reading} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <div className={styles.spinner} />
                  <div>Reading document…</div>
                </motion.div>
              )}
            </div>

            <button className={styles.shoot} onClick={capture} disabled={phase === 'reading'}>
              {phase === 'reading' ? <><FiCheck size={18} /> Extracting…</> : <><FiCamera size={18} /> Capture</>}
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
