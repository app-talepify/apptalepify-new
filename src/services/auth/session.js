// Session Management - Custom Token entegrasyonu
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loginWithOtp, passwordLogin, registerWithOtp } from './api';
import { signInWithCustomToken, signOut, getCurrentUser } from './firebaseAuth';
import { db } from '../../firebase';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

// Session storage keys
const STORAGE_KEYS = {
  USER_PROFILE: 'userProfile',
  USER_UID: 'userUid',
  LAST_LOGIN_METHOD: 'lastLoginMethod',
  PHONE_NUMBER: 'phoneNumber',
};

/**
 * OTP ile login ve session başlat
 * @param {string} phoneNumber - Telefon numarası
 * @param {string} code - OTP kodu
 * @param {string} purpose - Login amacı (login, register)
 * @returns {Promise<{success: boolean, user?: object, error?: string}>}
 */
export async function loginWithOtpAndStartSession(phoneNumber, code, purpose = 'login') {
  try {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      // eslint-disable-next-line no-console
      console.log(`[Session] OTP ile login başlatılıyor: ${maskPhone(phoneNumber)} (${purpose})`);
    }
    
    // 1. Server'dan custom token al
    const tokenResult = await loginWithOtp(phoneNumber, code, purpose);
    
    // API format uyumsuzluğu düzeltmesi: ok -> success
    if (!tokenResult.ok && !tokenResult.success) {
      // KRİTİK GÜVENLİK: OTP başarısız olduğunda Firebase Auth state'i temizle
      try {
        await signOut();
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          // eslint-disable-next-line no-console
          console.log('[Session] OTP başarısız - Firebase Auth state temizlendi');
        }
      } catch (signOutError) {
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          // eslint-disable-next-line no-console
          console.log('[Session] Firebase signOut hatası:', signOutError?.message);
        }
      }
      
      return {
        success: false,
        error: tokenResult.code || tokenResult.error,
        message: tokenResult.message,
        data: tokenResult.data,
      };
    }
    
    const { uid, token, user: serverUser } = tokenResult.data;

    // Eğer farklı bir kullanıcıya geçiliyorsa önceki kullanıcının trusted device bilgisini temizle
    try {
      const prevUid = await AsyncStorage.getItem(STORAGE_KEYS.USER_UID);
      if (prevUid && prevUid !== uid) {
        await AsyncStorage.removeItem(`trusted_device_${prevUid}`);
      }
    } catch (_) {}
    
    // 2. Firebase Auth ile giriş yap
    const authResult = await signInWithCustomToken(token);
    if (!authResult.success) {
      return {
        success: false,
        error: authResult.error,
        message: authResult.message,
      };
    }
    
    // 3. Firestore'dan tam kullanıcı profilini al
    const userProfile = await ensureUserProfile(uid, phoneNumber, serverUser);
    
    // 4. Local storage'a kaydet
    await saveUserSession(uid, phoneNumber, userProfile, 'otp');
    
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      // eslint-disable-next-line no-console
      console.log(`[Session] Başarılı OTP login: ${uid}`);
    }
    
    return {
      success: true,
      user: userProfile,
      uid: uid,
      loginMethod: 'otp',
    };
  } catch (error) {
    console.error('[Session] OTP login hatası:', error);
    
    return {
      success: false,
      error: 'session_error',
      message: 'Session başlatma hatası: ' + error.message,
    };
  }
}

/**
 * Şifre ile login ve session başlat
 * @param {string} phoneNumber - Telefon numarası
 * @param {string} password - Şifre
 * @returns {Promise<{success: boolean, user?: object, error?: string}>}
 */
export async function loginWithPasswordAndStartSession(phoneNumber, password) {
  try {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      // eslint-disable-next-line no-console
      console.log(`[Session] Şifre ile login başlatılıyor: ${maskPhone(phoneNumber)}`);
    }
    
    // 1. Server'dan custom token al
    const tokenResult = await passwordLogin(phoneNumber, password);
    if (!tokenResult.success) {
      return {
        success: false,
        error: tokenResult.error,
        message: tokenResult.message,
        data: tokenResult.data,
      };
    }
    
    const { uid, token, user: serverUser } = tokenResult.data;

    // Kullanıcı değişiminde önceki kullanıcının trusted device bilgisini temizle
    try {
      const prevUid = await AsyncStorage.getItem(STORAGE_KEYS.USER_UID);
      if (prevUid && prevUid !== uid) {
        await AsyncStorage.removeItem(`trusted_device_${prevUid}`);
      }
    } catch (_) {}
    
    // 2. Firebase Auth ile giriş yap
    const authResult = await signInWithCustomToken(token);
    if (!authResult.success) {
      return {
        success: false,
        error: authResult.error,
        message: authResult.message,
      };
    }
    
    // 3. Firestore'dan tam kullanıcı profilini al
    const userProfile = await ensureUserProfile(uid, phoneNumber, serverUser);
    
    // 4. Local storage'a kaydet
    await saveUserSession(uid, phoneNumber, userProfile, 'password');
    
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      // eslint-disable-next-line no-console
      console.log(`[Session] Başarılı şifre login: ${uid}`);
    }
    
    return {
      success: true,
      user: userProfile,
      uid: uid,
      loginMethod: 'password',
    };
  } catch (error) {
    console.error('[Session] Şifre login hatası:', error);
    
    return {
      success: false,
      error: 'session_error',
      message: 'Session başlatma hatası: ' + error.message,
    };
  }
}

/**
 * Session'ı sonlandır
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function endSession() {
  try {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      // eslint-disable-next-line no-console
      console.log('[Session] Session sonlandırılıyor...');
    }
    
    // 1. Firebase Auth'dan çıkış yap
    await signOut();
    
    // 2. Local storage'ı temizle
    await clearUserSession();
    
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      // eslint-disable-next-line no-console
      console.log('[Session] Session başarıyla sonlandırıldı');
    }
    
    return {
      success: true,
    };
  } catch (error) {
    console.error('[Session] Session sonlandırma hatası:', error);
    
    return {
      success: false,
      error: 'session_error',
      message: 'Session sonlandırma hatası: ' + error.message,
    };
  }
}

/**
 * Mevcut session'ı kontrol et ve restore et
 * @returns {Promise<{authenticated: boolean, user?: object, restored?: boolean}>}
 */
export async function checkAndRestoreSession() {
  try {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      // eslint-disable-next-line no-console
      console.log('[Session] Session kontrol ediliyor...');
    }
    
    // 1. Firebase Auth durumunu kontrol et
    const currentUser = getCurrentUser();
    
    if (!currentUser) {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        // eslint-disable-next-line no-console
        console.log('[Session] Firebase Auth kullanıcısı yok');
      }
      await clearUserSession();
      return { authenticated: false };
    }
    
    // 2. Local storage'dan kullanıcı profilini al
    const storedProfile = await getStoredUserProfile();
    
    if (!storedProfile) {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        // eslint-disable-next-line no-console
        console.log('[Session] Local profile bulunamadı, Firestore\'dan yenileniyor');
      }
      
      // Firestore'dan profile al
      const freshProfile = await getUserProfileFromFirestore(currentUser.uid);
      if (freshProfile) {
        await saveUserProfile(freshProfile);
      }
      
      return {
        authenticated: true,
        user: freshProfile,
        restored: true,
      };
    }
    
    // 3. Profile güncellenmiş mi kontrol et (opsiyonel)
    const lastUpdate = storedProfile.updatedAt;
    if (lastUpdate && Date.now() - new Date(lastUpdate).getTime() > 24 * 60 * 60 * 1000) {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        // eslint-disable-next-line no-console
        console.log('[Session] Profile 24 saatten eski, yenileniyor');
      }
      
      const freshProfile = await getUserProfileFromFirestore(currentUser.uid);
      if (freshProfile) {
        await saveUserProfile(freshProfile);
        return {
          authenticated: true,
          user: freshProfile,
          restored: true,
        };
      }
    }
    
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      // eslint-disable-next-line no-console
      console.log(`[Session] Session restore edildi: ${storedProfile.uid}`);
    }
    
    return {
      authenticated: true,
      user: storedProfile,
      restored: false,
    };
  } catch (error) {
    console.error('[Session] Session kontrol hatası:', error);
    
    // Hata durumunda temizle
    await clearUserSession();
    
    return {
      authenticated: false,
      error: error.message,
    };
  }
}

/**
 * Firestore'dan kullanıcı profile'ını al/oluştur
 * @param {string} uid - Kullanıcı UID
 * @param {string} phoneNumber - Telefon numarası
 * @param {object} serverUser - Server'dan gelen kullanıcı verisi
 * @returns {Promise<object>} Kullanıcı profili
 */
async function ensureUserProfile(uid, phoneNumber, serverUser = {}) {
  try {
    const userRef = doc(db, 'users', uid);
    const userDoc = await getDoc(userRef);
    
    if (userDoc.exists()) {
      // Mevcut kullanıcı - lastLoginAt güncelle
      const userData = userDoc.data();
      
      await updateDoc(userRef, {
        lastLoginAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      
      return {
        ...userData,
        lastLoginAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    } else {
      // Yeni kullanıcı - temel profil oluştur
      const newUserData = {
        uid: uid,
        phoneNumber: phoneNumber,
        displayName: serverUser.displayName || '',
        city: serverUser.city || '',
        officeName: serverUser.officeName || '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
      };
      
      await setDoc(userRef, newUserData);
      
      return {
        ...newUserData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
      };
    }
  } catch (error) {
    console.error('[Session] User profile ensure hatası:', error);
    throw error;
  }
}

/**
 * Firestore'dan kullanıcı profilini al
 * @param {string} uid - Kullanıcı UID
 * @returns {Promise<object|null>} Kullanıcı profili veya null
 */
async function getUserProfileFromFirestore(uid) {
  try {
    const userRef = doc(db, 'users', uid);
    const userDoc = await getDoc(userRef);
    
    if (userDoc.exists()) {
      return userDoc.data();
    } else {
      return null;
    }
  } catch (error) {
    console.error('[Session] Firestore profile alma hatası:', error);
    return null;
  }
}

/**
 * User session'ını local storage'a kaydet
 * @param {string} uid - Kullanıcı UID
 * @param {string} phoneNumber - Telefon numarası
 * @param {object} userProfile - Kullanıcı profili
 * @param {string} loginMethod - Login metodu
 */
async function saveUserSession(uid, phoneNumber, userProfile, loginMethod) {
  try {
    await AsyncStorage.multiSet([
      [STORAGE_KEYS.USER_UID, uid],
      [STORAGE_KEYS.PHONE_NUMBER, phoneNumber],
      [STORAGE_KEYS.USER_PROFILE, JSON.stringify(userProfile)],
      [STORAGE_KEYS.LAST_LOGIN_METHOD, loginMethod],
    ]);
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      // eslint-disable-next-line no-console
      console.log('[Session] User session kaydedildi');
    }
  } catch (error) {
    console.error('[Session] Session kaydetme hatası:', error);
    throw error;
  }
}

/**
 * User profile'ını local storage'a kaydet
 * @param {object} userProfile - Kullanıcı profili
 */
async function saveUserProfile(userProfile) {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.USER_PROFILE, JSON.stringify(userProfile));
  } catch (error) {
    console.error('[Session] Profile kaydetme hatası:', error);
  }
}

/**
 * Stored user profile'ını al
 * @returns {Promise<object|null>} Kullanıcı profili veya null
 */
async function getStoredUserProfile() {
  try {
    const profileJson = await AsyncStorage.getItem(STORAGE_KEYS.USER_PROFILE);
    return profileJson ? JSON.parse(profileJson) : null;
  } catch (error) {
    console.error('[Session] Stored profile alma hatası:', error);
    return null;
  }
}

/**
 * User session'ını temizle
 */
async function clearUserSession() {
  try {
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.USER_UID,
      STORAGE_KEYS.PHONE_NUMBER,
      STORAGE_KEYS.USER_PROFILE,
      STORAGE_KEYS.LAST_LOGIN_METHOD,
    ]);
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      // eslint-disable-next-line no-console
      console.log('[Session] User session temizlendi');
    }
  } catch (error) {
    console.error('[Session] Session temizleme hatası:', error);
  }
}

/**
 * Stored session bilgilerini al
 * @returns {Promise<{uid?: string, phoneNumber?: string, loginMethod?: string}>}
 */
export async function getStoredSessionInfo() {
  try {
    const values = await AsyncStorage.multiGet([
      STORAGE_KEYS.USER_UID,
      STORAGE_KEYS.PHONE_NUMBER,
      STORAGE_KEYS.LAST_LOGIN_METHOD,
    ]);
    
    const result = {};
    values.forEach(([key, value]) => {
      if (value) {
        const shortKey = key.split('.').pop();
        result[shortKey] = value;
      }
    });
    
    return result;
  } catch (error) {
    console.error('[Session] Session info alma hatası:', error);
    return {};
  }
}

/**
 * OTP ile register ve session başlat
 * @param {string} phoneNumber - Telefon numarası
 * @param {string} code - OTP kodu (dummy, zaten doğrulanmış)
 * @param {object} profileData - Profil bilgileri
 * @returns {Promise<{success: boolean, user?: object, error?: string}>}
 */
export async function registerWithOtpAndStartSession(phoneNumber, code, profileData) {
  try {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      // eslint-disable-next-line no-console
      console.log('[Session] Register with OTP başlatılıyor...');
    }
    
    // API ile register
    const response = await registerWithOtp(phoneNumber, code, profileData);
    
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      // eslint-disable-next-line no-console
      console.log('[Session] API response ok:', response?.ok === true);
    }
    
    if (!response.ok) {
      return {
        success: false,
        error: response.code,
        message: response.message
      };
    }
    
    const { uid, token, user } = response.data;
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      // eslint-disable-next-line no-console
      console.log('[Session] Extracted uid:', uid, '| token length:', token ? `${String(token).length}` : 'null');
    }
    
    // Firebase Auth ile sign in
    await signInWithCustomToken(token);
    
    // Local storage'a kaydet
    await saveUserSession(uid, phoneNumber, user, 'register');
    
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      // eslint-disable-next-line no-console
      console.log('[Session] Register başarılı, session başlatıldı');
    }
    
    return {
      success: true,
      user: user
    };
    
  } catch (error) {
    console.error('[Session] Register with OTP error:', error);
    return {
      success: false,
      error: error.code || 'register_failed',
      message: error.message || 'Register başarısız'
    };
  }
}

// Yardımcı: telefon numarasını maskeler
function maskPhone(phone) {
  if (!phone || typeof phone !== 'string') return '';
  const p = phone.trim();
  if (p.length <= 4) return '****';
  const head = p.slice(0, 3);
  const tail = p.slice(-2);
  return `${head}*****${tail}`;
}

export default {
  loginWithOtpAndStartSession,
  loginWithPasswordAndStartSession,
  registerWithOtpAndStartSession,
  endSession,
  checkAndRestoreSession,
  getStoredSessionInfo,
};
