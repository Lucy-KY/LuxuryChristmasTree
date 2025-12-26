import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 4000;

// Ensure upload directory exists
const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-z0-9_.-]/gi, '_');
    cb(null, `${Date.now()}-${safeName}`);
  }
});

const upload = multer({ storage });

app.use(cors());
app.use(express.json());

// Serve uploaded static files
app.use('/uploads', express.static(UPLOAD_DIR));

// Helper: list image files in upload dir
const IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'];
function listUploadFiles(req) {
  try {
    const files = fs.readdirSync(UPLOAD_DIR).filter(f => IMAGE_EXT.includes(path.extname(f).toLowerCase()));
    return files.map(f => `${req.protocol}://${req.get('host')}/uploads/${f}`);
  } catch (err) {
    console.error('Error listing uploads:', err);
    return [];
  }
}

// Clear uploads directory
function clearUploads() {
  try {
    const files = fs.readdirSync(UPLOAD_DIR);
    for (const f of files) fs.unlinkSync(path.join(UPLOAD_DIR, f));
    console.log('Cleared upload directory');
  } catch (err) {
    console.error('Error clearing uploads:', err);
  }
}

// Clear on server start so uploads are always temporary per run
clearUploads();

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
  const url = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
  console.log('Uploaded file:', req.file.filename, 'url:', url);
  res.json({ url });
});

// Return list of uploaded pictures
app.get('/api/pictures', (req, res) => {
  const list = listUploadFiles(req);
  res.json(list);
});

// Clear uploaded pictures (DELETE)
app.delete('/api/pictures', (req, res) => {
  clearUploads();
  res.json({ ok: true });
});

// Also accept POST via navigator.sendBeacon fallback
app.post('/api/pictures/clear', (req, res) => {
  clearUploads();
  res.json({ ok: true });
});

app.listen(PORT, () => console.log(`Upload server listening on http://localhost:${PORT}`));
