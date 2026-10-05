/* Voice logging parser — node baby/tests/voice.test.js */
'use strict';
const assert = require('assert');
const V = require('../js/voice.js');
const NOW = new Date(2026, 9, 5, 15, 0).getTime(); // 3:00 pm
const MIN = 60000, HOUR = 60 * MIN;
const base = { now: NOW, volume: 'ml', temp: 'C', weight: 'kg', feeding: 'mixed', activeBaby: 'a', babies: [{ id: 'a', name: 'Ava' }, { id: 'b', name: 'Ben' }], timers: {}, rx: [{ id: 'rx1', name: 'Amoxicillin 250mg/5mL' }] };
const P = (t, extra) => V.parse(t, Object.assign({}, base, extra || {}));
let n = 0;
function is(text, check, extra) { const r = P(text, extra); try { check(r); n++; } catch (e) { console.error('✗ "' + text + '" →', JSON.stringify(r)); throw e; } }

// Bottles
is('bottle 120 ml formula', r => { assert.strictEqual(r.type, 'feed'); assert.deepStrictEqual([r.data.kind, r.data.amountMl, r.data.milk], ['bottle', 120, 'formula']); });
is('Bottle, one hundred twenty mils of breast milk', r => assert.deepStrictEqual([r.data.amountMl, r.data.milk], [120, 'breast']));
is('drank 4 oz', r => assert.strictEqual(r.data.amountMl, 118));
is('bottle 4', r => assert.strictEqual(r.data.amountMl, 118), { volume: 'oz' });
is('dede 90 ml', r => assert.strictEqual(r.data.amountMl, 90));
is('bottle 90 ml 20 minutes ago', r => assert.strictEqual(r.time, NOW - 20 * MIN));
is('bottle 60 at 2:30', r => assert.strictEqual(r.time, new Date(2026, 9, 5, 14, 30).getTime()));
is('bottle 60 at 9 pm', r => assert.strictEqual(r.time, new Date(2026, 9, 4, 21, 0).getTime())); // yesterday evening
// Diapers
is('wet diaper', r => { assert.strictEqual(r.type, 'diaper'); assert.deepStrictEqual([r.data.wet, r.data.dirty], [true, false]); });
is('Poopy diaper, yellow and seedy', r => assert.deepStrictEqual([r.data.wet, r.data.dirty, r.data.color, r.data.texture], [false, true, 'yellow', 'seedy']));
is('pee and poop', r => assert.deepStrictEqual([r.data.wet, r.data.dirty], [true, true]));
is('umihi si Ava', r => { assert.strictEqual(r.type, 'diaper'); assert.strictEqual(r.data.wet, true); assert.strictEqual(r.baby, 'a'); });
is('Ben had a dirty diaper with a rash', r => { assert.strictEqual(r.baby, 'b'); assert.ok(r.data.dirty && r.data.rash); });
is('tumae, green', r => assert.deepStrictEqual([r.data.dirty, r.data.color], [true, 'green']));
is('changed a diaper an hour ago', r => { assert.ok(r.data.wet); assert.strictEqual(r.time, NOW - HOUR); });
// Sleep
is('she fell asleep', r => assert.deepStrictEqual([r.kind, r.action], ['action', 'sleep-start']));
is('tulog na si Ava', r => assert.deepStrictEqual([r.action, r.baby], ['sleep-start', 'a']));
is('woke up', r => assert.strictEqual(r.action, 'sleep-stop'), { timers: { sleep: true } });
is('woke up', r => assert.strictEqual(r.kind, 'unknown'));
is('slept 2 hours', r => { assert.strictEqual(r.type, 'sleep'); assert.strictEqual(r.end - r.time, 2 * HOUR); });
is('napped 45 minutes', r => assert.strictEqual(r.end - r.time, 45 * MIN));
is('slept an hour and a half', r => assert.strictEqual(r.end - r.time, 1.5 * HOUR));
// Breastfeeding
is('fed left side 15 minutes', r => { assert.strictEqual(r.data.kind, 'breast'); assert.strictEqual(r.data.left, 15 * MIN); assert.strictEqual(r.end, NOW); });
is('breastfed left 10 right 5', r => assert.deepStrictEqual([r.data.left, r.data.right], [10 * MIN, 5 * MIN]));
is('start feeding on the right', r => assert.deepStrictEqual([r.action, r.side], ['breast-side', 'R']));
is('switch sides', r => assert.deepStrictEqual([r.action, r.side], ['breast-side', 'L']), { timers: { breast: { side: 'R' } } });
is('done feeding', r => assert.strictEqual(r.action, 'breast-finish'), { timers: { breast: { side: 'L' } } });
is('dumede sa kaliwa', r => assert.deepStrictEqual([r.action, r.side], ['breast-side', 'L']));
// Pump / tummy
is('start pumping', r => assert.strictEqual(r.action, 'pump-both'));
is('pump left', r => assert.deepStrictEqual([r.action, r.side], ['pump-side', 'L']));
is('stop pumping', r => assert.strictEqual(r.action, 'pump-finish'));
is('pumped 120 ml', r => { assert.strictEqual(r.type, 'pump'); assert.strictEqual(r.data.amountMl, 120); });
is('pumped left 60 right 50 ml', r => assert.deepStrictEqual([r.data.leftMl, r.data.rightMl], [60, 50]));
is('tummy time', r => assert.strictEqual(r.action, 'tummy-start'));
is('tummy time 10 minutes', r => { assert.strictEqual(r.type, 'tummy'); assert.strictEqual(r.end - r.time, 10 * MIN); });
is('stop tummy time', r => assert.strictEqual(r.action, 'tummy-stop'), { timers: { tummy: true } });
// Temperature / weight
is('temperature 37.8', r => { assert.strictEqual(r.type, 'temp'); assert.strictEqual(r.data.tempC, 37.8); });
is('fever 100.4 armpit', r => { assert.strictEqual(r.data.tempC, 38); assert.strictEqual(r.data.method, 'armpit'); });
is('temp thirty seven point five', r => assert.strictEqual(r.data.tempC, 37.5));
is('weighs 5.2 kg', r => { assert.strictEqual(r.type, 'growth'); assert.strictEqual(r.data.weightKg, 5.2); });
is('weighs 12 pounds 4 ounces', r => assert.ok(Math.abs(r.data.weightKg - 5.557) < 0.01));
// Medicine always goes to the form, never straight in
is('gave Tylenol 2.5 ml', r => { assert.strictEqual(r.kind, 'form'); assert.strictEqual(r.preset.medId, 'acetaminophen'); assert.strictEqual(r.preset.dose, '2.5 ml'); });
is('gave amoxicillin', r => { assert.strictEqual(r.kind, 'form'); assert.strictEqual(r.preset.rxId, 'rx1'); });
is('vitamin d drops', r => assert.deepStrictEqual([r.kind, r.preset.medId], ['form', 'vitd']));
is('pinainom ng biogesic', r => assert.deepStrictEqual([r.kind, r.preset.medId], ['form', 'acetaminophen']));
// Others
is('bath', r => assert.strictEqual(r.type, 'bath'));
is('naligo', r => assert.strictEqual(r.type, 'bath'));
is('note: very fussy after the 6pm feed', r => { assert.strictEqual(r.type, 'note'); assert.strictEqual(r.data.text, 'very fussy after the 6pm feed'); });
is('banana', r => { assert.strictEqual(r.kind, 'unknown'); assert.ok(r.suggest.length); });
is('', r => assert.strictEqual(r.kind, 'unknown'));
console.log('voice parser tests passed (' + n + ' phrases)');
