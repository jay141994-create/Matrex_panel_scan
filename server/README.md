# Matrex scan receiver

Real-time datastore for every scan the phone app produces — success, duplicate,
wrong-part, manual, and rejected/error scans all land here as one row each.

## Run

```
npm install
npm start          # listens on :8765 (set PORT env var to change)
```

Data file: `server/data/matrex.db` (SQLite, WAL mode). Browse it with
**DB Browser for SQLite** (installed on this machine) — open that file, use the
"Browse Data" tab for tabular viewing and "Execute SQL" for reports.

Two starter views are in `schema.sql` for quick reporting (SQLite has no
stored procedures, so views are the equivalent — see "Migrating" below):

- `v_daily_summary` — counts per date/status
- `v_flagged` — every duplicate / wrong-part / rejected row

## Endpoints

- `POST /scan` — insert one scan event (fire-and-forget from the app)
- `GET /scans?date=&status=&limit=` — read rows back, for reports/dashboards
- `GET /health` — used by the app's "Test Connection" button
- `POST /upload` — legacy once-daily CSV file drop (kept for the existing Settings screen)

## Migrating to the company server

Everything is written to be a drop-in move, not a rewrite:

- All DB access goes through `db.js` only — swapping SQLite for
  Postgres/MySQL later means rewriting that one file, not the routes.
- Config is env-driven (`PORT`, `DB_PATH`) — no hardcoded paths.
- `schema.sql` is plain DDL — replay it (or its translated equivalent) on the new DB.
- No native build step (`node:sqlite` ships with Node itself) — the new
  server just needs `npm install` + Node 22.5+.
- On the phone: change the Receiver URL in Settings to the new server's
  address. Nothing else in the app changes.
