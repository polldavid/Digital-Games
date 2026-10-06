/* Builds the standalone Alaga site (getbabylog.pages.dev) into deploy/dist/.
   Same files as the GitHub Pages version, but on its own: the shared
   theme.css / theme.js are copied in next to index.html and every ../theme
   link (pages and service worker) is rewritten.
     node baby/deploy/build-site.js
     npx wrangler pages deploy baby/deploy/dist --project-name getbabylog --branch main */
const fs = require('fs');
const path = require('path');
const SRC = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'dist');
const COPY = ['index.html', 'privacy.html', 'manifest.webmanifest', 'sw.js', 'css', 'js', 'icons'];

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
for (const f of COPY) fs.cpSync(path.join(SRC, f), path.join(OUT, f), { recursive: true });
for (const f of ['theme.css', 'theme.js']) fs.copyFileSync(path.join(SRC, '..', f), path.join(OUT, f));
for (const f of ['index.html', 'privacy.html', 'sw.js']) {
  const p = path.join(OUT, f);
  fs.writeFileSync(p, fs.readFileSync(p, 'utf8')
    .replace(/(["'])\.\.\/theme\.(css|js)/g, '$1theme.$2')
    .replace(/\s*<a class="link-back" href="\.\.\/">[^<]*<\/a>/, ''));
}
// Cloudflare Pages: never cache the page or the service worker (so updates arrive),
// cache versioned assets for a long time, and a few safe defaults.
fs.writeFileSync(path.join(OUT, '_headers'), [
  '/*',
  '  X-Content-Type-Options: nosniff',
  '  Referrer-Policy: no-referrer',
  '  Permissions-Policy: camera=(self), microphone=(self), geolocation=()',
  '  X-Frame-Options: DENY',
  '/',
  '  Cache-Control: no-cache',
  '/index.html',
  '  Cache-Control: no-cache',
  '/privacy.html',
  '  Cache-Control: no-cache',
  '/sw.js',
  '  Cache-Control: no-cache',
  ''
].join('\n'));
const v = (fs.readFileSync(path.join(SRC, 'sw.js'), 'utf8').match(/var V = '(\d+)'/) || [])[1];
const left = ['index.html', 'privacy.html', 'sw.js'].filter((f) => /\.\.\/theme/.test(fs.readFileSync(path.join(OUT, f), 'utf8')));
if (left.length) { console.error('still pointing at ../theme: ' + left.join(', ')); process.exit(1); }
console.log('deploy/dist ready (version ' + v + ')');
