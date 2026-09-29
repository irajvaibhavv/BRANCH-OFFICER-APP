// Sarthi's own voice profile, passed per speak() so SAARTHI AI keeps the app default. Male or female, switched by the
// officer (VoiceToggle) and kept in localStorage; the words follow the voice (`gendered`).
import { voiceProfile } from '../voice';

const ENV = import.meta.env;
const KEY = 'bo_sarthi_voice_gender';

const BASE = {
  engine: ENV.VITE_SARTHI_TTS_ENGINE || 'elevenlabs',
  style: ENV.VITE_SARTHI_VOICE_STYLE || 'Conversational', // Murf's default style reads flat
  speed: Number(ENV.VITE_SARTHI_TTS_SPEED) || 1,
  model: ENV.VITE_SARTHI_ELEVEN_MODEL || 'eleven_flash_v2_5', // ~75ms model latency vs ~1s+ for multilingual_v2
  lang: 'hi',
};

const VOICES = {
  male: {
    ...BASE,
    voiceId: {
      // Flash v2.5 speaks Hindi with any voice; pick a Hindi-native one from the ElevenLabs library.
      elevenlabs: ENV.VITE_SARTHI_ELEVEN_VOICE || 'JBFqnCBsd6RMkjVDRZzb',
      murf: ENV.VITE_SARTHI_VOICE || 'hi-IN-kabir', // Hindi-native male — Sarthi is spoken Devanagari
    },
    gender: 'male', // browser fallback picks a male Hindi voice when the device has one
  },
  female: {
    ...BASE,
    voiceId: {
      elevenlabs: ENV.VITE_SARTHI_ELEVEN_VOICE_FEMALE || 'EXAVITQu4vr4xnSDxMaL',
      murf: ENV.VITE_SARTHI_VOICE_FEMALE || 'hi-IN-ayushi',
    },
    gender: 'female',
  },
};

const read = () => { try { return window.localStorage.getItem(KEY) === 'female' ? 'female' : 'male'; } catch { return 'male'; } };
let gender = typeof window !== 'undefined' ? read() : 'male';
const listeners = new Set();

export const getSarthiGender = () => gender;
export function setSarthiGender(g) {
  gender = g === 'female' ? 'female' : 'male';
  try { window.localStorage.setItem(KEY, gender); } catch { /* private mode — kept for this session */ }
  listeners.forEach((fn) => fn(gender));
}
export const onSarthiGender = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

/** The profile for the voice chosen now — read per line, so a switch mid-call takes effect on the next line. */
export const sarthiVoice = () => VOICES[gender];

// public/sarthi-audio was rendered with the male Murf voice; next to a live ElevenLabs line, or as the female voice, it
// would switch speakers mid-call.
export const prerendered = () => gender === 'male' && voiceProfile(VOICES.male).engine === 'murf';

// First-person verb forms that change with the speaker's gender. Only forms that can only be Sarthi speaking — "-unga"
// is always "I will"; "raha/sakta/chahta hoon" always "I am". "Samajh gaya" alone is first person in an interviewer's
// mouth (the borrower is "aap … samajh gaye").
const FEM = { raha: 'rahi', sakta: 'sakti', chahta: 'chahti', gaya: 'gayi', aaya: 'aayi', baitha: 'baithi',
  रहा: 'रही', सकता: 'सकती', चाहता: 'चाहती', गया: 'गई', आया: 'आई', बैठा: 'बैठी' };
const TO_FEMALE = [
  [/\b(\w+?)(u|oo)nga\b/gi, '$1$2ngi'],
  [/\b(raha|sakta|chahta|gaya|aaya|baitha)(\s+(?:hoon|hun|hu))\b/gi, (m, v, h) => FEM[v.toLowerCase()] + h],
  [/\b(samajh) gaya\b/gi, '$1 gayi'], // never bare "samjha": "samjha dijiye" is "please explain"
  [/ूँगा/g, 'ूँगी'],
  [/ूंगा/g, 'ूंगी'],
  [/(रहा|सकता|चाहता|गया|आया|बैठा)(\s+(?:हूँ|हूं))/g, (m, v, h) => FEM[v] + h],
  [/समझ गया/g, 'समझ गई'],
];

/** The line in Sarthi's current gender. Male is how every line is written, so it passes through untouched. */
export function gendered(text) {
  if (!text || gender === 'male') return text;
  return TO_FEMALE.reduce((t, [re, to]) => t.replace(re, to), String(text));
}

/** Screen labels about Sarthi in the third person ("Sarthi bol rahe hain") — never questions, which are about them. */
export const aboutSarthi = (label) => (gender === 'female' ? label.replace(/\brahe hain\b/g, 'rahi hain') : label);

/** For prompts: which first-person forms the model must use. */
export const genderRule = () => (gender === 'female'
  ? 'Sarthi is voiced by a FEMALE Hindi voice, so use feminine first-person verb forms ("poochhungi", "karungi", "samajh gayi", "rahi hoon"), never masculine ("poochhunga", "samajh gaya").'
  : 'Sarthi is voiced by a MALE Hindi voice, so use masculine first-person verb forms ("poochhunga", "karunga", "samajh gaya"), never feminine ("poochhungi", "samajh gayi").');
