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
