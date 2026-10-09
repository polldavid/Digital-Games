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
       target: { low, high }, // optional target range (same shapes): outside it the
                           //   elder hears "Medyo mataas/mababa", but nobody is alerted
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
    sugar: { key: 'sugar', kind: 'number', name: 'Blood sugar', unit: 'mg/dL', low: 70, high: 300, target: { low: 80, high: 180 },
      danger: [{ when: 'below', value: 70, card: 'low-sugar' }], contexts: ['fasting', 'before-meal', 'after-meal', 'bedtime'] },
    bp: { key: 'bp', kind: 'pair', name: 'Blood pressure', unit: 'mmHg', low: { sys: 90, dia: 60 }, high: { sys: 160, dia: 100 },
      target: { low: null, high: { sys: 140, dia: 90 } },
      danger: [{ when: 'atLeast', sys: 180, dia: 120, card: 'bp-crisis' }], contexts: ['resting'] },
    weight: { key: 'weight', kind: 'number', name: 'Weight', unit: 'kg', low: null, high: null, danger: [], contexts: [] },
    pulse: { key: 'pulse', kind: 'number', name: 'Heart rate', unit: 'bpm', low: 50, high: 110, target: { low: 60, high: 100 }, danger: [], contexts: ['resting'] },
    temp: { key: 'temp', kind: 'number', name: 'Temperature', unit: '°C', low: 35, high: 37.8, danger: [], contexts: [] },
    spo2: { key: 'spo2', kind: 'number', name: 'Oxygen', unit: '%', low: 92, high: null, target: { low: 95, high: null },
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
    var tg = t.target, ok = t.kind === 'pair' ? pairOk : num;
    if (tg) {
      if (tg.low != null && !ok(tg.low)) return { field: 'target', error: 'bad-level' };
      if (tg.high != null && !ok(tg.high)) return { field: 'target', error: 'bad-level' };
      if (tg.low != null && tg.high != null && (t.kind === 'pair' ? (tg.low.sys >= tg.high.sys || tg.low.dia >= tg.high.dia) : tg.low >= tg.high)) return { field: 'target', error: 'low-above-high' };
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

  // Either number of a pair counts.
  function below(t, v, lv) { return lv != null && (t.kind === 'pair' ? (v.sys < lv.sys || v.dia < lv.dia) : v < lv); }
  function above(t, v, lv) { return lv != null && (t.kind === 'pair' ? (v.sys > lv.sys || v.dia > lv.dia) : v > lv); }

  /* -> { level, danger: <entry>|null, alert: bool }
     level: 'danger' | 'low' | 'high'            (alert levels: the caregiver is told)
          | 'below-target' | 'above-target'      (said to the elder, no alert)
          | 'ok' */
  function verdict(t, v) {
    var out = function (level, d) { return { level: level, danger: d || null, alert: level === 'danger' || level === 'low' || level === 'high' }; };
    if (t.kind === 'face') return out(v >= (t.high || 4) ? 'high' : 'ok');
    var ds = t.danger || [];
    for (var i = 0; i < ds.length; i++) if (hit(t, ds[i], v)) return out('danger', ds[i]);
    if (below(t, v, t.low)) return out('low');
    if (above(t, v, t.high)) return out('high');
    var tg = t.target || {};
    if (above(t, v, tg.high)) return out('above-target');
    if (below(t, v, tg.low)) return out('below-target');
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
