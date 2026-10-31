/* Alaga — growth measurements: weight, length and head all save and come back
   when the entry is opened again (metric and imperial).
     node baby/tests/e2e.growth.js        # SHOTS=dir to save screenshots */
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { chromium, devices } = require('playwright');

const ROOT = path.join(__dirname, '..', '..');
const SHOTS = process.env.SHOTS || '';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const step = (t) => console.log('• ' + t);
const DAY = 864e5;

(async () => {
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
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
    await page.fill('#welcome-form input[name="birth"]', new Date(Date.now() - 12 * DAY).toISOString().slice(0, 10));
    await page.click('#welcome-form button[type="submit"]');
    await page.waitForSelector('#app:not([hidden])');
    const shot = (n) => (SHOTS ? page.screenshot({ path: path.join(SHOTS, n + '.png'), fullPage: true }) : null);
    const growth = () => page.evaluate(() => BabyStore.get().events.filter((e) => e.type === 'growth').map((e) => ({ id: e.id, ...e.data })));

    const logGrowth = async (w, l, hc) => {
      await page.evaluate(() => BabyForms.open('growth'));
      await page.waitForSelector('#sheet-form[data-type="growth"]');
      await page.fill('#sheet-form input[name="weight"]', w);
      await page.fill('#sheet-form input[name="length"]', l);
      await page.fill('#sheet-form input[name="head"]', hc);
      await shot('g-form-' + w);
      await page.click('#sheet-form button[type="submit"]');
      await page.waitForSelector('#sheet', { state: 'hidden' });
    };

    // Metric: all three are saved.
    await logGrowth('3.6', '51.5', '35');
    let g = await growth();
    assert.strictEqual(g.length, 1);
    assert.strictEqual(g[0].weightKg, 3.6, 'weight saved');
    assert.strictEqual(g[0].lengthCm, 51.5, 'length saved');
    assert.strictEqual(g[0].headCm, 35, 'head saved');
    step('metric: weight, length and head are all saved');

    // Opening it again shows all three.
    await page.evaluate((id) => BabyForms.open('growth', BabyStore.findEvent(id)), g[0].id);
    await page.waitForSelector('#sheet-form[data-id]');
    assert.strictEqual(await page.inputValue('#sheet-form input[name="weight"]'), '3.6');
    assert.strictEqual(await page.inputValue('#sheet-form input[name="length"]'), '51.5');
    assert.strictEqual(await page.inputValue('#sheet-form input[name="head"]'), '35');
    await shot('g-edit');
    step('reopening the entry shows weight, length and head');

    // Saving the edit unchanged keeps them.
    await page.click('#sheet-form button[type="submit"]');
    await page.waitForSelector('#sheet', { state: 'hidden' });
    g = await growth();
    assert.deepStrictEqual([g[0].weightKg, g[0].lengthCm, g[0].headCm], [3.6, 51.5, 35]);
    step('saving the edit keeps all three');

    // Imperial units round-trip too.
    await page.evaluate(() => { BabyStore.get().settings.length = 'in'; BabyApp.commit(); });
    await logGrowth('8.5', '20.5', '14');
    g = await growth();
    const last = g.find((e) => e.weightKg && Math.abs(e.weightKg - 3.856) < 0.01);
    assert.ok(last, 'imperial weight saved: ' + JSON.stringify(g));
    assert.ok(last.lengthCm && Math.abs(last.lengthCm - 52.07) < 0.05, 'imperial length saved: ' + JSON.stringify(last));
    assert.ok(last.headCm && Math.abs(last.headCm - 35.56) < 0.05, 'imperial head saved: ' + JSON.stringify(last));
    step('imperial: all three are saved');

    assert.deepStrictEqual(errors, []);
    console.log('\nAll growth checks passed.');
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
