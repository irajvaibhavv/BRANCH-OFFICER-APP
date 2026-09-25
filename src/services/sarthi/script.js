// Scripted mode for when no proxy is reachable. Same grounded data and verifier; only the wording is fixed.
import { lookupLocation, lookupBusiness, lookupRiskPattern } from './knowledge';
import { identitySummary } from './idChecks';
import { toNumber } from './verifier';
import { formatINR } from '../../utils/formatters';
import { PHOTO_ASKS } from './photo';

const fmt = (n) => formatINR(n, { compact: false });

// `text` is the Hinglish caption; `speech` is Devanagari because a Hindi voice misreads romanized Hindi.
export function buildScript(c) {
  const area = lookupLocation(c.areaKey || c.area);
  const biz = lookupBusiness(c.businessKey);
  const pattern = c.riskPatternMatch ? lookupRiskPattern(c.riskPatternMatch.patternId) : null;
  const hi = c.hi ?? {};

  const steps = [
    {
      text: `Namaste ${c.name} ji. Main Sarthi hoon, SMFG India Credit se. Kuch sawaal poochhunga — bas 5 minute. Shuru karein?`,
      speech: `नमस्ते ${hi.name ?? ''} जी। मैं सारथी हूँ, एसएमएफजी इंडिया क्रेडिट से। कुछ सवाल पूछूँगा, बस पाँच मिनट। शुरू करें?`,
    },
    {
      text: `Sabse pehle confirm kar lein — aap ${c.area} mein rehte hain aur ${c.businessName} chalate hain, sahi hai?`,
      speech: `सबसे पहले, एक बार कन्फर्म कर लें। आप ${hi.area ?? ''} में रहते हैं, और ${hi.businessName ?? ''} चलाते हैं। सही है?`,
    },
    {
      text: 'Roz ka kaam kaise chalta hai? Aap khud baithte ho, ya koi aur sambhalta hai?',
      speech: 'रोज़ का काम कैसे चलता है? आप खुद बैठते हैं, या कोई और सँभालता है?',
    },
    { text: 'Business kitne saal se chal raha hai?', speech: 'बिज़नेस, कितने साल से चल रहा है?', claimType: 'vintage' },
    { text: 'Mahine ki income kitni ho jaati hai, roughly?', speech: 'महीने की इनकम, लगभग कितनी हो जाती है?', claimType: 'income' },
    { text: 'Ghar ka mahine ka kharcha kitna ho jaata hai?', speech: 'और घर का खर्चा, महीने का कितना हो जाता है?', claimType: 'expense' },
  ];

  if (area.avgShopRent) {
    steps.push({ text: 'Shop ka monthly rent kitna hai? Ya shop apni hai?', speech: 'शॉप का मंथली रेंट, कितना है? या शॉप अपनी है?', claimType: 'rent' });
  }
  // Only surveyed areas have landmarks.
  if (area.source === 'specific') {
    const landmark = area.landmarks?.[0]?.name;
    if (landmark) {
      steps.push({
        text: `Aapki shop ${landmark} se kitni door hai? Paas mein kaunsa market hai?`,
        speech: `आपकी शॉप, ${area.landmarkHi ?? landmark} से कितनी दूर है? पास में, कौन सा मार्केट है?`,
      });
    }
    if (area.nearestMetro) {
      steps.push({
        text: 'Sabse paas ka metro station kaunsa padta hai aapke yahan se?',
        speech: 'सबसे पास का मेट्रो स्टेशन, कौन सा पड़ता है?',
      });
    }
  }

  steps.push({
    text: 'Abhi koi loan ya EMI chal rahi hai? Total kitni EMI jaati hai mahine ki?',
    speech: 'अभी कोई लोन या ईएमआई चल रही है? टोटल कितनी ईएमआई, जाती है महीने की?',
    claimType: 'existingEmi',
  });
  steps.push({
    text: `Yeh ${fmt(c.loanAmountRequested)} ka loan kis kaam ke liye chahiye? Paisa exactly kahan lagayenge?`,
    speech: `यह ${hi.loanAmount ?? ''} रुपये का लोन, किस काम के लिए चाहिए? पैसा, कहाँ लगाएँगे?`,
  });

  (biz?.knowledgeQuestions ?? []).slice(0, 3).forEach((q) => steps.push({ text: q.q, speech: q.qHi ?? q.q, knowledge: 'business', expect: q.expect, flag: q.flag }));
  (pattern?.questionsToAsk ?? []).slice(0, 3).forEach((q, i) => steps.push({ text: q, speech: pattern.questionsToAskHi?.[i] ?? q, knowledge: 'pattern', patternId: pattern.patternId }));

  steps.push({ text: PHOTO_ASKS.shop.ask, speech: PHOTO_ASKS.shop.speech, photo: 'shop' });
  steps.push({ text: PHOTO_ASKS.home.ask, speech: PHOTO_ASKS.home.speech, photo: 'home' });

  // Income asked again in different words — the coaching check.
  steps.push({
    text: 'Ek baar aur confirm kar lein — pichle mahine ka total collection kitna raha tha?',
    speech: 'एक बार और कन्फर्म कर लें। पिछले महीने का टोटल कलेक्शन, कितना रहा था?',
    claimType: 'income',
  });
  steps.push({
    text: 'Agar business mein 2-3 mahine slow chala, toh EMI kaise manage karenge?',
    speech: 'अगर बिज़नेस में, दो-तीन महीने स्लो चला। तो ईएमआई, कैसे मैनेज करेंगे?',
  });
  steps.push({
    text: `Bas ${c.name} ji, itna hi. Dhanyawaad — hamare officer aapse jaldi baat karenge. [INTERVIEW_COMPLETE]`,
    speech: `बस ${hi.name ?? ''} जी, इतना ही। धन्यवाद। हमारे ऑफिसर आपसे जल्दी बात करेंगे।`,
    end: true,
  });

  return steps;
}

// Walk-in intake: each step's `collect` names the case field its answer fills.
export function buildIntakeScript() {
  return [
    {
      text: 'Namaste! Main Sarthi hoon, SMFG India Credit se. Aapka poora naam kya hai?',
      speech: 'नमस्ते! मैं सारथी हूँ, एसएमएफजी इंडिया क्रेडिट से। आपका पूरा नाम क्या है?',
      collect: 'name',
    },
    { text: 'Shukriya. Aapki umar kitni hai?', speech: 'शुक्रिया। आपकी उम्र कितनी है?', collect: 'age' },
    {
      text: 'Ghar mein kitne log hain? Aur unmein se kitne kamate hain?',
      speech: 'घर में कितने लोग हैं? और उनमें से कितने कमाते हैं?',
      collect: 'family',
    },
    {
      text: 'Aap kya kaam karte hain? Dukaan, business ya naukri?',
      speech: 'आप क्या काम करते हैं? दुकान, बिज़नेस, या नौकरी?',
      collect: 'occupation',
    },
    { text: 'Aapke kaam ka ya dukaan ka naam kya hai?', speech: 'आपके काम का, या दुकान का नाम क्या है?', collect: 'businessName' },
    { text: 'Yeh kaam kitne saal se kar rahe hain?', speech: 'यह काम कितने साल से कर रहे हैं?', collect: 'businessVintage', claimType: 'vintage' },
    { text: 'Aap rehte kahan hain? Area aur city bataiye.', speech: 'आप रहते कहाँ हैं? एरिया और शहर बताइए।', collect: 'area' },
    { text: 'Ghar apna hai ya kiraye ka?', speech: 'घर अपना है, या किराये का?', collect: 'housing' },
    { text: 'Mahine mein kitni kamai ho jaati hai, lagbhag?', speech: 'महीने में कितनी कमाई हो जाती है, लगभग?', collect: 'declaredIncome', claimType: 'income' },
    { text: 'Aur ghar ka kharcha mahine ka kitna ho jaata hai?', speech: 'और घर का खर्चा, महीने का कितना हो जाता है?', collect: 'expense', claimType: 'expense' },
    { text: 'Abhi koi loan ya EMI chal rahi hai?', speech: 'अभी कोई लोन या ईएमआई चल रही है?', collect: 'existingEmi', claimType: 'existingEmi' },
    { text: 'Aapko kitna loan chahiye?', speech: 'आपको कितना लोन चाहिए?', collect: 'loanAmountRequested' },
    { text: 'Yeh paisa kis kaam mein lagayenge?', speech: 'यह पैसा किस काम में लगाएँगे?', collect: 'loanPurpose' },

    { text: PHOTO_ASKS.shop.ask, speech: PHOTO_ASKS.shop.speech, photo: 'shop' },
    { text: PHOTO_ASKS.home.ask, speech: PHOTO_ASKS.home.speech, photo: 'home' },

    {
      text: 'Ab pehchaan ke liye — apna Aadhaar number likh dijiye.',
      speech: 'अब पहचान के लिए, अपना आधार नंबर लिख दीजिए।',
      collect: 'aadhaar',
      typed: true,
    },
    {
      text: 'Aur PAN number bhi likh dijiye.',
      speech: 'और पैन नंबर भी लिख दीजिए।',
      collect: 'pan',
      typed: true,
    },
    {
      text: 'Bas, itna hi. Dhanyawaad — hamare officer aapse jaldi baat karenge. [INTERVIEW_COMPLETE]',
      speech: 'बस, इतना ही। धन्यवाद। हमारे ऑफिसर आपसे जल्दी बात करेंगे।',
      end: true,
    },
  ];
}

export function tradeFromWords(text = '') {
  const t = text.toLowerCase();
  if (/kapd|garment|readymade|cloth|boutique|saree|tailor/.test(t)) return 'garment_shop';
  if (/kirana|grocer|general store|provision|raashan|ration|supermarket/.test(t)) return 'kirana_store';
  if (/freelanc|software|it |web|developer|computer|design|coding/.test(t)) return 'it_freelancer';
  return null;
}

export function claimFromAnswer(step, answer, turn) {
  if (!step.claimType) return null;
  const value = toNumber(answer);
  if (value == null) return null;
  return {
    claim_type: step.claimType,
    stated_value: value,
    unit: step.claimType === 'vintage' ? 'years' : 'per_month',
    verbatim: answer,
    turn,
    confidence: 'direct_statement',
    repeat_of_turn: null,
  };
}

// ---- offline report writer (same structure as Agent 2, built only from evidence) ----

const inr = (n) => (typeof n === 'number' ? n.toLocaleString('en-IN') : n);

const FLAG_HEADS = {
  contradiction: 'Contradicts the file',
  coaching_detected: 'Answer changed when asked again',
  internal_consistency: 'Their own numbers do not add up',
  inconsistency: 'Stated differently across the interview',
  photo_provenance: 'Photo may not be genuine',
};

const photoSource = (p) => (p.provenance?.source === 'live_camera' ? ' (live camera)' : p.provenance ? ' (uploaded file)' : '');

export function buildFallbackReport({ caseData, transcript, evidence, flags, eligibility, observations, photos = [], identity, cameraOn, mode = 'Handover' }) {
  const c = caseData;
  const pattern = c.riskPatternMatch ? lookupRiskPattern(c.riskPatternMatch.patternId) : null;
  const biz = lookupBusiness(c.businessKey);
  const area = lookupLocation(c.areaKey || c.area);
  const contradicted = evidence.filter((e) => e.status === 'contradicted');
  const unverified = evidence.filter((e) => e.status === 'unverified' && !e.noRule);
  const date = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

  const rec = contradicted.length >= 2 || (contradicted.length >= 1 && (pattern?.failureRate ?? 0) >= 0.5)
    ? 'RED'
    : contradicted.length || flags.length || unverified.length || pattern
      ? 'AMBER'
      : 'GREEN';
  const recLine = {
    RED: 'RED: Significant red flags. Recommend detailed field verification before proceeding.',
    AMBER: 'AMBER: Some concerns found. Officer should verify the items listed below before proceeding.',
    GREEN: 'GREEN: Profile looks clean. Recommend for further processing.',
  }[rec];

  const summary = evidence.length
    ? evidence.slice(0, 5).map((e) => `- ${e.claim} stated as ${e.declared} — "${e.verbatim}" (Turn ${e.turn ?? '?'})`).join('\n')
    : `- Interview completed with ${transcript.length} turns recorded. No numeric claims were captured. (Turn ${Math.max(1, transcript.length)})`;

  const rows = evidence.length
    ? evidence.map((e) => `| ${e.claim} | ${e.declared} | ${e.verified} | ${e.status} | (${e.source}) |`).join('\n')
    : '| — | — | — | no claims captured | — |';

  const verifyList = [
    ...contradicted.map((e) => `- ${e.claim}: ${e.detail} (Turn ${e.turn ?? '?'})`),
    ...(c.brief.missingDocs ?? []).map((d) => `- Collect ${d} (Brief: missingDocs)`),
    ...(c.brief.largeDeposits ?? []).map((d) => `- Source of ${fmt(d.amount)} deposit in ${d.month} (Brief: largeDeposits)`),
    ...(pattern ? [`- ${pattern.redFlags[0]} (Pattern: ${pattern.patternId})`] : []),
  ];

  return `### SARTHI AI - PD REPORT
**Applicant**: ${c.name}
**Area**: ${c.area}
**Business**: ${c.business} — ${c.businessName}
**Date**: ${date}
**Interview Mode**: ${mode}

---

### 1. IDENTITY VERIFICATION
${cameraOn ? 'Applicant present on live camera for the full interview.' : 'Camera was not available; interview conducted on audio or text only.'}
${identity ? `- ${identitySummary(identity)}` : '- No identity document was captured.'}
${photos.length
      ? photos.map((p) => (p.skipped
        ? `- Declined to photograph ${p.label} when asked (Photo: ${p.kind})`
        : `- Sent as ${p.label}${photoSource(p)}: ${p.observation ?? 'on file, not machine-read — officer should view it'} (Photo: ${p.kind})`)).join('\n')
      : '- No photographs were requested.'}
${observations?.length
      ? observations.map((o) => `- ${o.observation} (Vision: ${o.at})`).join('\n')
      : '- Video analysis: No notable observations.'}

### 2. INTERVIEW SUMMARY
${summary}

### 3. CLAIM VERIFICATION

| Claim | Declared | Verified | Status | Source |
|-------|----------|----------|--------|--------|
${rows}

### 4. RISK ALERTS
${pattern
      ? `- Pattern match: ${pattern.area} + ${pattern.businessType}. ${Math.round(pattern.failureRate * 100)}% of past cases failed. ${pattern.whatWentWrong} (Pattern: ${pattern.patternId})`
      : '- No known risk patterns matched.'}
${flags.length
      ? flags.map((f) => {
        // Verifier flags carry label + turns; controller flags carry type + field.
        const head = f.label ?? FLAG_HEADS[f.type] ?? 'Flag';
        const cite = f.turns?.length ? ` (Turn ${f.turns[0]})` : f.turn ? ` (Turn ${f.turn})` : f.field ? ` (Flag: ${f.field})` : '';
        return `- ${head}: ${f.detail}${cite}`;
      }).join('\n')
      : '- No inconsistencies detected across the interview.'}
${c.brief.areaDefaultRate != null
      ? `- Area default rate for this location: ${Math.round(c.brief.areaDefaultRate * 100)}% (Brief: areaDefaultRate)`
      : '- Area default rate: not on file for this location.'}

### 5. KNOWLEDGE VERIFICATION
${area.source === 'specific'
      ? `- Area questions asked using ${c.areaKey} data (landmarks, metro, shop rent range ${fmt(area.avgShopRent.min)}–${fmt(area.avgShopRent.max)}). Officer should read the transcript for how they were answered.`
      : `- No surveyed data for ${c.area || 'this location'}, so landmark questions were skipped. Rent was checked against the ${area.label ?? 'small town'} range (${fmt(area.avgShopRent.min)}–${fmt(area.avgShopRent.max)}), which is indicative only — the officer should confirm it on the ground.`}
${biz ? `- Trade-knowledge questions asked for ${biz.label}. Watch for: ${biz.knowledgeQuestions.map((q) => q.flag).slice(0, 2).join('; ')}.` : '- No trade-knowledge data on file for this business type; those questions were skipped.'}

### 6. LOAN ELIGIBILITY
${eligibility.assessable
      ? `- Assessed Monthly Income: ₹${inr(eligibility.assessedIncome)} ${eligibility.assessedIncomeMethod === 'calculated_from_answers'
        ? `— **rebuilt from the interview, not from a statement**. ${eligibility.assessedIncomeSource}${eligibility.assessedIncomeNote ? ` ${eligibility.assessedIncomeNote}` : ''}`
        : '(Brief: avgMonthlyCredit — bank credits, not declared income)'}
- Existing EMIs: ₹${inr(eligibility.existingEmi)} (Brief: existingEMIs)
- Available EMI Capacity: ₹${inr(eligibility.availableEmiCapacity)} (${eligibility.foirPct}% FOIR less existing EMIs)
- Recommended Product: ${eligibility.product} at ${eligibility.rate}% for ${eligibility.tenureMonths} months
- Maximum Eligible Amount: ₹${inr(eligibility.maxEligible)} (EMI ₹${inr(eligibility.emiOnEligible)})
- Requested Amount: ₹${inr(eligibility.requested)} (Brief: loanAmountRequested)
- Gap: ${eligibility.gap > 0 ? `₹${inr(eligibility.gap)} more than eligibility supports` : 'None — request is within eligibility'}`
      : `- Assessed Monthly Income: not established. No bank statement is on file (Brief: avgMonthlyCredit)
- Declared Income: ₹${inr(eligibility.declaredIncome)} per month, self-declared only (Brief: declaredIncome)
- Existing EMIs: no bureau record on file (Brief: existingEMIs)
- Recommended Product: ${eligibility.product}, indicative only, at ${eligibility.rate}% for ${eligibility.tenureMonths} months
- Maximum Eligible Amount: **not assessable** until a bank statement or ITR is seen
- Requested Amount: ₹${inr(eligibility.requested)} (Brief: loanAmountRequested), which would carry an EMI of ₹${inr(eligibility.emiOnRequested)}
- Gap: cannot be calculated without verified income`}

### 7. OFFICER RECOMMENDATION
${recLine}

${verifyList.length ? verifyList.join('\n') : '- No specific items flagged for field verification.'}

---
*This report was generated by Sarthi AI. The final loan decision must be made by an authorized human officer. AI assessment is advisory only.*`;
}
