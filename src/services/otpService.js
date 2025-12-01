/**
 * OTP Service - Merkezi OTP yönetimi
 * 
 * Bu servis, tüm OTP işlemlerini merkezi olarak yönetir.
 * Provider abstraction kullanarak farklı OTP sağlayıcıları arasında geçiş yapar.
 */

import { MockOtpProvider } from './otpProvider.js';
import { NetgsmOtpProvider } from './netgsmOtpProvider.js';
import { OTP_PROVIDER as ENV_OTP_PROVIDER, OTP_DRY_RUN as ENV_OTP_DRY_RUN } from '@env';

// Environment config (env üzerinden okunur, fallback ile güvenli)
const ENV_CONFIG = {
  OTP_PROVIDER: (ENV_OTP_PROVIDER || 'netgsm'),
  OTP_DRY_RUN: (ENV_OTP_DRY_RUN || 'false'),
};

// Dev-only logger and PII masking
const devLog = (...args) => {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    // eslint-disable-next-line no-console
    console.log(...args);
  }
};
const maskPhone = (phone) => {
  if (!phone) return '';
  const p = String(phone).replace(/\D/g, '');
  if (p.length <= 4) return '****';
  return p.slice(0, 3) + '*****' + p.slice(-2);
};

class OtpService {
  constructor() {
    this.provider = null;
    this.initialized = false;
    this.config = {};
  }

  /**
   * OTP Service'i başlatır
   */
  async initialize(config = {}) {
    if (this.initialized) {
      devLog('[OtpService] Zaten başlatılmış, atlanıyor');
      return;
    }

    // Debug: Environment variables kontrolü
    devLog('[OtpService] Environment Variables:', {
      OTP_PROVIDER: ENV_CONFIG.OTP_PROVIDER,
      OTP_DRY_RUN: ENV_CONFIG.OTP_DRY_RUN,
    });
    
    this.config = {
      provider: (config.provider || ENV_CONFIG.OTP_PROVIDER || 'mock')?.toLowerCase?.().trim?.() || 'mock',
      dryRun: config.dryRun !== undefined ? config.dryRun : (ENV_CONFIG.OTP_DRY_RUN === 'true'),
      ...config,
    };
    
    devLog('[OtpService] Final Config:', { provider: this.config.provider, dryRun: this.config.dryRun });

    // Provider'ı oluştur
    await this.createProvider();

    // Health check
    const healthResult = await this.provider.healthCheck();
    if (!healthResult.success) {
      throw new Error(`OTP Provider sağlıksız: ${healthResult.error}`);
    }

    this.initialized = true;
    devLog(`[OtpService] Başlatıldı - Provider: ${this.config.provider}, DryRun: ${this.config.dryRun}`);
  }

  /**
   * Konfigürasyona göre provider oluşturur
   */
  async createProvider() {
    switch (this.config.provider) {
      case 'netgsm':
        this.provider = new NetgsmOtpProvider(this.config);
        break;
      
      case 'mock':
      default:
        if (this.config.provider !== 'mock') {
          devLog('[OtpService] Bilinmeyen provider, mock kullanılacak:', this.config.provider);
        }
        this.provider = new MockOtpProvider(this.config);
        break;
    }
  }

  /**
   * Provider'ı değiştirir (runtime'da)
   */
  async switchProvider(providerName, config = {}) {
    devLog(`[OtpService] Provider değiştiriliyor: ${this.config.provider} -> ${providerName}`);
    
    this.config.provider = (providerName || '').toLowerCase().trim() || 'mock';
    this.config = { ...this.config, ...config };
    
    await this.createProvider();
    
    const healthResult = await this.provider.healthCheck();
    if (!healthResult.success) {
      throw new Error(`Yeni provider sağlıksız: ${healthResult.error}`);
    }
    
    devLog(`[OtpService] Provider başarıyla değiştirildi: ${this.config.provider}`);
  }

  /**
   * Başlatılma kontrolü
   */
  ensureInitialized() {
    if (!this.initialized) {
      throw new Error('OtpService başlatılmamış. initialize() metodunu çağırın.');
    }
  }

  /**
   * OTP kodu gönderir
   */
  async sendOtp(phoneNumber, purpose = 'login', options = {}) {
    this.ensureInitialized();
    
    devLog(`[OtpService] OTP gönderiliyor: ${maskPhone(phoneNumber)} (${typeof purpose === 'object' ? JSON.stringify(purpose) : purpose})`);
    
    try {
      const result = await this.provider.sendOtp(phoneNumber, { 
        purpose, 
        ...options 
      });
      
      // Başarılı gönderim logla
      if (result.success) {
        devLog(`[OtpService] OTP gönderildi: ${maskPhone(phoneNumber)} (${typeof purpose === 'object' ? JSON.stringify(purpose) : purpose})`);
      } else {
        console.error(`[OtpService] OTP gönderim hatası: ${result.error} - ${result.message}`);
      }
      
      return result;
    } catch (error) {
      console.error(`[OtpService] OTP gönderim exception:`, error);
      return {
        success: false,
        error: 'service_error',
        message: 'OTP gönderim servisi hatası'
      };
    }
  }

  /**
   * OTP kodunu doğrular
   */
  async verifyOtp(phoneNumber, code, purpose = 'login') {
    this.ensureInitialized();
    
    devLog(`[OtpService] OTP doğrulanıyor: ${maskPhone(phoneNumber)} (${purpose})`);
    
    try {
      const result = await this.provider.verifyOtp(phoneNumber, code, purpose);
      
      // Doğrulama sonucunu logla
      if (result.success) {
        devLog(`[OtpService] OTP doğrulandı: ${maskPhone(phoneNumber)} (${purpose})`);
      } else {
        devLog(`[OtpService] OTP doğrulama hatası: ${result.error} - ${result.message}`);
      }
      
      return result;
    } catch (error) {
      console.error(`[OtpService] OTP doğrulama exception:`, error);
      return {
        success: false,
        error: 'service_error',
        message: 'OTP doğrulama servisi hatası'
      };
    }
  }

  /**
   * Bekleyen OTP'yi iptal eder
   */
  async cancelOtp(phoneNumber, purpose = 'login') {
    this.ensureInitialized();
    
    devLog(`[OtpService] OTP iptal ediliyor: ${maskPhone(phoneNumber)} (${purpose})`);
    
    try {
      const result = await this.provider.cancelOtp(phoneNumber, purpose);
      
      if (result.success) {
        devLog(`[OtpService] OTP iptal edildi: ${maskPhone(phoneNumber)} (${purpose})`);
      }
      
      return result;
    } catch (error) {
      console.error(`[OtpService] OTP iptal exception:`, error);
      return {
        success: false,
        error: 'service_error',
        message: 'OTP iptal servisi hatası'
      };
    }
  }

  /**
   * Service sağlık durumunu kontrol eder
   */
  async healthCheck() {
    if (!this.initialized) {
      return {
        success: false,
        error: 'not_initialized',
        message: 'OtpService başlatılmamış'
      };
    }

    try {
      const providerHealth = await this.provider.healthCheck();
      
      return {
        success: providerHealth.success,
        message: providerHealth.success ? 'OtpService sağlıklı' : 'OtpService sağlıksız',
        error: providerHealth.error,
        data: {
          service: 'OtpService',
          provider: this.config.provider,
          dryRun: this.config.dryRun,
          initialized: this.initialized,
          providerHealth: providerHealth.data
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: 'OtpService health check hatası'
      };
    }
  }

  /**
   * Mevcut konfigürasyonu döndürür
   */
  getConfig() {
    return { ...this.config };
  }

  /**
   * Cleanup işlemini çalıştırır (provider destekliyorsa)
   */
  async cleanup() {
    this.ensureInitialized();
    
    if (typeof this.provider.cleanup === 'function') {
      await this.provider.cleanup();
    }
  }
}

// Singleton instance
const otpService = new OtpService();

export default otpService;

// Named exports for convenience
export {
  otpService as OtpService
};
