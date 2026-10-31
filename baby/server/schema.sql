-- Alaga sync — D1 schema. Run once:
--   npx wrangler d1 execute babylog-sync --remote --file=schema.sql
CREATE TABLE IF NOT EXISTS families (
  id      TEXT PRIMARY KEY,          -- 32 hex chars, derived from the family's secret
  auth    TEXT NOT NULL,             -- SHA-256 of the family's token
  seq     INTEGER NOT NULL DEFAULT 0, -- bumped once per push; orders all writes
  created INTEGER NOT NULL,
  updated INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS records (
  family TEXT NOT NULL,
  k      TEXT NOT NULL,              -- hashed record name
  seq    INTEGER NOT NULL,
  blob   TEXT NOT NULL,              -- AES-GCM ciphertext, base64url
  PRIMARY KEY (family, k)
);
CREATE INDEX IF NOT EXISTS records_by_seq ON records (family, seq, k);

-- Anonymous usage count (../js/ping.js): daily totals only, no IDs, no addresses.
CREATE TABLE IF NOT EXISTS usage (
  day       TEXT NOT NULL,             -- UTC date the pings arrived, YYYY-MM-DD
  platform  TEXT NOT NULL,             -- web, web-app, ios-web, ios-home, android-app
  version   INTEGER NOT NULL,
  country   TEXT NOT NULL,             -- from Cloudflare's network, two letters
  active    INTEGER NOT NULL DEFAULT 0, -- phones that used Alaga that day
  week_new  INTEGER NOT NULL DEFAULT 0, -- …and were counting themselves for the first time that week
  month_new INTEGER NOT NULL DEFAULT 0, -- …that month
  installs  INTEGER NOT NULL DEFAULT 0, -- …ever (a new install)
  sharing   INTEGER NOT NULL DEFAULT 0, -- …with partner sharing on
  PRIMARY KEY (day, platform, version, country)
);

-- Earlier versions of records, kept 30 days, so a deletion or a bad overwrite
-- can be undone (still encrypted: the server can't read them either).
CREATE TABLE IF NOT EXISTS records_history (
  family   TEXT NOT NULL,
  k        TEXT NOT NULL,
  seq      INTEGER NOT NULL,
  blob     TEXT NOT NULL,
  replaced INTEGER NOT NULL,           -- when it was overwritten (ms)
  PRIMARY KEY (family, k, seq)
);
CREATE INDEX IF NOT EXISTS history_by_time ON records_history (family, replaced);

-- Reminders with the app closed (push.js). A phone's next reminders: when each
-- is due, and its wording encrypted on the phone (the server can't read it).
CREATE TABLE IF NOT EXISTS push_devices (
  id      TEXT PRIMARY KEY,           -- 32 hex chars, random per phone
  auth    TEXT NOT NULL,              -- SHA-256 of the phone's token
  sub     TEXT NOT NULL,              -- the browser's push subscription (endpoint + keys)
  updated INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS push_due (
  device TEXT NOT NULL,
  at     INTEGER NOT NULL,            -- when to send (ms)
  blob   TEXT NOT NULL                -- AES-GCM ciphertext, base64url
);
CREATE INDEX IF NOT EXISTS push_due_by_at ON push_due (at);
CREATE INDEX IF NOT EXISTS push_due_by_device ON push_due (device);
CREATE TABLE IF NOT EXISTS push_keys (
  id  TEXT PRIMARY KEY,               -- 'vapid'
  jwk TEXT NOT NULL                   -- the server's VAPID private key, made on first use
);

-- Shared photos (photos.js) live in R2; deleted ones wait here 30 days.
CREATE TABLE IF NOT EXISTS photo_trash (
  family  TEXT NOT NULL,
  k       TEXT NOT NULL,              -- hashed photo name
  deleted INTEGER NOT NULL,           -- ms
  PRIMARY KEY (family, k)
);
CREATE INDEX IF NOT EXISTS photo_trash_by_time ON photo_trash (deleted);
