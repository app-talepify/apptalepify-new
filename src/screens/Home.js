// src/screens/Home.js
// Resimdeki tasarımı birebir uygulayan ana sayfa

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  StyleSheet,
  Dimensions,
  ScrollView,
  SafeAreaView,
  ImageBackground,
  Modal,
  Animated,
  Platform,
} from 'react-native';
import * as Animatable from 'react-native-animatable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
} from '@shopify/react-native-skia';
import GradientBandingFree from '../components/GradientBandingFree';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NOTIF_ENABLED } from '@env';
import { useTheme } from '../theme/ThemeContext';
import { createNeumorphismStyle } from '../theme/styleHelpers';
import AsyncStorage from '@react-native-async-storage/async-storage';
import SubscriptionGuard from '../components/SubscriptionGuard';
import { getFontFamily } from '../utils/fonts';
import { useAuth } from '../context/AuthContext';
import messagingBootstrap from '../services/notifications/messagingBootstrap';
import GlassmorphismView from '../components/GlassmorphismView';
import ArcProgressBar from '../components/ArcProgressBar';
import NotificationOverlay from '../components/NotificationOverlay';
import PortfolioSwipeOverlay from '../components/PortfolioSwipeOverlay';
import { demandPoolCache } from '../services/demandPoolCache';
import { fetchRequests, fetchPortfolios } from '../services/firestore';
import { s as sx, vs, ms, font, clamp } from '../utils/responsive';
 

const { width, height } = Dimensions.get('window');

// (Unused visual helper components removed)

const Home = ({ route }) => {
  const navigation = useNavigation();
  const { theme: currentTheme, isDark } = useTheme();
  const { userProfile, user, unreadCount } = useAuth(); // unreadCount'ı context'ten al
  const insets = useSafeAreaInsets();
  const [isNotificationsVisible, setNotificationsVisible] = useState(false);

  // Tema tabanlı stiller oluştur
  const styles = createStyles(currentTheme, insets, isDark);
  const [progressPercentage, setProgressPercentage] = useState(0);
  const [cachedProfileImage, setCachedProfileImage] = useState(null);
  // Bölgenizde eklenen Talep/Portföyler için durumlar
  const [selectedPeriod, setSelectedPeriod] = useState('today'); // 'today' | 'yesterday' | '7' | '15'
  const [allRequests, setAllRequests] = useState([]);
  const [allPortfolios, setAllPortfolios] = useState([]);
  const [isPortfolioSwipeVisible, setPortfolioSwipeVisible] = useState(false);
  const [overlayPortfolios, setOverlayPortfolios] = useState([]);
  const [overlayMode, setOverlayMode] = useState('new'); // 'new' | 'all'
  const [overlayMeta, setOverlayMeta] = useState({ totalCount: 0, newCount: 0 });
  const [overlayKey, setOverlayKey] = useState(0);
  const [overlayCurrentIndex, setOverlayCurrentIndex] = useState(0);
  const [shouldResumePortfolioSwipe, setShouldResumePortfolioSwipe] = useState(false);
  const [seenPortfoliosByCity, setSeenPortfoliosByCity] = useState({});
  const seenPortfoliosByCityRef = useRef({});
  const requestCountAnim = useRef(new Animated.Value(1)).current;
  const portfolioCountAnim = useRef(new Animated.Value(1)).current;
  const filterOptions = useMemo(() => ([
    { key: 'today', label: 'Bu gün' },
    { key: 'yesterday', label: 'Son 3 gün' },
    { key: '7', label: 'Son 7 gün' },
    { key: '15', label: 'Son 15 gün' },
  ]), []);
  const [filterItemLayouts, setFilterItemLayouts] = useState({}); // { key: { x, width, textX, textW } }
  const [indicatorLeft, setIndicatorLeft] = useState(0);
  const [indicatorWidth, setIndicatorWidth] = useState(0);
  const indicatorTranslateX = useRef(new Animated.Value(0)).current;
  const previousIndicatorLeftRef = useRef(null);
  const previousSelectedPeriodRef = useRef(null);

  // Splash'ten geliş animasyonu için
  const entryFade = useRef(new Animated.Value(0)).current;
  const entryTranslate = useRef(new Animated.Value(18)).current;
  const entryScale = useRef(new Animated.Value(0.85)).current;
  const [fromSplash, setFromSplash] = useState(false);
  // Sayfa düz görüntülensin: giriş/çıkış animasyonları kaldırıldı
  const viewRef = useRef(null);
  const didFirstFocusRef = useRef(false);

  

  // Günlük görevler progress'ini yükle
  const loadDailyTasksProgress = useCallback(async () => {
    try {
      const today = new Date().toDateString();
      const taskKey = `daily_tasks_${user?.uid}_${today}`;
      const savedTasks = await AsyncStorage.getItem(taskKey);

      if (savedTasks) {
        const tasks = JSON.parse(savedTasks);
        const completedTasks = tasks.filter(task => task.current >= task.target).length;
        const progress = Math.round((completedTasks / tasks.length) * 100);
        return progress;
      }
      return 0;
    } catch (error) {
        if (__DEV__) {
          console.error('Load daily tasks progress error:', error);
        }
        return 0;
      }
  }, [user?.uid]);

  // Progress bar değerini doğrudan yükle (animasyon yok)
  useEffect(() => {
    const initializeProgress = async () => {
      const realProgress = await loadDailyTasksProgress();
      setProgressPercentage(realProgress);
    };

    if (user?.uid) {
      initializeProgress();
    }
  }, [user?.uid, loadDailyTasksProgress]);

  // Sayfa focus olduğunda progress'i yenile (animasyon yok)
  useFocusEffect(
    useCallback(() => {
      if (user?.uid) {
        loadDailyTasksProgress().then(progress => {
          setProgressPercentage(progress);
        });
      }
      return () => {};
    }, [user?.uid, loadDailyTasksProgress]),
  );

  // DemandPool'ü arka planda önbelleğe al (ilk girişte bekleme hissini kaldırır)
  useEffect(() => {
    let cancelled = false;
    const prefetch = async () => {
      try {
        // Çok erken çağırmayı engellemek için kısa bir ertleme
        await new Promise(r => setTimeout(r, 200));
        const data = await fetchRequests({}, true);
        if (cancelled) return;
        demandPoolCache.requests = Array.isArray(data) ? data : [];
        demandPoolCache.timestamp = Date.now();
      } catch {}
    };
    prefetch();
    return () => { cancelled = true; };
  }, []);

  // Talep/Portföy veri çekimi
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [reqs, ports] = await Promise.all([
          fetchRequests({}, true),
          fetchPortfolios({}, true),
        ]);
        if (cancelled) return;
        setAllRequests(Array.isArray(reqs) ? reqs : []);
        setAllPortfolios(Array.isArray(ports) ? ports : []);
      } catch {
        if (cancelled) return;
        setAllRequests([]);
        setAllPortfolios([]);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  // Portföy kartları için "görüldü" listesi - kullanıcı + şehir bazlı
  useEffect(() => {
    let cancelled = false;
    const loadSeenPortfolios = async () => {
      try {
        const uid = user?.uid || 'anon';
        const key = `seen_portfolios_v1_${uid}`;
        const raw = await AsyncStorage.getItem(key);
        if (cancelled) return;
        if (!raw) {
          setSeenPortfoliosByCity({});
          seenPortfoliosByCityRef.current = {};
          return;
        }
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          setSeenPortfoliosByCity(parsed);
          seenPortfoliosByCityRef.current = parsed;
        } else {
          setSeenPortfoliosByCity({});
          seenPortfoliosByCityRef.current = {};
        }
      } catch {
        if (!cancelled) {
          setSeenPortfoliosByCity({});
          seenPortfoliosByCityRef.current = {};
        }
      }
    };
    loadSeenPortfolios();
    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  const persistSeenPortfolios = useCallback(
    async (nextState) => {
      try {
        const uid = user?.uid || 'anon';
        const key = `seen_portfolios_v1_${uid}`;
        seenPortfoliosByCityRef.current = nextState || {};
        await AsyncStorage.setItem(key, JSON.stringify(nextState || {}));
      } catch {
        // sessiz fail
      }
    },
    [user?.uid]
  );

  // Filtre değişince küçük bir scale animasyonu uygula (ilk açılışta VE sadece veri değişince tetiklenmesin)
  useEffect(() => {
    const prev = previousSelectedPeriodRef.current;
    // İlk render'da (prev == null) veya aynı değerdeyken animasyon oynatma
    if (prev !== null && prev !== selectedPeriod) {
      Animated.sequence([
        Animated.timing(requestCountAnim, { toValue: 0.92, duration: 100, useNativeDriver: true }),
        Animated.spring(requestCountAnim, { toValue: 1, friction: 6, useNativeDriver: true }),
      ]).start();
      Animated.sequence([
        Animated.timing(portfolioCountAnim, { toValue: 0.92, duration: 100, useNativeDriver: true }),
        Animated.spring(portfolioCountAnim, { toValue: 1, friction: 6, useNativeDriver: true }),
      ]).start();
    }
    previousSelectedPeriodRef.current = selectedPeriod;
  }, [selectedPeriod, requestCountAnim, portfolioCountAnim]);

  // Aktif filtre alt çizgisini animasyonsuz konumlandır
  useEffect(() => {
    const layout = filterItemLayouts[selectedPeriod];
    if (!layout) return;
    const textW = layout.textW || layout.width || 0;
    const leftX = (layout.x || 0) + (layout.textX || 0);
    setIndicatorLeft(leftX);
    setIndicatorWidth(textW);
  }, [selectedPeriod, filterItemLayouts]);

  // Yalnızca yatay kaydırmayı (translateX) native animasyonla uygula
  useEffect(() => {
    if (indicatorWidth === 0) return; // ölçüm yoksa bekle
    if (previousIndicatorLeftRef.current === null) {
      indicatorTranslateX.setValue(indicatorLeft);
    } else {
      Animated.timing(indicatorTranslateX, {
        toValue: indicatorLeft,
        duration: 220,
        useNativeDriver: true,
      }).start();
    }
    previousIndicatorLeftRef.current = indicatorLeft;
  }, [indicatorLeft, indicatorWidth, indicatorTranslateX]);

  const getPeriodBounds = useCallback((key) => {
    const now = new Date();
    const start = new Date();
    const end = new Date();
    // Gün başlangıcı/sonu
    const toStartOfDay = (d) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
    const toEndOfDay = (d) => { const x = new Date(d); x.setHours(23,59,59,999); return x; };
    switch (key) {
      case 'today':
        return { start: toStartOfDay(now), end: toEndOfDay(now) };
      case 'yesterday': {
        const s = new Date(now);
        s.setDate(now.getDate() - 2); // bugün + önceki 2 gün = son 3 gün
        return { start: toStartOfDay(s), end: toEndOfDay(now) };
      }
      case '7': {
        const s = new Date(now);
        s.setDate(now.getDate() - 6); // bugün + önceki 6 gün
        return { start: toStartOfDay(s), end: toEndOfDay(now) };
      }
      case '15': {
        const s = new Date(now);
        s.setDate(now.getDate() - 14);
        return { start: toStartOfDay(s), end: toEndOfDay(now) };
      }
      default:
        return { start: toStartOfDay(now), end: toEndOfDay(now) };
    }
  }, []);

  const getPeriodLabel = useCallback((key) => {
    if (key === 'today') return 'Bu gün';
    if (key === 'yesterday') return 'Son 3 gün';
    if (key === '7') return 'Son 7 gün';
    if (key === '15') return 'Son 15 gün';
    return 'Bu gün';
  }, []);

  const safeToDate = (v) => {
    try {
      if (!v) return null;
      return v instanceof Date ? v : new Date(v);
    } catch { return null; }
  };

  const normalizeCity = useCallback((c) => {
    if (typeof c !== 'string') return '';
    try { return c.trim().toLocaleLowerCase('tr-TR'); } catch { return c.trim().toLowerCase(); }
  }, []);

  const computeCounts = useCallback(() => {
    const { start, end } = getPeriodBounds(selectedPeriod);
    const userCityNorm = normalizeCity(userProfile?.city);

    const inRange = (d) => {
      const dt = safeToDate(d);
      if (!dt) return false;
      return dt >= start && dt <= end;
    };

    const byCity = (item) => {
      if (!userCityNorm) return true;
      return normalizeCity(item?.city) === userCityNorm;
    };

    const requestOk = (r) => {
      const pub = r?.isPublished;
      const pool = r?.publishToPool;
      const pubOk = (pub === undefined) || pub === true;
      const poolOk = (pool === undefined) || pool === true;
      return pubOk && poolOk;
    };

    const portfolioOk = (p) => {
      const pub = p?.isPublished;
      return (pub === undefined) || pub === true;
    };

    const requestCount = (allRequests || []).filter((r) => requestOk(r) && byCity(r) && inRange(r?.createdAt)).length;

    const cityKey = userCityNorm || 'all';
    const seenForCity = seenPortfoliosByCityRef.current?.[cityKey] || {};

    const portfoliosInFilter = (allPortfolios || []).filter(
      (p) => portfolioOk(p) && byCity(p) && inRange(p?.createdAt)
    );
    const portfolioTotalCount = portfoliosInFilter.length;
    const portfolioNewCount = portfoliosInFilter.filter((p) => !seenForCity[p?.id]).length;

    return { requestCount, portfolioTotalCount, portfolioNewCount };
  }, [
    allRequests,
    allPortfolios,
    selectedPeriod,
    userProfile?.city,
    getPeriodBounds,
    normalizeCity,
    seenPortfoliosByCityRef,
  ]);

  const computeOverlayPortfolios = useCallback(
    ({ includeSeen } = { includeSeen: false }) => {
      const { start, end } = getPeriodBounds(selectedPeriod);
      const userCityNorm = normalizeCity(userProfile?.city);

      const safeToDateLocal = (v) => {
        try { if (!v) return null; return v instanceof Date ? v : new Date(v); } catch { return null; }
      };
      const inRange = (d) => {
        const dt = safeToDateLocal(d);
        if (!dt) return false;
        return dt >= start && dt <= end;
      };

      const cityKey = userCityNorm || 'all';
      const seenForCity = seenPortfoliosByCityRef.current?.[cityKey] || {};

      const items = (allPortfolios || []).filter((p) => {
        const pub = p?.isPublished;
        const pubOk = (pub === undefined) || pub === true;
        const byCity = !userCityNorm ? true : normalizeCity(p?.city) === userCityNorm;
        if (!pubOk || !byCity || !inRange(p?.createdAt)) return false;
        if (includeSeen) return true;
        return !seenForCity[p?.id];
      });
      // Son eklenenleri öne al: createdAt desc
      items.sort((a, b) => {
        const da = safeToDateLocal(a?.createdAt)?.getTime?.() || 0;
        const db = safeToDateLocal(b?.createdAt)?.getTime?.() || 0;
        return db - da;
      });
      return items;
    },
    [allPortfolios, selectedPeriod, userProfile?.city, getPeriodBounds, normalizeCity]
  );

  const openPortfolioSwipe = useCallback(() => {
    const allItems = computeOverlayPortfolios({ includeSeen: true }) || [];
    const newItems = computeOverlayPortfolios({ includeSeen: false }) || [];

    setOverlayPortfolios(newItems);
    setOverlayMode('new');
    setOverlayMeta({ totalCount: allItems.length, newCount: newItems.length });
    setOverlayCurrentIndex(0);
    setOverlayKey((k) => k + 1);

    // Overlay bazen kapanma animasyonunda yakalanıp hemen tekrar açılamıyordu.
    // Önce görünürlüğü kapatıp, bir sonraki "tick"te tekrar açarak her zaman
    // temiz bir açılış garantiliyoruz.
    setPortfolioSwipeVisible(false);
    setTimeout(() => {
      setPortfolioSwipeVisible(true);
    }, 0);
  }, [computeOverlayPortfolios]);

  const handlePortfoliosSeenInOverlay = useCallback(
    (items) => {
      if (!Array.isArray(items) || items.length === 0) return;
      const userCityNorm = normalizeCity(userProfile?.city);
      const cityKey = userCityNorm || 'all';

      // Kaynağı ref.current olarak kullan, state'i onunla senkronize et
      const prevState = seenPortfoliosByCityRef.current || {};
      const currentForCity = prevState[cityKey] || {};
      const nextForCity = { ...currentForCity };
      items.forEach((p) => {
        if (p?.id) {
          nextForCity[p.id] = true;
        }
      });
      const nextState = { ...prevState, [cityKey]: nextForCity };
      seenPortfoliosByCityRef.current = nextState;
      setSeenPortfoliosByCity(nextState);
      // Persist in background
      persistSeenPortfolios(nextState);
    },
    [normalizeCity, userProfile?.city, persistSeenPortfolios]
  );

  const handlePortfolioResetBadge = useCallback(() => {
    const userCityNorm = normalizeCity(userProfile?.city);
    const cityKey = userCityNorm || 'all';

    // Küçük bir animasyonla badge'i vurgula
    try {
      portfolioCountAnim.setValue(0.92);
      Animated.spring(portfolioCountAnim, {
        toValue: 1,
        friction: 6,
        useNativeDriver: true,
      }).start();
    } catch {}

    const prevState = seenPortfoliosByCityRef.current || {};
    if (!prevState[cityKey]) {
      return;
    }
    const nextState = { ...prevState };
    delete nextState[cityKey];
    seenPortfoliosByCityRef.current = nextState;
    setSeenPortfoliosByCity(nextState);
    // Persist in background
    persistSeenPortfolios(nextState);
  }, [normalizeCity, userProfile?.city, persistSeenPortfolios, portfolioCountAnim]);

  const handlePortfolioReplayAll = useCallback(() => {
    // Overlay içindeki yenile butonu da badge'deki yenile ile aynı reset davranışını göstersin
    handlePortfolioResetBadge();

    const allItems = computeOverlayPortfolios({ includeSeen: true }) || [];
    setOverlayPortfolios(allItems);
    setOverlayMode('all');
    setOverlayMeta({
      totalCount: allItems.length,
      newCount: overlayMeta?.newCount || 0,
    });
    setOverlayCurrentIndex(0);
    setOverlayKey((k) => k + 1);
    setPortfolioSwipeVisible(true);
  }, [computeOverlayPortfolios, overlayMeta, handlePortfolioResetBadge]);

  // Swipe overlay'de GEÇ / FAVORİYE EKLE yapılan her kartı kalıcı olarak "görüldü" işaretle
  const handlePortfolioSeenInSwipe = useCallback(
    (portfolio) => {
      if (!portfolio?.id) return;
      const userCityNorm = normalizeCity(userProfile?.city);
      const cityKey = userCityNorm || 'all';

      const prevState = seenPortfoliosByCityRef.current || {};
      const currentForCity = prevState[cityKey] || {};
      if (currentForCity[portfolio.id]) {
        return;
      }
      const nextForCity = { ...currentForCity, [portfolio.id]: true };
      const nextState = { ...prevState, [cityKey]: nextForCity };
      seenPortfoliosByCityRef.current = nextState;
      setSeenPortfoliosByCity(nextState);
      // Arka planda AsyncStorage'a yaz
      persistSeenPortfolios(nextState);
    },
    [normalizeCity, userProfile?.city, persistSeenPortfolios],
  );

  const handleOpenPortfolioDetails = useCallback((portfolio) => {
    try {
      if (portfolio?.id) {
        navigation.navigate('PropertyDetail', {
          portfolioId: portfolio.id,
          portfolio,
          fromScreen: 'Home',
          fromPortfolioSwipeOverlay: true,
        });
        setPortfolioSwipeVisible(false);
        // Detaydan geri gelindiğinde aynı karttan devam etmek için işaretle
        setShouldResumePortfolioSwipe(true);
      }
    } catch {}
  }, [navigation, setPortfolioSwipeVisible]);

  // Bildirim izni isteme - Home ekranı render olduktan 2 saniye sonra
  useEffect(() => {
    const requestNotificationPermission = async () => {
      // Kullanıcı yoksa skip
      if (!user?.uid) {
        return;
      }

      // 2 saniye bekle (kullanıcı ekranı görsün)
      await new Promise(resolve => setTimeout(resolve, 2000));

      try {
        if (NOTIF_ENABLED && NOTIF_ENABLED !== 'false') {
          if (__DEV__) {
            console.log('[Home] Bildirim bootstrap başlatılıyor, uid:', user.uid);
          }
          const result = await messagingBootstrap.bootstrapMessaging(user.uid);
          if (__DEV__) {
            console.log('[Home] Bildirim bootstrap sonucu:', result);
          }
        } else {
          if (__DEV__) {
            console.log('[Home] Bildirimler devre dışı, NOTIF_ENABLED:', NOTIF_ENABLED);
          }
        }
      } catch (error) {
        if (__DEV__) {
          console.warn('[Home] Bildirim izni hatası:', {
            message: error?.message,
            stack: error?.stack,
            name: error?.name,
            code: error?.code,
            fullError: error,
          });
        }
      }

      // İstendiğini işaretle (tekrar isteme)
      // setNotificationPermissionRequested(true);
    };

    requestNotificationPermission();
  }, [user?.uid]); // notificationPermissionRequested dependency'sini kaldırdık

  // Uygulama açılır açılmaz cached profil resmini yükle
  useEffect(() => {
    const loadCachedProfileImage = async () => {
      try {
        const cached = await AsyncStorage.getItem('cached_profile_image');
        if (cached) {
          setCachedProfileImage(cached);
        }
      } catch (error) {
        if (__DEV__) {
          console.log('Cached profile image load error:', error);
        }
      }
    };

    loadCachedProfileImage();
  }, []);

  // UserProfile değiştiğinde cache'i güncelle
  useEffect(() => {
    const updateCachedProfileImage = async () => {
      if (userProfile?.profilePicture && userProfile.profilePicture !== 'default-logo') {
        try {
          // Yeni resmi cache'e kaydet
          await AsyncStorage.setItem('cached_profile_image', userProfile.profilePicture);
          setCachedProfileImage(userProfile.profilePicture);

          // Arka planda preload et (sonraki açılışlar için)
          Image.prefetch(userProfile.profilePicture);
        } catch (error) {
          if (__DEV__) {
            console.log('Profile image cache error:', error);
          }
        }
      } else if (userProfile) {
        // Profil resmi yoksa cache'i temizle
        try {
          await AsyncStorage.removeItem('cached_profile_image');
          setCachedProfileImage(null);
        } catch (error) {
          if (__DEV__) {
            console.log('Profile image cache clear error:', error);
          }
        }
      }
    };

    if (userProfile) {
      updateCachedProfileImage();
    }
  }, [userProfile]);

  // Başka sayfalardan Home'a gelince kısa bir giriş animasyonu (Profil ekranındaki gibi)
  useFocusEffect(
    useCallback(() => {
      // Artık Home'da animasyon SADECE Splash'ten gelirken oynatılacak.
      // Diğer odaklanmalarda animasyon yok.
      didFirstFocusRef.current = true;
      return () => {};
    }, [fromSplash])
  );

  // Splash'ten geliş kontrolü ve animasyon
  useEffect(() => {
    // İlk mount'ta kontrol et - splash'ten mi geliyoruz?
    const checkFromSplash = () => {
      try {
        const state = navigation.getState();
        const routes = state?.routes || [];
        const currentIndex = state?.index || 0;
        
        // Eğer ilk ekrandaysak ve bir önceki route yoksa, muhtemelen splash'ten geliyoruz
        if (currentIndex === 0 && routes.length === 1) {
          // İlk açılış - muhtemelen splash'ten
          return true;
        }
        
        // Önceki route'u kontrol et
        if (currentIndex > 0) {
          const previousRoute = routes[currentIndex - 1];
          if (previousRoute?.name === 'Splash') {
            return true;
          }
        }
      } catch (error) {
        // Hata durumunda default olarak animasyon göster
        return true;
      }
      return false;
    };

    const isFromSplash = checkFromSplash();
    
    if (isFromSplash) {
      setFromSplash(true);
      // Splash'ten geliniyorsa sadece İLK AÇILIŞTA hafif bir giriş animasyonu oynat
      entryFade.setValue(0);
      entryTranslate.setValue(18);
      entryScale.setValue(0.95);
      Animated.parallel([
        Animated.timing(entryFade, { toValue: 1, duration: 380, useNativeDriver: true }),
        Animated.timing(entryTranslate, { toValue: 0, duration: 380, useNativeDriver: true }),
        Animated.timing(entryScale, { toValue: 1, duration: 380, useNativeDriver: true }),
      ]).start();
    } else {
      // Splash'ten gelinmiyorsa animasyon yok, direkt görünür başlat
      entryFade.setValue(1);
      entryTranslate.setValue(0);
      entryScale.setValue(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Detay ekranından Home'a geri dönüldüğünde swipe overlay'i kaldığı yerden tekrar aç
  useFocusEffect(
    useCallback(() => {
      if (shouldResumePortfolioSwipe && overlayPortfolios.length > 0) {
        setPortfolioSwipeVisible(true);
        setShouldResumePortfolioSwipe(false);
      }
      return () => {};
    }, [shouldResumePortfolioSwipe, overlayPortfolios.length]),
  );

  // TAB sistemi AYNEN kopyalandı - Fetch unread notifications count periodically and when state/tab changes
  // BU BLOK AuthContext'e TAŞINDIĞI İÇİN SİLİNDİ

  const getIconSource = useCallback((iconName) => {
    const iconMap = {
      'ajandaicon': require('../assets/images/icons/calendar.png'),
      'notlaricon': require('../assets/images/icons/note.png'),
      'gorevlericon': require('../assets/images/icons/tasks.png'),
      'haberlericon': require('../assets/images/icons/newss.png'),
      'rediicon': require('../assets/images/icons/credit.png'),
      'favicon': require('../assets/images/icons/Favorite_fill.png'),
      'destekicon': require('../assets/images/icons/musteridestek.png'),
      'favporticon': require('../assets/images/icons/portfoy.png'),
      'komisyonicon': require('../assets/images/icons/komisyon.png'),
      'portanaicon': require('../assets/images/portanaicon.png'),
      'talanaicon': require('../assets/images/talanaicon.png'),
      'logo': require('../assets/images/logo.png'),
    };
    return iconMap[iconName] || require('../assets/images/logo.png');
  }, []);

  // Animasyonlar kaldırıldı: yardımcı render fonksiyonları sadeleştirildi veya kaldırıldı

  // --- BU KONTROL PANELİ İLE "YENİ ÖZELLİK" BÖLÜMÜNÜ YÖNETEBİLİRSİNİZ ---
  // Profile.js'teki ayarların birebir aynısı kopyalandı.
  const newFeatureConfig = {
    overlayColor: 'rgba(255, 0, 0, 0.81)',
    startColor: 'rgba(17, 36, 49, 1)',
    endColor: 'rgba(17, 36, 49, 0.83)',
    gradientAlpha: 0.9,
    gradientDirection: 45,
    gradientSpread: 10,
    ditherStrength: 6, // Değer artırıldı.
  };

  // --- BU KONTROL PANELİ İLE "GÜNLÜK GÖREVLER" BÖLÜMÜNÜ YÖNETEBİLİRSİNİZ ---
  const dailyTasksConfig = {
    overlayColor: 'rgba(224, 220, 220, 0.81)',
    startColor: 'rgb(255, 255, 255)',
    endColor: 'rgba(255, 255, 255, 0.83)',
    gradientAlpha: 1,
    gradientDirection: 160,
    gradientSpread: 16,
    ditherStrength: 10.0,
  };

  // --- BU KONTROL PANELİ İLE "ALT NAVİGASYON" BÖLÜMÜNÜ YÖNETEBİLİRSİNİZ ---
  const bottomNavConfig = {
    overlayColor: 'rgba(247, 241, 241, 0.04)',
    startColor: 'rgba(220, 20, 60, 1)',
    endColor: 'rgba(220, 20, 60, 0.69)',
    gradientAlpha: 1,
    gradientDirection: 150,
    gradientSpread: 5,
    ditherStrength: 4.0,
  };

  // --- BU KONTROL PANELİ İLE "BEŞLİ BUTON" BÖLÜMÜNÜ YÖNETEBİLİRSİNİZ ---
  const fiveButtonsConfig = {
    overlayColor: 'rgba(247, 241, 241, 0.04)',
    startColor: 'rgba(17, 36, 49, 1)',
    endColor: 'rgba(17, 36, 49, 0.51)',
    gradientAlpha: 1,
    gradientDirection: 180,
    gradientSpread: 8,
    ditherStrength: 10.0,
  };

  const hasNewPortfoliosForSelectedPeriod = useMemo(() => {
    const { portfolioNewCount } = computeCounts();
    return portfolioNewCount > 0;
  }, [computeCounts]);

  return (
    <SubscriptionGuard>
      <Animatable.View ref={viewRef} style={{ flex: 1 }} useNativeDriver>
      <Animated.View style={fromSplash ? {
        flex: 1,
        opacity: entryFade,
        transform: [
          { translateY: entryTranslate },
          { scale: entryScale },
        ],
      } : { flex: 1 }}>
        <ImageBackground
          source={isDark ? require('../assets/images/dark-bg.jpg') : require('../assets/images/light-bg.jpg')}
          defaultSource={isDark ? require('../assets/images/dark-bg.jpg') : require('../assets/images/light-bg.jpg')}
          fadeDuration={0}
          style={[styles.backgroundImage, { backgroundColor: isDark ? '#071317' : '#FFFFFF' }]}
          resizeMode="cover"
        >
          <SafeAreaView style={styles.safeArea}>
          <View style={styles.container}>
            <ScrollView
              style={styles.content}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}
              // Anasayfa sabit olacak: kaydırmayı tamamen kapat
              scrollEnabled={false}
              bounces={false}
              overScrollMode="never"
              alwaysBounceVertical={false}
            >
              <View>

                {/* Boş Container - Üstte - Profil resmi içinde - Skia Gradient */}
                <View style={styles.emptyContainer}>
                  {/* Skia Gradient Background - Krimson şeffaf geçişli - GÖRÜNMEZ */}
                  <GradientBandingFree
                    width={width - 2 * Math.min(width * 0.03, 15)}
                    height={Math.min(height * 0.44, 330)}
                    start="#DC143C"
                    end="#8B0000"
                    alpha={0.0}
                    direction={0.5}
                    ditherStrength={2.5}
                    borderRadius={Math.min(width * 0.06, 25)}
                    style={styles.emptyContainerGradientStyle}
                  />
                  <View style={styles.emptyContainerContent}>
                    {/* Cizgi.png - Container üstüne - Beyaz */}
                    <Image
                      source={require('../assets/images/icons/cizgi.png')}
                      style={[styles.cizgiImage, { tintColor: '#FFFFFF' }]}
                      resizeMode="contain"
                    />
                    {/* Profil Resmi - Container içinde */}
                    <View style={styles.profileImageContainer}>
                      <TouchableOpacity
                        style={styles.profileImageButton}
                        onPress={() => navigation.navigate('Profil')}
                      >
                        <Image
                          source={
                            cachedProfileImage
                              ? { uri: cachedProfileImage }
                              : require('../assets/images/logo-krimson.png')
                          }
                          style={styles.profileImage}
                          resizeMode="cover"
                        />
                      </TouchableOpacity>

                      {/* Merhaba yazısı */}
                      <View style={styles.greetingContainer}>
                        <View style={styles.greetingRow}>
                          <View style={styles.greetingTextContainer}>
                            <Text style={styles.greetingText}>
                              Merhaba, <Text style={styles.userNameText}>
                                {userProfile?.displayName || user?.displayName || 'Kullanıcı'}
                              </Text>
                            </Text>

                            {/* Ofis ismi */}
                            {userProfile?.officeName && (
                              <Text style={styles.officeNameText}>
                                {userProfile.officeName}
                              </Text>
                            )}
                          </View>

                          {/* Bildirim İkonu - İsim ile aynı satırda */}
                          <TouchableOpacity
                            style={styles.notificationIconContainer}
                            onPress={() => {
                              // Bildirimler overlay'ini aç
                              setNotificationsVisible(true);
                            }}
                          >
                            <Image
                              source={require('../assets/images/icons/bell.png')}
                              style={styles.notificationIcon}
                              resizeMode="contain"
                            />
                            {unreadCount > 0 && (
                                <View style={styles.notificationBadge}>
                                    <Text style={styles.notificationBadgeText}>
                                        {unreadCount > 99 ? '99+' : unreadCount}
                                    </Text>
                                </View>
                            )}
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>

                    {/* Alt Container - Container'ın en altında - Çok geniş */}
                    <View style={styles.bottomInnerContainer}>
                      <GlassmorphismView
                        style={StyleSheet.absoluteFill}
                        borderRadius={Math.min(width * 0.04, 16)}
                        blurEnabled={false}
                        config={dailyTasksConfig}
                      />
                      <View style={styles.bottomInnerContent}>
                        <TouchableOpacity
                          activeOpacity={0.8}
                          onPress={() => navigation.navigate('DailyTasks')}
                        >
                          <View style={styles.titleAndProgressRow}>
                            {/* Başlık - Sol Tarafta */}
                            <View style={styles.titleWrapper}>
                              <Text style={styles.bottomInnerTitle}>
                                Bu gün tamamladığın görevler...
                              </Text>
                            </View>

                            {/* Progress Bar - Sağ Tarafta */}
                            <View style={styles.arcProgressBarContainer}>
                              <ArcProgressBar
                                size={ms(60)}
                                strokeWidth={8}
                                progress={Math.min(100, Math.max(2, progressPercentage))}
                                activeColor="#DC143C"
                                inactiveColor="#323232"
                              >
                                <Text style={styles.arcProgressText}>
                                  {`${Math.min(100, Math.max(0, progressPercentage))}`}
                                  <Text style={styles.arcProgressPercent}>%</Text>
                                </Text>
                              </ArcProgressBar>
                            </View>
                          </View>
                        </TouchableOpacity>

                        {/* Ayırıcı Çizgi - Progress bar'ın altında */}
                        <View style={styles.innerDivider} />

                        {/* İkonlar Row - 4 adet yan yana */}
                        <View style={styles.iconsRow}>
                          {/* Ajanda */}
                          <TouchableOpacity
                            style={styles.iconItem}
                            activeOpacity={0.8}
                            onPress={() => navigation.navigate('Calendar')}
                          >
                            <Image source={require('../assets/images/icons/calendar.png')} style={styles.iconImage} />
                            <Text style={styles.iconText}>Ajanda</Text>
                          </TouchableOpacity>

                          {/* Notlarım */}
                          <TouchableOpacity
                            style={styles.iconItem}
                            activeOpacity={0.8}
                            onPress={() => navigation.navigate('Notes')}
                          >
                            <Image source={require('../assets/images/icons/note.png')} style={styles.iconImage} />
                            <Text style={styles.iconText}>Notlarım</Text>
                          </TouchableOpacity>

                          {/* Görevler */}
                          <TouchableOpacity
                            style={styles.iconItem}
                            activeOpacity={0.8}
                            onPress={() => navigation.navigate('DailyTasks')}
                          >
                            <Image source={require('../assets/images/icons/tasks.png')} style={styles.iconImage} />
                            <Text style={styles.iconText}>Görevler</Text>
                          </TouchableOpacity>

                          {/* Haberler */}
                          <TouchableOpacity
                            style={styles.iconItem}
                            activeOpacity={0.8}
                            onPress={() => navigation.navigate('NewsList')}
                          >
                            <Image source={require('../assets/images/icons/newss.png')} style={styles.iconImage} />
                            <Text style={styles.iconText}>Haberler</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  </View>
                </View>

                {/* 5 Adet Alt Butonlar - Yeni GlassmorphismView Sistemi */}
                <GlassmorphismView
                  style={styles.bottomButtonsContainer}
                  borderRadius={Math.min(width * 0.04, 15)}
                  blurEnabled={false}
                  config={fiveButtonsConfig}
                >
                  {/* Butonlar içeriği */}
                  <View style={styles.bottomButtonsContent}>
                    {/* D. Kazanç Hesaplama */}
                    <TouchableOpacity 
                      style={styles.bottomButtonItem} 
                      activeOpacity={0.8}
                      onPress={() => navigation.navigate('PropertyValueCalculator')}
                    >
                      <Image source={require('../assets/images/icons/credit.png')} style={styles.bottomButtonIcon} />
                      <Text style={styles.bottomButtonText}>D. Kazanç{'\n'}Hesaplama</Text>
                    </TouchableOpacity>

                    {/* Favori Talepler */}
                    <TouchableOpacity 
                      style={styles.bottomButtonItem} 
                      activeOpacity={0.8}
                      onPress={() => navigation.navigate('DemandPool', { showFavorites: true })}
                    >
                      <Image source={require('../assets/images/icons/Favorite_fill.png')} style={styles.bottomButtonIcon} />
                      <Text style={styles.bottomButtonText}>Favori{'\n'}Talepler</Text>
                    </TouchableOpacity>

                    {/* Danışman Destek */}
                    <TouchableOpacity
                      style={styles.bottomButtonItem}
                      activeOpacity={0.8}
                      onPress={() => navigation.navigate('HelpAndSupport')}
                    >
                      <Image source={require('../assets/images/icons/musteridestek.png')} style={styles.bottomButtonIcon} />
                      <Text style={styles.bottomButtonText}>Danışman{'\n'}Destek</Text>
                    </TouchableOpacity>

                    {/* Favori Portföyler */}
                    <TouchableOpacity 
                      style={styles.bottomButtonItem} 
                      activeOpacity={0.8}
                      onPress={() => navigation.navigate('PortfolioList', { showFavorites: true })}
                    >
                      <Image source={require('../assets/images/icons/portfoy.png')} style={styles.bottomButtonIcon} />
                      <Text style={styles.bottomButtonText}>Favori{'\n'}Portföyler</Text>
                    </TouchableOpacity>

                    {/* Komisyon Hesaplama */}
                    <TouchableOpacity 
                      style={styles.bottomButtonItem} 
                      activeOpacity={0.8}
                      onPress={() => navigation.navigate('CommissionCalculator')}
                    >
                      <Image source={require('../assets/images/icons/komisyon.png')} style={styles.bottomButtonIcon} />
                      <Text style={styles.bottomButtonText}>Komisyon{'\n'}Hesaplama</Text>
                    </TouchableOpacity>
                  </View>
                </GlassmorphismView>

                {/* Hakkında Bölümü - Yeni GlassmorphismView Sistemi */}
                <View 
                  style={styles.aboutSectionContainer}
                >
                  <GlassmorphismView
                    style={styles.simpleGradientContainer}
                    borderRadius={15}
                    blurEnabled={false} // Blur kaldırıldı.
                    config={newFeatureConfig}
                  >
                    <View style={styles.statsSectionContainer}>
                      {/* Yalnızca filtreler - Ortalanmış, arkaplansız yazı */}
                      <View style={styles.filterRow}>
                          {filterOptions.map(({ key, label }) => {
                          const active = selectedPeriod === key;
                          return (
                            <TouchableOpacity
                              key={key}
                              onPress={() => setSelectedPeriod(key)}
                              activeOpacity={0.8}
                              style={[styles.filterChip, active && styles.filterChipActive]}
                              onLayout={(e) => {
                                const { x, width: w } = e.nativeEvent.layout;
                                setFilterItemLayouts(prev => ({ ...prev, [key]: { ...(prev[key] || {}), x, width: w } }));
                              }}
                            >
                              <Text
                                style={[styles.filterChipText, active && styles.filterChipTextActive]}
                                onLayout={(e) => {
                                  const { x: tx, width: tw } = e.nativeEvent.layout;
                                  setFilterItemLayouts(prev => ({ ...prev, [key]: { ...(prev[key] || {}), textX: tx, textW: tw } }));
                                }}
                              >{label}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                      <View style={styles.filtersDivider}>
                        <Animated.View style={[
                          styles.filtersDividerIndicator,
                          { left: 0, width: indicatorWidth, transform: [{ translateX: indicatorTranslateX }] }
                        ]} />
                      </View>

                      {/* Sayılar */}
                      {(() => {
                        const { requestCount, portfolioTotalCount, portfolioNewCount } = computeCounts();
                        const periodText = getPeriodLabel(selectedPeriod);
                        const hasNewPortfolios = portfolioNewCount > 0;
                        const hasAnyPortfolios = portfolioTotalCount > 0;
                        return (
                          <View style={styles.statsLinesContainer}>
                            <Animated.View style={[styles.statsBadge, { transform: [{ scale: requestCountAnim }] }]}>
                              <View style={styles.statsBadgeMain}>
                                <Image source={require('../assets/images/icons/talep.png')} style={styles.statsIcon} />
                                <Text style={styles.statsBadgeText}>{`${periodText} Şehrinde ${requestCount} Talep Eklendi`}</Text>
                              </View>
                            </Animated.View>
                            <Animated.View
                              style={[
                                styles.statsBadge,
                                hasNewPortfolios && styles.statsBadgeHasNew,
                                { transform: [{ scale: portfolioCountAnim }] },
                              ]}
                            >
                              <TouchableOpacity
                                activeOpacity={0.9}
                                onPress={openPortfolioSwipe}
                                style={styles.statsBadgeMain}
                              >
                                <Image
                                  source={require('../assets/images/icons/portfoy.png')}
                                  style={[
                                    styles.statsIcon,
                                    hasNewPortfolios && styles.statsIconHasNew,
                                  ]}
                                />
                                <Text
                                  style={[
                                    styles.statsBadgeText,
                                    hasNewPortfolios && styles.statsBadgeTextHasNew,
                                  ]}
                                >
                                  {`${periodText} Şehrinde ${portfolioNewCount} Portföy eklendi`}
                                </Text>
                              </TouchableOpacity>
                              {hasAnyPortfolios && (
                                <TouchableOpacity
                                  activeOpacity={0.9}
                                  onPress={handlePortfolioResetBadge}
                                  style={styles.statsBadgeRefreshButton}
                                >
                                  <Image
                                    source={require('../assets/images/icons/repeat.png')}
                                    style={styles.statsBadgeRefreshIcon}
                                  />
                                </TouchableOpacity>
                              )}
                            </Animated.View>
                          </View>
                        );
                      })()}
                    </View>
                  </GlassmorphismView>
                </View>

              </View>
            </ScrollView>
            <NotificationOverlay 
              isVisible={isNotificationsVisible} 
              onClose={() => setNotificationsVisible(false)}
            >
              <Text style={{color: isDark ? 'white' : 'black'}}>Bildirimler buraya gelecek...</Text>
            </NotificationOverlay>

            <PortfolioSwipeOverlay
              key={overlayKey}
              visible={isPortfolioSwipeVisible}
              portfolios={overlayPortfolios}
              onClose={() => setPortfolioSwipeVisible(false)}
              onOpenDetails={handleOpenPortfolioDetails}
              userId={user?.uid}
              mode={overlayMode}
              totalCount={overlayMeta.totalCount}
              newCount={overlayMeta.newCount}
              markSeenOnComplete={overlayMode === 'new'}
              onAllSeen={handlePortfoliosSeenInOverlay}
              onReplayAll={handlePortfolioReplayAll}
              initialIndex={overlayCurrentIndex}
              onIndexChange={setOverlayCurrentIndex}
              onPortfolioSeen={handlePortfolioSeenInSwipe}
            />

            {/* Alt Navigasyon Butonları - Her ekran boyutunda aynı görünüm */}
            <View style={styles.bottomNavigationButtons}>
              <View style={styles.bottomNavigationWrapper}>
                <GlassmorphismView
                  style={[styles.bottomNavigationButton, { backgroundColor: bottomNavConfig.startColor }]}
                  borderRadius={12}
                  blurEnabled={false}
                  width={width - 40}
                  height={60}
                  config={bottomNavConfig}
                >
                  <View style={styles.bottomNavContent}>
                    {/* Portföy Havuzu Butonu */}
                    <TouchableOpacity
                      style={styles.bottomHalfButton}
                      onPress={() => navigation.navigate('PortfolioMap', { fromScreen: 'Home' })}
                      activeOpacity={0.8}
                      delayPressIn={0}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Image
                        source={require('../assets/images/icons/portfoy.png')}
                        style={styles.bottomNavButtonIcon}
                      />
                      <Text style={styles.bottomNavButtonText}>Portföy{'\n'}Havuzu</Text>
                    </TouchableOpacity>

                    {/* Dikey Ayırıcı Çizgi */}
                    <View style={styles.bottomButtonDivider} />

                    {/* Talep Havuzu Butonu */}
                    <TouchableOpacity
                      style={styles.bottomHalfButton}
                      onPress={() => navigation.navigate('DemandPool')}
                      activeOpacity={0.8}
                      delayPressIn={0}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={styles.bottomNavButtonText}>Talep{'\n'}Havuzu</Text>
                      <Image
                        source={require('../assets/images/icons/talep.png')}
                        style={styles.bottomNavButtonIcon}
                      />
                    </TouchableOpacity>
                  </View>
                </GlassmorphismView>
              </View>
            </View>
          </View>
          </SafeAreaView>
        </ImageBackground>
      </Animated.View>
      </Animatable.View>
    </SubscriptionGuard>
  );
};

// Tema tabanlı stiller oluştur
const createStyles = (currentTheme, insets, isDark) => StyleSheet.create({
  // SafeAreaView - Tüm telefonlarda status bar'dan kaçınır
  safeArea: {
    flex: 1,
    backgroundColor: 'transparent',
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
    zIndex: -1, // En arkada kalması için
  },

  // Section padding
  sectionPadding: {
    paddingHorizontal: 20,
  },

  // Profil Resmi Container - Optimized Responsive
  profileImageContainer: {
    position: 'absolute',
    top: vs(10), // Küçük telefonlarda daha az üst boşluk
    left: ms(15), // Küçük telefonlarda daha az sol boşluk
    zIndex: 15, // Container'ın üstünde
    flexDirection: 'row', // Yatay düzenleme
    alignItems: 'center', // Dikey ortalama
  },

  // Profil Resmi Butonu - Optimized Responsive
  profileImageButton: {
    width: ms(55), // Küçük telefonlarda daha küçük
    height: ms(55), // Küçük telefonlarda daha küçük
    borderRadius: ms(28), // Küçük telefonlarda daha küçük radius
    borderWidth: ms(2.5), // Küçük telefonlarda daha ince border
    borderColor: '#DC143C', // Krimson çerçeve
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    shadowColor: '#DC143C',
    shadowOffset: {
      width: 0,
      height: vs(3), // Küçük telefonlarda daha az gölge
    },
    shadowOpacity: 0.25, // Küçük telefonlarda daha az opaklık
    shadowRadius: ms(10), // Küçük telefonlarda daha küçük radius
    elevation: 6, // Küçük telefonlarda daha az elevation
  },

  // Profil Resmi - Optimized Responsive
  profileImage: {
    width: ms(45), // Küçük telefonlarda daha küçük
    height: ms(45), // Küçük telefonlarda daha küçük
    borderRadius: ms(22), // Küçük telefonlarda daha küçük radius
  },

  // Merhaba yazısı Container - Optimized Responsive
  greetingContainer: {
    marginLeft: ms(10), // Küçük telefonlarda daha az boşluk
    marginTop: vs(3), // Küçük telefonlarda daha az üst boşluk
    flex: 1, // Kalan alanı kapla
  },

  // Greeting Row - İsim ve bildirim ikonu aynı satırda
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  // Greeting Text Container - Sol taraf
  greetingTextContainer: {
    flex: 1,
  },

  // Merhaba yazısı - Optimized Responsive
  greetingText: {
    fontSize: font(16), // Küçük telefonlarda daha küçük font
    color: '#FFFFFF', // Tam beyaz
    fontFamily: getFontFamily('regular'),
    lineHeight: Math.round(font(16) * 1.2), // Küçük telefonlarda daha küçük line height
  },

  // Kullanıcı ismi - Kalın - Optimized Responsive
  userNameText: {
    fontSize: font(16), // Küçük telefonlarda daha küçük font
    color: '#FFFFFF', // Tam beyaz
    fontFamily: getFontFamily('bold'), // Kalın yazı
    fontWeight: 'bold',
  },

  // Ofis ismi - Optimized Responsive
  officeNameText: {
    fontSize: font(14), // Küçük telefonlarda daha küçük font
    color: '#FFFFFF', // Tam beyaz
    fontFamily: getFontFamily('regular'),
    marginTop: vs(2), // Küçük telefonlarda daha az boşluk
    lineHeight: Math.round(font(14) * 1.25), // Küçük telefonlarda daha küçük line height
  },

  // Alt Container - Optimized Responsive - Skia için wrapper - Çok geniş
  bottomInnerContainer: {
    position: 'absolute',
    bottom: vs(12), // Küçük telefonlarda daha az boşluk
    left: ms(4), // Minimum sol boşluk - çok geniş container
    right: ms(4), // Minimum sağ boşluk - çok geniş container
    height: clamp(vs(180), 160, 220), // Yükseklik biraz azaltıldı, alt sabit
    borderRadius: ms(14), // Köşe yumuşatmayı biraz azalt
    borderWidth: 0, // Küçük telefonlarda daha ince border
    borderColor: 'rgba(255, 255, 255, 0.2)', // Hafif şeffaf border
    overflow: 'hidden', // Gradient için clip
  },

  // Alt Container Gradient - Skia için arka plan
  bottomInnerGradientStyle: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 1,
  },

  // Alt Container Content - İçerik wrapper
  bottomInnerContent: {
    flex: 1,
    zIndex: 2, // Gradient'ın üstünde
    padding: ms(25), // Yanlarda daha fazla boşluk
    paddingTop: vs(28), // İçerik hafifçe yukarı alındı (responsive)
    flexDirection: 'column', // Dikey düzenleme
    justifyContent: 'flex-start', // İçeriği üstten başlat
    alignItems: 'stretch', // İçeriği genişlet
  },

  // Alt Container Başlığı - Optimized Responsive - Orta boy font
  bottomInnerTitle: {
    fontSize: font(15), // Bir tık küçültüldü
    color: '#323232', // Koyu mavi renk
    fontFamily: getFontFamily('bold'), // Kalın font
    fontWeight: 'bold', // Kalın yazı
    lineHeight: Math.round(font(15) * 1.25), // Yeni boyuta uygun line height
  },

  titleWrapper: {
    flex: 1, // Kalan tüm alanı kapla
  },

  arcProgressBarContainer: {
    marginLeft: ms(10), // Başlık ile arasına boşluk koy
  },

  arcProgressText: {
    fontSize: font(14),
    fontFamily: getFontFamily('bold'),
    color: '#323232',
    fontWeight: 'bold',
  },
  arcProgressPercent: {
    fontSize: font(14), // % işaretini biraz küçük yap
    fontFamily: getFontFamily('bold'),
    color: '#323232',
    fontWeight: 'bold',
  },

  // Başlık ve Progress Bar Row - Optimized Responsive
  titleAndProgressRow: {
    flexDirection: 'row', // Yatay düzenleme
    alignItems: 'center', // Dikey ortalama
    marginBottom: vs(12), // Boşluk azaltıldı
  },

  // İç Ayırıcı Çizgi - Optimized Responsive
  innerDivider: {
    height: clamp(sx(0.8), 0.6, 1), // Küçük telefonlarda daha ince çizgi
    backgroundColor: '#323232', // Koyu mavi renk
    borderRadius: clamp(sx(0.4), 0.3, 0.6), // Küçük telefonlarda daha küçük radius
    marginVertical: vs(15), // Dikey boşluk azaltıldı
  },

  // Progress Bar Container - Sağ tarafta - Responsive
  progressBarContainer: {
    alignItems: 'center',
  },

  progressTextContainer: {
    marginBottom: 8,
  },

  progressText: {
    color: currentTheme.colors.taskCard.text,
    fontSize: 18,
    fontFamily: getFontFamily('bold'),
  },

  progressArc: {
    width: 50,
    height: 25,
    borderRadius: 25,
    borderWidth: 3,
    borderColor: currentTheme.colors.glassmorphism.border, // Beyaz çerçeve
    overflow: 'hidden',
    position: 'relative',
    alignSelf: 'flex-start', // Progress bar'ı sola al
  },

  progressFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '67%',
    height: '100%',
    backgroundColor: currentTheme.colors.glassmorphism.strong, // Beyaz dolgu
    borderRadius: 25,
  },

  divider: {
    height: 1,
    backgroundColor: currentTheme.colors.glassmorphism.medium, // Beyaz ayırıcı çizgi
    marginVertical: height * 0.018,
    width: Math.min(width * 0.8, 320),
    alignSelf: 'center',
  },

  // İkonlar Row - 4 adet yan yana - Responsive
  iconsRow: {
    flexDirection: 'row', // Yatay düzenleme
    justifyContent: 'center', // İkonlar ortada toplanır
    alignItems: 'center', // Dikey ortalama
    marginTop: vs(4), // Üstten responsive boşluk - çok daha azaltıldı
    paddingHorizontal: 0, // Kenarlarda boşluk yok
    width: '100%', // Container genişliği kadar
  },

  // İkon Item - Her bir ikon için - Responsive - ÇOK GENİŞ boşluklar
  iconItem: {
    alignItems: 'center', // Dikey ortalama
    justifyContent: 'center', // Merkezi hizalama
    // Aralarındaki boşluğu orta seviyede tut (öncekinden biraz fazla)
    marginHorizontal: ms(22),
  },

  // İkon Resmi - Responsive
  iconImage: {
    width: ms(31), // 1px büyütüldü
    height: ms(31), // 1px büyütüldü
    tintColor: '#DC143C', // Krimson renk
    marginBottom: vs(6), // Alttan responsive boşluk
  },

  // İkon Yazısı - Responsive
  iconText: {
    fontSize: font(11, 0.5, { min: 10, max: 22 }), // 1px büyütüldü
    color: '#323232', // Koyu mavi renk
    fontFamily: getFontFamily('bold'), // Kalın font
    fontWeight: 'bold', // Kalın yazı
    textAlign: 'center', // Merkezi hizalama
    lineHeight: Math.round(font(11, 0.5, { min: 10, max: 22 }) * 1.2), // LineHeight uyumlu
  },


  backgroundImage: {
    flex: 1,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: ms(20),
    paddingTop: vs(30),
    paddingBottom: vs(20),
    zIndex: 10,
  },

  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: ms(3), // Logoyu sağa kaydır
  },

  logo: {
    width: ms(150),
    height: vs(40),
    resizeMode: 'contain',
  },

  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10, // Profil ve bildirim arası boşluk
    overflow: 'visible',
  },

  // Profil Butonu
  profileButton: {
    width: 60,
    height: 60,
    borderRadius: 18, // Daha büyük radius
    borderWidth: 2,
    borderColor: currentTheme.colors.error, // Theme kırmızı rengi
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: currentTheme.colors.lightGray, // Theme açık gri rengi
  },

  profileIcon: {
    width: 52,
    height: 52,
    resizeMode: 'cover',
    borderRadius: 16, // Daha büyük radius
  },

  userInfoContainer: {
    marginLeft: 12,
    flexDirection: 'column',
    justifyContent: 'flex-start',
    marginTop: -5, // Yukarı al
  },

  userName: {
    fontSize: 18,
    fontFamily: 'Poppins-Bold',
    color: currentTheme.colors.white,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
    marginBottom: 0, // Boşluğu azalt
  },

  officeName: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    color: currentTheme.colors.crimson,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },


  notificationButton: {
    position: 'relative',
    overflow: 'visible',
  },

  notificationIconContainer: {
    width: ms(38), // Daha da küçültüldü
    height: ms(38), // Daha da küçültüldü
    borderRadius: ms(6), // Küçük telefonlarda daha küçük radius
    backgroundColor: 'transparent', // Şeffaf arka plan
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: ms(1.5),
    borderColor: '#FFFFFF', // Tam beyaz çerçeve
    marginLeft: ms(8), // Küçük telefonlarda daha az boşluk
  },

  notificationIcon: {
    width: ms(22), // Daha da küçültüldü
    height: ms(22),
    tintColor: '#FFFFFF', // Beyaz renk
  },

  notificationBadge: {
    position: 'absolute',
    top: -ms(5),
    right: -ms(5),
    backgroundColor: currentTheme.colors.error,
    borderRadius: ms(12),
    minWidth: ms(24),
    height: ms(24),
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: ms(2),
    borderColor: currentTheme.colors.white,
    zIndex: 99,
    elevation: 3,
  },

  notificationBadgeText: {
    color: currentTheme.colors.white,
    fontSize: font(12),
    fontFamily: getFontFamily('bold'),
    textAlign: 'center',
  },

  // Ana İçerik
  content: {
    flex: 1,
    paddingHorizontal: 0, // Padding'i kaldır
    paddingTop: 0, // Üstteki boşluğu kaldır
  },

  // ScrollView İçerik Padding - SafeArea için üstten padding
  scrollContent: {
    flexGrow: 1, // İçeriği ekran yüksekliğine yay
    // iOS'ta SafeAreaView zaten üst çentiği telafi ediyor, ekstra padding'i minimum tutalım.
    // Android'de ise status bar için biraz ek boşluk bırakalım.
    paddingTop: Platform.OS === 'ios' ? vs(10) : insets.top + vs(10),
    paddingBottom: ms(150), // MainTab (60) + Butonlar (60) + Boşluk (30) = 150
  },

  // Görev Kartı Wrapper
  taskCardWrapper: {
    marginTop: 0,
    marginBottom: vs(12),
    marginHorizontal: ms(15), // Daha geniş yap
    zIndex: 10,
  },

  // Görev Kartı Border Gradient - Sadece outline için
  taskCardBorderGradient: {
    borderRadius: ms(18),
    padding: 2, // Border kalınlığı için padding
  },


  // Görev Kartı - Tema tabanlı
  taskCard: {
    padding: ms(15),
    borderRadius: ms(18) - 2, // Border gradient'ın içine sığması için
  },

  // Görev Kartı Gradient - Tema tabanlı
  taskCardGradient: {
    borderRadius: ms(18) - 2, // Border gradient'ın içine sığması için
    overflow: 'hidden',
    borderWidth: 0, // Border'ı kaldır çünkü gradient border var
    shadowColor: currentTheme.colors.shadows.light, // Krimson glow yerine açık gölge
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 25,
    elevation: 10,
  },

  // Outline border removed per request

  taskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 0,
  },

  taskTitleButton: {
    flex: 1,
    marginRight: ms(20), // Responsive margin
    marginLeft: ms(20),  // Sola kaydırıldı (0.08'den 0.05'e)
    marginTop: vs(10), // Responsive margin
  },

  taskTitle: {
    color: currentTheme.colors.taskCard.text,
    fontSize: font(16),
    fontFamily: getFontFamily('medium'),
    textAlign: 'left',
  },

  progressContainer: {
    alignItems: 'center',
    marginLeft: ms(20),
  },

  

  // İkon Satırları
  iconRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
  },

  // Alt İkonlar Container - Gelişmiş Glassmorphism Cam Efekti
  bottomIconsCard: {
    borderRadius: 20,
    backgroundColor: currentTheme.colors.surface, // iOS shadow için solid zemin
    padding: ms(20),
    paddingTop: vs(40),
    paddingBottom: vs(20),
    marginTop: -vs(50),
    marginBottom: vs(20),
    marginHorizontal: ms(7),
    height: vs(140),
    borderWidth: 1,
    borderColor: currentTheme.colors.borders.crimson, // Soluk krimson outline
    // Glassmorphism gölge efekti
    shadowColor: currentTheme.colors.shadows.light,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 25,
    elevation: 20,
    zIndex: 1,
    overflow: 'hidden',
    position: 'relative',
  },

  bottomIconsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    position: 'absolute',
    bottom: vs(20),
    left: ms(20),
    right: ms(20),
  },

  featureIconContainer: {
    alignItems: 'center',
    flex: 1,
  },

  // Görev kartı ikonları için stil
  taskFeatureIcon: {
    width: ms(35),
    height: ms(35),
    marginBottom: vs(8),
    tintColor: currentTheme.colors.crimson,    // Tam krimson renk
    // opacity kaldırıldı - tam opak
  },

  // Ajanda ikonu için özel stil
  ajandaIcon: {
    width: ms(33),
    height: ms(33),
    marginBottom: vs(8),
    tintColor: currentTheme.colors.crimson,    // Tam krimson renk
    // opacity kaldırıldı - tam opak
  },

  // Notlar ikonu için özel stil
  notlarIcon: {
    width: ms(34),
    height: ms(34),
    marginBottom: vs(8),
    tintColor: currentTheme.colors.crimson,    // Tam krimson renk
    // opacity kaldırıldı - tam opak
  },

  // Alt kart ikonları için stil
  bottomFeatureIcon: {
    width: ms(32),
    height: ms(32),
    marginBottom: vs(8),
    tintColor: currentTheme.colors.glassmorphism.strong, // Cam efekti için saydam beyaz
  },

  // Kredi hesaplama ikonu için özel stil
  creditIconContainer: {
    width: ms(32),
    height: ms(32),
    marginBottom: vs(8),
    alignItems: 'center',
    justifyContent: 'center',
  },

  creditIconImage: {
    width: ms(20),
    height: ms(20),
    tintColor: currentTheme.colors.glassmorphism.strong, // Cam efekti için saydam beyaz
  },

  // Favori talepler ikonu için özel stil
  favoriteIconContainer: {
    width: ms(32),
    height: ms(32),
    marginBottom: vs(8),
    alignItems: 'center',
    justifyContent: 'center',
  },

  favoriteIconImage: {
    width: ms(20),
    height: ms(20),
    tintColor: currentTheme.colors.glassmorphism.strong, // Cam efekti için saydam beyaz
  },

  // Favori portföyler ikonu için özel stil
  portfolioIconContainer: {
    width: ms(32),
    height: ms(32),
    marginBottom: vs(8),
    alignItems: 'center',
    justifyContent: 'center',
  },

  portfolioIconImage: {
    width: ms(20),
    height: ms(20),
    tintColor: currentTheme.colors.glassmorphism.strong, // Cam efekti için saydam beyaz
  },

  // Müşteri destek ikonu için özel stil
  supportIconContainer: {
    width: ms(32),
    height: ms(32),
    marginBottom: vs(8),
    alignItems: 'center',
    justifyContent: 'center',
  },

  supportIconImage: {
    width: ms(20),
    height: ms(20),
    tintColor: currentTheme.colors.glassmorphism.strong, // Cam efekti için saydam beyaz
  },

  // Komisyon hesaplama ikonu için özel stil
  commissionIconContainer: {
    width: ms(32),
    height: ms(32),
    marginBottom: vs(8),
    alignItems: 'center',
    justifyContent: 'center',
  },

  commissionIconImage: {
    width: ms(20),
    height: ms(20),
    tintColor: currentTheme.colors.glassmorphism.strong, // Cam efekti için saydam beyaz
  },

  // Görev kartı etiketleri için stil
  taskFeatureLabel: {
    color: currentTheme.colors.taskCard.text,
    fontSize: font(11),
    textAlign: 'center',
    fontFamily: getFontFamily('bold'),
  },

  // Alt kart etiketleri için stil
  bottomFeatureLabel: {
    color: currentTheme.colors.taskCard.text,
    fontSize: font(11),
    textAlign: 'center',
    fontFamily: getFontFamily('medium'),
    lineHeight: Math.round(font(11) * 1.2), // Çok satırlı metinler için satır yüksekliği
    textShadowColor: currentTheme.colors.shadows.medium,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },

  // Boş Container - Wrapper for Skia Gradient - Radiuslu - SafeArea compatible
  emptyContainer: {
    borderTopLeftRadius: ms(25),
    borderTopRightRadius: ms(25),
    borderBottomLeftRadius: 0, // Bitişik görünüm için alt köşe iptal edildi.
    borderBottomRightRadius: 0, // Bitişik görünüm için alt köşe iptal edildi.
    backgroundColor: 'transparent', // Üst selamlaşma alanı için şeffaf arka plan
    marginTop: vs(12), // Hafif boşluk (scrollContent zaten padding ekliyor)
    marginBottom: 0, // Alt buton container'a yapışık olması için margin kaldırıldı
    marginHorizontal: ms(15), // Yanlardan responsive margin
    minHeight: clamp(vs(300), 230, 330), // Yükseklik hafif artırıldı
    maxHeight: clamp(vs(330), 280, 360), // Maksimum yükseklik hafif artırıldı
    borderWidth: 0, // Tüm border'lar kaldırıldı
    // Glassmorphism gölge efekti
    shadowColor: currentTheme.colors.shadows.light,
    shadowOffset: {
      width: 0,
      height: vs(8), // Küçük telefonlarda daha az gölge
    },
    shadowOpacity: 0.3, // Küçük telefonlarda daha az opaklık
    shadowRadius: ms(20), // Küçük telefonlarda daha küçük radius
    elevation: 0,
    zIndex: 1,
    overflow: 'hidden',
    position: 'relative',
  },

  // Skia Gradient Style - Krimson gradient
  emptyContainerGradientStyle: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 1,
  },

  // Container Content - Gradient üstünde
  emptyContainerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: ms(20), // Küçük telefonlarda daha az padding
    paddingTop: 0, // Üstten padding kaldırıldı
    paddingBottom: 0, // Alt padding kaldırıldı - yapışık olması için
    zIndex: 2,
  },

  // Açık mod neumorphism gradient efekti - Tema tabanlı - Telefonun üstüne kadar
  lightNeumorphismGradient: {
    ...createNeumorphismStyle(currentTheme),
    backgroundColor: currentTheme.colors.neumorphism.background,
    borderColor: currentTheme.colors.card.border,
    shadowColor: currentTheme.colors.neumorphism.dark,
    marginTop: 0, // Telefonun üst sınırına kadar
    marginBottom: vs(30), // Alt margin artırıldı
    paddingTop: 0, // Üstten padding kaldırıldı
    borderTopLeftRadius: 0, // Üst sol köşe düz
    borderTopRightRadius: 0, // Üst sağ köşe düz
    marginHorizontal: ms(7), // Yanlardan margin geri alındı
  },

  // Coming Soon Container - Light tema - Orijinal radius korundu
  comingSoonContainer: {
    ...createNeumorphismStyle(currentTheme),
    backgroundColor: currentTheme.colors.neumorphism.background,
    borderColor: currentTheme.colors.card.border,
    shadowColor: currentTheme.colors.neumorphism.dark,
    marginTop: vs(5), // Orijinal margin
    marginBottom: vs(20), // Orijinal margin
    marginHorizontal: ms(7), // Orijinal margin
    borderRadius: ms(20), // Orijinal radius korundu
  },

  // Coming Soon Container - Dark tema - Orijinal radius korundu
  comingSoonContainerDark: {
    borderRadius: ms(20), // Orijinal radius korundu
    backgroundColor: currentTheme.colors.surface, // iOS shadow için solid zemin
    padding: ms(25),
    marginTop: vs(5), // Orijinal margin
    marginBottom: vs(10), // Orijinal margin
    marginHorizontal: ms(7), // Orijinal margin
    borderWidth: 1,
    borderColor: currentTheme.colors.borders.light,
    shadowColor: currentTheme.colors.shadows.light,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 25,
    elevation: 0,
    zIndex: 1,
    minHeight: vs(240),
    overflow: 'hidden',
    position: 'relative',
  },

  comingSoonIcon: {
    fontSize: font(36),
    marginBottom: vs(12),
    textShadowColor: currentTheme.colors.shadows.medium,
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 3,
  },

  comingSoonTitle: {
    fontSize: 20,
    fontFamily: getFontFamily('bold'),
    color: currentTheme.colors.card.title,
    textAlign: 'center',
    marginBottom: 8,
    textShadowColor: currentTheme.colors.shadows.medium,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },

  comingSoonSubtitle: {
    fontSize: 15,
    color: currentTheme.colors.card.text,
    textAlign: 'center',
    fontStyle: 'italic',
    fontFamily: getFontFamily('regular'),
    textShadowColor: currentTheme.colors.shadows.light,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },

  // Navigasyon Butonları
  navigationButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'center', // Ortala
    marginTop: vs(10), // 20'den 10'a azaltıldı
    marginBottom: vs(80), // Navigasyon barı için boşluk
    paddingHorizontal: ms(20),
  },

  // Buton Wrapper
  unifiedNavigationButtonWrapper: {
    position: 'relative',
  },


  // Birleşik Navigasyon Butonu - Glassmorphism
  unifiedNavigationButton: {
    flexDirection: 'row',
    borderRadius: 17, // Çok yuvarlak
    width: width - 60, // Tam genişlik
    height: ms(70), // Sabit yükseklik
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: ms(20),
    borderWidth: 1, // Outline eklendi
    borderColor: currentTheme.colors.borders.light, // Yeni Özellik container'ı ile aynı outline
    // Glassmorphism gölge efekti
    backgroundColor: currentTheme.colors.surface, // iOS shadow için solid zemin
    shadowColor: currentTheme.colors.shadows.light,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 25,
    elevation: 10,
    overflow: 'hidden',
    position: 'relative',
    zIndex: 2, // Containeri öne al
  },

  // Yarım Buton
  halfButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: vs(15),
    paddingHorizontal: ms(10),
  },

  // Dikey Ayırıcı Çizgi
  buttonDivider: {
    width: 1,
    height: ms(40),
    backgroundColor: currentTheme.colors.white, // Beyaz çizgi
    marginHorizontal: ms(50), // Daha fazla boşluk
  },

  // Birleşik Buton İkonu
  unifiedButtonIcon: {
    width: ms(24),
    height: ms(24),
    tintColor: currentTheme.colors.crimson, // Krimson renk
    marginHorizontal: ms(8),
  },

  // Birleşik Buton Metni
  unifiedButtonText: {
    fontSize: font(14),
    fontFamily: getFontFamily('bold'),
    color: currentTheme.colors.taskCard.text,
    textAlign: 'center',
    lineHeight: Math.round(font(14) * 1.25),
  },

  // Light mode stronger shadow helper
  lightShadowStrong: {
    shadowColor: currentTheme.colors.shadows.strong,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.35,
    shadowRadius: 28,
    elevation: 20,
  },

  buttonIconContainer: {
    width: ms(32), // Cam efekti için biraz daha büyük
    height: ms(32),
    borderRadius: ms(20),
    backgroundColor: currentTheme.colors.glassmorphism.background, // Cam efekti için saydam beyaz
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: ms(12), // Sağa margin ekle
    marginBottom: 0, // Alt margin'i kaldır
    borderWidth: 1,
    borderColor: currentTheme.colors.borders.white, // İnce cam kenarlık
  },

  buttonIcon: {
    width: ms(18), // Cam efekti için biraz daha büyük
    height: ms(18),
    resizeMode: 'contain',
    tintColor: currentTheme.colors.error, // Krimson renk
  },

  buttonTitle: {
    fontSize: font(14), // Cam efekti için biraz daha büyük
    fontFamily: getFontFamily('bold'),
    color: currentTheme.colors.taskCard.text,
    textAlign: 'center', // Ortala
    marginBottom: 0, // Alt margin'i kaldır
    flex: 1, // Kalan alanı kapla
    textShadowColor: currentTheme.colors.shadows.medium,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },

  // Cizgi.png - Ekranın sağına konumlandırılmış - Tüm telefonlarda sabit boyut ve pozisyon
  cizgiImage: {
    position: 'absolute',
    bottom: 185, // Sabit değer - tüm telefonlarda aynı pozisyon
    right: -17, // Sağa doğru kaydırıldı
    width: 240, // Sabit değer - tüm telefonlarda aynı boyut
    height: 90, // Sabit değer - tüm telefonlarda aynı boyut
    zIndex: 0, // Beyaz container'ın altında - en arka
  },

  // 5 Adet Alt Butonlar Container - Yeni Özellik ile aynı genişlik - Daha kısa
  bottomButtonsContainer: {
    marginTop: -ms(12), // İki container'ı birleştirmek için negatif margin geri getirildi.
    marginBottom: vs(12), // Alttan responsive boşluk
    // D. Kazanç Hesaplama ve diğer 5'li butonların bulunduğu container'ın genişliğini biraz azalt
    marginHorizontal: ms(28), // Biraz daha fazla dış margin → container daralır
    paddingHorizontal: ms(8), // Biraz daha az iç padding → içerik alanı genişler
    paddingTop: vs(12), // Yükseklik çok az daha azaltıldı.
    paddingBottom: vs(16), // Alt padding normal - ikonlar altta
    // Görsel stiller kaldırıldı
    borderTopLeftRadius: 0, // Üst sol köşe düz - yapışık için
    borderTopRightRadius: 0, // Üst sağ köşe düz - yapışık için
  },

  // Skia Gradient Style - (artık kullanılmıyor)
  bottomButtonsGradientStyle: {
    // Bu stil artık kullanılmıyor ve silindi.
  },

  // Butonlar Content - Gradient üstünde
  bottomButtonsContent: {
    flexDirection: 'row', // Yatay düzenleme
    justifyContent: 'center', // Merkezi hizalama
    alignItems: 'flex-end', // İkonlar altta
    zIndex: 2, // Gradient üstünde
  },

  // Alt Buton Item - Her bir buton için - Kompakt - Responsive
  bottomButtonItem: {
    alignItems: 'center', // Dikey ortalama
    justifyContent: 'center', // Merkezi hizalama
    marginHorizontal: ms(13), // Responsive - butonlar arası boşluk çok az geri artırıldı
  },

  // Alt Buton İkonu - Beyaz renk - Tüm telefonlarda sabit boyut
  bottomButtonIcon: {
    width: ms(20), // Biraz küçültüldü
    height: ms(20), // Biraz küçültüldü
    tintColor: '#FFFFFF', // Beyaz renk
    marginBottom: vs(4), // Sabit değer - tüm telefonlarda aynı boşluk
  },

  // Alt Buton Yazısı - Kalın beyaz - Tüm telefonlarda sabit boyut
  bottomButtonText: {
    // Biraz büyütülmüş profesyonel sistem fontu
    fontSize: font(9, 0.5, { min: 9, max: 22 }),
    color: '#FFFFFF', // Beyaz renk
    // Ajanda (iconText) ile aynı aile ve ağırlık
    fontFamily: getFontFamily('bold'),
    fontWeight: 'bold',
    letterSpacing: 0.2, // Hafif aralık, okunabilirlik
    textAlign: 'center', // Merkezi hizalama
    lineHeight: Math.round(font(9, 0.5, { min: 9, max: 22 }) * 1.25), // Uyumlu satır yüksekliği
  },

  // Hakkında Bölümü Container - Responsive spacing (büyük ekranlar için daha fazla boşluk)
  aboutSectionContainer: {
    width: '100%',
    paddingHorizontal: ms(20), // Görevler containeri gibi az yan boşluk
    paddingBottom: Math.max(vs(20), 20), // Alttan içeriden padding
    marginTop: vs(10), // Üstten responsive boşluk - çok az artırıldı
    marginBottom: Math.max(vs(35), 35), // Alttan çok daha fazla boşluk - büyük ekranlar için %5
  },

  // Skia Blur Container - Şeffaf ve Blurlu
  skiaBlurContainer: {
    width: '100%',
    borderRadius: 15,
    padding: currentTheme.spacing.lg,
    minHeight: 300,
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    overflow: 'hidden',
    position: 'relative',
    zIndex: 1,
    marginBottom: currentTheme.spacing.lg,
    // Şeffaf arka plan için
    backgroundColor: 'transparent',
  },

  // Gradient Outline Wrapper - Geçişli outline - Yükseklik düzeltildi
  gradientOutlineWrapper: {
    width: '100%',
    minHeight: 240, // Container + outline padding (236 + 4)
    maxHeight: 240, // Sabit yükseklik
    borderRadius: 15,
    padding: 2, // Outline kalınlığı
    marginBottom: currentTheme.spacing.lg,
  },

  // Simple Gradient Container - Wrapper kaldırıldı, basit border
  simpleGradientContainer: {
    width: '100%',
    // Yüksekliği biraz daha azalt: üst sabit, alttan daha kısa
    minHeight: 210,
    maxHeight: 210,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'flex-start',
    overflow: 'hidden',
    backgroundColor: 'transparent',
    borderRadius: 15,
    // Görsel stiller kaldırıldı, artık GlassmorphismView tarafından yönetiliyor.
  },

  // Simple Gradient Style - Arka plan
  simpleGradientStyle: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 1,
  },

  // Açık mod neumorphism gradient efekti - Tema tabanlı
  aboutLightNeumorphismGradient: {
    ...createNeumorphismStyle(currentTheme),
    width: '100%',
    backgroundColor: currentTheme.colors.neumorphism.background,
    borderColor: currentTheme.colors.card.border,
    shadowColor: currentTheme.colors.neumorphism.dark,
    borderRadius: 15,
    padding: currentTheme.spacing.lg,
    minHeight: 300,
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    overflow: 'hidden',
    position: 'relative',
    zIndex: 1,
    marginBottom: currentTheme.spacing.lg,
  },

  // Boş Container - Basit Glassmorphism Cam Efekti
  aboutEmptyContainer: {
    width: '100%',
    borderRadius: 15,
    padding: currentTheme.spacing.lg,
    borderWidth: 1,
    borderColor: currentTheme.colors.borders.light,
    shadowColor: currentTheme.colors.shadows.light,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 25,
    elevation: 0,
    zIndex: 1,
    minHeight: 300,
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    overflow: 'hidden',
    position: 'relative',
    marginBottom: currentTheme.spacing.lg,
  },

  // Hakkında Header
  aboutHeader: {
    flexDirection: 'row',
    justifyContent: 'center', // Ortaya hizala
    alignItems: 'center',
    marginBottom: currentTheme.spacing.sm,
    width: '100%', // Tam genişlik
  },

  // Hakkında Ortalama Container
  aboutCenterContainer: {
    flex: 1,
    justifyContent: 'center', // Dikey ortalama
    alignItems: 'center', // Yatay ortalama
    width: '100%',
    height: '100%',
    zIndex: 2, // Gradient'ın üstünde
    position: 'relative',
  },

  // Yeni: Bölge istatistik bölümü
  statsSectionContainer: {
    width: '100%',
    paddingHorizontal: ms(16),
    paddingTop: vs(14),
    paddingBottom: vs(14),
    gap: vs(6),
  },
  statsSectionTitle: {
    // Daily tasks başlığı ile aynı tipografi (beyaz)
    fontSize: font(16),
    color: currentTheme.colors.white,
    fontFamily: getFontFamily('bold'),
    fontWeight: 'bold',
  },
  statsHeaderRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  filterRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    // Küçük ekranlarda metinlerin alt satıra düşmemesi için tek satır ve daha dar aralık
    flexWrap: 'nowrap',
    gap: ms(12),
  },
  filterChip: {
    paddingVertical: 4,
    paddingHorizontal: 6,
    backgroundColor: 'transparent',
  },
  filterChipActive: {
    // Arkaplansız, sadece yazı rengiyle vurgulanacak
  },
  filterChipText: {
    // Küçük ekranlarda sığması için biraz daha küçük, geniş ekranlarda okunaklı
    fontSize: font(13),
    color: currentTheme.colors.white, // yazılar beyaz
    fontFamily: getFontFamily('bold'), // D. Kazanç ile aynı font ailesi
    fontWeight: 'bold',
  },
  filterChipTextActive: {
    color: currentTheme.colors.error, // aktif: krimson yazı
    fontFamily: getFontFamily('bold'),
  },
  statsLinesContainer: {
    marginTop: vs(10),
    gap: vs(10),
  },
  statsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    backgroundColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)',
    borderRadius: ms(8),
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)',
    paddingVertical: vs(10),
    paddingHorizontal: ms(12),
    gap: ms(8),
    marginHorizontal: ms(6),
  },
  statsBadgeHasNew: {
    backgroundColor: currentTheme.colors.error,
    borderColor: 'transparent',
  },
  statsBadgeMain: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    flex: 1,
    justifyContent: 'center',
  },
  filtersDivider: {
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    marginTop: vs(4),
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
    backgroundColor: '#DC143C',
    borderRadius: 1,
  },
  statsLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  statsIcon: {
    width: ms(20),
    height: ms(20),
    tintColor: currentTheme.colors.error,
    marginRight: ms(8),
  },
  statsIconHasNew: {
    tintColor: currentTheme.colors.white,
  },
  statsText: {
    // Daily tasks başlığı ile aynı tipografi (beyaz) ama biraz daha küçük
    fontSize: font(12),
    color: currentTheme.colors.white,
    fontFamily: getFontFamily('bold'),
    fontWeight: 'bold',
  },
  statsBadgeText: {
    fontSize: font(13),
    color: currentTheme.colors.white,
    fontFamily: getFontFamily('bold'),
    fontWeight: 'bold',
  },
  statsBadgeTextHasNew: {
    color: currentTheme.colors.white,
  },
  statsBadgeRefreshButton: {
    marginLeft: ms(10),
    paddingHorizontal: ms(8),
    paddingVertical: vs(6),
    borderRadius: 999,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsBadgeRefreshIcon: {
    width: ms(16),
    height: ms(16),
    tintColor: currentTheme.colors.white,
  },

  // Hakkında Başlık
  aboutTitle: {
    fontSize: currentTheme.fontSizes.lg,
    fontWeight: 'bold', // Kalın yazı
    textAlign: 'center', // Ortaya hizala
    width: '100%', // Tam genişlik
  },

  // Hakkında Metin
  aboutText: {
    fontSize: currentTheme.fontSizes.md,
    fontStyle: 'italic',
    lineHeight: 22,
  },

  // Alt Navigasyon Butonları - Her ekran boyutunda aynı görünüm
  bottomNavigationButtons: {
    position: 'absolute',
    // iOS'ta alt çentik (home indicator) alanını da hesaba kat, ancak tab bar'a daha yakın dursun
    bottom: Platform.OS === 'ios' ? insets.bottom + ms(15) : ms(55),
    left: 0,
    right: 0,
    paddingHorizontal: ms(20),
    paddingBottom: ms(10), // MainTab ile arasında boşluk
    zIndex: 1000, // En üstte kalması için
  },

  // Alt Navigasyon Wrapper
  bottomNavigationWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Alt Navigasyon Butonu - Sabit boyutlar - Skia için wrapper
  bottomNavigationButton: {
    width: width - 40, // Sabit genişlik (padding hariç)
    height: 60, // Sabit yükseklik
    // Görsel stiller kaldırıldı, artık GlassmorphismView tarafından yönetiliyor.
  },

  // Alt Navigasyon Gradient - Skia için arka plan (artık kullanılmıyor)
  bottomNavGradientStyle: {
    // Bu stil artık kullanılmıyor ve silindi.
  },

  // Alt Navigasyon Content - İçerik wrapper
  bottomNavContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: ms(20),
    zIndex: 2, // Gradient'ın üstünde
  },

  // Alt Yarım Buton
  bottomHalfButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
  },

  // Alt Dikey Ayırıcı Çizgi
  bottomButtonDivider: {
    width: 1,
    height: ms(35),
    backgroundColor: '#FFFFFF', // Beyaz ayırıcı - koyu arka plan için
    marginHorizontal: ms(50), // Butonlar arasındaki boşluk artırıldı
  },

  // Alt Buton İkonu - Sabit boyut
  bottomNavButtonIcon: {
    width: ms(22),
    height: ms(22),
    tintColor: '#FFFFFF', // Beyaz ikon - koyu arka plan için
    marginHorizontal: ms(6),
  },

  // Alt Buton Metni - Sabit boyut
  bottomNavButtonText: {
    fontSize: font(12), // Ajanda ile aynı boyut
    fontFamily: getFontFamily('bold'), // Ajanda ile aynı font ailesi
    fontWeight: 'bold', // Ajanda ile aynı ağırlık
    color: '#FFFFFF', // Beyaz yazı - koyu arka plan için
    textAlign: 'center',
    lineHeight: Math.round(font(12) * 1.2), // Ajanda ile aynı lineHeight oranı
  },

  // Overlay Styles
  overlayContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlayContent: {
    width: clamp(width * 0.9, 320, 800),
    height: clamp(height * 0.7, 420, 900),
    backgroundColor: isDark ? '#1a202c' : 'white',
    borderRadius: ms(20),
    padding: ms(20),
    alignItems: 'center',
  },
  overlayTitle: {
    fontSize: font(20),
    fontWeight: 'bold',
    color: isDark ? 'white' : 'black',
    marginBottom: vs(20),
  },
  closeButton: {
    position: 'absolute',
    top: ms(10),
    right: ms(10),
    padding: ms(10),
  },
  closeButtonText: {
    fontSize: font(16),
    color: isDark ? 'white' : 'crimson',
  },

});

export default Home;
