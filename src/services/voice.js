// TTS: ElevenLabs → Murf → browser (VITE_TTS_ENGINE forces one). STT: browser only.
// Keys: VITE_ELEVENLABS_API_KEY / VITE_MURF_API_KEY (+ optional _VOICE). They ship in the bundle — prototype only.
const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
const SR = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

const ENV = import.meta.env;
const ELEVEN_KEY = ENV.VITE_ELEVENLABS_API_KEY;
const ELEVEN_VOICE = ENV.VITE_ELEVENLABS_VOICE || 'EXAVITQu4vr4xnSDxMaL'; // Sarah — calm, reassuring
const SPEED = Number(ENV.VITE_TTS_SPEED) || 0.85; // ElevenLabs 0.7–1.2; Murf −50…50 derived below
const MURF_KEY = ENV.VITE_MURF_API_KEY;
const MURF_VOICE = ENV.VITE_MURF_VOICE || 'en-IN-arohi';
const MURF_URL = 'https://api.murf.ai/v1/speech/generate';

const forced = ENV.VITE_TTS_ENGINE;
// The wanted engine if its key exists, else whichever cloud engine has one — browser TTS is the last resort.
const pickEngine = (want) => (want === 'browser' ? 'browser'
  : want === 'murf' && MURF_KEY ? 'murf'
  : ELEVEN_KEY ? 'elevenlabs'
  : MURF_KEY ? 'murf'
  : 'browser');
const engine = pickEngine(forced);
const CLOUD = engine !== 'browser';

export const canSpeak = CLOUD || !!synth;
export const canListen = !!SR;
export const ttsEngine = CLOUD ? engine : synth ? 'browser' : 'none';

// Per-call voice profile; callers passing nothing get the .env default.
// voiceId may be a map per engine, since a fallback engine cannot use the other's voice ids.
export function voiceProfile({ engine: want, voiceId, style, speed, model, lang } = {}) {
  const engine = pickEngine(want ?? forced);
  return {
    engine,
    voiceId: (voiceId && typeof voiceId === 'object' ? voiceId[engine] : voiceId) ?? null,
    style: style ?? null,
    speed: Number(speed) || SPEED,
    model: model ?? null,
    lang: lang ?? null,
  };
}
const DEFAULT_PROFILE = voiceProfile();

const clean = (text) => text.replace(/₹/g, 'rupees ').replace(/[*_`]/g, '');

/* ---------- Cloud TTS: fetch → cache → play, one line at a time ---------- */
const cache = new Map();          // profile+text → Promise<audio url>
const brokenEngines = new Set();  // an engine that failed (bad key, quota, offline) is skipped for the session

function fetchMurf(text, p) {
  const body = { text, voiceId: p.voiceId || MURF_VOICE, rate: Math.round((p.speed - 1) * 100), format: 'MP3', sampleRate: 24000, modelVersion: 'GEN2', channelType: 'MONO' };
  // Murf reads in a flat narration voice unless a style is asked for; unsupported styles are ignored.
  if (p.style) body.style = p.style;
  return fetch(MURF_URL, {
    method: 'POST',
    headers: { 'api-key': MURF_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Murf ${r.status}`))))
    .then((j) => j.audioFile || Promise.reject(new Error('Murf: no audioFile')));
}

function fetchEleven(text, p) {
  return fetch(`https://api.elevenlabs.io/v1/text-to-speech/${p.voiceId || ELEVEN_VOICE}?output_format=mp3_22050_32`, {
    method: 'POST',
    headers: { 'xi-api-key': ELEVEN_KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({
      text,
      model_id: p.model || ENV.VITE_ELEVENLABS_MODEL || 'eleven_multilingual_v2',
      ...(p.lang && { language_code: p.lang }),
      voice_settings: { stability: 0.6, similarity_boost: 0.8, style: 0.1, speed: p.speed },
    }),
  })
    .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(`ElevenLabs ${r.status}`))))
    .then((b) => URL.createObjectURL(b));
}

function audioUrl(text, p) {
  const clean_ = clean(text);
  const key = `${p.engine}|${p.voiceId}|${p.style}|${p.speed}|${p.model}|${clean_}`;
  if (!cache.has(key)) {
    const req = p.engine === 'elevenlabs' ? fetchEleven(clean_, p) : fetchMurf(clean_, p);
    cache.set(key, req.catch((e) => { cache.delete(key); throw e; }));
  }
  return cache.get(key);
}

/** Warm the cache for lines that are about to be spoken, so there is no gap between bubbles. */
export function prefetch(texts = [], voice) {
  const p = voice ? voiceProfile(voice) : DEFAULT_PROFILE;
  if (p.engine === 'browser' || brokenEngines.has(p.engine)) return;
  texts.forEach((t) => audioUrl(t, p).catch(() => {}));
}

const queue = [];
let current = null; // { audio, gen }
let playing = false;
let gen = 0;        // bumped by stopSpeaking() so stale fetches never play
let silent = false;

// Mute by volume, not by skipping lines: onStart/onEnd still fire, so callers waiting on them carry on.
export function setSilent(on) {
  silent = on;
  if (current?.audio) current.audio.volume = on ? 0 : 1;
}

async function drain() {
  if (playing) return;
  const item = queue.shift();
  if (!item) return;
  playing = true;
  const myGen = gen;
  const finish = () => { playing = false; current = null; item.onEnd?.(); drain(); };
  try {
    const url = item.src ?? await audioUrl(item.text, item.profile);
    if (myGen !== gen) { playing = false; return; } // stopped while fetching
    const audio = new Audio(url);
    audio.playbackRate = item.rate;
    audio.volume = silent ? 0 : 1;
    current = { audio };
    audio.onended = finish;
    audio.onerror = finish;
    audio.onplaying = () => { item.onStart?.(); item.onStart = null; };
    await audio.play();
  } catch (e) {
    console.warn(`[voice] ${item.profile.engine} unavailable, falling back to browser TTS`, e);
    brokenEngines.add(item.profile.engine); // only this engine is written off, not the other one
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

function browserSpeak(text, { rate = 1, onEnd, onStart } = {}) {
  if (!synth) { onStart?.(); onEnd?.(); return; }
  voice = voice || pickVoice();
  const u = new SpeechSynthesisUtterance(clean(text));
  if (voice) u.voice = voice;
  u.lang = voice?.lang || 'en-IN';
  u.rate = rate; u.pitch = 1; u.volume = silent ? 0 : 1;
  u.onstart = () => onStart?.();
  u.onend = () => onEnd?.();
  u.onerror = () => onEnd?.();
  synth.speak(u);
}

/**
 * Speak a line; lines queue and play in order. onEnd fires when done (or immediately if unsupported).
 * `voice` overrides engine/voiceId/style/speed for this line only — pass nothing for the app default.
 * `src` plays a pre-rendered audio file instead of calling a TTS API: no quota, no network, no lag.
 * `onStart` fires once, when sound actually begins (after any TTS render wait).
 */
export function speak(text, { rate = 1, onEnd, onStart, voice, src } = {}) {
  const profile = voice ? voiceProfile(voice) : DEFAULT_PROFILE;
  if (src) { queue.push({ text, rate, onEnd, onStart, profile, src }); drain(); return; }
  if (profile.engine !== 'browser' && !brokenEngines.has(profile.engine)) {
    queue.push({ text, rate, onEnd, onStart, profile });
    drain();
    return;
  }
  browserSpeak(text, { rate, onEnd, onStart });
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
export function listen({ onInterim, onFinal, onError, onEnd, lang = 'en-IN', endAfterMs = 0 }) {
  if (!SR) { onError?.('unsupported'); return () => {}; }
  const r = new SR();
  r.lang = lang; r.interimResults = true; r.continuous = false; r.maxAlternatives = 1;
  let final = '';
  let heard = '';
  let quiet = null;
  let quietEnded = false;
  r.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) final += t; else interim += t;
    }
    heard = (final + interim).trim();
    onInterim?.(heard);
    // The browser's own end-of-speech wait is ~2s on phones; endAfterMs closes the turn sooner.
    if (endAfterMs && heard) {
      clearTimeout(quiet);
      quiet = setTimeout(() => { quietEnded = true; try { r.stop(); } catch { /* ignore */ } }, endAfterMs);
    }
  };
  r.onerror = (e) => onError?.(e.error);
  // The silence stop can land before the last words are marked final; keep what was on screen.
  r.onend = () => { clearTimeout(quiet); const text = final.trim() || (quietEnded ? heard : ''); if (text) onFinal?.(text); onEnd?.(); };
  try { r.start(); } catch (e) { onError?.(String(e)); }
  return () => { clearTimeout(quiet); try { r.stop(); } catch { /* ignore */ } };
}
