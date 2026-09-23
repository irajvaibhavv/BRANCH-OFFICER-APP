/*
  SARTHI — the two AI agents.

  Agent 1 (interviewer) runs the live PD conversation and emits a ```claim``` block after any
  answer that contained a verifiable statement. Agent 2 (report writer) turns the brief +
  transcript + verified claims + system-calculated eligibility into a cited report.

  Both go through a server-side proxy: the Gemini key lives there, never in this bundle.
  See api/sarthi-chat.js (Vercel) or sarthi-proxy.mjs (local `npm run sarthi`).
  If the proxy is unreachable the interview screen falls back to the scripted demo in
  sarthiScript.js, so a client demo never dies on a missing key.
*/
import { lookupLocation, lookupBusiness, lookupRiskPattern, briefForCitation } from './sarthiTools';

const BASE = import.meta.env.VITE_SARTHI_PROXY || '';
export const CHAT_URL = `${BASE}/api/sarthi-chat`;
export const VISION_URL = `${BASE}/api/sarthi-vision`;

export const INTERVIEWER_TEMP = 0.5; // some naturalness for conversation
export const REPORTER_TEMP = 0.2;    // must be factual and precise

const NBFC_NAME = 'SMFG India Credit';
const FENCE = '```';

/* ============================================================ proxy call */

/** POST one turn to the proxy. Throws when the proxy or key is unavailable — callers decide. */
export async function askAgent({ systemPrompt, messages, temperature = INTERVIEWER_TEMP, maxTokens = 1024 }) {
  const res = await fetch(CHAT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ systemPrompt, messages, temperature, maxTokens }),
  });
  if (!res.ok) throw new Error(`Sarthi proxy ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  if (!data.reply) throw new Error('Sarthi proxy returned an empty reply');
  return data.reply;
}

/** Is the Gemini proxy reachable? Decides live mode vs scripted demo mode at interview start. */
export async function probeProxy() {
  try {
    const reply = await askAgent({
      systemPrompt: 'Reply with the single word OK.',
      messages: [{ role: 'user', content: 'ping' }],
      maxTokens: 8,
    });
    return !!reply;
  } catch {
    return false;
  }
}

/* ============================================================ Agent 1 — interviewer */

export function buildInterviewerPrompt(c) {
  const area = lookupLocation(c.areaKey);
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

## Asking for a photograph
The applicant is holding the phone, so you can ask them to photograph something. Ask once for the
business premises and once for the home, at natural points in the conversation. To ask, put the
request in your message AND output a fence naming what you want:

${FENCE}photo shop${FENCE}   (or)   ${FENCE}photo home${FENCE}

The camera opens for them. Do not ask for a photograph twice for the same thing, and do not
comment on the picture afterwards — you never see it; the officer does.

## BORROWER BRIEF (what we already know):
${brief}

## RISK ALERTS:
${pattern ? JSON.stringify({ ...c.riskPatternMatch, ...pattern }, null, 2) : 'No specific risk patterns matched.'}

## AREA KNOWLEDGE (for trap questions):
${area ? JSON.stringify(area, null, 2) : `No area data available for "${c.area}". Skip all area-based trap questions.`}

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
- When you have covered all topics, end the interview naturally.
- Your last message should include the phrase "[INTERVIEW_COMPLETE]" so the system knows to move to the report phase.`;
}

export const COMPLETE_TAG = '[INTERVIEW_COMPLETE]';

/**
 * Split an Agent 1 reply into what the borrower sees (Hinglish), what the voice says (Devanagari)
 * and the structured claims behind it. Anything that fails to parse is dropped, never guessed at;
 * a missing speech block just means the caption text gets spoken, which is the old behaviour.
 */
export function parseClaims(raw, fallbackTurn) {
  const claims = [];
  let speech = '';
  let photo = null;
  const display = raw
    .replace(/```claim\s*([\s\S]*?)```/g, (_, body) => {
      try {
        const c = JSON.parse(body.trim());
        claims.push({ ...c, turn: Number(c.turn) || fallbackTurn });
      } catch { /* malformed claim block — drop it, never invent one */ }
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
  return { display, speech: speech || display, claims, photo, complete: raw.includes(COMPLETE_TAG) };
}

/* ============================================================ Agent 2 — report writer */

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
- EVERY finding must cite its source: (Turn X) for interview answers, (Brief: field_name) for Borrower Brief data points, (Vision: MM:SS) for video observations, (Pattern: PATTERN-ID) for risk pattern matches
- STRICT RULE: Every finding must cite its source. If you cannot cite a specific turn number, brief field, or pattern ID, DO NOT include that finding. Uncited findings are automatically removed by post-processing. Never fabricate a citation.
- Use clear, simple language. The officer may not be fluent in English.
- Numbers must be in Indian format (1,50,000 not 150,000)
- The ELIGIBILITY section numbers are calculated by the system using verified math. You MUST use these exact numbers in your report. Do NOT recalculate or adjust them. Report them exactly as given.
- If ELIGIBILITY has "assessable": false, the file has no verified income. Write "not assessable until a bank statement or ITR is seen" and do NOT derive an eligible amount from the declared figure. Never print a null.
- Cite a photograph as (Photo: shop) or (Photo: home), and an identity check by its name.
- Do NOT make a loan decision. Your job is to present findings. The officer decides.
- Be objective. Report both positive and negative findings.
- Output plain markdown only. No preamble, no code fences around the report.`;

/** Everything Agent 2 is allowed to know, as one user message. */
export function buildReporterInput({ caseData, transcript, claims, evidence, eligibility, observations, photos = [], identity, mode = 'Handover' }) {
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

## VIDEO OBSERVATIONS
${observations?.length ? JSON.stringify(observations, null, 2) : 'No notable observations.'}

## IDENTITY DOCUMENT (checked offline; this is not eKYC)
${identity ? JSON.stringify(identity.checks.map((c) => ({ check: c.label, pass: c.pass, detail: c.detail })), null, 2) : 'No document captured.'}

## PHOTOGRAPHS THE APPLICANT SENT DURING THE INTERVIEW
${photos.length ? JSON.stringify(photos.map(({ dataUrl, ...p }) => p), null, 2) : 'None requested.'}

## ELIGIBILITY (calculated by system, do not modify these numbers)
${JSON.stringify(eligibility, null, 2)}`;
}

export async function writeReport(input) {
  return askAgent({
    systemPrompt: REPORTER_SYSTEM,
    messages: [{ role: 'user', content: buildReporterInput(input) }],
    temperature: REPORTER_TEMP,
    maxTokens: 3000,
  });
}
