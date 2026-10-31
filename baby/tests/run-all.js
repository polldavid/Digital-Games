/* Alaga — run every test. Starts a local sync server first (wrangler dev with a
   throwaway local D1, never the live one) for the tests that need it, then
   stops it. Exits non-zero if anything failed.
     node baby/tests/run-all.js               # all tests
     node baby/tests/run-all.js sync copies   # only files whose name contains these
     NO_SERVER=1 node baby/tests/run-all.js   # skip the server and the tests needing it */
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const TESTS = __dirname;
const SERVER_DIR = path.join(__dirname, '..', 'server');
const PORT = 8787, SYNC_URL = 'http://127.0.0.1:' + PORT;
const NEEDS_SERVER = ['e2e.sync.js', 'e2e.copies.js', 'e2e.push.js', 'e2e.photos.js'];
const filters = process.argv.slice(2);

const files = fs.readdirSync(TESTS)
  .filter((f) => /\.(test|e2e)\.js$|^e2e\..*\.js$/.test(f) && f !== path.basename(__filename))
  .filter((f) => !filters.length || filters.some((x) => f.includes(x)))
  .sort();
const wantServer = !process.env.NO_SERVER && files.some((f) => NEEDS_SERVER.includes(f));

async function up() {
  for (let i = 0; i < 60; i++) {
    try { await fetch(SYNC_URL + '/'); return true; } catch (e) { await new Promise((r) => setTimeout(r, 1000)); }
  }
  return false;
}

(async () => {
  let server = null;
  if (wantServer) {
    console.log('Starting the local sync server (throwaway local database)…');
    const schema = spawnSync('npx wrangler d1 execute babylog-sync --local --file=schema.sql', { cwd: SERVER_DIR, shell: true, encoding: 'utf8' });
    if (schema.status !== 0) { console.error(schema.stdout + schema.stderr); process.exit(1); }
    // --test-scheduled: /__scheduled runs the cron job; PUSH_TEST lets it post to the test's pretend push service.
    server = spawn('npx wrangler dev --local --test-scheduled --var PUSH_TEST:1 --port ' + PORT, { cwd: SERVER_DIR, shell: true, stdio: 'ignore' });
    if (!(await up())) { console.error('The local sync server did not start on ' + SYNC_URL); stop(server); process.exit(1); }
  }
  const results = [];
  for (const f of files) {
    if (!wantServer && NEEDS_SERVER.includes(f)) { results.push([f, 'SKIP']); console.log('SKIP ' + f + ' (needs the local sync server)'); continue; }
    const t0 = Date.now();
    const r = spawnSync(process.execPath, [path.join(TESTS, f)], { env: { ...process.env, SYNC_URL }, encoding: 'utf8' });
    const ok = r.status === 0;
    results.push([f, ok ? 'PASS' : 'FAIL']);
    console.log((ok ? 'PASS ' : 'FAIL ') + f + '  (' + Math.round((Date.now() - t0) / 1000) + 's)');
    if (!ok) console.log((r.stdout + r.stderr).split('\n').filter((l) => !/^\s+at /.test(l)).slice(-15).join('\n'));
  }
  stop(server);
  const failed = results.filter((r) => r[1] === 'FAIL').length, skipped = results.filter((r) => r[1] === 'SKIP').length;
  console.log('\n' + (results.length - failed - skipped) + ' passed, ' + failed + ' failed' + (skipped ? ', ' + skipped + ' skipped' : ''));
  process.exit(failed ? 1 : 0);
})();

// npx + shell on Windows leaves wrangler as a grandchild: kill the whole tree.
function stop(p) {
  if (!p) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(p.pid), '/T', '/F'], { stdio: 'ignore' });
  else p.kill('SIGTERM');
}
