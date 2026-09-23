/*
  SARTHI — camera + background frame analysis.

  One-way video: the borrower's camera runs in the browser, a frame is grabbed every 15s and sent
  to Gemini Vision through the same proxy. Observations are stored silently and only ever surface
  in the officer's report — the borrower is never shown them. Everything here is best effort: a
  denied camera or a dead proxy must not stop the interview.
*/

const CAPTURE_MS = 15000;
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

export async function startCamera(videoElement) {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: 640, height: 480 },
      audio: false, // audio is handled separately by voice.js
    });
    videoElement.srcObject = stream;
    videoEl = videoElement;
    startedAt = Date.now();
    return true;
  } catch (e) {
    console.warn('[sarthi] camera not available:', e.message);
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
  captureInterval = setInterval(async () => {
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
