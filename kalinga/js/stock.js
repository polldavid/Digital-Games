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
