// Canned replies for DEV (VITE_SARTHI_MOCKS=true) so loop/UI work does not burn free-tier quota.
// Raw fenced text through the real parser: proves the plumbing, not that the model follows the prompt.

export const MOCKS_ON = import.meta.env.DEV && import.meta.env.VITE_SARTHI_MOCKS === 'true';

const LATENCY = { slm: 300, llm: 2000 };

const wait = (ms) => new Promise((r) => { setTimeout(r, ms); });

// Fact extraction

// Keyed by a word in the answer; first match wins.
const EXTRACT_BY_KEYWORD = [
  [/kirana|grocery|general store|dukaan/i, { business_type: 'kirana store', business_age: 5 }],
  [/garment|kapda|readymade/i, { business_type: 'garment shop', business_age: 2 }],
  [/lakh|hazaar|kamaai|income|kamata/i, { monthly_income: 300000 }],
  [/kiraye|rent|kiraya/i, { residence_type: 'rented', monthly_rent: 15000 }],
  [/bacche|family|parivaar|log hain/i, { family_size: 4, dependents: 2, age: 38 }],
  [/emi|loan|karza|credit card/i, { existing_loans: 'personal loan and credit card', existing_emi: 18000 }],
  [/customer|grahak|din mein/i, { customers_per_day: 55, avg_bill_value: 250 }],
  [/thana|police|bijli|metro|station/i, { area_knowledge_score: 'high' }],
  [/margin|distributor|supplier|mandi/i, { business_domain_score: 'low' }],
];

export async function mockExtractFacts(answerText) {
  await wait(LATENCY.slm);
  const hit = EXTRACT_BY_KEYWORD.find(([re]) => re.test(answerText));
  return hit ? { ...hit[1] } : {};
}

// Interview turns

const TURNS = {
  greeting: {
    display: 'Namaste! Main Sarthi hoon, aapka AI interviewer. Aaj hum aapki loan application ke baare mein thodi baat karenge. Aap Ramesh ji hain na?',
    speech: 'नमस्ते! मैं सारथी हूँ, आपका एआई इंटरव्यूअर। आज हम आपकी लोन एप्लीकेशन के बारे में थोड़ी बात करेंगे। आप रमेश जी हैं ना?',
  },
  personal: {
    display: 'Acha Ramesh ji. Ghar mein kitne log hain aapke saath? Bacche kitne hain?',
    speech: 'अच्छा रमेश जी। घर में कितने लोग हैं आपके साथ? बच्चे कितने हैं?',
  },
  business: {
    display: 'Badhiya. Toh ye garment ka kaam kitne saal se kar rahe hain aap?',
    speech: 'बढ़िया। तो ये गारमेंट का काम कितने साल से कर रहे हैं आप?',
    claim: { claim_type: 'vintage', stated_value: '2', unit: 'years', verbatim: 'do saal se', confidence: 'direct_statement' },
  },
  business_deep_dive: {
    display: 'Ek baat bataaiye, din bhar mein kitne customer aa jaate hain? Aur average bill kitne ka banta hai?',
    speech: 'एक बात बताइए, दिन भर में कितने कस्टमर आ जाते हैं? और एवरेज बिल कितने का बनता है?',
  },
  financial: {
    display: 'Toh mahine ki kamaai roughly kitni ho jaati hai shop se?',
    speech: 'तो महीने की कमाई, लगभग कितनी हो जाती है शॉप से?',
    claim: { claim_type: 'income', stated_value: '300000', unit: 'per_month', verbatim: 'teen lakh aata hai mahine ka', confidence: 'direct_statement' },
  },
  documents: {
    display: 'Aadhaar card mein kaunsa address likha hai? Wahi jahan abhi rehte hain?',
    speech: 'आधार कार्ड में कौन सा एड्रेस लिखा है? वही जहाँ अभी रहते हैं?',
  },
  loan_purpose: {
    display: 'Ye loan kis kaam ke liye chahiye aapko? Aur wapas kaise karenge, kya socha hai?',
    speech: 'ये लोन किस काम के लिए चाहिए आपको? और वापस कैसे करेंगे, क्या सोचा है?',
  },
  verification: {
    display: 'Waise aapke area mein thana kaunsa padta hai? Aur bijli kis company se aati hai?',
    speech: 'वैसे आपके एरिया में थाना कौन सा पड़ता है? और बिजली किस कंपनी से आती है?',
  },
  income_recheck: {
    display: 'Acha ek aur baat — mahine mein total collection kitna ho jaata hai, cash aur UPI milakar?',
    speech: 'अच्छा एक और बात, महीने में टोटल कलेक्शन कितना हो जाता है, कैश और यूपीआई मिलाकर?',
    claim: { claim_type: 'income', stated_value: '250000', unit: 'per_month', verbatim: 'dhaai lakh ke aas paas', confidence: 'direct_statement' },
  },
  closing: {
    display: 'Bahut badhiya Ramesh ji, bas itna hi tha. Officer sahab aapko jaldi update denge. Dhanyavaad! [INTERVIEW_COMPLETE]',
    speech: 'बहुत बढ़िया रमेश जी, बस इतना ही था। ऑफिसर साहब आपको जल्दी अपडेट देंगे। धन्यवाद!',
  },
};

const FENCE = '```';

export async function mockTurn(section, turn, provider = 'slm') {
  await wait(LATENCY[provider] ?? LATENCY.slm);
  const t = TURNS[section] ?? TURNS.business;
  const claim = t.claim
    ? `\n\n${FENCE}claim\n${JSON.stringify({ ...t.claim, turn, repeat_of_turn: null }, null, 2)}\n${FENCE}`
    : '';
  return `${t.display}${claim}\n\n${FENCE}speech\n${t.speech}\n${FENCE}`;
}

// Report

export async function mockReport() {
  await wait(LATENCY.llm);
  return `### SARTHI AI — PD REPORT
**Applicant**: Ramesh Gupta
**Area**: Dwarka Sector 7, Delhi
**Business**: Partnership garment shop — Gupta Garments
**Date**: ${new Date().toLocaleDateString('en-IN')}
**Interview Mode**: Video Call (AI-led)

---

### 1. RED FLAGS
- Monthly income: said 3,00,000, bank credits show 1,65,000 — 82% above (Brief: avgMonthlyCredit)
- Income changed between two askings, 3,00,000 then 2,50,000 (Flag: monthly_income)
- Business vintage: said 2 years, GST shows 1.5 years (Brief: gstVintage)
- Existing EMI: said 8,000, bureau shows 18,000 (Brief: existingEMIs)

### 2. WHAT SARTHI CHECKED
- ✓ 2 years in the garment business with a partner (Turn 3)
- ✓ Area knowledge 2 of 3 (Fact: area_knowledge_score)

### 3. WHAT THE BO / CO MUST CHECK
- Partnership deed — not produced; said the partner holds it (Turn 9)
- Source of the March deposit (Brief: largeDeposits)
- Actual monthly income from the last 6 months of statements

### 4. LOAN ELIGIBILITY
- Assessed Monthly Income: 1,65,000
- Existing EMIs: 18,000
- Maximum Eligible Amount: 10,50,000
- Requested Amount: 15,00,000

### 5. RECOMMENDATION
RED: Red flags — significant concerns. Recommend detailed field verification before proceeding.

---
*This is mock output (VITE_SARTHI_MOCKS=true). No model was called.*`;
}
