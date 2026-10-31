/* Partner sync — three simulated phones in one process.
   node baby/tests/sync.test.js                     # against an in-memory server
   SYNC_URL=http://127.0.0.1:8787 node baby/tests/sync.test.js   # against `wrangler dev` (baby/server) */
'use strict';
var assert = require('assert');
var path = require('path');
var Sync = require('../js/sync.js');

function freshStore() {
  var p = require.resolve('../js/store.js');
  delete require.cache[p];
  return require(p);
}
function memStorage() {
  var m = {};
  return { getItem: function (k) { return k in m ? m[k] : null; }, setItem: function (k, v) { m[k] = String(v); }, removeItem: function (k) { delete m[k]; } };
}

/* ---------- In-memory copy of server/worker.js ---------- */
function fakeServer() {
  var fams = {}, rows = {}, hist = {};
  var crypto = require('crypto');
  function reply(status, body) { return Promise.resolve({ ok: status < 300, status: status, json: function () { return Promise.resolve(body); } }); }
  var fn = function (url, init) {
    var u = new URL(url), auth = (init.headers.Authorization || '').replace(/^Bearer /, '').split('.');
    var fid = auth[0], th = crypto.createHash('sha256').update(auth[1] || '').digest('hex');
    var fam = fams[fid];
    if (fam && fam.auth === 'gone') return reply(410, { error: 'deleted' });
    if (fam && fam.auth !== th) return reply(403, { error: 'auth' });
    if (u.pathname === '/v1/pull') {
      if (!fam) return reply(200, { rows: [], more: false });
      var after = +u.searchParams.get('after') || 0, ak = u.searchParams.get('k') || '';
      var list = Object.keys(rows[fid]).map(function (k) { return rows[fid][k]; })
        .filter(function (r) { return r.s > after || (r.s === after && r.k > ak); })
        .sort(function (a, b) { return a.s - b.s || (a.k < b.k ? -1 : 1); });
      return reply(200, { rows: list.slice(0, 500), more: list.length > 500 });
    }
    if (u.pathname === '/v1/push') {
      if (!fam) { fam = fams[fid] = { auth: th, seq: 0 }; rows[fid] = {}; }
      fam.seq++;
      JSON.parse(init.body).rows.forEach(function (r) {
        if (rows[fid][r.k]) (hist[fid] = hist[fid] || []).push({ k: r.k, s: rows[fid][r.k].s, b: rows[fid][r.k].b, t: Date.now() });
        rows[fid][r.k] = { k: r.k, s: fam.seq, b: r.b };
      });
      return reply(200, { seq: fam.seq });
    }
    if (u.pathname === '/v1/history') return reply(200, { rows: (hist[fid] || []).slice().reverse() });
    if (u.pathname === '/v1/family' && init.method === 'DELETE') { if (fam) { fam.auth = 'gone'; rows[fid] = {}; } return reply(200, { ok: true }); }
    return reply(404, {});
  };
  fn.dump = function () { return JSON.stringify(rows); };
  return fn;
}

var live = process.env.SYNC_URL;
var server = live ? null : fakeServer();
var nodeFetch = function (url, init) { return fetch(url, init); };

function phone(name) {
  var S = freshStore();
  var c = Sync.Client({ store: S, storage: memStorage(), fetch: server || nodeFetch, server: live || 'http://fake' });
  return { S: S, c: c, name: name };
}

function ids(S) { return S.get().events.map(function (e) { return e.id; }).sort().join(','); }
function same(a, b) { return JSON.stringify(Sync.records(a.S.get())) === JSON.stringify(Sync.records(b.S.get())); }
function step(t) { console.log('  • ' + t); }

(async function () {
  var now = Date.now();
  console.log('sync tests (' + (live ? 'live server ' + live : 'in-memory server') + ')');

  // Pure helpers
  var sec = Sync.newSecret();
  assert(Sync.validSecret(sec));
  assert.strictEqual(Sync.parseSecret('https://x.io/baby/#join=' + sec), sec);
  assert.strictEqual(Sync.parseSecret('  ' + sec + ' '), sec);
  assert.strictEqual(Sync.parseSecret('nope'), null);
  var k1 = await Sync.deriveKeys(sec), k2 = await Sync.deriveKeys(sec);
  assert.strictEqual(k1.family, k2.family); assert.strictEqual(k1.token, k2.token);
  assert.deepStrictEqual(await Sync.open(k2, await Sync.seal(k1, { a: 1 })), { a: 1 });
  assert.strictEqual(await Sync.nameOf(k1, 'e:x'), await Sync.nameOf(k2, 'e:x'));
  step('keys, sealing and codes');

  // Phone A starts a log and shares it.
  var A = phone('A');
  var ava = A.S.addBaby({ name: 'Ava', birth: '2026-09-01', feeding: 'mixed' });
  var e1 = A.S.addEvent({ type: 'feed', time: now - 3600e3, data: { kind: 'bottle', ml: 90 } });
  var e2 = A.S.addEvent({ type: 'diaper', time: now - 1800e3, data: { kind: 'wet' } });
  A.S.health(ava.id).profile.blood = 'O+';
  var r = await A.c.create("A's phone");
  assert(r && r.sent >= 4, 'A pushed its log: ' + JSON.stringify(r));
  if (server) assert(server.dump().indexOf('Ava') < 0 && server.dump().indexOf('bottle') < 0, 'server only sees ciphertext');
  step('A creates a shared log (server sees no plaintext)');

  // Phone B joins with A's code.
  var B = phone('B');
  await B.c.join(A.c.secret(), "B's phone");
  assert.strictEqual(B.S.get().babies.length, 1);
  assert.strictEqual(B.S.baby().name, 'Ava');
  assert.strictEqual(ids(B.S), ids(A.S));
  assert.strictEqual(B.S.health(ava.id).profile.blood, 'O+');
  assert.strictEqual(B.c.localOnlyBabies().length, 0);
  await B.c.finishJoin();
  step('B joins and gets everything');

  // B logs a feed and starts the sleep timer; A sees both, credited to B.
  var e3 = B.S.addEvent({ type: 'feed', time: now - 60e3, data: { kind: 'bottle', ml: 120 } });
  B.S.startTimer('sleep', null, now);
  await B.c.cycle();
  await A.c.cycle();
  assert(A.S.findEvent(e3.id), 'A has B’s feed');
  assert.strictEqual(A.S.findEvent(e3.id).by, "B's phone");
  assert(A.S.isAsleep(ava.id), 'A sees the sleep timer B started');
  assert.strictEqual(B.S.findEvent(e1.id).by, "A's phone", 'entries logged before sharing are credited to the phone that shared them');
  step('new entries and running timers reach the partner');

  // A edits one entry, B deletes another, A stops the timer.
  A.S.updateEvent(e1.id, { data: { kind: 'bottle', ml: 100 } });
  A.S.stopTimer('sleep');
  B.S.removeEvent(e2.id);
  await A.c.cycle(); await B.c.cycle(); await A.c.cycle();
  assert.strictEqual(B.S.findEvent(e1.id).data.ml, 100);
  assert(!A.S.findEvent(e2.id), 'delete reached A');
  assert(!B.S.isAsleep(ava.id), 'stopping the timer reached B');
  assert(same(A, B), 'A and B agree');
  step('edits, deletes and stopped timers');

  // Both edit the same entry: the one that reaches the server last wins, on both phones.
  A.S.updateEvent(e3.id, { data: { kind: 'bottle', ml: 130 } });
  B.S.updateEvent(e3.id, { data: { kind: 'bottle', ml: 140 } });
  await A.c.cycle(); await B.c.cycle(); await A.c.cycle();
  assert.strictEqual(A.S.findEvent(e3.id).data.ml, 140);
  assert.strictEqual(B.S.findEvent(e3.id).data.ml, 140);
  assert(same(A, B));
  step('same entry edited on both phones converges');

  // An unpushed local edit is never overwritten by a pull.
  A.S.updateEvent(e3.id, { data: { kind: 'bottle', ml: 150 } });
  B.S.updateEvent(e3.id, { data: { kind: 'bottle', ml: 160 } });
  await B.c.cycle();
  // Simulate A pulling without pushing first: its 150 stays until pushed.
  var m = A.c.meta(); m.joining = true; await A.c.cycle(); m.joining = false;
  assert.strictEqual(A.S.findEvent(e3.id).data.ml, 150);
  await A.c.cycle(); await B.c.cycle();
  assert.strictEqual(B.S.findEvent(e3.id).data.ml, 150);
  step('unsynced local edits are kept');

  // Phone C already tracked Ava on its own, then joins: match babies.
  var C = phone('C');
  var avaC = C.S.addBaby({ name: 'Ava', birth: '2026-09-01', feeding: 'mixed' });
  var c1 = C.S.addEvent({ type: 'sleep', time: now - 7200e3, end: now - 5400e3, data: {} });
  C.S.health(avaC.id).profile.allergies = 'none known';
  await C.c.join(A.c.secret(), "C's phone");
  assert.strictEqual(C.S.get().babies.length, 2, 'C sees both Avas before matching');
  var lo = C.c.localOnlyBabies();
  assert.strictEqual(lo.length, 1); assert.strictEqual(lo[0].id, avaC.id);
  assert.strictEqual(C.c.sharedBabies()[0].id, ava.id);
  Sync.mergeBaby(C.S.get(), avaC.id, ava.id); C.S.touch();
  await C.c.finishJoin();
  await A.c.cycle();
  assert.strictEqual(A.S.get().babies.length, 1, 'no duplicate baby on A');
  assert.strictEqual(A.S.findEvent(c1.id).baby, ava.id);
  assert.strictEqual(A.S.health(ava.id).profile.allergies, 'none known');
  assert.strictEqual(A.S.health(ava.id).profile.blood, 'O+');
  await B.c.cycle(); await C.c.cycle();
  assert(same(A, B) && same(A, C), 'all three agree');
  step('a phone with its own copy of the baby merges in cleanly');

  // Leaving keeps the log on that phone and doesn't touch the others.
  C.c.leave();
  C.S.reset();
  await A.c.cycle();
  assert.strictEqual(A.S.get().babies.length, 1);
  assert(!C.c.on());
  step('leaving and erasing one phone leaves the others alone');

  // A wrong code is refused.
  var D = phone('D');
  var good = await Sync.deriveKeys(A.c.secret());
  var res = await (server || nodeFetch)((live || 'http://fake') + '/v1/push', { method: 'POST', headers: { Authorization: 'Bearer ' + good.family + '.' + Sync.newSecret(), 'Content-Type': 'application/json' }, body: JSON.stringify({ rows: [{ k: 'aaaaaaaaaaaaaaaaaaaaaa', b: 'x' }] }) });
  assert.strictEqual(res.status, 403);
  step('a forged token is refused');

  // A bigger log pages correctly (more than one push batch and one pull page).
  for (var i = 0; i < 1200; i++) A.S.addEvent({ type: 'diaper', time: now - i * 60e3, data: { kind: 'wet' } });
  var t0 = Date.now(); await A.c.cycle(); var t1 = Date.now();
  await D.c.join(A.c.secret(), "D's phone");
  var t2 = Date.now();
  assert.strictEqual(ids(D.S), ids(A.S));
  step('1,200 entries: push ' + (t1 - t0) + ' ms, fresh join ' + (t2 - t1) + ' ms');

  // Milk on hand is shared: pumped on one phone, fed from the other.
  var milk = A.S.milkAdd({ kind: 'breast', ml: 120, where: 'fridge', madeAt: now });
  await A.c.cycle(); await B.c.cycle();
  assert.strictEqual(B.S.milkItem(milk.id).ml, 120);
  B.S.milkMove(milk.id, 'freezer', now + 1000);
  await B.c.cycle(); await A.c.cycle();
  assert.strictEqual(A.S.milkItem(milk.id).where, 'freezer');
  step('milk storage syncs both ways');

  // A phone that loses part of its saved log (an older copy of the app saved over it)
  // must not delete those entries everywhere: they're held, and restored by default.
  var before = A.S.get().events.length;
  var lostIds = A.S.get().events.slice(0, 8).map(function (e) { return e.id; });
  var heldN = 0; B.c.onHeld = function (n) { heldN = n; };
  B.S.get().events = B.S.get().events.filter(function (e) { return lostIds.indexOf(e.id) < 0; }); // silent loss, no removeEvent
  await B.c.cycle(); await A.c.cycle();
  assert.strictEqual(A.S.get().events.length, before, 'partner keeps every entry');
  assert.strictEqual(heldN, 8, 'B was asked about 8 missing entries');
  assert.strictEqual(B.c.held(), 8);
  await B.c.restoreHeld();
  assert.strictEqual(B.S.get().events.length, before, 'restored on B from the server');
  assert.strictEqual(B.c.held(), 0);
  step('silently missing entries are held, not deleted everywhere, and restore from the server');

  // Deliberate deletions still go through: one entry, or a whole baby.
  var one = A.S.get().events[0].id;
  A.S.removeEvent(one); await A.c.cycle(); await B.c.cycle();
  assert.ok(!B.S.findEvent(one), 'a single deletion syncs');
  var twin = A.S.addBaby({ name: 'Twin', birth: '2026-10-01' });
  for (var tw = 0; tw < 6; tw++) A.S.addEvent({ baby: twin.id, type: 'diaper', time: now - tw * 1000, data: {} });
  await A.c.cycle(); await B.c.cycle();
  assert.strictEqual(B.S.events({ baby: twin.id }).length, 6);
  A.S.removeBaby(twin.id); await A.c.cycle(); await B.c.cycle();
  assert.strictEqual(B.S.events({ baby: twin.id }).length, 0, 'deleting a baby on purpose syncs');
  assert.ok(!B.S.baby(twin.id) && A.c.held() === 0);
  step('deliberate deletions (an entry, a whole baby) still sync');

  // Choosing "delete everywhere" for held entries.
  var gone2 = B.S.get().events.slice(0, 5).map(function (e) { return e.id; });
  B.S.get().events = B.S.get().events.filter(function (e) { return gone2.indexOf(e.id) < 0; });
  await B.c.cycle();
  assert.strictEqual(B.c.held(), 5);
  await B.c.deleteHeld(); await A.c.cycle();
  assert.ok(gone2.every(function (id) { return !A.S.findEvent(id); }), 'deleted everywhere when chosen');
  step('or, when chosen, held entries are deleted everywhere');

  // History: earlier versions are on the server for 30 days.
  var h = await A.c.history();
  assert.ok(h.some(function (r) { return r.k === 'e:' + gone2[0] && r.d; }), 'the deleted entry is in history');
  step('the server keeps earlier versions (history)');

  // Deleting the shared copy: gone from the server, and other phones stop instead of re-uploading.
  var gone = null; B.c.onGone = function (m) { gone = m; };
  assert.strictEqual(await A.c.destroy(), true);
  assert.ok(!A.c.on(), 'A stopped sharing');
  B.S.addEvent({ type: 'note', time: now, data: { text: 'after delete' } });
  await B.c.cycle();
  assert.ok(!B.c.on() && /deleted/.test(gone), 'B was told and stopped');
  assert.ok(B.S.get().events.length > 0, 'B keeps its own log');
  if (server) assert.ok(!/"s":/.test(server.dump().slice(server.dump().indexOf(good.family))), 'records erased on the server');
  step('deleting the shared copy stops every phone (no re-upload)');

  console.log('sync tests passed');
})().catch(function (e) { console.error(e); process.exit(1); });
