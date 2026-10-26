// Is anyone in front of the camera? On-device face detection (MediaPipe BlazeFace short-range), checked every second at
// no API cost — the vision-model face check runs every 90s and is far too slow to notice someone walking off.
import { liveVideo } from './video';

const VERSION = '1.1.0'; // must match package.json — the wasm is fetched for this exact build
const WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/wasm`;
const MODEL = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';

// Knob: BlazeFace still finds a face behind a hand at ~0.5-0.7; a clear face scores ~0.85+. Raise if a covered face
// passes, lower if a dim room reads as "away" — the score is logged with every ask.
const MIN_SCORE = 0.75;

let detector = null;
let lastScore = 0; // best face score in the latest frame, logged when Sarthi asks
export const faceScore = () => lastScore;
let loading = null;

/** Loads once; resolves false when the detector cannot load (offline, old phone) — the call then runs without it. */
export function loadFaceDetector() {
  loading ??= import('@mediapipe/tasks-vision')
    .then(async ({ FilesetResolver, FaceDetector }) => {
      const files = await FilesetResolver.forVisionTasks(WASM);
      detector = await FaceDetector.createFromOptions(files, {
        baseOptions: { modelAssetPath: MODEL },
        runningMode: 'VIDEO',
        minDetectionConfidence: 0.5,
      });
      return true;
    })
    .catch((e) => { console.warn(`[sarthi] face detector not loaded (${e?.message}) — no "kahan chale gaye" check`); return false; });
  return loading;
}

/** true when a face is clearly visible (not covered or turned away) / false, or null when it cannot tell (no detector, camera off or lent to the photo capture). */
export function faceInFrame() {
  const video = liveVideo();
  if (!detector || !video) return null;
  try {
    const scores = detector.detectForVideo(video, performance.now()).detections.map((d) => d.categories?.[0]?.score ?? 0);
    lastScore = Math.max(0, ...scores);
    return lastScore >= MIN_SCORE;
  } catch {
    return null;
  }
}

// Fixed lines, said by the code. Gender-neutral, so `gendered()` has nothing to change.
export const AWAY_LINES = {
  where: {
    text: 'Aap camera mein dikh nahi rahe. Kahan chale gaye, koi pareshani hai kya? Kripya chehra camera ke saamne laaiye.',
    speech: 'आप कैमरे में दिख नहीं रहे। कहाँ चले गए, कोई परेशानी है क्या? कृपया चेहरा कैमरे के सामने लाइए।',
  },
  back: {
    text: 'Ji, aap aa gaye. Sawaal phir se sun lijiye.',
    speech: 'जी, आप आ गए। सवाल फिर से सुन लीजिए।',
  },
};
