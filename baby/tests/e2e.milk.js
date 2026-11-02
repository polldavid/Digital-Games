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

    // A leftover can be fed straight from Feed → Bottle, long before its reminder.
    const lid = await page.evaluate(() => { const now = Date.now(); const it = BabyStore.milkAdd({ kind: 'breast', ml: 50, where: 'room', madeAt: now - 3 * 3600e3, leftoverAt: now - 20 * 60000 }, now - 20 * 60000); BabyApp.commit(); return it.id; });
    const lidAt = await page.evaluate((id) => BabyGuide.milkExpiry(BabyStore.milkItem(id)).at, lid);
    await page.evaluate(() => BabyForms.open('feed'));
    await page.click('#sheet-form label:has(input[name="kind"][value="bottle"])');
    const opts = await page.$$eval('#sheet-form .milkpick__opt', (els) => els.map((e) => e.textContent));
    assert.match(opts[0], /^50 ml breast milk · leftover/, 'the leftover is offered first');
    assert.match(opts[opts.length - 1], /A new bottle/);
    assert.ok(await page.isChecked('#sheet-form input[name="fromMilk"][value=""]'), 'a new bottle unless you pick the leftover');
    await page.click('#sheet-form .milkpick__opt:has(input[value="' + lid + '"])');
    assert.strictEqual(await page.inputValue('#sheet-form input[name="offered"]'), '50');
    assert.strictEqual(await page.inputValue('#sheet-form input[name="amount"]'), '50');
    await page.click('#sheet-form [data-vol="-big"]');
    assert.strictEqual(await page.inputValue('#sheet-form input[name="amount"]'), '45', '−5 ml');
    await page.click('#sheet-form [data-vol="big"]');
    await page.click('#sheet-form [data-vol="-big"]');
    assert.strictEqual(await page.inputValue('#sheet-form input[name="amount"]'), '45', '+5 then −5');
    await shot(page, 'm3b-feed-leftover');
    await page.click('#sheet-form [data-panel-save] button[type="submit"]');
    await page.waitForSelector('#sheet', { state: 'hidden' });
    assert.match(await page.textContent('#toasts'), /5 ml left over: use by/);
    m = await milk();
    assert.ok(!m.some((x) => x.id === lid), 'the leftover is used');
    const rest = await page.evaluate(() => BabyStore.milkActive().filter((x) => x.leftoverAt && x.ml === 5).map((x) => BabyGuide.milkExpiry(x).at));
    assert.strictEqual(rest.length, 1);
    assert.ok(rest[0] <= lidAt, 'what’s left of a leftover keeps the leftover’s use-by');
    await page.click('#toasts button');
    m = await milk();
    assert.deepStrictEqual(m.filter((x) => x.left).map((x) => x.ml), [50], 'Undo puts the leftover back');
    step('Feed → Bottle offers the leftover first; picking it fills 50 ml; −5 ml; saving uses it; Undo puts it back');

    // All of it finished, with the bottle timer: the leftover is used; Undo still puts it back.
    await page.evaluate(() => BabyForms.open('feed'));
    await page.click('#sheet-form label:has(input[name="kind"][value="bottle"])');
    await page.click('#sheet-form .milkpick__opt:has(input[value="' + lid + '"])');
    await page.click('#sheet-form [data-action="bottle-start"]');
    await page.waitForSelector('#sheet-form [data-action="bottle-finish"]');
    assert.strictEqual(await page.evaluate(() => BabyStore.timers().bottle.milkId), lid, 'the timer feeds from the leftover');
    await page.click('#sheet-form [data-action="bottle-finish"]');
    await page.waitForSelector('#sheet-form input[name="fromBottleTimer"]', { state: 'attached' });
    assert.strictEqual(await page.inputValue('#sheet-form input[name="offered"]'), '50');
    await page.fill('#sheet-form input[name="amount"]', '50');
    await page.click('#sheet-form [data-panel-save] button[type="submit"]');
    await page.waitForSelector('#sheet', { state: 'hidden' });
    m = await milk();
    assert.ok(!m.some((x) => x.left), 'all finished: no leftover left');
    await page.click('#toasts button');
    m = await milk();
    assert.deepStrictEqual(m.filter((x) => x.left).map((x) => x.ml), [50], 'Undo puts the finished leftover back too');
    await page.evaluate((id) => { BabyStore.milkDone(id, 'discarded'); BabyApp.commit(); }, lid);
    step('with the bottle timer too; all finished uses it up, and Undo still puts it back');

    // Editing a bottle feed changes its leftover; deleting the feed throws the leftover out.
    const left = () => page.evaluate(() => BabyStore.milkActive().filter((x) => x.leftoverAt).map((x) => x.ml));
    await page.evaluate(() => BabyForms.open('feed'));
    await page.click('#sheet-form label:has(input[name="kind"][value="bottle"])');
    await page.fill('#sheet-form input[name="amount"]', '15');
    await page.fill('#sheet-form input[name="offered"]', '90');
    await page.click('#sheet-form label:has(input[name="milk"][value="breast"])');
    await page.click('#sheet-form [data-panel-save] button[type="submit"]');
    await page.waitForSelector('#sheet', { state: 'hidden' });
    assert.deepStrictEqual(await left(), [75], 'offered 90, took 15: 75 left over');
    const edit = async (ml) => {
      await page.evaluate(() => BabyForms.open('feed', BabyStore.last('feed')));
      await page.fill('#sheet-form input[name="amount"]', String(ml));
      await page.click('#sheet-form [data-panel-save] button[type="submit"]');
      await page.waitForSelector('#sheet', { state: 'hidden' });
    };
    await edit(30);
    assert.deepStrictEqual(await left(), [60], 'edited to 30: the leftover is 60');
    await edit(90);
    assert.deepStrictEqual(await left(), [], 'edited to all 90: no leftover');
    await edit(15);
    assert.deepStrictEqual(await left(), [75], 'edited back: the leftover returns');
    await page.evaluate(() => BabyForms.open('feed', BabyStore.last('feed')));
    await page.click('#sheet-form [data-action="event-delete"]');
    assert.deepStrictEqual(await left(), [], 'deleting the feed throws out its leftover');
    await page.click('#toasts button');
    assert.deepStrictEqual(await left(), [75], 'Undo brings back the feed and its leftover');
    await page.evaluate(() => { BabyStore.milkActive().filter((x) => x.leftoverAt).forEach((x) => BabyStore.milkDone(x.id, 'discarded')); BabyApp.commit(); });
    step('editing a bottle feed updates its leftover (and back); deleting the feed removes it; Undo restores');

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
