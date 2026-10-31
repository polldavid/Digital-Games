/* =========================================================
   Room storage for online play.

   On Vercel: Upstash Redis over its REST API (plain fetch, no
   npm packages). Connect it from the Vercel dashboard
   (Storage → Upstash for Redis) and it injects the env vars —
   either the KV_REST_API_* names or the UPSTASH_REDIS_REST_*
   names; both work.

   Locally (no env vars, not on Vercel): an in-memory Map, so
   `npm run dev` works with zero setup.

   Each room is two keys: the room JSON and its revision number.
   Writes are compare-and-set on the revision (a tiny Lua script),
   so two players acting at the same moment can't clobber each
   other — the loser just retries on the fresh state.
   ========================================================= */
'use strict';

var URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
var TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
var TTL = 60 * 60 * 12; // rooms vanish 12 hours after the last move
var useMemory = !URL_ || !TOKEN;
var mem = new Map();

/** Online play needs real storage when deployed; memory is for local dev only. */
function ready() { return !useMemory || !process.env.VERCEL; }

function keys(code) { return { room: 'ib:{' + code + '}:room', rev: 'ib:{' + code + '}:rev' }; }

async function redis(args) {
  var r = await fetch(URL_, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(args)
  });
  var j;
  try { j = await r.json(); } catch (e) { throw new Error('Redis returned HTTP ' + r.status); }
  if (j.error) throw new Error('Redis: ' + j.error);
  return j.result;
}

var CREATE_LUA =
  "if redis.call('EXISTS', KEYS[2]) == 1 then return 0 end " +
  "redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[3]) " +
  "redis.call('SET', KEYS[2], ARGV[2], 'EX', ARGV[3]) " +
  'return 1';
var CAS_LUA =
  "if (redis.call('GET', KEYS[2]) or '0') ~= ARGV[1] then return 0 end " +
  "redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[4]) " +
  "redis.call('SET', KEYS[2], ARGV[3], 'EX', ARGV[4]) " +
  'return 1';

/** → { room, rev } or null */
async function get(code) {
  if (useMemory) {
    var v = mem.get(code);
    return v ? { room: JSON.parse(v.room), rev: v.rev } : null;
  }
  var s = await redis(['GET', keys(code).room]);
  if (!s) return null;
  var room = JSON.parse(s);
  return { room: room, rev: room.rev };
}

/** Just the revision — the cheap call every poll makes. → number or null */
async function getRev(code) {
  if (useMemory) { var v = mem.get(code); return v ? v.rev : null; }
  var r = await redis(['GET', keys(code).rev]);
  return r === null || r === undefined ? null : parseInt(r, 10);
}

/** Reserve a brand-new room code. → false if the code is taken. */
async function create(code, room) {
  if (useMemory) {
    if (mem.has(code)) return false;
    mem.set(code, { room: JSON.stringify(room), rev: room.rev });
    return true;
  }
  var k = keys(code);
  return (await redis(['EVAL', CREATE_LUA, '2', k.room, k.rev, JSON.stringify(room), String(room.rev), String(TTL)])) === 1;
}

/** Save only if nobody else saved since we read revision `expected`. */
async function cas(code, expected, room) {
  if (useMemory) {
    var v = mem.get(code);
    if (!v || v.rev !== expected) return false;
    mem.set(code, { room: JSON.stringify(room), rev: room.rev });
    return true;
  }
  var k = keys(code);
  return (await redis(['EVAL', CAS_LUA, '2', k.room, k.rev, String(expected), JSON.stringify(room), String(room.rev), String(TTL)])) === 1;
}

module.exports = { ready: ready, get: get, getRev: getRev, create: create, cas: cas, usingMemory: useMemory };
