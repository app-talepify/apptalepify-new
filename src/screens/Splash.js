import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Image, ActivityIndicator, StyleSheet, Dimensions, StatusBar, Animated, Easing } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth } from '../firebase';
import { onAuthStateChanged as firebaseOnAuthStateChanged } from 'firebase/auth';
import Video from 'react-native-video';
import { useTheme } from '../theme/ThemeContext';

const { width, height } = Dimensions.get('window');

const ALWAYS_SHOW_ONBOARDING = false; // Production: Normal flow

// İzinler artık ihtiyaç duyulduğunda istenecek (just-in-time permissions)
// - Kamera izni: Kamera butonuna basıldığında
// - Galeri izni: Galeri butonuna basıldığında
// - Konum izni: Harita görüntüleneceği zaman
// - Bildirim izni: Kullanıcı giriş yaptığında

export default function Splash() {
  const navigation = useNavigation();
  const { isDark } = useTheme();
  const [videoError, setVideoError] = useState(false);
  const [videoDuration, setVideoDuration] = useState(0);
  const [transitionStarted, setTransitionStarted] = useState(false);

  // Smooth crossfade/zoom transition
  const bgOpacity = useRef(new Animated.Value(0)).current;
  const videoScale = useRef(new Animated.Value(1)).current;
  const transitionDoneRef = useRef(false);

  // Video source - JS bundle üzerinden, hem iOS hem Android için tek kaynak
  // Dosya: src/assets/videos/splashmp.mp4
  const videoSource = require('../assets/videos/splashmp.mp4');

  const handleVideoError = (error) => {
    if (__DEV__) console.warn('[Splash] Video error:', error?.message || String(error));
    setVideoError(true);
  };

  const handleVideoEnd = () => {
    if (!transitionStarted && !transitionDoneRef.current) {
      startTransition();
    }
  };

  const proceedAfterSplash = useCallback(async () => {
    if (transitionDoneRef.current) {
      return;
    }
    transitionDoneRef.current = true;

    // Onboarding tamamlanmış mı?
    let onboardingCompleted = null;
    try {
      onboardingCompleted = await AsyncStorage.getItem('talepify.onboarding.completed');
    } catch (_) {}

    if (!onboardingCompleted && !ALWAYS_SHOW_ONBOARDING) {
      navigation.reset({ index: 0, routes: [{ name: 'Onboarding' }] });
      return;
    }

    // Auth state rehydration bekle (ilk event ile karar ver)
    const user = await new Promise(resolve => {
      let resolved = false;
      const unsubscribe = firebaseOnAuthStateChanged(auth, (u) => {
        if (resolved) {
          return;
        }
        resolved = true;
        unsubscribe();
        resolve(u);
      });
      setTimeout(() => {
        if (resolved) {
          return;
        }
        resolved = true;
        unsubscribe();
        resolve(auth.currentUser || null);
      }, 150);
    });

    if (user) {
      navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
    } else {
      navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
    }
  }, [navigation]);

  const startTransition = useCallback(() => {
    if (transitionStarted || transitionDoneRef.current) {
      return;
    }
    setTransitionStarted(true);

    // Overlap navigation decision with the visual transition to reduce idle time
    proceedAfterSplash();

    Animated.parallel([
      Animated.timing(bgOpacity, { toValue: 1, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(videoScale, { toValue: 1.03, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [bgOpacity, videoScale, proceedAfterSplash, transitionStarted]);

useEffect(() => {
  // Fallback: herhangi bir nedenle video progresi tetiklenmezse
  const fallback = setTimeout(() => {
    if (!transitionStarted && !transitionDoneRef.current) {
      startTransition();
    }
  }, 3200);
  return () => clearTimeout(fallback);
}, [startTransition, transitionStarted]);

  return (
    <View style={styles.container}>
      <StatusBar hidden />
      {!videoError ? (
        <>
          <Animated.View style={[styles.videoWrapper, { transform: [{ scale: videoScale }] }]}>
            <Video
              source={videoSource}
              style={styles.video}
              resizeMode="cover"
              onError={handleVideoError}
              onEnd={handleVideoEnd}
              onLoad={(e) => {
                const dur = e?.duration || 0;
                if (__DEV__) console.log('[Splash] Video loaded, duration:', dur);
                setVideoDuration(dur);
              }}
              onProgress={(e) => {
                if (videoDuration > 0 && !transitionStarted && !transitionDoneRef.current) {
                  const remaining = videoDuration - (e?.currentTime || 0);
                  if (remaining <= 0.9) {
                    startTransition();
                  }
                }
              }}
              muted={false}
              repeat={false}
              playInBackground={false}
              playWhenInactive={false}
            />
          </Animated.View>
          <Animated.Image
            source={isDark ? require('../assets/images/dark-bg2.png') : require('../assets/images/light-bg.jpg')}
            style={[styles.backgroundImage, { opacity: bgOpacity }]}
            resizeMode="cover"
          />
        </>
      ) : (
        <View style={styles.fallbackContainer}>
          <View style={styles.logoContainer}>
            <Image
              source={require('../assets/images/logobeyazkutu.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
          </View>

          <View style={styles.loadingContainer}>
            <View style={styles.loadingCircle}>
              <ActivityIndicator size="large" color="#FFFFFF" />
            </View>
          </View>

          <Text style={styles.madeBy}>Made by telly co.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  video: {
    width: width,
    height: height,
  },
  videoWrapper: {
    width: width,
    height: height,
  },
  backgroundImage: {
    ...StyleSheet.absoluteFillObject,
    width: width,
    height: height,
  },
  fallbackContainer: {
    flex: 1,
    backgroundColor: '#DC143C',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 120,
    paddingBottom: 60,
    paddingHorizontal: 24,
  },
  logoContainer: {
    alignItems: 'center',
  },
  logoImage: {
    width: 120,
    height: 120,
  },
  loadingContainer: {
    alignItems: 'center',
  },
  loadingCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  madeBy: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '400',
  },
});
