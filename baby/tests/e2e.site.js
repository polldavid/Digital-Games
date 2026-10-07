/* Alaga — the standalone site (deploy/dist) served the way Cloudflare Pages
   serves it: "/x.html" redirects to "/x", and "/x" serves x.html. Checks the
   offline cache copes (the privacy page broke once because of this).
     node baby/deploy/build-site.js && node baby/tests/e2e.site.js */
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { chromium, devices } = require('playwright');

const ROOT = path.join(__dirname, '..', 'deploy', 'dist');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const step = (t) => console.log('• ' + t);

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  const q = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  if (/\.html$/.test(p)) { res.writeHead(308, { Location: p === '/index.html' ? '/' + q : p.replace(/\.html$/, '') + q }); return res.end(); }
  if (p.endsWith('/')) p += 'index.html';
  else if (!path.extname(p)) p += '.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404); return res.end('404'); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

(async () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'privacy.html')), 'run baby/deploy/build-site.js first');
  await new Promise((r) => server.listen(0, r));
  const base = 'http://localhost:' + server.address().port + '/';
  const browser = await chromium.launch({ headless: !process.env.HEADED });
  try {
    const ctx = await browser.newContext({ ...devices['Pixel 7'] });
    const page = await ctx.newPage();
    await page.goto(base);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload(); // now controlled by the service worker
    await page.click('#welcome a[href="privacy.html"]');
    await page.waitForSelector('h1:has-text("Privacy")');
    step('privacy link works with the offline cache in charge (privacy.html → /privacy)');
    await page.goto(base + 'privacy.html');
    await page.waitForSelector('h1:has-text("Privacy")');
    step('typing privacy.html works too');
    await ctx.setOffline(true);
    await page.goto(base + 'privacy');
    await page.waitForSelector('h1:has-text("Privacy")');
    await page.goto(base);
    await page.waitForSelector('#welcome:not([hidden])');
    step('offline: the app and the privacy page still open');
    console.log('site e2e passed');
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
