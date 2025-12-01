import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Alert,
  Share,
  PermissionsAndroid,
  Platform,
  Modal,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import ViewShot from 'react-native-view-shot';
import RNFS from 'react-native-fs';
import { useTheme } from '../theme/ThemeContext';

const { width, height } = Dimensions.get('window');

// Şablonun içeriğini ayrı bir bileşen olarak tanımlayalım.
// Bu, hem off-screen render hem de ilerideki olası kullanımlar için kod tekrarını önler.
const TemplateContent = React.memo(({ portfolio, selectedImages, selectedFeatures, formatPrice, currentTheme }) => {
  const TEMPLATE_RED = '#DC143C'; // Crimson Red for consistency

  // Ensure we always have 4 thumbnails to display, repeating if necessary.
  const getDisplayThumbnails = () => {
    const availableThumbs = selectedImages.slice(1, 5); // Get up to 4 thumbs
    if (availableThumbs.length === 0) {
      return Array(4).fill(null); // Return array of nulls for placeholders
    }
    
    const displayThumbs = [];
    for (let i = 0; i < 4; i++) {
      displayThumbs.push(availableThumbs[i % availableThumbs.length]);
    }
    return displayThumbs;
  };

  const displayThumbnails = getDisplayThumbnails();

  return (
  <>
    {/* Hero Image (background) */}
    <View style={styles.heroContainer}>
      {selectedImages && selectedImages[0] ? (
        <Image source={{ uri: selectedImages[0] }} style={styles.heroImage} resizeMode="cover" />
      ) : (
        <View style={[styles.placeholderImage, { backgroundColor: currentTheme.colors.surface }]} />
      )}
      <View style={styles.heroTint} />

      {/* Status Ribbon */}
      <View style={[styles.statusRibbon, { backgroundColor: TEMPLATE_RED }]}>
        <Text style={styles.statusRibbonText}>{(portfolio?.listingStatus || 'SATILIK').toUpperCase()}</Text>
      </View>
    </View>

    {/* Spec Panel with thumbs and features */}
    <View style={styles.specPanelWrapper}>
      <View style={styles.specPanel}>
        {/* Thumbs row */}
        <View style={styles.thumbRow}>
          {displayThumbnails.map((uri, idx) => {
            const isInner = idx === 1 || idx === 2;
            return (
              <View key={idx} style={[
                styles.thumbFrame,
                isInner ? styles.thumbFrameInner : styles.thumbFrameOuter
              ]}>
                {uri ? (
                  <Image source={{ uri }} style={styles.thumbImage} resizeMode="cover" />
                ) : (
                  <View style={styles.thumbPlaceholder} />
                )}
              </View>
            );
          })}
        </View>

        {/* Features columns */}
        <View style={styles.specRow}>
          {selectedFeatures.slice(0, 4).map((f, i) => (
            <React.Fragment key={f.key}>
              <View style={styles.specCol}>
                <Text style={styles.specIcon}>{f.icon}</Text>
                <Text style={styles.specTextPrimary}>{f.value}</Text>
                <Text style={styles.specTextSecondary}>{f.label}</Text>
              </View>
              {i < 3 && <View style={styles.specDivider} />}
            </React.Fragment>
          ))}
        </View>
      </View>
    </View>

    {/* CTA Container (Red background) */}
    <View style={styles.ctaContainer}>
        <View style={styles.ctaPill}>
          <Text style={styles.ctaPillText}>{portfolio?.roomCount || '3+1'}</Text>
        </View>
        <View style={styles.ctaPill}>
          <Text style={styles.ctaPillText}>{formatPrice(portfolio?.price)}</Text>
        </View>
    </View>
    
    {/* URL bar */}
    <View style={styles.urlBar}>
      <Text style={styles.urlIcon}>🌐</Text>
      <Text style={styles.urlText}>talepify.com/konut/{String(portfolio?.id || '123456')}</Text>
    </View>

    {/* Agent Card */}
    <View style={styles.agentCard}>
      <View style={styles.agentAvatarWrap}>
        {portfolio?.ownerAvatar ? (
          <Image source={{ uri: portfolio.ownerAvatar }} style={styles.agentAvatar} />
        ) : (
          <Image source={require('../assets/images/icons/userphoto.png')} style={styles.agentAvatar} />
        )}
      </View>
      <View style={[styles.agentSeparator, { backgroundColor: TEMPLATE_RED }]} />
      <View style={styles.agentInfo}>
        <Text style={styles.agentName} numberOfLines={1} adjustsFontSizeToFit>{portfolio?.ownerName || 'Alihan TELLİOĞLU'}</Text>
        <Text style={styles.agentOffice} numberOfLines={1} adjustsFontSizeToFit>{portfolio?.ownerOffice || 'Armenkul'}</Text>
        <Text style={styles.agentPhone}>{portfolio?.ownerPhone || '0 (535) 464 8228'}</Text>
      </View>
    </View>
  </>
)});

const SocialShareTemplate = ({ portfolio, onClose, visible }) => {
  const { theme: currentTheme } = useTheme();
  const viewShotRef = useRef(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [showCustomizeModal, setShowCustomizeModal] = useState(false);
  
  const [previewUri, setPreviewUri] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const getValidImages = useCallback(() => {
    const imgs = Array.isArray(portfolio?.images) ? portfolio.images.filter((img) => (
      img && typeof img === 'string' && img.trim() !== '' && img !== 'null' && img !== 'undefined' && img.startsWith('http')
    )) : [];
    return imgs.slice(0, 5);
  }, [portfolio?.images]);

  const [selectedImages, setSelectedImages] = useState(getValidImages());
  
  const defaultFeatures = React.useMemo(() => [
    { key: 'squareMeters', icon: '📐', label: 'm2', value: portfolio?.squareMeters || '35' },
    { key: 'currentFloor', icon: '🏢', label: 'kat', value: `${portfolio?.currentFloor || '7.'}` },
    { key: 'bathroomCount', icon: '🛁', label: 'Banyo', value: portfolio?.bathroomCount || '2' },
    { key: 'buildingAge', icon: '⏳', label: 'yaş', value: portfolio?.buildingAge ?? '0' },
  ], [portfolio]);
  
  const [selectedFeatures, setSelectedFeatures] = useState(defaultFeatures);

  const formatPrice = useCallback((price) => {
    if (!price) return 'Fiyat Belirtilmemiş';
    if (price >= 1000000) {
      return (price / 1000000).toFixed(1).replace('.0', '') + 'M ₺';
    } else if (price >= 1000) {
      return (price / 1000).toFixed(0) + 'K ₺';
    }
    return price + ' ₺';
  }, []);

  const generatePreview = useCallback(async () => {
    if (isGenerating || !viewShotRef.current) return;
    
    setIsGenerating(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 250));

      const uri = await viewShotRef.current.capture({
        format: 'jpg',
        quality: 0.9,
        width: 1080,
        height: 1920,
      });
      setPreviewUri(uri);
    } catch (error) {
      console.error("Failed to generate preview", error);
      Alert.alert('Hata', 'Önizleme oluşturulamadı.');
    } finally {
      setIsGenerating(false);
    }
  }, [isGenerating]);

  useEffect(() => {
    if (visible && !previewUri) {
      generatePreview();
    }
    if (!visible) {
      // Modal kapandığında URI'ı sıfırla ki tekrar açıldığında yeniden oluşsun
      setPreviewUri(null);
    }
  }, [visible, previewUri, generatePreview]);

  // Özelleştir modali kapandıktan sonra (ve görünürken) önizlemeyi güncelle
  useEffect(() => {
    if (visible && !showCustomizeModal) {
      setPreviewUri(null);
    }
  }, [showCustomizeModal, visible]);
  
  const requestPermissions = async () => {
    if (Platform.OS === 'android') {
      try {
        // Android 13+ için yeni permission yapısı
        const androidVersion = Platform.Version;
        
        if (androidVersion >= 33) {
          // Android 13+ için READ_MEDIA_IMAGES kullan
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES,
            {
              title: 'Medya İzni',
              message: 'Uygulamanın resim kaydetmesi için medya iznine ihtiyacı var.',
              buttonNeutral: 'Daha Sonra Sor',
              buttonNegative: 'İptal',
              buttonPositive: 'İzin Ver',
            }
          );
          return granted === PermissionsAndroid.RESULTS.GRANTED;
        } else {
          // Android 12 ve altı için eski permission
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
            {
              title: 'Depolama İzni',
              message: 'Uygulamanın resim kaydetmesi için depolama iznine ihtiyacı var.',
              buttonNeutral: 'Daha Sonra Sor',
              buttonNegative: 'İptal',
              buttonPositive: 'İzin Ver',
            }
          );
          return granted === PermissionsAndroid.RESULTS.GRANTED;
        }
      } catch (err) {
        console.warn('Permission error:', err);
        return false;
      }
    }
    return true; // iOS için izin gerekmiyor
  };

  const shareTemplate = async () => {
    if (!previewUri) {
      Alert.alert('Lütfen Bekleyin', 'Paylaşım görseli hazırlanıyor...');
      return;
    }

    try {
      const shareContent = `🏠 ${portfolio?.title || 'Modern Daire'}
📍 ${portfolio?.neighborhood || 'Merkez'}, ${portfolio?.city || 'Samsun'}
💰 ${formatPrice(portfolio?.price)}
#emlak #talepify #satilik #${portfolio?.city?.toLowerCase() || 'samsun'}`;

      const shareOptions = {
        message: shareContent,
        title: 'Emlak İlanı - Talepify',
        url: Platform.OS === 'android' ? `file://${previewUri}` : previewUri,
      };

      await Share.share(shareOptions);
    } catch (error) {
      console.error('Share error:', error);
      if (error.message !== 'User did not share') {
        Alert.alert('Hata', 'Görsel paylaşılamadı.');
      }
    }
  };

  const downloadTemplate = async () => {
    if (!previewUri) {
      Alert.alert('Lütfen Bekleyin', 'İndirme için görsel hazırlanıyor...');
      return;
    }

    try {
      const hasPermission = await requestPermissions();
      if (!hasPermission) {
        Alert.alert('İzin Gerekli', 'Görseli kaydetmek için depolama izni vermeniz gerekiyor.');
        return;
      }

      const timestamp = new Date().getTime();
      const fileName = `Talepify_Portfolio_${timestamp}.jpg`;
      const targetPath = `${RNFS.DownloadDirectoryPath}/${fileName}`;
      
      await RNFS.copyFile(previewUri, targetPath);
      
      const message = `Tanıtım görseli başarıyla 'Downloads' klasörüne kaydedildi.\n\nDosya: ${fileName}`;
      setSuccessMessage(message);
      setShowSuccessModal(true);
      
    } catch (error) {
      console.error('Download hatası:', error);
      Alert.alert('Hata', `Resim kaydedilirken bir hata oluştu: ${error.message}`);
    }
  };

  if (!visible) return null;

  return (
    <>
      {/* Off-screen renderer. Bu kısım ekranda görünmez, sadece görseli oluşturmak için kullanılır. */}
      <View style={styles.offscreenContainer}>
        <ViewShot ref={viewShotRef} style={styles.template}>
          <TemplateContent 
            portfolio={portfolio}
            selectedImages={selectedImages}
            selectedFeatures={selectedFeatures}
            formatPrice={formatPrice}
            currentTheme={currentTheme}
          />
        </ViewShot>
      </View>
      
      <View style={styles.overlay}>
        <View style={[styles.container, { backgroundColor: currentTheme.colors.background }]}>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Template Preview */}
            <View style={styles.previewWrapper}>
              {isGenerating || !previewUri ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color={currentTheme.colors.primary} />
                  <Text style={[styles.loadingText, { color: currentTheme.colors.text }]}>
                    Önizleme Oluşturuluyor...
                  </Text>
                </View>
              ) : (
                <Image source={{ uri: previewUri }} style={styles.previewImage} resizeMode="contain" />
              )}
            </View>

            {/* Customize Button */}
            <TouchableOpacity
              style={[styles.customizeButton, { backgroundColor: currentTheme.colors.error }]}
              onPress={() => setShowCustomizeModal(true)}
              disabled={isGenerating}
            >
              <Text style={styles.customizeButtonText}>✨ Özelleştir</Text>
            </TouchableOpacity>

            {/* Action Buttons */}
            <View style={styles.actionButtons}>
              <TouchableOpacity 
                style={[styles.shareButton, { backgroundColor: currentTheme.colors.success, opacity: isGenerating ? 0.5 : 1 }]}
                onPress={shareTemplate}
                disabled={isGenerating}
              >
                <Text style={styles.shareButtonText}>📱 Paylaş</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.downloadButton, { backgroundColor: currentTheme.colors.primary, opacity: isGenerating ? 0.5 : 1 }]}
                onPress={downloadTemplate}
                disabled={isGenerating}
              >
                <Text style={styles.downloadButtonText}>💾 İndir</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.closeButton, { backgroundColor: currentTheme.colors.surface, borderColor: currentTheme.colors.border }]}
                onPress={onClose}
              >
                <Text style={[styles.closeButtonText, { color: currentTheme.colors.text }]}>❌ Kapat</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>

        {/* Customize Modal */}
        <Modal
          visible={showCustomizeModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowCustomizeModal(false)}
        >
          <View style={styles.customizeOverlay}>
            <View style={[styles.customizeCard, { backgroundColor: currentTheme.colors.background }]}> 
              <Text style={[styles.customizeTitle, { color: currentTheme.colors.text }]}>Şablonu Özelleştir</Text>
              <ScrollView contentContainerStyle={{ paddingBottom: 12 }}>
                <Text style={[styles.sectionTitle, { color: currentTheme.colors.textSecondary }]}>Resimler (5 seç)</Text>
                <View style={styles.imagesGrid}>
                  {(Array.isArray(portfolio?.images) ? portfolio.images : []).filter((img) => (
                    img && typeof img === 'string' && img.startsWith('http')
                  )).map((uri) => {
                    const selected = selectedImages.includes(uri);
                    return (
                      <TouchableOpacity
                        key={uri}
                        style={[styles.imagePickItem, selected && { borderColor: currentTheme.colors.primary, borderWidth: 2 }]}
                        onPress={() => {
                          setSelectedImages((prev) => {
                            const exists = prev.includes(uri);
                            if (exists) return prev.filter((u) => u !== uri);
                            const next = [...prev, uri];
                            return next.slice(0, 5);
                          });
                        }}
                        activeOpacity={0.8}
                      >
                        <Image source={{ uri }} style={styles.imagePickThumb} />
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={[styles.sectionTitle, { color: currentTheme.colors.textSecondary, marginTop: 12 }]}>Özellikler (4 seç)</Text>
                <View style={styles.featuresGrid}>
                  {defaultFeatures.map((f) => {
                    const selected = !!selectedFeatures.find((sf) => sf.key === f.key);
                    return (
                      <TouchableOpacity
                        key={f.key}
                        style={[styles.featurePickItem, { borderColor: selected ? currentTheme.colors.primary : currentTheme.colors.border }]}
                        onPress={() => {
                          setSelectedFeatures((prev) => {
                            const exists = prev.find((p) => p.key === f.key);
                            if (exists) return prev.filter((p) => p.key !== f.key);
                            const next = [...prev, f].slice(0, 4);
                            return next;
                          });
                        }}
                      >
                        <Text style={styles.featurePickIcon}>{f.icon}</Text>
                        <Text style={[styles.featurePickText, { color: currentTheme.colors.text }]}>{f.value} {f.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>

              <View style={styles.customizeActions}>
                <TouchableOpacity style={[styles.customizeSave, { backgroundColor: currentTheme.colors.primary }]} onPress={() => setShowCustomizeModal(false)}>
                  <Text style={styles.customizeSaveText}>Kaydet</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.customizeCancel, { borderColor: currentTheme.colors.border }]} onPress={() => setShowCustomizeModal(false)}>
                  <Text style={[styles.customizeCancelText, { color: currentTheme.colors.text }]}>Vazgeç</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Success Modal */}
        <Modal
          visible={showSuccessModal}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowSuccessModal(false)}
        >
          <View style={styles.successOverlay}>
            <View style={[styles.successContainer, { backgroundColor: currentTheme.colors.background }]}>
              {/* Success Icon */}
              <View style={[styles.successIcon, { backgroundColor: currentTheme.colors.success }]}>
                <Text style={styles.successIconText}>✓</Text>
              </View>

              {/* Success Title */}
              <Text style={[styles.successTitle, { color: currentTheme.colors.text }]}>
                Başarılı! 🎉
              </Text>

              {/* Success Message */}
              <Text style={[styles.successMessage, { color: currentTheme.colors.textSecondary }]}>
                {successMessage}
              </Text>

              {/* Success Buttons */}
              <View style={styles.successButtons}>
                <TouchableOpacity 
                  style={[styles.successButton, { backgroundColor: currentTheme.colors.success }]}
                  onPress={() => {
                    setShowSuccessModal(false);
                    onClose(); // Ana modal'ı da kapat
                  }}
                >
                  <Text style={styles.successButtonText}>Harika! 👍</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={[styles.successSecondaryButton, { borderColor: currentTheme.colors.border }]}
                  onPress={() => setShowSuccessModal(false)}
                >
                  <Text style={[styles.successSecondaryButtonText, { color: currentTheme.colors.text }]}>
                    Devam Et
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  offscreenContainer: {
    position: 'absolute',
    left: -9999, // Move off the screen
    top: -9999,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  container: {
    width: '95%',
    maxHeight: '90%',
    borderRadius: 24,
    paddingVertical: 16,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  scroll: {
    width: '100%',
  },
  scrollContent: {
    alignItems: 'center',
    paddingBottom: 8,
  },
  previewWrapper: {
    width: width * 0.8,
    aspectRatio: 9 / 16,
    maxHeight: height * 0.6,
    marginBottom: 16,
    backgroundColor: '#2c2c2c',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 16,
    fontWeight: '600',
  },
  template: {
    width: 1080, // Render at high resolution
    height: 1920,
    backgroundColor: '#ffffff',
  },
  // New layout styles (pixel-approx to provided mock)
  heroContainer: {
    position: 'relative',
    height: '55%', // Use percentage for flexible layout
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroTint: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    top: 0,
    backgroundColor: 'rgba(220, 20, 60, 0.05)', // Even more subtle red tint
  },
  statusRibbon: {
    position: 'absolute',
    top: 0,
    left: '50%',
    transform: [{ translateX: -270 }], // Center based on width
    width: 540,
    height: 120, // Slightly shorter
    borderBottomLeftRadius: 45, // Softer curve
    borderBottomRightRadius: 45, // Softer curve
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 8,
  },
  statusRibbonText: {
    color: '#fff',
    fontSize: 64,
    fontWeight: '900',
    letterSpacing: 2,
  },
  specPanelWrapper: {
    position: 'relative',
    marginTop: -150, // Adjusted overlap
    paddingHorizontal: 40,
    zIndex: 10,
  },
  specPanel: {
    backgroundColor: '#1C2533',
    borderRadius: 45, // Softer curve
    padding: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.3,
    shadowRadius: 15,
    elevation: 12,
  },
  thumbRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
    gap: 20,
    marginBottom: 25,
    height: 212, // Height of the tallest thumbnail + border
  },
  thumbFrame: {
    borderRadius: 35,
    overflow: 'hidden',
    borderWidth: 6,
    borderColor: '#ffffff',
    backgroundColor: '#333',
  },
  thumbFrameOuter: {
    width: 190,
    height: 160,
  },
  thumbFrameInner: {
    width: 230,
    height: 200,
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  thumbPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#2c3e50', // A neutral dark blue
  },
  specRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  specCol: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    minWidth: 180, // Ensure columns have space
  },
  specIcon: {
    fontSize: 48, // Made icons larger
    color: '#ffffff',
    marginBottom: 10,
  },
  specTextPrimary: {
    color: '#ffffff',
    fontSize: 42,
    fontWeight: '800',
  },
  specTextSecondary: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 32,
    fontWeight: '600',
    marginTop: 5,
  },
  specDivider: {
    width: 2,
    height: '70%',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  ctaContainer: {
    backgroundColor: '#DC143C',
    marginHorizontal: 40,
    borderRadius: 45, // Softer curve
    padding: 20,
    marginTop: -50, // Adjusted overlap
    paddingTop: 70, // Adjusted for overlap
    flexDirection: 'row',
    justifyContent: 'space-between',
    zIndex: 5,
  },
  ctaPill: {
    backgroundColor: '#3D0C11', // Dark maroon color
    borderRadius: 35, // Softer curve
    paddingVertical: 25,
    paddingHorizontal: 40,
    flex: 1,
    marginHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaPillText: {
    color: '#ffffff',
    fontSize: 52,
    fontWeight: '900',
  },
  urlBar: {
    backgroundColor: '#1C2533',
    marginTop: 20,
    marginHorizontal: 40,
    borderRadius: 30,
    paddingVertical: 25,
    paddingHorizontal: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 15,
  },
  urlIcon: { fontSize: 40, color: '#ffffff' },
  urlText: { color: '#ffffff', fontSize: 36, fontWeight: '700' },
  agentCard: {
    backgroundColor: '#1C2533',
    marginTop: 20,
    marginHorizontal: 40,
    borderRadius: 40,
    padding: 30,
    flexDirection: 'row',
    alignItems: 'center',
  },
  agentAvatarWrap: {
    width: 180,
    height: 180,
    borderRadius: 90,
    overflow: 'hidden',
    backgroundColor: '#1f3243',
    borderWidth: 6,
    borderColor: '#fff',
  },
  agentAvatar: { width: '100%', height: '100%' },
  agentSeparator: {
    width: 5,
    height: '80%',
    borderRadius: 3,
    marginHorizontal: 25,
  },
  agentInfo: { flex: 1, justifyContent: 'center' },
  agentName: { color: '#ffffff', fontSize: 48, fontWeight: '900', marginBottom: 5 },
  agentOffice: { color: 'rgba(255,255,255,0.8)', fontSize: 36, marginBottom: 10 },
  agentPhone: { color: '#ffffff', fontSize: 48, fontWeight: '800' },
  placeholderImage: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionButtons: {
    flexDirection: 'row',
    marginTop: 8,
    gap: 8,
  },
  customizeButton: {
    width: '100%',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  customizeButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  shareButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  shareButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  downloadButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  downloadButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  closeButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },

  // Customize modal
  customizeOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  customizeCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 16,
    padding: 16,
  },
  customizeTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 10,
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  imagesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  imagePickItem: {
    width: 70,
    height: 70,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
  },
  imagePickThumb: {
    width: '100%',
    height: '100%',
  },
  featuresGrid: {
    gap: 8,
  },
  featurePickItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  featurePickIcon: {
    fontSize: 14,
  },
  featurePickText: {
    fontSize: 13,
    fontWeight: '600',
  },
  customizeActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  customizeSave: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  customizeSaveText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  customizeCancel: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
  },
  customizeCancelText: {
    fontWeight: '700',
  },

  // Success Modal Styles
  successOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  successContainer: {
    width: width * 0.8,
    borderRadius: 20,
    padding: 30,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  successIconText: {
    color: '#ffffff',
    fontSize: 40,
    fontWeight: 'bold',
  },
  successTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
  },
  successMessage: {
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: 30,
  },
  successButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  successButton: {
    flex: 1,
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
  },
  successButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  successSecondaryButton: {
    flex: 1,
    paddingVertical: 15,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  successSecondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});

export default SocialShareTemplate;

