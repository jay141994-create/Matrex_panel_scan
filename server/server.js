const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');
const db = require('./db');

// ── ADMIN KEY — generated once, kept out of git (server/data/ is gitignored) ──
const ADMIN_KEY_PATH = path.join(__dirname, 'data', 'admin-key.txt');
let ADMIN_KEY;
if (fs.existsSync(ADMIN_KEY_PATH)) {
  ADMIN_KEY = fs.readFileSync(ADMIN_KEY_PATH, 'utf8').trim();
} else {
  ADMIN_KEY = require('crypto').randomBytes(24).toString('hex');
  fs.mkdirSync(path.dirname(ADMIN_KEY_PATH), { recursive: true });
  fs.writeFileSync(ADMIN_KEY_PATH, ADMIN_KEY, 'utf8');
  console.log('Generated new admin key — see server/data/admin-key.txt');
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' })); // /upload carries the whole day's rows
app.use(express.static(path.join(__dirname, 'public')));

function requireAdmin(req, res, next) {
  if (req.get('X-Admin-Key') !== ADMIN_KEY) return res.status(401).json({ ok: false, error: 'bad admin key' });
  next();
}

// ── DEVICE APPROVAL — gate on the app's own /upload calls ──
const upsertDevice = db.prepare(`
  INSERT INTO devices (device_id, device_name, status, first_seen, last_seen, ip)
  VALUES (@device_id, @device_name, 'PENDING', @now, @now, @ip)
  ON CONFLICT(device_id) DO UPDATE SET device_name=@device_name, last_seen=@now, ip=@ip
`);
const getDevice = db.prepare('SELECT * FROM devices WHERE device_id = ?');
const listDevices = db.prepare('SELECT * FROM devices ORDER BY first_seen DESC');
const setDeviceStatus = db.prepare(`UPDATE devices SET status=@status, approved_at=CASE WHEN @status='APPROVED' THEN @now ELSE approved_at END WHERE device_id=@device_id`);

function deviceGate(req, res, next) {
  const id = (req.body && req.body.device_id) || '';
  if (!id) return res.status(403).json({ ok: false, error: 'device_id required', status: 'UNKNOWN' });
  const row = getDevice.get(id);
  if (!row) return res.status(403).json({ ok: false, error: 'not registered', status: 'UNKNOWN' });
  if (row.status !== 'APPROVED') return res.status(403).json({ ok: false, error: 'not approved', status: row.status });
  next();
}

app.get('/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.post('/devices/register', (req, res) => {
  const { device_id, device_name } = req.body || {};
  if (!device_id) return res.status(400).json({ ok: false, error: 'device_id required' });
  const now = new Date().toISOString();
  upsertDevice.run({ device_id: String(device_id), device_name: device_name || '', now, ip: req.ip });
  res.json({ ok: true, status: getDevice.get(device_id).status });
});
app.get('/devices/:id/status', (req, res) => {
  const row = getDevice.get(req.params.id);
  res.json({ ok: true, status: row ? row.status : 'UNKNOWN' });
});

app.get('/admin/api/devices', requireAdmin, (req, res) => res.json(listDevices.all()));
app.post('/admin/api/devices/:id/approve', requireAdmin, (req, res) => {
  setDeviceStatus.run({ device_id: req.params.id, status: 'APPROVED', now: new Date().toISOString() });
  res.json({ ok: true });
});
app.post('/admin/api/devices/:id/revoke', requireAdmin, (req, res) => {
  setDeviceStatus.run({ device_id: req.params.id, status: 'REVOKED', now: new Date().toISOString() });
  res.json({ ok: true });
});

// ── UPLOAD — the phone resends the *whole day's* rows array on every
// call (debounced after each scan, plus midnight/manual/retry), so this
// upserts by scan_id rather than blindly inserting, and additionally
// writes the CSV to disk as a backup.
const upsertScan = db.prepare(`
  INSERT INTO scans (
    scan_id, date, scanned_at, received_at, device, device_id,
    batch_sheet, project, floor, part_type, part_name, size, qty, colour,
    skid, method, flag, raw
  ) VALUES (
    @scan_id, @date, @scanned_at, @received_at, @device, @device_id,
    @batch_sheet, @project, @floor, @part_type, @part_name, @size, @qty, @colour,
    @skid, @method, @flag, @raw
  )
  ON CONFLICT(scan_id) DO UPDATE SET
    skid=@skid, flag=@flag
`);

app.post('/upload', deviceGate, (req, res) => {
  const b = req.body || {};
  const { filename, csv, rows } = b;
  if (!filename || !csv) return res.status(400).json({ ok: false, error: 'filename and csv required' });

  const dir = path.join(__dirname, 'uploads');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename.replace(/[^a-zA-Z0-9_.-]/g, '_')), csv, 'utf8');

  if (Array.isArray(rows)) {
    const received = new Date().toISOString();
    for (const row of rows) {
      const scanId = row.scanId || `${b.device_id}_${row.time || received}_${row.partName || ''}`;
      upsertScan.run({
        scan_id: String(scanId),
        date: String(row.date || b.date || ''),
        scanned_at: String(row.time || received),
        received_at: received,
        device: b.device || null,
        device_id: b.device_id || null,
        batch_sheet: row.batchSheet || null,
        project: row.project || null,
        floor: row.floor || null,
        part_type: row.partType || null,
        part_name: row.partName || null,
        size: row.size || null,
        qty: row.qty || null,
        colour: row.colour || null,
        skid: row.skid || null,
        method: row.method || null,
        flag: row.flag || null,
        raw: row.raw || null
      });
    }
  }
  res.json({ ok: true });
});

// Reporting only, admin-key protected.
app.get('/scans', requireAdmin, (req, res) => {
  const { date, device_id } = req.query;
  const limit = Math.min(Number(req.query.limit) || 200, 2000);
  let q = 'SELECT * FROM scans WHERE 1=1';
  const params = [];
  if (date) { q += ' AND date = ?'; params.push(date); }
  if (device_id) { q += ' AND device_id = ?'; params.push(device_id); }
  q += ' ORDER BY id DESC LIMIT ?'; params.push(limit);
  res.json(db.prepare(q).all(...params));
});

const PORT = process.env.PORT || 8765;
// Plain HTTP — Cloudflare Tunnel (or a reverse proxy on the company server)
// terminates public TLS and forwards to this process over localhost only.
http.createServer(app).listen(PORT, () => console.log(`Matrex scan server listening on http://localhost:${PORT}`));
