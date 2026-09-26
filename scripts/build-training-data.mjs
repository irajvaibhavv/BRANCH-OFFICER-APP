// Builds SLM training data in the exact formats the app sends (npm run sarthi:training -- <source.jsonl>).
// Output goes to training/ (git-ignored): extraction and interviewer sets, each split train/val, plus REPORT.md.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { rng } from './training/lang.mjs';
import { cleanExample, newExamples } from './training/extract.mjs';
import { interviewerExamples, INTERVIEWER_SLM_SYSTEM } from './training/interviewer.mjs';

const SOURCE = process.argv[2];
if (!SOURCE) {
  console.error('Usage: npm run sarthi:training -- <path to source .jsonl>');
  process.exit(1);
}
const OUT = 'training';

// Bundle the app's own prompt, schema and number parser through Vite, so the data cannot drift from the app.
async function appHelpers() {
  const entry = 'sarthi-training-entry.mjs';
  const outDir = '.sarthi-training-tmp';
  writeFileSync(entry, `
    export { EXTRACTOR_SYSTEM } from './src/services/sarthi/model.js';
    export { FIELD_DEFS, EXTRACTABLE_KEYS } from './src/services/sarthi/memory.js';
    export { readNumbers, reconcile } from './src/services/sarthi/hindiNumbers.js';
    export { default as businessKnowledge } from './src/data/sarthi/businessKnowledge.json';
  `);
  try {
    execSync(`npx vite build --ssr ${entry} --outDir ${outDir} --logLevel error`, { stdio: 'inherit' });
    const built = readdirSync(outDir).find((f) => /\.(m?js)$/.test(f));
    return await import(pathToFileURL(join(outDir, built)).href);
  } finally {
    rmSync(entry, { force: true });
    rmSync(outDir, { recursive: true, force: true });
  }
}

const h = await appHelpers();
const r = rng(20260926);
const source = readFileSync(SOURCE, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const isExtract = (o) => /^Extract facts/.test(o.messages[0].content);

/* ---------------- extraction ---------------- */
const log = [];
const cleaned = source.filter(isExtract).map((o) => cleanExample(o, h, log)).filter(Boolean);
const countKeys = (set) => {
  const c = {};
  for (const o of set) for (const k of Object.keys(JSON.parse(o.messages[2].content))) c[k] = (c[k] ?? 0) + 1;
  return c;
};
const before = countKeys(cleaned);
const added = newExamples(h, r, before);
const seenAnswers = new Set();
const extraction = r.shuffle([...cleaned, ...added]).filter((o) => {
  const key = o.messages[1].content;
  if (seenAnswers.has(key)) return false;
  seenAnswers.add(key);
  return true;
});

// Every label must be something the app itself would accept.
const problems = [];
for (const o of extraction) {
  const facts = JSON.parse(o.messages[2].content);
  for (const [k, v] of Object.entries(facts)) {
    if (!h.EXTRACTABLE_KEYS.includes(k)) problems.push(`unknown key ${k}`);
    const def = h.FIELD_DEFS[k];
    if (def?.options && !def.options.includes(v)) problems.push(`${k}="${v}" not an option`);
  }
}

/* ---------------- interviewer ---------------- */
const FENCE = '```';
// The source's question examples, reordered speech-first (the app speaks the fence before the caption).
const converted = source.filter((o) => !isExtract(o)).map((o) => {
  const topic = o.messages[1].content.match(/Topic:\s*([^\n]+)/)?.[1]?.trim() ?? 'next topic';
  const reply = o.messages[2].content;
  const speech = reply.match(/```speech\s*([\s\S]*?)```/)?.[1]?.trim();
  const caption = reply.replace(/```speech[\s\S]*?```/, '').trim();
  if (!speech || !caption) return null;
  return {
    messages: [
      { role: 'system', content: INTERVIEWER_SLM_SYSTEM },
      { role: 'user', content: `THIS TURN — section "Interview": Ask about: ${topic}. Ask ONE thing at a time, in your own words.\nALREADY ANSWERED: {}\nBORROWER JUST SAID: "Ji, bataiye"` },
      { role: 'assistant', content: `${FENCE}speech\n${speech}\n${FENCE}\n${caption}` },
    ],
  };
}).filter(Boolean);
const interviewer = r.shuffle([...interviewerExamples(h.FIELD_DEFS, h.businessKnowledge, r), ...converted]);

for (const o of interviewer) {
  const reply = o.messages[2].content;
  if (!reply.startsWith(`${FENCE}speech\n`)) problems.push('interviewer reply does not start with the speech fence');
  const speech = reply.match(/```speech\n([\s\S]*?)\n```/)?.[1] ?? '';
  if (/[A-Za-z]/.test(speech)) problems.push(`Latin letters in speech: ${speech.slice(0, 60)}`);
  if (!/[ऀ-ॿ]/.test(speech)) problems.push('speech without Devanagari');
}

if (problems.length) {
  console.error(`${problems.length} problems — nothing written:\n${[...new Set(problems)].slice(0, 20).join('\n')}`);
  process.exit(1);
}

/* ---------------- write ---------------- */
mkdirSync(OUT, { recursive: true });
const split = (set) => {
  const cut = Math.round(set.length * 0.9);
  return [set.slice(0, cut), set.slice(cut)];
};
const write = (name, set) => writeFileSync(join(OUT, name), `${set.map((o) => JSON.stringify(o)).join('\n')}\n`);
const [exTrain, exVal] = split(extraction);
const [ivTrain, ivVal] = split(interviewer);
write('sarthi_extract_v2_train.jsonl', exTrain);
write('sarthi_extract_v2_val.jsonl', exVal);
write('sarthi_interviewer_v2_train.jsonl', ivTrain);
write('sarthi_interviewer_v2_val.jsonl', ivVal);

const after = countKeys(extraction);
const thin = h.EXTRACTABLE_KEYS.filter((k) => (after[k] ?? 0) < 15);
const rows = h.EXTRACTABLE_KEYS.map((k) => `| ${k} | ${before[k] ?? 0} | ${after[k] ?? 0} |`).join('\n');
writeFileSync(join(OUT, 'REPORT.md'), `# Sarthi training data v2

Source: \`${SOURCE}\` — ${source.length} records (${source.filter(isExtract).length} extraction, ${source.length - source.filter(isExtract).length} question).

| File | Examples |
|---|---|
| sarthi_extract_v2_train.jsonl | ${exTrain.length} |
| sarthi_extract_v2_val.jsonl | ${exVal.length} |
| sarthi_interviewer_v2_train.jsonl | ${ivTrain.length} |
| sarthi_interviewer_v2_val.jsonl | ${ivVal.length} |

Extraction: ${cleaned.length} cleaned from the source, ${added.length} new (every number label checked against the app's parser).
Interviewer: ${interviewer.length - converted.length} new turns, ${converted.length} converted from the source.

## Inference must send the same prompts
- Extraction: the system prompt is \`EXTRACTOR_SYSTEM\` from \`src/services/sarthi/model.js\` and the user message is the
  one \`extractFacts()\` builds. Change either in the app → rebuild this data.
- Interviewer: the system prompt is \`INTERVIEWER_SLM_SYSTEM\` in \`scripts/training/interviewer.mjs\` — a compact prompt
  for a small model. The app's live Claude prompt is longer; route question phrasing to the SLM only with this one.

## Fields still thin (< 15 examples)
${thin.length ? thin.map((k) => `- ${k}: ${after[k] ?? 0}`).join('\n') : 'None.'}

## Changes made to source labels (${log.length})
${log.map((l) => `- ${l}`).join('\n') || 'None.'}

## Examples per field (source → v2)
| Field | Source | v2 |
|---|---|---|
${rows}
`);

console.log(`extraction ${extraction.length} (${cleaned.length} cleaned + ${added.length} new) · interviewer ${interviewer.length} · ${log.length} label fixes · written to ${OUT}/`);
