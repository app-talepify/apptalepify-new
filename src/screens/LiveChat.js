import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ImageBackground,
  TouchableOpacity,
  ActivityIndicator,
  Image
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { WebView } from 'react-native-webview';
import { TAWK_TO_URL } from '@env';

const TAWK_TO_DIRECT_CHAT_LINK = 'https://tawk.to/chat/68fa8141d84f3b1958008d24/1j898hqb8';

const LiveChat = () => {
  const { theme: currentTheme, isDark } = useTheme();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(currentTheme, isDark, insets), [currentTheme, isDark, insets]);
  const chatUrl = TAWK_TO_URL || TAWK_TO_DIRECT_CHAT_LINK;

  return (
    <ImageBackground
      source={isDark ? require('../assets/images/dark-bg2.png') : require('../assets/images/light-bg.jpg')}
      style={styles.backgroundImage}
    >
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
            <TouchableOpacity
                style={styles.headerButtonBack}
                onPress={() => navigation.goBack()}
            >
                <Image
                source={require('../assets/images/icons/return.png')}
                style={styles.headerButtonIconBack}
                />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Canlı Destek</Text>
            <View style={styles.headerRight} />
        </View>
        <WebView
            source={{ uri: chatUrl }}
            style={styles.webview}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            startInLoadingState={true}
            renderLoading={() => (
                <ActivityIndicator
                    color={currentTheme.colors.accent}
                    size="large"
                    style={styles.webviewLoading}
                />
            )}
            thirdPartyCookiesEnabled={true}
            mixedContentMode="always"
            userAgent="Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36"
            originWhitelist={['https://*.tawk.to']}
            androidHardwareAccelerationDisabled={true}
        />
      </SafeAreaView>
    </ImageBackground>
  );
};

const createStyles = (currentTheme, isDark, insets) => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: 'transparent',
      paddingBottom: insets.bottom + 60, // MainTabs için boşluk
    },
    backgroundImage: {
        flex: 1,
    },
    header: {
      paddingHorizontal: currentTheme.spacing.lg,
      paddingVertical: currentTheme.spacing.md,
      paddingTop: 30,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: 'transparent',
      borderBottomWidth: 1,
      borderBottomColor: 'rgba(255,255,255,0.1)'
    },
    headerButtonBack: {
      width: 37,
      height: 37,
      borderRadius: 8,
      backgroundColor: isDark ? currentTheme.colors.error : currentTheme.colors.white,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerButtonIconBack: {
      width: 20,
      height: 20,
      resizeMode: 'contain',
      tintColor: isDark ? currentTheme.colors.white : currentTheme.colors.error,
    },
    headerTitle: {
      fontSize: currentTheme.fontSizes.xxxl,
      fontWeight: currentTheme.fontWeights.bold,
      color: currentTheme.colors.white,
      textAlign: 'center',
      flex: 1,
    },
    headerRight: {
      width: 40,
    },
    webview: {
        flex: 1,
        backgroundColor: 'transparent'
    },
    webviewLoading: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        justifyContent: 'center',
        alignItems: 'center',
    },
});

export default LiveChat;