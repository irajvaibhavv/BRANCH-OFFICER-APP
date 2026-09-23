// Vercel serverless function — Sarthi's chat endpoint (Agent 1 and Agent 2).
// Runs on the server. GEMINI_API_KEY is set in the Vercel dashboard and must NEVER carry a
// VITE_ prefix: Vite inlines VITE_* into the client bundle, which would publish the key.

const MODEL = 'gemini-2.5-flash';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY is not set on the server' });

  const { messages = [], systemPrompt = '', temperature = 0.5, maxTokens = 1024 } = req.body ?? {};

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
          generationConfig: { temperature, maxOutputTokens: maxTokens },
        }),
      },
    );

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data?.error?.message || `Gemini ${response.status}` });

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return res.json({ reply: text });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
