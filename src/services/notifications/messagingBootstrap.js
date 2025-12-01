// Notifications Messaging Bootstrap (Feature-flagged)
// JS only, no secrets. Uses @react-native-firebase/messaging (MODULAR API)
// and react-native-push-notification for local presentation in foreground.

import { AppState, Platform, PermissionsAndroid } from 'react-native';
import { getApp } from '@react-native-firebase/app';
import {
  getMessaging,
  AuthorizationStatus,
} from '@react-native-firebase/messaging';
import { doc, setDoc, serverTimestamp, collection, getDocs, writeBatch } from 'firebase/firestore';
import { db, auth } from '../../firebase';
import { NOTIF_ENABLED, ANDROID_DEFAULT_CHANNEL_ID, ANDROID_DEFAULT_CHANNEL_NAME, API_BASE_URL } from '@env';
import notificationService from '../notificationService';

// Optional: react-native-push-notification (local display)
let PushNotification = null;

const DEFAULT_CHANNEL_ID = ANDROID_DEFAULT_CHANNEL_ID || 'default_channel';
const DEFAULT_CHANNEL_NAME = ANDROID_DEFAULT_CHANNEL_NAME || 'General Notifications';

// User-based bootstrap tracking instead of global
const userBootstrapStatus = new Map(); // uid -> boolean
const lastRegisteredTokenByUser = new Map(); // uid -> { token, ts }
let backgroundHandlerSet = false;
let unsubscribeAppState = null;
let unsubscribeOnMessage = null;
let unsubscribeOnTokenRefresh = null;

// Dev-only logger helpers to avoid widespread eslint no-console warnings
const devLog = (...args) => {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    // eslint-disable-next-line no-console
    console.log(...args);
  }
};
const devWarn = (...args) => {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    // eslint-disable-next-line no-console
    console.warn(...args);
  }
};

async function ensureAndroidDefaultChannel() {
  if (Platform.OS !== 'android') {
    return;
  }
  try {
    if (!PushNotification) {
      try { PushNotification = require('react-native-push-notification'); } catch (e) { PushNotification = null; }
    }
    if (PushNotification?.createChannel) {
      PushNotification.createChannel(
        {
          channelId: DEFAULT_CHANNEL_ID,
          channelName: DEFAULT_CHANNEL_NAME,
          channelDescription: 'Default channel',
          importance: 4,
          vibrate: true,
          soundName: 'default',
        },
        () => {},
      );
    }
  } catch (_) {
    // silent
  }
}

async function requestUserPermission(msg) {
  try {
    // Android 13+ (API 33+) için özel izin isteme
    if (Platform.OS === 'android') {
      const apiLevel = Platform.Version;

      if (apiLevel >= 33) {
        // Direkt sistem popup'ı için rationale parametresini kaldır
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
        );

        return granted === PermissionsAndroid.RESULTS.GRANTED;
      } else {
        // Android <13, notifications allowed by default
        return true;
      }
    }

    // iOS için Firebase messaging requestPermission kullan
    const status = await msg.requestPermission();

    return status === AuthorizationStatus.AUTHORIZED || status === AuthorizationStatus.PROVISIONAL;
  } catch (error) {
    devWarn('[messagingBootstrap] Permission request error:', error);
    return false;
  }
}

async function getAndSaveFcmToken(uid, msg) {
  try {
    // Not: iOS'ta auto-register default; firebase.json ile kapatmadıysan ekstra gerekmez.
    const token = await msg.getToken();
    if (!uid || !token) {
      return token;
    }

    devLog('🔐 FCM Token kaydediliyor server endpoint ile:', uid);

    // Basit debounce: aynı token kısa süre önce kaydedildiyse tekrar gönderme
    try {
      const prev = lastRegisteredTokenByUser.get(uid);
      if (prev && prev.token === token && Date.now() - prev.ts < 60_000) {
        devLog('[messagingBootstrap] Token yakın zamanda kaydedildi, atlanıyor');
        return token;
      }
    } catch (_) {}

    // SERVER ENDPOINT KULLAN - Strong cleanup + tek cihaz politikası
    try {
      const idToken = await auth.currentUser?.getIdToken?.();
      if (!idToken || !API_BASE_URL) {
        devLog('[messagingBootstrap] idToken yok veya API_BASE_URL tanımsız, client-side fallback');
        await clientSideFallbackTokenSave(uid, token);
      } else {
        const response = await fetch(`${API_BASE_URL}/notifications/register-token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            uid,
            token,
            platform: Platform?.OS || 'unknown',
            deviceId: 'unknown', // DeviceInfo yok, basit string
          }),
        });

        if (response.ok) {
          devLog('✅ FCM Token servera kaydedildi');
        } else {
          devLog('⚠️ Server token kaydı başarısız, fallback kullanılıyor');
          // Fallback: Client-side kaydetme
          await clientSideFallbackTokenSave(uid, token);
        }
      }
    } catch (error) {
      devLog('⚠️ Server token kaydı hatası, fallback kullanılıyor:', error?.message);
      // Fallback: Client-side kaydetme
      await clientSideFallbackTokenSave(uid, token);
    }

    try { lastRegisteredTokenByUser.set(uid, { token, ts: Date.now() }); } catch (_) {}

    return token;
  } catch (_) {
    return null;
  }
}

// Fallback: Eski client-side token kaydetme
async function clientSideFallbackTokenSave(uid, token) {
  try {
    const tokenDocId = token.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 120);

    // 🔐 TEK CİHAZ POLİTİKASI: Diğer tokenları deaktive et
    try {
      const tokensRef = collection(db, 'users', uid, 'tokens');
      const existingTokensSnap = await getDocs(tokensRef);

      // Batch ile diğer tokenları deaktive et
      const batch = writeBatch(db);
      existingTokensSnap.docs.forEach(tokenDoc => {
        if (tokenDoc.id !== tokenDocId) {
          batch.update(tokenDoc.ref, {
            isActive: false,
            deactivatedAt: serverTimestamp(),
            deactivatedReason: 'new_device_login',
          });
        }
      });
      await batch.commit();
    } catch (_) {}

    const tokenRef = doc(db, 'users', uid, 'tokens', tokenDocId);
    await setDoc(
      tokenRef,
      {
        token,
        isActive: true,
        platform: Platform?.OS || 'unknown',
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      },
      { merge: true },
    );

    // Backward-compat: also write to users/{uid}.fcmToken to not break any legacy readers
    try {
      const userRef = doc(db, 'users', uid);
      await setDoc(
        userRef,
        { fcmToken: token, pushEnabled: true, updatedAt: serverTimestamp() },
        { merge: true },
      );
    } catch (_) {}
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('⚠️ Client-side fallback token kaydetme hatası:', error?.message);
  }
}

function presentLocal(notification) {
  const title = notification?.title || 'Bildirim';
  const body = notification?.body || notification?.message || '';
  const actionType = notification?.data?.actionType || notification?.actionType;
  const actionId = notification?.data?.actionId || notification?.actionId;

  try {
    if (!PushNotification) {
      try { PushNotification = require('react-native-push-notification'); } catch (e) { PushNotification = null; }
    }
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
        userInfo: { actionType, actionId },
        data: { actionType, actionId },
      });
    }
  } catch (_) {
    // silent
  }
}

export async function bootstrapMessaging(uid) {
  if (!NOTIF_ENABLED || NOTIF_ENABLED === 'false') {
    devLog('[bootstrapMessaging] Bildirimler devre dışı.');
    return { enabled: false };
  }

  // User-based bootstrap check
  if (userBootstrapStatus.get(uid)) {
    devLog('[bootstrapMessaging] Bu kullanıcı için zaten başlatıldı:', uid);
    return { enabled: true };
  }

  devLog('[bootstrapMessaging] Kullanıcı için başlatılıyor:', uid);
  userBootstrapStatus.set(uid, true);

  await ensureAndroidDefaultChannel();

  const app = getApp();
  const msg = getMessaging(app);

  devLog('[bootstrapMessaging] İzin isteniyor...');
  const granted = await requestUserPermission(msg);
  devLog('[bootstrapMessaging] İzin sonucu:', granted);

  if (granted) {
    devLog('[bootstrapMessaging] FCM token alınıyor...');
    await getAndSaveFcmToken(uid, msg);
    devLog('[bootstrapMessaging] Token alındı:', true);
  } else {
    devLog('[bootstrapMessaging] İzin reddedildi, token alınmıyor');
  }

  // Token refresh - ENHANCED: Update both old and new token storage
  unsubscribeOnTokenRefresh = msg.onTokenRefresh(async (token) => {
    if (uid && token) {
      devLog('🔄 FCM Token refresh - yeni token kaydediliyor:', uid);
      // Aynı token kısa sürede tekrar geldiyse atla
      try {
        const prev = lastRegisteredTokenByUser.get(uid);
        if (prev && prev.token === token && Date.now() - prev.ts < 60_000) {
          devLog('[messagingBootstrap] Refresh token same as recent, skip');
          return;
        }
      } catch (_) {}
      try {
        // Use server endpoint for consistency
        const idToken = await auth.currentUser?.getIdToken?.();
        if (!idToken || !API_BASE_URL) {
          devLog('[messagingBootstrap] Refresh: idToken yok veya API URL yok, fallback');
          await clientSideFallbackTokenSave(uid, token);
        } else {
          const response = await fetch(`${API_BASE_URL}/notifications/register-token`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({
              uid,
              token,
              platform: Platform?.OS || 'unknown',
              deviceId: 'unknown',
            }),
          });

          if (response.ok) {
            devLog('✅ FCM Token refresh servera kaydedildi');
          } else {
            devLog('⚠️ Server token refresh başarısız, fallback kullanılıyor');
            // Fallback: Client-side kaydetme
            await clientSideFallbackTokenSave(uid, token);
          }
        }
      } catch (error) {
        devLog('⚠️ Server token refresh hatası, fallback kullanılıyor:', error?.message);
        // Fallback: Client-side kaydetme
        await clientSideFallbackTokenSave(uid, token);
      }
      try { lastRegisteredTokenByUser.set(uid, { token, ts: Date.now() }); } catch (_) {}
    }
  });

  // Foreground messages: show + write to local storage for badge/list immediacy
  unsubscribeOnMessage = msg.onMessage(async (remoteMessage) => {
    const title = remoteMessage?.notification?.title || remoteMessage?.data?.title;
    const body = remoteMessage?.notification?.body || remoteMessage?.data?.body;
    const actionType = remoteMessage?.data?.actionType;
    const actionId = remoteMessage?.data?.actionId;
    const type = remoteMessage?.data?.type;
    const action = remoteMessage?.data?.action;

    // Silme komutu kontrolü
    if (type === 'permission_request_processed' && action === 'delete_original') {
      devLog('🗑️ Orijinal izin talebi bildirimi siliniyor...');
      try {
        const permissionRequestId = remoteMessage?.data?.permissionRequestId;
        if (uid && permissionRequestId) {
          // AsyncStorage'dan orijinal bildirimi sil
          await notificationService.deleteNotificationFromLocalStorage(uid, `permission_request:${permissionRequestId}`);
          devLog('🗑️ Orijinal bildirim silindi');
        }
      } catch (error) {
        devLog('⚠️ Orijinal bildirim silme hatası:', error?.message);
      }
      return; // Bu mesajı gösterme
    }

    presentLocal({
      title,
      body,
      actionType,
      actionId,
      data: remoteMessage?.data,
    });
    try {
      if (uid) {
        await notificationService.saveNotificationToLocalStorage(
          uid,
          { title, body, data: { type, actionType, actionId } },
          'remote_' + Date.now(),
        );
      }
    } catch (_) {}
  });

  // Background (headless) messages — register once
  if (!backgroundHandlerSet) {
    msg.setBackgroundMessageHandler(async (remoteMessage) => {
      const title = remoteMessage?.notification?.title || remoteMessage?.data?.title;
      const body = remoteMessage?.notification?.body || remoteMessage?.data?.body;
      const actionType = remoteMessage?.data?.actionType;
      const actionId = remoteMessage?.data?.actionId;
      const type = remoteMessage?.data?.type;
      presentLocal({
        title,
        body,
        actionType,
        actionId,
        data: remoteMessage?.data,
      });
      try {
        if (uid) {
          await notificationService.saveNotificationToLocalStorage(
            uid,
            { title, body, data: { type, actionType, actionId } },
            'remote_' + Date.now(),
          );
        }
      } catch (_) {}
    });
    backgroundHandlerSet = true;
  }

  // iOS 15+ AppState token re-check - ENHANCED: Update both old and new token storage
  if (!unsubscribeAppState) {
    unsubscribeAppState = AppState.addEventListener('change', async (state) => {
      if (state === 'active') {
        try {
          const token = await msg.getToken();
          if (uid && token) {
            devLog('📱 AppState active - token kontrol ediliyor:', uid);
            // Yakın zamanda aynı token kaydı yapıldıysa atla
            try {
              const prev = lastRegisteredTokenByUser.get(uid);
              if (prev && prev.token === token && Date.now() - prev.ts < 60_000) {
                devLog('[messagingBootstrap] AppState: recent token, skip');
                return;
              }
            } catch (_) {}

            // Use server endpoint for consistency
            try {
              const idToken = await auth.currentUser?.getIdToken?.();
              if (!idToken || !API_BASE_URL) {
                devLog('[messagingBootstrap] AppState: idToken yok veya API URL yok, fallback');
                await clientSideFallbackTokenSave(uid, token);
              } else {
                const response = await fetch(`${API_BASE_URL}/notifications/register-token`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${idToken}`,
                  },
                  body: JSON.stringify({
                    uid,
                    token,
                    platform: Platform?.OS || 'unknown',
                    deviceId: 'unknown',
                  }),
                });

                if (response.ok) {
                  devLog('✅ AppState token servera kaydedildi');
                } else {
                  devLog('⚠️ AppState server token kaydı başarısız, fallback kullanılıyor');
                  await clientSideFallbackTokenSave(uid, token);
                }
              }
            } catch (error) {
              devLog('⚠️ AppState server token hatası, fallback kullanılıyor:', error?.message);
              await clientSideFallbackTokenSave(uid, token);
            }
            try { lastRegisteredTokenByUser.set(uid, { token, ts: Date.now() }); } catch (_) {}
          }
        } catch (_) {}
      }
    });
  }

  return { enabled: true };
}

export function teardownMessaging() {
  if (unsubscribeOnMessage) {
    try { unsubscribeOnMessage(); } catch (_) {}
    unsubscribeOnMessage = null;
  }
  if (unsubscribeOnTokenRefresh) {
    try { unsubscribeOnTokenRefresh(); } catch (_) {}
    unsubscribeOnTokenRefresh = null;
  }
  if (unsubscribeAppState) {
    try { unsubscribeAppState.remove(); } catch (_) {}
    unsubscribeAppState = null;
  }
  // backgroundHandlerSet bilerek bırakılıyor (process scoped). Tekrar kayıt etmiyoruz.

  // Clear user bootstrap status for all users (logout scenario)
  userBootstrapStatus.clear();
}

export default {
  bootstrapMessaging,
  teardownMessaging,
};
