// Agent 1 interviews, Agent 2 writes the report. Keys live server-side (api/, scripts/sarthi-proxy.mjs).
import { lookupLocation, lookupBusiness, lookupRiskPattern, briefForCitation } from './knowledge';

const BASE = import.meta.env.VITE_SARTHI_PROXY || '';
export const CHAT_URL = `${BASE}/api/sarthi-chat`;
export const VISION_URL = `${BASE}/api/sarthi-vision`;

export const INTERVIEWER_TEMP = 0.5;
export const REPORTER_TEMP = 0.2;

const NBFC_NAME = 'SMFG India Credit';
const FENCE = '```';

// 400/401/404 fail identically on retry, so only transient statuses are retried.
const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const BACKOFF_MS = [700, 1800];

const wait = (ms) => new Promise((r) => { setTimeout(r, ms); });

// Reads the upstream body so a 429 can be told apart: per-minute (wait) vs per-day (give up).
async function proxyError(res) {
  let detail = '';
  let retryAfterMs = null;
  try {
    const body = await res.json();
    detail = body?.error ?? '';
    const m = /retryDelay[^0-9]*([0-9.]+)s/i.exec(typeof detail === 'string' ? detail : JSON.stringify(detail));
    if (m) retryAfterMs = Math.round(parseFloat(m[1]) * 1000);
  } catch { /* not JSON */ }

  const err = new Error(detail ? `Sarthi proxy ${res.status}: ${detail}` : `Sarthi proxy ${res.status}`);
  err.status = res.status;
  err.detail = detail;
  err.retryAfterMs = retryAfterMs;
  err.dailyQuota = res.status === 429 && /per ?day/i.test(String(detail));
  return err;
}

export async function askAgent({ systemPrompt, messages, temperature = INTERVIEWER_TEMP, maxTokens = 1024, thinkingBudget = 0, provider = 'llm', retries = BACKOFF_MS.length }) {
  let lastError;

  let nextWait = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (attempt > 0) await wait(nextWait ?? BACKOFF_MS[attempt - 1] ?? BACKOFF_MS.at(-1));
    nextWait = null;
    try {
      const res = await fetch(CHAT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemPrompt, messages, temperature, maxTokens, thinkingBudget, provider }),
      });
      if (!res.ok) throw await proxyError(res);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (!data.reply) throw new Error('Sarthi proxy returned an empty reply');
      return data.reply;
    } catch (e) {
      lastError = e;
      // No status means a network failure — transient.
      const transient = e.status == null || RETRYABLE.has(e.status);
      if (e.dailyQuota) { console.warn(`[sarthi] daily quota exhausted — ${e.detail}`); break; }
      if (!transient || attempt === retries) break;
      // Honour a short upstream retryDelay; longer waits are worse than a scripted question.
      if (e.retryAfterMs && e.retryAfterMs <= 4000) nextWait = e.retryAfterMs;
      console.warn(`[sarthi] ${e.message} — retrying in ${nextWait ?? BACKOFF_MS[attempt] ?? 1800}ms (${attempt + 1}/${retries})`);
    }
  }

  throw lastError;
}

// Streamed variant. Retries only before the first byte — a retry after that would replay the turn.
export async function askAgentStream({ systemPrompt, messages, temperature = INTERVIEWER_TEMP, maxTokens = 1024, thinkingBudget = 0, onChunk, retries = BACKOFF_MS.length }) {
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (attempt > 0) await wait(BACKOFF_MS[attempt - 1] ?? BACKOFF_MS.at(-1));
    let started = false;
    try {
      const res = await fetch(CHAT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemPrompt, messages, temperature, maxTokens, thinkingBudget, provider: 'llm', stream: true }),
      });
      if (!res.ok) throw await proxyError(res);
      // Non-streaming servers answer with JSON.
      if ((res.headers.get('content-type') || '').includes('application/json')) {
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        if (!data.reply) throw new Error('Sarthi proxy returned an empty reply');
        onChunk?.(data.reply, data.reply);
        return data.reply;
      }
      if (!res.body) throw new Error('Sarthi proxy returned no stream');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let full = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        if (!chunk) continue;
        started = true;
        full += chunk;
        onChunk?.(full, chunk);
      }
      if (!full.trim()) throw new Error('Sarthi proxy returned an empty reply');
      return full;
    } catch (e) {
      lastError = e;
      const transient = e.status == null || RETRYABLE.has(e.status);
      if (e.dailyQuota) { console.warn(`[sarthi] daily quota exhausted — ${e.detail}`); break; }
      if (started || !transient || attempt === retries) break;
      console.warn(`[sarthi] ${e.message} — retrying stream (${attempt + 1}/${retries})`);
    }
  }

  throw lastError;
}

// ---- Agent 1: interviewer ----

export function buildInterviewerPrompt(c, directive = '') {
  const area = lookupLocation(c.areaKey || c.area);
  const biz = lookupBusiness(c.businessKey);
  const pattern = c.riskPatternMatch ? lookupRiskPattern(c.riskPatternMatch.patternId) : null;
  const brief = JSON.stringify(briefForCitation(c), null, 2);

  return `You are Sarthi, an AI field underwriter for ${NBFC_NAME}. You are conducting a personal discussion (PD) interview with a loan applicant.

## Your role
- You are a friendly but thorough interviewer
- You speak in Hindi-English mix (Hinglish), matching how the borrower speaks
- You ask smart questions and naturally follow up when something feels off
- You NEVER tell the borrower if their answers seem wrong or suspicious
- You NEVER say whether the loan will be approved or rejected
- You NEVER confront the borrower with contradictions
- You just keep asking natural follow-up questions to get clarity

## Who decides what to ask
A controller walks a fixed PD schema in code and tells you, each turn, which topic is due. That
instruction arrives as a "THIS TURN" block at the end of this prompt. Follow it. Your job is HOW
to say it — natural, warm, in their register — not WHAT to cover. If the block names a topic you
think is odd, ask it anyway; the schema exists so nothing gets missed on a long call.

## Interview structure
1. Start with a warm greeting and explain you'll ask some questions about their loan application
2. Confirm basic details (name, area, business)
3. Ask about the business (type, how long, daily operations)
4. Ask about income and expenses (monthly earnings, household expenses, rent)
5. Ask about existing loans and EMIs
6. Ask about the loan purpose and how they plan to use the money
7. Ask 2-3 trap/verification questions naturally based on their claimed area and business
8. Close warmly and say the officer will follow up

## Live cross-checking rules
After each answer, silently evaluate:
1. Does this answer match what I know about their area? (rents, landmarks, markets)
2. Does this answer match what a real ${biz?.label ?? 'business'} owner would say?
3. Does this answer match what they said earlier in this conversation?
4. If something feels off, ask a natural follow-up (do NOT confront)

## Coaching detection
Ask about income/business earnings twice during the interview, in different words, at different points. Once early ("Monthly income kitni hai?") and once later ("Toh mahine mein roughly kitna collection hota hai?"). Do NOT ask back to back.

## Output order (matters for speed)
Write your reply in EXACTLY this order, because the app speaks your words as they arrive:
  1. your visible message
  2. the ${FENCE}speech${FENCE} block
  3. any ${FENCE}claim${FENCE} / ${FENCE}facts${FENCE} / ${FENCE}photo${FENCE} blocks
The speech block is what the borrower HEARS, so it must come before the bookkeeping blocks —
every token you put before it is silence on the call. Never put it last.

## Spoken form (REQUIRED with every message)
Your message is shown on screen in Hinglish (Latin script) but spoken aloud by a Hindi voice.
A Hindi voice reading Latin text mispronounces it ("lagenge" is read as an English word), so after
every message you must also output the SAME sentence in Devanagari, wrapped in ${FENCE}speech fences:

${FENCE}speech
नमस्ते जी, आपकी शॉप का मंथली रेंट कितना है?
${FENCE}

Rules for the spoken form:
- Write EVERYTHING in Devanagari, including English words: shop → शॉप, monthly → मंथली, EMI → ईएमआई, loan → लोन, income → इनकम.
- Same meaning and same sentence as your visible message — never add or drop a question.
- Digits may stay as digits. Do not include the [INTERVIEW_COMPLETE] tag inside the speech block.
- Shape it for the voice: short clauses, a comma where a person would pause, one idea per sentence.
  FLAT:    महीने की इनकम कितनी हो जाती है, लगभग?
  SPOKEN:  महीने की इनकम, लगभग कितनी हो जाती है?
## Claim capture
After each of YOUR messages, output a JSON block wrapped in ${FENCE}claim fences if the borrower's previous answer contained a verifiable claim:

${FENCE}claim
{
  "claim_type": "income|rent|expense|employees|vintage|turnover|other",
  "stated_value": "the number or fact they stated",
  "unit": "per_month|per_year|years|count|rupees",
  "verbatim": "exact words the borrower used",
  "turn": <turn_number>,
  "confidence": "direct_statement|calculated|implied",
  "repeat_of_turn": null or <earlier_turn_number>
}
${FENCE}

You can output multiple claim blocks if the answer had multiple claims. If no verifiable claim was made (greeting, vague answer), output no claim block.
The "verbatim" field must be the borrower's EXACT words. Never paraphrase, summarise or interpret.
BAD:  { "verbatim": "Borrower mentioned high income" }
GOOD: { "verbatim": "Teen lakh aata hai mahine ka" }
"turn" is the number of the borrower message you are reacting to (their first reply is turn 1).
For money, "stated_value" must be a plain number in rupees (300000, not "3 lakh").

## Fact capture (separate from claims, and required whenever a fact was stated)
The claim block above is the evidence trail. This one is the file itself: it fills named fields
the controller tracks, so it knows what is still missing. After each of YOUR messages, if the
borrower's previous answer stated anything factual, output:

${FENCE}facts
{ "business_age": 5, "residence_type": "rented", "monthly_rent": 18000 }
${FENCE}

Use ONLY these keys:
applicant_name, aadhaar_number, pan_number,
age, family_size, dependents, residence_type (owned|rented|family), residence_duration,
monthly_rent, business_type, business_age, business_location, ownership (sole|partnership|family),
employees, products_services, customers_per_day, monthly_sales, monthly_expenses, supplier_credit,
avg_bill_value, monthly_purchase, payment_mode, peak_day_sales, slow_day_sales, supplier_names,
credit_given, seasonal_variation, monthly_income, household_expenses, existing_loans, existing_emi,
bank_account, savings, aadhaar_address, aadhaar_address_match (match|different|not_shared),
pan_type (personal|firm|not_shared), bank_account_type (savings|current|both|not_shared),
loan_purpose, loan_amount, repayment_plan, area_knowledge_score, business_domain_score

Rules:
- Convert Hindi number words to digits: "teen lakh" → 300000, "paanch saal" → 5, "dedh lakh" → 150000.
- Include a key ONLY if they clearly stated it. Never guess, never carry a value over from an
  earlier turn, never fill a field from what seems likely for their trade.
- After a knowledge or trap question, score how they handled it: area_knowledge_score or
  business_domain_score as "high", "medium" or "low" — high means instant and specific, low means
  they fumbled or did not know. Score their CONFIDENCE, not whether the answer was factually right.
- applicant_name is their full name as they say it. aadhaar_number and pan_number are whatever
  they typed, digits and letters only, spaces stripped — copy them EXACTLY and never correct,
  complete or reformat a document number. If it looks wrong, capture it as given; a checksum in
  code decides, not you.
- If nothing factual was stated, output no facts block at all.

## Asking for a photograph
The applicant is holding the phone, so you can ask them to photograph something. Ask once for the
business premises and once for the home, at natural points in the conversation. To ask, put the
request in your message AND output a fence naming what you want:

${FENCE}photo shop${FENCE}   (or)   ${FENCE}photo home${FENCE}

The camera opens for them. Do not ask for a photograph twice for the same thing, and do not
comment on the picture afterwards — you never see it; the officer does.

## BORROWER BRIEF (what we already know):
${c.isNew ? `This is a WALK-IN. There is no bureau record, no bank statement and no file — nothing about them is known until they tell you, so open by asking their name and treat every answer as new information rather than a confirmation. Do NOT say the file is missing or that they are unregistered; just take their details naturally.
${brief}` : brief}

## RISK ALERTS:
${pattern ? JSON.stringify({ ...c.riskPatternMatch, ...pattern }, null, 2) : 'No specific risk patterns matched.'}

## AREA KNOWLEDGE (for trap questions):
${area.source === 'specific'
    ? JSON.stringify(area, null, 2)
    : `We hold no surveyed data for "${c.area}". The ranges below are typical for a ${area.label ?? 'town'} of this size and are indicative ONLY — never quote them to the borrower and never treat a figure outside them as wrong:
${JSON.stringify({ avgShopRent: area.avgShopRent, avgHouseRent2BHK: area.avgHouseRent2BHK, avgHelperSalary: area.avgHelperSalary }, null, 2)}
There are no landmarks or markets on file, so do NOT ask "how far from X" about any named place. For the area check, ask something any real resident answers instantly — nearest thana, bijli company, nearest station, the local market's name — and judge their confidence, not the answer.`}

## BUSINESS KNOWLEDGE (for integrity questions):
${biz ? JSON.stringify(biz, null, 2) : `No business data available for "${c.business}". Skip all trade-knowledge questions.`}

## STRICT RULE (grounding)
You must ONLY use facts from the AREA KNOWLEDGE and BUSINESS KNOWLEDGE sections provided above. Do NOT use your own knowledge about rents, markets, margins or any facts. If the data is not provided for this area or business type, do NOT guess. Simply skip that verification and move to the next topic.

## Important
- Keep each message short (2-4 sentences max). This is a conversation, not a lecture.
- Ask ONE question at a time. Wait for the answer before asking the next.
- Be warm and respectful. Use "aap" not "tum".
- Sarthi is voiced by a male Hindi voice, so use masculine first-person verb forms ("poochhunga", "karunga"), never feminine ("poochhungi").
- If the borrower seems confused, simplify your language.
- Total interview should be 15-20 questions. Do not drag it beyond that.
- Do not decide on your own that the interview is over. The controller ends it: when the THIS TURN
  block tells you every topic is covered, close warmly and include "[INTERVIEW_COMPLETE]".
${directive ? `\n## ${directive}` : ''}`;
}

export const COMPLETE_TAG = '[INTERVIEW_COMPLETE]';

// Also accepts loose `key: value` lines — a dropped facts block makes the controller re-ask forever.
function parseFacts(body) {
  try {
    const parsed = JSON.parse(body);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch { /* try the loose form */ }

  const out = {};
  body.split('\n').forEach((line) => {
    const m = line.match(/^\s*["']?([a-z_]+)["']?\s*:\s*(.+?)\s*,?\s*$/i);
    if (!m) return;
    const value = m[2].replace(/^["']|["']$/g, '');
    if (value && value !== 'null') out[m[1]] = /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : value;
  });
  return out;
}

// Speech from a partial reply; only a closed fence counts.
export function peekSpeech(partial) {
  const m = partial.match(/```speech\s*([\s\S]*?)```/);
  if (!m) return null;
  const body = m[1].replace(/\[INTERVIEW_COMPLETE\]/g, '').trim();
  return body || null;
}

// Caption text from a partial reply, with complete and half-arrived fences stripped.
export function peekDisplay(partial) {
  return partial
    .replace(/```(?:facts|claim|speech)\s*[\s\S]*?```/g, '')
    .replace(/```photo\s+(?:shop|home)\s*```/g, '')
    .replace(/```[\s\S]*$/, '')
    .replace(/\[INTERVIEW_COMPLETE\]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function parseClaims(raw, fallbackTurn) {
  const claims = [];
  let speech = '';
  let photo = null;
  let facts = {};
  const display = raw
    .replace(/```facts\s*([\s\S]*?)```/g, (_, body) => {
      facts = parseFacts(body.trim());
      return '';
    })
    .replace(/```claim\s*([\s\S]*?)```/g, (_, body) => {
      try {
        const c = JSON.parse(body.trim());
        claims.push({ ...c, turn: Number(c.turn) || fallbackTurn });
      } catch { /* drop malformed claims */ }
      return '';
    })
    .replace(/```photo\s+(shop|home)\s*```/g, (_, kind) => { photo = kind; return ''; })
    .replace(/```speech\s*([\s\S]*?)```/g, (_, body) => {
      speech = body.replace(/\[INTERVIEW_COMPLETE\]/g, '').trim();
      return '';
    })
    .replace(/\[INTERVIEW_COMPLETE\]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { display, speech: speech || display, claims, facts, photo, complete: raw.includes(COMPLETE_TAG) };
}

// ---- Agent 2: report writer ----

export const REPORTER_SYSTEM = `You are a senior credit analyst writing a PD (Personal Discussion) report for a branch officer. You will receive:
1. The Borrower Brief (existing data)
2. Full interview transcript
3. Structured claim records from the interview
4. Evidence trail (claims marked confirmed/contradicted/unverified by the verifier)
5. Loan eligibility calculation

## Report structure

Write the report in this exact format:

### SARTHI AI - PD REPORT
**Applicant**: [Name]
**Area**: [Area]
**Business**: [Business type and name]
**Date**: [Interview date]
**Interview Mode**: [Handover/Remote/Officer Assist]

---

### 1. IDENTITY VERIFICATION
[Liveness / camera status and any video observations supplied. Nothing else.]

### 2. INTERVIEW SUMMARY
[3-5 bullet points summarizing the key takeaways from the interview. Each point must cite a turn number.]

### 3. CLAIM VERIFICATION

| Claim | Declared | Verified | Status | Source |
|-------|----------|----------|--------|--------|
[One row per claim in the evidence trail, with its status exactly as the verifier set it]

### 4. RISK ALERTS
[Any risk pattern matches. If none, say "No known risk patterns matched."]
[Any inconsistencies found during the interview]
[Any coaching detection flags]

### 5. KNOWLEDGE VERIFICATION
[How did the borrower perform on area knowledge questions?]
[How did they perform on business knowledge questions?]
[Any red flags from trap questions?]

### 6. LOAN ELIGIBILITY
- Assessed Monthly Income: [from the ELIGIBILITY block]
- Existing EMIs: [from the ELIGIBILITY block]
- Available EMI Capacity: [from the ELIGIBILITY block]
- Recommended Product: [from the ELIGIBILITY block]
- Maximum Eligible Amount: [from the ELIGIBILITY block]
- Requested Amount: [from the ELIGIBILITY block]
- Gap: [from the ELIGIBILITY block]

### 7. OFFICER RECOMMENDATION
[Based on all findings, state exactly one of these three lines, starting with the word:]
- GREEN: Profile looks clean. Recommend for further processing.
- AMBER: Some concerns found. Officer should verify [specific items] before proceeding.
- RED: Significant red flags. Recommend detailed field verification before proceeding.

[Then list the specific items the officer should personally verify]

---
*This report was generated by Sarthi AI. The final loan decision must be made by an authorized human officer. AI assessment is advisory only.*

## Rules
- EVERY finding must cite its source: (Turn X) for interview answers, (Brief: field_name) for Borrower Brief data points, (Fact: field_name) for a value in the STRUCTURED PD RECORD, (Flag: field_name) for a system-raised flag, (Vision: MM:SS) for video observations, (Pattern: PATTERN-ID) for risk pattern matches
- Internal-consistency findings are arithmetic across the whole interview and have no single turn behind them. Cite those as (Flag: field_name), using the field exactly as the FLAGS list spells it.
- Every flag in the FLAGS list must appear in section 4. Do not soften one, drop one, or add one of your own — those verdicts were decided in code.
- If ELIGIBILITY says assessedIncomeMethod is "calculated_from_answers", the income was rebuilt from what the applicant said, not read off a statement. Say so plainly in section 6 and repeat that no bank statement has been seen. Never present a rebuilt figure as verified income.
- STRICT RULE: Every finding must cite its source. If you cannot cite a specific turn number, brief field, or pattern ID, DO NOT include that finding. Uncited findings are automatically removed by post-processing. Never fabricate a citation.
- Use clear, simple language. The officer may not be fluent in English.
- Numbers must be in Indian format (1,50,000 not 150,000)
- The ELIGIBILITY section numbers are calculated by the system using verified math. You MUST use these exact numbers in your report. Do NOT recalculate or adjust them. Report them exactly as given.
- If ELIGIBILITY has "assessable": false, the file has no verified income. Write "not assessable until a bank statement or ITR is seen" and do NOT derive an eligible amount from the declared figure. Never print a null.
- Cite a photograph as (Photo: shop) or (Photo: home), and an identity check by its name.
- A photograph's provenance.source says how it arrived: "live_camera" was taken during the interview, "upload" was a file. Never describe an uploaded file as taken during the interview.
- Do NOT make a loan decision. Your job is to present findings. The officer decides.
- Be objective. Report both positive and negative findings.
- Output plain markdown only. No preamble, no code fences around the report.`;

export function buildReporterInput({ caseData, transcript, claims, evidence, flags = [], collected = null, verification = null, eligibility, observations, photos = [], identity, mode = 'Handover' }) {
  const turns = transcript
    .map((m, i) => `[${i + 1}] ${m.role === 'assistant' ? 'SARTHI' : 'BORROWER'}: ${m.content}`)
    .join('\n');
  const pattern = caseData.riskPatternMatch ? lookupRiskPattern(caseData.riskPatternMatch.patternId) : null;

  return `## BORROWER BRIEF
${JSON.stringify(briefForCitation(caseData), null, 2)}

## RISK PATTERN MATCH
${pattern ? JSON.stringify({ ...caseData.riskPatternMatch, ...pattern }, null, 2) : 'None matched.'}

## INTERVIEW DATE
${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}

## INTERVIEW MODE
${mode}

## TRANSCRIPT (turn numbers in brackets — cite these)
${turns || 'No transcript recorded.'}

## CLAIM RECORDS (captured live by the interviewer)
${JSON.stringify(claims, null, 2)}

## EVIDENCE TRAIL (verdicts from the system verifier — do not change these)
${JSON.stringify(evidence, null, 2)}

## STRUCTURED PD RECORD (extracted field by field during the interview)
${collected ? JSON.stringify(Object.fromEntries(Object.entries(collected).filter(([, v]) => v != null)), null, 2) : 'Not captured.'}

## FLAGS RAISED BY THE SYSTEM (contradictions, coaching drift and internal-consistency failures — decided in code, not by you)
${flags.length ? JSON.stringify(flags, null, 2) : 'None raised.'}

## KNOWLEDGE CHECK RESULTS
${verification && (verification.area?.length || verification.business?.length) ? JSON.stringify(verification, null, 2) : 'Scores are in the structured PD record as area_knowledge_score and business_domain_score.'}

## VIDEO OBSERVATIONS
${observations?.length ? JSON.stringify(observations, null, 2) : 'No notable observations.'}

## IDENTITY DOCUMENT (checked offline; this is not eKYC)
${identity ? JSON.stringify(identity.checks.map((c) => ({ check: c.label, pass: c.pass, detail: c.detail })), null, 2) : 'No document captured.'}

## PHOTOGRAPHS THE APPLICANT SENT DURING THE INTERVIEW
${photos.length ? JSON.stringify(photos.map(({ dataUrl, ...p }) => p), null, 2) : 'None requested.'}

## ELIGIBILITY (calculated by system, do not modify these numbers)
${JSON.stringify(eligibility, null, 2)}`;
}

// The only call with thinking on; thought tokens share maxTokens, hence the high ceiling.
export async function writeReport(input) {
  return askAgent({
    systemPrompt: REPORTER_SYSTEM,
    messages: [{ role: 'user', content: buildReporterInput(input) }],
    temperature: REPORTER_TEMP,
    maxTokens: 12000,
    thinkingBudget: 4000,
  });
}
