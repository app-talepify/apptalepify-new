import {
  View,
  Text,
  ScrollView,
  Image,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Platform,
  StatusBar,
  Dimensions,
  Modal,
  Easing,
  Share,
  BackHandler,
  FlatList,
  InteractionManager,
  LayoutAnimation,
  UIManager,
  TextInput,
  Alert,
  Clipboard,
  Linking,
} from 'react-native';
import { PinchGestureHandler, State, GestureHandlerRootView } from 'react-native-gesture-handler';
import MapboxGL from '@rnmapbox/maps';
import ImagePicker from 'react-native-image-crop-picker';

// Mapbox global olarak App.js'de başlatılır (token .env'den okunur)

import React, { useState, useEffect, useCallback, useMemo, memo, useRef } from 'react';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';
import GlassmorphismView from '../components/GlassmorphismView';
import { makePhoneCall, sendWhatsAppMessage } from '../utils/contactUtils';
import { useAuth } from '../context/AuthContext';
import { fetchRequests, fetchUserRequests } from '../services/firestore';
import { getMatchingRequestsForPortfolio } from '../utils/requestMatching';
import { useTheme } from '../theme/ThemeContext';
import SocialShareTemplate from '../components/SocialShareTemplate';
import PermissionManagementModal from '../components/PermissionManagementModal';
import { sendSMS, createPermissionRequestSMS } from '../services/smsService';
import { db as firestore } from '../firebase';
import { collection, addDoc, query, where, orderBy, limit, getDocs, doc, getDoc, deleteDoc, updateDoc, serverTimestamp, documentId } from 'firebase/firestore';
// Fiyat değişim bildirimleri artık tamamen backend Firestore trigger'ı ile yönetiliyor
// import { notifyPortfolioPriceChange } from '../services/portfolioNotificationService';
import { togglePortfolioFavorite, isPortfolioFavorite, getPortfolioFavorites } from '../services/portfolioFavorites';
import { generateCustomShareLink } from '../services/permissionNotificationHandlers';
import { sanitizeImageUrl, img as cdnImg } from '../utils/media';
import * as Animatable from 'react-native-animatable';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const PropertyDetail = () => {
  const { theme: currentTheme, isDark } = useTheme();
  const { user, userProfile } = useAuth();
  const styles = useMemo(() => stylesFactory(currentTheme, isDark), [currentTheme, isDark]);

  // Gradient config for Share modal card (match DailyTasks confirm modal)
  const shareModalGlassConfig = useMemo(() => ({
    overlayColor: 'rgba(255, 0, 0, 0)',
    startColor: 'rgb(24, 54, 73)',
    endColor: 'rgba(17, 36, 49, 0.79)',
    gradientAlpha: 1,
    gradientDirection: 150,
    gradientSpread: 7,
    ditherStrength: 4.0,
  }), []);
  const route = useRoute();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { portfolio, fromScreen, onlyMine: fromOnlyMine, showFavorites: fromShowFavorites } = route.params || {};
  const isOwner = !!(user?.uid && portfolio?.userId === user.uid);

  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [showImageModal, setShowImageModal] = useState(false);
  const [showSocialShareTemplate, setShowSocialShareTemplate] = useState(false);
  const [showManagePanel, setShowManagePanel] = useState(false);
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [showRequestFeedbackModal, setShowRequestFeedbackModal] = useState(false);
  const [requestFeedbackMessage, setRequestFeedbackMessage] = useState('');
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [showPermissionRequestModal, setShowPermissionRequestModal] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState(null); // null, 'pending', 'approved', 'rejected'
  const [showShareLinkModal, setShowShareLinkModal] = useState(false);
  const [shareLinkData, setShareLinkData] = useState({ title: '', message: '', url: '', isCustom: false });
  
  // Matched Requests (Owner-only side panel view)
  const [showMatchedRequestsView, setShowMatchedRequestsView] = useState(false);
  const [matchedRequests, setMatchedRequests] = useState([]);
  const [loadingMatched, setLoadingMatched] = useState(false); // only for first load (no flicker)
  const [matchedRefreshing, setMatchedRefreshing] = useState(false); // background refresh while keeping list
  const [matchedError, setMatchedError] = useState('');
  const [matchedLastPortfolioId, setMatchedLastPortfolioId] = useState(null);
  const [matchedLastLoadedAt, setMatchedLastLoadedAt] = useState(0);
  const matchedUserCacheRef = useRef({});
  const [hiddenMatchedIds, setHiddenMatchedIds] = useState(new Set());
  const matchedRowAnimsRef = useRef({});
  const [showRequestOverlay, setShowRequestOverlay] = useState(false);
  const [requestOverlayAnim] = useState(new Animated.Value(0));
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [showHiddenOverlay, setShowHiddenOverlay] = useState(false);
  const [hiddenOverlayAnim] = useState(new Animated.Value(0));

  const formatRequestCreatedAt = useCallback((createdAt) => {
    try {
      const d = createdAt?.toDate ? createdAt.toDate() : (typeof createdAt?.seconds === 'number' ? new Date(createdAt.seconds * 1000) : new Date(createdAt));
      if (!(d instanceof Date) || isNaN(d.getTime())) return '—';
      const now = new Date();
      const yest = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
      const isYest = d.getFullYear() === yest.getFullYear() && d.getMonth() === yest.getMonth() && d.getDate() === yest.getDate();
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      if (sameDay) return `Bugün ${hh}:${mm}`;
      if (isYest) return `Dün ${hh}:${mm}`;
      const dd = String(d.getDate()).padStart(2, '0');
      const mo = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      return `${dd}.${mo}.${yyyy} ${hh}:${mm}`;
    } catch {
      return '—';
    }
  }, []);

  useEffect(() => {
    try {
      if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
        UIManager.setLayoutAnimationEnabledExperimental(true);
      }
    } catch {}
  }, []);

  const loadMatchedRequests = useCallback(async (opts = {}) => {
    const preferCache = !!opts.preferCache;
    if (!portfolio) { return; }

    const isSamePortfolio = matchedLastPortfolioId === portfolio.id;
    const hasCache = isSamePortfolio && matchedRequests.length > 0;
    const freshEnough = hasCache && (Date.now() - matchedLastLoadedAt) < 60000; // 60s cache
    if (preferCache && freshEnough) {
      return; // keep current list without flicker
    }

    const isInitial = !hasCache || !isSamePortfolio;
    if (isInitial) {
      setLoadingMatched(true);
    } else {
      setMatchedRefreshing(true);
    }
    setMatchedError('');
    try {
      // Fast pool fetch: server-side filtered by city/district/neighborhood/propertyType/listingStatus
      const fetchRequestsFast = async () => {
        const baseFilters = [
          where('isPublished', '==', true),
          where('publishToPool', '==', true),
        ];
        const filtersCity = portfolio.city ? [ where('city', '==', portfolio.city) ] : [];
        const filtersType = portfolio.propertyType ? [ where('propertyType', '==', portfolio.propertyType) ] : [];
        const filtersStatus = portfolio.listingStatus ? [ where('listingStatus', '==', portfolio.listingStatus) ] : [];

        const queries = [];
        // City + District
        if (portfolio.district) {
          queries.push(query(collection(firestore, 'requests'), ...baseFilters, ...filtersCity, where('districts', 'array-contains', portfolio.district), ...filtersType, ...filtersStatus, limit(80)));
          queries.push(query(collection(firestore, 'requests'), ...baseFilters, ...filtersCity, where('district', '==', portfolio.district), ...filtersType, ...filtersStatus, limit(80)));
        }
        // City + Neighborhood
        if (portfolio.neighborhood) {
          queries.push(query(collection(firestore, 'requests'), ...baseFilters, ...filtersCity, where('neighborhoods', 'array-contains', portfolio.neighborhood), ...filtersType, ...filtersStatus, limit(80)));
          queries.push(query(collection(firestore, 'requests'), ...baseFilters, ...filtersCity, where('neighborhood', '==', portfolio.neighborhood), ...filtersType, ...filtersStatus, limit(80)));
        }
        // City only fallback
        if (queries.length === 0) {
          queries.push(query(collection(firestore, 'requests'), ...baseFilters, ...filtersCity, ...filtersType, ...filtersStatus, limit(200)));
        }

        const snapshots = await Promise.all(queries.map(q => getDocs(q).catch(() => null)));
        const results = [];
        const seen = new Set();
        for (const snap of snapshots) {
          if (!snap) continue;
          snap.forEach(d => {
            const id = d.id;
            if (!seen.has(id)) {
              seen.add(id);
              results.push({ id, ...d.data() });
            }
          });
        }
        return results;
      };

      const [poolFast, mine] = await Promise.all([
        fetchRequestsFast().catch(() => null),
        user?.uid ? fetchUserRequests(user.uid) : Promise.resolve([]),
      ]);
      let pool = Array.isArray(poolFast) ? poolFast : null;
      if (!pool) {
        // Fallback to existing fetchRequests with coarse location filters
        const locationFilters = {
          city: portfolio.city || undefined,
          districts: portfolio.district ? [portfolio.district] : undefined,
          neighborhoods: portfolio.neighborhood ? [portfolio.neighborhood] : undefined,
          propertyType: portfolio.propertyType || undefined,
          listingStatus: portfolio.listingStatus || undefined,
        };
        try {
          pool = await fetchRequests(locationFilters, true);
        } catch {
          pool = [];
        }
      }
      const allReqs = isOwner ? ([...(pool || []), ...(mine || [])]) : ([...(mine || [])]);
      const seen = new Set();
      const unique = [];
      for (const r of allReqs) { if (r?.id && !seen.has(r.id)) { seen.add(r.id); unique.push(r); } }
      const matches = getMatchingRequestsForPortfolio(portfolio, unique, { tolerance: 0.10 });
      
      // Enrich matches with owner user profile (name, office, avatar) using batched fetch and cache
      const cache = matchedUserCacheRef.current || {};
      const userIds = Array.from(new Set(matches.map(m => m?.userId).filter(Boolean)));
      const idsToFetch = userIds.filter(uid => !cache[uid]);
      if (idsToFetch.length > 0) {
        const chunks = [];
        for (let i = 0; i < idsToFetch.length; i += 10) { chunks.push(idsToFetch.slice(i, i + 10)); }
        for (const chunk of chunks) {
          try {
            const q = query(collection(firestore, 'users'), where(documentId(), 'in', chunk));
            const snap = await getDocs(q);
            snap.forEach(docSnap => { cache[docSnap.id] = docSnap.data(); });
          } catch {}
        }
        matchedUserCacheRef.current = cache;
      }

      const enriched = matches.map((m) => {
        const u = m?.userId ? (cache[m.userId] || {}) : {};
        const profile = {
          name: u.name || u.displayName || '',
          officeName: u.officeName || '',
          profilePicture: u.profilePicture || '',
          phoneNumber: u.phoneNumber || u.phone || '',
        };
        return { ...m, userProfile: profile };
      });

      setMatchedRequests(enriched);
      setMatchedLastPortfolioId(portfolio.id || null);
      setMatchedLastLoadedAt(Date.now());
    } catch (e) {
      setMatchedError('Eşleşen talepler yüklenirken bir hata oluştu.');
    } finally {
      if (isInitial) {
        setLoadingMatched(false);
      } else {
        setMatchedRefreshing(false);
      }
    }
  }, [portfolio, user?.uid, matchedLastPortfolioId, matchedRequests.length, matchedLastLoadedAt]);

  const openRequestOverlay = useCallback((req) => {
    setSelectedRequest(req);
    setShowRequestOverlay(true);
    requestOverlayAnim.setValue(0);
    Animated.timing(requestOverlayAnim, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [requestOverlayAnim]);

  const closeRequestOverlay = useCallback(() => {
    Animated.timing(requestOverlayAnim, {
      toValue: 0,
      duration: 180,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      setShowRequestOverlay(false);
      setSelectedRequest(null);
    });
  }, [requestOverlayAnim]);

  const openHiddenOverlay = useCallback(() => {
    setShowHiddenOverlay(true);
    try {
      const hiddenItems = (matchedRequests || []).filter(r => hiddenMatchedIds.has(r.id));
      hiddenItems.forEach((r) => {
        try { matchedRowAnimsRef.current[r.id] = new Animated.Value(1); } catch {}
      });
    } catch {}
    hiddenOverlayAnim.setValue(0);
    Animated.timing(hiddenOverlayAnim, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [hiddenOverlayAnim, matchedRequests, hiddenMatchedIds]);

  const closeHiddenOverlay = useCallback(() => {
    Animated.timing(hiddenOverlayAnim, {
      toValue: 0,
      duration: 180,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      setShowHiddenOverlay(false);
    });
  }, [hiddenOverlayAnim]);
  
  // Copy success modal state (match RequestList success modal behavior)
  const [showCopySuccessModal, setShowCopySuccessModal] = useState(false);
  const [copySuccessMessage, setCopySuccessMessage] = useState('');
  const copySuccessScaleAnim = useRef(new Animated.Value(0)).current;
  const copySuccessTimerRef = useRef(null);
  // Success modal gradient config (match Notes success modal)
  const successModalCardConfig = useMemo(() => ({
    overlayColor: 'rgba(255, 0, 0, 0)',
    startColor: 'rgb(24, 54, 73)',
    endColor: 'rgba(17, 36, 49, 0.79)',
    gradientAlpha: 1,
    gradientDirection: 150,
    gradientSpread: 7,
    ditherStrength: 4.0,
  }), []);
  const [showPermissionsManagementModal, setShowPermissionsManagementModal] = useState(false);
  const [grantedPermissions, setGrantedPermissions] = useState([]);
  const [permissionsLoading, setPermissionsLoading] = useState(false);
  const [showRevokeConfirmModal, setShowRevokeConfirmModal] = useState(false);
  const [revokePermissionData, setRevokePermissionData] = useState({ id: '', userName: '' });
  // const [showFullDescription, setShowFullDescription] = useState(false);
  const [showDeleteButton, setShowDeleteButton] = useState(false);
  const [deleteButtonAnim] = useState(new Animated.Value(0));
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [updatedFields, setUpdatedFields] = useState([]);
  const [saveLoading, setSaveLoading] = useState(false);
  const [ownerResolved, setOwnerResolved] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showFinalDeleteModal, setShowFinalDeleteModal] = useState(false);
  const [showDeleteSuccessModal, setShowDeleteSuccessModal] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showMapOverlay, setShowMapOverlay] = useState(false);
  // Separate Matched Requests panel (like Manage)
  const [showMatchedPanel, setShowMatchedPanel] = useState(false);
  const [matchedPanelAnim] = useState(new Animated.Value(300));
  const [matchedWidgetAnim] = useState(new Animated.Value(0));

  const openDirections = useCallback(() => {
    try {
      const latitude = Number((portfolio?.coordinates?.latitude ?? portfolio?.latitude) ?? 41.3151);
      const longitude = Number((portfolio?.coordinates?.longitude ?? portfolio?.longitude) ?? 36.2619);
      const label = encodeURIComponent(portfolio?.title || 'Hedef Konum');

      if (Platform.OS === 'ios') {
        const url = `http://maps.apple.com/?daddr=${latitude},${longitude}&dirflg=d&t=h`;
        return Linking.openURL(url).catch(() => {});
      } else {
        const url = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}&travelmode=driving&dir_action=navigate`;
        return Linking.openURL(url).catch(() => {});
      }
    } catch (e) {
      // swallow
    }
  }, [portfolio]);

  const openStreetView = useCallback(async () => {
    try {
      const latitude = Number((portfolio?.coordinates?.latitude ?? portfolio?.latitude) ?? 41.3151);
      const longitude = Number((portfolio?.coordinates?.longitude ?? portfolio?.longitude) ?? 36.2619);

      if (Platform.OS === 'ios') {
        const appUrl = `comgooglemaps://?api=1&map_action=pano&viewpoint=${latitude},${longitude}`;
        const webUrl = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${latitude},${longitude}`;
        const canOpen = await Linking.canOpenURL(appUrl);
        return Linking.openURL(canOpen ? appUrl : webUrl).catch(() => {});
      } else {
        const appUrl = `google.streetview:cbll=${latitude},${longitude}`;
        const webUrl = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${latitude},${longitude}`;
        const canOpen = await Linking.canOpenURL(appUrl);
        return Linking.openURL(canOpen ? appUrl : webUrl).catch(() => {});
      }
    } catch (e) {
      // swallow
    }
  }, [portfolio]);
  
  // Düzenleme modu state'leri
  const [isEditMode, setIsEditMode] = useState(false);
  const [tempPortfolioData, setTempPortfolioData] = useState({});
  const [showTitleModal, setShowTitleModal] = useState(false);
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [showTypeModal, setShowTypeModal] = useState(false);
  // const [showDescriptionModal, setShowDescriptionModal] = useState(false);
  const [showBuildingAgeModal, setShowBuildingAgeModal] = useState(false);
  const [showDuesModal, setShowDuesModal] = useState(false);
  const [showBalconyCountModal, setShowBalconyCountModal] = useState(false);
  const [showBathroomCountModal, setShowBathroomCountModal] = useState(false);
  const [showNetSquareMetersModal, setShowNetSquareMetersModal] = useState(false);
  const [showWardrobeModal, setShowWardrobeModal] = useState(false);
  const [showExchangeModal, setShowExchangeModal] = useState(false);
  const [showGlassBalconyModal, setShowGlassBalconyModal] = useState(false);
  const [showGrossSquareMetersModal, setShowGrossSquareMetersModal] = useState(false);
  const [showTotalFloorsModal, setShowTotalFloorsModal] = useState(false);
  const [showCurrentFloorModal, setShowCurrentFloorModal] = useState(false);
  const [showParkingModal, setShowParkingModal] = useState(false);
  const [showFurnishedModal, setShowFurnishedModal] = useState(false);
  const [showKitchenTypeModal, setShowKitchenTypeModal] = useState(false);
  const [showDeedStatusModal, setShowDeedStatusModal] = useState(false);
  const [showHeatingTypeModal, setShowHeatingTypeModal] = useState(false);
  const [showUsageStatusModal, setShowUsageStatusModal] = useState(false);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showRoomCountModal, setShowRoomCountModal] = useState(false);
  const [showParentBathroomModal, setShowParentBathroomModal] = useState(false);
  const [showOwnerNameModal, setShowOwnerNameModal] = useState(false);
  const [showOwnerPhoneModal, setShowOwnerPhoneModal] = useState(false);
  const [showKeyLocationModal, setShowKeyLocationModal] = useState(false);
  const [showSpecialNoteModal, setShowSpecialNoteModal] = useState(false);
  const [showDoorCodeModal, setShowDoorCodeModal] = useState(false);
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [showReorderModal, setShowReorderModal] = useState(false);
  const [showClearAllModal, setShowClearAllModal] = useState(false);
  const [showImagePreview, setShowImagePreview] = useState(false);
  const [showFeaturedSuccessModal, setShowFeaturedSuccessModal] = useState(false);
  const [showCameraMode, setShowCameraMode] = useState(false);
  const [cameraImages, setCameraImages] = useState([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isContinuousMode, setIsContinuousMode] = useState(false);
  const isContinuousModeRef = useRef(false);
  const captureTimeoutRef = useRef(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  const [featuredImageIndex, setFeaturedImageIndex] = useState(0);
  const [reorderSequence, setReorderSequence] = useState([]);
  const [currentReorderIndex, setCurrentReorderIndex] = useState(1);
  const [blinkAnim] = useState(new Animated.Value(1));
  
  // Bina yaşı picker animasyonları (AddPortfolio.js'den kopyalandı)
  const pickerFadeAnim = useRef(new Animated.Value(0)).current;
  const pickerTranslateY = useRef(new Animated.Value(16)).current;
  const pickerScale = useRef(new Animated.Value(0.97)).current;
  const pickerItemHeight = 48;
  const getPickerLayout = useCallback((_, index) => ({ length: pickerItemHeight, offset: pickerItemHeight * index, index }), []);
  
  // Bina yaşı seçenekleri (AddPortfolio.js'den kopyalandı)
  const ageOptions = useMemo(() => {
    const options = [];
    for (let i = 1; i <= 50; i++) {
      options.push({ value: i.toString(), label: i.toString() });
    }
    options.push({ value: '50+', label: '50+' });
    return options;
  }, []);

  // Matched panel toggle (same behavior as Manage panel)
  const toggleMatchedPanel = useCallback(() => {
    if (!showMatchedPanel) {
      setShowMatchedPanel(true);
      Animated.parallel([
        Animated.timing(matchedPanelAnim, {
          toValue: 0,
          duration: 350,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(matchedWidgetAnim, {
          toValue: -300,
          duration: 350,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        })
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(matchedPanelAnim, {
          toValue: 300,
          duration: 300,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(matchedWidgetAnim, {
          toValue: 0,
          duration: 300,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        })
      ]).start(() => {
        setShowMatchedPanel(false);
      });
    }
  }, [showMatchedPanel, matchedPanelAnim, matchedWidgetAnim]);

  // Haritadan openMatchedPanel ile gelindiyse paneli otomatik aç
  useFocusEffect(
    useCallback(() => {
      try {
        const openMP = route?.params?.openMatchedPanel;
        if (openMP && !showMatchedPanel) {
          toggleMatchedPanel();
          InteractionManager.runAfterInteractions(() => {
            try { loadMatchedRequests({ preferCache: true }); } catch {}
          });
          // Paramı temizle ki tekrar açmasın
          try { navigation.setParams({ openMatchedPanel: false }); } catch {}
        }
      } catch {}
    }, [route?.params?.openMatchedPanel, showMatchedPanel, toggleMatchedPanel, loadMatchedRequests])
  );
  
  // Balkon sayısı seçenekleri (AddPortfolio.js'den kopyalandı)
  const balconyOptions = useMemo(() => {
    const options = [];
    for (let i = 1; i <= 10; i++) {
      options.push({ value: i.toString(), label: i.toString() });
    }
    return options;
  }, []);
  
  // Aidat seçenekleri (AddPortfolio.js'den kopyalandı)
  const duesOptions = useMemo(() => {
    const options = [];
    options.push({ value: '0', label: '0' });
    for (let i = 100; i <= 10000; i += 100) {
      options.push({ value: i.toString(), label: i.toString() });
    }
    return options;
  }, []);
  
  // Banyo sayısı seçenekleri (AddPortfolio.js'den kopyalandı)
  const bathroomOptions = useMemo(() => {
    const options = [];
    for (let i = 1; i <= 10; i++) {
      options.push({ value: i.toString(), label: i.toString() });
    }
    return options;
  }, []);
  
  // Net M² seçenekleri (AddPortfolio.js'den kopyalandı)
  const netSquareMetersOptions = useMemo(() => {
    const options = [];
    for (let i = 20; i <= 500; i += 5) {
      options.push({ value: i.toString(), label: i.toString() });
    }
    return options;
  }, []);
  
  // Brüt M² seçenekleri (AddPortfolio.js'den kopyalandı)
  const grossSquareMetersOptions = useMemo(() => {
    const options = [];
    for (let i = 25; i <= 600; i += 5) {
      options.push({ value: i.toString(), label: i.toString() });
    }
    return options;
  }, []);
  
  // Toplam kat sayısı seçenekleri (AddPortfolio.js'den kopyalandı)
  const totalFloorOptions = useMemo(() => {
    const options = [];
    for (let i = 1; i <= 100; i++) {
      options.push({ value: i.toString(), label: i.toString() });
    }
    return options;
  }, []);
  
  // Bulunduğu kat seçenekleri (AddPortfolio.js'den kopyalandı)
  const currentFloorOptions = useMemo(() => {
    const options = [];
    for (let i = 1; i <= 100; i++) {
      options.push({ value: i.toString(), label: i.toString() });
    }
    return options;
  }, []);
  
  // Otopark seçenekleri (boolean değerler için)
  const parkingOptions = useMemo(() => [
    { value: true, label: 'Otopark: ✓' },
    { value: false, label: 'Otopark: ✗' }
  ], []);
  
  // Eşyalı seçenekleri (boolean değerler için)
  const furnishedOptions = useMemo(() => [
    { value: true, label: 'Eşyalı: ✓' },
    { value: false, label: 'Eşyalı: ✗' }
  ], []);
  
  // Mutfak tipi seçenekleri (AddPortfolio.js'den kopyalandı)
  const kitchenTypeOptions = useMemo(() => [
    { value: 'Kapalı Mutfak', label: 'Kapalı Mutfak' },
    { value: 'Amerikan Mutfak', label: 'Amerikan Mutfak' }
  ], []);
  
  // Tapu durumu seçenekleri (AddPortfolio.js'den kopyalandı)
  const deedStatusOptions = useMemo(() => [
    { value: 'İskan Mevcut', label: 'İskanlı' },
    { value: 'İskan Mevcut Değil', label: 'İskansız' },
    { value: 'Arsa Payı', label: 'Arsa Payı' }
  ], []);
  
  // Isıtma tipi seçenekleri (AddPortfolio.js'den kopyalandı)
  const heatingTypeOptions = useMemo(() => [
    { value: 'Doğalgaz', label: 'Doğalgaz' },
    { value: 'Katı Yakıt', label: 'Katı Yakıt' },
    { value: 'Merkezi Sistem', label: 'Merkezi' }
  ], []);
  
  // Kullanım durumu seçenekleri (AddPortfolio.js'den kopyalandı)
  const usageStatusOptions = useMemo(() => [
    { value: 'Boş', label: 'Boş' },
    { value: 'Kiracı', label: 'Kiracı' },
    { value: 'Mülk Sahibi', label: 'Mülk Sahibi' }
  ], []);
  
  // Oda sayısı seçenekleri (AddPortfolio.js'den kopyalandı)
  const roomCountOptions = useMemo(() => [
    { value: '1+0', label: '1+0' },
    { value: '1+1', label: '1+1' },
    { value: '2+0', label: '2+0' },
    { value: '2+1', label: '2+1' },
    { value: '3+0', label: '3+0' },
    { value: '3+1', label: '3+1' },
    { value: '4+1', label: '4+1' },
    { value: '5+1', label: '5+1' },
    { value: '6+1', label: '6+1' }
  ], []);
  
  // Ebeveyn banyo seçenekleri (boolean değerler için)
  const parentBathroomOptions = useMemo(() => [
    { value: true, label: 'Ebeveyn Banyo: ✓' },
    { value: false, label: 'Ebeveyn Banyo: ✗' }
  ], []);
  
  // Picker animasyonu (AddPortfolio.js'den kopyalandı)
  const anyPickerVisible = showBuildingAgeModal || showDuesModal || showBalconyCountModal ||
                            showBathroomCountModal || showNetSquareMetersModal || showGrossSquareMetersModal ||
                            showTotalFloorsModal || showCurrentFloorModal || showParkingModal ||
                            showFurnishedModal || showKitchenTypeModal || showDeedStatusModal ||
                            showHeatingTypeModal || showUsageStatusModal || showDepositModal ||
                            showRoomCountModal || showParentBathroomModal || showOwnerNameModal ||
                            showOwnerPhoneModal || showKeyLocationModal || showSpecialNoteModal || showDoorCodeModal ||
                            showWardrobeModal || showExchangeModal || showGlassBalconyModal ||
                            showImagePicker || showReorderModal || showClearAllModal || showImagePreview || showFeaturedSuccessModal || showCameraMode || showDeleteModal || showFinalDeleteModal || showDeleteSuccessModal;
  
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
  
  // Image blinking animation - artık blinkAnim kullanıyor, ayrı animasyon yok

  // Blink animation for edit mode fields
  useEffect(() => {
    let fieldBlinkAnimation;
    
    if (isEditMode) {
      // Önce mevcut animasyonu durdur
      blinkAnim.stopAnimation();
      
      fieldBlinkAnimation = Animated.loop(
        Animated.sequence([
          Animated.timing(blinkAnim, {
            toValue: 0.3,  // ← Daha belirgin (0.3'e düşürdük)
            duration: 400,  // ← Daha hızlı (400ms)
            useNativeDriver: false,
          }),
          Animated.timing(blinkAnim, {
            toValue: 1,
            duration: 400,  // ← Daha hızlı (400ms)
            useNativeDriver: false,
          }),
        ]),
        { iterations: -1 }
      );
      fieldBlinkAnimation.start();
    } else {
      // Düzenleme modundan çıkarken animasyonu durdur ve değeri sıfırla
      blinkAnim.stopAnimation(() => {
        blinkAnim.setValue(1);
      });
    }
    
    return () => {
      // Cleanup: animasyonu tamamen durdur
      if (fieldBlinkAnimation) {
        fieldBlinkAnimation.stop();
      }
      blinkAnim.stopAnimation(() => {
        blinkAnim.setValue(1);
      });
    };
  }, [isEditMode, blinkAnim]);
  
  const scrollViewRef = useRef(null);
  const modalFlatListRef = useRef(null);
  const thumbnailsScrollRef = useRef(null);
  const lastActiveIndexRef = useRef(0);
  const indicatorsScrollRef = useRef(null);
  const lastDotIndexRef = useRef(0);

  // Portföy sahibi bilgileri (portföyü ekleyen kullanıcı)
  const {
    ownerNameFinal,
    ownerOfficeFinal,
    ownerPhoneFinal,
    ownerAvatarFinal,
  } = useMemo(() => {
    const ownerObj = portfolio?.owner || {};
    const name = portfolio?.ownerName || ownerObj.name || '';
    const office = portfolio?.officeName || ownerObj.officeName || '';
    const phone = portfolio?.ownerPhone || ownerObj.phone || '';
    const avatar = portfolio?.ownerAvatar || ownerObj.avatar || '';
    return {
      ownerNameFinal: typeof name === 'string' ? name : '',
      ownerOfficeFinal: typeof office === 'string' ? office : '',
      ownerPhoneFinal: typeof phone === 'string' ? phone : '',
      ownerAvatarFinal: typeof avatar === 'string' ? avatar : '',
    };
  }, [portfolio?.owner, portfolio?.ownerName, portfolio?.officeName, portfolio?.ownerPhone, portfolio?.ownerAvatar]);
  
  const [fadeAnim] = useState(new Animated.Value(0));
  const [managePanelAnim] = useState(new Animated.Value(250)); // Panel başlangıçta sağda gizli
  const [widgetAnim] = useState(new Animated.Value(0)); // Widget animasyonu için ayrı
  const [modalAnim] = useState(new Animated.Value(0)); // Modal animasyonu için
  const pageViewRef = useRef(null);
  
  // Zoom state'leri - profesyonel pinch-to-zoom için
  const [baseScale] = useState(new Animated.Value(1));
  const [pinchScale] = useState(new Animated.Value(1));
  const [scale] = useState(new Animated.Value(1));
  const [translateX] = useState(new Animated.Value(0));
  const [translateY] = useState(new Animated.Value(0));
  const flatListRef = useRef(null);

  // Combined scale calculation
  const animatedScale = useMemo(() => 
    Animated.multiply(baseScale, pinchScale),
    [baseScale, pinchScale]
  );

  // Akıllı geri navigasyon
  const handleGoBack = useCallback(() => {
    if (fromScreen === 'PortfolioList') {
      if (navigation.canGoBack()) {
        navigation.goBack();
      } else {
        navigation.navigate('PortfolioList', { onlyMine: !!fromOnlyMine, showFavorites: !!fromShowFavorites });
      }
    } else if (fromScreen === 'MyPortfolios') {
      if (typeof navigation.popToTop === 'function') {
        navigation.popToTop();
      } else {
        navigation.navigate('Portföylerim', { screen: 'MyPortfolios', params: { refresh: true } });
      }
    } else if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('HomeScreen');
    }
  }, [fromScreen, navigation]);

  // Android fiziksel geri tuşu için custom handler
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        handleGoBack();
        return true;
      };

      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }, [handleGoBack])
  );

  // Genel unmount temizliği: kopya başarı modal zamanlayıcısını temizle
  useEffect(() => {
    return () => {
      try { if (copySuccessTimerRef.current) { clearTimeout(copySuccessTimerRef.current); copySuccessTimerRef.current = null; } } catch {}
    };
  }, []);
  // Images - Portfolio images or default ones
  const images = useMemo(() => {
    const original = Array.isArray(portfolio?.images) ? portfolio.images : [];
    const filtered = original.map(sanitizeImageUrl).filter(Boolean).filter((s) => !s.includes('1758839298644_portfolio_1758839297872'));
    if (filtered.length === 0) {
      return [
        'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?q=80&w=800&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1503177119275-0aa32b3a9368?q=80&w=800&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1505691723518-36a5ac3b2b8d?q=80&w=800&auto=format&fit=crop',
      ];
    }
    return filtered;
  }, [portfolio?.images]);

  const imagesReady = useMemo(() => Array.isArray(images) && images.length > 0 && images.every(Boolean), [images]);

  const handleWhatsApp = useCallback(() => {
    const raw = ownerResolved?.phone || ownerPhoneFinal || '';
    const phone = String(raw || '').trim();
    if (!phone) {
      Alert.alert('Bilgi', 'Telefon bilgisi bulunamadı.');
      return;
    }
    const message = `Merhaba, ${portfolio?.title || 'portföy'} hakkında bilgi almak istiyorum.`;
    sendWhatsAppMessage(phone, message);
  }, [ownerResolved?.phone, portfolio?.title]);

  const handleCall = useCallback(() => {
    const raw = ownerResolved?.phone || ownerPhoneFinal || '';
    const phone = String(raw || '').trim();
    if (!phone) {
      Alert.alert('Bilgi', 'Telefon bilgisi bulunamadı.');
      return;
    }
    makePhoneCall(phone);
  }, [ownerResolved?.phone]);

  const toggleManagePanel = useCallback(() => {
    if (!showManagePanel) {
      setShowManagePanel(true);
      
      Animated.parallel([
        Animated.timing(managePanelAnim, {
          toValue: 0,
          duration: 350,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(widgetAnim, {
          toValue: -250,
          duration: 350,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        })
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(managePanelAnim, {
          toValue: 250,
          duration: 300,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(widgetAnim, {
          toValue: 0,
          duration: 300,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        })
      ]).start(() => {
        setShowManagePanel(false);
      });
    }
  }, [showManagePanel, managePanelAnim, widgetAnim]);

  // Paylaşım handler'ları
  const handleCustomShare = useCallback(async () => {
    try {
      setShareLoading(true);
      
      console.log('🔗 PropertyDetail Custom Share başlıyor...');
      console.log('🔗 Portfolio ID:', portfolio.id);
      console.log('🔗 User UID:', user.uid);
      
      // Kullanıcının bu portföy için onaylanmış izni var mı kontrol et
      const permissionsQuery = query(
        collection(firestore, 'permissionRequests'),
        where('portfolioId', '==', portfolio.id),
        where('requesterId', '==', user.uid),
        where('status', '==', 'approved')
      );
      
      const permissionsDocs = await getDocs(permissionsQuery);
      console.log('🔗 Permission docs found:', permissionsDocs.size);
      
      if (permissionsDocs.empty) {
        // İzin yok - izin isteme modal'ını aç
        console.log('🔗 No approved permission found');
        setShareLoading(false);
        setShowShareModal(false);
        setShowPermissionRequestModal(true);
        return;
      }
      
      // İlk onaylanmış izni al
      const approvedPermission = permissionsDocs.docs[0];
      const permissionRequestId = approvedPermission.id;
      console.log('🔗 Permission Request ID:', permissionRequestId);
      console.log('🔗 Permission data:', approvedPermission.data());
      
      // Özel link oluştur
      const { generateCustomShareLink } = await import('../services/permissionNotificationHandlers');
      console.log('🔗 Calling generateCustomShareLink with:', { permissionRequestId, userId: user.uid });
      const result = await generateCustomShareLink(permissionRequestId, user.uid);
      console.log('🔗 generateCustomShareLink result:', result);
      
             if (result.success) {
              setShareLinkData({
                title: '🔗 Özel Link Oluşturuldu!',
                 message: result.message,
                 url: result.shareUrl,
                 isCustom: true
               });
               setShowShareLinkModal(true);
             } else {
               Alert.alert('Hata', result.message || 'Link oluşturulamadı');
             }
      
    } catch (error) {
      console.error('🔗 PropertyDetail Custom share error:', error);
      console.error('🔗 PropertyDetail Error details:', error.code, error.message);
      Alert.alert('Hata', 'Link oluşturulurken hata oluştu: ' + error.message);
    } finally {
      setShareLoading(false);
      setShowShareModal(false);
    }
  }, [portfolio?.id, user?.uid]);

  const handleNormalShare = useCallback(() => {
    setShowShareModal(false);
    
    // Normal web URL'i oluştur (portföy sahibi adıyla)
    const normalShareUrl = `https://talepify.com/portfoy/${portfolio.id}`;
    
    setShareLinkData({
      title: 'Paylaşım Linki 📤',
      message: 'Portföy sahibi adıyla paylaşım linki:',
      url: normalShareUrl,
      isCustom: false
    });
    setShowShareLinkModal(true);
  }, [portfolio.id]);

  // İzinleri yükle - Optimized
  const loadGrantedPermissions = useCallback(async () => {
    if (!portfolio?.id || !isOwner || !user?.uid) return;

    try {
      setPermissionsLoading(true);
      __DEV__ && console.log('🔍 Loading granted permissions for portfolio:', portfolio.id);
      
      const permissionsQuery = query(
        collection(firestore, 'permissionRequests'),
        where('portfolioOwnerId', '==', user.uid),
        where('status', '==', 'approved')
      );
      
      const permissionsDocs = await getDocs(permissionsQuery);
      __DEV__ && console.log('🔍 Query result, docs count:', permissionsDocs.docs.length);
      
      // İlk önce bu portföy için izinleri filtrele
      const relevantPermissions = permissionsDocs.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(permission => permission.portfolioId === portfolio.id);
      
      if (relevantPermissions.length === 0) {
        setGrantedPermissions([]);
        setPermissionsLoading(false);
        return;
      }
      
      // Tüm user bilgilerini paralel olarak çek
      __DEV__ && console.log('🔍 Fetching user data in parallel...');
      const userFetchPromises = relevantPermissions.map(async (permission) => {
        try {
          const userDoc = await getDoc(doc(firestore, 'users', permission.requesterId));
          let userName = 'Bilinmeyen Kullanıcı';
          let userEmail = '';
          
          if (userDoc.exists()) {
            const userData = userDoc.data();
            userName = userData.name || userData.displayName || 'Bilinmeyen Kullanıcı';
            userEmail = userData.email || '';
          }
          
          return {
            id: permission.id,
            requesterId: permission.requesterId,
            userName: userName,
            userEmail: userEmail,
            createdAt: permission.createdAt,
            portfolioTitle: permission.portfolioTitle
          };
        } catch (userError) {
          console.error('User data fetch error:', userError);
          return {
            id: permission.id,
            requesterId: permission.requesterId,
            userName: 'Bilinmeyen Kullanıcı',
            userEmail: '',
            createdAt: permission.createdAt,
            portfolioTitle: permission.portfolioTitle
          };
        }
      });
      
      // Tüm user fetch'leri bekle
      const permissions = await Promise.all(userFetchPromises);
      __DEV__ && console.log('🔍 All user data fetched, setting permissions');
      
      setGrantedPermissions(permissions);
    } catch (error) {
      console.error('Granted permissions load error:', error);
      setGrantedPermissions([]);
    } finally {
      setPermissionsLoading(false);
    }
  }, [portfolio?.id, isOwner, user?.uid]);

  // İzin kaldır - Modal aç
  const handleRevokePermission = useCallback((permissionId, userName) => {
    if (!user?.uid) return;
    
    setRevokePermissionData({ id: permissionId, userName });
    setShowRevokeConfirmModal(true);
  }, [user?.uid]);
  // İzin kaldırma onaylama
  const confirmRevokePermission = useCallback(async () => {
    if (!revokePermissionData.id) return;
    
    try {
      // 1. Permission request'i sil
      await deleteDoc(doc(firestore, 'permissionRequests', revokePermissionData.id));
      
      // 2. İlgili custom share linklerini deaktif et
      const customSharesQuery = query(
        collection(firestore, 'customPortfolioShares'),
        where('permissionRequestId', '==', revokePermissionData.id)
      );
      const customSharesDocs = await getDocs(customSharesQuery);
      
      for (const customShareDoc of customSharesDocs.docs) {
        await updateDoc(doc(firestore, 'customPortfolioShares', customShareDoc.id), {
          isActive: false,
          revokedAt: new Date()
        });
      }
      
      // 3. Modal'ı kapat ve listeyi yenile
      setShowRevokeConfirmModal(false);
      setRevokePermissionData({ id: '', userName: '' });
      loadGrantedPermissions();
      
      // 4. İzin durumunu tekrar kontrol et (kaldırılan izin kullanıcı için status güncellensin)
      if (revokePermissionData.id && user?.uid) {
        const checkPermissionStatus = async () => {
          try {
            const permissionsQuery = query(
              collection(firestore, 'permissionRequests'),
              where('portfolioId', '==', portfolio.id),
              where('requesterId', '==', user.uid)
            );
            const permissionsDocs = await getDocs(permissionsQuery);
            
            if (permissionsDocs.empty) {
              setPermissionStatus(null);
            } else {
              const latestPermission = permissionsDocs.docs[0].data();
              setPermissionStatus(latestPermission.status);
            }
          } catch (error) {
            console.error('Permission status update error:', error);
          }
        };
        checkPermissionStatus();
      }
      
      Alert.alert('Başarılı', `${revokePermissionData.userName} kullanıcısının izni kaldırıldı ve paylaşım linkleri deaktif edildi.`);
    } catch (error) {
      console.error('Permission revoke error:', error);
      Alert.alert('Hata', 'İzin kaldırılırken bir hata oluştu.');
    }
  }, [revokePermissionData, loadGrantedPermissions, portfolio?.id, user?.uid]);
  // İzin talep sistemi handler'ları
  const handlePermissionRequest = useCallback(async () => {
    if (!user?.uid || !portfolio?.userId) {
      setRequestFeedbackMessage('Kullanıcı bilgileri eksik! Lütfen tekrar giriş yapın.');
      setShowRequestFeedbackModal(true);
      return;
    }

    try {
      // Önce mevcut izin talebini kontrol et
      __DEV__ && console.log('🔍 Mevcut izin talepleri kontrol ediliyor...');
      const existingPermissionsQuery = query(
        collection(firestore, 'permissionRequests'),
        where('portfolioId', '==', portfolio.id),
        where('requesterId', '==', user.uid),
        where('userId', '==', user.uid) // Firestore rules: read allowed only if userId == auth uid
      );
      
      const existingPermissionsDocs = await getDocs(existingPermissionsQuery);
      
      if (!existingPermissionsDocs.empty) {
        const existingPermission = existingPermissionsDocs.docs[0].data();
        __DEV__ && console.log('🔍 Mevcut izin durumu:', existingPermission.status);
        
        if (existingPermission.status === 'pending') {
          setRequestFeedbackMessage('Bu portföy için zaten izin talebiniz bulunuyor. Onay bekleniyor.');
          setShowRequestFeedbackModal(true);
          return;
        } else if (existingPermission.status === 'approved') {
          setRequestFeedbackMessage('Bu portföy için izniniz zaten onaylanmış.');
          setShowRequestFeedbackModal(true);
          return;
        }
        // rejected durumunda yeni talep gönderilebilir
      }
      
      __DEV__ && console.log('✅ Yeni izin talebi gönderilebilir');
      
      // Yeni izin talebi oluştur
      const userName = userProfile?.displayName || userProfile?.firstName || user.displayName || user.email?.split('@')[0] || 'İsimsiz Kullanıcı';
      const userPhone = userProfile?.phoneNumber || user.phoneNumber || 'Telefon belirtilmemiş';
      
      const permissionRequestData = {
        userId: user.uid, // Firestore rules require userId to equal auth uid
        requesterId: user.uid,
        requesterName: userName,
        requesterPhone: userPhone,
        requesterEmail: user.email || '',
        portfolioId: portfolio.id || 'portfolio-id',
        portfolioTitle: portfolio.title || 'Portföy',
        portfolioOwnerId: portfolio.userId,
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const permissionRef = await addDoc(collection(firestore, 'permissionRequests'), permissionRequestData);

      const notificationData = {
        title: 'Yeni Paylaşım İzin Talebi',
        body: `${permissionRequestData.requesterName} (${permissionRequestData.requesterPhone}) kullanıcısı '${permissionRequestData.portfolioTitle}' portföyünüzü müşterisi ile kendi ismiyle paylaşmak istiyor.`,
        data: {
          type: 'permission_request',
          permissionRequestId: permissionRef.id,
          portfolioId: portfolio.id,
          requesterId: user.uid,
          action_buttons: JSON.stringify([
            { id: 'approve', title: 'İzin Ver', action: 'approve_permission' },
            { id: 'reject', title: 'Reddet', action: 'reject_permission' },
            { id: 'view', title: 'Portföye Bak', action: 'view_portfolio' }
          ])
        }
      };

      // 1. Firestore'a notification kaydet (portföy sahibi için)
      const notificationDoc = {
        userId: portfolio.userId,
        title: notificationData.title,
        body: notificationData.body,
        data: notificationData.data,
        isRead: false,
        createdAt: serverTimestamp(),
        type: 'permission_request'
      };
      
      try {
        // Client-side notifications write is blocked by Firestore rules (server-only). Best-effort try.
        await addDoc(collection(firestore, 'notifications'), notificationDoc);
        __DEV__ && console.log('✅ Notification saved to Firestore for portfolio owner:', portfolio.userId);
      } catch (notifErr) {
        if (__DEV__) {
          console.log('ℹ️ Notifications write skipped by rules (server-only).', notifErr?.message);
        }
        // Continue without failing the permission request
      }
      
      // 2. Push notification (local) - KALDIRILIYOR çünkü yanlış kullanıcıya gidiyor
      // NOT: Gerçek push notification FCM ile sunucu tarafından gönderilecek
      __DEV__ && console.log('ℹ️ Local push notification atlandı (Firestore notification yeterli)');
      
      // 3. SMS gönder (portföy sahibine)
      try {
        // Önce portföy üzerindeki sahibi alanlarından dene (kuralları ihlal etmeden)
        let ownerPhone = portfolio.ownerPhone || portfolio.owner_phone || portfolio.ownerPhoneNumber || null;
        let ownerName = portfolio.ownerName || portfolio.owner_name || 'Kullanıcı';

        // Eğer portföyde kayıtlı değilse, users koleksiyonundan dene (kurallar engellerse sessiz geç)
        if (!ownerPhone) {
          try {
            const ownerUserDoc = await getDoc(doc(firestore, 'users', portfolio.userId));
            if (ownerUserDoc.exists()) {
              const ownerData = ownerUserDoc.data();
              ownerPhone = ownerData.phoneNumber || ownerPhone;
              ownerName = ownerData.name || ownerData.displayName || ownerName;
            }
          } catch (_) {
            // Firestore rules nedeniyle erişilemeyebilir; sessizce devam et
          }
        }

        if (ownerPhone) {
          const smsMessage = createPermissionRequestSMS(
            userName,
            portfolio.title,
            ownerName
          );
          await sendSMS(ownerPhone, smsMessage);
          __DEV__ && console.log('✅ SMS sent to portfolio owner:', ownerPhone);
        } else {
          __DEV__ && console.log('⚠️ Portfolio owner phone number not found');
        }
      } catch (smsError) {
        __DEV__ && console.log('⚠️ SMS failed:', smsError.message);
      }
      
      setRequestFeedbackMessage('İzin talebi portföy sahibine gönderildi (Bildirim + SMS). Onay bekleniyor.');
      setShowRequestFeedbackModal(true);
      
      // Permission status'u güncelle
      setPermissionStatus('pending');
      
      __DEV__ && console.log('✅ İzin talebi başarıyla gönderildi ve status güncellendi');
      
    } catch (error) {
      // Handle error silently
      setRequestFeedbackMessage(`İzin talebi gönderilemedi. Hata: ${error.message}`);
      setShowRequestFeedbackModal(true);
    }
  }, [user, portfolio, userProfile?.displayName, userProfile?.firstName, userProfile?.phoneNumber]);

  const handleCheckRequestStatus = useCallback(async () => {
    if (!user?.uid || !portfolio?.id) {
      return;
    }

    try {
      const requestsQuery = query(
        collection(firestore, 'permissionRequests'),
        where('requesterId', '==', user.uid),
        where('portfolioId', '==', portfolio.id),
        where('userId', '==', user.uid), // ensure rules permit read
        orderBy('createdAt', 'desc'),
        limit(1)
      );
      const requestsSnapshot = await getDocs(requestsQuery);

      if (requestsSnapshot.empty) {
        setRequestFeedbackMessage('Bu portföy için henüz izin talebiniz bulunmuyor.');
        setShowRequestFeedbackModal(true);
        return;
      }

      const latestRequest = requestsSnapshot.docs[0].data();
      const statusMessages = {
        'pending': 'İzin talebiniz portföy sahibi tarafından henüz değerlendirilmedi. Lütfen bekleyin.',
        'approved': 'İzin talebiniz onaylandı! Artık bu portföyü paylaşabilirsiniz.',
        'rejected': 'İzin talebiniz reddedildi. Yeni bir talep gönderebilirsiniz.'
      };

      const message = statusMessages[latestRequest.status] || 'Bilinmeyen durum.';
      const requestDate = latestRequest.createdAt?.toDate?.()?.toLocaleDateString?.() || 'Bilinmiyor';
      
      setRequestFeedbackMessage(`Talep Durumu: ${latestRequest.status.toUpperCase()}\n\nTarih: ${requestDate}\n\n${message}`);
      setShowRequestFeedbackModal(true);
      
    } catch (error) {
      setRequestFeedbackMessage('Talep durumu kontrol edilemedi. Lütfen tekrar deneyin.');
      setShowRequestFeedbackModal(true);
    }
  }, [user, portfolio]);

  const handleShowPermissions = useCallback(() => {
    if (!user?.uid || !portfolio?.id) {
      setRequestFeedbackMessage('Kullanıcı bilgileri eksik!');
      setShowRequestFeedbackModal(true);
      return;
    }

    setShowPermissionModal(true);
  }, [user, portfolio]);

  // Modal açma fonksiyonu
  const openImageModal = useCallback(() => {
    // Etkileşimler bitince modalı aç (stutter azaltma)
    InteractionManager.runAfterInteractions(() => {
      resetZoom();
      setShowImageModal(true);
      modalAnim.setValue(0);
      Animated.timing(modalAnim, {
        toValue: 1,
        duration: 250,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    });
  }, [modalAnim, resetZoom]);

  // Modal kapama fonksiyonu
  const closeImageModal = useCallback(() => {
    Animated.timing(modalAnim, {
      toValue: 0,
      duration: 220,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      setShowImageModal(false);
      resetZoom();
    });
  }, [modalAnim, resetZoom]);

  // Modal açıkken, büyük görsel değiştiğinde thumbnail şeridini aktif görseli ortaya getirecek şekilde kaydır
  useEffect(() => {
    if (!showImageModal || !images || images.length === 0) { return; }
    try {
      const THUMB_WIDTH = 60;
      const THUMB_SPACING = 10;
      const ITEM = THUMB_WIDTH + THUMB_SPACING; // yaklaşık genişlik
      const halfScreen = Math.max(0, (screenWidth - ITEM) / 2);
      const targetOffset = Math.max(0, activeImageIndex * ITEM - halfScreen);
      const delta = Math.abs(activeImageIndex - (lastActiveIndexRef.current || 0));
      const animate = delta <= 1; // hızlı kaydırmada atlama yapma
      thumbnailsScrollRef.current?.scrollTo({ x: targetOffset, animated: animate });
      lastActiveIndexRef.current = activeImageIndex;
    } catch {}
  }, [activeImageIndex, showImageModal, images]);

  // Slider altındaki 5 görünür nokta için tüm noktaları yatay ScrollView'da tut ve aktif noktayı ortala
  useEffect(() => {
    if (!imagesReady || images.length <= 1) { return; }
    try {
      const DOT_SIZE = 8;
      const DOT_SPACING = 8;
      const ITEM = DOT_SIZE + DOT_SPACING; // yaklaşık genişlik
      const VISIBLE = 5;
      const halfViewport = Math.max(0, Math.floor(VISIBLE / 2) * ITEM);
      const targetOffset = Math.max(0, activeImageIndex * ITEM - halfViewport);
      const delta = Math.abs(activeImageIndex - (lastDotIndexRef.current || 0));
      const animate = delta <= 1;
      indicatorsScrollRef.current?.scrollTo({ x: targetOffset, animated: animate });
      lastDotIndexRef.current = activeImageIndex;
    } catch {}
  }, [activeImageIndex, imagesReady, images?.length]);

  // Zoom reset fonksiyonu
  const resetZoom = useCallback(() => {
    baseScale.setValue(1);
    pinchScale.setValue(1);
    scale.setValue(1);
    translateX.setValue(0);
    translateY.setValue(0);
    // Reset values for next interaction
  }, [baseScale, pinchScale, scale, translateX, translateY]);

  // Pinch gesture handler
  const onPinchGestureEvent = Animated.event(
    [{ nativeEvent: { scale: pinchScale } }],
    { useNativeDriver: true }
  );

  // Pan gesture handler - Kaldırıldı, sadece pinch zoom kullanıyoruz

  // Pinch state change handler
  const onPinchHandlerStateChange = useCallback((event) => {
    if (event.nativeEvent.oldState === State.ACTIVE) {
      // Parmaklar kaldırılınca her zaman orijinal boyuta dön
      Animated.parallel([
        Animated.timing(baseScale, {
          toValue: 1,
          duration: 300,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(translateX, {
          toValue: 0,
          duration: 300,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 300,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
      
      // Pinch scale'i reset et
      pinchScale.setValue(1);
      // Reset zoom state
    }
  }, [baseScale, pinchScale, translateX, translateY]);

  // Pan state change handler - Zoom geçici olduğu için basit tutalım
  const onPanHandlerStateChange = useCallback((event) => {
    // Pan gesture'ı zoom ile birlikte çalışsın ama kalıcı olmasın
  }, []);

  // Çift tıklama zoom fonksiyonu - Geçici zoom
  const handleDoubleTap = useCallback(() => {
    // Çift tıklama ile geçici zoom (otomatik reset olacak)
    Animated.timing(baseScale, {
      toValue: 2,
      duration: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      // 1.5 saniye sonra otomatik reset
      setTimeout(() => {
        Animated.parallel([
          Animated.timing(baseScale, {
            toValue: 1,
            duration: 300,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(translateX, {
            toValue: 0,
            duration: 300,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(translateY, {
            toValue: 0,
            duration: 300,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]).start();
      }, 1500);
    });
    // Double tap zoom applied
  }, [baseScale, translateX, translateY]);

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  // Sayfa geçiş animasyonu (header sabit)
  useFocusEffect(
    useCallback(() => {
      if (pageViewRef.current) {
        try { pageViewRef.current.animate({ from: { opacity: 0, scale: 0.95 }, to: { opacity: 1, scale: 1 } }, 600); } catch {}
      }
      return () => {
        if (pageViewRef.current) {
          try { pageViewRef.current.animate({ from: { opacity: 1, scale: 1 }, to: { opacity: 0, scale: 0.95 } }, 200); } catch {}
        }
      };
    }, [])
  );


  // Success message gösterme
  const showSuccessMessage = useCallback((fields) => {
    setUpdatedFields(fields);
    setShowSuccessModal(true);
    
    // 3 saniye sonra modal'ı otomatik kapat
    setTimeout(() => {
      setShowSuccessModal(false);
      setUpdatedFields([]);
    }, 3000);
  }, []);

  // Image management functions (from AddPortfolio.js step 5)
  const selectFromGallery = useCallback(async () => {
    try {
      const currentImages = tempPortfolioData.selectedImages || portfolio?.images?.map(uri => ({ uri })) || [];
      const remainingSlots = 30 - currentImages.length;
      
      if (remainingSlots <= 0) {
        Alert.alert('Uyarı', 'Maksimum 30 resim ekleyebilirsiniz.');
        return;
      }

      const images = await ImagePicker.openPicker({
        multiple: true,
        maxFiles: remainingSlots,
        mediaType: 'photo',
        quality: 0.8,
        compressImageQuality: 0.8,
        includeBase64: false,
      });

      const validImages = [];
      const invalidImages = [];

      images.forEach(image => {
        const sizeInMB = image.size / (1024 * 1024);
        if (sizeInMB <= 5) {
          validImages.push({
            uri: image.path,
            width: image.width,
            height: image.height,
            mime: image.mime,
            size: image.size,
          });
        } else {
          invalidImages.push(image);
        }
      });

      if (invalidImages.length > 0) {
        Alert.alert('Uyarı', `${invalidImages.length} resim 5MB boyut sınırını aşıyor ve eklenmedi.`);
      }

      if (validImages.length > 0) {
        setTempPortfolioData(prev => ({
          ...prev,
          selectedImages: [...currentImages, ...validImages]
        }));
      }
    } catch (error) {
      if (error.code !== 'E_PICKER_CANCELLED') {
        Alert.alert('Hata', 'Galeri açılırken bir hata oluştu.');
      }
    }
  }, [tempPortfolioData.selectedImages, portfolio?.images]);

  const takePhoto = useCallback(() => {
    const currentImages = tempPortfolioData.selectedImages || portfolio?.images?.map(uri => ({ uri })) || [];
    
    if (currentImages.length >= 30) {
      Alert.alert('Uyarı', 'Maksimum 30 resim ekleyebilirsiniz.');
      return;
    }

    setShowCameraMode(true);
    setCameraImages([]);
    setIsCameraActive(true);
  }, [tempPortfolioData.selectedImages, portfolio?.images]);

  // Camera mode functions (from AddPortfolio.js)
  const takeContinuousPhoto = useCallback(async () => {
    if (isCapturing) return;

    try {
      setIsCapturing(true);
      
      const image = await ImagePicker.openCamera({
        mediaType: 'photo',
        quality: 0.8,
        compressImageQuality: 0.8,
        includeBase64: false,
      });

      const sizeInMB = image.size / (1024 * 1024);
      if (sizeInMB <= 5) {
        const newImage = {
          uri: image.path,
          width: image.width,
          height: image.height,
          mime: image.mime,
          size: image.size,
        };

        setCameraImages(prev => {
          const updatedImages = [...prev, newImage];

          if (isContinuousModeRef.current && (selectedImages.length + updatedImages.length) < 30) {
            if (captureTimeoutRef.current) {
              clearTimeout(captureTimeoutRef.current);
              captureTimeoutRef.current = null;
            }
            captureTimeoutRef.current = setTimeout(() => {
              if (!isContinuousModeRef.current) return;
              takeContinuousPhoto();
            }, 2000);
          }

          return updatedImages;
        });
    } else {
        Alert.alert('Büyük Resim', 'Çekilen resim 5MB\'den büyük. Lütfen daha küçük bir resim çekin.');
      }
    } catch (error) {
      if (error.code !== 'E_PICKER_CANCELLED') {
        Alert.alert('Hata', 'Kamera açılırken bir hata oluştu.');
      }
      setIsContinuousMode(false);
      isContinuousModeRef.current = false;
      if (captureTimeoutRef.current) {
        clearTimeout(captureTimeoutRef.current);
        captureTimeoutRef.current = null;
      }
    }
    setIsCapturing(false);
  }, [isCapturing, selectedImages]);

  const takeSinglePhoto = useCallback(async () => {
    if (isCapturing) return;
    
    try {
      setIsCapturing(true);
      
      const image = await ImagePicker.openCamera({
        mediaType: 'photo',
        quality: 0.8,
        compressImageQuality: 0.8,
        includeBase64: false,
      });

      const sizeInMB = image.size / (1024 * 1024);
      if (sizeInMB <= 5) {
        const newImage = {
          uri: image.path,
          width: image.width,
          height: image.height,
          mime: image.mime,
          size: image.size,
        };

        setCameraImages(prev => [...prev, newImage]);
      } else {
        Alert.alert('Büyük Resim', 'Çekilen resim 5MB\'den büyük. Lütfen daha küçük bir resim çekin.');
      }
    } catch (error) {
      if (error.code !== 'E_PICKER_CANCELLED') {
        Alert.alert('Hata', 'Kamera açılırken bir hata oluştu.');
      }
    }
    setIsCapturing(false);
  }, [isCapturing]);

  const startContinuousCamera = useCallback(() => {
    const totalImages = selectedImages.length + cameraImages.length;
    if (totalImages >= 30) {
      Alert.alert('Uyarı', 'Maksimum 30 resim ekleyebilirsiniz.');
      return;
    }

    setIsContinuousMode(true);
    isContinuousModeRef.current = true;
    setIsCameraActive(true);

    if (captureTimeoutRef.current) {
      clearTimeout(captureTimeoutRef.current);
      captureTimeoutRef.current = null;
    }

    captureTimeoutRef.current = setTimeout(() => {
      if (!isContinuousModeRef.current) return;
      takeContinuousPhoto();
    }, 100);
  }, [selectedImages, cameraImages, takeContinuousPhoto]);

  const stopContinuousCamera = useCallback(() => {
    setIsContinuousMode(false);
    isContinuousModeRef.current = false;
    setIsCameraActive(false);
    if (captureTimeoutRef.current) {
      clearTimeout(captureTimeoutRef.current);
      captureTimeoutRef.current = null;
    }
  }, []);

  const finishCameraMode = useCallback(() => {
    if (cameraImages.length > 0) {
      const currentImages = tempPortfolioData.selectedImages || portfolio?.images?.map(uri => ({ uri })) || [];
      setTempPortfolioData(prev => ({
        ...prev,
        selectedImages: [...currentImages, ...cameraImages]
      }));
      setCameraImages([]);
    }
    setShowCameraMode(false);
    setIsCameraActive(false);
  }, [cameraImages, tempPortfolioData.selectedImages, portfolio?.images]);

  const cancelCameraMode = useCallback(() => {
    setCameraImages([]);
    setShowCameraMode(false);
    setIsCameraActive(false);
    setIsContinuousMode(false);
    isContinuousModeRef.current = false;
    if (captureTimeoutRef.current) {
      clearTimeout(captureTimeoutRef.current);
      captureTimeoutRef.current = null;
    }
  }, []);

  const removeCameraImage = useCallback((index) => {
    setCameraImages(prev => prev.filter((_, i) => i !== index));
  }, []);

  // Image reorder functions
  const openReorderModal = useCallback(() => {
    setShowReorderModal(true);
    setReorderSequence([]);
    setCurrentReorderIndex(1);
  }, []);

  const closeReorderModal = useCallback(() => {
    setShowReorderModal(false);
    setReorderSequence([]);
    setCurrentReorderIndex(1);
  }, []);

  const addToReorderSequence = useCallback((imageIndex) => {
    if (reorderSequence.includes(imageIndex)) return;
    
    setReorderSequence(prev => [...prev, imageIndex]);
    setCurrentReorderIndex(prev => prev + 1);
  }, [reorderSequence]);

  const applyReorder = useCallback(() => {
    if (reorderSequence.length === 0) {
      closeReorderModal();
      return;
    }

    const currentImages = tempPortfolioData.selectedImages || portfolio?.images?.map(uri => ({ uri })) || [];
    const newImages = [...currentImages];
    const reorderedImages = [];
    
    reorderSequence.forEach(index => {
      reorderedImages.push(newImages[index]);
    });
    
    newImages.forEach((image, index) => {
      if (!reorderSequence.includes(index)) {
        reorderedImages.push(image);
      }
    });
    
    setTempPortfolioData(prev => ({
      ...prev,
      selectedImages: reorderedImages
    }));
    closeReorderModal();
  }, [reorderSequence, tempPortfolioData.selectedImages, portfolio?.images, closeReorderModal]);

  // Image management functions
  const removeImage = useCallback((index) => {
    const currentImages = tempPortfolioData.selectedImages || portfolio?.images?.map(uri => ({ uri })) || [];
    const newImages = currentImages.filter((_, i) => i !== index);
    
    if (featuredImageIndex === index) {
      setFeaturedImageIndex(0);
    } else if (featuredImageIndex > index) {
      setFeaturedImageIndex(featuredImageIndex - 1);
    }
    
    setTempPortfolioData(prev => ({
      ...prev,
      selectedImages: newImages
    }));
  }, [tempPortfolioData.selectedImages, portfolio?.images, featuredImageIndex]);

  const setFeaturedImage = useCallback((index) => {
    setFeaturedImageIndex(index);
    setShowFeaturedSuccessModal(true);
  }, []);

  const openImagePreview = useCallback((image, index) => {
    setPreviewImage({ ...image, index });
    setShowImagePreview(true);
  }, []);

  const clearAllImages = useCallback(() => {
    setTempPortfolioData(prev => ({
      ...prev,
      selectedImages: []
    }));
    setFeaturedImageIndex(0);
    setShowClearAllModal(false);
  }, []);

  // Optimized selectedImages memo
  const selectedImages = useMemo(() => {
    return tempPortfolioData.selectedImages || portfolio?.images?.map(uri => ({ uri })) || [];
  }, [tempPortfolioData.selectedImages, portfolio?.images]);
  const [headerIsFavorite, setHeaderIsFavorite] = useState(false);

  // Header fav state'i AsyncStorage'dan yükle
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!user?.uid || !portfolio?.id) return;
        const favs = await getPortfolioFavorites(user.uid);
        if (!mounted) return;
        setHeaderIsFavorite(isPortfolioFavorite(favs, portfolio.id));
      } catch (_) {}
    })();
    return () => {
      mounted = false;
    };
  }, [user?.uid, portfolio?.id]);

  const handleHeaderToggleFavorite = useCallback(async () => {
    try {
      if (!user?.uid || !portfolio?.id) return;
      const next = await togglePortfolioFavorite(user.uid, portfolio.id);
      if (next && Array.isArray(next)) {
        setHeaderIsFavorite(isPortfolioFavorite(next, portfolio.id));
      }
    } catch (_) {}
  }, [user?.uid, portfolio?.id]);
  // Portfolio kaydetme fonksiyonu
  const savePortfolioChanges = useCallback(async () => {
    if (!user?.uid || !portfolio?.id) return;
    
    try {
      setSaveLoading(true);
      
      // Değişen alanları belirle
      const updates = {};
      const updatedFieldLabels = [];
      let priceChanged = false;
      const oldPrice = portfolio?.price ?? 0;
      let newPrice = oldPrice;
      
      // Title kontrolü
      if (tempPortfolioData.title && tempPortfolioData.title !== portfolio.title) {
        updates.title = tempPortfolioData.title;
        updatedFieldLabels.push('Başlık');
      }
      
      // Description kontrolü
      if (tempPortfolioData.description && tempPortfolioData.description !== portfolio.description) {
        updates.description = tempPortfolioData.description;
        updatedFieldLabels.push('Açıklama');
      }
      
      // Price kontrolü
      if (tempPortfolioData.price !== undefined && tempPortfolioData.price !== portfolio.price) {
        const normalizedPrice = tempPortfolioData.price === null ? 0 : tempPortfolioData.price;
        updates.price = normalizedPrice;
        updatedFieldLabels.push('Fiyat');
        priceChanged = true;
        newPrice = normalizedPrice;
      }
      
      // ListingStatus kontrolü
      if (tempPortfolioData.listingStatus && 
          tempPortfolioData.listingStatus !== (portfolio.listingStatus || 'Satılık')) {
        updates.listingStatus = tempPortfolioData.listingStatus;
        updatedFieldLabels.push('İlan Durumu');
      }
      
      // Building Age kontrolü
      if (tempPortfolioData.buildingAge !== undefined && tempPortfolioData.buildingAge !== portfolio.buildingAge) {
        updates.buildingAge = tempPortfolioData.buildingAge;
        updatedFieldLabels.push('Bina Yaşı');
      }
      
      // Dues kontrolü
      if (tempPortfolioData.dues !== undefined && tempPortfolioData.dues !== portfolio.dues) {
        updates.dues = tempPortfolioData.dues;
        updatedFieldLabels.push('Aidat');
      }
      
      // Balcony Count kontrolü
      if (tempPortfolioData.balconyCount !== undefined && tempPortfolioData.balconyCount !== portfolio.balconyCount) {
        updates.balconyCount = tempPortfolioData.balconyCount;
        updatedFieldLabels.push('Balkon Sayısı');
      }
      
      // Bathroom Count kontrolü
      if (tempPortfolioData.bathroomCount !== undefined && tempPortfolioData.bathroomCount !== portfolio.bathroomCount) {
        updates.bathroomCount = tempPortfolioData.bathroomCount;
        updatedFieldLabels.push('Banyo Sayısı');
      }
      
      // Wardrobe kontrolü
      if (tempPortfolioData.wardrobe !== undefined && tempPortfolioData.wardrobe !== portfolio.wardrobe) {
        updates.wardrobe = tempPortfolioData.wardrobe;
        updatedFieldLabels.push('Vestiyer');
      }
      
      // Exchange kontrolü
      if (tempPortfolioData.exchange !== undefined && tempPortfolioData.exchange !== portfolio.exchange) {
        updates.exchange = tempPortfolioData.exchange;
        updatedFieldLabels.push('Takas');
      }
      
      // Glass Balcony kontrolü
      if (tempPortfolioData.glassBalcony !== undefined && tempPortfolioData.glassBalcony !== portfolio.glassBalcony) {
        updates.glassBalcony = tempPortfolioData.glassBalcony;
        updatedFieldLabels.push('Cam Balkon');
      }
      
      // Net Square Meters kontrolü
      if (tempPortfolioData.netSquareMeters !== undefined && tempPortfolioData.netSquareMeters !== portfolio.netSquareMeters) {
        updates.netSquareMeters = tempPortfolioData.netSquareMeters;
        updatedFieldLabels.push('Net M²');
      }
      
      // Gross Square Meters kontrolü
      if (tempPortfolioData.grossSquareMeters !== undefined && tempPortfolioData.grossSquareMeters !== portfolio.grossSquareMeters) {
        updates.grossSquareMeters = tempPortfolioData.grossSquareMeters;
        updatedFieldLabels.push('Brüt M²');
      }
      
      // Total Floors kontrolü
      if (tempPortfolioData.totalFloors !== undefined && tempPortfolioData.totalFloors !== portfolio.totalFloors) {
        updates.totalFloors = tempPortfolioData.totalFloors;
        updatedFieldLabels.push('Toplam Kat');
      }
      
      // Current Floor kontrolü
      if (tempPortfolioData.floor !== undefined && tempPortfolioData.floor !== portfolio.floor) {
        updates.floor = tempPortfolioData.floor;
        updatedFieldLabels.push('Bulunduğu Kat');
      }
      
      // Parking kontrolü
      if (tempPortfolioData.parking !== undefined && tempPortfolioData.parking !== portfolio.parking) {
        updates.parking = tempPortfolioData.parking;
        updatedFieldLabels.push('Otopark');
      }
      
      // Furnished kontrolü
      if (tempPortfolioData.furnished !== undefined && tempPortfolioData.furnished !== portfolio.furnished) {
        updates.furnished = tempPortfolioData.furnished;
        updatedFieldLabels.push('Eşyalı');
      }
      
      // Kitchen Type kontrolü
      if (tempPortfolioData.kitchenType !== undefined && tempPortfolioData.kitchenType !== portfolio.kitchenType) {
        updates.kitchenType = tempPortfolioData.kitchenType;
        updatedFieldLabels.push('Mutfak Tipi');
      }
      
      // Deed Status kontrolü
      if (tempPortfolioData.deedStatus !== undefined && tempPortfolioData.deedStatus !== portfolio.deedStatus) {
        updates.deedStatus = tempPortfolioData.deedStatus;
        updatedFieldLabels.push('Tapu Durumu');
      }
      
      // Heating Type kontrolü
      if (tempPortfolioData.heatingType !== undefined && tempPortfolioData.heatingType !== portfolio.heatingType) {
        updates.heatingType = tempPortfolioData.heatingType;
        updatedFieldLabels.push('Isıtma Tipi');
      }
      
      // Usage Status kontrolü
      if (tempPortfolioData.usageStatus !== undefined && tempPortfolioData.usageStatus !== portfolio.usageStatus) {
        updates.usageStatus = tempPortfolioData.usageStatus;
        updatedFieldLabels.push('Kullanım Durumu');
      }
      
      // Deposit kontrolü
      if (tempPortfolioData.deposit !== undefined && tempPortfolioData.deposit !== portfolio.deposit) {
        updates.deposit = tempPortfolioData.deposit;
        updatedFieldLabels.push('Depozito');
      }
      
      // Room Count kontrolü
      if (tempPortfolioData.roomCount !== undefined && tempPortfolioData.roomCount !== portfolio.roomCount) {
        updates.roomCount = tempPortfolioData.roomCount;
        updatedFieldLabels.push('Oda Sayısı');
      }
      
      // Parent Bathroom kontrolü
      if (tempPortfolioData.parentBathroom !== undefined && tempPortfolioData.parentBathroom !== portfolio.parentBathroom) {
        updates.parentBathroom = tempPortfolioData.parentBathroom;
        updatedFieldLabels.push('Ebeveyn Banyo');
      }
      
      // Owner Name kontrolü
      if (tempPortfolioData.ownerName !== undefined && tempPortfolioData.ownerName !== portfolio.ownerName) {
        updates.ownerName = tempPortfolioData.ownerName;
        updatedFieldLabels.push('Mülk Sahibi Adı');
      }
      
      // Owner Phone kontrolü
      if (tempPortfolioData.ownerPhone !== undefined && tempPortfolioData.ownerPhone !== portfolio.ownerPhone) {
        updates.ownerPhone = tempPortfolioData.ownerPhone;
        updatedFieldLabels.push('Telefon');
      }
      
      // Key Location kontrolü
      if (tempPortfolioData.keyLocation !== undefined && tempPortfolioData.keyLocation !== portfolio.keyLocation) {
        updates.keyLocation = tempPortfolioData.keyLocation;
        updatedFieldLabels.push('Anahtar Yeri');
      }
      
      // Special Note kontrolü
      if (tempPortfolioData.specialNote !== undefined && tempPortfolioData.specialNote !== portfolio.specialNote) {
        updates.specialNote = tempPortfolioData.specialNote;
        updatedFieldLabels.push('Özel Not');
      }
      
      // Door Code kontrolü
      if (tempPortfolioData.doorCode !== undefined && tempPortfolioData.doorCode !== portfolio.doorCode) {
        updates.doorCode = tempPortfolioData.doorCode;
        updatedFieldLabels.push('Kapı Şifresi');
      }
      
      // Images kontrolü - sadece gerçekten değişiklik varsa
      if (tempPortfolioData.selectedImages && tempPortfolioData.selectedImages.length > 0) {
        const newImages = tempPortfolioData.selectedImages.map(img => img.uri);
        const currentImages = portfolio.images || [];
        
        // Resim sayısı veya içeriği değişmişse güncelle
        if (newImages.length !== currentImages.length || 
            !newImages.every((img, index) => img === currentImages[index])) {
          updates.images = newImages;
          updatedFieldLabels.push('Resimler');
        }
      } else if (tempPortfolioData.images && tempPortfolioData.images.length > 0) {
        const currentImages = portfolio.images || [];
        
        // Resim sayısı veya içeriği değişmişse güncelle
        if (tempPortfolioData.images.length !== currentImages.length || 
            !tempPortfolioData.images.every((img, index) => img === currentImages[index])) {
          updates.images = tempPortfolioData.images;
          updatedFieldLabels.push('Resimler');
        }
      }
      
      // Eğer hiç değişiklik yoksa
      if (Object.keys(updates).length === 0) {
        // Edit mode'dan çık
        setIsEditMode(false);
        setTempPortfolioData({});
        setShowDeleteButton(false);
        
        showSuccessMessage(['Hiçbir değişiklik yapılmadı']);
        return;
      }
      
      // Firestore'da güncelle (fiyat değişiklikleri için backend trigger devreye girer)
      const portfolioRef = doc(firestore, 'portfolios', portfolio.id);
      await updateDoc(portfolioRef, {
        ...updates,
        updatedAt: serverTimestamp()
      });
      
      // Local state'i güncelle
      const updatedPortfolio = { ...portfolio, ...updates };
      
      // Navigation params'ı güncelle
      navigation.setParams({ 
        portfolio: updatedPortfolio 
      });
      
      // Edit mode'dan çık
      setIsEditMode(false);
      setTempPortfolioData({});
      setShowDeleteButton(false);
      
      // Success modal göster
      showSuccessMessage(updatedFieldLabels);
      
    } catch (error) {
      console.error('Portfolio kaydetme hatası:', error);
      Alert.alert('Hata', 'Portfolio kaydedilirken bir hata oluştu');
    } finally {
      setSaveLoading(false);
    }
  }, [user?.uid, portfolio, tempPortfolioData, navigation, showSuccessMessage]);

  // Portföy silme fonksiyonu
  const deletePortfolio = useCallback(async () => {
    if (!user?.uid || !portfolio?.id) return;

    try {
      setDeleteLoading(true);

      // Firestore'dan sil
      const portfolioRef = doc(firestore, 'portfolios', portfolio.id);
      await deleteDoc(portfolioRef);

      // Modalları kapat
      setShowFinalDeleteModal(false);
      setShowDeleteModal(false);

      // Başarı modalını göster
      setShowDeleteSuccessModal(true);

    } catch (error) {
      console.error('Portföy silme hatası:', error);
      Alert.alert('Hata', 'Portföy silinirken bir hata oluştu');
    } finally {
      setDeleteLoading(false);
    }
  }, [user?.uid, portfolio?.id]);

  // Düzenleme modu fonksiyonları
  const toggleEditMode = useCallback(() => {
    if (isEditMode) {
      // Düzenleme modundan çıkarken değişiklikleri sıfırla
      setTempPortfolioData({});
    } else {
      // Düzenleme moduna girerken mevcut verileri kopyala
      setTempPortfolioData({ ...portfolio });
    }
    setIsEditMode(!isEditMode);
  }, [isEditMode, portfolio]);

  const startEditing = useCallback((field) => {
    switch (field) {
      case 'title':
        setShowTitleModal(true);
        break;
      case 'price':
        setShowPriceModal(true);
        break;
      case 'type':
        setShowTypeModal(true);
        break;
      // case 'description':
      //   setShowDescriptionModal(true);
      //   break;
      case 'buildingAge':
        setShowBuildingAgeModal(true);
        break;
      case 'dues':
        setShowDuesModal(true);
        break;
      case 'balconyCount':
        setShowBalconyCountModal(true);
        break;
      case 'bathroomCount':
        setShowBathroomCountModal(true);
        break;
      case 'wardrobe':
        setShowWardrobeModal(true);
        break;
      case 'exchange':
        setShowExchangeModal(true);
        break;
      case 'glassBalcony':
        setShowGlassBalconyModal(true);
        break;
      case 'netSquareMeters':
        setShowNetSquareMetersModal(true);
        break;
      case 'grossSquareMeters':
        setShowGrossSquareMetersModal(true);
        break;
      case 'totalFloors':
        setShowTotalFloorsModal(true);
        break;
      case 'floor':
        setShowCurrentFloorModal(true);
        break;
      case 'parking':
        setShowParkingModal(true);
        break;
      case 'furnished':
        setShowFurnishedModal(true);
        break;
      case 'kitchenType':
        setShowKitchenTypeModal(true);
        break;
      case 'deedStatus':
        setShowDeedStatusModal(true);
        break;
      case 'heatingType':
        setShowHeatingTypeModal(true);
        break;
      case 'usageStatus':
        setShowUsageStatusModal(true);
        break;
      case 'deposit':
        setShowDepositModal(true);
        break;
      case 'roomCount':
        setShowRoomCountModal(true);
        break;
      case 'parentBathroom':
        setShowParentBathroomModal(true);
        break;
      case 'ownerName':
        setShowOwnerNameModal(true);
        break;
      case 'ownerPhone':
        setShowOwnerPhoneModal(true);
        break;
      case 'keyLocation':
        setShowKeyLocationModal(true);
        break;
      case 'specialNote':
        setShowSpecialNoteModal(true);
        break;
      case 'doorCode':
        setShowDoorCodeModal(true);
        break;
      case 'images':
        setShowImagePicker(true);
        break;
    }
  }, []);

  // Owner bilgisini Firestore'dan çek (sadece portföy sahibi için)
  useEffect(() => {
    let cancelled = false;
    
    const fetchOwnerInfo = async () => {
      const ownerId = portfolio?.userId;
      if (!ownerId) {
        setOwnerResolved({
          id: null, // ID'yi null olarak ayarla
          name: 'Portföy Sahibi',
          officeName: '',
          phone: '',
          avatar: '',
        });
        return;
      }

      // Sadece sahibi için Firestore'dan kullanıcı bilgisi çek
      if (!isOwner) {
        // Non-owner: portföy belgesindeki gömülü bilgileri kullan
        setOwnerResolved({
          id: ownerId, // ID'yi ekle
          name: ownerNameFinal || 'Portföy Sahibi',
          officeName: ownerOfficeFinal || '',
          phone: ownerPhoneFinal || '',
          avatar: ownerAvatarFinal || '',
        });
        return;
      }

      try {
        const maskPhone = (p) => {
          if (!p || typeof p !== 'string') return '';
          const digits = p.replace(/\D/g, '');
          if (digits.length < 4) return p;
          const last4 = digits.slice(-4);
          return `Kullanıcı (${last4})`;
        };
        const userDoc = await getDoc(doc(firestore, 'users', ownerId));
        if (cancelled) return;
        
        if (userDoc.exists()) {
          const userData = userDoc.data();
          const resolvedName = userData.name || userData.displayName || maskPhone(userData.phoneNumber) || 'Portföy Sahibi';
          setOwnerResolved({
            id: ownerId, // ID'yi ekle
            name: resolvedName,
            officeName: userData.officeName || '',
            phone: userData.phoneNumber || '',
            avatar: userData.profilePicture || '',
          });
        } else {
          // Fallback: kullanıcı bulunamazsa portföy belgesindeki gömülü sahibi bilgilerini kullan
          setOwnerResolved({
            id: ownerId, // ID'yi ekle
            name: ownerNameFinal || 'Portföy Sahibi',
            officeName: ownerOfficeFinal || '',
            phone: ownerPhoneFinal || '',
            avatar: ownerAvatarFinal || '',
          });
        }
      } catch (error) {
        __DEV__ && console.log('Owner bilgisi alınamadı:', error);
        // Hata durumunda portföy belgesindeki gömülü sahibi bilgilerini kullan
        setOwnerResolved({
          id: ownerId, // ID'yi ekle
          name: ownerNameFinal || 'Portföy Sahibi',
          officeName: ownerOfficeFinal || '',
          phone: ownerPhoneFinal || '',
          avatar: ownerAvatarFinal || '',
        });
      }
    };

    fetchOwnerInfo();
    return () => { cancelled = true; };
  }, [portfolio?.userId, ownerNameFinal, ownerOfficeFinal, ownerPhoneFinal, ownerAvatarFinal, isOwner]);

  // İzin durumunu kontrol et
  useEffect(() => {
    const checkPermissionStatus = async () => {
      if (!portfolio?.id || !user?.uid || isOwner) {
        setPermissionStatus(null);
        return;
      }

      try {
        const permissionsQuery = query(
          collection(firestore, 'permissionRequests'),
          where('portfolioId', '==', portfolio.id),
          where('requesterId', '==', user.uid),
          where('userId', '==', user.uid) // rules-compatible read
        );
        
        const permissionsDocs = await getDocs(permissionsQuery);
        
        if (permissionsDocs.empty) {
          setPermissionStatus(null); // Hiç talep yapılmamış
        } else {
          // En son talebi al (createdAt'e göre sırala)
          const sortedPermissions = permissionsDocs.docs.sort((a, b) => {
            const aTime = a.data().createdAt?.toDate?.() || new Date(0);
            const bTime = b.data().createdAt?.toDate?.() || new Date(0);
            return bTime.getTime() - aTime.getTime(); // En yeni önce
          });
          
          const latestPermission = sortedPermissions[0].data();
          setPermissionStatus(latestPermission.status); // 'pending', 'approved', 'rejected'
          __DEV__ && console.log('🔍 Permission status güncellendi:', latestPermission.status);
        }
      } catch (error) {
        console.error('Permission status check error:', error);
        setPermissionStatus(null);
      }
    };

    checkPermissionStatus();
  }, [portfolio?.id, user?.uid, isOwner]);

  // Portfolio kontrolü
  if (!portfolio) {
    return (
      <SafeAreaView edges={['left','right','bottom']} style={[styles.container, { backgroundColor: 'transparent' }]}>
        <View style={styles.backgroundContainer}>
          <Image source={require('../assets/images/dark-bg2.png')} style={styles.backgroundImage} />
        </View>
        
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 0) + 12, paddingBottom: currentTheme.spacing.lg, position: 'absolute', top: 0, left: 0, right: 0 }]}>
          <TouchableOpacity style={styles.backButton} onPress={handleGoBack}>
            <Image source={require('../assets/images/icons/return.png')} style={styles.backIcon} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: currentTheme.colors.text }]}>
            Portföy Detayı
          </Text>
          <View style={styles.headerSpacer} />
        </View>

        {/* Spacer for header height */}
        <View style={{ height: Math.max(insets.top, 0) + 12 + 37 + ((currentTheme?.spacing && currentTheme.spacing.lg) ? currentTheme.spacing.lg : 16) }} />

        <View style={styles.errorContainer}>
          <Text style={[styles.errorText, { color: currentTheme.colors.text }]}>
            Portföy bilgisi bulunamadı.
          </Text>
        </View>
      </SafeAreaView>
    );
  }
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Background */}
      {!isDark && (
        <View style={styles.backgroundContainer}>
          <Image
            source={require('../assets/images/light-bg.jpg')}
            style={styles.backgroundImage}
          />
        </View>
      )}
      {isDark && (
        <View style={styles.backgroundContainer}>
          <Image
            source={require('../assets/images/dark-bg2.png')}
            style={styles.backgroundImage}
          />
        </View>
      )}

      {/* Request Preview Overlay */}
      {showRequestOverlay && (
        <View style={styles.requestOverlay}>
          <TouchableOpacity style={styles.requestOverlayBackdrop} activeOpacity={1} onPress={closeRequestOverlay} />
          <Animated.View
            style={[
              styles.requestOverlayCard,
              {
                opacity: requestOverlayAnim,
                transform: [{ translateY: requestOverlayAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
              }
            ]}
          >
            <GlassmorphismView
              style={styles.requestOverlayGradient}
              blurEnabled={false}
              config={{
                overlayColor: 'transparent',
                startColor: 'rgb(17, 36, 49)',
                endColor: 'rgba(17, 36, 49, 0.85)',
                gradientAlpha: 1,
                gradientDirection: 140,
                gradientSpread: 6,
                ditherStrength: 4.0,
              }}
            />

            <View style={styles.requestOverlayHeader}>
              <Text style={[styles.requestOverlayTitle, { color: currentTheme.colors.text }]} numberOfLines={1}>
                {selectedRequest?.title || 'Talep Önizleme'}
              </Text>
              <TouchableOpacity onPress={closeRequestOverlay} style={styles.requestOverlayIconCloseButton}>
                <Image source={require('../assets/images/icons/close.png')} style={styles.requestOverlayCloseIcon} />
              </TouchableOpacity>
            </View>

            <View style={styles.requestOverlayContent}>
              {/* Owner */}
              <View style={styles.requestOverlayOwnerRow}>
                <Image
                  source={selectedRequest?.userProfile?.profilePicture && selectedRequest.userProfile.profilePicture !== 'default-logo'
                    ? { uri: selectedRequest.userProfile.profilePicture }
                    : require('../assets/images/logo-krimson.png')}
                  style={styles.requestOverlayAvatar}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.requestOverlayOwnerName, { color: currentTheme.colors.text }]} numberOfLines={1}>
                    {selectedRequest?.userProfile?.name || 'Kullanıcı'}
                  </Text>
                  <Text style={[styles.requestOverlayOwnerOffice, { color: currentTheme.colors.textSecondary }]} numberOfLines={1}>
                    {selectedRequest?.userProfile?.officeName || 'Ofis'}
                  </Text>
                </View>
              </View>

              {/* Info grid */}
              <View style={styles.requestOverlayGrid}>
                {(() => {
                  const r = selectedRequest || {};
                  const district = Array.isArray(r.districts) && r.districts.length > 0 ? r.districts[0] : (r.district || '');
                  const neighborhood = Array.isArray(r.neighborhoods) && r.neighborhoods.length > 0 ? r.neighborhoods[0] : (r.neighborhood || '');
                  const locationLabel = [neighborhood || district || '', (district || r.city || '')].filter(Boolean).join(', ');
                  const formatPrice = (v) => {
                    const n = Number(v); if (!Number.isFinite(n)) return '—';
                    return `${new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)}₺`;
                  };
                  return (
                    <>
                      <View style={styles.requestOverlayGridRow}>
                        <Text style={[styles.requestOverlayLabel, { color: currentTheme.colors.textSecondary }]}>Konum</Text>
                        <Text style={[styles.requestOverlayValue, { color: currentTheme.colors.text }]} numberOfLines={1}>{locationLabel || 'Belirtilmemiş'}</Text>
                      </View>
                      <View style={styles.requestOverlayGridRow}>
                        <Text style={[styles.requestOverlayLabel, { color: currentTheme.colors.textSecondary }]}>Oda</Text>
                        <Text style={[styles.requestOverlayValue, { color: currentTheme.colors.text }]} numberOfLines={1}>{r.roomCount || 'Belirtilmemiş'}</Text>
                      </View>
                      <View style={styles.requestOverlayGridRow}>
                        <Text style={[styles.requestOverlayLabel, { color: currentTheme.colors.textSecondary }]}>Bütçe</Text>
                        <Text style={[styles.requestOverlayValue, { color: currentTheme.colors.text }]} numberOfLines={1}>{formatPrice(r.minPrice)} - {formatPrice(r.maxPrice)}</Text>
                      </View>
                      <View style={styles.requestOverlayGridRow}>
                        <Text style={[styles.requestOverlayLabel, { color: currentTheme.colors.textSecondary }]}>m²</Text>
                        <Text style={[styles.requestOverlayValue, { color: currentTheme.colors.text }]} numberOfLines={1}>{(r.minSquareMeters || '—')} - {(r.maxSquareMeters || '—')} m²</Text>
                      </View>
                      <View style={styles.requestOverlayGridRow}>
                        <Text style={[styles.requestOverlayLabel, { color: currentTheme.colors.textSecondary }]}>Tür</Text>
                        <Text style={[styles.requestOverlayValue, { color: currentTheme.colors.text }]} numberOfLines={1}>{r.propertyType || '—'}</Text>
                      </View>
                      <View style={styles.requestOverlayGridRow}>
                        <Text style={[styles.requestOverlayLabel, { color: currentTheme.colors.textSecondary }]}>İşlem</Text>
                        <Text style={[styles.requestOverlayValue, { color: currentTheme.colors.text }]} numberOfLines={1}>{r.listingStatus || '—'}</Text>
                      </View>
                      <View style={[styles.requestOverlayGridRow, { marginTop: 8 }]}>
                        <Text style={[styles.requestOverlayLabel, { color: currentTheme.colors.textSecondary }]}>Tarih</Text>
                        <Text style={[styles.requestOverlayValue, { color: currentTheme.colors.text }]} numberOfLines={1}>{formatRequestCreatedAt(r.createdAt)}</Text>
                      </View>
                    </>
                  );
                })()}
              </View>
            </View>

            <View style={styles.requestOverlayFooter}>
              <View style={styles.requestOverlayFooterRow}>
                <TouchableOpacity
                  style={styles.requestOverlayCloseButton}
                  onPress={closeRequestOverlay}
                  activeOpacity={0.9}
                >
                  <Text style={styles.requestOverlayButtonTextWhite}>Kapat</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.requestOverlayCallButton, { backgroundColor: currentTheme.colors.primary }]}
                  onPress={() => {
                    try {
                      const phone = selectedRequest?.userProfile?.phoneNumber || '';
                      if (phone) { makePhoneCall(phone); }
                    } catch {}
                  }}
                  activeOpacity={0.9}
                >
                  <Text style={styles.requestOverlayButtonTextWhite}>Danışmanı Ara</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.requestOverlayWhatsAppButton}
                  onPress={() => {
                    try {
                      const phone = selectedRequest?.userProfile?.phoneNumber || '';
                      const msg = `Merhaba, ${selectedRequest?.title || 'talebiniz'} hakkında bilgi almak istiyorum.`;
                      if (phone) { sendWhatsAppMessage(phone, msg); }
                    } catch {}
                  }}
                  activeOpacity={0.9}
                >
                  <Text style={styles.requestOverlayButtonTextWhite}>WhatsApp</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Animated.View>
        </View>
      )}

      {/* Hidden Requests Overlay */}
      {showHiddenOverlay && (
        <View style={styles.requestOverlay}>
          <TouchableOpacity style={styles.requestOverlayBackdrop} activeOpacity={1} onPress={closeHiddenOverlay} />
          <Animated.View
            style={[
              styles.requestOverlayCard,
              {
                opacity: hiddenOverlayAnim,
                transform: [{ translateY: hiddenOverlayAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
              }
            ]}
          >
            <GlassmorphismView
              style={styles.requestOverlayGradient}
              blurEnabled={false}
              config={{
                overlayColor: 'transparent',
                startColor: 'rgb(17, 36, 49)',
                endColor: 'rgba(17, 36, 49, 0.85)',
                gradientAlpha: 1,
                gradientDirection: 140,
                gradientSpread: 6,
                ditherStrength: 4.0,
              }}
            />

            <View style={styles.requestOverlayHeader}>
              <Text style={[styles.requestOverlayTitle, { color: currentTheme.colors.text }]} numberOfLines={1}>
                Gizlenen Talepler
              </Text>
              <TouchableOpacity onPress={closeHiddenOverlay} style={styles.requestOverlayIconCloseButton}>
                <Image source={require('../assets/images/icons/close.png')} style={styles.requestOverlayCloseIcon} />
              </TouchableOpacity>
            </View>

            <View style={styles.requestOverlayContent}>
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1 }}>
                {(() => {
                  const hiddenItems = matchedRequests.filter(r => hiddenMatchedIds.has(r.id));
                  if (hiddenItems.length === 0) {
                    return (
                      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 24 }}>
                        <Image source={require('../assets/images/icons/talep.png')} style={{ width: 80, height: 80, marginBottom: 12, opacity: 0.9, tintColor: currentTheme.colors.textSecondary }} />
                        <Text style={{ color: currentTheme.colors.textSecondary, fontSize: 14, fontWeight: '800' }}>Gizlenen talep yok</Text>
                      </View>
                    );
                  }
                  return hiddenItems.map((req) => {
                    const avatarSrc = (req.userProfile?.profilePicture && req.userProfile.profilePicture !== 'default-logo')
                      ? { uri: req.userProfile.profilePicture }
                      : require('../assets/images/logo-krimson.png');
                    const userName = req.userProfile?.name || 'Kullanıcı';
                    const officeName = req.userProfile?.officeName || 'Ofis';
                    const district = Array.isArray(req.districts) && req.districts.length > 0 ? req.districts[0] : (req.district || '');
                    const neighborhood = Array.isArray(req.neighborhoods) && req.neighborhoods.length > 0 ? req.neighborhoods[0] : (req.neighborhood || '');
                    const locationLabel = [neighborhood || district || '', (district || req.city || '')].filter(Boolean).join(', ');
                    const formatPrice = (v) => {
                      const n = Number(v);
                      if (!Number.isFinite(n)) { return '—'; }
                      return `${new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)}₺`;
                    };
                  const rowAnim = matchedRowAnimsRef.current[req.id] || (matchedRowAnimsRef.current[req.id] = new Animated.Value(1));
                  return (
                    <Animated.View key={req.id} style={{
                      transform: [
                        { scale: rowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) },
                        { translateY: rowAnim.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) },
                      ],
                      opacity: rowAnim,
                    }}>
                      <View style={[styles.matchedCard, { borderColor: currentTheme.colors.border, backgroundColor: '#142331' }]}> 
                        <View style={styles.matchedCardHeader}>
                          <Image source={avatarSrc} style={styles.matchedAvatar} />
                          <View style={styles.matchedOwnerInfo}>
                            <Text style={[styles.matchedOwnerName, { color: currentTheme.colors.text }]} numberOfLines={1}>{userName}</Text>
                            <Text style={[styles.matchedOwnerOffice, { color: currentTheme.colors.textSecondary }]} numberOfLines={1}>{officeName}</Text>
                          </View>
                        </View>
                        <View style={styles.matchedBody}>
                          <Text style={[styles.matchedTitle, { color: currentTheme.colors.text }]} numberOfLines={2}>{req.title || 'Emlak Talebi'}</Text>
                          <View style={styles.matchedInfoGrid}>
                            <View style={styles.matchedInfoRow}>
                              <Text style={[styles.matchedLabel, { color: currentTheme.colors.textSecondary }]}>Konum</Text>
                              <Text style={[styles.matchedValue, { color: currentTheme.colors.text }]} numberOfLines={1}>{locationLabel || 'Belirtilmemiş'}</Text>
                            </View>
                            <View style={styles.matchedInfoRow}>
                              <Text style={[styles.matchedLabel, { color: currentTheme.colors.textSecondary }]}>Bütçe</Text>
                              <Text style={[styles.matchedValue, { color: currentTheme.colors.text }]} numberOfLines={1}>{formatPrice(req.minPrice)} - {formatPrice(req.maxPrice)}</Text>
                            </View>
                            <View style={styles.matchedInfoRow}>
                              <Text style={[styles.matchedLabel, { color: currentTheme.colors.textSecondary }]}>m²</Text>
                              <Text style={[styles.matchedValue, { color: currentTheme.colors.text }]} numberOfLines={1}>{(req.minSquareMeters || '—')} - {(req.maxSquareMeters || '—')} m²</Text>
                            </View>
                            <View style={[styles.matchedInfoRow, { marginTop: 8 }]}>
                              <Text style={[styles.matchedLabel, { color: currentTheme.colors.textSecondary }]}>Tarih</Text>
                              <Text style={[styles.matchedValue, { color: currentTheme.colors.text }]} numberOfLines={1}>{formatRequestCreatedAt(req.createdAt)}</Text>
                            </View>
                          </View>
                          <View style={styles.matchedActionsRow}>
                            <TouchableOpacity
                              style={[styles.matchedPrimaryButton, { backgroundColor: currentTheme.colors.primary, flexDirection: 'row', alignItems: 'center', gap: 6 }]}
                            onPress={() => {
                              const ra = matchedRowAnimsRef.current[req.id] || (matchedRowAnimsRef.current[req.id] = new Animated.Value(1));
                              try {
                                Animated.timing(ra, {
                                  toValue: 0,
                                  duration: 280,
                                  easing: Easing.bezier(0.2, 0.8, 0.2, 1),
                                  useNativeDriver: true,
                                }).start(() => {
                                  try { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); } catch {}
                                  setHiddenMatchedIds(prev => {
                                    const next = new Set(Array.from(prev));
                                    next.delete(req.id);
                                    return next;
                                  });
                                });
                              } catch {
                                setHiddenMatchedIds(prev => { const next = new Set(Array.from(prev)); next.delete(req.id); return next; });
                              }
                            }}
                              activeOpacity={0.9}
                            >
                              <Image source={require('../assets/images/icons/View_fill.png')} style={{ width: 14, height: 14, tintColor: 'white' }} />
                              <Text style={styles.matchedPrimaryButtonText}>Görünür Yap</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>
                    </Animated.View>
                    );
                  });
                })()}
              </ScrollView>
            </View>
          </Animated.View>
        </View>
      )}
      {/* Header */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 0) + 12, paddingBottom: currentTheme.spacing.lg, position: 'absolute', top: 0, left: 0, right: 0 }]}>
        <TouchableOpacity style={styles.backButton} onPress={handleGoBack}>
          <Image source={require('../assets/images/icons/return.png')} style={styles.backIcon} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1} ellipsizeMode="tail">
          {portfolio?.title ? (portfolio.title.length > 30 ? `${portfolio.title.substring(0, 30)}...` : portfolio.title) : 'Portföy Detayı'}
        </Text>
        <View style={styles.headerActionButtons}>
          {/* Favori Butonu (herkes için) */}
          <TouchableOpacity 
            style={[
              styles.headerFavoriteButton,
              headerIsFavorite && styles.headerFavoriteButtonActive,
            ]}
            onPress={handleHeaderToggleFavorite}
            activeOpacity={0.9}
          >
            <Image
              source={require('../assets/images/icons/Favorite_fill.png')}
              style={[
                styles.headerFavoriteIcon,
                headerIsFavorite && styles.headerFavoriteIconActive,
              ]}
            />
          </TouchableOpacity>

          {isOwner && showDeleteButton && (
            <Animated.View
              style={[
                styles.headerDeleteButtonContainer,
                {
                  opacity: deleteButtonAnim,
                  transform: [
                    {
                      scale: deleteButtonAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.5, 1],
                      }),
                    },
                    {
                      translateX: deleteButtonAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [-20, 0],
                      }),
                    },
                  ],
                },
              ]}
            >
              <TouchableOpacity 
                style={styles.headerDeleteButton}
                onPress={() => {
                  setShowDeleteModal(true);
                }}
              >
                <Image source={require('../assets/images/icons/trash.png')} style={styles.headerDeleteIcon} />
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* Header Share Button */}
          <TouchableOpacity 
            style={styles.headerShareButton}
            onPress={() => setShowShareModal(true)}
          >
            <Image source={require('../assets/images/icons/share.png')} style={styles.shareIconHeader} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Spacer for header height */}
      <View style={{ height: Math.max(insets.top, 0) + 12 + 37 + ((currentTheme?.spacing && currentTheme.spacing.lg) ? currentTheme.spacing.lg : 16) }} />

      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={[
          styles.contentContainer,
          { paddingBottom: insets.bottom + 100 },
        ]}
        showsVerticalScrollIndicator={false}
        bounces={true}
      >
        <Animatable.View ref={pageViewRef} animation="fadeIn" duration={350} style={styles.content} useNativeDriver>
          
          {/* Main Image */}
          <Animated.View 
            style={[
              styles.imageContainer,
              isEditMode && {
                borderWidth: 2,
                borderColor: blinkAnim.interpolate({
                  inputRange: [0.3, 1],
                  outputRange: [currentTheme.colors.error + '60', currentTheme.colors.error]
                }),
                zIndex: 10,
                elevation: 0
              }
            ]}
          >
            {/* Edit Mode Overlay */}
            {isEditMode && (
              <Animated.View style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: blinkAnim.interpolate({
                  inputRange: [0.3, 1],
                  outputRange: [currentTheme.colors.error + '50', currentTheme.colors.error + '20']
                }),
                zIndex: 5,
                pointerEvents: 'none'
              }} />
            )}
            
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              scrollEventThrottle={16}
              decelerationRate="fast"
              snapToInterval={screenWidth - 40}
              snapToAlignment="start"
              bounces={false}
              onScroll={(event) => {
                const index = Math.round(event.nativeEvent.contentOffset.x / (screenWidth - 40));
                if (index >= 0 && index < images.length && index !== activeImageIndex) {
                  setActiveImageIndex(index);
                }
              }}
              onMomentumScrollEnd={(event) => {
                const index = Math.round(event.nativeEvent.contentOffset.x / (screenWidth - 40));
                if (index >= 0 && index < images.length) {
                  setActiveImageIndex(index);
                }
              }}
              style={styles.imageScrollView}
            >
              {(imagesReady ? images : []).map((image, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.imageWrapper}
                  onPress={openImageModal}
                  activeOpacity={0.9}
                >
                  <Image
                    source={{ uri: cdnImg(image, { w: Math.min(Math.round(screenWidth), 800), q: 75, autoOptimize: 'high' }) }}
                    style={styles.mainImage}
                    resizeMode="cover"
                  />
                </TouchableOpacity>
              ))}
            </ScrollView>

            {imagesReady && images.length > 1 && (
              <View style={styles.imageCounterBadge}>
                <Text style={styles.imageCounterText}>
                  {activeImageIndex + 1}/{images.length}
                </Text>
              </View>
            )}

            {imagesReady && images.length > 1 && (
              <View style={styles.imageIndicators}>
                {(() => {
                  const total = images.length;
                  const windowSize = 5;
                  if (total <= windowSize) {
                    return images.map((_, index) => (
                      <TouchableOpacity
                        key={index}
                        style={[
                          styles.indicator,
                          activeImageIndex === index && styles.indicatorActive
                        ]}
                        onPress={() => setActiveImageIndex(index)}
                      />
                    ));
                  }
                  const half = Math.floor(windowSize / 2);
                  let start = activeImageIndex - half;
                  if (start < 0) start = 0;
                  if (start > total - windowSize) start = Math.max(0, total - windowSize);
                  const end = Math.min(total, start + windowSize);
                  const dots = [];
                  for (let i = start; i < end; i++) {
                    dots.push(
                      <TouchableOpacity
                        key={i}
                        style={[
                          styles.indicator,
                          activeImageIndex === i && styles.indicatorActive
                        ]}
                        onPress={() => setActiveImageIndex(i)}
                      />
                    );
                  }
                  return dots;
                })()}
              </View>
            )}
            
            {/* Edit overlay when in edit mode */}
            {isEditMode && (
              <TouchableOpacity
                style={styles.imageEditOverlay}
                onPress={() => startEditing('images')}
                activeOpacity={0.7}
              >
                <View style={styles.imageEditOverlayContent}>
                  <Text style={styles.imageEditOverlayText}>Düzenle</Text>
          </View>
              </TouchableOpacity>
            )}
          </Animated.View>

          {/* Property Info Card */}
          <Animated.View style={[
            styles.propertyCard,
            isEditMode && {
              borderWidth: 2,
              borderColor: blinkAnim.interpolate({
                inputRange: [0.3, 1],
                outputRange: [currentTheme.colors.error + '80', currentTheme.colors.error]
              }),
              borderRadius: 12,
            }
          ]}>
            <GlassmorphismView
              style={styles.propertyCardGradient}
              borderRadius={20}
              blurEnabled={false}
              config={{
                overlayColor: 'transparent',
                startColor: 'rgba(17, 36, 49, 0.97)',
                endColor: 'rgba(17, 36, 49, 0.45)',
                gradientAlpha: 1,
                gradientDirection: 130,
                gradientSpread: 4,
                ditherStrength: 4.0,
              }}
            />
            
            {/* Title and Price */}
            <View style={styles.titleSection}>
              <View style={styles.titleRow}>
                <Animated.View 
                  style={[
                    styles.propertyTitleContainer,
                    isEditMode && { 
                      backgroundColor: blinkAnim.interpolate({
                        inputRange: [0.3, 1],
                        outputRange: [currentTheme.colors.error + '80', currentTheme.colors.error + '30']
                      }),
                      borderRadius: 8,
                    }
                  ]}
                >
                  <Text style={styles.propertyTitle}>
                    {(tempPortfolioData.title !== undefined ? tempPortfolioData.title : portfolio?.title) || 'Modern Daire'}
                  </Text>
                  {isEditMode && (
                    <TouchableOpacity 
                      style={styles.editFieldButton}
                      onPress={() => startEditing('title')}
                    >
                      <Image source={require('../assets/images/icons/Edit_fill.png')} style={styles.editFieldIcon} />
                    </TouchableOpacity>
                  )}
                </Animated.View>
                {/* Share button moved to header */}
              </View>
              
              {/* Address */}
              <View style={styles.addressRow}>
                <Text style={styles.addressText}>
                  {portfolio?.address || 'İstanbul, Türkiye'}
                </Text>
              </View>
              
              <View style={styles.priceSection}>
              <Animated.View 
                style={[
                    styles.priceLeft,
                  isEditMode && { 
                      backgroundColor: blinkAnim.interpolate({
                        inputRange: [0.3, 1],
                        outputRange: [currentTheme.colors.error + '80', currentTheme.colors.error + '30']
                      }),
                    borderRadius: 8,
                  }
                ]}
              >
                  <Image source={require('../assets/images/icons/fiyat.png')} style={styles.priceIcon} />
                  <View style={{flexDirection: 'row', alignItems: 'baseline'}}>
                    {(() => {
                      let displayPrice;
                      if (isEditMode) {
                        displayPrice = tempPortfolioData.price !== undefined ? tempPortfolioData.price : portfolio?.price;
                      } else {
                        displayPrice = portfolio?.price;
                      }
                      
                      return (displayPrice && displayPrice !== null) ? (
                        <>
                          <Text style={styles.priceNumber}>{new Intl.NumberFormat('tr-TR').format(displayPrice)}</Text>
                          <Text style={styles.priceSymbol}> ₺</Text>
                        </>
                      ) : (
                        <Text style={styles.priceNumber}>Belirtilmemiş</Text>
                      );
                    })()}
                  </View>
                  {isEditMode && (
                    <TouchableOpacity 
                      style={styles.editFieldButton}
                      onPress={() => startEditing('price')}
                    >
                      <Image source={require('../assets/images/icons/Edit_fill.png')} style={styles.editFieldIcon} />
                    </TouchableOpacity>
                  )}
                </Animated.View>
                <Animated.View 
                  style={[
                    styles.saleRentBadge,
                    isEditMode && { 
                      backgroundColor: blinkAnim.interpolate({
                        inputRange: [0.3, 1],
                        outputRange: [currentTheme.colors.error + '80', currentTheme.colors.error + '30']
                      }),
                      borderRadius: 8,
                    }
                  ]}
                >
                  <Text style={styles.saleRentText}>
                    {isEditMode 
                      ? (tempPortfolioData.listingStatus || portfolio?.listingStatus || 'Satılık')
                      : (portfolio?.listingStatus || 'Satılık')
                    }
                  </Text>
                  {isEditMode && (
                    <TouchableOpacity 
                      style={[styles.editFieldButton, { right: -25, top: -5 }]}
                      onPress={() => startEditing('type')}
                    >
                      <Image source={require('../assets/images/icons/Edit_fill.png')} style={styles.editFieldIcon} />
                    </TouchableOpacity>
                  )}
                </Animated.View>
              </View>
              <View style={styles.crimsonDivider} />
            </View>

            {/* Gallery Section removed as requested */}

            {/* Property Features - 4'lü düzen - düzenlenebilir */}
            <View style={styles.featuresSection}>
              <View style={styles.featureRowFourContainer}>
                <View style={styles.featureRowFour}>
                  {/* Net Alan */}
                  <Animated.View style={[
                    styles.featureItemFour,
                    isEditMode && { 
                      backgroundColor: blinkAnim.interpolate({
                        inputRange: [0.3, 1],
                        outputRange: [currentTheme.colors.error + '80', currentTheme.colors.error + '30']
                      }),
                      borderRadius: 8,
                    }
                  ]}>
                    <Image source={require('../assets/images/icons/square.png')} style={styles.featureIconImageSmall} />
                    <Text style={styles.featureValueSmall}>{tempPortfolioData.netSquareMeters || portfolio?.netSquareMeters || portfolio?.squareMeters || '55'} m²</Text>
                    <Text style={styles.featureLabelSmall}>Net Alan</Text>
                    {isEditMode && (
                      <TouchableOpacity 
                        style={[styles.editFieldButton, { position: 'absolute', top: -5, right: -5, width: 20, height: 20 }]}
                        onPress={() => startEditing('netSquareMeters')}
                      >
                        <Image source={require('../assets/images/icons/Edit_fill.png')} style={[styles.editFieldIcon, { width: 12, height: 12 }]} />
                      </TouchableOpacity>
                    )}
                  </Animated.View>

                  {/* Divider */}
                  <View style={styles.featureDividerVertical} />

                  {/* Oda Sayısı */}
                  <Animated.View style={[
                    styles.featureItemFour,
                    isEditMode && { 
                      backgroundColor: blinkAnim.interpolate({
                        inputRange: [0.3, 1],
                        outputRange: [currentTheme.colors.error + '80', currentTheme.colors.error + '30']
                      }),
                      borderRadius: 8,
                    }
                  ]}>
                    <Image source={require('../assets/images/icons/room.png')} style={styles.featureIconImageSmall} />
                    <Text style={styles.featureValueSmall}>{tempPortfolioData.roomCount || portfolio?.roomCount || '3+1'}</Text>
                    <Text style={styles.featureLabelSmall}>Oda Sayısı</Text>
                    {isEditMode && (
                      <TouchableOpacity 
                        style={[styles.editFieldButton, { position: 'absolute', top: -5, right: -5, width: 20, height: 20 }]}
                        onPress={() => startEditing('roomCount')}
                      >
                        <Image source={require('../assets/images/icons/Edit_fill.png')} style={[styles.editFieldIcon, { width: 12, height: 12 }]} />
                      </TouchableOpacity>
                    )}
                  </Animated.View>

                  {/* Divider */}
                  <View style={styles.featureDividerVertical} />

                  {/* Banyo */}
                  <Animated.View style={[
                    styles.featureItemFour,
                    isEditMode && { 
                      backgroundColor: blinkAnim.interpolate({
                        inputRange: [0.3, 1],
                        outputRange: [currentTheme.colors.error + '80', currentTheme.colors.error + '30']
                      }),
                      borderRadius: 8,
                    }
                  ]}>
                    <Image source={require('../assets/images/icons/bathroom.png')} style={styles.featureIconImageSmall} />
                    <Text style={styles.featureValueSmall}>{tempPortfolioData.bathroomCount || portfolio?.bathroomCount || '2'}</Text>
                    <Text style={styles.featureLabelSmall}>Banyo</Text>
                    {isEditMode && (
                      <TouchableOpacity 
                        style={[styles.editFieldButton, { position: 'absolute', top: -5, right: -5, width: 20, height: 20 }]}
                        onPress={() => startEditing('bathroomCount')}
                      >
                        <Image source={require('../assets/images/icons/Edit_fill.png')} style={[styles.editFieldIcon, { width: 12, height: 12 }]} />
                      </TouchableOpacity>
                    )}
                  </Animated.View>

                  {/* Divider */}
                  <View style={styles.featureDividerVertical} />

                  {/* Ebeveyn Banyo */}
                  <Animated.View style={[
                    styles.featureItemFour,
                    isEditMode && { 
                      backgroundColor: blinkAnim.interpolate({
                        inputRange: [0.3, 1],
                        outputRange: [currentTheme.colors.error + '80', currentTheme.colors.error + '30']
                      }),
                      borderRadius: 8,
                    }
                  ]}>
                    <Image source={require('../assets/images/icons/bathroom.png')} style={styles.featureIconImageSmall} />
                    <Text style={styles.featureValueSmall}>
                      {(tempPortfolioData.parentBathroom !== undefined ? tempPortfolioData.parentBathroom : (portfolio?.parentBathroom || false)) ? '✓' : '✗'}
                    </Text>
                    <Text style={styles.featureLabelSmall}>Ebeveyn</Text>
                    {isEditMode && (
                      <TouchableOpacity 
                        style={[styles.editFieldButton, { position: 'absolute', top: -5, right: -5, width: 20, height: 20 }]}
                        onPress={() => startEditing('parentBathroom')}
                      >
                        <Image source={require('../assets/images/icons/Edit_fill.png')} style={[styles.editFieldIcon, { width: 12, height: 12 }]} />
                      </TouchableOpacity>
                    )}
                  </Animated.View>
                </View>
              </View>
            </View>
            {/* Additional Features List */}
            {portfolio && (
              <View style={styles.additionalFeaturesSection}>
                <View style={styles.additionalFeaturesGrid}>
                  {/* Brüt M² */}
                  {portfolio.grossSquareMeters != null && (
                    <Animated.View 
                      style={[
                        styles.additionalFeatureItem,
                        isEditMode && { 
                          backgroundColor: blinkAnim.interpolate({
                            inputRange: [0.3, 1],
                            outputRange: [currentTheme.colors.error + '60', currentTheme.colors.error + '15']
                          }),
                          borderRadius: 8,
                          padding: 8,
                        }
                      ]}
                    >
                      <Image source={require('../assets/images/icons/squarebrut.png')} style={styles.additionalFeatureIcon} />
                      <Text style={styles.additionalFeatureText}>Brüt M²: {tempPortfolioData.grossSquareMeters || portfolio.grossSquareMeters}</Text>
                      {isEditMode && (
                        <TouchableOpacity 
                          style={styles.editFieldButton}
                          onPress={() => startEditing('grossSquareMeters')}
                        >
                          <Image source={require('../assets/images/icons/Edit_fill.png')} style={styles.editFieldIcon} />
                        </TouchableOpacity>
                      )}
                    </Animated.View>
                  )}
                  
                  {/* Bina Yaşı */}
                  {portfolio.buildingAge != null && (
                    <Animated.View 
                      style={[
                        styles.additionalFeatureItem,
                        isEditMode && { 
                          backgroundColor: blinkAnim.interpolate({
                            inputRange: [0.3, 1],
                            outputRange: [currentTheme.colors.error + '60', currentTheme.colors.error + '15']
                          }),
                          borderRadius: 8,
                          padding: 8,
                        }
                      ]}
                    >
                      <Image source={require('../assets/images/icons/binayas.png')} style={styles.additionalFeatureIcon} />
                      <Text style={styles.additionalFeatureText}>Bina Yaşı: {tempPortfolioData.buildingAge || portfolio.buildingAge}</Text>
                      {isEditMode && (
                        <TouchableOpacity 
                          style={styles.editFieldButton}
                          onPress={() => startEditing('buildingAge')}
                        >
                          <Image source={require('../assets/images/icons/Edit_fill.png')} style={styles.editFieldIcon} />
                        </TouchableOpacity>
                      )}
                    </Animated.View>
                  )}
                  
                  {/* Aidat */}
                  {portfolio.dues != null && (
                    <Animated.View 
                      style={[
                        styles.additionalFeatureItem,
                        isEditMode && { 
                          backgroundColor: blinkAnim.interpolate({
                            inputRange: [0.3, 1],
                            outputRange: [currentTheme.colors.error + '60', currentTheme.colors.error + '15']
                          }),
                          borderRadius: 8,
                          padding: 8,
                        }
                      ]}
                    >
                      <Image source={require('../assets/images/icons/support.png')} style={styles.additionalFeatureIcon} />
                      <Text style={styles.additionalFeatureText}>Aidat: {tempPortfolioData.dues || portfolio.dues}₺</Text>
                      {isEditMode && (
                        <TouchableOpacity 
                          style={styles.editFieldButton}
                          onPress={() => startEditing('dues')}
                        >
                          <Image source={require('../assets/images/icons/Edit_fill.png')} style={styles.editFieldIcon} />
                        </TouchableOpacity>
                      )}
                    </Animated.View>
                  )}
                  
                  {/* Balkon Sayısı */}
                  {portfolio.balconyCount && portfolio.balconyCount > 0 && (
                    <Animated.View 
                      style={[
                        styles.additionalFeatureItem,
                        isEditMode && { 
                          backgroundColor: blinkAnim.interpolate({
                            inputRange: [0.3, 1],
                            outputRange: [currentTheme.colors.error + '60', currentTheme.colors.error + '15']
                          }),
                          borderRadius: 8,
                          padding: 8,
                        }
                      ]}
                    >
                      <Image source={require('../assets/images/icons/Balcony.png')} style={styles.additionalFeatureIcon} />
                      <Text style={styles.additionalFeatureText}>Balkon Sayısı: {tempPortfolioData.balconyCount || portfolio.balconyCount}</Text>
                      {isEditMode && (
                        <TouchableOpacity 
                          style={styles.editFieldButton}
                          onPress={() => startEditing('balconyCount')}
                        >
                          <Image source={require('../assets/images/icons/Edit_fill.png')} style={styles.editFieldIcon} />
                        </TouchableOpacity>
                      )}
                    </Animated.View>
                  )}
                  
                  {/* Toplam Kat Sayısı */}
                  {portfolio.totalFloors != null && (
                    <Animated.View 
                      style={[
                        styles.additionalFeatureItem,
                        isEditMode && { 
                          backgroundColor: blinkAnim.interpolate({
                            inputRange: [0.3, 1],
                            outputRange: [currentTheme.colors.error + '60', currentTheme.colors.error + '15']
                          }),
                          borderRadius: 8,
                          padding: 8,
                        }
                      ]}
                    >
                      <Image source={require('../assets/images/icons/toplamkat.png')} style={styles.additionalFeatureIcon} />
                      <Text style={styles.additionalFeatureText}>Toplam Kat: {tempPortfolioData.totalFloors || portfolio.totalFloors}</Text>
                      {isEditMode && (
                        <TouchableOpacity 
                          style={styles.editFieldButton}
                          onPress={() => startEditing('totalFloors')}
                        >
                          <Image source={require('../assets/images/icons/Edit_fill.png')} style={styles.editFieldIcon} />
                        </TouchableOpacity>
                      )}
                    </Animated.View>
                  )}
                  
                  {/* Bulunduğu Kat */}
                  {portfolio.floor != null && (
                    <Animated.View 
                      style={[
                        styles.additionalFeatureItem,
                        isEditMode && { 
                          backgroundColor: blinkAnim.interpolate({
                            inputRange: [0.3, 1],
                            outputRange: [currentTheme.colors.error + '60', currentTheme.colors.error + '15']
                          }),
                          borderRadius: 8,
                          padding: 8,
                        }
                      ]}
                    >
                      <Image source={require('../assets/images/icons/stairs.png')} style={styles.additionalFeatureIcon} />
                      <Text style={styles.additionalFeatureText}>Bulunduğu Kat: {tempPortfolioData.floor || portfolio.floor}</Text>
                      {isEditMode && (
                        <TouchableOpacity 
                          style={styles.editFieldButton}
                          onPress={() => startEditing('floor')}
                        >
                          <Image source={require('../assets/images/icons/Edit_fill.png')} style={styles.editFieldIcon} />
                        </TouchableOpacity>
                      )}
                    </Animated.View>
                  )}
                  
                  {/* Otopark */}
                  {(tempPortfolioData.parking !== undefined || portfolio.parking !== undefined || isEditMode) && (
                    <Animated.View 
                      style={[
                        styles.additionalFeatureItem,
                        isEditMode && { 
                          backgroundColor: blinkAnim.interpolate({
                            inputRange: [0.3, 1],
                            outputRange: [currentTheme.colors.error + '60', currentTheme.colors.error + '15']
                          }),
                          borderRadius: 8,
                          padding: 8,
                        }
                      ]}
                    >
                      <Image source={require('../assets/images/icons/parking.png')} style={styles.additionalFeatureIcon} />
                      <Text style={styles.additionalFeatureText}>
                        Otopark: {(tempPortfolioData.parking !== undefined ? tempPortfolioData.parking : (portfolio.parking || false)) ? '✓' : '✗'}
                      </Text>
                      {isEditMode && (
                        <TouchableOpacity 
                          style={styles.editFieldButton}
                          onPress={() => startEditing('parking')}
                        >
                          <Image source={require('../assets/images/icons/Edit_fill.png')} style={styles.editFieldIcon} />
                        </TouchableOpacity>
                      )}
                    </Animated.View>
                  )}
                  
                  {/* Cam Balkon */}
                  {(tempPortfolioData.glassBalcony !== undefined || portfolio.glassBalcony !== undefined || isEditMode) && (
                    <Animated.View 
                      style={[
                        styles.additionalFeatureItem,
                        isEditMode && { 
                          backgroundColor: blinkAnim.interpolate({
                            inputRange: [0.3, 1],
                            outputRange: [currentTheme.colors.error + '60', currentTheme.colors.error + '15']
                          }),
                          borderRadius: 8,
                          padding: 8,
                        }
                      ]}
                    >
                      <Image source={require('../assets/images/icons/window.png')} style={styles.additionalFeatureIcon} />
                      <Text style={styles.additionalFeatureText}>
                        Cam Balkon: {(tempPortfolioData.glassBalcony !== undefined ? tempPortfolioData.glassBalcony : portfolio.glassBalcony) ? '✓' : '✗'}
                      </Text>
                      {isEditMode && (
                        <TouchableOpacity 
                          style={styles.editFieldButton}
                          onPress={() => startEditing('glassBalcony')}
                        >
                          <Image source={require('../assets/images/icons/Edit_fill.png')} style={styles.editFieldIcon} />
                        </TouchableOpacity>
                      )}
                    </Animated.View>
                  )}
                  
                  {/* Vestiyer */}
                  {(tempPortfolioData.wardrobe !== undefined || portfolio.wardrobe !== undefined || isEditMode) && (
                    <Animated.View 
                      style={[
                        styles.additionalFeatureItem,
                        isEditMode && { 
                          backgroundColor: blinkAnim.interpolate({
                            inputRange: [0.3, 1],
                            outputRange: [currentTheme.colors.error + '60', currentTheme.colors.error + '15']
                          }),
                          borderRadius: 8,
                        }
                      ]}
                    >
                      <Image source={require('../assets/images/icons/cloakroom.png')} style={styles.additionalFeatureIcon} />
                      <Text style={styles.additionalFeatureText}>
                        Vestiyer: {(tempPortfolioData.wardrobe !== undefined ? tempPortfolioData.wardrobe : portfolio.wardrobe) ? '✓' : '✗'}
                      </Text>
                      {isEditMode && (
                        <TouchableOpacity 
                          style={styles.editFieldButton}
                          onPress={() => startEditing('wardrobe')}
                        >
                          <Image source={require('../assets/images/icons/Edit_fill.png')} style={styles.editFieldIcon} />
                        </TouchableOpacity>
                      )}
                    </Animated.View>
                  )}
                  
                  {/* Eşyalı */}
                  {(tempPortfolioData.furnished !== undefined || portfolio.furnished !== undefined || isEditMode) && (
                    <Animated.View 
                      style={[
                        styles.additionalFeatureItem,
                        isEditMode && { 
                          backgroundColor: blinkAnim.interpolate({
                            inputRange: [0.3, 1],
                            outputRange: [currentTheme.colors.error + '60', currentTheme.colors.error + '15']
                          }),
                          borderRadius: 8,
                          padding: 8,
                        }
                      ]}
                    >
                      <Image source={require('../assets/images/icons/furniture.png')} style={styles.additionalFeatureIcon} />
                      <Text style={styles.additionalFeatureText}>
                        Eşyalı: {(tempPortfolioData.furnished !== undefined ? tempPortfolioData.furnished : (portfolio.furnished || false)) ? '✓' : '✗'}
                      </Text>
                      {isEditMode && (
                        <TouchableOpacity 
                          style={styles.editFieldButton}
                          onPress={() => startEditing('furnished')}
                        >
                          <Image source={require('../assets/images/icons/Edit_fill.png')} style={styles.editFieldIcon} />
                        </TouchableOpacity>
                      )}
                    </Animated.View>
                  )}
                  
                  {/* Takas */}
                  {(tempPortfolioData.exchange !== undefined || portfolio.exchange !== undefined || isEditMode) && (
                    <Animated.View 
                      style={[
                        styles.additionalFeatureItem,
                        isEditMode && { 
                          backgroundColor: blinkAnim.interpolate({
                            inputRange: [0.3, 1],
                            outputRange: [currentTheme.colors.error + '60', currentTheme.colors.error + '15']
                          }),
                          borderRadius: 8,
                          padding: 8,
                        }
                      ]}
                    >
                      <Image source={require('../assets/images/icons/swap.png')} style={styles.additionalFeatureIcon} />
                      <Text style={styles.additionalFeatureText}>
                        Takas: {(tempPortfolioData.exchange !== undefined ? tempPortfolioData.exchange : portfolio.exchange) ? '✓' : '✗'}
                      </Text>
                      {isEditMode && (
                        <TouchableOpacity 
                          style={styles.editFieldButton}
                          onPress={() => startEditing('exchange')}
                        >
                          <Image source={require('../assets/images/icons/Edit_fill.png')} style={styles.editFieldIcon} />
                        </TouchableOpacity>
                      )}
                    </Animated.View>
                  )}
                  
                  {/* Mutfak Tipi */}
                  {(tempPortfolioData.kitchenType || portfolio.kitchenType) && (
                    <Animated.View 
                      style={[
                        styles.additionalFeatureItem,
                        isEditMode && { 
                          backgroundColor: blinkAnim.interpolate({
                            inputRange: [0.3, 1],
                            outputRange: [currentTheme.colors.error + '60', currentTheme.colors.error + '15']
                          }),
                          borderRadius: 8,
                          padding: 8,
                        }
                      ]}
                    >
                      <Image source={require('../assets/images/icons/kitchen.png')} style={styles.additionalFeatureIcon} />
                      <Text style={styles.additionalFeatureText}>Mutfak: {tempPortfolioData.kitchenType || portfolio.kitchenType}</Text>
                      {isEditMode && (
                        <TouchableOpacity 
                          style={styles.editFieldButton}
                          onPress={() => startEditing('kitchenType')}
                        >
                          <Image source={require('../assets/images/icons/Edit_fill.png')} style={styles.editFieldIcon} />
                        </TouchableOpacity>
                      )}
                    </Animated.View>
                  )}
                  
                  {/* Isıtma Tipi */}
                  {(tempPortfolioData.heatingType || portfolio.heatingType) && (
                    <Animated.View 
                      style={[
                        styles.additionalFeatureItem,
                        isEditMode && { 
                          backgroundColor: blinkAnim.interpolate({
                            inputRange: [0.3, 1],
                            outputRange: [currentTheme.colors.error + '60', currentTheme.colors.error + '15']
                          }),
                          borderRadius: 8,
                          padding: 8,
                        }
                      ]}
                    >
                      <Image source={require('../assets/images/icons/boiler.png')} style={styles.additionalFeatureIcon} />
                      <Text style={styles.additionalFeatureText}>Isıtma Tipi: {tempPortfolioData.heatingType || portfolio.heatingType}</Text>
                      {isEditMode && (
                        <TouchableOpacity 
                          style={styles.editFieldButton}
                          onPress={() => startEditing('heatingType')}
                        >
                          <Image source={require('../assets/images/icons/Edit_fill.png')} style={styles.editFieldIcon} />
                        </TouchableOpacity>
                      )}
                    </Animated.View>
                  )}
                  
                  {/* Kullanım Durumu */}
                  {(tempPortfolioData.usageStatus || portfolio.usageStatus) && (
                    <Animated.View 
                      style={[
                        styles.additionalFeatureItem,
                        isEditMode && { 
                          backgroundColor: blinkAnim.interpolate({
                            inputRange: [0.3, 1],
                            outputRange: [currentTheme.colors.error + '60', currentTheme.colors.error + '15']
                          }),
                          borderRadius: 8,
                          padding: 8,
                        }
                      ]}
                    >
                      <Image source={require('../assets/images/icons/kullanim.png')} style={styles.additionalFeatureIcon} />
                      <Text style={styles.additionalFeatureText}>Kullanım: {tempPortfolioData.usageStatus || portfolio.usageStatus}</Text>
                      {isEditMode && (
                        <TouchableOpacity 
                          style={styles.editFieldButton}
                          onPress={() => startEditing('usageStatus')}
                        >
                          <Image source={require('../assets/images/icons/Edit_fill.png')} style={styles.editFieldIcon} />
                        </TouchableOpacity>
                      )}
                    </Animated.View>
                  )}
                  
                  {/* Tapu Durumu */}
                  {(tempPortfolioData.deedStatus || portfolio.deedStatus) && (
                    <Animated.View 
                      style={[
                        styles.additionalFeatureItem,
                        isEditMode && { 
                          backgroundColor: blinkAnim.interpolate({
                            inputRange: [0.3, 1],
                            outputRange: [currentTheme.colors.error + '60', currentTheme.colors.error + '15']
                          }),
                          borderRadius: 8,
                          padding: 8,
                        }
                      ]}
                    >
                      <Image source={require('../assets/images/icons/title.png')} style={styles.additionalFeatureIcon} />
                      <Text style={styles.additionalFeatureText}>Tapu Durumu: {tempPortfolioData.deedStatus || portfolio.deedStatus}</Text>
                      {isEditMode && (
                        <TouchableOpacity 
                          style={styles.editFieldButton}
                          onPress={() => startEditing('deedStatus')}
                        >
                          <Image source={require('../assets/images/icons/Edit_fill.png')} style={styles.editFieldIcon} />
                        </TouchableOpacity>
                      )}
                    </Animated.View>
                  )}
                  
                  {/* Depozito (Kiralık için) */}
                  {portfolio.listingStatus === 'Kiralık' && (tempPortfolioData.deposit !== undefined || portfolio.deposit != null || isEditMode) && (
                    <Animated.View 
                      style={[
                        styles.additionalFeatureItem,
                        isEditMode && { 
                          backgroundColor: blinkAnim.interpolate({
                            inputRange: [0.3, 1],
                            outputRange: [currentTheme.colors.error + '60', currentTheme.colors.error + '15']
                          }),
                          borderRadius: 8,
                          padding: 8,
                        }
                      ]}
                    >
                      <Image source={require('../assets/images/icons/support.png')} style={styles.additionalFeatureIcon} />
                      <Text style={styles.additionalFeatureText}>Depozito: {tempPortfolioData.deposit || portfolio.deposit || 0}₺</Text>
                      {isEditMode && (
                        <TouchableOpacity 
                          style={styles.editFieldButton}
                          onPress={() => startEditing('deposit')}
                        >
                          <Image source={require('../assets/images/icons/Edit_fill.png')} style={styles.editFieldIcon} />
                        </TouchableOpacity>
                      )}
                    </Animated.View>
                  )}
                </View>
              </View>
            )}

            {/* Divider between Features and Location */}
            <View style={styles.crimsonDivider} />

            

            {/* Location Section */}
            <View style={styles.locationSection}>
              <View style={styles.locationTitleContainer}>
                <Image source={require('../assets/images/icons/harita.png')} style={styles.locationTitleIcon} />
                <Text style={styles.sectionTitle}>Konum</Text>
              </View>
              <View style={styles.locationInfo}>
                <Image source={require('../assets/images/icons/pinfill.png')} style={styles.locationIcon} />
                <Text style={styles.locationText}>
                  {portfolio?.address || 'Adres bilgisi bulunamadı'}
                </Text>
              </View>
              
              {/* Mini Map */}
              <View style={styles.mapContainer}>
                <MapboxGL.MapView
                  style={styles.map}
                  styleURL="mapbox://styles/mapbox/streets-v12"
                  logoEnabled={false}
                  attributionEnabled={false}
                  compassEnabled={false}
                  scaleBarEnabled={false}
                  renderWorldCopies={false}
                  localizeLabels={Platform.OS === 'ios' ? { locale: 'en-US' } : true}
                  zoomEnabled={true}
                  scrollEnabled={true}
                  pitchEnabled={true}
                  rotateEnabled={true}
                  surfaceView
                  onTouchStart={() => { try { scrollViewRef.current?.setNativeProps({ scrollEnabled: false }); } catch (e) {} }}
                  onTouchEnd={() => { try { scrollViewRef.current?.setNativeProps({ scrollEnabled: true }); } catch (e) {} }}
                  onTouchCancel={() => { try { scrollViewRef.current?.setNativeProps({ scrollEnabled: true }); } catch (e) {} }}
                  onRegionDidChange={() => { try { scrollViewRef.current?.setNativeProps({ scrollEnabled: true }); } catch (e) {} }}
                >
                  <MapboxGL.Camera
                    centerCoordinate={[
                      Number((portfolio?.coordinates?.longitude ?? portfolio?.longitude) ?? 36.2619),
                      Number((portfolio?.coordinates?.latitude ?? portfolio?.latitude) ?? 41.3151)
                    ]}
                    zoomLevel={15}
                    pitch={35}
                    heading={0}
                    animationDuration={0}
                  />
                  {/* Türkiye dışını maskele - PortfolioMap ile aynı renk */}
                  <MapboxGL.ShapeSource
                    id="pd-turkey-mask"
                    shape={{
                      type: 'FeatureCollection',
                      features: [{
                        type: 'Feature',
                        geometry: {
                          type: 'Polygon',
                          coordinates: [
                            [
                              [-180, -90], [180, -90], [180, 90], [-180, 90], [-180, -90]
                            ],
                            [
                              [25.5, 35.8], [44.8, 35.8], [44.8, 42.1], [25.5, 42.1], [25.5, 35.8]
                            ]
                          ],
                        },
                        properties: {},
                      }],
                    }}
                  >
                    <MapboxGL.FillLayer
                      id="pd-turkey-mask-fill"
                      style={{ fillColor: '#85d7ff', fillOpacity: 1.0 }}
                    />
                  </MapboxGL.ShapeSource>
                  
                  {/* 3D Buildings for mini map */}
                  <MapboxGL.FillExtrusionLayer
                    id="pd-3d-buildings"
                    sourceID="composite"
                    sourceLayerID="building"
                    filter={['==', 'extrude', 'true']}
                    style={{
                      fillExtrusionColor: [
                        'interpolate',
                        ['linear'],
                        ['get', 'height'],
                        0, '#e0e0e0',
                        50, '#999999',
                        100, '#666666',
                      ],
                      fillExtrusionHeight: ['get', 'height'],
                      fillExtrusionBase: ['get', 'min_height'],
                      fillExtrusionOpacity: 0.6,
                      fillExtrusionVerticalGradient: true,
                    }}
                  />
                  {/* Pin images (Satılık/Kiralık) */}
                  <MapboxGL.Images
                    images={{
                      'pin-satilik': require('../assets/images/icons/spin.png'),
                      'pin-kiralik': require('../assets/images/icons/kpin.png'),
                    }}
                  />
                  <MapboxGL.ShapeSource
                    id="property-source"
                    shape={{
                      type: 'Feature',
                      geometry: { 
                        type: 'Point', 
                        coordinates: [
                          Number((portfolio?.coordinates?.longitude ?? portfolio?.longitude) ?? 36.2619),
                          Number((portfolio?.coordinates?.latitude ?? portfolio?.latitude) ?? 41.3151)
                        ] 
                      },
                      properties: { 
                        id: 'property-marker', 
                        title: portfolio?.title || 'Emlak'
                      },
                    }}
                  >
                    <MapboxGL.SymbolLayer
                      id="property-pin"
                      style={{
                        iconImage: ((portfolio?.listingType === 'Satılık') || (String(portfolio?.listingStatus || '').toLowerCase().includes('sat'))) ? 'pin-satilik' : 'pin-kiralik',
                        iconSize: 0.15,
                        iconAnchor: 'bottom',
                        iconAllowOverlap: true,
                        iconIgnorePlacement: true,
                        iconPitchAlignment: 'viewport',
                        iconRotationAlignment: 'viewport',
                      }}
                    />
                  </MapboxGL.ShapeSource>
                </MapboxGL.MapView>
                <TouchableOpacity
                  style={styles.mapStreetViewButtonMini}
                  onPress={openStreetView}
                  activeOpacity={0.9}
                >
                  <Image
                    source={require('../assets/images/icons/sokak.png')}
                    style={styles.mapDirectionsIconMini}
                  />
                  <Text style={styles.mapDirectionsTextMini}>Sokak Görünümü</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.mapDirectionsButtonMini}
                  onPress={openDirections}
                  activeOpacity={0.9}
                >
                  <Image
                    source={require('../assets/images/icons/harita.png')}
                    style={styles.mapDirectionsIconMini}
                  />
                  <Text style={styles.mapDirectionsTextMini}>Yol Tarifi</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.mapExpandButton}
                  onPress={() => setShowMapOverlay(true)}
                  activeOpacity={0.85}
                  hitSlop={{ top: 8, left: 8, bottom: 8, right: 8 }}
                >
                  <Image
                    source={require('../assets/images/icons/full.png')}
                    style={styles.mapExpandIcon}
                  />
                </TouchableOpacity>
              </View>
            </View>

            

            {/* Owner Section - Portföyü ekleyen kişinin bilgileri */}
            <TouchableOpacity 
              style={styles.ownerSection}
              onPress={() => {
                // Sadece geçerli bir ID varsa ve misafir değilse yönlendir
                if (ownerResolved?.id && ownerResolved.id !== 'guest') {
                  navigation.navigate('Profile', { userId: ownerResolved.id });
                }
              }}
              disabled={!ownerResolved?.id || ownerResolved.id === 'guest'}
            >
              <View style={styles.ownerAvatarWrapper}>
                {ownerResolved?.avatar ? (
                  <Image source={{ uri: ownerResolved?.avatar }} style={styles.ownerAvatar} />
                ) : (
                  <View style={styles.ownerAvatarPlaceholder}>
                    <Text style={styles.ownerAvatarInitials}>
                      {((ownerResolved?.name || 'PS').trim().charAt(0) || 'P').toUpperCase()}
                    </Text>
                  </View>
                )}
              </View>
              <View style={styles.ownerInfo}>
                <Text style={styles.ownerName}>{ownerResolved?.name || 'Portföy Sahibi'}</Text>
                {!!(ownerResolved?.officeName) && (
                  <View style={styles.ownerOfficeBadge}>
                    <Text style={styles.ownerOfficeText}>{ownerResolved?.officeName}</Text>
                  </View>
                )}
                {/* Telefon gösterimi kaldırıldı */}
              </View>
            </TouchableOpacity>

            {/* Contact Buttons */}
            <View style={styles.contactButtons}>
              <TouchableOpacity
                style={styles.whatsappButton}
                onPress={() => {
                  const raw = ownerResolved?.phone || ownerPhoneFinal || '';
                  const phone = String(raw || '').trim();
                  if (!phone) {
                    Alert.alert('Bilgi', 'Telefon bilgisi bulunamadı.');
                    return;
                  }
                  const message = `Merhaba, ${portfolio?.title || 'portföy'} hakkında bilgi almak istiyorum.`;
                  sendWhatsAppMessage(phone, message);
                }}
              >
                <Image source={require('../assets/images/icons/whatsapp.png')} style={styles.contactIcon} />
                <Text style={styles.contactButtonText}>WhatsApp</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.phoneButton}
                onPress={() => {
                  const raw = ownerResolved?.phone || ownerPhoneFinal || '';
                  const phone = String(raw || '').trim();
                  if (!phone) {
                    Alert.alert('Bilgi', 'Telefon bilgisi bulunamadı.');
                    return;
                  }
                  makePhoneCall(phone);
                }}
              >
                <Image source={require('../assets/images/icons/phonefill.png')} style={styles.contactIcon} />
                <Text style={styles.contactButtonText}>Ara</Text>
              </TouchableOpacity>
            </View>

          </Animated.View>

        </Animatable.View>
      </ScrollView>
      <Modal
        visible={showMapOverlay}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMapOverlay(false)}
      >
        <View style={styles.mapOverlay}>
          <View style={styles.mapOverlayCard}>
            <TouchableOpacity
              style={styles.mapOverlayCloseButton}
              onPress={() => setShowMapOverlay(false)}
              activeOpacity={0.9}
            >
              <Image
                source={require('../assets/images/icons/deletephoto.png')}
                style={styles.mapOverlayCloseIcon}
              />
            </TouchableOpacity>
            <View style={styles.mapOverlayButtonBar}>
              <View style={styles.mapOverlayButtonsRow}>
                <TouchableOpacity
                  style={styles.mapOverlayDirectionsButton}
                  onPress={openDirections}
                  activeOpacity={0.9}
                >
                  <Image
                    source={require('../assets/images/icons/harita.png')}
                    style={styles.mapOverlayDirectionsIcon}
                  />
                  <Text style={styles.mapOverlayDirectionsText}>Yol Tarifi</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.mapOverlayDirectionsButton}
                  onPress={openStreetView}
                  activeOpacity={0.9}
                >
                  <Image
                    source={require('../assets/images/icons/sokak.png')}
                    style={styles.mapOverlayDirectionsIcon}
                  />
                  <Text style={styles.mapOverlayDirectionsText}>Sokak Görünümü</Text>
                </TouchableOpacity>
              </View>
            </View>
            <MapboxGL.MapView
              style={styles.mapOverlayMap}
            styleURL="mapbox://styles/mapbox/streets-v12"
            logoEnabled={false}
            attributionEnabled={false}
            compassEnabled={false}
            scaleBarEnabled={false}
            renderWorldCopies={false}
            localizeLabels={Platform.OS === 'ios' ? { locale: 'en-US' } : true}
            zoomEnabled={true}
            scrollEnabled={true}
            pitchEnabled={true}
            rotateEnabled={true}
            surfaceView
            >
            <MapboxGL.Camera
              centerCoordinate={[
                Number((portfolio?.coordinates?.longitude ?? portfolio?.longitude) ?? 36.2619),
                Number((portfolio?.coordinates?.latitude ?? portfolio?.latitude) ?? 41.3151)
              ]}
              zoomLevel={15}
              pitch={35}
              heading={0}
              animationDuration={0}
            />
            <MapboxGL.ShapeSource
              id="pd-turkey-mask-overlay"
              shape={{
                type: 'FeatureCollection',
                features: [{
                  type: 'Feature',
                  geometry: {
                    type: 'Polygon',
                    coordinates: [
                      [
                        [-180, -90], [180, -90], [180, 90], [-180, 90], [-180, -90]
                      ],
                      [
                        [25.5, 35.8], [44.8, 35.8], [44.8, 42.1], [25.5, 42.1], [25.5, 35.8]
                      ]
                    ],
                  },
                  properties: {},
                }],
              }}
            >
              <MapboxGL.FillLayer
                id="pd-turkey-mask-fill-overlay"
                style={{ fillColor: '#85d7ff', fillOpacity: 1.0 }}
              />
            </MapboxGL.ShapeSource>
            <MapboxGL.FillExtrusionLayer
              id="pd-3d-buildings-overlay"
              sourceID="composite"
              sourceLayerID="building"
              filter={['==', 'extrude', 'true']}
              style={{
                fillExtrusionColor: [
                  'interpolate',
                  ['linear'],
                  ['get', 'height'],
                  0, '#e0e0e0',
                  50, '#999999',
                  100, '#666666',
                ],
                fillExtrusionHeight: ['get', 'height'],
                fillExtrusionBase: ['get', 'min_height'],
                fillExtrusionOpacity: 0.6,
                fillExtrusionVerticalGradient: true,
              }}
            />
            <MapboxGL.Images
              images={{
                'pin-satilik': require('../assets/images/icons/spin.png'),
                'pin-kiralik': require('../assets/images/icons/kpin.png'),
              }}
            />
            <MapboxGL.ShapeSource
              id="property-source-overlay"
              shape={{
                type: 'Feature',
                geometry: {
                  type: 'Point',
                  coordinates: [
                    Number((portfolio?.coordinates?.longitude ?? portfolio?.longitude) ?? 36.2619),
                    Number((portfolio?.coordinates?.latitude ?? portfolio?.latitude) ?? 41.3151)
                  ]
                },
                properties: {
                  id: 'property-marker',
                  title: portfolio?.title || 'Emlak'
                },
              }}
            >
              <MapboxGL.SymbolLayer
                id="property-pin-overlay"
                style={{
                  iconImage: ((portfolio?.listingType === 'Satılık') || (String(portfolio?.listingStatus || '').toLowerCase().includes('sat'))) ? 'pin-satilik' : 'pin-kiralik',
                  iconSize: 0.18,
                  iconAnchor: 'bottom',
                  iconAllowOverlap: true,
                  iconIgnorePlacement: true,
                  iconPitchAlignment: 'viewport',
                  iconRotationAlignment: 'viewport',
                }}
              />
            </MapboxGL.ShapeSource>
            </MapboxGL.MapView>
          </View>
        </View>
      </Modal>
      
      {/* Manage Widget - Sağ kenarda sabit (KORUNUYOR) */}
      <Animated.View
        style={[
          styles.manageWidget,
          { 
            transform: [{ translateX: widgetAnim }]
          }
        ]}
      >
        <Animated.View
          style={[
            isEditMode && {
              opacity: blinkAnim.interpolate({
                inputRange: [0.3, 1],
                outputRange: [0.3, 1]
              })
            }
          ]}
        >
          <TouchableOpacity
            style={styles.manageWidgetButton}
            onPress={toggleManagePanel}
          >
          <View style={{ alignItems: 'center', width: '100%' }}>
            <Text style={styles.manageWidgetText} numberOfLines={1} allowFontScaling={false} adjustsFontSizeToFit minimumFontScale={0.75}>
              {isOwner ? 'Yönet' : 'Talep Et'}
            </Text>
            <Image source={require('../assets/images/icons/Setting_alt_fill2x.png')} style={[styles.manageWidgetIcon, styles.manageWidgetIconBelowText]} />
          </View>
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>

      {/* Matched Requests Widget (visible for all; non-owner uses only my requests) */}
        <Animated.View
          style={[
            styles.manageWidget,
            { 
              transform: [{ translateX: matchedWidgetAnim }],
              top: '50%'
            }
          ]}
          pointerEvents={showMatchedPanel ? 'none' : 'auto'}
        >
          <Animated.View
            style={{
              transform: [{ translateX: 0 }],
            }}
          >
            <TouchableOpacity
              style={styles.manageWidgetButton}
              activeOpacity={0.9}
              onPress={() => {
                try {
                  if (!showMatchedPanel) {
                    toggleMatchedPanel();
                    InteractionManager.runAfterInteractions(() => {
                      try { loadMatchedRequests({ preferCache: true }); } catch {}
                    });
                  } else {
                    toggleMatchedPanel();
                  }
                } catch {}
              }}
            >
            <View style={{ alignItems: 'center', width: '100%' }}>
              <Text style={styles.manageWidgetText} numberOfLines={1} allowFontScaling={false} adjustsFontSizeToFit minimumFontScale={0.75}>Eşleşen Talepler</Text>
              <Image source={require('../assets/images/icons/Setting_alt_fill2x.png')} style={[styles.manageWidgetIcon, styles.manageWidgetIconBelowText]} />
            </View>
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      {/* Manage Panel - Edge panel gibi (KORUNUYOR) */}
      {showManagePanel && (
        <View style={styles.managePanelOverlay}>
          <TouchableOpacity 
            style={styles.managePanelBackdrop}
            onPress={toggleManagePanel}
            activeOpacity={1}
          />
          <Animated.View 
            style={[
              styles.managePanel,
              { 
                transform: [{ translateX: managePanelAnim }],
                backgroundColor: 'transparent',
                height: screenHeight * 0.75,
                top: screenHeight * 0.125,
              }
            ]}
          >
            <GlassmorphismView
              style={styles.managePanelGradient}
              blurEnabled={false}
              config={{
                overlayColor: 'transparent',
                startColor: 'rgb(17, 36, 49)',
                endColor: 'rgba(17, 36, 49, 0.75)',
                gradientAlpha: 1,
                gradientDirection: 130,
                gradientSpread: 5,
                ditherStrength: 4.0,
              }}
            />
            {/* Panel Header */}
            <View style={[styles.managePanelHeader, { borderBottomColor: currentTheme.colors.border }]}>
              <Text style={[styles.managePanelTitle, { color: currentTheme.colors.text }]}>
                {isOwner ? 'Portföy Yönetimi' : 'Portföy Paylaşım Talebi'}
              </Text>
              <TouchableOpacity 
                style={styles.managePanelClose}
                onPress={toggleManagePanel}
              >
                <Text style={[styles.managePanelCloseText, { color: currentTheme.colors.textSecondary }]}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Panel Content */}
            <View style={styles.managePanelContent}>
              {isOwner ? (
                // Portföy sahibi için panel
                <>
                  
                  {/* Düzenleme Butonu (üstte tek buton) */}
                  <View style={styles.managePanelEditContainer}>
                    <TouchableOpacity 
                      style={[styles.managePanelEditButton, { backgroundColor: currentTheme.colors.error }]}
                      onPress={async () => {
                        if (showDeleteButton) {
                          await savePortfolioChanges();
                          Animated.timing(deleteButtonAnim, {
                            toValue: 0,
                            duration: 200,
                            useNativeDriver: true,
                          }).start(() => {
                            setShowDeleteButton(false);
                          });
                        } else {
                          toggleEditMode();
                          setShowDeleteButton(true);
                          Animated.timing(deleteButtonAnim, {
                            toValue: 1,
                            duration: 300,
                            useNativeDriver: true,
                          }).start();
                        }
                      }}
                      activeOpacity={0.9}
                    >
                      <Image source={require('../assets/images/icons/Edit_fill.png')} style={styles.managePanelEditIcon} />
                      <Text style={styles.managePanelEditText}>
                        {showDeleteButton ? (saveLoading ? 'Kaydediliyor...' : 'Kaydet') : 'Düzenle'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* Ana Butonlar */}
                  <View style={styles.managePanelButtonsContainer}>
                    <TouchableOpacity 
                      style={[styles.managePanelActionButton, { backgroundColor: currentTheme.colors.primary }]}
                      onPress={() => {
                        Animated.parallel([
                          Animated.timing(managePanelAnim, {
                            toValue: 250,
                            duration: 300,
                            easing: Easing.in(Easing.cubic),
                            useNativeDriver: true,
                          }),
                          Animated.timing(widgetAnim, {
                            toValue: 0,
                            duration: 300,
                            easing: Easing.in(Easing.cubic),
                            useNativeDriver: true,
                          })
                        ]).start(() => {
                          setShowManagePanel(false);
                          setShowSocialShareTemplate(true);
                        });
                      }}
                    >
                      <Text style={styles.managePanelActionIcon}>📢</Text>
                      <Text style={styles.managePanelActionText}>Tanıtım</Text>
                    </TouchableOpacity>

                    <TouchableOpacity 
                      style={[styles.managePanelActionButton, { backgroundColor: currentTheme.colors.secondary || currentTheme.colors.primary }]}
                      onPress={async () => {
                        toggleManagePanel();
                        
                        try {
                          const approvedRequestSnapshot = await firestore
                            .collection('permissionRequests')
                            .where('requesterId', '==', user.uid)
                            .where('portfolioId', '==', portfolio.id)
                            .where('status', '==', 'approved')
                            .limit(1)
                            .get();

                          if (!approvedRequestSnapshot.empty) {
                            const permissionDoc = approvedRequestSnapshot.docs[0];
                            const customShareResult = await generateCustomShareLink(permissionDoc.id, user.uid);
                            
                            if (customShareResult.success) {
                              await Share.share({
                                message: `${portfolio?.title || 'Portföy'} - ${user?.displayName || user?.email} tarafından paylaşıldı\n\n${customShareResult.customLink}`,
                                url: customShareResult.customLink,
                                title: 'Özel Portföy Paylaşımı',
                              });
                            }
                          } else {
                            const portfolioUrl = `https://talepify.com.tr/portfolio/${portfolio?.id || '123'}`;
                            await Share.share({
                              message: `${portfolio?.title || 'Portföy'} - ${portfolioUrl}`,
                              url: portfolioUrl,
                              title: 'Portföy Paylaş',
                            });
                          }
                        } catch (error) {
                          // Handle error silently
                        }
                      }}
                    >
                      <Text style={styles.managePanelActionIcon}>🌐</Text>
                      <Text style={styles.managePanelActionText}>Müşteriye Sun</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Ayırıcı */}
                  <View style={[styles.managePanelDivider, { backgroundColor: currentTheme.colors.border }]} />

                  {/* Portföy Sahibi Bilgileri */}
                  <View style={styles.managePanelOwnerInfo}>
                    <Text style={[styles.managePanelOwnerInfoTitle, { color: currentTheme.colors.text }]}>
                      Mülk Sahibi ve Özel Bilgiler
                    </Text>
                    
                    <Text style={[styles.managePanelOwnerInfoWarning, { color: currentTheme.colors.error }]}>
                      "Bu bilgileri sadece siz görebilirsiniz."
                    </Text>
                    
                    <View style={styles.managePanelOwnerDetails}>
                      {/* İsim Badge */}
                      {(tempPortfolioData.ownerName || portfolio?.ownerName || isEditMode) && (
                        <Animated.View style={[
                          styles.managePanelOwnerBadge, 
                          { backgroundColor: '#142331', borderColor: currentTheme.colors.border },
                          isEditMode && { 
                            backgroundColor: blinkAnim.interpolate({
                            inputRange: [0.3, 1],
                            outputRange: [currentTheme.colors.error + '60', currentTheme.colors.error + '15']
                          }),
                            borderColor: currentTheme.colors.error,
                          }
                        ]}>
                        <View style={[styles.managePanelOwnerBadgeIcon, { backgroundColor: currentTheme.colors.primary }]}>
                          <Text style={styles.managePanelOwnerBadgeIconText}>👤</Text>
                        </View>
                        <View style={styles.managePanelOwnerBadgeContent}>
                          <Text style={[styles.managePanelOwnerBadgeLabel, { color: currentTheme.colors.textSecondary }]}>
                            Mülk Sahibi
                          </Text>
                          <Text style={[styles.managePanelOwnerBadgeValue, { color: currentTheme.colors.text }]}>
                              {tempPortfolioData.ownerName || portfolio?.ownerName || 'Belirtilmemiş'}
                          </Text>
                        </View>
                          {isEditMode && (
                            <TouchableOpacity 
                              style={[styles.editFieldButton, { position: 'absolute', top: 5, right: 5, width: 24, height: 24 }]}
                              onPress={() => startEditing('ownerName')}
                            >
                              <Image source={require('../assets/images/icons/Edit_fill.png')} style={[styles.editFieldIcon, { width: 14, height: 14 }]} />
                            </TouchableOpacity>
                          )}
                        </Animated.View>
      
                      )}

                      {/* Telefon Badge */}
                      {(tempPortfolioData.ownerPhone || portfolio?.ownerPhone || isEditMode) && (
                        <Animated.View style={[
                          styles.managePanelOwnerBadge, 
                          { backgroundColor: '#142331', borderColor: currentTheme.colors.border },
                          isEditMode && { 
                            backgroundColor: blinkAnim.interpolate({
                            inputRange: [0.3, 1],
                            outputRange: [currentTheme.colors.error + '60', currentTheme.colors.error + '15']
                          }),
                            borderColor: currentTheme.colors.error,
                          }
                        ]}>
                        <View style={[styles.managePanelOwnerBadgeIcon, { backgroundColor: '#34C759' }]}>
                          <Text style={styles.managePanelOwnerBadgeIconText}>📞</Text>
                        </View>
                        <View style={styles.managePanelOwnerBadgeContent}>
                          <Text style={[styles.managePanelOwnerBadgeLabel, { color: currentTheme.colors.textSecondary }]}>
                            Telefon
                          </Text>
                          <Text style={[styles.managePanelOwnerBadgeValue, { color: currentTheme.colors.text }]}>
                              {tempPortfolioData.ownerPhone || portfolio?.ownerPhone || 'Belirtilmemiş'}
                          </Text>
                        </View>
                          {isEditMode && (
                            <TouchableOpacity 
                              style={[styles.editFieldButton, { position: 'absolute', top: 5, right: 5, width: 24, height: 24 }]}
                              onPress={() => startEditing('ownerPhone')}
                            >
                              <Image source={require('../assets/images/icons/Edit_fill.png')} style={[styles.editFieldIcon, { width: 14, height: 14 }]} />
                            </TouchableOpacity>
                          )}
                        </Animated.View>
                      )}

                      {/* Kapı Şifresi Badge */}
                      {(tempPortfolioData.doorCode || portfolio?.doorCode || isEditMode) && (
                        <Animated.View style={[
                          styles.managePanelOwnerBadge, 
                          { backgroundColor: '#142331', borderColor: currentTheme.colors.border },
                          isEditMode && { 
                            backgroundColor: blinkAnim.interpolate({
                            inputRange: [0.3, 1],
                            outputRange: [currentTheme.colors.error + '60', currentTheme.colors.error + '15']
                          }),
                            borderColor: currentTheme.colors.error,
                          }
                        ]}>
                          <View style={[styles.managePanelOwnerBadgeIcon, { backgroundColor: '#FF9500' }]}>
                            <Text style={styles.managePanelOwnerBadgeIconText}>🔑</Text>
                          </View>
                          <View style={styles.managePanelOwnerBadgeContent}>
                            <Text style={[styles.managePanelOwnerBadgeLabel, { color: currentTheme.colors.textSecondary }]}>
                              Kapı Şifresi
                            </Text>
                            <Text style={[styles.managePanelOwnerBadgeValue, { color: currentTheme.colors.text }]}>
                              {tempPortfolioData.doorCode || portfolio?.doorCode || 'Belirtilmemiş'}
                            </Text>
                          </View>
                          {isEditMode && (
                            <TouchableOpacity 
                              style={[styles.editFieldButton, { position: 'absolute', top: 5, right: 5, width: 24, height: 24 }]}
                              onPress={() => startEditing('doorCode')}
                            >
                              <Image source={require('../assets/images/icons/Edit_fill.png')} style={[styles.editFieldIcon, { width: 14, height: 14 }]} />
                            </TouchableOpacity>
                          )}
                        </Animated.View>
                      )}

                      {/* Anahtar Yeri Badge */}
                      {(tempPortfolioData.keyLocation || portfolio?.keyLocation || isEditMode) && (
                        <Animated.View style={[
                          styles.managePanelOwnerBadge, 
                          { backgroundColor: '#142331', borderColor: currentTheme.colors.border },
                          isEditMode && { 
                            backgroundColor: blinkAnim.interpolate({
                            inputRange: [0.3, 1],
                            outputRange: [currentTheme.colors.error + '60', currentTheme.colors.error + '15']
                          }),
                            borderColor: currentTheme.colors.error,
                          }
                        ]}>
                          <View style={[styles.managePanelOwnerBadgeIcon, { backgroundColor: '#007AFF' }]}>
                            <Text style={styles.managePanelOwnerBadgeIconText}>🗝️</Text>
                          </View>
                          <View style={styles.managePanelOwnerBadgeContent}>
                            <Text style={[styles.managePanelOwnerBadgeLabel, { color: currentTheme.colors.textSecondary }]}>
                              Anahtar Yeri
                            </Text>
                            <Text style={[styles.managePanelOwnerBadgeValue, { color: currentTheme.colors.text }]}>
                              {tempPortfolioData.keyLocation || portfolio?.keyLocation || 'Belirtilmemiş'}
                            </Text>
                          </View>
                          {isEditMode && (
                            <TouchableOpacity 
                              style={[styles.editFieldButton, { position: 'absolute', top: 5, right: 5, width: 24, height: 24 }]}
                              onPress={() => startEditing('keyLocation')}
                            >
                              <Image source={require('../assets/images/icons/Edit_fill.png')} style={[styles.editFieldIcon, { width: 14, height: 14 }]} />
                            </TouchableOpacity>
                          )}
                        </Animated.View>
                      )}

                      {/* Özel Not Badge */}
                      {(tempPortfolioData.specialNote || portfolio?.specialNote || isEditMode) && (
                        <Animated.View style={[
                          styles.managePanelOwnerBadge, 
                          { backgroundColor: '#142331', borderColor: currentTheme.colors.border },
                          isEditMode && { 
                            backgroundColor: blinkAnim.interpolate({
                            inputRange: [0.3, 1],
                            outputRange: [currentTheme.colors.error + '60', currentTheme.colors.error + '15']
                          }),
                            borderColor: currentTheme.colors.error,
                          }
                        ]}>
                          <View style={[styles.managePanelOwnerBadgeIcon, { backgroundColor: '#8E44AD' }]}>
                            <Text style={styles.managePanelOwnerBadgeIconText}>📝</Text>
                          </View>
                          <View style={styles.managePanelOwnerBadgeContent}>
                            <Text style={[styles.managePanelOwnerBadgeLabel, { color: currentTheme.colors.textSecondary }]}>
                              Özel Not
                            </Text>
                            <Text style={[styles.managePanelOwnerBadgeValue, { color: currentTheme.colors.text }]} numberOfLines={2}>
                              {tempPortfolioData.specialNote || portfolio?.specialNote || 'Belirtilmemiş'}
                            </Text>
                          </View>
                          {isEditMode && (
                            <TouchableOpacity 
                              style={[styles.editFieldButton, { position: 'absolute', top: 5, right: 5, width: 24, height: 24 }]}
                              onPress={() => startEditing('specialNote')}
                            >
                              <Image source={require('../assets/images/icons/Edit_fill.png')} style={[styles.editFieldIcon, { width: 14, height: 14 }]} />
                            </TouchableOpacity>
                          )}
                        </Animated.View>
                      )}
                    </View>
                  </View>

                  {/* Verilen İzinler Butonu */}
                  <View style={[styles.managePanelDivider, { backgroundColor: currentTheme.colors.border }]} />
                  
                  <View style={styles.managePanelPermissionsContainer}>
                    <TouchableOpacity 
                      style={[styles.managePanelPermissionsButton, { backgroundColor: '#142331', borderColor: currentTheme.colors.border }]}
                      onPress={() => {
                        if (user?.uid) {
                          loadGrantedPermissions();
                          setShowPermissionsManagementModal(true);
                          toggleManagePanel();
                        }
                      }}
                    >
                      <Text style={[styles.managePanelPermissionsIcon, { color: currentTheme.colors.primary }]}>👥</Text>
                      <View style={styles.managePanelPermissionsContent}>
                        <Text style={[styles.managePanelPermissionsTitle, { color: currentTheme.colors.text }]}>
                          Verilen İzinler
                        </Text>
                        <Text style={[styles.managePanelPermissionsSubtitle, { color: currentTheme.colors.textSecondary }]}>
                          Portföyünüzü paylaşma izni verdiğiniz kullanıcıları yönetin
                        </Text>
                      </View>
                      <Text style={[styles.managePanelArrow, { color: currentTheme.colors.textSecondary }]}>›</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                // Diğer kullanıcılar için panel - Talep Et
                <>
                  {/* Talep Butonları */}
                  <View style={styles.managePanelRequestContainer}>
                    <Text style={[styles.managePanelRequestTitle, { color: currentTheme.colors.text }]}>
                      Portföy Paylaşım Talepleri
                    </Text>
                    
                    <Text style={[styles.managePanelRequestSubtitle, { color: currentTheme.colors.textSecondary }]}>
                      Bu portföyü müşterilerinizle paylaşmak için izin talep edebilirsiniz.
                    </Text>
                    {/* Kompakt aksiyonlar */}
                    <View style={styles.requestActionsRow}>
                      {(permissionStatus === null || permissionStatus === 'rejected') && (
                        <TouchableOpacity
                          style={styles.requestButtonPrimary}
                          onPress={() => {
                            handlePermissionRequest();
                            toggleManagePanel();
                          }}
                          activeOpacity={0.9}
                        >
                          <Text style={styles.requestButtonText}>İzin İste</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        style={[
                          styles.requestButtonSecondary,
                          permissionStatus !== 'approved' && styles.requestButtonDisabled,
                        ]}
                        onPress={() => {
                          toggleManagePanel();
                          setShowShareModal(true);
                        }}
                        activeOpacity={0.9}
                        disabled={permissionStatus !== 'approved'}
                      >
                        <Text style={styles.requestButtonText}>Müşteriyle Paylaş</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Talep Durumu - Şık Bilgilendirme */}
                    <View style={[styles.managePanelStatusCard, { 
                      backgroundColor: currentTheme.colors.surface,
                      borderColor: currentTheme.colors.border
                    }]}>
                      <View style={styles.managePanelStatusHeader}>
                        <Text style={[styles.managePanelStatusTitle, { color: currentTheme.colors.text }]}>
                          Paylaşım İzni
                        </Text>
                        <View style={[styles.managePanelStatusBadge, {
                          backgroundColor: permissionStatus === 'approved' ? '#28a745' : 
                                         permissionStatus === 'pending' ? '#ffc107' : 
                                         currentTheme.colors.border
                        }]}>
                          <Text style={[styles.managePanelStatusBadgeText, {
                            color: permissionStatus === 'approved' ? '#fff' : 
                                   permissionStatus === 'pending' ? '#fff' : 
                                   currentTheme.colors.textSecondary
                          }]}>
                            {permissionStatus === 'approved' ? '✓' : 
                             permissionStatus === 'pending' ? '○' : 
                             '×'}
                          </Text>
                        </View>
                      </View>
                      <Text style={[styles.managePanelStatusDescription, { color: currentTheme.colors.textSecondary }]}>
                        {permissionStatus === 'approved' ? 'Bu portföyü kendi adınızla paylaşabilirsiniz' : 
                         permissionStatus === 'pending' ? 'İzin talebiniz portföy sahibi tarafından inceleniyor' : 
                         'Bu portföyü paylaşmak için önce izin almanız gerekiyor'}
                      </Text>
                      {/* Side badge removed: reverted to circular badge */}
                    </View>

                    {/* Eski büyük paylaşım kartı kaldırıldı; üstteki kompakt buton kullanılacak */}
                  </View>

                  {/* Bilgi Notu */}
                  <View style={[styles.managePanelRequestInfo, { backgroundColor: currentTheme.colors.surface, borderColor: currentTheme.colors.border }]}>
                    <Text style={styles.managePanelRequestInfoIcon}>ℹ️</Text>
                    <Text style={[styles.managePanelRequestInfoText, { color: currentTheme.colors.textSecondary }]}>
                      İzin alındığında, bu portföyü kendi bilgilerinizle müşterilerinize özel link ile paylaşabileceksiniz.
                    </Text>
                  </View>
                </>
              )}
            </View>
          </Animated.View>
        </View>
      )}

      {/* Matched Requests Panel - separate side panel */}
      {showMatchedPanel && (
        <View style={[styles.managePanelOverlay, { zIndex: 1001 }]}>
          <TouchableOpacity 
            style={styles.managePanelBackdrop}
            onPress={toggleMatchedPanel}
            activeOpacity={1}
          />
          <Animated.View 
            style={[
              styles.managePanel,
              { 
                transform: [{ translateX: matchedPanelAnim }],
                backgroundColor: 'transparent',
                height: screenHeight * 0.75,
                top: screenHeight * 0.125,
                width: 300,
              }
            ]}
          >
            <GlassmorphismView
              style={styles.managePanelGradient}
              blurEnabled={false}
              config={{
                overlayColor: 'transparent',
                startColor: 'rgb(17, 36, 49)',
                endColor: 'rgba(17, 36, 49, 0.75)',
                gradientAlpha: 1,
                gradientDirection: 130,
                gradientSpread: 5,
                ditherStrength: 4.0,
              }}
            />

            <View style={[styles.managePanelHeader, { borderBottomColor: currentTheme.colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={[styles.managePanelTitle, { color: currentTheme.colors.text }]}>Eşleşen Talepler</Text>
                {matchedRefreshing ? (
                  <Text style={{ marginLeft: 8, color: currentTheme.colors.textSecondary }}>Yenileniyor…</Text>
                ) : null}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TouchableOpacity 
                  style={styles.requestOverlayIconCloseButton}
                  onPress={openHiddenOverlay}
                  activeOpacity={0.9}
                >
                  <Image source={require('../assets/images/icons/View_hide2x.png')} style={[styles.requestOverlayCloseIcon, { width: 14, height: 14 }]} />
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.requestOverlayIconCloseButton}
                  onPress={toggleMatchedPanel}
                  activeOpacity={0.9}
                >
                  <Image source={require('../assets/images/icons/close.png')} style={styles.requestOverlayCloseIcon} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.managePanelContent}>
              {loadingMatched ? (
                <View style={{ padding: 16 }}>
                  <Text style={{ color: currentTheme.colors.textSecondary }}>Yükleniyor…</Text>
                </View>
              ) : matchedError ? (
                <View style={{ padding: 16 }}>
                  <Text style={{ color: currentTheme.colors.error }}>{matchedError}</Text>
                </View>
              ) : (
                <ScrollView style={{ paddingHorizontal: 12, paddingTop: 10 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1 }}>
                  {matchedRequests.filter(r => !hiddenMatchedIds.has(r.id)).length === 0 ? (
                    <View style={{ alignItems: 'center', paddingVertical: 16, marginTop: 8 }}>
                      <Image source={require('../assets/images/icons/talep.png')} style={{ width: 80, height: 80, marginBottom: 10, opacity: 0.9, tintColor: currentTheme.colors.textSecondary }} />
                      <Text style={{ color: currentTheme.colors.textSecondary, fontSize: 14, fontWeight: '800' }}>Eşleşen talep bulunamadı</Text>
                    </View>
                  ) : matchedRequests.filter(r => !hiddenMatchedIds.has(r.id)).map((req) => {
                    const district = Array.isArray(req.districts) && req.districts.length > 0 ? req.districts[0] : (req.district || '');
                    const neighborhood = Array.isArray(req.neighborhoods) && req.neighborhoods.length > 0 ? req.neighborhoods[0] : (req.neighborhood || '');
                    const locationLabel = [neighborhood || district || '', (district || req.city || '')].filter(Boolean).join(', ');
                    const formatPrice = (v) => {
                      const n = Number(v);
                      if (!Number.isFinite(n)) { return '—'; }
                      return `${new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)}₺`;
                    };
                    const avatarSrc = (req.userProfile?.profilePicture && req.userProfile.profilePicture !== 'default-logo')
                      ? { uri: req.userProfile.profilePicture }
                      : require('../assets/images/logo-krimson.png');
                    const userName = req.userProfile?.name || 'Kullanıcı';
                    const officeName = req.userProfile?.officeName || 'Ofis';
                    const rowAnim = matchedRowAnimsRef.current[req.id] || (matchedRowAnimsRef.current[req.id] = new Animated.Value(1));
                  return (
                    <Animated.View key={req.id} style={{
                      transform: [
                        { scale: rowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) },
                        { translateY: rowAnim.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) },
                      ],
                      opacity: rowAnim,
                    }}>
                      <View style={[styles.matchedCard, { borderColor: currentTheme.colors.border, backgroundColor: '#142331' }]}> 
                          {/* Header with avatar and owner info */}
                          <View style={styles.matchedCardHeader}>
                            <Image source={avatarSrc} style={styles.matchedAvatar} />
                            <View style={styles.matchedOwnerInfo}>
                              <Text style={[styles.matchedOwnerName, { color: currentTheme.colors.text }]} numberOfLines={1}>{userName}</Text>
                              <Text style={[styles.matchedOwnerOffice, { color: currentTheme.colors.textSecondary }]} numberOfLines={1}>{officeName}</Text>
                            </View>
                          </View>

                          {/* Body */}
                          <View style={styles.matchedBody}>
                            <Text style={[styles.matchedTitle, { color: currentTheme.colors.text }]} numberOfLines={2}>{req.title || 'Emlak Talebi'}</Text>

                            <View style={styles.matchedInfoGrid}>
                              <View style={styles.matchedInfoRow}>
                                <Text style={[styles.matchedLabel, { color: currentTheme.colors.textSecondary }]}>Konum</Text>
                                <Text style={[styles.matchedValue, { color: currentTheme.colors.text }]} numberOfLines={1}>{locationLabel || 'Belirtilmemiş'}</Text>
                              </View>
                              <View style={styles.matchedInfoRow}>
                                <Text style={[styles.matchedLabel, { color: currentTheme.colors.textSecondary }]}>Oda</Text>
                                <Text style={[styles.matchedValue, { color: currentTheme.colors.text }]} numberOfLines={1}>{req.roomCount || 'Belirtilmemiş'}</Text>
                              </View>
                              <View style={styles.matchedInfoRow}>
                                <Text style={[styles.matchedLabel, { color: currentTheme.colors.textSecondary }]}>Bütçe</Text>
                                <Text style={[styles.matchedValue, { color: currentTheme.colors.text }]} numberOfLines={1}>{formatPrice(req.minPrice)} - {formatPrice(req.maxPrice)}</Text>
                              </View>
                              <View style={styles.matchedInfoRow}>
                                <Text style={[styles.matchedLabel, { color: currentTheme.colors.textSecondary }]}>m²</Text>
                                <Text style={[styles.matchedValue, { color: currentTheme.colors.text }]} numberOfLines={1}>{(req.minSquareMeters || '—')} - {(req.maxSquareMeters || '—')} m²</Text>
                              </View>
                            <View style={[styles.matchedInfoRow, { marginTop: 8 }]}>
                              <Text style={[styles.matchedLabel, { color: currentTheme.colors.textSecondary }]}>Tarih</Text>
                              <Text style={[styles.matchedValue, { color: currentTheme.colors.text }]} numberOfLines={1}>{formatRequestCreatedAt(req.createdAt)}</Text>
                            </View>
                            </View>
                            {/* Footer actions */}
                            <View style={styles.matchedActionsRow}>
                              <TouchableOpacity
                                style={[styles.matchedPrimaryButton, { backgroundColor: currentTheme.colors.primary }]}
                                onPress={() => openRequestOverlay(req)}
                                activeOpacity={0.9}
                              >
                                <Text style={styles.matchedPrimaryButtonText}>Talebe Git</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={[styles.matchedSecondaryButton, { backgroundColor: '#9AA0A6', borderColor: 'transparent' }]}
                                onPress={() => {
                                  try {
                                    Animated.timing(rowAnim, {
                                      toValue: 0,
                                      duration: 280,
                                      easing: Easing.bezier(0.2, 0.8, 0.2, 1),
                                      useNativeDriver: true,
                                    }).start(() => {
                                      try { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); } catch {}
                                      setHiddenMatchedIds(prev => {
                                        const next = new Set(Array.from(prev));
                                        next.add(req.id);
                                        return next;
                                      });
                                    });
                                  } catch {}
                                }}
                                activeOpacity={0.9}
                              >
                                <Text style={[styles.matchedSecondaryButtonText, { color: '#ffffff' }]}>Gizle</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        </View>
                    </Animated.View>
                    );
                  })}
                </ScrollView>
              )}
            </View>
          </Animated.View>
        </View>
      )}

      {/* Full Screen Image Modal */}
      <Modal
        visible={showImageModal}
        transparent={true}
        animationType="none"
        onRequestClose={closeImageModal}
      >
        <GestureHandlerRootView style={{ flex: 1 }}>
          <Animated.View 
            style={[
              styles.modalContainer,
              {
                opacity: modalAnim,
                transform: [
                  {
                    scale: modalAnim.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }),
                  },
                  {
                    translateY: modalAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }),
                  },
                ],
              },
            ]}
          >
          <TouchableOpacity
            style={styles.modalCloseButton}
            onPress={closeImageModal}
          >
            <Text style={styles.modalCloseText}>✕</Text>
          </TouchableOpacity>
          <FlatList
            ref={(ref) => {
              modalFlatListRef.current = ref;
              flatListRef.current = ref;
            }}
            data={images}
            keyExtractor={(_, idx) => String(idx)}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
            decelerationRate="fast"
            initialNumToRender={1}
            maxToRenderPerBatch={2}
            windowSize={5}
            removeClippedSubviews
            getItemLayout={(_, index) => ({ 
              length: screenWidth, 
              offset: screenWidth * index, 
              index 
            })}
            onScroll={(event) => {
              const index = Math.round(event.nativeEvent.contentOffset.x / screenWidth);
              if (index >= 0 && index < images.length && index !== activeImageIndex) {
                setActiveImageIndex(index);
              }
            }}
            onMomentumScrollEnd={(event) => {
              const index = Math.round(event.nativeEvent.contentOffset.x / screenWidth);
              if (index >= 0 && index < images.length) {
                setActiveImageIndex(index);
              }
            }}
            renderItem={({ item }) => (
              <View style={styles.modalImageWrapper}>
                <PinchGestureHandler
                  onGestureEvent={onPinchGestureEvent}
                  onHandlerStateChange={onPinchHandlerStateChange}
                >
                  <Animated.View style={styles.modalImageContainer}>
                    <TouchableOpacity
                      onPress={handleDoubleTap}
                      activeOpacity={1}
                      style={styles.modalImageTouchable}
                    >
                      <Animated.View
                        style={[
                          styles.modalImageTransform,
                          {
                            transform: [
                              { scale: animatedScale },
                              { translateX: translateX },
                              { translateY: translateY },
                            ],
                          },
                        ]}
                      >
                        <Image
                          source={{ uri: cdnImg(item, { w: Math.min(Math.round(screenWidth), 800), q: 75, autoOptimize: 'high' }) }}
                          style={styles.modalImage}
                          resizeMode="contain"
                        />
                      </Animated.View>
                    </TouchableOpacity>
                  </Animated.View>
                </PinchGestureHandler>
              </View>
            )}
          />
          
          {/* Modal Gallery */}
          {imagesReady && images.length > 1 && (
            <View style={styles.modalGallery}>
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                scrollEventThrottle={16}
                decelerationRate="fast"
                bounces={false}
                style={styles.modalGalleryScroll}
                contentContainerStyle={styles.modalGalleryContent}
                ref={thumbnailsScrollRef}
              >
                {images.map((image, index) => (
                  <TouchableOpacity
                    key={index}
                      style={[
                        styles.modalGalleryItem,
                        activeImageIndex === index && styles.modalGalleryItemActive,
                        activeImageIndex === index && { borderColor: '#DC143C', borderWidth: 3 }
                      ]}
                    onPress={() => {
                      if (index !== activeImageIndex) {
                        setActiveImageIndex(index);
                        modalFlatListRef.current?.scrollToIndex({ index, animated: true });
                      }
                    }}
                  >
                    <Image
                      source={{ uri: cdnImg(image, { w: 120, q: 75, autoOptimize: 'high' }) }}
                      style={styles.modalGalleryImage}
                      resizeMode="cover"
                    />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
          </Animated.View>
        </GestureHandlerRootView>
      </Modal>

      {/* Copy Success Modal (animated) */}
      <Modal
        visible={showCopySuccessModal}
        transparent
        animationType="none"
        onRequestClose={() => {
          if (copySuccessTimerRef.current) {
            clearTimeout(copySuccessTimerRef.current);
          }
          setShowCopySuccessModal(false);
        }}
      >
        <View style={styles.shareLinkModalContainer}>
          <View style={styles.shareLinkModalBackdrop}>
            <Animated.View
              style={{
                width: '100%',
                alignItems: 'center',
                justifyContent: 'center',
                transform: [{ scale: copySuccessScaleAnim }],
                opacity: copySuccessScaleAnim,
              }}
            >
              <GlassmorphismView
                style={styles.successModalContainer}
                borderRadius={16}
                blurEnabled={false}
                config={shareModalGlassConfig}
              >
                <View style={styles.successIconContainer}>
                  <Image
                    source={require('../assets/images/icons/tasks.png')}
                    style={styles.successIconImage}
                  />
                </View>
                <Text style={styles.successTitle}>Başarılı!</Text>
                <Text style={styles.successMessage}>{copySuccessMessage}</Text>
              </GlassmorphismView>
            </Animated.View>
          </View>
        </View>
      </Modal>

      {/* Social Share Template Modal */}
      <SocialShareTemplate
        portfolio={portfolio}
        visible={showSocialShareTemplate}
        onClose={() => setShowSocialShareTemplate(false)}
      />

      {/* Share Options Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={showShareModal}
        onRequestClose={() => setShowShareModal(false)}
      >
        <View style={styles.shareModal}>
          <GlassmorphismView
            style={styles.shareModalContent}
            borderRadius={24}
            blurEnabled={false}
            config={shareModalGlassConfig}
          >
            <Text style={styles.shareModalTitle}>
              Paylaşım Seçeneği
            </Text>
            <Text style={styles.shareModalSubtitle}>
              Bu portföyü nasıl paylaşmak istiyorsunuz?
            </Text>
            
            {!isOwner && (
              <TouchableOpacity
                style={styles.shareModalButton}
                onPress={handleCustomShare}
                disabled={shareLoading}
              >
                <Text style={styles.shareModalButtonText}>
                  {shareLoading ? '🔗 Link Oluşturuluyor...' : '🔗 Kendi Adımla Paylaş'}
                </Text>
              </TouchableOpacity>
            )}
            
            <TouchableOpacity
              style={styles.shareModalSecondaryButton}
              onPress={handleNormalShare}
            >
              <Text style={styles.shareModalSecondaryButtonText}>
                📤 Portföy Sahibi Adıyla Paylaş
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.shareModalCancelButton}
              onPress={() => setShowShareModal(false)}
            >
              <Text style={styles.shareModalCancelText}>
                İptal
              </Text>
            </TouchableOpacity>
          </GlassmorphismView>
        </View>
      </Modal>

      {/* Permission Request Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={showPermissionRequestModal}
        onRequestClose={() => setShowPermissionRequestModal(false)}
      >
        <View style={styles.shareModal}>
          <GlassmorphismView
            style={styles.shareModalContent}
            borderRadius={24}
            blurEnabled={false}
            config={shareModalGlassConfig}
          >
            <Text style={styles.shareModalTitle}>
              🔐 İzin Gerekli
            </Text>
            <Text style={styles.shareModalSubtitle}>
              Bu portföyü kendi adınızla paylaşabilmek için önce portföy sahibinden izin almanız gerekmektedir.
            </Text>
            
            <TouchableOpacity
              style={styles.shareModalButton}
              onPress={() => {
                setShowPermissionRequestModal(false);
                handlePermissionRequest();
              }}
            >
              <Text style={styles.shareModalButtonText}>
                🙏 İzin İste
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.shareModalSecondaryButton}
              onPress={() => {
                setShowPermissionRequestModal(false);
                handleNormalShare();
              }}
            >
              <Text style={styles.shareModalSecondaryButtonText}>
                📤 Normal Paylaş (Portföy Sahibi Adıyla)
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.shareModalCancelButton}
              onPress={() => setShowPermissionRequestModal(false)}
            >
              <Text style={styles.shareModalCancelText}>
                İptal
              </Text>
            </TouchableOpacity>
          </GlassmorphismView>
        </View>
      </Modal>

      {/* Request Feedback Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={showRequestFeedbackModal}
        onRequestClose={() => setShowRequestFeedbackModal(false)}
      >
        <View style={styles.requestFeedbackModalContainer}>
          <View style={styles.requestFeedbackModalBackdrop}>
            <View style={[styles.requestFeedbackModalContent, { backgroundColor: currentTheme.colors.surface }]}>
              <Text style={[styles.requestFeedbackModalTitle, { color: currentTheme.colors.text }]}>
                Bilgilendirme
              </Text>
              <Text style={[styles.requestFeedbackModalMessage, { color: currentTheme.colors.textSecondary }]}>
                {requestFeedbackMessage}
              </Text>
              <TouchableOpacity
                style={[styles.requestFeedbackModalButton, { backgroundColor: currentTheme.colors.primary }]}
                onPress={() => setShowRequestFeedbackModal(false)}
              >
                <Text style={[styles.requestFeedbackModalButtonText, { color: currentTheme.colors.white }]}>
                  Tamam
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <PermissionManagementModal
        visible={showPermissionModal}
        onClose={() => setShowPermissionModal(false)}
        portfolioId={portfolio?.id}
        portfolioTitle={portfolio?.title}
        ownerId={user?.uid}
      />

      {/* Title Edit Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={showTitleModal}
        onRequestClose={() => setShowTitleModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: currentTheme.colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: currentTheme.colors.text }]}>
                Başlığı Düzenle
              </Text>
              <TouchableOpacity 
                style={styles.modalCloseButton}
                onPress={() => setShowTitleModal(false)}
              >
                <Text style={[styles.modalCloseText, { color: currentTheme.colors.textSecondary }]}>✕</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={[styles.modalInput, { 
                borderColor: currentTheme.colors.border,
                backgroundColor: currentTheme.colors.background,
                color: currentTheme.colors.text
              }]}
              value={(tempPortfolioData.title || portfolio?.title || '').toString()}
              onChangeText={(text) => setTempPortfolioData(prev => ({ ...prev, title: text }))}
              placeholder="Portfolio başlığını girin"
              placeholderTextColor={currentTheme.colors.textSecondary}
              multiline={true}
              numberOfLines={2}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancelButton, { backgroundColor: currentTheme.colors.textSecondary }]}
                onPress={() => setShowTitleModal(false)}
              >
                <Text style={[styles.modalButtonText, { color: currentTheme.colors.white }]}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalSaveButton, { backgroundColor: currentTheme.colors.primary }]}
                onPress={() => {
                  setShowTitleModal(false);
                }}
              >
                <Text style={[styles.modalButtonText, { color: currentTheme.colors.white }]}>Kaydet</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Price Edit Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={showPriceModal}
        onRequestClose={() => setShowPriceModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: currentTheme.colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: currentTheme.colors.text }]}>
                Fiyatı Düzenle
              </Text>
              <TouchableOpacity 
                style={styles.modalCloseButton}
                onPress={() => setShowPriceModal(false)}
              >
                <Text style={[styles.modalCloseText, { color: currentTheme.colors.textSecondary }]}>✕</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={[styles.modalInput, { 
                borderColor: currentTheme.colors.border,
                backgroundColor: currentTheme.colors.background,
                color: currentTheme.colors.text
              }]}
              value={(() => {
                if (tempPortfolioData.price !== undefined) {
                  return tempPortfolioData.price === null || tempPortfolioData.price === 0 ? '' : new Intl.NumberFormat('tr-TR').format(tempPortfolioData.price);
                }
                const portfolioPrice = portfolio?.price || 0;
                return portfolioPrice ? new Intl.NumberFormat('tr-TR').format(portfolioPrice) : '';
              })()}
              onChangeText={(text) => {
                // Sadece sayıları al
                const numericValue = text.replace(/[^0-9]/g, '');
                if (numericValue === '') {
                  // Boş string ise null olarak ayarla
                  setTempPortfolioData(prev => ({ ...prev, price: null }));
                } else {
                  const numberValue = parseInt(numericValue);
                setTempPortfolioData(prev => ({ ...prev, price: numberValue }));
                }
              }}
              placeholder="Fiyat girin (₺)"
              placeholderTextColor={currentTheme.colors.textSecondary}
              keyboardType="numeric"
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancelButton, { backgroundColor: currentTheme.colors.textSecondary }]}
                onPress={() => setShowPriceModal(false)}
              >
                <Text style={[styles.modalButtonText, { color: currentTheme.colors.white }]}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalSaveButton, { backgroundColor: currentTheme.colors.primary }]}
                onPress={() => {
                  setShowPriceModal(false);
                }}
              >
                <Text style={[styles.modalButtonText, { color: currentTheme.colors.white }]}>Kaydet</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Type Edit Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={showTypeModal}
        onRequestClose={() => setShowTypeModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: currentTheme.colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: currentTheme.colors.text }]}>
                İlan Tipi
              </Text>
              <TouchableOpacity 
                style={styles.modalCloseButton}
                onPress={() => setShowTypeModal(false)}
              >
                <Text style={[styles.modalCloseText, { color: currentTheme.colors.textSecondary }]}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.modalOptions}>
              <TouchableOpacity
                style={[styles.modalOption, { 
                  backgroundColor: (tempPortfolioData.listingStatus || portfolio?.listingStatus || 'Satılık') === 'Satılık' ? currentTheme.colors.primary : currentTheme.colors.background,
                  borderColor: currentTheme.colors.border
                }]}
                onPress={() => {
                  setTempPortfolioData(prev => ({ ...prev, listingStatus: 'Satılık' }));
                  setShowTypeModal(false);
                }}
              >
                <Text style={[styles.modalOptionText, { 
                  color: (tempPortfolioData.listingStatus || portfolio?.listingStatus || 'Satılık') === 'Satılık' ? currentTheme.colors.white : currentTheme.colors.text 
                }]}>
                  Satılık
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalOption, { 
                  backgroundColor: (tempPortfolioData.listingStatus || portfolio?.listingStatus || 'Satılık') === 'Kiralık' ? currentTheme.colors.primary : currentTheme.colors.background,
                  borderColor: currentTheme.colors.border
                }]}
                onPress={() => {
                  setTempPortfolioData(prev => ({ ...prev, listingStatus: 'Kiralık' }));
                  setShowTypeModal(false);
                }}
              >
                <Text style={[styles.modalOptionText, { 
                  color: (tempPortfolioData.listingStatus || portfolio?.listingStatus || 'Satılık') === 'Kiralık' ? currentTheme.colors.white : currentTheme.colors.text 
                }]}>
                  Kiralık
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Description Edit Modal removed */}

      {/* Bina Yaşı Edit Modal - AddPortfolio.js'den kopyalandı */}
      <Modal
        visible={showBuildingAgeModal}
        animationType="none"
        transparent={true}
        hardwareAccelerated={true}
        presentationStyle="overFullScreen"
        statusBarTranslucent={true}
        onRequestClose={() => setShowBuildingAgeModal(false)}
      >
        <Animated.View style={[stylesFactory(currentTheme, isDark).modalOverlayPicker, { opacity: pickerFadeAnim }]} renderToHardwareTextureAndroid shouldRasterizeIOS>
          <Animated.View style={[stylesFactory(currentTheme, isDark).modalContainerPicker, { transform: [{ translateY: pickerTranslateY }, { scale: pickerScale }] }]} renderToHardwareTextureAndroid shouldRasterizeIOS>
            <View style={stylesFactory(currentTheme, isDark).modalHeaderPicker}>
              <Text style={stylesFactory(currentTheme, isDark).modalTitlePicker}>Bina Yaşı Seçin</Text>
              <TouchableOpacity onPress={() => setShowBuildingAgeModal(false)}>
                <Text style={stylesFactory(currentTheme, isDark).modalCloseTextPicker}>Kapat</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={ageOptions}
              keyExtractor={(item) => item.value}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={stylesFactory(currentTheme, isDark).neighborhoodItemPicker}
                  onPress={() => {
                    setTempPortfolioData(prev => ({ ...prev, buildingAge: item.value }));
                    setShowBuildingAgeModal(false);
                  }}
                >
                  <Text style={stylesFactory(currentTheme, isDark).neighborhoodTextPicker}>{item.label}</Text>
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

      {/* Aidat Edit Modal - AddPortfolio.js'den kopyalandı */}
      <Modal
        visible={showDuesModal}
        animationType="none"
        transparent={true}
        hardwareAccelerated={true}
        presentationStyle="overFullScreen"
        statusBarTranslucent={true}
        onRequestClose={() => setShowDuesModal(false)}
      >
        <Animated.View style={[stylesFactory(currentTheme, isDark).modalOverlayPicker, { opacity: pickerFadeAnim }]} renderToHardwareTextureAndroid shouldRasterizeIOS>
          <Animated.View style={[stylesFactory(currentTheme, isDark).modalContainerPicker, { transform: [{ translateY: pickerTranslateY }, { scale: pickerScale }] }]} renderToHardwareTextureAndroid shouldRasterizeIOS>
            <View style={stylesFactory(currentTheme, isDark).modalHeaderPicker}>
              <Text style={stylesFactory(currentTheme, isDark).modalTitlePicker}>Aidat Seçin</Text>
              <TouchableOpacity onPress={() => setShowDuesModal(false)}>
                <Text style={stylesFactory(currentTheme, isDark).modalCloseTextPicker}>Kapat</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={duesOptions}
              keyExtractor={(item) => item.value}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={stylesFactory(currentTheme, isDark).neighborhoodItemPicker}
                  onPress={() => {
                    setTempPortfolioData(prev => ({ ...prev, dues: item.value }));
                    setShowDuesModal(false);
                  }}
                >
                  <Text style={stylesFactory(currentTheme, isDark).neighborhoodTextPicker}>{item.label}</Text>
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

      {/* Balkon Sayısı Edit Modal - AddPortfolio.js'den kopyalandı */}
      <Modal
        visible={showBalconyCountModal}
        animationType="none"
        transparent={true}
        hardwareAccelerated={true}
        presentationStyle="overFullScreen"
        statusBarTranslucent={true}
        onRequestClose={() => setShowBalconyCountModal(false)}
      >
        <Animated.View style={[stylesFactory(currentTheme, isDark).modalOverlayPicker, { opacity: pickerFadeAnim }]} renderToHardwareTextureAndroid shouldRasterizeIOS>
          <Animated.View style={[stylesFactory(currentTheme, isDark).modalContainerPicker, { transform: [{ translateY: pickerTranslateY }, { scale: pickerScale }] }]} renderToHardwareTextureAndroid shouldRasterizeIOS>
            <View style={stylesFactory(currentTheme, isDark).modalHeaderPicker}>
              <Text style={stylesFactory(currentTheme, isDark).modalTitlePicker}>Balkon Sayısı Seçin</Text>
              <TouchableOpacity onPress={() => setShowBalconyCountModal(false)}>
                <Text style={stylesFactory(currentTheme, isDark).modalCloseTextPicker}>Kapat</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={balconyOptions}
              keyExtractor={(item) => item.value}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={stylesFactory(currentTheme, isDark).neighborhoodItemPicker}
                  onPress={() => {
                    setTempPortfolioData(prev => ({ ...prev, balconyCount: item.value }));
                    setShowBalconyCountModal(false);
                  }}
                >
                  <Text style={stylesFactory(currentTheme, isDark).neighborhoodTextPicker}>{item.label}</Text>
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

      {/* Banyo Sayısı Edit Modal - AddPortfolio.js'den kopyalandı */}
      <Modal
        visible={showBathroomCountModal}
        animationType="none"
        transparent={true}
        hardwareAccelerated={true}
        presentationStyle="overFullScreen"
        statusBarTranslucent={true}
        onRequestClose={() => setShowBathroomCountModal(false)}
      >
        <Animated.View style={[stylesFactory(currentTheme, isDark).modalOverlayPicker, { opacity: pickerFadeAnim }]} renderToHardwareTextureAndroid shouldRasterizeIOS>
          <Animated.View style={[stylesFactory(currentTheme, isDark).modalContainerPicker, { transform: [{ translateY: pickerTranslateY }, { scale: pickerScale }] }]} renderToHardwareTextureAndroid shouldRasterizeIOS>
            <View style={stylesFactory(currentTheme, isDark).modalHeaderPicker}>
              <Text style={stylesFactory(currentTheme, isDark).modalTitlePicker}>Banyo Sayısı Seçin</Text>
              <TouchableOpacity onPress={() => setShowBathroomCountModal(false)}>
                <Text style={stylesFactory(currentTheme, isDark).modalCloseTextPicker}>Kapat</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={bathroomOptions}
              keyExtractor={(item) => item.value}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={stylesFactory(currentTheme, isDark).neighborhoodItemPicker}
                  onPress={() => {
                    setTempPortfolioData(prev => ({ ...prev, bathroomCount: item.value }));
                    setShowBathroomCountModal(false);
                  }}
                >
                  <Text style={stylesFactory(currentTheme, isDark).neighborhoodTextPicker}>{item.label}</Text>
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

      {/* Vestiyer Edit Modal - küçük modal */}
      <Modal
        visible={showWardrobeModal}
        animationType="none"
        transparent={true}
        hardwareAccelerated={true}
        presentationStyle="overFullScreen"
        statusBarTranslucent={true}
        onRequestClose={() => setShowWardrobeModal(false)}
      >
        <Animated.View style={[stylesFactory(currentTheme, isDark).modalOverlayPicker, { opacity: pickerFadeAnim }]} renderToHardwareTextureAndroid shouldRasterizeIOS>
          <Animated.View style={[stylesFactory(currentTheme, isDark).modalContainerSmall, { transform: [{ translateY: pickerTranslateY }, { scale: pickerScale }] }]} renderToHardwareTextureAndroid shouldRasterizeIOS>
            <View style={stylesFactory(currentTheme, isDark).modalHeaderPicker}>
              <Text style={stylesFactory(currentTheme, isDark).modalTitlePicker}>Vestiyer Durumu</Text>
              <TouchableOpacity onPress={() => setShowWardrobeModal(false)}>
                <Text style={stylesFactory(currentTheme, isDark).modalCloseTextPicker}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={stylesFactory(currentTheme, isDark).fullWidthPickerContainer}>
              <TouchableOpacity
                style={[
                  stylesFactory(currentTheme, isDark).fullWidthPickerOption,
                  (tempPortfolioData.wardrobe === true) && stylesFactory(currentTheme, isDark).fullWidthPickerOptionActive,
                ]}
                onPress={() => {
                  setTempPortfolioData(prev => ({ ...prev, wardrobe: true }));
                  setShowWardrobeModal(false);
                }}
              >
                <Text style={[
                  stylesFactory(currentTheme, isDark).fullWidthPickerOptionText,
                  (tempPortfolioData.wardrobe === true) && stylesFactory(currentTheme, isDark).fullWidthPickerOptionTextActive,
                ]}>
                  Var
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[
                  stylesFactory(currentTheme, isDark).fullWidthPickerOption,
                  (tempPortfolioData.wardrobe === false) && stylesFactory(currentTheme, isDark).fullWidthPickerOptionActive,
                ]}
                onPress={() => {
                  setTempPortfolioData(prev => ({ ...prev, wardrobe: false }));
                  setShowWardrobeModal(false);
                }}
              >
                <Text style={[
                  stylesFactory(currentTheme, isDark).fullWidthPickerOptionText,
                  (tempPortfolioData.wardrobe === false) && stylesFactory(currentTheme, isDark).fullWidthPickerOptionTextActive,
                ]}>
                  Yok
                </Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </Animated.View>
      </Modal>

      {/* Takas Edit Modal - küçük modal */}
      <Modal
        visible={showExchangeModal}
        animationType="none"
        transparent={true}
        hardwareAccelerated={true}
        presentationStyle="overFullScreen"
        statusBarTranslucent={true}
        onRequestClose={() => setShowExchangeModal(false)}
      >
        <Animated.View style={[stylesFactory(currentTheme, isDark).modalOverlayPicker, { opacity: pickerFadeAnim }]} renderToHardwareTextureAndroid shouldRasterizeIOS>
          <Animated.View style={[stylesFactory(currentTheme, isDark).modalContainerSmall, { transform: [{ translateY: pickerTranslateY }, { scale: pickerScale }] }]} renderToHardwareTextureAndroid shouldRasterizeIOS>
            <View style={stylesFactory(currentTheme, isDark).modalHeaderPicker}>
              <Text style={stylesFactory(currentTheme, isDark).modalTitlePicker}>Takas Durumu</Text>
              <TouchableOpacity onPress={() => setShowExchangeModal(false)}>
                <Text style={stylesFactory(currentTheme, isDark).modalCloseTextPicker}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={stylesFactory(currentTheme, isDark).fullWidthPickerContainer}>
              <TouchableOpacity
                style={[
                  stylesFactory(currentTheme, isDark).fullWidthPickerOption,
                  (tempPortfolioData.exchange === true) && stylesFactory(currentTheme, isDark).fullWidthPickerOptionActive,
                ]}
                onPress={() => {
                  setTempPortfolioData(prev => ({ ...prev, exchange: true }));
                  setShowExchangeModal(false);
                }}
              >
                <Text style={[
                  stylesFactory(currentTheme, isDark).fullWidthPickerOptionText,
                  (tempPortfolioData.exchange === true) && stylesFactory(currentTheme, isDark).fullWidthPickerOptionTextActive,
                ]}>
                  Kabul Ediyor
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[
                  stylesFactory(currentTheme, isDark).fullWidthPickerOption,
                  (tempPortfolioData.exchange === false) && stylesFactory(currentTheme, isDark).fullWidthPickerOptionActive,
                ]}
                onPress={() => {
                  setTempPortfolioData(prev => ({ ...prev, exchange: false }));
                  setShowExchangeModal(false);
                }}
              >
                <Text style={[
                  stylesFactory(currentTheme, isDark).fullWidthPickerOptionText,
                  (tempPortfolioData.exchange === false) && stylesFactory(currentTheme, isDark).fullWidthPickerOptionTextActive,
                ]}>
                  Kabul Etmiyor
                </Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </Animated.View>
      </Modal>

      {/* Net M² Edit Modal - AddPortfolio.js'den kopyalandı */}
      <Modal
        visible={showNetSquareMetersModal}
        animationType="none"
        transparent={true}
        hardwareAccelerated={true}
        presentationStyle="overFullScreen"
        statusBarTranslucent={true}
        onRequestClose={() => setShowNetSquareMetersModal(false)}
      >
        <Animated.View style={[stylesFactory(currentTheme, isDark).modalOverlayPicker, { opacity: pickerFadeAnim }]} renderToHardwareTextureAndroid shouldRasterizeIOS>
          <Animated.View style={[stylesFactory(currentTheme, isDark).modalContainerPicker, { transform: [{ translateY: pickerTranslateY }, { scale: pickerScale }] }]} renderToHardwareTextureAndroid shouldRasterizeIOS>
            <View style={stylesFactory(currentTheme, isDark).modalHeaderPicker}>
              <Text style={stylesFactory(currentTheme, isDark).modalTitlePicker}>Net M² Seçin</Text>
              <TouchableOpacity onPress={() => setShowNetSquareMetersModal(false)}>
                <Text style={stylesFactory(currentTheme, isDark).modalCloseTextPicker}>Kapat</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={netSquareMetersOptions}
              keyExtractor={(item) => item.value}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={stylesFactory(currentTheme, isDark).neighborhoodItemPicker}
                  onPress={() => {
                    setTempPortfolioData(prev => ({ ...prev, netSquareMeters: item.value }));
                    setShowNetSquareMetersModal(false);
                  }}
                >
                  <Text style={stylesFactory(currentTheme, isDark).neighborhoodTextPicker}>{item.label}</Text>
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

      {/* Brüt M² Edit Modal - AddPortfolio.js'den kopyalandı */}
      <Modal
        visible={showGrossSquareMetersModal}
        animationType="none"
        transparent={true}
        hardwareAccelerated={true}
        presentationStyle="overFullScreen"
        statusBarTranslucent={true}
        onRequestClose={() => setShowGrossSquareMetersModal(false)}
      >
        <Animated.View style={[stylesFactory(currentTheme, isDark).modalOverlayPicker, { opacity: pickerFadeAnim }]} renderToHardwareTextureAndroid shouldRasterizeIOS>
          <Animated.View style={[stylesFactory(currentTheme, isDark).modalContainerPicker, { transform: [{ translateY: pickerTranslateY }, { scale: pickerScale }] }]} renderToHardwareTextureAndroid shouldRasterizeIOS>
            <View style={stylesFactory(currentTheme, isDark).modalHeaderPicker}>
              <Text style={stylesFactory(currentTheme, isDark).modalTitlePicker}>Brüt M² Seçin</Text>
              <TouchableOpacity onPress={() => setShowGrossSquareMetersModal(false)}>
                <Text style={stylesFactory(currentTheme, isDark).modalCloseTextPicker}>Kapat</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={grossSquareMetersOptions}
              keyExtractor={(item) => item.value}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={stylesFactory(currentTheme, isDark).neighborhoodItemPicker}
                  onPress={() => {
                    setTempPortfolioData(prev => ({ ...prev, grossSquareMeters: item.value }));
                    setShowGrossSquareMetersModal(false);
                  }}
                >
                  <Text style={stylesFactory(currentTheme, isDark).neighborhoodTextPicker}>{item.label}</Text>
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

      {/* Toplam Kat Edit Modal - AddPortfolio.js'den kopyalandı */}
      <Modal
        visible={showTotalFloorsModal}
        animationType="none"
        transparent={true}
        hardwareAccelerated={true}
        presentationStyle="overFullScreen"
        statusBarTranslucent={true}
        onRequestClose={() => setShowTotalFloorsModal(false)}
      >
        <Animated.View style={[stylesFactory(currentTheme, isDark).modalOverlayPicker, { opacity: pickerFadeAnim }]} renderToHardwareTextureAndroid shouldRasterizeIOS>
          <Animated.View style={[stylesFactory(currentTheme, isDark).modalContainerPicker, { transform: [{ translateY: pickerTranslateY }, { scale: pickerScale }] }]} renderToHardwareTextureAndroid shouldRasterizeIOS>
            <View style={stylesFactory(currentTheme, isDark).modalHeaderPicker}>
              <Text style={stylesFactory(currentTheme, isDark).modalTitlePicker}>Toplam Kat Sayısı Seçin</Text>
              <TouchableOpacity onPress={() => setShowTotalFloorsModal(false)}>
                <Text style={stylesFactory(currentTheme, isDark).modalCloseTextPicker}>Kapat</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={totalFloorOptions}
              keyExtractor={(item) => item.value}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={stylesFactory(currentTheme, isDark).neighborhoodItemPicker}
                  onPress={() => {
                    setTempPortfolioData(prev => ({ ...prev, totalFloors: item.value }));
                    setShowTotalFloorsModal(false);
                  }}
                >
                  <Text style={stylesFactory(currentTheme, isDark).neighborhoodTextPicker}>{item.label}</Text>
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

      {/* Bulunduğu Kat Edit Modal - AddPortfolio.js'den kopyalandı */}
      <Modal
        visible={showCurrentFloorModal}
        animationType="none"
        transparent={true}
        hardwareAccelerated={true}
        presentationStyle="overFullScreen"
        statusBarTranslucent={true}
        onRequestClose={() => setShowCurrentFloorModal(false)}
      >
        <Animated.View style={[stylesFactory(currentTheme, isDark).modalOverlayPicker, { opacity: pickerFadeAnim }]} renderToHardwareTextureAndroid shouldRasterizeIOS>
          <Animated.View style={[stylesFactory(currentTheme, isDark).modalContainerPicker, { transform: [{ translateY: pickerTranslateY }, { scale: pickerScale }] }]} renderToHardwareTextureAndroid shouldRasterizeIOS>
            <View style={stylesFactory(currentTheme, isDark).modalHeaderPicker}>
              <Text style={stylesFactory(currentTheme, isDark).modalTitlePicker}>Bulunduğu Kat Seçin</Text>
              <TouchableOpacity onPress={() => setShowCurrentFloorModal(false)}>
                <Text style={stylesFactory(currentTheme, isDark).modalCloseTextPicker}>Kapat</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={currentFloorOptions}
              keyExtractor={(item) => item.value}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={stylesFactory(currentTheme, isDark).neighborhoodItemPicker}
                  onPress={() => {
                    setTempPortfolioData(prev => ({ ...prev, floor: item.value }));
                    setShowCurrentFloorModal(false);
                  }}
                >
                  <Text style={stylesFactory(currentTheme, isDark).neighborhoodTextPicker}>{item.label}</Text>
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

      {/* Otopark Edit Modal - küçük modal */}
      <Modal
        visible={showParkingModal}
        animationType="none"
        transparent={true}
        hardwareAccelerated={true}
        presentationStyle="overFullScreen"
        statusBarTranslucent={true}
        onRequestClose={() => setShowParkingModal(false)}
      >
        <Animated.View style={[stylesFactory(currentTheme, isDark).modalOverlayPicker, { opacity: pickerFadeAnim }]} renderToHardwareTextureAndroid shouldRasterizeIOS>
          <Animated.View style={[stylesFactory(currentTheme, isDark).modalContainerSmall, { transform: [{ translateY: pickerTranslateY }, { scale: pickerScale }] }]} renderToHardwareTextureAndroid shouldRasterizeIOS>
            <View style={stylesFactory(currentTheme, isDark).modalHeaderPicker}>
              <Text style={stylesFactory(currentTheme, isDark).modalTitlePicker}>Otopark Durumu</Text>
              <TouchableOpacity onPress={() => setShowParkingModal(false)}>
                <Text style={stylesFactory(currentTheme, isDark).modalCloseTextPicker}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={stylesFactory(currentTheme, isDark).fullWidthPickerContainer}>
              {parkingOptions.map((option) => (
                <TouchableOpacity
                  key={option.value.toString()}
                  style={[
                    stylesFactory(currentTheme, isDark).fullWidthPickerOption,
                    (tempPortfolioData.parking !== undefined ? tempPortfolioData.parking : portfolio.parking) === option.value && stylesFactory(currentTheme, isDark).fullWidthPickerOptionActive,
                  ]}
                  onPress={() => {
                    setTempPortfolioData(prev => ({ ...prev, parking: option.value }));
                    setShowParkingModal(false);
                  }}
                >
                  <Text style={[
                    stylesFactory(currentTheme, isDark).fullWidthPickerOptionText,
                    (tempPortfolioData.parking !== undefined ? tempPortfolioData.parking : portfolio.parking) === option.value && stylesFactory(currentTheme, isDark).fullWidthPickerOptionTextActive,
                  ]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </Animated.View>
        </Animated.View>
      </Modal>

      {/* Eşyalı Edit Modal - küçük modal */}
      <Modal
        visible={showFurnishedModal}
        animationType="none"
        transparent={true}
        hardwareAccelerated={true}
        presentationStyle="overFullScreen"
        statusBarTranslucent={true}
        onRequestClose={() => setShowFurnishedModal(false)}
      >
        <Animated.View style={[stylesFactory(currentTheme, isDark).modalOverlayPicker, { opacity: pickerFadeAnim }]} renderToHardwareTextureAndroid shouldRasterizeIOS>
          <Animated.View style={[stylesFactory(currentTheme, isDark).modalContainerSmall, { transform: [{ translateY: pickerTranslateY }, { scale: pickerScale }] }]} renderToHardwareTextureAndroid shouldRasterizeIOS>
            <View style={stylesFactory(currentTheme, isDark).modalHeaderPicker}>
              <Text style={stylesFactory(currentTheme, isDark).modalTitlePicker}>Eşya Durumu</Text>
              <TouchableOpacity onPress={() => setShowFurnishedModal(false)}>
                <Text style={stylesFactory(currentTheme, isDark).modalCloseTextPicker}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={stylesFactory(currentTheme, isDark).fullWidthPickerContainer}>
              {furnishedOptions.map((option) => (
                <TouchableOpacity
                  key={option.value.toString()}
                  style={[
                    stylesFactory(currentTheme, isDark).fullWidthPickerOption,
                    (tempPortfolioData.furnished !== undefined ? tempPortfolioData.furnished : portfolio.furnished) === option.value && stylesFactory(currentTheme, isDark).fullWidthPickerOptionActive,
                  ]}
                  onPress={() => {
                    setTempPortfolioData(prev => ({ ...prev, furnished: option.value }));
                    setShowFurnishedModal(false);
                  }}
                >
                  <Text style={[
                    stylesFactory(currentTheme, isDark).fullWidthPickerOptionText,
                    (tempPortfolioData.furnished !== undefined ? tempPortfolioData.furnished : portfolio.furnished) === option.value && stylesFactory(currentTheme, isDark).fullWidthPickerOptionTextActive,
                  ]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </Animated.View>
        </Animated.View>
      </Modal>

      {/* Mutfak Tipi Edit Modal - küçük modal */}
      <Modal
        visible={showKitchenTypeModal}
        animationType="none"
        transparent={true}
        hardwareAccelerated={true}
        presentationStyle="overFullScreen"
        statusBarTranslucent={true}
        onRequestClose={() => setShowKitchenTypeModal(false)}
      >
        <Animated.View style={[stylesFactory(currentTheme, isDark).modalOverlayPicker, { opacity: pickerFadeAnim }]} renderToHardwareTextureAndroid shouldRasterizeIOS>
          <Animated.View style={[stylesFactory(currentTheme, isDark).modalContainerSmall, { transform: [{ translateY: pickerTranslateY }, { scale: pickerScale }] }]} renderToHardwareTextureAndroid shouldRasterizeIOS>
            <View style={stylesFactory(currentTheme, isDark).modalHeaderPicker}>
              <Text style={stylesFactory(currentTheme, isDark).modalTitlePicker}>Mutfak Tipi</Text>
              <TouchableOpacity onPress={() => setShowKitchenTypeModal(false)}>
                <Text style={stylesFactory(currentTheme, isDark).modalCloseTextPicker}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={stylesFactory(currentTheme, isDark).fullWidthPickerContainer}>
              {kitchenTypeOptions.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    stylesFactory(currentTheme, isDark).fullWidthPickerOption,
                    (tempPortfolioData.kitchenType || portfolio.kitchenType) === option.value && stylesFactory(currentTheme, isDark).fullWidthPickerOptionActive,
                  ]}
                  onPress={() => {
                    setTempPortfolioData(prev => ({ ...prev, kitchenType: option.value }));
                    setShowKitchenTypeModal(false);
                  }}
                >
                  <Text style={[
                    stylesFactory(currentTheme, isDark).fullWidthPickerOptionText,
                    (tempPortfolioData.kitchenType || portfolio.kitchenType) === option.value && stylesFactory(currentTheme, isDark).fullWidthPickerOptionTextActive,
                  ]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </Animated.View>
        </Animated.View>
      </Modal>

      {/* Tapu Durumu Edit Modal - küçük modal */}
      <Modal
        visible={showDeedStatusModal}
        animationType="none"
        transparent={true}
        hardwareAccelerated={true}
        presentationStyle="overFullScreen"
        statusBarTranslucent={true}
        onRequestClose={() => setShowDeedStatusModal(false)}
      >
        <Animated.View style={[stylesFactory(currentTheme, isDark).modalOverlayPicker, { opacity: pickerFadeAnim }]} renderToHardwareTextureAndroid shouldRasterizeIOS>
          <Animated.View style={[stylesFactory(currentTheme, isDark).modalContainerSmall, { transform: [{ translateY: pickerTranslateY }, { scale: pickerScale }] }]} renderToHardwareTextureAndroid shouldRasterizeIOS>
            <View style={stylesFactory(currentTheme, isDark).modalHeaderPicker}>
              <Text style={stylesFactory(currentTheme, isDark).modalTitlePicker}>Tapu Durumu</Text>
              <TouchableOpacity onPress={() => setShowDeedStatusModal(false)}>
                <Text style={stylesFactory(currentTheme, isDark).modalCloseTextPicker}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={stylesFactory(currentTheme, isDark).fullWidthPickerContainer}>
              {deedStatusOptions.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    stylesFactory(currentTheme, isDark).fullWidthPickerOption,
                    (tempPortfolioData.deedStatus || portfolio.deedStatus) === option.value && stylesFactory(currentTheme, isDark).fullWidthPickerOptionActive,
                  ]}
                  onPress={() => {
                    setTempPortfolioData(prev => ({ ...prev, deedStatus: option.value }));
                    setShowDeedStatusModal(false);
                  }}
                >
                  <Text style={[
                    stylesFactory(currentTheme, isDark).fullWidthPickerOptionText,
                    (tempPortfolioData.deedStatus || portfolio.deedStatus) === option.value && stylesFactory(currentTheme, isDark).fullWidthPickerOptionTextActive,
                  ]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </Animated.View>
        </Animated.View>
      </Modal>

      {/* Isıtma Tipi Edit Modal - küçük modal */}
      <Modal
        visible={showHeatingTypeModal}
        animationType="none"
        transparent={true}
        hardwareAccelerated={true}
        presentationStyle="overFullScreen"
        statusBarTranslucent={true}
        onRequestClose={() => setShowHeatingTypeModal(false)}
      >
        <Animated.View style={[stylesFactory(currentTheme, isDark).modalOverlayPicker, { opacity: pickerFadeAnim }]} renderToHardwareTextureAndroid shouldRasterizeIOS>
          <Animated.View style={[stylesFactory(currentTheme, isDark).modalContainerSmall, { transform: [{ translateY: pickerTranslateY }, { scale: pickerScale }] }]} renderToHardwareTextureAndroid shouldRasterizeIOS>
            <View style={stylesFactory(currentTheme, isDark).modalHeaderPicker}>
              <Text style={stylesFactory(currentTheme, isDark).modalTitlePicker}>Isıtma Tipi</Text>
              <TouchableOpacity onPress={() => setShowHeatingTypeModal(false)}>
                <Text style={stylesFactory(currentTheme, isDark).modalCloseTextPicker}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={stylesFactory(currentTheme, isDark).fullWidthPickerContainer}>
              {heatingTypeOptions.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    stylesFactory(currentTheme, isDark).fullWidthPickerOption,
                    (tempPortfolioData.heatingType || portfolio.heatingType) === option.value && stylesFactory(currentTheme, isDark).fullWidthPickerOptionActive,
                  ]}
                  onPress={() => {
                    setTempPortfolioData(prev => ({ ...prev, heatingType: option.value }));
                    setShowHeatingTypeModal(false);
                  }}
                >
                  <Text style={[
                    stylesFactory(currentTheme, isDark).fullWidthPickerOptionText,
                    (tempPortfolioData.heatingType || portfolio.heatingType) === option.value && stylesFactory(currentTheme, isDark).fullWidthPickerOptionTextActive,
                  ]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </Animated.View>
        </Animated.View>
      </Modal>

      {/* Kullanım Durumu Edit Modal - küçük modal */}
      <Modal
        visible={showUsageStatusModal}
        animationType="none"
        transparent={true}
        hardwareAccelerated={true}
        presentationStyle="overFullScreen"
        statusBarTranslucent={true}
        onRequestClose={() => setShowUsageStatusModal(false)}
      >
        <Animated.View style={[stylesFactory(currentTheme, isDark).modalOverlayPicker, { opacity: pickerFadeAnim }]} renderToHardwareTextureAndroid shouldRasterizeIOS>
          <Animated.View style={[stylesFactory(currentTheme, isDark).modalContainerSmall, { transform: [{ translateY: pickerTranslateY }, { scale: pickerScale }] }]} renderToHardwareTextureAndroid shouldRasterizeIOS>
            <View style={stylesFactory(currentTheme, isDark).modalHeaderPicker}>
              <Text style={stylesFactory(currentTheme, isDark).modalTitlePicker}>Kullanım Durumu</Text>
              <TouchableOpacity onPress={() => setShowUsageStatusModal(false)}>
                <Text style={stylesFactory(currentTheme, isDark).modalCloseTextPicker}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={stylesFactory(currentTheme, isDark).fullWidthPickerContainer}>
              {usageStatusOptions.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    stylesFactory(currentTheme, isDark).fullWidthPickerOption,
                    (tempPortfolioData.usageStatus || portfolio.usageStatus) === option.value && stylesFactory(currentTheme, isDark).fullWidthPickerOptionActive,
                  ]}
                  onPress={() => {
                    setTempPortfolioData(prev => ({ ...prev, usageStatus: option.value }));
                    setShowUsageStatusModal(false);
                  }}
                >
                  <Text style={[
                    stylesFactory(currentTheme, isDark).fullWidthPickerOptionText,
                    (tempPortfolioData.usageStatus || portfolio.usageStatus) === option.value && stylesFactory(currentTheme, isDark).fullWidthPickerOptionTextActive,
                  ]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </Animated.View>
        </Animated.View>
      </Modal>

      {/* Oda Sayısı Edit Modal - liste modal */}
      <Modal
        visible={showRoomCountModal}
        animationType="none"
        transparent={true}
        hardwareAccelerated={true}
        presentationStyle="overFullScreen"
        statusBarTranslucent={true}
        onRequestClose={() => setShowRoomCountModal(false)}
      >
        <Animated.View style={[stylesFactory(currentTheme, isDark).modalOverlayPicker, { opacity: pickerFadeAnim }]} renderToHardwareTextureAndroid shouldRasterizeIOS>
          <Animated.View style={[stylesFactory(currentTheme, isDark).modalContainerPicker, { transform: [{ translateY: pickerTranslateY }, { scale: pickerScale }] }]} renderToHardwareTextureAndroid shouldRasterizeIOS>
            <View style={stylesFactory(currentTheme, isDark).modalHeaderPicker}>
              <Text style={stylesFactory(currentTheme, isDark).modalTitlePicker}>Oda Sayısı Seçin</Text>
              <TouchableOpacity onPress={() => setShowRoomCountModal(false)}>
                <Text style={stylesFactory(currentTheme, isDark).modalCloseTextPicker}>Kapat</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={roomCountOptions}
              keyExtractor={(item) => item.value}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={stylesFactory(currentTheme, isDark).neighborhoodItemPicker}
                  onPress={() => {
                    setTempPortfolioData(prev => ({ ...prev, roomCount: item.value }));
                    setShowRoomCountModal(false);
                  }}
                >
                  <Text style={stylesFactory(currentTheme, isDark).neighborhoodTextPicker}>{item.label}</Text>
                </TouchableOpacity>
              )}
              initialNumToRender={10}
              maxToRenderPerBatch={10}
              windowSize={3}
              removeClippedSubviews
              getItemLayout={getPickerLayout}
            />
          </Animated.View>
        </Animated.View>
      </Modal>

      {/* Depozito Edit Modal - TextInput modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={showDepositModal}
        onRequestClose={() => setShowDepositModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: currentTheme.colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: currentTheme.colors.text }]}>
                Depozito Düzenle
              </Text>
              <TouchableOpacity 
                style={styles.modalCloseButton}
                onPress={() => setShowDepositModal(false)}
              >
                <Text style={[styles.modalCloseText, { color: currentTheme.colors.textSecondary }]}>✕</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={[styles.modalInput, { 
                borderColor: currentTheme.colors.border,
                backgroundColor: currentTheme.colors.background,
                color: currentTheme.colors.text
              }]}
              value={(tempPortfolioData.deposit || portfolio?.deposit || '').toString()}
              onChangeText={(text) => setTempPortfolioData(prev => ({ ...prev, deposit: text }))}
              placeholder="Depozito miktarını girin"
              placeholderTextColor={currentTheme.colors.textSecondary}
              keyboardType="numeric"
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancelButton, { backgroundColor: currentTheme.colors.textSecondary }]}
                onPress={() => setShowDepositModal(false)}
              >
                <Text style={[styles.modalButtonText, { color: currentTheme.colors.white }]}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalSaveButton, { backgroundColor: currentTheme.colors.primary }]}
                onPress={() => {
                  setShowDepositModal(false);
                }}
              >
                <Text style={[styles.modalButtonText, { color: currentTheme.colors.white }]}>Kaydet</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Ebeveyn Banyo Edit Modal - küçük modal */}
      <Modal
        visible={showParentBathroomModal}
        animationType="none"
        transparent={true}
        hardwareAccelerated={true}
        presentationStyle="overFullScreen"
        statusBarTranslucent={true}
        onRequestClose={() => setShowParentBathroomModal(false)}
      >
        <Animated.View style={[stylesFactory(currentTheme, isDark).modalOverlayPicker, { opacity: pickerFadeAnim }]} renderToHardwareTextureAndroid shouldRasterizeIOS>
          <Animated.View style={[stylesFactory(currentTheme, isDark).modalContainerSmall, { transform: [{ translateY: pickerTranslateY }, { scale: pickerScale }] }]} renderToHardwareTextureAndroid shouldRasterizeIOS>
            <View style={stylesFactory(currentTheme, isDark).modalHeaderPicker}>
              <Text style={stylesFactory(currentTheme, isDark).modalTitlePicker}>Ebeveyn Banyo</Text>
              <TouchableOpacity onPress={() => setShowParentBathroomModal(false)}>
                <Text style={stylesFactory(currentTheme, isDark).modalCloseTextPicker}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={stylesFactory(currentTheme, isDark).fullWidthPickerContainer}>
              {parentBathroomOptions.map((option) => (
                <TouchableOpacity
                  key={option.value.toString()}
                  style={[
                    stylesFactory(currentTheme, isDark).fullWidthPickerOption,
                    (tempPortfolioData.parentBathroom !== undefined ? tempPortfolioData.parentBathroom : (portfolio.parentBathroom || false)) === option.value && stylesFactory(currentTheme, isDark).fullWidthPickerOptionActive,
                  ]}
                  onPress={() => {
                    setTempPortfolioData(prev => ({ ...prev, parentBathroom: option.value }));
                    setShowParentBathroomModal(false);
                  }}
                >
                  <Text style={[
                    stylesFactory(currentTheme, isDark).fullWidthPickerOptionText,
                    (tempPortfolioData.parentBathroom !== undefined ? tempPortfolioData.parentBathroom : (portfolio.parentBathroom || false)) === option.value && stylesFactory(currentTheme, isDark).fullWidthPickerOptionTextActive,
                  ]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </Animated.View>
        </Animated.View>
      </Modal>

      {/* Mülk Sahibi Adı Edit Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={showOwnerNameModal}
        onRequestClose={() => setShowOwnerNameModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: currentTheme.colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: currentTheme.colors.text }]}>
                Mülk Sahibi Adı
              </Text>
              <TouchableOpacity 
                style={styles.modalCloseButton}
                onPress={() => setShowOwnerNameModal(false)}
              >
                <Text style={[styles.modalCloseText, { color: currentTheme.colors.textSecondary }]}>✕</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={[styles.modalInput, { 
                borderColor: currentTheme.colors.border,
                backgroundColor: currentTheme.colors.background,
                color: currentTheme.colors.text
              }]}
              value={tempPortfolioData.ownerName || portfolio?.ownerName || ''}
              onChangeText={(text) => setTempPortfolioData(prev => ({ ...prev, ownerName: text }))}
              placeholder="Mülk sahibi adını girin"
              placeholderTextColor={currentTheme.colors.textSecondary}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancelButton, { backgroundColor: currentTheme.colors.textSecondary }]}
                onPress={() => setShowOwnerNameModal(false)}
              >
                <Text style={[styles.modalButtonText, { color: currentTheme.colors.white }]}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalSaveButton, { backgroundColor: currentTheme.colors.primary }]}
                onPress={() => setShowOwnerNameModal(false)}
              >
                <Text style={[styles.modalButtonText, { color: currentTheme.colors.white }]}>Kaydet</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Telefon Edit Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={showOwnerPhoneModal}
        onRequestClose={() => setShowOwnerPhoneModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: currentTheme.colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: currentTheme.colors.text }]}>
                Telefon Numarası
              </Text>
              <TouchableOpacity 
                style={styles.modalCloseButton}
                onPress={() => setShowOwnerPhoneModal(false)}
              >
                <Text style={[styles.modalCloseText, { color: currentTheme.colors.textSecondary }]}>✕</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={[styles.modalInput, { 
                borderColor: currentTheme.colors.border,
                backgroundColor: currentTheme.colors.background,
                color: currentTheme.colors.text
              }]}
              value={tempPortfolioData.ownerPhone || portfolio?.ownerPhone || ''}
              onChangeText={(text) => setTempPortfolioData(prev => ({ ...prev, ownerPhone: text }))}
              placeholder="Telefon numarasını girin"
              placeholderTextColor={currentTheme.colors.textSecondary}
              keyboardType="phone-pad"
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancelButton, { backgroundColor: currentTheme.colors.textSecondary }]}
                onPress={() => setShowOwnerPhoneModal(false)}
              >
                <Text style={[styles.modalButtonText, { color: currentTheme.colors.white }]}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalSaveButton, { backgroundColor: currentTheme.colors.primary }]}
                onPress={() => setShowOwnerPhoneModal(false)}
              >
                <Text style={[styles.modalButtonText, { color: currentTheme.colors.white }]}>Kaydet</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Anahtar Yeri Edit Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={showKeyLocationModal}
        onRequestClose={() => setShowKeyLocationModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: currentTheme.colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: currentTheme.colors.text }]}>
                Anahtar Yeri Tarifi
              </Text>
              <TouchableOpacity 
                style={styles.modalCloseButton}
                onPress={() => setShowKeyLocationModal(false)}
              >
                <Text style={[styles.modalCloseText, { color: currentTheme.colors.textSecondary }]}>✕</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={[styles.modalInput, { 
                borderColor: currentTheme.colors.border,
                backgroundColor: currentTheme.colors.background,
                color: currentTheme.colors.text,
                minHeight: 80
              }]}
              value={tempPortfolioData.keyLocation || portfolio?.keyLocation || ''}
              onChangeText={(text) => setTempPortfolioData(prev => ({ ...prev, keyLocation: text }))}
              placeholder="Anahtar yeri tarifini girin"
              placeholderTextColor={currentTheme.colors.textSecondary}
              multiline
              numberOfLines={3}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancelButton, { backgroundColor: currentTheme.colors.textSecondary }]}
                onPress={() => setShowKeyLocationModal(false)}
              >
                <Text style={[styles.modalButtonText, { color: currentTheme.colors.white }]}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalSaveButton, { backgroundColor: currentTheme.colors.primary }]}
                onPress={() => setShowKeyLocationModal(false)}
              >
                <Text style={[styles.modalButtonText, { color: currentTheme.colors.white }]}>Kaydet</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Özel Not Edit Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={showSpecialNoteModal}
        onRequestClose={() => setShowSpecialNoteModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: currentTheme.colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: currentTheme.colors.text }]}>
                Özel Not
              </Text>
              <TouchableOpacity 
                style={styles.modalCloseButton}
                onPress={() => setShowSpecialNoteModal(false)}
              >
                <Text style={[styles.modalCloseText, { color: currentTheme.colors.textSecondary }]}>✕</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={[styles.modalInput, { 
                borderColor: currentTheme.colors.border,
                backgroundColor: currentTheme.colors.background,
                color: currentTheme.colors.text,
                minHeight: 100
              }]}
              value={tempPortfolioData.specialNote || portfolio?.specialNote || ''}
              onChangeText={(text) => setTempPortfolioData(prev => ({ ...prev, specialNote: text }))}
              placeholder="Özel notunuzu girin"
              placeholderTextColor={currentTheme.colors.textSecondary}
              multiline
              numberOfLines={4}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancelButton, { backgroundColor: currentTheme.colors.textSecondary }]}
                onPress={() => setShowSpecialNoteModal(false)}
              >
                <Text style={[styles.modalButtonText, { color: currentTheme.colors.white }]}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalSaveButton, { backgroundColor: currentTheme.colors.primary }]}
                onPress={() => setShowSpecialNoteModal(false)}
              >
                <Text style={[styles.modalButtonText, { color: currentTheme.colors.white }]}>Kaydet</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Kapı Şifresi Edit Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={showDoorCodeModal}
        onRequestClose={() => setShowDoorCodeModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: currentTheme.colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: currentTheme.colors.text }]}>
                Kapı Şifresi
              </Text>
              <TouchableOpacity 
                style={styles.modalCloseButton}
                onPress={() => setShowDoorCodeModal(false)}
              >
                <Text style={[styles.modalCloseText, { color: currentTheme.colors.textSecondary }]}>✕</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={[styles.modalInput, { 
                borderColor: currentTheme.colors.border,
                backgroundColor: currentTheme.colors.background,
                color: currentTheme.colors.text
              }]}
              value={tempPortfolioData.doorCode || portfolio?.doorCode || ''}
              onChangeText={(text) => setTempPortfolioData(prev => ({ ...prev, doorCode: text }))}
              placeholder="Kapı şifresini girin"
              placeholderTextColor={currentTheme.colors.textSecondary}
              secureTextEntry={false}
              keyboardType="default"
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancelButton, { backgroundColor: currentTheme.colors.textSecondary }]}
                onPress={() => setShowDoorCodeModal(false)}
              >
                <Text style={[styles.modalButtonText, { color: currentTheme.colors.white }]}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalSaveButton, { backgroundColor: currentTheme.colors.primary }]}
                onPress={() => setShowDoorCodeModal(false)}
              >
                <Text style={[styles.modalButtonText, { color: currentTheme.colors.white }]}>Kaydet</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Image Management Modal (from AddPortfolio.js step 5) */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showImagePicker}
        onRequestClose={() => setShowImagePicker(false)}
        hardwareAccelerated={true}
      >
        <View style={styles.imageManagementModalOverlay}>
          <View style={[styles.imageManagementModalContent, { backgroundColor: currentTheme.colors.surface }]}>
            <View style={styles.imageManagementModalHeader}>
              <Text style={[styles.imageManagementModalTitle, { color: currentTheme.colors.text }]}>
                Portföy Görselleri
              </Text>
              <TouchableOpacity 
                style={[styles.imageModalSaveButton, { backgroundColor: currentTheme.colors.error, position: 'absolute', right: 60, top: 0 }]}
                onPress={async () => {
                  await savePortfolioChanges();
                  setShowImagePicker(false);
                }}
              >
                <Text style={[styles.imageModalSaveButtonText, { color: currentTheme.colors.white }]}>Kaydet</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.imageModalCloseButton, { backgroundColor: currentTheme.colors.error, position: 'absolute', right: 0, top: 0 }]}
                onPress={() => setShowImagePicker(false)}
              >
                <Text style={[styles.modalCloseText, { color: currentTheme.colors.white }]}>×</Text>
              </TouchableOpacity>
            </View>
            
            <ScrollView 
              style={styles.imageManagementScrollView}
              showsVerticalScrollIndicator={false}
              removeClippedSubviews={true}
              scrollEventThrottle={16}
            >
              {/* Resim Ekleme Butonları */}
              <View style={styles.imageButtonsContainer}>
                <TouchableOpacity
                  style={[styles.imageButton, styles.galleryButton]}
                  onPress={selectFromGallery}
                  disabled={selectedImages.length >= 30}
                >
                  <Text style={styles.imageButtonText}>📷 Galeri</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.imageButton, styles.cameraButton]}
                  onPress={takePhoto}
                  disabled={selectedImages.length >= 30}
                >
                  <Text style={styles.imageButtonText}>📸 Kamera</Text>
                </TouchableOpacity>
              </View>

              {/* Resim Sayısı */}
              <Text style={[styles.imageCountText, { color: currentTheme.colors.textSecondary }]}>
                {selectedImages.length}/30 resim
              </Text>

              {/* Butonlar */}
              {selectedImages.length > 0 && (
                <View style={styles.imageActionButtons}>
                  {/* Sıralamayı Düzenle */}
                  <TouchableOpacity
                    style={[styles.clearAllButton, styles.reorderButton]}
                    onPress={openReorderModal}
                  >
                    <Text style={[styles.clearAllText, { color: currentTheme.colors.text }]}>🔄 Sıralamayı Düzenle</Text>
                  </TouchableOpacity>

                  {/* Tümünü Kaldır */}
                  <TouchableOpacity
                    style={styles.clearAllButton}
                    onPress={() => setShowClearAllModal(true)}
                  >
                    <Text style={[styles.clearAllText, { color: currentTheme.colors.error }]}>🗑️ Tümünü Kaldır</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Seçilen Resimler */}
              {selectedImages.length > 0 && (
                <View style={styles.selectedImagesContainer}>
                  <View style={styles.selectedImagesHeader}>
                    <Text style={[styles.selectedImagesTitle, { color: currentTheme.colors.text }]}>Mevcut Resimler:</Text>
                  </View>
                  <View style={styles.imageGrid}>
                    {selectedImages.map((item, index) => {
                      return (
                        <View key={item.uri || index} style={styles.imageItem}>
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
                              <Image 
                                source={{ uri: cdnImg(item.uri, { w: 150, h: 150, q: 70 }) }} 
                                style={styles.imageThumbnail}
                                resizeMode="cover"
                              />
                            </TouchableOpacity>
                          </View>

                          <View style={styles.imageActions}>
                            <TouchableOpacity
                              style={styles.actionButton}
                              onPress={() => setFeaturedImage(index)}
                            >
                              <Text style={styles.actionIcon}>⭐</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.actionButton, styles.removeButton]}
                              onPress={() => removeImage(index)}
                            >
                              <Text style={styles.actionIcon}>🗑️</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Share Link Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={showShareLinkModal}
        onRequestClose={() => setShowShareLinkModal(false)}
      >
        <View style={styles.shareLinkModalContainer}>
          <View style={[styles.shareLinkModalBackdrop, { backgroundColor: 'rgba(0, 0, 0, 0.4)' }]}>
            <GlassmorphismView
              style={styles.shareLinkModalContent}
              borderRadius={24}
              blurEnabled={false}
              config={shareModalGlassConfig}
            >
              
              {/* Header */}
              <View style={styles.shareLinkModalHeader}>
                <Text style={[styles.shareLinkModalTitle, { color: currentTheme.colors.text }]}>
                  {shareLinkData.title}
                </Text>
                <TouchableOpacity 
                  style={styles.shareLinkModalCloseButton}
                  onPress={() => setShowShareLinkModal(false)}
                >
                  <Text style={[styles.shareLinkModalCloseText, { color: currentTheme.colors.textSecondary }]}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* Message */}
              <Text style={[styles.shareLinkModalMessage, { color: currentTheme.colors.textSecondary }]}>
                {shareLinkData.message}
              </Text>

              {/* URL Display */}
                <View style={[styles.shareLinkModalUrlContainer, { 
                backgroundColor: '#142331',
                borderColor: currentTheme.colors.border 
              }]}> 
                <Text style={[styles.shareLinkModalUrlText, { color: currentTheme.colors.text }]} numberOfLines={3}>
                  {shareLinkData.url}
                </Text>
              </View>

              {/* Action Buttons */}
              <View style={styles.shareLinkModalButtons}>
                <TouchableOpacity
                  style={[styles.shareLinkModalButton, { backgroundColor: currentTheme.colors.primary }]}
                  onPress={() => {
                    Clipboard.setString(shareLinkData.url);
                    setShowShareLinkModal(false);
                    // Show animated success modal instead of Alert
                    setCopySuccessMessage('Link kopyalandı!');
                    if (copySuccessTimerRef.current) {
                      clearTimeout(copySuccessTimerRef.current);
                    }
                    setShowCopySuccessModal(true);
                    copySuccessScaleAnim.setValue(0);
                    Animated.spring(copySuccessScaleAnim, {
                      toValue: 1,
                      tension: 50,
                      friction: 7,
                      useNativeDriver: true,
                    }).start();
                    copySuccessTimerRef.current = setTimeout(() => {
                      Animated.timing(copySuccessScaleAnim, {
                        toValue: 0,
                        duration: 200,
                        useNativeDriver: true,
                      }).start(() => setShowCopySuccessModal(false));
                    }, 1500);
                  }}
                >
                  <Text style={styles.shareLinkModalButtonText}>📋 Kopyala</Text>
                </TouchableOpacity>

                {!shareLinkData.isCustom && (
                  <TouchableOpacity
                    style={[styles.shareLinkModalSecondaryButton, { backgroundColor: '#FFFFFF' }]}
                    onPress={() => {
                      setShowShareLinkModal(false);
                      setShowSocialShareTemplate(true);
                    }}
                  >
                    <Text style={[styles.shareLinkModalSecondaryButtonText, { color: '#142331' }]}>📱 Sosyal Medya</Text>
                  </TouchableOpacity>
                )}
              </View>
              
            </GlassmorphismView>
          </View>
        </View>
      </Modal>

      {/* Permissions Management Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showPermissionsManagementModal}
        onRequestClose={() => setShowPermissionsManagementModal(false)}
      >
        <View style={styles.permissionsModalContainer}>
          <View style={styles.permissionsModalBackdrop}>
          <View style={[styles.permissionsModalContent, { backgroundColor: '#142331' }]}> 
              
              {/* Header */}
              <View style={styles.permissionsModalHeader}>
                <Text style={[styles.permissionsModalTitle, { color: currentTheme.colors.text }]}>
                  👥 Verilen İzinler
                </Text>
                <TouchableOpacity 
                  style={styles.permissionsModalCloseButton}
                  onPress={() => setShowPermissionsManagementModal(false)}
                >
                  <Text style={[styles.permissionsModalCloseText, { color: currentTheme.colors.textSecondary }]}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* Subtitle */}
              <Text style={[styles.permissionsModalSubtitle, { color: currentTheme.colors.textSecondary }]}>
                Bu portföyü paylaşma izni verdiğiniz kullanıcılar
              </Text>

              {/* Permissions List */}
              <ScrollView style={styles.permissionsModalList} showsVerticalScrollIndicator={false}>
                {permissionsLoading ? (
                  <View style={styles.permissionsModalEmpty}>
                    <Text style={[styles.permissionsModalEmptyIcon, { color: currentTheme.colors.primary }]}>
                      ⏳
                    </Text>
                    <Text style={[styles.permissionsModalEmptyText, { color: currentTheme.colors.textSecondary }]}>
                      İzinler yükleniyor...
                    </Text>
                  </View>
                ) : grantedPermissions.length === 0 ? (
                  <View style={styles.permissionsModalEmpty}>
                    <Text style={[styles.permissionsModalEmptyIcon, { color: currentTheme.colors.textSecondary }]}>
                      🔒
                    </Text>
                    <Text style={[styles.permissionsModalEmptyText, { color: currentTheme.colors.textSecondary }]}>
                      Henüz kimseye izin vermediniz
                    </Text>
                  </View>
                ) : (
                  grantedPermissions.map((permission, index) => (
                    <View 
                      key={permission.id} 
                      style={[styles.permissionsModalItem, { 
                        backgroundColor: currentTheme.colors.background,
                        borderColor: currentTheme.colors.border
                      }]}
                    >
                      <View style={styles.permissionsModalItemContent}>
                        <View style={styles.permissionsModalItemInfo}>
                          <Text style={[styles.permissionsModalItemName, { color: currentTheme.colors.text }]}>
                            {permission.userName}
                          </Text>
                          {permission.userEmail && (
                            <Text style={[styles.permissionsModalItemEmail, { color: currentTheme.colors.textSecondary }]}>
                              {permission.userEmail}
                            </Text>
                          )}
                          <Text style={[styles.permissionsModalItemDate, { color: currentTheme.colors.textSecondary }]}>
                            İzin verildi: {permission.createdAt?.toDate?.()?.toLocaleDateString?.('tr-TR') || 'Bilinmiyor'}
                          </Text>
                        </View>
                        
                        <TouchableOpacity
                          style={[styles.permissionsModalItemRemoveButton, { backgroundColor: currentTheme.colors.error || '#dc3545' }]}
                          onPress={() => handleRevokePermission(permission.id, permission.userName)}
                        >
                          <Text style={styles.permissionsModalItemRemoveText}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))
                )}
              </ScrollView>

              {/* Footer */}
              <View style={styles.permissionsModalFooter}>
                <TouchableOpacity
                  style={[styles.permissionsModalCloseFooterButton, { backgroundColor: currentTheme.colors.primary }]}
                  onPress={() => setShowPermissionsManagementModal(false)}
                >
                  <Text style={styles.permissionsModalCloseFooterButtonText}>Tamam</Text>
                </TouchableOpacity>
              </View>
              
            </View>
          </View>
        </View>
      </Modal>

      {/* Revoke Permission Confirmation Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={showRevokeConfirmModal}
        onRequestClose={() => setShowRevokeConfirmModal(false)}
      >
        <View style={styles.revokeModalContainer}>
          <View style={styles.revokeModalBackdrop}>
            <View style={[styles.revokeModalContent, { backgroundColor: currentTheme.colors.surface }]}>
              
              {/* Icon */}
              <View style={styles.revokeModalIconContainer}>
                <Text style={styles.revokeModalIcon}>⚠️</Text>
              </View>

              {/* Title */}
              <Text style={[styles.revokeModalTitle, { color: currentTheme.colors.text }]}>
                İzin Kaldır
              </Text>

              {/* Message */}
              <Text style={[styles.revokeModalMessage, { color: currentTheme.colors.textSecondary }]}>
                <Text style={{ fontWeight: '600', color: currentTheme.colors.text }}>
                  {revokePermissionData.userName}
                </Text> kullanıcısının bu portföyü paylaşma iznini kaldırmak istediğinizden emin misiniz?
              </Text>

              {/* Warning Note */}
              <View style={[styles.revokeModalWarning, { 
                backgroundColor: currentTheme.colors.error + '15',
                borderColor: currentTheme.colors.error + '30'
              }]}>
                <Text style={[styles.revokeModalWarningText, { color: currentTheme.colors.error }]}>
                  Bu işlem geri alınamaz ve tüm paylaşım linkleri deaktif edilecektir.
                </Text>
              </View>

              {/* Action Buttons */}
              <View style={styles.revokeModalButtons}>
                <TouchableOpacity
                  style={[styles.revokeModalCancelButton, { 
                    backgroundColor: currentTheme.colors.surface,
                    borderColor: currentTheme.colors.border
                  }]}
                  onPress={() => setShowRevokeConfirmModal(false)}
                >
                  <Text style={[styles.revokeModalCancelText, { color: currentTheme.colors.text }]}>
                    İptal
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.revokeModalConfirmButton, { backgroundColor: currentTheme.colors.error || '#dc3545' }]}
                  onPress={confirmRevokePermission}
                >
                  <Text style={styles.revokeModalConfirmText}>
                    Kaldır
                  </Text>
                </TouchableOpacity>
              </View>
              
            </View>
          </View>
        </View>
      </Modal>

      {/* Success Modal */}
      <Modal
        visible={showSuccessModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowSuccessModal(false)}
      >
        <View style={styles.successModalOverlay}>
          <GlassmorphismView
            style={styles.successModalContent}
            borderRadius={16}
            blurEnabled={false}
            config={successModalCardConfig}
          >
            <View style={styles.successIconContainer}>
              <Text style={styles.successIcon}>✓</Text>
            </View>
            <Text style={[styles.successTitle, { color: currentTheme.colors.text }]}>
              Başarılı!
            </Text>
            <Text style={[styles.successMessage, { color: currentTheme.colors.textSecondary }]}>
              {updatedFields.length > 0 
                ? `${updatedFields.join(', ')} başarıyla güncellendi.`
                : 'İşlem tamamlandı.'
              }
            </Text>
          </GlassmorphismView>
        </View>
      </Modal>

      {/* Image Reorder Modal */}
      <Modal
        visible={showReorderModal}
        transparent={true}
        animationType="slide"
        onRequestClose={closeReorderModal}
      >
        <View style={styles.reorderModalOverlay}>
          <View style={[styles.reorderModalContent, { backgroundColor: currentTheme.colors.surface }]}>
            <View style={styles.reorderModalHeader}>
              <Text style={[styles.reorderModalTitle, { color: currentTheme.colors.text }]}>Resim Sıralamasını Düzenle</Text>
              <TouchableOpacity onPress={closeReorderModal}>
                <Text style={[styles.reorderModalCloseText, { color: currentTheme.colors.textSecondary }]}>✕</Text>
              </TouchableOpacity>
            </View>
            
            <Text style={[styles.reorderModalInstruction, { color: currentTheme.colors.textSecondary }]}>
              Resimleri istediğiniz sıraya göre tıklayın (1, 2, 3...)
            </Text>
            
            <View style={styles.reorderImageGrid}>
              {selectedImages.map((item, index) => {
                const orderNumber = reorderSequence.indexOf(index) + 1;
                const isSelected = reorderSequence.includes(index);
                
                return (
                  <TouchableOpacity
                    key={item.uri || index}
                    style={[
                      styles.reorderImageItem,
                      isSelected && styles.reorderImageItemSelected
                    ]}
                    onPress={() => addToReorderSequence(index)}
                  >
                    <Image 
                      source={{ uri: cdnImg(item.uri, { w: 100, h: 100, q: 60 }) }} 
                      style={styles.reorderImageThumbnail}
                      resizeMode="cover"
                    />
                    {isSelected && (
                      <View style={[styles.reorderNumberBadge, { backgroundColor: currentTheme.colors.error }]}>
                        <Text style={[styles.reorderNumberText, { color: currentTheme.colors.white }]}>{orderNumber}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
            
            <View style={styles.reorderModalFooter}>
              <TouchableOpacity
                style={[styles.reorderCancelButton, { backgroundColor: currentTheme.colors.textSecondary }]}
                onPress={closeReorderModal}
              >
                <Text style={[styles.reorderCancelButtonText, { color: currentTheme.colors.white }]}>İptal</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.reorderApplyButton, { backgroundColor: currentTheme.colors.error }]}
                onPress={applyReorder}
              >
                <Text style={[styles.reorderApplyButtonText, { color: currentTheme.colors.white }]}>Tamam</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Clear All Images Modal */}
      <Modal
        visible={showClearAllModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowClearAllModal(false)}
      >
        <View style={styles.clearAllModalOverlay}>
          <View style={[styles.clearAllModalContent, { backgroundColor: currentTheme.colors.surface }]}>
            <View style={styles.clearAllModalIconContainer}>
              <Text style={styles.clearAllModalIcon}>⚠️</Text>
            </View>
            <Text style={[styles.clearAllModalTitle, { color: currentTheme.colors.text }]}>
              Tüm Resimleri Kaldır
            </Text>
            <Text style={[styles.clearAllModalMessage, { color: currentTheme.colors.textSecondary }]}>
              Tüm resimleri kaldırmak istediğinizden emin misiniz? Bu işlem geri alınamaz.
            </Text>
            <View style={styles.clearAllModalButtons}>
              <TouchableOpacity
                style={[styles.clearAllModalCancelButton, { backgroundColor: currentTheme.colors.textSecondary }]}
                onPress={() => setShowClearAllModal(false)}
              >
                <Text style={[styles.clearAllModalCancelButtonText, { color: currentTheme.colors.white }]}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.clearAllModalConfirmButton, { backgroundColor: currentTheme.colors.error }]}
                onPress={clearAllImages}
              >
                <Text style={[styles.clearAllModalConfirmButtonText, { color: currentTheme.colors.white }]}>Kaldır</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Featured Image Success Modal */}
      <Modal
        visible={showFeaturedSuccessModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowFeaturedSuccessModal(false)}
      >
        <View style={styles.featuredSuccessModalOverlay}>
          <View style={[styles.featuredSuccessModalContent, { backgroundColor: currentTheme.colors.surface }]}>
            <View style={styles.featuredSuccessModalIconContainer}>
              <Text style={styles.featuredSuccessModalIcon}>✅</Text>
            </View>
            <Text style={[styles.featuredSuccessModalTitle, { color: currentTheme.colors.text }]}>
              Başarılı
            </Text>
            <Text style={[styles.featuredSuccessModalMessage, { color: currentTheme.colors.textSecondary }]}>
              Vitrin resmi olarak ayarlandı.
            </Text>
            <TouchableOpacity
              style={[styles.featuredSuccessModalButton, { backgroundColor: currentTheme.colors.error }]}
              onPress={() => setShowFeaturedSuccessModal(false)}
            >
              <Text style={[styles.featuredSuccessModalButtonText, { color: currentTheme.colors.white }]}>Tamam</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Camera Mode Modal */}
      <Modal
        visible={showCameraMode}
        transparent={true}
        animationType="slide"
        onRequestClose={cancelCameraMode}
      >
        <View style={styles.cameraModeOverlay}>
          <View style={[styles.cameraModeContent, { backgroundColor: currentTheme.colors.surface }]}>
            <View style={styles.cameraModeHeader}>
              <Text style={[styles.cameraModeTitle, { color: currentTheme.colors.text }]}>Kamera Çekim Modu</Text>
              <TouchableOpacity
                style={styles.cameraModeCloseButton}
                onPress={cancelCameraMode}
              >
                <Text style={[styles.cameraModeCloseText, { color: currentTheme.colors.textSecondary }]}>×</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.cameraModeInfo}>
              <Text style={[styles.cameraModeInfoText, { color: currentTheme.colors.textSecondary }]}>
                {cameraImages.length} resim çekildi. {isContinuousMode ? 'Sürekli çekim aktif - "Tamam" dedikten sonra 2 saniye bekleyip kamera açılacak.' : 'Tek resim çekebilir veya sürekli çekim başlatabilirsiniz.'}
              </Text>
            </View>

            {/* Çekilen Resimler */}
            {cameraImages.length > 0 && (
              <View style={styles.cameraImagesContainer}>
                <Text style={[styles.cameraImagesTitle, { color: currentTheme.colors.text }]}>Çekilen Resimler:</Text>
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
                        <Text style={styles.cameraImageRemoveText}>×</Text>
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
                    style={[styles.cameraModeButton, styles.cameraTakeButton, { backgroundColor: currentTheme.colors.primary }]}
                    onPress={takeSinglePhoto}
                    disabled={selectedImages.length + cameraImages.length >= 30 || isCapturing}
                  >
                    <Text style={styles.cameraModeButtonIcon}>📸</Text>
                    <Text style={[styles.cameraModeButtonText, { color: currentTheme.colors.white }]}>
                      {isCapturing ? 'Çekiliyor...' : 'Tek Resim'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.cameraModeButton, styles.cameraContinuousButton, { backgroundColor: currentTheme.colors.secondary }]}
                    onPress={startContinuousCamera}
                    disabled={selectedImages.length + cameraImages.length >= 30 || isCapturing}
                  >
                    <Text style={styles.cameraModeButtonIcon}>🎬</Text>
                    <Text style={[styles.cameraModeButtonText, { color: currentTheme.colors.white }]}>Sürekli Çekim</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity
                  style={[styles.cameraModeButton, styles.cameraStopButton, { backgroundColor: currentTheme.colors.error }]}
                  onPress={stopContinuousCamera}
                >
                  <Text style={styles.cameraModeButtonIcon}>⏹️</Text>
                  <Text style={[styles.cameraModeButtonText, { color: currentTheme.colors.white }]}>Durdur</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.cameraModeButton, styles.cameraFinishButton, { backgroundColor: currentTheme.colors.success || currentTheme.colors.primary }]}
                onPress={finishCameraMode}
                disabled={cameraImages.length === 0}
              >
                <Text style={styles.cameraModeButtonIcon}>✅</Text>
                <Text style={[styles.cameraModeButtonText, { color: currentTheme.colors.white }]}>Tamam</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete Portfolio Modal */}
      <Modal
        visible={showDeleteModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowDeleteModal(false)}
      >
        <View style={styles.deleteModalOverlay}>
          <View style={[styles.deleteModalContent, { backgroundColor: currentTheme.colors.surface }]}>
            <View style={styles.deleteModalHeader}>
              <Text style={[styles.deleteModalTitle, { color: currentTheme.colors.error }]}>
                ⚠️ Dikkat
              </Text>
            </View>
            
            <View style={styles.deleteModalBody}>
              <Text style={[styles.deleteModalMessage, { color: currentTheme.colors.text }]}>
                Bu portföyü kalıcı olarak silmek istediğinize emin misiniz?
              </Text>
              <Text style={[styles.deleteModalWarning, { color: currentTheme.colors.textSecondary }]}>
                Bu işlem geri alınamaz. Portföy ve tüm bilgileri tamamen silinecektir.
              </Text>
            </View>

            <View style={styles.deleteModalButtons}>
              <TouchableOpacity
                style={[styles.deleteModalCancelButton, { backgroundColor: currentTheme.colors.textSecondary }]}
                onPress={() => setShowDeleteModal(false)}
                disabled={deleteLoading}
              >
                <Text style={[styles.deleteModalCancelText, { color: currentTheme.colors.white }]}>İptal</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.deleteModalConfirmButton, { backgroundColor: currentTheme.colors.error }]}
                onPress={() => {
                  setShowDeleteModal(false);
                  setShowFinalDeleteModal(true);
                }}
                disabled={deleteLoading}
              >
                <Text style={[styles.deleteModalConfirmText, { color: currentTheme.colors.white }]}>
                  Sil
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      {/* Final Delete Confirmation Modal */}
      <Modal
        visible={showFinalDeleteModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowFinalDeleteModal(false)}
      >
        <View style={styles.deleteModalOverlay}>
          <View style={[styles.deleteModalContent, { backgroundColor: currentTheme.colors.surface }]}>
            <View style={styles.deleteModalHeader}>
              <Text style={[styles.deleteModalTitle, { color: currentTheme.colors.error }]}>
                🚨 Son Onay
              </Text>
            </View>
            
            <View style={styles.deleteModalBody}>
              <Text style={[styles.deleteModalMessage, { color: currentTheme.colors.text }]}>
                Kalıcı olarak silmek istediğinize emin misiniz?
              </Text>
              <Text style={[styles.deleteModalWarning, { color: currentTheme.colors.textSecondary }]}>
                Bu işlem kesinlikle geri alınamaz!
              </Text>
            </View>

            <View style={styles.deleteModalButtons}>
              <TouchableOpacity
                style={[styles.deleteModalCancelButton, { backgroundColor: currentTheme.colors.textSecondary }]}
                onPress={() => setShowFinalDeleteModal(false)}
                disabled={deleteLoading}
              >
                <Text style={[styles.deleteModalCancelText, { color: currentTheme.colors.white }]}>İptal</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.deleteModalConfirmButton, { backgroundColor: currentTheme.colors.error }]}
                onPress={deletePortfolio}
                disabled={deleteLoading}
              >
                <Text style={[styles.deleteModalConfirmText, { color: currentTheme.colors.white }]}>
                  {deleteLoading ? 'Siliniyor...' : 'Kesin Sil'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete Success Modal */}
      <Modal
        visible={showDeleteSuccessModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          setShowDeleteSuccessModal(false);
          navigation.goBack();
        }}
      >
        <View style={styles.deleteModalOverlay}>
          <View style={[styles.deleteModalContent, { backgroundColor: currentTheme.colors.surface }]}>
            <View style={styles.deleteModalHeader}>
              <Text style={[styles.deleteModalTitle, { color: currentTheme.colors.success || currentTheme.colors.primary }]}>
                ✅ Başarılı
              </Text>
            </View>
            
            <View style={styles.deleteModalBody}>
              <Text style={[styles.deleteModalMessage, { color: currentTheme.colors.text }]}>
                Portföy başarıyla silindi.
              </Text>
              <Text style={[styles.deleteModalWarning, { color: currentTheme.colors.textSecondary }]}>
                Ana sayfaya yönlendiriliyorsunuz...
              </Text>
            </View>

            <View style={styles.deleteModalButtons}>
              <TouchableOpacity
                style={[styles.deleteModalConfirmButton, { backgroundColor: currentTheme.colors.success || currentTheme.colors.primary }]}
                onPress={() => {
                  setShowDeleteSuccessModal(false);
                  navigation.goBack();
                }}
              >
                <Text style={[styles.deleteModalConfirmText, { color: currentTheme.colors.white }]}>
                  Tamam
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};
const stylesFactory = (currentTheme, isDark) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: isDark ? '#071317' : currentTheme.colors.background,
  },
  
  // Background
  backgroundContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: -1,
  },
  backgroundImage: {
    width: '100%',
    height: '100%',
    opacity: 1,
  },
  lightBackground: {
    width: '100%',
    height: '100%',
    backgroundColor: currentTheme.colors.white || '#FFFFFF',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: currentTheme.spacing.lg,
    /* üst padding runtime'da insets.top + 12 verilecek */
    paddingBottom: currentTheme.spacing.lg,
    zIndex: 10000, // Yönet panelinin üstünde olsun
    elevation: 0, // Android için
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  backButton: {
    backgroundColor: currentTheme.colors.error, // Theme kırmızı rengi
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
    tintColor: currentTheme.colors.white, // Theme beyaz rengi
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: currentTheme.colors.text,
    flex: 1,
    marginHorizontal: 12,
    textAlign: 'center',
  },
  favoriteButton: {
    backgroundColor: currentTheme.colors.error, // Theme kırmızı rengi
    width: 37,
    height: 37,
    borderRadius: 8, // Rounded square
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 0,
  },
  favoriteIcon: {
    fontSize: 20,
    color: currentTheme.colors.white, // Theme beyaz rengi
  },
  shareIconHeader: {
    width: 20,
    height: 20,
    tintColor: currentTheme.colors.white,
  },

  // Content
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 20,
  },
  content: {
    flex: 1,
  },

  // Main Image
  imageContainer: {
    width: '100%',
    height: 300,
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 20,
    position: 'relative',
  },
  imageEditOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
  },
  imageEditOverlayContent: {
    backgroundColor: currentTheme.colors.error,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  imageEditOverlayText: {
    color: currentTheme.colors.white,
    fontSize: 16,
    fontWeight: 'bold',
  },

  // Image Management Modal Styles
  imageManagementModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageManagementModalContent: {
    width: '95%',
    maxHeight: '85%',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  imageManagementModalHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    marginBottom: 25,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: currentTheme.colors.border,
    position: 'relative',
    minHeight: 40,
  },
  imageManagementModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  imageModalHeaderButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexWrap: 'nowrap',
    maxWidth: 150,
  },
  imageModalSaveButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 36,
    maxWidth: 80,
  },
  imageModalSaveButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  imageModalCloseButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 36,
    width: 40,
    height: 36,
  },
  imageManagementScrollView: {
    maxHeight: '80%',
  },
  imageButtonsContainer: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 15,
  },
  imageButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  galleryButton: {
    backgroundColor: currentTheme.colors.primary,
  },
  cameraButton: {
    backgroundColor: currentTheme.colors.error,
  },
  imageButtonText: {
    color: currentTheme.colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  imageCountText: {
    textAlign: 'center',
    fontSize: 14,
    marginBottom: 15,
  },
  imageActionButtons: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 15,
  },
  clearAllButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: currentTheme.colors.background,
    borderWidth: 1,
    borderColor: currentTheme.colors.border,
    alignItems: 'center',
  },
  reorderButton: {
    backgroundColor: currentTheme.colors.primary + '20',
    borderColor: currentTheme.colors.primary,
  },
  clearAllText: {
    fontSize: 14,
    fontWeight: '600',
  },
  selectedImagesContainer: {
    marginTop: 10,
  },
  selectedImagesHeader: {
    marginBottom: 10,
  },
  selectedImagesTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  imageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  imageItem: {
    width: '30%',
    aspectRatio: 1,
    marginBottom: 8,
  },
  imagePreview: {
    flex: 1,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  featuredImagePreview: {
    borderColor: currentTheme.colors.warning,
  },
  imageTouchable: {
    flex: 1,
  },
  imageThumbnail: {
    width: '100%',
    height: '100%',
  },
  imageActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 5,
  },
  actionButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: currentTheme.colors.surface,
    borderWidth: 1,
    borderColor: currentTheme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeButton: {
    backgroundColor: currentTheme.colors.error + '20',
    borderColor: currentTheme.colors.error,
  },
  actionIcon: {
    fontSize: 16,
  },

  // Reorder Modal Styles
  reorderModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  reorderModalContent: {
    width: '90%',
    maxHeight: '80%',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  reorderModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: currentTheme.colors.border,
  },
  reorderModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  reorderModalCloseText: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  reorderModalInstruction: {
    textAlign: 'center',
    marginBottom: 20,
    fontSize: 14,
  },
  reorderImageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  reorderImageItem: {
    width: '22%',
    aspectRatio: 1,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
    position: 'relative',
  },
  reorderImageItemSelected: {
    borderColor: currentTheme.colors.error,
  },
  reorderImageThumbnail: {
    width: '100%',
    height: '100%',
  },
  reorderNumberBadge: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reorderNumberText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  reorderModalFooter: {
    flexDirection: 'row',
    gap: 10,
  },
  reorderCancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  reorderApplyButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  reorderCancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  reorderApplyButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },

  // Clear All Modal Styles
  clearAllModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  clearAllModalContent: {
    width: '85%',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  clearAllModalIconContainer: {
    marginBottom: 15,
  },
  clearAllModalIcon: {
    fontSize: 48,
  },
  clearAllModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  clearAllModalMessage: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  clearAllModalButtons: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  clearAllModalCancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  clearAllModalConfirmButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  clearAllModalCancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  clearAllModalConfirmButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },

  // Featured Success Modal Styles
  featuredSuccessModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  featuredSuccessModalContent: {
    width: '85%',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  featuredSuccessModalIconContainer: {
    marginBottom: 15,
  },
  featuredSuccessModalIcon: {
    fontSize: 48,
  },
  featuredSuccessModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  featuredSuccessModalMessage: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 22,
  },
  featuredSuccessModalButton: {
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 25,
    minWidth: 120,
  },
  featuredSuccessModalButtonText: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },

  // Camera Mode Modal Styles
  cameraModeOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  cameraModeContent: {
    width: '90%',
    maxHeight: '70%',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  cameraModeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: currentTheme.colors.border,
  },
  cameraModeTitle: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  cameraModeCloseButton: {
    padding: 5,
  },
  cameraModeCloseText: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  cameraModeInfo: {
    backgroundColor: currentTheme.colors.background,
    padding: 10,
    borderRadius: 6,
    marginBottom: 12,
  },
  cameraModeInfoText: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  cameraImagesContainer: {
    marginBottom: 15,
  },
  cameraImagesTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  cameraImageItem: {
    marginRight: 8,
    position: 'relative',
  },
  cameraImageThumbnail: {
    width: 60,
    height: 60,
    borderRadius: 6,
  },
  cameraImageRemoveButton: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: currentTheme.colors.error,
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraImageRemoveText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  cameraModeButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 5,
  },
  cameraModeButton: {
    flex: 1,
    minWidth: '30%',
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraTakeButton: {
    // backgroundColor set dynamically
  },
  cameraContinuousButton: {
    // backgroundColor set dynamically
  },
  cameraStopButton: {
    // backgroundColor set dynamically
  },
  cameraFinishButton: {
    // backgroundColor set dynamically
  },
  cameraModeButtonIcon: {
    fontSize: 16,
    marginBottom: 2,
  },
  cameraModeButtonText: {
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
  },

  imageScrollView: {
    width: '100%',
    height: '100%',
  },
  imageWrapper: {
    width: screenWidth - 40, // Content width
    height: '100%',
  },
  mainImage: {
    width: '100%',
    height: '100%',
  },
  imageIndicators: {
    position: 'absolute',
    bottom: 15,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  indicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.5)', // Pasif dot'lar beyaz şeffaf
    marginHorizontal: 4,
  },
  indicatorActive: {
    backgroundColor: currentTheme.colors.error || '#DC143C', // Aktif dot kırmızı
  },
  imageCounterBadge: {
    position: 'absolute',
    bottom: 15,
    left: 20,
    backgroundColor: currentTheme.colors.error || '#DC143C', // Kırmızı badge
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6, // Radius azaltıldı
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  imageCounterText: {
    color: '#FFFFFF', // Her iki temada beyaz
    fontSize: 14,
    fontWeight: '600',
  },

  // Property Card
  propertyCard: {
    backgroundColor: 'transparent',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 0,
    position: 'relative',
  },
  // Absolute gradient background inside property card
  propertyCardGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: 'none',
  },

  // Title Section
  titleSection: {
    marginBottom: 20,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  propertyTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  propertyTitleIcon: {
    width: 24,
    height: 24,
    tintColor: currentTheme.colors.error || '#DC143C',
    marginRight: 10,
  },
  propertyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: currentTheme.colors.text,
    flex: 1,
  },
  editableTitle: {
    borderWidth: 1,
    borderColor: currentTheme.colors.primary || '#007AFF',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: currentTheme.colors.background,
    marginRight: 8,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  addressIcon: {
    width: 16,
    height: 16,
    tintColor: currentTheme.colors.error || '#DC143C',
    marginRight: 8,
  },
  addressText: {
    fontSize: 16,
    color: currentTheme.colors.text,
    opacity: 0.8,
  },
  titleLeftIcon: {
    width: 20,
    height: 20,
    tintColor: currentTheme.colors.error,
    marginRight: 8,
  },
  shareButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: currentTheme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 15,
  },
  shareIcon: {
    width: 20,
    height: 20,
    tintColor: 'white',
  },
  priceSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  priceLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  saleRentBadge: {
    backgroundColor: currentTheme.colors.error || '#DC143C',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  saleRentText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  titleSection: {
    marginBottom: 20,
  },
  crimsonDivider: {
    height: 2,
    backgroundColor: currentTheme.colors.error || '#DC143C',
    borderRadius: 1,
    marginTop: 20,
    marginBottom: 5,
  },
  price: {
    fontSize: 28,
    fontWeight: 'bold',
    color: currentTheme.colors.primary,
    marginRight: 8,
  },
  priceNumber: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  priceSymbol: {
    fontSize: 28,
    fontWeight: 'bold',
    color: currentTheme.colors.error || '#DC143C',
  },

  // Gallery Section
  gallerySection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: currentTheme.colors.text,
    marginBottom: 15,
    marginTop: 1,
  },
  priceIcon: {
    width: 18,
    height: 18,
    tintColor: currentTheme.colors.error,
    marginRight: 8,
  },
  galleryScroll: {
    marginHorizontal: -5,
  },
  galleryContent: {
    paddingHorizontal: 5,
  },
  galleryItem: {
    width: 80,
    height: 80,
    borderRadius: 12,
    overflow: 'hidden',
    marginHorizontal: 5,
  },
  galleryImage: {
    width: '100%',
    height: '100%',
  },

  // Description Section
  descriptionSection: {
    marginBottom: 15,
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
    color: currentTheme.colors.textSecondary,
  },
  readMoreButton: {
    marginTop: 8,
  },
  readMoreText: {
    fontSize: 16,
    color: currentTheme.colors.primary,
    fontWeight: '600',
  },

  // Features Section
  featuresSection: {
    marginBottom: 0,
  },
  additionalFeaturesSection: {
    marginTop: 0,
    marginBottom: 15,
  },
  additionalFeaturesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  leftColumn: {
    width: '100%',
  },
  additionalFeatureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '48%',
    marginBottom: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(20, 35, 49, 0.72)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(220, 20, 60, 0.16)',
  },
  additionalFeatureIcon: {
    width: 16,
    height: 16,
    tintColor: '#FFFFFF',
    marginRight: 8,
  },
  additionalFeatureText: {
    fontSize: 14,
    color: '#FFFFFF',
    flex: 1,
  },
  featureRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  featureItem: {
    alignItems: 'center',
    flex: 1,
  },
  featureIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  featureIconImage: {
    width: 22,
    height: 22,
    tintColor: currentTheme.colors.error,
    marginBottom: 8,
  },
  featureValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: currentTheme.colors.text,
    marginBottom: 4,
  },
  featureLabel: {
    fontSize: 14,
    color: currentTheme.colors.textSecondary,
    textAlign: 'center',
  },

  // 4'lü özellikler için yeni stiller
  featureRowFourContainer: {
    backgroundColor: currentTheme.colors.error,
    borderRadius: 16,
    paddingVertical: 15,
    paddingHorizontal: 20,
    marginHorizontal: 0,
    marginBottom: 20,
  },
  featureRowFour: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 5,
  },
  featureItemFour: {
    alignItems: 'center',
    flex: 1,
    minWidth: 70,
    position: 'relative',
    marginHorizontal: 15,
  },
  featureIconImageSmall: {
    width: 20,
    height: 20,
    tintColor: currentTheme.colors.white,
    marginBottom: 6,
    resizeMode: 'contain',
  },
  featureValueSmall: {
    fontSize: 15,
    fontWeight: 'bold',
    color: currentTheme.colors.white,
    marginBottom: 3,
    textAlign: 'center',
  },
  featureLabelSmall: {
    fontSize: 12,
    color: currentTheme.colors.white,
    textAlign: 'center',
    opacity: 0.9,
  },
  featureDividerVertical: {
    width: 1,
    height: 52,
    backgroundColor: currentTheme.colors.white,
    opacity: 0.8,
    marginHorizontal: 50,
  },

  // Feature divider between top 4 and additional features
  featureDivider: {
    height: 1,
    backgroundColor: currentTheme.colors.error,
    marginHorizontal: 20,
    marginTop: 30,
    marginBottom: 15,
    opacity: 0.8,
  },

  // Location Section
  locationSection: {
    marginBottom: 15,
  },
  locationInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  locationIcon: {
    width: 16,
    height: 16,
    tintColor: currentTheme.colors.error || '#DC143C',
    marginRight: 8,
  },
  locationTitleContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 0,
  },
  locationTitleIcon: {
    width: 18,
    height: 18,
    tintColor: currentTheme.colors.error,
    marginRight: 8,
    marginTop: 3,
  },
  locationText: {
    fontSize: 16,
    color: currentTheme.colors.textSecondary,
    flex: 1,
  },
  
  // Map
  mapContainer: {
    height: 200,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#f0f0f0',
  },
  map: {
    width: '100%',
    height: '100%',
  },
  mapExpandButton: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    width: 37,
    height: 37,
    borderRadius: 8,
    backgroundColor: currentTheme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapExpandIcon: {
    width: 20,
    height: 20,
    tintColor: '#ffffff',
  },
  mapDirectionsButtonMini: {
    position: 'absolute',
    left: 10,
    bottom: 45,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    height: 32,
    borderRadius: 8,
    backgroundColor: currentTheme.colors.primary,
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  mapStreetViewButtonMini: {
    position: 'absolute',
    left: 10,
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    height: 32,
    borderRadius: 8,
    backgroundColor: currentTheme.colors.primary,
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  mapDirectionsIconMini: {
    width: 14,
    height: 14,
    tintColor: '#FFFFFF',
  },
  mapDirectionsTextMini: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  mapOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  mapOverlayCard: {
    width: '92%',
    height: '70%',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: currentTheme.colors.surface,
  },
  mapOverlayCloseButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 37,
    height: 37,
    borderRadius: 8,
    backgroundColor: currentTheme.colors.error || '#DC143C',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  mapOverlayCloseIcon: {
    width: 20,
    height: 20,
    tintColor: '#FFFFFF',
  },
  mapOverlayMap: {
    width: '100%',
    height: '100%',
  },
  mapOverlayButtonBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 12,
    alignItems: 'center',
    zIndex: 10,
  },
  mapOverlayButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  mapOverlayDirectionsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    height: 44,
    borderRadius: 8,
    backgroundColor: currentTheme.colors.primary,
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  mapOverlayDirectionsIcon: {
    width: 18,
    height: 18,
    tintColor: '#FFFFFF',
  },
  mapOverlayDirectionsText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  propertyCircleLayer: {
    circleRadius: 8,
    circleColor: currentTheme.colors.primary,
    circleStrokeWidth: 2,
    circleStrokeColor: '#FFFFFF',
    circleOpacity: 1,
  },

  // Action Buttons
  contactButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  whatsappButton: {
    flex: 1,
    paddingVertical: 14,
    backgroundColor: '#25D366',
    borderRadius: 12,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  phoneButton: {
    flex: 1,
    paddingVertical: 14,
    backgroundColor: currentTheme.colors.primary,
    borderRadius: 12,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  contactIcon: {
    width: 18,
    height: 18,
    tintColor: '#fff',
  },
  contactButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },

  // Owner
  ownerSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 12,
    backgroundColor: '#142331',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: currentTheme.colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  ownerAvatarWrapper: {
    width: 72,
    height: 72,
    borderRadius: 16,
    borderWidth: 3,
    borderColor: currentTheme.colors.error || '#DC143C',
    overflow: 'hidden',
    backgroundColor: currentTheme.colors.surface,
  },
  ownerAvatar: {
    width: '100%',
    height: '100%',
  },
  ownerAvatarPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ownerAvatarInitials: {
    fontSize: 24,
    fontWeight: '800',
    color: currentTheme.colors.error || '#DC143C',
  },
  ownerInfo: {
    flex: 1,
  },
  ownerName: {
    fontSize: 20,
    fontWeight: '900',
    color: currentTheme.colors.text,
  },
  ownerOfficeBadge: {
    alignSelf: 'flex-start',
    backgroundColor: currentTheme.colors.error,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 6,
  },
  ownerOfficeText: {
    fontSize: 16,
    fontWeight: '700',
    color: currentTheme.colors.white,
  },
  ownerPhone: {
    fontSize: 14,
    color: currentTheme.colors.primary,
    marginTop: 4,
    fontWeight: '600',
  },

  // Error styles
  headerSpacer: {
    width: 40,
  },
  headerActionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: screenWidth * 0.35, // Ekran genişliğinin maksimum %35'i
    zIndex: 9999, // Yönet paneli açıkken de tıklanabilir olsun
    elevation: 0, // Android için z-index
  },
  headerEditButton: {
    backgroundColor: currentTheme.colors.error, // Theme kırmızı rengi
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 8, // Rounded square
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
    minWidth: 70, // Minimum genişlik
    zIndex: 9999, // Yönet paneli açıkken de tıklanabilir olsun
    elevation: 0, // Android için z-index
  },
  headerEditText: {
    color: currentTheme.colors.white, // Theme beyaz rengi
    fontSize: 13,
    fontWeight: '600',
  },
  
  // Yönet Paneli Edit Butonu
  managePanelEditContainer: {
    paddingHorizontal: 15,
    paddingTop: 10,
  },
  managePanelEditButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  managePanelEditIcon: {
    width: 18,
    height: 18,
    tintColor: '#fff',
  },
  managePanelEditText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  headerDeleteButtonContainer: {
    marginRight: 6,
  },
  headerDeleteButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(220, 20, 60, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999, // Yönet paneli açıkken de tıklanabilir olsun
    elevation: 0, // Android için z-index
  },
  headerDeleteIcon: {
    width: 20,
    height: 20,
    tintColor: '#ffffff',
  },
  headerShareButton: {
    width: 37,
    height: 37,
    borderRadius: 8,
    backgroundColor: currentTheme.colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
    zIndex: 9999,
    elevation: 0,
  },
  headerFavoriteButton: {
    width: 37,
    height: 37,
    borderRadius: 8,
    backgroundColor: currentTheme.colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
    zIndex: 9999,
    elevation: 0,
  },
  headerFavoriteButtonActive: {
    backgroundColor: '#ffffff',
  },
  headerFavoriteIcon: {
    width: 20,
    height: 20,
    tintColor: '#ffffff',
  },
  headerFavoriteIconActive: {
    tintColor: currentTheme.colors.error,
  },
  
  // Edit Field Buttons
  editFieldButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: currentTheme.colors.error,
    borderRadius: 15,
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  editFieldIcon: {
    width: 14,
    height: 14,
    tintColor: '#ffffff',
  },
  sectionTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },

  // Edit Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 15,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  modalCloseButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 36,
    marginLeft: 10,
    width: 40,
    height: 36,
  },
  modalCloseText: {
    fontSize: 14,
    fontWeight: '600',
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 20,
  },
  modalTextArea: {
    height: 120,
    textAlignVertical: 'top',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalCancelButton: {
    // backgroundColor set dynamically
  },
  modalSaveButton: {
    // backgroundColor set dynamically
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  modalOptions: {
    gap: 10,
    marginBottom: 20,
  },
  modalOption: {
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  modalOptionText: {
    fontSize: 16,
    fontWeight: '600',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 50,
  },
  errorText: {
    fontSize: 18,
    textAlign: 'center',
  },

  // Modal Styles
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCloseButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 30,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: currentTheme.colors.error || '#DC143C', // Kırmızı arkaplan
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  modalCloseText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  modalImageWrapper: {
    width: screenWidth,
    height: screenHeight * 0.8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalImageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
    overflow: 'hidden',
  },
  modalImageAnimated: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalImageTouchable: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalImageTransform: {
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
    overflow: 'hidden',
  },
  modalImage: {
    width: screenWidth,
    height: screenHeight * 0.8,
    borderRadius: 20,
  },
  
  // Modal Gallery Styles
  modalGallery: {
    position: 'absolute',
    bottom: 20,
    left: 0,
    right: 0,
    height: 80,
  },
  modalGalleryScroll: {
    paddingHorizontal: 20,
  },
  modalGalleryContent: {
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  modalGalleryItem: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginHorizontal: 5,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  modalGalleryItemActive: {
    borderColor: currentTheme.colors.error || '#DC143C',
    borderWidth: 3,
  },
  modalGalleryImage: {
    width: '100%',
    height: '100%',
  },

  // Manage Widget Styles (KORUNUYOR)
  manageWidget: {
    position: 'absolute',
    right: 0,
    top: '35%',
    zIndex: 999,
  },
  manageWidgetButton: {
    backgroundColor: (currentTheme.colors.primary || '#DC143C') + 'CC',
    width: 50,
    alignItems: 'center',
    paddingVertical: 40, // 25'ten 40'a artırdık
    paddingHorizontal: 6,
    borderTopLeftRadius: 20,
    borderBottomLeftRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: -2, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 0,
  },
  manageWidgetIcon: {
    width: 11,
    height: 11,
    tintColor: '#ffffff',
    transform: [{ rotate: '-90deg' }],
  },
  manageWidgetIconBelowText: {
    marginTop: 10,
  },
  manageWidgetText: {
    color: '#ffffff',
    fontSize: 13,
    lineHeight: 15,
    letterSpacing: -0.2,
    fontWeight: 'bold',
    transform: [{ rotate: '-90deg' }],
    textAlign: 'center',
    width: '100%',
    paddingHorizontal: 0,
    marginHorizontal: 0,
    includeFontPadding: false,
  },

  // Manage Panel Styles (KORUNUYOR)
  managePanelOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000, // Header (10000) bundan yüksek
  },
  managePanelBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  managePanel: {
    position: 'absolute',
    right: 0,
    width: 250,
    borderTopLeftRadius: 20,
    borderBottomLeftRadius: 20,
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
    shadowColor: '#000',
    shadowOffset: { width: -3, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 15,
  },
  managePanelGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 20,
    borderBottomLeftRadius: 20,
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
    pointerEvents: 'none',
  },
  managePanelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderTopLeftRadius: 20,
  },
  managePanelTitle: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  managePanelClose: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  managePanelCloseText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  managePanelContent: {
    flex: 1,
    paddingTop: 5,
  },
  // Matched Requests Cards
  matchedCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  matchedCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  matchedAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 10,
  },
  matchedOwnerInfo: {
    flex: 1,
  },
  matchedOwnerName: {
    fontSize: 13,
    fontWeight: '700',
  },
  matchedOwnerOffice: {
    fontSize: 11,
    fontWeight: '500',
  },
  matchedBody: {
    gap: 8,
  },
  matchedTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  matchedInfoGrid: {
    gap: 6,
  },
  matchedInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  matchedLabel: {
    fontSize: 11,
    fontWeight: '600',
    opacity: 0.85,
  },
  matchedValue: {
    fontSize: 12,
    fontWeight: '600',
    maxWidth: 170,
    textAlign: 'right',
  },
  matchedActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  matchedPrimaryButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchedPrimaryButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  matchedSecondaryButton: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchedSecondaryButtonText: {
    fontSize: 12,
    fontWeight: '700',
  },

  // Request Overlay
  requestOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1100,
  },
  requestOverlayBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  requestOverlayCard: {
    position: 'absolute',
    left: 20,
    right: 20,
    top: screenHeight * 0.125,
    maxHeight: screenHeight * 0.75,
    borderRadius: 16,
    minHeight: 220,
    overflow: 'hidden',
  },
  requestOverlayGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 16,
  },
  requestOverlayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  requestOverlayTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  requestOverlayClose: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestOverlayIconCloseButton: {
    width: 28,
    height: 28,
    aspectRatio: 1,
    borderRadius: 8,
    backgroundColor: 'crimson',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    flexShrink: 0,
  },
  requestOverlayCloseIcon: {
    width: 12,
    height: 12,
    tintColor: 'white',
  },
  requestOverlayCloseText: {
    fontSize: 16,
    fontWeight: '900',
  },
  requestOverlayContent: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 10,
  },
  requestOverlayOwnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  requestOverlayAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  requestOverlayOwnerName: {
    fontSize: 14,
    fontWeight: '700',
  },
  requestOverlayOwnerOffice: {
    fontSize: 12,
    fontWeight: '500',
  },
  requestOverlayGrid: {
    gap: 6,
    marginTop: 6,
  },
  requestOverlayGridRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  requestOverlayLabel: {
    fontSize: 12,
    fontWeight: '600',
    opacity: 0.85,
  },
  requestOverlayValue: {
    fontSize: 13,
    fontWeight: '700',
    maxWidth: 200,
    textAlign: 'right',
  },
  requestOverlayFooter: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    paddingTop: 6,
    alignItems: 'stretch',
  },
  requestOverlayFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  requestOverlayCloseButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DC143C',
  },
  requestOverlayCallButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestOverlayWhatsAppButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#25D366',
  },
  requestOverlayButtonTextWhite: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
  managePanelArrow: {
    fontSize: 16,
    fontWeight: 'bold',
  },

  // Panel Buttons (KORUNUYOR)
  managePanelButtonsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 15,
    paddingVertical: 15,
    gap: 10,
  },
  managePanelActionButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  managePanelActionIcon: {
    fontSize: 20,
    marginBottom: 4,
  },
  managePanelActionText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  managePanelDivider: {
    height: 1,
    marginHorizontal: 15,
    marginVertical: 5,
  },

  // Owner Info (KORUNUYOR)
  managePanelOwnerInfo: {
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  managePanelOwnerInfoTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  managePanelOwnerInfoWarning: {
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 12,
    fontStyle: 'italic',
  },
  managePanelOwnerDetails: {
    gap: 10,
  },
  managePanelOwnerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  managePanelOwnerBadgeIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  managePanelOwnerBadgeIconText: {
    fontSize: 14,
  },
  managePanelOwnerBadgeContent: {
    flex: 1,
  },
  managePanelOwnerBadgeLabel: {
    fontSize: 11,
    fontWeight: '500',
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  managePanelOwnerBadgeValue: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 16,
  },

  // Request Section (KORUNUYOR)
  managePanelRequestContainer: {
    paddingHorizontal: 15,
    paddingVertical: 15,
  },
  requestActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
  },
  requestButtonPrimary: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: currentTheme.colors.primary,
  },
  requestButtonSecondary: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#28a745',
  },
  requestButtonDisabled: {
    backgroundColor: currentTheme.colors.border,
  },
  requestButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  managePanelRequestTitle: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
  },
  managePanelRequestSubtitle: {
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 16,
  },
  managePanelRequestButton: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  managePanelRequestIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  managePanelRequestButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  managePanelRequestDescription: {
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 14,
  },
  managePanelRequestInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 15,
    paddingVertical: 12,
    marginHorizontal: 15,
    marginTop: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  managePanelRequestInfoIcon: {
    fontSize: 16,
    marginRight: 10,
    marginTop: 1,
  },
  managePanelRequestInfoText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 15,
  },

  // Yeni şık status card stilleri
  managePanelStatusCard: {
    marginHorizontal: 0,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  managePanelStatusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  managePanelStatusTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  managePanelStatusBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  managePanelStatusBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  managePanelStatusDescription: {
    fontSize: 12,
    lineHeight: 16,
  },



  // Action Card stilleri (İzin İste & Müşteriyle Paylaş)
  managePanelActionCard: {
    marginHorizontal: 15,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  managePanelActionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  managePanelActionTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  managePanelActionBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  managePanelActionBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  managePanelActionDescription: {
    fontSize: 12,
    lineHeight: 16,
  },

  // Share Link Modal Styles
  shareLinkModalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  shareLinkModalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  shareLinkModalContent: {
    width: '92%',
    maxWidth: 500,
    padding: 25,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 15,
    elevation: 10,
  },
  shareLinkModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  shareLinkModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    flex: 1,
  },
  shareLinkModalCloseButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  shareLinkModalCloseText: {
    fontSize: 18,
    fontWeight: '600',
  },
  shareLinkModalMessage: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 20,
  },
  shareLinkModalUrlContainer: {
    padding: 15,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 25,
  },
  shareLinkModalUrlText: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: '#FFFFFF',
  },
  shareLinkModalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  shareLinkModalButton: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareLinkModalButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  shareLinkModalSecondaryButton: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareLinkModalSecondaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },

  // Permissions Management Modal Styles
  permissionsModalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  permissionsModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  permissionsModalContent: {
    height: '80%',
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.25,
    shadowRadius: 15,
    elevation: 10,
  },
  permissionsModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  permissionsModalTitle: {
    fontSize: 22,
    fontWeight: '700',
    flex: 1,
  },
  permissionsModalCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  permissionsModalCloseText: {
    fontSize: 20,
    fontWeight: '600',
  },
  permissionsModalSubtitle: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 20,
  },
  permissionsModalList: {
    flex: 1,
    marginBottom: 20,
  },
  permissionsModalEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  permissionsModalEmptyIcon: {
    fontSize: 48,
    marginBottom: 15,
  },
  permissionsModalEmptyText: {
    fontSize: 16,
    textAlign: 'center',
    fontWeight: '500',
  },
  permissionsModalItem: {
    marginBottom: 12,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  permissionsModalItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  permissionsModalItemInfo: {
    flex: 1,
  },
  permissionsModalItemName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  permissionsModalItemEmail: {
    fontSize: 14,
    marginBottom: 4,
  },
  permissionsModalItemDate: {
    fontSize: 12,
  },
  permissionsModalItemRemoveButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  permissionsModalItemRemoveText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  permissionsModalFooter: {
    paddingTop: 10,
  },
  permissionsModalCloseFooterButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionsModalCloseFooterButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },

  // Revoke Permission Confirmation Modal Styles
  revokeModalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  revokeModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  revokeModalContent: {
    width: '100%',
    maxWidth: 380,
    padding: 30,
    borderRadius: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 15,
    elevation: 10,
  },
  revokeModalIconContainer: {
    marginBottom: 20,
  },
  revokeModalIcon: {
    fontSize: 48,
  },
  revokeModalTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 15,
    textAlign: 'center',
  },
  revokeModalMessage: {
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: 20,
  },
  revokeModalWarning: {
    padding: 15,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 25,
    width: '100%',
  },
  revokeModalWarningText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    fontWeight: '500',
  },
  revokeModalButtons: {
    flexDirection: 'row',
    gap: 15,
    width: '100%',
  },
  revokeModalCancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  revokeModalCancelText: {
    fontSize: 16,
    fontWeight: '600',
  },
  revokeModalConfirmButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  revokeModalConfirmText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },

  // Permissions (KORUNUYOR)
  managePanelPermissionsContainer: {
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  managePanelPermissionsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  managePanelPermissionsIcon: {
    fontSize: 20,
    marginRight: 12,
    width: 24,
    textAlign: 'center',
  },
  managePanelPermissionsContent: {
    flex: 1,
  },
  managePanelPermissionsTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  managePanelPermissionsSubtitle: {
    fontSize: 11,
    lineHeight: 14,
  },

  // Request Feedback Modal (KORUNUYOR)
  requestFeedbackModalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  requestFeedbackModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  requestFeedbackModalContent: {
    width: '100%',
    maxWidth: 400,
    padding: 25,
    borderRadius: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
  },
  requestFeedbackModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
  },
  requestFeedbackModalMessage: {
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: 25,
  },
  requestFeedbackModalButton: {
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 25,
    minWidth: 100,
  },
  requestFeedbackModalButtonText: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },

  // Share Modal styles
  shareModal: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 20,
  },
  shareModalContent: {
    backgroundColor: 'transparent',
    borderRadius: 20,
    padding: 24,
    width: '85%',
    maxWidth: 360,
    alignItems: 'center',
  },
  shareModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
    color: currentTheme.colors.text,
  },
  shareModalSubtitle: {
    fontSize: 14,
    color: currentTheme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  shareModalButton: {
    backgroundColor: currentTheme.colors.error,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    marginVertical: 6,
    width: '100%',
  },
  shareModalButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  shareModalSecondaryButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    marginVertical: 6,
    width: '100%',
  },
  shareModalSecondaryButtonText: {
    color: currentTheme.colors.white,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  shareModalCancelButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 16,
    width: '100%',
  },
  shareModalCancelText: {
    color: currentTheme.colors.white,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },

  // Success Modal Styles
  successModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  successModalContent: {
    backgroundColor: currentTheme.colors.surface,
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    maxWidth: 320,
    width: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
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
    color: currentTheme.colors.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  successMessage: {
    fontSize: 16,
    color: currentTheme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  
  // Copy Success Modal (match RequestList proportions)
  successModalContainer: {
    width: '75%',
    maxWidth: 300,
    borderRadius: 16,
    padding: 32,
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successIconImage: {
    width: 36,
    height: 36,
    tintColor: '#ffffff',
    resizeMode: 'contain',
  },

  // Picker Modal Stilleri (AddPortfolio.js'den kopyalandı)
  modalOverlayPicker: {
    flex: 1,
    backgroundColor: currentTheme.colors.overlay || 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainerPicker: {
    backgroundColor: currentTheme.colors.surface,
    borderRadius: 16,
    width: '90%',
    maxHeight: '70%',
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  modalHeaderPicker: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: currentTheme.colors.border,
  },
  modalTitlePicker: {
    fontSize: 20,
    fontWeight: 'bold',
    color: currentTheme.colors.text,
  },
  modalCloseTextPicker: {
    fontSize: 20,
    color: currentTheme.colors.text,
  },
  neighborhoodItemPicker: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: currentTheme.colors.border,
  },
  neighborhoodTextPicker: {
    fontSize: 18,
    color: currentTheme.colors.text,
  },

  // Küçük Modal Stilleri (AddPortfolio.js'deki renderFullWidthPicker stili)
  modalContainerSmall: {
    backgroundColor: currentTheme.colors.surface,
    borderRadius: 16,
    width: '80%',
    maxHeight: '40%',
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  fullWidthPickerContainer: {
    flexDirection: 'row',
    padding: 20,
    gap: 10,
  },
  fullWidthPickerOption: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: currentTheme.colors.inputBg || '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 42,
  },
  fullWidthPickerOptionActive: {
    backgroundColor: currentTheme.colors.error || '#DC143C',
  },
  fullWidthPickerOptionText: {
    fontSize: 16,
    color: currentTheme.colors.text,
    textAlign: 'center',
  },
  fullWidthPickerOptionTextActive: {
    color: currentTheme.colors.white || '#FFFFFF',
    fontWeight: 'bold',
  },

  // Delete Modal Styles
  deleteModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  deleteModalContent: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 16,
    padding: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  deleteModalHeader: {
    padding: 24,
    paddingBottom: 16,
    alignItems: 'center',
  },
  deleteModalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  deleteModalBody: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  deleteModalMessage: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 24,
  },
  deleteModalWarning: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  deleteModalButtons: {
    flexDirection: 'row',
    padding: 24,
    paddingTop: 0,
    gap: 12,
  },
  deleteModalCancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteModalCancelText: {
    fontSize: 16,
    fontWeight: '600',
  },
  deleteModalConfirmButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteModalConfirmText: {
    fontSize: 16,
    fontWeight: '600',
  },
});

export default memo(PropertyDetail);