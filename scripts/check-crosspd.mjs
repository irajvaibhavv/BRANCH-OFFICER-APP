// Asserts the cross-PD matching in src/services/sarthi/crossPd.js. Run: npm run check:crosspd
import assert from 'node:assert/strict';
import { sharedNames, findLinks, crossPdFlags, fileNameCheck, nameFlags } from '../src/services/sarthi/crossPd.js';

assert.deepEqual(sharedNames(['Gupta Traders', 'Paytm'], ['GUPTA TRADERS', 'paytm']), ['Gupta Traders']);
assert.deepEqual(sharedNames(['PhonePe'], ['phone pe']), []);

const shop = { lat: 28.651934, lng: 77.19087, accuracy: 15 };
const mine = [{ kind: 'shop', label: 'the shop', at: 'a', location: shop, names: [] }];
const reports = [
  { caseId: 'x', name: 'Rakesh', photos: [{ kind: 'shop', label: 'the shop', at: 'b', location: { lat: 28.65200, lng: 77.19090, accuracy: 20 }, names: [] }] },
  { caseId: 'y', name: 'Far', photos: [{ kind: 'shop', label: 'the shop', at: 'c', location: { lat: 28.6600, lng: 77.1909, accuracy: 10 }, names: [] }] },
  { caseId: 'z', name: 'Rough', photos: [{ kind: 'shop', label: 'the shop', at: 'd', location: { ...shop, accuracy: 900 }, names: [] }] },
  { caseId: 'q', name: 'Named', photos: [{ kind: 'records', label: 'the bill book', at: 'e', location: { error: 'denied' }, names: ['07AAACG1234F1Z5'] }] },
  { caseId: 'self', name: 'Me', photos: [{ kind: 'shop', label: 'the shop', at: 'f', location: shop, names: [] }] },
];
const links = findLinks([...mine, { kind: 'records', label: 'the bill book', at: 'g', location: { error: 'denied' }, names: ['07AAACG1234F1Z5'] }], 'self', reports);
assert.deepEqual(links.map((l) => l.otherCase).sort(), ['q', 'x'], 'near shop and same GSTIN; not far, not rough GPS, not itself');
assert.ok(links.find((l) => l.otherCase === 'x').distance < 40);

const flag = (vision, names = []) => crossPdFlags([{ kind: 'shop', label: 'the shop', otherName: 'R', otherLabel: 'the shop', distance: 8, names, vision }])[0].severity;
assert.equal(flag({ verdict: 'same' }), 'high');
assert.equal(flag({ verdict: 'different' }), 'low');
assert.equal(flag(null), 'medium');
assert.equal(flag({ verdict: 'different' }, ['Gupta Traders']), 'high');

// Names on this applicant's photos against their own file.
const mahesh = { name: 'Mahesh Agarwal', businessName: 'Agarwal General Store', brief: { kyc: { pan: 'BQMPA4821K', nameOnPan: 'MAHESH AGARWAL' } } };
const [qr, book, supplier] = fileNameCheck([
  { kind: 'qr', label: 'the QR', names: ['Sharma Kirana', 'PhonePe'] },
  { kind: 'records', label: 'the book', names: ['Agarwal General Store', '07BQMPA4821K1Z5'] },
  { kind: 'purchase_bill', label: 'supplier bill', names: ['Bansal Distributors'] },
], mahesh);
assert.equal(qr.verdict, 'none');
assert.equal(book.verdict, 'match');
assert.equal(book.gstin, 'match', 'a proprietor GSTIN carries their PAN');
assert.equal(supplier, undefined, "a supplier's bill is not checked against the applicant");
assert.equal(nameFlags([qr], mahesh)[0].severity, 'medium');
const firm = { ...mahesh, brief: { ...mahesh.brief, gstin: '07AAKFQ4410M1ZQ' } };
assert.equal(fileNameCheck([{ kind: 'records', label: 'b', names: ['07BQMPA4821K1Z5'] }], firm)[0].gstin, 'mismatch');
assert.equal(fileNameCheck([{ kind: 'qr', label: 'q', names: ['mahesh.agarwal@okicici'] }], mahesh)[0].verdict, 'match');

console.log('cross-PD checks pass');
