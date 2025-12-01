import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Modal, Image, Dimensions, TouchableOpacity, Animated, PanResponder, Easing } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useTheme } from '../theme/ThemeContext';
import { getFontFamily } from '../utils/fonts';
import { togglePortfolioFavorite, getPortfolioFavorites, isPortfolioFavorite } from '../services/portfolioFavorites';


const { width, height } = Dimensions.get('window');

const SWIPE_THRESHOLD = Math.min(width * 0.28, 140);
const ROTATION_MAX_DEG = 18;

const formatPrice = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) { return '—'; }
  try {
    const tr = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
    return `${tr}₺`;
  } catch {
    return `${n}₺`;
  }
};

const getFirstImageUri = (portfolio) => {
  const imgs = portfolio?.images || [];
  if (Array.isArray(imgs) && imgs.length > 0) {
    const first = imgs[0];
    if (typeof first === 'string') return first;
    if (first?.url) return first.url;
    if (first?.uri) return first.uri;
  }
  return null;
};

const Card = ({ item, isTop, pan, rotate, onPressDetails, isFav, styles, themeColors, panHandlers, appear }) => {
  const imageUri = getFirstImageUri(item);
  const appearScale = appear
    ? appear.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] })
    : 1;
  const appearTranslateY = appear
    ? appear.interpolate({ inputRange: [0, 1], outputRange: [4, 0] })
    : 0;
  const appearOpacity = appear
    ? appear.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] })
    : 1;
  return (
    <Animated.View
      {...(isTop ? panHandlers : {})}
      style={[
        styles.card,
        isTop && {
          opacity: 1,
          zIndex: 2,
          transform: [
            { translateX: pan.x },
            { translateY: Animated.add(pan.y, appearTranslateY) },
            { rotate: rotate },
            { scale: appearScale },
          ],
        },
        !isTop && styles.cardBehind,
      ]}
    >
      <View
        style={styles.cardGradientBg}
        pointerEvents="none"
      >
        <LinearGradient
          colors={['rgb(24, 54, 73)', 'rgb(17, 36, 49)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 18 }}
        />
      </View>
      <View style={styles.cardImageWrapper}>
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.cardImage} resizeMode="cover" />
        ) : (
          <View style={[styles.cardImage, styles.cardImagePlaceholder]}>
            <Text style={styles.placeholderText}>Görsel yok</Text>
          </View>
        )}
        <View style={styles.cardBadgeRow}>
          <View style={[styles.badge, { backgroundColor: themeColors.error }]}>
            <Text style={styles.badgeText}>{item?.propertyType || 'Portföy'}</Text>
          </View>
          {isFav ? (
            <View style={[styles.badge, { backgroundColor: 'rgba(255,255,255,0.85)' }]}>
              <Text style={[styles.badgeText, { color: themeColors.error }]}>Favori</Text>
            </View>
          ) : null}
        </View>
      </View>
      <TouchableOpacity activeOpacity={0.8} onPress={() => onPressDetails && onPressDetails(item)}>
        <View style={styles.infoContainer}>
          <View style={styles.infoContent}>
            <Text style={styles.infoTitle} numberOfLines={2}>{item?.title || 'Başlık Yok'}</Text>
            <Text style={styles.infoMeta} numberOfLines={1}>
              {(item?.district ? `${item.district}, ` : '') + (item?.city || '')}
            </Text>
            <View style={styles.infoPillsRow}>
              {!!item?.roomCount && <Text style={styles.infoPill}>{item.roomCount}</Text>}
              {!!item?.netSquareMeters && <Text style={styles.infoPill}>{`${item.netSquareMeters} m²`}</Text>}
              {!!item?.listingStatus && <Text style={styles.infoPill}>{item.listingStatus}</Text>}
            </View>

            {/* Portföy Sahibi Bilgileri - pin modaline birebir yakın düzen */}
            <View style={styles.ownerInfoRow}>
              {/* Solda sadece ikon + yazı (arkaplan yok) */}
              <View style={styles.priceBadgeContainer}>
                <View style={styles.priceRow}>
                  <Image source={require('../assets/images/icons/fiyat.png')} style={styles.priceIcon} />
                  <Text style={styles.priceText}>{formatPrice(item?.price)}</Text>
                </View>
              </View>

              {/* Sağda danışman kartı */}
              <View style={styles.ownerCardContainer}>
                <View style={styles.ownerCardContent}>
                  <View style={styles.ownerCardLeft}>
                    <Text style={styles.ownerNameText} numberOfLines={1}>
                      {item?.ownerName || 'Gayrimenkul Danışmanı'}
                    </Text>
                    {!!item?.officeName && (
                      <Text style={styles.ownerOfficeText} numberOfLines={1}>
                        {item.officeName}
                      </Text>
                    )}
                  </View>
                  <View style={styles.ownerAvatarContainer}>
                    <Image
                      source={item?.ownerAvatar ? { uri: item.ownerAvatar } : require('../assets/images/logo-krimson.png')}
                      style={styles.ownerAvatar}
                      resizeMode="cover"
                    />
                  </View>
                </View>
              </View>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

const PortfolioSwipeOverlay = ({
  visible,
  portfolios,
  onClose,
  onOpenDetails,
  userId,
  mode = 'new', // 'new' | 'all'
  totalCount = 0,
  newCount = 0,
  markSeenOnComplete = false,
  onAllSeen,
  onReplayAll,
  initialIndex = 0,
  onIndexChange,
  onPortfolioSeen,
}) => {
  const { theme: currentTheme } = useTheme();
  const styles = useMemo(() => createStyles(currentTheme), [currentTheme]);
  const [index, setIndex] = useState(0);
  const [favoritesSet, setFavoritesSet] = useState(new Set());
  const [showDoneMessage, setShowDoneMessage] = useState(false);
  const [controlsHidden, setControlsHidden] = useState(false);
  // Favori toast animasyonları
  const favToastOpacity = useRef(new Animated.Value(0)).current;
  const favToastScale = useRef(new Animated.Value(0.85)).current;
  const favToastX = useRef(new Animated.Value(0)).current;
  const favToastY = useRef(new Animated.Value(0)).current;
  const [actionsRowLayout, setActionsRowLayout] = useState(null);
  const [favBtnLayout, setFavBtnLayout] = useState(null);
  const containerRef = useRef(null);
  const favBtnRef = useRef(null);
  const [rootAbs, setRootAbs] = useState(null);
  const [favAbs, setFavAbs] = useState(null);
  const topAppear = useRef(new Animated.Value(1)).current;
  const overlayScale = useRef(new Animated.Value(0.85)).current;
  const hasAutoClosedRef = useRef(false);
  const autoCloseTimeoutRef = useRef(null);

  const pan = useRef(new Animated.ValueXY()).current;
  const rotate = pan.x.interpolate({
    inputRange: [-SWIPE_THRESHOLD, 0, SWIPE_THRESHOLD],
    outputRange: [`-${ROTATION_MAX_DEG}deg`, '0deg', `${ROTATION_MAX_DEG}deg`],
    extrapolate: 'clamp',
  });

  const emptyAppear = useRef(new Animated.Value(0)).current;

  const resetPosition = () => {
    Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: true, friction: 6 }).start();
  };

  const animateOut = (toX, cb) => {
    Animated.timing(pan, { toValue: { x: toX, y: 0 }, duration: 220, useNativeDriver: true }).start(() => {
      pan.setValue({ x: 0, y: 0 });
      cb && cb();
    });
  };

  // Her swipe işleminde ilgili kartı parametre olarak al, index'in async güncellenmesinden etkilenmesin
  const swipeLeft = (item) => {
    const current = item || portfolios[index];
    if (!current) return;

    const isLast =
      Array.isArray(portfolios) && portfolios.length > 0 && index >= portfolios.length - 1;

    try {
      if (current?.id && typeof onPortfolioSeen === 'function') {
        onPortfolioSeen(current);
      }
    } catch {}

    if (isLast) {
      // Son kartta: kontrolleri hemen gizle, kartı dışarı uçur, animasyon bittikten sonra boş mesajı devreye al
      setControlsHidden(true);
      animateOut(-width * 1.2, () => {
        setIndex((i) => i + 1);
        setShowDoneMessage(true);
      });
    } else {
      // Son kart değilse normal davran
      animateOut(-width * 1.2, () => {
        setIndex((i) => i + 1);
      });
    }
  };

  const swipeRight = async (item) => {
    const current = item || portfolios[index];
    if (!current) return;

    const isLast =
      Array.isArray(portfolios) && portfolios.length > 0 && index >= portfolios.length - 1;

    if (current?.id) {
      try {
        await togglePortfolioFavorite(userId, current.id);
        setFavoritesSet((prev) => {
          const next = new Set(prev);
          if (next.has(current.id)) next.delete(current.id); else next.add(current.id);
          return next;
        });
      } catch {}
    }
    // "Favoriye eklendi" tostu: merkezden favori butonuna doğru kaydır, küçült ve sön
    {
      // Toast overlay'in merkezi (container ölçüldüyse ona göre, yoksa ekran ortası)
      const centerAbsX = rootAbs ? (rootAbs.x + rootAbs.width / 2) : width / 2;
      const centerAbsY = rootAbs ? (rootAbs.y + rootAbs.height / 2) : height / 2;

      let destAbsX;
      let destAbsY;

      if (favAbs) {
        // Ölçülmüş favori butonunun merkezine doğru uçur (en doğru senaryo)
        destAbsX = favAbs.x + favAbs.width / 2;
        destAbsY = favAbs.y + favAbs.height / 2;
      } else if (rootAbs && actionsRowLayout && favBtnLayout) {
        // Container + actionsRow + buton layout'larından tahmin et
        destAbsX =
          rootAbs.x +
          actionsRowLayout.x +
          favBtnLayout.x +
          (favBtnLayout.width || 0) / 2;
        destAbsY =
          rootAbs.y +
          actionsRowLayout.y +
          favBtnLayout.y +
          (favBtnLayout.height || 0) / 2;
      } else {
        // Basit fallback: ekranın alt-sağ tarafı
        destAbsX = width * 0.8;
        destAbsY = height * 0.8;
      }

      const destX = destAbsX - centerAbsX;
      const destY = destAbsY - centerAbsY;

      favToastX.setValue(0);
      favToastY.setValue(0);
      favToastScale.setValue(1);
      favToastOpacity.setValue(0);

      Animated.sequence([
        Animated.parallel([
          Animated.timing(favToastOpacity, { toValue: 1, duration: 100, useNativeDriver: true }),
          Animated.spring(favToastScale, { toValue: 1.06, useNativeDriver: true, friction: 6, tension: 120 }),
        ]),
        Animated.parallel([
          Animated.timing(favToastX, { toValue: destX, duration: 380, useNativeDriver: true }),
          Animated.timing(favToastY, { toValue: destY, duration: 380, useNativeDriver: true }),
          Animated.timing(favToastScale, { toValue: 0.78, duration: 360, useNativeDriver: true }),
        ]),
        Animated.timing(favToastOpacity, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]).start();
    }
    try {
      if (current?.id && typeof onPortfolioSeen === 'function') {
        onPortfolioSeen(current);
      }
    } catch {}

    if (isLast) {
      // Son kartta: kontrolleri hemen gizle, kartı dışarı uçur, animasyon bittikten sonra boş mesajı devreye al
      setControlsHidden(true);
      animateOut(width * 1.2, () => {
        setIndex((i) => i + 1);
        setShowDoneMessage(true);
      });
    } else {
      // Son kart değilse normal davran
      animateOut(width * 1.2, () => {
        setIndex((i) => i + 1);
      });
    }
  };

  // Güncel top item'ı swipe handler'larında kullanmak için ref'te sakla
  const topItemRef = useRef(null);

  useEffect(() => {
    topItemRef.current = portfolios[index] || null;
  }, [portfolios, index]);

  const pressStartRef = useRef(0);
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true, // kartın her yerinden başlat
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dx) > 4,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        pressStartRef.current = Date.now();
        try {
          pan.stopAnimation();
          // Çakışmayı önle: büyüme animasyonu sürüyorsa bitir
          if (topAppear && typeof topAppear.stopAnimation === 'function') {
            topAppear.stopAnimation();
            topAppear.setValue(1);
          }
        } catch {}
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
      onPanResponderRelease: (_, gesture) => {
        const elapsed = Date.now() - (pressStartRef.current || 0);
        const isTap = Math.abs(gesture.dx) < 6 && Math.abs(gesture.dy) < 6 && elapsed < 220;
        const item = topItemRef.current;
        if (isTap) {
          if (onOpenDetails && item) { onOpenDetails(item); }
          resetPosition();
          return;
        }
        if (gesture.dx > SWIPE_THRESHOLD) {
          swipeRight(item);
        } else if (gesture.dx < -SWIPE_THRESHOLD) {
          swipeLeft(item);
        } else {
          resetPosition();
        }
      },
    })
  ).current;

  // Kapatma animasyonu: kart açılıştaki gibi ama bu kez tamamen kaybolana kadar küçülsün
  const handleRequestClose = useCallback(() => {
    try {
      Animated.timing(overlayScale, {
        toValue: 0,
        duration: 380,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(() => {
        if (onClose) {
          onClose();
        }
      });
    } catch {
      if (onClose) {
        onClose();
      }
    }
  }, [overlayScale, onClose]);

  // Son kartta boş kartı kısa gösterip overlay'i kapat
  const scheduleAutoCloseIfNeeded = useCallback(() => {
    if (hasAutoClosedRef.current) return;
    hasAutoClosedRef.current = true;
    if (autoCloseTimeoutRef.current) {
      try { clearTimeout(autoCloseTimeoutRef.current); } catch {}
      autoCloseTimeoutRef.current = null;
    }
    autoCloseTimeoutRef.current = setTimeout(() => {
      try {
        handleRequestClose();
      } catch {}
      autoCloseTimeoutRef.current = null;
    }, 1200); // boş state'i göster, sonra yumuşak animasyonla kapa
  }, [handleRequestClose]);

  // Overlay açılış animasyonu: çok küçükten, yavaşça büyüyerek gelsin (opacity sabit kalsın)
  useEffect(() => {
    if (!visible) {
      return;
    }
    try {
      // Boş mesaj / kontroller state'ini her açılışta sıfırla
      setShowDoneMessage(false);
      setControlsHidden(false);
      overlayScale.setValue(0.8);
      Animated.timing(overlayScale, {
        toValue: 1,
        duration: 450,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } catch {}
  }, [visible, overlayScale]);

  // Parent'a index değişimini bildir
  useEffect(() => {
    if (typeof onIndexChange === 'function') {
      onIndexChange(index);
    }
  }, [index, onIndexChange]);

  useEffect(() => {
    if (!visible) return;

    // Parent'tan gelen başlangıç index'ini kullan (örneğin detaydan dönüşte kaldığın yer)
    let nextIndex = Number.isInteger(initialIndex) ? initialIndex : 0;
    const max = (portfolios?.length || 0) - 1;
    if (max >= 0) {
      if (nextIndex < 0) nextIndex = 0;
      if (nextIndex > max) nextIndex = max;
    } else {
      nextIndex = 0;
    }
    setIndex(nextIndex);
    try { topAppear.setValue(1); } catch {}
    let mounted = true;
    (async () => {
      try {
        const favs = await getPortfolioFavorites(userId);
        if (mounted) setFavoritesSet(new Set(favs));
      } catch {
        if (mounted) setFavoritesSet(new Set());
      }
    })();
    return () => { mounted = false; };
  }, [visible, userId, topAppear, initialIndex, portfolios]);

  const topItem = portfolios[index];
  const nextItem = portfolios[index + 1];
  const done = !topItem;
  const visualDone = done || showDoneMessage;

  // Bu oturumda görülen portföyleri parent'a bildir (sadece markSeenOnComplete=true ise)
  const hasReportedSeenRef = useRef(false);
  const hasShownEmptyRef = useRef(false);
  useEffect(() => {
    if (!visible) {
      hasReportedSeenRef.current = false;
      hasAutoClosedRef.current = false;
      hasShownEmptyRef.current = false;
      if (autoCloseTimeoutRef.current) {
        try { clearTimeout(autoCloseTimeoutRef.current); } catch {}
        autoCloseTimeoutRef.current = null;
      }
      setControlsHidden(false);
      return;
    }
    if (!done || !markSeenOnComplete) return;
    if (hasReportedSeenRef.current) return;
    if (Array.isArray(portfolios) && portfolios.length > 0 && onAllSeen) {
      hasReportedSeenRef.current = true;
      try {
        onAllSeen(portfolios);
      } catch {}
    }
  }, [done, visible, markSeenOnComplete, portfolios, onAllSeen]);

  // Başlangıçtan itibaren hiç portföy yoksa (badge boşken açılmışsa):
  // - Kontrolleri gizle
  // - "Gösterilecek başka portföy kalmadı" mesajını göster
  // - Kısa süre sonra otomatik kapansın (scheduleAutoCloseIfNeeded, showDoneMessage üzerinden tetiklenir)
  useEffect(() => {
    if (!visible) return;
    if (!Array.isArray(portfolios) || portfolios.length > 0) return;
    setControlsHidden(true);
    if (!showDoneMessage) {
      setShowDoneMessage(true);
    }
  }, [visible, portfolios, showDoneMessage]);

  // Tüm portföyler gösterildiyse, boş kartı kısa gösterip overlay'i otomatik kapat
  useEffect(() => {
    if (!visible || !showDoneMessage) return;
    // Kapanma zamanlamasını tek yerden yönet (son kart swipe / buton fark etmeksizin)
    scheduleAutoCloseIfNeeded();
  }, [showDoneMessage, visible, scheduleAutoCloseIfNeeded]);

  useEffect(() => {
    // Yeni top kartı yumuşakça içeri al
    try {
      topAppear.setValue(0);
      Animated.parallel([
        Animated.spring(topAppear, { toValue: 1, useNativeDriver: true, friction: 7, tension: 95 }),
      ]).start();
    } catch {}
  }, [index, topAppear]);

  // Boş durum badge'i için giriş animasyonu (her açılışta sadece 1 kez)
  useEffect(() => {
    if (!visible || !visualDone) return;
    if (hasShownEmptyRef.current) return;
    hasShownEmptyRef.current = true;
    try {
      emptyAppear.setValue(0);
      Animated.spring(emptyAppear, {
        toValue: 1,
        friction: 7,
        tension: 90,
        useNativeDriver: true,
      }).start();
    } catch {}
  }, [visualDone, visible, emptyAppear]);

  const headerTitleText = useMemo(() => {
    if (mode === 'all') {
      if (totalCount > 0) return `Tüm portföyler (${totalCount})`;
      return 'Bu dönemde portföy yok';
    }
    // mode === 'new'
    if (newCount > 0) return `Yeni portföyler (${newCount})`;
    return 'Bu dönemde yeni portföy yok';
  }, [mode, totalCount, newCount]);

  // (Auto-close artık swipe içindeki scheduleAutoCloseIfNeeded ile yönetiliyor)

  return (
    <Modal visible={visible} animationType="none" transparent onRequestClose={handleRequestClose}>
      <View style={styles.backdrop} />
      <Animated.View
        style={[
          styles.container,
          {
            transform: [{ scale: overlayScale }],
          },
        ]}
        ref={containerRef}
        onLayout={() => {
          try {
            containerRef.current?.measure((x, y, width, height, pageX, pageY) => {
              setRootAbs({ x: pageX, y: pageY, width, height });
            });
          } catch {}
        }}
      >
        {!controlsHidden && (
          <View style={styles.header}>
            <Text style={styles.headerTitle}>{headerTitleText}</Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={handleRequestClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={styles.closeText}>Kapat</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.deckArea}>
          <View style={styles.cardsStackArea}>
            {/* Behind card */}
            {!visualDone && nextItem && (
              <View
                key={`wrap-next-${nextItem?.id || (index + 1)}`}
                style={[StyleSheet.absoluteFill, styles.deckCenter]}
              >
                <Card
                  key={`next-${nextItem?.id || (index + 1)}`}
                  item={nextItem}
                  isTop={false}
                  pan={pan}
                  rotate={'0deg'}
                  onPressDetails={onOpenDetails}
                  isFav={isPortfolioFavorite(favoritesSet, nextItem?.id)}
                  styles={styles}
                  themeColors={currentTheme.colors}
                />
              </View>
            )}

            {/* Top card */}
            {!visualDone && topItem && (
              <View
                key={`wrap-top-${topItem?.id || index}`}
                style={[StyleSheet.absoluteFill, styles.deckCenter]}
              >
                <Card
                  key={`top-${topItem?.id || index}`}
                  item={topItem}
                  isTop
                  pan={pan}
                  rotate={rotate}
                  onPressDetails={onOpenDetails}
                  isFav={isPortfolioFavorite(favoritesSet, topItem?.id)}
                  styles={styles}
                  themeColors={currentTheme.colors}
                  panHandlers={panResponder.panHandlers}
                  appear={topAppear}
                />
              </View>
            )}

            {visualDone && (
              <View style={styles.emptyState}>
                <Animated.View
                  style={[
                    styles.emptyStateBadge,
                    {
                      opacity: emptyAppear,
                      transform: [
                        {
                          scale: emptyAppear.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0.9, 1],
                          }),
                        },
                      ],
                    },
                  ]}
                >
                  <Text style={styles.emptyTitle}>Gösterilecek başka portföy kalmadı</Text>
                  <Text style={styles.emptySubtitle}>Daha sonra tekrar kontrol edin.</Text>
                </Animated.View>
              </View>
            )}
          </View>

          {!controlsHidden && (
            <View
              style={styles.actionsRow}
              onLayout={(e) => setActionsRowLayout(e.nativeEvent.layout)}
            >
              <View style={styles.backButtonWrapper}>
                <TouchableOpacity
                  style={[styles.actionButton, styles.backButton]}
                  onPress={onReplayAll}
                  activeOpacity={0.9}
                >
                  <Image
                    source={require('../assets/images/icons/repeat.png')}
                    style={styles.backIcon}
                  />
                </TouchableOpacity>
              </View>
              <View style={styles.actionButtonWrapper}>
                <TouchableOpacity
                  style={[styles.actionButton, styles.skipButton]}
                  onPress={() => swipeLeft(topItem)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.actionText}>Geç</Text>
                </TouchableOpacity>
              </View>
              <View
                style={styles.actionButtonWrapper}
                onLayout={(e) => setFavBtnLayout(e.nativeEvent.layout)}
              >
                <TouchableOpacity
                  ref={favBtnRef}
                  style={[styles.actionButton, styles.favButton]}
                  onPress={() => swipeRight(topItem)}
                  activeOpacity={0.85}
                  onLayout={() => {
                    try {
                      favBtnRef.current?.measure((x, y, width, height, pageX, pageY) => {
                        setFavAbs({ x: pageX, y: pageY, width, height });
                      });
                    } catch {}
                  }}
                >
                  <Text style={styles.actionText}>Favoriye Ekle</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* Favoriye eklendi toast */}
        <View pointerEvents="none" style={styles.favToastOverlay}>
      <Animated.View style={[
            styles.favToast,
            {
              opacity: favToastOpacity,
              transform: [{ translateX: favToastX }, { translateY: favToastY }, { scale: favToastScale }],
              zIndex: 10000,
              elevation: 50,
            }
          ]}>
            <Image source={require('../assets/images/icons/Favorite_fill.png')} style={styles.favToastIcon} />
            <Text style={styles.favToastText}>Favoriye eklendi</Text>
          </Animated.View>
        </View>
      </Animated.View>
    </Modal>
  );
};

const createStyles = (currentTheme) => StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)', // Arka karartma: yarı şeffaf siyah
  },
  container: {
    flex: 1,
    justifyContent: 'center',
  },
  header: {
    position: 'absolute',
    top: Math.min(height * 0.06, 48),
    left: 20,
    right: 20,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    color: '#FFFFFF',
    fontFamily: getFontFamily('bold'),
    fontWeight: 'bold',
    textAlign: 'center',
  },
  closeButton: {
    position: 'absolute',
    right: 0,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: currentTheme.colors.error,
    borderRadius: 8,
  },
  closeText: {
    color: '#FFFFFF',
    fontFamily: getFontFamily('bold'),
  },
  deckArea: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Math.min(width * 0.05, 20),
    paddingTop: Math.min(height * 0.03, 24),
    paddingBottom: Math.min(height * 0.02, 16),
  },
  cardsStackArea: {
    width: '100%',
    height: Math.min(height * 0.50, 380),
  },
  deckCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: width - Math.min(width * 0.14, 56),
    minHeight: Math.min(height * 0.48, 380),
    borderRadius: 18,
    backgroundColor: 'transparent',
    overflow: 'hidden',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
  },
  cardGradientBg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  cardBehind: {
    transform: [{ scale: 0.94 }, { translateY: 8 }],
    opacity: 1,
    zIndex: 1,
  },
  cardImageWrapper: {
    height: Math.min(height * 0.34, 230),
    width: '100%',
    backgroundColor: '#111827',
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  cardImagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    color: '#cccccc',
    fontFamily: getFontFamily('bold'),
  },
  infoContainer: {
    position: 'relative',
    overflow: 'hidden',
    padding: 14,
  },
  infoContent: {
    zIndex: 1,
  },
  infoTitle: {
    fontSize: 18,
    fontFamily: getFontFamily('bold'),
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  infoPrice: {
    marginTop: 8,
    fontSize: 16,
    fontFamily: getFontFamily('bold'),
    color: '#FFD166',
  },
  infoMeta: {
    marginTop: 4,
    fontSize: 13,
    color: 'rgba(255,255,255,0.92)',
    fontFamily: getFontFamily('regular'),
  },
  infoPillsRow: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  infoPill: {
    fontSize: 12,
    color: '#FFFFFF',
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    overflow: 'hidden',
    fontFamily: getFontFamily('bold'),
  },
  ownerRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  ownerContainer: {
    marginTop: 12,
    padding: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  ownerInfoRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  priceBadgeContainer: {
    alignSelf: 'stretch',
    justifyContent: 'center',
    marginRight: 8,
  },
  ownerCardContainer: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderWidth: 0,
    padding: 10,
  },
  ownerCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  ownerCardLeft: {
    flex: 1,
    minWidth: 0,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 0,
    gap: 6,
  },
  priceIcon: {
    width: 16,
    height: 16,
    tintColor: currentTheme.colors.error,
  },
  priceText: {
    color: '#FFFFFF',
    fontFamily: getFontFamily('bold'),
    fontSize: 16,
  },
  ownerAvatarContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  ownerAvatar: {
    width: '100%',
    height: '100%',
  },
  ownerTextCol: {
    flex: 1,
    minWidth: 0,
  },
  ownerNameText: {
    color: '#FFFFFF',
    fontFamily: getFontFamily('bold'),
    fontSize: 13,
  },
  ownerOfficeText: {
    color: 'rgba(255,255,255,0.85)',
    fontFamily: getFontFamily('regular'),
    fontSize: 12,
    marginTop: 2,
  },
  cardBadgeRow: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  badge: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  badgeText: {
    color: '#fff',
    fontFamily: getFontFamily('bold'),
    fontSize: 12,
  },
  // cardContent kaldırıldı
  cardTitle: {
    fontSize: 18,
    fontFamily: getFontFamily('bold'),
    fontWeight: 'bold',
    color: currentTheme.colors.taskCard.text,
  },
  cardPrice: {
    marginTop: 8,
    fontSize: 16,
    fontFamily: getFontFamily('bold'),
    color: currentTheme.colors.error,
  },
  cardMeta: {
    marginTop: 4,
    fontSize: 13,
    color: currentTheme.colors.card.text,
    fontFamily: getFontFamily('regular'),
  },
  cardMetaRow: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  cardMetaPill: {
    fontSize: 12,
    color: currentTheme.colors.taskCard.text,
    backgroundColor: currentTheme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    overflow: 'hidden',
    fontFamily: getFontFamily('bold'),
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Math.min(width * 0.10, 40),
    marginTop: 26,
  },
  backButtonWrapper: {
    marginRight: 8,
  },
  actionButtonWrapper: {
    flex: 1,
    marginHorizontal: 6,
  },
  actionButton: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  skipButton: {
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  favButton: {
    backgroundColor: currentTheme.colors.error,
  },
  backButton: {
    backgroundColor: '#16A34A',
    paddingHorizontal: 14,
  },
  backIcon: {
    width: 18,
    height: 18,
    tintColor: '#FFFFFF',
  },
  actionText: {
    color: '#fff',
    fontFamily: getFontFamily('bold'),
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  emptyStateBadge: {
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 18,
    backgroundColor: currentTheme.colors.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    color: '#ffffff',
    fontFamily: getFontFamily('bold'),
    fontSize: 16,
  },
  emptySubtitle: {
    color: '#f4f4f4',
    fontFamily: getFontFamily('regular'),
    marginTop: 6,
    fontSize: 13,
  },
  favToastOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    elevation: 40,
  },
  favToastIcon: {
    width: 20,
    height: 20,
    tintColor: currentTheme.colors.error,
    marginRight: 8,
  },
  favToastText: {
    color: '#FFFFFF',
    fontFamily: getFontFamily('bold'),
    fontSize: 14,
  },
  favToast: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 14,
  },
});

export default PortfolioSwipeOverlay;


