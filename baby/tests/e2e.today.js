/* Alaga — arranging the Today screen: hide and reorder sections, Milk's
   "only when needed" mode, and hidden sections that still show urgent things.
     node baby/tests/e2e.today.js        # SHOTS=dir to save screenshots */
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { chromium, devices } = require('playwright');

const ROOT = path.join(__dirname, '..', '..');
const SHOTS = process.env.SHOTS || '';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const step = (t) => console.log('• ' + t);

(async () => {
  const server = http.createServer((q, r) => {
    let p = decodeURIComponent(q.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(r);
  });
  await new Promise((r) => server.listen(0, r));
  const base = 'http://localhost:' + server.address().port + '/baby/';
  const browser = await chromium.launch({ headless: !process.env.HEADED });
  const errors = [];
  try {
    const ctx = await browser.newContext({ ...devices['Pixel 7'], timezoneId: 'Asia/Manila' });
    await ctx.route('**/v1/ping', (r) => r.fulfill({ status: 200, body: '{}' }));
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base);
    await page.fill('#welcome-form input[name="name"]', 'Miel');
    await page.fill('#welcome-form input[name="birth"]', new Date(Date.now() - 8 * 864e5).toISOString().slice(0, 10));
    await page.click('#welcome-form button[type="submit"]');
    await page.waitForSelector('#app:not([hidden])');
    const titles = () => page.$$eval('#view-today .section-title h2', (els) => els.map((e) => e.textContent.trim()));
    const shot = (n) => (SHOTS ? page.screenshot({ path: path.join(SHOTS, n + '.png'), fullPage: true }) : null);
    const closeSheet = () => page.click('.sheet [data-action="sheet-close"] >> nth=-1');

    // Milk, "only when needed" (the default): frozen milk is one line; fridge milk shows.
    await page.evaluate(() => {
      const t = Date.now();
      for (let i = 0; i < 3; i++) BabyStore.milkAdd({ kind: 'breast', ml: 120, where: 'freezer', madeAt: t - (10 + i) * 864e5 });
      BabyApp.commit();
    });
    assert.ok((await titles()).includes('Milk'));
    assert.match(await page.textContent('#view-today'), /3 frozen · 360 ml/);
    assert.strictEqual(await page.locator('#view-today [data-action="milk-open"]').count(), 0, 'no frozen bags listed one by one');
    await page.evaluate(() => { BabyStore.milkAdd({ kind: 'breast', ml: 90, where: 'fridge', madeAt: Date.now() }); BabyApp.commit(); });
    assert.strictEqual(await page.locator('#view-today [data-action="milk-open"]').count(), 1, 'fridge milk is listed');
    step('Milk “only when needed”: frozen milk is one line, fridge milk is listed');

    // Arrange: hide Milk and Coming up, move Today's entries to the top.
    await page.click('.tab[data-view="settings"]');
    await page.click('[data-action="sections-edit"]');
    await page.waitForSelector('input[data-action-change="section-toggle"][data-id="milk"]');
    assert.ok(await page.isDisabled('input[data-action-change="section-toggle"][data-id="buttons"]'), 'quick log buttons can’t be hidden');
    await page.click('input[data-action-change="section-toggle"][data-id="milk"]', { force: true });
    await page.click('input[data-action-change="section-toggle"][data-id="coming"]', { force: true });
    for (let i = 0; i < 6; i++) {
      const up = page.locator('[data-action="section-move"][data-id="log"][data-d="-1"]');
      if (await up.isDisabled()) break;
      await up.click();
    }
    await shot('t1-editor');
    await closeSheet();
    await page.click('.tab[data-view="today"]');
    const t1 = await titles();
    assert.ok(!t1.includes('Milk') && !t1.includes('Coming up'), 'hidden sections are gone: ' + t1);
    assert.strictEqual(t1[0], 'Today', 'Today’s entries moved to the top');
    const order = await page.$$eval('#view-today .qa-grid, #view-today .section-title h2', (els) => els.map((e) => (e.className.includes('qa-grid') ? 'buttons' : e.textContent.trim())));
    assert.ok(order.indexOf('Today') < order.indexOf('buttons'), 'entries before the buttons: ' + order);
    step('sections hide and reorder (the quick-log buttons can’t be hidden)');

    // A hidden Milk section still shows milk about to expire.
    await page.evaluate(() => { BabyStore.milkAdd({ kind: 'breast', ml: 40, where: 'room', madeAt: Date.now() - 3.8 * 3600e3 }); BabyApp.commit(); });
    assert.ok((await titles()).includes('Milk to use soon'));
    assert.strictEqual(await page.locator('#view-today [data-action="milk-open"]').count(), 1, 'only the urgent one');
    await shot('t2-urgent-milk');
    step('hidden Milk still shows milk about to expire');

    // Hidden "Last 24 hours" comes back as "Needs a look" when something is off.
    await page.click('.tab[data-view="settings"]');
    await page.click('[data-action="sections-edit"]');
    await page.click('input[data-action-change="section-toggle"][data-id="checks"]', { force: true });
    await closeSheet();
    await page.click('.tab[data-view="today"]');
    let t2 = await titles();
    assert.ok(!t2.includes('Last 24 hours') && !t2.includes('Needs a look'), 'nothing logged yet: stays hidden');
    await page.evaluate(() => {
      const t = Date.now();
      BabyStore.addEvent({ type: 'diaper', time: t - 30 * 3600e3, data: { wet: true } });
      BabyStore.addEvent({ type: 'feed', time: t - 2 * 3600e3, data: { kind: 'bottle', amountMl: 60, milk: 'formula' } });
      BabyApp.commit();
    });
    assert.ok((await titles()).includes('Needs a look'), 'low wet diapers surface even when hidden');
    step('hidden “Last 24 hours” comes back as “Needs a look” when something’s off');

    // Hidden sections are listed under More; reset brings everything back.
    await page.click('[data-action="log-more"]');
    await page.waitForSelector('.sheet :text("Hidden from Today")');
    assert.match(await page.textContent('.sheet__body'), /Coming up/);
    await page.click('.sheet [data-action="sections-edit"]');
    await page.click('[data-action="section-reset"]');
    await closeSheet();
    const t3 = await titles();
    assert.ok(t3.includes('Coming up') && t3.includes('Last 24 hours') && t3.indexOf('Today') === t3.length - 1, 'reset: ' + t3);
    step('hidden sections are under More; Reset restores the default');

    assert.deepStrictEqual(errors, [], 'no page errors');
    console.log('today e2e passed');
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
