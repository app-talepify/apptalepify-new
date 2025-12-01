const express = require('express');
const Busboy = require('busboy');
const admin = require('firebase-admin');

// Ortam değişkenleri
const BUNNY_STORAGE_ZONE = process.env.BUNNY_STORAGE_ZONE || 'talepify-media';
const BUNNY_STORAGE_HOST = process.env.BUNNY_STORAGE_HOST || 'storage.bunnycdn.com';
const BUNNY_ACCESS_KEY = process.env.BUNNY_ACCESS_KEY || process.env.BUNNY_ACCESS_KEY_FALLBACK; // local için fallback
const BUNNY_CDN_HOST = process.env.BUNNY_CDN_HOST || 'media.talepify.com';
const CONVERT_HEIC_TO_JPEG = String(process.env.CONVERT_HEIC_TO_JPEG || 'false') === 'true';
const DISABLE_AUTH = String(process.env.DISABLE_AUTH || 'false') === 'true';
// console.log('[MEDIA] 🔓 DISABLE_AUTH =', DISABLE_AUTH, '(env:', process.env.DISABLE_AUTH, ')');

if (!admin.apps.length) {
  try { admin.initializeApp(); } catch (_) {}
}

const app = express();

// Basit istek loglama
app.use((req, _res, next) => { console.log(`[MEDIA] ${req.method} ${req.url}`); next(); });

app.get('/health', (_req, res) => res.json({ ok: true, service: 'bunny-media-local' }));

async function verifyAuth(req, res, next) {
  try {
    if (DISABLE_AUTH) return next();
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Yetkisiz: token eksik' });
    await admin.auth().verifyIdToken(token);
    next();
  } catch (e) {
    console.error('[MEDIA] Auth hata:', e?.message || e);
    return res.status(401).json({ error: 'Yetkisiz' });
  }
}

app.post('/uploadImage', verifyAuth, (req, res) => {
  try {
    const busboy = Busboy({ headers: req.headers });
    let uploadPath = 'images/profiles';
    let fileInfo = { filename: null, mime: null };
    const chunks = [];

    busboy.on('field', (name, value) => {
      if (name === 'path' && (value === 'images/profiles' || value === 'images/portfolios')) uploadPath = value;
    });

    busboy.on('file', (_name, file, info) => {
      fileInfo.filename = info.filename || `upload-${Date.now()}`;
      fileInfo.mime = info.mimeType || 'application/octet-stream';
      file.on('data', (d) => chunks.push(d));
    });

    busboy.on('finish', async () => {
      try {
        if (!fileInfo.filename || chunks.length === 0) return res.status(400).json({ error: 'Dosya bulunamadı' });
        let bodyBuffer = Buffer.concat(chunks);
        let contentType = fileInfo.mime;
        let effectiveFilename = `${Date.now()}_${fileInfo.filename}`;

        if (CONVERT_HEIC_TO_JPEG && /heic|heif/i.test(contentType)) {
          try {
            const sharp = require('sharp');
            bodyBuffer = await sharp(bodyBuffer).jpeg({ quality: 90 }).toBuffer();
            contentType = 'image/jpeg';
            effectiveFilename = effectiveFilename.replace(/\.(heic|heif)$/i, '.jpg');
          } catch (_) {}
        }

        const storagePath = `${uploadPath}/${effectiveFilename}`;
        const url = `https://${BUNNY_STORAGE_HOST}/${BUNNY_STORAGE_ZONE}/${storagePath}`;

        const resp = await fetch(url, {
          method: 'PUT',
          headers: { 'AccessKey': BUNNY_ACCESS_KEY, 'Content-Type': contentType, 'Content-Length': String(bodyBuffer.length) },
          body: bodyBuffer,
        });
        if (!resp.ok) {
          const t = await resp.text().catch(() => '');
          console.error('[MEDIA] Bunny PUT hata:', resp.status, t);
          return res.status(502).json({ error: 'Bunny yükleme hatası' });
        }
        // Türkçe: URL'i zorla media.talepify.com domain'i ile döndür
        const cdnUrl = `https://media.talepify.com/${storagePath}`;
        // console.log('[MEDIA] 🎯 Dönen CDN URL:', cdnUrl);
        return res.json({ cdnUrl, storagePath, size: bodyBuffer.length, contentType });
      } catch (e) {
        console.error('[MEDIA] Upload hata:', e?.message || e);
        return res.status(500).json({ error: 'Sunucu hatası' });
      }
    });

    req.pipe(busboy);
  } catch (e) {
    console.error('[MEDIA] Genel hata:', e?.message || e);
    return res.status(500).json({ error: 'Sunucu hatası' });
  }
});

app.post('/deleteImage', verifyAuth, express.json(), async (req, res) => {
  try {
    const { storagePath } = req.body || {};
    if (!storagePath) return res.status(400).json({ error: 'storagePath zorunludur' });
    const url = `https://${BUNNY_STORAGE_HOST}/${BUNNY_STORAGE_ZONE}/${storagePath}`;
    const r = await fetch(url, { method: 'DELETE', headers: { 'AccessKey': BUNNY_ACCESS_KEY } });
    if (!r.ok) return res.status(502).json({ error: 'Bunny silme hatası' });
    return res.json({ ok: true });
  } catch (e) {
    console.error('[MEDIA] Delete hata:', e?.message || e);
    return res.status(500).json({ error: 'Sunucu hatası' });
  }
});

app.get('/downloadOriginal', async (req, res) => {
  try {
    const { url, name } = req.query;
    if (!url) return res.status(400).send('url zorunludur');
    const filename = name || 'download';
    const upstream = await fetch(url);
    if (!upstream.ok) return res.status(502).send('Kaynak indirilemiyor');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/octet-stream');
    upstream.body.pipe(res);
  } catch (e) {
    console.error('[MEDIA] Download hata:', e?.message || e);
    res.status(500).send('Sunucu hatası');
  }
});

const PORT = process.env.PORT || 4001;
app.listen(PORT, () => console.log(`Media server running on http://localhost:${PORT}`));
