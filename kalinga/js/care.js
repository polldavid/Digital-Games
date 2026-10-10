/* =========================================================
   Kalinga — care.js
   The caregiver's screens (behind the PIN on an elder's phone):
   - Ngayon: today's timeline, pinned readings, low stock,
     7-day adherence, "hand this phone to Papa".
   - Gamot: the medicine list and form (photo, purpose, form,
     amount, as-needed limits, schedule, stock, insulin fixed or
     sliding scale with the doctor-chart confirmation, voice clip).
   - Sukat: what is tracked, levels and reminders, history.
   - Iba pa: profile + conditions, change log, settings, backup.
   Forms keep a draft in App.ui.draft: inputs with
   data-bind="path" write into it as you type, so re-rendering
   the sheet (adding a time, a chart row) never loses typing.
   Rules are enforced by the store (saveMed, saveSchedule,
   setStockCount); this file only shows its error codes.
   ========================================================= */
(function () {
  'use strict';

  var App = window.KalingaApp, h = App.h, k = App.k, I = window.KalingaI18n, t = I.t;
  var Sch = window.KalingaSchedule, St = window.KalingaStock, V = window.KalingaVitals, C = window.KalingaConditions;
  var Voice = window.KalingaVoice, F = window.KalingaFiles, R = window.KalingaReminders;
  var esc = h.esc, DAY = h.DAY, MIN = h.MIN;

  function S() { return App.store; }
  function elder() { var d = S().get().device; return d.elderId ? S().find('elders', d.elderId) : null; }
  function by() { return S().get().device.name || 'Caregiver'; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* ---------- Draft binding ---------- */
  function setPath(obj, path, v) {
    var p = path.split('.'), o = obj;
    for (var i = 0; i < p.length - 1; i++) { if (o[p[i]] == null) o[p[i]] = /^\d+$/.test(p[i + 1]) ? [] : {}; o = o[p[i]]; }
    o[p[p.length - 1]] = v;
  }
  function bound(el) {
    var d = App.ui.draft; if (!d) return;
    var v = el.type === 'checkbox' ? el.checked : el.value;
    if (el.getAttribute('data-num') != null && el.type !== 'checkbox') v = el.value === '' ? null : parseFloat(el.value);
    setPath(d, el.getAttribute('data-bind'), v);
    if (el.hasAttribute('data-rerender')) h.renderSheet();
  }
  document.addEventListener('input', function (e) { var el = e.target.closest && e.target.closest('[data-bind]'); if (el && el.type !== 'radio' && el.tagName !== 'SELECT') bound(el); });
  document.addEventListener('change', function (e) { var el = e.target.closest && e.target.closest('[data-bind]'); if (el) bound(el); });
  function bind(path, rerender) { return ' data-bind="' + path + '"' + (rerender ? ' data-rerender' : ''); }
  function numBind(path, rerender) { return bind(path, rerender) + ' data-num'; }
  function v(x) { return x == null ? '' : esc(x); }

  /* ================= TODAY ================= */
  function today() {
    var el = elder(); if (!el) return '';
    var now = Date.now(), day = h.startOfDay(now), out = ['<h1>' + esc(t('dash.title', { name: el.name })) + '</h1>'];
    var meds = S().list('meds', function (m) { return m.elderId === el.id; });
    if (!meds.length) {
      out.push('<div class="card empty"><p>' + esc(t('dash.noMeds', { name: el.name })) + '</p><button class="btn btn--primary btn--lg" data-action="med-new">' + esc(t('dash.addMed')) + '</button></div>');
    } else {
      var slots = S().timeline(el.id, day, day + DAY, now);
      out.push('<div class="list">' + (slots.length ? slots.map(function (s) { return slotHtml(s); }).join('') : '<div class="card empty">' + esc(t('el.noMeds')) + '</div>') + '</div>');
      // adherence: last 7 full days + today so far
      var past = S().timeline(el.id, day - 7 * DAY, now, now), total = 0, taken = 0;
      past.forEach(function (s) { s.items.forEach(function (it) { if (it.status === 'taken') { taken++; total++; } else if (it.status === 'skipped' || it.status === 'unconfirmed') total++; }); });
      if (total) out.push('<div class="section-title">' + esc(t('dash.adherence')) + '</div><div class="card stat"><span class="stat__big">' + Math.round(taken / total * 100) + '%</span><span class="dim">' + taken + ' / ' + total + '</span></div>');
      var low = S().lowStock(el.id);
      if (low.length) out.push('<div class="section-title">' + esc(t('dash.lowStock')) + '</div><div class="list">' + low.map(function (m) {
        var d = St.daysLeft(m, S().list('schedules', function (s) { return s.medId === m.id; }));
        return '<button class="row" data-action="med-edit" data-id="' + esc(m.id) + '">' + k.medPic(m) + '<span class="row__main"><span class="row__title">' + esc(m.name) + '</span><span class="row__sub" style="display:block">' + esc(t('med.stockNow', { n: h.num(m.stock.count) })) + '</span></span><span class="badge badge--due">' + esc(d === Infinity ? '' : t('dash.daysLeft', { n: d })) + '</span></button>';
      }).join('') + '</div>');
    }
    // readings
    var types = S().list('vitalTypes', function (x) { return x.elderId === el.id; });
    if (types.length) {
      var pinned = types.filter(function (x) { return x.pinned; });
      out.push('<div class="section-title">' + esc(t('dash.latest')) + '</div><div class="list">' + (pinned.length ? pinned : types).slice(0, 3).map(vitalRow).join('') + '</div>');
    }
    out.push('<div class="section-title">' + esc(t('dash.phone', { name: el.name })) + '</div><div class="card" style="display:grid;gap:12px"><button class="btn btn--primary btn--lg btn--block" data-action="handover">🤲 ' + esc(t('dash.handOver', { name: el.name })) + '</button><p class="fineprint">' + esc(t('dash.handOverSub', { name: el.name })) + '</p><p class="note">' + esc(t('dash.warnOpen')) + '</p></div>');
    return out.join('');
  }
  function slotHtml(s) {
    var mark = s.orphan ? '' : s.status;
    return '<div class="slot' + (mark === 'due' ? ' slot--due' : mark === 'unconfirmed' ? ' slot--unconfirmed' : '') + '"><div><div class="slot__time">' + esc(h.fmtTime(s.at)) + '</div><div class="slot__part">' + esc(t('pod.' + Sch.partOfDay(s.at))) + '</div></div><div class="slot__items">' +
      s.items.map(function (it) {
        var m = S().find('meds', it.medId) || { name: '—' };
        var st = it.takenEarlier && it.status !== 'taken' && it.status !== 'skipped' ? 'takenEarlier' : it.status;
        var u = it.status === 'taken' && it.units != null ? it.units : null;
        return '<div class="slot__item"><span class="slot__name">' + esc(m.name) + (u != null && k.isScale(m) ? ' · ' + esc(u) + ' u' : '') + '</span><span class="badge badge--' + (st === 'takenEarlier' ? 'taken' : st) + '">' + k.statusIcon(st) + ' ' + esc(t('st.' + st)) + '</span></div>';
      }).join('') +
      (!s.orphan && (s.status === 'due' || s.status === 'unconfirmed') ? '<button class="btn btn--sm btn--soft" data-action="dose-open" data-key="' + esc(s.slotKey) + '">💊 ' + esc(t('st.due')) + '</button>' : '') +
      '</div></div>';
  }
  function readingsOf(type) { return S().list('readings', function (r) { return r.vitalTypeId === type.id; }).sort(function (a, b) { return a.at - b.at; }); }
  function vitalRow(type) {
    var rs = readingsOf(type), last = rs[rs.length - 1];
    var vd = last ? V.verdict(type, last.value) : null;
    var series = rs.slice(-14).map(function (r) { return { at: r.at, v: type.kind === 'pair' ? r.value.sys : r.value }; });
    return '<button class="row" data-action="vital-history" data-id="' + esc(type.id) + '"><span class="pillicon" aria-hidden="true">' + k.vitalIcon(type) + '</span><span class="row__main"><span class="row__title">' + esc(k.vitalName(type)) + '</span>' +
      '<span class="row__sub" style="display:block">' + (last ? '<b>' + esc(k.valueText(type, last.value)) + '</b> · ' + esc(h.dayLabel(last.at) + ' ' + h.fmtTime(last.at)) : esc(t('dash.noReadings'))) + '</span>' +
      (vd && vd.level !== 'ok' ? '<span class="badge badge--' + esc(vd.level) + '">' + k.statusIcon(vd.level) + ' ' + esc(k.levelWord(type, vd)) + '</span>' : '') + '</span>' +
      '<span class="row__end">' + k.spark(series) + '</span></button>';
  }

  /* ================= MEDICINES ================= */
  function schedulesOf(m) { return S().list('schedules', function (s) { return s.medId === m.id; }); }
  function ruleSummary(rule) {
    if (!rule || rule.prn) return t('meds.asNeeded');
    var times = (rule.times || []).slice().sort().map(h.fmtHM).join(', ');
    var days = (rule.weekdays || []).length ? rule.weekdays.map(function (d) { return WEEKDAYS()[d]; }).join(' ') : rule.everyN > 1 ? t('med.everyN') + ': ' + rule.everyN : t('meds.everyDay');
    return times + ' · ' + days + (rule.end ? ' → ' + rule.end : '');
  }
  function WEEKDAYS() { return I.getLang() === 'en' ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] : ['Lin', 'Lun', 'Mar', 'Miy', 'Huw', 'Biy', 'Sab']; }
  function medsView() {
    var el = elder(); if (!el) return '';
    var meds = S().list('meds', function (m) { return m.elderId === el.id; }).sort(function (a, b) { return (b.active !== false) - (a.active !== false) || a.name.localeCompare(b.name); });
    return '<h1>' + esc(t('meds.title', { name: el.name })) + '</h1><div style="margin:10px 0 14px;display:grid;gap:10px"><button class="btn btn--primary btn--lg btn--block" data-action="med-new">' + esc(t('dash.addMed')) + '</button>' +
      '<button class="btn btn--soft btn--lg btn--block" data-action="rx-import">📄 ' + esc(t('rx.import')) + '</button></div>' +
      (meds.length ? '<div class="list">' + meds.map(function (m) {
        var sch = schedulesOf(m)[0], d = St.daysLeft(m, schedulesOf(m));
        return '<button class="row" data-action="med-edit" data-id="' + esc(m.id) + '"' + (m.active === false ? ' style="opacity:.6"' : '') + '>' + k.medPic(m) +
          '<span class="row__main"><span class="row__title">' + esc(m.name) + '</span><span class="row__sub" style="display:block">' + esc((k.isScale(m) ? t('ins.scale') : k.amountText(m)) + (m.purpose ? ' · ' + m.purpose : '')) + '</span>' +
          '<span class="row__sub" style="display:block">' + esc(m.active === false ? t('meds.inactive') : m.prn && !sch ? t('meds.asNeeded') : ruleSummary(sch && sch.rule)) + '</span></span>' +
          (St.tracked(m) ? '<span class="row__end"><span class="badge badge--' + (St.isLow(m, schedulesOf(m)) ? 'due' : 'upcoming') + '">' + esc(d === Infinity ? h.num(m.stock.count) + '' : t('dash.daysLeft', { n: d })) + '</span></span>' : '') + '</button>';
      }).join('') + '</div>' : '<div class="card empty">' + esc(t('dash.noMeds', { name: el.name })) + '</div>');
  }

  function medDraft(m) {
    var el = elder(), sch = m ? schedulesOf(m)[0] : null, rule = sch && sch.rule;
    var d = m ? clone(m) : { elderId: el.id, name: '', purpose: '', form: 'tablet', dose: { amount: 1, unit: 'tablet' }, food: 'any', applyTo: '', photoId: null, voiceId: null, stock: { count: null, lowDays: 7 } };
    d._when = m ? (rule && !rule.prn ? 'sched' : (m.prn ? 'prn' : 'sched')) : 'sched';
    d._times = rule && rule.times ? rule.times.slice().sort() : ['08:00'];
    d._days = rule && (rule.weekdays || []).length ? 'weekdays' : rule && rule.everyN > 1 ? 'everyN' : 'every';
    d._weekdays = rule && rule.weekdays ? rule.weekdays.slice() : [];
    d._everyN = rule && rule.everyN > 1 ? rule.everyN : 2;
    d._start = rule ? rule.start : h.todayISO();
    d._end = rule ? rule.end || '' : '';
    d._gapH = m && m.prn && m.prn.minGapMin ? m.prn.minGapMin / 60 : null;
    d._max = m && m.prn && m.prn.maxPerDay ? m.prn.maxPerDay : null;
    d._scheduleId = sch ? sch.id : null;
    d._anchorOf = {};
    if (sch && sch.anchors) rule.times.forEach(function (tm, i) { if (sch.anchors[i]) d._anchorOf[tm] = sch.anchors[i]; });
    d._count = m ? null : null;
    d._confirm = false;
    d._unitTouched = !!m;
    if (k.isInsulin(d) && !d.insulin) d.insulin = { mode: 'fixed', charts: [], needles: null };
    if (d.insulin && d.insulin.mode === 'scale' && !(d.insulin.charts || []).length) d.insulin.charts = [newChart()];
    return d;
  }
  // A new chart starts EMPTY: sample numbers could be mistaken for the doctor's and saved as they are.
  function newChart() { return { context: 'any', rows: [{ from: null, to: null, units: null }] }; }

  function openMed(id) {
    var m = id ? S().find('meds', id) : null;
    App.ui.draft = medDraft(m);
    h.openSheet({ title: m ? t('meds.editTitle') : t('meds.newTitle'), html: medFormHtml, onclose: function () { Voice.cancelRecording(); App.ui.draft = null; recState = null; } });
  }

  var FORM_UNITS = ['tablet', 'capsule', 'ml', 'drop', 'puff', 'application', 'patch', 'units', 'dose'];
  function medFormHtml() {
    var d = App.ui.draft, el = elder(); if (!d) return '';
    var existing = d.id && S().find('meds', d.id);
    var ins = k.isInsulin(d), scale = ins && d.insulin && d.insulin.mode === 'scale';
    var purposes = S().list('conditions', function (c) { return c.elderId === el.id && c.libraryKey; }).map(function (c) { var e = C.get(c.libraryKey); return e ? e.purpose[I.getLang() === 'en' ? 'en' : 'tl'] : null; }).filter(Boolean);
    var out = '<form class="form" id="med-form" novalidate>';
    out += h.field(t('med.name'), '<input class="input input--lg" name="name" maxlength="60" value="' + v(d.name) + '" placeholder="' + esc(t('med.namePh')) + '"' + bind('name') + ' autofocus />');
    out += h.field(t('med.purpose', { name: el.name }), '<input class="input" name="purpose" maxlength="80" list="purpose-list" value="' + v(d.purpose) + '" placeholder="' + esc(t('med.purposePh')) + '"' + bind('purpose') + ' /><datalist id="purpose-list">' + purposes.map(function (p) { return '<option value="' + esc(p) + '"></option>'; }).join('') + '</datalist>');
    // photo
    out += '<div class="field"><span class="field__label">' + esc(t('med.photo')) + '</span><div style="display:flex;gap:12px;align-items:center">' + (d.photoId ? '<img class="thumb" style="width:84px;height:84px" data-photo="' + esc(d.photoId) + '" alt="" />' : '<span class="pillicon" style="width:84px;height:84px">' + (k.FORM_ICON[d.form] || '💊') + '</span>') +
      '<div style="display:grid;gap:8px"><label class="btn btn--soft">📷 ' + esc(t('c.takePhoto')) + '<input type="file" accept="image/*" capture="environment" data-action-change="med-photo" hidden /></label>' + (d.photoId ? '<button type="button" class="btn btn--sm btn--ghost" data-action="med-photo-remove">' + esc(t('c.removePhoto')) + '</button>' : '') + '</div></div><span class="field__hint">' + esc(t('med.photoHint', { name: el.name })) + '</span></div>';
    out += h.field(t('med.form'), h.select('form', window.KalingaStore.FORMS.map(function (f) { return [f, t('form.' + f)]; }), d.form, bind('form', true)));
    // amount
    if (!scale) {
      out += '<div class="field" data-err-anchor><span class="field__label">' + esc(ins ? t('ins.units') : t('med.dose')) + '</span><div class="grid2"><input class="input input--lg" name="dose" type="number" inputmode="decimal" min="0" step="0.25" value="' + v(d.dose && d.dose.amount) + '"' + numBind('dose.amount') + ' />' +
        (ins ? '<span class="input" style="display:flex;align-items:center">' + esc(t('unit.units')) + '</span>' : h.select('unit', FORM_UNITS.map(function (u) { return [u, k.unitWord(u)]; }), d.dose && d.dose.unit, bind('dose.unit') + ' data-action-change="unit-touched"')) + '</div></div>';
    }
    if (k.APPLY_FORMS[d.form]) out += h.field(t('med.applyTo'), '<input class="input" name="applyTo" maxlength="40" value="' + v(d.applyTo) + '" placeholder="' + esc(t('med.applyToPh')) + '"' + bind('applyTo') + ' />');
    out += h.field(t('med.food'), h.select('food', [['any', t('food.any')], ['with', t('food.with')], ['before', t('food.before')], ['after', t('food.after')]], d.food || 'any', bind('food')));
    // insulin
    if (ins) out += insulinHtml(d);
    // when
    out += '<div class="field"><span class="field__label">' + esc(t('med.when')) + '</span>' + h.seg('_when', [['sched', t('med.scheduled')], ['prn', t('med.prn')]], d._when).replace(/name="_when"/g, 'name="_when"' + bind('_when', true)) + '</div>';
    if (d._when === 'sched') out += scheduleHtml(d);
    else out += '<div class="box"><p class="fineprint">' + esc(t('med.prnHint')) + '</p><div class="grid2">' + h.field(t('med.prnGap'), '<input class="input" name="prn" type="number" min="0" step="0.5" inputmode="decimal" value="' + v(d._gapH) + '"' + numBind('_gapH') + ' />') + h.field(t('med.prnMax'), '<input class="input" name="prnMax" type="number" min="0" step="1" inputmode="numeric" value="' + v(d._max) + '"' + numBind('_max') + ' />') + '</div></div>';
    // stock
    if (existing && St.tracked(existing)) {
      out += '<div class="field"><span class="field__label">' + esc(t('med.stock')) + '</span><div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap"><b style="font-size:calc(20 * var(--u))">' + esc(t('med.stockNow', { n: h.num(existing.stock.count) })) + '</b><button type="button" class="btn btn--sm" data-action="med-recount">' + esc(t('med.recount')) + '</button></div></div>';
    } else {
      out += h.field(t('med.stock'), '<input class="input" name="count" type="number" min="0" step="0.5" inputmode="decimal" value="' + v(d._count) + '"' + numBind('_count') + ' />', esc(t('med.stockHint')));
    }
    out += h.field(t('med.lowDays'), '<input class="input" name="lowDays" type="number" min="0" step="1" inputmode="numeric" value="' + v(d.stock && d.stock.lowDays) + '"' + numBind('stock.lowDays') + ' />');
    // voice
    out += '<div class="field"><span class="field__label">' + esc(t('med.voice')) + '</span><div class="btn-row">' +
      (recState ? '<button type="button" class="btn btn--danger" data-action="med-rec-stop">' + esc(t('med.stopRec')) + '</button>' : Voice.canRecord() ? '<button type="button" class="btn btn--soft" data-action="med-rec">' + esc(t('med.record')) + '</button>' : '') +
      (d.voiceId ? '<button type="button" class="btn" data-action="med-play">' + esc(t('med.play')) + '</button><button type="button" class="btn btn--ghost" data-action="med-voice-remove">✕</button>' : '') + '</div><span class="field__hint">' + esc(t('med.voiceHint')) + '</span></div>';
    out += '<div class="btn-row sheet-save"><button type="button" class="btn btn--primary btn--lg" data-action="med-save">' + esc(t('c.save')) + '</button></div>';
    if (existing) out += '<div class="btn-row" style="margin-top:4px"><button type="button" class="btn" data-action="med-toggle-active">' + esc(existing.active === false ? t('med.resumeMed') : t('med.stopMed')) + '</button><button type="button" class="btn btn--ghost" style="color:var(--bad)" data-action="med-delete">' + esc(t('c.delete')) + '</button></div>';
    return out + '</form>';
  }
  function scheduleHtml(d) {
    var out = '<div class="box">';
    out += '<div class="field" data-err-anchor><span class="field__label">' + esc(t('med.times')) + '</span><div class="chips" id="times">' + d._times.map(function (tm, i) {
      var an = d._anchorOf && d._anchorOf[tm];
      return '<span class="chip chip--on">' + esc(h.fmtHM(tm)) + (an ? ' · ' + esc(t('prof.' + an.meal)) + (an.offset ? ' ' + (an.offset > 0 ? '+' : '−') + Math.abs(an.offset) + 'm' : '') : '') + '<button type="button" class="chip__x" data-action="time-remove" data-value="' + i + '" aria-label="' + esc(t('c.delete')) + ' ' + esc(h.fmtHM(tm)) + '">✕</button></span>';
    }).join('') + '</div><input type="hidden" name="times" />' +
      '<div class="chips" style="margin-top:8px">' + ['06:00', '07:00', '08:00', '12:00', '13:00', '18:00', '20:00', '21:00'].filter(function (x) { return d._times.indexOf(x) < 0; }).map(function (x) {
        return '<button type="button" class="chip" data-action="time-add" data-value="' + x + '">+ ' + esc(h.fmtHM(x)) + '</button>';
      }).join('') + '</div><div style="display:flex;gap:8px;margin-top:8px"><input class="input" type="time" id="time-custom" name="timeCustom" style="max-width:180px" /><button type="button" class="btn" data-action="time-add-custom">' + esc(t('med.addTime')) + '</button></div></div>';
    out += '<div class="field"><span class="field__label">' + esc(t('med.days')) + '</span>' + h.seg('_days', [['every', t('days.every')], ['weekdays', t('days.weekdays')], ['everyN', t('days.everyN')]], d._days).replace(/name="_days"/g, 'name="_days"' + bind('_days', true)) + '</div>';
    if (d._days === 'weekdays') out += '<div class="chips" data-err-anchor>' + WEEKDAYS().map(function (w, i) { var on = d._weekdays.indexOf(i) >= 0; return '<button type="button" class="chip' + (on ? ' chip--on' : '') + '" data-action="weekday" data-value="' + i + '" aria-pressed="' + on + '">' + w + '</button>'; }).join('') + '</div><input type="hidden" name="weekdays" />';
    if (d._days === 'everyN') out += h.field(t('med.everyN'), '<input class="input" name="everyN" type="number" min="2" max="90" step="1" inputmode="numeric" value="' + v(d._everyN) + '"' + numBind('_everyN') + ' />');
    out += '<div class="grid2">' + h.field(t('med.start'), '<input class="input" type="date" name="start" value="' + v(d._start) + '"' + bind('_start') + ' />') + h.field(t('med.end'), '<input class="input" type="date" name="end" value="' + v(d._end) + '"' + bind('_end') + ' />') + '</div>';
    return out + '</div>';
  }
  function insulinHtml(d) {
    if (!d.insulin) d.insulin = { mode: 'fixed', charts: [], needles: null };
    var ins = d.insulin, out = '<div class="box"><div class="field"><span class="field__label">' + esc(t('ins.mode')) + '</span>' + h.seg('_insMode', [['fixed', t('ins.fixed')], ['scale', t('ins.scale')]], ins.mode).replace(/name="_insMode"/g, 'name="_insMode"' + bind('insulin.mode', true)) + '</div>';
    out += h.field(t('ins.needles'), '<input class="input" name="needles" type="number" min="0" step="1" inputmode="numeric" value="' + v(ins.needles) + '"' + numBind('insulin.needles') + (d.id && S().find('meds', d.id) ? ' disabled' : '') + ' />');
    if (ins.mode === 'scale') {
      out += '<div class="note">' + esc(t('ins.chartHint')) + '</div><input type="hidden" name="charts" />';
      (ins.charts || []).forEach(function (c, ci) {
        out += '<div class="box" style="background:var(--card)"><div class="box__head"><span>' + esc(t('ins.chart')) + ' ' + (ci + 1) + '</span>' + (ins.charts.length > 1 ? '<button type="button" class="btn btn--sm btn--ghost" data-action="chart-remove" data-value="' + ci + '">✕</button>' : '') + '</div>' +
          h.field(t('ins.context'), h.select('ctx' + ci, window.KalingaScale.CONTEXTS.map(function (x) { return [x, t('ctx.' + x)]; }), c.context || 'any', bind('insulin.charts.' + ci + '.context'))) +
          '<div style="display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:6px;align-items:end"><span class="field__label">' + esc(t('ins.from')) + '</span><span class="field__label">' + esc(t('ins.to')) + '</span><span class="field__label">' + esc(t('ins.u')) + '</span><span></span>' +
          c.rows.map(function (r, ri) {
            var p = 'insulin.charts.' + ci + '.rows.' + ri + '.';
            return '<input class="input" type="number" inputmode="numeric" value="' + v(r.from) + '"' + numBind(p + 'from') + ' aria-label="' + esc(t('ins.from')) + '" /><input class="input" type="number" inputmode="numeric" value="' + v(r.to) + '"' + numBind(p + 'to') + ' aria-label="' + esc(t('ins.to')) + '" /><input class="input" type="number" inputmode="decimal" step="0.5" value="' + v(r.units) + '"' + numBind(p + 'units') + ' aria-label="' + esc(t('ins.u')) + '" />' +
              '<button type="button" class="iconbtn" data-action="row-remove" data-value="' + ci + ':' + ri + '" aria-label="' + esc(t('c.delete')) + '">✕</button>';
          }).join('') + '</div><button type="button" class="btn btn--sm" data-action="row-add" data-value="' + ci + '">' + esc(t('ins.addRow')) + '</button></div>';
      });
      out += '<button type="button" class="btn btn--sm btn--soft" data-action="chart-add">' + esc(t('ins.addChart')) + '</button>';
      out += '<label class="check" data-err-anchor><input type="checkbox" name="confirm"' + (d._confirm ? ' checked' : '') + bind('_confirm') + ' /><span>' + esc(t('ins.confirm')) + '</span></label>';
    }
    return out + '</div>';
  }

  var recState = null;
  function saveMed() {
    var d = App.ui.draft, form = h.$('#med-form'), el = elder(); if (!d || !form) return;
    h.clearFieldErrors(form);
    var ins = k.isInsulin(d), scale = ins && d.insulin.mode === 'scale';
    var rule = null;
    // A time typed in the box but not added with '+ Time' still counts.
    var pend = h.$('#time-custom');
    if (d._when === 'sched' && pend && /^\d\d:\d\d$/.test(pend.value) && d._times.indexOf(pend.value) < 0) { d._times.push(pend.value); d._times.sort(); }
    if (d._when === 'sched') {
      rule = { times: d._times.slice().sort(), weekdays: d._days === 'weekdays' ? d._weekdays.slice().sort() : [], everyN: d._days === 'everyN' ? d._everyN : 0, start: d._start, end: d._end || '', prn: false };
      var re = Sch.validate(rule);
      if (re) { h.fieldError(form, { times: 'timeCustom', weekdays: '_days', everyN: 'everyN', start: 'start', end: 'end' }[re.field] || 'timeCustom', I.err(re)); return; }
    }
    var med = {};
    Object.keys(d).forEach(function (key) { if (key.charAt(0) !== '_') med[key] = d[key]; });
    med.name = String(med.name || '').trim(); med.purpose = String(med.purpose || '').trim();
    med.dose = clone(d.dose || {});
    if (ins) med.dose.unit = 'units';
    if (scale) delete med.dose.amount;
    med.prn = d._when === 'prn' ? { minGapMin: d._gapH ? Math.round(d._gapH * 60) : 0, maxPerDay: d._max || 0 } : null;
    if (!med.id) med.stock = { count: d._count == null || isNaN(d._count) ? null : d._count, packSize: 0, lowDays: d.stock && d.stock.lowDays != null ? d.stock.lowDays : 7 };
    if (!ins) delete med.insulin;
    else if (!scale) med.insulin = { mode: 'fixed', needles: d.insulin.needles == null ? null : d.insulin.needles };
    var res = S().saveMed(med, by(), { confirmChart: !!d._confirm });
    if (res.error) { h.fieldError(form, { name: 'name', form: 'form', dose: 'dose', prn: 'prn', charts: scale && res.error.error === 'not-confirmed' ? 'confirm' : 'ctx' + (res.error.chart > 0 ? res.error.chart : 0), insulin: 'form', elderId: 'name' }[res.error.field] || 'name', I.err(res.error)); return; }
    var saved = res.med;
    // An existing medicine that wasn't counted yet: the typed count starts the count.
    if (d.id && d._count != null && !isNaN(d._count) && !St.tracked(saved)) S().setStockCount(saved.id, d._count, by());
    if (rule) {
      var sr = S().saveSchedule({ id: d._scheduleId || undefined, medId: saved.id, rule: rule, anchors: rule.times.map(function (tm) { return (d._anchorOf && d._anchorOf[tm]) || null; }) }, by());
      if (sr.error) { h.fieldError(form, 'timeCustom', I.err(sr.error)); return; }
    } else if (d._scheduleId) S().remove('schedules', d._scheduleId, by());
    App.commit();
    h.closeSheet();
    h.toast(t('c.saved') + ' · ' + saved.name);
    App.render();
  }

  /* ================= VITALS ================= */
  function vitalsView() {
    var el = elder(); if (!el) return '';
    var types = S().list('vitalTypes', function (x) { return x.elderId === el.id; });
    return '<h1>' + esc(t('vit.title', { name: el.name })) + '</h1>' +
      (types.length ? '<div class="list" style="margin-top:10px">' + types.map(function (type) {
        return '<div style="display:grid;gap:6px">' + vitalRow(type) + '<div class="btn-row"><button class="btn btn--sm btn--soft" data-action="rd-start" data-id="' + esc(type.id) + '">＋ ' + esc(t('el.measure')) + '</button><button class="btn btn--sm" data-action="vital-edit" data-id="' + esc(type.id) + '">' + esc(t('c.edit')) + '</button></div></div>';
      }).join('') + '</div>' : '<div class="card empty" style="margin-top:10px">' + esc(t('vit.none', { name: el.name })) + '</div>') +
      '<div style="margin-top:16px"><button class="btn btn--primary btn--lg btn--block" data-action="vital-add">' + esc(t('vit.add')) + '</button></div>';
  }
  function openVitalAdd() {
    h.openSheet({ title: t('vit.add'), html: '<div class="list">' + ['sugar', 'bp', 'weight', 'pulse', 'temp', 'spo2', 'symptom', 'custom'].map(function (key) {
      return '<button class="row" data-action="vital-new" data-value="' + key + '"><span class="pillicon" aria-hidden="true">' + k.vitalIcon({ key: key }) + '</span><span class="row__main"><span class="row__title">' + esc(t('vit.' + key)) + '</span></span></button>';
    }).join('') + '</div>' });
  }
  function openVital(id, key) {
    var el = elder(), type = id ? S().find('vitalTypes', id) : null;
    var d = type ? clone(type) : V.template(key);
    if (!type) { d.elderId = el.id; d.logReminders = []; d.pinned = S().list('vitalTypes', function (x) { return x.elderId === el.id && x.pinned; }).length < 3; if (key !== 'symptom' && key !== 'custom') d.name = V.TEMPLATES[key].name; else d.name = ''; }
    d._isNew = !type;
    App.ui.draft = d;
    h.openSheet({ title: type ? t('vit.edit') : t('vit.' + key), html: vitalFormHtml, onclose: function () { App.ui.draft = null; } });
  }
  function vitalFormHtml() {
    var d = App.ui.draft, el = elder(); if (!d) return '';
    var out = '<form class="form" id="vital-form" novalidate>';
    if (d.key === 'symptom' || d.key === 'custom') out += h.field(t('vit.name'), '<input class="input input--lg" name="name" maxlength="30" value="' + v(d.name) + '"' + bind('name') + ' autofocus />');
    if (d.key === 'symptom') out += h.field(t('vit.bodyPart'), '<input class="input" name="bodyPart" maxlength="30" value="' + v(d.bodyPart) + '"' + bind('bodyPart') + ' />');
    if (d.key === 'custom') out += h.field('Unit', '<input class="input" name="unit" maxlength="12" value="' + v(d.unit) + '"' + bind('unit') + ' />');
    if (d.kind === 'face') {
      out += h.field(t('vit.faceHigh'), h.select('high', [2, 3, 4, 5].map(function (n) { return [n, k.FACES[n - 1] + ' ' + t('face.' + n)]; }), d.high, numBind('high')));
      out += h.field(t('vit.streak'), '<input class="input" name="streakDays" type="number" min="1" max="14" value="' + v(d.streakDays) + '"' + numBind('streakDays') + ' />');
    } else if (d.kind === 'pair') {
      out += '<div class="grid2">' + h.field(t('vit.low') + ' (sys)', '<input class="input" name="low" type="number" inputmode="numeric" value="' + v(d.low && d.low.sys) + '"' + numBind('low.sys') + ' />') + h.field('(dia)', '<input class="input" type="number" inputmode="numeric" value="' + v(d.low && d.low.dia) + '"' + numBind('low.dia') + ' />') + '</div>';
      out += '<div class="grid2">' + h.field(t('vit.high') + ' (sys)', '<input class="input" name="high" type="number" inputmode="numeric" value="' + v(d.high && d.high.sys) + '"' + numBind('high.sys') + ' />') + h.field('(dia)', '<input class="input" type="number" inputmode="numeric" value="' + v(d.high && d.high.dia) + '"' + numBind('high.dia') + ' />') + '</div>';
    } else {
      var shown = function (x) { return x == null ? '' : h.num(k.toShown(d, x)); };
      out += '<div class="grid2">' + h.field(t('vit.low') + ' (' + esc(k.unitOf(d)) + ')', '<input class="input" name="low" type="number" inputmode="decimal" step="any" value="' + shown(d.low) + '" data-shown="low" />') + h.field(t('vit.high') + ' (' + esc(k.unitOf(d)) + ')', '<input class="input" name="high" type="number" inputmode="decimal" step="any" value="' + shown(d.high) + '" data-shown="high" />') + '</div>';
    }
    out += '<p class="fineprint">' + esc(t('vit.levelsHint', { name: el.name })) + '</p>';
    out += '<div class="field"><span class="field__label">' + esc(t('vit.remind')) + '</span><div class="chips">' + (d.logReminders || []).map(function (tm, i) {
      return '<span class="chip chip--on">' + esc(h.fmtHM(tm)) + '<button type="button" class="chip__x" data-action="vtime-remove" data-value="' + i + '" aria-label="' + esc(t('c.delete')) + '">✕</button></span>';
    }).join('') + '</div><div style="display:flex;gap:8px;margin-top:8px"><input class="input" type="time" id="vtime-custom" style="max-width:180px" /><button type="button" class="btn" data-action="vtime-add">' + esc(t('med.addTime')) + '</button></div></div>';
    out += '<label class="check"><input type="checkbox"' + (d.pinned ? ' checked' : '') + bind('pinned') + ' /><span>' + esc(t('vit.pinned')) + '</span></label>';
    out += '<div class="btn-row sheet-save"><button type="button" class="btn btn--primary btn--lg" data-action="vital-save">' + esc(t('c.save')) + '</button></div>';
    if (!d._isNew) out += '<button type="button" class="btn btn--ghost" style="color:var(--bad)" data-action="vital-remove">' + esc(t('c.delete')) + '</button>';
    return out + '</form>';
  }
  function saveVital() {
    var d = App.ui.draft, form = h.$('#vital-form'); if (!d || !form) return;
    h.clearFieldErrors(form);
    var vp = h.$('#vtime-custom');
    if (vp && /^\d\d:\d\d$/.test(vp.value)) { d.logReminders = d.logReminders || []; if (d.logReminders.indexOf(vp.value) < 0) { d.logReminders.push(vp.value); d.logReminders.sort(); } }
    var type = {};
    Object.keys(d).forEach(function (key) { if (key.charAt(0) !== '_') type[key] = d[key]; });
    if (type.kind === 'number') {
      h.$all('[data-shown]', form).forEach(function (inp) { var x = inp.value === '' ? null : parseFloat(inp.value); type[inp.getAttribute('data-shown')] = x == null || isNaN(x) ? null : k.fromShown(type, x); });
    }
    if (type.kind === 'pair') ['low', 'high'].forEach(function (f) { if (type[f] && (type[f].sys == null || type[f].dia == null)) type[f] = null; });
    type.name = String(type.name || '').trim();
    var err = V.validateType(type);
    if (err) { h.fieldError(form, err.field === 'danger' || err.field === 'target' ? 'high' : err.field, I.err(err)); return; }
    if (d._isNew) S().add('vitalTypes', type, by()); else S().update('vitalTypes', type.id, type, by());
    App.commit(); h.closeSheet(); App.render();
  }
  function openHistory(id) {
    var type = S().find('vitalTypes', id); if (!type) return;
    h.openSheet({ title: k.vitalIcon(type) + ' ' + k.vitalName(type), html: function () {
      var rs = readingsOf(type).reverse();
      var series = rs.slice(0, 60).reverse().map(function (r) { return { at: r.at, v: type.kind === 'pair' ? r.value.sys : r.value }; });
      return (series.length > 1 ? '<div class="card" style="color:var(--brand)">' + k.spark(series, true) + '</div>' : '') +
        '<div class="btn-row" style="margin:12px 0"><button class="btn btn--soft" data-action="rd-start" data-id="' + esc(type.id) + '">＋ ' + esc(t('el.measure')) + '</button></div>' +
        '<div class="list">' + (rs.length ? rs.map(function (r) {
          var vd = V.verdict(type, r.value);
          return '<div class="row">' + (r.photoId ? '<img class="thumb" data-photo="' + esc(r.photoId) + '" alt="" />' : '') + '<span class="row__main"><span class="row__title">' + esc(k.valueText(type, r.value)) + '</span><span class="row__sub" style="display:block">' + esc(h.dayLabel(r.at) + ' ' + h.fmtTime(r.at) + (r.context ? ' · ' + t('ctx.' + r.context) : '') + (r.by ? ' · ' + r.by : '')) + '</span></span>' +
            (vd.level !== 'ok' ? '<span class="badge badge--' + esc(vd.level) + '">' + k.statusIcon(vd.level) + ' ' + esc(k.levelWord(type, vd)) + '</span>' : '') +
            '<button class="iconbtn" data-action="reading-remove" data-id="' + esc(r.id) + '" aria-label="' + esc(t('c.delete')) + '">🗑</button></div>';
        }).join('') : '<div class="card empty">' + esc(t('dash.noReadings')) + '</div>') + '</div>';
    } });
  }

  /* ================= PROFILE + CONDITIONS ================= */
  function openProfile(isNew) {
    var el = isNew ? null : elder();
    var conds = el ? S().list('conditions', function (c) { return c.elderId === el.id; }) : [];
    App.ui.draft = {
      _new: !el, name: el ? el.name : '', photoId: el ? el.photoId : null, allergies: el ? el.allergies : '', bloodType: el ? el.bloodType : '',
      contacts: el ? (Array.isArray(el.contacts) ? el.contacts.map(function (c) { return c.name + ' — ' + c.number; }).join('\n') : el.contacts || '') : '',
      _rering: el ? (el.alerts.rerings || []).join(', ') : '10, 20', _cutoff: el ? el.alerts.cutoffMin : 30,
      _routine: Object.assign({}, window.KalingaRxImport.ROUTINE, (el && el.routine) || {}),
      _conds: conds.filter(function (c) { return c.libraryKey; }).map(function (c) { return c.libraryKey; }),
      _custom: conds.filter(function (c) { return !c.libraryKey; }).map(function (c) { return c.name; }),
      _untick: {}
    };
    h.openSheet({ title: el ? t('prof.title', { name: el.name }) : t('welcome.title'), html: profileHtml, onclose: function () { App.ui.draft = null; } });
  }
  function profileHtml() {
    var d = App.ui.draft, el = d._new ? null : elder(); if (!d) return '';
    var nm = d.name || '…';
    var out = '<form class="form" id="profile-form" novalidate>';
    out += h.field(t('welcome.name'), '<input class="input input--lg" name="name" maxlength="30" value="' + v(d.name) + '"' + bind('name') + ' />');
    out += '<div class="field"><span class="field__label">' + esc(t('c.photo')) + '</span><div style="display:flex;gap:12px;align-items:center">' + (d.photoId ? '<img class="thumb" style="width:72px;height:72px;border-radius:50%" data-photo="' + esc(d.photoId) + '" alt="" />' : '') + '<label class="btn btn--soft">📷 ' + esc(t('c.takePhoto')) + '<input type="file" accept="image/*" data-action-change="profile-photo" hidden /></label></div></div>';
    // conditions
    out += '<div class="field"><span class="field__label">' + esc(t('cond.title', { name: nm })) + '</span><span class="field__hint">' + esc(t('cond.hint')) + '</span><div class="chips">' + C.list().map(function (c) {
      var on = d._conds.indexOf(c.key) >= 0;
      return '<button type="button" class="chip' + (on ? ' chip--on' : '') + '" data-action="cond-toggle" data-value="' + c.key + '" aria-pressed="' + on + '">' + esc(I.getLang() === 'en' ? c.en : c.tl) + '</button>';
    }).join('') + d._custom.map(function (c, i) { return '<span class="chip chip--on">' + esc(c) + '<button type="button" class="chip__x" data-action="cond-custom-remove" data-value="' + i + '">✕</button></span>'; }).join('') +
      '</div><div style="display:flex;gap:8px;margin-top:8px"><input class="input" id="cond-custom" maxlength="40" placeholder="' + esc(t('cond.customPh')) + '" /><button type="button" class="btn" data-action="cond-custom-add">' + esc(t('c.add')) + '</button></div></div>';
    // suggestions not yet tracked
    var tracked = el ? S().list('vitalTypes', function (x) { return x.elderId === el.id; }) : [];
    var sugg = C.combined(d._conds).filter(function (s) { return !tracked.some(function (x) { return x.key === s.key && (s.key !== 'symptom' || x.name.toLowerCase() === s.name.toLowerCase()); }); });
    if (sugg.length) out += '<div class="box"><div class="box__head">' + esc(t('cond.suggest')) + '</div>' + sugg.map(function (s) {
      var id = s.key + ':' + s.name, on = !d._untick[id];
      return '<label class="check"><input type="checkbox" data-action-change="sugg-toggle" data-value="' + esc(id) + '"' + (on ? ' checked' : '') + ' /><span>' + k.vitalIcon(s) + ' ' + esc(k.vitalName(s)) + (s.logReminders.length ? ' <span class="faint">· ⏰ ' + esc(s.logReminders.map(h.fmtHM).join(', ')) + '</span>' : '') + '</span></label>';
    }).join('') + '</div>';
    out += h.field(t('prof.allergies'), '<input class="input" name="allergies" maxlength="100" value="' + v(d.allergies) + '"' + bind('allergies') + ' />');
    out += h.field(t('prof.bloodType'), h.select('bloodType', [['', '—'], ['A+', 'A+'], ['A-', 'A−'], ['B+', 'B+'], ['B-', 'B−'], ['AB+', 'AB+'], ['AB-', 'AB−'], ['O+', 'O+'], ['O-', 'O−']], d.bloodType, bind('bloodType')));
    out += h.field(t('prof.contacts'), '<textarea class="input" name="contacts" rows="3" placeholder="' + esc(t('prof.contactsPh')) + '"' + bind('contacts') + '>' + v(d.contacts) + '</textarea>');
    out += '<div class="field"><span class="field__label">' + esc(t('prof.routine')) + '</span><span class="field__hint">' + esc(t('prof.routineHint')) + '</span><div class="grid2">' +
      ['breakfast', 'lunch', 'dinner', 'bedtime'].map(function (k2) { return h.field(t('prof.' + k2), '<input class="input" type="time" name="r_' + k2 + '" value="' + v(d._routine[k2]) + '"' + bind('_routine.' + k2) + ' />'); }).join('') + '</div></div>';
    out += '<div class="grid2">' + h.field(t('prof.rering'), '<input class="input" name="rering" value="' + v(d._rering) + '"' + bind('_rering') + ' />') + h.field(t('prof.cutoff'), '<input class="input" name="cutoff" type="number" min="5" max="240" value="' + v(d._cutoff) + '"' + numBind('_cutoff') + ' />') + '</div>';
    out += '<div class="btn-row sheet-save"><button type="button" class="btn btn--primary btn--lg" data-action="profile-save">' + esc(t('c.save')) + '</button></div>';
    return out + '</form>';
  }
  function saveProfile() {
    var d = App.ui.draft, form = h.$('#profile-form'); if (!d || !form) return;
    h.clearFieldErrors(form);
    var name = String(d.name || '').trim();
    if (!name) { h.fieldError(form, 'name', t('err.no-name')); return; }
    var rerings = String(d._rering || '').split(/[,\s]+/).map(Number).filter(function (x) { return x > 0 && x < 240; });
    var cutoff = d._cutoff > 0 ? d._cutoff : 30;
    if (rerings.some(function (x) { return x >= cutoff; })) { h.fieldError(form, 'rering', I.getLang() === 'en' ? 'Re-rings must come before the cutoff.' : 'Dapat mas maaga ang pag-ring ulit kaysa sa cutoff.'); return; }
    var contacts = window.KalingaElder.parseContacts(d.contacts);
    var routine = {};
    ['breakfast', 'lunch', 'dinner', 'bedtime'].forEach(function (k2) { routine[k2] = /^\d\d:\d\d$/.test(d._routine[k2] || '') ? d._routine[k2] : window.KalingaRxImport.ROUTINE[k2]; });
    var fields = { name: name, photoId: d.photoId || null, allergies: d.allergies || '', bloodType: d.bloodType || '', contacts: contacts, alerts: { rerings: rerings, cutoffMin: cutoff }, routine: routine };
    var oldRoutine = !d._new && elder() ? JSON.stringify(elder().routine || {}) : null;
    var el = d._new ? S().addElder(fields, by()) : S().update('elders', elder().id, fields, by());
    var shift = oldRoutine && oldRoutine !== JSON.stringify(routine) ? S().routineShift(el.id, routine) : [];
    var dev = S().get().device;
    dev.elderId = el.id;
    // conditions
    var have = S().list('conditions', function (c) { return c.elderId === el.id; });
    have.forEach(function (c) { if (c.libraryKey ? d._conds.indexOf(c.libraryKey) < 0 : d._custom.indexOf(c.name) < 0) S().remove('conditions', c.id, by()); });
    d._conds.forEach(function (key) { if (!have.some(function (c) { return c.libraryKey === key; })) S().add('conditions', { elderId: el.id, libraryKey: key, name: C.get(key).en }, by()); });
    d._custom.forEach(function (n) { if (!have.some(function (c) { return !c.libraryKey && c.name === n; })) S().add('conditions', { elderId: el.id, libraryKey: null, name: n }, by()); });
    // ticked suggestions become tracked types
    var tracked = S().list('vitalTypes', function (x) { return x.elderId === el.id; });
    C.combined(d._conds).forEach(function (s) {
      var id = s.key + ':' + s.name;
      if (d._untick[id]) return;
      if (tracked.some(function (x) { return x.key === s.key && (s.key !== 'symptom' || x.name.toLowerCase() === s.name.toLowerCase()); })) return;
      var type = clone(s); delete type.from;
      type.elderId = el.id;
      type.pinned = S().list('vitalTypes', function (x) { return x.elderId === el.id && x.pinned; }).length < 3;
      S().add('vitalTypes', type, by());
    });
    App.commit();
    h.closeSheet();
    App.ui.view = 'today';
    App.render();
    h.toast(t('c.saved'));
    if (shift.length) askShift(shift);
  }
  // The routine changed: list the medicines linked to those meals and ask before moving them.
  function askShift(shift) {
    var lines = shift.map(function (c) { return '• ' + c.name + ': ' + c.from.map(h.fmtHM).join(', ') + ' → ' + c.to.map(h.fmtHM).join(', '); }).join('\n');
    h.ask({ title: t('rt.ask', { n: shift.length }), text: t('rt.text') + '\n\n' + lines, ok: t('rt.move'), cancel: t('rt.keep') }, function () {
      S().applyRoutineShift(shift, by());
      App.commit();
      h.toast(t('rt.moved', { n: shift.length }));
    });
  }

  /* ================= PRESCRIPTION IMPORT (PDF) =================
     File -> (password) -> rows -> KalingaRxImport.parse -> review -> save.
     Every line is a draft: the caregiver checks it; nothing is saved until
     "I-save". Lines the parser couldn't read are shown, never guessed. */
  var rx = null; // { phase: 'reading'|'password'|'review'|'error', file, msg, patient, date }
  function openImport(file) {
    rx = { phase: 'reading', file: file, msg: '' };
    App.ui.draft = null;
    h.openSheet({ title: '📄 ' + t('rx.import'), html: importHtml, onclose: function () { rx = null; App.ui.draft = null; } });
    readImport('');
  }
  function readImport(password) {
    rx.phase = 'reading'; h.renderSheet();
    window.KalingaRxPdf.read(rx.file, password).then(function (res) {
      if (!rx) return;
      var el = elder(), parsed = window.KalingaRxImport.parse(res.lines);
      if (!parsed.items.length) { rx.phase = 'error'; rx.msg = t('rx.none'); h.renderSheet(); return; }
      var start = window.KalingaRxImport.startDate(parsed.date, Date.now());
      var have = S().list('meds', function (m) { return m.elderId === el.id; }).map(function (m) { return m.name.toLowerCase(); });
      rx.patient = parsed.patient; rx.date = parsed.date; rx.phase = 'review';
      App.ui.draft = { items: parsed.items.map(function (it) {
        var d = window.KalingaRxImport.draft(it, el.routine), dupe = have.indexOf(d.name.toLowerCase()) >= 0;
        return {
          ok: it.ok, sig: it.sig, dupe: dupe, on: it.ok && !dupe, name: d.name,
          purpose: d.purpose ? d.purpose[I.getLang() === 'en' ? 'en' : 'tl'] : '', form: d.form, dose: d.dose, food: d.food,
          prn: d.prn, timesText: d.times.join(', '), times0: d.times, anchors0: d.anchors, count: d.count, start: start, end: window.KalingaRxImport.endDate(start, d.days), err: ''
        };
      }) };
      h.renderSheet();
    }, function (e) {
      if (!rx) return;
      var code = (e && e.code) || 'not-pdf';
      if (code === 'password' || code === 'wrong-password') { rx.phase = 'password'; rx.msg = code === 'wrong-password' ? t('rx.wrongPw') : ''; }
      else { rx.phase = 'error'; rx.msg = t(code === 'offline' ? 'rx.offline' : 'rx.notPdf'); }
      h.renderSheet();
    });
  }
  function importHtml() {
    if (!rx) return '';
    if (rx.phase === 'reading') return '<div class="empty">⏳ ' + esc(t('rx.reading')) + '</div>';
    if (rx.phase === 'error') return '<div class="note note--bad">' + esc(rx.msg) + '</div><div class="btn-row" style="margin-top:14px"><button class="btn btn--lg" data-action="sheet-close">' + esc(t('c.close')) + '</button></div>';
    if (rx.phase === 'password') {
      return '<form class="form" id="rx-pw-form" autocomplete="off"><p style="margin:0">🔒 ' + esc(t('rx.password')) + '</p>' +
        (rx.msg ? '<p class="field__error" role="alert">' + esc(rx.msg) + '</p>' : '') +
        h.field(t('rx.pwLabel'), '<input class="input input--lg" type="password" name="rxpw" autocomplete="off" autofocus />', esc(t('rx.pwHint'))) +
        '<button class="btn btn--primary btn--lg" type="submit">' + esc(t('rx.unlock')) + '</button></form>';
    }
    var d = App.ui.draft, n = d.items.filter(function (x) { return x.on; }).length;
    var out = '<div class="form">' + (rx.patient ? '<p style="margin:0"><b>' + esc(t('rx.for', { name: rx.patient })) + '</b>' + (rx.date ? ' · ' + esc(rx.date) : '') + '</p>' : '') +
      '<p class="note">' + esc(t('rx.reviewHint')) + '</p>';
    d.items.forEach(function (it, i) {
      var p = 'items.' + i + '.';
      out += '<div class="box"' + (it.on ? '' : ' style="opacity:.7"') + '>';
      if (!it.ok) {
        out += '<div class="box__head">⚠️ ' + esc(it.name) + '</div><div class="note note--due">' + esc(t('rx.unreadable')) + '<br><i>' + esc(it.sig) + '</i></div></div>';
        return;
      }
      out += '<label class="check"><input type="checkbox"' + (it.on ? ' checked' : '') + bind(p + 'on', true) + ' /><span><b>' + esc(it.name) + '</b>' + (it.dupe ? ' <span class="badge badge--due">' + esc(t('rx.dupe')) + '</span>' : '') + '</span></label>';
      if (it.on) {
        out += h.field(t('vit.name'), '<input class="input" maxlength="60" value="' + v(it.name) + '"' + bind(p + 'name') + ' />') +
          h.field(t('med.purpose', { name: elder().name }), '<input class="input" maxlength="80" value="' + v(it.purpose) + '"' + bind(p + 'purpose') + ' />') +
          '<p style="margin:0">💊 ' + esc(k.amountText({ form: it.form, dose: it.dose })) + (it.food !== 'any' ? ' · ' + esc(t('food.' + it.food)) : '') + '</p>' +
          (it.prn ? '<p style="margin:0">🤲 ' + esc(t('rx.prnLine', { n: it.prn.maxPerDay || '—' })) + '</p>'
            : h.field(t('rx.times'), '<input class="input" name="rxt' + i + '" value="' + v(it.timesText) + '"' + bind(p + 'timesText') + ' />', esc(t('rx.timesHint')))) +
          '<div class="grid2">' + h.field(t('med.stock'), '<input class="input" type="number" min="0" step="0.5" inputmode="decimal" value="' + v(it.count) + '"' + numBind(p + 'count') + ' />') +
          h.field(t('rx.until'), '<input class="input" type="date" value="' + v(it.end) + '"' + bind(p + 'end') + ' />') + '</div>' +
          (it.err ? '<p class="field__error" role="alert">' + esc(it.err) + '</p>' : '');
      }
      out += '</div>';
    });
    out += '<div class="btn-row sheet-save"><button class="btn btn--primary btn--lg" data-action="rx-save"' + (n ? '' : ' disabled') + '>' + esc(t('rx.saveN', { n: n })) + '</button></div></div>';
    return out;
  }
  function saveImport() {
    var d = App.ui.draft, el = elder(); if (!d || !el) return;
    var plans = [], bad = false;
    d.items.forEach(function (it) {
      it.err = '';
      if (!it.on || !it.ok) return;
      var times = String(it.timesText || '').split(/[,\s]+/).filter(Boolean).sort();
      var med = { elderId: el.id, name: String(it.name || '').trim(), purpose: String(it.purpose || '').trim(), form: it.form, dose: it.dose, food: it.food, prn: it.prn,
        stock: { count: it.count == null || isNaN(it.count) ? null : it.count, packSize: 0, lowDays: 7 } };
      var rule = it.prn ? null : { times: times, weekdays: [], everyN: 0, start: it.start, end: it.end || '', prn: false };
      var e = S().checkMed(med) || (rule && Sch.validate(rule));
      if (e) { it.err = I.err(e); bad = true; return; }
      // A time the caregiver kept stays linked to its meal; a typed-in time is set by hand.
      var anchors = times.map(function (tm) { var i0 = (it.times0 || []).indexOf(tm); return i0 >= 0 ? it.anchors0[i0] : null; });
      plans.push({ med: med, rule: rule, anchors: anchors });
    });
    if (bad) { h.renderSheet(); var first = h.$('#sheet .field__error'); if (first) first.scrollIntoView({ block: 'center' }); return; }
    plans.forEach(function (pl) {
      var saved = S().saveMed(pl.med, by()).med;
      if (saved && pl.rule) S().saveSchedule({ medId: saved.id, rule: pl.rule, anchors: pl.anchors }, by());
    });
    App.commit();
    h.closeSheet();
    App.ui.view = 'meds';
    App.render();
    h.toast(t('rx.savedN', { n: plans.length }));
  }
  document.addEventListener('submit', function (e) {
    if (!e.target || e.target.id !== 'rx-pw-form') return;
    e.preventDefault();
    if (rx) readImport(e.target.elements.rxpw.value);
  });

  /* ================= MORE ================= */
  function moreView() {
    var el = elder(), st = S().get(), lang = I.getLang(), perm = R.notifyPermission();
    var conds = el ? S().list('conditions', function (c) { return c.elderId === el.id; }) : [];
    var out = '<h1>' + esc(t('more.title')) + '</h1><div class="list" style="margin-top:10px">';
    out += '<button class="row" data-action="profile-open"><span class="pillicon" aria-hidden="true">👤</span><span class="row__main"><span class="row__title">' + esc(t('more.profile')) + '</span><span class="row__sub" style="display:block">' + esc(conds.length ? conds.map(function (c) { var e = c.libraryKey && C.get(c.libraryKey); return e ? (lang === 'en' ? e.en : e.tl) : c.name; }).join(' · ') : t('cond.none')) + '</span></span></button>';
    out += '<button class="row" data-action="log-open"><span class="pillicon" aria-hidden="true">📜</span><span class="row__main"><span class="row__title">' + esc(t('more.log')) + '</span></span></button>';
    out += '<button class="row" data-action="elder-add"><span class="pillicon" aria-hidden="true">➕</span><span class="row__main"><span class="row__title">' + esc(t('prof.addElder')) + '</span></span></button></div>';
    out += '<div class="section-title">' + esc(t('more.settings')) + '</div><div class="card form">';
    out += h.field(t('more.lang'), '<div class="seg" role="radiogroup"><label><input type="radio" name="lang" value="tl" data-action-change="set-lang"' + (lang !== 'en' ? ' checked' : '') + ' /><span>Taglish</span></label><label><input type="radio" name="lang" value="en" data-action-change="set-lang"' + (lang === 'en' ? ' checked' : '') + ' /><span>English</span></label></div>');
    out += h.field(t('more.sugarUnit'), '<div class="seg" role="radiogroup"><label><input type="radio" name="sugarUnit" value="mg/dL" data-action-change="set-sugar"' + (st.settings.sugarUnit !== 'mmol/L' ? ' checked' : '') + ' /><span>mg/dL</span></label><label><input type="radio" name="sugarUnit" value="mmol/L" data-action-change="set-sugar"' + (st.settings.sugarUnit === 'mmol/L' ? ' checked' : '') + ' /><span>mmol/L</span></label></div>');
    var th = App.themeChoice ? App.themeChoice() : 'light';
    out += h.field(t('more.theme'), '<div class="seg" role="radiogroup">' + [['light', t('theme.light')], ['dark', t('theme.dark')], ['auto', t('theme.auto')]].map(function (o) {
      return '<label><input type="radio" name="theme" value="' + o[0] + '" data-action-change="set-theme"' + (th === o[0] ? ' checked' : '') + ' /><span>' + esc(o[1]) + '</span></label>';
    }).join('') + '</div>');
    out += '<div class="field"><span class="field__label">' + esc(t('more.notify')) + '</span>' + (perm === 'granted' ? '<span class="badge badge--ok">✓ ' + esc(t('more.notifyOk')) + '</span>' : perm === 'denied' ? '<span class="fineprint">' + esc(t('more.notifyBlocked')) + '</span>' : perm === 'unsupported' ? '<span class="fineprint">—</span>' : '<button class="btn btn--soft" data-action="notify-ask">' + esc(t('more.notifyOn')) + '</button>') + '</div>';
    out += '<button class="btn" data-action="pin-set">🔒 ' + esc(st.device.pin ? t('more.pinChange') : t('more.pinSet')) + '</button>';
    out += '<button class="btn" data-action="test-alarm">🔔 ' + esc(t('more.testAlarm')) + '</button>';
    out += '</div><div class="section-title">💾</div><div class="card form"><button class="btn" data-action="backup">⬇ ' + esc(t('more.backup')) + '</button><button class="btn" data-action="restore-open">⬆ ' + esc(t('more.restore')) + '</button><button class="btn btn--ghost" style="color:var(--bad)" data-action="erase">' + esc(t('more.erase')) + '</button></div>';
    out += '<p class="note" style="margin-top:16px">' + esc(t('more.disclaimer')) + '</p><p class="fineprint" style="margin-top:10px;text-align:center"><a href="privacy.html">' + esc(t('more.privacy')) + '</a> · Kalinga beta</p>';
    return out;
  }
  function openLog() {
    h.openSheet({ title: t('log.title'), html: function () {
      var items = S().get().changelog.slice(-200).reverse();
      if (!items.length) return '<div class="card empty">' + esc(t('log.empty')) + '</div>';
      return '<div class="list">' + items.map(function (c) {
        return '<div class="row"><span class="row__main"><span class="row__title">' + esc((c.by || '—') + ' ' + t('log.' + c.action) + ' ' + (c.label || c.kind)) + '</span><span class="row__sub" style="display:block">' + esc(h.dayLabel(c.at) + ' ' + h.fmtTime(c.at) + (c.fields && c.fields.length ? ' · ' + c.fields.join(', ') : '')) + '</span></span></div>';
      }).join('') + '</div>';
    } });
  }
  function openSwitch() {
    var els = S().list('elders'), cur = S().get().device.elderId;
    h.openSheet({ title: '👥', html: '<div class="list">' + els.map(function (e) {
      return '<button class="row" data-action="elder-pick" data-id="' + esc(e.id) + '">' + k.elderFace(e) + '<span class="row__main"><span class="row__title">' + esc(e.name) + '</span></span>' + (e.id === cur ? '<span class="badge badge--ok">✓</span>' : '') + '</button>';
    }).join('') + '<button class="row" data-action="elder-add"><span class="pillicon">➕</span><span class="row__main"><span class="row__title">' + esc(t('prof.addElder')) + '</span></span></button></div>' });
  }

  /* ================= Actions ================= */
  function draftPhoto(input, field) {
    var file = input.files && input.files[0]; if (!file) return;
    F.compress(file).then(function (b) { var id = 'ph-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); return F.put(id, b); }).then(function (id) { if (App.ui.draft) { App.ui.draft[field] = id; h.renderSheet(); } }).catch(function (e) { h.toast(e.message); });
  }
  App.addActions({
    'med-new': function () { openMed(null); },
    'med-edit': function (n) { openMed(n.getAttribute('data-id')); },
    'med-save': saveMed,
    'med-photo-remove': function () { App.ui.draft.photoId = null; h.renderSheet(); },
    'time-add': function (n) { var d = App.ui.draft, x = n.getAttribute('data-value'); if (d._times.indexOf(x) < 0) d._times.push(x); d._times.sort(); h.renderSheet(); },
    'time-add-custom': function () { var inp = h.$('#time-custom'), d = App.ui.draft; if (inp && /^\d\d:\d\d$/.test(inp.value) && d._times.indexOf(inp.value) < 0) { d._times.push(inp.value); d._times.sort(); h.renderSheet(); } },
    'time-remove': function (n) { App.ui.draft._times.splice(+n.getAttribute('data-value'), 1); h.renderSheet(); },
    'weekday': function (n) { var w = App.ui.draft._weekdays, x = +n.getAttribute('data-value'), i = w.indexOf(x); if (i >= 0) w.splice(i, 1); else w.push(x); h.renderSheet(); },
    'chart-add': function () { var ins = App.ui.draft.insulin, used = (ins.charts || []).map(function (c) { return c.context; }); var free = window.KalingaScale.CONTEXTS.filter(function (x) { return used.indexOf(x) < 0; })[0] || 'bedtime'; var c = newChart(); c.context = free; ins.charts.push(c); h.renderSheet(); },
    'chart-remove': function (n) { App.ui.draft.insulin.charts.splice(+n.getAttribute('data-value'), 1); h.renderSheet(); },
    'row-add': function (n) { var c = App.ui.draft.insulin.charts[+n.getAttribute('data-value')], last = c.rows[c.rows.length - 1]; c.rows.push({ from: last && last.to != null ? last.to + 1 : 70, to: null, units: null }); h.renderSheet(); },
    'row-remove': function (n) { var p = n.getAttribute('data-value').split(':'), c = App.ui.draft.insulin.charts[+p[0]]; c.rows.splice(+p[1], 1); h.renderSheet(); },
    'med-recount': function () {
      var d = App.ui.draft, x = window.prompt(t('med.recountAsk'));
      if (x == null) return;
      if (S().setStockCount(d.id, parseFloat(x), by())) { App.commit(); h.renderSheet(); } else h.toast(t('err.bad-level'));
    },
    'med-rec': function () {
      Voice.record().then(function (r) { recState = r; h.renderSheet(); }).catch(function () { h.toast(t('rd.micBlocked')); });
    },
    'med-rec-stop': function () {
      if (!recState) return;
      var r = recState; recState = null;
      r.stop().then(function (id) { if (App.ui.draft) { App.ui.draft.voiceId = id; h.renderSheet(); Voice.play(id).catch(function () {}); } }).catch(function () { h.renderSheet(); });
    },
    'med-play': function () { var d = App.ui.draft; if (d && d.voiceId) Voice.play(d.voiceId).catch(function () {}); },
    'med-voice-remove': function () { App.ui.draft.voiceId = null; h.renderSheet(); },
    'med-toggle-active': function () {
      var d = App.ui.draft, m = S().find('meds', d.id); if (!m) return;
      S().update('meds', m.id, { active: m.active === false }, by()); App.commit(); h.closeSheet(); App.render();
    },
    'med-delete': function () {
      var d = App.ui.draft, m = S().find('meds', d.id); if (!m) return;
      h.ask({ title: t('med.deleteAsk', { name: m.name }), text: t('med.deleteText'), ok: t('c.delete'), danger: true }, function () {
        S().list('schedules', function (s) { return s.medId === m.id; }).forEach(function (s) { S().remove('schedules', s.id, by()); });
        S().remove('meds', m.id, by()); App.commit(); h.closeSheet(); App.render();
      });
    },
    'vital-add': openVitalAdd,
    'vital-new': function (n) { var key = n.getAttribute('data-value'); h.closeSheet(); setTimeout(function () { openVital(null, key); }, 30); },
    'vital-edit': function (n) { openVital(n.getAttribute('data-id')); },
    'vital-save': saveVital,
    'vital-remove': function () {
      var d = App.ui.draft;
      h.ask({ title: t('vit.removeAsk', { name: k.vitalName(d) }), ok: t('c.delete'), danger: true }, function () { S().remove('vitalTypes', d.id, by()); App.commit(); h.closeSheet(); App.render(); });
    },
    'vtime-add': function () { var inp = h.$('#vtime-custom'), d = App.ui.draft; d.logReminders = d.logReminders || []; if (inp && /^\d\d:\d\d$/.test(inp.value) && d.logReminders.indexOf(inp.value) < 0) { d.logReminders.push(inp.value); d.logReminders.sort(); h.renderSheet(); } },
    'vtime-remove': function (n) { App.ui.draft.logReminders.splice(+n.getAttribute('data-value'), 1); h.renderSheet(); },
    'vital-history': function (n) { openHistory(n.getAttribute('data-id')); },
    'reading-remove': function (n) {
      var id = n.getAttribute('data-id');
      h.ask({ title: t('c.delete') + '?', ok: t('c.delete'), danger: true }, function () { S().remove('readings', id, by()); App.commit(); h.renderSheet(); App.render(); });
    },
    'profile-open': function () { openProfile(false); },
    'profile-save': saveProfile,
    'cond-toggle': function (n) { var c = App.ui.draft._conds, x = n.getAttribute('data-value'), i = c.indexOf(x); if (i >= 0) c.splice(i, 1); else c.push(x); h.renderSheet(); },
    'cond-custom-add': function () { var inp = h.$('#cond-custom'), x = inp && inp.value.trim(); if (x && App.ui.draft._custom.indexOf(x) < 0) { App.ui.draft._custom.push(x); h.renderSheet(); } },
    'cond-custom-remove': function (n) { App.ui.draft._custom.splice(+n.getAttribute('data-value'), 1); h.renderSheet(); },
    'elder-add': function () { h.closeSheet(); setTimeout(function () { openProfile(true); }, 30); },
    'elder-switch': openSwitch,
    'elder-pick': function (n) { S().get().device.elderId = n.getAttribute('data-id'); App.commit(); h.closeSheet(); App.render(); },
    'log-open': openLog,
    'rx-import': function () { var f = h.$('#rx-file'); f.value = ''; f.click(); },
    'rx-save': saveImport
  });
  App.changeActions = App.changeActions || {};
  App.changeActions['med-photo'] = function (input) { draftPhoto(input, 'photoId'); };
  App.changeActions['rx-file'] = function (input) { var f = input.files && input.files[0]; if (f) openImport(f); };
  App.changeActions['profile-photo'] = function (input) { draftPhoto(input, 'photoId'); };
  App.changeActions['unit-touched'] = function () { if (App.ui.draft) App.ui.draft._unitTouched = true; };
  App.changeActions['sugg-toggle'] = function (input) { var d = App.ui.draft; if (d) d._untick[input.getAttribute('data-value')] = !input.checked; };

  // Changing the form picks the usual unit (until the caregiver chooses one) and sets up insulin.
  document.addEventListener('change', function (e) {
    var el = e.target;
    if (!el || el.name !== 'form' || !App.ui.draft || !h.$('#med-form')) return;
    var d = App.ui.draft;
    if (!d._unitTouched) d.dose = { amount: d.dose && d.dose.amount != null ? d.dose.amount : 1, unit: k.FORM_UNIT[d.form] || 'dose' };
    if (k.isInsulin(d)) { if (!d.insulin) d.insulin = { mode: 'fixed', charts: [], needles: null }; d.dose.unit = 'units'; }
    h.renderSheet();
  });
  // Switching insulin to sliding scale starts a chart to fill in.
  document.addEventListener('change', function (e) {
    var el = e.target, d = App.ui.draft;
    if (!el || el.name !== '_insMode' || !d || !d.insulin) return;
    if (d.insulin.mode === 'scale' && !(d.insulin.charts || []).length) { d.insulin.charts = [newChart()]; h.renderSheet(); }
  });

  window.KalingaCare = { today: today, meds: medsView, vitals: vitalsView, more: moreView, openProfile: openProfile, openMed: openMed };
})();
