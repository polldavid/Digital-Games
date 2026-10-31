/* =========================================================
   Alaga — shared photos (R2)
   Prescriptions, documents, diaper photos and medicine bottles,
   shared between a family's phones. Each photo is encrypted on
   the phone with the family key (../js/sync.js) and stored in
   R2 under the family id and a hashed name: the server can't
   see what a photo is, or which entry it belongs to.

   Authorization: the family's, checked in worker.js first.
   PUT    /v1/photo?k=<name>   body: ciphertext   -> { ok }
   GET    /v1/photo?k=<name>                      -> ciphertext, or 404
   DELETE /v1/photo?k=<name>                      -> { ok }

   A deleted photo goes to the trash for 30 days (photo_trash),
   like earlier versions of records, so "Restore deleted
   entries" brings its photo back too. Uploading or fetching it
   again takes it out of the trash. The cron job empties it.
   ========================================================= */

const MAX_PHOTO = 4 * 1024 * 1024;   // encrypted; photos are ~1600 px JPEGs, well under
const KEEP = 30 * 864e5;

const objectKey = (family, k) => family + '/' + k;

export async function handlePhoto(req, env, url, family, json, created) {
  if (!env.PHOTOS) return json({ error: 'photos off' }, 503);
  const k = url.searchParams.get('k') || '';
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(k)) return json({ error: 'name' }, 400);
  const key = objectKey(family, k);
  const untrash = () => env.DB.prepare('DELETE FROM photo_trash WHERE family = ? AND k = ?').bind(family, k).run();

  if (req.method === 'PUT') {
    const len = parseInt(req.headers.get('Content-Length') || '0', 10);
    if (len > MAX_PHOTO) return json({ error: 'too big' }, 413);
    const body = await req.arrayBuffer();
    if (!body.byteLength || body.byteLength > MAX_PHOTO) return json({ error: 'size' }, 400);
    try { await created(); } catch (e) { return json({ error: 'auth' }, 403); } // a family's first upload can come before its first record
    await env.PHOTOS.put(key, body);
    await untrash();
    return json({ ok: true });
  }
  if (req.method === 'GET') {
    const obj = await env.PHOTOS.get(key);
    if (!obj) return json({ error: 'missing' }, 404);
    await untrash();
    return new Response(obj.body, { headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store' } });
  }
  if (req.method === 'DELETE') {
    await env.DB.prepare('INSERT OR REPLACE INTO photo_trash (family, k, deleted) VALUES (?, ?, ?)').bind(family, k, Date.now()).run();
    return json({ ok: true });
  }
  return json({ error: 'not found' }, 404);
}

// The whole family is deleted: every photo goes now, not in 30 days.
export async function deleteFamilyPhotos(env, family) {
  if (!env.PHOTOS) return;
  let cursor;
  do {
    const list = await env.PHOTOS.list({ prefix: family + '/', cursor });
    if (list.objects.length) await env.PHOTOS.delete(list.objects.map((o) => o.key));
    cursor = list.truncated ? list.cursor : undefined;
  } while (cursor);
  await env.DB.prepare('DELETE FROM photo_trash WHERE family = ?').bind(family).run();
}

// From the cron job: photos deleted more than 30 days ago.
export async function emptyTrash(env) {
  if (!env.PHOTOS) return;
  const { results } = await env.DB.prepare('SELECT family, k FROM photo_trash WHERE deleted < ? LIMIT 500').bind(Date.now() - KEEP).all();
  if (!results.length) return;
  await env.PHOTOS.delete(results.map((r) => objectKey(r.family, r.k)));
  await env.DB.batch(results.map((r) => env.DB.prepare('DELETE FROM photo_trash WHERE family = ? AND k = ?').bind(r.family, r.k)));
}
