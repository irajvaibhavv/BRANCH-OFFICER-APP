// Offline document checks (Aadhaar Verhoeff, PAN structure + surname initial). Not eKYC.
/* ---------------------------------------------------------------- Name */

const NAME_FILLER = new Set(['ji', 'mr', 'mrs', 'shri', 'sri', 'smt', 'sir', 'bhai', 'main', 'mai', 'mera', 'meri', 'naam',
  'hai', 'hoon', 'hu', 'haan', 'ha', 'my', 'name', 'is', 'i', 'am', 'im', 'ka', 'ki', 'se', 'aur', 'and']);

const nameTokens = (s) => String(s ?? '').toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/)
  .filter((t) => t.length >= 2 && !NAME_FILLER.has(t));

function oneEditApart(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0; let j = 0; let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i += 1; j += 1; continue; }
    edits += 1;
    if (edits > 1) return false;
    if (a.length > b.length) i += 1; else if (b.length > a.length) j += 1; else { i += 1; j += 1; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/**
 * Does the name they said match the name on file? true / false, or null when it cannot tell
 * (e.g. Devanagari from speech recognition). Any shared name part counts; one typo is tolerated.
 */
export function namesMatch(stated, onFile) {
  const a = nameTokens(stated);
  const b = nameTokens(onFile);
  if (!a.length || !b.length) return null;
  return a.some((x) => b.some((y) => x === y
    || (Math.min(x.length, y.length) >= 4 && (oneEditApart(x, y) || x.startsWith(y) || y.startsWith(x)))));
}

/* ---------------------------------------------------------------- Aadhaar */

// Verhoeff dihedral group tables — the checksum printed on every Aadhaar.
const D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

/** True when the 12 digits satisfy the Verhoeff check digit. */
export function verhoeff(digits) {
  let c = 0;
  [...digits].reverse().forEach((d, i) => { c = D[c][P[(i + 1) % 8][Number(d)]]; });
  return c === 0;
}

export const maskAadhaar = (v = '') => {
  const d = v.replace(/\D/g, '');
  return d.length === 12 ? `XXXX XXXX ${d.slice(8)}` : v;
};

export function validateAadhaar(input = '') {
  const digits = input.replace(/\D/g, '');
  const checks = [];

  const lengthOk = digits.length === 12;
  checks.push({ label: 'Twelve digits', pass: lengthOk, detail: lengthOk ? 'Correct length' : `Got ${digits.length} digits` });

  const startOk = lengthOk && !'01'.includes(digits[0]);
  if (lengthOk) checks.push({ label: 'Valid opening digit', pass: startOk, detail: startOk ? 'Does not start with 0 or 1' : 'Aadhaar never starts with 0 or 1' });

  const sumOk = lengthOk && verhoeff(digits);
  if (lengthOk) checks.push({ label: 'Verhoeff checksum', pass: sumOk, detail: sumOk ? 'Check digit is consistent' : 'Check digit does not match — this number was not issued' });

  const ok = lengthOk && startOk && sumOk;
  return { type: 'aadhaar', ok, value: digits, masked: maskAadhaar(digits), checks };
}

/* ---------------------------------------------------------------- PAN */

const PAN_SHAPE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const PAN_HOLDER = {
  P: 'Individual', C: 'Company', H: 'Hindu Undivided Family', F: 'Partnership firm',
  A: 'Association of persons', T: 'Trust', B: 'Body of individuals',
  L: 'Local authority', J: 'Artificial juridical person', G: 'Government',
};

export const maskPan = (v = '') => (v.length === 10 ? `${v.slice(0, 3)}XXXX${v.slice(7)}` : v);

export function validatePan(pan = '', name = '') {
  const value = pan.toUpperCase().replace(/\s/g, '');
  const checks = [];

  const shapeOk = PAN_SHAPE.test(value);
  checks.push({ label: 'PAN format', pass: shapeOk, detail: shapeOk ? 'Five letters, four digits, one letter' : 'Does not match the PAN pattern' });

  let holder = null;
  if (shapeOk) {
    holder = PAN_HOLDER[value[3]] ?? null;
    checks.push({
      label: 'Holder type',
      pass: !!holder,
      detail: holder ? `4th character "${value[3]}" — ${holder}` : `4th character "${value[3]}" is not a valid holder type`,
    });

    // For an individual the 5th character is the first letter of the surname.
    const surname = name.trim().split(/\s+/).slice(1).pop() || name.trim().split(/\s+/)[0] || '';
    const initial = surname[0]?.toUpperCase();
    if (value[3] === 'P' && initial) {
      const match = value[4] === initial;
      checks.push({
        label: 'Surname initial',
        pass: match,
        detail: match
          ? `5th character "${value[4]}" matches ${surname}`
          : `5th character is "${value[4]}" but the surname given is ${surname} — this PAN belongs to someone else`,
      });
    }
  }

  const ok = checks.every((c) => c.pass);
  return { type: 'pan', ok, value, masked: maskPan(value), holder, checks };
}

/** Route to the right validator. `kind` is 'pan' | 'aadhaar'. */
export function validateId(kind, value, name) {
  return kind === 'aadhaar' ? validateAadhaar(value) : validatePan(value, name);
}

/* ---------------------------------------------------------------- Foreign IDs */

// No Indian ID has 13 digits (Aadhaar 12, VID 16), so this shape is a CNIC, dashed or not.
const CNIC = /(?:^|\D)(\d{5})[-\s]?(\d{7})[-\s]?(\d)(?!\d)/;

/** A foreign national ID given instead of Aadhaar/PAN, as an identity record; null if none. */
export function detectForeignId(text = '') {
  const m = CNIC.exec(String(text));
  if (!m) return null;
  return {
    type: 'foreign',
    label: 'Pakistani CNIC',
    ok: false,
    value: m.slice(1).join('-'),
    masked: `${m[1]}-XXXXXXX-${m[3]}`,
    checks: [{ label: 'Indian identity document', pass: false, detail: 'This is the format of a Pakistani CNIC, not an Aadhaar or PAN' }],
  };
}

// Saying they live in / are a citizen of a country India cannot lend into — no document needed to stop the PD.
// Needs the country AND a living/belonging verb, and not "border ke paas" (a Punjab or Rajasthan resident says that).
const FOREIGN_COUNTRY = /\b(pakistan|bangladesh|afghanistan)(i|ee)?\b|पाकिस्तान|बांग्लादेश|बांगलादेश|अफ़गानिस्तान|अफगानिस्तान/i;
const LIVES_THERE = /\b(rehta|rehti|rehte|rahta|rahti|rahte|rehna|rahna|reh raha|rah raha|se hoon|se hu|se hun|ka hoon|ka hu|ki hoon|ka hun|citizen|nagrik|naagrik|live|living|from|wala hoon|wali hoon|ka rehne wala|ki rehne wali)\b|रहता|रहती|रहते|से हूँ|से हूं|का हूँ|का हूं|नागरिक/i;
const NEAR_ONLY = /\b(border|seema|ke paas|ke pass|nazdeek|najdeek)\b|बॉर्डर|सीमा|के पास/i;

/** "Pakistan mein rehta hoon" → the country; null for anything else, including "Pakistan border ke paas". */
export function detectForeignResidence(text = '') {
  const s = String(text);
  const m = FOREIGN_COUNTRY.exec(s);
  if (!m || !LIVES_THERE.test(s) || NEAR_ONLY.test(s)) return null;
  const raw = m[0].toLowerCase();
  const country = /pak|पाक/.test(raw) ? 'Pakistan' : /bang|बांग/.test(raw) ? 'Bangladesh' : 'Afghanistan';
  return { country };
}

// A failed or foreign document outranks a passing one, so the report can never show only the good news.
export function pickIdentity({ foreignId, aadhaarCheck, panCheck } = {}) {
  return foreignId ?? [panCheck, aadhaarCheck].find((c) => c && !c.ok) ?? panCheck ?? aadhaarCheck ?? null;
}

/** A line the report can state, with nothing inferred beyond the checks that actually ran. */
export function identitySummary(id) {
  if (!id) return 'No identity document was captured.';
  const label = id.label ?? (id.type === 'aadhaar' ? 'Aadhaar' : 'PAN');
  const failed = id.checks.filter((c) => !c.pass);
  if (id.ok) return `${label} ${id.masked} passed every offline check (${id.checks.map((c) => c.label.toLowerCase()).join(', ')}). Not verified against UIDAI/NSDL records.`;
  return `${label} ${id.masked} failed: ${failed.map((c) => c.detail).join('; ')}.`;
}

/* ---------------------------------------------------------------- Applicant present */
// A PD is only a PD with the applicant on the call. When someone else answers, the code (not the model) asks who they
// are, asks them to call the applicant, and ends the call politely if the applicant is not there.

/** "Main Raj hoon" → "Raj", for when extraction returned nothing on the name question. */
export function nameFromWords(text = '') {
  const m = /(?:mera naam|my name is|naam hai|i am|i'm|main|mai|mein)\s+([a-z]{2,})/i.exec(String(text));
  const name = m?.[1];
  return name && !NAME_FILLER.has(name.toLowerCase()) ? name : null;
}

/** Their answer to "aap unke kya lagte hain?", as a speaker_relation option. */
export function relationOf(text = '') {
  const s = String(text);
  if (/\b(beta|beti|son|daughter|pati|husband|patni|wife|bhai|brother|behen|bahen|sister|maa|mummy|mother|papa|father|devar|bahu|damaad|nati|pota|family|rishtedar)\b|बेटा|बेटी|पति|पत्नी|भाई|बहन|माँ|पापा|बहू/i.test(s)) return 'family';
  if (/\b(naukar|employee|staff|helper|worker|kaam karta|kaam karti|munim)\b/i.test(s)) return 'employee';
  if (/\b(agent|dsa|dalal|broker)\b/i.test(s)) return 'agent';
  return 'other';
}

// "Bahar hai" / "abhi nahi" ends the call; checked before yes, since "haan, woh bahar hai" means she is not here.
const NOT_HERE = /\b(bahar|baahar|nahi|nahin|nhi|not|outside|baad mein|later|busy|kaam pe|market|bazaar|mandi|gaon|mandir|kal|no)\b|बाहर|नहीं|बाद में|कल/i;
const COMING = /\b(haan|han|ha|ji|yes|bulata|bulati|bula raha|bula rahi|bulaunga|aa gayi|aa gaye|aa rahi|aa rahe|yahin|yahan|ok|okay|theek)\b|हाँ|हां|बुला|आ गई|आ रही|यहीं/i;

/** Will the applicant join now? Anything unclear counts as no — the PD waits for them. */
export function applicantComing(text = '') {
  const s = String(text);
  return !NOT_HERE.test(s) && COMING.test(s);
}

export function presenceLines(c) {
  const first = c.name.split(' ')[0];
  const hi = c.hi?.firstName ?? first;
  return {
    relation: {
      text: `Yeh application ${first} ji ke naam se hai. Aap unke kya lagte hain?`,
      speech: `यह एप्लीकेशन ${hi} जी के नाम से है। आप उनके क्या लगते हैं?`,
    },
    call: {
      text: `Achha, dhanyawaad. Loan ke liye ${first} ji ka khud yahan hona zaroori hai. Kya aap unhe abhi bula sakte hain?`,
      speech: `अच्छा, धन्यवाद। लोन के लिए ${hi} जी का ख़ुद यहाँ होना ज़रूरी है। क्या आप उन्हें अभी बुला सकते हैं?`,
    },
    later: {
      text: `Arre, koi baat nahi, bilkul chinta mat kijiye! Jab ${first} ji aa jaayein aur unhe fursat mile, tab hum aaram se baat kar lenge. Aapne itna time diya, bahut shukriya — unko hamari taraf se namaste kahiyega!`,
      speech: `अरे, कोई बात नहीं, बिल्कुल चिंता मत कीजिए! जब ${hi} जी आ जाएँ, और उन्हें फ़ुरसत मिले, तब हम आराम से बात कर लेंगे। आपने इतना टाइम दिया, बहुत शुक्रिया। उनको हमारी तरफ़ से नमस्ते कहिएगा!`,
    },
    handover: {
      text: `Bahut achha. Phone ${first} ji ko de dijiye. ${first} ji, namaste! Apna poora naam bataiye?`,
      speech: `बहुत अच्छा। फ़ोन ${hi} जी को दे दीजिए। ${hi} जी, नमस्ते! अपना पूरा नाम बताइए?`,
    },
  };
}

const KIN = '(beta|beti|bete|son|daughter|ladka|ladki|larka|larki|putra|putri|bachcha|bachchi|pati|husband|patni|wife|bhai|brother|behen|bahen|sister|bahu|damaad|pota|poti|nati|grandson|granddaughter|nephew|niece|devar|bhatija|bhatiji|naukar|helper|munim|employee|worker|staff|relative|rishtedar)';
const ELDER = '(mummy|mumy|mummi|mumma|maa|mom|mother|mata ?ji|papa|pitaji|father|dad|daddy|pati|husband|patni|wife|bhaiya|didi|chacha|chachi|dadi|nani|uncle|aunty)';
const AWAY = '(bahar|baahar|ghar pe nahi|ghar par nahi|nahi hai|nahi hain|nhi hai|gayi|gaye|gai hai|busy|so rahi|so rahe|market|bazaar|mandir|kaam pe|outside|not here|not at home|out)';
// Speech recognition sometimes returns Hindi in Devanagari.
const KIN_HI = '(बेटा|बेटी|लड़का|लड़की|लडका|लडकी|पत्नी|पति|भाई|बहन|बहू|नौकर|रिश्तेदार)';
const ELDER_HI = '(पापा|मम्मी|माँ|मां|पिताजी|पिता जी|माता जी|पति|पत्नी)';

/**
 * The person answering says they are the applicant's relative or helper — "Rekha Devi ka beta", "I am his son",
 * "main unka ladka hoon", "meri mummy ka loan", "papa bahar hai". Their own name can share a word with the file ("Raj,
 * Rekha ka beta"), and the extractor has filed "I am his son" under the father's name, so this reads the words, not the
 * name. Used only before the applicant confirms their own name: after that, "mere pati" is the applicant talking about
 * her husband. `away` = they also said the applicant is not there.
 */
export function speakerIsSomeoneElse(text = '', applicantName = '') {
  const s = String(text).toLowerCase();
  const first = applicantName.split(' ')[0]?.toLowerCase();
  const whose = first ? `|${first}'s|${first}\\s+\\w+'s|${first}(\\s+\\w+)?\\s+(ji\\s+)?(ka|ki|ke)` : '';
  const patterns = [
    // "unka beta", "his son", "Mahesh ka ladka", "Mahesh's son"
    new RegExp(`\\b(unka|unki|unke|inka|inki|inke|his|her|their${whose})\\s+${KIN}\\b`),
    // "son of Mahesh"
    new RegExp(`\\b${KIN}\\s+of\\b`),
    // "main beta hoon", "I am the son", "I'm his daughter" — the relation straight after "I am"
    new RegExp(`\\b(main|mai|mein|i am|i'm|im)\\s+((unka|unki|unke|inka|inki|his|her|their|the|a)\\s+)?${KIN}\\b`),
    new RegExp(`\\b(meri|mere|my)\\s+${ELDER}\\b`),
    new RegExp(`(मैं|में)\\s*(उनका|उनकी|उनके|इनका|इनकी)?\\s*${KIN_HI}`),
    new RegExp(`(उनका|उनकी|उनके|इनका|इनकी)\\s*${KIN_HI}`),
    new RegExp(`(मेरी|मेरे)\\s*${ELDER_HI}`),
  ];
  const elderAway = [new RegExp(`\\b${ELDER}\\b.{0,25}\\b${AWAY}\\b`), new RegExp(`${ELDER_HI}.{0,25}(बाहर|नहीं|गए|गई|बिज़ी)`)];
  const hit = patterns.map((re) => re.exec(s)).find(Boolean) ?? elderAway.map((re) => re.exec(s)).find(Boolean);
  if (!hit) return null;
  const relation = relationOf(hit[0]);
  return { relation: relation === 'other' ? 'family' : relation, away: elderAway.some((re) => re.test(s)) };
}
