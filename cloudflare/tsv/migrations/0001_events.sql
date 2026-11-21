-- Preserve all existing counters. No backfill of unknowable timestamps.
CREATE TABLE IF NOT EXISTS qr_events (
  id TEXT PRIMARY KEY,
  scanned_at TEXT NOT NULL,
  day TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS qr_events_time ON qr_events(scanned_at);
CREATE TABLE IF NOT EXISTS qr_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT OR IGNORE INTO qr_metadata VALUES ('events_started_at', strftime('%Y-%m-%dT%H:%M:%fZ','now'));
