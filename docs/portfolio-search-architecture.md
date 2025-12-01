# Portfolio Search, Filters, and Map Architecture

This document describes how Portfolio List and Map work together, where filtering logic lives, how drawing mode integrates, and what to change when adding new filters or behaviors. It’s designed to make future updates safe and fast without breaking existing functionality.

## High-level overview

- **Single source of truth**: A shared store provides `portfolios`, `filters`, `hasAppliedFilters`, `drawnPolygon`, `onlyMine`, `loading`, and actions. Both list and map read from this store.
  - Store: `src/context/PortfolioSearchContext.js`
- **Centralized filter logic**: Attribute and polygon filtering is implemented once and reused everywhere.
  - Utils: `src/utils/filtering.js` (e.g., `matchesFilters`, `filterByPolygon`, `normalizeListingType`)
- **Shared filter UI**: A single advanced filter modal is used by the list and map screens.
  - UI: `src/components/AdvancedFiltersModal.js`
- **List screen**: Renders portfolios with filters applied; navigates to map; supports `onlyMine` and favorites.
  - Screen: `src/screens/PortfolioList.js`
- **Map screen**: Renders pins, integrates drawing mode and camera persistence; consumes the same dataset and filters.
  - Screen: `src/screens/PortfolioMap.js`
- **Map provider**: Mapbox wrapper with initial camera and camera change callbacks.
  - Wrapper: `src/components/map/UnifiedPoolMap.js`
  - Provider: `src/components/map/providers/MapboxPool.js`
- **Navigation**: Context provider is mounted near the root; MyPortfolios uses the same stack with `onlyMine: true`.
  - Root: `src/navigation/RootNavigator.js`
  - Tabs/Stacks: `src/navigation/MainTabs.js`

## Data flow

1. App bootstraps and the provider wraps navigation in `RootNavigator`.
2. `PortfolioList` and `PortfolioMap` consume the store via `usePortfolioSearch()`.
3. Filters are applied with `applyFilters(filters)`; clearing with `clearFilters()`.
4. `filteredPortfolios` are derived from:
   - base portfolios
   - optionally narrowed by `onlyMine`
   - `matchesFilters(portfolio, filters)` if `hasAppliedFilters`
   - `filterByPolygon(result, drawnPolygon)` if a polygon exists
5. Map pin icons normalize listing type to avoid mismatch (e.g., `listingType` vs `listingStatus`).

## Adding a new filter (safe checklist)

1. Extend the default filters
   - File: `src/context/PortfolioSearchContext.js`
   - Add your new field to `defaultFilters` and ensure `clearFilters` resets it.

2. Update the filter UI
   - File: `src/components/AdvancedFiltersModal.js`
   - Add your control (switch/checkbox/input) that edits `filters` in context.
   - The modal already calls `applyFilters(filters)` on apply; nothing else needed.

3. Implement the filter rule once
   - File: `src/utils/filtering.js`
   - Add logic inside `matchesFilters(portfolio, filters)`.
   - If needed, add normalization helpers for data shape consistency.

4. Optional: Map pin classification
   - File: `src/components/map/providers/MapboxPool.js`
   - Only required if your filter affects how pin icons or layers are selected. For plain attribute filters, no changes are needed.

5. Test both views
   - `PortfolioList` and `PortfolioMap` read the same store and utils, so results stay in sync automatically.
   - Verify with and without drawing mode active.

Tips:
- Do not add ad-hoc filtering in screens. Always funnel through `matchesFilters` so list and map stay consistent.
- Avoid prop-based duplication; the context already synchronizes state across screens.

## Drawing mode behavior

- Drawing mode stays active after drawing; overlays provide two actions:
  - "Çizimi Temizle": Clears polygon but preserves filters; recomputes according to active filters (or shows initial 100 pins if none).
  - "Kapat": Exits drawing mode and clears polygon.
- Touch handling uses the RN Responder system with throttling and pixel threshold for reliable drawing across the entire screen.
- `pointerEvents` and `zIndex/elevation` are tuned so you can draw over the UI, and action buttons remain clickable.

Relevant files:
- `src/screens/PortfolioMap.js` (overlay, responders, actions)
- `src/utils/filtering.js` (polygon intersection via `filterByPolygon` and `isPointInPolygon`)

## Persistent camera state

- Last camera is persisted to `AsyncStorage` with key `map_last_camera_v1` and restored instantly.
- `UnifiedPoolMap` supports `initialCamera` to avoid the initial slide/flash.
- Updates are captured via `onCameraChanged` and debounced before saving.

Relevant files:
- `src/screens/PortfolioMap.js` (load/save camera state)
- `src/components/map/UnifiedPoolMap.js` (prop passthrough)
- `src/components/map/providers/MapboxPool.js` (instant camera on first render)

## MyPortfolios (onlyMine) reuse

- `MyPortfolios` is a reuse of `PortfolioList` with `onlyMine: true`.
- The store optionally filters by current user (`user.uid`) when `onlyMine` is set.

Relevant files:
- `src/navigation/MainTabs.js` (stack with `initialParams={{ onlyMine: true }}`)
- `src/screens/PortfolioList.js` (dynamic title/back behavior, same filtering pipeline)
- `src/context/PortfolioSearchContext.js` (optional owner filtering)

## Performance considerations

- Filtering and polygon intersection are wrapped with `React.startTransition` to keep UI responsive.
- Heavy work is guarded with signature checks to avoid redundant recomputation.
- `PortfolioList` uses `FlatList` virtualization (`initialNumToRender`, `windowSize`, `removeClippedSubviews`).
- Expensive rendering can be delayed with `InteractionManager.runAfterInteractions`.
- Data is cached in `AsyncStorage` to speed up first paint; background refresh updates the store.

## Logging and production noise

- Development logs are gated with `__DEV__` across list/map/media/notifications/OTP service.
- Known noisy warnings are ignored via `LogBox` in `index.js` (e.g., NativeEventEmitter and RNFirebase v22 deprecations).
- Error logs (`console.error`) remain visible in production.

## Known decisions and trade-offs

- Viewport-based loading and clustering were removed due to complexity and instability; default behavior shows the first 100 pins when unfiltered.
- Mapbox `within` expression for dynamic polygons was replaced by client-side point-in-polygon for reliability.
- Pin typing uses `normalizeListingType` (prefer `listingType`, fallback to `listingStatus`) to avoid UI mismatches.

## Troubleshooting

- Pins missing after navigation:
  - Ensure `filteredPortfolios` derives from `matchesFilters` + `filterByPolygon` and that context state is the source of truth (no local copies in screens).
- Drawing actions not clickable:
  - Review `zIndex/elevation` and `pointerEvents` of drawing overlay vs. action buttons in `PortfolioMap`.
- New filter not affecting map:
  - Verify it is added to `defaultFilters` and implemented in `matchesFilters`. Screens do not require changes if these are correct.

---

## Türkçe Özet ve Rehber

Bu bölüm, Portföy Listesi ve Harita görünümünün nasıl birlikte çalıştığını, filtre mantığının nerede olduğunu, çizim (polygon) entegrasyonunu ve yeni filtre eklerken izlemeniz gereken adımları anlatır.

### Genel Mimari
- **Tek veri kaynağı (store)**: `portfolios`, `filters`, `hasAppliedFilters`, `drawnPolygon`, `onlyMine`, `loading` ve ilgili aksiyonlar tek yerde tutulur.
  - Konum: `src/context/PortfolioSearchContext.js`
- **Merkezi filtre mantığı**: Tüm filtreleme ve polygon kesişimi tek yerde yazılır, liste ve harita ortak kullanır.
  - Konum: `src/utils/filtering.js` (`matchesFilters`, `filterByPolygon`, `normalizeListingType`)
- **Ortak filtre modalı**: Hem listede hem haritada aynı gelişmiş filtre modali kullanılır.
  - Konum: `src/components/AdvancedFiltersModal.js`
- **Liste ekranı**: Filtrelenmiş veriyi listeler, haritaya yönlendirir, `onlyMine` ve favorilerle uyumlu.
  - Konum: `src/screens/PortfolioList.js`
- **Harita ekranı**: Pinleri çizer, çizim modunu ve kalıcı kamerayı yönetir; aynı veri ve filtreleri kullanır.
  - Konum: `src/screens/PortfolioMap.js`
- **Harita sağlayıcısı**: Mapbox sarmalayıcı; ilk kamera ve kamera değişimlerini yönetir.
  - Konum: `src/components/map/UnifiedPoolMap.js`, `src/components/map/providers/MapboxPool.js`
- **Navigasyon**: Context, root seviyesinde; Portföylerim, aynı liste ekranını `onlyMine: true` ile kullanır.
  - Konum: `src/navigation/RootNavigator.js`, `src/navigation/MainTabs.js`

### Veri Akışı
1. Uygulama açılır, provider `RootNavigator` içinde sarılıdır.
2. `PortfolioList` ve `PortfolioMap` store’a `usePortfolioSearch()` ile erişir.
3. `applyFilters(filters)` ile filtre uygulanır; `clearFilters()` ile temizlenir.
4. `filteredPortfolios` şu sırayla türetilir:
   - temel portföyler
   - `onlyMine` aktifse kullanıcıya göre daraltma
   - `hasAppliedFilters` ise `matchesFilters`
   - polygon varsa `filterByPolygon`
5. Pin ikonları için `normalizeListingType` kullanılır; alan adı farkları giderilir.

### Yeni Filtre Ekleme (Adımlar)
1. Varsayılan filtreleri genişletin
   - `src/context/PortfolioSearchContext.js` → `defaultFilters` ve `clearFilters` güncelleyin.
2. Filtre UI’ına kontrol ekleyin
   - `src/components/AdvancedFiltersModal.js` → yeni switch/input ile `filters`’ı güncelleyin. `handleApply` zaten `applyFilters(filters)` çağırır.
3. Kuralı tek yerde uygulayın
   - `src/utils/filtering.js` → `matchesFilters` içine yeni kuralı ekleyin. Gerekirse normalizasyon yardımcıları yazın.
4. (İsteğe bağlı) Pin sınıflaması
   - `src/components/map/providers/MapboxPool.js` → yeni filtre pin ikonunu etkiliyorsa güncelleyin. Çoğu filtrede gerekmez.
5. Test
   - Liste ve harita otomatik senkron çalışır. Çizim açık/kapalı tüm durumları kontrol edin.

Notlar:
- Ekranlara özel ad-hoc filtre eklemeyin. Her zaman `matchesFilters` üzerinden gidin.
- Prop tabanlı filtre senkronizasyonu kullanmayın; context zaten paylaştırır.

### Çizim Modu
- Çizim tamamlanınca mod açık kalır; iki aksiyon vardır:
  - "Çizimi Temizle": Polygon’u temizler, filtreleri korur; aktif filtrelere göre veya (yoksa) ilk 100 pin gösterir.
  - "Kapat": Çizim modundan çıkar ve polygon’u temizler.
- Tüm ekranda güvenilir çizim için RN Responder + throttle + piksel eşiği kullanılır.
- `pointerEvents` ve `zIndex/elevation` ayarları ile butonlar çizim sırasında da tıklanabilir.

İlgili dosyalar: `src/screens/PortfolioMap.js`, `src/utils/filtering.js`

### Kalıcı Kamera
- Son kamera `AsyncStorage`’a `map_last_camera_v1` anahtarıyla kaydedilir ve anında geri yüklenir.
- `UnifiedPoolMap` `initialCamera` desteği ile ilk animasyon/flash engellenir.

### Portföylerim (onlyMine)
- `Portföylerim`, `PortfolioList`’in `onlyMine: true` ile aynen kullanımıdır.
- Store, `onlyMine` açıkken `user.uid` ile sahip filtrelemesini uygular.

### Performans
- Filtre ve polygon kesişimleri `React.startTransition` ile UI’ı bloklamaz.
- Gereksiz tekrar hesapları imza (signature) kontrolü ile engellenir.
- `FlatList` sanallaştırma: `initialNumToRender`, `windowSize`, `removeClippedSubviews`.
- `InteractionManager.runAfterInteractions` ile pahalı render’lar ertelenebilir.
- Veri `AsyncStorage` ile önbelleklenir; arkaplanda yenilenir.

### Loglama ve Üretim Gürültüsü
- Geliştirme logları `__DEV__` ile koşullu; prod’da susar.
- Bilinen gürültülü uyarılar `index.js`’te `LogBox.ignoreLogs` ile gizlenir (NativeEventEmitter, RNFirebase v22 uyarıları).
- Hata logları (`console.error`) prod’da görünür kalır.

### Bilinen Kararlar
- Viewport tabanlı yükleme ve clustering geri alındı (stabilite için). Filtre yoksa varsayılan ilk 100 pin gösterimi kullanılır.
- Mapbox `within` yerine güvenilir client-side nokta-içinde-polygon uygulanır.
- Pin sınıflaması `normalizeListingType` ile tutarlı hale getirilir.

### Sorun Giderme
- Navigasyon sonrası pinler yoksa:
  - `filteredPortfolios`’un `matchesFilters` + `filterByPolygon` ile ve context state’inden üretildiğini doğrulayın.
- Çizim aksiyonları tıklanmıyorsa:
  - `zIndex/elevation` ve `pointerEvents` katmanlarını kontrol edin.
- Yeni filtre haritayı etkilemiyorsa:
  - `defaultFilters` ve `matchesFilters` güncellemelerini doğrulayın. Ekranlarda ekstra değişiklik gerekmemelidir.


