/* Alaga — bottle timer in a real browser.
     node baby/tests/e2e.bottle.js        # SHOTS=dir to save screenshots */
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { chromium, devices } = require('playwright');

const ROOT = path.join(__dirname, '..', '..');
const SHOTS = process.env.SHOTS || '';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const step = (t) => console.log('• ' + t);
const shot = (page, name) => SHOTS ? page.screenshot({ path: path.join(SHOTS, name + '.png') }) : null;
const MIN = 60000;

(async () => {
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(0, r));
  const base = 'http://localhost:' + server.address().port + '/baby/';
  const browser = await chromium.launch({ headless: !process.env.HEADED });
  const errors = [];
  try {
    const ctx = await browser.newContext({ ...devices['Pixel 7'], timezoneId: 'Asia/Manila' });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base);
    await page.fill('#welcome-form input[name="name"]', 'Miel');
    await page.fill('#welcome-form input[name="birth"]', new Date(Date.now() - 5 * 864e5).toISOString().slice(0, 10));
    await page.click('#welcome-form label:has(input[value="formula"])');
    await page.click('#welcome-form button[type="submit"]');
    await page.waitForSelector('#app:not([hidden])');
    // Two earlier timed bottles on the same nipple, for the comparison.
    await page.evaluate(() => {
      const now = Date.now(), M = 60000;
      BabyStore.addEvent({ type: 'feed', time: now - 6 * 3600e3, end: now - 6 * 3600e3 + 30 * M, data: { kind: 'bottle', amountMl: 15, milk: 'formula', durationMs: 30 * M, nipple: 'SS' } });
      BabyStore.addEvent({ type: 'feed', time: now - 3 * 3600e3, end: now - 3 * 3600e3 + 25 * M, data: { kind: 'bottle', amountMl: 20, milk: 'formula', durationMs: 25 * M, nipple: 'SS' } });
      BabyApp.commit();
    });

    // Start from the Feed form.
    await page.click('[data-action="log"][data-type="feed"] >> nth=0');
    await page.waitForSelector('#sheet-form[data-type="feed"]');
    assert.strictEqual(await page.isChecked('#sheet-form input[name="kind"][value="bottle"]'), true, 'formula baby opens on Bottle');
    await shot(page, 'b1-start');
    await page.click('[data-action="bottle-start"]');
    await page.waitForSelector('[data-action="bottle-finish"]');
    assert.ok(await page.isHidden('#sheet-form [data-panel-save]'), 'no Save while timing');
    await shot(page, 'b2-timing');
    await page.click('[data-action="sheet-close"] >> nth=-1');
    await page.waitForSelector('.live [data-bottle]');
    assert.match(await page.textContent('.quick, body'), /Feeding…/);
    step('Start bottle timer from the Feed form; Today shows it running');

    // Pretend 28 minutes passed with a 3-minute burp pause, then finish from Today.
    await page.click('.live [data-action="bottle-pause"]');
    await page.evaluate(() => { const b = BabyStore.timers().bottle; b.start -= 31 * 60000; b.acc = 25 * 60000; });
    await page.click('.live [data-action="bottle-pause"]'); // resume
    await page.evaluate(() => { const b = BabyStore.timers().bottle; b.seg -= 3 * 60000; });
    await page.click('.live [data-action="bottle-finish"]');
    await page.waitForSelector('#sheet-form input[name="fromBottleTimer"]', { state: 'attached' });
    assert.strictEqual(await page.inputValue('#sheet-form input[name="bottleMin"]'), '28');
    assert.strictEqual(await page.inputValue('#sheet-form input[name="nipple"]'), 'SS', 'remembers the last nipple');
    await page.fill('#sheet-form input[name="amount"]', '15');
    await page.fill('#sheet-form input[name="offered"]', '30');
    await page.waitForSelector('#bottle-feedback .note');
    const fb = await page.textContent('#bottle-feedback');
    assert.match(fb, /Slow feed/); assert.match(fb, /0\.5 ml\/min/); assert.match(fb, /Earlier on “SS”: 0\.7 ml\/min over 2 feeds/);
    await page.locator('#bottle-feedback').scrollIntoViewIfNeeded();
    await shot(page, 'b3-finished');
    step('Finish: 28 min pre-filled (pause excluded), nipple remembered, slow-flow note with SS history');

    await page.click('#sheet-form [data-panel-save] button[type="submit"]');
    await page.waitForSelector('#sheet', { state: 'hidden' });
    const ev = await page.evaluate(() => BabyStore.last('feed'));
    assert.deepStrictEqual([ev.data.amountMl, ev.data.offeredMl, ev.data.durationMs, ev.data.nipple], [15, 30, 28 * MIN, 'SS']);
    assert.ok(!(await page.evaluate(() => BabyStore.timers().bottle)), 'timer cleared');
    step('Saved: 15 of 30 ml, 28 min, SS; timer cleared');

    // Switching nipple: a quicker feed on S.
    await page.evaluate(() => { const now = Date.now(), M = 60000; BabyStore.addEvent({ type: 'feed', time: now - 10 * M, end: now, data: { kind: 'bottle', amountMl: 30, milk: 'formula', durationMs: 12 * M, nipple: 'S' } }); BabyApp.commit(); });
    await page.click('.tab[data-view="log"]');
    await page.waitForSelector('#view-log >> text=nipple SS');
    await page.click('[data-action="hist-mode"][data-mode="trends"]');
    const card = page.locator('.chart', { hasText: 'Bottle pace' });
    await card.scrollIntoViewIfNeeded();
    const txt = await card.textContent();
    assert.match(txt, /SS/); assert.match(txt, /2\.5/); // S: 30 ml / 12 min
    await card.screenshot({ path: SHOTS ? path.join(SHOTS, 'b4-trends.png') : undefined }).catch(() => {});
    step('History shows the pace; Trends compares SS vs S');

    assert.deepStrictEqual(errors, [], 'no page errors');
    console.log('bottle e2e passed');
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
