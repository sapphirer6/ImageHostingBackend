const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { getSetting, setSetting, getAllSettings, addImage, getImage, getAllImages, deleteImage } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR);
}

app.use(cors());
app.use(express.json());

// Trust proxy for Cloudflare
app.set('trust proxy', true);

// --- Blocking middleware ---
app.use((req, res, next) => {
  // IP block
  const blockedIps = JSON.parse(getSetting('blocked_ips') || '[]');
  const clientIp = req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.ip;
  if (blockedIps.some(ip => clientIp.includes(ip))) {
    return res.status(403).send('Forbidden');
  }

  // UA block
  const blockedUas = JSON.parse(getSetting('blocked_uas') || '[]');
  const ua = req.headers['user-agent'] || '';
  if (blockedUas.some(blocked => ua.toLowerCase().includes(blocked.toLowerCase()))) {
    return res.status(403).send('Forbidden');
  }

  next();
});

// --- Multer setup (no limits, no transforms) ---
const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const id = uuidv4();
    req.imageId = id;
    cb(null, id + ext);
  }
});
const upload = multer({ storage });

// --- Image serving ---
app.get('/i/:id', (req, res) => {
  const image = getImage(req.params.id);
  if (!image) return res.status(404).send('Not found');

  const ext = path.extname(image.original_name);
  const filePath = path.join(UPLOADS_DIR, image.id + ext);

  if (!fs.existsSync(filePath)) return res.status(404).send('File not found');

  res.setHeader('Content-Type', image.mime_type);
  res.setHeader('Cache-Control', 'public, max-age=31536000');

  const sendContentLength = getSetting('send_content_length') === 'true';
  if (sendContentLength) {
    res.setHeader('Content-Length', image.size);
  }

  const stream = fs.createReadStream(filePath);
  stream.pipe(res);
});

// --- API: Upload ---
app.post('/api/upload', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const id = req.imageId;
  addImage(id, req.file.originalname, req.file.mimetype, req.file.size);

  res.json({ id, url: `/i/${id}` });
});

// --- API: List images ---
app.get('/api/images', (req, res) => {
  res.json(getAllImages());
});

// --- API: Delete image ---
app.delete('/api/images/:id', (req, res) => {
  const image = getImage(req.params.id);
  if (!image) return res.status(404).json({ error: 'Not found' });

  const ext = path.extname(image.original_name);
  const filePath = path.join(UPLOADS_DIR, image.id + ext);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  deleteImage(req.params.id);
  res.json({ ok: true });
});

// --- API: Settings ---
app.get('/api/settings', (req, res) => {
  res.json(getAllSettings());
});

app.put('/api/settings', (req, res) => {
  const { key, value } = req.body;
  if (!key) return res.status(400).json({ error: 'Missing key' });
  setSetting(key, value);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Image hosting API running on http://localhost:${PORT}`);
});
