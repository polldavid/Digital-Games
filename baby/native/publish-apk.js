/* Copies the built debug APK out as Alaga-v<N>.apk (N = web version in ../sw.js)
   to Downloads and the Google Drive folder, so the phone can install it from Drive.
     node publish-apk.js          # ALAGA_APK_DIRS="dir1;dir2" overrides the targets
   Refuses if the web files inside the APK aren't the current version. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const APK = path.join(__dirname, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
const DIRS = (process.env.ALAGA_APK_DIRS || [path.join(os.homedir(), 'Downloads'), 'G:\\My Drive\\Alaga'].join(';')).split(';').filter(Boolean);

const die = (m) => { console.error('publish-apk: ' + m); process.exit(1); };

// Read one file out of the APK (a zip) via its central directory.
function zipEntry(file, want) {
  const b = fs.readFileSync(file);
  let e = b.length - 22;
  while (e >= 0 && b.readUInt32LE(e) !== 0x06054b50) e--;
  if (e < 0) return null;
  for (let p = b.readUInt32LE(e + 16), n = b.readUInt16LE(e + 10); n--; ) {
    const method = b.readUInt16LE(p + 10), size = b.readUInt32LE(p + 20), nameLen = b.readUInt16LE(p + 28);
    const extra = b.readUInt16LE(p + 30), comment = b.readUInt16LE(p + 32), local = b.readUInt32LE(p + 42);
    if (b.toString('utf8', p + 46, p + 46 + nameLen) === want) {
      const start = local + 30 + b.readUInt16LE(local + 26) + b.readUInt16LE(local + 28), data = b.subarray(start, start + size);
      return (method === 8 ? zlib.inflateRawSync(data) : data).toString('utf8');
    }
    p += 46 + nameLen + extra + comment;
  }
  return null;
}

const v = (fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8').match(/var V = '(\d+)'/) || [])[1];
if (!v) die('no version found in sw.js');
if (!fs.existsSync(APK)) die('no APK at ' + APK + ' — build it first (npm run apk)');
const inside = zipEntry(APK, 'assets/public/index.html');
if (!inside) die('could not read index.html inside the APK');
if (!inside.includes('?v=' + v + '"')) die('the APK holds an older web version than v' + v + ' — run npm run apk to rebuild');

const name = 'Alaga-v' + v + '.apk';
let ok = 0;
for (const d of DIRS) {
  if (!fs.existsSync(d)) { console.warn('  skipped ' + d + ' (not found — is Google Drive running?)'); continue; }
  fs.copyFileSync(APK, path.join(d, name));
  console.log('  ' + path.join(d, name));
  ok++;
}
if (!ok) die('no target folder found');
console.log(name + ' published to ' + ok + ' folder' + (ok === 1 ? '' : 's'));
