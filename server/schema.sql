CREATE TABLE IF NOT EXISTS scans (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  scan_id       TEXT NOT NULL UNIQUE,
  date          TEXT NOT NULL,
  scanned_at    TEXT NOT NULL,
  received_at   TEXT NOT NULL,
  device        TEXT,
  device_id     TEXT,
  batch_sheet   TEXT,
  project       TEXT,
  floor         TEXT,
  part_type     TEXT,
  part_name     TEXT,
  size          TEXT,
  qty           TEXT,
  colour        TEXT,
  skid          TEXT,
  stage         TEXT,
  method        TEXT,
  flag          TEXT,
  matched       TEXT, -- 'TRUE' | 'FALSE' | '' (mirrors the CSV's MATCHED column)
  raw           TEXT
);

CREATE INDEX IF NOT EXISTS idx_scans_date   ON scans(date);
CREATE INDEX IF NOT EXISTS idx_scans_device ON scans(device_id);

-- Device approval gate: a phone must be explicitly approved here before
-- /upload or /check accept anything from it. Unknown or pending
-- device_ids are rejected — this is the access control for the public
-- tunnel URL.
CREATE TABLE IF NOT EXISTS devices (
  device_id    TEXT PRIMARY KEY,
  device_name  TEXT,
  status       TEXT NOT NULL DEFAULT 'PENDING', -- PENDING | APPROVED | REVOKED
  first_seen   TEXT NOT NULL,
  last_seen    TEXT,
  approved_at  TEXT,
  ip           TEXT
);

-- Reference data for the phone's stage picker (GET /stages).
CREATE TABLE IF NOT EXISTS stages (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO stages (code, name, sort) VALUES
  ('STAGE1','Stage 1',1),
  ('STAGE2','Stage 2',2),
  ('STAGE3','Stage 3',3),
  ('STAGE4','Stage 4',4);

-- Cross-device duplicate-completion tracking for POST /check: the first
-- device to scan a given part at a given stage "completes" it; anyone
-- else scanning the same part+stage afterwards gets MATCHED_ALREADY
-- instead of a false "all good" the phone's own per-day local check
-- can't see across devices/days.
CREATE TABLE IF NOT EXISTS stage_checks (
  part_name    TEXT NOT NULL,
  stage        TEXT NOT NULL,
  first_device TEXT,
  first_time   TEXT NOT NULL,
  PRIMARY KEY (part_name, stage)
);

-- SQLite has no stored procedures; views are the portable equivalent for
-- canned reports and translate directly to CREATE VIEW on Postgres/MySQL/
-- SQL Server later.
CREATE VIEW IF NOT EXISTS v_daily_summary AS
  SELECT date, flag, COUNT(*) AS cnt
  FROM scans
  GROUP BY date, flag;
