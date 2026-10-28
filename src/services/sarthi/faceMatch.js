// The customer's photo, taken by the BO when the customer is added, against a frame from the video call: is
// the person on the call the person the officer met? On-device face recognition for the officer to look at
// — not certified biometrics.
import { visionCompare } from './crossPdCheck.js'; // extension so check:face runs in plain node

export const faceKey = (caseId) => `bo_sarthi_face_${caseId}`;
export const callFrameKey = (pdId) => `bo_sarthi_face_call_${pdId}`;

/** { dataUrl, at, consent } or null. */
export function loadFace(caseId) {
  try { return JSON.parse(window.localStorage.getItem(faceKey(caseId))); } catch { return null; }
}

export function saveFace(caseId, dataUrl) {
  try {
    window.localStorage.setItem(faceKey(caseId), JSON.stringify({ dataUrl, at: new Date().toISOString(), consent: true }));
    return true;
  } catch {
    return false; // storage full — the PD runs without a face check
  }
}

// Checked throughout the call: at the start, then every FACE_EVERY_MS or at a new section, capped per PD. Runs
// on-device in the background and never holds up a turn.
export const FACE_EVERY_MS = Math.max(15000, Number(import.meta.env?.VITE_SARTHI_FACE_MS) || 30000);
export const FACE_MAX = Math.max(1, Number(import.meta.env?.VITE_SARTHI_FACE_MAX) || 20);

// On-device face recognition, not a chat model's opinion: face-api (tiny face detector, 68 landmarks, dlib ResNet 128-d
// descriptor), with the code deciding on descriptor distance. The descriptor is robust to angle and partial cover.
const FACE_API = '1.7.15'; // must match package.json — the weights are fetched for this exact build
const MODELS = `https://cdn.jsdelivr.net/npm/@vladmandic/face-api@${FACE_API}/model`;
// dlib's own cut-off is 0.6; webcam shots of one person sit around 0.3-0.5. Between the two is unsure.
export const SAME_BELOW = 0.55;
export const DIFFERENT_ABOVE = 0.65;

/** The verdict for a descriptor distance — pure, so check:face can pin the thresholds. */
export function matchVerdict(distance) {
  const d = Math.round(distance * 100) / 100;
  if (d < SAME_BELOW) return { verdict: 'same', reason: `Face recognition: match (distance ${d}, same person under ${SAME_BELOW})` };
  if (d > DIFFERENT_ABOVE) return { verdict: 'different', reason: `Face recognition: no match (distance ${d}, a different person over ${DIFFERENT_ABOVE})` };
  return { verdict: 'unsure', reason: `Face recognition: borderline (distance ${d}) — light or angle may be the cause` };
}

let faceApi = null;
const loadFaceApi = () => (faceApi ??= import('@vladmandic/face-api').then(async (f) => {
  await f.tf.ready();
  await Promise.all([
    f.nets.tinyFaceDetector.loadFromUri(MODELS),
    f.nets.faceLandmark68Net.loadFromUri(MODELS),
    f.nets.faceRecognitionNet.loadFromUri(MODELS),
  ]);
  return f;
}).catch((e) => { faceApi = null; throw e; }));

const toImage = (dataUrl) => new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => fail(new Error('image did not load')); i.src = dataUrl; });
const faces = async (f, dataUrl) => f.detectAllFaces(await toImage(dataUrl), new f.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.4 }))
  .withFaceLandmarks().withFaceDescriptors();
const fileDescriptors = new Map(); // the photo on file is read once per call, not at every check

/** 'same' | 'different' | 'unsure' with a reason, `people` in the call frame and `distance`; null when it cannot run. */
export async function compareFace(filePhoto, callFrame) {
  try {
    const f = await loadFaceApi();
    let file = fileDescriptors.get(filePhoto);
    if (!file) {
      const found = await faces(f, filePhoto);
      if (!found.length) throw new Error('no face found in the photo on file');
      file = found.reduce((a, b) => (b.detection.box.area > a.detection.box.area ? b : a)).descriptor;
      fileDescriptors.set(filePhoto, file);
    }
    const onCall = await faces(f, callFrame);
    if (!onCall.length) return { verdict: 'unsure', reason: 'No face clearly visible on the call', people: 0, distance: null };
    // With two people in frame, the applicant is the closer match; the other person is reported as `people`.
    const distance = Math.min(...onCall.map((x) => f.euclideanDistance(file, x.descriptor)));
    return { ...matchVerdict(distance), people: onCall.length, distance: Math.round(distance * 100) / 100 };
  } catch (e) {
    console.warn(`[sarthi] face recognition did not run: ${e?.message}`);
    return null;
  }
}

/** What Sarthi says when a check does not match. Fixed lines, said by the code — the model never raises it. */
export function faceLines(c) {
  const first = c.name.split(' ')[0];
  const hi = c.hi?.firstName ?? first;
  return {
    who: {
      text: `Maaf kijiye, camera mein jo dikh rahe hain woh file ki photo se match nahi kar rahe. Kya aap khud ${first} ji hain, ya aap kaun hain?`,
      speech: `माफ़ कीजिए, कैमरे में जो दिख रहे हैं, वो फ़ाइल की फ़ोटो से मैच नहीं कर रहे। क्या आप ख़ुद ${hi} जी हैं, या आप कौन हैं?`,
    },
    changed: {
      text: `Ek minute — abhi camera mein koi aur dikh rahe hain. Kya aap khud ${first} ji hain, ya aap kaun hain?`,
      speech: `एक मिनट। अभी कैमरे में कोई और दिख रहे हैं। क्या आप ख़ुद ${hi} जी हैं, या आप कौन हैं?`,
    },
    // Bad light, half a face, nobody in frame: fixed by moving, never a reason to stop.
    reframe: {
      text: 'Ek minute — aapka chehra theek se nahi dikh raha. Phone seedha pakadiye, chehra camera ke beech mein laaiye aur roshni ki taraf ho jaaiye.',
      speech: 'एक मिनट। आपका चेहरा ठीक से नहीं दिख रहा। फ़ोन सीधा पकड़िए, चेहरा कैमरे के बीच में लाइए, और रोशनी की तरफ़ हो जाइए।',
    },
  };
}

/** The report's flags from every face check of the call; none when they all matched. */
export function faceFlags(checks, cameraOn) {
  if (!checks.length) {
    return cameraOn ? [] : [{ type: 'face_check', field: 'face', severity: 'low', detail: 'Camera was off on the call — the customer photo on file could not be compared' }];
  }
  const of = (n) => `${n} of ${checks.length} checks during the call`;
  const diff = checks.filter((c) => c.verdict === 'different');
  const same = checks.filter((c) => c.verdict === 'same').length;
  const flags = [];
  // One noisy "different" among matches is noise, not an impostor: high needs most checks, and at least two.
  if (diff.length > same) {
    flags.push({ type: 'face_check', field: 'face', severity: diff.length >= 2 ? 'high' : 'medium', detail: `The person on the video call did not look like the customer photo taken when the file was opened (${of(diff.length)})${diff[0].reason ? ` — ${diff[0].reason}` : ''}` });
  } else if (diff.length) {
    flags.push({ type: 'face_check', field: 'face', severity: 'low', detail: `Face checks were mixed: ${same} matched the photo on file, ${diff.length} did not — look at the photos yourself` });
  } else if (!same) {
    const last = checks.at(-1);
    flags.push({ type: 'face_check', field: 'face', severity: 'low', detail: `Could not tell if the person on the call is the customer in the photo on file${last.reason ? ` — ${last.reason}` : ''}` });
  }
  const crowd = checks.filter((c) => c.people > 1);
  if (crowd.length) {
    flags.push({ type: 'face_check', field: 'face_others', severity: 'medium', detail: `Someone else was in the camera frame with the applicant (${of(crowd.length)}) — answers may have been prompted` });
  }
  return flags;
}

/** The one check the report shows beside the file photo: a mismatch if most checks were, else the last match. */
export function faceSummary(checks) {
  const count = (v) => checks.filter((c) => c.verdict === v).length;
  return (count('different') > count('same') ? checks.find((c) => c.verdict === 'different') : null)
    ?? checks.findLast((c) => c.verdict === 'same') ?? checks.at(-1) ?? null;
}

// Liveness: once per PD, at a random turn, Sarthi asks for one small action on camera. A frame before and
// one after go to the vision model side by side; a replayed or pre-recorded video, or a photo held up,
// cannot follow a random request.
export const LIVENESS = [
  { id: 'hand', text: "Ek chhota sa kaam — apna ek haath uthaakar camera ko dikhaiye, phir 'ho gaya' boliye.", speech: 'एक छोटा सा काम। अपना एक हाथ उठाकर कैमरे को दिखाइए, फिर हो गया बोलिए।', check: 'raising one open hand so the palm faces the camera' },
  { id: 'fingers', text: "Ek chhota sa kaam — camera ko teen ungliyaan dikhaiye, phir 'ho gaya' boliye.", speech: 'एक छोटा सा काम। कैमरे को तीन उँगलियाँ दिखाइए, फिर हो गया बोलिए।', check: 'holding up three fingers' },
  { id: 'ear', text: "Ek chhota sa kaam — ek haath se apna kaan chhooiye, phir 'ho gaya' boliye.", speech: 'एक छोटा सा काम। एक हाथ से अपना कान छूइए, फिर हो गया बोलिए।', check: 'touching one ear with a hand' },
  { id: 'turn', text: "Ek chhota sa kaam — apna sir thoda ek taraf ghumaiye, phir 'ho gaya' boliye.", speech: 'एक छोटा सा काम। अपना सिर थोड़ा एक तरफ़ घुमाइए, फिर हो गया बोलिए।', check: 'with the head clearly turned to one side compared with the LEFT frame' },
];

/** 'yes' | 'no' | 'unsure' with a reason; null when vision is down. Identical frames are a frozen feed, no model needed. */
export function checkLiveness(before, after, task) {
  if (before === after) return Promise.resolve({ verdict: 'no', reason: 'The two frames are identical — the video looks frozen or replayed' });
  return visionCompare(before, after,
    'LEFT: a frame from a live video call. RIGHT: a frame from the same call a few seconds after the person was asked out'
    + ` loud to do this: ${task.check}. Does the RIGHT frame show a real person doing it? If no person is visible, or it looks`
    + ' like a photo or a screen held up to the camera, answer NO.', ['YES', 'NO', 'UNSURE']);
}

/** The report's flag for the liveness check; none when it passed. */
export function livenessFlag(live, cameraOn) {
  if (!live) return cameraOn ? null : { type: 'liveness', field: 'liveness', severity: 'low', detail: 'Camera was off on the call — liveness was not checked' };
  const asked = `Asked on camera to do something (${live.task.check})`;
  if (!live.result) return { type: 'liveness', field: 'liveness', severity: 'low', detail: `${asked}; the frames could not be compared — the vision service was not reachable` };
  if (live.result.verdict === 'no') return { type: 'liveness', field: 'liveness', severity: 'high', detail: `${asked}; the frame after does not show it${live.result.reason ? ` — ${live.result.reason}` : ''}. The video may be pre-recorded, replayed or not live` };
  if (live.result.verdict === 'unsure') return { type: 'liveness', field: 'liveness', severity: 'low', detail: `${asked}; could not tell from the frame${live.result.reason ? ` — ${live.result.reason}` : ''}` };
  return null;
}
