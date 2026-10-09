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
assert.deepStrictEqual(S.saveMed(insIn).error, { field: 'charts', error: 'not-confirmed' });
assert.strictEqual(S.saveMed(Object.assign({}, insIn, { insulin: { mode: 'scale', charts: [] } })).error.error, 'no-chart');
const badChart = { context: 'any', rows: [{ from: 70, to: 150, units: 0 }, { from: 140, to: 250, units: 4 }] };
assert.strictEqual(S.saveMed(Object.assign({}, insIn, { insulin: { mode: 'scale', charts: [badChart], chartConfirmed: true } })).error.error, 'bad-chart');
assert.strictEqual(S.saveMed(Object.assign({}, insIn, { insulin: { mode: 'guess' } })).error.error, 'bad-mode');
const insulin = S.saveMed(Object.assign({}, insIn, { stock: { count: 300 } }), 'Poll', { confirmChart: true }).med;
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

/* ---------- review fixes ---------- */
{
  clockNow = at(2026, 10, 10, 7, 0);
  const R = K.create({ storage: memStorage(), now: clock }); R.load();
  const p = R.addElder({ name: 'Papa' });
  const tab = R.saveMed({ elderId: p.id, name: 'Metformin', form: 'tablet', dose: { amount: 1, unit: 'tablet' }, stock: { count: 20 } }).med;
  const s1 = R.saveSchedule({ medId: tab.id, rule: rule({ start: '2026-10-10', times: ['08:00'] }) }).schedule;
  const k8 = p.id + '@2026-10-10T08:00';
  const dose8 = () => R.list('doses', (d) => d.slotKey === k8)[0];
  // C2: undo gives back exactly what was taken; re-confirming with other units adjusts by the difference
  R.recordDose({ medId: tab.id, scheduleId: s1.id, slotKey: k8, status: 'taken', units: 0.5 });
  R.recordDose({ medId: tab.id, scheduleId: s1.id, slotKey: k8, status: 'skipped' });
  assert.strictEqual(R.find('meds', tab.id).stock.count, 20, 'half a tablet undone gives back half');
  R.recordDose({ medId: tab.id, scheduleId: s1.id, slotKey: k8, status: 'taken', units: 1 });
  R.recordDose({ medId: tab.id, scheduleId: s1.id, slotKey: k8, status: 'taken', units: 2 });
  assert.strictEqual(R.find('meds', tab.id).stock.count, 18, 're-confirming with 2 takes one more');
  assert.strictEqual(dose8().units, 2);
  R.recordDose({ medId: tab.id, scheduleId: s1.id, slotKey: k8, status: 'skipped' });
  assert.strictEqual(R.find('meds', tab.id).stock.count, 20);
  assert.strictEqual(dose8().units, null, 'a skipped dose records no units');
  // I2: only known statuses; a taken dose cannot be snoozed back to due
  assert.strictEqual(R.recordDose({ medId: tab.id, slotKey: k8, status: 'tken' }), null);
  R.recordDose({ medId: tab.id, scheduleId: s1.id, slotKey: k8, status: 'taken' });
  assert.strictEqual(R.recordDose({ medId: tab.id, slotKey: k8, status: 'snoozed' }), null);
  assert.strictEqual(dose8().status, 'taken');
  assert.strictEqual(R.find('meds', tab.id).stock.count, 19);
  // I3: editing a med never resets stock (or needles) from the form
  R.saveMed(Object.assign({}, tab, { purpose: 'para sa sugar', stock: undefined }));
  assert.strictEqual(R.find('meds', tab.id).stock.count, 19, 'a form without stock keeps the count');
  R.saveMed(Object.assign({}, tab, { stock: { count: 20, lowDays: 5 } }));
  assert.deepStrictEqual([R.find('meds', tab.id).stock.count, R.find('meds', tab.id).stock.lowDays], [19, 5], 'stale count ignored, settings kept');
  assert.ok(R.setStockCount(tab.id, 30, 'Poll'));
  assert.strictEqual(R.find('meds', tab.id).stock.count, 30, 'counting the pills is its own action');
  assert.strictEqual(R.setStockCount(tab.id, -1), null);
  // I6: a schedule's own dose is shown and used
  const s2 = R.saveSchedule({ medId: tab.id, rule: rule({ start: '2026-10-10', times: ['21:00'] }), dose: { amount: 2, unit: 'tablet' } }).schedule;
  const tl = R.timeline(p.id, at(2026, 10, 10), at(2026, 10, 11), at(2026, 10, 10, 7));
  assert.deepStrictEqual(tl[1].items[0].dose, { amount: 2, unit: 'tablet' });
  R.recordDose({ medId: tab.id, scheduleId: s2.id, slotKey: p.id + '@2026-10-10T21:00', status: 'taken' });
  assert.strictEqual(R.find('meds', tab.id).stock.count, 28);
  // I1: moving a schedule's time mid-day keeps the taken dose visible and flags the moved slot
  clockNow = at(2026, 10, 10, 8, 20);
  R.saveSchedule(Object.assign({}, s1, { rule: rule({ start: '2026-10-10', times: ['09:00'] }) }));
  const tl2 = R.timeline(p.id, at(2026, 10, 10), at(2026, 10, 11), at(2026, 10, 10, 9, 40));
  const t8 = tl2.find((s) => s.slotKey === k8), t9 = tl2.find((s) => s.slotKey === p.id + '@2026-10-10T09:00');
  assert.ok(t8 && t8.orphan && t8.items[0].status === 'taken', 'the 08:00 dose is still shown as taken');
  assert.deepStrictEqual(tl2.map((s) => s.slotKey), [k8, p.id + '@2026-10-10T09:00', p.id + '@2026-10-10T21:00'], 'sorted by time');
  assert.strictEqual(t9.items[0].takenEarlier, true, 'the moved slot knows this dose was already taken today');
  assert.ok(!tl2[2].items[0].takenEarlier, 'the evening schedule is not affected');
  // I7: sliding-scale insulin needs no placeholder dose, but units must be given when taken
  const chart = { context: 'any', rows: [{ from: 70, to: 300, units: 4 }] };
  const ins = R.saveMed({ elderId: p.id, name: 'Insulin', form: 'insulin-pen', dose: { unit: 'units' }, insulin: { mode: 'scale', charts: [chart], needles: 10 }, stock: { count: 300 } }, 'Poll', { confirmChart: true }).med;
  assert.ok(ins, 'no placeholder dose amount needed');
  assert.strictEqual(R.recordDose({ medId: ins.id, slotKey: 'x', status: 'taken' }), null, 'units must be given');
  R.recordDose({ medId: ins.id, slotKey: 'x', status: 'taken', units: 6 });
  assert.deepStrictEqual([R.find('meds', ins.id).stock.count, R.find('meds', ins.id).insulin.needles], [294, 9]);
  R.recordDose({ medId: ins.id, slotKey: 'x', status: 'skipped' });
  assert.deepStrictEqual([R.find('meds', ins.id).stock.count, R.find('meds', ins.id).insulin.needles], [300, 10], 'insulin and the needle given back');
  // I4: a changed chart needs a fresh confirmation; an unchanged one does not
  const cur = R.find('meds', ins.id);
  assert.ok(R.saveMed(Object.assign({}, cur, { purpose: 'para sa sugar' })).med, 'unchanged chart saves');
  const edited = JSON.parse(JSON.stringify(cur)); edited.insulin.charts[0].rows[0].units = 40;
  assert.deepStrictEqual(R.saveMed(edited).error, { field: 'charts', error: 'not-confirmed' });
  assert.strictEqual(R.find('meds', ins.id).insulin.charts[0].rows[0].units, 4);
  assert.ok(R.saveMed(edited, 'Ate', { confirmChart: true }).med);
  assert.strictEqual(R.find('meds', ins.id).insulin.chartConfirmedBy, 'Ate');
  // I5: duplicate chart contexts refused
  const dup = JSON.parse(JSON.stringify(R.find('meds', ins.id))); dup.insulin.charts.push(chart);
  assert.strictEqual(R.saveMed(dup, 'Poll', { confirmChart: true }).error.error, 'bad-chart');
}

console.log('store.test.js ok');
