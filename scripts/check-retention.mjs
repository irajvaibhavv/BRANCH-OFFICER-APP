// Asserts the retention maths in src/services/retention.js. Run: npm run check:retention
import assert from 'node:assert/strict';
import { expiry, purgeExpiredVideos, VIDEO_PREFIX } from '../src/services/retention.js';

const now = new Date('2026-10-23T10:00:00Z');
const e = expiry('2026-09-23T10:00:00Z', 90, now);
assert.equal(e.until.toISOString(), '2026-12-22T10:00:00.000Z');
assert.equal(e.expired, false);
assert.equal(e.daysLeft, 60);
assert.equal(expiry('2026-07-01T00:00:00Z', 90, now).expired, true);
assert.equal(expiry('2026-07-25T10:00:00Z', 90, now).expired, true); // exactly at the deadline counts as expired

// A minimal localStorage: keeps the fresh video, drops the old one, leaves other keys alone.
const store = new Map([
  [`${VIDEO_PREFIX}old`, JSON.stringify({ at: '2026-09-01T00:00:00Z' })],
  [`${VIDEO_PREFIX}new`, JSON.stringify({ at: '2026-10-20T00:00:00Z' })],
  ['bo_sarthi_reports', '[]'],
]);
const ls = { getItem: (k) => store.get(k) ?? null, removeItem: (k) => store.delete(k) };
globalThis.window = { localStorage: new Proxy(ls, { ownKeys: () => [...store.keys()], getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }) }) };
assert.equal(purgeExpiredVideos(30, now), 1);
assert.deepEqual([...store.keys()], [`${VIDEO_PREFIX}new`, 'bo_sarthi_reports']);

console.log('retention checks pass');
