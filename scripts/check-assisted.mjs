// Asserts the assisted-PD rules: answers kept apart per speaker (memory.js), owner vs operator compared (assisted.js).
// Run: npm run check:assisted
import assert from 'node:assert/strict';
import { createServer } from 'vite';

// The app's modules import without extensions, so they are loaded the way the app loads them.
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { assistedFlags, genuineOperator } = await vite.ssrLoadModule('/src/services/sarthi/assisted.js');
const { acceptedFacts, createEmptyMemory, getMissingFields, isAssisted } = await vite.ssrLoadModule('/src/services/sarthi/memory.js');
const { default: pdSchema } = await vite.ssrLoadModule('/src/data/sarthi/pdSchema.json');

// Speaker guard: the operator's answer never fills the applicant's fields, and the other way round.
const m = createEmptyMemory({ name: 'Mahesh Agarwal', brief: {} });
assert.deepEqual(acceptedFacts(m, { monthly_sales: 400000, op_monthly_sales: 400000 }, { section: 'operator', missingFields: ['op_monthly_sales'] }), { op_monthly_sales: 400000 });
assert.deepEqual(acceptedFacts(m, { monthly_sales: 400000, op_monthly_sales: 400000 }, { section: 'business', missingFields: ['monthly_sales'] }), { monthly_sales: 400000 });

// The operator's part opens only when declared at the start or when they are with the applicant.
const operator = pdSchema.sections.find((s) => s.id === 'operator');
assert.equal(getMissingFields(m, operator).length, 0);
assert.equal(isAssisted({ ...m, assisted: true }), true);
const said = { ...m, collected: { ...m.collected, who_runs: 'family', operator_present: 'yes' } };
assert.equal(getMissingFields(said, operator)[0].key, 'operator_name');

// Owner and operator agree → no flag, a genuine operator. Disagree on sales → high.
const base = { monthly_sales: '4 lakh', shop_ownership: 'rented', shop_rent: 22000, business_age: '14 years', operator_name: 'Rohit', operator_relation: 'family', op_monthly_sales: 380000, op_shop_ownership: 'rented', op_shop_rent: 22000, op_years: '6 saal', op_cash_holder: 'applicant', op_owner_role: 'daily' };
assert.deepEqual(assistedFlags(base), []);
assert.equal(genuineOperator(base, []), 'Rohit (family)');
const off = assistedFlags({ ...base, op_monthly_sales: 200000 });
assert.equal(off.length, 1);
assert.equal(off[0].field, 'op_monthly_sales');
assert.equal(off[0].severity, 'high');
assert.equal(genuineOperator(base, off), null);

// A name-lender: never at the shop, the money goes to the operator.
const lender = assistedFlags({ ...base, op_owner_role: 'never', op_cash_holder: 'me' });
assert.equal(lender.find((f) => f.field === 'op_cash_holder')?.severity, 'high');
// Only sometimes there: a flag only when the applicant also failed the trade questions.
assert.equal(assistedFlags({ ...base, op_owner_role: 'sometimes', op_cash_holder: 'me' }).length, 0);
assert.equal(assistedFlags({ ...base, op_owner_role: 'sometimes', op_cash_holder: 'me' }, { total: 4, vague: 1, redFlag: 1 }).length, 1);

// Someone else runs it and was not on the call.
assert.equal(assistedFlags({ who_runs: 'employee', operator_present: 'no' })[0].field, 'who_runs');

await vite.close();
console.log('assisted checks pass');
