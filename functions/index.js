/*
  Türkçe açıklama: Bunny Storage + CDN için yükleme/silme/indirme uçları.
  Firebase Auth Custom Token endpoints.
  Güvenlik: Firebase ID token doğrulaması, AccessKey sadece sunucu tarafında.
*/

const express = require('express');
const Busboy = require('busboy');
const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Auth routes - Custom Token sistemi
const { 
  requestOtpHandler, 
  verifyOtpHandler, 
  loginWithOtpHandler, 
  passwordLoginHandler,
  checkPhoneHandler,
  registerWithOtpHandler
} = require('./authRoutes');

const { db } = require('./admin'); // admin.js'ten db'yi import et
const { SUBSCRIPTION_PLANS, PLAN_DURATIONS } = require('./utils/subscription'); // subscription utils
const { completeReferralAndGrantReward } = require('./notify');

// Config kaynakları: process.env (Secrets + Env) ve functions.config() (runtime config)
const cfg = functions.config?.() || {};

const BUNNY_STORAGE_ZONE = process.env.BUNNY_STORAGE_ZONE || cfg.bunny?.storage_zone || 'talepify-media2';
const BUNNY_STORAGE_HOST = process.env.BUNNY_STORAGE_HOST || cfg.bunny?.storage_host || 'storage.bunnycdn.com';
// Secret öncelik: Secret Manager (process.env) yoksa config fallback kullan
const BUNNY_STORAGE_KEY = process.env.BUNNY_STORAGE_KEY || cfg.bunny?.storage_key;
const BUNNY_CDN_HOST = process.env.BUNNY_CDN_HOST || cfg.bunny?.cdn_host || 'media.talepify.com';
const CONVERT_HEIC_TO_JPEG = (process.env.CONVERT_HEIC_TO_JPEG || cfg.bunny?.convert_heic_to_jpeg) === 'true';

// Prod güvenlik ayarları
const ALLOW_PUBLIC_UPLOADS = (process.env.ALLOW_PUBLIC_UPLOADS || cfg.bunny?.allow_public_uploads) === 'true';
const MAX_UPLOAD_MB = parseInt(process.env.MAX_UPLOAD_MB || '15');
const FORCE_UNIQUE_FILENAMES = (process.env.FORCE_UNIQUE_FILENAMES || 'true') === 'true';
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS || '*';

// Admin init (idempotent)
if (!admin.apps.length) {
  admin.initializeApp();
}

// ==================================================================
// SUBSCRIPTION CALLABLE FUNCTION
// ==================================================================
exports.extendSubscription = functions
  .region('europe-west1')
  .https.onCall(async (data, context) => {
    // 1. Auth kontrolü
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated', 
        'Bu işlemi yapmak için giriş yapmalısınız.'
      );
    }

    const { planId } = data;
    const userId = context.auth.uid;

    // 2. Plan ID kontrolü
    if (!planId || !SUBSCRIPTION_PLANS[planId]) {
      throw new functions.https.HttpsError(
        'invalid-argument', 
        'Geçersiz bir plan IDsi gönderildi.'
      );
    }
    
    let plan = { ...SUBSCRIPTION_PLANS[planId] }; // Planı kopyala ki orijinali değişmesin
    const userRef = db.collection('users').doc(userId);
    const historyRef = userRef.collection('subscriptionHistory');

    try {
      let newExpiryDate; // Değişkeni transaction dışında tanımla

      // 3. Firestore Transaction ile atomik güncelleme
      await db.runTransaction(async (transaction) => {
        const userDoc = await transaction.get(userRef);
        
        const userData = userDoc.data() || {};
        const currentExpiry = userData.subscriptionExpiryDate?.toDate();
        const isFirstSubscription = !currentExpiry;

        // YENİ: Referans İndirimi Kontrolü
        let finalPrice = plan.price;
        let discountApplied = false;
        if (isFirstSubscription && userData.referredBy) {
            console.log(`Referans indirimi kontrol ediliyor: ${userId}`);
            finalPrice = plan.price * 0.90; // %10 indirim
            discountApplied = true;
            console.log(`İndirim uygulandı. Orijinal Fiyat: ${plan.price}, Yeni Fiyat: ${finalPrice}`);
        }
        
        // Mevcut bitiş tarihi bugünden sonraysa onun üzerine ekle, değilse bugünün üzerine ekle.
        const startDate = (currentExpiry && currentExpiry > new Date()) ? currentExpiry : new Date();
        
        const durationMonths = PLAN_DURATIONS[planId];
        if (typeof durationMonths !== 'number') {
          throw new Error(`Plan için süre tanımı bulunamadı: ${planId}`);
        }

        const calculatedExpiry = new Date(startDate.setMonth(startDate.getMonth() + durationMonths));
        newExpiryDate = calculatedExpiry; // Değeri içeride ata

        // Yazılacak veriyi oluştur.
        const userUpdateData = {
          subscriptionExpiryDate: admin.firestore.Timestamp.fromDate(newExpiryDate),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };
        
        // Eğer doküman yoksa, oluşturma alanlarını ekle.
        if (!userDoc.exists) {
          console.warn(`Kullanıcı dokümanı bulunamadı, oluşturuluyor: ${userId}`);
          userUpdateData.uid = userId;
          userUpdateData.createdAt = admin.firestore.FieldValue.serverTimestamp();
          userUpdateData.email = context.auth.token.email || null;
          userUpdateData.phoneNumber = context.auth.token.phone_number || null;
        }

        // Tek bir "set" komutu ile hem oluşturma hem de güncelleme işlemi yapılır.
        // { merge: true } sayesinde mevcut alanlar korunur.
        transaction.set(userRef, userUpdateData, { merge: true });
        
        // Abonelik geçmişine yeni kayıt ekle
        transaction.set(historyRef.doc(), {
          planId: plan.id,
          planName: plan.name,
          purchaseDate: admin.firestore.FieldValue.serverTimestamp(),
          price: finalPrice, // İndirimli fiyatı kaydet
          originalPrice: plan.price,
          discountApplied: discountApplied,
          durationMonths: durationMonths,
          previousExpiry: currentExpiry ? admin.firestore.Timestamp.fromDate(currentExpiry) : null,
          newExpiry: admin.firestore.Timestamp.fromDate(newExpiryDate)
        });
      });

      // YENİ: Referans Ödülünü Tetikleme
      const userDocAfterTransaction = await userRef.get();
      const finalUserData = userDocAfterTransaction.data();
      if (!finalUserData.subscriptionHistory || finalUserData.subscriptionHistory.length <= 1) {
          if (finalUserData.referredBy) {
              console.log(`İlk abonelik, referans ödülü tetikleniyor: ${userId}`);
              // Bu fonksiyon notify.js içinde olacak ve tüm referans mantığını yönetecek
              await completeReferralAndGrantReward(userId, finalUserData.referredBy);
          }
      }

      console.log(`Abonelik uzatıldı: Kullanıcı ${userId}, Plan ${planId}`);
      return { success: true, newExpiryDate: newExpiryDate.toISOString() };

    } catch (error) {
      console.error('Abonelik uzatma hatası:', error);
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      throw new functions.https.HttpsError(
        'internal', 
        'Abonelik uzatılırken bir sunucu hatası oluştu.',
        error.message
      );
    }
});

const app = express();

// WARMUP ENDPOINT (for cold start optimization)
app.get('/warmup', (_req, res) => {
  res.status(200).send('OK');
});

// CORS middleware with security headers
app.use((req, res, next) => {
  // CORS headers (support CSV origins and reflection)
  try {
    if (ALLOWED_ORIGINS === '*') {
      res.header('Access-Control-Allow-Origin', '*');
    } else {
      const origin = req.headers.origin;
      const list = String(ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
      if (origin && list.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin);
      } else {
        // Fallback to first allowed origin to avoid sending an invalid value
        if (list[0]) {
          res.header('Access-Control-Allow-Origin', list[0]);
        }
      }
    }
  } catch (_) {
    // safe fallback
    res.header('Access-Control-Allow-Origin', '*');
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.header('Access-Control-Allow-Credentials', 'false');
  
  // Security headers
  res.header('X-Content-Type-Options', 'nosniff');
  res.header('X-Frame-Options', 'DENY');
  res.header('X-XSS-Protection', '1; mode=block');
  res.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.header('Content-Security-Policy', "default-src 'self'");
  
  // Remove server info
  res.removeHeader('X-Powered-By');
  
  if (req.method === 'OPTIONS') {
    return res.status(204).send();
  }
  next();
});

// Request size limit for security
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ limit: '1mb', extended: true }));

// Dosya güvenliği için yardımcı fonksiyonlar
function sanitizeFilename(filename) {
  if (!filename) return `upload-${Date.now()}.jpg`;
  // Path traversal engelle ve güvenli karakterlere sınırla
  return filename
    .replace(/\.\./g, '') // .. temizle
    .replace(/^\/+/, '') // Baştaki / temizle
    .replace(/[^A-Za-z0-9._-]/g, '_') // Güvenli karakter seti
    .substring(0, 100); // Max 100 karakter
}

function isAllowedMimeType(mimeType) {
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  return allowed.includes(mimeType?.toLowerCase());
}

function isAllowedAudioMimeType(mimeType) {
  const allowed = ['audio/mp4', 'audio/m4a', 'audio/mpeg', 'audio/aac', 'audio/3gpp', 'audio/amr', 'audio/wav', 'audio/wave'];
  return allowed.includes(mimeType?.toLowerCase());
}

function ensurePublicPath(filename) {
  return filename.startsWith('public/') ? filename : `public/${filename}`;
}

// Auth middleware - Firebase ID token doğrulaması
async function requireAuth(req, res, next) {
  // /health endpoint için auth bypass
  if (req.path === '/health') {
    return next();
  }
  
  // Auth endpoints için bypass
  if (req.path.startsWith('/auth/')) {
    return next();
  }
  
  // Geliştirme ortamı bypass flag'i
  if (ALLOW_PUBLIC_UPLOADS) {
    console.log('🟧 ALLOW_PUBLIC_UPLOADS=true - Auth bypass aktif (sadece geliştirme için!)');
    // Dev ortamında kimliği ilet (mock/test akışları için)
    try { req.userUid = req.headers['x-test-uid'] || req.body?.uid || req.userUid || null; } catch (_) {}
    return next();
  }
  
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    
    if (!token) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    
    // Mock token'ı kabul et (geliştirme için)
    const allowMock = (process.env.ALLOW_MOCK_TOKENS === 'true') || (process.env.NODE_ENV !== 'production');
    if (allowMock && token === 'mock-id-token-for-development') {
      console.log('🟧 Mock token kabul edildi (dev/test)');
      // Test amaçlı uid'i header/body üzerinden al
      req.userUid = req.headers['x-test-uid'] || req.body?.uid || null;
      console.log('🟧 Mock auth uid:', req.userUid || 'yok');
      return next();
    }
    
    // Firebase ID token doğrulama
    const decoded = await admin.auth().verifyIdToken(token);
    req.userUid = decoded.uid;
    console.log('✅ Firebase ID token doğrulandı');
    next();
  } catch (err) {
    console.error('🟥 Auth hatası:', err.message);
    return res.status(401).json({ error: 'unauthorized' });
  }
}

// JSON middleware for auth routes
app.use('/auth/*', express.json());

// Auth endpoints - OTP sistemi (auth middleware bypass)
app.post('/auth/request-otp', requestOtpHandler);
app.post('/auth/verify-otp', verifyOtpHandler);
app.post('/auth/login-with-otp', loginWithOtpHandler);
app.post('/auth/password-login', passwordLoginHandler);
app.post('/auth/check-phone', checkPhoneHandler);
app.post('/auth/register-with-otp', registerWithOtpHandler);

// Basit health check
app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'bunny-media' });
});

// Tüm route'lara auth middleware uygula (auth routes hariç)
app.use(requireAuth);

// SMS endpoint (permission notifications)
app.post('/send-sms', async (req, res) => {
  try {
    const uid = req.userUid;
    console.log('📨 /send-sms çağrısı - uid:', uid || 'yok');
    if (!uid) return res.status(401).json({ error: 'unauthorized' });
    const { phoneNumber, message } = req.body || {};
    if (!phoneNumber || !message) return res.status(400).json({ error: 'bad_request' });
    const { sendPlainSms } = require('./netgsm');
    const result = await sendPlainSms(phoneNumber, message);
    if (!result.ok) {
      return res.status(502).json({ error: result.message || 'sms_failed' });
    }
    return res.json({ ok: true, result });
  } catch (e) {
    console.error('🟥 send-sms hata:', e);
    return res.status(500).json({ error: 'server_error' });
  }
});
// Notifications: mark as read
app.post('/notifications/mark-read', async (req, res) => {
  try {
    const uid = req.userUid;
    const { id } = req.body || {};
    if (!uid || !id) return res.status(400).json({ error: 'bad_request' });
    const db = admin.firestore();
    const ref = db.collection('notifications').doc(String(id));
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'not_found' });
    const data = snap.data();
    if (data.userId !== uid) return res.status(403).json({ error: 'forbidden' });
    await ref.update({ isRead: true, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'server_error' });
  }
});

// Notifications: mark all as read for current user
app.post('/notifications/mark-all-read', async (req, res) => {
  try {
    const uid = req.userUid || req.body?.uid || null;
    if (!uid) return res.status(401).json({ error: 'unauthorized' });
    const db = admin.firestore();
    // Eski dökümanlarda isRead alanı olmayabileceği için sadece userId filtreleyip tümünü güncelle
    const q = db.collection('notifications').where('userId', '==', uid).limit(500);
    const snap = await q.get();
    const batch = db.batch();
    let count = 0;
    snap.forEach((d) => {
      const data = d.data() || {};
      if (data.isRead !== true) {
        batch.update(d.ref, { isRead: true, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        count += 1;
      }
    });
    if (count > 0) {
      await batch.commit();
    }
    return res.json({ ok: true, updated: count });
  } catch (e) {
    return res.status(500).json({ error: 'server_error' });
  }
});

// Notifications: delete a single notification owned by current user
app.post('/notifications/delete', async (req, res) => {
  try {
    const uid = req.userUid;
    const { id } = req.body || {};
    if (!uid || !id) return res.status(400).json({ error: 'bad_request' });
    const db = admin.firestore();
    const ref = db.collection('notifications').doc(String(id));
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'not_found' });
    const data = snap.data();
    if (data.userId !== uid) return res.status(403).json({ error: 'forbidden' });
    await ref.delete();
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'server_error' });
  }
});

// Notifications: delete all notifications for current user
app.post('/notifications/delete-all', async (req, res) => {
  try {
    const uid = req.userUid;
    if (!uid) return res.status(401).json({ error: 'unauthorized' });
    const db = admin.firestore();
    const qBase = db.collection('notifications').where('userId', '==', uid);
    let totalDeleted = 0;
    // Paginated hard-delete in 500-sized batches until empty
    // Avoid startAfter since we re-query after each batch; safe for simple equality filter
    // Protect against runaway loop with max 50 iterations (~25k docs)
    for (let i = 0; i < 50; i += 1) {
      const snap = await qBase.limit(500).get();
      if (snap.empty) break;
      const batch = db.batch();
      snap.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      totalDeleted += snap.size;
      // Yield event loop; small delay is optional
    }
    return res.json({ ok: true, deleted: totalDeleted });
  } catch (e) {
    return res.status(500).json({ error: 'server_error' });
  }
});

// Notifications: track favorite portfolios for price change alerts
app.post('/notifications/portfolio-favorite', async (req, res) => {
  try {
    const uid = req.userUid || req.body?.uid || null;
    if (!uid) return res.status(401).json({ error: 'unauthorized' });
    const { portfolioId, action } = req.body || {};
    if (!portfolioId || !action) return res.status(400).json({ error: 'bad_request' });

    const db = admin.firestore();
    const docRef = db.collection('portfolioWatchers').doc(portfolioId).collection('users').doc(uid);

    if (action === 'favorite') {
      await docRef.set(
        {
          userId: uid,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          active: true,
        },
        { merge: true }
      );
    } else if (action === 'unfavorite') {
      await docRef.set(
        {
          userId: uid,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          active: false,
        },
        { merge: true }
      );
    } else {
      return res.status(400).json({ error: 'invalid_action' });
    }

    return res.json({ ok: true });
  } catch (e) {
    console.error('🟥 portfolio-favorite error:', e);
    return res.status(500).json({ error: 'server_error' });
  }
});

// Notifications: favorite portfolio price change → push to watchers
app.post('/notifications/portfolio-price-change', async (req, res) => {
  try {
    const uid = req.userUid || req.body?.uid || null;
    if (!uid) return res.status(401).json({ error: 'unauthorized' });

    const { portfolioId, oldPrice, newPrice, direction } = req.body || {};
    if (!portfolioId || typeof oldPrice !== 'number' || typeof newPrice !== 'number') {
      return res.status(400).json({ error: 'bad_request' });
    }

    const dir = direction === 'down' ? 'down' : 'up';
    const db = admin.firestore();

    // Bu portföyü takip eden aktif kullanıcıları çek
    const watchersSnap = await db
      .collection('portfolioWatchers')
      .doc(String(portfolioId))
      .collection('users')
      .where('active', '==', true)
      .get();

    if (watchersSnap.empty) {
      return res.json({ ok: true, delivered: 0 });
    }

    const { sendPushToUser } = require('./fcm');

    const title =
      dir === 'down'
        ? 'Favori portföyünüzün fiyatı düştü'
        : 'Favori portföyünüzün fiyatı yükseldi';

    const body = `Takip ettiğiniz portföyün fiyatı ${oldPrice.toLocaleString('tr-TR')}₺ -> ${newPrice.toLocaleString(
      'tr-TR'
    )} olarak güncellendi.`;

    let delivered = 0;
    const promises = [];

    watchersSnap.forEach((docSnap) => {
      const watcherId = docSnap.id;
      const payload = {
        title,
        body,
        type: 'portfolio',
        action: {
          type: 'view_portfolio',
          id: String(portfolioId),
        },
      };
      promises.push(
        sendPushToUser(watcherId, payload).then((r) => {
          if (r?.success || r?.ok) {
            delivered += 1;
          }
        })
      );
    });

    await Promise.all(promises);

    return res.json({ ok: true, delivered });
  } catch (e) {
    console.error('🟥 portfolio-price-change error:', e);
    return res.status(500).json({ error: 'server_error' });
  }
});

// Firestore trigger: Favori portföy fiyatı değiştiğinde takipçilere bildirim gönder
exports.onPortfolioPriceChangedNotifyWatchers = functions
  .region('europe-west1')
  .firestore.document('portfolios/{portfolioId}')
  .onUpdate(async (change, context) => {
    try {
      const before = change.before.data() || {};
      const after = change.after.data() || {};

      const oldPrice = Number(before.price);
      const newPrice = Number(after.price);

      // Geçerli sayı yoksa veya fiyat değişmediyse bildirim üretme
      if (!Number.isFinite(oldPrice) || !Number.isFinite(newPrice) || oldPrice === newPrice) {
        return null;
      }

      const dir = newPrice >= oldPrice ? 'up' : 'down';
      const db = admin.firestore();
      const portfolioId = String(context.params.portfolioId);

      // Bu portföyü takip eden aktif kullanıcıları çek
      const watchersSnap = await db
        .collection('portfolioWatchers')
        .doc(portfolioId)
        .collection('users')
        .where('active', '==', true)
        .get();

      if (watchersSnap.empty) {
        return null;
      }

      const { sendPushToUser } = require('./fcm');

      const title =
        dir === 'down'
          ? 'Favori portföyünüzün fiyatı düştü'
          : 'Favori portföyünüzün fiyatı yükseldi';

      const body = `Takip ettiğiniz portföyün fiyatı ${oldPrice.toLocaleString('tr-TR')}₺ -> ${newPrice.toLocaleString(
        'tr-TR'
      )}₺ olarak güncellendi.`;

      // Notification overlay için aksiyon butonları
      const actionButtons = JSON.stringify([
        { id: 'view_portfolio', title: 'Portföye Git', action: 'view_portfolio' },
      ]);

      const promises = [];

      watchersSnap.forEach((docSnap) => {
        const watcherId = String(docSnap.id);
        const payload = {
          title,
          body,
          type: 'portfolio',
          action: { type: 'view_portfolio', id: portfolioId },
          data: {
            type: 'portfolio_price_change',
            portfolioId: String(portfolioId),
            oldPrice: String(oldPrice),
            newPrice: String(newPrice),
            direction: dir,
            action_buttons: actionButtons,
          },
          // Kullanıcı başına portföy + fiyat kombinasyonuna göre dedupe key
          dedupeKey: `portfolio_price_change:${portfolioId}:${watcherId}:${oldPrice}->${newPrice}`,
        };
        promises.push(sendPushToUser(watcherId, payload));
      });

      await Promise.all(promises);
      return null;
    } catch (e) {
      console.error('🟥 onPortfolioPriceChangedNotifyWatchers error:', e?.message || e);
      return null;
    }
  });

// Notifications: server-side persisted test push (creates Firestore notification + FCM)
app.post('/notifications/test-persist', async (req, res) => {
  try {
    const uid = req.userUid || req.body?.uid || null;
    if (!uid) return res.status(401).json({ error: 'unauthorized' });
    const { title, body, type, action } = req.body || {};
    if (!title || !body || !type) {
      return res.status(400).json({ error: 'bad_request' });
    }
    const { sendPushToUser } = require('./fcm');
    const dedupeKey = `${type}:${action?.id || 'none'}:${Date.now()}`;
    const payload = { title, body, type, action: action || null, dedupeKey };
    const result = await sendPushToUser(uid, payload);
    return res.json({ ok: true, result });
  } catch (e) {
    return res.status(500).json({ error: 'server_error' });
  }
});

// Permissions: approve permission request
app.post('/permissions/approve', async (req, res) => {
  try {
    console.log('🔔 [Approve] İzin onaylama başlıyor');
    const uid = req.userUid;
    if (!uid) return res.status(401).json({ error: 'unauthorized' });
    const { permissionRequestId } = req.body || {};
    if (!permissionRequestId) return res.status(400).json({ error: 'bad_request' });

    console.log('🔔 [Approve] Onaylayan UID:', uid);
    console.log('🔔 [Approve] Permission Request ID:', permissionRequestId);

    const db = admin.firestore();
    const ref = db.collection('permissionRequests').doc(String(permissionRequestId));
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'not_found' });
    const data = snap.data() || {};

    console.log('🔔 [Approve] Permission Request Data:', {
      portfolioOwnerId: data.portfolioOwnerId,
      requesterId: data.requesterId,
      portfolioTitle: data.portfolioTitle
    });

    const ownerId = data.portfolioOwnerId || data.ownerId || null;
    if (!ownerId || ownerId !== uid) {
      console.log('🔔 [Approve] Yetki hatası - ownerId:', ownerId, 'uid:', uid);
      return res.status(403).json({ error: 'forbidden' });
    }

    // Update permission status
    await ref.update({
      status: 'approved',
      approvedBy: uid,
      approvedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log('🔔 [Approve] Permission status güncellendi');

    // Notify requester
    const title = 'İzin Talebiniz Onaylandı!';
    const body = `${data.portfolioTitle || 'Portföy'} paylaşımı için izniniz onaylandı.`;
    const buttons = JSON.stringify([
      { id: 'share', title: 'Paylaş', action: 'share_portfolio' },
      { id: 'view', title: 'Portföye Bak', action: 'view_portfolio' },
    ]);
    const payload = {
      title,
      body,
      type: 'permission_approved',
      action: { type: 'permission_approved', id: String(permissionRequestId) },
      data: {
        type: 'permission_approved',
        permissionRequestId: String(permissionRequestId),
        portfolioId: String(data.portfolioId || ''),
        portfolioTitle: String(data.portfolioTitle || ''),
        action_buttons: buttons,
      },
      dedupeKey: `permission_approved:${permissionRequestId}`,
    };

    console.log('🔔 [Approve] Bildirim gönderiliyor - Target UID:', data.requesterId);
    await sendPushToUser(String(data.requesterId), payload);
    console.log('🔔 [Approve] Bildirim gönderildi');

    // Orijinal izin talebi bildirimini Firestore'da güncelle
    console.log('🔔 [Approve] Orijinal izin talebi bildirimi Firestore\'da güncelleniyor...');
    try {
      const db = admin.firestore();
      
      // Firestore'da orijinal bildirimi bul ve güncelle
      const notificationsQuery = db.collection('notifications')
        .where('userId', '==', String(uid))
        .where('type', '==', 'permission_request')
        .where('data.permissionRequestId', '==', String(permissionRequestId));
      
      const notificationsSnapshot = await notificationsQuery.get();
      
      if (!notificationsSnapshot.empty) {
        const batch = db.batch();
        notificationsSnapshot.docs.forEach(doc => {
          const updatedData = {
            title: 'İzin Verildi ✅',
            body: `${data.portfolioTitle || 'Portföy'} için ${data.requesterName || 'kullanıcı'} talebini onayladınız.`,
            type: 'permission_request_approved',
            'data.type': 'permission_request_approved',
            'data.action_buttons': JSON.stringify([
              { id: 'view', title: 'Portföye Bak', action: 'view_portfolio' }
            ]),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            isRead: true, // Otomatik okundu işaretle
          };
          batch.update(doc.ref, updatedData);
        });
        
        await batch.commit();
        console.log('🔔 [Approve] Firestore\'da', notificationsSnapshot.docs.length, 'bildirim güncellendi');
      } else {
        console.log('⚠️ [Approve] Güncellenecek bildirim bulunamadı');
      }
    } catch (updateError) {
      console.log('⚠️ [Approve] Firestore bildirim güncelleme hatası:', updateError.message);
    }

    return res.json({ ok: true });
  } catch (e) {
    console.error('🟥 approve permission error:', e);
    return res.status(500).json({ error: 'server_error' });
  }
});

// Permissions: reject permission request
app.post('/permissions/reject', async (req, res) => {
  try {
    const uid = req.userUid;
    if (!uid) return res.status(401).json({ error: 'unauthorized' });
    const { permissionRequestId } = req.body || {};
    if (!permissionRequestId) return res.status(400).json({ error: 'bad_request' });

    const db = admin.firestore();
    const ref = db.collection('permissionRequests').doc(String(permissionRequestId));
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'not_found' });
    const data = snap.data() || {};

    const ownerId = data.portfolioOwnerId || data.ownerId || null;
    if (!ownerId || ownerId !== uid) {
      return res.status(403).json({ error: 'forbidden' });
    }

    // Update permission status
    await ref.update({
      status: 'rejected',
      rejectedBy: uid,
      rejectedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Notify requester
    const title = 'İzin Talebiniz Reddedildi';
    const body = `${data.portfolioTitle || 'Portföy'} için izniniz reddedildi.`;
    const buttons = JSON.stringify([{ id: 'view', title: 'Portföye Bak', action: 'view_portfolio' }]);
    const payload = {
      title,
      body,
      type: 'permission_rejected',
      action: { type: 'permission_rejected', id: String(permissionRequestId) },
      data: {
        type: 'permission_rejected',
        permissionRequestId: String(permissionRequestId),
        portfolioId: String(data.portfolioId || ''),
        portfolioTitle: String(data.portfolioTitle || ''),
        action_buttons: buttons,
      },
      dedupeKey: `permission_rejected:${permissionRequestId}`,
    };
    await sendPushToUser(String(data.requesterId), payload);

    // Orijinal izin talebi bildirimini Firestore'da güncelle
    try {
      // Firestore'da orijinal bildirimi bul ve güncelle
      const notificationsQuery = db.collection('notifications')
        .where('userId', '==', String(uid))
        .where('type', '==', 'permission_request')
        .where('data.permissionRequestId', '==', String(permissionRequestId));
      
      const notificationsSnapshot = await notificationsQuery.get();
      
      if (!notificationsSnapshot.empty) {
        const batch = db.batch();
        notificationsSnapshot.docs.forEach(doc => {
          const updatedData = {
            title: 'İzin Reddedildi ❌',
            body: `${data.portfolioTitle || 'Portföy'} için ${data.requesterName || 'kullanıcı'} talebini reddettiniz.`,
            type: 'permission_request_rejected',
            'data.type': 'permission_request_rejected',
            'data.action_buttons': JSON.stringify([
              { id: 'view', title: 'Portföye Bak', action: 'view_portfolio' }
            ]),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            isRead: true, // Otomatik okundu işaretle
          };
          batch.update(doc.ref, updatedData);
        });
        
        await batch.commit();
        console.log('🔔 [Reject] Firestore\'da', notificationsSnapshot.docs.length, 'bildirim güncellendi');
      }
    } catch (updateError) {
      console.log('⚠️ [Reject] Firestore bildirim güncelleme hatası:', updateError.message);
    }

    return res.json({ ok: true });
  } catch (e) {
    console.error('🟥 reject permission error:', e);
    return res.status(500).json({ error: 'server_error' });
  }
});

// Notifications: register device token (single-device policy)
app.post('/notifications/register-token', async (req, res) => {
  try {
    const uid = req.userUid || req.body?.uid || null;
    if (!uid) return res.status(401).json({ error: 'unauthorized' });
    const { token, platform, deviceId } = req.body || {};
    if (!token) return res.status(400).json({ error: 'bad_request' });
    
    const tokenDocId = String(token).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 120);
    const db = admin.firestore();
    
    // 🔐 TEK CİHAZ POLİTİKASI: Diğer tokenları deaktive et
    try {
      const tokensRef = db.collection('users').doc(uid).collection('tokens');
      const existingTokensSnap = await tokensRef.get();
      
      const batch = db.batch();
      existingTokensSnap.docs.forEach(doc => {
        if (doc.id !== tokenDocId) {
          batch.update(doc.ref, { 
            isActive: false, 
            deactivatedAt: admin.firestore.FieldValue.serverTimestamp(),
            deactivatedReason: 'new_device_login'
          });
        }
      });
      if (!existingTokensSnap.empty) {
        await batch.commit();
      }
    } catch (_) {}
    
    // Yeni token'ı aktif olarak kaydet
    await db
      .collection('users')
      .doc(uid)
      .collection('tokens')
      .doc(tokenDocId)
      .set(
        {
          token: String(token),
          isActive: true,
          platform: platform || 'unknown',
          deviceId: deviceId || 'unknown',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

    // Backward compatibility
    await db
      .collection('users')
      .doc(uid)
      .set(
        {
          fcmToken: String(token),
          pushEnabled: true,
          lastTokenUpdate: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    
    return res.json({ ok: true, message: 'Token registered with single-device policy' });
  } catch (e) {
    console.error('🟥 register-token error:', e);
    return res.status(500).json({ error: 'server_error' });
  }
});

// Notifications: unregister tokens (logout cleanup)
app.post('/notifications/unregister-token', async (req, res) => {
  try {
    const uid = req.userUid || req.body?.uid || null;
    if (!uid) return res.status(401).json({ error: 'unauthorized' });
    
    const db = admin.firestore();
    const tokensRef = db.collection('users').doc(uid).collection('tokens');
    const tokensSnap = await tokensRef.get();
    
    if (!tokensSnap.empty) {
      const batch = db.batch();
      tokensSnap.docs.forEach(doc => {
        batch.update(doc.ref, {
          isActive: false,
          deactivatedAt: admin.firestore.FieldValue.serverTimestamp(),
          deactivatedReason: 'user_logout'
        });
      });
      await batch.commit();
    }

    // Clear main fcmToken field
    await db
      .collection('users')
      .doc(uid)
      .update({
        fcmToken: null,
        pushEnabled: false,
        lastTokenUpdate: admin.firestore.FieldValue.serverTimestamp(),
      });

    return res.json({ ok: true, message: 'All tokens deactivated' });
  } catch (e) {
    console.error('🟥 unregister-token error:', e);
    return res.status(500).json({ error: 'server_error' });
  }
});

// Firestore trigger (Gen1): Permission Requests — onCreate -> notify portfolio owner
const { sendPushToUser } = require('./fcm');
exports.onPermissionRequestCreated = functions
  .region('europe-west1')
  .firestore.document('permissionRequests/{requestId}')
  .onCreate(async (snap, context) => {
    try {
      const data = snap.data() || {};
      let ownerId = data.portfolioOwnerId || data.ownerId || null;

      // Güçlü sahip belirleme: portfolioOwnerId yoksa portfolios/{portfolioId} üzerinden bul
      if (!ownerId && data.portfolioId) {
        try {
          const portfolioSnap = await admin.firestore().collection('portfolios').doc(data.portfolioId).get();
          if (portfolioSnap.exists) {
            const portfolio = portfolioSnap.data() || {};
            ownerId = portfolio.ownerId || portfolio.userId || null;
          }
        } catch (_) {}
      }

      // Güvenlik: requester (data.userId) asla fallback olmasın
      if (!ownerId) {
        console.warn('⚠️ Portföy sahibi ID bulunamadı, bildirim gönderilemiyor.');
        return null;
      }

      const title = 'Yeni Paylaşım İzin Talebi';
      const body = `${data.requesterName || 'Bir kullanıcı'} (${data.requesterPhone || ''}) '${data.portfolioTitle || 'Portföy'}' için izin istiyor.`;
      const actionButtons = JSON.stringify([
        { id: 'approve', title: 'İzin Ver', action: 'approve_permission' },
        { id: 'reject', title: 'Reddet', action: 'reject_permission' },
        { id: 'view', title: 'Portföye Bak', action: 'view_portfolio' }
      ]);
      
      const payload = {
        title,
        body,
        type: 'permission_request',
        action: { type: 'permission_request', id: String(context.params.requestId) },
        data: {
          type: 'permission_request',
          permissionRequestId: String(context.params.requestId),
          portfolioId: String(data.portfolioId || ''),
          requesterId: String(data.requesterId || ''),
          action_buttons: actionButtons,
        },
        dedupeKey: `permission_request:${context.params.requestId}`,
      };

      await sendPushToUser(String(ownerId), payload);
      return null;
    } catch (e) {
      console.error('onPermissionRequestCreated error:', e?.message || e);
      return null;
    }
  });

// =============================================================
// Firestore trigger: Notify request owners when a new portfolio matches
// =============================================================
function trNormalizeText(value) {
  if (value === null || value === undefined) return '';
  try {
    let s = String(value).trim();
    s = s
      .replace(/İ/g, 'I')
      .replace(/I/g, 'I')
      .replace(/ı/g, 'i')
      .replace(/Ş/g, 'S')
      .replace(/ş/g, 's')
      .replace(/Ğ/g, 'G')
      .replace(/ğ/g, 'g')
      .replace(/Ç/g, 'C')
      .replace(/ç/g, 'c')
      .replace(/Ö/g, 'O')
      .replace(/ö/g, 'o')
      .replace(/Ü/g, 'U')
      .replace(/ü/g, 'u');
    s = s.toLowerCase();
    s = s.replace(/[\.\-_,]/g, ' ');
    s = s.replace(/\s+/g, ' ').trim();
    return s;
  } catch {
    return String(value).toLowerCase();
  }
}

function trNormalizeNeighborhood(value) {
  let s = trNormalizeText(value);
  s = s.replace(/\bmahallesi\b/g, '').replace(/\bmah\b/g, '').replace(/\bmh\b/g, '');
  return s.trim();
}

function equalsNorm(a, b) { return trNormalizeText(a) === trNormalizeText(b); }
function includesNorm(arr, v, isNeighborhood = false) {
  const t = isNeighborhood ? trNormalizeNeighborhood(v) : trNormalizeText(v);
  return (arr || []).some(x => (isNeighborhood ? trNormalizeNeighborhood(x) : trNormalizeText(x)) === t);
}

function toNum(value, fallback = NaN) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  try {
    let s = String(value).trim();
    s = s.replace(/\./g, '');
    s = s.replace(/,/g, '.');
    const m = s.match(/-?\d+(?:\.\d+)?/);
    const parsed = m ? parseFloat(m[0]) : NaN;
    return Number.isFinite(parsed) ? parsed : fallback;
  } catch { return fallback; }
}

function parseFloor(value) {
  const raw = trNormalizeText(value);
  if (!raw) return NaN;
  if (raw.includes('bodrum') || raw.includes('bahce')) return -1;
  if (raw.includes('giris') || raw.includes('zemin') || raw.includes('yuksek')) return 0;
  if (raw.includes('cati') || raw.includes('teras')) return 99;
  return toNum(raw, NaN);
}

function parseAge(value) {
  const raw = trNormalizeText(value);
  if (!raw) return NaN;
  if (raw.includes('sifir')) return 0;
  return toNum(raw, NaN);
}

function withinTol(target, min, max, tol = 0.10) {
  const t = toNum(target, NaN);
  if (!Number.isFinite(t)) return false;
  const hasMin = min !== undefined && min !== null && min !== '';
  const hasMax = max !== undefined && max !== null && max !== '';
  if (!hasMin && !hasMax) return true;
  let lo = -Infinity, hi = Infinity;
  if (hasMin) lo = toNum(min, 0) * (1 - tol);
  if (hasMax) hi = toNum(max, 0) * (1 + tol);
  return t >= lo && t <= hi;
}

function normListingStatus(value) {
  const s = trNormalizeText(value);
  if (s.includes('kira')) return 'kiralik';
  if (s.includes('sat')) return 'satilik';
  return s;
}

function normPropertyType(value) {
  const s = trNormalizeText(value);
  if (!s) return '';
  if (s.includes('residence') || s.includes('rezidans') || s.includes('apart') || s.includes('apartment') || s.includes('daire')) return 'daire';
  if (s.includes('villa')) return 'villa';
  if (s.includes('isyeri') || s.includes('is yeri') || s.includes('ofis') || s.includes('buro') || s.includes('büro') || s.includes('dukkan') || s.includes('dükkan') || s.includes('magaza') || s.includes('mağaza')) return 'isyeri';
  if (s.includes('arsa') || s.includes('arazi') || s.includes('tarla')) return 'arsa';
  if (s.includes('bina')) return 'bina';
  return s;
}

exports.onPortfolioCreatedMatchAndNotify = functions
  .region('europe-west1')
  .firestore.document('portfolios/{portfolioId}')
  .onCreate(async (snap, context) => {
    try {
      const portfolio = snap.data() || {};
      // Sadece yayınlanmış portföylerle bildirim üret
      if (portfolio.isPublished === false) return null;

      const db = admin.firestore();

      // Ön filtre: aynı şehirdeki aktif ve havuza açık talepler
      let q = db.collection('requests')
        .where('isPublished', '==', true)
        .where('publishToPool', '==', true);
      if (portfolio.city) {
        // city query + client-side normalize check
        q = q.where('city', '==', portfolio.city);
      }
      const reqSnap = await q.get();
      if (reqSnap.empty) return null;

      const tol = 0.10;
      const pCity = portfolio.city;
      const pDistrict = portfolio.district;
      const pNeighborhood = portfolio.neighborhood;
      const pType = normPropertyType(portfolio.propertyType);
      const pListing = normListingStatus(portfolio.listingStatus || portfolio.listingType);
      const pRooms = (portfolio.roomCount ? [String(portfolio.roomCount)] : []).map(v => trNormalizeText(String(v)).replace(/\s+/g, ''));
      const pPrice = toNum(portfolio.price, NaN);
      const pSqm = (portfolio.squareMeters != null ? portfolio.squareMeters : (portfolio.netSquareMeters != null ? portfolio.netSquareMeters : (portfolio.grossSquareMeters != null ? portfolio.grossSquareMeters : portfolio.area)));
      const pAge = parseAge(portfolio.buildingAge);
      const pFloor = parseFloor(portfolio.floor != null ? portfolio.floor : portfolio.floorNumber);

      const batch = db.batch();
      const notificationsCol = db.collection('notifications');
      let sentCount = 0;
      const notifiedUsers = new Set();

      for (const d of reqSnap.docs) {
        const req = d.data() || {};
        if (!req.userId) continue;
        if (notifiedUsers.has(req.userId)) continue; // one notification per user per portfolio
        const isSelf = req.userId === portfolio.userId;

        // Şehir eşleşmesi
        if (req.city && pCity && !equalsNorm(req.city, pCity)) continue;

        // İlçe eşleşmesi
        const reqDistricts = Array.isArray(req.districts) ? req.districts : (req.district ? [req.district] : []);
        if (reqDistricts.length > 0) {
          if (!pDistrict || !includesNorm(reqDistricts, pDistrict)) continue;
        }

        // Mahalle eşleşmesi
        const reqNeighborhoods = Array.isArray(req.neighborhoods) ? req.neighborhoods : (req.neighborhood ? [req.neighborhood] : []);
        if (reqNeighborhoods.length > 0) {
          if (!pNeighborhood || !includesNorm(reqNeighborhoods, pNeighborhood, true)) continue;
        }

        // İşlem türü
        const rListing = normListingStatus(req.listingStatus || req.listingType);
        if (rListing && pListing && rListing !== pListing) continue;

        // Tip
        const rType = normPropertyType(req.propertyType);
        if (rType && pType && rType !== pType) continue;

        // Oda
        const rRooms = Array.isArray(req.roomCount) ? req.roomCount : (req.roomCount ? [req.roomCount] : []);
        if (rRooms.length > 0) {
          const normRR = rRooms.map(v => trNormalizeText(String(v)).replace(/\s+/g, ''));
          const any = (pRooms || []).some(r => normRR.includes(r));
          if (!any) continue;
        }

        // Bütçe ±%10
        if (!withinTol(pPrice, req.minPrice, req.maxPrice, tol)) continue;

        // m² ±%10
        if (!withinTol(pSqm, req.minSquareMeters, req.maxSquareMeters, tol)) continue;

        // Bina yaşı ±%10 (talep belirtmişse)
        const rMinAge = (req.minBuildingAge !== undefined ? req.minBuildingAge : (Array.isArray(req.buildingAge) ? req.buildingAge[0] : undefined));
        const rMaxAge = (req.maxBuildingAge !== undefined ? req.maxBuildingAge : (Array.isArray(req.buildingAge) ? req.buildingAge[1] : undefined));
        if (rMinAge != null || rMaxAge != null) {
          if (!withinTol(pAge, rMinAge, rMaxAge, tol)) continue;
        }

        // Kat ±%10 (talep belirtmişse)
        const rMinFloor = (req.minFloor !== undefined ? req.minFloor : (Array.isArray(req.floor) ? req.floor[0] : undefined));
        const rMaxFloor = (req.maxFloor !== undefined ? req.maxFloor : (Array.isArray(req.floor) ? req.floor[1] : undefined));
        if (rMinFloor != null || rMaxFloor != null) {
          if (!withinTol(pFloor, rMinFloor, rMaxFloor, tol)) continue;
        }

        // Dedupe: portfolio-request çifti için tek bildirim
        const notifId = `match_${context.params.portfolioId}_${d.id}`;
        const notifRef = notificationsCol.doc(notifId);
        const exists = await notifRef.get();
        if (exists.exists) continue;

        const title = isSelf ? 'Talep ve Portföy Eşleşti' : 'Talebinize yeni eşleşme!';
        const body = isSelf
          ? `${portfolio.title || 'Portföy'} kendi talebinizle eşleşiyor. İnceleyin.`
          : `${portfolio.title || 'Portföy'} talebinizle eşleşti. İnceleyin.`;

        const actionButtons = JSON.stringify([
          { id: 'view_portfolio', title: 'Portföye Git', action: 'view_portfolio' },
          { id: 'view_request', title: 'Talebe Git', action: 'view_request' },
        ]);
        const payload = {
          title,
          body,
          type: 'request_match',
          action: { type: 'view_portfolio', id: String(context.params.portfolioId) },
          data: {
            type: 'request_match',
            requestId: String(d.id),
            portfolioId: String(context.params.portfolioId),
            listingStatus: String(portfolio.listingStatus || ''),
            propertyType: String(portfolio.propertyType || ''),
            action_buttons: actionButtons,
          },
          dedupeKey: `request_match:${context.params.portfolioId}:${d.id}`,
        };

        // Persist notification
        batch.set(notifRef, {
          userId: String(req.userId),
          title,
          body,
          type: 'request_match',
          data: payload.data,
          isRead: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Push
        await sendPushToUser(String(req.userId), payload);
        sentCount += 1;
        notifiedUsers.add(req.userId);
      }

      if (sentCount > 0) {
        await batch.commit();
      }
      return null;
    } catch (e) {
      console.error('onPortfolioCreatedMatchAndNotify error:', e?.message || e);
      return null;
    }
  });

exports.onRequestCreatedMatchAndNotify = functions
  .region('europe-west1')
  .firestore.document('requests/{requestId}')
  .onCreate(async (snap, context) => {
    try {
      const req = snap.data() || {};
      if (req.isPublished === false) return null;
      const db = admin.firestore();

      // Fetch published portfolios in same city (client filters handle strict)
      let q = db.collection('portfolios').where('isPublished', '==', true);
      if (req.city) {
        q = q.where('city', '==', req.city);
      }
      const pSnap = await q.get();
      if (pSnap.empty) return null;

      const tol = 0.10;
      const rCity = req.city;
      const rDistricts = Array.isArray(req.districts) ? req.districts : (req.district ? [req.district] : []);
      const rNeighborhoods = Array.isArray(req.neighborhoods) ? req.neighborhoods : (req.neighborhood ? [req.neighborhood] : []);
      const rType = normPropertyType(req.propertyType);
      const rListing = normListingStatus(req.listingStatus || req.listingType);
      const rRooms = Array.isArray(req.roomCount) ? req.roomCount.map(v => trNormalizeText(String(v)).replace(/\s+/g, '')) : (req.roomCount ? [trNormalizeText(String(req.roomCount)).replace(/\s+/g, '')] : []);
      const rMinPrice = req.minPrice, rMaxPrice = req.maxPrice;
      const rMinSqm = req.minSquareMeters, rMaxSqm = req.maxSquareMeters;
      const rMinAge = (req.minBuildingAge !== undefined ? req.minBuildingAge : (Array.isArray(req.buildingAge) ? req.buildingAge[0] : undefined));
      const rMaxAge = (req.maxBuildingAge !== undefined ? req.maxBuildingAge : (Array.isArray(req.buildingAge) ? req.buildingAge[1] : undefined));
      const rMinFloor = (req.minFloor !== undefined ? req.minFloor : (Array.isArray(req.floor) ? req.floor[0] : undefined));
      const rMaxFloor = (req.maxFloor !== undefined ? req.maxFloor : (Array.isArray(req.floor) ? req.floor[1] : undefined));

      const batch = db.batch();
      const notificationsCol = db.collection('notifications');
      const notifiedUsers = new Set();

      for (const d of pSnap.docs) {
        const p = d.data() || {};
        const ownerId = p.userId;
        if (!ownerId) continue;
        if (notifiedUsers.has(ownerId)) continue;

        // City exact
        if (rCity && p.city && !equalsNorm(rCity, p.city)) continue;
        // District exact
        if (rDistricts.length > 0) {
          if (!p.district || !includesNorm(rDistricts, p.district)) continue;
        }
        // Neighborhood exact
        if (rNeighborhoods.length > 0) {
          if (!p.neighborhood || !includesNorm(rNeighborhoods, p.neighborhood, true)) continue;
        }
        // Listing type
        const pListing = normListingStatus(p.listingStatus || p.listingType);
        if (rListing && pListing && rListing !== pListing) continue;
        // Property type
        const pType = normPropertyType(p.propertyType);
        if (rType && pType && rType !== pType) continue;
        // Rooms
        const pRooms = p.roomCount ? [trNormalizeText(String(p.roomCount)).replace(/\s+/g, '')] : [];
        if (rRooms.length > 0) {
          if (pRooms.length === 0) continue;
          const any = pRooms.some(r => rRooms.includes(r));
          if (!any) continue;
        }
        // Price
        if (!withinTol(p.price, rMinPrice, rMaxPrice, tol)) continue;
        // m²
        const pSqm = (p.squareMeters != null ? p.squareMeters : (p.netSquareMeters != null ? p.netSquareMeters : (p.grossSquareMeters != null ? p.grossSquareMeters : p.area)));
        if (!withinTol(pSqm, rMinSqm, rMaxSqm, tol)) continue;
        // Age
        if (rMinAge != null || rMaxAge != null) {
          if (!withinTol(parseAge(p.buildingAge), rMinAge, rMaxAge, tol)) continue;
        }
        // Floor
        if (rMinFloor != null || rMaxFloor != null) {
          const pFloor = (p.floor != null && p.floor !== '') ? p.floor : p.floorNumber;
          if (!withinTol(parseFloor(pFloor), rMinFloor, rMaxFloor, tol)) continue;
        }

        // Write and push
        const notifId = `match_req_${context.params.requestId}_${d.id}`;
        const notifRef = notificationsCol.doc(notifId);
        const exists = await notifRef.get();
        if (exists.exists) continue;

        const title = 'Portföyünüze uygun bir talep eklendi!';
        const body = `${req.title || 'Talep'} portföyünüzle eşleşiyor. Göz atın.`;
        const actionButtons = JSON.stringify([
          { id: 'view_portfolio', title: 'Portföye Git', action: 'view_portfolio' },
          { id: 'view_request', title: 'Talebe Git', action: 'view_request' },
        ]);
        const payload = {
          title,
          body,
          type: 'portfolio_match',
          action: { type: 'view_request', id: String(context.params.requestId) },
          data: {
            type: 'portfolio_match',
            requestId: String(context.params.requestId),
            portfolioId: String(d.id),
            action_buttons: actionButtons,
          },
          dedupeKey: `portfolio_match:${context.params.requestId}:${d.id}`,
        };

        batch.set(notifRef, {
          userId: String(ownerId),
          title,
          body,
          type: 'portfolio_match',
          data: payload.data,
          isRead: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        await sendPushToUser(String(ownerId), payload);
        notifiedUsers.add(ownerId);
      }

      if (notifiedUsers.size > 0) {
        await batch.commit();
      }
      return null;
    } catch (e) {
      console.error('onRequestCreatedMatchAndNotify error:', e?.message || e);
      return null;
    }
  });


// Content-Type kontrolü için yardımcı fonksiyon
function isMultipart(req) {
  const ct = (req.headers['content-type'] || '').toLowerCase();
  return ct.startsWith('multipart/form-data');
}

// Upload endpoint
app.post('/uploadImage', async (req, res) => {
  try {
    // Content-Type kontrolü
    if (!isMultipart(req)) {
      return res.status(400).json({ error: 'content-type must be multipart/form-data' });
    }

    const bb = Busboy({ 
      headers: req.headers,
      limits: {
        files: 1,
        fileSize: MAX_UPLOAD_MB * 1024 * 1024
      }
    });

    let uploadPath = 'images/profiles';
    let uploadData = null;
    let requestAborted = false;

    bb.on('field', (name, value) => {
      if (name === 'path' && (value === 'images/profiles' || value === 'images/portfolios')) {
        uploadPath = value;
      }
    });

    bb.on('file', (fieldname, file, info) => {
      console.log('📎 Dosya alınıyor:', fieldname, info);
      
      // MIME type kontrolü
      if (!isAllowedMimeType(info.mimeType)) {
        console.error('🟥 Desteklenmeyen dosya tipi:', info.mimeType);
        file.resume(); // Stream'i boşalt
        return res.status(415).json({ error: 'unsupported media type' });
      }
      
      const chunks = [];
      
      file.on('data', (chunk) => {
        chunks.push(chunk);
        console.log('📦 Chunk alındı, boyut:', chunk.length);
      });
      
      file.on('end', () => {
        if (!requestAborted) {
          const safeName = sanitizeFilename(info.filename);
          uploadData = {
            file: Buffer.concat(chunks),
            type: info.mimeType,
            name: safeName
          };
          console.log('✅ Dosya stream tamamlandı, toplam boyut:', uploadData.file.length);
        }
      });
      
      file.on('error', (err) => {
        console.error('❌ File stream error:', err);
      });
    });

    bb.on('error', (err) => {
      console.error('❌ Busboy error:', err);
      console.error('❌ Request headers:', req.headers);
      if (!res.headersSent) {
        return res.status(500).json({ error: `Form parsing failed: ${err.message}` });
      }
    });

    bb.on('limit', () => {
      console.error('🟥 Dosya boyutu limiti aşıldı:', MAX_UPLOAD_MB, 'MB');
      if (!res.headersSent) {
        return res.status(413).json({ error: 'file too large' });
      }
    });

    req.on('aborted', () => {
      console.warn('⚠️ Request aborted by client');
      requestAborted = true;
      try { bb.destroy(); } catch {}
      // 500 döndürme, sadece log yeter
    });

    bb.on('finish', async () => {
      if (requestAborted) {
        console.log('🚫 Request was aborted, skipping processing');
        return;
      }

      if (!uploadData?.file || !uploadData?.name) {
        console.log('❌ No file provided');
        return res.status(400).json({ error: 'No file provided' });
      }

      try {
        let bodyBuffer = uploadData.file;
        let contentType = uploadData.type;
        
        // Benzersiz dosya adı (cache-busting)
        let effectiveFilename = FORCE_UNIQUE_FILENAMES 
          ? `${Date.now()}_${uploadData.name}`
          : uploadData.name;

        // HEIC->JPEG dönüşümü (opsiyonel)
        if (CONVERT_HEIC_TO_JPEG && /heic|heif/i.test(contentType)) {
          try {
            const sharp = (await import('sharp')).default;
            bodyBuffer = await sharp(bodyBuffer).jpeg({ quality: 90 }).toBuffer();
            contentType = 'image/jpeg';
            effectiveFilename = effectiveFilename.replace(/\.(heic|heif)$/i, '.jpg');
          } catch (convErr) {
            console.error('🟧 HEIC dönüştürme hatası, orijinal yükleniyor:', convErr);
          }
        }

        // Public prefix garantisi
        const publicFilename = ensurePublicPath(effectiveFilename);
        const storagePath = `${uploadPath}/${publicFilename}`;
        const url = `https://${BUNNY_STORAGE_HOST}/${BUNNY_STORAGE_ZONE}/${storagePath}`;

        // Bunny konfigürasyon kontrolü
        if (!BUNNY_STORAGE_KEY || !BUNNY_STORAGE_ZONE) {
          console.error('🟥 Bunny konfigürasyonu eksik:', {
            hasStorageKey: !!BUNNY_STORAGE_KEY,
            hasStorageZone: !!BUNNY_STORAGE_ZONE,
            storageHost: BUNNY_STORAGE_HOST
          });
          return res.status(500).json({ 
            error: 'Bunny konfigürasyonu eksik - BUNNY_STORAGE_KEY veya BUNNY_STORAGE_ZONE tanımlanmamış' 
          });
        }

        const putResp = await fetch(url, {
          method: 'PUT',
          headers: {
            'AccessKey': BUNNY_STORAGE_KEY,
            'Content-Type': contentType,
            'Content-Length': String(bodyBuffer.length),
          },
          body: bodyBuffer,
        });

        if (!putResp.ok) {
          const text = await putResp.text().catch(() => '');
          console.error('🟥 Bunny PUT hata:', putResp.status, text);
          return res.status(502).json({ error: 'Bunny yükleme hatası' });
        }

        // CDN URL'i BUNNY_CDN_HOST ile döndür
        const cdnUrl = `https://${BUNNY_CDN_HOST}/${storagePath}`;
        return res.json({
          success: true,
          cdnUrl,
          storagePath,
          size: bodyBuffer.length,
          contentType,
        });
      } catch (err) {
        console.error('🟥 Upload işlem hatası:', err);
        return res.status(500).json({ error: 'Sunucu hatası' });
      }
    });

    // Request'i busboy'a pipe et veya rawBody varsa kullan
    if (req.rawBody && Buffer.isBuffer(req.rawBody)) {
      console.log('🚀 rawBody kullanılıyor, boyut:', req.rawBody.length);
      bb.end(req.rawBody);
    } else {
      console.log('🚀 Request pipe edildi, headers:', req.headers);
      req.pipe(bb);
    }
  } catch (err) {
    console.error('🟥 uploadImage hata:', err);
    return res.status(500).json({ error: String(err?.message || err) });
  }
});

// Upload Audio endpoint (for voice notes) - Base64 destekli
app.post('/uploadAudio', express.json({ limit: '10mb' }), async (req, res) => {
  try {
    // Base64 format kontrol (JSON body)
    if (req.body && req.body.base64) {
      console.log('🎤 Base64 ses dosyası alınıyor...');
      
      const { base64, fileName, path = 'audio/notes' } = req.body;
      
      if (!base64 || !fileName) {
        return res.status(400).json({ error: 'base64 ve fileName zorunludur' });
      }
      
      // Base64'ü Buffer'a çevir
      const audioBuffer = Buffer.from(base64, 'base64');
      console.log('✅ Base64 decode edildi, boyut:', Math.round(audioBuffer.length / 1024), 'KB');
      
      // Güvenli dosya adı
      const safeName = sanitizeFilename(fileName);
      const timestamp = Date.now();
      const randomStr = Math.random().toString(36).substring(2, 8);
      const finalName = FORCE_UNIQUE_FILENAMES
        ? `${timestamp}_${randomStr}_${safeName}`
        : safeName;
      
      const storagePath = `${path}/${finalName}`;
      const bunnyUrl = `https://${BUNNY_STORAGE_HOST}/${BUNNY_STORAGE_ZONE}/${storagePath}`;
      
      // Dosya uzantısına göre Content-Type belirle
      const ext = finalName.split('.').pop().toLowerCase();
      let contentType = 'audio/mpeg'; // Default: MP3
      if (ext === 'm4a' || ext === 'mp4') {
        contentType = 'audio/mp4';
      } else if (ext === 'aac') {
        contentType = 'audio/aac';
      } else if (ext === '3gp') {
        contentType = 'audio/3gpp';
      } else if (ext === 'amr') {
        contentType = 'audio/amr';
      } else if (ext === 'wav') {
        contentType = 'audio/wav';
      } else if (ext === 'mp3') {
        contentType = 'audio/mpeg'; // MP3 format (optimize!)
      }
      console.log('📦 Content-Type:', contentType, 'Ext:', ext, 'Dosya:', finalName);
      
      // Bunny'ye yükle
      const uploadResp = await fetch(bunnyUrl, {
        method: 'PUT',
        headers: {
          'AccessKey': BUNNY_STORAGE_KEY,
          'Content-Type': contentType,
        },
        body: audioBuffer,
      });

      if (!uploadResp.ok) {
        const errText = await uploadResp.text().catch(() => '');
        console.error('🟥 Bunny PUT hata:', uploadResp.status, errText);
        return res.status(502).json({ error: 'Bunny yükleme hatası' });
      }

      const cdnUrl = `https://${BUNNY_CDN_HOST}/${storagePath}`;
      console.log('✅ Ses dosyası yüklendi (Base64):', cdnUrl);

      return res.json({
        success: true,
        url: cdnUrl,
        cdnUrl: cdnUrl,
        storagePath: storagePath,
      });
    }
    
    // Multipart form-data format (fallback - eski yöntem)
    if (!isMultipart(req)) {
      return res.status(400).json({ error: 'content-type must be application/json or multipart/form-data' });
    }

    const bb = Busboy({ 
      headers: req.headers,
      limits: {
        files: 1,
        fileSize: 5 * 1024 * 1024
      }
    });

    let uploadPath = 'audio/notes';
    let uploadData = null;
    let requestAborted = false;

    bb.on('field', (name, value) => {
      if (name === 'path') {
        uploadPath = value;
      }
    });

    bb.on('file', (fieldname, file, info) => {
      console.log('🎤 Ses dosyası alınıyor (multipart):', fieldname, info);
      
      if (!isAllowedAudioMimeType(info.mimeType)) {
        console.error('🟥 Desteklenmeyen ses tipi:', info.mimeType);
        file.resume();
        return res.status(415).json({ error: 'unsupported audio type' });
      }
      
      const chunks = [];
      
      file.on('data', (chunk) => {
        chunks.push(chunk);
      });
      
      file.on('end', () => {
        if (!requestAborted) {
          const safeName = sanitizeFilename(info.filename);
          uploadData = {
            file: Buffer.concat(chunks),
            type: info.mimeType,
            name: safeName
          };
          console.log('✅ Ses dosyası stream tamamlandı, toplam boyut:', uploadData.file.length);
        }
      });
      
      file.on('error', (err) => {
        console.error('🟥 Ses stream hatası:', err);
        requestAborted = true;
      });
    });

    bb.on('finish', async () => {
      if (requestAborted) {
        return res.status(500).json({ error: 'Upload aborted' });
      }
      
      if (!uploadData) {
        return res.status(400).json({ error: 'Dosya alınamadı' });
      }

      const timestamp = Date.now();
      const randomStr = Math.random().toString(36).substring(2, 8);
      const finalName = FORCE_UNIQUE_FILENAMES
        ? `${timestamp}_${randomStr}_${uploadData.name}`
        : uploadData.name;
      
      const storagePath = `${uploadPath}/${finalName}`;
      const bunnyUrl = `https://${BUNNY_STORAGE_HOST}/${BUNNY_STORAGE_ZONE}/${storagePath}`;
      
      const uploadResp = await fetch(bunnyUrl, {
        method: 'PUT',
        headers: {
          'AccessKey': BUNNY_STORAGE_KEY,
          'Content-Type': uploadData.type,
        },
        body: uploadData.file,
      });

      if (!uploadResp.ok) {
        const errText = await uploadResp.text().catch(() => '');
        console.error('🟥 Bunny PUT hata:', uploadResp.status, errText);
        return res.status(502).json({ error: 'Bunny yükleme hatası' });
      }

      const cdnUrl = `https://${BUNNY_CDN_HOST}/${storagePath}`;
      console.log('✅ Ses dosyası yüklendi (multipart):', cdnUrl);

      return res.json({
        success: true,
        url: cdnUrl,
        cdnUrl: cdnUrl,
        storagePath: storagePath,
      });
    });

    bb.on('error', (err) => {
      console.error('🟥 Busboy ses hatası:', err);
      requestAborted = true;
      return res.status(500).json({ error: String(err?.message || err) });
    });

    if (req.rawBody) {
      bb.end(req.rawBody);
    } else {
      req.pipe(bb);
    }
  } catch (err) {
    console.error('🟥 uploadAudio hata:', err);
    return res.status(500).json({ error: String(err?.message || err) });
  }
});

// Delete endpoint
app.post('/deleteImage', express.json(), async (req, res) => {
  try {
    const { storagePath } = req.body || {};
    if (!storagePath || typeof storagePath !== 'string') {
      return res.status(400).json({ error: 'storagePath zorunludur' });
    }
    
    // Path traversal güvenlik kontrolü
    const safePath = storagePath
      .replace(/\.\./g, '') // .. temizle
      .replace(/^\/+/, '') // Baştaki / temizle
      .replace(/[^A-Za-z0-9._/-]/g, '_'); // Güvenli karakter seti
    
    // TODO: Role/claim kontrolü eklenebilir (kullanıcı sadece kendi dosyalarını silebilir)
    
    const url = `https://${BUNNY_STORAGE_HOST}/${BUNNY_STORAGE_ZONE}/${safePath}`;
    const delResp = await fetch(url, {
      method: 'DELETE',
      headers: { 'AccessKey': BUNNY_STORAGE_KEY },
    });
    if (!delResp.ok) {
      const text = await delResp.text().catch(() => '');
      console.error('🟥 Bunny DELETE hata:', delResp.status, text);
      return res.status(502).json({ error: 'Bunny silme hatası' });
    }
    return res.json({ success: true });
  } catch (err) {
    console.error('🟥 deleteImage hata:', err);
    return res.status(500).json({ error: 'Sunucu hatası' });
  }
});

// Web only: Download original (forced attachment)
app.get('/downloadOriginal', async (req, res) => {
  try {
    const { url, name } = req.query;
    if (!url) { return res.status(400).send('url zorunludur'); }
    const filename = (name && String(name)) || 'download';
    const upstream = await fetch(url);
    if (!upstream.ok) {
      return res.status(502).send('Kaynak indirilemiyor');
    }
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/octet-stream');
    upstream.body.pipe(res);
  } catch (err) {
    console.error('🟥 downloadOriginal hata:', err);
    res.status(500).send('Sunucu hatası');
  }
});

// Secret bağlama (BUNNY_ACCESS_KEY) — yoksa config fallback çalışır
exports.bunny = functions
  .region('europe-west1')
  .runWith({ 
    secrets: ['BUNNY_STORAGE_KEY'],
    minInstances: 0,
    maxInstances: 20
  })
  .https.onRequest(app);

// Notifications schedulers (Gen2)
try {
  // eslint-disable-next-line global-require
  const schedulers = require('./schedulers');
  exports.scanPortfolioAndDemandDue = schedulers.scanPortfolioAndDemandDue;
  exports.scanSubscriptionsDue = schedulers.scanSubscriptionsDue;
  exports.scanAgendaDue = schedulers.scanAgendaDue;
  // Test helpers (callable + optional dev HTTP)
  if (schedulers.testPrimeAndProcessEntity) {
    exports.testPrimeAndProcessEntity = schedulers.testPrimeAndProcessEntity;
  }
  if (schedulers.devRunProcessEntity) {
    exports.devRunProcessEntity = schedulers.devRunProcessEntity;
  }
  if (schedulers.devPrimeAndProcessEntity) {
    exports.devPrimeAndProcessEntity = schedulers.devPrimeAndProcessEntity;
  }
} catch (e) {
  // keep index minimal if schedulers not present in certain envs
}
