/*
  Pre-render every line Sarthi speaks in scripted mode to an MP3 in public/sarthi-audio/.

      npm run sarthi:voice

  Why: during a client demo each spoken line would otherwise be a live Murf call — so a free-tier
  quota running out, or flaky venue wifi, silently drops the whole interview to robotic browser
  TTS mid-pitch. Pre-rendered audio has no quota, no network dependency and no lag before a
  question, and sounds identical every run.

  Reads the voice from src/utils/sarthiVoice.js and the questions from the same builder the app
  uses, so the audio can never drift from what is on screen. Re-run after changing any question.
  Live Gemini mode still calls the API, since its text is generated on the fly.
*/
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync, rmSync } from 'fs';
import { execSync } from 'child_process';
import { createHash } from 'crypto';
import { join } from 'path';
import { pathToFileURL } from 'url';

const OUT_DIR = 'public/sarthi-audio';
const MANIFEST = 'src/data/sarthi/voiceManifest.json';

/* --- env (.env.local is not loaded for us — read it directly) --- */
const env = Object.fromEntries(
  (existsSync('.env.local') ? readFileSync('.env.local', 'utf8') : '')
    .split('\n')
    .filter((l) => l.trim() && !l.trim().startsWith('#') && l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
const KEY = process.env.MURF_API_KEY || env.VITE_MURF_API_KEY;
if (!KEY) {
  console.error('No Murf key. Set VITE_MURF_API_KEY in .env.local (or MURF_API_KEY in the shell).');
  process.exit(1);
}

/* --- the voice Sarthi uses, read from its own config --- */
const voiceSrc = readFileSync('src/utils/sarthiVoice.js', 'utf8');
const pick = (name, fallback) => voiceSrc.match(new RegExp(`${name}\\s*\\|\\|\\s*'([^']+)'`))?.[1] ?? fallback;
const VOICE = pick('VITE_SARTHI_VOICE', 'hi-IN-kabir');
const STYLE = pick('VITE_SARTHI_VOICE_STYLE', 'Conversational');
const SPEED = Number(voiceSrc.match(/VITE_SARTHI_TTS_SPEED\)\s*\|\|\s*([\d.]+)/)?.[1] ?? 1);

/* --- collect every spoken line, from the app's own script builder --- */
// buildScript imports JSON the way Vite resolves it, so bundle it through Vite rather than
// re-implementing the question list here: the audio then cannot drift from what the app says.
async function collectLines() {
  const entry = 'sarthi-voice-entry.mjs';
  const outDir = '.sarthi-voice-tmp';
  writeFileSync(entry, `
    import { CASES } from './src/utils/sarthiTools.js';
    import { buildScript, buildIntakeScript } from './src/utils/sarthiScript.js';
    const fromCases = CASES.flatMap((c) => buildScript(c).map((s) => s.speech));
    const fromIntake = buildIntakeScript().map((s) => s.speech);
    export const lines = [...new Set([...fromCases, ...fromIntake].filter(Boolean))];
  `);
  try {
    execSync(`npx vite build --ssr ${entry} --outDir ${outDir} --logLevel error`, { stdio: 'inherit' });
    const built = readdirSync(outDir).find((f) => /\.(m?js)$/.test(f)); // vite may rewrite the extension
    const { lines } = await import(pathToFileURL(join(outDir, built)).href);
    return lines;
  } finally {
    rmSync(entry, { force: true });
    rmSync(outDir, { recursive: true, force: true });
  }
}
const lines = await collectLines();

const id = (text) => createHash('sha1').update(`${VOICE}|${STYLE}|${SPEED}|${text}`).digest('hex').slice(0, 12);

async function render(text) {
  const res = await fetch('https://api.murf.ai/v1/speech/generate', {
    method: 'POST',
    headers: { 'api-key': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text, voiceId: VOICE, style: STYLE, rate: Math.round((SPEED - 1) * 100),
      format: 'MP3', sampleRate: 24000, modelVersion: 'GEN2', channelType: 'MONO',
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.audioFile) throw new Error(data.errorMessage || `Murf ${res.status}`);
  return Buffer.from(await (await fetch(data.audioFile)).arrayBuffer());
}

mkdirSync(OUT_DIR, { recursive: true });
const manifest = {};
let made = 0;
let reused = 0;

for (const text of lines) {
  const file = `${id(text)}.mp3`;
  manifest[text] = `/sarthi-audio/${file}`;
  if (existsSync(join(OUT_DIR, file))) { reused++; continue; }
  try {
    writeFileSync(join(OUT_DIR, file), await render(text));
    made++;
    console.log(`  rendered  ${text.slice(0, 52)}…`);
  } catch (e) {
    console.error(`  FAILED    ${text.slice(0, 40)}… — ${e.message}`);
    delete manifest[text]; // no entry means the app falls back to a live call for this line
  }
}

// Drop files no question points at any more, so the folder cannot grow forever.
const keep = new Set(Object.values(manifest).map((p) => p.split('/').pop()));
let pruned = 0;
readdirSync(OUT_DIR).filter((f) => f.endsWith('.mp3') && !keep.has(f)).forEach((f) => { unlinkSync(join(OUT_DIR, f)); pruned++; });

writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`\n${VOICE} · ${STYLE} · ${SPEED}x — ${made} rendered, ${reused} already present, ${pruned} pruned`);
console.log(`${Object.keys(manifest).length}/${lines.length} lines are pre-rendered → ${MANIFEST}`);
