import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  FlatList,
  Image,
  ActivityIndicator,
  Alert,
  Platform,
  AppState,
  Animated,
} from 'react-native';
import * as Animatable from 'react-native-animatable';
import { useTheme } from '../theme/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '@react-navigation/native';
import notifX from '../services/notifications/NotificationService';
import { NOTIF_ENABLED } from '@env';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';
import GlassmorphismView from './GlassmorphismView';
import { handleNotificationAction } from '../services/permissionNotificationHandlers';
import { useBackdrop } from '../context/BackdropContext';

const { width, height } = Dimensions.get('window');

const NotificationOverlay = ({ isVisible, onClose }) => {
  const { theme: currentTheme, isDark } = useTheme();
  const styles = createStyles(isDark, currentTheme);
  const { user, setUnreadCount } = useAuth();
  const navigation = useNavigation();
  const { showBackdrop, hideBackdrop } = useBackdrop();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const modalAnim = useRef(new Animated.Value(0)).current;
  const appState = useRef(AppState.currentState);
  const [redrawKey, setRedrawKey] = useState(0);

  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successModalData, setSuccessModalData] = useState({ title: '', message: '', shareUrl: '' });
  const [isDeleteModalVisible, setDeleteModalVisible] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);


  const getNotificationIcon = (type) => {
    switch (type) {
      case 'request':
        return require('../assets/images/icons/talep.png');
      case 'portfolio':
        return require('../assets/images/icons/portfoy.png');
      case 'subscription':
      case 'subscription_warning':
      case 'subscription_ended':
        return require('../assets/images/icons/plan.png');
      default:
        return require('../assets/images/icons/bell.png');
    }
  };

  const notificationOverlayConfig = {
    overlayColor: 'rgba(224, 220, 220, 0.81)',
    startColor: 'rgb(26, 56, 77)',
    endColor: 'rgb(17, 36, 49)',
    gradientAlpha: 1,
    gradientDirection: 175,
    gradientSpread: 25,
    ditherStrength: 4.0,
  };

  useEffect(() => {
    if (!isVisible) return;

    const subscription = AppState.addEventListener('change', nextAppState => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        // Force re-render of the GlassmorphismView by changing its key
        setRedrawKey(prevKey => prevKey + 1);
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [isVisible]);

  // Açılış animasyonu (Draft overlay ile uyumlu)
  useEffect(() => {
    if (isVisible) {
      modalAnim.setValue(0);
      Animated.spring(modalAnim, {
        toValue: 1,
        tension: 80,
        friction: 7,
        useNativeDriver: true,
      }).start();
      try {
        const color = isDark ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.22)';
        showBackdrop({ toOpacity: 1, color, duration: 150 });
      } catch {}
    }
  }, [isVisible, modalAnim]);

  const loadNotifications = useCallback(async () => {
    if (!user?.uid) {
      console.log('📱 Notifications: User UID yok, yükleme iptal edildi.');
      setNotifications([]);
      return;
    }
    setLoading(true);
    try {
      const userNotificationsKey = `notifications_${user.uid}`;
      const storedNotifications = await AsyncStorage.getItem(userNotificationsKey);
      let parsedNotifications = storedNotifications ? JSON.parse(storedNotifications) : [];

      const remoteList =
        NOTIF_ENABLED && NOTIF_ENABLED !== 'false'
          ? await notifX.getUserNotifications(user.uid)
          : [];

      if ((!remoteList || remoteList.length === 0) && parsedNotifications.length > 0) {
        console.log('📱 Notifications: Remote boş, local kullanılıyor.');
        const sorted = parsedNotifications.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        setNotifications(sorted);
      } else {
        const normalized = (remoteList || []).map((n) => ({
          id: n.id,
          type: n.data?.type || n.type || 'permission_request',
          title: n.title || n.data?.title || 'Bildirim',
          message: n.body || n.message || '',
          timestamp: n.createdAt ? new Date(n.createdAt).getTime() : Date.now(),
          isRead: !!n.isRead,
          data: n.data || {},
          userId: user.uid,
        }));
        
        await AsyncStorage.setItem(userNotificationsKey, JSON.stringify(normalized));
        const sorted = normalized.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        setNotifications(sorted);
      }

      DeviceEventEmitter.emit('notifications:updated');
    } catch (error) {
      console.error('Bildirimler yüklenirken hata:', error);
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, [user?.uid]);

  const markAsRead = useCallback(async (notificationId) => {
    if (!user?.uid) return;
    try {
      const updatedNotifications = notifications.map(n =>
        n.id === notificationId ? { ...n, isRead: true } : n
      );
      setNotifications(updatedNotifications);
      await AsyncStorage.setItem(`notifications_${user.uid}`, JSON.stringify(updatedNotifications));
      DeviceEventEmitter.emit('notifications:updated');
      await notifX.markAsRead(notificationId);
    } catch (error) {
      console.error('Bildirim okundu işaretlenirken hata:', error);
    }
  }, [notifications, user?.uid]);

  const markAllAsRead = async () => {
    try {
      const updatedNotifications = notifications.map(n => ({ ...n, isRead: true }));
      setNotifications(updatedNotifications);
      await notifX.markAllAsRead(user.uid);
      DeviceEventEmitter.emit('notifications:updated');
    } catch (error) {
      console.error('Failed to mark all as read:', error);
      Alert.alert('Hata', 'Bildirimler okunmuş olarak işaretlenemedi.');
    }
  };

  const deleteAllNotifications = async () => {
    setDeleteModalVisible(true);
  };

  const handleConfirmDeleteAll = async () => {
    if (isDeletingAll) return;
    try {
      setIsDeletingAll(true);
      if (user?.uid) {
        await notifX.deleteAll(user.uid);
        await AsyncStorage.removeItem(`notifications_${user.uid}`);
      }
      setNotifications([]);
      setUnreadCount(0);
      DeviceEventEmitter.emit('notifications:updated');
    } catch (error) {
      Alert.alert('Hata', 'Bildirimler silinemedi.');
    } finally {
      setIsDeletingAll(false);
      setDeleteModalVisible(false);
    }
  };

  const handlePermissionAction = useCallback(async (action, data) => {
    try {
      const result = await handleNotificationAction(action, data, user.uid);
      if (result?.success) {
        if (result.action === 'navigate' && result.screen) {
          // Smooth close: animate overlay out, fade backdrop, then navigate
          try {
            await new Promise((resolve) => {
              try {
                Animated.timing(modalAnim, { toValue: 0, duration: 140, useNativeDriver: true }).start(() => resolve());
              } catch { resolve(); }
            });
            try { hideBackdrop({ duration: 120 }); } catch {}
            onClose && onClose();
            setTimeout(() => {
              try { navigation.navigate(result.screen, result.params || {}); } catch {}
            }, 30);
            return;
          } catch (_) {}
        }
        loadNotifications();
        if (result.message) {
          Alert.alert('Bilgi', result.message);
        }
      } else {
        Alert.alert('Hata', result?.message || 'İşlem başarısız oldu.');
      }
    } catch(e) {
      Alert.alert('Hata', 'İşlem sırasında bir hata oluştu.');
    }
  }, [user?.uid, loadNotifications, navigation, onClose]);


  const handleItemPress = (item) => {
    if (!item.isRead) {
      markAsRead(item.id);
    }
    
    const { type, data } = item;
    const itemId = data?.portfolioId || data?.requestId || data?.link;

    if (data?.action_buttons) {
        // This is a permission request, do nothing on simple press
        // actions are handled by dedicated buttons
        return;
    }

    if (type === 'portfolio' && itemId) {
        onClose();
        navigation.navigate('Ana Sayfa', { screen: 'PropertyDetail', params: { portfolioId: itemId } });
    } else if (type === 'request' && itemId) {
        onClose();
        navigation.navigate('Taleplerim', { screen: 'RequestDetail', params: { requestId: itemId } });
    }
  };
  
  const handleClose = () => {
    try {
      // Hide global backdrop immediately for snappy close
      try { hideBackdrop({ duration: 50 }); } catch {}
      Animated.timing(modalAnim, {
        toValue: 0,
        duration: 100,
        useNativeDriver: true,
      }).start(() => { onClose(); });
    } catch (e) {
      try { hideBackdrop({ duration: 50 }); } catch {}
      onClose();
    }
  };

  // Overlay görünür olduğunda bildirimleri yükle
  useEffect(() => {
    if (isVisible) {
      loadNotifications();
    }
  }, [isVisible, loadNotifications]);

  const renderNotification = useCallback(({ item }) => (
    <TouchableOpacity onPress={() => handleItemPress(item)} style={styles.notificationTouchable}>
      <View style={[
        styles.notificationItem(isDark),
        !item.isRead && styles.unreadNotification(isDark),
      ]}>
        <View style={{flexDirection: 'row', alignItems: 'center'}}>
            <Image source={getNotificationIcon(item.type)} style={styles.notificationIcon} />
            <View style={{flex: 1}}>
                <Text style={styles.notificationTitle(isDark)}>{item.title}</Text>
                <Text style={styles.notificationMessage(isDark)}>{item.message}</Text>
            </View>
        </View>
        
        {item.data?.action_buttons && (
            <View style={styles.permissionActions}>
              {JSON.parse(item.data.action_buttons).map((button) => (
                <TouchableOpacity
                  key={button.id}
                  style={[
                    styles.permissionButton,
                    button.id === 'approve' && styles.approveButton,
                    button.id === 'reject' && styles.rejectButton,
                  ]}
                  onPress={() => handlePermissionAction(button.action, item.data)}
                >
                  <Text style={[
                    styles.permissionButtonText(isDark),
                    button.id === 'approve' && styles.approveButtonText,
                  ]}>
                    {button.title}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

        <Text style={styles.notificationTime(isDark)}>{new Date(item.timestamp).toLocaleString('tr-TR')}</Text>
      </View>
    </TouchableOpacity>
  ), [isDark, handleItemPress, handlePermissionAction]);

  const renderEmptyState = useCallback(() => (
    <View style={styles.emptyState}>
        <Image source={require('../assets/images/icons/bell.png')} style={styles.emptyStateIcon(isDark)} />
      <Text style={styles.emptyStateTitle(isDark)}>Henüz Bildirim Yok</Text>
      <Text style={styles.emptyStateMessage(isDark)}>
        Yeni bildirimler geldiğinde burada görünecek
      </Text>
    </View>
  ), [isDark]);

  return (
    <Modal
      animationType="none"
      transparent={true}
      visible={isVisible}
      onRequestClose={handleClose}
    >
      <TouchableOpacity style={styles.overlayContainer} activeOpacity={1} onPressOut={handleClose}>
        <Animated.View
          style={[
            styles.overlayContent,
            {
              transform: [
                { scale: modalAnim.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) },
                { translateY: modalAnim.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) },
              ],
              opacity: modalAnim,
            },
          ]}
          onStartShouldSetResponder={() => true}
        >
          <GlassmorphismView
             key={redrawKey}
             style={StyleSheet.absoluteFillObject}
             width={width * 0.9}
             height={height * 0.75}
             borderRadius={16}
             blurEnabled={false}
             config={isDark ? notificationOverlayConfig : {
                ...notificationOverlayConfig,
                startColor: '#FFFFFF',
                endColor: '#F5F6F8'
             }}
          />
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <Image source={require('../assets/images/icons/bell.png')} style={styles.headerTitleIcon} />
              <Text style={styles.overlayTitle(isDark)}>Bildirimler</Text>
            </View>
            <View style={styles.headerActions}>
                <TouchableOpacity onPress={markAllAsRead} style={styles.headerButton(isDark)}>
                    <Text style={styles.headerButtonText(isDark)}>Tümünü Oku</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={deleteAllNotifications} style={[styles.headerButton(isDark), styles.deleteButton]}>
                    <Text style={[styles.headerButtonText(isDark), {color: 'white'}]}>Tümünü Sil</Text>
                </TouchableOpacity>
            </View>
          </View>
          <View style={styles.headerDivider} />
          <View style={styles.headerRightClose}>
            <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
              <Image source={require('../assets/images/icons/close.png')} style={styles.closeButtonIcon} />
            </TouchableOpacity>
          </View>
          
          {loading ? (
            <ActivityIndicator size="large" color={isDark ? 'white' : 'crimson'} style={{flex: 1}} />
          ) : (
            <FlatList
              data={notifications}
              renderItem={renderNotification}
              keyExtractor={(item) => item.id}
              style={styles.notificationsList}
              ListEmptyComponent={renderEmptyState}
              contentContainerStyle={notifications.length === 0 ? styles.emptyListContainer : {paddingBottom: 60}}
            />
          )}
        </Animated.View>
      </TouchableOpacity>
      {isDeleteModalVisible && (
        <Modal
          animationType="fade"
          transparent={true}
          visible={isDeleteModalVisible}
          onRequestClose={() => setDeleteModalVisible(false)}
        >
          <View style={modalStyles.modalOverlay}>
            <Animatable.View animation="zoomIn" duration={300}>
              <GlassmorphismView
                style={modalStyles.modalContainer}
                borderRadius={20}
                config={modalCardConfig}
                blurEnabled={false}
              >
                <Text style={modalStyles.modalTitle}>Onay</Text>
                <Text style={modalStyles.modalTaskText}>
                  Tüm bildirimleri silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.
                </Text>
                <View style={modalStyles.modalButtonContainer}>
                  <TouchableOpacity
                    style={[modalStyles.modalButton, modalStyles.cancelButton, isDeletingAll ? { opacity: 0.6 } : null]}
                    onPress={() => { if (!isDeletingAll) setDeleteModalVisible(false); }}
                    disabled={isDeletingAll}
                  >
                    <Text style={[modalStyles.modalButtonText, { color: currentTheme.colors.white }]}>
                      {isDeletingAll ? 'Bekleyin…' : 'İptal'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[modalStyles.modalButton, modalStyles.confirmButton, isDeletingAll ? { opacity: 0.6 } : null]}
                    onPress={handleConfirmDeleteAll}
                    disabled={isDeletingAll}
                  >
                    {isDeletingAll ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={modalStyles.modalButtonText}>Sil</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </GlassmorphismView>
            </Animatable.View>
          </View>
        </Modal>
      )}
      {showSuccessModal && (
        <Modal
          animationType="fade"
          transparent={true}
          visible={showSuccessModal}
          onRequestClose={() => setShowSuccessModal(false)}
        >
          <View style={modalStyles.modalOverlay}>
            <Animatable.View animation="zoomIn" duration={300}>
              <GlassmorphismView
                style={modalStyles.modalContainer}
                borderRadius={20}
                config={modalCardConfig}
                blurEnabled={false}
              >
                <Text style={modalStyles.modalTitle}>Başarılı</Text>
                <Text style={modalStyles.modalTaskText}>
                  {successModalData.message}
                </Text>
                <View style={modalStyles.modalButtonContainer}>
                  <TouchableOpacity
                    style={[modalStyles.modalButton, modalStyles.confirmButton]}
                    onPress={() => setShowSuccessModal(false)}
                  >
                    <Text style={modalStyles.modalButtonText}>Tamam</Text>
                  </TouchableOpacity>
                </View>
              </GlassmorphismView>
            </Animatable.View>
          </View>
        </Modal>
      )}
    </Modal>
  );
};

const createStyles = (isDark, currentTheme) => StyleSheet.create({
  overlayContainer: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlayContent: {
    width: width * 0.9,
    height: height * 0.75,
    borderRadius: 16,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 20,
    paddingRight: 60, // Kapatma butonu için sağda boşluk
  },
  headerDivider: {
    height: 1,
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
    alignSelf: 'stretch',
    marginHorizontal: 10,
    marginBottom: 5,
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
  headerSide: {
      flex: 1,
      flexDirection: 'row',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    // This will be pushed to the right by space-between
  },
  headerButton: (isDark) => ({
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 15,
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
    marginLeft: 8,
  }),
  deleteButton: {
    backgroundColor: 'crimson',
  },
  headerButtonText: (isDark) => ({
    fontSize: 12,
    color: isDark ? '#ddd' : '#333',
    fontWeight: '700'
  }),
  overlayTitle: (isDark) => ({
    fontSize: 22,
    fontWeight: 'bold',
    color: isDark ? 'white' : '#1a202c',
    // No longer centered
  }),
  headerRightClose: {
    position: 'absolute',
    right: 20,
    top: 15,
  },
  closeButton: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'crimson',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonIcon: {
      width: 12,
      height: 12,
      tintColor: 'white'
  },
  closeButtonText: (isDark) => ({
    fontSize: 16,
    color: isDark ? 'white' : 'crimson',
    fontWeight: 'bold',
  }),
  notificationsList: {
    width: '100%',
  },
  notificationTouchable: {
    // This wrapper ensures the whole item is clickable
  },
  notificationItem: (isDark) => ({
    padding: 15,
    alignSelf: 'center',
    width: '92%',
    marginVertical: 6,
    borderRadius: 10,
    backgroundColor: currentTheme.colors.inputBg,
  }),
  unreadNotification: (isDark) => ({
    backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(220,20,60,0.05)',
    borderLeftWidth: 3,
    borderLeftColor: 'crimson'
  }),
  notificationIcon: {
    width: 24,
    height: 24,
    marginRight: 12,
    tintColor: 'crimson',
  },
  notificationTitle: (isDark) => ({
    fontSize: 16,
    fontWeight: 'bold',
    color: isDark ? 'white' : 'black',
    marginBottom: 4,
  }),
  notificationMessage: (isDark) => ({
    fontSize: 14,
    color: isDark ? '#ccc' : '#555',
    marginTop: 5,
  }),
  notificationTime: (isDark) => ({
    fontSize: 12,
    color: isDark ? '#888' : '#999',
    marginTop: 8,
    textAlign: 'right',
  }),
  permissionActions: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 10,
  },
  permissionButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)'
  },
  approveButton: {
    backgroundColor: '#28a745',
    borderColor: '#28a745',
  },
  rejectButton: {
    backgroundColor: '#dc3545',
    borderColor: '#dc3545',
  },
  permissionButtonText: (isDark) => ({
    color: isDark ? 'white' : '#212529',
    fontWeight: '600'
  }),
  approveButtonText: {
      color: 'white',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: height * 0.2,
  },
  emptyStateIcon: (isDark) => ({
      width: 60,
      height: 60,
      tintColor: isDark ? '#555' : '#ccc',
      marginBottom: 20,
  }),
  emptyStateTitle: (isDark) => ({
    fontSize: 18,
    fontWeight: 'bold',
    color: isDark ? '#777' : '#aaa',
  }),
  emptyStateMessage: (isDark) => ({
    fontSize: 14,
    color: isDark ? '#555' : '#ccc',
    marginTop: 10,
    textAlign: 'center',
    paddingHorizontal: 20,
  }),
  emptyListContainer: {
      flexGrow: 1,
      justifyContent: 'center',
      alignItems: 'center'
  }
});

const modalCardConfig = {
    overlayColor: 'rgba(255, 0, 0, 0)',
    startColor: 'rgb(24, 54, 73)',
    endColor: 'rgba(17, 36, 49, 0.79)',
    gradientAlpha: 1,
    gradientDirection: 150,
    gradientSpread: 7,
    ditherStrength: 4.0,
};

const modalStyles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  modalContainer: {
    width: '85%',
    padding: 24,
    alignItems: 'center',
    overflow: 'hidden',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: 'white', // This will be replaced by currentTheme.colors.white
    marginBottom: 16,
  },
  modalTaskText: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 24,
  },
  modalButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 10,
  },
  modalButton: {
    paddingVertical: 12,
    borderRadius: 12,
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 8,
  },
  cancelButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  confirmButton: {
    backgroundColor: 'crimson', // This will be replaced by theme.colors.error
  },
  modalButtonText: {
    color: 'white', // This will be replaced by theme.colors.white
    fontSize: 16,
    fontWeight: 'bold',
  },
});

const successModalStyles = StyleSheet.create({
    successModalBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 20,
    },
    successModalContent: {
        width: '100%',
        maxWidth: 340,
        padding: 25,
        borderRadius: 20,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 15,
        elevation: 10,
    },
    successModalIconContainer: {
        marginBottom: 15,
    },
    successModalIcon: {
        fontSize: 40,
    },
    successModalTitle: {
        fontSize: 20,
        fontWeight: '700',
        marginBottom: 12,
        textAlign: 'center',
    },
    successModalMessage: {
        fontSize: 15,
        lineHeight: 22,
        textAlign: 'center',
        marginBottom: 18,
    },
    successModalUrlContainer: {
        padding: 12,
        borderRadius: 10,
        borderWidth: 1,
        marginBottom: 20,
        width: '100%',
    },
    successModalUrlText: {
        fontSize: 13,
        lineHeight: 18,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    successModalButtons: {
        flexDirection: 'row',
        gap: 10,
        width: '100%',
    },
    successModalButton: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 10,
        alignItems: 'center',
    },
    successModalButtonText: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '600',
    },
    successModalSecondaryButton: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 10,
        alignItems: 'center',
        borderWidth: 1,
    },
    successModalSecondaryButtonText: {
        fontSize: 15,
        fontWeight: '600',
    },
});

export default NotificationOverlay;
