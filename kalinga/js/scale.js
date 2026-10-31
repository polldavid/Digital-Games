/* =========================================================
   Kalinga — scale.js
   Sliding-scale insulin: the doctor's chart, copied in by the
   caregiver, looked up at dose time. No DOM, no storage.

   SAFETY: this module never calculates, suggests or changes a
   dose. It only finds the row of the chart the caregiver typed
   in. A reading outside the chart returns { outside: true } and
   the app must show "call the doctor/family" with no units.

   chart: { context: 'any' | 'fasting' | 'before-meal' | 'after-meal' | 'bedtime',
            rows: [{ from: 151, to: 200, units: 4 }] }  // mg/dL, inclusive
   Contexts are the same words vitals.js uses for a sugar reading.
   An insulin may have several charts, at most one per context.
   ========================================================= */
(function (root) {
  'use strict';

  var CONTEXTS = ['any', 'fasting', 'before-meal', 'after-meal', 'bedtime'];

  function isInt(x) { return typeof x === 'number' && x % 1 === 0; }
  function ctxOf(c) { return c.context || 'any'; }

  // null when the chart can be saved, else { row, error }:
  //   'empty' | 'range' (from > to or not whole mg/dL) | 'units' |
  //   'order' (rows not ascending) | 'overlap' | 'gap' | 'context' (unknown word)
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
    if (CONTEXTS.indexOf(ctxOf(chart)) < 0) return { row: -1, error: 'context' };
    return null;
  }

  // All of one insulin's charts: null, or { chart, error } ('no-chart',
  // 'duplicate-context', or the chart's own validate() error).
  function validateSet(charts) {
    if (!charts || !charts.length) return { chart: -1, error: 'no-chart' };
    var seen = {};
    for (var i = 0; i < charts.length; i++) {
      var e = validate(charts[i]);
      if (e) return { chart: i, error: e.error, row: e.row };
      if (seen[ctxOf(charts[i])]) return { chart: i, error: 'duplicate-context' };
      seen[ctxOf(charts[i])] = 1;
    }
    return null;
  }

  /* The chart for this reading's context: an exact match; for a fasting
     reading, the before-meal chart (fasting = before breakfast); then the
     'any' chart. The first chart found decides: if it is invalid the answer
     is no chart, never a silent fall-back to another one. */
  function pick(charts, context) {
    var list = charts || [], order = [context || 'any'];
    if (context === 'fasting') order.push('before-meal');
    order.push('any');
    for (var i = 0; i < order.length; i++) {
      for (var j = 0; j < list.length; j++) {
        if (list[j] && ctxOf(list[j]) === order[i]) return validate(list[j]) ? null : list[j];
      }
    }
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

  var api = { CONTEXTS: CONTEXTS, validate: validate, validateSet: validateSet, pick: pick, lookup: lookup };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KalingaScale = api;
})(this);
