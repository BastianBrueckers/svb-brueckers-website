CREATE TABLE IF NOT EXISTS home_daily(day TEXT PRIMARY KEY,count INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS home_total(id INTEGER PRIMARY KEY CHECK(id=1),count INTEGER NOT NULL DEFAULT 0,last_scan TEXT);
CREATE TABLE IF NOT EXISTS home_sources(day TEXT NOT NULL,source TEXT NOT NULL CHECK(source IN ('direct','google','other')),count INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(day,source));
INSERT OR IGNORE INTO home_total(id,count) VALUES(1,0);
INSERT OR IGNORE INTO qr_metadata(key,value) VALUES('homepage_started_at',strftime('%Y-%m-%dT%H:%M:%fZ','now'));
