import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Dimensions,
  FlatList,
  ActivityIndicator,
  Image,
  AppState,
  Animated,
  InteractionManager,
  DeviceEventEmitter,
} from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { theme as staticTheme } from '../theme/theme';
import GlassmorphismView from './GlassmorphismView';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width, height } = Dimensions.get('window');
const DRAFT_STORAGE_KEY = 'talepify.draft.portfolios';

const DraftPortfolioOverlay = ({ isVisible, onClose, navigation, useSharedBackdrop = false }) => {
  const { theme, isDark } = useTheme();
  // const navigation = useNavigation();
  const [draftPortfolios, setDraftPortfolios] = useState([]);
  const [loading, setLoading] = useState(true); // Başlangıçta true
  const appState = useRef(AppState.currentState);
  const [redrawKey, setRedrawKey] = useState(0);
  const modalAnim = useRef(new Animated.Value(0)).current;
  const draftsLenRef = useRef(0);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const pendingDeleteIdRef = useRef(null);

  const styles = createStyles(isDark, theme);

  // AppState değişikliğini dinle
  useEffect(() => {
    if (!isVisible) return;

    const subscription = AppState.addEventListener('change', nextAppState => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        setRedrawKey(prevKey => prevKey + 1);
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [isVisible]);

  // Taslak portföyleri yükle
  const loadDraftPortfolios = useCallback(async () => {
    if (draftsLenRef.current === 0) setLoading(true);
    try {
      const drafts = await AsyncStorage.getItem(DRAFT_STORAGE_KEY);
      if (drafts) {
        const parsedDrafts = JSON.parse(drafts);
        const sortedDrafts = parsedDrafts.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
        setDraftPortfolios(sortedDrafts);
      } else {
        setDraftPortfolios([]);
      }
    } catch (error) {
      console.error('Taslak portföyler yüklenirken hata:', error);
      setDraftPortfolios([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Silme için modal aç
  const promptDeleteDraft = useCallback((draftId) => {
    pendingDeleteIdRef.current = draftId;
    setShowDeleteConfirm(true);
  }, []);

  // Onayı verilen silme işlemi
  const confirmDeleteDraft = useCallback(async () => {
    const draftId = pendingDeleteIdRef.current;
    if (!draftId) {
      setShowDeleteConfirm(false);
      return;
    }
    try {
      setDraftPortfolios(currentDrafts => {
        const updatedDrafts = currentDrafts.filter(draft => draft.id !== draftId);
        AsyncStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(updatedDrafts))
          .catch(e => console.error('Taslak güncellenirken depolama hatası:', e));
        return updatedDrafts;
      });
    } catch (error) {
      console.error('Taslak silinirken hata:', error);
    } finally {
      pendingDeleteIdRef.current = null;
      setShowDeleteConfirm(false);
    }
  }, []);

  const cancelDeleteDraft = useCallback(() => {
    pendingDeleteIdRef.current = null;
    setShowDeleteConfirm(false);
  }, []);

  // Taslaktan devam et
  const continueDraft = useCallback((draft) => {
    onClose(); // Close this overlay
    // Ensure parent MainTabs add modals are also closed
    try { DeviceEventEmitter.emit('mainTabs:closeAddModals'); } catch {}
    setTimeout(() => { // Then navigate
      navigation.navigate('Ana Sayfa', {
        screen: 'AddPortfolio',
        params: {
          previousScreen: 'HomePage',
          draftData: draft,
          isDraftMode: true,
        }
      });
    }, 150); // small delay to finish close animation
  }, [navigation, onClose]);

  // Kapanış animasyonu (Notification overlay ile uyumlu)
  const handleClose = useCallback(() => {
    try {
      Animated.timing(modalAnim, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }).start(() => {
        onClose();
      });
    } catch (e) {
      onClose();
    }
  }, [modalAnim, onClose]);

  // Yardımcı Fonksiyonlar
  const getStepName = (step) => {
    const stepNames = { 1: 'Temel Bilgiler', 2: 'Fiyat ve Kredi', 3: 'Özellikler', 4: 'Konum Bilgileri', 5: 'Resimler', 6: 'Sahip Bilgileri' };
    return stepNames[step] || `Adım ${step}`;
  };

  const getCompletionPercentage = (draft) => {
    const formData = draft?.formData || {};
    const totalFields = 15; let completedFields = 0;
    if (formData.title) completedFields++;
    if (formData.listingStatus) completedFields++;
    if (formData.propertyType) completedFields++;
    if (formData.price) completedFields++;
    if (formData.city) completedFields++;
    if (formData.district) completedFields++;
    // Metre kare/oda/banyo/kat/yapı yaşı alanları farklı isimlerle olabilir; olası anahtarları kontrol et
    if (formData.squareMeters || formData.netSquareMeters) completedFields++;
    if (formData.roomCount || formData.rooms) completedFields++;
    if (formData.bathroomCount) completedFields++;
    if (formData.floor || formData.floorNumber) completedFields++;
    if (formData.buildingAge) completedFields++;
    const coords = formData.coordinates;
    if (coords && coords.latitude && coords.longitude) completedFields++;
    const imagesCount = Array.isArray(draft?.selectedImages) ? draft.selectedImages.length : 0;
    if (imagesCount > 0) completedFields += 2;
    if (formData.ownerName) completedFields++;
    const rawPercent = Math.round((completedFields / totalFields) * 100);
    return Math.min(100, Math.max(0, rawPercent));
  };

  const formatDraftTime = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();

    const pad = (n) => (n < 10 ? `0${n}` : String(n));
    const isSameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);

    const timePart = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
    if (isSameDay(date, now)) {
      return `Bugün ${timePart}`;
    }
    if (isSameDay(date, yesterday)) {
      return `Dün ${timePart}`;
    }
    const day = pad(date.getDate());
    const month = pad(date.getMonth() + 1);
    const year = date.getFullYear();
    return `${day}.${month}.${year} ${timePart}`;
  };
  

  // Gradient Config
  const overlayConfig = {
    overlayColor: 'rgba(224, 220, 220, 0.81)',
    startColor: 'rgb(31, 65, 88)',
    endColor: 'rgb(17, 36, 49)',
    gradientAlpha: 1,
    gradientDirection: 175,
    gradientSpread: 25,
    ditherStrength: 4.0,
  };

  // Açılış animasyonu: Görevler sayfasındaki modal gibi hızlı spring
  useEffect(() => {
    if (isVisible) {
      modalAnim.setValue(0);
      // Önce açılış animasyonunu başlat (UI hızlı tepki versin)
      Animated.spring(modalAnim, {
        toValue: 1,
        tension: 80,
        friction: 7,
        useNativeDriver: true,
      }).start();
      // Heavy iş (JSON parse + sort) animasyondan sonra çalışsın
      InteractionManager.runAfterInteractions(() => {
        loadDraftPortfolios();
      });
    }
  }, [isVisible, modalAnim, loadDraftPortfolios]);

  // Mevcut liste uzunluğunu ref'te tut (loading göstergesi için)
  useEffect(() => {
    draftsLenRef.current = draftPortfolios.length;
  }, [draftPortfolios.length]);

  const renderDraftItem = ({ item }) => {
    const completionPercentage = getCompletionPercentage(item);
    return (
        <View style={styles.draftCard}>
            <View style={styles.draftHeader}>
                <View style={styles.draftInfo}>
                    <Text style={styles.draftTitle}>
                        {item.formData.title || 'Başlıksız Portföy'}
                    </Text>
                    <Text style={styles.draftSubtitle}>
                        {getStepName(item.currentStep)} • Adım {item.currentStep}/6
                    </Text>
                    <Text style={styles.draftTime}>
                        {formatDraftTime(item.leftAt || item.lastModified)}
                    </Text>
                </View>
                <View style={styles.draftActions}>
                    <TouchableOpacity
                        style={styles.deleteButton}
                    onPress={() => promptDeleteDraft(item.id)}
                    >
                        <Image source={require('../assets/images/icons/trash.png')} style={styles.deleteIcon} />
                    </TouchableOpacity>
                </View>
            </View>

            <View style={styles.progressContainer}>
                <View style={styles.progressBar}>
                    <View style={[styles.progressFill, { width: `${completionPercentage}%` }]} />
                </View>
                <Text style={styles.progressText}>%{completionPercentage} tamamlandı</Text>
            </View>

            <View style={styles.draftFooter}>
                <TouchableOpacity
                    style={styles.continueButton}
                    onPress={() => continueDraft(item)}
                >
                    <Text style={styles.continueButtonText}>Devam Et</Text>
                    <Image source={require('../assets/images/icons/return.png')} style={styles.continueIcon} />
                </TouchableOpacity>
            </View>
        </View>
    );
  };


  if (!isVisible) {
    return null;
  }

  return (
    <Modal
      animationType="none"
      transparent={true}
      visible={isVisible}
      statusBarTranslucent={true}
      onRequestClose={onClose}
    >
      <View style={[styles.backdrop, useSharedBackdrop && { backgroundColor: 'transparent' }]}>
        <Animated.View
          style={[
            styles.contentWrapper,
            {
              transform: [
                {
                  scale: modalAnim.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }),
                },
                {
                  translateY: modalAnim.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }),
                },
              ],
              opacity: modalAnim,
            },
          ]}
        >
        <GlassmorphismView
          key={redrawKey}
          style={StyleSheet.absoluteFillObject}
          width={width * 0.9}
          height={height * 0.75}
          borderRadius={16}
          blurEnabled={false}
          config={isDark ? overlayConfig : { ...overlayConfig, startColor: '#FFFFFF', endColor: '#F5F6F8' }}
        />

          <View style={styles.header}>
          <View style={styles.headerTitleRow}>
            <Image source={require('../assets/images/icons/plan.png')} style={styles.headerTitleIcon} />
            <Text style={styles.headerTitle}>Taslak Portföyler</Text>
          </View>
            <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
            <Image source={require('../assets/images/icons/close.png')} style={styles.closeButtonIcon} />
          </TouchableOpacity>
        </View>
        <View style={styles.headerDivider} />

        {loading ? (
          <ActivityIndicator size="large" color={isDark ? '#FFF' : '#000'} style={{ flex: 1 }} />
        ) : draftPortfolios.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>Henüz taslak portföy yok.</Text>
          </View>
        ) : (
          <FlatList
            data={draftPortfolios}
            renderItem={renderDraftItem}
            keyExtractor={(item) => item.id.toString()}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            removeClippedSubviews
          />
        )}
        </Animated.View>
      </View>
      {/* Silme Onay Modali */}
      <Modal
        visible={showDeleteConfirm}
        transparent={true}
        animationType="fade"
        onRequestClose={cancelDeleteDraft}
      >
        <View style={styles.confirmBackdrop}>
          <GlassmorphismView
            style={styles.confirmContent}
            borderRadius={16}
            blurEnabled={false}
            config={isDark ? overlayConfig : { ...overlayConfig, startColor: '#FFFFFF', endColor: '#F5F6F8' }}
          >
            <Text style={styles.confirmTitle}>Taslağı Sil</Text>
            <Text style={styles.confirmMessage}>Bu taslağı silmek istediğinizden emin misiniz?</Text>
            <View style={styles.confirmButtonsRow}>
              <TouchableOpacity style={[styles.confirmBtn, styles.confirmCancel]} onPress={cancelDeleteDraft}>
                <Text style={[styles.confirmBtnText, styles.confirmCancelText]}>Vazgeç</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.confirmBtn, styles.confirmDelete]} onPress={confirmDeleteDraft}>
                <Text style={styles.confirmBtnText}>Evet, Sil</Text>
              </TouchableOpacity>
            </View>
          </GlassmorphismView>
        </View>
      </Modal>
    </Modal>
  );
};

const createStyles = (isDark, theme) => StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    contentWrapper: {
        width: width * 0.9,
        height: height * 0.75,
        borderRadius: 16,
        overflow: 'hidden',
    },
    header: {
        width: '100%',
        paddingVertical: 15,
        paddingHorizontal: 20,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: 'transparent',
    },
    headerDivider: {
        height: 1,
        backgroundColor: 'rgba(255, 255, 255, 0.15)',
        alignSelf: 'stretch',
        marginHorizontal: 10, // listContent padding ile hizalı
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: isDark ? '#FFF' : staticTheme.colors.darkGray,
    },
    headerTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    headerTitleIcon: {
        width: 18,
        height: 18,
        tintColor: 'crimson',
        marginRight: 8,
    },
    closeButton: {
        padding: 6,
        backgroundColor: 'crimson',
        borderRadius: 8,
        width: 28,
        height: 28,
        justifyContent: 'center',
        alignItems: 'center',
    },
    closeButtonIcon: {
        width: 12,
        height: 12,
        tintColor: 'white',
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 20,
    },
    emptyText: {
        fontSize: 16,
        color: isDark ? '#AAA' : '#555',
        textAlign: 'center',
        lineHeight: 24,
    },
    listContent: {
        padding: 10,
        width: width * 0.9,
    },
    draftCard: {
      backgroundColor: theme.colors.inputBg,
      borderRadius: 10,
      marginBottom: 15,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
      overflow: 'hidden',
      width: '100%',
    },
    draftHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      padding: 15,
    },
    draftInfo: {
      flex: 1,
      marginRight: 10,
    },
    draftTitle: {
      fontSize: 17,
      fontWeight: '600',
      color: isDark ? '#EFEFEF' : '#222',
      marginBottom: 4,
    },
    draftSubtitle: {
      fontSize: 14,
      color: isDark ? '#B0C4DE' : '#667',
      marginBottom: 6,
    },
    draftTime: {
      fontSize: 12,
      color: isDark ? '#8899AA' : '#888',
    },
    draftActions: {
      alignItems: 'flex-end',
    },
    deleteButton: {
      padding: 5,
    },
    deleteIcon: {
        width: 20,
        height: 20,
        tintColor: 'crimson',
    },
    progressContainer: {
      paddingHorizontal: 15,
      paddingBottom: 10,
    },
    progressBar: {
      height: 6,
      backgroundColor: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.1)',
      borderRadius: 3,
      overflow: 'hidden',
      marginBottom: 5,
    },
    progressFill: {
      height: '100%',
      backgroundColor: staticTheme.colors.primary,
      borderRadius: 3,
    },
    progressText: {
      fontSize: 12,
      color: isDark ? '#B0C4DE' : '#667',
      textAlign: 'right',
    },
    draftFooter: {
      borderTopWidth: 1,
      borderTopColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
    },
    continueButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
      backgroundColor: 'transparent',
    },
    continueButtonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '600',
      marginRight: 8,
    },
    continueIcon: {
      width: 16,
      height: 16,
      tintColor: staticTheme.colors.primary,
      transform: [{ rotate: '180deg' }], // Icon is return, so rotate it
    },
    confirmBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    confirmContent: {
      width: Math.min(width * 0.82, 360),
      padding: 16,
      borderRadius: 16,
      backgroundColor: 'transparent',
    },
    confirmTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: isDark ? '#FFF' : staticTheme.colors.text,
      textAlign: 'center',
      marginBottom: 8,
    },
    confirmMessage: {
      fontSize: 14,
      color: isDark ? '#DADADA' : '#555',
      textAlign: 'center',
      marginBottom: 14,
    },
    confirmButtonsRow: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 6,
    },
    confirmBtn: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 10,
      alignItems: 'center',
    },
    confirmCancel: {
      backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.07)',
    },
    confirmDelete: {
      backgroundColor: 'crimson',
    },
    confirmBtnText: {
      color: '#FFF',
      fontSize: 15,
      fontWeight: '600',
    },
    confirmCancelText: {
      color: isDark ? '#FFF' : '#222',
    },
});

export default DraftPortfolioOverlay;
