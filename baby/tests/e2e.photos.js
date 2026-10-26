/* Alaga — photos shared between two phones (sync.js Photos → server/photos.js,
   R2), plus the photo features: a diaper photo for the doctor and a medicine
   bottle photo shown when a dose is logged.
   Needs the local sync server (run-all.js starts it; R2 is simulated locally).
     SYNC_URL=http://127.0.0.1:8787 node baby/tests/e2e.photos.js   # SHOTS=dir for screenshots */
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { chromium, devices } = require('playwright');

const ROOT = path.join(__dirname, '..', '..');
const SYNC_URL = process.env.SYNC_URL || 'http://127.0.0.1:8787';
const SHOTS = process.env.SHOTS || '';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
const step = (t) => console.log('• ' + t);

async function phone(browser, device, base, errors) {
  const ctx = await browser.newContext({ ...devices[device], timezoneId: 'Asia/Manila' });
  await ctx.addInitScript((url) => { try { localStorage.setItem('dg-babylog-sync-url', url); } catch (e) {} }, SYNC_URL);
  await ctx.route('**/v1/ping', (r) => r.fulfill({ status: 200, body: '{}' }));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(device + ': ' + e.message));
  await page.goto(base);
  return page;
}
const until = async (page, fn, arg, what) => {
  for (let i = 0; i < 80; i++) { if (await page.evaluate(fn, arg)) return; await page.waitForTimeout(250); }
  throw new Error('timed out: ' + what);
};
// The bytes of a photo on a phone, as a hex string.
const photoHex = (page, id) => page.evaluate((i) => BabyFiles.get(i).then((b) => b ? b.arrayBuffer().then((a) => Array.from(new Uint8Array(a)).map((x) => x.toString(16).padStart(2, '0')).join('')) : null), id);

(async () => {
  try { await fetch(SYNC_URL + '/'); } catch (e) { console.error('No sync server at ' + SYNC_URL + ' — run  node baby/tests/run-all.js photos'); process.exit(1); }
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
  const shot = (page, n) => (SHOTS ? page.screenshot({ path: path.join(SHOTS, n + '.png'), fullPage: true }) : null);
  try {
    const A = await phone(browser, 'Pixel 7', base, errors);
    await A.fill('#welcome-form input[name="name"]', 'Ava');
    await A.fill('#welcome-form input[name="birth"]', new Date(Date.now() - 20 * 864e5).toISOString().slice(0, 10));
    await A.click('#welcome-form button[type="submit"]');
    await A.waitForSelector('#app:not([hidden])');
    // A picture to "take": a small yellow square, made by the browser.
    const png = Buffer.from(await A.evaluate(() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#c9a227'; g.fillRect(0, 0, 64, 64); return c.toDataURL('image/png').split(',')[1]; }), 'base64');
    const pick = async (page, sel) => {
      const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click(sel)]);
      await chooser.setFiles({ name: 'photo.png', mimeType: 'image/png', buffer: png });
    };

    // A logs a dirty diaper with a photo.
    await A.evaluate(() => BabyForms.open('diaper'));
    await A.click('#sheet-form input[name="what"][value="dirty"]', { force: true });
    await A.click('[data-action="poop-color"][data-color="yellow"]');
    await pick(A, '[data-photo-for="photo"] [data-action="form-photo"]:not([data-capture])');
    await A.waitForSelector('[data-photo-for="photo"] img.photofield__img[src]');
    await shot(A, 'p1-diaper-form');
    await A.click('#sheet-form button[type="submit"]');
    const diaper = await A.evaluate(() => BabyStore.events({ type: 'diaper' })[0]);
    assert.match(diaper.data.photo || '', /^ph_/, 'the entry keeps its photo');
    await A.waitForSelector('#view-today .row__thumb[src]');
    step('a dirty diaper saved with a photo; its row shows a thumbnail');

    // A adds a medicine with a photo of the bottle.
    await A.evaluate(() => BabyHealth.rxSheet());
    await A.fill('#rx-form input[name="name"]', 'Amoxicillin');
    await pick(A, '[data-photo-for="bottlePhotoId"] [data-action="form-photo"]:not([data-capture])');
    await A.waitForSelector('[data-photo-for="bottlePhotoId"] img[src]');
    await A.click('#rx-form button[type="submit"]');
    const rx = await A.evaluate(() => BabyStore.health().rx[0]);
    assert.match(rx.bottlePhotoId || '', /^ph_/);
    step('a medicine saved with a photo of its bottle');

    // Photo sync is parked (js/share.js PHOTO_SYNC): check it stays off, and stop here.
    if (!(await A.evaluate(() => BabyShare.photoSync))) {
      await A.evaluate((id) => BabyForms.open('med', null, { rxId: id }), rx.id);
      await A.waitForSelector('#med-bottle img.medbottle__img[src]');
      await A.click('.sheet [data-action="sheet-close"] >> nth=-1');
      await A.click('.tab[data-view="health"]');
      await A.waitForSelector('#view-health .doc img[src]');
      const puts = [];
      A.on('request', (r) => { if (/\/v1\/photo/.test(r.url())) puts.push(r.url()); });
      await A.evaluate(() => BabyShare.client.create('Poll’s phone'));
      await A.waitForTimeout(1500);
      assert.deepStrictEqual(puts, [], 'no photo leaves the phone while photo sync is parked');
      await A.click('.tab[data-view="settings"]');
      assert.strictEqual(await A.locator('[data-setting="sharePhotos"]').count(), 0, 'no Share photos switch');
      assert.match(await A.textContent('#set-share + .card'), /Photos stay on the phone that took them/);
      step('photo sync parked: the dose form shows the bottle, Health shows diaper photos, nothing is uploaded');
      assert.deepStrictEqual(errors, [], 'no page errors');
      console.log('photos e2e passed (photo sync parked)');
      return;
    }

    // Sharing on: the photos go up encrypted, under names that say nothing.
    const uploads = [];
    A.on('request', (r) => { if (/\/v1\/photo\?k=/.test(r.url()) && r.method() === 'PUT') uploads.push({ url: r.url(), body: r.postDataBuffer() }); });
    await A.evaluate(() => BabyShare.client.create('Poll’s phone'));
    await until(A, (ids) => ids.every((id) => (BabyShare.client.meta().photos || {})[id]), [diaper.data.photo, rx.bottlePhotoId], 'A uploads both photos');
    assert.strictEqual(uploads.length, 2);
    uploads.forEach((u) => {
      assert.ok(!(u.body[0] === 0xff && u.body[1] === 0xd8) && !u.body.slice(1, 4).equals(Buffer.from('PNG')), 'not a readable image');
      assert.ok(!/ph_/.test(u.url), 'the name doesn’t give away the photo id');
    });
    step('sharing on: both photos are uploaded encrypted, under hashed names');

    // B joins and gets the same photos.
    const secret = await A.evaluate(() => BabyShare.client.secret());
    const B = await phone(browser, 'iPhone 13', base, errors);
    await B.evaluate((s) => BabyShare.client.join(s, 'Sam’s phone').then(() => BabyShare.client.finishJoin()).then(() => BabyApp.render()), secret);
    await until(B, () => BabyStore.events({ type: 'diaper' }).length === 1, null, 'B has the diaper entry');
    await until(B, (ids) => Promise.all(ids.map((i) => BabyFiles.get(i))).then((bs) => bs.every(Boolean)), [diaper.data.photo, rx.bottlePhotoId], 'B fetches both photos');
    assert.strictEqual(await photoHex(B, diaper.data.photo), await photoHex(A, diaper.data.photo), 'the diaper photo, byte for byte');
    assert.strictEqual(await photoHex(B, rx.bottlePhotoId), await photoHex(A, rx.bottlePhotoId), 'the bottle photo, byte for byte');
    await B.evaluate(() => BabyApp.render());
    await B.waitForSelector('#view-today .row__thumb[src]');
    step('B joins: both photos arrive and match; the diaper row shows the photo');

    // B: Health lists the diaper photo for the doctor; the dose form shows the bottle.
    await B.click('.tab[data-view="health"]');
    await B.waitForSelector('#view-health h2:text("Diaper photos")');
    await B.waitForSelector('#view-health .doc img[src]');
    await shot(B, 'p2-health-gallery');
    await B.evaluate((id) => BabyForms.open('med', null, { rxId: id }), rx.id);
    await B.waitForSelector('#med-bottle img.medbottle__img[src]');
    assert.match(await B.textContent('#med-bottle'), /Check it’s this bottle/);
    await shot(B, 'p3-dose-bottle');
    await B.click('.sheet [data-action="sheet-close"] >> nth=-1');
    step('B: Health → Diaper photos, and the dose form shows the bottle to check');

    // Settings: the switch, and nothing left to sync.
    await B.click('.tab[data-view="settings"]');
    assert.strictEqual(await B.locator('[data-setting="sharePhotos"]').count(), 1);
    assert.doesNotMatch(await B.textContent('#set-share + .card'), /still to sync/);
    step('Settings: “Share photos from this phone”, nothing left to sync');

    // A deletes the diaper entry: the photo is deleted on the server (kept 30 days in the trash).
    const deletes = [];
    A.on('request', (r) => { if (/\/v1\/photo\?k=/.test(r.url()) && r.method() === 'DELETE') deletes.push(r.url()); });
    await A.evaluate((id) => { BabyStore.removeEvent(id); BabyStore.noteDeletes && BabyStore.noteDeletes(1); BabyApp.commit(); }, diaper.id);
    await until(A, (id) => !(BabyShare.client.meta().photos || {})[id], diaper.data.photo, 'A deletes the photo on the server');
    assert.strictEqual(deletes.length, 1);
    await B.evaluate(() => BabyShare.client.cycle());
    await until(B, () => BabyStore.events({ type: 'diaper' }).length === 0, null, 'the entry is gone on B');
    step('deleting the entry deletes its photo on the server too');

    // Undo on A brings the entry back: the photo goes up again, out of the trash.
    await A.evaluate((d) => { BabyStore.addEvent(d); BabyApp.commit(); }, diaper);
    await until(A, (id) => (BabyShare.client.meta().photos || {})[id], diaper.data.photo, 'A re-uploads after Undo');
    step('Undo: the photo is shared again');

    assert.deepStrictEqual(errors, [], 'no page errors');
    console.log('photos e2e passed');
  } finally {
    await browser.close();
    site.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
