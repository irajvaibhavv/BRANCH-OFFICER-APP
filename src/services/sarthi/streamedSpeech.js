// Sentence-level TTS: prefetch every sentence at once and play the first as soon as its audio lands.
// voice.js is shared with SAARTHI AI, so this is built only on its prefetch + speak.
import { prefetch, speak, voiceProfile } from '../voice';

// A '.' between digits ("2.5 lakh") never ends a sentence.
const BOUNDARY = /(?<!\d)[.!?।]+(?=\s|$)|(?<=\d)[!?।]+(?=\s|$)/g;

// Shorter chunks are merged forward. Two chunks (first sentence, then the rest) start the voice early with one seam,
// and two parallel renders stay within ElevenLabs' concurrency limit.
const MIN_CHARS = 16;
const MAX_CHUNKS = 2;
// Below this a line is one render: each file has its own lead-in and tail silence, so a seam is heard as a pause. Only
// long lines are worth splitting. Tunable.
const SPLIT_ABOVE = 220;

// The browser Hindi voice pauses long at every "।" / ".", so mid-line full stops become commas (never between digits).
// The last one, every "?" and thinking pauses ("…") stay.
const softStops = (t) => t.replace(/\.{2,}/g, '…').replace(/[.।](?=\s+\S)/g, ',');

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

// The chunks speakStreamed asks the engine for — so a line can be rendered ahead with exactly the same cache keys.
function chunksOf(text, voice) {
  const whole = String(text ?? '').trim();
  if (!whole) return [];
  if (voiceProfile(voice).engine === 'browser') return [softStops(whole)];
  return whole.length <= SPLIT_ABOVE ? [whole] : splitSentences(whole);
}

/** Render a line before it is said (the greeting, while the setup screen is open). */
export const prefetchLine = (text, voice) => prefetch(chunksOf(text, voice), voice);

// `onEnd` fires exactly once. A pre-rendered `src` is one file and is never split.
export function speakStreamed(text, { voice, rate = 1, src, onEnd, onStart } = {}) {
  if (src) { speak(text, { voice, rate, src, onEnd, onStart }); return 1; }

  // Browser voices gain nothing from splitting: each utterance restarts the voice, adding a gap at every full stop.
  const chunks = chunksOf(text, voice);
  if (chunks.length === 0) { onStart?.(); onEnd?.(); return 0; }
  if (chunks.length === 1) { speak(chunks[0], { voice, rate, onEnd, onStart }); return 1; }

  prefetch(chunks, voice);

  // Chained through onEnd, not bulk-queued: voice.js clears its queue when an engine fails, which would drop the tail
  // and the final onEnd.
  const sayFrom = (i) => {
    const isLast = i === chunks.length - 1;
    speak(chunks[i], { voice, rate, onStart: i === 0 ? onStart : undefined, onEnd: isLast ? onEnd : () => sayFrom(i + 1) });
  };
  sayFrom(0);
  return chunks.length;
}
