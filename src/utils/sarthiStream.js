/*
  SARTHI — sentence-level TTS streaming.

  The problem: Murf renders a whole line before a single word is audible. A 3-sentence question
  is ~1.5s of silence while the borrower watches a caption they have already read.

  The fix: split the line at sentence boundaries, fire every Murf request at once (voice.js
  caches by text, so `prefetch` warms them in parallel), and play the first sentence the moment
  ITS audio lands. A short opening sentence renders in ~0.8s instead of ~1.5s, and every later
  sentence finishes rendering long before the one in front of it stops playing — so the audio is
  continuous and only the FIRST wait is ever visible.

      whole line   |------- 1.5s -------|>>>>>>>>>>>>>>>>>>>>>>>>>|
      streamed     |-- 0.8s --|>>>>>>>>>|>>>>>>>>>|>>>>>>>>>>>>>>>|
                              ^ speaking starts here

  This does NOT need the model to stream. Agent 1's Devanagari lives in a ```speech``` fence that
  only exists once the reply is complete, so there is nothing to speak early anyway. The saving
  here is entirely in the TTS leg, which is where the silence actually was.

  Total characters sent to Murf are unchanged, so this costs no extra quota by volume — but it is
  2-3 API calls per turn instead of 1, which matters against a per-minute request limit.

  voice.js is shared with SAARTHI AI and is deliberately NOT modified: everything here is built
  from its existing `prefetch` + `speak` + per-text cache.
*/
import { prefetch, speak } from './voice';

/*
  Sentence ends: Devanagari danda, and the Latin terminators that Hinglish actually uses.
  A '.' only ends a sentence when it is NOT sitting between digits — "2.5 lakh" and "1.5 saal"
  are one sentence, and splitting them would both waste a call and read the number wrong.
*/
const BOUNDARY = /(?<!\d)[.!?।]+(?=\s|$)|(?<=\d)[!?।]+(?=\s|$)/g;

/*
  A chunk shorter than this is a fragment ("Acha ji."), not a sentence. Speaking it alone costs a
  whole Murf call for a moment of audio and clips oddly, so it is merged forward into the next one.
*/
const MIN_CHARS = 16;

/*
  Past the third chunk there is nothing left to gain: by then audio is playing continuously and
  every remaining fetch finishes far ahead of its slot, so more chunks buy only more API calls.
  Everything after the cap is merged into the final chunk.
*/
const MAX_CHUNKS = 3;

/**
 * Split a line into speakable chunks. Returns [] for empty input and a single-element array when
 * there is no usable boundary — callers can treat every result the same way.
 */
export function splitSentences(text, { minChars = MIN_CHARS, maxChunks = MAX_CHUNKS } = {}) {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return [];

  // Cut after each terminator, keeping the punctuation with the sentence it closes.
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

  // Merge fragments forward, so a stray "Acha." rides along with the sentence after it.
  const merged = [];
  let held = '';
  for (const piece of parts) {
    const next = held ? `${held} ${piece}` : piece;
    if (next.length < minChars) { held = next; continue; }
    merged.push(next);
    held = '';
  }
  // A trailing fragment has nothing to merge forward into, so it joins the previous chunk.
  if (held) {
    if (merged.length) merged[merged.length - 1] += ` ${held}`;
    else merged.push(held);
  }

  if (merged.length <= maxChunks) return merged;
  return [...merged.slice(0, maxChunks - 1), merged.slice(maxChunks - 1).join(' ')];
}

/**
 * Speak a line, streaming it sentence by sentence. `onEnd` fires exactly once, after the last
 * chunk — callers hang the next interview step off it, so firing early or not at all both break
 * the interview.
 *
 * `src` is a pre-rendered audio file from the voice manifest. It is one file for the whole line,
 * so it is played as-is: splitting it would mean discarding the very thing that makes scripted
 * mode instant.
 *
 * Returns a count of the chunks queued, which is only useful for logging and tests.
 */
export function speakStreamed(text, { voice, rate = 1, src, onEnd } = {}) {
  if (src) { speak(text, { voice, rate, src, onEnd }); return 1; }

  const chunks = splitSentences(text);
  if (chunks.length === 0) { onEnd?.(); return 0; }
  if (chunks.length === 1) { speak(chunks[0], { voice, rate, onEnd }); return 1; }

  // Start every render now. voice.js caches by text, so by the time each chunk is spoken its
  // audio is already in hand — this is what removes the gaps between sentences.
  prefetch(chunks, voice);

  /*
    Chain each chunk off the previous one's onEnd rather than pushing them all into voice.js's
    queue at once. That queue is cleared wholesale when a TTS engine fails, which would drop
    every chunk after the failing one AND lose the final onEnd — leaving the avatar stuck on
    "speaking" and the interview waiting for a callback that never comes. Chaining survives it:
    voice.js falls back to browser TTS for the failing chunk and still fires ITS onEnd, so the
    chain walks on to the end and the real onEnd always runs.

    A deliberate stop (stopSpeaking) does NOT fire onEnd, so the chain simply stops there — which
    is what ending a call should do.
  */
  const sayFrom = (i) => {
    const isLast = i === chunks.length - 1;
    speak(chunks[i], { voice, rate, onEnd: isLast ? onEnd : () => sayFrom(i + 1) });
  };
  sayFrom(0);
  return chunks.length;
}
