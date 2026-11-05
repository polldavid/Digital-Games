/* Alaga — the reminder banner on Today: no double nap reminder, compact buttons.
     node baby/tests/e2e.banner.js */
const http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const { chromium, devices } = require('playwright');
const ROOT = path.join(__dirname, '..', '..'), SHOTS = process.env.SHOTS;
const step = (t) => console.log('• ' + t);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' };
(async () => {
  const server = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch(); const errors = [];
  const ctx = await browser.newContext({ ...devices['Galaxy S9+'], viewport: { width: 384, height: 824 }, deviceScaleFactor: 3, timezoneId: 'Asia/Manila' });
  await ctx.route('**/v1/ping', (r) => r.fulfill({ status: 200, body: '{}' }));
  const page = await ctx.newPage(); page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://localhost:' + server.address().port + '/baby/');
  await page.fill('#welcome-form input[name="name"]', 'Mikael Samuel');
  await page.fill('#welcome-form input[name="birth"]', new Date(Date.now() - 35 * 864e5).toISOString().slice(0, 10));
  await page.click('#welcome-form button[type="submit"]');
  await page.waitForSelector('#app:not([hidden])');
  await page.evaluate(() => {
    const now = Date.now(), M = 60000;
    BabyStore.addEvent({ type: 'sleep', time: now - 150 * M, end: now - 92 * M, data: {} });
    const id = BabyStore.get().activeBaby;
    BabyStore.addEvent({ type: 'feed', time: now - 4 * 60 * M, data: { kind: 'bottle', amountMl: 90, milk: 'formula' } });
    const rs = BabyStore.reminders(now, id); window.__rs = rs.map((r) => r.kind + ' ' + Math.round((r.at - now) / M));
    const nap = rs.filter((r) => r.kind === 'nap')[0]; nap.baby = id; BabyStore.markFired(nap); BabyApp.ui.alerts.push(nap);
    BabyApp.commit();
  });
  await page.waitForTimeout(300);
  assert.ok(await page.$('.napcard'), 'nap card shown');
  assert.ok(await page.isHidden('#banner'), 'no duplicate nap banner on Today');
  assert.strictEqual(await page.textContent('#bell-badge'), '1', 'still in the bell');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'n1-today.png') });
  step('on Today the nap card stands in for the nap banner; the reminder stays in the bell');
  await page.click('.tab[data-view="log"]'); await page.waitForTimeout(300);
  assert.ok(await page.isVisible('#banner'), 'banner on other tabs');
  const tops = await page.$$eval('#banner .banner__actions .btn', (b) => b.map((x) => Math.round(x.getBoundingClientRect().top)));
  assert.strictEqual(new Set(tops).size, 1, 'buttons in one row: ' + tops);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'n2-history.png') });
  step('on other tabs the nap banner shows, its buttons in one row');
  await page.click('.tab[data-view="today"]'); await page.waitForTimeout(300);
  await page.click('[data-action="nap-hide"]'); await page.waitForTimeout(300);
  assert.ok(!(await page.$('.napcard')), 'card hidden');
  const bt = await page.evaluate(() => document.querySelector('#banner').hidden ? '' : document.querySelector('.banner__title').textContent);
  assert.ok(!/Nap/.test(bt), 'Not now does not bring the nap banner back: ' + bt);
  // A different reminder still shows on Today, buttons in a row.
  await page.evaluate(() => { const id = BabyStore.get().activeBaby, nap = BabyStore.reminders(Date.now(), id).filter((r) => r.kind === 'nap')[0]; nap.baby = id; BabyApp.ui.alerts.unshift(nap); BabyApp.commit(); });
  await page.click('.tab[data-view="log"]'); await page.waitForTimeout(300);
  assert.ok(!/Nap/.test(await page.evaluate(() => document.querySelector('#banner').hidden ? '' : document.querySelector('.banner__title').textContent)), 'after Not now, no nap banner on other tabs either');
  await page.click('.tab[data-view="today"]'); await page.waitForTimeout(300);
  await page.evaluate(() => { const id = BabyStore.get().activeBaby, f = BabyStore.reminders(Date.now(), id).filter((r) => r.kind === 'feed')[0]; f.baby = id; BabyApp.ui.alerts = BabyApp.ui.alerts.filter((a) => a.key !== f.key); BabyApp.ui.alerts.unshift(f); BabyApp.commit(); });
  await page.waitForTimeout(300);
  assert.match(await page.textContent('.banner__title'), /Feed/);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'n3-feed.png') });
  step('Not now on the card clears the nap reminder too; other reminders still show');
  assert.deepStrictEqual(errors, []);
  console.log('banner e2e passed'); await browser.close(); server.close();
})().catch((e) => { console.error(e); process.exit(1); });
