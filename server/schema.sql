CREATE TABLE IF NOT EXISTS scans (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  scan_id       TEXT NOT NULL UNIQUE,
  status        TEXT NOT NULL,
  date          TEXT NOT NULL,
  scanned_at    TEXT NOT NULL,
  received_at   TEXT NOT NULL,
  device        TEXT,
  part_name     TEXT,
  batch_sheet   TEXT,
  project       TEXT,
  floor         TEXT,
  part_type     TEXT,
  size          TEXT,
  qty           TEXT,
  colour        TEXT,
  skid          TEXT,
  method        TEXT,
  flag          TEXT,
  error_reason  TEXT,
  raw           TEXT
);

CREATE INDEX IF NOT EXISTS idx_scans_date   ON scans(date);
CREATE INDEX IF NOT EXISTS idx_scans_status ON scans(status);
CREATE INDEX IF NOT EXISTS idx_scans_device ON scans(device);

-- Device approval gate: a phone must be explicitly approved here before
-- any of its /scan writes are accepted. Unknown or pending device_ids are
-- rejected — this is the access control for the public tunnel URL.
CREATE TABLE IF NOT EXISTS devices (
  device_id    TEXT PRIMARY KEY,
  device_name  TEXT,
  status       TEXT NOT NULL DEFAULT 'PENDING', -- PENDING | APPROVED | REVOKED
  first_seen   TEXT NOT NULL,
  last_seen    TEXT,
  approved_at  TEXT,
  ip           TEXT
);

-- SQLite has no stored procedures; views are the portable equivalent for
-- canned reports and translate directly to CREATE VIEW on Postgres/MySQL/
-- SQL Server later.
CREATE VIEW IF NOT EXISTS v_daily_summary AS
  SELECT date, status, COUNT(*) AS cnt
  FROM scans
  GROUP BY date, status;

CREATE VIEW IF NOT EXISTS v_flagged AS
  SELECT * FROM scans
  WHERE status IN ('DUPLICATE','WRONG_PART','REJECTED_INVALID','REJECTED_NO_NAME','DUPLICATE_SKIPPED');
