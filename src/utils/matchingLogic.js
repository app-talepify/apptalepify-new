// Eşleştirme algoritması için yardımcı fonksiyonlar

// Constants
const EARTH_RADIUS_KM = 6371; // Dünya'nın yarıçapı (km)
const DEG_TO_RAD = Math.PI / 180;
const DEFAULT_TOLERANCE = 20;
const DEFAULT_MIN_SCORE = 70;
const DEFAULT_MAX_RESULTS = 20;

// Default weights for compatibility calculation
const DEFAULT_WEIGHTS = {
  location: 0.3,
  price: 0.25,
  features: 0.2,
  propertyType: 0.15,
  timing: 0.1,
};

// Score quality thresholds
const QUALITY_THRESHOLDS = {
  EXCELLENT: 90,
  VERY_GOOD: 80,
  GOOD: 70,
  MEDIUM: 60,
  LOW: 50,
};

/**
 * İki konum arasındaki mesafeyi hesaplar (Haversine formülü)
 * @param {Object} pos1 - İlk konum {latitude, longitude}
 * @param {Object} pos2 - İkinci konum {latitude, longitude}
 * @returns {number} Mesafe (km)
 */
export const calculateDistance = (pos1, pos2) => {
  if (!pos1 || !pos2) {
    return Infinity;
  }
  const lat1 = Number(pos1.latitude);
  const lon1 = Number(pos1.longitude);
  const lat2 = Number(pos2.latitude);
  const lon2 = Number(pos2.longitude);
  if (!Number.isFinite(lat1) || !Number.isFinite(lon1) || !Number.isFinite(lat2) || !Number.isFinite(lon2)) {
    return Infinity;
  }

  const dLat = (lat2 - lat1) * DEG_TO_RAD;
  const dLon = (lon2 - lon1) * DEG_TO_RAD;

  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * DEG_TO_RAD) * Math.cos(lat2 * DEG_TO_RAD) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
};

/**
 * İki fiyat arasındaki uyumluluğu hesaplar
 * @param {number} price1 - İlk fiyat
 * @param {number} price2 - İkinci fiyat
 * @param {number} tolerance - Tolerans yüzdesi (varsayılan: 20)
 * @returns {number} Uyumluluk skoru (0-100)
 */
export const calculatePriceCompatibility = (price1, price2, tolerance = DEFAULT_TOLERANCE) => {
  const p1 = Number(price1);
  const p2 = Number(price2);
  if (!Number.isFinite(p1) || !Number.isFinite(p2) || p1 <= 0 || p2 <= 0) {
    return 0;
  }

  const difference = Math.abs(p1 - p2);
  const averagePrice = (p1 + p2) / 2;
  if (averagePrice <= 0) { return 0; }
  const percentageDiff = (difference / averagePrice) * 100;

  if (percentageDiff <= tolerance) {
    return 100 - percentageDiff;
  }

  return Math.max(0, 100 - (percentageDiff - tolerance) * 2);
};

/**
 * İki özellik listesi arasındaki uyumluluğu hesaplar
 * @param {Array} features1 - İlk özellik listesi
 * @param {Array} features2 - İkinci özellik listesi
 * @returns {number} Uyumluluk skoru (0-100)
 */
export const calculateFeaturesCompatibility = (features1 = [], features2 = []) => {
  if (!Array.isArray(features1) || !Array.isArray(features2) || !features1.length || !features2.length) {
    return 50;
  }

  const set1 = new Set(features1);
  const set2 = new Set(features2);
  let commonCount = 0;
  set1.forEach((f) => { if (set2.has(f)) { commonCount += 1; } });
  const totalFeatures = new Set([...set1, ...set2]).size;

  return totalFeatures > 0 ? (commonCount / totalFeatures) * 100 : 50;
};

/**
 * İki portföy arasındaki genel uyumluluk skorunu hesaplar
 * @param {Object} portfolio1 - İlk portföy
 * @param {Object} portfolio2 - İkinci portföy
 * @param {Object} weights - Ağırlık ayarları
 * @returns {Object} Uyumluluk detayları
 */
export const calculateCompatibility = (portfolio1, portfolio2, weights = {}) => {
  const finalWeights = { ...DEFAULT_WEIGHTS, ...weights };

  // Konum uyumluluğu
  const locationScore = portfolio1.location && portfolio2.location
    ? Math.max(0, 100 - (calculateDistance(portfolio1.location, portfolio2.location) * 10))
    : 50;

  // Fiyat uyumluluğu
  const priceScore = calculatePriceCompatibility(portfolio1.price, portfolio2.price);

  // Özellik uyumluluğu
  const featuresScore = calculateFeaturesCompatibility(portfolio1.features, portfolio2.features);

  // Mülk tipi uyumluluğu
  const propertyTypeScore = portfolio1.propertyType === portfolio2.propertyType ? 100 : 0;

  // Zaman uyumluluğu (eğer belirtilmişse)
  let timingScore = 50;
  if (portfolio1.availabilityDate && portfolio2.availabilityDate) {
    const date1 = new Date(portfolio1.availabilityDate);
    const date2 = new Date(portfolio2.availabilityDate);
    const daysDiff = Math.abs(date1 - date2) / (1000 * 60 * 60 * 24);
    timingScore = Math.max(0, 100 - daysDiff);
  }

  // Genel skor hesaplama
  const overallScore =
    locationScore * finalWeights.location +
    priceScore * finalWeights.price +
    featuresScore * finalWeights.features +
    propertyTypeScore * finalWeights.propertyType +
    timingScore * finalWeights.timing;

  return {
    overallScore: Math.round(overallScore),
    details: {
      location: Math.round(locationScore),
      price: Math.round(priceScore),
      features: Math.round(featuresScore),
      propertyType: Math.round(propertyTypeScore),
      timing: Math.round(timingScore),
    },
    weights: finalWeights,
  };
};

/**
 * Portföy listesini uyumluluk skoruna göre sıralar
 * @param {Object} targetPortfolio - Hedef portföy
 * @param {Array} portfolios - Portföy listesi
 * @param {Object} weights - Ağırlık ayarları
 * @returns {Array} Sıralanmış portföy listesi
 */
export const sortByCompatibility = (targetPortfolio, portfolios, weights = {}) => {
  if (!targetPortfolio || !portfolios || !portfolios.length) {
    return [];
  }

  return portfolios
    .map(portfolio => ({
      ...portfolio,
      compatibility: calculateCompatibility(targetPortfolio, portfolio, weights),
    }))
    .sort((a, b) => b.compatibility.overallScore - a.compatibility.overallScore);
};

/**
 * Belirli bir uyumluluk skorunun üzerindeki portföyleri filtreler
 * @param {Array} portfolios - Portföy listesi
 * @param {number} minScore - Minimum uyumluluk skoru
 * @returns {Array} Filtrelenmiş portföy listesi
 */
export const filterByMinCompatibility = (portfolios, minScore = DEFAULT_MIN_SCORE) => {
  return portfolios.filter(portfolio =>
    portfolio.compatibility && portfolio.compatibility.overallScore >= minScore,
  );
};

/**
 * Portföy eşleştirme önerilerini oluşturur
 * @param {Object} userPortfolio - Kullanıcının portföyü
 * @param {Array} availablePortfolios - Mevcut portföyler
 * @param {Object} preferences - Kullanıcı tercihleri
 * @returns {Array} Eşleştirme önerileri
 */
export const generateMatchingSuggestions = (userPortfolio, availablePortfolios, preferences = {}) => {
  if (!userPortfolio || !availablePortfolios || !availablePortfolios.length) {
    return [];
  }

  const weights = {
    location: preferences.locationWeight || DEFAULT_WEIGHTS.location,
    price: preferences.priceWeight || DEFAULT_WEIGHTS.price,
    features: preferences.featuresWeight || DEFAULT_WEIGHTS.features,
    propertyType: preferences.propertyTypeWeight || DEFAULT_WEIGHTS.propertyType,
    timing: preferences.timingWeight || DEFAULT_WEIGHTS.timing,
  };

  let suggestions = sortByCompatibility(userPortfolio, availablePortfolios, weights);

  // Minimum uyumluluk skoruna göre filtreleme
  if (preferences.minCompatibilityScore) {
    suggestions = filterByMinCompatibility(suggestions, preferences.minCompatibilityScore);
  }

  // Maksimum mesafe filtresi
  if (preferences.maxDistance) {
    suggestions = suggestions.filter(suggestion => {
      if (!userPortfolio.location || !suggestion.location) {
        return true;
      }
      const distance = calculateDistance(userPortfolio.location, suggestion.location);
      return distance <= preferences.maxDistance;
    });
  }

  // Fiyat aralığı filtresi
  if (preferences.minPrice || preferences.maxPrice) {
    suggestions = suggestions.filter(suggestion => {
      if (!suggestion.price) {
        return true;
      }
      if (preferences.minPrice && suggestion.price < preferences.minPrice) {
        return false;
      }
      if (preferences.maxPrice && suggestion.price > preferences.maxPrice) {
        return false;
      }
      return true;
    });
  }

  return suggestions.slice(0, preferences.maxResults || DEFAULT_MAX_RESULTS);
};

/**
 * Eşleştirme kalitesini değerlendirir
 * @param {number} score - Uyumluluk skoru
 * @returns {string} Kalite değerlendirmesi
 */
export const getMatchQuality = (score) => {
  if (score >= QUALITY_THRESHOLDS.EXCELLENT) {
    return 'Mükemmel Eşleşme';
  }
  if (score >= QUALITY_THRESHOLDS.VERY_GOOD) {
    return 'Çok İyi Eşleşme';
  }
  if (score >= QUALITY_THRESHOLDS.GOOD) {
    return 'İyi Eşleşme';
  }
  if (score >= QUALITY_THRESHOLDS.MEDIUM) {
    return 'Orta Eşleşme';
  }
  if (score >= QUALITY_THRESHOLDS.LOW) {
    return 'Düşük Eşleşme';
  }
  return 'Zayıf Eşleşme';
};

/**
 * Eşleştirme istatistiklerini hesaplar
 * @param {Array} portfolios - Portföy listesi
 * @returns {Object} İstatistikler
 */
export const calculateMatchingStats = (portfolios) => {
  if (!portfolios || !portfolios.length) {
    return {
      totalPortfolios: 0,
      averageScore: 0,
      scoreDistribution: {},
      topMatches: [],
    };
  }

  const scores = portfolios.map(p => p.compatibility?.overallScore || 0);
  const averageScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;

  const scoreDistribution = scores.reduce((acc, score) => {
    const range = Math.floor(score / 10) * 10;
    const key = `${range}-${range + 9}`;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const topMatches = portfolios
    .filter(p => p.compatibility?.overallScore >= QUALITY_THRESHOLDS.VERY_GOOD)
    .slice(0, 5);

  return {
    totalPortfolios: portfolios.length,
    averageScore: Math.round(averageScore),
    scoreDistribution,
    topMatches,
  };
};
