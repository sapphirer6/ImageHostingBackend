const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS images (
      id TEXT PRIMARY KEY,
      original_name TEXT,
      mime_type TEXT,
      size INTEGER,
      uploaded_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  const defaults = {
    send_content_length: 'true',
    blocked_ips: '[]',
    blocked_uas: '[]',
  };

  for (const [k, v] of Object.entries(defaults)) {
    await pool.query(
      'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING',
      [k, v]
    );
  }
}

async function getSetting(key) {
  const { rows } = await pool.query('SELECT value FROM settings WHERE key = $1', [key]);
  return rows.length > 0 ? rows[0].value : null;
}

async function setSetting(key, value) {
  await pool.query(
    'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
    [key, value]
  );
}

async function getAllSettings() {
  const { rows } = await pool.query('SELECT key, value FROM settings');
  const obj = {};
  for (const row of rows) {
    obj[row.key] = row.value;
  }
  return obj;
}

async function addImage(id, originalName, mimeType, size) {
  await pool.query(
    'INSERT INTO images (id, original_name, mime_type, size) VALUES ($1, $2, $3, $4)',
    [id, originalName, mimeType, size]
  );
}

async function getImage(id) {
  const { rows } = await pool.query('SELECT * FROM images WHERE id = $1', [id]);
  return rows[0] || undefined;
}

async function getAllImages() {
  const { rows } = await pool.query('SELECT * FROM images ORDER BY uploaded_at DESC');
  return rows;
}

async function deleteImage(id) {
  await pool.query('DELETE FROM images WHERE id = $1', [id]);
}

module.exports = { pool, initDb, getSetting, setSetting, getAllSettings, addImage, getImage, getAllImages, deleteImage };
