// Firebase Auth Custom Token Wrapper
import { auth } from '../../firebase';
import { signInWithCustomToken as firebaseSignInWithCustomToken, signOut as firebaseSignOut, onAuthStateChanged as firebaseOnAuthStateChanged } from 'firebase/auth';

/**
 * Custom token ile Firebase Auth'a sign in
 * @param {string} customToken - Server'dan alınan custom token
 * @returns {Promise<{success: boolean, user?: any, error?: string}>}
 */
export async function signInWithCustomToken(customToken) {
  try {
    // console.log('[Firebase Auth] Custom token ile giriş yapılıyor...'); // Production'da kapat
    // console.log('[Firebase Auth] Token type:', typeof customToken); // Production'da kapat
    // console.log('[Firebase Auth] Token length:', customToken ? customToken.length : 'null/undefined'); // Production'da kapat
    // console.log('[Firebase Auth] Token preview:', customToken ? customToken.substring(0, 50) + '...' : 'NULL TOKEN'); // Production'da kapat
    
    if (!customToken || customToken.trim() === '') {
      throw new Error('Custom token is empty or null');
    }
    
    const userCredential = await firebaseSignInWithCustomToken(auth, customToken);
    const user = userCredential.user;

    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      // eslint-disable-next-line no-console
      console.log('[Firebase Auth] Custom token ile giriş başarılı:', user?.uid);
    }

    let claims = {};
    try {
      const res = await user.getIdTokenResult();
      claims = res?.claims || {};
    } catch (e) {
      // Keep sign-in successful even if claims fetch fails
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        // eslint-disable-next-line no-console
        console.warn('[Firebase Auth] Claims okunamadı (dev):', e?.message || e);
      }
    }

    return {
      success: true,
      user: {
        uid: user.uid,
        phoneNumber: user.phoneNumber,
        customClaims: claims,
      },
    };
  } catch (error) {
    console.error('[Firebase Auth] Custom token giriş hatası:', error);
    
    let errorMessage = 'Giriş başarısız';
    
    switch (error.code) {
      case 'auth/invalid-custom-token':
        errorMessage = 'Geçersiz giriş token\'ı';
        break;
      case 'auth/custom-token-mismatch':
        errorMessage = 'Token project eşleşmiyor';
        break;
      case 'auth/network-request-failed':
        errorMessage = 'İnternet bağlantısı hatası';
        break;
      default:
        errorMessage = error.message || 'Giriş hatası oluştu';
    }
    
    return {
      success: false,
      error: error.code || 'auth_error',
      message: errorMessage,
    };
  }
}

/**
 * Firebase Auth'dan çıkış yap
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function signOut() {
  try {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      // eslint-disable-next-line no-console
      console.log('[Firebase Auth] Çıkış yapılıyor...');
    }
    
    await firebaseSignOut(auth);
    
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      // eslint-disable-next-line no-console
      console.log('[Firebase Auth] Başarılı çıkış');
    }
    
    return {
      success: true,
    };
  } catch (error) {
    console.error('[Firebase Auth] Çıkış hatası:', error);
    
    return {
      success: false,
      error: error.code || 'signout_error',
      message: error.message || 'Çıkış işlemi başarısız',
    };
  }
}

/**
 * Auth state değişikliklerini dinle
 * @param {function} callback - Auth state değiştiğinde çağrılacak callback
 * @returns {function} Unsubscribe fonksiyonu
 */
export function onAuthStateChanged(callback) {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    // eslint-disable-next-line no-console
    console.log('[Firebase Auth] Auth state listener başlatılıyor...');
  }
  
  return firebaseOnAuthStateChanged(auth, (user) => {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      // eslint-disable-next-line no-console
      console.log('[Firebase Auth] Auth state değişti:', user ? `User: ${user.uid}` : 'Signed out');
    }
    
    if (user) {
      // User objesi ile callback çağır
      callback({
        uid: user.uid,
        phoneNumber: user.phoneNumber,
        email: user.email,
        emailVerified: user.emailVerified,
        isAnonymous: user.isAnonymous,
        metadata: {
          creationTime: user.metadata.creationTime,
          lastSignInTime: user.metadata.lastSignInTime,
        },
      });
    } else {
      // Null ile callback çağır
      callback(null);
    }
  });
}

/**
 * Mevcut kullanıcıyı al
 * @returns {object|null} Mevcut kullanıcı veya null
 */
export function getCurrentUser() {
  const user = auth.currentUser;
  
  if (user) {
    return {
      uid: user.uid,
      phoneNumber: user.phoneNumber,
      email: user.email,
      emailVerified: user.emailVerified,
      isAnonymous: user.isAnonymous,
      metadata: {
        creationTime: user.metadata.creationTime,
        lastSignInTime: user.metadata.lastSignInTime,
      },
    };
  }
  
  return null;
}

/**
 * ID Token al (Firestore rules için)
 * @param {boolean} forceRefresh - Token'ı yenilemek için
 * @returns {Promise<{success: boolean, token?: string, error?: string}>}
 */
export async function getIdToken(forceRefresh = false) {
  try {
    const user = auth.currentUser;
    
    if (!user) {
      return {
        success: false,
        error: 'not_authenticated',
        message: 'Kullanıcı giriş yapmamış',
      };
    }
    
    const token = await user.getIdToken(forceRefresh);
    
    return {
      success: true,
      token,
    };
  } catch (error) {
    console.error('[Firebase Auth] ID Token alma hatası:', error);
    
    return {
      success: false,
      error: error.code || 'token_error',
      message: error.message || 'Token alınamadı',
    };
  }
}

/**
 * Custom claims al
 * @returns {Promise<{success: boolean, claims?: object, error?: string}>}
 */
export async function getCustomClaims() {
  try {
    const user = auth.currentUser;
    
    if (!user) {
      return {
        success: false,
        error: 'not_authenticated',
        message: 'Kullanıcı giriş yapmamış',
      };
    }
    
    const idTokenResult = await user.getIdTokenResult(true); // Force refresh
    
    return {
      success: true,
      claims: idTokenResult.claims,
    };
  } catch (error) {
    console.error('[Firebase Auth] Custom claims alma hatası:', error);
    
    return {
      success: false,
      error: error.code || 'claims_error',
      message: error.message || 'Claims alınamadı',
    };
  }
}

/**
 * Auth durumunu kontrol et
 * @returns {Promise<{authenticated: boolean, user?: object}>}
 */
export async function checkAuthStatus() {
  return new Promise((resolve) => {
    const unsubscribe = firebaseOnAuthStateChanged(auth, (user) => {
      unsubscribe(); // Tek seferlik kontrol
      
      if (user) {
        resolve({
          authenticated: true,
          user: {
            uid: user.uid,
            phoneNumber: user.phoneNumber,
            email: user.email,
          },
        });
      } else {
        resolve({
          authenticated: false,
        });
      }
    });
  });
}

export default {
  signInWithCustomToken,
  signOut,
  onAuthStateChanged,
  getCurrentUser,
  getIdToken,
  getCustomClaims,
  checkAuthStatus,
};
