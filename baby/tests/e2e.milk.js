/* Alaga — milk storage in a real browser.
     node baby/tests/e2e.milk.js        # SHOTS=dir to save screenshots */
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
    await page.fill('#welcome-form input[name="birth"]', new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10));
    await page.click('#welcome-form label:has(input[value="mixed"])');
    await page.click('#welcome-form button[type="submit"]');
    await page.waitForSelector('#app:not([hidden])');
    const milk = () => page.evaluate(() => BabyStore.milkActive().map((m) => ({ id: m.id, ml: m.ml, where: m.where, kind: m.kind, left: !!m.leftoverAt })));

    // Pump 120 ml -> fridge (default)
    await page.click('[data-action="log"][data-type="pump"] >> nth=0');
    await page.click('#sheet-form details summary');
    await page.fill('#sheet-form input[name="left"]', '60');
    await page.fill('#sheet-form input[name="right"]', '60');
    assert.strictEqual(await page.isChecked('#sheet-form input[name="store"][value="fridge"]'), true);
    await page.click('#sheet-form [data-panel-save] button[type="submit"]');
    await page.waitForSelector('#sheet', { state: 'hidden' });
    assert.match(await page.textContent('#toasts'), /fridge, use by/);
    let m = await milk();
    assert.deepStrictEqual([m.length, m[0].ml, m[0].where], [1, 120, 'fridge']);
    await page.waitForSelector('.section-title:has-text("Milk")');
    await shot(page, 'm1-today');
    step('pumping 120 ml puts it in the fridge; Milk shows on Today with its use-by');

    // Open it: freeze, then thaw in the fridge; freezing again isn't offered.
    await page.click('[data-action="milk-open"]');
    await page.waitForSelector('[data-action="milk-feed"]');
    await shot(page, 'm2-item');
    await page.click('[data-action="milk-move"][data-to="freezer"]');
    await page.waitForSelector('[data-action="milk-move"][data-to="thawFridge"]');
    assert.match(await page.textContent('.sheet__body'), /best within 6 months/);
    await page.click('[data-action="milk-move"][data-to="thawFridge"]');
    await page.waitForSelector('.sheet__body :text("Never refreeze")');
    assert.strictEqual(await page.locator('[data-action="milk-move"][data-to="freezer"]').count(), 0, 'no refreezing');
    step('freeze → thaw in fridge (24 h), and no option to refreeze');

    // Feed it: bottle timer with 120 offered; baby takes 70 -> 50 ml leftover, 2 h.
    await page.click('[data-action="milk-feed"]');
    await page.waitForSelector('.live [data-bottle]');
    await page.evaluate(() => { const b = BabyStore.timers().bottle; b.start -= 15 * 60000; b.seg -= 15 * 60000; });
    await page.click('.live [data-action="bottle-finish"]');
    await page.waitForSelector('#sheet-form input[name="fromBottleTimer"]', { state: 'attached' });
    assert.strictEqual(await page.inputValue('#sheet-form input[name="offered"]'), '120');
    assert.strictEqual(await page.isChecked('#sheet-form input[name="milk"][value="breast"]'), true);
    await page.fill('#sheet-form input[name="amount"]', '70');
    await page.click('#sheet-form [data-panel-save] button[type="submit"]');
    await page.waitForSelector('#sheet', { state: 'hidden' });
    assert.match(await page.textContent('#toasts'), /50 ml left over: use by/);
    m = await milk();
    assert.deepStrictEqual(m.map((x) => [x.ml, x.left]), [[50, true]], 'source used, leftover added');
    await shot(page, 'm3-leftover');
    step('feeding from it fills the bottle timer; the 50 ml not finished becomes a 2-hour leftover');

    // Undo puts it all back.
    await page.click('#toasts button');
    m = await milk();
    assert.deepStrictEqual(m.map((x) => [x.ml, x.left, x.where]), [[120, false, 'fridge']], 'undo restores the stored milk');
    step('Undo restores the stored milk and removes the leftover');

    // Formula: made up, half finished -> throw out, no leftover.
    await page.click('.section-title:has-text("Milk") [data-action="milk-add"]');
    await page.click('#milk-form label:has(input[value="formula"])');
    assert.ok(await page.isHidden('#milk-form label:has(input[name="where"][value="freezer"])'), 'formula can’t be frozen');
    await page.fill('#milk-form input[name="ml"]', '60');
    await page.waitForSelector('#milk-preview :text("2 hours")');
    await shot(page, 'm4-add-formula');
    await page.click('#milk-form button[type="submit"]');
    const fid = await page.evaluate(() => BabyStore.milkActive().filter((x) => x.kind === 'formula')[0].id);
    await page.evaluate((id) => { BabyStore.bottleStart(Date.now() - 10 * 60000, id); BabyStore.bottleFinish(); BabyApp.commit(); BabyForms.open('feed'); }, fid);
    await page.waitForSelector('#sheet-form input[name="fromBottleTimer"]', { state: 'attached' });
    await page.fill('#sheet-form input[name="amount"]', '30');
    await page.click('#sheet-form [data-panel-save] button[type="submit"]');
    assert.match(await page.textContent('#toasts'), /throw out the 30 ml of formula left/);
    m = await milk();
    assert.ok(!m.some((x) => x.kind === 'formula'), 'no formula leftover kept');
    step('formula: 2-hour use-by, never frozen; what baby didn’t finish is to be thrown out');

    // Expired milk is flagged and a reminder fires.
    await page.evaluate(() => { const x = BabyStore.milkActive()[0]; x.thawedAt -= 2 * 864e5; /* thawed milk: 24 h from thawing */ BabyApp.commit(); BabyApp.checkReminders(); });
    await page.waitForSelector('.status--urgent:has-text("Throw out")');
    // Milk that expires in 20 minutes raises a reminder (30 minutes ahead).
    await page.evaluate(() => { const x = BabyStore.milkActive()[0]; x.thawedAt = Date.now() - 864e5 + 20 * 60000; BabyApp.commit(); BabyApp.checkReminders(); });
    await page.waitForSelector('#banner:has-text("Milk to use soon")');
    await shot(page, 'm5-expired');
    step('expired milk shows “Expired — throw out” and raises a reminder');

    assert.deepStrictEqual(errors, [], 'no page errors');
    console.log('milk e2e passed');
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
