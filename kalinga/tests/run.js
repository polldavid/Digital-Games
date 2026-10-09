/* Kalinga — runs every unit test, then loads the modules the way a
   browser does (plain <script> tags, no require) to check the globals.
     node kalinga/tests/run.js */
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const TESTS = ['schedule', 'schedule.dst', 'stock', 'scale', 'vitals', 'speechnum', 'conditions', 'store'];
for (const t of TESTS) {
  execFileSync(process.execPath, [path.join(__dirname, t + '.test.js')], { stdio: 'inherit' });
}

// Browser load order (index.html must use the same order).
const ORDER = ['schedule.js', 'stock.js', 'scale.js', 'vitals.js', 'conditions.js', 'speechnum.js', 'store.js'];
const win = { console };
win.window = win;
vm.createContext(win);
for (const f of ORDER) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), win, { filename: f });
['KalingaSchedule', 'KalingaStock', 'KalingaScale', 'KalingaVitals', 'KalingaConditions', 'KalingaSpeech', 'KalingaStore']
  .forEach((g) => assert.ok(win[g], g + ' is not a browser global'));
// The browser store works without require, against an in-memory localStorage.
const m = {};
win.localStorage = { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; } };
const S = win.KalingaStore.create();
S.load();
const e = S.addElder({ name: 'Papa' });
assert.ok(S.saveMed({ elderId: e.id, name: 'Losartan', form: 'tablet', dose: { amount: 1, unit: 'tablet' } }).med);
assert.ok(S.save());
assert.strictEqual(win.KalingaConditions.suggestions('diabetes').track[0].key, 'sugar');
console.log('browser globals ok');
console.log('ALL KALINGA TESTS PASSED');
