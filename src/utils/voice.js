/*
  Voice I/O for SAARTHI AI.
  Text-to-speech: Murf AI (natural Indian-English voices) when VITE_MURF_API_KEY is set, otherwise
  the browser's Web Speech API. Speech-to-text: browser Web Speech API. Everything still appears as
  text, so it works (typed) where the browser has no speech support or the network is down.

  Murf setup: create .env.local with
    VITE_MURF_API_KEY=your_key          # murf.ai → API → keys
    VITE_MURF_VOICE=en-IN-arohi         # optional; any Murf voiceId (en-IN-aarav, en-IN-priya, hi-IN-ayushi …)
  Prototype note: the key ships in the bundle. Production must proxy through a server that holds it.
*/
const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
const SR = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

const MURF_KEY = import.meta.env.VITE_MURF_API_KEY;
const MURF_VOICE = import.meta.env.VITE_MURF_VOICE || 'en-IN-arohi';
const MURF_URL = 'https://api.murf.ai/v1/speech/generate';

export const canSpeak = !!MURF_KEY || !!synth;
export const canListen = !!SR;
export const ttsEngine = MURF_KEY ? 'murf' : synth ? 'browser' : 'none';

const clean = (text) => text.replace(/₹/g, 'rupees ').replace(/[*_`]/g, '');

/* ---------- Murf: fetch → cache → play, one line at a time ---------- */
const cache = new Map(); // text → Promise<audio url>
let murfBroken = false;   // after a failure (bad key, CORS, offline) stay on browser TTS for the session

function murfUrl(text) {
  const key = clean(text);
  if (!cache.has(key)) {
    cache.set(key, fetch(MURF_URL, {
      method: 'POST',
      headers: { 'api-key': MURF_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ text: key, voiceId: MURF_VOICE, format: 'MP3', sampleRate: 24000, modelVersion: 'GEN2', channelType: 'MONO' }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Murf ${r.status}`))))
      .then((j) => j.audioFile || Promise.reject(new Error('Murf: no audioFile')))
      .catch((e) => { cache.delete(key); throw e; }));
  }
  return cache.get(key);
}

/** Warm the cache for lines that are about to be spoken, so there is no gap between bubbles. */
export function prefetch(texts = []) {
  if (!MURF_KEY || murfBroken) return;
  texts.forEach((t) => murfUrl(t).catch(() => {}));
}

const queue = [];
let current = null; // { audio, gen }
let playing = false;
let gen = 0;        // bumped by stopSpeaking() so stale fetches never play

async function drain() {
  if (playing) return;
  const item = queue.shift();
  if (!item) return;
  playing = true;
  const myGen = gen;
  const finish = () => { playing = false; current = null; item.onEnd?.(); drain(); };
  try {
    const url = await murfUrl(item.text);
    if (myGen !== gen) { playing = false; return; } // stopped while fetching
    const audio = new Audio(url);
    audio.playbackRate = item.rate;
    current = { audio };
    audio.onended = finish;
    audio.onerror = finish;
    await audio.play();
  } catch (e) {
    console.warn('[voice] Murf unavailable, falling back to browser TTS', e);
    murfBroken = true;
    playing = false; current = null;
    queue.length = 0;
    browserSpeak(item.text, item);
  }
}

/* ---------- Browser fallback ---------- */
let voice = null;
function pickVoice() {
  if (!synth) return null;
  const vs = synth.getVoices();
  return vs.find((v) => v.lang === 'en-IN') || vs.find((v) => v.lang?.startsWith('en-IN')) || vs.find((v) => v.lang === 'hi-IN') || vs.find((v) => v.lang?.startsWith('en')) || vs[0] || null;
}
synth?.addEventListener?.('voiceschanged', () => { voice = pickVoice(); });

function browserSpeak(text, { rate = 1, onEnd } = {}) {
  if (!synth) { onEnd?.(); return; }
  voice = voice || pickVoice();
  const u = new SpeechSynthesisUtterance(clean(text));
  if (voice) u.voice = voice;
  u.lang = voice?.lang || 'en-IN';
  u.rate = rate; u.pitch = 1;
  u.onend = () => onEnd?.();
  u.onerror = () => onEnd?.();
  synth.speak(u);
}

/** Speak a line; lines queue and play in order. onEnd fires when done (or immediately if unsupported). */
export function speak(text, { rate = 1, onEnd } = {}) {
  if (MURF_KEY && !murfBroken) { queue.push({ text, rate, onEnd }); drain(); return; }
  browserSpeak(text, { rate, onEnd });
}

export function stopSpeaking() {
  gen++;
  queue.length = 0;
  if (current?.audio) { current.audio.onended = null; current.audio.onerror = null; current.audio.pause(); current.audio.src = ''; }
  current = null; playing = false;
  synth?.cancel();
}

/**
 * Listen once. onInterim(text) streams partial words, onFinal(text) fires with the sentence.
 * Returns a stop() function.
 */
export function listen({ onInterim, onFinal, onError, onEnd, lang = 'en-IN' }) {
  if (!SR) { onError?.('unsupported'); return () => {}; }
  const r = new SR();
  r.lang = lang; r.interimResults = true; r.continuous = false; r.maxAlternatives = 1;
  let final = '';
  r.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) final += t; else interim += t;
    }
    onInterim?.((final + interim).trim());
  };
  r.onerror = (e) => onError?.(e.error);
  r.onend = () => { if (final.trim()) onFinal?.(final.trim()); onEnd?.(); };
  try { r.start(); } catch (e) { onError?.(String(e)); }
  return () => { try { r.stop(); } catch { /* ignore */ } };
}
