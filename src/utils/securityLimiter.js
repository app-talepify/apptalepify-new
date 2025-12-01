import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

// Dev log helpers
const devLog = (...args) => { if (typeof __DEV__ !== 'undefined' && __DEV__) { try { /* eslint-disable no-console */ console.log(...args); /* eslint-enable no-console */ } catch {} } };
const devWarn = (...args) => { if (typeof __DEV__ !== 'undefined' && __DEV__) { try { /* eslint-disable no-console */ console.warn(...args); /* eslint-enable no-console */ } catch {} } };

// Safely extract millis from Firestore Timestamp or number
const toMillis = (value) => {
  try {
    if (!value && value !== 0) return null;
    if (typeof value === 'number') return value;
    if (typeof value?.toMillis === 'function') return value.toMillis();
    if (value?.seconds) return (value.seconds * 1000) + Math.floor((value.nanoseconds || 0) / 1e6);
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
};

class SecurityLimiter {
  constructor() {
    this.STORAGE_KEYS = {
      LOGIN_ATTEMPTS: 'security_login_attempts',
      DEVICE_CHANGES: 'security_device_changes',
      BLOCKED_UNTIL: 'security_blocked_until',
    };
    
    this.LIMITS = {
      MAX_LOGIN_ATTEMPTS: 5, // 5 başarısız giriş
      MAX_DEVICE_CHANGES: 3, // Günde 3 cihaz değişimi
      LOGIN_BLOCK_DURATION: 30 * 60 * 1000, // 30 dakika
      DEVICE_BLOCK_DURATION: 24 * 60 * 60 * 1000, // 24 saat
    };
  }

  // Günlük reset için bugünün string'i
  getTodayString() {
    return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  }

  // Yerel storage'dan güvenlik verilerini al
  async getLocalSecurityData(userId) {
    try {
      const keys = [
        `${this.STORAGE_KEYS.LOGIN_ATTEMPTS}_${userId}`,
        `${this.STORAGE_KEYS.DEVICE_CHANGES}_${userId}`,
        `${this.STORAGE_KEYS.BLOCKED_UNTIL}_${userId}`,
      ];
      
      const results = await AsyncStorage.multiGet(keys);
      const data = {};
      
      results.forEach(([key, value]) => {
        const keyName = key.split('_').slice(-2).join('_'); // Son iki parçayı al
        data[keyName] = value ? JSON.parse(value) : null;
      });

      return data;
    } catch (error) {
      console.error('Get local security data error:', error);
      return {};
    }
  }

  // Firestore'dan güvenlik verilerini al
  async getServerSecurityData(userId) {
    try {
      if (!userId) { return {}; }
      const securityRef = doc(db, 'userSecurity', userId);
      const docSnap = await getDoc(securityRef);
      
      if (docSnap.exists()) {
        const data = docSnap.data() || {};
        // Normalize known timestamp-like fields to millis for safe client comparisons
        if (data.blockedUntil) { data.blockedUntil = toMillis(data.blockedUntil); }
        if (data.lastBlocked) { data.lastBlocked = toMillis(data.lastBlocked); }
        return data;
      }
      return {};
    } catch (error) {
      // Firestore permission hatası normal - sessizce devam et
      return {};
    }
  }

  // Güvenlik verilerini kaydet (hem yerel hem sunucu)
  async saveSecurityData(userId, data) {
    try {
      if (!userId) { return { success: false, error: 'user_id_required' }; }
      // Yerel kayıt
      const localKeys = [
        [`${this.STORAGE_KEYS.LOGIN_ATTEMPTS}_${userId}`, JSON.stringify(data.loginAttempts || {})],
        [`${this.STORAGE_KEYS.DEVICE_CHANGES}_${userId}`, JSON.stringify(data.deviceChanges || {})],
        [`${this.STORAGE_KEYS.BLOCKED_UNTIL}_${userId}`, JSON.stringify(data.blockedUntil || null)],
      ];
      
      await AsyncStorage.multiSet(localKeys);

      // Sunucu kayıt
      const securityRef = doc(db, 'userSecurity', userId);
      const docSnap = await getDoc(securityRef);

      if (docSnap.exists()) {
        await updateDoc(securityRef, {
          ...data,
          lastUpdated: serverTimestamp(),
        });
      } else {
        await setDoc(securityRef, {
          userId,
          ...data,
          createdAt: serverTimestamp(),
          lastUpdated: serverTimestamp(),
        });
      }

      return { success: true };
    } catch (error) {
      // Firestore permission hatası normal - sessizce devam et
      return { success: false, error: error.message };
    }
  }

  // Blok durumunu kontrol et
  async checkBlockStatus(userId) {
    try {
      if (!userId) { return { isBlocked: false }; }
      const securityData = await this.getServerSecurityData(userId);
      const now = Date.now();

      // Blok var mı kontrol et
      const blockedUntilMs = toMillis(securityData.blockedUntil);
      if (blockedUntilMs && blockedUntilMs > now) {
        const remainingTime = Math.ceil((securityData.blockedUntil - now) / (60 * 1000)); // dakika
        return {
          isBlocked: true,
          reason: securityData.blockReason || 'Güvenlik ihlali',
          remainingMinutes: remainingTime,
        };
      }

      return { isBlocked: false };
    } catch (error) {
      console.error('Check block status error:', error);
      return { isBlocked: false };
    }
  }

  // Başarısız giriş denemesi kaydet
  async recordFailedLogin(userId, reason = 'wrong_password') {
    try {
      if (!userId) { return { success: false, error: 'user_id_required' }; }
      const securityData = await this.getServerSecurityData(userId);
      const today = this.getTodayString();
      const now = Date.now();

      const loginAttempts = securityData.loginAttempts || {};
      const todayAttempts = Array.isArray(loginAttempts[today]) ? loginAttempts[today] : [];

      // Bugünkü denemeyi ekle
      todayAttempts.push({
        timestamp: now,
        reason,
        ip: 'unknown', // Gerekirse IP tracking eklenebilir
      });
      // aşırı büyümeyi engelle (son 50 denemeyi tut)
      if (todayAttempts.length > 50) {
        todayAttempts.splice(0, todayAttempts.length - 50);
      }

      loginAttempts[today] = todayAttempts;

      // Limit aşıldı mı kontrol et
      if (todayAttempts.length >= this.LIMITS.MAX_LOGIN_ATTEMPTS) {
        const blockedUntil = now + this.LIMITS.LOGIN_BLOCK_DURATION;
        
        await this.saveSecurityData(userId, {
          ...securityData,
          loginAttempts,
          blockedUntil,
          blockReason: `Çok fazla başarısız giriş denemesi (${todayAttempts.length}/${this.LIMITS.MAX_LOGIN_ATTEMPTS})`,
          lastBlocked: now,
        });

        return {
          success: false,
          blocked: true,
          message: `Çok fazla başarısız deneme. ${Math.ceil(this.LIMITS.LOGIN_BLOCK_DURATION / (60 * 1000))} dakika boyunca bloklandınız.`,
          blockedUntil,
        };
      }

      // Sadece deneme sayısını güncelle
      await this.saveSecurityData(userId, {
        ...securityData,
        loginAttempts,
      });

      return {
        success: true,
        attemptsRemaining: this.LIMITS.MAX_LOGIN_ATTEMPTS - todayAttempts.length,
      };
    } catch (error) {
      console.error('Record failed login error:', error);
      return { success: false, error: error.message };
    }
  }

  // Cihaz değişimi kaydet
  async recordDeviceChange(userId, oldDeviceId, newDeviceId) {
    try {
      if (!userId) { return { success: false, error: 'user_id_required' }; }
      const securityData = await this.getServerSecurityData(userId);
      const today = this.getTodayString();
      const now = Date.now();

      const deviceChanges = securityData.deviceChanges || {};
      const todayChanges = Array.isArray(deviceChanges[today]) ? deviceChanges[today] : [];

      // Bugünkü değişimi ekle
      todayChanges.push({
        timestamp: now,
        oldDeviceId,
        newDeviceId,
      });
      // aşırı büyümeyi engelle (son 50 değişimi tut)
      if (todayChanges.length > 50) {
        todayChanges.splice(0, todayChanges.length - 50);
      }

      deviceChanges[today] = todayChanges;

      // Limit aşıldı mı kontrol et (4. değişimde blokla)
      if (todayChanges.length >= this.LIMITS.MAX_DEVICE_CHANGES + 1) {
        const blockedUntil = now + this.LIMITS.DEVICE_BLOCK_DURATION;
        
        await this.saveSecurityData(userId, {
          ...securityData,
          deviceChanges,
          blockedUntil,
          blockReason: `Çok fazla cihaz değişimi (${todayChanges.length}/${this.LIMITS.MAX_DEVICE_CHANGES})`,
          lastBlocked: now,
        });

        return {
          success: false,
          blocked: true,
          message: `Günlük cihaz değişim limitini aştınız. Yarına kadar bloklandınız.`,
          blockedUntil,
        };
      }

      // Uyarı ver (3. değişimde)
      if (todayChanges.length === this.LIMITS.MAX_DEVICE_CHANGES) {
        await this.saveSecurityData(userId, {
          ...securityData,
          deviceChanges,
        });

        return {
          success: true,
          warning: true,
          message: `Son cihaz değişiminiz! Bir daha değiştirirseniz yarına kadar bloklanırsınız.`,
          changesRemaining: 0,
        };
      }

      // Normal kayıt
      await this.saveSecurityData(userId, {
        ...securityData,
        deviceChanges,
      });

      return {
        success: true,
        changesRemaining: this.LIMITS.MAX_DEVICE_CHANGES - todayChanges.length,
      };
    } catch (error) {
      console.error('Record device change error:', error);
      return { success: false, error: error.message };
    }
  }

  // Başarılı giriş sonrası temizlik
  async clearFailedAttempts(userId) {
    try {
      if (!userId) { return { success: false, error: 'user_id_required' }; }
      const securityData = await this.getServerSecurityData(userId);
      const today = this.getTodayString();

      // Bugünkü başarısız denemeleri temizle
      const loginAttempts = securityData.loginAttempts || {};
      if (loginAttempts[today]) {
        delete loginAttempts[today];
      }

      // Aktif blok varsa kaldır (sadece login blokları için)
      let updates = { loginAttempts };
      if (securityData.blockedUntil && securityData.blockReason?.includes('başarısız giriş')) {
        updates.blockedUntil = null;
        updates.blockReason = null;
      }

      await this.saveSecurityData(userId, {
        ...securityData,
        ...updates,
      });

      return { success: true };
    } catch (error) {
      console.error('Clear failed attempts error:', error);
      return { success: false };
    }
  }

  // Güvenlik istatistikleri al
  async getSecurityStats(userId) {
    try {
      if (!userId) { return {}; }
      const securityData = await this.getServerSecurityData(userId);
      const today = this.getTodayString();

      const todayLoginAttempts = (securityData.loginAttempts?.[today] || []).length;
      const todayDeviceChanges = (securityData.deviceChanges?.[today] || []).length;

      return {
        todayLoginAttempts,
        todayDeviceChanges,
        loginAttemptsRemaining: Math.max(0, this.LIMITS.MAX_LOGIN_ATTEMPTS - todayLoginAttempts),
        deviceChangesRemaining: Math.max(0, this.LIMITS.MAX_DEVICE_CHANGES - todayDeviceChanges),
        isBlocked: !!(securityData.blockedUntil && securityData.blockedUntil > Date.now()),
        blockedUntil: securityData.blockedUntil,
        blockReason: securityData.blockReason,
      };
    } catch (error) {
      console.error('Get security stats error:', error);
      return {};
    }
  }

  // Eski kayıtları temizle (haftalık/aylık cleanup)
  async cleanupOldRecords(userId, daysToKeep = 7) {
    try {
      if (!userId) { return { success: false, error: 'user_id_required' }; }
      const securityData = await this.getServerSecurityData(userId);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
      const cutoffString = cutoffDate.toISOString().split('T')[0];

      // Eski giriş denemelerini temizle
      const loginAttempts = securityData.loginAttempts || {};
      Object.keys(loginAttempts).forEach(date => {
        if (date < cutoffString) {
          delete loginAttempts[date];
        }
      });

      // Eski cihaz değişimlerini temizle
      const deviceChanges = securityData.deviceChanges || {};
      Object.keys(deviceChanges).forEach(date => {
        if (date < cutoffString) {
          delete deviceChanges[date];
        }
      });

      await this.saveSecurityData(userId, {
        ...securityData,
        loginAttempts,
        deviceChanges,
      });

      return { success: true };
    } catch (error) {
      console.error('Cleanup old records error:', error);
      return { success: false };
    }
  }
}

export default new SecurityLimiter();
