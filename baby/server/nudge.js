/* =========================================================
   Alaga — keeping the other phones up to date (Android app)
   When a phone logs something, the reminders, widget and timer
   notifications on the partner's phone go stale until Alaga is
   opened there. So the phone that logged works out what each
   other phone should show — with that phone's own settings —
   seals it with the family key and sends it here. This server
   keeps the latest one per phone and sends that phone a silent
   Firebase message ("something changed"); the app's Android code
   fetches it, opens it and applies it, with the app closed.

   The server can't read any of it: profiles (each phone's
   reminder settings) and states are encrypted on the phones.
   It learns which phones share a log and when something changed,
   which it already knew from sync.

   Authorization: Bearer <family id>.<token>   (same as sync)
   PUT    /v1/nudge/me      { d, t?, p? }  this phone: id, Firebase token, sealed profile
   DELETE /v1/nudge/me?d=   this phone stopped sharing
   GET    /v1/nudge/devices -> { rows: [{ d, p, t }] }  the family's phones (t: has a token)
   POST   /v1/nudge/state   { from, based, items: [{ d, b }] } -> { ok, n }
            409 { seq } when `based` is older than the family's last write:
            the sender hadn't seen everything, so it pulls and tries again.
   GET    /v1/nudge/state?d= -> { s, b }   the latest state for one phone

   Firebase: the FCM_SERVICE_ACCOUNT secret (the service-account JSON,
   or base64 of it). Without it, states are kept but no message is sent.
   ========================================================= */

const MAX_PHONES = 10;          // per family
const MAX_PROFILE = 32 * 1024;
const MAX_STATE = 64 * 1024;
const MAX_TOKEN = 4096;
const DEVICE = /^[0-9a-f]{32}$/;
const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const GOOGLE_FCM = 'https://fcm.googleapis.com';

const enc = new TextEncoder();
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64uText = (s) => b64u(enc.encode(s));
const isBlob = (s, max) => typeof s === 'string' && s.length > 0 && s.length <= max && /^[A-Za-z0-9_-]+$/.test(s);

export async function handleNudge(req, env, url, family, fam, json, ctx) {
  const db = env.DB, now = Date.now();
  if (!fam) return json({ error: 'family' }, 409); // nothing synced yet: try again later
  const body = async () => { try { return await req.json(); } catch { return null; } };

  if (url.pathname === '/v1/nudge/me' && req.method === 'PUT') {
    const b = await body();
    if (!b || !DEVICE.test(b.d || '')) return json({ error: 'device' }, 400);
    if (b.t != null && (typeof b.t !== 'string' || b.t.length > MAX_TOKEN)) return json({ error: 'token' }, 400);
    if (b.p != null && !isBlob(b.p, MAX_PROFILE)) return json({ error: 'profile' }, 400);
    const have = await db.prepare('SELECT COUNT(*) n, SUM(device = ?2) me FROM nudge_devices WHERE family = ?1').bind(family, b.d).first();
    if (!have.me && have.n >= MAX_PHONES) return json({ error: 'too many phones' }, 400);
    await db.prepare(
      'INSERT INTO nudge_devices (family, device, token, profile, state, state_seq, updated) VALUES (?1, ?2, ?3, ?4, NULL, 0, ?5) ' +
      'ON CONFLICT (family, device) DO UPDATE SET token = COALESCE(?3, token), profile = COALESCE(?4, profile), updated = ?5'
    ).bind(family, b.d, b.t == null ? null : b.t, b.p == null ? null : b.p, now).run();
    return json({ ok: true });
  }

  if (url.pathname === '/v1/nudge/me' && req.method === 'DELETE') {
    const d = url.searchParams.get('d') || '';
    if (!DEVICE.test(d)) return json({ error: 'device' }, 400);
    await db.prepare('DELETE FROM nudge_devices WHERE family = ? AND device = ?').bind(family, d).run();
    return json({ ok: true });
  }

  if (url.pathname === '/v1/nudge/devices' && req.method === 'GET') {
    const { results } = await db.prepare('SELECT device, profile, token FROM nudge_devices WHERE family = ?').bind(family).all();
    return json({ rows: results.map((r) => ({ d: r.device, p: r.profile || '', t: !!r.token })) });
  }

  if (url.pathname === '/v1/nudge/state' && req.method === 'POST') {
    const b = await body();
    const items = b && Array.isArray(b.items) ? b.items : null;
    if (!items || items.length > MAX_PHONES || !Number.isInteger(b.based) || !DEVICE.test(b.from || '')) return json({ error: 'state' }, 400);
    for (const it of items) if (!it || !DEVICE.test(it.d || '') || it.d === b.from || !isBlob(it.b, MAX_STATE)) return json({ error: 'item' }, 400);
    // Worked out from an older picture than the server has: the sender
    // missed someone else's change. It pulls and sends again.
    if (b.based < fam.seq) return json({ error: 'stale', seq: fam.seq }, 409);
    if (!items.length) return json({ ok: true, n: 0 });
    // Never replace a state with one worked out from older data.
    const up = db.prepare('UPDATE nudge_devices SET state = ?3, state_seq = ?4 WHERE family = ?1 AND device = ?2 AND state_seq <= ?4');
    const res = await db.batch(items.map((it) => up.bind(family, it.d, it.b, b.based)));
    const changed = items.filter((it, i) => res[i] && res[i].meta && res[i].meta.changes > 0).map((it) => it.d);
    if (changed.length) {
      const { results } = await db.prepare('SELECT device, token FROM nudge_devices WHERE family = ?1 AND device IN (' + changed.map(() => '?').join(',') + ") AND token IS NOT NULL AND token != ''")
        .bind(family, ...changed).all();
      if (results.length) {
        const send = notify(env, family, results).catch(() => {});
        if (ctx && ctx.waitUntil) ctx.waitUntil(send); else await send;
      }
    }
    return json({ ok: true, n: changed.length });
  }

  if (url.pathname === '/v1/nudge/state' && req.method === 'GET') {
    const d = url.searchParams.get('d') || '';
    if (!DEVICE.test(d)) return json({ error: 'device' }, 400);
    const r = await db.prepare('SELECT state, state_seq FROM nudge_devices WHERE family = ? AND device = ?').bind(family, d).first();
    if (!r) return json({ error: 'not found' }, 404);
    return json({ s: r.state_seq, b: r.state || '' });
  }

  return json({ error: 'not found' }, 404);
}

// When a family's shared log is deleted, or a phone hasn't been seen in 60 days.
export function forgetFamily(env, family) {
  return env.DB.prepare('DELETE FROM nudge_devices WHERE family = ?').bind(family);
}
export function forgetIdle(env) {
  return env.DB.prepare('DELETE FROM nudge_devices WHERE updated < ?').bind(Date.now() - 60 * 864e5).run();
}

/* ---------- Firebase Cloud Messaging (HTTP v1) ---------- */
function account(env) {
  const raw = env.FCM_SERVICE_ACCOUNT;
  if (!raw) return null;
  try {
    const sa = JSON.parse(raw.trim().charAt(0) === '{' ? raw : atob(raw.trim()));
    return sa && sa.client_email && sa.private_key && sa.project_id ? sa : null;
  } catch { return null; }
}
// Tests (NUDGE_TEST=1, local only) point both at a pretend Google on this machine.
const testing = (env) => env.NUDGE_TEST === '1';
const tokenUrl = (env, sa) => (testing(env) && sa.token_uri ? sa.token_uri : GOOGLE_TOKEN);
const fcmUrl = (env) => (testing(env) && env.FCM_URL ? env.FCM_URL : GOOGLE_FCM);

function pemToDer(pem) {
  const b = atob(pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

// An access token for FCM: a JWT signed with the service account's key,
// traded at Google's token endpoint. Kept until a minute before it expires.
let cached = null;
async function accessToken(env, sa) {
  const url = tokenUrl(env, sa);
  if (cached && cached.who === sa.client_email + url && cached.exp > Date.now() + 60e3) return cached.token;
  const iat = Math.floor(Date.now() / 1000);
  const head = b64uText(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64uText(JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: url, iat, exp: iat + 3600 }));
  const key = await crypto.subtle.importKey('pkcs8', pemToDer(sa.private_key), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(head + '.' + claims));
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + head + '.' + claims + '.' + b64u(sig),
  });
  if (!res.ok) throw new Error('fcm auth ' + res.status);
  const j = await res.json();
  cached = { who: sa.client_email + url, token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return cached.token;
}

// A silent, high-priority data message: no text, nothing to read. Repeats
// collapse into one, and a phone that was off gets it when it's back (a day).
async function notify(env, family, rows) {
  const sa = account(env);
  if (!sa) return;
  const token = await accessToken(env, sa);
  const url = fcmUrl(env) + '/v1/projects/' + encodeURIComponent(sa.project_id) + '/messages:send';
  await Promise.all(rows.map(async (r) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: { token: r.token, data: { t: 's' }, android: { priority: 'HIGH', ttl: '86400s', collapse_key: 'alaga-state' } } }),
    });
    if (res.ok) return;
    const text = await res.text().catch(() => '');
    // The app was uninstalled or its token replaced: stop sending to it.
    if (res.status === 404 || /UNREGISTERED|registration-token-not-registered/i.test(text)) {
      await env.DB.prepare("UPDATE nudge_devices SET token = '' WHERE family = ? AND device = ? AND token = ?").bind(family, r.device, r.token).run();
    }
  }));
}
