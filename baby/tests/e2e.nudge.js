/* Alaga — keeping the partner's phone up to date (js/native.js → server/nudge.js
   → NudgeService.java). Two phones share a log, each running the web app in a
   pretend Android shell that records what it's told. Against the local sync
   server, started by run-all.js with a pretend Google (FCM_TEST_PORT):
     1. both phones register: the Android side gets the server, the family
        auth, a device id and the key; the server gets token + sealed profile;
     2. A logs a diaper and starts tummy time; A works out B's state with B's
        own settings (B: diaper reminders every 2 h — A has them off), and B
        gets a silent Firebase message;
     3. B's state, fetched and opened the way NudgeService does it, has B's
        diaper reminder, the tummy timer and B's widget; A's own reminders
        (A's settings) don't have the diaper one;
     4. B stops sharing: the server forgets it, the Android side forgets the key.
     node baby/tests/run-all.js e2e.nudge */
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { webcrypto, verify, createPublicKey, createPrivateKey } = require('crypto');
const { chromium, devices } = require('playwright');
const Sync = require('../js/sync.js');

const ROOT = path.join(__dirname, '..', '..');
const SYNC_URL = process.env.SYNC_URL || 'http://127.0.0.1:8787';
const FCM_PORT = +process.env.FCM_TEST_PORT || 8799;
const SA = process.env.FCM_TEST_SA ? JSON.parse(Buffer.from(process.env.FCM_TEST_SA, 'base64').toString()) : null;
let badJwt = false;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
const step = (t) => console.log('• ' + t);
const HOUR = 3600e3;

// What NudgeService.open() does: AES-GCM, 12-byte IV first, base64url.
async function openLikeAndroid(keyB64, blob) {
  const key = await webcrypto.subtle.importKey('raw', Buffer.from(keyB64, 'base64url'), 'AES-GCM', false, ['decrypt']);
  const all = Buffer.from(blob, 'base64url');
  return JSON.parse(Buffer.from(await webcrypto.subtle.decrypt({ name: 'AES-GCM', iv: all.subarray(0, 12) }, key, all.subarray(12))).toString());
}

async function phone(browser, device, base, token, errors) {
  const ctx = await browser.newContext({ ...devices[device], timezoneId: 'Asia/Manila' });
  await ctx.route('**/v1/ping', (r) => r.fulfill({ status: 200, body: '{}' }));
  await ctx.addInitScript(({ url, token }) => {
    try { localStorage.setItem('dg-babylog-sync-url', url); } catch (e) {}
    const P = (v) => Promise.resolve(v);
    const N = window.__n = { reminders: [], cfg: null, seen: 0, widget: [], timers: [] };
    window.Capacitor = { isNativePlatform: () => true, Plugins: {
      Nudge: {
        reminders: (d) => { N.reminders.push(d); return P(); },
        token: () => P({ token }),
        config: (d) => { N.cfg = d; return P(); },
        seen: (d) => { N.seen = d.seq; return P(); }
      },
      LocalNotifications: { checkPermissions: () => P({ display: 'granted' }), requestPermissions: () => P({ display: 'granted' }), getPending: () => P({ notifications: [] }), cancel: () => P(), addListener: () => P() },
      Widget: { update: (d) => { N.widget.push(d); return P(); } },
      TimerNotification: { sync: (d) => { N.timers.push(d.timers); return P(); } },
      App: { addListener: () => P() }
    } };
  }, { url: SYNC_URL, token });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(device + ': ' + e.message));
  await page.goto(base);
  return page;
}
async function welcome(page) {
  await page.fill('#welcome-form input[name="name"]', 'Ava');
  await page.fill('#welcome-form input[name="birth"]', new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10));
  await page.click('#welcome-form button[type="submit"]');
  await page.waitForSelector('#app:not([hidden])');
}
const until = async (fn, what, ms = 20000) => {
  for (let t = 0; t < ms; t += 200) { if (await fn()) return; await new Promise((r) => setTimeout(r, 200)); }
  throw new Error('timed out waiting for ' + what);
};

(async () => {
  try { await fetch(SYNC_URL + '/'); } catch (e) { console.error('No sync server at ' + SYNC_URL + ' — run  node baby/tests/run-all.js e2e.nudge'); process.exit(1); }
  const sends = [];
  const google = http.createServer((q, r) => {
    let body = '';
    q.on('data', (c) => (body += c));
    q.on('end', () => {
      if (q.url === '/token') {
        // Only a JWT signed with the test service account's key gets a token (nudge.test.js checks the claims).
        const jwt = new URLSearchParams(body).get('assertion').split('.');
        const ok = !SA || verify('RSA-SHA256', Buffer.from(jwt[0] + '.' + jwt[1]), createPublicKey(createPrivateKey(SA.private_key)), Buffer.from(jwt[2], 'base64url'));
        if (!ok) badJwt = true;
        r.writeHead(ok ? 200 : 401, { 'content-type': 'application/json' });
        return r.end(JSON.stringify(ok ? { access_token: 'test-access', expires_in: 3600 } : { error: 'bad sig' }));
      }
      r.writeHead(200, { 'content-type': 'application/json' });
      sends.push(JSON.parse(body).message);
      r.end('{}');
    });
  });
  await new Promise((r) => google.listen(FCM_PORT, '127.0.0.1', r));
  const site = http.createServer((q, r) => {
    let p = decodeURIComponent(q.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(r);
  });
  await new Promise((r) => site.listen(0, r));
  const base = 'http://localhost:' + site.address().port + '/baby/';
  const browser = await chromium.launch({ headless: !process.env.HEADED });
  const errors = [];
  try {
    // A starts sharing; B joins and merges its own Ava.
    const A = await phone(browser, 'Pixel 7', base, 'token-A', errors);
    await welcome(A);
    await A.click('.tab[data-view="settings"]'); await A.waitForSelector('#set-share');
    await A.click('[data-action="share-setup"]');
    await A.fill('#share-setup-form input[name="device"]', 'Mama');
    await A.click('#share-setup-form button[type="submit"]');
    await A.waitForSelector('#share-qr svg', { timeout: 20000 });
    const secret = await A.evaluate(() => BabyShare.client.secret());
    await A.keyboard.press('Escape');
    const B = await phone(browser, 'Pixel 7', base, 'token-B', errors);
    await welcome(B);
    await B.goto(base + '#join=' + secret);
    await B.waitForSelector('#share-join-form');
    await B.fill('#share-join-form input[name="device"]', 'Papa');
    await B.click('#share-join-form button[type="submit"]');
    await B.waitForSelector('#share-match-form', { timeout: 20000 });
    await B.click('#share-match-form button[type="submit"]');
    await B.waitForFunction(() => BabyStore.get().babies.length === 1 && !BabyShare.client.meta().joining, null, { timeout: 20000 });

    // Reminder settings differ: B wants diaper checks every 2 hours, A has them off.
    await A.evaluate(() => { Object.assign(BabyStore.get().settings, { notify: true, diaperRemind: false }); BabyApp.commit(); return BabyShare.client.cycle(); });
    await B.evaluate(() => { Object.assign(BabyStore.get().settings, { notify: true, diaperRemind: true, diaperIntervalH: 2 }); BabyApp.commit(); return BabyShare.client.cycle(); });
    const keys = await Sync.deriveKeys(secret);
    const auth = 'Bearer ' + keys.family + '.' + keys.token;
    const api = (p, init) => fetch(SYNC_URL + p, { ...(init || {}), headers: { Authorization: auth } }).then((r) => r.json());
    await until(async () => ((await api('/v1/nudge/devices')).rows || []).filter((x) => x.p).length === 2, 'both phones registered');
    const cfgB = await B.evaluate(() => window.__n.cfg);
    assert.strictEqual(cfgB.server, SYNC_URL);
    assert.strictEqual(cfgB.auth, keys.family + '.' + keys.token, 'the Android side gets the family auth');
    assert.match(cfgB.device, /^[0-9a-f]{32}$/);
    const nkey = Buffer.from(await Sync.nudgeKey(secret)).toString('base64url');
    assert.strictEqual(cfgB.key, nkey, 'and the nudge key from the family secret');
    const cfgA = await A.evaluate(() => window.__n.cfg);
    assert.notStrictEqual(cfgA.device, cfgB.device, 'each phone has its own id');
    const devs = (await api('/v1/nudge/devices')).rows;
    assert.ok(devs.every((d) => d.t), 'both sent their Firebase token');
    const profB = await openLikeAndroid(nkey, devs.find((d) => d.d === cfgB.device).p);
    assert.strictEqual(profB.s.diaperIntervalH, 2, 'B\'s profile carries its settings (sealed)');
    step('both phones register: Android side configured, token + sealed profile on the server');

    // A logs a diaper and starts tummy time.
    const sent0 = sends.length;
    const diaperAt = await A.evaluate(() => {
      const t = Date.now() - 20 * 60e3;
      BabyStore.addEvent({ type: 'diaper', time: t, data: { wet: true } });
      BabyStore.addEvent({ type: 'feed', time: t - 10 * 60e3, data: { kind: 'bottle', amountMl: 90, milk: 'formula' } });
      BabyApp.act('tummy-start'); BabyApp.commit();
      return t;
    });
    await until(() => sends.length > sent0, 'a Firebase message for B');
    const msg = sends[sends.length - 1];
    assert.strictEqual(msg.token, 'token-B', 'sent to B, not back to A');
    assert.deepStrictEqual(msg.data, { t: 's' });
    assert.ok(!badJwt, 'the server signed its JWT with the service account key');
    step('A logs; B gets a silent Firebase message');

    // What NudgeService does on B: fetch, open, apply.
    const got = await api('/v1/nudge/state?d=' + cfgB.device);
    const seen = await A.evaluate(() => BabyShare.client.meta().after);
    assert.ok(got.s >= 1 && got.s <= seen, 'worked out from the family\'s latest write');
    const st = await openLikeAndroid(cfgB.key, got.b);
    assert.strictEqual(st.n, 1, 'reminders on for B');
    const dia = st.r.find((r) => /^diaper:/.test(r.k));
    assert.ok(dia, 'B\'s state has a diaper reminder (B\'s setting)');
    assert.strictEqual(dia.at, diaperAt + 2 * HOUR, 'every 2 hours: B\'s interval, not A\'s');
    assert.match(dia.b, /^Last change 2h ago \(/, 'worded as of when it fires: ' + dia.b);
    assert.ok(Number.isInteger(dia.i) && dia.i > 0, 'with a notification id');
    assert.ok(st.k.includes(dia.k), 'its key stands');
    assert.ok(st.t.some((t) => /:tummy$/.test(t.key)), 'the tummy timer is in B\'s timer notifications');
    assert.strictEqual(st.w.name, 'Ava');
    assert.match(st.w.feed, /🍼/, 'B\'s widget shows the new feed');
    const ownA = await A.evaluate(() => window.__n.reminders[window.__n.reminders.length - 1]);
    assert.ok(!ownA.r.some((r) => /^diaper:/.test(r.k)), 'A\'s own reminders follow A\'s settings (no diaper check)');
    step('B\'s state, opened like NudgeService does: B\'s diaper reminder, the tummy timer, the widget');

    // B stops sharing.
    await B.evaluate(() => BabyShare.client.leave());
    await until(async () => !((await api('/v1/nudge/devices')).rows || []).some((x) => x.d === cfgB.device), 'B forgotten');
    assert.deepStrictEqual(await B.evaluate(() => window.__n.cfg), { clear: true }, 'the Android side forgets the key');
    step('B stops sharing: the server and B\'s Android side forget it');

    assert.deepStrictEqual(errors, [], 'no page errors');
    console.log('\nnudge e2e: all good');
  } finally {
    await browser.close();
    site.close();
    google.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
