/* Alaga — the anonymous usage count in a real browser: one ping a day,
   nothing in it but flags, version and platform, and nothing at all once off.
   Runs against an in-page fake of the server, so no network is needed.
     node baby/tests/e2e.ping.js */
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { chromium, devices } = require('playwright');

const ROOT = path.join(__dirname, '..', '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const step = (t) => console.log('• ' + t);

(async () => {
  const pings = [];
  const server = http.createServer((req, res) => {
    if (req.url === '/v1/ping' && req.method === 'POST') {
      let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { pings.push(JSON.parse(b)); res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' }); res.end('{"ok":true}'); });
      return;
    }
    if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'Content-Type', 'access-control-allow-methods': 'POST' }); return res.end(); }
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(0, r));
  const origin = 'http://localhost:' + server.address().port;
  const browser = await chromium.launch({ headless: !process.env.HEADED });
  try {
    const ctx = await browser.newContext({ ...devices['Pixel 7'] });
    await ctx.addInitScript((u) => { try { localStorage.setItem('dg-babylog-sync-url', u); } catch (e) {} }, origin);
    const page = await ctx.newPage();
    await page.goto(origin + '/baby/');
    await page.waitForTimeout(6500);
    assert.strictEqual(pings.length, 1, 'one ping on first open');
    const p = pings[0];
    assert.deepStrictEqual(Object.keys(p).sort(), ['d', 'm', 'n', 'p', 's', 'v', 'w']);
    assert.deepStrictEqual([p.d, p.w, p.m, p.n, p.s, p.p], [1, 1, 1, 1, 0, 'web']);
    assert.ok(p.v > 0);
    step('first open sends one ping: flags, version and platform only');

    await page.reload();
    await page.waitForTimeout(6500);
    assert.strictEqual(pings.length, 1, 'no second ping the same day');
    step('reopening the same day sends nothing');

    // Next "day": the phone counts itself again, not as a new install.
    await page.evaluate(() => { const k = JSON.parse(localStorage.getItem('dg-alaga-ping')); k.day = '2000-01-01'; localStorage.setItem('dg-alaga-ping', JSON.stringify(k)); });
    await page.reload();
    await page.waitForTimeout(6500);
    assert.strictEqual(pings.length, 2);
    assert.deepStrictEqual([pings[1].n, pings[1].w], [0, 0]);
    step('a new day sends one ping, not counted as a new install');

    // Switch it off in Settings (on by default).
    await page.fill('#welcome-form input[name="name"]', 'Miel');
    await page.fill('#welcome-form input[name="birth"]', '2026-10-01');
    await page.click('#welcome-form button[type="submit"]');
    await page.click('.tab[data-view="settings"]');
    assert.strictEqual(await page.isChecked('input[data-setting="usageCount"]'), true, 'on by default');
    await page.click('input[data-setting="usageCount"]', { force: true });
    assert.strictEqual(await page.evaluate(() => BabyStore.get().settings.usageCount), false);
    await page.evaluate(() => { const k = JSON.parse(localStorage.getItem('dg-alaga-ping')); k.day = '2000-01-02'; localStorage.setItem('dg-alaga-ping', JSON.stringify(k)); });
    await page.reload();
    await page.waitForTimeout(6500);
    assert.strictEqual(pings.length, 2, 'off means nothing is sent');
    step('switched off in Settings: nothing is sent');
    console.log('ping e2e passed');
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
