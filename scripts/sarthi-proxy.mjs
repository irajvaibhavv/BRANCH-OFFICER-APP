// Local dev stand-in for api/ (npm run sarthi, port 3001; vite proxies /api/sarthi-*).
// GEMINI_API_KEY required, GROQ_API_KEY optional — neither may carry a VITE_ prefix.
import http from 'http';

const PORT = 3001;
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
const KEY = process.env.GEMINI_API_KEY;
const SLM_MODEL = process.env.GROQ_MODEL || 'qwen/qwen3.8-27b';
const GROQ_KEY = process.env.GROQ_API_KEY;

const VISION_PROMPT = `You are analyzing a frame from a loan interview video call.
The person on camera is a loan applicant.
Briefly note (in 1-2 sentences) ONLY if you observe something relevant:
- Does the background look like a shop, office, home, or outdoor?
- Are there any business-related items visible (stock, equipment, signboard)?
- Is there more than one person in frame?
- Does anything look inconsistent with what a business owner's setting should look like?

If nothing notable, respond with just "nothing_notable".
Do NOT describe the person's appearance, clothing, or make any judgment about their character.`;

// Groq speaks the OpenAI chat format: the system prompt is a message, not a separate field.
const groq = ({ systemPrompt, messages, temperature, maxTokens }) =>
  fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_KEY}` },
    body: JSON.stringify({
      model: SLM_MODEL,
      messages: [
        ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
        ...messages.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
      ],
      temperature,
      max_tokens: maxTokens,
    }),
  }).then(async (r) => {
    const data = await r.json();
    if (!r.ok) throw new Error(data?.error?.message || `Groq ${r.status}`);
    return data.choices?.[0]?.message?.content || '';
  });

const gemini = (body) =>
  fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(async (r) => {
    const data = await r.json();
    if (!r.ok) throw new Error(data?.error?.message || `Gemini ${r.status}`);
    // Join all parts: a thinking model may split its answer, and parts[0] can hold no text.
    return (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text || '').join('');
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
    const wantsSlm = req.url.includes('chat') && (() => { try { return JSON.parse(body || '{}').provider === 'slm'; } catch { return false; } })();
    if (!KEY && !(wantsSlm && GROQ_KEY)) return send(500, { error: 'GEMINI_API_KEY is not set in this terminal' });

    try {
      const payload = JSON.parse(body || '{}');

      if (req.url.includes('vision')) {
        if (!payload.image) return send(400, { error: 'No image supplied' });
        const text = await gemini({
          contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'image/jpeg', data: payload.image } }, { text: payload.prompt || VISION_PROMPT }] }],
          // thinkingBudget 0 is mandatory: thought tokens count against maxOutputTokens, so a
          // thinking model given 100 tokens spends them all thinking and returns nothing.
          generationConfig: { temperature: 0.3, maxOutputTokens: payload.prompt ? 200 : 100, thinkingConfig: { thinkingBudget: 0 } },
        });
        return send(200, { observation: text.includes('nothing_notable') ? null : text });
      }

      const { messages = [], systemPrompt = '', temperature = 0.5, maxTokens = 1024, thinkingBudget = 0, provider = 'llm', stream = false } = payload;

      // The client routes every task (services/sarthi/model.js); never re-route a failed call.
      // With no GROQ_API_KEY, 'slm' is simply served by Gemini — configuration, not fallback.
      if (provider === 'slm' && GROQ_KEY) {
        const text = await groq({ systemPrompt, messages, temperature, maxTokens });
        return send(200, { reply: text, served: 'slm' });
      }

      // Streaming: same wire format as api/sarthi-chat.js on Vercel — plain text chunks, so the
      // caption types out and the ```speech``` block can reach the voice before the reply ends.
      if (stream) {
        const upstream = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:streamGenerateContent?alt=sse&key=${KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              system_instruction: { parts: [{ text: systemPrompt }] },
              contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
              generationConfig: { temperature, maxOutputTokens: maxTokens, thinkingConfig: { thinkingBudget } },
            }),
          },
        );
        if (!upstream.ok) {
          const data = await upstream.json().catch(() => ({}));
          return send(upstream.status, { error: data?.error?.message || `Gemini ${upstream.status}` });
        }
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache, no-transform' });
        const reader = upstream.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const frames = buf.split('\n\n');
          buf = frames.pop() ?? '';
          for (const frame of frames) {
            for (const line of frame.split('\n')) {
              if (!line.startsWith('data:')) continue;
              try {
                const json = JSON.parse(line.slice(5).trim());
                const t = (json.candidates?.[0]?.content?.parts ?? []).map((pt) => pt.text || '').join('');
                if (t) res.write(t);
              } catch { /* keep-alive or partial frame */ }
            }
          }
        }
        return res.end();
      }

      const text = await gemini({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
        generationConfig: { temperature, maxOutputTokens: maxTokens, thinkingConfig: { thinkingBudget } },
      });
      return send(200, { reply: text, served: 'llm' });
    } catch (e) {
      return send(500, { error: e.message });
    }
  });
}).listen(PORT, () => {
  console.log(`Sarthi proxy on http://localhost:${PORT}`);
  console.log(`  LLM  ${MODEL} · key ${KEY ? 'set' : 'MISSING — set GEMINI_API_KEY'}`);
  console.log(`  SLM  ${SLM_MODEL} · key ${GROQ_KEY ? 'set' : 'not set — fast tasks will use the LLM'}`);
});
