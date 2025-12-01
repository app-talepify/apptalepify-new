import React, { useState } from 'react';
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
  Modal,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { doc, updateDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { simpleHash } from '../utils/hash';

const NewPassword = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { phoneNumber } = route.params || {};
  
  // Modern sistem - tek string + görsel array
  const [password, setPassword] = useState(''); // Ana şifre string
  const [password2, setPassword2] = useState(''); // Ana şifre tekrar string
  const [passwordDigits, setPasswordDigits] = useState(['', '', '', '', '', '']); // Görsel için
  const [password2Digits, setPassword2Digits] = useState(['', '', '', '', '', '']); // Görsel için
  const [loading, setLoading] = useState(false);
  const [fadeAnim] = useState(new Animated.Value(0));
  const [error, setError] = useState('');
  const [successVisible, setSuccessVisible] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  // Modern sistem için input refs
  const passwordInputRef = React.useRef(null);
  const password2InputRef = React.useRef(null);

  React.useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  const closeSuccessModal = () => {
    setSuccessVisible(false);
    navigation.reset({
      index: 0,
      routes: [{ 
        name: 'Login', 
        params: { 
          phoneNumber: phoneNumber 
        } 
      }],
    });
  };

  // Modern şifre handler'ları
  const handlePasswordChange = React.useCallback((text) => {
    // Sadece sayıları al ve max 6 karakter
    const numericValue = text.replace(/\D/g, '').slice(0, 6);
    
    // Ana state'i güncelle
    setPassword(numericValue);
    
    // Görsel kutucuklar için digits array'ini güncelle
    const newDigits = Array(6).fill('');
    for (let i = 0; i < numericValue.length; i++) {
      newDigits[i] = numericValue[i];
    }
    setPasswordDigits(newDigits);
    
    // Hata temizle
    if (error) {
      setError('');
    }
  }, [error]);

  const handlePassword2Change = React.useCallback((text) => {
    // Sadece sayıları al ve max 6 karakter
    const numericValue = text.replace(/\D/g, '').slice(0, 6);
    
    // Ana state'i güncelle
    setPassword2(numericValue);
    
    // Görsel kutucuklar için digits array'ini güncelle
    const newDigits = Array(6).fill('');
    for (let i = 0; i < numericValue.length; i++) {
      newDigits[i] = numericValue[i];
    }
    setPassword2Digits(newDigits);
    
    // Hata temizle
    if (error) {
      setError('');
    }
  }, [error]);

  // Kutucuklara tıklandığında input'a focus ver - Android geri tuşu fix
  const handlePasswordBoxPress = React.useCallback(() => {
    if (__DEV__) console.log('NewPassword şifre1 kutucuğa tıklandı, focus veriliyor...');
    
    // Login ekranındaki çalışan mantığı uygula
    // Mevcut değeri geçici sakla
    const currentPassword = password;
    const currentDigits = [...passwordDigits];
    
    // State'leri temizle (handlePasswordSubmit mantığı)
    setPassword('');
    setPasswordDigits(['', '', '', '', '', '']);
    
    // Input'u blur et
    if (passwordInputRef.current) {
      passwordInputRef.current.blur();
    }
    
    // Kısa delay sonra değerleri geri yükle ve focus ver
    setTimeout(() => {
      setPassword(currentPassword);
      setPasswordDigits(currentDigits);
      
      // Focus ver
      setTimeout(() => {
        if (passwordInputRef.current) {
          passwordInputRef.current.focus();
        }
      }, 50);
    }, 100);
  }, [password, passwordDigits]);

  const handlePassword2BoxPress = React.useCallback(() => {
    if (__DEV__) console.log('NewPassword şifre2 kutucuğa tıklandı, focus veriliyor...');
    
    // Login ekranındaki çalışan mantığı uygula
    // Mevcut değeri geçici sakla
    const currentPassword2 = password2;
    const currentDigits2 = [...password2Digits];
    
    // State'leri temizle (handlePasswordSubmit mantığı)
    setPassword2('');
    setPassword2Digits(['', '', '', '', '', '']);
    
    // Input'u blur et
    if (password2InputRef.current) {
      password2InputRef.current.blur();
    }
    
    // Kısa delay sonra değerleri geri yükle ve focus ver
    setTimeout(() => {
      setPassword2(currentPassword2);
      setPassword2Digits(currentDigits2);
      
      // Focus ver
      setTimeout(() => {
        if (password2InputRef.current) {
          password2InputRef.current.focus();
        }
      }, 50);
    }, 100);
  }, [password2, password2Digits]);


  const validatePasswords = () => {
    if (password.length !== 6) {
      setError('Şifre 6 haneli olmalı');
      return false;
    }
    
    if (password !== password2) {
      setError('Şifreler eşleşmiyor');
      return false;
    }
    
    return true;
  };

  const handleUpdatePassword = async () => {
    setError('');
    
    if (!validatePasswords()) {
      return;
    }

    setLoading(true);
    try {
      const newPassword = password;
      if (__DEV__) {
        console.log('=== YENİ ŞİFRE GÜNCELLEME ===');
        console.log('Phone Number:', phoneNumber);
        console.log('New Password (len):', String(newPassword || '').length);
      }

      // Kullanıcıyı telefon numarasından bul
      const phoneVariations = [
        phoneNumber,
        phoneNumber.replace(/\s/g, ''),
        `+90${phoneNumber.substring(1)}`,
        `+90 ${phoneNumber.substring(1, 4)} ${phoneNumber.substring(4, 7)} ${phoneNumber.substring(7, 9)} ${phoneNumber.substring(9)}`,
        phoneNumber.substring(1),
      ];

      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('phoneNumber', 'in', phoneVariations));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        throw new Error('Kullanıcı bulunamadı');
      }

      const userDoc = querySnapshot.docs[0];
      const userId = userDoc.id;

      // Şifreyi hash'le
      const passwordHash = simpleHash(newPassword);
      if (__DEV__) console.log('Password Hash (prefix):', String(passwordHash).slice(0, 6) + '...');

      // Firestore'da güncelle
      const userDocRef = doc(db, 'users', userId);
      await updateDoc(userDocRef, {
        passwordHash: passwordHash,
        updatedAt: serverTimestamp(),
      });

      if (__DEV__) console.log('Şifre başarıyla güncellendi!');

      // Success modal göster
      setSuccessMessage('Şifreniz başarıyla güncellendi!');
      setSuccessVisible(true);

      // 3 saniye sonra giriş ekranına yönlendir
      setTimeout(() => {
        setSuccessVisible(false);
        navigation.reset({
          index: 0,
          routes: [{ 
            name: 'Login', 
            params: { 
              phoneNumber: phoneNumber 
            } 
          }],
        });
      }, 3000);
    } catch (error) {
      if (__DEV__) console.error('Password update error:', error);
      setError('Şifre güncellenirken bir hata oluştu: ' + error.message);
    } finally {
      setLoading(false);
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
            <Text style={styles.title}>Yeni Şifre</Text>
            <Text style={styles.subtitle}>
              <Text style={styles.phoneText}>{phoneNumber}</Text> için yeni 6 haneli şifrenizi belirleyin
            </Text>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            {/* Modern Şifre Girişi 1 */}
            <Text style={styles.inputLabel}>Yeni Şifre</Text>
            <View style={styles.passwordContainer}>
              {passwordDigits.map((digit, index) => (
                <TouchableOpacity 
                  key={index} 
                  style={styles.passwordDigitContainer}
                  onPress={handlePasswordBoxPress}
                  activeOpacity={0.7}
                >
                  <Text style={styles.passwordDigitDisplay}>
                    {digit ? '●' : ''}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            
            {/* Gizli ana input 1 */}
            <TextInput
              ref={passwordInputRef}
              style={styles.hiddenPasswordInput}
              value={password}
              autoCapitalize="none"
              onChangeText={handlePasswordChange}
              keyboardType="numeric"
              maxLength={6}
              autoFocus={false}
              returnKeyType="next"
              onSubmitEditing={() => {
                // İlk şifre dolduğunda ikinci şifreye geç
                if (password2InputRef.current) {
                  password2InputRef.current.focus();
                }
              }}
              // Performans optimizasyonları
              autoCompleteType="off"
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              textContentType="newPassword"
              blurOnSubmit={false}
              clearButtonMode="never"
            />

            {/* Modern Şifre Girişi 2 */}
            <Text style={styles.inputLabel}>Şifre Tekrar</Text>
            <View style={styles.passwordContainer}>
              {password2Digits.map((digit, index) => (
                <TouchableOpacity 
                  key={index} 
                  style={styles.passwordDigitContainer}
                  onPress={handlePassword2BoxPress}
                  activeOpacity={0.7}
                >
                  <Text style={styles.passwordDigitDisplay}>
                    {digit ? '●' : ''}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            
            {/* Gizli ana input 2 */}
            <TextInput
              ref={password2InputRef}
              style={styles.hiddenPasswordInput}
              value={password2}
              autoCapitalize="none"
              onChangeText={handlePassword2Change}
              keyboardType="numeric"
              maxLength={6}
              autoFocus={false}
              returnKeyType="done"
              onSubmitEditing={() => {
                // İkinci şifre dolduğunda submit
                if (password.length === 6 && password2.length === 6) {
                  handleUpdatePassword();
                }
              }}
              // Performans optimizasyonları
              autoCompleteType="off"
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              textContentType="newPassword"
              blurOnSubmit={false}
              clearButtonMode="never"
            />

            <TouchableOpacity
              style={[styles.updateButton, (loading || password.length !== 6 || password2.length !== 6) && styles.buttonDisabled]}
              onPress={handleUpdatePassword}
              disabled={loading || password.length !== 6 || password2.length !== 6}
            >
              <Text style={styles.updateButtonText}>
                {loading ? 'Güncelleniyor...' : 'Şifreyi Güncelle'}
              </Text>
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

      {/* Success Modal */}
      <SuccessModal
        visible={successVisible}
        message={successMessage}
        onClose={closeSuccessModal}
      />
    </SafeAreaView>
  );
};

// Success Modal Component
const SuccessModal = ({ visible, message, onClose }) => {
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
            <Text style={modalStyles.icon}>✓</Text>
          </View>
          <Text style={modalStyles.title}>Başarılı!</Text>
          <Text style={modalStyles.message}>{message}</Text>
          <Text style={modalStyles.subtitle}>Giriş ekranına yönlendiriliyorsunuz...</Text>
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
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 24,
  },
  phoneText: {
    fontWeight: '700',
    color: '#DC143C',
  },
  errorText: {
    color: '#DC2626',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
    backgroundColor: '#FEF2F2',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
    marginTop: 16,
  },
  passwordContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingHorizontal: 20,
  },
  passwordDigitContainer: {
    backgroundColor: '#1F2937',
    borderRadius: 6,
    width: 45,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  passwordDigit: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
    width: '100%',
    height: '100%',
    paddingTop: 12,
  },
  // Modern sistem için yeni stiller
  passwordDigitDisplay: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 50,
  },
  hiddenPasswordInput: {
    position: 'absolute',
    opacity: 0,
    left: -9999,
    height: 0,
    width: 0,
  },
  updateButton: {
    backgroundColor: '#DC143C',
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 16,
  },
  updateButtonText: {
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
    backgroundColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  icon: {
    fontSize: 30,
    color: '#FFFFFF',
    fontWeight: 'bold',
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
  subtitle: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    fontStyle: 'italic',
  },
});

export default NewPassword;
