/* Kalinga — schedules keep wall-clock times across a daylight-saving change.
   The Philippines has no DST, but public users may (and OFW caregivers abroad do).
     node kalinga/tests/schedule.dst.test.js */
'use strict';
process.env.TZ = 'America/New_York'; // DST ends Sunday 2026-11-01 at 02:00
const assert = require('assert');
const K = require('../js/schedule.js');
const at = (y, mo, d, h, mi) => new Date(y, mo - 1, d, h || 0, mi || 0).getTime();
const rule = (o) => Object.assign({ times: ['08:00'], weekdays: [], everyN: 0, start: '2026-10-30', end: '', prn: false }, o);

const o = K.occurrences(rule(), at(2026, 10, 31), at(2026, 11, 3));
assert.deepStrictEqual(o.map((t) => new Date(t).getHours()), [8, 8, 8], 'still 8:00 every day');
assert.strictEqual(o[1] - o[0], 25 * 3600000, 'the DST day is 25 hours long');
// every other day counts calendar days, not 24-hour blocks
const e = K.occurrences(rule({ everyN: 2 }), at(2026, 10, 30), at(2026, 11, 6));
assert.deepStrictEqual(e.map(K.dayKey), ['2026-10-30', '2026-11-01', '2026-11-03', '2026-11-05']);
assert.strictEqual(K.slotKey('p', o[1]), 'p@2026-11-01T08:00');

console.log('schedule.dst.test.js ok');
