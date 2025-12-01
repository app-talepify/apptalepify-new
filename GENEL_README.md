# Talepify – Genel Rehber ve Yol Haritası

Güncelleme: 2025-11-18

Bu doküman Talepify mobil uygulamasının (React Native), backend servislerinin (Firebase Functions), veri modeli, uç noktalar, ortam değişkenleri, üretim (prod) hazırlık kontrol listesi, test planı, izleme ve bakım prosedürleri ile yol haritasını tek yerde toplar. Projede planlama, geliştirme ve operasyon süreçlerinde referans alınacak ana rehberdir.


## 1) Genel Bakış

- Talepify, emlak talepleri (Request) ile portföyleri (Portfolio) eşleştiren, izinli paylaşımı ve bildirimleri yöneten bir mobil uygulamadır.
- Eşleştirme hem istemci tarafında (hızlı UX) hem de sunucuda (tetikleyicilerle) yapılır; sayısal alanlarda ±%10 tolerans uygulanır.
- Bildirim sistemi tek cihaz politikası, kalıcı kayıt ve deduplication içerir.
- Abonelik sisteminde planlar, uzatma callable fonksiyonu ve hatırlatma zamanlayıcıları vardır.
- Medya yüklemeleri Bunny Storage + CDN üzerinden güvenli ve ölçeklenebilir şekilde yapılır.


## 2) Teknoloji Yığını

- Mobil: React Native 0.74.5, React 18, React Navigation, RN Firebase (auth/messaging), AsyncStorage
- Backend: Firebase Functions (Node 20, region: europe-west1), Firestore, FCM, Express
- Medya: Bunny Storage + CDN (HEIC→JPEG opsiyonel dönüşüm, güvenli MIME ve boyut kontrolleri)
- Bildirim: FCM + Firestore kalıcı kayıt; tek cihaz politikası (users/{uid}/tokens)
- OTP/SMS: NetGSM (prod), mock (dev)
- Harita: Mapbox (opsiyonel, sadece Portföy Havuzu → Harita)
- Test: Jest (unit), servis testleri (OTP)
- Ops: Cloud Scheduler (zamanlanmış işler), warmup pinger


## 3) Mimari Genel Görünüm

```
┌────────────────┐      ┌───────────────────────┐      ┌─────────────────┐
│  React Native  │◄────►│  Firebase Functions   │◄───► │   Firebase FCM  │
│  (Client App)  │      │  (Express + Triggers) │      │  (Push Service) │
└──────┬─────────┘      └───────────┬───────────┘      └─────────────────┘
       │                             │
       ▼                             ▼
┌───────────────┐            ┌───────────────┐
│ AsyncStorage  │            │   Firestore   │
│ (cache/prefs) │            │ users, tokens │
└───────────────┘            │ requests      │
                              │ portfolios    │
                              │ notifications │
                              │ permissions   │
                              └───────────────┘

Medya: React Native → Firebase Function (upload endpoints) → Bunny Storage → Bunny CDN
```


## 4) Klasör Yapısı (Özet)

```
android/              # Android proje
ios/                  # iOS proje
src/
  navigation/         # RootNavigator, MainTabs ve alt stack'ler
  screens/            # Tüm ekranlar
  services/           # Auth, notifications, OTP, Firestore, vb.
  utils/              # matching, media, subscription, security, vb.
  context/            # AuthContext, DeviceAuthContext, PortfolioSearchContext
  components/         # UI bileşenleri, modallar, overlay'ler
functions/            # Firebase Functions (HTTP + triggers + schedulers)
  utils/              # subscription plan/constants vb.
  scripts/            # test yardımcıları
public-profile-server.js  # Local test amaçlı web profil server
README.md, *.MD       # Modül bazlı ek dokümanlar
GENEL_README.md       # (bu dosya)
```


## 5) Özellikler ve Modüller

### 5.1 Kimlik Doğrulama (OTP / Custom Token / Tek Cihaz)

- OTP akışları: `POST /auth/request-otp`, `POST /auth/verify-otp`, `POST /auth/login-with-otp`, `POST /auth/register-with-otp`, opsiyonel `POST /auth/password-login`.
- UID, telefon numarasından deterministik üretilir; Firebase Auth + Firestore user ensure edilir.
- Tek cihaz politikası: `POST /notifications/register-token` çağrısında diğer token'lar deaktive edilir; logout’ta `unregister-token` tüm token'ları pasifleştirir.
- İstemci bootstrap: `src/services/notifications/messagingBootstrap.js` (izin, token alma, kayıt, fallback).

Ana dosyalar:
- `functions/authRoutes.js`
- `src/context/AuthContext.js`, `src/context/DeviceAuthContext.js`
- `src/services/auth/*`, `src/firebase.js`


### 5.2 Talep–Portföy Eşleştirme

- Tolerans: fiyat, m², bina yaşı, kat için ±%10 (tek taraf belirtilmişse tek taraf genişler).
- Konum: şehir/ilçe/mahalle normalized eşleşme (Türkçe karakter ve “Mah./Mahallesi” varyasyonları).
- Tip/işlem/oda birebir normalize edilerek kontrol edilir.
- İstemci: `src/utils/requestMatching.js` iki yönlü fonksiyonlar:
  - `getMatchingPortfoliosForRequest(request, portfolios, { tolerance, ignoreLocation })`
  - `getMatchingRequestsForPortfolio(portfolio, requests, { tolerance })`
- Sunucu: Firestore tetikleyicileri yeni portföy/talep eklendiğinde ilgili kullanıcıya eşleşme bildirimi üretir.

Ana dosyalar:
- İstemci: `src/utils/requestMatching.js`
- Sunucu: `functions/index.js` → `onPortfolioCreatedMatchAndNotify`, `onRequestCreatedMatchAndNotify`


### 5.3 Bildirim Sistemi (Kalıcı Kayıt + Dedup + Tek Cihaz)

- `functions/fcm.js`:
  - `sendPushToUser(userId, payload)` → dedupeId ile `notifications/{id}` create(), FCM gönderim (tek/multicast).
  - Token hedefleme: `users/{uid}/tokens` alt koleksiyonu (isActive: true) öncelikli; yoksa `users.fcmToken` fallback.
- HTTP uçları: bildirim okundu/okundu tümü, sil/sil tümü, favori takibi ve fiyat değişimi bildirimi.
- Eylem butonları (approve/reject/share/view) veri içinde taşınır.

Ana dosyalar:
- `functions/fcm.js`, `functions/index.js` (HTTP uçları ve tetikleyiciler)
- İstemci servisleri: `src/services/notificationService.js`, `src/services/notifications/NotificationService.js`
- UI: `src/components/NotificationOverlay.js`


### 5.4 İzinli Paylaşım Sistemi (Permission)

- Akış: İzin iste → portföy sahibine 3 butonlu push → onay/red → talep sahibine sonuç push → özel paylaşım link üretimi.
- Veri: `permissionRequests` ve `customPortfolioShares` koleksiyonları.
- Sunucu uçları: `/permissions/approve`, `/permissions/reject` (HTTP, auth gerektirir).

Ana dosyalar:
- `PERMISSION_SYSTEM_README.md` (detaylı akış)
- `functions/index.js` (approve/reject + trigger: `onPermissionRequestCreated`)
- UI: `src/components/PermissionManagementModal.js`, `src/screens/RequestDetail.js` entegrasyonları


### 5.5 Abonelik Sistemi

- Planlar: 1/3/6/12 ay; ilk abonelikte referans indirimi (%10) desteği.
- Callable: `extendSubscription` → abonelik süresini atomik transaction ile uzatır, `subscriptionHistory` kaydı atar, gerekirse referans ödülü tetikler.
- Hatırlatmalar: Scheduler ile bitişe (7,3) gün kala push; plan/deneme durumuna göre farklı mesajlar.

Ana dosyalar:
- `ABONELIK_SISTEMI_README.md`
- `functions/index.js` (extendSubscription + referral tetikleyici)
- `functions/schedulers.js` (subscription hatırlatmaları, tarayıcılar)
- İstemci: `src/screens/Subscription*.js`, `src/utils/subscription.js`, `src/services/subscriptionService.js`


### 5.6 Medya (Bunny Storage + CDN)

- Upload: `POST /uploadImage` (multipart), `POST /uploadAudio` (JSON base64 veya multipart)
- Güvenlik: MIME kontrolü (sadece image/jpeg/png/webp ve common audio), boyut sınırı (`MAX_UPLOAD_MB`), path traversal temizliği, Content-Type otomatikleme. HEIC→JPEG dönüşümü opsiyonel.
- Delete: `POST /deleteImage`
- CORS ve auth middleware: Prod’da `ALLOW_PUBLIC_UPLOADS=false` ve Firebase ID token zorunlu.

Ana dosyalar:
- `functions/index.js` (uploadImage, uploadAudio, deleteImage, CORS ve auth middleware)
- İstemci: `src/utils/media.js`


### 5.7 Harita (Opsiyonel Mapbox Havuzu)

- Feature flag: `.env` → `USE_MAPBOX_POOL=false|true`, `MAPBOX_PUBLIC_TOKEN`, `MAPBOX_STYLE_URL`
- Ekran: `PortfolioMap` ve `components/map/providers/MapboxPool.js`


### 5.8 Diğer Modüller

- Haberler: `NewsList`, `NewsDetail`, `NewsWebView`, script: `scripts/news-fetcher.js`
- Notlar: `Notes` ekranı ve `notesService.js`
- Günlük Görevler: `DailyTasks` ekranı
- Hesaplayıcılar: `CommissionCalculator`, `PropertyValueCalculator`
- Public Profile Web: `public-profile-server.js` (local test amaçlı web profil sayfası)


## 6) Navigasyon ve Ekran Haritası (Özet)

- Root: `src/navigation/RootNavigator.js`
  - Auth flow: Splash → Login/Register → MainTabs
- MainTabs: `src/navigation/MainTabs.js`
  - Ana Sayfa (HomeStack): `Home`, `PortfolioList`, `DemandPool`, `PropertyDetail`, `PortfolioMap`, `DailyTasks`, `News*`, `Notes` vb.
  - Portföylerim (MyPortfoliosStack): `MyPortfolios`, `PortfolioMap`, `PropertyDetail`
  - Ekleme: Orta buton modalı → `AddPortfolio` ve `RequestForm` kısayolları
  - Taleplerim (RequestStack): `RequestList`, `RequestForm`, `RequestDetail`, `AddPortfolio`
  - Profil (DashboardStack): `Dashboard`, `Profile`, `Subscription/Packages/Payment/Management`, `Settings`, `ReferralSystem`, `HelpAndSupport`, `PrivacyPolicy`, `LiveChat`, `AccountDeletion`, `Notes`


## 7) Firestore Veri Modeli (Önerilen/Fiili)

> Koleksiyon adları projede hem `requests` hem `demands` olarak kullanımlara rastlanır. Tercihen tek isim (`requests`) standardize edilmesi tavsiye edilir. Aşağı, aktif kullanımların birleşimidir.

- `users/{uid}`
  - `fcmToken: string|null` (legacy)
  - `pushEnabled: boolean`
  - `subscriptionExpiryDate: timestamp`
  - `referredBy: string|null`
  - `tokens/{tokenId}`: `{ token, isActive, platform, deviceId, createdAt, updatedAt }`
- `requests/{requestId}`
  - `userId`, `city`, `districts[]`, `neighborhoods[]`, `listingStatus`, `propertyType`, `roomCount[]`
  - `minPrice`, `maxPrice`, `minSquareMeters`, `maxSquareMeters`, `minBuildingAge`, `maxBuildingAge`, `minFloor`, `maxFloor`
  - `isPublished`, `publishToPool`, `phase`, `nextActionAt`
- `portfolios/{portfolioId}`
  - `userId|ownerId`, `city`, `district`, `neighborhood`, `listingStatus|listingType`, `propertyType`, `roomCount`
  - `price`, `squareMeters|netSquareMeters|grossSquareMeters|area`, `buildingAge`, `floor|floorNumber`
  - `isPublished`, `phase`, `nextActionAt`
- `notifications/{notificationId}`
  - `userId`, `title`, `body`, `type`, `data`, `isRead`, `createdAt`, `dedupeKey`
- `permissionRequests/{requestId}`
  - `requesterId`, `requesterName`, `requesterPhone`, `portfolioOwnerId`, `portfolioId`, `portfolioTitle`, `status`, timestamps
- `customPortfolioShares/{id}`
  - `permissionRequestId`, `originalPortfolioId`, `sharerUserId`, `customLink`, `isActive`, timestamps
- `portfolioWatchers/{portfolioId}/users/{uid}`
  - `userId`, `active`, timestamps (favori/fiyat uyarısı için)
- `subscriptions/{uid}` (opsiyonel modelleme)
  - `plan`, `expiresAt`, `nextActionAt`, `phase`
- `appointments/{id}`
  - `userId`, `nextActionAt` (ajanda hatırlatmaları)


## 8) Ortam Değişkenleri

### 8.1 Mobil (.env)

```bash
# İstemci için bayraklar (sırlar koymayın)
USE_BUNNY=true
BUNNY_CDN_HOST=media.talepify.com

# Backend base URL
API_BASE_URL=https://europe-west1-<FIREBASE_PROJECT_ID>.cloudfunctions.net/bunny

# Auth Feature Flags
AUTH_CUSTOM_TOKEN_ENABLED=true

# OTP/SMS
OTP_PROVIDER=netgsm   # prod
# NETGSM_USER=
# NETGSM_PASS=
# NETGSM_HEADER=

# Notifications
NOTIF_ENABLED=true
ANDROID_DEFAULT_CHANNEL_ID=default_channel
ANDROID_DEFAULT_CHANNEL_NAME=General Notifications

# Map Pool (opsiyonel)
USE_MAPBOX_POOL=false
MAPBOX_PUBLIC_TOKEN=
MAPBOX_STYLE_URL=mapbox://styles/mapbox/streets-v12
```

### 8.2 Functions (Secret Manager + Runtime Env)

```bash
# Firebase Admin
FIREBASE_ADMIN_PROJECT_ID=...
FIREBASE_ADMIN_CLIENT_EMAIL=...
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# NetGSM
NETGSM_USER=...
NETGSM_PASS=...
NETGSM_HEADER=A.TELLIOGLU

# OTP
APP_SIGNING_SECRET=...
OTP_TTL_SECONDS=300
OTP_MAX_ATTEMPTS=5
OTP_LOCK_DURATION_MINUTES=5
OTP_RATE_PER_MINUTE=1
OTP_RATE_PER_HOUR=3
OTP_RATE_PER_DAY=5
OTP_USE_FIRESTORE=true
OTP_DRY_RUN=false

# Medya (Bunny)
BUNNY_STORAGE_ZONE=talepify-media2
BUNNY_STORAGE_HOST=storage.bunnycdn.com
BUNNY_STORAGE_KEY=<SECRET>    # Secret Manager
BUNNY_CDN_HOST=media.talepify.com
CONVERT_HEIC_TO_JPEG=true
ALLOW_PUBLIC_UPLOADS=false    # prod: false
MAX_UPLOAD_MB=15
FORCE_UNIQUE_FILENAMES=true
ALLOWED_ORIGINS=https://talepify.com

# Bildirim Zamanlayıcıları
NOTIF_BATCH_SIZE=500
NOTIF_TIMEZONE=Europe/Istanbul

NODE_ENV=production
```


## 9) Backend Uç Noktaları (HTTP + Callable + Triggers)

### 9.1 HTTP (auth bypass edilenler)
- `POST /auth/request-otp`
- `POST /auth/verify-otp`
- `POST /auth/login-with-otp`
- `POST /auth/password-login`
- `POST /auth/check-phone`
- `GET /health`

### 9.2 HTTP (auth zorunlu – Firebase ID Token veya dev mock)
- Medya: `POST /uploadImage`, `POST /uploadAudio`, `POST /deleteImage`
- Bildirim: `POST /notifications/test-persist`, `POST /notifications/mark-read`, `POST /notifications/mark-all-read`, `POST /notifications/delete`, `POST /notifications/delete-all`
- Favori & Uyarı: `POST /notifications/portfolio-favorite`, `POST /notifications/portfolio-price-change`
- Token yönetimi: `POST /notifications/register-token`, `POST /notifications/unregister-token`
- İzinli paylaşım: `POST /permissions/approve`, `POST /permissions/reject`
- SMS: `POST /send-sms`

### 9.3 Callable
- `extendSubscription` (abonelik uzatma + `subscriptionHistory` kaydı + referans ödülü tetikleme)
- Test yardımcıları: `testPrimeAndProcessEntity` (lifecycle test)

### 9.4 Firestore Tetikleyiciler
- `onPermissionRequestCreated` → portföy sahibine 3 butonlu push
- `onPortfolioCreatedMatchAndNotify` → ilgili taleplere push (eşleşme)
- `onRequestCreatedMatchAndNotify` → ilgili portföy sahiplerine push (eşleşme)
- `onPortfolioPriceChangedNotifyWatchers` → favori takipçilere fiyat değişimi push

### 9.5 Zamanlanmış İşler (Cloud Scheduler)
- `scanPortfolioAndDemandDue` (03:00): portföy/talep lifecycle, publish/unpublish/silme ve push
- `scanSubscriptionsDue` (03:10): abonelik hatırlatmaları (trial/paid)
- `scanAgendaDue` (*/5): ajanda hatırlatmaları
- `checkSubscriptionExpirations` (09:00): bitiş yaklaşan kullanıcılar (7/3 gün)
- `functionsPinger` (*/5): warmup endpoint ping (soğuk başlatmayı azaltır)


## 10) Üretim (Prod) Hazırlık Kontrol Listesi

- Güvenlik
  - [ ] `ALLOW_PUBLIC_UPLOADS=false` (Functions)
  - [ ] `ALLOWED_ORIGINS` domainlerle sınırlandı
  - [ ] Secrets: `BUNNY_STORAGE_KEY`, `NETGSM_*` Secret Manager’da
  - [ ] Firestore Rules: users/requests/portfolios/notifications/tokens/permissions yetki kontrolleri
- Bildirim
  - [ ] Android kanal ve ikon ayarları doğrulandı
  - [ ] iOS APNs anahtarı ve push yetenekleri aktif
  - [ ] Tek cihaz politikası akışları: login/logout/device switch E2E test edildi
- Abonelik/Ödeme
  - [ ] `extendSubscription` canlı test edildi
  - [ ] Ödeme sağlayıcı entegrasyon kararı (mevcut ekranlar placeholder); gateway entegrasyonu planlandı
- Medya
  - [ ] MIME ve boyut sınırları doğrulandı
  - [ ] HEIC dönüşümü ve benzersiz adlandırma etkin
- Harita
  - [ ] `USE_MAPBOX_POOL` kararı verildi; token/stil URL hazır (opsiyonel)
- Performans/Ölçek
  - [ ] Sık kullanılan Functions için minInstances veya pinger aktif
  - [ ] Scheduler kotaları ve logları izlendi
- Gözlemlenebilirlik
  - [ ] Cloud Logging panelleri ve uyarılar oluşturuldu
  - [ ] Mobil crash/analytics (örn. Crashlytics/Sentry) eklendi
- Yayınlama
  - [ ] Android/iOS imzalama, splash/icon, izin metinleri
  - [ ] Gizlilik/KVKK/GDPR belgeleri
- QA
  - [ ] OTP, izinli paylaşım, eşleşme, favori-fiyat değişimi, abonelik ve ajanda E2E senaryoları geçti


## 11) Test Planı

### 11.1 Unit
- OTP servisleri (`src/services/__tests__`), utils (matching, media, subscription)

### 11.2 Entegrasyon
- Bildirim bootstrap ve token kayıt
- Permission approve/reject akışları
- `extendSubscription` çağrısı ve `subscriptionHistory` doğrulaması

### 11.3 Manuel E2E
- Yeni kullanıcı: kayıt/OTP → token kayıt → test push alımı
- Cihaz değişimi: cihaz A’da login → cihaz B’de login → A logout zorlanır → push B’ye gelir
- Eşleşme: yeni portföy/talep oluştur → eşleşme bildirimi
- Favori fiyat değişimi: favorile → fiyatı değiştir → push al
- Abonelik: trial → 7/3 gün kala push, callable ile uzatma


## 12) İzleme ve Bakım

- Loglar: Firebase Functions Log (deploy sonrası izleme, hata oranları)
- Metrikler (öneri):
  - Notification delivery rate > %95
  - Token registration success rate > %98
  - Device switch success rate > %99
- Rutin kontroller:
  - Aylık: inactive token cleanup, delivery rate analizi
  - Üç aylık: SDK güncellemeleri, security audit
- Pinger: `functionsPinger` ve `/bunny/warmup` endpointi soğuk başlatmaları azaltır


## 13) Sorun Giderme (Kısa Rehber)

- Push gelmiyor
  - Firestore `users/{uid}/tokens` altında `isActive:true` token var mı?
  - `functions:log` kontrol; `test-persist` ile test payload gönder
  - Android notification permission ve kanal kontrolü
- Cihaz değişimi karmaşası
  - `register-token` uç noktası diğer tokenları deaktive eder; `unregister-token` logout’ta tetiklenmeli
- OTP problemleri
  - Rate limit env’lerini kontrol edin; `NETGSM_*` kimlikleri doğru mu?
  - `OTP_USE_FIRESTORE=true` ve TTL/LOCK ayarları uygunsa logları izleyin
- Medya yükleme hataları
  - `MAX_UPLOAD_MB`, MIME listeleri, HEIC dönüşüm logları, Bunny cevap metinleri (PUT/DELETE) kontrolü


## 14) Yol Haritası (Öneriler)

- Eşleşme iyileştirmeleri: polygon tabanlı konum, resmi kodlar ile mahalle esleştirme, skor açıklamalı sıralama
- Abonelik: gerçek ödeme sağlayıcı entegrasyonu, kupon/indirim yönetimi, faturalandırma
- Bildirim: in-app banner/Inbox, A/B test
- Analytics: olay izleme, huniler
- Web paylaşım: public profile ve custom share için production barındırma
- Veri model standardizasyonu: `demands`/`requests` birleştirme, alan adları


## 15) Yapı ve Komutlar

```bash
# Bağımlılık
npm install

# Android
npm run android

# iOS
cd ios && pod install && cd ..
npm run ios

# Tests
npm test

# Functions (deploy)
cd functions
npx firebase-tools@latest deploy --only functions
```


## 16) Değişiklik Kaydı (Kısa)

- 2025-11-18: İlk birleşik GENEL_README yayımlandı (özellikler, mimari, uç noktalar, prod planı).


—
Bu doküman, proje rotası ve operasyonel faaliyetler için tek kaynak (single source of truth) olarak düzenli güncellenecektir.

