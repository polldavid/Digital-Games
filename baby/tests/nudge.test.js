/* Alaga — server/nudge.js against the local sync server (wrangler dev, started
   by run-all.js with NUDGE_TEST=1, a made-up service account and FCM_URL
   pointing at the pretend Google below):
     - phones register (token + sealed profile) and list the family's phones;
     - a state worked out from an older picture than the server's is refused (409);
     - a state goes to the server, and the phone it's for gets a silent FCM
       message, sent with an access token from a correctly signed JWT;
     - an uninstalled app's token is dropped; other families can't get in;
     - deleting the shared log forgets its phones.
     node baby/tests/run-all.js nudge */
'use strict';
const http = require('http');
const assert = require('assert');
const { webcrypto, createPublicKey, createPrivateKey, verify } = require('crypto');
const Sync = require('../js/sync.js');

const SYNC_URL = process.env.SYNC_URL || 'http://127.0.0.1:8787';
const PORT = +process.env.FCM_TEST_PORT || 8799;
const SA = process.env.FCM_TEST_SA ? JSON.parse(Buffer.from(process.env.FCM_TEST_SA, 'base64').toString()) : null;
const step = (t) => console.log('• ' + t);
const hex = (n) => [...webcrypto.getRandomValues(new Uint8Array(n))].map((x) => x.toString(16).padStart(2, '0')).join('');

(async () => {
  if (!SA) { console.error('Run through run-all.js (it sets up the test service account).'); process.exit(1); }
  // The pretend Google: an OAuth token endpoint and FCM's send endpoint.
  const got = { tokens: [], sends: [] };
  const pub = createPublicKey(createPrivateKey(SA.private_key));
  const google = http.createServer((q, r) => {
    let body = '';
    q.on('data', (c) => (body += c));
    q.on('end', () => {
      if (q.url === '/token') {
        const jwt = new URLSearchParams(body).get('assertion').split('.');
        const ok = verify('RSA-SHA256', Buffer.from(jwt[0] + '.' + jwt[1]), pub, Buffer.from(jwt[2], 'base64url'));
        got.tokens.push({ ok, claims: JSON.parse(Buffer.from(jwt[1], 'base64url').toString()), grant: new URLSearchParams(body).get('grant_type') });
        r.writeHead(ok ? 200 : 401, { 'content-type': 'application/json' });
        return r.end(JSON.stringify(ok ? { access_token: 'test-access', expires_in: 3600 } : { error: 'bad sig' }));
      }
      const m = /^\/v1\/projects\/([^/]+)\/messages:send$/.exec(q.url);
      if (m) {
        const msg = JSON.parse(body).message;
        got.sends.push({ project: m[1], auth: q.headers.authorization, msg });
        if (msg.token === 'gone-token') { r.writeHead(404, { 'content-type': 'application/json' }); return r.end('{"error":{"status":"NOT_FOUND","details":[{"errorCode":"UNREGISTERED"}]}}'); }
        r.writeHead(200, { 'content-type': 'application/json' });
        return r.end('{"name":"projects/x/messages/1"}');
      }
      r.writeHead(404); r.end();
    });
  });
  await new Promise((r) => google.listen(PORT, '127.0.0.1', r));

  try {
    const keys = await Sync.deriveKeys(Sync.newSecret());
    const auth = keys.family + '.' + keys.token;
    const call = async (method, path, body, a) => {
      const res = await fetch(SYNC_URL + path, { method, headers: { Authorization: 'Bearer ' + (a || auth), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      return { status: res.status, body: await res.json().catch(() => null) };
    };
    const A = hex(16), B = hex(16), C = hex(16);

    let r = await call('PUT', '/v1/nudge/me', { d: A, t: '', p: 'cHJvZmlsZQ' });
    assert.strictEqual(r.status, 409, 'no shared log on the server yet: try later');
    r = await call('POST', '/v1/push', { rows: [{ k: 'k'.repeat(22), b: 'blob' }] });
    const seq1 = r.body.seq;
    for (const [d, t] of [[A, ''], [B, 'good-token'], [C, 'gone-token']]) {
      r = await call('PUT', '/v1/nudge/me', { d, t, p: 'cHJvZmlsZS0' + d.slice(0, 4) });
      assert.strictEqual(r.status, 200);
    }
    r = await call('GET', '/v1/nudge/devices');
    const rows = Object.fromEntries(r.body.rows.map((x) => [x.d, x]));
    assert.deepStrictEqual([rows[A].t, rows[B].t, rows[C].t], [false, true, true], 'which phones have a token');
    assert.strictEqual(rows[B].p, 'cHJvZmlsZS0' + B.slice(0, 4), 'profile kept as sent');
    step('phones register; the family\'s phones and profiles are listed');

    assert.strictEqual((await call('PUT', '/v1/nudge/me', { d: 'nope', t: '' })).status, 400, 'bad device id');
    assert.strictEqual((await call('PUT', '/v1/nudge/me', { d: A, p: 'not base64!' })).status, 400, 'bad profile');
    const other = await Sync.deriveKeys(Sync.newSecret());
    await call('POST', '/v1/push', { rows: [{ k: 'k'.repeat(22), b: 'blob' }] }, other.family + '.' + other.token);
    r = await call('GET', '/v1/nudge/devices', null, other.family + '.' + other.token);
    assert.deepStrictEqual(r.body.rows, [], 'another family sees none of these phones');
    assert.strictEqual((await call('GET', '/v1/nudge/devices', null, keys.family + '.' + other.token)).status, 403, 'wrong token');
    step('bad input refused; other families can\'t see or reach these phones');

    // B's state, worked out by A — but someone wrote since A last looked.
    await call('POST', '/v1/push', { rows: [{ k: 'j'.repeat(22), b: 'blob2' }] });
    const seq2 = seq1 + 1;
    r = await call('POST', '/v1/nudge/state', { from: A, based: seq1, items: [{ d: B, b: 'c3RhdGUx' }] });
    assert.strictEqual(r.status, 409);
    assert.strictEqual(r.body.seq, seq2, 'tells the sender how far the family has got');
    assert.strictEqual(got.sends.length, 0, 'nothing sent for a refused state');
    step('a state worked out from an older picture is refused (409)');

    r = await call('POST', '/v1/nudge/state', { from: A, based: seq2, items: [{ d: B, b: 'c3RhdGUy' }, { d: C, b: 'c3RhdGVD' }] });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.n, 2);
    for (let i = 0; i < 50 && got.sends.length < 2; i++) await new Promise((x) => setTimeout(x, 100));
    assert.strictEqual(got.sends.length, 2, 'one message per phone with a token');
    const toB = got.sends.find((s) => s.msg.token === 'good-token');
    assert.ok(toB, 'B was sent a message');
    assert.strictEqual(toB.project, 'alaga-test');
    assert.strictEqual(toB.auth, 'Bearer test-access', 'with the access token from Google');
    assert.deepStrictEqual(toB.msg.data, { t: 's' }, 'silent: no wording, nothing readable');
    assert.strictEqual(toB.msg.android.priority, 'HIGH');
    assert.ok(!('notification' in toB.msg), 'a data message, not a visible notification');
    // The server keeps its access token for an hour, so after an earlier test (e2e.nudge) it may not ask again.
    const tok = got.tokens[0];
    if (tok) {
      assert.ok(tok.ok, 'the JWT is signed with the service account key');
      assert.strictEqual(tok.grant, 'urn:ietf:params:oauth:grant-type:jwt-bearer');
      assert.strictEqual(tok.claims.iss, SA.client_email);
      assert.strictEqual(tok.claims.scope, 'https://www.googleapis.com/auth/firebase.messaging');
      assert.ok(tok.claims.exp - tok.claims.iat <= 3600);
    }
    step('the state is kept, and B gets a silent FCM message (signed JWT → access token)');

    r = await call('GET', '/v1/nudge/state?d=' + B);
    assert.deepStrictEqual(r.body, { s: seq2, b: 'c3RhdGUy' }, 'B fetches its state and what it was worked out from');
    r = await call('GET', '/v1/nudge/devices');
    assert.strictEqual(r.body.rows.find((x) => x.d === C).t, false, 'the uninstalled app\'s token is dropped');
    step('B fetches its state; an uninstalled app\'s token is dropped');

    r = await call('POST', '/v1/nudge/state', { from: A, based: seq2, items: [{ d: A, b: 'c2VsZg' }] });
    assert.strictEqual(r.status, 400, 'a phone doesn\'t send a state to itself');
    assert.strictEqual((await call('DELETE', '/v1/nudge/me?d=' + A)).status, 200);
    r = await call('GET', '/v1/nudge/devices');
    assert.ok(!r.body.rows.some((x) => x.d === A), 'a phone that stopped sharing is forgotten');
    await call('DELETE', '/v1/family');
    r = await call('GET', '/v1/nudge/devices');
    assert.strictEqual(r.status, 410, 'the shared log is gone');
    step('stopping sharing forgets the phone; deleting the log forgets them all');

    console.log('\nnudge: all good');
  } finally {
    google.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
