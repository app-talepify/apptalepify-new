import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  Image,
  Animated,
  Modal,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import otpService from '../services/otpService';

const ResetPassword = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { phoneNumber } = route.params || {};
  
  const [loading, setLoading] = useState(false);
  const [fadeAnim] = useState(new Animated.Value(0));
  const [smsModalVisible, setSmsModalVisible] = useState(false);
  const [timeoutId, setTimeoutId] = useState(null);

  React.useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  const handleSendOtp = async () => {
    setLoading(true);
    try {
      if (__DEV__) console.log('Şifre sıfırlama OTP\'si gönderiliyor:', phoneNumber);

      // Telefonu normalize et (+90 formatı)
      let cleanPhone = String(phoneNumber || '').replace(/\D/g, '');
      if (cleanPhone.startsWith('0')) {
        cleanPhone = '+90' + cleanPhone.substring(1);
      } else if (!cleanPhone.startsWith('90')) {
        // 5xxxxxxxxx ise
        if (cleanPhone.length === 10 && cleanPhone.startsWith('5')) {
          cleanPhone = '+90' + cleanPhone;
        } else if (cleanPhone.startsWith('90')) {
          cleanPhone = '+' + cleanPhone;
        } else {
          cleanPhone = '+90' + cleanPhone;
        }
      } else {
        cleanPhone = '+' + cleanPhone;
      }
      
      // OTP Service ile gerçek SMS gönder
      await otpService.initialize();
      
      const otpResult = await otpService.sendOtp(cleanPhone, 'password_reset');
      if (!otpResult.success) {
        if (__DEV__) console.error('OTP gönderim hatası:', otpResult.error);
        setLoading(false);
        Alert.alert('Hata', otpResult.message || 'SMS gönderilemedi. Lütfen tekrar deneyin.');
        return;
      }
      
      if (__DEV__) console.log('Şifre sıfırlama OTP\'si başarıyla gönderildi');
      setLoading(false);
      setSmsModalVisible(true);
      
      // 2 saniye sonra OTP ekranına yönlendir
      const id = setTimeout(() => {
        setSmsModalVisible(false);
        navigation.navigate('ResetPasswordOTP', { phoneNumber: cleanPhone });
      }, 2000);
      
      setTimeoutId(id); // Timeout ID'sini sakla
    } catch (error) {
      setLoading(false);
      Alert.alert('Hata', 'SMS gönderilirken bir hata oluştu: ' + error.message);
    }
  };

  // Timeout temizliği (unmount)
  React.useEffect(() => {
    return () => {
      if (timeoutId) {
        try { clearTimeout(timeoutId); } catch {}
      }
    };
  }, [timeoutId]);

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
            <Text style={styles.title}>Şifre Sıfırlama</Text>
            <Text style={styles.subtitle}>
              <Text style={styles.phoneText}>{phoneNumber}</Text> telefon numarasına şifre sıfırlamak için onay mesajı gönderilecektir.
            </Text>

            <Text style={styles.description}>
              SMS ile gelen 6 haneli kodu girerek yeni şifrenizi belirleyebileceksiniz.
            </Text>

            <TouchableOpacity
              style={[styles.sendButton, loading && styles.buttonDisabled]}
              onPress={handleSendOtp}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel="Telefona Onay Kodu Gönder"
            >
              <Text style={styles.sendButtonText}>
                {loading ? 'SMS Gönderiliyor...' : 'Telefona Onay Kodu Gönder'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => navigation.goBack()}
              accessibilityRole="button"
              accessibilityLabel="İptal"
            >
              <Text style={styles.cancelButtonText}>İptal</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>

      {/* SMS Gönderildi Modal */}
      <SmsModal
        visible={smsModalVisible}
        phoneNumber={phoneNumber}
        onClose={() => {
          // Sadece Android back button için
          setSmsModalVisible(false);
          navigation.navigate('ResetPasswordOTP', { phoneNumber });
        }}
      />
    </SafeAreaView>
  );
};

// SMS Gönderildi Modal Component
const SmsModal = ({ visible, phoneNumber, onClose }) => {
  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={modalStyles.overlay}>
        <View style={modalStyles.container}>
          <View style={modalStyles.iconContainer}>
            <Text style={modalStyles.icon}>📱</Text>
          </View>
          <Text style={modalStyles.title}>SMS Gönderildi!</Text>
          <Text style={modalStyles.message}>
            <Text style={modalStyles.phoneText}>{phoneNumber}</Text> numarasına şifre sıfırlama kodu gönderildi.
          </Text>
          <Text style={modalStyles.subtitle}>Doğrulama ekranına yönlendiriliyorsunuz...</Text>
        </View>
      </View>
    </Modal>
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
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 24,
  },
  phoneText: {
    fontWeight: '700',
    color: '#DC143C',
  },
  description: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 20,
  },
  sendButton: {
    backgroundColor: '#DC143C',
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  sendButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.6,
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

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 30,
    alignItems: 'center',
    marginHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  iconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  icon: {
    fontSize: 30,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 24,
  },
  phoneText: {
    fontWeight: '700',
    color: '#DC143C',
  },
  subtitle: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    fontStyle: 'italic',
  },
});

export default ResetPassword;
