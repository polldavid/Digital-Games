/* Alaga — the joey mascot shows in its four friendly spots (welcome, empty
   Today, empty History, the sleep timer, "Looking good") and never on a
   warning, in light and dark themes. It moves on good news (save, wake,
   milestone) unless the Settings switch or "reduce motion" says not to.
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
    const welcomeSrc = () => page.getAttribute('#welcome img.mascot', 'src');
    await page.check('#welcome-form input[name="sex"][value="f"]', { force: true });
    assert.strictEqual(await welcomeSrc(), 'img/mascot/girl/wave.webp', 'Girl: the girl waves');
    await page.waitForFunction(() => { const i = document.querySelector('#welcome img.mascot'); return i.complete && i.naturalWidth > 0; });
    await shot('1b-welcome-girl');
    await page.check('#welcome-form input[name="sex"][value="m"]', { force: true });
    assert.strictEqual(await welcomeSrc(), 'img/mascot/wave.webp', 'Boy: the boy waves');
    await page.check('#welcome-form input[name="sex"][value=""]', { force: true });
    assert.strictEqual(await welcomeSrc(), 'img/mascot/wave.webp', 'Skip: the boy stands in');
    step('welcome: the baby waves, and turns into a girl or boy as it is picked');

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
    assert.strictEqual(await page.locator('#view-today .live__z').count(), 3, 'three sleepy stars');
    assert.match(await page.$eval('#view-today .live__mascot', (i) => getComputedStyle(i).animationName), /joey-settle/);
    await shot('2-asleep');
    await page.evaluate(() => { BabyStore.timers().sleep.start -= 20 * 60e3; }); // under a minute isn't saved
    await page.click('[data-action="sleep-stop"]');
    step('sleep timer: the joey settles in, breathes, stars float');

    // The message after a good-news action: which pose, and how it moved.
    const toastJoey = async () => {
      await page.waitForTimeout(350);
      const img = page.locator('#toasts .toast__joey');
      if (!(await img.count())) return null;
      return { pose: (await img.getAttribute('src')).match(/mascot\/(\w+)\./)[1], move: ((await img.getAttribute('class')).match(/joey--(\w+)/) || [])[1] || null };
    };
    assert.deepStrictEqual(await toastJoey(), { pose: 'wave', move: 'springup' });
    step('woke up: the joey springs up in the message');

    const logNote = async (type, text) => {
      await page.evaluate((t) => BabyApp.act('log', { type: t }), type);
      await page.fill('#sheet-form textarea[name="text"]', text);
      await page.click('#sheet-form button[type="submit"]');
    };
    await logNote('note', 'Burped well');
    assert.deepStrictEqual(await toastJoey(), { pose: 'wave', move: 'hop' });
    step('saved: the joey hops');

    await logNote('milestone', 'First smile');
    assert.deepStrictEqual(await toastJoey(), { pose: 'star', move: 'jump' });
    assert.ok(await page.locator('#toasts .joey-star').count() >= 5, 'stars burst');
    await shot('2b-milestone');
    step('milestone: the joey jumps and stars burst');

    // The Settings switch: the joey still shows, but holds still.
    await page.evaluate(() => { BabyStore.get().settings.joeyMotion = false; BabyApp.commit(); });
    assert.ok(await page.evaluate(() => document.documentElement.classList.contains('joey-still')));
    await logNote('note', 'Quiet one');
    assert.deepStrictEqual(await toastJoey(), { pose: 'wave', move: null });
    await page.evaluate(() => { BabyStore.get().settings.joeyMotion = true; BabyApp.commit(); });
    // The phone's "reduce motion" wins over the switch.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await logNote('note', 'Calm one');
    assert.deepStrictEqual(await toastJoey(), { pose: 'wave', move: null });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    step('animations off, or reduce motion: the joey stays still');

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

    // A girl: every spot shows the girl.
    await page.evaluate(() => { BabyStore.baby().sex = 'f'; BabyApp.commit(); });
    await page.click('.qa[data-type="sleep"]');
    assert.strictEqual(await page.getAttribute('#view-today .live--sleep img.mascot', 'src'), 'img/mascot/girl/sleep.webp');
    await page.waitForFunction(() => { const i = document.querySelector('#view-today .live--sleep img.mascot'); return i.complete && i.naturalWidth > 0; });
    await page.evaluate(() => { BabyStore.timers().sleep.start -= 20 * 60e3; });
    await page.click('[data-action="sleep-stop"]');
    await page.waitForTimeout(350);
    assert.strictEqual(await page.getAttribute('#toasts .toast__joey', 'src'), 'img/mascot/girl/wave.webp');
    step('a girl: the girl sleeps and springs up');

    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await shot('4-dark');
    assert.deepStrictEqual(errors, [], 'no page errors or missing images');
    console.log('mascot e2e passed');
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
