// Referans sistemi için yardımcı fonksiyonlar
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  serverTimestamp,
  limit,
} from 'firebase/firestore';
import { db } from '../firebase';

// Dev log helpers
const devLog = (...args) => { if (typeof __DEV__ !== 'undefined' && __DEV__) { try { /* eslint-disable no-console */ console.log(...args); /* eslint-enable no-console */ } catch {} } };
const devWarn = (...args) => { if (typeof __DEV__ !== 'undefined' && __DEV__) { try { /* eslint-disable no-console */ console.warn(...args); /* eslint-enable no-console */ } catch {} } };

// Constants
const REFERRAL_CONSTANTS = {
  MIN_CODE_LENGTH: 8,
  DEFAULT_REWARD_DAYS: 30,
  CODE_FORMAT_REGEX: /^[A-Z0-9]{8,}$/,
  STATUS: {
    PENDING: 'pending',
    COMPLETED: 'completed',
    EXPIRED: 'expired',
  },
  NOTIFICATION_TYPES: {
    REFERRAL_REWARD: 'referral_reward',
  },
  COLLECTIONS: {
    REFERRAL_CODES: 'referralCodes',
    REFERRALS: 'referrals',
  },
};

/**
 * Referans kodu oluştur
 */
export const generateReferralCode = (displayName) => {
  // Kullanıcının adından ve rastgele sayılardan daha okunaklı bir kod oluştur
  const namePart = (displayName || 'KULLANICI')
    .replace(/[^a-zA-Z0-9]/g, '') // Sadece harf ve rakamları tut
    .substring(0, 8) // Maksimum 8 karakter al
    .toUpperCase();

  const randomPart = Math.floor(10000 + Math.random() * 90000).toString(); // 5 haneli rastgele sayı

  const raw = `${namePart}${randomPart}`;
  // Güvenli: minimum uzunluk ve format sağlanamıyorsa fallback üret
  if (!REFERRAL_CONSTANTS.CODE_FORMAT_REGEX.test(raw)) {
    const fallback = `${(namePart || 'USER').padEnd(8, 'X').slice(0, 8)}${randomPart}`;
    return fallback.toUpperCase();
  }
  return raw;
};

/**
 * Referans kodu doğrula
 */
export const validateReferralCode = (code) => {
  return REFERRAL_CONSTANTS.CODE_FORMAT_REGEX.test(code);
};

/**
 * Referans kaydı sınıfı
 */
export class ReferralRecord {
  constructor(data = {}) {
    this.id = data.id || '';
    this.referrerId = data.referrerId || ''; // Referans kodu sahibi
    this.referredId = data.referredId || ''; // Referans kodu ile kayıt olan
    this.referralCode = data.referralCode || '';
    this.status = data.status || REFERRAL_CONSTANTS.STATUS.PENDING;
    this.rewardClaimed = data.rewardClaimed || false;
    this.subscriptionPurchased = data.subscriptionPurchased || false;
    this.createdAt = data.createdAt ? new Date(data.createdAt) : new Date();
    this.completedAt = data.completedAt ? new Date(data.completedAt) : null;
    this.rewardDays = data.rewardDays || REFERRAL_CONSTANTS.DEFAULT_REWARD_DAYS;
  }

  isCompleted() {
    return this.status === REFERRAL_CONSTANTS.STATUS.COMPLETED;
  }

  isPending() {
    return this.status === REFERRAL_CONSTANTS.STATUS.PENDING;
  }

  isExpired() {
    return this.status === REFERRAL_CONSTANTS.STATUS.EXPIRED;
  }

  canClaimReward() {
    return this.isCompleted() && !this.rewardClaimed;
  }

  toJSON() {
    return {
      id: this.id,
      referrerId: this.referrerId,
      referredId: this.referredId,
      referralCode: this.referralCode,
      status: this.status,
      rewardClaimed: this.rewardClaimed,
      subscriptionPurchased: this.subscriptionPurchased,
      createdAt: this.createdAt.toISOString(),
      completedAt: this.completedAt ? this.completedAt.toISOString() : null,
      rewardDays: this.rewardDays,
    };
  }
}

/**
 * Referans sistemi yöneticisi
 */
class ReferralManager {
  constructor(userId) {
    this.userId = userId;
  }

  /**
   * Kullanıcı için referans kodu oluştur
   */
  async generateUserReferralCode(displayName) {
    try {
      const referralCode = generateReferralCode(displayName);

      // Firestore'a referans kodu kaydet
      const referralData = {
        userId: this.userId,
        referralCode: referralCode,
        isActive: true,
        totalReferrals: 0,
        totalRewardDays: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await addDoc(collection(db, REFERRAL_CONSTANTS.COLLECTIONS.REFERRAL_CODES), referralData);

      return {
        success: true,
        referralCode: referralCode,
        data: referralData,
      };
    } catch (error) {
      return {
        success: false,
        error: error?.message || String(error),
      };
    }
  }

  /**
   * Referans kodu ile kayıt olan kullanıcıyı işle
   */
  async processReferral(referralCode, referredUserId) {
    try {
      // Referans kodunun geçerli olup olmadığını kontrol et
      if (!validateReferralCode(referralCode || '')) {
        throw new Error('Geçersiz referans kodu');
      }

      // Referans kodunun sahibini bul
      const referrerData = await this.findReferralCodeOwner(referralCode);
      if (!referrerData) {
        throw new Error('Referans kodu bulunamadı');
      }

      // Kendi referans kodunu kullanamaz
      if (referrerData.userId === referredUserId) {
        throw new Error('Kendi referans kodunuzu kullanamazsınız');
      }

      // Referans kaydı oluştur
      const referralRecordData = {
        referrerId: referrerData.userId,
        referredId: referredUserId,
        referralCode: referralCode,
        status: REFERRAL_CONSTANTS.STATUS.PENDING,
        rewardClaimed: false,
        subscriptionPurchased: false,
        rewardDays: REFERRAL_CONSTANTS.DEFAULT_REWARD_DAYS,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      // Firestore'a referans kaydı ekle
      const referralRecordRef = await addDoc(collection(db, REFERRAL_CONSTANTS.COLLECTIONS.REFERRALS), referralRecordData);

      const referralRecord = new ReferralRecord({
        id: referralRecordRef.id,
        ...referralRecordData,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      return {
        success: true,
        referralRecord: referralRecord,
        referrerId: referrerData.userId,
      };
    } catch (error) {
      return {
        success: false,
        error: error?.message || String(error),
      };
    }
  }

  /**
   * Abonelik satın alındığında referans ödülünü ver
   */
  async claimReferralReward(referralCode, referredUserId) {
    try {
      // Referans kaydını bul
      const referralRecord = await this.findReferralRecord(referralCode, referredUserId);
      if (!referralRecord) {
        throw new Error('Referans kaydı bulunamadı');
      }

      if (referralRecord.isCompleted()) {
        throw new Error('Bu referans zaten tamamlanmış');
      }

      // Referans kaydını tamamla
      referralRecord.status = REFERRAL_CONSTANTS.STATUS.COMPLETED;
      referralRecord.completedAt = new Date();
      referralRecord.subscriptionPurchased = true;

      // Firebase'e kaydet (isteğe bağlı - mevcutta devre dışı)
      // await this.updateReferralRecord(referralRecord); // TODO: prod'da etkinleştir

      // Referans kodu sahibine 30 gün ekle
      const rewardResult = await this.addRewardDaysToUser(
        referralRecord.referrerId,
        referralRecord.rewardDays,
      );

      if (!rewardResult.success) {
        throw new Error('Ödül günleri eklenemedi: ' + rewardResult.error);
      }

      // Referans kodu sahibine bildirim gönder
      await this.sendReferralNotification(
        referralRecord.referrerId,
        referralRecord.referredId,
        referralRecord.rewardDays,
      );

      return {
        success: true,
        referralRecord: referralRecord,
        rewardDays: referralRecord.rewardDays,
        message: 'Referans ödülü başarıyla verildi',
      };
    } catch (error) {
      return {
        success: false,
        error: error?.message || String(error),
      };
    }
  }

  /**
   * Kullanıcıya ödül günleri ekle
   */
  async addRewardDaysToUser(userId, days) {
    try {
      // SubscriptionManager kullanarak gün ekle
      try {
        // Dinamik import kullanarak subscription manager'ı yükle
        const { SubscriptionManager } = await import('./subscription.js');
        const subscriptionManager = new SubscriptionManager(userId);
        const result = await subscriptionManager.addReferralRewardDays(days);

        if (result.success) {
          return result;
        } else {
          throw new Error(result.error);
        }
      } catch (importError) {
        // Geliştirme ortamında mock gün ekleme; prod'da hata döndür
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          return {
            success: true,
            addedDays: days,
            message: `${days} gün abonelik süresine eklendi (dev-mock)`,
          };
        }
        return { success: false, error: 'subscription_manager_unavailable' };
      }
    } catch (error) {
      return {
        success: false,
        error: error?.message || String(error),
      };
    }
  }

  /**
   * Referans bildirimi gönder
   */
  async sendReferralNotification(referrerId, referredId, rewardDays) {
    try {
      // Referans kodu sahibine bildirim gönder
      const notificationData = {
        userId: referrerId,
        type: REFERRAL_CONSTANTS.NOTIFICATION_TYPES.REFERRAL_REWARD,
        title: 'Referans Ödülü!',
        message: `Referans kodunuz ile yeni bir kullanıcı abone oldu. ${rewardDays} gün kullanım süresi eklendi.`,
        data: {
          referredUserId: referredId,
          rewardDays: rewardDays,
          timestamp: new Date(),
        },
      };

              // Bildirim servisini kullan
        try {
          // Dinamik import kullanarak bildirim servisini yükle
        const notificationService = await import('../services/notifications/NotificationService');
          await notificationService.default.sendReferralNotification(
            'Referans Kodu Sahibi', // Gerçek uygulamada kullanıcı adı alınacak
            'Yeni Kullanıcı', // Gerçek uygulamada kullanıcı adı alınacak
            rewardDays,
          );
        } catch (importError) {
        devWarn('Referral notification service unavailable (dev mock):', importError?.message);
        }

      // await this.sendNotification(notificationData);

      return {
        success: true,
        notification: notificationData,
      };
    } catch (error) {
      return {
        success: false,
        error: error?.message || String(error),
      };
    }
  }

  /**
   * Kullanıcının referans istatistiklerini getir
   */
  async getUserReferralStats() {
    try {
      // Referans kodunu bul
      const referralCodeQuery = query(
        collection(db, REFERRAL_CONSTANTS.COLLECTIONS.REFERRAL_CODES),
        where('userId', '==', this.userId),
      );
      const referralCodeSnapshot = await getDocs(referralCodeQuery);

      let referralCode = null;
      if (!referralCodeSnapshot.empty) {
        const docSnapshot = referralCodeSnapshot.docs[0];
        referralCode = docSnapshot.data().referralCode;
      }

      // Referans kayıtlarını getir
      const referralsQuery = query(
        collection(db, REFERRAL_CONSTANTS.COLLECTIONS.REFERRALS),
        where('referrerId', '==', this.userId),
      );
      const referralsSnapshot = await getDocs(referralsQuery);

      let totalReferrals = 0;
      let completedReferrals = 0;
      let totalRewardDays = 0;

      referralsSnapshot.forEach((docSnapshot) => {
        const data = docSnapshot.data();
        totalReferrals++;
        if (data.status === REFERRAL_CONSTANTS.STATUS.COMPLETED) {
          completedReferrals++;
          totalRewardDays += data.rewardDays || 0;
        }
      });

      const stats = {
        totalReferrals,
        completedReferrals,
        totalRewardDays,
        referralCode,
      };

      return {
        success: true,
        stats,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Referans kodunun sahibini bul
   */
  async findReferralCodeOwner(referralCode) {
    try {
      const q = query(
        collection(db, REFERRAL_CONSTANTS.COLLECTIONS.REFERRAL_CODES),
        where('referralCode', '==', referralCode),
        where('isActive', '==', true),
      );

      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        const docSnapshot = querySnapshot.docs[0];
        const data = docSnapshot.data();
        return {
          userId: data.userId,
          referralCode: referralCode,
        };
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Referans kaydını bul
   */
  async findReferralRecord(referralCode, referredUserId) {
    try {
      const q = query(
        collection(db, REFERRAL_CONSTANTS.COLLECTIONS.REFERRALS),
        where('referralCode', '==', referralCode),
        where('referredId', '==', referredUserId),
        limit(1),
      );
      const snapshot = await getDocs(q);
      if (snapshot.empty) {
        // Geliştirme ortamında minimal mock döndürerek akışı kırma
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          return new ReferralRecord({
            referrerId: 'dev-mock-referrer',
            referredId: referredUserId,
            referralCode,
            status: REFERRAL_CONSTANTS.STATUS.PENDING,
          });
        }
        return null;
      }
      const docSnap = snapshot.docs[0];
      const data = docSnap.data() || {};
      const createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : new Date();
      const completedAt = data.completedAt?.toDate ? data.completedAt.toDate() : null;
      return new ReferralRecord({
        id: docSnap.id,
        referrerId: data.referrerId,
        referredId: data.referredId,
        referralCode: data.referralCode,
        status: data.status || REFERRAL_CONSTANTS.STATUS.PENDING,
        rewardClaimed: !!data.rewardClaimed,
        subscriptionPurchased: !!data.subscriptionPurchased,
        rewardDays: data.rewardDays || REFERRAL_CONSTANTS.DEFAULT_REWARD_DAYS,
        createdAt,
        completedAt,
      });
    } catch (error) {
      // Geliştirme ortamında akışı kesmeyelim
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        return new ReferralRecord({
          referrerId: 'dev-mock-referrer',
          referredId: referredUserId,
          referralCode,
          status: REFERRAL_CONSTANTS.STATUS.PENDING,
        });
      }
      return null;
    }
  }
}

/**
 * Referans sistemi yardımcı fonksiyonları
 */
export const formatReferralCode = (code) => {
  if (!code || typeof code !== 'string') {
    return '';
  }
  // Kodu daha okunabilir hale getir (örn: ABC123DEF -> ABC-123-DEF)
  return code.replace(/(.{3})(.{3})(.*)/, '$1-$2-$3');
};

export const getReferralRewardMessage = (days) => {
  return `Referans kodunuz ile yeni bir kullanıcı abone oldu. ${days} gün kullanım süresi eklendi!`;
};

export const getReferralStatsMessage = (stats) => {
  if (!stats || stats.totalReferrals === 0) {
    return 'Henüz referansınız yok. Referans kodunuzu paylaşarak kullanım sürenizi uzatın!';
  }

  return `${stats.totalReferrals || 0} referans, ${stats.completedReferrals || 0} tamamlandı. Toplam ${stats.totalRewardDays || 0} gün kazanıldı!`;
};

// Default export for ReferralManager
export { ReferralManager };
