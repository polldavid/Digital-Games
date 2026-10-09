/* Kalinga — prescription PDF import, in the browser (Playwright, phone-sized).
   Uses tests/fixtures/sample-eprescription.pdf (made up; password "sample123").
   pdf.js is served from node_modules instead of cdnjs, so nothing goes online:
     npm i --no-save playwright@1.63.0 pdfjs-dist@3.11.174
     node kalinga/tests/e2e.rximport.js */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { chromium, devices } = require('playwright');

const ROOT = path.join(__dirname, '..');
const PDFJS = path.join(__dirname, '..', '..', 'node_modules', 'pdfjs-dist', 'build');
const FIXTURE = path.join(__dirname, 'fixtures', 'sample-eprescription.pdf');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
function serve() {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, () => resolve(server)));
}

(async () => {
  const server = await serve();
  const base = 'http://localhost:' + server.address().port + '/';
  const browser = await chromium.launch({ headless: !process.env.HEADED });
  const ctx = await browser.newContext({ ...devices['Pixel 7'], timezoneId: 'Asia/Manila', locale: 'en-PH', serviceWorkers: 'block' });
  // The same files cdnjs serves (the app checks their SHA-384, so a wrong copy would fail).
  await ctx.route(/cdnjs\.cloudflare\.com\/ajax\/libs\/pdf\.js\/3\.11\.174\/(pdf(?:\.worker)?\.min\.js)$/, (route, req) => {
    const name = req.url().split('/').pop();
    route.fulfill({ contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(path.join(PDFJS, name)) });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.install({ time: new Date('2026-10-10T09:00:00+08:00') });
  const S = (fn, arg) => page.evaluate(fn, arg);
  const step = (name) => console.log('•', name);
  const tap = (sel) => page.click(sel);

  try {
    await page.goto(base);
    await S(() => localStorage.clear());
    await page.reload();
    await page.fill('#welcome-form input[name=name]', 'Mama');
    await tap('#welcome-form button[type=submit]');
    await tap('[data-action="profile-save"]');
    await tap('[data-action="go"][data-view="meds"]');

    step('a file that is not a PDF is refused');
    await page.setInputFiles('#rx-file', { name: 'photo.pdf', mimeType: 'application/pdf', buffer: Buffer.from('not really a pdf') });
    await page.waitForSelector('#sheet .note--bad');
    assert.match(await page.textContent('#sheet'), /Hindi mabasa/);
    await tap('#sheet [data-action="sheet-close"]');

    step('locked PDF: asks for the password; a wrong one is refused');
    await page.setInputFiles('#rx-file', FIXTURE);
    await page.waitForSelector('#rx-pw-form');
    await page.fill('#rx-pw-form input[name=rxpw]', 'wrong');
    await tap('#rx-pw-form button[type=submit]');
    await page.waitForSelector('#rx-pw-form .field__error');
    assert.match(await page.textContent('#sheet'), /Mali ang password/);
    await page.fill('#rx-pw-form input[name=rxpw]', 'sample123');
    await tap('#rx-pw-form button[type=submit]');

    step('review: every medicine drafted, the unreadable one flagged, nothing saved yet');
    await page.waitForSelector('#sheet [data-action="rx-save"]');
    const review = await page.textContent('#sheet');
    assert.match(review, /Para kay: Juana Dela Cruz/);
    assert.match(review, /Hindi ito mabasa nang sigurado/);
    assert.strictEqual(await page.locator('#sheet .box input[type=checkbox]:checked').count(), 8);
    assert.strictEqual(await S(() => KalingaApp.store.list('meds').length), 0, 'nothing saved before Save');
    assert.match(await page.inputValue('[data-bind="items.0.timesText"]'), /^07:00, 12:00, 19:00$/);
    assert.strictEqual(await page.inputValue('[data-bind="items.0.purpose"]'), 'para sa sugar');

    step('the caregiver edits: Metformin times, and leaves out Esomeprazole');
    await page.fill('[data-bind="items.0.timesText"]', '06:30, 12:00, 18:30');
    const esoIdx = await S(() => KalingaApp.ui.draft.items.findIndex((x) => x.name.indexOf('Esomeprazole') === 0));
    await page.click('[data-bind="items.' + esoIdx + '.on"]');
    assert.match(await page.textContent('#sheet [data-action="rx-save"]'), /I-save ang 7 gamot/);
    await tap('#sheet [data-action="rx-save"]');
    await page.waitForSelector('#sheet', { state: 'hidden' });

    step('saved: names, times, food, as-needed limit, stock and course dates');
    const meds = await S(() => KalingaApp.store.list('meds').map((m) => {
      const s = KalingaApp.store.list('schedules', (x) => x.medId === m.id)[0];
      return { name: m.name, count: m.stock.count, food: m.food, prn: m.prn, times: s ? s.rule.times : null, start: s ? s.rule.start : null, end: s ? s.rule.end : null };
    }));
    assert.strictEqual(meds.length, 7);
    const by = (n) => meds.find((m) => m.name.indexOf(n) === 0);
    assert.deepStrictEqual(by('Metformin'), { name: 'Metformin 500mg', count: 270, food: 'any', prn: null, times: ['06:30', '12:00', '18:30'], start: '2026-10-06', end: '2027-01-03' });
    assert.deepStrictEqual(by('Losartan').times, ['07:00']);
    assert.deepStrictEqual(by('Sitagliptin').food, 'after');
    assert.deepStrictEqual(by('Antacid').prn, { minGapMin: 0, maxPerDay: 3 });
    assert.strictEqual(by('Antacid').times, null, 'as needed: no schedule');
    assert.strictEqual(by('Esomeprazole'), undefined);
    assert.match(await page.textContent('#view'), /Rosuvastatin \+ Ezetimibe/);

    step('importing the same prescription again (through the button): already-listed medicines start unticked');
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), tap('[data-action="rx-import"]')]);
    await chooser.setFiles(FIXTURE);
    await page.fill('#rx-pw-form input[name=rxpw]', 'sample123');
    await tap('#rx-pw-form button[type=submit]');
    await page.waitForSelector('#sheet [data-action="rx-save"]');
    assert.strictEqual(await page.locator('#sheet .box input[type=checkbox]:checked').count(), 1, 'only Esomeprazole is new');
    assert.match(await page.textContent('#sheet'), /Nasa listahan na/);
    await tap('#sheet-close');

    step('profile routine moves the drafted times');
    await tap('[data-action="go"][data-view="more"]');
    await tap('[data-action="profile-open"]');
    await page.fill('#profile-form input[name=r_breakfast]', '06:00');
    await tap('[data-action="profile-save"]');
    assert.strictEqual(await S(() => KalingaApp.store.list('elders')[0].routine.breakfast), '06:00');

    assert.deepStrictEqual(errors, [], 'page errors');
    console.log('e2e.rximport.js ok');
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
