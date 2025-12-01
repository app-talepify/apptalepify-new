import AsyncStorage from '@react-native-async-storage/async-storage';
import simpleNotificationService from './simpleNotificationService';

class ReminderScheduler {
  constructor() {
    this.checkInterval = null;
    this.REMINDER_DAYS = [10, 20, 30, 45]; // Bildirim günleri
    this.CHECK_INTERVAL = 60 * 60 * 1000; // 1 saat
    this.STORAGE_KEYS = {
      portfolios: 'portfolios',
      requests: 'requests',
    };
    this.startScheduler();
  }

  // Zamanlayıcıyı başlat
  startScheduler = () => {
    // İdempotent: ikinci kez başlatma
    if (this.checkInterval) {
      return;
    }
    // Her 1 saatte bir kontrol et
    this.checkInterval = setInterval(() => {
      this.checkAllReminders();
    }, this.CHECK_INTERVAL);

    // İlk kontrolü hemen yap
    this.checkAllReminders();
  };

  // Zamanlayıcıyı durdur
  stopScheduler = () => {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  };

  // Tüm hatırlatmaları kontrol et
  checkAllReminders = async () => {
    try {
      await this.checkPortfolioReminders();
      await this.checkRequestReminders();
    } catch (error) {
      // Hatırlatma kontrolü sırasında hata
    }
  };

  // Portföy hatırlatmalarını kontrol et
  checkPortfolioReminders = async () => {
    await this.checkReminders('portfolio', this.checkPortfolioReminder);
  };

  // Talep hatırlatmalarını kontrol et
  checkRequestReminders = async () => {
    await this.checkReminders('request', this.checkRequestReminder);
  };

  // Generic reminder check function
  checkReminders = async (type, checkFunction) => {
    try {
      const items = await this.getItemsFromStorage(type);

      for (const item of items) {
        if (item.isPublished) {
          await checkFunction(item);
        }
      }
    } catch (error) {
      // Reminder check error - silent handling
    }
  };

  // Portföy hatırlatmasını kontrol et
  checkPortfolioReminder = async (portfolio) => {
    await this.checkItemReminder(portfolio, 'portfolio', simpleNotificationService.sendPortfolioReminder);
  };

  // Talep hatırlatmasını kontrol et
  checkRequestReminder = async (request) => {
    await this.checkItemReminder(request, 'request', simpleNotificationService.sendRequestReminder);
  };

  // Generic item reminder check
  checkItemReminder = async (item, type, sendNotificationFunction) => {
    // Koruyucu: gerekli alanlar
    if (!item || !item.id || !item.updatedAt) {
      return;
    }
    const daysSinceUpdate = this.calculateDaysSinceUpdate(item.updatedAt);

    for (const dayCount of this.REMINDER_DAYS) {
      if (daysSinceUpdate >= dayCount) {
        const notificationSent = await simpleNotificationService.checkNotificationSent(
          item.id,
          type,
          dayCount,
        );

        if (!notificationSent) {
          // Bildirim gönder
          await sendNotificationFunction(
            item.id,
            item.title,
            item.userName || 'Kullanıcı',
            dayCount,
          );

          // 45. günde item'ı gizle
          if (dayCount === 45) {
            await this.hideItem(item.id, type);
          }
        }
      }
    }
  };

  // Güncelleme tarihinden bu yana geçen gün sayısını hesapla
  calculateDaysSinceUpdate = (updatedAt) => {
    const updateDate = new Date(updatedAt);
    const currentDate = new Date();
    const timeDiff = currentDate.getTime() - updateDate.getTime();
    const daysDiff = Math.floor(timeDiff / (1000 * 3600 * 24));
    // Geçersiz tarih durumunda NaN yerine 0 döndür (bildirim tetiklenmesin)
    return Number.isFinite(daysDiff) ? daysDiff : 0;
  };

  // Portföyü gizle
  hidePortfolio = async (portfolioId) => {
    await this.hideItem(portfolioId, 'portfolio');
  };

  // Talebi gizle
  hideRequest = async (requestId) => {
    await this.hideItem(requestId, 'request');
  };

  // Generic item hide function
  hideItem = async (itemId, type) => {
    try {
      // Firestore'da item'ı gizle
      // Bu kısım firestore servisinizde implement edilecek

      // Local storage'da da güncelle
      const items = await this.getItemsFromStorage(type);
      const updatedItems = items.map(item =>
        item.id === itemId ? { ...item, isPublished: false } : item,
      );
      await AsyncStorage.setItem(this.STORAGE_KEYS[type + 's'], JSON.stringify(updatedItems));
    } catch (error) {
      // Item gizlenirken hata - silent handling
    }
  };

  // Storage'dan portföyleri al
  getPortfoliosFromStorage = async () => {
    return await this.getItemsFromStorage('portfolio');
  };

  // Storage'dan talepleri al
  getRequestsFromStorage = async () => {
    return await this.getItemsFromStorage('request');
  };

  // Generic storage getter
  getItemsFromStorage = async (type) => {
    try {
      const items = await AsyncStorage.getItem(this.STORAGE_KEYS[type + 's']);
      if (!items) return [];
      const parsed = JSON.parse(items);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  };

  // Yeni portföy eklendiğinde çağrılır
  addPortfolio = async (portfolio) => {
    await this.addItem(portfolio, 'portfolio');
  };

  // Yeni talep eklendiğinde çağrılır
  addRequest = async (request) => {
    await this.addItem(request, 'request');
  };

  // Generic item add function
  addItem = async (item, type) => {
    try {
      const items = await this.getItemsFromStorage(type);
      items.push(item);
      await AsyncStorage.setItem(this.STORAGE_KEYS[type + 's'], JSON.stringify(items));
    } catch (error) {
      // Item eklenirken hata - silent handling
    }
  };

  // Portföy güncellendiğinde çağrılır
  updatePortfolio = async (portfolioId, updatedData) => {
    await this.updateItem(portfolioId, updatedData, 'portfolio');
  };

  // Talep güncellendiğinde çağrılır
  updateRequest = async (requestId, updatedData) => {
    await this.updateItem(requestId, updatedData, 'request');
  };

  // Generic item update function
  updateItem = async (itemId, updatedData, type) => {
    try {
      const items = await this.getItemsFromStorage(type);
      const updatedItems = items.map(item =>
        item.id === itemId ? { ...item, ...updatedData, updatedAt: new Date().toISOString() } : item,
      );
      await AsyncStorage.setItem(this.STORAGE_KEYS[type + 's'], JSON.stringify(updatedItems));
    } catch (error) {
      // Item güncellenirken hata - silent handling
    }
  };

  // Test için manuel hatırlatma kontrolü
  manualCheck = () => {
    this.checkAllReminders();
  };
}

export default new ReminderScheduler();
