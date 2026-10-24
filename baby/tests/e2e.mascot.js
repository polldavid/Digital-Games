/* Alaga — the joey mascot shows in its four friendly spots (welcome, empty
   Today, empty History, the sleep timer, "Looking good") and never on a
   warning, in light and dark themes.
     node baby/tests/e2e.mascot.js        # SHOTS=dir to save screenshots */
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { chromium, devices } = require('playwright');

const ROOT = path.join(__dirname, '..', '..');
const SHOTS = process.env.SHOTS || '';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
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
    page.on('response', (r) => { if (/\/img\//.test(r.url()) && r.status() >= 400) errors.push('missing ' + r.url()); });
    const shot = (n) => (SHOTS ? page.screenshot({ path: path.join(SHOTS, n + '.png'), fullPage: true }) : null);
    // The pose shown inside `sel`, once its image has actually loaded.
    const pose = async (sel) => {
      const img = page.locator(sel + ' img.mascot');
      assert.strictEqual(await img.count(), 1, 'one mascot in ' + sel);
      await page.waitForFunction((s) => { const i = document.querySelector(s + ' img.mascot'); return i && i.complete && i.naturalWidth > 0; }, sel);
      assert.strictEqual(await img.getAttribute('alt'), '', 'decorative: screen readers skip it');
      return (await img.getAttribute('src')).match(/mascot\/(\w+)\./)[1];
    };
    const noneOnWarnings = async () => assert.strictEqual(await page.locator('.note--warn img.mascot, .note--urgent img.mascot').count(), 0, 'never on a warning');

    await page.goto(base);
    assert.strictEqual(await pose('#welcome'), 'wave');
    await shot('1-welcome');
    step('welcome: the joey waves');

    await page.fill('#welcome-form input[name="name"]', 'Miel');
    await page.fill('#welcome-form input[name="birth"]', new Date(Date.now() - 8 * 864e5).toISOString().slice(0, 10));
    await page.click('#welcome-form button[type="submit"]');
    await page.waitForSelector('#app:not([hidden])');
    assert.strictEqual(await pose('#view-today .empty'), 'peek');
    await page.click('.tab[data-view="log"]');
    assert.strictEqual(await pose('#view-log .empty'), 'peek');
    step('empty Today and History: the joey peeks from behind a card');

    await page.click('.tab[data-view="today"]');
    await page.click('.qa[data-type="sleep"]');
    assert.strictEqual(await pose('#view-today .live--sleep'), 'sleep');
    await shot('2-asleep');
    await page.click('[data-action="sleep-stop"]');
    step('sleep timer: the joey sleeps');

    // A full day of feeds and wet diapers in range, logged since yesterday.
    await page.evaluate(() => {
      const now = Date.now(), H = 3600e3;
      BabyStore.addEvent({ type: 'note', time: now - 30 * H, data: { note: 'start' } });
      for (let i = 0; i < 10; i++) BabyStore.addEvent({ type: 'feed', time: now - (i * 2 + 1) * H, data: { kind: 'bottle', amountMl: 60, milk: 'formula' } });
      for (let i = 0; i < 8; i++) BabyStore.addEvent({ type: 'diaper', time: now - (i * 2.5 + 0.5) * H, data: { wet: true } });
      BabyApp.commit();
    });
    assert.strictEqual(await pose('#view-today .note--ok'), 'cheer');
    await noneOnWarnings();
    await shot('3-looking-good');
    step('“Looking good”: the joey cheers');

    // Too few wet diapers: a warning, and no mascot anywhere near it.
    await page.evaluate(() => { BabyStore.events({ type: 'diaper' }).forEach((e) => BabyStore.removeEvent(e.id)); BabyApp.commit(); });
    assert.ok(await page.isVisible('#view-today .note--warn'), 'the warning shows');
    assert.strictEqual(await page.locator('#view-today .note--ok').count(), 0);
    await noneOnWarnings();
    step('a “fewer wet diapers” warning has no mascot');

    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await shot('4-dark');
    assert.deepStrictEqual(errors, [], 'no page errors or missing images');
    console.log('mascot e2e passed');
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
