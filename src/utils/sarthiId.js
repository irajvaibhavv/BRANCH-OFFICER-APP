/*
  SARTHI — identity document checks. Plain JavaScript, offline, no AI.

  This is not eKYC. UIDAI/NSDL verification needs a licensed API; what runs here are the checks a
  branch officer can make without one — and they are real checks, not theatre:

   - Aadhaar carries a Verhoeff check digit. A number typed at random fails it ~90% of the time,
     so a fabricated Aadhaar is caught on the spot.
   - PAN encodes its own meaning: the 4th character is the holder type and the 5th is the first
     letter of the surname. A PAN that says "H" while the applicant says he is applying as an
     individual, or one whose 5th letter is not the surname initial, does not belong to them.

  Everything returns a list of named checks so the report can cite which one failed.
*/

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

/**
 * @param pan  the number as typed
 * @param name the applicant's name, so the 5th character can be checked against their surname
 */
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

/** A line the report can state, with nothing inferred beyond the checks that actually ran. */
export function identitySummary(id) {
  if (!id) return 'No identity document was captured.';
  const label = id.type === 'aadhaar' ? 'Aadhaar' : 'PAN';
  const failed = id.checks.filter((c) => !c.pass);
  if (id.ok) return `${label} ${id.masked} passed every offline check (${id.checks.map((c) => c.label.toLowerCase()).join(', ')}). Not verified against UIDAI/NSDL records.`;
  return `${label} ${id.masked} failed: ${failed.map((c) => c.detail).join('; ')}.`;
}
