import { Platform, Dimensions } from 'react-native';
import DeviceInfo from 'react-native-device-info';
import AsyncStorage from '@react-native-async-storage/async-storage';

class DeviceSecurityManager {
  constructor() {
    this.deviceId = null;
    this.fingerprint = null;
  }

  // Cihaz fingerprint oluştur
  async generateDeviceFingerprint() {
    try {
      const windowDims = Dimensions.get('window') || { width: 0, height: 0 };
      const results = await Promise.allSettled([
        DeviceInfo.getUniqueId(),
        DeviceInfo.getBrand(),
        DeviceInfo.getModel(),
        DeviceInfo.getSystemVersion(),
        DeviceInfo.getBuildNumber(),
        DeviceInfo.getBundleId(),
        DeviceInfo.getDeviceName(),
        // Total memory bazı cihazlarda reddedebilir
        DeviceInfo.getTotalMemory(),
        // getScreenData her sürümde yok; fallback olarak Dimensions kullan
        DeviceInfo.getScreenData ? DeviceInfo.getScreenData() : Promise.resolve({ width: windowDims.width, height: windowDims.height }),
      ]);

      const safe = (idx, fallback) => (results[idx] && results[idx].status === 'fulfilled' ? results[idx].value : fallback);

      const deviceId = String(safe(0, ''));
      const brand = String(safe(1, ''));
      const model = String(safe(2, ''));
      const systemVersion = String(safe(3, ''));
      const buildNumber = String(safe(4, ''));
      const bundleId = String(safe(5, ''));
      const deviceName = String(safe(6, ''));
      const totalMemory = Number(safe(7, 0)) || 0;
      const screenDataRaw = safe(8, { width: windowDims.width, height: windowDims.height }) || {};
      const screenWidth = Number(screenDataRaw.width) || windowDims.width || 0;
      const screenHeight = Number(screenDataRaw.height) || windowDims.height || 0;

      const fingerprint = {
        deviceId,
        platform: Platform.OS,
        brand,
        model,
        systemVersion,
        buildNumber,
        bundleId,
        deviceName,
        totalMemory,
        screenWidth,
        screenHeight,
        timestamp: Date.now(),
      };

      // Fingerprint hash oluştur (değişiklik tespiti için)
      const fingerprintString = JSON.stringify(fingerprint);
      const hash = this.simpleHash(fingerprintString);

      this.deviceId = deviceId;
      this.fingerprint = { ...fingerprint, hash };

      return this.fingerprint;
    } catch (error) {
      console.error('Device fingerprint error:', error);
      return null;
    }
  }

  // Basit hash fonksiyonu
  simpleHash(input) {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      hash = (hash << 5) - hash + input.charCodeAt(i);
      hash |= 0;
    }
    return ('00000000' + (hash >>> 0).toString(16)).slice(-8);
  }

  // Cihaz bilgilerini yerel olarak kaydet
  async saveDeviceInfo() {
    try {
      if (this.fingerprint) {
        await AsyncStorage.setItem('device_fingerprint', JSON.stringify(this.fingerprint));
      }
    } catch (error) {
      console.error('Save device info error:', error);
    }
  }

  // Yerel cihaz bilgilerini al
  async getLocalDeviceInfo() {
    try {
      const stored = await AsyncStorage.getItem('device_fingerprint');
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      return null;
    }
  }

  // Cihaz değişikliği tespit et
  async detectDeviceChange(serverFingerprint) {
    const currentFingerprint = await this.generateDeviceFingerprint();
    if (!currentFingerprint || !serverFingerprint) return true;

    // Kritik alanları karşılaştır
    const criticalFields = ['deviceId', 'platform', 'brand', 'model'];
    for (const field of criticalFields) {
      if (currentFingerprint[field] !== serverFingerprint[field]) {
        return true; // Cihaz değişti
      }
    }

    return false; // Aynı cihaz
  }

  // Güvenlik riski değerlendir
  evaluateSecurityRisk(userDevices, currentDevice) {
    const list = Array.isArray(userDevices) ? userDevices : [];
    const risks = [];

    // Çok fazla cihaz değişimi
    if (list.length > 3) {
      risks.push('MULTIPLE_DEVICES');
    }

    // Kısa sürede cihaz değişimi
    const recentDevices = list.filter(
      d => Date.now() - d.lastUsed < 24 * 60 * 60 * 1000 // Son 24 saat
    );
    if (recentDevices.length > 2) {
      risks.push('FREQUENT_DEVICE_CHANGE');
    }

    // Platform değişimi (iOS → Android veya tersi)
    const platforms = [...new Set(list.map(d => d.platform))];
    if (platforms.length > 1) {
      risks.push('PLATFORM_SWITCH');
    }

    return {
      riskLevel: risks.length > 2 ? 'HIGH' : risks.length > 0 ? 'MEDIUM' : 'LOW',
      risks,
    };
  }
}

export default new DeviceSecurityManager();
