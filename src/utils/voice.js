/*
  Voice I/O for SAARTHI AI.
  Text-to-speech: ElevenLabs when VITE_ELEVENLABS_API_KEY is set, else Murf AI when VITE_MURF_API_KEY
  is set, else the browser's Web Speech API (VITE_TTS_ENGINE=elevenlabs|murf|browser forces one). Speech-to-text: browser Web Speech API. Everything still appears as
  text, so it works (typed) where the browser has no speech support or the network is down.

  Setup: create .env.local with any of
    VITE_ELEVENLABS_API_KEY=…           # elevenlabs.io → Settings → API keys
    VITE_ELEVENLABS_VOICE=EXAVITQu4vr4xnSDxMaL   # optional voice id (free plan: built-in voices only)
    VITE_MURF_API_KEY=…                 # murf.ai → API → keys
    VITE_MURF_VOICE=en-IN-arohi         # optional; any Murf voiceId (en-IN-aarav, en-IN-priya, hi-IN-ayushi …)
  Prototype note: the key ships in the bundle. Production must proxy through a server that holds it.
*/
const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
const SR = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

const ENV = import.meta.env;
const ELEVEN_KEY = ENV.VITE_ELEVENLABS_API_KEY;
const ELEVEN_VOICE = ENV.VITE_ELEVENLABS_VOICE || 'EXAVITQu4vr4xnSDxMaL'; // Sarah — calm, reassuring
const MURF_KEY = ENV.VITE_MURF_API_KEY;
const MURF_VOICE = ENV.VITE_MURF_VOICE || 'en-IN-arohi';
const MURF_URL = 'https://api.murf.ai/v1/speech/generate';

const forced = ENV.VITE_TTS_ENGINE;
const engine = forced === 'browser' ? 'browser'
  : (forced === 'elevenlabs' || !forced) && ELEVEN_KEY ? 'elevenlabs'
  : (forced === 'murf' || !forced) && MURF_KEY ? 'murf'
  : 'browser';
const CLOUD = engine !== 'browser';

export const canSpeak = CLOUD || !!synth;
export const canListen = !!SR;
export const ttsEngine = CLOUD ? engine : synth ? 'browser' : 'none';

const clean = (text) => text.replace(/₹/g, 'rupees ').replace(/[*_`]/g, '');

/* ---------- Cloud TTS: fetch → cache → play, one line at a time ---------- */
const cache = new Map(); // text → Promise<audio url>
let cloudBroken = false;  // after a failure (bad key, quota, offline) stay on browser TTS for the session

function fetchMurf(text) {
  return fetch(MURF_URL, {
    method: 'POST',
    headers: { 'api-key': MURF_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ text, voiceId: MURF_VOICE, format: 'MP3', sampleRate: 24000, modelVersion: 'GEN2', channelType: 'MONO' }),
  })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Murf ${r.status}`))))
    .then((j) => j.audioFile || Promise.reject(new Error('Murf: no audioFile')));
}

function fetchEleven(text) {
  return fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVEN_VOICE}?output_format=mp3_22050_32`, {
    method: 'POST',
    headers: { 'xi-api-key': ELEVEN_KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.2 } }),
  })
    .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(`ElevenLabs ${r.status}`))))
    .then((b) => URL.createObjectURL(b));
}

function audioUrl(text) {
  const key = clean(text);
  if (!cache.has(key)) {
    cache.set(key, (engine === 'elevenlabs' ? fetchEleven(key) : fetchMurf(key)).catch((e) => { cache.delete(key); throw e; }));
  }
  return cache.get(key);
}

/** Warm the cache for lines that are about to be spoken, so there is no gap between bubbles. */
export function prefetch(texts = []) {
  if (!CLOUD || cloudBroken) return;
  texts.forEach((t) => audioUrl(t).catch(() => {}));
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
    const url = await audioUrl(item.text);
    if (myGen !== gen) { playing = false; return; } // stopped while fetching
    const audio = new Audio(url);
    audio.playbackRate = item.rate;
    current = { audio };
    audio.onended = finish;
    audio.onerror = finish;
    await audio.play();
  } catch (e) {
    console.warn(`[voice] ${engine} unavailable, falling back to browser TTS`, e);
    cloudBroken = true;
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
  if (CLOUD && !cloudBroken) { queue.push({ text, rate, onEnd }); drain(); return; }
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
