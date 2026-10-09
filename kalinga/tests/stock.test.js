/* Kalinga — stock.js tests.  node kalinga/tests/stock.test.js */
'use strict';
const assert = require('assert');
const St = require('../js/stock.js');
const rule = (o) => Object.assign({ times: ['08:00'], weekdays: [], everyN: 0, start: '2026-10-09', end: '', prn: false }, o);

const losartan = { dose: { amount: 1, unit: 'tablet' }, stock: { count: 20, packSize: 30, lowDays: 7 } };
// dayFraction
assert.strictEqual(St.dayFraction(rule()), 1);
assert.strictEqual(St.dayFraction(rule({ weekdays: [1, 3, 5] })), 3 / 7);
assert.strictEqual(St.dayFraction(rule({ everyN: 2 })), 0.5);
assert.strictEqual(St.dayFraction(rule({ prn: true, times: [] })), 0);
// perDay: twice a day, plus a half tablet at noon via a schedule dose override
assert.strictEqual(St.perDay(losartan, [{ rule: rule({ times: ['08:00', '20:00'] }) }]), 2);
assert.strictEqual(St.perDay(losartan, [{ rule: rule({ times: ['08:00', '20:00'] }) }, { rule: rule({ times: ['12:00'] }), dose: { amount: 0.5 } }]), 2.5);
assert.strictEqual(St.perDay(losartan, [{ rule: rule(), deleted: true }]), 0, 'deleted schedules use nothing');
// daysLeft / isLow
assert.strictEqual(St.daysLeft(losartan, [{ rule: rule({ times: ['08:00', '20:00'] }) }]), 10);
assert.strictEqual(St.isLow(losartan, [{ rule: rule({ times: ['08:00', '20:00'] }) }]), false);
assert.strictEqual(St.isLow({ dose: losartan.dose, stock: { count: 14, lowDays: 7 } }, [{ rule: rule({ times: ['08:00', '20:00'] }) }]), true, '7 days left = low');
assert.strictEqual(St.isLow({ dose: losartan.dose, stock: { count: 16 } }, [{ rule: rule({ times: ['08:00', '20:00'] }) }]), false, 'default lowDays is 7');
assert.strictEqual(St.daysLeft(losartan, []), Infinity);
assert.strictEqual(St.isLow({ dose: losartan.dose, stock: { count: 0 } }, []), false, 'as-needed with no lowCount never warns');
assert.strictEqual(St.isLow({ dose: losartan.dose, stock: { count: 4, lowCount: 5 } }, []), true, 'as-needed uses lowCount');
// take: halves, never below zero, med untouched
assert.deepStrictEqual(St.take(losartan, 0.5), { count: 19.5, needles: null });
assert.strictEqual(losartan.stock.count, 20);
assert.deepStrictEqual(St.take({ stock: { count: 0.5 } }, 1), { count: 0, needles: null });
// insulin: units and needles
const pen = { dose: { amount: 10, unit: 'units' }, stock: { count: 300 }, insulin: { mode: 'fixed', needles: 2 } };
assert.deepStrictEqual(St.take(pen, 10), { count: 290, needles: 1 });
assert.deepStrictEqual(St.take({ stock: { count: 5 }, insulin: { needles: 0 } }, 4), { count: 1, needles: 0 });
// untracked stock (count null): never low, never changed
const gel = { dose: { amount: 1, unit: 'application' }, stock: { count: null } };
assert.strictEqual(St.tracked(gel), false);
assert.strictEqual(St.tracked(losartan), true);
assert.strictEqual(St.daysLeft(gel, [{ rule: rule() }]), Infinity);
assert.strictEqual(St.isLow(gel, [{ rule: rule() }]), false);
assert.strictEqual(St.isLow({ dose: gel.dose }, [{ rule: rule() }]), false, 'no stock object at all');
assert.deepStrictEqual(St.take(gel, 1), { count: null, needles: null });
assert.strictEqual(St.restock(gel, 2), 2, 'buying some starts tracking');
// restock
assert.strictEqual(St.restock(losartan, 30), 50);

console.log('stock.test.js ok');
