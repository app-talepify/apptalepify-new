#!/usr/bin/env node
/**
 * Firestore seed script (Admin SDK)
 * Kullanım:
 *   set GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\service-account.json
 *   node scripts/seed-firestore.js
 */

import admin from 'firebase-admin';

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('GOOGLE_APPLICATION_CREDENTIALS env eksik. Service account JSON yolunu ayarlayın.');
  process.exit(1);
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    storageBucket: 'apptalepify-14dbc.firebasestorage.app',
  });
}

const db = admin.firestore();

function ts() {
  return admin.firestore.FieldValue.serverTimestamp();
}

async function upsert(docRef, data) {
  const snap = await docRef.get();
  if (snap.exists) {
    await docRef.set({ ...data, updatedAt: ts() }, { merge: true });
  } else {
    await docRef.set({ ...data, createdAt: ts(), updatedAt: ts() });
  }
}

async function main() {
  const demoUserId = 'demo-user-1';

  // Users
  await upsert(db.collection('users').doc(demoUserId), {
    displayName: 'Demo Danışman',
    email: 'demo@talepify.com',
    phone: '+90 555 000 00 00',
    city: 'İstanbul',
    createdBySeed: true,
  });

  // Portfolios
  const portfolios = [
    {
      title: 'Boğaz Manzaralı Daire',
      city: 'İstanbul',
      district: 'Beşiktaş',
      propertyType: 'Daire',
      price: 12500000,
      area: 140,
      rooms: '3+1',
      isPublished: true,
      images: 'https://media.talepify.com/images/portfolios/sample1.jpg',
      userId: demoUserId,
    },
    {
      title: 'Modern Villa - Çekmeköy',
      city: 'İstanbul',
      district: 'Çekmeköy',
      propertyType: 'Villa',
      price: 28500000,
      area: 320,
      rooms: '5+1',
      isPublished: true,
      images: 'https://media.talepify.com/images/portfolios/sample2.jpg',
      userId: demoUserId,
    },
  ];

  for (const p of portfolios) {
    const ref = db.collection('portfolios').doc();
    await ref.set({ ...p, createdAt: ts(), updatedAt: ts() });
  }

  // Requests
  const requests = [
    {
      title: 'Anadolu Yakası 2+1 Daire',
      city: 'İstanbul',
      district: 'Kadıköy',
      propertyType: 'Daire',
      minPrice: 5000000,
      maxPrice: 9000000,
      minArea: 90,
      maxArea: 140,
      isPublished: true,
      publishToPool: true,
      userId: demoUserId,
    },
  ];

  for (const r of requests) {
    const ref = db.collection('requests').doc();
    await ref.set({ ...r, createdAt: ts(), updatedAt: ts() });
  }

  console.log('✅ Seed tamamlandı.');
}

main().catch((e) => {
  console.error('❌ Seed hatası:', e);
  process.exit(1);
});


