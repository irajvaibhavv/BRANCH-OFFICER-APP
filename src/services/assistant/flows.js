// Scripted SAARTHI AI handover interviews.
// Node: { id, say(ctx) → string[], options?, input?: 'text'|'money'|'number', next(answer, ctx) → id | null, key? }
import { PRODUCT_RATES, emi, maxLoan, FOIR } from '../../utils/loanCalc';

const first = (n) => (n ?? '').split(' ')[0];
const num = (v) => Number(String(v).replace(/[^\d.]/g, '')) || 0;
const has = (t, ...words) => words.some((w) => String(t).toLowerCase().includes(w));
const inr = (n) => (n >= 10000000 ? `₹${(n / 10000000).toFixed(2)} Cr` : n >= 100000 ? `₹${(n / 100000).toFixed(n % 100000 ? 1 : 0)} L` : `₹${Math.round(n).toLocaleString('en-IN')}`);

/** Map free text about purpose → a product + label. */
export function classifyPurpose(text) {
  const t = String(text).toLowerCase();
  if (has(t, 'property', 'plot', 'flat', 'house', 'mortgage', 'lap')) return { product: 'Loan Against Property', label: 'property-backed funding' };
  if (has(t, 'stock', 'inventory', 'working capital', 'cash flow', 'cashflow', 'daily', 'supplier', 'payment cycle', 'raw material')) return { product: 'MSME Working Capital', label: 'working capital' };
  if (has(t, 'personal', 'wedding', 'marriage', 'medical', 'education', 'travel')) return { product: 'Personal Loan', label: 'a personal need' };
  if (has(t, 'expand', 'expansion', 'second', 'new shop', 'branch', 'machine', 'equipment', 'vehicle', 'renovat', 'outlet')) return { product: 'Business Loan', label: 'business expansion' };
  return { product: 'Business Loan', label: 'business funding' };
}

/** Map a DSA's free-text concern → a topic the officer can act on. */
export function classifyConcern(text) {
  const t = String(text).toLowerCase();
  if (has(t, 'payout', 'commission', 'incentive', 'slab', 'rate')) return 'payout';
  if (has(t, 'delay', 'slow', 'pending', 'tat', 'turnaround', 'credit team', 'approval', 'sanction')) return 'delays';
  if (has(t, 'portal', 'app', 'login', 'upload', 'system', 'otp')) return 'portal';
  if (has(t, 'competitor', 'bajaj', 'hdfc', 'other lender', 'other bank', 'better offer')) return 'competition';
  if (has(t, 'training', 'product', 'agent', 'knowledge', 'checklist', 'document')) return 'training';
  if (has(t, 'reject', 'decline', 'cibil', 'score')) return 'rejections';
  return 'other';
}

/* ------------------------------------------------------------------ CUSTOMER FLOW */
const CUSTOMER_FLOW = {
  start: {
    say: ({ party }) => [`Namaste${party ? ` ${first(party.name)}` : ''}! I'm SAARTHI AI. ${party?.name ? 'Rajesh' : 'The officer'} has handed me over so I can understand what you need and find the right loan for you.`, 'This takes about 3 minutes. Shall we begin?'],
    options: ['Yes, let\'s start', 'Ask in short'],
    next: () => 'purpose',
  },
  purpose: {
    key: 'purpose',
    say: () => ['First — what do you need the money for? Tell me in your own words.'],
    input: 'text', options: ['Expand my business', 'Buy equipment / machinery', 'Daily working capital', 'Against my property', 'Personal need'],
    next: () => 'amount',
  },
  amount: {
    key: 'amount',
    say: ({ a }) => { const p = classifyPurpose(a.purpose); return [`Understood — ${p.label}. That usually fits our ${p.product}.`, 'Roughly how much are you looking for?']; },
    input: 'money', options: ['₹5 L', '₹10 L', '₹25 L', '₹50 L', '₹1 Cr'],
    next: (ans, { a }) => (num(a.amount) >= 2500000 ? 'collateral' : 'employment'),
  },
  collateral: {
    key: 'collateral',
    say: ({ a }) => [`${inr(num(a.amount))} is a sizeable amount. Do you own a property — shop, flat or plot — that could be offered as security? It lowers the rate and stretches the tenure.`],
    options: ['Yes, I own property', 'No property', 'Property is in family member\'s name'],
    next: () => 'employment',
  },
  employment: {
    key: 'employment',
    say: () => ['How do you earn — do you run a business, or are you salaried?'],
    options: ['Own business', 'Salaried', 'Professional (doctor / CA / etc.)'],
    next: (ans) => (has(ans, 'salaried') ? 'income' : 'vintage'),
  },
  vintage: {
    key: 'vintage',
    say: () => ['How long has the business been running?'],
    options: ['Less than 1 year', '1–3 years', '3–5 years', 'More than 5 years'],
    next: (ans) => (has(ans, 'less') ? 'youngBiz' : 'income'),
  },
  youngBiz: {
    key: 'youngBizNote',
    say: () => ['A business under a year old is harder to fund on its own. Two things help: a co-applicant with steady income, or GST-registered turnover.', 'Do you have either of these?'],
    options: ['Co-applicant available', 'GST registered', 'Both', 'Neither'],
    next: () => 'income',
  },
  income: {
    key: 'income',
    say: ({ a }) => [has(a.employment, 'salaried') ? 'What is your monthly take-home salary?' : 'What is your monthly income after expenses — the profit you actually keep?'],
    input: 'money', options: ['₹40,000', '₹75,000', '₹1.2 L', '₹2 L', '₹3 L+'],
    next: () => 'existingEmi',
  },
  existingEmi: {
    key: 'existingEmi',
    say: () => ['Any loans running right now — car, home, or another business loan? What is the total EMI you pay per month?'],
    input: 'money', options: ['No loans', '₹10,000', '₹25,000', '₹50,000'],
    next: (ans, { a }) => {
      const cap = num(a.income) * FOIR - num(a.existingEmi);
      return cap <= 0 ? 'overstretched' : 'age';
    },
  },
  overstretched: {
    key: 'overstretchedNote',
    say: ({ a }) => [`Being honest with you: with ${inr(num(a.income))} income and ${inr(num(a.existingEmi))} in EMIs, most of your income is already committed. A lender will want to see room for the new EMI.`, 'Would you consider closing a smaller loan first, or adding a co-applicant?'],
    options: ['Can close an existing loan', 'Can add a co-applicant', 'Neither', 'Income is actually higher'],
    next: () => 'age',
  },
  age: {
    key: 'age',
    say: () => ['Your age, please? It decides the maximum tenure.'],
    input: 'number', options: ['25–30', '31–40', '41–50', '51–60', '60+'],
    next: () => 'docs',
  },
  docs: {
    key: 'docs',
    say: ({ a }) => [has(a.employment, 'salaried') ? 'Do you have PAN, Aadhaar, last 3 salary slips and 6 months bank statement ready?' : 'Do you have PAN, Aadhaar, ITR for the last 2 years, GST returns and 12 months bank statement ready?'],
    options: ['All ready', 'ITR missing', 'GST missing', 'Bank statement missing', 'Not sure what I have'],
    next: (ans) => (has(ans, 'all') ? 'timeline' : 'docsWhy'),
  },
  docsWhy: {
    key: 'docsWhy',
    say: ({ a }) => [`${a.docs} is the most common reason a file stalls. Is it missing because it was never filed, or you just need time to collect it?`],
    options: ['Never filed', 'Need a few days', 'Can get from my CA'],
    next: () => 'timeline',
  },
  timeline: {
    key: 'timeline',
    say: () => ['When do you need the money by?'],
    options: ['This week', 'Within a month', '2–3 months', 'Just exploring'],
    next: () => 'compare',
  },
  compare: {
    key: 'compare',
    say: () => ['Have you spoken to any other bank or NBFC about this? What did they offer?'],
    input: 'text', options: ['No, you are the first', 'Yes — better rate elsewhere', 'Yes — they rejected me', 'Yes — still deciding'],
    next: (ans) => (has(ans, 'reject') ? 'rejectedWhy' : 'concern'),
  },
  rejectedWhy: {
    key: 'rejectedWhy',
    say: () => ['That is useful to know. Did they tell you why? (Low credit score, income proof, business age…)'],
    input: 'text', options: ['Credit score', 'Income proof', 'Business too new', 'Did not say'],
    next: () => 'concern',
  },
  concern: {
    key: 'concern',
    say: () => ['Last one — is there anything worrying you about taking this loan? Rate, EMI size, paperwork, anything at all.'],
    input: 'text', options: ['EMI feels high', 'Worried about rate', 'Too much paperwork', 'Nothing, I am ready'],
    next: () => 'wrap',
  },
  wrap: {
    say: ({ party }) => [`Thank you${party ? `, ${first(party.name)}` : ''}. I have everything I need. I'm preparing a short report for the officer — please hand the phone back.`],
    next: () => null,
  },
};

/* ------------------------------------------------------------------ DSA FLOW */
const DSA_FLOW = {
  start: {
    say: ({ party }) => [`Hello ${first(party?.name) ?? ''}, I'm SAARTHI AI. Rajesh has asked me to hear you out properly — anything you tell me goes straight into a note for him and the branch head.`, 'Ready?'],
    options: ['Yes, go ahead'],
    next: () => 'topic',
  },
  topic: {
    key: 'topic',
    say: () => ['What is the one thing you most want us to fix or improve right now? Say it in your own words.'],
    input: 'text', options: ['Payout / commission', 'Files take too long', 'Portal issues', 'Competitor offering more', 'Need training for my agents', 'Too many rejections'],
    next: (ans) => ({ payout: 'payoutDetail', delays: 'delayDetail', portal: 'portalDetail', competition: 'compDetail', training: 'trainDetail', rejections: 'rejectDetail' }[classifyConcern(ans)] ?? 'otherDetail'),
  },
  payoutDetail: {
    key: 'detail',
    say: () => ['Payout — let me understand it exactly. Is it the rate itself, the slab you are on, or the timing of payment?'],
    options: ['Rate is lower than others', 'Stuck on a lower slab', 'Payment comes late', 'All of these'],
    next: () => 'compAsk',
  },
  delayDetail: {
    key: 'detail',
    say: () => ['Which stage is slow — login, credit decision, or disbursement? And roughly how many days does it take today?'],
    input: 'text', options: ['Credit decision · 10+ days', 'Disbursement · 7+ days', 'Login queries keep coming', 'Everything'],
    next: () => 'satisfaction',
  },
  portalDetail: {
    key: 'detail',
    say: () => ['What exactly fails on the portal? Upload, OTP, status not updating…'],
    input: 'text', options: ['Uploads fail', 'Status never updates', 'OTP issues', 'Too many fields'],
    next: () => 'satisfaction',
  },
  compDetail: {
    key: 'detail',
    say: () => ['Which lender, and what are they offering that we are not — rate, payout, or speed?'],
    input: 'text', options: ['Higher payout', 'Faster sanction', 'Lower customer rate', 'Better portal'],
    next: () => 'compAsk',
  },
  trainDetail: {
    key: 'detail',
    say: () => ['What do your agents struggle with most — documents checklist, product eligibility, or pitching?'],
    options: ['Document checklist', 'Eligibility rules', 'Pitching to customers', 'New agents in general'],
    next: () => 'satisfaction',
  },
  rejectDetail: {
    key: 'detail',
    say: () => ['On the rejections — what reason do you see most often on the decline note?'],
    options: ['Income proof weak', 'Credit score', 'Business vintage', 'No reason given'],
    next: () => 'satisfaction',
  },
  otherDetail: {
    key: 'detail',
    say: () => ['Tell me a bit more about that — what happens, and how often?'],
    input: 'text',
    next: () => 'satisfaction',
  },
  compAsk: {
    key: 'competitorShare',
    say: () => ['Roughly what share of your files goes to other lenders today?'],
    options: ['Almost none', 'About a quarter', 'Half', 'Most of them'],
    next: () => 'satisfaction',
  },
  satisfaction: {
    key: 'satisfaction',
    say: () => ['On a scale of 1 to 5, how happy are you working with us right now?'],
    options: ['1', '2', '3', '4', '5'],
    next: (ans) => (num(ans) <= 2 ? 'unhappyWhy' : 'pipeline'),
  },
  unhappyWhy: {
    key: 'unhappyWhy',
    say: () => ['I appreciate the honesty. What is the one thing that would move that score up?'],
    input: 'text',
    next: () => 'pipeline',
  },
  pipeline: {
    key: 'pipeline',
    say: () => ['Looking at next month — how many files do you realistically see coming to us?'],
    options: ['Under 5', '5–10', '10–20', '20+'],
    next: () => 'support',
  },
  support: {
    key: 'support',
    say: () => ['What support from the branch would help you hit that? Pick what matters most.'],
    input: 'text', options: ['Faster query resolution', 'A dedicated credit contact', 'Product training session', 'Marketing material', 'Better payout slab'],
    next: () => 'anything',
  },
  anything: {
    key: 'anything',
    say: () => ['Anything else you want the branch head to know — good or bad?'],
    input: 'text', options: ['No, that covers it'],
    next: () => 'wrap',
  },
  wrap: {
    say: ({ party }) => [`Thank you ${first(party?.name) ?? ''}. Everything you said is going into a report for Rajesh now — please hand the phone back to him.`],
    next: () => null,
  },
};

export const FLOWS = { customer: CUSTOMER_FLOW, dsa: DSA_FLOW };

/** A short reflective line the AI says after an answer, so it feels like it listened. */
export function reflect(kind, node, answer, a) {
  const t = String(answer);
  if (kind === 'customer') {
    if (node === 'amount') return null; // the next node already reflects the purpose
    if (node === 'income' && num(t)) return `${inr(num(t))} a month — noted.`;
    if (node === 'existingEmi') return num(t) ? `${inr(num(t))} in EMIs, okay.` : 'No existing loans — that helps.';
    if (node === 'collateral') return has(t, 'yes') ? 'Good — that opens up Loan Against Property for you.' : has(t, 'family') ? 'That can work with the family member as co-applicant.' : 'No problem, we will look at unsecured options.';
    if (node === 'timeline') return has(t, 'week') ? 'Tight timeline — documents will decide how fast this moves.' : null;
    if (node === 'concern') return has(t, 'emi') ? 'A longer tenure brings the EMI down — the officer can show you the numbers.' : has(t, 'rate') ? 'Rate depends on profile and security; the officer will quote exactly.' : has(t, 'paper') ? 'The officer can collect most documents in one visit.' : null;
  } else {
    if (node === 'topic') return { payout: 'Payout — I hear that a lot; let me get the specifics.', delays: 'Turnaround time. Okay, let me pin it down.', portal: 'Portal trouble — understood.', competition: 'Competition — important for the branch to know.', training: 'Training — that is fixable quickly.', rejections: 'Rejections — let me understand the pattern.', other: 'Okay, tell me more.' }[classifyConcern(t)];
    if (node === 'satisfaction') return num(t) >= 4 ? 'Glad to hear that.' : num(t) === 3 ? 'Middle of the road — fair.' : null;
    if (node === 'pipeline') return has(t, '20') ? 'That is a strong number — the branch will want to support it.' : null;
  }
  return null;
}

/* ------------------------------------------------------------------ REPORT */
export function buildReport(kind, party, a) {
  const fields = Object.entries(a).filter(([, v]) => v != null && v !== '');
  if (kind === 'customer') {
    const p = classifyPurpose(a.purpose ?? '');
    const product = has(a.collateral, 'yes') && num(a.amount) >= 2500000 ? 'Loan Against Property' : p.product;
    const rules = PRODUCT_RATES[product];
    const amount = num(a.amount), income = num(a.income), exEmi = num(a.existingEmi);
    const tenure = Math.min(rules.maxTenure, 60);
    const eligible = income ? maxLoan(income, exEmi, rules.rate, tenure) : 0;
    const monthly = emi(Math.min(amount, rules.maxAmt), rules.rate, tenure);
    const fits = income > 0 && amount <= eligible;
    const flags = [];
    if (income && !fits) flags.push({ tone: 'danger', text: `Asked ${inr(amount)} but eligible for ~${inr(eligible)} at ${FOIR * 100}% FOIR — needs co-applicant, lower amount or longer tenure.` });
    if (a.overstretchedNote) flags.push({ tone: 'danger', text: `Repayment capacity is already used up (${a.overstretchedNote}).` });
    if (a.youngBizNote) flags.push({ tone: 'warning', text: `Business under 1 year — ${a.youngBizNote.toLowerCase()}.` });
    if (a.docs && !has(a.docs, 'all')) flags.push({ tone: 'warning', text: `${a.docs} (${(a.docsWhy ?? 'reason not given').toLowerCase()}).` });
    if (a.rejectedWhy) flags.push({ tone: 'warning', text: `Previously rejected elsewhere — reason: ${a.rejectedWhy}.` });
    if (has(a.compare, 'better rate')) flags.push({ tone: 'info', text: 'Has a competing offer — quote quickly and lead with speed/service.' });
    const readiness = Math.max(0, Math.min(100, 40 + (has(a.docs, 'all') ? 25 : 0) + (fits ? 25 : income ? 0 : 10) + (has(a.timeline, 'week', 'month') ? 10 : 0) - (a.rejectedWhy ? 10 : 0)));
    return {
      kind, partyName: party?.name ?? 'Walk-in customer', createdAt: Date.now(),
      headline: `${party?.name ?? 'Customer'} wants ${inr(amount)} for ${p.label}`,
      score: readiness, scoreLabel: 'File readiness',
      sentiment: flags.some((f) => f.tone === 'danger') ? 'needs work' : readiness >= 70 ? 'strong' : 'moderate',
      recommendation: { product, rate: rules.rate, tenure, emi: Math.round(monthly), eligible: Math.round(eligible), amount, fits },
      sections: [
        { title: 'What they need', items: [`Purpose: ${a.purpose}`, `Amount: ${inr(amount)}`, `Needed by: ${a.timeline ?? '—'}`, a.collateral ? `Security: ${a.collateral}` : null].filter(Boolean) },
        { title: 'Profile', items: [`${a.employment ?? '—'}${a.vintage ? ` · ${a.vintage}` : ''}`, income ? `Income ${inr(income)}/mo · existing EMIs ${inr(exEmi)}` : 'Income not shared', a.age ? `Age ${a.age}` : null, `Documents: ${a.docs ?? '—'}`].filter(Boolean) },
        { title: 'Market check', items: [`Other lenders: ${a.compare ?? 'not asked'}`, `Concern: ${a.concern ?? 'none'}`] },
      ],
      flags,
      todos: [
        { owner: 'BO', text: `Quote ${product} at ~${rules.rate}% — show EMI ${inr(Math.round(monthly))}/mo over ${tenure} months` },
        !has(a.docs, 'all') && a.docs ? { owner: 'BO', text: `Collect: ${a.docs.replace(' missing', '')}` } : null,
        !fits && income ? { owner: 'BO', text: 'Discuss co-applicant or reduce amount to eligibility' } : null,
        has(a.concern, 'emi', 'rate') ? { owner: 'BO', text: 'Walk through the calculator with the customer before they leave' } : null,
        { owner: party?.name ?? 'Customer', text: has(a.docs, 'all') ? 'Share documents for login' : `Arrange ${a.docs?.replace(' missing', '') ?? 'documents'}${a.docsWhy ? ` — ${a.docsWhy.toLowerCase()}` : ''}` },
      ].filter(Boolean),
      answers: fields,
    };
  }

  // ---- DSA report
  const topic = classifyConcern(a.topic ?? '');
  const sat = num(a.satisfaction);
  const flags = [];
  if (sat && sat <= 2) flags.push({ tone: 'danger', text: `Satisfaction ${sat}/5 — retention risk.${a.unhappyWhy ? ` Would improve if: ${a.unhappyWhy}` : ''}` });
  if (has(a.competitorShare, 'half', 'most')) flags.push({ tone: 'danger', text: `${a.competitorShare} of their files already go to other lenders.` });
  if (topic === 'competition') flags.push({ tone: 'warning', text: `Competitor pressure: ${a.detail}` });
  if (topic === 'delays') flags.push({ tone: 'warning', text: `TAT complaint: ${a.detail}` });
  if (topic === 'portal') flags.push({ tone: 'info', text: `Portal issue to log with IT: ${a.detail}` });
  const topicLabel = { payout: 'Payout & slab', delays: 'Turnaround time', portal: 'Portal', competition: 'Competition', training: 'Agent training', rejections: 'Rejections', other: 'Other' }[topic];
  const escalate = topic === 'payout' || topic === 'delays' || (sat && sat <= 2) || has(a.competitorShare, 'half', 'most');
  const health = Math.max(0, Math.min(100, (sat ? sat * 16 : 50) + (has(a.pipeline, '20') ? 20 : has(a.pipeline, '10') ? 10 : 0) - (has(a.competitorShare, 'half', 'most') ? 20 : 0)));
  return {
    kind, partyName: party?.name ?? 'DSA', createdAt: Date.now(),
    headline: `${first(party?.name) ?? 'DSA'}'s main ask: ${topicLabel.toLowerCase()}`,
    score: health, scoreLabel: 'Relationship health',
    sentiment: sat >= 4 ? 'positive' : sat === 3 ? 'neutral' : 'at risk',
    sections: [
      { title: 'Main concern', items: [`${topicLabel}: "${a.topic}"`, a.detail ? `Detail: ${a.detail}` : null].filter(Boolean) },
      { title: 'Business outlook', items: [`Next month pipeline: ${a.pipeline ?? '—'}`, a.competitorShare ? `Share going elsewhere: ${a.competitorShare}` : null, `Satisfaction: ${a.satisfaction ?? '—'}/5`].filter(Boolean) },
      { title: 'Support asked', items: [a.support ?? '—', a.anything && !has(a.anything, 'covers it') ? `Also: ${a.anything}` : null].filter(Boolean) },
    ],
    flags,
    escalate,
    todos: [
      { owner: 'BO', text: { payout: 'Check slab eligibility and current payout vs. competitor; revert within 2 days', delays: 'Pull the DSA\'s pending files and chase credit for a TAT commitment', portal: 'Raise a ticket with IT and share the ticket number', competition: 'Bring a retention offer (slab review / faster processing) to the next meeting', training: 'Schedule a 30-min agent session this week', rejections: 'Review last 5 declines with the DSA and share a pre-check list', other: 'Follow up on the concern raised' }[topic] },
      escalate ? { owner: 'Branch Head', text: `Escalation: ${topicLabel.toLowerCase()} — ${sat ? `satisfaction ${sat}/5` : 'see report'}` } : null,
      a.support ? { owner: 'BO', text: `Arrange: ${a.support}` } : null,
      { owner: party?.name ?? 'DSA', text: `Route ${a.pipeline ?? 'planned'} files to us next month` },
    ].filter(Boolean),
    answers: fields,
  };
}
