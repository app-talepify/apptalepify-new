// src/screens/PortfolioMap.js
import React, { useState, useRef, memo, useMemo, useEffect, useCallback, startTransition } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  Animated,
  Platform,
  Modal,
  BackHandler,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Geolocation from '@react-native-community/geolocation';
import { getDoc, doc, onSnapshot, collection, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import UnifiedPoolMap from '../components/map/UnifiedPoolMap';
import MapStyleSelector from '../components/MapStyleSelector';
import GlassmorphismView from '../components/GlassmorphismView';
import { MAPBOX_STYLES } from '../constants/mapStyles';
import { theme } from '../theme/theme';
import { useAuth } from '../context/AuthContext';
import { fetchUserRequests } from '../services/firestore';
import { getMatchingRequestsForPortfolio } from '../utils/requestMatching';
import { useFocusEffect } from '@react-navigation/native';
import AdvancedFiltersModal from '../components/AdvancedFiltersModal';
import { matchesFilters, filterByPolygon } from '../utils/filtering';
import { usePortfolioSearch } from '../context/PortfolioSearchContext';

// Map kütüphanesi seçimi UnifiedPoolMap içinde yapılır

// Adres metnini kısaltan yardımcı fonksiyon
const formatShortAddress = (fullAddress) => {
  if (!fullAddress || typeof typeof fullAddress !== 'string') {
    return 'Adres bilgisi yok';
  }
  // "Şehir, İlçe, Mahalle..." formatını "İlçe, Mahalle..."'ye çevirir
  if (fullAddress.includes(',')) {
    const parts = fullAddress.split(',');
    return parts.length > 1 ? parts.slice(1).join(',').trim() : fullAddress;
  }
  // "Şehir İlçe Mahalle..." formatını "İlçe Mahalle..."'ye çevirir
  const parts = fullAddress.split(' ');
  return parts.length > 1 ? parts.slice(1).join(' ').trim() : fullAddress;
};

const PortfolioMap = ({ navigation, route }) => {
  const { portfolios, filters, setFilters, hasAppliedFilters, setHasAppliedFilters, drawnPolygon, setDrawnPolygon } = usePortfolioSearch();
  const onlyMine = route?.params?.onlyMine || false;
  const [selectedPortfolio, setSelectedPortfolio] = useState(null);
  const [portfolioOwner, setPortfolioOwner] = useState(null);
  const [showPortfolioModal, setShowPortfolioModal] = useState(false);
  const [pinMatchCount, setPinMatchCount] = useState(null);
  const [pinMatchLoading, setPinMatchLoading] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [showMapSpinner, setShowMapSpinner] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const insets = useSafeAreaInsets();
  const [viewedPortfolios, setViewedPortfolios] = useState(new Set()); // Görüntülenen portföyler
  const [viewedCounter, setViewedCounter] = useState(0); // Pin soluklaşması için force update
  const sessionKeyRef = useRef(`map-session-${Date.now()}`); // Her açılışta yeni session
  
  const getInitials = (name) => {
    if (!name || typeof name !== 'string') return '';
    const names = name.split(' ');
    const initials = names.map(n => n[0]).join('');
    return initials.toUpperCase().slice(0, 2);
  };

  // Component mount olduğunda viewed portfolios'i yükle (bu session için)
  useEffect(() => {
    const loadViewedPortfolios = async () => {
      try {
        const stored = await AsyncStorage.getItem(sessionKeyRef.current);
        if (stored) {
          const ids = JSON.parse(stored);
          setViewedPortfolios(new Set(ids));
        }
      } catch (error) {
        // Silent fail - session data yüklenemezse yeni başla
      }
    };
    loadViewedPortfolios();
  }, []);

  // ViewedPortfolios değiştiğinde kaydet
  useEffect(() => {
    const saveViewedPortfolios = async () => {
      try {
        const ids = Array.from(viewedPortfolios);
        await AsyncStorage.setItem(sessionKeyRef.current, JSON.stringify(ids));
      } catch (error) {
        // Silent fail - session data kaydedilemezse sorun değil
      }
    };
    if (viewedPortfolios.size > 0) {
      saveViewedPortfolios();
    }
  }, [viewedPortfolios]);
  const [locationPermissionGranted, setLocationPermissionGranted] = useState(false);
  
  const [mapReady, setMapReady] = useState(true);
  
  // iOS Mapbox/Native warning filter: "Could not find image file ... default-logo.png"
  // Bu uyarı zararsız; yalnızca bu ekranda bastırıyoruz (sadece geliştirici modunda).
  const originalWarnRef = useRef(null);
  useEffect(() => {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      originalWarnRef.current = console.warn;
      console.warn = (...args) => {
        try {
          const msg = args && args[0];
          if (typeof msg === 'string' && msg.includes('default-logo.png')) {
            return;
          }
        } catch {}
        originalWarnRef.current && originalWarnRef.current(...args);
      };
      return () => {
        if (originalWarnRef.current) {
          console.warn = originalWarnRef.current;
        }
      };
    }
  }, []);
  const [myRequests, setMyRequests] = useState(null);
  const [myRequestsReady, setMyRequestsReady] = useState(false);
  const [poolRequests, setPoolRequests] = useState([]);
  const [poolRequestsReady, setPoolRequestsReady] = useState(false);

  // Show spinner only if loading exceeds 200ms (avoid flash)
  useEffect(() => {
    let timer;
    if (!mapLoaded) {
      timer = setTimeout(() => setShowMapSpinner(true), 200);
    } else {
      setShowMapSpinner(false);
    }
    return () => timer && clearTimeout(timer);
  }, [mapLoaded]);

  // Load last camera from storage at mount
  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(CAMERA_CACHE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed && Array.isArray(parsed.center) && typeof parsed.zoom === 'number') {
            setInitialCamera(parsed);
            lastCameraStateRef.current = parsed;
          }
        }
      } catch {}
    })();
  }, []);

  // Android için LayoutAnimation'ı aktif et
  useEffect(() => {
    if (Platform.OS === 'android') {
      try {
        // UIManager'dan LayoutAnimation'ı etkinleştir
        const { UIManager } = require('react-native');
        if (UIManager.setLayoutAnimationEnabledExperimental) {
          UIManager.setLayoutAnimationEnabledExperimental(true);
        }
      } catch (error) {
        // Ignore
      }
    }
  }, []);

  // Çizim özelliği için state'ler
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [drawingPoints, setDrawingPoints] = useState([]);
  const [filteredPortfolios, setFilteredPortfolios] = useState([]);
  const [isClearingFilters, setIsClearingFilters] = useState(false); // Filtreler temizleniyor mu?
  
  // Debug: hasAppliedFilters değişimini logla
  useEffect(() => {
    if (__DEV__) {
      console.log('🔄 hasAppliedFilters değişti:', hasAppliedFilters);
    }
  }, [hasAppliedFilters]);

  // Filtrelerin gerçekten değişip değişmediğini kontrol et
  const checkIfFiltersChanged = useCallback((oldFilters, newFilters) => {
    // Temel kontroller
    if (oldFilters.priceRange[0] !== newFilters.priceRange[0] || oldFilters.priceRange[1] !== newFilters.priceRange[1]) return true;
    if (oldFilters.propertyType !== newFilters.propertyType) return true;
    if (oldFilters.listingType !== newFilters.listingType) return true;
    if (oldFilters.creditLimit !== newFilters.creditLimit) return true;
    
    // Array kontrolleri
    if (JSON.stringify(oldFilters.rooms) !== JSON.stringify(newFilters.rooms)) return true;
    
    // Range kontrolleri
    if (oldFilters.areaRange[0] !== newFilters.areaRange[0] || oldFilters.areaRange[1] !== newFilters.areaRange[1]) return true;
    if (oldFilters.buildingAgeRange[0] !== newFilters.buildingAgeRange[0] || oldFilters.buildingAgeRange[1] !== newFilters.buildingAgeRange[1]) return true;
    if (oldFilters.totalFloorsRange[0] !== newFilters.totalFloorsRange[0] || oldFilters.totalFloorsRange[1] !== newFilters.totalFloorsRange[1]) return true;
    if (oldFilters.floorNumberRange[0] !== newFilters.floorNumberRange[0] || oldFilters.floorNumberRange[1] !== newFilters.floorNumberRange[1]) return true;
    
    // Boolean kontrolleri
    if (oldFilters.parentalBathroom !== newFilters.parentalBathroom) return true;
    if (oldFilters.exchange !== newFilters.exchange) return true;
    if (oldFilters.hasParking !== newFilters.hasParking) return true;
    if (oldFilters.hasGlassBalcony !== newFilters.hasGlassBalcony) return true;
    if (oldFilters.hasDressingRoom !== newFilters.hasDressingRoom) return true;
    if (oldFilters.isFurnished !== newFilters.isFurnished) return true;
    
    // String kontrolleri
    if (oldFilters.kitchenType !== newFilters.kitchenType) return true;
    if (oldFilters.usageStatus !== newFilters.usageStatus) return true;
    if (oldFilters.titleDeedStatus !== newFilters.titleDeedStatus) return true;
    if (oldFilters.bathroomCount !== newFilters.bathroomCount) return true;
    if (oldFilters.balconyCount !== newFilters.balconyCount) return true;
    if (oldFilters.heatingType !== newFilters.heatingType) return true;
    if (oldFilters.occupancyStatus !== newFilters.occupancyStatus) return true;
    
    return false; // Hiçbir değişiklik yok
  }, []);
  const [showDrawingToast, setShowDrawingToast] = useState(false);
  const [show3DGuideModal, setShow3DGuideModal] = useState(false);
  const [showLocationErrorModal, setShowLocationErrorModal] = useState(false);
  const [locationErrorMessage, setLocationErrorMessage] = useState('');
  const locationErrorAnim = useRef(new Animated.Value(0)).current;
  
  // Harita stili ve 3D için state'ler
  const [mapStyle, setMapStyle] = useState(MAPBOX_STYLES.STREETS.url);
  const [enable3D, setEnable3D] = useState(true);
  const [isSatelliteView, setIsSatelliteView] = useState(false);

  // Filtreleme için state'ler
  const [showFilterModal, setShowFilterModal] = useState(false);
  const modalSlideAnim = useRef(new Animated.Value(0)).current;
  const modalFadeAnim = useRef(new Animated.Value(0)).current;

  // Filtreleme modal'ını aç
  const openFilterModal = () => {
    setShowFilterModal(true);
    // Smooth slide up animasyonu
    Animated.parallel([
      Animated.timing(modalFadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.spring(modalSlideAnim, {
        toValue: 1,
        tension: 100,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();
  };

  // Filtreleme modal'ını kapat
  const closeFilterModal = () => {
      setShowFilterModal(false);
  };

  // Filtreleri uygula
  const applyFilters = useCallback((newFilters) => {
    if (__DEV__) { console.log('🔧 [PortfolioMap] Filtreler uygulanıyor...'); }
    if (isClearingFilters) {
      if (__DEV__) { console.log('⚠️ Filtreler temizleniyor, hasAppliedFilters güncellenmiyor'); }
      return;
    }
    const hasRealChanges = checkIfFiltersChanged(filters, newFilters);
    if (__DEV__) { console.log('🔍 Filtre değişikliği var mı?', hasRealChanges); }
    setFilters(newFilters);
    if (hasRealChanges) {
      setHasAppliedFilters(true);
      if (__DEV__) { console.log('✅ [PortfolioMap] Filtreler uygulandı, hasAppliedFilters: true'); }
    } else {
      if (__DEV__) { console.log('ℹ️ [PortfolioMap] Gerçek değişiklik yok, hasAppliedFilters değişmedi'); }
    }
    // Not computing here; effect will recompute to keep UI responsive
  }, [isClearingFilters, checkIfFiltersChanged, filters]);

  // Mount: route parametreleri varsa store'u senkronla
  useEffect(() => {
    const initFilters = route?.params?.filters;
    const initHas = route?.params?.hasAppliedFilters;
    const initPoly = route?.params?.drawnPolygon;
    if (initFilters) setFilters(initFilters);
    if (typeof initHas === 'boolean') setHasAppliedFilters(initHas);
    if (initPoly) setDrawnPolygon(initPoly);
    if (initHas && initFilters) {
      applyFilters(initFilters);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Filtreleri temizle
  const clearFilters = useCallback(() => {
    if (__DEV__) { console.log('🧹 Filtreler temizleniyor...'); }
    setIsClearingFilters(true); // Temizleme flag'ini aktif et
    const defaultFilters = {
      priceRange: [0, 20000000],
      propertyType: '',
      listingType: '',
      creditLimit: '',
      rooms: [],
      areaRange: [0, 500],
      buildingAgeRange: [0, 50],
      totalFloorsRange: [0, 50],
      floorNumberRange: [0, 50],
      parentalBathroom: false,
      exchange: false,
      kitchenType: '',
      usageStatus: '',
      titleDeedStatus: '',
      bathroomCount: '',
      balconyCount: '',
      hasParking: false,
      hasGlassBalcony: false,
      hasDressingRoom: false,
      isFurnished: false,
      heatingType: '',
      occupancyStatus: '',
    };
    setFilters(defaultFilters);
    setHasAppliedFilters(false);
    // Tüm pinlere geri dön: eğer polygon varsa polygon içindeki TÜM pinler, yoksa ilk 100 pin
    if (drawnPolygon && Array.isArray(drawnPolygon) && drawnPolygon.length >= 3) {
      const polygonBase = drawnPolygon.slice(0, -1);
      const polyAll = portfoliosWithCoordinates.filter((p) => {
        const lng = Number(p.coordinates.longitude);
        const lat = Number(p.coordinates.latitude);
        return isPointInPolygon([lng, lat], polygonBase);
      });
      setFilteredPortfolios(polyAll);
    } else {
      setFilteredPortfolios(portfoliosWithCoordinates.slice(0, 100));
    }
    if (__DEV__) { console.log('✅ Filtreler temizlendi, hasAppliedFilters: false'); }
    
    // Kısa bir süre sonra flag'i kapat
    setTimeout(() => {
      setIsClearingFilters(false);
    }, 100);
  }, [portfoliosWithCoordinates]);
  // filters state context'e taşındı

  // "Daha Fazla Filtre" açık/kapalı state'i
  const [showMoreFilters, setShowMoreFilters] = useState(false);

  // DailyTasks'ten alınan modal config
  const portfolioModalCardConfig = useMemo(() => ({
    overlayColor: 'rgba(255, 0, 0, 0)',
    startColor: 'rgb(24, 54, 73)',
    endColor: 'rgba(17, 36, 49, 0.79)',
    gradientAlpha: 1,
    gradientDirection: 150,
    gradientSpread: 7,
    ditherStrength: 4.0,
  }), []);

  const portfolioModalFooterConfig = useMemo(() => ({
    overlayColor: 'rgba(0, 0, 0, 0)',
    startColor: 'rgba(10, 20, 28, 0.69)',
    endColor: 'rgba(17, 36, 49, 0.64)',
    gradientAlpha: 1,
    gradientDirection: 150,
    gradientSpread: 7,
    ditherStrength: 4.0,
  }), []);

  const mapRef = useRef(null);
  const cameraRef = useRef(null);
  const lastCameraStateRef = useRef(null);
  const cameraSaveTimerRef = useRef(null);
  const [initialCamera, setInitialCamera] = useState(null);
  const CAMERA_CACHE_KEY = 'map_last_camera_v1';
  const cancelTokenRef = useRef({ cancelled: false });
  const lastDrawingPoint = useRef(null);
  const lastDrawingTime = useRef(0);
  const lastScreenPointRef = useRef(null);
  const lastFilterSignatureRef = useRef(null);
  const locationWatchIdRef = useRef(null); // Konum takibi için watchId
  const drawingToastTimeoutRef = useRef(null); // Çizim modu tostu zamanlayıcı

  // Recompute filtered portfolios whenever store filters/polygon change
  useEffect(() => {
    try {
      // Signature guard to avoid redundant heavy work
      const polySig = drawnPolygon && Array.isArray(drawnPolygon) ? String(drawnPolygon.length) : '0';
      const sig = JSON.stringify(filters) + '|' + String(hasAppliedFilters) + '|' + polySig + '|' + String(portfoliosWithCoordinates.length);
      if (lastFilterSignatureRef.current === sig) {
        return;
      }
      lastFilterSignatureRef.current = sig;

      if (hasAppliedFilters) {
        let base = portfoliosWithCoordinates.filter(p => matchesFilters(p, filters));
        if (drawnPolygon && Array.isArray(drawnPolygon) && drawnPolygon.length >= 3) {
          base = filterByPolygon(base, drawnPolygon);
        }
        startTransition(() => setFilteredPortfolios(base));
        return;
      }

      // No active filters
      if (drawnPolygon && Array.isArray(drawnPolygon) && drawnPolygon.length >= 3) {
        const base = filterByPolygon(portfoliosWithCoordinates, drawnPolygon);
        startTransition(() => setFilteredPortfolios(base));
      } else {
        startTransition(() => setFilteredPortfolios(portfoliosWithCoordinates.slice(0, 100)));
      }
    } catch (e) {
      // Silent fail; keep previous state
    }
  }, [hasAppliedFilters, filters, drawnPolygon, portfoliosWithCoordinates]);

  // Animasyon değerleri
  const fadeAnim = useRef(new Animated.Value(0)).current; // kart modalı
  const scaleAnim = useRef(new Animated.Value(0.8)).current; // kart modalı
  const slideAnim = useRef(new Animated.Value(12)).current; // kart modalı - daha kısa yol
  // Ekran açılış animasyonu (profesyonel giriş - büyüme efekti)
  const entryFade = useRef(new Animated.Value(1)).current;
  const entryTranslate = useRef(new Animated.Value(18)).current;
  const entryScale = useRef(new Animated.Value(0.85)).current; // Başlangıçta küçük
  const mapScale = useRef(new Animated.Value(0.98)).current;
  const exitOverlayOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Ekran görünürken büyüme + fade + translate animasyonu (yavaş ve pürüzsüz)
    Animated.parallel([
      Animated.timing(entryFade, {
        toValue: 1,
        duration: 550,
        useNativeDriver: true,
      }),
      Animated.timing(entryTranslate, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.spring(entryScale, {
        toValue: 1,
        tension: 45,
        friction: 8,
        useNativeDriver: true,
      }),
      Animated.spring(mapScale, {
        toValue: 1,
        tension: 65,
        friction: 10,
        useNativeDriver: true,
      }),
    ]).start();
  }, [entryFade, entryTranslate, entryScale, mapScale]);

  // Sade kapanış: kısa bir fade-out, sonra navigate
  const fadeOutAndNavigate = useCallback((navigateFn) => {
    try {
      Animated.parallel([
        Animated.timing(entryFade, {
          toValue: 0,
          duration: 140,
          useNativeDriver: true,
        }),
        Animated.timing(mapScale, {
          toValue: 0.98,
          duration: 140,
          useNativeDriver: true,
        }),
        Animated.timing(exitOverlayOpacity, {
          toValue: 1,
          duration: 140,
          useNativeDriver: true,
        }),
      ]).start(() => {
        try { navigateFn && navigateFn(); } finally {
          try { mapScale.setValue(1); exitOverlayOpacity.setValue(0); } catch {}
        }
      });
    } catch {
      try { navigateFn && navigateFn(); } catch {}
    }
  }, [entryFade, mapScale, exitOverlayOpacity]);

  // Icon'lar - AddPortfolio ile aynı
  const FILTER_ICONS = {
    'Fiyat Aralığı': require('../assets/images/icons/fiyat.png'),
    'İlan Durumu': require('../assets/images/icons/durumuilan.png'),
    'Portföy Tipi': require('../assets/images/icons/type.png'),
    'm² Aralığı': require('../assets/images/icons/square.png'),
    'Oda Sayısı': require('../assets/images/icons/room.png'),
    'Bina Yaşı': require('../assets/images/icons/binayas.png'),
    'Kat Bilgileri': require('../assets/images/icons/stairs.png'),
    'Ebeveyn Banyosu': require('../assets/images/icons/ebvbath.png'),
    'Takas': require('../assets/images/icons/swap.png'),
    'Mutfak Tipi': require('../assets/images/icons/kitchen.png'),
    'Kullanım Durumu': require('../assets/images/icons/kullanim.png'),
    'Tapu Durumu': require('../assets/images/icons/title.png'),
    // Daha Fazla Filtre İkonları
    'Banyo Sayısı': require('../assets/images/icons/bathroom.png'),
    'Balkon Sayısı': require('../assets/images/icons/Balcony.png'),
    'Isıtma Tipi': require('../assets/images/icons/boiler.png'),
    'İskan Durumu': require('../assets/images/icons/type.png'),
  };

  // Label with Icon renderer
  const renderFilterLabel = (label) => (
    <View style={styles.filterLabelRow}>
      {FILTER_ICONS[label] && (
        <Image source={FILTER_ICONS[label]} style={styles.filterLabelIcon} />
      )}
      <Text style={styles.filterSectionTitle}>{label}</Text>
    </View>
  );

  // Slider değişimi handler'ı
  const handleSliderChange = useCallback((field, value) => {
    setFilters(prev => {
      // Gereksiz re-render'ları önle
      if (JSON.stringify(prev[field]) === JSON.stringify(value)) {
        return prev;
      }
      return {
        ...prev,
        [field]: value,
      };
    });
  }, []);

  // Slider için fiyat formatlama
  const formatPriceForSlider = useCallback((price) => {
    return new Intl.NumberFormat('tr-TR').format(price) + ' ₺';
  }, []);

  // m² formatlama
  const formatArea = useCallback((area) => {
    if (isNaN(area) || area === null || area === undefined) {
      return '0 m²';
    }
    return area + ' m²';
  }, []);

  // Bina yaşı formatlama
  const formatAge = useCallback((age) => {
    if (isNaN(age) || age === null || age === undefined) {
      return '0 Yaş';
    }
    return age === 0 ? 'Sıfır' : age + ' Yaş';
  }, []);

  // Kat formatlama
  const formatFloor = useCallback((floor) => {
    try {
      const numFloor = Number(floor);
      if (isNaN(numFloor) || floor === null || floor === undefined) {
        return '0. Kat';
      }
      return numFloor === 0 ? 'Zemin' : numFloor + '. Kat';
    } catch (error) {
      return '0. Kat';
    }
  }, []);

  // Şehir koordinatları
  const cityCoordinates = {
    Ankara: [32.8597, 39.9334],
    İstanbul: [28.9784, 41.0082],
    Samsun: [36.2593, 41.3351],
    İzmir: [27.1428, 38.4192],
    Antalya: [30.7133, 36.8969],
    Bursa: [29.0610, 40.1826],
    Adana: [35.3213, 37.0],
    Konya: [32.4817, 37.8667],
    Gaziantep: [37.3828, 37.0662],
    Mersin: [34.6415, 36.8],
  };

  // Kullanıcının şehrine göre merkez
  const { user, userProfile } = useAuth();
  const userCity = userProfile?.city || 'Ankara';
  const defaultCenter = cityCoordinates[userCity] || cityCoordinates.Ankara;
  const defaultZoom = 14;
  const currentUserId = (user?.uid) || userProfile?.uid || userProfile?.id; // Kullanıcının kendi portföylerini ayırt etmek için

  const formatPrice = useCallback((price) => {
    if (typeof price !== 'number' || isNaN(price)) {
      return 'Belirtilmemiş';
    }
    return `${price.toLocaleString('tr-TR')} ₺`;
  }, []);

  // Konum izni kontrol et
  const checkLocationPermission = useCallback(async () => {
    try {
      if (Platform.OS === 'android') {
        const { PermissionsAndroid } = require('react-native');
        const fine = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
        const coarse = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION);
        const granted = !!(fine || coarse);
        setLocationPermissionGranted(granted);
        return granted;
      } else {
        // iOS: açıkça yetki iste ve sonucu dön
        try {
          // @react-native-community/geolocation API'sinde iOS için argümansız çağrı gerekir
          Geolocation.requestAuthorization && Geolocation.requestAuthorization();
          // İzni doğrulamak için optimistik true döndür (konum alınamazsa aşağıda handle edilir)
          setLocationPermissionGranted(true);
          return true;
        } catch {
          // Eski iOS sürümleri için besteffort true kabul etme yerine false dön
          setLocationPermissionGranted(false);
          return false;
        }
      }
    } catch (error) {
      return false;
    }
  }, []);

  // My requests - real-time subscribe so star/rozet güncel kalsın
  useEffect(() => {
    const uid = (user && user.uid) || userProfile?.uid || userProfile?.id;
    if (!uid) {
      setMyRequests([]);
      setMyRequestsReady(true);
      return;
    }
    setMyRequestsReady(false);
    const q = query(collection(db, 'requests'), where('userId', '==', uid));
    const unsub = onSnapshot(q, (snap) => {
      try {
        const reqs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setMyRequests(reqs);
      } finally {
        setMyRequestsReady(true);
      }
    }, () => setMyRequestsReady(true));
    return () => unsub();
  }, [user?.uid, userProfile?.uid, userProfile?.id]);

  // Public pool requests (published + publishToPool) - only needed for own portfolios; scope by user's city
  useEffect(() => {
    try {
      setPoolRequestsReady(false);
      let unsub = null;
      if (userCity) {
        const q = query(
          collection(db, 'requests'),
          where('isPublished', '==', true),
          where('publishToPool', '==', true),
          where('city', '==', userCity)
        );
        unsub = onSnapshot(q, (snap) => {
          const reqs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          setPoolRequests(reqs);
          setPoolRequestsReady(true);
        }, () => setPoolRequestsReady(true));
      } else {
        setPoolRequests([]);
        setPoolRequestsReady(true);
      }
      return () => { unsub && unsub(); };
    } catch {
      setPoolRequestsReady(true);
    }
  }, [userCity]);

  // Kullanıcı konumunu al ve state'e kaydet
  const getUserLocation = useCallback(async () => {
    try {
      // Android için konum izni iste
      if (Platform.OS === 'android') {
        const { PermissionsAndroid } = require('react-native');
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: 'Konum İzni',
            message: 'Mevcut konumunuzu göstermek için konum izni gerekiyor.',
            buttonNeutral: 'Daha Sonra Sor',
            buttonNegative: 'İptal',
            buttonPositive: 'Tamam',
          },
        );

        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          setLocationPermissionGranted(false);
          return;
        }
        setLocationPermissionGranted(true);
      }

      // Sürekli konum takibi başlat
      // Önce önceki watch'ı temizle
      if (locationWatchIdRef.current) {
        try { Geolocation.clearWatch(locationWatchIdRef.current); } catch {}
        locationWatchIdRef.current = null;
      }
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
        try { Geolocation.clearWatch(watchId); } catch {}
        if (locationWatchIdRef.current === watchId) {
          locationWatchIdRef.current = null;
        }
      };
    } catch (error) {
      // console.log('Konum alma hatası:', error);
    }
  }, []);

  // Gerçek konuma odaklanma fonksiyonu
  const focusOnUserLocation = useCallback(async () => {
    try {
      // Eğer konum izni yoksa iste
      if (!locationPermissionGranted) {
        const hasPermission = await checkLocationPermission();
        if (!hasPermission) {
          Alert.alert('İzin Gerekli', 'Konum izni verilmedi. Ayarlardan izin verebilirsiniz.');
          return;
        }
      }

      // Eğer kullanıcı konumu varsa ona odaklan
      if (userLocation) {
        if (mapRef.current && mapRef.current.setCamera) {
          mapRef.current.setCamera({
            centerCoordinate: userLocation,
            zoomLevel: 17,
            animationDuration: 1500,
          });
          
          // Tooltip'i göster
          setTimeout(() => {
            if (mapRef.current && mapRef.current.showLocationTooltip) {
              mapRef.current.showLocationTooltip();
            }
          }, 1600); // Animasyon bitince tooltip göster
        }
      } else {
        // Konum yoksa yeni konum al
        Geolocation.getCurrentPosition(
          (position) => {
            const { latitude, longitude } = position.coords;
            const newLocation = [longitude, latitude];

            // Kullanıcı konumunu state'e kaydet
            setUserLocation(newLocation);

            if (mapRef.current && mapRef.current.setCamera) {
              mapRef.current.setCamera({
                centerCoordinate: newLocation,
                zoomLevel: 17,
                animationDuration: 1500,
              });
              
              // Tooltip'i göster
              setTimeout(() => {
                if (mapRef.current && mapRef.current.showLocationTooltip) {
                  mapRef.current.showLocationTooltip();
                }
              }, 1600); // Animasyon bitince tooltip göster
            }
          },
          (error) => {
            // console.log('GPS hatası:', error);
            if (error.code === 1) {
              Alert.alert('Konum Kapalı', 'GPS konumu kapalı. Lütfen konum servislerini açın.');
            } else if (error.code === 2) {
              // Hızlı açılıp kapanan modal (Notlar’daki gibi)
              try { locationErrorAnim.setValue(0); } catch {}
              setLocationErrorMessage('Konumunuz bulunamadı. Lütfen daha sonra tekrar deneyin.');
              setShowLocationErrorModal(true);
              Animated.spring(locationErrorAnim, {
                toValue: 1,
                friction: 7,
                tension: 80,
                useNativeDriver: true,
              }).start();
              setTimeout(() => {
                Animated.timing(locationErrorAnim, {
                  toValue: 0,
                  duration: 200,
                  useNativeDriver: true,
                }).start(() => {
                  setShowLocationErrorModal(false);
                });
              }, 1200);
            } else {
              // Hızlı açılıp kapanan modal (Notlar sayfasındaki başarı modalı gibi)
              try { locationErrorAnim.setValue(0); } catch {}
              setLocationErrorMessage('Konum alınırken bir hata oluştu.');
              setShowLocationErrorModal(true);
              Animated.spring(locationErrorAnim, {
                toValue: 1,
                friction: 7,
                tension: 80,
                useNativeDriver: true,
              }).start();
              setTimeout(() => {
                Animated.timing(locationErrorAnim, {
                  toValue: 0,
                  duration: 200,
                  useNativeDriver: true,
                }).start(() => {
                  setShowLocationErrorModal(false);
                });
              }, 1200);
            }
          },
          {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 10000,
          },
        );
      }
    } catch (error) {
      // console.log('Konum odaklama hatası:', error);
      Alert.alert('Hata', 'Konuma odaklanırken bir hata oluştu.');
    }
  }, [locationPermissionGranted, checkLocationPermission, userLocation]);

  // Basit ready flag (UnifiedPoolMap fallback'ları içeride yönetir)
  useEffect(() => { setMapReady(true); }, []);

  // Kullanıcı harita ayarlarını yükle
  useEffect(() => {
    const loadMapSettings = async () => {
      try {
        const savedStyle = await AsyncStorage.getItem('userMapStyle');
        const saved3D = await AsyncStorage.getItem('userEnable3D');
        const savedSatellite = await AsyncStorage.getItem('userSatelliteView');
        
        if (savedStyle) setMapStyle(savedStyle);
        if (saved3D !== null) setEnable3D(saved3D === 'true');
        if (savedSatellite !== null) setIsSatelliteView(savedSatellite === 'true');
      } catch (error) {
        // Harita ayarları yüklenemezse default kullan
      }
    };
    
    loadMapSettings();
  }, []);

  // Harita stilini kaydet
  const handleStyleChange = useCallback(async (newStyle) => {
    setMapStyle(newStyle);
    try {
      await AsyncStorage.setItem('userMapStyle', newStyle);
    } catch (error) {
      // Stil kaydedilemezse devam et
    }
  }, []);

  // 3D ayarını kaydet
  const handle3DToggle = useCallback(async () => {
    const newValue = !enable3D;
    setEnable3D(newValue);
    try {
      await AsyncStorage.setItem('userEnable3D', String(newValue));
    } catch (error) {
      // 3D ayarı kaydedilemezse devam et
    }
  }, [enable3D]);

  // Uydu görünümünü toggle et
  const toggleSatelliteView = useCallback(async () => {
    const newValue = !isSatelliteView;
    setIsSatelliteView(newValue);
    
    if (newValue) {
      // Uydu görünümü açıldı - Satellite Streets kullan
      setMapStyle(MAPBOX_STYLES.SATELLITE_STREETS.url);
      try {
        await AsyncStorage.setItem('userSatelliteView', 'true');
        await AsyncStorage.setItem('userMapStyle', MAPBOX_STYLES.SATELLITE_STREETS.url);
      } catch (error) {
        // Uydu ayarı kaydedilemezse devam et
      }
    } else {
      // Uydu görünümü kapatıldı - Streets'e dön
      setMapStyle(MAPBOX_STYLES.STREETS.url);
      try {
        await AsyncStorage.setItem('userSatelliteView', 'false');
        await AsyncStorage.setItem('userMapStyle', MAPBOX_STYLES.STREETS.url);
      } catch (error) {
        // Stil ayarı kaydedilemezse devam et
      }
    }
  }, [isSatelliteView]);

  // Component mount olduğunda hemen konum al
  useEffect(() => {
    const initLocation = async () => {
      const hasPermission = await checkLocationPermission();
      
      if (hasPermission) {
        // Hemen mevcut konumu al
        Geolocation.getCurrentPosition(
          (position) => {
            const { latitude, longitude } = position.coords;
            const location = [longitude, latitude];
            setUserLocation(location);
          },
          (error) => {
            // Konum alınamazsa sessizce devam et
          },
          {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0,
          }
        );
        // Ardından sürekli takip başlat
        getUserLocation();
      }
    };
    
    initLocation();
  }, [checkLocationPermission, getUserLocation]);

  // 3D rehber modalını göster (sadece 2 kere)
  useEffect(() => {
    const check3DGuide = async () => {
      try {
        const countStr = await AsyncStorage.getItem('3dGuideShownCount');
        const count = countStr ? parseInt(countStr, 10) : 0;
        
        if (count < 2 && enable3D) {
          // 1 saniye bekle, sonra göster
          setTimeout(() => {
            setShow3DGuideModal(true);
          }, 1000);
        }
      } catch (error) {
        // 3D rehber kontrol hatası
      }
    };
    
    check3DGuide();
  }, [enable3D]);

  // 3D rehber modalını kapat
  const close3DGuideModal = async () => {
    try {
      const countStr = await AsyncStorage.getItem('3dGuideShownCount');
      const count = countStr ? parseInt(countStr, 10) : 0;
      await AsyncStorage.setItem('3dGuideShownCount', String(count + 1));
    } catch (error) {
      // 3D rehber kayıt hatası
    }
    setShow3DGuideModal(false);
  };

  // Harita yüklendiğinde konum izni kontrol et ve takip başlat
  useEffect(() => {
    if (mapLoaded) {
      checkLocationPermission().then((hasPermission) => {
        if (hasPermission) {
          getUserLocation();
        }
      });
    }
  }, [mapLoaded, checkLocationPermission, getUserLocation]);

  // Component unmount olduğunda konum takibini durdur
  useEffect(() => {
    const cancelToken = cancelTokenRef.current;
    return () => {
      // Cleanup - konum takibini durdur
      cancelToken.cancelled = true;
      if (locationWatchIdRef.current) {
        try { Geolocation.clearWatch(locationWatchIdRef.current); } catch {}
        locationWatchIdRef.current = null;
      }
      if (drawingToastTimeoutRef.current) {
        try { clearTimeout(drawingToastTimeoutRef.current); } catch {}
        drawingToastTimeoutRef.current = null;
      }
    };
  }, []);

  // Çizim varsa ve modal kapalıysa, modalı açık tut
  useEffect(() => {
    try {
      if (!isDrawingMode && drawnPolygon && Array.isArray(drawnPolygon) && drawnPolygon.length >= 3) {
        setIsDrawingMode(true);
      }
    } catch {}
  }, [drawnPolygon, isDrawingMode]);
  // Çizim özelliği fonksiyonları
  const toggleDrawingMode = useCallback(async () => {
    if (isDrawingMode) {
      // Çizim modunu kapat
      setIsDrawingMode(false);
      setDrawingPoints([]);
      lastDrawingPoint.current = null;
    } else {
      // Çizim modunu aç
      setIsDrawingMode(true);
      setDrawingPoints([]);
      setDrawnPolygon(null);
      setFilteredPortfolios([]);
      lastDrawingPoint.current = null;
      
      // Toast'ı sadece ilk 2 kez göster
      try {
        const countStr = await AsyncStorage.getItem('drawingToastShownCount');
        const count = countStr ? parseInt(countStr, 10) : 0;
        
        if (count < 2) {
          setShowDrawingToast(true);
          if (drawingToastTimeoutRef.current) { try { clearTimeout(drawingToastTimeoutRef.current); } catch {} }
          drawingToastTimeoutRef.current = setTimeout(() => {
            setShowDrawingToast(false);
            drawingToastTimeoutRef.current = null;
          }, 2500);
          
          // Sayacı artır
          await AsyncStorage.setItem('drawingToastShownCount', String(count + 1));
        }
      } catch (error) {
        // Hata durumunda toast'ı göster
        setShowDrawingToast(true);
        if (drawingToastTimeoutRef.current) { try { clearTimeout(drawingToastTimeoutRef.current); } catch {} }
        drawingToastTimeoutRef.current = setTimeout(() => {
          setShowDrawingToast(false);
          drawingToastTimeoutRef.current = null;
        }, 2500);
      }
    }
  }, [isDrawingMode]);

  const clearDrawing = useCallback(() => {
    setDrawingPoints([]);
    setDrawnPolygon(null);
    // Çizimi temizlerken filtre varsa onu koru; yoksa varsayılan ilk 100'e dön
    if (hasAppliedFilters) {
      applyFilters(filters);
    } else {
      setFilteredPortfolios(portfoliosWithCoordinates.slice(0, 100));
    }
    lastDrawingPoint.current = null;
    lastDrawingTime.current = 0;
  }, [hasAppliedFilters, applyFilters, filters, portfoliosWithCoordinates]);

  // Nokta-polygon çarpışması kontrolü (Ray casting algorithm)
  const isPointInPolygon = useCallback((point, polygon) => {
    const [x, y] = point;
    let inside = false;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [xi, yi] = polygon[i];
      const [xj, yj] = polygon[j];

      const intersect = ((yi > y) !== (yj > y)) &&
        (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      
      if (intersect) {
        inside = !inside;
      }
    }

    return inside;
  }, []);

  // Çizilen alan içindeki portföyleri filtrele
  const filterPortfoliosInPolygon = useCallback((polygon) => {
    if ((!polygon || polygon.length < 3)) {
      return [];
    }

    const filtered = portfoliosWithCoordinates.filter((portfolio) => {
      const lng = Number(portfolio.coordinates.longitude);
      const lat = Number(portfolio.coordinates.latitude);
      const point = [lng, lat];
      
      const result = isPointInPolygon(point, polygon);
      
      return result;
    });

    // Eğer filtre uygulanmışsa çizim ile filtrelenmiş seti kesiştir veya hızlı listingType filtresi uygula
    if (hasAppliedFilters) {
      if (filteredPortfolios && filteredPortfolios.length > 0) {
        const ids = new Set(filteredPortfolios.map((p) => p.id));
        return filtered.filter((p) => ids.has(p.id));
      }
      // Hızlı listingType kontrolü (Satılık/Kiralık) - filteredPortfolios henüz boşsa
      if (filters && filters.listingType) {
        return filtered.filter((p) => {
          const listingStatusStr = String(p.listingStatus || '').toLowerCase();
          const inferredFromStatus = listingStatusStr.includes('sat') ? 'Satılık' : (listingStatusStr.includes('kira') ? 'Kiralık' : '');
          const portfolioListingType = p.listingType || inferredFromStatus;
          return portfolioListingType === filters.listingType;
        });
      }
    }

    return filtered;
  }, [portfoliosWithCoordinates, isPointInPolygon, hasAppliedFilters, filteredPortfolios, filters]);

  // Bounds içinde mi kontrolü
  

  // Çizimi tamamlama fonksiyonu (kullanılmıyor ama tutuluyor)
  // const completeDrawing = useCallback(() => {
  //   if ((drawingPoints.length < 3)) {
  //     Alert.alert('Uyarı', 'En az 3 nokta çizmeniz gerekiyor!');
  //     return;
  //   }

  //   // Polygon'u kapatmak için ilk noktayı sonuna ekle
  //   const polygon = [...drawingPoints, drawingPoints[0]];
  //   setDrawnPolygon(polygon);

  //   const filtered = filterPortfoliosInPolygon(drawingPoints); // Filtreleme için orijinal noktaları kullan
  //   setFilteredPortfolios(filtered);

  //   // Çizim modunu kapat
  //   setIsDrawingMode(false);

  //   // Sessizce tamamla - mesaj verme
  //   // console.log(`Çizim tamamlandı: ${filtered.length} portföy bulundu`);
  // }, [drawingPoints, filterPortfoliosInPolygon]);

  // Harita dokunma olayı - artık kullanılmıyor (overlay sistemi kullanıyoruz)
  const handleMapPress = useCallback(async (event) => {
    // Bu fonksiyon artık kullanılmıyor - overlay sistemi çizim için kullanılıyor
    // console.log('Old map press handler called - this should not happen');
  }, []);

  // const getStatusBadgeStyle = (listingStatus) => {
  //   const isForSale = listingStatus?.toLowerCase().includes('satılık');
  //   return { backgroundColor: isForSale ? '#FF4444' : '#FFD700' };
  // }; // Kullanılmıyor

  const handlePortfolioPress = useCallback((portfolio) => {
    // Modalı HEMEN göster - veriler arka planda yüklenecek
    setPortfolioOwner(null);
    setSelectedPortfolio(portfolio);
    setShowPortfolioModal(true);
    setPinMatchCount(null);
    setPinMatchLoading(true);

    // Daha hızlı açılış animasyonu
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 90, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 90, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 90, useNativeDriver: true }),
    ]).start();

    // Sahip bilgisini arka planda getir
    (async () => {
      try {
        if (portfolio.userId) {
          const userDocRef = doc(db, 'users', portfolio.userId);
          const userDocSnap = await getDoc(userDocRef);
          if (userDocSnap.exists()) {
            setPortfolioOwner(userDocSnap.data());
          }
        }
      } catch {
        // no-op
      }
    })();
  }, [fadeAnim, scaleAnim, slideAnim]);

  const handleCloseModal = useCallback(() => {
    // Kapatma animasyonu
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 90,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, { toValue: 0.8, duration: 90, useNativeDriver: true }),
      Animated.timing(slideAnim, {
        toValue: 12,
        duration: 90,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setShowPortfolioModal(false);
      // Animasyon değerlerini sıfırla
      fadeAnim.setValue(0);
      scaleAnim.setValue(0.8);
      slideAnim.setValue(12);
    });
  }, [fadeAnim, scaleAnim, slideAnim]);

  // Eğer kullanıcı talepleri önbelleğe yeni yüklendiyse ve bir portföy seçiliyse, rozeti hesapla
  useEffect(() => {
    if (selectedPortfolio && myRequestsReady) {
      try {
        const isOwner = currentUserId && (selectedPortfolio?.userId === currentUserId || selectedPortfolio?.ownerId === currentUserId);
        const baseReqs = Array.isArray(myRequests) ? myRequests : [];
        const extraReqs = isOwner && poolRequestsReady ? (Array.isArray(poolRequests) ? poolRequests : []) : [];
        const allReqs = extraReqs.length > 0 ? baseReqs.concat(extraReqs) : baseReqs;
        const matches = getMatchingRequestsForPortfolio(selectedPortfolio, allReqs, { tolerance: 0.10 });
        setPinMatchCount(Array.isArray(matches) ? matches.length : 0);
      } catch {
        setPinMatchCount(0);
      } finally {
        setPinMatchLoading(false);
      }
    }
  }, [selectedPortfolio && selectedPortfolio.id, myRequestsReady, poolRequestsReady, currentUserId]);

  // Android donanım geri tuşu: önce modal kapansın; değilse kısa fade-out ile geri dön
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (showPortfolioModal) {
          handleCloseModal();
          return true; // event tüketildi
        }
        fadeOutAndNavigate(() => navigation.goBack());
        return true; // animasyonlu geri
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => sub.remove();
    }, [showPortfolioModal, handleCloseModal, navigation, fadeOutAndNavigate])
  );

  // const handleViewDetails = () => {
  //   setShowPortfolioModal(false);
  //   navigation.navigate('Ana Sayfa', {
  //     screen: 'PropertyDetail',
  //     params: { portfolio: selectedPortfolio },
  //   });
  // }; // Kullanılmıyor

  const renderPortfolioModal = useCallback(() =>
    showPortfolioModal && (
      <Animated.View
        style={[
          styles.overlayContainer,
          {
            opacity: fadeAnim,
            transform: [
              { scale: scaleAnim },
              { translateY: slideAnim },
            ],
          },
        ]}
      >
        <GlassmorphismView
          style={styles.propertyCard}
          borderRadius={24} // 16'dan 24'e yükseltildi
          config={portfolioModalCardConfig}
          blurEnabled={false}
        >
          <TouchableOpacity
            style={styles.touchableCard}
            activeOpacity={0.95}
            onPress={() => {
              if (selectedPortfolio) {
        // Counter'ı artır (force update için)
        const newCounter = viewedCounter + 1;
        setViewedCounter(newCounter);
        
        // Görüntülenen portföyler listesine ekle (YENİ Set objesi yarat)
        const newSet = new Set(viewedPortfolios);
        newSet.add(selectedPortfolio.id);
        setViewedPortfolios(newSet);
                // Detay sayfasına git (modal açık kalsın, geri gelince de açık devam etsin)
                navigation.navigate('PropertyDetail', {
                  portfolio: selectedPortfolio,
                  fromScreen: 'PortfolioMap',
                });
              }
            }}
          >
            {selectedPortfolio && (
              <>
                {/* Resim Bölümü */}
                <View style={styles.imageSection}>
                  {
                    (() => {
                      const coverImage = selectedPortfolio.cover && typeof selectedPortfolio.cover === 'string' && selectedPortfolio.cover.startsWith('http')
                        ? selectedPortfolio.cover
                        : (Array.isArray(selectedPortfolio.images) && selectedPortfolio.images.length > 0 && selectedPortfolio.images[0].startsWith('http')
                          ? selectedPortfolio.images[0]
                          : null);

                      if (coverImage) {
                        return <Image source={{ uri: coverImage }} style={styles.mainImage} />;
                      }
                      return (
                        <View style={[styles.mainImage, styles.imagePlaceholder]}>
                          <Text style={styles.placeholderIcon}>🏠</Text>
                        </View>
                      );
                    })()
                  }

                  {/* SATILIK Badge */}
                  {selectedPortfolio.listingStatus && (
                    <View style={styles.statusBadge}>
                      <Text style={styles.statusText}>
                        {selectedPortfolio.listingStatus?.toLowerCase().includes('satılık') ? 'SATILIK' : 'KIRALIK'}
                      </Text>
                    </View>
                  )}

                  {/* Oda Sayısı Badge */}
                  {selectedPortfolio.roomCount && (
                    <View style={styles.roomCountBadge}>
                      <Text style={styles.roomCountBadgeText}>{selectedPortfolio.roomCount}</Text>
                    </View>
                  )}

                  {/* Favori İkonu */}
                  <TouchableOpacity style={styles.favoriteButton}>
                    <Image
                      source={require('../assets/images/icons/Favorite_fill.png')}
                      style={styles.favoriteIcon}
                    />
                  </TouchableOpacity>

                  {/* Foto Sayısı */}
                  <View style={styles.photoCountBadge}>
                    <Image
                      source={require('../assets/images/icons/gallery.png')}
                      style={styles.photoCountIcon}
                    />
                    <Text style={styles.photoCountText}>{selectedPortfolio?.images?.length || 0}</Text>
                  </View>
                </View>

                {/* Başlık ve Adres */}
                <View style={styles.titleSection}>
                  <Text style={styles.propertyTitle} numberOfLines={2}>
                    {selectedPortfolio.title || 'Portföy'}
                  </Text>
                  <Text style={styles.locationText} numberOfLines={1}>
                    {formatShortAddress(selectedPortfolio.address)}
                  </Text>
                  {pinMatchLoading ? null : (typeof pinMatchCount === 'number' && pinMatchCount > 0) ? (
                    <TouchableOpacity
                      style={styles.matchBadge}
                      activeOpacity={0.9}
                      onPress={(e) => {
                        e.stopPropagation();
                        if (selectedPortfolio) {
                          navigation.navigate('PropertyDetail', {
                            portfolio: selectedPortfolio,
                            fromScreen: 'PortfolioMap',
                            openMatchedPanel: true,
                          });
                        }
                      }}
                    >
                      <Image source={require('../assets/images/icons/tasks.png')} style={styles.matchBadgeIcon} />
                      <Text style={styles.matchBadgeText}>{pinMatchCount} Eşleşen Talep</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>

                {/* Özellik İkonları - Yeni Versiyon */}
                <View style={styles.featuresSection}>
                  {/* Net m² */}
                  <View style={styles.featureItem}>
                    <Image source={require('../assets/images/icons/square.png')} style={styles.featureIcon} />
                    <Text style={styles.featureText}>{selectedPortfolio.netSquareMeters || '-'} m²</Text>
                  </View>
                  {/* Banyo Sayısı */}
                  <View style={styles.featureItem}>
                    <Image source={require('../assets/images/icons/bathroom.png')} style={styles.featureIcon} />
                    <Text style={styles.featureText}>{selectedPortfolio.bathroomCount || '-'}</Text>
                  </View>
                  {/* Bina Yaşı */}
                  <View style={styles.featureItem}>
                    <Image source={require('../assets/images/icons/binayas.png')} style={styles.featureIcon} />
                    <Text style={styles.featureText}>{selectedPortfolio.buildingAge != null ? `${selectedPortfolio.buildingAge} Yaş` : '-'}</Text>
                  </View>
                  {/* Kat Bilgisi */}
                  <View style={styles.featureItem}>
                    <Image source={require('../assets/images/icons/stairs.png')} style={styles.featureIcon} />
                    <Text style={styles.featureText}>
                      {`${selectedPortfolio.floor || '-'}/${selectedPortfolio.totalFloors || '-'}`}
                    </Text>
                  </View>
                   {/* Oda Sayısı */}
                  <View style={styles.featureItem}>
                    <Image source={require('../assets/images/icons/room.png')} style={styles.featureIcon} />
                    <Text style={styles.featureText}>{selectedPortfolio.roomCount || '-'}</Text>
                  </View>
                </View>

                {/* Alt Bölüm - Fiyat ve Danışman */}
                <GlassmorphismView
                  config={portfolioModalFooterConfig}
                  blurEnabled={false}
                  style={styles.footerGlassmorphism}
                >
                  <View style={styles.bottomSection}>
                    <View style={styles.priceContainer}>
                      <Image source={require('../assets/images/icons/fiyat.png')} style={styles.priceIcon} />
                      <Text style={styles.priceText}>
                        {selectedPortfolio.price ? formatPrice(selectedPortfolio.price) : 'Fiyat Belirtilmemiş'}
                      </Text>
                    </View>

                    <TouchableOpacity
                      style={styles.agentContainer}
                      activeOpacity={0.85}
                      onPress={() => {
                        try {
                          const targetUserId = selectedPortfolio?.userId || portfolioOwner?.id;
                          if (targetUserId) {
                            navigation.navigate('Profile', { userId: targetUserId });
                          }
                        } catch {}
                      }}
                    >
                      <View style={styles.agentInfo}>
                        <Text style={styles.agentName}>{portfolioOwner?.displayName || 'Danışman'}</Text>
                        <Text style={styles.agentTitle}>{portfolioOwner?.officeName || 'Ofis Bilgisi Yok'}</Text>
                      </View>
                      <View style={styles.agentAvatar}>
                        {portfolioOwner?.profilePicture ? (
                          <Image source={{ uri: portfolioOwner.profilePicture }} style={styles.agentAvatarImage} />
                        ) : (
                          <Text style={styles.agentAvatarText}>
                            {getInitials(portfolioOwner?.displayName)}
                          </Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  </View>
                </GlassmorphismView>

                {/* Kapat Butonu */}
                <TouchableOpacity 
                  style={styles.closeButton} 
                  onPress={(e) => {
                    e.stopPropagation(); // Card'ın onPress'ini tetikleme
                    handleCloseModal();
                  }}
                >
                  <Image
                    source={require('../assets/images/icons/deletephoto.png')}
                    style={styles.closeButtonIcon}
                  />
                </TouchableOpacity>
              </>
            )}
          </TouchableOpacity>
        </GlassmorphismView>
      </Animated.View>
    ), [showPortfolioModal, selectedPortfolio, fadeAnim, scaleAnim, slideAnim, formatPrice, handleCloseModal, navigation, viewedCounter, viewedPortfolios, portfolioModalCardConfig, portfolioModalFooterConfig, portfolioOwner]);

  const portfoliosWithCoordinates = useMemo(() => {
    const source = onlyMine && userProfile?.uid
      ? portfolios.filter(p => (p?.userId === userProfile.uid) || (p?.ownerId === userProfile.uid))
      : portfolios;
    const withCoords = source.filter((p) => {
      return p?.coordinates?.latitude && p?.coordinates?.longitude;
    });
    
    return withCoords;
  }, [portfolios, onlyMine, userProfile?.uid]);

  // Haritada gösterilecek portföyler - store tabanlı hesapla; boş görünmeyi engelle
  const displayedPortfolios = useMemo(() => {
    // Hem filtre hem polygon varsa: kesişim zaten filteredPortfolios'ta
    if (hasAppliedFilters || (drawnPolygon && Array.isArray(drawnPolygon))) {
      // filteredPortfolios boş ise güvenli geri dönüş: filtreyi sıfırdan hesapla
      if (filteredPortfolios && filteredPortfolios.length > 0) {
        return filteredPortfolios;
      }
      // Fallback: filtre uygula
      const base = portfoliosWithCoordinates.filter(p => matchesFilters(p, filters));
      if (drawnPolygon && Array.isArray(drawnPolygon) && drawnPolygon.length >= 3) {
        return filterByPolygon(base, drawnPolygon);
      }
      return base;
    }
    // Hiçbir filtre yoksa ilk 100 portföyü göster
    return portfoliosWithCoordinates.slice(0, 100);
  }, [hasAppliedFilters, filteredPortfolios, drawnPolygon, portfoliosWithCoordinates, filters]);

  // Eşleşen talep rozeti için: pin düzeyinde hasMatch hesapla (kullanıcının kendi talepleri)
  const displayedPortfoliosWithMatch = useMemo(() => {
    if (!myRequestsReady) return displayedPortfolios;
    try {
      const myReqs = Array.isArray(myRequests) ? myRequests : [];
      return displayedPortfolios.map((p) => {
        try {
          const isOwner = currentUserId && (p?.userId === currentUserId || p?.ownerId === currentUserId);
          const poolReqs = isOwner && poolRequestsReady ? (Array.isArray(poolRequests) ? poolRequests : []) : [];
          const allReqs = poolReqs.length > 0 ? myReqs.concat(poolReqs) : myReqs;
          const matches = getMatchingRequestsForPortfolio(p, allReqs, { tolerance: 0.10 });
          return { ...p, hasMatch: Array.isArray(matches) && matches.length > 0 };
        } catch {
          return { ...p, hasMatch: false };
        }
      });
    } catch {
      return displayedPortfolios;
    }
  }, [displayedPortfolios, myRequests, myRequestsReady, poolRequests, poolRequestsReady, currentUserId]);

  return (
    <Animated.View style={[styles.container, {
      opacity: entryFade,
      transform: [
        { translateY: entryTranslate },
        { scale: entryScale },
      ],
    }]}>
      {/* Exit overlay to crossfade to app background and avoid any solid-color flash */}
      <Animated.View pointerEvents="none" style={[styles.exitOverlay, { opacity: exitOverlayOpacity }]} />
      {/* Header - Şeffaf ve minimal */}
      <View style={[styles.header, { paddingTop: Math.max((insets?.top || 0) + 6, 16) }]} pointerEvents="box-none">
        {/* Sol üst - Geri butonu */}
        <TouchableOpacity
          style={styles.headerButtonBack}
          onPress={() => {
            if (showPortfolioModal) {
              handleCloseModal();
              return;
            }
            if (route.params?.fromScreen === 'Home') {
              fadeOutAndNavigate(() => navigation.goBack());
            } else if (onlyMine) {
              fadeOutAndNavigate(() => navigation.navigate('MyPortfolios'));
            } else {
              fadeOutAndNavigate(() => navigation.navigate('PortfolioList'));
            }
          }}
          accessibilityRole="button"
          accessibilityLabel="Geri"
        >
          <Image
            source={require('../assets/images/icons/return.png')}
            style={styles.headerButtonIconBack}
          />
        </TouchableOpacity>

        {/* Sağ üst - Kontrol butonları (Dikey) */}
        <View style={styles.headerButtons} pointerEvents="box-none">
          {/* İlk satır - Filtre ve Mevcut Konum yan yana */}
          <View style={styles.topButtonRow} pointerEvents="box-none">
            {/* 0. Filtrele */}
          <TouchableOpacity
            style={[
              styles.filterButton,
              hasAppliedFilters && styles.filterButtonActive
            ]}
            onPress={openFilterModal}
            accessibilityRole="button"
            accessibilityLabel="Filtrele"
          >
              <Image
                source={require('../assets/images/icons/filtrele.png')}
                style={styles.filterButtonIcon}
              />
              <Text style={styles.filterButtonText}>Filtrele</Text>
            </TouchableOpacity>

            {/* 1. Liste Görünümü */}
            <TouchableOpacity
              style={styles.filterButton}
              onPress={() => {
                if (onlyMine) {
                  navigation.navigate('MyPortfolios');
                } else {
                  navigation.navigate('PortfolioList');
                }
              }}
            accessibilityRole="button"
            accessibilityLabel="Liste"
            >
              <Image
                source={require('../assets/images/icons/vieverlist.png')}
                style={styles.filterButtonIcon}
              />
              <Text style={styles.filterButtonText}>Liste</Text>
            </TouchableOpacity>
          </View>

          {/* Alt butonlar - Mevcut konumun hizasında */}
          <View style={styles.bottomButtonsContainer} pointerEvents="box-none">
            {/* 1. Mevcut Konuma Git (aşağı taşındı) */}
            <TouchableOpacity
              style={styles.fitButton}
            onPress={focusOnUserLocation}
            accessibilityRole="button"
            accessibilityLabel="Mevcut Konum"
            >
              <Image
                source={require('../assets/images/icons/pmpin.png')}
                style={styles.fitButtonIcon}
              />
            </TouchableOpacity>

            {/* 2. Çizim Modu */}
            <TouchableOpacity
              style={[styles.drawingButton, isDrawingMode && styles.drawingButtonActive]}
              onPress={() => { if (!isDrawingMode) { toggleDrawingMode(); } }}
              activeOpacity={0.9}
            accessibilityRole="button"
            accessibilityLabel="Çizim Modu"
            >
              <Image
                source={require('../assets/images/icons/Edit_fill.png')}
                style={[styles.drawingButtonIcon, isDrawingMode && styles.drawingButtonIconActive]}
              />
            </TouchableOpacity>

          {/* 3. Harita Stilleri */}
          <MapStyleSelector
            currentStyle={mapStyle}
            onStyleChange={handleStyleChange}
            theme={theme}
          />

          {/* 4. Uydu Görünümü Toggle */}
          <TouchableOpacity
            style={[styles.satelliteButton, isSatelliteView && styles.satelliteButtonActive]}
            onPress={toggleSatelliteView}
            accessibilityRole="button"
            accessibilityLabel="Uydu Görünümü"
          >
            <Image
              source={require('../assets/images/icons/satellite.png')}
              style={[styles.satelliteButtonIcon, isSatelliteView && styles.satelliteButtonIconActive]}
            />
          </TouchableOpacity>

          {/* 5. 3D Toggle */}
          <TouchableOpacity
            style={[styles.button3D, enable3D && styles.button3DActive]}
            onPress={handle3DToggle}
            accessibilityRole="button"
            accessibilityLabel="3D Görünüm"
          >
            <Text style={[styles.button3DText, enable3D && styles.button3DTextActive]}>
              {enable3D ? '3D' : '2D'}
            </Text>
          </TouchableOpacity>
          
          </View>
        </View>
      </View>

      {/* Çizim modu bilgilendirme overlay */}
      {isDrawingMode && (
        <View style={styles.drawingModeOverlay} pointerEvents="box-none">
          <View style={styles.drawingModeTexts} pointerEvents="none">
            <Text style={styles.drawingModeTitle}>Çizim Modu Aktif</Text>
            <Text style={styles.drawingModeSub}>Çizimi bitirmek için parmağınızı kaldırın</Text>
          </View>
          <View style={styles.drawingModeActions}>
            <TouchableOpacity
              onPress={clearDrawing}
              style={styles.drawingModeClearButton}
              activeOpacity={0.9}
              accessibilityRole="button"
              accessibilityLabel="Çizimi Temizle"
            >
              <Text style={styles.drawingModeClearText}>Çizimi Temizle</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                clearDrawing();
                setIsDrawingMode(false);
              }}
              style={styles.drawingModeCloseButton}
              activeOpacity={0.9}
              accessibilityRole="button"
              accessibilityLabel="Çizim Modunu Kapat"
            >
              <Text style={styles.drawingModeCloseText}>Kapat</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Harita */}
      <Animated.View style={[
        styles.mapContainer,
        Platform.OS === 'android' ? { transform: [{ scale: mapScale }] } : null
      ]}>
        {!mapLoaded && showMapSpinner && (
          <View style={styles.mapLoadingContainer} pointerEvents="none">
            <ActivityIndicator size="small" color={theme.colors.primary} />
          </View>
        )}

        {!mapReady && mapLoaded && (
          <View style={styles.mapWarningContainer}>
            <Text style={styles.mapWarningIcon}>⚠️</Text>
            <Text style={styles.mapWarningText}>
              Harita kütüphanesi tam yüklenmedi. Bazı özellikler çalışmayabilir.
            </Text>
          </View>
        )}

        {/* Çizim modu için overlay */}
        {isDrawingMode && !drawnPolygon && (
          <View
            style={styles.drawingOverlay}
            pointerEvents="auto"
            onStartShouldSetResponder={() => true}
            onMoveShouldSetResponder={() => true}
            onResponderGrant={(e) => {
              const touch = e.nativeEvent.touches && e.nativeEvent.touches[0];
              if (!touch) return;
              const { locationX, locationY } = touch;
              lastScreenPointRef.current = [locationX, locationY];
              if (mapRef.current && mapRef.current.getCoordinateFromView) {
                mapRef.current.getCoordinateFromView([locationX, locationY])
                  .then((coordinates) => {
                    const [longitude, latitude] = coordinates;
                    setDrawingPoints((prev) => [...prev, [longitude, latitude]]);
                    lastDrawingPoint.current = [longitude, latitude];
                    lastDrawingTime.current = Date.now();
                  })
                  .catch(() => {});
              }
            }}
            onResponderMove={(e) => {
              const currentTime = Date.now();
              if (currentTime - lastDrawingTime.current < 10) return;
              const touch = e.nativeEvent.touches && e.nativeEvent.touches[0];
              if (!touch) return;
              const { locationX, locationY } = touch;
              if (lastScreenPointRef.current) {
                const dx = locationX - lastScreenPointRef.current[0];
                const dy = locationY - lastScreenPointRef.current[1];
                const pixelDist = Math.sqrt(dx * dx + dy * dy);
                if (pixelDist < 4) return;
              }
              if (mapRef.current && mapRef.current.getCoordinateFromView) {
                mapRef.current.getCoordinateFromView([locationX, locationY])
                  .then((coordinates) => {
                    const [longitude, latitude] = coordinates;
                    setDrawingPoints((prev) => [...prev, [longitude, latitude]]);
                    lastDrawingPoint.current = [longitude, latitude];
                    lastScreenPointRef.current = [locationX, locationY];
                    lastDrawingTime.current = currentTime;
                  })
                  .catch(() => {});
              }
            }}
            onResponderRelease={() => {
              if (drawingPoints.length >= 3) {
                const polygon = [...drawingPoints, drawingPoints[0]];
                setDrawnPolygon(polygon);
                const filtered = filterPortfoliosInPolygon(drawingPoints);
                setFilteredPortfolios(filtered);
                setDrawingPoints([]);
              } else {
                setDrawingPoints([]);
              }
              lastDrawingPoint.current = null;
              lastScreenPointRef.current = null;
            }}
          />
        )}

        <View style={styles.map}>
          <UnifiedPoolMap
            ref={mapRef}
            center={(initialCamera && initialCamera.center) || lastCameraStateRef.current?.center || defaultCenter}
            zoom={(initialCamera && initialCamera.zoom) || lastCameraStateRef.current?.zoom || defaultZoom}
            pins={displayedPortfoliosWithMatch}
            onPinPress={handlePortfolioPress}
            onMapPress={handleCloseModal}
            viewedPortfolios={viewedPortfolios}
            viewedCounter={viewedCounter}
            currentUserId={currentUserId}
            enableDraw={false}
            drawnPolygon={drawnPolygon}
            drawingPoints={isDrawingMode ? drawingPoints : []}
            cancelToken={cancelTokenRef.current}
            onMapLoaded={() => {
              if (!mapLoaded) {
                setMapLoaded(true);
              }
            }}
            styleURL={mapStyle}
            enable3D={enable3D}
            pitch={(initialCamera && typeof initialCamera.pitch === 'number' ? initialCamera.pitch : undefined) || lastCameraStateRef.current?.pitch || (enable3D ? 35 : 0)}
            heading={(initialCamera && typeof initialCamera.heading === 'number' ? initialCamera.heading : undefined) || lastCameraStateRef.current?.heading || 0}
            userLocation={userLocation}
            onCameraChanged={(props) => {
              try {
                if (props && typeof props.zoomLevel === 'number' && Array.isArray(props.centerCoordinate)) {
                  lastCameraStateRef.current = {
                    center: props.centerCoordinate,
                    zoom: props.zoomLevel,
                    pitch: typeof props.pitch === 'number' ? props.pitch : 0,
                    heading: typeof props.heading === 'number' ? props.heading : 0,
                  };
                  // Debounced persist
                  if (cameraSaveTimerRef.current) clearTimeout(cameraSaveTimerRef.current);
                  cameraSaveTimerRef.current = setTimeout(async () => {
                    try { await AsyncStorage.setItem(CAMERA_CACHE_KEY, JSON.stringify(lastCameraStateRef.current)); } catch {}
                  }, 300);
                }
              } catch {}
            }}
            initialInstant={true}
          />
        </View>
      </Animated.View>

      {/* Portföy Modal */}
      {renderPortfolioModal()}

      {/* Gelişmiş Filtreleme Modal - Yeni ortak component */}
      <AdvancedFiltersModal
        visible={showFilterModal}
        onClose={closeFilterModal}
        onApply={applyFilters}
        onClear={clearFilters}
        initialFilters={filters}
        portfolios={portfoliosWithCoordinates}
      />

      {/* 3D Harita Kullanım Rehberi Modal */}
      <Modal
        visible={show3DGuideModal}
        transparent={true}
        animationType="fade"
        onRequestClose={close3DGuideModal}
      >
        <TouchableOpacity
          style={styles.guideModalOverlay}
          activeOpacity={1}
          onPress={close3DGuideModal}
        >
          {/* Açıklamalar */}
          <View
            style={styles.guideModalBody}
            onStartShouldSetResponder={() => true}
            onResponderRelease={(e) => e.stopPropagation()}
          >
            {/* 1. Hareket */}
            <View style={styles.guideItem}>
              <View style={styles.guideIconContainer}>
                <Text style={styles.guideIcon}>👆👆</Text>
              </View>
              <View style={styles.guideTextContainer}>
                <Text style={styles.guideTitle}>Perspektif Değiştir</Text>
                <Text style={styles.guideDescription}>
                  İki parmakla yukarı/aşağı kaydırarak haritayı eğin
                </Text>
              </View>
            </View>

            {/* 2. Hareket */}
            <View style={styles.guideItem}>
              <View style={styles.guideIconContainer}>
                <Text style={styles.guideIcon}>🔄</Text>
              </View>
              <View style={styles.guideTextContainer}>
                <Text style={styles.guideTitle}>Haritayı Döndür</Text>
                <Text style={styles.guideDescription}>
                  İki parmakla döndürerek farklı açılardan görüntüleyin
                </Text>
              </View>
            </View>

            {/* 3. Hareket */}
            <View style={styles.guideItem}>
              <View style={styles.guideIconContainer}>
                <Text style={styles.guideIcon}>🤏</Text>
              </View>
              <View style={styles.guideTextContainer}>
                <Text style={styles.guideTitle}>Yakınlaştır/Uzaklaştır</Text>
                <Text style={styles.guideDescription}>
                  Pinch hareketleriyle haritayı yakınlaştırın
                </Text>
              </View>
            </View>
          </View>

          {/* Devam Butonu */}
          <TouchableOpacity
            style={styles.guideModalButton}
            onPress={close3DGuideModal}
            activeOpacity={0.8}
          >
            <Text style={styles.guideModalButtonText}>Anladım, Devam Et</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Konum Hata Modalı - hızlı aç/kapa, butonsuz */}
      <Modal
        visible={showLocationErrorModal}
        transparent={true}
        animationType="none"
        onRequestClose={() => setShowLocationErrorModal(false)}
      >
        <View style={styles.quickModalOverlay}>
          <Animated.View
            style={{
              opacity: locationErrorAnim,
              transform: [{ scale: locationErrorAnim }],
            }}
          >
            <GlassmorphismView
              style={styles.quickModalContainer}
              borderRadius={20}
              config={portfolioModalCardConfig}
              blurEnabled={false}
            >
              <Text style={styles.quickModalText}>{locationErrorMessage || 'Konum alınırken bir hata oluştu.'}</Text>
            </GlassmorphismView>
          </Animated.View>
        </View>
      </Modal>

      {/* Çizim Modu Toast */}
      {showDrawingToast && (
        <Animated.View style={styles.drawingToast} pointerEvents="none">
          <Text style={styles.drawingToastIcon}>✏️</Text>
          <View style={styles.drawingToastTextContainer}>
            <Text style={styles.drawingToastTitle}>Çizim Modu Aktif</Text>
            <Text style={styles.drawingToastText}>
              Harita üzerinde bir alan çizin
            </Text>
          </View>
        </Animated.View>
      )}
    </Animated.View>
  );
};


const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  exitOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.colors.background,
    zIndex: 2000,
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: theme.spacing.lg,
    paddingTop: 30,
    paddingBottom: theme.spacing.md,
    backgroundColor: 'transparent',
    zIndex: 1000,
    elevation: 1000,
  },
  headerButtonBack: {
    backgroundColor: theme.colors.primary,
    width: 40,
    height: 40,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    ...theme.shadows.medium,
  },
  headerButtonIconBack: {
    width: 20,
    height: 20,
    resizeMode: 'contain',
    tintColor: theme.colors.white,
  },
  filterButton: {
    backgroundColor: theme.colors.primary,
    height: 44,
    borderRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 6,
    ...theme.shadows.small,
  },
  filterButtonActive: {
    backgroundColor: '#2196F3', // Mavi renk - filtreleme aktif olduğunda
  },
  filterButtonIcon: {
    width: 18,
    height: 18,
    resizeMode: 'contain',
    tintColor: theme.colors.white,
  },
  filterButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.white,
  },
  headerButtons: { flexDirection: 'column', gap: theme.spacing.sm },
  topButtonRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    alignItems: 'flex-start',
  },
  bottomButtonsContainer: {
    flexDirection: 'column',
    gap: theme.spacing.sm,
    marginLeft: 'auto', // Sağa hizala (mevcut konum butonunun altına)
  },
  satelliteButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#142331',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
    ...theme.shadows.small,
  },
  satelliteButtonActive: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accent + '20',
  },
  satelliteButtonIcon: {
    width: 21,
    height: 21,
    resizeMode: 'contain',
    tintColor: theme.colors.primary,
  },
  satelliteButtonIconActive: {
    tintColor: theme.colors.accent,
  },
  drawingButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#142331',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
    ...theme.shadows.small,
  },
  drawingButtonActive: {
    backgroundColor: '#2196F3',
    borderColor: '#2196F3',
  },
  drawingButtonIcon: {
    width: 22,
    height: 22,
    tintColor: theme.colors.primary,
  },
  drawingButtonIconActive: {
    tintColor: theme.colors.white,
  },
  clearButton: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: theme.colors.error,
    justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: theme.colors.error, ...theme.shadows.small,
  },
  clearButtonText: { fontSize: theme.fontSizes.lg, color: theme.colors.white },
  fitButton: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: theme.colors.primary,
    justifyContent: 'center', alignItems: 'center', borderWidth: 0,
    ...theme.shadows.small,
  },
  fitButtonIcon: {
    width: 22,
    height: 22,
    resizeMode: 'contain',
  },
  button3D: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#ddd',
    ...theme.shadows.small,
  },
  button3DActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  button3DText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  button3DTextActive: {
    color: theme.colors.white,
  },
  locationPinIcon: {
    width: 14,
    height: 14,
    tintColor: 'white',
    marginRight: 6,
  },
  drawingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1100,
    elevation: 1100, // UI overlay'ın (zIndex 1200) altında kalmalı
    backgroundColor: 'transparent',
  },
  mapContainer: { flex: 1, position: 'relative' },
  map: { flex: 1 },
  mapLoadingContainer: {
    position: 'absolute', top: 10, right: 10,
    backgroundColor: theme.colors.surface,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    justifyContent: 'center', alignItems: 'center', zIndex: 1000,
  },
  mapLoadingText: { color: theme.colors.text, fontSize: theme.fontSizes.sm, marginTop: 4, fontWeight: theme.fontWeights.medium },
  
  // Map warning styles
  mapWarningContainer: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    backgroundColor: 'rgba(255, 193, 7, 0.9)',
    padding: theme.spacing.sm,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 1001,
  },
  mapWarningIcon: {
    fontSize: 16,
    marginRight: theme.spacing.xs,
  },
  mapWarningText: {
    flex: 1,
    fontSize: theme.fontSizes.sm,
    color: '#333',
    fontWeight: theme.fontWeights.medium,
  },
  overlayContainer: {
    position: 'absolute',
    bottom: 100, // Navigation bar'ın altına girmemesi için artırıldı
    left: 20,
    right: 20,
    zIndex: 1000,
  },

  // Ana property kartı - görseldeki gibi
  propertyCard: {
    // backgroundColor: theme.colors.white, // Kaldırıldı
    borderRadius: 24, // 16'dan 24'e yükseltildi
    overflow: 'hidden',
    elevation: 0,
    shadowColor: 'transparent',
  },
  touchableCard: {
    // Bu stil, TouchableOpacity'nin tüm alanı kaplamasını sağlar
  },

  // Resim bölümü
  imageSection: {
    position: 'relative',
    height: 200,
    backgroundColor: 'transparent', // Arka plan şeffaf yapıldı
    paddingTop: theme.spacing.sm, // Üstten boşluk korunuyor
  },
  mainImage: {
    width: '95%', // Yanlardan küçültmek için %100'den %95'e düşürüldü
    height: '100%',
    resizeMode: 'cover',
    borderRadius: 16, // Tüm köşeler yuvarlatıldı
    alignSelf: 'center', // Ortalamak için eklendi
  },
  imagePlaceholder: {
    backgroundColor: theme.colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderIcon: { fontSize: 40, color: theme.colors.primary },

  // SATILIK Badge - üst sol
  statusBadge: {
    position: 'absolute',
    top: 20,
    left: 20,
    backgroundColor: 'crimson',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 5,
    ...theme.shadows.small,
  },
  statusText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: theme.colors.white,
    textTransform: 'uppercase',
  },

  // Oda Sayısı Badge
  roomCountBadge: {
    position: 'absolute',
    top: 56, // statusBadge'den biraz uzaklaştırıldı
    left: 20,
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 5,
    ...theme.shadows.small,
    zIndex: 5, // Diğer elementlerin üzerinde kalması için
  },
  roomCountBadgeText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: theme.colors.white,
  },

  // Favori butonu - çarpı işaretinin altında
  favoriteButton: {
    position: 'absolute',
    top: 60, // 20 (close button top) + 32 (close button height) + 4 (spacing)
    right: 20,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 5, // Çarpı işaretinin altında kalması için
    ...theme.shadows.small,
  },
  favoriteIcon: {
    width: 20,
    height: 20,
    tintColor: 'crimson',
  },

  // Foto sayısı - alt sol
  photoCountBadge: {
    position: 'absolute',
    bottom: 12,
    left: 20,
    backgroundColor: 'white',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#eee',
  },
  photoCountIcon: {
    width: 14,
    height: 14,
    tintColor: 'crimson',
    marginRight: 4,
  },
  photoCountText: {
    fontSize: 12,
    color: '#142331',
    fontWeight: '500',
  },

  // Başlık ve konum bölümü
  titleSection: {
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 80, // Başlık ve adres için yeterli alan
  },
  propertyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 6, // Adres ile arasına boşluk
  },
  matchBadge: {
    marginTop: 6,
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.error,
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  matchBadgeIcon: {
    width: 12,
    height: 12,
    tintColor: theme.colors.white,
    marginRight: 6,
  },
  matchBadgeText: {
    color: theme.colors.white,
    fontSize: 12,
    fontWeight: '700',
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4, // Başlık ile arasında küçük bir boşluk
  },
  locationText: {
    fontSize: 14,
    color: theme.colors.white,
    fontWeight: '500',
  },

  // Özellik ikonları bölümü
  featuresSection: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 12, // Yatay padding azaltıldı
    paddingTop: 4, // Üst boşluk azaltıldı
    paddingBottom: 16, // Alt boşluk korundu
  },
  featureItem: {
    alignItems: 'center',
    flex: 1, // Alanı eşit dağıt
  },
  featureIcon: { 
    width: 24, 
    height: 24, 
    marginBottom: 6,
    tintColor: 'crimson', // İkon rengi
  },
  featureText: {
    fontSize: 13,
    color: theme.colors.text,
    fontWeight: '500',
  },

  // Alt bölüm - fiyat ve danışman
  bottomSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    // backgroundColor: '#F8F9FA', // Kaldırıldı
  },
  priceContainer: {
    flex: 1,
    paddingLeft: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  priceIcon: {
    width: 22,
    height: 22,
    tintColor: 'crimson',
    marginRight: 8,
  },
  priceText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.white, // Renk değiştirildi
  },
  agentContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)', // Arka plan değiştirildi
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    flex: 1,
    marginLeft: 16,
  },
  agentInfo: {
    flex: 1,
  },
  agentName: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.white, // Renk değiştirildi
  },
  agentTitle: {
    fontSize: 12,
    color: 'crimson', 
    fontWeight: '600',
  },
  agentAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.primary, // Renk değiştirildi
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  agentAvatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
  },
  agentAvatarText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: theme.colors.white,
  },

  footerGlassmorphism: {
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },

  // Kapat butonu
  closeButton: {
    position: 'absolute',
    top: 20,
    right: 20,
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'crimson',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10, // En üstte kalması için
    ...theme.shadows.medium,
  },
  closeButtonIcon: {
    width: 20,
    height: 20,
    tintColor: 'white',
  },
  rasterLayer: { rasterOpacity: 1.0 },
  circleLayer: { circleRadius: 20, circleStrokeWidth: 3, circleStrokeColor: '#FFFFFF', circleOpacity: 0.9 },
  symbolLayer: {
    textSize: 20, // Daha büyük ve belirgin yazı
    textColor: '#FFFFFF',
    textHaloColor: '#000000',
    textHaloWidth: 0, // Kontür kaldırıldı
    // Font ayarı kaldırıldı - Mapbox varsayılan font kullanacak
  },
  drawnPolygonFill: {
    fillColor: theme.colors.error + '4D', // Kırmızı %30 opacity
    fillOpacity: 0.3,
  },
  drawnPolygonLine: {
    lineColor: theme.colors.error,
    lineWidth: 3,
    lineOpacity: 0.8,
  },
  userLocationCircle: {
    circleRadius: 8,
    circleColor: theme.colors.info,
    circleStrokeWidth: 3,
    circleStrokeColor: theme.colors.white,
  },
  drawingLine: {
    lineColor: theme.colors.error,
    lineWidth: 6,
    lineOpacity: 0.9,
    lineCap: 'round',
    lineJoin: 'round',
  },
  drawingStartPoint: {
    circleRadius: 8,
    circleColor: theme.colors.error,
    circleStrokeWidth: 2,
    circleStrokeColor: theme.colors.white,
  },
  drawingModeOverlay: {
    position: 'absolute',
    top: 120,
    left: 70,
    right: 70,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: 'center',
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: theme.colors.primary,
    zIndex: 1200,
    ...theme.shadows.medium,
  },
  drawingModeTexts: {
    flex: 1,
  },
  drawingModeTitle: {
    color: theme.colors.primary,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
  },
  drawingModeSub: {
    color: theme.colors.text,
    opacity: 0.9,
    marginTop: 2,
    fontSize: theme.fontSizes.xs,
  },
  drawingModeActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  drawingModeClearButton: {
    backgroundColor: theme.colors.error,
    borderRadius: theme.borderRadius.md,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginLeft: theme.spacing.sm,
  },
  drawingModeClearText: {
    color: theme.colors.white,
    fontWeight: theme.fontWeights.bold,
    fontSize: theme.fontSizes.xs,
  },
  drawingModeCloseButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  drawingModeCloseText: {
    color: theme.colors.white,
    fontWeight: theme.fontWeights.bold,
    fontSize: theme.fontSizes.xs,
  },
  
  // Drawing Toast Styles
  drawingToast: {
    position: 'absolute',
    top: 100,
    left: 20,
    right: 20,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    ...theme.shadows.large,
    zIndex: 2000,
  },
  drawingToastIcon: {
    fontSize: 32,
    marginRight: theme.spacing.md,
  },
  drawingToastTextContainer: {
    flex: 1,
  },
  drawingToastTitle: {
    fontSize: theme.fontSizes.lg,
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.white,
    marginBottom: 4,
  },
  drawingToastText: {
    fontSize: theme.fontSizes.md,
    color: theme.colors.white,
    opacity: 0.9,
  },

  // 3D Rehber Modal Stilleri
  guideModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(227, 30, 36, 0.75)', // Krimson şeffaf
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: theme.spacing.xl,
  },
  guideModalHeader: {
    marginBottom: theme.spacing.xl,
    alignItems: 'center',
    width: '100%',
  },
  guideModalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  guideModalBody: {
    marginBottom: 0,
    width: '100%',
    marginTop: 60,
  },
  guideItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 12,
    padding: 18,
    minHeight: 90,
    width: '100%',
  },
  guideIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(227, 30, 36, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  guideIcon: {
    fontSize: 28,
  },
  guideTextContainer: {
    flex: 1,
    paddingRight: 8,
  },
  guideTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#E31E24',
    marginBottom: 6,
  },
  guideDescription: {
    fontSize: 14,
    color: '#E31E24',
    lineHeight: 20,
  },
  guideModalButton: {
    backgroundColor: theme.colors.white,
    borderRadius: 12,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    alignItems: 'center',
    ...theme.shadows.medium,
  },
  guideModalButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.primary, // Krimson
  },

  // Hızlı hata modalı
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
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 22,
  },

  // Filtreleme Modal Stilleri
  filterModalWrapper: {
    flex: 1,
  },
  filterModalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0, // Tam ekranı kaplar
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  filterModalOverlay: {
    position: 'absolute',
    bottom: 70, // Navigasyon barının üstünden başlar
    left: 16,
    right: 16,
    top: 100, // Üstten biraz boşluk
    zIndex: 102, // Modal içeriği backdrop'un üstünde ama navigasyon barından düşük
  },
  filterModalContent: {
    // backgroundColor inline style olarak eklendi (dark/light mode desteği için)
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomLeftRadius: 20, // Alt köşeler yuvarlatıldı
    borderBottomRightRadius: 20,
    height: '100%', // Parent container'ın tam yüksekliği
    paddingTop: 20,
    position: 'relative', // Footer için absolute positioning
    overflow: 'hidden', // Border radius'u korumak için
  },
  filterModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 15,
  },
  filterModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  filterModalClose: {
    fontSize: 28,
    color: '#999',
    paddingHorizontal: 10,
  },
  filterModalBody: {
    flex: 1,
    paddingHorizontal: 20,
    paddingVertical: 15,
    paddingBottom: 10, // contentContainerStyle kullanılıyor
  },
  detailedFiltersContainer: {
    overflow: 'hidden', // Animasyon için önemli
  },
  filterSection: {
    marginBottom: 20,
    overflow: 'visible', // Animasyon için overflow
  },
  filterLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start', // Sola hizala
    marginBottom: 12,
  },
  selectedCountBadge: {
    backgroundColor: theme.colors.error, // Krimson
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 8,
  },
  selectedCountText: {
    color: '#FFFFFF',
    fontSize: theme.fontSizes.xs,
    fontWeight: theme.fontWeights.bold,
  },
  filterLabelIcon: {
    width: 20,
    height: 20,
    tintColor: '#DC143C',
    resizeMode: 'contain',
    marginRight: 8,
  },
  filterSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  },
  filterLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  },
  crimsonDivider: {
    height: 1,
    backgroundColor: '#DC143C',
    marginVertical: theme.spacing.md,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  filterInput: {
    flex: 1,
    borderWidth: 0,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    fontSize: theme.fontSizes.md,
    backgroundColor: '#142331',
    color: theme.colors.text,
    height: 42,
  },
  filterRangeSeparator: {
    fontSize: 16,
    color: '#666',
    fontWeight: '600',
  },
  filterOptionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  filterOptionEqual: {
    flex: 1, // Eşit genişlik için
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    borderWidth: 0,
    backgroundColor: '#142331',
    alignItems: 'center',
    justifyContent: 'center',
    height: 42,
  },
  filterOption: {
    flex: 1,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.borderRadius.md,
    borderWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#142331',
    height: 42,
  },
  filterOptionActive: {
    backgroundColor: theme.colors.error,
    borderColor: theme.colors.error,
  },
  filterOptionText: {
    color: theme.colors.text,
    fontSize: theme.fontSizes.xl,
    fontWeight: theme.fontWeights.semibold,
  },
  filterOptionTextActive: {
    color: theme.colors.white,
  },
  filterOptionsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center', // Ortala
    alignItems: 'center',
  },
  filterChip: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xl,
    borderRadius: theme.borderRadius.md,
    borderWidth: 0,
    backgroundColor: '#142331',
    alignItems: 'center',
    justifyContent: 'center',
    height: 42,
    minWidth: 100, // Minimum genişlik
    flex: 0, // Flex büyümesini önle
  },
  filterChipActive: {
    backgroundColor: theme.colors.error,
    borderColor: theme.colors.error,
  },
  filterChipText: {
    color: theme.colors.text,
    fontSize: theme.fontSizes.md,
    fontWeight: theme.fontWeights.semibold,
    textAlign: 'center',
  },
  filterChipTextActive: {
    color: theme.colors.white,
  },
  filterModalFooter: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 15,
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    // backgroundColor inline style olarak eklendi (dark/light mode desteği için)
  },
  filterClearButton: {
    flex: 1,
    paddingVertical: theme.spacing.lg,
    paddingHorizontal: theme.spacing.xl,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 2,
    borderColor: theme.colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    // backgroundColor inline style olarak eklendi (dark/light mode desteği için)
  },
  filterClearButtonText: {
    fontSize: theme.fontSizes.lg,
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.error,
  },
  filterApplyButton: {
    flex: 1,
    paddingVertical: theme.spacing.lg,
    paddingHorizontal: theme.spacing.xl,
    borderRadius: theme.borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.error,
  },
  filterApplyButtonText: {
    fontSize: theme.fontSizes.lg,
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.white,
  },

  // Slider Stilleri
  sliderContainer: {
    marginBottom: theme.spacing.sm,
    overflow: 'visible', // Animasyon için container dışına çıkabilir
  },
  dualSliderContainer: {
    flexDirection: 'row',
    gap: 20, // 12 → 20 (daha fazla boşluk)
  },
  dualSliderItem: {
    flex: 1,
    minWidth: 160, // Daha fazla hassasiyet için genişlik artırıldı
    maxWidth: '48%', // Maksimum %48 genişlik
  },
  dualSliderTitle: {
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.semibold,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  rangeLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.lg, // sm → lg (daha fazla boşluk)
    paddingBottom: 4, // Ekstra boşluk
  },
  rangeLabelContainer: {
    flex: 1,
    alignItems: 'flex-start', // Sol label için
    overflow: 'visible', // Container dışına çıkabilir
  },
  rangeLabel: {
    fontSize: theme.fontSizes.lg, // md → lg (daha büyük)
    fontWeight: theme.fontWeights.bold, // semibold → bold
    color: theme.colors.error, // Krimson
  },
  sliderTrack: {
    height: 6,
    backgroundColor: '#E5E5E5',
    borderRadius: 3,
    position: 'relative',
    minWidth: 140, // Daha hassas kontrol için genişlik artırıldı
    width: '100%', // Parent container'ın tam genişliği
  },
  sliderProgress: {
    position: 'absolute',
    height: 6,
    backgroundColor: theme.colors.error, // Krimson
    borderRadius: 3,
  },
  sliderThumb: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colors.white,
    borderWidth: 3,
    borderColor: theme.colors.error, // Krimson
    top: -11,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  sliderThumbActive: {
    borderWidth: 4,
    transform: [{ scale: 1.1 }],
  },

  // Toggle Buton Stilleri
  toggleButtonsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  toggleButtonContainer: {
    flex: 1,
  },
  moreFiltersButton: {
    paddingVertical: 18,
    paddingHorizontal: 24,
    backgroundColor: theme.colors.error, // Krimson background (daha belirgin!)
    borderRadius: theme.borderRadius.lg,
    borderWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    marginBottom: 10, // Azaltıldı: 40 → 10
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 8, // Android shadow
  },
  moreFiltersButtonText: {
    color: '#FFFFFF', // Beyaz text (kontrast!)
    fontSize: theme.fontSizes.lg, // Daha büyük
    fontWeight: theme.fontWeights.bold,
    letterSpacing: 0.5,
  },
  moreFiltersContainer: {
    overflow: 'hidden', // Animasyon için
  },
  toggleButton: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    borderWidth: 0,
    backgroundColor: '#142331',
    alignItems: 'center',
    justifyContent: 'center',
    height: 42,
  },
  toggleButtonActive: {
    backgroundColor: theme.colors.error,
  },
  toggleButtonText: {
    fontSize: theme.fontSizes.md,
    color: theme.colors.text,
    fontWeight: theme.fontWeights.medium,
  },
  toggleButtonTextActive: {
    color: theme.colors.white,
    fontWeight: theme.fontWeights.semibold,
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 999, // overlayContainer'ın altında
    justifyContent: 'flex-end', // overlayContainer'ı altta tutar
  },
});

export default memo(PortfolioMap);
