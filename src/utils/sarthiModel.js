/*
  SARTHI — the model layer: which model does which job, decided in code.

  Two providers sit behind one proxy endpoint:
    slm  Groq / Llama 3.1 8B  — ~0.3s. Pattern work: pulling facts out of an answer, phrasing a
                                question the controller already chose.
    llm  Gemini               — ~2.7s. Reasoning: the report, and area questions that need real
                                world knowledge of an Indian neighbourhood.

  ROUTING HAPPENS BEFORE THE CALL, and there is no runtime fallback between providers. That is
  the whole point. Trying the SLM, discovering it cannot do the job and then calling the LLM
  costs SLM time + LLM time — strictly worse than having called the LLM in the first place. The
  controller already knows what kind of task it is, because the controller is our code, so the
  decision is a table lookup, not a gamble.

  When extraction comes back as unusable JSON we retry the SLM with a stricter prompt (~0.3s),
  never escalate to the LLM (~2.7s). Extraction is a pattern task; a second attempt fixes it.

  With no GROQ_API_KEY on the server, 'slm' is served by Gemini and everything behaves exactly as
  it did before this file existed. Adding the key later needs no code change.
*/
import { askAgent, askAgentStream, buildInterviewerPrompt, INTERVIEWER_TEMP } from './sarthiAgent';
import { EXTRACTABLE_KEYS, FIELD_DEFS } from './sarthiMemory';
import { reconcile } from './hindiNumbers';
import { MOCKS_ON, mockExtractFacts, mockTurn } from './sarthiMocks';

/*
  Tasks, and who does them.

  MEASURED 2026-09-25 against this account's Groq models — the plan in SARTHI-CLAUDE.md does not
  survive contact with them, so both interview routes default to the LLM. The routing, the proxy
  and the env flags are all live; flip a task back with one env var the day a better SLM lands.

  1. `llama-3.1-8b-instant` does not exist on this key. Groq serves it no Llama chat model at all.
     Of what is offered, `qwen/qwen3.8-27b` was the best (383ms, clean JSON); `openai/gpt-oss-20b`
     returned an EMPTY string on the interview prompt and `gpt-oss-120b` truncated mid-JSON, both
     because reasoning tokens are billed against max_tokens — the same trap as Gemini's thinking.

  2. generate_question is impossible on the SLM for two independent reasons. Qwen dropped EVERY
     fence on the real 11.7k-char prompt — no ```speech```, so a Hindi voice would read Latin text
     aloud, which is the exact bug that fence exists to prevent — no ```facts```, no ```claim```.
     And Groq's free tier allows 7,000 input tokens per MINUTE against a ~3,600-token prompt:
     two turns a minute, whatever the quality. Gemini returned all three fences in 3.4s.

  3. extract_facts is fast on the SLM (189ms vs ~1.3s) and its NUMBER problem is now solved in
     code, not by the provider: hindiNumbers.js re-reads the borrower's own words and overrides
     the model when they disagree (30/30 on the numeral suite; it caught "pandrah hazaar" read as
     12,000, "bais hazaar" as 20,000 and "saath customer" as 6). What remains is not fixable from
     outside the model: Qwen DROPS fields outright. With the preceding question supplied for
     context it captured 5/8, missing "athaara saal se kaam kar raha hoon" asked directly how many
     years — a miss the parser cannot repair, because only the model knows which field a number
     belongs to. Gemini captured that one. ~37% of stated facts going missing would leave the
     controller re-asking and the report thin, so extraction stays on the LLM.

     Shorter prompts are NOT the lever here. A 72-token prompt scored WORSE (3/8) than the
     414-token one; adding an explicit numeral glossary took it to 6/8. The parser then made the
     glossary unnecessary.
*/
const TASK_ROUTES = {
  // Set VITE_SARTHI_EXTRACT_PROVIDER=slm to trade number accuracy for ~2.5s a turn. Read (3) first.
  extract_facts: import.meta.env.VITE_SARTHI_EXTRACT_PROVIDER || 'llm',
  // Set VITE_SARTHI_QUESTION_PROVIDER=slm only with an SLM that holds the fences AND a tier whose
  // input-token-per-minute limit clears the prompt. Read (2) first.
  generate_question: import.meta.env.VITE_SARTHI_QUESTION_PROVIDER || 'llm',
  follow_up: 'llm',
  greeting: 'llm',
  closing: 'llm',
  verification_biz: 'llm',
  verification_area: 'llm', // needs real knowledge of the neighbourhood
  hyper_local: 'llm',       // same
  generate_report: 'llm',   // reasoning across the whole interview
};

/**
 * Which provider handles this task. Called before the request goes out, never after a failure.
 * `hasBusinessData` is the one branch: trade questions are SLM work when businessKnowledge.json
 * covers the trade (the model is just rewording our data) and LLM work when it does not (the
 * model has to supply the knowledge itself).
 */
export function routeFor(task, { hasBusinessData = true } = {}) {
  if (task === 'verification_biz' && !hasBusinessData) return 'llm';
  return TASK_ROUTES[task] || 'llm';
}

/**
 * Name the task behind a controller instruction, so the caller does not have to know the table.
 */
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

/* ============================================================ fact extraction */

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
  residence_type: owned | rented | family
  ownership: sole | partnership | family
  aadhaar_address_match: match | different | not_shared
  pan_type: personal | firm | not_shared
  bank_account_type: savings | current | both | not_shared
- area_knowledge_score and business_domain_score are "high", "medium" or "low", and rate how
  CONFIDENTLY the borrower answered a knowledge question — not whether they were factually right.
  An instant specific answer is high; hesitation or "pata nahi" is low.
- If the answer stated nothing factual, return {}.

Example answer: "Ji haan, paanch saal se kirana ki dukaan hai, kiraye ka ghar hai, aath hazaar rent"
Example output: {"business_age": 5, "business_type": "kirana", "residence_type": "rented", "monthly_rent": 8000}`;

/**
 * Read a JSON object out of a model reply that may have wrapped it in prose or a fence.
 * Returns null when nothing parses, so the caller can tell "nothing said" ({}) apart from
 * "the model did not answer in JSON" (null) and retry only in the second case.
 */
function readJson(reply) {
  const body = reply.replace(/```(?:json)?\s*([\s\S]*?)```/g, '$1').trim();
  try {
    const parsed = JSON.parse(body);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch { /* try to find an object inside the prose instead */ }

  const match = body.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch { /* fall through */ }
  }
  return null;
}

/*
  Cross-check every numeric field against the borrower's own words.

  The model is good at deciding WHICH field a number belongs to — that needs conversation context.
  It is measurably unreliable at deciding WHAT the number is: Qwen read "pandrah hazaar" (15,000)
  as 12,000. `reconcile` re-reads the sentence with a deterministic parser and, when the sentence
  contains exactly one number and the two disagree, keeps the parsed one. With zero or several
  numbers in the sentence the parser cannot tell which field is meant, so it abstains and the
  model's value stands.

  A correction is logged rather than swallowed: a run of these means the extractor prompt or the
  provider needs looking at.
*/
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

/** Drop unknown keys and nulls, and coerce numeric strings, before anything reaches memory. */
function clean(raw) {
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!EXTRACTABLE_KEYS.includes(key)) continue;
    if (value === null || value === undefined || value === '') continue;
    out[key] = typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value.trim()) ? Number(value) : value;
  }
  return out;
}

/**
 * Job 1 of 2 for the model: turn one borrower answer into named fields.
 *
 * Runs BEFORE the controller picks the next question, which is why this is a separate call at
 * all — the controller gets to see this turn's facts rather than last turn's. Throwing is fine
 * and expected to happen occasionally; the caller treats a failed extraction as "no facts this
 * turn" and carries on, because the question call also emits a ```facts``` fence as a backstop.
 */
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

  // Bad JSON: retry the SAME provider, colder and stricter. Escalating to the LLM here would
  // cost its full latency on top of the attempt we just spent.
  const retry = await askAgent({
    systemPrompt: `${EXTRACTOR_SYSTEM}\n\nYour last reply was not valid JSON. Return a raw JSON object and nothing else. If no facts were stated, return exactly: {}`,
    messages: [{ role: 'user', content: user }],
    temperature: 0.1,
    maxTokens: 300,
    provider,
  });

  return reconcileNumbers(clean(readJson(retry) || {}), answerText);
}

/* ============================================================ interview turns */

/**
 * Job 2 of 2: phrase the question the controller has already chosen, and return Agent 1's raw
 * reply for `parseClaims` to split. The provider is chosen from the instruction before the
 * request goes out — an area or hyper-local question needs the LLM's knowledge of the
 * neighbourhood, everything else is phrasing work the SLM does in a fraction of the time.
 */
export async function askTurn({ caseData, action, directive, messages, turn, onChunk }) {
  const task = taskForAction(action);
  const provider = routeFor(task, { hasBusinessData: !!caseData?.businessKey });

  if (MOCKS_ON) return mockTurn(action?.section ?? 'business', turn, provider);

  const systemPrompt = buildInterviewerPrompt(caseData, directive);

  // Stream whenever the caller can use the chunks. Only the LLM streams — the SLM answers in a
  // few hundred milliseconds, where the machinery would cost more than it saves.
  if (onChunk && provider === 'llm') {
    return askAgentStream({ systemPrompt, messages, temperature: INTERVIEWER_TEMP, onChunk });
  }

  return askAgent({ systemPrompt, messages, temperature: INTERVIEWER_TEMP, provider });
}
