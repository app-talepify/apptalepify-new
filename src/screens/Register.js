import React, { useState, useRef, useCallback, memo, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Image,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  BackHandler,
} from 'react-native';
import ImagePicker from 'react-native-image-crop-picker';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
// import { theme } from '../theme/theme';
// Firebase imports artık gerekmiyor - API kullanıyoruz
// import { collection, query, where, getDocs } from 'firebase/firestore';
// import { db } from '../firebase';
import { requestOtp, verifyOtp, checkPhoneNumber } from '../services/auth/api';
import { registerWithOtpAndStartSession } from '../services/auth/session';

// Türkçe: Cloudinary sabitleri kaldırıldı - artık Bunny kullanıyoruz

// Başarı Modalı silindi - aşağıda zaten mevcut

// Türkiye il listesi - sabit array olarak tanımlandı
const TURKEY_CITIES = [
  'Adana', 'Adıyaman', 'Afyonkarahisar', 'Ağrı', 'Amasya', 'Ankara', 'Antalya', 'Artvin', 'Aydın', 'Balıkesir',
  'Bilecik', 'Bingöl', 'Bitlis', 'Bolu', 'Burdur', 'Bursa', 'Çanakkale', 'Çankırı', 'Çorum', 'Denizli',
  'Diyarbakır', 'Edirne', 'Elazığ', 'Erzincan', 'Erzurum', 'Eskişehir', 'Gaziantep', 'Giresun', 'Gümüşhane', 'Hakkari',
  'Hatay', 'Isparta', 'Mersin', 'İstanbul', 'İzmir', 'Kars', 'Kastamonu', 'Kayseri', 'Kırklareli', 'Kırşehir',
  'Kocaeli', 'Konya', 'Kütahya', 'Malatya', 'Manisa', 'Kahramanmaraş', 'Mardin', 'Muğla', 'Muş', 'Nevşehir',
  'Niğde', 'Ordu', 'Rize', 'Sakarya', 'Samsun', 'Siirt', 'Sinop', 'Sivas', 'Tekirdağ', 'Tokat',
  'Trabzon', 'Tunceli', 'Şanlıurfa', 'Uşak', 'Van', 'Yozgat', 'Zonguldak', 'Aksaray', 'Bayburt', 'Karaman',
  'Kırıkkale', 'Batman', 'Şırnak', 'Bartın', 'Ardahan', 'Iğdır', 'Yalova', 'Karabük', 'Kilis', 'Osmaniye', 'Düzce',
].sort();

// OTP component kaldırıldı - modern tek input + görsel kutucuklar sistemi kullanılıyor

// Başarı Modalı - memo ile optimize edildi
const SuccessModal = memo(({ visible, title, message, onClose }) => {
  if (!visible) {return null;}

  return (
    <View style={styles.modalOverlay}>
      <View style={styles.modalContent}>
        <View style={styles.checkmark}>
          <View style={styles.checkmarkCircle} />
          <View style={styles.checkmarkStem} />
          <View style={styles.checkmarkKick} />
        </View>
        <Text style={styles.modalTitle}>{title}</Text>
        {message && <Text style={styles.modalMessage}>{message}</Text>}
        <Text style={styles.modalSubtitle}>Ana ekrana yönlendiriliyorsunuz...</Text>
      </View>
    </View>
  );
});

// Hesap Mevcut Modalı - memo ile optimize edildi
const AccountExistsModal = memo(({ visible, userInfo, onClose, onLogin }) => {
  if (!visible) {return null;}

  return (
    <View style={styles.modalOverlay}>
      <View style={styles.modalContent}>
        <View style={styles.modalIconContainer}>
          <Text style={styles.modalIcon}>📱</Text>
        </View>
        <Text style={styles.modalTitle}>Hesap Zaten Mevcut</Text>
        <Text style={styles.modalMessage}>
          Bu telefon numarası zaten kayıtlı!
        </Text>
        <View style={styles.userInfoContainer}>
          <Text style={styles.userInfoText}>
            👤 <Text style={styles.userInfoLabel}>Kullanıcı:</Text> {userInfo?.displayName}
          </Text>
          <Text style={styles.userInfoText}>
            🏢 <Text style={styles.userInfoLabel}>Ofis:</Text> {userInfo?.officeName}
          </Text>
        </View>
        <Text style={styles.modalSubtitle}>Giriş yapmak için giriş ekranına yönlendiriliyorsunuz.</Text>
        <TouchableOpacity style={styles.modalButton} onPress={onLogin}>
          <Text style={styles.modalButtonText}>Giriş Yap</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
});

const Register = () => {
  const navigation = useNavigation();
  const { signUp } = useAuth();

  const [step, setStep] = useState(1); // 1: telefon+şifre+referans, 2: OTP, 3: isim+ofis+myb5, 4: profil resmi, 5: sosyal medya
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Step 1
  const [phone, setPhone] = useState('');
  const [displayPhone, setDisplayPhone] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');

  // Step 2
  const [otp, setOtp] = useState('');
  const [resendCountdown, setResendCountdown] = useState(0);
  const [otpVerified, setOtpVerified] = useState(false);
  const timerRef = useRef(null);
  const otpInputRef = useRef(null);

  // Step 3
  const [profileImage, setProfileImage] = useState(null);
  
  // Debug için manuel test - kaldırıldı
  const [showImagePickerModal, setShowImagePickerModal] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Step 4 - Sosyal Medya
  const [socialInstagram, setSocialInstagram] = useState('');
  const [socialFacebook, setSocialFacebook] = useState('');
  const [socialYoutube, setSocialYoutube] = useState('');

  // Step 3 - İsim + Ofis + MYB5
  const [name, setName] = useState('');
  const [officeName, setOfficeName] = useState('');
  const [myb5Document, setMyb5Document] = useState(null);
  const [showMyb5Picker, setShowMyb5Picker] = useState(false);

  // Referans Kodu (Step 1'de kullanılıyor)
  const [referralCode, setReferralCode] = useState('');
  const [hasReferralCode, setHasReferralCode] = useState(false);

  // Step 4 - Profil Resmi (eski Step 3)
  const [city, setCity] = useState('');
  const [showCityPicker, setShowCityPicker] = useState(false);

  // Success modal
  const [successVisible, setSuccessVisible] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  // Account exists modal
  const [accountExistsVisible, setAccountExistsVisible] = useState(false);
  const [existingUserInfo, setExistingUserInfo] = useState(null);

  // Input refs
  const passwordInputRef = useRef(null);
  const password2InputRef = useRef(null);
  const officeNameInputRef = useRef(null);
  
  // OTP kutucuk tıklama handler - Android geri tuşu fix
  const handleOtpBoxPress = useCallback(() => {
    if (__DEV__) console.log('Register OTP kutucuğa tıklandı, focus veriliyor...');
    
    // Login ekranındaki çalışan mantığı uygula
    // Mevcut değeri geçici sakla
    const currentOtp = otp;
    
    // State'i temizle (handlePasswordSubmit mantığı)
    setOtp('');
    
    // Input'u blur et
    if (otpInputRef.current) {
      otpInputRef.current.blur();
    }
    
    // Kısa delay sonra değerleri geri yükle ve focus ver
    setTimeout(() => {
      setOtp(currentOtp);
      
      // Focus ver
      setTimeout(() => {
        if (otpInputRef.current) {
          otpInputRef.current.focus();
        }
      }, 50);
    }, 100);
  }, [otp]);

  // Android hardware back button handler
  useEffect(() => {
    const backAction = () => {
      // Modal'lar açıksa önce onları kapat
      if (successVisible) {
        setSuccessVisible(false);
        return true; // Event'i consume et
      }
      
      if (accountExistsVisible) {
        setAccountExistsVisible(false);
        return true; // Event'i consume et
      }
      
      if (showImagePickerModal) {
        setShowImagePickerModal(false);
        return true; // Event'i consume et
      }
      
      if (showMyb5Picker) {
        setShowMyb5Picker(false);
        return true; // Event'i consume et
      }
      
      if (showCityPicker) {
        setShowCityPicker(false);
        return true; // Event'i consume et
      }

      // Adım adım geri git
      if (step > 1) {
        // Bir önceki adıma git
        setStep(step - 1);
        setError(''); // Hataları temizle
        
        // Belirli durumlarda state'leri temizle
        if (step === 2) {
          // OTP'den telefon/şifre adımına dönüyoruz
          setOtp(''); // OTP'yi temizle
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
          setResendCountdown(0);
        }
        
        return true; // Event'i consume et
      }
      
      // İlk adımdaysak (step === 1) normal geri çıkış (Login'e dön)
      return false; // Event'i consume etme, normal davranış
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);

    return () => backHandler.remove();
  }, [step, successVisible, accountExistsVisible, showImagePickerModal, showMyb5Picker, showCityPicker]);

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

  // Geri sayım timer
  const startCountdown = useCallback((secs = 30) => {
    if (timerRef.current) {clearInterval(timerRef.current);}
    setResendCountdown(secs);
    timerRef.current = setInterval(() => {
      setResendCountdown((s) => {
        if (s <= 1) {
          clearInterval(timerRef.current);
          timerRef.current = null;
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }, []);

  // Profil resmi seçme fonksiyonları
  const handleImagePicker = useCallback(() => {
    setShowImagePickerModal(true);
  }, []);

  const hideImagePickerModal = useCallback(() => {
    setShowImagePickerModal(false);
  }, []);

  // MYB5 Belgesi Seçimi
  const handleMyb5Picker = useCallback(() => {
    setShowMyb5Picker(true);
  }, []);

  const hideMyb5Picker = useCallback(() => {
    setShowMyb5Picker(false);
  }, []);

  const openImageLibrary = useCallback(() => {
    if (__DEV__) console.log('Galeri açılıyor...');
    hideImagePickerModal();
    ImagePicker.openPicker({
      width: 300,
      height: 300,
      cropping: true,
      cropperCircleOverlay: true,
      compressImageQuality: 0.8,
      includeBase64: false,
    }).then(image => {
      if (__DEV__) console.log('Galeri: Resim seçildi:', image);
      const selectedImage = {
        uri: image.path,
        type: image.mime || 'image/jpeg',
        name: `profile-${Date.now()}.jpg`,
      };
      if (__DEV__) console.log('Galeri: SelectedImage oluşturuldu:', selectedImage);
      setProfileImage(selectedImage);
      if (__DEV__) console.log('Galeri: setProfileImage çağrıldı');
    }).catch(error => {
      if (__DEV__) console.log('Galeri: Hata oluştu:', error);
      if (error.code !== 'E_PICKER_CANCELLED') {
        console.error('Galeri seçim hatası:', error);
        Alert.alert('Hata', 'Galeri seçiminde bir hata oluştu.');
      }
    });
  }, [hideImagePickerModal]);

  const openCamera = useCallback(() => {
    hideImagePickerModal();
    ImagePicker.openCamera({
      width: 300,
      height: 300,
      cropping: true,
      cropperCircleOverlay: true,
      compressImageQuality: 0.8,
      includeBase64: false,
    }).then(image => {
      const selectedImage = {
        uri: image.path,
        type: image.mime || 'image/jpeg',
        name: `camera-${Date.now()}.jpg`,
      };
      setProfileImage(selectedImage);
      if (__DEV__) console.log('Kamera: ProfileImage state set edildi:', selectedImage);
    }).catch(error => {
      if (error.code !== 'E_PICKER_CANCELLED') {
        console.error('Kamera hatası:', error);
        Alert.alert('Hata', 'Kamera kullanımında bir hata oluştu.');
      }
    });
  }, [hideImagePickerModal]);

  // Step 1: Telefon + Şifre + Kayıt Ol
  const handleRegister = useCallback(async () => {
    setError('');

    // Telefon numarasını temizle ve formatla
    let cleanPhone = phone.replace(/\D/g, ''); // Sadece rakamları al

    // Türkiye telefon numarası kontrolü
    if (cleanPhone.length === 10 && cleanPhone.startsWith('5')) {
      // 5xxxxxxxxx formatı
      cleanPhone = '+90' + cleanPhone;
    } else if (cleanPhone.length === 11 && cleanPhone.startsWith('05')) {
      // 05xxxxxxxxx formatı
      cleanPhone = '+90' + cleanPhone.substring(1);
    } else if (cleanPhone.length === 12 && cleanPhone.startsWith('+90')) {
      // +905xxxxxxxxx formatı - zaten doğru format
    } else {
      setError('Telefon numarası geçerli değil. 5xxxxxxxxx veya 05xxxxxxxxx formatında girin');
      return;
    }

    // Phone state zaten doğru, değiştirmeye gerek yok

    if (!password || password.length !== 6) {
      setError('Şifre tam 6 karakter olmalı');
      return;
    }
    if (password !== password2) {
      setError('Şifreler eşleşmiyor');
      return;
    }

    try {
      setLoading(true);

      // Telefon numarasının zaten kayıtlı olup olmadığını kontrol et (API kullanarak)
      if (__DEV__) console.log('🔍 Telefon numarası kontrol ediliyor (API):', cleanPhone);

      // Yeni API kullanarak telefon kontrolü yap
      const checkResult = await checkPhoneNumber(cleanPhone);
      
      if (!checkResult.ok) {
        if (__DEV__) console.error('Telefon kontrol API hatası:', checkResult.code, checkResult.message);
        setError(checkResult.message || 'Telefon numarası kontrol edilirken bir hata oluştu');
        return;
      }

      if (checkResult.data.exists) {
        if (__DEV__) console.log('⚠️ Telefon numarası zaten kayıtlı');

        // Modal'ı göster - existing user bilgilerini almak için ayrı call gerekebilir
        // Şimdilik varsayılan bilgi göster
        setExistingUserInfo({
          displayName: 'Kayıtlı Kullanıcı',
          officeName: 'Belirtilmemiş',
        });
        setAccountExistsVisible(true);
        return;
      }

      if (__DEV__) console.log('✅ Telefon numarası kayıtlı değil, kayıt işlemine devam ediliyor');

      // OTP Service ile gerçek SMS gönderimi
      if (__DEV__) console.log('OTP servisi ile SMS gönderiliyor...');
      
      // OTP gönder (service zaten App.js'te initialize edildi)
      const otpResult = await requestOtp(cleanPhone, 'register');
      if (otpResult.ok) {
        if (__DEV__) console.log('OTP başarıyla gönderildi, OTP ekranına geçiliyor');
        setStep(2); // OTP ekranına geç
        startCountdown(); // Countdown başlat
      } else {
        if (__DEV__) console.error('OTP gönderim hatası:', otpResult.code);
        setError(otpResult.message || 'SMS gönderilemedi. Lütfen tekrar deneyin.');
      }
      
      setLoading(false);
    } catch (err) {
      if (__DEV__) console.error('Telefon numarası kontrol hatası:', err);
      setError('Doğrulama kodu gönderilemedi: ' + err.message);
      setLoading(false);
    }
  }, [phone, password, password2, startCountdown]);


  // Step 2: OTP Doğrula (Login OTP ile aynı yaklaşım - arg ile çağır)
  const handleVerifyOtp = useCallback(async (otpValue = null) => {
    setError('');

    // En güncel değeri kullan
    const currentOtp = otpValue || otp;

    // OTP uzunluk kontrolü
    if (String(currentOtp).length !== 6) {
      setError('6 haneli kodu tam olarak girin');
      return;
    }

    try {
      setLoading(true);
      
      // OTP Service ile doğrulama yap (service zaten initialize edildi)
      // Telefon numarasını aynı formatta kullan (gönderimde kullanılan format)
      let cleanPhone = phone.replace(/\D/g, '');
      if (cleanPhone.startsWith('0')) {
        cleanPhone = '+90' + cleanPhone.substring(1);
      } else if (!cleanPhone.startsWith('+90')) {
        cleanPhone = '+90' + cleanPhone;
      }
      
      const otpResult = await verifyOtp(cleanPhone, currentOtp, 'register');
      if (!otpResult.ok || !otpResult.verified) {
        if (__DEV__) console.log('OTP doğrulama hatası:', otpResult.code);
        setError(otpResult.message || 'Geçersiz kod. Lütfen tekrar deneyin.');
        
        // Hatalı kod durumunda temizle
        if (otpResult.code === 'invalid_otp' || otpResult.code === 'otp_expired') {
          setOtp(''); // OTP'yi temizle
          // Input'a tekrar focus ver
          setTimeout(() => {
            if (otpInputRef.current) {
              otpInputRef.current.focus();
            }
          }, 100);
        }
        return;
      }
      
      if (__DEV__) console.log('Kayıt OTP\'si başarıyla doğrulandı');
      setOtpVerified(true); // OTP doğrulandı olarak işaretle
      
      // Başarı modalını göster
      setSuccessMessage('✅ Telefon doğrulandı! Bilgilerinizi tamamlayın.');
      setSuccessVisible(true);
      
      // 1.5 saniye sonra bir sonraki adıma geç
      setTimeout(() => {
        setSuccessVisible(false);
        setStep(3);
      }, 1500);
    } catch (err) {
      setError('Doğrulama hatalı: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [otp]);

  // OTP yeniden gönder
  const handleResendOtp = useCallback(async () => {
    if (resendCountdown > 0) {return;}

    try {
      setLoading(true);
      
      // OTP yeniden gönder (normalize edip gönder)
      let cleanPhone = phone.replace(/\D/g, '');
      if (cleanPhone.startsWith('0')) {
        cleanPhone = '+90' + cleanPhone.substring(1);
      } else if (!cleanPhone.startsWith('+90')) {
        cleanPhone = '+90' + cleanPhone;
      }
      const otpResult = await requestOtp(cleanPhone, 'register');
      if (!otpResult.ok) {
        if (__DEV__) console.error('OTP yeniden gönderim hatası:', otpResult.code);
        setError(otpResult.message || 'SMS tekrar gönderilemedi. Lütfen bekleyin.');
      } else {
        if (__DEV__) console.log('Kayıt OTP\'si başarıyla yeniden gönderildi');
        startCountdown(30);
        setOtp('');
      }
    } catch (err) {
      setError('Kod yeniden gönderilemedi: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [resendCountdown, startCountdown, phone]);

  // Son kayıt
  const handleFinish = useCallback(async () => {
    setError('');

    // OTP doğrulaması kontrolü
    if (!otpVerified) {
      setError('Lütfen önce telefon numaranızı doğrulayın.');
      return;
    }

    // Profil resmi artık zorunlu değil, varsayılan resim kullanılacak

    try {
      setLoading(true);

      // Profil resmini Cloudinary'ye yükle veya varsayılan resmi kullan
      let profilePictureUrl = null;
      if (profileImage && profileImage.uri && !profileImage.uri.includes('placeholder')) {
        try {
          // Türkçe: Bunny bayrağı açıksa önce Bunny'ye yüklemeyi dene
          try {
            const { USE_BUNNY, uploadImageToBunny } = require('../utils/media');
            if (USE_BUNNY) {
              const fileName = profileImage.name || 'profile.jpg';
              const result = await uploadImageToBunny({ fileUri: profileImage.uri, fileName, mime: profileImage.type || 'image/jpeg', path: 'images/profiles' });
              if (result?.cdnUrl) {
                profilePictureUrl = result.cdnUrl;
              }
            }
          } catch (bunnyErr) {
            // Bunny başarısız ise Cloudinary ile devam
            if (__DEV__) {
              console.warn('Bunny yükleme başarısız, Cloudinary fallback:', bunnyErr?.message);
            }
          }

          // Bunny başarılı olduysa Cloudinary'yi atla
          if (profilePictureUrl) {
            // Bunny başarılı, kayıt işlemine devam
          } else {
            // Cloudinary fallback (Bunny başarısız olursa)
            const formData = new FormData();
            formData.append('file', {
              uri: profileImage.uri,
              type: profileImage.type || 'image/jpeg',
              name: profileImage.name || 'profile.jpg',
            });
            formData.append('upload_preset', 'armenkuL_preset');

            const response = await fetch(
              'https://api.cloudinary.com/v1_1/dutsz2qlo/image/upload',
              {
                method: 'POST',
                body: formData,
                headers: {
                  'Content-Type': 'multipart/form-data',
                },
              },
            );

            const responseData = await response.json();
            profilePictureUrl = responseData.secure_url;
          }
        } catch (uploadError) {
          // console.error('Cloudinary upload hatası:', uploadError);
          Alert.alert('Uyarı', 'Profil resmi yüklenemedi, varsayılan resim kullanılacak.');
          // Varsayılan resim kullan
          profilePictureUrl = 'https://via.placeholder.com/120x120/4F46E5/FFFFFF?text=Profil';
        }
      } else if (profileImage) {
        // Mock resim kullan
        profilePictureUrl = profileImage.uri;
      } else {
        // Profil resmi yoksa varsayılan resmi kullan
        profilePictureUrl = 'default-logo'; // Varsayılan resim işareti
      }

      // Normalize phone number
      let cleanPhone = phone.replace(/\D/g, '');
      if (cleanPhone.startsWith('0')) {
        cleanPhone = '+90' + cleanPhone.substring(1);
      } else if (!cleanPhone.startsWith('+90')) {
        cleanPhone = '+90' + cleanPhone;
      }

      // Register ile custom token al (OTP zaten doğrulandı)
      const result = await registerWithOtpAndStartSession(cleanPhone, '000000', {
        displayName: name,
        phoneNumber: cleanPhone,
        city: city,
        officeName: officeName,
        profilePicture: profilePictureUrl,
        myb5Document: myb5Document,
        socialInstagram: socialInstagram,
        socialFacebook: socialFacebook,
        socialYoutube: socialYoutube,
        referredBy: hasReferralCode && referralCode ? referralCode : null,
        password: password, // Password hash'i de server'da oluşturulsun
      });

      if (result.success) {
        // Kayıt başarılı, otomatik giriş yap
        if (__DEV__) console.log('Register: Kayıt başarılı, success modal gösteriliyor...');
        
        // Firebase Auth state'in sync olması için kısa bekleyelim
        setTimeout(() => {
          if (__DEV__) console.log('Register: Auth state sync için bekleniyor...');
          // Firebase Auth state sync olması bekleniyor, normal flow devam ediyor
        }, 1000);
        
        setSuccessMessage('Kaydınız tamamlanmıştır. 7 günlük deneme sürümü aktifleştirilmiştir. Otomatik giriş yapılıyor...');
        setSuccessVisible(true);

        // 2 saniye sonra otomatik giriş yap
        setTimeout(() => {
          try {
            setSuccessVisible(false);
            console.log('Register: Success modal kapatıldı, MainTabs\'a yönlendiriliyor...');
            navigation.reset({
              index: 0,
              routes: [{ name: 'MainTabs' }],
            });
          } catch (navError) {
            if (__DEV__) console.error('Register: Navigation error:', navError);
            // Navigation hatası olursa Alert göster
            Alert.alert('Uyarı', 'Kayıt başarılı! Ana ekrana geçmek için uygulamayı yeniden başlatın.');
          }
        }, 2000);
      } else {
        setError('Kayıt tamamlanamadı: ' + (result.error || 'Bilinmeyen hata'));
      }
    } catch (err) {
      if (__DEV__) console.error('Register: Kayıt işlemi catch bloğu:', err);
      const errorMessage = 'Kayıt tamamlanamadı: ' + err.message;
      setError(errorMessage);
      // Eğer modal açıksa, hata için Alert de göster
      if (successVisible) {
        Alert.alert('Hata', errorMessage);
      }
    } finally {
      setLoading(false);
    }
  }, [name, officeName, city, profileImage, myb5Document, socialInstagram, socialFacebook, socialYoutube, hasReferralCode, referralCode, phone, password, signUp, navigation, otpVerified]);

  const goNext = useCallback(() => {
    // Step 3'te (isim, ofis, şehir) akıllı validasyon yap
    if (step === 3) {
      const missingFields = [];

      if (!name) missingFields.push('İsim');
      if (!officeName) missingFields.push('Ofis adı');
      if (!city) missingFields.push('Şehir');

      if (missingFields.length > 0) {
        if (missingFields.length === 1) {
          setError(`${missingFields[0]} zorunludur`);
        } else if (missingFields.length === 2) {
          setError(`${missingFields[0]} ve ${missingFields[1]} zorunludur`);
        } else {
          setError(`${missingFields[0]}, ${missingFields[1]} ve ${missingFields[2]} zorunludur`);
        }
        return;
      }
    }
    setStep((s) => s + 1);
  }, [step, name, officeName, city]);
  const goBack = useCallback(() => setStep((s) => Math.max(1, s - 1)), []);

  // Geri tuşu için akıllı navigasyon
  const handleBackPress = useCallback(() => {
    if (step === 1) {
      // İlk adımdaysa ana ekrana dön
      navigation.goBack();
    } else {
      // Diğer adımlarda bir önceki adıma git
      goBack();
    }
  }, [step, navigation, goBack]);

  const closeSuccessModal = useCallback(() => {
    setSuccessVisible(false);
    // Manuel olarak kapatılırsa da MainTabs'a yönlendir ve stack'i sıfırla
    navigation.reset({
      index: 0,
      routes: [{ name: 'MainTabs' }],
    });
  }, [navigation]);

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          scrollEnabled={false}
          contentContainerStyle={{flexGrow: 1}}
        >
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
              source={require('../assets/images/robot-mascot2.png')}
              style={styles.robotImage}
              resizeMode="contain"
            />
          </View>
        </View>

        {/* Content Container */}
        <View style={styles.contentContainer}>
          {/* Back Button */}
          <TouchableOpacity
            style={styles.backButton}
            onPress={handleBackPress}
            accessibilityRole="button"
            accessibilityLabel="Geri"
          >
            <Image source={require('../assets/images/icons/return.png')} style={styles.backButtonIcon} />
          </TouchableOpacity>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {/* Step 1: Telefon + Şifre */}
        {step === 1 && (
          <View style={styles.stepContainer}>

            <View style={styles.inputContainer}>
              <TextInput
                style={styles.textInput}
                value={displayPhone}
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
                }}
                placeholder="Telefon numaranızı girin"
                placeholderTextColor="rgba(255,255,255,0.6)"
                keyboardType="numeric"
                maxLength={19}
                autoCapitalize="none"
                autoCorrect={false}
                onSubmitEditing={() => {
                  // Şifre input'una focus ver
                  passwordInputRef.current?.focus();
                }}
                returnKeyType="next"
              />
            </View>

            <View style={styles.inputContainer}>
              <TextInput
                ref={passwordInputRef}
                style={styles.textInput}
                placeholder="6 rakam"
                value={password}
                onChangeText={(text) => {
                  // Sadece rakamları al
                  const numericText = text.replace(/\D/g, '');
                  if (numericText.length <= 6) {
                    setPassword(numericText);
                  }
                }}
                secureTextEntry
                placeholderTextColor="rgba(255,255,255,0.6)"
                keyboardType="numeric"
                maxLength={6}
                autoCapitalize="none"
                autoCorrect={false}
                onSubmitEditing={() => {
                  // Şifre input'una focus ver
                  password2InputRef.current?.focus();
                }}
                returnKeyType="next"
              />
            </View>

            <View style={styles.inputContainer}>
              <TextInput
                ref={password2InputRef}
                style={styles.textInput}
                placeholder="6 rakamı tekrar girin"
                value={password2}
                onChangeText={(text) => {
                  // Sadece rakamları al
                  const numericText = text.replace(/\D/g, '');
                  if (numericText.length <= 6) {
                    setPassword2(numericText);
                  }
                }}
                secureTextEntry
                placeholderTextColor="rgba(255,255,255,0.6)"
                keyboardType="numeric"
                maxLength={6}
                autoCapitalize="none"
                autoCorrect={false}
                onSubmitEditing={() => {}}
                returnKeyType="done"
              />
            </View>

            <Text style={styles.trialInfoText}>
              "Yeni kayıt olan kullanıcılarımıza 7 gün ücretsiz"
            </Text>

            {/* Referans Kodu */}
            <View style={styles.inputContainer}>
              <View style={styles.referralSection}>
                <TouchableOpacity
                  style={styles.referralToggleButton}
                  onPress={() => setHasReferralCode(!hasReferralCode)}
                >
                  <Text style={styles.referralToggleButtonText}>
                    Referans kodum var
                  </Text>
                </TouchableOpacity>
              </View>

              {hasReferralCode && (
                <>
                  <TextInput
                    style={styles.textInput}
                    placeholder="Referans kodunuzu girin (opsiyonel)"
                    value={referralCode}
                    onChangeText={setReferralCode}
                    placeholderTextColor="rgba(255,255,255,0.6)"
                    autoCapitalize="characters"
                    autoCorrect={false}
                  />
                  <Text style={styles.referralInfo}>
                    💡 Referans kodu ile kayıt olursanız, abonelik satın aldığınızda referans kodu sahibine 30 gün ek süre verilir.
                  </Text>
                </>
              )}
            </View>

            <TouchableOpacity
              style={[styles.primaryButton, loading && styles.buttonDisabled]}
              onPress={handleRegister}
              disabled={loading}
            >
              <Text style={styles.primaryButtonText}>
                {loading ? 'Gönderiliyor...' : 'Kayıt Ol'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Step 2: OTP */}
        {step === 2 && (
          <View style={styles.stepContainer}>
            <Text style={styles.otpTitle}>SMS Doğrulama</Text>
            <Text style={styles.otpSubtitle}>
              <Text style={styles.phoneNumber}>{displayPhone || phone}</Text> numarasına gönderilen 6 haneli doğrulama kodunuzu girin
            </Text>

            <TouchableOpacity
              style={[styles.otpContainerLogin, error && styles.otpError]}
              onPress={handleOtpBoxPress}
              activeOpacity={0.7}
            >
              {[0, 1, 2, 3, 4, 5].map((index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.otpDigitContainer}
                  onPress={handleOtpBoxPress}
                  activeOpacity={0.7}
                >
                  <Text style={styles.otpDigit}>{otp[index] || ''}</Text>
                </TouchableOpacity>
              ))}
            </TouchableOpacity>

            <TextInput
              ref={otpInputRef}
              style={styles.hiddenOtpInput}
              value={otp}
              onChangeText={(text) => {
                const cleanedText = text.replace(/\D/g, '').slice(0, 6);
                setOtp(cleanedText);

                // 6 haneli kod girildiğinde otomatik doğrula
                if (cleanedText.length === 6) {
                  setTimeout(() => {
                    handleVerifyOtp(cleanedText);
                  }, 100); // Küçük bir gecikme ile UI güncellemesini bekle
                }
              }}
              keyboardType="numeric"
              maxLength={6}
              autoFocus={true}
              returnKeyType="done"
              onSubmitEditing={() => handleVerifyOtp(otp)}
              // Performans optimizasyonları
              autoCompleteType="off"
              autoCorrect={false}
              spellCheck={false}
              textContentType="oneTimeCode"
              blurOnSubmit={false}
              clearButtonMode="never"
              enablesReturnKeyAutomatically={true}
            />

            <TouchableOpacity
              style={[styles.primaryButton, otp.length !== 6 && styles.buttonDisabled]}
              onPress={() => handleVerifyOtp(otp)}
              disabled={loading || otp.length !== 6}
            >
              <Text style={styles.primaryButtonText}>
                {loading ? 'Kontrol ediliyor...' : 'Devam Et'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.secondaryButton, resendCountdown > 0 && styles.buttonDisabled]}
              onPress={handleResendOtp}
              disabled={loading || resendCountdown > 0}
            >
              <Text style={styles.secondaryButtonText}>
                {resendCountdown > 0
                  ? `Kodu Tekrar Gönder (${resendCountdown}s)`
                  : 'Kodu Tekrar Gönder'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Step 4: Profil Resmi */}
        {step === 4 && (
          <View style={styles.stepContainer}>
            <Text style={styles.profileImageTitle}>Profil Resmi</Text>
            <Text style={styles.profileImageSubtitle}>Profil resminizi seçin (opsiyonel - varsayılan logo kullanılacak)</Text>

            <View style={styles.profileImageContainer}>
              {console.log('Render: profileImage state:', profileImage)}
              {profileImage ? (
                <Image
                  source={{ uri: profileImage.uri }}
                  style={styles.profileImage}
                  onError={(error) => {
                    console.log('Profil resmi yükleme hatası:', error);
                    console.log('ProfileImage state:', profileImage);
                  }}
                  onLoad={() => {
                    console.log('Profil resmi yüklendi:', profileImage.uri);
                  }}
                />
              ) : (
                <View style={styles.profileImagePlaceholder}>
                  <Image
                    source={require('../assets/images/logo-krimson.png')}
                    style={styles.profileImageIcon}
                  />
                </View>
              )}
              <TouchableOpacity
                style={styles.editImageButton}
                onPress={handleImagePicker}
                disabled={uploading}
              >
                <Image
                  source={require('../assets/images/icons/userphoto.png')}
                  style={styles.editImageIcon}
                />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.primaryButton]}
              onPress={goNext}
              disabled={loading}
            >
              <Text style={styles.primaryButtonText}>Devam Et</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Step 5: Sosyal Medya + Kaydı Tamamla */}
        {step === 5 && (
          <View style={styles.stepContainer}>
            <Text style={styles.socialMediaTitle}>Sosyal Medya Bilgileri</Text>
            <Text style={styles.socialMediaSubtitle}>Sosyal medya hesaplarınızı ekleyin (opsiyonel)</Text>

            <View style={styles.inputContainer}>
              <View style={styles.socialMediaInputContainer}>
                <View style={styles.socialMediaIconContainer}>
                  <Text style={styles.socialMediaEmoji}>📷</Text>
                </View>
                <TextInput
                  style={styles.socialMediaInput}
                  placeholder="Instagram kullanıcı adı"
                  value={socialInstagram}
                  onChangeText={setSocialInstagram}
                  placeholderTextColor="rgba(107,114,128,0.6)"
                  autoCapitalize="none"
                />
              </View>
            </View>

            <View style={styles.inputContainer}>
              <View style={styles.socialMediaInputContainer}>
                <View style={styles.socialMediaIconContainer}>
                  <Text style={styles.socialMediaEmoji}>👥</Text>
                </View>
                <TextInput
                  style={styles.socialMediaInput}
                  placeholder="Facebook kullanıcı adı"
                  value={socialFacebook}
                  onChangeText={setSocialFacebook}
                  placeholderTextColor="rgba(107,114,128,0.6)"
                  autoCapitalize="none"
                />
              </View>
            </View>

            <View style={styles.inputContainer}>
              <View style={styles.socialMediaInputContainer}>
                <View style={styles.socialMediaIconContainer}>
                  <Text style={styles.socialMediaEmoji}>📺</Text>
                </View>
                <TextInput
                  style={styles.socialMediaInput}
                  placeholder="YouTube kanal adı"
                  value={socialYoutube}
                  onChangeText={setSocialYoutube}
                  placeholderTextColor="rgba(107,114,128,0.6)"
                  autoCapitalize="none"
                />
              </View>
            </View>

            <TouchableOpacity
              style={[styles.primaryButton]}
              onPress={handleFinish}
              disabled={loading}
            >
              <Text style={styles.primaryButtonText}>
                {loading ? 'Kaydediliyor...' : 'Kaydı Tamamla'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Step 3: İsim + Ofis + MYB5 */}
        {step === 3 && (
          <View style={styles.stepContainer}>

            <View style={styles.inputContainer}>
              <TextInput
                style={styles.textInput}
                placeholder="İsim ve Soyisim giriniz"
                value={name}
                onChangeText={(text) => {
                  setName(text);
                  if (error) setError('');
                }}
                placeholderTextColor="#FFFFFF"
                onSubmitEditing={() => {
                  // Ofis ismi input'una focus ver
                  officeNameInputRef.current?.focus();
                }}
                returnKeyType="next"
              />
            </View>

            <View style={styles.inputContainer}>
              <TextInput
                ref={officeNameInputRef}
                style={styles.textInput}
                placeholder="Ofis ismi giriniz"
                value={officeName}
                onChangeText={(text) => {
                  setOfficeName(text);
                  if (error) setError('');
                }}
                placeholderTextColor="#FFFFFF"
                onSubmitEditing={goNext}
                returnKeyType="done"
              />
            </View>

            {/* Şehir Seçimi */}
            <View style={styles.inputContainer}>
              <Text style={styles.documentLabel}>Şehir Seçimi</Text>
              <Text style={styles.cityInfoText}>
                "İl seçiminiz portföy havuzu ve talep havuzu varsayılanı olarak eklenir dilediğiniz zaman ayarlardan şehri değiştirebilirsiniz."
              </Text>
              <View style={styles.cityPickerContainer}>
                <TouchableOpacity
                  style={styles.cityPickerButton}
                  onPress={() => setShowCityPicker(true)}
                >
                  <Text style={[styles.cityPickerText, !city && styles.cityPickerPlaceholder]}>
                    {city || 'Şehir seçin'}
                  </Text>
                  <Text style={styles.cityPickerIcon}>▼</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* MYB5 Belgesi */}
            <View style={styles.inputContainer}>
              <Text style={styles.documentLabel}>MYB5 Belgesi (Opsiyonel)</Text>
              <TouchableOpacity
                style={styles.documentPickerButton}
                onPress={() => setShowMyb5Picker(true)}
              >
                {myb5Document ? (
                  <View style={styles.documentSelected}>
                    <Text style={styles.documentSelectedText}>📄 Belge seçildi</Text>
                    <Text style={styles.documentFileName}>{myb5Document.name}</Text>
                  </View>
                ) : (
                  <View style={styles.documentPlaceholder}>
                    <Text style={styles.documentPlaceholderText}>📄 MYB5 Belgesi Seç</Text>
                    <Text style={styles.documentPlaceholderSubtext}>Tap to select document</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.primaryButton]}
              onPress={goNext}
              disabled={loading}
            >
              <Text style={styles.primaryButtonText}>Devam Et</Text>
            </TouchableOpacity>
          </View>
        )}

        </View>

              {/* Başarı Modalı */}
        <SuccessModal
          visible={successVisible}
          title="Başarılı!"
          message={successMessage}
          onClose={closeSuccessModal}
        />

        {/* Hesap Mevcut Modalı */}
        <AccountExistsModal
          visible={accountExistsVisible}
          userInfo={existingUserInfo}
          onClose={() => setAccountExistsVisible(false)}
          onLogin={() => {
            setAccountExistsVisible(false);
            navigation.navigate('Login');
          }}
        />
      </ScrollView>
      </KeyboardAvoidingView>

      {/* Profil Resmi Seçim Modalı */}
      <Modal
        visible={showImagePickerModal}
        transparent={true}
        animationType="fade"
        onRequestClose={hideImagePickerModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.imagePickerModalContent}>
            <Text style={styles.imagePickerModalTitle}>Profil Resmi Seç</Text>

            <TouchableOpacity
              style={styles.imagePickerModalButton}
              onPress={openCamera}
            >
              <Image
                source={require('../assets/images/icons/camera.png')}
                style={styles.imagePickerModalButtonIcon}
              />
              <Text style={styles.imagePickerModalButtonText}>Kamera</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.imagePickerModalButton}
              onPress={openImageLibrary}
            >
              <Image
                source={require('../assets/images/icons/gallery.png')}
                style={styles.imagePickerModalButtonIcon}
              />
              <Text style={styles.imagePickerModalButtonText}>Galeri</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.imagePickerModalCancelButton}
              onPress={hideImagePickerModal}
            >
              <Text style={styles.imagePickerModalCancelButtonText}>İptal</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Şehir Seçim Modalı */}
       <Modal
         visible={showCityPicker}
         animationType="slide"
         transparent={true}
         onRequestClose={() => setShowCityPicker(false)}
       >
         <View style={styles.cityModalOverlay}>
           <View style={styles.cityModalContent}>
             <View style={styles.cityModalHeader}>
               <Text style={styles.cityModalTitle}>Şehir Seçin</Text>
               <TouchableOpacity
                 style={styles.cityModalCloseButton}
                 onPress={() => setShowCityPicker(false)}
               >
                 <Text style={styles.cityModalCloseText}>✕</Text>
               </TouchableOpacity>
             </View>
             <ScrollView style={styles.cityListContainer}>
               {TURKEY_CITIES.map((cityName) => (
                 <TouchableOpacity
                   key={cityName}
                   style={styles.cityItem}
                   onPress={() => {
                     setCity(cityName);
                     setShowCityPicker(false);
                     if (error) setError('');
                   }}
                 >
                   <Text style={styles.cityItemText}>{cityName}</Text>
                 </TouchableOpacity>
               ))}
             </ScrollView>
           </View>
         </View>
       </Modal>

      {/* MYB5 Belgesi Seçim Modalı */}
      <Modal
        visible={showMyb5Picker}
        animationType="slide"
        transparent={true}
        onRequestClose={hideMyb5Picker}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.imagePickerModalContent}>
            <Text style={styles.imagePickerModalTitle}>MYB5 Belgesi Seç</Text>

            <TouchableOpacity
              style={styles.imagePickerModalButton}
              onPress={() => {
                hideMyb5Picker();
                // Mock belge seçimi
                setMyb5Document({
                  name: 'MYB5_Belgesi.pdf',
                  uri: 'mock://document.pdf',
                });
              }}
            >
              <Text style={styles.imagePickerModalButtonText}>📄 Belge Seç</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.imagePickerModalCancelButton}
              onPress={hideMyb5Picker}
            >
              <Text style={styles.imagePickerModalCancelButtonText}>İptal</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
 };

const { height: screenHeight } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#DC143C',
  },
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 15,
    paddingTop: 20,
  },
  logoContainer: {
    alignItems: 'center',
    paddingTop: 10,
    marginBottom: 10,
  },
  logoImage: {
    width: 120,
    height: 60,
  },
  robotContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'flex-end',
    marginBottom: -60,
    marginTop: -20,
  },
  robot: {
    width: 240,
    height: 240,
    alignItems: 'center',
    justifyContent: 'center',
  },
  robotImage: {
    width: 240,
    height: 240,
  },
  contentContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 40,
    minHeight: screenHeight * 0.75,
    marginBottom: 0,
  },
  welcomeSubtitle: {
    fontSize: 32,
    fontWeight: '700',
    color: '#DC143C',
    textAlign: 'center',
    marginBottom: 6,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1F2937',
    textAlign: 'center',
    marginBottom: 20,
  },
  backButton: {
    backgroundColor: '#DC143C',
    width: 40,
    height: 40,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
    alignSelf: 'flex-start',
  },
  backButtonIcon: {
    width: 20,
    height: 20,
    tintColor: '#FFFFFF',
  },
  stepContainer: {
    backgroundColor: 'transparent',
    borderRadius: 12,
    padding: 0,
    marginBottom: 20,
  },
  stepTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 24,
    textAlign: 'center',
  },
  inputContainer: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 8,
  },
  referralLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: '#1F2937',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#FFFFFF',
    borderWidth: 0,
    textAlign: 'center',
  },
  errorText: {
    color: '#DC143C',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
    padding: 12,
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  primaryButton: {
    backgroundColor: '#DC143C',
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
    marginVertical: 16,
    marginHorizontal: 20,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#DC143C',
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 10,
    marginHorizontal: 20,
  },
  secondaryButtonText: {
    color: '#DC143C',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  halfButton: {
    flex: 1,
  },
  profileImageTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
    textAlign: 'center',
    marginBottom: 8,
  },
  profileImageSubtitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 24,
  },
  profileImageContainer: {
    alignItems: 'center',
    marginBottom: 30,
    position: 'relative',
  },
  profileImagePlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#FFFFFF',
    borderWidth: 4,
    borderColor: '#DC143C',
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileImageIcon: {
    width: 50,
    height: 50,
    tintColor: '#DC143C',
  },
  profileImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 4,
    borderColor: '#DC143C',
  },
  editImageButton: {
    position: 'absolute',
    bottom: 0,
    right: '50%',
    marginRight: -60 + 90, // Center relative to image + offset to bottom-right
    backgroundColor: '#DC143C',
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  editImageIcon: {
    width: 16,
    height: 16,
    tintColor: '#FFFFFF',
  },
  trialInfoText: {
    fontSize: 14,
    color: '#DC143C',
    textAlign: 'center',
    marginBottom: 16,
    marginTop: 8,
    lineHeight: 20,
  },
  infoBox: {
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    padding: 16,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
  },
  infoText: {
    fontSize: 14,
    color: '#92400E',
    lineHeight: 20,
    textAlign: 'center',
  },
  // OTP Styles
  otpTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
    textAlign: 'center',
    marginBottom: 12,
  },
  otpSubtitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  phoneNumber: {
    color: '#DC143C',
    fontWeight: '600',
  },
  otpContainerLogin: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    paddingHorizontal: 10,
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
    left: -9999,
    height: 0,
    width: 0,
  },
  otpContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    paddingHorizontal: 10,
    gap: 8,
  },
  otpBox: {
    flex: 1,
    backgroundColor: '#1F2937',
    borderRadius: 8,
    height: 42,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    minWidth: 42,
  },
  // Modal Styles
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
  modalButton: {
    backgroundColor: '#DC143C',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  // Image Picker Modal Styles
  imagePickerModalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    padding: 20,
    width: '80%',
    maxWidth: 300,
  },
  imagePickerModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1F2937',
    textAlign: 'center',
    marginBottom: 20,
  },
  imagePickerModalButton: {
    backgroundColor: 'rgba(220, 20, 60, 0.1)',
    borderRadius: 12,
    padding: 15,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#DC143C',
  },
  imagePickerModalButtonIcon: {
    width: 20,
    height: 20,
    marginRight: 10,
    tintColor: '#DC143C',
  },
  imagePickerModalButtonText: {
    color: '#DC143C',
    fontSize: 16,
    fontWeight: '600',
  },
  imagePickerModalCancelButton: {
    backgroundColor: 'rgba(107, 114, 128, 0.1)',
    borderRadius: 12,
    padding: 15,
    marginTop: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#6B7280',
  },
  imagePickerModalCancelButtonText: {
    color: '#6B7280',
    fontSize: 16,
    fontWeight: '500',
  },
     modalButtonText: {
     color: '#FFFFFF',
     fontSize: 16,
     fontWeight: '600',
   },

   // City Picker Styles
   cityPickerContainer: {
     marginBottom: 20,
   },
   cityPickerButton: {
     flexDirection: 'row',
     justifyContent: 'space-between',
     alignItems: 'center',
     backgroundColor: '#1F2937',
     borderRadius: 8,
     paddingHorizontal: 16,
     paddingVertical: 14,
   },
   cityPickerText: {
     fontSize: 16,
     color: '#FFFFFF',
   },
   cityPickerPlaceholder: {
     color: 'rgba(255,255,255,0.6)',
   },
   cityPickerIcon: {
     fontSize: 16,
     color: '#FFFFFF',
   },

   // City Modal Styles
   cityModalOverlay: {
     flex: 1,
     backgroundColor: 'rgba(0,0,0,0.5)',
     justifyContent: 'center',
     alignItems: 'center',
   },
   cityModalContent: {
     backgroundColor: '#FFFFFF',
     borderRadius: 16,
     margin: 20,
     width: '90%',
     maxHeight: '80%',
   },
   cityModalHeader: {
     flexDirection: 'row',
     justifyContent: 'space-between',
     alignItems: 'center',
     padding: 20,
     borderBottomWidth: 1,
     borderBottomColor: '#E0E0E0',
   },
   cityModalTitle: {
     fontSize: 18,
     fontWeight: '600',
     color: '#333',
   },
   cityModalCloseButton: {
     padding: 5,
   },
   cityModalCloseText: {
     fontSize: 24,
     color: '#666',
   },
   cityListContainer: {
     maxHeight: 400,
   },
   cityItem: {
     paddingVertical: 15,
     paddingHorizontal: 20,
     borderBottomWidth: 1,
     borderBottomColor: '#F0F0F0',
   },
   cityItemText: {
     fontSize: 16,
     color: '#333',
   },

   // Şehir Bilgi Yazısı
   cityInfoText: {
     fontSize: 14,
     color: '#DC143C',
     textAlign: 'center',
     marginBottom: 16,
     marginTop: 8,
     lineHeight: 20,
     paddingHorizontal: 10,
   },

   // Referans Kodu Stilleri
   referralSection: {
     marginBottom: 16,
   },
   referralToggleButton: {
     backgroundColor: 'transparent',
     borderWidth: 2,
     borderColor: '#DC143C',
     borderRadius: 8,
     paddingVertical: 12,
     paddingHorizontal: 16,
     alignItems: 'center',
     marginHorizontal: 20,
   },
   referralToggleButtonText: {
     fontSize: 16,
     color: '#DC143C',
     fontWeight: '600',
   },
   referralHeader: {
     flexDirection: 'row',
     justifyContent: 'space-between',
     alignItems: 'center',
     marginBottom: 8,
   },
   referralToggle: {
     backgroundColor: 'transparent',
     paddingHorizontal: 12,
     paddingVertical: 6,
     borderRadius: 16,
     borderWidth: 1,
     borderColor: '#DC143C',
   },
   referralToggleText: {
     fontSize: 14,
     color: '#DC143C',
     fontWeight: '500',
   },
   referralToggleActive: {
     color: '#DC143C',
     fontWeight: '600',
   },
   referralInfo: {
     fontSize: 12,
     color: '#6B7280',
     fontStyle: 'italic',
     marginTop: 8,
     lineHeight: 16,
     backgroundColor: '#F9FAFB',
     padding: 8,
     borderRadius: 6,
     borderLeftWidth: 3,
     borderLeftColor: '#10B981',
   },

   // Sosyal Medya Adımı Stilleri
   socialMediaTitle: {
     fontSize: 24,
     fontWeight: 'bold',
     color: '#1F2937',
     textAlign: 'center',
     marginBottom: 8,
   },
   socialMediaSubtitle: {
     fontSize: 16,
     color: '#6B7280',
     textAlign: 'center',
     marginBottom: 30,
     lineHeight: 22,
   },
   socialMediaInputContainer: {
     flexDirection: 'row',
     alignItems: 'center',
     backgroundColor: '#F9FAFB',
     borderRadius: 12,
     paddingHorizontal: 16,
     paddingVertical: 4,
     borderWidth: 1,
     borderColor: '#E5E7EB',
   },
   socialMediaIconContainer: {
     width: 24,
     height: 24,
     marginRight: 12,
     alignItems: 'center',
     justifyContent: 'center',
   },
   socialMediaIcon: {
     width: 20,
     height: 20,
     tintColor: 'rgba(255,255,255,0.8)',
   },
   socialMediaEmoji: {
     fontSize: 18,
     color: '#6B7280',
   },
   socialMediaInput: {
     flex: 1,
     fontSize: 16,
     color: '#1F2937',
     paddingVertical: 12,
     textAlign: 'left',
   },

   // MYB5 Belgesi Stilleri
   documentLabel: {
     fontSize: 16,
     fontWeight: '600',
     color: '#1F2937',
     marginBottom: 8,
   },
   documentPickerButton: {
     backgroundColor: '#F9FAFB',
     borderRadius: 12,
     borderWidth: 1,
     borderColor: '#E5E7EB',
     padding: 16,
     alignItems: 'center',
   },
   documentSelected: {
     alignItems: 'center',
   },
   documentSelectedText: {
     fontSize: 16,
     fontWeight: '600',
     color: '#10B981',
     marginBottom: 4,
   },
   documentFileName: {
     fontSize: 14,
     color: '#6B7280',
   },
   documentPlaceholder: {
     alignItems: 'center',
   },
   documentPlaceholderText: {
     fontSize: 16,
     fontWeight: '600',
     color: '#6B7280',
     marginBottom: 4,
   },
  documentPlaceholderSubtext: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  // AccountExistsModal styles
  modalIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FEF2F2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalIcon: {
    fontSize: 40,
  },
  userInfoContainer: {
    backgroundColor: '#F9FAFB',
    padding: 16,
    borderRadius: 12,
    marginVertical: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  userInfoText: {
    fontSize: 16,
    color: '#374151',
    marginBottom: 8,
    lineHeight: 24,
  },
  userInfoLabel: {
    fontWeight: '600',
    color: '#DC143C',
  },
  
  // Success Modal Styles
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

export default memo(Register);
