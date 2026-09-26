// Fact-extraction set: the source examples cleaned to the current schema, plus examples for thin and new fields.
import { sayNumber } from './lang.mjs';

// The exact user message extractFacts() sends (services/sarthi/model.js) — train on what inference sees.
export const userMessage = (section, question, answer) =>
  `Interview section: ${section || 'unknown'}\n\nFor context, the last thing Sarthi asked: "${question}"\n\nBorrower's answer: "${answer}"`;

// Source "[Context: Previous question was about X]" topics → the field whose question was asked.
const TOPIC_FIELD = {
  'monthly income': 'monthly_income', income: 'monthly_income', 'income (corrected)': 'monthly_income', 'daily income': 'monthly_income',
  'business type': 'business_type', business: 'business_type', 'business details': 'business_type', 'business and sales': 'monthly_sales',
  'business vintage': 'business_age', rent: 'monthly_rent', 'shop rent': 'shop_rent', 'rent and residence': 'monthly_rent',
  employees: 'employees', 'existing loans': 'existing_loans', loans: 'existing_loans', loan: 'loan_purpose', family: 'family_size',
  sales: 'monthly_sales', 'daily sales': 'peak_day_sales', 'peak sales': 'peak_day_sales', 'slow sales': 'slow_day_sales',
  expenses: 'monthly_expenses', 'daily expense': 'monthly_expenses', residence: 'residence_type', age: 'age',
  'loan purpose': 'loan_purpose', 'loan amount': 'loan_amount', payment: 'payment_mode', supplier: 'supplier_credit',
  seasonal: 'seasonal_variation', ownership: 'ownership', savings: 'savings', 'bill value': 'avg_bill_value',
  customers: 'customers_per_day', bank: 'bank_account', banking: 'bank_account', repayment: 'repayment_plan',
  products: 'products_services', purchase: 'monthly_purchase', stock: 'stock_value', 'family income': 'other_household_income',
  'income and emi': 'existing_emi', 'income and expenses': 'monthly_income', 'business and income': 'monthly_income',
  'business financials': 'monthly_sales', 'financial summary': 'monthly_income', 'yearly turnover': 'monthly_sales',
  'age and business': 'age', 'business and loan': 'loan_purpose', aadhaar: 'aadhaar_address_match', pan: 'pan_type',
  documents: 'business_registration', 'property value': 'assets',
};
const KNOWLEDGE_Q = {
  'area knowledge': ['verification', 'Aapke area mein sabse paas ka police thana kaunsa hai?'],
  'business knowledge': ['verification', 'Supplier se maal udhaar pe milta hai ya cash mein lete ho?'],
  introduction: ['greeting', 'Namaste! Aapka poora naam bataiye?'],
  greeting: ['greeting', 'Namaste! Aapka poora naam bataiye?'],
};

const ENUM_FIX = { own: 'owned', owned: 'owned', self: 'owned', rent: 'rented', rented: 'rented', parental: 'family', family: 'family' };
const LOAN_KINDS = [['gold', 'gold loan'], ['personal', 'personal loan'], ['home', 'home loan'], ['car', 'car loan'],
  ['bike', 'two-wheeler loan'], ['vehicle', 'vehicle loan'], ['microfinance', 'microfinance loan'], ['business', 'business loan'],
  ['mudra', 'mudra loan'], ['education', 'education loan'], ['credit card', 'credit card']];

// Loans still running, by name — a clause in the past tense ("car loan tha", "khatam ho gaya") is a closed one.
function runningLoans(answer) {
  const open = answer.split(/,|\bab\b|\baur\b/i).filter((c) => !/\btha\b|\bthi\b|khatam|band ho|clear ho/i.test(c)).join(' ');
  return LOAN_KINDS.filter(([w]) => new RegExp(`\\b${w}\\b`, 'i').test(open)).map(([, name]) => name);
}

// Which rent a clause is about, from its own words.
function splitRent(answer, readNumbers) {
  const out = {};
  for (const clause of answer.split(/,|\baur\b|\band\b/i)) {
    const nums = readNumbers(clause);
    if (nums.length !== 1) continue;
    if (/dukaan|dukan|shop|godown|showroom/i.test(clause)) out.shop_rent = nums[0].value;
    else if (/ghar|makaan|makan|room|flat|house/i.test(clause)) out.monthly_rent = nums[0].value;
  }
  return out;
}

/** Cleans one source record into the app's format and schema. Returns { record, changes } or null. */
export function cleanExample(o, h, log) {
  const [, u, a] = o.messages;
  const topic = u.content.match(/Previous question was about ([^\]]+)\]/)?.[1]?.toLowerCase() ?? '';
  const answer = (u.content.split('Borrower:')[1] ?? '').trim();
  if (!answer) return null;
  let facts;
  try { facts = JSON.parse(a.content); } catch { return null; }

  const note = (msg) => log.push(`${msg} :: "${answer.slice(0, 90)}"`);
  const out = {};
  for (const [k, v] of Object.entries(facts)) {
    if (!h.EXTRACTABLE_KEYS.includes(k)) { note(`dropped unknown key ${k}`); continue; }
    const def = h.FIELD_DEFS[k];
    let value = v;

    if (k === 'existing_loans' && typeof v === 'number') {
      const kinds = runningLoans(answer);
      value = v === 0 ? 'none' : kinds.length ? kinds.join(', ') : `${v} loan${v > 1 ? 's' : ''}`;
      note(`existing_loans ${v} → "${value}" (text field)`);
    }
    if (k === 'credit_given' && typeof v !== 'number') {
      // Schema: rupees of udhaar outstanding. The source used it for a credit period.
      if (/none|nahi/i.test(String(v))) value = 0;
      else { note(`dropped credit_given "${v}" — a period, not the amount outstanding`); continue; }
    }
    if (def?.options) {
      const fixed = def.options.includes(value) ? value : ENUM_FIX[String(value).toLowerCase()];
      if (!fixed || !def.options.includes(fixed)) { note(`dropped ${k}="${value}" — not one of ${def.options.join('/')}`); continue; }
      value = fixed;
    }
    if (def?.type === 'number' && typeof value === 'number' && !['family_size', 'dependents', 'earning_members'].includes(k)) {
      const r = h.reconcile(value, answer);
      if (r.corrected) { note(`${k} ${value} → ${r.value} (the words say ${r.value})`); value = r.value; }
    }
    out[k] = value;
  }

  // One monthly_rent covering shop and house becomes two fields, as the app records them.
  if (out.monthly_rent != null && /dukaan|dukan|shop/i.test(answer)) {
    const split = splitRent(answer, h.readNumbers);
    // A bare "pandrah" beside "aath hazaar" is ambiguous — drop the example rather than teach a guess.
    if (Object.values(split).some((v) => v < 100)) { note('dropped — rent figure without a scale word'); return null; }
    if (split.shop_rent != null) {
      delete out.monthly_rent;
      Object.assign(out, split);
      note(`rent split → ${JSON.stringify(split)}`);
    }
  }

  let section; let question;
  if (KNOWLEDGE_Q[topic]) [section, question] = KNOWLEDGE_Q[topic];
  const field = TOPIC_FIELD[topic] ?? Object.keys(out).find((k) => h.FIELD_DEFS[k]);
  if (!question && field && h.FIELD_DEFS[field]) {
    section = h.FIELD_DEFS[field].section;
    question = h.FIELD_DEFS[field].ask.replace('{applicant}', 'Ramesh Gupta');
  }
  if (!question) { section = 'financial'; question = h.FIELD_DEFS.monthly_income.ask; }

  return example(h, section, question, answer, out);
}

export const example = (h, section, question, answer, facts) => ({
  messages: [
    { role: 'system', content: h.EXTRACTOR_SYSTEM },
    { role: 'user', content: userMessage(section, question, answer) },
    { role: 'assistant', content: JSON.stringify(facts) },
  ],
});

/* ------------------------------------------------------------------ new examples */

const round = (r, lo, hi, step) => Math.round(r.int(lo, hi) / step) * step;
const NAMES = ['Ramesh Kumar', 'Sunita Devi', 'Mohd Salim', 'Pooja Sharma', 'Rajendra Yadav', 'Farida Begum',
  'Suresh Patil', 'Kavita Jain', 'Anil Chauhan', 'Imran Khan', 'Geeta Rani', 'Manoj Tiwari'];

// Each entry: [field whose question was asked, (r, say) => [answer, facts]]. `say(n)` speaks a number.
const TEMPLATES = [
  ['shop_rent', (r, say) => { const n = round(r, 3000, 40000, 500); return [r.pick([`Dukaan ka kiraya ${say(n)} hai`, `${say(n)} mahina dete hain dukaan ka`, `Shop ka rent ${say(n)}`]), { shop_rent: n }]; }],
  ['monthly_rent', (r, say) => { const a = round(r, 4000, 40000, 500); const b = round(r, 2000, 20000, 500); return [`Dukaan ka kiraya ${say(a)} aur ghar ka ${say(b)}`, { shop_rent: a, monthly_rent: b }]; }],
  ['monthly_rent', (r, say) => { const n = round(r, 2000, 20000, 500); return [r.pick([`Ghar ka kiraya ${say(n)} hai`, `Kiraye ka kamra hai, ${say(n)} mahina`]), { residence_type: 'rented', monthly_rent: n }]; }],
  ['shop_ownership', (r) => r.pick([
    ['Sasur ji ki dukaan hai', { shop_ownership: 'family' }],
    ['Dukaan meri apni hai, registry mere naam', { shop_ownership: 'owned' }],
    ['Pagdi pe li hai, mahina kiraya deta hoon', { shop_ownership: 'rented' }],
    ['Footpath pe lagata hoon, dukaan nahi', { shop_ownership: 'none' }],
    ['Dukaan apni hai, khareedi thi', { shop_ownership: 'owned' }],
    ['Kiraye ki hai dukaan', { shop_ownership: 'rented' }],
    ['Papa ki dukaan hai, wahi baithta hoon', { shop_ownership: 'family' }],
    ['Dukaan nahi hai, thela lagata hoon', { shop_ownership: 'none' }],
    ['Apni nahi hai, kiraya deta hoon', { shop_ownership: 'rented' }],
  ])],
  ['earning_members', (r) => r.pick([
    ['Main aur mera beta, dono dukaan pe', { earning_members: 2 }],
    ['Papa pension late hain, aur main', { earning_members: 2 }],
    ['Main, wife aur bada beta — teen log', { earning_members: 3 }],
    ['Akela main hi kamane wala hoon', { earning_members: 1 }],
    ['Sirf main hi kamata hoon', { earning_members: 1 }],
    ['Main aur meri wife, dono kaam karte hain', { earning_members: 2 }],
    ['Main, mera bhai aur papa — teeno kamate hain', { earning_members: 3 }],
    ['Beta bhi naukri karta hai', { earning_members: 2 }],
    ['Koi nahi, bas main', { earning_members: 1 }],
  ])],
  ['other_household_income', (r, say) => { const n = round(r, 5000, 40000, 1000); return [r.pick([`Wife silai karti hai, ${say(n)} mahina`, `Bhai ki salary ${say(n)} hai`, `Beta ${say(n)} kama leta hai`]), { other_household_income: n }]; }],
  ['stock_value', (r, say) => { const n = round(r, 50000, 1500000, 10000); return [r.pick([`Abhi ${say(n)} ka maal pada hoga`, `Lagbhag ${say(n)} ka stock hai`]), { stock_value: n }]; }],
  ['own_contribution', (r, say) => { const n = round(r, 20000, 500000, 5000); return [r.pick([`Apni taraf se ${say(n)} lagaunga`, `${say(n)} bachat se daal dunga`, `Mere paas ${say(n)} hai, woh lagaunga`]), { own_contribution: n }]; }],
  ['own_contribution', (r) => r.pick([['Apna kuch nahi hai lagane ko, poora loan se hi', { own_contribution: 0 }], ['Abhi kuch nahi, sab loan se karenge', { own_contribution: 0 }]])],
  ['monthly_expenses', (r, say) => { const n = round(r, 5000, 80000, 1000); return [r.pick([`Sab milake ${say(n)} ka kharcha hai`, `Kiraya, bijli, ladke ki tankhwah — ${say(n)} ho jaata hai`]), { monthly_expenses: n }]; }],
  ['credit_given', (r, say) => { const n = round(r, 5000, 100000, 1000); return [r.pick([`Grahakon ka ${say(n)} udhaar baaki hai`, `Khate mein ${say(n)} pada hai logon ka`]), { credit_given: n }]; }],
  ['monthly_purchase', (r, say) => { const n = round(r, 50000, 800000, 10000); return [r.pick([`Mahine ka ${say(n)} ka maal aata hai`, `${say(n)} ki kharidi hoti hai mahine mein`]), { monthly_purchase: n }]; }],
  ['existing_emi', (r, say) => { const n = round(r, 2000, 30000, 500); return [r.pick([`Kisht ${say(n)} jaati hai`, `Mahine ki EMI ${say(n)}`]), { existing_emi: n }]; }],
  ['existing_loans', (r) => r.pick([
    ['Koi loan nahi hai', { existing_loans: 'none' }],
    ['No loan, sab clear hai', { existing_loans: 'none' }],
    ['Ek gold loan chal raha hai bas', { existing_loans: 'gold loan' }],
    ['Bajaj se bike ka loan hai', { existing_loans: 'two-wheeler loan' }],
  ])],
  ['informal_loans', (r, say) => { const n = round(r, 1000, 10000, 500); const m = round(r, 20000, 200000, 5000); return r.pick([
    [`Committee mein ${say(n)} mahina bharta hoon`, { informal_loans: `committee ${n} mahina` }],
    [`Sahukar se ${say(m)} liye the`, { informal_loans: `sahukar se ${m}` }],
    [`Mama ji se ${say(m)} udhaar liya tha`, { informal_loans: `rishtedaar se ${m}` }],
    ['Nahi, aisa kuch nahi', { informal_loans: 'none' }],
  ]); }],
  ['repayment_history', (r) => r.pick([
    ['Lockdown mein do mahine ruki thi, phir bhar di', { repayment_history: 'lockdown mein 2 mahine ruki, phir bhari' }],
    ['Pehle kabhi loan hi nahi liya', { repayment_history: 'no past loans' }],
    ['Ek baar Covid mein kisht der se gayi thi', { repayment_history: 'ek baar Covid mein der se' }],
    ['Kabhi nahi chhooti', { repayment_history: 'never missed' }],
    ['Do teen baar late hua tha pichhle saal', { repayment_history: 'pichhle saal 2-3 baar late' }],
  ])],
  ['assets', (r) => r.pick([
    ['Ek Activa hai aur thoda sona', { assets: 'scooter, sona' }],
    ['Plot hai chhota sa, gaon mein', { assets: 'gaon mein plot' }],
    ['Gaon mein thodi zameen hai aur ek bike', { assets: 'gaon mein zameen, bike' }],
    ['Kuch nahi, bas thoda sona hai', { assets: 'sona' }],
    ['Makaan apne naam pe hai', { assets: 'makaan' }],
  ])],
  ['business_registration', (r) => r.pick([
    ['Shop Act ka licence hai', { business_registration: 'Shop Act licence' }], ['FSSAI hai bas', { business_registration: 'FSSAI' }],
    ['Udyam registration hai, GST nahi', { business_registration: 'Udyam, no GST' }],
    ['GST hai, teen saal se', { business_registration: 'GST, 3 years' }],
    ['Kuch nahi hai registration', { business_registration: 'none' }],
    ['Nagar nigam ka trade licence hai', { business_registration: 'trade licence' }],
  ])],
  ['stated_name', (r) => { const n = r.pick(NAMES); return r.pick([[`Mera naam ${n} hai`, { stated_name: n }], [`Ji, ${n}`, { stated_name: n }], [n, { stated_name: n }]]); }],
  ['applicant_name', (r) => { const n = r.pick(NAMES); return r.pick([[`Mera naam ${n} hai`, { applicant_name: n }], [n, { applicant_name: n }]]); }],
  ['peak_day_sales', (r, say) => { const n = round(r, 3000, 60000, 500); return [r.pick([`Achhe din ${say(n)} tak ho jaata hai`, `Sunday ko ${say(n)} ki bikri`]), { peak_day_sales: n }]; }],
  ['slow_day_sales', (r, say) => { const n = round(r, 500, 15000, 500); return [r.pick([`Halke din ${say(n)} bhi mushkil se`, `Mangal ko bas ${say(n)}`]), { slow_day_sales: n }]; }],
  ['seasonal_variation', (r) => r.pick([['Diwali aur shaadi ke season mein zyada', { seasonal_variation: 'high in Diwali and wedding season' }],
    ['Barsaat mein kaam ekdum kam', { seasonal_variation: 'low in monsoon' }], ['Garmi mein cold drink ki wajah se zyada', { seasonal_variation: 'high in summer' }],
    ['Saal bhar ek jaisa', { seasonal_variation: 'none' }], ['Eid aur Ramzan mein bahut', { seasonal_variation: 'high in Eid and Ramzan' }]])],
  ['bank_account', (r) => r.pick([['SBI mein hai', { bank_account: 'SBI' }], ['Gramin bank mein', { bank_account: 'Gramin bank' }],
    ['Post office aur Bank of Baroda', { bank_account: 'Post office, Bank of Baroda' }], ['Cooperative bank mein', { bank_account: 'cooperative bank' }]])],
  ['savings', (r) => r.pick([['Paanch hazaar ki RD chal rahi hai', { savings: 'RD 5000' }], ['Thoda sona hai bas', { savings: 'gold' }],
    ['Committee mein daalte hain', { savings: 'committee' }], ['Kuch nahi bachta', { savings: 'none' }]])],
  ['products_services', (r) => r.pick([['Wire, switch, MCB, fitting ka saamaan', { products_services: 'wire, switch, MCB, fittings' }],
    ['Samosa, kachori, chai', { products_services: 'samosa, kachori, chai' }], ['Mobile recharge, cover, repair', { products_services: 'recharge, mobile cover, repair' }],
    ['Doodh, dahi, paneer', { products_services: 'milk, curd, paneer' }], ['Bacchon ke kapde aur school dress', { products_services: 'kids clothes, school uniform' }]])],
  ['aadhaar_number', (r) => { const n = `${r.int(2, 9)}${String(r.int(0, 99999999999)).padStart(11, '0')}`; return [n.replace(/(\d{4})(?=\d)/g, '$1 '), { aadhaar_number: n }]; }],
  ['pan_number', (r) => { const L = () => String.fromCharCode(65 + r.int(0, 25)); const p = `${L()}${L()}${L()}P${L()}${r.int(1000, 9999)}${L()}`; return [p, { pan_number: p }]; }],
  ['aadhaar_address', (r) => r.pick([['Gaon Rampur, zila Sitapur', { aadhaar_address: 'Rampur, Sitapur' }], ['Makaan 12, Nehru Nagar, Kanpur', { aadhaar_address: 'H.No 12, Nehru Nagar, Kanpur' }],
    ['Wahi ghar ka pata, Shastri colony', { aadhaar_address: 'Shastri colony' }]])],
  ['repayment_plan', (r) => r.pick([['Dukaan ki kamai se bharunga', { repayment_plan: 'from business income' }], ['Beta bhi madad karega', { repayment_plan: 'business income, son helps' }],
    ['Halka mahina hua toh bachat se', { repayment_plan: 'business income, savings in lean months' }], ['Kiraye ki aamdani se', { repayment_plan: 'from rental income' }]])],
  ['stated_name', (r) => { const junk = r.pick(['abcd', 'asdf', 'xyz', 'test']); return [junk, { stated_name: junk }]; }],
  ['speaker_relation', (r) => r.pick([
    ['Bhatija hoon unka', { speaker_relation: 'family' }],
    ['Unka munim hoon', { speaker_relation: 'employee' }],
    ['DSA hoon, unka case le ke aaya', { speaker_relation: 'agent' }],
    ['Haan main wahi hoon, naam galat bol diya', { speaker_relation: 'self' }],
    ['Main unka beta hoon', { speaker_relation: 'family' }],
    ['Main unki wife hoon', { speaker_relation: 'family' }],
    ['Main dukaan pe kaam karta hoon unki', { speaker_relation: 'employee' }],
    ['Main agent hoon, file maine lagwayi hai', { speaker_relation: 'agent' }],
    ['Main hi hoon, ghar mein sab Raju bulate hain', { speaker_relation: 'self' }],
    ['Padosi hoon, unki madad kar raha hoon', { speaker_relation: 'other' }],
  ])],
  ['purpose_reason', (r) => r.pick([
    ['Log maangte hain, dukaan mein jagah kam hai', { purpose_reason: 'demand hai, jagah kam' }],
    ['Bhai ka idea hai, woh chalayega', { purpose_reason: 'bhai ka idea, bhai chalayega' }],
    ['Wahan tourist bahut aate hain, cafe chalega', { purpose_reason: 'tourists aate hain, cafe chalega' }],
    ['Kirane mein ab margin nahi raha', { purpose_reason: 'kirane mein margin kam' }],
    ['Beti ki shaadi hai, paisa chahiye', { purpose_reason: 'beti ki shaadi' }],
    ['Dost ne bola isme achha paisa hai', { purpose_reason: 'dost ne bola achha paisa hai' }],
  ])],
  ['purpose_experience', (r) => r.pick([
    ['YouTube se seekh raha hoon', { purpose_experience: 'YouTube se seekh raha' }],
    ['Paanch saal wahi kaam kiya hai naukri mein', { purpose_experience: '5 saal naukri mein wahi kaam' }],
    ['Nahi, pehli baar karunga', { purpose_experience: 'none, first time' }],
    ['Do saal hotel mein kaam kiya tha', { purpose_experience: '2 saal hotel mein kaam' }],
    ['Mama ka dhaba hai, wahan dekha hai', { purpose_experience: 'mama ke dhabe pe dekha' }],
  ])],
  ['current_business_plan', (r) => r.pick([
    ['Wife sambhal legi, woh roz baithti hai', { current_business_plan: 'wife sambhalegi' }],
    ['Naukar rakhunga', { current_business_plan: 'naukar rakhega' }],
    ['Chhota bhai sambhal lega', { current_business_plan: 'chhota bhai sambhalega' }],
    ['Band kar dunga kirana', { current_business_plan: 'kirana band karega' }],
    ['Dono main hi dekhunga', { current_business_plan: 'dono khud dekhega' }],
  ])],
  ['amount_basis', (r, say) => { const a = round(r, 100000, 2000000, 50000); const b = round(r, 50000, 800000, 50000); return [`${say(a)} ka saamaan aur ${say(b)} ka kiraya-advance`, { amount_basis: `${a} saamaan, ${b} kiraya-advance` }]; }],
  ['amount_basis', (r) => r.pick([['Bas andaaza lagaya', { amount_basis: 'andaaza, no breakdown' }], ['Pata nahi, jitna mil jaaye', { amount_basis: 'no breakdown' }]])],
  ['supplier_names', (r) => r.pick([
    ['Parle aur Britannia ka stockist aata hai', { supplier_names: 'Parle stockist, Britannia stockist' }],
    ['Surat se kapda mangwata hoon', { supplier_names: 'Surat wholesalers' }],
    ['Sharma Traders se aur Metro se', { supplier_names: 'Sharma Traders, Metro' }],
    ['HUL ka distributor aata hai, aur mandi se', { supplier_names: 'HUL distributor, mandi' }],
    ['Havells ke dealer se wire lete hain', { supplier_names: 'Havells dealer' }],
  ])],
  ['supplier_credit', (r) => { const d = r.pick([7, 10, 15, 30]); return r.pick([[`${sayDays(d)} ka udhaar deta hai distributor`, { supplier_credit: `${d} days` }], ['Sab nakad dena padta hai', { supplier_credit: 'none' }]]); }],
  ['payment_mode', (r) => r.pick([
    ['QR laga hai, zyada log wahi karte hain', { payment_mode: 'mostly upi' }], ['Cash hi, gaon hai', { payment_mode: 'cash' }],['Aadhe log UPI karte hain', { payment_mode: 'cash and upi' }], ['Zyada cash hi aata hai', { payment_mode: 'mostly cash' }], ['Ab toh sab PhonePe hi karte hain', { payment_mode: 'mostly upi' }]])],
  ['customers_per_day', (r, say) => { const n = round(r, 20, 250, 5); return [r.pick([`Roz ${say(n)} grahak aate hain`, `${say(n)} log toh aa hi jaate hain`]), { customers_per_day: n }]; }],
  ['avg_bill_value', (r, say) => { const n = round(r, 50, 800, 10); return [`Ek grahak ${say(n)} rupaye ka leta hai`, { avg_bill_value: n }]; }],
  ['residence_duration', (r, say) => { const n = r.int(2, 30); return [`${say(n)} saal se yahin hain`, { residence_duration: n }]; }],
  ['age', (r, say) => { const n = r.int(21, 62); return [r.pick([`${say(n)} saal`, `Umar ${say(n)} hai`]), { age: n }]; }],
  ['household_expenses', (r, say) => { const n = round(r, 8000, 45000, 1000); return [`Ghar ka ${say(n)} lag jaata hai`, { household_expenses: n }]; }],
  ['monthly_income', (r, say) => { const a = round(r, 15000, 60000, 5000); let b = round(r, 15000, 80000, 5000); if (b === a) b += 5000; return [`${say(a)}... nahi nahi, ${say(b)} bachta hai`, { monthly_income: b }]; }],
  ['ownership', (r) => r.pick([
    ['Bhai ke saath partnership mein', { ownership: 'partnership' }], ['Main akela, koi partner nahi', { ownership: 'sole' }], ['Ghar wale sab milke chalate hain', { ownership: 'family' }],['Mere saath partner hai, Sharma ji', { ownership: 'partnership' }], ['Akela hi chalata hoon', { ownership: 'sole' }], ['Papa aur main milke', { ownership: 'family' }]])],
  ['bank_account_type', (r) => r.pick([
    ['Saving hi hai', { bank_account_type: 'savings' }], ['Dukaan ke naam ka current', { bank_account_type: 'current' }],['Current account hai dukaan ka', { bank_account_type: 'current' }], ['Bachat khaata hai bas', { bank_account_type: 'savings' }], ['Dono hain', { bank_account_type: 'both' }]])],
  ['aadhaar_address_match', (r) => r.pick([
    ['Ji, yahi ka hai', { aadhaar_address_match: 'match' }], ['Purana pata hai, abhi update nahi kiya', { aadhaar_address_match: 'different' }],['Haan wahi pata hai', { aadhaar_address_match: 'match' }], ['Nahi, Aadhaar pe gaon ka pata hai', { aadhaar_address_match: 'different' }]])],
  ['pan_type', (r) => r.pick([
    ['Personal hai', { pan_type: 'personal' }], ['Dukaan ke naam pe alag PAN hai', { pan_type: 'firm' }],['Mere naam ka hai', { pan_type: 'personal' }], ['Firm ke naam ka hai', { pan_type: 'firm' }]])],
];

const sayDays = (d) => ({ 7: 'saat din', 10: 'das din', 15: 'pandrah din', 30: 'ek mahine' }[d]);

// Answers that state nothing, whatever was asked — the model must learn to return {}.
const NOTHING = ['Pata nahi', 'Yaad nahi abhi', 'Aap hi bata do', 'Hmm... sochna padega', 'Theek hai ji', 'Loan kab tak milega?',
  'Haan haan', 'Ek minute', 'Woh toh mere bhai ko pata hoga'];

/** New examples, each checked against the app's own parser so no label disagrees with the words. */
export function newExamples(h, r, counts, target = 22) {
  const out = [];
  const say = (n) => sayNumber(n, r);
  const perTemplate = {};
  for (const [field] of TEMPLATES) perTemplate[field] = (perTemplate[field] ?? 0) + 1;

  for (const [field, make] of TEMPLATES) {
    const have = counts[field] ?? 0;
    const want = Math.max(4, Math.ceil(Math.max(0, target - have) / perTemplate[field]));
    const seen = new Set();
    for (let tries = 0; tries < want * 6 && seen.size < want; tries += 1) {
      const [core, raw] = make(r, say);
      const opener = r.pick(['', '', 'Ji, ', 'Haan ji, ', 'Dekhiye, ', 'Sach bataun toh, ']);
      const answer = opener ? `${opener}${core.charAt(0).toLowerCase()}${core.slice(1)}` : core;
      const facts = Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== undefined));
      if (seen.has(answer)) continue;
      // Every number label must be exactly what the parser reads from the words (or a kept zero).
      const bad = Object.entries(facts).some(([k, v]) => h.FIELD_DEFS[k]?.type === 'number' && typeof v === 'number'
        && !['earning_members'].includes(k) && h.reconcile(v, answer).corrected);
      if (bad) continue;
      seen.add(answer);
      const def = h.FIELD_DEFS[field];
      out.push(example(h, def.section, def.ask.replace('{applicant}', 'Ramesh Gupta'), answer, facts));
    }
  }
  for (const answer of NOTHING) {
    const field = r.pick(['monthly_income', 'monthly_sales', 'customers_per_day', 'loan_amount', 'existing_emi']);
    out.push(example(h, h.FIELD_DEFS[field].section, h.FIELD_DEFS[field].ask, answer, {}));
  }
  return out;
}
