import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { theme } from '../theme/theme';
import { SUBSCRIPTION_PLANS, calculatePackageComparison, getRecommendedPlan } from '../utils/subscription';

const Packages = () => {
  const navigation = useNavigation();
  const [selectedPackage, setSelectedPackage] = useState(null);
  const [fadeAnim] = useState(new Animated.Value(0));
  const packages = useMemo(() => calculatePackageComparison(), []);

  useEffect(() => {
    // En popüler paketi varsayılan olarak seç
    const recommended = getRecommendedPlan();
    setSelectedPackage(recommended);

    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  const handlePackageSelect = useCallback((pkg) => {
    setSelectedPackage(pkg);
  }, []);

  const handleContinue = useCallback(() => {
    if (selectedPackage) {
      navigation.navigate('Payment', { package: selectedPackage });
    }
  }, [selectedPackage, navigation]);

  const renderPackageCard = useCallback((pkg) => {
    const isSelected = selectedPackage?.id === pkg.id;
    const isPopular = pkg.popular;

    return (
      <Animated.View
        key={pkg.id}
        style={[
          styles.packageCard,
          isSelected && styles.packageCardSelected,
          { opacity: fadeAnim, transform: [{ translateY: fadeAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [50, 0],
          })}] },
        ]}
      >
        {isPopular && (
          <View style={styles.popularBadge}>
            <Text style={styles.popularText}>En Popüler</Text>
          </View>
        )}

        {pkg.discount > 0 && (
          <View style={styles.discountBadge}>
            <Text style={styles.discountText}>%{pkg.discount} İndirim</Text>
          </View>
        )}

        <TouchableOpacity
          style={styles.packageContent}
          onPress={() => handlePackageSelect(pkg)}
          activeOpacity={0.8}
        >
          <View style={styles.packageHeader}>
            <Text style={styles.packageName}>{pkg.name}</Text>

            <View style={styles.priceContainer}>
              {pkg.discount > 0 && pkg.originalPrice && (
                <Text style={styles.originalPrice}>
                  {pkg.originalPrice.toFixed(2)}₺
                </Text>
              )}
              <Text style={styles.packagePrice}>{pkg.price}₺</Text>
              <Text style={styles.packageBilling}>{pkg.billing}</Text>
            </View>

            {pkg.discount > 0 && (
              <Text style={styles.savingsText}>
                {pkg.savings}
              </Text>
            )}
          </View>

          <View style={styles.featuresContainer}>
            <Text style={styles.featuresTitle}>Tüm Paketlerde Dahil:</Text>
            {pkg.features.slice(0, 6).map((feature, featureIndex) => (
              <View key={featureIndex} style={styles.featureItem}>
                <View style={styles.checkIcon}>
                  <Text style={styles.checkText}>✓</Text>
                </View>
                <Text style={styles.featureText}>{feature}</Text>
              </View>
            ))}

            {pkg.features.length > 6 && (
              <View style={styles.moreFeatures}>
                <Text style={styles.moreFeaturesText}>
                  +{pkg.features.length - 6} özellik daha
                </Text>
              </View>
            )}
          </View>

          <View style={styles.selectionIndicator}>
            {isSelected && (
              <View style={styles.selectedIndicator}>
                <Text style={styles.selectedText}>Seçildi</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  }, [selectedPackage, fadeAnim, handlePackageSelect]);

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
        <Text style={styles.headerTitle}>Paketler</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Abonelik Paketleri</Text>
          <Text style={styles.sectionDescription}>
            Tüm paketlerde aynı özellikler! Sadece süre seçin ve indirimden yararlanın.
          </Text>
        </View>

        <View style={styles.packagesContainer}>
          {packages.map((pkg) => renderPackageCard(pkg))}
        </View>

        {selectedPackage && (
          <Animated.View
            style={[
              styles.continueSection,
              { opacity: fadeAnim },
            ]}
          >
            <View style={styles.selectedPackageInfo}>
              <Text style={styles.selectedPackageText}>
                Seçilen Paket: <Text style={styles.selectedPackageName}>{selectedPackage.name}</Text>
              </Text>
              <View style={styles.priceRow}>
                {selectedPackage.discount > 0 && selectedPackage.originalPrice && (
                  <Text style={styles.originalPriceDisplay}>
                    {selectedPackage.originalPrice.toFixed(2)}₺
                  </Text>
                )}
                <Text style={styles.selectedPackagePrice}>{selectedPackage.price}₺</Text>
              </View>
              {selectedPackage.discount > 0 && (
                <Text style={styles.discountDisplay}>
                  %{selectedPackage.discount} tasarruf sağlıyorsunuz!
                </Text>
              )}
            </View>

            <TouchableOpacity
              style={styles.continueButton}
              onPress={handleContinue}
              accessibilityRole="button"
              accessibilityLabel="Devam Et"
            >
              <Text style={styles.continueButtonText}>
                Devam Et - {selectedPackage.price}₺
              </Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        <View style={styles.infoSection}>
          <Text style={styles.infoTitle}>Paket Özellikleri</Text>
          <View style={styles.infoCard}>
            <Text style={styles.infoText}>
              • Tüm paketler 30 gün para iade garantisi ile gelir
            </Text>
            <Text style={styles.infoText}>
              • İstediğiniz zaman paket değiştirebilirsiniz
            </Text>
            <Text style={styles.infoText}>
              • 7/24 teknik destek hizmeti
            </Text>
            <Text style={styles.infoText}>
              • Güvenli ödeme sistemi
            </Text>
            <Text style={styles.infoText}>
              • Tüm paketlerde aynı özellikler
            </Text>
            <Text style={styles.infoText}>
              • Uzun vadeli paketlerde ekstra indirim
            </Text>
          </View>
        </View>

        <View style={styles.comparisonSection}>
          <Text style={styles.comparisonTitle}>Paket Karşılaştırması</Text>
          <View style={styles.comparisonCard}>
            <View style={styles.comparisonRow}>
              <Text style={styles.comparisonLabel}>Aylık:</Text>
              <Text style={styles.comparisonValue}>199₺/ay</Text>
            </View>
            <View style={styles.comparisonRow}>
              <Text style={styles.comparisonLabel}>3 Aylık:</Text>
              <Text style={styles.comparisonValue}>167₺/ay (%16 tasarruf)</Text>
            </View>
            <View style={styles.comparisonRow}>
              <Text style={styles.comparisonLabel}>6 Aylık:</Text>
              <Text style={styles.comparisonValue}>165₺/ay (%17 tasarruf)</Text>
            </View>
            <View style={styles.comparisonRow}>
              <Text style={styles.comparisonLabel}>Yıllık:</Text>
              <Text style={styles.comparisonValue}>133₺/ay (%33 tasarruf)</Text>
            </View>
          </View>
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
    fontSize: theme.fontSizes.xxxl,
    color: theme.colors.text,
  },
  headerTitle: {
    fontSize: theme.fontSizes.xxl,
    fontWeight: theme.fontWeights.bold,
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
    fontSize: theme.fontSizes.xxxl,
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  sectionDescription: {
    fontSize: theme.fontSizes.xl,
    color: theme.colors.textSecondary,
    lineHeight: 24,
  },
  packagesContainer: {
    marginBottom: theme.spacing.xl,
  },
  packageCard: {
    backgroundColor: theme.colors.cardBg,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 2,
    borderColor: 'transparent',
    overflow: 'hidden',
    position: 'relative',
    marginBottom: theme.spacing.lg,
  },
  packageCardSelected: {
    borderColor: theme.colors.primary,
  },
  popularBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderBottomLeftRadius: theme.borderRadius.md,
    zIndex: 1,
  },
  popularText: {
    color: theme.colors.white,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.semibold,
  },
  discountBadge: {
    position: 'absolute',
    top: 0,
    left: 0,
    backgroundColor: theme.colors.success,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderBottomRightRadius: theme.borderRadius.md,
    zIndex: 1,
  },
  discountText: {
    color: theme.colors.white,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.semibold,
  },
  packageContent: {
    padding: theme.spacing.lg,
  },
  packageHeader: {
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  packageName: {
    fontSize: theme.fontSizes.xxxl,
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  priceContainer: {
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  originalPrice: {
    fontSize: theme.fontSizes.xxl,
    color: theme.colors.textSecondary,
    textDecorationLine: 'line-through',
    marginBottom: theme.spacing.xs,
  },
  packagePrice: {
    fontSize: theme.fontSizes.xxxl,
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.primary,
    marginBottom: theme.spacing.xs,
  },
  packageBilling: {
    fontSize: theme.fontSizes.xl,
    color: theme.colors.textSecondary,
  },
  savingsText: {
    fontSize: theme.fontSizes.md,
    color: theme.colors.success,
    fontWeight: theme.fontWeights.semibold,
  },
  featuresContainer: {
    marginBottom: theme.spacing.lg,
  },
  featuresTitle: {
    fontSize: theme.fontSizes.xl,
    fontWeight: theme.fontWeights.semibold,
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
    textAlign: 'center',
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
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
  },
  featureText: {
    fontSize: theme.fontSizes.xl,
    color: theme.colors.text,
    flex: 1,
  },
  moreFeatures: {
    alignItems: 'center',
    marginTop: theme.spacing.md,
  },
  moreFeaturesText: {
    fontSize: theme.fontSizes.md,
    color: theme.colors.primary,
    fontWeight: theme.fontWeights.semibold,
  },
  selectionIndicator: {
    alignItems: 'center',
  },
  selectedIndicator: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
  },
  selectedText: {
    color: theme.colors.white,
    fontSize: theme.fontSizes.md,
    fontWeight: theme.fontWeights.semibold,
  },
  continueSection: {
    marginBottom: theme.spacing.xl,
  },
  selectedPackageInfo: {
    backgroundColor: theme.colors.cardBg,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  selectedPackageText: {
    fontSize: theme.fontSizes.xl,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  selectedPackageName: {
    color: theme.colors.primary,
    fontWeight: theme.fontWeights.bold,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.sm,
  },
  originalPriceDisplay: {
    fontSize: theme.fontSizes.xxl,
    color: theme.colors.textSecondary,
    textDecorationLine: 'line-through',
    marginRight: theme.spacing.md,
  },
  selectedPackagePrice: {
    fontSize: theme.fontSizes.xxxl,
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.primary,
  },
  discountDisplay: {
    fontSize: theme.fontSizes.md,
    color: theme.colors.success,
    fontWeight: theme.fontWeights.semibold,
    textAlign: 'center',
  },
  continueButton: {
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing.lg,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
  },
  continueButtonText: {
    color: theme.colors.white,
    fontSize: theme.fontSizes.xxl,
    fontWeight: theme.fontWeights.semibold,
  },
  infoSection: {
    marginBottom: theme.spacing.xl,
  },
  infoTitle: {
    fontSize: theme.fontSizes.xxl,
    fontWeight: theme.fontWeights.semibold,
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  infoCard: {
    backgroundColor: theme.colors.cardBg,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  infoText: {
    fontSize: theme.fontSizes.md,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
    lineHeight: 20,
  },
  comparisonSection: {
    marginBottom: theme.spacing.xl,
  },
  comparisonTitle: {
    fontSize: theme.fontSizes.xxl,
    fontWeight: theme.fontWeights.semibold,
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  comparisonCard: {
    backgroundColor: theme.colors.cardBg,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  comparisonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  comparisonLabel: {
    fontSize: theme.fontSizes.xl,
    color: theme.colors.textSecondary,
    fontWeight: theme.fontWeights.medium,
  },
  comparisonValue: {
    fontSize: theme.fontSizes.xl,
    color: theme.colors.text,
    fontWeight: theme.fontWeights.semibold,
  },
});

export default Packages;
