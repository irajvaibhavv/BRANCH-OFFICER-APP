// Vercel serverless function — Sarthi's chat endpoint (Agent 1 and Agent 2).
// Runs on the server. GEMINI_API_KEY / GROQ_API_KEY are set in the Vercel dashboard and must
// NEVER carry a VITE_ prefix: Vite inlines VITE_* into the client bundle, publishing the key.
//
// Two providers behind one endpoint:
//   llm  Gemini — reasoning, report writing, area knowledge
//   slm  Groq / Llama 3.1 8B — fact extraction and question phrasing (~0.3s vs ~2.7s)
// The CLIENT decides which, before the call (see sarthiModel.js). This file never re-routes a
// request that failed: retrying elsewhere would cost the first provider's latency on top of the
// second's, which is slower than having gone straight to the second. The one exception is
// configuration, not failure — with no GROQ_API_KEY set, 'slm' is served by Gemini so the app
// behaves exactly as it did before a Groq key existed.

const MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
const SLM_MODEL = process.env.GROQ_MODEL || 'qwen/qwen3.8-27b';

/*
  Gemini 3 thinks before it answers, and those thought tokens are charged against
  maxOutputTokens. Left alone, a 1024-token interview turn spent ~730 of them thinking and
  returned barely 80 tokens of answer — one long reply away from being truncated mid-```speech```
  fence, which would break caption/TTS parsing. It also costs seconds of dead air while the
  borrower waits. So thinking is OFF by default and callers opt back in: the interviewer wants
  speed, the report writer (which passes a budget) wants the reasoning.
*/
async function callGemini({ systemPrompt, messages, temperature, maxTokens, thinkingBudget }) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: messages.map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        })),
        generationConfig: {
          temperature,
          maxOutputTokens: maxTokens,
          thinkingConfig: { thinkingBudget },
        },
      }),
    },
  );

  const data = await response.json();
  if (!response.ok) {
    const err = new Error(data?.error?.message || `Gemini ${response.status}`);
    err.status = response.status;
    throw err;
  }
  // Join every part: a thinking model can split its answer across parts, and taking only
  // parts[0] silently truncates the reply (or returns '' when part 0 holds no text).
  return (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text || '').join('');
}

// Groq speaks the OpenAI chat format, so the system prompt is a message rather than a
// separate field, and 'assistant' is already the right role name.
async function callGroq({ systemPrompt, messages, temperature, maxTokens }) {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: SLM_MODEL,
      messages: [
        ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
        ...messages.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
      ],
      temperature,
      max_tokens: maxTokens,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    const err = new Error(data?.error?.message || `Groq ${response.status}`);
    err.status = response.status;
    throw err;
  }
  return data.choices?.[0]?.message?.content || '';
}

/*
  Stream Gemini straight through as newline-delimited text chunks.

  The client shows the caption as it arrives and — because the prompt puts the ```speech``` block
  before the bookkeeping blocks — can start rendering audio while claims and facts are still on
  the wire. Plain chunks rather than SSE: there is no event type to carry, and the client already
  has to buffer for fence parsing.

  Errors before the first chunk are returned as JSON with a status, exactly like the buffered
  path, so the client's retry logic is unchanged. Once bytes are out the status is already 200,
  so a mid-stream failure can only end the stream — the client keeps whatever text it received.
*/
async function streamGemini({ systemPrompt, messages, temperature, maxTokens, thinkingBudget }, res) {
  const upstream = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:streamGenerateContent?alt=sse&key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: messages.map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        })),
        generationConfig: { temperature, maxOutputTokens: maxTokens, thinkingConfig: { thinkingBudget } },
      }),
    },
  );

  if (!upstream.ok) {
    const data = await upstream.json().catch(() => ({}));
    return res.status(upstream.status).json({ error: data?.error?.message || `Gemini ${upstream.status}` });
  }

  res.writeHead(200, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'X-Accel-Buffering': 'no', // otherwise a proxy may hold the whole body and defeat streaming
  });

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // SSE frames are separated by a blank line; keep any partial frame for the next read.
    const frames = buffer.split('\n\n');
    buffer = frames.pop() ?? '';
    for (const frame of frames) {
      for (const line of frame.split('\n')) {
        if (!line.startsWith('data:')) continue;
        try {
          const json = JSON.parse(line.slice(5).trim());
          const text = (json.candidates?.[0]?.content?.parts ?? []).map((pt) => pt.text || '').join('');
          if (text) res.write(text);
        } catch { /* keep-alive or partial frame — nothing to emit */ }
      }
    }
  }
  return res.end();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const {
    messages = [], systemPrompt = '', temperature = 0.5,
    maxTokens = 1024, thinkingBudget = 0, provider = 'llm', stream = false,
  } = req.body ?? {};

  // 'slm' only reaches Groq when a key exists; otherwise it is served by Gemini unchanged.
  const useGroq = provider === 'slm' && !!process.env.GROQ_API_KEY;
  if (!useGroq && !process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: 'GEMINI_API_KEY is not set on the server' });
  }

  try {
    // Streaming is Gemini-only: the SLM is fast enough that a stream would add complexity for
    // no perceptible gain, and it is not the provider for conversational turns anyway.
    if (stream && !useGroq) {
      return await streamGemini({ systemPrompt, messages, temperature, maxTokens, thinkingBudget }, res);
    }

    const reply = useGroq
      ? await callGroq({ systemPrompt, messages, temperature, maxTokens })
      : await callGemini({ systemPrompt, messages, temperature, maxTokens, thinkingBudget });
    return res.json({ reply, served: useGroq ? 'slm' : 'llm' });
  } catch (e) {
    // Pass the upstream status through: the client retries 429/5xx and gives up on 400/401/404.
    return res.status(e.status || 500).json({ error: e.message });
  }
}
