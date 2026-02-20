const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'imagehost.db'));

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS images (
    id TEXT PRIMARY KEY,
    original_name TEXT,
    mime_type TEXT,
    size INTEGER,
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

// Insert defaults if not present
const defaults = {
  send_content_length: 'true',
  blocked_ips: '[]',
  blocked_uas: '[]'
};

const upsert = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
for (const [k, v] of Object.entries(defaults)) {
  upsert.run(k, v);
}

function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setSetting(key, value) {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

function getAllSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const obj = {};
  for (const row of rows) {
    obj[row.key] = row.value;
  }
  return obj;
}

function addImage(id, originalName, mimeType, size) {
  db.prepare('INSERT INTO images (id, original_name, mime_type, size) VALUES (?, ?, ?, ?)').run(id, originalName, mimeType, size);
}

function getImage(id) {
  return db.prepare('SELECT * FROM images WHERE id = ?').get(id);
}

function getAllImages() {
  return db.prepare('SELECT * FROM images ORDER BY uploaded_at DESC').all();
}

function deleteImage(id) {
  return db.prepare('DELETE FROM images WHERE id = ?').run(id);
}

module.exports = { db, getSetting, setSetting, getAllSettings, addImage, getImage, getAllImages, deleteImage };
