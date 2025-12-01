/**
 * Mapbox Harita Stilleri
 * https://docs.mapbox.com/api/maps/styles/
 */

export const MAPBOX_STYLES = {
  // STANDART STİLLER
  STREETS: {
    id: 'streets',
    name: 'Sokaklar (Varsayılan)',
    url: 'mapbox://styles/mapbox/streets-v12',
    description: 'Standart sokak haritası, navigasyon için ideal',
    preview: '🗺️',
  },
  
  LIGHT: {
    id: 'light',
    name: 'Açık Tema',
    url: 'mapbox://styles/mapbox/light-v11',
    description: 'Minimalist açık renk, datalar için mükemmel',
    preview: '☀️',
  },
  
  DARK: {
    id: 'dark',
    name: 'Koyu Tema',
    url: 'mapbox://styles/mapbox/dark-v11',
    description: 'Modern koyu tema, gece modu için ideal',
    preview: '🌙',
  },
  
  SATELLITE: {
    id: 'satellite',
    name: 'Uydu Görünümü',
    url: 'mapbox://styles/mapbox/satellite-v9',
    description: 'Gerçek uydu fotoğrafları',
    preview: '🛰️',
  },
  
  SATELLITE_STREETS: {
    id: 'satellite-streets',
    name: 'Uydu + Sokaklar',
    url: 'mapbox://styles/mapbox/satellite-streets-v12',
    description: 'Uydu görüntüsü üzerine sokak bilgileri',
    preview: '🗾',
  },
  
  OUTDOORS: {
    id: 'outdoors',
    name: 'Doğa ve Arazi',
    url: 'mapbox://styles/mapbox/outdoors-v12',
    description: 'Topografik harita, hiking için ideal',
    preview: '🏔️',
  },
  
  NAVIGATION_DAY: {
    id: 'navigation-day',
    name: 'Navigasyon (Gündüz)',
    url: 'mapbox://styles/mapbox/navigation-day-v1',
    description: 'Araç navigasyonu için optimize edilmiş',
    preview: '🚗',
  },
  
  NAVIGATION_NIGHT: {
    id: 'navigation-night',
    name: 'Navigasyon (Gece)',
    url: 'mapbox://styles/mapbox/navigation-night-v1',
    description: 'Gece sürüşü için optimize edilmiş',
    preview: '🌃',
  },

  // MONOKROMATİK STİLLER
  MONOCHROME_LIGHT: {
    id: 'monochrome-light',
    name: 'Monokrom Açık',
    url: 'mapbox://styles/mapbox/light-v11',
    description: 'Tek renkli minimalist görünüm',
    preview: '⬜',
  },

  MONOCHROME_DARK: {
    id: 'monochrome-dark',
    name: 'Monokrom Koyu',
    url: 'mapbox://styles/mapbox/dark-v11',
    description: 'Tek renkli koyu tema',
    preview: '⬛',
  },

  // ÖZEL TÜRKÇE OPTIMIZE STİL
  CUSTOM_TURKISH: {
    id: 'custom-turkish',
    name: '🇹🇷 Türkiye Özel',
    url: 'mapbox://styles/mapbox/streets-v12', // Kendi style'ınızı oluşturabilirsiniz
    description: 'Türkiye için optimize edilmiş özel stil',
    preview: '🇹🇷',
  },
};

// Stil kategorileri
export const STYLE_CATEGORIES = {
  STANDARD: ['streets', 'light', 'dark'],
  SATELLITE: ['satellite', 'satellite-streets'],
  NAVIGATION: ['navigation-day', 'navigation-night'],
  OUTDOOR: ['outdoors'],
  MONOCHROME: ['monochrome-light', 'monochrome-dark'],
};

// Varsayılan stil
export const DEFAULT_STYLE = MAPBOX_STYLES.STREETS;

// 3D Bina ayarları
export const BUILDING_3D_CONFIG = {
  enabled: true,
  extrusionHeight: ['get', 'height'], // Binanın yüksekliği
  extrusionBase: ['get', 'min_height'], // Zemin seviyesi
  extrusionColor: '#aaa', // Bina rengi
  extrusionOpacity: 0.8, // Şeffaflık
};

// Terrain (Arazi) 3D ayarları
export const TERRAIN_3D_CONFIG = {
  enabled: true,
  exaggeration: 1.5, // Yükseklik abartma faktörü (1.0 = gerçek, 2.0 = 2x yüksek)
  source: 'mapbox-dem', // Digital Elevation Model
};
