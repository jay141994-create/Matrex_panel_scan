# Matrex scan receiver

Backend for the phone app's Settings → Receiver URL. Every scan syncs here
(debounced ~1.2s after each scan, plus midnight/manual/retry), and every
scan gets a live cross-device duplicate-completion check.

Only **approved devices** can write. A new phone shows up as PENDING and
is rejected everywhere until approved from the admin dashboard — this is
the access control for the public tunnel URL (see repo root for tunnel setup).

## Run

```
npm install
npm start          # listens on :8765 (set PORT env var to change)
```

Data file: `server/data/matrex.db` (SQLite, WAL mode). Browse it with
**DB Browser for SQLite** — open that file, use "Browse Data" for tabular
viewing and "Execute SQL" for reports.

`schema.sql` has one starter view (`v_daily_summary`) and two reference
tables you'll likely want to edit directly in DB Browser as things evolve:

- `stages` — the stage picker's reference data (seeded with 4 placeholders)
- `stage_checks` — first-completion record per (part_name, stage), backing `/check`

## Endpoints

- `GET /health` — used by the app's "Test Connection" button
- `GET /stages` — reference data for the phone's stage picker
- `POST /devices/register` — a phone registers itself (lands as PENDING)
- `GET /devices/:id/status` — check a device's current approval status
- `POST /upload` — **gated**, resends the whole day's rows array each call; upserts by `scan_id`, also writes the CSV to `server/uploads/` as a backup
- `POST /check` — **gated**, live per-scan lookup: has this exact part already been completed at this stage, by anyone, ever? (`MATCHED_NEW` / `MATCHED_ALREADY` / `NO_SUCH_STAGE`)
- `GET /scans?date=&device_id=&limit=` — reporting read, admin-key only
- `GET /admin/api/devices`, `POST /admin/api/devices/:id/approve|revoke` — admin-key only; `server/public/admin.html` is the dashboard UI for these

Admin key lives in `server/data/admin-key.txt` (generated on first run, gitignored).

**Known limitation:** `/check` only tracks *cross-device duplicate completion* —
it does not yet validate that a scanned part is actually expected at that
stage (`NOT_EXPECTED` in the app's UI is never returned). That needs a real
master parts-per-stage list, which nothing currently supplies. Add a
`expected_parts (part_name, stage)` table once that data source exists —
`/check` would look it up before the duplicate check.

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
