// Is anyone in front of the camera? On-device face detection (MediaPipe BlazeFace short-range), checked every second at
// no API cost — the vision-model face check runs every 90s and is far too slow to notice someone walking off.
import { liveVideo } from './video';

const VERSION = '1.1.0'; // must match package.json — the wasm is fetched for this exact build
const WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/wasm`;
const MODEL = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';

let detector = null;
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

/** true / false, or null when it cannot tell (no detector, camera off or lent to the photo capture). */
export function faceInFrame() {
  const video = liveVideo();
  if (!detector || !video) return null;
  try {
    return detector.detectForVideo(video, performance.now()).detections.length > 0;
  } catch {
    return null;
  }
}

// Fixed lines, said by the code. Gender-neutral, so `gendered()` has nothing to change.
export const AWAY_LINES = {
  where: {
    text: 'Aap kahan chale gaye? Koi pareshani hai kya? Kripya camera ke saamne aa jaiye.',
    speech: 'आप कहाँ चले गए? कोई परेशानी है क्या? कृपया कैमरे के सामने आ जाइए।',
  },
  back: {
    text: 'Ji, aap aa gaye. Sawaal phir se sun lijiye.',
    speech: 'जी, आप आ गए। सवाल फिर से सुन लीजिए।',
  },
};
