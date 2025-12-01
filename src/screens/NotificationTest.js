import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
  Linking,
  TextInput,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../theme/theme';
import simpleNotificationService from '../services/simpleNotificationService';
import notificationService from '../services/notificationService';
import { API_BASE_URL } from '@env';
import app from '../firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getRequest, updateRequest } from '../services/firestore';
import { auth } from '../firebase';

const NotificationTest = () => {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [testResults, setTestResults] = useState([]);
  const [testDemandId, setTestDemandId] = useState('');
  const [testEntityType, setTestEntityType] = useState('demand'); // 'demand' | 'request'

  const addTestResult = (message) => {
    setTestResults((prev) => [
      ...prev,
      {
        id: Date.now() + Math.random(),
        message,
        timestamp: new Date().toLocaleTimeString(),
      },
    ]);
  };

  // Helper: anında bildirim gönder ve local kaydı garanti et
  const sendDemo = async ({ type, title, body, channelId, actionType, actionId }) => {
    try {
      const uid = user?.uid || 'test-user';
      const data = { type, actionType, actionId };
      const res = await notificationService.sendNotification(uid, { title, body, data }, channelId || 'appointment-reminders');
      addTestResult(`✅ Gönderildi [${type}] (${channelId || 'appointment-reminders'}): ${res?.notificationId || 'local'}`);
    } catch (e) {
      addTestResult(`❌ Gönderim hatası [${type}]: ${e.message}`);
    }
  };

  const sendPersistedDemo = async ({ type, title, body, actionType, actionId }) => {
    try {
      if (!API_BASE_URL) {
        addTestResult('❌ API_BASE_URL tanımsız. .env dosyasını kontrol edin ve Metro\'yu reset-cache ile yeniden başlatın.');
        return;
      }
      addTestResult(`➡️ Server persist çağrısı: ${API_BASE_URL}/notifications/test-persist`);
      const token = await auth.currentUser?.getIdToken?.();
      if (!token && !__DEV__) {
        addTestResult('❌ Kimlik doğrulama gerekli (idToken yok). Lütfen giriş yapın.');
        return;
      }
      const resp = await fetch(`${API_BASE_URL}/notifications/test-persist`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token || (__DEV__ ? 'mock-id-token-for-development' : '')}`,
        },
        body: JSON.stringify({
          uid: user?.uid || null,
          title,
          body,
          type,
          action: actionType ? { type: actionType, id: actionId } : null,
        }),
      });
      let json = null;
      try { json = await resp.json(); } catch (e) { /* ignore */ }
      if (!resp.ok || !json?.ok) {
        const text = json?.error ? String(json.error) : `HTTP ${resp.status}`;
        addTestResult(`❌ Server persist hata: ${text}`);
        return;
      }
      addTestResult(`✅ Kalıcı bildirim yazıldı ve push gönderildi [${type}]`);
    } catch (e) {
      addTestResult(`❌ Kalıcı bildirim hatası [${type}]: ${e.message}`);
    }
  };

  const testImmediateNotification = async () => {
    try {
      addTestResult('🚨 Hemen bildirim testi başlıyor...');
      await sendDemo({
        type: 'generic',
        title: '🚨 Hemen Test Bildirimi',
        body: 'Bu bildirim hemen geldi! Sistem çalışıyor.',
        channelId: 'appointment-reminders',
      });
    } catch (error) {
      addTestResult(`❌ Hemen bildirim hatası: ${error.message}`);
    }
  };

  const testAppointmentReminder = async () => {
    try {
      addTestResult('🗓️ Randevu bildirimi (20 dk kala) simülasyon...');
      await sendDemo({
        type: 'agenda',
        title: '🗓️ Randevu Hatırlatması',
        body: 'Randevunuza 20 dakika kaldı.',
        channelId: 'appointment-reminders',
        actionType: 'open_agenda',
      });
    } catch (error) {
      addTestResult(`❌ Randevu bildirimi test hatası: ${error.message}`);
    }
  };

  const testPortfolioNotification = async () => {
    try {
      const pid = 'test-portfolio-' + Date.now();
      await sendDemo({
        type: 'portfolio',
        title: 'Portföy Hatırlatma (10. gün)',
        body: 'Portföyünüzü güncellemeyi unutmayın.',
        channelId: 'portfolio-reminders',
        actionType: 'open_portfolio',
        actionId: pid,
      });
    } catch (error) {
      addTestResult(`❌ Portföy bildirimi hatası: ${error.message}`);
    }
  };

  const testServerNotification = async () => {
    try {
      if (!user?.uid) {
        addTestResult('❌ Giriş yapılmamış. Sunucu bildirimi için kullanıcı gerekli.');
        return;
      }
      await sendDemo({
        type: 'server_test',
        title: 'Sunucu Test Bildirimi',
        body: 'Bu bir test bildirimidir.',
        channelId: 'portfolio-reminders',
      });
    } catch (error) {
      addTestResult(`❌ Sunucu bildirimi istisnası: ${error.message}`);
    }
  };

  const testDirectNotification = async () => {
    try {
      addTestResult('⚡ En basit test başlıyor...');
      await sendDemo({
        type: 'generic',
        title: '⚡ En Basit Test',
        body: 'Bu en basit bildirimdir! (anında)',
        channelId: 'appointment-reminders',
      });
    } catch (error) {
      addTestResult(`❌ En basit test hatası: ${error.message}`);
    }
  };

  const testImmediateShowNow = async () => {
    try {
      addTestResult('🔔 Anında (schedule olmadan) bildirim gösteriliyor...');
      await sendDemo({
        type: 'generic',
        title: '🔔 Anında Bildirim',
        body: 'Schedule olmadan anında gösterim',
        channelId: 'appointment-reminders',
      });
    } catch (error) {
      addTestResult(`❌ Anında bildirim hatası: ${error.message}`);
    }
  };

  const testPortfolioChannelSchedule = async () => {
    try {
      addTestResult('📣 Portfolio kanalıyla anında test...');
      await sendDemo({
        type: 'portfolio',
        title: '📣 Portfolio Kanal Testi',
        body: 'portfolio-reminders anında bildirim',
        channelId: 'portfolio-reminders',
        actionType: 'open_portfolio',
        actionId: 'demo-portfolio',
      });
    } catch (error) {
      addTestResult(`❌ Portfolio kanalı test hatası: ${error.message}`);
    }
  };

  const testPortfolioImmediate = async () => {
    try {
      addTestResult('📣 Portfolio kanalıyla anında gösterim...');
      await sendDemo({
        type: 'portfolio',
        title: '📣 Portfolio Anında',
        body: 'portfolio-reminders kanalında anında bildirim',
        channelId: 'portfolio-reminders',
        actionType: 'open_portfolio',
        actionId: 'demo-portfolio',
      });
    } catch (error) {
      addTestResult(`❌ Portfolio anında bildirim hatası: ${error.message}`);
    }
  };

  // Genişletilmiş testler
  const testPortfolioPhase = async (phase) => {
    const pid = 'pf-' + phase + '-' + Date.now();
    const map = {
      d10: 'Portföyünüzü güncellemeyi unutmayın (10. gün).',
      d20: 'Portföyünüz 20. gününde. Güncelleme önerilir.',
      d30: 'Portföy 30. gün: güncelleme yapmanız önerilir.',
      d40: '30 gün güncellenmediği için portföy yayından kaldırıldı.',
      d60: 'Portföy 60. gününde. 15 gün içinde silinecek.',
      d75: 'Portföy 75. gün sonunda silindi.',
    };
    await sendDemo({
      type: 'portfolio',
      title: `Portföy (${phase})`,
      body: map[phase] || `Portföy bildirimi (${phase})`,
      channelId: 'portfolio-reminders',
      actionType: 'open_portfolio',
      actionId: pid,
    });
  };

  const testDemandPhase = async (phase) => {
    const did = 'dm-' + phase + '-' + Date.now();
    const map = {
      d10: 'Talebinizi güncel tutun (10. gün).',
      d20: 'Talep 20. gün yayından kaldırıldı.',
      d30: 'Talep 30. gün sonunda silindi.',
    };
    await sendDemo({
      type: 'demand',
      title: `Talep (${phase})`,
      body: map[phase] || `Talep bildirimi (${phase})`,
      channelId: 'request-reminders',
      actionType: 'open_demand',
      actionId: did,
    });
  };

  const testSubscriptionPhase = async (plan, day) => {
    const msg = plan === 'trial'
      ? `${day} gün sonra denemeniz sona eriyor.`
      : `${day} gün sonra aboneliğiniz bitiyor.`;
    await sendDemo({
      type: plan === 'trial' ? 'trial' : 'subscription',
      title: plan === 'trial' ? 'Deneme Sürümü' : 'Abonelik',
      body: msg,
      channelId: 'referral-notifications',
      actionType: 'open_subscriptions',
    });
  };

  const checkAndroidSettings = () => {
    try {
      addTestResult('🤖 Android ayarları kontrol ediliyor...');

      if (Platform.OS === 'android') {
        addTestResult('📱 Android Bildirim Ayarları Kontrol Listesi:');
        addTestResult('1️⃣ Ayarlar > Uygulamalar > TalepifyApp');
        addTestResult('2️⃣ Bildirimler > AÇIK olmalı');
        addTestResult('3️⃣ Randevu Hatırlatmaları kanalı > AÇIK olmalı');
        addTestResult('4️⃣ Ses, Titreşim, Ekranda göster > AÇIK');
        addTestResult('5️⃣ Rahatsız Etme modu > KAPALI olmalı');
        addTestResult('6️⃣ Pil optimizasyonu > TalepifyApp için KAPALI');

        // Uygulama ayarlarını açmaya çalış
        setTimeout(() => {
          addTestResult('🔧 Uygulama ayarlarını açmaya çalışıyor...');
          Linking.openSettings().catch(() => {
            addTestResult('❌ Ayarlar açılamadı - Manuel olarak kontrol et');
          });
        }, 1000);

      } else {
        addTestResult('🍎 iOS ayarları kontrol et:');
        addTestResult('1️⃣ Ayarlar > Bildirimler > TalepifyApp');
        addTestResult('2️⃣ Bildirimlere İzin Ver > AÇIK');
        addTestResult('3️⃣ Sesler, Rozetler, Bannerlar > AÇIK');
      }

    } catch (error) {
      addTestResult(`❌ Ayar kontrolü hatası: ${error.message}`);
    }
  };

  const clearNotifications = async () => {
    try {
      simpleNotificationService.clearAllNotifications();
      notificationService.clearAllNotifications();
      addTestResult('✅ Tüm bildirimler temizlendi');
    } catch (error) {
      addTestResult(`❌ Bildirim temizleme hatası: ${error.message}`);
    }
  };

  const clearTestResults = () => {
    setTestResults([]);
  };

  // Callable: Talep/Request akışı test (15/20/30/45)
  const callPrimeAndProcess = async (phase) => {
    try {
      const id = (testDemandId || '').trim() || 'vMqlno7hK5bkPxCR8TWZ';
      const functions = getFunctions(app, 'europe-west1');
      const fn = httpsCallable(functions, 'testPrimeAndProcessEntity');
      await fn({ type: testEntityType, id, phase });
      addTestResult(`✅ ${testEntityType} ${phase} primed+processed (id=${id})`);
    } catch (e) {
      addTestResult(`❌ Prime+process hata: ${e.message}`);
    }
  };

  // Talep sayaç reset testi: updatedAt ve nextActionAt kontrolü
  const testRequestResetTimers = async () => {
    try {
      if (testEntityType !== 'request') {
        addTestResult('ℹ️ Lütfen türü "request" seçin.');
        return;
      }
      const id = (testDemandId || '').trim();
      if (!id) {
        addTestResult('ℹ️ Lütfen bir talep (request) ID girin.');
        return;
      }
      const before = await getRequest(id);
      const bUpdated = before?.updatedAt ? new Date(before.updatedAt).toLocaleString('tr-TR') : '—';
      const bNext = before?.nextActionAt ? new Date(before.nextActionAt).toLocaleString('tr-TR') : '—';
      addTestResult(`↩️ Önce: updatedAt=${bUpdated} | nextActionAt=${bNext}`);

      // Boş updateData ile sadece zaman/phase alanlarını resetle (server tarafı hallediyor)
      await updateRequest(id, {});

      const after = await getRequest(id);
      const aUpdated = after?.updatedAt ? new Date(after.updatedAt).toLocaleString('tr-TR') : '—';
      const aNext = after?.nextActionAt ? new Date(after.nextActionAt).toLocaleString('tr-TR') : '—';
      addTestResult(`✅ Sonra: updatedAt=${aUpdated} | nextActionAt=${aNext}`);
    } catch (e) {
      addTestResult(`❌ Sayaç reset testi hata: ${e.message}`);
    }
  };

  // Prod buildlerde bu test ekranını dev olmayan ortamlarda gizle
  if (!__DEV__) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Bildirim Test Ekranı</Text>
        </View>
        <ScrollView style={styles.scrollView}>
          <View style={styles.testSection}>
            <Text style={styles.sectionTitle}>Bu ekran yalnızca geliştirme modunda kullanılabilir.</Text>
            <Text style={{ color: theme.colors.text, textAlign: 'center' }}>
              Production sürümünde dev test araçları kapalıdır.
            </Text>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Bildirim Sistemi Test</Text>
      </View>
      <ScrollView style={styles.scrollView} contentContainerStyle={{ paddingBottom: (insets?.bottom || 0) + 84 }}>
        <View style={styles.testSection}>
          <Text style={styles.sectionTitle}>Bildirim Gönderim Testleri</Text>

          <TouchableOpacity style={[styles.testButton, {backgroundColor: '#FF4444'}]} onPress={testImmediateNotification}>
            <Text style={styles.testButtonText}>🚨 Hemen Bildirim Testi (1sn)</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.testButton, {backgroundColor: '#9B59B6'}]} onPress={testAppointmentReminder}>
            <Text style={styles.testButtonText}>🗓️ Randevu Bildirimi Test (3sn)</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.testButton, {backgroundColor: '#3498DB'}]} onPress={testPortfolioNotification}>
            <Text style={styles.testButtonText}>📁 Portföy Bildirimi Test</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.testButton, {backgroundColor: '#E67E22'}]} onPress={testServerNotification}>
            <Text style={styles.testButtonText}>🌐 Sunucu Bildirimi Test</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.testButton, {backgroundColor: '#FF6B6B'}]} onPress={testDirectNotification}>
            <Text style={styles.testButtonText}>⚡ En Basit Test (1sn)</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.testButton, {backgroundColor: '#2ECC71'}]} onPress={testImmediateShowNow}>
            <Text style={styles.testButtonText}>🔔 Anında Göster (schedule yok)</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.testButton, {backgroundColor: '#1ABC9C'}]} onPress={testPortfolioChannelSchedule}>
            <Text style={styles.testButtonText}>📣 Portfolio Kanal (5sn schedule)</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.testButton, {backgroundColor: '#16A085'}]} onPress={testPortfolioImmediate}>
            <Text style={styles.testButtonText}>📣 Portfolio Kanal (anında)</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.testSection}>
          <Text style={styles.sectionTitle}>Talep/Request Direkt Bildirim (Client)</Text>
          <TouchableOpacity
            style={[styles.testButton, { backgroundColor: '#8E44AD' }]}
            onPress={() => sendDemo({
              type: 'demand',
              title: 'Talep Havuz Güncellemesi',
              body: 'Talebiniz havuzda yayından kaldırılmıştır.',
              actionType: 'open_demand',
              actionId: (testDemandId || '').trim() || 'vMqlno7hK5bkPxCR8TWZ',
            })}
          >
            <Text style={styles.testButtonText}>▶ d15 (havuzdan kaldırıldı)</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.testButton, { backgroundColor: '#8E44AD' }]}
            onPress={() => sendDemo({
              type: 'demand',
              title: 'Talep Süresi Doldu',
              body: 'Talebinizin süresi dolmuştur. Süresi geçen taleplerden kontrol edebilirsiniz.',
              actionType: 'open_demand',
              actionId: (testDemandId || '').trim() || 'vMqlno7hK5bkPxCR8TWZ',
            })}
          >
            <Text style={styles.testButtonText}>▶ d20 (süresi doldu)</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.testButton, { backgroundColor: '#8E44AD' }]}
            onPress={() => sendDemo({
              type: 'demand',
              title: 'Talep Sonlandı',
              body: 'Talebiniz sonlanmıştır. Geçmiş taleplerden görüntüleyebilirsiniz. 15 gün içinde tamamen silinecektir.',
              actionType: 'open_demand',
              actionId: (testDemandId || '').trim() || 'vMqlno7hK5bkPxCR8TWZ',
            })}
          >
            <Text style={styles.testButtonText}>▶ d30 (sonlandı)</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.testButton, { backgroundColor: '#8E44AD' }]}
            onPress={() => sendDemo({
              type: 'demand',
              title: 'Talep Silindi',
              body: 'Talebiniz ve ilgili veriler tamamen silinmiştir.',
              actionType: 'open_demand',
              actionId: (testDemandId || '').trim() || 'vMqlno7hK5bkPxCR8TWZ',
            })}
          >
            <Text style={styles.testButtonText}>▶ d45 (tamamen silindi)</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.testSection}>
          <Text style={styles.sectionTitle}>Portföy Akışı</Text>
          {['d10','d20','d30','d40','d60','d75'].map(ph => (
            <TouchableOpacity key={ph} style={[styles.testButton, {backgroundColor: '#2C3E50'}]} onPress={() => testPortfolioPhase(ph)}>
              <Text style={styles.testButtonText}>🏠 Portföy {ph}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={[styles.testButton, {backgroundColor: '#34495E'}]} onPress={() => sendPersistedDemo({ type: 'portfolio', title: 'Kalıcı Portföy (10.gün)', body: 'Server’da saklanan demo', actionType: 'open_portfolio', actionId: 'persist-demo' })}>
            <Text style={styles.testButtonText}>🏠 Portföy (Kalıcı Server)</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.testSection}>
          <Text style={styles.sectionTitle}>Talep Akışı</Text>
          {['d10','d20','d30'].map(ph => (
            <TouchableOpacity key={ph} style={[styles.testButton, {backgroundColor: '#8E44AD'}]} onPress={() => testDemandPhase(ph)}>
              <Text style={styles.testButtonText}>📋 Talep {ph}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={[styles.testButton, {backgroundColor: '#9B59B6'}]} onPress={() => sendPersistedDemo({ type: 'demand', title: 'Kalıcı Talep (10.gün)', body: 'Server’da saklanan demo', actionType: 'open_demand', actionId: 'persist-demo' })}>
            <Text style={styles.testButtonText}>📋 Talep (Kalıcı Server)</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.testSection}>
          <Text style={styles.sectionTitle}>Talep/Request Bildirim Testi (15/20/30/45)</Text>
          <View style={{ marginBottom: 10 }}>
            <Text style={{ color: theme.colors.text, marginBottom: 6 }}>Belge ID</Text>
            <TextInput
              value={testDemandId}
              onChangeText={setTestDemandId}
              placeholder="Örn: vMqlno7hK5bkPxCR8TWZ"
              placeholderTextColor={theme.colors.textSecondary || '#888'}
              style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8, padding: 10, color: theme.colors.text }}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 10, gap: 8 }}>
            <TouchableOpacity onPress={() => setTestEntityType('demand')} style={[styles.testButton, { backgroundColor: testEntityType === 'demand' ? '#8E44AD' : '#555', paddingVertical: 8, paddingHorizontal: 12 }]}>
              <Text style={styles.testButtonText}>demand</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setTestEntityType('request')} style={[styles.testButton, { backgroundColor: testEntityType === 'request' ? '#8E44AD' : '#555', paddingVertical: 8, paddingHorizontal: 12 }]}>
              <Text style={styles.testButtonText}>request</Text>
            </TouchableOpacity>
          </View>
          <View>
            {[15, 20, 30, 45].map(p => (
              <TouchableOpacity key={p} style={[styles.testButton, {backgroundColor: '#8E44AD'}]} onPress={() => callPrimeAndProcess(p)}>
                <Text style={styles.testButtonText}>▶ {testEntityType} d{p} (prime+process)</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={[styles.testButton, { backgroundColor: '#0EA5E9' }]} onPress={testRequestResetTimers}>
              <Text style={styles.testButtonText}>🕒 Talep sayaç reset testi (request)</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.testSection}>
          <Text style={styles.sectionTitle}>Abonelik / Trial</Text>
          <TouchableOpacity style={[styles.testButton, {backgroundColor: '#27AE60'}]} onPress={() => testSubscriptionPhase('trial', 3)}>
            <Text style={styles.testButtonText}>🧪 Trial d3</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.testButton, {backgroundColor: '#27AE60'}]} onPress={() => testSubscriptionPhase('trial', 2)}>
            <Text style={styles.testButtonText}>🧪 Trial d2</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.testButton, {backgroundColor: '#27AE60'}]} onPress={() => testSubscriptionPhase('trial', 1)}>
            <Text style={styles.testButtonText}>🧪 Trial d1</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.testButton, {backgroundColor: '#E67E22'}]} onPress={() => testSubscriptionPhase('paid', 3)}>
            <Text style={styles.testButtonText}>💳 Paid d3</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.testButton, {backgroundColor: '#E67E22'}]} onPress={() => testSubscriptionPhase('paid', 2)}>
            <Text style={styles.testButtonText}>💳 Paid d2</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.testButton, {backgroundColor: '#E67E22'}]} onPress={() => testSubscriptionPhase('paid', 1)}>
            <Text style={styles.testButtonText}>💳 Paid d1</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.testButton, {backgroundColor: '#D35400'}]} onPress={() => sendPersistedDemo({ type: 'subscription', title: 'Kalıcı Abonelik (d3)', body: 'Server’da saklanan demo', actionType: 'open_subscriptions' })}>
            <Text style={styles.testButtonText}>💳 Abonelik (Kalıcı Server)</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.testSection}>
          <Text style={styles.sectionTitle}>Sistem İşlemleri</Text>

          <TouchableOpacity style={[styles.testButton, {backgroundColor: '#FF9500'}]} onPress={checkAndroidSettings}>
            <Text style={styles.testButtonText}>🔧 Android Ayarları Kontrol</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.testButton, styles.clearButton]} onPress={clearNotifications}>
            <Text style={styles.testButtonText}>Tüm Bildirimleri Temizle</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.testButton, styles.clearButton]} onPress={clearTestResults}>
            <Text style={styles.testButtonText}>Test Sonuçlarını Temizle</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.resultsSection}>
          <Text style={styles.sectionTitle}>Test Sonuçları</Text>
          {testResults.map((result) => (
            <Text key={result.id} style={styles.resultText}>
              [{result.timestamp}] {result.message}
            </Text>
          ))}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollView: {
    padding: 16,
  },
  header: {
    backgroundColor: theme.colors.cardBackground,
    paddingVertical: 15,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  testSection: {
    marginBottom: 20,
    padding: 15,
    backgroundColor: theme.colors.cardBackground,
    borderRadius: 10,
    shadowColor: theme.colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.primary,
    marginBottom: 15,
    textAlign: 'center',
  },
  testButton: {
    backgroundColor: theme.colors.primary,
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
    alignItems: 'center',
  },
  testButtonText: {
    color: theme.colors.white,
    fontWeight: 'bold',
    fontSize: 16,
  },
  clearButton: {
    backgroundColor: theme.colors.red,
  },
  resultsSection: {
    marginTop: 20,
    padding: 15,
    backgroundColor: theme.colors.cardBackground,
    borderRadius: 10,
    shadowColor: theme.colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  resultText: {
    color: theme.colors.text,
    marginBottom: 5,
    fontSize: 13,
  },
});

export default NotificationTest;
