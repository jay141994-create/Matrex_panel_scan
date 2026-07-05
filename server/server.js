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
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function requireAdmin(req, res, next) {
  if (req.get('X-Admin-Key') !== ADMIN_KEY) return res.status(401).json({ ok: false, error: 'bad admin key' });
  next();
}

const insertScan = db.prepare(`
  INSERT INTO scans (
    scan_id, status, date, scanned_at, received_at, device,
    part_name, batch_sheet, project, floor, part_type, size, qty, colour,
    skid, method, flag, error_reason, raw
  ) VALUES (
    @scan_id, @status, @date, @scanned_at, @received_at, @device,
    @part_name, @batch_sheet, @project, @floor, @part_type, @size, @qty, @colour,
    @skid, @method, @flag, @error_reason, @raw
  )
`);

const upsertDevice = db.prepare(`
  INSERT INTO devices (device_id, device_name, status, first_seen, last_seen, ip)
  VALUES (@device_id, @device_name, 'PENDING', @now, @now, @ip)
  ON CONFLICT(device_id) DO UPDATE SET device_name=@device_name, last_seen=@now, ip=@ip
`);
const getDevice = db.prepare('SELECT * FROM devices WHERE device_id = ?');
const listDevices = db.prepare('SELECT * FROM devices ORDER BY first_seen DESC');
const setDeviceStatus = db.prepare(`UPDATE devices SET status=@status, approved_at=CASE WHEN @status='APPROVED' THEN @now ELSE approved_at END WHERE device_id=@device_id`);

app.get('/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// ── DEVICE REGISTRATION — public (a new phone must be able to ask to join).
// New devices land as PENDING and are rejected everywhere else until an
// admin approves them from the dashboard.
app.post('/devices/register', (req, res) => {
  const { device_id, device_name } = req.body || {};
  if (!device_id) return res.status(400).json({ ok: false, error: 'device_id required' });
  const now = new Date().toISOString();
  upsertDevice.run({ device_id: String(device_id), device_name: device_name || '', now, ip: req.ip });
  const row = getDevice.get(device_id);
  res.json({ ok: true, status: row.status });
});

app.get('/devices/:id/status', (req, res) => {
  const row = getDevice.get(req.params.id);
  res.json({ ok: true, status: row ? row.status : 'UNKNOWN' });
});

// ── ADMIN — approval dashboard API, key-protected regardless of whether
// it's reached via the LAN or the public tunnel URL.
app.get('/admin/api/devices', requireAdmin, (req, res) => {
  res.json(listDevices.all());
});
app.post('/admin/api/devices/:id/approve', requireAdmin, (req, res) => {
  setDeviceStatus.run({ device_id: req.params.id, status: 'APPROVED', now: new Date().toISOString() });
  res.json({ ok: true });
});
app.post('/admin/api/devices/:id/revoke', requireAdmin, (req, res) => {
  setDeviceStatus.run({ device_id: req.params.id, status: 'REVOKED', now: new Date().toISOString() });
  res.json({ ok: true });
});

function deviceGate(req, res, next) {
  const id = (req.body && req.body.device_id) || '';
  if (!id) return res.status(403).json({ ok: false, error: 'device_id required' });
  const row = getDevice.get(id);
  if (!row) return res.status(403).json({ ok: false, error: 'not registered', status: 'UNKNOWN' });
  if (row.status !== 'APPROVED') return res.status(403).json({ ok: false, error: 'not approved', status: row.status });
  next();
}

// Real-time write path — one row per scan attempt, success or error.
// Gated: only approved devices can write.
app.post('/scan', deviceGate, (req, res) => {
  const b = req.body || {};
  if (!b.scan_id || !b.status) {
    return res.status(400).json({ ok: false, error: 'scan_id and status are required' });
  }
  const row = {
    scan_id: String(b.scan_id),
    status: String(b.status),
    date: String(b.date || ''),
    scanned_at: String(b.scanned_at || new Date().toISOString()),
    received_at: new Date().toISOString(),
    device: b.device || null,
    part_name: b.part_name || null,
    batch_sheet: b.batch_sheet || null,
    project: b.project || null,
    floor: b.floor || null,
    part_type: b.part_type || null,
    size: b.size || null,
    qty: b.qty || null,
    colour: b.colour || null,
    skid: b.skid || null,
    method: b.method || null,
    flag: b.flag || null,
    error_reason: b.error_reason || null,
    raw: b.raw || null
  };
  try {
    insertScan.run(row);
  } catch (e) {
    if (String(e.message).includes('UNIQUE constraint')) {
      return res.json({ ok: true, duplicate: true }); // retried POST, already stored
    }
    return res.status(500).json({ ok: false, error: e.message });
  }
  res.json({ ok: true, scan_id: row.scan_id });
});

// Read path — reporting only, admin-key protected (not a phone-facing route).
app.get('/scans', requireAdmin, (req, res) => {
  const { date, status } = req.query;
  const limit = Math.min(Number(req.query.limit) || 200, 2000);
  let q = 'SELECT * FROM scans WHERE 1=1';
  const params = [];
  if (date) { q += ' AND date = ?'; params.push(date); }
  if (status) { q += ' AND status = ?'; params.push(status); }
  q += ' ORDER BY id DESC LIMIT ?'; params.push(limit);
  res.json(db.prepare(q).all(...params));
});

// Legacy once-a-day CSV upload, kept for backward compatibility with the
// existing app Settings screen — same device approval gate as /scan.
app.post('/upload', deviceGate, (req, res) => {
  const { filename, csv } = req.body || {};
  if (!filename || !csv) return res.status(400).json({ ok: false, error: 'filename and csv required' });
  const dir = path.join(__dirname, 'uploads');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename.replace(/[^a-zA-Z0-9_.-]/g, '_')), csv, 'utf8');
  res.json({ ok: true });
});

const PORT = process.env.PORT || 8765;
// Plain HTTP — Cloudflare Tunnel (or a reverse proxy on the company server)
// terminates public TLS and forwards to this process over localhost only.
http.createServer(app).listen(PORT, () => console.log(`Matrex scan server listening on http://localhost:${PORT}`));
