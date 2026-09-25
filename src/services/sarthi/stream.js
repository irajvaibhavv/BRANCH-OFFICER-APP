// Sentence-level TTS: prefetch every sentence at once and play the first as soon as its audio lands.
// voice.js is shared with SAARTHI AI, so this is built only from its prefetch + speak.
import { prefetch, speak } from '../voice';

// A '.' between digits ("2.5 lakh") never ends a sentence.
const BOUNDARY = /(?<!\d)[.!?।]+(?=\s|$)|(?<=\d)[!?।]+(?=\s|$)/g;

// Shorter chunks are merged forward; past MAX_CHUNKS more calls buy nothing.
const MIN_CHARS = 16;
const MAX_CHUNKS = 3;

export function splitSentences(text, { minChars = MIN_CHARS, maxChunks = MAX_CHUNKS } = {}) {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return [];

  const parts = [];
  let last = 0;
  for (const m of trimmed.matchAll(BOUNDARY)) {
    const end = m.index + m[0].length;
    const piece = trimmed.slice(last, end).trim();
    if (piece) parts.push(piece);
    last = end;
  }
  const tail = trimmed.slice(last).trim();
  if (tail) parts.push(tail);
  if (parts.length <= 1) return [trimmed];

  const merged = [];
  let held = '';
  for (const piece of parts) {
    const next = held ? `${held} ${piece}` : piece;
    if (next.length < minChars) { held = next; continue; }
    merged.push(next);
    held = '';
  }
  if (held) {
    if (merged.length) merged[merged.length - 1] += ` ${held}`;
    else merged.push(held);
  }

  if (merged.length <= maxChunks) return merged;
  return [...merged.slice(0, maxChunks - 1), merged.slice(maxChunks - 1).join(' ')];
}

// `onEnd` fires exactly once. A pre-rendered `src` is one file and is never split.
export function speakStreamed(text, { voice, rate = 1, src, onEnd } = {}) {
  if (src) { speak(text, { voice, rate, src, onEnd }); return 1; }

  const chunks = splitSentences(text);
  if (chunks.length === 0) { onEnd?.(); return 0; }
  if (chunks.length === 1) { speak(chunks[0], { voice, rate, onEnd }); return 1; }

  prefetch(chunks, voice);

  // Chained through onEnd, not bulk-queued: voice.js clears its queue when an engine fails,
  // which would drop the tail and the final onEnd with it.
  const sayFrom = (i) => {
    const isLast = i === chunks.length - 1;
    speak(chunks[i], { voice, rate, onEnd: isLast ? onEnd : () => sayFrom(i + 1) });
  };
  sayFrom(0);
  return chunks.length;
}
