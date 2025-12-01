import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ImageBackground,
} from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import GlassmorphismView from '../components/GlassmorphismView';
import * as Animatable from 'react-native-animatable';

const CommissionCalculator = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const { theme: currentTheme, isDark } = useTheme();
  const styles = useMemo(() => stylesFactory(currentTheme, isDark), [currentTheme, isDark]);
  const pageViewRef = useRef(null);

  const cardConfig = useMemo(() => ({
    overlayColor: 'rgba(224, 220, 220, 0.81)',
    startColor: 'rgba(17, 36, 49, 1)',
    endColor: 'rgba(17, 36, 49, 0.38)',
    gradientAlpha: 1,
    gradientDirection: 150,
    gradientSpread: 7,
    ditherStrength: 4.0,
  }), []);

  const customEnterAnimation = useMemo(() => ({
    from: { opacity: 0, translateY: 8 },
    to: { opacity: 1, translateY: 0 },
  }), []);
  const customExitAnimation = useMemo(() => ({
    from: { opacity: 1, translateY: 0 },
    to: { opacity: 1, translateY: 0 },
  }), []);
  useFocusEffect(
    useCallback(() => {
      if (pageViewRef.current) {
        try { pageViewRef.current.animate(customEnterAnimation, 420); } catch {}
      }
      return () => {
        if (pageViewRef.current) {
          try { pageViewRef.current.animate(customExitAnimation, 200); } catch {}
        }
      };
    }, [customEnterAnimation, customExitAnimation])
  );

  const [salePrice, setSalePrice] = useState('');
  const [commissionRate, setCommissionRate] = useState('');
  const [commissionAmount, setCommissionAmount] = useState(0);
  const [displayPrice, setDisplayPrice] = useState('');

  // Komisyon hesaplama fonksiyonu
  const calculateCommission = () => {
    const price = parseFloat(salePrice) || 0;
    const rate = parseFloat(commissionRate.replace(/[^\d.,]/g, '').replace(',', '.')) || 0;

    if (price > 0 && rate > 0) {
      const commission = (price * rate) / 100;
      setCommissionAmount(commission);
    } else {
      setCommissionAmount(0);
    }
  };

  // Değerler değiştiğinde otomatik hesaplama
  useEffect(() => {
    calculateCommission();
  }, [salePrice, commissionRate]);

  // Fiyat formatı (görüntüleme için)
  const formatPrice = (value) => {
    if (!value) return '0₺';

    const numberValue = Number(value);
    if (isNaN(numberValue)) return '0₺';

    // Sayıyı en yakın tam sayıya yuvarla
    const roundedValue = Math.round(numberValue);
    
    // Tamsayı kısmına binlik ayraçları ekle
    const integerPart = roundedValue.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        
    return `${integerPart}₺`;
  };

  // Fiyat input'u için - noktalı format ile
  const handlePriceChange = (text) => {
    // Sadece sayıları al
    const numericOnly = text.replace(/[^\d]/g, '');

    // Raw sayıyı sakla (hesaplama için)
    setSalePrice(numericOnly);

    // Görüntüleme için noktalı format
    if (numericOnly === '') {
      setDisplayPrice('');
    } else {
      const formatted = numericOnly.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
      setDisplayPrice(formatted);
    }
  };

  // Oran input'u için
  const handleRateChange = (text) => {
    // Sadece sayı ve nokta virgül kabul et
    const cleanText = text.replace(/[^\d.,]/g, '');
    setCommissionRate(cleanText);
  };

  // Temizle butonu
  const clearAll = () => {
    setSalePrice('');
    setDisplayPrice('');
    setCommissionRate('');
    setCommissionAmount(0);
  };

  const renderHeader = () => (
    <View style={styles.header}>
      <View style={styles.headerLeft}>
        <TouchableOpacity
          style={styles.headerButtonBack}
          onPress={() => navigation.goBack()}
        >
          <Image source={require('../assets/images/icons/return.png')} style={styles.headerButtonIconBack} />
        </TouchableOpacity>
      </View>
      <View style={styles.headerCenter}>
        <View style={{ alignItems: 'center' }}>
          <Text style={styles.headerTitle}>Komisyon Hesaplama</Text>
          <Text style={styles.headerSubtitle}>Satış tutarı ve oran ile komisyonu hesaplayın</Text>
        </View>
      </View>
      <View style={styles.headerRight} />
    </View>
  );

  const renderInfoSection = () => (
    <GlassmorphismView
      style={styles.infoCard}
      borderRadius={12}
      config={cardConfig}
      blurEnabled={false}
    >
      <Text style={styles.infoTitle}>💡 Bilgi</Text>
      <Text style={styles.infoText}>
        Bu araç ile emlak satış komisyonunuzu kolayca hesaplayabilirsiniz.
        Satış fiyatını ve komisyon oranınızı girerek anında sonucu görebilirsiniz.
      </Text>
    </GlassmorphismView>
  );

  const renderCalculatorSection = () => (
    <GlassmorphismView
      style={styles.calculatorCard}
      borderRadius={12}
      config={cardConfig}
      blurEnabled={false}
    >
      <Text style={styles.sectionTitle}>Komisyon Hesaplayıcı</Text>

      {/* Satış Fiyatı */}
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Satış Fiyatı</Text>
        <TextInput
          style={styles.priceInput}
          value={displayPrice}
          onChangeText={handlePriceChange}
          placeholder="1.000.000"
          placeholderTextColor={theme.colors.textSecondary}
          keyboardType="numeric"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {/* Komisyon Oranı */}
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Komisyon Oranı (%)</Text>
        <TextInput
          style={styles.rateInput}
          value={commissionRate}
          onChangeText={handleRateChange}
          placeholder="2"
          placeholderTextColor={theme.colors.textSecondary}
          keyboardType="numeric"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {/* Sonuç */}
      <View style={styles.resultContainer}>
        <Text style={styles.resultLabel}>Komisyon Tutarı</Text>
        <Text style={styles.resultAmount}>
          {commissionAmount > 0 ? formatPrice(commissionAmount) : '0₺'}
        </Text>
      </View>

      {/* Temizle Butonu */}
      <TouchableOpacity style={styles.clearButton} onPress={clearAll}>
        <Text style={styles.clearButtonText}>Temizle</Text>
      </TouchableOpacity>
    </GlassmorphismView>
  );

  return (
    <SafeAreaView edges={['left','right','bottom']} style={{ flex: 1, backgroundColor: 'transparent' }}>
      <ImageBackground
        source={isDark ? require('../assets/images/dark-bg2.png') : require('../assets/images/light-bg.jpg')}
        defaultSource={isDark ? require('../assets/images/dark-bg2.png') : require('../assets/images/light-bg.jpg')}
        fadeDuration={0}
        style={[styles.backgroundImage, { backgroundColor: isDark ? '#071317' : '#FFFFFF' }]}
      >
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 0) + 12 }]}>
          <View style={styles.headerLeft}>
            <TouchableOpacity
              style={styles.headerButtonBack}
              onPress={() => navigation.goBack()}
            >
              <Image source={require('../assets/images/icons/return.png')} style={styles.headerButtonIconBack} />
            </TouchableOpacity>
          </View>
          <View style={styles.headerCenter}>
            <View style={{ alignItems: 'center' }}>
              <Text style={styles.headerTitle}>Komisyon Hesaplama</Text>
              <Text style={styles.headerSubtitle}>Satış tutarı ve oran ile komisyonu hesaplayın</Text>
            </View>
          </View>
          <View style={styles.headerRight} />
        </View>

        {/* Spacer: header yüksekliği kadar boşluk (insets.top + 12 + 37 + spacing.lg) */}
        <View style={{ height: Math.max(insets.top, 0) + 12 + 37 + ((currentTheme?.spacing && currentTheme.spacing.lg) ? currentTheme.spacing.lg : 16) }} />

        <Animatable.View
          ref={pageViewRef}
          useNativeDriver
          style={[styles.content, { opacity: 0, transform: [{ translateY: 8 }] }]}>
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={[
                styles.scrollContent,
                { paddingBottom: insets.bottom + 50 },
              ]}
              showsVerticalScrollIndicator={false}
            >
              {renderInfoSection()}
              {renderCalculatorSection()}
            </ScrollView>
          </KeyboardAvoidingView>
        </Animatable.View>
      </View>
      </ImageBackground>
    </SafeAreaView>
  );
};

const stylesFactory = (theme, isDark) => StyleSheet.create({
  backgroundImage: {
    flex: 1,
    resizeMode: 'cover',
  },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  header: {
    paddingHorizontal: theme.spacing.lg,
    /* üst padding runtime'da insets.top + 12 olarak veriliyor */
    paddingBottom: theme.spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 20,
    minHeight: 60,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
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
  headerRight: {
    width: 40, // Geri butonu ile aynı genişlikte boşluk
  },
  headerButtonBack: {
    backgroundColor: theme.colors.error,
    width: 37,
    height: 37,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerButtonIconBack: {
    width: 16,
    height: 16,
    tintColor: theme.colors.white,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.white,
  },
  headerSubtitle: {
    marginTop: 4,
    fontSize: 12,
    color: theme.colors.mutedText,
  },
  placeholder: {
    width: 44,
  },
  content: {
    flex: 1,
  },

  scrollView: {
    flex: 1,
  },

  scrollContent: {
    padding: 20,
    flexGrow: 1,
  },

  infoCard: {
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    overflow: 'hidden',
  },

  infoTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.white,
    marginBottom: 10,
  },

  infoText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    lineHeight: 20,
  },

  calculatorCard: {
    borderRadius: 12,
    padding: 20,
    overflow: 'hidden',
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.white,
    marginBottom: 20,
    textAlign: 'center',
  },

  inputGroup: {
    marginBottom: 20,
  },

  inputLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.9)',
    marginBottom: 8,
  },

  priceInput: {
    backgroundColor: theme.colors.inputBg,
    borderWidth: 0,
    borderRadius: 8,
    padding: 15,
    fontSize: 18,
    color: theme.colors.white,
    fontWeight: '600',
  },

  rateInput: {
    backgroundColor: theme.colors.inputBg,
    borderWidth: 0,
    borderRadius: 8,
    padding: 15,
    fontSize: 18,
    color: theme.colors.white,
    fontWeight: '600',
  },

  resultContainer: {
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderWidth: 2,
    borderColor: theme.colors.error,
    borderRadius: 8,
    padding: 20,
    alignItems: 'center',
    marginBottom: 20,
  },

  resultLabel: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.8)',
    marginBottom: 8,
  },

  resultAmount: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme.colors.white,
  },

  clearButton: {
    backgroundColor: theme.colors.error,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
  },

  clearButtonText: {
    color: theme.colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
});

export default CommissionCalculator;
