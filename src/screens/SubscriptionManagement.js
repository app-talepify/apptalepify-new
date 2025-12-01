import React, { useState, useEffect, useCallback, memo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Animated,
  Switch,
  ImageBackground,
  SafeAreaView,
  Image,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useAuth } from '../context/AuthContext';
import { getSubscriptionHistory } from '../services/subscriptionService';
import { SUBSCRIPTION_PLANS, getPlanById } from '../utils/subscription';


const SubscriptionManagement = () => {
  const navigation = useNavigation();
  const { theme: currentTheme, isDark } = useTheme();
  const { user, userProfile, fetchUserProfile } = useAuth();
  const insets = useSafeAreaInsets();
  const [fadeAnim] = useState(new Animated.Value(0));
  const [isLoading, setIsLoading] = useState(false);
  const [subscriptionHistory, setSubscriptionHistory] = useState([]);

  const styles = createStyles(currentTheme, isDark);

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start();

    const fetchHistory = async () => {
      if (user?.uid) {
        const result = await getSubscriptionHistory(user.uid);
        if (result.success) {
          setSubscriptionHistory(result.history);
        }
      }
    };
    fetchHistory();
  }, [user, fadeAnim]);

  const formatDate = useCallback((dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('tr-TR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }, []);

  const handlePlanChange = useCallback((planId) => {
    const plan = getPlanById(planId);
    if (!plan) {
      Alert.alert('Hata', 'Geçersiz bir paket seçildi.');
      return;
    }
    // Kullanıcıyı, seçilen paket bilgileriyle birlikte Ödeme ekranına yönlendir
    navigation.navigate('Payment', {
      planId: plan.id,
      planName: plan.name,
      amount: plan.price,
      type: 'subscription', // Ödeme ekranına işlemin türünü belirt
    });
  }, [navigation]);

  const handleCancelSubscription = useCallback(() => {
    Alert.alert(
      'Abonelik İptali',
      'Aboneliğinizi iptal etmek istediğinizden emin misiniz? Bu işlem geri alınamaz.',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'İptal Et',
          style: 'destructive',
          onPress: () => {
            Alert.alert('İptal Edildi', 'Aboneliğiniz iptal edildi. Mevcut dönem sonunda sona erecek.');
          },
        },
      ],
    );
  }, []);

  const handlePaymentMethod = useCallback(() => {
    // Ödeme yöntemleri ekranına yönlendirme. Belirli bir plana ihtiyaç duymayabilir.
    navigation.navigate('Payment');
  }, [navigation]);

  const renderCurrentPlanCard = useCallback(() => {
    const expiryDateStr = userProfile?.subscriptionExpiryDate;
    
    if (!expiryDateStr) {
      return (
        <View style={styles.planCard}>
          <Text style={styles.noSubscriptionText}>Aktif bir aboneliğiniz bulunmuyor.</Text>
        </View>
      );
    }

    const expiryDate = new Date(expiryDateStr);
    const now = new Date();
    const totalDurationDays = 365; // Veya abonelik başlangıcına göre dinamik hesaplanabilir
    const daysRemaining = Math.max(0, Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24)));
    const progress = totalDurationDays > 0 ? (daysRemaining / totalDurationDays) * 100 : 0;
    
    const progressColor = daysRemaining > 30 ? '#22c55e' : (daysRemaining > 7 ? '#f59e0b' : '#DC143C');

    return (
      <View style={styles.planCard}>
        <View style={styles.statusHeader}>
          <Text style={styles.statusTitle}>Abonelik Durumunuz</Text>
        </View>
        <View style={styles.statusBody}>
          <Text style={styles.daysRemainingValue}>{daysRemaining}</Text>
          <Text style={styles.daysRemainingLabel}>gün kaldı</Text>
        </View>
        <Text style={styles.expiryDateText}>
          Aboneliğiniz {formatDate(expiryDateStr)} tarihinde sona erecek.
        </Text>
      </View>
    );
  }, [userProfile, styles, formatDate]);

  const renderBillingInfo = useCallback(() => {
    const expiryDate = userProfile?.subscriptionExpiryDate;
    
    return (
      <View style={styles.billingCard}>
        <View style={styles.billingRow}>
          <Text style={styles.billingLabel}>Abonelik Bitiş Tarihi:</Text>
          <Text style={styles.billingValue}>{formatDate(expiryDate)}</Text>
        </View>
      </View>
    );
  }, [userProfile, formatDate, styles]);

  const renderAvailablePlans = useCallback(() => {
    const hasActiveSubscription = userProfile?.subscriptionExpiryDate && new Date(userProfile.subscriptionExpiryDate) > new Date();

    return (
      <View style={styles.plansContainer}>
        {Object.values(SUBSCRIPTION_PLANS).map((plan) => {
          // Mevcut plan konsepti kalktığı için bu kontroller basitleştirildi.
          // Her zaman "Yükselt" veya "Değiştir" olarak gösterilebilir.
          // Yeni mantık: Eğer aktif abonelik varsa "Süreyi Uzat", yoksa "Satın Al"
          const buttonText = hasActiveSubscription ? 'Süreyi Uzat' : 'Satın Al';

          return (
            <View
              key={plan.id}
              style={styles.planOption}
            >
              <View style={styles.planOptionContent}>
                <View style={styles.planOptionHeader}>
                  <Text style={styles.planOptionName}>{plan.name}</Text>
                  <Text style={styles.planOptionPrice}>{plan.price}₺</Text>
                  <Text style={styles.planOptionBilling}>{plan.billing}</Text>
                </View>
              </View>
              <TouchableOpacity
                style={[styles.planActionButton, styles.upgradeButton]}
                onPress={() => handlePlanChange(plan.id)}
              >
                <Text style={styles.planActionText}>
                  {buttonText}
                </Text>
              </TouchableOpacity>
              {plan.discount > 0 && (
                <View style={styles.discountBadge}>
                  <Text style={styles.discountText}>%{plan.discount} İndirim</Text>
                </View>
              )}
            </View>
          );
        })}
      </View>
    );
  }, [userProfile, handlePlanChange, currentTheme, styles]);

  const renderActions = useCallback(() => (
    <View style={styles.actionsContainer}>
      <TouchableOpacity style={styles.actionButton} onPress={handlePaymentMethod}>
        <Text style={styles.actionButtonText}>💳 Ödeme Yöntemi Değiştir</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.actionButton} onPress={() => navigation.navigate('Packages')}>
        <Text style={styles.actionButtonText}>📦 Tüm Paketleri İncele</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.actionButton, styles.cancelButton]} onPress={handleCancelSubscription}>
        <Text style={[styles.actionButtonText, styles.cancelButtonText]}>❌ Aboneliği İptal Et</Text>
      </TouchableOpacity>
    </View>
  ), [handlePaymentMethod, navigation, handleCancelSubscription, currentTheme, styles]);

  const renderHistory = useCallback(() => (
    <View style={styles.section}>
      <View style={styles.sectionTitleContainer}>
        <Image source={require('../assets/images/icons/order.png')} style={styles.sectionIcon} />
        <Text style={styles.sectionTitle}>Abonelik Geçmişi</Text>
      </View>
      {subscriptionHistory.length > 0 ? (
        <View style={styles.historyCard}>
          {subscriptionHistory.map((item) => (
            <View key={item.id} style={styles.historyItem}>
              <Text style={styles.historyPlanName}>{item.planName}</Text>
              <Text style={styles.historyDate}>{formatDate(item.purchaseDate)}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.noHistoryText}>Henüz bir satın alım geçmişiniz yok.</Text>
      )}
    </View>
  ), [subscriptionHistory, styles, formatDate]);

  const renderSectionWithIcon = useCallback((title, iconSource, content) => (
    <View style={styles.section}>
      <View style={styles.sectionTitleContainer}>
        <Image source={iconSource} style={styles.sectionIcon} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {content()}
    </View>
  ), [styles.section, styles.sectionTitleContainer, styles.sectionIcon, styles.sectionTitle]);

  return (
    <ImageBackground
      source={require('../assets/images/dark-bg2.png')}
      style={styles.backgroundImage}
    >
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <TouchableOpacity
              style={styles.headerButtonBack}
              onPress={() => navigation.goBack()}
            >
              <Image
                source={require('../assets/images/icons/return.png')}
                style={styles.headerButtonIconBack}
              />
            </TouchableOpacity>
          </View>
          <View style={styles.headerCenter}>
            <View style={{ alignItems: 'center' }}>
              <Text style={styles.headerTitle}>Abonelik Yönetimi</Text>
              <Text style={styles.headerSubtitle}>Paketlerini yönet ve geçmişini görüntüle</Text>
            </View>
          </View>
          <View style={styles.headerRight} />
        </View>

        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
        >
          <View style={styles.section}>
            <View style={styles.sectionTitleContainer}>
              <Image source={require('../assets/images/icons/order.png')} style={styles.sectionIcon} />
              <Text style={styles.sectionTitle}>Mevcut Planınız</Text>
            </View>
            {renderCurrentPlanCard()}
          </View>

          {renderSectionWithIcon('Fatura Bilgileri', require('../assets/images/icons/credit.png'), renderBillingInfo)}
          {renderSectionWithIcon('Mevcut Paketler', require('../assets/images/icons/order.png'), renderAvailablePlans)}
          {renderSectionWithIcon('Hızlı İşlemler', require('../assets/images/icons/star.png'), renderActions)}
          
          {renderHistory()}

          <View style={styles.section}>
            <View style={styles.infoCard}>
              <View style={styles.infoTitleContainer}>
                <Image source={require('../assets/images/icons/info.png')} style={styles.infoIcon} />
                <Text style={styles.infoTitle}>Bilgilendirme</Text>
              </View>
              <Text style={styles.infoText}>
                • Plan değişiklikleri bir sonraki fatura döneminde geçerli olur
              </Text>
              <Text style={styles.infoText}>
                • İptal edilen abonelikler mevcut dönem sonunda sona erer
              </Text>
              <Text style={styles.infoText}>
                • Tüm paketlerde aynı özellikler bulunur
              </Text>
              <Text style={styles.infoText}>
                • Uzun vadeli paketlerde ekstra indirim uygulanır
              </Text>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </ImageBackground>
  );
};

const createStyles = (currentTheme, isDark) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  backgroundImage: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingTop: 30,
    borderBottomWidth: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 40,
  },
  headerCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerButtonBack: {
    width: 37,
    height: 37,
    borderRadius: 8,
    backgroundColor: currentTheme.colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0,
  },
  headerButtonIconBack: {
    width: 16,
    height: 16,
    resizeMode: 'contain',
    tintColor: currentTheme.colors.white,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
    textAlign: 'center',
  },
  headerSubtitle: {
    marginTop: 4,
    fontSize: 12,
    color: currentTheme.colors.mutedText,
    textAlign: 'center',
  },
  headerRight: {
    width: 40,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionIcon: {
    width: 18,
    height: 18,
    marginRight: 8,
    tintColor: 'crimson',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: isDark ? currentTheme.colors.text : 'white',
  },
  planCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  planHeader: {
    alignItems: 'center',
    marginBottom: 12,
  },
  planNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  planNameIcon: {
    width: 22,
    height: 22,
    marginRight: 8,
    tintColor: 'white',
  },
  planName: {
    fontSize: 24,
    fontWeight: '700',
    color: 'white',
  },
  planPrice: {
    fontSize: 32,
    fontWeight: '700',
    color: 'white',
    marginBottom: 4,
  },
  planBilling: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  planFeatures: {
    marginBottom: 12,
  },
  featuresTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
    marginBottom: 8,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  checkmark: {
    fontSize: 16,
    color: 'white',
    fontWeight: 'bold',
    marginRight: 8,
  },
  featureText: {
    fontSize: 14,
    color: 'white',
    flex: 1,
  },
  moreFeatures: {
    fontSize: 14,
    color: 'white',
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 6,
  },
  billingCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  billingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.2)',
  },
  billingLabel: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.7)',
    fontWeight: '500',
  },
  billingValue: {
    fontSize: 16,
    color: 'white',
    fontWeight: '600',
  },
  billingNote: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: 12,
    fontStyle: 'italic',
  },
  plansContainer: {
    gap: 12,
  },
  planOption: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    position: 'relative',
    overflow: 'hidden',
    flexDirection: 'row',
  },
  currentPlanOption: {
    borderColor: currentTheme.colors.error,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  planOptionContent: {
    flex: 1,
    padding: 16,
  },
  planOptionHeader: {
    alignItems: 'center',
    marginBottom: 8,
  },
  planOptionName: {
    fontSize: 20,
    fontWeight: '700',
    color: 'white',
    marginBottom: 4,
  },
  planOptionPrice: {
    fontSize: 24,
    fontWeight: '700',
    color: 'white',
    marginBottom: 4,
  },
  planOptionBilling: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  discountBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'white',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  discountText: {
    color: 'black',
    fontSize: 12,
    fontWeight: '600',
  },
  currentPlanBadge: {
    backgroundColor: 'white',
  },
  currentPlanText: {
    color: 'black',
    fontSize: 14,
    fontWeight: '600',
    width: 80,
    transform: [{ rotate: '-90deg' }],
  },
  planActionButton: {
    width: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
  },
  upgradeButton: {
    backgroundColor: 'white',
  },
  downgradeButton: {
    backgroundColor: 'white',
  },
  planActionText: {
    color: 'black',
    fontSize: 14,
    fontWeight: '600',
    width: 80,
    transform: [{ rotate: '-90deg' }],
  },
  actionsContainer: {
    gap: 12,
  },
  actionButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingVertical: 16,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  actionButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButton: {
    borderColor: 'red',
  },
  cancelButtonText: {
    color: 'red',
  },
  infoCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  infoTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  infoIcon: {
    width: 16,
    height: 16,
    marginRight: 8,
    tintColor: 'crimson',
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  infoText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: 12,
    lineHeight: 20,
  },
  noSubscriptionText: {
    color: 'white',
    fontSize: 18,
    textAlign: 'center',
    padding: 20,
  },
  statusHeader: {
    alignItems: 'center',
    marginBottom: 16,
  },
  statusTitle: {
    color: 'white',
    fontSize: 20,
    fontWeight: '600',
  },
  statusBody: {
    alignItems: 'center',
    marginBottom: 16,
  },
  daysRemainingValue: {
    color: 'white',
    fontSize: 48,
    fontWeight: 'bold',
  },
  daysRemainingLabel: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 16,
    marginTop: -4,
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressBar: {
    height: '100%',
    borderRadius: 4,
  },
  expiryDateText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 12,
    textAlign: 'center',
  },
  historyCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  historyItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  historyPlanName: {
    color: 'white',
    fontSize: 16,
    fontWeight: '500',
  },
  historyDate: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 14,
  },
  noHistoryText: {
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
    marginTop: 10,
  },
});

export default memo(SubscriptionManagement);
