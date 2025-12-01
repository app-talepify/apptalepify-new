// Manuel olarak kullanıcı şifre hash'i güncelleme utility'si (yalnızca geliştirme amaçlı)
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { simpleHash } from './hash';

// Dev-only log helper
const devLog = (...args) => { if (typeof __DEV__ !== 'undefined' && __DEV__) { try { /* eslint-disable no-console */ console.log(...args); /* eslint-enable no-console */ } catch {} } };

export const updateUserPasswordHash = async (userId, password) => {
  try {
    // Prod'da devre dışı
    if (!(typeof __DEV__ !== 'undefined' && __DEV__)) {
      return { success: false, error: 'manual_password_update_disabled_in_production' };
    }

    const uid = String(userId || '').trim();
    const pwd = String(password || '');
    if (!uid || !pwd) {
      return { success: false, error: 'missing_user_or_password' };
    }
    if (pwd.length < 6) {
      return { success: false, error: 'password_too_short' };
    }

    devLog('=== MANUEL ŞİFRE GÜNCELLEME ===');
    devLog('User ID:', uid);
    devLog('Password length:', pwd.length);

    // Şifreyi hash'le
    const passwordHash = simpleHash(pwd);
    devLog('Password Hash (preview):', String(passwordHash).slice(0, 4) + '****');

    // Firestore'da güncelle
    const userDocRef = doc(db, 'users', uid);
    await updateDoc(userDocRef, {
      passwordHash: passwordHash,
      updatedAt: serverTimestamp(),
    });

    devLog('Kullanıcı şifresi başarıyla güncellendi!');
    return { success: true, hash: passwordHash };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Manual password update error:', error);
    return { success: false, error: error?.message || String(error) };
  }
};

// Test kullanıcısı için örnek fonksiyon (yalnızca geliştirmede çalışır)
export const updateTestUserPassword = async (testUserId, testPassword) => {
  if (!(typeof __DEV__ !== 'undefined' && __DEV__)) {
    return { success: false, error: 'manual_password_update_disabled_in_production' };
  }
  return await updateUserPasswordHash(testUserId, testPassword);
};
