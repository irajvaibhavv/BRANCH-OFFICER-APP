/*
  Voice I/O for SMFG AI — browser Web Speech API. Text-to-speech for the AI's bubbles and
  speech-to-text for the customer's / DSA's replies. Everything still appears as text, so it
  works (typed) where the browser has no speech support.
*/
const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
const SR = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

export const canSpeak = !!synth;
export const canListen = !!SR;

let voice = null;
function pickVoice() {
  if (!synth) return null;
  const vs = synth.getVoices();
  return vs.find((v) => v.lang === 'en-IN') || vs.find((v) => v.lang?.startsWith('en-IN')) || vs.find((v) => v.lang === 'hi-IN') || vs.find((v) => v.lang?.startsWith('en')) || vs[0] || null;
}
synth?.addEventListener?.('voiceschanged', () => { voice = pickVoice(); });

/** Speak a line; onEnd fires when done (or immediately if unsupported). */
export function speak(text, { rate = 1, onEnd } = {}) {
  if (!synth) { onEnd?.(); return; }
  voice = voice || pickVoice();
  const u = new SpeechSynthesisUtterance(text.replace(/₹/g, 'rupees '));
  if (voice) u.voice = voice;
  u.lang = voice?.lang || 'en-IN';
  u.rate = rate; u.pitch = 1;
  u.onend = () => onEnd?.();
  u.onerror = () => onEnd?.();
  synth.speak(u);
}
export function stopSpeaking() { synth?.cancel(); }

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
