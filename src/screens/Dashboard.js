import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Animated,
  Image,
  Platform,
  Modal,
  TextInput,
  Dimensions,
  ImageBackground,
  Pressable,
  Easing,
} from 'react-native';
import ImagePicker from 'react-native-image-crop-picker';
import { useNavigation, useFocusEffect, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { useBackdrop } from '../context/BackdropContext';
import { createNeumorphismStyle, getGradientColors } from '../theme/styleHelpers';
import { useAuth } from '../context/AuthContext';
import { Share, Linking, Clipboard } from 'react-native';
import { shareProfileWebLink } from '../utils/webLinking';
import { collection, query, where, getDocs, orderBy, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import AdvancedFiltersModal from '../components/AdvancedFiltersModal';
import ListingCard from '../components/ListingCard';
import GlassmorphismView from '../components/GlassmorphismView';
import * as Animatable from 'react-native-animatable';
// import { samsunDistricts } from '../data/samsunDistricts';

const { width, height } = Dimensions.get('window');

const customEnterAnimation = {
  from: {
    opacity: 0,
    translateY: 8,
  },
  to: {
    opacity: 1,
    translateY: 0,
  },
};

const customExitAnimation = {
  from: {
    opacity: 1,
    translateY: 0,
  },
  to: {
    opacity: 1,
    translateY: 0,
  },
};

const Profile = () => {
  const { theme, isDark } = useTheme();
  const { showBackdrop, hideBackdrop } = useBackdrop();
  const navigation = useNavigation();
  const route = useRoute();
  const { userId: routeUserId } = route.params || {};
  const insets = useSafeAreaInsets();
  const { user, userProfile, loading, updateProfile } = useAuth();
  
  const viewRef = useRef(null);
  const [hasAnimatedOnce, setHasAnimatedOnce] = useState(false);

  useFocusEffect(
    useCallback(() => {
      return () => {};
    }, [])
  );

  useEffect(() => {}, [currentUser]);

  // Tema tabanlı stiller oluştur
  const styles = createStyles(theme, insets, isDark);
  const [fadeAnim] = useState(new Animated.Value(0));
  const [scaleAnim] = useState(new Animated.Value(0.8));
  const [shareModalScaleAnim] = useState(new Animated.Value(0.85));
  const [shareModalOpacityAnim] = useState(new Animated.Value(0));
  const [shareModalTranslateYAnim] = useState(new Animated.Value(12));
  // Username modal animation (same as share modal)
  const [usernameModalScaleAnim] = useState(new Animated.Value(0.85));
  const [usernameModalOpacityAnim] = useState(new Animated.Value(0));
  const [usernameModalTranslateYAnim] = useState(new Animated.Value(12));

  // Tasks modal style - gradient config (align with DailyTasks modalCardConfig)
  const shareActionModalConfig = useMemo(() => ({
    overlayColor: 'rgba(255, 0, 0, 0)',
    startColor: 'rgb(24, 54, 73)',
    endColor: 'rgba(17, 36, 49, 0.79)',
    gradientAlpha: 1,
    gradientDirection: 150,
    gradientSpread: 7,
    ditherStrength: 4.0,
  }), []);

  // Gerçek kullanıcı verileri - Artık hem kendi hem de başkasının verisini tutacak
  const [currentUser, setCurrentUser] = useState(null);
  const [isOwnProfile, setIsOwnProfile] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [pendingImage, setPendingImage] = useState(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [tempUserData, setTempUserData] = useState({});
  const [showCityModal, setShowCityModal] = useState(false);
  const [showNameModal, setShowNameModal] = useState(false);
  const [showBioModal, setShowBioModal] = useState(false);
  const [showOfficeModal, setShowOfficeModal] = useState(false);
  const [showSocialModal, setShowSocialModal] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [showExpertModal, setShowExpertModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showUsernameModal, setShowUsernameModal] = useState(false);
  const [reopenShareAfterUsername, setReopenShareAfterUsername] = useState(false);

  const handleCloseUsernameModal = useCallback(() => {
    try {
      Animated.parallel([
        Animated.timing(usernameModalOpacityAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(usernameModalScaleAnim, {
          toValue: 0.92,
          duration: 150,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(usernameModalTranslateYAnim, {
          toValue: 8,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setShowUsernameModal(false);
        if (reopenShareAfterUsername) {
          setShowShareModal(true);
          setReopenShareAfterUsername(false);
        }
      });
    } catch {
      setShowUsernameModal(false);
      if (reopenShareAfterUsername) {
        setShowShareModal(true);
        setReopenShareAfterUsername(false);
      }
    }
  }, [reopenShareAfterUsername, usernameModalOpacityAnim, usernameModalScaleAnim, usernameModalTranslateYAnim]);
  const [customUsername, setCustomUsername] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showCopyToast, setShowCopyToast] = useState(false);
  const [copyToastMessage, setCopyToastMessage] = useState('');
  const copyToastAnim = useRef(new Animated.Value(0)).current;
  const [updatedFields, setUpdatedFields] = useState([]);

  // Türkiye şehirleri listesi
  const turkishCities = [
    'Adana', 'Adıyaman', 'Afyonkarahisar', 'Ağrı', 'Amasya', 'Ankara', 'Antalya', 'Artvin',
    'Aydın', 'Balıkesir', 'Bilecik', 'Bingöl', 'Bitlis', 'Bolu', 'Burdur', 'Bursa',
    'Çanakkale', 'Çankırı', 'Çorum', 'Denizli', 'Diyarbakır', 'Edirne', 'Elazığ', 'Erzincan',
    'Erzurum', 'Eskişehir', 'Gaziantep', 'Giresun', 'Gümüşhane', 'Hakkari', 'Hatay', 'Isparta',
    'Mersin', 'İstanbul', 'İzmir', 'Kars', 'Kastamonu', 'Kayseri', 'Kırklareli', 'Kırşehir',
    'Kocaeli', 'Konya', 'Kütahya', 'Malatya', 'Manisa', 'Kahramanmaraş', 'Mardin', 'Muğla',
    'Muş', 'Nevşehir', 'Niğde', 'Ordu', 'Rize', 'Sakarya', 'Samsun', 'Siirt', 'Sinop',
    'Sivas', 'Tekirdağ', 'Tokat', 'Trabzon', 'Tunceli', 'Şanlıurfa', 'Uşak', 'Van',
    'Yozgat', 'Zonguldak', 'Aksaray', 'Bayburt', 'Karaman', 'Kırıkkale', 'Batman', 'Şırnak',
    'Bartın', 'Ardahan', 'Iğdır', 'Yalova', 'Karabük', 'Kilis', 'Osmaniye', 'Düzce'
  ];

  // Uzmanlık alanları listesi
  const expertTitles = [
    'Lüks Konut Uzmanı',
    'Ticari Konut Uzmanı',
    'Arsa/Tarla Uzmanlığı',
    'Gayrimenkul Danışmanı',
    'Broker/Founder',
    'Gayrimenkul Asistanı',
    'Ticari Gayrimenkul Uzmanlığı'
  ];
  const [blinkAnim] = useState(new Animated.Value(1));
  const [pulseAnim] = useState(new Animated.Value(1));

  // Paylaşım modalı açıldığında canlı pop animasyonu
  useEffect(() => {
    if (showShareModal) {
      shareModalScaleAnim.setValue(0.78);
      shareModalOpacityAnim.setValue(0);
      shareModalTranslateYAnim.setValue(18);

      Animated.parallel([
        Animated.timing(shareModalOpacityAnim, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(shareModalTranslateYAnim, {
          toValue: 0,
          duration: 240,
          useNativeDriver: true,
        }),
        Animated.spring(shareModalScaleAnim, {
          toValue: 1,
          tension: 70,
          friction: 7,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [showShareModal, shareModalScaleAnim, shareModalOpacityAnim, shareModalTranslateYAnim]);

  // Username modal açılış animasyonu (share ile aynı)
  useEffect(() => {
    if (showUsernameModal) {
      usernameModalScaleAnim.setValue(0.78);
      usernameModalOpacityAnim.setValue(0);
      usernameModalTranslateYAnim.setValue(18);

      Animated.parallel([
        Animated.timing(usernameModalOpacityAnim, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(usernameModalTranslateYAnim, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.spring(usernameModalScaleAnim, {
          toValue: 1,
          friction: 7,
          tension: 80,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [showUsernameModal, usernameModalScaleAnim, usernameModalOpacityAnim, usernameModalTranslateYAnim]);

  // 🎯 Profil sayfası için bağımsız portföy state'leri
  const [userPortfolios, setUserPortfolios] = useState([]);
  const [filteredPortfolios, setFilteredPortfolios] = useState([]);
  const [portfoliosLoading, setPortfoliosLoading] = useState(true);
  const [myPortfolioCount, setMyPortfolioCount] = useState(0);
  
  // 🎯 Profil sayfası için BAĞIMSIZ filtre state'leri (PortfolioList'ten izole)
  const [profileFilters, setProfileFilters] = useState({
    priceRange: [0, 20000000],
    squareMetersRange: [0, 1000],
    roomCount: '',
    buildingAge: '',
    floor: '',
    propertyType: '',
    listingType: '', // AdvancedFiltersModal'da listingType kullanılıyor
    heatingType: '',
    furnished: '',
    parking: '',
    elevator: '',
    balcony: '',
    garden: '',
    swimmingPool: '',
    security: '',
    occupancyStatus: '',
  });
  const [showProfileFilters, setShowProfileFilters] = useState(false);

  const handlePhoneCall = useCallback(() => {
    if (currentUser?.phoneNumber) {
      const phoneNumberUrl = `tel:${currentUser.phoneNumber}`;
      Linking.canOpenURL(phoneNumberUrl)
        .then((supported) => {
          if (supported) {
            return Linking.openURL(phoneNumberUrl);
          }
          Alert.alert('Hata', 'Telefon araması başlatılamıyor.');
        })
        .catch((err) => Alert.alert('Hata', 'Bir hata oluştu.'));
    } else {
      Alert.alert('Bilgi', 'Bu kullanıcı için telefon numarası mevcut değil.');
    }
  }, [currentUser]);

  const handleWhatsApp = useCallback(() => {
    if (currentUser?.phoneNumber) {
      let whatsappNumber = currentUser.phoneNumber.replace(/[^0-9]/g, '');
      // Türkiye'deki numaralar için +90 varsayımı (numara 90 ile başlamıyorsa)
      if (whatsappNumber.length === 10 && whatsappNumber.startsWith('5')) {
          whatsappNumber = '90' + whatsappNumber;
      }
      // Daha güvenilir olan evrensel wa.me linkini kullan
      const url = `https://wa.me/${whatsappNumber}`;
      Linking.openURL(url).catch(() => {
        Alert.alert('Hata', 'WhatsApp açılamadı. Lütfen uygulamayı ve internet bağlantınızı kontrol edin.');
      });
    } else {
      Alert.alert('Bilgi', 'Bu kullanıcı için telefon numarası mevcut değil.');
    }
  }, [currentUser]);

  // Her profil sayfasına girişte verileri yenile
  useFocusEffect(
    useCallback(() => {
      const loadProfileData = async () => {
        if (loading) return;

        // Görüntülenecek hedef kullanıcının ID'si (ya route'dan ya da mevcut kullanıcıdan)
        const targetUserId = routeUserId || user?.uid;

        // Eğer hedef ID yoksa (misafir ve dışarıdan ID gelmemişse) misafir göster
        if (!targetUserId) {
          setIsOwnProfile(false);
          setCurrentUser({
            id: 'guest',
            name: 'Misafir Kullanıcı',
            email: '',
            phoneNumber: '',
            officeName: '',
            city: '',
            profilePicture: null,
            bio: 'Uygulamayı keşfetmek için giriş yapın veya kayıt olun.',
            expertTitle: 'Gayrimenkul Danışmanı',
            username: 'guest',
            socialInstagram: '',
            socialFacebook: '',
            socialYoutube: '',
            createdAt: new Date().toISOString(),
            subscription: { plan: 'Free', status: 'active', endDate: null },
          });
          return;
        }

        // Kendi profilini mi görüntülüyor kontrolü
        const viewingOwnProfile = !routeUserId || (user?.uid === routeUserId);
        setIsOwnProfile(viewingOwnProfile);
        
        // Düzenleme modunu kapat
        if (!viewingOwnProfile && isEditMode) {
          setIsEditMode(false);
        }

        try {
          // Kendi profiliyse ve userProfile zaten yüklüyse context'ten al
          if (viewingOwnProfile && userProfile) {
            setCurrentUser({
              id: userProfile.uid,
              ...userProfile,
              // GÜVENLİK ÖNLEMİ: Eğer Firestore profilinde telefon yoksa, Auth verisinden al
              phoneNumber: userProfile.phoneNumber || user?.phoneNumber || '',
            });
          } else {
            // Başkasının profiliyse veya kendi profili context'te yoksa Firestore'dan çek
            const userRef = doc(db, 'users', targetUserId);
            const userSnap = await getDoc(userRef);

            if (userSnap.exists()) {
              const fetchedData = userSnap.data();
              setCurrentUser({
                id: userSnap.id,
                ...fetchedData,
              });
            } else {
              Alert.alert('Hata', 'Kullanıcı profili bulunamadı.');
              if (navigation.canGoBack()) navigation.goBack();
            }
          }
        } catch (error) {
          console.error("Profil verisi yüklenirken hata oluştu:", error);
          Alert.alert('Hata', 'Profil verileri yüklenirken bir hata oluştu.');
          if (navigation.canGoBack()) navigation.goBack();
        }
      };

      loadProfileData();
    }, [routeUserId, user, userProfile, loading, navigation, isEditMode])
  );


  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, scaleAnim]);

  // 🎯 Kullanıcının portföylerini Firestore'dan çek
  const fetchUserPortfolios = useCallback(async () => {
    if (!currentUser?.id) {
      setUserPortfolios([]);
      setFilteredPortfolios([]);
      setPortfoliosLoading(false);
      return;
    }

    try {
      setPortfoliosLoading(true);
      if (__DEV__) {
        
      }

      const portfoliosRef = collection(db, 'portfolios');
      const q = query(
        portfoliosRef,
        where('isPublished', '==', true), // Sadece yayında olanlar (önce bu)
        where('userId', '==', currentUser.id), // Sonra userId
        orderBy('createdAt', 'desc')
      );

      const querySnapshot = await getDocs(q);
      const portfolios = [];
      
      querySnapshot.forEach((doc) => {
        portfolios.push({
          id: doc.id,
          ...doc.data(),
        });
      });

      if (__DEV__) {
        
      }
      setUserPortfolios(portfolios);
      setFilteredPortfolios(portfolios);
    } catch (error) {
      if (__DEV__) {
        
      }
      Alert.alert('Hata', 'Portföyler yüklenirken bir hata oluştu.');
      setUserPortfolios([]);
      setFilteredPortfolios([]);
    } finally {
      setPortfoliosLoading(false);
    }
  }, [currentUser?.id]);

  // Sayfa açıldığında portföyleri yükle
  useFocusEffect(
    useCallback(() => {
      fetchUserPortfolios();
    }, [fetchUserPortfolios])
  );

  // Kullanıcının kendi eklediği portföy sayısını yükle (MyPortfolios ile aynı sayı)
  useEffect(() => {
    const loadMyPortfolioCount = async () => {
      try {
        if (!currentUser?.id) { setMyPortfolioCount(0); return; }
        const q = query(
          collection(db, 'portfolios'),
          where('userId', '==', currentUser.id)
        );
        const snap = await getDocs(q);
        setMyPortfolioCount(snap.size || 0);
      } catch (e) {
        setMyPortfolioCount(0);
      }
    };
    loadMyPortfolioCount();
  }, [currentUser?.id]);

  // 🎯 userPortfolios değiştiğinde filtreleri otomatik uygula
  useEffect(() => {
    if (userPortfolios.length > 0 && getActiveProfileFiltersCount() > 0) {
      // Eğer aktif filtre varsa, otomatik uygula
      const filtered = userPortfolios.filter((portfolio) => {
        // Fiyat aralığı
        if (profileFilters.priceRange) {
          const [min, max] = profileFilters.priceRange;
          if (portfolio.price < min || portfolio.price > max) return false;
        }

        // Metrekare aralığı
        if (profileFilters.squareMetersRange) {
          const [min, max] = profileFilters.squareMetersRange;
          if (portfolio.squareMeters < min || portfolio.squareMeters > max) return false;
        }

        // Oda sayısı
        if (profileFilters.roomCount && profileFilters.roomCount !== '') {
          if (portfolio.roomCount !== profileFilters.roomCount) return false;
        }

        // Emlak tipi
        if (profileFilters.propertyType && profileFilters.propertyType !== '') {
          if (portfolio.propertyType !== profileFilters.propertyType) return false;
        }

        // İlan durumu (Satılık/Kiralık)
        if (profileFilters.listingType && profileFilters.listingType !== '') {
          if (portfolio.listingStatus !== profileFilters.listingType) return false;
        }

        // Bina yaşı
        if (profileFilters.buildingAge && profileFilters.buildingAge !== '') {
          const age = parseInt(profileFilters.buildingAge, 10);
          if (portfolio.buildingAge > age) return false;
        }

        // Diğer filtreler (boolean)
        if (profileFilters.parking === 'Var' && !portfolio.parking) return false;
        if (profileFilters.parking === 'Yok' && portfolio.parking) return false;
        
        if (profileFilters.elevator === 'Var' && !portfolio.elevator) return false;
        if (profileFilters.elevator === 'Yok' && portfolio.elevator) return false;
        
        if (profileFilters.balcony === 'Var' && !portfolio.balcony) return false;
        if (profileFilters.balcony === 'Yok' && portfolio.balcony) return false;
        
        if (profileFilters.garden === 'Var' && !portfolio.garden) return false;
        if (profileFilters.garden === 'Yok' && portfolio.garden) return false;
        
        if (profileFilters.swimmingPool === 'Var' && !portfolio.swimmingPool) return false;
        if (profileFilters.swimmingPool === 'Yok' && portfolio.swimmingPool) return false;

        return true;
      });
      setFilteredPortfolios(filtered);
    } else {
      // Filtre yoksa hepsini göster
      setFilteredPortfolios(userPortfolios);
    }
  }, [userPortfolios, profileFilters, getActiveProfileFiltersCount]);

  // 🎯 Profil sayfası filtreleme fonksiyonları (PortfolioList'ten BAĞIMSIZ)
  const applyProfileFilters = useCallback((newFilters) => {
    if (__DEV__) {
      
    }
    setProfileFilters(newFilters);
    setShowProfileFilters(false);

    // Filtreleri uygula
    const filtered = userPortfolios.filter((portfolio) => {
      // Fiyat aralığı
      if (newFilters.priceRange) {
        const [min, max] = newFilters.priceRange;
        if (portfolio.price < min || portfolio.price > max) return false;
      }

      // Metrekare aralığı
      if (newFilters.squareMetersRange) {
        const [min, max] = newFilters.squareMetersRange;
        if (portfolio.squareMeters < min || portfolio.squareMeters > max) return false;
      }

      // Oda sayısı
      if (newFilters.roomCount && newFilters.roomCount !== '') {
        if (portfolio.roomCount !== newFilters.roomCount) return false;
      }

      // Emlak tipi
      if (newFilters.propertyType && newFilters.propertyType !== '') {
        if (portfolio.propertyType !== newFilters.propertyType) return false;
      }

      // İlan durumu (Satılık/Kiralık)
      if (newFilters.listingType && newFilters.listingType !== '') {
        if (portfolio.listingStatus !== newFilters.listingType) return false;
      }

      // Bina yaşı
      if (newFilters.buildingAge && newFilters.buildingAge !== '') {
        const age = parseInt(newFilters.buildingAge, 10);
        if (portfolio.buildingAge > age) return false;
      }

      // Diğer filtreler (boolean)
      if (newFilters.parking === 'Var' && !portfolio.parking) return false;
      if (newFilters.parking === 'Yok' && portfolio.parking) return false;
      
      if (newFilters.elevator === 'Var' && !portfolio.elevator) return false;
      if (newFilters.elevator === 'Yok' && portfolio.elevator) return false;
      
      if (newFilters.balcony === 'Var' && !portfolio.balcony) return false;
      if (newFilters.balcony === 'Yok' && portfolio.balcony) return false;
      
      if (newFilters.garden === 'Var' && !portfolio.garden) return false;
      if (newFilters.garden === 'Yok' && portfolio.garden) return false;
      
      if (newFilters.swimmingPool === 'Var' && !portfolio.swimmingPool) return false;
      if (newFilters.swimmingPool === 'Yok' && portfolio.swimmingPool) return false;

      return true;
    });

    if (__DEV__) {
      
    }
    setFilteredPortfolios(filtered);
  }, [userPortfolios]);

  const clearProfileFilters = useCallback(() => {
    if (__DEV__) {
      
    }
    const defaultFilters = {
      priceRange: [0, 20000000],
      squareMetersRange: [0, 1000],
      roomCount: '',
      buildingAge: '',
      floor: '',
      propertyType: '',
      listingType: '', // AdvancedFiltersModal'da listingType kullanılıyor
      heatingType: '',
      furnished: '',
      parking: '',
      elevator: '',
      balcony: '',
      garden: '',
      swimmingPool: '',
      security: '',
      occupancyStatus: '',
    };
    setProfileFilters(defaultFilters);
    setFilteredPortfolios(userPortfolios);
    setShowProfileFilters(false);
  }, [userPortfolios]);

  // Aktif filtre sayısını hesapla
  const getActiveProfileFiltersCount = useCallback(() => {
    let count = 0;
    
    // Fiyat range kontrolü
    if (profileFilters.priceRange && (profileFilters.priceRange[0] > 0 || profileFilters.priceRange[1] < 20000000)) {
      count++;
    }
    
    // Metrekare range kontrolü
    if (profileFilters.squareMetersRange && (profileFilters.squareMetersRange[0] > 0 || profileFilters.squareMetersRange[1] < 1000)) {
      count++;
    }
    
    // Diğer filtreler
    const filterKeys = [
      'roomCount', 'buildingAge', 'floor', 'propertyType', 'listingType',
      'heatingType', 'furnished', 'parking', 'elevator', 'balcony', 'garden',
      'swimmingPool', 'security', 'occupancyStatus'
    ];
    
    filterKeys.forEach(key => {
      if (profileFilters[key] && profileFilters[key] !== '') {
        count++;
      }
    });
    
    return count;
  }, [profileFilters]);




  const formatDate = useCallback((date) => {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return dateObj.toLocaleDateString('tr-TR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }, []);

  const getAvatarUrl = useCallback((name) => {
    const bg = (theme.colors && (theme.colors.primary || theme.colors.accent));
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=${bg.replace('#', '')}&color=fff&size=200`;
  }, [theme]);

  // Düzenleme modu animasyonu
  useEffect(() => {
    if (isEditMode) {
      const animation = startBlinking();
      return () => {
        animation.stop();
        stopBlinking();
      };
    } else {
      stopBlinking();
    }
  }, [isEditMode, startBlinking, stopBlinking]);

  // Profil resmi seçme fonksiyonu
  const handleImagePicker = useCallback(() => {
    // Second modal already open; this function is not used to open any extra modal anymore
  }, []);

  // Düzenleme modu fonksiyonları
  const toggleEditMode = useCallback(() => {
    if (isEditMode) {
      // Düzenleme modundan çıkarken değişiklikleri sıfırla
      setTempUserData({});
    } else {
      // Düzenleme moduna girerken mevcut verileri kopyala
      setTempUserData({ ...currentUser });
    }
    setIsEditMode(!isEditMode);
  }, [isEditMode, currentUser]);

  const startEditing = useCallback((field) => {
    switch (field) {
      case 'city':
        setShowCityModal(true);
        break;
      case 'name':
        setShowNameModal(true);
        break;
      case 'bio':
        setShowBioModal(true);
        break;
      case 'expertTitle':
        setShowExpertModal(true);
        break;
      case 'socialMedia':
        setShowSocialModal(true);
        break;
      case 'officeName':
        setShowOfficeModal(true);
        break;
      default:
        break;
    }
  }, []);

  const saveChanges = useCallback(async (overrides = {}) => {
    try {
      const merged = { ...tempUserData, ...overrides };

      // Sadece değişen alanları topla
      const updates = {};
      const updatedFields = [];

      const compareAndSet = (key, label) => {
        const nextVal = merged[key];
        const currVal = currentUser[key];
        if (typeof nextVal !== 'undefined' && nextVal !== currVal) {
          updates[key] = nextVal;
          updatedFields.push(label);
        }
      };

      compareAndSet('name', 'İsim Soyisim');
      compareAndSet('bio', 'Hakkında');
      compareAndSet('officeName', 'Ofis İsmi');
      compareAndSet('city', 'Şehir');
      compareAndSet('expertTitle', 'Uzmanlık Alanı');
      compareAndSet('socialInstagram', 'Instagram');
      compareAndSet('socialFacebook', 'Facebook');
      compareAndSet('socialYoutube', 'YouTube');
      compareAndSet('profilePicture', 'Profil Resmi');

      // Eğer hiç değişiklik yoksa uyarı ver
      if (updatedFields.length === 0) {
        Alert.alert('Uyarı', 'Herhangi bir değişiklik yapılmadı');
        return;
      }

      // Profil resmi geçici dosya yolundan seçildiyse önce Bunny'ye yükle
      if (updates.profilePicture && pendingImage && updates.profilePicture === pendingImage.path) {
        try {
          setUploading(true);

          // Türkçe: Bunny bayrağı açık olduğu için önce Bunny'ye yüklemeyi dene
          try {
            const { USE_BUNNY, uploadImageToBunny } = require('../utils/media');
            if (USE_BUNNY) {
              const fileName = `profile-${currentUser.id}-${Date.now()}.jpg`;
              const result = await uploadImageToBunny({ fileUri: pendingImage.path, fileName, mime: pendingImage.mime || 'image/jpeg', path: 'images/profiles' });
              if (result?.cdnUrl) {
                updates.profilePicture = result.cdnUrl;
                setUploading(false);
                await updateUserProfile(updates);
                setCurrentUser(prev => ({ ...prev, ...updates }));
                setIsEditMode(false);
                setTempUserData({});
                setPendingImage(null);
                showSuccessMessage(['Profil resmi']);
                return;
              }
            }
          } catch (bunnyErr) {
            // Bunny başarısız ise Cloudinary ile devam
            console.warn('Bunny yükleme başarısız, Cloudinary fallback:', bunnyErr?.message);
          }

          const formData = new FormData();
          formData.append('file', {
            uri: pendingImage.path,
            type: pendingImage.mime || 'image/jpeg',
            name: `profile-${currentUser.id}-${Date.now()}.jpg`,
          });
          formData.append('upload_preset', 'unsigned_profile');
          formData.append('folder', 'profile-images');
          formData.append('public_id', `profile-${currentUser.id}-${Date.now()}`);

          const response = await fetch('https://api.cloudinary.com/v1_1/dqoc8dky9/image/upload', {
            method: 'POST',
            body: formData,
            headers: { 'Content-Type': 'multipart/form-data' },
          });
          if (!response.ok) {
            throw new Error('Cloudinary yükleme hatası');
          }
          const result = await response.json();
          const imageUrl = result.secure_url;
          updates.profilePicture = imageUrl;
        } catch (e) {
          if (String(e?.message) === '__BUNNY_DONE__') {
            // Bunny başarılı, hata değil
          } else {
            Alert.alert('Hata', 'Profil resmi yüklenirken bir hata oluştu.');
            setUploading(false);
            return;
          }
        } finally {
          setUploading(false);
        }
      }

      await updateUserProfile(updates);
      setCurrentUser(prev => ({ ...prev, ...updates }));
      setIsEditMode(false);
      setTempUserData({});
      setPendingImage(null);

      // Başarı modal'ını göster
      showSuccessMessage(updatedFields);
    } catch (error) {
      console.error('Save error:', error);
      Alert.alert('Hata', 'Bilgiler kaydedilirken bir hata oluştu');
    }
  }, [tempUserData, currentUser, updateUserProfile, showSuccessMessage]);

  const cancelEditing = useCallback(() => {
    setTempUserData({});
    setIsEditMode(false);
  }, []);

  // Yanıp sönme animasyonu
  const startBlinking = useCallback(() => {
    const blinkAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(blinkAnim, {
          toValue: 0.4,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(blinkAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
      ])
    );
    
    blinkAnimation.start();
    return blinkAnimation;
  }, [blinkAnim]);

  // Profil paylaşma fonksiyonu
  const handleShareProfile = useCallback(() => {
    try {
      const color = isDark ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.22)';
      showBackdrop({ toOpacity: 1, color, duration: 180 });
    } catch {}
    setShowShareModal(true);
  }, [isDark, showBackdrop]);

  const handleCloseShareModal = useCallback(() => {
    try {
      Animated.parallel([
        Animated.timing(shareModalOpacityAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(shareModalScaleAnim, {
          toValue: 0.92,
          duration: 150,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(shareModalTranslateYAnim, {
          toValue: 8,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setShowShareModal(false);
        try { hideBackdrop({ duration: 120 }); } catch {}
      });
    } catch {
      setShowShareModal(false);
      try { hideBackdrop({ duration: 120 }); } catch {}
    }
  }, [hideBackdrop, shareModalOpacityAnim, shareModalScaleAnim, shareModalTranslateYAnim]);

  // WhatsApp ile profil linki paylaşma (başka profillerde de kullanılacak)
  const shareProfileViaWhatsApp = useCallback(() => {
    try {
      const profileLink = generateProfileLink();
      const shareMessage = `Merhaba! ${currentUser.name} adlı emlak danışmanının profilini inceleyin: ${profileLink}`;
      const url = `https://wa.me/?text=${encodeURIComponent(shareMessage)}`;
      Linking.openURL(url).catch(() => {
        Alert.alert('Hata', 'WhatsApp açılamadı. Lütfen uygulamayı ve internet bağlantınızı kontrol edin.');
      });
    } catch (error) {
      Alert.alert('Hata', 'Paylaşım sırasında bir hata oluştu.');
    } finally {
      handleCloseShareModal();
    }
  }, [currentUser, generateProfileLink, handleCloseShareModal]);

  // Username kontrolü
  const checkUsernameAvailability = useCallback(async (username) => {
    try {
      const { collection, query, where, getDocs, limit } = await import('firebase/firestore');
      const { db } = await import('../firebase');
      
      const usersQuery = query(
        collection(db, 'users'),
        where('username', '==', username),
        limit(1) // Firestore rules için gerekli
      );
      const usersSnap = await getDocs(usersQuery);
      
      return usersSnap.empty; // Boşsa kullanılabilir
    } catch (error) {
      console.error('Username kontrol hatası:', error);
      return false;
    }
  }, []);

  // Username kaydetme
  const successTimeoutRef = useRef(null);
  const copyToastTimeoutRef = useRef(null);

  useEffect(() => {
    return () => {
      try { if (successTimeoutRef.current) { clearTimeout(successTimeoutRef.current); successTimeoutRef.current = null; } } catch {}
      try { if (copyToastTimeoutRef.current) { clearTimeout(copyToastTimeoutRef.current); copyToastTimeoutRef.current = null; } } catch {}
    };
  }, []);

  const showSuccessMessage = useCallback((fields) => {
    setUpdatedFields(fields);
    setShowSuccessModal(true);
    
    // 3 saniye sonra modal'ı otomatik kapat
    if (successTimeoutRef.current) { try { clearTimeout(successTimeoutRef.current); } catch {} }
    successTimeoutRef.current = setTimeout(() => {
      setShowSuccessModal(false);
      setUpdatedFields([]);
      successTimeoutRef.current = null;
    }, 3000);
  }, []);

  const saveUsername = useCallback(async () => {
    if (!customUsername.trim()) {
      setUsernameError('Kullanıcı adı boş olamaz');
      return;
    }

    const username = customUsername.trim().toLowerCase();
    
    // Username format kontrolü
    if (!/^[a-z0-9._-]+$/.test(username)) {
      setUsernameError('Kullanıcı adı sadece küçük harf, rakam, nokta, tire ve alt çizgi içerebilir');
      return;
    }

    if (username.length < 3) {
      setUsernameError('Kullanıcı adı en az 3 karakter olmalı');
      return;
    }

    try {
      const isAvailable = await checkUsernameAvailability(username);
      
      if (!isAvailable) {
        setUsernameError('Bu kullanıcı adı zaten kullanılıyor');
        return;
      }

      // Username'i kaydet
      await updateProfile({ username });
      setCurrentUser(prev => ({ ...prev, username })); // currentUser'ı güncelle
      setUsernameError('');
      handleCloseUsernameModal();
      setCustomUsername('');
      
      showSuccessMessage(['Kullanıcı adınız']);
    } catch (error) {
      console.error('Username kaydetme hatası:', error);
      Alert.alert('Hata', 'Kullanıcı adı kaydedilirken bir hata oluştu');
    }
  }, [customUsername, checkUsernameAvailability, updateProfile, showSuccessMessage]);

  // Profil linki oluşturma
  const generateProfileLink = useCallback(() => {
    const username = currentUser.username || currentUser.name?.toLowerCase().replace(/\s+/g, '.') || 'user';
    return `https://talepify.com/${username}`;
  }, [currentUser]);

  // Link paylaşma
  const shareProfileLink = useCallback(async () => {
    try {
      const profileLink = generateProfileLink();
      const shareMessage = `Merhaba! ${currentUser.name} adlı emlak danışmanının profilini inceleyin: ${profileLink}`;
      
      await Share.share({
        message: shareMessage,
        url: profileLink,
        title: `${currentUser.name} - Emlak Danışmanı Profili`,
      });
      
      handleCloseShareModal();
    } catch (error) {
      console.error('Paylaşım hatası:', error);
      Alert.alert('Hata', 'Paylaşım sırasında bir hata oluştu.');
    }
  }, [currentUser, generateProfileLink, handleCloseShareModal]);

  // Link kopyalama
  const copyProfileLink = useCallback(async () => {
    try {
      const profileLink = generateProfileLink();
      await Clipboard.setString(profileLink);
      // Hızlı başarı tostu (butonsuz modal)
      try { copyToastAnim.setValue(0); } catch {}
      setCopyToastMessage('Profil linki panoya kopyalandı!');
      setShowCopyToast(true);
      Animated.spring(copyToastAnim, {
        toValue: 1,
        friction: 7,
        tension: 80,
        useNativeDriver: true,
      }).start();
      if (copyToastTimeoutRef.current) { try { clearTimeout(copyToastTimeoutRef.current); } catch {} }
      copyToastTimeoutRef.current = setTimeout(() => {
        Animated.timing(copyToastAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }).start(() => {
          setShowCopyToast(false);
          copyToastTimeoutRef.current = null;
        });
      }, 1200);
      // Paylaşım modalını kapat
      handleCloseShareModal();
    } catch (error) {
      console.error('Kopyalama hatası:', error);
      Alert.alert('Hata', 'Link kopyalanırken bir hata oluştu.');
    }
  }, [generateProfileLink, handleCloseShareModal]);

  // Görsel filtre çipleri (Bu gün / Dün / Son 7 / Son 15) - sadece UI (Home.js görünümü ile eş)
  const filterOptions = useMemo(() => ([
    { key: 'today', label: 'Bu gün' },
    { key: 'yesterday', label: 'Son 3 gün' },
    { key: '7', label: 'Son 7 gün' },
    { key: '15', label: 'Son 15 gün' },
  ]), []);
  const [dashSelectedPeriod, setDashSelectedPeriod] = useState('today');
  const [dashFilterItemLayouts, setDashFilterItemLayouts] = useState({}); // { key: { x, width, textX, textW } }
  const [dashIndicatorLeft, setDashIndicatorLeft] = useState(0);
  const [dashIndicatorWidth, setDashIndicatorWidth] = useState(0);
  const dashIndicatorTranslateX = useRef(new Animated.Value(0)).current;
  const dashPreviousIndicatorLeftRef = useRef(null);

  // Aktif filtre alt çizgisini konumlandır (sadece görsel)
  useEffect(() => {
    const layout = dashFilterItemLayouts[dashSelectedPeriod];
    if (!layout) return;
    const textW = layout.textW || layout.width || 0;
    const leftX = (layout.x || 0) + (layout.textX || 0);
    setDashIndicatorLeft(leftX);
    setDashIndicatorWidth(textW);
  }, [dashSelectedPeriod, dashFilterItemLayouts]);

  // Çubuğu yatayda animasyonla taşı (sadece görsel)
  useEffect(() => {
    if (dashIndicatorWidth === 0) return;
    if (dashPreviousIndicatorLeftRef.current === null) {
      dashIndicatorTranslateX.setValue(dashIndicatorLeft);
    } else {
      Animated.timing(dashIndicatorTranslateX, {
        toValue: dashIndicatorLeft,
        duration: 220,
        useNativeDriver: true,
      }).start();
    }
    dashPreviousIndicatorLeftRef.current = dashIndicatorLeft;
  }, [dashIndicatorLeft, dashIndicatorWidth, dashIndicatorTranslateX]);

  const stopBlinking = useCallback(() => {
    blinkAnim.stopAnimation();
    blinkAnim.setValue(1);
  }, [blinkAnim]);

  const openImageLibrary = useCallback(() => {
    ImagePicker.openPicker({
      width: 300,
      height: 300,
      cropping: true,
      cropperCircleOverlay: true,
      compressImageQuality: 0.8,
      includeBase64: false,
    }).then(image => {
      handleImageResponse(image);
    }).catch(error => {
      if (error.code !== 'E_PICKER_CANCELLED') {
        // console.error('Galeri seçim hatası:', error);
        Alert.alert('Hata', 'Galeri seçiminde bir hata oluştu.');
      }
    });
  }, [handleImageResponse]);

  const openCamera = useCallback(() => {
    ImagePicker.openCamera({
      width: 300,
      height: 300,
      cropping: true,
      cropperCircleOverlay: true,
      compressImageQuality: 0.8,
      includeBase64: false,
    }).then(image => {
      handleImageResponse(image);
    }).catch(error => {
      if (error.code !== 'E_PICKER_CANCELLED') {
        // console.error('Kamera hatası:', error);
        Alert.alert('Hata', 'Kamera kullanımında bir hata oluştu.');
      }
    });
  }, [handleImageResponse]);

  const handleImageResponse = useCallback((image) => {
    // Sadece geçici seçimi kaydet, kalıcı upload Kaydet'te
    setPendingImage({ path: image.path, mime: image.mime || 'image/jpeg' });
    setTempUserData(prev => ({ ...prev, profilePicture: image.path }));
  }, []);

  const removeProfilePicture = useCallback(async () => {
    try {
      if (uploading) { return; }
      // Sadece geçici olarak default-logo'ya geçir, kalıcı kayıt Kaydet'te yapılacak
      setPendingImage(null);
      setTempUserData(prev => ({ ...prev, profilePicture: 'default-logo' }));
    } catch (e) {
      Alert.alert('Hata', 'Profil resmi kaldırılırken bir hata oluştu.');
    }
  }, [uploading]);

  const updateUserProfile = useCallback(async (updates) => {
    try {
      // console.log('Profile.js - updateUserProfile çağrıldı:', updates);
      const result = await updateProfile(updates);
      // console.log('Profile.js - updateProfile sonucu:', result);
      if (result.success) {
        // Profil güncellendi, currentUser'ı da güncelle
        setCurrentUser(prev => ({ ...prev, ...updates }));
        // console.log('Profile.js - currentUser güncellendi:', { ...currentUser, ...updates });
      }
    } catch (error) {
      // console.error('Profil güncelleme hatası:', error);
    }
  }, [updateProfile]);

  const renderProfileHeader = useCallback(() => {
    // --- BU KONTROL PANELİ İLE "HAKKINDA" BÖLÜMÜNÜ YÖNETEBİLİRSİNİZ ---
    const aboutConfig = {
      overlayColor: 'rgba(224, 220, 220, 0.81)',
      startColor: 'rgba(17, 36, 49, 1)',
      endColor: 'rgba(17, 36, 49, 0.64)',
      gradientAlpha: 1,
      gradientDirection: 150,
      gradientSpread: 7,
      ditherStrength: 4.0,
    };

    // --- BU KONTROL PANELİ İLE "İSTATİSTİK" BÖLÜMÜNÜ YÖNETEBİLİRSİNİZ ---
    const statsConfig = {
      overlayColor: 'rgba(224, 220, 220, 0.81)',
      startColor: 'rgba(17, 36, 49, 1)',
      endColor: 'rgba(17, 36, 49, 0.64)',
      gradientAlpha: 1,
      gradientDirection: 150,
      gradientSpread: 7,
      ditherStrength: 4.0,
    };

    // Hızlı aksiyon butonları için ayrı config'ler (renkleri buradan yönetebilirsiniz)
    const quickActionPortfolioConfig = {
      overlayColor: 'rgba(224, 220, 220, 0.81)',
      startColor: 'rgba(220, 20, 60, 1)',
      endColor: 'rgba(220, 20, 60, 0.45)',
      gradientAlpha: 1,
      gradientDirection: 150,
      gradientSpread: 7,
      ditherStrength: 4.0,
    };
    const quickActionRequestConfig = {
        overlayColor: 'rgba(224, 220, 220, 0.81)',
      startColor: 'rgba(220, 20, 60, 1)',
      endColor: 'rgba(220, 20, 60, 0.45)',
      gradientAlpha: 1,
      gradientDirection: 300,
      gradientSpread: 7,
      ditherStrength: 4.0,
    };

    // Dört butonluk aksiyon grubu için ayrı gradyan config
    const actionsGroupConfig = {
      overlayColor: 'rgba(224, 220, 220, 0.81)',
      startColor: 'rgba(17, 36, 49, 1)',
      endColor: 'rgba(17, 36, 49, 0)',
      gradientAlpha: 1,
      gradientDirection: 180,
      gradientSpread: 13,
      ditherStrength: 4.0,
    };

    // Hızlı aksiyon butonları için kesin genişlik hesapla (ilk frame'de çizim için)
    const quickActionButtonWidth = Math.floor((width - (theme.spacing.md * 2) - 25 - 8 - 8) / 2);
    const quickActionButtonHeight = 80;
    // --- BU KONTROL PANELİ İLE "PORTFÖYLERİM" BÖLÜMÜNÜ YÖNETEBİLİRSİNİZ ---
    const portfolioConfig = {
      overlayColor: 'rgba(224, 220, 220, 0.81)',
      startColor: 'rgba(17, 36, 49, 1)',
      endColor: 'rgba(17, 36, 49, 0.64)',
      gradientAlpha: 1,
      gradientDirection: 150,
      gradientSpread: 7,
      ditherStrength: 5.0,
    };

    return (
      <View
      >
        {/* Profil Resmi ve Bilgiler - Yan Yana */}
        <View style={styles.profileMainContainer}>
          <Animated.View 
            style={[
              styles.profileImageContainer,
              isEditMode && { 
                opacity: blinkAnim,
              }
            ]}
          >
            <Image
              source={
                (isEditMode ? (tempUserData.profilePicture || currentUser.profilePicture) : currentUser.profilePicture)
                && (isEditMode ? (tempUserData.profilePicture || currentUser.profilePicture) : currentUser.profilePicture) !== 'default-logo'
                  ? { uri: isEditMode ? (tempUserData.profilePicture || currentUser.profilePicture) : currentUser.profilePicture }
                  : require('../assets/images/logo-krimson.png')
              }
              style={[styles.profileImage, { borderColor: theme.colors.error }]}
              defaultSource={require('../assets/images/logo-krimson.png')}
            />
                  {isEditMode && (
                    <>
                      <TouchableOpacity
                        style={[styles.editImageButton, { backgroundColor: theme.colors.error }]}
                        onPress={() => setShowImageModal(true)}
                        disabled={uploading}
                      >
                        <Image source={require('../assets/images/icons/userphoto.png')} style={[styles.editImageIcon, { tintColor: theme.colors.white }]} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.deleteImageButton, { backgroundColor: theme.colors.error }]}
                        onPress={removeProfilePicture}
                        disabled={uploading}
                      >
                        <Image source={require('../assets/images/icons/trash.png')} style={[styles.editImageIcon, { tintColor: theme.colors.white }]} />
                      </TouchableOpacity>
                    </>
                  )}
          </Animated.View>



          <View style={styles.profileInfoContainer}>
            <View style={styles.nameContainer}>
              <Animated.View 
                style={[
                  isEditMode && { 
                    opacity: blinkAnim,
                    backgroundColor: theme.colors.error + '20',
                    borderRadius: 8,
                    padding: 8,
                  }
                ]}
              >
                <Text style={[styles.profileName, { color: isDark ? theme.colors.white : theme.colors.navy }]}>
                  {isEditMode ? (tempUserData.name || currentUser.name) : currentUser.name}
                </Text>
              </Animated.View>
              {isEditMode && (
                <TouchableOpacity 
                  style={[styles.editFieldButton, { right: -18, left: 'auto', top: 8 }]}
                  onPress={() => startEditing('name')}
                >
                  <Image source={require('../assets/images/icons/Edit_fill.png')} style={styles.editFieldIcon} />
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.badgesContainer}>
              {currentUser.officeName && (
                <View style={styles.officeBadgeContainer}>
                  <Animated.View 
                    style={[
                      styles.officeBadge, 
                      { backgroundColor: theme.colors.error },
                      isEditMode && { opacity: blinkAnim }
                    ]}
                  >
                    <Image source={require('../assets/images/icons/ofis.png')} style={styles.officeIcon} />
                    <Text style={[styles.officeBadgeText, { color: theme.colors.white }]}>
                      {isEditMode ? (tempUserData.officeName || currentUser.officeName) : currentUser.officeName}
                    </Text>
                  </Animated.View>
                  {isEditMode && (
                    <TouchableOpacity 
                      style={[styles.editFieldButton, { right: -6, left: 'auto', top: -6 }]}
                      onPress={() => startEditing('officeName')}
                    >
                      <Image source={require('../assets/images/icons/Edit_fill.png')} style={styles.editFieldIcon} />
                    </TouchableOpacity>
                  )}
                </View>
              )}
              {currentUser.city && (
                <View style={styles.cityBadgeContainer}>
                  <Animated.View 
                    style={[
                      styles.cityBadge, 
                      { backgroundColor: theme.colors.error },
                      isEditMode && { opacity: blinkAnim }
                    ]}
                  >
                    <Image source={require('../assets/images/icons/haritas.png')} style={styles.pinIcon} />
                    <Text style={[styles.cityBadgeText, { color: theme.colors.white }]}>
                      {isEditMode ? (tempUserData.city || currentUser.city) : currentUser.city}
                    </Text>
                  </Animated.View>
                  {isEditMode && (
                    <TouchableOpacity 
                      style={[styles.editFieldButton, { right: -6, left: 'auto', top: -6 }]}
                      onPress={() => startEditing('city')}
                    >
                      <Image source={require('../assets/images/icons/Edit_fill.png')} style={styles.editFieldIcon} />
                    </TouchableOpacity>
                  )}
                </View>
              )}
              <View style={styles.expertBadgeContainer}>
                {/* Profilime Git - Uzmanlık/MYK yerine */}
                <View style={styles.goProfileWrapper}>
                  <GlassmorphismView
                    style={styles.goProfileButton}
                    borderRadius={8}
                    blurEnabled={false}
                    config={quickActionPortfolioConfig}
                    height={60}
                  >
                    <TouchableOpacity
                      style={styles.goProfileButtonContent}
                      activeOpacity={0.85}
                      onPress={() => {
                        try {
                          navigation.navigate('Profile');
                        } catch {}
                      }}
                    >
                      <Text style={[styles.goProfileButtonText, { color: isDark ? theme.colors.white : theme.colors.text.primary }]}>Profilime Git</Text>
                      <Image source={require('../assets/images/icons/return.png')} style={styles.goProfileIcon} />
                    </TouchableOpacity>
                  </GlassmorphismView>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* Sosyal Medya ve İletişim Badge'leri - Dashboard'da gizlendi */}
        <View style={[styles.badgesRow, { display: 'none' }]}>
          <View style={styles.socialMediaBadgeContainer}>
            <Animated.View 
              style={[
                styles.socialMediaBadge,
                isEditMode && { opacity: blinkAnim }
              ]}
            >
              <TouchableOpacity style={styles.socialIconButton}>
                <Image source={require('../assets/images/icons/instagram.png')} style={styles.socialIcon} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.socialIconButton}>
                <Image source={require('../assets/images/icons/facebook.png')} style={styles.socialIcon} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.socialIconButton}>
                <Image source={require('../assets/images/icons/Youtube.png')} style={styles.socialIcon} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.socialIconButton}>
                <Image source={require('../assets/images/icons/linkedin.png')} style={styles.socialIcon} />
              </TouchableOpacity>
            </Animated.View>
            {isEditMode && (
              <TouchableOpacity 
                style={styles.editFieldButton}
                onPress={() => startEditing('socialMedia')}
              >
                <Image source={require('../assets/images/icons/Edit_fill.png')} style={styles.editFieldIcon} />
              </TouchableOpacity>
            )}
          </View>
          
          <View style={styles.contactBadge}>
           <TouchableOpacity style={[styles.phoneButton, { backgroundColor: '#142331' }]} onPress={handlePhoneCall}> 
             <Image source={require('../assets/images/icons/phonefill.png')} style={styles.contactIcon} />
           </TouchableOpacity>
           <TouchableOpacity style={[styles.whatsappButton, { backgroundColor: '#25D366' }]} onPress={handleWhatsApp}>
             <Image source={require('../assets/images/icons/whatsapp.png')} style={styles.whatsappIcon} />
           </TouchableOpacity>
         </View>
        </View>

        {/* Ayırıcı Çizgi */}
        <View style={styles.divider} />

       {/* İstatistikler + Yapay Zeka Araçları (yan yana) */}
       <View style={styles.statsRow}>
         <GlassmorphismView
           style={styles.statsContainerWrapper}
           borderRadius={8}
           blurEnabled={false} // Blur'u kapattık.
           config={statsConfig}
         >
           <View style={styles.statsContentWrapper}>
             <View style={styles.statItemsRow}>
               <View style={styles.statItem}>
                  <Text style={[styles.statNumber, { color: theme.colors.error }]}>{userPortfolios.length}</Text>
                 <Text style={[styles.statLabel, { color: isDark ? theme.colors.white : theme.colors.text.primary }]}>Aktif Portföy</Text>
               </View>
               <View style={styles.statItem}>
                 <Text style={[styles.statNumber, { color: theme.colors.error }]}>16</Text>
                 <Text style={[styles.statLabel, { color: isDark ? theme.colors.white : theme.colors.text.primary }]}>Aktif Talep</Text>
               </View>
             </View>
           </View>
         </GlassmorphismView>

         <GlassmorphismView
           style={styles.aiToolsContainerWrapper}
           borderRadius={8}
           blurEnabled={false}
           config={quickActionPortfolioConfig}
         >
           <TouchableOpacity
             style={styles.quickActionContent}
             activeOpacity={0.85}
             onPress={() => {
               try {
                 Alert.alert('Bilgi', 'Yapay Zeka Araçları yakında burada olacak.');
               } catch {}
             }}
           >
             <Image source={require('../assets/images/icons/search.png')} style={styles.quickActionIcon} />
             <Text style={[styles.quickActionText, { color: isDark ? theme.colors.white : theme.colors.text.primary }]}>Yapay Zeka Araçları</Text>
           </TouchableOpacity>
         </GlassmorphismView>
       </View>



        {/* Görsel Filtre Çipleri - Home.js ile aynı görünüm (sadece UI) */}
        <GlassmorphismView
          style={styles.filterContainer}
          borderRadius={10}
          blurEnabled={false}
          config={{
            overlayColor: 'rgba(224, 220, 220, 0.81)',
            startColor: 'rgba(17, 36, 49, 1)',
            endColor: 'rgba(17, 36, 49, 0.64)',
            gradientAlpha: 1,
            gradientDirection: 150,
            gradientSpread: 7,
            ditherStrength: 4.0,
          }}
        >
          <View style={styles.statsSectionContainer}>
            <View style={styles.filterRow}>
              {filterOptions.map(({ key, label }) => {
                const active = dashSelectedPeriod === key;
                return (
                  <TouchableOpacity
                    key={key}
                    onPress={() => setDashSelectedPeriod(key)}
                    activeOpacity={0.8}
                    style={[styles.filterChip, active && styles.filterChipActive]}
                    onLayout={(e) => {
                      const { x, width: w } = e.nativeEvent.layout;
                      setDashFilterItemLayouts(prev => ({ ...prev, [key]: { ...(prev[key] || {}), x, width: w } }));
                    }}
                  >
                    <Text
                      style={[styles.filterChipText, active && styles.filterChipTextActive]}
                      onLayout={(e) => {
                        const { x: tx, width: tw } = e.nativeEvent.layout;
                        setDashFilterItemLayouts(prev => ({ ...prev, [key]: { ...(prev[key] || {}), textX: tx, textW: tw } }));
                      }}
                    >{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={styles.filtersDivider}>
              <Animated.View style={[
                styles.filtersDividerIndicator,
                { left: 0, width: dashIndicatorWidth, transform: [{ translateX: dashIndicatorTranslateX }] }
              ]} />
            </View>

            {/* Müşteriye gönderilen aksiyonlar - badge görünümleri */}
            <View style={styles.statsLinesContainer}>
              <View style={styles.statsBadge}>
                <Image source={require('../assets/images/icons/talep.png')} style={styles.statsIcon} />
                <Text style={styles.statsBadgeText}>Müşteriye gönderilen talep istekleri</Text>
              </View>
              <View style={styles.statsBadge}>
                <Image source={require('../assets/images/icons/portfoy.png')} style={styles.statsIcon} />
                <Text style={styles.statsBadgeText}>Müşteriye gönderilen portföyler</Text>
              </View>
            </View>
          </View>
        </GlassmorphismView>

      {/* Hızlı Aksiyonlar Grubu - İstatistik containeri gibi gradyanlı büyük arka plan */}
      <View style={styles.actionsGroupWrapper}>
        <GlassmorphismView
          style={StyleSheet.absoluteFill}
          borderRadius={10}
          blurEnabled={false}
          config={actionsGroupConfig}
          width={width}
          height={Math.min(height * 0.36, 360)}
        />
      <View style={styles.quickActionsContainer}>
         <View style={styles.quickActionsRow}>
           <GlassmorphismView
            style={[styles.quickAction, styles.quickActionLeft]}
             borderRadius={8}
             blurEnabled={false}
             config={quickActionPortfolioConfig}
              width={quickActionButtonWidth}
              height={quickActionButtonHeight}
           >
             <TouchableOpacity
               style={styles.quickActionContent}
               activeOpacity={0.85}
               onPress={() => {
                 try {
                   navigation.navigate('Ana Sayfa', { screen: 'AddPortfolio' });
                 } catch {}
               }}
             >
               <Image source={require('../assets/images/icons/portfoy.png')} style={styles.quickActionIcon} />
               <Text style={[styles.quickActionText, { color: isDark ? theme.colors.white : theme.colors.text.primary }]}>Portföy Gönder</Text>
             </TouchableOpacity>
           </GlassmorphismView>

           <GlassmorphismView
            style={[styles.quickAction, styles.quickActionRight]}
             borderRadius={8}
             blurEnabled={false}
             config={quickActionRequestConfig}
              width={quickActionButtonWidth}
              height={quickActionButtonHeight}
           >
             <TouchableOpacity
               style={styles.quickActionContent}
               activeOpacity={0.85}
               onPress={() => {
                 try {
                   navigation.navigate('Taleplerim', { screen: 'RequestForm' });
                 } catch {}
               }}
             >
               <Image source={require('../assets/images/icons/talep.png')} style={styles.quickActionIcon} />
               <Text style={[styles.quickActionText, { color: isDark ? theme.colors.white : theme.colors.text.primary }]}>Talep İsteği</Text>
             </TouchableOpacity>
           </GlassmorphismView>
         </View>
       </View>
        {/* Ek Hızlı Aksiyonlar (Expertiz Raporu, Yapay Zeka Araçları) - Stats gradyanı */}
        <View style={styles.toolActionsContainer}>
          <View style={styles.quickActionsRow}>
            <GlassmorphismView
            style={[styles.quickAction, styles.quickActionLeft]}
              borderRadius={12}
              blurEnabled={false}
              config={statsConfig}
              width={quickActionButtonWidth}
              height={quickActionButtonHeight}
            >
              <TouchableOpacity
                style={styles.quickActionContent}
                activeOpacity={0.85}
                onPress={() => {
                  try {
                    Alert.alert('Bilgi', 'Expertiz Raporu yakında burada olacak.');
                  } catch {}
                }}
              >
                <Image source={require('../assets/images/icons/plan.png')} style={styles.quickActionIcon} />
                <Text style={[styles.quickActionText, { color: isDark ? theme.colors.white : theme.colors.text.primary }]}>Expertiz Raporu</Text>
              </TouchableOpacity>
            </GlassmorphismView>

            <GlassmorphismView
            style={[styles.quickAction, styles.quickActionRight]}
              borderRadius={12}
              blurEnabled={false}
              config={statsConfig}
              width={quickActionButtonWidth}
              height={quickActionButtonHeight}
            >
              <TouchableOpacity
                style={styles.quickActionContent}
                activeOpacity={0.85}
                onPress={() => {
                  try {
                    Alert.alert('Bilgi', 'Yapay Zeka Araçları yakında burada olacak.');
                  } catch {}
                }}
              >
                <Image source={require('../assets/images/icons/search.png')} style={styles.quickActionIcon} />
                <Text style={[styles.quickActionText, { color: isDark ? theme.colors.white : theme.colors.text.primary }]}>Yapay Zeka Araçları</Text>
              </TouchableOpacity>
            </GlassmorphismView>
          </View>
        </View>
      </View>

        {/* Hakkında Bölümü */}
        <GlassmorphismView
          style={[styles.aboutContainer, { display: 'none' }]}
          borderRadius={15}
          blurEnabled={false} // Blur'u kapattık.
          config={aboutConfig}
        >
          <View style={styles.aboutContentWrapper}>
            <View style={styles.aboutHeader}>
              <Animated.View 
                style={[
                  isEditMode && { opacity: blinkAnim }
                ]}
              >
                <Text style={[styles.aboutTitle, { color: isDark ? theme.colors.white : theme.colors.text.primary }]}>Hakkında</Text>
              </Animated.View>
              {isEditMode && (
                <TouchableOpacity 
                  style={styles.editFieldButton}
                  onPress={() => startEditing('bio')}
                >
                  <Image source={require('../assets/images/icons/Edit_fill.png')} style={styles.editFieldIcon} />
                </TouchableOpacity>
              )}
            </View>
            <Text style={[styles.aboutText, { color: isDark ? theme.colors.white : theme.colors.text.primary }]}>
              {isEditMode ? (tempUserData.bio || currentUser.bio || "Lüks konut sektöründe uzmanlaşmış, müşteri memnuniyetini ön planda tutan deneyimli bir emlak danışmanıyım. Size en uygun konutu bulmanızda yardımcı olmaktan mutluluk duyarım.") : (currentUser.bio || "Lüks konut sektöründe uzmanlaşmış, müşteri memnuniyetini ön planda tutan deneyimli bir emlak danışmanıyım. Size en uygun konutu bulmanızda yardımcı olmaktan mutluluk duyarım.")}
            </Text>
          </View>
        </GlassmorphismView>

        {/* Portföylerim Bölümü - Dashboard'da gizlendi */}
        <GlassmorphismView
          style={[styles.portfolioContainer, { display: 'none' }]}
          borderRadius={15}
          blurEnabled={false}
          config={portfolioConfig}
        >
          {/* Header: Başlık + Filtre Butonu */}
          <View style={styles.portfoliosHeader}>
            <Text style={[styles.portfoliosTitle, { color: theme.colors.white }]}> 
              Portföylerim ({filteredPortfolios.length})
            </Text>
            
            <TouchableOpacity
              style={[styles.filterButton, getActiveProfileFiltersCount() > 0 && styles.filterButtonActive]}
              onPress={() => setShowProfileFilters(true)}
            >
              <Image
                source={require('../assets/images/icons/filtrele.png')}
                style={styles.filterButtonIcon}
              />
              {getActiveProfileFiltersCount() > 0 && (
                <View style={styles.filterBadge}>
                  <Text style={styles.filterBadgeText}>{getActiveProfileFiltersCount()}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          {/* Aktif Filtre Temizleme Butonu */}
          {getActiveProfileFiltersCount() > 0 && (
            <TouchableOpacity
              style={styles.clearFiltersButton}
              onPress={clearProfileFilters}
            >
              <Text style={[styles.clearFiltersText, { color: theme.colors.text.primary }]}>
                ✕ Filtreleri Temizle ({getActiveProfileFiltersCount()})
              </Text>
            </TouchableOpacity>
          )}

          {/* Loading State */}
          {portfoliosLoading ? (
            <View style={styles.loadingPortfolios}>
              <Text style={[styles.loadingText, { color: theme.colors.text.primary }]}>
                Portföyler yükleniyor...
              </Text>
            </View>
          ) : (
            <View style={styles.portfoliosGrid}>
              {/* Filtrelenmiş Portföyler - 2 sütunlu grid */}
              {filteredPortfolios.map((portfolio, index) => (
                <View 
                  key={portfolio.id} 
                  style={styles.portfolioCardContainer}
                >
                  <ListingCard
                    listing={portfolio}
                    onPress={() => navigation.navigate('PropertyDetail', { 
                      portfolio: portfolio,
                      fromScreen: 'Profile'
                    })}
                    isEditable={false}
                    showPublishBadge={true}
                    isOwnerCard={false}
                  />
                </View>
              ))}
              
              {/* Boş Durum */}
              {filteredPortfolios.length === 0 && !portfoliosLoading && (
                <View style={styles.emptyPortfolios}>
                  <Text style={[styles.emptyPortfoliosText, { color: theme.colors.text.primary }]}>
                    {userPortfolios.length === 0 
                      ? 'Henüz portföyünüz bulunmuyor'
                      : 'Filtrelere uygun portföy bulunamadı'}
                  </Text>
                  {userPortfolios.length > 0 && getActiveProfileFiltersCount() > 0 && (
                    <TouchableOpacity
                      style={styles.clearFiltersButtonInline}
                      onPress={clearProfileFilters}
                    >
                      <Text style={[styles.clearFiltersTextInline, { color: theme.colors.text.primary }]}>
                        Filtreleri Temizle
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          )}
        </GlassmorphismView>

        {/* Düzenleme Modu Başlığı */}
        {isEditMode && (
          <View style={[styles.editModeHeader, { backgroundColor: theme.colors.error }]}>
            <Text style={styles.editModeTitle}>✏️ Düzenleme Modu</Text>
            <Text style={styles.editModeSubtitle}>Düzenlemek istediğiniz alana dokunun</Text>
          </View>
        )}

      </View>
    )
  }, [currentUser, filteredPortfolios, portfoliosLoading, getActiveProfileFiltersCount, clearProfileFilters, uploading, isDark, isEditMode, tempUserData, blinkAnim, navigation, userPortfolios, removeProfilePicture, handlePhoneCall, handleShareProfile, handleWhatsApp, startEditing, styles.aboutContainer, styles.aboutContentWrapper, styles.aboutHeader, styles.aboutText, styles.aboutTitle, styles.badgeIcon, styles.badgesContainer, styles.badgesRow, styles.cityBadge, styles.cityBadgeContainer, styles.cityBadgeText, styles.clearFiltersButton, styles.clearFiltersButtonInline, styles.clearFiltersText, styles.clearFiltersTextInline, styles.contactBadge, styles.contactIcon, styles.deleteImageButton, styles.divider, styles.editFieldButton, styles.editFieldIcon, styles.editImageButton, styles.editImageIcon, styles.editModeHeader, styles.editModeSubtitle, styles.editModeTitle, styles.emptyPortfolios, styles.emptyPortfoliosText, styles.expertBadge, styles.expertBadgeContainer, styles.expertBadgeText, styles.expertBadgesRow, styles.filterBadge, styles.filterBadgeText, styles.filterButton, styles.filterButtonActive, styles.filterButtonIcon, styles.loadingPortfolios, styles.loadingText, styles.mykBadge, styles.mykIcon, styles.mykSeparator, styles.mykSeparatorDot, styles.mykTickIcon, styles.nameContainer, styles.officeBadge, styles.officeBadgeContainer, styles.officeBadgeText, styles.officeIcon, styles.phoneButton, styles.pinIcon, styles.portfolioCardContainer, styles.portfolioContainer, styles.portfoliosGrid, styles.portfoliosHeader, styles.portfoliosTitle, styles.profileImage, styles.profileImageContainer, styles.profileInfoContainer, styles.profileMainContainer, styles.profileName, styles.shareButton, styles.shareIcon, styles.socialIcon, styles.socialIconButton, styles.socialMediaBadge, styles.socialMediaBadgeContainer, styles.statItem, styles.statLabel, styles.statNumber, styles.statsContainerWrapper, styles.statsContentWrapper, styles.whatsappButton, styles.whatsappIcon, theme.colors.error, theme.colors.navy, theme.colors.text.primary, theme.colors.white]);



  // Loading durumu
  if (!currentUser) {
    return (
      <ImageBackground
        source={isDark ? require('../assets/images/dark-bg2.png') : require('../assets/images/light-bg.jpg')}
        defaultSource={isDark ? require('../assets/images/dark-bg2.png') : require('../assets/images/light-bg.jpg')}
        fadeDuration={0}
        style={[styles.backgroundImage, { backgroundColor: isDark ? '#071317' : '#FFFFFF' }]}
      >
        <SafeAreaView edges={['left','right','bottom']} style={styles.safeArea}>
          <View style={styles.container}>
            <View style={styles.loadingContainer}>
              <Text style={styles.loadingText}>Yükleniyor...</Text>
            </View>
          </View>
        </SafeAreaView>
      </ImageBackground>
    );
  }

  return (
    <ImageBackground
      source={isDark ? require('../assets/images/dark-bg2.png') : require('../assets/images/light-bg.jpg')}
      defaultSource={isDark ? require('../assets/images/dark-bg2.png') : require('../assets/images/light-bg.jpg')}
      fadeDuration={0}
      style={[styles.backgroundImage, { backgroundColor: isDark ? '#071317' : '#FFFFFF' }]}
    >
      <SafeAreaView edges={['left','right','bottom']} style={styles.safeArea}>
        <View 
          style={styles.container}
        >
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
              <TouchableOpacity
                activeOpacity={0.7}
                delayLongPress={2000}
                onLongPress={() => navigation.navigate('NotificationTest')}
              >
                <Text style={[styles.headerTitle, { color: isDark ? theme.colors.white : theme.colors.navy }]}>
                  Kontrol Sayfası
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.headerRight}>
              {isOwnProfile && (
                <>
                  {isEditMode && (
                    <TouchableOpacity
                      style={styles.headerButton}
                      onPress={cancelEditing}
                    >
                      <Image source={require('../assets/images/icons/deletephoto.png')} style={[styles.headerButtonIcon, { tintColor: theme.colors.error }]} />
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={[
                      styles.headerButtonCrimson,
                      isEditMode && { paddingHorizontal: 12, width: 'auto', height: 40, flexDirection: 'row', gap: 6 }
                    ]}
                    onPress={() => {
                      try {
                        navigation.navigate('Profile', { openEdit: true });
                      } catch {}
                    }}
                  >
                    <Image 
                      source={require('../assets/images/icons/Edit_fill.png')} 
                      style={[styles.headerButtonIcon, { tintColor: theme.colors.white }]} 
                    />
                    {isEditMode && (
                      <Text style={[
                        styles.editModeText,
                        { color: theme.colors.white }
                      ]}>
                        Kaydet
                      </Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.headerButtonCrimson, { marginLeft: theme.spacing.md }]}
                    onPress={() => navigation.navigate('Settings')}
                  >
                    <Image source={require('../assets/images/icons/Setting_alt_fill2x.png')} style={[styles.headerButtonIcon, { tintColor: theme.colors.white }]} />
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>

          {/* Spacer: header yüksekliği kadar boşluk (insets.top + 12 + 37 + spacing.lg) */}
          <View style={{ height: Math.max(insets.top, 0) + 12 + 37 + ((theme?.spacing && theme.spacing.lg) ? theme.spacing.lg : 16) }} />

          <Animatable.View 
            ref={viewRef}
            animation="fadeIn"
            duration={350}
            useNativeDriver
            style={styles.content}
          >
            <ScrollView
              contentContainerStyle={[
                styles.contentContainer,
                { paddingBottom: insets.bottom + 50 }, // Minimal bottom padding
              ]}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              bounces={false}
              scrollEnabled={false}
            >
              {renderProfileHeader()}
            </ScrollView>
          </Animatable.View>

          {/* Şehir Seçme Modalı */}
          <Modal
            visible={showCityModal}
            transparent={true}
            animationType="slide"
            onRequestClose={() => setShowCityModal(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={[styles.modalContent, { backgroundColor: isDark ? theme.colors.navy : theme.colors.white }]}>
                <Text style={[styles.modalTitle, { color: isDark ? theme.colors.white : theme.colors.navy }]}>
                  Şehir Seçin
                </Text>
                <ScrollView style={styles.cityList}>
                  {turkishCities.map((city, index) => (
                    <TouchableOpacity
                      key={index}
                      style={[
                        styles.cityItem,
                        { 
                          backgroundColor: tempUserData.city === city 
                            ? theme.colors.error 
                            : (isDark ? theme.colors.surface + '40' : theme.colors.surface + '20')
                        }
                      ]}
                      onPress={() => {
                        setTempUserData(prev => ({ ...prev, city: city }));
                        setShowCityModal(false);
                      }}
                    >
                      <Text style={[
                        styles.cityItemText,
                        { 
                          color: tempUserData.city === city 
                            ? theme.colors.white 
                            : (isDark ? theme.colors.white : theme.colors.navy)
                        }
                      ]}>
                        {city}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <TouchableOpacity
                  style={[styles.modalCancelButton, { backgroundColor: theme.colors.error }]}
                  onPress={() => setShowCityModal(false)}
                >
                  <Text style={[styles.modalCancelButtonText, { color: theme.colors.white }]}>İptal</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>

          {/* Kopyalama Başarı Tostu (butonsuz, hızlı) */}
          <Modal
            visible={showCopyToast}
            transparent={true}
            animationType="none"
            onRequestClose={() => setShowCopyToast(false)}
          >
            <View style={styles.quickModalOverlay}>
              <Animated.View
                style={{
                  opacity: copyToastAnim,
                  transform: [{ scale: copyToastAnim }],
                }}
              >
                <GlassmorphismView
                  style={styles.quickModalContainer}
                  borderRadius={20}
                  blurEnabled={false}
                  config={shareActionModalConfig}
                >
                  <Text style={styles.quickModalText}>{copyToastMessage || 'İşlem başarılı'}</Text>
                </GlassmorphismView>
              </Animated.View>
            </View>
          </Modal>

          {/* İsim Düzenleme Modalı */}
          <Modal
            visible={showNameModal}
            transparent={true}
            animationType="slide"
            onRequestClose={() => setShowNameModal(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={[styles.modalContent, { backgroundColor: isDark ? theme.colors.navy : theme.colors.white }]}>
                <Text style={[styles.modalTitle, { color: isDark ? theme.colors.white : theme.colors.navy }]}>
                  İsminizi Düzenleyin
                </Text>
                <TextInput
                  style={[
                    styles.textInput,
                    { 
                      color: isDark ? theme.colors.white : theme.colors.navy,
                      borderColor: theme.colors.error,
                      backgroundColor: isDark ? theme.colors.surface + '40' : theme.colors.surface + '20'
                    }
                  ]}
                  value={tempUserData.name || ''}
                  onChangeText={(text) => setTempUserData(prev => ({ 
                    ...prev, 
                    name: text
                  }))}
                  placeholder="İsim Soyisim girin"
                  placeholderTextColor={isDark ? theme.colors.white + '80' : theme.colors.navy + '80'}
                />
                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    style={[styles.modalCancelButton, { backgroundColor: theme.colors.surface + 'CC' }]}
                    onPress={() => setShowNameModal(false)}
                  >
                    <Text style={[styles.modalCancelButtonText, { color: isDark ? theme.colors.white : theme.colors.navy }]}>İptal</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalCancelButton, { backgroundColor: theme.colors.error }]}
                    onPress={() => {
                      setShowNameModal(false);
                    }}
                  >
                    <Text style={[styles.modalCancelButtonText, { color: theme.colors.white }]}>Kaydet</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>

          {/* Hakkında Düzenleme Modalı */}
          <Modal
            visible={showBioModal}
            transparent={true}
            animationType="slide"
            onRequestClose={() => setShowBioModal(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={[styles.modalContent, { backgroundColor: isDark ? theme.colors.navy : theme.colors.white }]}>
                <Text style={[styles.modalTitle, { color: isDark ? theme.colors.white : theme.colors.navy }]}>
                  Hakkında Metnini Düzenleyin
                </Text>
                <TextInput
                  style={[
                    styles.textAreaInput,
                    { 
                      color: isDark ? theme.colors.white : theme.colors.navy,
                      borderColor: theme.colors.error,
                      backgroundColor: isDark ? theme.colors.surface + '40' : theme.colors.surface + '20'
                    }
                  ]}
                  value={tempUserData.bio || ''}
                  onChangeText={(text) => setTempUserData(prev => ({ ...prev, bio: text }))}
                  placeholder="Kendinizi tanıtın..."
                  placeholderTextColor={isDark ? theme.colors.white + '80' : theme.colors.navy + '80'}
                  multiline
                  numberOfLines={6}
                  textAlignVertical="top"
                />
                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    style={[styles.modalCancelButton, { backgroundColor: theme.colors.surface + 'CC' }]}
                    onPress={() => setShowBioModal(false)}
                  >
                    <Text style={[styles.modalCancelButtonText, { color: isDark ? theme.colors.white : theme.colors.navy }]}>İptal</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalCancelButton, { backgroundColor: theme.colors.error }]}
                    onPress={() => {
                      setShowBioModal(false);
                    }}
                  >
                    <Text style={[styles.modalCancelButtonText, { color: theme.colors.white }]}>Kaydet</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>

          {/* Ofis İsmi Düzenleme Modalı */}
          <Modal
            visible={showOfficeModal}
            transparent={true}
            animationType="slide"
            onRequestClose={() => setShowOfficeModal(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={[styles.modalContent, { backgroundColor: isDark ? theme.colors.navy : theme.colors.white }]}>
                <Text style={[styles.modalTitle, { color: isDark ? theme.colors.white : theme.colors.navy }]}>
                  Ofis İsmini Düzenle
                </Text>
                <TextInput
                  style={[
                    styles.modalTextInput,
                    { 
                      backgroundColor: isDark ? theme.colors.surface + '40' : theme.colors.surface + '20',
                      color: isDark ? theme.colors.white : theme.colors.navy,
                      borderColor: isDark ? theme.colors.surface : theme.colors.border
                    }
                  ]}
                  value={tempUserData.officeName || ''}
                  onChangeText={(text) => setTempUserData(prev => ({ ...prev, officeName: text }))}
                  placeholder="Ofis ismini girin..."
                  placeholderTextColor={isDark ? theme.colors.white + '60' : theme.colors.navy + '60'}
                />
                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    style={[styles.modalCancelButton, { backgroundColor: theme.colors.error }]}
                    onPress={() => setShowOfficeModal(false)}
                  >
                    <Text style={[styles.modalButtonText, { color: theme.colors.white }]}>İptal</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.modalCancelButton, { backgroundColor: theme.colors.primary }]}
                    onPress={() => {
                      setShowOfficeModal(false);
                    }}
                  >
                    <Text style={[styles.modalButtonText, { color: theme.colors.white }]}>Kaydet</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>

          {/* Sosyal Medya Düzenleme Modalı */}
          <Modal
            visible={showSocialModal}
            transparent={true}
            animationType="slide"
            onRequestClose={() => setShowSocialModal(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={[styles.modalContent, { backgroundColor: isDark ? theme.colors.navy : theme.colors.white }]}>
                <Text style={[styles.modalTitle, { color: isDark ? theme.colors.white : theme.colors.navy }]}>
                  Sosyal Medya Hesaplarını Düzenle
                </Text>
                <View style={styles.socialInputContainer}>
                  <Text style={[styles.socialLabel, { color: isDark ? theme.colors.white : theme.colors.navy }]}>
                    Instagram
                  </Text>
                  <TextInput
                    style={[
                      styles.socialTextInput,
                      { 
                        backgroundColor: isDark ? theme.colors.surface + '40' : theme.colors.surface + '20',
                        color: isDark ? theme.colors.white : theme.colors.navy,
                        borderColor: isDark ? theme.colors.surface : theme.colors.border
                      }
                    ]}
                    value={tempUserData.socialInstagram || ''}
                    onChangeText={(text) => setTempUserData(prev => ({ ...prev, socialInstagram: text }))}
                    placeholder="@kullaniciadi"
                    placeholderTextColor={isDark ? theme.colors.white + '60' : theme.colors.navy + '60'}
                  />
                </View>
                <View style={styles.socialInputContainer}>
                  <Text style={[styles.socialLabel, { color: isDark ? theme.colors.white : theme.colors.navy }]}>
                    Facebook
                  </Text>
                  <TextInput
                    style={[
                      styles.socialTextInput,
                      { 
                        backgroundColor: isDark ? theme.colors.surface + '40' : theme.colors.surface + '20',
                        color: isDark ? theme.colors.white : theme.colors.navy,
                        borderColor: isDark ? theme.colors.surface : theme.colors.border
                      }
                    ]}
                    value={tempUserData.socialFacebook || ''}
                    onChangeText={(text) => setTempUserData(prev => ({ ...prev, socialFacebook: text }))}
                    placeholder="facebook.com/kullaniciadi"
                    placeholderTextColor={isDark ? theme.colors.white + '60' : theme.colors.navy + '60'}
                  />
                </View>
                <View style={styles.socialInputContainer}>
                  <Text style={[styles.socialLabel, { color: isDark ? theme.colors.white : theme.colors.navy }]}>
                    YouTube
                  </Text>
                  <TextInput
                    style={[
                      styles.socialTextInput,
                      { 
                        backgroundColor: isDark ? theme.colors.surface + '40' : theme.colors.surface + '20',
                        color: isDark ? theme.colors.white : theme.colors.navy,
                        borderColor: isDark ? theme.colors.surface : theme.colors.border
                      }
                    ]}
                    value={tempUserData.socialYoutube || ''}
                    onChangeText={(text) => setTempUserData(prev => ({ ...prev, socialYoutube: text }))}
                    placeholder="youtube.com/@kullaniciadi"
                    placeholderTextColor={isDark ? theme.colors.white + '60' : theme.colors.navy + '60'}
                  />
                </View>
                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    style={[styles.modalCancelButton, { backgroundColor: theme.colors.error }]}
                    onPress={() => setShowSocialModal(false)}
                  >
                    <Text style={[styles.modalButtonText, { color: theme.colors.white }]}>İptal</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalSaveButton, { backgroundColor: theme.colors.primary }]}
                    onPress={() => {
                      setShowSocialModal(false);
                    }}
                  >
                    <Text style={[styles.modalButtonText, { color: theme.colors.white }]}>Kaydet</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>

          {/* Profil Resmi Güncelleme Modalı */}
          <Modal
            visible={showImageModal}
            transparent={true}
            animationType="slide"
            onRequestClose={() => setShowImageModal(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={[styles.modalContent, { backgroundColor: isDark ? theme.colors.navy : theme.colors.white }]}>
                <Text style={[styles.modalTitle, { color: isDark ? theme.colors.white : theme.colors.navy }]}>
                  Profil Resmini Güncelle
                </Text>
                <View style={styles.imagePreviewContainer}>
                  <Image
                    source={
                      tempUserData.profilePicture || currentUser.profilePicture
                        ? { uri: tempUserData.profilePicture || currentUser.profilePicture }
                        : require('../assets/images/logo-krimson.png')
                    }
                    style={styles.imagePreview}
                  />
                </View>
                <View style={styles.imageOptions}>
                  <TouchableOpacity
                    style={[styles.imageOptionButton, { backgroundColor: theme.colors.primary }]}
                    onPress={openImageLibrary}
                    disabled={uploading}
                  >
                    <Image source={require('../assets/images/icons/userphoto.png')} style={styles.imageOptionIcon} />
                    <Text style={[styles.imageOptionText, { color: theme.colors.white }]}>Galeri</Text>
                  </TouchableOpacity>
                  <View style={{ height: 10 }} />
                  <TouchableOpacity
                    style={[styles.imageOptionButton, { backgroundColor: theme.colors.secondary }]}
                    onPress={openCamera}
                    disabled={uploading}
                  >
                    <Image source={require('../assets/images/icons/userphoto.png')} style={styles.imageOptionIcon} />
                    <Text style={[styles.imageOptionText, { color: theme.colors.white }]}>Kamera</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    style={[styles.modalCancelButton, { backgroundColor: theme.colors.surface + 'CC' }]}
                    onPress={() => {
                      // modal kapat (seçim korunur)
                      setShowImageModal(false);
                    }}
                  >
                    <Text style={[styles.modalCancelButtonText, { color: isDark ? theme.colors.white : theme.colors.navy }]}>İptal</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalCancelButton, { backgroundColor: theme.colors.primary }]}
                    onPress={() => setShowImageModal(false)}
                  >
                    <Text style={[styles.modalButtonText, { color: theme.colors.white }]}>Kaydet</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>

          {/* Uzmanlık Alanı Seçimi Modalı */}
          <Modal
            visible={showExpertModal}
            transparent={true}
            animationType="slide"
            onRequestClose={() => setShowExpertModal(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={[styles.modalContent, { backgroundColor: isDark ? theme.colors.navy : theme.colors.white }]}>
                <Text style={[styles.modalTitle, { color: isDark ? theme.colors.white : theme.colors.navy }]}>
                  Uzmanlık Alanını Seçin
                </Text>
                <ScrollView style={styles.expertList}>
                  {expertTitles.map((title, index) => (
                    <TouchableOpacity
                      key={index}
                      style={[
                        styles.expertItem,
                        { 
                          backgroundColor: tempUserData.expertTitle === title 
                            ? theme.colors.error 
                            : (isDark ? theme.colors.surface + '40' : theme.colors.surface + '20')
                        }
                      ]}
                      onPress={() => {
                        setTempUserData(prev => ({ ...prev, expertTitle: title }));
                        setShowExpertModal(false);
                      }}
                    >
                      <Text style={[
                        styles.expertItemText,
                        { 
                          color: tempUserData.expertTitle === title 
                            ? theme.colors.white 
                            : (isDark ? theme.colors.white : theme.colors.navy)
                        }
                      ]}>
                        {title}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <TouchableOpacity
                  style={[styles.modalCancelButton, { backgroundColor: theme.colors.error }]}
                  onPress={() => setShowExpertModal(false)}
                >
                  <Text style={[styles.modalButtonText, { color: theme.colors.white }]}>İptal</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>

          {/* Profil Paylaşım Modalı */}
          <Modal
            visible={showShareModal}
            transparent={true}
            animationType="none"
            onRequestClose={handleCloseShareModal}
          >
            <View style={[styles.modalOverlay, { backgroundColor: 'transparent' }]}>
              <Pressable style={StyleSheet.absoluteFill} onPress={handleCloseShareModal} />
              <Animated.View style={[
                styles.shareActionModalWrapper,
                { 
                  opacity: shareModalOpacityAnim,
                  transform: [
                    { translateY: shareModalTranslateYAnim },
                    { scale: shareModalScaleAnim },
                  ],
                }
              ]}>
                <GlassmorphismView
                  style={styles.shareActionModalContent}
                  borderRadius={20}
                  blurEnabled={false}
                  config={shareActionModalConfig}
                >
                <View style={styles.modalTitleRow}>
                  <Image source={require('../assets/images/icons/share.png')} style={styles.modalTitleIcon} />
                  <Text style={[styles.modalTitle, { color: isDark ? theme.colors.white : theme.colors.navy }]}> 
                    Profilini Paylaş
                  </Text>
                </View>
                
                {isOwnProfile ? (
                  <View style={styles.shareLinkContainer}>
                    <Text style={[styles.shareLinkLabel, { color: isDark ? theme.colors.white : theme.colors.navy }]}>Profil Linkin:</Text>
                    <View style={styles.shareLinkRow}>
                      <View style={[styles.shareLinkBox, { backgroundColor: isDark ? theme.colors.surface + '40' : theme.colors.surface + '20' }]}>
                        <Text selectable style={[styles.shareLinkText, { color: isDark ? theme.colors.white : theme.colors.navy }]}>
                          {generateProfileLink()}
                        </Text>
                      </View>
                      {/* Düzenleme İkonu */}
                      <TouchableOpacity
                        style={[styles.editLinkButton, { backgroundColor: theme.colors.primary }]}
                        onPress={() => {
                          setCustomUsername(currentUser.username || '');
                          setUsernameError('');
                          setReopenShareAfterUsername(true);
                          setShowShareModal(false);
                          setShowUsernameModal(true);
                        }}
                      >
                        <Image source={require('../assets/images/icons/Edit_fill.png')} style={styles.editLinkIcon} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <View style={styles.shareLinkContainer}>
                    <Text style={[styles.shareLinkLabel, { color: isDark ? theme.colors.white : theme.colors.navy }]}>Profil Linki:</Text>
                    <View style={styles.shareLinkRow}>
                      <View style={[styles.shareLinkBox, { backgroundColor: isDark ? theme.colors.surface + '40' : theme.colors.surface + '20' }]}>
                        <Text selectable style={[styles.shareLinkText, { color: isDark ? theme.colors.white : theme.colors.navy }]}>
                          {generateProfileLink()}
                        </Text>
                      </View>
                    </View>
                  </View>
                )}

                <View style={styles.shareButtons}>
                  {isOwnProfile ? (
                    <>
                      <TouchableOpacity
                        style={[styles.shareButtonOption, { backgroundColor: theme.colors.error }]}
                        onPress={shareProfileLink}
                      >
                        <Image source={require('../assets/images/icons/share.png')} style={styles.shareButtonIcon} />
                        <Text style={[styles.shareButtonText, { color: theme.colors.white }]}>Paylaş</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.shareButtonOption, { backgroundColor: theme.colors.error }]}
                        onPress={copyProfileLink}
                      >
                        <Image source={require('../assets/images/icons/save.png')} style={styles.shareButtonIcon} />
                        <Text style={[styles.shareButtonText, { color: theme.colors.white }]}>Kopyala</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <>
                      <TouchableOpacity
                        style={[styles.shareButtonOption, { backgroundColor: '#25D366' }]}
                        onPress={shareProfileViaWhatsApp}
                      >
                        <Image source={require('../assets/images/icons/whatsapp.png')} style={styles.shareButtonIcon} />
                        <Text style={[styles.shareButtonText, { color: theme.colors.white }]}>WhatsApp</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.shareButtonOption, { backgroundColor: theme.colors.error }]}
                        onPress={copyProfileLink}
                      >
                        <Image source={require('../assets/images/icons/save.png')} style={styles.shareButtonIcon} />
                        <Text style={[styles.shareButtonText, { color: theme.colors.white }]}>Kopyala</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>

                <TouchableOpacity
                  style={[styles.modalCancelButton, { backgroundColor: 'rgba(255, 255, 255, 0.2)' }]}
                  onPress={handleCloseShareModal}
                >
                  <Text style={[styles.modalButtonText, { color: theme.colors.white }]}>Kapat</Text>
                </TouchableOpacity>
                </GlassmorphismView>
              </Animated.View>
            </View>
          </Modal>

          {/* Username Ayarlama Modalı */}
          <Modal
            visible={showUsernameModal}
            transparent={true}
            animationType="none"
            onRequestClose={handleCloseUsernameModal}
          >
            <View style={[styles.modalOverlay, { backgroundColor: 'transparent' }]}>
              <Pressable style={StyleSheet.absoluteFill} onPress={handleCloseUsernameModal} />
              <Animated.View style={[
                styles.shareActionModalWrapper,
                {
                  opacity: usernameModalOpacityAnim,
                  transform: [
                    { translateY: usernameModalTranslateYAnim },
                    { scale: usernameModalScaleAnim },
                  ],
                }
              ]}>
              <GlassmorphismView
                style={styles.shareActionModalContent}
                borderRadius={20}
                blurEnabled={false}
                config={shareActionModalConfig}
              >
                <Text style={[styles.modalTitle, { color: isDark ? theme.colors.white : theme.colors.navy }]}>
                  Özel URL Ayarla
                </Text>
                
                <Text style={[styles.shareLinkLabel, { color: isDark ? theme.colors.white : theme.colors.navy }]}>
                  talepify.com/
                </Text>
                
                <TextInput
                  style={[
                    styles.modalInput,
                    { 
                      backgroundColor: isDark ? theme.colors.surface + '40' : theme.colors.surface + '20',
                      color: isDark ? theme.colors.white : theme.colors.navy,
                      borderColor: usernameError ? theme.colors.error : theme.colors.border
                    }
                  ]}
                  value={customUsername}
                  onChangeText={(text) => {
                    setCustomUsername(text);
                    setUsernameError('');
                  }}
                  placeholder="kullanici-adi"
                  placeholderTextColor={isDark ? theme.colors.textSecondary : theme.colors.textSecondary}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                
                {usernameError ? (
                  <Text style={[styles.errorText, { color: theme.colors.error }]}>
                    {usernameError}
                  </Text>
                ) : null}
                
                <Text style={[styles.helpText, { color: isDark ? theme.colors.textSecondary : theme.colors.textSecondary }]}>
                  Sadece küçük harf, rakam, nokta, tire ve alt çizgi kullanabilirsiniz
                </Text>

                <View style={styles.shareButtons}>
                  <TouchableOpacity
                    style={[styles.shareButtonOption, { backgroundColor: theme.colors.primary }]}
                    onPress={saveUsername}
                  >
                    <Text style={[styles.shareButtonText, { color: theme.colors.white }]}>Kaydet</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={[styles.shareButtonOption, { backgroundColor: theme.colors.surface + 'CC' }]}
                    onPress={handleCloseUsernameModal}
                  >
                    <Text style={[styles.shareButtonText, { color: isDark ? theme.colors.white : theme.colors.navy }]}>İptal</Text>
                  </TouchableOpacity>
                </View>
              </GlassmorphismView>
              </Animated.View>
            </View>
          </Modal>

          {/* Başarı Modal'ı */}
          <Modal
            visible={showSuccessModal}
            transparent={true}
            animationType="fade"
            onRequestClose={() => setShowSuccessModal(false)}
          >
            <View style={styles.modalOverlay}>
               <GlassmorphismView
                 style={styles.successModalContent}
                 borderRadius={20}
                 blurEnabled={false}
                 config={shareActionModalConfig}
               >
                <View style={styles.successIconContainer}>
                  <Text style={styles.successIcon}>✓</Text>
                </View>
                <Text style={[styles.successTitle, { color: isDark ? theme.colors.white : theme.colors.navy }]}>
                  Başarılı!
                </Text>
                <Text style={[styles.successMessage, { color: isDark ? theme.colors.textSecondary : theme.colors.textSecondary }]}>
                  Kaydedildi:
                </Text>
                {updatedFields.map((field, index) => (
                  <Text key={index} style={[styles.successFieldItem, { color: isDark ? theme.colors.textSecondary : theme.colors.textSecondary }]}>
                    • {field} güncellendi
                  </Text>
                ))}
              </GlassmorphismView>
            </View>
          </Modal>

          {/* 🎯 Profil Sayfası İçin BAĞIMSIZ Filtre Modal */}
          <AdvancedFiltersModal
            visible={showProfileFilters}
            onClose={() => setShowProfileFilters(false)}
            onApply={applyProfileFilters}
            onClear={clearProfileFilters}
            initialFilters={profileFilters}
            portfolios={userPortfolios}
          />
        </View>
      </SafeAreaView>
    </ImageBackground>
  );
};

const createStyles = (theme, insets, isDark) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingBottom: Platform.OS === 'ios' ? 0 : 0, // SafeAreaView kendi padding'ini yönetir
  },

  // Hızlı Aksiyonlar
  quickActionsContainer: {
    paddingHorizontal: theme.spacing.md,
    marginTop: 0,
    marginBottom: theme.spacing.md,
  },
  quickActionsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'center',
    gap: 25,
  },
  quickAction: {
    flex: 0,
    width: '45%',
    alignSelf: 'center',
    minHeight: 80,
    borderWidth: 0,
    overflow: 'hidden',
  },
  quickActionLeft: {
    width: '44%',
    marginLeft: 8,
  },
  quickActionRight: {
    width: '44%',
    marginRight: 8,
  },
  quickActionContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  quickActionIcon: {
    width: 22,
    height: 22,
    tintColor: theme.colors.white,
    marginBottom: 6,
    resizeMode: 'contain',
  },
  quickActionText: {
    fontSize: theme.fontSizes.sm,
    color: theme.colors.white,
  },

  // Dört butonluk grup için arka plan
  actionsGroupWrapper: {
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.md,
    paddingTop: theme.spacing.xl,
    paddingBottom: theme.spacing.xl,
    minHeight: Math.min(height * 0.36, 360),
  },

  // Alt ek aksiyonlar
  toolActionsContainer: {
    paddingHorizontal: theme.spacing.md,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },

  // Home.js ile uyumlu görsel filtre stilleri
  filterContainer: {
    marginHorizontal: 0,
    marginBottom: theme.spacing.md,
    overflow: 'hidden',
    paddingVertical: theme.spacing.md,
    minHeight: 140,
    width: '100%',
  },
  statsSectionContainer: {
    width: '100%',
    paddingHorizontal: Math.min(width * 0.04, 16),
    paddingTop: Math.min(height * 0.015, 8),
    paddingBottom: Math.min(height * 0.02, 14),
    gap: Math.min(height * 0.008, 6),
  },
  filterRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 20,
  },
  filterChip: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: 'transparent',
  },
  filterChipActive: {
  },
  filterChipText: {
    fontSize: 14,
    color: theme.colors.white,
    fontWeight: theme.fontWeights.bold,
  },
  filterChipTextActive: {
    color: theme.colors.error,
    fontWeight: theme.fontWeights.bold,
  },
  filtersDivider: {
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    marginTop: Math.min(height * 0.004, 4),
    overflow: 'hidden',
    borderRadius: 1,
    position: 'relative',
  },
  filtersDividerIndicator: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: theme.colors.error,
    borderRadius: 1,
  },

  // Badge görünümleri (Home.js ile uyumlu)
  statsLinesContainer: {
    marginTop: Math.min(height * 0.012, 10),
    gap: Math.min(height * 0.012, 10),
  },
  statsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    backgroundColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)',
    paddingVertical: Math.min(height * 0.012, 10),
    paddingHorizontal: Math.min(width * 0.03, 12),
    gap: 8,
    marginHorizontal: Math.min(width * 0.01, 6),
  },
  statsIcon: {
    width: 20,
    height: 20,
    tintColor: theme.colors.error,
  },
  statsBadgeText: {
    fontSize: Math.min(width * 0.040, 16),
    color: theme.colors.white,
    fontWeight: theme.fontWeights.bold,
  },

  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },

  // Arka Plan
  backgroundContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },

  backgroundImage: {
    flex: 1,
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },

  header: {
    paddingHorizontal: theme.spacing.lg,
    /* üst padding runtime'da insets.top + 12 verilecek */
    paddingBottom: theme.spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 20,
    minHeight: 60,
    backgroundColor: 'transparent',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },

  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },

  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  headerButtonBack: {
    backgroundColor: theme.colors.error,
    width: 37,
    height: 37,
    borderRadius: 8, // Rounded square
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 0,
  },

  headerButtonIconBack: {
    width: 16,
    height: 16,
    tintColor: theme.colors.white,
  },

  headerButton: {
    width: 37,
    height: 37,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: theme.spacing.md,
  },

  headerButtonCrimson: {
    backgroundColor: theme.colors.error,
    width: 37,
    height: 37,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 0,
  },

  headerButtonIcon: {
    width: 24,
    height: 24,
    resizeMode: 'contain',
    tintColor: theme.colors.white,
  },

  activeEditButton: {
    backgroundColor: theme.colors.error,
    borderRadius: 8,
  },

  editFieldButton: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: theme.colors.error,
    borderRadius: 6,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: theme.colors.white,
    shadowColor: theme.colors.error,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 6,
  },

  editFieldIcon: {
    width: 12,
    height: 12,
    tintColor: theme.colors.white,
  },

  editModeOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(220, 38, 38, 0.2)',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: theme.colors.error,
    borderStyle: 'dashed',
  },

  nameContainer: {
    position: 'relative',
  },

  aboutHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },


  editModeHeader: {
    marginHorizontal: theme.spacing.lg,
    marginVertical: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: theme.colors.error,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },

  editModeTitle: {
    color: theme.colors.white,
    fontSize: theme.fontSizes.lg,
    fontWeight: theme.fontWeights.bold,
    marginBottom: 4,
  },

  editModeSubtitle: {
    color: theme.colors.white,
    fontSize: theme.fontSizes.sm,
    opacity: 0.9,
  },

  cityList: {
    maxHeight: 300,
    marginVertical: theme.spacing.md,
  },

  cityItem: {
    padding: theme.spacing.md,
    marginVertical: 2,
    borderRadius: 8,
  },

  cityItemText: {
    fontSize: theme.fontSizes.md,
    fontWeight: theme.fontWeights.medium,
  },

  textInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: theme.spacing.md,
    fontSize: theme.fontSizes.md,
    marginVertical: theme.spacing.md,
  },

  textAreaInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: theme.spacing.md,
    fontSize: theme.fontSizes.md,
    marginVertical: theme.spacing.md,
    height: 120,
  },

  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },

  testButtonText: {
    fontSize: theme.fontSizes.xxl,
    color: theme.colors.white,
  },

  headerTitle: {
    fontSize: theme.fontSizes.xxxl,
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.primary,
    textAlign: 'center',
    marginLeft: 10, // Test butonu ile arasında boşluk
  },

  content: {
    flex: 1,
  },

  contentContainer: {
    flexGrow: 1,
    paddingHorizontal: theme.spacing.lg,
    // Üst boşluğu sıkılaştır: PortfolioList ile uyumlu
    paddingTop: theme.spacing.sm,
  },

  profileHeader: {
    marginBottom: 30,
  },

  profileMainContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.md,
    position: 'relative',
  },

  profileImageContainer: {
    position: 'relative',
    marginRight: theme.spacing.lg,
  },

  profileImage: {
    width: 120,
    height: 120,
    borderRadius: 16,
    borderWidth: 4,
    borderColor: theme.colors.primary,
  },

  editImageButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: theme.colors.primary,
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: theme.colors.white,
  },

  deleteImageButton: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    backgroundColor: theme.colors.error,
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: theme.colors.white,
  },

  editImageIcon: {
    width: 16,
    height: 16,
    resizeMode: 'contain',
    tintColor: theme.colors.white,
  },

  profileName: {
    fontSize: 28,
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.white,
    marginBottom: theme.spacing.sm,
    marginTop: 8,
  },

  profileInfoContainer: {
    flex: 1,
    alignItems: 'flex-start',
    marginTop: -10,
  },

  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.sm,
  },

  shareButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: theme.colors.error,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
    top: 0,
    right: 0,
  },

  shareIcon: {
    width: 20,
    height: 20,
    tintColor: theme.colors.white,
  },

  badgesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    width: '100%',
    alignSelf: 'stretch',
  },

  officeBadgeContainer: {
    position: 'relative',
    alignSelf: 'flex-start',
  },

  officeBadge: {
    backgroundColor: theme.colors.error,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },

  officeIcon: {
    width: 14,
    height: 14,
    marginRight: 6,
    tintColor: theme.colors.white,
  },

  officeBadgeText: {
    fontSize: theme.fontSizes.md,
    color: theme.colors.white,
    fontWeight: '600',
  },

  cityBadgeContainer: {
    position: 'relative',
    alignSelf: 'flex-start',
  },

  cityBadge: {
    backgroundColor: theme.colors.error,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },

  pinIcon: {
    width: 14,
    height: 14,
    marginRight: 6,
    tintColor: theme.colors.white,
  },

  cityBadgeText: {
    fontSize: theme.fontSizes.md,
    color: theme.colors.white,
    fontWeight: '600',
  },

  expertBadgeContainer: {
    alignItems: 'flex-start',
    marginBottom: theme.spacing.md,
    marginTop: theme.spacing.sm,
    alignSelf: 'stretch',
    width: '100%',
    flexBasis: '100%',
    flexGrow: 1,
  },

  expertBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  expertBadge: {
    backgroundColor: '#142331',
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: theme.colors.white,
    position: 'relative',
  },

  expertBadgeText: {
    fontSize: theme.fontSizes.md,
    color: theme.colors.white,
    fontWeight: '600',
  },

  badgeIcon: {
    width: 14,
    height: 14,
    tintColor: theme.colors.white,
    marginRight: 6,
  },

  mykBadge: {
    backgroundColor: '#142331',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: theme.colors.white,
    flexDirection: 'row',
    alignItems: 'center',
  },

  mykIcon: {
    width: 14,
    height: 14,
    marginRight: 4,
  },

  mykTickIcon: {
    width: 12,
    height: 12,
    tintColor: theme.colors.success,
  },

  mykSeparatorDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: theme.colors.white,
  },

  mykSeparator: {
    marginHorizontal: 5,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 1,
  },

  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: theme.spacing.md,
    gap: theme.spacing.md,
    width: '100%',
  },

  socialMediaBadgeContainer: {
    position: 'relative',
    flex: 0,
    flexShrink: 1,
  },

  socialMediaBadge: {
    flexDirection: 'row',
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 4,
    gap: theme.spacing.lg,
    backgroundColor: theme.colors.error,
    justifyContent: 'center',
    alignItems: 'center',
  },

  socialIconButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },

  socialIcon: {
    width: 20,
    height: 20,
    tintColor: theme.colors.white,
  },

  contactBadge: {
    flexDirection: 'row',
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.error,
    marginLeft: 'auto',
    marginRight: 0,
  },

  phoneButton: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    width: 52,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 40,
  },

  whatsappButton: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    width: 52,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 40,
  },

  contactIcon: {
    width: 18,
    height: 18,
    tintColor: theme.colors.white,
  },

  whatsappIcon: {
    width: 22,
    height: 20,
    tintColor: theme.colors.white,
  },

  divider: {
    height: 1,
    backgroundColor: theme.colors.error,
    marginHorizontal: 1,
    marginTop: 0,
    marginBottom: theme.spacing.lg,
    borderRadius: 1,
  },


  profileStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    backgroundColor: theme.colors.surface + 'CC',
    borderRadius: 15,
    padding: theme.spacing.lg,
    borderWidth: 0,
    shadowColor: theme.colors.surface + '1A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 1,
    marginBottom: theme.spacing.md,
  },

  // İstatistikler için özel konteyner - Glassmorphism
  statsContainer: {
    width: '100%',
    borderRadius: 15,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.borders.light,
    shadowColor: theme.colors.shadows.light,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 25,
    elevation: 0,
    zIndex: 1,
    minHeight: 80,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    marginBottom: theme.spacing.lg,
    flexDirection: 'row',
  },

  // İstatistik Container Wrapper
  statsContainerWrapper: {
    marginBottom: theme.spacing.md,
    alignSelf: 'flex-start',
    width: '60%',
    // borderRadius ve overflow artık GlassmorphismView tarafından yönetiliyor.
  },

  // İstatistik ve AI kutusu satırı
  statsRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 0,
  },

  // Yapay Zeka araçları küçük container
  aiToolsContainerWrapper: {
    marginBottom: theme.spacing.md,
    alignSelf: 'flex-start',
    width: '36%',
    minHeight: 74,
    marginTop: 3,
    justifyContent: 'center',
  },

  // İstatistik Content Wrapper
  statsContentWrapper: {
    padding: theme.spacing.lg,
    minHeight: 80,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  statItemsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 60,
  },

  // İstatistikler için neumorphism gradient (artık kullanılmıyor)

  // Section padding - Home.js ile aynı
  sectionPadding: {
    paddingHorizontal: 7,
    marginTop: 5,
    marginBottom: 10,
  },

  // Boş Container - Basit Glassmorphism Cam Efekti (Portföylerim ile aynı genişlik)
  emptyContainer: {
    width: '100%',
    borderRadius: 15,
    borderWidth: 1,
    borderColor: theme.colors.borders.light,
    shadowColor: theme.colors.shadows.light,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 25,
    elevation: 0,
    zIndex: 1,
    minHeight: 120,
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    overflow: 'hidden',
    position: 'relative',
    marginBottom: theme.spacing.lg,
  },

  // Açık mod neumorphism gradient efekti - Tema tabanlı (Portföylerim ile aynı genişlik)
  lightNeumorphismGradient: {
    ...createNeumorphismStyle(theme),
    width: '100%',
    backgroundColor: theme.colors.neumorphism.background,
    borderColor: theme.colors.card.border,
    shadowColor: theme.colors.neumorphism.dark,
    borderRadius: 15,
    minHeight: 120,
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    overflow: 'hidden',
    position: 'relative',
    zIndex: 1,
    marginBottom: theme.spacing.lg,
  },

  // Hakkında Gradient Style - Skia gradient için
  aboutGradientStyle: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 1,
  },

  // Hakkında Container - Ana wrapper
  aboutContainer: {
    marginBottom: theme.spacing.lg,
    // borderRadius ve overflow artık GlassmorphismView tarafından yönetiliyor.
  },

  // Profilime Git butonu alanı
  goProfileWrapper: {
    paddingHorizontal: 0,
    paddingRight: 0,
    marginBottom: 0,
    marginHorizontal: 0,
    width: '100%',
    alignSelf: 'stretch',
    alignItems: 'flex-start',
  },
  goProfileButton: {
    borderRadius: 8,
    width: '100%',
    alignSelf: 'flex-start',
  },
  goProfileButtonContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    paddingVertical: 12,
  },
  goProfileButtonText: {
    fontWeight: theme.fontWeights.bold,
    fontSize: 14,
  },
  goProfileIcon: {
    width: 16,
    height: 16,
    tintColor: theme.colors.white,
    marginLeft: 8,
    transform: [{ scaleX: -1 }],
  },

  // Hakkında Content Wrapper - İçerik için wrapper
  aboutContentWrapper: {
    padding: theme.spacing.lg,
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    minHeight: 120,
  },

  aboutSection: {
    width: '100%',
    backgroundColor: theme.colors.surface + 'CC',
    borderRadius: 15,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.borders.light,
    shadowColor: theme.colors.shadows.light,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 25,
    elevation: 10,
    marginBottom: theme.spacing.lg,
    overflow: 'hidden',
    position: 'relative',
    zIndex: 2,
  },

  aboutTitle: {
    fontSize: theme.fontSizes.lg,
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.white,
    marginBottom: theme.spacing.sm,
  },

  aboutText: {
    fontSize: theme.fontSizes.md,
    color: theme.colors.white,
    fontStyle: 'italic',
    lineHeight: 22,
  },


  // 🎯 Profil Filtreleme Stilleri
  portfoliosHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },

  portfoliosTitle: {
    fontSize: theme.fontSizes.lg,
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.white,
    flex: 1,
  },

  // PortfolioList'ten alınan stiller
  listContainer: {
    paddingHorizontal: 0,
    paddingVertical: 0,
    paddingBottom: 0,
    backgroundColor: 'transparent',
  },

  portfoliosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 0,
  },

  portfolioCardContainer: {
    width: '48%',
    marginBottom: theme.spacing.md,
  },


  filterButton: {
    backgroundColor: theme.colors.error,
    borderRadius: 8,
    width: 36,
    height: 36,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },

  filterButtonActive: {
    backgroundColor: theme.colors.primary,
  },

  filterButtonIcon: {
    width: 18,
    height: 18,
    tintColor: theme.colors.white,
  },

  filterBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: theme.colors.error,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 5,
  },

  filterBadgeText: {
    color: theme.colors.white,
    fontSize: 11,
    fontWeight: theme.fontWeights.bold,
  },

  clearFiltersButton: {
    backgroundColor: theme.colors.error + '20',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: theme.spacing.sm,
    alignSelf: 'flex-start',
  },

  clearFiltersText: {
    color: theme.colors.error,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.semiBold,
  },

  clearFiltersButtonInline: {
    backgroundColor: theme.colors.primary,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginTop: theme.spacing.md,
  },

  clearFiltersTextInline: {
    color: theme.colors.white,
    fontSize: theme.fontSizes.md,
    fontWeight: theme.fontWeights.semiBold,
  },

  loadingPortfolios: {
    alignItems: 'center',
    paddingVertical: theme.spacing.xl,
  },


  portfolioItem: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface + '40',
    borderRadius: 12,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    alignItems: 'center',
  },

  portfolioImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
    marginRight: theme.spacing.md,
  },

  portfolioInfo: {
    flex: 1,
    justifyContent: 'center',
  },

  portfolioTitle: {
    fontSize: theme.fontSizes.md,
    fontWeight: theme.fontWeights.semiBold,
    color: theme.colors.white,
    marginBottom: 4,
  },

  portfolioLocation: {
    fontSize: theme.fontSizes.sm,
    color: theme.colors.white + 'CC',
    marginBottom: 4,
  },

  portfolioPrice: {
    fontSize: theme.fontSizes.md,
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.error,
  },

  emptyPortfolios: {
    alignItems: 'center',
    paddingVertical: theme.spacing.xl,
  },

  emptyPortfoliosText: {
    fontSize: theme.fontSizes.md,
    color: theme.colors.white + 'CC',
    fontStyle: 'italic',
  },

  modalTextInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 20,
    minHeight: 50,
  },

  socialInputContainer: {
    marginBottom: 16,
  },

  socialLabel: {
    fontSize: 16,
    fontWeight: theme.fontWeights.semiBold,
    marginBottom: 8,
  },

  socialTextInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    minHeight: 50,
  },

  imagePreviewContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },

  imagePreview: {
    width: 120,
    height: 120,
    borderRadius: 16,
    borderWidth: 4,
    borderColor: theme.colors.primary,
  },

  imageOptions: {
    marginBottom: 20,
  },

  imageOptionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    gap: 8,
  },

  imageOptionIcon: {
    width: 20,
    height: 20,
    tintColor: theme.colors.white,
  },

  imageOptionText: {
    fontSize: 16,
    fontWeight: theme.fontWeights.semiBold,
  },

  expertList: {
    maxHeight: 300,
    marginBottom: 20,
  },

  expertItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 8,
  },

  expertItemText: {
    fontSize: 16,
    fontWeight: theme.fontWeights.medium,
  },

  editModeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
  },

  editModeText: {
    fontSize: 14,
    fontWeight: theme.fontWeights.semiBold,
  },

  shareLinkContainer: {
    marginBottom: 20,
  },

  shareLinkLabel: {
    fontSize: 16,
    fontWeight: theme.fontWeights.semiBold,
    marginBottom: 8,
  },

  shareLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  shareLinkBox: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },

  shareLinkText: {
    fontSize: 14,
    fontFamily: 'monospace',
  },

  editLinkButton: {
    width: 44,
    height: 44,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },

  editLinkIcon: {
    width: 20,
    height: 20,
    tintColor: theme.colors.white,
  },

  shareButtons: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },

  shareButtonOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 8,
  },

  shareButtonIcon: {
    width: 20,
    height: 20,
    tintColor: theme.colors.white,
  },

  shareButtonText: {
    fontSize: 16,
    fontWeight: theme.fontWeights.semiBold,
  },

  modalInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 8,
  },

  errorText: {
    fontSize: 14,
    marginBottom: 8,
  },

  helpText: {
    fontSize: 12,
    marginBottom: 20,
  },

  statItem: {
    alignItems: 'center',
  },

  statNumber: {
    fontSize: theme.fontSizes.xxl,
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.white,
  },

  statLabel: {
    fontSize: 12,
    color: theme.colors.text.secondary,
    marginTop: 4,
    textAlign: 'center',
  },

  section: {
    marginBottom: 20,
  },

  sectionTitle: {
    fontSize: theme.fontSizes.xxl,
    fontWeight: theme.fontWeights.semibold,
    color: theme.colors.white,
    marginBottom: theme.spacing.md,
  },


  // Loading styles
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  loadingText: {
    fontSize: theme.fontSizes.xxl,
    color: theme.colors.text.primary,
    textAlign: 'center',
  },


  // Modal Stilleri
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  modalContent: {
    backgroundColor: theme.colors.surface + 'E6',
    borderRadius: 15,
    padding: 20,
    width: '80%',
    maxWidth: 300,
    borderWidth: 0,
  },

  // Share action modal (tasks modal style)
  shareActionModalContent: {
    width: '90%',
    maxWidth: 360,
    padding: 22,
  },

  // Animated wrapper to preserve original width calculations (child uses %)
  shareActionModalWrapper: {
    width: '100%',
    alignItems: 'center',
  },

  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.white,
    textAlign: 'center',
    lineHeight: 18,
  },

  modalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },

  modalTitleIcon: {
    width: 20,
    height: 20,
    tintColor: '#DC143C',
    marginRight: 8,
  },

  modalButton: {
    backgroundColor: theme.colors.primary + '99',
    borderRadius: 12,
    padding: 15,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },

  modalButtonIcon: {
    fontSize: 20,
    marginRight: 10,
  },

  modalButtonText: {
    color: theme.colors.white,
    fontSize: 16,
    fontWeight: '600',
  },

  modalCancelButton: {
    backgroundColor: theme.colors.white + '1A',
    borderRadius: 12,
    padding: 15,
    marginTop: 10,
    alignItems: 'center',
  },

  modalCancelButtonText: {
    color: theme.colors.white,
    fontSize: 16,
    fontWeight: '500',
  },

  // Başarı Modal Stilleri
  successModalContent: {
    margin: 20,
    padding: 30,
    borderRadius: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },

  successIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#4CAF50',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },

  successIcon: {
    fontSize: 30,
    color: 'white',
    fontWeight: 'bold',
  },

  successTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },

  successMessage: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 10,
    fontWeight: '600',
  },

  successFieldItem: {
    fontSize: 14,
    textAlign: 'left',
    lineHeight: 20,
    marginVertical: 2,
    paddingLeft: 10,
  },

  // Hızlı tost modalı stilleri
  quickModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickModalContainer: {
    width: '90%',
    padding: 28,
    alignItems: 'center',
    overflow: 'hidden',
  },
  quickModalText: {
    fontSize: 16,
    color: 'white',
    textAlign: 'center',
    lineHeight: 22,
  },

  // Yeni gradient-free stiller
  statsContainer: {
    // Bu stil artık kullanılmıyor ve silindi.
  },

  aboutCard: {
    // Bu stil artık kullanılmıyor ve silindi.
  },

  portfolioContainer: {
    // Görsel stiller (arkaplan, border, shadow) kaldırıldı.
    // Sadece düzeni sağlayan padding ve margin bırakıldı.
    borderRadius: 15,
    marginBottom: 20,
    padding: 20,
  },

});

export default Profile;
