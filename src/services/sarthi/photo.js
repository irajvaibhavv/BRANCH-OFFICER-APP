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
  // At home, after the outside: the main room. What a family lives with is part of a PD (living.js) — always skippable.
  home_inside: {
    label: 'inside the home',
    ask: 'Agar theek lage toh ghar ke andar ki ek photo bhi bhejiye — jahan aap log baithte hain.',
    speech: 'अगर ठीक लगे, तो घर के अंदर की एक फ़ोटो भी भेजिए। जहाँ आप लोग बैठते हैं।',
    hint: 'Ghar ke andar ki photo',
    frame: 'Main kamra, darwaze se — jahan sab baithte hain',
    tips: [
      'Darwaze par khade hokar main kamra frame mein lijiye',
      'Kisi ka chehra zaroori nahi — kamra dikhna chahiye',
      'Light jala lijiye',
    ],
  },
  // The bill book or register, at the shop: a book written over months does not look like one filled in last night.
  records: {
    label: 'the bill book / register',
    ask: 'Apni bill book ya hisaab ka register kholiye — aaj ka ya sabse naya page — aur uski photo bhejiye.',
    speech: 'अपनी बिल बुक या हिसाब का रजिस्टर खोलिए। आज का, या सबसे नया पेज। और उसकी फ़ोटो भेजिए।',
    hint: 'Bill book ki photo',
    frame: 'Bill book ka aaj ka page — tareekh aur bill number saaf dikhein',
    tips: [
      'Bill book ya register ka aaj ka (ya sabse naya) page kholiye',
      'Page ko seedha rakh ke upar se photo lijiye',
      'Tareekh, bill number aur rakam saaf padhi ja sakein',
      'Light page pe ho, apni parchhai na pade',
    ],
  },
  // Live challenges (challenges.js): Sarthi says the task itself, so `ask` is empty; `vision` is what the photo must show.
  records_back: {
    label: 'an older page of the bill book', ask: '', speech: '', hint: 'Purana bill', frame: 'Purane bill ki tareekh aur rakam saaf dikhe',
    tips: ['Jo tareekh boli gayi, us din ke aas-paas ka page kholiye', 'Upar se seedha photo lijiye', 'Tareekh aur rakam padhi ja sake'],
    vision: 'an older page of their bill book, opened at a date Sarthi named during the call. Read the date(s) on the page, whether bill numbers run in sequence with the latest page, and whether this page looks as used as a weeks-old page should (carbon marks, wear, different pens) or as fresh as one written recently.',
  },
  shelf: {
    label: 'an item from a shelf Sarthi picked', ask: '', speech: '', hint: 'Rack ka saamaan', frame: 'Saamaan haath mein, rack peeche dikhe',
    tips: ['Jo rack bola gaya, wahan se koi bhi ek saamaan uthaiye', 'Saamaan haath mein, peeche rack dikhe', 'MRP ya label dikhe toh achha'],
    vision: 'an item the applicant picked from a shelf Sarthi named, held in hand with the rack behind it. Name the item and read its MRP or label if visible; describe how full the rack is, and whether the stock looks long-stocked (dust, mixed old and new packs, price stickers) or freshly arrived (everything new, cartons, uniform packs).',
  },
  purchase_bill: {
    label: 'a supplier / distributor bill', ask: '', speech: '', hint: 'Supplier ka bill', frame: 'Supplier ka naam, tareekh aur rakam dikhe',
    tips: ['Pichhli baar jo maal aaya, uska bill nikaliye', 'Supplier ka naam, tareekh aur kul rakam frame mein ho', 'Seedha upar se photo lijiye'],
    vision: 'a purchase bill from their supplier or distributor. Read the supplier name, the bill date, the buyer name if printed, the total amount and the kind of goods, and say if any of these cannot be read.',
  },
  qr: {
    label: 'the payment QR at the shop', ask: '', speech: '', hint: 'QR code', frame: 'Poora QR aur uske neeche ka naam dikhe',
    tips: ['Dukaan pe laga payment QR dikhaiye', 'QR ke saath uske neeche likha naam bhi frame mein ho'],
    vision: 'the payment QR code displayed at their shop. Read the name or business name printed with the QR and the payment app; say whether it is displayed at a counter or shown on a phone or paper in hand.',
  },
  utility_bill: {
    label: 'a utility bill at home', ask: '', speech: '', hint: 'Bijli ka bill', frame: 'Naam aur pata saaf dikhe',
    tips: ['Bijli ya paani ka bill nikaliye', 'Naam, pata aur bill ki tareekh frame mein ho', 'Seedha upar se photo lijiye'],
    vision: 'a utility bill from their home. Read the name, the address and the bill date/period, and say if any cannot be read.',
  },
  shop_document: {
    label: 'a paper for the shop (rent agreement / licence / Udyam / bill)', ask: '', speech: '', hint: 'Dukaan ka kaagaz', frame: 'Kaagaz pe naam aur pata saaf dikhe',
    tips: ['Rent agreement, shop licence, Udyam ya dukaan ka bijli bill — koi bhi ek', 'Jis panne pe naam aur pata ho, woh kholiye', 'Seedha upar se photo lijiye'],
    vision: 'a document for their shop — a rent agreement, shop and establishment licence, Udyam certificate, trade licence or the electricity bill for the shop. Say which document it is, and read the name(s) on it, the address and any date.',
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
  missing_home_inside: { text: 'Poora kamra dikhna chahiye — thoda peeche hatiye', speech: 'पूरा कमरा दिखना चाहिए। थोड़ा पीछे हटिए।' },
  wrong_home_inside: { text: 'Yeh ghar ke andar ka kamra nahi lag raha', speech: 'यह घर के अंदर का कमरा नहीं लग रहा।' },
  missing_records: { text: 'Likha hua page dikhna chahiye — tareekh aur rakam wala', speech: 'लिखा हुआ पेज दिखना चाहिए। तारीख़ और रकम वाला।' },
  wrong_records: { text: 'Yeh bill book ya register nahi lag raha — wahi kholiye', speech: 'यह बिल बुक या रजिस्टर नहीं लग रहा। वही खोलिए।' },
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
const FRAMING_SUBJECT = {
  shop: { should: 'a shop photo for a loan check: the counter, goods/stock on shelves and ideally the shop board should be visible', missing: 'the counter and stock are', what: 'a shop' },
  home: { should: 'a photo of the outside of a home for a loan check: the front door and front of the house should be visible', missing: 'the door and front are', what: 'the outside of a home' },
  home_inside: { should: 'a photo of the main room inside a home for a loan check: the room and what is in it should be visible', missing: 'the room is', what: 'the inside of a home' },
  records: { should: 'an open bill book or account register for a loan check: a page of written or printed bills with dates and amounts should be readable', missing: 'the written page is', what: 'a bill book, register or bills' },
};

export async function framingCheck(dataUrl, kind) {
  const subject = FRAMING_SUBJECT[kind];
  if (!subject) return null; // challenge photos: the code check alone
  const prompt = `This should be ${subject.should}. Reply with exactly ONE word from this list and nothing else:
ok — the subject is clearly visible and fills a good part of the frame
move_closer — the subject is there but too small / too far away
move_back — too close, only part of it is visible
tilted — the camera is badly tilted
obstructed — something (a hand, a person, a vehicle) blocks the view
missing — the right thing, but ${subject.missing} not in view
wrong — this is clearly not ${subject.what}
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
  if (kind === 'records') return recordsPrompt(caseData);
  if (kind === 'home' || kind === 'home_inside') return livingPrompt(kind, caseData);
  if (PHOTO_ASKS[kind]?.vision) {
    return `You are shown ${PHOTO_ASKS[kind].vision} The applicant is ${caseData.name}; they say they run: ${caseData.business} (${caseData.businessName}) in ${caseData.area}.

Describe ONLY what is visible, in 2-3 short sentences. If it looks like a photo of a screen or a print, a stock photo or a
computer-generated image, say so plainly. Never conclude it is fake or genuine, never guess at income, and do not say
whether the loan should be approved.${NAMES_RULE}`;
  }
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
- Do not say whether the loan should be approved.${kind === 'shop' ? STOCK_RULE : ''}${NAMES_RULE}`;
}

// Names read off a photo are compared across PDs (crossPd.js): two applicants whose QR, board or bill book carry the
// same name or GSTIN were shown the same shop.
const NAMES_RULE = `
Then, on a separate LAST line, write "NAMES:" followed by every shop name, person name, GSTIN or UPI ID you can read in
the image, separated by ";" — exactly as written. Not product or brand names printed on goods. Write "NAMES: none" if
you can read none.`;

// The shop photo also returns a rough value of the stock in view, compared in code with the stock they stated (stockCheck).
const STOCK_RULE = `
Then, on its own line, write "STOCK:" followed by ONE line of JSON for the goods visible in this photo only:
{"fullness":"empty|sparse|half|full|packed|unclear","value_low":<rupees or null>,"value_high":<rupees or null>}
value_low / value_high: a wide range for what the visible stock would cost at retail in India — the one value you may
estimate; it is about the goods, never the person. null if you cannot tell.`;

/** Stated stock against the shop photo's rough estimate: 'more' / 'less' only when far outside it (one photo, one angle). */
export function stockCheck(stock, declared) {
  const hi = Number(stock?.value_high) || 0;
  const lo = Number(stock?.value_low) || 0;
  const said = Number(declared) || 0;
  if (!hi || !said) return null;
  const status = said > hi * 3 ? 'more' : lo && said < lo / 3 ? 'less' : 'fits';
  return { status, low: lo || null, high: hi, declared: said, fullness: stock.fullness ?? null };
}

// Home photos also return what the living standard is read from — only what is visible, scored in code (living.js).
const LIVING_RULE = `
Then, on its own line, write "LIVING:" followed by ONE line of JSON with only what you can SEE (leave a list empty, or a
value "unclear", rather than guess):
{"house":"kachha|semi_pucca|pucca|unclear","floors":<number or null>,"vehicles":["two_wheeler","car","auto_rickshaw","bicycle","tractor"],"items":["tv","sofa","fridge","ac","washing_machine","cooler","computer","dining_table","almirah","bed"]}
kachha = mud, thatch or tin; semi_pucca = brick walls with a tin/asbestos roof or unplastered; pucca = plastered brick or concrete.`;

/** Splits the vision reply into the observation, the names it read (NAMES:), a home's LIVING: and a shop's STOCK: JSON. */
export function splitNames(text) {
  let rest = String(text ?? '');
  const json = (tag) => {
    const l = rest.match(new RegExp(`^\\s*${tag}:\\s*(\\{.*\\})\\s*$`, 'im'));
    if (!l) return null;
    rest = rest.replace(l[0], '');
    try { return JSON.parse(l[1]); } catch { return null; }
  };
  const living = json('LIVING');
  const stock = json('STOCK');
  const m = rest.match(/\s*NAMES:\s*(.*)\s*$/i);
  if (!m) return { observation: rest.trim(), names: [], living, stock };
  const names = /^none\.?$/i.test(m[1].trim()) ? [] : m[1].split(';').map((n) => n.trim()).filter(Boolean);
  return { observation: rest.slice(0, m.index).trim(), names, living, stock };
}

function livingPrompt(kind, caseData) {
  const what = kind === 'home'
    ? `the outside of their home in ${caseData.area}`
    : 'the main room inside their home';
  return `You are shown a photograph a loan applicant sent as ${what}. They say they run: ${caseData.business} (${caseData.businessName}).

Describe ONLY what is visible, in 1-2 sentences: the kind of house or room, and any vehicles, furniture or appliances.
If it looks like a photo of a screen or a print, a stock photo or a computer-generated image, say so plainly.

Rules:
- Report only what is in the image. Never guess at income, wealth, caste, religion or character, and never comment on people.
- If the image is too dark, blurred or close-cropped to tell, say exactly that.
- Do not say whether the loan should be approved.${LIVING_RULE}${NAMES_RULE}`;
}

// What separates a book kept for months from one written up for the PD — the officer weighs it, the model only describes.
function recordsPrompt(caseData) {
  return `You are shown a photograph the applicant submitted as their bill book or account register. They say they run: ${caseData.business} (${caseData.businessName}).

Describe ONLY what is visible, in 2-4 short sentences:
- What it is: carbon bill book, register, loose bills, printed/computer bills, a phone app screen.
- The latest date you can read, and the bill numbers if visible — do they run in sequence?
- Roughly how many entries are on the page, and whether the shop name or GSTIN printed on it matches "${caseData.businessName}".
- Signs of use over time (worn or folded pages, different pens or handwriting, corrections, carbon marks) — or signs it was
  written in one sitting (a brand-new book, same pen and same neat hand on every entry, round amounts, no corrections).
- If it looks like a photo of a screen or a print, or a computer-generated image, say so plainly.

Rules:
- Report only what is in the image. If the writing cannot be read, say exactly that.
- Never conclude it is fake or genuine; describe what you see. Do not say whether the loan should be approved.${NAMES_RULE}`;
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
    const { observation, names, living, stock } = splitNames(data.observation);
    const flag = visionFlag(observation);
    const withFlag = flag && provenance ? { ...provenance, flags: [...provenance.flags, flag] } : provenance;
    return { ...base, provenance: withFlag, aiChecked: true, observation, names, ...(living ? { living } : {}), ...(stock ? { stock } : {}) };
  } catch {
    return {
      ...base,
      aiChecked: false,
      observation: null,
      note: 'Photograph is on file but was not machine-read — no vision service was reachable. Officer should look at it.',
    };
  }
}
