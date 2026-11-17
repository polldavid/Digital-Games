/* Alaga — what the Android scheduler (Reminders.java, via the Nudge plugin) is
   told, so reminders in the notification shade don't outlive the facts they
   were written from. Reminders.java takes down any showing reminder whose key
   isn't in `k`; this checks the app sends the right `k`, `r` and `n`:
     - the wording carries the clock time ("3h ago (7:38 AM)");
     - a newer feed: the old feed key leaves `k`, a new feed reminder is in `r`;
     - coming back to the app redoes the reminders and the widget;
     - reminders off: n = 0.
   Runs the web app in a pretend Capacitor shell.
     node baby/tests/e2e.notifstale.js */
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
      const P = (v) => Promise.resolve(v);
      const N = window.__n = { sent: [], app: {}, widget: 0, lnPending: [{ id: 5 }, { id: 6 }], lnCancelled: [] };
      window.Capacitor = { isNativePlatform: () => true, Plugins: {
        Nudge: { reminders: (d) => { N.sent.push(d); return P(); }, token: () => P({ token: '' }), config: () => P(), seen: () => P() },
        LocalNotifications: {
          checkPermissions: () => P({ display: 'granted' }), requestPermissions: () => P({ display: 'granted' }), addListener: () => P(),
          getPending: () => P({ notifications: N.lnPending.slice() }),
          cancel: (o) => { N.lnCancelled = N.lnCancelled.concat(o.notifications.map((n) => n.id)); N.lnPending = []; return P(); },
          schedule: () => { throw new Error('reminders must go to the Nudge plugin now'); }
        },
        App: { addListener: (ev, fn) => { N.app[ev] = fn; return P(); } },
        Widget: { update: () => { N.widget++; return P(); } }
      } };
    });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    const settle = () => page.waitForTimeout(1200); // scheduleNow is debounced 800 ms
    const last = () => page.evaluate(() => window.__n.sent[window.__n.sent.length - 1]);

    await page.goto(base);
    await page.fill('#welcome-form input[name="name"]', 'Miel');
    await page.fill('#welcome-form input[name="birth"]', new Date(Date.now() - 40 * 864e5).toISOString().slice(0, 10));
    await page.click('#welcome-form button[type="submit"]');
    await page.waitForSelector('#app:not([hidden])');
    await page.evaluate(() => {
      Object.assign(BabyStore.get().settings, { notify: true, feedRemind: true });
      BabyStore.addEvent({ type: 'feed', time: Date.now() - 60 * 60e3, data: { kind: 'bottle', amountMl: 90, milk: 'formula' } });
      BabyApp.commit();
    });
    await settle();
    let s = await last();
    assert.strictEqual(s.n, 1);
    const feed = s.r.find((r) => /^feed:/.test(r.k));
    assert.ok(feed, 'a feed reminder is scheduled');
    assert.ok(Number.isInteger(feed.i) && feed.at > Date.now(), 'with an id and a time');
    assert.match(feed.b, /^Miel last fed \S.* ago \(\d{1,2}:\d{2}\s?[AP]M\)\. Usually every ~/, 'wording carries the clock time: ' + feed.b);
    assert.ok(s.k.includes(feed.k), 'its key stands');
    assert.deepStrictEqual(await page.evaluate(() => window.__n.lnCancelled), [5, 6], 'what local-notifications still had pending is cancelled (once)');
    step('the feed reminder goes to the Android scheduler, saying when: ' + feed.b);

    // The other parent's newer feed arrives by sync.
    await page.evaluate(() => {
      BabyStore.addEvent({ type: 'feed', time: Date.now() - 5 * 60e3, data: { kind: 'bottle', amountMl: 90, milk: 'formula' } });
      BabyNative.syncReminders();
    });
    await settle();
    s = await last();
    assert.ok(!s.k.includes(feed.k), 'the old feed\'s key no longer stands, so its notification comes down');
    const next = s.r.filter((r) => /^feed:/.test(r.k));
    assert.strictEqual(next.length, 1);
    assert.notStrictEqual(next[0].k, feed.k, 'rescheduled from the newer feed');
    step('a newer feed: the old reminder\'s key leaves the list, a new one is scheduled');

    // Back in front: everything is redone, even if nothing changed here.
    const before = await page.evaluate(() => ({ sent: window.__n.sent.length, widget: window.__n.widget }));
    await page.evaluate(() => window.__n.app.appStateChange({ isActive: true }));
    await settle();
    const after = await page.evaluate(() => ({ sent: window.__n.sent.length, widget: window.__n.widget }));
    assert.ok(after.sent > before.sent, 'reminders redone on resume');
    assert.ok(after.widget > before.widget, 'widget redrawn on resume');
    step('coming back to the app redoes the reminders and the widget');

    await page.evaluate(() => { BabyStore.get().settings.notify = false; BabyNative.syncReminders(); });
    await settle();
    s = await last();
    assert.strictEqual(s.n, 0, 'reminders off');
    assert.deepStrictEqual(s.r, [], 'nothing scheduled');
    step('turning reminders off: n = 0, nothing scheduled');

    assert.deepStrictEqual(errors, [], 'no page errors');
    console.log('\nnotifstale: all good');
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
