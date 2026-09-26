// Interviewer set: turns that sound like a person listening — echo, react, dig, accept "pata nahi" — not a form.
import { ASK_HI, captionNumber, speechNumber, sayNumber } from './lang.mjs';

export const INTERVIEWER_SLM_SYSTEM = `You are Sarthi, a friendly interviewer from the local loan branch, talking to a small trader in a tier 2 or tier 3 town. Each turn you get THIS TURN (what to ask next), what is ALREADY ANSWERED, and what the borrower JUST SAID.

Reply in exactly this order:
1. a \`\`\`speech block: your words in Devanagari, for a Hindi voice
2. the same words in simple Hinglish
3. a \`\`\`facts block (JSON) with whatever the borrower just stated, only if they stated something

Talk like a person, not a form. Acknowledge what they said, repeat an important number back so they can correct it, add a short natural reaction when it fits, then ask ONE simple question. Use everyday words: kamai, bikri, kharcha, kisht, udhaar, kiraya. Never praise or correct an answer, never suggest a number, never confront. "Pata nahi" is a fine answer: accept it and move on. A vague money answer gets broken into something easier (a day instead of a month). If they ask you something, answer in one line (the officer decides the loan) and go back to the question.`;

const FENCE = '```';
const lowerFirst = (t) => t.charAt(0).toLowerCase() + t.slice(1);
const turn = (speech, caption, facts) => [
  `${FENCE}speech\n${speech}\n${FENCE}`,
  caption,
  ...(facts && Object.keys(facts).length ? [`${FENCE}facts\n${JSON.stringify(facts)}\n${FENCE}`] : []),
].join('\n');

const userTurn = (sectionLabel, directive, known, said) =>
  `THIS TURN — section "${sectionLabel}": ${directive}\nALREADY ANSWERED: ${JSON.stringify(known)}\nBORROWER JUST SAID: "${said}"`;

// The controller's own directive wording (services/sarthi/controller.js), so the model learns the real input.
const fieldDirective = (defs, key, nextKey) => {
  const d = defs[key];
  return `Ask about: ${d.label}. Plain-words example: "${d.ask}"`
    + (nextKey ? ` Next after that: ${defs[nextKey].label}.` : '')
    + ' Ask ONE thing at a time, in your own words, as simply as the example.';
};

const SECTION_LABEL = { personal: 'Personal', business: 'Business', business_deep_dive: 'Business detail', financial: 'Financial', documents: 'Document cross-check', loan_purpose: 'Loan' };

/* ------------------------------------------------------------------ phrase pools (Hinglish, Devanagari) */

const ACK = [['Achha.', 'अच्छा।'], ['Theek hai.', 'ठीक है।'], ['Ji, samajh gaya.', 'जी, समझ गया।'], ['Hmm, achha.', 'हम्म, अच्छा।'], ['Chaliye.', 'चलिए।']];
const ECHO = {
  age: ['{c} saal', '{d} साल'], family_size: ['ghar mein {c} log', 'घर में {d} लोग'],
  monthly_rent: ['ghar ka kiraya {c}', 'घर का किराया {d}'], shop_rent: ['dukaan ka kiraya {c}', 'दुकान का किराया {d}'],
  business_age: ['{c} saal se kaam', '{d} साल से काम'], employees: ['{c} log madad karte hain', '{d} लोग मदद करते हैं'],
  customers_per_day: ['roz {c} grahak', 'रोज़ {d} ग्राहक'], avg_bill_value: ['ek grahak {c} rupaye ka', 'एक ग्राहक {d} रुपये का'],
  monthly_sales: ['mahine ki bikri {c}', 'महीने की बिक्री {d}'], monthly_expenses: ['dukaan ka kharcha {c}', 'दुकान का खर्चा {d}'],
  monthly_income: ['mahine mein {c} bachte hain', 'महीने में {d} बचते हैं'], household_expenses: ['ghar ka kharcha {c}', 'घर का खर्चा {d}'],
  existing_emi: ['kisht {c}', 'किश्त {d}'], loan_amount: ['{c} ki zaroorat', '{d} की ज़रूरत'], own_contribution: ['apne {c}', 'अपने {d}'],
};
// A short human reaction, only where it is true to what they said. Never about how good the numbers are.
const REACT = {
  business_age: (n) => (n >= 10 ? ['Kaafi purana kaam hai.', 'काफ़ी पुराना काम है।'] : n <= 2 ? ['Abhi naya hi hai kaam.', 'अभी नया ही है काम।'] : null),
  family_size: (n) => (n >= 6 ? ['Bhara-poora parivaar hai.', 'भरा-पूरा परिवार है।'] : null),
  customers_per_day: (n) => (n >= 150 ? ['Achhi chahal-pahal rehti hogi.', 'अच्छी चहल-पहल रहती होगी।'] : null),
  employees: (n) => (n === 0 ? ['Sab khud hi sambhalte hain phir.', 'सब ख़ुद ही संभालते हैं फिर।'] : null),
};
const WHY = ['Yeh bas record ke liye hai —', 'ये बस रिकॉर्ड के लिए है —'];
const NEEDS_WHY = new Set(['existing_loans', 'informal_loans', 'savings', 'business_registration', 'assets']);

// Field ranges for numeric answers, and plain answers for text/enum fields: [borrower said, facts, echo pair].
const RANGE = { age: [22, 60, 1], family_size: [2, 9, 1], monthly_rent: [2000, 20000, 500], shop_rent: [3000, 35000, 500],
  business_age: [1, 25, 1], employees: [0, 6, 1], customers_per_day: [20, 250, 5], avg_bill_value: [60, 600, 10],
  monthly_sales: [60000, 900000, 10000], monthly_expenses: [8000, 80000, 1000], monthly_income: [15000, 90000, 1000],
  household_expenses: [8000, 40000, 1000], existing_emi: [2000, 25000, 500], loan_amount: [100000, 1500000, 50000],
  own_contribution: [20000, 300000, 10000] };
const TEXT = {
  earning_members: [['Sirf main hi', { earning_members: 1 }], ['Main aur wife dono', { earning_members: 2 }]],
  residence_type: [['Apna hai', { residence_type: 'owned' }, ['Achha, apna ghar hai.', 'अच्छा, अपना घर है।']],
    ['Kiraye ka hai', { residence_type: 'rented' }, ['Achha, kiraye ka.', 'अच्छा, किराये का।']],
    ['Papa ka ghar hai', { residence_type: 'family' }, ['Achha, parivaar ka ghar.', 'अच्छा, परिवार का घर।']]],
  business_type: [['Kirana ki dukaan hai', { business_type: 'kirana' }, ['Achha, kirana.', 'अच्छा, किराना।']],
    ['Kapde ki dukaan', { business_type: 'garment shop' }, ['Achha, kapde ki dukaan.', 'अच्छा, कपड़े की दुकान।']],
    ['Bijli ka theka leta hoon', { business_type: 'electrical contractor' }, ['Achha, bijli ka theka.', 'अच्छा, बिजली का ठेका।']],
    ['Chai-nashte ki tapri hai', { business_type: 'chai stall' }, ['Achha, chai ki tapri.', 'अच्छा, चाय की टपरी।']]],
  business_location: [['Station road pe', { business_location: 'Station road' }], ['Gandhi chowk ke paas', { business_location: 'Gandhi chowk' }]],
  shop_ownership: [['Kiraye ki hai', { shop_ownership: 'rented' }, ['Achha, dukaan kiraye ki.', 'अच्छा, दुकान किराये की।']],
    ['Apni hai', { shop_ownership: 'owned' }, ['Achha, apni dukaan.', 'अच्छा, अपनी दुकान।']]],
  products_services: [['Raashan, doodh, biscuit, sab', { products_services: 'raashan, doodh, biscuit' }], ['Ladies suit aur saree', { products_services: 'ladies suit, saree' }]],
  supplier_credit: [['Pandrah din ka udhaar milta hai', { supplier_credit: '15 days' }], ['Sab nakad dena padta hai', { supplier_credit: 'none' }]],
  existing_loans: [['Ek gold loan hai', { existing_loans: 'gold loan' }], ['Koi loan nahi', { existing_loans: 'none' }]],
  informal_loans: [['Committee mein do hazaar bharta hoon', { informal_loans: 'committee 2000 mahina' }], ['Nahi, kuch nahi', { informal_loans: 'none' }]],
  repayment_history: [['Kabhi nahi chhooti', { repayment_history: 'never missed' }], ['Ek baar late hui thi', { repayment_history: 'ek baar late' }]],
  savings: [['Thoda RD hai', { savings: 'RD' }], ['Kuch khaas nahi', { savings: 'none' }]],
  loan_purpose: [['Dukaan ke liye maal lena hai', { loan_purpose: 'stock' }, ['Achha, maal ke liye.', 'अच्छा, माल के लिए।']],
    ['Fridge lena hai dukaan ke liye', { loan_purpose: 'fridge for shop' }, ['Achha, fridge ke liye.', 'अच्छा, फ़्रिज के लिए।']]],
  repayment_plan: [['Dukaan ki kamai se', { repayment_plan: 'from business income' }]],
};
const ORDER = ['age', 'family_size', 'earning_members', 'residence_type', 'monthly_rent', 'business_type', 'business_age',
  'business_location', 'shop_ownership', 'shop_rent', 'employees', 'products_services', 'customers_per_day', 'avg_bill_value',
  'monthly_sales', 'monthly_expenses', 'supplier_credit', 'monthly_income', 'household_expenses', 'existing_loans',
  'existing_emi', 'informal_loans', 'repayment_history', 'savings', 'loan_purpose', 'loan_amount', 'own_contribution', 'repayment_plan'];

const VAGUE = ['Theek-thaak ho jaata hai', 'Chal jaata hai ji', 'Kabhi kam kabhi zyada', 'Utna exact yaad nahi', 'Bas guzara ho jaata hai'];
// A vague money answer is broken into something easier — never answered for them.
const BREAKDOWN = {
  monthly_sales: ['Koi baat nahi. Roz ki bikri kitni hoti hai, lagbhag?', 'कोई बात नहीं। रोज़ की बिक्री, लगभग कितनी होती है?'],
  monthly_income: ['Samajh sakta hoon. Achhe mahine mein kitna bach jaata hai?', 'समझ सकता हूँ। अच्छे महीने में, कितना बच जाता है?'],
  monthly_expenses: ['Chaliye, ek-ek karke dekhte hain. Bijli ka bill kitna aata hai?', 'चलिए, एक-एक करके देखते हैं। बिजली का बिल कितना आता है?'],
  customers_per_day: ['Aaj subah se ab tak kitne log aaye honge, andaaza?', 'आज सुबह से अब तक, कितने लोग आए होंगे, अंदाज़ा?'],
  household_expenses: ['Sirf raashan mein mahine ka kitna jaata hai?', 'सिर्फ़ राशन में, महीने का कितना जाता है?'],
  monthly_purchase: ['Pichhli baar maal kitne ka mangwaya tha?', 'पिछली बार माल, कितने का मँगवाया था?'],
};
const PATA_NAHI = ['Pata nahi', 'Yaad nahi', 'Iska andaaza nahi hai'];
const SOFT_FIELDS = ['avg_bill_value', 'residence_duration', 'seasonal_variation', 'supplier_names', 'stock_value', 'credit_given'];

const ASK_BACK = [
  ['Loan kab tak milega?', ['Yeh faisla officer ji karenge — main bas aapki baat unke liye likh raha hoon.', 'ये फ़ैसला ऑफ़िसर जी करेंगे — मैं बस आपकी बात उनके लिए लिख रहा हूँ।']],
  ['Mera loan pass ho jaayega na?', ['Yeh officer ji tay karenge, main bas aapki baat unke liye likh raha hoon.', 'ये ऑफ़िसर जी तय करेंगे, मैं बस आपकी बात उनके लिए लिख रहा हूँ।']],
  ['Kitna byaaj lagega?', ['Byaaj ki baat officer ji aapko theek se batayenge.', 'ब्याज की बात, ऑफ़िसर जी आपको ठीक से बताएँगे।']],
  ['Yeh sab kyun pooch rahe ho?', ['Taaki officer ji aapka kaam theek se samjhein aur sahi loan de sakein.', 'ताकि ऑफ़िसर जी आपका काम ठीक से समझें, और सही लोन दे सकें।']],
];

const LEAD_IN = {
  kirana_store: [['Aap roz dukaan pe baithte hain, toh ek cheez bataiye —', 'आप रोज़ दुकान पे बैठते हैं, तो एक चीज़ बताइए —'], ['Ek dukaandaar wali baat poochhta hoon —', 'एक दुकानदार वाली बात पूछता हूँ —']],
  electrical_contractor: [['Aap site pe kaam dekhte hain, toh yeh bataiye —', 'आप साइट पे काम देखते हैं, तो ये बताइए —'], ['Theke ke kaam ki ek baat —', 'ठेके के काम की एक बात —']],
};
// Earlier answers to an insider question, some wrong on purpose: the model must neither praise nor correct.
const PROBE_ANSWERS = {
  margin_mix: ['Khule masale mein sabse zyada', 'Atte mein sabse zyada munafa hai', 'Sabme barabar hi hai'],
  distributor_cycle: ['Har mangal ko aata hai, pandrah din ka udhaar', 'Pata nahi, bhai dekhta hai', 'Sab mandi se cash mein laata hoon'],
  daily_fast_mover: ['Doodh, roz chaalis packet', 'Bahut kuch bikta hai', 'Bread aur ande'],
  udhaar_ledger: ['Khatabook app mein likhta hoon', 'Udhaar deta hi nahi', 'Diary mein, do mahine purana hai'],
  expiry_returns: ['Distributor badal deta hai', 'Aisa kabhi hua nahi'],
  licence_class: ['Class C hai, UP ka', 'Licence ki zaroorat nahi padti', 'B class hai'],
  work_orders: ['Do society ka kaam chal raha hai, saath lakh ka', 'Chhote-mote kaam hain'],
  payment_cycle: ['Builder do mahine mein deta hai, paanch percent rokta hai', 'Turant mil jaata hai poora'],
  material_share: ['Saath-sattar percent material mein', 'Material toh customer laata hai'],
  point_rate: ['Pachaas rupaye point', 'Jo mil jaaye'],
};
const PURPOSES = [
  { said: 'Himachal mein cafe kholna hai', cap: 'Himachal mein cafe', dev: 'हिमाचल में कैफ़े', facts: { loan_purpose: 'Himachal mein cafe kholna' } },
  { said: 'Ek gym kholna hai', cap: 'gym', dev: 'जिम', facts: { loan_purpose: 'gym kholna' } },
  { said: 'Mobile ki dukaan kholni hai', cap: 'mobile ki dukaan', dev: 'मोबाइल की दुकान', facts: { loan_purpose: 'mobile shop kholna' } },
  { said: 'Tempo lekar chalwana hai', cap: 'tempo ka kaam', dev: 'टेम्पो का काम', facts: { loan_purpose: 'tempo lena' } },
];
const NAMES = [['Raj', 'राज'], ['Suresh', 'सुरेश'], ['Pooja', 'पूजा'], ['Imran', 'इमरान'], ['Vikas', 'विकास']];
const APPLICANTS = [['Ramesh Gupta', 'रमेश गुप्ता'], ['Sunita Devi', 'सुनीता देवी'], ['Mohd Salim', 'मोहम्मद सलीम']];
const GREETINGS = [
  ['Namaste ji! Main Sarthi hoon. Aapke baare mein thoda jaanna hai, bas kuch aasaan sawaal. Pehle apna poora naam bataiye?', 'नमस्ते जी! मैं सार्थी हूँ। आपके बारे में थोड़ा जानना है, बस कुछ आसान सवाल। पहले अपना पूरा नाम बताइए?'],
  ['Namaste! Main Sarthi, branch se. Aapke kaam ke baare mein thodi baat karni hai. Aapka poora naam kya hai?', 'नमस्ते! मैं सार्थी, ब्रांच से। आपके काम के बारे में थोड़ी बात करनी है। आपका पूरा नाम क्या है?'],
  ['Namaste ji, kaise hain? Main Sarthi hoon. Kuch seedhe sawaal poochhunga, aaram se jawaab dijiye. Pehle naam bataiye?', 'नमस्ते जी, कैसे हैं? मैं सार्थी हूँ। कुछ सीधे सवाल पूछूँगा, आराम से जवाब दीजिए। पहले नाम बताइए?'],
];

/* ------------------------------------------------------------------ builder */

export function interviewerExamples(defs, businessKnowledge, r) {
  const out = [];
  const push = (sectionLabel, directive, known, said, speech, caption, facts) => out.push({
    messages: [
      { role: 'system', content: INTERVIEWER_SLM_SYSTEM },
      { role: 'user', content: userTurn(sectionLabel, directive, known, said) },
      { role: 'assistant', content: turn(speech, caption, facts) },
    ],
  });
  const askOf = (key) => [defs[key].ask, ASK_HI[key]];
  const label = (key) => SECTION_LABEL[defs[key].section] ?? 'Business';

  // 1. Ordinary turns: acknowledge / echo / react, then the next question.
  for (let i = 0; i < ORDER.length - 1; i += 1) {
    const field = ORDER[i];
    for (let v = 0; v < 6; v += 1) {
      let next = ORDER[i + 1];
      let said; let facts; let head;
      if (RANGE[field]) {
        const [lo, hi, step] = RANGE[field];
        const n = Math.round(r.int(lo, hi) / step) * step;
        said = sayNumber(n, r);
        if (field === 'employees' && n === 0) said = 'Koi nahi, akela hi hoon';
        facts = { [field]: n };
        const [ec, ed] = ECHO[field] ?? ['{c}', '{d}'];
        const [ac, ad] = r.pick([['Achha', 'अच्छा'], ['Theek hai', 'ठीक है'], ['Ji', 'जी']]);
        head = field === 'employees' && n === 0
          ? ['Achha, akele hi.', 'अच्छा, अकेले ही।']
          : [`${ac}, ${ec.replace('{c}', captionNumber(n))}.`, `${ad}, ${ed.replace('{d}', speechNumber(n))}।`];
        const reaction = REACT[field]?.(n);
        if (reaction && r.chance(0.6)) head = [`${head[0]} ${reaction[0]}`, `${head[1]} ${reaction[1]}`];
      } else {
        const [s, f, echo] = r.pick(TEXT[field]);
        said = s; facts = f; head = echo ?? r.pick(ACK);
      }
      if (field === 'existing_loans' && facts.existing_loans === 'none') next = 'informal_loans';
      if (field === 'residence_type' && facts.residence_type !== 'rented') next = 'business_type';
      if (field === 'shop_ownership' && facts.shop_ownership !== 'rented') next = 'employees';
      const [qc, qd] = askOf(next);
      const why = NEEDS_WHY.has(next) && r.chance(0.5) ? WHY : null;
      const caption = [head[0], why?.[0], qc].filter(Boolean).join(' ');
      const speech = [head[1], why?.[1], qd].filter(Boolean).join(' ');
      push(label(next), fieldDirective(defs, next), facts, said, speech, caption, facts);
    }
  }

  // 2. Vague money answers → an easier question, same topic. Nothing recorded.
  for (const [field, [bc, bd]] of Object.entries(BREAKDOWN)) {
    for (const said of r.shuffle(VAGUE).slice(0, 4)) push(label(field), fieldDirective(defs, field), {}, said, bd, bc, null);
  }

  // 3. "Pata nahi" on a soft field → accept it and move on.
  for (const field of SOFT_FIELDS) {
    const next = r.pick(['monthly_income', 'household_expenses', 'existing_loans', 'loan_purpose']);
    for (const said of PATA_NAHI) {
      const [qc, qd] = askOf(next);
      push(label(next), fieldDirective(defs, next), {}, said, `कोई बात नहीं। ${qd}`, `Koi baat nahi. ${qc}`, null);
    }
  }

  // 4. Insider trade questions, asked plainly, never hinting — after any earlier answer, right or wrong.
  for (const [tradeId, pack] of Object.entries(businessKnowledge)) {
    if (!pack.depth?.length) continue;
    const directive = (p) => `Ask this insider trade question — a real ${pack.label} answers it without thinking: "${p.ask}" Say it in your own simple words, one question only. Never hint at the answer, never praise or correct it — just note it and move on. If they say "pata nahi", accept it.`;
    pack.depth.forEach((probe, k) => {
      const prev = pack.depth[k - 1];
      const saids = prev ? PROBE_ANSWERS[prev.key] ?? ['Haan ji'] : ['Haan ji, bataiye'];
      for (const said of saids) {
        const [lc, ld] = r.pick(LEAD_IN[tradeId] ?? [['Ek aur baat —', 'एक और बात —']]);
        const ack = /nahi|pata/i.test(said) ? ['Koi baat nahi.', 'कोई बात नहीं।'] : r.pick(ACK);
        push('Trade depth', directive(probe), { business_type: pack.label }, said,
          `${ack[1]} ${ld} ${probe.qHi}`, `${ack[0]} ${lc} ${lowerFirst(probe.ask)}`, null);
      }
    });
  }

  // 5. A loan for a different venture → curious, specific follow-ups. Never an accusation.
  for (const p of PURPOSES) {
    const known = { business_type: 'kirana', monthly_income: 30000 };
    push('Loan', fieldDirective(defs, 'purpose_reason', 'purpose_experience'), known, p.said,
      `अच्छा, ${p.dev} — यह तो बिल्कुल नया काम होगा। ${ASK_HI.purpose_reason}`,
      `Achha, ${p.cap} — yeh toh bilkul naya kaam hoga. ${defs.purpose_reason.ask}`, p.facts);
    push('Loan', fieldDirective(defs, 'purpose_experience', 'current_business_plan'), { ...known, ...p.facts }, 'Usme zyada kamai hai',
      `समझ गया। ${ASK_HI.purpose_experience}`, `Samajh gaya. ${defs.purpose_experience.ask}`, { purpose_reason: 'zyada kamai' });
    push('Loan', fieldDirective(defs, 'current_business_plan'), { ...known, ...p.facts }, 'Nahi, pehli baar karunga',
      `अच्छा, पहली बार। ${ASK_HI.current_business_plan}`, `Achha, pehli baar. ${defs.current_business_plan.ask}`, { purpose_experience: 'none, first time' });
    const amt = r.pick([1500000, 2500000, 5000000]);
    push('Loan', fieldDirective(defs, 'amount_basis'), { ...known, ...p.facts }, sayNumber(amt, r),
      `अच्छा, ${speechNumber(amt)}। ${ASK_HI.amount_basis}`, `Achha, ${captionNumber(amt)}. ${defs.amount_basis.ask}`, { loan_amount: amt });
  }

  // 6. The name given is not the applicant's → ask the relation, politely.
  for (const [nc, nd] of NAMES) {
    const [ac, ad] = r.pick(APPLICANTS);
    push('Personal', `Ask about: Who is speaking, if not the applicant. Plain-words example: "Yeh application ${ac} ji ke naam se hai. Aap unke kya lagte hain?" Ask ONE thing at a time, in your own words, as simply as the example.`,
      { stated_name: nc }, nc,
      `जी, ${nd} जी। यह एप्लीकेशन ${ad} जी के नाम से है — आप उनके क्या लगते हैं?`,
      `Ji, ${nc} ji. Yeh application ${ac} ji ke naam se hai — aap unke kya lagte hain?`, { stated_name: nc });
  }

  // 7. Not a real answer → ask again, never reinterpret ("abcd" is not "Abdul").
  for (const junk of ['abcd', 'asdf', 'xyz', '12345', 'test']) {
    push('Personal', fieldDirective(defs, 'stated_name'), {}, junk,
      'माफ़ कीजिए, ठीक से समझ नहीं आया। अपना पूरा नाम फिर से बताइए?', 'Maaf kijiye, theek se samajh nahi aaya. Apna poora naam phir se bataiye?', null);
  }

  // 8. They ask something back → one honest line, then the same question again.
  for (const [said, [rc, rd]] of ASK_BACK) {
    for (const field of r.shuffle(['monthly_sales', 'existing_emi', 'household_expenses']).slice(0, 2)) {
      const [qc, qd] = askOf(field);
      push(label(field), fieldDirective(defs, field), {}, said, `${rd} ${qd}`, `${rc} ${qc}`, null);
    }
  }

  // 9. They correct themselves mid-answer → echo the final figure only.
  for (let k = 0; k < 8; k += 1) {
    const a = r.int(2, 7) * 5000; const b = a + r.int(1, 4) * 5000;
    const [qc, qd] = askOf('household_expenses');
    push('Financial', fieldDirective(defs, 'household_expenses'), {}, `${sayNumber(a, r)}... nahi nahi, ${sayNumber(b, r)} bachta hai`,
      `अच्छा, ${speechNumber(b)}। ${qd}`, `Achha, ${captionNumber(b)}. ${qc}`, { monthly_income: b });
  }

  // 10. A flagged mismatch → a gentle question that lets them explain. Never "you said earlier…".
  for (let k = 0; k < 6; k += 1) {
    const bank = r.int(25, 40) * 1000; const said = bank * 2;
    push('Financial', `${fieldDirective(defs, 'household_expenses')} Also follow up naturally on the flagged items below. Never confront, never say they contradicted themselves.\nFLAG: Declared income ${said} is 100% above bank credits ${bank}`,
      {}, `${sayNumber(said, r)} bachta hai`,
      `अच्छा, ${speechNumber(said)}। इसमें दुकान के अलावा, घर में किसी और की कमाई भी जुड़ी है क्या?`,
      `Achha, ${captionNumber(said)}. Ismein dukaan ke alawa ghar mein kisi aur ki kamai bhi judi hai kya?`, { monthly_income: said });
  }

  // 11. Openings.
  for (const [gc, gd] of GREETINGS) {
    push('Opening', 'Greet in two short, friendly sentences — say you\'d like to know a little about them and their kaam, with a few easy questions. Then ask them to tell you their full name.',
      {}, '[System: the borrower has joined the call. Greet them and begin the interview.]', gd, gc, null);
  }

  return out;
}
