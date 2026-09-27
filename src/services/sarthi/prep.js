// Before the call: 12-15 questions drawn from THIS applicant's file (the "hot" ones), for either the officer's own PD or
// for Sarthi to ask. A question that also gets a standard fact names it in `covers`, and that standard question is skipped.
// The model drafts them; with no model the file's own facts do.
import pdSchema from '../../data/sarthi/pdSchema.json';
import { askAgent } from './agent';
import { briefForCitation, bankIncome, lookupBusiness, lookupRiskPattern } from './knowledge';
import { inWords } from './recheck';
import { MOCKS_ON } from './mocks';

export const HOT_MIN = 12;
export const HOT_MAX = 15;
const SECTIONS = ['personal', 'business', 'financial', 'documents', 'loan_purpose'];
// Cache version in the key: questions saved before `covers` existed would skip nothing.
const hotKey = (id) => `bo_sarthi_hotq2_${id}`;

// Standard fields a file question may stand in for. Identity, the shop check and typed document numbers are never skipped.
const COVERABLE = Object.fromEntries(pdSchema.sections
  .filter((s) => SECTIONS.includes(s.id))
  .flatMap((s) => (s.fields ?? [])
    .filter((f) => !f.typed && !['stated_name', 'speaker_relation', 'applicant_name', 'at_business_place', 'reached_business_place'].includes(f.key))
    .map((f) => [f.key, { label: f.label, section: s.id }])));

export function loadHot(caseId) {
  try { return JSON.parse(window.localStorage.getItem(hotKey(caseId))) ?? null; } catch { return null; }
}

function saveHot(caseId, value) {
  try { window.localStorage.setItem(hotKey(caseId), JSON.stringify(value)); } catch { /* quota — prototype */ }
}

// Keeps only well-formed items, numbered in order. A field is covered by one question only, and a question that covers
// fields is asked in THEIR section, where the skipped question would have been.
function tidy(list, source) {
  const taken = new Set();
  return list
    .filter((h) => h && typeof h.q === 'string' && h.q.trim())
    .slice(0, HOT_MAX)
    .map((h, i) => {
      const covers = (Array.isArray(h.covers) ? h.covers : []).filter((k) => COVERABLE[k] && !taken.has(k));
      covers.forEach((k) => taken.add(k));
      const section = covers.length ? COVERABLE[covers[0]].section : SECTIONS.includes(h.section) ? h.section : 'loan_purpose';
      return {
        id: `h${i + 1}`,
        q: h.q.trim().slice(0, 220),
        why: String(h.why ?? '').trim().slice(0, 260),
        section,
        covers,
        source: h.source ?? source,
      };
    });
}

/** Questions the file itself raises, in code — the fallback when no model is reachable, and the top-up when it returns too few. */
export function ruleHotQuestions(c) {
  if (!c || c.isNew) return [];
  const b = c.brief ?? {};
  const bank = bankIncome(c);
  const biz = lookupBusiness(c.businessKey || c.business);
  const out = [];
  const add = (section, q, why, covers = []) => out.push({ section, q, why, covers });

  if (c.businessVintage) {
    add('business', 'Dukaan kitne saal se hai, aur usse pehle kya kaam karte the?', `Trading for ${c.businessVintage} — tests the story behind the vintage`, ['business_age']);
  }
  if (/rent agreement/i.test((b.docsSubmitted ?? []).join(' '))) {
    add('business', 'Dukaan ka kiraya kitna hai, aur agreement kiske naam pe hai, kab tak ka?', 'Shop rent agreement submitted — check the rent, name and term', ['shop_ownership', 'shop_rent']);
  }
  if (b.bank?.cashCreditPct != null) {
    add('business', 'Mahine ki bikri kitni hoti hai, aur usme kitna cash aata hai, kitna UPI se?',
      `${b.bank.cashCreditPct}% of bank credits are cash, ${b.bank.upiCreditPct}% UPI${bank ? `; about ${inWords(bank.credits)} a month reaches the bank` : ''}`, ['monthly_sales']);
  }
  if (biz?.peakSeason) {
    add('business', 'Tyohaar mein bikri kitni badhti hai, aur sabse kamzor mahine mein kitni reh jaati hai?', `Peak season for the trade: ${biz.peakSeason}`, ['worst_month_sales']);
  }
  const pattern = c.riskPatternMatch ? lookupRiskPattern(c.riskPatternMatch.patternId) : null;
  if (pattern) {
    add('business', 'Pichhli baar dukaan ka kiraya kab aur kitna badha tha?', `Risk pattern ${pattern.patternId}: ${pattern.whatWentWrong}`);
  }
  if (bank && c.declaredIncome) {
    const gap = Math.round(((c.declaredIncome - bank.income) / bank.income) * 100);
    add('financial', 'Saara kharcha nikaal ke mahine mein haath mein kitna bachta hai? Ghar ka kharcha galle se hi chalta hai?',
      `Declared income ${inWords(c.declaredIncome)} vs about ${inWords(bank.income)} the bank supports (${gap > 0 ? `${gap}% above` : `${-gap}% below`})`, ['monthly_income', 'household_expenses']);
  }
  (b.runningLoans ?? []).forEach((l, i) => add('financial', `${l.type} ki kisht kitni hai, kitni kishten baaki hain, aur kabhi late hui?`,
    `Bureau: ${l.type}, EMI ${inWords(l.emi)}, ${l.remaining} instalments left`, i === 0 ? ['existing_loans', 'existing_emi', 'repayment_history'] : []));
  if (b.bureau?.enquiries6m >= 1) {
    add('financial', 'Pichhle 6 mahine mein kahin aur loan ke liye baat ki thi? Kahan, aur kya hua?',
      `${b.bureau.enquiries6m} bureau enquir${b.bureau.enquiries6m === 1 ? 'y' : 'ies'} in 6 months`, ['recent_loan_applications']);
  }
  if (bank?.credits && b.bank?.avgBalance != null && b.bank.avgBalance < bank.credits * 0.15) {
    add('financial', 'Account mein paisa zyada der rukta nahi — bachat kahan aur kitni rakhte hain?',
      `Average balance ${inWords(b.bank.avgBalance)} against ${inWords(bank.credits)} of monthly credits`, ['savings']);
  }
  if (b.itrIncome) {
    add('financial', 'Pichhle saal ka kaam kaisa raha — is saal se zyada tha ya kam?',
      `ITR income ${inWords(b.itrIncome)} a year (${inWords(b.itrIncome / 12)} a month) vs declared ${inWords(c.declaredIncome)} a month`);
  }
  (b.largeDeposits ?? []).forEach((d) => add('financial', `${d.month} mein ek badi rakam jama hui thi — woh paisa kahan se aaya tha?`,
    `${inWords(d.amount)} deposited in ${d.month} with no source on file`));
  if (b.bank?.bounces) {
    add('financial', 'Kabhi kisi ka cheque ya auto-debit wapas hua tha? Kya hua tha tab?', `${b.bank.bounces} bounce(s) on the statement`);
  }
  if (bank?.credits && !b.gstRegistered && bank.credits * 12 > 4000000) {
    add('documents', 'Dukaan kis naam se registered hai — Udyam, GST? GST kyun nahi karaya?',
      `Bank turnover about ${inWords(bank.credits * 12)} a year, above the Rs 40 lakh GST threshold for goods, but not GST registered`, ['business_registration']);
  }
  (b.missingDocs ?? []).forEach((d) => add('documents', `${d} abhi tak nahi mila — kab tak de payenge?`, `${d} missing from the file`));
  if (c.loanPurpose) {
    add('loan_purpose', 'Loan ka paisa kis kis cheez mein lagega — kaunsa saamaan, kis dealer se, kitne ka?',
      `File says the purpose is "${c.loanPurpose}"`, ['loan_purpose']);
    add('loan_purpose', 'Jo saamaan loan se aayega, usse mahine ki bikri kitni badhegi?', 'Does the purpose pay for its own EMI?');
  }
  if (c.loanAmountRequested && bank?.income) {
    add('loan_purpose', 'Nayi kisht har mahine kaise bharenge — agar koi mahina kamzor gaya toh?',
      `Asking ${inWords(c.loanAmountRequested)} on about ${inWords(bank.income)} a month of bank-supported income`, ['repayment_plan']);
  }
  return tidy(out, 'file');
}

const TOPICS = Object.entries(COVERABLE).map(([k, v]) => `${k} (${v.label})`).join('; ');

const PREP_SYSTEM = `You prepare a loan officer for a Personal Discussion (PD) with a small-business borrower in India.
From the loan file you are given, write ${HOT_MIN}-${HOT_MAX} of the most important questions to ask THIS applicant.

Return ONLY JSON: {"questions":[{"q":"...","why":"...","section":"...","covers":["..."]}]}. No prose, no markdown.

Rules:
- Every question must come from something specific in THIS file: a gap between declared and bank income, the cash
  share, a running loan, bureau enquiries, a deposit with no source, a missing document, the loan purpose, the risk
  pattern, the trade's season, the officer's notes. Never a generic question any applicant would get.
- The interview has these standard questions: ${TOPICS}.
  Where your question ALSO gets one of those facts, list its key in "covers" — that standard question is then SKIPPED,
  so your question must really get the fact (not "rent kab badha" alone, but "kiraya kitna hai, aur kab badha tha").
  Cover as many standard questions as your questions sensibly can: the call must stay short. Each key at most once.
- "q" is what is said to the borrower: simple Hinglish (Latin script), under 22 words, like a local bank person — no
  banking words (say kisht, bikri, kamai, udhaar, never EMI, turnover, FOIR, margin). A natural pair is fine.
- "why" is for the officer, in English, under 25 words, naming the figure or document in the file that prompts it.
- "section" is one of: ${SECTIONS.join(', ')}.
- Use only facts in the file. Never invent a number, a name or a document.`;

function parse(reply) {
  const body = String(reply).replace(/```(?:json)?\s*([\s\S]*?)```/g, '$1').trim();
  const match = body.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!match) return null;
  try {
    const v = JSON.parse(match[0]);
    return Array.isArray(v) ? v : Array.isArray(v?.questions) ? v.questions : null;
  } catch { return null; }
}

/**
 * The file's hot questions, cached per case. `fresh` asks again. Always resolves: a model failure returns the
 * questions built from the file in code, topped up to at least HOT_MIN where the model returned fewer.
 */
export async function prepareHotQuestions(c, { fresh = false } = {}) {
  if (!c || c.isNew) return { questions: [], source: 'none' };
  const cached = !fresh && loadHot(c.id);
  if (cached?.questions?.length) return cached;

  const rules = ruleHotQuestions(c);
  let result = { questions: rules, source: 'file', at: new Date().toISOString() };
  if (!MOCKS_ON) {
    try {
      const biz = lookupBusiness(c.businessKey || c.business);
      const pattern = c.riskPatternMatch ? lookupRiskPattern(c.riskPatternMatch.patternId) : null;
      const file = {
        applicant: briefForCitation(c),
        bankSupportedIncome: bankIncome(c),
        riskPattern: pattern ? { ...c.riskPatternMatch, ...pattern } : null,
        trade: biz ? { label: biz.label, typicalMarginPct: biz.typicalMarginPct, avgBillValue: biz.avgBillValue, dailyCustomers: biz.dailyCustomers, peakSeason: biz.peakSeason, redFlags: biz.redFlags } : null,
      };
      const reply = await askAgent({
        systemPrompt: PREP_SYSTEM,
        messages: [{ role: 'user', content: `LOAN FILE:\n${JSON.stringify(file, null, 2)}` }],
        temperature: 0.3,
        maxTokens: 3000,
        provider: 'llm',
      });
      const drafted = tidy(parse(reply) ?? [], 'ai');
      if (drafted.length) {
        // Too few from the model → topped up from the file, never padded with invented ones.
        const topUp = drafted.length < HOT_MIN ? rules.slice(0, HOT_MIN - drafted.length) : [];
        result = { questions: tidy([...drafted, ...topUp], 'ai'), source: 'ai', at: new Date().toISOString() };
      }
    } catch (e) {
      console.warn(`[sarthi] hot questions: model unavailable (${e?.message}) — using the file's own`);
    }
  }
  saveHot(c.id, result);
  return result;
}
