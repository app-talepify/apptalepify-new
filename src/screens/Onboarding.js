import React, { useRef, useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity, FlatList, Animated, Image } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeContext';

const { width } = Dimensions.get('window');
const ONBOARDING_KEY = 'talepify.onboarding.completed';

const slidesData = [
  {
    key: 's1',
    title: 'Ben senin cebindeki dijital asistanınım',
    titleHighlight: 'Merhaba,',
    desc: 'Şehrindeki tüm gayrimenkul danışmanları, Hepsi burada birlikte çalışıyorlar.',
    bg: '#DC143C',
    buttonText: 'İleri',
    mascot: require('../assets/images/robot-mascot4.png'),
  },
  {
    key: 's2',
    title: 'İş yükünü hafifletmek için',
    titleHighlight: 'buradayım',
    desc: 'Bir ajanda, sekreter ve asistanından Daha fazlası. (İsveç çakısı misali)',
    bg: '#DC143C',
    buttonText: 'İleri',
    mascot: require('../assets/images/robot-mascot2.png'),
  },
  {
    key: 's3',
    title: 'Hazırsan,',
    titleHighlight: 'Başlayalım',
    desc: 'Senin için yapabileceğime bir göz at.',
    bg: '#DC143C',
    buttonText: 'İleri',
    mascot: require('../assets/images/robot-mascot3.png'),
  },
  {
    key: 's4',
    title: 'Kullanmaya Başlayalım',
    desc: 'Tema tercihini seç ve Talepify dünyasına katıl.',
    bg: '#DC143C',
    buttonText: 'Başlayalım',
    showThemeSelection: true,
    mascot: require('../assets/images/robot-mascot1.png'),
  },
];

export default function Onboarding() {
  const navigation = useNavigation();
  const { setThemeName } = useTheme();
  const [themeChoice, setThemeChoice] = useState('dark');
  const listRef = useRef(null);
  const [index, setIndex] = useState(0);

  // Per-slide animated values (content-only)
  const contentAnim = useRef(slidesData.map(() => new Animated.Value(0))).current; // drives flip/scale/translate
  const logoScale = useRef(slidesData.map(() => new Animated.Value(0.9))).current;
  const titleOpacity = useRef(slidesData.map(() => new Animated.Value(0))).current;
  const titleTY = useRef(slidesData.map(() => new Animated.Value(12))).current;
  const descOpacity = useRef(slidesData.map(() => new Animated.Value(0))).current;
  const descTY = useRef(slidesData.map(() => new Animated.Value(16))).current;
  const ctaScale = useRef(slidesData.map(() => new Animated.Value(0.95))).current;
  const dotScale = useRef(slidesData.map(() => new Animated.Value(1))).current;

  const resetSlideAnims = useCallback((i) => {
    contentAnim[i].setValue(0);
    logoScale[i].setValue(0.9);
    titleOpacity[i].setValue(0);
    titleTY[i].setValue(12);
    descOpacity[i].setValue(0);
    descTY[i].setValue(16);
    ctaScale[i].setValue(0.95);
  }, [contentAnim, logoScale, titleOpacity, titleTY, descOpacity, descTY, ctaScale]);

  const playSlideIn = useCallback((i) => {
    // Reset first to ensure consistent entrance
    resetSlideAnims(i);
    Animated.parallel([
      Animated.timing(contentAnim[i], { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.spring(logoScale[i], { toValue: 1, friction: 6, useNativeDriver: true }),
      Animated.timing(titleOpacity[i], { toValue: 1, duration: 400, delay: 200, useNativeDriver: true }),
      Animated.timing(titleTY[i], { toValue: 0, duration: 400, delay: 200, useNativeDriver: true }),
      Animated.timing(descOpacity[i], { toValue: 1, duration: 400, delay: 300, useNativeDriver: true }),
      Animated.timing(descTY[i], { toValue: 0, duration: 400, delay: 300, useNativeDriver: true }),
      Animated.spring(ctaScale[i], { toValue: 1, friction: 7, delay: 400, useNativeDriver: true }),
    ]).start();
  }, [resetSlideAnims, contentAnim, logoScale, titleOpacity, titleTY, descOpacity, descTY, ctaScale]);

  const animateDots = useCallback((activeIdx) => {
    dotScale.forEach((v, i) => {
      Animated.spring(v, { toValue: i === activeIdx ? 1.8 : 1, friction: 7, useNativeDriver: true }).start();
    });
  }, [dotScale]);

  useEffect(() => {
    playSlideIn(index);
    animateDots(index);
  }, [index, playSlideIn, animateDots]);

  useEffect(() => {
    // initial animation
    playSlideIn(0);
    animateDots(0);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    if (viewableItems && viewableItems.length > 0) {
      const nextIndex = viewableItems[0].index ?? 0;
      setIndex(nextIndex);
    }
  }).current;

  const viewConfig = useRef({ viewAreaCoveragePercentThreshold: 60 }).current;

  const handleNext = useCallback(() => {
    if (index < slidesData.length - 1) {
      listRef.current?.scrollToIndex({ index: index + 1, animated: true });
    }
  }, [index]);

  const handleStart = useCallback(async () => {
    try {
      setThemeName(themeChoice === 'light' ? 'light' : 'dark');
      await AsyncStorage.setItem(ONBOARDING_KEY, '1');
    } catch (e) {}
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
  }, [navigation, themeChoice, setThemeName]);

  const renderItem = ({ item, index: i }) => {
    const isLast = item.key === 's4';

    // Basit alttan yukarı çıkma animasyonu
    const slideUpY = contentAnim[i].interpolate({ inputRange: [0, 1], outputRange: [50, 0] });
    const fadeOpacity = contentAnim[i].interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

    const contentTransforms = [{ translateY: slideUpY }];

    return (
      <View style={[styles.slide, { backgroundColor: item.bg, width }]}>
        {/* Logo */}
        <View style={styles.logoContainer}>
          <Image
            source={require('../assets/images/logosplash-beyaz.png')}
            defaultSource={require('../assets/images/logo-krimson.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />
        </View>
        
        <Animated.View style={[styles.contentWrap, { opacity: fadeOpacity, transform: contentTransforms }]}>
          {/* Robot Maskot */}
          <View style={styles.robotContainer}>
            <Animated.View style={[styles.robot, { transform: [{ scale: logoScale[i] }] }]}>
              <Image
                source={item.mascot}
                defaultSource={require('../assets/images/logo-krimson.png')}
                style={styles.robotImage}
                resizeMode="contain"
              />
            </Animated.View>
          </View>

          {/* Content Container */}
          <View style={styles.contentContainer}>
            {item.showThemeSelection ? (
              <>
                <View style={styles.titleContainer}>
                  <Animated.Text style={[styles.title, { opacity: titleOpacity[i], transform: [{ translateY: titleTY[i] }] }]}>
                    {item.title}
                  </Animated.Text>
                </View>
                
                <Animated.Text style={[styles.desc, { opacity: descOpacity[i], transform: [{ translateY: descTY[i] }] }]}>
                  {item.desc}
                </Animated.Text>

                {/* Tema Seçimi */}
                <View style={styles.themeRow}>
                  <TouchableOpacity
                    onPress={() => { setThemeChoice('dark'); setThemeName('dark'); }}
                    style={[styles.themeButton, themeChoice === 'dark' && styles.themeButtonActive]}
                  >
                    <Text style={[styles.themeButtonText, themeChoice === 'dark' && styles.themeButtonTextActive]}>Koyu Tema</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => { setThemeChoice('light'); setThemeName('light'); }}
                    style={[styles.themeButton, themeChoice === 'light' && styles.themeButtonActive]}
                  >
                    <Text style={[styles.themeButtonText, themeChoice === 'light' && styles.themeButtonTextActive]}>Açık Tema</Text>
                  </TouchableOpacity>
                </View>

                {/* Dots */}
                <View style={styles.dots}>
                  {slidesData.map((s, di) => (
                    <Animated.View
                      key={s.key}
                      style={[
                        styles.dot,
                        di === i && styles.dotActive,
                        { transform: [{ scaleX: dotScale[di] }] },
                      ]}
                    />
                  ))}
                </View>

                <AnimatedTouchable
                  style={[styles.cta, { transform: [{ scale: ctaScale[i] }] }]}
                  onPress={handleStart}
                  accessibilityRole="button"
                  accessibilityLabel="Başlayalım"
                >
                  <Text style={styles.ctaText}>{item.buttonText}</Text>
                </AnimatedTouchable>
              </>
            ) : (
              <>
                <View style={styles.titleContainer}>
                  {item.titleHighlight && (
                    <Animated.Text style={[styles.titleHighlight, { opacity: titleOpacity[i], transform: [{ translateY: titleTY[i] }] }]}>
                      {item.titleHighlight}
                    </Animated.Text>
                  )}
                  <Animated.Text style={[styles.title, { opacity: titleOpacity[i], transform: [{ translateY: titleTY[i] }] }]}>
                    {item.title}
                  </Animated.Text>
                </View>

                <Animated.Text style={[styles.desc, { opacity: descOpacity[i], transform: [{ translateY: descTY[i] }] }]}>
                  {item.desc}
                </Animated.Text>

                {/* Dots */}
                <View style={styles.dots}>
                  {slidesData.map((s, di) => (
                    <Animated.View
                      key={s.key}
                      style={[
                        styles.dot,
                        di === i && styles.dotActive,
                        { transform: [{ scaleX: dotScale[di] }] },
                      ]}
                    />
                  ))}
                </View>

                <AnimatedTouchable
                  style={[styles.cta, { transform: [{ scale: ctaScale[i] }] }]}
                  onPress={isLast ? handleStart : handleNext}
                  accessibilityRole="button"
                  accessibilityLabel={isLast ? 'Başlayalım' : 'İleri'}
                >
                  <Text style={styles.ctaText}>{item.buttonText}</Text>
                </AnimatedTouchable>
              </>
            )}
          </View>
        </Animated.View>
      </View>
    );
  };

  return (
    <FlatList
      ref={listRef}
      data={slidesData}
      keyExtractor={(it) => it.key}
      renderItem={renderItem}
      horizontal
      pagingEnabled
      showsHorizontalScrollIndicator={false}
      onViewableItemsChanged={onViewableItemsChanged}
      viewabilityConfig={viewConfig}
    />
  );
}

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

const styles = StyleSheet.create({
  slide: {
    flex: 1,
    paddingTop: 40,
    paddingHorizontal: 24,
  },
  logoContainer: {
    alignItems: 'center',
    paddingTop: 20,
    marginBottom: 20,
  },
  logoImage: {
    width: 120,
    height: 60,
  },
  contentWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  robotContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'flex-end',
    marginBottom: -80, // Maskotu daha fazla container'a yapışık hale getir
    marginTop: -40, // Maskotu yukarı çıkar
  },
  robot: {
    width: 280, // Maskot boyutu büyütüldü
    height: 280,
    alignItems: 'center',
    justifyContent: 'center',
  },
  robotImage: {
    width: 280, // Maskot boyutu büyütüldü
    height: 280,
  },
  contentContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 24,
    paddingTop: 100, // Üst padding artırıldı büyük maskot için
    paddingBottom: 40, // Alt padding
    flex: 1, // Container'ı tam boyut yap
    marginBottom: 0, // Alt boşluk kaldır
  },
  titleContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1F2937',
    textAlign: 'center',
    lineHeight: 34,
  },
  titleHighlight: {
    fontSize: 28,
    fontWeight: '700',
    color: '#DC143C',
    textAlign: 'center',
    marginBottom: 4,
  },
  desc: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  // First slide styles
  phoneContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginVertical: 20,
  },
  countryCode: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
  },
  flag: {
    fontSize: 20,
    marginRight: 8,
  },
  codeText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  phoneNumber: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    letterSpacing: 1,
  },
  continueButton: {
    backgroundColor: '#DC143C',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginVertical: 16,
  },
  continueButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  referralText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 8,
  },
  referralButton: {
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
    alignSelf: 'center',
  },
  referralButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
  },
  // Other slides styles
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 24,
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E5E7EB',
  },
  dotActive: {
    backgroundColor: '#DC143C',
    width: 24,
  },
  cta: {
    backgroundColor: '#DC143C',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginHorizontal: 20,
  },
  ctaText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  // Tema seçimi stilleri
  themeRow: {
    flexDirection: 'row',
    gap: 12,
    marginVertical: 24,
    justifyContent: 'center',
  },
  themeButton: {
    borderWidth: 1,
    borderColor: '#DC143C',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: 'transparent',
    minWidth: 100,
  },
  themeButtonActive: {
    backgroundColor: '#DC143C',
  },
  themeButtonText: {
    color: '#DC143C',
    fontWeight: '600',
    textAlign: 'center',
    fontSize: 14,
  },
  themeButtonTextActive: {
    color: '#FFFFFF',
  },
});


