/* =========================================================
   Alaga — reminders with the app closed (Web Push)
   A phone that allows notifications sends the next two days of
   its reminders: when each is due, and its wording encrypted
   on the phone (a key that never leaves it, see ../js/push.js).
   The server only sees the times. A cron trigger runs every
   minute and sends each due reminder as a Web Push message;
   the service worker decrypts it and shows the notification.

   Authorization: Bearer <device id>.<token>   (same scheme as sync)
   GET    /v1/remind/key -> { key }  the server's public VAPID key
   PUT    /v1/remind     { sub, items: [{ at, b }] } -> { ok, n }  replaces the list
   DELETE /v1/remind     -> { ok }   notifications off: forget this phone

   The VAPID key pair is made on first use and kept in D1
   (push_keys), so there is nothing to set up. Push services:
   RFC 8030 (delivery), RFC 8291 (payload encryption),
   RFC 8292 (VAPID).
   ========================================================= */

const MAX_ITEMS = 64;
const MAX_ITEM = 2048;            // encrypted wording, per reminder
const AHEAD = 3 * 864e5;          // reminders further out than this are refused
const LATE = 30 * 60e3;           // a reminder this late is dropped, not sent
// Only real push services: the server must never be made to post anywhere else.
const PUSH_HOSTS = /^(fcm\.googleapis\.com|android\.googleapis\.com|[a-z0-9.-]*\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9.-]*\.notify\.windows\.com)$/;

const enc = new TextEncoder();
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};

async function hmac(key, data) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}

/* ---------- VAPID key pair, made once ---------- */
async function vapid(env) {
  let row = await env.DB.prepare("SELECT jwk FROM push_keys WHERE id = 'vapid'").first();
  if (!row) {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
    await env.DB.prepare("INSERT OR IGNORE INTO push_keys (id, jwk) VALUES ('vapid', ?)").bind(JSON.stringify(jwk)).run();
    row = await env.DB.prepare("SELECT jwk FROM push_keys WHERE id = 'vapid'").first();
  }
  const jwk = JSON.parse(row.jwk);
  const pub = concat(new Uint8Array([4]), unb64u(jwk.x), unb64u(jwk.y));
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  return { key, pub: b64u(pub) };
}

// RFC 8292: a short-lived signed token for the push service's origin.
async function vapidHeader(v, endpoint) {
  const head = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64u(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: 'https://alaga.pages.dev' })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, v.key, enc.encode(head + '.' + body));
  return 'vapid t=' + head + '.' + body + '.' + b64u(sig) + ', k=' + v.pub;
}

// RFC 8291 (aes128gcm): encrypt the payload for one browser's keys.
export async function encryptPayload(payload, p256dh, authSecret) {
  const ua = unb64u(p256dh), auth = unb64u(authSecret);
  const uaKey = await crypto.subtle.importKey('raw', ua, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const as = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', as.publicKey));
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, as.privateKey, 256));
  const ikm = await hmac(await hmac(auth, shared), concat(enc.encode('WebPush: info\0'), ua, asPub, new Uint8Array([1])));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, enc.encode('Content-Encoding: aes128gcm\0\x01'))).slice(0, 16);
  const nonce = (await hmac(prk, enc.encode('Content-Encoding: nonce\0\x01'))).slice(0, 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(enc.encode(payload), new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 16, 0]); // record size 4096
  return concat(salt, rs, new Uint8Array([asPub.length]), asPub, ct);
}

function validSub(sub, env) {
  if (!sub || typeof sub.endpoint !== 'string' || sub.endpoint.length > 1024 || !sub.keys) return false;
  if (!/^[A-Za-z0-9_-]{80,100}$/.test(sub.keys.p256dh || '') || !/^[A-Za-z0-9_-]{16,32}$/.test(sub.keys.auth || '')) return false;
  let u;
  try { u = new URL(sub.endpoint); } catch { return false; }
  if (env.PUSH_TEST === '1' && u.protocol === 'http:' && u.hostname === '127.0.0.1') return true; // tests: a fake push service
  return u.protocol === 'https:' && PUSH_HOSTS.test(u.hostname);
}

/* ---------- The phone's list ---------- */
export async function handlePush(req, env, url, json) {
  if (url.pathname === '/v1/remind/key' && req.method === 'GET') return json({ key: (await vapid(env)).pub });

  const auth = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const [id, token] = auth.split('.');
  if (!/^[0-9a-f]{32}$/.test(id || '') || !/^[A-Za-z0-9_-]{40,64}$/.test(token || '')) return json({ error: 'auth' }, 401);
  const d = await crypto.subtle.digest('SHA-256', enc.encode(token));
  const tokenHash = [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('');
  const dev = await env.DB.prepare('SELECT auth FROM push_devices WHERE id = ?').bind(id).first();
  if (dev && dev.auth !== tokenHash) return json({ error: 'auth' }, 403);

  if (req.method === 'DELETE') {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM push_due WHERE device = ?').bind(id),
      env.DB.prepare('DELETE FROM push_devices WHERE id = ?').bind(id),
    ]);
    return json({ ok: true });
  }
  if (req.method !== 'PUT') return json({ error: 'not found' }, 404);
  let body;
  try { body = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
  if (!body || !validSub(body.sub, env)) return json({ error: 'sub' }, 400);
  const items = Array.isArray(body.items) ? body.items : null;
  const now = Date.now();
  if (!items || items.length > MAX_ITEMS) return json({ error: 'items' }, 400);
  for (const it of items) {
    if (!it || !Number.isInteger(it.at) || it.at < now - LATE || it.at > now + AHEAD || typeof it.b !== 'string' || it.b.length > MAX_ITEM || !/^[A-Za-z0-9_-]+$/.test(it.b)) return json({ error: 'item' }, 400);
  }
  const sub = JSON.stringify({ endpoint: body.sub.endpoint, keys: { p256dh: body.sub.keys.p256dh, auth: body.sub.keys.auth } });
  const add = env.DB.prepare('INSERT INTO push_due (device, at, blob) VALUES (?, ?, ?)');
  await env.DB.batch([
    env.DB.prepare('INSERT INTO push_devices (id, auth, sub, updated) VALUES (?1, ?2, ?3, ?4) ON CONFLICT (id) DO UPDATE SET sub = ?3, updated = ?4').bind(id, tokenHash, sub, now),
    env.DB.prepare('DELETE FROM push_due WHERE device = ?').bind(id),
    ...items.map((it) => add.bind(id, it.at, it.b)),
  ]);
  return json({ ok: true, n: items.length });
}

/* ---------- Every minute: send what's due ---------- */
export async function sendDue(env) {
  const now = Date.now();
  const { results } = await env.DB.prepare(
    'SELECT p.rowid AS r, p.device, p.at, p.blob, d.sub FROM push_due p JOIN push_devices d ON d.id = p.device WHERE p.at <= ? ORDER BY p.at LIMIT 200'
  ).bind(now).all();
  if (!results.length) return 0;
  const v = await vapid(env);
  const gone = new Set();
  let sent = 0;
  await Promise.all(results.map(async (row) => {
    if (now - row.at > LATE || gone.has(row.device)) return;
    const sub = JSON.parse(row.sub);
    try {
      const res = await fetch(sub.endpoint, {
        method: 'POST',
        headers: { Authorization: await vapidHeader(v, sub.endpoint), 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '1800', Urgency: 'high' },
        body: await encryptPayload(JSON.stringify({ b: row.blob }), sub.keys.p256dh, sub.keys.auth),
      });
      if (res.status === 404 || res.status === 410) gone.add(row.device); // unsubscribed
      else if (res.ok) sent++;
    } catch (e) { /* the push service is down: this one is lost, the next ones may get through */ }
  }));
  const stmts = [env.DB.prepare('DELETE FROM push_due WHERE rowid IN (' + results.map(() => '?').join(',') + ')').bind(...results.map((r) => r.r))];
  for (const id of gone) {
    stmts.push(env.DB.prepare('DELETE FROM push_due WHERE device = ?').bind(id), env.DB.prepare('DELETE FROM push_devices WHERE id = ?').bind(id));
  }
  // Phones that haven't opened Alaga in 30 days.
  if (Math.random() < 0.01) stmts.push(env.DB.prepare('DELETE FROM push_devices WHERE updated < ? AND id NOT IN (SELECT device FROM push_due)').bind(now - 30 * 864e5));
  await env.DB.batch(stmts);
  return sent;
}
