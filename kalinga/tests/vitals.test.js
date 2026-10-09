/* Kalinga — vitals.js tests.  node kalinga/tests/vitals.test.js */
'use strict';
process.env.TZ = 'Asia/Manila';
const assert = require('assert');
const V = require('../js/vitals.js');
const at = (y, mo, d, h, mi) => new Date(y, mo - 1, d, h || 0, mi || 0).getTime();
const HOUR = 3600000, DAY = 24 * HOUR;

// templates are fresh copies and valid
const sugar = V.template('sugar'), bp = V.template('bp');
sugar.high = 999;
assert.strictEqual(V.template('sugar').high, 300, 'template is a copy');
Object.keys(V.TEMPLATES).forEach((k) => assert.strictEqual(V.validateType(V.template(k)), null, k));
assert.strictEqual(V.template('nope'), null);
const foot = V.template('symptom', { name: 'Paa ko', bodyPart: 'feet' });
assert.strictEqual(foot.name, 'Paa ko');
assert.strictEqual(V.validateType(foot), null);

// validateType rejects bad input
assert.deepStrictEqual(V.validateType(V.template('custom')), { field: 'name', error: 'no-name' });
assert.deepStrictEqual(V.validateType(V.template('custom', { name: 'Steps' })), { field: 'unit', error: 'no-unit' });
assert.deepStrictEqual(V.validateType(V.template('sugar', { low: 200, high: 100 })), { field: 'high', error: 'low-above-high' });
assert.deepStrictEqual(V.validateType(V.template('bp', { low: { sys: 170, dia: 60 } })), { field: 'high', error: 'low-above-high' });
assert.deepStrictEqual(V.validateType(V.template('sugar', { danger: [{ when: 'under', value: 60, card: 'x' }] })), { field: 'danger', error: 'bad-danger' });
assert.deepStrictEqual(V.validateType(V.template('sugar', { danger: [{ when: 'below', value: 60 }] })), { field: 'danger', error: 'no-card' });
assert.deepStrictEqual(V.validateType(V.template('symptom', { high: 6 })), { field: 'high', error: 'bad-level' });
assert.deepStrictEqual(V.validateType({ kind: 'text', name: 'x' }), { field: 'kind', error: 'bad-kind' });

// plausible
const S = V.template('sugar'), B = V.template('bp'), F = V.template('symptom');
assert.ok(V.plausible(S, 185));
assert.ok(!V.plausible(S, 1850), 'misheard extra digit');
assert.ok(!V.plausible(S, 5));
assert.ok(V.plausible(B, { sys: 130, dia: 80 }));
assert.ok(!V.plausible(B, { sys: 80, dia: 130 }), 'swapped numbers');
assert.ok(V.plausible(B, { sys: 130, dia: 80, pulse: 72 }));
assert.ok(!V.plausible(B, { sys: 130, dia: 80, pulse: 7 }));
assert.ok(V.plausible(F, 3) && !V.plausible(F, 0) && !V.plausible(F, 2.5));
assert.ok(V.plausible(V.template('custom', { name: 'Steps', unit: 'steps' }), 4000));

// verdict: sugar
assert.deepStrictEqual(V.verdict(S, 120), { level: 'ok', danger: null, alert: false });
assert.strictEqual(V.verdict(S, 300).alert, false, 'at the high level is not above it');
assert.strictEqual(V.verdict(S, 301).level, 'high');
assert.strictEqual(V.verdict(S, 69).level, 'danger');
assert.strictEqual(V.verdict(S, 69).danger.card, 'low-sugar');
assert.strictEqual(V.verdict(S, 70).alert, false);
// verdict: blood pressure (either number counts)
assert.strictEqual(V.verdict(B, { sys: 130, dia: 80 }).level, 'ok');
assert.strictEqual(V.verdict(B, { sys: 165, dia: 85 }).level, 'high');
assert.strictEqual(V.verdict(B, { sys: 150, dia: 105 }).level, 'high');
assert.strictEqual(V.verdict(B, { sys: 85, dia: 70 }).level, 'low');
assert.strictEqual(V.verdict(B, { sys: 182, dia: 95 }).danger.card, 'bp-crisis');
assert.strictEqual(V.verdict(B, { sys: 150, dia: 120 }).level, 'danger');
// verdict: oxygen and faces
assert.strictEqual(V.verdict(V.template('spo2'), 91).level, 'low');
assert.strictEqual(V.verdict(V.template('spo2'), 89).level, 'danger');
assert.strictEqual(V.verdict(F, 3).level, 'ok');
assert.strictEqual(V.verdict(F, 4).level, 'high');
// weight has no levels: always ok
assert.strictEqual(V.verdict(V.template('weight'), 300).level, 'ok');

// guessContext
assert.strictEqual(V.guessContext(S, at(2026, 10, 9, 6, 30)), 'fasting');
assert.strictEqual(V.guessContext(S, at(2026, 10, 9, 12)), 'before-meal');
assert.strictEqual(V.guessContext(S, at(2026, 10, 9, 22)), 'bedtime');
assert.strictEqual(V.guessContext(B, at(2026, 10, 9, 6)), 'resting', 'falls back to the first context');
assert.strictEqual(V.guessContext(V.template('weight'), at(2026, 10, 9, 6)), '');

// badStreak / streakAlert: worst reading of each day, consecutive days ending today
const now = at(2026, 10, 9, 19);
const r = (d, h, value) => ({ at: at(2026, 10, d, h), value });
const feet = [r(6, 9, 5), r(7, 9, 4), r(8, 8, 2), r(8, 20, 4), r(9, 9, 5)];
assert.strictEqual(V.badStreak(F, feet, now), 4);
assert.ok(V.streakAlert(F, feet, now));
assert.strictEqual(V.badStreak(F, [r(7, 9, 5), r(9, 9, 5)], now), 1, 'a missing day breaks the streak');
assert.strictEqual(V.badStreak(F, [r(8, 9, 5)], now), 0, 'must end today');
assert.strictEqual(V.badStreak(F, [r(9, 9, 5), Object.assign(r(8, 9, 5), { deleted: true })], now), 1, 'deleted readings ignored');
assert.ok(!V.streakAlert(F, [r(8, 9, 5), r(9, 9, 5)], now), 'two days < streakDays 3');
assert.ok(!V.streakAlert(S, [r(7, 9, 400), r(8, 9, 400), r(9, 9, 400)], now), 'streaks are for face check-ins only');

// mmol/L
assert.strictEqual(V.mmolToMgdl(10.3), 185);
assert.strictEqual(V.mgdlToMmol(185), 10.3);

// Review I11: outside the target range is said ("Medyo mataas") but is not an alert
assert.deepStrictEqual(V.verdict(S, 250), { level: 'above-target', danger: null, alert: false });
assert.strictEqual(V.verdict(S, 75).level, 'below-target');
assert.strictEqual(V.verdict(S, 120).level, 'ok');
assert.strictEqual(V.verdict(B, { sys: 150, dia: 95 }).level, 'above-target');
assert.strictEqual(V.verdict(B, { sys: 130, dia: 80 }).level, 'ok');
assert.strictEqual(V.verdict(B, { sys: 165, dia: 85 }).level, 'high', 'alert levels still win');
assert.deepStrictEqual(V.validateType(V.template('sugar', { target: { low: 200, high: 100 } })), { field: 'target', error: 'low-above-high' });
assert.deepStrictEqual(V.validateType(V.template('bp', { target: { high: { sys: 'x' } } })), { field: 'target', error: 'bad-level' });

console.log('vitals.test.js ok');
