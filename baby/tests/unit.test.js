/* Baby Log — unit tests for the pure modules (guide.js, store.js, rx.js).
   No dependencies:  node baby/tests/unit.test.js
   Exits non-zero on the first failing assertion. */
const assert = require('assert');
const path = require('path');
const js = (f) => path.join(__dirname, '..', 'js', f);
const G = require(js('guide.js'));
global.BabyGuide = G;
const S = require(js('store.js'));
const MIN=60000,HOUR=60*MIN,DAY=24*HOUR;
// age
const now = new Date(2026, 9, 2, 14, 0).getTime();
assert.strictEqual(G.ageInDays('2026-10-02', now), 0);
assert.strictEqual(G.ageInDays('2026-09-25', now), 7);
assert.strictEqual(G.ageLabel(0), 'Born today');
assert.strictEqual(G.ageLabel(3), '3 days old');
assert.strictEqual(G.ageLabel(23), '3 weeks, 2 days');
assert.match(G.ageLabel(100), /^3 months/);
// diapers rule
assert.strictEqual(G.diapersFor(0).wet, 1);
assert.strictEqual(G.diapersFor(2).wet, 3);
assert.strictEqual(G.diapersFor(4).wet, 6);
assert.strictEqual(G.diapersFor(50).dirty, 0);
// fever
assert.strictEqual(G.feverCheck(38.0, 30).level, 'urgent');
assert.strictEqual(G.feverCheck(37.9, 30).level, 'ok');
assert.strictEqual(G.feverCheck(38.2, 120).level, 'warn');
assert.strictEqual(G.feverCheck(39.0, 120).level, 'urgent');
assert.strictEqual(G.feverCheck(39.5, 300).level, 'warn');
assert.strictEqual(G.feverCheck(40, 300).level, 'urgent');
assert.strictEqual(G.feverCheck(35, 300).level, 'urgent');
// poop
assert.strictEqual(G.poopCheck('black', 2).level, 'ok');
assert.strictEqual(G.poopCheck('black', 10).level, 'warn');
assert.strictEqual(G.poopCheck('white', 10).level, 'urgent');
// store
S.reset();
const b = S.addBaby({ name: 'Ava', birth: '2026-09-11', feeding: 'breast' }); // 21 days
assert.strictEqual(S.ageDays(now), 21);
const f = S.addEvent({ type: 'feed', time: now - 3 * HOUR, end: now - 3*HOUR + 20*MIN, data: { kind: 'breast', left: 10*MIN, right: 10*MIN, startSide: 'L' } });
S.addEvent({ type: 'diaper', time: now - 2*HOUR, data: { wet: true, dirty: true, color: 'yellow' } });
S.addEvent({ type: 'sleep', time: now - 2*HOUR, end: now - 40*MIN, data: {} });
S.addEvent({ type: 'feed', time: now - 1*HOUR, data: { kind: 'solids', food: 'x' } }); // solids must not count as milk feed
assert.strictEqual(S.lastFeedAnchor().id, f.id);
// reminders: feed due at +2.5h from start -> overdue by 30 min
let rem = S.reminders(now);
let feedR = rem.find(r => r.kind === 'feed');
assert.strictEqual(feedR.at, f.time + 2.5*HOUR);
let due = S.due(now);
assert.ok(due.some(r => r.kind === 'feed'));
due.forEach(S.markFired);
assert.strictEqual(S.due(now).length, 0, 'fires once');
// nap: woke 40 min ago; wake window 35-60 -> at midpoint 47.5 min
let nap = rem.find(r => r.kind === 'nap');
assert.strictEqual(nap.at, now - 40*MIN + 47.5*MIN);
// snooze
S.snooze(feedR.key, now + 15*MIN);
assert.strictEqual(S.reminders(now).find(r=>r.kind==='feed').at, now + 15*MIN);
assert.strictEqual(S.due(now + 16*MIN).filter(r=>r.kind==='feed').length, 1, 'fires again after snooze');
// new feed moves the anchor
const f2 = S.addEvent({ type: 'feed', time: now, data: { kind: 'bottle', amountMl: 90, milk: 'breast' } });
assert.ok(S.reminders(now).find(r=>r.kind==='feed').key.includes(f2.id));
// summary
const s = S.daySummary(S.startOfDay(now), now);
assert.strictEqual(s.feeds, 2); assert.strictEqual(s.solids, 1); assert.strictEqual(s.wet, 1); assert.strictEqual(s.dirty, 1);
assert.strictEqual(s.bottleMl, 90);
assert.strictEqual(Math.round(s.sleepMs/MIN), 80);
// breast timer
S.breastSwitch('L', now); S.breastSwitch('R', now + 5*MIN);
let tt = S.breastTotals(S.timers().breast, now + 8*MIN);
assert.strictEqual(tt.L, 5*MIN); assert.strictEqual(tt.R, 3*MIN);
S.breastPause(now + 8*MIN);
tt = S.breastTotals(S.timers().breast, now + 20*MIN);
assert.strictEqual(tt.total, 8*MIN, 'paused time not counted');
assert.strictEqual(S.timers().breast.firstSide, 'L');
// medicine spacing
S.addEvent({ type: 'med', time: now - 2*HOUR, data: { medId: 'acetaminophen', name: 'Acetaminophen', intervalH: 4, maxPerDay: 5, remind: true } });
const ms = S.medStatus('acetaminophen', now);
assert.strictEqual(ms.nextAt, now + 2*HOUR); assert.strictEqual(ms.count24, 1);
assert.ok(S.reminders(now).some(r => r.kind === 'med' && r.at === now + 2*HOUR));
// custom every-N reminder
S.get().custom.push({ id: 'c1', baby: b.id, label: 'Antibiotic', repeat: 'every', everyH: 8, anchor: now - 9*HOUR, on: true });
let c = S.reminders(now).find(r => r.customId === 'c1');
assert.strictEqual(c.at, now - 1*HOUR, 'most recent unfired slot');
S.markFired(c);
c = S.reminders(now).find(r => r.customId === 'c1');
assert.strictEqual(c.at, now + 7*HOUR, 'next slot after firing');
// daily custom
S.get().custom.push({ id: 'c2', baby: b.id, label: 'Daily', repeat: 'daily', time: '09:00', on: true });
c = S.reminders(now).find(r => r.customId === 'c2');
assert.strictEqual(new Date(c.at).getHours(), 9);
S.markFired(c);
c = S.reminders(now).find(r => r.customId === 'c2');
assert.strictEqual(c.at, new Date(2026, 9, 3, 9, 0).getTime(), 'tomorrow after firing');
// cry reasons ranking: fed 3h ago, diaper 2h, awake 40 min
const reasons = G.cryReasons({ days: 21, now, lastFeed: now - 3*HOUR, lastDiaper: now - 2*HOUR, awakeSinceMs: 40*MIN, feedingType: 'breast', hour: 14 });
assert.strictEqual(reasons[0].id, 'hunger');
const r2 = G.cryReasons({ days: 21, now, lastFeed: now - 30*MIN, lastFeedEnd: now - 10*MIN, lastDiaper: now - 20*MIN, awakeSinceMs: 90*MIN, hour: 14 });
assert.strictEqual(r2[0].id, 'tired');
const r3 = G.cryReasons({ days: 30, now, lastFeed: now - 30*MIN, lastTemp: { tempC: 38.4, time: now - 10*MIN } });
assert.strictEqual(r3[0].id, 'fever'); assert.ok(r3[0].urgent);
// export/import round trip and merge
const json = S.exportJSON();
const count = S.get().events.length;
S.reset(); S.importJSON(json, 'merge');
assert.strictEqual(S.get().events.length, count);
const res = S.importJSON(json, 'merge');
assert.strictEqual(res.events, 0, 'merge dedupes');
assert.ok(S.exportCSV().split('\n').length === count + 1);
// events type filter
assert.ok(S.events({ type: ['feed','diaper'] }).every(e => e.type==='feed'||e.type==='diaper'));
console.log('all unit tests passed');
// --- QA fixes: reminders respect a sleeping baby
{
  const now2 = new Date(2026, 9, 4, 3, 0).getTime();
  S.reset(); S.addBaby({ name: 'Ava', birth: '2026-09-22', feeding: 'breast' }); // 12 days
  S.get().settings.diaperRemind = true;
  S.addEvent({ type: 'feed', time: now2 - 3 * HOUR, data: { kind: 'breast', left: 6e5, right: 6e5 } });
  S.addEvent({ type: 'diaper', time: now2 - 4 * HOUR, data: { wet: true } });
  S.startTimer('sleep', null, now2 - 2.5 * HOUR);
  assert.deepStrictEqual(S.due(now2).map(r => r.kind), [], 'nothing fires at 3h while a 12-day-old sleeps');
  const wake = S.reminders(now2).find(r => r.key.startsWith('feedwake:'));
  assert.strictEqual(wake.at, now2 + 1 * HOUR, 'newborn wake-to-feed at 4h');
  S.updateBaby(S.get().activeBaby, { birth: '2026-08-01' }); // 2 months
  assert.ok(!S.reminders(now2).some(r => r.kind === 'feed'), 'older baby: never woken for a feed');
  S.stopTimer('sleep');
  assert.ok(S.reminders(now2).some(r => r.kind === 'feed') && S.due(now2).some(r => r.kind === 'diaper'), 'awake again: reminders return');
}
console.log('QA-fix unit tests passed');

{ const R = require(js('rx.js'));
  const m = R.parse('1. Amoxicillin 250mg/5mL\nSig: 2.5 mL three times a day x 7 days\n2. Paracetamol 120mg/SmL\nSig: l.2 mL every 4 hours as needed')
  assert.deepStrictEqual(m.map(x => [x.name, x.strength, x.dose, x.intervalH, x.durationDays || 0, !!x.prn]), [['Amoxicillin','250mg/5mL','2.5 ml',8,7,false],['Paracetamol','120mg/5mL','1.2 ml',4,0,true]]);
  console.log('prescription parser tests passed'); }
