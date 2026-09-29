// Photos the applicant takes mid-interview. Vision returns observations, never verdicts.
import { VISION_URL } from './agent';
import { visionFlag } from './photoCheck';

export const MAX_EDGE = 900;   // enough for a model to read a signboard
export const QUALITY = 0.62;   // keeps a photo near 60–90KB so several fit in localStorage

// `tips` are shown before the first shot, the way an officer on a PD tells them where to stand: framing, what must be
// visible, position, light.
export const PHOTO_ASKS = {
  shop: {
    label: 'the shop',
    ask: 'Ab apni dukaan ki ek photo bhejiye — andar ka hissa, stock ke saath.',
    speech: 'अब अपनी दुकान की एक फोटो भेजिए। अंदर का हिस्सा, स्टॉक के साथ।',
    hint: 'Dukaan ki photo',
    frame: 'Dukaan ka andar ka hissa, stock ke saath',
    tips: [
      'Counter ke peeche se, 3-4 kadam door khade hoiye',
      'Stock, rack aur counter — teeno frame mein aayein',
      'Board ya dukaan ka naam dikhe toh aur achha',
      'Light jalaiye; dhoop ya tube-light peeche nahi, saamne ho',
    ],
  },
  home: {
    label: 'the home',
    ask: 'Aur ghar ke bahar ki ek photo bhejiye, jahan aap rehte hain.',
    speech: 'और घर के बाहर की एक फोटो भेजिए, जहाँ आप रहते हैं।',
    hint: 'Ghar ki photo',
    frame: 'Ghar ka bahar ka hissa, jahan aap rehte hain',
    tips: [
      'Ghar ke bahar, gate se 5-6 kadam door khade hoiye',
      'Poora darwaza aur ghar ka saamne ka hissa frame mein ho',
      'Makaan number ya naam-plate dikhe toh aur achha',
      'Din ki roshni mein lijiye; phone seedha pakdiye',
    ],
  },
  // Sent on the applicant's own initiative from the message box, not because Sarthi asked.
  extra: { label: 'an extra photo', ask: '', speech: '', hint: 'Photo', frame: 'Jo dikhana hai, uski photo lijiye', tips: [] },
};

// Quality thresholds, measured on a 160px-wide greyscale copy. Calibration knobs: tune on real phones, not in theory.
export const QUALITY_LIMITS = { dark: 60, bright: 210, clipped: 0.3, flat: 14, blur: 4.5, backlight: 0.55 };

// Every line Sarthi says in the camera, as caption (`text`) and Devanagari for the Hindi voice (`speech`).
export const GUIDE = {
  dark: { text: 'Roshni kam hai — light jalaiye ya roshni ki taraf aaiye', speech: 'रोशनी कम है। लाइट जलाइए, या रोशनी की तरफ़ आइए।' },
  bright: { text: 'Roshni bahut tez hai — seedhi dhoop se hatiye', speech: 'रोशनी बहुत तेज़ है। सीधी धूप से हटिए।' },
  backlight: { text: 'Roshni peeche se aa rahi hai — ghoom kar roshni ko apne peeche kijiye', speech: 'रोशनी पीछे से आ रही है। घूम कर, रोशनी को अपने पीछे कीजिए।' },
  flat: { text: 'Kuch dikh nahi raha — camera dhaka toh nahi? Thoda peeche hatiye', speech: 'कुछ दिख नहीं रहा। कैमरा ढका तो नहीं? थोड़ा पीछे हटिए।' },
  blur: { text: 'Photo dhundhli hai — thoda peeche hatiye aur phone 2 second sthir rakhiye', speech: 'फ़ोटो धुंधली है। थोड़ा पीछे हटिए, और फ़ोन दो सेकंड स्थिर रखिए।' },
  move_closer: { text: 'Thoda aage aaiye — cheez badi dikhni chahiye', speech: 'थोड़ा आगे आइए, ताकि सब बड़ा और साफ़ दिखे।' },
  move_back: { text: 'Thoda peeche hatiye — poora frame mein aana chahiye', speech: 'थोड़ा पीछे हटिए, ताकि पूरा फ़्रेम में आए।' },
  tilted: { text: 'Phone seedha pakdiye', speech: 'फ़ोन सीधा पकड़िए।' },
  obstructed: { text: 'Beech mein kuch aa raha hai — saaf jagah se lijiye', speech: 'बीच में कुछ आ रहा है। साफ़ जगह से लीजिए।' },
  missing_shop: { text: 'Counter aur stock dikhna chahiye — camera us taraf kijiye', speech: 'काउंटर और सामान दिखना चाहिए। कैमरा उस तरफ़ कीजिए।' },
  missing_home: { text: 'Ghar ka darwaza aur saamne ka hissa dikhna chahiye', speech: 'घर का दरवाज़ा और सामने का हिस्सा दिखना चाहिए।' },
  wrong_shop: { text: 'Yeh dukaan nahi lag rahi — apni dukaan ki photo lijiye', speech: 'यह दुकान नहीं लग रही। अपनी दुकान की फ़ोटो लीजिए।' },
  wrong_home: { text: 'Yeh ghar ka bahar ka hissa nahi lag raha — ghar ke bahar se lijiye', speech: 'यह घर का बाहर का हिस्सा नहीं लग रहा। घर के बाहर से लीजिए।' },
  tips: { text: 'Photo lene se pehle yeh baatein dekh lijiye', speech: 'फ़ोटो लेने से पहले, ये बातें देख लीजिए।' },
  aim: { text: 'Frame ke andar rakhiye, phir button dabaiye', speech: 'सब कुछ फ़्रेम के अंदर रखिए, फिर बटन दबाइए।' },
  live_ok: { text: 'Theek hai — ab photo lijiye', speech: 'हाँ, अब ठीक है। फ़ोटो लीजिए।' },
  checking: { text: 'Photo dekh raha hoon…', speech: '' },
  good: { text: 'Photo saaf hai', speech: 'फ़ोटो साफ़ आई है। भेज दीजिए।' },
  retake: { text: 'Dobara lijiye', speech: 'एक बार दोबारा लीजिए।' },
};

/**
 * Brightness, contrast, backlight and sharpness of a video frame or image, in code. Returns { ok, issues: [{ key, text }] }.
 * Sharpness is the mean absolute Laplacian — low on motion blur and out-of-focus shots.
 */
export function checkQuality(source) {
  const w = 160;
  const sw = source.videoWidth || source.naturalWidth || source.width;
  const sh = source.videoHeight || source.naturalHeight || source.height;
  if (!sw || !sh) return { ok: false, issues: [] };
  const h = Math.max(1, Math.round((sh / sw) * w));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;
  const g = new Float32Array(w * h);
  let sum = 0; let clipped = 0; let centre = 0; let centreN = 0; let edge = 0; let edgeN = 0;
  for (let i = 0; i < w * h; i += 1) {
    const y = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
    g[i] = y; sum += y;
    if (y > 245) clipped += 1;
    const x = i % w; const r = Math.floor(i / w);
    const inCentre = x > w / 4 && x < (3 * w) / 4 && r > h / 4 && r < (3 * h) / 4;
    if (inCentre) { centre += y; centreN += 1; } else { edge += y; edgeN += 1; }
  }
  const mean = sum / g.length;
  let varSum = 0;
  for (const y of g) varSum += (y - mean) ** 2;
  const sd = Math.sqrt(varSum / g.length);
  let lap = 0; let lapN = 0;
  for (let r = 1; r < h - 1; r += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const i = r * w + x;
      lap += Math.abs(4 * g[i] - g[i - 1] - g[i + 1] - g[i - w] - g[i + w]);
      lapN += 1;
    }
  }
  const L = QUALITY_LIMITS;
  const keys = [];
  if (mean < L.dark) keys.push('dark');
  else if (mean > L.bright || clipped / g.length > L.clipped) keys.push('bright');
  else if (edge / edgeN > 140 && centre / centreN < (edge / edgeN) * L.backlight) keys.push('backlight');
  // Bad light alone explains a flat frame — "camera dhaka hai?" would be the wrong advice then.
  if (keys.length) { /* light first */ } else if (sd < L.flat) keys.push('flat');
  else if (lap / lapN < L.blur) keys.push('blur');
  return { ok: keys.length === 0, issues: keys.map((key) => ({ key, ...GUIDE[key] })) };
}

const FRAMING = ['ok', 'move_closer', 'move_back', 'tilted', 'obstructed', 'missing', 'wrong'];

/**
 * Framing, read by the vision model — what code cannot see: too far, too close, the counter out of frame, not a shop.
 * The model only picks a code; every word said to them is ours (GUIDE). Null when no vision service answers, and the
 * shot then stands on the code check alone.
 */
export async function framingCheck(dataUrl, kind) {
  const subject = kind === 'shop'
    ? 'a shop photo for a loan check: the counter, goods/stock on shelves and ideally the shop board should be visible'
    : 'a photo of the outside of a home for a loan check: the front door and front of the house should be visible';
  const prompt = `This should be ${subject}. Reply with exactly ONE word from this list and nothing else:
ok — the subject is clearly visible and fills a good part of the frame
move_closer — the subject is there but too small / too far away
move_back — too close, only part of it is visible
tilted — the camera is badly tilted
obstructed — something (a hand, a person, a vehicle) blocks the view
missing — the right place, but the ${kind === 'shop' ? 'counter and stock are' : 'door and front are'} not in view
wrong — this is clearly not ${kind === 'shop' ? 'a shop' : 'the outside of a home'}
Judge framing only, not the light or blur. If unsure, say ok.`;
  try {
    const res = await fetch(VISION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: dataUrl.split(',')[1], prompt }),
    });
    if (!res.ok) return null;
    const word = String((await res.json()).observation ?? '').toLowerCase().match(/[a-z_]+/)?.[0];
    if (!FRAMING.includes(word)) return null;
    if (word === 'ok') return { ok: true, issues: [] };
    const key = word === 'missing' || word === 'wrong' ? `${word}_${kind}` : word;
    return { ok: false, issues: [{ key, ...GUIDE[key] }] };
  } catch {
    return null;
  }
}

/** Shrink and re-encode in the browser, so a 4MB camera shot does not blow the storage quota. */
export function downscale(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', QUALITY));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image')); };
    img.src = url;
  });
}

function prompt(kind, caseData) {
  const what = kind === 'shop'
    ? `a photograph the applicant submitted as their business premises. They say they run: ${caseData.business} (${caseData.businessName}) in ${caseData.area}.`
    : kind === 'home'
      ? `a photograph the applicant submitted as the outside of their home in ${caseData.area}.`
      : `a photograph the applicant chose to send during their loan interview. They say they run: ${caseData.business || 'a business'} in ${caseData.area || 'an area not yet stated'}.`;

  return `You are shown ${what}

Describe ONLY what is visible, in 1-2 sentences:
- What kind of place is this (shop, workshop, office, home, street, bare room, outdoors)?
- Any goods, stock, equipment, signage or shutter visible?
- Is anyone else present?
- Does what you see fit, or not fit, what they said they do?
- If it looks like a photo of a screen or a print, a screenshot, a stock photo or a computer-generated image, say so plainly.

Rules:
- Report only what is in the image. Never guess at income, wealth or character.
- If the image is too dark, blurred or close-cropped to tell, say exactly that.
- Do not say whether the loan should be approved.`;
}

// aiChecked: false when no proxy, so the report never implies the photo was read.
export async function analysePhoto({ dataUrl, kind, caseData, provenance = null }) {
  const at = new Date().toISOString();
  const base = { kind, at, label: PHOTO_ASKS[kind]?.label ?? kind, dataUrl, provenance };

  try {
    const res = await fetch(VISION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: dataUrl.split(',')[1], prompt: prompt(kind, caseData) }),
    });
    if (!res.ok) throw new Error(`vision ${res.status}`);
    const data = await res.json();
    if (!data.observation) throw new Error('no observation');
    const observation = data.observation.trim();
    const flag = visionFlag(observation);
    const withFlag = flag && provenance ? { ...provenance, flags: [...provenance.flags, flag] } : provenance;
    return { ...base, provenance: withFlag, aiChecked: true, observation };
  } catch {
    return {
      ...base,
      aiChecked: false,
      observation: null,
      note: 'Photograph is on file but was not machine-read — no vision service was reachable. Officer should look at it.',
    };
  }
}
