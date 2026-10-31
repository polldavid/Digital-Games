/* Kalinga — browser smoke test (Playwright, Chromium, phone-sized, Manila time).
   Walks both modes end to end and fails on any page error.
     npm i --no-save playwright && npx playwright install chromium   # one-time
     node kalinga/tests/e2e.smoke.js
     HEADED=1 node kalinga/tests/e2e.smoke.js        # watch it
     SHOTS=some/dir node kalinga/tests/e2e.smoke.js  # save screenshots
   It serves kalinga/ itself and fakes the clock, so the 08:00 alarm
   rings without waiting. Nothing leaves the machine. */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { chromium, devices } = require('playwright');

const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
const SHOTS = process.env.SHOTS;

function serve() {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, () => resolve(server)));
}

(async () => {
  // The service worker's version and every ?v= in the pages must match.
  const V = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8').match(/var V = '(\d+)'/)[1];
  for (const f of ['index.html', 'privacy.html']) {
    const vs = (fs.readFileSync(path.join(ROOT, f), 'utf8').match(/\?v=(\d+)/g) || []).map((x) => x.slice(3));
    assert.ok(vs.length && vs.every((x) => x === V), f + ' ?v= must all be ' + V);
  }

  const server = await serve();
  const base = 'http://localhost:' + server.address().port + '/';
  const browser = await chromium.launch({ headless: !process.env.HEADED });
  const ctx = await browser.newContext({ ...devices['Pixel 7'], timezoneId: 'Asia/Manila', locale: 'en-PH', serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message + ' @ ' + String(e.stack).split(String.fromCharCode(10)).slice(1, 3).join(' | ')));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('dialog', (d) => d.accept(d.type() === 'prompt' ? '30' : undefined));
  await page.clock.install({ time: new Date('2026-10-10T07:00:00+08:00') });
  const S = (fn, arg) => page.evaluate(fn, arg);
  const step = (name) => console.log('•', name);
  let shot = 0;
  const snap = async (name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, String(++shot).padStart(2, '0') + '-' + name + '.png'), fullPage: true }); } };
  const tap = (sel) => page.click(sel);
  const keys = async (digits) => { for (const c of digits) await tap('#sheet [data-action="rd-key"][data-value="' + c + '"]'); await tap('#sheet [data-action="rd-key-ok"]'); };
  const noSideScroll = async (what) => {
    await page.setViewportSize({ width: 320, height: 740 });
    const w = await S(() => document.documentElement.scrollWidth);
    assert.ok(w <= 320, what + ' scrolls sideways at 320px (' + w + ')');
    await page.setViewportSize({ width: 412, height: 915 });
  };

  try {
    await page.goto(base);
    await S(() => localStorage.clear());
    await page.reload();

    step('first run: welcome in Taglish');
    await page.waitForSelector('#welcome:not([hidden])');
    assert.match(await page.textContent('#welcome'), /Sino ang aalagaan natin/);
    await snap('welcome');
    await page.fill('#welcome-form input[name=name]', 'Papa');
    await tap('#welcome-form button[type=submit]');

    step('profile: conditions suggest what to track (not diabetes-only)');
    await page.waitForSelector('#profile-form');
    for (const c of ['diabetes', 'hypertension', 'inflammation']) await tap('[data-action="cond-toggle"][data-value="' + c + '"]');
    assert.match(await page.textContent('#profile-form'), /Mungkahing sukatin/);
    await page.fill('#profile-form textarea[name=contacts]', 'Ate Liza — 0917 123 4567');
    await snap('profile');
    await tap('[data-action="profile-save"]');
    await page.waitForSelector('#app:not([hidden])');
    const kinds = await S(() => KalingaApp.store.list('vitalTypes').map((v) => v.key + ':' + v.name));
    assert.deepStrictEqual(kinds, ['sugar:Blood sugar', 'bp:Blood pressure', 'symptom:Pain', 'symptom:Swelling']);

    step('medicines: tablet twice a day with stock');
    await tap('[data-action="med-add"]'); await tap('#sheet [data-action="med-new"]');
    await page.fill('#med-form input[name=name]', 'Losartan 50mg');
    await page.fill('#med-form input[name=purpose]', 'para sa altapresyon');
    await tap('[data-action="time-add"][data-value="20:00"]');
    await page.fill('#med-form input[name=count]', '20');
    await snap('med-form');
    await tap('[data-action="med-save"]');
    await page.waitForSelector('#sheet', { state: 'hidden' });

    step('medicines: a cream for the feet (no stock count)');
    await tap('[data-action="go"][data-view="meds"]');
    await tap('[data-action="med-add"]'); await tap('#sheet [data-action="med-new"]');
    await page.fill('#med-form input[name=name]', 'Diclofenac gel');
    await page.selectOption('#med-form select[name=form]', 'cream');
    await page.fill('#med-form input[name=applyTo]', 'sa paa');
    await tap('[data-action="med-save"]');
    await page.waitForSelector('#sheet', { state: 'hidden' });

    step('medicines: as-needed paracetamol with label limits');
    await tap('[data-action="med-add"]'); await tap('#sheet [data-action="med-new"]');
    await page.fill('#med-form input[name=name]', 'Paracetamol 500mg');
    await page.fill('#med-form input[name=purpose]', 'para sa sakit');
    await tap('label:has(input[name=_when][value=prn])');
    await page.fill('#med-form input[name=prn]', '4');
    await page.fill('#med-form input[name=prnMax]', '4');
    await tap('[data-action="med-save"]');
    await page.waitForSelector('#sheet', { state: 'hidden' });

    step('medicines: sliding-scale insulin is refused until the chart is confirmed');
    await tap('[data-action="med-add"]'); await tap('#sheet [data-action="med-new"]');
    await page.fill('#med-form input[name=name]', 'Insulin lispro');
    await page.selectOption('#med-form select[name=form]', 'insulin-pen');
    await tap('label:has(input[name=_insMode][value=scale])');
    await page.waitForSelector('#med-form input[name=confirm]');
    await page.fill('#med-form input[name=needles]', '10');
    assert.strictEqual(await page.inputValue('[data-bind="insulin.charts.0.rows.0.from"]'), '', 'a new chart starts empty');
    await tap('[data-action="med-save"]');
    await page.waitForSelector('#med-form .field__error');
    assert.match(await page.textContent('#med-form .field__error'), /chart/, 'an empty chart is refused');
    const row = (r, f) => '[data-bind="insulin.charts.0.rows.' + r + '.' + f + '"]';
    await page.fill(row(0, 'from'), '70'); await page.fill(row(0, 'to'), '150'); await page.fill(row(0, 'units'), '0');
    await tap('[data-action="row-add"]');
    assert.strictEqual(await page.inputValue(row(1, 'from')), '151', 'the next row continues the last');
    await page.fill(row(1, 'to'), '200'); await page.fill(row(1, 'units'), '2');
    await tap('[data-action="med-save"]');
    await page.waitForSelector('#med-form .field__error');
    assert.match(await page.textContent('#med-form .field__error'), /kumpirmahin/);
    await tap('label.check:has(input[name=confirm])');
    await snap('insulin-chart');
    await tap('[data-action="med-save"]');
    await page.waitForSelector('#sheet', { state: 'hidden' });
    assert.strictEqual(await S(() => KalingaApp.store.list('meds').length), 4);
    await snap('meds-list');
    await noSideScroll('medicine list');

    step('dashboard shows the day');
    await tap('[data-action="go"][data-view="today"]');
    assert.match(await page.textContent('#view'), /Losartan 50mg/);
    await snap('dashboard');
    await noSideScroll('dashboard');

    step('hand the phone over: set a PIN, elder mode');
    await tap('#handover-btn');
    await tap('#confirm-ok');
    for (const c of '12341234') await tap('#sheet [data-action="pin-key"][data-value="' + c + '"]');
    await page.waitForSelector('#elder:not([hidden])');
    assert.match(await page.textContent('#elder'), /Magandang umaga, Papa/);
    await snap('elder-home');
    await noSideScroll('elder home');

    step('08:00: the dose card rings');
    await page.clock.runFor('01:00:30');
    await page.waitForSelector('#dose:not([hidden])');
    const card = await page.textContent('#dose');
    assert.match(card, /Losartan 50mg/);
    assert.match(card, /Insulin lispro/);
    assert.match(card, /para sa altapresyon/);
    assert.match(card, /pahid — sa paa/);
    await snap('dose-card');
    await noSideScroll('dose card');

    step('insulin: sugar by keypad, read back, chart row shown (no calculation)');
    await tap('[data-action="dose-sugar"]');
    if (await page.$('#sheet [data-action="rd-keypad"]')) await tap('#sheet [data-action="rd-keypad"]');
    await keys('185');
    assert.match(await page.textContent('#sheet'), /185 — tama ba\?/);
    await snap('readback');
    await tap('#sheet [data-action="rd-right"]');
    await page.waitForSelector('#sheet .verdict'); // the verdict always shows first
    await tap('#sheet [data-action="rd-done"]');
    await page.waitForSelector('#sheet', { state: 'hidden' });
    assert.match(await page.textContent('#dose'), /185 mg\/dL → 2 units/);
    await snap('dose-insulin');

    step('cream not applied today; the rest taken');
    await tap('#dose [data-action="dose-toggle"][data-id="' + await S(() => KalingaApp.store.list('meds').find((m) => m.form === 'cream').id) + '"]');
    await tap('#dose [data-action="dose-take"]');
    await page.waitForSelector('.dose__done');
    await page.clock.runFor(3000);
    await page.waitForSelector('#dose', { state: 'hidden' });
    const doses = await S(() => KalingaApp.store.list('doses').filter((d) => d.status !== 'snoozed').map((d) => KalingaApp.store.find('meds', d.medId).name + ':' + d.status + ':' + d.units).sort());
    assert.deepStrictEqual(doses, ['Diclofenac gel:skipped:null', 'Insulin lispro:taken:2', 'Losartan 50mg:taken:1']);
    assert.strictEqual(await S(() => KalingaApp.store.list('meds').find((m) => m.name === 'Losartan 50mg').stock.count), 19);
    assert.strictEqual(await S(() => KalingaApp.store.list('meds').find((m) => m.name === 'Insulin lispro').insulin.needles), 9);

    step('as-needed: taken once, then "wait" until the gap passes');
    await tap('[data-action="prn-open"]');
    await tap('#sheet [data-action="prn-take"]');
    await page.waitForSelector('#sheet [data-action="prn-undo"]'); // the "taken" screen
    await tap('#sheet .el-btn[data-action="sheet-close"]');
    await page.waitForSelector('#sheet', { state: 'hidden' });
    await tap('[data-action="prn-open"]');
    assert.match(await page.textContent('#sheet'), /Hintayin muna hanggang/);
    await tap('#sheet-close');

    step('blood pressure 182/95: read back, then the danger card');
    await tap('[data-action="measure-open"]');
    await tap('#sheet [data-action="rd-start"]:has-text("Presyon")');
    if (await page.$('#sheet [data-action="rd-keypad"]')) await tap('#sheet [data-action="rd-keypad"]');
    await keys('182');
    await keys('95');
    await tap('#sheet [data-action="rd-key-skip"]');
    await tap('#sheet [data-action="rd-right"]');
    await page.waitForSelector('#sheet .danger-card');
    assert.match(await page.textContent('#sheet'), /Tawagan si Ate Liza/);
    await snap('danger-card');
    await tap('#sheet [data-action="rd-done"]');

    step('foot pain check-in with faces');
    await tap('[data-action="measure-open"]');
    await tap('#sheet [data-action="rd-start"]:has-text("Sakit / kirot")');
    await tap('#sheet [data-action="rd-face"][data-value="4"]');
    await snap('faces');
    await tap('#sheet [data-action="rd-face-save"]');
    await page.waitForSelector('#sheet .verdict');
    await tap('#sheet [data-action="rd-done"]');

    step('back to the caregiver screens with the PIN');
    await tap('[data-action="pin-open"]');
    for (const c of '9999') await tap('#sheet [data-action="pin-key"][data-value="' + c + '"]');
    assert.match(await page.textContent('#sheet'), /Mali ang PIN/);
    for (const c of '1234') await tap('#sheet [data-action="pin-key"][data-value="' + c + '"]');
    await page.waitForSelector('#app:not([hidden])');
    const dash = await page.textContent('#view');
    assert.match(dash, /Nainom/);
    assert.match(dash, /Hindi ininom/);
    await snap('dashboard-after');
    await noSideScroll('dashboard with readings');

    step('English toggle');
    await tap('[data-action="go"][data-view="more"]');
    await page.click('input[name=lang][value=en] + span');
    assert.strictEqual(await S(() => KalingaApp.store.get().settings.lang), 'en');
    await tap('[data-action="go"][data-view="today"]');
    assert.match(await page.textContent('#view'), /Papa’s day/);
    await snap('dashboard-en');

    assert.deepStrictEqual(errors, [], 'page errors');
    console.log('e2e.smoke.js ok');
  } catch (e) {
    await snap('FAILED');
    console.error('errors:', errors);
    throw e;
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
