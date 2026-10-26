// Asserts the stated age is checked against the KYC date of birth (controller.js). Run: npm run check:age
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { ageOnFile, checkContradictions } = await vite.ssrLoadModule('/src/services/sarthi/controller.js');
const { createEmptyMemory } = await vite.ssrLoadModule('/src/services/sarthi/memory.js');

const c = { name: 'Mahesh Agarwal', age: 44, brief: { kyc: { dob: '1982-03-14' } } };
assert.deepEqual(ageOnFile(c, new Date('2026-10-26')), { age: 44, source: 'KYC date of birth' });
assert.deepEqual(ageOnFile(c, new Date('2026-03-13')), { age: 43, source: 'KYC date of birth' }); // day before the birthday
assert.deepEqual(ageOnFile({ age: 30 }), { age: 30, source: 'application' });
assert.equal(ageOnFile({}), null);

const m = createEmptyMemory(c);
const ageFlags = (age) => checkContradictions(m, { age }, c).filter((f) => f.field === 'age');
assert.equal(ageFlags(100)[0]?.severity, 'high');
assert.equal(ageFlags(48)[0]?.severity, 'medium');
assert.equal(ageFlags(45).length, 0); // "lagbhag" is not a contradiction
assert.equal(checkContradictions(m, { age: 100 }, { name: 'Walk In', brief: {} }).filter((f) => f.field === 'age').length, 0);

await vite.close();
console.log('check:age ok');
