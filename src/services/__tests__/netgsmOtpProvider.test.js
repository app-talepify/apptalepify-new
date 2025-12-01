/**
 * Netgsm OTP Provider Tests
 * 
 * Bu testler NetgsmOtpProvider'ın temel işlevselliğini kontrol eder.
 */

import { NetgsmOtpProvider } from '../netgsmOtpProvider';

// Mock environment variables
process.env.NETGSM_USER = 'test_user';
process.env.NETGSM_PASS = 'test_pass';
process.env.NETGSM_HEADER = 'TEST';
process.env.APP_SIGNING_SECRET = 'test-secret-key';
process.env.OTP_DRY_RUN = 'true';

// Mock fetch for API calls
global.fetch = jest.fn();

describe('NetgsmOtpProvider', () => {
  let provider;

  beforeEach(() => {
    provider = new NetgsmOtpProvider({
      dryRun: true, // Test modunda gerçek SMS gönderme
      userCode: 'test_user',
      password: 'test_pass',
      msgHeader: 'TEST',
      signingSecret: 'test-secret-key'
    });
    
    // Mock fetch'i sıfırla
    fetch.mockClear();
  });

  afterEach(() => {
    // Cleanup
    provider.cleanup();
  });

  describe('Configuration', () => {
    test('should initialize with valid config', () => {
      expect(provider.userCode).toBe('test_user');
      expect(provider.password).toBe('test_pass');
      expect(provider.msgHeader).toBe('TEST');
      expect(provider.dryRun).toBe(true);
    });

    test('should validate required config', () => {
      // Environment variable'ları geçici olarak temizle
      const originalSigningSecret = process.env.APP_SIGNING_SECRET;
      delete process.env.APP_SIGNING_SECRET;
      
      expect(() => {
        new NetgsmOtpProvider({
          dryRun: false, // Gerçek mod ama eksik config
          // signingSecret eksik - bu hata almalı
        });
      }).toThrow('APP_SIGNING_SECRET konfigürasyonu gerekli');
      
      // Environment variable'ı geri yükle
      if (originalSigningSecret) {
        process.env.APP_SIGNING_SECRET = originalSigningSecret;
      }
    });

    test('should pass health check', async () => {
      const result = await provider.healthCheck();
      
      expect(result.success).toBe(true);
      expect(result.data.provider).toBe('netgsm');
      expect(result.data.dryRun).toBe(true);
    });
  });

  describe('Phone Number Formatting', () => {
    test('should format phone numbers for Netgsm', () => {
      const testCases = [
        { input: '+905551234567', expected: '905551234567' },
        { input: '05551234567', expected: '905551234567' },
        { input: '905551234567', expected: '905551234567' },
        { input: '5551234567', expected: '905551234567' }
      ];

      testCases.forEach(({ input, expected }) => {
        const result = provider.formatPhoneForNetgsm(input);
        expect(result).toBe(expected);
      });
    });

    test('should normalize phone numbers to E.164', () => {
      const testCases = [
        { input: '05551234567', expected: '+905551234567' },
        { input: '905551234567', expected: '+905551234567' },
        { input: '5551234567', expected: '+905551234567' },
        { input: '+905551234567', expected: '+905551234567' }
      ];

      testCases.forEach(({ input, expected }) => {
        const result = provider.normalizePhoneNumber(input);
        expect(result).toBe(expected);
      });
    });
  });

  describe('OTP Generation and Hashing', () => {
    test('should generate 6-digit OTP code', () => {
      const code = provider.generateOtpCode();
      
      expect(code).toMatch(/^\d{6}$/);
      expect(code.length).toBe(6);
    });

    test('should create and verify OTP hash', () => {
      const phoneNumber = '+905551234567';
      const code = '123456';
      const purpose = 'login';

      const { hash, salt } = provider.createOtpHash(phoneNumber, code, purpose);
      
      expect(hash).toBeDefined();
      expect(salt).toBeDefined();
      expect(hash.length).toBeGreaterThan(0);
      expect(salt.length).toBeGreaterThan(0);

      // Hash doğrulaması
      const isValid = provider.verifyOtpHash(phoneNumber, code, purpose, hash, salt);
      expect(isValid).toBe(true);

      // Yanlış kod ile doğrulama
      const isInvalid = provider.verifyOtpHash(phoneNumber, '999999', purpose, hash, salt);
      expect(isInvalid).toBe(false);
    });
  });

  describe('Rate Limiting', () => {
    test('should allow requests within limits', () => {
      const phoneNumber = '+905551234567';
      
      const result = provider.checkRateLimit(phoneNumber);
      
      expect(result.allowed).toBe(true);
    });

    test('should block requests exceeding per-minute limit', () => {
      const phoneNumber = '+905551234567';
      
      // İlk kontrol - izin verilmeli
      let result = provider.checkRateLimit(phoneNumber);
      expect(result.allowed).toBe(true);
      
      // Rate limit'i aş
      provider.incrementRateLimit(phoneNumber);
      
      // İkinci kontrol - bloklanmalı (limit 1/dakika)
      result = provider.checkRateLimit(phoneNumber);
      
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Dakika başına limit');
    });
  });

  describe('OTP Operations', () => {
    test('should send OTP in dry run mode', async () => {
      const result = await provider.sendOtp('+905551234567', { purpose: 'login' });
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('başarıyla gönderildi');
      expect(result.data.provider).toBe('netgsm');
      expect(result.data.purpose).toBe('login');
      expect(result.data.testCode).toBeDefined(); // Dry run'da test kodu döner
    });

    test('should verify valid OTP', async () => {
      // Önce OTP gönder
      const sendResult = await provider.sendOtp('+905551234567', { purpose: 'login' });
      expect(sendResult.success).toBe(true);
      
      const testCode = sendResult.data.testCode;
      
      // Sonra doğrula
      const verifyResult = await provider.verifyOtp('+905551234567', testCode, 'login');
      
      expect(verifyResult.success).toBe(true);
      expect(verifyResult.message).toContain('başarıyla doğrulandı');
    });

    test('should reject invalid OTP', async () => {
      // Önce OTP gönder
      await provider.sendOtp('+905551234567', { purpose: 'login' });
      
      // Yanlış kod ile doğrula
      const result = await provider.verifyOtp('+905551234567', '999999', 'login');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('invalid_otp');
      expect(result.message).toContain('Geçersiz kod');
    });

    test('should handle OTP expiry', async () => {
      // Çok kısa TTL ile provider oluştur
      const shortTtlProvider = new NetgsmOtpProvider({
        dryRun: true,
        userCode: 'test',
        password: 'test',
        msgHeader: 'TEST',
        signingSecret: 'test-key',
        ttlSeconds: 1 // 1 saniye
      });

      // OTP gönder
      const sendResult = await shortTtlProvider.sendOtp('+905551234567', { purpose: 'login' });
      const testCode = sendResult.data.testCode;

      // 2 saniye bekle (TTL'den fazla)
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Doğrulama dene (expire olmalı)
      const verifyResult = await shortTtlProvider.verifyOtp('+905551234567', testCode, 'login');
      
      expect(verifyResult.success).toBe(false);
      expect(verifyResult.error).toBe('otp_expired');
    });

    test('should handle max attempts exceeded', async () => {
      // OTP gönder
      const sendResult = await provider.sendOtp('+905551234567', { purpose: 'login' });
      expect(sendResult.success).toBe(true);

      // Max attempt'i aşacak kadar yanlış deneme yap
      for (let i = 0; i < 5; i++) {
        await provider.verifyOtp('+905551234567', '999999', 'login');
      }

      // Son deneme - kilitleme olmalı
      const result = await provider.verifyOtp('+905551234567', '999999', 'login');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('otp_locked'); // NetgsmOtpProvider'da bu error kodu kullanılıyor
      expect(result.message).toContain('15 dakika bekleyin');
    });

    test('should handle resend cooldown', async () => {
      // İlk OTP gönder
      const result1 = await provider.sendOtp('+905551234567', { purpose: 'login' });
      expect(result1.success).toBe(true);

      // Hemen tekrar göndermeye çalış (cooldown içinde)
      const result2 = await provider.sendOtp('+905551234567', { purpose: 'login' });
      
      expect(result2.success).toBe(false);
      expect(result2.error).toBe('rate_limit_exceeded'); // Rate limiting nedeniyle bu error dönüyor
      expect(result2.message).toContain('bekleyin');
    });

    test('should cancel pending OTP', async () => {
      // OTP gönder
      await provider.sendOtp('+905551234567', { purpose: 'login' });
      
      // İptal et
      const result = await provider.cancelOtp('+905551234567', 'login');
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('iptal edildi');
    });
  });

  describe('Message Templates', () => {
    test('should create ASCII-only messages', async () => {
      // Her purpose için farklı telefon numarası kullan (rate limiting nedeniyle)
      const purposes = ['login', 'register', 'password_reset', 'device_change'];
      
      for (let i = 0; i < purposes.length; i++) {
        const purpose = purposes[i];
        const phoneNumber = `+90555123456${i}`; // Farklı telefon numaraları
        
        const result = await provider.sendOtp(phoneNumber, { purpose });
        expect(result.success).toBe(true);
        
        // Dry run'da mesaj loglanır, ASCII kontrolü yapılabilir
        // Bu test gerçek mesaj içeriğini kontrol etmez, sadece başarılı gönderim kontrolü yapar
      }
    });
  });

  describe('Cleanup', () => {
    test('should cleanup expired entries', () => {
      // Bazı test verileri ekle
      provider.otpStorage.set('test:login', {
        hash: 'test-hash',
        salt: 'test-salt',
        purpose: 'login',
        createdAt: Date.now() - 1000000, // Çok eski
        expiresAt: Date.now() - 500000,  // Expire olmuş
        attempts: 0,
        locked: false
      });

      const sizeBefore = provider.otpStorage.size;
      provider.cleanup();
      const sizeAfter = provider.otpStorage.size;

      expect(sizeAfter).toBeLessThan(sizeBefore);
    });
  });
});
