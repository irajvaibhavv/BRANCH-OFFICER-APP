// Asserts the photo-location maths in src/services/sarthi/geo.js. Run: npm run check:geo
import assert from 'node:assert/strict';
import { parseLatLng, distanceM, checkPlace } from '../src/services/sarthi/geo.js';

assert.deepEqual(parseLatLng('28.651934, 77.190870'), { lat: 28.651934, lng: 77.19087 });
assert.deepEqual(parseLatLng('https://www.google.com/maps/@28.6519,77.1908,17z'), { lat: 28.6519, lng: 77.1908 });
assert.deepEqual(parseLatLng('https://maps.google.com/?q=28.59214,77.04602'), { lat: 28.59214, lng: 77.04602 });
assert.equal(parseLatLng('Karol Bagh'), null);
assert.equal(parseLatLng('95.1, 77.2'), null);

// Karol Bagh → Dwarka is ~15 km.
const d = distanceM({ lat: 28.651934, lng: 77.19087 }, { lat: 28.59214, lng: 77.04602 });
assert.ok(d > 14000 && d < 17000, `distance ${d}`);

const shop = { lat: 28.651934, lng: 77.19087 };
assert.equal(checkPlace({ lat: 28.6525, lng: 77.1912, accuracy: 20 }, shop).status, 'near');
assert.equal(checkPlace({ lat: 28.6600, lng: 77.1909, accuracy: 20 }, shop).status, 'far');
assert.equal(checkPlace({ lat: 28.6600, lng: 77.1909, accuracy: 1500 }, shop).status, 'near'); // GPS too rough to say
assert.equal(checkPlace({ lat: 28.66, lng: 77.19, accuracy: 20 }, null).status, 'not_on_file');
assert.equal(checkPlace({ error: 'denied' }, shop).status, 'no_fix');

console.log('geo checks pass');
