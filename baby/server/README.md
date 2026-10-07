# Alaga sync server

A Cloudflare Worker + D1 database that stores **encrypted** partner-sync
records. It can't read them: names are hashed and contents are encrypted on
the phone with a key that only lives in the pairing link (see `../js/sync.js`).
Free tier is plenty for a family (2 phones polling every 10 s ≈ 17k requests/day).

## Deploy (once)

```bash
cd baby/server
npx wrangler login                          # opens the browser
npx wrangler d1 create babylog-sync         # copy the database_id into wrangler.toml
npx wrangler d1 execute babylog-sync --remote --file=schema.sql
npx wrangler deploy                         # prints https://babylog-sync.<you>.workers.dev
```

Put the printed URL in `SERVER` at the top of `../js/sync.js`, bump `V` in
`../sw.js` and every `?v=` in `../index.html`, and push.

## Run locally

```bash
npx wrangler d1 execute babylog-sync --local --file=schema.sql
npx wrangler dev --port 8787
```

In the browser console of the app: `localStorage['dg-babylog-sync-url'] = 'http://127.0.0.1:8787'`.

## Tests

```bash
node baby/tests/sync.test.js                                  # in-memory server
SYNC_URL=http://127.0.0.1:8787 node baby/tests/sync.test.js   # this Worker
SYNC_URL=http://127.0.0.1:8787 node baby/tests/e2e.sync.js    # two browsers
```

## Usage stats

The Worker also keeps the anonymous daily usage count (`../js/ping.js`): daily
totals only, in the `usage` table. Read them at
`https://babylog-sync.polldavid18.workers.dev/stats` with the stats key, set once with
`npx wrangler secret put STATS_KEY`. For local runs, put `STATS_KEY=…` in
`.dev.vars` (git-ignored).
