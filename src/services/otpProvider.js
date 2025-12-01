/**
 * OTP Provider Abstraction Interface
 * 
 * Bu interface, farklı OTP sağlayıcıları (Netgsm, Firebase vb.) için
 * ortak bir arayüz sağlar. Tüm OTP işlemleri bu interface üzerinden yapılır.
 */

/**
 * @typedef {Object} OtpResult
 * @property {boolean} success - İşlem başarılı mı
 * @property {string} [message] - Başarı/hata mesajı
 * @property {string} [error] - Hata detayı
 * @property {Object} [data] - Ek veri
 */

/**
 * @typedef {Object} OtpSendOptions
 * @property {string} purpose - OTP amacı: 'login', 'register', 'password_reset', 'device_change'
 * @property {number} [ttlSeconds] - OTP geçerlilik süresi (saniye)
 * @property {number} [codeLength] - OTP kodu uzunluğu (varsayılan: 6)
 */

/**
 * OTP Provider Interface
 * Tüm OTP sağlayıcıları bu interface'i implement etmelidir
 */
export class OtpProvider {
  /**
   * OTP kodu gönderir
   * @param {string} phoneNumber - Telefon numarası (E.164 formatında)
   * @param {OtpSendOptions} options - Gönderim seçenekleri
   * @returns {Promise&lt;OtpResult&gt;}
   */
  async sendOtp(phoneNumber, options = {}) {
    throw new Error('sendOtp method must be implemented');
  }

  /**
   * OTP kodunu doğrular
   * @param {string} phoneNumber - Telefon numarası (E.164 formatında)
   * @param {string} code - Doğrulanacak OTP kodu
   * @param {string} [purpose] - OTP amacı
   * @returns {Promise&lt;OtpResult&gt;}
   */
  async verifyOtp(phoneNumber, code, purpose = 'login') {
    throw new Error('verifyOtp method must be implemented');
  }

  /**
   * Bekleyen OTP'yi iptal eder
   * @param {string} phoneNumber - Telefon numarası
   * @param {string} [purpose] - OTP amacı
   * @returns {Promise&lt;OtpResult&gt;}
   */
  async cancelOtp(phoneNumber, purpose = 'login') {
    throw new Error('cancelOtp method must be implemented');
  }

  /**
   * Provider'ın sağlık durumunu kontrol eder
   * @returns {Promise&lt;OtpResult&gt;}
   */
  async healthCheck() {
    throw new Error('healthCheck method must be implemented');
  }
}

/**
 * Mock OTP Provider - Test ve geliştirme için
 * Gerçek SMS göndermez, sadece hardcoded kodlar kabul eder
 */
export class MockOtpProvider extends OtpProvider {
  constructor(options = {}) {
    super();
    this.validCodes = options.validCodes || ['123456'];
    this.dryRun = options.dryRun || false;
  }

  async sendOtp(phoneNumber, options = {}) {
    const { purpose = 'login' } = options;
    
    console.log(`[MockOTP] SMS gönderiliyor: ${phoneNumber} (${purpose})`);
    
    if (this.dryRun) {
      console.log(`[MockOTP] DRY RUN - Gerçek SMS gönderilmedi`);
    }
    
    // Mock gecikme
    await new Promise(resolve => setTimeout(resolve, 500));
    
    return {
      success: true,
      message: 'SMS başarıyla gönderildi (Mock)',
      data: {
        provider: 'mock',
        purpose,
        validCodes: this.validCodes // Sadece test için
      }
    };
  }

  async verifyOtp(phoneNumber, code, purpose = 'login') {
    console.log(`[MockOTP] OTP doğrulanıyor: ${phoneNumber}, kod: ${code}, amaç: ${purpose}`);
    
    // Mock gecikme
    await new Promise(resolve => setTimeout(resolve, 300));
    
    if (this.validCodes.includes(code)) {
      return {
        success: true,
        message: 'OTP başarıyla doğrulandı',
        data: { provider: 'mock', purpose }
      };
    } else {
      return {
        success: false,
        error: 'invalid_otp',
        message: 'Girdiğiniz kod hatalı. Lütfen tekrar deneyin.'
      };
    }
  }

  async cancelOtp(phoneNumber, purpose = 'login') {
    console.log(`[MockOTP] OTP iptal ediliyor: ${phoneNumber} (${purpose})`);
    return {
      success: true,
      message: 'OTP iptal edildi'
    };
  }

  async healthCheck() {
    return {
      success: true,
      message: 'Mock OTP Provider sağlıklı',
      data: { provider: 'mock', status: 'healthy' }
    };
  }
}
