// npm run check:incentive — asserts the incentive grid maths (utils/incentive.js) against incentivePlan.json.
// Bundled through Vite, like build-training-data.mjs, so the JSON imports resolve exactly as in the app.
import assert from 'assert';
import { writeFileSync, readdirSync, rmSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';
import { pathToFileURL } from 'url';

const entry = 'check-incentive-entry.tmp.mjs';
const outDir = '.check-incentive-tmp';
writeFileSync(entry, "export * from './src/utils/incentive.js';\nexport { default as files } from './src/data/mock/loanFiles.json';\n");
let m;
try {
  execSync(`npx vite build --ssr ${entry} --outDir ${outDir} --logLevel error`, { stdio: 'inherit' });
  m = await import(pathToFileURL(join(outDir, readdirSync(outDir).find((f) => /\.m?js$/.test(f)))).href);
} finally { rmSync(entry, { force: true }); rmSync(outDir, { recursive: true, force: true }); }

const { minDisbursement, slabs } = m.PLAN;
assert.equal(m.incentiveFor(minDisbursement - 1), 0, 'nothing below the minimum');
for (const s of slabs) assert.equal(m.incentiveFor(s.from), Math.round((s.from * s.rate) / 100), `slab from ${s.from} pays its rate on the whole amount`);
for (const t of [1, 5000, 30000, 45000, 99999, 200000, 500000, 1000000]) {
  const need = m.disbursementFor(t);
  assert.ok(m.incentiveFor(need) >= t, `${need} pays at least ${t}`);
  assert.ok(m.incentiveFor(need - 10000) < t || need === minDisbursement, `${need} is the least (to Rs 10,000) that pays ${t}`);
}
const r = m.incentiveRoadmap(200000, m.files, '2026-09-17');
assert.equal(r.need - r.done, r.gap);
assert.ok(r.fresh <= r.gap && r.newFiles >= 0 && r.logins >= r.newFiles);
console.log(`ok — Rs 2,00,000 needs Rs ${r.need.toLocaleString('en-IN')} disbursed; ${r.newFiles} new files, ${r.logins} logins after the pipeline`);
