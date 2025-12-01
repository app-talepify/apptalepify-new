/**
 * Mapbox Global Configuration
 * Bu dosya Mapbox'ı tüm uygulama için yapılandırır.
 * Token .env dosyasından okunur (production-safe).
 */

import MapboxGL from '@rnmapbox/maps';
import { MAPBOX_ACCESS_TOKEN, MAPBOX_PUBLIC_TOKEN } from '@env';

// Dev-only warn
const devWarn = (...args) => { if (typeof __DEV__ !== 'undefined' && __DEV__) { try { /* eslint-disable no-console */ console.warn(...args); /* eslint-enable no-console */ } catch {} } };

let isInitialized = false;

/**
 * Mapbox'ı başlatır. Token .env dosyasından okunur.
 * Bu fonksiyon sadece bir kez çalışır.
 */
export const initializeMapbox = () => {
  if (isInitialized) {
    return;
  }

  try {
    // .env dosyasından token oku
    const token = MAPBOX_ACCESS_TOKEN || MAPBOX_PUBLIC_TOKEN || '';
    
    if (!token) {
      devWarn('⚠️ Mapbox access token not found (MAPBOX_ACCESS_TOKEN / MAPBOX_PUBLIC_TOKEN)');
      return;
    }

    MapboxGL.setAccessToken(token);
    MapboxGL.setTelemetryEnabled(false);
    
    // Logging'i kapat (production için)
    if (typeof MapboxGL.setLoggingEnabled === 'function') {
      MapboxGL.setLoggingEnabled(__DEV__); // Sadece dev modda log
    }

    isInitialized = true;
  } catch (e) {
    console.error('❌ Mapbox initialization failed:', e);
  }
};

export default MapboxGL;
