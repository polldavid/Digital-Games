/* =========================================================
   Kalinga — show.js
   How things look and sound, shared by elder and caregiver
   screens: medicine icons and amounts ("½ tableta"), what a
   reading says ("130/80", "185 mg/dL", 😣), sugar units
   (stored in mg/dL, shown in mmol/L when chosen), faces and
   sparklines. No rules here — those live in the core modules.
   ========================================================= */
(function () {
  'use strict';

  var App = window.KalingaApp, h = App.h, I = window.KalingaI18n, t = I.t, V = window.KalingaVitals;

  var FORM_ICON = { tablet: '💊', capsule: '💊', 'insulin-pen': '💉', 'insulin-vial': '💉', liquid: '🥄', drops: '💧', inhaler: '🌬️', cream: '🧴', patch: '🩹', injection: '💉', other: '💊' };
  var FORM_UNIT = { tablet: 'tablet', capsule: 'capsule', 'insulin-pen': 'units', 'insulin-vial': 'units', liquid: 'ml', drops: 'drop', inhaler: 'puff', cream: 'application', patch: 'patch', injection: 'ml', other: 'dose' };
  var APPLY_FORMS = { cream: 1, patch: 1, drops: 1 };
  var VITAL_ICON = { sugar: '🩸', bp: '💓', weight: '⚖️', pulse: '💗', temp: '🌡️', spo2: '🫁', symptom: '🤕', custom: '📏' };
  var FACES = ['😀', '🙂', '😐', '😣', '😫'];

  function isInsulin(m) { return m && (m.form === 'insulin-pen' || m.form === 'insulin-vial'); }
  function isScale(m) { return isInsulin(m) && m.insulin && m.insulin.mode === 'scale'; }

  // 0.5 -> "½", 1.5 -> "1½", 2 -> "2"
  function amountWords(a) {
    if (a == null) return '';
    var whole = Math.floor(a), frac = Math.round((a - whole) * 100) / 100;
    var f = frac === 0.5 ? '½' : frac === 0.25 ? '¼' : frac === 0.75 ? '¾' : frac ? String(frac).replace(/^0/, '') : '';
    if (!whole && f && /^[½¼¾]$/.test(f)) return f;
    return (whole || !f ? whole : '') + f;
  }
  function unitWord(unit, amount) {
    var w = I.has('unit.' + unit) ? t('unit.' + unit) : unit;
    if (I.getLang() === 'en' && amount != null && amount > 1 && /^(tablet|capsule|drop|puff|application|patch|dose)$/.test(unit)) w += 's';
    return w;
  }
  // What to take: "1 tableta", "½ tablet", "6 units", "1 pahid — sa paa"
  function amountText(med, units) {
    var a = units != null ? units : med.dose && med.dose.amount;
    var unit = (med.dose && med.dose.unit) || FORM_UNIT[med.form] || 'dose';
    var s = a != null ? amountWords(a) + ' ' + unitWord(unit, a) : unitWord(unit);
    if (APPLY_FORMS[med.form] && med.applyTo) s += ' — ' + med.applyTo;
    return s;
  }
  function medPic(med, cls) {
    if (med.photoId) return '<img class="' + (cls || 'thumb') + '" data-photo="' + h.esc(med.photoId) + '" alt="" />';
    return '<span class="' + (cls === 'dmed__pic' ? 'dmed__pic' : 'pillicon') + '" aria-hidden="true">' + (FORM_ICON[med.form] || '💊') + '</span>';
  }

  /* ---------- Readings ---------- */
  function sugarUnit() { var s = App.store && App.store.get().settings; return s && s.sugarUnit === 'mmol/L' ? 'mmol/L' : 'mg/dL'; }
  function vitalName(type) {
    if (type.key === 'symptom') { var sk = 'sym.' + String(type.name || '').toLowerCase(); return I.has(sk) ? t(sk) : type.name || ''; }
    var tpl = V.TEMPLATES[type.key];
    if (tpl && type.name === tpl.name && I.has('vit.' + type.key)) return t('vit.' + type.key);
    return type.name || '';
  }
  function vitalIcon(type) { return VITAL_ICON[type.key] || '📏'; }
  function unitOf(type) { return type.key === 'sugar' ? sugarUnit() : type.unit || ''; }
  // Stored (canonical) -> shown, and back.
  function toShown(type, v) { return type.key === 'sugar' && sugarUnit() === 'mmol/L' ? V.mgdlToMmol(v) : v; }
  function fromShown(type, v) { return type.key === 'sugar' && sugarUnit() === 'mmol/L' ? V.mmolToMgdl(v) : v; }
  function valueText(type, v, withUnit) {
    if (v == null) return '—';
    if (type.kind === 'face') return FACES[v - 1] + ' ' + t('face.' + v);
    if (type.kind === 'pair') return v.sys + '/' + v.dia + (withUnit === false ? '' : ' ' + type.unit) + (v.pulse ? ' · ' + t('rd.pulse') + ' ' + v.pulse : '');
    var shown = toShown(type, v);
    return h.num(shown) + (withUnit === false ? '' : ' ' + unitOf(type));
  }
  function verdictWord(type, vd) {
    if (type.kind === 'face') return vd.level === 'high' ? t('v.faceHigh') : t('v.faceOk');
    return t('v.' + vd.level);
  }

  // Every status carries a symbol as well as a colour and a word.
  var STATUS_ICON = { taken: '✓', ok: '✓', done: '✓', takenEarlier: '✓', skipped: '✕', unconfirmed: '⚠', due: '⏰', upcoming: '🕒', before: '–', high: '▲', 'above-target': '▲', low: '▼', 'below-target': '▼', danger: '⚠' };
  function statusIcon(st) { return STATUS_ICON[st] || ''; }

  // Short label for caregiver badges.
  function levelWord(type, vd) { return type.kind === 'face' ? (vd.level === 'high' ? t('vs.faceHigh') : t('vs.ok')) : t('vs.' + vd.level); }

  /* ---------- Sparkline ----------
     values: [{ at, v }] (numbers; pairs use .sys) -> inline SVG */
  function spark(values, wide) {
    var pts = values.filter(function (p) { return typeof p.v === 'number'; });
    if (pts.length < 2) return '';
    var W = wide ? 320 : 120, H = wide ? 80 : 36, pad = 4;
    var min = Math.min.apply(null, pts.map(function (p) { return p.v; })), max = Math.max.apply(null, pts.map(function (p) { return p.v; }));
    var t0 = pts[0].at, t1 = pts[pts.length - 1].at || t0 + 1;
    var x = function (p) { return pad + (W - 2 * pad) * (t1 === t0 ? 0.5 : (p.at - t0) / (t1 - t0)); };
    var y = function (p) { return H - pad - (H - 2 * pad) * (max === min ? 0.5 : (p.v - min) / (max - min)); };
    var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + x(p).toFixed(1) + ' ' + y(p).toFixed(1); }).join(' ');
    var last = pts[pts.length - 1];
    return '<svg class="spark' + (wide ? ' spark--wide' : '') + '" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true"><path d="' + d + '" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/><circle cx="' + x(last).toFixed(1) + '" cy="' + y(last).toFixed(1) + '" r="3.5" fill="currentColor"/></svg>';
  }

  function elderFace(e) {
    if (e && e.photoId) return '<span class="elderchip__face"><img data-photo="' + h.esc(e.photoId) + '" alt="" /></span>';
    return '<span class="elderchip__face" aria-hidden="true">' + h.esc(((e && e.name) || '?').trim().charAt(0).toUpperCase() || '🙂') + '</span>';
  }

  App.k = {
    FORM_ICON: FORM_ICON, FORM_UNIT: FORM_UNIT, APPLY_FORMS: APPLY_FORMS, FACES: FACES,
    isInsulin: isInsulin, isScale: isScale, amountWords: amountWords, unitWord: unitWord, amountText: amountText, medPic: medPic,
    sugarUnit: sugarUnit, vitalName: vitalName, vitalIcon: vitalIcon, unitOf: unitOf, toShown: toShown, fromShown: fromShown,
    valueText: valueText, verdictWord: verdictWord, levelWord: levelWord, statusIcon: statusIcon, spark: spark, elderFace: elderFace
  };
})();
