/**
 * OTP Service Tests
 * 
 * Bu testler OTP Service'in temel işlevselliğini kontrol eder.
 */

import otpService from '../otpService';

// Mock environment variables
process.env.OTP_PROVIDER = 'mock';
process.env.OTP_DRY_RUN = 'true';
process.env.APP_SIGNING_SECRET = 'test-secret-key';

describe('OtpService', () => {
  beforeEach(async () => {
    // Her test öncesi service'i sıfırla
    otpService.initialized = false;
    otpService.provider = null;
  });

  afterEach(async () => {
    // Cleanup
    if (otpService.provider && typeof otpService.provider.cleanup === 'function') {
      await otpService.provider.cleanup();
    }
  });

  describe('Initialization', () => {
    test('should initialize with mock provider by default', async () => {
      await otpService.initialize();
      
      expect(otpService.initialized).toBe(true);
      expect(otpService.config.provider).toBe('mock');
      expect(otpService.config.dryRun).toBe(true);
    });

    test('should initialize with custom config', async () => {
      await otpService.initialize({
        provider: 'mock',
        dryRun: false,
        validCodes: ['111111']
      });
      
      expect(otpService.initialized).toBe(true);
      expect(otpService.config.provider).toBe('mock');
      expect(otpService.config.dryRun).toBe(false);
    });

    test('should pass health check after initialization', async () => {
      await otpService.initialize();
      
      const healthResult = await otpService.healthCheck();
      expect(healthResult.success).toBe(true);
      expect(healthResult.data.service).toBe('OtpService');
    });
  });

  describe('OTP Operations', () => {
    beforeEach(async () => {
      await otpService.initialize({
        provider: 'mock',
        dryRun: true,
        validCodes: ['123456']
      });
    });

    test('should send OTP successfully', async () => {
      const result = await otpService.sendOtp('+905551234567', 'login');
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('başarıyla gönderildi');
      expect(result.data.provider).toBe('mock');
      expect(result.data.purpose).toBe('login');
    });

    test('should verify valid OTP', async () => {
      // Önce OTP gönder
      await otpService.sendOtp('+905551234567', 'login');
      
      // Sonra doğrula
      const result = await otpService.verifyOtp('+905551234567', '123456', 'login');
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('başarıyla doğrulandı');
    });

    test('should reject invalid OTP', async () => {
      // Önce OTP gönder
      await otpService.sendOtp('+905551234567', 'login');
      
      // Yanlış kod ile doğrula
      const result = await otpService.verifyOtp('+905551234567', '999999', 'login');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('invalid_otp');
      expect(result.message).toContain('hatalı');
    });

    test('should handle different purposes', async () => {
      const purposes = ['login', 'register', 'password_reset', 'device_change'];
      
      for (const purpose of purposes) {
        const sendResult = await otpService.sendOtp('+905551234567', purpose);
        expect(sendResult.success).toBe(true);
        expect(sendResult.data.purpose).toBe(purpose);
        
        const verifyResult = await otpService.verifyOtp('+905551234567', '123456', purpose);
        expect(verifyResult.success).toBe(true);
      }
    });

    test('should cancel pending OTP', async () => {
      // OTP gönder
      await otpService.sendOtp('+905551234567', 'login');
      
      // İptal et
      const result = await otpService.cancelOtp('+905551234567', 'login');
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('iptal edildi');
    });
  });

  describe('Error Handling', () => {
    test('should handle service not initialized', async () => {
      // Service'i başlatmadan kullanmaya çalış
      otpService.initialized = false;
      
      expect(() => otpService.ensureInitialized()).toThrow('başlatılmamış');
    });

    test('should handle provider switch', async () => {
      await otpService.initialize({ provider: 'mock' });
      
      // Provider değiştir
      await otpService.switchProvider('mock', { validCodes: ['999999'] });
      
      expect(otpService.config.provider).toBe('mock');
      
      // Yeni konfigürasyonla test et
      await otpService.sendOtp('+905551234567', 'login');
      const result = await otpService.verifyOtp('+905551234567', '999999', 'login');
      expect(result.success).toBe(true);
    });
  });

  describe('Phone Number Formats', () => {
    beforeEach(async () => {
      await otpService.initialize({
        provider: 'mock',
        validCodes: ['123456']
      });
    });

    test('should handle different phone number formats', async () => {
      const phoneFormats = [
        '05551234567',
        '+905551234567',
        '905551234567',
        '5551234567'
      ];
      
      for (const phone of phoneFormats) {
        const sendResult = await otpService.sendOtp(phone, 'login');
        expect(sendResult.success).toBe(true);
        
        const verifyResult = await otpService.verifyOtp(phone, '123456', 'login');
        expect(verifyResult.success).toBe(true);
      }
    });
  });
});
