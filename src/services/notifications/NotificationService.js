// Cross-platform local notification display and unread subscription helpers
// JS only, idempotent, feature-flagged by NOTIF_ENABLED

import { collection, query, where, onSnapshot, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { NOTIF_ENABLED, ANDROID_DEFAULT_CHANNEL_ID, API_BASE_URL } from '@env';
import { auth } from '../../firebase';

let PushNotification = null;
try { PushNotification = require('react-native-push-notification'); } catch (e) { PushNotification = null; }

const DEFAULT_CHANNEL_ID = ANDROID_DEFAULT_CHANNEL_ID || 'default_channel';

// Dev log helpers
const devLog = (...args) => { if (typeof __DEV__ !== 'undefined' && __DEV__) { try { /* eslint-disable no-console */ console.log(...args); /* eslint-enable no-console */ } catch {} } };
const devWarn = (...args) => { if (typeof __DEV__ !== 'undefined' && __DEV__) { try { /* eslint-disable no-console */ console.warn(...args); /* eslint-enable no-console */ } catch {} } };
devLog('🔔 NotificationService ENV', { NOTIF_ENABLED, API_BASE_URL, DEFAULT_CHANNEL_ID });

function displayLocal(payload) {
  if (!NOTIF_ENABLED || NOTIF_ENABLED === 'false') { return; }
  const title = payload?.title || 'Bildirim';
  const body = payload?.body || payload?.message || '';
  const action = payload?.action || {};
  try {
    if (PushNotification?.localNotification) {
      PushNotification.localNotification({
        title,
        message: body,
        playSound: true,
        soundName: 'default',
        channelId: DEFAULT_CHANNEL_ID,
        vibrate: true,
        vibration: 800,
        importance: 'high',
        priority: 'high',
        userInfo: { actionType: action.type, actionId: action.id },
        data: { actionType: action.type, actionId: action.id },
      });
    }
  } catch (e) {}
}

function subscribeUnreadCount(uid, callback) {
  if (!NOTIF_ENABLED || NOTIF_ENABLED === 'false') {
    return () => {};
  }
  if (!uid) { return () => {}; }
  try {
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', uid),
      where('isRead', '==', false),
    );
    const unsub = onSnapshot(q, (snap) => {
      callback?.(snap.size || 0);
    }, () => callback?.(0));
    return unsub;
  } catch (e) {
    return () => {};
  }
}

async function markAsRead(notificationId) {
  try {
    if (!API_BASE_URL) { devWarn('🔔 markAsRead: API_BASE_URL yok, istek atlanıyor'); return; }
    const token = await auth.currentUser?.getIdToken?.();
    if (!token) { devWarn('🔔 markAsRead: idToken yok, istek atlanıyor'); return; }
    const uid = auth.currentUser?.uid || null;
    const url = `${API_BASE_URL}/notifications/mark-read`;
    devLog('🔔 API mark-read →', url, { id: notificationId, uid, hasToken: !!token });
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ id: notificationId, uid }),
    });
    if (!resp.ok) {
      devWarn('🔔 API mark-read FAILED', resp.status);
    } else {
      devLog('🔔 API mark-read OK');
    }
  } catch (e) { devWarn('🔔 API mark-read ERROR', e?.message || e); }
}

async function markAllAsRead(uid) {
  if (!uid) { return; }
  try {
    if (!API_BASE_URL) { devWarn('🔔 markAllAsRead: API_BASE_URL yok, istek atlanıyor'); return; }
    const token = await auth.currentUser?.getIdToken?.();
    if (!token) { devWarn('🔔 markAllAsRead: idToken yok, istek atlanıyor'); return; }
    const url = `${API_BASE_URL}/notifications/mark-all-read`;
    devLog('🔔 API mark-all-read →', url, { uid, hasToken: !!token });
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ uid }),
    });
    if (!resp.ok) {
      devWarn('🔔 API mark-all-read FAILED', resp.status);
    } else {
      devLog('🔔 API mark-all-read OK');
    }
  } catch (e) { devWarn('🔔 API mark-all-read ERROR', e?.message || e); }
}

async function deleteNotification(notificationId) {
  try {
    if (!API_BASE_URL) { devWarn('🔔 deleteNotification: API_BASE_URL yok, istek atlanıyor'); return; }
    const token = await auth.currentUser?.getIdToken?.();
    if (!token) { devWarn('🔔 deleteNotification: idToken yok, istek atlanıyor'); return; }
    const uid = auth.currentUser?.uid || null;
    const url = `${API_BASE_URL}/notifications/delete`;
    devLog('🔔 API delete →', url, { id: notificationId, uid, hasToken: !!token });
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ id: notificationId, uid }),
    });
    if (!resp.ok) {
      devWarn('🔔 API delete FAILED', resp.status);
    } else {
      devLog('🔔 API delete OK');
    }
  } catch (e) { devWarn('🔔 API delete ERROR', e?.message || e); }
}

async function deleteAll(uid) {
  if (!uid) { return; }
  try {
    if (!API_BASE_URL) { devWarn('🔔 deleteAll: API_BASE_URL yok, istek atlanıyor'); return; }
    const token = await auth.currentUser?.getIdToken?.();
    if (!token) { devWarn('🔔 deleteAll: idToken yok, istek atlanıyor'); return; }
    const url = `${API_BASE_URL}/notifications/delete-all`;
    devLog('🔔 API delete-all →', url, { uid, hasToken: !!token });
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ uid }),
    });
    if (!resp.ok) {
      devWarn('🔔 API delete-all FAILED', resp.status);
    } else {
      devLog('🔔 API delete-all OK');
    }
  } catch (e) { devWarn('🔔 API delete-all ERROR', e?.message || e); }
}

export default {
  displayLocal,
  subscribeUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  deleteAll,
  getUserNotifications: async function getUserNotifications(uid) {
    if (!NOTIF_ENABLED || NOTIF_ENABLED === 'false') {
      devLog('🔔 NotificationService: NOTIF_ENABLED false');
      return [];
    }
    if (!uid) {
      devLog('🔔 NotificationService: UID yok');
      return [];
    }
    try {
      devLog('🔔 NotificationService: Firestore query başlıyor, uid:', uid);
      const q = query(
        collection(db, 'notifications'),
        where('userId', '==', uid),
        // orderBy kaldırıldı - index gereksinimi ortadan kalkar
      );
      const snap = await getDocs(q);
      devLog('🔔 NotificationService: Firestore snap size:', snap.size);

      const out = [];
      snap.forEach((d) => {
        const nd = d.data();
        devLog('🔔 NotificationService: Document:', d.id);
        out.push({
          id: d.id,
          type: nd.type,
          title: nd.title,
          message: nd.body,
          timestamp: nd.createdAt?.toDate ? nd.createdAt.toDate().getTime() : Date.now(),
          isRead: !!nd.isRead,
          action: nd.action || null,
          data: nd.data || {}, // ✅ DÜZELTME: nd.data kullan, nd.action değil
          userId: nd.userId,
        });
      });

      // Client-side sorting (desc)
      out.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      devLog('🔔 NotificationService: Final output:', out.length, 'adet');
      return out;
    } catch (e) {
      devWarn('🔔 NotificationService: Firestore error:', e?.message || e);
      return [];
    }
  },
};


