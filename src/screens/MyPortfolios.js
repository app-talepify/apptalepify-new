import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Image,
  Alert,
  ActivityIndicator,
  Animated,
  Platform,
  Modal,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Geolocation from '@react-native-community/geolocation';
import UnifiedPoolMap from '../components/map/UnifiedPoolMap';
import MapStyleSelector from '../components/MapStyleSelector';
import { MAPBOX_STYLES } from '../constants/mapStyles';
import { useNavigation, useFocusEffect, useRoute } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { theme } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import { fetchUserPortfolios, togglePortfolioPublishStatus } from '../services/firestore';
import { getPortfolioFavorites, togglePortfolioFavorite } from '../services/portfolioFavorites';
import ListingCard from '../components/ListingCard';
import AdvancedFiltersModal from '../components/AdvancedFiltersModal';

const MyPortfolios = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { user } = useAuth();
  const { theme: currentTheme, isDark } = useTheme();
  const styles = useMemo(() => stylesFactory(currentTheme), [currentTheme]);

  const [portfolios, setPortfolios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hiddenPortfolios, setHiddenPortfolios] = useState(new Set());
  const [viewedPortfolios, setViewedPortfolios] = useState(new Set());
  const [viewedCounter, setViewedCounter] = useState(0);
  const [favorites, setFavorites] = useState([]);
  const [showFavorites, setShowFavorites] = useState(false);
  
  // Filtreleme sistemi - PortfolioList ile aynı
  const [showFilters, setShowFilters] = useState(false);
  const [hasAppliedFilters, setHasAppliedFilters] = useState(false);
  const [filters, setFilters] = useState({
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
  });
  
  // İşlem kilit sistemi - aynı anda sadece bir toggle işlemi
  const [isToggling, setIsToggling] = useState(false);
  
  // Harita stili ve 3D için state'ler
  const [mapStyle, setMapStyle] = useState(MAPBOX_STYLES.STREETS.url);
  const [enable3D, setEnable3D] = useState(true);
  const [isSatelliteView, setIsSatelliteView] = useState(false);
  const [show3DGuideModal, setShow3DGuideModal] = useState(false);
  const [showDrawingToast, setShowDrawingToast] = useState(false);

  // Popup state ve animasyon
  const [showPopup, setShowPopup] = useState(false);
  const [popupMessage, setPopupMessage] = useState('');
  const [popupType, setPopupType] = useState(''); // 'success' veya 'info'
  const confirmHandlerRef = useRef(null);
  // showHiddenOnly kaldırıldı - artık kullanılmıyor
  const [viewMode, setViewMode] = useState('list'); // 'list' veya 'map'
  const [layoutMode, setLayoutMode] = useState('grid'); // 'grid' veya 'list'
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const listRef = useRef(null);
  const listScrollOffsetRef = useRef(0);

  // Çizim sistemi state'leri
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [drawingPoints, setDrawingPoints] = useState([]);
  const [drawnPolygon, setDrawnPolygon] = useState(null);
  const [filteredPortfolios, setFilteredPortfolios] = useState([]);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const [locationPermissionGranted, setLocationPermissionGranted] = useState(false);
  const [mapReady, setMapReady] = useState(true);

  // Favorileri yükle
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!user?.uid) return;
        const favs = await getPortfolioFavorites(user.uid);
        if (!mounted) return;
        setFavorites(Array.isArray(favs) ? favs.map((v) => String(v)) : []);
      } catch {
        if (!mounted) return;
        setFavorites([]);
      }
    })();
    return () => { mounted = false; };
  }, [user?.uid]);

  // Refs
  const mapRef = useRef(null);
  const cancelTokenRef = useRef({ cancelled: false });
  const lastDrawingPoint = useRef(null);
  const lastDrawingTime = useRef(0);
  const locationWatchIdRef = useRef(null);
  const drawingToastTimeoutRef = useRef(null);

  // Empty component render function
  const renderEmptyComponent = () => (
    <View style={[styles.emptyContainer, { backgroundColor: currentTheme.colors.error }]}>
      <Image
        source={require('../assets/images/icons/portfoy.png')}
        style={[styles.emptyIcon, { tintColor: currentTheme.colors.white }]}
      />
      <Text style={[styles.emptyText, { color: currentTheme.colors.white }]}>
        Henüz portföyünüz bulunmuyor
      </Text>
      <Text style={[styles.emptySubtext, { color: currentTheme.colors.white }]}>
        Yeni portföyler eklediğinizde burada görünecek
      </Text>
    </View>
  );

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
  const { userProfile } = useAuth();
  const userCity = userProfile?.city || 'Ankara';
  const defaultCenter = cityCoordinates[userCity] || cityCoordinates.Ankara;
  const defaultZoom = 12;
  const currentUserId = userProfile?.uid || userProfile?.id;

  // Basit ready flag
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
      setMapStyle(MAPBOX_STYLES.SATELLITE_STREETS.url);
      try {
        await AsyncStorage.setItem('userSatelliteView', 'true');
        await AsyncStorage.setItem('userMapStyle', MAPBOX_STYLES.SATELLITE_STREETS.url);
      } catch (error) {}
    } else {
      setMapStyle(MAPBOX_STYLES.STREETS.url);
      try {
        await AsyncStorage.setItem('userSatelliteView', 'false');
        await AsyncStorage.setItem('userMapStyle', MAPBOX_STYLES.STREETS.url);
      } catch (error) {}
    }
  }, [isSatelliteView]);

  // 3D rehber modalını göster (sadece 2 kere)
  useEffect(() => {
    const check3DGuide = async () => {
      try {
        const countStr = await AsyncStorage.getItem('3dGuideShownCount');
        const count = countStr ? parseInt(countStr, 10) : 0;
        
        if (count < 2 && enable3D && viewMode === 'map') {
          setTimeout(() => {
            setShow3DGuideModal(true);
          }, 1000);
        }
      } catch (error) {}
    };
    
    check3DGuide();
  }, [enable3D, viewMode]);

  // 3D rehber modalını kapat
  const close3DGuideModal = async () => {
    try {
      const countStr = await AsyncStorage.getItem('3dGuideShownCount');
      const count = countStr ? parseInt(countStr, 10) : 0;
      await AsyncStorage.setItem('3dGuideShownCount', String(count + 1));
    } catch (error) {}
    setShow3DGuideModal(false);
  };

  // Load user portfolios on component mount and when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      if (user?.uid) {
        loadUserPortfolios(user.uid);
      }
    }, [loadUserPortfolios, user])
  );

  // Listen for refresh parameter to reload portfolios
  useEffect(() => {
    if (route.params?.refresh && user?.uid) {
      loadUserPortfolios(user.uid);
      // Clear the refresh param to avoid infinite reloads
      navigation.setParams({ refresh: undefined });
    }
  }, [route.params?.refresh, user?.uid, loadUserPortfolios, navigation]);

  // Harita yüklendiğinde konum izni kontrol et
  useEffect(() => {
    if (mapLoaded && viewMode === 'map') {
      checkLocationPermission().then((hasPermission) => {
        if (hasPermission) {
          getUserLocation();
        }
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapLoaded, viewMode]);

  // Filtrelerin gerçekten değişip değişmediğini kontrol et - PortfolioList ile aynı
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

  // Filtreleri uygula
  const applyFilters = useCallback((newFilters) => {
    // Filtrelerin gerçekten değişip değişmediğini kontrol et
    const hasRealChanges = checkIfFiltersChanged(filters, newFilters);
    
    setFilters(newFilters);
    
    // Eğer gerçek bir değişiklik yoksa, hasAppliedFilters'i güncelleme
    if (!hasRealChanges) {
      return;
    }
    
    setHasAppliedFilters(true);
  }, [filters, checkIfFiltersChanged]);

  // Filtreleri temizle
  const clearFilters = useCallback(() => {
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
  }, []);

  // Aktif filtre sayısını hesapla
  const getActiveFiltersCount = useCallback(() => {
    let count = 0;
    
    // Fiyat aralığı değişti mi?
    if (filters.priceRange[0] !== 0 || filters.priceRange[1] !== 20000000) count++;
    
    // String filtreler
    if (filters.propertyType) count++;
    if (filters.listingType) count++;
    if (filters.kitchenType) count++;
    if (filters.usageStatus) count++;
    if (filters.titleDeedStatus) count++;
    if (filters.bathroomCount) count++;
    if (filters.balconyCount) count++;
    if (filters.heatingType) count++;
    if (filters.occupancyStatus) count++;
    
    // Array filtreler (rooms)
    if (filters.rooms.length > 0) count++;
    
    // Range filtreler
    if (filters.areaRange[0] !== 0 || filters.areaRange[1] !== 500) count++;
    if (filters.buildingAgeRange[0] !== 0 || filters.buildingAgeRange[1] !== 50) count++;
    if (filters.totalFloorsRange[0] !== 0 || filters.totalFloorsRange[1] !== 50) count++;
    if (filters.floorNumberRange[0] !== 0 || filters.floorNumberRange[1] !== 50) count++;
    
    // Boolean filtreler
    if (filters.parentalBathroom) count++;
    if (filters.exchange) count++;
    if (filters.hasParking) count++;
    if (filters.hasGlassBalcony) count++;
    if (filters.hasDressingRoom) count++;
    if (filters.isFurnished) count++;
    
    return count;
  }, [filters]);

  // Konum izni kontrol et
  const checkLocationPermission = async () => {
    try {
      if (Platform.OS === 'android') {
        const { PermissionsAndroid } = require('react-native');
        const granted = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        );
        setLocationPermissionGranted(granted);
        return granted;
      }
      return true; // iOS için varsayılan olarak true
    } catch (error) {
      return false;
    }
  };

  // Kullanıcı konumunu al
  const getUserLocation = async () => {
    try {
      if (Platform.OS === 'android') {
        const { PermissionsAndroid } = require('react-native');
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
        );

        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          setLocationPermissionGranted(false);
          return;
        }
        setLocationPermissionGranted(true);
      }

      if (locationWatchIdRef.current) {
        try { Geolocation.clearWatch(locationWatchIdRef.current); } catch {}
        locationWatchIdRef.current = null;
      }
      const watchId = Geolocation.watchPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setUserLocation([longitude, latitude]);
        },
        (error) => {},
        {
          enableHighAccuracy: true,
          distanceFilter: 10,
          interval: 5000,
        },
      );

      locationWatchIdRef.current = watchId;
    } catch (error) {}
  };

  // Çizim sistemi fonksiyonları
  const toggleDrawingMode = useCallback(async () => {
    if (isDrawingMode) {
      setIsDrawingMode(false);
      setDrawingPoints([]);
      lastDrawingPoint.current = null;
    } else {
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
          
          await AsyncStorage.setItem('drawingToastShownCount', String(count + 1));
        }
      } catch (error) {
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
    setFilteredPortfolios([]);
    lastDrawingPoint.current = null;
    lastDrawingTime.current = 0;
  }, []);

  // Nokta-polygon çarpışması kontrolü
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
    if (!polygon || polygon.length < 3) {
      return [];
    }

    const filtered = portfoliosWithCoordinates.filter((portfolio) => {
      const lng = Number(portfolio.coordinates.longitude);
      const lat = Number(portfolio.coordinates.latitude);
      const point = [lng, lat];
      
      return isPointInPolygon(point, polygon);
    });

    return filtered;
  }, [portfoliosWithCoordinates, isPointInPolygon]);

  // Mevcut konuma odaklanma fonksiyonu
  const focusOnUserLocation = useCallback(async () => {
    try {
      // Eğer konum izni yoksa iste
      if (!locationPermissionGranted) {
        if (Platform.OS === 'android') {
          const { PermissionsAndroid } = require('react-native');
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
          );
          
          if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
            setLocationPermissionGranted(false);
          return;
          }
          setLocationPermissionGranted(true);
        } else {
          setLocationPermissionGranted(true);
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
          }, 1600);
        }
      } else {
        // Konum yoksa yeni konum al
        Geolocation.getCurrentPosition(
          (position) => {
            const { latitude, longitude } = position.coords;
            const newLocation = [longitude, latitude];

            setUserLocation(newLocation);

            if (mapRef.current && mapRef.current.setCamera) {
              mapRef.current.setCamera({
                centerCoordinate: newLocation,
                zoomLevel: 17,
                animationDuration: 1500,
              });
              
              setTimeout(() => {
                if (mapRef.current && mapRef.current.showLocationTooltip) {
                  mapRef.current.showLocationTooltip();
                }
              }, 1600);
            }
          },
          (error) => {
            if (__DEV__) {
              console.warn('[MyPortfolios] GPS hatası:', error.code, error.message);
            }
            
            if (error.code === 1) {
              Alert.alert('Konum İzni', 'Konum izni reddedildi. Lütfen ayarlardan konum iznini açın.');
            } else if (error.code === 2) {
              Alert.alert('Konum Bulunamadı', 'Konumunuz bulunamadı. GPS açık mı kontrol edin.');
            } else if (error.code === 3) {
              Alert.alert('Zaman Aşımı', 'Konum alınamadı. Lütfen tekrar deneyin.');
            } else {
              Alert.alert('Hata', `Konum hatası: ${error.message || 'Bilinmeyen hata'}`);
            }
          },
          {
            enableHighAccuracy: true,
            timeout: 30000,
            maximumAge: 0,
          },
        );
      }
    } catch (error) {
      if (__DEV__) {
        console.warn('[MyPortfolios] Konum odaklama hatası:', error.message);
      }
      Alert.alert('Hata', 'Konuma odaklanırken bir hata oluştu.');
    }
  }, [locationPermissionGranted, userLocation]);

  const loadUserPortfolios = useCallback(async (userId) => {
    try {
      setLoading(true);
      const data = await fetchUserPortfolios(userId);
      setPortfolios(data);
      // User portfolios loaded successfully
    } catch (error) {
      // Error loading user portfolios
      Alert.alert('Hata', 'Portföyler yüklenirken bir hata oluştu.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Koordinatları olan portföyler - harita için
  const portfoliosWithCoordinates = useMemo(() => portfolios.filter(
    (p) => p?.coordinates?.latitude && p?.coordinates?.longitude,
  ), [portfolios]);

  // Filtrelenmiş ve koordinatları olan portföyler - harita için
  const filteredPortfoliosWithCoordinates = useMemo(() => {
    return portfoliosWithCoordinates.filter(portfolio => {
      // Fiyat filtresi
      const portfolioPrice = Number(portfolio.price) || 0;
      if (portfolioPrice < filters.priceRange[0] || portfolioPrice > filters.priceRange[1]) {
        return false;
      }
      
      // İlan durumu filtresi
      if (filters.listingType && portfolio.listingType !== filters.listingType) {
        return false;
      }
      
      // Portföy tipi filtresi
      if (filters.propertyType && portfolio.propertyType !== filters.propertyType) {
        return false;
      }
      
      // DETAYLI FİLTRELER - SADECE DAİRE veya VİLLA için
      if (filters.propertyType === 'Daire' || filters.propertyType === 'Villa') {
        const portfolioArea = Number(portfolio.area) || 0;
        if (portfolioArea < filters.areaRange[0] || portfolioArea > filters.areaRange[1]) return false;
        
        if (filters.rooms.length > 0 && !filters.rooms.includes(portfolio.rooms)) return false;
        
        const portfolioBuildingAge = Number(portfolio.buildingAge) || 0;
        if (portfolioBuildingAge < filters.buildingAgeRange[0] || portfolioBuildingAge > filters.buildingAgeRange[1]) return false;
        
        const portfolioFloorNumber = Number(portfolio.floorNumber) || 0;
        const portfolioTotalFloors = Number(portfolio.totalFloors) || 0;
        if (portfolioFloorNumber < filters.floorNumberRange[0] || portfolioFloorNumber > filters.floorNumberRange[1]) return false;
        if (portfolioTotalFloors < filters.totalFloorsRange[0] || portfolioTotalFloors > filters.totalFloorsRange[1]) return false;
        
        if (filters.parentalBathroom && !portfolio.parentBathroom) return false;
        if (filters.exchange && !portfolio.exchange) return false;
        if (filters.kitchenType && portfolio.kitchenType !== filters.kitchenType) return false;
        if (filters.usageStatus && portfolio.usageStatus !== filters.usageStatus) return false;
        if (filters.titleDeedStatus && portfolio.titleDeedStatus !== filters.titleDeedStatus) return false;
        
        if (filters.bathroomCount) {
          const portfolioBathroomCount = portfolio.bathroomCount ? Number(portfolio.bathroomCount) : 0;
          if (filters.bathroomCount === '4+') {
            if (portfolioBathroomCount < 4) return false;
          } else {
            const filterCount = Number(filters.bathroomCount);
            if (portfolioBathroomCount !== filterCount) return false;
          }
        }
        
        if (filters.balconyCount) {
          const portfolioBalconyCount = portfolio.balconyCount !== undefined && portfolio.balconyCount !== null 
            ? Number(portfolio.balconyCount) 
            : 0;
          if (filters.balconyCount === '3+') {
            if (portfolioBalconyCount < 3) return false;
          } else {
            const filterCount = Number(filters.balconyCount);
            if (portfolioBalconyCount !== filterCount) return false;
          }
        }
        
        if (filters.hasParking && !portfolio.parking) return false;
        if (filters.hasGlassBalcony && !portfolio.glassBalcony) return false;
        if (filters.hasDressingRoom && !portfolio.dressingRoom) return false;
        if (filters.isFurnished && !portfolio.furnished) return false;
        if (filters.heatingType && portfolio.heatingType !== filters.heatingType) return false;
        if (filters.occupancyStatus && portfolio.occupancyStatus !== filters.occupancyStatus) return false;
      }
      
      return true;
    });
  }, [portfoliosWithCoordinates, filters]);

  // Geçerli portföyleri filtrele (ID'si olan ve geçerli veri yapısına sahip olanlar)
  const validPortfolios = useMemo(() => portfolios.filter((portfolio, index) => {
    if (!portfolio) {
      // console.warn(`Portfolio at index ${index} is null or undefined`);
      return false;
    }
    if (!portfolio.id) {
      // console.warn(`Portfolio at index ${index} has no ID:`, portfolio);
      return false;
    }
    if (typeof portfolio.id !== 'string' && typeof portfolio.id !== 'number') {
      // console.warn(`Portfolio at index ${index} has invalid ID type:`, typeof portfolio.id, portfolio.id);
      return false;
    }
    return true;
  }), [portfolios]);

  // Gelişmiş filtreleme mantığı - PortfolioList ile aynı
  const filteredValidPortfolios = useMemo(() => {
    let filtered = validPortfolios;

    // Gelişmiş filtreleme mantığı
    filtered = filtered.filter(portfolio => {
      // Fiyat filtresi (slider ile) - HER ZAMAN
      const portfolioPrice = Number(portfolio.price) || 0;
      if (portfolioPrice < filters.priceRange[0] || portfolioPrice > filters.priceRange[1]) {
        return false;
      }
      
      // İlan durumu filtresi
      if (filters.listingType && portfolio.listingType !== filters.listingType) {
        return false;
      }
      
      // Portföy tipi filtresi
      if (filters.propertyType && portfolio.propertyType !== filters.propertyType) {
        return false;
      }
      
      // DETAYLI FİLTRELER - SADECE DAİRE veya VİLLA için
      if (filters.propertyType === 'Daire' || filters.propertyType === 'Villa') {
        // m² filtresi (slider ile)
        const portfolioArea = Number(portfolio.area) || 0;
        if (portfolioArea < filters.areaRange[0] || portfolioArea > filters.areaRange[1]) {
          return false;
        }
        
        // Oda sayısı filtresi (multi-select)
        if (filters.rooms.length > 0 && !filters.rooms.includes(portfolio.rooms)) {
          return false;
        }
        
        // Bina yaşı filtresi (slider ile)
        const portfolioBuildingAge = Number(portfolio.buildingAge) || 0;
        if (portfolioBuildingAge < filters.buildingAgeRange[0] || portfolioBuildingAge > filters.buildingAgeRange[1]) {
          return false;
        }
        
        // Kat bilgileri filtresi (slider ile)
        const portfolioFloorNumber = Number(portfolio.floorNumber) || 0;
        const portfolioTotalFloors = Number(portfolio.totalFloors) || 0;
        if (portfolioFloorNumber < filters.floorNumberRange[0] || portfolioFloorNumber > filters.floorNumberRange[1]) {
          return false;
        }
        if (portfolioTotalFloors < filters.totalFloorsRange[0] || portfolioTotalFloors > filters.totalFloorsRange[1]) {
          return false;
        }
        
        // Ebeveyn banyosu filtresi
        if (filters.parentalBathroom && !portfolio.parentBathroom) return false;
        
        // Takas filtresi
        if (filters.exchange && !portfolio.exchange) return false;
        
        // Mutfak tipi filtresi
        if (filters.kitchenType && portfolio.kitchenType !== filters.kitchenType) return false;
        
        // Kullanım durumu filtresi
        if (filters.usageStatus && portfolio.usageStatus !== filters.usageStatus) return false;
        
        // Tapu durumu filtresi
        if (filters.titleDeedStatus && portfolio.titleDeedStatus !== filters.titleDeedStatus) return false;
        
        // DAHA FAZLA FİLTRE SEÇENEKLERİ
        // Banyo sayısı filtresi
        if (filters.bathroomCount) {
          const portfolioBathroomCount = portfolio.bathroomCount ? Number(portfolio.bathroomCount) : 0;
          if (filters.bathroomCount === '4+') {
            if (portfolioBathroomCount < 4) return false;
          } else {
            const filterCount = Number(filters.bathroomCount);
            if (portfolioBathroomCount !== filterCount) return false;
          }
        }
        
        // Balkon sayısı filtresi
        if (filters.balconyCount) {
          const portfolioBalconyCount = portfolio.balconyCount !== undefined && portfolio.balconyCount !== null 
            ? Number(portfolio.balconyCount) 
            : 0;
          if (filters.balconyCount === '3+') {
            if (portfolioBalconyCount < 3) return false;
          } else {
            const filterCount = Number(filters.balconyCount);
            if (portfolioBalconyCount !== filterCount) return false;
          }
        }
        
        // Otopark filtresi
        if (filters.hasParking && !portfolio.parking) return false;
        
        // Cam balkon filtresi
        if (filters.hasGlassBalcony && !portfolio.glassBalcony) return false;
        
        // Vestiyer filtresi
        if (filters.hasDressingRoom && !portfolio.dressingRoom) return false;
        
        // Eşyalı filtresi
        if (filters.isFurnished && !portfolio.furnished) return false;
        
        // Isıtma tipi filtresi
        if (filters.heatingType && portfolio.heatingType !== filters.heatingType) return false;
        
        // İskan durumu filtresi
        if (filters.occupancyStatus && portfolio.occupancyStatus !== filters.occupancyStatus) return false;
      }
      
      return true;
    });

    // Favoriler görünümü: sadece favoriye aldıklarımı göster
    if (showFavorites) {
      const favSet = new Set((favorites || []).map((v) => String(v)));
      filtered = filtered.filter((p) => favSet.has(String(p.id)));
    }

    return filtered;
  }, [validPortfolios, filters, showFavorites, favorites]);

  const togglePortfolioStatus = async (portfolioId) => {
    try {
      // İşlem kilit kontrolü
      if (isToggling) {
        return;
      }
      
      const portfolio = portfolios.find(p => p.id === portfolioId);
      if (!portfolio) {
        return;
      }

      const newStatus = !portfolio.isPublished;
      
      // İşlem kilidini aç
      setIsToggling(true);


      // Eğer gizliden yayına alıyorsak onay sor
      if (newStatus) {
        return new Promise((resolve) => {
          setPopupMessage('Portföyünüzü Havuzda yayınlamak üzeresiniz. Yayınlansın mı?');
          setPopupType('confirm');
          setShowPopup(true);

          // Animasyonu başlat
          Animated.parallel([
            Animated.timing(fadeAnim, {
              toValue: 1,
              duration: 200,
              useNativeDriver: true,
            }),
            Animated.spring(scaleAnim, {
              toValue: 1,
              tension: 100,
              friction: 8,
              useNativeDriver: true,
            }),
          ]).start();

          // Modal'dan gelen cevabı bekle
          const handleConfirm = (confirmed) => {
            // Null/undefined check - sadece boolean değerleri kabul et
            if (confirmed !== true && confirmed !== false) {
              return;
            }
            
            // Animasyonu kapat
            Animated.parallel([
              Animated.timing(fadeAnim, {
                toValue: 0,
                duration: 200,
                useNativeDriver: true,
              }),
              Animated.timing(scaleAnim, {
                toValue: 0.8,
                duration: 200,
                useNativeDriver: true,
              }),
            ]).start(() => {
              setShowPopup(false);
            });

            if (confirmed) {
              // Optimistik UI güncellemesi (hemen göster)
              setPortfolios(prev => prev.map(p => (
                p.id === portfolioId ? { ...p, isPublished: newStatus } : p
              )));
              processStatusChange(portfolioId, newStatus);
            }
            
            // İşlem kilidini kaldır
            setIsToggling(false);
            resolve(confirmed);
          };

          // Global handler ekle - ref ile render'dan bağımsız tut
          confirmHandlerRef.current = handleConfirm;
        });
      } else {
        // Gizlemeye onay gerekmiyor
        await processStatusChange(portfolioId, newStatus);
        // İşlem kilidini kaldır
        setIsToggling(false);
      }
    } catch (error) {
      // console.error('Error toggling portfolio status:', error);
      Alert.alert('Hata', 'Portföy durumu değiştirilirken bir hata oluştu.');
      // Hata durumunda da kilidi kaldır
      setIsToggling(false);
    }
  };

  const processStatusChange = async (portfolioId, newStatus) => {
    try {
      // API'ye gönder
      const result = await togglePortfolioPublishStatus(portfolioId, newStatus);

      if (result.success) {
        // Local state'i güncelle (zaten optimistik yapılmış olabilir)
        const updatedPortfolios = portfolios.map(p =>
          p.id === portfolioId
            ? { ...p, isPublished: newStatus }
            : p,
        );

        setPortfolios(updatedPortfolios);

        // Kısa popup mesajını göster (2 saniye)
        const message = newStatus
          ? 'Portföyünüz yayınlandı'
          : 'Portföyünüz gizlendi';

        setPopupMessage(message);
        setPopupType('success');
        setShowPopup(true);

        // Animasyonu başlat
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.spring(scaleAnim, {
            toValue: 1,
            tension: 100,
            friction: 8,
            useNativeDriver: true,
          }),
        ]).start();

        // 2 saniye sonra popup'ı kapat
        setTimeout(() => {
          Animated.parallel([
            Animated.timing(fadeAnim, {
              toValue: 0,
              duration: 200,
              useNativeDriver: true,
            }),
            Animated.timing(scaleAnim, {
              toValue: 0.8,
              duration: 200,
              useNativeDriver: true,
            }),
          ]).start(() => {
            setShowPopup(false);
          });
        }, 2000);
      } else {
        // Hata durumu: rollback yap
        setPortfolios(prev => prev.map(p => (
          p.id === portfolioId ? { ...p, isPublished: !newStatus } : p
        )));
        
        // Hata mesajını göster
        // console.error('Portfolio update failed:', result.error);
        setPopupMessage(`Hata: ${result.error}`);
        setPopupType('success');
        setShowPopup(true);

        // Animasyonu başlat
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.spring(scaleAnim, {
            toValue: 1,
            tension: 100,
            friction: 8,
            useNativeDriver: true,
          }),
        ]).start();

        // 3 saniye sonra popup'ı kapat
        setTimeout(() => {
          Animated.parallel([
            Animated.timing(fadeAnim, {
              toValue: 0,
              duration: 200,
              useNativeDriver: true,
            }),
            Animated.timing(scaleAnim, {
              toValue: 0.8,
              duration: 200,
              useNativeDriver: true,
            }),
          ]).start(() => {
            setShowPopup(false);
          });
        }, 3000);
      }
    } catch (error) {
      // Hata: rollback yap
      setPortfolios(prev => prev.map(p => (
        p.id === portfolioId ? { ...p, isPublished: !newStatus } : p
      )));
      // console.error('Error processing status change:', error);
      setPopupMessage('Portföy durumu değiştirilirken bir hata oluştu.');
      setPopupType('success');
      setShowPopup(true);

      // 3 saniye sonra popup'ı kapat
      setTimeout(() => {
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.timing(scaleAnim, {
            toValue: 0.8,
            duration: 200,
            useNativeDriver: true,
          }),
        ]).start(() => {
          setShowPopup(false);
        });
      }, 3000);
    }
  };

  const renderPortfolioCard = ({ item: portfolio, index }) => (
    <View style={layoutMode === 'grid' ? styles.portfolioCardContainer : styles.portfolioCardContainerFull}>
      {/* Portfolio Card - Yeni sol üst köşe butonu ile */}
      <ListingCard
        listing={portfolio}
        onPress={() => {
          // Görüntülenen portföyler listesine ekle
          setViewedPortfolios(prev => {
            const newSet = new Set(prev);
            newSet.add(portfolio.id);
            return newSet;
          });
          navigation.navigate('PropertyDetail', { portfolio, fromScreen: 'MyPortfolios' });
        }}
        onTogglePublish={togglePortfolioStatus}
        isEditable={true}
        publishAlignRight={layoutMode === 'grid' ? (index % 2 === 1) : false}
      />
      {/* Favori butonu */}
      <TouchableOpacity
        style={styles.favoriteButton}
        onPress={async () => {
          try {
            if (!user?.uid || !portfolio?.id) return;
            const next = await togglePortfolioFavorite(user.uid, String(portfolio.id));
            if (Array.isArray(next)) setFavorites(next);
          } catch {}
        }}
        accessibilityRole="button"
        accessibilityLabel="Favori"
        activeOpacity={0.85}
      >
        <Image
          source={require('../assets/images/icons/Favorite_fill.png')}
          style={styles.favoriteIcon}
        />
      </TouchableOpacity>
    </View>
  );

  // Odaklanınca önceki scroll konumuna dön (detaydan geri gelince)
  useFocusEffect(
    useCallback(() => {
      if (viewMode !== 'list') { return; }
      const timer = setTimeout(() => {
        try {
          if (listRef.current && listScrollOffsetRef.current > 0) {
            listRef.current.scrollToOffset({ offset: listScrollOffsetRef.current, animated: false });
          }
        } catch {}
      }, 0);
      return () => clearTimeout(timer);
    }, [viewMode])
  );

  return (
    <View style={styles.container}>
      {/* Arka Plan - Ana sayfadaki gibi görsel tabanlı */}
      <View style={styles.backgroundContainer}>
        <Image
          source={require('../assets/images/dark-bg.jpg')}
          style={styles.backgroundImage}
        />
      </View>

      {/* Header - sadece liste modunda */}
      {viewMode === 'list' && (
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerButtonBack}
          onPress={() => {
            if (navigation.canGoBack()) {
              navigation.goBack();
            } else {
              navigation.navigate('Ana Sayfa');
            }
          }}
        >
          <Image
            source={require('../assets/images/icons/return.png')}
            style={styles.headerButtonIconBack}
          />
        </TouchableOpacity>

        <View style={styles.headerContent}>
          <Text style={styles.mainTitle}>Portföylerim</Text>
          <Text style={[styles.mainSubtitle, { color: isDark ? theme.colors.white : theme.colors.navy }]}>
            {filteredValidPortfolios.length} portföy
          </Text>
        </View>

        <View style={styles.headerRightButtons}>
          {/* Favoriler toggle */}
          <TouchableOpacity
            style={[styles.headerButton, showFavorites && styles.headerButtonActive]}
            onPress={() => setShowFavorites(!showFavorites)}
          >
            <Image
              source={require('../assets/images/icons/Favorite_fill.png')}
              style={styles.headerButtonIconOnly}
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.headerButton, getActiveFiltersCount() > 0 && styles.headerButtonActive]}
            onPress={() => setShowFilters(true)}
          >
            <Image
              source={require('../assets/images/icons/filtrele.png')}
              style={styles.headerButtonIconOnly}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => setLayoutMode(layoutMode === 'grid' ? 'list' : 'grid')}
          >
            <Image
              source={require('../assets/images/icons/vieverlist.png')}
              style={styles.headerButtonIconOnly}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => setViewMode(viewMode === 'list' ? 'map' : 'list')}
          >
            <Image
              source={require('../assets/images/icons/harita.png')}
              style={styles.headerButtonIconOnly}
            />
          </TouchableOpacity>
        </View>
      </View>
      )}

      {/* Clear Filters Button - Separate Row */}
      {viewMode === 'list' && getActiveFiltersCount() > 0 && (
        <View style={styles.clearFiltersContainer}>
          <TouchableOpacity
            style={styles.clearButton}
            onPress={clearFilters}
          >
            <Text style={styles.clearButtonText}>Temizle ({getActiveFiltersCount()})</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Liste Görünümü */}
      {viewMode === 'list' && (
        <FlatList
          ref={listRef}
          key={layoutMode}
          data={filteredValidPortfolios}
          renderItem={renderPortfolioCard}
          keyExtractor={(item, index) => {
            // Sadece geçerli portföyler kullanıldığı için ID her zaman mevcut
            return `portfolio-${item.id}-${index}`;
          }}
          numColumns={layoutMode === 'grid' ? 2 : 1}
          columnWrapperStyle={layoutMode === 'grid' ? styles.portfolioRow : null}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={loading ? null : renderEmptyComponent}
          // Performans ayarları
          initialNumToRender={6}
          maxToRenderPerBatch={8}
          windowSize={7}
          updateCellsBatchingPeriod={50}
          removeClippedSubviews
          extraData={layoutMode}
          onScroll={(e) => {
            listScrollOffsetRef.current = e.nativeEvent.contentOffset?.y || 0;
          }}
          scrollEventThrottle={16}
        />
      )}

      {/* Harita Görünümü */}
      {viewMode === 'map' && (
        <View style={styles.mapContainer}>
          {/* Harita modunda üst sol geri ve sağda Liste butonu */}
          <View style={styles.mapHeader}>
            <TouchableOpacity
              style={styles.headerButtonBack}
              onPress={() => setViewMode('list')}
            >
              <Image source={require('../assets/images/icons/return.png')} style={styles.headerButtonIconBack} />
            </TouchableOpacity>

            {/* Sağ üst - Kontrol butonları */}
            <View style={styles.headerButtons}>
              {/* İlk satır - Filtre ve Mevcut Konum yan yana */}
              <View style={styles.topButtonRow}>
                {/* Filtreleme butonu */}
                <TouchableOpacity
                  style={[
                    styles.filterButton,
                    getActiveFiltersCount() > 0 && styles.filterButtonActive
                  ]}
                  onPress={() => setShowFilters(true)}
                >
                  <Image
                    source={require('../assets/images/icons/filtrele.png')}
                    style={styles.filterButtonIcon}
                  />
                  <Text style={styles.filterButtonText}>Filtrele</Text>
                </TouchableOpacity>

                {/* Mevcut Konuma Git */}
                <TouchableOpacity
                  style={styles.fitButton}
                  onPress={focusOnUserLocation}
                >
                  <Image
                    source={require('../assets/images/icons/pmpin.png')}
                    style={styles.fitButtonIcon}
                  />
                </TouchableOpacity>
            </View>

              {/* Alt butonlar - Mevcut konumun hizasında */}
              <View style={styles.bottomButtonsContainer}>
                {/* Çizim Modu */}
                <TouchableOpacity
                  style={[styles.drawingButton, isDrawingMode && styles.drawingButtonActive]}
                  onPress={toggleDrawingMode}
                >
                  <Image
                    source={require('../assets/images/icons/Edit_fill.png')}
                    style={[styles.drawingButtonIcon, isDrawingMode && styles.drawingButtonIconActive]}
                  />
                </TouchableOpacity>

                {/* Harita Stilleri */}
                <MapStyleSelector
                  currentStyle={mapStyle}
                  onStyleChange={handleStyleChange}
                  theme={theme}
                />

                {/* Uydu Görünümü Toggle */}
            <TouchableOpacity
                  style={[styles.satelliteButton, isSatelliteView && styles.satelliteButtonActive]}
                  onPress={toggleSatelliteView}
            >
                  <Image
                    source={require('../assets/images/icons/satellite.png')}
                    style={[styles.satelliteButtonIcon, isSatelliteView && styles.satelliteButtonIconActive]}
                  />
            </TouchableOpacity>

                {/* 3D Toggle */}
            <TouchableOpacity
                  style={[styles.button3D, enable3D && styles.button3DActive]}
                  onPress={handle3DToggle}
            >
                  <Text style={[styles.button3DText, enable3D && styles.button3DTextActive]}>
                    {enable3D ? '3D' : '2D'}
                  </Text>
            </TouchableOpacity>

                {/* Çizim modu butonları */}
            {isDrawingMode && (
              <TouchableOpacity
                style={styles.clearDrawingButton}
                onPress={clearDrawing}
              >
                <Text style={styles.clearDrawingButtonText}>✕</Text>
              </TouchableOpacity>
            )}
              </View>
            </View>
          </View>

          {!mapLoaded && (
            <View style={styles.mapLoadingContainer}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
              <Text style={styles.mapLoadingText}>
                {'Harita yükleniyor...'}
              </Text>
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
          {isDrawingMode && (
            <View
              style={styles.drawingOverlay}
              onTouchMove={(e) => {
                const currentTime = Date.now();
                
                if (currentTime - lastDrawingTime.current < 30) {
                  return;
                }

                const touch = e.nativeEvent.touches[0];
                if (!touch) {
                  return;
                }

                const { locationX, locationY } = touch;

                if (mapRef.current && mapRef.current.getCoordinateFromView) {
                  mapRef.current.getCoordinateFromView([locationX, locationY])
                    .then((coordinates) => {
                      const [longitude, latitude] = coordinates;

                      if (lastDrawingPoint.current) {
                        const distance = Math.sqrt(
                          Math.pow(longitude - lastDrawingPoint.current[0], 2) +
                          Math.pow(latitude - lastDrawingPoint.current[1], 2),
                        );
                        if (distance < 0.0001) {
                          return;
                        }
                      }

                      setDrawingPoints((prev) => [...prev, [longitude, latitude]]);
                      lastDrawingPoint.current = [longitude, latitude];
                      lastDrawingTime.current = currentTime;
                    })
                    .catch(() => {});
                }
              }}
              onTouchEnd={() => {
                if (drawingPoints.length >= 3) {
                  const polygon = [...drawingPoints, drawingPoints[0]];
                  setDrawnPolygon(polygon);
                  
                  const filtered = filterPortfoliosInPolygon(drawingPoints);
                  setFilteredPortfolios(filtered);

                  setIsDrawingMode(false);
                  setDrawingPoints([]);
                } else {
                  setDrawingPoints([]);
                }
                lastDrawingPoint.current = null;
              }}
            />
          )}

          <View style={styles.map}>
            <UnifiedPoolMap
              ref={mapRef}
              center={defaultCenter}
              zoom={defaultZoom}
              pins={(filteredPortfolios.length > 0 ? filteredPortfolios : filteredPortfoliosWithCoordinates)}
              onPinPress={(portfolio) => {
                const newCounter = viewedCounter + 1;
                setViewedCounter(newCounter);
                
                const newSet = new Set(viewedPortfolios);
                        newSet.add(portfolio.id);
                setViewedPortfolios(newSet);
                
                navigation.navigate('PropertyDetail', { 
                  portfolio, 
                  fromScreen: 'MyPortfolios' 
                });
              }}
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
              pitch={enable3D ? 35 : 0}
              heading={0}
              userLocation={userLocation}
            />
          </View>
        </View>
      )}

      {/* Çizim Modu Toast */}
      {viewMode === 'map' && showDrawingToast && (
        <Animated.View style={styles.drawingToast}>
          <Text style={styles.drawingToastIcon}>✏️</Text>
          <View style={styles.drawingToastTextContainer}>
            <Text style={styles.drawingToastTitle}>Çizim Modu Aktif</Text>
            <Text style={styles.drawingToastText}>
              Harita üzerinde bir alan çizin
          </Text>
        </View>
        </Animated.View>
      )}

      {/* Success/Confirm Popup */}
      {showPopup && (
        <Animated.View
          style={[
            styles.popupOverlay,
            { opacity: fadeAnim },
          ]}
        >
          <Animated.View
            style={[
              styles.popupContainer,
              {
                transform: [{ scale: scaleAnim }],
                opacity: fadeAnim,
              },
            ]}
          >
            {popupType === 'confirm' ? (
              // Confirm Modal
              <>
                <View style={styles.popupIconContainer}>
                  <Text style={styles.popupIconText}>❓</Text>
                </View>
                <Text style={styles.popupMessage}>{popupMessage}</Text>
                <View style={styles.popupButtons}>
                  <TouchableOpacity
                    style={[styles.popupButton, styles.popupButtonCancel]}
                    onPress={() => {
                      if (confirmHandlerRef.current) {
                        confirmHandlerRef.current(false);
                        confirmHandlerRef.current = null;
                      }
                    }}
                  >
                    <Text style={styles.popupButtonTextCancel}>Hayır</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.popupButton, styles.popupButtonConfirm]}
                    onPress={() => {
                      if (confirmHandlerRef.current) {
                        confirmHandlerRef.current(true);
                        confirmHandlerRef.current = null;
                      }
                    }}
                  >
                    <Text style={styles.popupButtonTextConfirm}>Evet</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              // Success Modal
              <>
                <View style={styles.popupIconContainer}>
                  <Image
                    source={require('../assets/images/icons/check.png')}
                    style={styles.popupIcon}
                  />
                </View>
                <Text style={styles.popupMessage}>{popupMessage}</Text>
              </>
            )}
          </Animated.View>
        </Animated.View>
      )}

      {/* Gelişmiş Filtreler Modalı */}
      <AdvancedFiltersModal
        visible={showFilters}
        onClose={() => setShowFilters(false)}
        onApply={applyFilters}
        onClear={clearFilters}
        initialFilters={filters}
        portfolios={portfolios}
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

          <TouchableOpacity
            style={styles.guideModalButton}
            onPress={close3DGuideModal}
            activeOpacity={0.8}
          >
            <Text style={styles.guideModalButtonText}>Anladım, Devam Et</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const stylesFactory = (theme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent', // Theme arka plan rengi
  },

  // Arka Plan
  backgroundContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    // Ana sayfadaki gibi arka plan görseli yer tutucu (şimdilik sadece renk)
    backgroundColor: theme.colors.background,
    zIndex: -1,
  },
  backgroundImage: { width: '100%', height: '100%', resizeMode: 'cover' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingTop: 30,
    paddingBottom: theme.spacing.lg,
    backgroundColor: 'transparent',
    borderBottomWidth: 0,
    marginBottom: theme.spacing.lg,
  },

  headerButton: {
    backgroundColor: theme.colors.error,
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0,
    display: 'flex',
  },

  headerButtonIconOnly: {
    width: 20,
    height: 20,
    tintColor: theme.colors.white,
    resizeMode: 'contain',
    alignSelf: 'center',
  },

  headerButtonBack: {
    backgroundColor: theme.colors.error, // Theme kırmızı rengi
    width: 40,
    height: 40,
    borderRadius: 8, // Rounded square
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

  headerButtonText: {
    fontSize: 20,
    color: theme.colors.white,
  },

  headerButtonIconBack: {
    width: 20,
    height: 20,
    resizeMode: 'contain',
    tintColor: theme.colors.white, // Theme beyaz rengi
  },

  headerButtonActive: {
    backgroundColor: '#2196F3' + '4D', // Mavi renk - filtreleme aktif olduğunda
    borderColor: '#2196F3',
  },

  filterButton: {
    backgroundColor: theme.colors.error,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0,
    ...theme.shadows.small,
  },
  filterButtonActive: {
    backgroundColor: '#2196F3',
    borderColor: '#2196F3',
  },
  filterButtonIcon: {
    width: 20,
    height: 20,
    marginRight: 8,
    tintColor: theme.colors.white,
  },
  filterButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.white,
  },
  headerButtons: { 
    flexDirection: 'column', 
    gap: theme.spacing.sm 
  },
  topButtonRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    alignItems: 'flex-start',
  },
  bottomButtonsContainer: {
    flexDirection: 'column',
    gap: theme.spacing.sm,
    marginLeft: 'auto',
  },
  satelliteButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.surface,
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
  drawingButtonIcon: {
    width: 22,
    height: 22,
    tintColor: theme.colors.white,
  },
  drawingButtonIconActive: {
    tintColor: theme.colors.white,
  },
  fitButton: {
    width: 44, 
    height: 44, 
    borderRadius: 22, 
    backgroundColor: theme.colors.primary,
    justifyContent: 'center', 
    alignItems: 'center', 
    borderWidth: 0,
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

  headerContent: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: theme.spacing.lg,
  },

  mainTitle: {
    fontSize: theme.fontSizes.xxxl,
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.error, // Theme kırmızı rengi
    textAlign: 'center',
  },

  mainSubtitle: {
    fontSize: theme.fontSizes.md,
    color: theme.colors.textWhite + 'CC',
    textAlign: 'center',
    marginTop: theme.spacing.xs,
  },

  headerRightButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },

  clearFiltersContainer: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
  },

  clearButton: {
    backgroundColor: theme.colors.error,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignSelf: 'flex-start',
    ...theme.shadows.medium,
  },

  clearButtonText: {
    color: theme.colors.white,
    fontSize: theme.fontSizes.md,
    fontWeight: theme.fontWeights.semibold,
  },

  listContainer: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: 100,
    backgroundColor: 'transparent',
  },

  portfolioRow: {
    justifyContent: 'space-between',
    marginBottom: theme.spacing.md,
    paddingHorizontal: theme.spacing.sm,
  },

  portfolioCardContainer: {
    width: '47%',
    marginBottom: theme.spacing.sm,
    position: 'relative',
  },
  portfolioCardContainerFull: {
    width: '100%',
    marginBottom: theme.spacing.sm,
  },

  favoriteButton: {
    position: 'absolute',
    top: theme.spacing.sm,
    right: theme.spacing.sm,
    backgroundColor: theme.colors.primary + '80',
    borderRadius: theme.borderRadius.lg,
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    ...theme.shadows.medium,
    zIndex: 999,
    elevation: 16,
  },
  favoriteIcon: {
    width: 18,
    height: 18,
    tintColor: theme.colors.white,
  },

  // Eski action button stilleri kaldırıldı - artık ListingCard içinde

  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.surface, // Theme yüzey rengi
  },

  // Popup Styles
  popupOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)', // Koyu overlay
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },

  popupContainer: {
    backgroundColor: theme.colors.background, // Theme arka plan rengi
    borderRadius: theme.borderRadius.xl,
    padding: 25,
    alignItems: 'center',
    borderWidth: 0, // Border kaldırıldı
    ...theme.shadows.large,
    minWidth: 250, // Genişliği küçülttük
    maxWidth: 320, // Maksimum genişlik ekledik
  },

  popupIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: theme.colors.success + '33',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
    borderWidth: 2,
    borderColor: theme.colors.success,
  },

  popupIcon: {
    width: 32,
    height: 32,
    resizeMode: 'contain',
    tintColor: theme.colors.success,
  },

  popupMessage: {
    fontSize: theme.fontSizes.xxl,
    fontWeight: theme.fontWeights.semibold,
    color: theme.colors.white,
    textAlign: 'center',
    lineHeight: 24,
  },

  // Map Styles
  mapContainer: { flex: 1, position: 'relative' },
  map: { flex: 1 },
  mapHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingTop: 20,
    paddingBottom: theme.spacing.sm,
    backgroundColor: 'transparent',
    borderBottomWidth: 0,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
  },
  mapTopBar: {
    position: 'absolute',
    top: 20,
    left: 20,
    right: 20,
    zIndex: 25,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'transparent',
  },
  locationButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: theme.colors.primary,
    marginBottom: 10,
    ...theme.shadows.medium,
  },
  locationButtonText: { fontSize: 24 },
  mapHeaderIcon: { width: 22, height: 22, tintColor: theme.colors.primary },
  drawingButton: {
    width: 44, 
    height: 44, 
    borderRadius: 22, 
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center', 
    borderWidth: 0, 
    ...theme.shadows.small,
  },
  drawingButtonActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  drawingButtonText: { fontSize: 24 },
  drawingButtonTextActive: { color: theme.colors.white },
  clearDrawingButton: {
    width: 44, 
    height: 44, 
    borderRadius: 22, 
    backgroundColor: theme.colors.error,
    justifyContent: 'center',
    alignItems: 'center', 
    borderWidth: 1, 
    borderColor: theme.colors.error, 
    ...theme.shadows.small,
  },
  clearDrawingButtonText: { 
    fontSize: theme.fontSizes.lg, 
    color: theme.colors.white 
  },
  mapLoadingContainer: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: theme.colors.primary + 'CC', justifyContent: 'center', alignItems: 'center', zIndex: 1000,
  },
  mapLoadingText: { color: theme.colors.white, fontSize: theme.fontSizes.lg, marginTop: theme.spacing.md, fontWeight: theme.fontWeights.medium },
  
  // Mapbox warning styles
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
  drawingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999,
    backgroundColor: 'transparent',
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
    backgroundColor: 'rgba(227, 30, 36, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: theme.spacing.xl,
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
    color: theme.colors.primary,
  },
  // Confirm Modal Stilleri
  popupIconText: {
    fontSize: 48,
    textAlign: 'center',
  },
  popupButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  popupButton: {
    flex: 1,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
  },
  popupButtonCancel: {
    backgroundColor: theme.colors.textSecondary,
  },
  popupButtonConfirm: {
    backgroundColor: theme.colors.error,
  },
  popupButtonTextCancel: {
    color: theme.colors.white,
    fontSize: theme.fontSizes.md,
    fontWeight: theme.fontWeights.semibold,
  },
  popupButtonTextConfirm: {
    color: theme.colors.white,
    fontSize: theme.fontSizes.md,
    fontWeight: theme.fontWeights.semibold,
  },

  // Empty state styles
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.xxl,
    marginTop: 50,
    marginHorizontal: theme.spacing.lg,
    borderRadius: theme.borderRadius.lg,
    minHeight: 200,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    marginBottom: theme.spacing.lg,
  },
  emptyText: {
    fontSize: theme.fontSizes.xl,
    fontWeight: theme.fontWeights.bold,
    textAlign: 'center',
    marginBottom: theme.spacing.md,
  },
  emptySubtext: {
    fontSize: theme.fontSizes.md,
    textAlign: 'center',
    opacity: 0.9,
    lineHeight: 22,
  },
});

export default MyPortfolios;
