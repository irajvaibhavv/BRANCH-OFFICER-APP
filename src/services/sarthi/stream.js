// Sentence-level TTS: prefetch every sentence at once and play the first as soon as its audio lands.
// voice.js is shared with SAARTHI AI, so this is built only from its prefetch + speak.
import { prefetch, speak, voiceProfile } from '../voice';

// A '.' between digits ("2.5 lakh") never ends a sentence.
const BOUNDARY = /(?<!\d)[.!?।]+(?=\s|$)|(?<=\d)[!?।]+(?=\s|$)/g;

// Shorter chunks are merged forward. Two chunks — the first sentence, then the rest — start the voice as early as three
// did, with one seam instead of two, and two parallel renders fit ElevenLabs' concurrency limit; a third request was
// sometimes refused (429), re-fetched when its turn came, and heard as a long pause after a full stop.
const MIN_CHARS = 16;
const MAX_CHUNKS = 2;

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
export function speakStreamed(text, { voice, rate = 1, src, onEnd, onStart } = {}) {
  if (src) { speak(text, { voice, rate, src, onEnd, onStart }); return 1; }

  // Browser voices gain nothing from splitting — each utterance restarts the voice (Chrome's Hindi voice is a network
  // voice), which was a ~1s gap at every full stop. One utterance, no seams.
  const chunks = voiceProfile(voice).engine === 'browser' ? [String(text ?? '').trim()].filter(Boolean) : splitSentences(text);
  if (chunks.length === 0) { onStart?.(); onEnd?.(); return 0; }
  if (chunks.length === 1) { speak(chunks[0], { voice, rate, onEnd, onStart }); return 1; }

  prefetch(chunks, voice);

  // Chained through onEnd, not bulk-queued: voice.js clears its queue when an engine fails,
  // which would drop the tail and the final onEnd with it.
  const sayFrom = (i) => {
    const isLast = i === chunks.length - 1;
    speak(chunks[i], { voice, rate, onStart: i === 0 ? onStart : undefined, onEnd: isLast ? onEnd : () => sayFrom(i + 1) });
  };
  sayFrom(0);
  return chunks.length;
}
