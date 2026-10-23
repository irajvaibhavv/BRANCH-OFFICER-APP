// Scripted mode for when no proxy is reachable. Same grounded data and verifier; only the wording is fixed.
import { lookupLocation, lookupBusiness, lookupRiskPattern } from './knowledge';
import { identitySummary } from './idChecks';
import { toNumber } from './verifier';
import { formatINR } from '../../utils/formatters';
import { PHOTO_ASKS } from './photo';
import { isSalaried } from './memory';
import { genuineOperator } from './assisted';

const fmt = (n) => formatINR(n, { compact: false });

// `text` is the Hinglish caption; `speech` is Devanagari because a Hindi voice misreads romanized Hindi.
export function buildScript(c) {
  const area = lookupLocation(c.areaKey || c.area);
  const biz = lookupBusiness(c.businessKey);
  const pattern = c.riskPatternMatch ? lookupRiskPattern(c.riskPatternMatch.patternId) : null;
  const hi = c.hi ?? {};

  const steps = [
    // The name is asked, never said: "Aap Mahesh ji hain na?" is answered "haan" by anyone holding the phone.
    {
      text: 'Namaste ji. Main Sarthi hoon, branch se. Kuch aasaan sawaal poochhunga — bas 5 minute. Pehle apna poora naam bataiye?',
      speech: 'नमस्ते जी। मैं सारथी हूँ, ब्रांच से। कुछ आसान सवाल पूछूँगा, बस पाँच मिनट। पहले अपना पूरा नाम बताइए?',
      collect: 'stated_name',
    },
    // No model in scripted mode, so a salaried applicant gets fixed job questions; the role-specific ones need live mode.
    ...(isSalaried(c) ? [
      { text: 'Aap kis company mein kaam karte hain, aur wahan aapka kya role hai?', speech: 'आप किस कंपनी में काम करते हैं, और वहाँ आपका क्या रोल है?' },
      { text: 'Kal office mein aapne kya-kya kaam kiya? Thoda detail mein bataiye.', speech: 'कल ऑफिस में आपने क्या-क्या काम किया? थोड़ा डिटेल में बताइए।' },
      { text: 'Is company mein kitne saal se hain, aur kul experience kitna hai?', speech: 'इस कंपनी में कितने साल से हैं, और कुल एक्सपीरियंस कितना है?', claimType: 'vintage' },
      { text: 'Haath mein mahine ki salary kitni aati hai, aur saal ka package kitna hai?', speech: 'हाथ में महीने की सैलरी कितनी आती है, और साल का पैकेज कितना है?', claimType: 'income' },
      { text: 'Pichhli baar bonus ya increment kab mila tha, aur kitna?', speech: 'पिछली बार बोनस या इंक्रीमेंट कब मिला था, और कितना?' },
    ] : [
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
    ]),
    { text: 'Ghar ka mahine ka kharcha kitna ho jaata hai?', speech: 'और घर का खर्चा, महीने का कितना हो जाता है?', claimType: 'expense' },
    { text: 'Ghar mein aapke alawa aur koi kamata hai?', speech: 'घर में आपके अलावा, और कोई कमाता है?' },
  ];

  if (area.avgShopRent && !isSalaried(c)) {
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
    text: 'Kisi committee, chit fund ya sahukar se bhi paisa liya hua hai? Yeh sirf record ke liye hai.',
    speech: 'किसी कमेटी, चिट फंड, या साहूकार से भी पैसा लिया हुआ है? यह सिर्फ रिकॉर्ड के लिए है।',
  });
  steps.push({
    text: `Yeh ${fmt(c.loanAmountRequested)} ka loan kis kaam ke liye chahiye? Paisa exactly kahan lagayenge?`,
    speech: `यह ${hi.loanAmount ?? ''} रुपये का लोन, किस काम के लिए चाहिए? पैसा, कहाँ लगाएँगे?`,
  });

  (biz?.knowledgeQuestions ?? []).slice(0, 3).forEach((q) => steps.push({ text: q.q, speech: q.qHi ?? q.q, knowledge: 'business', expect: q.expect, flag: q.flag }));
  (pattern?.questionsToAsk ?? []).slice(0, 3).forEach((q, i) => steps.push({ text: q, speech: pattern.questionsToAskHi?.[i] ?? q, knowledge: 'pattern', patternId: pattern.patternId }));

  if (!isSalaried(c)) steps.push({ text: PHOTO_ASKS.shop.ask, speech: PHOTO_ASKS.shop.speech, photo: 'shop' });
  steps.push({ text: PHOTO_ASKS.home.ask, speech: PHOTO_ASKS.home.speech, photo: 'home' });
  steps.push({ text: PHOTO_ASKS.home_inside.ask, speech: PHOTO_ASKS.home_inside.speech, photo: 'home_inside' });

  // Income asked again in different words — the coaching check.
  steps.push(isSalaried(c) ? {
    text: 'Ek baar aur confirm kar lein — pichle mahine account mein salary kitni aayi thi?',
    speech: 'एक बार और कन्फर्म कर लें। पिछले महीने अकाउंट में सैलरी कितनी आई थी?',
    claimType: 'income',
  } : {
    text: 'Ek baar aur confirm kar lein — pichle mahine ka total collection kitna raha tha?',
    speech: 'एक बार और कन्फर्म कर लें। पिछले महीने का टोटल कलेक्शन, कितना रहा था?',
    claimType: 'income',
  });
  steps.push(isSalaried(c) ? {
    text: 'Agar kabhi naukri chhooti ya salary ruki, toh EMI kaise manage karenge?',
    speech: 'अगर कभी नौकरी छूटी या सैलरी रुकी, तो ईएमआई कैसे मैनेज करेंगे?',
  } : {
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
      text: 'Namaste! Main Sarthi hoon, branch se. Aapka poora naam kya hai?',
      speech: 'नमस्ते! मैं सारथी हूँ, ब्रांच से। आपका पूरा नाम क्या है?',
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
    { text: 'Ghar mein aapke alawa aur koi kamata hai?', speech: 'घर में आपके अलावा, और कोई कमाता है?', collect: 'earners' },
    { text: 'Abhi koi loan ya EMI chal rahi hai?', speech: 'अभी कोई लोन या ईएमआई चल रही है?', collect: 'existingEmi', claimType: 'existingEmi' },
    {
      text: 'Kisi committee, chit fund ya sahukar se bhi paisa liya hua hai? Yeh sirf record ke liye hai.',
      speech: 'किसी कमेटी, चिट फंड, या साहूकार से भी पैसा लिया हुआ है? यह सिर्फ रिकॉर्ड के लिए है।',
      collect: 'informalLoans',
    },
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

// ---- offline report writer (same sections as Agent 2, built only from evidence) ----

const inr = (n) => (typeof n === 'number' ? n.toLocaleString('en-IN') : n);

const FLAG_HEADS = {
  identity_mismatch: 'Person on the call may not be the applicant',
  identity_document: 'Identity document problem',
  loan_purpose: 'Loan purpose needs a closer look',
  contradiction: 'Contradicts the file',
  coaching_detected: 'Answer changed when asked again',
  internal_consistency: 'Their own numbers do not add up',
  inconsistency: 'Stated differently across the interview',
  photo_provenance: 'Photo may not be genuine',
  photo_location: 'Photo location vs the file',
  cross_pd: 'Same place as another applicant',
  repeat_pd: 'Answer changed since an earlier PD',
  face_check: 'Person on the call vs the customer photo',
  liveness: 'Video may not be live',
  name_match: 'Name on a photo vs the file',
  stock_check: 'Stock stated vs the shop photo',
  call_location: 'Where the call was taken from',
  assisted: 'Owner vs the person who runs it',
};

const photoSource = (p) => (p.provenance?.source === 'live_camera' ? ' (live camera)' : p.provenance ? ' (uploaded file)' : '');

// Findings only: no question, task wording or quote reaches the officer, so a BO who reads hundreds of these cannot
// coach the next applicant. Each item lands in one of three lists — red flag, checked, BO / CO to check.
export function buildFallbackReport({ caseData, transcript, evidence, flags, eligibility, observations, photos = [], identity, cameraOn, understanding = null, tradeMath = [], rechecks = [], hotAnswers = [], professionAnswers = [], challengeAnswers = [], challengeWhy = [], living = null, collected = null, mode = 'Handover' }) {
  const c = caseData;
  const pattern = c.riskPatternMatch ? lookupRiskPattern(c.riskPatternMatch.patternId) : null;
  const area = lookupLocation(c.areaKey || c.area);
  const contradicted = evidence.filter((e) => e.status === 'contradicted');
  const unverified = evidence.filter((e) => e.status === 'unverified' && !e.noRule);
  const date = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  const red = [];
  const ok = [];
  const todo = [];

  // identity and camera
  ok.push(cameraOn ? '- ✓ Applicant on live camera for the interview.' : null);
  if (!cameraOn) todo.push('- Camera was off (audio / text only) — meet the applicant in person.');
  if (identity) (identity.ok ? ok : red).push(`- ${identity.ok ? '✓ ' : ''}${identitySummary(identity)}`);
  else todo.push('- No identity document was captured — collect and check one.');

  // claims against the file
  evidence.filter((e) => e.status === 'confirmed').forEach((e) => ok.push(`- ✓ ${e.claim}: ${e.declared} — ${e.detail} (${e.source})`));
  contradicted.forEach((e) => red.push(`- ${e.claim}: said ${e.declared}, file shows ${e.verified} — ${e.detail} (${e.source})`));
  unverified.forEach((e) => todo.push(`- ${e.claim}: ${e.declared} could not be checked — ${e.detail} (${e.source})`));

  // system flags and patterns
  if (pattern) red.push(`- Pattern match: ${pattern.area} + ${pattern.businessType}. ${Math.round(pattern.failureRate * 100)}% of past cases failed. ${pattern.whatWentWrong} (Pattern: ${pattern.patternId})`);
  flags.forEach((f) => {
    // Verifier flags carry label + turns; controller flags carry type + field.
    const head = f.label ?? FLAG_HEADS[f.type] ?? 'Flag';
    const cite = f.turns?.length ? ` (Turn ${f.turns[0]})` : f.turn ? ` (Turn ${f.turn})` : f.field ? ` (Flag: ${f.field})` : '';
    red.push(`- ${head}: ${f.detail}${cite}`);
  });

  // figures shown back to them during the call
  rechecks.forEach((r) => {
    if (r.before == null) todo.push(`- ${r.detail} — gap not settled on the call (Turn ${r.turn})`);
    else if (r.changed) ok.push(`- ✓ ${r.detail} — revised from ${r.before} to ${r.after} when shown (Turn ${r.turn})`);
    else red.push(`- ${r.detail} — figure unchanged when shown, gap still open (Turn ${r.turn})`);
  });

  // business / job knowledge, as a score only
  if (understanding?.total) {
    const line = `Insider trade knowledge: ${understanding.clear} of ${understanding.total} clear${understanding.vague ? `, ${understanding.vague} vague` : ''}${understanding.redFlag ? `, ${understanding.redFlag} red flag` : ''}`;
    if (understanding.vague + understanding.redFlag >= 2) red.push(`- ${line} — may not run this business day to day.`);
    else ok.push(`- ✓ ${line}.`);
  }
  if (professionAnswers.length) {
    todo.push(`- ${isSalaried(c) ? 'Job' : 'Trade'} knowledge: ${professionAnswers.length} answer(s), not machine-judged offline — ${isSalaried(c) ? 'verify salary slips, Form 16 and the salary credits' : 'confirm on the shop visit'}.`);
  }
  tradeMath.forEach((m) => (m.pass ? ok : red).push(`- ${m.pass ? '✓ ' : ''}Hisaab: ${m.detail}${m.pass ? '' : ` (Flag: math_${m.check})`}`));

  // random checks at the shop / home: a count, never the task
  if (challengeAnswers.length) {
    const missed = challengeAnswers.filter((a) => a.sent === false);
    ok.push(`- Surprise checks: ${challengeAnswers.length} done${challengeWhy.length ? `, more of them because of ${challengeWhy.join(', ')}` : ''}; any the code caught are under red flags.`);
    if (missed.length) red.push(`- ${missed.length} surprise-check photo(s) not sent (Turn ${missed[0].turn})`);
  }
  hotAnswers.forEach((h) => todo.push(`- From the file: ${h.why} — confirm the account they gave (Turn ${h.turn})`));

  // photos
  photos.forEach((p) => {
    if (p.skipped) red.push(`- Declined to photograph ${p.label} (Photo: ${p.kind})`);
    else if (p.observation) ok.push(`- ✓ ${p.label}${photoSource(p)}: ${p.observation} (Photo: ${p.kind})`);
    else todo.push(`- ${p.label}${photoSource(p)}: not machine-read — look at the photo (Photo: ${p.kind})`);
  });
  (observations ?? []).forEach((o) => todo.push(`- Video: ${o.observation} (Vision: ${o.at})`));
  if (living) todo.push(`- Living conditions vs income: ${living.facts.join('; ')}${living.analysis ? `. ${living.analysis}` : ''}`);

  // assisted PD: a genuine operator is a BO / CO decision, not a flag
  const operator = collected && genuineOperator(collected, flags);
  if (operator) {
    ok.push('- ✓ Owner and the person who runs the business agree on sales, premises and who keeps the money.');
    todo.push(`- ${operator} runs the business day to day — consider adding them as co-applicant or guarantor.`);
  }

  // area and file
  if (area.source === 'specific') ok.push(`- ✓ Area knowledge checked against surveyed data for ${c.areaKey}.`);
  else todo.push(`- No surveyed data for ${c.area || 'this location'}: rent was checked only against the ${area.label ?? 'small town'} range (${fmt(area.avgShopRent.min)}–${fmt(area.avgShopRent.max)}) — confirm on the ground.`);
  if (c.brief.areaDefaultRate != null) todo.push(`- Area default rate: ${Math.round(c.brief.areaDefaultRate * 100)}% (Brief: areaDefaultRate)`);
  (c.brief.missingDocs ?? []).forEach((d) => todo.push(`- Collect ${d} (Brief: missingDocs)`));
  (c.brief.largeDeposits ?? []).forEach((d) => todo.push(`- Source of ${fmt(d.amount)} deposit in ${d.month} (Brief: largeDeposits)`));
  if (pattern) todo.push(`- ${pattern.redFlags[0]} (Pattern: ${pattern.patternId})`);

  const rec = contradicted.length >= 2 || (contradicted.length >= 1 && (pattern?.failureRate ?? 0) >= 0.5)
    ? 'RED'
    : contradicted.length || flags.length || unverified.length || pattern
      ? 'AMBER'
      : 'GREEN';
  const recLine = {
    RED: 'RED: Red flags — significant concerns. Recommend detailed field verification before proceeding.',
    AMBER: 'AMBER: Human intervention — some concerns found. Officer should verify the items in section 3 before proceeding.',
    GREEN: 'GREEN: Satisfactory — profile looks clean. Recommend for further processing.',
  }[rec];

  return `### SARTHI AI - PD REPORT
**Applicant**: ${c.name}
**Area**: ${c.area}
**Business**: ${c.business} — ${c.businessName}
**Date**: ${date}
**Interview Mode**: ${mode}
**Turns recorded**: ${transcript.length}

---

### 1. RED FLAGS
${red.length ? red.join('\n') : '- No red flags found.'}

### 2. WHAT SARTHI CHECKED
${ok.filter(Boolean).length ? ok.filter(Boolean).join('\n') : '- Nothing could be confirmed in this interview.'}

### 3. WHAT THE BO / CO MUST CHECK
${todo.length ? todo.join('\n') : '- No specific items flagged for field verification.'}

### 4. LOAN ELIGIBILITY
${eligibility.assessable
      ? `- Assessed Monthly Income: ₹${inr(eligibility.assessedIncome)} ${eligibility.assessedIncomeMethod === 'calculated_from_answers'
        ? `— **rebuilt from the interview, not from a statement**. ${eligibility.assessedIncomeSource}${eligibility.assessedIncomeNote ? ` ${eligibility.assessedIncomeNote}` : ''}`
        : `(${eligibility.assessedIncomeSource})`}
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

### 5. RECOMMENDATION
${recLine}
`;
}
