// FCM Push + Firestore notification record with dedupe
const { db } = require('./admin');
const admin = require('firebase-admin');

function buildNotificationDoc(userId, payload) {
  return {
    userId,
    type: payload.type,
    title: payload.title,
    body: payload.body,
    action: payload.action || null,
    data: payload.data || null,
    isRead: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    dedupeKey: payload.dedupeKey || null,
  };
}

async function getUserPushTargets(userId) {
  // Try subcollection first: users/{uid}/tokens (multiple active tokens)
  try {
    const tokensRef = db.collection('users').doc(userId).collection('tokens');
    const tokensSnap = await tokensRef.get();
    const activeTokens = [];
    tokensSnap.forEach((d) => {
      const t = d.data() || {};
      if (t && t.token && t.isActive === true) {
        activeTokens.push(String(t.token));
      }
    });
    if (activeTokens.length > 0) {
      return { enabled: true, tokens: activeTokens };
    }
  } catch (_) {
    // ignore and fallback to single token
  }

  // Fallback: single token stored on user doc
  const snap = await db.collection('users').doc(userId).get();
  if (!snap.exists) return { enabled: false };
  const data = snap.data() || {};
  if (data.pushEnabled === false) return { enabled: false };
  if (!data.fcmToken) return { enabled: false };
  return { enabled: true, tokens: [String(data.fcmToken)] };
}

function asFcmMessageBase(payload) {
  // Ensure data payload values are strings (FCM data fields must be strings)
  const extraData = {};
  try {
    const src = payload && payload.data ? payload.data : {};
    Object.keys(src).forEach((k) => {
      const v = src[k];
      extraData[k] = typeof v === 'string' ? v : JSON.stringify(v);
    });
  } catch (_) {}

  return {
    android: {
      priority: 'high',
      notification: {
        channelId: String(payload.channelId || 'default_channel'),
        sound: 'default',
      },
    },
    apns: {
      payload: {
        aps: {
          sound: 'default',
          contentAvailable: true,
        },
      },
    },
    data: {
      title: String(payload.title || ''),
      body: String(payload.body || ''),
      actionType: String(payload.action?.type || ''),
      actionId: String(payload.action?.id || ''),
      type: String(payload.type || ''),
      ...extraData,
    },
    notification: {
      title: payload.title,
      body: payload.body,
    },
  };
}

function asFcmMessage(token, payload) {
  return { token, ...asFcmMessageBase(payload) };
}

async function writeNotificationIfNotExists(docId, userId, payload) {
  const ref = db.collection('notifications').doc(docId);
  try {
    await ref.create(buildNotificationDoc(userId, payload));
    return { created: true, id: ref.id };
  } catch (e) {
    // Already exists
    return { created: false, id: ref.id };
  }
}

/**
 * sendPushToUser(userId, { title, body, action, type, dedupeKey })
 * - Dedupe via notifications/{dedupeKey}
 * - Persist notification
 * - Send FCM if token exists and enabled
 */
async function sendPushToUser(userId, payload) {
  const dedupeId = payload.dedupeKey || `${payload.type || 'misc'}:${payload.action?.id || 'none'}`;
  const writeRes = await writeNotificationIfNotExists(dedupeId, userId, payload);
  if (!writeRes.created) {
    return { skipped: true, reason: 'duplicate' };
  }

  const target = await getUserPushTargets(userId);
  if (!target.enabled) return { created: true, pushed: false };
  try {
    const tokens = Array.isArray(target.tokens) ? target.tokens : [];
    if (tokens.length === 0) {
      return { created: true, pushed: false };
    }

    if (tokens.length === 1) {
      const msg = asFcmMessage(tokens[0], payload);
      try {
        await admin.messaging().send(msg);
      } catch (err) {
        // Best-effort cleanup on invalid/expired token
        const code = err && err.code ? String(err.code) : '';
        if (code.includes('registration-token-not-registered') || code.includes('invalid-registration-token')) {
          try {
            await cleanupInvalidTokens(userId, [tokens[0]]);
          } catch (_) {}
        }
        throw err;
      }
      return { created: true, pushed: true, sent: 1, totalTokens: 1 };
    }

    const multicast = {
      tokens,
      ...asFcmMessageBase(payload),
    };
    const resp = await admin.messaging().sendEachForMulticast(multicast);

    // Best-effort cleanup for invalid tokens
    try {
      const invalidTokens = [];
      if (resp && Array.isArray(resp.responses)) {
        resp.responses.forEach((r, idx) => {
          if (!r.success) {
            const code = r.error && r.error.code ? String(r.error.code) : '';
            if (code.includes('registration-token-not-registered') || code.includes('invalid-registration-token')) {
              invalidTokens.push(tokens[idx]);
            }
          }
        });
      }
      if (invalidTokens.length > 0) {
        await cleanupInvalidTokens(userId, invalidTokens);
      }
    } catch (_) {}

    return { created: true, pushed: resp.successCount > 0, sent: resp.successCount, totalTokens: tokens.length };
  } catch (e) {
    return { created: true, pushed: false, error: e?.message };
  }
}

async function cleanupInvalidTokens(userId, tokenList) {
  if (!Array.isArray(tokenList) || tokenList.length === 0) return;
  try {
    const tokensRef = db.collection('users').doc(userId).collection('tokens');
    // Query each token and deactivate if found
    const batch = db.batch();
    // Firestore doesn't support "in" queries on subcollection without indexes per field; iterate tokens
    for (const tok of tokenList) {
      const snap = await tokensRef.where('token', '==', String(tok)).limit(10).get();
      snap.forEach((docSnap) => {
        batch.update(docSnap.ref, {
          isActive: false,
          deactivatedAt: admin.firestore.FieldValue.serverTimestamp(),
          deactivatedReason: 'invalid_token',
        });
      });
    }
    await batch.commit();
  } catch (_) {
    // silent
  }
}

module.exports = { sendPushToUser };


