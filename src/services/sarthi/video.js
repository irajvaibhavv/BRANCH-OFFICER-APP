// Camera + periodic frame analysis. Best-effort: a denied camera or dead proxy never stops the interview.
// Vision bills per frame on a clock, so it is slow by default and hard-capped (VITE_SARTHI_VISION_MS / _MAX).

const envMs = import.meta.env.VITE_SARTHI_VISION_MS;
const OFF = envMs === 'off' || Number(envMs) === 0;
// Floor of 15s: anything faster burns quota with no extra signal — the scene barely changes.
const CAPTURE_MS = Math.max(15000, Number(envMs) || 60000);
const MAX_FRAMES = Math.max(1, Number(import.meta.env.VITE_SARTHI_VISION_MAX) || 6);
const FRAME_W = 320;
const FRAME_H = 240;

let stream = null;
let videoEl = null;
let captureInterval = null;
let observations = [];
let startedAt = 0;

/** MM:SS since the interview started — the (Vision: 02:30) citation format. */
function stamp() {
  const s = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

const CONSTRAINTS = {
  video: { facingMode: 'user', width: 640, height: 480 },
  audio: false, // audio is handled separately by voice.js
};

export async function startCamera(videoElement) {
  try {
    stream = await navigator.mediaDevices.getUserMedia(CONSTRAINTS);
    videoElement.srcObject = stream;
    videoEl = videoElement;
    startedAt = Date.now();
    return true;
  } catch (e) {
    console.warn('[sarthi] camera not available:', e.message);
    return false;
  }
}

// Many phones cannot run two cameras at once, so the photo capture borrows it.
export function pauseCamera() {
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = null;
}

export async function resumeCamera() {
  if (!videoEl || stream) return false;
  try {
    const next = await navigator.mediaDevices.getUserMedia(CONSTRAINTS);
    // The interview may have ended while we waited.
    if (!videoEl || stream) { next.getTracks().forEach((t) => t.stop()); return false; }
    stream = next;
    videoEl.srcObject = stream;
    return true;
  } catch {
    return false;
  }
}

export function stopCamera() {
  if (stream) stream.getTracks().forEach((t) => t.stop());
  if (captureInterval) clearInterval(captureInterval);
  stream = null;
  videoEl = null;
  captureInterval = null;
}

/** Begin background frame analysis. Silent on every failure — this layer is a bonus, not a gate. */
export function startFrameCapture(visionUrl, onObservation) {
  if (captureInterval) clearInterval(captureInterval);
  if (OFF) return; // vision explicitly disabled; the interview and report work without it
  let sent = 0;
  captureInterval = setInterval(async () => {
    // Stop once the budget is spent, so a long interview cannot drain the day's quota.
    if (sent >= MAX_FRAMES) { clearInterval(captureInterval); captureInterval = null; return; }
    if (!videoEl || videoEl.readyState < 2) return;
    let base64;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = FRAME_W;
      canvas.height = FRAME_H;
      canvas.getContext('2d').drawImage(videoEl, 0, 0, FRAME_W, FRAME_H);
      base64 = canvas.toDataURL('image/jpeg', 0.6).split(',')[1];
    } catch {
      return;
    }

    // Counted at the point the request goes out, not on success: a failed call still cost quota.
    sent += 1;
    try {
      const res = await fetch(visionUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64 }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.observation) {
        const entry = { at: stamp(), timestamp: Date.now(), observation: data.observation.trim() };
        observations.push(entry);
        onObservation?.(entry);
      }
    } catch { /* frame capture is optional — stay quiet */ }
  }, CAPTURE_MS);
}

export function getObservations() {
  return observations;
}

export function resetObservations() {
  observations = [];
}
