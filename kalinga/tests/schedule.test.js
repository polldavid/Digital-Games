/* Kalinga — schedule.js tests.  node kalinga/tests/schedule.test.js */
'use strict';
process.env.TZ = 'Asia/Manila';
const assert = require('assert');
const K = require('../js/schedule.js');
const { MIN, HOUR, DAY } = K;
const at = (y, mo, d, h, mi) => new Date(y, mo - 1, d, h || 0, mi || 0).getTime();
const rule = (o) => Object.assign({ times: ['08:00'], weekdays: [], everyN: 0, start: '2026-10-09', end: '', prn: false }, o);

// dayKey / parseDay / parseHM
assert.strictEqual(K.dayKey(at(2026, 10, 9, 23, 59)), '2026-10-09');
assert.strictEqual(K.parseDay('2026-10-09'), at(2026, 10, 9));
assert.strictEqual(K.parseDay('2026-02-30'), null);
assert.strictEqual(K.parseDay('9/10/2026'), null);
assert.deepStrictEqual(K.parseHM('08:05'), { h: 8, m: 5 });
assert.strictEqual(K.parseHM('24:00'), null);
assert.strictEqual(K.parseHM('8:00'), null);

// validate
assert.strictEqual(K.validate(rule()), null);
assert.deepStrictEqual(K.validate(rule({ times: [] })), { field: 'times', error: 'no-times' });
assert.strictEqual(K.validate(rule({ times: [], prn: true })), null);
assert.deepStrictEqual(K.validate(rule({ times: ['25:00'] })), { field: 'times', error: 'bad-time' });
assert.deepStrictEqual(K.validate(rule({ times: ['08:00', '08:00'] })), { field: 'times', error: 'duplicate-time' });
assert.deepStrictEqual(K.validate(rule({ weekdays: [7] })), { field: 'weekdays', error: 'bad-weekday' });
assert.deepStrictEqual(K.validate(rule({ everyN: 1.5 })), { field: 'everyN', error: 'bad-every' });
assert.deepStrictEqual(K.validate(rule({ weekdays: [1], everyN: 2 })), { field: 'everyN', error: 'weekdays-and-every' });
assert.deepStrictEqual(K.validate(rule({ start: '' })), { field: 'start', error: 'bad-date' });
assert.deepStrictEqual(K.validate(rule({ end: '2026-10-08' })), { field: 'end', error: 'end-before-start' });
assert.strictEqual(K.validate(rule({ end: '2026-10-09' })), null, 'one-day course is fine');

// occurrences: daily, two times, across 2 days
const fri = at(2026, 10, 9); // Friday
let o = K.occurrences(rule({ times: ['20:00', '08:00'] }), fri, fri + 2 * DAY);
assert.deepStrictEqual(o, [at(2026, 10, 9, 8), at(2026, 10, 9, 20), at(2026, 10, 10, 8), at(2026, 10, 10, 20)]);
// window edges: from is inclusive, to is exclusive
o = K.occurrences(rule(), at(2026, 10, 9, 8), at(2026, 10, 10, 8));
assert.deepStrictEqual(o, [at(2026, 10, 9, 8)]);
// nothing before start, nothing after end
o = K.occurrences(rule({ start: '2026-10-10', end: '2026-10-11' }), fri, fri + 5 * DAY);
assert.deepStrictEqual(o, [at(2026, 10, 10, 8), at(2026, 10, 11, 8)]);
// weekdays: Mon/Wed/Fri
o = K.occurrences(rule({ weekdays: [1, 3, 5] }), fri, fri + 7 * DAY);
assert.deepStrictEqual(o.map(K.dayKey), ['2026-10-09', '2026-10-12', '2026-10-14']);
// every other day, counted from start (not from the window)
o = K.occurrences(rule({ everyN: 2 }), at(2026, 10, 10), at(2026, 10, 15));
assert.deepStrictEqual(o.map(K.dayKey), ['2026-10-11', '2026-10-13']);
// prn and invalid rules never ring
assert.deepStrictEqual(K.occurrences(rule({ prn: true }), fri, fri + DAY), []);
assert.deepStrictEqual(K.occurrences(rule({ times: ['99:99'] }), fri, fri + DAY), []);

// slots: meds at the same minute ring together; other elders, inactive and deleted meds are ignored
const meds = [
  { id: 'm1', elderId: 'papa' }, { id: 'm2', elderId: 'papa' }, { id: 'm3', elderId: 'papa', active: false },
  { id: 'm4', elderId: 'mama' }, { id: 'm5', elderId: 'papa', deleted: true }
];
const scheds = [
  { id: 's1', medId: 'm1', rule: rule({ times: ['08:00', '20:00'] }) },
  { id: 's2', medId: 'm2', rule: rule({ times: ['08:00'] }) },
  { id: 's3', medId: 'm3', rule: rule() }, { id: 's4', medId: 'm4', rule: rule() }, { id: 's5', medId: 'm5', rule: rule() },
  { id: 's6', medId: 'm2', rule: rule({ times: ['13:00'] }), deleted: true }
];
const sl = K.slots('papa', meds, scheds, fri, fri + DAY);
assert.strictEqual(sl.length, 2);
assert.strictEqual(sl[0].at, at(2026, 10, 9, 8));
assert.strictEqual(sl[0].slotKey, 'papa@2026-10-09T08:00');
assert.deepStrictEqual(sl[0].items, [{ medId: 'm1', scheduleId: 's1' }, { medId: 'm2', scheduleId: 's2' }]);
assert.deepStrictEqual(sl[1].items, [{ medId: 'm1', scheduleId: 's1' }]);

// partOfDay
assert.strictEqual(K.partOfDay(at(2026, 10, 9, 8)), 'morning');
assert.strictEqual(K.partOfDay(at(2026, 10, 9, 12)), 'noon');
assert.strictEqual(K.partOfDay(at(2026, 10, 9, 16)), 'afternoon');
assert.strictEqual(K.partOfDay(at(2026, 10, 9, 21)), 'evening');
assert.strictEqual(K.partOfDay(at(2026, 10, 9, 2)), 'evening');

// rings and cutoff (defaults +10, +20, unconfirmed at +30)
const t8 = at(2026, 10, 9, 8);
assert.deepStrictEqual(K.rings(t8), [t8, t8 + 10 * MIN, t8 + 20 * MIN]);
assert.deepStrictEqual(K.rings(t8, { rerings: [5] }), [t8, t8 + 5 * MIN]);
assert.strictEqual(K.cutoff(t8), t8 + 30 * MIN);
assert.strictEqual(K.cutoff(t8, { cutoffMin: 45 }), t8 + 45 * MIN);

// prnAllowed: 4-hour gap, max 3 a day (rolling 24 h)
const pain = { prn: { minGapMin: 240, maxPerDay: 3 } };
assert.deepStrictEqual(K.prnAllowed(pain, [], t8), { ok: true });
assert.deepStrictEqual(K.prnAllowed(pain, [t8 - 2 * HOUR], t8), { ok: false, reason: 'gap', nextAt: t8 + 2 * HOUR });
assert.deepStrictEqual(K.prnAllowed(pain, [t8 - 4 * HOUR], t8), { ok: true }, 'exactly the gap is allowed');
const three = [t8 - 20 * HOUR, t8 - 12 * HOUR, t8 - 5 * HOUR];
assert.deepStrictEqual(K.prnAllowed(pain, three, t8), { ok: false, reason: 'max', nextAt: t8 - 20 * HOUR + DAY });
assert.deepStrictEqual(K.prnAllowed(pain, three, t8 + 4 * HOUR + 1), { ok: true }, 'oldest dose has dropped out of 24 h');
assert.deepStrictEqual(K.prnAllowed({ prn: {} }, three, t8), { ok: true }, 'no limits given, none invented');
assert.deepStrictEqual(K.prnAllowed(pain, [t8 + HOUR], t8), { ok: true }, 'future-dated doses are ignored');

console.log('schedule.test.js ok');
