/* Alaga — two copies of the app open on one phone (same address, same saved
   log) while sharing is on. This once deleted a partner's entries on every
   phone (Oct 2026): the older copy saved over newer entries and sync passed
   the loss on as deletions. Now the older copy steps aside, and nothing is lost.
     cd baby/server && npx wrangler dev --port 8788      (local sync server)
     SYNC_URL=http://127.0.0.1:8788 node baby/tests/e2e.copies.js */
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { chromium, devices } = require('playwright');

const ROOT = path.join(__dirname, '..', '..');
const SYNC = process.env.SYNC_URL || 'http://127.0.0.1:8788';
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
  const phone = async () => {
    const ctx = await browser.newContext({ ...devices['Pixel 7'] });
    await ctx.addInitScript((u) => { localStorage.setItem('dg-babylog-sync-url', u); }, SYNC);
    await ctx.route('**/v1/ping', (r) => r.fulfill({ status: 200, body: '{}' }));
    return ctx;
  };
  const open = async (ctx) => { const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push(e.message)); await p.goto(base); return p; };
  const count = (p) => p.evaluate(() => BabyStore.get().events.length);
  try {
    const ctxA = await phone(), A = await open(ctxA);
    await A.fill('#welcome-form input[name="name"]', 'Miel');
    await A.fill('#welcome-form input[name="birth"]', '2026-10-01');
    await A.click('#welcome-form button[type="submit"]');
    await A.evaluate(() => { for (let i = 0; i < 5; i++) BabyStore.addEvent({ type: 'diaper', time: Date.now() - i * 3600e3, data: { wet: true } }); BabyApp.commit(); });
    await A.evaluate(() => BabyShare.client.create('A phone'));
    const secret = await A.evaluate(() => BabyShare.client.secret());
    const ctxB = await phone(), B = await open(ctxB);
    await B.evaluate((s) => BabyShare.client.join(s, 'B phone').then(() => BabyShare.client.finishJoin()), secret);
    assert.strictEqual(await count(B), 5);

    // A second copy opens on phone A (a link opened in a new tab) and takes over.
    const A2 = await open(ctxA);
    await A2.waitForTimeout(800);
    assert.ok(await A.isVisible('.othercopy'), 'the first copy steps aside');
    assert.ok(!(await A2.isVisible('.othercopy')), 'the new copy is the one in use');
    step('a second copy opens: the first one steps aside');

    // The partner logs 4 feeds; the copy in use receives them.
    await B.evaluate(() => { for (let i = 0; i < 4; i++) BabyStore.addEvent({ type: 'feed', time: Date.now() - i * 60e3, data: { kind: 'bottle', amountMl: 30, milk: 'formula' } }); BabyApp.commit(); });
    await B.evaluate(() => BabyShare.client.cycle()); await A2.evaluate(() => BabyShare.client.cycle());
    assert.strictEqual(await count(A2), 9);
    // The stepped-aside copy tries to save and sync with its older picture of the log.
    const saved = await A.evaluate(() => { BabyStore.get().settings.chime = !BabyStore.get().settings.chime; return BabyStore.save(); });
    assert.strictEqual(saved, false, 'the older copy cannot save');
    assert.strictEqual(await A.evaluate(() => BabyShare.client.cycle()), null, 'nor sync');
    step('the older copy can neither save nor sync');

    // Phone A reopens later; everything syncs.
    await A.close(); await A2.close();
    const A3 = await open(ctxA); await A3.waitForTimeout(500);
    await A3.evaluate(() => BabyShare.client.cycle()); await B.evaluate(() => BabyShare.client.cycle());
    assert.strictEqual(await count(A3), 9, 'phone A has all 9');
    assert.strictEqual(await count(B), 9, 'the partner still has all 9');
    step('after reopening, both phones still have every entry');

    // "Use Alaga here" on a stepped-aside copy reloads it with the latest log.
    const A4 = await open(ctxA); await A4.waitForTimeout(500);
    assert.ok(await A3.isVisible('.othercopy'));
    await A4.close();
    await Promise.all([A3.waitForNavigation(), A3.click('#othercopy-go')]);
    assert.ok(!(await A3.isVisible('.othercopy')) && (await count(A3)) === 9);
    step('“Use Alaga here” reloads with the latest log');

    assert.deepStrictEqual(errors, [], 'no page errors');
    console.log('copies e2e passed');
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
