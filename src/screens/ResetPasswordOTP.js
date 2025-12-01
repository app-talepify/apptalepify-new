import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  Image,
  Animated,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import otpService from '../services/otpService';

const ResetPasswordOTP = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { phoneNumber } = route.params || {};
  
  const [otp, setOtp] = useState(''); // Ana OTP string
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']); // Görsel için
  const [loading, setLoading] = useState(false);
  const [fadeAnim] = useState(new Animated.Value(0));
  const otpInputRef = useRef(null); // Tek input için
  const handleVerifyOtpRef = useRef(); // OTP verify ref

  React.useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
    
    // Otomatik focus kaldırıldı - kullanıcı manuel tıklayacak
  }, [fadeAnim]);

  // Modern ve profesyonel OTP handler - tek input yaklaşımı
  const handleOtpChange = React.useCallback((text) => {
    // Sadece sayıları al ve max 6 karakter
    const numericValue = text.replace(/\D/g, '').slice(0, 6);
    
    // Ana state'i güncelle
    setOtp(numericValue);
    
    // Görsel kutucuklar için digits array'ini güncelle
    const newDigits = Array(6).fill('');
    for (let i = 0; i < numericValue.length; i++) {
      newDigits[i] = numericValue[i];
    }
    setOtpDigits(newDigits);
    
    // 6 hane dolduğunda otomatik submit - dependency problem'ını önlemek için
    if (numericValue.length === 6) {
      setTimeout(() => {
        handleVerifyOtpRef.current(numericValue);
      }, 100);
    }
  }, []);

  // Kutucuklara tıklandığında input'a focus ver - Android geri tuşu fix
  const handleDigitBoxPress = React.useCallback(() => {
    console.log('OTP kutucuğa tıklandı, focus veriliyor...');
    
    // Login ekranındaki çalışan mantığı uygula
    // Mevcut değeri geçici sakla
    const currentOtp = otp;
    const currentDigits = [...otpDigits];
    
    // State'leri temizle (handlePasswordSubmit mantığı)
    setOtp('');
    setOtpDigits(['', '', '', '', '', '']);
    
    // Input'u blur et
    if (otpInputRef.current) {
      otpInputRef.current.blur();
    }
    
    // Kısa delay sonra değerleri geri yükle ve focus ver
    setTimeout(() => {
      setOtp(currentOtp);
      setOtpDigits(currentDigits);
      
      // Focus ver
      setTimeout(() => {
        if (otpInputRef.current) {
          otpInputRef.current.focus();
        }
      }, 50);
    }, 100);
  }, [otp, otpDigits]);


  const handleVerifyOtp = async (otpValue = null) => {
    // Parametre olarak geçilen değeri kullan, yoksa state'ten al
    const currentOtp = otpValue || otp;
    
    if (currentOtp.length !== 6) {
      Alert.alert('Hata', '6 haneli kodu tam olarak girin');
      return;
    }

    setLoading(true);
    try {
      // OTP doğrulama simülasyonu
      console.log('OTP doğrulanıyor:', currentOtp);
      
      // OTP Service ile doğrulama yap
      await otpService.initialize();
      
      const otpResult = await otpService.verifyOtp(phoneNumber, currentOtp, 'password_reset');
      if (!otpResult.success) {
        console.log('OTP doğrulama hatası:', otpResult.error);
        setLoading(false);
        Alert.alert('Hata', otpResult.message || 'Geçersiz kod. Lütfen tekrar deneyin.');
        
        // Hatalı kod durumunda temizle
        if (otpResult.error === 'invalid_otp' || otpResult.error === 'otp_expired') {
          setOtp(''); // Ana state'i temizle
          setOtpDigits(['', '', '', '', '', '']); // Görsel state'i temizle
          // Keyboard'ı kapat
          if (otpInputRef.current) {
            otpInputRef.current.blur();
          }
        }
        return;
      }
      
      console.log('Şifre sıfırlama OTP\'si başarıyla doğrulandı');
      setTimeout(() => {
        setLoading(false);
        navigation.navigate('NewPassword', { phoneNumber });
      }, 1500);
    } catch (error) {
      setLoading(false);
      Alert.alert('Hata', 'Kod doğrulanırken bir hata oluştu: ' + error.message);
    }
  };

  // Ref'e fonksiyonu ata
  handleVerifyOtpRef.current = handleVerifyOtp;

  const handleResendOtp = async () => {
    try {
      // OTP Service ile yeniden gönder
      await otpService.initialize();
      
      const otpResult = await otpService.sendOtp(phoneNumber, 'password_reset');
      if (!otpResult.success) {
        console.error('OTP yeniden gönderim hatası:', otpResult.error);
        Alert.alert('Hata', otpResult.message || 'SMS tekrar gönderilemedi. Lütfen bekleyin.');
      } else {
        console.log('Şifre sıfırlama OTP\'si başarıyla yeniden gönderildi');
        Alert.alert(
          'SMS Tekrar Gönderildi',
          `${phoneNumber} numarasına yeni kod gönderildi.`,
          [{ text: 'Tamam' }]
        );
      }
    } catch (error) {
      console.error('OTP resend error:', error);
      Alert.alert('Hata', 'SMS tekrar gönderilemedi: ' + error.message);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
          {/* Robot Maskot */}
          <View style={styles.robotContainer}>
            <View style={styles.robot}>
              <Image
                source={require('../assets/images/robot-mascot1.png')}
                style={styles.robotImage}
                resizeMode="contain"
              />
            </View>
          </View>

          {/* Content Container */}
          <View style={styles.contentContainer}>
            <Text style={styles.title}>SMS Doğrulama</Text>
            <Text style={styles.subtitle}>
              <Text style={styles.phoneText}>{phoneNumber}</Text> numarasına gönderilen 6 haneli kodu girin
            </Text>

            {/* Modern OTP girişi - görsel kutucuklar + gizli input */}
            <View style={styles.otpContainer}>
              {otpDigits.map((digit, index) => (
                <TouchableOpacity 
                  key={index} 
                  style={styles.otpDigitContainer}
                  onPress={handleDigitBoxPress}
                  activeOpacity={0.7}
                >
                  <Text style={styles.otpDigitDisplay}>
                    {digit || ''}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            
            {/* Gizli ana input - tüm OTP'yi burada alıyoruz */}
            <TextInput
              ref={otpInputRef}
              style={styles.hiddenOtpInput}
              value={otp}
              onChangeText={handleOtpChange}
              onSubmitEditing={() => {
                console.log('Ana OTP input submit edildi');
                if (otp.length === 6) {
                  handleVerifyOtp(otp);
                }
              }}
              keyboardType="numeric"
              maxLength={6}
              autoFocus={false}
              returnKeyType="done"
              // Performans optimizasyonları
              autoCompleteType="off"
              autoCorrect={false}
              spellCheck={false}
              textContentType="oneTimeCode"
              blurOnSubmit={false}
              clearButtonMode="never"
            />

            <TouchableOpacity
              style={[styles.verifyButton, (loading || otp.length !== 6) && styles.buttonDisabled]}
              onPress={() => handleVerifyOtp(otp)}
              disabled={loading || otp.length !== 6}
            >
              <Text style={styles.verifyButtonText}>
                {loading ? 'Doğrulanıyor...' : 'Kodu Doğrula'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.resendButton} onPress={handleResendOtp}>
              <Text style={styles.resendText}>Kodu Tekrar Gönder</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => navigation.goBack()}
            >
              <Text style={styles.cancelButtonText}>Geri</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#DC143C',
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 15,
    paddingTop: 40,
  },
  robotContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'flex-end',
    marginBottom: -80,
    marginTop: -40,
  },
  robot: {
    width: 280,
    height: 280,
  },
  robotImage: {
    width: 280,
    height: 280,
  },
  contentContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 16,
    paddingTop: 100,
    paddingBottom: 40,
    flex: 1,
    marginBottom: 0,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1F2937',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },
  phoneText: {
    fontWeight: '700',
    color: '#DC143C',
  },
  otpContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 32,
    paddingHorizontal: 20,
  },
  otpDigitContainer: {
    backgroundColor: '#1F2937',
    borderRadius: 6,
    width: 45,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  otpDigit: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
    width: '100%',
    height: '100%',
    paddingTop: 12,
  },
  // Yeni stiller - modern yaklaşım için
  otpDigitDisplay: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 50,
  },
  hiddenOtpInput: {
    position: 'absolute',
    opacity: 0,
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    width: 1,
    zIndex: -1,
  },
  verifyButton: {
    backgroundColor: '#DC143C',
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  verifyButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  resendButton: {
    alignItems: 'center',
    paddingVertical: 12,
    marginBottom: 16,
  },
  resendText: {
    color: '#DC143C',
    fontSize: 14,
    fontWeight: '600',
  },
  cancelButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  cancelButtonText: {
    color: '#6B7280',
    fontSize: 16,
    fontWeight: '500',
  },
});

export default ResetPasswordOTP;
