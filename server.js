const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { initDb, getSetting, setSetting, getAllSettings, addImage, getImage, getAllImages, deleteImage } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR);
}

app.use(cors({
  origin: 'https://image-hosting-two.vercel.app'
}));
app.use(express.json());

// Trust proxy for Cloudflare
app.set('trust proxy', true);

// --- Blocking middleware ---
app.use(async (req, res, next) => {
  try {
    const blockedIps = JSON.parse(await getSetting('blocked_ips') || '[]');
    const clientIp = req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.ip;
    if (blockedIps.some(ip => clientIp.includes(ip))) {
      return res.status(403).send('Forbidden');
    }

    const blockedUas = JSON.parse(await getSetting('blocked_uas') || '[]');
    const ua = req.headers['user-agent'] || '';
    if (blockedUas.some(blocked => ua.toLowerCase().includes(blocked.toLowerCase()))) {
      return res.status(403).send('Forbidden');
    }

    next();
  } catch (err) {
    next(err);
  }
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
app.get('/i/:id/:filename?', async (req, res) => {
  try {
    const image = await getImage(req.params.id);
    if (!image) return res.status(404).send('Not found');

    const ext = path.extname(image.original_name);
    const filePath = path.join(UPLOADS_DIR, image.id + ext);

    if (!fs.existsSync(filePath)) return res.status(404).send('File not found');

    res.setHeader('Content-Type', image.mime_type);
    res.setHeader('Cache-Control', 'public, max-age=31536000');

    const sendContentLength = (await getSetting('send_content_length')) === 'true';
    if (sendContentLength) {
      res.setHeader('Content-Length', image.size);
    }

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  } catch (err) {
    res.status(500).send('Internal server error');
  }
});

// --- API: Upload ---
app.post('/api/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const id = req.imageId;
    await addImage(id, req.file.originalname, req.file.mimetype, req.file.size);

    const originalName = encodeURIComponent(req.file.originalname);
    res.json({ id, url: `/i/${id}/${originalName}` });
  } catch (err) {
    res.status(500).json({ error: 'Upload failed' });
  }
});

// --- API: List images ---
app.get('/api/images', async (req, res) => {
  try {
    res.json(await getAllImages());
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch images' });
  }
});

// --- API: Delete image ---
app.delete('/api/images/:id', async (req, res) => {
  try {
    const image = await getImage(req.params.id);
    if (!image) return res.status(404).json({ error: 'Not found' });

    const ext = path.extname(image.original_name);
    const filePath = path.join(UPLOADS_DIR, image.id + ext);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    await deleteImage(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Delete failed' });
  }
});

// --- API: Settings ---
app.get('/api/settings', async (req, res) => {
  try {
    res.json(await getAllSettings());
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

app.put('/api/settings', async (req, res) => {
  try {
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ error: 'Missing key' });
    await setSetting(key, value);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update setting' });
  }
});

// Health check that doesn't hit the DB
app.get('/health', (req, res) => {
  res.json({ ok: true });
});

initDb().then(() => {
  console.log('Database initialized successfully');
  app.listen(PORT, () => {
    console.log(`Image hosting API running on http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
