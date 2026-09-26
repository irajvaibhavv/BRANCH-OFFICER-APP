// Sarthi vision endpoint (Vercel): one JPEG frame in, a short factual observation out.
import { claudeOn, visionClaude } from './_claude.js';

const MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';

export const VISION_PROMPT = `You are analyzing a frame from a loan interview video call.
The person on camera is a loan applicant.
Briefly note (in 1-2 sentences) ONLY if you observe something relevant:
- Does the background look like a shop, office, home, or outdoor?
- Are there any business-related items visible (stock, equipment, signboard)?
- Is there more than one person in frame?
- Does anything look inconsistent with what a business owner's setting should look like?

If nothing notable, respond with just "nothing_notable".
Do NOT describe the person's appearance, clothing, or make any judgment about their character.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!claudeOn() && !process.env.GEMINI_API_KEY) return res.status(500).json({ error: 'Neither ANTHROPIC_API_KEY nor GEMINI_API_KEY is set on the server' });

  const { image, prompt } = req.body ?? {};
  if (!image) return res.status(400).json({ error: 'No image supplied' });

  try {
    if (claudeOn()) {
      const text = await visionClaude({ image, prompt: prompt || VISION_PROMPT, maxTokens: prompt ? 200 : 100 });
      return res.json({ observation: text.includes('nothing_notable') ? null : text });
    }
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [
              { inlineData: { mimeType: 'image/jpeg', data: image } },
              { text: prompt || VISION_PROMPT },
            ],
          }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: prompt ? 200 : 100,
            // Required: with thinking on, a 100-token ceiling returns an empty string.
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      },
    );

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data?.error?.message || `Gemini ${response.status}` });

    const text = (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text || '').join('');
    return res.json({ observation: text.includes('nothing_notable') ? null : text });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  }
}
