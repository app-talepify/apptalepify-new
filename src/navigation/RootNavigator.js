import React, { useMemo } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import Login from '../screens/Login';
import Splash from '../screens/Splash';
import Onboarding from '../screens/Onboarding';
import Register from '../screens/Register';
import UpdatePassword from '../screens/UpdatePassword';
import ResetPassword from '../screens/ResetPassword';
import ResetPasswordOTP from '../screens/ResetPasswordOTP';
import NewPassword from '../screens/NewPassword';
import MainTabs from './MainTabs';
import { PortfolioSearchProvider } from '../context/PortfolioSearchContext';
import Settings from '../screens/Settings';
import CommissionCalculator from '../screens/CommissionCalculator';
import PropertyValueCalculator from '../screens/PropertyValueCalculator';
import PublicProfile from '../screens/PublicProfile';
import DailyTasks from '../screens/DailyTasks';
import NewsList from '../screens/NewsList';
import NewsDetail from '../screens/NewsDetail';
// import Notes from '../screens/Notes'; // Artık MainTabs içinde yönetiliyor
// import Profile from '../screens/Profile'; // Artık MainTabs içinde yönetiliyor
// import PropertyDetail from '../screens/PropertyDetail'; // Artık MainTabs içinde yönetiliyor

const Stack = createNativeStackNavigator();

// Animation constants
const ANIMATION_TYPES = {
  SLIDE_RIGHT: 'slide_from_right',
  SLIDE_BOTTOM: 'slide_from_bottom',
  FADE: 'fade',
};

export default function RootNavigator() {
  const { user, loading } = useAuth();

  const screenOptions = useMemo(() => ({
    headerShown: false,
    contentStyle: { backgroundColor: 'transparent' },
    animation: ANIMATION_TYPES.FADE, // SLIDE_RIGHT → FADE - daha hızlı!
    animationDuration: 150, // Animasyon süresini kısalt
    freezeOnBlur: true,
  }), []);

  // Normal auth flow: Login ekranından başla, kullanıcı giriş yaptıktan sonra MainTabs'a yönlendir
  const initialRouteName = loading ? 'Splash' : (user ? 'MainTabs' : 'Login');

  return (
    <PortfolioSearchProvider>
    <Stack.Navigator
      initialRouteName={initialRouteName}
      screenOptions={screenOptions}
    >
      <Stack.Screen
        name="Splash"
        component={Splash}
        options={{ animation: ANIMATION_TYPES.FADE }}
      />
      <Stack.Screen
        name="Onboarding"
        component={Onboarding}
        options={{ animation: ANIMATION_TYPES.SLIDE_RIGHT }}
      />
      <Stack.Screen
        name="MainTabs"
        component={MainTabs}
        options={{ 
          animation: 'none',
          animationDuration: 0,
        }}
      />
      <Stack.Screen
        name="Login"
        component={Login}
        options={{ animation: ANIMATION_TYPES.FADE }}
      />
      <Stack.Screen
        name="Register"
        component={Register}
        options={{ animation: ANIMATION_TYPES.SLIDE_RIGHT }}
      />
      <Stack.Screen
        name="UpdatePassword"
        component={UpdatePassword}
        options={{ animation: ANIMATION_TYPES.SLIDE_BOTTOM }}
      />
      <Stack.Screen
        name="ResetPassword"
        component={ResetPassword}
        options={{ animation: ANIMATION_TYPES.SLIDE_RIGHT }}
      />
      <Stack.Screen
        name="ResetPasswordOTP"
        component={ResetPasswordOTP}
        options={{ animation: ANIMATION_TYPES.SLIDE_RIGHT }}
      />
      <Stack.Screen
        name="NewPassword"
        component={NewPassword}
        options={{ animation: ANIMATION_TYPES.SLIDE_RIGHT }}
      />
      <Stack.Screen
        name="Settings"
        component={Settings}
        options={{ animation: ANIMATION_TYPES.SLIDE_RIGHT }}
      />
      <Stack.Screen
        name="CommissionCalculator"
        component={CommissionCalculator}
      />
      <Stack.Screen
        name="PropertyValueCalculator"
        component={PropertyValueCalculator}
      />
      <Stack.Screen
        name="PublicProfile"
        component={PublicProfile}
        options={{ 
          animation: ANIMATION_TYPES.SLIDE_RIGHT,
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="DailyTasks"
        component={DailyTasks}
        options={{ 
          animation: 'none',
          animationDuration: 0,
        }}
      />
      <Stack.Screen
        name="NewsList"
        component={NewsList}
        options={{ animation: ANIMATION_TYPES.SLIDE_RIGHT }}
      />
      <Stack.Screen
        name="NewsDetail"
        component={NewsDetail}
        options={{ animation: ANIMATION_TYPES.SLIDE_RIGHT }}
      />
      {/* Notes artık ilgili tab stack'leri içinde */}
      {/* <Stack.Screen
        name="Notes"
        component={Notes}
      /> */}
      {/* Profile artık ilgili tab stack'leri içinde (Home, Profile, MyPortfolios) */}
      {/* <Stack.Screen
        name="Profile"
        component={Profile}
        options={{ animation: ANIMATION_TYPES.SLIDE_RIGHT }}
      /> */}
      {/* PropertyDetail artık ilgili tab stack'leri içinde (Home, Profile, MyPortfolios) */}
      {/* <Stack.Screen
        name="PropertyDetail"
        component={PropertyDetail}
        options={{ animation: ANIMATION_TYPES.SLIDE_BOTTOM }}
      /> */}
    </Stack.Navigator>
    </PortfolioSearchProvider>
  );
}
