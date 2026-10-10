/* Kalinga — UX features in the browser (Playwright, phone-sized, fake clock):
   add-medicine chooser, setup checklist, medicines grouped by time of day,
   tap a medicine to open it, quick refill, pill-photo run-through, elder text
   size, and undoing an as-needed dose.
     node kalinga/tests/e2e.ux.js */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { chromium, devices } = require('playwright');

const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
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
  const browser = await chromium.launch({ headless: !process.env.HEADED, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const ctx = await browser.newContext({ ...devices['Pixel 7'], timezoneId: 'Asia/Manila', locale: 'en-PH', serviceWorkers: 'block', permissions: ['microphone'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.install({ time: new Date('2026-10-10T07:00:00+08:00') });
  const S = (fn, arg) => page.evaluate(fn, arg);
  const step = (name) => console.log('•', name);
  const tap = (sel) => page.click(sel);
  const setup = () => page.textContent('.setup .badge');

  try {
    await page.goto(base);
    await S(() => localStorage.clear());
    await page.reload();
    await page.fill('#welcome-form input[name=name]', 'Papa');
    await tap('#welcome-form button[type=submit]');
    await tap('[data-action="profile-save"]');

    step('setup checklist: nothing ticked by just saving the welcome profile; routine first');
    await page.waitForSelector('.setup');
    assert.strictEqual(await setup(), '0 / 7');
    assert.match(await page.textContent('.setup__step--next'), /Oras ng kain at tulog/);
    await tap('.setup [data-action="profile-open"]');
    await tap('[data-action="profile-save"]');
    assert.strictEqual(await setup(), '1 / 7', 'saving the routine from the checklist ticks it');
    assert.match(await page.textContent('.setup__step--next'), /Mga gamot/);

    step('one "Add medicine" button opens the chooser (PDF, type it in, photo soon)');
    await tap('#view [data-action="med-add"]');
    const chooser = await page.textContent('#sheet');
    assert.match(chooser, /Mula sa e-prescription \(PDF\)/);
    assert.match(chooser, /I-type nang mano-mano/);
    assert.match(chooser, /Paparating/);
    await tap('#sheet [data-action="med-new"]');
    await page.fill('#med-form input[name=name]', 'Losartan 50mg');
    await tap('[data-action="time-add"][data-value="20:00"]');
    await page.fill('#med-form input[name=count]', '10');
    await tap('[data-action="med-save"]');
    await page.waitForSelector('#sheet', { state: 'hidden' });
    await S(() => { const st = KalingaApp.store, el = st.list('elders')[0]; st.saveMed({ elderId: el.id, name: 'Paracetamol 500mg', form: 'tablet', dose: { amount: 1, unit: 'tablet' }, prn: { minGapMin: 240, maxPerDay: 4 }, stock: { count: 10 } }); KalingaApp.commit(); });
    assert.strictEqual(await setup(), '2 / 7');

    step('medicines grouped by time of day; weekly and late-night doses are clear');
    await S(() => { const st = KalingaApp.store, el = st.list('elders')[0];
      const w = st.saveMed({ elderId: el.id, name: 'Methotrexate 2.5mg', form: 'tablet', dose: { amount: 4, unit: 'tablet' } }).med;
      st.saveSchedule({ medId: w.id, rule: { times: ['08:00'], weekdays: [1], everyN: 0, start: '2026-10-10', end: '', prn: false } });
      const n = st.saveMed({ elderId: el.id, name: 'Night med', form: 'tablet', dose: { amount: 1, unit: 'tablet' } }).med;
      st.saveSchedule({ medId: n.id, rule: { times: ['02:00'], weekdays: [], everyN: 2, start: '2026-10-10', end: '2026-10-20', prn: false } });
      KalingaApp.commit(); });
    await tap('[data-action="go"][data-view="meds"]');
    const titles = await page.$$eval('#view .section-title', (n) => n.map((x) => x.textContent));
    assert.deepStrictEqual(titles, ['Umaga', 'Gabi', 'Hatinggabi / madaling-araw', 'Kung kailangan lang'], 'late-night doses get their own group, after evening');
    const meds = await page.textContent('#view');
    assert.match(meds, /8:00 PM Losartan 50mg/);
    assert.match(meds, /Methotrexate 2\.5mg[\s\S]*Lun/, 'a weekly medicine shows its day');
    assert.match(meds, /Night med[\s\S]*Tuwing ilang araw: 2[\s\S]*2026-10-20/, 'every-N and the end date show');
    await S(() => { const st = KalingaApp.store; st.list('meds').filter((m) => /Methotrexate|Night med/.test(m.name)).forEach((m) => { st.list('schedules', (x) => x.medId === m.id).forEach((x) => st.remove('schedules', x.id)); st.remove('meds', m.id); }); KalingaApp.commit(); });

    step('a dose due before the medicine was added: "before setup", folded, never "not confirmed"');
    await S(() => { const st = KalingaApp.store, el = st.list('elders')[0]; const m = st.saveMed({ elderId: el.id, name: 'Early med', form: 'tablet', dose: { amount: 1, unit: 'tablet' } }).med; st.saveSchedule({ medId: m.id, rule: { times: ['05:30'], weekdays: [], everyN: 0, start: '2026-10-10', end: '', prn: false } }); KalingaApp.commit(); });
    await tap('[data-action="go"][data-view="today"]');
    const dash = await page.textContent('#view');
    assert.match(dash, /Mas maaga ngayong araw · 1 bago na-set up/);
    assert.doesNotMatch(dash, /Walang kumpirmasyon/);
    await S(() => { const st = KalingaApp.store, m = st.list('meds').find((x) => x.name === 'Early med'); st.list('schedules', (x) => x.medId === m.id).forEach((x) => st.remove('schedules', x.id)); st.remove('meds', m.id); KalingaApp.commit(); });

    step('tap a medicine on the dashboard to open it');
    await tap('[data-action="go"][data-view="today"]');
    await tap('#view .slot__item[data-action="med-edit"]');
    await page.waitForSelector('#med-form');
    assert.strictEqual(await page.inputValue('#med-form input[name=name]'), 'Losartan 50mg');
    await tap('#sheet-close');

    step('quick refill from the low-stock warning');
    await tap('#view [data-action="refill"]');
    await tap('#sheet [data-action="refill-add"][data-value="30"]');
    await page.waitForSelector('#sheet', { state: 'hidden' });
    assert.strictEqual(await S(() => KalingaApp.store.list('meds').find((m) => m.name.indexOf('Losartan') === 0).stock.count), 40);

    step('pill photos: one tap per medicine, saved straight away');
    await tap('[data-action="go"][data-view="meds"]');
    await tap('#view [data-action="photo-run"]');
    await page.setInputFiles('#sheet input[data-action-change="med-photo-direct"] >> nth=0', { name: 'pill.png', mimeType: 'image/png', buffer: PNG });
    await page.waitForFunction(() => KalingaApp.store.list('meds').some((m) => m.photoId));
    await tap('#sheet [data-action="photo-skip"]');
    await page.waitForSelector('#sheet', { state: 'hidden' });

    step('checklist: vitals, test alarm, then hand over');
    await S(() => { const st = KalingaApp.store, el = st.list('elders')[0]; st.add('vitalTypes', Object.assign(KalingaVitals.template('sugar'), { elderId: el.id })); KalingaApp.commit(); });
    await tap('[data-action="go"][data-view="today"]');
    assert.strictEqual(await setup(), '4 / 7');
    step('voice: one recording per part of the day, from the checklist; played when that time rings');
    await tap('.setup [data-action="voice-run"]');
    assert.deepStrictEqual(await page.$$eval('#sheet .voice-part__title', (n) => n.map((x) => x.textContent.trim().replace(/^\S+\s/, ''))), ['Umaga', 'Gabi'], 'only the parts of the day that have medicines');
    await tap('#sheet [data-action="voice-rec"][data-value="morning"]');
    await page.waitForSelector('#sheet [data-action="voice-stop"]');
    await page.waitForTimeout(400);
    await tap('#sheet [data-action="voice-stop"]');
    await page.waitForFunction(() => { const e = KalingaApp.store.list('elders')[0]; return e.voice && e.voice.morning; });
    assert.ok(await page.$('#sheet [data-action="voice-play"][data-value="morning"]'), 'can listen to it');
    await tap('#sheet [data-action="sheet-close"].btn');
    assert.strictEqual(await setup(), '5 / 7');
    const clip = await S(() => KalingaApp.store.list('elders')[0].voice.morning);
    const played = await S(() => {
      KalingaElder.openDose(KalingaApp.store.timeline(KalingaApp.store.list('elders')[0].id, new Date(2026, 9, 10).getTime(), new Date(2026, 9, 11).getTime(), Date.now()).find((x) => new Date(x.at).getHours() < 11).slotKey, false);
      const calls = [], real = KalingaVoice.play; KalingaVoice.play = (id) => { calls.push(id); return Promise.resolve(); };
      document.querySelector('#dose [data-action="dose-speak"]').click(); // same playback as the alarm
      KalingaVoice.play = real; KalingaElder.closeDose(); return calls; });
    assert.deepStrictEqual(played, [clip], 'the morning alarm plays the morning recording');
    step('the alarm: beeps; the recording between beeps; the phone voice only when chosen');
    const ring = async () => {
      await S(() => {
        window.__calls = []; window.__rp = KalingaVoice.play; window.__rs = KalingaVoice.say;
        KalingaVoice.play = (id, o) => { __calls.push('play'); setTimeout(() => o && o.onend && o.onend(), 10); return Promise.resolve(); };
        KalingaVoice.say = (tx, o) => { __calls.push('say'); setTimeout(() => o && o.onend && o.onend(), 10); };
        const n0 = KalingaReminders.alarmCount();
        KalingaElder.openDose(KalingaApp.store.timeline(KalingaApp.store.list('elders')[0].id, new Date(2026, 9, 10).getTime(), new Date(2026, 9, 11).getTime(), Date.now()).find((x) => new Date(x.at).getHours() < 11).slotKey, true);
        if (KalingaReminders.alarmCount() !== n0 + 1) throw new Error('did not ring');
      });
      await page.clock.runFor(2500);
      return S(() => { KalingaElder.closeDose(); KalingaVoice.play = __rp; KalingaVoice.say = __rs; return __calls; });
    };
    const setVoice = (v, av) => S(([v, av]) => { const st = KalingaApp.store, el = st.list('elders')[0]; st.update('elders', el.id, { voice: v }, ''); st.get().settings.alarmVoice = av; KalingaApp.commit(); }, [v, av]);
    assert.deepStrictEqual(await ring(), ['play'], 'with a recording: the recording, no phone voice');
    await setVoice({}, undefined);
    assert.deepStrictEqual(await ring(), [], 'default: the alarm sound only');
    await setVoice({}, 'tts');
    assert.deepStrictEqual(await ring(), ['say'], 'phone voice only when turned on');
    await setVoice({ morning: clip }, undefined);
    await tap('.setup [data-action="test-alarm"]');
    await page.clock.runFor(61000);
    await page.waitForSelector('#sheet:not([hidden])');
    await tap('#sheet .el-btn[data-action="sheet-close"]');
    assert.strictEqual(await setup(), '6 / 7');
    assert.ok(await page.$('.setup .setup__step--next[data-action="handover"]'), 'only the hand-over is left');

    step('elder text size: Pinakamalaki, and nothing scrolls sideways at 320px');
    await tap('[data-action="go"][data-view="more"]');
    await page.click('input[name=textSize][value=xlarge] + span');
    await tap('#handover-btn');
    await tap('#confirm-ok');
    for (const c of '12341234') await tap('#sheet [data-action="pin-key"][data-value="' + c + '"]');
    await page.waitForSelector('#elder:not([hidden])');
    assert.ok(await S(() => document.body.classList.contains('tx-xlarge')));
    await page.setViewportSize({ width: 320, height: 740 });
    assert.ok(await S(() => document.documentElement.scrollWidth) <= 320, 'no sideways scroll at the largest text');
    await page.setViewportSize({ width: 412, height: 915 });

    step('elder list: parts of the day, one medicine per line with its picture and amount; tap opens the card, Back closes it');
    await page.setViewportSize({ width: 412, height: 915 });
    const parts = await page.$$eval('#elder .el-part', (n) => n.map((x) => x.textContent.trim()));
    assert.deepStrictEqual(parts.map((x) => x.replace(/^\S+\s/, '')), ['Umaga', 'Gabi']);
    assert.ok(await page.$('#elder .el-med img, #elder .el-med .pillicon'), 'each medicine has its picture');
    assert.match(await page.textContent('#elder .el-slot'), /Losartan 50mg\s*1 tableta/);
    assert.match(await page.textContent('#elder .el-slot'), /Mamaya|Oras na/);
    await tap('#elder .el-slot');
    await page.waitForSelector('#dose:not([hidden])');
    await tap('#dose [data-action="dose-close"]');
    await page.waitForSelector('#dose', { state: 'hidden' });

    step('pain faces fit a 320px screen at the largest text');
    await S(() => { const st = KalingaApp.store, el = st.list('elders')[0]; st.add('vitalTypes', Object.assign(KalingaVitals.template('symptom', { name: 'Pain' }), { elderId: el.id })); KalingaApp.commit(); });
    await page.setViewportSize({ width: 320, height: 640 });
    await tap('[data-action="measure-open"]');
    await tap('#sheet [data-action="rd-start"]:has-text("Sakit / kirot")');
    assert.ok(await S(() => document.querySelector('#sheet-body').scrollWidth) <= 320, 'faces do not scroll sideways');
    const lastFace = await S(() => { const r = document.querySelector('#sheet [data-action="rd-face"][data-value="5"]').getBoundingClientRect(); return r.right; });
    assert.ok(lastFace <= 320, 'the worst-pain face is on screen');
    await tap('#sheet-close');

    step('dose card at the largest text on a small phone: the first pill is visible above the buttons');
    await S(() => KalingaElder.openDose(KalingaApp.store.timeline(KalingaApp.store.list('elders')[0].id, new Date(2026, 9, 10).getTime(), new Date(2026, 9, 11).getTime(), Date.now()).find((s) => s.items.length).slotKey, false));
    const vis = await S(() => { const m = document.querySelector('#dose .dmed'), a = document.querySelector('#dose .dose__actions'); const r = m.getBoundingClientRect(), ra = a.getBoundingClientRect(); return { medBottom: r.bottom, actionsTop: ra.top, vh: innerHeight }; });
    assert.ok(vis.medBottom <= vis.actionsTop + 1 && vis.medBottom <= vis.vh, 'first medicine not hidden behind the action buttons ' + JSON.stringify(vis));
    await S(() => KalingaElder.closeDose());
    await page.setViewportSize({ width: 412, height: 915 });

    step('as-needed dose: "taken" screen, and undo needs a clear yes');
    await tap('[data-action="prn-open"]');
    await tap('#sheet [data-action="prn-take"]');
    await page.waitForSelector('#sheet [data-action="prn-undo"]');
    assert.strictEqual(await S(() => KalingaApp.store.list('meds').find((m) => m.name.indexOf('Paracetamol') === 0).stock.count), 9);
    await tap('#sheet [data-action="prn-undo"]');
    await page.waitForSelector('#confirm[open]');
    assert.match(await page.textContent('#confirm'), /Paracetamol/);
    await tap('#confirm-ok');
    assert.strictEqual(await S(() => KalingaApp.store.list('meds').find((m) => m.name.indexOf('Paracetamol') === 0).stock.count), 10, 'tablet back');
    assert.strictEqual(await S(() => KalingaApp.store.prnTaken(KalingaApp.store.list('meds').find((m) => m.name.indexOf('Paracetamol') === 0).id).length), 0, 'limit freed');

    assert.match(await page.textContent('#sheet'), /Iinom ako ngayon/, 'back to the list, can take one again');
    await tap('#sheet-close');

    step('back in caregiver mode: setup complete, the checklist is gone');
    await tap('[data-action="pin-open"]');
    for (const c of '1234') await tap('#sheet [data-action="pin-key"][data-value="' + c + '"]');
    await page.waitForSelector('#app:not([hidden])');
    assert.strictEqual(await page.$('.setup'), null);
    assert.strictEqual(await S(() => getComputedStyle(document.querySelector('#view h1')).fontSize), '24px', 'caregiver screens keep normal text');

    assert.deepStrictEqual(errors, [], 'page errors');
    console.log('e2e.ux.js ok');
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
