/* Kalinga — medication-safety browser tests (Playwright, phone-sized, fake clock).
   The scenarios from the 1B review: re-rings with the card open, insulin
   before measuring, low sugar on the insulin card, "doctor said otherwise",
   taking a later dose early, repeated snoozes, the caregiver form's typed
   values, erase.
     node kalinga/tests/e2e.safety.js */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { chromium, devices } = require('playwright');

const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
function serve() {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, () => resolve(server)));
}

(async () => {
  const server = await serve();
  const base = 'http://localhost:' + server.address().port + '/';
  const browser = await chromium.launch({ headless: !process.env.HEADED });
  const ctx = await browser.newContext({ ...devices['Pixel 7'], timezoneId: 'Asia/Manila', locale: 'en-PH', serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => { errors.push('native dialog: ' + d.type()); d.dismiss(); });
  await page.clock.install({ time: new Date('2026-10-10T07:00:00+08:00') });
  const S = (fn, arg) => page.evaluate(fn, arg);
  const step = (name) => console.log('•', name);
  const tap = (sel) => page.click(sel);
  const keys = async (digits) => { for (const c of digits) await tap('#sheet [data-action="rd-key"][data-value="' + c + '"]'); await tap('#sheet [data-action="rd-key-ok"]'); };
  const alarms = () => S(() => window.KalingaReminders.alarmCount());
  const doses = () => S(() => KalingaApp.store.list('doses').filter((d) => d.status !== 'snoozed').map((d) => KalingaApp.store.find('meds', d.medId).name + '@' + d.slotKey.slice(-5) + ':' + d.status + ':' + d.units).sort());

  try {
    await page.goto(base);
    await S(() => localStorage.clear());
    await page.reload();

    step('setup through the caregiver form: typed time and count are kept');
    await page.fill('#welcome-form input[name=name]', 'Papa');
    await tap('#welcome-form button[type=submit]');
    await tap('[data-action="cond-toggle"][data-value="diabetes"]');
    await tap('[data-action="profile-save"]');
    await tap('[data-action="med-new"]');
    await page.fill('#med-form input[name=name]', 'Metformin');
    await page.fill('#time-custom', '20:00'); // typed but "+ Time" not tapped
    await tap('[data-action="med-save"]');
    await page.waitForSelector('#sheet', { state: 'hidden' });
    assert.deepStrictEqual(await S(() => KalingaApp.store.list('schedules')[0].rule.times), ['08:00', '20:00'], 'typed custom time saved');
    const metId = await S(() => KalingaApp.store.list('meds')[0].id);
    await tap('[data-action="go"][data-view="meds"]');
    await tap('[data-action="med-edit"][data-id="' + metId + '"]');
    await page.fill('#med-form input[name=count]', '30');
    await tap('[data-action="med-save"]');
    await page.waitForSelector('#sheet', { state: 'hidden' });
    assert.strictEqual(await S((id) => KalingaApp.store.find('meds', id).stock.count, metId), 30, 'count typed when editing is kept');

    // Sliding-scale insulin straight through the store (the form is covered by e2e.smoke.js).
    await S(() => {
      const st = KalingaApp.store, el = st.list('elders')[0];
      const m = st.saveMed({ elderId: el.id, name: 'Humalog', form: 'insulin-pen', dose: { unit: 'units' }, insulin: { mode: 'scale', needles: 10, charts: [{ context: 'any', rows: [{ from: 70, to: 150, units: 2 }, { from: 151, to: 300, units: 4 }] }] }, stock: { count: 300 } }, 'test', { confirmChart: true }).med;
      st.saveSchedule({ medId: m.id, rule: { times: ['08:00'], weekdays: [], everyN: 0, start: '2026-10-10', end: '', prn: false } }, 'test');
      st.get().device.mode = 'elder'; st.get().device.pin = 'x';
      KalingaApp.commit();
    });
    await page.waitForSelector('#elder:not([hidden])');

    step('C1: re-rings sound while the card is still open');
    await page.clock.runFor('01:00:20');
    await page.waitForSelector('#dose:not([hidden])');
    const a0 = await alarms();
    await page.clock.runFor('00:10:30');
    assert.ok(await alarms() > a0, 'the +10 re-ring must sound again with the card open');

    step('C3: "Nainom ko na" before measuring keeps the insulin open');
    await tap('#dose [data-action="dose-take"]');
    assert.deepStrictEqual(await doses(), ['Metformin@08:00:taken:1']);
    await page.waitForSelector('#dose:not([hidden]) [data-action="dose-sugar"]');
    assert.match(await page.textContent('#dose'), /Humalog/);

    step('C2: low sugar shows the danger card first; no units, no adjust');
    await tap('#dose [data-action="dose-sugar"]');
    if (await page.$('#sheet [data-action="rd-keypad"]')) await tap('#sheet [data-action="rd-keypad"]');
    await keys('50');
    await tap('#sheet [data-action="rd-right"]');
    await page.waitForSelector('#sheet .danger-card');
    await tap('#sheet [data-action="rd-done"]');
    await page.waitForSelector('#sheet', { state: 'hidden' });
    assert.match(await page.textContent('#dose'), /Wala sa chart/);
    assert.strictEqual(await page.$('#dose [data-action="dose-units"]'), null, 'no "doctor said otherwise" when out of the chart');

    step('C2: measure again, then "doctor said otherwise" uses the big keypad with read-back, within the chart');
    await tap('#dose [data-action="dose-sugar"]');
    if (await page.$('#sheet [data-action="rd-keypad"]')) await tap('#sheet [data-action="rd-keypad"]');
    await keys('185');
    await tap('#sheet [data-action="rd-right"]');
    await tap('#sheet [data-action="rd-done"]');
    assert.match(await page.textContent('#dose'), /185 mg\/dL → 4 units/);
    await tap('#dose [data-action="dose-units"]');
    await keys('40');
    assert.match(await page.textContent('#sheet'), /chart/i, 'above the chart is refused');
    await keys('3');
    assert.match(await page.textContent('#sheet'), /3 units — tama ba\?/);
    await tap('#sheet [data-action="units-right"]');
    await page.waitForSelector('#sheet', { state: 'hidden' });
    await tap('#dose [data-action="dose-take"]');
    await page.clock.runFor(3000);
    assert.deepStrictEqual(await doses(), ['Humalog@08:00:taken:3', 'Metformin@08:00:taken:1']);

    step('C4: the 20:00 dose cannot be taken at 08:30');
    await page.clock.runFor('00:15:00');
    await page.waitForSelector('#dose', { state: 'hidden' });
    await tap('#elder [data-action="dose-open"]');
    await page.waitForSelector('#dose:not([hidden])');
    assert.strictEqual(await page.$('#dose [data-action="dose-take"]'), null, 'no take button hours early');
    assert.strictEqual(await page.$('#dose [data-action="dose-later"]'), null);
    assert.match(await page.textContent('#dose'), /Hindi pa oras/);
    await tap('#dose [data-action="dose-close"]');

    step('I1: snoozing keeps ringing (+10, +20 after the snooze ends)');
    await page.clock.setSystemTime(new Date('2026-10-10T19:59:50+08:00'));
    await page.clock.runFor(30000);
    await page.waitForSelector('#dose:not([hidden])');
    await tap('#dose [data-action="dose-later"]');
    const a1 = await alarms();
    await page.clock.runFor('00:10:30');
    const a2 = await alarms();
    assert.ok(a2 > a1, 'rings when the snooze ends');
    await page.clock.runFor('00:10:30');
    assert.ok(await alarms() > a2, 'rings again 10 minutes after the snooze ended');

    step('I6: erase removes photos and voice clips too');
    await S(() => KalingaFiles.put('ph-test', new Blob(['x'], { type: 'image/jpeg' })));
    await S(() => { if (KalingaElder.isDoseOpen()) KalingaElder.closeDose(); KalingaApp.store.get().device.mode = 'caregiver'; KalingaApp.commit(); });
    await tap('[data-action="go"][data-view="more"]');
    await tap('[data-action="erase"]');
    await tap('#confirm-ok');
    await page.clock.runFor(1000);
    assert.deepStrictEqual(await S(() => KalingaFiles.keys()), [], 'files erased');

    assert.deepStrictEqual(errors, [], 'page errors / native dialogs');
    console.log('e2e.safety.js ok');
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
