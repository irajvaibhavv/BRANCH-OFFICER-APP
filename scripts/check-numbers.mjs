// Asserts spoken-number parsing (src/services/sarthi/hindiNumbers.js) on what English speech recognition writes for
// Hindi numbers. Run: npm run check:numbers
import assert from 'node:assert/strict';
import { readNumbers, reconcile } from '../src/services/sarthi/hindiNumbers.js';

const v = (t) => readNumbers(t).map((n) => n.value);

assert.deepEqual(v('sau saal'), [100]);
assert.deepEqual(v('meri umar so saal hai'), [100]); // en-IN writes "sau" as "so"
assert.deepEqual(v('paanch so rupaye'), [500]);
assert.deepEqual(v('do so pachas'), [250]);
assert.deepEqual(v('so main shop pe tha'), []); // English "so" is not 100
assert.deepEqual(v('haan so theek hai'), []);
assert.deepEqual(v('pachas saal'), [50]);
assert.equal(reconcile(50, 'so saal').value, 100); // the model's misread is corrected

console.log('check:numbers ok');
