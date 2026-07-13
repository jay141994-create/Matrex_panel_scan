const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'matrex.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA synchronous = NORMAL');
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

// CREATE TABLE IF NOT EXISTS in schema.sql only applies to brand-new
// databases — a table that already exists never gets new columns from it.
// This adds any columns schema.sql has picked up since the table was
// first created, safe to run on every boot (no-op once already applied).
function ensureColumn(table, column, definition) {
  const existing = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
  if (!existing.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
ensureColumn('scans', 'unique_id', 'TEXT');
ensureColumn('scans', 'match_status', 'TEXT');

module.exports = db;
