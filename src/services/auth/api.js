// Firebase Auth Custom Token API Client - Production-ready
import { API_BASE_URL as ENV_API_URL, AUTH_CUSTOM_TOKEN_ENABLED as AUTH_ENV } from '@env';

// Feature flag kontrolü (RN'de @env, aksi halde process.env)
const AUTH_ENABLED = (typeof AUTH_ENV === 'string' ? AUTH_ENV !== 'false' : (process.env?.AUTH_CUSTOM_TOKEN_ENABLED !== 'false'));

// API Base URL - @env öncelikli, yoksa process.env, yoksa varsayılan
const API_BASE_URL = (ENV_API_URL || process.env?.API_BASE_URL || 'https://europe-west1-apptalepify-14dbc.cloudfunctions.net/bunny');

/**
 * Fetch wrapper with error handling
 * @param {string} endpoint - API endpoint
 * @param {object} options - Fetch options
 * @returns {Promise} Response
 */
async function apiRequest(endpoint, options = {}) {
  if (!AUTH_ENABLED) {
    if (typeof __dev__ !== 'undefined' ? __dev__ : (typeof __DEV__ !== 'undefined' && __DEV__)) {
      // eslint-disable-next-line no-console
      console.warn('[Auth API] Custom Token sistemi devre dışı!');
    }
    throw new Error('AUTH_DISABLED');
  }

  const url = `${API_BASE_URL}${endpoint}`;
  const method = options.method || 'GET';
  
  // console.log(`[Auth API] ${method.toUpperCase()} ${endpoint}`); // Production'da kapat
  const timeoutMs = (typeof options.timeout === 'number' ? options.timeout : 8000);
  const { timeout, headers: optHeaders, body: optBody, ...rest } = options;
  const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  const signal = controller ? controller.signal : undefined;
  const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  const fetchOptions = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-Requested-With': 'TalepifyApp',
      ...optHeaders,
    },
    ...(optBody && typeof optBody === 'object' ? { body: JSON.stringify(optBody) } : (optBody ? { body: optBody } : {})),
    ...(signal ? { signal } : {}),
    ...rest,
  };

  try {
    const response = await fetch(url, fetchOptions);
    const data = await response.json();

    if (!response.ok) {
      // eslint-disable-next-line no-console
      console.error(`[Auth API] ❌ ${response.status} ${method.toUpperCase()} ${endpoint}`);
      if (typeof __dev__ !== 'undefined' ? __dev__ : (typeof __DEV__ !== 'undefined' && __DEV__)) {
        // eslint-disable-next-line no-console
        console.error('[Auth API] Error details (dev):', data);
      }
      
      // Standardize error format
      const standardError = {
        code: data?.code || getDefaultErrorCode(response.status),
        message: data?.message || getDefaultErrorMessage(response.status),
        data: data?.data,
        resetAt: data?.resetAt, // Rate limit reset time
        lockUntil: data?.lockUntil, // OTP lock info
      };
      
      throw standardError;
    }

    // console.log(`[Auth API] ✅ ${response.status} ${method.toUpperCase()} ${endpoint}`); // Production'da kapat
    return data;
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw {
        code: 'TIMEOUT',
        message: 'İstek zaman aşımına uğradı',
        data: null,
      };
    }
    if (error.code && error.message) {
      // Already standardized error
      throw error;
    }
    
    if (typeof __dev__ !== 'undefined' ? __dev__ : (typeof __DEV__ !== 'undefined' && __DEV__)) {
      // eslint-disable-next-line no-console
      console.error('[Auth API] Network error:', error);
    }
    throw {
      code: 'NETWORK_ERROR',
      message: 'Bağlantı hatası oluştu',
      data: null,
    };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

/**
 * Default error codes HTTP status'a göre
 */
function getDefaultErrorCode(status) {  
  switch (status) {
    case 400: return 'BAD_REQUEST';
    case 401: return 'UNAUTHORIZED';
    case 403: return 'FORBIDDEN';
    case 404: return 'NOT_FOUND';
    case 429: return 'RATE_LIMITED';
    case 500: return 'SERVER_ERROR';
    case 503: return 'SERVICE_UNAVAILABLE';
    default: return 'UNKNOWN_ERROR';
  }
}

/**
 * Default error messages
 */
function getDefaultErrorMessage(status) {
  switch (status) {
    case 400: return 'Geçersiz istek';
    case 401: return 'Yetki hatası';
    case 403: return 'Erişim reddedildi';
    case 404: return 'Servis bulunamadı';
    case 429: return 'Çok fazla istek. Lütfen bekleyin.';
    case 500: return 'Sunucu hatası';
    case 503: return 'Servis şu anda kullanılamıyor';
    default: return 'Bağlantı hatası oluştu';
  }
}

/**
 * OTP isteme - Production-ready
 * @param {string} phoneNumber - E.164 format telefon numarası (+905551234567)
 * @param {string} purpose - OTP amacı (login, register, delete_account)
 * @returns {Promise<{ok: boolean, message?: string, data?: any, code?: string}>}
 */
export async function requestOtp(phoneNumber, purpose = 'login') {
  try {
    if (typeof __dev__ !== 'undefined' ? __dev__ : (typeof __DEV__ !== 'undefined' && __DEV__)) {
      // eslint-disable-next-line no-console
      console.log(`[Auth API] OTP isteniyor: ${maskPhone(phoneNumber)} (${purpose})`);
    }
    
    // Phone number format validation (client-side)
    if (!phoneNumber.startsWith('+')) {
      return {
        ok: false,
        code: 'INVALID_PHONE_FORMAT',
        message: 'Telefon numarası + ile başlamalı',
      };
    }
    
    const response = await apiRequest('/auth/request-otp', {
      method: 'POST',
      body: {
        phoneNumber,
        purpose,
      },
    });
    
    // Server'dan gelen standart format
    return {
      ok: response.ok,
      message: response.message,
      data: response.data,
    };
  } catch (error) {
    if (typeof __dev__ !== 'undefined' ? __dev__ : (typeof __DEV__ !== 'undefined' && __DEV__)) {
      // eslint-disable-next-line no-console
      console.error('[Auth API] OTP istek hatası:', error);
    }
    
    // Error object'i zaten standardize edilmiş
    return {
      ok: false,
      code: error.code,
      message: error.message,
      data: error.data,
      resetAt: error.resetAt, // Rate limit reset time
    };
  }
}

/**
 * OTP doğrulama (token almadan) - Production-ready
 * @param {string} phoneNumber - Telefon numarası
 * @param {string} code - 6 haneli OTP kodu
 * @param {string} purpose - OTP amacı
 * @returns {Promise<{ok: boolean, message?: string, verified: boolean, data?: any}>}
 */
export async function verifyOtp(phoneNumber, code, purpose = 'login') {
  try {
    if (typeof __dev__ !== 'undefined' ? __dev__ : (typeof __DEV__ !== 'undefined' && __DEV__)) {
      // eslint-disable-next-line no-console
      console.log(`[Auth API] OTP doğrulanıyor: ${maskPhone(phoneNumber)} (${purpose})`);
    }
    
    // Client-side validation
    if (!code || code.length !== 6 || !/^\d{6}$/.test(code)) {
      return {
        ok: false,
        code: 'INVALID_OTP_FORMAT',
        message: 'OTP kodu 6 haneli rakam olmalı',
        verified: false,
      };
    }
    
    const response = await apiRequest('/auth/verify-otp', {
      method: 'POST',
      body: {
        phoneNumber,
        code,
        purpose,
      },
    });
    
    return {
      ok: response.ok,
      message: response.message,
      verified: response.data?.verified || false,
      data: response.data,
    };
  } catch (error) {
    if (typeof __dev__ !== 'undefined' ? __dev__ : (typeof __DEV__ !== 'undefined' && __DEV__)) {
      // eslint-disable-next-line no-console
      console.error('[Auth API] OTP doğrulama hatası:', error);
    }
    
    return {
      ok: false,
      code: error.code,
      message: error.message,
      verified: false,
      data: error.data,
      lockUntil: error.lockUntil, // OTP lock info
    };
  }
}

/**
 * OTP ile login - Custom token al - Production-ready
 * @param {string} phoneNumber - Telefon numarası  
 * @param {string} code - OTP kodu
 * @param {string} purpose - OTP amacı (login, register)
 * @returns {Promise<{ok: boolean, message?: string, data?: {uid: string, token: string, user: object}}>}
 */
export async function loginWithOtp(phoneNumber, code, purpose = 'login') {
  try {
    if (typeof __dev__ !== 'undefined' ? __dev__ : (typeof __DEV__ !== 'undefined' && __DEV__)) {
      // eslint-disable-next-line no-console
      console.log(`[Auth API] OTP ile giriş: ${maskPhone(phoneNumber)} (${purpose})`);
    }
    
    // Client-side validation
    if (!code || code.length !== 6 || !/^\d{6}$/.test(code)) {
      return {
        ok: false,
        code: 'INVALID_OTP_FORMAT',
        message: 'OTP kodu 6 haneli rakam olmalı',
      };
    }
    
    const response = await apiRequest('/auth/login-with-otp', {
      method: 'POST',
      body: {
        phoneNumber,
        code,
        purpose,
      },
    });
    
    if (!response.ok) {
      return {
        ok: false,
        code: response.code,
        message: response.message,
        data: response.data,
      };
    }
    
    const { uid, token, user } = response.data;
    
    if (typeof __dev__ !== 'undefined' ? __dev__ : (typeof __DEV__ !== 'undefined' && __DEV__)) {
      // eslint-disable-next-line no-console
      console.log(`[Auth API] ✅ Başarılı login: ${uid}`);
    }
    
    return {
      ok: true,
      message: response.message,
      data: {
        uid,
        token,
        user,
      },
    };
  } catch (error) {
    if (typeof __dev__ !== 'undefined' ? __dev__ : (typeof __DEV__ !== 'undefined' && __DEV__)) {
      // eslint-disable-next-line no-console
      console.error('[Auth API] Login hatası:', error);
    }
    
    return {
      ok: false,
      code: error.code,
      message: error.message,
      data: error.data,
      lockUntil: error.lockUntil,
    };
  }
}

// Eski passwordLogin fonksiyonu kaldırıldı - yeni apiRequest tabanlı versiyon kullanılıyor

/**
 * OTP ile register - Custom token al
 * @param {string} phoneNumber - E.164 format telefon numarası
 * @param {string} code - OTP kodu (register için zaten doğrulanmış)
 * @param {object} profileData - Kullanıcı profil bilgileri
 * @returns {Promise<{ok: boolean, data?: {uid: string, token: string, user: object}, code?: string, message?: string}>}
 */
export async function registerWithOtp(phoneNumber, code, profileData) {
  try {
    if (typeof __dev__ !== 'undefined' ? __dev__ : (typeof __DEV__ !== 'undefined' && __DEV__)) {
      // eslint-disable-next-line no-console
      console.log(`[Auth API] Register with OTP: ${maskPhone(phoneNumber)}`);
    }
    
    const response = await apiRequest('/auth/register-with-otp', {
      method: 'POST',
      body: {
        phoneNumber,
        code,
        profileData,
      },
    });

    return {
      ok: response.ok,
      message: response.message,
      data: response.data,
      code: response.code,
    };
  } catch (error) {
    if (typeof __dev__ !== 'undefined' ? __dev__ : (typeof __DEV__ !== 'undefined' && __DEV__)) {
      // eslint-disable-next-line no-console
      console.error('[Auth API] Register hatası:', error);
    }
    
    return {
      ok: false,
      code: error.code,
      message: error.message,
      data: error.data,
    };
  }
}

// Phone check cache - HIZLANDIRMA! 🚀
const phoneCheckCache = new Map();
const PHONE_CACHE_TTL = 30000; // 30 saniye cache

/**
 * Telefon numarasının sistemde kayıtlı olup olmadığını kontrol eder
 * @param {string} phoneNumber - E.164 format telefon numarası
 * @returns {Promise<{ok: boolean, data?: {exists: boolean, userId?: string, phoneNumber: string}, code?: string, message?: string}>}
 */
export async function checkPhoneNumber(phoneNumber) {
  try {
    // Cache kontrol - ANINDA! ⚡
    const cacheKey = phoneNumber;
    const cached = phoneCheckCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < PHONE_CACHE_TTL) {
      if (typeof __dev__ !== 'undefined' ? __dev__ : (typeof __DEV__ !== 'undefined' && __DEV__)) {
        // eslint-disable-next-line no-console
        console.log(`[Auth API] 🚀 CACHE HIT! Telefon: ${maskPhone(phoneNumber)}`);
      }
      return cached.result;
    }
    
    if (typeof __dev__ !== 'undefined' ? __dev__ : (typeof __DEV__ !== 'undefined' && __DEV__)) {
      // eslint-disable-next-line no-console
      console.log(`[Auth API] Telefon kontrol ediliyor: ${maskPhone(phoneNumber)}`);
    }
    
    // Client-side validation
    if (!phoneNumber || typeof phoneNumber !== 'string') {
      return {
        ok: false,
        code: 'INVALID_PHONE_FORMAT',
        message: 'Geçersiz telefon numarası',
      };
    }

    const response = await apiRequest('/auth/check-phone', {
      method: 'POST',
      body: {
        phoneNumber,
      },
    });

    const result = {
      ok: response.ok,
      message: response.message,
      data: response.data,
      code: response.code,
    };
    
    // Cache'e kaydet - SONRASI HIZLI! 🚀
    phoneCheckCache.set(cacheKey, {
      result,
      timestamp: Date.now(),
    });

    return result;
  } catch (error) {
    if (typeof __dev__ !== 'undefined' ? __dev__ : (typeof __DEV__ !== 'undefined' && __DEV__)) {
      // eslint-disable-next-line no-console
      console.error('[Auth API] Telefon kontrol hatası:', error);
    }
    
    return {
      ok: false,
      code: error.code,
      message: error.message,
      data: error.data,
    };
  }
}

/**
 * API durumunu kontrol et
 * @returns {Promise<{available: boolean, message: string}>}
 */
export async function checkApiHealth() {
  try {
    const data = await apiRequest('/health', { method: 'GET', timeout: 5000 });
    return {
      available: data?.ok === true,
      message: 'API erişilebilir',
      data,
    };
  } catch (error) {
    if (typeof __dev__ !== 'undefined' ? __dev__ : (typeof __DEV__ !== 'undefined' && __DEV__)) {
      // eslint-disable-next-line no-console
      console.error('[Auth API] Health check hatası:', error);
    }
    
    return {
      available: false,
      message: 'API erişilemez',
      error: error.message,
    };
  }
}

/**
 * Password login
 * @param {string} phoneNumber - E.164 format phone number
 * @param {string} password - User password
 * @returns {Promise<{ok: boolean, data?: any, code?: string, message?: string}>}
 */
export async function passwordLogin(phoneNumber, password) {
  return apiRequest('/auth/password-login', {
    method: 'POST',
    body: { phoneNumber, password },
  });
}

export default {
  requestOtp,
  verifyOtp,
  loginWithOtp,
  passwordLogin,
  checkApiHealth,
  registerWithOtp,
  checkPhoneNumber,
};

// Yardımcı: Telefonu maskeler (PII log kaçınma)
function maskPhone(phone) {
  if (!phone || typeof phone !== 'string') return '';
  const p = phone.trim();
  if (p.length <= 4) return '****';
  const head = p.slice(0, 3);
  const tail = p.slice(-2);
  return `${head}*****${tail}`;
}
