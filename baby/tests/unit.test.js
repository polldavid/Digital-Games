/* Alaga — unit tests for the pure modules (guide.js, store.js, rx.js).
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

// Hardening: range queries use binary search — they must match a full scan,
// including long events that start before the range and end inside it.
{ S.reset(); S.addBaby({ name: 'R', birth: '2026-01-01' });
  const t0 = new Date(2026, 5, 1).getTime();
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 400; i++) {
    const time = t0 + Math.floor(rnd() * 30 * DAY), long = rnd() < 0.2;
    S.addEvent({ type: long ? 'sleep' : 'feed', time, end: long ? time + Math.floor(rnd() * 20 * HOUR) : null, data: {} });
  }
  S.addEvent({ type: 'sleep', time: t0 + 9 * DAY, end: t0 + 12 * DAY, data: {} }); // spans several days
  const naive = (o) => S.get().events.filter(e => e.baby === S.get().activeBaby
    && (!o.type || [].concat(o.type).includes(e.type))
    && (o.from == null || (e.end || e.time) >= o.from) && (o.to == null || e.time < o.to));
  for (let k = 0; k < 60; k++) {
    const from = t0 + Math.floor(rnd() * 32 * DAY) - DAY, to = rnd() < 0.5 ? from + Math.floor(rnd() * 5 * DAY) : null;
    const o = { from, to, type: rnd() < 0.5 ? 'sleep' : null };
    assert.deepStrictEqual(S.events(o).map(e => e.id), naive(o).map(e => e.id), 'events() range matches a full scan');
  }
  const longOne = S.get().events.find(e => e.end === t0 + 12 * DAY);
  S.updateEvent(longOne.id, { end: t0 + 20 * DAY }); // longer than anything before: cache must notice
  assert.ok(S.events({ from: t0 + 19 * DAY }).some(e => e.id === longOne.id), 'edited span is picked up');
}
// Hardening: a failed save is reported, and a later good save clears it.
{ let failed = 0, ok = 0;
  S.onSaveError = () => failed++; S.onSaveOk = () => ok++;
  const full = { setItem() { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; } };
  assert.strictEqual(S.save(full), false, 'save() says when it failed');
  assert.strictEqual(failed, 1, 'failure reported');
  const mem = { m: {}, getItem(k) { return k in this.m ? this.m[k] : null; }, setItem(k, v) { this.m[k] = String(v); } };
  assert.strictEqual(S.save(mem), true);
  assert.strictEqual(ok, 1, 'recovery reported');
  assert.ok(JSON.parse(mem.getItem(S.STORE_KEY)).babies.length === 1, 'state written');
  S.onSaveError = S.onSaveOk = null;

  // One writer: a copy whose picture of the log is older never saves over a newer one.
  const shared = { m: {}, getItem(k) { return k in this.m ? this.m[k] : null; }, setItem(k, v) { this.m[k] = String(v); } };
  const fresh = () => { const p = require.resolve('../js/store.js'); delete require.cache[p]; return require(p); };
  const tab1 = fresh(); tab1.addBaby({ name: 'M', birth: '2026-10-01' }); assert.ok(tab1.save(shared));
  const tab2 = fresh(); tab2.load(shared);            // a second copy opens
  tab1.addEvent({ type: 'diaper', time: 1, data: {} }); assert.ok(tab1.save(shared)); // the first keeps logging
  let conflicts = 0; tab2.onConflict = () => conflicts++;
  tab2.get().settings.chime = false;                   // the old copy tries to save
  assert.strictEqual(tab2.save(shared), false, 'the older copy is refused');
  assert.strictEqual(conflicts, 1, 'and told so');
  assert.strictEqual(JSON.parse(shared.getItem(tab1.STORE_KEY)).events.length, 1, 'newer entries survive');
  assert.ok(tab2.isCurrent(shared) === false && tab1.isCurrent(shared) === true);
  const tab3 = fresh(); tab3.load(shared); assert.ok(tab3.save(shared), 'a copy loaded fresh can save');
  // Deliberate deletions are counted for sync.
  tab3.takeDeleteBudget();
  const e = tab3.addEvent({ type: 'diaper', time: 2, data: {} }); tab3.removeEvent(e.id); tab3.removeEvent('nope');
  assert.strictEqual(tab3.takeDeleteBudget(), 1, 'one real deletion');
  assert.strictEqual(tab3.takeDeleteBudget(), 0, 'taken once');
}
console.log('hardening unit tests passed');

// Release guard: index.html must ask for exactly the asset versions the
// service worker caches, or a fresh page can be paired with stale CSS/JS.
{ const fs = require('fs');
  const html = ['index.html', 'privacy.html'].map((f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join(' ');
  const sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
  const V = (sw.match(/var V = '(\d+)'/) || [])[1];
  assert.ok(V, 'sw.js declares var V');
  const refs = [...html.matchAll(/(?:src|href)="((?:js|css|\.\.)\/[^"]+\.(?:js|css)(?:\?[^"]*)?)"/g)].map(m => m[1]);
  assert.ok(refs.length >= 15, 'found the page’s scripts and stylesheets');
  refs.forEach(r => assert.ok(r.endsWith('?v=' + V), r + ' must end with ?v=' + V + ' (bump sw.js V and index.html together)'));
  console.log('release guard passed (v' + V + ')');
}

// WHO growth percentiles: the table's own medians and centiles come back out.
{
  const G = require('../js/guide.js');
  const M = 365.25 / 12;
  assert.strictEqual(G.growthPercentile('wfa', 'm', 0, 3.3464).label, '50th');
  assert.strictEqual(G.growthPercentile('wfa', 'f', 6 * M, 7.297).label, '50th');
  assert.ok(Math.abs(G.growthPercentile('wfa', 'm', 0, 2.459312).pct - 2.3) < 0.05, 'boys birth 2.3rd centile');
  assert.ok(Math.abs(G.growthPercentile('lfa', 'f', 12 * M, 75.7518).pct - 75) < 0.1, 'girls 12m length 75th');
  assert.ok(Math.abs(G.growthAt('hcfa', 'm', 24 * M, 50) - 48.2515) < 0.01, 'boys 24m head median');
  // Between months: interpolated, so it lands between the two medians.
  const mid = G.growthAt('wfa', 'm', 1.5 * M, 50);
  assert.ok(mid > 4.4709 && mid < 5.5675);
  assert.strictEqual(G.growthPercentile('wfa', 'm', 0, 1.5).level, 'check');
  assert.strictEqual(G.growthPercentile('wfa', 'm', 0, 1.5).label, 'below 1st');
  assert.strictEqual(G.growthPercentile('wfa', 'm', 800, 12), null, 'past 2 years: none');
  assert.strictEqual(G.growthPercentile('wfa', '', 30, 4), null, 'no sex: none');
  assert.strictEqual(G.linesCrossed(60, 20), 2);
  assert.strictEqual(G.linesCrossed(55, 30), 1, 'only the 50th');
  assert.strictEqual(G.linesCrossed(45, 30), 0);
  assert.strictEqual(G.growthPercentile('wfa', 'm', 0, 3.0).label, '23rd');
  const at = (pc) => G.growthPercentile('lfa', 'm', 0, G.growthAt('lfa', 'm', 0, pc)).label;
  assert.deepStrictEqual([1, 2, 11, 12, 13, 21, 22, 50].map(at), ['1st', '2nd', '11th', '12th', '13th', '21st', '22nd', '50th']);
  console.log('growth percentile tests passed');
}

// Bottle timer and pace
{
  const p = require.resolve('../js/store.js'); delete require.cache[p];
  const S = require(p), G = require('../js/guide.js');
  S.reset(); S.addBaby({ name: 'B', birth: '2026-10-01' });
  const t0 = 1e12, MIN = 60000;
  S.bottleStart(t0);
  S.bottlePause(t0 + 5 * MIN);                 // burp break
  S.bottlePause(t0 + 7 * MIN);                 // resume
  assert.strictEqual(S.bottleTotal(S.timers().bottle, t0 + 10 * MIN), 8 * MIN, 'pause time not counted');
  S.bottleFinish(t0 + 20 * MIN);
  const b = S.timers().bottle;
  assert.ok(b.done && b.acc === 18 * MIN && b.end === t0 + 20 * MIN);
  assert.strictEqual(S.bottleTotal(b, t0 + 99 * MIN), 18 * MIN, 'frozen once finished');
  S.bottleResume(t0 + 21 * MIN);
  assert.ok(!S.timers().bottle.done);
  assert.strictEqual(S.bottleTotal(S.timers().bottle, t0 + 23 * MIN), 20 * MIN);
  // Pace: 15 ml in 28 min is slow; 60 ml in 15 min fine; 120 ml in 3 min fast.
  assert.strictEqual(G.bottlePace(15, 28 * MIN).level, 'slow');
  assert.strictEqual(G.bottlePace(15, 20 * MIN).level, 'slow', 'under 1 ml/min after 15 min');
  assert.strictEqual(G.bottlePace(60, 15 * MIN).level, 'ok');
  assert.strictEqual(G.bottlePace(120, 3 * MIN).level, 'fast');
  assert.strictEqual(G.bottlePace(60, 35 * MIN).level, 'slow');
  assert.strictEqual(G.bottlePace(60, 20 * 1000), null, 'under a minute: no verdict');
  console.log('bottle timer tests passed');
}

// Milk storage (CDC)
{
  const p = require.resolve('../js/store.js'); delete require.cache[p];
  const S = require(p), G = require('../js/guide.js');
  const H = 3600e3, D = 24 * H, t0 = 1.8e12;
  S.reset(); S.addBaby({ name: 'M', birth: '2026-10-01' });
  const exp = (m) => G.milkExpiry(m).at - (m.leftoverAt || m.madeAt);

  // Fresh breast milk by place
  let a = S.milkAdd({ kind: 'breast', ml: 120, where: 'room', madeAt: t0 }, t0);
  assert.strictEqual(exp(a), 4 * H, 'room 4 h');
  S.milkMove(a.id, 'fridge', t0 + H);
  assert.strictEqual(exp(a), 4 * D, 'fridge 4 days from pumping');
  S.milkMove(a.id, 'freezer', t0 + 2 * H);
  assert.strictEqual(exp(a), 365 * D, 'freezer up to 12 months');
  assert.strictEqual(G.milkExpiry(a).best - t0, 183 * D, 'best within 6 months');
  assert.deepStrictEqual(G.milkMoves(a), ['thawFridge', 'thawRoom']);
  // Thaw in the fridge: 24 h, never refreeze
  const t1 = t0 + 30 * D;
  S.milkMove(a.id, 'thawFridge', t1);
  assert.strictEqual(G.milkExpiry(a).at, t1 + D, 'thawed: 24 h in fridge');
  assert.strictEqual(S.milkMove(a.id, 'freezer', t1 + H), false, 'never refreeze');
  // Warm it: 2 h, and never later than the fridge limit
  S.milkMove(a.id, 'room', t1 + 23 * H);
  assert.strictEqual(G.milkExpiry(a).at, t1 + D, 'warming can’t extend past the thawed limit');
  // Fridge milk taken out: 2 h from taking out
  let b = S.milkAdd({ kind: 'breast', ml: 60, where: 'fridge', madeAt: t0 }, t0);
  S.milkMove(b.id, 'room', t0 + D);
  assert.strictEqual(G.milkExpiry(b).at, t0 + D + 2 * H, 'chilled then warmed: 2 h');
  // Cooler: 1 day
  let c = S.milkAdd({ kind: 'breast', ml: 60, where: 'cooler', madeAt: t0 }, t0);
  assert.strictEqual(G.milkExpiry(c).at, t0 + D);

  // Formula: 2 h at room, 24 h in fridge only if chilled within 2 h, 1 h once a feed starts, never frozen
  let f = S.milkAdd({ kind: 'formula', ml: 90, where: 'room', madeAt: t0 }, t0);
  assert.strictEqual(exp(f), 2 * H);
  assert.deepStrictEqual(G.milkMoves(f), ['fridge']);
  assert.strictEqual(S.milkMove(f.id, 'freezer', t0), false, 'formula is never frozen');
  S.milkMove(f.id, 'fridge', t0 + H);
  assert.strictEqual(exp(f), D, 'formula fridge 24 h');
  let f2 = S.milkAdd({ kind: 'formula', ml: 90, where: 'room', madeAt: t0 }, t0);
  S.bottleStart(t0 + 30 * 60e3, f2.id);
  assert.strictEqual(G.milkExpiry(f2).at, t0 + 90 * 60e3, '1 h once the feed starts');
  assert.strictEqual(S.timers().bottle.offeredMl, 90);

  // After a feed: leftovers
  S.bottleFinish(t0 + 50 * 60e3);
  const fe = S.addEvent({ type: 'feed', time: t0 + 30 * 60e3, end: t0 + 50 * 60e3, data: { kind: 'bottle', amountMl: 60, offeredMl: 90, milk: 'formula' } });
  let r = S.milkAfterFeed(fe, f2.id);
  assert.deepStrictEqual([r.kind, r.ml, r.leftover], ['formula', 30, null], 'formula leftover: throw out');
  assert.strictEqual(S.milkItem(f2.id).status, 'used');
  let bm = S.milkAdd({ kind: 'breast', ml: 100, where: 'fridge', madeAt: t0 }, t0);
  const be = S.addEvent({ type: 'feed', time: t0 + D, end: t0 + D + 20 * 60e3, data: { kind: 'bottle', amountMl: 70, offeredMl: 100, milk: 'breast' } });
  r = S.milkAfterFeed(be, bm.id);
  assert.strictEqual(r.ml, 30);
  assert.strictEqual(G.milkExpiry(r.leftover).at, t0 + D + 20 * 60e3 + 2 * H, 'breast milk leftover: 2 h after the feed');
  assert.deepStrictEqual(G.milkMoves(r.leftover), [], 'leftovers stay put');
  // A leftover from milk about to expire keeps the earlier limit
  let old = S.milkAdd({ kind: 'breast', ml: 50, where: 'fridge', madeAt: t0 }, t0);
  const oe = S.addEvent({ type: 'feed', time: t0 + 4 * D - 30 * 60e3, end: t0 + 4 * D - 20 * 60e3, data: { kind: 'bottle', amountMl: 20, offeredMl: 50, milk: 'breast' } });
  r = S.milkAfterFeed(oe, old.id);
  assert.strictEqual(G.milkExpiry(r.leftover).at, t0 + 4 * D, 'capped by the source’s use-by');
  // Reminders: one per active item, with the first baby
  const rem = S.reminders(t0 + 3 * D, S.get().babies[0].id).filter((x) => x.kind === 'milk');
  assert.ok(rem.length >= 1 && rem.every((x) => x.milkId));
  // Old used/thrown-out milk is dropped after two weeks
  S.milkDone(c.id, 'discarded', Date.now() - 20 * D);
  S.set(S.get());
  assert.strictEqual(S.milkItem(c.id), null);
  console.log('milk storage tests passed');
}

// Anonymous usage count: each phone counts itself once a day, once a week, once a month, once ever.
{
  const P = require('../js/ping.js');
  const at = (s) => new Date(s).getTime();
  let r = P.due(null, at('2026-10-07T09:00'));
  assert.deepStrictEqual(r.flags, { d: 1, w: 1, m: 1, n: 1 }, 'first ever: new install, new week, new month');
  let last = r.next;
  assert.strictEqual(P.due(last, at('2026-10-07T23:30')), null, 'same day: nothing to send');
  r = P.due(last, at('2026-10-08T07:00'));
  assert.deepStrictEqual(r.flags, { d: 1, w: 0, m: 0, n: 0 }, 'next day, same week and month');
  last = r.next;
  r = P.due(last, at('2026-10-12T07:00')); // Monday
  assert.deepStrictEqual(r.flags, { d: 1, w: 1, m: 0, n: 0 }, 'a new ISO week');
  last = r.next;
  r = P.due(last, at('2026-11-02T07:00'));
  assert.deepStrictEqual(r.flags, { d: 1, w: 1, m: 1, n: 0 }, 'a new month');
  assert.strictEqual(P.weekKey(new Date('2026-01-01T12:00')), '2026-W01');
  assert.strictEqual(P.weekKey(new Date('2027-01-01T12:00')), '2026-W53');
  console.log('usage count tests passed');
}
