// Language helpers for the training generator: seeded randomness, Hinglish number words, Devanagari speech.

// Seeded, so a rebuild produces the same files and a diff shows only real changes.
export function rng(seed = 7) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = (arr) => arr[Math.floor(next() * arr.length)];
  const int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));
  const chance = (p) => next() < p;
  const shuffle = (arr) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i -= 1) {
      const j = Math.floor(next() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  return { next, pick, int, chance, shuffle };
}

// Canonical spellings — each is a key the app's parser (hindiNumbers.js) reads.
const WORDS = ['', 'ek', 'do', 'teen', 'chaar', 'paanch', 'chhe', 'saat', 'aath', 'nau', 'das',
  'gyarah', 'barah', 'terah', 'chaudah', 'pandrah', 'solah', 'satrah', 'atharah', 'unnis', 'bees',
  'ikkis', 'bais', 'teis', 'chaubis', 'pachees', 'chhabbis', 'sattais', 'atthais', 'untis', 'tees',
  'ikattis', 'battis', 'taintis', 'chauntis', 'paintis', 'chhattis', 'saintis', 'adtis', 'untalis', 'chalis',
  'iktalis', 'bayalis', 'taintalis', 'chavalis', 'paintalis', 'chhiyalis', 'saintalis', 'adtalis', 'unchas', 'pachaas',
  'ikyavan', 'bavan', 'tirepan', 'chauvan', 'pachpan', 'chhappan', 'sattavan', 'atthavan', 'unsath', 'saath',
  'ikasath', 'basath', 'tirsath', 'chausath', 'painsath', 'chhiyasath', 'sadsath', 'adsath', 'unhattar', 'sattar',
  'ikhattar', 'bahattar', 'tihattar', 'chauhattar', 'pachhattar', 'chhihattar', 'sathattar', 'athhattar', 'unasi', 'assi',
  'ikyasi', 'beyasi', 'tirasi', 'chaurasi', 'pichasi', 'chhiyasi', 'satasi', 'athasi', 'navasi', 'nabbe',
  'ikyanve', 'banve', 'tiranve', 'chauranve', 'pichanve', 'chhiyanve', 'satanve', 'athanve', 'ninyanve'];

const SCALE = [[10000000, 'crore'], [100000, 'lakh'], [1000, 'hazaar'], [100, 'sau']];

// "sawa do lakh", "dhai hazaar", "saade teen lakh", "paune do lakh" — how people actually say round figures.
function fractionWords(n) {
  for (const [unit, name] of [[100000, 'lakh'], [1000, 'hazaar']]) {
    const q = n / unit;
    if (q === 1.5) return `dedh ${name}`;
    if (q === 2.5) return `dhai ${name}`;
    const whole = Math.floor(q);
    const rest = q - whole;
    if (whole >= 1 && whole < 100 && rest === 0.25) return `sawa ${WORDS[whole]} ${name}`;
    if (whole >= 3 && whole < 100 && rest === 0.5) return `saade ${WORDS[whole]} ${name}`;
    if (whole >= 1 && whole < 99 && rest === 0.75) return `paune ${WORDS[whole + 1]} ${name}`;
  }
  return null;
}

function plainWords(n) {
  const parts = [];
  let rest = n;
  for (const [unit, name] of SCALE) {
    const q = Math.floor(rest / unit);
    if (q > 0 && q < 100) { parts.push(`${WORDS[q]} ${name}`); rest -= q * unit; }
  }
  if (rest > 0 && rest < 100) parts.push(WORDS[rest]);
  return parts.join(' ');
}

const indian = (n) => {
  const s = String(n);
  if (s.length <= 3) return s;
  const last3 = s.slice(-3);
  return `${s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}`;
};

/** A spoken/typed form of n, in one of the ways borrowers really give it. */
export function sayNumber(n, r) {
  const styles = [];
  const f = fractionWords(n);
  if (f) styles.push(f, f);
  styles.push(plainWords(n), plainWords(n));
  if (n >= 1000) styles.push(indian(n));
  if (n >= 1000 && n < 100000 && n % 1000 === 0) styles.push(`${n / 1000} hazaar`);
  if (n >= 100000 && Number.isInteger(n / 100000)) styles.push(`${n / 100000} lakh`);
  if (n < 1000) styles.push(String(n));
  return r.pick(styles.filter(Boolean));
}

/** How Sarthi echoes a figure on screen: short and unambiguous. */
export function captionNumber(n) {
  if (n >= 100000) {
    const l = Math.floor(n / 100000);
    const h = Math.round((n % 100000) / 1000);
    return h ? `${l} lakh ${h} hazaar` : `${l} lakh`;
  }
  if (n >= 1000 && n % 1000 === 0) return `${n / 1000} hazaar`;
  if (n >= 1000) return indian(n);
  return String(n);
}

/** The same figure for the Hindi voice — digits with Devanagari scale words, never "2.5". */
export function speechNumber(n) {
  if (n >= 100000) {
    const l = Math.floor(n / 100000);
    const h = Math.round((n % 100000) / 1000);
    return h ? `${l} लाख ${h} हज़ार` : `${l} लाख`;
  }
  if (n >= 1000 && n % 1000 === 0) return `${n / 1000} हज़ार`;
  return String(n);
}

// The Devanagari twin of every schema ask, so a generated question can be spoken, not just shown.
export const ASK_HI = {
  stated_name: 'आपका पूरा नाम बताइए?',
  applicant_name: 'आपका पूरा नाम क्या है?',
  age: 'आपकी उमर कितनी है?',
  family_size: 'घर में कुल कितने लोग हैं?',
  dependents: 'इनमें से कितने बच्चे या बुज़ुर्ग, आप पर निर्भर हैं?',
  earning_members: 'घर में आपके अलावा, और कौन कमाता है?',
  other_household_income: 'उनकी महीने की कमाई, लगभग कितनी है?',
  residence_type: 'घर अपना है, या किराये का?',
  residence_duration: 'इस घर में, कितने साल से रह रहे हैं?',
  monthly_rent: 'घर का किराया, महीने का कितना देते हैं?',
  business_type: 'आप क्या काम करते हैं?',
  business_age: 'यह काम, कितने साल से कर रहे हैं?',
  business_location: 'आपकी दुकान, या काम की जगह कहाँ है?',
  shop_ownership: 'दुकान अपनी है, या किराये की?',
  shop_rent: 'दुकान का किराया, महीने का कितना है?',
  ownership: 'काम आप अकेले चलाते हैं, या किसी के साथ मिलकर?',
  employees: 'काम में कितने लोग मदद करते हैं?',
  products_services: 'आप क्या-क्या बेचते या बनाते हैं?',
  customers_per_day: 'रोज़ लगभग कितने ग्राहक आते हैं?',
  monthly_sales: 'महीने में कुल बिक्री, कितनी हो जाती है?',
  monthly_expenses: 'दुकान का महीने का खर्चा कितना है — किराया, बिजली, मददगार की तनख़्वाह मिलाकर?',
  supplier_credit: 'माल उधार पर मिलता है, या नकद देना पड़ता है?',
  avg_bill_value: 'एक ग्राहक आम तौर पर, कितने का सामान लेता है?',
  monthly_purchase: 'महीने में कितने का माल ख़रीदते हैं?',
  payment_mode: 'ग्राहक ज़्यादा नकद देते हैं, या यूपीआई से?',
  peak_day_sales: 'सबसे अच्छे दिन, कितनी बिक्री होती है?',
  slow_day_sales: 'सबसे हल्के दिन, कितनी बिक्री होती है?',
  supplier_names: 'माल कहाँ से, या किससे लेते हैं?',
  credit_given: 'ग्राहकों का कितना उधार, अभी बाक़ी है?',
  stock_value: 'अभी दुकान में, लगभग कितने का माल पड़ा है?',
  seasonal_variation: 'साल में कौन से महीने काम ज़्यादा चलता है, कौन से कम?',
  monthly_income: 'सब खर्चा निकालकर, महीने की बचत या कमाई कितनी होती है?',
  household_expenses: 'घर का महीने का खर्चा, कितना हो जाता है?',
  existing_loans: 'अभी कोई लोन चल रहा है — बैंक, फ़ाइनेंस कंपनी, या गोल्ड लोन?',
  existing_emi: 'सब किश्तों को मिलाकर, महीने में कितना जाता है?',
  informal_loans: 'किसी कमेटी, चिट फ़ंड, साहूकार या रिश्तेदार से, पैसा लिया हुआ है?',
  repayment_history: 'पहले कभी कोई किश्त छूटी, या देर से गई?',
  bank_account: 'आपका खाता किस बैंक में है?',
  savings: 'कुछ बचत है — एफ़डी, आरडी, या कमेटी में?',
  assets: 'आपके नाम पर कुछ और है — ज़मीन, मकान, गाड़ी या सोना?',
  aadhaar_address: 'आधार पर कौन सा पता लिखा है?',
  aadhaar_address_match: 'क्या आधार वाला पता यही है, जहाँ अभी रहते हैं?',
  pan_type: 'पैन कार्ड आपके नाम का है, या दुकान या फ़र्म के नाम का?',
  bank_account_type: 'खाता बचत वाला है, या करंट अकाउंट?',
  business_registration: 'दुकान का कोई रजिस्ट्रेशन है — जीएसटी, उद्यम, या ट्रेड लाइसेंस?',
  loan_purpose: 'यह पैसा किस काम में लगाएँगे?',
  loan_amount: 'कितने पैसे की ज़रूरत है?',
  purpose_reason: 'यह काम क्यों करना चाहते हैं — इसमें आपको क्या फ़ायदा दिखता है?',
  purpose_experience: 'इस नए काम का पहले कोई तजुर्बा है — कहीं काम किया, या सीखा?',
  current_business_plan: 'नया काम शुरू होने पर, अभी वाला काम कौन संभालेगा?',
  amount_basis: 'इतने पैसे का हिसाब कैसे बनाया — किस चीज़ में कितना लगेगा?',
  own_contribution: 'इस काम में अपनी तरफ़ से, कितना पैसा लगाएँगे?',
  repayment_plan: 'किश्त किस कमाई से भरेंगे? कोई महीना हल्का गया, तो कैसे करेंगे?',
};
