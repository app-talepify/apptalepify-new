import React, { useCallback, useMemo, memo, useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Animated,
  Easing,
  TextInput,
  Modal,
  PanResponder,
  Alert,
} from 'react-native';
import GlassmorphismView from '../components/GlassmorphismView';
import { useNavigation, useRoute } from '@react-navigation/native';
import { theme } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import ListingCard from '../components/ListingCard';
import { makePhoneCall, sendWhatsAppMessage } from '../utils/contactUtils';
import { useAuth } from '../context/AuthContext';
import { fetchUserPortfolios } from '../services/firestore';
import { db as firestore } from '../firebase';
import { doc, updateDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { getRequest } from '../services/firestore';
import { turkeyDistricts } from '../data/turkeyDistricts';
import { getNeighborhoodsForDistricts } from '../services/neighborhoodService';
import { ActivityIndicator } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Animatable from 'react-native-animatable';
import { getMatchingPortfoliosForRequest } from '../utils/requestMatching';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';

// Budget Slider Component
const BudgetSlider = ({ tempRequestData, setTempRequestData }) => {
  const minPrice = tempRequestData.minPrice || 0;
  const maxPrice = tempRequestData.maxPrice || 20000000;
  const [trackWidth, setTrackWidth] = useState(280);
  const [activeThumb, setActiveThumb] = useState(null);
  const trackRef = useRef(null);
  const trackPositionRef = useRef({ x: 0, y: 0, width: 280, height: 0, pageX: 0, pageY: 0 });
  
  // Animasyon için
  const minLabelScale = useRef(new Animated.Value(1)).current;
  const maxLabelScale = useRef(new Animated.Value(1)).current;
  
  const min = 0;
  const max = 20000000;
  const step = 100000;
  
  const calculatePercentage = (value) => {
    if (max === min) return value === min ? 0 : 100;
    const result = ((value - min) / (max - min)) * 100;
    if (!isFinite(result) || isNaN(result)) return 0;
    return Math.max(0, Math.min(100, result));
  };
  
  const minPercentage = calculatePercentage(minPrice);
  const maxPercentage = calculatePercentage(maxPrice);
  
  const formatPrice = (price) => {
    if (price >= 1000000) return `${(price / 1000000).toFixed(1)}M`;
    if (price >= 1000) return `${(price / 1000).toFixed(0)}K`;
    return price.toString();
  };
  
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
  
  const handleSliderChange = useCallback((values) => {
    setTempRequestData(prev => ({ ...prev, minPrice: values[0], maxPrice: values[1] }));
  }, [setTempRequestData]);
  
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
    },
    onPanResponderMove: (event, gestureState) => {
      const { moveX } = gestureState;
      const { pageX } = trackPositionRef.current;
      const relativeX = moveX - pageX;
      const newValue = calculateValueFromPosition(relativeX);

      if (thumbType === 'min') {
        let newMinValue = Math.max(min, newValue);
        if (newMinValue > maxPrice - step) {
          newMinValue = maxPrice - step;
        }
        newMinValue = Math.round(newMinValue / step) * step;
        newMinValue = Math.max(min, newMinValue);
        
        if (newMinValue !== minPrice) {
          handleSliderChange([newMinValue, maxPrice]);
        }
      } else {
        let newMaxValue = Math.min(max, newValue);
        if (newMaxValue < minPrice + step) {
          newMaxValue = minPrice + step;
        }
        newMaxValue = Math.round(newMaxValue / step) * step;
        newMaxValue = Math.min(max, newMaxValue);
        
        if (newMaxValue !== maxPrice) {
          handleSliderChange([minPrice, newMaxValue]);
        }
      }
    },
    onPanResponderRelease: () => {
      setActiveThumb(null);
    },
  }), [min, max, step, minPrice, maxPrice, handleSliderChange, calculateValueFromPosition]);
  
  const minPanResponder = useMemo(() => createPanResponder('min'), [createPanResponder]);
  const maxPanResponder = useMemo(() => createPanResponder('max'), [createPanResponder]);
  
  const handleTrackLayout = useCallback((event) => {
    const { width } = event.nativeEvent.layout;
    setTrackWidth(width);
    if (trackRef.current) {
      trackRef.current.measure((x, y, w, h, pageX, pageY) => {
        trackPositionRef.current = { x, y, width: w, height: h, pageX, pageY };
      });
    }
  }, []);
  
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
  
  return (
    <View style={sliderStyles.container}>
      <View style={sliderStyles.labelsContainer}>
        <Animated.Text style={[sliderStyles.valueLabel, { transform: [{ scale: minLabelScale }] }]}>
          {formatPrice(minPrice)} TL
        </Animated.Text>
        <Animated.Text style={[sliderStyles.valueLabel, { transform: [{ scale: maxLabelScale }] }]}>
          {formatPrice(maxPrice)} TL
        </Animated.Text>
      </View>
      <View 
        ref={trackRef}
        style={sliderStyles.trackContainer}
        onLayout={handleTrackLayout}
      >
        <View style={sliderStyles.track} />
        <View 
          style={[
            sliderStyles.trackActive,
            {
              left: `${minPercentage}%`,
              right: `${100 - maxPercentage}%`,
            }
          ]} 
        />
        <View 
          {...minPanResponder.panHandlers}
          style={[sliderStyles.thumb, { left: `${minPercentage}%` }]} 
        />
        <View 
          {...maxPanResponder.panHandlers}
          style={[sliderStyles.thumb, { left: `${maxPercentage}%` }]} 
        />
      </View>
    </View>
  );
};

// SquareMeters Slider Component
const SquareMetersSlider = ({ tempRequestData, setTempRequestData }) => {
  const minSqm = tempRequestData.minSquareMeters || 0;
  const maxSqm = tempRequestData.maxSquareMeters || 500;
  const [trackWidth, setTrackWidth] = useState(280);
  const [activeThumb, setActiveThumb] = useState(null);
  const trackRef = useRef(null);
  const trackPositionRef = useRef({ x: 0, y: 0, width: 280, height: 0, pageX: 0, pageY: 0 });
  
  // Animasyon için
  const minLabelScale = useRef(new Animated.Value(1)).current;
  const maxLabelScale = useRef(new Animated.Value(1)).current;
  
  const min = 0;
  const max = 500;
  const step = 10;
  
  const calculatePercentage = (value) => {
    if (max === min) return value === min ? 0 : 100;
    const result = ((value - min) / (max - min)) * 100;
    if (!isFinite(result) || isNaN(result)) return 0;
    return Math.max(0, Math.min(100, result));
  };
  
  const minPercentage = calculatePercentage(minSqm);
  const maxPercentage = calculatePercentage(maxSqm);
  
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
  
  const handleSliderChange = useCallback((values) => {
    setTempRequestData(prev => ({ ...prev, minSquareMeters: values[0], maxSquareMeters: values[1] }));
  }, [setTempRequestData]);
  
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
    },
    onPanResponderMove: (event, gestureState) => {
      const { moveX } = gestureState;
      const { pageX } = trackPositionRef.current;
      const relativeX = moveX - pageX;
      const newValue = calculateValueFromPosition(relativeX);

      if (thumbType === 'min') {
        let newMinValue = Math.max(min, newValue);
        if (newMinValue > maxSqm - step) {
          newMinValue = maxSqm - step;
        }
        newMinValue = Math.round(newMinValue / step) * step;
        newMinValue = Math.max(min, newMinValue);
        
        if (newMinValue !== minSqm) {
          handleSliderChange([newMinValue, maxSqm]);
        }
      } else {
        let newMaxValue = Math.min(max, newValue);
        if (newMaxValue < minSqm + step) {
          newMaxValue = minSqm + step;
        }
        newMaxValue = Math.round(newMaxValue / step) * step;
        newMaxValue = Math.min(max, newMaxValue);
        
        if (newMaxValue !== maxSqm) {
          handleSliderChange([minSqm, newMaxValue]);
        }
      }
    },
    onPanResponderRelease: () => {
      setActiveThumb(null);
    },
  }), [min, max, step, minSqm, maxSqm, handleSliderChange, calculateValueFromPosition]);
  
  const minPanResponder = useMemo(() => createPanResponder('min'), [createPanResponder]);
  const maxPanResponder = useMemo(() => createPanResponder('max'), [createPanResponder]);
  
  const handleTrackLayout = useCallback((event) => {
    const { width } = event.nativeEvent.layout;
    setTrackWidth(width);
    if (trackRef.current) {
      trackRef.current.measure((x, y, w, h, pageX, pageY) => {
        trackPositionRef.current = { x, y, width: w, height: h, pageX, pageY };
      });
    }
  }, []);
  
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
  
  return (
    <View style={sliderStyles.container}>
      <View style={sliderStyles.labelsContainer}>
        <Animated.Text style={[sliderStyles.valueLabel, { transform: [{ scale: minLabelScale }] }]}>
          {minSqm} m²
        </Animated.Text>
        <Animated.Text style={[sliderStyles.valueLabel, { transform: [{ scale: maxLabelScale }] }]}>
          {maxSqm} m²
        </Animated.Text>
      </View>
      <View 
        ref={trackRef}
        style={sliderStyles.trackContainer}
        onLayout={handleTrackLayout}
      >
        <View style={sliderStyles.track} />
        <View 
          style={[
            sliderStyles.trackActive,
            {
              left: `${minPercentage}%`,
              right: `${100 - maxPercentage}%`,
            }
          ]} 
        />
        <View 
          {...minPanResponder.panHandlers}
          style={[sliderStyles.thumb, { left: `${minPercentage}%` }]} 
        />
        <View 
          {...maxPanResponder.panHandlers}
          style={[sliderStyles.thumb, { left: `${maxPercentage}%` }]} 
        />
      </View>
    </View>
  );
};

const sliderStyles = StyleSheet.create({
  container: {
    marginVertical: theme.spacing.lg,
  },
  labelsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.md,
  },
  valueLabel: {
    fontSize: theme.fontSizes.lg,
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.error,
  },
  trackContainer: {
    height: 40,
    justifyContent: 'center',
    marginBottom: theme.spacing.md,
  },
  track: {
    height: 4,
    backgroundColor: theme.colors.border,
    borderRadius: 2,
  },
  trackActive: {
    position: 'absolute',
    height: 4,
    backgroundColor: theme.colors.error,
    borderRadius: 2,
  },
  thumb: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.error,
    marginLeft: -12,
    marginTop: -10,
    borderWidth: 3,
    borderColor: theme.colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 5,
  },
});

const RequestDetail = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { request: initialRequest, requestId: routeRequestId, scrollToMatching } = route.params || {};
  const { user } = useAuth();
  const { isDark } = useTheme();
  const styles = createStyles(isDark);
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight ? useBottomTabBarHeight() : 0;
  
  // Request state - Firestore'dan gelen güncel veri
  const [request, setRequest] = useState(initialRequest ? { contactInfo: {}, ...initialRequest, contactInfo: initialRequest.contactInfo || {} } : { contactInfo: {} });
  const [ownerPhone, setOwnerPhone] = useState('');
  // Ensure we load the freshest request from Firestore (supports navigation by requestId only)
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const reqId = initialRequest?.id || routeRequestId;
      if (!reqId) { return; }
      try {
        const fresh = await getRequest(reqId);
        if (!cancelled && fresh) {
          setRequest(prev => ({ ...(prev || {}), id: reqId, contactInfo: {}, ...fresh, contactInfo: fresh.contactInfo || {} }));
        }
      } catch {}
    };
    load();
    return () => { cancelled = true; };
  }, [initialRequest?.id, routeRequestId]);
  
  const isOwner = !!(user?.uid && request?.userId === user.uid);

  // Property types and room count options
  const propertyTypes = useMemo(() => ['Daire', 'Villa', 'Arsa', 'İşyeri', 'Bina', 'Residence'], []);
  const roomOptions = useMemo(() => ['1+0', '1+1', '2+0', '2+1', '3+0', '3+1', '4+1', '5+1', '6+1'], []);
  
  // (Removed unused inline districtNeighborhoods; using turkeyDistricts + neighborhoodService)
  
  const scrollRef = useRef(null);
  const [matchingY, setMatchingY] = useState(0);
  const [isMatchingExpanded, setIsMatchingExpanded] = useState(false);
  const animatedHeight = useRef(new Animated.Value(0)).current;
  
  // Edit mode states
  const [isEditMode, setIsEditMode] = useState(false);
  const [tempRequestData, setTempRequestData] = useState({});
  const [showDeleteButton, setShowDeleteButton] = useState(false);
  const [deleteButtonAnim] = useState(new Animated.Value(0));
  const [blinkAnim] = useState(new Animated.Value(1));
  const [saveLoading, setSaveLoading] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [updatedFields, setUpdatedFields] = useState([]);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  
  // Modal states for editing
  const [showTitleModal, setShowTitleModal] = useState(false);
  const [showDescriptionModal, setShowDescriptionModal] = useState(false);
  const [showMinPriceModal, setShowMinPriceModal] = useState(false);
  const [showMaxPriceModal, setShowMaxPriceModal] = useState(false);
  const [showMinSquareMetersModal, setShowMinSquareMetersModal] = useState(false);
  const [showMaxSquareMetersModal, setShowMaxSquareMetersModal] = useState(false);
  const [showRoomCountModal, setShowRoomCountModal] = useState(false);
  const [showPropertyTypeModal, setShowPropertyTypeModal] = useState(false);
  const [showDistrictModal, setShowDistrictModal] = useState(false);
  const [showNeighborhoodModal, setShowNeighborhoodModal] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  
  // Neighborhood loading state
  const [loadingNeighborhoods, setLoadingNeighborhoods] = useState(false);
  const [availableNeighborhoods, setAvailableNeighborhoods] = useState([]);
  const [lastLoadedDistricts, setLastLoadedDistricts] = useState([]);

  const formatPrice = useCallback((value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) {return '—';}
    const tr = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
    return `${tr}₺`;
  }, []);

  const getBudgetLabel = useCallback(() => {
    const min = (tempRequestData.minPrice ?? request.minPrice ?? request.minBudget ?? request.budget?.[0]);
    const max = (tempRequestData.maxPrice ?? request.maxPrice ?? request.maxBudget ?? request.budget?.[1]);
    const minNum = Number(min);
    const maxNum = Number(max);
    const hasMin = Number.isFinite(minNum) && minNum >= 0;
    const hasMax = Number.isFinite(maxNum) && maxNum >= 0;
    if (hasMin && hasMax) {
      return `${formatPrice(minNum)} - ${formatPrice(maxNum)}`;
    }
    if (hasMin) { return `≥ ${formatPrice(minNum)}`; }
    if (hasMax) { return `≤ ${formatPrice(maxNum)}`; }
    return 'Belirtilmemiş';
  }, [tempRequestData.minPrice, tempRequestData.maxPrice, request.minPrice, request.maxPrice, request.minBudget, request.maxBudget, request.budget, formatPrice]);

  const getSquareMetersLabel = useCallback(() => {
    const min = (tempRequestData.minSquareMeters ?? request.minSquareMeters ?? request.minSqMeters);
    const max = (tempRequestData.maxSquareMeters ?? request.maxSquareMeters ?? request.maxSqMeters);
    const minNum = Number(min);
    const maxNum = Number(max);
    const hasMin = Number.isFinite(minNum) && minNum >= 0;
    const hasMax = Number.isFinite(maxNum) && maxNum >= 0;
    if (hasMin && hasMax) {
      return `${minNum} - ${maxNum} m²`;
    }
    if (hasMin) { return `≥ ${minNum} m²`; }
    if (hasMax) { return `≤ ${maxNum} m²`; }
    return 'Belirtilmemiş';
  }, [tempRequestData.minSquareMeters, tempRequestData.maxSquareMeters, request.minSquareMeters, request.maxSquareMeters, request.minSqMeters, request.maxSqMeters]);

  const [myPortfolios, setMyPortfolios] = useState([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!user?.uid) { setMyPortfolios([]); return; }
      try {
        const data = await fetchUserPortfolios(user.uid);
        if (!cancelled) { setMyPortfolios(Array.isArray(data) ? data : []); }
      } catch {
        if (!cancelled) { setMyPortfolios([]); }
      }
    };
    load();
    return () => { cancelled = true; };
  }, [user?.uid]);

  const getMatchingPortfolios = useCallback((req) => {
    if (!req) {
      return [];
    }
    return getMatchingPortfoliosForRequest(req, myPortfolios, { tolerance: 0.10 });
  }, [myPortfolios]);

  const matchingPortfolios = useMemo(() => getMatchingPortfolios(request), [getMatchingPortfolios, request]);

  // Auto expand and scroll when navigated with scrollToMatching
  // Fetch owner phone number from users collection
  useEffect(() => {
    let cancelled = false;
    
    const fetchOwnerPhone = async () => {
      const ownerId = request?.userId;
      if (!ownerId) {
        setOwnerPhone('');
        return;
      }

      try {
        const userDoc = await getDoc(doc(firestore, 'users', ownerId));
        if (cancelled) return;
        
        if (userDoc.exists()) {
          const userData = userDoc.data();
          setOwnerPhone(userData.phoneNumber || '');
        } else {
          setOwnerPhone('');
        }
      } catch (error) {
        if (__DEV__) console.log('[RequestDetail] Owner phone fetch error:', error);
        setOwnerPhone('');
      }
    };

    fetchOwnerPhone();
    return () => { cancelled = true; };
  }, [request?.userId]);

  useEffect(() => {
    if (__DEV__) console.log('RequestDetail useEffect: scrollToMatching =', scrollToMatching, 'matchingY =', matchingY);
    
    if (scrollToMatching) {
      if (__DEV__) console.log('RequestDetail: Auto-expanding matching portfolios');
      setIsMatchingExpanded(true);
      
      // Animate opening
      Animated.timing(animatedHeight, {
        toValue: 1,
        duration: 250,
        useNativeDriver: false,
        easing: Easing.out(Easing.ease),
      }).start();
      
      // Delay scroll to allow expansion rendering
      setTimeout(() => {
        if (scrollRef.current && matchingY > 0) {
          if (__DEV__) console.log('RequestDetail: Scrolling to matchingY:', matchingY);
          scrollRef.current.scrollTo({ y: matchingY - 12, animated: true });
        }
      }, 350);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollToMatching, matchingY]);

  const toggleMatching = useCallback(() => {
    const next = !isMatchingExpanded;
    if (__DEV__) console.log('RequestDetail toggleMatching: current =', isMatchingExpanded, 'next =', next);
    
    // Update state immediately for both open/close
    setIsMatchingExpanded(next);
    
    // Animate to the new state
    Animated.timing(animatedHeight, {
      toValue: next ? 1 : 0,
      duration: 250,
      useNativeDriver: false,
      easing: next ? Easing.out(Easing.ease) : Easing.in(Easing.ease),
    }).start();
  }, [isMatchingExpanded, animatedHeight]);
  
  // Edit mode functions
  const toggleEditMode = useCallback(() => {
    if (isEditMode) {
      // Düzenleme modundan çıkarken değişiklikleri sıfırla
      setTempRequestData({});
    } else {
      // Düzenleme moduna girerken mevcut verileri kopyala
      setTempRequestData({ 
        ...request,
        districts: Array.isArray(request.districts) ? request.districts : (request.district ? [request.district] : []),
        neighborhoods: Array.isArray(request.neighborhoods) ? request.neighborhoods : (request.neighborhood ? [request.neighborhood] : []),
      });
    }
    setIsEditMode(!isEditMode);
  }, [isEditMode, request]);
  
  const startEditing = useCallback((field) => {
    switch (field) {
      case 'title':
        setShowTitleModal(true);
        break;
      case 'description':
        setShowDescriptionModal(true);
        break;
      case 'budget':
        // Bütçe aralığı için min ve max'ı aynı anda düzenle
        setShowMinPriceModal(true);
        break;
      case 'squareMeters':
        // Metrekare aralığı için min ve max'ı aynı anda düzenle
        setShowMinSquareMetersModal(true);
        break;
      case 'roomCount':
        setShowRoomCountModal(true);
        break;
      case 'propertyType':
        setShowPropertyTypeModal(true);
        break;
      case 'district':
        setShowDistrictModal(true);
        break;
      case 'neighborhood':
        setShowNeighborhoodModal(true);
        break;
      case 'contact':
        setShowContactModal(true);
        break;
      default:
        break;
    }
  }, []);
  
  const saveRequestChanges = useCallback(async () => {
    try {
      setSaveLoading(true);
      
      const updates = {};
      const changed = [];
      
      // Helper function: Array'leri karşılaştır
      const arraysEqual = (arr1, arr2) => {
        if (!Array.isArray(arr1) || !Array.isArray(arr2)) return false;
        if (arr1.length !== arr2.length) return false;
        const sorted1 = [...arr1].sort();
        const sorted2 = [...arr2].sort();
        return sorted1.every((val, idx) => val === sorted2[idx]);
      };
      
      // Helper function: Object'leri karşılaştır
      const objectsEqual = (obj1, obj2) => {
        if (typeof obj1 !== 'object' || typeof obj2 !== 'object') return false;
        if (!obj1 || !obj2) return obj1 === obj2;
        const keys1 = Object.keys(obj1).sort();
        const keys2 = Object.keys(obj2).sort();
        if (keys1.length !== keys2.length) return false;
        return keys1.every(key => obj1[key] === obj2[key]);
      };
      
      // Değişen alanları tespit et
      Object.keys(tempRequestData).forEach(key => {
        const tempValue = tempRequestData[key];
        const requestValue = request[key];
        
        let hasChanged = false;
        
        // Array kontrolü (districts, neighborhoods)
        if (Array.isArray(tempValue) || Array.isArray(requestValue)) {
          hasChanged = !arraysEqual(tempValue, requestValue);
        }
        // Object kontrolü (contactInfo)
        else if (typeof tempValue === 'object' && tempValue !== null) {
          hasChanged = !objectsEqual(tempValue, requestValue);
        }
        // Primitive değer kontrolü
        else {
          hasChanged = tempValue !== requestValue;
        }
        
        if (hasChanged) {
          updates[key] = tempValue;
          changed.push(key);
          if (__DEV__) console.log(`[RequestDetail] ${key} değişti:`, requestValue, '→', tempValue);
        }
      });
      
      if (__DEV__) console.log('[RequestDetail] Değişen alanlar:', changed);
      if (__DEV__) console.log('[RequestDetail] Güncellenecek veriler:', updates);
      
      if (changed.length === 0) {
        setIsEditMode(false);
        setTempRequestData({});
        setShowDeleteButton(false);
        setUpdatedFields(['Hiçbir değişiklik yapılmadı']);
        setShowSuccessModal(true);
        
        // 1.5 saniye sonra otomatik kapat
        setTimeout(() => {
          setShowSuccessModal(false);
          setUpdatedFields([]);
        }, 1500);
        
        return;
      }
      
      // Firestore'da güncelle
      const requestRef = doc(firestore, 'requests', request.id);
      await updateDoc(requestRef, {
        ...updates,
        updatedAt: serverTimestamp()
      });
      
      if (__DEV__) console.log('[RequestDetail] Firestore güncellendi:', request.id);
      
      // State'i güncelle (anında görünür)
      const updatedRequest = { ...request, ...updates };
      setRequest(updatedRequest);
      
      if (__DEV__) console.log('[RequestDetail] State güncellendi');
      
      // Success modal göster
      setUpdatedFields(changed);
      setShowSuccessModal(true);
      setIsEditMode(false);
      setTempRequestData({});
      setShowDeleteButton(false);
      
      // 1.5 saniye sonra otomatik kapat
      setTimeout(() => {
        setShowSuccessModal(false);
        setUpdatedFields([]);
      }, 1500);
      
    } catch (error) {
      if (__DEV__) console.error('Talep güncellenirken hata:', error);
      Alert.alert('Hata', 'Talep güncellenirken bir hata oluştu.');
    } finally {
      setSaveLoading(false);
    }
  }, [tempRequestData, request, navigation]);
  
  // Blink animation for edit mode
  useEffect(() => {
    let fieldBlinkAnimation;
    
    if (isEditMode) {
      blinkAnim.stopAnimation();
      
      fieldBlinkAnimation = Animated.loop(
        Animated.sequence([
          Animated.timing(blinkAnim, {
            toValue: 0.3,
            duration: 600,
            useNativeDriver: false,
            easing: Easing.inOut(Easing.ease),
          }),
          Animated.timing(blinkAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: false,
            easing: Easing.inOut(Easing.ease),
          }),
        ]),
        { iterations: -1 }
      );
      fieldBlinkAnimation.start();
    } else {
      blinkAnim.stopAnimation(() => {
        blinkAnim.setValue(1);
      });
    }
    
    return () => {
      if (fieldBlinkAnimation) {
        fieldBlinkAnimation.stop();
      }
    };
  }, [isEditMode, blinkAnim]);

  // Not fetching on focus to mirror PropertyDetail behavior. We rely on RequestList
  // to refresh its data on focus, so the params passed here are already up-to-date.

  // Mahalle modal açıldığında mahalleleri yükle (sadece ilçe değiştiyse)
  useEffect(() => {
    if (!showNeighborhoodModal) return;
    
    const currentDistricts = tempRequestData.districts || 
      (Array.isArray(request.districts) ? request.districts : 
        (request.district ? [request.district] : []));
    
    // İlçeler değişmediyse yeniden yükleme
    const districtsChanged = JSON.stringify([...currentDistricts].sort()) !== 
                            JSON.stringify([...lastLoadedDistricts].sort());
    
    if (districtsChanged || availableNeighborhoods.length === 0) {
      loadNeighborhoods();
    }
  }, [showNeighborhoodModal]);

  const loadNeighborhoods = async () => {
    try {
      if (__DEV__) console.log('[RequestDetail] Mahalleler yükleniyor...');
      setLoadingNeighborhoods(true);

      // Seçili ilçeleri belirle
      const currentDistricts = tempRequestData.districts || 
        (Array.isArray(request.districts) ? request.districts : 
          (request.district ? [request.district] : []));

      if (__DEV__) console.log('[RequestDetail] Seçili ilçeler:', currentDistricts);

      if (currentDistricts.length === 0) {
        setAvailableNeighborhoods([]);
        setLastLoadedDistricts([]);
        setLoadingNeighborhoods(false);
        return;
      }

      // Neighborhood service'den mahalleleri çek
      const neighborhoods = await getNeighborhoodsForDistricts(currentDistricts);
      
      if (__DEV__) console.log('[RequestDetail] Yüklenen mahalle sayısı:', neighborhoods.length);
      setAvailableNeighborhoods(neighborhoods);
      setLastLoadedDistricts(currentDistricts);
      setLoadingNeighborhoods(false);

    } catch (error) {
      if (__DEV__) console.error('[RequestDetail] Mahalle yükleme hatası:', error);
      setAvailableNeighborhoods([]);
      setLoadingNeighborhoods(false);
    }
  };

  if (!request) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Talep bilgisi bulunamadı</Text>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>Geri Dön</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView edges={['left','right','bottom']} style={[styles.container, { backgroundColor: 'transparent' }]}>
      {isDark && (
        <Image 
          source={require('../assets/images/dark-bg2.png')} 
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            zIndex: -1,
          }}
        />
      )}
      <View style={[
        styles.header,
        { paddingTop: Math.max(insets.top, 0) + 12, paddingBottom: theme.spacing.lg, position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20 }
      ]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Geri"
        >
          <Image
            source={require('../assets/images/icons/return.png')}
            style={styles.backButtonIcon}
          />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Talep Detayı</Text>
          <Text style={styles.headerSubtitle}>Müşteri talep detayları.</Text>
        </View>
        {isOwner ? (
          <View style={styles.headerActions}>
            <TouchableOpacity 
              style={styles.headerDeleteButton}
              onPress={() => setShowDeleteModal(true)}
            >
              <Image source={require('../assets/images/icons/trash.png')} style={styles.headerDeleteIcon} />
            </TouchableOpacity>
            
            {isEditMode && (
              <TouchableOpacity 
                style={styles.headerCloseButton}
                onPress={() => {
                  setIsEditMode(false);
                  setTempRequestData({});
                  setShowDeleteButton(false);
                }}
              >
                <Text style={styles.headerCloseText}>✕</Text>
              </TouchableOpacity>
            )}
            
            <TouchableOpacity 
              style={styles.headerEditButton}
              onPress={async () => {
                if (isEditMode) {
                  // Kaydet işlemi
                  await saveRequestChanges();
                } else {
                  // Düzenleme moduna geç
                  toggleEditMode();
                  setShowDeleteButton(true);
                }
              }}
            >
              {isEditMode ? (
                <Image 
                  source={require('../assets/images/icons/save.png')} 
                  style={styles.headerEditIcon} 
                />
              ) : (
                <Image 
                  source={require('../assets/images/icons/Edit_fill.png')} 
                  style={styles.headerEditIcon} 
                />
              )}
              <Text style={styles.headerEditText}>
                {isEditMode ? (saveLoading ? 'Kaydediliyor...' : 'Kaydet') : 'Düzenle'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.headerSpacer} />
        )}
      </View>

      {/* Spacer: header yüksekliği kadar boşluk */}
      <View style={{ height: Math.max(insets.top, 0) + 12 + 37 + (theme.spacing?.lg || 16) }} />

      <ScrollView
        ref={scrollRef}
        style={styles.content}
        contentContainerStyle={{ paddingBottom: (tabBarHeight || Math.max(insets.bottom || 0, 0)) + theme.spacing.sm }}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => {
          if (scrollToMatching && matchingY > 0 && scrollRef.current) {
            scrollRef.current.scrollTo({ y: matchingY - 12, animated: true });
          }
        }}
      >
        <Animatable.View animation="fadeIn" duration={350} useNativeDriver>
        <GlassmorphismView
          style={styles.card}
          borderRadius={theme.borderRadius.xl}
          blurEnabled={false}
          config={{
            overlayColor: 'rgba(224, 220, 220, 0.81)',
            startColor: 'rgb(10, 22, 31)',
            endColor: 'rgba(17, 36, 49, 0.64)',
            gradientAlpha: 1,
            gradientDirection: 150,
            gradientSpread: 7,
            ditherStrength: 5.0,
          }}
        >
          <View style={styles.titleWithIcon}>
            <Image
              source={require('../assets/images/icons/talep.png')}
              style={styles.titleIcon}
            />
            <Text style={styles.cardTitle}>Talep Bilgileri</Text>
          </View>

          <TouchableOpacity 
            style={[styles.infoRow, isEditMode && styles.editableRow]}
            onPress={() => isEditMode && startEditing('title')}
            disabled={!isEditMode}
            activeOpacity={isEditMode ? 0.7 : 1}
          >
            <Animated.View style={[
              styles.infoRowContent,
              isEditMode && {
                borderWidth: 2,
                borderColor: blinkAnim.interpolate({
                  inputRange: [0.3, 1],
                  outputRange: [theme.colors.error + '60', theme.colors.error]
                }),
                borderRadius: 8,
                padding: 8,
              }
            ]}>
              <Text style={styles.infoLabel}>Başlık:</Text>
              <Text style={styles.infoValue}>{tempRequestData.title || request.title}</Text>
            </Animated.View>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.infoRow, isEditMode && styles.editableRow]}
            onPress={() => isEditMode && startEditing('description')}
            disabled={!isEditMode}
            activeOpacity={isEditMode ? 0.7 : 1}
          >
            <Animated.View style={[
              styles.infoRowContent,
              isEditMode && {
                borderWidth: 2,
                borderColor: blinkAnim.interpolate({
                  inputRange: [0.3, 1],
                  outputRange: [theme.colors.error + '60', theme.colors.error]
                }),
                borderRadius: 8,
                padding: 8,
              }
            ]}>
              <Text style={styles.infoLabel}>Açıklama:</Text>
              <Text style={styles.infoValue}>{tempRequestData.description || request.description}</Text>
            </Animated.View>
          </TouchableOpacity>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Şehir:</Text>
            <Text style={styles.infoValue}>{request.city || 'Belirtilmemiş'}</Text>
          </View>

          <TouchableOpacity 
            style={[styles.infoRow, isEditMode && styles.editableRow]}
            onPress={() => isEditMode && startEditing('district')}
            disabled={!isEditMode}
            activeOpacity={isEditMode ? 0.7 : 1}
          >
            <Animated.View style={[
              styles.infoRowContent,
              isEditMode && {
                borderWidth: 2,
                borderColor: blinkAnim.interpolate({
                  inputRange: [0.3, 1],
                  outputRange: [theme.colors.error + '60', theme.colors.error]
                }),
                borderRadius: 8,
                padding: 8,
              }
            ]}>
              <Text style={styles.infoLabel}>İlçe:</Text>
              <Text style={styles.infoValue}>
                {Array.isArray(tempRequestData.districts) && tempRequestData.districts?.length > 0
                  ? tempRequestData.districts.join(', ')
                  : Array.isArray(request.districts) && request.districts.length > 0
                    ? request.districts.join(', ')
                    : request.district || 'Belirtilmemiş'
                }
              </Text>
            </Animated.View>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.infoRow, isEditMode && styles.editableRow]}
            onPress={() => isEditMode && startEditing('neighborhood')}
            disabled={!isEditMode}
            activeOpacity={isEditMode ? 0.7 : 1}
          >
            <Animated.View style={[
              styles.infoRowContent,
              isEditMode && {
                borderWidth: 2,
                borderColor: blinkAnim.interpolate({
                  inputRange: [0.3, 1],
                  outputRange: [theme.colors.error + '60', theme.colors.error]
                }),
                borderRadius: 8,
                padding: 8,
              }
            ]}>
              <Text style={styles.infoLabel}>Mahalle:</Text>
              <Text style={styles.infoValue}>
                {Array.isArray(tempRequestData.neighborhoods) && tempRequestData.neighborhoods?.length > 0
                  ? tempRequestData.neighborhoods.join(', ')
                  : Array.isArray(request.neighborhoods) && request.neighborhoods.length > 0
                    ? request.neighborhoods.join(', ')
                    : request.neighborhood || 'Belirtilmemiş'
                }
              </Text>
            </Animated.View>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.infoRow, isEditMode && styles.editableRow]}
            onPress={() => isEditMode && startEditing('budget')}
            disabled={!isEditMode}
            activeOpacity={isEditMode ? 0.7 : 1}
          >
            <Animated.View style={[
              styles.infoRowContent,
              isEditMode && {
                borderWidth: 2,
                borderColor: blinkAnim.interpolate({
                  inputRange: [0.3, 1],
                  outputRange: [theme.colors.error + '60', theme.colors.error]
                }),
                borderRadius: 8,
                padding: 8,
              }
            ]}>
              <Text style={styles.infoLabel}>Bütçe Aralığı:</Text>
              <Text style={styles.infoValue}>{getBudgetLabel()}</Text>
            </Animated.View>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.infoRow, isEditMode && styles.editableRow]}
            onPress={() => isEditMode && startEditing('squareMeters')}
            disabled={!isEditMode}
            activeOpacity={isEditMode ? 0.7 : 1}
          >
            <Animated.View style={[
              styles.infoRowContent,
              isEditMode && {
                borderWidth: 2,
                borderColor: blinkAnim.interpolate({
                  inputRange: [0.3, 1],
                  outputRange: [theme.colors.error + '60', theme.colors.error]
                }),
                borderRadius: 8,
                padding: 8,
              }
            ]}>
              <Text style={styles.infoLabel}>Metrekare Aralığı:</Text>
              <Text style={styles.infoValue}>{getSquareMetersLabel()}</Text>
            </Animated.View>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.infoRow, isEditMode && styles.editableRow]}
            onPress={() => isEditMode && startEditing('propertyType')}
            disabled={!isEditMode}
            activeOpacity={isEditMode ? 0.7 : 1}
          >
            <Animated.View style={[
              styles.infoRowContent,
              isEditMode && {
                borderWidth: 2,
                borderColor: blinkAnim.interpolate({
                  inputRange: [0.3, 1],
                  outputRange: [theme.colors.error + '60', theme.colors.error]
                }),
                borderRadius: 8,
                padding: 8,
              }
            ]}>
              <Text style={styles.infoLabel}>Emlak Tipi:</Text>
              <Text style={styles.infoValue}>{tempRequestData.propertyType || request.propertyType}</Text>
            </Animated.View>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.infoRow, isEditMode && styles.editableRow]}
            onPress={() => isEditMode && startEditing('roomCount')}
            disabled={!isEditMode}
            activeOpacity={isEditMode ? 0.7 : 1}
          >
            <Animated.View style={[
              styles.infoRowContent,
              isEditMode && {
                borderWidth: 2,
                borderColor: blinkAnim.interpolate({
                  inputRange: [0.3, 1],
                  outputRange: [theme.colors.error + '60', theme.colors.error]
                }),
                borderRadius: 8,
                padding: 8,
              }
            ]}>
              <Text style={styles.infoLabel}>Oda Sayısı:</Text>
              <Text style={styles.infoValue}>
                {isEditMode && Array.isArray(tempRequestData.roomCount)
                  ? tempRequestData.roomCount.join(', ')
                  : Array.isArray(request.roomCount)
                    ? request.roomCount.join(', ')
                    : tempRequestData.roomCount || request.roomCount || 'Belirtilmemiş'
                }
              </Text>
            </Animated.View>
          </TouchableOpacity>

          {request.createdAt && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Oluşturulma Tarihi:</Text>
              <Text style={styles.infoValue}>
                {new Date(request.createdAt).toLocaleDateString('tr-TR', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>
            </View>
          )}

          {request.publishToPool && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Yayın Durumu:</Text>
              <Text style={styles.infoValue}>
                {request.isPublished ? 'Yayınlandı' : 'Taslak'}
              </Text>
            </View>
          )}
        </GlassmorphismView>

        {/* Eşleşen Portföyler - Talep Bilgileri altında, İletişim üstünde */}
        <GlassmorphismView
          style={[styles.card, styles.matchingCard]}
          borderRadius={theme.borderRadius.xl}
          blurEnabled={false}
          config={{
            overlayColor: 'rgba(224, 220, 220, 0.81)',
            startColor: 'rgba(220, 20, 60, 1)',
            endColor: 'rgba(220, 20, 60, 0.36)',
            gradientAlpha: 1,
            gradientDirection: 150,
            gradientSpread: 7,
            ditherStrength: 5.0,
          }}
          onLayout={(e) => setMatchingY(e.nativeEvent.layout.y)}
        >
          <TouchableOpacity style={styles.matchingHeader} onPress={toggleMatching} activeOpacity={0.8}>
            <View style={styles.titleWithIcon}>
              <Image
                source={require('../assets/images/icons/portfoy.png')}
                style={styles.matchingTitleIcon}
              />
              <Text style={[styles.cardTitle, styles.matchingTitle]}>Eşleşen Portföyler ({matchingPortfolios.length})</Text>
            </View>
            <Text style={styles.matchingToggle}>{isMatchingExpanded ? '▲' : '▼'}</Text>
          </TouchableOpacity>
          
          <Animated.View
            style={{
              maxHeight: animatedHeight.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 800],
              }),
              opacity: animatedHeight,
              overflow: 'hidden',
            }}
          >
            <View style={styles.matchingListGrid}>
              {matchingPortfolios.map((p) => (
                <View key={p.id} style={styles.matchingItemCompact}>
                  <ListingCard
                    listing={p}
                    onPress={() => navigation.navigate('PropertyDetail', { portfolio: p })}
                    isEditable={false}
                  />
                </View>
              ))}
            </View>
          </Animated.View>
        </GlassmorphismView>

        <GlassmorphismView
          style={[styles.card, styles.contactCard]}
          borderRadius={theme.borderRadius.xl}
          blurEnabled={false}
          config={{
            overlayColor: 'rgba(224, 220, 220, 0.81)',
            startColor: 'rgba(220, 20, 60, 1)',
            endColor: 'rgba(220, 20, 60, 0.36)',
            gradientAlpha: 1,
            gradientDirection: 150,
            gradientSpread: 7,
            ditherStrength: 5.0,
          }}
        >
          <View style={styles.contactHeader}>
            <View style={styles.titleWithIcon}>
              <Image
                source={require('../assets/images/icons/useralt.png')}
                style={[styles.titleIcon, { tintColor: theme.colors.textWhite }]}
              />
              <Text style={styles.cardTitle}>İletişim Bilgileri</Text>
            </View>
            <Text style={[styles.contactWarning, { color: theme.colors.textWhite }]}>
              "Bu bilgileri sadece siz görebilirsiniz"
            </Text>
          </View>

          {request.contactInfo ? (
            <TouchableOpacity 
              onPress={() => isEditMode && startEditing('contact')}
              disabled={!isEditMode}
              activeOpacity={isEditMode ? 0.7 : 1}
            >
              <Animated.View style={[
                isEditMode && {
                  borderWidth: 2,
                  borderColor: blinkAnim.interpolate({
                    inputRange: [0.3, 1],
                    outputRange: [theme.colors.error + '60', theme.colors.error]
                  }),
                  borderRadius: 8,
                  padding: 8,
                  marginBottom: theme.spacing.sm,
                }
              ]}>
                <View style={[styles.infoRow, { borderBottomColor: theme.colors.textWhite + '55' }]}>
                  <Text style={styles.infoLabel}>İletişim:</Text>
                  <Text style={styles.infoValue}>
                    {tempRequestData.contactInfo?.name || request.contactInfo.name || 'Belirtilmemiş'}
                  </Text>
                </View>

                <View style={[styles.infoRow, { borderBottomColor: theme.colors.textWhite + '55' }]}>
                  <Text style={styles.infoLabel}>Telefon:</Text>
                  <Text style={styles.infoValue}>
                    {tempRequestData.contactInfo?.phone || request.contactInfo.phone || 'Belirtilmemiş'}
                  </Text>
                </View>
              </Animated.View>
            </TouchableOpacity>
          ) : (
            <Text style={styles.contactText}>
              Bu talep için iletişime geçmek istiyorsanız, lütfen portföy sahibi ile iletişime geçin.
            </Text>
          )}
        </GlassmorphismView>

        <GlassmorphismView
          style={styles.card}
          borderRadius={theme.borderRadius.xl}
          blurEnabled={false}
          config={{
            overlayColor: 'rgba(224, 220, 220, 0.81)',
            startColor: 'rgb(10, 22, 31)',
            endColor: 'rgba(17, 36, 49, 0.64)',
            gradientAlpha: 1,
            gradientDirection: 150,
            gradientSpread: 7,
            ditherStrength: 5.0,
          }}
        >
          <Text style={styles.cardTitle}>Talep Sahibi</Text>

          <View style={styles.ownerContainer}>
            <View style={styles.ownerInfo}>
              <View style={styles.ownerImageContainer}>
                <Image
                  source={
                    request.userProfile?.profilePicture && request.userProfile.profilePicture !== 'default-logo'
                      ? { uri: request.userProfile.profilePicture }
                      : require('../assets/images/logo-krimson.png')
                  }
                  style={styles.ownerImage}
                />
              </View>
              <View style={styles.ownerDetails}>
                <Text style={styles.ownerName}>
                  {request.userProfile?.name || 'İsim belirtilmemiş'}
                </Text>
                <Text style={styles.ownerOffice}>
                  {request.userProfile?.office || 'Ofis belirtilmemiş'}
                </Text>
                <Text style={styles.ownerPhone}>
                  {request.contactInfo?.phone || 'Telefon belirtilmemiş'}
                </Text>
              </View>
            </View>

            <View style={styles.ownerButtons}>
              <TouchableOpacity
                style={styles.phoneButton}
                onPress={() => {
                  const phone = (ownerPhone || '').trim();
                  if (!phone) {
                    Alert.alert('Bilgi', 'Telefon bilgisi bulunamadı.');
                    return;
                  }
                  makePhoneCall(phone);
                }}
              >
                <Image
                  source={require('../assets/images/icons/phonefill.png')}
                  style={styles.phoneButtonIcon}
                />
                <Text style={styles.phoneButtonText}>Ara</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.whatsappButton}
                onPress={() => {
                  const phone = (ownerPhone || '').trim();
                  if (!phone) {
                    Alert.alert('Bilgi', 'Telefon bilgisi bulunamadı.');
                    return;
                  }
                  const title = request?.title ? request.title : 'talep';
                  sendWhatsAppMessage(phone, `Merhaba, ${title} talebiniz hakkında bilgi almak istiyorum.`);
                }}
              >
                <Image
                  source={require('../assets/images/icons/whatsapp.png')}
                  style={styles.whatsappButtonIcon}
                />
                <Text style={styles.whatsappButtonText}>WhatsApp</Text>
              </TouchableOpacity>
            </View>
          </View>
        </GlassmorphismView>

        
        </Animatable.View>
      </ScrollView>
      
      {/* Edit Modals */}
      <Modal visible={showTitleModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Başlık Düzenle</Text>
            <TextInput
              style={styles.modalInput}
              value={tempRequestData.title || ''}
              onChangeText={(text) => setTempRequestData(prev => ({ ...prev, title: text }))}
              placeholder="Talep başlığı"
              placeholderTextColor={theme.colors.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalCancelButton} onPress={() => setShowTitleModal(false)}>
                <Text style={styles.modalCancelText}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveButton} onPress={() => setShowTitleModal(false)}>
                <Text style={styles.modalSaveText}>Tamam</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showDescriptionModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Açıklama Düzenle</Text>
            <TextInput
              style={[styles.modalInput, styles.modalTextArea]}
              value={tempRequestData.description || ''}
              onChangeText={(text) => setTempRequestData(prev => ({ ...prev, description: text }))}
              placeholder="Talep açıklaması"
              placeholderTextColor={theme.colors.textSecondary}
              multiline
              numberOfLines={4}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalCancelButton} onPress={() => setShowDescriptionModal(false)}>
                <Text style={styles.modalCancelText}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveButton} onPress={() => setShowDescriptionModal(false)}>
                <Text style={styles.modalSaveText}>Tamam</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showMinPriceModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Bütçe Aralığı Düzenle</Text>
            <BudgetSlider 
              tempRequestData={tempRequestData}
              setTempRequestData={setTempRequestData}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalCancelButton} onPress={() => setShowMinPriceModal(false)}>
                <Text style={styles.modalCancelText}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveButton} onPress={() => setShowMinPriceModal(false)}>
                <Text style={styles.modalSaveText}>Tamam</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showMinSquareMetersModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Metrekare Aralığı Düzenle</Text>
            <SquareMetersSlider 
              tempRequestData={tempRequestData}
              setTempRequestData={setTempRequestData}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalCancelButton} onPress={() => setShowMinSquareMetersModal(false)}>
                <Text style={styles.modalCancelText}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveButton} onPress={() => setShowMinSquareMetersModal(false)}>
                <Text style={styles.modalSaveText}>Tamam</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showRoomCountModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Oda Sayısı Seçin</Text>
            <ScrollView style={styles.checkboxScrollView}>
              <View style={styles.checkboxGrid}>
                {roomOptions.map((option) => {
                  const isSelected = (tempRequestData.roomCount || []).includes(option);
                  return (
                    <TouchableOpacity
                      key={option}
                      style={[styles.checkboxItem, isSelected && styles.checkboxItemSelected]}
                      onPress={() => {
                        const currentSelection = tempRequestData.roomCount || [];
                        const newSelection = isSelected
                          ? currentSelection.filter(item => item !== option)
                          : [...currentSelection, option];
                        setTempRequestData(prev => ({ ...prev, roomCount: newSelection }));
                      }}
                    >
                      <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                        {isSelected && <Text style={styles.checkboxCheck}>✓</Text>}
                      </View>
                      <Text style={[styles.checkboxLabel, isSelected && styles.checkboxLabelSelected]}>
                        {option}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalCancelButton} onPress={() => setShowRoomCountModal(false)}>
                <Text style={styles.modalCancelText}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveButton} onPress={() => setShowRoomCountModal(false)}>
                <Text style={styles.modalSaveText}>Tamam</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showPropertyTypeModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Emlak Tipi Seçin</Text>
            <ScrollView style={styles.checkboxScrollView}>
              <View style={styles.checkboxGrid}>
                {propertyTypes.map((type) => {
                  const isSelected = tempRequestData.propertyType === type;
                  return (
                    <TouchableOpacity
                      key={type}
                      style={[styles.checkboxItem, isSelected && styles.checkboxItemSelected]}
                      onPress={() => setTempRequestData(prev => ({ ...prev, propertyType: type }))}
                    >
                      <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                        {isSelected && <Text style={styles.checkboxCheck}>✓</Text>}
                      </View>
                      <Text style={[styles.checkboxLabel, isSelected && styles.checkboxLabelSelected]}>
                        {type}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalCancelButton} onPress={() => setShowPropertyTypeModal(false)}>
                <Text style={styles.modalCancelText}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveButton} onPress={() => setShowPropertyTypeModal(false)}>
                <Text style={styles.modalSaveText}>Tamam</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showContactModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>İletişim Bilgileri Düzenle</Text>
            <Text style={styles.modalLabel}>İsim</Text>
            <TextInput
              style={styles.modalInput}
              value={tempRequestData.contactInfo?.name || ''}
              onChangeText={(text) => setTempRequestData(prev => ({ 
                ...prev, 
                contactInfo: { ...prev.contactInfo, name: text }
              }))}
              placeholder="İletişim kişisi adı"
              placeholderTextColor={theme.colors.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.modalLabel}>Telefon</Text>
            <TextInput
              style={styles.modalInput}
              value={tempRequestData.contactInfo?.phone || ''}
              onChangeText={(text) => setTempRequestData(prev => ({ 
                ...prev, 
                contactInfo: { ...prev.contactInfo, phone: text }
              }))}
              placeholder="Telefon numarası"
              placeholderTextColor={theme.colors.textSecondary}
              keyboardType="phone-pad"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalCancelButton} onPress={() => setShowContactModal(false)}>
                <Text style={styles.modalCancelText}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveButton} onPress={() => setShowContactModal(false)}>
                <Text style={styles.modalSaveText}>Tamam</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* İlçe Seçimi Modal */}
      <Modal visible={showDistrictModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>İlçe Seçin (Çoklu Seçim)</Text>
              <TouchableOpacity
                style={styles.clearButton}
                onPress={() => setTempRequestData(prev => ({ ...prev, districts: [] }))}
              >
                <Text style={styles.clearButtonText}>Hepsini Temizle</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.checkboxScrollView}>
              <View style={styles.checkboxGrid}>
                {/* Hepsi seçeneği */}
                <TouchableOpacity
                  style={[
                    styles.checkboxItem,
                    (tempRequestData.districts || []).length === (turkeyDistricts[request.city || 'Samsun'] || []).length && 
                    (turkeyDistricts[request.city || 'Samsun'] || []).length > 0 && 
                    styles.checkboxItemSelected
                  ]}
                  onPress={() => {
                    const allDistricts = turkeyDistricts[request.city || 'Samsun'] || [];
                    const newDistricts = (tempRequestData.districts || []).length === allDistricts.length ? [] : allDistricts;
                    setTempRequestData(prev => ({ ...prev, districts: newDistricts }));
                  }}
                >
                  <View style={[
                    styles.checkbox,
                    (tempRequestData.districts || []).length === (turkeyDistricts[request.city || 'Samsun'] || []).length && 
                    (turkeyDistricts[request.city || 'Samsun'] || []).length > 0 && 
                    styles.checkboxSelected
                  ]}>
                    {(tempRequestData.districts || []).length === (turkeyDistricts[request.city || 'Samsun'] || []).length && 
                     (turkeyDistricts[request.city || 'Samsun'] || []).length > 0 && (
                      <Text style={styles.checkboxCheck}>✓</Text>
                    )}
                  </View>
                  <Text style={[
                    styles.checkboxLabel,
                    (tempRequestData.districts || []).length === (turkeyDistricts[request.city || 'Samsun'] || []).length && 
                    (turkeyDistricts[request.city || 'Samsun'] || []).length > 0 && 
                    styles.checkboxLabelSelected
                  ]}>
                    Hepsi
                  </Text>
                </TouchableOpacity>

                {/* Bireysel ilçe seçenekleri */}
                {(turkeyDistricts[request.city || 'Samsun'] || []).map((district) => {
                  const isSelected = (tempRequestData.districts || []).includes(district);
                  return (
                    <TouchableOpacity
                      key={district}
                      style={[styles.checkboxItem, isSelected && styles.checkboxItemSelected]}
                      onPress={() => {
                        const currentDistricts = tempRequestData.districts || [];
                        const newDistricts = isSelected
                          ? currentDistricts.filter(d => d !== district)
                          : [...currentDistricts, district];
                        setTempRequestData(prev => ({ ...prev, districts: newDistricts }));
                      }}
                    >
                      <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                        {isSelected && <Text style={styles.checkboxCheck}>✓</Text>}
                      </View>
                      <Text style={[styles.checkboxLabel, isSelected && styles.checkboxLabelSelected]}>
                        {district}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalCancelButton} onPress={() => setShowDistrictModal(false)}>
                <Text style={styles.modalCancelText}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveButton} onPress={() => setShowDistrictModal(false)}>
                <Text style={styles.modalSaveText}>Tamam</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Mahalle Seçimi Modal */}
      <Modal visible={showNeighborhoodModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Mahalle Seçin (Çoklu Seçim)</Text>
              <TouchableOpacity
                style={styles.clearButton}
                onPress={() => setTempRequestData(prev => ({ ...prev, neighborhoods: [] }))}
              >
                <Text style={styles.clearButtonText}>Hepsini Temizle</Text>
              </TouchableOpacity>
            </View>
            
            {loadingNeighborhoods ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={theme.colors.error} />
                <Text style={styles.loadingText}>Mahalleler yükleniyor...</Text>
                <Text style={styles.loadingSubText}>(İlk seferlik yükleme)</Text>
              </View>
            ) : (
              <ScrollView style={styles.checkboxScrollView}>
                <View style={styles.checkboxGrid}>
                  {(() => {
                    // availableNeighborhoods kullan
                    const uniqueNeighborhoods = availableNeighborhoods;

                    if (uniqueNeighborhoods.length === 0) {
                      return (
                        <Text style={styles.checkboxLabel}>
                          Önce en az bir ilçe seçmelisiniz
                        </Text>
                      );
                    }

                    // Hepsi seçeneği
                    const allSelected = uniqueNeighborhoods.length > 0 && 
                      uniqueNeighborhoods.every(n => (tempRequestData.neighborhoods || []).includes(n));

                    return [
                      <TouchableOpacity
                        key="hepsi"
                        style={[styles.checkboxItem, allSelected && styles.checkboxItemSelected]}
                        onPress={() => {
                          const newNeighborhoods = allSelected ? [] : uniqueNeighborhoods;
                          setTempRequestData(prev => ({ ...prev, neighborhoods: newNeighborhoods }));
                        }}
                      >
                        <View style={[styles.checkbox, allSelected && styles.checkboxSelected]}>
                          {allSelected && <Text style={styles.checkboxCheck}>✓</Text>}
                        </View>
                        <Text style={[styles.checkboxLabel, allSelected && styles.checkboxLabelSelected]}>
                          Hepsi
                        </Text>
                      </TouchableOpacity>,

                      ...uniqueNeighborhoods.map((neighborhood) => {
                        const isSelected = (tempRequestData.neighborhoods || []).includes(neighborhood);
                        return (
                          <TouchableOpacity
                            key={neighborhood}
                            style={[styles.checkboxItem, isSelected && styles.checkboxItemSelected]}
                            onPress={() => {
                              const currentNeighborhoods = tempRequestData.neighborhoods || [];
                              const newNeighborhoods = isSelected
                                ? currentNeighborhoods.filter(n => n !== neighborhood)
                                : [...currentNeighborhoods, neighborhood];
                              setTempRequestData(prev => ({ ...prev, neighborhoods: newNeighborhoods }));
                            }}
                          >
                            <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                              {isSelected && <Text style={styles.checkboxCheck}>✓</Text>}
                            </View>
                            <Text style={[styles.checkboxLabel, isSelected && styles.checkboxLabelSelected]}>
                              {neighborhood}
                            </Text>
                          </TouchableOpacity>
                        );
                      })
                    ];
                  })()}
                </View>
              </ScrollView>
            )}
            
            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={styles.modalCancelButton} 
                onPress={() => setShowNeighborhoodModal(false)}
                disabled={loadingNeighborhoods}
              >
                <Text style={styles.modalCancelText}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalSaveButton, loadingNeighborhoods && styles.modalButtonDisabled]} 
                onPress={() => setShowNeighborhoodModal(false)}
                disabled={loadingNeighborhoods}
              >
                <Text style={styles.modalSaveText}>Tamam</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Success Modal - PropertyDetail gibi (Otomatik kapanır) */}
      <Modal 
        visible={showSuccessModal} 
        transparent 
        animationType="fade"
        onRequestClose={() => setShowSuccessModal(false)}
      >
        <View style={styles.successModalOverlay}>
          <View style={styles.successModalContent}>
            <View style={styles.successIconContainer}>
              <Text style={styles.successIcon}>✓</Text>
            </View>
            <Text style={styles.successTitle}>Başarılı!</Text>
            <Text style={styles.successMessage}>
              {updatedFields.length > 0 
                ? `${updatedFields.join(', ')} başarıyla güncellendi.`
                : 'İşlem tamamlandı.'
              }
            </Text>
          </View>
        </View>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        visible={showDeleteModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowDeleteModal(false)}
      >
        <View style={styles.deleteModalOverlay}>
          <View style={styles.deleteModalContent}>
            <View style={styles.deleteModalHeader}>
              <Text style={styles.deleteModalTitle}>
                ⚠️ Talebi Sil
              </Text>
            </View>
            
            <View style={styles.deleteModalBody}>
              <Text style={styles.deleteModalMessage}>
                Bu talebi silmek istediğinize emin misiniz?
              </Text>
              <Text style={styles.deleteModalWarning}>
                Bu işlem geri alınamaz!
              </Text>
            </View>

            <View style={styles.deleteModalButtons}>
              <TouchableOpacity
                style={styles.deleteModalCancelButton}
                onPress={() => setShowDeleteModal(false)}
              >
                <Text style={styles.deleteModalCancelText}>İptal</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.deleteModalConfirmButton}
                onPress={async () => {
                  try {
                    setShowDeleteModal(false);
                    // TODO: Implement delete request functionality
                    Alert.alert('Başarılı', 'Talep silindi.');
                    navigation.goBack();
                  } catch (error) {
                    console.error('Talep silme hatası:', error);
                    Alert.alert('Hata', 'Talep silinirken bir hata oluştu.');
                  }
                }}
              >
                <Text style={styles.deleteModalConfirmText}>
                  Sil
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const createStyles = (isDark) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: isDark ? '#071317' : theme.colors.background,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    /* üst padding runtime'da insets.top + 12 verilecek */
    paddingBottom: theme.spacing.lg,
    backgroundColor: theme.colors.transparent,
    borderBottomWidth: 0,
  },
  
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  
  headerDeleteButton: {
    width: 37,
    height: 37,
    backgroundColor: theme.colors.error,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.xs,
  },
  
  headerDeleteIcon: {
    width: 20,
    height: 20,
    tintColor: theme.colors.textWhite,
  },
  
  headerCloseButton: {
    width: 37,
    height: 37,
    backgroundColor: theme.colors.textSecondary,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.xs,
  },
  
  headerCloseText: {
    color: theme.colors.textWhite,
    fontSize: 22,
    fontWeight: 'bold',
  },
  
  headerEditButton: {
    height: 37,
    backgroundColor: theme.colors.error,
    paddingHorizontal: theme.spacing.md,
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  
  headerEditIcon: {
    width: 18,
    height: 18,
    tintColor: theme.colors.textWhite,
  },
  
  headerEditText: {
    color: theme.colors.textWhite,
    fontSize: theme.fontSizes.md,
    fontWeight: theme.fontWeights.semibold,
  },
  
  headerSpacer: {
    width: 37,
  },

  backButton: {
    width: 37,
    height: 37,
    borderRadius: 8,
    backgroundColor: theme.colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0, // Border kaldırıldı
  },

  backButtonText: {
    fontSize: theme.fontSizes.xxl,
    color: theme.colors.text,
    fontWeight: theme.fontWeights.bold,
  },

  backButtonIcon: {
    width: 16,
    height: 16,
    tintColor: theme.colors.textWhite,
  },

  headerTitle: {
    fontSize: theme.fontSizes.xxl,
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.white,
  },

  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },

  headerSubtitle: {
    fontSize: theme.fontSizes.sm,
    color: theme.colors.textWhite + 'CC',
    textAlign: 'center',
    marginTop: 2,
  },

  placeholder: {
    width: 40,
  },

  content: {
    flex: 1,
    padding: theme.spacing.lg,
  },

  card: {
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
  },

  cardTitle: {
    fontSize: theme.fontSizes.xxl,
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.textWhite,
    marginBottom: 0,
  },
  titleWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
    flex: 1,
  },
  titleIcon: {
    width: 24,
    height: 24,
    tintColor: theme.colors.error,
    marginRight: theme.spacing.sm,
  },
  matchingTitleIcon: {
    width: 24,
    height: 24,
    tintColor: theme.colors.textWhite,
    marginRight: theme.spacing.sm,
  },
  matchingCard: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderColor: 'transparent',
  },
  matchingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.xs,
  },
  matchingTitle: {
    color: theme.colors.textWhite,
  },
  matchingToggle: {
    fontSize: theme.fontSizes.xl,
    color: theme.colors.textWhite,
    fontWeight: theme.fontWeights.bold,
  },

  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },

  infoLabel: {
    fontSize: theme.fontSizes.md,
    fontWeight: theme.fontWeights.semibold,
    color: theme.colors.textWhite,
    flex: 1,
  },

  infoValue: {
    fontSize: theme.fontSizes.md,
    color: theme.colors.textWhite,
    flex: 2,
    textAlign: 'right',
  },

  contactText: {
    fontSize: theme.fontSizes.md,
    color: theme.colors.textWhite,
    lineHeight: 20,
  },

  actionContainer: {
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.xxl,
  },

  primaryButton: {
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
  },

  primaryButtonText: {
    color: theme.colors.textWhite,
    fontSize: theme.fontSizes.xl,
    fontWeight: theme.fontWeights.semibold,
  },

  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background,
    padding: theme.spacing.lg,
  },

  errorText: {
    fontSize: theme.fontSizes.xl,
    color: theme.colors.textWhite,
    marginBottom: theme.spacing.lg,
    textAlign: 'center',
  },
  
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background,
  },
  
  loadingText: {
    fontSize: theme.fontSizes.lg,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.md,
  },

  // Contact Card Styles
  contactCard: {
    borderWidth: 2,
    borderColor: theme.colors.error,
    borderRadius: theme.borderRadius.xl,
  },

  contactHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.md,
  },

  contactWarning: {
    fontSize: theme.fontSizes.sm,
    color: theme.colors.error,
    fontStyle: 'italic',
    flex: 1,
    textAlign: 'right',
  },

  // Owner Container Styles
  ownerContainer: {
    marginTop: theme.spacing.md,
  },

  ownerInfo: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center', // İçeriği ortala
    marginBottom: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },

  ownerImageContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: theme.colors.cardBg,
    padding: 4,
    marginBottom: theme.spacing.md, // Alt boşluk
    alignItems: 'center',
    justifyContent: 'center',
  },

  ownerImage: {
    width: 72,
    height: 72,
    borderRadius: 36,
  },

  ownerDetails: {
    flex: 1,
    alignItems: 'center', // İçeriği ortala
  },

  ownerName: {
    fontSize: theme.fontSizes.xxl,
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.textWhite,
    marginBottom: theme.spacing.xs,
    textAlign: 'center', // Metni ortala
  },

  ownerOffice: {
    fontSize: theme.fontSizes.lg,
    color: theme.colors.textWhite,
    marginBottom: theme.spacing.xs,
    fontWeight: theme.fontWeights.bold, // Daha kalın
    textAlign: 'center', // Metni ortala
  },

  ownerPhone: {
    fontSize: theme.fontSizes.lg,
    color: theme.colors.error,
    fontWeight: theme.fontWeights.semibold,
    textAlign: 'center', // Metni ortala
  },

  ownerButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    marginTop: theme.spacing.md,
  },

  phoneButton: {
    flex: 1,
    height: 50,
    backgroundColor: theme.colors.error,
    borderRadius: theme.borderRadius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    ...theme.shadows.small,
  },

  phoneButtonText: {
    fontSize: theme.fontSizes.md,
    color: theme.colors.textWhite,
    fontWeight: theme.fontWeights.semibold,
  },

  phoneButtonIcon: {
    width: 20,
    height: 20,
    tintColor: theme.colors.textWhite,
  },

  whatsappButton: {
    flex: 1,
    height: 50,
    backgroundColor: theme.colors.success,
    borderRadius: theme.borderRadius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    ...theme.shadows.small,
  },

  whatsappButtonText: {
    fontSize: theme.fontSizes.md,
    color: theme.colors.textWhite,
    fontWeight: theme.fontWeights.semibold,
  },

  whatsappButtonIcon: {
    width: 26, // 26px boyut
    height: 26, // 26px boyut
    tintColor: theme.colors.textWhite,
  },

  // Matching list styles - Grid layout
  matchingListGrid: {
    marginTop: theme.spacing.md,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  matchingItemCompact: {
    width: '48%',
    transform: [{ scale: 0.95 }],
  },
  
  // Edit mode styles
  editableRow: {
    cursor: 'pointer',
  },
  
  infoRowContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flex: 1,
  },
  
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.lg,
  },
  
  modalContent: {
    backgroundColor: theme.colors.cardBg,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.xl,
    width: '100%',
    maxWidth: 400,
  },
  
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  modalTitle: {
    fontSize: theme.fontSizes.xxl,
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.textWhite,
    flex: 1,
  },
  clearButton: {
    backgroundColor: theme.colors.error + '20',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
    marginLeft: theme.spacing.sm,
  },
  clearButtonText: {
    color: theme.colors.error,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.semibold,
  },
  
  modalLabel: {
    fontSize: theme.fontSizes.md,
    fontWeight: theme.fontWeights.semibold,
    color: theme.colors.textWhite,
    marginBottom: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  
  modalInput: {
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    fontSize: theme.fontSizes.md,
    color: theme.colors.textWhite,
    marginBottom: theme.spacing.lg,
  },
  
  modalTextArea: {
    height: 120,
    textAlignVertical: 'top',
  },
  
  modalButtons: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  
  modalCancelButton: {
    flex: 1,
    backgroundColor: theme.colors.background,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  
  modalCancelText: {
    color: theme.colors.textWhite,
    fontSize: theme.fontSizes.md,
    fontWeight: theme.fontWeights.semibold,
    textAlign: 'center',
  },
  
  modalSaveButton: {
    flex: 1,
    backgroundColor: theme.colors.error,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
  },
  
  modalSaveText: {
    color: theme.colors.textWhite,
    fontSize: theme.fontSizes.md,
    fontWeight: theme.fontWeights.semibold,
    textAlign: 'center',
  },
  
  modalButtonDisabled: {
    opacity: 0.5,
  },
  
  loadingSubText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.sm,
    marginTop: theme.spacing.xs,
    textAlign: 'center',
  },
  
  // Success modal styles (Notes sayfasındaki gibi)
  successModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  successModalContent: {
    backgroundColor: theme.colors.cardBg,
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    maxWidth: 320,
    ...theme.shadows.large,
  },
  
  successIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#28a745',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  
  successIcon: {
    fontSize: 32,
    color: '#fff',
    fontWeight: 'bold',
  },
  
  successTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.colors.textWhite,
    marginBottom: 12,
    textAlign: 'center',
  },
  
  successMessage: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },

  // Delete Modal Styles
  deleteModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteModalContent: {
    backgroundColor: theme.colors.cardBg,
    borderRadius: 20,
    padding: theme.spacing.xl,
    width: '85%',
    maxWidth: 400,
    ...theme.shadows.large,
  },
  deleteModalHeader: {
    marginBottom: theme.spacing.lg,
  },
  deleteModalTitle: {
    fontSize: theme.fontSizes.xxl,
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.error,
    textAlign: 'center',
  },
  deleteModalBody: {
    marginBottom: theme.spacing.xl,
  },
  deleteModalMessage: {
    fontSize: theme.fontSizes.lg,
    color: theme.colors.textWhite,
    textAlign: 'center',
    marginBottom: theme.spacing.md,
  },
  deleteModalWarning: {
    fontSize: theme.fontSizes.md,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  deleteModalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  deleteModalCancelButton: {
    flex: 1,
    backgroundColor: theme.colors.textSecondary,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
    alignItems: 'center',
  },
  deleteModalCancelText: {
    color: theme.colors.textWhite,
    fontSize: theme.fontSizes.md,
    fontWeight: theme.fontWeights.semibold,
  },
  deleteModalConfirmButton: {
    flex: 1,
    backgroundColor: theme.colors.error,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
    alignItems: 'center',
  },
  deleteModalConfirmText: {
    color: theme.colors.textWhite,
    fontSize: theme.fontSizes.md,
    fontWeight: theme.fontWeights.semibold,
  },

  // Checkbox Styles
  checkboxScrollView: {
    maxHeight: 400,
    marginBottom: theme.spacing.md,
  },
  checkboxGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  checkboxItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    marginVertical: 2,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: 'transparent',
    minWidth: '45%',
  },
  checkboxItemSelected: {
    backgroundColor: theme.colors.error + '20',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderColor: theme.colors.border,
    borderRadius: 4,
    marginRight: theme.spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    backgroundColor: theme.colors.error,
    borderColor: theme.colors.error,
  },
  checkboxCheck: {
    color: theme.colors.textWhite,
    fontSize: 12,
    fontWeight: theme.fontWeights.bold,
  },
  checkboxLabel: {
    fontSize: theme.fontSizes.md,
    color: theme.colors.textWhite,
    flex: 1,
  },
  checkboxLabelSelected: {
    color: theme.colors.error,
    fontWeight: theme.fontWeights.semibold,
  },
});

export default memo(RequestDetail);
