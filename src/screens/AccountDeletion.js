// src/screens/AccountDeletion.js
// Talepify - Hesap Silme Sayfası

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Animated,
  Image,
  Modal,
  TextInput,
  SafeAreaView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { requestOtp, verifyOtp } from '../services/auth/api';

const AccountDeletion = () => {
  const { theme: currentTheme } = useTheme();
  const navigation = useNavigation();
  const { userProfile, deleteAccount } = useAuth();
  const insets = useSafeAreaInsets();
  const [fadeAnim] = useState(new Animated.Value(0));
  
  // SMS/OTP States
  const [smsLoading, setSmsLoading] = useState(false);
  const [smsSent, setSmsSent] = useState(false);
  const [otpVisible, setOtpVisible] = useState(false);
  const [otp, setOtp] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  
  // Final Confirmation States
  const [finalConfirmVisible, setFinalConfirmVisible] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  
  // SMS Success Modal State
  const [smsSuccessVisible, setSmsSuccessVisible] = useState(false);

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start();

    // Initialize OTP Service
    const initializeOtpService = async () => {
      try {
        // OTP servisi hazır
        console.log('[AccountDeletion] OTP Service initialized');
      } catch (error) {
        console.error('[AccountDeletion] OTP Service initialization failed:', error);
      }
    };

    initializeOtpService();
  }, [fadeAnim]);

  const handleSendSMS = useCallback(async () => {
    if (!userProfile?.phoneNumber) {
      Alert.alert('Hata', 'Telefon numarası bulunamadı');
      return;
    }

    setSmsLoading(true);
    try {
      await requestOtp(userProfile.phoneNumber, 'delete_account');
      setSmsSent(true);
      setSmsSuccessVisible(true);
    } catch (error) {
      console.error('SMS gönderim hatası:', error);
      Alert.alert('Hata', 'SMS gönderilemedi. Lütfen tekrar deneyin.');
    } finally {
      setSmsLoading(false);
    }
  }, [userProfile?.phoneNumber]);

  const handleVerifyOTP = useCallback(async () => {
    if (otp.length !== 6) {
      Alert.alert('Hata', 'Lütfen 6 haneli doğrulama kodunu girin');
      return;
    }

    setOtpLoading(true);
    try {
      const result = await verifyOtp(userProfile.phoneNumber, otp, 'delete_account');
      if (result.ok && result.verified) {
        setOtpVisible(false);
        setOtpVerified(true);
        setFinalConfirmVisible(true);
        setOtp('');
        console.log('[AccountDeletion] OTP doğrulandı, final confirmation açılıyor');
      } else {
        Alert.alert('Hata', result.message || 'Doğrulama kodu hatalı');
      }
    } catch (error) {
      console.error('OTP doğrulama hatası:', error);
      Alert.alert('Hata', 'Doğrulama kodu kontrol edilemedi');
    } finally {
      setOtpLoading(false);
    }
  }, [otp, userProfile?.phoneNumber]);

  const handleFinalDelete = useCallback(async () => {
    if (confirmText.toLowerCase() !== 'hesabımı sil') {
      Alert.alert('Hata', 'Lütfen "hesabımı sil" yazın');
      return;
    }

    if (!otpVerified) {
      Alert.alert('Hata', 'OTP doğrulaması tamamlanmamış');
      return;
    }

    setDeleteLoading(true);
    try {
      console.log('=== HESAP SİLME İŞLEMİ BAŞLADI ===');
      const result = await deleteAccount();
      if (result.success) {
        Alert.alert(
          'Hesap Silindi',
          'Hesabınız başarıyla silindi.',
          [{ text: 'Tamam', onPress: () => navigation.reset({ index: 0, routes: [{ name: 'Login' }] }) }]
        );
      } else {
        Alert.alert('Hata', result.message || 'Hesap silinemedi');
      }
    } catch (error) {
      console.error('Hesap silme hatası:', error);
      Alert.alert('Hata', 'Hesap silinemedi. Lütfen tekrar deneyin.');
    } finally {
      setDeleteLoading(false);
      setFinalConfirmVisible(false);
      setConfirmText('');
    }
  }, [confirmText, deleteAccount, navigation, otpVerified]);

  return (
    <View style={[styles.container, { backgroundColor: currentTheme.colors.background }]}>
      <SafeAreaView style={styles.safeArea}>
        <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity 
              style={styles.backButton} 
              onPress={() => navigation.goBack()}
            >
              <Image 
                source={require('../assets/images/icons/return.png')} 
                style={[styles.backIcon, { tintColor: currentTheme.colors.text }]} 
              />
            </TouchableOpacity>
            <Text style={[styles.title, { color: currentTheme.colors.text }]}>
              Hesap Silme
            </Text>
            <View style={styles.placeholder} />
          </View>

          <ScrollView 
            style={styles.scrollContent} 
            contentContainerStyle={styles.scrollContentContainer}
            showsVerticalScrollIndicator={false}
          >
            {/* Warning Section */}
            <View style={[styles.warningCard, { backgroundColor: currentTheme.colors.error + '15' }]}>
              <Image 
                source={require('../assets/images/icons/delete.png')} 
                style={[styles.warningIcon, { tintColor: currentTheme.colors.error }]} 
              />
              <Text style={[styles.warningTitle, { color: currentTheme.colors.error }]}>
                DİKKAT: Bu İşlem Geri Alınamaz!
              </Text>
              <Text style={[styles.warningText, { color: currentTheme.colors.text }]}>
                Hesabınızı sildiğinizde aşağıdaki tüm verileriniz kalıcı olarak silinecektir:
              </Text>
            </View>

            {/* Data List */}
            <View style={[styles.dataCard, { backgroundColor: currentTheme.colors.surface }]}>
              <Text style={[styles.dataTitle, { color: currentTheme.colors.text }]}>
                Silinecek Veriler:
              </Text>
              
              {[
                { icon: 'portfolio', text: 'Tüm portföyleriniz' },
                { icon: 'request', text: 'Tüm talepleriniz' },
                { icon: 'calendar', text: 'Ajanda verileriniz' },
                { icon: 'profile', text: 'Profil bilgileriniz' },
                { icon: 'notification', text: 'Bildirim geçmişiniz' },
                { icon: 'referral', text: 'Referans verileriniz' },
              ].map((item, index) => (
                <View key={index} style={styles.dataItem}>
                  <View style={[styles.bulletPoint, { backgroundColor: currentTheme.colors.error }]} />
                  <Text style={[styles.dataText, { color: currentTheme.colors.textSecondary }]}>
                    {item.text}
                  </Text>
                </View>
              ))}
            </View>

            {/* Info Section */}
            <View style={[styles.infoCard, { backgroundColor: currentTheme.colors.surface }]}>
              <Text style={[styles.infoTitle, { color: currentTheme.colors.text }]}>
                Alternatif Seçenekler
              </Text>
              <Text style={[styles.infoText, { color: currentTheme.colors.textSecondary }]}>
                • Hesabınızı geçici olarak devre dışı bırakabilirsiniz{'\n'}
                • Verilerinizi yedekleyebilirsiniz{'\n'}
                • Destek ekibimizle iletişime geçebilirsiniz
              </Text>
            </View>
          </ScrollView>

          {/* Action Buttons - Fixed at bottom */}
          <View style={[styles.buttonContainer, { 
            backgroundColor: currentTheme.colors.background,
            paddingBottom: Math.max(insets.bottom + 150, 170)
          }]}>
            {!smsSent ? (
              <>
                <TouchableOpacity
                  style={[styles.alternativeButton, { backgroundColor: currentTheme.colors.primary }]}
                  onPress={() => navigation.goBack()}
                >
                  <Text style={[styles.alternativeButtonText, { color: currentTheme.colors.white }]}>
                    Vazgeç
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.deleteButton, { backgroundColor: currentTheme.colors.error }]}
                  onPress={handleSendSMS}
                  disabled={smsLoading}
                >
                  <Text style={[styles.deleteButtonText, { color: currentTheme.colors.white }]}>
                    {smsLoading ? 'SMS Gönderiliyor...' : 'SMS Gönder'}
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                style={[styles.otpButton, { backgroundColor: currentTheme.colors.warning }]}
                onPress={() => setOtpVisible(true)}
              >
                <Text style={[styles.otpButtonText, { color: currentTheme.colors.white }]}>
                  Doğrulama Kodunu Gir
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </Animated.View>
      </SafeAreaView>

      {/* OTP Modal */}
      <Modal
        visible={otpVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setOtpVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: currentTheme.colors.surface }]}>
            <Text style={[styles.modalTitle, { color: currentTheme.colors.text }]}>
              Doğrulama Kodu
            </Text>
            <Text style={[styles.modalText, { color: currentTheme.colors.textSecondary }]}>
              {userProfile?.phoneNumber} numarasına gönderilen 6 haneli kodu girin:
            </Text>
            
            <TextInput
              style={[styles.otpInput, { 
                borderColor: currentTheme.colors.border,
                backgroundColor: currentTheme.colors.background,
                color: currentTheme.colors.text
              }]}
              value={otp}
              onChangeText={setOtp}
              placeholder="000000"
              placeholderTextColor={currentTheme.colors.textSecondary}
              keyboardType="numeric"
              maxLength={6}
              autoFocus={true}
            />
            
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: currentTheme.colors.border }]}
                onPress={() => {
                  setOtpVisible(false);
                  setOtp('');
                }}
              >
                <Text style={[styles.modalButtonText, { color: currentTheme.colors.text }]}>
                  İptal
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: currentTheme.colors.primary }]}
                onPress={handleVerifyOTP}
                disabled={otpLoading || otp.length !== 6}
              >
                <Text style={[styles.modalButtonText, { color: currentTheme.colors.white }]}>
                  {otpLoading ? 'Kontrol Ediliyor...' : 'Doğrula'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* SMS Success Modal */}
      <Modal
        visible={smsSuccessVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setSmsSuccessVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: currentTheme.colors.surface }]}>
            <Image 
              source={require('../assets/images/icons/bell.png')} 
              style={[styles.successIcon, { tintColor: currentTheme.colors.primary }]} 
            />
            
            <Text style={[styles.modalTitle, { color: currentTheme.colors.text }]}>
              SMS Gönderildi
            </Text>
            
            <Text style={[styles.modalText, { color: currentTheme.colors.textSecondary }]}>
              {userProfile?.phoneNumber} numarasına doğrulama kodu gönderildi.
            </Text>
            
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: currentTheme.colors.border }]}
                onPress={() => setSmsSuccessVisible(false)}
              >
                <Text style={[styles.modalButtonText, { color: currentTheme.colors.text }]}>
                  Kapat
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: currentTheme.colors.primary }]}
                onPress={() => {
                  setSmsSuccessVisible(false);
                  setOtpVisible(true);
                }}
              >
                <Text style={[styles.modalButtonText, { color: currentTheme.colors.white }]}>
                  Kod Gir
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Final Confirmation Modal */}
      <Modal
        visible={finalConfirmVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setFinalConfirmVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: currentTheme.colors.surface }]}>
            <Image 
              source={require('../assets/images/icons/delete.png')} 
              style={[styles.finalWarningIcon, { tintColor: currentTheme.colors.error }]} 
            />
            
            <Text style={[styles.finalTitle, { color: currentTheme.colors.error }]}>
              Son Uyarı!
            </Text>
            
            <Text style={[styles.finalText, { color: currentTheme.colors.text }]}>
              Hesabınızı silmek üzeresiniz. Bu işlem{' '}
              <Text style={{ fontWeight: 'bold', color: currentTheme.colors.error }}>
                GERİ ALINAMAZ
              </Text>
              .
            </Text>

            <Text style={[styles.confirmInstructions, { color: currentTheme.colors.textSecondary }]}>
              Devam etmek için aşağıya{' '}
              <Text style={{ fontWeight: 'bold', color: currentTheme.colors.error }}>
                "hesabımı sil"
              </Text>
              {' '}yazın:
            </Text>
            
            <TextInput
              style={[styles.confirmInput, { 
                borderColor: currentTheme.colors.border,
                backgroundColor: currentTheme.colors.background,
                color: currentTheme.colors.text
              }]}
              value={confirmText}
              onChangeText={setConfirmText}
              placeholder="hesabımı sil"
              placeholderTextColor={currentTheme.colors.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus={true}
            />
            
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: currentTheme.colors.border }]}
                onPress={() => {
                  setFinalConfirmVisible(false);
                  setConfirmText('');
                }}
              >
                <Text style={[styles.modalButtonText, { color: currentTheme.colors.text }]}>
                  Vazgeç
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.modalButton, { 
                  backgroundColor: confirmText.toLowerCase().trim() === 'hesabımı sil' 
                    ? currentTheme.colors.error 
                    : currentTheme.colors.border
                }]}
                onPress={handleFinalDelete}
                disabled={deleteLoading || confirmText.toLowerCase().trim() !== 'hesabımı sil'}
              >
                <Text style={[styles.modalButtonText, { 
                  color: confirmText.toLowerCase().trim() === 'hesabımı sil' 
                    ? currentTheme.colors.white 
                    : currentTheme.colors.textSecondary
                }]}>
                  {deleteLoading ? 'Siliniyor...' : 'Hesabı Sil'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  backButton: {
    padding: theme.spacing.sm,
  },
  backIcon: {
    width: 24,
    height: 24,
  },
  title: {
    flex: 1,
    fontSize: theme.fontSizes.xl,
    fontWeight: theme.fontWeights.bold,
    textAlign: 'center',
  },
  placeholder: {
    width: 40,
  },
  scrollContent: {
    flex: 1,
  },
  scrollContentContainer: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.lg,
  },
  warningCard: {
    borderRadius: theme.spacing.md,
    padding: theme.spacing.lg,
    marginVertical: theme.spacing.lg,
    alignItems: 'center',
  },
  warningIcon: {
    width: 48,
    height: 48,
    marginBottom: theme.spacing.md,
  },
  warningTitle: {
    fontSize: theme.fontSizes.lg,
    fontWeight: theme.fontWeights.bold,
    marginBottom: theme.spacing.sm,
    textAlign: 'center',
  },
  warningText: {
    fontSize: theme.fontSizes.md,
    textAlign: 'center',
    lineHeight: 22,
  },
  dataCard: {
    borderRadius: theme.spacing.md,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
  },
  dataTitle: {
    fontSize: theme.fontSizes.lg,
    fontWeight: theme.fontWeights.semibold,
    marginBottom: theme.spacing.md,
  },
  dataItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  bulletPoint: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: theme.spacing.md,
  },
  dataText: {
    fontSize: theme.fontSizes.md,
    flex: 1,
  },
  infoCard: {
    borderRadius: theme.spacing.md,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
  },
  infoTitle: {
    fontSize: theme.fontSizes.lg,
    fontWeight: theme.fontWeights.semibold,
    marginBottom: theme.spacing.md,
  },
  infoText: {
    fontSize: theme.fontSizes.md,
    lineHeight: 22,
  },
  buttonContainer: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.lg,
    gap: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  alternativeButton: {
    borderRadius: theme.spacing.md,
    padding: theme.spacing.lg,
    alignItems: 'center',
  },
  alternativeButtonText: {
    fontSize: theme.fontSizes.lg,
    fontWeight: theme.fontWeights.semibold,
  },
  deleteButton: {
    borderRadius: theme.spacing.md,
    padding: theme.spacing.lg,
    alignItems: 'center',
  },
  deleteButtonText: {
    fontSize: theme.fontSizes.lg,
    fontWeight: theme.fontWeights.semibold,
  },
  otpButton: {
    borderRadius: theme.spacing.md,
    padding: theme.spacing.lg,
    alignItems: 'center',
  },
  otpButtonText: {
    fontSize: theme.fontSizes.lg,
    fontWeight: theme.fontWeights.semibold,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  modalContent: {
    borderRadius: theme.spacing.lg,
    padding: theme.spacing.xl,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: theme.fontSizes.xl,
    fontWeight: theme.fontWeights.bold,
    textAlign: 'center',
    marginBottom: theme.spacing.lg,
  },
  modalText: {
    fontSize: theme.fontSizes.md,
    textAlign: 'center',
    marginBottom: theme.spacing.lg,
    lineHeight: 22,
  },
  otpInput: {
    borderWidth: 1,
    borderRadius: theme.spacing.sm,
    padding: theme.spacing.lg,
    fontSize: theme.fontSizes.xl,
    textAlign: 'center',
    marginBottom: theme.spacing.lg,
    letterSpacing: 4,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  modalButton: {
    flex: 1,
    borderRadius: theme.spacing.sm,
    padding: theme.spacing.md,
    alignItems: 'center',
  },
  modalButtonText: {
    fontSize: theme.fontSizes.md,
    fontWeight: theme.fontWeights.semibold,
  },
  finalWarningIcon: {
    width: 64,
    height: 64,
    alignSelf: 'center',
    marginBottom: theme.spacing.lg,
  },
  finalTitle: {
    fontSize: theme.fontSizes.xxl,
    fontWeight: theme.fontWeights.bold,
    textAlign: 'center',
    marginBottom: theme.spacing.md,
  },
  finalText: {
    fontSize: theme.fontSizes.lg,
    textAlign: 'center',
    marginBottom: theme.spacing.lg,
    lineHeight: 24,
  },
  confirmInstructions: {
    fontSize: theme.fontSizes.md,
    textAlign: 'center',
    marginBottom: theme.spacing.lg,
    lineHeight: 22,
  },
  confirmInput: {
    borderWidth: 1,
    borderRadius: theme.spacing.sm,
    padding: theme.spacing.lg,
    fontSize: theme.fontSizes.lg,
    textAlign: 'center',
    marginBottom: theme.spacing.lg,
  },
  successIcon: {
    width: 48,
    height: 48,
    alignSelf: 'center',
    marginBottom: theme.spacing.lg,
  },
});

export default AccountDeletion;
