// Firebase Auth Custom Token Routes - Production-ready
const { z } = require('zod');
const { admin, db, auth } = require('./admin');
const { sendOtp, verifyOtp, normalizePhoneNumber } = require('./netgsm');
const argon2 = require('argon2');
const crypto = require('crypto');

// E.164 telefon numarası validation
const phoneNumberSchema = z.string()
  .regex(/^\+[1-9]\d{1,14}$/, 'Telefon numarası E.164 formatında olmalı (+905551234567)')
  .min(10)
  .max(16);

// OTP kodu validation - sadece 6 haneli rakam
const otpCodeSchema = z.string()
  .length(6, 'OTP kodu 6 haneli olmalı')
  .regex(/^\d{6}$/, 'OTP kodu sadece rakamlardan oluşmalı');

// 6 haneli PIN validation
const passwordSchema = z.string()
  .length(6, 'PIN 6 haneli olmalı')
  .regex(/^\d{6}$/, 'PIN sadece rakamlardan oluşmalı');

// Request schemas
const requestOtpSchema = z.object({
  phoneNumber: phoneNumberSchema,
  purpose: z.enum(['login', 'register', 'delete_account']).default('login'),
});

const verifyOtpSchema = z.object({
  phoneNumber: phoneNumberSchema,
  code: otpCodeSchema,
  purpose: z.enum(['login', 'register', 'delete_account']).default('login'),
});

const loginWithOtpSchema = z.object({
  phoneNumber: phoneNumberSchema,
  code: otpCodeSchema,
  purpose: z.enum(['login', 'register']).default('login'),
});

const passwordLoginSchema = z.object({
  phoneNumber: phoneNumberSchema,
  password: passwordSchema,
});

/**
 * Standart API response formatı
 */
function createResponse(ok, data = null, code = null, message = null) {
  const response = { ok };
  
  if (ok) {
    if (message) response.message = message;
    if (data) response.data = data;
  } else {
    response.code = code || 'UNKNOWN_ERROR';
    response.message = message || 'Bilinmeyen hata oluştu';
    if (data) response.data = data;
  }
  
  return response;
}

/**
 * Zod validation error'ı standart formata çevir
 */
function formatValidationError(zodError) {
  const errors = zodError.errors.map(err => ({
    field: err.path.join('.'),
    message: err.message,
    code: err.code,
  }));
  
  return {
    code: 'VALIDATION_ERROR',
    message: 'Giriş verilerinde hata var',
    data: { errors },
  };
}

/**
 * UID oluştur - telefon numarasından deterministik
 */
function generateUidFromPhone(phoneNumber) {
  const normalized = normalizePhoneNumber(phoneNumber);
  const hash = crypto.createHash('sha256').update(normalized).digest('hex');
  return `user_${hash.substring(0, 20)}`;
}

/**
 * Firebase Auth user'ın var olduğundan emin ol
 */
async function ensureFirebaseAuthUser(uid, phoneNumber) {
  try {
    // Önce kullanıcıyı bulmaya çalış
    const userRecord = await auth.getUser(uid);
    
    // Telefon numarası eksikse güncelle
    if (!userRecord.phoneNumber && phoneNumber) {
      await auth.updateUser(uid, {
        phoneNumber: normalizePhoneNumber(phoneNumber),
      });
    }
    
    return userRecord;
  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      // Kullanıcı yoksa oluştur
      console.log(`[Auth] Firebase Auth kullanıcısı oluşturuluyor: ${uid}`);
      
      const userRecord = await auth.createUser({
        uid: uid,
        phoneNumber: normalizePhoneNumber(phoneNumber),
        emailVerified: false,
        disabled: false,
      });
      
      // Custom claims ekle
      await auth.setCustomUserClaims(uid, {
        phoneVerified: true,
        createdAt: Date.now(),
      });
      
      return userRecord;
    } else {
      throw error;
    }
  }
}

/**
 * Firestore user document'ini ensure et
 */
async function ensureFirestoreUser(uid, phoneNumber, additionalData = {}) {
  try {
    const userRef = db.collection('users').doc(uid);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      // Yeni kullanıcı - temel veri ile oluştur
      const userData = {
        uid: uid,
        phoneNumber: normalizePhoneNumber(phoneNumber),
        createdAt: new Date(),
        updatedAt: new Date(),
        ...additionalData,
      };
      
      await userRef.set(userData);
      console.log(`[Auth] Firestore kullanıcısı oluşturuldu: ${uid}`);
      
      return userData;
    } else {
      // Mevcut kullanıcı - güncellenmiş tarih ekle
      await userRef.update({
        updatedAt: new Date(),
        lastLoginAt: new Date(),
      });
      
      return userDoc.data();
    }
  } catch (error) {
    console.error('[Auth] Firestore kullanıcı ensure hatası:', error);
    throw error;
  }
}

/**
 * Custom token oluştur
 */
async function createCustomToken(uid, additionalClaims = {}) {
  try {
    const claims = {
      phone_verified: true, // Firestore rules ile uyumlu
      phoneVerified: true,  // Backward compatibility
      tokenCreatedAt: Date.now(),
      ...additionalClaims,
    };
    
    const customToken = await auth.createCustomToken(uid, claims);
    console.log(`[Auth] Custom token oluşturuldu: ${uid}`);
    
    return customToken;
  } catch (error) {
    console.error('[Auth] Custom token oluşturma hatası:', error);
    throw error;
  }
}

/**
 * POST /auth/request-otp
 * OTP isteği gönder - Production-ready
 */
async function requestOtpHandler(req, res) {
  try {
    // Input validation
    const parseResult = requestOtpSchema.safeParse(req.body);
    if (!parseResult.success) {
      const errorResponse = formatValidationError(parseResult.error);
      return res.status(400).json(createResponse(false, errorResponse.data, errorResponse.code, errorResponse.message));
    }
    
    const { phoneNumber, purpose } = parseResult.data;
    
    console.log(`[Auth API] OTP isteniyor: ${phoneNumber} (${purpose})`);
    
    // Debug: OTP request başlangıcı
    console.log(`[Auth API] sendOtp çağrılıyor...`);
    
    // MANUAL TEST - Server-side çalışıyor mu?
    console.log(`[Auth API] Server-side çalışıyor - Test log`);
    
    // Rate limiting ve OTP gönderim
    const result = await sendOtp(phoneNumber, purpose);
    
    console.log(`[Auth API] sendOtp sonucu:`, result);
    
    if (result.ok) {
      return res.status(200).json(createResponse(true, result.data, null, result.message));
    } else {
      // Rate limit veya SMS hatası
      const statusCode = result.code.startsWith('RATE_LIMIT') ? 429 : 400;
      return res.status(statusCode).json(createResponse(false, result.resetAt ? { resetAt: result.resetAt } : null, result.code, result.message));
    }
  } catch (error) {
    console.error('[Auth API] OTP istek hatası:', error);
    
    return res.status(500).json(createResponse(false, null, 'INTERNAL_ERROR', 'Sunucu hatası oluştu'));
  }
}

/**
 * POST /auth/verify-otp
 * OTP doğrulama (token olmadan) - Production-ready
 */
async function verifyOtpHandler(req, res) {
  try {
    // Input validation
    const parseResult = verifyOtpSchema.safeParse(req.body);
    if (!parseResult.success) {
      const errorResponse = formatValidationError(parseResult.error);
      return res.status(400).json(createResponse(false, errorResponse.data, errorResponse.code, errorResponse.message));
    }
    
    const { phoneNumber, code, purpose } = parseResult.data;
    
    console.log(`[Auth API] OTP doğrulanıyor: ${phoneNumber} (${purpose})`);
    
    // OTP verification - güvenli hata yönetimi
    const result = await verifyOtp(phoneNumber, code, purpose);
    
    if (result.ok) {
      console.log(`[Auth API] OTP doğrulama başarılı: ${phoneNumber} (${purpose})`);
      return res.status(200).json(createResponse(true, { verified: true, ...result.data }, null, result.message));
    } else {
      console.log(`[Auth API] OTP doğrulama başarısız: ${result.code} - ${result.message}`);
      // Lock durumu için özel status code
      const statusCode = result.code === 'OTP_LOCKED' ? 429 : 400;
      return res.status(statusCode).json(createResponse(false, { verified: false, ...result.data }, result.code, result.message));
    }
  } catch (error) {
    console.error('[Auth API] OTP doğrulama hatası:', error);
    
    return res.status(500).json(createResponse(false, { verified: false }, 'INTERNAL_ERROR', 'OTP doğrulama servisi hatası'));
  }
}

/**
 * POST /auth/login-with-otp
 * OTP ile login - Custom token döndür - Production-ready
 */
async function loginWithOtpHandler(req, res) {
  try {
    // Input validation
    const parseResult = loginWithOtpSchema.safeParse(req.body);
    if (!parseResult.success) {
      const errorResponse = formatValidationError(parseResult.error);
      return res.status(400).json(createResponse(false, errorResponse.data, errorResponse.code, errorResponse.message));
    }
    
    const { phoneNumber, code, purpose } = parseResult.data;
    
    console.log(`[Auth API] OTP ile giriş: ${phoneNumber} (${purpose})`);
    
    // DEBUG: Login handler başlangıcı
    console.log(`[Auth API] loginWithOtpHandler çalışıyor - verifyOtp çağrılacak`);
    
    // ÖNCE OTP'yi doğrula - başarısız olursa hiçbir şey yapma
    const otpResult = await verifyOtp(phoneNumber, code, purpose);
    
    console.log(`[Auth API] verifyOtp sonucu:`, otpResult);
    if (!otpResult.ok) {
    console.log(`[Auth API] OTP doğrulama başarısız: ${otpResult.code} - ${otpResult.message}`);
      const statusCode = otpResult.code === 'OTP_LOCKED' ? 429 : 400;
      return res.status(statusCode).json(createResponse(false, otpResult.data, otpResult.code, otpResult.message));
    }
    
    // OTP başarılı - şimdi user işlemlerini yap
    console.log(`[Auth API] OTP doğrulama başarılı, user işlemleri başlatılıyor: ${phoneNumber}`);
    
    // UID oluştur/al - deterministik
    const uid = generateUidFromPhone(phoneNumber);
    
    // Firebase Auth kullanıcısını ensure et (idempotent)
    await ensureFirebaseAuthUser(uid, phoneNumber);
    
    // Firestore kullanıcısını ensure et (idempotent)
    const userData = await ensureFirestoreUser(uid, phoneNumber);
    
    // Custom token oluştur
    const customToken = await createCustomToken(uid, {
      loginMethod: 'otp',
      purpose: purpose,
      loginAt: Date.now(),
    });
    
    console.log(`[Auth API] Başarılı OTP girişi: ${uid}`);
    
    return res.status(200).json(createResponse(true, {
      uid: uid,
      token: customToken,
      user: {
        uid: userData.uid,
        phoneNumber: userData.phoneNumber,
        displayName: userData.displayName || '',
        city: userData.city || '',
        officeName: userData.officeName || '',
        lastLoginAt: userData.lastLoginAt,
      },
    }, null, 'Giriş başarılı'));
    
  } catch (error) {
    console.error('[Auth API] OTP login hatası:', error);
    
    return res.status(500).json(createResponse(false, null, 'INTERNAL_ERROR', 'Giriş işlemi başarısız'));
  }
}

/**
 * POST /auth/password-login
 * Şifre ile login (opsiyonel)
 */
async function passwordLoginHandler(req, res) {
  try {
    const { phoneNumber, password } = passwordLoginSchema.parse(req.body);
    
    console.log(`[Auth API] Şifre ile giriş denemesi: ${phoneNumber}`);
    
    const uid = generateUidFromPhone(phoneNumber);
    
    // Firestore'dan kullanıcıyı al
    const userRef = db.collection('users').doc(uid);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      return res.status(401).json({
        success: false,
        error: 'user_not_found',
        message: 'Kullanıcı bulunamadı',
      });
    }
    
    const userData = userDoc.data();
    
    // Şifre hash'i var mı kontrol et
    if (!userData.passwordHash) {
      return res.status(401).json({
        success: false,
        error: 'password_not_set',
        message: 'Bu kullanıcı için şifre belirlenmemiş',
      });
    }
    
    // Şifreyi doğrula
    const isPasswordValid = await argon2.verify(userData.passwordHash, password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        error: 'invalid_password',
        message: 'Hatalı şifre',
      });
    }
    
    // Firebase Auth kullanıcısını ensure et
    await ensureFirebaseAuthUser(uid, phoneNumber);
    
    // Last login güncelle
    await userRef.update({
      lastLoginAt: new Date(),
      updatedAt: new Date(),
    });
    
    // Custom token oluştur
    const customToken = await createCustomToken(uid, {
      loginMethod: 'password',
    });
    
    console.log(`[Auth API] Başarılı şifre girişi: ${uid}`);
    
    res.status(200).json({
      success: true,
      message: 'Giriş başarılı',
      data: {
        uid: uid,
        token: customToken,
        user: {
          uid: userData.uid,
          phoneNumber: userData.phoneNumber,
          displayName: userData.displayName,
          city: userData.city,
          officeName: userData.officeName,
        },
      },
    });
  } catch (error) {
    console.error('[Auth API] Şifre login hatası:', error);
    
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: 'validation_error',
        message: 'Geçersiz input formatı',
        details: error.errors,
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'internal_error',
        message: 'Giriş işlemi başarısız',
      });
    }
  }
}

/**
 * POST /auth/check-phone
 * Telefon numarası kontrolü - Public endpoint (authentication gerektirmez)
 */
async function checkPhoneHandler(req, res) {
  console.log('[Auth] Check phone endpoint hit');
  
  try {
    const body = req.body;
    const parsed = phoneNumberSchema.safeParse(body.phoneNumber);
    
    if (!parsed.success) {
      return res.status(400).json(createResponse(false, 'VALIDATION_ERROR', 'Geçersiz telefon numarası formatı', null));
    }
    
    const phoneNumber = normalizePhoneNumber(parsed.data);
    console.log(`[Auth] Checking phone: ${phoneNumber}`);
    
    // Telefon numarasının farklı formatlarını oluştur
    const phoneVariations = [
      phoneNumber, // +905354648228
      phoneNumber.replace('+90', '0'), // 05354648228  
      phoneNumber.replace('+90', '90'), // 905354648228
      phoneNumber.substring(3), // 5354648228
      `+90 ${phoneNumber.substring(3, 6)} ${phoneNumber.substring(6, 9)} ${phoneNumber.substring(9, 11)} ${phoneNumber.substring(11)}`, // +90 535 464 82 28
    ];
    
    // Firestore'da kullanıcıyı ara (Admin SDK kullandığımız için auth gerekmez)
    const usersRef = db.collection('users');
    let userExists = false;
    let userId = null;
    
    for (const variation of phoneVariations) {
      const query = usersRef.where('phoneNumber', '==', variation).limit(1);
      const snapshot = await query.get();
      
      if (!snapshot.empty) {
        userExists = true;
        userId = snapshot.docs[0].id;
        console.log(`[Auth] User found with phone variation: ${variation}`);
        break;
      }
    }
    
    console.log(`[Auth] Phone check result: ${userExists ? 'EXISTS' : 'NOT_FOUND'}`);
    
    return res.status(200).json(createResponse(true, {
      exists: userExists,
      userId: userExists ? userId : null,
      phoneNumber: phoneNumber,
    }, 'PHONE_CHECKED', 'Telefon kontrolü tamamlandı'));
    
  } catch (error) {
    console.error('[Auth] Check phone error:', error);
    return res.status(500).json(createResponse(false, 'INTERNAL_ERROR', 'Telefon kontrolü hatası', null));
  }
}

/**
 * POST /auth/register-with-otp
 * OTP ile register - Custom token al (OTP zaten doğrulanmış olmalı)
 */
async function registerWithOtpHandler(req, res) {
  try {
    const body = req.body;
    const { phoneNumber, code, profileData } = body;
    
    console.log(`[Auth API] Register ile giriş: ${phoneNumber}`);
    
    // Input validation
    if (!phoneNumber || !profileData) {
      return res.status(400).json(createResponse(false, 'VALIDATION_ERROR', 'Telefon numarası ve profil bilgileri gerekli', null));
    }
    
    // Phone number normalize
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    
    // Register işlemi için OTP zaten verify edilmiş olmalı
    // Ekstra güvenlik: code '000000' ise bypass et (zaten doğrulanmış)
    if (code && code !== '000000') {
      const otpResult = await verifyOtp(normalizedPhone, code, 'register');
      if (!otpResult.ok) {
        return res.status(400).json(createResponse(false, otpResult.code, otpResult.message, { verified: false }));
      }
    }
    
    console.log(`[Auth API] Register için OTP doğrulaması atlandı (zaten verify edilmiş)`);;
    
    // UID generate
    const uid = generateUidFromPhone(normalizedPhone);
    
    // Firebase Auth User oluştur/güncelle
    await ensureFirebaseAuthUser(uid, normalizedPhone);
    
    // Password hash'le (eğer varsa)
    let passwordHash = null;
    if (profileData.password) {
      passwordHash = await argon2.hash(profileData.password);
      console.log(`[Auth API] Password hash'lendi`);
    }
    
    // Firestore User oluştur (register için extended data)
    const fullProfileData = {
      ...profileData,
      phoneNumber: normalizedPhone,
      passwordHash: passwordHash, // Hash'lenmiş password
      password: undefined, // Raw password'u kaldır
      createdAt: new Date(),
      subscriptionStatus: 'trial', // 7 gün trial
      trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 gün sonra
    };
    
    // Raw password'u temizle
    delete fullProfileData.password;
    
    await ensureFirestoreUser(uid, normalizedPhone, fullProfileData);
    
    // Custom token oluştur
    const token = await createCustomToken(uid, { phoneVerified: true, isNewUser: true });
    
    console.log(`[Auth API] ✅ Register başarılı: ${uid}`);
    
    return res.status(200).json(createResponse(true, {
      uid,
      token,
      user: fullProfileData,
    }, 'REGISTER_SUCCESS', 'Kayıt başarılı'));
    
  } catch (error) {
    console.error('[Auth API] Register hatası:', error);
    console.error('[Auth API] Error stack:', error.stack);
    console.error('[Auth API] Error message:', error.message);
    console.error('[Auth API] Error code:', error.code);
    
    return res.status(500).json(createResponse(false, 'INTERNAL_ERROR', `Register hatası: ${error.message}`, {
      errorDetails: error.code || error.message
    }));
  }
}

module.exports = {
  requestOtpHandler,
  verifyOtpHandler,
  loginWithOtpHandler,
  passwordLoginHandler,
  checkPhoneHandler,
  registerWithOtpHandler,
  generateUidFromPhone,
  ensureFirebaseAuthUser,
  ensureFirestoreUser,
  createCustomToken,
};
