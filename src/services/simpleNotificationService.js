import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, DeviceEventEmitter } from 'react-native';

class SimpleNotificationService {
  constructor() {
    this.MAX_NOTIFICATIONS = 100; // Maksimum bildirim sayısı
    this.TITLE_MAX_LENGTH = 20; // Başlık maksimum uzunluğu
    this.STORAGE_KEYS = {
      notifications: 'notifications',
    };
  }

  // Portföy için bildirim gönder
  sendPortfolioReminder = async (portfolioId, portfolioTitle, userName, dayCount) => {
    await this.sendReminder(portfolioId, portfolioTitle, userName, dayCount, 'portfolio');
  };

  // Talep için bildirim gönder
  sendRequestReminder = async (requestId, requestTitle, userName, dayCount) => {
    await this.sendReminder(requestId, requestTitle, userName, dayCount, 'request');
  };

  // Generic reminder send function
  sendReminder = async (itemId, itemTitle, userName, dayCount, type) => {
    // Parametre korumaları
    if (!itemId || !type) {
      return;
    }
    const safeTitle = typeof itemTitle === 'string' ? itemTitle : String(itemTitle || '');
    const safeUser = typeof userName === 'string' ? userName : 'Kullanıcı';
    const safeDay = Number.isFinite(Number(dayCount)) ? Number(dayCount) : 0;

    const message = this.getMessage(safeTitle, safeUser, safeDay, type);
    const title = type === 'portfolio' ? 'Portföy Hatırlatması' : 'Talep Hatırlatması';

    // Basit alert ile bildirim göster
    Alert.alert(
      title,
      message,
      [
        {
          text: 'Tamam',
          onPress: () => {},
        },
      ],
    );

    // Bildirim gönderildiğini kaydet
    await this.saveNotificationSent(itemId, type, safeDay);

    // Bildirimi notifications listesine ekle
    await this.addNotificationToList(type, safeTitle, message, safeDay, itemId);
  };

  // Portföy mesajını oluştur
  getPortfolioMessage = (title, userName, dayCount) => {
    return this.getMessage(title, userName, dayCount, 'portfolio');
  };

  // Talep mesajını oluştur
  getRequestMessage = (title, userName, dayCount) => {
    return this.getMessage(title, userName, dayCount, 'request');
  };

  // Generic message generator
  getMessage = (title, userName, dayCount, type) => {
    const safeTitle = typeof title === 'string' ? title : String(title || '');
    const safeUser = typeof userName === 'string' ? userName : 'Kullanıcı';
    const shortTitle = safeTitle.length > this.TITLE_MAX_LENGTH
      ? safeTitle.substring(0, this.TITLE_MAX_LENGTH) + '...'
      : safeTitle;

    const itemType = type === 'portfolio' ? 'portföy' : 'talep';
    const poolType = type === 'portfolio' ? 'portföy havuzundan' : 'talep havuzundan';

    if (Number(dayCount) === 45) {
      return `Hey ${safeUser} Merhaba, ${shortTitle} ${itemType}ün 45 gündür güncellenmedi. ${itemType.charAt(0).toUpperCase() + itemType.slice(1)} ${poolType} gizlendi. Lütfen kontrol et.`;
    }

    return `Hey ${safeUser} Merhaba, ${shortTitle} ${itemType}ünü ${Number(dayCount)} gündür güncellemedin. Hatırlatmak istedim. Lütfen kontrol et.`;
  };

  // Bildirimi notifications listesine ekle
  addNotificationToList = async (type, title, message, dayCount, itemId) => {
    try {
      const notification = {
        id: `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
        type: type,
        title: `${type === 'portfolio' ? 'Portföy' : 'Talep'} Hatırlatması (${dayCount}. gün)`,
        message: message,
        timestamp: Date.now(),
        isRead: false,
        dayCount: dayCount,
        itemId: itemId, // Hangi portföy/talep için olduğunu bilmek için
      };

      // Mevcut bildirimleri al
      const existingNotifications = await AsyncStorage.getItem(this.STORAGE_KEYS.notifications);
      let notifications = [];

      if (existingNotifications) {
        notifications = JSON.parse(existingNotifications);
      }

      // Yeni bildirimi ekle
      notifications.unshift(notification);

      // Maksimum bildirim sayısını kontrol et
      if (notifications.length > this.MAX_NOTIFICATIONS) {
        notifications = notifications.slice(0, this.MAX_NOTIFICATIONS);
      }

      // Bildirimleri kaydet
      await AsyncStorage.setItem(this.STORAGE_KEYS.notifications, JSON.stringify(notifications));
      // Rozetleri anında güncelle
      DeviceEventEmitter.emit('notifications:updated');
    } catch (error) {
      // Bildirim listeye eklenirken hata - silent handling
    }
  };

  // Bildirim gönderildiğini kaydet
  saveNotificationSent = async (itemId, type, dayCount) => {
    try {
      const key = `${type}_notification_${itemId}_${dayCount}`;
      const timestamp = Date.now();
      await AsyncStorage.setItem(key, JSON.stringify({ timestamp, dayCount }));
    } catch (error) {
      // Bildirim kaydedilemedi - silent handling
    }
  };

  // Bildirim gönderilip gönderilmediğini kontrol et
  checkNotificationSent = async (itemId, type, dayCount) => {
    try {
      const key = `${type}_notification_${itemId}_${dayCount}`;
      const value = await AsyncStorage.getItem(key);
      return value !== null;
    } catch (error) {
      return false;
    }
  };

  // Tüm bildirimleri temizle
  clearAllNotifications = async () => {
    try {
      // Notifications listesini temizle
      await AsyncStorage.removeItem(this.STORAGE_KEYS.notifications);

      // Eski notification key'lerini de temizle
      const keys = await AsyncStorage.getAllKeys();
      const notificationKeys = keys.filter(key => key.includes('_notification_'));
      await AsyncStorage.multiRemove(notificationKeys);
    } catch (error) {
      // Bildirimler temizlenirken hata - silent handling
    }
  };

  // Belirli bir bildirimi temizle
  cancelNotification = async (itemId, type, dayCount) => {
    try {
      const key = `${type}_notification_${itemId}_${dayCount}`;
      await AsyncStorage.removeItem(key);
    } catch (error) {
      // Bildirim temizlenirken hata - silent handling
    }
  };
}

export default new SimpleNotificationService();
