// src/components/AdvancedFiltersModal.js
// Ortak gelişmiş filtreleme modalı - PortfolioList ve PortfolioMap'te kullanılır
import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Animated,
  LayoutAnimation,
  Platform,
  Modal,
  ScrollView,
  PanResponder,
  useColorScheme,
} from 'react-native';
import { theme } from '../theme/theme';
import { usePortfolioSearch } from '../context/PortfolioSearchContext';
import GlassmorphismView from './GlassmorphismView'; // Import et

// Price Range Slider Component
const RangeSlider = ({ label, field, min, max, step, formatValue, formData, handleSliderChange, styles }) => {
  const currentValues = formData[field] || [min, max];
  const minValue = typeof currentValues[0] === 'number' ? currentValues[0] : min;
  const maxValue = typeof currentValues[1] === 'number' ? currentValues[1] : max;

  const [trackWidth, setTrackWidth] = useState(280);
  const [activeThumb, setActiveThumb] = useState(null);
  const lastUpdateRef = useRef(0);
  const updateTimeoutRef = useRef(null);
  const trackRef = useRef(null);
  const trackPositionRef = useRef({ x: 0, y: 0, width: 280, height: 0, pageX: 0, pageY: 0 });
  
  // Animasyon için
  const minLabelScale = useRef(new Animated.Value(1)).current;
  const maxLabelScale = useRef(new Animated.Value(1)).current;

  // NaN kontrolü ile percentage hesaplama
  const calculatePercentage = (value) => {
    if (max === min) return value === min ? 0 : 100;
    const result = ((value - min) / (max - min)) * 100;
    if (!isFinite(result) || isNaN(result)) return 0;
    return Math.max(0, Math.min(100, result));
  };
  
  const minPercentage = calculatePercentage(minValue);
  const maxPercentage = calculatePercentage(maxValue);

  // Aktif thumb değiştiğinde animasyon
  useEffect(() => {
    if (activeThumb === 'min') {
      Animated.spring(minLabelScale, {
        toValue: 1.5,
        tension: 100,
        friction: 7,
        useNativeDriver: true,
      }).start();
      Animated.spring(maxLabelScale, {
        toValue: 1,
        tension: 100,
        friction: 7,
        useNativeDriver: true,
      }).start();
    } else if (activeThumb === 'max') {
      Animated.spring(minLabelScale, {
        toValue: 1,
        tension: 100,
        friction: 7,
        useNativeDriver: true,
      }).start();
      Animated.spring(maxLabelScale, {
        toValue: 1.5,
        tension: 100,
        friction: 7,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.spring(minLabelScale, {
        toValue: 1,
        tension: 100,
        friction: 7,
        useNativeDriver: true,
      }).start();
      Animated.spring(maxLabelScale, {
        toValue: 1,
        tension: 100,
        friction: 7,
        useNativeDriver: true,
      }).start();
    }
  }, [activeThumb, minLabelScale, maxLabelScale]);

  const calculateValueFromPosition = useCallback((x) => {
    const thumbPadding = 14;
    const effectiveWidth = trackWidth - (thumbPadding * 2);
    if (effectiveWidth <= 0) return min;
    
    const percentage = Math.max(0, Math.min(1, (x - thumbPadding) / effectiveWidth));
    const rawValue = min + (percentage * (max - min));
    const steppedValue = Math.round(rawValue / step) * step;
    const clampedValue = Math.max(min, Math.min(max, steppedValue));
    
    if (!isFinite(clampedValue) || isNaN(clampedValue)) return min;
    return clampedValue;
  }, [trackWidth, min, max, step]);

  const debouncedSliderChange = useCallback((fieldParam, values) => {
    const now = Date.now();
    const debounceTime = field === 'priceRange' ? 0 : 16;
    
    if (now - lastUpdateRef.current > debounceTime) {
      lastUpdateRef.current = now;
      handleSliderChange(fieldParam, values);
    } else {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
      updateTimeoutRef.current = setTimeout(() => {
        lastUpdateRef.current = Date.now();
        handleSliderChange(fieldParam, values);
      }, debounceTime);
    }
  }, [handleSliderChange, field]);

  const handleTrackPress = useCallback((event) => {
    const { locationX } = event.nativeEvent;
    const newValue = calculateValueFromPosition(locationX);

    const minThumbPosition = Math.max(0, Math.min(trackWidth - 28, (minPercentage / 100) * (trackWidth - 28)));
    const maxThumbPosition = Math.max(0, Math.min(trackWidth - 28, (maxPercentage / 100) * (trackWidth - 28)));

    const minDistance = Math.abs(locationX - minThumbPosition);
    const maxDistance = Math.abs(locationX - maxThumbPosition);

    if (minDistance <= maxDistance) {
      const newMinValue = Math.min(newValue, maxValue - step);
      debouncedSliderChange(field, [newMinValue, maxValue]);
    } else {
      const newMaxValue = Math.max(newValue, minValue + step);
      debouncedSliderChange(field, [minValue, newMaxValue]);
    }
  }, [calculateValueFromPosition, minPercentage, maxPercentage, trackWidth, minValue, maxValue, step, field, debouncedSliderChange]);

  const createPanResponder = useCallback((thumbType) => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onShouldBlockNativeResponder: () => true,
    onPanResponderGrant: () => {
      setActiveThumb(thumbType);
      if (trackRef.current) {
        trackRef.current.measure((x, y, w, h, pageX, pageY) => {
          trackPositionRef.current = { x, y, width: w, height: h, pageX, pageY };
        });
      }
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
        updateTimeoutRef.current = null;
      }
    },
    onPanResponderMove: (event, gestureState) => {
      const { moveX } = gestureState;
      const { pageX } = trackPositionRef.current;
      const relativeX = moveX - pageX;
      const newValue = calculateValueFromPosition(relativeX);

      if (thumbType === 'min') {
        let newMinValue = Math.max(min, newValue);
        if (newMinValue > maxValue - step) {
          newMinValue = maxValue - step;
        }
        newMinValue = Math.round(newMinValue / step) * step;
        newMinValue = Math.max(min, newMinValue);
        
        if (newMinValue !== minValue) {
          handleSliderChange(field, [newMinValue, maxValue]);
        }
      } else {
        let newMaxValue = Math.min(max, newValue);
        if (newMaxValue < minValue + step) {
          newMaxValue = minValue + step;
        }
        newMaxValue = Math.round(newMaxValue / step) * step;
        newMaxValue = Math.min(max, newMaxValue);
        
        if (newMaxValue !== maxValue) {
          handleSliderChange(field, [minValue, newMaxValue]);
        }
      }
    },
    onPanResponderRelease: () => {
      setActiveThumb(null);
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
        updateTimeoutRef.current = null;
      }
    },
  }), [min, max, step, minValue, maxValue, field, handleSliderChange, calculateValueFromPosition]);

  const minPanResponder = createPanResponder('min');
  const maxPanResponder = createPanResponder('max');

  const handleTrackLayout = useCallback((event) => {
    const { width } = event.nativeEvent.layout;
    setTrackWidth(width);
    if (trackRef.current) {
      trackRef.current.measure((x, y, w, h, pageX, pageY) => {
        trackPositionRef.current = { x, y, width: w, height: h, pageX, pageY };
      });
    }
  }, []);

  useEffect(() => {
    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, []);

  if (trackWidth < 100) {
    return (
      <View style={styles.sliderContainer}>
        <View style={styles.rangeLabels}>
          <View style={styles.rangeLabelContainer}>
            <Text style={styles.rangeLabel}>{String(formatValue(minValue) || '')}</Text>
          </View>
          <View style={[styles.rangeLabelContainer, { alignItems: 'flex-end' }]}>
            <Text style={styles.rangeLabel}>{String(formatValue(maxValue) || '')}</Text>
          </View>
        </View>
        <View 
          ref={trackRef}
          style={styles.sliderTrack}
          onLayout={handleTrackLayout}
        />
      </View>
    );
  }

  return (
    <View style={styles.sliderContainer}>
      <View style={styles.rangeLabels}>
        <View style={styles.rangeLabelContainer}>
          <Animated.Text 
            style={[
              styles.rangeLabel,
              {
                transform: [
                  { scale: minLabelScale },
                  { 
                    translateX: minLabelScale.interpolate({
                      inputRange: [1, 1.5],
                      outputRange: [0, 20],
                    })
                  },
                ],
              }
            ]}
          >
            {String(formatValue(minValue) || '')}
          </Animated.Text>
        </View>
        <View style={[styles.rangeLabelContainer, { alignItems: 'flex-end' }]}>
          <Animated.Text 
            style={[
              styles.rangeLabel,
              {
                transform: [
                  { scale: maxLabelScale },
                  { 
                    translateX: maxLabelScale.interpolate({
                      inputRange: [1, 1.5],
                      outputRange: [0, -20],
                    })
                  },
                ],
              }
            ]}
          >
            {String(formatValue(maxValue) || '')}
          </Animated.Text>
        </View>
      </View>
      <TouchableOpacity
        ref={trackRef}
        style={styles.sliderTrack}
        onPress={handleTrackPress}
        activeOpacity={1}
        onLayout={handleTrackLayout}
      >
        <View
          style={[
            styles.sliderProgress,
            {
              left: Math.max(0, Math.min(trackWidth - 28, (minPercentage / 100) * (trackWidth - 28))) + 14,
              width: Math.max(0, Math.min(trackWidth, ((maxPercentage - minPercentage) / 100) * (trackWidth - 28))),
            },
          ]}
        />

        <View
          style={[
            styles.sliderThumb,
            {
              left: Math.max(0, Math.min(trackWidth - 28, (minPercentage / 100) * (trackWidth - 28))),
            },
            activeThumb === 'min' && styles.sliderThumbActive,
          ]}
          {...minPanResponder.panHandlers}
        />

        <View
          style={[
            styles.sliderThumb,
            {
              left: Math.max(0, Math.min(trackWidth - 28, (maxPercentage / 100) * (trackWidth - 28))),
            },
            activeThumb === 'max' && styles.sliderThumbActive,
          ]}
          {...maxPanResponder.panHandlers}
        />
      </TouchableOpacity>
    </View>
  );
};

// Icon'lar
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
  'Banyo Sayısı': require('../assets/images/icons/bathroom.png'),
  'Balkon Sayısı': require('../assets/images/icons/Balcony.png'),
  'Isıtma Tipi': require('../assets/images/icons/boiler.png'),
  'İskan Durumu': require('../assets/images/icons/type.png'),
};

// Ana Modal Component
const AdvancedFiltersModal = ({ visible, onClose, onApply, onClear, initialFilters = {}, portfolios = [] }) => {
  const draftModalCardConfig = {
    overlayColor: 'rgba(224, 220, 220, 0.81)',
    startColor: 'rgb(17, 36, 49)',
    endColor: 'rgba(17, 36, 49, 0.55)',
    gradientAlpha: 1,
    gradientDirection: 170,
    gradientSpread: 50,
    ditherStrength: 4.0,
  };
  const {
    filters: storeFilters,
    setFilters: setStoreFilters,
    hasAppliedFilters,
    setHasAppliedFilters,
    portfolios: storePortfolios,
  } = usePortfolioSearch() || {};
  const isDark = useColorScheme() === 'dark';
  const modalSlideAnim = useRef(new Animated.Value(0)).current;
  const modalFadeAnim = useRef(new Animated.Value(0)).current;
  const [showMoreFilters, setShowMoreFilters] = useState(false);

  // Android LayoutAnimation setup
  useEffect(() => {
    if (Platform.OS === 'android') {
      try {
        const { UIManager } = require('react-native');
        if (UIManager.setLayoutAnimationEnabledExperimental) {
          UIManager.setLayoutAnimationEnabledExperimental(true);
        }
      } catch (error) {
        // Ignore
      }
    }
  }, []);

  // Filtre state'i
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
    ...(storeFilters || initialFilters),
  });

  // Modal açıldığında initialFilters'ı güncelle
  useEffect(() => {
    if (visible && storeFilters) {
      setFilters(prevFilters => ({ ...prevFilters, ...storeFilters }));
    }
  }, [visible, storeFilters]);

  // Modal açılma animasyonu
  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(modalFadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(modalSlideAnim, {
          toValue: 1,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, modalFadeAnim, modalSlideAnim]);

  // Modal kapanma
  const handleClose = useCallback(() => {
    Animated.parallel([
      Animated.timing(modalFadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(modalSlideAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onClose();
    });
  }, [modalFadeAnim, modalSlideAnim, onClose]);

  // Slider değişimi
  const handleSliderChange = useCallback((field, value) => {
    setFilters(prev => {
      if (JSON.stringify(prev[field]) === JSON.stringify(value)) {
        return prev;
      }
      return { ...prev, [field]: value };
    });
  }, []);

  // Filtrelenmiş portföy sayısını hesapla
  const filteredCount = useMemo(() => {
    const src = portfolios && portfolios.length ? portfolios : (storePortfolios || []);
    if (!src || src.length === 0) return 0;

    const filtered = src.filter(portfolio => {
      // Fiyat filtresi
      const portfolioPrice = Number(portfolio.price) || 0;
      if (portfolioPrice < filters.priceRange[0] || portfolioPrice > filters.priceRange[1]) {
        return false;
      }
      
      // İlan durumu filtresi
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
      
      // Detaylı filtreler - sadece Daire veya Villa için
      if (filters.propertyType === 'Daire' || filters.propertyType === 'Villa') {
        // m² filtresi (brüt öncelikli: grossSquareMeters -> squareMeters -> netSquareMeters -> area)
        const portfolioArea = Number(
          (portfolio.grossSquareMeters ?? portfolio.squareMeters ?? portfolio.netSquareMeters ?? portfolio.area) || 0
        );
        if (portfolioArea < filters.areaRange[0] || portfolioArea > filters.areaRange[1]) {
          return false;
        }
        
        // Oda sayısı filtresi (rooms/roomCount fallback)
        if (filters.rooms.length > 0) {
          const portfolioRooms = portfolio.rooms || portfolio.roomCount || '';
          if (!filters.rooms.includes(portfolioRooms)) {
            return false;
          }
        }
        
        // Bina yaşı filtresi
        const portfolioBuildingAge = Number(portfolio.buildingAge) || 0;
        if (portfolioBuildingAge < filters.buildingAgeRange[0] || portfolioBuildingAge > filters.buildingAgeRange[1]) {
          return false;
        }
        
        // Kat bilgileri filtresi
        const portfolioFloorNumber = Number((portfolio.floorNumber ?? portfolio.floor) || 0);
        const portfolioTotalFloors = Number(portfolio.totalFloors) || 0;
        if (portfolioFloorNumber < filters.floorNumberRange[0] || portfolioFloorNumber > filters.floorNumberRange[1]) {
          return false;
        }
        if (portfolioTotalFloors < filters.totalFloorsRange[0] || portfolioTotalFloors > filters.totalFloorsRange[1]) {
          return false;
        }
        
        // Boolean filtreler
        if (filters.parentalBathroom && !portfolio.parentBathroom) return false;
        if (filters.exchange && !portfolio.exchange) return false;
        if (filters.kitchenType && portfolio.kitchenType !== filters.kitchenType) return false;
        if (filters.usageStatus && portfolio.usageStatus !== filters.usageStatus) return false;
        if (filters.titleDeedStatus) {
          const portfolioDeedStatus = (portfolio.titleDeedStatus ?? portfolio.deedStatus) || '';
          if (portfolioDeedStatus !== filters.titleDeedStatus) return false;
        }
        
        // Daha fazla filtreler
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

    return filtered.length;
  }, [portfolios, filters]);

  // Format fonksiyonları
  const formatPriceForSlider = useCallback((price) => {
    return new Intl.NumberFormat('tr-TR').format(price) + ' ₺';
  }, []);

  const formatArea = useCallback((area) => {
    if (isNaN(area) || area === null || area === undefined) {
      return '0 m²';
    }
    return area + ' m²';
  }, []);

  const formatAge = useCallback((age) => {
    if (isNaN(age) || age === null || age === undefined) {
      return '0 yıl';
    }
    return age + ' yıl';
  }, []);

  const formatFloor = useCallback((floor) => {
    if (isNaN(floor) || floor === null || floor === undefined) {
      return '0';
    }
    return String(floor);
  }, []);

  // Label renderer
  const renderFilterLabel = useCallback((label) => (
    <View style={styles.filterLabelRow}>
      {FILTER_ICONS[label] && (
        <Image source={FILTER_ICONS[label]} style={styles.filterLabelIcon} />
      )}
      <Text style={styles.filterSectionTitle}>{label}</Text>
    </View>
  ), []);

  // Filtreleri temizle
  const handleClear = useCallback(() => {
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
    setShowMoreFilters(false);
    
    // Store'a yaz
    setStoreFilters && setStoreFilters(defaultFilters);
    setHasAppliedFilters && setHasAppliedFilters(false);
    // Parent'a bildir (opsiyonel)
    onClear && onClear();
  }, [onClear]);

  // Filtreleri uygula
  const handleApply = useCallback(() => {
    setStoreFilters && setStoreFilters(filters);
    setHasAppliedFilters && setHasAppliedFilters(true);
    onApply && onApply(filters);
    handleClose();
  }, [filters, onApply, handleClose, setStoreFilters, setHasAppliedFilters]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      statusBarTranslucent={true}
      onRequestClose={handleClose}
    >
      <View style={styles.filterModalWrapper} pointerEvents="box-none">
        <TouchableOpacity 
          style={styles.filterModalBackdrop}
          activeOpacity={1}
          onPress={handleClose}
        />
        
        <Animated.View 
          style={[
            styles.filterModalOverlay,
            {
              opacity: modalFadeAnim,
              transform: [
                {
                  translateY: modalSlideAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [300, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <GlassmorphismView 
            style={styles.filterModalContent}
            config={isDark ? draftModalCardConfig : { ...draftModalCardConfig, startColor: '#FFFFFF', endColor: '#F5F6F8' }}
            borderRadius={20}
          >
            {/* Header - NotificationOverlay ile uyumlu yapı */}
            <View style={styles.filterModalHeader}>
              <View style={styles.filterTitleContainer}>
                <Image
                  source={require('../assets/images/icons/filtrele.png')}
                  style={styles.filterTitleIcon}
                />
                <Text style={[styles.filterModalTitle, { color: isDark ? '#FFFFFF' : '#1a202c' }]}>Portföy Filtrele</Text>
              </View>
              {/* Sağ üst geri/kapama */}
              <View style={styles.headerRightClose}>
                <TouchableOpacity
                  style={styles.closeButton}
                  onPress={handleClose}
                >
                  <Image
                    source={require('../assets/images/icons/close.png')}
                    style={styles.closeButtonIcon}
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* Ayırıcı */}
            <View style={[styles.headerDivider, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)' }]} />

            {/* Filtre İçeriği */}
            <ScrollView 
              style={styles.filterModalBody}
              contentContainerStyle={{ paddingBottom: 120 }}
              showsVerticalScrollIndicator={false}
              removeClippedSubviews={true}
              scrollEventThrottle={16}
              nestedScrollEnabled={true}
              keyboardShouldPersistTaps="handled"
              bounces={true}
              alwaysBounceVertical={false}
              directionalLockEnabled={true}
              decelerationRate="normal"
            >
              {/* Fiyat Aralığı */}
              <View style={styles.filterSection}>
                {renderFilterLabel('Fiyat Aralığı')}
                <RangeSlider
                  label=""
                  field="priceRange"
                  min={0}
                  max={20000000}
                  step={100000}
                  formatValue={formatPriceForSlider}
                  formData={filters}
                  handleSliderChange={handleSliderChange}
                  styles={styles}
                />
              </View>

              <View style={styles.crimsonDivider} />

              {/* İlan Durumu */}
              <View style={styles.filterSection}>
                {renderFilterLabel('İlan Durumu')}
                <View style={styles.filterOptionsRow}>
                  <TouchableOpacity
                    style={[styles.filterOption, filters.listingType === 'Satılık' && styles.filterOptionActive]}
                    onPress={() => setFilters({...filters, listingType: 'Satılık'})}
                  >
                    <Text style={[styles.filterOptionText, filters.listingType === 'Satılık' && styles.filterOptionTextActive]}>
                      Satılık
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.filterOption, filters.listingType === 'Kiralık' && styles.filterOptionActive]}
                    onPress={() => setFilters({...filters, listingType: 'Kiralık'})}
                  >
                    <Text style={[styles.filterOptionText, filters.listingType === 'Kiralık' && styles.filterOptionTextActive]}>
                      Kiralık
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.crimsonDivider} />

              {/* Portföy Tipi */}
              <View style={styles.filterSection}>
                {renderFilterLabel('Portföy Tipi')}
                <View style={styles.filterOptionsWrap}>
                  {['Daire', 'Villa', 'İş Yeri', 'Arsa', 'Depo', 'Fabrika'].map((type) => (
                    <TouchableOpacity
                      key={type}
                      style={[styles.filterChip, filters.propertyType === type && styles.filterChipActive]}
                      onPress={() => {
                        LayoutAnimation.configureNext(
                          LayoutAnimation.create(
                            250,
                            LayoutAnimation.Types.easeInEaseOut,
                            LayoutAnimation.Properties.opacity
                          )
                        );
                        
                        const newFilters = {...filters, propertyType: type};
                        
                        if (type !== 'Daire' && type !== 'Villa') {
                          newFilters.rooms = [];
                          newFilters.areaRange = [0, 500];
                          newFilters.buildingAgeRange = [0, 50];
                          newFilters.totalFloorsRange = [0, 50];
                          newFilters.floorNumberRange = [0, 50];
                          newFilters.parentalBathroom = false;
                          newFilters.exchange = false;
                          newFilters.kitchenType = '';
                          newFilters.usageStatus = '';
                          newFilters.titleDeedStatus = '';
                          newFilters.bathroomCount = '';
                          newFilters.balconyCount = '';
                          newFilters.hasParking = false;
                          newFilters.hasGlassBalcony = false;
                          newFilters.hasDressingRoom = false;
                          newFilters.isFurnished = false;
                          newFilters.heatingType = '';
                          newFilters.occupancyStatus = '';
                          setShowMoreFilters(false);
                        }
                        
                        setFilters(newFilters);
                      }}
                    >
                      <Text style={[styles.filterChipText, filters.propertyType === type && styles.filterChipTextActive]}>
                        {type}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Detaylı Filtreler - Sadece Daire veya Villa seçildiğinde */}
              {(filters.propertyType === 'Daire' || filters.propertyType === 'Villa') && (
                <View style={styles.detailedFiltersContainer}>
                  <View style={styles.crimsonDivider} />

                  {/* m2 Aralığı */}
                  <View style={styles.filterSection}>
                    {renderFilterLabel('m² Aralığı')}
                    <RangeSlider
                      label=""
                      field="areaRange"
                      min={0}
                      max={500}
                      step={10}
                      formatValue={formatArea}
                      formData={filters}
                      handleSliderChange={handleSliderChange}
                      styles={styles}
                    />
                  </View>

                  <View style={styles.crimsonDivider} />
                  
                  {/* Oda Sayısı */}
                  <View style={styles.filterSection}>
                    <View style={[styles.filterLabelRow, { justifyContent: 'space-between' }]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Image source={require('../assets/images/icons/room.png')} style={styles.filterLabelIcon} />
                        <Text style={[styles.filterLabel, { color: theme.colors.text }]}>
                          Oda Sayısı
                        </Text>
                      </View>
                      {filters.rooms.length > 0 && (
                        <View style={styles.selectedCountBadge}>
                          <Text style={styles.selectedCountText}>{filters.rooms.length} seçili</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.filterOptionsWrap}>
                      {['1+0', '1+1', '2+1', '3+1', '4+1', '5+1'].map((room) => {
                        const isSelected = filters.rooms.includes(room);
                        return (
                          <TouchableOpacity
                            key={room}
                            style={[styles.filterChip, isSelected && styles.filterChipActive]}
                            onPress={() => {
                              const newRooms = isSelected
                                ? filters.rooms.filter(r => r !== room)
                                : [...filters.rooms, room];
                              setFilters({...filters, rooms: newRooms});
                            }}
                          >
                            <Text style={[styles.filterChipText, isSelected && styles.filterChipTextActive]}>
                              {room}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>

                  <View style={styles.crimsonDivider} />

                  {/* Bina Yaşı */}
                  <View style={styles.filterSection}>
                    {renderFilterLabel('Bina Yaşı')}
                    <RangeSlider
                      label=""
                      field="buildingAgeRange"
                      min={0}
                      max={50}
                      step={1}
                      formatValue={formatAge}
                      formData={filters}
                      handleSliderChange={handleSliderChange}
                      styles={styles}
                    />
                  </View>

                  <View style={styles.crimsonDivider} />

                  {/* Kat Bilgileri */}
                  <View style={styles.filterSection}>
                    {renderFilterLabel('Kat Bilgileri')}
                    
                    <View style={styles.dualSliderContainer}>
                      <View style={styles.dualSliderItem}>
                        <Text style={styles.dualSliderTitle}>Bulunduğu Kat</Text>
                        <RangeSlider
                          label=""
                          field="floorNumberRange"
                          min={0}
                          max={50}
                          step={1}
                          formatValue={formatFloor}
                          formData={filters}
                          handleSliderChange={handleSliderChange}
                          styles={styles}
                        />
                      </View>

                      <View style={styles.dualSliderItem}>
                        <Text style={styles.dualSliderTitle}>Toplam Kat</Text>
                        <RangeSlider
                          label=""
                          field="totalFloorsRange"
                          min={0}
                          max={50}
                          step={1}
                          formatValue={formatFloor}
                          formData={filters}
                          handleSliderChange={handleSliderChange}
                          styles={styles}
                        />
                      </View>
                    </View>
                  </View>

                  <View style={styles.crimsonDivider} />

                  {/* Ebeveyn Banyosu ve Takas */}
                  <View style={styles.filterSection}>
                    <View style={styles.toggleButtonsRow}>
                      <View style={styles.toggleButtonContainer}>
                        {renderFilterLabel('Ebeveyn Banyosu')}
                        <TouchableOpacity
                          style={[styles.toggleButton, filters.parentalBathroom && styles.toggleButtonActive]}
                          onPress={() => setFilters({...filters, parentalBathroom: !filters.parentalBathroom})}
                        >
                          <Text style={[styles.toggleButtonText, filters.parentalBathroom && styles.toggleButtonTextActive]}>
                            {filters.parentalBathroom ? 'Ebeveyn Banyo ✓' : 'Ebeveyn Banyo'}
                          </Text>
                        </TouchableOpacity>
                      </View>

                      <View style={styles.toggleButtonContainer}>
                        {renderFilterLabel('Takas')}
                        <TouchableOpacity
                          style={[styles.toggleButton, filters.exchange && styles.toggleButtonActive]}
                          onPress={() => setFilters({...filters, exchange: !filters.exchange})}
                        >
                          <Text style={[styles.toggleButtonText, filters.exchange && styles.toggleButtonTextActive]}>
                            {filters.exchange ? 'Takas ✓' : 'Takas'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>

                  <View style={styles.crimsonDivider} />

                  {/* Mutfak Tipi */}
                  <View style={styles.filterSection}>
                    {renderFilterLabel('Mutfak Tipi')}
                    <View style={styles.toggleButtonsRow}>
                      <View style={styles.toggleButtonContainer}>
                        <TouchableOpacity
                          style={[styles.toggleButton, filters.kitchenType === 'Kapalı Mutfak' && styles.toggleButtonActive]}
                          onPress={() => setFilters({
                            ...filters,
                            kitchenType: filters.kitchenType === 'Kapalı Mutfak' ? '' : 'Kapalı Mutfak'
                          })}
                        >
                          <Text style={[styles.toggleButtonText, filters.kitchenType === 'Kapalı Mutfak' && styles.toggleButtonTextActive]}>Kapalı Mutfak</Text>
                        </TouchableOpacity>
                      </View>
                      <View style={styles.toggleButtonContainer}>
                        <TouchableOpacity
                          style={[styles.toggleButton, filters.kitchenType === 'Amerikan Mutfak' && styles.toggleButtonActive]}
                          onPress={() => setFilters({
                            ...filters,
                            kitchenType: filters.kitchenType === 'Amerikan Mutfak' ? '' : 'Amerikan Mutfak'
                          })}
                        >
                          <Text style={[styles.toggleButtonText, filters.kitchenType === 'Amerikan Mutfak' && styles.toggleButtonTextActive]}>Amerikan Mutfak</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>

                  <View style={styles.crimsonDivider} />

                  {/* Kullanım Durumu */}
                  <View style={styles.filterSection}>
                    {renderFilterLabel('Kullanım Durumu')}
                    <View style={styles.toggleButtonsRow}>
                      <View style={styles.toggleButtonContainer}>
                        <TouchableOpacity
                          style={[styles.toggleButton, filters.usageStatus === 'Boş' && styles.toggleButtonActive]}
                          onPress={() => setFilters({
                            ...filters,
                            usageStatus: filters.usageStatus === 'Boş' ? '' : 'Boş'
                          })}
                        >
                          <Text style={[styles.toggleButtonText, filters.usageStatus === 'Boş' && styles.toggleButtonTextActive]}>Boş</Text>
                        </TouchableOpacity>
                      </View>
                      <View style={styles.toggleButtonContainer}>
                        <TouchableOpacity
                          style={[styles.toggleButton, filters.usageStatus === 'Kiracı' && styles.toggleButtonActive]}
                          onPress={() => setFilters({
                            ...filters,
                            usageStatus: filters.usageStatus === 'Kiracı' ? '' : 'Kiracı'
                          })}
                        >
                          <Text style={[styles.toggleButtonText, filters.usageStatus === 'Kiracı' && styles.toggleButtonTextActive]}>Kiracı</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>

                  <View style={styles.crimsonDivider} />

                  {/* Tapu Durumu */}
                  <View style={styles.filterSection}>
                    {renderFilterLabel('Tapu Durumu')}
                    <View style={styles.toggleButtonsRow}>
                      <View style={styles.toggleButtonContainer}>
                        <TouchableOpacity
                          style={[styles.toggleButton, filters.titleDeedStatus === 'Kat Mülkiyeti' && styles.toggleButtonActive]}
                          onPress={() => setFilters({
                            ...filters,
                            titleDeedStatus: filters.titleDeedStatus === 'Kat Mülkiyeti' ? '' : 'Kat Mülkiyeti'
                          })}
                        >
                          <Text style={[styles.toggleButtonText, filters.titleDeedStatus === 'Kat Mülkiyeti' && styles.toggleButtonTextActive]}>Kat Mülkiyeti</Text>
                        </TouchableOpacity>
                      </View>
                      <View style={styles.toggleButtonContainer}>
                        <TouchableOpacity
                          style={[styles.toggleButton, filters.titleDeedStatus === 'Kat İrtifakı' && styles.toggleButtonActive]}
                          onPress={() => setFilters({
                            ...filters,
                            titleDeedStatus: filters.titleDeedStatus === 'Kat İrtifakı' ? '' : 'Kat İrtifakı'
                          })}
                        >
                          <Text style={[styles.toggleButtonText, filters.titleDeedStatus === 'Kat İrtifakı' && styles.toggleButtonTextActive]}>Kat İrtifakı</Text>
                        </TouchableOpacity>
                      </View>
                      <View style={styles.toggleButtonContainer}>
                        <TouchableOpacity
                          style={[styles.toggleButton, filters.titleDeedStatus === 'Arsa Tapusu' && styles.toggleButtonActive]}
                          onPress={() => setFilters({
                            ...filters,
                            titleDeedStatus: filters.titleDeedStatus === 'Arsa Tapusu' ? '' : 'Arsa Tapusu'
                          })}
                        >
                          <Text style={[styles.toggleButtonText, filters.titleDeedStatus === 'Arsa Tapusu' && styles.toggleButtonTextActive]}>Arsa Tapusu</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>

                  <View style={styles.crimsonDivider} />

                  {/* Daha Fazla Filtre Butonu */}
                  <TouchableOpacity
                    style={styles.moreFiltersButton}
                    onPress={() => {
                      LayoutAnimation.configureNext(
                        LayoutAnimation.create(
                          250,
                          LayoutAnimation.Types.easeInEaseOut,
                          LayoutAnimation.Properties.opacity
                        )
                      );
                      setShowMoreFilters(!showMoreFilters);
                    }}
                  >
                    <Text style={styles.moreFiltersButtonText}>
                      {showMoreFilters ? '▼ Daha Az Filtre' : '▶ Daha Fazla Filtre'}
                    </Text>
                  </TouchableOpacity>

                  {/* Daha Fazla Filtreler */}
                  {showMoreFilters && (
                    <View style={styles.moreFiltersContainer}>
 
                       {/* Banyo Sayısı */}
                       <View style={styles.filterSection}>
                         {renderFilterLabel('Banyo Sayısı')}
                         <View style={styles.filterOptionsRow}>
                           {['1', '2', '3', '4+'].map((count) => (
                             <TouchableOpacity
                               key={count}
                               style={[styles.filterOptionEqual, filters.bathroomCount === count && styles.filterChipActive]}
                               onPress={() => setFilters({...filters, bathroomCount: filters.bathroomCount === count ? '' : count})}
                             >
                               <Text style={[styles.filterChipText, filters.bathroomCount === count && styles.filterChipTextActive]}>
                                 {count}
                               </Text>
                             </TouchableOpacity>
                           ))}
                         </View>
                       </View>

                       <View style={styles.crimsonDivider} />

                       {/* Balkon Sayısı */}
                       <View style={styles.filterSection}>
                         {renderFilterLabel('Balkon Sayısı')}
                         <View style={styles.filterOptionsRow}>
                           {['0', '1', '2', '3+'].map((count) => (
                             <TouchableOpacity
                               key={count}
                               style={[styles.filterOptionEqual, filters.balconyCount === count && styles.filterChipActive]}
                               onPress={() => setFilters({...filters, balconyCount: filters.balconyCount === count ? '' : count})}
                             >
                               <Text style={[styles.filterChipText, filters.balconyCount === count && styles.filterChipTextActive]}>
                                 {count === '0' ? 'Yok' : count}
                               </Text>
                             </TouchableOpacity>
                           ))}
                         </View>
                       </View>

                       <View style={styles.crimsonDivider} />

                       {/* Otopark ve Cam Balkon */}
                       <View style={styles.filterSection}>
                         <View style={styles.toggleButtonsRow}>
                           <View style={styles.toggleButtonContainer}>
                             <View style={styles.filterLabelRow}>
                               <Image source={require('../assets/images/icons/parking.png')} style={styles.filterLabelIcon} />
                               <Text style={styles.filterSectionTitle}>Otopark</Text>
                             </View>
                             <TouchableOpacity
                               style={[styles.toggleButton, filters.hasParking && styles.toggleButtonActive]}
                               onPress={() => setFilters({...filters, hasParking: !filters.hasParking})}
                             >
                               <Text style={[styles.toggleButtonText, filters.hasParking && styles.toggleButtonTextActive]}>
                                 {filters.hasParking ? 'Otopark ✓' : 'Otopark'}
                               </Text>
                             </TouchableOpacity>
                           </View>

                           <View style={styles.toggleButtonContainer}>
                             <View style={styles.filterLabelRow}>
                               <Image source={require('../assets/images/icons/window.png')} style={styles.filterLabelIcon} />
                               <Text style={styles.filterSectionTitle}>Cam Balkon</Text>
                             </View>
                             <TouchableOpacity
                               style={[styles.toggleButton, filters.hasGlassBalcony && styles.toggleButtonActive]}
                               onPress={() => setFilters({...filters, hasGlassBalcony: !filters.hasGlassBalcony})}
                             >
                               <Text style={[styles.toggleButtonText, filters.hasGlassBalcony && styles.toggleButtonTextActive]}>
                                 {filters.hasGlassBalcony ? 'Cam Balkon ✓' : 'Cam Balkon'}
                               </Text>
                             </TouchableOpacity>
                           </View>
                         </View>
                       </View>

                       <View style={styles.crimsonDivider} />

                       {/* Vestiyer ve Eşyalı */}
                       <View style={styles.filterSection}>
                         <View style={styles.toggleButtonsRow}>
                           <View style={styles.toggleButtonContainer}>
                             <View style={styles.filterLabelRow}>
                               <Image source={require('../assets/images/icons/cloakroom.png')} style={styles.filterLabelIcon} />
                               <Text style={styles.filterSectionTitle}>Vestiyer</Text>
                             </View>
                             <TouchableOpacity
                               style={[styles.toggleButton, filters.hasDressingRoom && styles.toggleButtonActive]}
                               onPress={() => setFilters({...filters, hasDressingRoom: !filters.hasDressingRoom})}
                             >
                               <Text style={[styles.toggleButtonText, filters.hasDressingRoom && styles.toggleButtonTextActive]}>
                                 {filters.hasDressingRoom ? 'Vestiyer ✓' : 'Vestiyer'}
                               </Text>
                             </TouchableOpacity>
                           </View>

                           <View style={styles.toggleButtonContainer}>
                             <View style={styles.filterLabelRow}>
                               <Image source={require('../assets/images/icons/furniture.png')} style={styles.filterLabelIcon} />
                               <Text style={styles.filterSectionTitle}>Eşyalı</Text>
                             </View>
                             <TouchableOpacity
                               style={[styles.toggleButton, filters.isFurnished && styles.toggleButtonActive]}
                               onPress={() => setFilters({...filters, isFurnished: !filters.isFurnished})}
                             >
                               <Text style={[styles.toggleButtonText, filters.isFurnished && styles.toggleButtonTextActive]}>
                                 {filters.isFurnished ? 'Eşyalı ✓' : 'Eşyalı'}
                               </Text>
                             </TouchableOpacity>
                           </View>
                         </View>
                       </View>

                       <View style={styles.crimsonDivider} />

                       {/* Isıtma Tipi */}
                       <View style={styles.filterSection}>
                         {renderFilterLabel('Isıtma Tipi')}
                         <View style={styles.filterOptionsWrap}>
                           {['Kombi', 'Merkezi', 'Klima', 'Soba', 'Yok'].map((type) => (
                             <TouchableOpacity
                               key={type}
                               style={[styles.filterChip, filters.heatingType === type && styles.filterChipActive]}
                               onPress={() => setFilters({...filters, heatingType: filters.heatingType === type ? '' : type})}
                             >
                               <Text style={[styles.filterChipText, filters.heatingType === type && styles.filterChipTextActive]}>
                                 {type}
                               </Text>
                             </TouchableOpacity>
                           ))}
                         </View>
                       </View>

                       <View style={styles.crimsonDivider} />

                       {/* İskan Durumu */}
                       <View style={styles.filterSection}>
                         {renderFilterLabel('İskan Durumu')}
                         <View style={styles.filterOptionsWrap}>
                           {['İskanlı', 'İskansız', 'İnşaat Aşamasında'].map((status) => (
                             <TouchableOpacity
                               key={status}
                               style={[styles.filterChip, filters.occupancyStatus === status && styles.filterChipActive]}
                               onPress={() => setFilters({...filters, occupancyStatus: filters.occupancyStatus === status ? '' : status})}
                             >
                               <Text style={[styles.filterChipText, filters.occupancyStatus === status && styles.filterChipTextActive]}>
                                 {status}
                               </Text>
                             </TouchableOpacity>
                           ))}
                         </View>
                       </View>
                    </View>
                  )}
                </View>
              )}
            </ScrollView>

            {/* Alt Butonlar */}
            <GlassmorphismView
              style={styles.filterModalFooter}
              config={isDark ? draftModalCardConfig : { ...draftModalCardConfig, startColor: '#FFFFFF', endColor: '#F5F6F8' }}
              borderRadius={0}
            >
              <TouchableOpacity
                style={styles.filterClearButton}
                onPress={handleClear}
              >
                <Text style={styles.filterClearButtonText}>Temizle</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.filterApplyButton, filteredCount > 0 && styles.filterApplyButtonActive]}
                onPress={handleApply}
              >
                <Text style={[styles.filterApplyButtonText, filteredCount > 0 && styles.filterApplyButtonTextActive]}>Uygula ({filteredCount})</Text>
              </TouchableOpacity>
            </GlassmorphismView>
          </GlassmorphismView>
        </Animated.View>
      </View>
    </Modal>
  );
};

// Stiller
const styles = StyleSheet.create({
  filterModalWrapper: {
    flex: 1,
  },
  filterModalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  filterModalOverlay: {
    position: 'absolute',
    bottom: 70,
    left: 16,
    right: 16,
    top: 100,
    zIndex: 102,
  },
  filterModalContent: {
    borderRadius: 16,
    height: '100%',
    paddingTop: 0,
    position: 'relative',
    overflow: 'hidden',
  },
  filterModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 20,
    paddingRight: 60, // Sağ üst buton için alan
  },
  filterModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  filterModalClose: {
    // fontSize: 28,
    // color: '#999',
    // paddingHorizontal: 10,
  },
  filterModalBody: {
    flex: 1,
    paddingHorizontal: 20,
    paddingVertical: 15,
    paddingBottom: 10,
  },
  detailedFiltersContainer: {
    overflow: 'hidden',
  },
  filterSection: {
    marginBottom: 20,
    overflow: 'visible',
  },
  filterLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginBottom: 12,
  },
  selectedCountBadge: {
    backgroundColor: theme.colors.error,
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
    flex: 1,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    borderWidth: 0,
    borderColor: 'transparent',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
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
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    height: 42,
  },
  filterOptionActive: {
    backgroundColor: theme.colors.error,
    borderColor: theme.colors.error,
    borderWidth: 1,
  },
  filterOptionText: {
    color: theme.colors.white,
    fontSize: theme.fontSizes.xl,
    fontWeight: theme.fontWeights.semibold,
  },
  filterOptionTextActive: {
    color: theme.colors.white, // Aktifken beyaz metin
  },
  filterOptionsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 15, // Boşluğu artırıldı
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterChip: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xl,
    borderRadius: theme.borderRadius.md,
    borderWidth: 0,
    borderColor: 'transparent',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    height: 42,
    minWidth: 100,
    flex: 0,
  },
  filterChipActive: {
    backgroundColor: theme.colors.error,
    borderColor: theme.colors.error,
    borderWidth: 1,
  },
  filterChipText: {
    color: theme.colors.white,
    fontSize: theme.fontSizes.md,
    fontWeight: theme.fontWeights.semibold,
    textAlign: 'center',
  },
  filterChipTextActive: {
    color: theme.colors.white, // Aktifken beyaz metin
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
    // borderBottomLeftRadius: 20,
    // borderBottomRightRadius: 20,
    // backgroundColor: '#F5F5F5', // Glassmorphism yönetecek
    overflow: 'hidden',
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
    backgroundColor: 'transparent', // İç boş olacak
    height: 58, // Yüksekliği sabit tut
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
    backgroundColor: 'rgba(220, 20, 60, 0.7)', // Boşken krimson ve şeffaf
    borderColor: theme.colors.error, // Boşken krimson border
    borderWidth: 2,
    height: 58, // Yüksekliği sabit tut
  },
  filterApplyButtonActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.7)', // Doluyken beyaz ve şeffaf
    borderColor: theme.colors.lightGray, // Doluyken açık gri border
    borderWidth: 2,
  },
  filterApplyButtonText: {
    fontSize: theme.fontSizes.lg,
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.white, // Boşken beyaz
  },
  filterApplyButtonTextActive: {
    color: theme.colors.black, // Doluyken koyu
  },
  sliderContainer: {
    marginBottom: theme.spacing.sm,
    overflow: 'visible',
  },
  dualSliderContainer: {
    flexDirection: 'row',
    gap: 20,
  },
  dualSliderItem: {
    flex: 1,
    minWidth: 160,
    maxWidth: '48%',
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
    marginBottom: theme.spacing.lg,
    paddingBottom: 4,
  },
  rangeLabelContainer: {
    flex: 1,
    alignItems: 'flex-start',
    overflow: 'visible',
  },
  rangeLabel: {
    fontSize: theme.fontSizes.lg,
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.error,
  },
  sliderTrack: {
    height: 6,
    backgroundColor: '#E5E5E5',
    borderRadius: 3,
    position: 'relative',
    minWidth: 140,
    width: '100%',
  },
  sliderProgress: {
    position: 'absolute',
    height: 6,
    backgroundColor: theme.colors.error,
    borderRadius: 3,
  },
  sliderThumb: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colors.white,
    borderWidth: 3,
    borderColor: theme.colors.error,
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
  toggleButtonsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  toggleButtonContainer: {
    flex: 1,
  },
  moreFiltersButton: {
    paddingVertical: theme.spacing.lg, // was 18
    paddingHorizontal: 24,
    backgroundColor: 'rgba(220, 20, 60, 0.7)',
    borderRadius: theme.borderRadius.lg,
    borderWidth: 2,
    borderColor: theme.colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 8,
  },
  moreFiltersButtonText: {
    color: '#FFFFFF',
    fontSize: theme.fontSizes.lg,
    fontWeight: theme.fontWeights.bold,
    letterSpacing: 0.5,
  },
  moreFiltersContainer: {
    overflow: 'hidden',
  },
  toggleButton: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    borderWidth: 0,
    borderColor: 'transparent',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    height: 42,
  },
  toggleButtonActive: {
    backgroundColor: theme.colors.error,
    borderColor: theme.colors.error,
    borderWidth: 1,
  },
  toggleButtonText: {
    fontSize: theme.fontSizes.md,
    color: theme.colors.white,
    fontWeight: theme.fontWeights.medium,
  },
  toggleButtonTextActive: {
    color: theme.colors.white, // Aktifken beyaz metin
    fontWeight: theme.fontWeights.semibold,
  },
  headerRightClose: {
    position: 'absolute',
    right: 20,
    top: 15,
  },
  closeButton: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: theme.colors.error,
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 2,
      },
      android: {
        elevation: 5,
      },
    }),
  },
  closeButtonIcon: {
    width: 12,
    height: 12,
    tintColor: theme.colors.white,
  },
  filterTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  filterTitleIcon: {
    width: 18,
    height: 18,
    tintColor: theme.colors.error,
    marginRight: 8,
  },
  headerDivider: {
    height: 1,
    alignSelf: 'stretch',
    marginHorizontal: 10,
  },
});

export default AdvancedFiltersModal;

