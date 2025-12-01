import React, { useState, useRef, useCallback, useMemo } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Animated,
  Modal,
  Dimensions,
  BackHandler,
  ToastAndroid,
  Platform,
  DeviceEventEmitter,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { useBackdrop } from '../context/BackdropContext';
import GlassmorphismView from '../components/GlassmorphismView';
import { useAuth } from '../context/AuthContext';

// Screens
import Home from '../screens/Home';
import PortfolioList from '../screens/PortfolioList';
import AddPortfolio from '../screens/AddPortfolio';
import RequestForm from '../screens/RequestForm';
import RequestList from '../screens/RequestList';
import Profile from '../screens/Profile';
import Dashboard from '../screens/Dashboard';
import PropertyDetail from '../screens/PropertyDetail';
import CustomPortfolioView from '../screens/CustomPortfolioView';
import MyPortfolios from '../screens/MyPortfolios';
import DemandPool from '../screens/DemandPool';
import NotificationTest from '../screens/NotificationTest';
import RequestDetail from '../screens/RequestDetail';
import Subscription from '../screens/Subscription';
import Packages from '../screens/Packages';
import Payment from '../screens/Payment';
import SubscriptionManagement from '../screens/SubscriptionManagement';
import Calendar from '../screens/Calendar';
import PortfolioMap from '../screens/PortfolioMap';
import AccountDeletion from '../screens/AccountDeletion';
import Settings from '../screens/Settings';
import ReferralSystem from '../screens/ReferralSystem';
import PrivacyPolicy from '../screens/PrivacyPolicy';
import HelpAndSupport from '../screens/HelpAndSupport';
import Notes from '../screens/Notes';
import DailyTasks from '../screens/DailyTasks';
import NewsList from '../screens/NewsList';
import NewsDetail from '../screens/NewsDetail';
import NewsWebView from '../screens/NewsWebView';
import CommissionCalculator from '../screens/CommissionCalculator';
import PropertyValueCalculator from '../screens/PropertyValueCalculator';
import LiveChat from '../screens/LiveChat';
import DraftPortfolioOverlay from '../components/DraftPortfolioOverlay';

// Constants
const { width } = Dimensions.get('window');
const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();
const DPStack = createNativeStackNavigator();

const ANIMATION_CONFIG = {
  spring: {
    tension: 100,
    friction: 8,
  },
  timing: {
    duration: 300,
  },
  timingFast: {
    duration: 100,
  },
};

// Request Stack
const RequestStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="RequestList" component={RequestList} />
    <Stack.Screen name="RequestForm" component={RequestForm} />
    <Stack.Screen name="RequestDetail" component={RequestDetail} />
    <Stack.Screen name="AddPortfolio" component={AddPortfolio} />
  </Stack.Navigator>
);

// Profile Stack
const ProfileStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="Profile" component={Profile} />
    <Stack.Screen name="PropertyDetail" component={PropertyDetail} />
    <Stack.Screen name="NotificationTest" component={NotificationTest} />
    <Stack.Screen name="Subscription" component={Subscription} />
    <Stack.Screen name="Packages" component={Packages} />
    <Stack.Screen name="Payment" component={Payment} />
    <Stack.Screen name="SubscriptionManagement" component={SubscriptionManagement} />
    <Stack.Screen name="Settings" component={Settings} />
    <Stack.Screen name="ReferralSystem" component={ReferralSystem} />
    <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicy} />
    <Stack.Screen name="HelpAndSupport" component={HelpAndSupport} />
    <Stack.Screen name="LiveChat" component={LiveChat} />
    <Stack.Screen name="AccountDeletion" component={AccountDeletion} />
    <Stack.Screen name="Notes" component={Notes} />
  </Stack.Navigator>
);

// Dashboard Stack
const DashboardStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName="Dashboard">
    <Stack.Screen name="Dashboard" component={Dashboard} />
    <Stack.Screen 
      name="Profile" 
      component={Profile} 
      options={{ 
        animation: 'slide_from_right',
        animationDuration: 200,
      }}
    />
    <Stack.Screen name="PropertyDetail" component={PropertyDetail} />
    <Stack.Screen name="NotificationTest" component={NotificationTest} />
    <Stack.Screen name="Settings" component={Settings} />
    <Stack.Screen name="HelpAndSupport" component={HelpAndSupport} />
    <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicy} />
    <Stack.Screen name="ReferralSystem" component={ReferralSystem} />
    <Stack.Screen name="LiveChat" component={LiveChat} />
    <Stack.Screen name="AccountDeletion" component={AccountDeletion} />
  </Stack.Navigator>
);

// Demand Pool Stack (to match RequestStack animations exactly)
const DemandPoolStack = () => (
  <DPStack.Navigator screenOptions={{ headerShown: false }}>
    <DPStack.Screen name="DemandPoolHome" component={DemandPool} />
    <DPStack.Screen name="RequestDetail" component={RequestDetail} />
  </DPStack.Navigator>
);

// MyPortfolios Stack
const MyPortfoliosStack = () => (
  <Stack.Navigator screenOptions={{ 
    headerShown: false,
    animation: 'none',
    animationDuration: 0,
    gestureEnabled: true,
    gestureDirection: 'horizontal',
    gestureResponseDistance: { horizontal: 200 },
  }}>
    {/* Reuse PortfolioList with onlyMine=true for identical UX */}
    <Stack.Screen 
      name="MyPortfolios" 
      component={PortfolioList} 
      initialParams={{ onlyMine: true }} 
      options={{
        gestureEnabled: true,
        gestureDirection: 'horizontal',
        gestureResponseDistance: { horizontal: 200 },
      }}
    />
    <Stack.Screen 
      name="PortfolioMap" 
      component={PortfolioMap}
      options={{
        animation: 'none',
        animationDuration: 0,
      }}
    />
    <Stack.Screen name="PropertyDetail" component={PropertyDetail} />
    <Stack.Screen name="Profile" component={Profile} />
  </Stack.Navigator>
);

// Home Stack
const HomeStack = () => (
  <Stack.Navigator
    initialRouteName="HomeScreen"
    screenOptions={{ 
      headerShown: false,
      animation: 'none', // Animasyonu kapat
      animationDuration: 0,
      freezeOnBlur: true,
    }}
  >
    <Stack.Screen name="HomeScreen" component={Home} />
    <Stack.Screen name="CustomPortfolioView" component={CustomPortfolioView} />
    <Stack.Screen 
      name="PortfolioList" 
      component={PortfolioList} 
      options={{
        animation: 'none',
        animationDuration: 0,
        gestureEnabled: true,
        gestureDirection: 'horizontal',
        gestureResponseDistance: { horizontal: 200 },
      }}
    />
    <Stack.Screen 
      name="DemandPool" 
      component={DemandPoolStack} 
      options={{
        animation: 'none',
        animationDuration: 0,
      }}
    />
    <Stack.Screen name="AddPortfolio" component={AddPortfolio} />
    {/* <Stack.Screen name="DraftPortfolios" component={DraftPortfolios} /> */}
    <Stack.Screen name="NotificationTest" component={NotificationTest} />
    {/* <Stack.Screen name="Notifications" component={Notifications} /> */}
    <Stack.Screen name="RequestDetail" component={RequestDetail} />
    <Stack.Screen 
      name="Calendar" 
      component={Calendar}
      options={{
        animation: 'none',
        animationDuration: 0,
      }}
    />
    <Stack.Screen name="PropertyDetail" component={PropertyDetail} />
    <Stack.Screen 
      name="Profile" 
      component={Profile} 
      options={{ 
        animation: 'fade',
        animationDuration: 150,
      }}
    />
    <Stack.Screen name="PortfolioMap" component={PortfolioMap} />
    <Stack.Screen 
      name="DailyTasks" 
      component={DailyTasks}
      options={{
        animation: 'none',
        animationDuration: 0,
      }}
    />
    <Stack.Screen name="NewsList" component={NewsList} />
    <Stack.Screen name="NewsDetail" component={NewsDetail} />
    <Stack.Screen name="NewsWebView" component={NewsWebView} />
    <Stack.Screen name="CommissionCalculator" component={CommissionCalculator} />
    <Stack.Screen name="PropertyValueCalculator" component={PropertyValueCalculator} />
    <Stack.Screen name="Notes" component={Notes} />
  </Stack.Navigator>
);

// Custom Tab Bar Component
const stylesFactory = (theme, isDark) => StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
  },
  customTabBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 60,
    backgroundColor: '#FFFFFF', // Beyaz arka plan
    borderTopLeftRadius: 30, // Radius düşürüldü
    borderTopRightRadius: 30, // Radius düşürüldü
    borderBottomLeftRadius: 0, // Alt köşeler radius'suz
    borderBottomRightRadius: 0, // Alt köşeler radius'suz
    marginBottom: 0,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 6,
    zIndex: 9999, // Çok yüksek z-index (her zaman en önde)
    borderWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingHorizontal: 20,
  },
  tabBarContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    flex: 1,
    height: 50,
  },
  notifBadge: {
    position: 'absolute',
    top: 6,
    right: width / 10 - 24, // approximate right edge within tab item
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: theme.colors.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifBadgeText: {
    color: theme.colors.white,
    fontSize: 10,
    fontWeight: '700',
  },
  iconImage: {
    width: 31,
    height: 31,
  },
  homeIcon: {
    width: 26,
    height: 26,
  },
  taleplerimIcon: {
    width: 31,
    height: 31,
  },
  centerAddButton: {
    width: 48,
    height: 48,
    backgroundColor: '#DC143C', // Krimson arka plan
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: theme.colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
    borderWidth: 2,
    borderColor: '#DC143C', // Krimson border
  },
  addButtonPlus: {
    fontSize: 32,
    fontWeight: 'bold',
    color: theme.colors.white,
  },
  addButtonIcon: {
    width: 31,
    height: 31,
    // tintColor dinamik olarak inline uygulanıyor
  },
  activeDot: {
    position: 'absolute',
    bottom: 2, // Yukarı alındı
    width: 6, // Büyütüldü
    height: 6, // Büyütüldü
    borderRadius: 3, // Büyütüldü
    backgroundColor: '#DC143C', // Krimson renk
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: theme.opacity.overlayDark,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalOverlayTouch: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: isDark ? theme.colors.navy : theme.colors.white,
    borderRadius: 12,
    padding: 16,
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
    minWidth: 260,
    maxWidth: width * 0.75,
    borderWidth: 0,
  },
  modalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginVertical: 6,
    backgroundColor: '#DC143C',
    borderRadius: 10,
    /*
    shadowColor: theme.colors.black,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
    */
  },
  modalButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  modalButtonIconImage: {
    width: 24,
    height: 24,
    marginRight: 15,
    tintColor: theme.colors.white,
  },
  modalButtonTextContainer: {
    flex: 1,
  },
  modalButtonText: {
    fontSize: 16,
    color: theme.colors.white,
    fontWeight: '700',
    marginBottom: 2,
  },
  modalButtonSubtext: {
    fontSize: 12,
    color: theme.opacity.white08,
    fontWeight: '500',
  },
  modalButtonArrowImage: {
    width: 16,
    height: 16,
    tintColor: theme.colors.white,
    transform: [{ rotate: '180deg' }],
  },
  disabledButton: {
    backgroundColor: theme.colors.accent + '33',
    opacity: 0.5,
  },
  disabledIconImage: {
    opacity: 0.5,
  },
  disabledText: {
    color: theme.opacity.white05,
  },
  disabledSubtext: {
    color: theme.opacity.white04,
  },
  disabledArrowImage: {
    opacity: 0.5,
  },
});

const CustomTabBar = ({ state, descriptors, navigation }) => {
  const { theme, isDark } = useTheme();
  const styles = useMemo(() => stylesFactory(theme, isDark), [theme, isDark]);
  const { showBackdrop, hideBackdrop } = useBackdrop();
  const { user, unreadCount } = useAuth(); // unreadCount'ı context'ten al
  const insets = useSafeAreaInsets();
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isPortfolioModalVisible, setIsPortfolioModalVisible] = useState(false);
  const [isPortfolioStep, setIsPortfolioStep] = useState(false);
  const [isDraftOverlayVisible, setIsDraftOverlayVisible] = useState(false);
  const slideAnimation = useRef(new Animated.Value(0)).current;
  const fadeAnimation = useRef(new Animated.Value(0)).current;
  const buttonScaleAnimation = useRef(new Animated.Value(0.8)).current;
  const portfolioSlideAnimation = useRef(new Animated.Value(0)).current;
  const portfolioFadeAnimation = useRef(new Animated.Value(0)).current;
  const addModalAnim = useRef(new Animated.Value(0)).current;
  const backPressFlagRef = useRef(false);

  // AddPortfolio'dan gelen tab geçiş taleplerini dinle
  React.useEffect(() => {
    const sub = DeviceEventEmitter.addListener('mainTabs:navigateTab', ({ targetTabName }) => {
      try {
        if (!targetTabName) return;
        if (targetTabName === 'Ana Sayfa') {
          navigation.navigate('Ana Sayfa', { screen: 'HomeScreen' });
          return;
        }
        if (targetTabName === 'Portföylerim') {
          navigation.navigate('Portföylerim', { screen: 'MyPortfolios' });
          return;
        }
        if (targetTabName === 'Taleplerim') {
          navigation.navigate('Taleplerim', { screen: 'RequestList' });
          return;
        }
        if (targetTabName === 'Profil') {
          navigation.navigate('Profil', { screen: 'Profile' });
          return;
        }
        navigation.navigate(targetTabName);
      } catch {}
    });
    return () => sub.remove();
  }, [navigation]);

  // Close any open add/draft modals on demand (e.g., when continuing a draft)
  React.useEffect(() => {
    const sub = DeviceEventEmitter.addListener('mainTabs:closeAddModals', () => {
      try { setIsModalVisible(false); } catch {}
      try { setIsPortfolioModalVisible(false); } catch {}
      try { setIsDraftOverlayVisible(false); } catch {}
      try { hideBackdrop({ duration: ANIMATION_CONFIG.timingFast.duration }); } catch {}
    });
    return () => sub.remove();
  }, [hideBackdrop]);

  // Check if the current screen is LiveChat
  const isLiveChatScreen = useMemo(() => {
    const currentRoute = state.routes[state.index];
    if (currentRoute.state) {
        const nestedRoute = currentRoute.state.routes[currentRoute.state.index];
        return nestedRoute.name === 'LiveChat';
    }
    return false;
  }, [state]);

  // Check if the current screen requires a flat tab bar (no border radius)
  const isFlatTabBarScreen = useMemo(() => {
    const currentRoute = state.routes[state.index];
    if (currentRoute.state) {
      const nestedRoute = currentRoute.state.routes[currentRoute.state.index];
      // Add any screen name here that should have a flat tab bar
      return ['LiveChat', 'NewsWebView'].includes(nestedRoute.name);
    }
    return false;
  }, [state]);

  const showModal = useCallback(() => {
    setIsPortfolioStep(false);
    setIsModalVisible(true);

    Animated.parallel([
      Animated.spring(addModalAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 80,
        friction: 7,
      }),
      Animated.spring(slideAnimation, {
        toValue: 1,
        useNativeDriver: true,
        ...ANIMATION_CONFIG.spring,
      }),
      Animated.timing(fadeAnimation, {
        toValue: 1,
        useNativeDriver: true,
        ...ANIMATION_CONFIG.timing,
      }),
      Animated.spring(buttonScaleAnimation, {
        toValue: 1,
        useNativeDriver: true,
        tension: 80,
        friction: 6,
      }),
    ]).start();
    // Show global backdrop when add modal opens
    const color = isDark ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.22)';
    try { showBackdrop({ toOpacity: 1, color, duration: ANIMATION_CONFIG.timingFast.duration }); } catch {}
  }, [slideAnimation, fadeAnimation, buttonScaleAnimation, addModalAnim, isDark, showBackdrop]);

  const hideModal = useCallback((afterClose) => {
    // Hide global backdrop immediately for snappy close
    try { hideBackdrop({ duration: ANIMATION_CONFIG.timingFast.duration }); } catch {}
    Animated.parallel([
      Animated.timing(addModalAnim, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnimation, {
        toValue: 0,
        useNativeDriver: true,
        ...ANIMATION_CONFIG.spring,
      }),
      Animated.timing(fadeAnimation, {
        toValue: 0,
        useNativeDriver: true,
        ...ANIMATION_CONFIG.timingFast,
      }),
      Animated.timing(buttonScaleAnimation, {
        toValue: 0.8,
        useNativeDriver: true,
        ...ANIMATION_CONFIG.timingFast,
      }),
    ]).start(() => {
      setIsModalVisible(false);
      if (typeof afterClose === 'function') {
        afterClose();
      }
    });
  }, [slideAnimation, fadeAnimation, buttonScaleAnimation, addModalAnim, hideBackdrop]);

  const hideModalInstant = useCallback(() => {
    // Kapanışı anında yaparak ikinci overlay'in daha hızlı görünmesini sağla
    setIsModalVisible(false);
    addModalAnim.setValue(0);
    slideAnimation.setValue(0);
    fadeAnimation.setValue(0);
    buttonScaleAnimation.setValue(0.8);
    try { hideBackdrop({ duration: 0 }); } catch {}
  }, [addModalAnim, slideAnimation, fadeAnimation, buttonScaleAnimation, hideBackdrop]);

  const showPortfolioModal = useCallback(() => {
    // Yeni portföy adımını aynı modal içinde göster
    setIsPortfolioStep(true);
    const color = isDark ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.22)';
    try { showBackdrop({ toOpacity: 1, color, duration: ANIMATION_CONFIG.timingFast.duration }); } catch {}
  }, [isDark, showBackdrop]);

  const hidePortfolioModal = useCallback(() => {
    // Overlay'in dokunmaları engellememesi için önce görünürlüğü kapat
    setIsPortfolioModalVisible(false);
    try { hideBackdrop({ duration: ANIMATION_CONFIG.timingFast.duration }); } catch {}
    // İsteğe bağlı: animasyon değerlerini sıfırla (görsel doğruluk için)
    Animated.parallel([
      Animated.spring(portfolioSlideAnimation, {
        toValue: 0,
        useNativeDriver: true,
        ...ANIMATION_CONFIG.spring,
      }),
      Animated.timing(portfolioFadeAnimation, {
        toValue: 0,
        useNativeDriver: true,
        ...ANIMATION_CONFIG.timingFast,
      }),
    ]).start();
  }, [portfolioSlideAnimation, portfolioFadeAnimation, hideBackdrop]);

  // Fetch unread notifications count periodically and when state/tab changes
  // BU BLOK AuthContext'e TAŞINDIĞI İÇİN SİLİNDİ

  // Android: Double back to exit app
  React.useEffect(() => {
    const onBackPress = () => {
      if (Platform.OS !== 'android') return false;

      // Önce açık modalları kapat
      if (isModalVisible) {
        hideModal();
        return true;
      }
      if (isPortfolioModalVisible) {
        hidePortfolioModal();
        return true;
      }
      if (isDraftOverlayVisible) {
        setIsDraftOverlayVisible(false);
        return true;
      }

      // Eğer tab bar'ın üstünde (root stack'te) bir ekran varsa önce onu kapat
      const rootNav = navigation.getParent && navigation.getParent();
      if (rootNav && typeof rootNav.canGoBack === 'function' && rootNav.canGoBack()) {
        rootNav.goBack();
        return true;
      }

      const currentTab = state?.routes?.[state.index];
      const currentTabName = currentTab?.name;
      const nestedState = currentTab?.state;

      // Eğer mevcut sekmenin kendi stack'inde geriye gidebiliyorsak,
      // varsayılan davranışa izin ver (stack pop). Bu, detay ekranlarından
      // sekmenin kök ekranına (örn. MyPortfolios) geri dönmeyi sağlar.
      if (nestedState && typeof nestedState.index === 'number' && nestedState.index > 0) {
        return false; // default back (React Navigation pop)
      }

      // Ana sekmede değilsek ve sekmenin kökünde isek: Ana Sayfa'ya götür
      if (currentTabName !== 'Ana Sayfa') {
        navigation.navigate('Ana Sayfa', { screen: 'HomeScreen' });
        backPressFlagRef.current = false;
        return true;
      }

      // Ana sekmedeyiz: eğer HomeStack'te geriye gidebiliyorsak default pop'a izin ver
      if (nestedState && typeof nestedState.index === 'number' && nestedState.index > 0) {
        return false; // default back (React Navigation pop)
      }

      // Ana Sayfa'da: çıkmak için iki kez geri
      if (backPressFlagRef.current) {
        BackHandler.exitApp();
        return true;
      }
      backPressFlagRef.current = true;
      ToastAndroid.show('Çıkmak için tekrar basın', ToastAndroid.SHORT);
      setTimeout(() => {
        backPressFlagRef.current = false;
      }, 2000);
      return true;
    };

    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [state, navigation, isModalVisible, isPortfolioModalVisible, hideModal, hidePortfolioModal, isDraftOverlayVisible, setIsDraftOverlayVisible]);

  const handlePortfolioAdd = useCallback(() => {
    showPortfolioModal();
  }, [showPortfolioModal]);

  const handleRequestAdd = useCallback(() => {
    hideModal();
    navigation.navigate('Taleplerim', { screen: 'RequestForm' });
  }, [hideModal, navigation]);

  // iOS: tab bar'ı biraz aşağı indir (bottom offset küçült) ve yüksekliği alttan artır,
  // üst kenarı sabit tutmak için bottom'u yeni yükseklik kadar telafi et.
  const baseBottom = Platform.OS === 'ios'
    ? Math.max(4, Math.min(10, Math.floor((insets.bottom || 0) * 0.4)))
    : 0;
  const baseHeight = 60;
  const newHeight = Platform.OS === 'ios' ? 68 : 60; // alt taraftan ~8px uzat
  const adjustedBottom = Platform.OS === 'ios'
    ? Math.max(0, baseBottom - (newHeight - baseHeight)) // üst sabit, alt uzar
    : 0;

  const tabBarDynamicStyle = {
    borderTopLeftRadius: isFlatTabBarScreen ? 0 : 30,
    borderTopRightRadius: isFlatTabBarScreen ? 0 : 30,
    bottom: adjustedBottom,
    height: newHeight,
  };

  return (
    <View style={styles.tabBarContainer}>
      <View style={[styles.customTabBar, tabBarDynamicStyle]}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const isFocused = state.index === index;

          const getActiveNestedRoute = (navState) => {
            try {
              let current = navState;
              while (current && current.routes && typeof current.index === 'number') {
                const routeAt = current.routes[current.index];
                if (!routeAt) return null;
                if (!routeAt.state) return routeAt;
                current = routeAt.state;
              }
              return null;
            } catch {
              return null;
            }
          };

          const onPress = () => {
            if (route.name === 'Ekleme') {
              showModal();
              return;
            }

            // AddPortfolio açıkken tabPress'i tamamen AddPortfolio'nun onay akışına bırak
            try {
              const currentRoot = state?.routes?.[state.index];
              const activeNested = getActiveNestedRoute(currentRoot?.state) || currentRoot;
              if (activeNested && activeNested.name === 'AddPortfolio') {
                try { DeviceEventEmitter.emit('addPortfolio:confirmLeaveToTab', { targetTabName: route.name }); } catch {}
                return; // Navigasyonu şimdilik durdur; onay sonrası AddPortfolio tab'a geçecek
              }
            } catch {}

            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!event.defaultPrevented) {
              // Her durumda modalları kapat ve kök ekrana git
              if (isModalVisible) setIsModalVisible(false);
              if (isPortfolioModalVisible) setIsPortfolioModalVisible(false);
              if (isDraftOverlayVisible) setIsDraftOverlayVisible(false);

              if (route.name === 'Ana Sayfa') {
                if (!isFocused) {
                  navigation.navigate('Ana Sayfa', { screen: 'HomeScreen' });
                }
                // Eğer zaten Ana Sayfa sekmesindeysek default tabPress davranışı
                // nested stack'i köke pop edecektir; ekstra navigate yapma
              } else if (route.name === 'Taleplerim') {
                if (!isFocused) {
                  navigation.navigate('Taleplerim', { screen: 'RequestList' });
                }
              } else if (route.name === 'Portföylerim') {
                if (!isFocused) {
                  navigation.navigate('Portföylerim', { screen: 'MyPortfolios' });
                }
              } else if (route.name === 'Profil') {
                if (!isFocused) {
                  navigation.navigate('Profil', { screen: 'Dashboard' });
                }
              } else {
                if (!isFocused) {
                  navigation.navigate(route.name);
                }
              }
            }
          };

          let icon;
          if (route.name === 'Ana Sayfa') {
            icon = (
              <Image
                source={require('../assets/images/home.png')}
                style={[styles.homeIcon, { tintColor: '#323232' }]}
                resizeMode="contain"
              />
            );
          } else if (route.name === 'Portföylerim') {
            icon = (
              <Image
                source={require('../assets/images/icons/portfoy.png')}
                style={[styles.iconImage, { tintColor: '#323232' }]}
                resizeMode="contain"
              />
            );
          } else if (route.name === 'Ekleme') {
            icon = (
              <TouchableOpacity style={styles.centerAddButton} onPress={showModal}>
                <Image
                  source={require('../assets/images/icons/addsq.png')}
                  style={[styles.addButtonIcon, { tintColor: '#FFFFFF' }]}
                />
              </TouchableOpacity>
            );
          } else if (route.name === 'Taleplerim') {
            icon = (
              <Image
                source={require('../assets/images/icons/talep.png')}
                style={[styles.iconImage, styles.taleplerimIcon, { tintColor: '#323232' }]}
                resizeMode="contain"
              />
            );
          } else if (route.name === 'Profil') {
            icon = (
              <Image
                source={require('../assets/images/icons/useralt.png')}
                style={[styles.iconImage, { tintColor: '#323232' }]}
                resizeMode="contain"
              />
            );
          }

          return (
            <TouchableOpacity
              key={route.key}
              style={styles.tabItem}
              onPress={onPress}
              activeOpacity={0.7}
            >
              {icon}
              {/* Notification badge on Home tab */}
              {route.name === 'Ana Sayfa' && unreadCount > 0 && (
                <View style={styles.notifBadge}>
                  <Text style={styles.notifBadgeText}>{unreadCount > 99 ? '99+' : String(unreadCount)}</Text>
                </View>
              )}
              {isFocused && <View style={styles.activeDot} />}
            </TouchableOpacity>
          );
        })}
      </View>
      {/* Enhanced Modal for Add Options */}
      <Modal
        visible={isModalVisible}
        transparent={true}
        animationType="none"
        onRequestClose={hideModal}
        statusBarTranslucent={true}
      >
        <Animated.View
          style={[
            styles.modalOverlay,
            {
              opacity: fadeAnimation,
            },
          ]}
        >
          <TouchableOpacity
            style={styles.modalOverlayTouch}
            activeOpacity={1}
            onPress={hideModal}
          >
            <Animated.View
              style={[
                styles.modalContent,
                { backgroundColor: 'transparent' },
                {
                  opacity: addModalAnim,
                  transform: [
                    { scale: addModalAnim.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) },
                    { translateY: addModalAnim.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) },
                  ],
                },
              ]}
            >
              <GlassmorphismView
                style={{
                  borderRadius: 16,
                  padding: 16,
                  minWidth: 260,
                  maxWidth: width * 0.75,
                  overflow: 'hidden',
                }}
                borderRadius={16}
                blurEnabled={false}
                config={{
                  overlayColor: 'rgba(255, 0, 0, 0)',
                  startColor: 'rgb(24, 54, 73)',
                  endColor: 'rgba(17, 36, 49, 0.79)',
                  gradientAlpha: 1,
                  gradientDirection: 150,
                  gradientSpread: 7,
                  ditherStrength: 4.0,
                }}
              >
              { !isPortfolioStep ? (
                <>
                  <TouchableOpacity
                    style={styles.modalButton}
                    onPress={handlePortfolioAdd}
                    activeOpacity={0.8}
                  >
                    <View style={styles.modalButtonContent}>
                      <Image source={require('../assets/images/icons/portfoy.png')} style={styles.modalButtonIconImage} />
                      <View style={styles.modalButtonTextContainer}>
                        <Text style={styles.modalButtonText}>Yeni Portföy Ekle</Text>
                        <Text style={styles.modalButtonSubtext}>Portföyünüzü ekleyin</Text>
                      </View>
                    </View>
                    <Image source={require('../assets/images/icons/return.png')} style={styles.modalButtonArrowImage} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.modalButton}
                    onPress={handleRequestAdd}
                    activeOpacity={0.8}
                  >
                    <View style={styles.modalButtonContent}>
                      <Image source={require('../assets/images/icons/talep.png')} style={styles.modalButtonIconImage} />
                      <View style={styles.modalButtonTextContainer}>
                        <Text style={styles.modalButtonText}>Yeni Talep Ekle</Text>
                        <Text style={styles.modalButtonSubtext}>Yeni talep oluşturun</Text>
                      </View>
                    </View>
                    <Image source={require('../assets/images/icons/return.png')} style={styles.modalButtonArrowImage} />
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <TouchableOpacity
                    style={styles.modalButton}
                  onPress={() => {
                      const previousTabName = state.routes[state.index]?.name || 'Ana Sayfa';
                      // Close add modal & backdrop immediately to avoid any touch-block
                      try { hideModalInstant(); } catch {}
                      // Navigate after overlay is removed
                      navigation.navigate('Ana Sayfa', {
                        screen: 'AddPortfolio',
                        params: { previousScreen: previousTabName },
                      });
                    }}
                    activeOpacity={0.8}
                  >
                    <View style={styles.modalButtonContent}>
                      <Image source={require('../assets/images/icons/portfoy.png')} style={styles.modalButtonIconImage} />
                      <View style={styles.modalButtonTextContainer}>
                        <Text style={styles.modalButtonText}>Detaylı Portföy Ekle</Text>
                        <Text style={styles.modalButtonSubtext}>Tam özellikli form</Text>
                      </View>
                    </View>
                    <Image source={require('../assets/images/icons/return.png')} style={styles.modalButtonArrowImage} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.modalButton}
                    onPress={() => {
                      // Yakında eklenecek
                    }}
                    activeOpacity={0.8}
                  >
                    <View style={styles.modalButtonContent}>
                      <Image source={require('../assets/images/icons/addsq.png')} style={styles.modalButtonIconImage} />
                      <View style={styles.modalButtonTextContainer}>
                        <Text style={styles.modalButtonText}>Hızlı Portföy Ekle</Text>
                        <Text style={styles.modalButtonSubtext}>Yakında</Text>
                      </View>
                    </View>
                    <Image source={require('../assets/images/icons/return.png')} style={styles.modalButtonArrowImage} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.modalButton}
                    onPress={() => {
                      // Ana modalı ve backdrop'u anında kapat, sonra overlay'i aç
                      try { hideModalInstant(); } catch {}
                      setTimeout(() => setIsDraftOverlayVisible(true), 0);
                    }}
                    activeOpacity={0.8}
                  >
                    <View style={styles.modalButtonContent}>
                      <Image source={require('../assets/images/icons/plan.png')} style={styles.modalButtonIconImage} />
                      <View style={styles.modalButtonTextContainer}>
                        <Text style={styles.modalButtonText}>Yarıda Kalan Portföy</Text>
                        <Text style={styles.modalButtonSubtext}>Kaldığın yerden devam et</Text>
                      </View>
                    </View>
                    <Image source={require('../assets/images/icons/return.png')} style={styles.modalButtonArrowImage} />
                  </TouchableOpacity>
                </>
              ) }

              </GlassmorphismView>
            </Animated.View>
          </TouchableOpacity>
        </Animated.View>
      </Modal>

      {/* Portfolio Modal */}
      <Modal
        visible={isPortfolioModalVisible}
        transparent={true}
        animationType="none"
        onRequestClose={hidePortfolioModal}
        statusBarTranslucent={true}
      >
        <Animated.View
          style={[
            styles.modalOverlay,
            {
              opacity: portfolioFadeAnimation,
            },
          ]}
        >
          <TouchableOpacity
            style={styles.modalOverlayTouch}
            activeOpacity={1}
            onPress={hidePortfolioModal}
          >
            <Animated.View
              style={[
                styles.modalContent,
                { backgroundColor: 'transparent' },
                {
                  opacity: portfolioFadeAnimation,
                  transform: [
                    { scale: portfolioSlideAnimation },
                  ],
                },
              ]}
            >
              <GlassmorphismView
                style={{
                  borderRadius: 16,
                  padding: 16,
                  minWidth: 260,
                  maxWidth: width * 0.75,
                  overflow: 'hidden',
                }}
                borderRadius={16}
                blurEnabled={false}
                config={{
                  overlayColor: 'rgba(255, 0, 0, 0)',
                  startColor: 'rgb(24, 54, 73)',
                  endColor: 'rgba(17, 36, 49, 0.79)',
                  gradientAlpha: 1,
                  gradientDirection: 150,
                  gradientSpread: 7,
                  ditherStrength: 4.0,
                }}
              >
              <TouchableOpacity
                style={styles.modalButton}
                onPress={() => {
                  // Close portfolio modal & backdrop immediately, then navigate
                  setIsPortfolioModalVisible(false);
                  try { hideBackdrop({ duration: 0 }); } catch {}
                  const previousTabName = state.routes[state.index]?.name || 'Ana Sayfa';
                  navigation.navigate('Ana Sayfa', {
                    screen: 'AddPortfolio',
                    params: { previousScreen: previousTabName },
                  });
                }}
                activeOpacity={0.8}
              >
                <View style={styles.modalButtonContent}>
                  <Image source={require('../assets/images/icons/portfoy.png')} style={styles.modalButtonIconImage} />
                  <View style={styles.modalButtonTextContainer}>
                    <Text style={styles.modalButtonText}>Detaylı Portföy Ekle</Text>
                    <Text style={styles.modalButtonSubtext}>Tam özellikli form</Text>
                  </View>
                </View>
                <Image source={require('../assets/images/icons/return.png')} style={styles.modalButtonArrowImage} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalButton}
                onPress={() => {
                  // Yakında eklenecek
                }}
                activeOpacity={0.8}
              >
                <View style={styles.modalButtonContent}>
                  <Image source={require('../assets/images/icons/addsq.png')} style={styles.modalButtonIconImage} />
                  <View style={styles.modalButtonTextContainer}>
                    <Text style={styles.modalButtonText}>Hızlı Portföy Ekle</Text>
                    <Text style={styles.modalButtonSubtext}>Yakında</Text>
                  </View>
                </View>
                <Image source={require('../assets/images/icons/return.png')} style={styles.modalButtonArrowImage} />
              </TouchableOpacity>

              {/* Yarıda Kalan Portföy Devam Et Butonu */}
              <TouchableOpacity
                style={styles.modalButton}
                onPress={() => {
                  setIsPortfolioModalVisible(false);
                  setIsDraftOverlayVisible(true);
                }}
                activeOpacity={0.8}
              >
                <View style={styles.modalButtonContent}>
                  <Image source={require('../assets/images/icons/plan.png')} style={styles.modalButtonIconImage} />
                  <View style={styles.modalButtonTextContainer}>
                    <Text style={styles.modalButtonText}>Yarıda Kalan Portföy</Text>
                    <Text style={styles.modalButtonSubtext}>Kaldığın yerden devam et</Text>
                  </View>
                </View>
                <Image source={require('../assets/images/icons/return.png')} style={styles.modalButtonArrowImage} />
              </TouchableOpacity>
              </GlassmorphismView>
            </Animated.View>
          </TouchableOpacity>
        </Animated.View>
      </Modal>
      <DraftPortfolioOverlay 
        isVisible={isDraftOverlayVisible}
        onClose={() => setIsDraftOverlayVisible(false)}
        useSharedBackdrop={false}
        navigation={navigation}
      />
    </View>
  );
};

const MainTabs = () => {
  return (
    <View style={{ flex: 1 }}>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
        }}
        tabBar={props => <CustomTabBar {...props} />}
      >
        <Tab.Screen name="Ana Sayfa" component={HomeStack} />
        <Tab.Screen name="Portföylerim" component={MyPortfoliosStack} />
        <Tab.Screen name="Ekleme" component={Home} />
        <Tab.Screen name="Taleplerim" component={RequestStack} />
        <Tab.Screen
          name="Profil"
          component={DashboardStack}
          listeners={({ navigation }) => ({
            tabPress: (e) => {
              // Default davranışı engelle ve her zaman Dashboard'a yönlendir
              try { e.preventDefault(); } catch {}
              try {
                navigation.navigate('Profil', { screen: 'Dashboard' });
              } catch {}
            },
          })}
        />
      </Tab.Navigator>
    </View>
   );
};
export default MainTabs;
