import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  ImageBackground,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { theme } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import GlassmorphismView from '../components/GlassmorphismView';

export default function NewsDetail() {
  const { params } = useRoute();
  const navigation = useNavigation();
  const { theme: currentTheme, isDark } = useTheme();
  const item = params?.item;
  const [heroError, setHeroError] = useState(false);

  const contentCardConfig = useMemo(() => ({
    overlayColor: 'rgba(224, 220, 220, 0.81)',
    startColor: 'rgba(17, 36, 49, 1)',
    endColor: 'rgba(17, 36, 49, 0.38)',
    gradientAlpha: 1,
    gradientDirection: 150,
    gradientSpread: 7,
    ditherStrength: 4.0,
  }), []);

  if (!item) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: currentTheme.colors.background }]}>
        {/* Arka Plan */}
        <ImageBackground
          source={isDark ? require('../assets/images/dark-bg2.png') : require('../assets/images/light-bg.jpg')}
          style={styles.backgroundImage}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <TouchableOpacity
                style={styles.headerButtonBack}
                onPress={() => navigation.goBack()}
              >
                <Image source={require('../assets/images/icons/return.png')} style={styles.headerButtonIconBack} />
              </TouchableOpacity>
            </View>
            
            <View style={styles.headerCenter}>
              <Text style={[styles.headerTitle, { color: isDark ? theme.colors.white : theme.colors.navy }]}>
                Haber Detayı
              </Text>
            </View>
            
            <View style={styles.headerRight} />
          </View>

          <View style={styles.center}>
            <Text style={[styles.errorText, { color: currentTheme.colors.text }]}>
              Haber bulunamadı.
            </Text>
          </View>
        </ImageBackground>
      </SafeAreaView>
    );
  }

  const formattedDate = useMemo(() => {
    try {
      const d = new Date(item?.publishedAt);
      return isNaN(d.getTime()) ? '-' : d.toLocaleString('tr-TR');
    } catch {
      return '-';
    }
  }, [item?.publishedAt]);

  const safeUrl = useMemo(() => {
    const u = String(item?.url || '');
    return /^https?:\/\//i.test(u) ? u : '';
  }, [item?.url]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: currentTheme.colors.background }]}>
      {/* Arka Plan */}
      <ImageBackground
        source={isDark ? require('../assets/images/dark-bg2.png') : require('../assets/images/light-bg.jpg')}
        style={styles.backgroundImage}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <TouchableOpacity
              style={styles.headerButtonBack}
              onPress={() => navigation.goBack()}
            >
              <Image source={require('../assets/images/icons/return.png')} style={styles.headerButtonIconBack} />
            </TouchableOpacity>
          </View>
          
          <View style={styles.headerCenter}>
            <Text style={[styles.headerTitle, { color: isDark ? theme.colors.white : theme.colors.navy }]}>
              Haber Detayı
            </Text>
          </View>
          
          <View style={styles.headerRight} />
        </View>

        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Image 
            source={heroError ? require('../assets/images/logo-krimson.png') : { uri: item.image }}
            style={styles.heroImage} 
            onError={() => { setHeroError(true); }}
          />
          <GlassmorphismView
            style={styles.contentCard}
            borderRadius={16}
            config={contentCardConfig}
            blurEnabled={false}
          >
            <Text style={styles.title}>
              {item.title}
            </Text>
            <View style={styles.metaRow}>
              <View style={styles.metaItem}>
                <Image source={require('../assets/images/icons/newss.png')} style={[styles.metaIcon, { tintColor: currentTheme.colors.error }]} />
                <Text style={styles.metaText}>
                  {item.source || 'Kaynak'}
                </Text>
              </View>
              <View style={styles.metaItem}>
                <Image source={require('../assets/images/icons/calendar.png')} style={[styles.metaIcon, { tintColor: currentTheme.colors.error }]} />
                <Text style={styles.metaText}>
                  {formattedDate}
                </Text>
              </View>
            </View>

            {item.summary ? (
              <Text style={styles.summary}>
                {item.summary}
              </Text>
            ) : null}

            <TouchableOpacity
              style={[styles.button, { backgroundColor: currentTheme.colors.error }]}
              activeOpacity={0.9}
              onPress={() => { if (safeUrl) { navigation.navigate('NewsWebView', { url: safeUrl }); } }}
            >
              <Image source={require('../assets/images/icons/share.png')} style={styles.buttonIcon} />
              <Text style={styles.buttonText}>Habere Git</Text>
            </TouchableOpacity>
          </GlassmorphismView>
        </ScrollView>
      </ImageBackground>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backgroundContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: -1,
  },
  backgroundImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
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
    marginBottom: theme.spacing.lg, // Boşluk eklendi
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
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
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 80, // Tab bar için boşluk eklendi
  },
  heroImage: {
    width: '100%',
    height: 200,
    borderRadius: 16,
    marginBottom: 20,
  },
  contentCard: {
    borderRadius: 16,
    padding: 20,
    overflow: 'hidden',
  },
  lightShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 28,
    marginBottom: 16,
    color: theme.colors.white,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    flexWrap: 'wrap',
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  metaIcon: {
    width: 16,
    height: 16,
    marginRight: 8,
    resizeMode: 'contain',
  },
  metaText: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.8)',
  },
  summary: {
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 24,
    color: 'rgba(255, 255, 255, 0.9)',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  buttonIcon: {
    width: 20,
    height: 20,
    tintColor: theme.colors.white,
    marginRight: 8,
    resizeMode: 'contain',
  },
  buttonText: {
    color: theme.colors.white,
    fontWeight: '700',
    fontSize: 16,
  },
});
