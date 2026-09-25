// Sarthi's own voice profile, passed per speak() so SAARTHI AI keeps the app default.
const ENV = import.meta.env;

export const SARTHI_VOICE = {
  engine: ENV.VITE_SARTHI_TTS_ENGINE || 'murf',
  voiceId: ENV.VITE_SARTHI_VOICE || 'hi-IN-kabir', // Hindi-native male — Sarthi is spoken Devanagari
  style: ENV.VITE_SARTHI_VOICE_STYLE || 'Conversational', // Murf's default style reads flat
  speed: Number(ENV.VITE_SARTHI_TTS_SPEED) || 1,
};
