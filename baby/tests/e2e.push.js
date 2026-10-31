/* Alaga — reminders with the app closed (js/push.js → server/push.js → sw.js).
   Against the local sync server (wrangler dev, started by run-all.js with
   --test-scheduled and PUSH_TEST=1), with a pretend push service on this
   machine standing in for Google/Apple/Mozilla:
     1. the app sends its next reminders: times in the clear, wording encrypted;
     2. the every-minute job sends the due one to the push service, encrypted
        for this browser (RFC 8291) and signed (VAPID, RFC 8292);
     3. the service worker decrypts it and shows the notification;
     4. turning notifications off makes the server forget the phone.
   Also: the server refuses push services it doesn't know, and other tokens.
     SYNC_URL=http://127.0.0.1:8787 node baby/tests/e2e.push.js */
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { webcrypto: crypto } = require('crypto');
const { chromium, devices } = require('playwright');

const ROOT = path.join(__dirname, '..', '..');
const SYNC_URL = process.env.SYNC_URL || 'http://127.0.0.1:8787';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
const step = (t) => console.log('• ' + t);
const b64u = (buf) => Buffer.from(buf).toString('base64url');
const unb64u = (s) => new Uint8Array(Buffer.from(s, 'base64url'));
const enc = new TextEncoder();

async function hmac(key, data) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}
// What the browser does with a push body (RFC 8291, receiving side).
async function decryptPush(body, ua, auth) {
  const salt = body.slice(0, 16), idlen = body[20], asPub = body.slice(21, 21 + idlen), ct = body.slice(21 + idlen);
  const asKey = await crypto.subtle.importKey('raw', asPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, ua.privateKey, 256));
  const ikm = await hmac(await hmac(auth, shared), Buffer.concat([enc.encode('WebPush: info\0'), ua.pub, asPub, Buffer.from([1])]));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, enc.encode('Content-Encoding: aes128gcm\0\x01'))).slice(0, 16);
  const nonce = (await hmac(prk, enc.encode('Content-Encoding: nonce\0\x01'))).slice(0, 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const pt = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, ct));
  assert.strictEqual(pt[pt.length - 1], 2, 'last-record delimiter');
  return JSON.parse(Buffer.from(pt.slice(0, -1)).toString());
}
// The VAPID header: a JWT for the push service's origin, signed with the server's key.
async function checkVapid(header, serverKey, origin) {
  const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header || '');
  assert.ok(m, 'vapid header: ' + header);
  assert.strictEqual(m[4], serverKey, 'k= is the server key the app was given');
  const claims = JSON.parse(Buffer.from(m[2], 'base64url').toString());
  assert.strictEqual(claims.aud, origin);
  assert.ok(claims.exp > Date.now() / 1000 && /^(https:|mailto:)/.test(claims.sub));
  const pub = await crypto.subtle.importKey('raw', unb64u(m[4]), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  assert.ok(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, unb64u(m[3]), enc.encode(m[1] + '.' + m[2])), 'signature checks out');
}

(async () => {
  // The pretend push service.
  const got = [];
  const pushSvc = http.createServer((q, r) => {
    const chunks = [];
    q.on('data', (c) => chunks.push(c));
    q.on('end', () => { got.push({ path: q.url, headers: q.headers, body: new Uint8Array(Buffer.concat(chunks)) }); r.writeHead(201); r.end(); });
  });
  await new Promise((r) => pushSvc.listen(0, '127.0.0.1', r));
  const endpoint = 'http://127.0.0.1:' + pushSvc.address().port + '/push/phone-1';

  // This browser's push keys, as a real subscription would have them.
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const ua = { privateKey: pair.privateKey, pub: new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)) };
  const authSecret = crypto.getRandomValues(new Uint8Array(16));
  const subJson = { endpoint, keys: { p256dh: b64u(ua.pub), auth: b64u(authSecret) } };

  const site = http.createServer((q, r) => {
    let p = decodeURIComponent(q.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(r);
  });
  await new Promise((r) => site.listen(0, r));
  const origin = 'http://localhost:' + site.address().port, base = origin + '/baby/';
  // The full Chromium (not the headless shell), which has notifications.
  const browser = await chromium.launch({ headless: !process.env.HEADED, channel: 'chromium' });
  const errors = [];
  try {
    const serverKey = (await (await fetch(SYNC_URL + '/v1/remind/key')).json()).key;
    assert.strictEqual(unb64u(serverKey).length, 65, 'an uncompressed P-256 public key');

    const ctx = await browser.newContext({ ...devices['Pixel 7'], timezoneId: 'Asia/Manila' });
    await ctx.grantPermissions(['notifications'], { origin });
    await ctx.route('**/v1/ping', (r) => r.fulfill({ status: 200, body: '{}' }));
    // Headless Chromium has no push service: hand the app a subscription with our keys.
    await ctx.addInitScript(({ sync, sub }) => {
      localStorage.setItem('dg-babylog-sync-url', sync);
      let current = null;
      const make = () => ({ endpoint: sub.endpoint, toJSON: () => sub, unsubscribe: () => { current = null; window.__unsubscribed = true; return Promise.resolve(true); } });
      PushManager.prototype.getSubscription = function () { return Promise.resolve(current); };
      PushManager.prototype.subscribe = function (o) { window.__appKey = btoa(String.fromCharCode(...new Uint8Array(o.applicationServerKey))); current = make(); return Promise.resolve(current); };
    }, { sync: SYNC_URL, sub: subJson });
    // What the app sends; the first reminder is moved to "due now" so the job sends it straight away.
    const sent = [];
    await ctx.route('**/v1/remind', async (route) => {
      const req = route.request();
      if (req.method() !== 'PUT') { sent.push({ method: req.method() }); return route.continue(); }
      const body = JSON.parse(req.postData());
      sent.push({ method: 'PUT', body: JSON.parse(req.postData()) });
      if (body.items.length) body.items[0].at = Date.now() - 1000;
      return route.continue({ postData: JSON.stringify(body) });
    });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base);
    await page.fill('#welcome-form input[name="name"]', 'Miel');
    await page.fill('#welcome-form input[name="birth"]', new Date(Date.now() - 8 * 864e5).toISOString().slice(0, 10));
    await page.click('#welcome-form button[type="submit"]');
    await page.waitForSelector('#app:not([hidden])');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.evaluate(() => {
      BabyStore.get().settings.notify = true;
      BabyStore.addEvent({ type: 'feed', time: Date.now() - 30 * 60e3, data: { kind: 'bottle', amountMl: 60, milk: 'formula' } });
      BabyApp.commit();
    });
    for (let i = 0; i < 40 && !sent.some((s) => s.method === 'PUT'); i++) await page.waitForTimeout(250);
    const put = sent.find((s) => s.method === 'PUT');
    assert.ok(put, 'the app sent its reminders');
    assert.deepStrictEqual(put.body.sub, subJson);
    assert.ok(put.body.items.length >= 1 && put.body.items.every((it) => Number.isInteger(it.at) && /^[A-Za-z0-9_-]+$/.test(it.b)));
    const wire = JSON.stringify(put.body);
    assert.ok(!/Miel|feed|Feed|ml/.test(wire), 'no name or wording on the wire: ' + wire.slice(0, 200));
    assert.strictEqual(await page.evaluate(() => window.__appKey.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')), serverKey, 'subscribed with the server key');
    step('the app sends its reminders: times, and wording encrypted on the phone');

    await page.click('.tab[data-view="settings"]');
    assert.match(await page.textContent('#view-settings'), /On — reminders arrive even when Alaga is closed/);
    assert.ok(await page.isVisible('[data-setting="closedRemind"]') || await page.locator('[data-setting="closedRemind"]').count(), 'the With Alaga closed switch');
    step('Settings says reminders arrive with Alaga closed, with a switch for it');

    // The every-minute job.
    const tick = () => fetch(SYNC_URL + '/__scheduled?cron=*+*+*+*+*');
    await tick();
    for (let i = 0; i < 40 && !got.length; i++) await page.waitForTimeout(250);
    assert.strictEqual(got.length, 1, 'one reminder was due');
    const msg = got[0];
    assert.strictEqual(msg.path, '/push/phone-1');
    assert.strictEqual(msg.headers['content-encoding'], 'aes128gcm');
    assert.ok(+msg.headers.ttl > 0);
    await checkVapid(msg.headers.authorization, serverKey, new URL(endpoint).origin);
    const payload = await decryptPush(msg.body, ua, authSecret);
    assert.strictEqual(payload.b, put.body.items[0].b, 'the push carries the phone-encrypted wording, untouched');
    await tick();
    await page.waitForTimeout(500);
    assert.strictEqual(got.length, 1, 'sent once, not again');
    step('the job sends the due reminder once, encrypted for this browser and VAPID-signed');

    // The service worker gets the push and shows the reminder.
    const cdp = await ctx.newCDPSession(page);
    const regs = [];
    cdp.on('ServiceWorker.workerRegistrationUpdated', (e) => regs.push(...e.registrations));
    await cdp.send('ServiceWorker.enable');
    for (let i = 0; i < 20 && !regs.length; i++) await page.waitForTimeout(100);
    const reg = regs.find((r) => r.scopeURL === base && !r.isDeleted);
    assert.ok(reg, 'service worker registration');
    await cdp.send('ServiceWorker.deliverPushMessage', { origin: origin, registrationId: reg.registrationId, data: JSON.stringify(payload) });
    const shown = async () => page.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).map((n) => ({ title: n.title, body: n.body, tag: n.tag })));
    let notes = [];
    for (let i = 0; i < 40 && !notes.length; i++) { await page.waitForTimeout(150); notes = await shown(); }
    assert.strictEqual(notes.length, 1, 'one notification');
    assert.match(notes[0].title, /^🍼 Feed due/);
    assert.match(notes[0].body, /Miel/);
    step('the service worker decrypts it and shows “' + notes[0].title + '”');

    // A push it can't read still shows something (browsers require it), without details.
    await cdp.send('ServiceWorker.deliverPushMessage', { origin: origin, registrationId: reg.registrationId, data: JSON.stringify({ b: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' }) });
    for (let i = 0; i < 40 && notes.length < 2; i++) { await page.waitForTimeout(150); notes = await shown(); }
    assert.ok(notes.some((n) => n.title === '🔔 Alaga' && /Open Alaga/.test(n.body)));
    step('a push it can’t decrypt shows a plain “open Alaga” reminder');

    // The server refuses strangers and unknown push services.
    const put2 = (auth, sub) => fetch(SYNC_URL + '/v1/remind', { method: 'PUT', headers: { Authorization: 'Bearer ' + auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ sub, items: [] }) }).then((r) => r.status);
    const dev = await page.evaluate(() => JSON.parse(localStorage.getItem('dg-babylog-push')));
    assert.strictEqual(await put2(dev.id + '.' + 'x'.repeat(43), subJson), 403, 'another token for this phone');
    assert.strictEqual(await put2('ab'.repeat(16) + '.' + 'y'.repeat(43), { ...subJson, endpoint: 'https://evil.example/push' }), 400, 'not a push service');
    step('the server refuses other tokens and unknown push services');

    // Notifications off: the server forgets this phone.
    await page.evaluate(() => { BabyStore.get().settings.notify = false; BabyApp.commit(); });
    for (let i = 0; i < 40 && !sent.some((s) => s.method === 'DELETE'); i++) await page.waitForTimeout(250);
    assert.ok(sent.some((s) => s.method === 'DELETE'), 'DELETE sent');
    for (let i = 0; i < 20 && !(await page.evaluate(() => window.__unsubscribed)); i++) await page.waitForTimeout(100);
    assert.ok(await page.evaluate(() => window.__unsubscribed), 'unsubscribed');
    step('notifications off: the server forgets the phone and the subscription ends');

    assert.deepStrictEqual(errors, [], 'no page errors');
    console.log('push e2e passed');
  } finally {
    await browser.close();
    site.close();
    pushSvc.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
