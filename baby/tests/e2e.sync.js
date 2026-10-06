/* Baby Log — partner sync in two real browsers (Playwright, Chromium).
   Needs the sync server running locally:
     cd baby/server && npx wrangler d1 execute babylog-sync --local --file=schema.sql && npx wrangler dev --port 8787
   Then, from the repo root:
     SYNC_URL=http://127.0.0.1:8787 node baby/tests/e2e.sync.js     # SHOTS=dir to save screenshots */
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { chromium, devices } = require('playwright');

const ROOT = path.join(__dirname, '..', '..');
const SYNC_URL = process.env.SYNC_URL || 'http://127.0.0.1:8787';
const SHOTS = process.env.SHOTS || '';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

function serve() {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, () => resolve(server)));
}
const step = (t) => console.log('• ' + t);
const shot = (page, name) => SHOTS ? page.screenshot({ path: path.join(SHOTS, name + '.png') }) : null;

async function phone(browser, device, base, errors) {
  const ctx = await browser.newContext({ ...devices[device], timezoneId: 'Asia/Manila' });
  await ctx.addInitScript((url) => { try { localStorage.setItem('dg-babylog-sync-url', url); } catch (e) {} }, SYNC_URL);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(device + ': ' + e.message));
  await page.goto(base);
  return page;
}
async function welcome(page, name) {
  await page.fill('#welcome-form input[name="name"]', name);
  await page.fill('#welcome-form input[name="birth"]', '2026-09-01');
  await page.click('#welcome-form button[type="submit"]');
  await page.waitForSelector('#app:not([hidden])');
}
async function settings(page) { await page.click('.tab[data-view="settings"]'); await page.waitForSelector('#set-share'); }

(async () => {
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const server = await serve();
  const base = 'http://localhost:' + server.address().port + '/baby/';
  const browser = await chromium.launch({ headless: !process.env.HEADED });
  const errors = [];
  try {
    // A (Android) starts a log and turns on sharing.
    const A = await phone(browser, 'Pixel 7', base, errors);
    await welcome(A, 'Ava');
    await A.evaluate(() => { BabyStore.addEvent({ type: 'feed', time: Date.now() - 3600e3, data: { kind: 'bottle', ml: 90 } }); BabyApp.commit(); });
    await settings(A);
    await shot(A, '1-settings-off');
    await A.click('[data-action="share-setup"]');
    await A.fill('#share-setup-form input[name="device"]', 'Poll’s phone');
    await shot(A, '2-setup');
    await A.click('#share-setup-form button[type="submit"]');
    await A.waitForSelector('#share-qr svg', { timeout: 20000 });
    await shot(A, '3-invite-qr');
    const secret = await A.evaluate(() => BabyShare.client.secret());
    assert.match(secret, /^[A-Za-z0-9_-]{43}$/);
    await A.click('.sheet [data-action="sheet-close"] >> nth=-1').catch(() => A.keyboard.press('Escape'));
    assert.ok(await A.isVisible('#syncchip'), 'sync chip shows');
    step('A sets up sharing; QR code renders');

    // B (iPhone) had already set up the same baby on its own, then opens the link.
    const B = await phone(browser, 'iPhone 13', base, errors);
    await welcome(B, 'Ava');
    await B.evaluate(() => { BabyStore.addEvent({ type: 'diaper', time: Date.now() - 1200e3, data: { kind: 'wet' } }); BabyApp.commit(); });
    await B.goto(base + '#join=' + secret);
    await B.waitForSelector('#share-join-form');
    assert.ok(!(await B.evaluate(() => location.hash)), 'code removed from the address bar');
    await B.fill('#share-join-form input[name="device"]', 'Partner’s phone');
    await shot(B, '4-join');
    await B.click('#share-join-form button[type="submit"]');
    await B.waitForSelector('#share-match-form', { timeout: 20000 });
    await shot(B, '5-combine');
    await B.click('#share-match-form button[type="submit"]');
    await B.waitForFunction(() => BabyStore.get().babies.length === 1 && !BabyShare.client.meta().joining, null, { timeout: 20000 });
    assert.strictEqual(await B.evaluate(() => BabyStore.get().events.length), 2, 'B has A’s feed and its own diaper');
    step('B joins from the link and merges its own copy of Ava');

    // A gets B's diaper, credited to B.
    await A.evaluate(() => BabyShare.client.cycle());
    await A.waitForFunction(() => BabyStore.get().events.some((e) => e.type === 'diaper' && e.by === 'Partner’s phone'), null, { timeout: 15000 });
    assert.strictEqual(await A.evaluate(() => BabyStore.get().babies.length), 1, 'no duplicate Ava on A');
    await A.click('.tab[data-view="log"]');
    await A.waitForSelector('text=by Partner’s phone');
    await shot(A, '6-history-byline');
    step('A sees B’s diaper “by Partner’s phone”, no duplicate baby');

    // B starts the sleep timer from the Today screen; A shows baby asleep without a manual sync.
    await B.click('.tab[data-view="today"]');
    await B.evaluate(() => { BabyStore.startTimer('sleep'); BabyApp.commit(); });
    await A.click('.tab[data-view="today"]');
    await A.waitForFunction(() => BabyStore.isAsleep(), null, { timeout: 20000 });
    await A.waitForSelector('.live--sleep .live__sub:has-text("by Partner’s phone")');
    assert.ok(!(await B.textContent('body')).includes('by Partner’s phone'), 'no byline for your own timer');
    await shot(A, '7-today-partner-sleep');
    step('a sleep timer started on B appears on A by itself (polling)');

    // A stops it and logs a feed; B follows.
    await A.evaluate(() => { const v = BabyStore.stopTimer('sleep'); BabyStore.addEvent({ type: 'sleep', time: v.start, end: Date.now(), data: {} }); BabyApp.commit(); });
    await B.waitForFunction(() => !BabyStore.isAsleep() && BabyStore.get().events.some((e) => e.type === 'sleep'), null, { timeout: 20000 });
    step('stopping it on A reaches B');

    await settings(B);
    await shot(B, '8-settings-on');
    assert.match(await B.textContent('#view-settings'), /Baby Log · version \d+/);
    assert.deepStrictEqual(errors, [], 'no page errors');
    console.log('sync e2e passed');
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
