/* Builds the Kalinga site (https://kalinga-app.pages.dev) into deploy/dist/.
     node kalinga/deploy/build-site.js
     cd kalinga/deploy && npx wrangler pages deploy dist --project-name kalinga-app --branch main */
const fs = require('fs');
const path = require('path');
const SRC = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'dist');
const COPY = ['index.html', 'privacy.html', 'manifest.webmanifest', 'sw.js', 'css', 'js', 'icons'];

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
for (const f of COPY) fs.cpSync(path.join(SRC, f), path.join(OUT, f), { recursive: true });
// Never cache the page or the service worker (so updates arrive); safe defaults.
fs.writeFileSync(path.join(OUT, '_headers'), [
  '/*',
  '  X-Content-Type-Options: nosniff',
  '  Referrer-Policy: no-referrer',
  '  Permissions-Policy: camera=(self), microphone=(self), geolocation=()',
  '  X-Frame-Options: DENY',
  '/', '  Cache-Control: no-cache',
  '/index.html', '  Cache-Control: no-cache',
  '/privacy.html', '  Cache-Control: no-cache',
  '/sw.js', '  Cache-Control: no-cache',
  ''
].join('\n'));
const v = (fs.readFileSync(path.join(SRC, 'sw.js'), 'utf8').match(/var V = '(\d+)'/) || [])[1];
console.log('deploy/dist ready (version ' + v + ')');
