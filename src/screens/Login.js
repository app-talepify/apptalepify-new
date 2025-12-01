import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Alert,
  Image,
  Modal,
  BackHandler,
} from 'react-native';
// import { theme } from '../theme/theme';
import { useAuth } from '../context/AuthContext';
import { useDeviceAuth } from '../context/DeviceAuthContext';
import { useRoute } from '@react-navigation/native';
import securityLimiter from '../utils/securityLimiter';
// Firestore imports kaldırıldı - artık API kullanılıyor
// import { collection, query, where, getDocs } from 'firebase/firestore';
// import { db } from '../firebase';
// import { simpleHash } from '../utils/hash';
import { requestOtp, loginWithOtp, checkPhoneNumber, passwordLogin } from '../services/auth/api';
import { loginWithOtpAndStartSession } from '../services/auth/session';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { signInWithCustomToken as signInWithCustomTokenFn } from '../services/auth/firebaseAuth';

// Başarı Modalı - memo ile optimize edildi
  const SuccessModal = React.memo(({ visible, title, message }) => {
  if (!visible) {
    return null;
  }

  return (
    <View style={successModalStyles.modalOverlay}>
      <View style={successModalStyles.modalContent}>
        <View style={successModalStyles.checkmark}>
          <View style={successModalStyles.checkmarkCircle} />
          <View style={successModalStyles.checkmarkStem} />
          <View style={successModalStyles.checkmarkKick} />
        </View>
        <Text style={successModalStyles.modalTitle}>{title}</Text>
        {message && <Text style={successModalStyles.modalMessage}>{message}</Text>}
      </View>
    </View>
  );
});

// Kayıt Ol Modalı
const RegisterModal = ({ visible, phoneNumber, onCancel, onRegister }) => {
  if (!visible) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={registerModalStyles.overlay}>
        <View style={registerModalStyles.container}>
          {/* Icon */}
          <View style={registerModalStyles.iconContainer}>
            <Text style={registerModalStyles.icon}>📱</Text>
          </View>
          
          {/* Title */}
          <Text style={registerModalStyles.title}>Hesap Bulunamadı</Text>
          
          {/* Message */}
          <Text style={registerModalStyles.message}>
            <Text style={registerModalStyles.phoneText}>{phoneNumber}</Text> numaralı telefona ait hesap bulunamadı.
          </Text>
          
          <Text style={registerModalStyles.submessage}>
            Kayıt olmak için kayıt sayfasına yönlendirileceksiniz.
          </Text>
          
          {/* Buttons */}
          <View style={registerModalStyles.buttonsContainer}>
            <TouchableOpacity 
              style={registerModalStyles.cancelButton}
              onPress={onCancel}
            >
              <Text style={registerModalStyles.cancelButtonText}>İptal</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={registerModalStyles.registerButton}
              onPress={onRegister}
            >
              <Text style={registerModalStyles.registerButtonText}>Kayıt Ol</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const Login = ({ navigation }) => {
  const { signIn } = useAuth();
  const deviceAuth = useDeviceAuth();
  const route = useRoute();
  const { phoneNumber } = route.params || {};
  const [phone, setPhone] = useState('');
  const [displayPhone, setDisplayPhone] = useState('');
  const [phoneDigits, setPhoneDigits] = useState(['0', '', '', '', '', '', '', '', '', '', '']); // 11 haneli
  // const [currentIndex, setCurrentIndex] = useState(1); // 0'dan sonra başla
  // const [password, setPassword] = useState('');
  const [password, setPassword] = useState(''); // Tek string olarak tutulacak
  const [passwordDigits, setPasswordDigits] = useState(['', '', '', '', '', '']); // Görsel için
  const [otp, setOtp] = useState('');
  const [otpVerified, setOtpVerified] = useState(false);
  const [currentStep, setCurrentStep] = useState('phone'); // phone, password, otp
  const [loading, setLoading] = useState(false);
  const [fadeAnim] = useState(new Animated.Value(0));
  const [phoneError, setPhoneError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [otpError, setOtpError] = useState('');
  const [pendingUserId, setPendingUserId] = useState(null);
  
  // Success modal states
  const [successVisible, setSuccessVisible] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  
  // Register redirect modal states
  const [registerModalVisible, setRegisterModalVisible] = useState(false);
  const [unregisteredPhone, setUnregisteredPhone] = useState('');
  
  // UI stability flag
  const [isProcessingLogin, setIsProcessingLogin] = useState(false);
  
  // Password input control flag - KALDIRILIYOR
  // const [passwordInputEnabled, setPasswordInputEnabled] = useState(true);
  
  // Input remount key - Android geri tuşu sorunu için
  const [passwordInputKey, setPasswordInputKey] = useState(0);
  
  // Backup input system - ultimate fallback
  const [useBackupInput, setUseBackupInput] = useState(false);
  const backupPasswordInputRef = useRef(null);
  
  // Success modal timeout ref
  const successModalTimeoutRef = useRef(null);
  
  // Success modal kapatma fonksiyonu - ULTRA HIZLI!
  const closeSuccessModal = useCallback(() => {
    // Timeout'ı temizle
    if (successModalTimeoutRef.current) {
      clearTimeout(successModalTimeoutRef.current);
      successModalTimeoutRef.current = null;
    }
    
    setSuccessVisible(false);
    
    // ANINDA MainTabs'a yönlendir - bekleme yok!
    if (__DEV__) console.log('✅ SUCCESS MODAL: INSTANT MainTabs navigation!');
    navigation.reset({
      index: 0,
      routes: [{ name: 'MainTabs' }],
    });
  }, [navigation]);

  // Register modal handlers
  const closeRegisterModal = useCallback(() => {
    setRegisterModalVisible(false);
    setUnregisteredPhone('');
  }, []);

  const handleRegisterRedirect = useCallback(() => {
    setRegisterModalVisible(false);
    navigation.navigate('Register');
  }, [navigation]);
  
  // const phoneInputRefs = useRef([]);
  const passwordInputRef = useRef(null); // Tek input için
  const otpInputRef = useRef(null);
  const handlePasswordSubmitRef = useRef();
  const handleVerifyOtpRef = useRef(); // OTP verify ref

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  // phoneNumber parametresi geldiğinde telefon numarasını doldur
  useEffect(() => {
    if (phoneNumber) {
      if (__DEV__) console.log('Phone number from params:', phoneNumber);
      // Telefon numarasını temizle ve formatla
      const cleanPhone = phoneNumber.replace(/\D/g, '');
      if (cleanPhone.length === 11 && cleanPhone.startsWith('0')) {
        // 05354648228 formatı
        const digits = cleanPhone.split('');
        setPhoneDigits(digits);
        setPhone(cleanPhone);
        setDisplayPhone(formatPhoneDisplay(cleanPhone));
      }
    }
  }, [phoneNumber, formatPhoneDisplay]);

  // 🔐 SINGLE SESSION SECURITY: Tek oturum politikası uygula
  const enforceMultiAccountSecurity = useCallback(async (currentUserId, currentDeviceId) => {
    try {
      if (__DEV__) console.log('🔐 ENFORCING SINGLE SESSION SECURITY for:', currentUserId);
      
      // 1. Bu cihazda hangi hesaplar daha önce kullanılmış kontrol et
      const allKeys = await AsyncStorage.getAllKeys();
      const trustedDeviceKeys = allKeys.filter(key => key.startsWith('trusted_device_'));
      if (__DEV__) console.log('🔍 Found trusted device keys:', trustedDeviceKeys.length, trustedDeviceKeys);
      
      // 2. Son kullanılan hesabı kontrol et
      const lastUsedAccount = await AsyncStorage.getItem('last_used_account').catch(() => null);
      if (__DEV__) console.log('🔍 Last used account:', lastUsedAccount, 'Current:', currentUserId);
      
      let hasConflict = false;
      
      // CONFLICT RULE 1: Başka hesap bu cihazda son kullanıldıysa → OTP
      if (lastUsedAccount && lastUsedAccount !== currentUserId) {
        if (__DEV__) console.log('🚨 ACCOUNT SWITCH DETECTED - Last:', lastUsedAccount, 'Current:', currentUserId);
        hasConflict = true;
      }
      
      // CONFLICT RULE 2: Bu cihazda birden fazla hesap varsa → OTP  
      if (trustedDeviceKeys.length > 1) {
        if (__DEV__) console.log('🚨 MULTI-ACCOUNT CONFLICT - Multiple accounts detected:', trustedDeviceKeys);
        hasConflict = true;
      }
      
      // Diğer hesapları temizle
      const otherAccountKeys = trustedDeviceKeys.filter(key => 
        key !== `trusted_device_${currentUserId}`
      );
      if (otherAccountKeys.length > 0) {
      if (__DEV__) console.log('🗑️ CLEARING OTHER ACCOUNTS:', otherAccountKeys);
        await AsyncStorage.multiRemove(otherAccountKeys);
      }
      
      // 3. Bu hesabın başka cihazlarda aktif olup olmadığını kontrol et
      try {
        const userDevices = await deviceAuth.getUserDevices(currentUserId);
        const otherActiveDevices = userDevices.filter(d => 
          d.deviceId !== currentDeviceId && d.isActive
        );
        
        if (otherActiveDevices.length > 0) {
          if (__DEV__) console.log('🚨 DEVICE CONFLICT DETECTED - Account active on other devices:', otherActiveDevices.length);
          await deviceAuth.deactivateOtherDevices(currentUserId, currentDeviceId);
          hasConflict = true;
        }
      } catch (e) {
        if (__DEV__) console.log('🔐 Failed to check other devices:', e.message);
      }
      
      // Son kullanılan hesabı güncelle
      await AsyncStorage.setItem('last_used_account', currentUserId);
      
      if (__DEV__) console.log('✅ SINGLE SESSION SECURITY ENFORCED - Conflict:', hasConflict);
      
      // Eğer çakışma varsa, trusted login'e izin verme (OTP zorunlu)
      return {
        allowTrusted: !hasConflict,
        hasConflict: hasConflict
      };
    } catch (error) {
      if (__DEV__) console.log('❌ SINGLE SESSION SECURITY ERROR:', error);
      return { allowTrusted: false, hasConflict: true };
    }
  }, [deviceAuth]);

  // Android hardware back button handler
  useEffect(() => {
    const backAction = () => {
      // Modal'lar açıksa önce onları kapat
      if (registerModalVisible) {
        closeRegisterModal();
        return true; // Event'i consume et
      }
      
      if (successVisible) {
        closeSuccessModal();
        return true; // Event'i consume et
      }

      // Adım adım geri git
      if (currentStep === 'otp') {
        // OTP ekranından password ekranına
        setCurrentStep('password');
        setOtp(''); // OTP'yi temizle
        setOtpError('');
        
        // KRİTİK GÜVENLİK: Pending user ID'yi temizle
        setPendingUserId(null);
        
        // Password ekranına geri dönünce focus ver
        setTimeout(() => {
          if (passwordInputRef.current) {
            passwordInputRef.current.focus();
          }
        }, 100);
        return true; // Event'i consume et
      } else if (currentStep === 'password') {
        // Password ekranından phone ekranına
        setCurrentStep('phone');
        setPassword(''); // Şifreyi temizle
        setPasswordDigits(['', '', '', '', '', '']);
        setPasswordError('');
        
        // KRİTİK GÜVENLİK: Pending user ID'yi temizle
        setPendingUserId(null);
        
        return true; // Event'i consume et
      }
      
      // Phone ekranındaysak normal geri çıkış (uygulamadan çık)
      return false; // Event'i consume etme, normal davranış
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);

    return () => backHandler.remove();
  }, [currentStep, registerModalVisible, successVisible, closeRegisterModal, closeSuccessModal]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (successModalTimeoutRef.current) {
        clearTimeout(successModalTimeoutRef.current);
      }
    };
  }, []);

  // Şifre 6 haneli olduğunda otomatik giriş yap - DEVRE DIŞI (OTP spam önleme)
  // useEffect(() => {
  //   if (password.length === 6 && currentStep === 'password' && !loading && !successVisible && !isProcessingLogin) {
  //     console.log('useEffect: Şifre 6 haneli, otomatik giriş kontrol ediliyor...');
  //     const pwErr = validatePassword(password);
  //     if (!pwErr) {
  //       console.log('useEffect: Şifre geçerli, anında otomatik giriş...');
  //       // Anında otomatik giriş - delay yok
  //       handlePasswordSubmitRef.current();
  //     }
  //   }
  // }, [password, currentStep, loading, successVisible, isProcessingLogin, validatePassword]);

  // Password step'ine geçince otomatik focus
  useEffect(() => {
    if (currentStep === 'password') {
      // Kısa bir delay ile focus ver (UI güncellemesini bekle)
      const timeoutId = setTimeout(() => {
        if (passwordInputRef.current) {
          passwordInputRef.current.focus();
        }
      }, 150);
      
      return () => clearTimeout(timeoutId);
    }
  }, [currentStep]);

  const validatePhone = useCallback((phoneString) => {
    const cleanPhone = phoneString.replace(/\s/g, '');
    
    // 10 haneli (5354648228) veya 11 haneli (05354648228) kabul et
    if (cleanPhone.length === 10 && /^[1-9]/.test(cleanPhone)) {
      return ''; // 10 haneli, 0 ile başlamayan numara OK
    }
    if (cleanPhone.length === 11 && cleanPhone.startsWith('0')) {
      return ''; // 11 haneli, 0 ile başlayan numara OK
    }
    
    return 'Geçerli bir telefon numarası girin (10 veya 11 hane)';
  }, []);


  const validatePassword = useCallback((passwordString) => {
    const cleanPassword = passwordString.replace(/\s/g, '');
    if (cleanPassword.length !== 6) {
      return 'Şifre 6 haneli olmalı';
    }
    return '';
  }, []);

  // Modern ve profesyonel şifre handler - tek input yaklaşımı
  const handlePasswordChange = useCallback((text) => {
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
    if (passwordError) {
      setPasswordError('');
    }
  }, [passwordError]);

  // Kutucuklara tıklandığında input'a focus ver
  const handleDigitBoxPress = useCallback(() => {
    if (!passwordInputRef.current) {
      return;
    }

    // iOS'ta direkt focus yeterli; blur/focus hilesi gereksiz ve bazen klavyeyi açmıyor
    if (Platform.OS === 'ios') {
      passwordInputRef.current.focus();
      return;
    }

    // Android klavye sorunu için: önce blur, sonra kısa delay ile focus
    passwordInputRef.current.blur();
    setTimeout(() => {
      if (passwordInputRef.current) {
        passwordInputRef.current.focus();
      }
    }, 50);
  }, []);


  const validateOtp = useCallback((value) => {
    if (String(value || '').replace(/\D/g, '').length !== 6) {
      return '6 haneli kod gerekli';
    }
    return '';
  }, []);

  // Telefon numarasını formatla: 05354648228 -> 0 ( 535 ) 464 82 28
  const formatPhoneDisplay = useCallback((phoneNumber) => {
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    
    if (cleanPhone.length === 0) {
      return '';
    }
    if (cleanPhone.length === 1) {
      return cleanPhone;
    }
    if (cleanPhone.length <= 4) {
      return `${cleanPhone.charAt(0)} ( ${cleanPhone.slice(1)}`;
    }
    if (cleanPhone.length <= 7) {
      return `${cleanPhone.charAt(0)} ( ${cleanPhone.slice(1, 4)} ) ${cleanPhone.slice(4)}`;
    }
    if (cleanPhone.length <= 9) {
      return `${cleanPhone.charAt(0)} ( ${cleanPhone.slice(1, 4)} ) ${cleanPhone.slice(4, 7)} ${cleanPhone.slice(7)}`;
    }
    
    // Tam format: 0 ( 535 ) 464 82 28
    return `${cleanPhone.charAt(0)} ( ${cleanPhone.slice(1, 4)} ) ${cleanPhone.slice(4, 7)} ${cleanPhone.slice(7, 9)} ${cleanPhone.slice(9)}`;
  }, []);

  const handlePhoneSubmit = useCallback(async () => {
    const pErr = validatePhone(phone);
    setPhoneError(pErr);
    if (pErr) {
      return;
    }

    setLoading(true);
    try {
      // Telefon numarasını normalize et  
      const cleanPhone = phone.replace(/\D/g, '');
      let phoneString = cleanPhone;
      if (phoneString.startsWith('0')) {
        phoneString = '+90' + phoneString.substring(1);
      } else if (!phoneString.startsWith('+90')) {
        phoneString = '+90' + phoneString;
      }

      // Yeni API kullanarak telefon kontrolü yap
      const checkResult = await checkPhoneNumber(phoneString);
      
      if (!checkResult.ok) {
        Alert.alert('Hata', checkResult.message || 'Telefon numarası kontrol edilirken bir hata oluştu');
        return;
      }

      if (checkResult.data.exists) {
        // Kullanıcı var, şifre ekranına geç
        setCurrentStep('password');
        
        // Şifre ekranına geçince keyboard'ı açmak için focus
        setTimeout(() => {
          if (passwordInputRef.current) {
            passwordInputRef.current.focus();
          }
        }, 100);
      } else {
        // Kullanıcı yok, kayıt modalını göster
        setUnregisteredPhone(phoneString);
        setRegisterModalVisible(true);
      }
    } catch (error) {
      Alert.alert('Hata', 'Telefon numarası kontrol edilirken bir hata oluştu: ' + error.message);
    } finally {
      setLoading(false);
    }
  }, [phone, validatePhone]);

  const handlePasswordSubmit = useCallback(async () => {
    const pwErr = validatePassword(password);
    setPasswordError(pwErr);
    if (pwErr) {
      // Validation hatasında keyboard'ı kapat
      if (passwordInputRef.current) {
        passwordInputRef.current.blur();
      }
      return;
    }

    setLoading(true);
    setIsProcessingLogin(true);
    
    // Minimum loading feedback (100ms) - kullanıcı response hisseder
    const startTime = Date.now();
    
    try {
      const phoneString = phone;
      const passwordString = password;
      
      // Server-side password login API kullan
      const cleanPhone = phoneString.replace(/\D/g, '');
      let normalizedPhone = cleanPhone;
      if (normalizedPhone.startsWith('0')) {
        normalizedPhone = '+90' + normalizedPhone.substring(1);
      } else if (!normalizedPhone.startsWith('+90')) {
        normalizedPhone = '+90' + normalizedPhone;
      }

      // API ile password login
      const result = await passwordLogin(normalizedPhone, passwordString);
      
      if (!result.success) {
        if (result.error === 'PASSWORD_NOT_SET') {
          // Şifre hash'i yok - kullanıcıyı şifre oluşturma ekranına yönlendir
          Alert.alert(
            'Şifre Oluşturma Gerekli',
            'Hesabınız için bir şifre oluşturmanız gerekiyor. Şifre oluşturma ekranına yönlendirileceksiniz.',
            [
              { text: 'İptal', style: 'cancel' },
              { 
                text: 'Şifre Oluştur', 
                onPress: () => {
                  // Geçici olarak userId'yi store et
                  setPendingUserId(result.data?.userId);
                  navigation.navigate('UpdatePassword');
                }
              },
            ],
          );
          return;
        } else if (result.error === 'INVALID_PASSWORD') {
          // Şifre yanlış
          setPasswordError('Şifre yanlış');
          // Şifreyi temizle
          setPassword('');
          setPasswordDigits(['', '', '', '', '', '']);
          // Keyboard'ı kapat
          if (passwordInputRef.current) {
            passwordInputRef.current.blur();
          }
          return;
        } else {
          // Diğer API hataları
          Alert.alert('Hata', result.message || 'Giriş yapılamadı');
          return;
        }
      }

      // Password login başarılı - custom token al
      const { uid, token } = result.data;

      // KRİTİK GÜVENLİK: Firebase Auth'a giriş yapmayı OTP doğrulandıktan SONRA yap!
      // Şimdilik sadece token'ı sakla, OTP doğrulanınca giriş yap
      // (Bu sayede OTP başarısız olursa Firebase Auth state persist olmaz)

      // 3. Cihaz fingerprint kontrolü
      const { currentDevice } = deviceAuth;
      if (__DEV__) console.log('🔍 CURRENT DEVICE CHECK:', currentDevice ? currentDevice.deviceId : 'NULL');
      
      if (!currentDevice) {
        setPendingUserId(uid);
        
        // OTP gönder ve OTP ekranına geç
        const otpResult = await requestOtp(normalizedPhone, 'login');
        if (otpResult.ok) {
          setCurrentStep('otp');
        } else {
          Alert.alert('Hata', otpResult.message || 'SMS gönderilemedi. Lütfen tekrar deneyin.');
        }
        return;
      }

      // 🔐 SINGLE SESSION SECURITY: ÖNCE multi-account kontrolü!
      const sessionSecurityResult = await enforceMultiAccountSecurity(uid, currentDevice.deviceId);
      
      // ⚡ Session security sonrası trusted device check
      let trustedDevice = null;
      
      if (sessionSecurityResult.allowTrusted) {
        const localTrustedId = await AsyncStorage.getItem(`trusted_device_${uid}`).catch(() => null);
        if (__DEV__) console.log('🔍 LOCAL TRUSTED CHECK:', `trusted_device_${uid}`, 'Value:', localTrustedId, 'Current:', currentDevice.deviceId);
        if (localTrustedId && localTrustedId === currentDevice.deviceId) {
          trustedDevice = { deviceId: localTrustedId, isActive: true };
          if (__DEV__) console.log('✅ LOCAL TRUSTED DEVICE FOUND!');
        }
      } else {
        if (__DEV__) console.log('🚫 TRUSTED LOGIN BLOCKED - Session conflict detected');
      }

      // Eğer session security izin veriyorsa ve local'de trusted değilse, Firestore'dan kontrol et
      if (!trustedDevice && sessionSecurityResult.allowTrusted) {
        try {
          const userDevices = await deviceAuth.getUserDevices(uid);
          trustedDevice = userDevices.find(d =>
            d.deviceId === currentDevice.deviceId && d.isActive
          );

          // Eğer Firestore'da trusted device bulunursa, AsyncStorage'a kaydet
          if (trustedDevice) {
            if (__DEV__) console.log('🔥 FIRESTORE TRUSTED FOUND, caching to AsyncStorage');
            await AsyncStorage.setItem(`trusted_device_${uid}`, currentDevice.deviceId);
          } else {
            if (__DEV__) console.log('❌ NO TRUSTED DEVICE in Firestore');
          }
        } catch (error) {
          if (__DEV__) console.log('❌ FIRESTORE CHECK ERROR:', error.message);
        }
      } else if (!sessionSecurityResult.allowTrusted) {
        if (__DEV__) console.log('🚫 FIRESTORE CHECK SKIPPED - Session security blocked trusted login');
      }

      if (trustedDevice) {
        // ⚡ LIGHTNING LOGIN - Trusted Device!
        if (__DEV__) console.log('🚀 TRUSTED DEVICE LOGIN ACTIVATED!');
        setPendingUserId(uid);
        
        // Trusted device için Firebase Auth'a giriş yap (OTP yok)
        try {
          const authRes = await signInWithCustomTokenFn(token);
          if (!authRes.success) {
            Alert.alert('Hata', authRes.message || 'Giriş yapılamadı');
            return;
          }
        } catch (e) {
          Alert.alert('Hata', e.message || 'Giriş yapılamadı');
          return;
        }
        
        // INSTANT UI Response - Loading off!
        setLoading(false);
        setIsProcessingLogin(false);
        
        // IMMEDIATE session security setup - bu kritik!
        try {
          await deviceAuth.deactivateOtherDevices(uid, currentDevice.deviceId);
          await deviceAuth.startActiveDeviceWatcher(uid);
          if (__DEV__) console.log('🛡️ SESSION SECURITY ACTIVE');
        } catch (e) {
          if (__DEV__) console.log('⚠️ Session security setup failed:', e.message);
        }
        
        // Auto-submit döngüsünü kırmak için şifreyi temizle
        setPassword('');
        setPasswordDigits(['', '', '', '', '', '']);
        
        // ✨ SUCCESS FEEDBACK - Hızlı ama görünür!
        setSuccessMessage('✅ Hoş geldiniz!');
        setSuccessVisible(true);
        
        // 300ms sonra navigation (Maximum Speed + Quick Feedback!)
        successModalTimeoutRef.current = setTimeout(() => {
          closeSuccessModal();
        }, 300); // Maximum Speed!
        
        return; // Early return to skip finally block
      } else {
        // Cihaz tanımlı değil - OTP gönder
        setPendingUserId(uid);
        
        // INSTANT UI update!
        setCurrentStep('otp');
        
        // Background OTP - kullanıcı beklemez!
        requestOtp(normalizedPhone, 'login').then(otpResult => {
          if (!otpResult.ok) {
            setCurrentStep('password');
            Alert.alert('Hata', otpResult.message || 'SMS gönderilemedi. Lütfen tekrar deneyin.');
          }
        });
      }
      
    } catch (error) {
      Alert.alert('Hata', error.message || 'Giriş yapılamadı');
    } finally {
      setLoading(false);
      setIsProcessingLogin(false);
    }
  }, [password, validatePassword, phone, deviceAuth, enforceMultiAccountSecurity, closeSuccessModal, currentStep, navigation]);

  // handlePasswordSubmit'i useRef'e ata
  handlePasswordSubmitRef.current = handlePasswordSubmit;

  // OTP duplicate submission engelleyici
  const [otpProcessing, setOtpProcessing] = useState(false);

  const handleVerifyOtp = useCallback(async (otpValue = null) => {
    // Duplicate submission engelle
    if (otpProcessing) {
      return;
    }

    // Parametre olarak geçilen değeri kullan, yoksa state'ten al
    const currentOtp = otpValue || otp;
    
    const oErr = validateOtp(currentOtp);
    setOtpError(oErr);
    if (oErr) {
      return;
    }

    setOtpProcessing(true);
    setLoading(true);
    try {
      // OTP Service ile doğrulama yap (service zaten initialize edildi)
      // Telefon numarasını normalize et (gönderimde kullanılan format ile aynı)
      let normalizedPhone = phone.replace(/\D/g, '');
      if (normalizedPhone.startsWith('0')) {
        normalizedPhone = '+90' + normalizedPhone.substring(1);
      } else if (!normalizedPhone.startsWith('+90')) {
        normalizedPhone = '+90' + normalizedPhone;
      }
      
      const otpResult = await loginWithOtpAndStartSession(normalizedPhone, currentOtp, 'login');
      
      if (!otpResult.success) {
        setOtpError(otpResult.message || 'Geçersiz SMS kodu');
        
        // KRİTİK GÜVENLİK: OTP başarısız olduğunda Firebase Auth state'i temizle
        try {
          const { signOut } = require('../services/auth/firebaseAuth');
          await signOut();
          console.log('[Login] OTP başarısız - Firebase Auth state temizlendi');
        } catch (signOutError) {
          console.log('[Login] Firebase signOut hatası:', signOutError.message);
        }
        
        // KRİTİK GÜVENLİK: Pending user ID'yi temizle
        setPendingUserId(null);
        
        // KRİTİK GÜVENLİK: Password'u temizle (geri tuşuna basınca otomatik submit olmasın)
        setPassword('');
        setPasswordDigits(['', '', '', '', '', '']);
        
        // Hatalı kod durumunda temizle
        if (otpResult.code === 'invalid_otp' || otpResult.code === 'otp_expired') {
          setOtp('');
          if (otpInputRef.current) {
            otpInputRef.current.blur();
          }
        }
        return;
      }
      
      // ⚡ ULTRA RAPID OTP SUCCESS!
      
      // INSTANT Background cleanup - NO delay!
      if (pendingUserId) {
        // IMMEDIATE execution - no delay!
        (async () => {
          try {
            await securityLimiter.clearFailedAttempts(pendingUserId);
            if (deviceAuth.currentDevice) {
              if (__DEV__) console.log('📱 DEVICE REGISTRATION STARTING...', pendingUserId, deviceAuth.currentDevice.deviceId);
              const deviceResult = await deviceAuth.confirmDeviceWithSMS(pendingUserId, currentOtp);
              if (__DEV__) console.log('📱 DEVICE REGISTRATION RESULT:', deviceResult.success);
              if (deviceResult.success) {
                await deviceAuth.deactivateOtherDevices(pendingUserId, deviceAuth.currentDevice.deviceId);
                await deviceAuth.startActiveDeviceWatcher(pendingUserId);
                if (__DEV__) console.log('✅ DEVICE TRUST SETUP COMPLETED');
              }
            }
          } catch (error) {
            if (__DEV__) console.log('❌ DEVICE REGISTRATION ERROR:', error);
          }
        })();
      }
      
      // INSTANT NAVIGATION - Success modal 400ms!
      setSuccessMessage('Giriş başarılı!');
      setSuccessVisible(true);
      
      successModalTimeoutRef.current = setTimeout(() => {
        closeSuccessModal();
      }, 400); // 800ms → 400ms ULTRA SPEED!
    } catch (error) {
      setOtpError('OTP doğrulanamadı: ' + error.message);
    } finally {
      setLoading(false);
      setOtpProcessing(false);
    }
  }, [otp, phone, validateOtp, pendingUserId, deviceAuth, otpProcessing, closeSuccessModal]);

  // handleVerifyOtp'yi useRef'e ata
  handleVerifyOtpRef.current = handleVerifyOtp;

  const handleResendOtp = useCallback(async () => {
    if (loading) {
      return; // Zaten işlem varsa engelle
    }
    
    setLoading(true);
    setOtpError('');
    
    try {
      // Telefon numarasını normalize et
      let normalizedPhone = phone.replace(/\D/g, '');
      if (normalizedPhone.startsWith('0')) {
        normalizedPhone = '+90' + normalizedPhone.substring(1);
      } else if (!normalizedPhone.startsWith('+90')) {
        normalizedPhone = '+90' + normalizedPhone;
      }
      
      console.log('[Login] OTP tekrar gönderiliyor:', normalizedPhone);
      
      // OTP yeniden gönder
      const otpResult = await requestOtp(normalizedPhone, 'login');
      
      console.log('[Login] OTP tekrar gönderme sonucu:', otpResult);
      
      if (!otpResult.ok) {
        setOtpError(otpResult.message || 'SMS tekrar gönderilemedi. Lütfen bekleyin.');
      } else {
        setOtp('');
        Alert.alert('Başarılı', 'SMS kodu tekrar gönderildi.');
      }
    } catch (error) {
      console.error('[Login] OTP tekrar gönderme hatası:', error);
      setOtpError('SMS tekrar gönderilemedi: ' + error.message);
    } finally {
      setLoading(false);
    }
  }, [phone, loading]);

  const handleBackToPhone = useCallback(() => {
    setCurrentStep('phone');
    setPassword(''); // Ana state'i temizle
    setPasswordDigits(['', '', '', '', '', '']); // Görsel state'i temizle
    setPasswordError('');
    
    // KRİTİK GÜVENLİK: Pending user ID'yi temizle
    setPendingUserId(null);
    
    // Telefon formatını da sıfırla
    setDisplayPhone(formatPhoneDisplay(phone));
  }, [phone, formatPhoneDisplay]);

  const handleBackToPassword = useCallback(() => {
    setCurrentStep('password');
    setOtp('');
    setOtpError('');
    
    // KRİTİK GÜVENLİK: Pending user ID'yi temizle
    setPendingUserId(null);
    
    // Password ekranına geri dönünce focus ver
    setTimeout(() => {
      if (passwordInputRef.current) {
        passwordInputRef.current.focus();
      }
    }, 100);
  }, []);

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Animated.View style={[styles.content, { opacity: fadeAnim }]}> 
          {/* Logo */}
          <View style={styles.logoContainer}>
            <Image
              source={require('../assets/images/logosplash-beyaz.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
          </View>
          
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
            {currentStep === 'phone' ? (
              <>
                <Text style={styles.welcomeSubtitle}>Profesyonellerin Dünyasına</Text>
                <Text style={styles.title}>Hoşgeldiniz</Text>
                
                <View style={styles.phoneInputContainer}>
                  <TextInput
                    style={styles.phoneInput}
                    value={displayPhone}
                    autoCapitalize="none"
                    autoCorrect={false}
                    onChangeText={(value) => {
                      // Sadece sayıları al
                      let numericValue = value.replace(/\D/g, '');
                      
                      // Max 11 karakter
                      if (numericValue.length > 11) {
                        numericValue = numericValue.slice(0, 11);
                      }
                      
                      // Telefon numarasını normalize et
                      let normalizedPhone = numericValue;
                      
                      // Eğer boş değilse ve 0 ile başlamıyorsa, hemen başına 0 ekle
                      if (numericValue.length > 0 && !numericValue.startsWith('0')) {
                        normalizedPhone = '0' + numericValue;
                      }
                      
                      // Max 11 karakter (normalize sonrası)
                      if (normalizedPhone.length > 11) {
                        normalizedPhone = normalizedPhone.slice(0, 11);
                      }
                      
                      // State'leri güncelle
                      setPhone(normalizedPhone);
                      setDisplayPhone(formatPhoneDisplay(normalizedPhone));
                      
                      // phoneDigits'i de güncelle (backward compatibility için)
                      const digits = normalizedPhone.split('');
                      const paddedDigits = digits.concat(Array(11 - digits.length).fill(''));
                      setPhoneDigits(paddedDigits);
                      
                      if (phoneError) {
                        setPhoneError('');
                      }
                    }}
                    placeholder="Telefon numaranızı girin"
                    placeholderTextColor="rgba(255,255,255,0.6)"
                    keyboardType="numeric"
                    maxLength={19}
                    onSubmitEditing={handlePhoneSubmit}
                    returnKeyType="done"
                  />
                </View>
                {phoneError ? <Text style={styles.errorInline}>{phoneError}</Text> : null}

                <TouchableOpacity
                  style={[styles.continueButton, loading && styles.buttonDisabled]}
                  onPress={handlePhoneSubmit}
                  disabled={loading}
                >
                  <Text style={styles.continueButtonText}>
                    {loading ? 'Telefon kontrol ediliyor...' : 'Devam et'}
                  </Text>
                </TouchableOpacity>

                <View style={styles.registerSection}>
                  <Text style={styles.registerText}>Henüz Hesabın Yok mu?</Text>
                  <TouchableOpacity 
                    style={styles.registerButton}
                    onPress={() => navigation.navigate('Register')}
                  >
                    <Text style={styles.registerButtonText}>Kayıt Ol</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : currentStep === 'password' ? (
              <>
                <TouchableOpacity 
                  style={styles.backButton}
                  onPress={handleBackToPhone}
                >
                  <Text style={styles.backButtonText}>← Geri</Text>
                </TouchableOpacity>
                
                <Text style={styles.title}>Şifrenizi Girin</Text>
                <Text style={styles.subtitle}>6 haneli şifrenizi girin</Text>
                
                {/* Modern şifre girişi - görsel kutucuklar + gizli input */}
                <View style={styles.passwordDigitsContainer}>
                  {passwordDigits.map((digit, index) => (
                    <TouchableOpacity 
                      key={index} 
                      style={styles.passwordDigitContainer}
                      onPress={handleDigitBoxPress}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.passwordDigitDisplay}>
                        {digit ? '●' : ''}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  
                  {/* Gizli ana input - Container içinde */}
                  <TextInput
                  key={`password-input-${passwordInputKey}`}
                  ref={passwordInputRef}
                  style={styles.hiddenPasswordInput}
                  value={password}
                  onChangeText={handlePasswordChange}
                    onSubmitEditing={() => {
                      if (password.length === 6) {
                        const pwErr = validatePassword(password);
                        if (!pwErr) {
                          handlePasswordSubmit();
                        }
                      }
                    }}
                  keyboardType="numeric"
                  maxLength={6}
                  secureTextEntry={false} // Gizli input'ta secureTextEntry false
                  autoFocus={false} // Manuel focus yapıyoruz
                  returnKeyType="done"
                  // Performans optimizasyonları
                  autoCompleteType="off"
                  autoCapitalize="none"
                  autoCorrect={false}
                  spellCheck={false}
                  textContentType="password"
                  blurOnSubmit={false}
                  clearButtonMode="never"
                  enablesReturnKeyAutomatically={true}
                  caretHidden={true}
                  selectTextOnFocus={false}
                  onFocus={() => {
                    // Password input focused
                  }}
                  onBlur={() => {
                    // Password input blurred
                    // NOT: passwordInputEnabled'ı burada disable etme
                    // Çünkü normal blur durumları da var (devam et, validation vs)
                    // Sadece spesifik Android geri tuşu durumu için disable ediyoruz
                  }}
                  />
                  
                  {/* Backup TextInput - Android geri tuşu fallback */}
                  {useBackupInput && (
                    <TextInput
                    key={`backup-password-input-${passwordInputKey}`}
                    ref={backupPasswordInputRef}
                    style={styles.hiddenPasswordInput}
                    value={password}
                    onChangeText={handlePasswordChange}
                    onSubmitEditing={() => {
                      console.log('Backup şifre input submit edildi');
                      if (password.length === 6) {
                        const pwErr = validatePassword(password);
                        if (!pwErr) {
                          handlePasswordSubmit();
                        }
                      }
                    }}
                    keyboardType="numeric"
                    maxLength={6}
                    secureTextEntry={false}
                    autoFocus={false}
                    returnKeyType="done"
                    autoCompleteType="off"
                    autoCapitalize="none"
                    autoCorrect={false}
                    spellCheck={false}
                    textContentType="password"
                    blurOnSubmit={false}
                    clearButtonMode="never"
                    enablesReturnKeyAutomatically={true}
                    caretHidden={true}
                    selectTextOnFocus={false}
                    onFocus={() => {
                      console.log('Backup password input focused');
                    }}
                    onBlur={() => {
                      console.log('Backup password input blurred');
                    }}
                    />
                  )}
                </View>
                {passwordError ? <Text style={styles.errorInline}>{passwordError}</Text> : null}

                <TouchableOpacity
                  style={[styles.continueButton, loading && styles.buttonDisabled]}
                  onPress={handlePasswordSubmit}
                  disabled={loading}
                >
                  <Text style={styles.continueButtonText}>
                    {loading ? 'Giriş yapılıyor...' : 'Devam et'}
                  </Text>
                </TouchableOpacity>

                {passwordError === 'Şifre yanlış' && (
                  <TouchableOpacity 
                    style={styles.resetPasswordButton}
                    onPress={() => {
                      const phoneString = phone;
                      if (phoneString) {
                        navigation.navigate('ResetPassword', { phoneNumber: phoneString });
                      } else {
                        Alert.alert('Hata', 'Önce telefon numaranızı girin');
                      }
                    }}
                  >
                    <Text style={styles.resetPasswordText}>Şifremi Sıfırla</Text>
                  </TouchableOpacity>
                )}
              </>
            ) : (
              <>
                <TouchableOpacity 
                  style={styles.backButton}
                  onPress={handleBackToPassword}
                >
                  <Text style={styles.backButtonText}>← Geri</Text>
                </TouchableOpacity>
                
                <Text style={styles.title}>SMS Doğrulama</Text>
                <Text style={styles.subtitle}>Telefonunuza gönderilen 6 haneli kodu girin</Text>

                {/* Modern OTP girişi - görsel kutucuklar + gizli input */}
                <View style={[styles.otpContainer, otpError && styles.otpError]}> 
                  {Array(6).fill(0).map((_, index) => (
                    <TouchableOpacity 
                      key={index} 
                      style={styles.otpDigitContainer}
                      onPress={() => {
                        if (!otpInputRef.current) return;

                        // iOS'ta direkt focus yeterli; blur/focus hilesi gereksiz ve bazen klavyeyi açmıyor
                        if (Platform.OS === 'ios') {
                          otpInputRef.current.focus();
                          return;
                        }

                        // Android klavye sorunu için: önce blur, sonra kısa delay ile focus
                        otpInputRef.current.blur();
                        setTimeout(() => {
                          if (otpInputRef.current) {
                            otpInputRef.current.focus();
                          }
                        }, 50);
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.otpDigitDisplay}>{otp[index] || ''}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {otpError ? <Text style={styles.errorInline}>{otpError}</Text> : null}

                {/* Gizli ana input - tüm OTP'yi burada alıyoruz */}
                <TextInput
                  ref={otpInputRef}
                  style={styles.hiddenOtpInput}
                  value={otp}
                  autoCapitalize="none"
                  onChangeText={(text) => {
                    // Hızlı OTP girişi için optimize edildi
                    const numericValue = text.replace(/\D/g, '').slice(0, 6);
                    setOtp(numericValue);
                    
                    // Hata temizle
                    if (otpError) {
                      setOtpError('');
                    }
                    
                    // 6 hane dolduğunda otomatik submit (duplicate protection ile)
                    if (numericValue.length === 6 && !otpProcessing) {
                      setTimeout(() => {
                        if (!otpProcessing) {
                          handleVerifyOtpRef.current(numericValue);
                        }
                      }, 100);
                    }
                  }}
                  onSubmitEditing={() => {
                    if (otp.length === 6 && !otpProcessing) {
                      handleVerifyOtpRef.current(otp);
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
                  style={[styles.continueButton, (loading || !!validateOtp(otp) || otpProcessing) && styles.buttonDisabled]}
                  onPress={() => {
                    if (!otpProcessing) {
                      handleVerifyOtp(otp);
                    }
                  }}
                  disabled={loading || !!validateOtp(otp) || otpProcessing}
                >
                  <Text style={styles.continueButtonText}>Giriş Yap</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.resendButton} onPress={handleResendOtp}>
                  <Text style={styles.resendText}>Tekrar Gönder</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </Animated.View>
      </KeyboardAvoidingView>

      {/* Başarı Modalı */}
      <SuccessModal
        visible={successVisible}
        title="Başarılı!"
        message={successMessage}
      />

      {/* Kayıt Ol Modalı */}
      <RegisterModal
        visible={registerModalVisible}
        phoneNumber={unregisteredPhone}
        onCancel={closeRegisterModal}
        onRegister={handleRegisterRedirect}
      />
    </View>
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
  logoContainer: {
    alignItems: 'center',
    paddingTop: 20,
    marginBottom: 20,
  },
  logoImage: {
    width: 120,
    height: 60,
  },
  robotContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'flex-end',
    marginBottom: -80, // Maskotu daha fazla container'a yapışık hale getir
    marginTop: -40, // Maskotu yukarı çıkar
  },
  robot: {
    width: 280, // Maskot boyutu büyütüldü
    height: 280,
    alignItems: 'center',
    justifyContent: 'center',
  },
  robotImage: {
    width: 280, // Maskot boyutu büyütüldü
    height: 280,
  },
  contentContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 16,
    paddingTop: 100, // Üst padding artırıldı büyük maskot için
    paddingBottom: 40, // Alt padding
    flex: 1, // Container'ı tam boyut yap
    marginBottom: 0, // Alt boşluk kaldır
  },
  welcomeSubtitle: {
    fontSize: 32,
    fontWeight: '700',
    color: '#DC143C',
    textAlign: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1F2937',
    textAlign: 'center',
    marginBottom: 30,
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 24,
  },
  phoneInputContainer: {
    marginBottom: 20,
    paddingHorizontal: 20, // Yanlardan daralttık
  },
  phoneInput: {
    backgroundColor: '#1F2937',
    borderRadius: 8,
    height: 50,
    paddingHorizontal: 16,
    fontSize: 18,
    fontWeight: '500',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  passwordDigitsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    paddingHorizontal: 10,
    gap: 8,
  },
  passwordDigitContainer: {
    flex: 1,
    backgroundColor: '#1F2937',
    borderRadius: 8,
    height: 42,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 42,
  },
  passwordDigit: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
    width: '100%',
    height: '100%',
    paddingTop: 8,
  },
  // Yeni stiller - modern yaklaşım için
  passwordDigitDisplay: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 42,
  },
  hiddenPasswordInput: {
    position: 'absolute',
    opacity: 0,
    left: 0,
    top: 0,
    width: 1,
    height: 1,
  },
  continueButton: {
    backgroundColor: '#DC143C',
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
    marginVertical: 16,
    marginHorizontal: 20, // Yanlardan daralttık
  },
  continueButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  registerSection: {
    marginTop: 24,
    alignItems: 'center',
  },
  registerText: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 12,
  },
  registerButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#DC143C',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 32,
    alignItems: 'center',
  },
  registerButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#DC143C',
  },
  resetPasswordButton: {
    alignItems: 'center',
    marginTop: 16,
  },
  resetPasswordText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    textDecorationLine: 'underline',
  },
  errorInline: {
    color: '#DC143C',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 10,
  },
  otpContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  otpError: {
    borderColor: '#DC143C',
  },
  otpDigitContainer: {
    width: 45,
    height: 55,
    backgroundColor: '#F3F4F6',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  otpDigit: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1F2937',
  },
  hiddenOtpInput: {
    position: 'absolute',
    opacity: 0,
    left: 0,
    top: 0,
    width: 1,
    height: 1,
  },
  // OTP display stili
  otpDigitDisplay: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
    textAlign: 'center',
    lineHeight: 55,
  },
  resendButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  resendText: {
    color: '#DC143C',
    fontSize: 14,
    fontWeight: '600',
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 20,
    borderRadius: 6,
  },
  backButtonText: {
    color: '#6B7280',
    fontSize: 16,
    fontWeight: '600',
  },
});

// Success Modal Styles
const successModalStyles = StyleSheet.create({
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    margin: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  checkmark: {
    width: 56,
    height: 56,
    marginBottom: 16,
    position: 'relative',
  },
  checkmarkCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#22C55E',
    opacity: 0.2,
  },
  checkmarkStem: {
    position: 'absolute',
    width: 6,
    height: 22,
    backgroundColor: '#22C55E',
    top: 18,
    left: 26,
    transform: [{ rotate: '45deg' }],
    borderRadius: 3,
  },
  checkmarkKick: {
    position: 'absolute',
    width: 6,
    height: 12,
    backgroundColor: '#22C55E',
    top: 28,
    left: 18,
    transform: [{ rotate: '-45deg' }],
    borderRadius: 3,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
    textAlign: 'center',
  },
  modalMessage: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 22,
  },
});

// Register Modal Styles
const registerModalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    marginHorizontal: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  iconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FEF3C7',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  icon: {
    fontSize: 30,
  },
  title: {
    fontSize: 22,
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
  submessage: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  buttonsContainer: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#6B7280',
    fontSize: 16,
    fontWeight: '600',
  },
  registerButton: {
    flex: 1,
    backgroundColor: '#DC143C',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  registerButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});

export default Login;
