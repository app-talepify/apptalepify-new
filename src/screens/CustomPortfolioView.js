import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  Alert,
  Share,
  Platform,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeContext';
import { firestore } from '../firebase';
import { makePhoneCall, sendWhatsAppMessage } from '../utils/contactUtils';
import MapboxGL from '@rnmapbox/maps';

// Mapbox global olarak App.js'de başlatılır (token .env'den okunur)

const CustomPortfolioView = () => {
  const { theme: currentTheme, isDark } = useTheme();
  const styles = useMemo(() => stylesFactory(currentTheme, isDark), [currentTheme, isDark]);
  const route = useRoute();
  const navigation = useNavigation();
  
  const { customShareId } = route.params;
  
  const [loading, setLoading] = useState(true);
  const [customShare, setCustomShare] = useState(null);
  const [portfolio, setPortfolio] = useState(null);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [error, setError] = useState(null);

  // Güvenli resim listesi (geçersiz/null/undefined/bozuk URL'leri filtrele)
  const images = useMemo(() => {
    const original = Array.isArray(portfolio?.images) ? portfolio.images : [];
    const filtered = original
      .filter((img) => {
        const isValid = img &&
          typeof img === 'string' &&
          img.trim() !== '' &&
          img !== 'null' &&
          img !== 'undefined' &&
          img.startsWith('http');
        return isValid;
      })
      .filter(Boolean);
    return filtered;
  }, [portfolio?.images]);

  // Custom share ve portfolio verilerini yükle
  const loadCustomPortfolio = useCallback(async () => {
    if (!customShareId) {
      setError('Geçersiz paylaşım ID\'si');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      
      // Custom share verisini getir
      const customShareDoc = await firestore
        .collection('customPortfolioShares')
        .doc(customShareId)
        .get();

      if (!customShareDoc.exists) {
        setError('Paylaşım bulunamadı. Link geçersiz veya kaldırılmış olabilir.');
        return;
      }

      const customShareData = customShareDoc.data();
      
      // Link aktif mi kontrol et
      if (!customShareData.isActive) {
        setError('Bu paylaşım deaktive edilmiş. Paylaşım sahibi ile iletişime geçin.');
        return;
      }

      setCustomShare(customShareData);

      // Orijinal portfolio verisini getir
      const portfolioDoc = await firestore
        .collection('portfolios')
        .doc(customShareData.originalPortfolioId)
        .get();

      if (!portfolioDoc.exists) {
        setError('Portföy bulunamadı.');
        return;
      }

      setPortfolio({ id: portfolioDoc.id, ...portfolioDoc.data() });
      
    } catch (error) {
      console.error('Custom portfolio yüklenirken hata:', error);
      setError('Portföy yüklenirken bir hata oluştu. Lütfen tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  }, [customShareId]);

  useEffect(() => {
    loadCustomPortfolio();
  }, [loadCustomPortfolio]);

  // İletişim fonksiyonları
  const handleWhatsApp = useCallback(() => {
    const phone = customShare?.sharerPhone?.trim();
    if (!phone) {
      Alert.alert('Bilgi', 'Danışman telefon bilgisi bulunamadı.');
      return;
    }
    const sharerName = customShare?.sharerName ? customShare.sharerName : '';
    const title = portfolio?.title ? portfolio.title : 'portföy';
    const message = `Merhaba ${sharerName}, ${title} hakkında bilgi almak istiyorum.`;
    sendWhatsAppMessage(phone, message);
  }, [customShare, portfolio]);

  const handleCall = useCallback(() => {
    const phone = customShare?.sharerPhone?.trim();
    if (!phone) {
      Alert.alert('Bilgi', 'Danışman telefon bilgisi bulunamadı.');
      return;
    }
    makePhoneCall(phone);
  }, [customShare]);

  const handleShare = useCallback(async () => {
    if (!portfolio || !customShare) return;
    
    try {
      await Share.share({
        message: `${portfolio.title} - ${customShare.sharerName} tarafından paylaşıldı\n\n${customShare.customLink}`,
        url: customShare.customLink,
        title: 'Portföy Paylaş',
      });
    } catch (error) {
      console.error('Paylaşım hatası:', error);
    }
  }, [portfolio, customShare]);

  // Loading state
  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar
          barStyle={isDark ? 'light-content' : 'dark-content'}
          backgroundColor={currentTheme.colors.background}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={currentTheme.colors.primary} />
          <Text style={styles.loadingText}>Portföy yükleniyor...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Error state
  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar
          barStyle={isDark ? 'light-content' : 'dark-content'}
          backgroundColor={currentTheme.colors.background}
        />
        <View style={styles.errorContainer}>
          <Text style={styles.errorIcon}>❌</Text>
          <Text style={styles.errorTitle}>Portföy Yüklenemedi</Text>
          <Text style={styles.errorMessage}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadCustomPortfolio}>
            <Text style={styles.retryButtonText}>Tekrar Dene</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={currentTheme.colors.background}
      />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Image 
            source={require('../assets/images/icons/return.png')} 
            style={styles.backIcon}
          />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Portföy Detayı</Text>
          <Text style={styles.headerSubtitle}>
            {customShare?.sharerName} tarafından paylaşıldı
          </Text>
        </View>
        <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
          <Image 
            source={require('../assets/images/icons/share.png')} 
            style={styles.shareIcon}
          />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Image Gallery */}
        {images.length > 0 && (
          <View style={styles.imageGallery}>
            <Image 
              source={{ uri: images[activeImageIndex] }} 
              style={styles.mainImage}
              resizeMode="cover"
              onError={() => {
                try {
                  if (__DEV__) console.log('🚨 CustomPortfolioView main image failed:', images[activeImageIndex]);
                } catch {}
              }}
            />
            
            {/* Image Navigation */}
            {images.length > 1 && (
              <>
                <View style={styles.imageCounter}>
                  <Text style={styles.imageCounterText}>
                    {activeImageIndex + 1}/{images.length}
                  </Text>
                </View>
                
                <View style={styles.progressDots}>
                  {images.map((_, index) => (
                    <View
                      key={index}
                      style={[
                        styles.progressDot,
                        index === activeImageIndex && styles.progressDotActive
                      ]}
                    />
                  ))}
                </View>

                {/* Navigation Buttons */}
                <TouchableOpacity
                  style={[styles.navButton, styles.navButtonLeft]}
                  onPress={() => setActiveImageIndex(prev => 
                    prev > 0 ? prev - 1 : images.length - 1
                  )}
                >
                  <Image 
                    source={require('../assets/images/icons/return.png')} 
                    style={styles.navButtonIcon}
                  />
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.navButton, styles.navButtonRight]}
                  onPress={() => setActiveImageIndex(prev => 
                    prev < images.length - 1 ? prev + 1 : 0
                  )}
                >
                  <Image 
                    source={require('../assets/images/icons/return.png')} 
                    style={[styles.navButtonIcon, styles.navButtonIconRight]}
                  />
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {/* Content Container */}
        <View style={styles.contentContainer}>
          {/* Property Header */}
          <View style={styles.propertyHeader}>
            <Text style={styles.propertyTitle}>{portfolio?.title || 'Portföy'}</Text>
            <View style={styles.propertyLocation}>
              <Image 
                source={require('../assets/images/icons/pinfill.png')} 
                style={styles.locationIcon}
              />
              <Text style={styles.locationText}>
                {portfolio?.neighborhood}, {portfolio?.city}
              </Text>
            </View>
            <View style={styles.propertyPriceRow}>
              <View style={styles.statusBadge}>
                <Text style={styles.statusBadgeText}>Satılık</Text>
              </View>
              <Text style={styles.priceText}>
              {(() => {
                const p = portfolio?.price;
                const n = typeof p === 'number' ? p : Number(p);
                if (!n || Number.isNaN(n)) return 'Fiyat belirtilmemiş';
                return `${n.toLocaleString('tr-TR')} ₺`;
              })()}
              </Text>
            </View>
          </View>

          {/* Property Features */}
          <View style={styles.featuresSection}>
            <View style={styles.featuresGrid}>
              <View style={styles.featureItem}>
                <Text style={styles.featureIcon}>🏠</Text>
                <Text style={styles.featureValue}>{portfolio?.roomCount || '-'}</Text>
                <Text style={styles.featureLabel}>Oda</Text>
              </View>
              <View style={styles.featureItem}>
                <Text style={styles.featureIcon}>🛏️</Text>
                <Text style={styles.featureValue}>{portfolio?.bathroomCount || '-'}</Text>
                <Text style={styles.featureLabel}>Banyo</Text>
              </View>
              <View style={styles.featureItem}>
                <Text style={styles.featureIcon}>📐</Text>
                <Text style={styles.featureValue}>{portfolio?.area || '-'}</Text>
                <Text style={styles.featureLabel}>m²</Text>
              </View>
              <View style={styles.featureItem}>
                <Text style={styles.featureIcon}>🏢</Text>
                <Text style={styles.featureValue}>{portfolio?.floor || '-'}</Text>
                <Text style={styles.featureLabel}>Kat</Text>
              </View>
            </View>
          </View>

          {/* Agent Card */}
          <View style={styles.agentCard}>
            <View style={styles.agentInfo}>
              <View style={styles.agentAvatar}>
                <Text style={styles.agentAvatarText}>
                  {customShare?.sharerName?.charAt(0)?.toUpperCase() || '👤'}
                </Text>
              </View>
              <View style={styles.agentDetails}>
                <Text style={styles.agentName}>{customShare?.sharerName || 'Danışman'}</Text>
                <Text style={styles.agentTitle}>Emlak Danışmanı</Text>
                <Text style={styles.agentPhone}>{customShare?.sharerPhone}</Text>
                {customShare?.sharerEmail && (
                  <Text style={styles.agentEmail}>{customShare.sharerEmail}</Text>
                )}
              </View>
            </View>
            
            <View style={styles.agentActions}>
              <TouchableOpacity style={styles.agentActionButton} onPress={handleWhatsApp}>
                <Text style={styles.agentActionIcon}>💬</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.agentActionButton} onPress={handleCall}>
                <Text style={styles.agentActionIcon}>📞</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Description */}
          {portfolio?.description && (
            <View style={styles.descriptionSection}>
              <Text style={styles.sectionTitle}>Açıklama</Text>
              <Text style={styles.descriptionText}>{portfolio.description}</Text>
            </View>
          )}

          {/* Map */}
          {portfolio?.location?.latitude && portfolio?.location?.longitude && (
            <View style={styles.mapSection}>
              <Text style={styles.sectionTitle}>Konum</Text>
              <View style={styles.mapContainer}>
                <MapboxGL.MapView 
                  style={styles.map}
                  styleURL="mapbox://styles/mapbox/light-v11"
                  logoEnabled={false}
                  attributionEnabled={false}
                  localizeLabels={Platform.OS === 'ios' ? { locale: 'en-US' } : true}
                >
                  <MapboxGL.Camera
                    centerCoordinate={[portfolio.location.longitude, portfolio.location.latitude]}
                    zoomLevel={14}
                  />
                  <MapboxGL.ShapeSource
                    id="property-point"
                    shape={{
                      type: 'Feature',
                      geometry: {
                        type: 'Point',
                        coordinates: [portfolio.location.longitude, portfolio.location.latitude],
                      },
                    }}
                  >
                    <MapboxGL.CircleLayer
                      id="property-circle"
                      style={{
                        circleRadius: 12,
                        circleColor: currentTheme.colors.primary,
                        circleStrokeWidth: 2,
                        circleStrokeColor: '#FFFFFF',
                        circleOpacity: 1,
                      }}
                    />
                  </MapboxGL.ShapeSource>
                </MapboxGL.MapView>
              </View>
            </View>
          )}

          {/* Footer Info */}
          <View style={styles.footerInfo}>
            <Text style={styles.footerText}>
              Bu portföy {customShare?.sharerName} tarafından {new Date(customShare?.createdAt?.toDate?.() || Date.now()).toLocaleDateString('tr-TR')} tarihinde paylaşılmıştır.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const stylesFactory = (theme, isDark) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  
  // Loading & Error States
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  errorIcon: {
    fontSize: 64,
    marginBottom: 20,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 30,
  },
  retryButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  backIcon: {
    width: 20,
    height: 20,
    tintColor: '#FFFFFF',
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  headerSubtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  shareButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  shareIcon: {
    width: 20,
    height: 20,
    tintColor: '#FFFFFF',
  },

  // Content
  content: {
    flex: 1,
  },
  contentContainer: {
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    marginTop: -20,
    paddingHorizontal: 20,
    paddingTop: 20,
    zIndex: 1,
  },

  // Image Gallery
  imageGallery: {
    height: 300,
    position: 'relative',
  },
  mainImage: {
    width: '100%',
    height: '100%',
  },
  imageCounter: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  imageCounterText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  progressDots: {
    position: 'absolute',
    bottom: 20,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.5)',
    marginHorizontal: 3,
  },
  progressDotActive: {
    backgroundColor: '#FFFFFF',
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  navButton: {
    position: 'absolute',
    top: '50%',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: -20,
  },
  navButtonLeft: {
    left: 16,
  },
  navButtonRight: {
    right: 16,
  },
  navButtonIcon: {
    width: 16,
    height: 16,
    tintColor: '#FFFFFF',
  },
  navButtonIconRight: {
    transform: [{ rotate: '180deg' }],
  },

  // Property Info
  propertyHeader: {
    marginBottom: 24,
  },
  propertyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 8,
  },
  propertyLocation: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  locationIcon: {
    width: 16,
    height: 16,
    tintColor: theme.colors.primary,
    marginRight: 6,
  },
  locationText: {
    fontSize: 16,
    color: theme.colors.textSecondary,
  },
  propertyPriceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusBadge: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusBadgeText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  priceText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.text,
  },

  // Features
  featuresSection: {
    marginBottom: 24,
    paddingVertical: 20,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: theme.colors.border,
  },
  featuresGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  featureItem: {
    alignItems: 'center',
  },
  featureIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  featureValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 4,
  },
  featureLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },

  // Agent Card
  agentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  agentInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  agentAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  agentAvatarText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  agentDetails: {
    flex: 1,
  },
  agentName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 2,
  },
  agentTitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: 4,
  },
  agentPhone: {
    fontSize: 14,
    color: theme.colors.text,
    marginBottom: 2,
  },
  agentEmail: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  agentActions: {
    flexDirection: 'row',
    gap: 8,
  },
  agentActionButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  agentActionIcon: {
    fontSize: 18,
  },

  // Sections
  descriptionSection: {
    marginBottom: 24,
  },
  mapSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 12,
  },
  descriptionText: {
    fontSize: 16,
    color: theme.colors.text,
    lineHeight: 24,
  },
  mapContainer: {
    height: 200,
    borderRadius: 12,
    overflow: 'hidden',
  },
  map: {
    flex: 1,
  },

  // Footer
  footerInfo: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  footerText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 16,
  },
});

export default CustomPortfolioView;
