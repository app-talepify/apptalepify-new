import React, { useState, useCallback, useMemo, memo, useEffect, useRef } from 'react';
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
import * as Animatable from 'react-native-animatable';
import GlassmorphismView from '../components/GlassmorphismView';

const PropertyValueCalculator = () => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { theme: currentTheme, isDark } = useTheme();
  const styles = useMemo(() => stylesFactory(currentTheme, isDark), [currentTheme, isDark]);
  // Sayfa içeriği için giriş/çıkış animasyonu (header sabit)
  const pageViewRef = useRef(null);
  const customEnterAnimation = useMemo(() => ({
    from: { opacity: 0, translateY: 8 },
    to: { opacity: 1, translateY: 0 },
  }), []);
  const customExitAnimation = useMemo(() => ({
    from: { opacity: 1, translateY: 0 },
    to: { opacity: 1, translateY: 0 },
  }), []);
  
  // Profile sayfasındaki Hakkında container'ının Skia gradient ayarları
  const aboutConfig = useMemo(() => ({
    overlayColor: 'rgba(224, 220, 220, 0.81)',
    startColor: 'rgba(17, 36, 49, 1)',
    endColor: 'rgba(17, 36, 49, 0.64)',
    gradientAlpha: 1,
    gradientDirection: 150,
    gradientSpread: 7,
    ditherStrength: 4.0,
  }), []);
  useFocusEffect(
    useCallback(() => {
      if (pageViewRef.current) {
        try { pageViewRef.current.animate(customEnterAnimation, 600); } catch {}
      }
      return () => {
        if (pageViewRef.current) {
          try { pageViewRef.current.animate(customExitAnimation, 200); } catch {}
        }
      };
    }, [customEnterAnimation, customExitAnimation])
  );

  const [purchaseDate, setPurchaseDate] = useState('');
  const [saleDate, setSaleDate] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [salePrice, setSalePrice] = useState('');

  const [displayInterest, setDisplayInterest] = useState('');
  const [displayPurchasePrice, setDisplayPurchasePrice] = useState('');
  const [displaySalePrice, setDisplaySalePrice] = useState('');
  const [displayPurchaseDate, setDisplayPurchaseDate] = useState('');
  const [displaySaleDate, setDisplaySaleDate] = useState('');

  const [calculationResult, setCalculationResult] = useState(null);

  // 2024-2025 Yılı Vergi Dilimleri (Güncel)
  const taxBrackets = useMemo(() => [
    { min: 0, max: 49000, rate: 0.15 },
    { min: 49000, max: 120000, rate: 0.20 },
    { min: 120000, max: 600000, rate: 0.27 },
    { min: 600000, max: Infinity, rate: 0.35 },
  ], []);

  // Yıllara göre İstisna Tutarları
  const getExemptionAmount = useCallback((saleDateParam) => {
    const year = new Date(saleDateParam).getFullYear();
    const exemptions = {
      2021: 19000,
      2022: 19000,
      2023: 19000,
      2024: 55000,
      2025: 55000,
    };
    return exemptions[year] || 55000; // Varsayılan 2025 değeri
  }, []);

  // Yİ-ÜFE Verileri (Gerçek TÜİK Verileri) - Optimized with useMemo
  const tufeData = useMemo(() => ({
    '01-2005': 10.70, '02-2005': 10.58, '03-2005': 11.33, '04-2005': 10.17, '05-2005': 5.59, '06-2005': 4.25,
    '07-2005': 4.26, '08-2005': 4.32, '09-2005': 4.38, '10-2005': 2.57, '11-2005': 1.60, '12-2005': 2.66,
    '01-2006': 5.11, '02-2006': 5.26, '03-2006': 4.21, '04-2006': 4.96, '05-2006': 7.66, '06-2006': 12.52,
    '07-2006': 14.34, '08-2006': 12.32, '09-2006': 11.19, '10-2006': 10.94, '11-2006': 11.67, '12-2006': 11.58,
    '01-2007': 9.37, '02-2007': 10.13, '03-2007': 10.92, '04-2007': 9.68, '05-2007': 7.14, '06-2007': 2.89,
    '07-2007': 2.08, '08-2007': 3.72, '09-2007': 5.02, '10-2007': 4.41, '11-2007': 5.65, '12-2007': 5.94,
    '01-2008': 6.44, '02-2008': 8.15, '03-2008': 10.50, '04-2008': 14.56, '05-2008': 16.53, '06-2008': 17.03,
    '07-2008': 18.41, '08-2008': 14.67, '09-2008': 12.49, '10-2008': 13.29, '11-2008': 12.25, '12-2008': 8.11,
    '01-2009': 7.90, '02-2009': 6.43, '03-2009': 3.46, '04-2009': -0.35, '05-2009': -2.46, '06-2009': -1.86,
    '07-2009': -3.75, '08-2009': -1.04, '09-2009': 0.47, '10-2009': 0.19, '11-2009': 1.51, '12-2009': 5.93,
    '01-2010': 6.30, '02-2010': 6.82, '03-2010': 8.58, '04-2010': 10.42, '05-2010': 9.21, '06-2010': 7.64,
    '07-2010': 8.24, '08-2010': 9.03, '09-2010': 8.91, '10-2010': 9.92, '11-2010': 8.17, '12-2010': 8.87,
    '01-2011': 10.80, '02-2011': 10.87, '03-2011': 10.08, '04-2011': 8.21, '05-2011': 9.63, '06-2011': 10.19,
    '07-2011': 10.34, '08-2011': 11.00, '09-2011': 12.15, '10-2011': 12.58, '11-2011': 13.67, '12-2011': 13.33,
    '01-2012': 11.13, '02-2012': 9.15, '03-2012': 8.22, '04-2012': 7.65, '05-2012': 8.06, '06-2012': 6.44,
    '07-2012': 6.13, '08-2012': 4.56, '09-2012': 4.03, '10-2012': 2.57, '11-2012': 3.60, '12-2012': 2.45,
    '01-2013': 1.88, '02-2013': 1.84, '03-2013': 2.30, '04-2013': 1.70, '05-2013': 2.17, '06-2013': 5.23,
    '07-2013': 6.61, '08-2013': 6.38, '09-2013': 6.23, '10-2013': 6.77, '11-2013': 5.67, '12-2013': 6.97,
    '01-2014': 10.72, '02-2014': 12.40, '03-2014': 12.31, '04-2014': 12.98, '05-2014': 11.28, '06-2014': 9.75,
    '07-2014': 9.46, '08-2014': 9.88, '09-2014': 9.84, '10-2014': 10.10, '11-2014': 8.36, '12-2014': 6.36,
    '01-2015': 3.28, '02-2015': 3.10, '03-2015': 3.41, '04-2015': 4.80, '05-2015': 6.52, '06-2015': 6.73,
    '07-2015': 5.62, '08-2015': 6.21, '09-2015': 6.92, '10-2015': 5.74, '11-2015': 5.25, '12-2015': 5.71,
    '01-2016': 5.94, '02-2016': 4.47, '03-2016': 3.80, '04-2016': 2.87, '05-2016': 3.25, '06-2016': 3.41,
    '07-2016': 3.96, '08-2016': 3.03, '09-2016': 1.78, '10-2016': 2.84, '11-2016': 6.41, '12-2016': 9.94,
    '01-2017': 13.69, '02-2017': 15.36, '03-2017': 16.09, '04-2017': 16.37, '05-2017': 15.26, '06-2017': 14.87,
    '07-2017': 15.45, '08-2017': 16.34, '09-2017': 16.28, '10-2017': 17.28, '11-2017': 17.30, '12-2017': 15.47,
    '01-2018': 12.14, '02-2018': 13.71, '03-2018': 14.28, '04-2018': 16.37, '05-2018': 20.16, '06-2018': 23.71,
    '07-2018': 25.00, '08-2018': 32.13, '09-2018': 46.15, '10-2018': 45.01, '11-2018': 38.54, '12-2018': 33.64,
    '01-2019': 32.93, '02-2019': 29.59, '03-2019': 29.64, '04-2019': 30.12, '05-2019': 28.71, '06-2019': 25.04,
    '07-2019': 21.66, '08-2019': 13.45, '09-2019': 2.45, '10-2019': 1.70, '11-2019': 4.26, '12-2019': 7.36,
    '01-2020': 8.84, '02-2020': 9.26, '03-2020': 8.50, '04-2020': 6.71, '05-2020': 5.53, '06-2020': 6.17,
    '07-2020': 8.33, '08-2020': 11.53, '09-2020': 14.33, '10-2020': 18.20, '11-2020': 23.11, '12-2020': 25.15,
    '01-2021': 26.16, '02-2021': 27.09, '03-2021': 31.20, '04-2021': 35.17, '05-2021': 38.33, '06-2021': 42.89,
    '07-2021': 44.92, '08-2021': 45.52, '09-2021': 43.96, '10-2021': 46.31, '11-2021': 54.62, '12-2021': 79.89,
    '01-2022': 93.53, '02-2022': 105.01, '03-2022': 114.97, '04-2022': 121.82, '05-2022': 132.16, '06-2022': 138.31,
    '07-2022': 144.61, '08-2022': 143.75, '09-2022': 151.50, '10-2022': 157.69, '11-2022': 136.02, '12-2022': 97.72,
    '01-2023': 86.46, '02-2023': 76.61, '03-2023': 62.45, '04-2023': 52.11, '05-2023': 40.76, '06-2023': 40.42,
    '07-2023': 44.50, '08-2023': 49.41, '09-2023': 47.44, '10-2023': 39.39, '11-2023': 42.25, '12-2023': 44.22,
    '01-2024': 44.20, '02-2024': 47.29, '03-2024': 51.47, '04-2024': 55.66, '05-2024': 57.68, '06-2024': 50.09,
    '07-2024': 41.37, '08-2024': 35.75, '09-2024': 33.09, '10-2024': 32.24, '11-2024': 29.47, '12-2024': 28.52,
    '01-2025': 27.20, '02-2025': 25.21, '03-2025': 23.50, '04-2025': 22.50, '05-2025': 23.13, '06-2025': 24.45,
    '07-2025': 24.19, '08-2025': 25.16,
  }), []);

  // Tarih formatını dönüştür (GGAAYYYY -> AA-YYYY)
  const formatDateForTufe = useCallback((dateString) => {
    if (!dateString || dateString.length < 8) {
      return null;
    }

    // GGAAYYYY formatından AA-YYYY'ye dönüştür
    const month = dateString.slice(2, 4);
    const year = dateString.slice(4, 8);

    return `${month}-${year}`;
  }, []);

  // TÜFE bazlı enflasyon hesaplama
  const calculateInflation = useCallback((purchaseDateParam, saleDateParam) => {
    const purchaseTufeKey = formatDateForTufe(purchaseDateParam);
    const saleTufeKey = formatDateForTufe(saleDateParam);

    if (!purchaseTufeKey || !saleTufeKey) {
      // Tarih formatı hatalıysa varsayılan %30 yıllık enflasyon
      const purchaseYear = new Date(purchaseDateParam).getFullYear();
      const saleYear = new Date(saleDateParam).getFullYear();
      const years = saleYear - purchaseYear;
      return Math.pow(1.30, years);
    }

    const purchaseTufe = tufeData[purchaseTufeKey];
    const saleTufe = tufeData[saleTufeKey];

    if (!purchaseTufe || !saleTufe) {
      // TÜFE verisi yoksa varsayılan %30 yıllık enflasyon
      const purchaseYear = new Date(purchaseDateParam).getFullYear();
      const saleYear = new Date(saleDateParam).getFullYear();
      const years = saleYear - purchaseYear;
      return Math.pow(1.30, years);
    }

    // Yİ-ÜFE oranı hesaplama: (Alış Yİ-ÜFE / Satış Yİ-ÜFE) - Ters çünkü Yİ-ÜFE düşüyor
    return purchaseTufe / saleTufe;
  }, [formatDateForTufe, tufeData]);

  // Vergi hesaplama
  const calculateTax = useCallback((taxableAmount) => {
    let totalTax = 0;
    let remainingAmount = taxableAmount;

    for (const bracket of taxBrackets) {
      if (remainingAmount <= 0) {
        break;
      }

      const bracketAmount = Math.min(remainingAmount, bracket.max - bracket.min);
      const bracketTax = bracketAmount * bracket.rate;
      totalTax += bracketTax;
      remainingAmount -= bracketAmount;
    }

    return totalTax;
  }, [taxBrackets]);

  // Ana hesaplama fonksiyonu
  const calculatePropertyValue = useCallback(() => {
    if (!purchaseDate || !saleDate || !purchasePrice || !salePrice) {
      Alert.alert('Hata', 'Lütfen tüm alanları doldurun');
      return;
    }

    if (purchaseDate.length < 8 || saleDate.length < 8) {
      Alert.alert('Hata', 'Lütfen tarihleri tam olarak girin (GG.AA.YYYY)');
      return;
    }

    const purchasePriceNum = parseFloat(purchasePrice) || 0;
    const salePriceNum = parseFloat(salePrice) || 0;

    // Enflasyon düzeltmesi (TÜFE bazlı)
    const inflationRate = calculateInflation(purchaseDate, saleDate);
    const adjustedPurchasePrice = purchasePriceNum * inflationRate;

    // Safi kâr (makaledeki formül: Satış Fiyatı - Düzeltilmiş Alış Bedeli)
    const netProfit = salePriceNum - adjustedPurchasePrice;

    // Yıllık istisna tutarı
    const exemptionAmount = getExemptionAmount(saleDate);

    // İstisna sonrası matrah (Safi Kâr - İstisna Tutarı)
    const taxableAmount = Math.max(0, netProfit - exemptionAmount);

    // Ödenecek vergi
    const taxAmount = calculateTax(taxableAmount);

    // Tapu harcı (satış fiyatının %2'si)
    const titleDeedFee = salePriceNum * 0.02;

    // Net satış bedeli
    const netSalePrice = salePriceNum - titleDeedFee;

    // Damga vergisi (satış fiyatının %0.0672'si - Hesapkurdu ile uyumlu)
    const stampTax = salePriceNum * 0.000672;

    // Vergilendirme oranı (vergiye tabi tutar üzerinden)
    const taxRate = taxableAmount > 0 ? (taxAmount / taxableAmount) * 100 : 0;

    setCalculationResult({
      taxAmount: Math.round(taxAmount),
      inflationRate: Math.round((inflationRate - 1) * 100 * 100) / 100, // 2 ondalık
      adjustedPurchasePrice: Math.round(adjustedPurchasePrice),
      titleDeedFee: Math.round(titleDeedFee),
      netSalePrice: Math.round(netSalePrice),
      netProfit: Math.round(netProfit),
      exemptionAmount: Math.round(exemptionAmount),
      taxableAmount: Math.round(taxableAmount),
      stampTax: Math.round(stampTax),
      taxRate: Math.round(taxRate * 100) / 100, // 2 ondalık
    });
  }, [purchaseDate, saleDate, purchasePrice, salePrice, calculateInflation, getExemptionAmount, calculateTax]);

  // Fiyat formatı
  const formatPrice = useCallback((value) => {
    if (!value || value === '') {
      return '';
    }
    const numericValue = value.toString().replace(/[^\d]/g, '');
    if (numericValue === '') {
      return '';
    }
    const formattedValue = numericValue.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return formattedValue;
  }, []);

  // Tarih formatı (GG.AA.YYYY)
  const formatDate = useCallback((value) => {
    if (!value) {
      return '';
    }

    // Sadece sayıları al
    const numericOnly = value.replace(/[^\d]/g, '');

    if (numericOnly.length === 0) {
      return '';
    }
    if (numericOnly.length <= 2) {
      return numericOnly;
    }
    if (numericOnly.length <= 4) {
      return `${numericOnly.slice(0, 2)}.${numericOnly.slice(2)}`;
    }
    if (numericOnly.length <= 8) {
      return `${numericOnly.slice(0, 2)}.${numericOnly.slice(2, 4)}.${numericOnly.slice(4)}`;
    }

    // 8 karakterden fazla ise ilk 8 karakteri al
    return `${numericOnly.slice(0, 2)}.${numericOnly.slice(2, 4)}.${numericOnly.slice(4, 8)}`;
  }, []);

  // Tarih formatını temizle (GG.AA.YYYY -> GGAAYYYY)
  const cleanDate = useCallback((formattedDate) => {
    return formattedDate.replace(/[^\d]/g, '');
  }, []);

  // Input handlers
  const handlePurchaseDateChange = useCallback((text) => {
    const formatted = formatDate(text);
    setDisplayPurchaseDate(formatted);
    setPurchaseDate(cleanDate(formatted));
  }, [formatDate, cleanDate]);

  const handleSaleDateChange = useCallback((text) => {
    const formatted = formatDate(text);
    setDisplaySaleDate(formatted);
    setSaleDate(cleanDate(formatted));
  }, [formatDate, cleanDate]);

  const handleInterestChange = useCallback((text) => {
    const numericOnly = text.replace(/[^\d]/g, '');
    setDisplayInterest(formatPrice(numericOnly));
  }, [formatPrice]);

  const handlePurchasePriceChange = useCallback((text) => {
    const numericOnly = text.replace(/[^\d]/g, '');
    setPurchasePrice(numericOnly);
    setDisplayPurchasePrice(formatPrice(numericOnly));
  }, [formatPrice]);

  const handleSalePriceChange = useCallback((text) => {
    const numericOnly = text.replace(/[^\d]/g, '');
    setSalePrice(numericOnly);
    setDisplaySalePrice(formatPrice(numericOnly));
  }, [formatPrice]);

  // Temizle butonu
  const clearAll = useCallback(() => {
    setPurchaseDate('');
    setSaleDate('');
    setPurchasePrice('');
    setSalePrice('');
    setDisplayInterest('');
    setDisplayPurchasePrice('');
    setDisplaySalePrice('');
    setDisplayPurchaseDate('');
    setDisplaySaleDate('');
    setCalculationResult(null);
  }, []);

  const renderHeader = useCallback(() => (
    <View style={[styles.header, { paddingTop: Math.max(insets.top, 0) + 12 }]}>
      <View style={styles.headerLeft}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Geri"
        >
          <Image source={require('../assets/images/icons/return.png')} style={styles.backIcon} />
        </TouchableOpacity>
      </View>
      <View style={styles.headerCenter}>
        <View style={{ alignItems: 'center' }}>
          <Text style={styles.headerTitle}>Değer Kazanç Hesaplama</Text>
          <Text style={styles.headerSubtitle}>Satış ve alış verileriyle vergi kalemlerini görün</Text>
        </View>
      </View>
      <View style={styles.headerRight} />
    </View>
  ), [navigation, styles, insets.top]);

  const renderInfoSection = useCallback(() => (
    <GlassmorphismView
      style={styles.infoCard}
      borderRadius={12}
      blurEnabled={false}
      config={aboutConfig}
    >
      <Text style={styles.infoTitle}>💡 Bilgi</Text>
      <Text style={styles.infoText}>
        Gayrimenkul değer artış kazancı vergisini hesaplayın. Alış ve satış tarihleri,
        fiyatları girerek vergi tutarınızı öğrenin. Hesaplama TÜFE verilerine göre yapılır.
        {'\n\n'}• 5 yıl içinde satılan gayrimenkuller vergiye tabidir
        {'\n'}• 2021-2023 istisna tutarı: 19.000 TL
        {'\n'}• 2024-2025 istisna tutarı: 120.000 TL
        {'\n'}• Miras/bağış yoluyla alınan gayrimenkuller istisnadır
      </Text>
    </GlassmorphismView>
  ), [styles, aboutConfig]);

  const renderInputSection = useCallback(() => (
    <GlassmorphismView
      style={styles.inputCard}
      borderRadius={12}
      blurEnabled={false}
      config={aboutConfig}
    >
      <Text style={styles.sectionTitle}>Gayrimenkul Bilgileri</Text>

      {/* Alış Tarihi */}
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Evin Alındığı Tarih</Text>
        <TextInput
          style={styles.dateInput}
          value={displayPurchaseDate}
          onChangeText={handlePurchaseDateChange}
          placeholder="GG.AA.YYYY"
          placeholderTextColor={theme.colors.textSecondary}
          keyboardType="numeric"
          maxLength={10}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {/* Satış Tarihi */}
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Evin Satıldığı Tarih</Text>
        <TextInput
          style={styles.dateInput}
          value={displaySaleDate}
          onChangeText={handleSaleDateChange}
          placeholder="GG.AA.YYYY"
          placeholderTextColor={theme.colors.textSecondary}
          keyboardType="numeric"
          maxLength={10}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {/* Alış Fiyatı */}
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Evin Alış Fiyatı (TL)</Text>
        <TextInput
          style={styles.priceInput}
          value={displayPurchasePrice}
          onChangeText={handlePurchasePriceChange}
          placeholder="1.000.000"
          placeholderTextColor={theme.colors.textSecondary}
          keyboardType="numeric"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {/* Satış Fiyatı */}
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Evin Satış Fiyatı (TL)</Text>
        <TextInput
          style={styles.priceInput}
          value={displaySalePrice}
          onChangeText={handleSalePriceChange}
          placeholder="1.500.000"
          placeholderTextColor={theme.colors.textSecondary}
          keyboardType="numeric"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {/* Ödenen Faiz */}
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Ev İçin Ödenen Faiz (TL)</Text>
        <TextInput
          style={styles.priceInput}
          value={displayInterest}
          onChangeText={handleInterestChange}
          placeholder="50.000"
          placeholderTextColor={theme.colors.textSecondary}
          keyboardType="numeric"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {/* Hesapla Butonu */}
      <TouchableOpacity
        style={styles.calculateButton}
        onPress={calculatePropertyValue}
        accessibilityRole="button"
        accessibilityLabel="Hesapla"
      >
        <Text style={styles.calculateButtonText}>Hesapla</Text>
      </TouchableOpacity>

      {/* Temizle Butonu */}
      <TouchableOpacity
        style={styles.clearButton}
        onPress={clearAll}
        accessibilityRole="button"
        accessibilityLabel="Temizle"
      >
        <Text style={styles.clearButtonText}>Temizle</Text>
      </TouchableOpacity>
    </GlassmorphismView>
  ), [displayPurchaseDate, displaySaleDate, displayPurchasePrice, displaySalePrice, displayInterest, handlePurchaseDateChange, handleSaleDateChange, handlePurchasePriceChange, handleSalePriceChange, handleInterestChange, calculatePropertyValue, clearAll, styles, theme, aboutConfig]);

  const renderResultSection = useCallback(() => {
    if (!calculationResult) {
      return null;
    }

    return (
      <View style={styles.resultCard}>
        <Text style={styles.sectionTitle}>Hesaplama Sonuçları</Text>

        <View style={styles.resultRow}>
          <Text style={styles.resultLabel}>Ödenecek Vergi Tutarı:</Text>
          <Text style={styles.resultValue}>{formatPrice(calculationResult.taxAmount.toString())} TL</Text>
        </View>

        <View style={styles.resultRow}>
          <Text style={styles.resultLabel}>Endeks Artışı:</Text>
          <Text style={styles.resultValue}>%{calculationResult.inflationRate}</Text>
        </View>

        <View style={styles.resultRow}>
          <Text style={styles.resultLabel}>Düzeltilmiş Alış Bedeli:</Text>
          <Text style={styles.resultValue}>{formatPrice(calculationResult.adjustedPurchasePrice.toString())} TL</Text>
        </View>

        <View style={styles.resultRow}>
          <Text style={styles.resultLabel}>Tapu Harcı:</Text>
          <Text style={styles.resultValue}>{formatPrice(calculationResult.titleDeedFee.toString())} TL</Text>
        </View>

        <View style={styles.resultRow}>
          <Text style={styles.resultLabel}>Net Satış Bedeli:</Text>
          <Text style={styles.resultValue}>{formatPrice(calculationResult.netSalePrice.toString())} TL</Text>
        </View>

        <View style={styles.resultRow}>
          <Text style={styles.resultLabel}>Safi Kâr:</Text>
          <Text style={styles.resultValue}>{formatPrice(calculationResult.netProfit.toString())} TL</Text>
        </View>

        <View style={styles.resultRow}>
          <Text style={styles.resultLabel}>İstisna Sonrası Matrah:</Text>
          <Text style={styles.resultValue}>{formatPrice(calculationResult.taxableAmount.toString())} TL</Text>
        </View>

        <View style={styles.resultRow}>
          <Text style={styles.resultLabel}>Damga Vergisi:</Text>
          <Text style={styles.resultValue}>{formatPrice(calculationResult.stampTax.toString())} TL</Text>
        </View>

        <View style={styles.resultRow}>
          <Text style={styles.resultLabel}>Vergilendirme Oranı:</Text>
          <Text style={styles.resultValue}>%{calculationResult.taxRate}</Text>
        </View>
      </View>
    );
  }, [calculationResult, formatPrice, styles]);

  return (
    <SafeAreaView edges={['left','right','bottom']} style={{ flex: 1, backgroundColor: 'transparent' }}>
      <ImageBackground
        source={isDark ? require('../assets/images/dark-bg2.png') : require('../assets/images/light-bg.jpg')}
        defaultSource={isDark ? require('../assets/images/dark-bg2.png') : require('../assets/images/light-bg.jpg')}
        fadeDuration={0}
        style={[styles.backgroundImage, { backgroundColor: isDark ? '#071317' : '#FFFFFF' }]}
      >
      <View style={styles.container}>
        {renderHeader()}

        {/* Spacer: header yüksekliği kadar boşluk (insets.top + 12 + 37 + spacing.lg) */}
        <View style={{ height: Math.max(insets.top, 0) + 12 + 37 + ((currentTheme?.spacing && currentTheme.spacing.lg) ? currentTheme.spacing.lg : 16) }} />

        <Animatable.View ref={pageViewRef} style={[styles.content, { opacity: 0, transform: [{ translateY: 8 }] }]} useNativeDriver>
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
              {renderInputSection()}
              {renderResultSection()}
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    /* üst padding runtime'da insets.top + 12 olarak veriliyor */
    paddingBottom: theme.spacing.lg,
    backgroundColor: 'transparent',
    borderBottomWidth: 0,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    minHeight: 60,
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
    width: 40,
  },

  backButton: {
    backgroundColor: theme.colors.error,
    width: 37,
    height: 37,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 0,
  },

  backIcon: {
    width: 20,
    height: 20,
    tintColor: theme.colors.white,
  },

  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.white,
    textAlign: 'center',
  },
  headerSubtitle: {
    marginTop: 4,
    fontSize: 12,
    color: theme.colors.mutedText,
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
    backgroundColor: 'transparent',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    borderWidth: 0,
  },

  infoTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.primary,
    marginBottom: 10,
  },

  infoText: {
    fontSize: 14,
    color: theme.colors.white,
    lineHeight: 20,
  },

  inputCard: {
    backgroundColor: 'transparent',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    borderWidth: 0,
  },

  resultCard: {
    backgroundColor: theme.colors.cardBg,
    borderRadius: 12,
    padding: 20,
    borderWidth: 0,
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
    color: theme.colors.white,
    marginBottom: 8,
  },

  dateInput: {
    backgroundColor: theme.colors.inputBg,
    borderWidth: 0,
    borderRadius: 8,
    padding: 15,
    fontSize: 16,
    color: theme.colors.white,
  },

  priceInput: {
    backgroundColor: theme.colors.inputBg,
    borderWidth: 0,
    borderRadius: 8,
    padding: 15,
    fontSize: 16,
    color: theme.colors.white,
    fontWeight: '600',
  },

  calculateButton: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 10,
  },

  calculateButtonText: {
    color: theme.colors.white,
    fontSize: 18,
    fontWeight: '600',
  },

  clearButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: theme.colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
  },

  clearButtonText: {
    color: theme.colors.primary,
    fontSize: 16,
    fontWeight: '600',
  },

  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },

  resultLabel: {
    fontSize: 14,
    color: theme.colors.white,
    flex: 1,
  },

  resultValue: {
    fontSize: 14,
    color: theme.colors.primary,
    fontWeight: '600',
  },
});

export default memo(PropertyValueCalculator);
