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
