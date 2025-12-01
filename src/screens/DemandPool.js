import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Image,
  Alert,
  Dimensions,
  Animated,
  ImageBackground,
} from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeContext';
import { makePhoneCall, sendWhatsAppMessage } from '../utils/contactUtils';
import { fetchRequests, fetchRequestsPaginated } from '../services/firestore';
import ListingCard from '../components/ListingCard';
import { db as firestore } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import GlassmorphismView from '../components/GlassmorphismView';
import * as Animatable from 'react-native-animatable';
import { demandPoolCache as DEMAND_POOL_CACHE } from '../services/demandPoolCache';
import { useAuth } from '../context/AuthContext';
import { getMatchingPortfoliosForRequest } from '../utils/requestMatching';
import { fetchUserPortfolios } from '../services/firestore';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

const { width, height } = Dimensions.get('window');

// Cache moved to shared service: services/demandPoolCache.js

const DemandPool = () => {
  const { theme: currentTheme, isDark } = useTheme();
  const styles = useMemo(() => stylesFactory(currentTheme), [currentTheme]);
  const navigation = useNavigation();
  const route = useRoute();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [selectedFilter, setSelectedFilter] = useState(route.params?.showFavorites ? 'favorites' : 'all');
  const [requests, setRequests] = useState([]);
  const [expandedCards] = useState(new Set());
  const [favorites, setFavorites] = useState([]);
  const [hiddenRequests, setHiddenRequests] = useState([]);
  const [showHidden, setShowHidden] = useState(false);
  // Yeni filtreler: tarih ve öncelik (RequestList ile uyumlu)
  const [selectedPeriod, setSelectedPeriod] = useState(null); // 'today' | 'yesterday' | '7' | '15' | null
  const [priorityFilter, setPriorityFilter] = useState(null); // 'normal' | 'priority' | 'urgent' | null
  const chipPressScale = useRef(new Animated.Value(1)).current;
  const [pressingKey, setPressingKey] = useState(null);
  const listRef = useRef(null);
  const listScrollOffsetRef = useRef(0);
  const [ownerPhones, setOwnerPhones] = useState({});
  const viewRef = useRef(null);
  const isFirstFocusRef = useRef(true);
  const [showList, setShowList] = useState(false);
  const [hasAnimatedOnce, setHasAnimatedOnce] = useState(false);
  const didAnimateCardsRef = useRef(false);
  const listFadeAnim = useRef(new Animated.Value(1)).current;
  const listTranslateAnim = useRef(new Animated.Value(0)).current;
  const lastFetchRef = useRef(0);
  const phonesCacheRef = useRef({});
  const ownerPhonesRef = useRef({});
  // Paging
  const nextCursorRef = useRef(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const PAGE_SIZE = 30;

  useEffect(() => {
    ownerPhonesRef.current = ownerPhones;
  }, [ownerPhones]);

  const customEnterAnimation = {
    from: { opacity: 0, translateY: 8 },
    to: { opacity: 1, translateY: 0 },
  };

  const customExitAnimation = {
    from: { opacity: 1, translateY: 0 },
    to: { opacity: 1, translateY: 0 },
  };
  const ANIM_DURATION_ENTER = 360;
  const ANIM_DURATION_EXIT = 200;

  // Load published requests on component mount (hydrate from cache instantly)
  useEffect(() => {
    const hasCache = Array.isArray(DEMAND_POOL_CACHE.requests) && DEMAND_POOL_CACHE.requests.length > 0;
    if (hasCache) {
      setRequests(DEMAND_POOL_CACHE.requests);
      setOwnerPhones(DEMAND_POOL_CACHE.phones || {});
      setLoading(false);
      if (!showList) setShowList(true);
      // Background refresh silently when cache exists (reset paging)
      loadRequests({ silent: true, reset: true });
    } else {
      // No cache: mount list immediately and do a normal (non-silent) load so loading state clears when done
      if (!showList) setShowList(true);
      loadRequests({ silent: false, reset: true });
    }
  }, [loadRequests, showList]);

  // Odaklanınca önceki scroll konumuna dön (detaydan geri gelince)
  useFocusEffect(
    useCallback(() => {
      // Silent refresh with throttle: avoid refetching too frequently
      const now = Date.now();
      if (now - (lastFetchRef.current || 0) > 5000) {
        loadRequests({ silent: true, reset: true });
      }
      const timer = setTimeout(() => {
        try {
          if (listRef.current && listScrollOffsetRef.current > 0) {
            listRef.current.scrollToOffset({ offset: listScrollOffsetRef.current, animated: false });
          }
        } catch {}
      }, 0);
      return () => clearTimeout(timer);
    }, [loadRequests]),
  );

  // Focus-based enter/exit animations (mirror RequestList logic)
  useFocusEffect(
    useCallback(() => {
      if (isFirstFocusRef.current) {
        if (!loading && viewRef.current) {
          if (!showList) setShowList(true);
          try {
            viewRef.current
              .animate(customEnterAnimation, ANIM_DURATION_ENTER)
              .then(() => setHasAnimatedOnce(true));
          } catch {}
          isFirstFocusRef.current = false;
        }
      } else {
        if (viewRef.current) {
          try {
            viewRef.current
              .animate(customEnterAnimation, ANIM_DURATION_ENTER)
              .then(() => setHasAnimatedOnce(true));
          } catch {}
        }
      }
      return () => {
        if (viewRef.current) {
          try { viewRef.current.animate(customExitAnimation, ANIM_DURATION_EXIT); } catch {}
        }
      };
    }, [])
  );

  // First load: when loading becomes false on first focus, mount and animate once
  useEffect(() => {
    if (!loading && isFirstFocusRef.current) {
      if (!showList) setShowList(true);
      try {
        if (viewRef.current) {
          viewRef.current
            .animate(customEnterAnimation, ANIM_DURATION_ENTER)
            .then(() => setHasAnimatedOnce(true));
          isFirstFocusRef.current = false;
        }
      } catch {}
    }
  }, [loading, showList]);

  // İlk gösterimde kartlar animasyonlu; sonrasında kapat (performans)
  useEffect(() => {
    if (showList && !didAnimateCardsRef.current) {
      const t = setTimeout(() => { didAnimateCardsRef.current = true; }, ANIM_DURATION_ENTER + 60);
      return () => clearTimeout(t);
    }
  }, [showList, ANIM_DURATION_ENTER]);

  const loadRequests = useCallback(async ({ silent = false, reset = false } = {}) => {
    try {
      if (!silent) {
        setLoading(true);
      }
      // Paged fetch for large dataset
      let { items, nextCursor: nc, hasMore: hm } = await fetchRequestsPaginated({
        pageSize: PAGE_SIZE,
        cursor: reset ? null : nextCursorRef.current,
        filters: {},
      }, true);
      // Fallback: if first page came empty (possible missing index for orderBy), use non-paginated fetch
      if ((reset && (!items || items.length === 0))) {
        const fallback = await fetchRequests({}, true);
        items = Array.isArray(fallback) ? fallback : [];
        nc = null;
        hm = false;
      }
      lastFetchRef.current = Date.now();
      nextCursorRef.current = nc || null;
      setHasMore(!!hm);
      setRequests(prev => {
        if (reset) return items || [];
        const prevMap = new Set((prev || []).map(x => x.id));
        const merged = [...(prev || [])];
        for (const it of items || []) {
          if (!prevMap.has(it.id)) merged.push(it);
        }
        return merged;
      });
      // Fetch owner phones for new userIds in parallel with caching
      const incomingUserIds = Array.from(new Set(((items || [])).map(r => r.userId).filter(Boolean)));
      const cache = phonesCacheRef.current || {};
      const missingUserIds = incomingUserIds.filter(uid => !cache[uid]);
      if (missingUserIds.length > 0) {
        try {
          const fetched = await Promise.all(
            missingUserIds.map(async (uid) => {
              try {
                const userDoc = await getDoc(doc(firestore, 'users', uid));
                const phone = userDoc.exists() ? (userDoc.data().phoneNumber || '') : '';
                return [uid, phone];
              } catch {
                return [uid, ''];
              }
            })
          );
          for (const [uid, phone] of fetched) {
            cache[uid] = phone;
          }
          phonesCacheRef.current = cache;
        } catch {}
      }
      // Merge cache into state only if it changes something significant
      setOwnerPhones(prev => {
        const next = { ...prev };
        let changed = false;
        for (const uid of incomingUserIds) {
          const phone = cache[uid] || '';
          if (next[uid] !== phone) {
            next[uid] = phone;
            changed = true;
          }
        }
        return changed ? next : prev;
      });
      // Update in-memory cache for instant subsequent opens
      // Only cache the first page to avoid huge memory usage
      if (reset) {
        DEMAND_POOL_CACHE.requests = Array.isArray(items) ? items : [];
      }
      DEMAND_POOL_CACHE.phones = { ...phonesCacheRef.current };
      DEMAND_POOL_CACHE.timestamp = Date.now();
    } catch (error) {
      // console.error('Error loading requests:', error);
      Alert.alert('Hata', 'Talepler yüklenirken bir hata oluştu.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      await loadRequests({ silent: true, reset: false });
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, loadRequests]);

  const formatPrice = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) {return '—';}
    const tr = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
    return `${tr}₺`;
  };


  // Helper functions for card expansion and matching portfolios
  const isCardExpanded = useCallback((requestId) => expandedCards.has(requestId), [expandedCards]);

  // Favorite functions
  const toggleFavorite = useCallback((requestId) => {
    setFavorites(prev => {
      if (prev.includes(requestId)) {
        return prev.filter(id => id !== requestId);
      } else {
        return [...prev, requestId];
      }
    });
  }, []);

  const isFavorite = useCallback((requestId) => favorites.includes(requestId), [favorites]);

  // Hide/Show functions
  const toggleHidden = useCallback((requestId) => {
    setHiddenRequests(prev => {
      if (prev.includes(requestId)) {
        return prev.filter(id => id !== requestId);
      } else {
        return [...prev, requestId];
      }
    });
  }, []);

  const isHidden = useCallback((requestId) => hiddenRequests.includes(requestId), [hiddenRequests]);

  // Match only the logged-in user's portfolios with each request
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

  const getMatchingPortfolios = useCallback((request) => {
    if (!request) {return [];} 
    return getMatchingPortfoliosForRequest(request, myPortfolios, { tolerance: 0.10 });
  }, [myPortfolios]);

  const filteredRequests = useMemo(() => {
    // Yalnızca yayınlanmış ve havuza işaretli talepler
    let filtered = requests.filter(request => request.isPublished === true && request.publishToPool === true);

    // Gizlenen talepleri filtrele (eğer gizlenenler gösterilmiyorsa)
    if (!showHidden) {
      filtered = filtered.filter(request => !isHidden(request.id));
    }

    // Durum filtresi uygula
    if (selectedFilter === 'favorites') {
      filtered = filtered.filter(request => isFavorite(request.id));
    } else if (selectedFilter !== 'all') {
      filtered = filtered.filter(request => request.status === selectedFilter);
    }

    // Tarih filtresi uygula
    const safeToDate = (v) => {
      try { if (!v) return null; return v instanceof Date ? v : new Date(v); } catch { return null; }
    };
    const now = new Date();
    const toStartOfDay = (d) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
    const toEndOfDay = (d) => { const x = new Date(d); x.setHours(23,59,59,999); return x; };
    const getPeriodBounds = (key) => {
      switch (key) {
        case 'today': return { start: toStartOfDay(now), end: toEndOfDay(now) };
        case 'yesterday': { const s = new Date(now); s.setDate(now.getDate() - 2); return { start: toStartOfDay(s), end: toEndOfDay(now) }; }
        case '7': { const s = new Date(now); s.setDate(now.getDate() - 6); return { start: toStartOfDay(s), end: toEndOfDay(now) }; }
        case '15': { const s = new Date(now); s.setDate(now.getDate() - 14); return { start: toStartOfDay(s), end: toEndOfDay(now) }; }
        default: return null;
      }
    };
    if (selectedPeriod) {
      const bounds = getPeriodBounds(selectedPeriod);
      if (bounds) {
        const { start, end } = bounds;
        filtered = filtered.filter((r) => {
          const dt = safeToDate(r?.createdAt);
          return dt && dt >= start && dt <= end;
        });
      }
    }

    // Öncelik filtresi uygula
    if (priorityFilter) {
      filtered = filtered.filter((r) => {
        const value = (r?.priority || 'normal').toLowerCase();
        if (priorityFilter === 'normal') return value === 'normal' || !r?.priority;
        if (priorityFilter === 'priority') return value === 'priority' || value === 'öncelikli' || value === 'oncelikli';
        if (priorityFilter === 'urgent') return value === 'urgent' || value === 'acil';
        return true;
      });
    }

    return filtered;
  }, [selectedFilter, selectedPeriod, priorityFilter, requests, showHidden, isHidden, isFavorite]);

  // Liste giriş animasyonu yalnızca ilk gösterimde
  useEffect(() => {
    if (!showList) return;
    listFadeAnim.setValue(0);
    listTranslateAnim.setValue(10);
    Animated.parallel([
      Animated.timing(listFadeAnim, { toValue: 1, duration: 240, useNativeDriver: true }),
      Animated.spring(listTranslateAnim, { toValue: 0, friction: 8, tension: 70, useNativeDriver: true }),
    ]).start();
  }, [showList, listFadeAnim, listTranslateAnim]);

  const renderRequestCard = useCallback(({ item, index = 0 }) => {
    const matchingPortfolios = getMatchingPortfolios(item);
    const isExpanded = isCardExpanded(item.id);
    const phoneForOwner = ownerPhonesRef.current[item.userId] || '';

    const shouldAnimate = !didAnimateCardsRef.current;
    const cardEnterAnimation = {
      from: { opacity: 0, translateY: 10, scale: 0.98 },
      to: { opacity: 1, translateY: 0, scale: 1 },
    };

    return (
      <Animatable.View
        animation={shouldAnimate ? cardEnterAnimation : undefined}
        duration={shouldAnimate ? 360 : undefined}
        delay={shouldAnimate ? Math.min(index * 40, 360) : undefined}
        useNativeDriver
      >
      <GlassmorphismView
        style={styles.requestCard}
        borderRadius={currentTheme.borderRadius.lg}
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
        {/* Content wrapper */}
        <View style={styles.requestCardContent}>
          {/* User Profile Section - Top Left */}
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
                {item.userProfile?.name || 'Danışman'}
              </Text>
              <Text style={styles.userOffice}>
                {item.userProfile?.office || 'Ofis'}
              </Text>
            </View>
          </View>

          {/* Status and Hide Buttons */}
          <View style={styles.statusButtons}>
            <View style={styles.statusBadge}>
              <Text style={styles.statusText}>
                {item.status === 'active' ? 'Aktif' : 'Pasif'}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.favoriteButton}
              onPress={() => toggleFavorite(item.id)}
            >
              <Image
                source={require('../assets/images/icons/Favorite_fill.png')}
                style={styles.favoriteButtonIcon}
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.hideButton}
              onPress={() => toggleHidden(item.id)}
            >
              <Image
                source={require('../assets/images/icons/View_fill.png')}
                style={styles.hideButtonIcon}
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Request Content */}
        <TouchableOpacity
          onPress={() => navigation.navigate('RequestDetail', { request: item })}
          activeOpacity={0.8}
        >
          <Text style={styles.requestTitle} numberOfLines={2}>
            {item.title}
          </Text>

          <Text style={styles.requestDescription} numberOfLines={2}>
            {item.description}
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
              <Text style={styles.detailLabel}>Bütçe:</Text>
              <Text style={styles.detailValue}>
                {formatPrice(item.minPrice)} - {formatPrice(item.maxPrice)}
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>m²:</Text>
              <Text style={styles.detailValue}>
                {item.minSquareMeters} - {item.maxSquareMeters}
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Tip:</Text>
              <Text style={styles.detailValue}>
                {item.propertyType || 'Belirtilmemiş'}
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Durum:</Text>
              <Text style={styles.detailValue}>
                {item.listingType || 'Satılık'}
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

          <View style={styles.contactButtons}>
            <TouchableOpacity
              style={styles.phoneButton}
              onPress={() => {
                const phone = (phoneForOwner || '').trim();
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
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.whatsappButton}
              onPress={() => {
                const phone = (phoneForOwner || '').trim();
                if (!phone) {
                  Alert.alert('Bilgi', 'Telefon bilgisi bulunamadı.');
                  return;
                }
                const title = item?.title ? item.title : 'talep';
                sendWhatsAppMessage(phone, `Merhaba, ${title} hakkında bilgi almak istiyorum.`);
              }}
            >
              <Image
                source={require('../assets/images/icons/whatsapp.png')}
                style={styles.whatsappButtonIcon}
              />
            </TouchableOpacity>
          </View>
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
  }, [styles, navigation, currentTheme, getMatchingPortfolios, isCardExpanded]);

  const renderFilterButton = (filter, label) => (
    <TouchableOpacity
      style={[
        styles.filterButton,
        selectedFilter === filter && styles.filterButtonActive,
      ]}
      onPress={() => setSelectedFilter(filter)}
    >
      <Text style={[
        styles.filterButtonText,
        selectedFilter === filter && styles.filterButtonTextActive,
      ]}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  const renderHeader = () => (
    <View style={styles.header}>
      <TouchableOpacity
        style={styles.headerButtonBack}
        onPress={() => {
          if (navigation.canGoBack()) {
            navigation.goBack();
          } else {
            navigation.navigate('MainTabs');
          }
        }}
      >
        <Image
          source={require('../assets/images/icons/return.png')}
          style={styles.headerButtonIconBack}
        />
      </TouchableOpacity>

      <View style={styles.headerContent}>
        <Text style={styles.mainTitle}>Talep Havuzu</Text>
        <Text style={styles.mainSubtitle}>Şehrindeki tüm emlakçıların talepleri.</Text>
      </View>

      <View style={styles.headerRightButtons}>
        <TouchableOpacity
          style={styles.headerButtonHide}
          onPress={() => setShowHidden(!showHidden)}
        >
          <Image
            source={require('../assets/images/icons/View_hide2x.png')}
            style={styles.headerButtonIconHide}
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => setSelectedFilter(selectedFilter === 'favorites' ? 'all' : 'favorites')}
        >
          <Image
            source={require('../assets/images/icons/Favorite_fill.png')}
            style={styles.headerButtonIcon}
          />
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderFilters = () => (
    <View>
      {/* Tarih Filtresi */}
      <View style={styles.filterBar}>
        <View style={[styles.filterOptionsRow, styles.periodOptionsRow]}>
          {[
            { key: 'today', label: 'Bu gün' },
            { key: 'yesterday', label: 'Son 3 gün' },
            { key: '7', label: 'Son 7 gün' },
            { key: '15', label: 'Son 15 gün' },
          ].map(({ key, label }, idx) => {
            const active = selectedPeriod === key;
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
                onPress={() => {
                  setPressingKey(key);
                  chipPressScale.setValue(0.92);
                  Animated.spring(chipPressScale, { toValue: 1, friction: 6, useNativeDriver: true }).start(() => {
                    setPressingKey(null);
                  });
                  setSelectedPeriod(prev => (prev === key ? null : key));
                }}
              >
                <Animatable.View
                  animation={active ? 'pulse' : undefined}
                  duration={220}
                  useNativeDriver
                >
                  <Text style={[styles.periodChipText, active && styles.periodChipTextActive]}>{label}</Text>
                </Animatable.View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
      {/* Öncelik Filtresi */}
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
            const activeScale = active ? 1.06 : 1;
            const scaleNode = pressingKey === key ? Animated.multiply(chipPressScale, activeScale) : activeScale;
            return (
              <TouchableOpacity
                key={key}
                style={[chipStyle, { transform: [{ scale: scaleNode }], zIndex: active ? 1 : 0 }]}
                activeOpacity={0.85}
                onPress={() => {
                  setPressingKey(key);
                  chipPressScale.setValue(0.92);
                  Animated.spring(chipPressScale, { toValue: 1, friction: 6, useNativeDriver: true }).start(() => {
                    setPressingKey(null);
                  });
                  setPriorityFilter(prev => (prev === key ? null : key));
                }}
              >
                <Text style={[styles.periodChipText, active && styles.periodChipTextActive, textActiveStyle]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );


  // No skeleton: keep UI fast like MyPortfolios

  return (
    <ImageBackground
      source={isDark ? require('../assets/images/dark-bg2.png') : require('../assets/images/light-bg.jpg')}
      defaultSource={isDark ? require('../assets/images/dark-bg2.png') : require('../assets/images/light-bg.jpg')}
      fadeDuration={0}
      style={[styles.backgroundImage, { backgroundColor: isDark ? '#071317' : '#FFFFFF' }]}
    >
      <SafeAreaView edges={['left','right','bottom']} style={styles.safeArea}>
        <View style={styles.container}>
          {/* Header overlay with safe-area padding */}
          <View style={[styles.header, { paddingTop: Math.max(insets.top, 0) + 12 }]}>
            <TouchableOpacity
              style={styles.headerButtonBack}
              onPress={() => {
                if (navigation.canGoBack()) {
                  navigation.goBack();
                } else {
                  navigation.navigate('MainTabs');
                }
              }}
            >
              <Image
                source={require('../assets/images/icons/return.png')}
                style={styles.headerButtonIconBack}
              />
            </TouchableOpacity>

            <View style={styles.headerContent}>
              <Text style={styles.mainTitle}>Talep Havuzu</Text>
              <Text style={styles.mainSubtitle}>Şehrindeki tüm emlakçıların talepleri.</Text>
            </View>

            <View style={styles.headerRightButtons}>
              <TouchableOpacity
                style={styles.headerButtonHide}
                onPress={() => setShowHidden(!showHidden)}
              >
                <Image
                  source={require('../assets/images/icons/View_hide2x.png')}
                  style={styles.headerButtonIconHide}
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.headerButton}
                onPress={() => setSelectedFilter(selectedFilter === 'favorites' ? 'all' : 'favorites')}
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
                data={filteredRequests}
                renderItem={({ item, index }) => renderRequestCard({ item, index })}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContainer}
                showsVerticalScrollIndicator={false}
                ListHeaderComponent={renderFilters}
                initialNumToRender={10}
                windowSize={11}
                maxToRenderPerBatch={10}
                updateCellsBatchingPeriod={60}
                removeClippedSubviews
                ListEmptyComponent={loading ? null : (
                  <View style={styles.emptyContainer}>
                    <Text style={styles.emptyIcon}>📋</Text>
                    <Text style={styles.emptyText}>Henüz talep bulunmuyor</Text>
                    <Text style={styles.emptySubtext}>
                      Yeni talepler eklendiğinde burada görünecek
                    </Text>
                  </View>
                )}
                onScroll={(e) => {
                  listScrollOffsetRef.current = e.nativeEvent.contentOffset?.y || 0;
                }}
                scrollEventThrottle={16}
                onEndReachedThreshold={0.6}
                onEndReached={loadMore}
              />
              </Animated.View>
            </Animatable.View>
          ) : null}
        </View>
      </SafeAreaView>
    </ImageBackground>
  );
};

const stylesFactory = (theme) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  backgroundImage: {
    flex: 1,
    resizeMode: 'cover',
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
    width: 37,
    height: 37,
    borderRadius: 8,
    backgroundColor: theme.colors.error, // Theme kırmızı rengi
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0, // Border kaldırıldı
    ...theme.shadows.small,
  },
  headerButtonIcon: {
    width: 20,
    height: 20,
    tintColor: theme.colors.white, // Theme beyaz ikon
  },
  headerButtonHide: {
    width: 37,
    height: 37,
    borderRadius: 8,
    backgroundColor: theme.colors.white, // Theme beyaz rengi
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0,
    ...theme.shadows.small,
  },
  headerButtonIconHide: {
    width: 20,
    height: 20,
    tintColor: theme.colors.error, // Theme kırmızı ikon
  },

  headerButtonBack: {
    width: 37,
    height: 37,
    borderRadius: 8,
    backgroundColor: theme.colors.error, // Theme kırmızı rengi
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0, // Border kaldırıldı
    ...theme.shadows.medium,
  },


  headerButtonIconBack: {
    width: 16,
    height: 16,
    resizeMode: 'contain',
    tintColor: theme.colors.white, // Theme beyaz ikon
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
    marginTop: 2,
  },

  headerRightButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },

  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm, // Dikey padding eklendi
    gap: theme.spacing.sm, // Gap azaltıldı
    backgroundColor: '#0A1118', // Daha koyu renk
    borderRadius: theme.borderRadius.lg,
    marginHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
    ...theme.shadows.large,
    borderWidth: 1, // Border kalınlığı azaltıldı
    borderColor: theme.colors.borderLight,
    alignItems: 'center', // Dikey hizalama
  },
  // Yeni filtre barları (RequestList ile uyumlu görünüm)
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
    marginLeft: -1,
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
    backgroundColor: theme.colors.error,
    borderColor: theme.colors.error,
    borderWidth: 0,
  },
  periodChipText: {
    fontSize: theme.fontSizes.lg,
    color: 'rgba(255, 255, 255, 0.8)',
    fontWeight: theme.fontWeights.semibold,
  },
  periodChipTextActive: {
    color: theme.colors.white,
  },

  filterButton: {
    paddingHorizontal: theme.spacing.md, // Yatay padding artırıldı
    paddingVertical: theme.spacing.sm, // Dikey padding sabit
    borderRadius: theme.borderRadius.sm, // Border radius azaltıldı
    backgroundColor: 'transparent', // Şeffaf arka plan
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)', // Yarı şeffaf border
    flex: 1,
    minHeight: 36, // Minimum yükseklik
    justifyContent: 'center', // İçerik ortala
    alignItems: 'center', // İçerik ortala
  },

  filterButtonActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
    borderWidth: 1,
  },

  filterButtonText: {
    color: 'rgba(255, 255, 255, 0.8)', // Yarı şeffaf beyaz
    fontSize: theme.fontSizes.md, // Font boyutu azaltıldı
    fontWeight: theme.fontWeights.medium, // Font ağırlığı azaltıldı
    textAlign: 'center',
  },

  filterButtonTextActive: {
    color: '#FFFFFF', // Beyaz aktif metin
  },

  listContainer: {
    padding: theme.spacing.lg,
    paddingTop: 0,
  },

  requestCard: {
    marginBottom: theme.spacing.md,
  },

  requestCardGradient: {},

  requestCardContent: {
    padding: theme.spacing.lg,
    position: 'relative',
    zIndex: 1,
  },

  // User Profile Section Styles
  userProfileSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
    paddingBottom: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
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
    marginRight: theme.spacing.md,
    borderWidth: 2,
    borderColor: theme.colors.primary,
  },

  userProfileDetails: {
    flex: 1,
  },

  userName: {
    fontSize: theme.fontSizes.lg,
    fontWeight: theme.fontWeights.semibold,
    color: theme.colors.text,
    marginBottom: 2,
  },

  userOffice: {
    fontSize: theme.fontSizes.sm,
    color: theme.colors.textSecondary,
  },

  statusButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs, // Gap azaltıldı
  },

  hideButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },


  favoriteButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.error, // Theme kırmızı rengi
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0,
  },


  favoriteButtonIcon: {
    width: 16,
    height: 16,
    tintColor: '#FFFFFF',
  },

  hideButtonIcon: {
    width: 16,
    height: 16,
    tintColor: '#FFFFFF',
  },

  // Matching Portfolios Button Styles
  matchingPortfoliosButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },

  matchingPortfoliosButtonActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },

  matchingPortfoliosButtonInactive: {
    backgroundColor: theme.colors.border,
    borderColor: theme.colors.border,
  },

  matchingPulseWrapper: {
    borderWidth: 2,
    borderRadius: theme.borderRadius.md,
    borderColor: theme.colors.primary,
  },

  matchingPortfoliosButtonText: {
    color: theme.colors.white,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.semibold,
    marginRight: theme.spacing.sm,
  },

  expandIcon: {
    color: theme.colors.white,
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.bold,
  },

  // Matching Portfolios Section Styles
  matchingPortfoliosSection: {
    marginTop: theme.spacing.md,
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },

  matchingPortfoliosTitle: {
    fontSize: theme.fontSizes.lg,
    fontWeight: theme.fontWeights.semibold,
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
    textAlign: 'center',
  },

  matchingPortfoliosList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },

  matchingPortfolioCard: {
    width: '48%',
    marginBottom: theme.spacing.sm,
    transform: [{ scale: 0.85 }],
  },


  requestTitle: {
    fontSize: theme.fontSizes.xxl,
    fontWeight: theme.fontWeights.semibold,
    color: theme.colors.text,
    flex: 1,
    marginRight: theme.spacing.md,
  },

  statusBadge: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.sm,
  },

  statusText: {
    color: theme.colors.white,
    fontSize: theme.fontSizes.md,
    fontWeight: theme.fontWeights.semibold,
  },

  requestDescription: {
    fontSize: theme.fontSizes.xl,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
    lineHeight: 20,
  },

  requestDetails: {
    marginBottom: theme.spacing.md,
  },

  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },

  detailLabel: {
    fontSize: theme.fontSizes.xl,
    color: theme.colors.textSecondary,
    fontWeight: theme.fontWeights.medium,
  },

  detailValue: {
    fontSize: theme.fontSizes.xl,
    color: theme.colors.text,
    fontWeight: theme.fontWeights.semibold,
  },

  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: theme.spacing.md,
    borderTopWidth: 2,
    borderTopColor: theme.colors.border,
  },


  contactButtons: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    alignItems: 'center',
  },

  phoneButton: {
    width: 40,
    height: 40,
    backgroundColor: theme.colors.error, // Theme kırmızı rengi
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },


  phoneButtonIcon: {
    width: 20,
    height: 20,
    tintColor: theme.colors.white, // Theme beyaz ikon
  },

  whatsappButton: {
    width: 40,
    height: 40,
    backgroundColor: theme.colors.success, // Theme yeşil rengi
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },


  whatsappButtonIcon: {
    width: 26, // Daha da büyütüldü
    height: 26, // Daha da büyütüldü
    tintColor: theme.colors.white, // Theme beyaz ikon
  },

  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.xxl,
    marginTop: theme.spacing.lg,
    ...theme.shadows.large,
    borderWidth: 2,
    borderColor: theme.colors.borderLight,
  },

  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },

  emptyText: {
    fontSize: theme.fontSizes.xxl,
    color: theme.colors.white,
    marginBottom: theme.spacing.sm,
    fontWeight: theme.fontWeights.semibold,
    textAlign: 'center',
  },

  emptySubtext: {
    fontSize: theme.fontSizes.xl,
    color: theme.colors.textWhite,
    textAlign: 'center',
  },

  // Skeleton Loading Styles
  skeletonCard: {
    backgroundColor: theme.colors.cardBg,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    borderWidth: 2,
    borderColor: theme.colors.border,
    ...theme.shadows.medium,
  },


  skeletonTitle: {
    height: 20,
    backgroundColor: theme.colors.progressBg,
    borderRadius: theme.borderRadius.sm,
    flex: 1,
    marginRight: theme.spacing.md,
  },


  skeletonDescription: {
    height: 16,
    backgroundColor: theme.colors.progressBg,
    borderRadius: theme.borderRadius.sm,
    marginBottom: theme.spacing.md,
  },

  skeletonDetails: {
    marginBottom: theme.spacing.md,
  },

  skeletonDetailRow: {
    height: 14,
    backgroundColor: theme.colors.progressBg,
    borderRadius: theme.borderRadius.sm,
    marginBottom: 4,
  },

  skeletonFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: theme.spacing.md,
    borderTopWidth: 2,
    borderTopColor: theme.colors.border,
  },



  skeletonButton: {
    width: 40,
    height: 40,
    backgroundColor: theme.colors.progressBg,
    borderRadius: theme.borderRadius.md,
  },

  // New Skeleton Styles for User Profile Section
  skeletonUserProfile: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
    paddingBottom: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },

  skeletonProfileImage: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: theme.colors.progressBg,
    marginRight: theme.spacing.md,
  },

  skeletonUserInfo: {
    flex: 1,
  },

  skeletonUserName: {
    height: 16,
    backgroundColor: theme.colors.progressBg,
    borderRadius: theme.borderRadius.sm,
    marginBottom: 4,
    width: '70%',
  },

  skeletonUserOffice: {
    height: 12,
    backgroundColor: theme.colors.progressBg,
    borderRadius: theme.borderRadius.sm,
    width: '50%',
  },

  skeletonStatusButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },

  skeletonStatusBadge: {
    width: 50,
    height: 24,
    backgroundColor: theme.colors.progressBg,
    borderRadius: theme.borderRadius.sm,
  },

  skeletonHideButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.progressBg,
  },

  skeletonMatchingButton: {
    height: 32,
    backgroundColor: theme.colors.progressBg,
    borderRadius: theme.borderRadius.md,
    width: 120,
  },

  skeletonContactButtons: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
});

export default DemandPool;
