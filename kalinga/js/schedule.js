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
  // Whole calendar days between two 'YYYY-MM-DD' keys. Counted on the calendar,
  // not in 24-hour blocks, so DST changes (even at midnight) never shift it.
  function dayNumber(key) { var p = key.split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]) / DAY; }

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

  // Is the rule active on the local day containing `day`? Compared as calendar
  // dates ('YYYY-MM-DD' strings), never as milliseconds.
  function activeOn(rule, day) {
    if (rule.prn || parseDay(rule.start) == null) return false;
    var k = dayKey(day);
    if (k < rule.start) return false;
    if (rule.end && k > rule.end) return false;
    var wd = rule.weekdays || [];
    if (wd.length && wd.indexOf(new Date(day).getDay()) < 0) return false;
    var n = rule.everyN || 0;
    if (n > 1 && (dayNumber(k) - dayNumber(rule.start)) % n !== 0) return false;
    return true;
  }

  // Every due time (ms) of one rule in [from, to), sorted.
  function occurrences(rule, from, to) {
    var out = [];
    if (!rule || rule.prn || validate(rule)) return out;
    var f = new Date(from);
    for (var i = 0; ; i++) {
      // Each day built from the calendar date, so a midnight DST change can't make the loop drift.
      var day = new Date(f.getFullYear(), f.getMonth(), f.getDate() + i).getTime();
      if (day >= to) break;
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
  // -> [{ at, slotKey, items: [{ medId, scheduleId, dose }] }] sorted by time.
  //    dose: the schedule's own dose, or null to use the medicine's.
  function slots(elderId, meds, schedules, from, to) {
    var byMed = {}, groups = {};
    meds.forEach(function (m) { if (m.elderId === elderId && m.active !== false && !m.deleted) byMed[m.id] = m; });
    schedules.forEach(function (s) {
      if (s.deleted || !byMed[s.medId]) return;
      occurrences(s.rule, from, to).forEach(function (t) {
        var key = slotKey(elderId, t);
        var g = groups[key] = groups[key] || { at: t, slotKey: key, items: [] };
        g.items.push({ medId: s.medId, scheduleId: s.id, dose: s.dose || null });
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
