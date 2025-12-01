import React, { useState, useEffect, useCallback, useMemo, memo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Animated,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { theme } from '../theme/theme';
import trialManager from '../utils/trialManager';
import { SUBSCRIPTION_PLANS, getPlanById } from '../utils/subscription';


const Subscription = () => {
  const navigation = useNavigation();
  const [fadeAnim] = useState(new Animated.Value(0));
  const [scaleAnim] = useState(new Animated.Value(0.8));
  const [trialStatus, setTrialStatus] = useState(null);
  const [subscription, setSubscription] = useState(null);

  useEffect(() => {
    loadSubscriptionData();
  }, [loadSubscriptionData]);

  const loadSubscriptionData = useCallback(async () => {
    try {
      // Deneme sürümü durumunu kontrol et
      const trial = await trialManager.getTrialStatus();
      setTrialStatus(trial);

      // Eğer deneme sürümü aktifse, subscription'ı deneme sürümü olarak ayarla
      if (trial.isActive) {
        setSubscription({
          plan: 'Deneme Sürümü',
          planId: 'trial',
          status: 'trial',
          endDate: new Date(trial.trialData.endDate),
          startDate: new Date(trial.trialData.startDate),
          daysRemaining: trial.daysRemaining,
        });
      } else {
        // Gerçek abonelik verisi burada yüklenecek
        setSubscription({
          plan: 'Aylık',
          planId: 'monthly',
          status: 'active',
          endDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), // 15 gün sonra
          startDate: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000), // 15 gün önce
          daysRemaining: 15,
        });
      }
    } catch (error) {
      // Abonelik verisi yüklenirken hata - sessizce geç
    }
  }, []);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, scaleAnim]);

  const isActive = subscription?.status === 'active' || subscription?.status === 'trial';
  const daysRemaining = subscription?.daysRemaining ||
    (subscription?.endDate ? Math.ceil((subscription.endDate - new Date()) / (1000 * 60 * 60 * 24)) : 0);

  const formatDate = useCallback((date) => {
    return date.toLocaleDateString('tr-TR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }, []);

  const handleUpgrade = useCallback(() => {
    navigation.navigate('Packages');
  }, [navigation]);

  const handleExtend = useCallback(() => {
    navigation.navigate('Payment', { plan: subscription.plan });
  }, [navigation, subscription?.plan]);

  const handleCancel = useCallback(() => {
    Alert.alert(
      'Abonelik İptali',
      'Aboneliğinizi iptal etmek istediğinizden emin misiniz?',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'İptal Et',
          style: 'destructive',
          onPress: () => {
            setSubscription(prev => ({ ...prev, status: 'cancelled' }));
            Alert.alert('Başarılı', 'Aboneliğiniz iptal edildi.');
          },
        },
      ],
    );
  }, []);

  const getCurrentPlanDetails = useCallback(() => {
    if (subscription?.planId === 'trial') {
      return {
        name: 'Deneme Sürümü',
        price: 'Ücretsiz',
        features: ['Temel özellikler', 'Sınırlı kullanım', '7 gün süre'],
      };
    }

    const plan = getPlanById(subscription?.planId || 'monthly') || { name: 'Aylık', price: 0, features: [] };
    return {
      name: plan.name,
      price: `${plan.price}₺`,
      features: plan.features.slice(0, 8), // İlk 8 özelliği göster
    };
  }, [subscription?.planId]);

  const renderStatusIcon = useCallback(() => (
    <View style={[styles.statusIcon, isActive ? styles.statusIconActive : styles.statusIconExpired]}>
      <Text style={styles.statusIconText}>
        {isActive ? '✓' : '✕'}
      </Text>
    </View>
  ), [isActive]);

  const renderSubscriptionCard = useCallback(() => {
    const planDetails = getCurrentPlanDetails();

    return (
      <Animated.View
        style={[
          styles.subscriptionCard,
          { opacity: fadeAnim, transform: [{ scale: scaleAnim }] },
        ]}
      >
        {renderStatusIcon()}

        <Text style={styles.planName}>{planDetails.name}</Text>

        <Text style={[styles.statusText, isActive ? styles.statusTextActive : styles.statusTextExpired]}>
          Durum: {subscription?.status === 'trial' ? 'Deneme Sürümü' : (isActive ? 'Aktif' : 'Süresi Dolmuş')}
        </Text>

        {isActive ? (
          <View style={styles.dateInfo}>
            <Text style={styles.dateText}>
              Aboneliğinizin sona ermesine{' '}
              <Text style={styles.daysRemaining}>{daysRemaining}</Text> gün kaldı.
            </Text>
            <Text style={styles.endDateText}>
              Son geçerlilik tarihi: {formatDate(subscription.endDate)}
            </Text>
          </View>
        ) : (
          <View style={styles.dateInfo}>
            <Text style={styles.dateText}>
              Aboneliğiniz {formatDate(subscription.endDate)} tarihinde sona erdi.
            </Text>
          </View>
        )}

        <View style={styles.subscriptionActions}>
          <TouchableOpacity style={styles.actionButton} onPress={handleUpgrade}>
            <Text style={styles.actionButtonText}>
              Paketleri İncele / Yükselt
            </Text>
          </TouchableOpacity>

          {isActive && subscription?.status !== 'trial' && (
            <TouchableOpacity style={[styles.actionButton, styles.extendButton]} onPress={handleExtend}>
              <Text style={[styles.actionButtonText, styles.extendButtonText]}>
                Aboneliği Uzat
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </Animated.View>
    );
  }, [getCurrentPlanDetails, renderStatusIcon, isActive, subscription, daysRemaining, formatDate, handleUpgrade, handleExtend, fadeAnim, scaleAnim]);

  const renderNoSubscription = useCallback(() => (
    <Animated.View
      style={[
        styles.subscriptionCard,
        { opacity: fadeAnim, transform: [{ scale: scaleAnim }] },
      ]}
    >
      <View style={[styles.statusIcon, styles.statusIconExpired]}>
        <Text style={styles.statusIconText}>✕</Text>
      </View>

      <Text style={styles.planName}>Abonelik Bulunamadı</Text>

      <Text style={[styles.statusText, styles.statusTextExpired]}>
        Durum: Pasif
      </Text>

      <Text style={styles.dateText}>
        Abonelik planı tanımlı değil.
      </Text>

      <View style={styles.subscriptionActions}>
        <TouchableOpacity style={styles.actionButton} onPress={handleUpgrade}>
          <Text style={styles.actionButtonText}>
            Paketleri İncele / Başlat
          </Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  ), [handleUpgrade, fadeAnim, scaleAnim]);

  const renderFeaturesList = useCallback(() => {
    const planDetails = getCurrentPlanDetails();

    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Paket Özellikleri</Text>

        <View style={styles.featuresCard}>
          {planDetails.features.map((feature, index) => (
            <View key={index} style={styles.featureItem}>
              <View style={styles.checkIcon}>
                <Text style={styles.checkText}>✓</Text>
              </View>
              <Text style={styles.featureText}>{feature}</Text>
            </View>
          ))}

          {subscription?.status !== 'trial' && (() => {
            const full = getPlanById(subscription?.planId || 'monthly');
            const remaining = Math.max(0, (Array.isArray(full?.features) ? full.features.length : 0) - 8);
            if (!remaining) return null;
            return (
            <View style={styles.moreFeatures}>
              <Text style={styles.moreFeaturesText}>
                +{remaining} özellik daha
              </Text>
            </View>
            );
          })()}
        </View>
      </View>
    );
  }, [getCurrentPlanDetails, subscription?.status, subscription?.planId]);

  // Prod'da mock istatistikleri göstermeyelim; sadece geliştirmede yardımcı görsel
  const renderUsageStats = useCallback(() => {
    if (!__DEV__) return null;
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Kullanım İstatistikleri (dev)</Text>

        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>12</Text>
            <Text style={styles.statLabel}>Portföy</Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statNumber}>45</Text>
            <Text style={styles.statLabel}>Talep</Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statNumber}>89%</Text>
            <Text style={styles.statLabel}>Eşleşme</Text>
          </View>
        </View>
      </View>
    );
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Geri"
        >
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Abonelik</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Abonelik Durumum</Text>

          {subscription && subscription.plan !== 'Abonelik Yok' ? renderSubscriptionCard() : renderNoSubscription()}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Abonelik Detayları</Text>

          <View style={styles.detailsCard}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Plan:</Text>
              <Text style={styles.detailValue}>{subscription?.plan || 'Tanımlı değil'}</Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Fiyat:</Text>
              <Text style={styles.detailValue}>
                {getCurrentPlanDetails().price}
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Başlangıç:</Text>
              <Text style={styles.detailValue}>
                {subscription?.startDate ? formatDate(subscription.startDate) : 'Tanımlı değil'}
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Bitiş:</Text>
              <Text style={styles.detailValue}>
                {subscription?.endDate ? formatDate(subscription.endDate) : 'Tanımlı değil'}
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Kalan Gün:</Text>
              <Text style={styles.detailValue}>
                {subscription?.status === 'trial' ? `${daysRemaining} gün (Deneme)` : (isActive ? `${daysRemaining} gün` : 'Süresi dolmuş')}
              </Text>
            </View>
          </View>
        </View>

        {renderFeaturesList()}
        {renderUsageStats()}

        {isActive && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Abonelik Yönetimi</Text>

            <TouchableOpacity style={[styles.actionButton, styles.cancelButton]} onPress={handleCancel}>
              <Text style={[styles.actionButtonText, styles.cancelButtonText]}>
                Aboneliği İptal Et
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    paddingTop: 30,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  backButton: {
    padding: theme.spacing.sm,
  },
  backIcon: {
    fontSize: 24,
    color: theme.colors.text,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.text,
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    padding: theme.spacing.lg,
  },
  section: {
    marginBottom: theme.spacing.xl,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: theme.spacing.lg,
  },
  subscriptionCard: {
    backgroundColor: theme.colors.cardBg,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  statusIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  statusIconActive: {
    backgroundColor: theme.colors.success,
  },
  statusIconExpired: {
    backgroundColor: theme.colors.error,
  },
  statusIconText: {
    fontSize: 32,
    color: theme.colors.white,
    fontWeight: 'bold',
  },
  planName: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  statusText: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: theme.spacing.md,
  },
  statusTextActive: {
    color: theme.colors.success,
  },
  statusTextExpired: {
    color: theme.colors.error,
  },
  dateInfo: {
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  dateText: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  daysRemaining: {
    color: theme.colors.primary,
    fontWeight: '700',
  },
  endDateText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.sm,
  },
  subscriptionActions: {
    width: '100%',
    gap: theme.spacing.md,
  },
  actionButton: {
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing.lg,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
  },
  actionButtonText: {
    color: theme.colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  extendButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  extendButtonText: {
    color: theme.colors.primary,
  },
  cancelButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: theme.colors.error,
  },
  cancelButtonText: {
    color: theme.colors.error,
  },
  detailsCard: {
    backgroundColor: theme.colors.cardBg,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  detailLabel: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 16,
    color: theme.colors.text,
    fontWeight: '600',
  },
  featuresCard: {
    backgroundColor: theme.colors.cardBg,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  checkIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: theme.colors.success,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.md,
  },
  checkText: {
    color: theme.colors.white,
    fontSize: 12,
    fontWeight: 'bold',
  },
  featureText: {
    fontSize: 16,
    color: theme.colors.text,
    flex: 1,
  },
  moreFeatures: {
    alignItems: 'center',
    marginTop: theme.spacing.md,
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  moreFeaturesText: {
    fontSize: 14,
    color: theme.colors.primary,
    fontWeight: '600',
  },
  statsContainer: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: theme.colors.cardBg,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.colors.primary,
    marginBottom: theme.spacing.xs,
  },
  statLabel: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
});

export default memo(Subscription);

