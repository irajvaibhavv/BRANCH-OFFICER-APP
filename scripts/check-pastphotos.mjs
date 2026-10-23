// Asserts the vintage maths in src/services/sarthi/pastPhotos.js. Run: npm run check:pastphotos
import assert from 'node:assert/strict';
import { vintageYears, vintageCheck } from '../src/services/sarthi/pastPhotos.js';

assert.equal(vintageYears('14 years'), 14);
assert.equal(vintageYears('do saal'), null);
assert.equal(vintageYears('5 saal'), 5);
assert.equal(vintageYears('8 months'), 0);
assert.equal(vintageYears(undefined), null);

const now = new Date('2026-10-23');
// Trading since 2012 (14 years).
assert.equal(vintageCheck(2012, '14 years', 2010, now).tone, 'clear');
assert.equal(vintageCheck(2013, '14 years', 2010, now).tone, 'clear'); // within SLACK_YEARS
assert.equal(vintageCheck(2016, '14 years', 2010, now).tone, 'flag');
assert.equal(vintageCheck(2016, '14 years', 2016, now).tone, 'watch'); // oldest photo, nothing older
assert.equal(vintageCheck('never', '14 years', 2014, now).tone, 'flag');
assert.equal(vintageCheck(null, '14 years', 2014, now), null);
assert.equal(vintageCheck(2016, 'pata nahi', 2014, now), null);

console.log('pastPhotos checks passed');
