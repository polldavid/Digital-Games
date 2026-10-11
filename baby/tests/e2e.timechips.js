/* Alaga — the "When" chips (Now, −5m … −1h) show which one is picked, and a
   line under them confirms the time ("10 min ago · 3:42 PM").
     node baby/tests/e2e.timechips.js        # SHOTS=dir to save screenshots */
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
    await ctx.route('**/v1/ping', (r) => r.fulfill({ status: 200, body: '{}' }));
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base);
    await page.fill('#welcome-form input[name="name"]', 'Miel');
    await page.fill('#welcome-form input[name="birth"]', new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10));
    await page.click('#welcome-form label:has(input[value="mixed"])');
    await page.click('#welcome-form button[type="submit"]');
    await page.waitForSelector('#app:not([hidden])');

    const pressed = (name) => page.$$eval('#sheet-form [data-action="time-set"][data-target="' + name + '"]',
      (bs) => bs.filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.textContent));
    const hint = (name) => page.textContent('#sheet-form [data-time-hint="' + name + '"]');

    // A new diaper opens on "Now".
    await page.click('[data-action="log"][data-type="diaper"] >> nth=0');
    await page.waitForSelector('#sheet-form input[name="time"]');
    assert.deepStrictEqual(await pressed('time'), ['Now']);
    assert.match(await hint('time'), /^just now · /);
    step('a new entry opens with Now picked and "just now" under it');

    // Tap −10m: only −10m is lit, and the line says 10 min ago. Tapping again keeps it.
    await page.click('#sheet-form [data-action="time-set"][data-min="10"]');
    assert.deepStrictEqual(await pressed('time'), ['−10m']);
    assert.match(await hint('time'), /^10 min ago · /);
    await page.click('#sheet-form [data-action="time-set"][data-min="10"]');
    assert.deepStrictEqual(await pressed('time'), ['−10m']);
    assert.match(await hint('time'), /^10 min ago · /, 'chips set the time, they don’t add up');
    await shot(page, 't1-picked');
    step('tapping −10m lights only −10m and says "10 min ago" (twice is still 10)');

    // Typing a time by hand clears the chip, unless it matches one.
    const local = (ms) => new Date(ms + 8 * 3600e3).toISOString().slice(0, 16); // Asia/Manila, UTC+8
    await page.fill('#sheet-form input[name="time"]', await local(Date.now() - 3 * 3600e3));
    await page.dispatchEvent('#sheet-form input[name="time"]', 'change');
    assert.deepStrictEqual(await pressed('time'), []);
    assert.match(await hint('time'), /^3 ?h(r|ours?)? ago · /);
    await page.fill('#sheet-form input[name="time"]', await local(Date.now() - 30 * 60e3));
    await page.dispatchEvent('#sheet-form input[name="time"]', 'change');
    assert.deepStrictEqual(await pressed('time'), ['−30m']);
    step('typing a time clears the chips; typing one that matches lights it');

    // Save it 5 hours back, reopen the entry: no chip is lit.
    await page.fill('#sheet-form input[name="time"]', await local(Date.now() - 5 * 3600e3));
    await page.dispatchEvent('#sheet-form input[name="time"]', 'change');
    await page.click('#sheet-form button[type="submit"]');
    await page.waitForSelector('#sheet', { state: 'hidden' });
    const id = await page.evaluate(() => BabyStore.get().events.filter((e) => e.type === 'diaper')[0].id);
    await page.click('[data-action="edit"][data-id="' + id + '"] >> nth=0');
    await page.waitForSelector('#sheet-form input[name="time"]');
    assert.deepStrictEqual(await pressed('time'), []);
    assert.match(await hint('time'), / ago · /);
    step('editing an older entry lights no chip');
    await page.keyboard.press('Escape');

    // Sleep has two time fields; each keeps its own pick.
    await page.click('[data-action="log"][data-type="sleep"] >> nth=0');
    await page.waitForSelector('#sheet-form input[name="end"]');
    await page.click('#sheet-form [data-action="time-set"][data-target="time"][data-min="60"]');
    await page.click('#sheet-form [data-action="time-set"][data-target="end"][data-min="5"]');
    assert.deepStrictEqual(await pressed('time'), ['−1h']);
    assert.deepStrictEqual(await pressed('end'), ['−5m']);
    await shot(page, 't2-sleep');
    step('sleep: "Fell asleep" and "Woke up" each show their own chip');

    assert.deepStrictEqual(errors, []);
    console.log('\nAll time-chip checks passed.');
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
