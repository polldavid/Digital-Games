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

## Reminders with the app closed

`push.js`: phones send their next reminders (times in the clear, wording
encrypted on the phone) and a cron trigger (every minute, `wrangler.toml`)
sends each due one as a Web Push message. The VAPID key pair is made on first
use and kept in the `push_keys` table, so there's nothing to configure. Only
Google, Mozilla, Apple and Windows push services are accepted as endpoints.
After changing `schema.sql`, run it again with `--remote` before deploying.

Local tests run `wrangler dev --test-scheduled --var PUSH_TEST:1` (`/__scheduled`
runs the job; `PUSH_TEST` lets it post to the test's pretend push service on
127.0.0.1). `../tests/run-all.js` does this for you.

## Keeping the partner's phone up to date (Android app)

`nudge.js`: when a phone logs something, it works out what each other phone
in the family should show (reminders, widget, timer notifications) with that
phone's own settings, seals it with the family key and sends it here. The server
keeps the latest one per phone and sends that phone a silent Firebase (FCM)
data message; `NudgeService.java` fetches and applies it with the app closed.
The server can't read any of it.

Needs the Firebase service account as a secret (once; the key file is private
and stays off git and Drive):

```
npx wrangler secret put FCM_SERVICE_ACCOUNT < "path/to/alaga-…-firebase-adminsdk-….json"
```

Without it, states are still kept but no message is sent. The `nudge_devices`
table is in `schema.sql`. Local tests (`../tests/run-all.js nudge`) make a
throwaway service account and pass `NUDGE_TEST=1` and `FCM_URL` so the server
talks to a pretend Google on 127.0.0.1.

## Usage stats

The Worker also keeps the anonymous daily usage count (`../js/ping.js`): daily
totals only, in the `usage` table. Read them at
`https://babylog-sync.polldavid18.workers.dev/stats` with the stats key, set once with
`npx wrangler secret put STATS_KEY`. For local runs, put `STATS_KEY=…` in
`.dev.vars` (git-ignored).
