-- Baby Log sync — D1 schema. Run once:
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
