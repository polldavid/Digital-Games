# Kalinga 1A — Core Logic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Kalinga's DOM-free core — schedules, stock, sliding-scale lookup, vitals, voice-number parsing, the conditions library and the data store — fully unit-tested, so the web app (plan 1B), Android alarms (1C) and sync (1D) all build on rules that are already proven.

**Architecture:** Seven plain ES5 modules in `kalinga/js/`. Each is an IIFE that exports with `module.exports` under Node and as a `window.Kalinga*` global in the browser (the Alaga pattern, see repo `CLAUDE.md`). They have no DOM and no network access. `store.js` is the only stateful one; it takes an injected storage and clock so tests can simulate phones and times. Tests are plain Node scripts using `assert`, with no framework and no npm install.

**Tech Stack:** Vanilla ES5 JavaScript, Node 24 (tests only), `assert`, `vm` (browser-globals check).

**Spec:** `kalinga/docs/superpowers/specs/2026-10-09-kalinga-design.md` (§3.3–3.5, §4.2–4.4, §4.7, §5, §6.1, §6.5, §8). The roadmap for all of Phase 1 is in `kalinga/docs/superpowers/plans/2026-10-09-kalinga-phase1-roadmap.md`.

## Global Constraints

- Plain HTML/CSS and **ES5** vanilla JS: `var`, IIFEs, `function` expressions. No `let`/`const`/arrow functions in `kalinga/js/` (tests may use modern Node syntax). No build step, no bundler, no framework, **no runtime npm dependencies**.
- Pure modules use dual export: `if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.KalingaX = api;`, wrapped in `(function (root) { … })(this);`.
- Browser load order: `schedule.js, stock.js, scale.js, vitals.js, conditions.js, speechnum.js, store.js`.
- Canonical units: **mg/dL, mmHg, kg, °C, bpm, %, epoch ms**. Times are the phone's local time (Asia/Manila for the first users).
- **The app never calculates, suggests or changes a dose.** The sliding scale is a lookup of the caregiver's chart only. A chart is saved only when valid **and** `insulin.chartConfirmed === true`. As-needed limits are copied from the label, never invented.
- Deletes are **tombstones** (`deleted: true`), never removals from the array.
- Error results are codes (`{ field, error: 'no-times' }`); plan 1B translates them to Taglish/English.
- Alert defaults (all editable per elder): re-ring at **+10 and +20 min**, unconfirmed at **+30**; sugar low **70** / high **300** mg/dL; BP danger **≥180 or ≥120**; low stock at **7 days** left.
- Storage key `kalinga-v1`, generation key `kalinga-gen`.
- Tests never call any network service.
- Commits end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Commit to `main` locally; **do not push** (the user approves pushes).

## Review Focus

1. **A phone in a daylight-saving timezone** (public users, OFW caregivers abroad): an 08:00 dose must stay at 08:00 local on the DST day, and "every other day" must count calendar days. *Test: Task 1 `schedule.dst.test.js`.*
2. **Punctuation and hyphens from speech engines** ("185.", "one-eighty-five", "Sugar: 185!"): must still parse as one number. *Test: Task 5 corpus.*
3. **Untracked stock** (a cream nobody counts): must never show "running low" and must not start counting from 0 by itself. *Test: Task 2 and Task 7.*
4. **A stale second copy of the app** (two tabs or an old WebView) must not overwrite newer data. It refuses to save and reports a conflict. *Test: Task 7 "one active copy".*
5. **Confirming the same dose twice, or changing taken → skipped**: stock is taken once and given back on undo. *Test: Task 7 "doses and stock".*

---

## File Structure

| File | Responsibility |
|---|---|
| `kalinga/js/schedule.js` | Rule validation, due times, grouping into slots, part-of-day, re-ring/cutoff times, as-needed limits |
| `kalinga/js/stock.js` | Daily use, days left, low-stock check, dose and purchase arithmetic (halves, insulin units, needles) |
| `kalinga/js/scale.js` | Sliding-scale chart validation and lookup (display only) |
| `kalinga/js/vitals.js` | Vital and symptom templates, validation, plausibility, verdicts, danger cards, context guess, bad-day streaks, mmol/L |
| `kalinga/js/speechnum.js` | English, Tagalog and Taglish spoken numbers and BP pairs → numbers |
| `kalinga/js/conditions.js` | Library of common senior conditions → suggested tracking, checkups and purpose labels |
| `kalinga/js/store.js` | State, persistence, generation guard, tombstones, change log, domain operations (saveMed, recordDose, timeline…) |
| `kalinga/tests/*.test.js` | One plain-Node test script per module |
| `kalinga/tests/run.js` | Runs every test, then loads the modules as browser scripts to check the globals |
| `kalinga/README.md` | What Kalinga is, how to run the tests, links to the spec and plans |
| `CLAUDE.md` (repo root) | Short Kalinga section so future sessions know the conventions |

---

### Task 1: Schedule engine

**Files:**
- Create: `kalinga/js/schedule.js`
- Test: `kalinga/tests/schedule.test.js`, `kalinga/tests/schedule.dst.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces (`KalingaSchedule`):
  - Constants `MIN`, `HOUR`, `DAY`.
  - `dayKey(ms) -> 'YYYY-MM-DD'`, `parseDay(str) -> ms|null`, `parseHM('08:00') -> {h,m}|null`, `startOfDay(ms)`, `addDays(ms, n)`.
  - `validate(rule) -> null | {field, error}`. Error codes: `missing, no-times, bad-time, duplicate-time, bad-weekday, bad-every, weekdays-and-every, bad-date, end-before-start`.
  - `activeOn(rule, midnightMs) -> bool`, `occurrences(rule, from, to) -> [ms]`.
  - `slots(elderId, meds, schedules, from, to) -> [{at, slotKey, items:[{medId, scheduleId}]}]`.
  - `slotKey(elderId, ms) -> '<elderId>@YYYY-MM-DDTHH:MM'`.
  - `partOfDay(ms) -> 'morning'|'noon'|'afternoon'|'evening'`.
  - `rings(at, alerts) -> [ms]`, `cutoff(at, alerts) -> ms` (alerts `{rerings:[10,20], cutoffMin:30}`).
  - `prnAllowed(med, takenTimes, now) -> {ok:true} | {ok:false, reason:'gap'|'max', nextAt}`.
- Rule shape: `{ times:['HH:MM'], weekdays:[0-6], everyN:0, start:'YYYY-MM-DD', end:'', prn:false }`.

- [ ] **Step 1: Write the failing tests**

Create `kalinga/tests/schedule.test.js`:

```js
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
```

Create `kalinga/tests/schedule.dst.test.js`:

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node kalinga/tests/schedule.test.js`
Expected: FAIL with `Cannot find module '../js/schedule.js'`

- [ ] **Step 3: Write the implementation**

Create `kalinga/js/schedule.js`:

```js
/* =========================================================
   Kalinga — schedule.js
   When medicines are due. No DOM, no storage.

   A schedule rule (one per Schedule record):
     { times: ['08:00', '20:00'],  // local HH:MM, empty only when prn
       weekdays: [],               // 0=Sun..6=Sat; empty = every day
       everyN: 0,                  // 0 or 1 = every day; 2 = every other day (counted from start)
       start: '2026-10-09',        // first day, local YYYY-MM-DD
       end: '',                    // last day (inclusive), '' = no end
       prn: false }                // as needed: never scheduled
   Times are the phone's local time (Asia/Manila for the first users).
   ========================================================= */
(function (root) {
  'use strict';

  var MIN = 60000, HOUR = 60 * MIN, DAY = 24 * HOUR;

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dayKey(t) { var d = new Date(t); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseDay(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    if (!m) return null;
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    return d.getMonth() === +m[2] - 1 ? d.getTime() : null;
  }
  function parseHM(s) {
    var m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(s || '');
    return m ? { h: +m[1], m: +m[2] } : null;
  }
  function startOfDay(t) { var d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }
  function addDays(t, n) { var d = new Date(t); d.setDate(d.getDate() + n); return d.getTime(); }
  // Whole calendar days from a to b (both local midnights), safe across DST.
  function daysBetween(a, b) { return Math.round((b - a) / DAY); }

  // null when fine, else { field, error } (error is a code the UI translates).
  function validate(rule) {
    if (!rule) return { field: 'rule', error: 'missing' };
    if (!rule.prn) {
      if (!rule.times || !rule.times.length) return { field: 'times', error: 'no-times' };
      for (var i = 0; i < rule.times.length; i++) if (!parseHM(rule.times[i])) return { field: 'times', error: 'bad-time' };
      var seen = {};
      for (var j = 0; j < rule.times.length; j++) { if (seen[rule.times[j]]) return { field: 'times', error: 'duplicate-time' }; seen[rule.times[j]] = 1; }
    }
    var wd = rule.weekdays || [];
    for (var k = 0; k < wd.length; k++) if (!(wd[k] >= 0 && wd[k] <= 6 && wd[k] % 1 === 0)) return { field: 'weekdays', error: 'bad-weekday' };
    var n = rule.everyN || 0;
    if (!(n >= 0 && n % 1 === 0 && n <= 90)) return { field: 'everyN', error: 'bad-every' };
    if (wd.length && n > 1) return { field: 'everyN', error: 'weekdays-and-every' };
    if (parseDay(rule.start) == null) return { field: 'start', error: 'bad-date' };
    if (rule.end) {
      if (parseDay(rule.end) == null) return { field: 'end', error: 'bad-date' };
      if (parseDay(rule.end) < parseDay(rule.start)) return { field: 'end', error: 'end-before-start' };
    }
    return null;
  }

  // Is the rule active on the local day starting at `day` (a midnight)?
  function activeOn(rule, day) {
    if (rule.prn) return false;
    var s = parseDay(rule.start);
    if (s == null || day < s) return false;
    if (rule.end && day > parseDay(rule.end)) return false;
    var wd = rule.weekdays || [];
    if (wd.length && wd.indexOf(new Date(day).getDay()) < 0) return false;
    var n = rule.everyN || 0;
    if (n > 1 && daysBetween(s, day) % n !== 0) return false;
    return true;
  }

  // Every due time (ms) of one rule in [from, to), sorted.
  function occurrences(rule, from, to) {
    var out = [];
    if (!rule || rule.prn || validate(rule)) return out;
    for (var day = startOfDay(from); day < to; day = addDays(day, 1)) {
      if (!activeOn(rule, day)) continue;
      rule.times.forEach(function (hm) {
        var p = parseHM(hm), d = new Date(day);
        d.setHours(p.h, p.m, 0, 0);
        var t = d.getTime();
        if (t >= from && t < to) out.push(t);
      });
    }
    return out.sort(function (a, b) { return a - b; });
  }

  // Groups every dose due in [from, to) for one elder into slots — all the
  // medicines due at the same minute ring together.
  //   meds:      [{ id, elderId, active }]
  //   schedules: [{ id, medId, rule, dose? }]
  // -> [{ at, slotKey, items: [{ medId, scheduleId }] }] sorted by time.
  function slots(elderId, meds, schedules, from, to) {
    var byMed = {}, groups = {};
    meds.forEach(function (m) { if (m.elderId === elderId && m.active !== false && !m.deleted) byMed[m.id] = m; });
    schedules.forEach(function (s) {
      if (s.deleted || !byMed[s.medId]) return;
      occurrences(s.rule, from, to).forEach(function (t) {
        var key = slotKey(elderId, t);
        var g = groups[key] = groups[key] || { at: t, slotKey: key, items: [] };
        g.items.push({ medId: s.medId, scheduleId: s.id });
      });
    });
    return Object.keys(groups).map(function (k) { return groups[k]; }).sort(function (a, b) { return a.at - b.at; });
  }

  function slotKey(elderId, t) { var d = new Date(t); return elderId + '@' + dayKey(t) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }

  // Part of the day, for the alarm title ("8:00 — Umaga"). The UI translates the key.
  function partOfDay(t) {
    var h = new Date(t).getHours();
    if (h >= 4 && h < 11) return 'morning';
    if (h >= 11 && h < 14) return 'noon';
    if (h >= 14 && h < 18) return 'afternoon';
    return 'evening';
  }

  // When the alarm rings for a slot, and when an unanswered slot counts as unconfirmed.
  //   alerts: { rerings: [10, 20], cutoffMin: 30 } (minutes after the due time)
  function rings(at, alerts) {
    var a = alerts || {}, re = a.rerings || [10, 20];
    return [at].concat(re.map(function (m) { return at + m * MIN; }));
  }
  function cutoff(at, alerts) { return at + ((alerts && alerts.cutoffMin) || 30) * MIN; }

  /* As-needed medicines: may the elder take another dose now?
     med.prn: { minGapMin, maxPerDay } — copied from the label or prescription
     (0 / missing = no limit). taken: times (ms) of earlier doses of this med.
     -> { ok: true } | { ok: false, reason: 'gap', nextAt } | { ok: false, reason: 'max', nextAt } */
  function prnAllowed(med, taken, now) {
    var p = (med && med.prn) || {}, list = taken.filter(function (t) { return t <= now; }).sort(function (a, b) { return a - b; });
    var last = list.length ? list[list.length - 1] : null;
    if (p.minGapMin && last != null && now - last < p.minGapMin * MIN) return { ok: false, reason: 'gap', nextAt: last + p.minGapMin * MIN };
    if (p.maxPerDay) {
      var day = list.filter(function (t) { return t > now - DAY; });
      if (day.length >= p.maxPerDay) return { ok: false, reason: 'max', nextAt: day[day.length - p.maxPerDay] + DAY };
    }
    return { ok: true };
  }

  var api = {
    MIN: MIN, HOUR: HOUR, DAY: DAY,
    dayKey: dayKey, parseDay: parseDay, parseHM: parseHM, startOfDay: startOfDay, addDays: addDays,
    validate: validate, activeOn: activeOn, occurrences: occurrences,
    slots: slots, slotKey: slotKey, partOfDay: partOfDay, rings: rings, cutoff: cutoff,
    prnAllowed: prnAllowed
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KalingaSchedule = api;
})(this);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node kalinga/tests/schedule.test.js && node kalinga/tests/schedule.dst.test.js`
Expected: `schedule.test.js ok` then `schedule.dst.test.js ok`

- [ ] **Step 5: Commit**

```bash
git add kalinga/js/schedule.js kalinga/tests/schedule.test.js kalinga/tests/schedule.dst.test.js
git commit -m "Kalinga: schedule engine (due times, slots, re-rings, as-needed limits)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Stock

**Files:**
- Create: `kalinga/js/stock.js`
- Test: `kalinga/tests/stock.test.js`

**Interfaces:**
- Consumes: the rule shape from Task 1 (it reads `times`, `weekdays`, `everyN` and `prn` directly; no require).
- Produces (`KalingaStock`):
  - `tracked(med) -> bool`: `med.stock.count` is a number. `null` means not tracked.
  - `dayFraction(rule)`, `perDay(med, schedules)`, `daysLeft(med, schedules) -> int|Infinity`, `isLow(med, schedules) -> bool`.
  - `take(med, amount) -> {count|null, needles|null}` (pure; the caller saves it).
  - `restock(med, qty) -> number`.
- Med fields used: `dose {amount, unit}`, `stock {count, packSize, lowDays, lowCount}`, `insulin.needles`. Schedules `{rule, dose?, deleted?}`.

- [ ] **Step 1: Write the failing test**

Create `kalinga/tests/stock.test.js`:

```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node kalinga/tests/stock.test.js`
Expected: FAIL with `Cannot find module '../js/stock.js'`

- [ ] **Step 3: Write the implementation**

Create `kalinga/js/stock.js`:

```js
/* =========================================================
   Kalinga — stock.js
   How much of each medicine is left and when to buy more.
   No DOM, no storage.

   med.dose:  { amount: 1, unit: 'tablet' }   (insulin: unit 'units')
   med.stock: { count: 30, packSize: 30, lowDays: 7 }
              count is in dose units (tablets, units of insulin, ml…);
              halves are allowed. count null = not tracked (e.g. a
              cream nobody counts): never low, never changed.
   med.insulin.needles: count of pen needles (one per injection), optional.
   schedules: [{ rule, dose? }] — dose overrides med.dose for that schedule.
   ========================================================= */
(function (root) {
  'use strict';

  function round2(x) { return Math.round(x * 100) / 100; }

  // How often a rule's day comes round: 1 = every day, 3/7 = three weekdays…
  function dayFraction(rule) {
    if (!rule || rule.prn) return 0;
    var wd = rule.weekdays || [];
    if (wd.length) return wd.length / 7;
    var n = rule.everyN || 0;
    return n > 1 ? 1 / n : 1;
  }

  // Average dose units used per day by the given (non-deleted) schedules.
  function perDay(med, schedules) {
    var total = 0;
    schedules.forEach(function (s) {
      if (s.deleted || !s.rule || s.rule.prn) return;
      var amt = s.dose && s.dose.amount != null ? s.dose.amount : (med.dose && med.dose.amount) || 0;
      total += (s.rule.times || []).length * amt * dayFraction(s.rule);
    });
    return total;
  }

  function tracked(med) { return !!(med.stock && typeof med.stock.count === 'number'); }

  // Days of supply left (Infinity when untracked or nothing is scheduled, e.g. as-needed only).
  function daysLeft(med, schedules) {
    if (!tracked(med)) return Infinity;
    var use = perDay(med, schedules), count = med.stock.count;
    if (!use) return Infinity;
    return Math.floor(count / use);
  }

  // Low when days left is at or under med.stock.lowDays (default 7),
  // or for as-needed medicines when the count is at or under lowCount (default 0 = never).
  function isLow(med, schedules) {
    if (!tracked(med)) return false;
    var st = med.stock, d = daysLeft(med, schedules);
    if (d === Infinity) return st.lowCount ? (st.count || 0) <= st.lowCount : false;
    return d <= (st.lowDays == null ? 7 : st.lowDays);
  }

  // A confirmed dose. Returns the new stock (never below zero) without changing med.
  //   -> { count, needles }  (either is null when not tracked)
  function take(med, amount) {
    var ins = med.insulin || null;
    var needles = ins && ins.needles != null ? Math.max(0, ins.needles - 1) : null;
    return { count: tracked(med) ? Math.max(0, round2(med.stock.count - amount)) : null, needles: needles };
  }

  // A purchase: adds packs * packSize (or a raw quantity) to the count.
  function restock(med, qty) {
    return round2((tracked(med) ? med.stock.count : 0) + qty);
  }

  var api = { tracked: tracked, dayFraction: dayFraction, perDay: perDay, daysLeft: daysLeft, isLow: isLow, take: take, restock: restock };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KalingaStock = api;
})(this);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node kalinga/tests/stock.test.js`
Expected: `stock.test.js ok`

- [ ] **Step 5: Commit**

```bash
git add kalinga/js/stock.js kalinga/tests/stock.test.js
git commit -m "Kalinga: stock arithmetic (days left, low stock, halves, insulin units and needles)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Sliding-scale lookup

**Files:**
- Create: `kalinga/js/scale.js`
- Test: `kalinga/tests/scale.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces (`KalingaScale`):
  - `validate(chart) -> null | {row, error}`. Errors: `empty, range, units, order, overlap, gap`. Units are whole or half, 0–100.
  - `pick(charts, context) -> chart|null`: an exact context match, else the `'any'` chart. Invalid charts are never picked.
  - `lookup(charts, mgdl, context) -> {chart, row, index} | {outside:true, chart} | {noChart:true}`.
- Chart shape: `{ context:'any'|'before-meal'|'bedtime'|…, rows:[{from, to, units}] }`, with inclusive whole-mg/dL ranges.

- [ ] **Step 1: Write the failing test**

Create `kalinga/tests/scale.test.js`:

```js
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
// no chart for this context and no 'any' chart
assert.deepStrictEqual(Sc.lookup(charts, 185, 'fasting'), { noChart: true });
// falls back to the 'any' chart
assert.strictEqual(Sc.lookup([meal, any], 185, 'fasting').row.units, 1);
// an invalid chart is never used
assert.deepStrictEqual(Sc.lookup([{ context: 'any', rows: [{ from: 70, to: 150, units: 0 }, { from: 140, to: 200, units: 4 }] }], 145, 'any'), { noChart: true });

console.log('scale.test.js ok');
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node kalinga/tests/scale.test.js`
Expected: FAIL with `Cannot find module '../js/scale.js'`

- [ ] **Step 3: Write the implementation**

Create `kalinga/js/scale.js`:

```js
/* =========================================================
   Kalinga — scale.js
   Sliding-scale insulin: the doctor's chart, copied in by the
   caregiver, looked up at dose time. No DOM, no storage.

   SAFETY: this module never calculates, suggests or changes a
   dose. It only finds the row of the chart the caregiver typed
   in. A reading outside the chart returns { outside: true } and
   the app must show "call the doctor/family" with no units.

   chart: { context: 'any' | 'before-meal' | 'bedtime' | …,
            rows: [{ from: 151, to: 200, units: 4 }] }  // mg/dL, inclusive
   An insulin may have several charts, one per reading context.
   ========================================================= */
(function (root) {
  'use strict';

  function isInt(x) { return typeof x === 'number' && x % 1 === 0; }

  // null when the chart can be saved, else { row, error }:
  //   'empty' | 'range' (from > to or not whole mg/dL) | 'units' |
  //   'order' (rows not ascending) | 'overlap' | 'gap'
  function validate(chart) {
    var rows = (chart && chart.rows) || [];
    if (!rows.length) return { row: -1, error: 'empty' };
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!isInt(r.from) || !isInt(r.to) || r.from < 0 || r.from > r.to) return { row: i, error: 'range' };
      if (typeof r.units !== 'number' || !(r.units >= 0) || r.units > 100 || (r.units * 2) % 1 !== 0) return { row: i, error: 'units' };
      if (i) {
        var p = rows[i - 1];
        if (r.from < p.from) return { row: i, error: 'order' };
        if (r.from <= p.to) return { row: i, error: 'overlap' };
        if (r.from > p.to + 1) return { row: i, error: 'gap' };
      }
    }
    return null;
  }

  // The chart for this reading's context: an exact match, else the 'any' chart.
  function pick(charts, context) {
    var list = (charts || []).filter(function (c) { return c && !validate(c); });
    for (var i = 0; i < list.length; i++) if (list[i].context === context) return list[i];
    for (var j = 0; j < list.length; j++) if (!list[j].context || list[j].context === 'any') return list[j];
    return null;
  }

  // -> { chart, row, index } | { outside: true, chart } | { noChart: true }
  function lookup(charts, mgdl, context) {
    var c = pick(charts, context);
    if (!c) return { noChart: true };
    if (typeof mgdl !== 'number' || !isFinite(mgdl)) return { outside: true, chart: c };
    var v = Math.round(mgdl);
    for (var i = 0; i < c.rows.length; i++) {
      if (v >= c.rows[i].from && v <= c.rows[i].to) return { chart: c, row: c.rows[i], index: i };
    }
    return { outside: true, chart: c };
  }

  var api = { validate: validate, pick: pick, lookup: lookup };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KalingaScale = api;
})(this);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node kalinga/tests/scale.test.js`
Expected: `scale.test.js ok`

- [ ] **Step 5: Commit**

```bash
git add kalinga/js/scale.js kalinga/tests/scale.test.js
git commit -m "Kalinga: sliding-scale chart validation and lookup (display only, never calculates)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Vitals and symptoms

**Files:**
- Create: `kalinga/js/vitals.js`
- Test: `kalinga/tests/vitals.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces (`KalingaVitals`):
  - `TEMPLATES` (`sugar, bp, weight, pulse, temp, spo2, symptom`) and `RANGE`.
  - `template(key, overrides?) -> VitalType|null` (a fresh copy; `'custom'` is allowed).
  - `validateType(t) -> null|{field, error}`. Errors: `bad-kind, no-name, no-unit, bad-level, low-above-high, bad-danger, no-card, bad-streak`.
  - `plausible(t, value) -> bool`.
  - `verdict(t, value) -> {level:'ok'|'low'|'high'|'danger', danger, alert}`.
  - `guessContext(t, ms) -> string`.
  - `badStreak(t, readings, now) -> int`, `streakAlert(t, readings, now) -> bool`.
  - `mmolToMgdl(x)`, `mgdlToMmol(x)`.
- VitalType shape: see the header comment in the code. Values are a number, `{sys, dia, pulse?}`, or a face 1–5.

- [ ] **Step 1: Write the failing test**

Create `kalinga/tests/vitals.test.js`:

```js
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
assert.strictEqual(V.verdict(S, 300).level, 'ok', 'at the high level is not above it');
assert.strictEqual(V.verdict(S, 301).level, 'high');
assert.strictEqual(V.verdict(S, 69).level, 'danger');
assert.strictEqual(V.verdict(S, 69).danger.card, 'low-sugar');
assert.strictEqual(V.verdict(S, 70).level, 'ok');
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

console.log('vitals.test.js ok');
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node kalinga/tests/vitals.test.js`
Expected: FAIL with `Cannot find module '../js/vitals.js'`

- [ ] **Step 3: Write the implementation**

Create `kalinga/js/vitals.js`:

```js
/* =========================================================
   Kalinga — vitals.js
   What a reading means: alert levels, danger cards, plausible
   values, context guesses and "bad N days in a row" for symptom
   check-ins. No DOM, no storage. Nothing here is diabetes-only:
   every tracked item is a VitalType the caregiver configured.

   VitalType:
     { key: 'sugar'|'bp'|'weight'|'pulse'|'temp'|'spo2'|'symptom'|'custom',
       kind: 'number' | 'pair' | 'face',
       name, unit,
       low, high,          // alert levels: number, or { sys, dia } for 'pair';
                           //   for 'face' only `high` (1–5, alert at or above)
       danger: [{ when: 'below'|'atLeast', value | sys+dia, card }],
       contexts: [],       // e.g. ['fasting', 'before-meal', 'after-meal', 'bedtime']
       streakDays,         // 'face': alert after this many bad days in a row
       bodyPart, pinned, logReminders: [] }
   Canonical units: mg/dL, mmHg, kg, °C, bpm, %. Face scale 1 (best) – 5 (worst).

   Default levels follow mainstream guidance (ADA, AHA, DOH, NHS)
   and are shown as general information; the caregiver can edit them.
   ========================================================= */
(function (root) {
  'use strict';

  var MGDL_PER_MMOL = 18;

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  var TEMPLATES = {
    sugar: { key: 'sugar', kind: 'number', name: 'Blood sugar', unit: 'mg/dL', low: 70, high: 300,
      danger: [{ when: 'below', value: 70, card: 'low-sugar' }], contexts: ['fasting', 'before-meal', 'after-meal', 'bedtime'] },
    bp: { key: 'bp', kind: 'pair', name: 'Blood pressure', unit: 'mmHg', low: { sys: 90, dia: 60 }, high: { sys: 160, dia: 100 },
      danger: [{ when: 'atLeast', sys: 180, dia: 120, card: 'bp-crisis' }], contexts: ['resting'] },
    weight: { key: 'weight', kind: 'number', name: 'Weight', unit: 'kg', low: null, high: null, danger: [], contexts: [] },
    pulse: { key: 'pulse', kind: 'number', name: 'Heart rate', unit: 'bpm', low: 50, high: 110, danger: [], contexts: ['resting'] },
    temp: { key: 'temp', kind: 'number', name: 'Temperature', unit: '°C', low: 35, high: 37.8, danger: [], contexts: [] },
    spo2: { key: 'spo2', kind: 'number', name: 'Oxygen', unit: '%', low: 92, high: null,
      danger: [{ when: 'below', value: 90, card: 'low-oxygen' }], contexts: [] },
    symptom: { key: 'symptom', kind: 'face', name: 'Pain', unit: '', low: null, high: 4, danger: [], contexts: [], streakDays: 3, bodyPart: '' }
  };
  // Plausible values (anything outside is a mishearing or a typo, not a reading).
  var RANGE = {
    sugar: [20, 700], weight: [25, 250], pulse: [30, 220], temp: [32, 43], spo2: [50, 100],
    sys: [60, 260], dia: [30, 160], face: [1, 5]
  };

  // A fresh template to fill in (name may be changed, e.g. symptom "Paa ko").
  function template(key, over) {
    if (!TEMPLATES[key] && key !== 'custom') return null;
    var t = key === 'custom' ? { key: 'custom', kind: 'number', name: '', unit: '', low: null, high: null, danger: [], contexts: [] } : clone(TEMPLATES[key]);
    if (over) for (var k in over) t[k] = over[k];
    return t;
  }

  function num(x) { return typeof x === 'number' && isFinite(x); }
  function pairOk(p) { return p && num(p.sys) && num(p.dia); }

  // null when the type can be saved, else { field, error }.
  function validateType(t) {
    if (!t || ['number', 'pair', 'face'].indexOf(t.kind) < 0) return { field: 'kind', error: 'bad-kind' };
    if (!String(t.name || '').trim()) return { field: 'name', error: 'no-name' };
    if (t.kind === 'face') {
      if (!(t.high >= 2 && t.high <= 5 && t.high % 1 === 0)) return { field: 'high', error: 'bad-level' };
      if (!(t.streakDays >= 1 && t.streakDays <= 14)) return { field: 'streakDays', error: 'bad-streak' };
      return null;
    }
    if (!String(t.unit || '').trim()) return { field: 'unit', error: 'no-unit' };
    if (t.kind === 'number') {
      if (t.low != null && !num(t.low)) return { field: 'low', error: 'bad-level' };
      if (t.high != null && !num(t.high)) return { field: 'high', error: 'bad-level' };
      if (t.low != null && t.high != null && t.low >= t.high) return { field: 'high', error: 'low-above-high' };
    } else {
      if (t.low != null && !pairOk(t.low)) return { field: 'low', error: 'bad-level' };
      if (t.high != null && !pairOk(t.high)) return { field: 'high', error: 'bad-level' };
      if (t.low && t.high && (t.low.sys >= t.high.sys || t.low.dia >= t.high.dia)) return { field: 'high', error: 'low-above-high' };
    }
    var d = t.danger || [];
    for (var i = 0; i < d.length; i++) {
      if (d[i].when !== 'below' && d[i].when !== 'atLeast') return { field: 'danger', error: 'bad-danger' };
      if (t.kind === 'number' ? !num(d[i].value) : !pairOk(d[i])) return { field: 'danger', error: 'bad-danger' };
      if (!d[i].card && !d[i].text) return { field: 'danger', error: 'no-card' };
    }
    return null;
  }

  // Is this a believable value for the type? value: number, { sys, dia, pulse? } or 1–5.
  function plausible(t, v) {
    var inR = function (x, r) { return num(x) && x >= r[0] && x <= r[1]; };
    if (t.kind === 'face') return inR(v, RANGE.face) && v % 1 === 0;
    if (t.kind === 'pair') return !!v && inR(v.sys, RANGE.sys) && inR(v.dia, RANGE.dia) && v.sys > v.dia && (v.pulse == null || inR(v.pulse, RANGE.pulse));
    if (RANGE[t.key]) return inR(v, RANGE[t.key]);
    return num(v);
  }

  function hit(t, d, v) {
    if (t.kind === 'pair') return d.when === 'below' ? (v.sys < d.sys || v.dia < d.dia) : (v.sys >= d.sys || v.dia >= d.dia);
    return d.when === 'below' ? v < d.value : v >= d.value;
  }

  // -> { level: 'ok'|'low'|'high'|'danger', danger: <entry>|null, alert: bool }
  function verdict(t, v) {
    var out = function (level, d) { return { level: level, danger: d || null, alert: level !== 'ok' }; };
    if (t.kind === 'face') return out(v >= (t.high || 4) ? 'high' : 'ok');
    var ds = t.danger || [];
    for (var i = 0; i < ds.length; i++) if (hit(t, ds[i], v)) return out('danger', ds[i]);
    if (t.kind === 'pair') {
      if (t.low && (v.sys < t.low.sys || v.dia < t.low.dia)) return out('low');
      if (t.high && (v.sys > t.high.sys || v.dia > t.high.dia)) return out('high');
      return out('ok');
    }
    if (t.low != null && v < t.low) return out('low');
    if (t.high != null && v > t.high) return out('high');
    return out('ok');
  }

  // The likely context from the time of day; '' when the type has none.
  function guessContext(t, at) {
    var c = t.contexts || [];
    if (!c.length) return '';
    var h = new Date(at).getHours(), g = h < 10 ? 'fasting' : h >= 21 ? 'bedtime' : 'before-meal';
    return c.indexOf(g) >= 0 ? g : c[0];
  }

  function dayKey(t) { var d = new Date(t); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); }
  function prevDay(k) { var d = new Date(Math.floor(k / 10000), Math.floor(k / 100) % 100 - 1, k % 100); d.setDate(d.getDate() - 1); return dayKey(d.getTime()); }

  /* Bad days in a row, ending today: a day is bad when its worst reading
     is at the alert level (face: >= high). readings: [{ value, at }] of this type. */
  function badStreak(t, readings, now) {
    var worst = {};
    readings.forEach(function (r) {
      if (r.deleted || r.at > now) return;
      var k = dayKey(r.at);
      if (worst[k] == null || r.value > worst[k]) worst[k] = r.value;
    });
    var n = 0, k = dayKey(now);
    while (worst[k] != null && verdict(t, worst[k]).alert) { n++; k = prevDay(k); }
    return n;
  }
  function streakAlert(t, readings, now) { return t.kind === 'face' && badStreak(t, readings, now) >= (t.streakDays || 3); }

  function mmolToMgdl(x) { return Math.round(x * MGDL_PER_MMOL); }
  function mgdlToMmol(x) { return Math.round(x / MGDL_PER_MMOL * 10) / 10; }

  var api = {
    TEMPLATES: TEMPLATES, RANGE: RANGE,
    template: template, validateType: validateType, plausible: plausible, verdict: verdict,
    guessContext: guessContext, badStreak: badStreak, streakAlert: streakAlert,
    mmolToMgdl: mmolToMgdl, mgdlToMmol: mgdlToMmol
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KalingaVitals = api;
})(this);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node kalinga/tests/vitals.test.js`
Expected: `vitals.test.js ok`

- [ ] **Step 5: Commit**

```bash
git add kalinga/js/vitals.js kalinga/tests/vitals.test.js
git commit -m "Kalinga: vitals and symptom check-ins (verdicts, danger cards, streaks)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Spoken numbers (English, Tagalog, Taglish)

**Files:**
- Create: `kalinga/js/speechnum.js`
- Test: `kalinga/tests/speechnum.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces (`KalingaSpeech`):
  - `parse(text, 'number') -> number|null` (exactly one number).
  - `parse(text, 'pair') -> {sys, dia, pulse?}|null` (two or three numbers).
  - `numbers(text) -> [number]`.
  - `norm(text) -> string`.
- Range checks are **not** done here; callers use `KalingaVitals.plausible()`.

- [ ] **Step 1: Write the failing test**

Create `kalinga/tests/speechnum.test.js`:

```js
/* Kalinga — speechnum.js tests.  node kalinga/tests/speechnum.test.js */
'use strict';
const assert = require('assert');
const N = require('../js/speechnum.js');
let count = 0;
function num(text, want) {
  const got = N.parse(text, 'number');
  try { assert.strictEqual(got, want); count++; } catch (e) { console.error('✗ number "' + text + '" →', got, 'numbers:', N.numbers(text)); throw e; }
}
function pair(text, want) {
  const got = N.parse(text, 'pair');
  try { assert.deepStrictEqual(got, want); count++; } catch (e) { console.error('✗ pair "' + text + '" →', got, 'numbers:', N.numbers(text)); throw e; }
}

// Digits (what most speech engines return)
num('185', 185);
num('sugar ko 185', 185);
num('185 mg/dL', 185);
num('185mg', 185);
num('185.', 185);
num('one-eighty-five', 185);
num('Sugar: 185!', 185);
num('36.5', 36.5);
num('36 point 5', 36.5);
num('7,2', 7.2);
num('1,850', 1850); // plausible() rejects it later
// English words
num('one hundred eighty five', 185);
num('one hundred and eighty-five', 185);
num('a hundred eighty five', 185);
num('one eighty-five', 185);
num('one eighty five', 185);
num('my sugar is one twenty', 120);
num('one fifteen', 115);
num('one ten', 110);
num('ninety eight', 98);
num('twenty one', 21);
num('five', 5);
num('two hundred', 200);
num('seven point two', 7.2);
num('ninety eight point six', 98.6);
// Tagalog / Taglish
num("isang daan walumpu't lima", 185);
num('isang daan at walumpu t lima', 185);
num('isang daan walumpung lima', 185);
num("sandaan walumpu't lima", 185);
num('dalawang daan', 200);
num('apat na raan', 400);
num("siyamnapu't walo", 98);
num('isang daan labinlima', 115);
num('isang daan labing-lima', 115);
num('labimpito', 17);
num('sampu', 10);
num("asukal ko ay isang daan at tatlumpu't dalawa", 132);
// Not one clear number
num('', null);
num('hello', null);
num('120 130', null);
num('one two three', null);

// Blood pressure pairs (optionally with pulse)
pair('130 over 80', { sys: 130, dia: 80 });
pair('130/80', { sys: 130, dia: 80 });
pair('one thirty over eighty', { sys: 130, dia: 80 });
pair('one forty over ninety', { sys: 140, dia: 90 });
pair('one ten over seventy', { sys: 110, dia: 70 });
pair('isang daan at tatlumpu over walumpu', { sys: 130, dia: 80 });
pair('130 over 80 pulse 72', { sys: 130, dia: 80, pulse: 72 });
pair('130', null);
pair('nothing here', null);
pair('1 2 3 4', null);

console.log('speechnum.test.js ok (' + count + ' phrases)');
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node kalinga/tests/speechnum.test.js`
Expected: FAIL with `Cannot find module '../js/speechnum.js'`

- [ ] **Step 3: Write the implementation**

Create `kalinga/js/speechnum.js`:

```js
/* =========================================================
   Kalinga — speechnum.js
   Turns what an elder said into a reading: "185", "one
   eighty-five", "isang daan walumpu't lima", "130 over 80",
   "seven point two". Pure: no DOM, no speech API. The app always
   reads the result back ("185 — tama ba?") before saving, and
   vitals.plausible() rejects impossible values.

   parse(text, 'number') -> number | null       exactly one number
   parse(text, 'pair')   -> { sys, dia, pulse? } | null   two or three numbers
   numbers(text)         -> every number heard, in order
   ========================================================= */
(function (root) {
  'use strict';

  var ONES = {
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
    isa: 1, dalawa: 2, tatlo: 3, apat: 4, lima: 5, anim: 6, pito: 7, walo: 8, siyam: 9
  };
  var TEENS = {
    ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
    sampu: 10
  };
  var TENS = {
    twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
    dalawampu: 20, tatlumpu: 30, apatnapu: 40, limampu: 50, animnapu: 60, pitumpu: 70, walumpu: 80, siyamnapu: 90
  };
  var HUNDRED = { hundred: 1, daan: 1, raan: 1 };
  // Joining words inside one spoken number ("one hundred AND five", "walumpu'T lima", "apat NA raan").
  var LINK = { and: 1, at: 1, t: 1, ng: 1, na: 1, a: 1 };
  var POINT = { point: 1, punto: 1 };

  // Tagalog words glued to a linker: isang, dalawang, walumpung, walumput…
  function base(w) {
    if (ONES[w] != null || TEENS[w] != null || TENS[w] != null || HUNDRED[w]) return w;
    if (/ng$/.test(w)) { var a = w.slice(0, -2); if (ONES[a] != null || TEENS[a] != null || TENS[a] != null) return a; }
    if (/t$/.test(w)) { var b = w.slice(0, -1); if (TENS[b] != null || ONES[b] != null) return b; }
    return w;
  }

  function norm(text) {
    return String(text || '').toLowerCase()
      .replace(/[’'`]/g, ' ')
      .replace(/(\d),(\d{3})\b/g, '$1$2')     // 1,850 -> 1850
      .replace(/(\d),(\d)/g, '$1.$2')          // 7,2 -> 7.2
      .replace(/(\d)\s*(?:point|punto)\s*(\d)/g, '$1.$2')
      .replace(/\//g, ' over ')
      .replace(/(\d)([a-z])/g, '$1 $2').replace(/([a-z])(\d)/g, '$1 $2')
      // Tagalog teens: labing-isa, labindalawa, labimpito… -> #11..#19
      .replace(/\blabi[nm]g?[\s-]*(isa|dalawa|tatlo|apat|lima|anim|pito|walo|siyam)\b/g, function (m, w) { return ' #' + (10 + ONES[w]) + ' '; })
      .replace(/\bsandaan\b/g, ' isa daan ')
      .replace(/[-,.!?;:](?!\d)/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }

  function numbers(text) {
    var toks = norm(text).split(' '), out = [];
    var cur = 0, last = null, hundred = false, active = false, dec = null;
    function flush() {
      if (active) out.push(dec ? cur + parseFloat('0.' + dec) : cur);
      cur = 0; last = null; hundred = false; active = false; dec = null;
    }
    function start(v, type) { flush(); cur = v; last = type; active = true; }
    toks.forEach(function (raw) {
      if (!raw) return;
      if (/^\d+(\.\d+)?$/.test(raw)) { flush(); out.push(parseFloat(raw)); return; }
      var w = base(raw), n;
      if (dec != null) {
        if (ONES[w] != null) { dec += String(ONES[w]); return; }
        if (w === 'oh') { dec += '0'; return; }
        flush();
      }
      if (POINT[w]) { if (active) dec = ''; return; }
      if (raw.charAt(0) === '#') { n = +raw.slice(1); w = null; }
      if (w && ONES[w] != null) {
        n = ONES[w];
        if (!active || last === 'hundred') { if (!active) start(n, 'ones'); else { cur += n; last = 'ones'; } }
        else if (last === 'tens' && cur % 10 === 0) { cur += n; last = 'ones'; }
        else start(n, 'ones');
        return;
      }
      if (w === null || (w && TEENS[w] != null)) {
        if (w) n = TEENS[w];
        if (active && last === 'ones' && !hundred && cur < 10) { cur = cur * 100 + n; last = 'teen'; }   // "one fifteen" = 115
        else if (!active) start(n, 'teen');
        else if (last === 'hundred') { cur += n; last = 'teen'; }
        else start(n, 'teen');
        return;
      }
      if (TENS[w] != null) {
        n = TENS[w];
        if (active && last === 'ones' && !hundred && cur < 10) { cur = cur * 100 + n; last = 'tens'; hundred = true; } // "one eighty" = 180
        else if (!active) start(n, 'tens');
        else if (last === 'hundred') { cur += n; last = 'tens'; }
        else start(n, 'tens');
        return;
      }
      if (HUNDRED[w]) {
        if (!active) { start(100, 'hundred'); hundred = true; }
        else if (last === 'ones' && !hundred) { cur = cur * 100; last = 'hundred'; hundred = true; }
        else { start(100, 'hundred'); hundred = true; }
        return;
      }
      if (LINK[w] || w === 'oh') return;
      flush(); // any other word ends the number
    });
    flush();
    return out;
  }

  function parse(text, kind) {
    var n = numbers(text);
    if (kind === 'pair') {
      if (n.length !== 2 && n.length !== 3) return null;
      var p = { sys: n[0], dia: n[1] };
      if (n.length === 3) p.pulse = n[2];
      return p;
    }
    return n.length === 1 ? n[0] : null;
  }

  var api = { parse: parse, numbers: numbers, norm: norm };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KalingaSpeech = api;
})(this);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node kalinga/tests/speechnum.test.js`
Expected: `speechnum.test.js ok (51 phrases)`

- [ ] **Step 5: Commit**

```bash
git add kalinga/js/speechnum.js kalinga/tests/speechnum.test.js
git commit -m "Kalinga: spoken-number parser for readings (EN, Tagalog, Taglish, BP pairs)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Conditions library

**Files:**
- Create: `kalinga/js/conditions.js`
- Test: `kalinga/tests/conditions.test.js`

**Interfaces:**
- Consumes: `KalingaVitals.template()` (Task 4), via `require('./vitals.js')` in Node or the global in the browser.
- Produces (`KalingaConditions`):
  - `list() -> [entry]`, `get(key) -> entry|null`.
  - `suggestions(key) -> {track:[VitalType with logReminders], checkups:[{en, tl, everyMonths}], purpose:{en, tl}} | null`.
  - `combined(keys) -> [VitalType with .from]`: deduplicated by vital key, or by symptom name.
- Keys: `hypertension, diabetes, cholesterol, inflammation, heart, stroke, ckd, lungs, thyroid, osteoporosis, memory`.

- [ ] **Step 1: Write the failing test**

Create `kalinga/tests/conditions.test.js`:

```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node kalinga/tests/conditions.test.js`
Expected: FAIL with `Cannot find module '../js/conditions.js'`

- [ ] **Step 3: Write the implementation**

Create `kalinga/js/conditions.js`:

```js
/* =========================================================
   Kalinga — conditions.js
   The library of common senior conditions. Picking one only
   SUGGESTS what to track, which levels to alert on, which
   routine checkups to schedule (Phase 2) and a purpose label
   for medicines. The caregiver ticks or unticks each suggestion;
   nothing is applied silently. Add a condition by adding an
   entry here: no code changes elsewhere.

   Levels come from vitals.js templates (mainstream guidance,
   shown as general information). Checkup intervals are typical
   ones; the elder's doctor decides.
   ========================================================= */
(function (root) {
  'use strict';

  var V = root.KalingaVitals || (typeof require !== 'undefined' ? require('./vitals.js') : null);

  // track: { template, over?, remind?: ['HH:MM'] }   checkups: { en, tl, everyMonths }
  var LIBRARY = [
    { key: 'hypertension', en: 'High blood pressure', tl: 'Altapresyon', purpose: { en: 'for blood pressure', tl: 'para sa altapresyon' },
      track: [{ template: 'bp', remind: ['07:00'] }],
      checkups: [{ en: 'Blood pressure check with doctor', tl: 'Check-up sa altapresyon', everyMonths: 3 }, { en: 'Kidney function (creatinine)', tl: 'Kidney test (creatinine)', everyMonths: 12 }] },
    { key: 'diabetes', en: 'Diabetes (type 2)', tl: 'Diabetes', purpose: { en: 'for blood sugar', tl: 'para sa sugar' },
      track: [{ template: 'sugar', remind: ['06:30'] }],
      checkups: [{ en: 'HbA1c', tl: 'HbA1c', everyMonths: 3 }, { en: 'Eye exam', tl: 'Check-up sa mata', everyMonths: 12 }, { en: 'Foot exam', tl: 'Check-up sa paa', everyMonths: 12 }, { en: 'Kidney function (urine albumin, creatinine)', tl: 'Kidney test', everyMonths: 12 }] },
    { key: 'cholesterol', en: 'High cholesterol', tl: 'Mataas na kolesterol', purpose: { en: 'for cholesterol', tl: 'para sa kolesterol' },
      track: [],
      checkups: [{ en: 'Lipid profile', tl: 'Lipid profile', everyMonths: 12 }] },
    { key: 'inflammation', en: 'Arthritis, gout or joint/foot inflammation', tl: 'Rayuma, gout o pamamaga ng kasu-kasuan/paa', purpose: { en: 'for pain and swelling', tl: 'para sa pananakit at pamamaga' },
      track: [{ template: 'symptom', over: { name: 'Pain', bodyPart: '' }, remind: ['19:00'] }, { template: 'symptom', over: { name: 'Swelling', bodyPart: '' } }],
      checkups: [{ en: 'Uric acid (for gout)', tl: 'Uric acid (para sa gout)', everyMonths: 6 }] },
    { key: 'heart', en: 'Heart disease', tl: 'Sakit sa puso', purpose: { en: 'for the heart', tl: 'para sa puso' },
      track: [{ template: 'bp', remind: ['07:00'] }, { template: 'pulse' }, { template: 'weight', remind: ['07:00'] }, { template: 'symptom', over: { name: 'Breathlessness' } }],
      checkups: [{ en: 'Cardiology check-up', tl: 'Check-up sa cardiologist', everyMonths: 6 }] },
    { key: 'stroke', en: 'After a stroke', tl: 'Pagkatapos ma-stroke', purpose: { en: 'to prevent another stroke', tl: 'para hindi na maulit ang stroke' },
      track: [{ template: 'bp', remind: ['07:00'] }],
      checkups: [{ en: 'Neurology check-up', tl: 'Check-up sa neurologist', everyMonths: 6 }] },
    { key: 'ckd', en: 'Chronic kidney disease', tl: 'Sakit sa bato', purpose: { en: 'for the kidneys', tl: 'para sa bato' },
      track: [{ template: 'bp', remind: ['07:00'] }, { template: 'weight' }],
      checkups: [{ en: 'Kidney function (creatinine, eGFR)', tl: 'Kidney test (creatinine, eGFR)', everyMonths: 3 }] },
    { key: 'lungs', en: 'Asthma or COPD', tl: 'Hika o COPD', purpose: { en: 'for breathing', tl: 'para sa paghinga' },
      track: [{ template: 'symptom', over: { name: 'Breathlessness' } }, { template: 'spo2' }],
      checkups: [{ en: 'Lung check-up', tl: 'Check-up sa baga', everyMonths: 6 }] },
    { key: 'thyroid', en: 'Thyroid problem', tl: 'Problema sa thyroid', purpose: { en: 'for the thyroid', tl: 'para sa thyroid' },
      track: [{ template: 'weight' }],
      checkups: [{ en: 'Thyroid test (TSH)', tl: 'Thyroid test (TSH)', everyMonths: 12 }] },
    { key: 'osteoporosis', en: 'Osteoporosis', tl: 'Osteoporosis (marupok na buto)', purpose: { en: 'for the bones', tl: 'para sa buto' },
      track: [{ template: 'symptom', over: { name: 'Back pain', bodyPart: 'back' } }],
      checkups: [{ en: 'Bone density scan', tl: 'Bone density test', everyMonths: 24 }] },
    { key: 'memory', en: 'Memory problems or dementia', tl: 'Pagkalimot o dementia', purpose: { en: 'for memory', tl: 'para sa memorya' },
      track: [{ template: 'symptom', over: { name: 'Mood' } }, { template: 'symptom', over: { name: 'Sleep' } }],
      checkups: [{ en: 'Memory check-up', tl: 'Check-up sa memorya', everyMonths: 6 }] }
  ];

  function list() { return LIBRARY.slice(); }
  function get(key) { for (var i = 0; i < LIBRARY.length; i++) if (LIBRARY[i].key === key) return LIBRARY[i]; return null; }

  /* What picking this condition suggests. Every vital type is a fresh,
     valid VitalType (with logReminders) ready to tick and save.
     -> { track: [VitalType], checkups: [{ en, tl, everyMonths }], purpose: { en, tl } } | null */
  function suggestions(key) {
    var c = get(key);
    if (!c) return null;
    return {
      track: c.track.map(function (t) {
        var v = V.template(t.template, t.over);
        v.logReminders = (t.remind || []).slice();
        return v;
      }),
      checkups: c.checkups.map(function (x) { return { en: x.en, tl: x.tl, everyMonths: x.everyMonths }; }),
      purpose: { en: c.purpose.en, tl: c.purpose.tl }
    };
  }

  /* Merges suggestions from several conditions so the caregiver isn't offered
     blood pressure twice (hypertension + stroke): one entry per vital key, or
     per symptom name. */
  function combined(keys) {
    var seen = {}, out = [];
    keys.forEach(function (k) {
      var s = suggestions(k);
      if (!s) return;
      s.track.forEach(function (v) {
        var id = v.key === 'symptom' ? 'symptom:' + v.name.toLowerCase() : v.key;
        if (seen[id]) return;
        seen[id] = 1;
        v.from = k;
        out.push(v);
      });
    });
    return out;
  }

  var api = { list: list, get: get, suggestions: suggestions, combined: combined };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KalingaConditions = api;
})(this);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node kalinga/tests/conditions.test.js`
Expected: `conditions.test.js ok`

- [ ] **Step 5: Commit**

```bash
git add kalinga/js/conditions.js kalinga/tests/conditions.test.js
git commit -m "Kalinga: conditions library (suggested tracking, checkups and purposes for common senior conditions)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Store

**Files:**
- Create: `kalinga/js/store.js`
- Test: `kalinga/tests/store.test.js`

**Interfaces:**
- Consumes: `KalingaSchedule.validate/slots/cutoff` (Task 1), `KalingaStock.take/restock/isLow/tracked` (Task 2), `KalingaScale.validate` (Task 3).
- Produces (`KalingaStore`):
  - `create({storage?, now?}) -> store`, `defaults()`, `normalize(st)`, `KINDS`, `FORMS`, `STORE_KEY`, `GEN_KEY`, `isInsulin(med)`.
  - **Store instance:**
    - Persistence: `load()`, `get()`, `set(st)`, `save() -> bool`, `isCurrent()`.
    - Hooks: `onSaveError`, `onConflict`, `onSaved`.
    - Records: `find(kind, id)`, `list(kind, pred?)`, `add(kind, obj, by, quiet?)`, `update(kind, id, patch, by, quiet?)`, `remove(kind, id, by)`.
    - Medicines and schedules: `checkMed(med)`, `saveMed(med, by) -> {med}|{error}`, `saveSchedule({id?, medId, rule, dose?}, by) -> {schedule}|{error}`.
    - Doses: `recordDose({elderId?, medId, slotKey?, dueAt?, status, units?, by}) -> dose|null`, `prnTaken(medId) -> [ms]`.
    - Views: `timeline(elderId, from, to, now) -> [slot with items[].status and status]`, `lowStock(elderId) -> [med]`.
    - Readings and elders: `logReading({...}) -> reading|null`, `addElder(e, by)`.
- `KINDS`: `elders, conditions, meds, schedules, doses, vitalTypes, readings`.
- Dose statuses stored: `taken | skipped | snoozed`. Timeline statuses: `taken | skipped | unconfirmed | due | upcoming`. Slot status: `done | unconfirmed | due | upcoming`.

- [ ] **Step 1: Write the failing test**

Create `kalinga/tests/store.test.js`:

```js
/* Kalinga — store.js tests.  node kalinga/tests/store.test.js */
'use strict';
process.env.TZ = 'Asia/Manila';
const assert = require('assert');
const K = require('../js/store.js');
const MIN = 60000, HOUR = 60 * MIN, DAY = 24 * HOUR;
const at = (y, mo, d, h, mi) => new Date(y, mo - 1, d, h || 0, mi || 0).getTime();
function memStorage() {
  const m = {};
  return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; }, dump: m };
}
let clockNow = at(2026, 10, 9, 7, 0);
const clock = () => clockNow;
const rule = (o) => Object.assign({ times: ['08:00'], weekdays: [], everyN: 0, start: '2026-10-09', end: '', prn: false }, o);

/* ---------- normalize / load / save ---------- */
const mem = memStorage();
const S = K.create({ storage: mem, now: clock });
S.load();
assert.deepStrictEqual(S.get().elders, []);
assert.strictEqual(S.get().settings.lang, 'tl');
assert.ok(S.save());
assert.ok(mem.getItem(K.STORE_KEY));
// unknown settings are dropped, missing lists filled
const n = K.normalize({ settings: { lang: 'en', bogus: 1 }, elders: 'x' });
assert.deepStrictEqual(n.settings, { lang: 'en' });
assert.deepStrictEqual(n.elders, []);
assert.deepStrictEqual(K.normalize(null).meds, []);
// corrupt storage starts fresh instead of crashing
const bad = memStorage(); bad.setItem(K.STORE_KEY, '{nope');
assert.deepStrictEqual(K.create({ storage: bad }).load().meds, []);
// a full or blocked storage reports the failure
const full = memStorage(); full.setItem = () => { throw new Error('QuotaExceededError'); };
const SF = K.create({ storage: full }); SF.load();
let saveErr = null; SF.onSaveError = (e) => { saveErr = e; };
assert.strictEqual(SF.save(), false);
assert.ok(saveErr);

/* ---------- one active copy ---------- */
const shared = memStorage();
const A = K.create({ storage: shared }), B = K.create({ storage: shared });
A.load(); B.load();
assert.ok(A.save(), 'first copy saves');
let conflict = 0; B.onConflict = () => { conflict++; };
assert.strictEqual(B.save(), false, 'stale copy must not overwrite');
assert.strictEqual(conflict, 1);
B.load();
assert.ok(B.save(), 'after reloading it may save');
assert.strictEqual(A.isCurrent(), false);

/* ---------- records, tombstones, change log ---------- */
const papa = S.addElder({ name: 'Papa' }, 'Poll');
assert.ok(papa.id && papa.updatedAt === clockNow && papa.by === 'Poll');
assert.deepStrictEqual(papa.alerts, { rerings: [10, 20], cutoffMin: 30 });
const mama = S.addElder({ name: 'Mama' }, 'Poll');
assert.strictEqual(S.find('elders', papa.id).name, 'Papa');
clockNow += MIN;
S.update('elders', papa.id, { allergies: 'Penicillin' }, 'Ate');
assert.strictEqual(S.find('elders', papa.id).by, 'Ate');
const before = S.get().changelog.length;
S.update('elders', papa.id, { allergies: 'Penicillin' }, 'Ate');
assert.strictEqual(S.get().changelog.length, before, 'no-op edits are not logged');
const last = S.get().changelog[S.get().changelog.length - 1];
assert.deepStrictEqual([last.action, last.fields, last.by, last.label], ['edit', ['allergies'], 'Ate', 'Papa']);
const tmp = S.addElder({ name: 'Temp' }, 'Poll');
assert.ok(S.remove('elders', tmp.id, 'Poll'));
assert.strictEqual(S.find('elders', tmp.id), null);
assert.strictEqual(S.list('elders').length, 2);
assert.strictEqual(S.get().elders.length, 3, 'tombstone kept for sync');
assert.ok(S.get().elders.find((e) => e.id === tmp.id).deleted);
assert.strictEqual(S.remove('elders', tmp.id), false, 'already deleted');
assert.strictEqual(S.update('elders', tmp.id, { name: 'x' }), null, 'cannot edit a deleted record');
assert.throws(() => S.add('bogus', {}));

/* ---------- medicines ---------- */
const losartanIn = { elderId: papa.id, name: 'Losartan 50mg', purpose: 'para sa altapresyon', form: 'tablet', dose: { amount: 1, unit: 'tablet' }, stock: { count: 20 } };
assert.deepStrictEqual(S.saveMed(Object.assign({}, losartanIn, { name: ' ' })).error, { field: 'name', error: 'no-name' });
assert.deepStrictEqual(S.saveMed(Object.assign({}, losartanIn, { elderId: 'nobody' })).error, { field: 'elderId', error: 'no-elder' });
assert.deepStrictEqual(S.saveMed(Object.assign({}, losartanIn, { form: 'gummy' })).error, { field: 'form', error: 'bad-form' });
assert.deepStrictEqual(S.saveMed(Object.assign({}, losartanIn, { dose: { amount: 0, unit: 'tablet' } })).error, { field: 'dose', error: 'bad-dose' });
const losartan = S.saveMed(losartanIn, 'Poll').med;
assert.strictEqual(losartan.active, true);
assert.deepStrictEqual(losartan.stock, { count: 20, packSize: 0, lowDays: 7 });
// cream for the feet: any form, not just pills
const cream = S.saveMed({ elderId: papa.id, name: 'Diclofenac gel', form: 'cream', applyTo: 'sa paa', dose: { amount: 1, unit: 'application' } }, 'Poll').med;
assert.strictEqual(cream.applyTo, 'sa paa');
assert.strictEqual(cream.stock.count, null, 'stock not tracked unless given');

// sliding-scale insulin: refused until charts are valid AND confirmed from the doctor's instructions
const chart = { context: 'any', rows: [{ from: 70, to: 150, units: 0 }, { from: 151, to: 250, units: 4 }] };
const insIn = { elderId: mama.id, name: 'Insulin glargine', form: 'insulin-pen', dose: { amount: 4, unit: 'units' }, insulin: { mode: 'scale', charts: [chart], needles: 10 } };
assert.deepStrictEqual(S.saveMed(insIn).error, { field: 'chartConfirmed', error: 'not-confirmed' });
assert.strictEqual(S.saveMed(Object.assign({}, insIn, { insulin: { mode: 'scale', charts: [] } })).error.error, 'no-chart');
const badChart = { context: 'any', rows: [{ from: 70, to: 150, units: 0 }, { from: 140, to: 250, units: 4 }] };
assert.strictEqual(S.saveMed(Object.assign({}, insIn, { insulin: { mode: 'scale', charts: [badChart], chartConfirmed: true } })).error.error, 'bad-chart');
assert.strictEqual(S.saveMed(Object.assign({}, insIn, { insulin: { mode: 'guess' } })).error.error, 'bad-mode');
const insulin = S.saveMed(Object.assign({}, insIn, { insulin: Object.assign({}, insIn.insulin, { chartConfirmed: true }), stock: { count: 300 } }), 'Poll').med;
assert.ok(insulin.id);
// editing an existing med updates it in place
S.saveMed(Object.assign({}, losartan, { purpose: 'for blood pressure' }), 'Ate');
assert.strictEqual(S.list('meds').length, 3);
assert.strictEqual(S.find('meds', losartan.id).purpose, 'for blood pressure');

/* ---------- schedules ---------- */
assert.deepStrictEqual(S.saveSchedule({ medId: 'nope', rule: rule() }).error, { field: 'medId', error: 'no-med' });
assert.deepStrictEqual(S.saveSchedule({ medId: losartan.id, rule: rule({ times: [] }) }).error, { field: 'times', error: 'no-times' });
assert.deepStrictEqual(S.saveSchedule({ medId: losartan.id, rule: rule(), dose: { amount: 0 } }).error, { field: 'dose', error: 'bad-dose' });
S.saveSchedule({ medId: losartan.id, rule: rule({ times: ['08:00', '20:00'] }) }, 'Poll');
S.saveSchedule({ medId: cream.id, rule: rule({ times: ['08:00'] }) }, 'Poll');
S.saveSchedule({ medId: insulin.id, rule: rule({ times: ['07:30'] }) }, 'Poll');

/* ---------- timeline ---------- */
const day = at(2026, 10, 9);
let tl = S.timeline(papa.id, day, day + DAY, at(2026, 10, 9, 7, 0));
assert.deepStrictEqual(tl.map((s) => s.slotKey), [papa.id + '@2026-10-09T08:00', papa.id + '@2026-10-09T20:00']);
assert.deepStrictEqual(tl[0].items.map((i) => i.medId), [losartan.id, cream.id], 'Losartan and the cream ring together');
assert.deepStrictEqual([tl[0].status, tl[1].status], ['upcoming', 'upcoming']);
assert.strictEqual(S.timeline(papa.id, day, day + DAY, at(2026, 10, 9, 8, 15))[0].status, 'due');
assert.strictEqual(S.timeline(papa.id, day, day + DAY, at(2026, 10, 9, 8, 30))[0].status, 'unconfirmed', 'cutoff at +30');
assert.deepStrictEqual(S.timeline('nobody', day, day + DAY, clockNow), []);

/* ---------- doses and stock ---------- */
const slot8 = papa.id + '@2026-10-09T08:00';
S.recordDose({ medId: losartan.id, slotKey: slot8, dueAt: at(2026, 10, 9, 8), status: 'snoozed', by: 'Papa' });
assert.strictEqual(S.find('meds', losartan.id).stock.count, 20, 'snooze does not touch stock');
assert.strictEqual(S.timeline(papa.id, day, day + DAY, at(2026, 10, 9, 8, 15))[0].items[0].status, 'due', 'snoozed still counts as due');
clockNow = at(2026, 10, 9, 8, 12);
S.recordDose({ medId: losartan.id, slotKey: slot8, dueAt: at(2026, 10, 9, 8), status: 'taken', by: 'Papa' });
S.recordDose({ medId: cream.id, slotKey: slot8, dueAt: at(2026, 10, 9, 8), status: 'skipped', by: 'Papa' });
assert.strictEqual(S.list('doses', (d) => d.slotKey === slot8 && d.medId === losartan.id).length, 1, 'one record per slot and med');
S.recordDose({ medId: cream.id, slotKey: papa.id + '@2026-10-09T08:00x', status: 'taken', by: 'Papa' });
assert.strictEqual(S.find('meds', cream.id).stock.count, null, 'untracked stock stays untracked');
assert.strictEqual(S.find('meds', losartan.id).stock.count, 19);
S.recordDose({ medId: losartan.id, slotKey: slot8, status: 'taken', by: 'Papa' });
assert.strictEqual(S.find('meds', losartan.id).stock.count, 19, 'confirming twice does not take twice');
tl = S.timeline(papa.id, day, day + DAY, at(2026, 10, 9, 9, 0));
assert.deepStrictEqual(tl[0].items.map((i) => i.status), ['taken', 'skipped']);
assert.strictEqual(tl[0].status, 'done');
// changing a taken dose to skipped puts the tablet back
S.recordDose({ medId: losartan.id, slotKey: slot8, status: 'skipped', by: 'Ate' });
assert.strictEqual(S.find('meds', losartan.id).stock.count, 20);
S.recordDose({ medId: losartan.id, slotKey: slot8, status: 'taken', units: 0.5, by: 'Papa' });
assert.strictEqual(S.find('meds', losartan.id).stock.count, 19.5, 'half a tablet');
// insulin: units actually taken, and a needle
S.recordDose({ medId: insulin.id, slotKey: mama.id + '@2026-10-09T07:30', status: 'taken', units: 6, by: 'Mama' });
assert.strictEqual(S.find('meds', insulin.id).stock.count, 294);
assert.strictEqual(S.find('meds', insulin.id).insulin.needles, 9);
assert.strictEqual(S.recordDose({ medId: 'nope', status: 'taken' }), null);

/* ---------- as-needed ---------- */
const para = S.saveMed({ elderId: papa.id, name: 'Paracetamol 500mg', form: 'tablet', dose: { amount: 1, unit: 'tablet' }, prn: { minGapMin: 240, maxPerDay: 4 }, stock: { count: 10 } }, 'Poll').med;
assert.deepStrictEqual(S.saveMed({ elderId: papa.id, name: 'X', form: 'tablet', dose: { amount: 1, unit: 'tablet' }, prn: { minGapMin: -5 } }).error, { field: 'prn', error: 'bad-limit' });
clockNow = at(2026, 10, 9, 10);
S.recordDose({ medId: para.id, status: 'taken', by: 'Papa' });
clockNow = at(2026, 10, 9, 15);
S.recordDose({ medId: para.id, status: 'taken', by: 'Papa' });
assert.strictEqual(S.list('doses', (d) => d.medId === para.id).length, 2, 'as-needed doses are separate records');
assert.deepStrictEqual(S.prnTaken(para.id), [at(2026, 10, 9, 10), at(2026, 10, 9, 15)]);
assert.strictEqual(S.find('meds', para.id).stock.count, 8);

/* ---------- low stock ---------- */
assert.deepStrictEqual(S.lowStock(papa.id).map((m) => m.name), [], 'Losartan 19.5 tablets / 2 a day = 9 days');
S.update('meds', losartan.id, { stock: { count: 14, packSize: 30, lowDays: 7 } }, 'Poll');
assert.deepStrictEqual(S.lowStock(papa.id).map((m) => m.name), ['Losartan 50mg']);

/* ---------- readings ---------- */
const sugarType = S.add('vitalTypes', { elderId: mama.id, key: 'sugar', kind: 'number', name: 'Blood sugar', unit: 'mg/dL', low: 70, high: 300, danger: [], contexts: ['fasting'] }, 'Poll');
const r = S.logReading({ elderId: mama.id, vitalTypeId: sugarType.id, value: 185, context: 'fasting', source: 'voice', by: 'Mama' });
assert.deepStrictEqual([r.value, r.context, r.source, r.at], [185, 'fasting', 'voice', clockNow]);
assert.strictEqual(S.logReading({ elderId: mama.id, vitalTypeId: 'nope', value: 1 }), null);

/* ---------- change log cap ---------- */
for (let i = 0; i < 600; i++) S.update('elders', mama.id, { allergies: 'a' + i }, 'Poll');
assert.strictEqual(S.get().changelog.length, 500);

/* ---------- round trip through storage ---------- */
assert.ok(S.save());
const S2 = K.create({ storage: mem }); S2.load();
assert.strictEqual(S2.find('meds', losartan.id).stock.count, 14);
assert.strictEqual(S2.list('elders').length, 2);

console.log('store.test.js ok');
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node kalinga/tests/store.test.js`
Expected: FAIL with `Cannot find module '../js/store.js'`

- [ ] **Step 3: Write the implementation**

Create `kalinga/js/store.js`:

```js
/* =========================================================
   Kalinga — store.js
   State, persistence, the change log and the domain rules that
   must hold no matter which screen made the change. No DOM.

   One object in storage['kalinga-v1']. Every shared record has
     { id, updatedAt, by, deleted? }
   Deleting keeps a tombstone ({ deleted: true }) — sync (plan 1D)
   sends deletions explicitly and never infers one from a missing
   record (the lesson of Alaga's 2026-10-07 incident).

   Only one copy of the app may save: storage['kalinga-gen'] counts
   saves, and a copy that sees someone else's newer save refuses to
   write and calls onConflict (the app then reloads).

   Canonical units: mg/dL, mmHg, kg, °C, ms epoch.
   ========================================================= */
(function (root) {
  'use strict';

  var req = typeof require !== 'undefined' ? require : null;
  var Sch = root.KalingaSchedule || (req && req('./schedule.js'));
  var Stk = root.KalingaStock || (req && req('./stock.js'));
  var Scl = root.KalingaScale || (req && req('./scale.js'));

  var STORE_KEY = 'kalinga-v1', GEN_KEY = 'kalinga-gen';
  var KINDS = ['elders', 'conditions', 'meds', 'schedules', 'doses', 'vitalTypes', 'readings'];
  var FORMS = ['tablet', 'capsule', 'insulin-pen', 'insulin-vial', 'liquid', 'drops', 'inhaler', 'cream', 'patch', 'injection', 'other'];
  var LOG_MAX = 500;

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function isInsulin(med) { return med && (med.form === 'insulin-pen' || med.form === 'insulin-vial'); }

  function defaults() {
    return {
      v: 1,
      device: { id: uid(), mode: '', elderId: '', name: '' }, // per phone, never synced
      elders: [], conditions: [], meds: [], schedules: [], doses: [], vitalTypes: [], readings: [],
      changelog: [],
      settings: { lang: 'tl' }
    };
  }

  // Keeps only known settings (a new setting must be added to defaults()) and fills gaps.
  function normalize(st) {
    var d = defaults();
    if (!st || typeof st !== 'object') return d;
    KINDS.forEach(function (k) { if (!Array.isArray(st[k])) st[k] = []; });
    if (!Array.isArray(st.changelog)) st.changelog = [];
    st.device = Object.assign(d.device, st.device || {});
    var s = {};
    Object.keys(d.settings).forEach(function (k) { s[k] = st.settings && st.settings[k] != null ? st.settings[k] : d.settings[k]; });
    st.settings = s;
    st.v = 1;
    return st;
  }

  function create(opts) {
    opts = opts || {};
    var storage = opts.storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    var clock = opts.now || function () { return Date.now(); };
    var st = defaults(), gen = 0;
    var self = { onSaveError: null, onConflict: null, onSaved: null };

    function readGen() { try { return +(storage.getItem(GEN_KEY) || 0); } catch (e) { return 0; } }

    self.load = function () {
      var raw = null;
      try { raw = storage && storage.getItem(STORE_KEY); } catch (e) {}
      try { st = normalize(raw ? JSON.parse(raw) : null); } catch (e) { st = defaults(); }
      gen = readGen();
      return st;
    };
    self.get = function () { return st; };
    self.set = function (next) { st = normalize(next); return st; };
    self.isCurrent = function () { return readGen() === gen; };

    // false when nothing was written (storage full/blocked, or another copy saved since).
    self.save = function () {
      if (!storage) return false;
      if (!self.isCurrent()) { if (self.onConflict) self.onConflict(); return false; }
      try {
        var json = JSON.stringify(st);
        storage.setItem(STORE_KEY, json);
        storage.setItem(GEN_KEY, String(gen + 1));
        gen++;
        if (self.onSaved) self.onSaved(json);
        return true;
      } catch (e) {
        if (self.onSaveError) self.onSaveError(e);
        return false;
      }
    };

    /* ---------- Records ---------- */
    function label(rec) { return rec.name || rec.title || ''; }
    function log(kind, rec, action, fields, by) {
      st.changelog.push({ id: uid(), at: clock(), by: by || '', kind: kind, recordId: rec.id, action: action, fields: fields || [], label: label(rec) });
      if (st.changelog.length > LOG_MAX) st.changelog.splice(0, st.changelog.length - LOG_MAX);
    }
    function raw(kind, id) {
      var list = st[kind] || [];
      for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
      return null;
    }

    self.find = function (kind, id) { var r = raw(kind, id); return r && !r.deleted ? r : null; };
    self.list = function (kind, pred) { return (st[kind] || []).filter(function (r) { return !r.deleted && (!pred || pred(r)); }); };

    self.add = function (kind, obj, by, quiet) {
      if (KINDS.indexOf(kind) < 0) throw new Error('unknown kind ' + kind);
      var rec = clone(obj || {});
      rec.id = rec.id || uid();
      rec.updatedAt = clock();
      rec.by = by || '';
      delete rec.deleted;
      st[kind].push(rec);
      if (!quiet) log(kind, rec, 'add', [], by);
      return rec;
    };

    self.update = function (kind, id, patch, by, quiet) {
      var rec = self.find(kind, id);
      if (!rec) return null;
      var fields = [];
      Object.keys(patch || {}).forEach(function (k) {
        if (k === 'id' || k === 'updatedAt' || k === 'by' || k === 'deleted') return;
        if (JSON.stringify(rec[k]) === JSON.stringify(patch[k])) return;
        rec[k] = clone(patch[k] === undefined ? null : patch[k]);
        fields.push(k);
      });
      if (!fields.length) return rec;
      rec.updatedAt = clock();
      rec.by = by || '';
      if (!quiet) log(kind, rec, 'edit', fields, by);
      return rec;
    };

    self.remove = function (kind, id, by) {
      var rec = self.find(kind, id);
      if (!rec) return false;
      rec.deleted = true;
      rec.updatedAt = clock();
      rec.by = by || '';
      log(kind, rec, 'delete', [], by);
      return true;
    };

    /* ---------- Medicines ----------
       saveMed(med, by) -> { med } | { error: { field, error } }
       Insulin with a sliding scale is refused unless every chart is valid
       and the caregiver confirmed it was copied from the doctor's
       written instructions (insulin.chartConfirmed === true). */
    self.checkMed = function (med) {
      if (!med || !String(med.name || '').trim()) return { field: 'name', error: 'no-name' };
      if (!med.elderId || !self.find('elders', med.elderId)) return { field: 'elderId', error: 'no-elder' };
      if (FORMS.indexOf(med.form) < 0) return { field: 'form', error: 'bad-form' };
      var d = med.dose || {};
      if (!(d.amount > 0) || !String(d.unit || '').trim()) return { field: 'dose', error: 'bad-dose' };
      if (med.prn && ((med.prn.minGapMin != null && !(med.prn.minGapMin >= 0)) || (med.prn.maxPerDay != null && !(med.prn.maxPerDay >= 0)))) return { field: 'prn', error: 'bad-limit' };
      if (isInsulin(med)) {
        var ins = med.insulin || {};
        if (ins.mode !== 'fixed' && ins.mode !== 'scale') return { field: 'insulin', error: 'bad-mode' };
        if (ins.mode === 'scale') {
          if (!ins.charts || !ins.charts.length) return { field: 'charts', error: 'no-chart' };
          for (var i = 0; i < ins.charts.length; i++) if (Scl.validate(ins.charts[i])) return { field: 'charts', error: 'bad-chart', chart: i, detail: Scl.validate(ins.charts[i]) };
          if (ins.chartConfirmed !== true) return { field: 'chartConfirmed', error: 'not-confirmed' };
        }
      }
      return null;
    };
    self.saveMed = function (med, by) {
      var err = self.checkMed(med);
      if (err) return { error: err };
      var m = clone(med);
      if (m.active == null) m.active = true;
      m.stock = Object.assign({ count: null, packSize: 0, lowDays: 7 }, m.stock || {}); // count null = not tracked
      return { med: m.id && self.find('meds', m.id) ? self.update('meds', m.id, m, by) : self.add('meds', m, by) };
    };

    // saveSchedule({ id?, medId, rule, dose? }, by) -> { schedule } | { error }
    self.saveSchedule = function (s, by) {
      if (!s || !self.find('meds', s.medId)) return { error: { field: 'medId', error: 'no-med' } };
      var err = Sch.validate(s.rule);
      if (err) return { error: err };
      if (s.dose && !(s.dose.amount > 0)) return { error: { field: 'dose', error: 'bad-dose' } };
      return { schedule: s.id && self.find('schedules', s.id) ? self.update('schedules', s.id, s, by) : self.add('schedules', s, by) };
    };

    /* ---------- Doses ----------
       recordDose({ elderId, medId, slotKey, dueAt, status, units, by })
       status: 'taken' | 'skipped' | 'snoozed'. One record per (slotKey, medId);
       as-needed doses (no slotKey) are always new. Stock goes down when a dose
       becomes taken and back up if a taken dose is changed to skipped. */
    self.recordDose = function (d) {
      var med = self.find('meds', d.medId);
      if (!med) return null;
      var units = d.units != null ? d.units : med.dose.amount, now = clock();
      var prev = d.slotKey ? self.list('doses', function (x) { return x.slotKey === d.slotKey && x.medId === d.medId; })[0] : null;
      var wasTaken = prev && prev.status === 'taken', nowTaken = d.status === 'taken';
      var rec;
      if (prev) rec = self.update('doses', prev.id, { status: d.status, units: units, actedAt: now }, d.by, true);
      else rec = self.add('doses', { elderId: d.elderId || med.elderId, medId: d.medId, slotKey: d.slotKey || null, dueAt: d.dueAt || now, status: d.status, units: units, actedAt: now }, d.by, true);
      if (nowTaken && !wasTaken) {
        var t = Stk.take(med, units), patch = {};
        if (t.count != null) patch.stock = Object.assign({}, med.stock, { count: t.count });
        if (t.needles != null) patch.insulin = Object.assign({}, med.insulin, { needles: t.needles });
        self.update('meds', med.id, patch, d.by, true);
      } else if (wasTaken && !nowTaken && Stk.tracked(med)) {
        self.update('meds', med.id, { stock: Object.assign({}, med.stock, { count: Stk.restock(med, prev.units) }) }, d.by, true);
      }
      return rec;
    };

    // Times (ms) this as-needed med was taken, for schedule.prnAllowed().
    self.prnTaken = function (medId) {
      return self.list('doses', function (x) { return x.medId === medId && x.status === 'taken'; }).map(function (x) { return x.actedAt; });
    };

    /* ---------- Today ----------
       Every slot in [from, to) with each medicine's status:
       'taken' | 'skipped' | 'unconfirmed' (past the cutoff, no answer) |
       'due' (ringing now) | 'upcoming'. A snoozed dose counts as due. */
    self.timeline = function (elderId, from, to, now) {
      var elder = self.find('elders', elderId);
      if (!elder) return [];
      var doses = {};
      self.list('doses', function (x) { return x.elderId === elderId && x.slotKey; }).forEach(function (x) { doses[x.slotKey + '|' + x.medId] = x; });
      return Sch.slots(elderId, self.list('meds'), self.list('schedules'), from, to).map(function (slot) {
        var cut = Sch.cutoff(slot.at, elder.alerts);
        slot.items.forEach(function (it) {
          var d = doses[slot.slotKey + '|' + it.medId];
          if (d && (d.status === 'taken' || d.status === 'skipped')) it.status = d.status;
          else if (now >= cut) it.status = 'unconfirmed';
          else if (now >= slot.at) it.status = 'due';
          else it.status = 'upcoming';
        });
        slot.status = slot.items.every(function (it) { return it.status === 'taken' || it.status === 'skipped'; }) ? 'done'
          : slot.items.some(function (it) { return it.status === 'unconfirmed'; }) ? 'unconfirmed'
          : slot.items.some(function (it) { return it.status === 'due'; }) ? 'due' : 'upcoming';
        return slot;
      });
    };

    // Medicines running low for this elder.
    self.lowStock = function (elderId) {
      return self.list('meds', function (m) { return m.elderId === elderId && m.active !== false; }).filter(function (m) {
        return Stk.isLow(m, self.list('schedules', function (s) { return s.medId === m.id; }));
      });
    };

    /* ---------- Readings ---------- */
    // logReading({ elderId, vitalTypeId, value, context, at, source, photoId?, by }) -> record | null
    self.logReading = function (r) {
      if (!self.find('vitalTypes', r.vitalTypeId)) return null;
      return self.add('readings', { elderId: r.elderId, vitalTypeId: r.vitalTypeId, value: r.value, context: r.context || '', at: r.at || clock(), source: r.source || 'keypad', photoId: r.photoId || null }, r.by, true);
    };

    /* ---------- Elders ---------- */
    self.addElder = function (e, by) {
      var rec = Object.assign({ name: '', photoId: null, allergies: '', bloodType: '', contacts: [], doctors: [], alerts: { rerings: [10, 20], cutoffMin: 30 } }, e || {});
      return self.add('elders', rec, by);
    };

    return self;
  }

  var api = { create: create, defaults: defaults, normalize: normalize, KINDS: KINDS, FORMS: FORMS, STORE_KEY: STORE_KEY, GEN_KEY: GEN_KEY, isInsulin: isInsulin };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KalingaStore = api;
})(this);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node kalinga/tests/store.test.js`
Expected: `store.test.js ok`

- [ ] **Step 5: Commit**

```bash
git add kalinga/js/store.js kalinga/tests/store.test.js
git commit -m "Kalinga: store (tombstones, change log, one active copy, meds, doses, timeline)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Test runner, browser globals and docs

**Files:**
- Create: `kalinga/tests/run.js`
- Create: `kalinga/README.md`
- Modify: `CLAUDE.md` (repo root). Append a section at the end of the file.

**Interfaces:**
- Consumes: every module from Tasks 1–7.
- Produces: `node kalinga/tests/run.js`, the single command later plans run before every commit.

- [ ] **Step 1: Write the runner (it fails if any module is missing a browser global)**

Create `kalinga/tests/run.js`:

```js
/* Kalinga — runs every unit test, then loads the modules the way a
   browser does (plain <script> tags, no require) to check the globals.
     node kalinga/tests/run.js */
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const TESTS = ['schedule', 'schedule.dst', 'stock', 'scale', 'vitals', 'speechnum', 'conditions', 'store'];
for (const t of TESTS) {
  execFileSync(process.execPath, [path.join(__dirname, t + '.test.js')], { stdio: 'inherit' });
}

// Browser load order (index.html must use the same order).
const ORDER = ['schedule.js', 'stock.js', 'scale.js', 'vitals.js', 'conditions.js', 'speechnum.js', 'store.js'];
const win = { console };
win.window = win;
vm.createContext(win);
for (const f of ORDER) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), win, { filename: f });
['KalingaSchedule', 'KalingaStock', 'KalingaScale', 'KalingaVitals', 'KalingaConditions', 'KalingaSpeech', 'KalingaStore']
  .forEach((g) => assert.ok(win[g], g + ' is not a browser global'));
// The browser store works without require, against an in-memory localStorage.
const m = {};
win.localStorage = { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; } };
const S = win.KalingaStore.create();
S.load();
const e = S.addElder({ name: 'Papa' });
assert.ok(S.saveMed({ elderId: e.id, name: 'Losartan', form: 'tablet', dose: { amount: 1, unit: 'tablet' } }).med);
assert.ok(S.save());
assert.strictEqual(win.KalingaConditions.suggestions('diabetes').track[0].key, 'sugar');
console.log('browser globals ok');
console.log('ALL KALINGA TESTS PASSED');
```

- [ ] **Step 2: Run everything**

Run: `node kalinga/tests/run.js`
Expected: one `ok` line per test file, then `browser globals ok` and `ALL KALINGA TESTS PASSED`.

- [ ] **Step 3: Check the ES5 rule and syntax**

Run: `for f in kalinga/js/*.js; do node --check "$f"; done; grep -nE '\b(let|const)\b|=>' kalinga/js/*.js`
Expected: no output from either command (no syntax errors, no ES6 in `kalinga/js/`).

- [ ] **Step 4: Write `kalinga/README.md`**

```markdown
# Kalinga

Medicine reminders, vitals and checkups for elderly parents, with a caregiver
who is told within minutes when something is off. Sibling of Alaga (`../baby/`).
Private by design and condition-neutral: diabetes, hypertension, arthritis and
the rest are all just entries in `js/conditions.js`.

- Spec: `docs/superpowers/specs/2026-10-09-kalinga-design.md`
- Phase 1 roadmap: `docs/superpowers/plans/2026-10-09-kalinga-phase1-roadmap.md`

## Tests

    node kalinga/tests/run.js     # every unit test + browser-globals check

Pure Node, nothing to install. Each `tests/<module>.test.js` can also run alone.

## Modules (`js/`, load in this order)

| File | Global | What |
|---|---|---|
| schedule.js | KalingaSchedule | due times, slots, re-rings, as-needed limits |
| stock.js | KalingaStock | days left, low stock, dose arithmetic |
| scale.js | KalingaScale | sliding-scale chart lookup (never calculates a dose) |
| vitals.js | KalingaVitals | vital/symptom types, verdicts, danger cards |
| conditions.js | KalingaConditions | common senior conditions → suggestions |
| speechnum.js | KalingaSpeech | spoken numbers (EN/Tagalog/Taglish) |
| store.js | KalingaStore | state, tombstones, change log, domain rules |

Not published on GitHub Pages (`_config.yml` excludes `kalinga/`). It will deploy to
https://kalinga-app.pages.dev (plan 1B).
```

- [ ] **Step 5: Add a Kalinga section to the repo `CLAUDE.md`**

Append this to the end of `CLAUDE.md`, after the last Baby Log paragraph ("**Product rules the code relies on**"), separated by a blank line:

```markdown
## Kalinga (`kalinga/`)

Elder-care sibling of Alaga: medicine alarms, vitals and symptom check-ins, stock, and caregiver alerts. Spec and plans are in `kalinga/docs/superpowers/`. Same rules as Alaga (ES5, no build, no runtime deps, dual-export pure modules). Run `node kalinga/tests/run.js` before every commit. Excluded from GitHub Pages; deploys to https://kalinga-app.pages.dev.
- **Safety:** the app never calculates, suggests or changes a dose. A sliding-scale chart is lookup only and must be confirmed by the caregiver (`insulin.chartConfirmed`).
- **Data:** deletes are tombstones (`deleted: true`), never splices, because sync sends deletions explicitly. Only one copy of the app may save (`kalinga-gen` generation guard).
- **Conditions:** nothing is diabetes-specific. Conditions are data in `js/conditions.js`.
```

- [ ] **Step 6: Run everything once more and commit**

Run: `node kalinga/tests/run.js`
Expected: `ALL KALINGA TESTS PASSED`

```bash
git add kalinga/tests/run.js kalinga/README.md CLAUDE.md
git commit -m "Kalinga: test runner with browser-globals check; README and CLAUDE.md section

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
