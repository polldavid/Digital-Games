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
