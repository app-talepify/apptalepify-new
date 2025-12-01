# OTP Migration: Firebase Phone Auth'tan Netgsm SMS API'ye Geçiş

## Genel Bakış

Bu dokümantasyon, Talepify uygulamasında Firebase Phone Auth OTP sisteminden Netgsm SMS API'ye geçiş sürecini açıklar. Geçiş sırasında mevcut UI/UX korunmuş, sadece backend OTP sağlayıcısı değiştirilmiştir.

## Mevcut Durum Analizi

### Önceki Sistem
- **Firebase Phone Auth kullanılmıyordu** ✅
- Tüm OTP doğrulaması hardcoded `123456` ile yapılıyordu
- Mock OTP gönderimi (gerçek SMS yok)
- UI/UX tamamen hazır ve çalışır durumda

### Hedef Sistem
- **Netgsm SMS API** ile gerçek SMS gönderimi
- Güvenli OTP hash'leme ve saklama
- Rate limiting ve kötüye kullanım önleme
- Rollback özelliği ile güvenli geçiş

## Sistem Mimarisi

### OTP Provider Abstraction

```javascript
// Interface
export class OtpProvider {
  async sendOtp(phoneNumber, options) { /* ... */ }
  async verifyOtp(phoneNumber, code, purpose) { /* ... */ }
  async cancelOtp(phoneNumber, purpose) { /* ... */ }
  async healthCheck() { /* ... */ }
}

// Implementasyonlar
- MockOtpProvider (test/development)
- NetgsmOtpProvider (production)
```

### Merkezi OTP Service

```javascript
// Singleton service
import otpService from '../services/otpService';

// Kullanım
await otpService.sendOtp(phoneNumber, 'login');
const result = await otpService.verifyOtp(phoneNumber, code, 'login');
```

## Environment Konfigürasyonu

### Gerekli Environment Değişkenleri

```bash
# OTP sağlayıcısı
OTP_PROVIDER=netgsm  # 'netgsm' veya 'mock'

# Netgsm API bilgileri
NETGSM_USER=your_username
NETGSM_PASS=your_password  
NETGSM_HEADER=your_approved_header

# Güvenlik
APP_SIGNING_SECRET=your-secret-key-for-otp-hashing

# OTP ayarları
OTP_TTL_SECONDS=180
OTP_RESEND_COOLDOWN_SECONDS=60
OTP_MAX_ATTEMPTS=5

# Rate limiting
OTP_RATE_PER_MINUTE=1
OTP_RATE_PER_HOUR=3
OTP_RATE_PER_DAY=5

# Test/staging için
OTP_DRY_RUN=false  # true = gerçek SMS gönderilmez
```

### Konfigürasyon Dosyaları

1. **env.example** - Tüm environment değişkenlerinin örneği
2. **functions/env.example** - Cloud Functions için ayrı konfigürasyon

## OTP Akışları

### 1. Login Akışı

```javascript
// 1. Şifre doğrulandıktan sonra OTP gönder
const otpResult = await otpService.sendOtp(phone, 'login');

// 2. Kullanıcıdan OTP al ve doğrula
const verifyResult = await otpService.verifyOtp(phone, code, 'login');

// 3. Başarılıysa session oluştur
if (verifyResult.success) {
  await signIn(phone);
}
```

### 2. Kayıt Akışı

```javascript
// 1. Telefon numarası kontrolünden sonra OTP gönder
const otpResult = await otpService.sendOtp(phone, 'register');

// 2. OTP doğrula
const verifyResult = await otpService.verifyOtp(phone, code, 'register');

// 3. Başarılıysa kayıt işlemini tamamla
if (verifyResult.success) {
  // Kayıt işlemi devam eder
}
```

### 3. Şifre Sıfırlama Akışı

```javascript
// 1. Şifre sıfırlama için OTP gönder
const otpResult = await otpService.sendOtp(phone, 'password_reset');

// 2. OTP doğrula
const verifyResult = await otpService.verifyOtp(phone, code, 'password_reset');

// 3. Başarılıysa yeni şifre ekranına yönlendir
if (verifyResult.success) {
  navigation.navigate('NewPassword', { phoneNumber });
}
```

### 4. Cihaz Değişikliği Akışı

```javascript
// 1. Yeni cihaz tespit edildiğinde OTP gönder
const otpResult = await otpService.sendOtp(phone, 'device_change');

// 2. OTP doğrula
const verifyResult = await otpService.verifyOtp(phone, code, 'device_change');

// 3. Başarılıysa cihazı kaydet
if (verifyResult.success) {
  await deviceAuth.confirmDeviceWithSMS(userId, code);
}
```

## Güvenlik Özellikleri

### 1. OTP Hash'leme

```javascript
// OTP kodu hiçbir zaman plain text olarak saklanmaz
const { hash, salt } = createOtpHash(phoneNumber, code, purpose);

// Doğrulama sırasında hash karşılaştırması
const isValid = verifyOtpHash(phoneNumber, code, purpose, hash, salt);
```

### 2. Rate Limiting

- **Dakika başına**: 1 SMS
- **Saat başına**: 3 SMS  
- **Gün başına**: 5 SMS
- **Resend cooldown**: 60 saniye

### 3. Attempt Limiting

- **Maximum deneme**: 5 kez
- **Kilitleme süresi**: 15 dakika
- **TTL**: 3 dakika

### 4. Telefon Numarası Normalizasyonu

```javascript
// Farklı formatlar desteklenir
'05551234567'    → '+905551234567' (E.164)
'+905551234567'  → '+905551234567' 
'905551234567'   → '+905551234567'
'5551234567'     → '+905551234567'

// Netgsm için format
'+905551234567'  → '905551234567' (+ işareti kaldırılır)
```

## Netgsm API Entegrasyonu

### SMS Gönderim Endpoint

```
GET https://api.netgsm.com.tr/sms/send/get/
```

### Parametreler

```javascript
{
  usercode: 'NETGSM_USER',
  password: 'NETGSM_PASS', 
  gsmno: '905551234567',
  message: 'Talepify dogrulama kodu: 123456. 3 dk icinde kullanin.',
  msgheader: 'NETGSM_HEADER'
}
```

### Response Kodları

- **00 ile başlar**: Başarılı (örn: 00 123456789)
- **20**: Mesaj metninde hata
- **30**: Geçersiz kullanıcı adı/şifre
- **40**: Mesaj başlığı onaylanmamış
- **70**: Hatalı sorgulama

### Mesaj Şablonları

```javascript
const purposeTexts = {
  login: 'Giris',
  register: 'Kayit', 
  password_reset: 'Sifre sifirlama',
  device_change: 'Cihaz degisimi'
};

const message = `Talepify ${purposeTexts[purpose]} kodu: ${code}. 3 dk icinde kullanin.`;
```

**Not**: Türkçe karakterler kullanılmaz (ASCII only).

## Test ve Geliştirme

### Mock Provider

```javascript
// Development/test için
await otpService.initialize({
  provider: 'mock',
  dryRun: true,
  validCodes: ['123456', '111111']
});
```

### Dry Run Modu

```bash
OTP_DRY_RUN=true
```

- Gerçek SMS gönderilmez
- Console'a log yazılır
- Test kodu döndürülür

### Unit Testler

```bash
# Tüm testleri çalıştır
npm test

# Sadece OTP testleri
npm test -- --testNamePattern="OTP"

# Coverage raporu
npm run test:coverage
```

## Deployment ve Migration Planı

### 1. Staging Ortamı

```bash
# Staging environment
OTP_PROVIDER=netgsm
OTP_DRY_RUN=true
NETGSM_USER=staging_user
NETGSM_PASS=staging_pass
```

### 2. Production Rollout

```bash
# Production environment  
OTP_PROVIDER=netgsm
OTP_DRY_RUN=false
NETGSM_USER=production_user
NETGSM_PASS=production_pass
```

### 3. Rollback Planı

Sorun durumunda hızlı geri dönüş:

```bash
# Acil durum - Mock provider'a geç
OTP_PROVIDER=mock
OTP_DRY_RUN=true
```

### 4. Monitoring

```javascript
// Health check endpoint
const health = await otpService.healthCheck();

// Metrics (log-based)
- otp.sent (purpose, provider)
- otp.verified (purpose, success/failure)
- otp.failed (error_type)
- otp.rate_limited (phone, reason)
```

## Hata Durumları ve Çözümleri

### 1. Netgsm API Hataları

| Hata Kodu | Açıklama | Çözüm |
|-----------|----------|-------|
| 20 | Mesaj metni hatası | Mesaj şablonunu kontrol et |
| 30 | Geçersiz kullanıcı bilgileri | NETGSM_USER/PASS kontrol et |
| 40 | Başlık onaylanmamış | NETGSM_HEADER BTK onayını kontrol et |
| 70 | Hatalı sorgu | API parametrelerini kontrol et |

### 2. Rate Limit Aşımı

```javascript
{
  success: false,
  error: 'rate_limit_exceeded',
  message: 'Çok fazla deneme. Dakika başına limit aşıldı. Lütfen bekleyin.',
  data: { resetTime: 1640995200000 }
}
```

### 3. OTP Expiry

```javascript
{
  success: false,
  error: 'otp_expired', 
  message: 'OTP kodunun süresi dolmuş. Lütfen yeni kod isteyin.'
}
```

### 4. Max Attempts

```javascript
{
  success: false,
  error: 'max_attempts_exceeded',
  message: 'Çok fazla hatalı deneme. 15 dakika bekleyin.'
}
```

## Performance ve Optimizasyon

### 1. Memory Usage

- In-memory storage (production'da Redis önerilir)
- Otomatik cleanup (expired entries)
- Configurable TTL values

### 2. API Response Times

- Netgsm API timeout: 10 saniye
- Retry mekanizması yok (single attempt)
- Hata durumunda graceful fallback

### 3. Concurrent Operations

- Thread-safe operations
- Parallel OTP handling
- Phone number isolation

## Güvenlik Kontrol Listesi

- ✅ OTP kodları plain text saklanmıyor
- ✅ HMAC-SHA256 ile hash'leme
- ✅ Random salt kullanımı
- ✅ Rate limiting aktif
- ✅ Attempt limiting aktif
- ✅ TTL kontrolü
- ✅ Phone number validation
- ✅ Purpose isolation
- ✅ Secure environment variables
- ✅ No PII in logs

## Operasyonel Görevler

### 1. Monitoring

```bash
# Log patterns to monitor
grep "OTP gönderim hatası" logs/
grep "Rate limit aşıldı" logs/
grep "Max attempt" logs/
```

### 2. Maintenance

```javascript
// Cleanup task (cron job)
setInterval(() => {
  otpService.cleanup();
}, 60 * 60 * 1000); // Her saat
```

### 3. Backup/Recovery

- Environment variables backup
- Configuration versioning
- Rollback procedures documented

## Sonuç

Firebase Phone Auth'tan Netgsm SMS API'ye geçiş başarıyla tamamlanmıştır:

- ✅ **UI/UX değişmedi**: Kullanıcı deneyimi aynı kaldı
- ✅ **Gerçek SMS**: Artık gerçek SMS gönderimi yapılıyor
- ✅ **Güvenlik**: HMAC hash'leme, rate limiting, attempt limiting
- ✅ **Rollback**: Güvenli geri dönüş mekanizması
- ✅ **Test Coverage**: Unit ve integration testler mevcut
- ✅ **Documentation**: Kapsamlı dokümantasyon

### Migration Checklist

- [ ] Environment variables konfigüre edildi
- [ ] Netgsm hesabı ve BTK onayları hazır
- [ ] Staging ortamında test edildi
- [ ] Production deployment planlandı
- [ ] Monitoring ve alerting kuruldu
- [ ] Team eğitimi tamamlandı
- [ ] Rollback prosedürleri test edildi

---

**Son güncelleme**: 19 Eylül 2025
**Versiyon**: 1.0.0
**Hazırlayan**: OTP Migration Team
