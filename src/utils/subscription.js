// Abonelik sistemi için yardımcı fonksiyonlar
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';

// Dev-only log helpers
const devWarn = (...args) => { if (typeof __DEV__ !== 'undefined' && __DEV__) { try { /* eslint-disable no-console */ console.warn(...args); /* eslint-enable no-console */ } catch {} } };

// Constants
const SUBSCRIPTION_CONSTANTS = {
  COLLECTIONS: {
    SUBSCRIPTIONS: 'subscriptions',
  },
  DEFAULT_PLAN: 'monthly',
  MS_PER_DAY: 24 * 60 * 60 * 1000,
  FREE_PRICE: 0,
};

/**
 * Tüm abonelik planlarında ortak özellikler
 */
const COMMON_FEATURES = [
  'Sınırsız Portföy Ekleme',
  'Sınırsız Talep Ekleme',
  'Talep Havuzu Erişimi',
  '7/24 Destek',
  'Gelişmiş Arama ve Filtreleme',
  'İstatistik ve Raporlama',
  'Öne Çıkan İlan Hakkı',
  'WhatsApp Entegrasyonu',
  'Özel Danışman Desteği',
  'Gelişmiş Pazarlama Araçları',
  'Web Sitesi Entegrasyonu',
  'Eğitim ve Webinarlar',
  'Öncelikli Destek',
  'Özel Raporlama',
];

/**
 * Abonelik planları - Tüm paketlerde aynı özellikler, sadece süre farkı
 */
export const SUBSCRIPTION_PLANS = {
  MONTHLY: {
    id: 'monthly',
    name: 'Aylık',
    price: 199.00,
    currency: 'TRY',
    duration: 30, // gün
    billing: '/ay',
    features: COMMON_FEATURES,
    popular: false,
    discount: 0,
  },
  QUARTERLY: {
    id: 'quarterly',
    name: '3 Aylık',
    price: 500.00,
    currency: 'TRY',
    duration: 90,
    billing: '/3 ay',
    features: COMMON_FEATURES,
    popular: true,
    discount: 16, // 3 aylık %16 indirim
  },
  SEMIANNUAL: {
    id: 'semiannual',
    name: '6 Aylık',
    price: 990.00,
    currency: 'TRY',
    duration: 180,
    billing: '/6 ay',
    features: COMMON_FEATURES,
    popular: false,
    discount: 17, // 6 aylık %17 indirim
  },
  YEARLY: {
    id: 'yearly',
    name: 'Yıllık Pro',
    price: 1599.00,
    currency: 'TRY',
    duration: 365,
    billing: '/yıl',
    features: COMMON_FEATURES,
    popular: false,
    discount: 33, // Yıllık %33 indirim
  },
};

/**
 * Abonelik durumları
 */
export const SUBSCRIPTION_STATUS = {
  ACTIVE: 'active',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
  PENDING: 'pending',
  TRIAL: 'trial',
};

/**
 * Abonelik geçmişi kaydı
 */
export class SubscriptionRecord {
  constructor(data = {}) {
    this.id = data.id || '';
    this.userId = data.userId || '';
    this.planId = String(data.planId || SUBSCRIPTION_CONSTANTS.DEFAULT_PLAN).toLowerCase();
    this.status = data.status || SUBSCRIPTION_STATUS.ACTIVE;
    this.startDate = data.startDate ? new Date(data.startDate) : new Date();
    this.endDate = data.endDate ? new Date(data.endDate) : this.calculateEndDate();
    this.autoRenew = data.autoRenew !== false;
    this.paymentMethod = data.paymentMethod || null;
    this.transactions = data.transactions || [];
    this.features = data.features || [];
    this.createdAt = data.createdAt ? new Date(data.createdAt) : new Date();
    this.updatedAt = data.updatedAt ? new Date(data.updatedAt) : new Date();
  }

  calculateEndDate() {
    const endDate = new Date(this.startDate);
    const plan = SUBSCRIPTION_PLANS[this.planId.toUpperCase()];
    if (plan) {
      endDate.setDate(endDate.getDate() + plan.duration);
    }
    return endDate;
  }

  isActive() {
    return this.status === SUBSCRIPTION_STATUS.ACTIVE &&
           new Date() < this.endDate;
  }

  isExpired() {
    return new Date() >= this.endDate;
  }

  daysUntilExpiry() {
    const now = new Date();
    const diffTime = this.endDate - now;
    return Math.ceil(diffTime / SUBSCRIPTION_CONSTANTS.MS_PER_DAY);
  }

  canUpgrade() {
    return this.isActive() && this.planId !== 'yearly';
  }

  canDowngrade() {
    return this.isActive() && this.planId !== 'monthly';
  }

  getPlan() {
    return SUBSCRIPTION_PLANS[this.planId.toUpperCase()] || SUBSCRIPTION_PLANS.MONTHLY;
  }

  hasFeature(feature) {
    const plan = this.getPlan();
    return plan.features.includes(feature);
  }

  toJSON() {
    return {
      id: this.id,
      userId: this.userId,
      planId: this.planId,
      status: this.status,
      startDate: this.startDate.toISOString(),
      endDate: this.endDate.toISOString(),
      autoRenew: this.autoRenew,
      paymentMethod: this.paymentMethod,
      transactions: this.transactions,
      features: this.features,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
    };
  }
}

/**
 * Abonelik yöneticisi
 */
export class SubscriptionManager {
  constructor(userId) {
    this.userId = userId;
    this.currentSubscription = null;
  }

  /**
   * Mevcut aboneliği alır
   */
  async getCurrentSubscription() {
    try {
      const q = query(
        collection(db, SUBSCRIPTION_CONSTANTS.COLLECTIONS.SUBSCRIPTIONS),
        where('userId', '==', this.userId),
        where('status', '==', SUBSCRIPTION_STATUS.ACTIVE),
        orderBy('createdAt', 'desc'),
        limit(1),
      );

      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        const docSnap = querySnapshot.docs[0];
        const data = docSnap.data() || {};

        this.currentSubscription = new SubscriptionRecord({
          id: docSnap.id,
          ...data,
          startDate: data.startDate?.toDate?.() || new Date(),
          endDate: data.endDate?.toDate?.() || new Date(),
          createdAt: data.createdAt?.toDate?.() || new Date(),
          updatedAt: data.updatedAt?.toDate?.() || new Date(),
        });
      } else {
        this.currentSubscription = null;
      }

      return this.currentSubscription;
    } catch (error) {
      devWarn('getCurrentSubscription error:', error?.message || error);
      return null;
    }
  }

  /**
   * Abonelik planını günceller
   */
  async upgradePlan(newPlanId) {
    try {
      if (!this.currentSubscription) {
        throw new Error('No active subscription found');
      }

      if (!this.currentSubscription.canUpgrade()) {
        throw new Error('Cannot upgrade current plan');
      }

      const newPlan = SUBSCRIPTION_PLANS[String(newPlanId || '').toUpperCase()];
      if (!newPlan) {
        throw new Error('Invalid plan ID');
      }

      // Eski aboneliği iptal et
      const oldSubscriptionRef = doc(db, SUBSCRIPTION_CONSTANTS.COLLECTIONS.SUBSCRIPTIONS, this.currentSubscription.id);
      await updateDoc(oldSubscriptionRef, {
        status: SUBSCRIPTION_STATUS.CANCELLED,
        updatedAt: serverTimestamp(),
      });

      // Yeni abonelik oluştur
      const newSubscriptionData = {
        userId: this.userId,
        planId: newPlan.id,
        status: SUBSCRIPTION_STATUS.ACTIVE,
        startDate: serverTimestamp(),
        endDate: new Date(Date.now() + newPlan.duration * SUBSCRIPTION_CONSTANTS.MS_PER_DAY),
        autoRenew: true,
        paymentMethod: this.currentSubscription.paymentMethod,
        transactions: [...this.currentSubscription.transactions, {
          type: 'upgrade',
          planId: newPlan.id,
          amount: newPlan.price,
          timestamp: new Date().toISOString(),
        }],
        features: newPlan.features,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const newSubscriptionRef = await addDoc(collection(db, SUBSCRIPTION_CONSTANTS.COLLECTIONS.SUBSCRIPTIONS), newSubscriptionData);

      this.currentSubscription = new SubscriptionRecord({
        id: newSubscriptionRef.id,
        ...newSubscriptionData,
        startDate: new Date(),
        endDate: new Date(Date.now() + newPlan.duration * SUBSCRIPTION_CONSTANTS.MS_PER_DAY),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      return {
        success: true,
        subscription: this.currentSubscription,
        message: `${newPlan.name} planına başarıyla yükseltildi`,
      };
    } catch (error) {
      return {
        success: false,
        error: error?.message || String(error),
      };
    }
  }

  /**
   * Aboneliği iptal eder
   */
  async cancelSubscription() {
    try {
      if (!this.currentSubscription) {
        throw new Error('No active subscription found');
      }

      const subscriptionRef = doc(db, SUBSCRIPTION_CONSTANTS.COLLECTIONS.SUBSCRIPTIONS, this.currentSubscription.id);
      await updateDoc(subscriptionRef, {
        status: SUBSCRIPTION_STATUS.CANCELLED,
        autoRenew: false,
        updatedAt: serverTimestamp(),
      });

      this.currentSubscription.status = SUBSCRIPTION_STATUS.CANCELLED;
      this.currentSubscription.autoRenew = false;

      return {
        success: true,
        message: 'Abonelik başarıyla iptal edildi',
        expiresAt: this.currentSubscription.endDate,
      };
    } catch (error) {
      return {
        success: false,
        error: error?.message || String(error),
      };
    }
  }

  /**
   * Aboneliği yeniler
   */
  async renewSubscription() {
    try {
      if (!this.currentSubscription) {
        throw new Error('No active subscription found');
      }

      if (this.currentSubscription.autoRenew) {
        // Otomatik yenileme zaten aktif
        return {
          success: true,
          message: 'Otomatik yenileme zaten aktif',
        };
      }

      const subscriptionRef = doc(db, SUBSCRIPTION_CONSTANTS.COLLECTIONS.SUBSCRIPTIONS, this.currentSubscription.id);
      await updateDoc(subscriptionRef, {
        autoRenew: true,
        status: SUBSCRIPTION_STATUS.ACTIVE,
        updatedAt: serverTimestamp(),
      });

      this.currentSubscription.autoRenew = true;
      this.currentSubscription.status = SUBSCRIPTION_STATUS.ACTIVE;

      return {
        success: true,
        message: 'Otomatik yenileme aktif edildi',
      };
    } catch (error) {
      return {
        success: false,
        error: error?.message || String(error),
      };
    }
  }

  /**
   * Referans ödülü olarak gün ekle
   */
  async addReferralRewardDays(days) {
    try {
      if (!this.currentSubscription) {
        throw new Error('No active subscription found');
      }

      // Mevcut bitiş tarihine gün ekle
      const newEndDate = new Date(this.currentSubscription.endDate);
      newEndDate.setDate(newEndDate.getDate() + days);

      const subscriptionRef = doc(db, SUBSCRIPTION_CONSTANTS.COLLECTIONS.SUBSCRIPTIONS, this.currentSubscription.id);
      await updateDoc(subscriptionRef, {
        endDate: newEndDate,
        updatedAt: serverTimestamp(),
      });

      this.currentSubscription.endDate = newEndDate;
      this.currentSubscription.updatedAt = new Date();

      return {
        success: true,
        addedDays: days,
        newEndDate: newEndDate,
        message: `${days} gün referans ödülü olarak eklendi`,
      };
    } catch (error) {
      return {
        success: false,
        error: error?.message || String(error),
      };
    }
  }

  /**
   * Abonelik özelliklerini kontrol eder
   */
  checkFeatureAccess(feature) {
    if (!this.currentSubscription) {
      return false;
    }
    return this.currentSubscription.hasFeature(feature);
  }

  /**
   * Abonelik özetini getirir
   */
  getSubscriptionSummary() {
    if (!this.currentSubscription) {
      return {
        hasSubscription: false,
        plan: SUBSCRIPTION_PLANS.MONTHLY,
        status: 'none',
        daysUntilExpiry: 0,
      };
    }

    return {
      hasSubscription: true,
      plan: this.currentSubscription.getPlan(),
      status: this.currentSubscription.status,
      daysUntilExpiry: this.currentSubscription.daysUntilExpiry(),
      canUpgrade: this.currentSubscription.canUpgrade(),
      canDowngrade: this.currentSubscription.canDowngrade(),
    };
  }
}

/**
 * Abonelik yardımcı fonksiyonları
 */
export const formatPrice = (price, currency = 'TRY') => {
  if (price === SUBSCRIPTION_CONSTANTS.FREE_PRICE) {
    return 'Ücretsiz';
  }
  return `${price.toFixed(2)} ${currency}`;
};

export const getPlanById = (planId) => {
  return SUBSCRIPTION_PLANS[planId.toUpperCase()] || SUBSCRIPTION_PLANS.MONTHLY;
};





/**
 * Paket karşılaştırma ve indirim hesaplama
 */
export const calculatePackageComparison = () => {
  const plans = Object.values(SUBSCRIPTION_PLANS);

  return plans.map(plan => {
    const monthlyEquivalent = (plan.price / plan.duration) * 30;
    const savings = plan.discount > 0 ?
      `%${plan.discount} tasarruf` :
      'Standart fiyat';

    // Güvenli originalPrice hesaplaması
    let originalPrice = plan.price;
    if (plan.discount && plan.discount > 0) {
      originalPrice = (plan.price / (1 - plan.discount / 100));
    }

    return {
      ...plan,
      monthlyEquivalent,
      savings,
      originalPrice: originalPrice,
    };
  });
};

/**
 * En uygun paketi öner
 */
export const getRecommendedPlan = (usagePattern = 'monthly') => {
  const plans = Object.values(SUBSCRIPTION_PLANS);

  switch (usagePattern) {
    case 'short-term':
      return plans.find(p => p.id === 'monthly');
    case 'medium-term':
      return plans.find(p => p.id === 'quarterly');
    case 'long-term':
      return plans.find(p => p.id === 'yearly');
    default:
      return plans.find(p => p.popular) || plans.find(p => p.id === 'quarterly');
  }
};
