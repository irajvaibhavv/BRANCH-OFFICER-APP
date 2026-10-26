// The customer's photo, taken by the BO when the customer is added, against a frame from the video call: is the person
// on the call the person the officer met? An AI comparison for the officer to look at — not biometric verification.
import { visionCompare } from './crossPd.js'; // extension so check:face runs in plain node

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

// Checked all through the call: at the start, then every FACE_EVERY_MS or at a new section, capped per PD so a long call
// cannot drain the vision budget. Always in the background — a check never holds up a turn.
export const FACE_EVERY_MS = Math.max(30000, Number(import.meta.env?.VITE_SARTHI_FACE_MS) || 90000);
export const FACE_MAX = Math.max(1, Number(import.meta.env?.VITE_SARTHI_FACE_MAX) || 8);

/** 'same' | 'different' | 'unsure' with a reason and `people` in the call frame; null when vision is down. */
export const compareFace = (filePhoto, callFrame) => visionCompare(filePhoto, callFrame,
  'LEFT: the photo a loan officer took of a loan applicant when the file was opened. RIGHT: a frame from a video call with'
  + ' whoever is answering the loan interview now. Is it the same person? Light, angle, camera quality, glasses, beard or'
  + ' hair may differ — judge the face (shape, features) only. If no face is clearly visible on either side, say UNSURE.'
  + ' Never comment on appearance, caste, religion or anything except whether the face matches.'
  + ' After that sentence add a last line: PEOPLE: <how many people are visible on the RIGHT>.').then((r) => {
  if (!r) return r;
  const people = r.reason.match(/PEOPLE:\s*(\d+)/i);
  return { ...r, reason: r.reason.replace(/\s*PEOPLE:[\s\S]*$/i, '').trim(), people: people ? Number(people[1]) : null };
});

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
  const flags = [];
  if (diff.length) {
    flags.push({ type: 'face_check', field: 'face', severity: 'high', detail: `The person on the video call did not look like the customer photo taken when the file was opened (${of(diff.length)})${diff[0].reason ? ` — ${diff[0].reason}` : ''}` });
  } else if (!checks.some((c) => c.verdict === 'same')) {
    const last = checks.at(-1);
    flags.push({ type: 'face_check', field: 'face', severity: 'low', detail: `Could not tell if the person on the call is the customer in the photo on file${last.reason ? ` — ${last.reason}` : ''}` });
  }
  const crowd = checks.filter((c) => c.people > 1);
  if (crowd.length) {
    flags.push({ type: 'face_check', field: 'face_others', severity: 'medium', detail: `Someone else was in the camera frame with the applicant (${of(crowd.length)}) — answers may have been prompted` });
  }
  return flags;
}

/** The one check the report shows beside the file photo: a mismatch if there was one, else the last match. */
export const faceSummary = (checks) => checks.find((c) => c.verdict === 'different')
  ?? checks.findLast((c) => c.verdict === 'same') ?? checks.at(-1) ?? null;

// Liveness: once per PD, at a random turn, Sarthi asks for one small action on camera. A frame before and one after go
// to the vision model side by side; a replayed or pre-recorded video, or a photo held up, cannot follow a random request.
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
