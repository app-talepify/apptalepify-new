## Talep (Request) ve Bildirim Sistemi — 2025-11-12

Bu doküman, Talep (Request) yaşam döngüsü ve bildirim sisteminin uçtan uca davranışını ve mevcut uygulama/Cloud Functions entegrasyonlarını özetler.


### 1) Talep Yaşam Döngüsü (15/20/30/45 kuralı)

- 15. gün (d15):
  - Talep havuzda (demand pool) otomatik yayından kaldırılır (`isPublished=false`).
  - Kullanıcıya bildirim gider (buton: “Talep e Git”). 

- 20. gün (d20):
  - Talep “expired” durumuna alınır (`status='expired'`, `isExpired=true`).
  - Bildirim gider (buton: “Talep e Git”).

- 30. gün (d30):
  - Talep “archived” durumuna alınır (`status='archived'`, `isArchived=true`).
  - Bildirim gider (buton: “Talep e Git”). Mesaj kullanıcıyı 15 gün içinde tamamen silineceği konusunda bilgilendirir.

- 45. gün (d45):
  - Talep tamamen ve kalıcı olarak silinir (Firestore’dan doküman silinir).

Uygulama: `functions/schedulers.js` içinde `processDemand` ve `processRequest` bunu uygular. Günlük tarama (03:00 Europe/Istanbul) `scanPortfolioAndDemandDue` ile çalışır ve `nextActionAt <= now` olanları işler. 15 günden küçük talepler ilk taramada kendini 15. güne re-schedule eder.


### 2) Bildirim Mesajları ve Butonlar

- Mesaj kalıpları: `functions/notify.js > demandMessage` (d15/d20/d30/d45) 
- Yaşam döngüsü bildirimleri payload’da şu bilgileri taşır:
  - `type: 'request'`
  - `action: { type: 'open_demand', id: <requestId> }`
  - `data.type: 'demand_lifecycle'`
  - `data.requestId: <requestId>`
  - `data.action_buttons: '[{ id: "view_request", title: "Talep e Git", action: "view_request" }]'`

NotificationOverlay bu butonları gösterir; `view_request` tıklandığında talep detayına gider.


### 3) NotificationOverlay (İstemci)

- Konum: `src/components/NotificationOverlay.js`
- Özellikler:
  - Listeleme, “Tümünü Oku”, “Tümünü Sil” (modal onaylı)
  - “Tümünü Sil” onayı sırasında modal içinde küçük spinner ve butonların disable edilmesi (akıcı UX)
  - Sunucu ile senkron:
    - `POST /notifications/mark-read`
    - `POST /notifications/mark-all-read`
    - `POST /notifications/delete` (tekli)
    - `POST /notifications/delete-all` (tümünü, sayfalamalı)
- Eksiksiz silme (kullanıcıya ait tüm bildirimler):
  - `functions/index.js > /notifications/delete-all` kullanıcı bazında 500’erlik batch’lerle döngüsel olarak siler (maks 50 iterasyon ≈ 25K kayıt).


### 4) Navigasyon ve Talep Detayı

- Buton “Talep e Git” → `view_request` action’ı `permissionNotificationHandlers.handleNotificationAction` tarafından ele alınır.
- Navigasyon:
  - Önce payload içindeki `requestSnapshot` varsa bununla `Taleplerim > RequestDetail` açılır (Firestore okumasına gerek kalmadan dolu ekran).
  - Snapshot yoksa sadece `requestId` ile gider; `RequestDetail` ekranı Firestore’dan kendisi yükler.
- `RequestDetail` güvenli başlangıç state’leriyle güncellendi:
  - Her zaman en az `{ contactInfo: {} }` ile başlar; undefined hataları önlenir.


### 5) Süresi Biten Talepler Paneli ve Detay (Uygulama İçi)

- Konum: `src/screens/RequestList.js`
- “Süresi biten panel” için modal detay:
  - NotificationOverlay tarzı cam efektli başlık ve sağ üstte kapatma
  - “Talep Durumu: Pasif” rozeti
  - “Tamamen silinmeye kalan süre: X gün” rozeti (oluşturma tarihinden 45 güne göre)
- `isRequestExpired` kuralı uygulama içinde 20 gün olarak revize edilmiştir.

### 5.1) Taleplerim ve Talep Havuzu Filtreleri — 2025-11-13

- Ekranlar:
  - Taleplerim (`src/screens/RequestList.js`): Kendi talepleriniz
  - Talep Havuzu (`src/screens/DemandPool.js`): Havuzdaki yayınlanmış talepler

- Yeni filtreler:
  - Üst satır: 4’lü gün filtresi (Bu gün / Son 3 gün / Son 7 gün / Son 15 gün)
    - Aktif buton komple hafif büyür (scale ≈ 1.06)
    - Basma anında kısa “bounce” (ölçek) animasyonu
    - Filtre çubuğu liste başlığındadır (ListHeaderComponent); sayfa kaydıkça içerikle birlikte yukarı çıkar
  - Alt satır: 3’lü öncelik filtresi (Normal / Öncelikli / Acil)
    - Aktif renkler: Normal=yeşil, Öncelikli=sarı, Acil=krimson
    - Talep Havuzu’nda öncelik butonları da gün filtresiyle aynı şekilde aktifken hafif büyür; basma animasyonu vardır
    - Taleplerim’de öncelik filtresi görsel olarak aynı segment stiliyle çalışır

- Performans/animasyon:
  - Liste kapsam animasyonu (fade/translate) yalnızca ilk açılışta çalışır; filtre değişiminde sadece öğeler güncellenir
  - Filtre butonları animasyon alır; sayfa genelinde yeniden render hissi engellenmiştir

- Talep Havuzu’nda eski üst durum filtresi kaldırıldı:
  - “Tümü / Favoriler / Aktif / Bekleyen / Tamamlanan” buton grubu kaldırıldı; yerine gün ve öncelik filtreleri geldi
  - Favori/gizleme işlevleri korunmuştur; sadece üst bar sadeleştirilmiştir

Not: Filtreler, dokümanların `createdAt` alanına göre çalışır; öncelik filtresi `priority` alanını (normal/priority/urgent) kullanır. Alan yoksa “normal” kabul edilir.


### 6) Test Ekranı (Notification Test)

- Açma: Profil sekmesinde “Profilim” yazısına ~2 saniye basılı tut → `NotificationTest` ekranı
- Bölümler:
  - Talep/Request Bildirim Testi (15/20/30/45): ID gir, tür seç (demand/request), d15/d20/d30/d45 ile test et
  - Talep/Request Direkt Bildirim (Client): Sunucuya gitmeden local notification ile anlık prova
  - Portföy ve Randevu testleri (mevcut)

Not: Test çağrıları yalnızca callable fonksiyonla yapılır (`testPrimeAndProcessEntity`). Üretim scheduler akışını etkilemez.


### 7) Sunucu Fonksiyonları (Özet)

- `functions/schedulers.js`:
  - `processDemand(docSnap)`, `processRequest(docSnap)`: 15/20/30/45 kuralı + bildirimler
  - `scanPortfolioAndDemandDue`: Günlük 03:00 Europe/Istanbul
  - `scanSubscriptionsDue`, `scanAgendaDue`: Diğer scheduler’lar
  - Test amaçlı callable: `testPrimeAndProcessEntity` (yalnızca auth ile çağrılır)

- `functions/index.js` (Express app):
  - Bildirim yönetimi endpoint’leri (`/notifications/*`)
  - `delete-all`: kullanıcıya ait tüm bildirimleri sayfalamalı hard delete

- `functions/fcm.js`:
  - FCM push ve Firestore bildirim kayıtları
  - DedupeKey’le tekrarlanmayan kayıt oluşturma


### 8) Eşleşme (Match) Bildirimleri

- “Portföyünüze uygun bir talep eklendi”/“Talebinize uygun bir portföy eklendi” mesajları yaşam döngüsünden bağımsızdır.
- Kaynak: `functions/index.js` içinde Firestore trigger’ları (`onPortfolioCreatedMatchAndNotify`, `onRequestCreatedMatchAndNotify`).
- Console’da “notifications” koleksiyonunu tüm kullanıcılar için görebilirsiniz; kendi hesabınıza ait olanları `userId == <uid>` filtresiyle denetleyiniz.


### 9) Dağıtım ve Ortam

- Dağıtım:
  - `firebase deploy --only functions`
  - Şemsiye fonksiyonlar: `scanPortfolioAndDemandDue`, `scanSubscriptionsDue`, `scanAgendaDue` (region: `europe-west1`)

- İstemci ENV:
  - `NOTIF_ENABLED=true` (local notification’lar için)
  - `API_BASE_URL` (server API çağrıları için)

- Test ENV (opsiyonel):
  - HTTP test uçları opsiyonel; prod’da kapalı tutmak önerilir.
  - Callable test fonksiyonu (`testPrimeAndProcessEntity`) zaten auth gerektirir; prod’da kalabilir.


### 10) Gelecek İyileştirmeler (Opsiyonel)

- Bildirim arşiv temizliği için günlük cleanup (örn. 30+ gün önceki notifications kayıtları silinsin) — büyük koleksiyon büyümesini kontrol eder.
- Custom bildirim sesi (platform başına):
  - Android: yeni kanal + `res/raw` ses dosyası
  - iOS: bundle `*.caf` ses dosyası + APNs `sound` alanı
  - Kademeli kanal geçişi (Android 8+ kanal kısıtı nedeniyle)


### 11) Sık Karşılaşılan Notlar

- Bildirimler temizlendiği halde Console’da hâlâ kayıt görünebilir:
  - Console tüm kullanıcıların kayıtlarını gösterir. Kendi UID’nizi filtreleyerek doğrulayın.
  - 500’den fazla kaydı olan kullanıcılar için artık `delete-all` sayfalamalıdır; “Tümünü Sil” sonrası aynı kullanıcı için yeniden veri geliyorsa yeni bildirimler üretildiği içindir.

- Bildirimden detay ekranına “izin/okuma” hataları:
  - `view_request` öncelikle snapshot ile navigasyon yapar; yoksa `requestId` kullanır. `RequestDetail` güvenli default state ile başlar.


— Son —


