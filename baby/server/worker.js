/* =========================================================
   Baby Log — sync server (Cloudflare Worker + D1)
   Stores encrypted records for each family and hands back
   what changed. It can't read anything: record names are
   hashed and contents are encrypted on the phone with a key
   the server never sees (see ../js/sync.js).

   Authorization: Bearer <family id>.<token>
   The first push creates the family and remembers a hash of
   the token; after that only the same token gets in.

   POST /v1/push   { rows: [{ k, b }] }    -> { seq }
   GET  /v1/pull?after=<seq>&k=<name>      -> { rows: [{ k, s, b }], more }
   DELETE /v1/family                        -> { ok }   (erases the family)
   ========================================================= */
const MAX_ROWS = 200;          // per push
const MAX_BLOB = 64 * 1024;    // per record (photos aren't synced)
const PAGE = 500;              // per pull

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Max-Age': '86400',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

async function sha256hex(text) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const url = new URL(req.url);
    if (url.pathname === '/' || url.pathname === '/health') return json({ ok: true, app: 'baby-log-sync' });

    const auth = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const [family, token] = auth.split('.');
    if (!/^[0-9a-f]{32}$/.test(family || '') || !/^[A-Za-z0-9_-]{40,64}$/.test(token || '')) return json({ error: 'auth' }, 401);
    const tokenHash = await sha256hex(token);
    let fam = await env.DB.prepare('SELECT auth, seq FROM families WHERE id = ?').bind(family).first();
    if (fam && fam.auth !== tokenHash) return json({ error: 'auth' }, 403);

    try {
      if (url.pathname === '/v1/pull' && req.method === 'GET') {
        if (!fam) return json({ rows: [], more: false });
        const after = Math.max(0, parseInt(url.searchParams.get('after') || '0', 10) || 0);
        const ak = url.searchParams.get('k') || '';
        const { results } = await env.DB.prepare(
          'SELECT k, seq, blob FROM records WHERE family = ?1 AND (seq > ?2 OR (seq = ?2 AND k > ?3)) ORDER BY seq, k LIMIT ?4'
        ).bind(family, after, ak, PAGE + 1).all();
        const more = results.length > PAGE;
        return json({ rows: results.slice(0, PAGE).map((r) => ({ k: r.k, s: r.seq, b: r.blob })), more });
      }

      if (url.pathname === '/v1/push' && req.method === 'POST') {
        let body;
        try { body = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
        const rows = body && Array.isArray(body.rows) ? body.rows : null;
        if (!rows || !rows.length || rows.length > MAX_ROWS) return json({ error: 'rows' }, 400);
        for (const r of rows) {
          if (!r || !/^[A-Za-z0-9_-]{16,64}$/.test(r.k || '') || typeof r.b !== 'string' || r.b.length > MAX_BLOB) return json({ error: 'row' }, 400);
        }
        const now = Date.now();
        if (!fam) {
          await env.DB.prepare('INSERT OR IGNORE INTO families (id, auth, seq, created, updated) VALUES (?, ?, 0, ?, ?)').bind(family, tokenHash, now, now).run();
          fam = await env.DB.prepare('SELECT auth, seq FROM families WHERE id = ?').bind(family).first();
          if (!fam || fam.auth !== tokenHash) return json({ error: 'auth' }, 403);
        }
        // One transaction: bump the family's counter, then write every row with it.
        const up = env.DB.prepare('INSERT INTO records (family, k, seq, blob) VALUES (?1, ?2, (SELECT seq FROM families WHERE id = ?1), ?3) ' +
          'ON CONFLICT (family, k) DO UPDATE SET seq = excluded.seq, blob = excluded.blob');
        await env.DB.batch([
          env.DB.prepare('UPDATE families SET seq = seq + 1, updated = ? WHERE id = ?').bind(now, family),
          ...rows.map((r) => up.bind(family, r.k, r.b)),
        ]);
        const after = await env.DB.prepare('SELECT seq FROM families WHERE id = ?').bind(family).first();
        return json({ seq: after.seq });
      }

      if (url.pathname === '/v1/family' && req.method === 'DELETE') {
        if (fam) await env.DB.batch([
          env.DB.prepare('DELETE FROM records WHERE family = ?').bind(family),
          env.DB.prepare('DELETE FROM families WHERE id = ?').bind(family),
        ]);
        return json({ ok: true });
      }
      return json({ error: 'not found' }, 404);
    } catch (e) {
      return json({ error: 'server' }, 500);
    }
  },
};
