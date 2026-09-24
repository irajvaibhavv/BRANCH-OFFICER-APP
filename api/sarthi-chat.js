// Vercel serverless function — Sarthi's chat endpoint (Agent 1 and Agent 2).
// Runs on the server. GEMINI_API_KEY is set in the Vercel dashboard and must NEVER carry a
// VITE_ prefix: Vite inlines VITE_* into the client bundle, which would publish the key.

const MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';

/*
  Gemini 3 thinks before it answers, and those thought tokens are charged against
  maxOutputTokens. Left alone, a 1024-token interview turn spent ~730 of them thinking and
  returned barely 80 tokens of answer — one long reply away from being truncated mid-```speech```
  fence, which would break caption/TTS parsing. It also costs seconds of dead air while the
  borrower waits. So thinking is OFF by default and callers opt back in: the interviewer wants
  speed, the report writer (which passes a budget) wants the reasoning.
*/
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY is not set on the server' });

  const { messages = [], systemPrompt = '', temperature = 0.5, maxTokens = 1024, thinkingBudget = 0 } = req.body ?? {};

  try {
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
    if (!response.ok) return res.status(response.status).json({ error: data?.error?.message || `Gemini ${response.status}` });

    // Join every part: a thinking model can split its answer across parts, and taking only
    // parts[0] silently truncates the reply (or returns '' when part 0 holds no text).
    const text = (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text || '').join('');
    return res.json({ reply: text });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
