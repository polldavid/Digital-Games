/* Alaga — the full-size photo viewer opens on top of a form (prescription
   review, documents) and closing it — ✕, Back or Escape — returns to the form
   with everything typed still there. Pinch and double-tap zoom.
     node baby/tests/e2e.photo.js        # SHOTS=dir to save screenshots */
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { chromium, devices } = require('playwright');

const ROOT = path.join(__dirname, '..', '..');
const SHOTS = process.env.SHOTS || '';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const step = (t) => console.log('• ' + t);
const DAY = 864e5;

(async () => {
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
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
    await ctx.route('https://cdn.jsdelivr.net/**', (r) => r.abort()); // no OCR here: the review form shows anyway
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base);
    await page.fill('#welcome-form input[name="name"]', 'Miel');
    await page.fill('#welcome-form input[name="birth"]', new Date(Date.now() - 12 * DAY).toISOString().slice(0, 10));
    await page.click('#welcome-form button[type="submit"]');
    await page.waitForSelector('#app:not([hidden])');
    const shot = (n) => (SHOTS ? page.screenshot({ path: path.join(SHOTS, n + '.png') }) : null);
    const viewerOpen = () => page.evaluate(() => !!document.querySelector('.viewer:not([hidden])'));
    const scale = () => page.evaluate(() => { const m = /scale\(([\d.]+)\)/.exec(document.querySelector('.viewer__img').style.transform); return m ? +m[1] : 1; });

    // A prescription photo goes through the scan; type a medicine name in the review.
    await page.evaluate(() => new Promise((res) => {
      const c = document.createElement('canvas'); c.width = 800; c.height = 1000;
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 800, 1000); g.fillStyle = '#000'; g.font = '48px sans-serif'; g.fillText('Paracetamol 120mg/5ml', 40, 120);
      c.toBlob((b) => { BabyHealth.gotPhoto(new File([b], 'rx.png', { type: 'image/png' })); res(); }, 'image/png');
    }));
    await page.waitForSelector('#scan-form input[name="0:name"]');
    await page.fill('#scan-form input[name="0:name"]', 'Paracetamol drops');
    step('scan review form is up and a medicine name is typed');

    // Open the photo: viewer on top, the form still underneath.
    await page.click('#sheet .photo-btn');
    await page.waitForSelector('.viewer:not([hidden]) .viewer__img[src]');
    assert.ok(await page.isVisible('#scan-form'), 'scan form still there under the photo');
    await shot('p1-viewer');
    step('tapping the photo opens it on top of the form');

    // Close with ✕: back on the form, typing kept.
    await page.click('.viewer [data-viewer-close]');
    assert.strictEqual(await viewerOpen(), false);
    assert.strictEqual(await page.inputValue('#scan-form input[name="0:name"]'), 'Paracetamol drops');
    assert.strictEqual(await page.textContent('#sheet-title'), 'Check the prescription');
    step('✕ closes only the photo; the medicine name is still typed');

    // Close with Back: same.
    await page.click('#sheet .photo-btn');
    await page.waitForSelector('.viewer:not([hidden])');
    await page.goBack();
    await page.waitForFunction(() => !document.querySelector('.viewer:not([hidden])'));
    assert.ok(await page.isVisible('#scan-form'), 'Back closed only the photo');
    assert.strictEqual(await page.inputValue('#scan-form input[name="0:name"]'), 'Paracetamol drops');
    step('Back closes only the photo');

    // A second Back closes the form as before.
    await page.goBack();
    await page.waitForSelector('#sheet', { state: 'hidden' });
    step('a second Back closes the prescription sheet');

    // Escape on a document's photo: closes the photo, not the document.
    await page.evaluate(() => new Promise((res) => {
      const c = document.createElement('canvas'); c.width = 600; c.height = 400; c.getContext('2d').fillRect(0, 0, 300, 200);
      c.toBlob((b) => BabyFiles.put('ph_test', b).then(() => { BabyHealth.docSheet(); res(); }), 'image/png');
    }));
    await page.waitForSelector('#doc-form');
    await page.evaluate(() => {
      const form = document.getElementById('doc-form');
      form.elements.photoId.value = 'ph_test';
      const w = document.createElement('div'); w.className = 'photo-wrap';
      w.innerHTML = '<button type="button" class="photo-btn" data-action="photo-view" data-id="ph_test"><img class="photo" data-photo="ph_test" alt="" /></button>';
      form.insertBefore(w, form.firstChild); BabyFiles.hydrate(form);
    });
    await page.fill('#doc-form input[name="title"]', 'CBC result');
    await page.click('#doc-form .photo-btn');
    await page.waitForSelector('.viewer:not([hidden]) .viewer__img[src]');
    await page.keyboard.press('Escape');
    assert.strictEqual(await viewerOpen(), false);
    assert.strictEqual(await page.inputValue('#doc-form input[name="title"]'), 'CBC result');
    step('Escape closes only the photo on a document too');

    // Pinch to zoom, then double-tap to reset.
    await page.click('#doc-form .photo-btn');
    await page.waitForSelector('.viewer:not([hidden]) .viewer__img[src]');
    await page.evaluate(() => {
      const st = document.querySelector('.viewer__stage'), r = st.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const ev = (type, id, x, y) => st.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, isPrimary: id === 1 }));
      ev('pointerdown', 1, cx - 40, cy); ev('pointerdown', 2, cx + 40, cy);
      for (let i = 1; i <= 10; i++) { ev('pointermove', 1, cx - 40 - i * 8, cy); ev('pointermove', 2, cx + 40 + i * 8, cy); }
      ev('pointerup', 1, cx - 120, cy); ev('pointerup', 2, cx + 120, cy);
    });
    const zoomed = await scale();
    assert.ok(zoomed > 2.5 && zoomed < 3.5, 'pinching 80px → 240px zooms about 3×, got ' + zoomed);
    await shot('p2-zoomed');
    step('pinch zooms in (about 3×)');
    await page.evaluate(() => {
      const st = document.querySelector('.viewer__stage'), r = st.getBoundingClientRect(), x = r.left + 100, y = r.top + 100;
      const ev = (type) => st.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, isPrimary: true }));
      ev('pointerdown'); ev('pointerup'); ev('pointerdown'); ev('pointerup');
    });
    assert.strictEqual(await scale(), 1, 'double-tap when zoomed resets');
    await page.evaluate(() => {
      const st = document.querySelector('.viewer__stage'), r = st.getBoundingClientRect(), x = r.left + 100, y = r.top + 100;
      const ev = (type) => st.dispatchEvent(new PointerEvent(type, { pointerId: 8, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, isPrimary: true }));
      ev('pointerdown'); ev('pointerup'); ev('pointerdown'); ev('pointerup');
    });
    assert.ok((await scale()) > 1.5, 'double-tap at 1× zooms in');
    step('double-tap zooms in, and back out');
    await page.click('.viewer [data-viewer-close]');
    assert.strictEqual(await page.inputValue('#doc-form input[name="title"]'), 'CBC result');

    assert.deepStrictEqual(errors, []);
    console.log('\nAll photo viewer checks passed.');
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
