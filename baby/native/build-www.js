/* Copies the web app (../) into www/ for the Android shell.
   The web version loads ../theme.css and ../theme.js from the site root;
   here they're copied in next to index.html and the links rewritten. */
const fs = require('fs');
const path = require('path');
const SRC = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'www');
const COPY = ['index.html', 'privacy.html', 'manifest.webmanifest', 'css', 'js', 'icons'];

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
for (const f of COPY) fs.cpSync(path.join(SRC, f), path.join(OUT, f), { recursive: true });
for (const f of ['theme.css', 'theme.js']) fs.copyFileSync(path.join(SRC, '..', f), path.join(OUT, f));
for (const f of ['index.html', 'privacy.html']) {
  const html = path.join(OUT, f);
  fs.writeFileSync(html, fs.readFileSync(html, 'utf8').replace(/"\.\.\/theme\.(css|js)/g, '"theme.$1').replace(/<a class="link-back" href="\.\.\/">[^<]*<\/a>/, ''));
}
const v = (fs.readFileSync(path.join(SRC, 'sw.js'), 'utf8').match(/var V = '(\d+)'/) || [])[1];
console.log('www/ ready (web version ' + v + ')');
