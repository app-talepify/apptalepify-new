import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  StyleSheet,
  ImageBackground,
} from 'react-native';
import { getFirestore, collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { app } from '../firebase';
import { theme } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import GlassmorphismView from '../components/GlassmorphismView';
import * as Animatable from 'react-native-animatable';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

const db = getFirestore(app);

export default function NewsList() {
  const navigation = useNavigation();
  const { theme: currentTheme, isDark } = useTheme();
  const [items, setItems] = useState(null);
  const [contentReady, setContentReady] = useState(true);
  const [imageErrorById, setImageErrorById] = useState({});
  const insets = useSafeAreaInsets();
  const pageViewRef = React.useRef(null);
  const enterFade = React.useMemo(() => ({
    from: { opacity: 0, translateY: 8 },
    to: { opacity: 1, translateY: 0 },
  }), []);

  useFocusEffect(
    React.useCallback(() => {
      if (pageViewRef.current) {
        try { pageViewRef.current.animate(enterFade, 420); } catch {}
      }
    }, [enterFade])
  );

  const newsCardConfig = useMemo(() => ({
    overlayColor: 'rgba(224, 220, 220, 0.81)',
    startColor: 'rgba(17, 36, 49, 1)',
    endColor: 'rgba(17, 36, 49, 0.38)',
    gradientAlpha: 1,
    gradientDirection: 150,
    gradientSpread: 7,
    ditherStrength: 4.0,
  }), []);

  useEffect(() => {
    const q = query(collection(db, 'news'), orderBy('publishedAt', 'desc'), limit(100));
    const unsub = onSnapshot(q, (snap) => {
      const arr = [];
      snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));
      setItems(arr);
    });
    return () => unsub();
  }, []);

  const formattedDate = useCallback((val) => {
    try {
      const d = new Date(val);
      return isNaN(d.getTime()) ? '-' : d.toLocaleString('tr-TR');
    } catch { return '-'; }
  }, []);

  if (!items || items.length === 0) {
    return (
      <SafeAreaView edges={['left','right','bottom']} style={[styles.container, { backgroundColor: 'transparent' }]}>
        <ImageBackground
          source={isDark ? require('../assets/images/dark-bg2.png') : require('../assets/images/light-bg.jpg')}
          defaultSource={isDark ? require('../assets/images/dark-bg2.png') : require('../assets/images/light-bg.jpg')}
          fadeDuration={0}
          style={[styles.backgroundImage, { backgroundColor: isDark ? '#071317' : '#FFFFFF' }]}
        >
          <View style={{flex: 1, backgroundColor: 'transparent'}}>
            {/* Header */}
            <View style={[styles.header, { paddingTop: Math.max(insets.top, 0) + 12 }]}>
              <View style={styles.headerLeft}>
                <TouchableOpacity
                  style={styles.headerButtonBack}
                  onPress={() => navigation.goBack()}
                >
                  <Image source={require('../assets/images/icons/return.png')} style={styles.headerButtonIconBack} />
                </TouchableOpacity>
              </View>
              
              <View style={styles.headerCenter}>
                <View style={{ alignItems: 'center' }}>
                  <Text style={styles.headerTitle}>Emlak Haberleri</Text>
                  <Text style={styles.headerSubtitle}>Güncel emlak haberlerini keşfedin</Text>
                </View>
              </View>
              
              <View style={styles.headerRight} />
            </View>

          {/* Spacer: header yüksekliği kadar boşluk (insets.top + 12 + 37 + spacing.lg) */}
          <View style={{ height: Math.max(insets.top, 0) + 12 + 37 + ((currentTheme?.spacing && currentTheme.spacing.lg) ? currentTheme.spacing.lg : 16) }} />

          <Animatable.View
            ref={pageViewRef}
            useNativeDriver
            style={[
              styles.center,
              { opacity: 0, transform: [{ translateY: 8 }] },
            ]}
          >
              {!items ? (
                <>
                  <ActivityIndicator size="large" color={currentTheme.colors.error} />
                  <Text style={[styles.loadingText, { color: currentTheme.colors.mutedText }]}>
                    Emlak haberleri yükleniyor…
                  </Text>
                </>
              ) : (
                <>
                  <Image source={require('../assets/images/icons/newss.png')} style={[styles.emptyIcon, { tintColor: currentTheme.colors.mutedText }]} />
                  <Text style={[styles.emptyTitle, { color: currentTheme.colors.text }]}>
                    Henüz Haber Yok
                  </Text>
                  <Text style={[styles.emptySubtitle, { color: currentTheme.colors.mutedText }]}>
                    Emlak haberleri yakında burada görünecek.
                  </Text>
                </>
              )}
          </Animatable.View>
          </View>
        </ImageBackground>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['left','right','bottom']} style={[styles.container, { backgroundColor: 'transparent' }]}>
      <ImageBackground
        source={isDark ? require('../assets/images/dark-bg2.png') : require('../assets/images/light-bg.jpg')}
        defaultSource={isDark ? require('../assets/images/dark-bg2.png') : require('../assets/images/light-bg.jpg')}
        fadeDuration={0}
        style={[styles.backgroundImage, { backgroundColor: isDark ? '#071317' : '#FFFFFF' }]}
      >
        <View style={{flex: 1, backgroundColor: 'transparent'}}>
          {/* Header */}
          <View style={[styles.header, { paddingTop: Math.max(insets.top, 0) + 12 }]}>
            <View style={styles.headerLeft}>
              <TouchableOpacity
                style={styles.headerButtonBack}
                onPress={() => navigation.goBack()}
              >
                <Image source={require('../assets/images/icons/return.png')} style={styles.headerButtonIconBack} />
              </TouchableOpacity>
            </View>
            
            <View style={styles.headerCenter}>
              <View style={{ alignItems: 'center' }}>
                <Text style={styles.headerTitle}>Emlak Haberleri</Text>
                <Text style={styles.headerSubtitle}>Güncel emlak haberlerini keşfedin</Text>
              </View>
            </View>
            
            <View style={styles.headerRight} />
          </View>

          {/* Spacer: header yüksekliği kadar boşluk (insets.top + 12 + 37 + spacing.lg) */}
          <View style={{ height: Math.max(insets.top, 0) + 12 + 37 + ((currentTheme?.spacing && currentTheme.spacing.lg) ? currentTheme.spacing.lg : 16) }} />

          <Animatable.View
            ref={pageViewRef}
            useNativeDriver
            style={[
              { flex: 1 },
              { opacity: 0, transform: [{ translateY: 8 }] },
            ]}
          >
          <FlatList
            contentContainerStyle={styles.listContent}
            data={items}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.cardTouchable}
                activeOpacity={0.85}
                onPress={() => navigation.navigate('NewsDetail', { item })}
              >
                <GlassmorphismView
                  style={styles.card}
                  borderRadius={16}
                  config={newsCardConfig}
                  blurEnabled={false}
                >
                  <Image
                    source={imageErrorById[item.id] ? require('../assets/images/logo-krimson.png') : { uri: item.image }}
                    style={styles.thumb}
                    onError={() => setImageErrorById((prev) => ({ ...prev, [item.id]: true }))}
                  />
                  <View style={styles.cardContent}>
                    <Text style={styles.title} numberOfLines={2}>
                      {item.title}
                    </Text>
                    {item.summary ? (
                      <Text style={styles.summary} numberOfLines={3}>
                        {item.summary}
                      </Text>
                    ) : null}
                    <View style={styles.metaRow}>
                      <Text style={styles.meta}>
                        {item.source || 'Kaynak'}
                      </Text>
                      <Text style={styles.meta}>
                        {formattedDate(item.publishedAt)}
                      </Text>
                    </View>
                  </View>
                </GlassmorphismView>
              </TouchableOpacity>
            )}
            ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
            showsVerticalScrollIndicator={false}
          />
          </Animatable.View>
        </View>
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
    flex: 1,
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  header: {
    paddingHorizontal: theme.spacing.lg,
    /* üst padding runtime'da insets.top + 12 olarak veriliyor */
    paddingBottom: theme.spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 20,
    minHeight: 60,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 40,
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
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.white,
  },
  headerSubtitle: {
    marginTop: 4,
    fontSize: 12,
    color: theme.colors.mutedText,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    textAlign: 'center',
  },
  listContent: {
    padding: 20,
    paddingBottom: 80, // Tab bar için boşluk eklendi
  },
  cardTouchable: {
    borderRadius: 16,
    // Gölge ve diğer efektler için sarmalayıcı
  },
  card: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 16,
    overflow: 'hidden', // GlassmorphismView için önemli
  },
  lightShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  thumb: {
    width: 90,
    height: 90,
    borderRadius: 12,
    marginRight: 16,
  },
  cardContent: {
    flex: 1,
  },
  title: {
    fontWeight: '700',
    fontSize: 16,
    marginBottom: 8,
    lineHeight: 22,
    color: theme.colors.white, // Değiştirildi
  },
  summary: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
    color: 'rgba(255, 255, 255, 0.8)', // Değiştirildi
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  meta: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.7)', // Değiştirildi
  },
  emptyIcon: {
    width: 64,
    height: 64,
    marginBottom: 16,
    resizeMode: 'contain',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 40,
    lineHeight: 20,
  },
});
