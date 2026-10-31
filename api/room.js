/* =========================================================
   /api/room — online In-Between rooms (a Vercel serverless
   function; also mounted by scripts/dev.js for local play).

   The server is the dealer: it owns the shuffled deck and runs
   every move through the same engine the browser uses, so the
   clients only ever see public information.

   GET  /api/room?ping=1                 → is online play available?
   GET  /api/room?code=ABCD[&rev=12]     → room view ({same:true} if unchanged)
   POST /api/room  { action, code, id, token, ... }
        create {name}            → new room, you're the host
        join   {code, name}      → take a seat (also mid-game)
        leave                    → give up your seat
        rules  {rules}           host, lobby: change house rules
        add-bot / remove {target} host: seat a computer / remove a seat
        start                    host: deal (also rematch from results)
        lobby                    host: results → back to the lobby
        end                      host: call the game now
        skip                     host: pass a stalled player's turn
        ace {low} / bet {amount, call} / pass / next   the player whose turn it is
        tick                     anyone: advance bots, timers, finished hands when due
   ========================================================= */
'use strict';

var crypto = require('crypto');
var E = require('../inbetween/js/engine.js');
var store = require('./_lib/store.js');

var CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O
var MAX_SEATS = 8;
var EARLY_MS = 300; // tolerate a little clock skew on ticks

/* ---------- Small helpers ---------- */
function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}
function fail(status, error) { return { status: status, body: { error: error } }; }
function newCode() {
  var c = '';
  for (var i = 0; i < 4; i++) c += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
  return c;
}
function newId() { return crypto.randomBytes(6).toString('hex'); }
function newToken() { return crypto.randomBytes(18).toString('base64url'); }
function cleanCode(c) {
  c = String(c || '').toUpperCase().replace(/[^A-Z]/g, '');
  return c.length === 4 ? c : null;
}
function cleanName(n) {
  n = String(n || '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 18);
  return n || null;
}
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

async function readBody(req) {
  try {
    if (req.body && typeof req.body === 'object') return req.body;
    if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  } catch (e) { return null; }
  return new Promise(function (resolve) {
    var d = '';
    req.on('data', function (c) { d += c; if (d.length > 20000) { d = ''; resolve(null); } });
    req.on('end', function () { try { resolve(d ? JSON.parse(d) : {}); } catch (e) { resolve(null); } });
    req.on('error', function () { resolve(null); });
  });
}

/** What everyone at the table may see: no secrets, deck order hidden. */
function view(room, now) {
  var g = room.game ? Object.assign({}, room.game, { deck: room.game.deck.slice().sort() }) : null;
  return {
    code: room.code, rev: room.rev, now: now,
    hostId: room.hostId, status: room.status, rules: room.rules,
    members: room.members.map(function (m) { return { id: m.id, name: m.name, cpu: m.cpu }; }),
    game: g, timing: E.TIMING
  };
}

function botName(room) {
  var used = room.members.map(function (m) { return m.name.toLowerCase(); });
  for (var i = 0; i < E.CPU_NAMES.length; i++) {
    if (used.indexOf(E.CPU_NAMES[i].toLowerCase()) === -1) return E.CPU_NAMES[i];
  }
  return 'Robot ' + (room.members.length + 1);
}

/* ---------- Actions ---------- */
function join(room, b) {
  // Already seated (e.g. a refresh) — nothing to change.
  if (b.id && b.token && room.secrets[b.id] === b.token && room.members.some(function (m) { return m.id === b.id; })) {
    return { changed: false, you: { id: b.id, token: b.token } };
  }
  var name = cleanName(b.name);
  if (!name) return { error: 'Pick a name first.' };
  if (room.members.length >= MAX_SEATS) return { error: 'This table is full (' + MAX_SEATS + ' seats).' };
  if (room.members.some(function (m) { return m.name.toLowerCase() === name.toLowerCase(); })) {
    return { error: 'Someone at the table is already called “' + name + '”. Try another name.' };
  }
  var id = newId(), token = newToken();
  room.members.push({ id: id, name: name, cpu: false });
  room.secrets[id] = token;
  if (room.status === 'playing') E.addPlayer(room.game, { id: id, name: name, cpu: false });
  return { changed: true, you: { id: id, token: token } };
}

function dropMember(room, id, kicked, now) {
  var g = room.game;
  room.members = room.members.filter(function (m) { return m.id !== id; });
  delete room.secrets[id];
  if (g && room.status === 'playing') {
    var wasTurn = E.current(g).id === id && g.hand.phase !== 'done';
    if (E.removePlayer(g, id, kicked) && (wasTurn || g.over)) g.changedAt = now;
    if (g.over) room.status = 'over';
  }
  if (room.hostId === id) {
    var next = room.members.find(function (m) { return !m.cpu; });
    room.hostId = next ? next.id : null;
  }
}

function apply(room, b, now) {
  var act = b.action;
  if (act === 'join') return join(room, b);

  var me = room.members.find(function (m) { return m.id === b.id && !m.cpu; });
  if (!me || !b.token || room.secrets[me.id] !== b.token) {
    return { error: 'You’re not seated at this table any more. Rejoin with the invite link.', status: 403 };
  }
  var host = room.hostId === me.id;
  var g = room.game;
  var playing = room.status === 'playing' && g && !g.over;
  var myTurn = playing && E.current(g).id === me.id;
  var hostOnly = function () { return host ? null : { error: 'Only the host can do that.', status: 403 }; };
  var gameMove = function (ok) {
    if (!ok) return { changed: false };
    g.changedAt = now;
    if (g.over) room.status = 'over';
    return { changed: true };
  };
  var deny;

  switch (act) {
    case 'leave':
      dropMember(room, me.id, false, now);
      return { changed: true };

    case 'rules':
      if ((deny = hostOnly())) return deny;
      if (room.status !== 'lobby') return { error: 'Rules are locked once the cards are dealt.' };
      room.rules = E.sanitizeRules(b.rules);
      return { changed: true };

    case 'add-bot':
      if ((deny = hostOnly())) return deny;
      if (room.status === 'playing') return { error: 'Add computer players between games.' };
      if (room.members.length >= MAX_SEATS) return { error: 'The table is full.' };
      room.members.push({ id: 'bot-' + newId(), name: botName(room), cpu: true });
      return { changed: true };

    case 'remove': {
      if ((deny = hostOnly())) return deny;
      var t = room.members.find(function (m) { return m.id === b.target; });
      if (!t || t.id === me.id) return { changed: false };
      dropMember(room, t.id, true, now);
      return { changed: true };
    }

    case 'start':
      if ((deny = hostOnly())) return deny;
      if (room.status === 'playing') return { changed: false };
      if (room.members.length < 2) return { error: 'You need at least 2 seats — invite someone or add a computer.' };
      room.game = E.create(room.members, room.rules);
      room.game.changedAt = now;
      room.status = 'playing';
      return { changed: true };

    case 'lobby':
      if ((deny = hostOnly())) return deny;
      if (room.status !== 'over') return { changed: false };
      room.status = 'lobby';
      room.game = null;
      return { changed: true };

    case 'end':
      if ((deny = hostOnly())) return deny;
      if (!playing) return { changed: false };
      return gameMove(E.endGame(g, 'called'));

    case 'skip':
      if ((deny = hostOnly())) return deny;
      if (!playing || E.current(g).cpu) return { changed: false };
      return gameMove(E.skipTurn(g, 'skip'));

    case 'ace':
      if (!myTurn) return { error: 'It’s not your turn.' };
      return gameMove(E.chooseAce(g, !!b.low));

    case 'bet':
      if (!myTurn) return { error: 'It’s not your turn.' };
      if (!(+b.amount >= 1)) return { error: 'Bet at least 1 chip.' };
      return gameMove(E.placeBet(g, +b.amount, b.call));

    case 'pass':
      if (!myTurn) return { error: 'It’s not your turn.' };
      if (!g.rules.allowPass) return { error: 'House rules: no passing — bet at least 1.' };
      return gameMove(E.placeBet(g, 0));

    case 'next':
      if (!playing || g.hand.phase !== 'done') return { changed: false };
      if (!myTurn && !host) return { changed: false };
      return gameMove(E.nextTurn(g));

    case 'tick': {
      if (!playing) return { changed: false };
      var due = E.nextDue(g, g.changedAt || 0);
      if (!due || now < due.at - EARLY_MS) return { changed: false };
      return gameMove(E.runDue(g, due.kind));
    }
  }
  return { error: 'Unknown action.' };
}

/* ---------- Handlers ---------- */
async function createRoom(b, now) {
  var name = cleanName(b.name);
  if (!name) return fail(400, 'Pick a name first.');
  var id = newId(), token = newToken();
  var room = {
    code: null, rev: 1, createdAt: now, updatedAt: now,
    hostId: id, status: 'lobby', rules: E.sanitizeRules(b.rules),
    members: [{ id: id, name: name, cpu: false }],
    secrets: {}, game: null
  };
  room.secrets[id] = token;
  for (var i = 0; i < 10; i++) {
    room.code = newCode();
    if (await store.create(room.code, room)) {
      return { status: 200, body: Object.assign(view(room, now), { you: { id: id, token: token } }) };
    }
  }
  return fail(500, 'Couldn’t find a free room code — try again.');
}

async function mutate(b, now) {
  var code = cleanCode(b.code);
  if (!code) return fail(400, 'Room codes are 4 letters.');
  for (var attempt = 0; attempt < 6; attempt++) {
    var got = await store.get(code);
    if (!got) return fail(404, 'Room ' + code + ' has closed or never existed.');
    var room = got.room;
    var r = apply(room, b, now);
    if (r.error) return fail(r.status || 400, r.error);
    var extra = r.you ? { you: r.you } : {};
    if (!r.changed) return { status: 200, body: Object.assign(view(room, now), extra) };
    room.rev = got.rev + 1;
    room.updatedAt = now;
    if (await store.cas(code, got.rev, room)) return { status: 200, body: Object.assign(view(room, now), extra) };
    await sleep(25 + Math.random() * 90); // someone beat us to it — re-read and retry
  }
  return fail(409, 'The table was busy — try that again.');
}

module.exports = async function handler(req, res) {
  try {
    var url = new URL(req.url, 'http://local');
    if (req.method === 'GET' && url.searchParams.has('ping')) {
      return send(res, 200, { ok: true, storage: store.ready() });
    }
    if (!store.ready()) {
      return send(res, 503, { error: 'Online play isn’t set up yet: connect an Upstash Redis database to this Vercel project (Storage tab) and redeploy.' });
    }
    var now = Date.now();

    if (req.method === 'GET') {
      var code = cleanCode(url.searchParams.get('code'));
      if (!code) return send(res, 400, { error: 'Room codes are 4 letters.' });
      var since = parseInt(url.searchParams.get('rev'), 10);
      if (!isNaN(since)) {
        var rev = await store.getRev(code);
        if (rev === null) return send(res, 404, { error: 'Room ' + code + ' has closed.' });
        if (rev === since) return send(res, 200, { same: true, rev: rev, now: now });
      }
      var got = await store.get(code);
      if (!got) return send(res, 404, { error: 'Room ' + code + ' has closed or never existed.' });
      return send(res, 200, view(got.room, now));
    }

    if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed.' });
    var body = await readBody(req);
    if (!body || typeof body !== 'object') return send(res, 400, { error: 'Bad request.' });
    var out = body.action === 'create' ? await createRoom(body, now) : await mutate(body, now);
    return send(res, out.status, out.body);
  } catch (e) {
    console.error('[api/room]', e);
    return send(res, 500, { error: 'The dealer dropped the cards (server error). Try again in a moment.' });
  }
};
