// Live challenges: after a few hundred PDs a BO knows every question Sarthi asks and can brief an applicant, stock a
// shop for the day or write up a bill book. These are picked at random DURING the call, with random details (which
// shelf, which old date), so there is nothing to brief: a staged shop has no purchase rate for a random item, a book
// written last night has no believable page from three weeks ago. Decided in code; the model only phrases them.
import { readNumbers } from './hindiNumbers.js';
import { namesMatch } from './idChecks.js';

export const CHALLENGES_PER_PD = 2;
export const MAX_CHALLENGES = 4;
// A pool with nothing new for this long is one a BO has learned (`npm run check:challenges` warns).
export const STALE_DAYS = 90;

const SHELVES = ['sabse upar wale', 'sabse neeche wale', 'baayein taraf wale', 'daayein taraf wale', 'counter ke peeche wale'];
const BILL_SPOTS = ['sabse upar wala', 'doosra', 'teesra', 'sabse neeche wala'];
const pick = (list, rand) => list[Math.floor(rand() * list.length)];

// "18 tareekh" or "pichhle mahine ki 28 tareekh" — a day 8-25 days back.
export function pastDateWords(rand, today = new Date()) {
  const d = new Date(today);
  d.setDate(d.getDate() - (8 + Math.floor(rand() * 18)));
  return d.getMonth() === today.getMonth() ? `${d.getDate()} tareekh` : `pichhle mahine ki ${d.getDate()} tareekh`;
}

// Each challenge is a few steps: a photo (kind in PHOTO_ASKS) and/or a spoken question. `why` is for the report only.
// `check` names the code check on a spoken answer (checkChallenge); `pan` keeps the camera open for a second live shot.
// A follow-up asks a detail of the object just shown, which the photo's own reading can confirm.
// `added`: add new tasks every few months — a BO can learn the task types, not the random details.
export const POOL = [
  {
    id: 'bill_back',
    place: 'shop',
    added: '2026-10-22',
    when: (c) => ['bill_book', 'register'].includes(c.billing_method),
    why: 'An old page of a book kept for months looks used; a book written up for the PD has no believable past page',
    steps: (rand) => [
      { photo: 'records_back', ask: `Bill book ke kuch panne peeche palatiye — ${pastDateWords(rand)} ke aas-paas ka koi bill kholiye aur uski photo bhejiye.` },
      { ask: `Usi panne pe ${pick(BILL_SPOTS, rand)} bill kitne ka hai, aur kis cheez ka?` },
    ],
  },
  {
    id: 'shelf_item',
    place: 'shop',
    added: '2026-10-22',
    why: 'Stock brought in for the day comes without its purchase rate and supplier — the owner knows both without thinking',
    steps: (rand) => [
      {
        photo: 'shelf',
        ask: `Camera ${pick(SHELVES, rand)} rack ki taraf kijiye, wahan se koi ek saamaan haath mein lekar photo bhejiye — phir camera band kiye bina dukaan ka darwaaza dikhaiye.`,
        pan: { text: 'Ab camera band kiye bina, ghoom kar dukaan ka darwaaza dikhaiye', speech: 'अब कैमरा बंद किए बिना, घूम कर दुकान का दरवाज़ा दिखाइए।' },
      },
      { ask: 'Jo saamaan aapne abhi dikhaya — uska MRP kya hai, aap kitne mein kharidte hain, aur kisse?', check: 'margin' },
    ],
  },
  {
    id: 'purchase_bill',
    place: 'shop',
    added: '2026-10-22',
    why: 'A real supplier bill has a date, a supplier and items that match the shelves; their memory of it should match the paper',
    steps: () => [
      { photo: 'purchase_bill', ask: 'Pichhli baar jo maal aaya tha, uske supplier ya distributor ka bill dikhaiye — photo bhejiye.' },
      { ask: 'Yeh maal kab aaya tha, kul kitne ka tha, aur kis supplier se?', check: 'purchase' },
    ],
  },
  {
    id: 'qr_code',
    place: 'shop',
    added: '2026-10-22',
    why: 'The name a payment QR pays out to should be the applicant or the shop',
    steps: () => [
      { photo: 'qr', ask: 'Dukaan pe payment ka jo QR code laga hai, uski photo bhejiye.' },
      { ask: 'Jab koi grahak is QR pe paise bhejta hai, toh uske phone pe kiska naam aata hai?', check: 'names' },
    ],
  },
  {
    id: 'opening_day',
    place: 'shop',
    added: '2026-10-22',
    why: 'Someone who sat in the shop today answers instantly and specifically',
    steps: () => [{ ask: 'Aaj dukaan kitne baje kholi, aur pehla grahak kya lekar gaya?' }],
  },
  {
    id: 'shop_document',
    place: 'shop',
    added: '2026-10-22',
    why: "A rent agreement, shop licence, Udyam or the shop's electricity bill names whose shop it is — a friend's shop carries the friend's name",
    steps: () => [
      { photo: 'shop_document', ask: 'Dukaan ka koi bhi kaagaz dikhaiye jis par naam ho — rent agreement, shop licence, Udyam ya dukaan ka bijli bill. Uski photo bhejiye.' },
      { ask: 'Is kaagaz pe kiska naam likha hai?', check: 'names' },
    ],
  },
  {
    id: 'street_view',
    place: 'shop',
    added: '2026-10-23',
    why: 'The street outside and the neighbours\' boards place the shop; an owner knows who trades next door',
    steps: () => [
      { photo: 'street', ask: 'Camera dukaan ke darwaaze se bahar kijiye — saamne ki sadak aur bagal ki dukaanein dikhaiye.' },
      { ask: 'Aapke bilkul bagal wali dukaan kiski hai, aur woh kya bechte hain?', check: 'names' },
    ],
  },
  {
    id: 'utility_bill',
    place: 'home',
    added: '2026-10-22',
    why: 'Name and address on a utility bill tie the person to the home photographed',
    steps: () => [
      { photo: 'utility_bill', ask: 'Ghar ka bijli ya paani ka bill dikhaiye — jis pe naam aur pata likha ho. Uski photo bhejiye.' },
      { ask: 'Yeh bill kiske naam pe hai, aur is baar kitne ka aaya?', check: 'names' },
    ],
  },
  {
    id: 'gas_book',
    place: 'home',
    added: '2026-10-23',
    why: 'An LPG passbook or cylinder receipt carries a name and address issued by someone else, and the family knows when the last cylinder came',
    steps: () => [
      { photo: 'gas_book', ask: 'LPG gas ki passbook ya cylinder ki rasid dikhaiye — jis pe naam aur pata ho. Uski photo bhejiye.' },
      { ask: 'Gas connection kiske naam pe hai, aur pichhla cylinder kab aaya tha?', check: 'names' },
    ],
  },
  {
    id: 'home_landmark',
    place: 'home',
    added: '2026-10-23',
    why: 'Someone who lives there names what is opposite at once; the officer can check it on the map',
    steps: () => [{ ask: 'Aapke ghar ke bilkul saamne kya hai — koi dukaan, mandir, school ya park?' }],
  },
];

/** How many challenges this call gets, and why: more when the PD is riskier. Decided once, when they are planned. */
export function challengeCount(memory = {}) {
  const flags = memory.flags ?? [];
  const why = [
    memory.strict && 'a re-check PD',
    memory.boPresent && 'the officer sat with the applicant',
    Object.keys(memory.prior ?? {}).length > 0 && 'a repeat PD',
    (flags.some((f) => f.severity === 'high') || flags.filter((f) => f.type === 'declined').length >= 2) && 'flags raised earlier in this call',
  ].filter(Boolean);
  return { count: Math.min(MAX_CHALLENGES, CHALLENGES_PER_PD + why.length), why };
}

/** Random challenges for where they are, as a flat queue of steps. `rand` is injectable for the check script. */
export function planChallenges(place, collected = {}, rand = Math.random, count = CHALLENGES_PER_PD) {
  const open = POOL.filter((ch) => ch.place === place && (!ch.when || ch.when(collected)));
  const chosen = [];
  while (chosen.length < count && open.length) chosen.push(open.splice(Math.floor(rand() * open.length), 1)[0]);
  return chosen.flatMap((ch) => ch.steps(rand).map((st, i) => ({ id: ch.id, why: ch.why, step: i, ...st })));
}

const num = (v) => (typeof v === 'number' ? v : readNumbers(String(v ?? ''))[0]?.value ?? null);
const flag = (step, turn, severity, detail) => ({ type: 'surprise_check', field: `challenge_${step.id}`, severity, turn, detail });

/**
 * Code checks on one challenge answer: the figures or names they gave against the trade, their own earlier answers and
 * what the photo shows. Returns flags (type surprise_check); the report writer weighs them.
 */
export function checkChallenge(step, answer, { photoNames = [], collected = {}, trade = null, turn = null } = {}) {
  const out = [];
  if (step.photo) return out;
  const values = readNumbers(answer).map((n) => n.value).filter((v) => v > 0);

  if (step.check === 'margin') {
    const [mrp, buy] = values;
    const range = trade?.typicalMarginPct;
    if (buy == null) out.push(flag(step, turn, 'low', 'Could not give both the MRP and the purchase rate of an item from their own shelf'));
    else if (buy > mrp) out.push(flag(step, turn, 'medium', `Said they buy the item they picked at ${buy}, above its MRP of ${mrp}`));
    else if (range) {
      const pct = Math.round(((mrp - buy) / mrp) * 100);
      // One item's margin varies, so only far outside the trade's range counts.
      if (pct > Math.max(range.max * 2, range.max + 15)) {
        out.push(flag(step, turn, 'medium', `Margin on the item they picked is ${pct}% (MRP ${mrp}, buys at ${buy}) — the trade runs ${range.min}-${range.max}%`));
      }
    }
  }

  if (step.check === 'purchase') {
    const amount = Math.max(0, ...values.filter((v) => v >= 100));
    const last = num(collected.last_purchase_amount);
    const monthly = num(collected.monthly_purchase);
    if (!amount) out.push(flag(step, turn, 'low', 'Could not say what the last supplier bill came to'));
    else if (last && Math.abs(amount - last) / Math.max(amount, last) > 0.4) {
      out.push(flag(step, turn, 'medium', `Holding the bill, said the last delivery was ${amount}; earlier in the call it was ${last}`));
    } else if (monthly && amount > monthly * 1.5) {
      out.push(flag(step, turn, 'medium', `One delivery of ${amount} is more than the ${monthly} a month they said they buy`));
    }
  }

  // Only when the photo was read and the answer is in Latin script — Devanagari speech cannot be compared.
  if (step.check === 'names' && photoNames.length && namesMatch(answer, photoNames.join(' ')) === false) {
    out.push(flag(step, turn, 'medium', `Said "${String(answer).slice(0, 60)}", but the photo shows: ${photoNames.join(', ')}`));
  }
  return out;
}
