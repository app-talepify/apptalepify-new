import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  Animated,
  Modal,
  Switch,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { theme } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';


const Payment = () => {
  const { theme: currentTheme } = useTheme();
  const navigation = useNavigation();
  const route = useRoute();
  const { package: selectedPackage, plan } = route.params || {};
  const { userProfile, claimReferralReward } = useAuth();

  const [fadeAnim] = useState(new Animated.Value(0));
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('card'); // 'card' veya 'transfer'
  const [autoRenew, setAutoRenew] = useState(true);
  const successTimeoutRef = React.useRef(null);

  // Form state
  const [formData, setFormData] = useState({
    cardHolderName: '',
    cardNumber: '',
    expiryDate: '',
    cvc: '',
  });

  // Kredi kartı validasyon state
  // const [cardValidation, setCardValidation] = useState({
  //   cardNumber: { isValid: false, message: '' },
  //   expiryDate: { isValid: false, message: '' },
  //   cvc: { isValid: false, message: '' },
  // });

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start();
    return () => {
      if (successTimeoutRef.current) {
        try { clearTimeout(successTimeoutRef.current); } catch {}
        successTimeoutRef.current = null;
      }
    };
  }, [fadeAnim]);

  const handleInputChange = useCallback((field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));

    // Validasyon yap
    validateField(field, value);
  }, [validateField]);

  const validateField = useCallback((field, value) => {
    // let isValid = false;
    // let message = '';

    switch (field) {
      case 'cardNumber': {
        // const cleanCardNumber = value.replace(/\s/g, '');
        // isValid = cleanCardNumber.length === 16 && /^\d+$/.test(cleanCardNumber);
        // message = isValid ? '' : '16 haneli kart numarası gerekli';
        break;
      }

      case 'expiryDate': {
        // const cleanExpiry = value.replace(/\D/g, '');
        // if (cleanExpiry.length === 4) {
        //   const month = parseInt(cleanExpiry.substring(0, 2), 10);
        //   const year = parseInt(cleanExpiry.substring(2, 4), 10);
        //   const currentYear = new Date().getFullYear() % 100;
        //   const currentMonth = new Date().getMonth() + 1;

        //   // isValid = month >= 1 && month <= 12 &&
        //   //          (year > currentYear || (year === currentYear && month >= currentMonth));
        //   // message = isValid ? '' : 'Geçerli bir son kullanma tarihi girin';
        // } else {
        //   // message = 'AA/YY formatında girin';
        // }
        break;
      }

      case 'cvc': {
        // isValid = value.length === 3 && /^\d+$/.test(value);
        // message = isValid ? '' : '3 haneli CVC kodu gerekli';
        break;
      }

      default:
        break;
    }

    // setCardValidation(prev => ({
    //   ...prev,
    //   [field]: { isValid, message },
    // }));
  }, []);

  const formatCardNumber = useCallback((text) => {
    const cleaned = text.replace(/\s/g, '');
    const groups = cleaned.match(/.{1,4}/g);
    return groups ? groups.join(' ') : cleaned;
  }, []);

  const formatExpiryDate = useCallback((text) => {
    const cleaned = text.replace(/\D/g, '');
    if (cleaned.length >= 2) {
      return cleaned.slice(0, 2) + '/' + cleaned.slice(2, 4);
    }
    return cleaned;
  }, []);

  const validateForm = useCallback(() => {
    if (paymentMethod === 'card') {
      if (!formData.cardHolderName.trim()) {
        Alert.alert('Hata', 'Lütfen kart sahibinin adını girin.');
        return false;
      }

      // Geçici olarak doğrulama kontrollerini devre dışı bırakıyoruz
      // const allFieldsValid = Object.values(cardValidation).every(field => field.isValid);
      // if (!allFieldsValid) {
      //   Alert.alert('Hata', 'Lütfen tüm kart bilgilerini doğru şekilde doldurun.');
      //   return false;
      // }
    }
    return true;
  }, [paymentMethod, formData.cardHolderName]);

  const handlePayment = useCallback(async () => {
    if (!validateForm()) {
      return;
    }

    setIsProcessing(true);

    try {
      // Simüle edilmiş ödeme işlemi
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Referans ödülünü ver (eğer referans kodu ile kayıt olmuşsa)
      if (userProfile?.referredBy) {
        try {
          const referralResult = await claimReferralReward(
            userProfile.referredBy,
            userProfile.uid,
          );

          if (referralResult.success) {
            // console.log('Referans ödülü verildi:', referralResult.message);
          } else {
            // console.log('Referans ödülü verilemedi:', referralResult.error);
          }
        } catch (error) {
          // console.error('Referans ödülü hatası:', error);
        }
      }

      // Başarılı ödeme
      setShowSuccessModal(true);

      if (successTimeoutRef.current) { try { clearTimeout(successTimeoutRef.current); } catch {} }
      successTimeoutRef.current = setTimeout(() => {
        setShowSuccessModal(false);
        navigation.navigate('Subscription');
        successTimeoutRef.current = null;
      }, 2000);

    } catch (error) {
      Alert.alert('Hata', 'Ödeme işlemi sırasında bir hata oluştu. Lütfen tekrar deneyin.');
    } finally {
      setIsProcessing(false);
    }
  }, [validateForm, userProfile, claimReferralReward, navigation]);

  const handleBankTransfer = useCallback(() => {
    Alert.alert(
      'Havale/EFT Bilgileri',
      `Banka: Talepify Bank\nIBAN: TR00 0000 0000 0000 0000 0000 00\nAçıklama: ${selectedPackage?.name || plan} abonelik ödemesi\nTutar: ${selectedPackage?.price || '199.00'}₺`,
      [
        { text: 'IBAN Kopyala', onPress: () => Alert.alert('Kopyalandı', 'IBAN kopyalandı.') },
        { text: 'Tamam' },
      ],
    );
  }, [selectedPackage, plan]);

  const renderInput = useCallback((label, field, placeholder, keyboardType = 'default', maxLength = null, formatter = null) => (
    <View style={styles.inputContainer}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={formatter ? formatter(formData[field]) : formData[field]}
        onChangeText={(text) => {
          const value = formatter ? text.replace(/\s/g, '') : text;
          handleInputChange(field, value);
        }}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textSecondary}
        keyboardType={keyboardType}
        maxLength={maxLength}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry={field === 'cvc'}
      />
      {/* Geçici olarak doğrulama mesajlarını kaldırdık */}
    </View>
  ), [formData, handleInputChange]);

  const renderPaymentMethodSelector = useCallback(() => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Ödeme Yöntemi</Text>

      <View style={styles.paymentMethodContainer}>
        <TouchableOpacity
          style={[
            styles.paymentMethodOption,
            paymentMethod === 'card' && styles.paymentMethodSelected,
          ]}
          onPress={() => setPaymentMethod('card')}
        >
          <Text style={[
            styles.paymentMethodText,
            paymentMethod === 'card' && styles.paymentMethodTextSelected,
          ]}>
            💳 Kredi Kartı
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.paymentMethodOption,
            paymentMethod === 'transfer' && styles.paymentMethodSelected,
          ]}
          onPress={() => setPaymentMethod('transfer')}
        >
          <Text style={[
            styles.paymentMethodText,
            paymentMethod === 'transfer' && styles.paymentMethodTextSelected,
          ]}>
            🏦 Havale/EFT
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  ), [paymentMethod]);

  const renderCardForm = useCallback(() => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Kart Bilgileri</Text>

      {renderInput(
        'Kart Üzerindeki İsim',
        'cardHolderName',
        'Ad Soyad',
        'default',
      )}

      {renderInput(
        'Kart Numarası',
        'cardNumber',
        '0000 0000 0000 0000',
        'numeric',
        19,
        formatCardNumber,
      )}

      <View style={styles.row}>
        {renderInput(
          'Son Kullanma Tarihi',
          'expiryDate',
          'AA/YY',
          'numeric',
          5,
          formatExpiryDate,
        )}

        {renderInput(
          'CVC',
          'cvc',
          '123',
          'numeric',
          3,
        )}
      </View>
    </View>
  ), [renderInput, formatCardNumber, formatExpiryDate]);

  const renderTransferInfo = useCallback(() => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Havale/EFT Bilgileri</Text>

      <View style={styles.transferCard}>
        <View style={styles.transferRow}>
          <Text style={styles.transferLabel}>Banka:</Text>
          <Text style={styles.transferValue}>Talepify Bank</Text>
        </View>

        <View style={styles.transferRow}>
          <Text style={styles.transferLabel}>IBAN:</Text>
          <Text style={styles.transferValue}>TR00 0000 0000 0000 0000 0000 00</Text>
        </View>

        <View style={styles.transferRow}>
          <Text style={styles.transferLabel}>Tutar:</Text>
          <Text style={styles.transferValue}>{selectedPackage?.price || '199.00'}₺</Text>
        </View>

        <View style={styles.transferRow}>
          <Text style={styles.transferLabel}>Açıklama:</Text>
          <Text style={styles.transferValue}>{selectedPackage?.name || plan} abonelik</Text>
        </View>

        <TouchableOpacity style={styles.copyButton} onPress={handleBankTransfer}>
          <Text style={styles.copyButtonText}>IBAN Kopyala</Text>
        </TouchableOpacity>
      </View>
    </View>
  ), [selectedPackage, plan, handleBankTransfer]);

  const renderSuccessModal = useCallback(() => (
    <Modal
      visible={showSuccessModal}
      transparent={true}
      animationType="fade"
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.successIcon}>
            <Text style={styles.successIconText}>✓</Text>
          </View>
          <Text style={styles.modalTitle}>Başarılı!</Text>
          <Text style={styles.modalMessage}>
            {selectedPackage?.name || plan} aboneliğiniz başarıyla başlatıldı!
          </Text>
          <Text style={styles.modalSubMessage}>
            {autoRenew ? 'Otomatik yenileme aktif edildi.' : 'Manuel yenileme gerekli.'}
          </Text>
        </View>
      </View>
    </Modal>
  ), [showSuccessModal, selectedPackage, plan, autoRenew]);

  const packageName = useMemo(() => selectedPackage?.name || plan || 'Seçilen Paket', [selectedPackage, plan]);
  const packagePrice = useMemo(() => selectedPackage?.price || '199.00', [selectedPackage]);

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
        <Text style={styles.headerTitle}>Ödeme</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Ödeme Bilgileri</Text>

            <View style={styles.packageSummary}>
              <Text style={styles.packageSummaryText}>
                Seçilen Paket: <Text style={styles.packageName}>{packageName}</Text>
              </Text>
              <Text style={styles.packagePrice}>{packagePrice}₺</Text>

              {selectedPackage?.discount > 0 && (
                <Text style={styles.discountInfo}>
                  %{selectedPackage.discount} indirim uygulandı
                </Text>
              )}
            </View>
          </View>

          {renderPaymentMethodSelector()}

          {paymentMethod === 'card' ? renderCardForm() : renderTransferInfo()}

          <View style={styles.section}>
            <View style={styles.autoRenewContainer}>
              <Text style={styles.autoRenewText}>Otomatik Yenileme</Text>
              <Switch
                value={autoRenew}
                onValueChange={setAutoRenew}
                trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
                thumbColor={theme.colors.white}
              />
            </View>
            <Text style={styles.autoRenewDescription}>
              Aboneliğinizin otomatik olarak yenilenmesini istiyorsanız aktif edin.
            </Text>
          </View>

          <View style={styles.section}>
            {paymentMethod === 'card' ? (
              <TouchableOpacity
                style={[styles.payButton, isProcessing && styles.payButtonDisabled]}
                onPress={handlePayment}
                disabled={isProcessing}
                accessibilityRole="button"
                accessibilityLabel="Ödemeyi Tamamla"
              >
                <Text style={styles.payButtonText}>
                  {isProcessing ? 'İşleniyor...' : `Ödemeyi Tamamla - ${packagePrice}₺`}
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.payButton}
                onPress={handleBankTransfer}
                accessibilityRole="button"
                accessibilityLabel="Havale Bilgilerini Göster"
              >
                <Text style={styles.payButtonText}>
                  Havale Bilgilerini Göster
                </Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.section}>
            <View style={styles.securityInfo}>
              <Text style={styles.securityTitle}>🔒 Güvenli Ödeme</Text>
              <Text style={styles.securityText}>
                • SSL şifreleme ile güvenli ödeme
              </Text>
              <Text style={styles.securityText}>
                • Kart bilgileriniz saklanmaz
              </Text>
              <Text style={styles.securityText}>
                • 256-bit güvenlik protokolü
              </Text>
              <Text style={styles.securityText}>
                • PCI DSS uyumlu
              </Text>
            </View>
          </View>
        </Animated.View>
      </ScrollView>

      {renderSuccessModal()}
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
  packageSummary: {
    backgroundColor: theme.colors.cardBg,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  packageSummaryText: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  packageName: {
    color: theme.colors.primary,
    fontWeight: '700',
  },
  packagePrice: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  discountInfo: {
    fontSize: 14,
    color: theme.colors.success,
    fontWeight: '600',
    marginTop: theme.spacing.sm,
  },
  paymentMethodContainer: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  paymentMethodOption: {
    flex: 1,
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.md,
    borderWidth: 2,
    borderColor: theme.colors.border,
    alignItems: 'center',
  },
  paymentMethodSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primary + '20',
  },
  paymentMethodText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  },
  paymentMethodTextSelected: {
    color: theme.colors.primary,
  },
  inputContainer: {
    marginBottom: theme.spacing.lg,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  input: {
    backgroundColor: theme.colors.inputBg,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    color: theme.colors.text,
    fontSize: 16,
  },
  row: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  autoRenewContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  autoRenewText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  },
  autoRenewDescription: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    lineHeight: 20,
  },
  payButton: {
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing.lg,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
  },
  payButtonDisabled: {
    opacity: 0.6,
  },
  payButtonText: {
    color: theme.colors.white,
    fontSize: 18,
    fontWeight: '600',
  },
  transferCard: {
    backgroundColor: theme.colors.cardBg,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  transferRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  transferLabel: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
  transferValue: {
    fontSize: 16,
    color: theme.colors.text,
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
  },
  copyButton: {
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
    marginTop: theme.spacing.lg,
  },
  copyButtonText: {
    color: theme.colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  securityInfo: {
    backgroundColor: theme.colors.cardBg,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  securityTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  securityText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCard: {
    backgroundColor: theme.colors.cardBg,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.xl,
    alignItems: 'center',
    marginHorizontal: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: theme.colors.success,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  successIconText: {
    fontSize: 40,
    color: theme.colors.white,
    fontWeight: 'bold',
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  modalMessage: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: theme.spacing.sm,
  },
  modalSubMessage: {
    fontSize: 14,
    color: theme.colors.primary,
    textAlign: 'center',
    fontWeight: '600',
  },
});

export default Payment;
