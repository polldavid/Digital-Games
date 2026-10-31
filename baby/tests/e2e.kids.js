/* Alaga — older children: a newborn and a 3½-year-old in one log. Each child
   has their own Today (buttons and sections by age), the potty, Answers by age,
   WHO growth to 5 years, and a doctor summary for a check-up months later.
     node baby/tests/e2e.kids.js        # SHOTS=dir to save screenshots */
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
    await page.goto(base);
    await page.fill('#welcome-form input[name="name"]', 'Miel');
    await page.fill('#welcome-form input[name="birth"]', new Date(Date.now() - 8 * DAY).toISOString().slice(0, 10));
    await page.click('#welcome-form button[type="submit"]');
    await page.waitForSelector('#app:not([hidden])');
    const shot = (n) => (SHOTS ? page.screenshot({ path: path.join(SHOTS, n + '.png'), fullPage: true }) : null);
    const closeSheet = () => page.click('.sheet [data-action="sheet-close"] >> nth=-1');
    const buttons = () => page.$$eval('#view-today .qa-grid .qa__label', (els) => els.map((e) => e.textContent.trim()));
    const titles = () => page.$$eval('#view-today .section-title h2', (els) => els.map((e) => e.textContent.trim()));
    const use = (name) => page.evaluate((n) => { const S = BabyStore; S.get().activeBaby = S.get().babies.find((b) => b.name === n).id; BabyApp.commit(); }, name);

    // A 3½-year-old joins, with a few months of history and a visit in March.
    await page.evaluate(() => {
      const S = BabyStore, D = 864e5, H = 3600e3, now = Date.now();
      const miel = S.get().activeBaby;
      const bea = S.addBaby({ name: 'Bea', birth: new Date(now - 1278 * D).toISOString().slice(0, 10), feeding: 'formula' });
      S.updateBaby(bea.id, { sex: 'f' });
      S.health(bea.id).appointments.push({ id: 'v1', title: 'Check-up', at: now - 150 * D, done: true, outcome: 'Healthy. Come back in 6 months.' });
      S.addEvent({ baby: bea.id, type: 'growth', time: now - 150 * D, data: { weightKg: 14.2, lengthCm: 96 } });
      S.addEvent({ baby: bea.id, type: 'growth', time: now - 2 * D, data: { weightKg: 15, lengthCm: 100 } });
      [[60, 38.6], [59, 39.2], [58, 38.1]].forEach(([d, t]) => S.addEvent({ baby: bea.id, type: 'temp', time: now - d * D, data: { tempC: t, method: 'armpit' } }));
      S.addEvent({ baby: bea.id, type: 'med', time: now - 59 * D, data: { medId: 'acetaminophen', name: 'Paracetamol', dose: '7.5 ml' } });
      S.addEvent({ baby: bea.id, type: 'milestone', time: now - 30 * D, data: { text: 'Hops on one foot' } });
      S.addEvent({ baby: bea.id, type: 'feed', time: now - 3 * H, data: { kind: 'solids', food: 'rice and chicken' } });
      S.get().activeBaby = miel; BabyApp.commit();
    });

    step('a newborn keeps the baby Today: feed, diaper, pump; feeds and diapers checked');
    assert.deepStrictEqual((await buttons()).slice(0, 3), ['Feed', 'Diaper', 'Sleep']);
    assert.ok((await buttons()).includes('Pump'));
    assert.ok(await page.isVisible('#view-today .cry-cta'), 'crying shortcut for a baby');
    assert.ok(await page.isVisible('#view-today .check__k:has-text("Wet diapers")'));

    step('Bea (3½): meals, potty, sleep, medicine; no feed, pump or crying shortcut');
    await use('Bea');
    await page.waitForTimeout(200);
    const bb = await buttons();
    assert.deepStrictEqual(bb.slice(0, 3), ['Meal', 'Potty', 'Sleep'], bb.join());
    assert.ok(!bb.includes('Pump') && !bb.includes('Feed') && !bb.includes('Diaper'), bb.join());
    assert.ok(!(await page.isVisible('#view-today .cry-cta')), 'no crying shortcut at 3½');
    const ks = await page.$$eval('#view-today .check__k', (els) => els.map((e) => e.textContent.trim()));
    assert.ok(ks.includes('Meals and snacks') && ks.includes('Sleep') && !ks.includes('Wet diapers') && !ks.includes('Feeds'), ks.join());
    assert.match(await page.textContent('#view-today .checks'), /10–13h/, '3–5 years: 10–13 hours of sleep');
    assert.match(await page.textContent('#view-today .tiles'), /Last meal/);
    assert.match(await page.textContent('#view-today .tiles'), /rice and chicken/);
    await shot('k1-today-bea');

    step('changing Bea’s buttons leaves Miel’s alone');
    await page.click('#view-today [data-action="log-more"]');
    await page.click('.sheet [data-action="quick-edit"]');
    await page.click('.sheet input[data-action-change="quick-toggle"][data-id="note"]');
    await page.click('.sheet [data-action="sheet-close"] >> nth=-1');
    await page.waitForTimeout(200);
    await page.keyboard.press('Escape').catch(() => {});
    await page.evaluate(() => { document.querySelectorAll('.sheet').forEach(() => BabyApp.h.closeSheet()); });
    assert.ok(!(await buttons()).includes('Note'), 'Note removed for Bea');
    await use('Miel');
    assert.deepStrictEqual((await buttons()).slice(0, 3), ['Feed', 'Diaper', 'Sleep'], 'Miel unchanged');
    await use('Bea');

    step('the Potty button records a potty trip; History shows it');
    await page.click('#view-today .qa[data-type="potty"]');
    await page.waitForSelector('#sheet-form input[name="where"][value="potty"]:checked', { state: 'attached' });
    assert.ok(!(await page.isVisible('#sheet-form [data-rash]')), 'no diaper-rash box for the potty');
    await page.click('#sheet-form label:has(input[name="what"][value="both"])');
    await page.click('#sheet-form button[type="submit"]');
    await page.waitForTimeout(300);
    const last = await page.evaluate(() => { const e = BabyStore.last('diaper'); return { where: e.data.where, wet: e.data.wet, dirty: e.data.dirty, title: BabyApp.h.describe(e).title }; });
    assert.deepStrictEqual(last, { where: 'potty', wet: true, dirty: true, title: 'Potty · pee + poop' });
    assert.match(await page.textContent('#view-today .tiles'), /Potty/);

    step('no feed or nap reminders for a 3-year-old');
    await page.evaluate(() => { const S = BabyStore; S.addEvent({ type: 'feed', time: Date.now() - 6 * 3600e3, data: { kind: 'bottle', amountMl: 200 } }); S.addEvent({ type: 'sleep', time: Date.now() - 12 * 3600e3, end: Date.now() - 2 * 3600e3, data: {} }); BabyApp.commit(); });
    const kinds = await page.evaluate(() => BabyStore.reminders(Date.now()).map((r) => r.kind));
    assert.ok(!kinds.includes('feed') && !kinds.includes('nap'), kinds.join());

    step('Answers fit her age: potty, tantrums, picky eating; no newborn topics');
    await page.click('.tab[data-view="help"]');
    const qs = await page.$$eval('#view-help .qcard', (els) => els.map((e) => e.getAttribute('data-topic')));
    assert.ok(qs.includes('potty') && qs.includes('tantrum') && qs.includes('eating') && qs.includes('sick'), qs.join());
    assert.ok(!qs.includes('cry') && !qs.includes('spit') && !qs.includes('enough'), qs.join());
    for (const t of ['potty', 'tantrum', 'eating', 'sick', 'sleep', 'milestones', 'fever']) {
      await page.click('#view-help .qcard[data-topic="' + t + '"]');
      await page.waitForSelector('.sheet .form');
      if (t === 'sleep') assert.match(await page.textContent('.sheet'), /10–13 hours/);
      if (t === 'milestones') assert.match(await page.textContent('.sheet'), /By 3½ years|By 4 years/);
      if (t === 'potty') { await shot('k2-potty'); assert.match(await page.textContent('.sheet'), /On the potty/); }
      await closeSheet(); await page.waitForTimeout(150);
    }

    step('growth: WHO percentiles at 3½ years, height not length');
    await page.click('.tab[data-view="log"]');
    await page.click('[data-action="hist-mode"][data-mode="trends"]');
    const g = await page.textContent('.chart:has-text("Growth")');
    assert.match(g, /percentile/, 'percentiles past 2 years');
    assert.match(g, /Height/);
    await page.click('[data-action="growth-kind"][data-kind="lfa"]');
    await page.evaluate(() => [...document.querySelectorAll('.chart')].find((c) => /Growth/.test(c.textContent)).scrollIntoView());
    await shot('k3-growth');

    step('summary for the doctor: since the last visit, with growth, the fever and the milestone');
    await page.click('.tab[data-view="health"]');
    await page.click('[data-action="visit-summary"] >> nth=0');
    let txt = await page.textContent('.sheet pre');
    assert.match(txt, /Covers the 5 months since the visit on/);
    assert.ok(!/Daily averages/.test(txt), 'no empty averages heading');
    assert.match(txt, /Growth \(WHO percentile\)/);
    assert.match(txt, /14\.2 kg \(\d+(st|nd|rd|th)\) · 96 cm/);
    assert.match(txt, /Fever .*up to 39\.2 °C; gave Paracetamol ×1/);
    assert.match(txt, /Hops on one foot/);
    assert.match(txt, /Visit .*Check-up — Healthy/, 'the visit itself is included');
    await shot('k4-summary');
    await page.click('.sheet [data-action="summary-range"][data-range="7"]');
    txt = await page.textContent('.sheet pre');
    assert.match(txt, /Covers the last 7 days/);
    assert.ok(!/Fever/.test(txt), 'the fever was two months ago');
    await closeSheet();

    step('vaccines: an older child’s earlier vaccines in one tap');
    await page.evaluate(() => { BabyStore.health().vaccines.schedule = 'ph'; BabyApp.commit(); });
    await page.evaluate(() => BabyHealth.vaxSheet());
    await page.click('.sheet [data-action="vax-catchup"]');
    await page.waitForTimeout(200);
    const left = await page.evaluate(() => BabyHealth.plan(Date.now()).filter((v) => v.status === 'overdue').length);
    assert.strictEqual(left, 0);
    assert.ok(await page.isVisible('.sheet .status:has-text("Given")'));

    assert.deepStrictEqual(errors, []);
    console.log('kids e2e passed');
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
