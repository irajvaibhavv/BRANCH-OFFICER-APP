// Task → provider routing ('slm' = Groq, 'llm' = Gemini). Decided before the call; no fallback between providers.
import { askAgent, askAgentStream, buildInterviewerPrompt, INTERVIEWER_TEMP } from './agent';
import { EXTRACTABLE_KEYS, FIELD_DEFS } from './memory';
import { reconcile } from './hindiNumbers';
import { MOCKS_ON, mockExtractFacts, mockTurn } from './mocks';

// Measured routing rationale lives in CLAUDE.md (Sarthi → routing). Override per task via env.
const TASK_ROUTES = {
  // SLM to save Gemini's per-day quota; numbers are reconciled in code and the facts fence backs it up.
  extract_facts: import.meta.env.VITE_SARTHI_EXTRACT_PROVIDER || 'slm',
  // The SLM drops the speech/facts/claim fences on this prompt — keep on the LLM.
  generate_question: import.meta.env.VITE_SARTHI_QUESTION_PROVIDER || 'llm',
  follow_up: 'llm',
  greeting: 'llm',
  closing: 'llm',
  verification_biz: 'llm',
  verification_area: 'llm',
  hyper_local: 'llm',
  generate_report: 'llm',
};

export function routeFor(task, { hasBusinessData = true } = {}) {
  if (task === 'verification_biz' && !hasBusinessData) return 'llm';
  return TASK_ROUTES[task] || 'llm';
}

export function taskForAction(action) {
  if (!action) return 'generate_question';
  if (action.hyperLocal) return 'hyper_local';
  if (action.section === 'verification') {
    return action.verificationTask === 'business_domain' ? 'verification_biz' : 'verification_area';
  }
  if (action.section === 'greeting') return 'greeting';
  if (action.section === 'closing') return 'closing';
  return 'generate_question';
}

// ---- fact extraction ----

const ENUM_GUIDE = Object.entries(FIELD_DEFS)
  .filter(([, d]) => d.options)
  .map(([k, d]) => `  ${k}: ${d.options.join(' | ')}`)
  .join('\n');

const EXTRACTOR_SYSTEM = `You extract structured facts from one answer in a loan interview. You are not part of the conversation and you never reply to the borrower.

Return ONLY a JSON object. No prose, no markdown fences, no explanation.

Allowed keys (use no others):
${EXTRACTABLE_KEYS.join(', ')}

Rules:
- Include a key ONLY if the borrower clearly stated it in THIS answer. Never guess, never carry a
  value over from earlier, never fill a field with what is typical for their trade.
- Convert Hindi number words to digits: "teen lakh" -> 300000, "paanch saal" -> 5,
  "dedh lakh" -> 150000, "pachas" -> 50.
- Money is a plain number of rupees: 300000, not "3 lakh".
- Enum fields take exactly one of their options:
${ENUM_GUIDE}
- monthly_rent is HOUSE rent; shop_rent is the rent of the shop or business premises.
- informal_loans, repayment_history and assets are short text in their words, e.g. "committee 2000 mahina".
- area_knowledge_score and business_domain_score are "high", "medium" or "low", and rate how
  CONFIDENTLY the borrower answered a knowledge question — not whether they were factually right.
  An instant specific answer is high; hesitation or "pata nahi" is low.
- If the answer stated nothing factual, return {}.

Example answer: "Ji haan, paanch saal se kirana ki dukaan hai, kiraye ka ghar hai, aath hazaar rent"
Example output: {"business_age": 5, "business_type": "kirana", "residence_type": "rented", "monthly_rent": 8000}`;

// null means "not JSON" (retry); {} means "nothing stated".
function readJson(reply) {
  const body = reply.replace(/```(?:json)?\s*([\s\S]*?)```/g, '$1').trim();
  try {
    const parsed = JSON.parse(body);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch { /* look for an object inside prose */ }

  const match = body.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch { /* fall through */ }
  }
  return null;
}

// The model picks WHICH field a number belongs to; the parser decides WHAT the number is.
function reconcileNumbers(facts, answerText) {
  const out = { ...facts };
  for (const [key, value] of Object.entries(facts)) {
    if (FIELD_DEFS[key]?.type !== 'number' || typeof value !== 'number') continue;
    const { value: fixed, corrected, from } = reconcile(value, answerText);
    if (corrected) {
      console.warn(`[sarthi] ${key}: model said ${from}, borrower said ${fixed} — using ${fixed}`);
      out[key] = fixed;
    }
  }
  return out;
}

function clean(raw) {
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!EXTRACTABLE_KEYS.includes(key)) continue;
    if (value === null || value === undefined || value === '') continue;
    out[key] = typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value.trim()) ? Number(value) : value;
  }
  return out;
}

// Runs before the controller picks the next question, so it decides on this turn's facts.
export async function extractFacts(answerText, { section = '', recent = [] } = {}) {
  if (MOCKS_ON) return clean(await mockExtractFacts(answerText));

  const context = recent.length
    ? `\n\nFor context, the last thing Sarthi asked: "${recent[recent.length - 1]}"`
    : '';
  const user = `Interview section: ${section || 'unknown'}${context}\n\nBorrower's answer: "${answerText}"`;
  const provider = routeFor('extract_facts');

  const first = await askAgent({
    systemPrompt: EXTRACTOR_SYSTEM,
    messages: [{ role: 'user', content: user }],
    temperature: 0.2,
    maxTokens: 300,
    provider,
  });

  const parsed = readJson(first);
  if (parsed) return reconcileNumbers(clean(parsed), answerText);

  // Retry the same provider — escalating would add the LLM's latency on top.
  const retry = await askAgent({
    systemPrompt: `${EXTRACTOR_SYSTEM}\n\nYour last reply was not valid JSON. Return a raw JSON object and nothing else. If no facts were stated, return exactly: {}`,
    messages: [{ role: 'user', content: user }],
    temperature: 0.1,
    maxTokens: 300,
    provider,
  });

  return reconcileNumbers(clean(readJson(retry) || {}), answerText);
}

// ---- interview turns ----

// Phrases the question the controller already chose; returns Agent 1's raw reply for parseClaims.
export async function askTurn({ caseData, action, directive, messages, turn, onChunk }) {
  const task = taskForAction(action);
  const provider = routeFor(task, { hasBusinessData: !!caseData?.businessKey });

  if (MOCKS_ON) return mockTurn(action?.section ?? 'business', turn, provider);

  const systemPrompt = buildInterviewerPrompt(caseData, directive);

  if (onChunk && provider === 'llm') {
    return askAgentStream({ systemPrompt, messages, temperature: INTERVIEWER_TEMP, onChunk });
  }

  return askAgent({ systemPrompt, messages, temperature: INTERVIEWER_TEMP, provider });
}
