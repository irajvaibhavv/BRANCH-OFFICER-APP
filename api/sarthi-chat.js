// Sarthi chat endpoint (Vercel). provider 'llm' = Gemini, 'slm' = Groq; the client routes, this never re-routes.
// Keys are server-only — never VITE_-prefixed. Without GROQ_API_KEY, 'slm' is served by Gemini.

const MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
const SLM_MODEL = process.env.GROQ_MODEL || 'qwen/qwen3.8-27b';

// Thinking is off by default: thought tokens count against maxOutputTokens and starve the reply.
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

// Plain-text streaming. Errors before the first chunk return JSON with a status, like the buffered path.
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
