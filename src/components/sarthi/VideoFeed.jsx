import { useEffect, useRef, useState } from 'react';
import { FiVideoOff } from 'react-icons/fi';
import { startCamera } from '../../utils/sarthiVideo';
import styles from './VideoFeed.module.css';

/*
  The applicant's camera, filling the screen like a real video call with Sarthi in the corner.
  A denied or missing camera is not an error: this layer goes transparent, Sarthi moves to the
  centre of the screen instead, and the interview carries on — voice and typing are the real
  channels here, the camera only adds context for the officer.
*/
export default function VideoFeed({ onCameraReady, onDenied }) {
  const ref = useRef(null);
  const started = useRef(false);
  const [live, setLive] = useState(false);

  useEffect(() => {
    if (started.current) return; // StrictMode double-invoke must not open the camera twice
    started.current = true;
    let cancelled = false;
    (async () => {
      const ok = await startCamera(ref.current);
      if (cancelled) return;
      setLive(ok);
      if (ok) onCameraReady?.(ref.current);
      else onDenied?.();
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={styles.feed}>
      <video ref={ref} className={`${styles.video} ${live ? '' : styles.hidden}`} autoPlay playsInline muted />
      {/* No silhouette when the camera is off: Sarthi takes the centre of the screen instead,
          and two competing figures would just fight each other. */}
      {!live && (
        <div className={styles.noCamWrap}>
          <span className={styles.noCam}><FiVideoOff size={13} /> Camera band hai — interview chalta rahega</span>
        </div>
      )}
      <div className={`${styles.scrim} ${live ? '' : styles.scrimLight}`} />
    </div>
  );
}

/** The small "LIVE" chip a video call shows while recording. */
export function LiveBadge({ on = true }) {
  return (
    <span className={`${styles.live} ${on ? '' : styles.liveOff}`}>
      <i className={styles.dot} /> {on ? 'LIVE' : 'NO CAM'}
    </span>
  );
}
