import React, { useEffect, useMemo } from 'react';
import { StatusBar, LogBox } from 'react-native';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { AuthProvider } from './src/context/AuthContext';
import { DeviceAuthProvider } from './src/context/DeviceAuthContext';
import RootNavigator from './src/navigation/RootNavigator';
import reminderScheduler from './src/services/reminderScheduler';
import './src/services/notificationService'; // Legacy local notifications init (koru)
import { USE_MAPBOX_POOL } from '@env';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';
import { Provider as PaperProvider } from 'react-native-paper';
import { BackdropProvider } from './src/context/BackdropContext';
import otpService from './src/services/otpService';
import { initializeMapbox } from './src/utils/mapboxConfig';
import './src/firebase'; // Firebase'i initialize et

// Geçici: Belirli image ve deprecation uyarılarını sadece development'ta gizle
if (__DEV__) {
  LogBox.ignoreLogs([
    'ReactImageView: Image source',
    'Image source "null" doesn\'t exist',
    // Firebase v23 deprecation warnings - API zaten doğru, sadece library versiyonu eski
    'This method is deprecated',
    'React Native Firebase namespaced API',
    'migration guide',
    'rnfirebase.io',
  ]);
}

const ThemedNavigation = () => {
  const { theme, isDark } = useTheme();
  const navigationTheme = useMemo(() => ({
    ...(isDark ? DarkTheme : DefaultTheme),
    colors: {
      ...(isDark ? DarkTheme.colors : DefaultTheme.colors),
      background: theme.colors.background,
      card: theme.colors.surface,
      text: theme.colors.text,
      border: theme.colors.border,
      primary: theme.colors.accent,
    },
  }), [theme, isDark]);

  const paperTheme = useMemo(() => ({
    version: 3,
    dark: true,
    roundness: 4,
    colors: {
      primary: 'rgb(220, 20, 60)',
      onPrimary: 'rgb(0, 0, 0)',
      primaryContainer: 'rgba(24, 54, 73, 0.93)',
      onPrimaryContainer: 'rgb(255, 255, 255)',
      secondary: 'rgb(177, 200, 205)',
      onSecondary: 'rgb(29, 52, 56)',
      secondaryContainer: 'rgb(52, 74, 79)',
      onSecondaryContainer: 'rgb(205, 228, 233)',
      tertiary: 'rgb(192, 196, 224)',
      onTertiary: 'rgb(0, 0, 0)',
      tertiaryContainer: 'rgb(69, 72, 94)',
      onTertiaryContainer: 'rgb(221, 224, 252)',
      error: 'rgb(255, 180, 171)',
      onError: 'rgb(105, 0, 5)',
      errorContainer: 'rgb(147, 0, 10)',
      onErrorContainer: 'rgb(255, 180, 171)',
      background: '#000000',
      onBackground: 'rgb(224, 227, 228)',
      surface: '#000000',
      onSurface: '#FFFFFF',
      surfaceVariant: 'rgb(63, 72, 75)',
      onSurfaceVariant: 'rgba(255,255,255,0.7)',
      outline: 'rgba(255,255,255,0.3)',
      outlineVariant: 'rgb(63, 72, 75)',
      shadow: 'rgb(0, 0, 0)',
      scrim: 'rgb(0, 0, 0)',
      inverseSurface: 'rgb(224, 227, 228)',
      inverseOnSurface: 'rgb(46, 49, 50)',
      inversePrimary: 'rgb(0, 105, 116)',
      elevation: {
        level0: 'transparent',
        level1: 'rgba(24, 54, 73, 0.93)',
        level2: 'rgba(24, 54, 73, 0.93)',
        level3: 'rgba(24, 54, 73, 0.93)',
        level4: 'rgba(24, 54, 73, 0.93)',
        level5: 'rgba(24, 54, 73, 0.93)',
      },
      surfaceDisabled: 'rgba(224, 227, 228, 0.12)',
      onSurfaceDisabled: 'rgba(224, 227, 228, 0.38)',
      backdrop: 'rgba(8, 8, 8, 0.4)',
    },
  }), []);

  return (
    <PaperProvider theme={paperTheme}>
      <BackdropProvider>
        <NavigationContainer theme={navigationTheme}>
          <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.colors.background} />
          <RootNavigator />
        </NavigationContainer>
      </BackdropProvider>
    </PaperProvider>
  );
};

// NotificationsBootstrapper artık Home.js'de çalışacak
// Kullanıcı home ekranına geldiğinde ve biraz bekledikten sonra izin istenir

function AppInner() {
  useEffect(() => {
    // OTP Service'i başlat
    const initializeOtpService = async () => {
      try {
        await otpService.initialize();
        console.log('[App] OTP Service başarıyla başlatıldı');
      } catch (error) {
        console.error('[App] OTP Service başlatma hatası:', error);
        // Hata durumunda mock provider ile devam et
        try {
          await otpService.initialize({ provider: 'mock', dryRun: true });
          console.log('[App] OTP Service mock provider ile başlatıldı');
        } catch (fallbackError) {
          console.error('[App] OTP Service fallback hatası:', fallbackError);
        }
      }
    };
    
    // Mapbox'ı initialize et (opsiyonel)
    try {
      const useMapbox = String(USE_MAPBOX_POOL || '').toLowerCase() === 'true';
      if (useMapbox) {
        initializeMapbox();
      }
    } catch (_) {}
    
    initializeOtpService();
    
    return () => {
      reminderScheduler.stopScheduler();
    };
  }, []);

  return (
    <AuthProvider>
      <DeviceAuthProvider>
        <ThemedNavigation />
      </DeviceAuthProvider>
    </AuthProvider>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppInner />
    </ThemeProvider>
  );
}
