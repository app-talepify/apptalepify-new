import React, { useState, useEffect, useCallback, memo, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Image,
  Modal,
  Animated,
  ImageBackground,
  Dimensions,
  ScrollView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { theme } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import { fetchUserRequests, toggleRequestPublishStatus, updateRequest, deleteRequest } from '../services/firestore';
// Contact buttons removed for own requests; phone/whatsapp utils not needed here
import ListingCard from '../components/ListingCard';
import GlassmorphismView from '../components/GlassmorphismView';
import * as Animatable from 'react-native-animatable';
import { getMatchingPortfoliosForRequest } from '../utils/requestMatching';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { fetchUserPortfolios } from '../services/firestore';

const { height: screenHeight, width: screenWidth } = Dimensions.get('window');

const customEnterAnimation = {
  from: {
    opacity: 0,
    scale: 0.95,
  },
  to: {
    opacity: 1,
    scale: 1,
  },
};

const customExitAnimation = {
  from: {
    opacity: 1,
    scale: 1,
  },
  to: {
    opacity: 0,
    scale: 0.95,
  },
};

const RequestList = () => {
  const { theme: currentTheme, isDark } = useTheme();
  const styles = useMemo(() => stylesFactory(currentTheme, isDark), [currentTheme, isDark]);
  const navigation = useNavigation();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight ? useBottomTabBarHeight() : 0;
  const listRef = useRef(null);
  const listScrollOffsetRef = useRef(0);
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState([]);
  const [expandedCards] = useState(new Set());
  const [confirmModal, setConfirmModal] = useState({ visible: false, requestId: null, newStatus: false });
  const [resultModal, setResultModal] = useState({ visible: false, title: '', message: '' });
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const successScaleAnim = useRef(new Animated.Value(0)).current;
  const successTimerRef = useRef(null);
  // ownerPhones removed; contact actions not needed on own requests
  const didAnimateCardsRef = useRef(false);
  const viewRef = useRef(null);
  const isFirstFocusRef = useRef(true);
  const [showList, setShowList] = useState(false);
  const [hasAnimatedOnce, setHasAnimatedOnce] = useState(false);
  // Tarih filtresi: 'today' | 'yesterday' | '7' | '15' | null (varsayılan: filtre yok)
  const [selectedPeriod, setSelectedPeriod] = useState(null);
  // Filtre geçiş animasyonları
  const listFadeAnim = useRef(new Animated.Value(1)).current;
  const listTranslateAnim = useRef(new Animated.Value(0)).current;
  const chipPressScale = useRef(new Animated.Value(1)).current;
  const [pressingKey, setPressingKey] = useState(null);
  // Öncelik filtresi: null (hepsi) | 'normal' | 'priority' | 'urgent'
  const [priorityFilter, setPriorityFilter] = useState(null);
  const [pressingPriorityKey, setPressingPriorityKey] = useState(null);
  const priorityChipPressScale = useRef(new Animated.Value(1)).current;
  // Süresi biten talepler paneli
  const [showExpiredPanel, setShowExpiredPanel] = useState(false);
  const [expiredPanelAnim] = useState(new Animated.Value(250));
  // Yan panelden açılan talep detay overlay (merkez modal)
  const [showExpiredDetail, setShowExpiredDetail] = useState(false);
  const expiredDetailOpacity = useRef(new Animated.Value(0)).current;
  const expiredDetailScale = useRef(new Animated.Value(0.95)).current;
  const expiredDetailAnim = useRef(new Animated.Value(0)).current;
  const [selectedExpiredRequest, setSelectedExpiredRequest] = useState(null);
  // Kaldırılmış talepler paneli
  const [showArchivedPanel, setShowArchivedPanel] = useState(false);
  const [archivedPanelAnim] = useState(new Animated.Value(250));
  const [reactivateConfirmVisible, setReactivateConfirmVisible] = useState(false);

  // Cleanup success timer on unmount
  useEffect(() => {
    return () => {
      if (successTimerRef.current) {
        try { clearTimeout(successTimerRef.current); } catch {}
        successTimerRef.current = null;
      }
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      // İlk odaklanmada veri yüklenmemişse animasyonu ertele (loading effect tetikleyecek)
      if (isFirstFocusRef.current) {
        if (!loading && viewRef.current) {
          if (!showList) setShowList(true);
          try {
            viewRef.current
              .animate(customEnterAnimation, 600)
              .then(() => setHasAnimatedOnce(true));
          } catch {}
          isFirstFocusRef.current = false;
        }
      } else {
        if (viewRef.current) {
          try {
            viewRef.current
              .animate(customEnterAnimation, 600)
              .then(() => setHasAnimatedOnce(true));
          } catch {}
        }
      }
      return () => {
        if (viewRef.current) {
          viewRef.current.animate(customExitAnimation, 200);
        }
      };
    }, [loading, showList])
  );

  // İlk veri yüklemesi tamamlandığında (loading -> false) ve ekran ilk kez odaklıyken animasyon çalışsın
  useEffect(() => {
    if (!loading && isFirstFocusRef.current) {
      if (!showList) setShowList(true);
      try {
        if (viewRef.current) {
          viewRef.current
            .animate(customEnterAnimation, 600)
            .then(() => setHasAnimatedOnce(true));
          isFirstFocusRef.current = false;
        }
      } catch {}
    }
  }, [loading, showList]);

  // Süresi biten panel aç/kapat
  const toggleExpiredPanel = useCallback(() => {
    if (showExpiredPanel) {
      Animated.timing(expiredPanelAnim, {
        toValue: 250,
        duration: 300,
        useNativeDriver: true,
      }).start(() => setShowExpiredPanel(false));
    } else {
      setShowExpiredPanel(true);
      expiredPanelAnim.setValue(250);
      Animated.timing(expiredPanelAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [showExpiredPanel, expiredPanelAnim]);

  // Kaldırılmış panel aç/kapat
  const toggleArchivedPanel = useCallback(() => {
    if (showArchivedPanel) {
      Animated.timing(archivedPanelAnim, {
        toValue: 250,
        duration: 300,
        useNativeDriver: true,
      }).start(() => setShowArchivedPanel(false));
    } else {
      setShowArchivedPanel(true);
      archivedPanelAnim.setValue(250);
      Animated.timing(archivedPanelAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [showArchivedPanel, archivedPanelAnim]);

  // Süresi biten talep hesaplama:
  // - Açıkça aktif/gizli işaretli ise expired sayma
  // - Açıkça expired işaretli ise expired say
  // - Aksi halde tarih tabanlı hesap: expiry alanları || (updatedAt || createdAt) + 20 gün
  const isRequestExpired = useCallback((req) => {
    try {
      if (!req) return false;
      if (req.status === 'active' || req.isArchived === true) return false;
      if (req.isExpired === true || req.status === 'expired') return true;
      const now = Date.now();
      const candidates = [
        req.expiresAt, req.expirationDate, req.deadline, req.validUntil, req.until, req.endDate,
      ].map(v => (v instanceof Date ? v.getTime() : (v ? new Date(v).getTime() : null))).filter(Boolean);
      const expiryTs = candidates.length > 0 ? Math.min(...candidates) : null;
      if (expiryTs) return expiryTs < now;
      const updatedTs = req?.updatedAt ? (req.updatedAt instanceof Date ? req.updatedAt.getTime() : new Date(req.updatedAt).getTime()) : null;
      const createdTs = req?.createdAt ? (req.createdAt instanceof Date ? req.createdAt.getTime() : new Date(req.createdAt).getTime()) : null;
      const baseTs = updatedTs || createdTs;
      if (!baseTs) return false;
      const twentyDaysMs = 20 * 24 * 60 * 60 * 1000;
      return baseTs + twentyDaysMs < now;
    } catch {
      return false;
    }
  }, []);

  const expiredRequests = useMemo(() => (requests || []).filter(isRequestExpired), [requests, isRequestExpired]);
  const archivedRequests = useMemo(() => (requests || []).filter(r => r?.status === 'archived' || r?.isArchived === true), [requests]);

  // Yan panel içi: detay overlay aç/kapat
  const openExpiredDetail = useCallback((req) => {
    setSelectedExpiredRequest(req);
    setShowExpiredDetail(true);
    expiredDetailAnim.setValue(0);
    Animated.timing(expiredDetailAnim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [expiredDetailAnim]);

  const closeExpiredDetail = useCallback(() => {
    Animated.timing(expiredDetailAnim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => {
      setShowExpiredDetail(false);
      setSelectedExpiredRequest(null);
    });
  }, [expiredDetailAnim]);

  const handleDeleteRequestNow = useCallback(async () => {
    try {
      const id = selectedExpiredRequest?.id;
      if (!id) return;
      await deleteRequest(id);
      setRequests(prev => (prev || []).filter(r => r.id !== id));
      closeExpiredDetail();
    } catch (e) {
      // no-op
    }
  }, [selectedExpiredRequest?.id, closeExpiredDetail]);

  const handleReactivateRequest = useCallback(async (publishToPool) => {
    try {
      const id = selectedExpiredRequest?.id;
      if (!id) return;
      const payload = {
        status: 'active',
        isPublished: !!publishToPool,
        publishToPool: !!publishToPool,
        isExpired: false,
        isArchived: false,
        updatedAt: new Date(), // UI tarafında anında expired hesaplaması için
        createdAt: new Date(), // Yeniden aktif edildiği anı baz al
      };
      await updateRequest(id, payload);
      setRequests(prev => (prev || []).map(r => (r.id === id ? { ...r, ...payload } : r)));
      setReactivateConfirmVisible(false);
      closeExpiredDetail();
    } catch (e) {
      setReactivateConfirmVisible(false);
    }
  }, [selectedExpiredRequest?.id, closeExpiredDetail]);

  // Gradient config for success modal (same system as cards)
  const successModalGlassConfig = useMemo(() => ({
    overlayColor: 'rgba(224, 220, 220, 0.81)',
    startColor: 'rgb(220, 20, 60)',
    endColor: 'rgb(17, 36, 49)',
    gradientAlpha: 1,
    gradientDirection: 150,
    gradientSpread: 2,
    ditherStrength: 5.0,
  }), []);

  // Expired detail modal glass config (same style as NotificationOverlay)
  const expiredDetailGlassConfig = useMemo(() => ({
    overlayColor: 'rgba(224, 220, 220, 0.81)',
    startColor: isDark ? 'rgb(26, 56, 77)' : '#FFFFFF',
    endColor: isDark ? 'rgb(17, 36, 49)' : '#F5F6F8',
    gradientAlpha: 1,
    gradientDirection: 175,
    gradientSpread: 25,
    ditherStrength: 4.0,
  }), [isDark]);

  // Silinmeye kalan gün (toplam 45 gün kuralı)
  const getDeletionCountdownDays = useCallback((req) => {
    try {
      const now = Date.now();
      const createdTs = req?.createdAt ? (req.createdAt instanceof Date ? req.createdAt.getTime() : new Date(req.createdAt).getTime()) : null;
      if (!createdTs) return null;
      const deletionTs = createdTs + (45 * 24 * 60 * 60 * 1000);
      const diffMs = deletionTs - now;
      const days = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
      return Math.max(0, days);
    } catch {
      return null;
    }
  }, []);

  // Load user requests on component mount
  useEffect(() => {
    if (user && user.uid) {
      loadUserRequests();
    } else {
      setLoading(false);
    }
  }, [user, loadUserRequests]);

  const loadUserRequests = useCallback(async () => {
    if (!user || !user.uid) {
      return;
    }

    try {
      setLoading(true);
      const data = await fetchUserRequests(user.uid);
      setRequests(data);
      // Contact info fetching removed (not needed for own requests)
    } catch (error) {
      setResultModal({ visible: true, title: 'Hata', message: 'Talepler yüklenirken bir hata oluştu.' });
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Tarih aralığı hesaplayıcı (Home ile aynı mantık)
  const getPeriodBounds = useCallback((key) => {
    const now = new Date();
    const start = new Date();
    const end = new Date();
    const toStartOfDay = (d) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
    const toEndOfDay = (d) => { const x = new Date(d); x.setHours(23,59,59,999); return x; };
    switch (key) {
      case 'today':
        return { start: toStartOfDay(now), end: toEndOfDay(now) };
      case 'yesterday': {
        // Son 3 gün: bugün dahil son 3 günü kapsa
        const s = new Date(now); s.setDate(now.getDate() - 2);
        return { start: toStartOfDay(s), end: toEndOfDay(now) };
      }
      case '7': {
        const s = new Date(now); s.setDate(now.getDate() - 6);
        return { start: toStartOfDay(s), end: toEndOfDay(now) };
      }
      case '15': {
        const s = new Date(now); s.setDate(now.getDate() - 14);
        return { start: toStartOfDay(s), end: toEndOfDay(now) };
      }
      default:
        return { start: toStartOfDay(now), end: toEndOfDay(now) };
    }
  }, []);

  const safeToDate = (v) => {
    try { if (!v) return null; return v instanceof Date ? v : new Date(v); } catch { return null; }
  };

  // Seçili tarih aralığına göre filtrelenmiş liste
  const filteredRequests = useMemo(() => {
    // Varsayılan: filtre yok, tüm talepler
    if (!selectedPeriod) {
      return requests || [];
    }
    const { start, end } = getPeriodBounds(selectedPeriod);
    return (requests || []).filter((r) => {
      const dt = safeToDate(r?.createdAt);
      return dt && dt >= start && dt <= end;
    });
  }, [requests, selectedPeriod, getPeriodBounds]);

  // Öncelik (aciliyet) filtresini uygula
  const priorityFilteredRequests = useMemo(() => {
    if (!priorityFilter) return filteredRequests;
    return (filteredRequests || []).filter((r) => {
      const value = (r?.priority || 'normal').toLowerCase();
      if (priorityFilter === 'normal') return value === 'normal' || !r?.priority;
      if (priorityFilter === 'priority') return value === 'priority' || value === 'öncelikli' || value === 'oncelikli';
      if (priorityFilter === 'urgent') return value === 'urgent' || value === 'acil';
      return true;
    });
  }, [filteredRequests, priorityFilter]);

  // Liste giriş animasyonu (yalnızca ilk gösterimde)
  useEffect(() => {
    if (!showList) return;
    listFadeAnim.setValue(0);
    listTranslateAnim.setValue(10);
    Animated.parallel([
      Animated.timing(listFadeAnim, { toValue: 1, duration: 240, useNativeDriver: true }),
      Animated.spring(listTranslateAnim, { toValue: 0, friction: 8, tension: 70, useNativeDriver: true }),
    ]).start();
  }, [showList, listFadeAnim, listTranslateAnim]);

  // İlk gösterimde kartlara animasyon ver, sonrasında verme (performans için)
  useEffect(() => {
    if (showList && !didAnimateCardsRef.current) {
      // Bir tur animasyon sonrası kapat
      const t = setTimeout(() => { didAnimateCardsRef.current = true; }, 400);
      return () => clearTimeout(t);
    }
  }, [showList]);

  const handleSelectPeriod = useCallback((key) => {
    // Chip bounce
    setPressingKey(key);
    chipPressScale.setValue(0.92);
    Animated.spring(chipPressScale, { toValue: 1, friction: 6, useNativeDriver: true }).start(() => {
      setPressingKey(null);
    });
    // Seçimi uygula (liste animasyonu useEffect ile tetiklenecek)
    setSelectedPeriod(prev => (prev === key ? null : key));
  }, [chipPressScale]);

  const formatPrice = useCallback((value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) {return '—';}
    const tr = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
    return `${tr}₺`;
  }, []);

  const handleSelectPriority = useCallback((key) => {
    setPressingPriorityKey(key);
    priorityChipPressScale.setValue(0.92);
    Animated.spring(priorityChipPressScale, { toValue: 1, friction: 6, useNativeDriver: true }).start(() => {
      setPressingPriorityKey(null);
    });
    setPriorityFilter(prev => (prev === key ? null : key));
  }, [priorityChipPressScale]);

  // (slider animasyonu kaldırıldı)
  // Helper functions for card expansion and matching portfolios
  const isCardExpanded = useCallback((requestId) => expandedCards.has(requestId), [expandedCards]);

  // Yalnızca kullanıcının kendi portföylerini talepleri ile eşleştir
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

  // Eşleşen portföyleri her render'da tekrar hesaplamak yerine,
  // talepler + portföyler değiştiğinde bir kez hesaplayıp hafızada tut
  const matchingPortfoliosByRequestId = useMemo(() => {
    const map = {};
    if (!Array.isArray(requests) || requests.length === 0) return map;
    if (!Array.isArray(myPortfolios) || myPortfolios.length === 0) return map;
    try {
      for (const req of requests) {
        if (!req || !req.id) continue;
        map[req.id] = getMatchingPortfoliosForRequest(req, myPortfolios, { tolerance: 0.10 });
      }
    } catch {
      // sessiz fail, en kötü ihtimalle boş map döner
    }
    return map;
  }, [requests, myPortfolios]);

  const getMatchingPortfolios = useCallback((request) => {
    if (!request || !request.id) { return []; }
    return matchingPortfoliosByRequestId[request.id] || [];
  }, [matchingPortfoliosByRequestId]);

  // Publish toggle with confirm when enabling
  const handlePublishPress = useCallback((request) => {
    const newStatus = !request.isPublished;
    if (newStatus) {
      setConfirmModal({ visible: true, requestId: request.id, newStatus: true });
    } else {
      handleTogglePublish(request.id, false);
    }
  }, [handleTogglePublish]);

  const showSuccessToast = useCallback((message) => {
    setSuccessMessage(message || 'İşlem başarılı');
    setShowSuccessModal(true);

    // Animasyonu başlat
    successScaleAnim.setValue(0);
    Animated.spring(successScaleAnim, {
      toValue: 1,
      tension: 50,
      friction: 7,
      useNativeDriver: true,
    }).start();

    // Otomatik kapanış
    if (successTimerRef.current) {
      clearTimeout(successTimerRef.current);
    }
    successTimerRef.current = setTimeout(() => {
      Animated.timing(successScaleAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => {
        setShowSuccessModal(false);
      });
    }, 1500);
  }, [successScaleAnim]);


  const handleTogglePublish = useCallback(async (requestId, newPublishStatus) => {
    // Optimistic update (pool görünürlüğü için yayın açılırsa publishToPool da aç)
    setRequests(prev => prev.map(req => (
      req.id === requestId
        ? { ...req, isPublished: newPublishStatus, publishToPool: newPublishStatus ? true : req.publishToPool }
        : req
    )));

    try {
      const result = await toggleRequestPublishStatus(requestId, newPublishStatus);
      if (!result?.success) {
        // Rollback on failure
        setRequests(prev => prev.map(req => (
          req.id === requestId ? { ...req, isPublished: !newPublishStatus } : req
        )));
        setResultModal({ visible: true, title: 'Hata', message: 'Yayınlama durumu güncellenemedi.' });
        return;
      }

      // Eğer yayın açıldıysa havuza da aç (pool'da listelensin)
      if (newPublishStatus === true) {
        try {
          await updateRequest(requestId, { publishToPool: true });
        } catch {}
      }

      showSuccessToast(newPublishStatus ? 'Talep başarıyla yayınlandı' : 'Talep başarıyla gizlendi');
    } catch (error) {
      // Rollback on exception
      setRequests(prev => prev.map(req => (
        req.id === requestId ? { ...req, isPublished: !newPublishStatus } : req
      )));
      setResultModal({ visible: true, title: 'Hata', message: 'Yayınlama durumu güncellenirken bir hata oluştu' });
    }
  }, [showSuccessToast]);

  const renderRequestCard = ({ item, index = 0 }) => {
    const matchingPortfolios = getMatchingPortfolios(item);
    const isExpanded = isCardExpanded(item.id);

    // --- BU KONTROL PANELİ İLE TAM KONTROL SAĞLAYABİLİRSİNİZ ---
    // GlassmorphismView'ın tüm görsel ayarlarını buradan yönetebilirsiniz.
    const cardConfig = {
      // --- RENK & ŞEFFAFLIK ---
      // Not: `blurEnabled` false olduğu için `overlayColor` GEÇERSİZDİR.
      overlayColor: 'rgba(224, 220, 220, 0.81)',
      startColor: 'rgb(10, 22, 31)',
      endColor: 'rgba(17, 36, 49, 0.64)',
      gradientAlpha: 1,
      gradientDirection: 150,
      gradientSpread: 7,
      ditherStrength: 5.0,
    };

    const cardEnterAnimation = {
      from: { opacity: 0, translateY: 10, scale: 0.98 },
      to: { opacity: 1, translateY: 0, scale: 1 },
    };

    // Kart animasyonunu sadece ilk gösterimde çalıştır,
    // filtre değişimlerinde tekrar tekrar animasyonla render edip
    // dokunmaları geciktirmesin.
    const shouldAnimate = !didAnimateCardsRef.current;
    return (
      <Animatable.View
        animation={shouldAnimate ? cardEnterAnimation : undefined}
        duration={shouldAnimate ? 360 : undefined}
        delay={shouldAnimate ? Math.min(index * 24, 240) : undefined}
        useNativeDriver
        key={item.id}
      >
      <GlassmorphismView
        style={styles.requestCard}
        borderRadius={15}
        blurEnabled={false}
        config={cardConfig}
      >
          {/* Content wrapper */}
          <View style={styles.requestCardContent}>
            {/* Header with user info and publish badge */}
            <View style={styles.userProfileSection}>
          <View style={styles.userProfileInfo}>
            <Image
              source={
                item.userProfile?.profilePicture && item.userProfile.profilePicture !== 'default-logo'
                  ? { uri: item.userProfile.profilePicture }
                  : require('../assets/images/logo-krimson.png')
              }
              style={styles.userProfileImage}
            />
            <View style={styles.userProfileDetails}>
              <Text style={styles.userName}>
                {item.userProfile?.name || item.clientName || 'Siz'}
              </Text>
              <Text style={styles.userOffice}>
                {item.userProfile?.office || item.officeName || 'Kişisel Talep'}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={[
              styles.publishBadge,
              item.isPublished ? styles.publishBadgeActive : styles.publishBadgeInactive,
            ]}
            onPress={() => handlePublishPress(item)}
            activeOpacity={0.8}
          >
            <View style={styles.publishBadgeContent}>
              <View style={[styles.publishDot, item.isPublished ? styles.publishDotActive : styles.publishDotInactive]} />
              <Text style={styles.publishBadgeText}>{item.isPublished ? 'Yayında' : 'Gizli'}</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Request Content */}
        <TouchableOpacity
          onPress={() => navigation.navigate('RequestDetail', { request: item })}
          activeOpacity={0.8}
        >
          <Text style={styles.requestTitle} numberOfLines={2}>
            {item.title || 'Emlak Talebi'}
          </Text>

          <Text style={styles.requestDescription} numberOfLines={2}>
            {item.description || 'Detaylı açıklama bulunmuyor.'}
          </Text>

          <View style={styles.requestDetails}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Konum:</Text>
              <Text style={styles.detailValue}>
                {(() => {
                  const district = Array.isArray(item.districts) && item.districts.length > 0
                    ? item.districts[0]
                    : (item.district || '');
                  const neighborhood = Array.isArray(item.neighborhoods) && item.neighborhoods.length > 0
                    ? item.neighborhoods[0]
                    : (item.neighborhood || '');
                  const left = neighborhood || district || 'Belirtilmemiş';
                  const right = district || item.city || 'İl';
                  return `${left}, ${right}`;
                })()}
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Oda:</Text>
              <Text style={styles.detailValue}>{item.roomCount || 'Belirtilmemiş'}</Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Fiyat:</Text>
              <Text style={styles.detailValue}>
                {formatPrice(item.minPrice || item.maxBudget || 0)} - {formatPrice(item.maxPrice || item.maxBudget || 0)}
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>m²:</Text>
              <Text style={styles.detailValue}>
                {item.minSquareMeters || item.minSqMeters || 0} - {item.maxSquareMeters || item.maxSqMeters || 0}
              </Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* Matching Portfolios Button */}
        <View style={styles.cardFooter}>
          {(() => {
            const hasMatches = Array.isArray(matchingPortfolios) && matchingPortfolios.length > 0;
            const ButtonWrapper = hasMatches ? Animatable.View : View;
            return (
              <ButtonWrapper
                {...(hasMatches ? { animation: 'pulse', iterationCount: 'infinite', duration: 1200, easing: 'ease-in-out', useNativeDriver: true } : {})}
                style={hasMatches ? styles.matchingPulseWrapper : null}
              >
                <TouchableOpacity
                  style={[
                    styles.matchingPortfoliosButton,
                    hasMatches ? styles.matchingPortfoliosButtonActive : styles.matchingPortfoliosButtonInactive,
                  ]}
                  disabled={!hasMatches}
                  activeOpacity={hasMatches ? 0.8 : 1}
                  onPress={hasMatches ? () => navigation.push('RequestDetail', { request: item, scrollToMatching: true }) : undefined}
                >
                  <Text style={styles.matchingPortfoliosButtonText}>
                    {matchingPortfolios.length} Eşleşen Portföy
                  </Text>
                  <Text style={styles.expandIcon}>→</Text>
                </TouchableOpacity>
              </ButtonWrapper>
            );
          })()}

          {/* Contact buttons removed for own requests */}
        </View>

        {/* Expanded Matching Portfolios Section */}
        {isExpanded && (
          <View style={styles.matchingPortfoliosSection}>
            <Text style={styles.matchingPortfoliosTitle}>
              Eşleşen Portföyler
            </Text>
            <View style={styles.matchingPortfoliosList}>
              {matchingPortfolios.map((portfolio) => (
                <View key={portfolio.id} style={styles.matchingPortfolioCard}>
                  <ListingCard
                    listing={portfolio}
                    onPress={() => navigation.navigate('PropertyDetail', { portfolio })}
                    isEditable={false}
                  />
                </View>
              ))}
            </View>
          </View>
        )}
          </View>
      </GlassmorphismView>
      </Animatable.View>
    );
  };

  // Odaklanınca önceki scroll konumuna dön (detaydan geri gelince)
  useFocusEffect(
    useCallback(() => {
      // Silent refresh: keep UI responsive, no loading spinners
      if (user && user.uid) {
        fetchUserRequests(user.uid)
          .then((data) => {
            setRequests(data);
          })
          .catch(() => {
            // ignore silently; last known data stays
          });
      }
      const timer = setTimeout(() => {
        try {
          if (listRef.current && listScrollOffsetRef.current > 0) {
            listRef.current.scrollToOffset({ offset: listScrollOffsetRef.current, animated: false });
          }
        } catch {}
      }, 0);
      return () => clearTimeout(timer);
    }, [user]),
  );

  const renderHeader = () => (
    <View style={styles.header}>
      <View style={styles.headerLeft}>
        <TouchableOpacity
          style={styles.headerButtonBack}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Geri"
        >
          <Image
            source={require('../assets/images/icons/return.png')}
            style={styles.headerButtonIconBack}
          />
        </TouchableOpacity>
      </View>

      <View style={styles.headerCenter}>
        <Text style={[styles.headerTitle, { color: isDark ? currentTheme.colors.white : currentTheme.colors.navy }]}>Taleplerim</Text>
        <Text style={[styles.headerSubtitle, { color: currentTheme.colors.textWhite + 'CC' }]}>Size ait müşteri talepleriniz.</Text>
      </View>

      <View style={styles.headerRight}>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => {/* TODO: Add favorite functionality */}}
        >
          <Image
            source={require('../assets/images/icons/Favorite_fill.png')}
            style={styles.headerButtonIcon}
          />
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderEmptyComponent = () => (
    <View style={[styles.emptyContainer, { backgroundColor: currentTheme.colors.error }]}>
      <Image
        source={require('../assets/images/icons/talep.png')}
        style={[styles.emptyIcon, { tintColor: currentTheme.colors.white }]}
      />
      <Text style={[styles.emptyText, { color: currentTheme.colors.white }]}>Henüz talep bulunmuyor</Text>
      <Text style={[styles.emptySubtext, { color: currentTheme.colors.white }]}>
        Yeni talepler oluşturduğunuzda burada görünecek
      </Text>
    </View>
  );

  const renderFiltersHeader = () => (
    <View>
      {/* Tarih Filtresi - Calendar gün seçimi stili */}
      <View style={styles.filterBar}>
        <View style={[styles.filterOptionsRow, styles.periodOptionsRow]}>
          {[
            { key: 'today', label: 'Bu gün' },
            { key: 'yesterday', label: 'Son 3 gün' },
            { key: '7', label: 'Son 7 gün' },
            { key: '15', label: 'Son 15 gün' },
          ].map(({ key, label }, idx) => {
            const active = selectedPeriod === key;
            return (
              (() => {
                const activeScale = active ? 1.06 : 1;
                const scaleNode = pressingKey === key ? Animated.multiply(chipPressScale, activeScale) : activeScale;
                return (
                  <TouchableOpacity
                    key={key}
                    style={[
                      styles.periodChip,
                      idx === 0 && styles.periodChipFirst,
                      (idx === 1 || idx === 2) && styles.periodChipMiddle,
                      idx === 3 && styles.periodChipLast,
                      active && styles.periodChipActive,
                      { transform: [{ scale: scaleNode }], zIndex: active ? 1 : 0 },
                    ]}
                    activeOpacity={0.8}
                    onPress={() => handleSelectPeriod(key)}
                  >
                    <Text style={[styles.periodChipText, active && styles.periodChipTextActive]}>{label}</Text>
                  </TouchableOpacity>
                );
              })()
            );
          })}
        </View>
      </View>
      {/* Öncelik (Aciliyet) Filtresi */}
      <View style={styles.priorityBar}>
        <View style={styles.priorityOptionsRow}>
          {[
            { key: 'normal', label: 'Normal' },
            { key: 'priority', label: 'Öncelikli' },
            { key: 'urgent', label: 'Acil' },
          ].map(({ key, label }, idx) => {
            const active = priorityFilter === key;
            const activeBg =
              key === 'normal'
                ? (currentTheme.colors.success || '#22C55E')
                : key === 'priority'
                ? (currentTheme.colors.warning || '#F59E0B')
                : (currentTheme.colors.error || '#DC143C');
            const chipStyle = [
              styles.priorityChip,
              idx === 0 && styles.priorityChipFirst,
              idx === 1 && styles.priorityChipMiddle,
              idx === 2 && styles.priorityChipLast,
              active && { backgroundColor: activeBg, borderColor: activeBg, borderWidth: 0 },
            ];
            const textActiveStyle = active
              ? { color: key === 'priority' ? (currentTheme.colors.navy || '#0f172a') : currentTheme.colors.white }
              : null;
            return (
              <TouchableOpacity
                key={key}
                style={[
                  chipStyle,
                  {
                    transform: [
                      { scale: active ? 1.06 : 1 },
                      pressingPriorityKey === key ? { scale: priorityChipPressScale } : { scale: 1 },
                    ],
                  },
                ]}
                activeOpacity={0.85}
                onPress={() => handleSelectPriority(key)}
              >
                <Text style={[styles.periodChipText, active && styles.periodChipTextActive, textActiveStyle]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );

  return (
    <ImageBackground
      source={isDark ? require('../assets/images/dark-bg2.png') : require('../assets/images/light-bg.jpg')}
      defaultSource={isDark ? require('../assets/images/dark-bg2.png') : require('../assets/images/light-bg.jpg')}
      fadeDuration={0}
      style={{ flex: 1, backgroundColor: isDark ? '#071317' : '#FFFFFF' }}
      resizeMode="cover"
    >
      <SafeAreaView edges={['left','right','bottom']} style={styles.container}>

      <View style={[styles.header, { paddingTop: Math.max(insets.top, 0) + 12 }]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            style={styles.headerButtonBack}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Geri"
          >
            <Image
              source={require('../assets/images/icons/return.png')}
              style={styles.headerButtonIconBack}
            />
          </TouchableOpacity>
        </View>

        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: isDark ? currentTheme.colors.white : currentTheme.colors.navy }]}>Taleplerim</Text>
          <Text style={[styles.headerSubtitle, { color: currentTheme.colors.textWhite + 'CC' }]}>Size ait müşteri talepleriniz.</Text>
        </View>

        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => {}}
          >
            <Image
              source={require('../assets/images/icons/Favorite_fill.png')}
              style={styles.headerButtonIcon}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Spacer: header yüksekliği kadar boşluk (insets.top + 12 + 37 + spacing.lg) */}
      <View style={{ height: Math.max(insets.top, 0) + 12 + 37 + ((currentTheme?.spacing && currentTheme.spacing.lg) ? currentTheme.spacing.lg : 16) }} />

      {showList ? (
        <Animatable.View
          ref={viewRef}
          style={[
            { flex: 1 },
            !hasAnimatedOnce ? { opacity: 0, transform: [{ translateY: 8 }] } : null,
          ]}
          useNativeDriver
        >
          <Animated.View style={{ flex: 1, opacity: listFadeAnim, transform: [{ translateY: listTranslateAnim }] }}>
          <FlatList
            ref={listRef}
            data={priorityFilteredRequests}
            renderItem={({ item, index }) => renderRequestCard({ item, index })}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[styles.listContainer, { paddingBottom: (tabBarHeight || Math.max(insets.bottom || 0, 0)) + theme.spacing.sm }]}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={loading ? null : renderEmptyComponent}
            ListHeaderComponent={renderFiltersHeader}
            onScroll={(e) => {
              listScrollOffsetRef.current = e.nativeEvent.contentOffset?.y || 0;
            }}
            scrollEventThrottle={16}
            initialNumToRender={8}
            maxToRenderPerBatch={8}
            windowSize={9}
            updateCellsBatchingPeriod={50}
            removeClippedSubviews
          />
          </Animated.View>
        </Animatable.View>
      ) : null}

      {/* Sağ kenar widget - Yan paneli aç/kapatır */}
      <Animated.View
        style={[
          styles.expiredWidget,
          {
            transform: [{
              translateX: expiredPanelAnim.interpolate({
                inputRange: [0, 250],
                outputRange: [-250, 0],
              })
            }],
            zIndex: (showExpiredPanel || showArchivedPanel) ? 0 : 1002,
          }
        ]}
        pointerEvents={(showExpiredPanel || showArchivedPanel) ? 'none' : 'auto'}
      >
        <TouchableOpacity
          style={styles.expiredWidgetButton}
          onPress={toggleExpiredPanel}
          activeOpacity={0.9}
        >
          <View style={{ alignItems: 'center', width: '100%' }}>
            <Text style={styles.expiredWidgetText} numberOfLines={1} allowFontScaling={false} adjustsFontSizeToFit minimumFontScale={0.75}>
              S. Biten
            </Text>
            <Image source={require('../assets/images/icons/Setting_alt_fill2x.png')} style={[styles.expiredWidgetIcon, styles.expiredWidgetIconBelowText]} />
          </View>
        </TouchableOpacity>
      </Animated.View>

      {/* Sağ kenar widget - Kaldırılmış talepler */}
      <Animated.View
        style={[
          styles.expiredWidget,
          {
            top: '55%',
            transform: [{
              translateX: archivedPanelAnim.interpolate({
                inputRange: [0, 250],
                outputRange: [-250, 0],
              })
            }],
            zIndex: (showExpiredPanel || showArchivedPanel) ? 0 : 1002,
          }
        ]}
        pointerEvents={(showExpiredPanel || showArchivedPanel) ? 'none' : 'auto'}
      >
        <TouchableOpacity
          style={[styles.expiredWidgetButton, { backgroundColor: (currentTheme.colors.warning || '#FF9500') + 'CC' }]}
          onPress={toggleArchivedPanel}
          activeOpacity={0.9}
        >
          <View style={{ alignItems: 'center', width: '100%' }}>
            <Text style={styles.expiredWidgetText} numberOfLines={1} allowFontScaling={false} adjustsFontSizeToFit minimumFontScale={0.75}>
              Kald.
            </Text>
            <Image source={require('../assets/images/icons/Setting_alt_fill2x.png')} style={[styles.expiredWidgetIcon, styles.expiredWidgetIconBelowText]} />
          </View>
        </TouchableOpacity>
      </Animated.View>

      {/* Süresi Biten Talepler - Sağdan açılan panel */}
      {showExpiredPanel && (
        <View style={styles.expiredPanelOverlay}>
          <TouchableOpacity
            style={styles.expiredPanelBackdrop}
            onPress={toggleExpiredPanel}
            activeOpacity={1}
          />
          <Animated.View
            style={[
              styles.expiredPanel,
              {
                transform: [{ translateX: expiredPanelAnim }],
                backgroundColor: 'transparent',
                height: screenHeight * 0.75,
                top: screenHeight * 0.125,
              }
            ]}
          >
            <GlassmorphismView
              style={styles.expiredPanelGradient}
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
            <View style={[styles.expiredPanelHeader, { borderBottomColor: currentTheme.colors.border }]}>
              <Text style={[styles.expiredPanelTitle, { color: currentTheme.colors.text }]}>
                Süresi Biten Talepler ({expiredRequests.length})
              </Text>
              <TouchableOpacity 
                style={styles.expiredPanelClose}
                onPress={toggleExpiredPanel}
              >
                <Text style={[styles.expiredPanelCloseText, { color: currentTheme.colors.textSecondary }]}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.expiredPanelContent}>
              {expiredRequests.length === 0 ? (
                <View style={{ padding: 16 }}>
                  <Text style={{ color: currentTheme.colors.textSecondary }}>Süresi biten talep bulunmuyor.</Text>
                </View>
              ) : (
                <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: 8 }}>
                  {expiredRequests.map((r) => (
                    <TouchableOpacity
                      key={r.id}
                      style={[styles.expiredItem, { borderBottomColor: currentTheme.colors.border }]}
                      activeOpacity={0.85}
                      onPress={() => openExpiredDetail(r)}
                    >
                      <Text style={[styles.expiredItemTitle, { color: currentTheme.colors.text }]} numberOfLines={2}>
                        {r.title || 'Emlak Talebi'}
                      </Text>
                      <Text style={[styles.expiredItemSubtitle, { color: currentTheme.colors.textSecondary }]} numberOfLines={1}>
                        {(r.city || 'İl')}{r.district ? `, ${r.district}` : ''} · {new Date(r.createdAt).toLocaleDateString('tr-TR')}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>
          </Animated.View>
        </View>
      )}

      {/* Kaldırılmış Talepler - Sağdan açılan panel */}
      {showArchivedPanel && (
        <View style={styles.expiredPanelOverlay}>
          <TouchableOpacity
            style={styles.expiredPanelBackdrop}
            onPress={toggleArchivedPanel}
            activeOpacity={1}
          />
          <Animated.View
            style={[
              styles.expiredPanel,
              {
                transform: [{ translateX: archivedPanelAnim }],
                backgroundColor: 'transparent',
                height: screenHeight * 0.75,
                top: screenHeight * 0.125,
              }
            ]}
          >
            <GlassmorphismView
              style={styles.expiredPanelGradient}
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
            <View style={[styles.expiredPanelHeader, { borderBottomColor: currentTheme.colors.border }]}>
              <Text style={[styles.expiredPanelTitle, { color: currentTheme.colors.text }]}>
                Kaldırılmış Talepler ({archivedRequests.length})
              </Text>
              <TouchableOpacity 
                style={styles.expiredPanelClose}
                onPress={toggleArchivedPanel}
              >
                <Text style={[styles.expiredPanelCloseText, { color: currentTheme.colors.textSecondary }]}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.expiredPanelContent}>
              {archivedRequests.length === 0 ? (
                <View style={{ padding: 16 }}>
                  <Text style={{ color: currentTheme.colors.textSecondary }}>Kaldırılmış talep bulunmuyor.</Text>
                </View>
              ) : (
                <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: 8 }}>
                  {archivedRequests.map((r) => (
                    <TouchableOpacity
                      key={r.id}
                      style={[styles.expiredItem, { borderBottomColor: currentTheme.colors.border }]}
                      activeOpacity={0.85}
                      onPress={() => openExpiredDetail(r)}
                    >
                      <Text style={[styles.expiredItemTitle, { color: currentTheme.colors.text }]} numberOfLines={2}>
                        {r.title || 'Emlak Talebi'}
                      </Text>
                      <Text style={[styles.expiredItemSubtitle, { color: currentTheme.colors.textSecondary }]} numberOfLines={1}>
                        {(r.city || 'İl')}{r.district ? `, ${r.district}` : ''} · {new Date(r.createdAt).toLocaleDateString('tr-TR')}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>
          </Animated.View>
        </View>
      )}
      {/* Confirm Modal */}
      <Modal visible={confirmModal.visible} transparent animationType="fade" onRequestClose={() => setConfirmModal(prev => ({ ...prev, visible: false }))}>
        <View style={styles.modalOverlay}>
          <GlassmorphismView
            style={styles.confirmModalContainer}
            borderRadius={currentTheme.borderRadius.lg}
            blurEnabled={false}
            config={successModalGlassConfig}
          >
            <Text style={styles.modalTitle}>Yayınla</Text>
            <Text style={[styles.modalMessage, { marginTop: currentTheme.spacing.sm }]}>
              Talebiniz Talep Havuzunda yayınlanacak. Yayınlansın mı?
            </Text>
            <View style={[styles.modalButtonsRow, { marginTop: currentTheme.spacing.lg, width: '100%' }]}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel, styles.modalButtonLarge]}
                onPress={() => setConfirmModal(prev => ({ ...prev, visible: false }))}
              >
                <Text style={[styles.modalButtonTextCancel, styles.modalButtonTextLarge]}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonConfirm, styles.modalButtonLarge]}
                onPress={() => {
                  const { requestId } = confirmModal;
                  setConfirmModal(prev => ({ ...prev, visible: false }));
                  if (requestId) {
                    handleTogglePublish(requestId, true);
                  }
                }}
              >
                <Text style={[styles.modalButtonTextConfirm, styles.modalButtonTextLarge]}>Evet</Text>
              </TouchableOpacity>
            </View>
          </GlassmorphismView>
        </View>
      </Modal>

      {/* Result Modal */}
      <Modal visible={resultModal.visible} transparent animationType="fade" onRequestClose={() => setResultModal(prev => ({ ...prev, visible: false }))}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{resultModal.title}</Text>
            <Text style={styles.modalMessage}>{resultModal.message}</Text>
            <TouchableOpacity
              style={[styles.modalButton, styles.modalButtonConfirm, styles.modalButtonSingle]}
              onPress={() => setResultModal(prev => ({ ...prev, visible: false }))}
            >
              <Text style={styles.modalButtonTextConfirm}>Tamam</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Success Modal - Notlarım tarzı animasyonlu */}
      <Modal
        visible={showSuccessModal}
        transparent={true}
        animationType="none"
        onRequestClose={() => {
          if (successTimerRef.current) {
            clearTimeout(successTimerRef.current);
          }
          setShowSuccessModal(false);
        }}
      >
        <View style={styles.modalOverlay}>
          <Animated.View
            style={{
              width: '100%',
              alignItems: 'center',
              justifyContent: 'center',
              transform: [{ scale: successScaleAnim }],
              opacity: successScaleAnim,
            }}
          >
            <GlassmorphismView
              style={styles.successModalContainer}
              borderRadius={currentTheme.borderRadius.lg}
              blurEnabled={false}
              config={successModalGlassConfig}
            >
              <View style={styles.successIconContainer}>
                <Image
                  source={require('../assets/images/icons/tasks.png')}
                  style={styles.successIconImage}
                />
              </View>
              <Text style={styles.successTitle}>Başarılı!</Text>
              <Text style={styles.successMessage}>{successMessage}</Text>
            </GlassmorphismView>
          </Animated.View>
        </View>
      </Modal>

      {/* Süresi Biten Panel -> Talep Detayı (Merkez Modal) */}
      {showExpiredDetail && (
        <Modal visible transparent animationType="none" onRequestClose={closeExpiredDetail}>
          <View style={[styles.modalOverlay, { paddingHorizontal: 0, backgroundColor: 'transparent' }]}>
            <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={closeExpiredDetail} />
            <Animated.View
              style={{
                opacity: expiredDetailAnim,
                transform: [
                  { scale: expiredDetailAnim.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) },
                  { translateY: expiredDetailAnim.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) },
                ],
              }}
            >
              <View style={[styles.modalCard, { overflow: 'hidden', height: screenHeight * 0.8, maxHeight: screenHeight * 0.85, minHeight: screenHeight * 0.68, width: Math.min(screenWidth - 56, 640), maxWidth: Math.min(screenWidth - 56, 640) }]}>
                <GlassmorphismView
                  style={StyleSheet.absoluteFillObject}
                  borderRadius={currentTheme.borderRadius.lg}
                  blurEnabled={false}
                  config={expiredDetailGlassConfig}
                />
                <View style={styles.expiredDetailHeader}>
                  <Text style={styles.expiredDetailTitle}>Talep Detayı</Text>
                  <View style={styles.expiredDetailHeaderRightClose}>
                    <TouchableOpacity style={styles.expiredDetailCloseButton} onPress={closeExpiredDetail} activeOpacity={0.85}>
                      <Text style={styles.expiredDetailCloseButtonIcon}>✕</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={styles.expiredDetailHeaderDivider} />
                <ScrollView style={{ height: screenHeight * 0.62, maxHeight: screenHeight * 0.68 }}>
                  {!!selectedExpiredRequest && (
                    <View>
                      <Text style={[styles.expiredItemTitle, { fontSize: 18, marginTop: currentTheme.spacing.md }]}>
                        {selectedExpiredRequest.title || 'Emlak Talebi'}
                      </Text>
                      <Text style={[styles.expiredItemSubtitle, { marginTop: 8 }]}>
                        {selectedExpiredRequest.description || 'Detaylı açıklama bulunmuyor.'}
                      </Text>
                      <View style={{ height: 14 }} />
                      <View style={styles.requestDetails}>
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Konum:</Text>
                          <Text style={styles.detailValue}>
                            {(() => {
                              const district = Array.isArray(selectedExpiredRequest.districts) && selectedExpiredRequest.districts.length > 0
                                ? selectedExpiredRequest.districts[0]
                                : (selectedExpiredRequest.district || '');
                              const neighborhood = Array.isArray(selectedExpiredRequest.neighborhoods) && selectedExpiredRequest.neighborhoods.length > 0
                                ? selectedExpiredRequest.neighborhoods[0]
                                : (selectedExpiredRequest.neighborhood || '');
                              const left = neighborhood || district || 'Belirtilmemiş';
                              const right = district || selectedExpiredRequest.city || 'İl';
                              return `${left}, ${right}`;
                            })()}
                          </Text>
                        </View>
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Oda:</Text>
                          <Text style={styles.detailValue}>{selectedExpiredRequest.roomCount || 'Belirtilmemiş'}</Text>
                        </View>
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Fiyat:</Text>
                          <Text style={styles.detailValue}>
                            {formatPrice(selectedExpiredRequest.minPrice || selectedExpiredRequest.maxBudget || 0)} - {formatPrice(selectedExpiredRequest.maxPrice || selectedExpiredRequest.maxBudget || 0)}
                          </Text>
                        </View>
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>m²:</Text>
                          <Text style={styles.detailValue}>
                            {selectedExpiredRequest.minSquareMeters || selectedExpiredRequest.minSqMeters || 0} - {selectedExpiredRequest.maxSquareMeters || selectedExpiredRequest.maxSqMeters || 0}
                          </Text>
                        </View>
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Açılış Tarihi:</Text>
                          <Text style={styles.detailValue}>
                            {(selectedExpiredRequest.createdAt ? new Date(selectedExpiredRequest.createdAt).toLocaleDateString('tr-TR') : '—')}
                          </Text>
                        </View>
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Bitiş Tarihi:</Text>
                          <Text style={styles.detailValue}>
                            {(() => {
                              try {
                                const candidates = [
                                  selectedExpiredRequest.expiresAt, selectedExpiredRequest.expirationDate, selectedExpiredRequest.deadline,
                                  selectedExpiredRequest.validUntil, selectedExpiredRequest.until, selectedExpiredRequest.endDate,
                                ].map(v => (v instanceof Date ? v.getTime() : (v ? new Date(v).getTime() : null))).filter(Boolean);
                                const expiryTs = candidates.length > 0 ? Math.min(...candidates) : null;
                                if (expiryTs) { return new Date(expiryTs).toLocaleDateString('tr-TR'); }
                                const createdTs = selectedExpiredRequest?.createdAt ? (selectedExpiredRequest.createdAt instanceof Date ? selectedExpiredRequest.createdAt.getTime() : new Date(selectedExpiredRequest.createdAt).getTime()) : null;
                                if (!createdTs) { return '—'; }
                                const fifteenDaysMs = 15 * 24 * 60 * 60 * 1000;
                                return new Date(createdTs + fifteenDaysMs).toLocaleDateString('tr-TR');
                              } catch {
                                return '—';
                              }
                            })()}
                          </Text>
                        </View>
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Durum:</Text>
                          <Text style={styles.detailValue}>
                            {isRequestExpired(selectedExpiredRequest) ? 'Pasif' : (selectedExpiredRequest.isPublished ? 'Yayında' : 'Gizli')}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.expiredBadgesRow}>
                        <View style={styles.expiredStatusBadge}>
                          <Text style={styles.expiredStatusBadgeText}>Talep Durumu: Pasif</Text>
                        </View>
                        {(() => {
                          const leftDays = getDeletionCountdownDays(selectedExpiredRequest);
                          return (
                            <View style={styles.expiredDeletionBadge}>
                              <Text style={styles.expiredDeletionBadgeText}>
                                {`Tamamen silinmeye kalan süre: ${Number.isFinite(leftDays) && leftDays != null ? leftDays : '—'} gün`}
                              </Text>
                            </View>
                          );
                        })()}
                      </View>
                      <View style={[styles.modalButtonsRow, { marginTop: currentTheme.spacing.md }]}>
                        <TouchableOpacity
                          style={[styles.modalButton, styles.modalButtonCancel, styles.modalButtonLarge]}
                          onPress={handleDeleteRequestNow}
                          activeOpacity={0.9}
                        >
                          <Text style={[styles.modalButtonTextCancel, styles.modalButtonTextLarge]}>Sil</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.modalButton, styles.modalButtonConfirm, styles.modalButtonLarge]}
                          onPress={() => setReactivateConfirmVisible(true)}
                          activeOpacity={0.95}
                        >
                          <Text style={[styles.modalButtonTextConfirm, styles.modalButtonTextLarge]}>Tekrar Aktif Et</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </ScrollView>
              </View>
            </Animated.View>
          </View>
        </Modal>
      )}
      {/* Reactivate Confirm Modal */}
      <Modal
        visible={reactivateConfirmVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setReactivateConfirmVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <GlassmorphismView
            style={styles.confirmModalContainer}
            borderRadius={currentTheme.borderRadius.lg}
            blurEnabled={false}
            config={successModalGlassConfig}
          >
            <Text style={styles.modalTitle}>Yayınlama</Text>
            <Text style={[styles.modalMessage, { marginTop: currentTheme.spacing.sm }]}>
              Talep havuzunda yayınlansın mı?
            </Text>
            <View style={[styles.modalButtonsRow, { marginTop: currentTheme.spacing.lg, width: '100%' }]}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel, styles.modalButtonLarge]}
                onPress={() => handleReactivateRequest(false)}
              >
                <Text style={[styles.modalButtonTextCancel, styles.modalButtonTextLarge]}>Hayır (Gizli)</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonConfirm, styles.modalButtonLarge]}
                onPress={() => handleReactivateRequest(true)}
              >
                <Text style={[styles.modalButtonTextConfirm, styles.modalButtonTextLarge]}>Evet (Yayında)</Text>
              </TouchableOpacity>
            </View>
          </GlassmorphismView>
        </View>
      </Modal>
      </SafeAreaView>
    </ImageBackground>
  );
};

const stylesFactory = (currentTheme, isDark) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  listContainer: {
    padding: currentTheme.spacing.lg,
    paddingTop: 0,
  },
  // Calendar gün seçimi stili ile uyumlu filtre bar
  filterBar: {
    backgroundColor: 'transparent',
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg - 20,
  },
  filterOptionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  periodOptionsRow: {
    justifyContent: 'flex-start',
    gap: 0,
  },
  priorityBar: {
    backgroundColor: 'transparent',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg - 20,
    borderTopWidth: 0,
    marginBottom: theme.spacing.md,
  },
  priorityOptionsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'flex-start',
  },
  priorityChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: theme.spacing.md,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 6,
  },
  priorityChipFirst: {
    borderTopLeftRadius: 6,
    borderBottomLeftRadius: 6,
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
  },
  priorityChipMiddle: {
    borderRadius: 0,
    borderLeftWidth: 0,
    marginLeft: -1, // iç sınırı birleştir
  },
  priorityChipLast: {
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
    borderTopRightRadius: 6,
    borderBottomRightRadius: 6,
    borderLeftWidth: 0,
    marginLeft: -1,
  },
  periodChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: theme.spacing.md,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    minWidth: 60,
  },
  periodChipFirst: {
    borderTopLeftRadius: 6,
    borderBottomLeftRadius: 6,
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
  },
  periodChipMiddle: {
    borderRadius: 0,
    borderLeftWidth: 0,
    marginLeft: -1,
  },
  periodChipLast: {
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
    borderTopRightRadius: 6,
    borderBottomRightRadius: 6,
    borderLeftWidth: 0,
    marginLeft: -1,
  },
  periodChipActive: {
    backgroundColor: currentTheme.colors.error,
    borderColor: currentTheme.colors.error,
    borderWidth: 0,
  },
  periodChipText: {
    fontSize: theme.fontSizes.lg,
    color: 'rgba(255, 255, 255, 0.8)',
    fontWeight: theme.fontWeights.semibold,
  },
  periodChipTextActive: {
    color: currentTheme.colors.white,
  },
  header: {
    paddingHorizontal: currentTheme.spacing.lg,
    /* üst padding runtime'da insets.top + 12 verilecek */
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 20,
    minHeight: 60,
    backgroundColor: currentTheme.colors.transparent,
    paddingBottom: currentTheme.spacing.lg,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },

  headerButton: {
    width: 37,
    height: 37,
    borderRadius: 8,
    backgroundColor: currentTheme.colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0,
  },
  headerButtonBack: {
    backgroundColor: currentTheme.colors.error,
    width: 37,
    height: 37,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 0,
  },

  // headerButtonText style not used

  headerButtonIconBack: {
    width: 16,
    height: 16,
    tintColor: currentTheme.colors.textWhite,
  },

  // headerButtonActive unused
  headerLeft: {
    flex: 1,
    alignItems: 'flex-start',
  },

  headerCenter: {
    flex: 2,
    alignItems: 'center',
  },

  headerTitle: {
    fontSize: currentTheme.fontSizes.xxxl,
    fontWeight: currentTheme.fontWeights.bold,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  headerSubtitle: {
    fontSize: currentTheme.fontSizes.sm,
    textAlign: 'center',
    marginTop: 2,
  },

  headerRight: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: currentTheme.spacing.sm,
  },
  // headerButtons unused
  // headerActionButton unused
  headerButtonIcon: {
    width: 20,
    height: 20,
    tintColor: currentTheme.colors.textWhite,
  },
  // Sağ kenar widget (PropertyDetail benzeri)
  expiredWidget: {
    position: 'absolute',
    right: 0,
    top: '35%',
    zIndex: 1002,
  },
  expiredWidgetButton: {
    backgroundColor: (currentTheme.colors.primary || '#DC143C') + 'CC',
    width: 50,
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 6,
    borderTopLeftRadius: 20,
    borderBottomLeftRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: -2, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 0,
  },
  expiredWidgetIcon: {
    width: 11,
    height: 11,
    tintColor: '#ffffff',
    transform: [{ rotate: '-90deg' }],
  },
  expiredWidgetIconBelowText: {
    marginTop: 10,
  },
  expiredWidgetText: {
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
  // Sağdan panel stilleri (PropertyDetail ile uyumlu)
  expiredPanelOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
  },
  expiredPanelBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  expiredPanel: {
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
  expiredPanelGradient: {
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
  expiredPanelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderTopLeftRadius: 20,
  },
  expiredPanelTitle: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  expiredPanelClose: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  expiredPanelCloseText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  expiredPanelContent: {
    flex: 1,
    paddingTop: 5,
  },
  expiredItem: {
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  expiredItemTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  expiredItemSubtitle: {
    fontSize: 12,
    opacity: 0.8,
  },
  // headerActionButtonActive unused
  requestCard: {
    // SADECE DÜZEN stilleri bırakıldı. Tüm görsel stiller (arkaplan, border, shadow)
    // çakışmayı önlemek için tamamen kaldırıldı.
    marginBottom: currentTheme.spacing.md,
  },

  requestCardContent: {
    padding: currentTheme.spacing.lg,
  },

  // User Profile Section Styles
  userProfileSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: currentTheme.spacing.md,
    paddingBottom: currentTheme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: currentTheme.colors.border,
  },

  userProfileInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },

  userProfileImage: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: currentTheme.spacing.md,
    borderWidth: 2,
    borderColor: currentTheme.colors.primary,
  },

  userProfileDetails: {
    flex: 1,
  },

  userName: {
    fontSize: currentTheme.fontSizes.lg,
    fontWeight: currentTheme.fontWeights.semibold,
    color: '#FFFFFF',
    marginBottom: 2,
  },

  userOffice: {
    fontSize: currentTheme.fontSizes.sm,
    color: '#FFFFFF',
  },

  statusButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: currentTheme.spacing.sm,
  },
    publishBadge: {
      paddingHorizontal: currentTheme.spacing.md,
      paddingVertical: 6,
      borderRadius: currentTheme.borderRadius.md,
      borderWidth: 0,
    },
    publishBadgeActive: {
      backgroundColor: currentTheme.colors.primary,
    },
    publishBadgeInactive: {
      backgroundColor: currentTheme.colors.borderLight,
    },
    publishBadgeContent: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    publishDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      marginRight: currentTheme.spacing.sm,
    },
    publishDotActive: {
      backgroundColor: currentTheme.colors.success,
    },
    publishDotInactive: {
      backgroundColor: currentTheme.colors.error,
    },
    publishBadgeText: {
      fontSize: currentTheme.fontSizes.sm,
      fontWeight: currentTheme.fontWeights.bold,
      color: currentTheme.colors.white,
    },
  // requestHeader unused
  // agentInfo unused
  // agentPicture unused
  // agentIcon unused
  // agentDetails unused
  // agentName unused
  // agentOffice unused
  // agentTime unused
  // requestActions unused
  // favoriteButton, favoriteIcon unused
  // hideButton, hideIcon unused
  statusBadge: {
    backgroundColor: currentTheme.colors.primaryLight,
    paddingHorizontal: currentTheme.spacing.sm,
    paddingVertical: currentTheme.spacing.xs,
    borderRadius: currentTheme.borderRadius.sm,
    marginRight: currentTheme.spacing.sm,
  },
  // propertyType unused

  // statusButton unused
  statusText: {
    fontSize: currentTheme.fontSizes.xs,
    fontWeight: currentTheme.fontWeights.semibold,
    color: currentTheme.colors.white,
  },
  // detailsButton, detailsButtonText unused
  // expandButton unused
  requestDetails: {
    padding: currentTheme.spacing.lg,
    paddingTop: currentTheme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: currentTheme.colors.border,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: currentTheme.spacing.sm,
  },
  detailLabel: {
    fontSize: currentTheme.fontSizes.sm,
    color: '#FFFFFF',
    flex: 1,
  },
  detailValue: {
    fontSize: currentTheme.fontSizes.sm,
    color: '#FFFFFF',
    fontWeight: currentTheme.fontWeights.medium,
    flex: 2,
    textAlign: 'right',
  },

  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: currentTheme.spacing.xl,
    backgroundColor: currentTheme.colors.background,
    borderRadius: currentTheme.borderRadius.lg,
    padding: currentTheme.spacing.xl,
    marginHorizontal: currentTheme.spacing.lg,
    marginTop: currentTheme.spacing.lg,
    ...theme.shadows.medium,
    borderWidth: 0,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    marginBottom: currentTheme.spacing.lg,
    tintColor: currentTheme.colors.error,
  },
  emptyText: {
    color: '#FFFFFF',
    fontSize: currentTheme.fontSizes.xl,
    fontWeight: currentTheme.fontWeights.semibold,
    textAlign: 'center',
  },
  emptySubtext: {
    color: currentTheme.colors.mutedText,
    opacity: 0.8,
    fontSize: currentTheme.fontSizes.md,
    textAlign: 'center',
    paddingHorizontal: currentTheme.spacing.xxl,
  },
  // modal styles (unused) removed


  // old modal content styles (unused) removed

  // New styles for DemandPool-like design
  actionButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: currentTheme.colors.primary,
  },

  actionButtonText: {
    fontSize: currentTheme.fontSizes.sm,
  },

  requestTitle: {
    fontSize: currentTheme.fontSizes.xxl,
    fontWeight: currentTheme.fontWeights.semibold,
    color: '#FFFFFF',
    marginBottom: currentTheme.spacing.sm,
  },

  requestDescription: {
    fontSize: currentTheme.fontSizes.xl,
    color: '#FFFFFF',
    marginBottom: currentTheme.spacing.md,
    lineHeight: 20,
  },


  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: currentTheme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: currentTheme.colors.border,
  },

  matchingPortfoliosButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: currentTheme.colors.primary,
    paddingHorizontal: currentTheme.spacing.md,
    paddingVertical: currentTheme.spacing.sm,
    borderRadius: currentTheme.borderRadius.md,
    borderWidth: 1,
    borderColor: currentTheme.colors.primary,
  },

  matchingPortfoliosButtonActive: {
    backgroundColor: currentTheme.colors.primary,
    borderColor: currentTheme.colors.primary,
  },

  matchingPortfoliosButtonInactive: {
    backgroundColor: currentTheme.colors.border,
    borderColor: currentTheme.colors.border,
  },

  matchingPulseWrapper: {
    borderWidth: 2,
    borderRadius: currentTheme.borderRadius.md,
    borderColor: currentTheme.colors.primary,
  },

  matchingPortfoliosButtonText: {
    color: currentTheme.colors.white,
    fontSize: currentTheme.fontSizes.sm,
    fontWeight: currentTheme.fontWeights.semibold,
    marginRight: currentTheme.spacing.sm,
  },

  expandIcon: {
    color: currentTheme.colors.white,
    fontSize: currentTheme.fontSizes.sm,
    fontWeight: currentTheme.fontWeights.bold,
  },

  contactButtons: {
    flexDirection: 'row',
    gap: currentTheme.spacing.sm,
    alignItems: 'center',
  },

  phoneButton: {
    width: 40,
    height: 40,
    backgroundColor: currentTheme.colors.error,
    borderRadius: currentTheme.borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // phoneButtonText unused

  phoneButtonIcon: {
    width: 20,
    height: 20,
    tintColor: currentTheme.colors.textWhite,
  },

  whatsappButton: {
    width: 40,
    height: 40,
    backgroundColor: currentTheme.colors.success,
    borderRadius: currentTheme.borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // whatsappButtonText unused

  whatsappButtonIcon: {
    width: 24, // Daha da büyütüldü
    height: 24, // Daha da büyütüldü
    tintColor: currentTheme.colors.textWhite,
  },

  matchingPortfoliosSection: {
    marginTop: currentTheme.spacing.md,
    paddingTop: currentTheme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: currentTheme.colors.border,
  },

  matchingPortfoliosTitle: {
    fontSize: currentTheme.fontSizes.lg,
    fontWeight: currentTheme.fontWeights.semibold,
    color: '#FFFFFF',
    marginBottom: currentTheme.spacing.md,
    textAlign: 'center',
  },

  matchingPortfoliosList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: currentTheme.spacing.sm,
  },

  matchingPortfolioCard: {
    width: '48%',
    marginBottom: currentTheme.spacing.sm,
    transform: [{ scale: 0.85 }],
  },

  // Skeleton Loading Styles
  skeletonCard: {
    backgroundColor: currentTheme.colors.cardBg,
    borderRadius: currentTheme.borderRadius.lg,
    padding: currentTheme.spacing.lg,
    marginBottom: currentTheme.spacing.md,
    borderWidth: 2,
    borderColor: currentTheme.colors.border,
    ...theme.shadows.medium,
  },

  skeletonUserProfile: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: currentTheme.spacing.md,
    paddingBottom: currentTheme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: currentTheme.colors.border,
  },

  skeletonProfileImage: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: currentTheme.colors.progressBg,
    marginRight: currentTheme.spacing.md,
  },

  skeletonUserInfo: {
    flex: 1,
  },

  skeletonUserName: {
    height: 16,
    backgroundColor: currentTheme.colors.progressBg,
    borderRadius: currentTheme.borderRadius.sm,
    marginBottom: 4,
    width: '60%',
  },

  skeletonUserOffice: {
    height: 12,
    backgroundColor: currentTheme.colors.progressBg,
    borderRadius: currentTheme.borderRadius.sm,
    width: '40%',
  },

  skeletonStatusButtons: {
    flexDirection: 'row',
    gap: currentTheme.spacing.sm,
  },

  skeletonStatusBadge: {
    width: 60,
    height: 24,
    backgroundColor: currentTheme.colors.progressBg,
    borderRadius: currentTheme.borderRadius.sm,
  },

  skeletonHideButton: {
    width: 32,
    height: 32,
    backgroundColor: currentTheme.colors.progressBg,
    borderRadius: 16,
  },

  skeletonContent: {
    marginBottom: currentTheme.spacing.md,
  },

  skeletonTitle: {
    height: 20,
    backgroundColor: currentTheme.colors.progressBg,
    borderRadius: currentTheme.borderRadius.sm,
    marginBottom: currentTheme.spacing.sm,
    width: '80%',
  },

  skeletonDescription: {
    height: 16,
    backgroundColor: currentTheme.colors.progressBg,
    borderRadius: currentTheme.borderRadius.sm,
    marginBottom: currentTheme.spacing.md,
    width: '90%',
  },

  skeletonDetails: {
    marginBottom: currentTheme.spacing.md,
  },

  skeletonDetail: {
    height: 14,
    backgroundColor: currentTheme.colors.progressBg,
    borderRadius: currentTheme.borderRadius.sm,
    marginBottom: 4,
    width: '70%',
  },

  skeletonFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: currentTheme.spacing.md,
    borderTopWidth: 2,
    borderTopColor: currentTheme.colors.border,
  },

  skeletonMatchingButton: {
    width: 120,
    height: 32,
    backgroundColor: currentTheme.colors.progressBg,
    borderRadius: currentTheme.borderRadius.md,
  },

  skeletonContactButtons: {
    flexDirection: 'row',
    gap: currentTheme.spacing.sm,
  },

  skeletonContactButton: {
    width: 40,
    height: 40,
    backgroundColor: currentTheme.colors.progressBg,
    borderRadius: currentTheme.borderRadius.md,
  },

  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: currentTheme.spacing.lg,
  },
  modalCard: {
    backgroundColor: currentTheme.colors.cardBg,
    borderRadius: currentTheme.borderRadius.lg,
    padding: currentTheme.spacing.lg,
    width: '95%',
    maxWidth: 520,
    borderWidth: 1,
    borderColor: currentTheme.colors.border,
  },
  modalTitle: {
    fontSize: currentTheme.fontSizes.xxl,
    fontWeight: currentTheme.fontWeights.bold,
    color: '#FFFFFF',
    marginBottom: currentTheme.spacing.sm,
    textAlign: 'center',
  },
  modalMessage: {
    fontSize: currentTheme.fontSizes.md,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  modalButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: currentTheme.spacing.md,
    marginTop: currentTheme.spacing.lg,
  },
  modalButton: {
    flex: 1,
    paddingVertical: currentTheme.spacing.md,
    borderRadius: currentTheme.borderRadius.md,
    alignItems: 'center',
  },
  modalButtonLarge: {
    paddingVertical: currentTheme.spacing.lg,
    borderRadius: currentTheme.borderRadius.lg,
  },
  modalButtonCancel: {
    backgroundColor: currentTheme.colors.textSecondary,
  },
  modalButtonConfirm: {
    backgroundColor: currentTheme.colors.error,
  },
  modalButtonSingle: {
    alignSelf: 'center',
    marginTop: 12,
  },
  modalButtonTextCancel: {
    color: currentTheme.colors.white,
    fontSize: currentTheme.fontSizes.md,
    fontWeight: currentTheme.fontWeights.semibold,
  },
  modalButtonTextConfirm: {
    color: currentTheme.colors.white,
    fontSize: currentTheme.fontSizes.md,
    fontWeight: currentTheme.fontWeights.semibold,
  },
  modalButtonTextLarge: {
    fontSize: currentTheme.fontSizes.lg,
  },

  // Success Modal Styles (Notlarım ile uyumlu)
  successModalContainer: {
    width: '75%',
    maxWidth: 300,
    borderRadius: 16,
    padding: 32,
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  confirmModalContainer: {
    width: '85%',
    maxWidth: 420,
    borderRadius: 16,
    padding: 28,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  successIconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  successIcon: {
    fontSize: 28,
    color: '#FFF',
    fontWeight: 'bold',
  },
  successIconImage: {
    width: 64,
    height: 64,
    tintColor: currentTheme.colors.success,
  },
  successTitle: {
    fontSize: currentTheme.fontSizes.xxxl + 6,
    fontWeight: currentTheme.fontWeights.bold,
    marginBottom: 12,
    textAlign: 'center',
    color: '#FFFFFF',
  },
  successMessage: {
    fontSize: currentTheme.fontSizes.xl + 2,
    textAlign: 'center',
    lineHeight: 30,
    color: '#FFFFFF',
    fontWeight: '400',
  },
  expiredStatusBadge: {
    alignSelf: 'center',
    marginTop: currentTheme.spacing.lg,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
    borderWidth: 1,
    borderColor: currentTheme.colors.border,
  },
  expiredStatusBadgeText: {
    color: isDark ? '#FFFFFF' : '#1a202c',
    fontWeight: currentTheme.fontWeights.semibold,
    fontSize: currentTheme.fontSizes.sm,
  },
  expiredBadgesRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: currentTheme.spacing.md,
    marginTop: currentTheme.spacing.md,
  },
  expiredDeletionBadge: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
    borderWidth: 1,
    borderColor: currentTheme.colors.border,
  },
  expiredDeletionBadgeText: {
    color: isDark ? '#FFFFFF' : '#1a202c',
    fontWeight: currentTheme.fontWeights.semibold,
    fontSize: currentTheme.fontSizes.sm,
  },

  // Expired Detail Modal header (NotificationOverlay-like)
  expiredDetailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 20,
    paddingRight: 20,
  },
  expiredDetailTitle: {
    fontSize: 22,
    fontWeight: currentTheme.fontWeights.bold,
    color: isDark ? '#FFFFFF' : '#1a202c',
  },
  expiredDetailHeaderDivider: {
    height: 1,
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
    alignSelf: 'stretch',
    marginHorizontal: 10,
    marginBottom: 5,
  },
  expiredDetailHeaderRightClose: {
    marginLeft: 'auto',
  },
  expiredDetailCloseButton: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'crimson',
    justifyContent: 'center',
    alignItems: 'center',
  },
  expiredDetailCloseButtonIcon: {
    color: currentTheme.colors.white,
    fontWeight: currentTheme.fontWeights.bold,
    fontSize: 14,
    lineHeight: 18,
    textAlign: 'center',
  },

});

export default memo(RequestList);

