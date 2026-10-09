/* Kalinga — scale.js tests.  node kalinga/tests/scale.test.js */
'use strict';
const assert = require('assert');
const Sc = require('../js/scale.js');

const meal = { context: 'before-meal', rows: [{ from: 70, to: 150, units: 0 }, { from: 151, to: 200, units: 4 }, { from: 201, to: 250, units: 6 }, { from: 251, to: 300, units: 8 }] };
const bed = { context: 'bedtime', rows: [{ from: 70, to: 200, units: 0 }, { from: 201, to: 300, units: 2 }] };
const any = { context: 'any', rows: [{ from: 70, to: 300, units: 1 }] };

// validate
assert.strictEqual(Sc.validate(meal), null);
assert.deepStrictEqual(Sc.validate({ rows: [] }), { row: -1, error: 'empty' });
assert.deepStrictEqual(Sc.validate({ rows: [{ from: 200, to: 150, units: 2 }] }), { row: 0, error: 'range' });
assert.deepStrictEqual(Sc.validate({ rows: [{ from: 70.5, to: 150, units: 2 }] }), { row: 0, error: 'range' });
assert.deepStrictEqual(Sc.validate({ rows: [{ from: 70, to: 150, units: -1 }] }), { row: 0, error: 'units' });
assert.deepStrictEqual(Sc.validate({ rows: [{ from: 70, to: 150, units: 2.25 }] }), { row: 0, error: 'units' });
assert.strictEqual(Sc.validate({ rows: [{ from: 70, to: 150, units: 2.5 }] }), null, 'half units are fine');
assert.deepStrictEqual(Sc.validate({ rows: [{ from: 151, to: 200, units: 4 }, { from: 70, to: 150, units: 0 }] }), { row: 1, error: 'order' });
assert.deepStrictEqual(Sc.validate({ rows: [{ from: 70, to: 150, units: 0 }, { from: 150, to: 200, units: 4 }] }), { row: 1, error: 'overlap' });
assert.deepStrictEqual(Sc.validate({ rows: [{ from: 70, to: 150, units: 0 }, { from: 160, to: 200, units: 4 }] }), { row: 1, error: 'gap' });

// lookup: boundaries are inclusive on both ends
const charts = [meal, bed];
assert.strictEqual(Sc.lookup(charts, 151, 'before-meal').row.units, 4);
assert.strictEqual(Sc.lookup(charts, 150, 'before-meal').row.units, 0);
assert.strictEqual(Sc.lookup(charts, 200, 'before-meal').row.units, 4);
assert.strictEqual(Sc.lookup(charts, 185, 'before-meal').index, 1);
assert.strictEqual(Sc.lookup(charts, 200.4, 'before-meal').row.units, 4, 'rounded to whole mg/dL');
// context picks the right chart
assert.strictEqual(Sc.lookup(charts, 250, 'bedtime').row.units, 2);
assert.strictEqual(Sc.lookup(charts, 250, 'before-meal').row.units, 6);
// outside the chart: no units at all
assert.deepStrictEqual(Sc.lookup(charts, 320, 'before-meal'), { outside: true, chart: meal });
assert.deepStrictEqual(Sc.lookup(charts, 60, 'before-meal'), { outside: true, chart: meal });
assert.deepStrictEqual(Sc.lookup(charts, NaN, 'before-meal'), { outside: true, chart: meal });
// a fasting reading uses the before-meal chart (fasting = before breakfast)
assert.strictEqual(Sc.lookup(charts, 185, 'fasting').row.units, 4);
// no chart for this context and no 'any' chart
assert.deepStrictEqual(Sc.lookup(charts, 185, 'after-meal'), { noChart: true });
// falls back to the 'any' chart
assert.strictEqual(Sc.lookup([meal, any], 185, 'after-meal').row.units, 1);
// an invalid chart is never used
assert.deepStrictEqual(Sc.lookup([{ context: 'any', rows: [{ from: 70, to: 150, units: 0 }, { from: 140, to: 200, units: 4 }] }], 145, 'any'), { noChart: true });

// Review C1: a fasting reading uses the before-meal chart, never silently the 'any' chart
const anyLow = { context: 'any', rows: [{ from: 70, to: 300, units: 2 }] };
const bm = { context: 'before-meal', rows: [{ from: 70, to: 300, units: 6 }] };
assert.strictEqual(Sc.lookup([anyLow, bm], 185, 'fasting').row.units, 6);
assert.strictEqual(Sc.lookup([bm], 185, 'fasting').row.units, 6);
assert.deepStrictEqual(Sc.CONTEXTS, ['any', 'fasting', 'before-meal', 'after-meal', 'bedtime']);
assert.deepStrictEqual(Sc.validate({ context: 'lunch', rows: bm.rows }), { row: -1, error: 'context' });
// Review I5: duplicate contexts refused; an invalid exact-context chart never falls back to 'any'
assert.deepStrictEqual(Sc.validateSet([anyLow, anyLow]), { chart: 1, error: 'duplicate-context' });
assert.strictEqual(Sc.validateSet([anyLow, bm]), null);
assert.deepStrictEqual(Sc.validateSet([]), { chart: -1, error: 'no-chart' });
assert.deepStrictEqual(Sc.validateSet([{ context: 'any', rows: [] }]), { chart: 0, error: 'empty', row: -1 });
assert.deepStrictEqual(Sc.lookup([anyLow, { context: 'bedtime', rows: [{ from: 70, to: 150, units: 0 }, { from: 140, to: 300, units: 4 }] }], 200, 'bedtime'), { noChart: true });

console.log('scale.test.js ok');
