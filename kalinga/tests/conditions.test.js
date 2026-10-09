/* Kalinga — conditions.js tests.  node kalinga/tests/conditions.test.js */
'use strict';
const assert = require('assert');
const V = require('../js/vitals.js');
global.KalingaVitals = V;
const C = require('../js/conditions.js');
const HM = /^([01]\d|2[0-3]):[0-5]\d$/;

// The library covers the common senior conditions, not just diabetes
const keys = C.list().map((c) => c.key);
['hypertension', 'diabetes', 'cholesterol', 'inflammation', 'heart', 'stroke', 'ckd', 'lungs', 'thyroid', 'osteoporosis', 'memory']
  .forEach((k) => assert.ok(keys.includes(k), 'missing ' + k));
assert.strictEqual(new Set(keys).size, keys.length, 'keys are unique');

// Every entry is complete and every suggestion is a valid, saveable vital type
C.list().forEach((c) => {
  assert.ok(c.en && c.tl, c.key + ' names');
  assert.ok(c.purpose.en && c.purpose.tl, c.key + ' purpose');
  const s = C.suggestions(c.key);
  s.track.forEach((v) => {
    assert.strictEqual(V.validateType(v), null, c.key + ' ' + v.name);
    v.logReminders.forEach((t) => assert.match(t, HM, c.key + ' reminder time'));
  });
  s.checkups.forEach((x) => assert.ok(x.en && x.tl && x.everyMonths >= 1 && x.everyMonths % 1 === 0, c.key + ' checkup'));
});

// Suggestions are fresh copies
const a = C.suggestions('hypertension');
a.track[0].high.sys = 999;
assert.strictEqual(C.suggestions('hypertension').track[0].high.sys, 160);
assert.strictEqual(C.suggestions('nope'), null);

// The user's parents: diabetes + hypertension + foot inflammation
const parents = C.combined(['diabetes', 'hypertension', 'inflammation']);
assert.deepStrictEqual(parents.map((v) => v.key + ':' + v.name), ['sugar:Blood sugar', 'bp:Blood pressure', 'symptom:Pain', 'symptom:Swelling']);
assert.deepStrictEqual(parents.find((v) => v.key === 'bp').logReminders, ['07:00']);
assert.strictEqual(parents[2].from, 'inflammation');
// Blood pressure suggested by both hypertension and stroke appears once
assert.strictEqual(C.combined(['hypertension', 'stroke', 'heart']).filter((v) => v.key === 'bp').length, 1);
assert.deepStrictEqual(C.combined(['unknown']), []);

console.log('conditions.test.js ok');
