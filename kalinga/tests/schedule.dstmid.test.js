/* Kalinga — zones where DST starts at midnight (e.g. Beirut, where many OFWs work)
   must not drop the last day of a course or drift the day loop.
     node kalinga/tests/schedule.dstmid.test.js */
'use strict';
process.env.TZ = 'Asia/Beirut'; // DST starts Sunday 2026-03-29 at 00:00
const assert = require('assert');
const K = require('../js/schedule.js');
const at = (y, mo, d, h, mi) => new Date(y, mo - 1, d, h || 0, mi || 0).getTime();
const rule = (o) => Object.assign({ times: ['08:00'], weekdays: [], everyN: 0, start: '2026-03-28', end: '', prn: false }, o);

let o = K.occurrences(rule({ end: '2026-03-31' }), at(2026, 3, 28), at(2026, 4, 3));
assert.deepStrictEqual(o.map(K.dayKey), ['2026-03-28', '2026-03-29', '2026-03-30', '2026-03-31'], 'last day of the course kept');
assert.deepStrictEqual(o.map((t) => new Date(t).getHours()), [8, 8, 8, 8]);
o = K.occurrences(rule({ start: '2026-03-27', end: '2026-04-02', everyN: 2 }), at(2026, 3, 27), at(2026, 4, 5));
assert.deepStrictEqual(o.map(K.dayKey), ['2026-03-27', '2026-03-29', '2026-03-31', '2026-04-02']);
assert.ok(K.activeOn(rule({ end: '2026-03-31' }), K.parseDay('2026-03-31')));

console.log('schedule.dstmid.test.js ok');
