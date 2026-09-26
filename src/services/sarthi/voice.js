// Sarthi's own voice profile, passed per speak() so SAARTHI AI keeps the app default.
import { voiceProfile } from '../voice';

const ENV = import.meta.env;

export const SARTHI_VOICE = {
  engine: ENV.VITE_SARTHI_TTS_ENGINE || 'elevenlabs',
  voiceId: {
    // Flash v2.5 speaks Hindi with any voice; pick a Hindi-native one from the ElevenLabs library.
    elevenlabs: ENV.VITE_SARTHI_ELEVEN_VOICE || 'JBFqnCBsd6RMkjVDRZzb',
    murf: ENV.VITE_SARTHI_VOICE || 'hi-IN-kabir', // Hindi-native male — Sarthi is spoken Devanagari
  },
  style: ENV.VITE_SARTHI_VOICE_STYLE || 'Conversational', // Murf's default style reads flat
  speed: Number(ENV.VITE_SARTHI_TTS_SPEED) || 1,
  model: ENV.VITE_SARTHI_ELEVEN_MODEL || 'eleven_flash_v2_5', // ~75ms model latency vs ~1s+ for multilingual_v2
  lang: 'hi',
};

// public/sarthi-audio was rendered with Murf; playing it next to a live ElevenLabs line would switch voices mid-call.
export const PRERENDERED = voiceProfile(SARTHI_VOICE).engine === 'murf';
