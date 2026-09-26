// Claude backend shared by api/sarthi-*.js and scripts/sarthi-proxy.mjs (the _ prefix keeps Vercel from serving it).
// Set ANTHROPIC_API_KEY and it serves the 'llm' role; SARTHI_LLM=gemini forces Gemini back.

const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001';
const REPORT_MODEL = process.env.CLAUDE_REPORT_MODEL || 'claude-sonnet-5';

export const claudeOn = () => !!process.env.ANTHROPIC_API_KEY && process.env.SARTHI_LLM !== 'gemini';
export const claudeLabel = () => `${MODEL} (report ${REPORT_MODEL})`;

// Only the report asks for thinking; on Claude it gets the stronger model instead.
const modelFor = (thinkingBudget) => (thinkingBudget > 0 ? REPORT_MODEL : MODEL);

// The controller appends "## THIS TURN" last, so everything before it is identical across turns and cacheable.
function systemBlocks(systemPrompt) {
  if (!systemPrompt) return undefined;
  const cut = systemPrompt.lastIndexOf('\n## THIS TURN');
  const stable = cut > 0 ? systemPrompt.slice(0, cut) : systemPrompt;
  const blocks = [{ type: 'text', text: stable, cache_control: { type: 'ephemeral' } }];
  if (cut > 0) blocks.push({ type: 'text', text: systemPrompt.slice(cut) });
  return blocks;
}

// Claude needs user-first, strictly alternating turns; Gemini tolerated anything.
function alternate(messages) {
  const out = [];
  for (const m of messages) {
    const role = m.role === 'assistant' ? 'assistant' : 'user';
    const text = String(m.content ?? '');
    if (!text.trim()) continue;
    const last = out.at(-1);
    if (last?.role === role) last.content += `\n\n${text}`;
    else out.push({ role, content: text });
  }
  if (out[0]?.role !== 'user') out.unshift({ role: 'user', content: '(start)' });
  return out;
}

function request(body) {
  return fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });
}

// 529 "overloaded" becomes 503 so the client's existing retry set covers it.
async function fail(response) {
  const data = await response.json().catch(() => ({}));
  const err = new Error(data?.error?.message || `Claude ${response.status}`);
  err.status = response.status === 529 ? 503 : response.status;
  return err;
}

const chatBody = ({ systemPrompt, messages, temperature, maxTokens, thinkingBudget }) => ({
  model: modelFor(thinkingBudget),
  max_tokens: maxTokens,
  temperature: Math.min(temperature, 1),
  system: systemBlocks(systemPrompt),
  messages: alternate(messages),
});

export async function callClaude(opts) {
  const response = await request(chatBody(opts));
  if (!response.ok) throw await fail(response);
  const data = await response.json();
  const u = data.usage ?? {};
  console.log(`[claude] ${data.model} in ${u.input_tokens} (cached ${u.cache_read_input_tokens ?? 0}) out ${u.output_tokens}`);
  return (data.content ?? []).map((b) => (b.type === 'text' ? b.text : '')).join('');
}

// Writes plain text chunks to `write`; throws before the first chunk so the caller can still answer with JSON.
export async function streamClaude(opts, { start, write, end }) {
  const response = await request({ ...chatBody(opts), stream: true });
  if (!response.ok) throw await fail(response);
  start();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split('\n\n');
    buffer = frames.pop() ?? '';
    for (const frame of frames) {
      for (const line of frame.split('\n')) {
        if (!line.startsWith('data:')) continue;
        try {
          const json = JSON.parse(line.slice(5).trim());
          if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta') write(json.delta.text);
        } catch { /* ping or partial frame */ }
      }
    }
  }
  end();
}

export async function visionClaude({ image, prompt, maxTokens }) {
  const response = await request({
    model: MODEL,
    max_tokens: maxTokens,
    temperature: 0.3,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } },
        { type: 'text', text: prompt },
      ],
    }],
  });
  if (!response.ok) throw await fail(response);
  const data = await response.json();
  return (data.content ?? []).map((b) => (b.type === 'text' ? b.text : '')).join('');
}
