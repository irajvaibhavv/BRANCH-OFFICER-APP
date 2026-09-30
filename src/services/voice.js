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
// Only a refused key or a spent quota writes an engine off; a blip or a blocked autoplay is not the engine's fault.
const brokenEngines = new Set();
const usable = (e) => (e === 'murf' ? !!MURF_KEY : !!ELEVEN_KEY) && !brokenEngines.has(e);
// The wanted engine if it is usable, else the other cloud engine — browser TTS is the last resort.
const pickEngine = (want) => (want === 'browser' ? 'browser'
  : want === 'murf' && usable('murf') ? 'murf'
  : usable('elevenlabs') ? 'elevenlabs'
  : usable('murf') ? 'murf'
  : 'browser');
const engine = pickEngine(forced);
const CLOUD = engine !== 'browser';

export const canSpeak = CLOUD || !!synth;
export const canListen = !!SR;
export const ttsEngine = CLOUD ? engine : synth ? 'browser' : 'none';

// Per-call voice profile; callers passing nothing get the .env default.
// voiceId may be a map per engine, since a fallback engine cannot use the other's voice ids.
export function voiceProfile(voice = {}) {
  const { engine: want, voiceId, style, speed, model, lang, gender, settings } = voice;
  const engine = pickEngine(want ?? forced);
  return {
    voice, // kept so a failed line can be re-profiled for the next engine
    gender: gender ?? null,
    engine,
    voiceId: (voiceId && typeof voiceId === 'object' ? voiceId[engine] : voiceId) ?? null,
    style: style ?? null,
    speed: Number(speed) || SPEED,
    model: model ?? null,
    lang: lang ?? null,
    settings: settings ?? null, // ElevenLabs voice_settings override
  };
}
const DEFAULT_PROFILE = voiceProfile();

const clean = (text) => text.replace(/₹/g, 'rupees ').replace(/[*_`]/g, '');

/* ---------- Cloud TTS: fetch → cache → play, one line at a time ---------- */
const cache = new Map();          // profile+text → Promise<audio url>

function ttsError(name, status, body) {
  const e = new Error(`${name} ${status} ${String(body).slice(0, 160)}`);
  e.status = status;
  e.permanent = status === 401 || status === 402 || status === 403 || /quota|credits|limit_reached|payment/i.test(body);
  return e;
}

function fetchMurf(text, p) {
  const body = { text, voiceId: p.voiceId || MURF_VOICE, rate: Math.round((p.speed - 1) * 100), format: 'MP3', sampleRate: 24000, modelVersion: 'GEN2', channelType: 'MONO' };
  // Murf reads in a flat narration voice unless a style is asked for; unsupported styles are ignored.
  if (p.style) body.style = p.style;
  return fetch(MURF_URL, {
    method: 'POST',
    headers: { 'api-key': MURF_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  })
    .then((r) => (r.ok ? r.json() : r.text().then((t) => Promise.reject(ttsError('Murf', r.status, t)))))
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
      voice_settings: { stability: 0.6, similarity_boost: 0.8, style: 0.1, ...p.settings, speed: p.speed },
    }),
  })
    .then((r) => (r.ok ? r.blob() : r.text().then((t) => Promise.reject(ttsError('ElevenLabs', r.status, t)))))
    .then((b) => URL.createObjectURL(b));
}

function audioUrl(text, p) {
  const clean_ = clean(text);
  const key = `${p.engine}|${p.voiceId}|${p.style}|${p.speed}|${p.model}|${clean_}`;
  if (!cache.has(key)) {
    const get = () => (p.engine === 'elevenlabs' ? fetchEleven(clean_, p) : fetchMurf(clean_, p));
    // One retry for a busy engine (429 concurrency, 5xx, network): waiting 400ms beats switching to the browser voice.
    const req = get().catch((e) => (e?.permanent || (e?.status && e.status < 500 && e.status !== 429)
      ? Promise.reject(e)
      : new Promise((r) => { setTimeout(r, 400); }).then(get)));
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

// Safari (iPhone and Mac) plays a media element only if a tap once started THAT element, and a line starts after a TTS
// fetch, long after the tap. So every line plays through one shared element, unlocked on the first tap anywhere in the
// app; the browser voice is unlocked the same way. A fresh `new Audio()` per line was silent on every Safari.
const SILENT_WAV = 'data:audio/wav;base64,UklGRnQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YVAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==';
let player = null;
let unlocked = false;
const getPlayer = () => (player ??= typeof Audio !== 'undefined' ? new Audio() : null);
const GESTURES = ['touchend', 'click', 'keydown'];
function unlock() {
  const a = getPlayer();
  if (a && !unlocked && !playing) {
    a.onended = null; a.onerror = null; a.onplaying = null; // a finished line's handlers must not fire on the silent clip
    a.muted = false;
    a.src = SILENT_WAV;
    a.play().then(() => { unlocked = true; GESTURES.forEach((e) => document.removeEventListener(e, unlock, true)); }).catch(() => {});
  }
  if (synth && !unlock.synthDone) { unlock.synthDone = true; const u = new SpeechSynthesisUtterance(' '); u.volume = 0; synth.speak(u); }
}
if (typeof document !== 'undefined') GESTURES.forEach((e) => document.addEventListener(e, unlock, true));

// Mute without skipping lines: onStart/onEnd still fire, so callers waiting on them carry on.
// `muted`, not `volume` — iOS ignores volume on media elements.
export function setSilent(on) {
  silent = on;
  if (current?.audio) current.audio.muted = on;
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
    const audio = getPlayer();
    audio.src = url;
    audio.playbackRate = item.rate;
    audio.muted = silent;
    current = { audio };
    audio.onended = finish;
    audio.onerror = finish;
    audio.onplaying = () => { item.onStart?.(); item.onStart = null; };
    await audio.play();
  } catch (e) {
    playing = false; current = null;
    if (myGen !== gen) return;
    const failed = item.profile.engine;
    if (e?.permanent) brokenEngines.add(failed);
    // This line only: the other cloud engine if it has a key (Sarthi's Murf voice is the same male Hindi speaker), else the browser.
    const next = item.src ? item.profile : voiceProfile({ ...item.profile.voice, engine: failed === 'murf' ? 'elevenlabs' : 'murf' });
    console.warn(`[voice] ${failed} failed (${e?.name === 'NotAllowedError' ? 'autoplay blocked' : e?.message})${e?.permanent ? ' — off for this session' : ''}; this line → ${next.engine === failed || item.src ? 'browser' : next.engine}`);
    if (!item.src && next.engine !== 'browser' && next.engine !== failed) { queue.unshift({ ...item, profile: next }); drain(); return; }
    // Hold the queue until the browser has finished, or the next cloud line would talk over it.
    playing = true;
    browserSpeak(item.text, { ...item, onEnd: () => { playing = false; item.onEnd?.(); if (myGen === gen) drain(); } });
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

// An English voice reads Devanagari as silence — Sarthi speaks Devanagari, so it needs a Hindi voice.
const DEVANAGARI = /[ऀ-ॿ]/;
// Hemant/Madhur (Windows, Edge) and Google's hid/hie Android voices are male; Google हिन्दी, Kalpana, Swara are female.
const MALE = /hemant|madhur|prabhat|ravi|arjun|\bmale|-hid-|-hie-/i;
const FEMALE = /kalpana|swara|lekha|google|female|-hia-|-hic-/i;
function hindiVoice(gender) {
  const vs = (synth?.getVoices() ?? []).filter((v) => v.lang?.replace('_', '-').toLowerCase().startsWith('hi'));
  const want = gender === 'male' ? MALE : gender === 'female' ? FEMALE : null;
  const hit = want && vs.find((v) => (want.test(v.name) || want.test(v.voiceURI ?? '')) && !(gender === 'female' && MALE.test(v.name)));
  return hit || vs.find((v) => /google/i.test(v.name)) || vs[0] || null;
}

function browserSpeak(text, { rate = 1, onEnd, onStart, profile } = {}) {
  if (!synth) { onStart?.(); onEnd?.(); return; }
  voice = voice || pickVoice();
  // A Hindi profile (Sarthi) keeps ONE Hindi voice for every line — picking by script switched speakers mid-call.
  const hindi = profile?.lang === 'hi' || DEVANAGARI.test(text);
  const v = hindi ? hindiVoice(profile?.gender) : voice;
  const u = new SpeechSynthesisUtterance(clean(text));
  if (v) u.voice = v;
  u.lang = v?.lang || (hindi ? 'hi-IN' : 'en-IN');
  u.rate = rate; u.pitch = 1; u.volume = silent ? 0 : 1;
  // Safari drops an utterance it will not play (no tap yet, no voice) without any event — the call would wait on
  // onEnd forever with the mic never opening. If nothing is speaking 3s on, give up on this line and carry on.
  let started = false; let ended = false;
  const end = () => { if (ended) return; ended = true; clearTimeout(watchdog); onEnd?.(); };
  const watchdog = setTimeout(() => { if (!started && !synth.speaking) { synth.cancel(); end(); } }, 3000);
  u.onstart = () => { started = true; onStart?.(); };
  u.onend = end;
  u.onerror = end;
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
  browserSpeak(text, { rate, onEnd, onStart, profile });
}

export function stopSpeaking() {
  gen++;
  queue.length = 0;
  // Pause only: clearing src on the shared element would fire a spurious error on some browsers.
  if (current?.audio) { current.audio.onended = null; current.audio.onerror = null; current.audio.onplaying = null; current.audio.pause(); }
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
  let watchdog = null;
  let settled = false;
  // Chrome sometimes never fires onend after stop() (the speech service stalls), which left an answer on screen
  // with the app still "listening" forever. Whichever comes first — onend or the watchdog — settles the turn, once.
  const settle = () => {
    if (settled) return;
    settled = true;
    clearTimeout(quiet); clearTimeout(watchdog);
    const text = final.trim() || (quietEnded ? heard : '');
    if (text) onFinal?.(text);
    onEnd?.();
  };
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
      quiet = setTimeout(() => {
        quietEnded = true;
        try { r.stop(); } catch { /* ignore */ }
        watchdog = setTimeout(() => { try { r.abort(); } catch { /* ignore */ } settle(); }, 1500);
      }, endAfterMs);
    }
  };
  r.onerror = (e) => { if (!settled) onError?.(e.error); };
  // The silence stop can land before the last words are marked final; keep what was on screen.
  r.onend = settle;
  try { r.start(); } catch (e) { onError?.(String(e)); }
  return () => { clearTimeout(quiet); try { r.stop(); } catch { /* ignore */ } };
}
