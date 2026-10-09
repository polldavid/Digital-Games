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
  function isScale(med) { return !!(isInsulin(med) && med.insulin && med.insulin.mode === 'scale'); }
  function round2(x) { return Math.round(x * 100) / 100; }

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
       saveMed(med, by, opts?) -> { med } | { error: { field, error } }
       Sliding-scale insulin: every chart must be valid (one per context),
       and whenever the charts are new or changed the caregiver must confirm
       they were copied from the doctor's written instructions — passed as
       opts.confirmChart === true, never a field that rides along on the record.
       Editing a medicine never changes its stock count or needles: those move
       only through doses, setStockCount() and purchases. */
    self.checkMed = function (med) {
      if (!med || !String(med.name || '').trim()) return { field: 'name', error: 'no-name' };
      if (!med.elderId || !self.find('elders', med.elderId)) return { field: 'elderId', error: 'no-elder' };
      if (FORMS.indexOf(med.form) < 0) return { field: 'form', error: 'bad-form' };
      var d = med.dose || {}, scale = isScale(med);
      // A sliding scale has no fixed amount (the chart decides); anything else needs one.
      if (!String(d.unit || '').trim() || (d.amount != null && !(d.amount > 0)) || (!scale && d.amount == null)) return { field: 'dose', error: 'bad-dose' };
      if (med.prn && ((med.prn.minGapMin != null && !(med.prn.minGapMin >= 0)) || (med.prn.maxPerDay != null && !(med.prn.maxPerDay >= 0)))) return { field: 'prn', error: 'bad-limit' };
      if (isInsulin(med)) {
        var ins = med.insulin || {};
        if (ins.mode !== 'fixed' && ins.mode !== 'scale') return { field: 'insulin', error: 'bad-mode' };
        if (ins.mode === 'scale') {
          var ce = Scl.validateSet(ins.charts);
          if (ce) return ce.error === 'no-chart' ? { field: 'charts', error: 'no-chart' } : { field: 'charts', error: 'bad-chart', chart: ce.chart, detail: ce };
        }
      }
      return null;
    };
    self.saveMed = function (med, by, opts) {
      var err = self.checkMed(med);
      if (err) return { error: err };
      var old = med.id ? self.find('meds', med.id) : null;
      var m = clone(med);
      if (m.active == null) m.active = true;
      if (old) {
        m.stock = Object.assign({}, old.stock || {}, m.stock || {}, { count: old.stock && typeof old.stock.count === 'number' ? old.stock.count : null });
        if (m.insulin) m.insulin.needles = old.insulin && old.insulin.needles != null ? old.insulin.needles : (m.insulin.needles != null ? m.insulin.needles : null);
      } else {
        m.stock = Object.assign({ count: null, packSize: 0, lowDays: 7 }, m.stock || {}); // count null = not tracked
      }
      if (m.insulin) delete m.insulin.chartConfirmed;
      if (isScale(m)) {
        var before = old && isScale(old) ? JSON.stringify(old.insulin.charts) : null;
        if (before !== JSON.stringify(m.insulin.charts)) {
          if (!(opts && opts.confirmChart === true)) return { error: { field: 'charts', error: 'not-confirmed' } };
          m.insulin.chartConfirmedAt = clock();
          m.insulin.chartConfirmedBy = by || '';
        } else {
          m.insulin.chartConfirmedAt = old.insulin.chartConfirmedAt;
          m.insulin.chartConfirmedBy = old.insulin.chartConfirmedBy;
        }
      }
      return { med: old ? self.update('meds', m.id, m, by) : self.add('meds', m, by) };
    };

    // The caregiver counted what is left. -> med | null
    self.setStockCount = function (medId, count, by) {
      var med = self.find('meds', medId);
      if (!med || typeof count !== 'number' || !(count >= 0)) return null;
      return self.update('meds', medId, { stock: Object.assign({}, med.stock, { count: round2(count) }) }, by);
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
       recordDose({ elderId?, medId, scheduleId?, slotKey?, dueAt?, status, units?, by }) -> dose | null
       status: 'taken' | 'skipped' | 'snoozed' (anything else is refused).
       One record per (slotKey, medId); as-needed doses (no slotKey) are always new.
       units when taken: given, else the schedule's dose, else the medicine's.
       Sliding-scale insulin has no default: units must be given (null if not).
       Stock and needles follow the change exactly: taking uses the units, a
       re-confirm with other units adjusts by the difference, and taken ->
       skipped gives back what was taken (and the needle). A taken dose cannot
       go back to snoozed (a stale alarm screen must not re-open it). */
    var STATUSES = { taken: 1, skipped: 1, snoozed: 1 };
    self.recordDose = function (d) {
      var med = self.find('meds', d.medId);
      if (!med || !STATUSES[d.status]) return null;
      var sch = d.scheduleId ? self.find('schedules', d.scheduleId) : null, units = null;
      if (d.status === 'taken') {
        units = d.units != null ? d.units : isScale(med) ? null : sch && sch.dose ? sch.dose.amount : med.dose && med.dose.amount;
        if (typeof units !== 'number' || !(units >= 0)) return null;
      }
      var now = clock();
      var prev = d.slotKey ? self.list('doses', function (x) { return x.slotKey === d.slotKey && x.medId === d.medId; })[0] : null;
      var wasTaken = !!prev && prev.status === 'taken', prevUnits = wasTaken ? prev.units || 0 : 0;
      if (wasTaken && d.status === 'snoozed') return null;
      var rec = prev
        ? self.update('doses', prev.id, { status: d.status, units: units, actedAt: now, scheduleId: d.scheduleId || prev.scheduleId || null }, d.by, true)
        : self.add('doses', { elderId: d.elderId || med.elderId, medId: d.medId, scheduleId: d.scheduleId || null, slotKey: d.slotKey || null, dueAt: d.dueAt || now, status: d.status, units: units, actedAt: now }, d.by, true);
      var nowTaken = d.status === 'taken';
      adjustStock(med, (nowTaken ? units : 0) - prevUnits, (nowTaken ? 1 : 0) - (wasTaken ? 1 : 0), d.by);
      return rec;
    };
    // used: dose units to take off (negative gives back); needles: pen needles to take off.
    function adjustStock(med, used, needles, by) {
      var patch = {};
      if (used && Stk.tracked(med)) patch.stock = Object.assign({}, med.stock, { count: Math.max(0, round2(med.stock.count - used)) });
      if (needles && med.insulin && typeof med.insulin.needles === 'number') patch.insulin = Object.assign({}, med.insulin, { needles: Math.max(0, med.insulin.needles - needles) });
      if (patch.stock || patch.insulin) self.update('meds', med.id, patch, by, true);
    }

    // Times (ms) this as-needed med was taken, for schedule.prnAllowed().
    self.prnTaken = function (medId) {
      return self.list('doses', function (x) { return x.medId === medId && x.status === 'taken'; }).map(function (x) { return x.actedAt; });
    };

    /* ---------- Today ----------
       Every slot in [from, to) with each medicine's status:
       'taken' | 'skipped' | 'unconfirmed' (past the cutoff, no answer) |
       'due' (ringing now) | 'upcoming'. A snoozed dose counts as due.
       Answered doses whose slot no longer exists (the schedule was moved or
       removed) are still shown, as slots with orphan: true; and a slot item
       still to answer gets takenEarlier: true when the same schedule (or, for
       older records, the same medicine) was already taken in such a slot that
       day — so the screen can say "already taken" instead of a second dose. */
    function slotTime(key) {
      var m = /@(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(key || '');
      return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime() : null;
    }
    self.timeline = function (elderId, from, to, now) {
      var elder = self.find('elders', elderId);
      if (!elder) return [];
      var doses = {}, used = {}, orphans = {}, out;
      var answered = self.list('doses', function (x) { return x.elderId === elderId && x.slotKey; });
      answered.forEach(function (x) { doses[x.slotKey + '|' + x.medId] = x; });
      out = Sch.slots(elderId, self.list('meds'), self.list('schedules'), from, to).map(function (slot) {
        var cut = Sch.cutoff(slot.at, elder.alerts);
        slot.items.forEach(function (it) {
          var d = doses[slot.slotKey + '|' + it.medId];
          if (d) used[d.id] = 1;
          if (d && (d.status === 'taken' || d.status === 'skipped')) it.status = d.status;
          else if (now >= cut) it.status = 'unconfirmed';
          else if (now >= slot.at) it.status = 'due';
          else it.status = 'upcoming';
        });
        return slot;
      });
      answered.forEach(function (x) {
        if (used[x.id] || (x.status !== 'taken' && x.status !== 'skipped')) return;
        var at = slotTime(x.slotKey);
        if (at == null || at < from || at >= to) return;
        var g = orphans[x.slotKey] = orphans[x.slotKey] || { at: at, slotKey: x.slotKey, orphan: true, items: [] };
        g.items.push({ medId: x.medId, scheduleId: x.scheduleId || null, dose: null, status: x.status, units: x.units });
      });
      var extra = Object.keys(orphans).map(function (k) { return orphans[k]; });
      out.forEach(function (slot) {
        var day = Sch.dayKey(slot.at);
        slot.items.forEach(function (it) {
          if (it.status === 'taken' || it.status === 'skipped') return;
          extra.forEach(function (o) {
            if (Sch.dayKey(o.at) !== day) return;
            o.items.forEach(function (oi) {
              if (oi.status === 'taken' && (oi.scheduleId ? oi.scheduleId === it.scheduleId : oi.medId === it.medId)) it.takenEarlier = true;
            });
          });
        });
      });
      out = out.concat(extra).sort(function (a, b) { return a.at - b.at; });
      out.forEach(function (slot) {
        slot.status = slot.items.every(function (it) { return it.status === 'taken' || it.status === 'skipped'; }) ? 'done'
          : slot.items.some(function (it) { return it.status === 'unconfirmed'; }) ? 'unconfirmed'
          : slot.items.some(function (it) { return it.status === 'due'; }) ? 'due' : 'upcoming';
      });
      return out;
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
