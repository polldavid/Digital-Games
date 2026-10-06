/* Alaga — voice logging in a real browser, with a scripted stand-in
   for the phone's speech recognizer (so it runs offline, no microphone).
     node baby/tests/e2e.voice.js        # SHOTS=dir to save screenshots */
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { chromium, devices } = require('playwright');

const ROOT = path.join(__dirname, '..', '..');
const SHOTS = process.env.SHOTS || '';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const step = (t) => console.log('• ' + t);
const shot = (page, name) => SHOTS ? page.screenshot({ path: path.join(SHOTS, name + '.png') }) : null;

// The fake recognizer "hears" whatever window.__say holds when start() is called.
function fakeSpeech() {
  window.__say = '';
  function Rec() { this.lang = ''; }
  Rec.prototype.start = function () {
    var self = this, text = window.__say;
    setTimeout(function () {
      if (text === '!no-speech') { self.onerror && self.onerror({ error: 'no-speech' }); self.onend && self.onend(); return; }
      var alt = { transcript: text, confidence: 0.9 }, res = [alt]; res.isFinal = true;
      self.onresult && self.onresult({ results: [res] });
      self.onend && self.onend();
    }, 150);
  };
  Rec.prototype.abort = function () {};
  Rec.prototype.stop = function () {};
  window.SpeechRecognition = Rec;
}

(async () => {
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(0, r));
  const base = 'http://localhost:' + server.address().port + '/baby/';
  const browser = await chromium.launch({ headless: !process.env.HEADED });
  const errors = [];
  try {
    const ctx = await browser.newContext({ ...devices['Pixel 7'], timezoneId: 'Asia/Manila' });
    await ctx.addInitScript(fakeSpeech);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base);
    await page.fill('#welcome-form input[name="name"]', 'Ava');
    await page.fill('#welcome-form input[name="birth"]', new Date(Date.now() - 40 * 864e5).toISOString().slice(0, 10));
    await page.click('#welcome-form button[type="submit"]');
    await page.waitForSelector('#app:not([hidden])');
    assert.ok(await page.isHidden('#micbtn'), 'mic hidden until turned on');

    // Turn it on: the privacy explanation comes first.
    await page.click('.tab[data-view="settings"]');
    await page.click('input[data-setting="voice"]', { force: true });
    await page.waitForSelector('#confirm[open]');
    await shot(page, 'v1-consent');
    assert.match(await page.textContent('#confirm-text'), /speech service/);
    await page.click('#confirm-ok');
    await page.waitForSelector('#micbtn:not([hidden])');
    await page.waitForSelector('select[data-setting="voiceLang"]');
    step('voice logging is opt-in, with the privacy note first');

    const say = async (text) => { await page.evaluate((t) => { window.__say = t; }, text); await page.click('#micbtn'); };
    const count = (type) => page.evaluate((t) => BabyStore.get().events.filter((e) => e.type === t).length, type);

    // A bottle, saved by the countdown.
    await page.click('.tab[data-view="today"]');
    await say('bottle 120 ml formula');
    await page.waitForSelector('.mic__card');
    await shot(page, 'v2-confirm');
    assert.match(await page.textContent('.mic__card'), /120/);
    await page.waitForFunction(() => BabyStore.get().events.some((e) => e.type === 'feed' && e.data.amountMl === 120), null, { timeout: 6000 });
    await page.waitForSelector('#sheet', { state: 'hidden' });
    step('“bottle 120 ml formula” saves itself after 3 seconds');

    // Cancel really cancels.
    await say('wet diaper');
    await page.waitForSelector('.mic__card');
    await page.click('[data-action="mic-cancel"]');
    await page.waitForTimeout(3500);
    assert.strictEqual(await count('diaper'), 0);
    step('Cancel stops the countdown — nothing saved');

    // Touching the card pauses the countdown; Save saves.
    await say('poopy diaper, yellow and seedy');
    await page.waitForSelector('.mic__card');
    await page.dispatchEvent('.mic__card', 'pointerdown');
    await page.waitForTimeout(3500);
    assert.strictEqual(await count('diaper'), 0, 'paused');
    await page.click('#mic-save');
    await page.waitForFunction(() => BabyStore.get().events.some((e) => e.type === 'diaper' && e.data.dirty && e.data.color === 'yellow'));
    step('touching the card pauses it; Save saves the dirty diaper with colour');

    // Timers: asleep, then woke up.
    await say('she fell asleep');
    await page.click('#mic-save');
    await page.waitForFunction(() => BabyStore.isAsleep());
    await page.evaluate(() => { BabyStore.timers().sleep.start -= 20 * 60000; });
    await say('woke up');
    await page.click('#mic-save');
    await page.waitForFunction(() => !BabyStore.isAsleep() && BabyStore.get().events.some((e) => e.type === 'sleep'));
    step('“she fell asleep” / “woke up” run the sleep timer');

    // Medicine: opens the form, filled in, and waits.
    const meds = await count('med');
    await say('gave tylenol 2.5 ml');
    await page.waitForSelector('#sheet-form[data-type="med"]');
    assert.strictEqual(await page.inputValue('#sheet-form select[name="medId"]'), 'acetaminophen');
    assert.strictEqual(await page.inputValue('#sheet-form input[name="dose"]'), '2.5 ml');
    await shot(page, 'v3-medicine-form');
    await page.waitForTimeout(3500);
    assert.strictEqual(await count('med'), meds, 'medicine never auto-saves');
    await page.click('[data-action="sheet-close"] >> nth=-1');
    step('medicine opens the medicine form, filled in, and never saves itself');

    // Not understood: suggestions, nothing saved.
    const before = await page.evaluate(() => BabyStore.get().events.length);
    await say('banana smoothie');
    await page.waitForSelector('[data-action="mic-form"]');
    await shot(page, 'v4-unknown');
    await page.click('[data-action="mic-cancel"]');
    await say('!no-speech');
    await page.waitForSelector('[data-action="mic-again"]');
    await page.click('[data-action="mic-cancel"]');
    assert.strictEqual(await page.evaluate(() => BabyStore.get().events.length), before);
    step('not understood or silent: says so, offers buttons, saves nothing');

    // Taglish
    await say('umihi si Ava 10 minutes ago');
    await page.click('#mic-save');
    await page.waitForFunction(() => BabyStore.get().events.some((e) => e.type === 'diaper' && e.data.wet && Date.now() - e.time > 9 * 60000));
    step('Taglish: “umihi si Ava 10 minutes ago”');

    // Home-screen shortcuts
    await page.goto(base + '?do=diaper');
    await page.waitForSelector('#sheet-form[data-type="diaper"]');
    assert.ok(!(await page.evaluate(() => location.search)), 'shortcut cleared from the address');
    await page.goto(base + '?do=sleep');
    await page.waitForFunction(() => BabyStore.isAsleep());
    await page.goto(base + '?do=voice');
    await page.waitForSelector('.mic');
    step('app-icon shortcuts: diaper form, sleep timer, voice');

    assert.deepStrictEqual(errors, [], 'no page errors');
    console.log('voice e2e passed');
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
