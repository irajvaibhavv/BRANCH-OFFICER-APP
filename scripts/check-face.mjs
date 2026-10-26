// Asserts the live face check's rules (src/services/sarthi/face.js) and how replies to "kya aap khud X ji hain?" are read
// (idChecks.js), since only their answer — never the model's verdict — can end a call. Run: npm run check:face
import assert from 'node:assert/strict';
import { faceFlags, faceSummary, faceLines, matchVerdict } from '../src/services/sarthi/face.js';
import { confirmReply, speakerIsSomeoneElse } from '../src/services/sarthi/idChecks.js';

const same = { verdict: 'same', reason: 'match', people: 1 };
const diff = { verdict: 'different', reason: 'jaw and nose differ', people: 1 };
const unsure = { verdict: 'unsure', reason: 'face in shadow', people: 0 };

// Flags
assert.deepEqual(faceFlags([], true), []);
assert.equal(faceFlags([], false)[0].severity, 'low'); // camera off
assert.deepEqual(faceFlags([same, same], true), []);
const d = faceFlags([same, diff, diff], true);
assert.equal(d.length, 1);
assert.equal(d[0].severity, 'high');
assert.match(d[0].detail, /2 of 3 checks/);
assert.equal(faceFlags([unsure, unsure], true)[0].severity, 'low');
assert.deepEqual(faceFlags([unsure, same], true), []); // light fixed after the reframe ask: no flag
const crowd = faceFlags([same, { ...same, people: 2 }], true);
assert.equal(crowd.length, 1);
assert.equal(crowd[0].field, 'face_others');
assert.equal(crowd[0].severity, 'medium');

// Face recognition thresholds: the code decides on the descriptor distance
assert.equal(matchVerdict(0.38).verdict, 'same');
assert.equal(matchVerdict(0.6).verdict, 'unsure');
assert.equal(matchVerdict(0.72).verdict, 'different');
assert.match(matchVerdict(0.38).reason, /distance 0\.38/);

// One "different" among matches is noise, not an impostor
assert.equal(faceFlags([same, diff, same], true)[0].severity, 'low');
assert.equal(faceFlags([diff], true)[0].severity, 'medium');

// Summary: a mismatch only when most checks were, else the last match, else the last check
assert.equal(faceSummary([same, diff, same]).verdict, 'same');
assert.equal(faceSummary([same, diff, diff]), diff);
assert.equal(faceSummary([unsure, same, unsure]).verdict, 'same');
assert.equal(faceSummary([unsure]), unsure);
assert.equal(faceSummary([]), null);

// Lines use the file's name; Devanagari when the case has one
const lines = faceLines({ name: 'Raj Kumar', hi: { firstName: 'राज' } });
assert.match(lines.who.text, /Raj ji/);
assert.match(lines.who.speech, /राज जी/);
assert.ok(lines.changed.text && lines.reframe.speech);

// Replies to "kya aap khud Raj ji hain, ya aap kaun hain?"
const name = 'Raj Kumar';
for (const yes of ['haan main hi Raj hoon', 'ji haan', 'main Raj Kumar hoon']) assert.equal(confirmReply(yes, name), 'yes', yes);
for (const no of ['nahi main unka beta hoon', 'main Raj ka bhai hoon', 'nahi']) assert.equal(confirmReply(no, name), 'no', no);
assert.equal(confirmReply('kya?', name), null); // unclear: asked once more
assert.ok(speakerIsSomeoneElse('main unka beta hoon, papa bahar gaye hain', name)?.away); // ends the call for later
assert.ok(!speakerIsSomeoneElse('main unka beta hoon', name)?.away); // asked to call the applicant

console.log('check:face ok');
