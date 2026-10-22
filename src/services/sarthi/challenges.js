// Live challenges: after a few hundred PDs a BO knows every question Sarthi asks and can brief an applicant, stock a shop
// for the day or write up a bill book. These are picked at random DURING the call, with random details (which shelf,
// which old date), so there is nothing to brief: a staged shop has no purchase rate for a random item, a book written last
// night has no believable page from three weeks ago. Decided in code; the model only phrases them.

export const CHALLENGES_PER_PD = 2;

const SHELVES = ['sabse upar wale', 'sabse neeche wale', 'baayein taraf wale', 'daayein taraf wale', 'counter ke peeche wale'];
const pick = (list, rand) => list[Math.floor(rand() * list.length)];

// "18 tareekh" or "pichhle mahine ki 28 tareekh" — a day 8-25 days back.
export function pastDateWords(rand, today = new Date()) {
  const d = new Date(today);
  d.setDate(d.getDate() - (8 + Math.floor(rand() * 18)));
  return d.getMonth() === today.getMonth() ? `${d.getDate()} tareekh` : `pichhle mahine ki ${d.getDate()} tareekh`;
}

// Each challenge is a few steps: a photo (kind in PHOTO_ASKS) and/or a spoken question. `why` is for the report only.
const POOL = [
  {
    id: 'bill_back',
    place: 'shop',
    when: (c) => ['bill_book', 'register'].includes(c.billing_method),
    why: 'An old page of a book kept for months looks used; a book written up for the PD has no believable past page',
    steps: (rand) => [{ photo: 'records_back', ask: `Bill book ke kuch panne peeche palatiye — ${pastDateWords(rand)} ke aas-paas ka koi bill kholiye aur uski photo bhejiye.` }],
  },
  {
    id: 'shelf_item',
    place: 'shop',
    why: 'Stock brought in for the day comes without its purchase rate and supplier — the owner knows both without thinking',
    steps: (rand) => [
      { photo: 'shelf', ask: `Camera ${pick(SHELVES, rand)} rack ki taraf kijiye, wahan se koi ek saamaan haath mein lekar photo bhejiye.` },
      { ask: 'Jo saamaan aapne abhi dikhaya — uska MRP kya hai, aap kitne mein kharidte hain, aur kisse?' },
    ],
  },
  {
    id: 'purchase_bill',
    place: 'shop',
    why: 'A real supplier bill has a date, a supplier and items that match the shelves; their memory of it should match the paper',
    steps: () => [
      { photo: 'purchase_bill', ask: 'Pichhli baar jo maal aaya tha, uske supplier ya distributor ka bill dikhaiye — photo bhejiye.' },
      { ask: 'Yeh maal kab aaya tha, aur kul kitne ka tha?' },
    ],
  },
  {
    id: 'qr_code',
    place: 'shop',
    why: 'The name a payment QR pays out to should be the applicant or the shop',
    steps: () => [{ photo: 'qr', ask: 'Dukaan pe payment ka jo QR code laga hai, uski photo bhejiye.' }],
  },
  {
    id: 'opening_day',
    place: 'shop',
    why: 'Someone who sat in the shop today answers instantly and specifically',
    steps: () => [{ ask: 'Aaj dukaan kitne baje kholi, aur pehla grahak kya lekar gaya?' }],
  },
  {
    id: 'utility_bill',
    place: 'home',
    why: 'Name and address on a utility bill tie the person to the home photographed',
    steps: () => [{ photo: 'utility_bill', ask: 'Ghar ka bijli ya paani ka bill dikhaiye — jis pe naam aur pata likha ho. Uski photo bhejiye.' }],
  },
];

/** Random challenges for where they are, as a flat queue of steps. `rand` is injectable for the check script. */
export function planChallenges(place, collected = {}, rand = Math.random, count = CHALLENGES_PER_PD) {
  const open = POOL.filter((ch) => ch.place === place && (!ch.when || ch.when(collected)));
  const chosen = [];
  while (chosen.length < count && open.length) chosen.push(open.splice(Math.floor(rand() * open.length), 1)[0]);
  return chosen.flatMap((ch) => ch.steps(rand).map((st, i) => ({ id: ch.id, why: ch.why, step: i, ...st })));
}
