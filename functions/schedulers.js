/*
  Scheduled scanners (≤3 jobs):
  - scanPortfolioAndDemandDue: daily 03:00 Europe/Istanbul
  - scanSubscriptionsDue: daily 03:10 Europe/Istanbul
  - scanAgendaDue: every 5 minutes
  Idempotent via dedupeKey and create() writes.
*/
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { db } = require('./admin');
const { sendPushToUser } = require('./fcm');
const { portfolioMessage, demandMessage, agendaMessage, subscriptionMessage } = require('./notify');
const fetch = require('node-fetch');

const BATCH_SIZE = parseInt(process.env.NOTIF_BATCH_SIZE || '500', 10);
const TIMEZONE = process.env.NOTIF_TIMEZONE || 'Europe/Istanbul';

function tsNow() { return admin.firestore.Timestamp.now(); }

function daysDiffFrom(baseTimestamp) {
  const baseMs = baseTimestamp?.toDate ? baseTimestamp.toDate().getTime() : new Date(baseTimestamp).getTime();
  const nowMs = Date.now();
  const ms = nowMs - baseMs;
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

function addDays(dateLike, n) {
  const base = dateLike?.toDate ? dateLike.toDate() : new Date(dateLike || Date.now());
  const d = new Date(base.getTime());
  d.setDate(d.getDate() + n);
  return admin.firestore.Timestamp.fromDate(d);
}

function buildDedupeKey(type, entityId, phase) {
  return `${type}:${entityId}:${phase}`;
}

async function processPortfolio(docSnap) {
  const data = docSnap.data();
  if (!data) return;
  const id = docSnap.id;
  const ownerId = data.ownerId || data.userId; // backward compatibility
  const createdAt = data.createdAt || tsNow();
  const updatedAt = data.updatedAt || createdAt;
  const baseAt = updatedAt && updatedAt.toDate ? updatedAt : createdAt;
  const d = daysDiffFrom(baseAt);

  // Determine phase by days
  let phase = null;
  let nextInDays = null;
  let mutate = {};
  if (d >= 75) {
    phase = 'd75';
  } else if (d >= 60) {
    phase = 'd60';
    nextInDays = 15; // to 75th
  } else if (d >= 40) {
    phase = 'd40';
    nextInDays = 20; // to 60th
  } else if (d >= 30) {
    phase = 'd30';
    nextInDays = 10;
  } else if (d >= 20) {
    phase = 'd20';
    nextInDays = 10;
  } else if (d >= 10) {
    phase = 'd10';
    nextInDays = 10;
  }

  if (!phase) return;

  // Actions per phase
  if (phase === 'd40') {
    mutate.isPublished = false;
  }

  const dedupeKey = buildDedupeKey('portfolio', id, phase);
  const msg = portfolioMessage(phase);

  await sendPushToUser(ownerId, {
    title: msg.title,
    body: msg.body,
    type: 'portfolio',
    channelId: 'portfolio-reminders',
    action: { type: 'open_portfolio', id },
    dedupeKey,
  });

  if (phase === 'd75') {
    // Delete document
    await docSnap.ref.delete();
    return;
  }

  // Update phase and nextActionAt
  const updates = {
    phase,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (nextInDays != null) {
    updates.nextActionAt = addDays(baseAt, nextInDays);
  }
  if (Object.prototype.hasOwnProperty.call(mutate, 'isPublished')) {
    updates.isPublished = mutate.isPublished;
  }
  await docSnap.ref.update(updates);
}

async function processDemand(docSnap) {
  const data = docSnap.data();
  if (!data) return;
  const id = docSnap.id;
  const ownerId = data.ownerId || data.userId;
  const createdAt = data.createdAt || tsNow();
  const updatedAt = data.updatedAt || createdAt;
  const baseAt = updatedAt && updatedAt.toDate ? updatedAt : createdAt;
  const d = daysDiffFrom(baseAt);

  // New lifecycle: 15/20/30/45
  let phase = null;
  let nextInDays = null;
  const updates = {};
  if (d >= 45) {
    phase = 'd45';
  } else if (d >= 30) {
    phase = 'd30';
    updates.status = 'archived';
    updates.isArchived = true;
    nextInDays = 15; // to 45th
  } else if (d >= 20) {
    phase = 'd20';
    updates.status = 'expired';
    updates.isExpired = true;
    nextInDays = 10; // to 30th
  } else if (d >= 15) {
    phase = 'd15';
    if (data.isPublished) updates.isPublished = false; // unpublish from pool
    nextInDays = 5; // to 20th
  }

  // If no phase reached yet (e.g., d=10), reschedule to next threshold
  if (!phase) {
    // d < 15
    const daysUntil15 = Math.max(1, 15 - d);
    await docSnap.ref.update({
      nextActionAt: addDays(baseAt, daysUntil15),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return;
  }

  const dedupeKey = buildDedupeKey('demand', id, phase);
  const msg = demandMessage(phase);
  await sendPushToUser(ownerId, {
    title: msg.title,
    body: msg.body,
    type: 'request', // show request icon/category in overlay
    channelId: 'request-reminders',
    action: { type: 'open_demand', id },
    data: {
      type: 'demand_lifecycle',
      requestId: String(id),
      action_buttons: JSON.stringify([
        { id: 'view_request', title: 'Talep e Git', action: 'view_request' },
      ]),
      requestSnapshot: {
        id: String(id),
        title: String(data.title || ''),
        description: String(data.description || ''),
        city: String(data.city || ''),
        district: String(data.district || ''),
        districts: Array.isArray(data.districts) ? data.districts : (data.district ? [String(data.district)] : []),
        neighborhood: String(data.neighborhood || ''),
        neighborhoods: Array.isArray(data.neighborhoods) ? data.neighborhoods : (data.neighborhood ? [String(data.neighborhood)] : []),
        minPrice: data.minPrice ?? data.minBudget ?? null,
        maxPrice: data.maxPrice ?? data.maxBudget ?? null,
        minSquareMeters: data.minSquareMeters ?? data.minSqMeters ?? null,
        maxSquareMeters: data.maxSquareMeters ?? data.maxSqMeters ?? null,
        roomCount: Array.isArray(data.roomCount) ? data.roomCount : (data.roomCount ? [String(data.roomCount)] : []),
        propertyType: String(data.propertyType || ''),
        createdAt: data.createdAt || null,
      },
    },
    dedupeKey,
  });

  if (phase === 'd45') {
    await docSnap.ref.delete();
    return;
  }
  updates.phase = phase;
  updates.updatedAt = admin.firestore.FieldValue.serverTimestamp();
  if (nextInDays != null) updates.nextActionAt = addDays(baseAt, nextInDays);
  await docSnap.ref.update(updates);
}

// New: process requests with same lifecycle
async function processRequest(docSnap) {
  const data = docSnap.data();
  if (!data) return;
  const id = docSnap.id;
  const ownerId = data.ownerId || data.userId;
  const createdAt = data.createdAt || tsNow();
  const updatedAt = data.updatedAt || createdAt;
  const baseAt = updatedAt && updatedAt.toDate ? updatedAt : createdAt;
  const d = daysDiffFrom(baseAt);

  let phase = null;
  let nextInDays = null;
  const updates = {};
  if (d >= 45) {
    phase = 'd45';
  } else if (d >= 30) {
    phase = 'd30';
    updates.status = 'archived';
    updates.isArchived = true;
    nextInDays = 15;
  } else if (d >= 20) {
    phase = 'd20';
    updates.status = 'expired';
    updates.isExpired = true;
    nextInDays = 10;
  } else if (d >= 15) {
    phase = 'd15';
    if (data.publishToPool || data.isPublished) updates.isPublished = false;
    nextInDays = 5;
  }

  if (!phase) {
    // d < 15
    const daysUntil15 = Math.max(1, 15 - d);
    await docSnap.ref.update({
      nextActionAt: addDays(baseAt, daysUntil15),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return;
  }

  const dedupeKey = buildDedupeKey('request', id, phase);
  const msg = demandMessage(phase);
  await sendPushToUser(ownerId, {
    title: msg.title,
    body: msg.body,
    type: 'request',
    channelId: 'request-reminders',
    action: { type: 'open_demand', id },
    data: {
      type: 'demand_lifecycle',
      requestId: String(id),
      action_buttons: JSON.stringify([
        { id: 'view_request', title: 'Talep e Git', action: 'view_request' },
      ]),
      requestSnapshot: {
        id: String(id),
        title: String(data.title || ''),
        description: String(data.description || ''),
        city: String(data.city || ''),
        district: String(data.district || ''),
        districts: Array.isArray(data.districts) ? data.districts : (data.district ? [String(data.district)] : []),
        neighborhood: String(data.neighborhood || ''),
        neighborhoods: Array.isArray(data.neighborhoods) ? data.neighborhoods : (data.neighborhood ? [String(data.neighborhood)] : []),
        minPrice: data.minPrice ?? data.minBudget ?? null,
        maxPrice: data.maxPrice ?? data.maxBudget ?? null,
        minSquareMeters: data.minSquareMeters ?? data.minSqMeters ?? null,
        maxSquareMeters: data.maxSquareMeters ?? data.maxSqMeters ?? null,
        roomCount: Array.isArray(data.roomCount) ? data.roomCount : (data.roomCount ? [String(data.roomCount)] : []),
        propertyType: String(data.propertyType || ''),
        createdAt: data.createdAt || null,
      },
    },
    dedupeKey,
  });

  if (phase === 'd45') {
    await docSnap.ref.delete();
    return;
  }
  updates.phase = phase;
  updates.updatedAt = admin.firestore.FieldValue.serverTimestamp();
  if (nextInDays != null) updates.nextActionAt = addDays(baseAt, nextInDays);
  await docSnap.ref.update(updates);
}

async function processAgenda(docSnap) {
  const data = docSnap.data();
  if (!data) return;
  const id = docSnap.id;
  const ownerId = data.ownerId || data.userId;
  const msg = agendaMessage();
  await sendPushToUser(ownerId, {
    title: msg.title,
    body: msg.body,
    type: 'agenda',
    channelId: 'appointment-reminders',
    action: { type: 'open_agenda' },
    dedupeKey: `agenda:${id}:next`,
  });
  await docSnap.ref.update({ nextActionAt: null, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
}

async function processSubscription(docSnap) {
  const data = docSnap.data();
  if (!data) return;
  const uid = docSnap.id;
  const plan = data.plan || 'paid';
  const expiresAt = data.expiresAt;
  if (!expiresAt) return;
  const daysLeft = Math.ceil((expiresAt.toDate().getTime() - Date.now()) / (24 * 60 * 60 * 1000));

  if (![3, 2, 1].includes(daysLeft)) return;

  const msg = subscriptionMessage(plan, daysLeft);
  const dedupeKey = `subscription:${uid}:${plan}:d${daysLeft}`;
  await sendPushToUser(uid, {
    title: msg.title,
    body: msg.body,
    type: plan === 'trial' ? 'trial' : 'subscription',
    channelId: 'request-reminders',
    action: { type: 'open_subscriptions' },
    dedupeKey,
  });

  if (plan === 'trial' && daysLeft === 1) {
    // SMS via NetGSM
    try {
      await sendTrialSms(uid);
    } catch (e) {}
  }

  // Set nextActionAt to next reminder if any
  const next = daysLeft - 1;
  await docSnap.ref.update({
    nextActionAt: next > 0 ? addDays(tsNow(), 1) : null,
    phase: next > 0 ? `d${next}` : null,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function sendTrialSms(uid) {
  // Fetch user phone if available
  const userDoc = await db.collection('users').doc(uid).get();
  const phone = userDoc.exists ? (userDoc.data().phoneNumber || '') : '';
  if (!phone) return;
  const functionsConfig = functions.config?.() || {};
  const userCode = process.env.NETGSM_USER || functionsConfig.netgsm?.user;
  const password = process.env.NETGSM_PASS || functionsConfig.netgsm?.pass;
  const msgHeader = process.env.NETGSM_HEADER || functionsConfig.netgsm?.header || 'A.TELLIOGLU';
  if (!userCode || !password || !msgHeader) return;
  const cleaned = String(phone).replace(/\D/g, '');
  const gsm = cleaned.startsWith('90') ? cleaned : (cleaned.startsWith('0') ? `90${cleaned.substring(1)}` : `90${cleaned}`);
  const text = 'Talepify deneme süreniz yarın sona eriyor. Aboneliği başlatmayı unutmayın!';
  const url = `https://api.netgsm.com.tr/sms/send/get/?usercode=${userCode}&password=${password}&gsmno=${gsm}&message=${encodeURIComponent(text)}&msgheader=${msgHeader}`;
  try {
    await fetch(url);
  } catch (e) {}
}

async function checkSubscriptionExpirations() {
  const now = new Date();
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

  const checkUsers = async (targetDate, daysLeft) => {
    const startOfDay = new Date(targetDate.setHours(0, 0, 0, 0));
    const endOfDay = new Date(targetDate.setHours(23, 59, 59, 999));

    const q = db.collection('users')
      .where('subscriptionExpiryDate', '>=', admin.firestore.Timestamp.fromDate(startOfDay))
      .where('subscriptionExpiryDate', '<=', admin.firestore.Timestamp.fromDate(endOfDay))
      .limit(BATCH_SIZE);
      
    const snapshot = await q.get();

    if (snapshot.empty) {
      console.log(`Bitişine ${daysLeft} gün kalan abonelik bulunamadı.`);
      return;
    }

    const promises = snapshot.docs.map(async (doc) => {
      const user = doc.data();
      const uid = doc.id;
      
      const msg = {
        title: '🔔 Abonelik Hatırlatması',
        body: `Değerli üyemiz, Talepify aboneliğinizin sona ermesine son ${daysLeft} gün.`,
      };
      
      const dedupeKey = `subscription_expiry:${uid}:${daysLeft}`;

      try {
        await sendPushToUser(uid, {
          title: msg.title,
          body: msg.body,
          type: 'subscription_reminder',
          action: { type: 'open_subscriptions' },
          dedupeKey,
        });
        console.log(`Bildirim gönderildi: ${uid} - ${daysLeft} gün kaldı.`);
      } catch (error) {
        console.error(`Bildirim gönderme hatası (${uid}):`, error);
      }
    });

    await Promise.all(promises);
  };

  await checkUsers(sevenDaysFromNow, 7);
  await checkUsers(threeDaysFromNow, 3);
}

async function scanPortfoliosDemands(nowTs) {
  const now = nowTs || tsNow();
  // Portfolios due: published and nextActionAt <= now
  const q1 = db.collection('portfolios')
    .where('isPublished', '==', true)
    .where('nextActionAt', '<=', now)
    .limit(BATCH_SIZE);
  const q1Snap = await q1.get();
  await Promise.all(q1Snap.docs.map(processPortfolio));

  // Portfolios with phase d60 and due
  const q1b = db.collection('portfolios')
    .where('phase', '==', 'd60')
    .where('nextActionAt', '<=', now)
    .limit(BATCH_SIZE);
  const q1bSnap = await q1b.get();
  await Promise.all(q1bSnap.docs.map(processPortfolio));

  // Demands due by nextActionAt
  const q2 = db.collection('demands')
    .where('nextActionAt', '<=', now)
    .limit(BATCH_SIZE);
  const q2Snap = await q2.get();
  await Promise.all(q2Snap.docs.map(processDemand));

  // Requests due by nextActionAt
  const q3 = db.collection('requests')
    .where('nextActionAt', '<=', now)
    .limit(BATCH_SIZE);
  const q3Snap = await q3.get();
  await Promise.all(q3Snap.docs.map(processRequest));
}

async function scanSubscriptions(nowTs) {
  const now = nowTs || tsNow();
  const q = db.collection('subscriptions')
    .where('nextActionAt', '<=', now)
    .limit(BATCH_SIZE);
  const snap = await q.get();
  await Promise.all(snap.docs.map(processSubscription));
}

async function scanAgenda(nowTs) {
  const now = nowTs || tsNow();
  const q = db.collection('appointments')
    .where('nextActionAt', '<=', now)
    .limit(BATCH_SIZE);
  const snap = await q.get();
  await Promise.all(snap.docs.map(processAgenda));
}

async function pingWarmupEndpoint() {
  // Proje ID'nizi ve bölgenizi buraya girin.
  const projectId = process.env.GCLOUD_PROJECT || 'apptalepify-14dbc';
  const region = 'europe-west1';
  // 'bunny' fonksiyon adınız, express app'inizi export ettiğiniz isimdir.
  const functionUrl = `https://${region}-${projectId}.cloudfunctions.net/bunny/warmup`;

  try {
    console.log(`Pinging warmup endpoint: ${functionUrl}`);
    const response = await fetch(functionUrl, {
      method: 'GET',
      headers: {
        // Güvenlik: Sadece Cloud Scheduler'ın bu isteği yapabildiğini doğrulamak için bir header ekleyin.
        // Bu header'ı daha sonra Cloud Scheduler ayarlarında da belirtmeniz gerekir.
        'X-Cloud-Scheduler-Pinger': 'true',
      },
      timeout: 10000, // 10 saniye timeout
    });

    if (response.ok) {
      console.log(`Warmup ping successful: ${response.status}`);
    } else {
      console.error(`Warmup ping failed: ${response.status}`);
    }
  } catch (error) {
    console.error('Error pinging warmup endpoint:', error.message);
  }
}

exports.scanPortfolioAndDemandDue = functions
  .region('europe-west1')
  .pubsub.schedule('0 3 * * *')
  .timeZone(TIMEZONE)
  .onRun(async () => {
    await scanPortfoliosDemands();
  });

exports.scanSubscriptionsDue = functions
  .region('europe-west1')
  .pubsub.schedule('10 3 * * *')
  .timeZone(TIMEZONE)
  .onRun(async () => {
    await scanSubscriptions();
  });

exports.scanAgendaDue = functions
  .region('europe-west1')
  .pubsub.schedule('*/5 * * * *')
  .timeZone(TIMEZONE)
  .onRun(async () => {
    await scanAgenda();
  });

exports.checkSubscriptionExpirations = functions
  .region('europe-west1')
  .pubsub.schedule('0 9 * * *') // Her gün sabah 9'da çalışır
  .timeZone(TIMEZONE)
  .onRun(async () => {
    console.log('Abonelik bitiş tarihleri kontrol ediliyor...');
    await checkSubscriptionExpirations();
    console.log('Abonelik bitiş tarihleri kontrolü tamamlandı.');
  });

exports.functionsPinger = functions
  .region('europe-west1')
  .pubsub.schedule('every 5 minutes')
  .timeZone(TIMEZONE)
  .onRun(async () => {
    console.log('Running pinger to keep functions warm...');
    await pingWarmupEndpoint();
    console.log('Pinger run complete.');
  });

// Callable test: prime and process entity (demand/request) for notification testing
exports.testPrimeAndProcessEntity = functions
  .region('europe-west1')
  .https.onCall(async (data, context) => {
    if (!context.auth || !context.auth.uid) {
      throw new functions.https.HttpsError('unauthenticated', 'Auth required');
    }
    const type = String(data?.type || 'demand'); // 'demand' | 'request'
    const id = String(data?.id || '');
    const phase = Number(data?.phase || 0); // 15 | 20 | 30 | 45
    if (!id || ![15, 20, 30, 45].includes(phase)) {
      throw new functions.https.HttpsError('invalid-argument', 'Bad params');
    }

    const coll = type === 'request' ? 'requests' : 'demands';
    const ref = db.collection(coll).doc(id);
    const now = new Date();
    const base = new Date(now.getTime() - (phase * 24 * 60 * 60 * 1000) - 3600000);

    await ref.set({
      updatedAt: admin.firestore.Timestamp.fromDate(base),
    }, { merge: true });
    await ref.update({
      createdAt: admin.firestore.Timestamp.fromDate(base),
      nextActionAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 1000)),
    });

    const snap = await ref.get();
    if (!snap.exists) {
      throw new functions.https.HttpsError('not-found', 'Document not found');
    }

    if (type === 'request') {
      await processRequest(snap);
    } else {
      await processDemand(snap);
    }

    return { ok: true };
  });

// DEV/TEST endpoints for manually testing demand/request lifecycle notifications
exports.devRunProcessEntity = functions
  .region('europe-west1')
  .https.onRequest(async (req, res) => {
    try {
      const tokenHeader = req.get('x-test-token') || req.get('X-Test-Token');
      const expected = process.env.TEST_TOKEN || (functions.config().test && functions.config().test.token);
      if (!expected || tokenHeader !== expected) {
        res.status(403).json({ ok: false, error: 'Forbidden' });
        return;
      }
      const type = (req.query.type || 'demand').toString(); // 'demand' | 'request'
      const id = (req.query.id || '').toString();
      if (!id) {
        res.status(400).json({ ok: false, error: 'Missing id' });
        return;
      }
      const coll = type === 'request' ? 'requests' : 'demands';
      const snap = await db.collection(coll).doc(id).get();
      if (!snap.exists) {
        res.status(404).json({ ok: false, error: 'Not found' });
        return;
      }
      if (type === 'request') {
        await processRequest(snap);
      } else {
        await processDemand(snap);
      }
      res.json({ ok: true });
    } catch (e) {
      console.error('devRunProcessEntity error', e);
      res.status(500).json({ ok: false, error: e.message });
    }
  });

exports.devPrimeAndProcessEntity = functions
  .region('europe-west1')
  .https.onRequest(async (req, res) => {
    try {
      const tokenHeader = req.get('x-test-token') || req.get('X-Test-Token');
      const expected = process.env.TEST_TOKEN || (functions.config().test && functions.config().test.token);
      if (!expected || tokenHeader !== expected) {
        res.status(403).json({ ok: false, error: 'Forbidden' });
        return;
      }
      const type = (req.query.type || 'demand').toString(); // 'demand' | 'request'
      const id = (req.query.id || '').toString();
      const phaseDays = parseInt(req.query.phase, 10); // 15 | 20 | 30 | 45
      if (!id || ![15, 20, 30, 45].includes(phaseDays)) {
        res.status(400).json({ ok: false, error: 'Bad params' });
        return;
      }
      const coll = type === 'request' ? 'requests' : 'demands';
      const ref = db.collection(coll).doc(id);
      const now = new Date();
      const base = new Date(now.getTime() - (phaseDays * 24 * 60 * 60 * 1000) - 3600000); // threshold passed
      await ref.update({
        createdAt: admin.firestore.Timestamp.fromDate(base),
        updatedAt: admin.firestore.Timestamp.fromDate(base),
        nextActionAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 1000)),
      });
      const snap = await ref.get();
      if (!snap.exists) {
        res.status(404).json({ ok: false, error: 'Not found after update' });
        return;
      }
      if (type === 'request') {
        await processRequest(snap);
      } else {
        await processDemand(snap);
      }
      res.json({ ok: true });
    } catch (e) {
      console.error('devPrimeAndProcessEntity error', e);
      res.status(500).json({ ok: false, error: e.message });
    }
  });


