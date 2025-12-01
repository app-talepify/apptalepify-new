// NetGSM SMS OTP Provider - Production-ready
const axios = require('axios');
const crypto = require('crypto');
const { db } = require('./admin');

// UID generation utility - authRoutes.js ile uyumlu
function generateUidFromPhone(phoneNumber) {
  // authRoutes.js'deki normalizePhoneNumber fonksiyonunu import etmek yerine
  // aynı logic'i burada da uygulayalım
  const normalized = normalizePhoneNumber(phoneNumber);
  const hash = crypto.createHash('sha256').update(normalized).digest('hex');
  return `user_${hash.substring(0, 20)}`;
}

// Storage strategy: Firestore için production, Memory için development
function getStorageStrategy() {
  const functions = require('firebase-functions');
  const config = functions.config?.() || {};
  
  return process.env.NODE_ENV === 'production' || 
         process.env.OTP_USE_FIRESTORE === 'true' ||
         config.otp?.use_firestore === 'true' ||
         true; // Default: Firestore (production-ready)
}

const USE_FIRESTORE_STORAGE = getStorageStrategy();

// In-memory storage (development/test için)
const memoryOtpStorage = new Map();
const memoryRateLimitStorage = new Map();

// Configuration validation
function validateNetgsmConfig() {
  const functions = require('firebase-functions');
  const config = functions.config?.() || {};
  
  const user = process.env.NETGSM_USER || config.netgsm?.user;
  const pass = process.env.NETGSM_PASS || config.netgsm?.pass;
  const header = process.env.NETGSM_HEADER || config.netgsm?.header;
  
  if (!user || !pass || !header) {
    throw new Error('NetGSM config eksik - env veya config gerekli');
  }
  
  return { user, pass, header };
}

// NetGSM configuration - dynamic config fallback
function getNetgsmConfig() {
  const functions = require('firebase-functions');
  const config = functions.config?.() || {};
  
  return {
    userCode: process.env.NETGSM_USER || config.netgsm?.user,
    password: process.env.NETGSM_PASS || config.netgsm?.pass,
    msgHeader: process.env.NETGSM_HEADER || config.netgsm?.header || 'A.TELLIOGLU',
    apiEndpoint: 'https://api.netgsm.com.tr/sms/send/get/',
  };
}

// Rate limiting settings - environment'dan okunabilir
const RATE_LIMITS = {
  perMinute: parseInt(process.env.OTP_RATE_PER_MINUTE) || 1,
  perHour: parseInt(process.env.OTP_RATE_PER_HOUR) || 3,
  perDay: parseInt(process.env.OTP_RATE_PER_DAY) || 5,
};

// OTP settings - environment'dan ve config'den okunabilir
function getOtpConfig() {
  const functions = require('firebase-functions');
  const config = functions.config?.() || {};
  
  return {
    ttlSeconds: parseInt(process.env.OTP_TTL_SECONDS) || parseInt(config.otp?.ttl_seconds) || 600, // 10 dakika default
    codeLength: 6,
    maxAttempts: parseInt(process.env.OTP_MAX_ATTEMPTS) || parseInt(config.otp?.max_attempts) || 5,
    lockDurationMinutes: parseInt(process.env.OTP_LOCK_DURATION_MINUTES) || parseInt(config.otp?.lock_duration_minutes) || 5,
  };
}

const OTP_CONFIG = getOtpConfig();

// Dry run mode - test için
const DRY_RUN = process.env.OTP_DRY_RUN === 'true';

console.log(`[NetGSM] Konfigürasyon: Storage=${USE_FIRESTORE_STORAGE ? 'Firestore' : 'Memory'}, TTL=${OTP_CONFIG.ttlSeconds}s, DryRun=${DRY_RUN}`);

/**
 * Telefon numarasını normalize et
 */
function normalizePhoneNumber(phoneNumber) {
  let cleaned = phoneNumber.replace(/\D/g, '');
  
  if (cleaned.startsWith('0')) {
    return '+90' + cleaned.substring(1);
  } else if (cleaned.startsWith('90')) {
    return '+' + cleaned;
  } else if (cleaned.startsWith('5')) {
    return '+90' + cleaned;
  }
  
  return phoneNumber;
}

/**
 * Firestore'dan OTP verisi al
 */
async function getOtpFromFirestore(key) {
  try {
    const doc = await db.collection('otpData').doc(key).get();
    if (doc.exists) {
      const data = doc.data();
      // TTL kontrolü
      if (data.expiresAt && data.expiresAt.toDate() < new Date()) {
        await doc.ref.delete();
        return null;
      }
      return data;
    }
    return null;
  } catch (error) {
    console.error('[NetGSM] Firestore OTP okuma hatası:', error);
    return null;
  }
}

/**
 * Firestore'a OTP verisi kaydet
 */
async function saveOtpToFirestore(key, data) {
  try {
    // Timestamp formatlarını güvenli şekilde handle et
    let expiresAt, createdAt;
    
    // expiresAt için güvenli dönüştürme
    if (data.expiresAt?.toDate) {
      // Firestore Timestamp objesi
      expiresAt = data.expiresAt.toDate();
    } else if (typeof data.expiresAt === 'number') {
      // JavaScript timestamp (milliseconds)
      expiresAt = new Date(data.expiresAt);
    } else {
      // Invalid format - current time + default TTL kullan
      console.warn('[NetGSM] Invalid expiresAt format, using default TTL:', data.expiresAt);
      expiresAt = new Date(Date.now() + (OTP_CONFIG.ttlSeconds * 1000));
    }
    
    // createdAt için güvenli dönüştürme
    if (data.createdAt?.toDate) {
      // Firestore Timestamp objesi
      createdAt = data.createdAt.toDate();
    } else if (typeof data.createdAt === 'number') {
      // JavaScript timestamp (milliseconds)
      createdAt = new Date(data.createdAt);
    } else {
      // Invalid format - current time kullan
      console.warn('[NetGSM] Invalid createdAt format, using current time:', data.createdAt);
      createdAt = new Date();
    }
    
    await db.collection('otpData').doc(key).set({
      ...data,
      expiresAt: expiresAt,
      createdAt: createdAt,
      updatedAt: new Date(),
    });
  } catch (error) {
    console.error('[NetGSM] Firestore OTP kaydetme hatası:', error);
    throw error;
  }
}

/**
 * Firestore'dan rate limit verisi al
 */
async function getRateLimitFromFirestore(key) {
  try {
    const doc = await db.collection('rateLimits').doc(key).get();
    if (doc.exists) {
      const data = doc.data();
      // Timestamp'leri Date'e çevir
      ['minute', 'hour', 'day'].forEach(period => {
        if (data[period]?.resetAt) {
          data[period].resetAt = data[period].resetAt.toDate().getTime();
        }
      });
      return data;
    }
    return null;
  } catch (error) {
    console.error('[NetGSM] Firestore rate limit okuma hatası:', error);
    return null;
  }
}

/**
 * Firestore'a rate limit verisi kaydet
 */
async function saveRateLimitToFirestore(key, data) {
  try {
    // Timestamp'leri Firestore Timestamp'e çevir
    const firestoreData = { ...data };
    ['minute', 'hour', 'day'].forEach(period => {
      if (firestoreData[period]?.resetAt) {
        firestoreData[period].resetAt = new Date(firestoreData[period].resetAt);
      }
    });
    
    await db.collection('rateLimits').doc(key).set({
      ...firestoreData,
      updatedAt: new Date(),
    });
  } catch (error) {
    console.error('[NetGSM] Firestore rate limit kaydetme hatası:', error);
    throw error;
  }
}

/**
 * Rate limiting kontrolü - Firestore veya Memory
 */
async function checkRateLimit(phoneNumber) {
  const now = Date.now();
  const key = normalizePhoneNumber(phoneNumber);
  
  let limits;
  
  if (USE_FIRESTORE_STORAGE) {
    limits = await getRateLimitFromFirestore(key);
  } else {
    limits = memoryRateLimitStorage.get(key);
  }
  
  if (!limits) {
    limits = {
      minute: { count: 0, resetAt: now + 60000 },
      hour: { count: 0, resetAt: now + 3600000 },
      day: { count: 0, resetAt: now + 86400000 },
    };
  }
  
  // Reset expired counters
  if (now > limits.minute.resetAt) {
    limits.minute = { count: 0, resetAt: now + 60000 };
  }
  if (now > limits.hour.resetAt) {
    limits.hour = { count: 0, resetAt: now + 3600000 };
  }
  if (now > limits.day.resetAt) {
    limits.day = { count: 0, resetAt: now + 86400000 };
  }
  
  // Check limits
  if (limits.minute.count >= RATE_LIMITS.perMinute) {
    return { 
      allowed: false, 
      code: 'RATE_LIMIT_MINUTE',
      message: `Dakika başına limit aşıldı. ${Math.ceil((limits.minute.resetAt - now) / 1000)} saniye bekleyin.`,
      resetAt: limits.minute.resetAt
    };
  }
  if (limits.hour.count >= RATE_LIMITS.perHour) {
    return { 
      allowed: false, 
      code: 'RATE_LIMIT_HOUR',
      message: `Saat başına limit aşıldı. ${Math.ceil((limits.hour.resetAt - now) / 60000)} dakika bekleyin.`,
      resetAt: limits.hour.resetAt
    };
  }
  if (limits.day.count >= RATE_LIMITS.perDay) {
    return { 
      allowed: false, 
      code: 'RATE_LIMIT_DAY',
      message: `Gün başına limit aşıldı. ${Math.ceil((limits.day.resetAt - now) / 3600000)} saat bekleyin.`,
      resetAt: limits.day.resetAt
    };
  }
  
  return { allowed: true, limits };
}

/**
 * Rate limit counter'ını artır
 */
async function incrementRateLimit(phoneNumber, existingLimits) {
  const key = normalizePhoneNumber(phoneNumber);
  
  if (existingLimits) {
    existingLimits.minute.count++;
    existingLimits.hour.count++;
    existingLimits.day.count++;
    
    if (USE_FIRESTORE_STORAGE) {
      await saveRateLimitToFirestore(key, existingLimits);
    } else {
      memoryRateLimitStorage.set(key, existingLimits);
    }
  }
}

/**
 * OTP kodu oluştur
 */
function generateOtpCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * OTP hash oluştur
 */
function createOtpHash(phoneNumber, code, purpose) {
  try {
    const secretKey = process.env.APP_SIGNING_SECRET || 'default-secret';
    const data = `${phoneNumber}:${code}:${purpose}`;
    console.log(`[NetGSM] Hash oluşturuluyor - Data: ${data}, SecretKey var: ${!!secretKey}`);
    
    if (!crypto || !crypto.createHmac) {
      throw new Error('Crypto module not available');
    }
    
    const hash = crypto.createHmac('sha256', secretKey).update(data).digest('hex');
    console.log(`[NetGSM] Hash oluşturuldu - Length: ${hash.length}`);
    return hash;
  } catch (error) {
    console.error(`[NetGSM] Hash oluşturma hatası:`, error);
    throw new Error(`Hash creation failed: ${error.message}`);
  }
}

/**
 * OTP hash doğrula
 */
function verifyOtpHash(phoneNumber, code, purpose, expectedHash) {
  try {
    console.log(`[NetGSM] Hash doğrulama - Expected hash var: ${!!expectedHash}, Length: ${expectedHash?.length || 'N/A'}`);
    
    if (!expectedHash) {
      console.error(`[NetGSM] Expected hash boş!`);
      return false;
    }
    
    const generatedHash = createOtpHash(phoneNumber, code, purpose);
    const isMatch = generatedHash === expectedHash;
    
    console.log(`[NetGSM] Hash karşılaştırma - Generated: ${generatedHash.substring(0, 10)}..., Expected: ${expectedHash.substring(0, 10)}..., Match: ${isMatch}`);
    
    return isMatch;
  } catch (error) {
    console.error(`[NetGSM] Hash doğrulama hatası:`, error);
    return false; // Hata durumunda false döndür
  }
}

/**
 * NetGSM API ile SMS gönder
 */
async function sendSmsViaNetgsm(phoneNumber, message) {
  try {
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    let netgsmPhone = cleanPhone;
    
    if (cleanPhone.startsWith('0')) {
      netgsmPhone = '90' + cleanPhone.substring(1);
    } else if (!cleanPhone.startsWith('90')) {
      netgsmPhone = '90' + cleanPhone;
    }
    
    const config = getNetgsmConfig();
    const url = `${config.apiEndpoint}?` + 
      `usercode=${config.userCode}&` +
      `password=${config.password}&` +
      `gsmno=${netgsmPhone}&` +
      `message=${encodeURIComponent(message)}&` +
      `msgheader=${config.msgHeader}`;
    
    const response = await axios.get(url, { timeout: 10000 });
    const responseText = response.data?.toString() || '';
    
    if (responseText.startsWith('00 ')) {
      return {
        success: true,
        response: responseText,
        messageId: responseText.split(' ')[1],
      };
    } else {
      return {
        success: false,
        error: responseText,
        message: 'NetGSM API hatası: ' + responseText,
      };
    }
  } catch (error) {
    console.error('NetGSM SMS gönderim hatası:', error);
    return {
      success: false,
      error: 'network_error',
      message: 'SMS gönderim servisi kullanılamıyor',
    };
  }
}

/**
 * OTP gönder - Production-ready
 */
async function sendOtp(phoneNumber, purpose = 'login') {
  try {
    // Config validation
    if (!DRY_RUN) {
      validateNetgsmConfig();
    }
    
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    console.log(`[NetGSM] OTP gönderiliyor: ${normalizedPhone} (${purpose})`);
    
    // Rate limiting kontrolü
    const rateCheck = await checkRateLimit(normalizedPhone);
    if (!rateCheck.allowed) {
      return {
        ok: false,
        code: rateCheck.code,
        message: rateCheck.message,
        resetAt: rateCheck.resetAt,
      };
    }
    
    // OTP kodu oluştur
    const code = generateOtpCode();
    const hash = createOtpHash(normalizedPhone, code, purpose);
    
    // SMS mesajı oluştur
    const message = `Talepify doğrulama kodunuz: ${code}. Bu kodu kimseyle paylaşmayın.`;
    
    // SMS gönder (dry run modunda gerçek gönderim yok)
    let smsResult;
    if (DRY_RUN) {
      console.log(`[NetGSM] DRY RUN - SMS: ${message}`);
      smsResult = { success: true, messageId: 'dry-run-' + Date.now() };
    } else {
      smsResult = await sendSmsViaNetgsm(normalizedPhone, message);
    }
    
    if (!smsResult.success) {
      return {
        ok: false,
        code: 'SMS_SEND_FAILED',
        message: smsResult.message || 'SMS gönderilemedi',
      };
    }
    
    // OTP'yi storage'a kaydet - User context eklenerek collision önlenir
    const uid = generateUidFromPhone(normalizedPhone); // Deterministik UID
    const storageKey = `${normalizedPhone}:${purpose}:${uid}`; // User context eklendi
    const currentTime = Date.now();
    const expiresAt = currentTime + (OTP_CONFIG.ttlSeconds * 1000);
    
    console.log(`[NetGSM] OTP storage key: ${storageKey}`); // Debug için
    
    const otpData = {
      hash,
      purpose,
      phoneNumber: normalizedPhone,
      createdAt: currentTime,
      expiresAt: expiresAt,
      attempts: 0,
      locked: false,
      messageId: smsResult.messageId,
    };
    
    // Debug: OTP timing bilgileri
    console.log(`[NetGSM] OTP oluşturuluyor - Phone: ${normalizedPhone}`);
    console.log(`[NetGSM] Current time: ${currentTime} (${new Date(currentTime).toISOString()})`);
    console.log(`[NetGSM] Expires at: ${expiresAt} (${new Date(expiresAt).toISOString()})`);
    console.log(`[NetGSM] TTL: ${OTP_CONFIG.ttlSeconds} saniye`);
    
    if (USE_FIRESTORE_STORAGE) {
      await saveOtpToFirestore(storageKey, otpData);
    } else {
      memoryOtpStorage.set(storageKey, otpData);
    }
    
    // Rate limit counter'ını artır
    await incrementRateLimit(normalizedPhone, rateCheck.limits);
    
    console.log(`[NetGSM] OTP başarıyla gönderildi: ${normalizedPhone} (MessageID: ${smsResult.messageId})`);
    
    return {
      ok: true,
      message: 'SMS başarıyla gönderildi',
      data: {
        ttlSeconds: OTP_CONFIG.ttlSeconds,
        messageId: smsResult.messageId,
        expiresAt: otpData.expiresAt,
      },
    };
  } catch (error) {
    console.error('[NetGSM] OTP gönderim hatası:', error);
    return {
      ok: false,
      code: 'INTERNAL_ERROR',
      message: 'OTP gönderim servisi hatası',
    };
  }
}

/**
 * OTP doğrula - Production-ready
 */
async function verifyOtp(phoneNumber, code, purpose = 'login') {
  try {
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    const uid = generateUidFromPhone(normalizedPhone); // Deterministik UID
    const key = `${normalizedPhone}:${purpose}:${uid}`; // User context eklendi
    
    console.log(`[NetGSM] OTP doğrulanıyor: ${normalizedPhone} (${purpose}) - Key: ${key}`);
    
    // OTP verisini al - Backward compatibility için hem yeni hem eski format dene
    let storedOtp;
    const newKey = key; // User context'li yeni format
    const oldKey = `${normalizedPhone}:${purpose}`; // Eski format (backward compatibility)
    
    if (USE_FIRESTORE_STORAGE) {
      // Önce yeni format dene
      storedOtp = await getOtpFromFirestore(newKey);
      if (!storedOtp) {
        console.log(`[NetGSM] Yeni key'de OTP bulunamadı, eski format deneniyor: ${oldKey}`);
        // Eski format dene (backward compatibility)
        storedOtp = await getOtpFromFirestore(oldKey);
        if (storedOtp) {
          console.log(`[NetGSM] OTP eski format'ta bulundu: ${oldKey}`);
        }
      } else {
        console.log(`[NetGSM] OTP yeni format'ta bulundu: ${newKey}`);
      }
    } else {
      // Memory storage için de aynı logic
      storedOtp = memoryOtpStorage.get(newKey);
      if (!storedOtp) {
        storedOtp = memoryOtpStorage.get(oldKey);
      }
    }
    
    if (!storedOtp) {
      return {
        ok: false,
        code: 'OTP_NOT_FOUND',
        message: 'OTP kodu bulunamadı. Lütfen yeni kod isteyin.',
      };
    }
    
    // Expiry kontrolü - Firestore timestamp'i handle et
    let expiresAtTime;
    if (storedOtp.expiresAt?.toDate) {
      // Firestore Timestamp objesi
      expiresAtTime = storedOtp.expiresAt.toDate().getTime();
    } else if (typeof storedOtp.expiresAt === 'number') {
      // JavaScript timestamp (milliseconds)
      expiresAtTime = storedOtp.expiresAt;
    } else {
      console.error(`[NetGSM] Invalid expiresAt format:`, storedOtp.expiresAt);
      return {
        ok: false,
        code: 'OTP_EXPIRED',
        message: 'OTP kodunun süresi dolmuş. Lütfen yeni kod isteyin.',
      };
    }
    
    const currentTime = Date.now();
    
    console.log(`[NetGSM] OTP Expiry Check - Phone: ${normalizedPhone}`);
    console.log(`[NetGSM] Current time: ${currentTime} (${new Date(currentTime).toISOString()})`);
    console.log(`[NetGSM] Expires at: ${expiresAtTime} (${new Date(expiresAtTime).toISOString()})`);
    console.log(`[NetGSM] TTL remaining: ${Math.round((expiresAtTime - currentTime) / 1000)} seconds`);
    
    if (currentTime > expiresAtTime) {
      // Expired OTP'yi temizle
      if (USE_FIRESTORE_STORAGE) {
        await db.collection('otpData').doc(key).delete();
      } else {
        memoryOtpStorage.delete(key);
      }
      
      return {
        ok: false,
        code: 'OTP_EXPIRED',
        message: 'OTP kodunun süresi dolmuş. Lütfen yeni kod isteyin.',
      };
    }
    
    // Lock kontrolü
    if (storedOtp.locked) {
      const lockDuration = OTP_CONFIG.lockDurationMinutes * 60 * 1000;
      if (storedOtp.lockedUntil && Date.now() > storedOtp.lockedUntil) {
        // Lock süresi dolmuş - unlock
        storedOtp.locked = false;
        storedOtp.attempts = 0;
        delete storedOtp.lockedUntil;
        console.log(`[NetGSM] OTP kilit süresi doldu, unlock edildi: ${normalizedPhone}`);
      } else {
        const remainingLockTime = Math.ceil((storedOtp.lockedUntil - Date.now()) / 1000);
        return {
          ok: false,
          code: 'OTP_LOCKED',
          message: `Çok fazla hatalı deneme. ${remainingLockTime} saniye bekleyin.`,
          lockUntil: storedOtp.lockedUntil,
        };
      }
    }
    
    // Attempt sayısını artır
    storedOtp.attempts++;
    
    // Hash doğrulaması
    let isValid = false;
    try {
      console.log(`[NetGSM] Hash doğrulama başlıyor - Phone: ${normalizedPhone}, Code: ${code}`);
      isValid = verifyOtpHash(normalizedPhone, code, purpose, storedOtp.hash);
      console.log(`[NetGSM] Hash doğrulama tamamlandı - Sonuç: ${isValid}`);
    } catch (hashError) {
      console.error(`[NetGSM] Hash doğrulama exception:`, hashError);
      // Hash hatası durumunda false döndür (geçersiz kod olarak işle)
      isValid = false;
    }
    
    if (isValid) {
      // Başarılı doğrulama - OTP'yi temizle
      if (USE_FIRESTORE_STORAGE) {
        await db.collection('otpData').doc(key).delete();
      } else {
        memoryOtpStorage.delete(key);
      }
      
      console.log(`[NetGSM] OTP başarıyla doğrulandı: ${normalizedPhone}`);
      
      return {
        ok: true,
        message: 'OTP başarıyla doğrulandı',
        data: {
          phoneNumber: normalizedPhone,
          purpose: purpose,
          verifiedAt: Date.now(),
        },
      };
    } else {
      // Hatalı kod - attempt count güncellenecek
      if (storedOtp.attempts >= OTP_CONFIG.maxAttempts) {
        // Max attempt aşıldı - kilitle
        storedOtp.locked = true;
        storedOtp.lockedUntil = Date.now() + (OTP_CONFIG.lockDurationMinutes * 60 * 1000);
        
        // Güncellenmiş veriyi kaydet
        if (USE_FIRESTORE_STORAGE) {
          await saveOtpToFirestore(key, storedOtp);
        } else {
          memoryOtpStorage.set(key, storedOtp);
        }
        
        return {
          ok: false,
          code: 'MAX_ATTEMPTS_EXCEEDED',
          message: `Çok fazla hatalı deneme. ${OTP_CONFIG.lockDurationMinutes} dakika bekleyin.`,
          lockUntil: storedOtp.lockedUntil,
        };
      } else {
        const remainingAttempts = OTP_CONFIG.maxAttempts - storedOtp.attempts;
        
        // Güncellenmiş attempt count'u kaydet
        if (USE_FIRESTORE_STORAGE) {
          await saveOtpToFirestore(key, storedOtp);
        } else {
          memoryOtpStorage.set(key, storedOtp);
        }
        
        return {
          ok: false,
          code: 'INVALID_OTP',
          message: `Geçersiz kod. ${remainingAttempts} deneme hakkınız kaldı.`,
          data: { 
            remainingAttempts,
            attemptsUsed: storedOtp.attempts,
            maxAttempts: OTP_CONFIG.maxAttempts,
          },
        };
      }
    }
  } catch (error) {
    console.error('[NetGSM] OTP doğrulama hatası:', error);
    return {
      ok: false,
      code: 'INTERNAL_ERROR',
      message: 'OTP doğrulama servisi hatası',
    };
  }
}

module.exports = {
  sendOtp,
  verifyOtp,
  normalizePhoneNumber,
};

/**
 * Genel SMS gönderimi (permission vb. uygulama içi SMS'ler için)
 * DRY_RUN modunda gerçek gönderim yapmaz, başarılı döner
 */
async function sendPlainSms(phoneNumber, message) {
  try {
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    if (!DRY_RUN) {
      validateNetgsmConfig();
    }
    let smsResult;
    if (DRY_RUN) {
      console.log(`[NetGSM] DRY RUN - PLAIN SMS: ${message}`);
      smsResult = { success: true, messageId: 'dry-run-' + Date.now() };
    } else {
      smsResult = await sendSmsViaNetgsm(normalizedPhone, message);
    }
    if (!smsResult.success) {
      return { ok: false, code: 'SMS_SEND_FAILED', message: smsResult.message || 'SMS gönderilemedi' };
    }
    return { ok: true, message: 'SMS başarıyla gönderildi', data: { messageId: smsResult.messageId } };
  } catch (error) {
    console.error('[NetGSM] PLAIN SMS gönderim hatası:', error);
    return { ok: false, code: 'INTERNAL_ERROR', message: 'SMS gönderim servisi hatası' };
  }
}

module.exports.sendPlainSms = sendPlainSms;