/*
  Local dev proxy for Sarthi (the Vercel functions in api/ do the same job in production).

  Run it beside the app:
      PowerShell   $env:GEMINI_API_KEY="your_key"; npm run sarthi
      bash         export GEMINI_API_KEY=your_key && npm run sarthi

  vite.config.js forwards /api/sarthi-* here, so the app needs no extra configuration.
  If this is not running, the interview screen falls back to scripted demo mode.
*/
import http from 'http';

const PORT = 3001;
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const KEY = process.env.GEMINI_API_KEY;

const VISION_PROMPT = `You are analyzing a frame from a loan interview video call.
The person on camera is a loan applicant.
Briefly note (in 1-2 sentences) ONLY if you observe something relevant:
- Does the background look like a shop, office, home, or outdoor?
- Are there any business-related items visible (stock, equipment, signboard)?
- Is there more than one person in frame?
- Does anything look inconsistent with what a business owner's setting should look like?

If nothing notable, respond with just "nothing_notable".
Do NOT describe the person's appearance, clothing, or make any judgment about their character.`;

const gemini = (body) =>
  fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(async (r) => {
    const data = await r.json();
    if (!r.ok) throw new Error(data?.error?.message || `Gemini ${r.status}`);
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  });

http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }
  if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }

  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', async () => {
    const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
    if (!KEY) return send(500, { error: 'GEMINI_API_KEY is not set in this terminal' });

    try {
      const payload = JSON.parse(body || '{}');

      if (req.url.includes('vision')) {
        if (!payload.image) return send(400, { error: 'No image supplied' });
        const text = await gemini({
          contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'image/jpeg', data: payload.image } }, { text: payload.prompt || VISION_PROMPT }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: payload.prompt ? 200 : 100 },
        });
        return send(200, { observation: text.includes('nothing_notable') ? null : text });
      }

      const { messages = [], systemPrompt = '', temperature = 0.5, maxTokens = 1024 } = payload;
      const text = await gemini({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
        generationConfig: { temperature, maxOutputTokens: maxTokens },
      });
      return send(200, { reply: text });
    } catch (e) {
      return send(500, { error: e.message });
    }
  });
}).listen(PORT, () => {
  console.log(`Sarthi proxy on http://localhost:${PORT} · model ${MODEL} · key ${KEY ? 'set' : 'MISSING — set GEMINI_API_KEY'}`);
});
