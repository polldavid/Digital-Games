/* Alaga — browser smoke test (Playwright, Chromium, iPhone-sized).
   Walks the main flows and fails on any page error.

   One-time setup (nothing is committed — node_modules is git-ignored):
     npm i --no-save playwright && npx playwright install chromium
   Run from the repo root:
     node baby/tests/e2e.smoke.js            # headless
     HEADED=1 node baby/tests/e2e.smoke.js   # watch it

   It serves the repo itself on a free port, and stubs the OCR engine
   (normally downloaded from jsDelivr) so it runs offline. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { chromium, devices } = require('playwright');

const ROOT = path.join(__dirname, '..', '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
const RX_TEXT = 'Rx\n1. Amoxicillin 250mg/5mL\nSig: 2.5 mL three times a day x 7 days\n2. Paracetamol 120mg/SmL\nSig: l.2 mL every 4 hours as needed for fever';
// A tiny 1x1 PNG to stand in for a prescription photo.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

function serve() {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, () => resolve(server)));
}

(async () => {
  const server = await serve();
  const base = 'http://localhost:' + server.address().port + '/baby/';
  const browser = await chromium.launch({ headless: !process.env.HEADED });
  const ctx = await browser.newContext({ ...devices['iPhone 13'], timezoneId: 'Asia/Manila', locale: 'en-US' });
  // Stand-in for Tesseract.js: same worker API, returns fixed text.
  await ctx.route(/cdn\.jsdelivr\.net\/npm\/tesseract\.js@/, (r) => r.fulfill({ contentType: 'text/javascript',
    body: 'window.Tesseract={createWorker:function(l,oem,o){return Promise.resolve({setParameters:function(){return Promise.resolve()},recognize:function(){o.logger({status:"recognizing text",progress:1});return Promise.resolve({data:{text:' + JSON.stringify(RX_TEXT) + '}})},terminate:function(){}})}}' }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  const S = (fn, arg) => page.evaluate(fn, arg);
  const step = (name) => console.log('•', name);

  try {
    await page.goto(base);
    await S(() => localStorage.clear());
    await page.reload();

    step('setup: metric units by Manila time zone');
    assert.strictEqual(await page.inputValue('#welcome-form input[name=units]:checked'), 'metric');
    await page.fill('input[name=name]', 'Test Baby');
    await page.fill('#welcome-form input[name=birth]', new Date(Date.now() - 20 * 864e5).toISOString().slice(0, 10));
    await page.tap('#welcome-form button[type=submit]');
    await page.waitForSelector('#view-today .qa-grid');

    step('bottle: ±1 ml and +5 ml');
    await page.tap('.qa[data-type=feed]');
    await page.tap('#sheet label:has(> input[name=kind][value=bottle])');
    const v0 = +(await page.inputValue('#sheet input[name=amount]'));
    await page.tap('#sheet [data-vol=fine]');
    await page.tap('#sheet [data-vol=big]');
    assert.strictEqual(+(await page.inputValue('#sheet input[name=amount]')), v0 + 6);
    await page.tap('#sheet .sheet-save button[type=submit]');
    assert.strictEqual(await S(() => BabyStore.last('feed').data.kind), 'bottle');

    step('diaper with a concerning colour shows a warning');
    await page.tap('.qa[data-type=diaper]');
    await page.tap('#sheet label:has(> input[name=what][value=both])');
    await page.tap('#sheet .swatch[data-color=white]');
    assert.ok(await page.isVisible('#poop-feedback .note--urgent'));
    await page.tap('#sheet .sheet-save button[type=submit]');

    step('sleep timer and reminders held while asleep');
    await page.tap('.qa[data-type=sleep]');
    assert.ok(await S(() => BabyStore.isAsleep()));
    assert.ok(!(await S(() => BabyStore.reminders(Date.now()).some((r) => r.kind === 'diaper' || r.kind === 'nap'))));
    await page.tap('.qa[data-type=sleep]');

    step('pump: both sides, then amounts');
    await page.tap('.qa[data-type=pump]');
    await page.tap('#sheet [data-action=pump-both]');
    await page.waitForTimeout(1100);
    await page.tap('#sheet [data-action=pump-finish]');
    await page.fill('#sheet input[name=left]', '60');
    await page.fill('#sheet input[name=right]', '45');
    await page.tap('#sheet .sheet-save button[type=submit]');
    assert.strictEqual(await S(() => BabyStore.last('pump').data.amountMl), 105);
    assert.ok(!(await S(() => BabyStore.timers().pump)));

    step('health: scan a prescription, confirm, give a dose');
    await page.tap('.tab[data-view=health]');
    await page.tap('[data-action=rx-scan]');
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.tap('[data-action=rx-photo]:not([data-capture])')]);
    await chooser.setFiles({ name: 'rx.png', mimeType: 'image/png', buffer: PNG });
    await page.waitForSelector('#scan-form', { timeout: 15000 });
    const drafts = await S(() => BabyHealth.scan().meds.map((m) => [m.name, m.strength, m.dose, m.intervalH, m.durationDays || 0, !!m.prn]));
    assert.deepStrictEqual(drafts, [['Amoxicillin', '250mg/5mL', '2.5 ml', 8, 7, false], ['Paracetamol', '120mg/5mL', '1.2 ml', 4, 0, true]]);
    await page.tap('#scan-form .sheet-save button[type=submit]');
    assert.strictEqual(await S(() => BabyStore.health().rx.length), 2);
    await page.tap('#view-health [data-action=rx-dose] >> nth=0');
    await page.tap('#sheet .sheet-save button[type=submit]');
    assert.strictEqual(await S(() => BabyStore.rxStatus(BabyStore.health().rx[0]).doses), 1);

    step('health: visit and vaccine checklist');
    await page.tap('#view-health [data-action=appt-edit] >> nth=0');
    await page.fill('#appt-form input[name=title]', 'Check-up');
    await page.tap('#appt-form .sheet-save button[type=submit]');
    await page.tap('[data-action=vax-schedule][data-s=ph]');
    await page.tap('[data-action=vax-open]');
    await page.tap('#sheet [data-action=vax-item][data-key=bcg]');
    await page.tap('#vax-form .sheet-save button[type=submit]');
    assert.ok(await S(() => !!BabyStore.health().vaccines.given.bcg));
    await page.keyboard.press('Escape');

    step('Today buttons can be customised and persist');
    await page.tap('.tab[data-view=today]');
    await page.tap('[data-action=log-more]');
    await page.tap('#sheet [data-action=quick-edit]');
    await page.tap('#sheet input[data-id=scan]');
    await page.keyboard.press('Escape');
    await page.reload();
    await page.waitForSelector('#view-today .qa-grid');
    assert.ok(await page.isVisible('#view-today .qa[data-type=scan]'));

    step('every tab renders; no horizontal scroll at 320px');
    await page.setViewportSize({ width: 320, height: 640 });
    for (const v of ['today', 'log', 'health', 'help', 'settings']) {
      await page.tap('.tab[data-view=' + v + ']');
      const over = await S(() => document.documentElement.scrollWidth - innerWidth);
      assert.ok(over <= 0, v + ' overflows by ' + over + 'px');
    }
    await page.tap('.tab[data-view=log]');
    await page.tap('[data-action=hist-mode][data-mode=trends]');
    assert.ok(await page.isVisible('#view-log .chart'));

    assert.deepStrictEqual(errors, [], 'page errors');
    console.log('\nPASS — Alaga smoke test');
  } catch (e) {
    console.error('\nFAIL —', e.message);
    if (errors.length) console.error('Page errors:\n  ' + errors.join('\n  '));
    process.exitCode = 1;
  } finally {
    await browser.close();
    server.close();
  }
})();
