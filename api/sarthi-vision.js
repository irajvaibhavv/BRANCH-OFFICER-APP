// Vercel serverless function — Sarthi's vision endpoint.
// Takes one base64 JPEG frame from the interview and returns a short, factual observation.
// Observations are advisory context for the officer, never shown to the borrower.

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
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY is not set on the server' });

  const { image, prompt } = req.body ?? {};
  if (!image) return res.status(400).json({ error: 'No image supplied' });

  try {
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
            // Mandatory here, not an optimisation: thought tokens count against maxOutputTokens,
            // and a thinking model given a 100-token ceiling spends the lot thinking and returns
            // an empty string. Every observation would silently come back blank.
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
    return res.status(500).json({ error: e.message });
  }
}
