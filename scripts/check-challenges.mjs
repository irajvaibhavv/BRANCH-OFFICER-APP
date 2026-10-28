// Asserts the live-challenge planner in src/services/sarthi/liveChallenges.js. Run: npm run check:challenges
import assert from 'node:assert/strict';
import {
  planChallenges, pastDateWords, challengeCount, checkChallenge, CHALLENGES_PER_PD, MAX_CHALLENGES, POOL, STALE_DAYS,
} from '../src/services/sarthi/liveChallenges.js';

const ids = (plan) => [...new Set(plan.map((s) => s.id))];

for (let i = 0; i < 200; i++) {
  const plan = planChallenges('shop', { billing_method: 'none' });
  assert.equal(ids(plan).length, CHALLENGES_PER_PD);
  assert.ok(!ids(plan).includes('bill_back'), 'no old bill page when they keep no bills');
}
// Over many calls every challenge turns up — nothing a BO could learn as "the" questions.
const seen = new Set();
for (let i = 0; i < 800; i++) {
  ids(planChallenges('shop', { billing_method: 'bill_book' }, Math.random, 3)).forEach((id) => seen.add(id));
  ids(planChallenges('home', {})).forEach((id) => seen.add(id));
}
assert.deepEqual([...seen].sort(), POOL.map((ch) => ch.id).sort());
assert.deepEqual(planChallenges('other', {}), []);

// More checks when the PD is riskier, never past the cap.
assert.equal(challengeCount({}).count, CHALLENGES_PER_PD);
assert.equal(challengeCount({ boPresent: true }).count, CHALLENGES_PER_PD + 1);
assert.deepEqual(challengeCount({ boPresent: true, prior: { a: 1 } }).why, ['the officer sat with the applicant', 'a repeat PD']);
assert.equal(challengeCount({ strict: true, boPresent: true, prior: { a: 1 }, flags: [{ severity: 'high' }] }).count, MAX_CHALLENGES);
assert.equal(challengeCount({ flags: [{ type: 'declined' }, { type: 'declined' }] }).count, CHALLENGES_PER_PD + 1);

// Code checks on the answers.
const step = (id, extra = {}) => ({ id, ...extra });
const kirana = { typicalMarginPct: { min: 8, max: 15 } };
const details = (flags) => flags.map((f) => f.detail).join(' | ');
assert.equal(checkChallenge(step('opening_day'), 'nau baje').length, 0);

const margin = step('shelf_item', { check: 'margin' });
assert.equal(checkChallenge(margin, 'MRP 50 hai, 45 mein lete hain, Gupta agency se', { trade: kirana }).length, 0);
assert.match(details(checkChallenge(margin, 'MRP 50, 60 mein aata hai', { trade: kirana })), /above its MRP/);
assert.match(details(checkChallenge(margin, 'MRP 100, 40 mein lete hain', { trade: kirana })), /60%/);
assert.match(details(checkChallenge(margin, 'pata nahi', { trade: kirana })), /Could not give/);

const purchase = step('purchase_bill', { check: 'purchase' });
assert.match(details(checkChallenge(purchase, 'paanch din pehle, 80000 ka', { collected: { last_purchase_amount: 30000 } })), /earlier in the call it was 30000/);
assert.match(details(checkChallenge(purchase, 'kal aaya, 90000 ka', { collected: { monthly_purchase: 50000 } })), /more than the 50000 a month/);
assert.equal(checkChallenge(purchase, 'kal aaya, 32000 ka', { collected: { last_purchase_amount: 30000, monthly_purchase: 120000 } }).length, 0);

const names = step('qr_code', { check: 'names' });
assert.equal(checkChallenge(names, 'Ramesh Kumar ka naam aata hai', { photoNames: ['RAMESH KUMAR'] }).length, 0);
assert.match(details(checkChallenge(names, 'Suresh Verma', { photoNames: ['Ramesh Kumar'] })), /photo shows: Ramesh Kumar/);
assert.equal(checkChallenge(names, 'रमेश', { photoNames: ['Ramesh Kumar'] }).length, 0, 'Devanagari cannot be compared');

assert.equal(pastDateWords(() => 0, new Date(2026, 9, 22)), '14 tareekh');
assert.equal(pastDateWords(() => 0.99, new Date(2026, 9, 10)), 'pichhle mahine ki 15 tareekh');

// A pool with nothing new for months is one a BO has learned.
const newest = Math.max(...POOL.map((ch) => Date.parse(ch.added)));
const age = Math.floor((Date.now() - newest) / 86400000);
if (age > STALE_DAYS) console.warn(`! no new surprise check in ${age} days — add tasks to POOL in liveChallenges.js`);

console.log('challenge checks pass');
