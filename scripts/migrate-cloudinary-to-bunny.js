#!/usr/bin/env node
/**
 * Türkçe: Cloudinary -> Bunny migrasyon betiği (idempotent)
 * Gereken env:
 * - GOOGLE_APPLICATION_CREDENTIALS (firebase admin SA json)
 * - BUNNY_STORAGE_ZONE, BUNNY_STORAGE_HOST, BUNNY_ACCESS_KEY, BUNNY_CDN_HOST
 */

import admin from 'firebase-admin';

const {
  BUNNY_STORAGE_ZONE,
  BUNNY_STORAGE_HOST = 'storage.bunnycdn.com',
  BUNNY_ACCESS_KEY,
  BUNNY_CDN_HOST = 'media.talepify.com',
} = process.env;

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

function isCloudinaryUrl(url) {
  return typeof url === 'string' && url.includes('res.cloudinary.com');
}

async function putToBunny(buffer, contentType, storagePath) {
  const url = `https://${BUNNY_STORAGE_HOST}/${BUNNY_STORAGE_ZONE}/${storagePath}`;
  const resp = await fetch(url, {
    method: 'PUT',
    headers: { 'AccessKey': BUNNY_ACCESS_KEY, 'Content-Type': contentType, 'Content-Length': String(buffer.length) },
    body: buffer,
  });
  if (!resp.ok) throw new Error(`Bunny PUT hata: ${resp.status}`);
}

async function downloadBytes(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Kaynak indirilemedi: ${r.status}`);
  const arrayBuffer = await r.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function migrateCollection(col) {
  console.log(`➡️ Koleksiyon işleniyor: ${col}`);
  const snap = await db.collection(col).get();
  let migrated = 0;
  for (const doc of snap.docs) {
    const data = doc.data();

    // images alanı (dizi) üzerinden çalış
    const images = Array.isArray(data.images) ? data.images : [];
    const imagesMeta = Array.isArray(data.imagesMeta) ? data.imagesMeta : [];
    let changed = false;

    for (let i = 0; i < images.length; i++) {
      const url = images[i];
      if (!isCloudinaryUrl(url)) continue;

      // Idempotency: Eğer storagePath zaten varsa atla
      const existingMeta = imagesMeta[i];
      if (existingMeta && existingMeta.storagePath) continue;

      try {
        console.log(`📥 İndiriliyor: ${url}`);
        const buf = await downloadBytes(url);
        const contentType = 'image/jpeg'; // Cloudinary orijinali çoğu zaman jpeg
        const storagePath = `images/portfolios/${Date.now()}_${i}.jpg`;
        await putToBunny(buf, contentType, storagePath);
        const cdnUrl = `https://${BUNNY_CDN_HOST}/${storagePath}`;

        images[i] = cdnUrl; // UI kırılmasın diye string URL güncelle
        imagesMeta[i] = { originalUrl: cdnUrl, storagePath, size: buf.length, createdAt: new Date().toISOString() };
        migrated++;
        changed = true;
        console.log(`✅ Taşındı -> ${cdnUrl}`);
      } catch (e) {
        console.error('🟥 Taşıma hatası:', e.message);
      }
    }

    if (changed) {
      await doc.ref.update({ images, imagesMeta });
    }
  }
  console.log(`✔️ ${col} koleksiyonu tamamlandı. Migrated: ${migrated}`);
}

(async () => {
  console.log('🚚 Migrasyon başladı');
  await migrateCollection('portfolios');
  await migrateCollection('requests');
  console.log('🏁 Migrasyon bitti');
  process.exit(0);
})();
