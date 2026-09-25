// Spoken Hinglish money and counts → numbers. Deterministic, because models misread them.

const UNITS = {
  ek: 1, do: 2, teen: 3, char: 4, chaar: 4, paanch: 5, panch: 5, chhah: 6, chhe: 6, che: 6, chey: 6,
  saat: 7, aath: 8, aat: 8, nau: 9, no: 9, das: 10, dus: 10,
  gyarah: 11, gyara: 11, barah: 12, bara: 12, terah: 13, tera: 13, chaudah: 14, chauda: 14,
  pandrah: 15, pandra: 15, solah: 16, sola: 16, satrah: 17, satra: 17, atharah: 18, athara: 18,
  athaara: 18, unnis: 19, bees: 20, bis: 20, ikkis: 21, bais: 22, baees: 22, teis: 23, tais: 23,
  chaubis: 24, pachees: 25, pachis: 25, chhabbis: 26, sattais: 27, atthais: 28, untis: 29,
  tees: 30, tis: 30, ikattis: 31, battis: 32, taintis: 33, chauntis: 34, paintis: 35,
  chhattis: 36, saintis: 37, adtis: 38, untalis: 39,
  chalis: 40, chaalis: 40, chalees: 40, iktalis: 41, bayalis: 42, taintalis: 43, chavalis: 44,
  paintalis: 45, chhiyalis: 46, saintalis: 47, adtalis: 48, unchas: 49,
  pachas: 50, pachaas: 50, pachhas: 50, ikyavan: 51, bavan: 52, tirepan: 53, chauvan: 54,
  pachpan: 55, chhappan: 56, sattavan: 57, atthavan: 58, unsath: 59,
  sathh: 60, saath: 60, satth: 60, ikasath: 61, basath: 62, tirsath: 63, chausath: 64,
  painsath: 65, chhiyasath: 66, sadsath: 67, adsath: 68, unhattar: 69,
  sattar: 70, sattar_: 70, ikhattar: 71, bahattar: 72, tihattar: 73, chauhattar: 74,
  pachhattar: 75, chhihattar: 76, sathattar: 77, athhattar: 78, unasi: 79,
  assi: 80, asi: 80, ikyasi: 81, beyasi: 82, tirasi: 83, churasi: 84, chaurasi: 84,
  pichasi: 85, chhiyasi: 86, satasi: 87, athasi: 88, navasi: 89,
  nabbe: 90, nabbay: 90, ikyanve: 91, banve: 92, tiranve: 93, chauranve: 94, pichanve: 95,
  chhiyanve: 96, satanve: 97, athanve: 98, ninyanve: 99, sau: 100,
};

const FRACTIONS = {
  aadha: 0.5, adha: 0.5, aadhi: 0.5,
  sawa: 1.25, sava: 1.25,
  dedh: 1.5, derh: 1.5, dhedh: 1.5,
  dhai: 2.5, dhaai: 2.5, dhayi: 2.5, dhari: 2.5,
  saade: 0.5, sade: 0.5, saadhe: 0.5, // additive: "saade teen" = 3 + 0.5
};

const SCALES = {
  hazaar: 1000, hazar: 1000, hajaar: 1000, hajar: 1000, k: 1000,
  lakh: 100000, lac: 100000, lakhs: 100000,
  crore: 10000000, karod: 10000000, cr: 10000000,
};

// "saath" is 60 (साठ) or "with" (साथ); only read it as 60 before a scale word or countable noun.
const COUNTABLE_AFTER = /^(customer|customers|grahak|log|logo|logon|saal|sal|din|ghante|rupaye|rupay|rs|hazaar|hazar|lakh|crore|se|ke|ka|ki)\b/;

function plainDigits(token) {
  const n = Number(token.replace(/[,\s₹]/g, ''));
  return Number.isFinite(n) ? n : null;
}

// Returns [{ value, text, index }]. Handles "1,20,000", "2.5 lakh", "saade teen lakh", "ek lakh bees hazaar".
export function readNumbers(text) {
  if (!text) return [];
  const lower = String(text).toLowerCase();

  const tokens = [];
  const re = /(\d[\d,.]*)|([a-z]+)/g;
  let m;
  while ((m = re.exec(lower)) !== null) {
    tokens.push({ raw: m[0], isDigit: !!m[1], index: m.index, end: m.index + m[0].length });
  }

  const out = [];
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    let value = null;
    let start = t.index;
    let end = t.end;
    let consumed = 1;

    let fraction = null;
    let base = null;
    if (!t.isDigit && FRACTIONS[t.raw] !== undefined) {
      fraction = t.raw;
      const next = tokens[i + 1];
      if (next && !next.isDigit && UNITS[next.raw] !== undefined) {
        // Additive form: "saade teen" = 3.5, "sawa do" = 2.25 (sawa/dedh/dhai are standalone).
        base = FRACTIONS[fraction] === 0.5 && /^(saade|sade|saadhe)$/.test(fraction)
          ? UNITS[next.raw] + 0.5
          : UNITS[next.raw];
        consumed = 2; end = next.end;
      } else {
        base = FRACTIONS[fraction];
      }
    } else if (t.isDigit) {
      base = plainDigits(t.raw);
    } else if (UNITS[t.raw] !== undefined) {
      base = UNITS[t.raw];
    }

    if (base === null || base === undefined) { i += 1; continue; }

    let total = 0;
    let running = base;
    let sawScale = false;
    let j = i + consumed;
    while (j < tokens.length) {
      const s = tokens[j];
      if (!s.isDigit && SCALES[s.raw] !== undefined) {
        total += running * SCALES[s.raw];
        sawScale = true;
        end = s.end;
        j += 1;
        const nxt = tokens[j];
        if (nxt && ((nxt.isDigit && plainDigits(nxt.raw) !== null) || UNITS[nxt.raw] !== undefined)) {
          running = nxt.isDigit ? plainDigits(nxt.raw) : UNITS[nxt.raw];
          end = nxt.end;
          j += 1;
          continue;
        }
        running = 0;
        break;
      }
      break;
    }
    value = sawScale ? total + running : running;

    if (!sawScale && /^(saath|sathh|satth)$/.test(t.raw)) {
      const after = lower.slice(end).trim();
      if (!COUNTABLE_AFTER.test(after)) { i += 1; continue; }
    }

    // A bare fraction ("dedh" alone) is not a figure.
    if (!sawScale && fraction && base < 3) { i = j > i ? j : i + 1; continue; }

    if (value !== null && Number.isFinite(value) && value > 0) {
      out.push({ value, text: lower.slice(start, end), index: start });
    }
    i = j > i ? j : i + consumed;
  }

  return out;
}

export function readNumber(text) {
  const all = readNumbers(text);
  return all.length ? all[0].value : null;
}

// The parser wins only when the sentence holds exactly one number; otherwise it abstains.
export function reconcile(modelValue, answerText) {
  const found = readNumbers(answerText);
  if (found.length !== 1) return { value: modelValue, corrected: false, from: null };
  const spoken = found[0].value;
  if (modelValue === spoken) return { value: spoken, corrected: false, from: null };
  return { value: spoken, corrected: true, from: modelValue };
}
