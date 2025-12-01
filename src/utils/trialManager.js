import AsyncStorage from '@react-native-async-storage/async-storage';

// Constants
const TRIAL_CONSTANTS = {
  DURATION_DAYS: 7,
  MS_PER_DAY: 24 * 60 * 60 * 1000,
  STORAGE_KEYS: {
    TRIAL_STATUS: 'trial_status',
    TRIAL_START_DATE: 'trial_start_date',
    TRIAL_PHONE_NUMBERS: 'trial_phone_numbers',
  },
  STATUS: {
    ACTIVE: 'active',
    EXPIRED: 'expired',
  },
  ERROR_MESSAGES: {
    PHONE_ALREADY_USED: 'Bu telefon numarası daha önce deneme sürümü kullanmış',
    TRIAL_START_FAILED: 'Deneme sürümü başlatılamadı',
    TRIAL_EXPIRED: 'Deneme sürümünüz sona erdi. Abonelik paketlerini inceleyin.',
  },
};

/**
 * 7 günlük deneme sürümü yöneticisi
 */
export class TrialManager {
  constructor() {
    this.TRIAL_DURATION = TRIAL_CONSTANTS.DURATION_DAYS;
    this.TRIAL_KEY = TRIAL_CONSTANTS.STORAGE_KEYS.TRIAL_STATUS;
    this.TRIAL_START_KEY = TRIAL_CONSTANTS.STORAGE_KEYS.TRIAL_START_DATE;
    this.TRIAL_PHONE_KEY = TRIAL_CONSTANTS.STORAGE_KEYS.TRIAL_PHONE_NUMBERS;
  }

  /**
   * Yeni kullanıcı için deneme sürümü başlatır
   */
  async startTrial(phoneNumber) {
    try {
      const phone = String(phoneNumber || '').trim();
      if (!phone) {
        return { success: false, error: TRIAL_CONSTANTS.ERROR_MESSAGES.TRIAL_START_FAILED, canUseTrial: false };
      }
      // Telefon numarası daha önce deneme sürümü kullanmış mı kontrol et
      const usedPhones = await this.getUsedPhoneNumbers();

      if (usedPhones.includes(phone)) {
        return {
          success: false,
          error: TRIAL_CONSTANTS.ERROR_MESSAGES.PHONE_ALREADY_USED,
          canUseTrial: false,
        };
      }

      // Deneme sürümü başlat
      const trialData = {
        isActive: true,
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + this.TRIAL_DURATION * TRIAL_CONSTANTS.MS_PER_DAY).toISOString(),
        phoneNumber: phone,
        status: TRIAL_CONSTANTS.STATUS.ACTIVE,
      };

      await AsyncStorage.setItem(this.TRIAL_KEY, JSON.stringify(trialData));

      // Telefon numarasını kullanılan listeye ekle
      usedPhones.push(phone);
      // son 500 kayıtla sınırla (aşırı büyüme önleme)
      if (usedPhones.length > 500) {
        usedPhones.splice(0, usedPhones.length - 500);
      }
      await AsyncStorage.setItem(this.TRIAL_PHONE_KEY, JSON.stringify(usedPhones));

      return {
        success: true,
        trialData: trialData,
        canUseTrial: true,
      };
    } catch (error) {
      return {
        success: false,
        error: TRIAL_CONSTANTS.ERROR_MESSAGES.TRIAL_START_FAILED,
        canUseTrial: false,
      };
    }
  }

  /**
   * Mevcut deneme sürümü durumunu kontrol eder
   */
  async getTrialStatus() {
    try {
      const trialData = await AsyncStorage.getItem(this.TRIAL_KEY);

      if (!trialData) {
        return {
          hasTrial: false,
          isActive: false,
          daysRemaining: 0,
          canUseTrial: false,
        };
      }

      const trial = JSON.parse(trialData);
      if (!trial?.endDate) {
        return { hasTrial: false, isActive: false, daysRemaining: 0, canUseTrial: true };
      }
      const now = new Date();
      const endDate = new Date(trial.endDate);
      const daysRemaining = Math.ceil((endDate - now) / TRIAL_CONSTANTS.MS_PER_DAY);

      return {
        hasTrial: true,
        isActive: trial.isActive && daysRemaining > 0,
        daysRemaining: Math.max(0, daysRemaining),
        canUseTrial: false, // Zaten kullanılmış
        trialData: trial,
      };
    } catch (error) {
      return {
        hasTrial: false,
        isActive: false,
        daysRemaining: 0,
        canUseTrial: false,
      };
    }
  }

  /**
   * Deneme sürümünü sonlandırır
   */
  async endTrial() {
    try {
      const trialData = await AsyncStorage.getItem(this.TRIAL_KEY);

      if (trialData) {
        const trial = JSON.parse(trialData);
        trial.isActive = false;
        trial.status = TRIAL_CONSTANTS.STATUS.EXPIRED;

        await AsyncStorage.setItem(this.TRIAL_KEY, JSON.stringify(trial));
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Kullanılan telefon numaralarını getirir
   */
  async getUsedPhoneNumbers() {
    try {
      const usedPhones = await AsyncStorage.getItem(this.TRIAL_PHONE_KEY);
      return usedPhones ? JSON.parse(usedPhones) : [];
    } catch (error) {
      return [];
    }
  }

  /**
   * Telefon numarası deneme sürümü kullanabilir mi kontrol eder
   */
  async canUseTrial(phoneNumber) {
    try {
      const phone = String(phoneNumber || '').trim();
      if (!phone) { return false; }
      const usedPhones = await this.getUsedPhoneNumbers();
      return !usedPhones.includes(phone);
    } catch (error) {
      return false;
    }
  }

  /**
   * Deneme sürümü süresini kontrol eder
   */
  async checkTrialExpiry() {
    try {
      const trialStatus = await this.getTrialStatus();

      if (trialStatus.hasTrial && trialStatus.daysRemaining <= 0) {
        // Deneme sürümü süresi dolmuş
        await this.endTrial();
        return {
          expired: true,
          message: TRIAL_CONSTANTS.ERROR_MESSAGES.TRIAL_EXPIRED,
        };
      }

      return {
        expired: false,
        daysRemaining: trialStatus.daysRemaining,
      };
    } catch (error) {
      return { expired: false, daysRemaining: 0 };
    }
  }

  /**
   * Deneme sürümü bilgilerini temizler
   */
  async clearTrialData() {
    try {
      await AsyncStorage.removeItem(this.TRIAL_KEY);
      await AsyncStorage.removeItem(this.TRIAL_START_KEY);
      await AsyncStorage.removeItem(this.TRIAL_PHONE_KEY);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Belirli bir telefon numarasını kullanılan listeden kaldırır
   */
  async removePhoneFromUsedList(phoneNumber) {
    try {
      const usedPhones = await this.getUsedPhoneNumbers();
      const updatedPhones = usedPhones.filter(phone => phone !== phoneNumber);
      await AsyncStorage.setItem(this.TRIAL_PHONE_KEY, JSON.stringify(updatedPhones));
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

export default new TrialManager();
