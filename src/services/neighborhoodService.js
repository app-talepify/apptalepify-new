// import AsyncStorage from '@react-native-async-storage/async-storage';

// Tüm mahalle verisini dinamik yükle
let allNeighborhoodsData = null;
// Memo cache for combined neighborhoods across multiple districts in this session
const districtsUnionCache = new Map(); // key: sorted districts joined by '|' -> string[] neighborhoods

// İlk erişimde yükle
function loadNeighborhoodsData() {
  if (!allNeighborhoodsData) {
    try {
      allNeighborhoodsData = require('../data/allNeighborhoods.json');
      // console.debug('[NeighborhoodService] Veri yüklendi:', Object.keys(allNeighborhoodsData).length, 'ilçe');
    } catch (error) {
      // console.error('[NeighborhoodService] Veri yükleme hatası:', error);
      allNeighborhoodsData = {};
    }
  }
  return allNeighborhoodsData;
}

// Cache ayarları
// const CACHE_KEY = 'neighborhoods_cache_v3'; // v3: Tam veri yüklendi!
// const CACHE_DURATION = 30 * 24 * 60 * 60 * 1000; // 30 gün

// İlçe isimlerini ASCII'ye çevir (veri ASCII formatında)
function toASCII(str) {
  return str
    .toUpperCase()
    .replace(/İ/g, 'I')
    .replace(/I/g, 'I')
    .replace(/Ğ/g, 'G')
    .replace(/Ü/g, 'U')
    .replace(/Ş/g, 'S')
    .replace(/Ö/g, 'O')
    .replace(/Ç/g, 'C')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c');
}

// ✅ TAM VERİ YÜKLENDI!
// allNeighborhoodsData artık 54,000+ mahalle içeriyor
// 898 ilçe × ortalama 60 mahalle

// Artık gerek yok, ama geriye uyumluluk için saklanıyor
/* const localNeighborhoods_DEPRECATED = {
  // *** ÖNEMLİ NOT ***
  // Bu veri geçicidir. Gerçek mahalle verileri için:
  // 1. https://github.com/kadirgun/turkiye-il-ilce-mahalle-koyu reposundan tüm veriyi indir
  // 2. Firebase Storage'a yükle
  // 3. loadAllNeighborhoods fonksiyonundan çek
  
  // Şimdilik SADECE test için Samsun'un bazı ilçeleri (GEÇİCİ!)
  'Atakum': ['Aksu', 'Alanlı', 'Atakent', 'Balaç', 'Beypınar', 'Büyükkolpınar', 'Cumhuriyet', 'Çamlıyazı', 'Çatalçam', 'Denizevleri', 'Elmaçukuru', 'Erikli', 'Esenevler', 'Güzelyalı', 'İncesu', 'İstiklal', 'Karakavuk', 'Kamalı', 'Kesilli', 'Körfez', 'Küçükkolpınar', 'Mevlana', 'Mimar Sinan', 'Taflan', 'Yeni Mahalle', 'Yeşiltepe'],
  'İlkadım': ['19 Mayıs', 'Baruthane', 'Çiftlik', 'Gültepe', 'Hançerli', 'İlkadım', 'Kışla', 'Kurupelit', 'Mimar Sinan', 'Muratlı', 'Pazar', 'Reşatbey', 'Selahiye', 'Taşhan', 'Tekkeköy', 'Yenibey', 'Zafer'],
  'Canik': ['Canik', 'Çiftlikköy', 'Dereköy', 'Fevziçakmak', 'Kavaklık'],
  'Tekkeköy': ['Adnan Menderes', 'Çiftlik', 'Karapınar', 'Selimiye', 'Tekkeköy', 'Yenidoğan'],
  'Bafra': ['Alparslan', 'Bafra', 'Çetinkaya', 'Fatih', 'Günyüzü', 'Tabakhane'],
  'Çarşamba': ['Çarşamba', 'Cumhuriyet', 'Dereköy', 'Kıran', 'Sarıcalı', 'Yunusemre'],
  'Terme': ['Cumhuriyet', 'Değirmenli', 'Düz', 'Kale', 'Kumyalı', 'Terme', 'Yenice'],
  'Vezirköprü': ['Ağcagüney', 'Bahçelievler', 'Gökçeören', 'Gültepe', 'Hacınabi', 'Merkez', 'Yeni', 'Yenidoğan', 'Yeşiltepe', 'Yunusemre'], // Vezirköprü 161 mahalleli ama şimdilik 10 örnek
  // İstanbul - Popüler ilçeler (GEÇİCİ - sadece birkaç mahalle örneği!)
  // NOT: Her ilçede 20-60 mahalle var, burada sadece 10-15 örnek gösteriliyor
  'Kadıköy': ['Acıbadem', 'Caddebostan', 'Erenköy', 'Fenerbahçe', 'Feneryolu', 'Göztepe', 'Hasanpaşa', 'Koşuyolu', 'Kozyatağı', 'Merdivenköy'],
  'Beşiktaş': ['Abbasağa', 'Arnavutköy', 'Bebek', 'Beşiktaş', 'Etiler', 'Gayrettepe', 'Levent', 'Ortaköy', 'Ulus'],
  'Şişli': ['Bomonti', 'Esentepe', 'Fulya', 'Harbiye', 'Kurtuluş', 'Mecidiyeköy', 'Merkez', 'Teşvikiye'],
  'Üsküdar': ['Acıbadem', 'Altunizade', 'Beylerbeyi', 'Bulgurlu', 'Çengelköy', 'Kısıklı', 'Kuzguncuk', 'Üsküdar'],
  'Beyoğlu': ['Asmalı Mescit', 'Cihangir', 'Galata', 'Kasımpaşa', 'Taksim', 'Tarlabaşı'],
  'Fatih': ['Aksaray', 'Balat', 'Beyazıt', 'Eminönü', 'Fatih', 'Fener', 'Sultanahmet', 'Vefa'],
  'Kartal': ['Cevizli', 'Cumhuriyet', 'Kartal', 'Kordonboyu', 'Soğanlık', 'Yakacık', 'Yukarı'],
  'Maltepe': ['Altayçeşme', 'Altıntepe', 'Başıbüyük', 'Bağlarbaşı', 'Cevizli', 'Maltepe'],
  'Bakırköy': ['Ataköy', 'Bahçelievler', 'Bakırköy', 'Kartaltepe', 'Osmaniye', 'Yeşilköy', 'Yeşilyurt', 'Zuhuratbaba'],
  'Ataşehir': ['Atatürk', 'Barbaros', 'Esatpaşa', 'Ferhatpaşa', 'İçerenköy', 'Kayışdağı', 'Küçükbakkalköy', 'Yenisahra'],

  // Ankara - Top ilçeler
  'Çankaya': ['Bahçelievler', 'Çankaya', 'Gaziosmanpaşa', 'Kızılay', 'Kurtuluş', 'Maltepe', 'Sıhhiye', 'Tandoğan', 'Ümitköy', 'Yıldızevler'],
  'Keçiören': ['Etlik', 'Keçiören', 'Şentepe'],
  'Mamak': ['Mamak', 'Ege'],
  'Yenimahalle': ['Batıkent', 'Demetevler', 'Yenimahalle'],
  'Etimesgut': ['Elvankent', 'Etimesgut', 'Eryaman'],

  // İzmir - Top ilçeler
  'Konak': ['Alsancak', 'Göztepe', 'Güzelyalı', 'Karantina', 'Kemeraltı', 'Konak', 'Mersinli', 'Pasaport'],
  'Karşıyaka': ['Bahçelievler', 'Çarşı', 'Donanmacı', 'Mavişehir', 'Yalı'],
  'Bornova': ['Bornova', 'Çınarlı', 'Eğitim', 'Evka 3', 'Karacaoğlan'],
  'Buca': ['Buca', 'Kozağaç'],
  'Bayraklı': ['Bayraklı', 'Manavkuyu'],

  // Antalya - Top ilçeler
  'Muratpaşa': ['Bahçelievler', 'Güzeloluk', 'Kepez', 'Kızıltoprak', 'Lara', 'Muratpaşa', 'Şirinyalı'],
  'Konyaaltı': ['Gürsu', 'Konyaaltı', 'Liman', 'Sarısu'],
  'Kepez': ['Akdeniz', 'Altınova', 'Kepez', 'Sinan'],

  // Bursa - Top ilçeler
  'Osmangazi': ['Çekirge', 'Demirtaş', 'Fatih', 'Gürsu', 'İhsaniye', 'Mimar Sinan', 'Osmangazi', 'Yıldırım'],
  'Nilüfer': ['Alaaddinbey', 'Çalı', 'Fethiye', 'İhsaniye', 'Nilüfer', 'Uludağ'],
  'Yıldırım': ['Bağlarbaşı', 'Barış', 'Çınarlı', 'Çirişhane', 'Fatih', 'Hürriyet', 'Küçükkumla', 'Yıldırım'],

  // Adana
  'Seyhan': ['Seyhan', 'Ziyapaşa'],
  'Çukurova': ['Çukurova', 'Mithatpaşa'],
  'Sarıçam': ['Sarıçam'],

  // Gaziantep
  'Şehitkamil': ['Aktoprak', 'Burç', 'Çukur', 'Fatih', 'Güzelevler', 'İncilipınar', 'Karşıyaka', 'Şehitkamil'],
  'Şahinbey': ['Fatih', 'Gültepe', 'İncirli', 'Şahinbey', 'Yeşilce'],

  // Konya
  'Selçuklu': ['Akyokuş', 'Beyhekim', 'Çarşı', 'Fatih', 'Ferhuniye', 'Karaman', 'Karatay', 'Meram', 'Selçuklu', 'Yunusemre'],
  'Karatay': ['Alaaddin', 'Aziziye', 'Fatih', 'Hacı Hasan', 'Karatay', 'Selçuklu'],
  'Meram': ['Aydınlıkevler', 'Çaybaşı', 'Fatih', 'Kazımkarabekir', 'Meram', 'Selçuklu'],

  // Kocaeli
  'İzmit': ['Akçakoca', 'Başiskele', 'Çayırova', 'Darıca', 'Derince', 'Diliktaşı', 'Gölcük', 'İzmit', 'Kandıra', 'Karamürsel', 'Kartepe', 'Körfez'],
  'Gebze': ['Gebze', 'Kavaklı', 'Tavşancıl', 'Yuvacık'],

  // Diyarbakır
  'Sur': ['Dağkapı', 'Hançepek', 'Lalebey', 'Sur', 'Yenikapı'],
  'Yenişehir': ['Fatih', 'Hançepek', 'Yenişehir', 'Yeniköy'],
  'Bağlar': ['Bağcılar', 'Fatih', 'Gözlüce', 'Kocaköy'],

  // Kayseri
  'Melikgazi': ['Fatih', 'Güneşli', 'Hunat', 'Melikgazi', 'Talas', 'Yakut'],
  'Kocasinan': ['Anbar', 'Fatih', 'Kocasinan', 'Mimarsinan', 'Yakut'],
  'Talas': ['Hisarcık', 'Mimarsinan', 'Talas', 'Yakut'],
}; */

// Not: allNeighborhoodsData artık dosyanın başında import edildi!
// 54,000+ mahalle, 898 ilçe - tüm Türkiye!

/**
 * Belirli bir ilçenin mahallelerini getir
 * @param {string} district - İlçe adı
 * @returns {Promise<string[]>} - Mahalle listesi
 */
export const getNeighborhoodsForDistrict = async (district) => {
  try {
    // console.debug(`[NeighborhoodService] Mahalleler istendi: ${district}`);

    // Veriyi yükle
    const data = loadNeighborhoodsData();
    
    // İlçe ismini normalize et (önce direkt ara, sonra ASCII dene)
    let neighborhoods = data[district] || [];
    // Bulunamadıysa ASCII'ye çevirip dene
    if (neighborhoods.length === 0) {
      const asciiDistrict = toASCII(district);
      neighborhoods = data[asciiDistrict] || [];
      // console.debug(`[NeighborhoodService] ${district} → ${asciiDistrict} için ${neighborhoods.length} mahalle bulundu`);
    } else {
      // console.debug(`[NeighborhoodService] ${district} için ${neighborhoods.length} mahalle bulundu`);
    }
    
    return neighborhoods;
  } catch (error) {
    // console.error('[NeighborhoodService] Hata:', error);
    return [];
  }
};

/**
 * Tüm mahalle verilerini yükle
 * Not: Dinamik yükleme kullanıyoruz
 */
export const loadAllNeighborhoods = async () => loadNeighborhoodsData();

/**
 * Birden fazla ilçe için mahalleleri getir
 * @param {string[]} districts - İlçe listesi
 * @returns {Promise<string[]>} - Tüm mahallelerin birleşik listesi
 */
export const getNeighborhoodsForDistricts = async (districts) => {
  if (!districts || districts.length === 0) {
    return [];
  }

  // console.debug(`[NeighborhoodService] ${districts.length} ilçe için mahalle istendi`);
  // Use memo cache to avoid recomputing unions repeatedly
  const key = [...districts].sort((a, b) => a.localeCompare(b, 'tr')).join('|');
  if (districtsUnionCache.has(key)) {
    return districtsUnionCache.get(key);
  }

  const allNeighborhoods = [];
  for (const district of districts) {
    const neighborhoods = await getNeighborhoodsForDistrict(district);
    allNeighborhoods.push(...neighborhoods);
  }

  // Deduplicate and sort once
  const uniqueNeighborhoods = [...new Set(allNeighborhoods)].sort((a, b) => a.localeCompare(b, 'tr'));
  districtsUnionCache.set(key, uniqueNeighborhoods);
  // console.debug(`[NeighborhoodService] Toplam ${uniqueNeighborhoods.length} benzersiz mahalle bulundu`);
  return uniqueNeighborhoods;
};

/**
 * Cache'i temizle
 * Not: Veri artık import edilmiş, cache temizlemeye gerek yok
 */
export const clearNeighborhoodCache = async () => {};

/**
 * İstatistikleri getir
 */
export const getNeighborhoodStats = () => {
  const data = loadNeighborhoodsData();
  const districtCount = Object.keys(data).length;
  const neighborhoodCount = Object.values(data).flat().length;
  
  return {
    districtCount,
    neighborhoodCount,
    isAllDataLoaded: true,
    avgPerDistrict: (neighborhoodCount / districtCount).toFixed(1),
  };
};

