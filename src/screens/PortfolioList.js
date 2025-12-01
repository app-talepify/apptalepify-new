import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  Image,
  ImageBackground,
  Animated,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute, useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { theme } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
// import { fetchPortfolios } from '../services/firestore';
// import { sanitizeImageUrl, img as cdnImg } from '../utils/media';
import AdvancedFiltersModal from '../components/AdvancedFiltersModal';
import { usePortfolioSearch } from '../context/PortfolioSearchContext';
import ListingCard from '../components/ListingCard';
import GlassmorphismView from '../components/GlassmorphismView'; // Import et
import * as Animatable from 'react-native-animatable';
import { getPortfolioFavorites, togglePortfolioFavorite } from '../services/portfolioFavorites';

const PortfolioList = ({ navigation }) => {
  const viewRef = React.useRef(null);
  const isFirstFocusRef = React.useRef(true);
  const insets = useSafeAreaInsets();
  const toastAnim = React.useRef(new Animated.Value(0)).current;
  const toastTimerRef = React.useRef(null);
  const [toastText, setToastText] = useState('');
  const [toastKind, setToastKind] = useState('add'); // 'add' | 'remove'

  const customEnterAnimation = React.useMemo(() => ({
    from: { opacity: 0, translateY: 8 },
    to: { opacity: 1, translateY: 0 },
  }), []);

  const customExitAnimation = React.useMemo(() => ({
    from: { opacity: 1, translateY: 0 },
    to: { opacity: 1, translateY: 0 },
  }), []);

  useFocusEffect(
    React.useCallback(() => {
      // Sadece ilk odaklanmada sayfa giriş animasyonunu çalıştır
      if (isFirstFocusRef.current && viewRef.current) {
        try { viewRef.current.animate(customEnterAnimation, 420); } catch {}
        isFirstFocusRef.current = false;
      }
      return () => {
        if (viewRef.current) {
          try { viewRef.current.animate(customExitAnimation, 200); } catch {}
        }
      };
    }, [customEnterAnimation, customExitAnimation])
  );
  const { theme: currentTheme, isDark } = useTheme();
  const styles = useMemo(() => stylesFactory(currentTheme), [currentTheme]);
  const { user, userProfile } = useAuth();
  const route = useRoute();
  

  const onlyMine = route?.params?.onlyMine || false;
  const {
    portfolios,
    loadPortfolios,
    filters,
    setFilters,
    hasAppliedFilters,
    setHasAppliedFilters,
    drawnPolygon,
    setDrawnPolygon,
    loading,
  } = usePortfolioSearch();
  const [refreshing, setRefreshing] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  
  // Debug: hasAppliedFilters değişimini logla
  useEffect(() => {
    if (__DEV__) {
      console.log('🔄 [PortfolioList] hasAppliedFilters değişti:', hasAppliedFilters);
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
  // Gelişmiş filtreler - haritadaki ile aynı yapı
  // filters moved to context
  const [favorites, setFavorites] = useState([]);
  const [showFavorites, setShowFavorites] = useState(route.params?.showFavorites || false);
  // loading comes from context
  const fromScreen = route.params?.fromScreen;

  // Favori görünümü: sayfa odağa geldiğinde sadece parametre verilmişse aç, aksi halde kapat.
  // Ayrıca parametreyi temizleyerek "yapışmasını" engelle.
  const lastPreferredShowFavoritesRef = React.useRef(!!(route?.params?.showFavorites));
  useEffect(() => { lastPreferredShowFavoritesRef.current = showFavorites; }, [showFavorites]);
  useFocusEffect(
    useCallback(() => {
      const paramFav = route?.params?.showFavorites;
      const shouldShowFavs = (typeof paramFav !== 'undefined') ? !!paramFav : !!lastPreferredShowFavoritesRef.current;
      setShowFavorites(shouldShowFavs);
      try { navigation?.setParams?.({ showFavorites: undefined }); } catch {}
      // Odağa gelince favorileri AsyncStorage'dan tazele (PropertyDetail'dan dönüşte güncel kalsın)
      (async () => {
        try {
          if (!user?.uid) return;
          const favs = await getPortfolioFavorites(user.uid);
          const normalized = Array.isArray(favs) ? favs.map((v) => String(v)) : [];
          setFavorites(normalized);
        } catch (_) {}
      })();
      return () => {};
    }, [route?.params?.showFavorites, user?.uid])
  );

  // DailyTasks'ten alınan gradient config
  const backgroundContainerConfig = useMemo(() => ({
    overlayColor: 'rgba(224, 220, 220, 0.81)',
    startColor: 'rgba(17, 36, 49, 1)',
    endColor: 'rgba(17, 36, 49, 0.38)',
    gradientAlpha: 1,
    gradientDirection: 150,
    gradientSpread: 7,
    ditherStrength: 4.0,
  }), []);

  // Store senkronizasyonu kullanılıyor; ekranlar arası param geçişi kaldırıldı

  // Sadece sayfa odaklandığında ve gerekli durumlarda yükle (MyPortfolios ile aynı yaklaşım)
  useFocusEffect(
    useCallback(() => {
      // Loading sırasında hiçbir şey yapma (flash'ı önler)
      if (loading) {
        return;
      }

      // Sadece kullanıcı varsa ve portfolios henüz yüklenmediyse yükle
      if (user && (!portfolios || portfolios.length === 0)) {
        loadPortfolios();
      }
    }, [user, loadPortfolios, portfolios, loading]),
  );


  // Favori portföyleri AsyncStorage'dan yükle (kullanıcı bazlı)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!user?.uid) return;
        const favs = await getPortfolioFavorites(user.uid);
        if (!mounted) return;
        const normalized = Array.isArray(favs) ? favs.map((v) => String(v)) : [];
        setFavorites(normalized);
      } catch (_) {
        if (!mounted) return;
        setFavorites([]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [user?.uid]);

  // loadPortfolios comes from context

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadPortfolios();
    setRefreshing(false);
  }, [loadPortfolios]);


  const handlePortfolioPress = useCallback((portfolio) => {
    navigation.navigate('PropertyDetail', { portfolio, fromScreen: 'PortfolioList', onlyMine, showFavorites });
  }, [navigation, onlyMine, showFavorites]);

  const applyFilters = useCallback((newFilters) => {
    // Filtrelerin gerçekten değişip değişmediğini kontrol et
    const hasRealChanges = checkIfFiltersChanged(filters, newFilters);
    if (__DEV__) {
      console.log('🔍 [PortfolioList] Filtre değişikliği var mı?', hasRealChanges);
    }
    
    setFilters(newFilters);
    
    // Eğer gerçek bir değişiklik yoksa, hasAppliedFilters'i güncelleme
    if (!hasRealChanges) {
      if (__DEV__) {
        console.log('⚠️ [PortfolioList] Gerçek filtre değişikliği yok, hasAppliedFilters güncellenmiyor');
      }
      return;
    }
    
    setHasAppliedFilters(true);
    if (__DEV__) {
      console.log('✅ [PortfolioList] Filtreler uygulandı, hasAppliedFilters: true');
    }
  }, [filters, checkIfFiltersChanged]);

  const clearFilters = useCallback(() => {
    if (__DEV__) {
      console.log('🧹 [PortfolioList] Filtreler temizleniyor...');
    }
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
    if (__DEV__) {
      console.log('✅ [PortfolioList] Filtreler temizlendi, hasAppliedFilters: false');
    }
  }, []);

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

  const toggleFavorite = useCallback(async (portfolioId) => {
    try {
      if (!user?.uid || !portfolioId) return;
      const next = await togglePortfolioFavorite(user.uid, String(portfolioId));
      if (next && Array.isArray(next)) {
        setFavorites(next);
        const nowFav = next.includes(String(portfolioId));
        setToastKind(nowFav ? 'add' : 'remove');
        setToastText(nowFav ? 'Favorilere eklendi' : 'Favorilerden çıkarıldı');
        if (toastTimerRef.current) { try { clearTimeout(toastTimerRef.current); } catch {} }
        toastAnim.setValue(0);
        Animated.timing(toastAnim, { toValue: 1, duration: 160, useNativeDriver: true }).start();
        toastTimerRef.current = setTimeout(() => {
          Animated.timing(toastAnim, { toValue: 0, duration: 180, useNativeDriver: true }).start();
        }, 1200);
      }
    } catch (_) {}
  }, [user?.uid]);


  // Gelişmiş filtreleme mantığı - haritadaki ile aynı
  const isPointInPolygon = useCallback((point, polygon) => {
    const [x, y] = point;
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [xi, yi] = polygon[i];
      const [xj, yj] = polygon[j];
      const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }, []);

  const filteredPortfolios = useMemo(() => {
    let filtered = portfolios;

    // Sadece kullanıcının portföyleri isteniyorsa filtrele
    if (onlyMine && user?.uid) {
      filtered = filtered.filter(p => (p?.userId === user.uid) || (p?.ownerId === user.uid));
    }

    // Favori portföyleri göster
    if (showFavorites) {
      filtered = filtered.filter(portfolio => favorites.includes(String(portfolio.id)));
      return filtered;
    }

    // Önce kullanıcının şehir bilgisine göre filtrele (varsayılan)
    if (userProfile?.city && !filters.propertyType && !filters.listingType) {
      filtered = filtered.filter(portfolio => portfolio.city === userProfile.city);
    }

    // Gelişmiş filtreleme mantığı
    filtered = filtered.filter(portfolio => {
      // Fiyat filtresi (slider ile) - HER ZAMAN
      const portfolioPrice = Number(portfolio.price) || 0;
      if (portfolioPrice < filters.priceRange[0] || portfolioPrice > filters.priceRange[1]) {
        return false;
      }
      
      // İlan durumu filtresi (listingType/listingStatus uyumu)
      if (filters.listingType) {
        const listingStatusStr = String(portfolio.listingStatus || '').toLowerCase();
        const inferredFromStatus = listingStatusStr.includes('sat')
          ? 'Satılık'
          : (listingStatusStr.includes('kira') ? 'Kiralık' : '');
        const portfolioListingType = portfolio.listingType || inferredFromStatus;
        if (portfolioListingType !== filters.listingType) {
          return false;
        }
      }
      
      // Portföy tipi filtresi
      if (filters.propertyType && portfolio.propertyType !== filters.propertyType) {
        return false;
      }
      
      // DETAYLI FİLTRELER - SADECE DAİRE veya VİLLA için
      if (filters.propertyType === 'Daire' || filters.propertyType === 'Villa') {
        // m² filtresi (slider ile) - brüt öncelikli: grossSquareMeters -> squareMeters -> netSquareMeters -> area
        const portfolioArea = Number(
          (portfolio.grossSquareMeters ?? portfolio.squareMeters ?? portfolio.netSquareMeters ?? portfolio.area) || 0
        );
        if (portfolioArea < filters.areaRange[0] || portfolioArea > filters.areaRange[1]) {
          return false;
        }
        
        // Oda sayısı filtresi (multi-select) - rooms/roomCount fallback
        if (filters.rooms.length > 0) {
          const portfolioRooms = portfolio.rooms || portfolio.roomCount || '';
          if (!filters.rooms.includes(portfolioRooms)) {
            return false;
          }
        }
        
        // Bina yaşı filtresi (slider ile)
        const portfolioBuildingAge = Number(portfolio.buildingAge) || 0;
        if (portfolioBuildingAge < filters.buildingAgeRange[0] || portfolioBuildingAge > filters.buildingAgeRange[1]) {
          return false;
        }
        
        // Kat bilgileri filtresi (slider ile)
        const portfolioFloorNumber = Number((portfolio.floorNumber ?? portfolio.floor) || 0);
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
        if (filters.titleDeedStatus) {
          const portfolioDeedStatus = (portfolio.titleDeedStatus ?? portfolio.deedStatus) || '';
          if (portfolioDeedStatus !== filters.titleDeedStatus) return false;
        }
        
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
        
        // Isıtma tipi filtresi (heatingType/heating, normalize)
        if (filters.heatingType) {
          const rawHeating = String((portfolio.heatingType ?? portfolio.heating) || '').toLowerCase();
          const normalizeHeating = (v) => {
            const s = String(v || '').toLowerCase();
            if (s.includes('doğal') || s.includes('dogal') || s.includes('gaz') || s.includes('kombi')) return 'doğalgaz';
            if (s.includes('merkez')) return 'merkezi';
            if (s.includes('elektr')) return 'elektrik';
            if (s.includes('soba')) return 'soba';
            if (s.includes('katı') || s.includes('kati')) return 'katı yakıt';
            if (s.includes('klima')) return 'klima';
            if (s.includes('yok') || s === '' ) return 'yok';
            return s;
          };
          const portfolioHeatingNorm = normalizeHeating(rawHeating);
          const filterHeatingNorm = normalizeHeating(filters.heatingType);
          if (portfolioHeatingNorm !== filterHeatingNorm) return false;
        }
        
        // İskan durumu filtresi (occupancyStatus/deedStatus, normalize)
        if (filters.occupancyStatus) {
          const rawOcc = String((portfolio.occupancyStatus ?? portfolio.deedStatus) || '').toLowerCase();
          const normalizeOcc = (v) => {
            const s = String(v || '').toLowerCase();
            if (s.includes('inşaat') || s.includes('insaat')) return 'inşaat aşamasında';
            if (s.includes('iskan') && (s.includes('mevcut') || s.includes('var'))) return 'iskanlı';
            if (s.includes('iskan') && s.includes('yok')) return 'iskansız';
            if (s.includes('iskanlı') || s.includes('iskanli')) return 'iskanlı';
            if (s.includes('iskansız') || s.includes('iskansiz')) return 'iskansız';
            return s;
          };
          const portfolioOccNorm = normalizeOcc(rawOcc);
          const filterOccNorm = normalizeOcc(filters.occupancyStatus);
          if (portfolioOccNorm !== filterOccNorm) return false;
        }
      }
      
      return true;
    });

    if (drawnPolygon && Array.isArray(drawnPolygon) && drawnPolygon.length >= 3) {
      const poly = drawnPolygon;
      filtered = filtered.filter((p) => {
        const lng = Number(p?.coordinates?.longitude);
        const lat = Number(p?.coordinates?.latitude);
        if (Number.isNaN(lng) || Number.isNaN(lat)) return false;
        return isPointInPolygon([lng, lat], poly);
      });
    }

    return filtered;
  }, [portfolios, user?.uid, userProfile?.city, filters, showFavorites, favorites, drawnPolygon, isPointInPolygon, onlyMine]);

  const formatPrice = useCallback((price) => {
    if (!price && price !== 0) {return 'Fiyat belirtilmemiş';}
    const tr = new Intl.NumberFormat('tr-TR').format(Number(price) || 0);
    return `${tr}₺`;
  }, []);

  const textColor = isDark ? theme.colors.white : theme.colors.navy;

  const renderPortfolioCard = useCallback(({ item, index }) => {
    const isFav = favorites.includes(String(item.id));
    return (
    <View style={styles.portfolioCardContainer}>
      <ListingCard
        listing={item}
        onPress={() => handlePortfolioPress(item)}
        isEditable={false}
        showPublishBadge={onlyMine} // Sadece kendi portföyleri ise badge göster
        isOwnerCard={!onlyMine && (item.userId === user?.uid || item.ownerId === user?.uid)} // Sadece genel havuzda kendi portföyleri için kırmızı çerçeve
      />
        <TouchableOpacity
          style={[
            styles.favoriteButton,
            isFav ? styles.favoriteButtonActive : styles.favoriteButtonInactive
          ]}
          onPress={() => toggleFavorite(item.id)}
          accessibilityRole="button"
          accessibilityLabel={isFav ? 'Favoriden çıkar' : 'Favorilere ekle'}
          activeOpacity={0.85}
        >
          <Image
            source={require('../assets/images/icons/Favorite_fill.png')}
            style={[styles.favoriteIcon, isFav ? styles.favoriteIconActive : styles.favoriteIconInactive]}
          />
        </TouchableOpacity>
    </View>
  )}, [styles.portfolioCardContainer, styles.favoriteButton, styles.favoriteIcon, handlePortfolioPress, onlyMine, user?.uid, favorites, toggleFavorite]);

  const renderEmptyComponent = useCallback(() => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyIcon}>
        {showFavorites ? '❤️' : '🏠'}
      </Text>
      <Text style={styles.emptyText}>
        {showFavorites
          ? 'Henüz favori portföyünüz yok'
          : (userProfile?.city ? `${userProfile.city} şehrinde portföy bulunamadı` : 'Henüz portföy bulunamadı')
        }
      </Text>
      <Text style={styles.emptySubtext}>
        {showFavorites
          ? 'Beğendiğiniz portföyleri favorilere ekleyin'
          : (userProfile?.city ? 'Diğer şehirlerdeki portföyleri görmek için profil bilgilerinizi güncelleyin' : 'Filtrelerinizi değiştirmeyi deneyin')
        }
      </Text>
    </View>
  ), [showFavorites, userProfile?.city]);


  return (
    <SafeAreaView edges={['left','right','bottom']} style={styles.container}>
      <ImageBackground
        source={isDark ? require('../assets/images/dark-bg2.png') : require('../assets/images/light-bg.jpg')}
        defaultSource={isDark ? require('../assets/images/dark-bg2.png') : require('../assets/images/light-bg.jpg')}
        fadeDuration={0}
        style={{ flex: 1, backgroundColor: isDark ? '#071317' : '#FFFFFF' }}
        resizeMode="cover"
      >

        {/* Header (static) */}
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 0) + 12 }]} pointerEvents="box-none">
          <TouchableOpacity
            style={styles.headerButtonBack}
            onPress={() => {
              if (showFavorites) {
                setShowFavorites(false);
                return;
              }
              if (onlyMine) {
                // Portföylerim modunda her zaman Ana Sayfa'ya dön
                navigation.navigate('Ana Sayfa', { screen: 'HomeScreen' });
                return;
              }
              // fromScreen'e göre doğru yere git
              if (fromScreen === 'Home') {
                navigation.goBack(); // goBack daha hızlı
              } else if (navigation.canGoBack()) {
                navigation.goBack();
              } else {
                navigation.navigate('HomeScreen');
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

          <View style={styles.headerContent}>
            <Text style={styles.mainTitle}>
              {showFavorites ? 'Favori Portföyler' : (onlyMine ? 'Portföylerim' : 'Portföy Havuzu')}
            </Text>
            <Text style={[styles.mainSubtitle, { color: isDark ? theme.colors.white : theme.colors.navy }]}>
              {showFavorites
                ? `${favorites.length} favori portföy`
                : (onlyMine
                    ? `${filteredPortfolios.length} Portföy bulundu`
                    : (userProfile?.city && !filters.city ? `${userProfile.city} şehrindeki portföyler` : 'Tüm portföyler')
                  )
              }
            </Text>
          </View>

          <View style={styles.headerRightButtons}>
            {!showFavorites && (
              <TouchableOpacity
                style={[styles.headerButton, getActiveFiltersCount() > 0 && styles.headerButtonActive]}
                onPress={() => setShowFilters(true)}
                accessibilityRole="button"
                accessibilityLabel="Filtrele"
              >
                <Image
                  source={require('../assets/images/icons/filtrele.png')}
                  style={styles.headerButtonIconOnly}
                />
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.headerButton, showFavorites && styles.headerButtonActive]}
              onPress={() => {
                if (onlyMine) {
                  if (!showFavorites) {
                    // MyPortfolios modunda favorilere geçişi yeni bir route olarak aç
                    try {
                      navigation.push('MyPortfolios', { onlyMine: true, showFavorites: true });
                    } catch {
                      setShowFavorites(true);
                    }
                  } else {
                    // Favorilerden geri: mümkünse pop
                    if (navigation.canGoBack()) {
                      navigation.goBack();
                    } else {
                      setShowFavorites(false);
                    }
                  }
                } else {
                  setShowFavorites(!showFavorites);
                }
              }}
              accessibilityRole="button"
              accessibilityLabel="Favoriler"
            >
              <Image
                source={require('../assets/images/icons/Favorite_fill.png')}
                style={styles.headerButtonIconOnly}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => navigation.navigate('PortfolioMap', { onlyMine })}
              accessibilityRole="button"
              accessibilityLabel="Harita"
            >
              <Image
                source={require('../assets/images/icons/harita.png')}
                style={styles.headerButtonIconOnly}
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Spacer: header yüksekliği kadar boşluk (insets.top + 12 + 37 + spacing.lg) */}
        <View style={{ height: Math.max(insets.top, 0) + 12 + 37 + ((currentTheme?.spacing && currentTheme.spacing.lg) ? currentTheme.spacing.lg : 16) }} />

        {/* Clear Filters Button - Separate Row */}
        {!showFavorites && (getActiveFiltersCount() > 0 || (drawnPolygon && drawnPolygon.length >= 3)) && (
          <View style={[styles.clearFiltersContainer, { flexDirection: 'row', gap: theme.spacing.sm }]}>
            {getActiveFiltersCount() > 0 && (
              <TouchableOpacity
                style={styles.clearButton}
                onPress={clearFilters}
              >
                <Text style={styles.clearButtonText}>Temizle ({getActiveFiltersCount()})</Text>
              </TouchableOpacity>
            )}
            {drawnPolygon && drawnPolygon.length >= 3 && (
              <TouchableOpacity
                style={styles.clearButton}
                onPress={() => setDrawnPolygon(null)}
              >
                <Text style={styles.clearButtonText}>Çizimi Temizle</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Liste Görünümü (animated) */}
        <Animatable.View ref={viewRef} style={{ flex: 1 }} useNativeDriver>
          <GlassmorphismView
            style={styles.backgroundContainer}
            blurEnabled={false}
            config={backgroundContainerConfig}
          >
            <FlatList
              data={filteredPortfolios}
              renderItem={renderPortfolioCard}
              keyExtractor={(item) => String(item.id)}
              numColumns={2}
              columnWrapperStyle={styles.portfolioRow}
              contentContainerStyle={styles.listContainer}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={loading ? null : renderEmptyComponent}
              refreshing={refreshing}
              onRefresh={onRefresh}
              initialNumToRender={4}
              maxToRenderPerBatch={6}
              updateCellsBatchingPeriod={50}
              windowSize={12}
              removeClippedSubviews={true}
            />
          </GlassmorphismView>
        </Animatable.View>


        {!showFavorites && (
          <AdvancedFiltersModal
            visible={showFilters}
            onClose={() => setShowFilters(false)}
            onApply={applyFilters}
            onClear={clearFilters}
            initialFilters={filters}
            portfolios={portfolios}
          />
        )}
      </ImageBackground>
      {/* Favori Toast */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: Math.max(insets.top, 0) + 12 + 37 + ((currentTheme?.spacing && currentTheme.spacing.lg) ? currentTheme.spacing.lg : 16) + 8,
          alignItems: 'center',
          opacity: toastAnim,
          transform: [
            {
              translateY: toastAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [-12, 0],
              }),
            },
          ],
          zIndex: 1000,
        }}
      >
        <View
          style={[
            styles.toastContent,
            { backgroundColor: toastKind === 'add' ? (currentTheme.colors.success || '#22C55E') : (currentTheme.colors.error || '#DC143C') },
          ]}
        >
          <Text style={styles.toastText}>{toastText}</Text>
        </View>
      </Animated.View>
    </SafeAreaView>
  );
};

const stylesFactory = (theme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent', // Arka plan resminin görünmesi için şeffaf yapıldı
  },
  
  backgroundContainer: {
    flex: 1,
    // backgroundColor: theme.colors.background, // Glassmorphism tarafından yönetilecek
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.sm,
    borderRadius: theme.borderRadius.xl,
    paddingTop: theme.spacing.sm, // Kartların üstten boşluğu
    overflow: 'hidden', // Köşelerin düzgün görünmesi için
  },


  listContainer: {
    paddingHorizontal: theme.spacing.md, // Yatay padding buraya kaydırıldı
    paddingBottom: 100,
    backgroundColor: 'transparent',
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    /* üst padding runtime'da insets.top + 12 olarak verilecek */
    paddingBottom: theme.spacing.lg,
    backgroundColor: 'transparent',
    borderBottomWidth: 0,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    minHeight: 60,
  },

  headerButton: {
    backgroundColor: theme.colors.error,
    width: 37,
    height: 37,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0,
    display: 'flex',
  },

  headerButtonBack: {
    backgroundColor: theme.colors.error,
    width: 37,
    height: 37,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 0,
  },

  headerButtonText: {
    color: theme.colors.white,
    fontSize: 14,
    fontWeight: '600',
  },

  headerButtonIcon: {
    width: 20,
    height: 20,
    marginRight: 8,
    tintColor: theme.colors.white,
  },

  headerButtonIconOnly: {
    width: 24,
    height: 24,
    tintColor: theme.colors.white,
    resizeMode: 'contain',
    alignSelf: 'center',
  },

  headerButtonIconBack: {
    width: 16,
    height: 16,
    resizeMode: 'contain',
    tintColor: theme.colors.white,
  },

  headerButtonActive: {
    backgroundColor: '#2196F3' + '4D', // Mavi renk - filtreleme aktif olduğunda
    borderColor: '#2196F3',
  },

  headerContent: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: theme.spacing.lg,
  },

  mainTitle: {
    fontSize: theme.fontSizes.xxxl,
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.white,
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

  portfolioRow: {
    justifyContent: 'space-between',
    marginBottom: theme.spacing.lg,
    paddingHorizontal: 0,
  },

  portfolioCardContainer: {
    width: '47%',
    marginBottom: theme.spacing.md,
    position: 'relative',
  },

  wrapper: {
    marginBottom: theme.spacing.xs,
    shadowColor: theme.colors.white,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 6,
    borderRadius: theme.borderRadius.lg,
  },

  cardContainer: {
    borderRadius: theme.borderRadius.lg,
    overflow: 'hidden',
    width: '100%',
    marginBottom: 0,
    // Dış gölgeyi wrapper aldı
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  imageContainer: {
    position: 'relative',
    width: '100%',
    aspectRatio: 16 / 10,
    borderRadius: 0,
  },
  image: {
    width: '100%',
    height: '100%',
    borderTopLeftRadius: theme.borderRadius.lg,
    borderTopRightRadius: theme.borderRadius.lg,
  },
  placeholderImage: {
    width: '100%',
    height: '100%',
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    borderTopLeftRadius: theme.borderRadius.lg,
    borderTopRightRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  placeholderIcon: {
    marginBottom: theme.spacing.xs,
  },
  placeholderText: {
    fontSize: 28,
    opacity: 0.6,
  },
  placeholderLabel: {
    fontSize: theme.fontSizes.sm,
    color: theme.colors.textSecondary,
    opacity: 0.8,
    fontWeight: theme.fontWeights.medium,
  },
  content: {
    padding: theme.spacing.lg,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  roomBadge: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.sm,
  },
  roomBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.white,
  },
  neighborhoodPill: {
    maxWidth: '65%',
    paddingHorizontal: 0,
    paddingVertical: 0,
    borderRadius: 0,
    backgroundColor: 'transparent',
  },
  neighborhoodText: {
    marginLeft: theme.spacing.sm,
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.text,
  },
  details: {
    marginBottom: theme.spacing.sm,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  detailIconImage: {
    width: 16,
    height: 16,
    tintColor: theme.colors.primary,
    marginRight: theme.spacing.sm,
  },
  detailText: {
    fontSize: 13,
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.primary,
  },
  listingStatus: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.sm,
  },
  listingStatusText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.white,
  },
  footerPrice: {
    fontSize: 14,
    fontWeight: '700',
  },
  favoriteButton: {
    position: 'absolute',
    top: theme.spacing.sm,
    right: theme.spacing.sm,
    backgroundColor: theme.colors.primary + '80', // %50 saydamlık
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
  favoriteButtonActive: {
    backgroundColor: theme.colors.primary,
    borderWidth: 0,
  },
  favoriteButtonInactive: {
    backgroundColor: theme.colors.primary + '20',
  },
  favoriteIconActive: {
    tintColor: theme.colors.white,
    opacity: 1,
  },
  favoriteIconInactive: {
    tintColor: theme.colors.white,
    opacity: 0.4,
  },
  toastContent: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 16,
    ...theme.shadows.medium,
  },
  toastText: {
    color: theme.colors.white,
    fontSize: theme.fontSizes.md,
    fontWeight: theme.fontWeights.bold,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: theme.spacing.xxl,
    backgroundColor: theme.colors.primary + 'D9',
    borderRadius: theme.borderRadius.lg,
    padding: 30,
    marginTop: theme.spacing.lg,
    ...theme.shadows.large,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: theme.spacing.md,
  },
  emptyText: {
    color: theme.colors.white,
    fontSize: theme.fontSizes.xxl,
    fontWeight: theme.fontWeights.semibold,
    textAlign: 'center',
    marginBottom: theme.spacing.sm,
  },
  emptySubtext: {
    color: theme.colors.textWhite + 'CC',
    fontSize: theme.fontSizes.md,
    textAlign: 'center',
    paddingHorizontal: theme.spacing.xxl,
  },

});

export default PortfolioList;
