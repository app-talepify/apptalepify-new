import { OtpProvider } from './otpProvider.js';
import { simpleHash } from '../utils/hash.js';

// Environment variables'ları doğrudan tanımlayalım (geçici çözüm)
const ENV_CONFIG = {
  OTP_PROVIDER: 'netgsm',
  NETGSM_USER: '3626060146',
  NETGSM_PASS: 'Telli6155-',
  NETGSM_HEADER: 'A.TELLIOGLU',
  APP_SIGNING_SECRET: 'yipRrCVCPBVdKpoTrWVDXfpuyROtmVjD',
  OTP_TTL_SECONDS: '180',
  OTP_RESEND_COOLDOWN_SECONDS: '60',
  OTP_MAX_ATTEMPTS: '5',
  OTP_RATE_PER_MINUTE: '1',
  OTP_RATE_PER_HOUR: '3',
  OTP_RATE_PER_DAY: '5',
  OTP_DRY_RUN: 'false'
};

/**
 * Netgsm OTP Provider
 * Netgsm SMS API kullanarak OTP gönderimi ve doğrulaması yapar
 */
export class NetgsmOtpProvider extends OtpProvider {
  constructor(config = {}) {
    super();
    
    this.userCode = config.userCode || ENV_CONFIG.NETGSM_USER;
    this.password = config.password || ENV_CONFIG.NETGSM_PASS;
    this.msgHeader = config.msgHeader || ENV_CONFIG.NETGSM_HEADER;
    this.signingSecret = config.signingSecret || ENV_CONFIG.APP_SIGNING_SECRET;
    this.dryRun = config.dryRun !== undefined ? config.dryRun : (ENV_CONFIG.OTP_DRY_RUN === 'true');
    
    // Rate limiting ayarları (çok daha sıkı limitler)
    this.rateLimits = {
      perMinute: parseInt(config.ratePerMinute || ENV_CONFIG.OTP_RATE_PER_MINUTE || '1'),
      perHour: parseInt(config.ratePerHour || ENV_CONFIG.OTP_RATE_PER_HOUR || '2'),
      perDay: parseInt(config.ratePerDay || ENV_CONFIG.OTP_RATE_PER_DAY || '3')
    };
    
    // OTP ayarları (daha sıkı kontroller)
    this.otpConfig = {
      ttlSeconds: parseInt(config.ttlSeconds || ENV_CONFIG.OTP_TTL_SECONDS || '180'),
      resendCooldownSeconds: parseInt(config.resendCooldownSeconds || ENV_CONFIG.OTP_RESEND_COOLDOWN_SECONDS || '120'), // 2 dakika
      maxAttempts: parseInt(config.maxAttempts || ENV_CONFIG.OTP_MAX_ATTEMPTS || '5'), // 5 deneme
      codeLength: 6
    };
    
    // In-memory storage (production'da Redis kullanılmalı)
    this.otpStorage = new Map();
    this.rateLimitStorage = new Map();
    
    // Netgsm API endpoint
    this.apiEndpoint = 'https://api.netgsm.com.tr/sms/send/get/';
    
    // Konfigürasyon validasyonu
    this.validateConfig();
  }

  validateConfig() {
    if (!this.signingSecret) {
      throw new Error('APP_SIGNING_SECRET konfigürasyonu gerekli');
    }
    
    if (!this.dryRun) {
      if (!this.userCode || !this.password || !this.msgHeader) {
        throw new Error('Netgsm konfigürasyonu eksik: NETGSM_USER, NETGSM_PASS, NETGSM_HEADER gerekli');
      }
    }
  }

  /**
   * Telefon numarasını Netgsm formatına çevirir
   * +905xxxxxxxxx -> 905xxxxxxxxx
   */
  formatPhoneForNetgsm(phoneNumber) {
    let cleaned = phoneNumber.replace(/\D/g, '');
    
    if (cleaned.startsWith('0')) {
      cleaned = '90' + cleaned.substring(1);
    } else if (cleaned.startsWith('90')) {
      // Zaten doğru formatta
    } else if (cleaned.startsWith('5')) {
      cleaned = '90' + cleaned;
    }
    
    return cleaned;
  }

  /**
   * Telefon numarasını E.164 formatına çevirir
   */
  normalizePhoneNumber(phoneNumber) {
    let cleaned = phoneNumber.replace(/\D/g, '');
    
    if (cleaned.startsWith('0')) {
      return '+90' + cleaned.substring(1);
    } else if (cleaned.startsWith('90')) {
      return '+' + cleaned;
    } else if (cleaned.startsWith('5')) {
      return '+90' + cleaned;
    }
    
    return '+90' + cleaned;
  }

  /**
   * OTP kodu oluşturur
   */
  generateOtpCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * OTP hash'i oluşturur
   */
  createOtpHash(phoneNumber, code, purpose) {
    const salt = Math.random().toString(36).substring(2, 15);
    const data = `${phoneNumber}:${code}:${purpose}:${salt}`;
    const hash = simpleHash(data, this.signingSecret);
    return { hash, salt };
  }

  /**
   * OTP hash'ini doğrular
   */
  verifyOtpHash(phoneNumber, code, purpose, storedHash, salt) {
    const data = `${phoneNumber}:${code}:${purpose}:${salt}`;
    const hash = simpleHash(data, this.signingSecret);
    return hash === storedHash;
  }

  /**
   * Rate limiting kontrolü
   */
  checkRateLimit(phoneNumber) {
    const now = Date.now();
    const key = this.normalizePhoneNumber(phoneNumber);
    
    if (!this.rateLimitStorage.has(key)) {
      this.rateLimitStorage.set(key, {
        minute: { count: 0, resetTime: now + 60 * 1000 },
        hour: { count: 0, resetTime: now + 60 * 60 * 1000 },
        day: { count: 0, resetTime: now + 24 * 60 * 60 * 1000 }
      });
    }
    
    const limits = this.rateLimitStorage.get(key);
    
    // Reset expired counters
    if (now > limits.minute.resetTime) {
      limits.minute = { count: 0, resetTime: now + 60 * 1000 };
    }
    if (now > limits.hour.resetTime) {
      limits.hour = { count: 0, resetTime: now + 60 * 60 * 1000 };
    }
    if (now > limits.day.resetTime) {
      limits.day = { count: 0, resetTime: now + 24 * 60 * 60 * 1000 };
    }
    
    // Check limits
    if (limits.minute.count >= this.rateLimits.perMinute) {
      return { allowed: false, reason: 'Dakika başına limit aşıldı', resetTime: limits.minute.resetTime };
    }
    if (limits.hour.count >= this.rateLimits.perHour) {
      return { allowed: false, reason: 'Saat başına limit aşıldı', resetTime: limits.hour.resetTime };
    }
    if (limits.day.count >= this.rateLimits.perDay) {
      return { allowed: false, reason: 'Gün başına limit aşıldı', resetTime: limits.day.resetTime };
    }
    
    return { allowed: true };
  }

  /**
   * Rate limit sayacını artırır
   */
  incrementRateLimit(phoneNumber) {
    const key = this.normalizePhoneNumber(phoneNumber);
    const limits = this.rateLimitStorage.get(key);
    if (limits) {
      limits.minute.count++;
      limits.hour.count++;
      limits.day.count++;
    }
  }

  /**
   * Netgsm API'ye SMS gönderir
   */
  async sendSmsViaNetgsm(phoneNumber, message) {
    const netgsmPhone = this.formatPhoneForNetgsm(phoneNumber);
    
    const params = new URLSearchParams({
      usercode: this.userCode,
      password: this.password,
      gsmno: netgsmPhone,
      message: message,
      msgheader: this.msgHeader
    });
    
    const url = `${this.apiEndpoint}?${params.toString()}`;
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        timeout: 10000
      });
      
      const responseText = await response.text();
      
      // Netgsm response kodları:
      // 00 ile başlıyorsa başarılı (00 123456789 formatında)
      // 20, 30, 40 ile başlıyorsa hata
      
      if (responseText.startsWith('00')) {
        return { success: true, response: responseText };
      } else {
        return { success: false, error: responseText, message: this.getNetgsmErrorMessage(responseText) };
      }
    } catch (error) {
      return { success: false, error: error.message, message: 'SMS gönderim hatası' };
    }
  }

  /**
   * Netgsm hata kodlarını açıklamalara çevirir
   */
  getNetgsmErrorMessage(errorCode) {
    const errorMessages = {
      '20': 'Mesaj metninde hata var',
      '30': 'Geçersiz kullanıcı adı, şifre veya kullanıcı aktif değil',
      '40': 'Mesaj başlığı (header) onaylanmamış veya yanlış',
      '50': 'Aşılan kontörü',
      '60': 'Hatalı SMS başlığı',
      '70': 'Hatalı sorgulama',
      '80': 'Sistem hatası'
    };
    
    const code = errorCode.substring(0, 2);
    return errorMessages[code] || `Netgsm API Hatası: ${errorCode}`;
  }

  async sendOtp(phoneNumber, options = {}) {
    const { purpose = 'login' } = options;
    const normalizedPhone = this.normalizePhoneNumber(phoneNumber);
    
    console.log(`[NetgsmOTP] OTP gönderiliyor: ${normalizedPhone} (${typeof purpose === 'object' ? JSON.stringify(purpose) : purpose})`);
    
    // Rate limiting kontrolü
    const rateLimitCheck = this.checkRateLimit(normalizedPhone);
    if (!rateLimitCheck.allowed) {
      return {
        success: false,
        error: 'rate_limit_exceeded',
        message: `Çok fazla deneme. ${rateLimitCheck.reason}. Lütfen bekleyin.`,
        data: { resetTime: rateLimitCheck.resetTime }
      };
    }
    
    // Mevcut OTP kontrolü (resend cooldown)
    const existingOtp = this.otpStorage.get(`${normalizedPhone}:${purpose}`);
    if (existingOtp) {
      const timeSinceLastSend = Date.now() - existingOtp.createdAt;
      if (timeSinceLastSend < this.otpConfig.resendCooldownSeconds * 1000) {
        const remainingSeconds = Math.ceil((this.otpConfig.resendCooldownSeconds * 1000 - timeSinceLastSend) / 1000);
        return {
          success: false,
          error: 'resend_cooldown',
          message: `Yeniden gönderim için ${remainingSeconds} saniye bekleyin.`,
          data: { remainingSeconds }
        };
      }
    }
    
    // OTP kodu oluştur
    const code = this.generateOtpCode();
    const { hash, salt } = this.createOtpHash(normalizedPhone, code, purpose);
    
    // SMS mesajını hazırla (ASCII karakterler, Türkçe karakter yok)
    const purposeTexts = {
      login: 'Giris',
      register: 'Kayit',
      password_reset: 'Sifre sifirlama',
      device_change: 'Cihaz degisimi'
    };
    
    const message = `Talepify ${purposeTexts[purpose] || 'dogrulama'} kodu: ${code}. 3 dk icinde kullanin.`;
    
    // Dry run kontrolü
    if (this.dryRun) {
      console.log(`[NetgsmOTP] DRY RUN - SMS gönderilmedi. Mesaj: "${message}"`);
      console.log(`[NetgsmOTP] DRY RUN - Kod: ${code} (sadece test için)`);
    } else {
      // Gerçek SMS gönder
      const smsResult = await this.sendSmsViaNetgsm(normalizedPhone, message);
      if (!smsResult.success) {
        console.error(`[NetgsmOTP] SMS gönderim hatası:`, smsResult.error);
        return {
          success: false,
          error: 'sms_send_failed',
          message: smsResult.message || 'SMS gönderilemedi. Lütfen tekrar deneyin.',
          data: { netgsmError: smsResult.error }
        };
      }
      console.log(`[NetgsmOTP] SMS başarıyla gönderildi: ${smsResult.response}`);
    }
    
    // OTP'yi storage'a kaydet (hash olarak)
    const storageKey = `${normalizedPhone}:${purpose}`;
    const otpData = {
      hash,
      salt,
      purpose,
      createdAt: Date.now(),
      expiresAt: Date.now() + (this.otpConfig.ttlSeconds * 1000),
      attempts: 0,
      locked: false
    };
    
    this.otpStorage.set(storageKey, otpData);
    console.log(`[NetgsmOTP] OTP storage'a kaydedildi - Key: ${storageKey}`);
    
    // Rate limit sayacını artır
    this.incrementRateLimit(normalizedPhone);
    
    return {
      success: true,
      message: 'SMS başarıyla gönderildi',
      data: {
        provider: 'netgsm',
        purpose,
        ttlSeconds: this.otpConfig.ttlSeconds,
        ...(this.dryRun && { testCode: code }) // Sadece dry run'da test kodu döndür
      }
    };
  }

  async verifyOtp(phoneNumber, code, purpose = 'login') {
    const normalizedPhone = this.normalizePhoneNumber(phoneNumber);
    const key = `${normalizedPhone}:${purpose}`;
    
    console.log(`[NetgsmOTP] OTP doğrulanıyor: ${normalizedPhone}, amaç: ${purpose}`);
    
    const storedOtp = this.otpStorage.get(key);
    if (!storedOtp) {
      console.log(`[NetgsmOTP] OTP bulunamadı! Key: ${key}`);
      return {
        success: false,
        error: 'otp_not_found',
        message: 'OTP kodu bulunamadı. Lütfen yeni kod isteyin.'
      };
    }
    
    // Expiry kontrolü
    if (Date.now() > storedOtp.expiresAt) {
      this.otpStorage.delete(key);
      return {
        success: false,
        error: 'otp_expired',
        message: 'OTP kodunun süresi dolmuş. Lütfen yeni kod isteyin.'
      };
    }
    
    // Lock kontrolü
    if (storedOtp.locked) {
      // Lock süresi geçtiyse kilidi kaldır
      if (storedOtp.lockedUntil && Date.now() > storedOtp.lockedUntil) {
        storedOtp.locked = false;
        storedOtp.attempts = 0; // Attempt sayısını sıfırla
        console.log(`[NetgsmOTP] Lock süresi doldu, kilit kaldırıldı: ${normalizedPhone}`);
      } else {
        return {
          success: false,
          error: 'otp_locked',
          message: 'Çok fazla hatalı deneme. 5 dakika bekleyin.'
        };
      }
    }
    
    // Attempt sayısını artır
    storedOtp.attempts++;
    
    // Hash doğrulaması
    const isValid = this.verifyOtpHash(normalizedPhone, code, purpose, storedOtp.hash, storedOtp.salt);
    
    if (isValid) {
      // Başarılı doğrulama - OTP'yi temizle
      this.otpStorage.delete(key);
      console.log(`[NetgsmOTP] OTP başarıyla doğrulandı: ${normalizedPhone}`);
      
      return {
        success: true,
        message: 'OTP başarıyla doğrulandı',
        data: { provider: 'netgsm', purpose }
      };
    } else {
      // Hatalı kod
      if (storedOtp.attempts >= this.otpConfig.maxAttempts) {
        // Max attempt aşıldı - kilitle
        storedOtp.locked = true;
        storedOtp.lockedUntil = Date.now() + (5 * 60 * 1000); // 5 dakika
        
        console.log(`[NetgsmOTP] Max attempt aşıldı, kilitleniyor: ${normalizedPhone}`);
        
        return {
          success: false,
          error: 'max_attempts_exceeded',
          message: 'Çok fazla hatalı deneme. 5 dakika bekleyin.'
        };
      } else {
        const remainingAttempts = this.otpConfig.maxAttempts - storedOtp.attempts;
        console.log(`[NetgsmOTP] Hatalı OTP: ${normalizedPhone}, kalan deneme: ${remainingAttempts}`);
        
        return {
          success: false,
          error: 'invalid_otp',
          message: `Geçersiz kod. ${remainingAttempts} deneme hakkınız kaldı.`,
          data: { remainingAttempts }
        };
      }
    }
  }

  async cancelOtp(phoneNumber, purpose = 'login') {
    const normalizedPhone = this.normalizePhoneNumber(phoneNumber);
    const key = `${normalizedPhone}:${purpose}`;
    
    console.log(`[NetgsmOTP] OTP iptal ediliyor: ${normalizedPhone} (${purpose})`);
    
    if (this.otpStorage.has(key)) {
      this.otpStorage.delete(key);
      return {
        success: true,
        message: 'OTP iptal edildi'
      };
    } else {
      return {
        success: false,
        error: 'otp_not_found',
        message: 'İptal edilecek OTP bulunamadı'
      };
    }
  }

  async healthCheck() {
    try {
      // Konfigürasyon kontrolü
      this.validateConfig();
      
      // Test mesajı (dry run)
      if (!this.dryRun) {
        // Gerçek API health check yapmak için test endpoint'i çağırabilir
        // Şimdilik konfigürasyon kontrolü yeterli
      }
      
      return {
        success: true,
        message: 'Netgsm OTP Provider sağlıklı',
        data: {
          provider: 'netgsm',
          status: 'healthy',
          dryRun: this.dryRun,
          config: {
            hasUserCode: !!this.userCode,
            hasPassword: !!this.password,
            hasHeader: !!this.msgHeader,
            hasSigningSecret: !!this.signingSecret
          }
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: 'Netgsm OTP Provider sağlıksız'
      };
    }
  }

  /**
   * Cleanup expired OTPs and rate limits (production'da cron job ile çalıştırılmalı)
   */
  cleanup() {
    const now = Date.now();
    
    // Expired OTP'leri temizle
    for (const [key, otp] of this.otpStorage.entries()) {
      if (now > otp.expiresAt || (otp.lockedUntil && now > otp.lockedUntil)) {
        this.otpStorage.delete(key);
      }
    }
    
    // Expired rate limits'i temizle
    for (const [key, limits] of this.rateLimitStorage.entries()) {
      if (now > limits.day.resetTime) {
        this.rateLimitStorage.delete(key);
      }
    }
    
    console.log(`[NetgsmOTP] Cleanup tamamlandı. OTP: ${this.otpStorage.size}, Rate limits: ${this.rateLimitStorage.size}`);
  }
}
