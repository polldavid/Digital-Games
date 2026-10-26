/* Alaga — what the Android home-screen widget is told to show (native.js →
   Widget.update → AlagaWidget.java). Runs the web app with a pretend Capacitor
   shell that records the widget updates.
     node baby/tests/e2e.widget.js */
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { chromium, devices } = require('playwright');

const ROOT = path.join(__dirname, '..', '..');
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
    await ctx.addInitScript(() => {
      window.__widget = [];
      window.Capacitor = { isNativePlatform: () => true, Plugins: { Widget: { update: (d) => { window.__widget.push(d); return Promise.resolve(); } } } };
    });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    const last = async () => { await page.waitForTimeout(100); return page.evaluate(() => window.__widget[window.__widget.length - 1]); };
    const count = () => page.evaluate(() => window.__widget.length);

    await page.goto(base);
    await page.fill('#welcome-form input[name="name"]', 'Miel');
    await page.fill('#welcome-form input[name="birth"]', new Date(Date.now() - 8 * 864e5).toISOString().slice(0, 10));
    await page.click('#welcome-form button[type="submit"]');
    await page.waitForSelector('#app:not([hidden])');
    let w = await last();
    assert.strictEqual(w.name, 'Miel');
    assert.strictEqual(w.feed, 'No feeds yet');
    assert.strictEqual(w.sinceAt, 0);
    step('a new baby: name, no feeds yet, no counter');

    const fedAt = await page.evaluate(() => {
      const t = Date.now() - 30 * 60e3;
      BabyStore.addEvent({ type: 'feed', time: t, data: { kind: 'bottle', amountMl: 60, milk: 'formula' } });
      BabyStore.addEvent({ type: 'diaper', time: t + 5 * 60e3, data: { wet: true } });
      BabyApp.commit();
      return t;
    });
    w = await last();
    assert.strictEqual(w.sinceAt, fedAt, 'counts from the feed');
    assert.strictEqual(w.sinceLabel, 'since last feed');
    assert.match(w.feed, /^🍼 \d{1,2}:\d\d [AP]M · Bottle, 60 ml/);
    assert.match(w.next, /^Next feed ~\d{1,2}:\d\d.* · 🧷 \d{1,2}:\d\d/);
    step('after a bottle and a diaper: counter from the feed, next feed, last diaper');

    const n = await count();
    await page.evaluate(() => BabyApp.commit());
    assert.strictEqual(await count(), n, 'nothing changed: no redraw');
    step('an unchanged log does not redraw the widget');

    await page.click('.qa[data-type="sleep"]');
    w = await last();
    assert.strictEqual(w.asleep, true);
    assert.match(w.status, /^😴 Asleep since/);
    step('sleep timer: the widget says asleep (its button becomes Woke up)');

    assert.deepStrictEqual(errors, [], 'no page errors');
    console.log('widget e2e passed');
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
