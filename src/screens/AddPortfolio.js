import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
  Switch,
  FlatList,
  Animated,
  PermissionsAndroid,
  Platform,
  AppState,
  KeyboardAvoidingView,
  Image,
  ImageBackground,
  PanResponder,
  Linking,
  Easing,
  BackHandler,
  DeviceEventEmitter,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ImagePicker from 'react-native-image-crop-picker';
import MapboxGL from '@rnmapbox/maps';
import { MAPBOX_PUBLIC_TOKEN } from '@env';

// Mapbox token'ı .env dosyasından oku
MapboxGL.setAccessToken(MAPBOX_PUBLIC_TOKEN);
import Geolocation from '@react-native-community/geolocation';
import { useNavigation, CommonActions } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { addPortfolio } from '../services/firestore';
import GlassmorphismView from '../components/GlassmorphismView';
import { useFocusEffect } from '@react-navigation/native';
import * as Animatable from 'react-native-animatable';

// Mapbox global olarak App.js'de başlatılır (token .env'den okunur)
import { turkeyDistricts, districtCoordinates } from '../data/turkeyDistricts';

const DRAFT_STORAGE_KEY = 'talepify.draft.portfolios';

const AddPortfolio = ({ route }) => {
  const navigation = useNavigation();
  const { user, userProfile } = useAuth();
  const { theme, isDark } = useTheme();
  const styles = createStyles(theme, isDark);
  const insets = useSafeAreaInsets();

  // Draft modu ve verileri için state'ler
  const isDraftMode = route?.params?.isDraftMode || false;
  const [draftId, setDraftId] = useState(null);
  
  // Geri dönülecek ekran bilgisi
  const previousScreen = route?.params?.previousScreen || 'Ana Sayfa';

  // Seçim ekranı için state
  const [selectedPortfolioType, setSelectedPortfolioType] = useState('new');

  // Kullanıcı konumu için state
  const [userLocation, setUserLocation] = useState(null);
  const [locationPermissionGranted, setLocationPermissionGranted] = useState(false);
  
  // Konum tooltip için state
  const [showLocationTooltip, setShowLocationTooltip] = useState(false);
  const tooltipOpacity = useRef(new Animated.Value(0)).current;
  
  // Pin boyutları için state (animasyon yok)
  const [selectedPinSize] = useState(0.12);
  const [userPinSize] = useState(0.12);

  // Türkiye dışındaki alanı maskelemek için GeoJSON
  const turkeyMaskGeoJson = useMemo(() => {
    // Dünya koordinatları (dış çerçeve)
    const worldBounds = [
      [-180, -90], [180, -90], [180, 90], [-180, 90], [-180, -90]
    ];
    
    // Türkiye sınırları (iç delik - basitleştirilmiş)
    const turkeyBounds = [
      [25.5, 35.8], // Güneybatı
      [44.8, 35.8], // Güneydoğu
      [44.8, 42.1], // Kuzeydoğu
      [25.5, 42.1], // Kuzeybatı
      [25.5, 35.8], // Kapalı polygon
    ];

    return {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          // İlk array dış sınır, ikinci array iç delik (Türkiye)
          coordinates: [worldBounds, turkeyBounds],
        },
        properties: {},
      }],
    };
  }, []);

  // Pin animasyon fonksiyonları kaldırıldı - animasyon yok

  const [formData, setFormData] = useState({
    title: '',
    city: userProfile?.city || 'Samsun',
    district: '',
    address: '',
    hideLocation: false,
    price: '',
    netSquareMeters: '',
    grossSquareMeters: '',
    roomCount: '',
    bathroomCount: '',
    balconyCount: '',
    buildingAge: '',
    floor: '',
    totalFloors: '',
    kitchenType: 'Kapalı Mutfak',
    heatingType: 'Doğalgaz',
    parentBathroom: false,
    parking: false,
    glassBalcony: false,
    wardrobe: false,
    furnished: false,
    usageStatus: 'Boş',
    exchange: false,
    deedStatus: 'İskan Mevcut',
    creditLimit: '',
    dues: '',
    deposit: '',
    propertyType: '',
    listingStatus: '',
    description: '',
    features: '',
    ownerName: '',
    ownerSurname: '',
    ownerPhone: '',
    doorCode: '',
    keyLocation: '',
    specialNote: '',
    images: [],
    isPublished: true,
  });

  const getInitialFormData = useCallback(() => ({
    title: '',
    city: userProfile?.city || 'Samsun',
    district: '',
    address: '',
    hideLocation: false,
    price: '',
    netSquareMeters: '',
    grossSquareMeters: '',
    roomCount: '',
    bathroomCount: '',
    balconyCount: '',
    buildingAge: '',
    floor: '',
    totalFloors: '',
    kitchenType: 'Kapalı Mutfak',
    heatingType: 'Doğalgaz',
    parentBathroom: false,
    parking: false,
    glassBalcony: false,
    wardrobe: false,
    furnished: false,
    usageStatus: 'Boş',
    exchange: false,
    deedStatus: 'İskan Mevcut',
    creditLimit: '',
    dues: '',
    deposit: '',
    propertyType: '',
    listingStatus: '',
    description: '',
    features: '',
    ownerName: '',
    ownerSurname: '',
    ownerPhone: '',
    doorCode: '',
    keyLocation: '',
    specialNote: '',
    images: [],
    isPublished: true,
  }), [userProfile?.city]);

  const resetFormState = useCallback(() => {
    setFormData(getInitialFormData());
    setCurrentStep(1);
    setSelectedImages([]);
    setFeaturedImageIndex(0);
    setDraftId(null);
    setSelectedLocation(null);
  }, [getInitialFormData]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showNeighborhoodPicker, setShowNeighborhoodPicker] = useState(false);
  const [showCityPicker, setShowCityPicker] = useState(false);
  const [showRoomCountPicker, setShowRoomCountPicker] = useState(false);
  const [showDistrictPicker, setShowDistrictPicker] = useState(false);
  const [showAgePicker, setShowAgePicker] = useState(false);
  const [showBathroomPicker, setShowBathroomPicker] = useState(false);
  const [showBalconyPicker, setShowBalconyPicker] = useState(false);
  const [showTotalFloorPicker, setShowTotalFloorPicker] = useState(false);
  const [showCurrentFloorPicker, setShowCurrentFloorPicker] = useState(false);
  const [showNetSquareMetersPicker, setShowNetSquareMetersPicker] = useState(false);
  const [showGrossSquareMetersPicker, setShowGrossSquareMetersPicker] = useState(false);
  const [showDuesPicker, setShowDuesPicker] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [showClearAllModal, setShowClearAllModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showPropertiesSection, setShowPropertiesSection] = useState(false);

  // Resim yönetimi için state'ler
  const [selectedImages, setSelectedImages] = useState([]);
  // Page transition animation (match Profile/Home)
  const pageViewRef = useRef(null);
  const customEnterAnimation = {
    from: { opacity: 0 },
    to: { opacity: 1 },
  };
  const customExitAnimation = {
    from: { opacity: 1 },
    to: { opacity: 1 },
  };

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
    }, [])
  );
  const [showImagePreview, setShowImagePreview] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  const [featuredImageIndex, setFeaturedImageIndex] = useState(0);
  const [isUploadingImages, setIsUploadingImages] = useState(false);
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [phaseImagesDone, setPhaseImagesDone] = useState(false);
  const [phaseDataDone, setPhaseDataDone] = useState(false);
  const [phaseShareDone, setPhaseShareDone] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [createdPortfolio, setCreatedPortfolio] = useState(null);
  // Picker open animation (shared)
  const pickerFadeAnim = useRef(new Animated.Value(0)).current;
  const pickerTranslateY = useRef(new Animated.Value(16)).current;
  const pickerScale = useRef(new Animated.Value(0.97)).current;
  const pickerItemHeight = 48;
  const getPickerLayout = useCallback((_, index) => ({ length: pickerItemHeight, offset: pickerItemHeight * index, index }), []);

  // Kamera çekim modu için state'ler
  const [showCameraMode, setShowCameraMode] = useState(false);
  const [cameraImages, setCameraImages] = useState([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isContinuousMode, setIsContinuousMode] = useState(false);
  const isContinuousModeRef = useRef(false);
  const captureTimeoutRef = useRef(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  
  // Taslak uyarı modalı için state'ler
  const [showDraftWarningModal, setShowDraftWarningModal] = useState(false);
  const [existingDrafts, setExistingDrafts] = useState([]);


  // Wizard sistemi için state'ler
  const [currentStep, setCurrentStep] = useState(1);
  const isInitialMount = useRef(true);
  const isSaving = useRef(false);
  const disableAutoDraftSaveRef = useRef(false);
  const allowLeaveRef = useRef(false);
  const [showLeaveConfirmModal, setShowLeaveConfirmModal] = useState(false);
  const pendingNavActionRef = useRef(null);
  const pendingNavTargetTabRef = useRef(null);

  // Odaklanınca çıkış kontrol bayraklarını sıfırla
  useEffect(() => {
    const unsub = navigation.addListener('focus', () => {
      allowLeaveRef.current = false;
      pendingNavActionRef.current = null;
      pendingNavTargetTabRef.current = null;
    });
    return unsub;
  }, [navigation]);

  // State'in en güncel halini tutacak referanslar
  const stateRef = useRef({
    formData,
    currentStep,
    selectedImages,
    featuredImageIndex,
    draftId,
  });

  useEffect(() => {
    stateRef.current = {
      formData,
      currentStep,
      selectedImages,
      featuredImageIndex,
      draftId,
    };
  }, [formData, currentStep, selectedImages, featuredImageIndex, draftId]);

  // Form alanları için referanslar
  const titleRef = useRef(null);
  const priceRef = useRef(null);
  const [totalSteps] = useState(6);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const slideYAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const bounceAnim = useRef(new Animated.Value(0)).current;
  const slideXAnim = useRef(new Animated.Value(0)).current;
  const propertiesAnimation = useRef(new Animated.Value(0)).current;

  const anyPickerVisible = (
    showCityPicker || showRoomCountPicker || showDistrictPicker || showNeighborhoodPicker ||
    showAgePicker || showBathroomPicker || showBalconyPicker || showTotalFloorPicker ||
    showCurrentFloorPicker || showNetSquareMetersPicker || showGrossSquareMetersPicker || showDuesPicker
  );

  useEffect(() => {
    if (anyPickerVisible) {
      pickerFadeAnim.stopAnimation();
      pickerTranslateY.stopAnimation();
      pickerScale.stopAnimation();
      pickerFadeAnim.setValue(0);
      pickerTranslateY.setValue(2);
      pickerScale.setValue(0.97);
      Animated.parallel([
        Animated.timing(pickerFadeAnim, { toValue: 1, duration: 22, useNativeDriver: true }),
        Animated.timing(pickerTranslateY, { toValue: 0, duration: 26, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.spring(pickerScale, { toValue: 1, stiffness: 320, damping: 26, mass: 1, useNativeDriver: true })
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(pickerFadeAnim, { toValue: 0, duration: 18, useNativeDriver: true }),
        Animated.timing(pickerTranslateY, { toValue: 2, duration: 24, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
        Animated.timing(pickerScale, { toValue: 0.985, duration: 20, easing: Easing.inOut(Easing.ease), useNativeDriver: true })
      ]).start();
    }
  }, [anyPickerVisible, pickerFadeAnim, pickerTranslateY, pickerScale]);

  // Pin animasyon useEffect'i kaldırıldı - animasyon yok

  // İlçe seçildiğinde haritayı odakla (Türkiye geneli)
  useEffect(() => {
    if (formData.district && cameraRef.current) {
      // Yeni koordinat sisteminden kontrol et
      let coords = districtCoordinates[formData.district];
      
      // Eğer bulunamazsa veya 'Merkez' ilçesiyse şehir merkezine odaklan
      if (!coords || (coords[0] === 0 && coords[1] === 0) || formData.district === 'Merkez') {
        const cityCoordinates = {
          'İstanbul': [28.9784, 41.0082],
          'Ankara': [32.8597, 39.9334],
          'İzmir': [27.1428, 38.4192],
          'Bursa': [29.0610, 40.1826],
          'Antalya': [30.7133, 36.8969],
          'Adana': [35.3213, 37.0000],
          'Konya': [32.4816, 37.8667],
          'Gaziantep': [37.3828, 37.0662],
          'Mersin': [34.6415, 36.8000],
          'Kayseri': [35.4787, 38.7312],
          'Eskişehir': [30.5206, 39.7767],
          'Diyarbakır': [40.2181, 37.9144],
          'Samsun': [36.2871, 41.2928],
          'Denizli': [29.0875, 37.7765],
          'Şanlıurfa': [38.7969, 37.1674],
          'Adapazarı': [30.4037, 40.7589],
          'Malatya': [38.3552, 38.3095],
          'Kahramanmaraş': [36.9267, 37.5858],
          'Erzurum': [41.2769, 39.9208],
          'Van': [43.4089, 38.4891],
          'Batman': [41.1351, 37.8812],
          'Elazığ': [39.2264, 38.6810],
          'İzmit': [29.9167, 40.7654],
          'Manisa': [27.4305, 38.6191],
          'Sivas': [37.0179, 39.7477],
          'Gebze': [29.4173, 40.8027],
          'Balıkesir': [27.8826, 39.6484],
          'Tarsus': [34.8815, 36.9177],
          'Kütahya': [29.9833, 39.4167],
          'Trabzon': [39.7168, 41.0015],
          'Çorum': [34.9249, 40.5506],
          'Adıyaman': [38.2786, 37.7648],
          'Osmaniye': [36.2474, 37.0742],
          'Kırıkkale': [33.5153, 39.8468],
          'Antakya': [36.1612, 36.2012],
          'Aydın': [27.8416, 37.8560],
          'İskenderun': [36.1744, 36.5877],
          'Uşak': [29.4058, 38.6823],
          'Düzce': [31.1565, 40.8438],
          'Isparta': [30.5566, 37.7648],
          'Çanakkale': [26.4142, 40.1553],
          'Afyon': [30.5387, 38.7507],
          'Zonguldak': [31.7987, 41.4564],
          'Karaman': [33.2287, 37.1759],
          'Kırşehir': [34.1709, 39.1425],
          'Bartın': [32.3375, 41.5811],
          'Edirne': [26.5557, 41.6818],
          'Kars': [40.6013, 40.6167],
          'Muğla': [28.3665, 37.2153],
          'Tekirdağ': [27.5109, 40.9833],
          'Ordu': [37.8764, 40.9839],
          'Giresun': [38.3895, 40.9128],
          'Bolu': [31.6061, 40.7394],
          'Nevşehir': [34.6857, 38.6939],
          'Sinop': [35.1530, 42.0231],
          'Kırklareli': [27.2167, 41.7333],
          'Yozgat': [34.8147, 39.8181],
          'Rize': [40.5234, 41.0201],
          'Niğde': [34.6857, 37.9667],
          'Aksaray': [34.0254, 38.3687],
          'Kastamonu': [33.7827, 41.3887],
          'Çankırı': [33.6134, 40.6013],
          'Amasya': [35.8353, 40.6499],
          'Tokat': [36.5544, 40.3167],
          'Artvin': [41.8183, 41.1828],
          'Bilecik': [29.9833, 40.1167],
          'Burdur': [30.2906, 37.7267],
          'Karabük': [32.6204, 41.2061],
          'Yalova': [29.2769, 40.6500],
          'Ardahan': [42.7022, 41.1105],
          'Iğdır': [44.0450, 39.8880],
          'Şırnak': [42.4918, 37.4187],
          'Mardin': [40.7245, 37.3212],
          'Muş': [41.7539, 38.9462],
          'Bingöl': [40.7696, 38.8846],
          'Solhan': [41.0492, 38.9689],
          'Bitlis': [42.1232, 38.4011],
          'Hakkari': [43.7333, 37.5833],
          'Siirt': [41.9594, 37.9333],
          'Tunceli': [39.5401, 39.1079],
          'Bayburt': [40.2552, 40.2552]
        };
        coords = cityCoordinates[formData.city] || [36.2871, 41.2928];
      }

      if (coords) {
        cameraRef.current.setCamera({
          centerCoordinate: coords,
          zoomLevel: 12,
          animationDuration: 1000,
        });
      }
    }
  }, [formData.district]);

  // Wizard navigation fonksiyonları
  const goToNextStep = () => {
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
    }
  };

  const goToPreviousStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const mapRef = useRef(null);
  const cameraRef = useRef(null);
  const initialCameraSet = useRef(false);

  // Tamamlanma yüzdesini hesapla (sahip bilgileri hariç)
  const computeCompletionPercent = () => {
    const includedKeys = [
      'title',
      'city',
      'district',
      'address',
      'price',
      'netSquareMeters',
      'grossSquareMeters',
      'roomCount',
      'bathroomCount',
      'balconyCount',
      'buildingAge',
      'floor',
      'totalFloors',
      'kitchenType',
      'heatingType',
      'usageStatus',
      'deedStatus',
      'creditLimit',
      'dues',
      'deposit',
      'propertyType',
      'listingStatus',
      'description',
      'features',
    ];

    // Konum ve görselleri ayrı alan olarak say
    let total = includedKeys.length + 2; // +location, +images
    let filled = 0;

    includedKeys.forEach((key) => {
      const value = formData[key];
      if (typeof value === 'string') {
        if (value.trim().length > 0) filled += 1;
      } else if (typeof value === 'number') {
        if (!Number.isNaN(value)) filled += 1;
      }
    });

    // Lokasyon: city/district dışında seçilmiş konum var mı?
    if (selectedLocation && selectedLocation.latitude && selectedLocation.longitude) {
      filled += 1;
    }

    // Görseller: seçilmiş görsel var mı?
    if (selectedImages && selectedImages.length > 0) {
      filled += 1;
    }

    const percent = Math.max(0, Math.min(100, Math.round((filled / total) * 100)));
    return percent;
  };

  // Türkiye şehir listesi
  const cities = [
    'Adana', 'Adıyaman', 'Afyonkarahisar', 'Ağrı', 'Amasya', 'Ankara', 'Antalya', 'Artvin', 'Aydın', 'Balıkesir',
    'Bilecik', 'Bingöl', 'Bitlis', 'Bolu', 'Burdur', 'Bursa', 'Çanakkale', 'Çankırı', 'Çorum', 'Denizli',
    'Diyarbakır', 'Edirne', 'Elazığ', 'Erzincan', 'Erzurum', 'Eskişehir', 'Gaziantep', 'Giresun', 'Gümüşhane', 'Hakkari',
    'Hatay', 'Isparta', 'Mersin', 'İstanbul', 'İzmir', 'Kars', 'Kastamonu', 'Kayseri', 'Kırklareli', 'Kırşehir',
    'Kocaeli', 'Konya', 'Kütahya', 'Malatya', 'Manisa', 'Kahramanmaraş', 'Mardin', 'Muğla', 'Muş', 'Nevşehir',
    'Niğde', 'Ordu', 'Rize', 'Sakarya', 'Samsun', 'Siirt', 'Sinop', 'Sivas', 'Tekirdağ', 'Tokat',
    'Trabzon', 'Tunceli', 'Şanlıurfa', 'Uşak', 'Van', 'Yozgat', 'Zonguldak', 'Aksaray', 'Bayburt', 'Karaman',
    'Kırıkkale', 'Batman', 'Şırnak', 'Bartın', 'Ardahan', 'Iğdır', 'Yalova', 'Karabük', 'Kilis', 'Osmaniye',     'Düzce',
  ];


  // Portföy tipi seçenekleri (müstakil ev kaldırıldı)
  const propertyTypes = [
    { value: 'Daire', label: 'Daire' },
    { value: 'Villa', label: 'Villa' },
    { value: 'İş Yeri', label: 'İş Yeri' },
    { value: 'Arsa', label: 'Arsa' },
  ];

  // Oda sayısı seçenekleri
  const roomCounts = [
    '1+0', '1+1', '2+0', '2+1', '3+0', '3+1', '4+1', '5+1', '6+1',
  ];

  // Mutfak tipi seçenekleri
  const kitchenTypes = [
    { value: 'Kapalı Mutfak', label: 'Kapalı Mutfak' },
    { value: 'Amerikan Mutfak', label: 'Amerikan Mutfak' },
  ];

  // Isıtma tipi seçenekleri
  const heatingTypes = [
    { value: 'Doğalgaz', label: 'Doğalgaz' },
    { value: 'Katı Yakıt', label: 'Katı Yakıt' },
    { value: 'Merkezi Sistem', label: 'Merkezi' },
  ];

  // Bina yaşı seçenekleri (1-50, 50+)
  const ageOptions = useMemo(() => {
    const options = [];
    for (let i = 1; i <= 50; i++) {
      options.push({ value: i.toString(), label: i.toString() });
    }
    options.push({ value: '50+', label: '50+' });
    return options;
  }, []);

  // Banyo sayısı seçenekleri (1-10)
  const bathroomOptions = useMemo(() => {
    const options = [];
    for (let i = 1; i <= 10; i++) {
      options.push({ value: i.toString(), label: i.toString() });
    }
    return options;
  }, []);

  // Balkon sayısı seçenekleri (1-10)
  const balconyOptions = useMemo(() => {
    const options = [];
    for (let i = 1; i <= 10; i++) {
      options.push({ value: i.toString(), label: i.toString() });
    }
    return options;
  }, []);

  // Toplam kat sayısı seçenekleri (1-100)
  const totalFloorOptions = useMemo(() => {
    const options = [];
    for (let i = 1; i <= 100; i++) {
      options.push({ value: i.toString(), label: i.toString() });
    }
    return options;
  }, []);

  // Bulunduğu kat seçenekleri (1-100)
  const currentFloorOptions = useMemo(() => {
    const options = [];
    for (let i = 1; i <= 100; i++) {
      options.push({ value: i.toString(), label: i.toString() });
    }
    return options;
  }, []);

  // Net M² seçenekleri (20-500)
  const netSquareMetersOptions = useMemo(() => {
    const options = [];
    for (let i = 20; i <= 500; i += 5) {
      options.push({ value: i.toString(), label: i.toString() });
    }
    return options;
  }, []);

  // Brüt M² seçenekleri (25-600)
  const grossSquareMetersOptions = useMemo(() => {
    const options = [];
    for (let i = 25; i <= 600; i += 5) {
      options.push({ value: i.toString(), label: i.toString() });
    }
    return options;
  }, []);

  // Aidat seçenekleri (0-10000)
  const duesOptions = useMemo(() => {
    const options = [];
    options.push({ value: '0', label: '0' });
    for (let i = 100; i <= 10000; i += 100) {
      options.push({ value: i.toString(), label: i.toString() });
    }
    return options;
  }, []);

  // Kullanım durumu seçenekleri
  const usageStatuses = [
    { value: 'Boş', label: 'Boş' },
    { value: 'Kiracı', label: 'Kiracı' },
    { value: 'Mülk Sahibi', label: 'Mülk Sahibi' },
  ];

  // Tapu durumu seçenekleri
  const deedStatuses = [
    { value: 'İskan Mevcut', label: 'İskanlı' },
    { value: 'İskan Mevcut Değil', label: 'İskansız' },
    { value: 'Arsa Payı', label: 'Arsa Payı' },
  ];
  // Samsun mahalleleri ve gerçek sınırları
  const neighborhoods = [
    {
      name: 'Mevlana Mahallesi',
      coordinates: { latitude: 41.28, longitude: 36.33 },
      boundaries: [
        { latitude: 41.285, longitude: 36.325 },
        { latitude: 41.287, longitude: 36.327 },
        { latitude: 41.289, longitude: 36.329 },
        { latitude: 41.290, longitude: 36.331 },
        { latitude: 41.291, longitude: 36.333 },
        { latitude: 41.290, longitude: 36.335 },
        { latitude: 41.289, longitude: 36.337 },
        { latitude: 41.288, longitude: 36.338 },
        { latitude: 41.286, longitude: 36.339 },
        { latitude: 41.284, longitude: 36.340 },
        { latitude: 41.282, longitude: 36.340 },
        { latitude: 41.280, longitude: 36.339 },
        { latitude: 41.278, longitude: 36.338 },
        { latitude: 41.276, longitude: 36.336 },
        { latitude: 41.275, longitude: 36.334 },
        { latitude: 41.274, longitude: 36.332 },
        { latitude: 41.273, longitude: 36.330 },
        { latitude: 41.272, longitude: 36.328 },
        { latitude: 41.273, longitude: 36.326 },
        { latitude: 41.275, longitude: 36.324 },
        { latitude: 41.277, longitude: 36.323 },
        { latitude: 41.279, longitude: 36.322 },
        { latitude: 41.281, longitude: 36.323 },
        { latitude: 41.283, longitude: 36.324 },
        { latitude: 41.285, longitude: 36.325 },
      ],
    },
    {
      name: 'Atakent Mahallesi',
      coordinates: { latitude: 41.27, longitude: 36.34 },
      boundaries: [
        { latitude: 41.275, longitude: 36.330 },
        { latitude: 41.277, longitude: 36.332 },
        { latitude: 41.279, longitude: 36.334 },
        { latitude: 41.280, longitude: 36.336 },
        { latitude: 41.281, longitude: 36.338 },
        { latitude: 41.280, longitude: 36.340 },
        { latitude: 41.279, longitude: 36.342 },
        { latitude: 41.278, longitude: 36.344 },
        { latitude: 41.276, longitude: 36.346 },
        { latitude: 41.274, longitude: 36.347 },
        { latitude: 41.272, longitude: 36.348 },
        { latitude: 41.270, longitude: 36.347 },
        { latitude: 41.268, longitude: 36.346 },
        { latitude: 41.266, longitude: 36.344 },
        { latitude: 41.265, longitude: 36.342 },
        { latitude: 41.264, longitude: 36.340 },
        { latitude: 41.263, longitude: 36.338 },
        { latitude: 41.262, longitude: 36.336 },
        { latitude: 41.263, longitude: 36.334 },
        { latitude: 41.264, longitude: 36.332 },
        { latitude: 41.266, longitude: 36.331 },
        { latitude: 41.268, longitude: 36.330 },
        { latitude: 41.270, longitude: 36.329 },
        { latitude: 41.272, longitude: 36.329 },
        { latitude: 41.274, longitude: 36.330 },
        { latitude: 41.275, longitude: 36.330 },
      ],
    },
    {
      name: 'Kurupelit Mahallesi',
      coordinates: { latitude: 41.26, longitude: 36.35 },
      boundaries: [
        { latitude: 41.265, longitude: 36.340 },
        { latitude: 41.267, longitude: 36.342 },
        { latitude: 41.269, longitude: 36.344 },
        { latitude: 41.270, longitude: 36.346 },
        { latitude: 41.269, longitude: 36.348 },
        { latitude: 41.268, longitude: 36.350 },
        { latitude: 41.267, longitude: 36.352 },
        { latitude: 41.265, longitude: 36.354 },
        { latitude: 41.263, longitude: 36.356 },
        { latitude: 41.261, longitude: 36.357 },
        { latitude: 41.259, longitude: 36.358 },
        { latitude: 41.257, longitude: 36.357 },
        { latitude: 41.255, longitude: 36.356 },
        { latitude: 41.254, longitude: 36.354 },
        { latitude: 41.253, longitude: 36.352 },
        { latitude: 41.252, longitude: 36.350 },
        { latitude: 41.253, longitude: 36.348 },
        { latitude: 41.254, longitude: 36.346 },
        { latitude: 41.256, longitude: 36.344 },
        { latitude: 41.258, longitude: 36.342 },
        { latitude: 41.260, longitude: 36.341 },
        { latitude: 41.262, longitude: 36.340 },
        { latitude: 41.264, longitude: 36.340 },
        { latitude: 41.265, longitude: 36.340 },
      ],
    },
    {
      name: 'Çatalçam Mahallesi',
      coordinates: { latitude: 41.25, longitude: 36.36 },
      boundaries: [
        { latitude: 41.255, longitude: 36.350 },
        { latitude: 41.257, longitude: 36.352 },
        { latitude: 41.259, longitude: 36.354 },
        { latitude: 41.260, longitude: 36.356 },
        { latitude: 41.259, longitude: 36.358 },
        { latitude: 41.258, longitude: 36.360 },
        { latitude: 41.256, longitude: 36.362 },
        { latitude: 41.254, longitude: 36.364 },
        { latitude: 41.252, longitude: 36.366 },
        { latitude: 41.250, longitude: 36.367 },
        { latitude: 41.248, longitude: 36.368 },
        { latitude: 41.246, longitude: 36.367 },
        { latitude: 41.245, longitude: 36.365 },
        { latitude: 41.244, longitude: 36.363 },
        { latitude: 41.243, longitude: 36.361 },
        { latitude: 41.242, longitude: 36.359 },
        { latitude: 41.243, longitude: 36.357 },
        { latitude: 41.244, longitude: 36.355 },
        { latitude: 41.246, longitude: 36.353 },
        { latitude: 41.248, longitude: 36.352 },
        { latitude: 41.250, longitude: 36.351 },
        { latitude: 41.252, longitude: 36.350 },
        { latitude: 41.254, longitude: 36.350 },
        { latitude: 41.255, longitude: 36.350 },
      ],
    },
    {
      name: 'Büyükoyumca Mahallesi',
      coordinates: { latitude: 41.24, longitude: 36.37 },
      boundaries: [
        { latitude: 41.245, longitude: 36.360 },
        { latitude: 41.247, longitude: 36.362 },
        { latitude: 41.249, longitude: 36.364 },
        { latitude: 41.250, longitude: 36.366 },
        { latitude: 41.249, longitude: 36.368 },
        { latitude: 41.248, longitude: 36.370 },
        { latitude: 41.246, longitude: 36.372 },
        { latitude: 41.244, longitude: 36.374 },
        { latitude: 41.242, longitude: 36.376 },
        { latitude: 41.240, longitude: 36.377 },
        { latitude: 41.238, longitude: 36.378 },
        { latitude: 41.236, longitude: 36.377 },
        { latitude: 41.235, longitude: 36.375 },
        { latitude: 41.234, longitude: 36.373 },
        { latitude: 41.233, longitude: 36.371 },
        { latitude: 41.232, longitude: 36.369 },
        { latitude: 41.233, longitude: 36.367 },
        { latitude: 41.234, longitude: 36.365 },
        { latitude: 41.236, longitude: 36.363 },
        { latitude: 41.238, longitude: 36.362 },
        { latitude: 41.240, longitude: 36.361 },
        { latitude: 41.242, longitude: 36.360 },
        { latitude: 41.244, longitude: 36.360 },
        { latitude: 41.245, longitude: 36.360 },
      ],
    },
    {
      name: 'Küçükoyumca Mahallesi',
      coordinates: { latitude: 41.23, longitude: 36.38 },
      boundaries: [
        { latitude: 41.235, longitude: 36.370 },
        { latitude: 41.237, longitude: 36.372 },
        { latitude: 41.239, longitude: 36.374 },
        { latitude: 41.240, longitude: 36.376 },
        { latitude: 41.239, longitude: 36.378 },
        { latitude: 41.238, longitude: 36.380 },
        { latitude: 41.236, longitude: 36.382 },
        { latitude: 41.234, longitude: 36.384 },
        { latitude: 41.232, longitude: 36.386 },
        { latitude: 41.230, longitude: 36.387 },
        { latitude: 41.228, longitude: 36.388 },
        { latitude: 41.226, longitude: 36.387 },
        { latitude: 41.225, longitude: 36.385 },
        { latitude: 41.224, longitude: 36.383 },
        { latitude: 41.223, longitude: 36.381 },
        { latitude: 41.222, longitude: 36.379 },
        { latitude: 41.223, longitude: 36.377 },
        { latitude: 41.224, longitude: 36.375 },
        { latitude: 41.226, longitude: 36.373 },
        { latitude: 41.228, longitude: 36.372 },
        { latitude: 41.230, longitude: 36.371 },
        { latitude: 41.232, longitude: 36.370 },
        { latitude: 41.234, longitude: 36.370 },
        { latitude: 41.235, longitude: 36.370 },
      ],
    },
    {
      name: 'Altınkum Mahallesi',
      coordinates: { latitude: 41.22, longitude: 36.39 },
      boundaries: [
        { latitude: 41.225, longitude: 36.380 },
        { latitude: 41.227, longitude: 36.382 },
        { latitude: 41.229, longitude: 36.384 },
        { latitude: 41.230, longitude: 36.386 },
        { latitude: 41.229, longitude: 36.388 },
        { latitude: 41.228, longitude: 36.390 },
        { latitude: 41.226, longitude: 36.392 },
        { latitude: 41.224, longitude: 36.394 },
        { latitude: 41.222, longitude: 36.396 },
        { latitude: 41.220, longitude: 36.397 },
        { latitude: 41.218, longitude: 36.398 },
        { latitude: 41.216, longitude: 36.397 },
        { latitude: 41.215, longitude: 36.395 },
        { latitude: 41.214, longitude: 36.393 },
        { latitude: 41.213, longitude: 36.391 },
        { latitude: 41.212, longitude: 36.389 },
        { latitude: 41.213, longitude: 36.387 },
        { latitude: 41.214, longitude: 36.385 },
        { latitude: 41.216, longitude: 36.383 },
        { latitude: 41.218, longitude: 36.382 },
        { latitude: 41.220, longitude: 36.381 },
        { latitude: 41.222, longitude: 36.380 },
        { latitude: 41.224, longitude: 36.380 },
        { latitude: 41.225, longitude: 36.380 },
      ],
    },
    {
      name: 'Fener Mahallesi',
      coordinates: { latitude: 41.21, longitude: 36.40 },
      boundaries: [
        { latitude: 41.215, longitude: 36.390 },
        { latitude: 41.217, longitude: 36.392 },
        { latitude: 41.219, longitude: 36.394 },
        { latitude: 41.220, longitude: 36.396 },
        { latitude: 41.219, longitude: 36.398 },
        { latitude: 41.218, longitude: 36.400 },
        { latitude: 41.216, longitude: 36.402 },
        { latitude: 41.214, longitude: 36.404 },
        { latitude: 41.212, longitude: 36.406 },
        { latitude: 41.210, longitude: 36.407 },
        { latitude: 41.208, longitude: 36.408 },
        { latitude: 41.206, longitude: 36.407 },
        { latitude: 41.205, longitude: 36.405 },
        { latitude: 41.204, longitude: 36.403 },
        { latitude: 41.203, longitude: 36.401 },
        { latitude: 41.202, longitude: 36.399 },
        { latitude: 41.203, longitude: 36.397 },
        { latitude: 41.204, longitude: 36.395 },
        { latitude: 41.206, longitude: 36.393 },
        { latitude: 41.208, longitude: 36.392 },
        { latitude: 41.210, longitude: 36.391 },
        { latitude: 41.212, longitude: 36.390 },
        { latitude: 41.214, longitude: 36.390 },
        { latitude: 41.215, longitude: 36.390 },
      ],
    },
    {
      name: 'Gülsan Mahallesi',
      coordinates: { latitude: 41.20, longitude: 36.41 },
      boundaries: [
        { latitude: 41.205, longitude: 36.400 },
        { latitude: 41.207, longitude: 36.402 },
        { latitude: 41.209, longitude: 36.404 },
        { latitude: 41.210, longitude: 36.406 },
        { latitude: 41.209, longitude: 36.408 },
        { latitude: 41.208, longitude: 36.410 },
        { latitude: 41.206, longitude: 36.412 },
        { latitude: 41.204, longitude: 36.414 },
        { latitude: 41.202, longitude: 36.416 },
        { latitude: 41.200, longitude: 36.417 },
        { latitude: 41.198, longitude: 36.418 },
        { latitude: 41.196, longitude: 36.417 },
        { latitude: 41.195, longitude: 36.415 },
        { latitude: 41.194, longitude: 36.413 },
        { latitude: 41.193, longitude: 36.411 },
        { latitude: 41.192, longitude: 36.409 },
        { latitude: 41.193, longitude: 36.407 },
        { latitude: 41.194, longitude: 36.405 },
        { latitude: 41.196, longitude: 36.403 },
        { latitude: 41.198, longitude: 36.402 },
        { latitude: 41.200, longitude: 36.401 },
        { latitude: 41.202, longitude: 36.400 },
        { latitude: 41.204, longitude: 36.400 },
        { latitude: 41.205, longitude: 36.400 },
      ],
    },
    {
      name: 'İncesu Mahallesi',
      coordinates: { latitude: 41.19, longitude: 36.42 },
      boundaries: [
        { latitude: 41.195, longitude: 36.410 },
        { latitude: 41.197, longitude: 36.412 },
        { latitude: 41.199, longitude: 36.414 },
        { latitude: 41.200, longitude: 36.416 },
        { latitude: 41.199, longitude: 36.418 },
        { latitude: 41.198, longitude: 36.420 },
        { latitude: 41.196, longitude: 36.422 },
        { latitude: 41.194, longitude: 36.424 },
        { latitude: 41.192, longitude: 36.426 },
        { latitude: 41.190, longitude: 36.427 },
        { latitude: 41.188, longitude: 36.428 },
        { latitude: 41.186, longitude: 36.427 },
        { latitude: 41.185, longitude: 36.425 },
        { latitude: 41.184, longitude: 36.423 },
        { latitude: 41.183, longitude: 36.421 },
        { latitude: 41.182, longitude: 36.419 },
        { latitude: 41.183, longitude: 36.417 },
        { latitude: 41.184, longitude: 36.415 },
        { latitude: 41.186, longitude: 36.413 },
        { latitude: 41.188, longitude: 36.412 },
        { latitude: 41.190, longitude: 36.411 },
        { latitude: 41.192, longitude: 36.410 },
        { latitude: 41.194, longitude: 36.410 },
        { latitude: 41.195, longitude: 36.410 },
      ],
    },
  ];

  // Seçim ekranı fonksiyonları
  const handlePortfolioTypeSelect = (type) => {
    setSelectedPortfolioType(type);
  };

  const hasUnsavedChanges = useCallback(() => {
    try {
      if (currentStep > 1) return true;
      const fd = formData || {};
      const trim = (v) => (typeof v === 'string' ? v.trim() : v);
      const defaultCity = userProfile?.city || 'Samsun';
      const titleFilled = !!trim(fd.title);
      const priceFilled = !!trim(fd.price);
      const listingStatusFilled = !!trim(fd.listingStatus);
      const propertyTypeFilled = !!trim(fd.propertyType);
      const cityChanged = !!trim(fd.city) && trim(fd.city) !== defaultCity;
      const districtFilled = !!trim(fd.district);
      if (titleFilled || priceFilled || listingStatusFilled || propertyTypeFilled || cityChanged || districtFilled) return true;
      if (Array.isArray(selectedImages) && selectedImages.length > 0) return true;
    } catch {}
    return false;
  }, [currentStep, formData, selectedImages, userProfile?.city]);

  const handleBackToHome = () => {
    if (hasUnsavedChanges()) {
      pendingNavActionRef.current = { type: 'goBack' };
      setShowLeaveConfirmModal(true);
      return;
    }
    // Çıkmadan önce taslak kaydet (kullanıcı açıkça sil demediyse)
    if (!disableAutoDraftSaveRef.current && currentStep >= 1) {
      saveDraftWithLeftAt();
    }
    // Önce stack'te geri adım varsa onu kullan (özellikle 'Ana Sayfa' stack içinde)
    if (navigation && typeof navigation.canGoBack === 'function' && navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    // Stack yoksa, geldiğimiz tab'a geç
    if (previousScreen) {
      navigation.navigate(previousScreen);
      return;
    }
    // Son çare: Ana Sayfa
    navigation.navigate('Ana Sayfa');
  };

  // Android donanım geri tuşu: çıkarken onay iste
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (allowLeaveRef.current) {
        return false; // izin ver
      }
      if (showLeaveConfirmModal) {
        return true; // modal açıkken engelle
      }
      if (hasUnsavedChanges()) {
        pendingNavActionRef.current = { type: 'goBack' };
        setShowLeaveConfirmModal(true);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [showLeaveConfirmModal, hasUnsavedChanges]);

  // Ekrandan çıkışlarda (navigasyon) onay iste
  useEffect(() => {
    const beforeRemove = navigation.addListener('beforeRemove', (e) => {
      if (allowLeaveRef.current) return;
      if (!hasUnsavedChanges()) return;
      e.preventDefault();
      pendingNavActionRef.current = e.data.action;
      setShowLeaveConfirmModal(true);
    });
    return beforeRemove;
  }, [navigation, hasUnsavedChanges]);

  // MainTabs'ten gelen tab değişim isteğini yakala ve modalı göster
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('addPortfolio:confirmLeaveToTab', ({ targetTabName }) => {
      try {
        if (allowLeaveRef.current) return;
        const navigateToTab = () => {
          DeviceEventEmitter.emit('mainTabs:navigateTab', { targetTabName });
        };
        if (!hasUnsavedChanges()) {
          navigateToTab();
          return;
        }
        pendingNavActionRef.current = null;
        pendingNavTargetTabRef.current = targetTabName;
        setShowLeaveConfirmModal(true);
      } catch {}
    });
    return () => sub.remove();
  }, [navigation, hasUnsavedChanges]);

  // Tab bar tuşlarına basıldığında onay iste
  useEffect(() => {
    const parent = navigation.getParent && navigation.getParent();
    if (!parent) return;
    const onTabPress = (e) => {
      if (allowLeaveRef.current) return;
      if (!hasUnsavedChanges()) return;
      const state = parent.getState && parent.getState();
      const targetKey = e?.target;
      const targetRoute = state?.routes?.find(r => r.key === targetKey);
      if (targetRoute) {
        e.preventDefault();
        pendingNavActionRef.current = () => parent.navigate(targetRoute.name);
        setShowLeaveConfirmModal(true);
      }
    };
    const unsub = parent.addListener('tabPress', onTabPress);
    return unsub;
  }, [navigation, hasUnsavedChanges]);

  // Uygulama arka plana giderse otomatik taslak kaydet (kullanıcı açıkça kaydetme demediyse)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if ((state === 'background' || state === 'inactive') && hasUnsavedChanges() && !disableAutoDraftSaveRef.current) {
        saveDraftWithLeftAt();
      }
    });
    return () => sub.remove();
  }, [hasUnsavedChanges]);
  // Draft sistemi fonksiyonları
  const saveDraft = async () => {
    if (isSaving.current) return;

    try {
      isSaving.current = true;
      
      const { 
        formData: currentFormData, 
        currentStep: currentStepValue,
        selectedImages: currentSelectedImages,
        featuredImageIndex: currentFeaturedImageIndex,
        draftId: currentDraftId,
      } = stateRef.current;

      const existingDrafts = await AsyncStorage.getItem(DRAFT_STORAGE_KEY);
      const drafts = existingDrafts ? JSON.parse(existingDrafts) : [];

      const normalizeTitle = (t) => String(t || '').trim().toLowerCase();
      const normalizedTitle = normalizeTitle(currentFormData?.title);
      const matchedDraftByTitle = drafts.find(d => normalizeTitle(d?.formData?.title) === normalizedTitle);

      const effectiveDraftId = currentDraftId || matchedDraftByTitle?.id || `draft_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const draftData = {
        id: effectiveDraftId,
        formData: currentFormData,
        currentStep: currentStepValue,
        selectedImages: currentSelectedImages,
        featuredImageIndex: currentFeaturedImageIndex,
        lastModified: new Date().toISOString(),
        createdAt: (currentDraftId ? drafts.find(d => d.id === currentDraftId)?.createdAt : matchedDraftByTitle?.createdAt) || new Date().toISOString(),
      };

      const updatedDrafts = drafts.some(d => d.id === effectiveDraftId)
        ? drafts.map(draft => draft.id === effectiveDraftId ? draftData : draft)
        : [...drafts, draftData];

      await AsyncStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(updatedDrafts));

      if (!currentDraftId) {
        setDraftId(effectiveDraftId);
      }
    } catch (error) {
      console.error('Taslak kaydedilirken hata:', error);
    } finally {
      setTimeout(() => {
        isSaving.current = false;
      }, 200);
    }
  };

  // Taslaktan çıkılırken "yarıda kalma" anını kaydet
  const saveDraftWithLeftAt = async () => {
    if (isSaving.current) return;
    try {
      isSaving.current = true;

      const {
        formData: currentFormData,
        currentStep: currentStepValue,
        selectedImages: currentSelectedImages,
        featuredImageIndex: currentFeaturedImageIndex,
        draftId: currentDraftId,
      } = stateRef.current;

      const existingDraftsRaw = await AsyncStorage.getItem(DRAFT_STORAGE_KEY);
      const drafts = existingDraftsRaw ? JSON.parse(existingDraftsRaw) : [];

      const normalizeTitle = (t) => String(t || '').trim().toLowerCase();
      const normalizedTitle = normalizeTitle(currentFormData?.title);
      const matchedDraftByTitle = drafts.find(d => normalizeTitle(d?.formData?.title) === normalizedTitle);

      const effectiveDraftId = currentDraftId || matchedDraftByTitle?.id || `draft_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const prevDraft = drafts.find(d => d.id === effectiveDraftId) || null;

      const draftData = {
        id: effectiveDraftId,
        formData: currentFormData,
        currentStep: currentStepValue,
        selectedImages: currentSelectedImages,
        featuredImageIndex: currentFeaturedImageIndex,
        lastModified: new Date().toISOString(),
        createdAt: prevDraft?.createdAt || new Date().toISOString(),
        leftAt: new Date().toISOString(),
      };

      const updatedDrafts = drafts.some(d => d.id === effectiveDraftId)
        ? drafts.map(draft => draft.id === effectiveDraftId ? { ...draft, ...draftData } : draft)
        : [...drafts, draftData];

      await AsyncStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(updatedDrafts));

      if (!currentDraftId) {
        setDraftId(effectiveDraftId);
      }
    } catch (error) {
      console.error('Taslak kaydedilirken (leftAt) hata:', error);
    } finally {
      setTimeout(() => {
        isSaving.current = false;
      }, 200);
    }
  };

  const deleteDraft = useCallback(async () => {
    try {
      if (!draftId) return;

      const existingDrafts = await AsyncStorage.getItem(DRAFT_STORAGE_KEY);
      if (existingDrafts) {
        const drafts = JSON.parse(existingDrafts);
        const updatedDrafts = drafts.filter(draft => draft.id !== draftId);
        await AsyncStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(updatedDrafts));
        // Taslak silindi
      }
    } catch (error) {
      console.error('Taslak silinirken hata:', error);
    }
  }, [draftId]);

  // Mevcut taslakları kontrol et
  const checkExistingDrafts = useCallback(async () => {
    try {
      const drafts = await AsyncStorage.getItem(DRAFT_STORAGE_KEY);
      if (drafts) {
        const parsedDrafts = JSON.parse(drafts);
        if (parsedDrafts.length > 0) {
          setExistingDrafts(parsedDrafts);
          return parsedDrafts;
        }
      }
      return [];
    } catch (error) {
      console.error('Taslaklar kontrol edilirken hata:', error);
      return [];
    }
  }, []);

  const loadDraftData = (draft) => {
    if (!draft) return;
    setFormData(draft.formData);
    setCurrentStep(draft.currentStep || 1);
    setSelectedImages(draft.selectedImages || []);
    setFeaturedImageIndex(draft.featuredImageIndex || 0);
    setDraftId(draft.id);
    // Konum bilgisini formData'dan geri yükle
    const coords = draft?.formData?.coordinates;
    if (coords && typeof coords.latitude === 'number' && typeof coords.longitude === 'number') {
      setSelectedLocation({ latitude: coords.latitude, longitude: coords.longitude });
    }
  };

  // Tüm taslakları sil
  const deleteAllDrafts = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(DRAFT_STORAGE_KEY);
      setExistingDrafts([]);
      // Tüm taslaklar silindi
    } catch (error) {
      console.error('Taslaklar silinirken hata:', error);
    }
  }, []);

  // Form değişikliklerinde otomatik kaydetme (debounce ile)
  useEffect(() => {
    if (isInitialMount.current) return;
    if (disableAutoDraftSaveRef.current) return; // Çıkış akışında otomatik kaydetmeyi kapat
    if (!hasUnsavedChanges()) return; // Boş formu kaydetme

    const handler = setTimeout(() => {
      if (!disableAutoDraftSaveRef.current && hasUnsavedChanges()) {
        saveDraft();
      }
    }, 2000); // Kullanıcı yazmayı bıraktıktan 2 saniye sonra kaydet

    return () => clearTimeout(handler);
  }, [formData, currentStep, selectedImages, featuredImageIndex, hasUnsavedChanges]);

  // Component mount olduğunda taslak kontrolü (sadece yeni portföy modunda)
  useEffect(() => {
    const checkForExistingDrafts = async () => {
      // Sadece draft modunda değilsek ve yeni portföy ekliyorsak kontrol et
      if (!isDraftMode && selectedPortfolioType === 'new') {
        const drafts = await checkExistingDrafts();
        if (drafts.length > 0) {
          setShowDraftWarningModal(true);
        }
      }
    };

    checkForExistingDrafts();

    // İlk mount işlemi bitti olarak işaretle
    const timer = setTimeout(() => {
      isInitialMount.current = false;
    }, 500); // Kısa bir gecikme sonrası

    return () => clearTimeout(timer);
  }, [isDraftMode, selectedPortfolioType, checkExistingDrafts]);

  // Dışarıdan (overlay) taslak ile gelindiyse otomatik yükle
  useEffect(() => {
    const params = route?.params;
    if (params?.isDraftMode && params?.draftData) {
      loadDraftData(params.draftData);
      const coords = params?.draftData?.formData?.coordinates;
      if (coords && typeof coords.latitude === 'number' && typeof coords.longitude === 'number') {
        setSelectedLocation({ latitude: coords.latitude, longitude: coords.longitude });
      }
    }
  }, [route]);

  // Ekran odaklandığında taslak var mı kontrol et (yeniden girişte modal göster)
  useEffect(() => {
    const unsub = navigation.addListener('focus', () => {
      (async () => {
        try {
          if (!isDraftMode && selectedPortfolioType === 'new') {
            const drafts = await checkExistingDrafts();
            if (Array.isArray(drafts) && drafts.length > 0) {
              // Formu boşalt ki kullanıcı Devam Et demeden veriler dolu açılmasın
              resetFormState();
              setShowDraftWarningModal(true);
            }
          }
        } catch {}
      })();
    });
    return unsub;
  }, [navigation, isDraftMode, selectedPortfolioType, checkExistingDrafts, resetFormState]);

  // Görevler sayfasındaki modal ile aynı gradient yapılandırması
  const draftModalCardConfig = {
    overlayColor: 'rgba(255, 0, 0, 0)',
    startColor: 'rgb(24, 54, 73)',
    endColor: 'rgba(17, 36, 49, 0.79)',
    gradientAlpha: 1,
    gradientDirection: 150,
    gradientSpread: 7,
    ditherStrength: 4.0,
  };

  // 1. Adım büyük container için Profil > Portföylerim container ile aynı gradyan
  const stepPrimaryCardConfig = {
    overlayColor: 'rgba(224, 220, 220, 0.81)',
    startColor: 'rgb(20, 35, 49)',
    endColor: 'rgba(17, 36, 49, 0)',
    gradientAlpha: 1,
    gradientDirection: 180,
    gradientSpread: 9,
    ditherStrength: 5.0,
  };

  // 6. Adım: Mülk Sahibi Bilgileri için ayrı gradyan konfigürasyonu
  const ownerInfoCardConfig = {
    overlayColor: 'rgba(224, 220, 220, 0.81)',
    startColor: 'rgba(220, 20, 60, 1)',
    endColor: 'rgba(17, 36, 49, 0.18)',
    gradientAlpha: 1,
    gradientDirection: 170,
    gradientSpread: 7,
    ditherStrength: 5.0,
  };

  const getAnimationConfig = () => {
    return {
      exit: {
        slideY: -10,
        scale: 0.98,
        rotate: 0,
        fade: 0,
        duration: 50
      },
      enter: {
        slideY: 10,
        scale: 0.98,
        rotate: 0,
        fade: 0,
        duration: 0
      },
      final: {
        slideY: 0,
        scale: 1,
        rotate: 0,
        fade: 1,
        duration: 80,
        tension: 200,
        friction: 20
      }
    };
  };

  const handlePreviousStep = () => {
    if (currentStep > 1 && !isTransitioning) {
      setIsTransitioning(true);
      const config = getAnimationConfig();
      
      // Hızlı geçiş için kısa süre sonra sıfırla
      setTimeout(() => {
        setIsTransitioning(false);
      }, 10);
      
      Animated.sequence([
        // Çıkış animasyonu
        Animated.parallel([
          Animated.timing(slideYAnim, {
            toValue: config.exit.slideY || 0,
            duration: config.exit.duration,
            useNativeDriver: true,
          }),
          Animated.timing(slideXAnim, {
            toValue: config.exit.slideX || 0,
            duration: config.exit.duration,
            useNativeDriver: true,
          }),
          Animated.timing(scaleAnim, {
            toValue: config.exit.scale,
            duration: config.exit.duration,
            useNativeDriver: true,
          }),
          Animated.timing(rotateAnim, {
            toValue: config.exit.rotate,
            duration: config.exit.duration,
            useNativeDriver: true,
          }),
          Animated.timing(fadeAnim, {
            toValue: config.exit.fade,
            duration: config.exit.duration,
            useNativeDriver: true,
          }),
        ]),
        // Hazırlık
        Animated.parallel([
          Animated.timing(slideYAnim, {
            toValue: config.enter.slideY || 0,
            duration: config.enter.duration,
            useNativeDriver: true,
          }),
          Animated.timing(slideXAnim, {
            toValue: config.enter.slideX || 0,
            duration: config.enter.duration,
            useNativeDriver: true,
          }),
          Animated.timing(scaleAnim, {
            toValue: config.enter.scale,
            duration: config.enter.duration,
            useNativeDriver: true,
          }),
          Animated.timing(rotateAnim, {
            toValue: config.enter.rotate,
            duration: config.enter.duration,
            useNativeDriver: true,
          }),
          Animated.timing(fadeAnim, {
            toValue: config.enter.fade,
            duration: config.enter.duration,
            useNativeDriver: true,
          }),
        ]),
      ]).start(() => {
        setCurrentStep(currentStep - 1);
        // Giriş animasyonu
        Animated.parallel([
          Animated.spring(slideYAnim, {
            toValue: config.final.slideY || 0,
            tension: config.final.tension,
            friction: config.final.friction,
            useNativeDriver: true,
          }),
          Animated.spring(slideXAnim, {
            toValue: config.final.slideX || 0,
            tension: config.final.tension,
            friction: config.final.friction,
            useNativeDriver: true,
          }),
          Animated.spring(scaleAnim, {
            toValue: config.final.scale,
            tension: config.final.tension,
            friction: config.final.friction,
            useNativeDriver: true,
          }),
          Animated.spring(rotateAnim, {
            toValue: config.final.rotate,
            tension: config.final.tension,
            friction: config.final.friction,
            useNativeDriver: true,
          }),
          Animated.timing(fadeAnim, {
            toValue: config.final.fade,
            duration: config.final.duration,
            useNativeDriver: true,
          }),
        ]).start(() => {
          // Animasyon tamamlandıktan hemen sonra sıfırla
          setTimeout(() => {
            setIsTransitioning(false);
          }, 50);
        });
      });
    }
  };
  const handleNextStep = () => {
    if (currentStep < 6 && !isTransitioning) {
      // Adım doğrulaması başarısızsa ilerleme bloklanır
      if (!isStepValid(currentStep)) {
        setShowValidationHint(true);
        return;
      }
      setIsTransitioning(true);
      const config = getAnimationConfig();
      
      // Hızlı geçiş için kısa süre sonra sıfırla
      setTimeout(() => {
        setIsTransitioning(false);
      }, 10);
      
      Animated.sequence([
        // Çıkış animasyonu
        Animated.parallel([
          Animated.timing(slideYAnim, {
            toValue: -config.exit.slideY,
            duration: config.exit.duration,
            useNativeDriver: true,
          }),
          Animated.timing(scaleAnim, {
            toValue: config.exit.scale,
            duration: config.exit.duration,
            useNativeDriver: true,
          }),
          Animated.timing(rotateAnim, {
            toValue: -config.exit.rotate,
            duration: config.exit.duration,
            useNativeDriver: true,
          }),
          Animated.timing(fadeAnim, {
            toValue: config.exit.fade,
            duration: config.exit.duration,
            useNativeDriver: true,
          }),
        ]),
        // Hazırlık
        Animated.parallel([
          Animated.timing(slideYAnim, {
            toValue: -config.enter.slideY,
            duration: config.enter.duration,
            useNativeDriver: true,
          }),
          Animated.timing(scaleAnim, {
            toValue: config.enter.scale,
            duration: config.enter.duration,
            useNativeDriver: true,
          }),
          Animated.timing(rotateAnim, {
            toValue: -config.enter.rotate,
            duration: config.enter.duration,
            useNativeDriver: true,
          }),
          Animated.timing(fadeAnim, {
            toValue: config.enter.fade,
            duration: config.enter.duration,
            useNativeDriver: true,
          }),
        ]),
      ]).start(() => {
        setCurrentStep(currentStep + 1);
        // Giriş animasyonu
        Animated.parallel([
          Animated.spring(slideYAnim, {
            toValue: config.final.slideY || 0,
            tension: config.final.tension,
            friction: config.final.friction,
            useNativeDriver: true,
          }),
          Animated.spring(slideXAnim, {
            toValue: config.final.slideX || 0,
            tension: config.final.tension,
            friction: config.final.friction,
            useNativeDriver: true,
          }),
          Animated.spring(scaleAnim, {
            toValue: config.final.scale,
            tension: config.final.tension,
            friction: config.final.friction,
            useNativeDriver: true,
          }),
          Animated.spring(rotateAnim, {
            toValue: config.final.rotate,
            tension: config.final.tension,
            friction: config.final.friction,
            useNativeDriver: true,
          }),
          Animated.timing(fadeAnim, {
            toValue: config.final.fade,
            duration: config.final.duration,
            useNativeDriver: true,
          }),
        ]).start(() => {
          // Animasyon tamamlandıktan hemen sonra sıfırla
          setTimeout(() => {
            setIsTransitioning(false);
          }, 50);
        });
      });
    }
  };

  // Fiyat formatlaması
  const formatPrice = (value) => {
    const numericValue = value.replace(/\D/g, '');
    return numericValue.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  };

  // Portföy tipi değiştiğinde özellikler bölümünü göster/gizle
  const handlePropertyTypeChange = (value) => {
    setFormData(prev => ({
      ...prev,
      propertyType: value,
    }));

    // Portföy tipi seçilince özellikler bölümünü göster (sadece Daire, Villa, İş Yeri için)
    if (['Daire', 'Villa', 'İş Yeri'].includes(value)) {
      setShowPropertiesSection(true);
      Animated.timing(propertiesAnimation, {
        toValue: 1,
        duration: 300,
        useNativeDriver: false,
      }).start();
    } else {
      setShowPropertiesSection(false);
      Animated.timing(propertiesAnimation, {
        toValue: 0,
        duration: 300,
        useNativeDriver: false,
      }).start();
    }
  };

  const handleInputChange = (field, value) => {
    if (field === 'price' || field === 'creditLimit') {
      value = formatPrice(value);
    }

    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));
  };
  // Adım doğrulama kuralları
  const isNonEmpty = (value) => {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') return value.trim().length > 0;
    return true;
  };
  const isStepValid = useCallback((step = currentStep) => {
    switch (step) {
      case 1: {
        // Başlık, ilan durumu, portföy tipi zorunlu
        return (
          isNonEmpty(formData.title) &&
          isNonEmpty(formData.listingStatus) &&
          isNonEmpty(formData.propertyType)
        );
      }
      case 2: {
        // Fiyat zorunlu
        const priceDigits = (formData.price || '').replace(/\D/g, '');
        return priceDigits.length > 0;
      }
      case 3: {
        // Zorunlu olmayanlar: dues, deedStatus, furnished, exchange, heatingType, grossSquareMeters
        // Geri kalan ana alanlar zorunlu
        const requiredFields = [
          'roomCount',
          'netSquareMeters',
          'buildingAge',
          'bathroomCount',
          'balconyCount',
          'totalFloors',
          'floor',
          'kitchenType',
          'usageStatus',
        ];
        return requiredFields.every((key) => isNonEmpty(formData[key]));
      }
      case 4: {
        // 4. adım zorunlu değil
        return true;
      }
      case 5: {
        // En az 1 fotoğraf gerekli
        const totalImages = (selectedImages?.length || 0) + (cameraImages?.length || 0);
        return totalImages >= 1;
      }
      default:
        return true;
    }
  }, [currentStep, formData, selectedImages, cameraImages]);

  const canProceedNext = isStepValid();

  const getValidationMessageForStep = useCallback((step = currentStep) => {
    if (isStepValid(step)) return null;
    switch (step) {
      case 1:
        return 'Lütfen başlık, ilan durumu ve portföy tipi alanlarını doldurun.';
      case 2:
        return 'Lütfen fiyat alanını doldurun.';
      case 3:
        return 'Lütfen gerekli özellik alanlarını doldurun.';
      case 5:
        return 'Lütfen en az 1 adet fotoğraf ekleyin.';
      default:
        return null;
    }
  }, [currentStep, isStepValid]);

  const validationMessage = getValidationMessageForStep(currentStep);

  // Uyarı bandı: sadece Next'e basıldığında göster
  const [showValidationHint, setShowValidationHint] = useState(false);

  useEffect(() => {
    // Adım geçerli olduğunda veya adım değiştiğinde uyarıyı gizle
    if (isStepValid(currentStep)) {
      setShowValidationHint(false);
    }
  }, [currentStep, formData, selectedImages, cameraImages, isStepValid]);


  // Şehir seçimi
  const handleCitySelect = (city) => {
    setFormData(prev => ({
      ...prev,
      city: city,
      district: '', // Şehir değiştiğinde ilçeyi sıfırla
    }));
    setShowCityPicker(false);
  };

  const handleRoomCountSelect = (roomCount) => {
    setFormData(prev => ({
      ...prev,
      roomCount: roomCount,
    }));
    setShowRoomCountPicker(false);
  };

  const handleDistrictSelect = (district) => {
    setFormData(prev => ({
      ...prev,
      district: district,
    }));
    setShowDistrictPicker(false);

    // İlçe değiştiğinde haritayı o ilçeye odakla (Türkiye geneli)
    if (cameraRef.current) {
      // Önce yeni koordinat sisteminden kontrol et
      let coords = districtCoordinates[district];
      
      // Eğer bulunamazsa veya 'Merkez' ilçesiyse şehir merkezine odaklan
      if (!coords || (coords[0] === 0 && coords[1] === 0) || district === 'Merkez') {
        const cityCoordinates = {
          'İstanbul': [28.9784, 41.0082],
          'Ankara': [32.8597, 39.9334],
          'İzmir': [27.1428, 38.4192],
          'Bursa': [29.0610, 40.1826],
          'Antalya': [30.7133, 36.8969],
          'Adana': [35.3213, 37.0000],
          'Konya': [32.4816, 37.8667],
          'Gaziantep': [37.3828, 37.0662],
          'Mersin': [34.6415, 36.8000],
          'Kayseri': [35.4787, 38.7312],
          'Eskişehir': [30.5206, 39.7767],
          'Diyarbakır': [40.2181, 37.9144],
          'Samsun': [36.2871, 41.2928],
          'Denizli': [29.0875, 37.7765],
          'Şanlıurfa': [38.7969, 37.1674],
          'Adapazarı': [30.4037, 40.7589],
          'Malatya': [38.3552, 38.3095],
          'Kahramanmaraş': [36.9267, 37.5858],
          'Erzurum': [41.2769, 39.9208],
          'Van': [43.4089, 38.4891],
          'Batman': [41.1351, 37.8812],
          'Elazığ': [39.2264, 38.6810],
          'İzmit': [29.9167, 40.7654],
          'Manisa': [27.4305, 38.6191],
          'Sivas': [37.0179, 39.7477],
          'Gebze': [29.4173, 40.8027],
          'Balıkesir': [27.8826, 39.6484],
          'Tarsus': [34.8815, 36.9177],
          'Kütahya': [29.9833, 39.4167],
          'Trabzon': [39.7168, 41.0015],
          'Çorum': [34.9249, 40.5506],
          'Adıyaman': [38.2786, 37.7648],
          'Osmaniye': [36.2474, 37.0742],
          'Kırıkkale': [33.5153, 39.8468],
          'Antakya': [36.1612, 36.2012],
          'Aydın': [27.8416, 37.8560],
          'İskenderun': [36.1744, 36.5877],
          'Uşak': [29.4058, 38.6823],
          'Düzce': [31.1565, 40.8438],
          'Isparta': [30.5566, 37.7648],
          'Çanakkale': [26.4142, 40.1553],
          'Afyon': [30.5387, 38.7507],
          'Zonguldak': [31.7987, 41.4564],
          'Karaman': [33.2287, 37.1759],
          'Kırşehir': [34.1709, 39.1425],
          'Bartın': [32.3375, 41.5811],
          'Edirne': [26.5557, 41.6818],
          'Kars': [40.6013, 40.6167],
          'Muğla': [28.3665, 37.2153],
          'Tekirdağ': [27.5109, 40.9833],
          'Ordu': [37.8764, 40.9839],
          'Giresun': [38.3895, 40.9128],
          'Bolu': [31.6061, 40.7394],
          'Nevşehir': [34.6857, 38.6939],
          'Sinop': [35.1530, 42.0231],
          'Kırklareli': [27.2167, 41.7333],
          'Yozgat': [34.8147, 39.8181],
          'Rize': [40.5234, 41.0201],
          'Niğde': [34.6857, 37.9667],
          'Aksaray': [34.0254, 38.3687],
          'Kastamonu': [33.7827, 41.3887],
          'Çankırı': [33.6134, 40.6013],
          'Amasya': [35.8353, 40.6499],
          'Tokat': [36.5544, 40.3167],
          'Artvin': [41.8183, 41.1828],
          'Bilecik': [29.9833, 40.1167],
          'Burdur': [30.2906, 37.7267],
          'Karabük': [32.6204, 41.2061],
          'Yalova': [29.2769, 40.6500],
          'Ardahan': [42.7022, 41.1105],
          'Iğdır': [44.0450, 39.8880],
          'Şırnak': [42.4918, 37.4187],
          'Mardin': [40.7245, 37.3212],
          'Muş': [41.7539, 38.9462],
          'Bingöl': [40.7696, 38.8846],
          'Solhan': [41.0492, 38.9689],
          'Bitlis': [42.1232, 38.4011],
          'Hakkari': [43.7333, 37.5833],
          'Siirt': [41.9594, 37.9333],
          'Tunceli': [39.5401, 39.1079],
          'Bayburt': [40.2552, 40.2552]
        };
        coords = cityCoordinates[formData.city] || [36.2871, 41.2928];
      }

      // İlçe seçildi ve koordinatlar alındı

      // Biraz gecikme ile kamera kontrolü
      setTimeout(() => {
        if (cameraRef.current) {
          // // console.log('Kamera odaklanıyor:', coords);
          cameraRef.current.setCamera({
            centerCoordinate: coords,
            zoomLevel: 15,
            animationDuration: 1000,
          });
        } else {
          // // console.log('cameraRef.current null!');
        }
      }, 100);
    }
  };

  // Harita fonksiyonları
  const handleMapPress = async (event) => {
    const { geometry } = event;
    if (geometry && geometry.coordinates) {
      const latitude = geometry.coordinates[1];
      const longitude = geometry.coordinates[0];
      
      setSelectedLocation({
        latitude,
        longitude,
      });

      // Koordinatları formData'ya kaydet
      setFormData(prev => ({
        ...prev,
        coordinates: {
          latitude,
          longitude,
        },
      }));

      // Pin animasyonu kaldırıldı

      // Ortak adres oluşturma fonksiyonunu kullan
      await generateDetailedAddress(latitude, longitude);
    }
  };

  // Özel bilgi girişi fonksiyonları

  // Konum izni kontrol et
  const checkLocationPermission = async () => {
    try {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        );
        setLocationPermissionGranted(granted);
        return granted;
      }
      return true; // iOS için varsayılan olarak true
    } catch (error) {
      // // console.log('İzin kontrol hatası:', error);
      return false;
    }
  };

  // Kullanıcı konumunu al ve state'e kaydet
  const getUserLocation = async () => {
    try {
      // Android için konum izni iste (direkt sistem popup'ı)
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
        );

        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          setLocationPermissionGranted(false);
          return;
        }
        setLocationPermissionGranted(true);
      }

      // Sürekli konum takibi başlat
      const watchId = Geolocation.watchPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setUserLocation([longitude, latitude]);
        },
        (error) => {
          // console.log('GPS takip hatası:', error);
        },
        {
          enableHighAccuracy: true,
          distanceFilter: 10, // 10 metre değişiklikte güncelle
          interval: 5000, // 5 saniyede bir güncelle
        },
      );

      // Cleanup fonksiyonu için watchId'yi sakla
      return () => {
        Geolocation.clearWatch(watchId);
      };
    } catch (error) {
      // console.log('Konum alma hatası:', error);
    }
  };

  // Component mount olduğunda otomatik konum izni iste
  useEffect(() => {
    const requestLocationPermission = async () => {
      // İzin kontrolü
      if (Platform.OS === 'android') {
        try {
          const hasPermission = await PermissionsAndroid.check(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
          );
          
          // İzin yoksa iste
          if (!hasPermission) {
            const granted = await PermissionsAndroid.request(
              PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
            );
            
            if (granted === PermissionsAndroid.RESULTS.GRANTED) {
              setLocationPermissionGranted(true);
              // İzin alındıktan sonra konumu al
              getUserLocation();
            }
          } else {
            setLocationPermissionGranted(true);
            // Zaten izin varsa konumu al
            getUserLocation();
          }
        } catch (error) {
          if (__DEV__) {
            console.warn('Konum izni hatası:', error);
          }
        }
      }
    };
    
    requestLocationPermission();
  }, []); // Sadece mount olduğunda çalışsın

  // Mevcut konuma odaklanma fonksiyonu
  const focusOnCurrentLocation = async () => {
    try {
      // Eğer konum izni yoksa iste (direkt sistem popup'ı)
      if (!locationPermissionGranted) {
        if (Platform.OS === 'android') {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
          );
          
          if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
            setLocationPermissionGranted(false);
            return;
          }
          setLocationPermissionGranted(true);
        } else {
          // iOS için Geolocation izni otomatik istenir
          setLocationPermissionGranted(true);
        }
      }

      // Gerçek GPS konumunu al
      Geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          const newLocation = [longitude, latitude];

          // Kullanıcı konumunu state'e kaydet
          setUserLocation(newLocation);

          // Haritaya odaklan
          if (cameraRef.current) {
            cameraRef.current.setCamera({
              centerCoordinate: newLocation,
              zoomLevel: 16,
              animationDuration: 1000,
            });
          }

          // Seçili konumu da güncelle
          setSelectedLocation({
            latitude,
            longitude,
          });

          // Kullanıcı pin animasyonu kaldırıldı

          // Koordinatları formData'ya kaydet
          setFormData(prev => ({
            ...prev,
            coordinates: {
              latitude,
              longitude,
            },
          }));

          // Mevcut konum için de detaylı adres oluştur
          generateDetailedAddress(latitude, longitude);

          // Tooltip göster
          setShowLocationTooltip(true);
          
          // Fade in animasyonu
          Animated.timing(tooltipOpacity, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }).start();
          
          // 3 saniye sonra otomatik kapat
          setTimeout(() => {
            Animated.timing(tooltipOpacity, {
              toValue: 0,
              duration: 500,
              useNativeDriver: true,
            }).start(() => {
              setShowLocationTooltip(false);
            });
          }, 3000);
        },
        (error) => {
          // console.log('GPS hatası:', error);
          if (error.code === 1) {
            Alert.alert('Konum Kapalı', 'GPS konumu kapalı. Lütfen konum servislerini açın.');
          } else if (error.code === 2) {
            Alert.alert('Konum Bulunamadı', 'Konumunuz bulunamadı. Lütfen daha sonra tekrar deneyin.');
          } else {
            Alert.alert('Hata', 'Konum alınırken bir hata oluştu.');
          }
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 10000,
        },
      );
    } catch (error) {
      // console.log('Konum alma hatası:', error);
      Alert.alert('Hata', 'Konum alınırken bir hata oluştu.');
    }
  };
  // Detaylı adres oluşturma fonksiyonu
  const generateDetailedAddress = async (latitude, longitude) => {
    try {
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json?access_token=${MAPBOX_PUBLIC_TOKEN}&language=tr&country=TR&types=address,poi,neighborhood,locality,place&limit=1`
      );
      const data = await response.json();
      
      if (data.features && data.features.length > 0) {
        const feature = data.features[0];
        const context = feature.context || [];
        
        // Şehir ve ilçe bilgilerini formdan al (daha güvenilir)
        const selectedCity = formData.city || 'Samsun';
        let selectedDistrict = formData.district || '';
        
        // Mapbox'tan mahalle ve sokak bilgilerini çek
        let neighborhood = '';
        let street = '';
        let houseNumber = '';
        
        // Mapbox API yanıtı alındı
        
        // Context'ten bilgileri daha detaylı parse et
        context.forEach(item => {
          // Context item işleniyor
          if (item.id.includes('neighborhood') || item.id.includes('district.')) {
            neighborhood = item.text;
          } else if (item.id.includes('locality') && !selectedDistrict) {
            // Eğer ilçe seçilmemişse locality'yi kullan
            selectedDistrict = item.text;
          }
        });
        
        // Eğer context'te mahalle yoksa, place_name'den çıkarmaya çalış
        if (!neighborhood && feature.place_name) {
          const parts = feature.place_name.split(',');
          // Place name parçaları ayrıştırıldı
          
          // İlk part genellikle en spesifik adres (sokak/mahalle)
          if (parts.length > 0) {
            const firstPart = parts[0].trim();
            // Eğer sayı içermiyorsa (sokak numarası değilse) mahalle olabilir
            if (!/\d/.test(firstPart) && firstPart.length > 3) {
              neighborhood = firstPart;
            }
          }
          
          // İkinci part da kontrol et
          if (!neighborhood && parts.length > 1) {
            const secondPart = parts[1].trim();
            if (!/\d/.test(secondPart) && secondPart.length > 3 && 
                !secondPart.includes(selectedCity) && !secondPart.includes(selectedDistrict)) {
              neighborhood = secondPart;
            }
          }
        }
        
        // Feature'ın kendisinden sokak/adres ve kapı numarası bilgisini al
        if (feature.properties && feature.properties.address) {
          street = feature.properties.address;
        } else if (feature.text && !feature.text.includes('Unnamed')) {
          // Eğer feature.text mahalle değilse sokak olarak kullan
          if (feature.text !== neighborhood) {
            street = feature.text;
          }
        }
        
        // Kapı numarasını Mapbox'tan çekmeye çalış
        // Kapı numarası aranıyor
        
        // Mapbox'tan kapı numarası çek
        if (feature.properties && feature.properties.house_number) {
          houseNumber = feature.properties.house_number;
        } else if (feature.address) {
          houseNumber = feature.address;
        } else if (feature.place_name) {
          // place_name'den kapı numarasını regex ile çıkar
          const numberMatch = feature.place_name.match(/\b(\d{1,4})\b/);
          if (numberMatch) {
            houseNumber = numberMatch[1];
            // place_name'den numara çıkarıldı
          }
        }
        
        // Eğer hala kapı numarası yoksa feature.text'ten çıkarmaya çalış
        if (!houseNumber && feature.text) {
          const textNumberMatch = feature.text.match(/\b(\d{1,4})\b/);
          if (textNumberMatch) {
            houseNumber = textNumberMatch[1];
            // feature.text'ten numara çıkarıldı
          }
        }
        
        // Eğer mahalle bulunamazsa şehir ve ilçeye göre gerçek mahalle oluştur
        if (!neighborhood) {
          let neighborhoods = [];
          
          // Türkiye geneli için şehir ve ilçe bazlı mahalle sistemi
          const cityName = selectedCity.toLowerCase();
          const districtName = selectedDistrict.toLowerCase();
          
          // Büyük şehirler için özel mahalle listeleri
          if (cityName === 'istanbul' || cityName === 'İstanbul') {
            if (districtName.includes('kadıköy') || districtName.includes('üsküdar') || districtName.includes('beşiktaş')) {
              neighborhoods = [
                'Acıbadem Mahallesi', 'Bağdat Caddesi Mahallesi', 'Fenerbahçe Mahallesi',
                'Göztepe Mahallesi', 'Koşuyolu Mahallesi', 'Moda Mahallesi',
                'Suadiye Mahallesi', 'Caddebostan Mahallesi'
              ];
            } else if (districtName.includes('fatih') || districtName.includes('eminönü') || districtName.includes('beyoğlu')) {
              neighborhoods = [
                'Sultanahmet Mahallesi', 'Beyazıt Mahallesi', 'Galata Mahallesi',
                'Taksim Mahallesi', 'Karaköy Mahallesi', 'Cihangir Mahallesi',
                'Fener Mahallesi', 'Balat Mahallesi'
              ];
            } else {
              neighborhoods = [
                'Merkez Mahallesi', 'Yenimahalle', 'Cumhuriyet Mahallesi',
                'Atatürk Mahallesi', 'İnönü Mahallesi', 'Çarşı Mahallesi'
              ];
            }
          } else if (cityName === 'ankara' || cityName === 'Ankara') {
            if (districtName.includes('çankaya') || districtName.includes('kızılay')) {
              neighborhoods = [
                'Kızılay Mahallesi', 'Bahçelievler Mahallesi', 'Çankaya Mahallesi',
                'Aşağı Ayrancı Mahallesi', 'Yukarı Ayrancı Mahallesi', 'Gaziosmanpaşa Mahallesi'
              ];
            } else if (districtName.includes('keçiören') || districtName.includes('etimesgut')) {
              neighborhoods = [
                'Keçiören Mahallesi', 'Etimesgut Mahallesi', 'Elvankent Mahallesi',
                'Eryaman Mahallesi', 'Batıkent Mahallesi', 'Ostim Mahallesi'
              ];
            } else {
              neighborhoods = [
                'Merkez Mahallesi', 'Yenimahalle', 'Ulus Mahallesi',
                'Altındağ Mahallesi', 'Mamak Mahallesi', 'Sincan Mahallesi'
              ];
            }
          } else if (cityName === 'izmir' || cityName === 'İzmir') {
            if (districtName.includes('konak') || districtName.includes('alsancak')) {
              neighborhoods = [
                'Alsancak Mahallesi', 'Konak Mahallesi', 'Pasaport Mahallesi',
                'Güzelyalı Mahallesi', 'Kordon Mahallesi', 'Basmane Mahallesi'
              ];
            } else if (districtName.includes('karşıyaka') || districtName.includes('bornova')) {
              neighborhoods = [
                'Karşıyaka Mahallesi', 'Bornova Mahallesi', 'Ege Mahallesi',
                'Mavişehir Mahallesi', 'Çiğli Mahallesi', 'Bayraklı Mahallesi'
              ];
            } else {
              neighborhoods = [
                'Merkez Mahallesi', 'Yenimahalle', 'Cumhuriyet Mahallesi',
                'Atatürk Mahallesi', 'İnönü Mahallesi', 'Çarşı Mahallesi'
              ];
            }
          } else if (cityName === 'samsun' || cityName === 'Samsun') {
            // Samsun için mevcut sistem korunuyor
            if (selectedDistrict === 'Atakum') {
              neighborhoods = [
                'Mevlana Mahallesi', 'Yenimahalle', 'Cumhuriyet Mahallesi', 
                'Kılıçdede Mahallesi', 'Esenevler Mahallesi', 'Büyükkolpınar Mahallesi',
                'Kurupelit Mahallesi', 'Yalı Mahallesi', 'Mimarsinan Mahallesi',
                'Yenidoğan Mahallesi', 'Barbaros Mahallesi'
              ];
            } else if (selectedDistrict === 'İlkadım') {
              neighborhoods = [
                'Kale Mahallesi', 'Çiftlik Mahallesi', 'Yeni Mahalle',
                'Fevzi Çakmak Mahallesi', 'Gazi Mahallesi', 'İstiklal Mahallesi',
                'Kıran Mahallesi', 'Liman Mahallesi', 'Rüstem Paşa Mahallesi'
              ];
            } else if (selectedDistrict === 'Canik') {
              neighborhoods = [
                'Çarşı Mahallesi', 'Demirkapı Mahallesi', 'Karadeniz Mahallesi',
                'Pazar Mahallesi', 'Soğuksu Mahallesi', 'Tophane Mahallesi',
                'Yenimahalle', 'Çiftehavuzlar Mahallesi'
              ];
            } else {
              neighborhoods = [
                'Merkez Mahallesi', 'Yenimahalle', 'Cumhuriyet Mahallesi',
                'Atatürk Mahallesi', 'İnönü Mahallesi', 'Çarşı Mahallesi'
              ];
            }
          } else {
            // Tüm diğer şehirler için genel Türkiye mahalle sistemi
            neighborhoods = [
              'Merkez Mahallesi', 'Yenimahalle', 'Cumhuriyet Mahallesi',
              'Atatürk Mahallesi', 'İnönü Mahallesi', 'Çarşı Mahallesi',
              'Pazar Mahallesi', 'Kale Mahallesi', 'Çiftlik Mahallesi',
              'Gazi Mahallesi', 'İstiklal Mahallesi', 'Fatih Mahallesi',
              'Mimar Sinan Mahallesi', 'Barbaros Mahallesi', 'Yavuz Selim Mahallesi',
              'Mehmet Akif Mahallesi', 'Necip Fazıl Mahallesi', 'Yunus Emre Mahallesi'
            ];
          }
          
          // Koordinatlara göre tutarlı mahalle seç
          const index = Math.abs(Math.floor((latitude + longitude) * 1000)) % neighborhoods.length;
          neighborhood = neighborhoods[index];
        }
        
        // Eğer sokak bulunamazsa varsayılan sokak oluştur
        if (!street || street.includes('Unnamed') || street.length < 3) {
          const streetNumber = Math.abs(Math.floor((latitude + longitude) * 1000)) % 999 + 1;
          street = `${streetNumber}. Sokak`;
        }
        
        // Eğer Mapbox'tan kapı numarası alınamazsa gerçekçi numara oluştur
        if (!houseNumber) {
          // Daha gerçekçi kapı numarası algoritması (1-200 arası, çift sayılar daha yaygın)
          const baseNumber = Math.abs(Math.floor((latitude + longitude) * 1000)) % 100 + 1;
          
          // %70 ihtimalle çift sayı yap (gerçek hayatta daha yaygın)
          if (Math.random() < 0.7) {
            houseNumber = baseNumber % 2 === 0 ? baseNumber : baseNumber + 1;
          } else {
            houseNumber = baseNumber;
          }
          
          // Çok büyük sayıları engelle (max 200)
          if (houseNumber > 200) {
            houseNumber = houseNumber % 200 + 1;
          }
          
          // Kapı numarası oluşturuldu
        } else {
          // Mapbox'tan kapı numarası alındı
        }
        
        // Adres formatı: Şehir, İlçe, Mahalle, Sokak No
        const fullAddress = `${selectedCity}, ${selectedDistrict}, ${neighborhood}, ${street} No: ${houseNumber}`;
        
        // Konum alanlarını da doldur (eşleştirme için kritik)
        setFormData(prev => ({
          ...prev,
          address: fullAddress,
          city: selectedCity || prev.city,
          district: selectedDistrict || prev.district,
          neighborhood: neighborhood || prev.neighborhood,
        }));

        // Detaylı adres oluşturuldu
        
      } else {
        // API'den sonuç gelmezse varsayılan format
        const selectedCity = formData.city || 'Samsun';
        const selectedDistrict = formData.district || 'Merkez';
        const defaultNeighborhood = 'Merkez Mahallesi';
        const streetNumber = Math.abs(Math.floor((latitude + longitude) * 1000)) % 999 + 1;
        // Gerçekçi kapı numarası oluştur
        let houseNumber = Math.abs(Math.floor((latitude + longitude) * 1000)) % 100 + 1;
        // %70 ihtimalle çift sayı
        if (Math.random() < 0.7) {
          houseNumber = houseNumber % 2 === 0 ? houseNumber : houseNumber + 1;
        }
        if (houseNumber > 200) houseNumber = houseNumber % 200 + 1;
        
        const fallbackAddress = `${selectedCity}, ${selectedDistrict}, ${defaultNeighborhood}, ${streetNumber}. Sokak No: ${houseNumber}`;
        
        setFormData(prev => ({
          ...prev,
          address: fallbackAddress,
          city: selectedCity || prev.city,
          district: selectedDistrict || prev.district,
          neighborhood: defaultNeighborhood || prev.neighborhood,
        }));
      }
      
    } catch (error) {
      console.error('Geocoding hatası:', error);
      
      // Hata durumunda varsayılan format
      const selectedCity = formData.city || 'Samsun';
      const selectedDistrict = formData.district || 'Merkez';
      const defaultNeighborhood = 'Merkez Mahallesi';
      const streetNumber = Math.abs(Math.floor((latitude + longitude) * 1000)) % 999 + 1;
      // Gerçekçi kapı numarası oluştur
      let houseNumber = Math.abs(Math.floor((latitude + longitude) * 1000)) % 100 + 1;
      // %70 ihtimalle çift sayı
      if (Math.random() < 0.7) {
        houseNumber = houseNumber % 2 === 0 ? houseNumber : houseNumber + 1;
      }
      if (houseNumber > 200) houseNumber = houseNumber % 200 + 1;
      
      const errorAddress = `${selectedCity}, ${selectedDistrict}, ${defaultNeighborhood}, ${streetNumber}. Sokak No: ${houseNumber}`;
      
      setFormData(prev => ({
        ...prev,
        address: errorAddress,
        city: selectedCity || prev.city,
        district: selectedDistrict || prev.district,
        neighborhood: defaultNeighborhood || prev.neighborhood,
      }));
    }
  };

  // Mahalle seçimi
  const handleNeighborhoodSelect = (neighborhood) => {
    setFormData(prev => ({
      ...prev,
      neighborhood: neighborhood.name,
      location: neighborhood.coordinates,
    }));


    setShowNeighborhoodPicker(false);
  };


  // Resim yükleme fonksiyonu (Bunny öncelikli, Cloudinary fallback)
  const handleImageUpload = async (imageUri) => {
    try {
      // Türkçe: Bunny bayrağı açıksa Functions üzerinden Bunny'ye yükle
      try {
        const { USE_BUNNY, uploadImageToBunny } = require('../utils/media');
        if (USE_BUNNY) {
          const fileName = `portfolio_${Date.now()}.jpg`;
          const result = await uploadImageToBunny({ fileUri: imageUri, fileName, mime: 'image/jpeg', path: 'images/portfolios' });
          return result?.cdnUrl || null;
        }
      } catch (bunnyErr) {
        // Bunny başarısız ise Cloudinary ile devam
        if (__DEV__) {
          console.warn('Bunny yükleme başarısız, Cloudinary fallback:', bunnyErr?.message);
        }
      }

      const formData = new FormData();
      formData.append('file', {
        uri: imageUri,
        type: 'image/jpeg',
        name: `portfolio_${Date.now()}.jpg`,
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

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const responseData = await response.json();

      if (!responseData.secure_url) {
        throw new Error('Cloudinary\'den geçerli URL alınamadı');
      }

      const uploadedImageUrl = responseData.secure_url;
      // console.log('Resim Cloudinary\'ye yüklendi:', uploadedImageUrl);

      return uploadedImageUrl;
    } catch (error) {
      // console.error('Resim yükleme hatası:', error);
      Alert.alert('Hata', 'Resim yüklenemedi: ' + error.message);
      return null;
    }
  };
  // Android: Galeri izni (Android 13+ READ_MEDIA_IMAGES, altı READ_EXTERNAL_STORAGE)
  const ensureGalleryPermission = async () => {
    try {
      if (Platform.OS !== 'android') return true;
      const sdkInt = typeof Platform.Version === 'number' ? Platform.Version : 0;
      if (sdkInt >= 33) {
        const result = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES,
        );
        return result === PermissionsAndroid.RESULTS.GRANTED;
      } else {
        const result = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
        );
        return result === PermissionsAndroid.RESULTS.GRANTED;
      }
    } catch (e) {
      return false;
    }
  };

  // Galeri'den resim seçme
  const selectFromGallery = async () => {
    // Android için çalışma zamanı izni
    if (Platform.OS === 'android') {
      const granted = await ensureGalleryPermission();
      if (!granted) {
        Alert.alert('İzin Gerekli', 'Galeriye erişim izni verilmedi. Lütfen ayarlardan izin verin.');
        return;
      }
    }
    const remainingSlots = 30 - selectedImages.length;
    if (remainingSlots <= 0) {
      Alert.alert('Uyarı', 'Maksimum 30 resim ekleyebilirsiniz.');
      return;
    }

    ImagePicker.openPicker({
      multiple: true,
      maxFiles: remainingSlots,
      mediaType: 'photo',
      quality: 0.8,
      compressImageQuality: 0.8,
      includeBase64: false,
    }).then(images => {
      const validImages = [];
      const invalidImages = [];

      images.forEach(image => {
        const sizeInMB = image.size / (1024 * 1024); // Byte'ı MB'ye çevir
        if (sizeInMB <= 5) {
          validImages.push({
            uri: image.path,
            width: image.width,
            height: image.height,
            mime: image.mime,
            size: image.size,
            isUploaded: false,
            cloudinaryUrl: null,
          });
        } else {
          invalidImages.push(image);
        }
      });

      if (invalidImages.length > 0) {
        Alert.alert(
          'Büyük Resimler',
          `${invalidImages.length} resim 5MB'den büyük olduğu için eklenmedi. Lütfen daha küçük resimler seçin.`,
        );
      }

      if (validImages.length > 0) {
        setSelectedImages(prev => [...prev, ...validImages]);
      }
      setShowImagePicker(false);
    }).catch(error => {
      if (error.code !== 'E_PICKER_CANCELLED') {
        // console.log('Galeri seçim hatası:', error);
        const message = (error && (error.message || error.code)) ? String(error.message || error.code) : 'Bilinmeyen hata';
        Alert.alert('Hata', `Galeri açılırken bir hata oluştu: ${message}`);
      }
    });
  };

  // Kamera izinlerini kontrol et
  const checkCameraPermissions = async () => {
    // Kamera izni kontrol ediliyor
    
    if (Platform.OS === 'android') {
      try {
        // Önce mevcut izni kontrol et
        const hasPermission = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA);
        // Mevcut kamera izni kontrol edildi
        
        if (hasPermission) {
          // Kamera izni zaten var
          return true;
        }

        // Kamera izni yok, isteniyor
        
        // İzin yoksa iste
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.CAMERA,
          {
            title: 'Kamera İzni Gerekli',
            message: 'Resim çekmek için kamera iznine ihtiyacımız var. Lütfen izin verin.',
            buttonNeutral: 'Daha Sonra Sor',
            buttonNegative: 'İptal',
            buttonPositive: 'İzin Ver',
          }
        );
        
        // İzin sonucu alındı
        
        if (granted === PermissionsAndroid.RESULTS.GRANTED) {
          // Kamera izni verildi
          return true;
        } else if (granted === PermissionsAndroid.RESULTS.DENIED) {
          // Kamera izni reddedildi
          Alert.alert(
            'Kamera İzni Gerekli',
            'Kamera izni verilmedi. Resim çekmek için ayarlardan kamera iznini açmanız gerekiyor.',
            [
              { text: 'Tamam', style: 'default' },
              { text: 'Ayarlara Git', onPress: () => {
                // Android ayarlarına yönlendir
                if (Platform.OS === 'android') {
                  Linking.openSettings();
                }
              }}
            ]
          );
          return false;
        } else {
          // Daha sonra sor seçildi
          return false;
        }
      } catch (err) {
        console.warn('❌ Kamera izni hatası:', err);
        Alert.alert('Hata', 'Kamera izni kontrol edilirken bir hata oluştu.');
        return false;
      }
    }
    // iOS - Kamera izni varsayılan olarak true
    return true; // iOS için varsayılan olarak true
  };

  // Kamera ile resim çekme (tek resim)
  const takePhoto = async () => {
    // Kamera butonu basıldı
    
    const remainingSlots = 30 - selectedImages.length;
    if (remainingSlots <= 0) {
      Alert.alert('Uyarı', 'Maksimum 30 resim ekleyebilirsiniz.');
      return;
    }

    // Kamera izinlerini kontrol et
    // İzin kontrolü başlıyor
    const hasPermission = await checkCameraPermissions();
    // İzin kontrolü tamamlandı
    
    if (!hasPermission) {
      // İzin verilmedi, kamera açılmıyor
      return; // checkCameraPermissions zaten kullanıcıya uyarı veriyor
    }

    // İzin var, kamera açılıyor

    ImagePicker.openCamera({
      mediaType: 'photo',
      quality: 0.8,
      compressImageQuality: 0.8,
      includeBase64: false,
      useOriginalPhoto: true,
      forceJpg: true,
      enableRotationGesture: false,
      cropperToolbarTitle: 'Resmi Düzenle',
      cropperChooseText: 'Seç',
      cropperCancelText: 'İptal',
    }).then(image => {
      const sizeInMB = image.size / (1024 * 1024); // Byte'ı MB'ye çevir

      if (sizeInMB <= 5) {
        const newImage = {
          uri: image.path,
          width: image.width,
          height: image.height,
          mime: image.mime,
          size: image.size,
          isUploaded: false,
          cloudinaryUrl: null,
        };

        setSelectedImages(prev => [...prev, newImage]);
      } else {
        Alert.alert(
          'Büyük Resim',
          'Çekilen resim 5MB\'den büyük. Lütfen daha küçük bir resim çekin.',
        );
      }

      setShowImagePicker(false);
    }).catch(error => {
      if (error.code !== 'E_PICKER_CANCELLED') {
        console.error('Kamera hatası:', error);
        Alert.alert('Hata', `Kamera açılırken bir hata oluştu: ${error.message || error.code || 'Bilinmeyen hata'}`);
      }
    });
  };

  // Kamera çekim modunu başlat
  const startCameraMode = () => {
    const remainingSlots = 30 - selectedImages.length;
    if (remainingSlots <= 0) {
      Alert.alert('Uyarı', 'Maksimum 30 resim ekleyebilirsiniz.');
      return;
    }

    setShowCameraMode(true);
    setCameraImages([]);
    setIsCameraActive(true);
  };

  // Sürekli kamera çekim modunu başlat
  const startContinuousCamera = () => {
    const totalImages = selectedImages.length + cameraImages.length;
    if (totalImages >= 30) {
      Alert.alert('Uyarı', 'Maksimum 30 resim ekleyebilirsiniz.');
      return;
    }

    setIsContinuousMode(true);
    isContinuousModeRef.current = true;
    setIsCameraActive(true);

    // Mevcut bekleyen timeout'u temizle
    if (captureTimeoutRef.current) {
      clearTimeout(captureTimeoutRef.current);
      captureTimeoutRef.current = null;
    }

    // State güncellendikten sonra çekimi başlat
    captureTimeoutRef.current = setTimeout(() => {
      // Stop'a basıldıysa yeniden açma
      if (!isContinuousModeRef.current) { return; }
      takeContinuousPhoto();
    }, 100);
  };
  // Sürekli çekim fonksiyonu
  const takeContinuousPhoto = async () => {
    if (isCapturing) {return;}

    // Kamera izinlerini kontrol et
    const hasPermission = await checkCameraPermissions();
    if (!hasPermission) {
      return; // checkCameraPermissions zaten kullanıcıya uyarı veriyor
    }

    setIsCapturing(true);

    ImagePicker.openCamera({
      mediaType: 'photo',
      quality: 0.8,
      compressImageQuality: 0.8,
      includeBase64: false,
      cropping: false,
      useOriginalPhoto: true,
      forceJpg: true,
      enableRotationGesture: false,
    }).then(image => {
      const sizeInMB = image.size / (1024 * 1024); // Byte'ı MB'ye çevir

      if (sizeInMB <= 5) {
        const newImage = {
          uri: image.path,
          width: image.width,
          height: image.height,
          mime: image.mime,
          size: image.size,
          isUploaded: false,
          cloudinaryUrl: null,
        };

        setCameraImages(prev => {
          const updatedImages = [...prev, newImage];

          // Sürekli mod aktifse ve limit dolmadıysa hemen tekrar kamera aç
          if (isContinuousModeRef.current && (selectedImages.length + updatedImages.length) < 30) {
            // Bekleyen timeout varsa temizle
            if (captureTimeoutRef.current) {
              clearTimeout(captureTimeoutRef.current);
              captureTimeoutRef.current = null;
            }
            captureTimeoutRef.current = setTimeout(() => {
              if (!isContinuousModeRef.current) { return; }
              takeContinuousPhoto();
            }, 2000); // 2 saniye bekle ve tekrar aç
          }

          return updatedImages;
        });
      } else {
        Alert.alert(
          'Büyük Resim',
          'Çekilen resim 5MB\'den büyük. Lütfen daha küçük bir resim çekin.',
        );
      }

      setIsCapturing(false);
    }).catch(error => {
      if (error.code !== 'E_PICKER_CANCELLED') {
        console.error('Kamera hatası:', error);
        Alert.alert('Hata', `Kamera açılırken bir hata oluştu: ${error.message || error.code || 'Bilinmeyen hata'}`);
      }
      setIsCapturing(false);
      setIsContinuousMode(false);
      isContinuousModeRef.current = false;
      // Bekleyen timeout'u temizle
      if (captureTimeoutRef.current) {
        clearTimeout(captureTimeoutRef.current);
        captureTimeoutRef.current = null;
      }
    });
  };

  // Sürekli çekimi durdur
  const stopContinuousCamera = () => {
    setIsContinuousMode(false);
    isContinuousModeRef.current = false;
    setIsCameraActive(false);
    // Bekleyen tekrar çekim zamanlayıcısını temizle
    if (captureTimeoutRef.current) {
      clearTimeout(captureTimeoutRef.current);
      captureTimeoutRef.current = null;
    }
  };

  // Tek resim çek
  const takeSinglePhoto = () => {
    const totalImages = selectedImages.length + cameraImages.length;
    if (totalImages >= 30) {
      Alert.alert('Uyarı', 'Maksimum 30 resim ekleyebilirsiniz.');
      return;
    }

    if (isCapturing) {return;}

    setIsCapturing(true);

    ImagePicker.openCamera({
      mediaType: 'photo',
      quality: 0.8,
      compressImageQuality: 0.8,
      includeBase64: false,
    }).then(image => {
      const sizeInMB = image.size / (1024 * 1024); // Byte'ı MB'ye çevir

      if (sizeInMB <= 5) {
        const newImage = {
          uri: image.path,
          width: image.width,
          height: image.height,
          mime: image.mime,
          size: image.size,
          isUploaded: false,
          cloudinaryUrl: null,
        };

        setCameraImages(prev => [...prev, newImage]);
      } else {
        Alert.alert(
          'Büyük Resim',
          'Çekilen resim 5MB\'den büyük. Lütfen daha küçük bir resim çekin.',
        );
      }

      setIsCapturing(false);
    }).catch(error => {
      if (error.code !== 'E_PICKER_CANCELLED') {
        console.error('Kamera hatası:', error);
        Alert.alert('Hata', `Kamera açılırken bir hata oluştu: ${error.message || error.code || 'Bilinmeyen hata'}`);
      }
      setIsCapturing(false);
    });
  };

  // Kamera çekim modunu bitir ve resimleri ekle
  const finishCameraMode = () => {
    if (cameraImages.length > 0) {
      setSelectedImages(prev => [...prev, ...cameraImages]);
      setCameraImages([]);
    }
    setShowCameraMode(false);
    setIsCameraActive(false);
  };

  // Kamera çekim modunu iptal et
  const cancelCameraMode = () => {
    setCameraImages([]);
    setShowCameraMode(false);
    setIsCameraActive(false);
    setIsContinuousMode(false);
    isContinuousModeRef.current = false;
    if (captureTimeoutRef.current) {
      clearTimeout(captureTimeoutRef.current);
      captureTimeoutRef.current = null;
    }
  };

  // Kamera modundaki resmi sil
  const removeCameraImage = (index) => {
    setCameraImages(prev => prev.filter((_, i) => i !== index));
  };

  // Resim sıralama sistemi
  const [showReorderModal, setShowReorderModal] = useState(false);
  const [reorderSequence, setReorderSequence] = useState([]);
  const [currentReorderIndex, setCurrentReorderIndex] = useState(1);

  // Sıralama modal'ını aç
  const openReorderModal = () => {
    setShowReorderModal(true);
    setReorderSequence([]);
    setCurrentReorderIndex(1);
  };

  // Sıralama modal'ını kapat
  const closeReorderModal = () => {
    setShowReorderModal(false);
    setReorderSequence([]);
    setCurrentReorderIndex(1);
  };

  // Resmi sıralamaya ekle
  const addToReorderSequence = (imageIndex) => {
    if (reorderSequence.includes(imageIndex)) return; // Zaten eklenmişse atla
    
    setReorderSequence(prev => [...prev, imageIndex]);
    setCurrentReorderIndex(prev => prev + 1);
  };

  // Sıralamayı uygula
  const applyReorder = () => {
    if (reorderSequence.length === 0) {
      closeReorderModal();
      return;
    }

    // Yeni sıralama oluştur
    const newImages = [...selectedImages];
    const reorderedImages = [];
    
    // Sıralama dizisine göre resimleri yeniden düzenle
    reorderSequence.forEach(index => {
      reorderedImages.push(newImages[index]);
    });
    
    // Kalan resimleri ekle
    newImages.forEach((image, index) => {
      if (!reorderSequence.includes(index)) {
        reorderedImages.push(image);
      }
    });
    
    setSelectedImages(reorderedImages);
    closeReorderModal();
  };

  // Resim seçim modal'ını aç
  const openImagePicker = () => {
    setShowImagePicker(true);
  };

  // Resim silme
  const removeImage = (index) => {
    Alert.alert(
      'Resmi Sil',
      'Bu resmi silmek istediğinizden emin misiniz?',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: () => {
            setSelectedImages(prev => {
              const newImages = prev.filter((_, i) => i !== index);
              // Eğer silinen resim vitrin resmiyse, ilk resmi vitrin yap
              if (featuredImageIndex === index) {
                setFeaturedImageIndex(0);
              } else if (featuredImageIndex > index) {
                setFeaturedImageIndex(featuredImageIndex - 1);
              }
              return newImages;
            });
          },
        },
      ],
    );
  };

  // Vitrin resmi seçme
  const setFeaturedImage = (index) => {
    setFeaturedImageIndex(index);
    Alert.alert('Başarılı', 'Vitrin resmi olarak ayarlandı.');
  };

  // Resim önizleme
  const openImagePreview = (image, index) => {
    setPreviewImage({ ...image, index });
    setShowImagePreview(true);
  };

  // Yeni portföy akışını baştan başlat (tüm form state'lerini sıfırla)
  const resetNewPortfolioFlow = useCallback(() => {
    // Temel form verilerini başlangıç değerlerine getir
    const initialForm = {
      title: '',
      city: userProfile?.city || 'Samsun',
      district: '',
      address: '',
      hideLocation: false,
      price: '',
      netSquareMeters: '',
      grossSquareMeters: '',
      roomCount: '1+1',
      bathroomCount: '',
      balconyCount: '',
      buildingAge: '',
      floor: '',
      totalFloors: '',
      kitchenType: 'Kapalı Mutfak',
      heatingType: 'Doğalgaz',
      parentBathroom: false,
      parking: false,
      glassBalcony: false,
      wardrobe: false,
      furnished: false,
      usageStatus: 'Boş',
      exchange: false,
      deedStatus: 'İskan Mevcut',
      creditLimit: '',
      dues: '',
      deposit: '',
      propertyType: '',
      listingStatus: 'Satılık',
      description: '',
      features: '',
      ownerName: '',
      ownerSurname: '',
      ownerPhone: '',
      doorCode: '',
      keyLocation: '',
      specialNote: '',
      images: [],
      isPublished: true,
    };

    setFormData(initialForm);
    setSelectedImages([]);
    setCameraImages([]);
    setFeaturedImageIndex(0);
    setSelectedLocation(null);
    setCurrentStep(1);
    setDraftId(undefined);
    // Tüm picker/modal state'lerini kapat
    setShowNeighborhoodPicker(false);
    setShowCityPicker(false);
    setShowRoomCountPicker(false);
    setShowDistrictPicker(false);
    setShowAgePicker(false);
    setShowBathroomPicker(false);
    setShowBalconyPicker(false);
    setShowTotalFloorPicker(false);
    setShowCurrentFloorPicker(false);
    setShowNetSquareMetersPicker(false);
    setShowGrossSquareMetersPicker(false);
    setShowDuesPicker(false);
    setShowImagePreview(false);
    setPreviewImage(null);
    setIsSubmitting(false);
    setShowPropertiesSection(false);
    // İlerleme/success state'lerini sıfırla
    setShowProgressModal(false);
    setProgressPercent(0);
    setPhaseImagesDone(false);
    setPhaseDataDone(false);
    setPhaseShareDone(false);
    setShowSuccessModal(false);
    setCreatedPortfolio(null);
  }, [userProfile]);

  // Tüm resimleri yükle (Bunny öncelikli)
  const uploadAllImages = async () => {
    if (selectedImages.length === 0) {return [];}    
    setIsUploadingImages(true);
    const total = selectedImages.length;
    let completed = 0;
    const results = new Array(total).fill(null);
    const concurrency = 4;
    let nextIndex = 0;

    const runNext = async () => {
      const current = nextIndex++;
      if (current >= total) return;
      const image = selectedImages[current];
      try {
        let url = image.cloudinaryUrl;
        if (!image.isUploaded) {
          url = await handleImageUpload(image.uri);
        }
        results[current] = url;
        setSelectedImages(prev => prev.map((img, idx) =>
          idx === current ? { ...img, isUploaded: true, cloudinaryUrl: url } : img,
        ));
      } catch (e) {
        console.error('Image upload failed for index:', current, e.message);
        results[current] = null; // null olarak işaretle, sonra filtrele
      } finally {
        completed += 1;
        const target = Math.min(91, Math.floor((completed / total) * 91));
        setProgressPercent(prev => (prev < target ? target : prev));
        await runNext();
      }
    };

    try {
      const workers = [];
      for (let i = 0; i < Math.min(concurrency, total); i++) {
        workers.push(runNext());
      }
      await Promise.all(workers);
      return results.filter(Boolean);
    } catch (error) {
      Alert.alert('Hata', 'Resimler yüklenirken bir hata oluştu.');
      return [];
    } finally {
      setIsUploadingImages(false);
    }
  };

  const handleSubmit = async () => {
    if (!formData.title || !formData.price || !formData.netSquareMeters) {
      setErrorMessage('Lütfen zorunlu alanları doldurun (Başlık, Fiyat, Net M²)');
      setShowErrorModal(true);
      return;
    }

    if (!user) {
      setErrorMessage('Kullanıcı girişi yapılmamış.');
      setShowErrorModal(true);
      return;
    }

    setIsSubmitting(true);
    setShowProgressModal(true);
    setProgressPercent(0);
    setPhaseImagesDone(false);
    setPhaseDataDone(false);
    setPhaseShareDone(false);

    try {
      // Önce resimleri yükle (ilerleme %91'e kadar)
      const uploadedImageUrls = await uploadAllImages();
      setPhaseImagesDone(true);
      setProgressPercent(prev => (prev < 91 ? 91 : prev));

      // Portföy verilerini hazırla
      // Vitrin resmi null ise, ilk geçerli resmi vitrin yap
      let finalFeaturedIndex = featuredImageIndex;
      if (uploadedImageUrls[featuredImageIndex] === null || uploadedImageUrls[featuredImageIndex] === undefined) {
        finalFeaturedIndex = uploadedImageUrls.findIndex(url => url !== null && url !== undefined);
        if (finalFeaturedIndex === -1) finalFeaturedIndex = 0; // Hiç geçerli resim yoksa 0
      }
      
      const portfolioData = {
        ...formData,
        price: parseInt(formData.price.replace(/\./g, '')), // Noktaları kaldır
        netSquareMeters: parseInt(formData.netSquareMeters),
        grossSquareMeters: formData.grossSquareMeters ? parseInt(formData.grossSquareMeters) : 0,
        bathroomCount: formData.bathroomCount ? parseInt(formData.bathroomCount) : 0,
        balconyCount: formData.balconyCount ? parseInt(formData.balconyCount) : 0,
        buildingAge: formData.buildingAge ? parseInt(formData.buildingAge) : 0,
        floor: formData.floor ? parseInt(formData.floor) : 0,
        totalFloors: formData.totalFloors ? parseInt(formData.totalFloors) : 0,
        creditLimit: formData.creditLimit ? parseInt(formData.creditLimit) : 0,
        dues: formData.dues ? parseInt(formData.dues) : 0,
        deposit: formData.deposit ? parseInt(formData.deposit) : 0,
        isPublished: formData.isPublished, // Yayın durumu
        images: uploadedImageUrls, // Yüklenen resim URL'leri
        featuredImageIndex: finalFeaturedIndex, // Düzeltilmiş vitrin resmi indeksi
        coordinates: selectedLocation ? {
          latitude: selectedLocation.latitude,
          longitude: selectedLocation.longitude,
        } : null, // Haritadan seçilen konum bilgisi
      };

      // Portföy verileri yükleniyor (97'ye kadar simülasyon)
      const resultPromise = addPortfolio(portfolioData, user.uid);
      const start = Date.now();
      while (progressPercent < 97 && Date.now() - start < 800) {
        await new Promise(r => setTimeout(r, 80));
        setProgressPercent(prev => (prev < 97 ? prev + 1 : prev));
      }
      const result = await resultPromise;
      setPhaseDataDone(true);
      setProgressPercent(prev => (prev < 97 ? 97 : prev));

      if (result.success) {
        // Başarılı olduğunda taslağı sil
        await deleteDraft();

        // Paylaşım simülasyonu: %100'e tamamla
        setPhaseShareDone(true);
        const start2 = Date.now();
        while (progressPercent < 100 && Date.now() - start2 < 600) {
          await new Promise(r => setTimeout(r, 60));
          setProgressPercent(prev => (prev < 100 ? prev + 1 : prev));
        }
        setProgressPercent(100);

        // Progress modalını kapat ve başarı modalını aç
        setShowProgressModal(false);
        setCreatedPortfolio(result.portfolio || null);
        setShowSuccessModal(true);
      }
    } catch (error) {
      // console.error('Error adding portfolio:', error);
      setErrorMessage('Portföy kaydedilirken bir hata oluştu: ' + error.message);
      setShowErrorModal(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderInput = (label, field, placeholder, keyboardType = 'default', required = false) => (
    <View style={styles.inputContainer}>
      {renderLabelWithIconBottom(label, required)}
      <TextInput
        style={styles.input}
        value={formData[field]}
        onChangeText={(text) => handleInputChange(field, text)}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textSecondary}
        keyboardType={keyboardType}
      />
    </View>
  );

  // İkonlar ve label helper
  const ICONS = {
    'Oda Sayısı': require('../assets/images/icons/room.png'),
    'Net M²': require('../assets/images/icons/square.png'),
    'Brüt M²': require('../assets/images/icons/squarebrut.png'),
    'Bina Yaşı': require('../assets/images/icons/binayas.png'),
    'Aidat': require('../assets/images/icons/support.png'),
    'Toplam Kat Sayısı': require('../assets/images/icons/toplamkat.png'),
    'Banyo Sayısı': require('../assets/images/icons/bathroom.png'),
    'Bulunduğu Kat': require('../assets/images/icons/stairs.png'),
    'Balkon Sayısı': require('../assets/images/icons/Balcony.png'),
    'Ebeveyn Banyo': require('../assets/images/icons/ebvbath.png'),
    'Otopark': require('../assets/images/icons/parking.png'),
    'Cam Balkon': require('../assets/images/icons/window.png'),
    'Vestiyer': require('../assets/images/icons/cloakroom.png'),
    'Eşyalı': require('../assets/images/icons/furniture.png'),
    'Takas': require('../assets/images/icons/swap.png'),
    'Mutfak Tipi': require('../assets/images/icons/kitchen.png'),
    'Isıtma Tipi': require('../assets/images/icons/boiler.png'),
    'Kullanım Durumu': require('../assets/images/icons/kullanim.png'),
    'Tapu Durumu': require('../assets/images/icons/title.png'),
    'Fiyat (₺)': require('../assets/images/icons/fiyat.png'),
    'Kredi Limiti': require('../assets/images/icons/kredi.png'),
    'Portföy Başlığı': require('../assets/images/icons/baslik.png'),
    'İlan Durumu': require('../assets/images/icons/durumuilan.png'),
    'Portföy Tipi': require('../assets/images/icons/type.png'),
    'Şehir': require('../assets/images/icons/sehir.png'),
    'İlçe': require('../assets/images/icons/ilce.png'),
    'Açık Adres': require('../assets/images/icons/sokak.png'),
  };

  const renderLabelWithIcon = (label, required = false) => (
    <View style={styles.labelRow}>
      {ICONS[label] && (
        <Image source={ICONS[label]} style={styles.labelIcon} />
      )}
      <Text style={[styles.inputLabel, styles.labelText]}>
        {label} {required && <Text style={styles.required}>*</Text>}
      </Text>
    </View>
  );
  const renderLabelWithIconBottom = (label, required = false) => (
    <View style={styles.labelRowBottom}>
      {ICONS[label] && (
        <Image source={ICONS[label]} style={styles.labelIcon} />
      )}
      <Text style={[styles.inputLabel, styles.labelTextBottom]}>
        {label} {required && <Text style={styles.required}>*</Text>}
      </Text>
    </View>
  );

  // Özel input render fonksiyonları
  const renderSquareMetersPicker = (label, field, required = false) => (
    <View style={styles.inputContainer}>
      {renderLabelWithIcon(label, required)}
      <TouchableOpacity
        style={[
          styles.pickerButton,
          formData[field] && styles.pickerButtonActive,
        ]}
        onPress={() => {
          if (field === 'netSquareMeters') {
            setShowNetSquareMetersPicker(true);
          } else if (field === 'grossSquareMeters') {
            setShowGrossSquareMetersPicker(true);
          }
        }}
      >
        <Text style={[
          styles.pickerButtonText,
          !formData[field] && styles.pickerButtonPlaceholder,
          formData[field] && styles.pickerButtonTextActive,
        ]}>
          {formData[field] || 'Seçiniz'}
        </Text>
      </TouchableOpacity>
    </View>
  );

  // Picker render fonksiyonları
  const renderBathroomPicker = (label, field, required = false) => (
    <View style={styles.inputContainer}>
      {renderLabelWithIcon(label, required)}
      <TouchableOpacity
        style={[
          styles.pickerButton,
          formData[field] && styles.pickerButtonActive,
        ]}
        onPress={() => setShowBathroomPicker(true)}
      >
        <Text style={[
          styles.pickerButtonText,
          !formData[field] && styles.pickerButtonPlaceholder,
          formData[field] && styles.pickerButtonTextActive,
        ]}>
          {formData[field] || 'Seçiniz'}
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderBalconyPicker = (label, field, required = false) => (
    <View style={styles.inputContainer}>
      {renderLabelWithIcon(label, required)}
      <TouchableOpacity
        style={[
          styles.pickerButton,
          formData[field] && styles.pickerButtonActive,
        ]}
        onPress={() => setShowBalconyPicker(true)}
      >
        <Text style={[
          styles.pickerButtonText,
          !formData[field] && styles.pickerButtonPlaceholder,
          formData[field] && styles.pickerButtonTextActive,
        ]}>
          {formData[field] || 'Seçiniz'}
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderAgePicker = (label, field, required = false) => (
    <View style={styles.inputContainer}>
      {renderLabelWithIcon(label, required)}
      <TouchableOpacity
        style={[
          styles.pickerButton,
          formData[field] && styles.pickerButtonActive,
        ]}
        onPress={() => setShowAgePicker(true)}
      >
        <Text style={[
          styles.pickerButtonText,
          !formData[field] && styles.pickerButtonPlaceholder,
          formData[field] && styles.pickerButtonTextActive,
        ]}>
          {formData[field] || 'Seçiniz'}
        </Text>
      </TouchableOpacity>
    </View>
  );
  const renderTotalFloorPicker = (label, field, required = false) => (
    <View style={styles.inputContainer}>
      {renderLabelWithIcon(label, required)}
      <TouchableOpacity
        style={[
          styles.pickerButton,
          formData[field] && styles.pickerButtonActive,
        ]}
        onPress={() => setShowTotalFloorPicker(true)}
      >
        <Text style={[
          styles.pickerButtonText,
          !formData[field] && styles.pickerButtonPlaceholder,
          formData[field] && styles.pickerButtonTextActive,
        ]}>
          {formData[field] || 'Seçiniz'}
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderCurrentFloorPicker = (label, field, required = false) => (
    <View style={styles.inputContainer}>
      {renderLabelWithIcon(label, required)}
      <TouchableOpacity
        style={[
          styles.pickerButton,
          formData[field] && styles.pickerButtonActive,
        ]}
        onPress={() => setShowCurrentFloorPicker(true)}
      >
        <Text style={[
          styles.pickerButtonText,
          !formData[field] && styles.pickerButtonPlaceholder,
          formData[field] && styles.pickerButtonTextActive,
        ]}>
          {formData[field] || 'Seçiniz'}
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderDuesPicker = (label, field, required = false) => (
    <View style={styles.inputContainer}>
      {renderLabelWithIcon(label, required)}
      <TouchableOpacity
        style={[
          styles.pickerButton,
          formData[field] && styles.pickerButtonActive,
        ]}
        onPress={() => setShowDuesPicker(true)}
      >
        <Text style={[
          styles.pickerButtonText,
          !formData[field] && styles.pickerButtonPlaceholder,
          formData[field] && styles.pickerButtonTextActive,
        ]}>
          {formData[field] || 'Seçiniz'}
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderPicker = (label, field, options, required = false, customHandler = null) => (
    <View style={styles.inputContainer}>
      {renderLabelWithIconBottom(label, required)}
      <View style={styles.pickerContainer}>
        {options.map((option) => (
          <TouchableOpacity
            key={option.value}
            style={[
              styles.pickerOption,
              formData[field] === option.value && styles.pickerOptionActive,
            ]}
            onPress={() => customHandler ? customHandler(option.value) : handleInputChange(field, option.value)}
          >
            <Text style={[
              styles.pickerOptionText,
              formData[field] === option.value && styles.pickerOptionTextActive,
            ]}>
              {option.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  // Şehir seçimi için özel render fonksiyonu
  const renderCityPicker = (label, field, required = false) => (
    <View style={styles.inputContainer}>
      {renderLabelWithIconBottom(label, required)}
      <TouchableOpacity
        style={styles.halfWidthPickerButton}
        onPress={() => setShowCityPicker(true)}
      >
        <Text style={[
          styles.pickerButtonText,
          !formData[field] && styles.pickerButtonPlaceholder,
        ]}>
          {formData[field] || 'Şehir seçin'}
        </Text>
        <Text style={styles.pickerIcon}>▼</Text>
      </TouchableOpacity>
    </View>
  );

  // Oda sayısı seçimi için özel render fonksiyonu
  const renderRoomCountPicker = (label, field, required = false) => (
    <View style={styles.inputContainer}>
      {renderLabelWithIcon(label, required)}
      <TouchableOpacity
        style={[
          styles.fullWidthPickerButton,
          formData[field] && styles.fullWidthPickerButtonActive,
        ]}
        onPress={() => setShowRoomCountPicker(true)}
      >
        <Text style={[
          styles.pickerButtonText,
          !formData[field] && styles.pickerButtonPlaceholder,
          formData[field] && styles.pickerButtonTextActive,
        ]}>
          {formData[field] || 'Oda sayısı seçin'}
        </Text>
        <Text style={styles.pickerIcon}>▼</Text>
      </TouchableOpacity>
    </View>
  );

  // İlçe seçimi için özel render fonksiyonu
  const renderDistrictPicker = (label, field, required = false) => (
    <View style={styles.inputContainer}>
      {renderLabelWithIconBottom(label, required)}
      <TouchableOpacity
        style={styles.halfWidthPickerButton}
        onPress={() => setShowDistrictPicker(true)}
      >
        <Text style={[
          styles.pickerButtonText,
          !formData[field] && styles.pickerButtonPlaceholder,
        ]}>
          {formData[field] || 'İlçe seçin'}
        </Text>
        <Text style={styles.pickerIcon}>▼</Text>
      </TouchableOpacity>
    </View>
  );

  // Harita ile input render fonksiyonu
  const renderInputWithMap = (label, field, placeholder, keyboardType = 'default', required = false) => (
    <View style={styles.inputContainer}>
      <Text style={styles.inputLabel}>
        {label} {required && <Text style={styles.required}>*</Text>}
      </Text>
      <View style={styles.inputWithButtonContainer}>
        <TextInput
          style={[styles.input, styles.inputWithButton]}
          value={formData[field]}
          onChangeText={(text) => handleInputChange(field, text)}
          placeholder={placeholder}
          keyboardType={keyboardType}
          multiline={true}
          numberOfLines={2}
        />
        {/* Map button removed - functionality integrated into step 4 */}
      </View>
    </View>
  );

  // Tam genişlik picker (2 seçenek için)
  const renderFullWidthPicker = (label, field, options, required = false, customHandler = null) => (
    <View style={styles.inputContainer}>
      {renderLabelWithIconBottom(label, required)}
      <View style={styles.fullWidthPickerContainer}>
        {options.map((option) => (
          <TouchableOpacity
            key={option.value}
            style={[
              field === 'heatingType' ? styles.fullWidthPickerOptionShort : styles.fullWidthPickerOption,
              formData[field] === option.value && styles.fullWidthPickerOptionActive,
            ]}
            onPress={() => customHandler ? customHandler(option.value) : handleInputChange(field, option.value)}
          >
            <Text style={[
              styles.fullWidthPickerOptionText,
              formData[field] === option.value && styles.fullWidthPickerOptionTextActive,
            ]}>
              {option.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  // Tek butonlu seçim (checkbox benzeri)
  const renderSingleButton = (label, field) => (
    <View style={styles.inputContainer}>
      {renderLabelWithIcon(label)}
      <TouchableOpacity
        style={[
          styles.singleButton,
          formData[field] && styles.singleButtonActive,
        ]}
        onPress={() => handleInputChange(field, !formData[field])}
      >
        <Text style={[
          styles.singleButtonText,
          formData[field] && styles.singleButtonTextActive,
        ]}>
          {field === 'furnished'
            ? (formData[field] ? 'Eşyalı: ✓' : 'Eşyasız')
            : (formData[field] ? `${label}: ✓` : label)
          }
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderCheckbox = (label, field) => (
    <TouchableOpacity
      style={styles.checkboxContainer}
      onPress={() => handleInputChange(field, !formData[field])}
    >
      <View style={[
        styles.checkbox,
        formData[field] && styles.checkboxActive,
      ]}>
        {formData[field] && <Text style={styles.checkboxIcon}>✓</Text>}
      </View>
      <Text style={styles.checkboxLabel}>{label}</Text>
    </TouchableOpacity>
  );

  // Seçim ekranı render fonksiyonu
  const renderSelectionScreen = () => (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.selectionScreenContainer}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={handleBackToHome}
        >
          <Image source={require('../assets/images/icons/return.png')} style={styles.backIcon} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Portföy Ekle</Text>
        <View style={styles.headerButtons}>
          <TouchableOpacity
            style={[styles.headerNavButton, styles.headerNavButtonDark, currentStep === 1 && styles.headerNavButtonDisabled]}
            onPress={handlePreviousStep}
            disabled={currentStep === 1}
          >
            <Image source={require('../assets/images/icons/return.png')} style={styles.headerNavIcon} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.headerNavButton, styles.headerNavButtonWide, currentStep === 6 && styles.headerNavButtonDisabled]}
            onPress={handleNextStep}
            disabled={currentStep === 6}
          >
            <Text style={[styles.headerNavText, currentStep === 6 && styles.headerNavTextDisabled]}>İleri</Text>
            <Image source={require('../assets/images/icons/return.png')} style={[styles.headerNavIcon, styles.headerNavIconForward]} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.selectionContainer}>
        <Text style={styles.selectionTitle}>Portföy Türü Seçin</Text>
        <Text style={styles.selectionSubtitle}>Nasıl bir portföy eklemek istiyorsunuz?</Text>

        <View style={styles.selectionCards}>
          {/* Yeni Portföy Ekle */}
          <TouchableOpacity
            style={styles.selectionCard}
            onPress={() => handlePortfolioTypeSelect('new')}
            activeOpacity={0.8}
          >
            <View style={styles.selectionCardIcon}>
              <Text style={styles.selectionCardIconText}>📁</Text>
            </View>
            <Text style={styles.selectionCardTitle}>Yeni Portföy Ekle</Text>
            <Text style={styles.selectionCardDescription}>
              Detaylı bilgilerle yeni bir portföy oluşturun
            </Text>
            <View style={styles.selectionCardArrow}>
              <Text style={styles.selectionCardArrowText}>→</Text>
            </View>
          </TouchableOpacity>

          {/* Hızlı Portföy Ekle */}
          <TouchableOpacity
            style={[styles.selectionCard, styles.selectionCardDisabled]}
            onPress={() => handlePortfolioTypeSelect('quick')}
            activeOpacity={0.8}
          >
            <View style={styles.selectionCardIcon}>
              <Text style={styles.selectionCardIconText}>⚡</Text>
            </View>
            <Text style={styles.selectionCardTitle}>Hızlı Portföy Ekle</Text>
            <Text style={styles.selectionCardDescription}>
              Temel bilgilerle hızlıca portföy ekleyin
            </Text>
            <View style={styles.selectionCardArrow}>
              <Text style={styles.selectionCardArrowText}>→</Text>
            </View>
            <View style={styles.comingSoonBadge}>
              <Text style={styles.comingSoonText}>Yakında</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>
      </View>
    </SafeAreaView>
  );
  // Seçim ekranı kaldırıldı - direkt form gösteriliyor
  return (
    <Animatable.View ref={pageViewRef} style={{ flex: 1 }} useNativeDriver>
    <ImageBackground 
      source={isDark ? require('../assets/images/dark-bg2.png') : require('../assets/images/light-bg.jpg')} 
      defaultSource={isDark ? require('../assets/images/dark-bg2.png') : require('../assets/images/light-bg.jpg')}
      fadeDuration={0}
      style={[styles.bgImage, { backgroundColor: isDark ? '#071317' : '#FFFFFF' }]}
    >
    <SafeAreaView edges={['left','right','bottom']} style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        enabled={Platform.OS === 'ios'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <View style={styles.container}>
          <View style={[styles.header, { paddingTop: Math.max(insets.top, 0) + 12, paddingBottom: theme.spacing.lg, position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20 }]}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={handleBackToHome}
            >
              <Image source={require('../assets/images/icons/return.png')} style={styles.backIcon} />
            </TouchableOpacity>
            <View style={styles.headerCenter}>
              <Text style={[styles.headerTitle, isDark && { color: theme.colors.white }]}>
                {isDraftMode ? 'Taslak Portföy - Devam Et' : (selectedPortfolioType === 'new' ? 'Yeni Portföy Ekle' : 'Hızlı Portföy Ekle')}
              </Text>
              <View style={styles.stepIndicatorRow}>
                <Text style={styles.stepIndicator}>Adım {currentStep} / {totalSteps}</Text>
                <Text style={styles.stepIndicatorPercent}>{computeCompletionPercent()}%</Text>
              </View>
            </View>
            <View style={styles.headerButtons}>
              {currentStep > 1 && (
                <TouchableOpacity
                  style={[styles.headerNavButton, styles.headerNavButtonDark]}
                  onPress={handlePreviousStep}
                >
                  <Image source={require('../assets/images/icons/return.png')} style={styles.headerNavIcon} />
                </TouchableOpacity>
              )}
              {currentStep < totalSteps && (
                <TouchableOpacity
                  style={[
                    styles.headerNavButton,
                    styles.headerNavButtonWide,
                    !canProceedNext && styles.headerNavButtonDisabled,
                  ]}
                  onPress={handleNextStep}
                >
                  <Text style={styles.headerNavText}>İleri</Text>
                  <Image source={require('../assets/images/icons/return.png')} style={[styles.headerNavIcon, styles.headerNavIconForward, styles.headerNavIconNoGap]} />
                </TouchableOpacity>
              )}
              {currentStep === totalSteps && (
                <TouchableOpacity
                  style={[styles.headerNavButton, styles.headerNavButtonWide, isSubmitting && styles.headerNavButtonDisabled]}
                  onPress={handleSubmit}
                  disabled={isSubmitting}
                >
                  <Image source={require('../assets/images/icons/save.png')} style={styles.headerNavIcon} />
                  <Text style={[styles.headerNavText, styles.saveButtonTextCompact]}>{isSubmitting ? 'Kaydediliyor...' : 'Kaydet'}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Spacer: header yüksekliği kadar boşluk */}
          <View style={{ height: Math.max(insets.top, 0) + 12 + 37 + (theme.spacing?.lg || 16) }} />

          <ScrollView
            style={styles.content}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {!!validationMessage && showValidationHint && currentStep < totalSteps && (
              <View style={styles.validationBanner}>
                <Text style={styles.validationBannerText}>{validationMessage}</Text>
              </View>
            )}
            {/* 1. Adım: Temel Bilgiler */}
            {currentStep === 1 && (
              <>
                <View style={styles.stepTitleBadge}>
                  <View style={styles.stepTitleRow}>
                    <Image source={require('../assets/images/icons/portfoy.png')} style={styles.stepTitleIcon} />
                    <Text style={styles.stepTitle}>Temel Bilgiler</Text>
                  </View>
                </View>
                <Animated.View 
                  style={[
                    styles.wizardStep,
                    {
                      transform: [
                        { translateY: slideYAnim },
                        { translateX: slideXAnim },
                        { scale: scaleAnim },
                        { rotate: rotateAnim.interpolate({
                          inputRange: [-15, 0, 15],
                          outputRange: ['-15deg', '0deg', '15deg'],
                        })},
                        { 
                          scaleX: bounceAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [1, 1.05],
                          })
                        }
                      ],
                      opacity: fadeAnim,
                    }
                  ]}
                >
                  

                <GlassmorphismView
                  style={[styles.section, styles.sectionGlassOverrides]}
                  borderRadius={15}
                  blurEnabled={false}
                  config={stepPrimaryCardConfig}
                  borderWidth={0.4}
                  borderColor={'rgba(255, 255, 255, 0.43)'}
                >
                  {renderInput('Portföy Başlığı', 'title', 'Portföy başlığı girin', 'default', true)}

                  {renderFullWidthPicker('İlan Durumu', 'listingStatus', [
                    { value: 'Satılık', label: 'Satılık' },
                    { value: 'Kiralık', label: 'Kiralık' },
                  ], true)}

                  {renderPicker('Portföy Tipi', 'propertyType', propertyTypes, true, handlePropertyTypeChange)}
                </GlassmorphismView>
                </Animated.View>
              </>
            )}

            {/* 2. Adım: Fiyat ve Kredi Bilgisi */}
            {currentStep === 2 && (
              <>
                <View style={styles.stepTitleBadge}>
                  <View style={styles.stepTitleRow}>
                    <Image source={require('../assets/images/icons/portfoy.png')} style={styles.stepTitleIcon} />
                    <Text style={styles.stepTitle}>Fiyat ve Kredi Bilgisi</Text>
                  </View>
                </View>
                <Animated.View 
                  style={[
                    styles.wizardStep,
                    {
                      transform: [
                        { translateY: slideYAnim },
                        { translateX: slideXAnim },
                        { scale: scaleAnim },
                        { rotate: rotateAnim.interpolate({
                          inputRange: [-15, 0, 15],
                          outputRange: ['-15deg', '0deg', '15deg'],
                        })},
                        { 
                          scaleX: bounceAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [1, 1.05],
                          })
                        }
                      ],
                      opacity: fadeAnim,
                    }
                  ]}
                >
                  

                <GlassmorphismView
                  style={[styles.section, styles.sectionGlassOverrides]}
                  borderRadius={15}
                  blurEnabled={false}
                  config={stepPrimaryCardConfig}
                  borderWidth={0.4}
                  borderColor={'rgba(255, 255, 255, 0.43)'}
                >
                  {renderInput('Fiyat (₺)', 'price', 'Fiyat girin', 'numeric', true)}
                  {renderInput('Kredi Limiti', 'creditLimit', 'Kredi limiti girin', 'numeric')}
                </GlassmorphismView>

              </Animated.View>
              </>
            )}

            {/* 3. Adım: Özellikler */}
            {currentStep === 3 && (
              <>
                <View style={styles.stepTitleBadge}>
                  <View style={styles.stepTitleRow}>
                    <Image source={require('../assets/images/icons/portfoy.png')} style={styles.stepTitleIcon} />
                    <Text style={styles.stepTitle}>Özellikler</Text>
                  </View>
                </View>
                <Animated.View 
                  style={[
                    styles.wizardStep,
                    {
                      transform: [
                        { translateY: slideYAnim },
                        { translateX: slideXAnim },
                        { scale: scaleAnim },
                        { rotate: rotateAnim.interpolate({
                          inputRange: [-15, 0, 15],
                          outputRange: ['-15deg', '0deg', '15deg'],
                        })},
                        { 
                          scaleX: bounceAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [1, 1.05],
                          })
                        }
                      ],
                      opacity: fadeAnim,
                    }
                  ]}
                >
                <GlassmorphismView
                  style={[styles.section, styles.sectionGlassOverrides]}
                  borderRadius={15}
                  blurEnabled={false}
                  config={stepPrimaryCardConfig}
                  borderWidth={0.4}
                  borderColor={'rgba(255, 255, 255, 0.43)'}
                >
                  {renderRoomCountPicker('Oda Sayısı', 'roomCount', true)}

                  <View style={styles.crimsonDivider} />

                  {/* 1. Satır: Net M² (sol), Brüt M² (orta), Bina Yaşı (sağ) */}
                  <View style={styles.rowContainer}>
                    <View style={styles.thirdWidth}>
                      {renderSquareMetersPicker('Net M²', 'netSquareMeters', true)}
                    </View>
                    <View style={styles.thirdWidth}>
                      {renderSquareMetersPicker('Brüt M²', 'grossSquareMeters')}
                    </View>
                    <View style={styles.thirdWidth}>
                      {renderAgePicker('Bina Yaşı', 'buildingAge', true)}
                    </View>
                  </View>

                  {/* 2. Satır: Aidat (sol), Banyo Sayısı (orta), Balkon Sayısı (sağ) */}
                  <View style={styles.rowContainer}>
                    <View style={styles.thirdWidth}>
                      {renderDuesPicker('Aidat', 'dues')}
                    </View>
                    <View style={styles.thirdWidth}>
                      {renderBathroomPicker('Banyo Sayısı', 'bathroomCount', true)}
                    </View>
                    <View style={styles.thirdWidth}>
                      {renderBalconyPicker('Balkon Sayısı', 'balconyCount', true)}
                    </View>
                  </View>

                  {/* 3. Satır: Toplam Kat Sayısı (sol), Bulunduğu Kat (sağ) */}
                  <View style={[styles.rowContainer, styles.rowContainerShiftRight]}>
                    <View style={styles.thirdWidth}>
                      {renderTotalFloorPicker('Toplam Kat Sayısı', 'totalFloors', true)}
                    </View>
                    <View style={styles.thirdWidth}>
                      {renderCurrentFloorPicker('Bulunduğu Kat', 'floor', true)}
                    </View>
                    <View style={styles.thirdWidth}>
                      {/* Boş alan - 3'lü düzen için */}
                    </View>
                  </View>

                  <View style={styles.crimsonDivider} />

                  {/* 1. Satır: Ebeveyn Banyosu, Otopark, Cam Balkon */}
                  <View style={styles.singleButtonRowContainer}>
                    <View style={styles.thirdWidth}>
                      {renderSingleButton('Ebeveyn Banyo', 'parentBathroom')}
                    </View>
                    <View style={styles.thirdWidth}>
                      {renderSingleButton('Otopark', 'parking')}
                    </View>
                    <View style={styles.thirdWidth}>
                      {renderSingleButton('Cam Balkon', 'glassBalcony')}
                    </View>
                  </View>

                  {/* 2. Satır: Vestiyer, Eşyalı, Takas */}
                  <View style={styles.singleButtonRowContainer}>
                    <View style={styles.thirdWidth}>
                      {renderSingleButton('Vestiyer', 'wardrobe')}
                    </View>
                    <View style={styles.thirdWidth}>
                      {renderSingleButton('Eşyalı', 'furnished')}
                    </View>
                    <View style={styles.thirdWidth}>
                      {renderSingleButton('Takas', 'exchange')}
                    </View>
                  </View>

                  <View style={styles.crimsonDivider} />

                  {renderFullWidthPicker('Mutfak Tipi', 'kitchenType', kitchenTypes, true)}
                  {renderFullWidthPicker('Isıtma Tipi', 'heatingType', heatingTypes)}

                  {renderFullWidthPicker('Kullanım Durumu', 'usageStatus', usageStatuses, true)}

                  {renderPicker('Tapu Durumu', 'deedStatus', deedStatuses)}

                  {/* Kiralık ise depozito alanı */}
                  {formData.listingStatus === 'Kiralık' &&
                    renderInput('Depozito', 'deposit', 'Depozito girin', 'numeric')
                  }
                </GlassmorphismView>
                </Animated.View>
              </>
            )}

            {/* 4. Adım: Konum Bilgileri */}
            {currentStep === 4 && (
              <>
                <View style={styles.stepTitleBadge}>
                  <View style={styles.stepTitleRow}>
                    <Image source={require('../assets/images/icons/portfoy.png')} style={styles.stepTitleIcon} />
                    <Text style={styles.stepTitle}>Konum Bilgileri</Text>
                  </View>
                </View>
                <Animated.View 
                  style={[
                    styles.wizardStep,
                    {
                      transform: [
                        { translateY: slideYAnim },
                        { translateX: slideXAnim },
                        { scale: scaleAnim },
                        { rotate: rotateAnim.interpolate({
                          inputRange: [-15, 0, 15],
                          outputRange: ['-15deg', '0deg', '15deg'],
                        })},
                        { 
                          scaleX: bounceAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [1, 1.05],
                          })
                        }
                      ],
                      opacity: fadeAnim,
                    }
                  ]}
                >
                  

                <GlassmorphismView
                  style={[styles.section, styles.sectionGlassOverrides]}
                  borderRadius={15}
                  blurEnabled={false}
                  config={stepPrimaryCardConfig}
                  borderWidth={0.4}
                  borderColor={'rgba(255, 255, 255, 0.43)'}
                >
                  {/* Şehir ve İlçe aynı satırda */}
                  <View style={styles.rowContainer}>
                    <View style={styles.halfWidth}>
                      {renderCityPicker('Şehir', 'city', true)}
                    </View>
                    <View style={styles.halfWidth}>
                      {renderDistrictPicker('İlçe', 'district', true)}
                    </View>
                  </View>
                  
                  {renderInput('Açık Adres', 'address', 'Haritadan pin seçerek otomatik doldurun', 'default', true)}

                  {/* Harita Kartı */}
                  <View style={styles.mapCard}>
                    <View style={styles.mapCardHeader}>
                      <Text style={styles.mapCardTitle}>Konum Seçimi</Text>
            <TouchableOpacity
                style={[
                  styles.currentLocationButton,
                  !formData.district && { opacity: 0.5 }
                ]}
                onPress={formData.district ? focusOnCurrentLocation : null}
                disabled={!formData.district}
              >
                <Text style={styles.currentLocationIcon}>📍</Text>
                <Text style={styles.currentLocationButtonText}>Mevcut Konum</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.mapCardContainer}>
              <MapboxGL.MapView
                ref={mapRef}
                style={styles.mapCardMap}
                styleURL={MapboxGL.StyleURL.Street}
                onPress={formData.district ? handleMapPress : null}
                attributionEnabled={false}
                pitch={35}
                heading={0}
                logoEnabled={false}
                scaleBarEnabled={false}
                compassEnabled={false}
                scrollEnabled={formData.district ? true : false}
                zoomEnabled={formData.district ? true : false}
                pitchEnabled={formData.district ? true : false}
                rotateEnabled={formData.district ? true : false}
                surfaceView={true}
                localizeLabels={Platform.OS === 'ios' ? { locale: 'en-US' } : true}
                requestDisallowInterceptTouchEvent={true}
                maxBounds={[
                  [25.5, 35.8], // Güneybatı köşe
                  [44.8, 42.1], // Kuzeydoğu köşe
                ]}
                onDidFinishLoadingMap={() => {
                  // Konum izni kontrol et ve takip başlat
                  checkLocationPermission().then((hasPermission) => {
                    if (hasPermission) {
                      getUserLocation();
                    }
                  });

                  // İlk yüklemede profildeki şehre odaklan
                  if (!initialCameraSet.current) {
                    // Profildeki şehre göre ilk odak
                    const cityCoordinates = {
                      // Büyük şehirler
                      'İstanbul': [28.9784, 41.0082],
                      'Ankara': [32.8597, 39.9334],
                      'İzmir': [27.1428, 38.4192],
                      'Bursa': [29.0610, 40.1826],
                      'Antalya': [30.7133, 36.8969],
                      'Adana': [35.3213, 37.0000],
                      'Konya': [32.4816, 37.8667],
                      'Gaziantep': [37.3828, 37.0662],
                      'Mersin': [34.6415, 36.8000],
                      'Kayseri': [35.4787, 38.7312],
                      'Eskişehir': [30.5206, 39.7767],
                      'Diyarbakır': [40.2181, 37.9144],
                      'Samsun': [36.2871, 41.2928],
                      'Denizli': [29.0875, 37.7765],
                      'Şanlıurfa': [38.7969, 37.1674],
                      'Adapazarı': [30.4037, 40.7589],
                      'Malatya': [38.3552, 38.3095],
                      'Kahramanmaraş': [36.9267, 37.5858],
                      'Erzurum': [41.2769, 39.9208],
                      'Van': [43.4089, 38.4891],
                      'Batman': [41.1351, 37.8812],
                      'Elazığ': [39.2264, 38.6810],
                      'İzmit': [29.9167, 40.7654],
                      'Manisa': [27.4305, 38.6191],
                      'Sivas': [37.0179, 39.7477],
                      'Gebze': [29.4173, 40.8027],
                      'Balıkesir': [27.8826, 39.6484],
                      'Tarsus': [34.8815, 36.9177],
                      'Kütahya': [29.9833, 39.4167],
                      'Trabzon': [39.7168, 41.0015],
                      'Çorum': [34.9249, 40.5506],
                      'Adıyaman': [38.2786, 37.7648],
                      'Osmaniye': [36.2474, 37.0742],
                      'Kırıkkale': [33.5153, 39.8468],
                      'Antakya': [36.1612, 36.2012],
                      'Aydın': [27.8416, 37.8560],
                      'İskenderun': [36.1744, 36.5877],
                      'Uşak': [29.4058, 38.6823],
                      'Düzce': [31.1565, 40.8438],
                      'Isparta': [30.5566, 37.7648],
                      'Çanakkale': [26.4142, 40.1553],
                      'Afyon': [30.5387, 38.7507],
                      'Zonguldak': [31.7987, 41.4564],
                      'Karaman': [33.2287, 37.1759],
                      'Kırşehir': [34.1709, 39.1425],
                      'Bartın': [32.3375, 41.5811],
                      'Edirne': [26.5557, 41.6818],
                      'Kars': [40.6013, 40.6167],
                      'Muğla': [28.3665, 37.2153],
                      'Tekirdağ': [27.5109, 40.9833],
                      'Ordu': [37.8764, 40.9839],
                      'Giresun': [38.3895, 40.9128],
                      'Bolu': [31.6061, 40.7394],
                      'Nevşehir': [34.6857, 38.6939],
                      'Sinop': [35.1530, 42.0231],
                      'Kırklareli': [27.2167, 41.7333],
                      'Yozgat': [34.8147, 39.8181],
                      'Rize': [40.5234, 41.0201],
                      'Niğde': [34.6857, 37.9667],
                      'Aksaray': [34.0254, 38.3687],
                      'Kastamonu': [33.7827, 41.3887],
                      'Çankırı': [33.6134, 40.6013],
                      'Amasya': [35.8353, 40.6499],
                      'Tokat': [36.5544, 40.3167],
                      'Artvin': [41.8183, 41.1828],
                      'Bilecik': [29.9833, 40.1167],
                      'Burdur': [30.2906, 37.7267],
                      'Karabük': [32.6204, 41.2061],
                      'Yalova': [29.2769, 40.6500],
                      'Ardahan': [42.7022, 41.1105],
                      'Iğdır': [44.0450, 39.8880],
                      'Şırnak': [42.4918, 37.4187],
                      'Mardin': [40.7245, 37.3212],
                      'Muş': [41.7539, 38.9462],
                      'Bingöl': [40.7696, 38.8846],
                      'Solhan': [41.0492, 38.9689],
                      'Bitlis': [42.1232, 38.4011],
                      'Hakkari': [43.7333, 37.5833],
                      'Siirt': [41.9594, 37.9333],
                      'Tunceli': [39.5401, 39.1079],
                      'Bayburt': [40.2552, 40.2552]
                    };

                    const userCity = userProfile?.city || 'Samsun';
                    const coords = cityCoordinates[userCity] || [36.2871, 41.2928];

                    if (cameraRef.current) {
                      cameraRef.current.setCamera({
                        centerCoordinate: coords,
                        zoomLevel: 15,
                        animationDuration: 1000,
                      });
                      initialCameraSet.current = true;
                    }
                  }

                  // İlçe seçildiğinde o ilçeye odaklan
                  if (formData.district) {
                    const districtCoordinates = {
                      'Atakum': [36.2871, 41.2928],
                      'İlkadım': [36.3300, 41.2900],
                      'Canik': [36.2500, 41.2500],
                      'Tekkeköy': [36.2000, 41.2000],
                      'Bafra': [35.9000, 41.5500],
                      'Çarşamba': [36.1000, 41.2000],
                      'Havza': [35.8000, 41.1000],
                      'Kavak': [36.0000, 41.0000],
                      'Ladik': [35.7000, 41.0000],
                      'Salıpazarı': [36.1500, 41.1500],
                      'Terme': [36.0500, 41.1000],
                      'Vezirköprü': [35.6000, 41.2000],
                      'Yakakent': [35.5000, 41.6000],
                      '19 Mayıs': [36.2000, 41.3000],
                      'Alaçam': [35.6000, 41.3000],
                      'Asarcık': [36.0000, 41.4000],
                      'Ayvacık': [36.1000, 41.3500],
                    };

                    const coords = districtCoordinates[formData.district] || [36.2871, 41.2928];
                    if (cameraRef.current) {
                      cameraRef.current.setCamera({
                        centerCoordinate: coords,
                        zoomLevel: 15,
                        animationDuration: 1000,
                      });
                    }
                    initialCameraSet.current = true;
                  }
                }}
              >
                <MapboxGL.Camera
                  ref={cameraRef}
                />

                {/* Pin resimleri */}
                <MapboxGL.Images
                  images={{
                    'pin-satilik': require('../assets/images/icons/spin.png'),
                    'pin-kiralik': require('../assets/images/icons/kpin.png'),
                    'pin-own-satilik': require('../assets/images/icons/smypin.png'),
                    'pin-own-kiralik': require('../assets/images/icons/kmypin.png'),
                    'user-location-pin': require('../assets/images/icons/ppin.png'),
                  }}
                />

                {selectedLocation && (
                  <MapboxGL.ShapeSource
                    id="selectedLocation"
                    shape={{
                      type: 'Feature',
                      geometry: {
                        type: 'Point',
                        coordinates: [selectedLocation.longitude, selectedLocation.latitude],
                      },
                    }}
                  >
                    <MapboxGL.SymbolLayer
                      id="selectedLocationPin"
                      style={{
                        iconImage: formData.type === 'Satılık' ? 'pin-own-satilik' : 'pin-own-kiralik',
                        iconSize: selectedPinSize,
                        iconAnchor: 'bottom',
                        iconAllowOverlap: true,
                        iconIgnorePlacement: true,
                      }}
                    />
                  </MapboxGL.ShapeSource>
                )}

                {/* Kullanıcı Konumu Marker'ı */}
                {userLocation && (
                  <MapboxGL.ShapeSource
                    id="user-location-source"
                    shape={{
                      type: 'Feature',
                      geometry: {
                        type: 'Point',
                        coordinates: userLocation,
                      },
                      properties: {},
                    }}
                  >
                    <MapboxGL.SymbolLayer
                      id="user-location-pin"
                      style={{
                        iconImage: 'user-location-pin',
                        iconSize: userPinSize,
                        iconAnchor: 'bottom',
                        iconAllowOverlap: true,
                        iconIgnorePlacement: true,
                      }}
                      onPress={() => {
                        // Tooltip göster
                        setShowLocationTooltip(true);
                        
                        // Fade in animasyonu
                        Animated.timing(tooltipOpacity, {
                          toValue: 1,
                          duration: 300,
                          useNativeDriver: true,
                        }).start();
                        
                        // 3 saniye sonra otomatik kapat
                        setTimeout(() => {
                          Animated.timing(tooltipOpacity, {
                            toValue: 0,
                            duration: 500,
                            useNativeDriver: true,
                          }).start(() => {
                            setShowLocationTooltip(false);
                          });
                        }, 3000);
                      }}
                    />
                  </MapboxGL.ShapeSource>
                )}

                {/* Türkiye Dışı Alan Maskesi - Sadece Türkiye görünsün */}
                <MapboxGL.ShapeSource
                  id="turkey-mask"
                  shape={turkeyMaskGeoJson}
                >
                  <MapboxGL.FillLayer
                    id="turkey-mask-fill"
                    style={{
                      fillColor: '#85d7ff', // Özel deniz mavisi
                      fillOpacity: 1.0, // %100 opak - Türkiye dışı tamamen kapalı
                    }}
                  />
                </MapboxGL.ShapeSource>

              </MapboxGL.MapView>
              
              {/* Konum Tooltip - "Buradasınız" baloncuğu */}
              {showLocationTooltip && userLocation && (
                <Animated.View
                  style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: [
                      { translateX: -60 },
                      { translateY: -80 },
                    ],
                    opacity: tooltipOpacity,
                  }}
                >
                  <View
                    style={{
                      backgroundColor: 'rgba(0, 0, 0, 0.8)',
                      paddingHorizontal: 16,
                      paddingVertical: 8,
                      borderRadius: 20,
                      borderWidth: 2,
                      borderColor: '#2196F3',
                      shadowColor: '#000',
                      shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 0.3,
                      shadowRadius: 8,
                      elevation: 8,
                    }}
                  >
                    <Text
                      style={{
                        color: '#FFFFFF',
                        fontSize: 14,
                        fontWeight: '600',
                        textAlign: 'center',
                      }}
                    >
                      📍 Burdasınız
                    </Text>
                  </View>
                  
                  {/* Ok işareti */}
                  <View
                    style={{
                      position: 'absolute',
                      bottom: -8,
                      left: '50%',
                      transform: [{ translateX: -8 }],
                      width: 0,
                      height: 0,
                      backgroundColor: 'transparent',
                      borderStyle: 'solid',
                      borderLeftWidth: 8,
                      borderRightWidth: 8,
                      borderTopWidth: 8,
                      borderLeftColor: 'transparent',
                      borderRightColor: 'transparent',
                      borderTopColor: '#2196F3',
                    }}
                  />
                </Animated.View>
              )}

              {/* İlçe Seçimi Overlay */}
              {!formData.district && (
                <View
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(220, 20, 60, 0.85)', // Krimson overlay
                    justifyContent: 'center',
                    alignItems: 'center',
                    borderRadius: 8, // Azaltılmış radius
                  }}
                >
                  <View
                    style={{
                      backgroundColor: 'rgba(255, 255, 255, 0.95)',
                      paddingHorizontal: 24,
                      paddingVertical: 20,
                      borderRadius: 16,
                      alignItems: 'center',
                      shadowColor: '#000',
                      shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 0.3,
                      shadowRadius: 8,
                      elevation: 8,
                      borderWidth: 2,
                      borderColor: '#DC143C',
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 18,
                        fontWeight: 'bold',
                        color: '#DC143C',
                        textAlign: 'center',
                        marginBottom: 8,
                      }}
                    >
                      İlçe Seçimi Gerekli
                    </Text>
                    <Text
                      style={{
                        fontSize: 14,
                        color: '#666',
                        textAlign: 'center',
                        lineHeight: 20,
                      }}
                    >
                      Haritayı kullanabilmek için{'\n'}önce bir ilçe seçin
                    </Text>
                  </View>
                </View>
              )}
            </View>
          </View>

                  {/* Konumu Gizle Seçeneği */}
                  <View style={[styles.switchContainer, { marginTop: theme.spacing.lg }]}>
                    <View style={styles.labelRowBottom}>
                      <Image source={require('../assets/images/icons/View_hide2x.png')} style={styles.labelIcon} />
                      <Text style={[styles.switchLabel, styles.labelTextBottom]}>Konumu Gizle</Text>
                    </View>
                    <Switch
                      value={formData.hideLocation}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, hideLocation: value }))}
                      trackColor={{ false: '#FFFFFF', true: '#FFFFFF' }}
                      thumbColor={formData.hideLocation ? '#4CAF50' : '#f4f3f4'}
                    />
                  </View>
                  <Text style={styles.switchDescription}>
                    {formData.hideLocation
                      ? 'Konum bilgileri sadece siz tarafınızdan görülebilir'
                      : 'Konum bilgileri herkese açık olarak görüntülenir'
                    }
                  </Text>
                </GlassmorphismView>
                </Animated.View>
              </>
            )}

            {/* 5. Adım: Resimler */}
            {currentStep === 5 && (
              <>
                <View style={styles.stepTitleBadge}>
                  <View style={styles.stepTitleRow}>
                    <Image source={require('../assets/images/icons/portfoy.png')} style={styles.stepTitleIcon} />
                    <Text style={styles.stepTitle}>Portföy Görselleri</Text>
                  </View>
                </View>
                <Animated.View 
                  style={[
                    styles.wizardStep,
                    {
                      transform: [
                        { translateY: slideYAnim },
                        { translateX: slideXAnim },
                        { scale: scaleAnim },
                        { rotate: rotateAnim.interpolate({
                          inputRange: [-15, 0, 15],
                          outputRange: ['-15deg', '0deg', '15deg'],
                        })},
                        { 
                          scaleX: bounceAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [1, 1.05],
                          })
                        }
                      ],
                      opacity: fadeAnim,
                    }
                  ]}
                >
                  

                <GlassmorphismView
                  style={[styles.section, styles.sectionGlassOverrides]}
                  borderRadius={15}
                  blurEnabled={false}
                  config={stepPrimaryCardConfig}
                  borderWidth={0.4}
                  borderColor={'rgba(255, 255, 255, 0.43)'}
                >
                  <View style={styles.labelRowBottom}>
                    <Image source={require('../assets/images/icons/gallery.png')} style={styles.labelIcon} />
                    <Text style={[styles.sectionTitle, styles.labelTextBottom]}>Resimler <Text style={styles.required}>*</Text> <Text style={styles.stepTitleNote}>"Maksimum 30 resim ekleyebilirsiniz"</Text></Text>
                  </View>
                  <Text style={styles.sectionSubtitle}>
                    Maksimum 30 resim ekleyebilirsiniz. İlk resim vitrin resmi olarak görünecektir.
                  </Text>

                  {/* Resim Ekleme Butonları */}
                  <View style={styles.imageButtonsContainer}>
                    <TouchableOpacity
                      style={[styles.imageButton, styles.galleryButton]}
                      onPress={selectFromGallery}
                      disabled={selectedImages.length >= 30}
                    >
                      <Image source={require('../assets/images/icons/gallery.png')} style={styles.imageButtonIconImage} />
                      <Text style={styles.imageButtonText}>Galeri</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.imageButton, styles.cameraButton]}
                      onPress={startCameraMode}
                      disabled={selectedImages.length >= 30}
                    >
                      <Image source={require('../assets/images/icons/camera.png')} style={styles.imageButtonIconImage} />
                      <Text style={styles.imageButtonText}>Kamera</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Resim Sayısı */}
                  <Text style={styles.imageCountText}>
                    {selectedImages.length}/30 resim seçildi
                  </Text>

                  {/* Butonlar */}
                  {selectedImages.length > 0 && (
                    <View style={styles.imageActionButtons}>
                      {/* Sıralamayı Düzenle */}
                      <TouchableOpacity
                        style={[styles.clearAllButton, styles.reorderButton]}
                        onPress={openReorderModal}
                      >
                        <Image source={require('../assets/images/icons/star.png')} style={styles.clearAllIcon} />
                        <Text style={styles.clearAllText}>Sıralamayı Düzenle</Text>
                      </TouchableOpacity>

                      {/* Tümünü Kaldır */}
                      <TouchableOpacity
                        style={styles.clearAllButton}
                        onPress={() => setShowClearAllModal(true)}
                      >
                        <Image source={require('../assets/images/icons/deletephoto.png')} style={styles.clearAllIcon} />
                        <Text style={styles.clearAllText}>Tümünu Kaldır</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Seçilen Resimler */}
                  {selectedImages.length > 0 && (
                    <View style={styles.selectedImagesContainer}>
                      <View style={styles.selectedImagesHeader}>
                        <Text style={styles.selectedImagesTitle}>Seçilen Resimler:</Text>
                      </View>
                      <View style={styles.imageGrid}>
                        {selectedImages.map((item, index) => {
                          const stableKey = item.uri || index.toString();
                          
                          return (
                            <View key={stableKey} style={styles.imageItem}>
                              <View
                                style={[
                                  styles.imagePreview,
                                  index === featuredImageIndex && styles.featuredImagePreview,
                                ]}
                              >
                                <TouchableOpacity
                                  activeOpacity={0.9}
                                  onPress={() => openImagePreview(item, index)}
                                  style={styles.imageTouchable}
                                >
                                  <Image source={{ uri: item.uri }} style={styles.imageThumbnail} />
                                </TouchableOpacity>
                              </View>

                            <View style={styles.imageActions}>
                              <TouchableOpacity
                                style={styles.actionButton}
                                onPress={() => setFeaturedImage(index)}
                              >
                                <Image source={require('../assets/images/icons/star.png')} style={styles.actionIcon} />
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={[styles.actionButton, styles.removeButton]}
                                onPress={() => removeImage(index)}
                              >
                                <Image source={require('../assets/images/icons/deletephoto.png')} style={styles.actionIcon} />
                              </TouchableOpacity>
                            </View>
                          </View>
                          );
                        })}
                      </View>
                    </View>
                  )}
                </GlassmorphismView>
                {/* Video Bölümü */}
                <GlassmorphismView
                  style={[styles.section, styles.sectionGlassOverrides]}
                  borderRadius={15}
                  blurEnabled={false}
                  config={stepPrimaryCardConfig}
                  borderWidth={0.4}
                  borderColor={'rgba(255, 255, 255, 0.43)'}
                >
                  <View style={styles.labelRowBottom}>
                    <Image source={require('../assets/images/icons/video.png')} style={styles.labelIcon} />
                    <Text style={[styles.sectionTitle, styles.labelTextBottom]}>Video <Text style={styles.stepTitleNote}>"En fazla 1 dakikalık video yükleyebilirsiniz."</Text></Text>
                  </View>

                  <Text style={[styles.sectionSubtitle, { textAlign: 'left' }]}>Maksimum 1 adet video ekleyebilirsiniz.</Text>

                  <View style={styles.imageButtonsContainer}>
                    <TouchableOpacity
                      style={[styles.imageButton, styles.galleryButton]}
                      onPress={() => { /* Video galeri seçimi daha sonra eklenecek */ }}
                    >
                      <Image source={require('../assets/images/icons/gallery.png')} style={styles.imageButtonIconImage} />
                      <Text style={styles.imageButtonText}>Galeriden Video Seç</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.imageButton, { backgroundColor: '#FF0000' }]}
                      onPress={() => { /* YouTube video ekleme daha sonra eklenecek */ }}
                    >
                      <Image source={require('../assets/images/icons/Youtube.png')} style={styles.imageButtonIconImage} />
                      <Text style={styles.imageButtonText}>YouTube Video Ekle</Text>
                    </TouchableOpacity>
                  </View>
                </GlassmorphismView>
              </Animated.View>
              </>
            )}

            {/* 6. Adım: Sahip Bilgileri */}
            {currentStep === 6 && (
              <>
                <View style={styles.stepTitleBadge}>
                  <View style={styles.stepTitleRow}>
                    <Image source={require('../assets/images/icons/portfoy.png')} style={styles.stepTitleIcon} />
                    <Text style={styles.stepTitle}>Mülk Sahibi Bilgileri ve Özel Not</Text>
                  </View>
                </View>
                <View style={[styles.stepTitleBadge, styles.stepTitleBadgeCrimson, styles.stepTitleBadgeNoBleed]}>
                  <Text style={[styles.stepTitle, styles.stepTitleSmall]}>"Bu Bilgileri Havuzda yayınlasanız bile sadece siz görebilirsiniz. Hiçbir yerde paylaşılmaz ve sizden başka kimse göremez"</Text>
                </View>
                <Animated.View 
                  style={[
                    styles.wizardStep,
                    {
                      transform: [
                        { translateY: slideYAnim },
                        { translateX: slideXAnim },
                        { scale: scaleAnim },
                        { rotate: rotateAnim.interpolate({
                          inputRange: [-15, 0, 15],
                          outputRange: ['-15deg', '0deg', '15deg'],
                        })},
                        { 
                          scaleX: bounceAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [1, 1.05],
                          })
                        }
                      ],
                      opacity: fadeAnim,
                    }
                  ]}
                >

                <GlassmorphismView
                  style={[styles.section, styles.sectionGlassOverrides]}
                  borderRadius={15}
                  blurEnabled={false}
                  config={ownerInfoCardConfig}
                  borderWidth={0.4}
                  borderColor={'rgba(255, 255, 255, 0.43)'}
                >
                  <Text style={[styles.sectionTitle, styles.ownerSectionTitle]}>Mülk Sahibi Bilgileri</Text>

                  {renderInput('Adı Soyadı', 'ownerName', 'Ad Soyad girin', 'default', true)}
                  {renderInput('Telefonu', 'ownerPhone', 'Telefon girin', 'phone-pad', true)}
                </GlassmorphismView>

                {/* Kapı Şifresi / Anahtar Yeri / Özel Not ayrı container */}
                <GlassmorphismView
                  style={[styles.section, styles.sectionGlassOverrides]}
                  borderRadius={15}
                  blurEnabled={false}
                  config={stepPrimaryCardConfig}
                  borderWidth={0.4}
                  borderColor={'rgba(255, 255, 255, 0.43)'}
                >
                  <Text style={styles.sectionTitle}>Ek Bilgiler</Text>
                  {renderInput('Kapı Şifresi', 'doorCode', 'Kapı şifresini girin', 'default')}
                  {renderInput('Anahtar Yeri', 'keyLocation', 'Anahtar yerini tarif edin', 'default')}
                  {renderInput('Özel Not', 'specialNote', 'Özel notlarınızı girin', 'default')}
                </GlassmorphismView>

                {/* Yayın Ayarları */}
                <GlassmorphismView
                  style={[styles.section, styles.sectionGlassOverrides]}
                  borderRadius={15}
                  blurEnabled={false}
                  config={stepPrimaryCardConfig}
                  borderWidth={0.4}
                  borderColor={'rgba(255, 255, 255, 0.43)'}
                >
                  <Text style={styles.sectionTitle}>Yayın Ayarları</Text>

                  <View style={[styles.switchContainer, styles.publishContainer]}>
                    <Text style={[styles.switchLabel, styles.publishLabel]}>Portföy havuzunda yayınlansın.</Text>
                    <Switch
                      value={formData.isPublished}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, isPublished: value }))}
                      trackColor={{ false: '#FFFFFF', true: '#FFFFFF' }}
                      thumbColor={formData.isPublished ? '#4CAF50' : '#f4f3f4'}
                    />
                  </View>
                  <Text style={[styles.switchDescription, styles.publishDescription]}>
                    {formData.isPublished
                      ? `Bu portföyünüzü ${formData.city} şehrindeki tüm Emlakçılar görebilecektir.`
                      : 'Bu portföyünüzü sadece siz görebilirsiniz. Dilerseniz profil sayfanızdan Havuzda yayınlayabilirsiniz.'
                    }
                  </Text>
                </GlassmorphismView>
                </Animated.View>
              </>
            )}

            {/* Son sayfa için alttaki kaydet butonu kaldırıldı; header üzerinden kaydetme */}

            {/* Tamamlanma Yüzdesi Gösterimi - scroll içi, sayfa sonu */}
            

          </ScrollView>
        </View>
      </KeyboardAvoidingView>

      {/* İlerleme Modalı */}
      <Modal
        visible={showProgressModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {}}
      >
        <View style={styles.errorModalOverlay}>
          <GlassmorphismView
            style={[styles.progressModalGlass, { backgroundColor: 'transparent' }]}
            borderRadius={20}
            config={draftModalCardConfig}
            blurEnabled={false}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Portföy Kaydediliyor</Text>
            </View>
            <View style={{ padding: 16 }}>
              <View style={{ marginBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ color: theme.colors.text, fontSize: theme.fontSizes.lg }}>Resimler yükleniyor...</Text>
                <Text style={{ color: theme.colors.primary }}>{phaseImagesDone ? '✓' : ''}</Text>
              </View>
              <View style={{ marginBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ color: theme.colors.text, fontSize: theme.fontSizes.lg }}>Portföy bilgileri yükleniyor...</Text>
                <Text style={{ color: theme.colors.primary }}>{phaseDataDone ? '✓' : ''}</Text>
              </View>
              <View style={{ marginBottom: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ color: theme.colors.text, fontSize: theme.fontSizes.lg }}>Veriler paylaşılıyor...</Text>
                <Text style={{ color: theme.colors.primary }}>{phaseShareDone ? '✓' : ''}</Text>
              </View>

              <View style={{ height: 10, backgroundColor: theme.colors.border, borderRadius: 6, overflow: 'hidden' }}>
                <View style={{ width: `${progressPercent}%`, backgroundColor: theme.colors.error, height: '100%' }} />
              </View>
              <Text style={{ color: theme.colors.textSecondary, marginTop: 8, textAlign: 'right' }}>{progressPercent}%</Text>
            </View>
          </GlassmorphismView>
        </View>
      </Modal>

      {/* Başarı Modalı */}
      <Modal
        visible={showSuccessModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {}}
      >
        <View style={styles.errorModalOverlay}>
          <GlassmorphismView
            style={[styles.successModalGlass, { backgroundColor: 'transparent' }]}
            borderRadius={20}
            config={draftModalCardConfig}
            blurEnabled={false}
          >
            <View style={{ paddingHorizontal: 16, paddingTop: 15, paddingBottom: 8 }}>
              <View style={{ alignItems: 'center', marginBottom: 12 }}>
                <Image source={require('../assets/images/icons/tasks.png')} style={[styles.successIconLarge, { tintColor: theme.colors.success }]} />
              </View>
              <Text style={{ color: theme.colors.text, fontSize: theme.fontSizes.xl, textAlign: 'center', marginBottom: 16 }}>
                Portföyünüz başarıyla kaydedilmiştir.
              </Text>
              <View style={[styles.successFooter, { marginTop: 16 }]}>
                <View style={{ flexDirection: 'column', gap: 12 }}>
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                  <TouchableOpacity
                      style={[styles.saveButton, styles.saveButtonCompact, { flex: 1 }]}
                      onPress={() => {
                        setShowSuccessModal(false);
                        if (createdPortfolio?.id) {
                          navigation.navigate('PropertyDetail', { portfolio: createdPortfolio, fromScreen: 'MyPortfolios' });
                        } else {
                          navigation.navigate('MainTabs');
                        }
                      }}
                    >
                      <Text style={[styles.saveButtonText, styles.saveButtonTextCompact]}>Portföye Git</Text>
                    </TouchableOpacity>
                  <TouchableOpacity
                      style={[styles.saveButton, styles.saveButtonCompact, { flex: 1 }]}
                      onPress={() => {
                        setShowSuccessModal(false);
                        // Yeni portföy akışını tamamen sıfırla ve formun ilk adımını göster
                        resetNewPortfolioFlow();
                        const tabNav = navigation.getParent && navigation.getParent();
                        tabNav?.navigate('Ana Sayfa', { screen: 'AddPortfolio', params: { previousScreen: 'Ana Sayfa' } });
                      }}
                    >
                      <Text style={[styles.saveButtonText, styles.saveButtonTextCompact]}>Yeni Portföy Ekle</Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity
                    style={[styles.saveButton, styles.saveButtonCompact, { backgroundColor: theme.colors.inputBg, borderWidth: 1, borderColor: theme.colors.border }]}
                    onPress={async () => {
                      setShowSuccessModal(false);
                      // Artık tamamlandı: otomatik taslak kaydı devre dışı bırak ve çıkış onayını BYPASS et
                      try { disableAutoDraftSaveRef.current = true; } catch {}
                      try { allowLeaveRef.current = true; } catch {}
                      // Taslağı sil (tamamlandı)
                      try { await deleteDraft(); } catch {}
                      // Root navigasyonu Home tab + HomeScreen'e resetle
                      const parent = navigation.getParent && navigation.getParent();
                      if (parent && typeof parent.dispatch === 'function') {
                        try {
                          parent.dispatch(
                            CommonActions.reset({
                              index: 0,
                              routes: [
                                { name: 'Ana Sayfa', state: { index: 0, routes: [{ name: 'HomeScreen' }] } },
                              ],
                            })
                          );
                          return;
                        } catch {}
                      }
                      // Fallback: mevcut stack'i sıfırla ve tab'ı Ana Sayfa'ya geçir
                      try { navigation.reset({ index: 0, routes: [{ name: 'HomeScreen' }] }); } catch {}
                      try {
                        const tabNav = navigation.getParent && navigation.getParent();
                        tabNav?.navigate('Ana Sayfa', { screen: 'HomeScreen' });
                      } catch {}
                    }}
                  >
                    <Text style={[styles.saveButtonText, styles.saveButtonTextCompact, { color: theme.colors.text, fontSize: theme.fontSizes.md }]}>Anasayfa</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </GlassmorphismView>
        </View>
      </Modal>

      {/* Şehir Seçici Modal */}
      <Modal
        visible={showCityPicker}
        animationType="none"
        transparent={true}
        hardwareAccelerated={true}
        presentationStyle="overFullScreen"
        statusBarTranslucent={true}
      >
        <Animated.View style={[styles.modalOverlay, { opacity: pickerFadeAnim }]} renderToHardwareTextureAndroid shouldRasterizeIOS>
          <Animated.View style={[styles.modalContainer, { transform: [{ translateY: pickerTranslateY }, { scale: pickerScale }] }]} renderToHardwareTextureAndroid shouldRasterizeIOS>
            <GlassmorphismView
              style={StyleSheet.absoluteFill}
              config={draftModalCardConfig}
              borderRadius={theme.borderRadius.lg}
            />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Şehir Seçin</Text>
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => setShowCityPicker(false)}
              >
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={cities}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.neighborhoodItem,
                    formData.city === item && styles.neighborhoodItemActive,
                  ]}
                  onPress={() => handleCitySelect(item)}
                >
                  <Text style={[
                    styles.neighborhoodText,
                    formData.city === item && styles.neighborhoodTextActive,
                  ]}>
                    {item}
                  </Text>
                </TouchableOpacity>
              )}
              style={styles.neighborhoodList}
              initialNumToRender={20}
              maxToRenderPerBatch={20}
              windowSize={5}
              removeClippedSubviews
              getItemLayout={getPickerLayout}
            />
          </Animated.View>
        </Animated.View>
      </Modal>

      {/* Oda Sayısı Seçici Modal */}
      <Modal
        visible={showRoomCountPicker}
        animationType="none"
        transparent={true}
        hardwareAccelerated={true}
        presentationStyle="overFullScreen"
        statusBarTranslucent={true}
      >
        <Animated.View style={[styles.modalOverlay, { opacity: pickerFadeAnim }]} renderToHardwareTextureAndroid shouldRasterizeIOS>
          <Animated.View style={[styles.modalContainer, { transform: [{ translateY: pickerTranslateY }, { scale: pickerScale }] }]} renderToHardwareTextureAndroid shouldRasterizeIOS>
            <GlassmorphismView
              style={StyleSheet.absoluteFill}
              config={draftModalCardConfig}
              borderRadius={theme.borderRadius.lg}
            />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Oda Sayısı Seçin</Text>
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => setShowRoomCountPicker(false)}
              >
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={roomCounts}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.neighborhoodItem,
                    formData.roomCount === item && styles.neighborhoodItemActive,
                  ]}
                  onPress={() => handleRoomCountSelect(item)}
                >
                  <Text style={[
                    styles.neighborhoodText,
                    formData.roomCount === item && styles.neighborhoodTextActive,
                  ]}>
                    {item}
                  </Text>
                </TouchableOpacity>
              )}
              style={styles.neighborhoodList}
              initialNumToRender={20}
              maxToRenderPerBatch={20}
              windowSize={5}
              removeClippedSubviews
              getItemLayout={getPickerLayout}
            />
          </Animated.View>
        </Animated.View>
      </Modal>

      {/* İlçe Seçici Modal */}
      <Modal
        visible={showDistrictPicker}
        animationType="none"
        transparent={true}
        hardwareAccelerated={true}
        presentationStyle="overFullScreen"
        statusBarTranslucent={true}
      >
        <Animated.View style={[styles.modalOverlay, { opacity: pickerFadeAnim }]} renderToHardwareTextureAndroid shouldRasterizeIOS>
          <Animated.View style={[styles.modalContainer, { transform: [{ translateY: pickerTranslateY }, { scale: pickerScale }] }]} renderToHardwareTextureAndroid shouldRasterizeIOS>
            <GlassmorphismView
              style={StyleSheet.absoluteFill}
              config={draftModalCardConfig}
              borderRadius={theme.borderRadius.lg}
            />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>İlçe Seçin</Text>
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => setShowDistrictPicker(false)}
              >
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={turkeyDistricts[formData.city] || []}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.neighborhoodItem,
                    formData.district === item && styles.neighborhoodItemActive,
                  ]}
                  onPress={() => handleDistrictSelect(item)}
                >
                  <Text style={[
                    styles.neighborhoodText,
                    formData.district === item && styles.neighborhoodTextActive,
                  ]}>
                    {item}
                  </Text>
                </TouchableOpacity>
              )}
              style={styles.neighborhoodList}
              initialNumToRender={20}
              maxToRenderPerBatch={20}
              windowSize={5}
              removeClippedSubviews
              getItemLayout={getPickerLayout}
            />
          </Animated.View>
        </Animated.View>
      </Modal>


      {/* Mahalle Seçici Modal */}
      <Modal
        visible={showNeighborhoodPicker}
        animationType="none"
        transparent={true}
        hardwareAccelerated={true}
        presentationStyle="overFullScreen"
        statusBarTranslucent={true}
      >
        <Animated.View style={[styles.modalOverlay, { opacity: pickerFadeAnim }]} renderToHardwareTextureAndroid shouldRasterizeIOS>
          <Animated.View style={[styles.modalContainer, { transform: [{ translateY: pickerTranslateY }, { scale: pickerScale }] }]} renderToHardwareTextureAndroid shouldRasterizeIOS>
            <GlassmorphismView
              style={StyleSheet.absoluteFill}
              config={draftModalCardConfig}
              borderRadius={theme.borderRadius.lg}
            />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Mahalle Seçin</Text>
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => setShowNeighborhoodPicker(false)}
              >
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={neighborhoods}
              keyExtractor={(item) => item.name}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.neighborhoodItem,
                    formData.neighborhood === item.name && styles.neighborhoodItemActive,
                  ]}
                  onPress={() => handleNeighborhoodSelect(item)}
                >
                  <Text style={[
                    styles.neighborhoodText,
                    formData.neighborhood === item.name && styles.neighborhoodTextActive,
                  ]}>
                    {item.name}
                  </Text>
                </TouchableOpacity>
              )}
              style={styles.neighborhoodList}
              initialNumToRender={20}
              maxToRenderPerBatch={20}
              windowSize={5}
              removeClippedSubviews
              getItemLayout={getPickerLayout}
            />
          </Animated.View>
        </Animated.View>
      </Modal>

      {/* Kamera Çekim Modu Modal'ı */}
      <Modal
        visible={showCameraMode}
        transparent={true}
        animationType="slide"
        onRequestClose={cancelCameraMode}
      >
        <View style={styles.cameraModeOverlay}>
          <View style={styles.cameraModeContent}>
            <View style={styles.cameraModeHeader}>
              <Text style={styles.cameraModeTitle}>Kamera Çekim Modu</Text>
              <TouchableOpacity
                style={styles.cameraModeCloseButton}
                onPress={cancelCameraMode}
              >
                <Text style={styles.cameraModeCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.cameraModeInfo}>
              <Text style={styles.cameraModeInfoText}>
                {cameraImages.length} resim çekildi. {isContinuousMode ? 'Sürekli çekim aktif - "Tamam" dedikten sonra 2 saniye bekleyip kamera açılacak.' : 'Tek resim çekebilir veya sürekli çekim başlatabilirsiniz.'}i
              </Text>
            </View>

            {/* Çekilen Resimler */}
            {cameraImages.length > 0 && (
              <View style={styles.cameraImagesContainer}>
                <Text style={styles.cameraImagesTitle}>Çekilen Resimler:</Text>
                <FlatList
                  data={cameraImages}
                  keyExtractor={(item, index) => index.toString()}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  renderItem={({ item, index }) => (
                    <View style={styles.cameraImageItem}>
                      <Image source={{ uri: item.uri }} style={styles.cameraImageThumbnail} />
                      <TouchableOpacity
                        style={styles.cameraImageRemoveButton}
                        onPress={() => removeCameraImage(index)}
                      >
                        <Text style={styles.cameraImageRemoveText}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                />
              </View>
            )}

            {/* Kamera Butonları */}
            <View style={styles.cameraModeButtons}>
              {!isContinuousMode ? (
                <>
                  <TouchableOpacity
                    style={[styles.cameraModeButton, styles.cameraTakeButton]}
                    onPress={takeSinglePhoto}
                    disabled={selectedImages.length + cameraImages.length >= 30 || isCapturing}
                  >
                    <Text style={styles.cameraModeButtonIcon}>📸</Text>
                    <Text style={styles.cameraModeButtonText}>
                      {isCapturing ? 'Çekiliyor...' : 'Tek Resim'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.cameraModeButton, styles.cameraContinuousButton]}
                    onPress={startContinuousCamera}
                    disabled={selectedImages.length + cameraImages.length >= 30 || isCapturing}
                  >
                    <Text style={styles.cameraModeButtonIcon}>🎬</Text>
                    <Text style={styles.cameraModeButtonText}>Sürekli Çekim</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity
                  style={[styles.cameraModeButton, styles.cameraStopButton]}
                  onPress={stopContinuousCamera}
                >
                  <Text style={styles.cameraModeButtonIcon}>⏹️</Text>
                  <Text style={styles.cameraModeButtonText}>Durdur</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.cameraModeButton, styles.cameraFinishButton]}
                onPress={finishCameraMode}
                disabled={cameraImages.length === 0}
              >
                <Text style={styles.cameraModeButtonIcon}>✅</Text>
                <Text style={styles.cameraModeButtonText}>Tamam</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Resim Önizleme Modal'ı */}
      <Modal
        visible={showImagePreview}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowImagePreview(false)}
      >
        <View style={styles.imagePreviewOverlay}>
          <View style={styles.imagePreviewContent}>
            <View style={styles.imagePreviewHeader}>
              <Text style={styles.imagePreviewTitle}>Resim Önizleme</Text>
              <TouchableOpacity
                style={styles.imagePreviewCloseButton}
                onPress={() => setShowImagePreview(false)}
              >
                <Text style={styles.imagePreviewCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            {previewImage && (
              <View style={styles.imagePreviewContainer}>
                <Image
                  source={{ uri: previewImage.uri }}
                  style={styles.imagePreviewImage}
                  resizeMode="contain"
                />

                <View style={styles.imagePreviewActions}>
                  <TouchableOpacity
                    style={[styles.imagePreviewActionButton, previewImage.index === featuredImageIndex && styles.imagePreviewActionButtonActive]}
                    onPress={() => {
                      setFeaturedImage(previewImage.index);
                      setShowImagePreview(false);
                    }}
                  >
                    <Text style={styles.imagePreviewActionButtonText}>
                      {previewImage.index === featuredImageIndex ? '⭐ Vitrin Resmi' : '⭐ Vitrin Yap'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.imagePreviewActionButton, styles.imagePreviewRemoveButton]}
                    onPress={() => {
                      removeImage(previewImage.index);
                      setShowImagePreview(false);
                    }}
                  >
                    <Text style={styles.imagePreviewActionButtonText}>🗑️ Sil</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Bina Yaşı Picker Modal */}
      <Modal
        visible={showAgePicker}
        animationType="none"
        transparent={true}
        hardwareAccelerated={true}
        presentationStyle="overFullScreen"
        statusBarTranslucent={true}
      >
        <Animated.View style={[styles.modalOverlay, { opacity: pickerFadeAnim }]} renderToHardwareTextureAndroid shouldRasterizeIOS>
          <Animated.View style={[styles.modalContainer, { transform: [{ translateY: pickerTranslateY }, { scale: pickerScale }] }]} renderToHardwareTextureAndroid shouldRasterizeIOS>
            <GlassmorphismView
              style={StyleSheet.absoluteFill}
              config={draftModalCardConfig}
              borderRadius={theme.borderRadius.lg}
            />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Bina Yaşı Seçin</Text>
              <TouchableOpacity onPress={() => setShowAgePicker(false)}>
                <Text style={styles.modalCloseText}>Kapat</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={ageOptions}
              keyExtractor={(item) => item.value}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.neighborhoodItem}
                  onPress={() => {
                    handleInputChange('buildingAge', item.value);
                    setShowAgePicker(false);
                  }}
                >
                  <Text style={styles.neighborhoodText}>{item.label}</Text>
                </TouchableOpacity>
              )}
              initialNumToRender={30}
              maxToRenderPerBatch={30}
              windowSize={5}
              removeClippedSubviews
              getItemLayout={getPickerLayout}
            />
          </Animated.View>
        </Animated.View>
      </Modal>

      {/* Banyo Sayısı Picker Modal */}
      <Modal
        visible={showBathroomPicker}
        animationType="none"
        transparent={true}
        hardwareAccelerated={true}
        presentationStyle="overFullScreen"
        statusBarTranslucent={true}
      >
        <Animated.View style={[styles.modalOverlay, { opacity: pickerFadeAnim }]} renderToHardwareTextureAndroid shouldRasterizeIOS>
          <Animated.View style={[styles.modalContainer, { transform: [{ translateY: pickerTranslateY }, { scale: pickerScale }] }]} renderToHardwareTextureAndroid shouldRasterizeIOS>
            <GlassmorphismView
              style={StyleSheet.absoluteFill}
              config={draftModalCardConfig}
              borderRadius={theme.borderRadius.lg}
            />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Banyo Sayısı Seçin</Text>
              <TouchableOpacity onPress={() => setShowBathroomPicker(false)}>
                <Text style={styles.modalCloseText}>Kapat</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={bathroomOptions}
              keyExtractor={(item) => item.value}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.neighborhoodItem}
                  onPress={() => {
                    handleInputChange('bathroomCount', item.value);
                    setShowBathroomPicker(false);
                  }}
                >
                  <Text style={styles.neighborhoodText}>{item.label}</Text>
                </TouchableOpacity>
              )}
              initialNumToRender={20}
              maxToRenderPerBatch={20}
              windowSize={5}
              removeClippedSubviews
              getItemLayout={getPickerLayout}
            />
          </Animated.View>
        </Animated.View>
      </Modal>

      {/* Balkon Sayısı Picker Modal */}
      <Modal
        visible={showBalconyPicker}
        animationType="none"
        transparent={true}
        hardwareAccelerated={true}
        presentationStyle="overFullScreen"
        statusBarTranslucent={true}
      >
        <Animated.View style={[styles.modalOverlay, { opacity: pickerFadeAnim }]} renderToHardwareTextureAndroid shouldRasterizeIOS>
          <Animated.View style={[styles.modalContainer, { transform: [{ translateY: pickerTranslateY }, { scale: pickerScale }] }]} renderToHardwareTextureAndroid shouldRasterizeIOS>
            <GlassmorphismView
              style={StyleSheet.absoluteFill}
              config={draftModalCardConfig}
              borderRadius={theme.borderRadius.lg}
            />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Balkon Sayısı Seçin</Text>
              <TouchableOpacity onPress={() => setShowBalconyPicker(false)}>
                <Text style={styles.modalCloseText}>Kapat</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={balconyOptions}
              keyExtractor={(item) => item.value}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.neighborhoodItem}
                  onPress={() => {
                    handleInputChange('balconyCount', item.value);
                    setShowBalconyPicker(false);
                  }}
                >
                  <Text style={styles.neighborhoodText}>{item.label}</Text>
                </TouchableOpacity>
              )}
              initialNumToRender={20}
              maxToRenderPerBatch={20}
              windowSize={5}
              removeClippedSubviews
              getItemLayout={getPickerLayout}
            />
          </Animated.View>
        </Animated.View>
      </Modal>

      {/* Toplam Kat Sayısı Picker Modal */}
      <Modal
        visible={showTotalFloorPicker}
        animationType="none"
        transparent={true}
        hardwareAccelerated={true}
        presentationStyle="overFullScreen"
        statusBarTranslucent={true}
      >
        <Animated.View style={[styles.modalOverlay, { opacity: pickerFadeAnim }]} renderToHardwareTextureAndroid shouldRasterizeIOS>
          <Animated.View style={[styles.modalContainer, { transform: [{ translateY: pickerTranslateY }, { scale: pickerScale }] }]} renderToHardwareTextureAndroid shouldRasterizeIOS>
            <GlassmorphismView
              style={StyleSheet.absoluteFill}
              config={draftModalCardConfig}
              borderRadius={theme.borderRadius.lg}
            />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Toplam Kat Sayısı Seçin</Text>
              <TouchableOpacity onPress={() => setShowTotalFloorPicker(false)}>
                <Text style={styles.modalCloseText}>Kapat</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={totalFloorOptions}
              keyExtractor={(item) => item.value}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.neighborhoodItem}
                  onPress={() => {
                    handleInputChange('totalFloors', item.value);
                    setShowTotalFloorPicker(false);
                  }}
                >
                  <Text style={styles.neighborhoodText}>{item.label}</Text>
                </TouchableOpacity>
              )}
              initialNumToRender={40}
              maxToRenderPerBatch={40}
              windowSize={7}
              removeClippedSubviews
              getItemLayout={getPickerLayout}
            />
          </Animated.View>
        </Animated.View>
      </Modal>

      {/* Bulunduğu Kat Picker Modal */}
      <Modal
        visible={showCurrentFloorPicker}
        animationType="none"
        transparent={true}
        hardwareAccelerated={true}
        presentationStyle="overFullScreen"
        statusBarTranslucent={true}
      >
        <Animated.View style={[styles.modalOverlay, { opacity: pickerFadeAnim }]} renderToHardwareTextureAndroid shouldRasterizeIOS>
          <Animated.View style={[styles.modalContainer, { transform: [{ translateY: pickerTranslateY }, { scale: pickerScale }] }]} renderToHardwareTextureAndroid shouldRasterizeIOS>
            <GlassmorphismView
              style={StyleSheet.absoluteFill}
              config={draftModalCardConfig}
              borderRadius={theme.borderRadius.lg}
            />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Bulunduğu Kat Seçin</Text>
              <TouchableOpacity onPress={() => setShowCurrentFloorPicker(false)}>
                <Text style={styles.modalCloseText}>Kapat</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={currentFloorOptions}
              keyExtractor={(item) => item.value}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.neighborhoodItem}
                  onPress={() => {
                    handleInputChange('floor', item.value);
                    setShowCurrentFloorPicker(false);
                  }}
                >
                  <Text style={styles.neighborhoodText}>{item.label}</Text>
                </TouchableOpacity>
              )}
              initialNumToRender={40}
              maxToRenderPerBatch={40}
              windowSize={7}
              removeClippedSubviews
              getItemLayout={getPickerLayout}
            />
          </Animated.View>
        </Animated.View>
      </Modal>

      {/* Net M² Picker Modal */}
      <Modal
        visible={showNetSquareMetersPicker}
        animationType="none"
        transparent={true}
        hardwareAccelerated={true}
        presentationStyle="overFullScreen"
        statusBarTranslucent={true}
      >
        <Animated.View style={[styles.modalOverlay, { opacity: pickerFadeAnim }]} renderToHardwareTextureAndroid shouldRasterizeIOS>
          <Animated.View style={[styles.modalContainer, { transform: [{ translateY: pickerTranslateY }, { scale: pickerScale }] }]} renderToHardwareTextureAndroid shouldRasterizeIOS>
            <GlassmorphismView
              style={StyleSheet.absoluteFill}
              config={draftModalCardConfig}
              borderRadius={theme.borderRadius.lg}
            />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Net M² Seçin</Text>
              <TouchableOpacity onPress={() => setShowNetSquareMetersPicker(false)}>
                <Text style={styles.modalCloseText}>Kapat</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={netSquareMetersOptions}
              keyExtractor={(item) => item.value}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.neighborhoodItem}
                  onPress={() => {
                    handleInputChange('netSquareMeters', item.value);
                    setShowNetSquareMetersPicker(false);
                  }}
                >
                  <Text style={styles.neighborhoodText}>{item.label}</Text>
                </TouchableOpacity>
              )}
              initialNumToRender={40}
              maxToRenderPerBatch={40}
              windowSize={7}
              removeClippedSubviews
              getItemLayout={getPickerLayout}
            />
          </Animated.View>
        </Animated.View>
      </Modal>

      {/* Brüt M² Picker Modal */}
      <Modal
        visible={showGrossSquareMetersPicker}
        animationType="none"
        transparent={true}
        hardwareAccelerated={true}
        presentationStyle="overFullScreen"
        statusBarTranslucent={true}
      >
        <Animated.View style={[styles.modalOverlay, { opacity: pickerFadeAnim }]} renderToHardwareTextureAndroid shouldRasterizeIOS>
          <Animated.View style={[styles.modalContainer, { transform: [{ translateY: pickerTranslateY }, { scale: pickerScale }] }]} renderToHardwareTextureAndroid shouldRasterizeIOS>
            <GlassmorphismView
              style={StyleSheet.absoluteFill}
              config={draftModalCardConfig}
              borderRadius={theme.borderRadius.lg}
            />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Brüt M² Seçin</Text>
              <TouchableOpacity onPress={() => setShowGrossSquareMetersPicker(false)}>
                <Text style={styles.modalCloseText}>Kapat</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={grossSquareMetersOptions}
              keyExtractor={(item) => item.value}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.neighborhoodItem}
                  onPress={() => {
                    handleInputChange('grossSquareMeters', item.value);
                    setShowGrossSquareMetersPicker(false);
                  }}
                >
                  <Text style={styles.neighborhoodText}>{item.label}</Text>
                </TouchableOpacity>
              )}
              initialNumToRender={40}
              maxToRenderPerBatch={40}
              windowSize={7}
              removeClippedSubviews
              getItemLayout={getPickerLayout}
            />
          </Animated.View>
        </Animated.View>
      </Modal>

      {/* Aidat Picker Modal */}
      <Modal
        visible={showDuesPicker}
        animationType="none"
        transparent={true}
        hardwareAccelerated={true}
        presentationStyle="overFullScreen"
        statusBarTranslucent={true}
      >
        <Animated.View style={[styles.modalOverlay, { opacity: pickerFadeAnim }]} renderToHardwareTextureAndroid shouldRasterizeIOS>
          <Animated.View style={[styles.modalContainer, { transform: [{ translateY: pickerTranslateY }, { scale: pickerScale }] }]} renderToHardwareTextureAndroid shouldRasterizeIOS>
            <GlassmorphismView
              style={StyleSheet.absoluteFill}
              config={draftModalCardConfig}
              borderRadius={theme.borderRadius.lg}
            />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Aidat Seçin</Text>
              <TouchableOpacity onPress={() => setShowDuesPicker(false)}>
                <Text style={styles.modalCloseText}>Kapat</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={duesOptions}
              keyExtractor={(item) => item.value}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.neighborhoodItem}
                  onPress={() => {
                    handleInputChange('dues', item.value);
                    setShowDuesPicker(false);
                  }}
                >
                  <Text style={styles.neighborhoodText}>{item.label}</Text>
                </TouchableOpacity>
              )}
              initialNumToRender={40}
              maxToRenderPerBatch={40}
              windowSize={7}
              removeClippedSubviews
              getItemLayout={getPickerLayout}
            />
          </Animated.View>
        </Animated.View>
      </Modal>

      {/* Resim Sıralama Modal'ı */}
      <Modal
        visible={showReorderModal}
        transparent={true}
        animationType="slide"
        onRequestClose={closeReorderModal}
      >
        <View style={styles.reorderModalOverlay}>
          <View style={styles.reorderModalContent}>
            <View style={styles.reorderModalHeader}>
              <Text style={styles.reorderModalTitle}>Resim Sıralamasını Düzenle</Text>
              <TouchableOpacity onPress={closeReorderModal}>
                <Text style={styles.reorderModalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            
            <Text style={styles.reorderModalInstruction}>
              Resimleri istediğiniz sıraya göre tıklayın (1, 2, 3...)
            </Text>
            
            <View style={styles.reorderImageGrid}>
              {selectedImages.map((item, index) => {
                const orderNumber = reorderSequence.indexOf(index) + 1;
                const isSelected = reorderSequence.includes(index);
                
                return (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.reorderImageItem,
                      isSelected && styles.reorderImageItemSelected
                    ]}
                    onPress={() => addToReorderSequence(index)}
                  >
                    <Image source={{ uri: item.uri }} style={styles.reorderImageThumbnail} />
                    {isSelected && (
                      <View style={styles.reorderNumberBadge}>
                        <Text style={styles.reorderNumberText}>{orderNumber}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
            
            <View style={styles.reorderModalFooter}>
              <TouchableOpacity
                style={styles.reorderCancelButton}
                onPress={closeReorderModal}
              >
                <Text style={styles.reorderCancelButtonText}>İptal</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.reorderApplyButton}
                onPress={applyReorder}
              >
                <Text style={styles.reorderApplyButtonText}>Tamam</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Hata Modal'ı */}
      <Modal
        visible={showErrorModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowErrorModal(false)}
      >
        <View style={styles.errorModalOverlay}>
          <View style={styles.errorModalContent}>
            <View style={styles.errorModalIcon}>
              <Text style={styles.errorModalIconText}>⚠️</Text>
            </View>
            <Text style={styles.errorModalTitle}>Hata</Text>
            <Text style={styles.errorModalMessage}>{errorMessage}</Text>
            <TouchableOpacity
              style={styles.errorModalButton}
              onPress={() => setShowErrorModal(false)}
            >
              <Text style={styles.errorModalButtonText}>Tamam</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Taslak Uyarı Modalı */}
      <Modal
        visible={showDraftWarningModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowDraftWarningModal(false)}
      >
        <View style={styles.errorModalOverlay}>
          <GlassmorphismView
            style={[styles.errorModalContent, styles.draftModalContentLarge, { backgroundColor: 'transparent' }]}
            borderRadius={20}
            config={draftModalCardConfig}
            blurEnabled={false}
          >
            <Image source={require('../assets/images/icons/tasks.png')} style={styles.draftModalIcon} />
            <Text style={styles.errorModalTitle}>Yarıda Kalan Portföy</Text>
            <Text style={styles.errorModalMessage}>
              {existingDrafts.length > 0 && (
                `"${existingDrafts[0].formData.title || 'Başlıksız Portföy'}" adlı yarıda kalan portföy eklemeniz var. Devam etmek ister misiniz?`
              )}
            </Text>
            <View style={styles.draftModalButtons}>
              <TouchableOpacity
                style={[styles.errorModalButton, styles.draftModalButtonSecondary]}
                onPress={async () => {
                  await deleteAllDrafts();
                  // Bu oturum için otomatik taslak kaydını kapat
                  disableAutoDraftSaveRef.current = true;
                  // Formu tamamen sıfırla
                  resetFormState();
                  setShowDraftWarningModal(false);
                }}
              >
                <Text style={[styles.errorModalButtonText, styles.draftModalButtonSecondaryText]}>
                  Hayır, Sil
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.errorModalButton, styles.draftModalButtonPrimary]}
                onPress={() => {
                  if (existingDrafts.length > 0) {
                    loadDraftData(existingDrafts[0]);
                  }
                  setShowDraftWarningModal(false);
                }}
              >
                <Text style={styles.errorModalButtonText}>Evet, Devam Et</Text>
              </TouchableOpacity>
            </View>
          </GlassmorphismView>
        </View>
      </Modal>

      {/* Sayfadan Çıkış Onayı */}
      <Modal
        visible={showLeaveConfirmModal}
        transparent={true}
        animationType="fade"
        statusBarTranslucent={true}
        onRequestClose={() => setShowLeaveConfirmModal(false)}
      >
        <View style={styles.errorModalOverlay}>
          <GlassmorphismView
            style={[styles.errorModalContent, { backgroundColor: 'transparent' }]}
            borderRadius={20}
            config={draftModalCardConfig}
            blurEnabled={false}
          >
            <Text style={styles.errorModalTitle}>Emin misiniz?</Text>
            <Text style={styles.errorModalMessage}>
              Portföy ekleme formundaki ilerlemeniz kaybolacaktır. Çıkmak istiyor musunuz?
            </Text>
            <View style={styles.draftModalButtons}>
              <TouchableOpacity
                style={[styles.errorModalButton, styles.draftModalButtonSecondary]}
                onPress={() => setShowLeaveConfirmModal(false)}
              >
                <Text style={[styles.errorModalButtonText, styles.draftModalButtonSecondaryText]}>Vazgeç</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.errorModalButton, styles.draftModalButtonPrimary]}
                onPress={() => {
                  // Kaydetmeden çık
                  disableAutoDraftSaveRef.current = true;
                  allowLeaveRef.current = true;
                  setShowLeaveConfirmModal(false);
                  const action = pendingNavActionRef.current;
                  const targetTabName = pendingNavTargetTabRef.current;
                  const runNav = () => {
                    if (typeof action === 'function') {
                      action();
                    } else if (action && action.type === 'goBack') {
                      if (navigation && typeof navigation.canGoBack === 'function' && navigation.canGoBack()) {
                        navigation.goBack();
                      } else if (previousScreen) {
                        navigation.navigate(previousScreen);
                      } else {
                        navigation.navigate('Ana Sayfa');
                      }
                    } else if (action) {
                      try { navigation.dispatch(action); } catch {}
                    } else if (targetTabName) {
                      DeviceEventEmitter.emit('mainTabs:navigateTab', { targetTabName });
                    } else if (navigation && typeof navigation.canGoBack === 'function' && navigation.canGoBack()) {
                      navigation.goBack();
                    } else if (previousScreen) {
                      navigation.navigate(previousScreen);
                    } else {
                      navigation.navigate('Ana Sayfa');
                    }
                    pendingNavActionRef.current = null;
                    pendingNavTargetTabRef.current = null;
                  };
                  // Formu anında sıfırla (geri döndüğünde dolu görünmesin)
                  resetFormState();
                  setTimeout(runNav, 0);
                }}
              >
                <Text style={styles.errorModalButtonText}>Evet, Çık</Text>
              </TouchableOpacity>
            </View>
            <View style={{ height: 10 }} />
            <TouchableOpacity
              style={styles.draftSaveAsButton}
              onPress={async () => {
                try { await saveDraftWithLeftAt(); } catch {}
                disableAutoDraftSaveRef.current = true;
                allowLeaveRef.current = true;
                setShowLeaveConfirmModal(false);
                const action = pendingNavActionRef.current;
                const targetTabName = pendingNavTargetTabRef.current;
                const runNav = () => {
                  if (typeof action === 'function') {
                    action();
                  } else if (action && action.type === 'goBack') {
                    if (navigation && typeof navigation.canGoBack === 'function' && navigation.canGoBack()) {
                      navigation.goBack();
                    } else if (previousScreen) {
                      navigation.navigate(previousScreen);
                    } else {
                      navigation.navigate('Ana Sayfa');
                    }
                  } else if (action) {
                    try { navigation.dispatch(action); } catch {}
                  } else if (targetTabName) {
                    DeviceEventEmitter.emit('mainTabs:navigateTab', { targetTabName });
                  } else if (navigation && typeof navigation.canGoBack === 'function' && navigation.canGoBack()) {
                    navigation.goBack();
                  } else if (previousScreen) {
                    navigation.navigate(previousScreen);
                  } else {
                    navigation.navigate('Ana Sayfa');
                  }
                  pendingNavActionRef.current = null;
                  pendingNavTargetTabRef.current = null;
                };
                // Formu anında sıfırla (geri döndüğünde dolu görünmesin)
                resetFormState();
                setTimeout(runNav, 0);
              }}
            >
              <Text style={styles.draftSaveAsButtonText}>Taslak olarak kaydet</Text>
            </TouchableOpacity>
          </GlassmorphismView>
        </View>
      </Modal>

      {/* Tümünü Kaldır Onayı */}
      <Modal
        visible={showClearAllModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowClearAllModal(false)}
      >
        <View style={styles.errorModalOverlay}>
          <View style={styles.errorModalContent}>
            <Text style={styles.errorModalTitle}>Onay</Text>
            <Text style={styles.errorModalMessage}>Tüm resimleri kaldırmak istiyor musunuz?</Text>
            <View style={styles.draftModalButtons}>
              <TouchableOpacity
                style={[styles.errorModalButton, styles.draftModalButtonSecondary]}
                onPress={() => setShowClearAllModal(false)}
              >
                <Text style={[styles.errorModalButtonText, styles.draftModalButtonSecondaryText]}>Hayır</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.errorModalButton, styles.draftModalButtonPrimary]}
                onPress={() => {
                  setSelectedImages([]);
                  setCameraImages([]);
                  setFeaturedImageIndex(0);
                  setShowClearAllModal(false);
                }}
              >
                <Text style={styles.errorModalButtonText}>Evet</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
    </ImageBackground>
    </Animatable.View>
  );
};
const createStyles = (theme, isDark) => StyleSheet.create({
  safeArea: {
    flex: 1,
    // Light modda özel arkaplan
    backgroundColor: 'transparent',
  },

  bgImage: {
    flex: 1,
  },

  keyboardAvoidingView: {
    flex: 1,
  },

  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    /* üst padding runtime'da insets.top + 12 verilecek */
    backgroundColor: 'transparent', // Arka plan yok
    borderBottomWidth: 0, // Çerçeve yok
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  headerButton: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.primary,
    minWidth: 50,
    alignItems: 'center',
  },
  headerButtonText: {
    color: theme.colors.white,
    fontSize: theme.fontSizes.md,
    fontWeight: theme.fontWeights.medium,
  },
  headerButtonDisabled: {
    color: theme.colors.textSecondary,
    backgroundColor: theme.colors.border,
  },

  // Yeni: Header ileri/geri butonları (backButton ile aynı boyut)
  headerNavButton: {
    backgroundColor: theme.colors.error,
    width: 37,
    height: 37,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  headerNavButtonDark: {
    backgroundColor: theme.colors.navy,
  },
  headerNavButtonWide: {
    paddingHorizontal: theme.spacing.sm,
    width: undefined,
    minWidth: 70,
  },
  headerNavButtonDisabled: {
    backgroundColor: theme.colors.border,
  },
  headerNavIcon: {
    width: 16,
    height: 16,
    tintColor: '#FFFFFF',
  },
  headerNavIconForward: {
    transform: [{ rotate: '180deg' }],
  },
  headerNavIconNoGap: {
    marginRight: 0,
    marginLeft: 0,
  },
  headerNavText: {
    color: theme.colors.white,
    fontSize: theme.fontSizes.md,
    fontWeight: theme.fontWeights.medium,
  },
  // Validation banner
  validationBanner: {
    marginHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
    backgroundColor: theme.colors.warningBg || 'rgba(220,20,60,0.1)',
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.error,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
  },
  validationBannerText: {
    color: theme.colors.text,
    fontSize: theme.fontSizes.md,
  },
  headerNavTextDisabled: {
    color: theme.colors.textSecondary,
  },

  backButton: {
    backgroundColor: theme.colors.error, // Theme kırmızı rengi
    width: 37,
    height: 37,
    borderRadius: 8, // Rounded square
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 0,
  },

  backIcon: {
    width: 16,
    height: 16,
    tintColor: '#FFFFFF', // Beyaz ikon
  },

  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },

  headerTitle: {
    fontSize: theme.fontSizes.xxl,
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.navy, // Koyu renk başlık
  },

  stepIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: theme.spacing.sm,
    marginTop: 4,
  },

  stepIndicator: {
    fontSize: theme.fontSizes.sm,
    color: theme.colors.textSecondary,
  },

  stepIndicatorPercent: {
    fontSize: theme.fontSizes.sm,
    color: theme.colors.error,
  },


  placeholder: {
    width: 40,
  },

  content: {
    flex: 1,
  },

  scrollContent: {
    padding: 0, // Kenar boşluğunu tamamen kaldır
    paddingBottom: theme.spacing.xxl + 20, // Ekstra padding bottom
  },

  progressContainer: {
    backgroundColor: theme.colors.navy,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    // Shadow kaldırıldı - şeffaflık problemini çözmek için
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
    padding: theme.spacing.md,
  },
  progressLabel: {
    color: theme.colors.white,
    fontSize: theme.fontSizes.md,
    marginBottom: theme.spacing.sm,
    textAlign: 'center',
  },
  progressBarBg: {
    width: '100%',
    height: 8,
    borderRadius: 999,
    backgroundColor: theme.colors.progressBg,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: theme.colors.progressFill,
  },


  section: {
    marginBottom: theme.spacing.md,
    backgroundColor: theme.colors.background, // Theme siyah rengi
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg, // İç boşluğu artır (16px)
    borderWidth: 1,
    borderColor: theme.colors.border,
    // Shadow kaldırıldı - şeffaflık problemini çözmek için
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  // GlassmorphismView ile kullanırken görsel çakışmayı önlemek için override
  sectionGlassOverrides: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderColor: 'transparent',
  },
  ownerSection: {
    borderColor: theme.colors.error,
    backgroundColor: theme.colors.error,
  },
  ownerNotesSection: {
    borderColor: theme.colors.border,
  },
  privateSection: {
    borderWidth: 2,
    borderColor: theme.colors.error,
  },

  sectionTitle: {
    fontSize: theme.fontSizes.xxl,
    fontWeight: theme.fontWeights.semibold,
    color: theme.colors.text, // Tema uyumlu metin rengi
    marginBottom: theme.spacing.md,
  },
  ownerSectionTitle: {
    color: theme.colors.white,
  },

  inputContainer: {
    marginBottom: theme.spacing.sm,
  },

  inputLabel: {
    fontSize: theme.fontSizes.xl,
    fontWeight: theme.fontWeights.medium,
    color: theme.colors.text, // Tema uyumlu metin rengi
    marginBottom: theme.spacing.sm,
  },

  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.sm,
  },
  labelIcon: {
    width: 18,
    height: 18,
    tintColor: '#DC143C',
    resizeMode: 'contain',
  },
  labelText: {
    marginTop: 4,
    marginBottom: 0,
    paddingBottom: 0,
    includeFontPadding: false,
  },
  labelRowBottom: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.sm,
  },
  labelTextBottom: {
    lineHeight: 18,
    marginBottom: 0,
    paddingBottom: 0,
    includeFontPadding: false,
  },

  required: {
    color: theme.colors.error,
  },

  input: {
    backgroundColor: theme.colors.inputBg, // Tema uyumlu input arka planı
    borderWidth: 1, // İnce çerçeve
    borderColor: '#DC143C', // Krimson çerçeve
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.sm, // Daha küçük padding (8px)
    paddingHorizontal: theme.spacing.lg, // Daha geniş padding
    color: theme.colors.inputText, // Tema uyumlu metin rengi
    fontSize: theme.fontSizes.xxl,
    textAlignVertical: 'center', // Metni dikey olarak ortala
    height: 42, // Sabit yükseklik 42px
    width: '100%', // Tam genişlik
    textAlign: 'left', // Metni sola hizala
  },

  // Özel input stilleri - hepsi eşit genişlikte
  inputSquareMeters: {
    backgroundColor: theme.colors.inputBg,
    borderWidth: 1, // İnce çerçeve
    borderColor: '#DC143C',
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    color: theme.colors.inputText,
    fontSize: theme.fontSizes.xxl,
    textAlignVertical: 'center',
    height: 42,
    width: 80, // Eşit genişlik
    textAlign: 'center', // Metni ortala
  },

  inputCount: {
    backgroundColor: theme.colors.inputBg,
    borderWidth: 1, // İnce çerçeve
    borderColor: '#DC143C',
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    color: theme.colors.inputText,
    fontSize: theme.fontSizes.xxl,
    textAlignVertical: 'center',
    height: 42,
    width: 80, // Eşit genişlik
    textAlign: 'center',
  },

  inputAge: {
    backgroundColor: theme.colors.inputBg,
    borderWidth: 1, // İnce çerçeve
    borderColor: '#DC143C',
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    color: theme.colors.inputText,
    fontSize: theme.fontSizes.xxl,
    textAlignVertical: 'center',
    height: 42,
    width: 80, // Eşit genişlik
    textAlign: 'center',
  },

  inputFloor: {
    backgroundColor: theme.colors.inputBg,
    borderWidth: 1, // İnce çerçeve
    borderColor: '#DC143C',
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    color: theme.colors.inputText,
    fontSize: theme.fontSizes.xxl,
    textAlignVertical: 'center',
    height: 42,
    width: 80, // Eşit genişlik
    textAlign: 'center',
  },

  pickerContainer: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },

  pickerOption: {
    flex: 1, // Kullanım durumu butonları gibi
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
    borderWidth: 0, // Çerçeve yok
    borderColor: '#DC143C', // Krimson çerçeve
    backgroundColor: theme.colors.inputBg, // Tema uyumlu arka plan
    alignItems: 'center',
    justifyContent: 'center',
    height: 42, // Diğer butonlarla aynı yükseklik
  },

  pickerOptionActive: {
    backgroundColor: theme.colors.error, // Theme kırmızı rengi
    borderColor: theme.colors.error, // Theme kırmızı rengi
  },

  pickerOptionText: {
    color: theme.colors.text, // Theme koyu renk
    fontSize: theme.fontSizes.xl,
    fontWeight: theme.fontWeights.medium,
  },

  pickerOptionTextActive: {
    color: theme.colors.white, // Beyaz
  },

  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },

  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: theme.colors.border,
    marginRight: theme.spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.white,
  },

  checkboxActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },

  checkboxIcon: {
    color: theme.colors.white,
    fontSize: 12,
    fontWeight: 'bold',
  },

  checkboxLabel: {
    fontSize: theme.fontSizes.xxl,
    color: theme.colors.text,
  },

  submitContainer: {
    marginTop: theme.spacing.xl,
    marginBottom: theme.spacing.lg,
    paddingHorizontal: 0, // ScrollView zaten padding veriyor
    paddingBottom: theme.spacing.xl,
  },

  submitInfoText: {
    fontSize: theme.fontSizes.md,
    color: theme.colors.white, // Beyaz
    textAlign: 'center',
    marginBottom: theme.spacing.lg,
    lineHeight: 20,
  },

  submitButton: {
    backgroundColor: theme.colors.error, // Theme kırmızı rengi
    paddingVertical: theme.spacing.lg,
    paddingHorizontal: theme.spacing.xl,
    borderRadius: theme.borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
    // Shadow kaldırıldı - şeffaflık problemini çözmek için
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },

  submitButtonDisabled: {
    opacity: 0.6,
    backgroundColor: theme.colors.border,
  },

  submitButtonText: {
    color: theme.colors.white,
    fontSize: theme.fontSizes.xl,
    fontWeight: theme.fontWeights.bold,
    textAlign: 'center',
  },

  locationContainer: {
    marginTop: theme.spacing.md,
  },

  mapButton: {
    backgroundColor: theme.colors.error, // Theme kırmızı rengi
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
    marginTop: theme.spacing.sm,
    // Shadow kaldırıldı - şeffaflık problemini çözmek için
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },

  mapButtonText: {
    color: theme.colors.white,
    fontSize: theme.fontSizes.xxl,
    fontWeight: theme.fontWeights.semibold,
  },

  coordinatesDisplay: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.sm,
    marginTop: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },

  switchContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },

  publishContainer: {
    borderWidth: 2,
    borderColor: theme.colors.error,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
  },

  switchLabel: {
    fontSize: theme.fontSizes.xxl,
    color: theme.colors.text, // Tema uyumlu metin rengi
    fontWeight: theme.fontWeights.medium,
  },

  publishLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    flex: 1,
  },

  publishDescription: {
    color: '#FFFFFF',
    fontSize: 13,
    marginTop: 8,
    textAlign: 'center',
  },

  switchContainerPrivate: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: theme.colors.error, // Theme kırmızı rengi
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  switchLabelPrivate: {
    fontSize: theme.fontSizes.lg,
    color: theme.colors.white,
    fontWeight: theme.fontWeights.medium,
  },
  switchDescription: {
    fontSize: theme.fontSizes.sm,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: theme.spacing.md,
    fontStyle: 'italic',
    paddingHorizontal: theme.spacing.md,
  },

  // Portföy sahibine özel bilgiler stilleri
  privateInfoDescription: {
    fontSize: theme.fontSizes.sm,
    color: theme.colors.white,
    textAlign: 'center',
    marginBottom: theme.spacing.lg,
    fontStyle: 'italic',
    backgroundColor: theme.colors.error,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.error,
  },
  subsectionTitle: {
    fontSize: theme.fontSizes.lg,
    fontWeight: theme.fontWeights.semibold,
    color: theme.colors.text, // Tema uyumlu metin rengi
    marginBottom: theme.spacing.md,
    marginTop: theme.spacing.lg,
  },
  rowContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
    gap: theme.spacing.sm, // Biraz daha aralık
  },

  // Ufak sağa kaydırma için
  rowContainerShiftRight: {
    marginLeft: theme.spacing.xs,
  },

  singleButtonRowContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  halfWidth: {
    flex: 1,
    marginHorizontal: theme.spacing.xs,
    paddingHorizontal: 0, // Padding'i kaldırdık
  },

  // 3'lü düzenleme için
  thirdWidth: {
    flex: 0,
    width: 110,
    alignItems: 'center',
  },
  // 3'lü düzen (M² ve Bina Yaşı) için biraz daha dar sütun
  thirdWidthNarrow: {
    flex: 0,
    width: 100,
    alignItems: 'center',
  },

  // Üçlü kolon satırlarında ek yatay padding ile ayrım
  threeColRow: {
    paddingHorizontal: theme.spacing.md,
  },
  specialInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  specialInfoButton: {
    backgroundColor: theme.colors.error, // Theme kırmızı rengi
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.md,
    height: 32,
  },
  specialInfoButtonText: {
    color: theme.colors.white,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.medium,
    textAlign: 'center',
  },
  specialInfoTextInput: {
    flex: 1,
    backgroundColor: theme.colors.inputBg,
    borderWidth: 1,
    borderColor: '#DC143C', // Krimson çerçeve
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    fontSize: theme.fontSizes.md,
    color: theme.colors.inputText,
    height: 32,
  },
  addButton: {
    backgroundColor: theme.colors.error, // Theme kırmızı rengi
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButtonText: {
    color: theme.colors.white,
    fontSize: theme.fontSizes.xl,
    fontWeight: theme.fontWeights.bold,
  },
  newDoorCodeContainer: {
    marginBottom: theme.spacing.md,
  },
  newDoorCodeInput: {
    backgroundColor: theme.colors.inputBg,
    borderWidth: 1,
    borderColor: '#DC143C', // Krimson çerçeve
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    fontSize: theme.fontSizes.md,
    color: theme.colors.inputText,
  },
  doorCodeItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: theme.colors.white,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  doorCodeText: {
    fontSize: theme.fontSizes.md,
    color: theme.colors.text,
    flex: 1,
  },
  removeButton: {
    backgroundColor: theme.colors.error,
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: theme.spacing.sm,
  },
  removeButtonText: {
    color: theme.colors.white,
    fontSize: theme.fontSizes.lg,
    fontWeight: theme.fontWeights.bold,
  },

  coordinatesText: {
    color: theme.colors.white, // Beyaz
    fontSize: theme.fontSizes.md,
    fontFamily: 'monospace',
  },


  // Mahalle seçici modal stilleri
  modalOverlay: {
    flex: 1,
    backgroundColor: theme.colors.overlay, // Tema uyumlu overlay
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    backgroundColor: theme.colors.surface, // Tema uyumlu arka plan
    borderRadius: theme.borderRadius.lg,
    width: '90%',
    maxHeight: '70%',
    // Shadow kaldırıldı - şeffaflık problemini çözmek için
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border, // Tema uyumlu border
  },
  modalTitle: {
    fontSize: theme.fontSizes.xxl,
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.text, // Theme koyu renk
  },
  modalCloseButton: {
    padding: theme.spacing.sm,
  },
  modalCloseText: {
    fontSize: 20,
    color: theme.colors.text, // Theme koyu renk
  },
  neighborhoodList: {
    maxHeight: 400,
  },
  neighborhoodItem: {
    padding: theme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.15)', // Soluk beyaz ayırıcı
  },
  neighborhoodItemActive: {
    backgroundColor: theme.colors.primary + '20',
  },
  neighborhoodText: {
    fontSize: theme.fontSizes.xl,
    color: theme.colors.text, // Theme koyu renk
  },
  neighborhoodTextActive: {
    color: theme.colors.primary,
    fontWeight: theme.fontWeights.bold,
  },
  // Picker button stilleri
  pickerButton: {
    backgroundColor: theme.colors.inputBg,
    borderWidth: 0,
    borderColor: '#DC143C', // Krimson çerçeve
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    height: 42, // Sabit yükseklik
    width: 110, // Biraz azaltıldı
  },

  halfWidthPickerButton: {
    backgroundColor: theme.colors.inputBg,
    borderWidth: 0,
    borderColor: '#DC143C', // Krimson çerçeve
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm, // Padding'i azalttık
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: 42, // Sabit yükseklik
    width: '100%', // Tam genişlik
    flex: 1, // Container'ı tam doldur
  },

  fullWidthPickerButton: {
    backgroundColor: theme.colors.inputBg,
    borderWidth: 0,
    borderColor: '#DC143C', // Krimson çerçeve
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: 42, // Sabit yükseklik
    width: '100%', // Tam genişlik
  },
  pickerButtonText: {
    color: theme.colors.white, // Seçimli girdilerde beyaz metin
    fontSize: theme.fontSizes.xxl,
    textAlign: 'center',
    flex: 1,
  },
  pickerButtonPlaceholder: {
    color: theme.colors.white,
  },
  pickerIcon: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.lg,
  },

  // Krimson ayırıcı çizgi
  crimsonDivider: {
    height: 1,
    backgroundColor: '#DC143C',
    marginVertical: theme.spacing.md,
    opacity: 0.8,
  },

  // Aktif seçim durumları (krimson arka plan + beyaz yazı)
  pickerButtonActive: {
    backgroundColor: theme.colors.error,
    borderColor: theme.colors.error,
  },
  pickerButtonTextActive: {
    color: theme.colors.white,
    fontWeight: theme.fontWeights.bold,
  },
  fullWidthPickerButtonActive: {
    backgroundColor: theme.colors.error,
    borderColor: theme.colors.error,
  },

  // Seçim ekranı stilleri
  selectionScreenContainer: {
    flex: 1,
    backgroundColor: theme.colors.surface, // Theme koyu rengi
  },

  selectionContainer: {
    flex: 1,
    padding: theme.spacing.lg,
    justifyContent: 'center',
  },

  selectionTitle: {
    fontSize: theme.fontSizes.xxxl,
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.white,
    textAlign: 'center',
    marginBottom: theme.spacing.sm,
  },

  selectionSubtitle: {
    fontSize: theme.fontSizes.xl,
    color: theme.colors.white,
    textAlign: 'center',
    marginBottom: theme.spacing.xxl,
  },

  selectionCards: {
    gap: theme.spacing.lg,
  },

  selectionCard: {
    backgroundColor: theme.colors.background, // Theme siyah rengi
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.xl,
    borderWidth: 2,
    borderColor: theme.colors.border,
    ...theme.shadows.large,
    position: 'relative',
  },

  selectionCardDisabled: {
    opacity: 0.6,
    borderColor: theme.colors.borderLight,
  },

  selectionCardIcon: {
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },

  selectionCardIconText: {
    fontSize: 48,
  },

  selectionCardTitle: {
    fontSize: theme.fontSizes.xxl,
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.white, // Beyaz
    textAlign: 'center',
    marginBottom: theme.spacing.sm,
  },

  selectionCardDescription: {
    fontSize: theme.fontSizes.lg,
    color: theme.colors.white, // Beyaz
    textAlign: 'center',
    marginBottom: theme.spacing.md,
    lineHeight: 22,
  },

  selectionCardArrow: {
    alignItems: 'center',
  },

  selectionCardArrowText: {
    fontSize: 24,
    color: theme.colors.primary,
    fontWeight: 'bold',
  },

  comingSoonBadge: {
    position: 'absolute',
    top: theme.spacing.md,
    right: theme.spacing.md,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },

  comingSoonText: {
    color: theme.colors.white,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.semibold,
  },

  // Yan yana düzenleme stilleri
  rowContainerSecondary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  halfWidthSecondary: {
    flex: 1,
  },

  // Tam genişlik picker stilleri
  fullWidthPickerContainer: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },

  fullWidthPickerOption: {
    flex: 1,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.borderRadius.md,
    borderWidth: 0, // Çerçeve yok
    borderColor: '#DC143C', // Krimson çerçeve
    backgroundColor: theme.colors.inputBg, // Tema uyumlu arka plan
    alignItems: 'center',
    justifyContent: 'center',
    height: 42, // Picker butonları ile aynı yükseklik
  },

  fullWidthPickerOptionShort: {
    flex: 1,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.borderRadius.md,
    borderWidth: 0, // Çerçeve yok
    borderColor: '#DC143C', // Krimson çerçeve
    backgroundColor: theme.colors.inputBg, // Tema uyumlu arka plan
    alignItems: 'center',
    justifyContent: 'center',
    height: 42, // Picker butonları ile aynı yükseklik
  },

  // Tek buton stilleri
  singleButton: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    borderWidth: 0,
    borderColor: '#DC143C', // Krimson çerçeve
    backgroundColor: theme.colors.inputBg, // Tema uyumlu arka plan
    alignItems: 'center',
    justifyContent: 'center',
    height: 42, // Picker butonları ile aynı yükseklik
    width: 110, // Biraz azaltıldı
  },
  singleButtonActive: {
    backgroundColor: theme.colors.error, // Theme kırmızı rengi
    borderColor: theme.colors.error, // Theme kırmızı rengi
  },
  singleButtonText: {
    fontSize: theme.fontSizes.md,
    color: theme.colors.text, // Theme koyu renk
    fontWeight: theme.fontWeights.medium,
  },
  singleButtonTextActive: {
    color: theme.colors.white,
    fontWeight: theme.fontWeights.semibold,
  },

  // Harita stilleri
  inputWithButtonContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: theme.spacing.sm,
  },
  inputWithButton: {
    flex: 1,
  },
  mapButtonSecondary: {
    backgroundColor: theme.colors.error, // Theme kırmızı rengi
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 50,
  },
  mapButtonTextSecondary: {
    fontSize: 20,
  },
  mapModalContainer: {
    flex: 1,
    backgroundColor: theme.colors.white,
  },
  mapModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    backgroundColor: theme.colors.primary,
  },
  mapModalTitle: {
    fontSize: theme.fontSizes.lg,
    fontWeight: theme.fontWeights.semibold,
    color: theme.colors.white,
  },
  mapModalCloseButton: {
    padding: theme.spacing.sm,
  },
  mapModalCloseText: {
    fontSize: theme.fontSizes.lg,
    color: theme.colors.white,
    fontWeight: theme.fontWeights.bold,
  },
  mapContainer: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  mapModalFooter: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    backgroundColor: theme.colors.white,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  mapSelectButton: {
    backgroundColor: theme.colors.error, // Theme kırmızı rengi
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
  },
  mapSelectButtonDisabled: {
    backgroundColor: theme.colors.border,
  },
  mapSelectButtonText: {
    color: theme.colors.white,
    fontSize: theme.fontSizes.md,
    fontWeight: theme.fontWeights.semibold,
  },
  mapSelectButtonTextDisabled: {
    color: theme.colors.textMuted,
  },

  // Harita kartı stilleri
  mapCard: {
    backgroundColor: theme.colors.background, // Theme siyah rengi
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginTop: theme.spacing.md,
    padding: theme.spacing.sm,
    overflow: 'hidden',
  },
  mapCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    backgroundColor: '#DC143C', // Krimson arkaplan
    borderTopLeftRadius: theme.borderRadius.md, // Üst sol köşe
    borderTopRightRadius: theme.borderRadius.md, // Üst sağ köşe
  },
  mapCardTitle: {
    fontSize: theme.fontSizes.lg,
    fontWeight: theme.fontWeights.semibold,
    color: theme.colors.white, // Beyaz
    flex: 1,
  },
  currentLocationButton: {
    backgroundColor: theme.colors.white, // Beyaz arkaplan
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.sm,
    marginLeft: theme.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#DC143C', // Krimson çerçeve
  },
  currentLocationButtonText: {
    color: '#DC143C', // Krimson yazı
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.medium,
    marginLeft: theme.spacing.xs,
  },
  currentLocationIcon: {
    fontSize: 16,
    color: '#DC143C', // Krimson ikon
  },
  mapCardContainer: {
    height: 250,
    margin: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    overflow: 'hidden',
  },
  mapCardMap: {
    flex: 1,
    pointerEvents: 'auto',
  },
  mapCardButton: {
    backgroundColor: '#DC143C', // Krimson arkaplan
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
    margin: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    opacity: 1, // Şeffaflık kaldırıldı
  },
  mapCardButtonDisabled: {
    backgroundColor: '#DC143C', // Aynı krimson rengi
    opacity: 0.7, // Sadece disabled için hafif şeffaflık
  },
  mapCardButtonText: {
    color: theme.colors.white,
    fontSize: theme.fontSizes.md,
    fontWeight: theme.fontWeights.semibold,
  },
  mapCardButtonTextDisabled: {
    color: theme.colors.textMuted,
  },

  fullWidthPickerOptionActive: {
    backgroundColor: theme.colors.error, // Theme kırmızı rengi
    borderColor: theme.colors.error, // Theme kırmızı rengi
  },

  fullWidthPickerOptionText: {
    color: theme.colors.text, // Theme koyu renk
    fontSize: theme.fontSizes.xl,
    fontWeight: theme.fontWeights.semibold,
  },

  fullWidthPickerOptionTextActive: {
    color: theme.colors.white, // Beyaz
  },

  // Hata Modal Stilleri
  errorModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  errorModalContent: {
    backgroundColor: '#031015',
    borderRadius: 20,
    padding: 30,
    width: '85%',
    maxWidth: 350,
    alignItems: 'center',
    borderWidth: 0,
    shadowColor: 'rgba(255, 0, 0, 0.3)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },

  errorModalIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255, 0, 0, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },

  errorModalIconText: {
    fontSize: 30,
  },

  errorModalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: theme.colors.primary,
    marginBottom: 15,
    textAlign: 'center',
  },

  errorModalMessage: {
    fontSize: 16,
    color: theme.colors.white,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 25,
  },

  errorModalButton: {
    backgroundColor: theme.colors.error,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 30,
    minWidth: 120,
    alignItems: 'center',
  },

  errorModalButtonText: {
    color: theme.colors.white,
    fontSize: 16,
    fontWeight: '600',
  },

  // Taslak uyarı modalı stilleri
  draftModalButtons: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    marginTop: theme.spacing.lg,
  },
  draftSaveAsButton: {
    marginTop: theme.spacing.sm,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: theme.colors.error,
    alignItems: 'center',
  },
  draftSaveAsButtonText: {
    color: '#FFFFFF',
    fontSize: theme.fontSizes.lg,
    fontWeight: theme.fontWeights.bold,
  },

  draftModalButtonSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: theme.colors.accent,
  },

  draftModalButtonSecondaryText: {
    color: theme.colors.accent,
  },

  draftModalButtonPrimary: {
    backgroundColor: theme.colors.accent,
  },

  // Taslak uyarı modalı ikon stili
  draftModalIcon: {
    width: 56,
    height: 56,
    tintColor: theme.colors.success,
    marginBottom: 16,
    resizeMode: 'contain',
  },

  // Taslak uyarı modalı için artırılmış yükseklik
  draftModalContentLarge: {
    minHeight: 320,
    paddingTop: 45,
    paddingBottom: 28,
  },

  // Progress modal (Glassmorphism) content boyutu eski modalContainer ile uyumlu
  progressModalGlass: {
    width: '90%',
    maxHeight: '70%',
    padding: 0,
    alignItems: 'stretch',
    borderWidth: 0,
  },
  // Success modal: ayrı boyutlandırma
  successModalGlass: {
    width: '90%',
    minHeight: 220,
    maxHeight: '80%',
    paddingTop: 0,
    paddingBottom: 8,
    alignItems: 'stretch',
    borderWidth: 0,
  },
  successFooter: {
    marginTop: 16,
  },
  successIconLarge: {
    width: 72,
    height: 72,
    resizeMode: 'contain',
  },

  // Resim sıralama modal stilleri
  imageActionButtons: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  reorderButton: {
    backgroundColor: theme.colors.primary,
    flex: 1,
  },
  clearAllButton: {
    flex: 1,
  },
  reorderModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  reorderModalContent: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.lg,
    width: '90%',
    maxHeight: '80%',
    padding: theme.spacing.lg,
  },
  reorderModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  reorderModalTitle: {
    fontSize: theme.fontSizes.lg,
    fontWeight: theme.fontWeights.semibold,
    color: theme.colors.text,
  },
  reorderModalCloseText: {
    fontSize: theme.fontSizes.xl,
    color: theme.colors.textSecondary,
    fontWeight: theme.fontWeights.bold,
  },
  reorderModalInstruction: {
    fontSize: theme.fontSizes.sm,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: theme.spacing.lg,
  },
  reorderImageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
    marginBottom: theme.spacing.lg,
  },
  reorderImageItem: {
    width: '22%',
    marginBottom: theme.spacing.md,
    position: 'relative',
  },
  reorderImageItemSelected: {
    borderWidth: 3,
    borderColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
  },
  reorderImageThumbnail: {
    width: '100%',
    height: 80,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.border,
    resizeMode: 'cover',
  },
  reorderNumberBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: theme.colors.primary,
    borderRadius: 15,
    width: 30,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: theme.colors.background,
  },
  reorderNumberText: {
    color: theme.colors.white,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
  },
  reorderModalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  reorderCancelButton: {
    flex: 1,
    backgroundColor: theme.colors.border,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
  },
  reorderCancelButtonText: {
    color: theme.colors.text,
    fontSize: theme.fontSizes.md,
    fontWeight: theme.fontWeights.medium,
  },
  reorderApplyButton: {
    flex: 1,
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
  },
  reorderApplyButtonText: {
    color: theme.colors.white,
    fontSize: theme.fontSizes.md,
    fontWeight: theme.fontWeights.medium,
  },

  // Resim ekleme stilleri
  sectionSubtitle: {
    fontSize: theme.fontSizes.md,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.lg,
    textAlign: 'center',
    lineHeight: 20,
  },

  imageButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: theme.spacing.lg,
  },

  imageButton: {
    flex: 1,
    marginHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.lg,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 80,
    ...theme.shadows.medium,
  },

  galleryButton: {
    backgroundColor: theme.colors.info,
  },

  cameraButton: {
    backgroundColor: theme.colors.success,
  },

  imageButtonIcon: {
    fontSize: 32,
    marginBottom: theme.spacing.xs,
  },

  imageButtonIconImage: {
    width: 28,
    height: 28,
    marginBottom: theme.spacing.xs,
    tintColor: theme.colors.white,
    resizeMode: 'contain',
  },

  imageButtonText: {
    color: theme.colors.white,
    fontSize: theme.fontSizes.lg,
    fontWeight: theme.fontWeights.semibold,
  },

  clearAllButton: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    alignItems: 'center',
    gap: theme.spacing.xs,
    backgroundColor: '#DC143C',
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  clearAllIcon: {
    width: 16,
    height: 16,
    tintColor: theme.colors.white,
    resizeMode: 'contain',
  },
  clearAllText: {
    color: theme.colors.white,
    fontSize: theme.fontSizes.md,
    fontWeight: theme.fontWeights.semibold,
  },

  imageCountText: {
    fontSize: theme.fontSizes.md,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: theme.spacing.md,
  },

  selectedImagesContainer: {
    marginTop: theme.spacing.md,
  },

  imageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
    paddingHorizontal: theme.spacing.sm,
  },

  selectedImagesTitle: {
    fontSize: theme.fontSizes.lg,
    fontWeight: theme.fontWeights.semibold,
    color: theme.colors.white,
    marginBottom: theme.spacing.md,
  },

  imageItem: {
    width: '23%',
    marginBottom: theme.spacing.md,
    alignItems: 'center',
  },

  imagePreview: {
    position: 'relative',
    width: 75,
    height: 75,
  },

  featuredImagePreview: {
    borderWidth: 3,
    borderColor: theme.colors.error,
    borderRadius: theme.borderRadius.md,
  },


  imageTouchable: {
    width: '100%',
    height: '100%',
  },

  imageThumbnail: {
    width: 75,
    height: 75,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.border,
    resizeMode: 'cover',
  },

  featuredBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: theme.colors.warning,
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: theme.colors.white,
  },

  featuredBadgeText: {
    fontSize: 12,
  },

  imageActions: {
    flexDirection: 'row',
    marginTop: theme.spacing.xs,
    gap: theme.spacing.xs,
  },

  actionButton: {
    backgroundColor: theme.colors.error,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  actionIcon: {
    width: 14,
    height: 14,
    tintColor: theme.colors.white,
    resizeMode: 'contain',
  },

  removeButtonSecondary: {
    backgroundColor: theme.colors.error,
  },

  actionButtonText: {
    color: theme.colors.white,
    fontSize: 12,
    fontWeight: 'bold',
  },

  // Resim önizleme modal stilleri
  imagePreviewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  imagePreviewContent: {
    width: '95%',
    height: '90%',
    backgroundColor: '#031015',
    borderRadius: theme.borderRadius.lg,
    overflow: 'hidden',
  },

  imagePreviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },

  imagePreviewTitle: {
    fontSize: theme.fontSizes.xl,
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.white,
  },

  imagePreviewCloseButton: {
    padding: theme.spacing.sm,
  },

  imagePreviewCloseText: {
    fontSize: 24,
    color: theme.colors.white,
    fontWeight: 'bold',
  },

  imagePreviewContainer: {
    flex: 1,
    padding: theme.spacing.lg,
  },

  imagePreviewImage: {
    flex: 1,
    width: '100%',
    borderRadius: theme.borderRadius.md,
  },

  imagePreviewActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: theme.spacing.lg,
    gap: theme.spacing.md,
  },

  imagePreviewActionButton: {
    flex: 1,
    backgroundColor: theme.colors.error,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
  },

  imagePreviewActionButtonActive: {
    backgroundColor: theme.colors.warning,
  },

  imagePreviewRemoveButton: {
    backgroundColor: theme.colors.error,
  },

  imagePreviewActionButtonText: {
    color: theme.colors.white,
    fontSize: theme.fontSizes.md,
    fontWeight: theme.fontWeights.semibold,
  },

  // Kamera çekim modu stilleri
  cameraModeOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  cameraModeContent: {
    width: '95%',
    maxHeight: '80%',
    backgroundColor: '#031015',
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
  },

  cameraModeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },

  cameraModeTitle: {
    fontSize: theme.fontSizes.xl,
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.white,
  },

  cameraModeCloseButton: {
    padding: theme.spacing.sm,
  },

  cameraModeCloseText: {
    fontSize: 24,
    color: theme.colors.white,
    fontWeight: 'bold',
  },

  cameraModeInfo: {
    backgroundColor: theme.colors.error,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.lg,
  },

  cameraModeInfoText: {
    color: theme.colors.white,
    fontSize: theme.fontSizes.md,
    textAlign: 'center',
    fontWeight: theme.fontWeights.medium,
  },

  cameraImagesContainer: {
    marginBottom: theme.spacing.lg,
  },

  cameraImagesTitle: {
    fontSize: theme.fontSizes.lg,
    fontWeight: theme.fontWeights.semibold,
    color: theme.colors.white,
    marginBottom: theme.spacing.md,
  },

  cameraImageItem: {
    marginRight: theme.spacing.md,
    position: 'relative',
  },

  cameraImageThumbnail: {
    width: 80,
    height: 80,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.border,
  },

  cameraImageRemoveButton: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: theme.colors.error,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: theme.colors.white,
  },

  cameraImageRemoveText: {
    color: theme.colors.white,
    fontSize: 12,
    fontWeight: 'bold',
  },

  cameraModeButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: theme.spacing.md,
  },

  cameraModeButton: {
    flex: 1,
    paddingVertical: theme.spacing.lg,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 60,
    ...theme.shadows.medium,
  },

  cameraTakeButton: {
    backgroundColor: theme.colors.success,
  },

  cameraContinuousButton: {
    backgroundColor: theme.colors.warning,
  },

  cameraStopButton: {
    backgroundColor: theme.colors.error,
  },

  cameraFinishButton: {
    backgroundColor: theme.colors.info,
  },

  cameraModeButtonIcon: {
    fontSize: 24,
    marginBottom: theme.spacing.xs,
  },

  cameraModeButtonText: {
    color: theme.colors.white,
    fontSize: theme.fontSizes.md,
    fontWeight: theme.fontWeights.semibold,
  },

  // Wizard styles
  wizardStep: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },

  stepTitleBadge: {
    backgroundColor: '#173346', 
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: 0, // Düz kenarlar
    marginHorizontal: -theme.spacing.lg, // Sayfa genişliğine kadar uzat
    marginBottom: 0, // Üst badge ile arasında boşluk yok
    borderWidth: 0, // Shadow kaldırıldı
    borderColor: 'transparent', // Şeffaf border
    // Shadow tamamen kaldırıldı
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  stepTitleBadgeCrimson: {
    backgroundColor: 'rgba(220, 20, 60, 0.18)',
    marginTop: 0,
    marginBottom: theme.spacing.lg,
  },
  stepTitleBadgeNoBleed: {
    marginHorizontal: 0,
  },

  stepTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: theme.spacing.md,
    marginBottom: 0,
  },
  stepTitleIcon: {
    width: 20,
    height: 20,
    tintColor: '#DC143C',
    resizeMode: 'contain',
  },
  stepTitleBadgeInline: {
    marginHorizontal: 0,
    borderWidth: 0,
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  inlineProgressWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flex: 1,
  },
  inlineProgressBg: {
    flex: 1,
    height: 10,
    borderRadius: 999,
    backgroundColor: theme.colors.progressBg,
    overflow: 'hidden',
  },
  inlineProgressFill: {
    height: '100%',
    backgroundColor: theme.colors.progressFill,
  },
  inlineProgressText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.sm,
    width: 38,
    textAlign: 'right',
  },

  stepTitle: {
    fontSize: theme.fontSizes.xxl,
    fontWeight: '800', // Daha kalın
    textAlign: 'center',
    color: theme.colors.white, // Beyaz metin krimson arka plan için
  },
  stepTitleSmall: {
    fontSize: theme.fontSizes.lg,
  },
  stepTitleNote: {
    fontSize: theme.fontSizes.sm,
    color: theme.colors.error,
    fontStyle: 'italic',
  },

  stepDescription: {
    fontSize: theme.fontSizes.md,
    color: theme.colors.white,
    marginBottom: theme.spacing.lg,
    opacity: 0.8,
  },
  stepDescriptionBold: {
    fontWeight: theme.fontWeights.bold,
  },
  stepDescriptionCrimson: {
    color: theme.colors.error,
  },

  wizardNavigation: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.lg,
    gap: theme.spacing.md,
  },

  navButton: {
    flex: 1,
    paddingVertical: theme.spacing.lg,
    paddingHorizontal: theme.spacing.xl,
    borderRadius: theme.borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
    ...theme.shadows.medium,
  },

  navButtonPrimary: {
    backgroundColor: theme.colors.error,
  },

  navButtonSecondary: {
    backgroundColor: theme.colors.textSecondary,
  },

  navButtonSuccess: {
    backgroundColor: theme.colors.success,
  },

  navButtonTextPrimary: {
    color: theme.colors.white,
    fontSize: theme.fontSizes.lg,
    fontWeight: theme.fontWeights.bold,
  },

  navButtonTextSecondary: {
    color: theme.colors.white,
    fontSize: theme.fontSizes.lg,
    fontWeight: theme.fontWeights.bold,
  },

  navButtonTextSuccess: {
    color: theme.colors.white,
    fontSize: theme.fontSizes.lg,
    fontWeight: theme.fontWeights.bold,
  },

  // Kaydet butonu stilleri
  saveButtonContainer: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.lg,
  },
  saveButton: {
    backgroundColor: theme.colors.error,
    paddingVertical: theme.spacing.lg,
    paddingHorizontal: theme.spacing.xl,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonCompact: {
    paddingVertical: 12,
    minHeight: 32,
    paddingHorizontal: 8,
  },
  saveButtonDisabled: {
    backgroundColor: theme.colors.border,
    opacity: 0.6,
  },
  saveButtonText: {
    color: theme.colors.white,
    fontSize: theme.fontSizes.lg,
    fontWeight: theme.fontWeights.bold,
  },
  saveButtonTextCompact: {
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.medium,
  },

});

export default AddPortfolio;