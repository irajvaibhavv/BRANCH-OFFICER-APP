// Asserts the live-challenge planner in src/services/sarthi/challenges.js. Run: npm run check:challenges
import assert from 'node:assert/strict';
import { planChallenges, pastDateWords, CHALLENGES_PER_PD } from '../src/services/sarthi/challenges.js';

const ids = (plan) => [...new Set(plan.map((s) => s.id))];

for (let i = 0; i < 200; i++) {
  const plan = planChallenges('shop', { billing_method: 'none' });
  assert.equal(ids(plan).length, CHALLENGES_PER_PD);
  assert.ok(!ids(plan).includes('bill_back'), 'no old bill page when they keep no bills');
}
// Over many calls every shop challenge turns up — nothing a BO could learn as "the" questions.
const seen = new Set();
for (let i = 0; i < 500; i++) ids(planChallenges('shop', { billing_method: 'bill_book' })).forEach((id) => seen.add(id));
assert.deepEqual([...seen].sort(), ['bill_back', 'opening_day', 'purchase_bill', 'qr_code', 'shelf_item']);

assert.deepEqual(ids(planChallenges('home', {})), ['utility_bill']);
assert.deepEqual(planChallenges('other', {}), []);

assert.equal(pastDateWords(() => 0, new Date(2026, 9, 22)), '14 tareekh');
assert.equal(pastDateWords(() => 0.99, new Date(2026, 9, 10)), 'pichhle mahine ki 15 tareekh');

console.log('challenge checks pass');
