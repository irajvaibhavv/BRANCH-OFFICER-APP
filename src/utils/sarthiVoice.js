/*
  SARTHI — its own voice, separate from SAARTHI AI's.

  Both features speak through utils/voice.js, but Sarthi interviews borrowers in Hinglish while
  SAARTHI AI talks to the officer in English, so they want different voices. Passing this profile
  on every Sarthi `speak()` keeps SAARTHI on whatever .env says, untouched.

  Override per machine with VITE_SARTHI_VOICE / VITE_SARTHI_TTS_ENGINE in .env.local.
*/
const ENV = import.meta.env;

export const SARTHI_VOICE = {
  engine: ENV.VITE_SARTHI_TTS_ENGINE || 'murf',
  voiceId: ENV.VITE_SARTHI_VOICE || 'hi-IN-kabir', // Hindi-native male — Sarthi is spoken Devanagari
  style: ENV.VITE_SARTHI_VOICE_STYLE || 'Conversational', // Murf's default style reads flat
  speed: Number(ENV.VITE_SARTHI_TTS_SPEED) || 1,
};
