import PushNotification from 'react-native-push-notification';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, DeviceEventEmitter, PermissionsAndroid } from 'react-native';
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

class NotificationService {
  constructor() {
    this.configure();
    this.createDefaultChannels();
  }

  configure = () => {
    // iOS tarafında `react-native-push-notification` native kısmı kurulu değilse
    // (PushNotificationManager yok), configure çağrısı aplikasyona crash attırıyor.
    // Şimdilik iOS'ta local push'u devre dışı bırakıyoruz ki uygulama sorunsuz açılsın.
    if (Platform.OS === 'ios') {
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.log(
          '[NotificationService] iOS: PushNotificationManager yok, local push geçici olarak devre dışı.',
        );
      }
      return;
    }

    // Android için bildirim izni iste (sadece kullanıcı giriş yaptıysa)
    // this.requestNotificationPermission(); // Geçici olarak kapatıldı
    
    // Configure push notifications
    PushNotification.configure({
      onRegister: function (token) {
        if (__DEV__) console.log('Push notification token received:', token);
      },
      onNotification: function (notification) {
        if (__DEV__) {
          console.log('🔔🔔🔔 NOTIFICATION RECEIVED! 🔔🔔🔔');
          console.log('🔔 Notification object:', JSON.stringify(notification, null, 2));
          console.log('🔔 Foreground:', notification.foreground);
          console.log('🔔 UserInteraction:', notification.userInteraction);
          console.log('🔔 Platform:', Platform.OS);
        }
        
        // Her durumda log yaz
        if (__DEV__) console.log('📱 onNotification handler çalıştı!');
        
        // Foreground'da da bildirim göster
        if (notification.foreground && !notification.userInteraction) {
          if (__DEV__) console.log('📱 Uygulama açık - Foreground bildirimi gösteriliyor');
          
          // Android için foreground bildirimini zorla göster
          if (Platform.OS === 'android') {
            if (__DEV__) console.log('🤖 Android foreground bildirimi gönderiliyor...');
            PushNotification.localNotification({
              id: notification.id || 'foreground_' + Date.now(),
              title: notification.title || 'Bildirim',
              message: notification.message || notification.body || 'Yeni bildirim',
              playSound: true,
              soundName: 'default',
              channelId: notification.channelId || 'appointment-reminders',
              vibrate: true,
              vibration: 1000,
              importance: 'high',
              priority: 'high',
              autoCancel: true,
              largeIcon: 'ic_launcher',
              smallIcon: 'ic_notification',
            });
            if (__DEV__) console.log('✅ Android foreground bildirimi gönderildi');
          }
        } else {
          if (__DEV__) console.log('📱 Background bildirimi veya user interaction');
        }
        
        // Execute default action when notification is tapped
        if (notification.finish) {
          if (__DEV__) console.log('🔔 Notification finish called');
          notification.finish('backgroundFetchResultNoData');
        }
      },
      onRegistrationError: function (err) {
        console.error('Push notification registration error:', err.message, err);
      },
      permissions: {
        alert: true,
        badge: true,
        sound: true,
      },
      popInitialNotification: true,
      requestPermissions: Platform.OS === 'ios',
      
      // Foreground bildirimleri için önemli ayarlar
      invokeApp: false, // Uygulamayı açmasın, sadece bildirim göstersin
      onlyAlertOnce: false, // Her bildirimde ses çıkarsın
      ignoreInForeground: false, // Foreground'da da göster
      showWhen: true, // Zaman göster
    });
  };

  requestNotificationPermission = async () => {
    try {
      if (Platform.OS === 'android') {
        // Android 13+ için bildirim izni
        if (Platform.Version >= 33) {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
            {
              title: 'Bildirim İzni',
              message: 'Uygulama bildirimleri göndermek için izin gerekli',
              buttonNeutral: 'Daha Sonra',
              buttonNegative: 'Reddet',
              buttonPositive: 'İzin Ver',
            }
          );
          
          if (granted === PermissionsAndroid.RESULTS.GRANTED) {
            if (__DEV__) console.log('Android notification permission granted');
          } else {
            if (__DEV__) console.log('Android notification permission denied');
          }
        } else {
          if (__DEV__) console.log('Android notification permission granted (below API 33)');
        }
      } else {
        if (__DEV__) console.log('iOS notification permission requested in configure');
      }
    } catch (error) {
      console.error('Bildirim izni hatası:', error);
    }
  };

  createDefaultChannels = () => {
    // iOS'ta channel kavramı yok, sadece Android için
    if (Platform.OS === 'android') {
      if (__DEV__) console.log('🤖 Android kanalları oluşturuluyor...');
      
      const channels = [
        {
          channelId: 'portfolio-reminders',
          channelName: 'Portföy Hatırlatmaları',
          channelDescription: 'Portföy güncelleme hatırlatmaları',
          playSound: true,
          soundName: 'default',
          importance: 4, // IMPORTANCE_HIGH
          vibrate: true,
        },
        {
          channelId: 'request-reminders',
          channelName: 'Talep Hatırlatmaları',
          channelDescription: 'Talep güncelleme hatırlatmaları',
          playSound: true,
          soundName: 'default',
          importance: 4, // IMPORTANCE_HIGH
          vibrate: true,
        },
        {
          channelId: 'referral-notifications',
          channelName: 'Referans Bildirimleri',
          channelDescription: 'Referans sistemi bildirimleri',
          playSound: true,
          soundName: 'default',
          importance: 4, // IMPORTANCE_HIGH
          vibrate: true,
        },
        {
          channelId: 'permission-requests',
          channelName: 'İzin Talepleri',
          channelDescription: 'Portföy paylaşım izin talepleri ve onayları',
          playSound: true,
          soundName: 'default',
          importance: 4, // IMPORTANCE_HIGH
          vibrate: true,
        },
        {
          channelId: 'appointment-reminders',
          channelName: 'Randevu Hatırlatmaları',
          channelDescription: 'Randevu hatırlatma bildirimleri',
          playSound: true,
          soundName: 'default',
          importance: 4, // IMPORTANCE_HIGH
          vibrate: true,
        },
      ];

      // Her kanalı sırayla oluştur (varsa silmeden, kullanıcı ayarlarını koru)
      channels.forEach((channel, index) => {
        if (__DEV__) console.log(`📡 Kanal teyidi: ${channel.channelId}`);
        PushNotification.channelExists(channel.channelId, (exists) => {
          if (exists) {
            if (__DEV__) console.log(`📡 Android channel ${channel.channelId}: VAR (atlandı)`);
            return;
          }
          PushNotification.createChannel(channel, (created) => {
            if (__DEV__) console.log(`📡 Android channel ${channel.channelId}: ${created ? 'OLUŞTU ✅' : 'OLUŞMADI ❌'}`);
          });
        });
        setTimeout(() => {}, 100 * (index + 1));
      });
      
      // Tüm kanallar oluşturulduktan sonra kontrol
      setTimeout(() => {
        if (__DEV__) console.log('🔍 Tüm kanallar kontrol ediliyor...');
        channels.forEach(channel => {
          PushNotification.channelExists(channel.channelId, (exists) => {
            if (__DEV__) console.log(`📋 Final kontrol ${channel.channelId}: ${exists ? 'VAR ✅' : 'YOK ❌'}`);
          });
        });
      }, 2000);
      
    } else {
      if (__DEV__) console.log('🍎 iOS: No channels needed');
    }
  };

  clearAllNotifications = () => {
    // iOS'ta native push kurulu değilse no-op
    if (Platform.OS === 'ios') {
      if (__DEV__) console.log('[NotificationService] iOS: clearAllNotifications (no-op)');
      return;
    }

    PushNotification.cancelAllLocalNotifications();
    if (__DEV__) console.log('All notifications cleared');
  };

  // Basit bildirim gönderme - mevcut sistemle uyumlu
  sendNotification = async (userId, notificationData, channelId = 'portfolio-reminders') => {
    try {
      if (Platform.OS === 'ios') {
        if (__DEV__) {
          console.log(
            '[NotificationService] iOS: sendNotification skip ediliyor (PushNotificationManager yok).',
          );
        }
        // iOS için şimdilik sadece local storage kaydını yapalım, gerçek bildirim göndermeyelim
        await this.saveNotificationToLocalStorage(
          userId,
          notificationData,
          'ios_skipped_' + Date.now(),
        );
        return { success: false, skipped: true, reason: 'ios_push_not_configured' };
      }

      if (__DEV__) {
        console.log('Sending notification to user:', userId);
        console.log('Notification data:', notificationData);
      }
      
      // Önce sadece local notification gönder (Firebase olmadan)
      const crossPlatformConfig = {
        title: notificationData.title,
        message: notificationData.body,
        playSound: true,
        soundName: 'default',
        autoCancel: true,
        invokeApp: true,
        userInfo: notificationData.data,
        data: notificationData.data,
      };
      
      if (Platform.OS === 'android') {
        crossPlatformConfig.channelId = channelId;
        crossPlatformConfig.vibrate = true;
        crossPlatformConfig.vibration = 1000;
        crossPlatformConfig.importance = 'high';
        crossPlatformConfig.priority = 'high';
      } else if (Platform.OS === 'ios') {
        crossPlatformConfig.alertAction = 'view';
        crossPlatformConfig.category = '';
        crossPlatformConfig.badge = 1;
      }
      
      if (__DEV__) console.log(`${Platform.OS.toUpperCase()} notification config:`, crossPlatformConfig);
      PushNotification.localNotification(crossPlatformConfig);
      if (__DEV__) console.log(`${Platform.OS.toUpperCase()} notification sent!`);

      // AsyncStorage'a kaydet (offline erişim için)
      await this.saveNotificationToLocalStorage(userId, notificationData, 'local_' + Date.now());

      if (__DEV__) console.log('Local notification sent successfully');
      return { success: true, notificationId: 'local_' + Date.now() };
      
    } catch (error) {
      console.error('Error sending notification:', error);
      return { success: false, error: error.message };
    }
  };

  // Randevu bildirimi zamanla (20 dakika önce)
  scheduleAppointmentReminder = (appointmentData) => {
    try {
      if (Platform.OS === 'ios') {
        if (__DEV__) {
          console.log(
            '[NotificationService] iOS: scheduleAppointmentReminder skip (PushNotificationManager yok).',
          );
        }
        return { success: false, skipped: true, reason: 'ios_push_not_configured' };
      }

      const { id, title, clientName, date, time } = appointmentData;
      
      // Randevu tarih ve saatini birleştir
      const appointmentDateTime = new Date(date);
      const [hours, minutes] = time.split(':');
      appointmentDateTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
      
      // 20 dakika önce bildirim zamanı
      const reminderTime = new Date(appointmentDateTime.getTime() - (20 * 60 * 1000));
      
      // Geçmiş tarihse bildirim zamanlamama
      if (reminderTime <= new Date()) {
      if (__DEV__) console.log('Randevu geçmiş tarihte, bildirim zamanlanmadı');
        return { success: false, message: 'Geçmiş tarih' };
      }
      
      const notificationData = {
        id: `appointment_${id}`,
        title: '🗓️ Randevu Hatırlatması',
        message: `20 dakika sonra ${clientName} ile randevunuz var: ${title}`,
        date: reminderTime,
        data: {
          type: 'appointment_reminder',
          appointmentId: id,
          appointmentTitle: title,
          clientName: clientName,
          appointmentTime: time,
        }
      };
      
      // Client-side schedule yerine anında bildirim (cihaz uyumluluğu için)
      PushNotification.localNotification({
        id: notificationData.id,
        title: notificationData.title,
        message: notificationData.message,
        channelId: 'appointment-reminders',
        playSound: true,
        soundName: 'default',
        vibrate: true,
        vibration: 1000,
        importance: 'high',
        priority: 'high',
        userInfo: notificationData.data,
        data: notificationData.data,
      });
      
      if (__DEV__) console.log(`Randevu bildirimi zamanlandı: ${reminderTime.toLocaleString('tr-TR')}`);
      return { 
        success: true, 
        scheduledTime: reminderTime.toLocaleString('tr-TR'),
        notificationId: notificationData.id 
      };
      
    } catch (error) {
      console.error('Randevu bildirimi zamanlama hatası:', error);
      return { success: false, error: error.message };
    }
  };

  // Randevu bildirimi iptal et
  cancelAppointmentReminder = (appointmentId) => {
    try {
      if (Platform.OS === 'ios') {
        if (__DEV__) {
          console.log(
            '[NotificationService] iOS: cancelAppointmentReminder skip (PushNotificationManager yok).',
          );
        }
        return { success: false, skipped: true, reason: 'ios_push_not_configured' };
      }

      const notificationId = `appointment_${appointmentId}`;
      PushNotification.cancelLocalNotifications({ id: notificationId });
      console.log(`Randevu bildirimi iptal edildi: ${notificationId}`);
      return { success: true };
    } catch (error) {
      console.error('Randevu bildirimi iptal hatası:', error);
      return { success: false, error: error.message };
    }
  };

  // Test için randevu bildirimi (3 saniye sonra)
  scheduleTestAppointmentReminder = () => {
    try {
      if (Platform.OS === 'ios') {
        if (__DEV__) {
          console.log(
            '[NotificationService] iOS: scheduleTestAppointmentReminder skip (PushNotificationManager yok).',
          );
        }
        return {
          success: false,
          skipped: true,
          reason: 'ios_push_not_configured',
        };
      }

      const testTime = new Date();
      
      if (__DEV__) {
        console.log('🔥 TEST BAŞLIYOR - 3 saniye sonra bildirim gelecek');
        console.log('⏰ Test zamanı:', testTime.toLocaleString('tr-TR'));
      }
      
      const notificationData = {
        id: 'test_appointment_' + Date.now(),
        title: '🗓️ Test Randevu Hatırlatması',
        message: 'Bu bir test bildirimidir. Randevu sistemi çalışıyor!',
        date: testTime,
        data: {
          type: 'test_appointment_reminder',
          test: true,
        }
      };
      
      if (__DEV__) console.log('📤 Bildirim config:', notificationData);
      
      // Anında gösterim
      PushNotification.localNotification({
        id: notificationData.id,
        title: notificationData.title,
        message: notificationData.message,
        channelId: 'appointment-reminders',
        playSound: true,
        soundName: 'default',
        vibrate: true,
        vibration: 1000,
        importance: 'high',
        priority: 'high',
        userInfo: notificationData.data,
        data: notificationData.data,
      });
      
      if (__DEV__) console.log(`✅ Test randevu bildirimi gönderildi: ${testTime.toLocaleString('tr-TR')}`);
      return { 
        success: true, 
        scheduledTime: testTime.toLocaleString('tr-TR'),
        message: 'Anında test bildirimi gönderildi!'
      };
      
    } catch (error) {
      console.error('❌ Test randevu bildirimi hatası:', error);
      return { success: false, error: error.message };
    }
  };

  // AsyncStorage'a bildirim kaydetme helper fonksiyonu
  saveNotificationToLocalStorage = async (userId, notificationData, notificationId) => {
    try {
      if (__DEV__) console.log('Saving notification to localStorage for user:', userId);
      
      // Kullanıcı bazlı key kullan
      const userNotificationsKey = `notifications_${userId}`;
      
      // Mevcut bildirimleri al
      const existingNotifications = await AsyncStorage.getItem(userNotificationsKey);
      let notifications = [];

      if (existingNotifications) {
        notifications = JSON.parse(existingNotifications);
      }

      // Yeni bildirimi ekranın beklediği formatta ekle
      const newNotification = {
        id: notificationId,
        type: notificationData.data?.type || notificationData.type || 'generic',
        title: notificationData.title,
        message: notificationData.body || notificationData.message || '',
        timestamp: Date.now(),
        isRead: false,
        data: notificationData.data || {},
        userId: userId,
      };

      notifications.unshift(newNotification); // En başa ekle (yeni bildirimi en üste)
      
      // Maksimum 100 bildirim tut
      if (notifications.length > 100) {
        notifications = notifications.slice(0, 100);
      }

      // Kullanıcı bazlı AsyncStorage'a kaydet
      await AsyncStorage.setItem(userNotificationsKey, JSON.stringify(notifications));
      // Rozetleri anında güncelle
      DeviceEventEmitter.emit('notifications:updated');
      if (__DEV__) console.log('Notification saved to localStorage for user:', userId, newNotification.id);
      
    } catch (error) {
      console.error('Error saving notification to localStorage:', error);
    }
  };

  // Unread notification count - mevcut sistemle uyumlu
  getUnreadNotificationCount = async (userId) => {
    try {
      const userNotificationsKey = `notifications_${userId}`;
      const stored = await AsyncStorage.getItem(userNotificationsKey);
      
      if (stored) {
        const notifications = JSON.parse(stored);
        return notifications.filter(n => (typeof n.isRead === 'boolean' ? !n.isRead : !n.read)).length;
      }
      
      return 0;
    } catch (error) {
      console.error('Error getting unread count:', error);
      return 0;
    }
  };
}

const notificationService = new NotificationService();

// Named export for sendNotification function
export const sendNotification = notificationService.sendNotification;

export default notificationService;