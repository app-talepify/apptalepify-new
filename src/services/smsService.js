import { auth } from '../firebase';
import { API_BASE_URL, SMS_API_BASE_URL } from '@env';

// Dev log helpers & PII masking
const devLog = (...args) => { if (typeof __DEV__ !== 'undefined' && __DEV__) { try { /* eslint-disable no-console */ console.log(...args); /* eslint-enable no-console */ } catch {} } };
const devWarn = (...args) => { if (typeof __DEV__ !== 'undefined' && __DEV__) { try { /* eslint-disable no-console */ console.warn(...args); /* eslint-enable no-console */ } catch {} } };
const maskPhone = (p) => {
  try {
    const s = String(p || '');
    if (s.length <= 4) return '****';
    return `${s.slice(0, 2)}****${s.slice(-2)}`;
  } catch { return '****'; }
};

// Base URL: env öncelikli, yoksa güvenli geri dönüş olarak mevcut prod Cloud Functions URL
const API_BASE = (SMS_API_BASE_URL || API_BASE_URL || 'https://europe-west1-apptalepify-14dbc.cloudfunctions.net/bunny').replace(/\/+$/,'');

/**
 * SMS gönderme servisi
 */
export const sendSMS = async (phoneNumber, message) => {
  try {
    // Firebase ID token al
    const user = auth.currentUser;
    if (!user) {
      throw new Error('Kullanıcı giriş yapmamış');
    }
    
    // Force refresh the ID token to avoid using a stale token that may be rejected by the server
    const idToken = await user.getIdToken(true);
    try { if (typeof __DEV__ !== 'undefined' && __DEV__) { const preview = typeof idToken === 'string' ? idToken.slice(0, 12) : String(idToken); /* eslint-disable no-console */ console.log('📱 SMS Auth token (preview):', preview, '...'); /* eslint-enable no-console */ } } catch {}
    if (!idToken) {
      throw new Error('Auth token alınamadı');
    }
    
    const url = `${API_BASE}/send-sms`;
    devLog('📱 SMS API çağrısı:', url);
    devLog('📱 SMS Payload:', { phoneNumber: maskPhone(phoneNumber), message: String(message || '').slice(0, 50) + '...' });
    
    // 10s timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort('timeout'), 10000);
    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          phoneNumber,
          message,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
    
    devLog('📱 SMS Response status:', response.status);
    
    // Eğer response HTML ise (error page), text olarak oku
    const contentType = response.headers.get('content-type');
    let result;
    
    if (contentType && contentType.includes('application/json')) {
      result = await response.json();
    } else {
      // HTML error page - text olarak oku
      const textResponse = await response.text();
      devWarn('📱 SMS Error response (HTML):', textResponse.substring(0, 500));
      throw new Error(`SMS endpoint error: ${response.status} - ${textResponse.substring(0, 200)}`);
    }
    
    // Mock token ile retry kaldırıldı (prod güvenliği)

    if (!response.ok) {
      devWarn('📱 SMS Error response:', result);
      throw new Error(result.error || 'SMS gönderilemedi');
    }
    
    return result;
  } catch (error) {
    console.error('SMS gönderim hatası:', error);
    throw error;
  }
};

/**
 * Permission request SMS template
 */
export const createPermissionRequestSMS = (requesterName, portfolioTitle, portfolioOwnerName) => {
  return `Merhaba ${portfolioOwnerName}, ${requesterName} kullanıcısı '${portfolioTitle}' portföyünüzü müşterisi ile kendi adına paylaşmak istiyor. Uygulama üzerinden onaylayabilirsiniz. - Talepify`;
};

/**
 * Permission approved SMS template  
 */
export const createPermissionApprovedSMS = (portfolioTitle, portfolioOwnerName) => {
  return `İzin talebi onaylandı! '${portfolioTitle}' portföyünü ${portfolioOwnerName} kullanıcısından aldığınız izinle müşterinizle paylaşabilirsiniz. - Talepify`;
};
