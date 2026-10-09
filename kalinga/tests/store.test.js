/* Kalinga — store.js tests.  node kalinga/tests/store.test.js */
'use strict';
process.env.TZ = 'Asia/Manila';
const assert = require('assert');
const K = require('../js/store.js');
const MIN = 60000, HOUR = 60 * MIN, DAY = 24 * HOUR;
const at = (y, mo, d, h, mi) => new Date(y, mo - 1, d, h || 0, mi || 0).getTime();
function memStorage() {
  const m = {};
  return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; }, dump: m };
}
let clockNow = at(2026, 10, 9, 7, 0);
const clock = () => clockNow;
const rule = (o) => Object.assign({ times: ['08:00'], weekdays: [], everyN: 0, start: '2026-10-09', end: '', prn: false }, o);

/* ---------- normalize / load / save ---------- */
const mem = memStorage();
const S = K.create({ storage: mem, now: clock });
S.load();
assert.deepStrictEqual(S.get().elders, []);
assert.strictEqual(S.get().settings.lang, 'tl');
assert.ok(S.save());
assert.ok(mem.getItem(K.STORE_KEY));
// unknown settings are dropped, missing lists filled
const n = K.normalize({ settings: { lang: 'en', bogus: 1 }, elders: 'x' });
assert.deepStrictEqual(n.settings, { lang: 'en' });
assert.deepStrictEqual(n.elders, []);
assert.deepStrictEqual(K.normalize(null).meds, []);
// corrupt storage starts fresh instead of crashing
const bad = memStorage(); bad.setItem(K.STORE_KEY, '{nope');
assert.deepStrictEqual(K.create({ storage: bad }).load().meds, []);
// a full or blocked storage reports the failure
const full = memStorage(); full.setItem = () => { throw new Error('QuotaExceededError'); };
const SF = K.create({ storage: full }); SF.load();
let saveErr = null; SF.onSaveError = (e) => { saveErr = e; };
assert.strictEqual(SF.save(), false);
assert.ok(saveErr);

/* ---------- one active copy ---------- */
const shared = memStorage();
const A = K.create({ storage: shared }), B = K.create({ storage: shared });
A.load(); B.load();
assert.ok(A.save(), 'first copy saves');
let conflict = 0; B.onConflict = () => { conflict++; };
assert.strictEqual(B.save(), false, 'stale copy must not overwrite');
assert.strictEqual(conflict, 1);
B.load();
assert.ok(B.save(), 'after reloading it may save');
assert.strictEqual(A.isCurrent(), false);

/* ---------- records, tombstones, change log ---------- */
const papa = S.addElder({ name: 'Papa' }, 'Poll');
assert.ok(papa.id && papa.updatedAt === clockNow && papa.by === 'Poll');
assert.deepStrictEqual(papa.alerts, { rerings: [10, 20], cutoffMin: 30 });
const mama = S.addElder({ name: 'Mama' }, 'Poll');
assert.strictEqual(S.find('elders', papa.id).name, 'Papa');
clockNow += MIN;
S.update('elders', papa.id, { allergies: 'Penicillin' }, 'Ate');
assert.strictEqual(S.find('elders', papa.id).by, 'Ate');
const before = S.get().changelog.length;
S.update('elders', papa.id, { allergies: 'Penicillin' }, 'Ate');
assert.strictEqual(S.get().changelog.length, before, 'no-op edits are not logged');
const last = S.get().changelog[S.get().changelog.length - 1];
assert.deepStrictEqual([last.action, last.fields, last.by, last.label], ['edit', ['allergies'], 'Ate', 'Papa']);
const tmp = S.addElder({ name: 'Temp' }, 'Poll');
assert.ok(S.remove('elders', tmp.id, 'Poll'));
assert.strictEqual(S.find('elders', tmp.id), null);
assert.strictEqual(S.list('elders').length, 2);
assert.strictEqual(S.get().elders.length, 3, 'tombstone kept for sync');
assert.ok(S.get().elders.find((e) => e.id === tmp.id).deleted);
assert.strictEqual(S.remove('elders', tmp.id), false, 'already deleted');
assert.strictEqual(S.update('elders', tmp.id, { name: 'x' }), null, 'cannot edit a deleted record');
assert.throws(() => S.add('bogus', {}));

/* ---------- medicines ---------- */
const losartanIn = { elderId: papa.id, name: 'Losartan 50mg', purpose: 'para sa altapresyon', form: 'tablet', dose: { amount: 1, unit: 'tablet' }, stock: { count: 20 } };
assert.deepStrictEqual(S.saveMed(Object.assign({}, losartanIn, { name: ' ' })).error, { field: 'name', error: 'no-name' });
assert.deepStrictEqual(S.saveMed(Object.assign({}, losartanIn, { elderId: 'nobody' })).error, { field: 'elderId', error: 'no-elder' });
assert.deepStrictEqual(S.saveMed(Object.assign({}, losartanIn, { form: 'gummy' })).error, { field: 'form', error: 'bad-form' });
assert.deepStrictEqual(S.saveMed(Object.assign({}, losartanIn, { dose: { amount: 0, unit: 'tablet' } })).error, { field: 'dose', error: 'bad-dose' });
const losartan = S.saveMed(losartanIn, 'Poll').med;
assert.strictEqual(losartan.active, true);
assert.deepStrictEqual(losartan.stock, { count: 20, packSize: 0, lowDays: 7 });
// cream for the feet: any form, not just pills
const cream = S.saveMed({ elderId: papa.id, name: 'Diclofenac gel', form: 'cream', applyTo: 'sa paa', dose: { amount: 1, unit: 'application' } }, 'Poll').med;
assert.strictEqual(cream.applyTo, 'sa paa');
assert.strictEqual(cream.stock.count, null, 'stock not tracked unless given');

// sliding-scale insulin: refused until charts are valid AND confirmed from the doctor's instructions
const chart = { context: 'any', rows: [{ from: 70, to: 150, units: 0 }, { from: 151, to: 250, units: 4 }] };
const insIn = { elderId: mama.id, name: 'Insulin glargine', form: 'insulin-pen', dose: { amount: 4, unit: 'units' }, insulin: { mode: 'scale', charts: [chart], needles: 10 } };
assert.deepStrictEqual(S.saveMed(insIn).error, { field: 'chartConfirmed', error: 'not-confirmed' });
assert.strictEqual(S.saveMed(Object.assign({}, insIn, { insulin: { mode: 'scale', charts: [] } })).error.error, 'no-chart');
const badChart = { context: 'any', rows: [{ from: 70, to: 150, units: 0 }, { from: 140, to: 250, units: 4 }] };
assert.strictEqual(S.saveMed(Object.assign({}, insIn, { insulin: { mode: 'scale', charts: [badChart], chartConfirmed: true } })).error.error, 'bad-chart');
assert.strictEqual(S.saveMed(Object.assign({}, insIn, { insulin: { mode: 'guess' } })).error.error, 'bad-mode');
const insulin = S.saveMed(Object.assign({}, insIn, { insulin: Object.assign({}, insIn.insulin, { chartConfirmed: true }), stock: { count: 300 } }), 'Poll').med;
assert.ok(insulin.id);
// editing an existing med updates it in place
S.saveMed(Object.assign({}, losartan, { purpose: 'for blood pressure' }), 'Ate');
assert.strictEqual(S.list('meds').length, 3);
assert.strictEqual(S.find('meds', losartan.id).purpose, 'for blood pressure');

/* ---------- schedules ---------- */
assert.deepStrictEqual(S.saveSchedule({ medId: 'nope', rule: rule() }).error, { field: 'medId', error: 'no-med' });
assert.deepStrictEqual(S.saveSchedule({ medId: losartan.id, rule: rule({ times: [] }) }).error, { field: 'times', error: 'no-times' });
assert.deepStrictEqual(S.saveSchedule({ medId: losartan.id, rule: rule(), dose: { amount: 0 } }).error, { field: 'dose', error: 'bad-dose' });
S.saveSchedule({ medId: losartan.id, rule: rule({ times: ['08:00', '20:00'] }) }, 'Poll');
S.saveSchedule({ medId: cream.id, rule: rule({ times: ['08:00'] }) }, 'Poll');
S.saveSchedule({ medId: insulin.id, rule: rule({ times: ['07:30'] }) }, 'Poll');

/* ---------- timeline ---------- */
const day = at(2026, 10, 9);
let tl = S.timeline(papa.id, day, day + DAY, at(2026, 10, 9, 7, 0));
assert.deepStrictEqual(tl.map((s) => s.slotKey), [papa.id + '@2026-10-09T08:00', papa.id + '@2026-10-09T20:00']);
assert.deepStrictEqual(tl[0].items.map((i) => i.medId), [losartan.id, cream.id], 'Losartan and the cream ring together');
assert.deepStrictEqual([tl[0].status, tl[1].status], ['upcoming', 'upcoming']);
assert.strictEqual(S.timeline(papa.id, day, day + DAY, at(2026, 10, 9, 8, 15))[0].status, 'due');
assert.strictEqual(S.timeline(papa.id, day, day + DAY, at(2026, 10, 9, 8, 30))[0].status, 'unconfirmed', 'cutoff at +30');
assert.deepStrictEqual(S.timeline('nobody', day, day + DAY, clockNow), []);

/* ---------- doses and stock ---------- */
const slot8 = papa.id + '@2026-10-09T08:00';
S.recordDose({ medId: losartan.id, slotKey: slot8, dueAt: at(2026, 10, 9, 8), status: 'snoozed', by: 'Papa' });
assert.strictEqual(S.find('meds', losartan.id).stock.count, 20, 'snooze does not touch stock');
assert.strictEqual(S.timeline(papa.id, day, day + DAY, at(2026, 10, 9, 8, 15))[0].items[0].status, 'due', 'snoozed still counts as due');
clockNow = at(2026, 10, 9, 8, 12);
S.recordDose({ medId: losartan.id, slotKey: slot8, dueAt: at(2026, 10, 9, 8), status: 'taken', by: 'Papa' });
S.recordDose({ medId: cream.id, slotKey: slot8, dueAt: at(2026, 10, 9, 8), status: 'skipped', by: 'Papa' });
assert.strictEqual(S.list('doses', (d) => d.slotKey === slot8 && d.medId === losartan.id).length, 1, 'one record per slot and med');
S.recordDose({ medId: cream.id, slotKey: papa.id + '@2026-10-09T08:00x', status: 'taken', by: 'Papa' });
assert.strictEqual(S.find('meds', cream.id).stock.count, null, 'untracked stock stays untracked');
assert.strictEqual(S.find('meds', losartan.id).stock.count, 19);
S.recordDose({ medId: losartan.id, slotKey: slot8, status: 'taken', by: 'Papa' });
assert.strictEqual(S.find('meds', losartan.id).stock.count, 19, 'confirming twice does not take twice');
tl = S.timeline(papa.id, day, day + DAY, at(2026, 10, 9, 9, 0));
assert.deepStrictEqual(tl[0].items.map((i) => i.status), ['taken', 'skipped']);
assert.strictEqual(tl[0].status, 'done');
// changing a taken dose to skipped puts the tablet back
S.recordDose({ medId: losartan.id, slotKey: slot8, status: 'skipped', by: 'Ate' });
assert.strictEqual(S.find('meds', losartan.id).stock.count, 20);
S.recordDose({ medId: losartan.id, slotKey: slot8, status: 'taken', units: 0.5, by: 'Papa' });
assert.strictEqual(S.find('meds', losartan.id).stock.count, 19.5, 'half a tablet');
// insulin: units actually taken, and a needle
S.recordDose({ medId: insulin.id, slotKey: mama.id + '@2026-10-09T07:30', status: 'taken', units: 6, by: 'Mama' });
assert.strictEqual(S.find('meds', insulin.id).stock.count, 294);
assert.strictEqual(S.find('meds', insulin.id).insulin.needles, 9);
assert.strictEqual(S.recordDose({ medId: 'nope', status: 'taken' }), null);

/* ---------- as-needed ---------- */
const para = S.saveMed({ elderId: papa.id, name: 'Paracetamol 500mg', form: 'tablet', dose: { amount: 1, unit: 'tablet' }, prn: { minGapMin: 240, maxPerDay: 4 }, stock: { count: 10 } }, 'Poll').med;
assert.deepStrictEqual(S.saveMed({ elderId: papa.id, name: 'X', form: 'tablet', dose: { amount: 1, unit: 'tablet' }, prn: { minGapMin: -5 } }).error, { field: 'prn', error: 'bad-limit' });
clockNow = at(2026, 10, 9, 10);
S.recordDose({ medId: para.id, status: 'taken', by: 'Papa' });
clockNow = at(2026, 10, 9, 15);
S.recordDose({ medId: para.id, status: 'taken', by: 'Papa' });
assert.strictEqual(S.list('doses', (d) => d.medId === para.id).length, 2, 'as-needed doses are separate records');
assert.deepStrictEqual(S.prnTaken(para.id), [at(2026, 10, 9, 10), at(2026, 10, 9, 15)]);
assert.strictEqual(S.find('meds', para.id).stock.count, 8);

/* ---------- low stock ---------- */
assert.deepStrictEqual(S.lowStock(papa.id).map((m) => m.name), [], 'Losartan 19.5 tablets / 2 a day = 9 days');
S.update('meds', losartan.id, { stock: { count: 14, packSize: 30, lowDays: 7 } }, 'Poll');
assert.deepStrictEqual(S.lowStock(papa.id).map((m) => m.name), ['Losartan 50mg']);

/* ---------- readings ---------- */
const sugarType = S.add('vitalTypes', { elderId: mama.id, key: 'sugar', kind: 'number', name: 'Blood sugar', unit: 'mg/dL', low: 70, high: 300, danger: [], contexts: ['fasting'] }, 'Poll');
const r = S.logReading({ elderId: mama.id, vitalTypeId: sugarType.id, value: 185, context: 'fasting', source: 'voice', by: 'Mama' });
assert.deepStrictEqual([r.value, r.context, r.source, r.at], [185, 'fasting', 'voice', clockNow]);
assert.strictEqual(S.logReading({ elderId: mama.id, vitalTypeId: 'nope', value: 1 }), null);

/* ---------- change log cap ---------- */
for (let i = 0; i < 600; i++) S.update('elders', mama.id, { allergies: 'a' + i }, 'Poll');
assert.strictEqual(S.get().changelog.length, 500);

/* ---------- round trip through storage ---------- */
assert.ok(S.save());
const S2 = K.create({ storage: mem }); S2.load();
assert.strictEqual(S2.find('meds', losartan.id).stock.count, 14);
assert.strictEqual(S2.list('elders').length, 2);

console.log('store.test.js ok');
