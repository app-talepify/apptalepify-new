import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { WebView } from 'react-native-webview';
import { theme } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';

const NewsWebView = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { theme: currentTheme, isDark } = useTheme();
  const { url } = route.params || {};

  const [isLoading, setIsLoading] = useState(true);

  const safeUrl = useMemo(() => {
    const u = String(url || '');
    return /^https?:\/\//i.test(u) ? u : '';
  }, [url]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: currentTheme.colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { marginBottom: 0 }]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            style={styles.headerButtonBack}
            onPress={() => navigation.goBack()}
          >
            <Image source={require('../assets/images/icons/return.png')} style={styles.headerButtonIconBack} />
          </TouchableOpacity>
        </View>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: isDark ? theme.colors.white : theme.colors.navy }]} numberOfLines={1}>
            Haber Kaynağı
          </Text>
        </View>
        <View style={styles.headerRight} />
      </View>

      {/* WebView */}
      <View style={styles.webviewContainer}>
        {safeUrl ? (
          <>
            <WebView
              source={{ uri: safeUrl }}
              originWhitelist={['https://*', 'http://*']}
              onLoadStart={() => setIsLoading(true)}
              onLoadEnd={() => setIsLoading(false)}
              onError={() => setIsLoading(false)}
              startInLoadingState={false}
              mixedContentMode="always"
              thirdPartyCookiesEnabled
              sharedCookiesEnabled
              style={styles.webview}
            />
            {isLoading && (
              <ActivityIndicator
                style={styles.loadingIndicator}
                size="large"
                color={theme.colors.error}
              />
            )}
          </>
        ) : (
          <View style={[styles.loadingIndicator, { paddingHorizontal: 20 }]}>
            <Text style={{ color: currentTheme.colors.text, textAlign: 'center' }}>
              Geçersiz haber bağlantısı.
            </Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    paddingTop: 30,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10,
    minHeight: 60,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    backgroundColor: '#142331',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 40,
  },
  headerButtonBack: {
    backgroundColor: theme.colors.error,
    width: 37,
    height: 37,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 0,
  },
  headerButtonIconBack: {
    width: 16,
    height: 16,
    tintColor: theme.colors.white,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginHorizontal: 10,
  },
  webviewContainer: {
    flex: 1,
  },
  webview: {
    flex: 1,
  },
  loadingIndicator: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default NewsWebView;
