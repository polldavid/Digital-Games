/* Kalinga — rximport.js tests: e-prescription text -> draft medicines.
   The sample is MADE UP (fictional patient and clinic) in the layout of the
   Maxicare e-prescription PDFs, as pdf.js gives it: one string per table row.
     node kalinga/tests/rximport.test.js */
'use strict';
process.env.TZ = 'Asia/Manila';
const assert = require('assert');
const Rx = require('../js/rximport.js');

const LINES = [
  '06-10-2026 19:44:42',
  'Need a lab test done? Visit our Primary Care Clinic (PCC) for a relaxing healthcare',
  'Maxicare', 'PRIMARY CARE CENTER - SAMPLE', 'E-Prescription',
  'Transaction Reference: 00000000', 'Date/Time: 2026-OCT-06',
  'Patient Name: Juana Dela Cruz Contact No: 0000000000',
  'DOB/Sex: 1960-JAN-01/Female Email: sample@example.com',
  'Rx',
  'Metformin 500mg Tablet', '500mg', '270 Take 1 Tablet 3 times daily for 90 days',
  'Sylimarin (Legalon)', '.', '270 Take 1 tablet 3 times daily for 90 days',
  'Losartan 50mg Tablet', '50mg', '90 Take 1 Tablet Once every morning for 90 days',
  // page break: footer and header noise between two medicines
  'Need a lab test done? Visit our Primary Care Clinic (PCC) for a relaxing healthcare',
  'If you would like your lab test done at home, email homecare@example.com or click',
  '06-10-2026 19:44:42',
  'Gliclazide 60 mg MR tablet (Diamicron MR)', '60mg', '90 Take 1 Tablet Once daily At Noon for 90 days',
  'Sitagliptin (Januvia)', '50mg', '180 Take 1 tablet 2 times daily After Meals for 90 days',
  'Rosuvastatin + Ezetimibe (Rozour)', '20mg/10mg', '90 Take 1 tablet Once daily At Night for 90 days',
  'Gabapentin 100 mg capsule (Gabica)', '100mg', '90 Take 1 Capsule Once at bedtime At Night for 90 days',
  'Sodium alginate + Calcium carbonate + Sodium bicarbonate 500mg/267mg/160mg/10mL 10mL Suspension1', '500mg/267mg/160mg/10mL',
  '30 Take 1 Suspension 3 times daily After Meals as needed',
  'Esomeprazole 40mg Tablet', '40mg', '14 Take 1 Tablet Once daily Before Breakfast for 14 days',
  'Amlodipine 5mg Tablet', '5mg', '30 Take 1/2 Tablet Twice daily for 30 days',
  'Mystery Drug', '10mg', '20 Use as directed',
  'Certified By:', 'Doctor Name: Sample Doctor, MD', 'INTERNAL MEDICINE'
];

const r = Rx.parse(LINES);
assert.strictEqual(r.patient, 'Juana Dela Cruz');
assert.strictEqual(r.date, '2026-10-06');
assert.strictEqual(r.items.length, 11, 'every medicine found, footer noise ignored');
const by = (n) => r.items.find((x) => x.name.indexOf(n) === 0);

// Names: form words dropped, strength added when the name lacks one, brand kept
assert.strictEqual(by('Metformin').name, 'Metformin 500mg');
assert.strictEqual(by('Sylimarin').name, 'Sylimarin (Legalon)');
assert.strictEqual(by('Gliclazide').name, 'Gliclazide 60 mg MR (Diamicron MR)');
assert.strictEqual(by('Sitagliptin').name, 'Sitagliptin 50mg (Januvia)');
assert.strictEqual(by('Rosuvastatin').name, 'Rosuvastatin + Ezetimibe 20mg/10mg (Rozour)');
assert.strictEqual(by('Gabapentin').name, 'Gabapentin 100 mg (Gabica)');
assert.ok(by('Sodium alginate').name.length <= 60, 'long names are shortened for the screen');

// Directions
const met = by('Metformin');
assert.deepStrictEqual([met.qty, met.amount, met.unit, met.form, met.perDay, met.days, met.prn, met.ok], [270, 1, 'tablet', 'tablet', 3, 90, false, true]);
assert.deepStrictEqual([by('Losartan').perDay, by('Losartan').timing], [1, 'morning']);
assert.deepStrictEqual([by('Gliclazide').timing], ['noon']);
assert.deepStrictEqual([by('Sitagliptin').perDay, by('Sitagliptin').food], [2, 'after']);
assert.deepStrictEqual([by('Rosuvastatin').timing], ['night']);
assert.deepStrictEqual([by('Gabapentin').timing, by('Gabapentin').unit, by('Gabapentin').form], ['bedtime', 'capsule', 'capsule']);
const alg = by('Sodium alginate');
assert.deepStrictEqual([alg.prn, alg.perDay, alg.unit, alg.amount, alg.form, alg.food], [true, 3, 'ml', 10, 'liquid', 'after']);
const eso = by('Esomeprazole');
assert.deepStrictEqual([eso.days, eso.food, eso.timing], [14, 'before', 'morning']);
const aml = by('Amlodipine');
assert.deepStrictEqual([aml.amount, aml.perDay], [0.5, 2]);
const mys = by('Mystery Drug');
assert.strictEqual(mys.ok, false, 'unreadable directions are flagged, never guessed');
assert.strictEqual(mys.sig, 'Use as directed');

// Drafts: clock times from the elder's routine
const routine = { breakfast: '07:00', lunch: '12:00', dinner: '19:00', bedtime: '21:00' };
const d = (n) => Rx.draft(by(n), routine);
assert.deepStrictEqual(d('Metformin').times, ['07:00', '12:00', '19:00']);
assert.deepStrictEqual(d('Losartan').times, ['07:00']);
assert.deepStrictEqual(d('Gliclazide').times, ['12:00']);
assert.deepStrictEqual(d('Sitagliptin').times, ['07:00', '19:00']);
assert.deepStrictEqual(d('Rosuvastatin').times, ['21:00']);
assert.deepStrictEqual(d('Gabapentin').times, ['21:00']);
assert.deepStrictEqual(d('Esomeprazole').times, ['06:30'], 'before breakfast = 30 minutes before');
assert.deepStrictEqual(d('Amlodipine').times, ['07:00', '19:00']);
assert.deepStrictEqual(d('Sodium alginate').times, [], 'as needed: no alarm');
assert.deepStrictEqual(d('Sodium alginate').prn, { minGapMin: 0, maxPerDay: 3 }, 'the daily maximum comes from the label');
assert.strictEqual(d('Metformin').prn, null);
assert.deepStrictEqual(d('Metformin').dose, { amount: 1, unit: 'tablet' });
assert.strictEqual(d('Metformin').count, 270);
assert.strictEqual(d('Metformin').food, 'any');
assert.strictEqual(d('Sitagliptin').food, 'after');
assert.deepStrictEqual(d('Mystery Drug').times, []);
// a different routine moves the times
assert.deepStrictEqual(Rx.draft(met, { breakfast: '06:00', lunch: '11:30', dinner: '18:00', bedtime: '20:30' }).times, ['06:00', '11:30', '18:00']);
assert.deepStrictEqual(Rx.draft(met, null).times, ['07:00', '12:00', '19:00'], 'default routine');

// Each drafted time remembers the meal it came from (so a routine change can move it)
assert.deepStrictEqual(d('Metformin').anchors, [{ meal: 'breakfast', offset: 0 }, { meal: 'lunch', offset: 0 }, { meal: 'dinner', offset: 0 }]);
assert.deepStrictEqual(d('Esomeprazole').anchors, [{ meal: 'breakfast', offset: -30 }]);
assert.deepStrictEqual(d('Gabapentin').anchors, [{ meal: 'bedtime', offset: 0 }]);
assert.deepStrictEqual(d('Sodium alginate').anchors, []);
assert.strictEqual(d('Metformin').anchors.length, d('Metformin').times.length);

// Purpose suggestions (general drug classes; the caregiver edits them)
assert.strictEqual(Rx.purposeFor('Metformin 500mg').tl, 'para sa sugar');
assert.strictEqual(Rx.purposeFor('Losartan 50mg').tl, 'para sa altapresyon');
assert.strictEqual(Rx.purposeFor('Rosuvastatin + Ezetimibe').tl, 'para sa kolesterol');
assert.strictEqual(Rx.purposeFor('Sylimarin (Legalon)').tl, 'para sa atay');
assert.strictEqual(Rx.purposeFor('Esomeprazole 40mg').en, 'for the stomach (acid)');
assert.strictEqual(Rx.purposeFor('Mystery Drug'), null);

// Course dates
assert.strictEqual(Rx.endDate('2026-10-06', 90), '2027-01-03', '90 days including the first');
assert.strictEqual(Rx.endDate('2026-10-06', 1), '2026-10-06');
assert.strictEqual(Rx.endDate('2026-10-06', null), '');
const today = new Date(2026, 9, 10).getTime();
assert.strictEqual(Rx.startDate('2026-10-06', today), '2026-10-06', 'a recent prescription starts on its date');
assert.strictEqual(Rx.startDate('2026-08-01', today), '2026-10-10', 'an old one starts today');
assert.strictEqual(Rx.startDate('2026-11-01', today), '2026-10-10', 'never in the future');
assert.strictEqual(Rx.startDate(null, today), '2026-10-10');

// The real PDF text: quantity and directions come as separate rows, labels have ' :'
const split = Rx.parse(['Date/Time : 2026-OCT-06', 'Patient Name : Juana Dela Cruz Contact No : 0000000000', 'Rx',
  'Metformin 500mg Tablet', '500mg', '270', 'Take 1 Tablet 3 times daily for 90 days',
  'Sylimarin (Legalon)', '.', '270', 'Take 1 tablet 3 times daily for 90 days',
  'Need a lab test done? Visit our clinic', '06-10-2026 19:44:42',
  'Gliclazide 60 mg MR tablet (Diamicron MR)', '60mg', '90', 'Take 1 Tablet Once daily At Noon for 90 days', 'Certified By:']);
assert.strictEqual(split.patient, 'Juana Dela Cruz');
assert.strictEqual(split.date, '2026-10-06');
assert.deepStrictEqual(split.items.map((x) => x.name + ':' + x.qty + ':' + x.perDay), ['Metformin 500mg:270:3', 'Sylimarin (Legalon):270:3', 'Gliclazide 60 mg MR (Diamicron MR):90:1']);

// Other phrasings and junk
const more = Rx.parse(['Rx', 'Paracetamol 500mg Tablet', '500mg', '20 Take 2 tablets every 6 hours as needed for pain',
  'Insulin Glargine', '100 units/mL', '1 Inject 10 units once daily at bedtime', 'Salbutamol Inhaler', '100mcg', '1 Take 2 puffs 4 times daily']);
const para = more.items[0];
assert.deepStrictEqual([para.amount, para.everyHours, para.prn], [2, 6, true]);
assert.deepStrictEqual(Rx.draft(para, routine).prn, { minGapMin: 360, maxPerDay: 4 }, 'every 6 hours = 4 a day at most');
assert.strictEqual(more.items[1].ok, false, 'insulin is always set up by hand (fixed or sliding scale)');
assert.deepStrictEqual([more.items[2].unit, more.items[2].form, more.items[2].perDay], ['puff', 'inhaler', 4]);
assert.deepStrictEqual(Rx.draft(more.items[2], routine).times, ['07:00', '12:00', '19:00', '21:00']);
assert.deepStrictEqual(Rx.parse(['hello', 'world']).items, []);
assert.deepStrictEqual(Rx.parse([]).items, []);

console.log('rximport.test.js ok');
