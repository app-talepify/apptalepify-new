// src/screens/Settings.js
// Talepify - Ayarlar Sayfası

import React, { useState, useEffect, useCallback, useMemo, memo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Animated,
  Image,
  Switch,
  SafeAreaView,
  Modal,
  ImageBackground,
  Easing,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { useAuth } from '../context/AuthContext';
import GlassmorphismView from '../components/GlassmorphismView';

const Settings = () => {
  const { theme: currentTheme, isDark, setThemeName } = useTheme();
  const navigation = useNavigation();
  const { signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const [fadeAnim] = useState(new Animated.Value(0));
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);



  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 350,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  const handleLogout = useCallback(async () => {
    Alert.alert(
      'Çıkış Yap',
      'Hesabınızdan çıkış yapmak istediğinizden emin misiniz?',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Çıkış Yap',
          style: 'destructive',
          onPress: async () => {
            try {
              // AuthContext'ten signOut fonksiyonunu çağır
              await signOut();

              // Login sayfasına yönlendir
              navigation.reset({
                index: 0,
                routes: [{ name: 'Login' }],
              });
            } catch (error) {
              if (__DEV__) console.error('Logout error:', error);
              Alert.alert('Hata', 'Çıkış yaparken bir hata oluştu.');
            }
          },
        },
      ],
    );
  }, [navigation, signOut]);

  const handleDeleteAccount = useCallback(() => {
    setDeleteModalVisible(true);
  }, []);

  const handleDeleteConfirm = useCallback(() => {
    setDeleteModalVisible(false);
    navigation.navigate('AccountDeletion');
  }, [navigation]);

  const handleDeleteCancel = useCallback(() => {
    setDeleteModalVisible(false);
  }, []);

  const glassmorphismConfig = useMemo(() => {
    const commonConfig = {
      overlayColor: 'rgba(224, 220, 220, 0.81)',
      gradientAlpha: 1,
      gradientDirection: 150,
      gradientSpread: 7,
      ditherStrength: 4.0,
    };

    if (isDark) {
      return {
        ...commonConfig,
        startColor: 'rgba(17, 36, 49, 1)',
        endColor: 'rgba(17, 36, 49, 0.64)',
      };
    } else {
      // Light mode config can be different if needed
      return {
        ...commonConfig,
        startColor: 'rgba(255, 255, 255, 1)',
        endColor: 'rgba(230, 230, 230, 0.8)',
        overlayColor: 'rgba(0, 0, 0, 0.05)',
      };
    }
  }, [isDark]);



  const renderSettingItem = useCallback(({ icon, title, subtitle, type, value, onPress, onValueChange, isDestructive = false, iconColor }) => (
    <TouchableOpacity
      style={[styles.settingItem]}
      onPress={onPress}
    >
      <View style={styles.settingItemLeft}>
        <Image source={icon} style={[styles.settingIconImage, { tintColor: iconColor || currentTheme.colors.error }]} />
        <View style={styles.settingText}>
          <Text style={[styles.settingTitle, isDestructive && styles.destructiveText]}>
            {title}
          </Text>
          {subtitle && (
            <Text style={[styles.settingSubtitle, isDestructive && styles.destructiveSubtitle]}>
              {subtitle}
            </Text>
          )}
        </View>
      </View>

      <View style={styles.settingItemRight}>
        {type === 'arrow' ? (
          <Image source={require('../assets/images/icons/return.png')} style={[styles.settingArrowImage, { tintColor: currentTheme.colors.error }]} />
        ) : type === 'switch' ? (
          <Switch
            value={!!value}
            onValueChange={onValueChange}
            trackColor={{ false: currentTheme.colors.border, true: currentTheme.colors.accent }}
            thumbColor={currentTheme.colors.white}
          />
        ) : (
          <Text style={[styles.settingValue, isDestructive && styles.destructiveText]}>
            {value}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  ), [styles, currentTheme]);

  const renderSection = useCallback(({ title, items }) => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>
        <GlassmorphismView
          style={styles.glassmorphismContainer}
          borderRadius={currentTheme.borderRadius.lg}
          blurEnabled={false}
          config={glassmorphismConfig}
          borderWidth={1}
          borderColor={currentTheme.colors.border}
        >
          <Animated.View
            style={[
              styles.sectionContent,
              {
                opacity: fadeAnim,
                transform: [
                  {
                    translateY: fadeAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [8, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            {items.map((item, index) => (
              <View key={index}>
                {renderSettingItem(item)}
                {index < items.length - 1 && <View style={styles.separator} />}
              </View>
            ))}
          </Animated.View>
        </GlassmorphismView>
      </View>
    </View>
  ), [styles, renderSettingItem, currentTheme, glassmorphismConfig, fadeAnim]);

  const settingsData = useMemo(() => [
    {
      title: 'Abonelik & Referans',
      items: [
        {
          icon: require('../assets/images/icons/Setting_alt_fill2x.png'),
          title: 'Abonelik Yönetimi',
          subtitle: 'Planınızı görüntüleyin ve yönetin',
          type: 'arrow',
          onPress: () => navigation.navigate('MainTabs', { screen: 'Profil', params: { screen: 'SubscriptionManagement' } }),
        },
        {
          icon: require('../assets/images/icons/order.png'),
          title: 'Referans Sistemi',
          subtitle: 'Referans kodunuzu paylaşın ve kazanç elde edin',
          type: 'arrow',
          onPress: () => navigation.navigate('ReferralSystem'),
        },
      ],
    },
    {
      title: 'Hesap',
      items: [
        {
          icon: require('../assets/images/icons/lock.png'),
          title: 'Şifre Değiştir',
          subtitle: 'Güvenlik için şifrenizi güncelleyin',
          type: 'arrow',
          onPress: () => Alert.alert('Şifre Değiştir', 'Şifre değiştirme özelliği yakında gelecek'),
        },
        {
          icon: require('../assets/images/icons/order.png'),
          title: 'Gizlilik Politikası',
          subtitle: 'Veri kullanımı hakkında bilgi',
          type: 'arrow',
          onPress: () => navigation.navigate('PrivacyPolicy'),
        },
        {
          icon: require('../assets/images/icons/question.png'),
          title: 'Yardım & Destek',
          subtitle: 'Sorularınız için destek alın',
          type: 'arrow',
          onPress: () => navigation.navigate('HelpAndSupport'),
        },
      ],
    },
    {
      title: 'Görünüm',
      items: [
        {
          icon: require('../assets/images/icons/darkmode.png'),
          title: 'Karanlık Mod',
          subtitle: 'Koyu tema kullan',
          type: 'switch',
          value: isDark,
          onValueChange: (v) => setThemeName(v ? 'dark' : 'light'),
        },
      ],
    },
    {
      title: 'Uygulama',
      items: [
        {
          icon: require('../assets/images/icons/save.png'),
          title: 'Otomatik Kaydet',
          subtitle: 'Değişiklikleri otomatik kaydet',
          type: 'arrow',
          onPress: () => Alert.alert('Otomatik Kaydet', 'Otomatik kaydetme özelliği yakında gelecek'),
        },
        {
          icon: require('../assets/images/icons/pinfill.png'),
          title: 'Konum Servisleri',
          subtitle: 'Yakındaki portföyleri göster',
          type: 'arrow',
          onPress: () => Alert.alert('Konum Servisleri', 'Konum servisleri özelliği yakında gelecek'),
        },
        {
          icon: require('../assets/images/icons/appver.png'),
          title: 'Uygulama Versiyonu',
          subtitle: 'v1.0.0',
          type: 'info',
        },
      ],
    },
    {
      title: 'Bildirimler',
      items: [
        {
          icon: require('../assets/images/icons/bell.png'),
          title: 'Push Bildirimleri',
          subtitle: 'Yeni mesaj ve güncellemeler için',
          type: 'arrow',
          onPress: () => Alert.alert('Push Bildirimleri', 'Bildirim ayarları yakında gelecek'),
        },
      ],
    },
    {
      title: 'Tehlikeli Bölge',
      items: [
        {
          icon: require('../assets/images/icons/Logout.png'),
          title: 'Çıkış Yap',
          subtitle: 'Hesabınızdan güvenli çıkış',
          type: 'action',
          onPress: handleLogout,
          iconColor: currentTheme.colors.error,
        },
        {
          icon: require('../assets/images/icons/trash.png'),
          title: 'Hesabı Sil',
          subtitle: 'Hesabınızı kalıcı olarak silin',
          type: 'action',
          onPress: handleDeleteAccount,
          isDestructive: true,
          iconColor: currentTheme.colors.error,
        },
      ],
    },
  ], [handleLogout, handleDeleteAccount, navigation, isDark, setThemeName, currentTheme.colors.error]);

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: 'transparent',
    },
    header: {
      paddingHorizontal: currentTheme.spacing.lg,
      // PortfolioList ile hizalı üst boşluklar
      paddingTop: 12,
      paddingBottom: currentTheme.spacing.lg,
      borderBottomWidth: 0,
      borderBottomColor: currentTheme.colors.border,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: 'transparent',
      marginBottom: currentTheme.spacing.lg,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      width: 40,
    },
    headerCenter: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    headerButtonBack: {
      width: 37,
      height: 37,
      borderRadius: 8,
      backgroundColor: currentTheme.colors.error,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 0,
      // Shadow kaldırıldı - şeffaflık problemini çözmek için
      shadowColor: 'transparent',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0,
      shadowRadius: 0,
      elevation: 0,
    },
    headerButtonIconBack: {
      width: 16,
      height: 16,
      resizeMode: 'contain',
      tintColor: currentTheme.colors.white,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      color: currentTheme.colors.white,
      textAlign: 'center',
    },
    headerSubtitle: {
      marginTop: 4,
      fontSize: 12,
      color: currentTheme.colors.mutedText,
      textAlign: 'center',
    },
    headerRight: {
      width: 40,
      alignItems: 'flex-end',
    },
    content: {
      flex: 1,
      padding: currentTheme.spacing.lg,
      paddingTop: currentTheme.spacing.xxl,
    },
    section: {
      marginBottom: currentTheme.spacing.xl,
    },
    sectionTitle: {
      fontSize: currentTheme.fontSizes.xxl,
      fontWeight: currentTheme.fontWeights.semibold,
      color: isDark ? currentTheme.colors.text : currentTheme.colors.white,
      marginBottom: currentTheme.spacing.md,
      paddingHorizontal: currentTheme.spacing.lg,
    },
    sectionCard: {
      shadowColor: currentTheme.colors.navy,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 0,
      borderRadius: currentTheme.borderRadius.lg,
    },
    backgroundImage: {
      flex: 1,
    },
    glassmorphismContainer: {
      overflow: 'hidden',
      borderRadius: currentTheme.borderRadius.lg,
    },
    sectionContent: {
      backgroundColor: 'transparent',
    },
    settingItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: currentTheme.spacing.lg,
    },
    settingItemLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    settingIconImage: {
      width: 20,
      height: 20,
      marginRight: currentTheme.spacing.md,
    },
    settingText: {
      flex: 1,
    },
    settingTitle: {
      fontSize: currentTheme.fontSizes.xl,
      fontWeight: currentTheme.fontWeights.semibold,
      color: currentTheme.colors.text,
      marginBottom: 2,
    },
    settingSubtitle: {
      fontSize: currentTheme.fontSizes.md,
      color: currentTheme.colors.mutedText,
      opacity: 0.8,
    },
    destructiveText: {
      color: currentTheme.colors.error,
    },
    destructiveSubtitle: {
      color: currentTheme.colors.error + '80',
    },
    settingItemRight: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    settingValue: {
      fontSize: currentTheme.fontSizes.md,
      color: currentTheme.colors.mutedText,
    },
    settingArrowImage: {
      width: 16,
      height: 16,
      transform: [{ rotate: '180deg' }],
    },
    separator: {
      height: 1,
      backgroundColor: currentTheme.colors.border,
      marginHorizontal: currentTheme.spacing.lg,
    },
    sectionSpacer: {
      height: currentTheme.spacing.lg,
    },
    scrollContent: {
      // paddingBottom dinamik olarak inline style'da ayarlanıyor
    },

    // OTP Modal Styles
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    modalContent: {
      backgroundColor: currentTheme.colors.surface,
      borderRadius: currentTheme.spacing.md,
      padding: currentTheme.spacing.xl,
      width: '80%',
      maxWidth: 400,
    },
    modalTitle: {
      fontSize: currentTheme.fontSizes.xl,
      fontWeight: currentTheme.fontWeights.bold,
      color: currentTheme.colors.text,
      textAlign: 'center',
      marginBottom: currentTheme.spacing.lg,
    },
    modalText: {
      fontSize: currentTheme.fontSizes.md,
      color: currentTheme.colors.textSecondary,
      textAlign: 'center',
      marginBottom: currentTheme.spacing.lg,
    },
    modalButtons: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    modalButton: {
      flex: 1,
      padding: currentTheme.spacing.md,
      borderRadius: currentTheme.spacing.sm,
      marginHorizontal: currentTheme.spacing.xs,
    },
    modalButtonCancel: {
      backgroundColor: currentTheme.colors.border,
    },
    modalButtonConfirm: {
      backgroundColor: currentTheme.colors.error,
    },
    modalButtonText: {
      fontSize: currentTheme.fontSizes.md,
      fontWeight: currentTheme.fontWeights.semibold,
      textAlign: 'center',
    },
    modalButtonTextCancel: {
      color: currentTheme.colors.text,
    },
    modalButtonTextConfirm: {
      color: currentTheme.colors.white,
    },
    // Yardım Balonu Stilleri
    helpBubble: {
        position: 'absolute',
        bottom: insets.bottom + 80, // MainTabs yüksekliği için ek pay
        right: 20,
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: currentTheme.colors.accent,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 4,
        },
        shadowOpacity: 0.3,
        shadowRadius: 4.65,
        elevation: 8,
    },
    helpBubbleIcon: {
        width: 30,
        height: 30,
        tintColor: currentTheme.colors.white,
    },
  });

  return (
    <ImageBackground
      source={isDark ? require('../assets/images/dark-bg2.png') : require('../assets/images/light-bg.jpg')}
      style={[styles.backgroundImage, { backgroundColor: isDark ? '#071317' : '#FFFFFF' }]}
    >
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <TouchableOpacity
              style={styles.headerButtonBack}
              onPress={() => navigation.goBack()}
              accessibilityRole="button"
              accessibilityLabel="Geri"
            >
              <Image
                source={require('../assets/images/icons/return.png')}
                style={styles.headerButtonIconBack}
              />
            </TouchableOpacity>
          </View>

          <View style={styles.headerCenter}>
            <View style={{ alignItems: 'center' }}>
              <Text style={styles.headerTitle}>Ayarlar</Text>
              <Text style={styles.headerSubtitle}>Uygulama tercihlerini düzenleyin</Text>
            </View>
          </View>

          <View style={styles.headerRight} />
        </View>

        {/* Content */}
        <ScrollView
          style={styles.content}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 20 }]}
          showsVerticalScrollIndicator={false}
        >
          {settingsData.map((section, index) => (
            <View key={index}>
              {renderSection(section)}
              {index < settingsData.length - 1 && <View style={styles.sectionSpacer} />}
            </View>
          ))}
        </ScrollView>

        {/* Delete Account Modal */}
        <Modal
          animationType="fade"
          transparent={true}
          visible={deleteModalVisible}
          onRequestClose={handleDeleteCancel}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Hesabı Sil</Text>
              <Text style={styles.modalText}>
                Hesabınızı ve tüm verilerinizi kalıcı olarak silmek istediğinizden emin misiniz?
              </Text>
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonCancel]}
                  onPress={handleDeleteCancel}
                >
                  <Text style={[styles.modalButtonText, styles.modalButtonTextCancel]}>
                    İptal
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonConfirm]}
                  onPress={handleDeleteConfirm}
                >
                  <Text style={[styles.modalButtonText, styles.modalButtonTextConfirm]}>
                    Devam Et
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>

      {/* Yardım Balonu */}
      <TouchableOpacity
        style={styles.helpBubble}
        onPress={() => navigation.navigate('HelpAndSupport')}
        accessibilityRole="button"
        accessibilityLabel="Yardım ve Destek"
      >
        <Image
          source={require('../assets/images/icons/question.png')}
          style={styles.helpBubbleIcon}
        />
      </TouchableOpacity>
    </ImageBackground>
  );
};

export default memo(Settings);