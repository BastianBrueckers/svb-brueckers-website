-- Website referral clicks use their own counters, separate from both QR codes.
CREATE TABLE IF NOT EXISTS click_vivavoce_events (id TEXT PRIMARY KEY, scanned_at TEXT NOT NULL, day TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS click_vivavoce_events_time ON click_vivavoce_events(scanned_at);
CREATE TABLE IF NOT EXISTS click_vivavoce_daily (day TEXT PRIMARY KEY, count INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS click_vivavoce_total (id INTEGER PRIMARY KEY CHECK(id=1), count INTEGER NOT NULL DEFAULT 0, last_scan TEXT);
INSERT OR IGNORE INTO click_vivavoce_total(id,count) VALUES (1,0);
INSERT OR IGNORE INTO qr_metadata VALUES ('vivavoce_web_events_started_at', strftime('%Y-%m-%dT%H:%M:%fZ','now'));
